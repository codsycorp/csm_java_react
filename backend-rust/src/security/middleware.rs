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

use crate::security::auth::AuthUser;
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
    CorsLayer::new()
        .allow_origin([
            "https://www.h-holding.vn".parse().unwrap(),
            "https://www.h-holding.com.vn".parse().unwrap(),
            "https://www.phanmemmottrieu.net".parse().unwrap(),
            "https://www.csmbridge.net".parse().unwrap(),
            "http://localhost:15300".parse().unwrap(),
            "http://localhost:3333".parse().unwrap(),
            "http://localhost:5173".parse().unwrap(),
            "http://127.0.0.1:15300".parse().unwrap(),
            "http://127.0.0.1:3333".parse().unwrap(),
            "http://127.0.0.1:5173".parse().unwrap(),
        ])
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
    host.map(|h| h.starts_with("api.")).unwrap_or(false) || uri.starts_with("/api/")
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
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok());

    if !is_api_request(&uri, host) || is_public_api_path(req.method(), &uri) {
        return next.run(req).await;
    }

    if let Some(user) = resolve_auth_user(&state, req.headers()) {
        req.extensions_mut().insert(user);
        return next.run(req).await;
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
    for token in bearer_token(headers).into_iter().chain(csm_token(headers)) {
        if state.jwt.validate_token(&token) {
            if let Some(user) = state.user_service.resolve_from_jwt_with_util(&state.jwt, &token) {
                return Some(enrich_auth_user(state, AuthUser::from_user(user)));
            }
        }
    }

    if let Some(rt) = refresh_token_from_request(headers) {
        if let Some(user) = state.user_service.find_by_refresh_token(&rt) {
            return Some(enrich_auth_user(state, AuthUser::from_user(user)));
        }
    }

    None
}

fn enrich_auth_user(state: &AppState, mut user: AuthUser) -> AuthUser {
    if !user.dev {
        if let Ok(decrypted) = state.record_manager.csm_decrypt(&user.app_token) {
            if let Some(access_right) = decrypted.split("_____").last() {
                if let Ok(n) = access_right.parse::<i32>() {
                    user.dev = n > 0;
                }
            }
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

fn refresh_token_from_request(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-refresh-token")
        .and_then(|h| h.to_str().ok())
        .filter(|t| !t.is_empty())
        .map(String::from)
        .or_else(|| cookie_value(headers, "refreshToken"))
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some((key, value)) = part.split_once('=') {
            if key.trim() == name {
                let decoded = urlencoding::decode(value.trim())
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| value.trim().to_string());
                if !decoded.is_empty() {
                    return Some(decoded);
                }
            }
        }
    }
    None
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
