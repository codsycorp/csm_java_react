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

    format!(
        r#"<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <script>window.__CSM_SSR__={{uri:"{uri}",component:"{component}",appId:"{app_id}"}}</script>
</head>
<body>
  <div id="root" data-uri="{uri}" data-component="{component}"></div>
  <script type="module" src="/assets/main.js"></script>
</body>
</html>"#
    )
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
