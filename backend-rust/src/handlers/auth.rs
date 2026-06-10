use std::sync::Arc;

use serde_json::{json, Map, Value};
use tracing::{info, warn};
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse, User};
use crate::security::client_session::{
    normalize_client_ip, normalize_user_agent, refresh_session_valid,
};
use crate::security::jwt::JwtUtil;
use crate::services::user::UserService;
use crate::util::{app_id_from_token, PermissionBitfieldUtil};

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

        if let Some(app_token) = user.app_token.clone().filter(|t| !t.is_empty()) {
            if let Some(canonical) = self.user_service.find_by_app_token(&app_token) {
                user = canonical;
            }
        }

        let is_sub_user = user.is_sub_user.unwrap_or(false)
            || self
                .parse_app_token_meta(user.app_token.as_deref())
                .2;
        let is_dev = if is_sub_user {
            false
        } else {
            self.resolve_dev_flag(&user)
        };
        user.dev = Some(is_dev);
        apply_app_id_from_token(&self.record_manager, &mut user);

        let next_version = user.login_version.unwrap_or(0) + 1;
        let refresh_token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
        let ip = params
            .get("_client_ip")
            .and_then(|v| v.as_str())
            .map(normalize_client_ip)
            .unwrap_or_default();
        let ua = params
            .get("_user_agent")
            .and_then(|v| v.as_str())
            .map(normalize_user_agent)
            .unwrap_or_default();
        let expiry = chrono::Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;

        self.user_service.update_session_token(
            &user,
            &refresh_token,
            &ip,
            &ua,
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

        let mut result = Map::new();
        result.insert("token".into(), Value::String(jwt_token));
        if let Some(app_token) = user.app_token.as_ref().filter(|s| !s.is_empty()) {
            result.insert("app_token".into(), Value::String(app_token.clone()));
        }
        if let Some(app_id) = user.app_id.as_ref().filter(|s| !s.is_empty()) {
            result.insert("app_id".into(), Value::String(app_id.clone()));
        }
        result.insert("refreshToken".into(), Value::String(refresh_token.clone()));
        if let Some(id) = user.id.as_ref() {
            result.insert("userId".into(), Value::String(id.clone()));
        }
        if let Some(username) = user.username.as_ref() {
            result.insert("username".into(), Value::String(username.clone()));
        }
        if let Some(email) = user.email.as_ref() {
            result.insert("email".into(), Value::String(email.clone()));
        }
        if let Some(phone) = user.phone_number.as_ref() {
            result.insert("phoneNumber".into(), Value::String(phone.clone()));
        }
        if let Some(full_name) = user.full_name.as_ref() {
            result.insert("full_name".into(), Value::String(full_name.clone()));
        }
        if let Some(avatar) = user.avatar.as_ref() {
            result.insert("avatar".into(), Value::String(avatar.clone()));
        }
        if let Some(addr) = user.user_address.clone() {
            result.insert("user_address".into(), addr.clone());
            result.insert("user_adress".into(), addr);
        }
        let csrf = Uuid::new_v4().to_string();
        result.insert("csrfToken".into(), Value::String(csrf.clone()));

        self.enrich_account_meta(&user, &mut result);
        self.enrich_async_routes(&user, &mut result);
        result.insert("dev".into(), Value::Bool(is_dev));

        response.set("code", 200);
        response.set("success", true);
        response.set("message", "ok");
        response.set("result", Value::Object(result));

        // Build cookie attributes similar to Java AuthHandler
        let host = params.get("_host").and_then(|v| v.as_str()).unwrap_or("");
        let origin = params.get("_origin").and_then(|v| v.as_str()).unwrap_or("");
        let referer = params.get("_referer").and_then(|v| v.as_str()).unwrap_or("");
        let ua = params.get("_user_agent").and_then(|v| v.as_str()).unwrap_or("");

        let mut is_localhost = host == "localhost" || host == "127.0.0.1" || origin.contains("localhost") || origin.contains("127.0.0.1") || referer.contains("localhost") || referer.contains("127.0.0.1");
        let ua_lc = ua.to_lowercase();
        let is_node_webkit = ua_lc.contains("nwjs") || ua_lc.contains("node-webkit");
        if is_node_webkit {
            let origin_l = origin.to_lowercase();
            let referer_l = referer.to_lowercase();
            let is_file_like = origin_l == "null" || origin_l.starts_with("file://") || origin_l.starts_with("app://") || referer_l == "null" || referer_l.starts_with("file://") || referer_l.starts_with("app://");
            if is_file_like || is_localhost {
                is_localhost = true;
            }
        }

        // determine cross-site by comparing origin host vs server host
        let mut is_cross_site = false;
        if let Ok(orig_url) = url::Url::parse(origin) {
            if let Some(origin_host) = orig_url.host_str() {
                if !origin_host.eq_ignore_ascii_case(host) {
                    is_cross_site = true;
                }
            }
        }

        // compute domain attribute (root two labels) when host is a normal domain
        let mut domain_attr: Option<String> = None;
        if !is_localhost && host.contains('.') {
            let parts: Vec<&str> = host.split('.').collect();
            if parts.len() >= 2 {
                let root = parts[parts.len() - 2..].join(".");
                domain_attr = Some(format!(".{}", root));
            }
        }

        let max_age = 7 * 24 * 60 * 60;
        let expires = (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc2822();

        let mut cookie_refresh = format!("refreshToken={refresh_token}; Path=/; HttpOnly; Max-Age={}", max_age);
        if let Some(d) = &domain_attr {
            cookie_refresh.push_str(&format!("; Domain={}", d));
        }
        if is_cross_site && !is_localhost {
            cookie_refresh.push_str("; Secure; SameSite=None");
        } else {
            cookie_refresh.push_str("; SameSite=Lax");
        }
        cookie_refresh.push_str(&format!("; Expires={}", expires));

        let mut cookie_csrf = format!("CSRF-TOKEN={csrf}; Path=/");
        if let Some(d) = &domain_attr {
            cookie_csrf.push_str(&format!("; Domain={}", d));
        }
        if is_cross_site && !is_localhost {
            cookie_csrf.push_str("; SameSite=None; Secure");
        } else {
            cookie_csrf.push_str("; SameSite=Lax");
        }

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

        let user = self.resolve_fresh_user(auth);
        if let Some(user) = user {
            let is_sub_user = user.is_sub_user.unwrap_or(false)
                || self.parse_app_token_meta(user.app_token.as_deref()).2;
            let is_dev = if is_sub_user {
                false
            } else {
                self.resolve_dev_flag(&user)
            };
            let mut user = user;
            user.dev = Some(is_dev);
            user.is_sub_user = Some(is_sub_user);
            apply_app_id_from_token(&self.record_manager, &mut user);
            let mut info = user.to_info_map();
            self.enrich_account_meta(&user, &mut info);
            self.enrich_user_info_with_bitfield(&user, &mut info);
            info.insert("dev".into(), Value::Bool(is_dev));
            if let Some(app_id) = user.app_id.as_ref().filter(|s| !s.is_empty()) {
                info.insert("app_id".into(), Value::String(app_id.clone()));
            }
            if let Some(app_token) = user.app_token.as_ref().filter(|s| !s.is_empty()) {
                info.insert("app_token".into(), Value::String(app_token.clone()));
            }
            let data_app_ids = user.data_app_ids.clone().unwrap_or_default();
            info.insert(
                "data_app_ids".into(),
                Value::Array(data_app_ids.iter().cloned().map(Value::String).collect()),
            );

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

    pub fn handle_logout(
        &self,
        auth_user: Option<&crate::security::AuthUser>,
        params: &Map<String, Value>,
    ) -> StandardResponse {
        let mut response = StandardResponse::new();

        if let Some(auth) = auth_user {
            if let Some(user) = self.resolve_fresh_user(auth) {
                self.user_service.clear_session_token(&user);
                info!(
                    "[LOGOUT] Invalidated refreshToken for user id={:?}",
                    user.id
                );
            }
        } else if let Some(token) = params.get("refreshToken").and_then(|v| v.as_str()) {
            if let Some(user) = self.user_service.find_by_refresh_token(token) {
                self.user_service.clear_session_token(&user);
            }
        }
        response.set("code", 200);
        response.set("success", true);
        response.set("message", "Logged out");
        // Clear cookies; include domain when available
        let host = params.get("_host").and_then(|v| v.as_str()).unwrap_or("");
        let mut domain_attr: Option<String> = None;
        if host.contains('.') && !(host == "localhost" || host == "127.0.0.1") {
            let parts: Vec<&str> = host.split('.').collect();
            if parts.len() >= 2 {
                let root = parts[parts.len() - 2..].join(".");
                domain_attr = Some(format!(".{}", root));
            }
        }

        let mut del_refresh = String::from("refreshToken=; Path=/; Max-Age=0; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT;");
        let mut del_csrf = String::from("CSRF-TOKEN=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT;");
        if let Some(d) = domain_attr {
            del_refresh.push_str(&format!(" Domain={};", d));
            del_csrf.push_str(&format!(" Domain={};", d));
        }
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            del_refresh.parse().unwrap(),
        );
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            del_csrf.parse().unwrap(),
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

        let ip = params
            .get("_client_ip")
            .and_then(|v| v.as_str())
            .map(normalize_client_ip)
            .unwrap_or_default();
        let ua = params
            .get("_user_agent")
            .and_then(|v| v.as_str())
            .map(normalize_user_agent)
            .unwrap_or_default();

        if !refresh_session_valid(&user, &ip, &ua) {
            response.set("code", 401);
            response.set("success", false);
            response.set(
                "message",
                if user.refresh_token_expiry.unwrap_or(0) > 0
                    && user.refresh_token_expiry.unwrap_or(0)
                        <= chrono::Utc::now().timestamp_millis()
                {
                    "Refresh token đã hết hạn"
                } else {
                    "Refresh token không hợp lệ (IP/UA)"
                },
            );
            return response;
        }

        let version = user.login_version.unwrap_or(0);
        let new_refresh = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
        let expiry = chrono::Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;
        self.user_service
            .update_session_token(&user, &new_refresh, &ip, &ua, expiry, version);

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

        // mirror Java logic: set Domain, SameSite, Secure and Expires when appropriate
        let host = params.get("_host").and_then(|v| v.as_str()).unwrap_or("");
        let origin = params.get("_origin").and_then(|v| v.as_str()).unwrap_or("");
        let referer = params.get("_referer").and_then(|v| v.as_str()).unwrap_or("");
        let ua = params.get("_user_agent").and_then(|v| v.as_str()).unwrap_or("");

        let mut is_localhost = host == "localhost" || host == "127.0.0.1" || origin.contains("localhost") || origin.contains("127.0.0.1") || referer.contains("localhost") || referer.contains("127.0.0.1");
        let ua_lc = ua.to_lowercase();
        let is_node_webkit = ua_lc.contains("nwjs") || ua_lc.contains("node-webkit");
        if is_node_webkit {
            let origin_l = origin.to_lowercase();
            let referer_l = referer.to_lowercase();
            let is_file_like = origin_l == "null" || origin_l.starts_with("file://") || origin_l.starts_with("app://") || referer_l == "null" || referer_l.starts_with("file://") || referer_l.starts_with("app://");
            if is_file_like || is_localhost {
                is_localhost = true;
            }
        }

        let mut is_cross_site = false;
        if let Ok(orig_url) = url::Url::parse(origin) {
            if let Some(origin_host) = orig_url.host_str() {
                if !origin_host.eq_ignore_ascii_case(host) {
                    is_cross_site = true;
                }
            }
        }

        let mut domain_attr: Option<String> = None;
        if !is_localhost && host.contains('.') {
            let parts: Vec<&str> = host.split('.').collect();
            if parts.len() >= 2 {
                let root = parts[parts.len() - 2..].join(".");
                domain_attr = Some(format!(".{}", root));
            }
        }

        let max_age = 7 * 24 * 60 * 60;
        let expires = (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc2822();

        let mut cookie_refresh = format!("refreshToken={new_refresh}; Path=/; HttpOnly; Max-Age={}", max_age);
        if let Some(d) = &domain_attr {
            cookie_refresh.push_str(&format!("; Domain={}", d));
        }
        if is_cross_site && !is_localhost {
            cookie_refresh.push_str("; Secure; SameSite=None");
        } else {
            cookie_refresh.push_str("; SameSite=Lax");
        }
        cookie_refresh.push_str(&format!("; Expires={}", expires));

        let mut cookie_csrf = format!("CSRF-TOKEN={csrf}; Path=/");
        if let Some(d) = &domain_attr {
            cookie_csrf.push_str(&format!("; Domain={}", d));
        }
        if is_cross_site && !is_localhost {
            cookie_csrf.push_str("; SameSite=None; Secure");
        } else {
            cookie_csrf.push_str("; SameSite=Lax");
        }

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

        let Some(auth) = auth_user else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Not authenticated");
            return response;
        };

        let filter = SearchFilter::eq("id", "accessRights");
        let index = self.record_manager.find("csm", "index", &filter);
        let all_routes = match index.get("data") {
            Some(Value::Array(arr)) => arr.clone(),
            _ => {
                response.set("code", 200);
                response.set("success", true);
                response.set("message", "ok");
                response.set("result", json!([]));
                return response;
            }
        };

        let fresh_user = auth_user.and_then(|auth| self.resolve_fresh_user(auth));

        // Mirror Java handleGetAsyncRoutes: authenticated principal first, DB only to fill gaps.
        let mut permissions = auth.permissions.clone();
        let mut menus = auth.menus_permissions.clone().unwrap_or_default();
        let mut is_dev = auth.dev;

        if let Some(user) = fresh_user {
            if permissions.is_empty() {
                permissions = user.permissions.clone().unwrap_or_default();
            }
            if menus.is_empty() {
                menus = user.menus_permissions.clone().unwrap_or_default();
            }
            is_dev = self.resolve_dev_flag(&user) || user.dev.unwrap_or(false) || auth.dev;
        }

        let user_role = permissions.first().cloned();

        let filtered = filter_routes_by_role(
            &all_routes,
            user_role.as_deref(),
            &menus,
            is_dev,
            &mut std::collections::HashSet::new(),
        );

        response.set("code", 200);
        response.set("success", true);
        response.set("message", "ok");
        response.set("result", Value::Array(filtered));
        response
    }

    fn resolve_fresh_user(&self, auth: &crate::security::AuthUser) -> Option<User> {
        let user = if !auth.app_token.is_empty() {
            self.user_service.find_by_app_token(&auth.app_token)
        } else if !auth.user_id.is_empty() {
            self.user_service.find_by_id(&auth.user_id)
        } else {
            None
        }?;

        let resolved_id = user.id.as_deref().unwrap_or("");
        if !auth.user_id.is_empty() && !resolved_id.is_empty() && resolved_id != auth.user_id {
            warn!(
                "[resolve_fresh_user] Reject stale user record auth_id={} resolved_id={} app_token={}",
                auth.user_id, resolved_id, auth.app_token
            );
            return None;
        }

        Some(user)
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
        // Fall back to stored dev field
        user.dev.unwrap_or(false)
    }

    /// Decrypt app_token and return (login_identifier, role, is_sub_user).
    fn parse_app_token_meta(&self, app_token: Option<&str>) -> (String, String, bool) {
        let token = match app_token {
            Some(t) if !t.is_empty() => t,
            _ => return (String::new(), String::new(), false),
        };
        if let Ok(decrypted) = self.record_manager.csm_decrypt(token) {
            let parts: Vec<&str> = decrypted.split("_____").collect();
            let login_identifier = parts.get(1).map(|s| s.to_string()).unwrap_or_default();
            let role = parts.get(2).map(|s| s.to_string()).unwrap_or_default();
            let is_sub_user = role.eq_ignore_ascii_case("user");
            return (login_identifier, role, is_sub_user);
        }
        (String::new(), String::new(), false)
    }

    /// Enrich user info map with account_type, is_sub_user, login_identifier from app_token.
    fn enrich_account_meta(&self, user: &User, info: &mut Map<String, Value>) {
        let (login_identifier, _role, is_sub_user) =
            self.parse_app_token_meta(user.app_token.as_deref());
        info.insert(
            "account_type".into(),
            Value::String(if is_sub_user { "sub-user" } else { "main" }.into()),
        );
        info.insert("is_sub_user".into(), Value::Bool(is_sub_user));
        if !login_identifier.is_empty() {
            info.insert("login_identifier".into(), Value::String(login_identifier));
        }
    }

    fn enrich_async_routes(&self, user: &User, result: &mut Map<String, Value>) {
        let filter = SearchFilter::eq("id", "accessRights");
        let index = self.record_manager.find("csm", "index", &filter);
        if let Some(Value::Array(all_routes)) = index.get("data") {
            let user_role = user
                .permissions
                .as_ref()
                .and_then(|p| p.first())
                .cloned();
            let is_dev = user.dev.unwrap_or(false);
            let menus = user.menus_permissions.clone().unwrap_or_default();
            let filtered = filter_routes_by_role(
                all_routes,
                user_role.as_deref(),
                &menus,
                is_dev,
                &mut std::collections::HashSet::new(),
            );
            result.insert("asyncRoutes".into(), Value::Array(filtered));
        }
        self.enrich_bitfield(user, result);
    }

    /// Mirrors Java `enrichUserInfoWithBitfield` — merge list fields with stored bitfield tokens.
    fn enrich_user_info_with_bitfield(&self, user: &User, info: &mut Map<String, Value>) {
        let stored_bitfield = user
            .permission_bitfield
            .as_deref()
            .or_else(|| info.get("permissionBitfield").and_then(|v| v.as_str()));

        let base_permissions = string_list_from_value(
            info.get("permissions").or_else(|| info.get("roles")),
        );
        let base_menus = string_list_from_value(info.get("menusPermissions"));

        let dev = if user.is_sub_user.unwrap_or(false)
            || self.parse_app_token_meta(user.app_token.as_deref()).2
        {
            false
        } else {
            self.resolve_dev_flag(user)
                || user.dev.unwrap_or(false)
                || info.get("dev").and_then(|v| v.as_bool()).unwrap_or(false)
        };

        let mut permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &base_permissions,
            &PermissionBitfieldUtil::permissions_from_bitfield(stored_bitfield),
        );
        let mut menus_permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &base_menus,
            &PermissionBitfieldUtil::menus_from_bitfield(stored_bitfield),
        );

        if user.is_sub_user.unwrap_or(false)
            || self.parse_app_token_meta(user.app_token.as_deref()).2
        {
            permissions = PermissionBitfieldUtil::subtract_case_insensitive(
                &permissions,
                &["admin".into(), "dev".into(), "scope:all".into()],
            );
            if !permissions.iter().any(|p| {
                let n = p.to_ascii_lowercase();
                n == "view" || n == "create" || n == "edit" || n == "delete" || n == "export"
            }) {
                permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                    &permissions,
                    &["view".into(), "scope:owner".into()],
                );
            }
        }

        let bitfield =
            PermissionBitfieldUtil::build_bitfield(&permissions, &menus_permissions, dev);

        info.insert(
            "roles".into(),
            Value::Array(permissions.iter().cloned().map(Value::String).collect()),
        );
        info.insert(
            "permissions".into(),
            Value::Array(permissions.iter().cloned().map(Value::String).collect()),
        );
        info.insert(
            "menusPermissions".into(),
            Value::Array(menus_permissions.iter().cloned().map(Value::String).collect()),
        );
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

    /// Login/async-routes enrichment — build bitfield from stored list fields (Java login path).
    fn enrich_bitfield(&self, user: &User, info: &mut Map<String, Value>) {
        let permissions = user.permissions.clone().unwrap_or_default();
        let menus = user.menus_permissions.clone().unwrap_or_default();
        let dev = user.dev.unwrap_or(false);

        if !info.contains_key("permissions") {
            info.insert(
                "permissions".into(),
                Value::Array(permissions.iter().cloned().map(Value::String).collect()),
            );
        }
        if !info.contains_key("roles") {
            info.insert(
                "roles".into(),
                Value::Array(permissions.iter().cloned().map(Value::String).collect()),
            );
        }
        if !info.contains_key("menusPermissions") {
            if let Some(menus_permissions) = &user.menus_permissions {
                info.insert(
                    "menusPermissions".into(),
                    Value::Array(menus_permissions.iter().cloned().map(Value::String).collect()),
                );
            }
        }

        let bitfield = PermissionBitfieldUtil::build_bitfield(&permissions, &menus, dev);
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

fn string_list_from_value(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => vec![],
    }
}

/// Always derive menu home app_id from decrypted app_token (Java mapMainAccountToUser parity).
fn apply_app_id_from_token(record_manager: &RecordManager, user: &mut User) {
    if let Some(app_id) = app_id_from_token(record_manager, user.app_token.as_deref()) {
        user.app_id = Some(app_id);
    }
}

/// Mirror of Java's filterRoutesByRoleAndMenus — recursively filter routes by role, menus, dev flag.
fn filter_routes_by_role(
    routes: &[Value],
    user_role: Option<&str>,
    allowed_menu_paths: &[String],
    is_dev: bool,
    seen: &mut std::collections::HashSet<String>,
) -> Vec<Value> {
    let mut out = Vec::new();
    for route in routes {
        let path = match route.get("path").and_then(|v| v.as_str()) {
            Some(p) => p.to_string(),
            None => continue,
        };
        if !seen.insert(path.clone()) {
            continue;
        }

        let mut current = route.clone();

        // Recurse children first
        if let Some(Value::Array(children)) = route.get("children") {
            let filtered_children =
                filter_routes_by_role(children, user_role, allowed_menu_paths, is_dev, seen);
            if let Value::Object(ref mut m) = current {
                m.insert("children".into(), Value::Array(filtered_children));
            }
        }

        let handle = route.get("handle");
        let roles: Vec<String> = handle
            .and_then(|h| h.get("roles"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let has_role_access = user_role
            .map(|r| roles.iter().any(|role| role == r))
            .unwrap_or(false);
        let has_menu_access = allowed_menu_paths.iter().any(|m| m == &path);

        let is_system_route = path == "/system" || path.starts_with("/system/");
        let is_dev_only = path == "/system/menu"
            || path.starts_with("/system/menu/")
            || path == "/system/developer"
            || path.starts_with("/system/developer/")
            || path == "/system/broadcast"
            || path.starts_with("/system/broadcast/");

        let is_admin_system = user_role == Some("admin") && is_system_route && !is_dev_only;

        let has_children = current
            .get("children")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);

        let include = if is_system_route {
            is_dev || has_role_access || is_admin_system || has_children
        } else {
            has_role_access || has_menu_access || has_children
        };

        if include {
            out.push(current);
        }
    }
    out
}
