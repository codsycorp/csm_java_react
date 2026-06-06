use std::sync::Arc;

use serde_json::{json, Map, Value};
use tracing::info;
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse, User};
use crate::security::jwt::JwtUtil;
use crate::services::user::UserService;
use crate::util::PermissionBitfieldUtil;

pub struct AuthHandler {
    record_manager: Arc<RecordManager>,
    user_service: Arc<UserService>,
    jwt: Arc<JwtUtil>,
}

impl AuthHandler {
    pub fn new(
        record_manager: Arc<RecordManager>,
        user_service: Arc<UserService>,
        jwt: Arc<JwtUtil>,
    ) -> Self {
        Self {
            record_manager,
            user_service,
            jwt,
        }
    }

    pub fn handle_login(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut response = StandardResponse::new();
        let login_id = params
            .get("email")
            .or_else(|| params.get("username"))
            .or_else(|| params.get("phone"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let password = params.get("password").and_then(|v| v.as_str()).unwrap_or("");

        if login_id.is_empty() || password.is_empty() {
            response.set("code", 400);
            response.set("success", false);
            response.set(
                "message",
                "Vui lòng cung cấp Email, Tên đăng nhập hoặc Số điện thoại và Mật khẩu.",
            );
            return response;
        }

        let Some(mut user) = self
            .user_service
            .find_by_login_and_password(login_id, password)
        else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Sai thông tin đăng nhập.");
            return response;
        };

        let is_dev = self.resolve_dev_flag(&user);
        user.dev = Some(is_dev);
        let next_version = user.login_version.unwrap_or(0) + 1;
        let refresh_token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
        let ip = params
            .get("_client_ip")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ua = params
            .get("_user_agent")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let expiry = chrono::Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;

        self.user_service.update_session_token(
            &user,
            &refresh_token,
            ip,
            ua,
            expiry,
            next_version,
        );

        let token_subject = user
            .app_token
            .clone()
            .filter(|t| !t.is_empty())
            .or_else(|| user.id.clone())
            .unwrap_or_default();
        let jwt_token = self.jwt.generate_token_with_uid(
            &token_subject,
            user.id.as_deref().unwrap_or(""),
            next_version,
        );

        let mut result = user.to_info_map();
        result.insert("token".into(), Value::String(jwt_token));
        result.insert("refreshToken".into(), Value::String(refresh_token.clone()));
        let csrf = Uuid::new_v4().to_string();
        result.insert("csrfToken".into(), Value::String(csrf.clone()));

        self.enrich_async_routes(&user, &mut result);

        response.set("code", 200);
        response.set("success", true);
        response.set("message", "ok");
        response.set("result", Value::Object(result));

        let cookie_refresh = format!(
            "refreshToken={refresh_token}; Path=/; HttpOnly; Max-Age={}; SameSite=Lax",
            7 * 24 * 60 * 60
        );
        let cookie_csrf = format!("CSRF-TOKEN={csrf}; Path=/; SameSite=Lax");
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            cookie_refresh.parse().unwrap(),
        );
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            cookie_csrf.parse().unwrap(),
        );

        info!("[LOGIN] User authenticated: {:?}", user.username);
        response
    }

    pub fn handle_user_info(&self, auth_user: Option<&crate::security::AuthUser>) -> StandardResponse {
        let mut response = StandardResponse::new();
        let Some(auth) = auth_user else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Not authenticated");
            return response;
        };

        let user = self
            .user_service
            .find_by_id(&auth.user_id)
            .or_else(|| self.user_service.find_by_app_token(&auth.app_token));
        if let Some(user) = user {
            let mut info = user.to_info_map();
            self.enrich_bitfield(&user, &mut info);
            response.set("code", 200);
            response.set("success", true);
            response.set("message", "ok");
            response.set("result", Value::Object(info));
        } else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "User not found");
        }
        response
    }

    pub fn handle_logout(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut response = StandardResponse::new();
        if let Some(token) = params.get("refreshToken").and_then(|v| v.as_str()) {
            if let Some(user) = self.user_service.find_by_refresh_token(token) {
                self.user_service.update_by_id(
                    user.id.as_deref().unwrap_or(""),
                    &Map::from_iter([
                        ("refresh_token".into(), Value::String(String::new())),
                        ("refresh".into(), Value::String(String::new())),
                    ]),
                );
            }
        }
        response.set("code", 200);
        response.set("success", true);
        response.set("message", "Logged out");
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            "refreshToken=; Path=/; Max-Age=0; HttpOnly".parse().unwrap(),
        );
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            "CSRF-TOKEN=; Path=/; Max-Age=0".parse().unwrap(),
        );
        response
    }

    pub fn handle_refresh_token(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut response = StandardResponse::new();
        let refresh = params
            .get("refreshToken")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if refresh.is_empty() {
            response.set("code", 400);
            response.set("success", false);
            response.set("message", "Missing refresh token");
            return response;
        }

        let Some(user) = self.user_service.find_by_refresh_token(refresh) else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Invalid refresh token");
            return response;
        };

        let version = user.login_version.unwrap_or(0);
        let new_refresh = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
        let ip = params
            .get("_client_ip")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ua = params
            .get("_user_agent")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let expiry = chrono::Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;
        self.user_service
            .update_session_token(&user, &new_refresh, ip, ua, expiry, version);

        let token_subject = user
            .app_token
            .clone()
            .filter(|t| !t.is_empty())
            .or_else(|| user.id.clone())
            .unwrap_or_default();
        let jwt_token = self.jwt.generate_token_with_uid(
            &token_subject,
            user.id.as_deref().unwrap_or(""),
            version,
        );
        let csrf = Uuid::new_v4().to_string();

        response.set("code", 200);
        response.set("success", true);
        response.set(
            "result",
            json!({
                "token": jwt_token,
                "refreshToken": new_refresh,
                "csrfToken": csrf,
                "app_token": user.app_token
            }),
        );

        let cookie_refresh = format!(
            "refreshToken={new_refresh}; Path=/; HttpOnly; Max-Age={}; SameSite=Lax",
            7 * 24 * 60 * 60
        );
        let cookie_csrf = format!("CSRF-TOKEN={csrf}; Path=/; SameSite=Lax");
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            cookie_refresh.parse().unwrap(),
        );
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            cookie_csrf.parse().unwrap(),
        );
        response
    }

    pub fn handle_register(&self, _params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        r.set("code", 501);
        r.set("success", false);
        r.set("message", "Register: port UserService.registerUser from Java");
        r
    }

    pub fn handle_get_async_routes(&self, auth_user: Option<&crate::security::AuthUser>) -> StandardResponse {
        let mut response = StandardResponse::new();
        let filter = SearchFilter::eq("id", "accessRights");
        let index = self.record_manager.find("csm", "index", &filter);
        let routes = index.get("data").cloned().unwrap_or(json!([]));
        response.set("code", 200);
        response.set("success", true);
        response.set("result", routes);
        let _ = auth_user;
        response
    }

    fn resolve_dev_flag(&self, user: &User) -> bool {
        if let Some(token) = &user.app_token {
            if let Ok(decrypted) = self.record_manager.csm_decrypt(token) {
                if let Some(last) = decrypted.split("_____").last() {
                    if let Ok(n) = last.parse::<i32>() {
                        return n > 0;
                    }
                }
            }
        }
        false
    }

    fn enrich_async_routes(&self, user: &User, result: &mut Map<String, Value>) {
        let filter = SearchFilter::eq("id", "accessRights");
        let index = self.record_manager.find("csm", "index", &filter);
        if let Some(routes) = index.get("data") {
            result.insert("asyncRoutes".into(), routes.clone());
        }
        self.enrich_bitfield(user, result);
    }

    fn enrich_bitfield(&self, user: &User, info: &mut Map<String, Value>) {
        let perms = user.permissions.clone().unwrap_or_default();
        let menus = user.menus_permissions.clone().unwrap_or_default();
        let bitfield = PermissionBitfieldUtil::build_bitfield(&perms, &menus, user.dev.unwrap_or(false));
        info.insert(
            "permissionBitfield".into(),
            Value::String(PermissionBitfieldUtil::to_compact_token(bitfield)),
        );
        info.insert(
            "permissionSchemaVersion".into(),
            Value::String(PermissionBitfieldUtil::SCHEMA_V3.into()),
        );
        info.insert(
            "dataScope".into(),
            Value::String(PermissionBitfieldUtil::resolve_data_scope(bitfield)),
        );
    }
}
