use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderMap, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    trace::TraceLayer,
};
use tracing::warn;

use crate::security::auth::AuthUser;
use crate::security::client_session::{
    client_ip_from_headers, client_id_from_headers, refresh_session_valid_for_middleware,
    refresh_token_candidates, user_agent_from_headers, user_agent_matches,
};
use crate::services::user::user_matches_jwt_hints;
use crate::util::{app_id_from_token, parse_app_token, is_sub_user_role};
use crate::security::rate_limit::RateLimiter;
use crate::state::AppState;

pub fn security_layers() -> ServiceBuilder<
    tower::layer::util::Stack<
        CorsLayer,
        tower::layer::util::Stack<
            CompressionLayer,
            tower::layer::util::Stack<
                TraceLayer<tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>>,
                tower::layer::util::Identity,
            >,
        >,
    >,
> {
    ServiceBuilder::new()
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(cors_layer())
}

fn cors_layer() -> CorsLayer {
    // Mirrors Java: addAllowedOriginPattern("*") + allowCredentials(true).
    // mirror_request() reflects the request Origin back as ACAO, which satisfies
    // the browser's SameSite + credentials requirement for any subdomain/domain.
    CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::HeaderName::from_static("x-csrf-token"),
            header::HeaderName::from_static("csm-token"),
            header::HeaderName::from_static("x-refresh-token"),
            header::HeaderName::from_static("csm-lang"),
            header::HeaderName::from_static("x-client-id"),
            header::HeaderName::from_static("x-requested-with"),
            header::ACCEPT,
        ])
        .allow_credentials(true)
        .max_age(std::time::Duration::from_secs(3600))
}

pub fn is_api_request(uri: &str, host: Option<&str>) -> bool {
    host.map(|h| h.starts_with("api.")).unwrap_or(false)
        || uri.starts_with("/api/")
        || crate::api::paths::is_direct_ai_path(uri)
}

fn resolve_host(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-forwarded-host")
        .and_then(|h| h.to_str().ok())
        .filter(|h| !h.is_empty())
        .or_else(|| headers.get(header::HOST).and_then(|h| h.to_str().ok()))
}

fn is_get_table_data_request(uri: &str) -> bool {
    uri == "/api/get-table-data" || uri == "/get-table-data"
}

pub fn is_public_api_path(method: &Method, path: &str) -> bool {
    let clean = path.strip_prefix("/api").unwrap_or(path);
    if *method == Method::OPTIONS {
        return true;
    }
    matches!(
        clean,
        "/login"
            | "/refresh-token"
            | "/register"
            | "/create-default-data"
            | "/chat-history"
            | "/chat-history-guest"
            | "/chat-history-app"
            | "/chat-mark-read"
            | "/chat-mark-all-read"
    ) || clean.starts_with("/monitoring")
        || clean.starts_with("/ai-local")
        || (clean == "/crm/customer" && (*method == Method::POST || *method == Method::PUT))
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let uri = req.uri().path().to_string();
    let host = resolve_host(req.headers());

    if !is_api_request(&uri, host) || is_public_api_path(req.method(), &uri) {
        return next.run(req).await;
    }

    if let Some(user) = resolve_auth_user(&state, req.headers()) {
        req.extensions_mut().insert(user);
        return next.run(req).await;
    }

    if is_get_table_data_request(&uri) {
        let has_csm_token = req.headers().get("csm-token").and_then(|h| h.to_str().ok()).map(|s| !s.is_empty()).unwrap_or(false);
        let has_authorization = req.headers().get(header::AUTHORIZATION).and_then(|h| h.to_str().ok()).map(|s| !s.is_empty()).unwrap_or(false);
        let has_refresh_header = req.headers().get("x-refresh-token").and_then(|h| h.to_str().ok()).map(|s| !s.is_empty()).unwrap_or(false);
        let has_refresh_cookie = crate::security::client_session::cookie_from_headers(req.headers(), "refreshToken").is_some();
        warn!("[GET_TABLE_DATA][AUTH] reject-missing-or-invalid-auth host={:?} csm-token={} authorization={} x-refresh-token={} refreshCookie={}",
            host, has_csm_token, has_authorization, has_refresh_header, has_refresh_cookie);
    }

    (
        StatusCode::UNAUTHORIZED,
        Json(json!({
            "code": 401,
            "success": false,
            "message": "Invalid or expired JWT token"
        })),
    )
        .into_response()
}

fn resolve_auth_user(state: &AppState, headers: &HeaderMap) -> Option<AuthUser> {
    // Mirror Java: invalid Bearer must hard-fail without refresh-token fallback.
    if let Some(token) = bearer_token(headers) {
        if state.jwt.validate_token(&token) {
            if let Some(user) =
                state
                    .user_service
                    .resolve_from_jwt_with_util(&state.jwt, &token)
            {
                return Some(enrich_auth_user(
                    state,
                    auth_user_from_model(state, user),
                ));
            }
        }
        return None;
    }

    let csm = csm_token(headers);
    let csm_present = csm.as_ref().is_some_and(|token| !token.is_empty());
    let csm_valid = csm
        .as_ref()
        .is_some_and(|token| !token.is_empty() && state.jwt.validate_token(token));

    let jwt_hints = csm.as_ref().and_then(|token| {
        state
            .jwt
            .parse_claims(token)
            .or_else(|_| state.jwt.parse_claims_allow_expired(token))
            .ok()
            .map(|claims| (claims.uid, claims.sub))
    });

    if let Some(token) = csm.as_ref().filter(|t| !t.is_empty()) {
        if csm_valid {
            if let Some(user) =
                state
                    .user_service
                    .resolve_from_jwt_with_util(&state.jwt, token)
            {
                return Some(enrich_auth_user(state, auth_user_from_model(state, user)));
            }
            warn!(
                "[JWT] Valid csm-token present but user resolution failed; trying refresh-token fallback"
            );
            // Mirror Java JwtAuthenticationFilter: fall through to refresh when JWT resolve lags after login.
        }
        // Invalid/expired csm-token: refresh fallback below must match JWT uid/sub when parseable.
    }

    let client_ip = client_ip_from_headers(headers);
    let client_ua = user_agent_from_headers(headers);
    let client_id = client_id_from_headers(headers);
    for rt in refresh_token_candidates(headers) {
        match state.user_service.find_by_refresh_token(&rt) {
            Some(user)
                if refresh_session_valid_for_middleware(&user, &client_ip, &client_ua, &client_id)
                    && refresh_allowed_for_csm_hints(csm_present, jwt_hints.as_ref(), &user) =>
            {
                return Some(enrich_auth_user(state, auth_user_from_model(state, user)));
            }
            Some(user) => {
                warn!(
                    "[AUTH] refresh-token rejected user={:?} ip={}/{} ua_match={} expiry={} uid_match={}",
                    user.email,
                    client_ip,
                    user.refresh_token_ip.as_deref().unwrap_or(""),
                    user_agent_matches(
                        &client_ua,
                        user.refresh_token_ua.as_deref().unwrap_or(""),
                    ),
                    user.refresh_token_expiry.unwrap_or(0),
                    user_matches_jwt_hints(&user, jwt_hints.as_ref().map(|(u, _)| u.as_str()).unwrap_or(""), jwt_hints.as_ref().map(|(_, s)| s.as_str()).unwrap_or("")),
                );
            }
            None => {
                warn!(
                    "[AUTH] refresh-token not found (len={}) ip={} ua_len={}",
                    rt.len(),
                    client_ip,
                    client_ua.len(),
                );
            }
        }
    }

    if csm.as_ref().is_some_and(|t| !t.is_empty()) {
        warn!("[AUTH] all auth paths failed (csm-token present, refresh candidates tried)");
    }

    None
}

/// When csm-token header is present, refresh auth must belong to the same account as JWT hints.
fn refresh_allowed_for_csm_hints(
    csm_present: bool,
    jwt_hints: Option<&(String, String)>,
    user: &crate::model::User,
) -> bool {
    if !csm_present {
        return true;
    }
    let Some((uid, sub)) = jwt_hints else {
        return false;
    };
    if uid.trim().is_empty() && sub.trim().is_empty() {
        return false;
    }
    user_matches_jwt_hints(user, uid, sub)
}

fn auth_user_from_model(state: &AppState, user: crate::model::User) -> AuthUser {
    let meta = user
        .app_token
        .as_deref()
        .map(|token| parse_app_token(&state.record_manager, token))
        .unwrap_or_default();
    let is_sub_user = user.is_sub_user.unwrap_or_else(|| is_sub_user_role(&meta.role));
    AuthUser::from_user(user, is_sub_user)
}

fn enrich_auth_user(state: &AppState, mut user: AuthUser) -> AuthUser {
    if user.app_token.is_empty() {
        return user;
    }

    let meta = parse_app_token(&state.record_manager, &user.app_token);
    if let Some(app_id) = app_id_from_token(&state.record_manager, Some(&user.app_token)) {
        user.app_id = app_id;
    }
    user.is_sub_user = user.is_sub_user || is_sub_user_role(&meta.role);
    if user.is_sub_user {
        // Sub-user sessions must never inherit parent dev/admin elevation from token access_right.
        user.dev = false;
        user.data_app_ids.clear();
    } else {
        // Mirror Java User.getDev(): token access_right is additive to mapped user.dev only.
        user.dev = user.dev || meta.access_right > 0;
        if user.dev {
            user.data_scope = "ALL".into();
        }
    }
    user
}

fn csm_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("csm-token")
        .and_then(|h| h.to_str().ok())
        .filter(|t| !t.is_empty())
        .map(String::from)
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(String::from)
}

pub fn auth_rate_limiter(state: &AppState) -> RateLimiter {
    RateLimiter::new(
        state.config.auth_rate_limit.max_requests_per_minute,
        state.config.auth_rate_limit.window_ms,
    )
}
