use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use tokio::fs;
use tracing::info;

use crate::state::AppState;

// Same set as Java's STATIC_EXTENSIONS
const STATIC_EXTENSIONS: &[&str] = &[
    "js", "css", "png", "jpg", "jpeg", "gif", "svg", "ico",
    "woff", "woff2", "ttf", "eot", "webp", "mp4", "webm", "mov",
    "m4v", "json", "xml", "map", "txt", "pdf", "zip",
];

fn has_static_extension(uri: &str) -> bool {
    let lower = uri.to_lowercase();
    let path = lower.split('?').next().unwrap_or(&lower);
    if let Some(dot) = path.rfind('.') {
        let ext = &path[dot + 1..];
        return STATIC_EXTENSIONS.contains(&ext);
    }
    false
}

pub async fn fallback_handler(state: State<AppState>, req: Request<Body>) -> Response {
    let uri = req.uri().path().to_string();
    if uri.starts_with("/api/") {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    let host = req
        .headers()
        .get(axum::http::header::HOST)
        .and_then(|h| h.to_str().ok());
    handle_web_path(&state, &uri, host).await
}

pub async fn handle_web_path(state: &AppState, uri: &str, host: Option<&str>) -> Response {
    match uri {
        "/robots.txt" => return text_response("User-agent: *\nAllow: /\n"),
        "/sitemap.xml" => return text_response(&crate::web::ssr::build_sitemap(state, "csm")),
        "/version.json" => return serve_version_json(state, host).await,
        p if p.starts_with("/app_images/") => return serve_static_path(state, p, None).await,
        _ => {}
    }

    // Static assets (.js, .css, images, fonts, etc.): try to serve file, never return SSR HTML.
    // Mirrors Java: getStaticFile(path) → serve; else if isStaticFile → 404.
    // Also try {rp_index}/{path} as fallback in case assets live under per-domain subdir.
    if has_static_extension(uri) {
        let rp_index = crate::web::ssr::resolve_rp_index_pub(state, host);
        return serve_static_path(state, uri, Some(&rp_index)).await;
    }

    info!("SSR route: {uri}");
    html_response(&crate::web::ssr::render_page(state, uri, host))
}

/// Serve a static file. Tries `uri` first, then `{rp_index}/{uri}` as fallback.
async fn serve_static_path(state: &AppState, uri: &str, rp_index: Option<&str>) -> Response {
    let rel = uri.trim_start_matches('/');

    // Primary: {data_dir}/public/{rel}
    if let Some(path) = state.record_manager.get_static_file(rel) {
        if let Ok(bytes) = fs::read(&path).await {
            return file_response(&path, bytes);
        }
    }

    // Fallback: {data_dir}/public/{rp_index}/{rel}
    if let Some(rp) = rp_index {
        if !rp.is_empty() {
            let rp_rel = format!("{rp}/{rel}");
            if let Some(path) = state.record_manager.get_static_file(&rp_rel) {
                if let Ok(bytes) = fs::read(&path).await {
                    return file_response(&path, bytes);
                }
            }
        }
    }

    (StatusCode::NOT_FOUND, "File not found").into_response()
}

fn file_response(path: &std::path::Path, bytes: Vec<u8>) -> Response {
    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    let mut headers = axum::http::HeaderMap::new();
    if let Ok(v) = mime.parse() {
        headers.insert(header::CONTENT_TYPE, v);
    }
    (StatusCode::OK, headers, bytes).into_response()
}

pub async fn serve_static(state: &AppState, uri: &str) -> Response {
    serve_static_path(state, uri, None).await
}

/// Mirrors Java WebSpringController.serveVersionJson:
/// tries {rp_index}/version.json → version.json → derives mtime from {rp_index}/index.html
async fn serve_version_json(state: &AppState, host: Option<&str>) -> Response {
    let rp_index = crate::web::ssr::resolve_rp_index_pub(state, host);

    // 1. {rp_index}/version.json
    if !rp_index.is_empty() {
        let p = format!("{rp_index}/version.json");
        if let Some(path) = state.record_manager.get_static_file(&p) {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                return (
                    axum::http::StatusCode::OK,
                    [(header::CONTENT_TYPE, "application/json; charset=utf-8"),
                     (header::CACHE_CONTROL, "no-cache")],
                    bytes,
                ).into_response();
            }
        }
    }

    // 2. version.json at root
    if let Some(path) = state.record_manager.get_static_file("version.json") {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            return (
                axum::http::StatusCode::OK,
                [(header::CONTENT_TYPE, "application/json; charset=utf-8"),
                 (header::CACHE_CONTROL, "no-cache")],
                bytes,
            ).into_response();
        }
    }

    // 3. Derive version from index.html mtime
    if !rp_index.is_empty() {
        let idx = format!("{rp_index}/index.html");
        if let Some(path) = state.record_manager.get_static_file(&idx) {
            if let Ok(meta) = tokio::fs::metadata(&path).await {
                if let Ok(modified) = meta.modified() {
                    let ms = modified
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis();
                    let payload = format!("{{\"version\":\"{ms}\"}}");
                    return (
                        axum::http::StatusCode::OK,
                        [(header::CONTENT_TYPE, "application/json; charset=utf-8"),
                         (header::CACHE_CONTROL, "no-cache")],
                        payload.into_bytes(),
                    ).into_response();
                }
            }
        }
    }

    (axum::http::StatusCode::NOT_FOUND, "version.json not found").into_response()
}

fn text_response(body: &str) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        body.to_string(),
    )
        .into_response()
}

fn html_response(body: &str) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        body.to_string(),
    )
        .into_response()
}
