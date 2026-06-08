use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use tokio::fs;
use tracing::info;

use crate::state::AppState;

// Matches Java STATIC_EXTENSIONS exactly (no txt/pdf/zip — those don't short-circuit to 404 in Java)
const STATIC_EXTENSIONS: &[&str] = &[
    "js", "css", "png", "jpg", "jpeg", "gif", "svg", "ico",
    "woff", "woff2", "ttf", "eot", "webp", "mp4", "webm", "mov",
    "m4v", "json", "xml", "map",
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
    // X-Forwarded-Host first (nginx proxy), then Host — mirrors Java
    let host = req.headers()
        .get("x-forwarded-host")
        .and_then(|h| h.to_str().ok())
        .filter(|h| !h.is_empty())
        .map(|h| h.to_lowercase())
        .or_else(|| {
            req.headers()
                .get(axum::http::header::HOST)
                .and_then(|h| h.to_str().ok())
                .map(|h| h.to_lowercase())
        });
    handle_web_path(&state, &uri, host.as_deref()).await
}

pub async fn handle_web_path(state: &AppState, uri: &str, host: Option<&str>) -> Response {
    // Strip trailing slash (Java's normalizeIncomingWebPath)
    let uri = if uri.len() > 1 && uri.ends_with('/') {
        uri.trim_end_matches('/')
    } else {
        uri
    };

    match uri {
        "/robots.txt" => return text_response(&generate_robots_txt(host)),
        "/sitemap.xml" => return xml_response(&crate::web::ssr::build_sitemap(state, host)),
        "/feed.xml" => return serve_feed_xml(state, host).await,
        "/version.json" => return serve_version_json(state, host).await,
        "/manifest.json" => return serve_manifest_json(state).await,
        p if p.starts_with("/app_images/") => return serve_static_path(state, p, None).await,
        _ => {}
    }

    // Static assets (.js, .css, images, fonts, etc.): try to serve file, never return SSR HTML.
    // Mirrors Java: getStaticFile(path) → serve; else if isStaticFile → 404.
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

/// Dynamic robots.txt — mirrors Java generateDynamicRobotsTxt.
fn generate_robots_txt(host: Option<&str>) -> String {
    let mut txt = String::from(
        "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /upload.shtml\n\n",
    );
    if let Some(h) = host {
        txt.push_str(&format!("Sitemap: https://{h}/sitemap.xml\n"));
        txt.push_str(&format!("Sitemap: https://{h}/feed.xml\n"));
    }
    txt
}

/// RSS feed — mirrors Java generateRssFeed.
pub async fn serve_feed_xml(state: &AppState, host: Option<&str>) -> Response {
    let domain = crate::web::ssr::domain_from_host(host);
    let base_url = format!("https://{}", host.unwrap_or(domain.as_str()));

    let mut feed = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <rss version=\"2.0\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\">\n\
           <channel>\n\
             <title>{}</title>\n\
             <link>{base_url}</link>\n\
             <description>Latest content updates</description>\n\
             <language>vi</language>\n",
        xml_escape(&domain),
    );

    let route_configs = load_route_configs(state, &domain);
    let mut item_count = 0;
    'outer: for (app_id, tbl_detail) in &route_configs {
        if tbl_detail.is_empty() { continue; }
        let filter = crate::model::SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                crate::model::SearchFilter::eq("status", "active"),
                crate::model::SearchFilter {
                    field: "domain".into(),
                    filter_type: "like".into(),
                    value: serde_json::Value::String(domain.clone()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let result = state.record_manager.filter(app_id, tbl_detail, &filter);
        let rows = result.get("rows").or_else(|| result.get("data"))
            .and_then(|v| v.as_array()).cloned().unwrap_or_default();
        for row in &rows {
            if item_count >= 50 { break 'outer; }
            let title = row.get("title").or_else(|| row.get("title_vi"))
                .and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let slug = row.get("slug").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if title.is_empty() || slug.is_empty() { continue; }
            let slug_clean = slug.trim_end_matches(".shtml");
            let svc_type = row.get("service_type").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let path = if svc_type.is_empty() {
                format!("/{slug_clean}")
            } else {
                format!("/{svc_type}/{slug_clean}")
            };
            let url = format!("{base_url}{path}");
            let lastmod = ["updated_at", "publish_date", "modified_at", "created_at"]
                .iter()
                .find_map(|k| row.get(*k)?.as_str().filter(|s| !s.is_empty()))
                .map(|s| &s[..s.len().min(10)])
                .unwrap_or("");
            feed.push_str(&format!(
                "    <item>\n      <title><![CDATA[{title}]]></title>\n      <link>{url}</link>\n      <guid>{url}</guid>\n"
            ));
            if !lastmod.is_empty() {
                feed.push_str(&format!("      <pubDate>{lastmod}</pubDate>\n"));
            }
            feed.push_str("    </item>\n");
            item_count += 1;
        }
    }
    feed.push_str("  </channel>\n</rss>");

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/rss+xml; charset=utf-8")],
        feed,
    ).into_response()
}

fn load_route_configs(state: &AppState, domain: &str) -> Vec<(String, String)> {
    let filter = crate::model::SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            crate::model::SearchFilter::eq("domain_name", domain),
            crate::model::SearchFilter::eq("run", 1i64),
        ],
        ..Default::default()
    };
    let result = state.record_manager.filter("csm", "sys_la_routers", &filter);
    result.get("rows").or_else(|| result.get("data"))
        .and_then(|v| v.as_array())
        .map(|rows| {
            rows.iter().filter_map(|row| {
                let app_id = row.get("app_id")?.as_str()?.trim().to_string();
                let tbl_detail = row.get("tbl_service_detail")?.as_str()?.trim().to_string();
                if app_id.is_empty() { return None; }
                Some((app_id, tbl_detail))
            }).collect()
        })
        .unwrap_or_default()
}

/// Mirrors Java serveVersionJson:
/// tries {rp_index}/version.json → version.json → {rp_index}/index.html mtime
async fn serve_version_json(state: &AppState, host: Option<&str>) -> Response {
    let rp_index = crate::web::ssr::resolve_rp_index_pub(state, host);

    let json_headers = [
        (header::CONTENT_TYPE, "application/json; charset=utf-8"),
        (header::CACHE_CONTROL, "no-cache"),
    ];

    if !rp_index.is_empty() {
        let p = format!("{rp_index}/version.json");
        if let Some(path) = state.record_manager.get_static_file(&p) {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                return (StatusCode::OK, json_headers, bytes).into_response();
            }
        }
    }

    if let Some(path) = state.record_manager.get_static_file("version.json") {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            return (StatusCode::OK, json_headers, bytes).into_response();
        }
    }

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
                    return (StatusCode::OK, json_headers, payload.into_bytes()).into_response();
                }
            }
        }
    }

    (StatusCode::NOT_FOUND, "version.json not found").into_response()
}

/// Mirrors Java serveWebManifestJson: tries root manifest.json only (no rp_index prefix).
/// Returns 404 if not found — browser treats missing manifest gracefully.
async fn serve_manifest_json(state: &AppState) -> Response {
    let json_headers = [
        (header::CONTENT_TYPE, "application/manifest+json; charset=utf-8"),
        (header::CACHE_CONTROL, "public, max-age=86400"),
    ];

    if let Some(path) = state.record_manager.get_static_file("manifest.json") {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            return (StatusCode::OK, json_headers, bytes).into_response();
        }
    }

    // Minimal fallback so DevTools doesn't show a parse error
    let minimal = r##"{"name":"CSM","short_name":"CSM","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":"#000000","icons":[]}"##;
    (StatusCode::OK, json_headers, minimal.as_bytes().to_vec()).into_response()
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn text_response(body: &str) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        body.to_string(),
    )
        .into_response()
}

fn xml_response(body: &str) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
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
