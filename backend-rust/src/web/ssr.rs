use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde_json::Value;

use crate::model::SearchFilter;
use crate::state::AppState;

struct CacheEntry<T> {
    data: T,
    expires: Instant,
}

static SSR_CACHE: LazyLock<DashMap<String, CacheEntry<String>>> = LazyLock::new(DashMap::new);
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);

pub fn render_page(state: &AppState, uri: &str, host: Option<&str>) -> String {
    let cache_key = format!("{}:{}", host.unwrap_or("default"), uri);
    if let Some(entry) = SSR_CACHE.get(&cache_key) {
        if entry.expires > Instant::now() {
            return entry.data.clone();
        }
    }

    let html = build_ssr_html(state, uri, host);
    SSR_CACHE.insert(
        cache_key,
        CacheEntry {
            data: html.clone(),
            expires: Instant::now() + CACHE_TTL,
        },
    );
    html
}

fn build_ssr_html(state: &AppState, uri: &str, host: Option<&str>) -> String {
    let app_id = resolve_app_id(state, host);
    let route = match_dynamic_route(state, &app_id, uri);

    let title = route
        .as_ref()
        .and_then(|r| r.get("title").and_then(|v| v.as_str()))
        .unwrap_or("CSM");
    let component = route
        .as_ref()
        .and_then(|r| r.get("component").and_then(|v| v.as_str()))
        .unwrap_or("/");

    // Lấy rp_index từ database (giống Java resolveRpIndexForDomain)
    // rp_index là tên thư mục frontend: "admin", "lmkt", "web", ...
    let rp_index = resolve_rp_index(state, host);

    // Thử đọc index.html thực tế từ public/{rp_index}/index.html
    // Giống Java: File reactTemplateFile = recordManager.getStaticFile(rp_index + "/index.html")
    let index_path = if rp_index.is_empty() {
        "index.html".to_string()
    } else {
        format!("{rp_index}/index.html")
    };

    if let Some(file_path) = state.record_manager.get_static_file(&index_path) {
        if let Ok(mut html) = std::fs::read_to_string(&file_path) {
            // Inject SSR data vào <head> (giống Java inject templateData)
            let ssr_script = format!(
                r#"<script>window.__CSM_SSR__={{uri:"{uri}",component:"{component}",appId:"{app_id}"}};</script>"#
            );
            // Chèn trước </head>
            if let Some(pos) = html.find("</head>") {
                html.insert_str(pos, &ssr_script);
            } else {
                html.push_str(&ssr_script);
            }
            return html;
        }
    }

    // Fallback: sinh HTML tổng hợp nếu không tìm được index.html
    format!(
        r#"<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <script>window.__CSM_SSR__={{uri:"{uri}",component:"{component}",appId:"{app_id}"}};</script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/main.js"></script>
</body>
</html>"#
    )
}

/// Giống Java resolveRpIndexForDomain: tìm rp_index trong sys_la_routers theo domain
fn resolve_rp_index(state: &AppState, host: Option<&str>) -> String {
    let h = match host {
        Some(h) if !h.is_empty() => h,
        _ => return String::new(),
    };
    // Bỏ www. và port (giống Java)
    let domain = h
        .trim_start_matches("www.")
        .split(':')
        .next()
        .unwrap_or(h)
        .to_lowercase();

    // Query sys_la_routers: domain_name=domain AND f_case="" AND run=1
    // run is stored as integer 1 in Java (not string "1")
    let filter = SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            SearchFilter::eq("domain_name", domain.as_str()),
            SearchFilter::eq("f_case", ""),
            SearchFilter::eq("run", 1i64),
        ],
        ..Default::default()
    };
    let result = state.record_manager.filter("csm", "sys_la_routers", &filter);
    // Kết quả có thể nằm trong "rows" hoặc "data"
    let rows = result
        .get("rows")
        .or_else(|| result.get("data"))
        .and_then(|v| v.as_array());
    if let Some(rows) = rows {
        for row in rows {
            if let Some(rp) = row.get("rp_index").and_then(|v| v.as_str()) {
                let rp = rp.trim_matches('/').trim();
                if !rp.is_empty() {
                    return rp.to_string();
                }
            }
        }
    }
    String::new()
}

fn resolve_app_id(state: &AppState, host: Option<&str>) -> String {
    if let Some(h) = host {
        let filter = SearchFilter::eq("domain", h);
        let rec = state.record_manager.find("csm", "sys_apps", &filter);
        if let Some(id) = rec.get("app_id").and_then(|v| v.as_str()) {
            return id.to_string();
        }
    }
    "csm".into()
}

fn match_dynamic_route(state: &AppState, app_id: &str, uri: &str) -> Option<HashMap<String, Value>> {
    let filter = SearchFilter::eq("app_id", app_id);
    let page = state.record_manager.filter(app_id, "sys_la_routers", &filter);
    let routes = page.get("data").and_then(|v| v.as_array())?;

    for route in routes {
        if let Some(obj) = route.as_object() {
            let path = obj.get("path").and_then(|v| v.as_str()).unwrap_or("");
            if path == uri || uri.starts_with(&format!("{path}/")) {
                return Some(obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect());
            }
        }
    }
    None
}

pub fn build_sitemap(state: &AppState, app_id: &str) -> String {
    let filter = SearchFilter::eq("app_id", app_id);
    let page = state.record_manager.filter(app_id, "sys_la_routers", &filter);
    let mut urls = String::from(r#"<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">"#);
    if let Some(routes) = page.get("data").and_then(|v| v.as_array()) {
        for route in routes {
            if let Some(path) = route.get("path").and_then(|v| v.as_str()) {
                urls.push_str(&format!("<url><loc>https://example.com{path}</loc></url>"));
            }
        }
    }
    urls.push_str("</urlset>");
    urls
}
