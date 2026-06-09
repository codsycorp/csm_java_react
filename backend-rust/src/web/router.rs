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
    let query_str = req.uri().query().map(|q| q.to_string()).unwrap_or_default();
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
    handle_web_path(&state, &uri, host.as_deref(), &query_str).await
}

pub async fn handle_web_path(state: &AppState, uri: &str, host: Option<&str>, query_str: &str) -> Response {
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
        "/page_struct_js.shtml" => return serve_page_struct_js(state, query_str).await,
        "/ssr/categories" => return serve_ssr_categories(state, host, query_str).await,
        "/ssr/tags" => return serve_ssr_tags(state, host, query_str).await,
        "/ssr/reviews" => return serve_ssr_reviews(state, host, query_str).await,
        "/kqxs/station" => return serve_kqxs_station(state, query_str).await,
        "/kqxs/stations" => return serve_kqxs_stations(state, query_str).await,
        "/kqxs/table-range" => return serve_kqxs_table_range(state, query_str).await,
        "/kqxs/tonghop" => return serve_kqxs_tonghop(state, query_str).await,
        "/vpts" => return serve_vpts(state, query_str).await,
        p if p.starts_with("/images.shtml") => return serve_images_shtml(state, query_str).await,
        p if p.starts_with("/app_images/") => return serve_static_path(state, p, None).await,
        _ => {}
    }

    // GET /upload.shtml?cmd=list or cmd=removeimg
    if uri == "/upload.shtml" || uri == "/upload" {
        let cmd = qs_param(query_str, "cmd");
        if cmd == "list" || cmd == "removeimg" {
            return serve_upload_cmd(state, query_str).await;
        }
    }

    // Static assets (.js, .css, images, fonts, etc.): try to serve file, never return SSR HTML.
    // Mirrors Java: getStaticFile(path) → serve; else if isStaticFile → 404.
    if has_static_extension(uri) {
        let rp_index = crate::web::ssr::resolve_rp_index_pub(state, host);
        return serve_static_path(state, uri, Some(&rp_index)).await;
    }

    info!("SSR route: {uri}");
    html_response(&crate::web::ssr::render_page(state, uri, host, query_str))
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
    // Long-lived cache for hashed static assets, short-lived for others
    let cache = if path.extension().map(|e| matches!(e.to_str(), Some("js" | "css" | "woff2" | "woff"))).unwrap_or(false) {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=86400"
    };
    if let Ok(v) = cache.parse() {
        headers.insert(header::CACHE_CONTROL, v);
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
            let lastmod = crate::util::resolve_lastmod_from_row(row)
                .map(|s| crate::util::extract_date_only(&s))
                .unwrap_or_default();
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
/// Returns minimal fallback so browser DevTools doesn't show a parse error.
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

    let minimal = r##"{"name":"CSM","short_name":"CSM","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":"#000000","icons":[]}"##;
    (StatusCode::OK, json_headers, minimal.as_bytes().to_vec()).into_response()
}

/// Mirrors Java servePageStructJs: query csm/sys_autos for p_name=name, p_type=0,
/// decrypt p_code, return as text/javascript.
async fn serve_page_struct_js(state: &AppState, query_str: &str) -> Response {
    let name = qs_param(query_str, "name");
    let apt = qs_param(query_str, "apt");
    let apd = qs_param(query_str, "apd");

    // Primary path: apt + apd present → query {apd}/index (or {name}/index) by id=apt
    // Java: if apd != "false" use apd as app_id, else use name as app_id; get "struct" field (Base64-encoded)
    if !apt.is_empty() && !apd.is_empty() {
        let app_id_for_struct = if apd != "false" { apd.as_str() } else { name.as_str() };
        if !app_id_for_struct.is_empty() {
            let filter = crate::model::SearchFilter::eq("id", apt.as_str());
            let result = state.record_manager.filter(app_id_for_struct, "index", &filter);
            if let Some(rows) = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()) {
                if let Some(first) = rows.first() {
                    let struct_b64 = first.get("struct").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                    if !struct_b64.is_empty() {
                        if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &struct_b64) {
                            return (
                                StatusCode::OK,
                                [(header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
                                 (header::CACHE_CONTROL, "public, max-age=300")],
                                bytes,
                            ).into_response();
                        }
                    }
                }
            }
        }
    }

    // Fallback: query csm/sys_autos by p_name=name AND p_type=0, decrypt p_code
    if name.is_empty() {
        return (StatusCode::OK, [(header::CONTENT_TYPE, "text/javascript")], Vec::<u8>::new()).into_response();
    }
    let filter = crate::model::SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            crate::model::SearchFilter::eq("p_name", name.as_str()),
            crate::model::SearchFilter::eq("p_type", 0i64),
        ],
        ..Default::default()
    };
    let result = state.record_manager.filter("csm", "sys_autos", &filter);
    if let Some(rows) = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()) {
        if let Some(first) = rows.first() {
            let p_code = first.get("p_code").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !p_code.is_empty() {
                let js = state.record_manager.csm_decrypt(&p_code).unwrap_or(p_code);
                return (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
                     (header::CACHE_CONTROL, "public, max-age=300")],
                    js,
                ).into_response();
            }
        }
    }

    (StatusCode::OK, [(header::CONTENT_TYPE, "text/javascript")], Vec::<u8>::new()).into_response()
}

/// Mirrors Java serveImage: serve image from app_images dir with ETag/304 caching.
/// Resize/quality params are accepted but not applied (no image processing lib in Rust).
async fn serve_images_shtml(state: &AppState, query_str: &str) -> Response {
    let src = qs_param(query_str, "src");
    let name = qs_param(query_str, "name");
    let rel_path = if !src.is_empty() { src } else { name };
    if rel_path.is_empty() {
        return (StatusCode::BAD_REQUEST, "src or name param required").into_response();
    }

    // Security: reject path traversal
    if rel_path.contains("..") {
        return (StatusCode::FORBIDDEN, "Invalid path").into_response();
    }

    let app_id = qs_param(query_str, "app_id");
    let file_rel = if !app_id.is_empty() {
        format!("app_images/{}/{}", app_id, rel_path.trim_start_matches('/'))
    } else {
        format!("app_images/{}", rel_path.trim_start_matches('/'))
    };

    if let Some(path) = state.record_manager.get_static_file(&file_rel) {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
            // Simple ETag from file size + path
            let etag = format!("\"{}-{}\"", bytes.len(), path.display());
            return (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime.as_str()),
                    (header::CACHE_CONTROL, "public, max-age=2592000"),
                    (header::ETAG, etag.as_str()),
                ],
                bytes,
            ).into_response();
        }
    }

    (StatusCode::NOT_FOUND, "Image not found").into_response()
}

/// Mirrors Java handleUploadCmd: GET /upload.shtml?cmd=list or cmd=removeimg.
async fn serve_upload_cmd(state: &AppState, query_str: &str) -> Response {
    let cmd = qs_param(query_str, "cmd");
    let app_id = qs_param(query_str, "app_id");
    let dir = qs_param(query_str, "dir");

    // Security: reject path traversal in dir/name params
    let name = qs_param(query_str, "name");
    if app_id.contains("..") || dir.contains("..") || name.contains("..") {
        return json_error("Invalid path");
    }

    match cmd.as_str() {
        "list" => {
            let sub = if dir.is_empty() {
                format!("app_images/{}", app_id)
            } else {
                format!("app_images/{}/{}", app_id, dir.trim_matches('/'))
            };
            let base = state.config.data_dir.join("public").join(&sub);
            let mut files: Vec<serde_json::Value> = Vec::new();
            if let Ok(mut entries) = tokio::fs::read_dir(&base).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with('.') { continue; }
                    let ext = std::path::Path::new(&fname)
                        .extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if !matches!(ext.as_str(), "jpg"|"jpeg"|"png"|"gif"|"webp"|"svg"|"mp4"|"webm"|"mov") {
                        continue;
                    }
                    let url = format!("/{}/{}", sub.trim_start_matches('/'), fname);
                    files.push(serde_json::json!({ "name": fname, "url": url }));
                }
            }
            let count = files.len();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
                serde_json::json!({ "success": true, "data": files, "rows": count }).to_string(),
            ).into_response()
        }
        "removeimg" => {
            if name.is_empty() {
                return json_error("name param required");
            }
            let rel = format!("app_images/{}/{}", app_id, name.trim_start_matches('/'));
            let path = state.config.data_dir.join("public").join(&rel);
            match tokio::fs::remove_file(&path).await {
                Ok(_) => (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
                    r#"{"success":true}"#.to_string(),
                ).into_response(),
                Err(e) => json_error(&format!("Failed to delete: {e}")),
            }
        }
        _ => json_error("Unknown cmd"),
    }
}

// ─── /ssr/categories, /ssr/tags, /ssr/reviews ─────────────────────────────────

async fn serve_ssr_categories(state: &AppState, host: Option<&str>, _query_str: &str) -> Response {
    let domain = crate::web::ssr::domain_from_host(host);
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
    let result = state.record_manager.filter("web", "web_services", &filter);
    let rows = result.get("rows").or_else(|| result.get("data"))
        .and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let total = rows.len();
    json_ok(&serde_json::json!({ "success": true, "data": rows, "rows": rows, "total": total, "totalCount": total }))
}

async fn serve_ssr_tags(state: &AppState, host: Option<&str>, query_str: &str) -> Response {
    let domain = crate::web::ssr::domain_from_host(host);
    let service_ids_raw = qs_param(query_str, "service_ids");
    let service_ids: Vec<&str> = service_ids_raw.split(',').filter(|s| !s.is_empty()).collect();
    let mut tags_map = serde_json::Map::new();
    for service_id in service_ids {
        let filter = crate::model::SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                crate::model::SearchFilter::eq("service_id", service_id),
                crate::model::SearchFilter {
                    field: "domain".into(),
                    filter_type: "like".into(),
                    value: serde_json::Value::String(domain.clone()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let result = state.record_manager.filter("web", "web_service_tags", &filter);
        let rows = result.get("rows").or_else(|| result.get("data"))
            .and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let tags: Vec<serde_json::Value> = rows.iter()
            .filter_map(|r| r.get("tag")?.as_str().filter(|s| !s.is_empty()).map(|s| serde_json::Value::String(s.to_string())))
            .collect();
        tags_map.insert(service_id.to_string(), serde_json::Value::Array(tags));
    }
    json_ok(&serde_json::json!({ "success": true, "data": tags_map }))
}

async fn serve_ssr_reviews(state: &AppState, host: Option<&str>, query_str: &str) -> Response {
    let domain = crate::web::ssr::domain_from_host(host);
    let service_ids_raw = qs_param(query_str, "service_ids");
    let service_ids: Vec<&str> = service_ids_raw.split(',').filter(|s| !s.is_empty()).collect();
    let mut reviews_map = serde_json::Map::new();
    for service_id in service_ids {
        let filter = crate::model::SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                crate::model::SearchFilter::eq("service_id", service_id),
                crate::model::SearchFilter::eq("status", "approved"),
                crate::model::SearchFilter {
                    field: "domain".into(),
                    filter_type: "like".into(),
                    value: serde_json::Value::String(domain.clone()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let result = state.record_manager.filter("web", "web_service_reviews", &filter);
        let rows = result.get("rows").or_else(|| result.get("data"))
            .and_then(|v| v.as_array()).cloned().unwrap_or_default();
        reviews_map.insert(service_id.to_string(), serde_json::Value::Array(rows));
    }
    json_ok(&serde_json::json!({ "success": true, "data": reviews_map }))
}

// ─── /kqxs/* endpoints ────────────────────────────────────────────────────────

async fn serve_kqxs_station(state: &AppState, query_str: &str) -> Response {
    let obj_name = qs_param(query_str, "obj_name");
    let date = qs_param(query_str, "date");
    if obj_name.is_empty() || !obj_name.starts_with("kqxs_") {
        return json_error("Invalid obj_name");
    }
    let mut conditions = vec![
        crate::model::SearchFilter::eq("status", "active"),
    ];
    if !date.is_empty() {
        conditions.push(crate::model::SearchFilter::eq("date", date.as_str()));
    }
    let filter = crate::model::SearchFilter { operator: "AND".into(), conditions, ..Default::default() };
    let result = state.record_manager.filter("kqxs", &obj_name, &filter);
    let rows = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    json_ok(&serde_json::json!({ "success": true, "data": rows, "rows": rows, "total": rows.len() }))
}

async fn serve_kqxs_stations(state: &AppState, query_str: &str) -> Response {
    let mien = qs_param(query_str, "mien");
    let thu = qs_param(query_str, "thu");
    let mut conditions = vec![];
    if !mien.is_empty() { conditions.push(crate::model::SearchFilter::eq("mien", mien.as_str())); }
    if !thu.is_empty() { conditions.push(crate::model::SearchFilter::eq("thu", thu.as_str())); }
    let filter = crate::model::SearchFilter { operator: "AND".into(), conditions, ..Default::default() };
    let result = state.record_manager.filter("kqxs", "kqxs_lichxoso", &filter);
    let rows = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    json_ok(&serde_json::json!({ "success": true, "data": rows, "rows": rows, "total": rows.len() }))
}

async fn serve_kqxs_table_range(state: &AppState, query_str: &str) -> Response {
    let obj_name = qs_param(query_str, "obj_name");
    let from = qs_param(query_str, "from");
    let to = qs_param(query_str, "to");
    if obj_name.is_empty() || !obj_name.starts_with("kqxs_") {
        return json_error("Invalid obj_name");
    }
    let mut conditions = vec![];
    if !from.is_empty() {
        conditions.push(crate::model::SearchFilter { field: "date".into(), filter_type: "gte".into(), value: serde_json::Value::String(from), ..Default::default() });
    }
    if !to.is_empty() {
        conditions.push(crate::model::SearchFilter { field: "date".into(), filter_type: "lte".into(), value: serde_json::Value::String(to), ..Default::default() });
    }
    let filter = crate::model::SearchFilter { operator: "AND".into(), conditions, ..Default::default() };
    let result = state.record_manager.filter("kqxs", &obj_name, &filter);
    let rows = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    json_ok(&serde_json::json!({ "success": true, "data": rows, "rows": rows, "total": rows.len() }))
}

async fn serve_kqxs_tonghop(state: &AppState, query_str: &str) -> Response {
    let ma_duoi = qs_param(query_str, "ma_duoi");
    let tu_ngay = qs_param(query_str, "tu_ngay");
    let den_ngay = qs_param(query_str, "den_ngay");
    let mut conditions = vec![];
    if !ma_duoi.is_empty() { conditions.push(crate::model::SearchFilter::eq("ma_duoi", ma_duoi.as_str())); }
    if !tu_ngay.is_empty() {
        conditions.push(crate::model::SearchFilter { field: "ngay".into(), filter_type: "gte".into(), value: serde_json::Value::String(tu_ngay), ..Default::default() });
    }
    if !den_ngay.is_empty() {
        conditions.push(crate::model::SearchFilter { field: "ngay".into(), filter_type: "lte".into(), value: serde_json::Value::String(den_ngay), ..Default::default() });
    }
    let filter = crate::model::SearchFilter { operator: "AND".into(), conditions, ..Default::default() };
    let result = state.record_manager.filter("kqxs", "kqxs_tonghop", &filter);
    let rows = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    json_ok(&serde_json::json!({ "success": true, "data": rows, "rows": rows, "total": rows.len() }))
}

async fn serve_vpts(state: &AppState, query_str: &str) -> Response {
    let obj_name = qs_param(query_str, "obj_name");
    let valid_tables = [
        "vpts_danhngon", "vpts_dongcong", "vpts_tamsat", "vpts_khongminh",
        "vpts_thapnhitruc", "vpts_nguyenbinhkhiem", "vpts_cuutinh", "vpts_gionuoclon",
        "vpts_kiethungtinhthoi", "vpts_cathungthan", "vpts_giokhongvong",
        "vpts_lucnham", "vpts_tietkhi", "vpts_saotot", "vpts_saoxau",
    ];
    if obj_name.is_empty() || !valid_tables.contains(&obj_name.as_str()) {
        return json_error("Invalid obj_name");
    }
    let filter = crate::model::SearchFilter { operator: "AND".into(), conditions: vec![], ..Default::default() };
    let result = state.record_manager.filter("vpts", &obj_name, &filter);
    let rows = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    json_ok(&serde_json::json!({ "success": true, "data": rows, "rows": rows, "total": rows.len() }))
}

fn json_ok(body: &serde_json::Value) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        body.to_string(),
    ).into_response()
}

fn json_error(msg: &str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        serde_json::json!({ "success": false, "message": msg }).to_string(),
    ).into_response()
}

/// Parse a single key from a query string (e.g. "name=foo&bar=baz").
pub fn qs_param(qs: &str, key: &str) -> String {
    for part in qs.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == key {
                return urlencoding::decode(v)
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| v.to_string());
            }
        }
    }
    String::new()
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
