use std::sync::Arc;

use serde_json::{json, Map, Value};
use tracing::info;
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse, User};
use crate::security::client_session::{
    normalize_client_ip, normalize_user_agent, refresh_session_valid,
};
use crate::security::jwt::JwtUtil;
use crate::services::user::{user_ids_match, user_matches_auth_principal, user_matches_jwt_hints, UserService};
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

        let Some(user) = self
            .user_service
            .find_by_login_and_password(login_id, password)
        else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Định danh hoặc mật khẩu không hợp lệ");
            return response;
        };

        // Mirror Java AuthHandler.handleLogin: dev + app_id from app_token via mapMainAccountToUser rules.
        let mut user = user;
        self.user_service.finalize_session_profile(&mut user, None);
        let is_dev = user.dev.unwrap_or(false);

        let next_version = user.login_version.map(|v| v + 1).unwrap_or(1);
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

        info!(
            "[LOGIN] Saved session user_id={:?} login_version={} refresh_prefix={}",
            user.id,
            next_version,
            &refresh_token[..refresh_token.len().min(10)]
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

        // compute domain attribute — Java does NOT set Domain on auth cookies
        let domain_attr: Option<String> = None;

        // Drop stale refresh/CSRF cookies (host-only + legacy Domain=) before issuing a new session.
        append_clear_auth_cookies(&mut response, host, is_cross_site, is_localhost);

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

    pub fn handle_user_info(
        &self,
        auth_user: Option<&crate::security::AuthUser>,
        params: &Map<String, Value>,
    ) -> StandardResponse {
        let mut response = StandardResponse::new();

        // When csm-token header is present, JWT claims are the sole source of truth.
        // Never return another account because middleware fell back to a stale refresh cookie.
        if let Some(token) = params
            .get("csm-token")
            .and_then(|v| v.as_str())
            .filter(|t| !t.is_empty())
        {
            if self.jwt.validate_token(token) {
                return self.build_user_info_from_jwt(token, auth_user);
            }
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Invalid or expired session token");
            return response;
        }

        let Some(auth) = auth_user else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Not authenticated");
            return response;
        };

        let mut user = self
            .user_service
            .canonicalize_session_user(auth)
            .unwrap_or_else(|| self.user_from_auth(auth));

        if !user_matches_auth_principal(&user, auth) {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Session user mismatch");
            return response;
        }

        self.finish_user_info_response(&user, &mut response);
        response
    }

    fn build_user_info_from_jwt(
        &self,
        token: &str,
        auth_user: Option<&crate::security::AuthUser>,
    ) -> StandardResponse {
        let mut response = StandardResponse::new();
        if let Some(user) = self
            .user_service
            .resolve_from_jwt_with_util(&self.jwt, token)
        {
            if let Ok(claims) = self.jwt.parse_claims(token) {
                if !user_matches_jwt_hints(&user, &claims.uid, &claims.sub) {
                    response.set("code", 401);
                    response.set("success", false);
                    response.set("message", "Session token mismatch");
                    return response;
                }
            }
            self.finish_user_info_response(&user, &mut response);
            return response;
        }

        // Same-account refresh session from middleware (never cross-account).
        if let (Ok(claims), Some(auth)) = (self.jwt.parse_claims(token), auth_user) {
            if user_matches_jwt_hints_auth(auth, &claims.uid, &claims.sub) {
                if let Some(user) = self
                    .user_service
                    .canonicalize_session_user(auth)
                    .filter(|user| user_matches_auth_principal(user, auth))
                {
                    self.finish_user_info_response(&user, &mut response);
                    return response;
                }
            }
        }

        response.set("code", 401);
        response.set("success", false);
        response.set("message", "Session token could not be resolved");
        response
    }

    fn finish_user_info_response(&self, user: &User, response: &mut StandardResponse) {
        let mut info = user.to_info_map();
        self.enrich_account_meta(user, &mut info);
        self.enrich_user_info_with_bitfield(user, &mut info);
        response.set("code", 200);
        response.set("success", true);
        response.set("message", "ok");
        response.set("result", Value::Object(info));
    }

    pub fn handle_logout(
        &self,
        auth_user: Option<&crate::security::AuthUser>,
        params: &Map<String, Value>,
    ) -> StandardResponse {
        let mut response = StandardResponse::new();

        if let Some(auth) = auth_user {
            if let Some(user) = self.user_service.canonicalize_session_user(auth) {
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
        let host = params.get("_host").and_then(|v| v.as_str()).unwrap_or("");
        append_clear_auth_cookies(&mut response, host, false, host == "localhost" || host == "127.0.0.1");
        response
    }

    pub fn handle_refresh_token(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut response = StandardResponse::new();
        let refresh_candidates = refresh_tokens_from_params(params);
        if refresh_candidates.is_empty() {
            response.set("code", 400);
            response.set("success", false);
            response.set("message", "Missing refresh token");
            return response;
        }

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

        let mut matched_user = None;
        for refresh in &refresh_candidates {
            let Some(user) = self.user_service.find_by_refresh_token(refresh) else {
                continue;
            };
            if refresh_session_valid(&user, &ip, &ua) {
                matched_user = Some(user);
                break;
            }
        }

        let Some(user) = matched_user else {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Invalid refresh token");
            return response;
        };

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

        let fresh_user = auth_user.and_then(|auth| self.user_service.canonicalize_session_user(auth));

        let (permissions, menus, is_dev) = if let Some(user) = &fresh_user {
            (
                user.permissions.clone().unwrap_or_default(),
                user.menus_permissions.clone().unwrap_or_default(),
                user.dev.unwrap_or(false),
            )
        } else {
            (
                auth.permissions.clone(),
                auth.menus_permissions.clone().unwrap_or_default(),
                auth.dev,
            )
        };

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
        self.user_service.canonicalize_session_user(auth)
    }

    fn user_from_auth(&self, auth: &crate::security::AuthUser) -> User {
        User {
            id: Some(auth.user_id.clone()),
            username: Some(auth.username.clone()),
            email: Some(auth.email.clone()),
            phone_number: Some(auth.phone_number.clone()),
            app_token: Some(auth.app_token.clone()),
            app_id: Some(auth.app_id.clone()),
            permissions: Some(auth.permissions.clone()),
            menus_permissions: auth.menus_permissions.clone(),
            permission_bitfield: auth.permission_bitfield.clone(),
            data_scope: Some(auth.data_scope.clone()),
            dev: Some(auth.dev),
            is_sub_user: Some(auth.is_sub_user),
            data_app_ids: Some(auth.data_app_ids.clone()),
            dept_id: Some(auth.dept_id.clone()),
            branch_id: Some(auth.branch_id.clone()),
            login_version: Some(auth.login_version),
            ..Default::default()
        }
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

    /// Mirrors Java `enrichUserInfoWithBitfield` — merge list fields with stored bitfield only.
    fn enrich_user_info_with_bitfield(&self, _user: &User, info: &mut Map<String, Value>) {
        let stored_bitfield = info.get("permissionBitfield").and_then(|v| v.as_str());

        let base_permissions = string_list_from_value(
            info.get("permissions").or_else(|| info.get("roles")),
        );
        let base_menus = string_list_from_value(info.get("menusPermissions"));

        let dev = info
            .get("dev")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &base_permissions,
            &PermissionBitfieldUtil::permissions_from_bitfield(stored_bitfield),
        );
        let menus_permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &base_menus,
            &PermissionBitfieldUtil::menus_from_bitfield(stored_bitfield),
        );

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

fn root_domain_from_host(host: &str) -> Option<String> {
    if host.is_empty() || host == "localhost" || host == "127.0.0.1" || !host.contains('.') {
        return None;
    }
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() >= 2 {
        Some(format!(".{}", parts[parts.len() - 2..].join(".")))
    } else {
        None
    }
}

fn append_clear_auth_cookies(
    response: &mut StandardResponse,
    host: &str,
    is_cross_site: bool,
    is_localhost: bool,
) {
    let mut domains: Vec<Option<String>> = vec![None];
    if let Some(root) = root_domain_from_host(host) {
        domains.push(Some(root));
    }
    for domain in domains {
        let mut del_refresh = String::from(
            "refreshToken=; Path=/; Max-Age=0; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT;",
        );
        let mut del_csrf = String::from(
            "CSRF-TOKEN=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT;",
        );
        if let Some(d) = domain {
            del_refresh.push_str(&format!(" Domain={};", d));
            del_csrf.push_str(&format!(" Domain={};", d));
        }
        if is_cross_site && !is_localhost {
            del_refresh.push_str(" Secure; SameSite=None");
            del_csrf.push_str(" SameSite=None; Secure");
        } else {
            del_refresh.push_str(" SameSite=Lax");
            del_csrf.push_str(" SameSite=Lax");
        }
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            del_refresh.parse().unwrap(),
        );
        response.extra_headers.append(
            axum::http::header::SET_COOKIE,
            del_csrf.parse().unwrap(),
        );
    }
}

fn user_matches_jwt_hints_auth(auth: &crate::security::AuthUser, uid: &str, sub: &str) -> bool {
    if !uid.trim().is_empty()
        && !auth.user_id.is_empty()
        && user_ids_match(&auth.user_id, uid)
    {
        return true;
    }
    if !sub.trim().is_empty() {
        if !auth.app_token.is_empty() && auth.app_token == sub {
            return true;
        }
        if !auth.user_id.is_empty() && user_ids_match(&auth.user_id, sub) {
            return true;
        }
    }
    false
}

fn refresh_tokens_from_params(params: &Map<String, Value>) -> Vec<String> {
    let mut out = Vec::new();
    let mut push = |token: Option<&str>| {
        if let Some(token) = token.filter(|t| !t.is_empty()) {
            if !out.iter().any(|existing| existing == token) {
                out.push(token.to_string());
            }
        }
    };
    // Mirror Java order: header, cookie; also accept explicit body refreshToken.
    push(params.get("refreshTokenHeader").and_then(|v| v.as_str()));
    push(params.get("refreshToken").and_then(|v| v.as_str()));
    push(params.get("refreshTokenCookie").and_then(|v| v.as_str()));
    push(params.get("refreshTokenBody").and_then(|v| v.as_str()));
    out
}
