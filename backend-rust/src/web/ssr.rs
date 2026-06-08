use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde_json::{json, Value};
use std::sync::LazyLock;
use tracing::info;

use crate::model::SearchFilter;
use crate::state::AppState;

struct CacheEntry<T> {
    data: T,
    expires: Instant,
}

static SSR_CACHE: LazyLock<DashMap<String, CacheEntry<String>>> = LazyLock::new(DashMap::new);
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);

// ─── Route struct (mirrors sys_la_routers fields used for SSR) ────────────────

#[derive(Default, Clone)]
pub struct ResolvedRoute {
    pub rp_index: String,
    pub app_id: String,
    pub tbl_services: String,
    pub tbl_service_detail: String,
    pub f_title: String,
    pub f_keyword: String,
    pub f_logo: String,
    pub app_type: String,
    pub domain: String,
}

impl ResolvedRoute {
    fn from_row(row: &serde_json::Map<String, Value>) -> Self {
        let s = |k: &str| {
            row.get(k)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim_matches('/')
                .trim()
                .to_string()
        };
        ResolvedRoute {
            rp_index: s("rp_index"),
            app_id: s("app_id"),
            tbl_services: s("tbl_services"),
            tbl_service_detail: s("tbl_service_detail"),
            f_title: s("f_title"),
            f_keyword: s("f_keyword"),
            f_logo: s("f_logo"),
            app_type: s("app_type"),
            domain: s("domain_name"),
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

/// Expose rp_index lookup for router.rs (static asset fallback).
/// Mirrors Java resolveRpIndexForDomain: only returns routes where rp_index is actually set.
/// Does NOT use resolve_route() because Priority 1 may return a route with empty rp_index.
pub fn resolve_rp_index_pub(state: &AppState, host: Option<&str>) -> String {
    let domain = extract_domain(host);
    if domain.is_empty() {
        return String::new();
    }
    let filter = SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            SearchFilter::eq("domain_name", domain.as_str()),
            SearchFilter::eq("f_case", ""),
            SearchFilter { field: "rp_index".into(), filter_type: "isnotnull".into(), ..Default::default() },
            SearchFilter { field: "rp_index".into(), filter_type: "noteq".into(), value: Value::String(String::new()), ..Default::default() },
            SearchFilter::eq("run", 1i64),
        ],
        ..Default::default()
    };
    let result = state.record_manager.filter("csm", "sys_la_routers", &filter);
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

// ─── Core SSR builder ─────────────────────────────────────────────────────────

fn build_ssr_html(state: &AppState, uri: &str, host: Option<&str>) -> String {
    let route = resolve_route(state, host, uri);
    let domain = extract_domain(host);

    let rp_index = &route.rp_index;
    let index_path = if rp_index.is_empty() {
        "index.html".to_string()
    } else {
        format!("{rp_index}/index.html")
    };

    let protocol = "https";
    let host_str = host.unwrap_or(&domain);
    let canonical = format!("{protocol}://{host_str}{uri}");

    let page_title = if route.f_title.is_empty() { "CSM".to_string() } else { route.f_title.clone() };
    let page_description = route.f_keyword.clone();
    let og_image = if route.f_logo.is_empty() {
        String::new()
    } else if route.f_logo.starts_with("http") {
        route.f_logo.clone()
    } else {
        format!("{protocol}://{host_str}/{}", route.f_logo.trim_start_matches('/'))
    };

    // Load categories from tbl_services
    let categories = load_categories(state, &route, &domain);

    // Build SSR route map
    let ssr_routes = json!({ uri: { "title": page_title, "description": page_description } });

    // Build window globals — same names Java uses
    let app_config = json!({ "f_logo": og_image, "f_title": page_title });
    let initial_data = json!({
        "pageTitle": page_title,
        "pageDescription": page_description,
        "canonicalUrl": canonical,
        "ogImage": og_image,
        "currentPagePath": uri,
        "app_id": route.app_id,
    });

    let scripts = build_scripts(&app_config, &initial_data, &categories, &ssr_routes);

    if let Some(file_path) = state.record_manager.get_static_file(&index_path) {
        if let Ok(mut html) = std::fs::read_to_string(&file_path) {
            inject_into_html(&mut html, &scripts);
            return html;
        }
    }

    info!("SSR fallback (index.html not found for rp_index={})", rp_index);
    fallback_html(&page_title, uri, &route.app_id, &scripts)
}

// ─── Route resolution — 3 priorities (mirrors Java handleWebRequest) ──────────

fn resolve_route(state: &AppState, host: Option<&str>, path: &str) -> ResolvedRoute {
    let domain = extract_domain(host);
    if domain.is_empty() {
        return ResolvedRoute::default();
    }

    // fCase: strip .shtml, normalize "/" to ""
    let f_case = {
        let p = path.replace(".shtml", "").trim().to_string();
        if p == "/" { String::new() } else { p }
    };

    // Priority 1: exact domain + f_case
    if let Some(route) = query_route(state, &[
        SearchFilter::eq("domain_name", domain.as_str()),
        SearchFilter::eq("f_case", f_case.as_str()),
        SearchFilter::eq("run", 1i64),
    ]) {
        return route;
    }

    // Priority 2: domain + f_case="" + rp_index set (React SSR catch-all)
    if let Some(route) = query_route(state, &[
        SearchFilter::eq("domain_name", domain.as_str()),
        SearchFilter::eq("f_case", ""),
        SearchFilter { field: "rp_index".into(), filter_type: "isnotnull".into(), ..Default::default() },
        SearchFilter { field: "rp_index".into(), filter_type: "noteq".into(), value: Value::String("".into()), ..Default::default() },
        SearchFilter::eq("run", 1i64),
    ]) {
        return route;
    }

    // Priority 3a: domain + app_type=web
    if let Some(route) = query_route(state, &[
        SearchFilter::eq("domain_name", domain.as_str()),
        SearchFilter::eq("app_type", "web"),
        SearchFilter::eq("run", 1i64),
    ]) {
        return route;
    }

    // Priority 3b: global default (domain_name="" f_case="default")
    if let Some(route) = query_route(state, &[
        SearchFilter::eq("domain_name", ""),
        SearchFilter::eq("f_case", "default"),
        SearchFilter::eq("run", 1i64),
    ]) {
        return route;
    }

    ResolvedRoute { domain: domain.clone(), ..Default::default() }
}

fn query_route(state: &AppState, conditions: &[SearchFilter]) -> Option<ResolvedRoute> {
    let filter = SearchFilter {
        operator: "AND".into(),
        conditions: conditions.to_vec(),
        ..Default::default()
    };
    let result = state.record_manager.filter("csm", "sys_la_routers", &filter);
    let rows = result
        .get("rows")
        .or_else(|| result.get("data"))
        .and_then(|v| v.as_array())?;
    let row = rows.first()?.as_object()?;
    Some(ResolvedRoute::from_row(row))
}

// ─── Categories (mirrors Java: filter tbl_services by status=active AND domain like domain) ─

fn load_categories(state: &AppState, route: &ResolvedRoute, domain: &str) -> Value {
    if route.app_id.is_empty() || route.tbl_services.is_empty() {
        return json!([]);
    }
    let filter = SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            SearchFilter::eq("status", "active"),
            SearchFilter { field: "domain".into(), filter_type: "like".into(), value: Value::String(domain.to_string()), ..Default::default() },
        ],
        ..Default::default()
    };
    let result = state.record_manager.filter(&route.app_id, &route.tbl_services, &filter);
    let rows = result
        .get("rows")
        .or_else(|| result.get("data"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // Map to fields frontend expects (same as Java catObj)
    let cats: Vec<Value> = rows.iter().filter_map(|r| {
        let obj = r.as_object()?;
        let s = |k: &str| obj.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let b = |k: &str| -> bool {
            match obj.get(k) {
                Some(Value::Bool(b)) => *b,
                Some(Value::Number(n)) => n.as_i64().unwrap_or(0) == 1,
                Some(Value::String(s)) => s.eq_ignore_ascii_case("true") || s == "1",
                _ => false,
            }
        };
        Some(json!({
            "slug": s("slug"),
            "service_code": s("service_code"),
            "category": s("category"),
            "is_service": b("is_service"),
            "is_group_slug": b("is_group_slug"),
            "group_slug": s("group_slug"),
            "attributes_icon": s("attributes_icon"),
            "attributes_color": s("attributes_color"),
            "attributes_description": s("attributes_description"),
        }))
    }).collect();

    Value::Array(cats)
}

// ─── HTML injection helpers ────────────────────────────────────────────────────

fn build_scripts(
    app_config: &Value,
    initial_data: &Value,
    categories: &Value,
    ssr_routes: &Value,
) -> String {
    let safe = |v: &Value| serde_json::to_string(v).unwrap_or_else(|_| "{}".into())
        .replace("</", "<\\/");

    format!(
        "<script>window.__APP_CONFIG__={ac};</script>\
         <script>window.__INITIAL_REACT_DATA__={id};</script>\
         <script>window.__SSR_WEBSITE_CATEGORIES__={cats};</script>\
         <script>window.__SSR_WEBSITE_ROUTES__={routes};</script>\
         <script>window.__SSR_DYNAMIC_CODE_TEMPLATES__={{}};</script>",
        ac = safe(app_config),
        id = safe(initial_data),
        cats = safe(categories),
        routes = safe(ssr_routes),
    )
}

fn inject_into_html(html: &mut String, scripts: &str) {
    let lower = html.to_lowercase();
    if let Some(pos) = lower.find("</head>") {
        html.insert_str(pos, scripts);
    } else if let Some(pos) = lower.find("</body>") {
        html.insert_str(pos, scripts);
    } else {
        html.push_str(scripts);
    }
}

fn fallback_html(title: &str, uri: &str, app_id: &str, scripts: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  {scripts}
</head>
<body><div id="root"></div><script type="module" src="/assets/main.js"></script></body>
</html>"#
    )
}

// ─── Domain helpers ────────────────────────────────────────────────────────────

fn extract_domain(host: Option<&str>) -> String {
    let h = match host {
        Some(h) if !h.is_empty() => h,
        _ => return String::new(),
    };
    h.trim_start_matches("www.")
        .split(':')
        .next()
        .unwrap_or(h)
        .to_lowercase()
}

/// Public wrapper so router.rs and api/router.rs can extract domain without duplicating logic.
pub fn domain_from_host(host: Option<&str>) -> String {
    extract_domain(host)
}

// ─── Sitemap builder — per-domain, mirrors Java generateSitemapXml ────────────

pub fn build_sitemap(state: &AppState, host: Option<&str>) -> String {
    let domain = extract_domain(host);
    let base_url = format!("https://{}", host.unwrap_or(domain.as_str()));

    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    );
    xml.push_str(&sitemap_url_entry(&format!("{base_url}/"), None, "daily", "1.0"));

    let route_filter = SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            SearchFilter::eq("domain_name", domain.as_str()),
            SearchFilter::eq("run", 1i64),
        ],
        ..Default::default()
    };
    let route_result = state.record_manager.filter("csm", "sys_la_routers", &route_filter);
    let route_rows = route_result
        .get("rows")
        .or_else(|| route_result.get("data"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut seen = std::collections::HashSet::new();
    seen.insert("/".to_string());

    for row in &route_rows {
        let s = |k: &str| {
            row.get(k)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string()
        };
        let app_id = s("app_id");
        let tbl_services = s("tbl_services");
        let tbl_detail = s("tbl_service_detail");
        if app_id.is_empty() {
            continue;
        }

        let like_domain = SearchFilter {
            field: "domain".into(),
            filter_type: "like".into(),
            value: Value::String(domain.clone()),
            ..Default::default()
        };

        // Category paths from tbl_services
        if !tbl_services.is_empty() {
            let cat_filter = SearchFilter {
                operator: "AND".into(),
                conditions: vec![SearchFilter::eq("status", "active"), like_domain.clone()],
                ..Default::default()
            };
            let cats = state.record_manager.filter(&app_id, &tbl_services, &cat_filter);
            if let Some(rows) = cats
                .get("rows")
                .or_else(|| cats.get("data"))
                .and_then(|v| v.as_array())
            {
                for r in rows {
                    let slug = r
                        .get("slug")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim_end_matches(".shtml")
                        .trim()
                        .to_string();
                    if slug.is_empty() {
                        continue;
                    }
                    let path = format!("/{slug}");
                    if seen.insert(path.clone()) {
                        let lm = sitemap_lastmod(r);
                        xml.push_str(&sitemap_url_entry(
                            &format!("{base_url}{path}"),
                            lm.as_deref(),
                            "weekly",
                            "0.8",
                        ));
                    }
                }
            }
        }

        // Detail paths from tbl_service_detail
        if !tbl_detail.is_empty() {
            let det_filter = SearchFilter {
                operator: "AND".into(),
                conditions: vec![SearchFilter::eq("status", "active"), like_domain.clone()],
                ..Default::default()
            };
            let details = state.record_manager.filter(&app_id, &tbl_detail, &det_filter);
            if let Some(rows) = details
                .get("rows")
                .or_else(|| details.get("data"))
                .and_then(|v| v.as_array())
            {
                for r in rows {
                    let svc_type = r
                        .get("service_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    let slug = r
                        .get("slug")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim_end_matches(".shtml")
                        .trim()
                        .to_string();
                    if slug.is_empty() {
                        continue;
                    }
                    let path = if svc_type.is_empty() {
                        format!("/{slug}")
                    } else {
                        format!("/{svc_type}/{slug}")
                    };
                    if seen.insert(path.clone()) {
                        let lm = sitemap_lastmod(r);
                        xml.push_str(&sitemap_url_entry(
                            &format!("{base_url}{path}"),
                            lm.as_deref(),
                            "weekly",
                            "0.8",
                        ));
                    }
                }
            }
        }
    }

    xml.push_str("\n</urlset>");
    xml
}

fn sitemap_url_entry(url: &str, lastmod: Option<&str>, changefreq: &str, priority: &str) -> String {
    let mut s = format!(
        "\n  <url>\n    <loc>{url}</loc>\n"
    );
    if let Some(lm) = lastmod.filter(|s| !s.is_empty()) {
        s.push_str(&format!("    <lastmod>{}</lastmod>\n", &lm[..lm.len().min(10)]));
    }
    s.push_str(&format!(
        "    <changefreq>{changefreq}</changefreq>\n    <priority>{priority}</priority>\n  </url>"
    ));
    s
}

fn sitemap_lastmod(row: &Value) -> Option<String> {
    for key in &["updated_at", "publish_date", "modified_at", "updatedAt", "created_at"] {
        if let Some(v) = row.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return Some(v.to_string());
        }
    }
    None
}
