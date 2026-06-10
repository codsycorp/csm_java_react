use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, Method, StatusCode},
    middleware::from_fn_with_state,
    response::{IntoResponse, Response},
    routing::{any, get},
    Router,
};
use serde_json::{json, Map, Value};
use tracing::{info, warn};

use crate::handlers::{api_ext, chat, social};
use crate::model::StandardResponse;
use crate::security::auth::AuthUser;
use crate::security::middleware::{auth_middleware, is_api_request};
use crate::state::AppState;

pub fn api_routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/monitoring/health", get(monitoring_health))
        .route("/monitoring/health", get(monitoring_health))
        .route("/api/system/check-requirements", get(system_check))
        .fallback(any(catch_all))
        .layer(from_fn_with_state(state, auth_middleware))
}

/// X-Forwarded-Host first (set by nginx), then Host. Mirrors Java's hostHeader resolution.
fn extract_host(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-host")
        .and_then(|h| h.to_str().ok())
        .filter(|h| !h.is_empty())
        .map(|h| h.to_lowercase())
        .or_else(|| {
            headers
                .get(header::HOST)
                .and_then(|h| h.to_str().ok())
                .map(|h| h.to_lowercase())
        })
}

async fn catch_all(State(state): State<AppState>, req: Request<Body>) -> Response {
    let method = req.method().clone();
    let uri = req.uri().path().to_string();
    let query_str = req.uri().query().map(|q| q.to_string()).unwrap_or_default();
    let host = extract_host(req.headers());
    let auth = req.extensions().get::<AuthUser>().cloned();

    info!("Request host={:?} uri={}", host, uri);

    if uri.starts_with("/api/app_images/") {
        return crate::web::router::serve_static(&state, &uri).await;
    }

    // For admin.* hosts the browser navigates directly to SPA routes (e.g. /login).
    // Bare-API-path matching must be skipped so those GET requests reach handle_web_path
    // and receive the SPA index.html instead of an empty-param API 400 error.
    let is_admin_host = host.as_deref().map(|h| h.starts_with("admin.")).unwrap_or(false);
    let is_api = is_api_request(&uri, host.as_deref())
        || crate::api::paths::is_direct_ai_path(&uri)
        || (!is_admin_host && crate::api::paths::is_bare_api_path(&uri));

    // SSR JSON endpoints — web-facing, return JSON, handled before API dispatch.
    // Mirrors Java WebSpringController: /ssr/categories, /ssr/tags, /ssr/reviews.
    if !is_api {
        match uri.as_str() {
            "/ssr/categories" => return serve_ssr_categories(&state, host.as_deref()).await,
            "/ssr/tags" => return serve_ssr_tags(&state, host.as_deref(), &query_str).await,
            "/ssr/reviews" => return serve_ssr_reviews(&state, host.as_deref(), &query_str).await,
            _ => {}
        }
    }

    if is_api {
        let clean_path = uri
            .strip_prefix("/api")
            .unwrap_or(&uri)
            .to_string();
        let params = parse_request_params(req).await;
        return dispatch_api(&state, &method, &clean_path, params, auth).await;
    }

    crate::web::router::handle_web_path(&state, &uri, host.as_deref(), &query_str).await
}

async fn serve_ssr_categories(state: &AppState, host: Option<&str>) -> Response {
    use crate::model::SearchFilter;
    let domain = crate::web::ssr::domain_from_host(host);
    let filter = SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            SearchFilter::eq("status", "active"),
            SearchFilter { field: "domain".into(), filter_type: "like".into(), value: Value::String(domain), ..Default::default() },
        ],
        ..Default::default()
    };
    let result = state.record_manager.filter("web", "web_services", &filter);
    let rows = result.get("rows").or_else(|| result.get("data"))
        .and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let total = rows.len();
    (StatusCode::OK, axum::Json(json!({
        "success": true,
        "data": rows.clone(),
        "rows": rows,
        "total": total,
        "totalCount": total,
    }))).into_response()
}

async fn serve_ssr_tags(state: &AppState, host: Option<&str>, qs: &str) -> Response {
    use crate::model::SearchFilter;
    let domain = crate::web::ssr::domain_from_host(host);
    let service_ids_raw = qs_param(qs, "service_ids").unwrap_or_default();
    let mut tags_map = serde_json::Map::new();
    for id in service_ids_raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        let filter = SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                SearchFilter::eq("service_id", id),
                SearchFilter { field: "domain".into(), filter_type: "like".into(), value: Value::String(domain.clone()), ..Default::default() },
            ],
            ..Default::default()
        };
        let result = state.record_manager.filter("web", "web_service_tags", &filter);
        let rows = result.get("rows").or_else(|| result.get("data"))
            .and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let tags: Vec<Value> = rows.iter()
            .filter_map(|r| r.get("tag")?.as_str().filter(|t| !t.is_empty()).map(|t| Value::String(t.to_string())))
            .collect();
        tags_map.insert(id.to_string(), Value::Array(tags));
    }
    (StatusCode::OK, axum::Json(json!({"success": true, "data": tags_map}))).into_response()
}

async fn serve_ssr_reviews(state: &AppState, host: Option<&str>, qs: &str) -> Response {
    use crate::model::SearchFilter;
    let domain = crate::web::ssr::domain_from_host(host);
    let service_ids_raw = qs_param(qs, "service_ids").unwrap_or_default();
    let mut reviews_map = serde_json::Map::new();
    for id in service_ids_raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        let filter = SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                SearchFilter::eq("service_id", id),
                SearchFilter::eq("status", "approved"),
                SearchFilter { field: "domain".into(), filter_type: "like".into(), value: Value::String(domain.clone()), ..Default::default() },
            ],
            ..Default::default()
        };
        let result = state.record_manager.filter("web", "web_service_reviews", &filter);
        let rows = result.get("rows").or_else(|| result.get("data"))
            .and_then(|v| v.as_array()).cloned().unwrap_or_default();
        reviews_map.insert(id.to_string(), Value::Array(rows));
    }
    (StatusCode::OK, axum::Json(json!({"success": true, "data": reviews_map}))).into_response()
}

fn qs_param(qs: &str, key: &str) -> Option<String> {
    for part in qs.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == key {
                return Some(urlencoding::decode(v).map(|s| s.into_owned()).unwrap_or_else(|_| v.to_string()));
            }
        }
    }
    None
}

async fn dispatch_api(
    state: &AppState,
    method: &Method,
    path: &str,
    mut params: Map<String, Value>,
    auth: Option<AuthUser>,
) -> Response {
    inject_request_meta(&mut params, method);

    let response = match path {
        // ── Init / Auth ──
        "/create-default-data" => state.init_handler.handle_create_default_data(),
        "/user-info" => state.auth_handler.handle_user_info(auth.as_ref()),
        "/login" => state.auth_handler.handle_login(&params),
        "/logout" => state.auth_handler.handle_logout(auth.as_ref(), &params),
        "/refresh-token" => state.auth_handler.handle_refresh_token(&params),
        "/register" => state.auth_handler.handle_register(&params),
        "/create-sub-user" => state.auth_handler.handle_register(&params),
        "/get-async-routes" => state.auth_handler.handle_get_async_routes(auth.as_ref()),
        // ── Role / Menu ──
        "/role-list" => state.role_handler.handle_role_list(&params),
        "/role-item" => state.role_handler.handle_role_item(method.as_str(), &params),
        "/role-menu" => state.role_handler.handle_role_menu(),
        "/menu-by-role-id" => state.menu_handler.handle_menu_by_role_id(&params),
        "/menu-list" => state.menu_handler.handle_menu_list(auth.as_ref()),
        "/menu-item" => state.menu_handler.handle_menu_item(method.as_str(), &params),
        // ── Home / Dashboard ──
        "/notifications" => state.home_handler.handle_notifications(),
        "/home" => state.home_handler.handle_home(),
        "/home/pie" => state.home_handler.handle_home_pie(),
        "/home/line" => state.home_handler.handle_home_line(&params),
        "/home/googlebot" => state.home_handler.handle_googlebot_stats(&params),
        "/home/googlebot/delete" => state.home_handler.handle_googlebot_delete(&params),
        // ── Table / Data ──
        "/restoredb" => state.table_handler.restore_db(&params),
        "/backupdb" => state.table_handler.backup_db(&params),
        "/migrateKeys" => state.table_handler.migrate_keys(&params),
        "/create-table" => state.table_handler.handle_create_table(&params),
        "/drop-table" => state.table_handler.handle_drop_table(&params),
        "/get-table-data" => state.table_handler.handle_get_table_data(&params, auth.as_ref()),
        "/update-table-data" => state.table_handler.handle_update_table_data(&params, auth.as_ref()),
        "/bulk-update-table-data" => state.table_handler.handle_bulk_update(&params),
        "/update-table-data-index" => state.table_handler.handle_index_existing(&params),
        // ── SEO / Scrape / Index ──
        "/seo" => state.seo_handler.handle_seo(&params),
        "/scrape-web" => api_ext::handle_scrape_web(state, &params).await,
        "/execute-js-on-page" => api_ext::handle_execute_js(&params),
        "/indexgoogle" => api_ext::handle_index_google(state, &params).await,
        // ── Facebook / Ads ──
        "/facebook/post" => social::handle_facebook_post(state, &params).await,
        "/facebook/post-with-images" => social::handle_facebook_post_with_images(state, &params).await,
        "/facebook/exchange-token" => social::handle_facebook_exchange_token(state, &params).await,
        "/facebook/pages" => social::handle_facebook_pages(state, &params).await,
        "/facebook/me" => social::handle_facebook_me(state, &params).await,
        "/facebook/ads/campaign" => {
            let mut p = params.clone();
            p.insert("platform".into(), Value::String("facebook_ads".into()));
            if !p.contains_key("adData") {
                p.insert("adData".into(), Value::Object(p.clone()));
            }
            state.crm_handler.handle_create_ad(&p)
        }
        "/google/ads/campaign" => {
            let mut p = params.clone();
            p.insert("platform".into(), Value::String("google_ads".into()));
            if !p.contains_key("adData") {
                p.insert("adData".into(), Value::Object(p.clone()));
            }
            state.crm_handler.handle_create_ad(&p)
        }
        // ── AI (switch paths) ──
        "/ai-generate-seo-content" => api_ext::handle_ai_seo_content(state, &params).await,
        "/aiAssistant-chat-stream" | "/ai/menu-merge" => ai_dispatch(state, path, &params).await,
        // ── Chat ──
        "/chat-history" | "/chat-history-guest" | "/chat-history-app" => {
            chat::handle_chat_history(state, &params).await
        }
        "/apps-list" => api_ext::handle_apps_list(&params),
        "/chat-guests-list" => chat::handle_chat_guests_list(state, &params).await,
        "/chat-mark-read" => chat::handle_chat_mark_read(state, &params).await,
        "/chat-mark-all-read" => chat::handle_chat_mark_all_read(state, &params).await,
        "/chat-delete-message" => chat::handle_chat_delete_message(state, &params).await,
        // ── CRM ──
        "/crm/customer" if *method == Method::POST || *method == Method::PUT => {
            state.crm_handler.handle_create_or_update(&params)
        }
        "/crm/customer" if *method == Method::GET => {
            state.crm_handler.handle_customer_detail(&params, auth.as_ref())
        }
        "/crm/customers" => state.crm_handler.handle_customers(&params, auth.as_ref()),
        "/crm/customer/assign" => state.crm_handler.handle_assign(&params),
        "/crm/customer/status" => state.crm_handler.handle_status(&params),
        "/crm/customer/purchase" => state.crm_handler.handle_purchase(&params),
        "/crm/customer/contact" => state.crm_handler.handle_contact(&params),
        "/crm/birthdays" => state.crm_handler.handle_birthdays(&params),
        "/crm/stats" => state.crm_handler.handle_crm_stats(&params, auth.as_ref()),
        "/crm/website-stats" => state.crm_handler.handle_website_stats(&params),
        "/crm/ads-stats" => state.crm_handler.handle_ads_stats(&params),
        "/crm/ads" if *method == Method::POST => state.crm_handler.handle_create_ad(&params),
        "/crm/ads" => state.crm_handler.handle_get_ads(&params),
        "/crm/analytics" => state.crm_handler.handle_analytics(&params),
        "/crm/insights" => state.crm_handler.handle_insights(&params),
        // ── AI local + streaming annotations ──
        p if p.starts_with("/ai-local") => ai_local_dispatch(state, p, &params).await,
        p if p.contains("ai-code-stream")
            || p.contains("ai-assistant")
            || p.starts_with("/ai/")
            || p == "/ai-metrics-dashboard"
            || p == "/ai-prompt-debug"
            || p.starts_with("/ai-prompt-debug/")
            || p == "/ai-orchestration-preview"
            || p == "/ai-quality-check"
            || p == "/ai-token-optimize"
            || p == "/ai-conversation-history"
            || p == "/ai-assistant-session-history"
            || p == "/ai-assistant-session-delete"
            || p.starts_with("/ai-code-stream/")
            || p == "/ai-tasks/active" =>
        {
            ai_dispatch(state, p, &params).await
        }
        other => {
            let mut r = StandardResponse::new();
            r.set("code", 404);
            r.set("success", false);
            r.set("message", format!("Unsupported API path: {other}"));
            warn!("Unsupported path: {other}");
            r
        }
    };

    response.into_response()
}

async fn ai_local_dispatch(state: &AppState, path: &str, _params: &Map<String, Value>) -> StandardResponse {
    use crate::services::ai::AiLocalOpsService;
    let svc = AiLocalOpsService::new(state.config.clone());
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    if path.ends_with("/health") {
        r.set("result", svc.health());
    } else if path.ends_with("/models") {
        r.set("result", svc.list_models());
    } else if path.ends_with("/services") {
        r.set("result", crate::services::ai::registry::list_services());
    } else {
        r.set("message", format!("AI local endpoint: {path}"));
    }
    r
}

async fn ai_dispatch(state: &AppState, path: &str, params: &Map<String, Value>) -> StandardResponse {
    crate::controllers::api_spring::handle(state, path, params)
}

async fn monitoring_health(State(state): State<AppState>) -> impl IntoResponse {
    (
        StatusCode::OK,
        axum::Json(json!({
            "status": "UP",
            "backend": "rust",
            "port": state.config.server.port,
            "data_dir": state.config.data_dir.display().to_string(),
        })),
    )
}

async fn system_check() -> impl IntoResponse {
    axum::Json(json!({
        "rust": true,
        "rocksdb": true,
        "requirements_met": true,
    }))
}

fn inject_request_meta(params: &mut Map<String, Value>, method: &Method) {
    params.insert("_method".into(), Value::String(method.to_string()));
}

async fn parse_request_params(req: Request<Body>) -> Map<String, Value> {
    let (parts, body) = req.into_parts();
    let mut params = Map::new();

    if let Some(query) = parts.uri.query() {
        if let Ok(q) = serde_urlencoded::from_str::<std::collections::HashMap<String, String>>(query) {
            for (k, v) in q {
                params.insert(k, Value::String(v));
            }
        }
    }

    let bytes = axum::body::to_bytes(body, 64 * 1024 * 1024)
        .await
        .unwrap_or_default();

    if !bytes.is_empty() {
        let ct = parts
            .headers
            .get(header::CONTENT_TYPE)
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        if ct.contains("application/json") {
            if let Ok(Value::Object(map)) = serde_json::from_slice(&bytes) {
                params.extend(map);
            }
        } else if ct.contains("application/x-www-form-urlencoded") {
            if let Ok(form) =
                serde_urlencoded::from_bytes::<std::collections::HashMap<String, String>>(&bytes)
            {
                for (k, v) in form {
                    params.insert(k, Value::String(v));
                }
            }
        }
    }

    if let Some(auth) = parts.headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok()) {
        params.insert("authorization".into(), Value::String(auth.into()));
    }
    if let Some(token) = parts.headers.get("csm-token").and_then(|h| h.to_str().ok()) {
        params.insert("csm-token".into(), Value::String(token.into()));
    }
    if let Some(rt) = parts.headers.get("x-refresh-token").and_then(|h| h.to_str().ok()) {
        params.insert("refreshToken".into(), Value::String(rt.into()));
    }
    if !params.contains_key("refreshToken") {
        if let Some(rt) = cookie_value(&parts.headers, "refreshToken") {
            params.insert("refreshToken".into(), Value::String(rt));
        }
    }
    if let Some(ua) = parts
        .headers
        .get(header::USER_AGENT)
        .and_then(|h| h.to_str().ok())
    {
        params.insert("_user_agent".into(), Value::String(ua.into()));
    }
    let client_ip = parts
        .headers
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| {
            parts
                .headers
                .get("x-real-ip")
                .and_then(|h| h.to_str().ok())
                .map(String::from)
        });
    if let Some(ip) = client_ip {
        params.insert("_client_ip".into(), Value::String(ip));
    }
    // Inject host/origin/referer so handlers can decide SameSite/Domain like Java backend
    if let Some(h) = extract_host(&parts.headers) {
        params.insert("_host".into(), Value::String(h));
    }
    if let Some(origin) = parts.headers.get("origin").and_then(|h| h.to_str().ok()) {
        params.insert("_origin".into(), Value::String(origin.into()));
    }
    if let Some(referer) = parts.headers.get("referer").and_then(|h| h.to_str().ok()) {
        params.insert("_referer".into(), Value::String(referer.into()));
    }

    params
}

fn cookie_value(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
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
