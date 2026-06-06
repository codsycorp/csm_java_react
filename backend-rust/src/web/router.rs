use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use tokio::fs;
use tracing::info;

use crate::state::AppState;


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
        "/manifest.json" => {
            return json_response(r#"{"name":"CSM"}"#);
        }
        p if p.starts_with("/app_images/") => return serve_static(state, p).await,
        _ => {}
    }

    info!("SSR route: {uri}");
    html_response(&crate::web::ssr::render_page(state, uri, host))
}

pub async fn serve_static(state: &AppState, uri: &str) -> Response {
    let rel = uri.trim_start_matches('/');
    if let Some(path) = state.record_manager.get_static_file(rel) {
        if let Ok(bytes) = fs::read(&path).await {
            let mime = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .to_string();
            let mut headers = axum::http::HeaderMap::new();
            if let Ok(v) = mime.parse() {
                headers.insert(header::CONTENT_TYPE, v);
            }
            return (StatusCode::OK, headers, bytes).into_response();
        }
    }
    (StatusCode::NOT_FOUND, "File not found").into_response()
}

fn text_response(body: &str) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        body.to_string(),
    )
        .into_response()
}

fn json_response(body: &str) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
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
