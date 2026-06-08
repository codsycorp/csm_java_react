use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde_json::{json, Map, Value};
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
    pub gsv: String,
    pub gtag: String,
}

impl ResolvedRoute {
    fn from_row(row: &serde_json::Map<String, Value>) -> Self {
        let s = |k: &str| {
            row.get(k)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string()
        };
        let s_trim = |k: &str| s(k).trim_matches('/').trim().to_string();
        ResolvedRoute {
            rp_index: s_trim("rp_index"),
            app_id: s_trim("app_id"),
            tbl_services: s_trim("tbl_services"),
            tbl_service_detail: s_trim("tbl_service_detail"),
            f_title: s("f_title"),
            f_keyword: s("f_keyword"),
            f_logo: s("f_logo"),
            app_type: s("app_type"),
            domain: s("domain_name"),
            gsv: s("gsv"),
            gtag: s("gtag"),
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

pub fn render_page(state: &AppState, uri: &str, host: Option<&str>, query_str: &str) -> String {
    // Include query_str in cache key for paginated/filtered pages
    let cache_key = if query_str.is_empty() {
        format!("{}:{}", host.unwrap_or("default"), uri)
    } else {
        format!("{}:{}?{}", host.unwrap_or("default"), uri, query_str)
    };

    if let Some(entry) = SSR_CACHE.get(&cache_key) {
        if entry.expires > Instant::now() {
            return entry.data.clone();
        }
    }

    let html = build_ssr_html(state, uri, host, query_str);
    // Only cache clean URLs to avoid cache explosion; paginated pages have short-lived data
    if query_str.is_empty() {
        SSR_CACHE.insert(
            cache_key,
            CacheEntry {
                data: html.clone(),
                expires: Instant::now() + CACHE_TTL,
            },
        );
    }
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

fn build_ssr_html(state: &AppState, uri: &str, host: Option<&str>, query_str: &str) -> String {
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

    let base_url = format!("{protocol}://{host_str}");

    // Build window.meta object — mirrors Java's Thymeleaf meta map.
    // Injected to override the unprocessed Thymeleaf default: window.meta = /*[[${meta}]]*/ {}
    let meta = json!({
        "site_name": &base_url,
        "url": &canonical,
        "gsv": &route.gsv,
        "gtag": &route.gtag,
        "title": &page_title,
        "title2": &page_title,
        "f_title": &page_title,
        "description": &page_description,
        "f_description": &page_description,
        "keywords": &page_description,
        "f_keyword": &page_description,
        "image": &og_image,
        "f_logo": &og_image,
        "og_image": &og_image,
        "id": &route.app_id,
        "app_id": &route.app_id,
    });

    // Parse query params for SSR service data + pagination
    let params = parse_qs(query_str);

    // Load categories (full fields + dedup) and dynamic code templates together
    let (categories, dynamic_templates) = load_categories_full(state, &route, &domain);

    // Build SSR route map
    let ssr_routes = json!({ uri: { "title": &page_title, "description": &page_description } });

    // Build initial data (base fields, service data merged in below)
    let mut initial_data_map = Map::new();
    initial_data_map.insert("pageTitle".into(), Value::String(page_title.clone()));
    initial_data_map.insert("pageDescription".into(), Value::String(page_description.clone()));
    initial_data_map.insert("canonicalUrl".into(), Value::String(canonical.clone()));
    initial_data_map.insert("ogImage".into(), Value::String(og_image.clone()));
    initial_data_map.insert("currentPagePath".into(), Value::String(uri.to_string()));
    initial_data_map.insert("app_id".into(), Value::String(route.app_id.clone()));

    // Inject SSR service data if route has service tables configured (mirrors Java injectServiceDetailList)
    if !route.app_id.is_empty() && !route.tbl_service_detail.is_empty() {
        // Determine service_type: query param first, then slug from path
        let service_type = params.get("service_type")
            .filter(|s| !s.is_empty())
            .cloned()
            .or_else(|| extract_slug_from_path(uri))
            .unwrap_or_default();

        let page = params.get("page").and_then(|v| v.parse::<usize>().ok()).unwrap_or(1).max(1);
        let page_size = params.get("take")
            .and_then(|v| v.parse::<usize>().ok())
            .or_else(|| params.get("pageSize").and_then(|v| v.parse().ok()))
            .unwrap_or(10)
            .min(50)
            .max(1);
        let search_q = params.get("q").map(|s| s.trim().to_string()).unwrap_or_default();

        let svc_data = load_ssr_service_data(state, &route, &domain, &service_type, page, page_size, &search_q, &params);
        for (k, v) in svc_data {
            initial_data_map.insert(k, v);
        }
    }

    let initial_data = Value::Object(initial_data_map);
    let app_config = json!({ "f_logo": og_image, "f_title": page_title });
    let scripts = build_scripts(&app_config, &initial_data, &categories, &ssr_routes, &dynamic_templates, &meta);

    if let Some(file_path) = state.record_manager.get_static_file(&index_path) {
        if let Ok(mut html) = std::fs::read_to_string(&file_path) {
            // Process Thymeleaf attributes so SEO meta tags have real values
            preprocess_html(&mut html, &page_title, &page_description, &canonical,
                &og_image, &base_url, &og_image);
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

// ─── Categories — full fields + dedup, mirrors Java catListByDomainActive ─────

/// Returns `(categories_array, dynamic_templates_map)`.
/// Categories include all Java fields: color, icon, multilingual, dynamicCodeName, etc.
/// Deduplicates by (service_code|slug) + group_slug + is_service, matching Java.
fn load_categories_full(state: &AppState, route: &ResolvedRoute, domain: &str) -> (Value, Value) {
    if route.app_id.is_empty() || route.tbl_services.is_empty() {
        return (json!([]), json!({}));
    }

    let filter = SearchFilter {
        operator: "AND".into(),
        conditions: vec![
            SearchFilter::eq("status", "active"),
            SearchFilter {
                field: "domain".into(),
                filter_type: "like".into(),
                value: Value::String(domain.to_string()),
                ..Default::default()
            },
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

    let mut cats: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut dynamic_code_names: Vec<String> = Vec::new();

    for r in &rows {
        let obj = match r.as_object() {
            Some(o) => o,
            None => continue,
        };
        let s = |k: &str| obj.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let b = |k: &str| -> bool {
            match obj.get(k) {
                Some(Value::Bool(b)) => *b,
                Some(Value::Number(n)) => n.as_i64().unwrap_or(0) == 1,
                Some(Value::String(s)) => s.eq_ignore_ascii_case("true") || s == "1",
                _ => false,
            }
        };

        let slug = s("slug");
        let service_code = s("service_code");
        let is_service = b("is_service");
        let is_group_slug = b("is_group_slug");
        let is_group_slug_default = b("is_group_slug_default");
        let group_slug = s("group_slug");

        // Dedup key mirrors Java: (service_code|slug) + group_slug + is_service
        let key_part = if !service_code.is_empty() { service_code.as_str() } else { slug.as_str() };
        let dedup_key = format!("{}|{}|{}", key_part, group_slug, if is_service { "1" } else { "0" });
        if !seen.insert(dedup_key) {
            continue;
        }

        let dynamic_code_name = s("dynamic_code_name");
        if !dynamic_code_name.is_empty() && !dynamic_code_names.contains(&dynamic_code_name) {
            dynamic_code_names.push(dynamic_code_name.clone());
        }

        // All fields Java's catObj includes
        cats.push(json!({
            "slug": slug,
            "service_code": service_code,
            "category": s("category"),
            "category_en": s("category_en"),
            "category_zh": s("category_zh"),
            "is_service": is_service,
            "is_group_slug": is_group_slug,
            "is_group_slug_default": is_group_slug_default,
            "group_slug": group_slug,
            "color": s("attributes_color"),
            "icon": s("attributes_icon"),
            "description": s("attributes_description"),
            "description_en": s("attributes_description_en"),
            "description_zh": s("attributes_description_zh"),
            "dynamicCodeName": dynamic_code_name,
            // Keep legacy field names for backwards compat with existing frontend code
            "attributes_icon": s("attributes_icon"),
            "attributes_color": s("attributes_color"),
            "attributes_description": s("attributes_description"),
        }));
    }

    let dynamic_templates = load_dynamic_code_templates(state, &dynamic_code_names);
    (Value::Array(cats), dynamic_templates)
}

/// Query csm/sys_autos for each dynamic code name, decrypt p_code, return {name: code} map.
/// Mirrors Java: getSysAuto(name, 0) → csm_decrypt(p_code).
fn load_dynamic_code_templates(state: &AppState, code_names: &[String]) -> Value {
    let mut templates = Map::new();

    for name in code_names {
        if name.is_empty() {
            continue;
        }
        let filter = SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                SearchFilter::eq("p_name", name.as_str()),
                SearchFilter::eq("p_type", 0i64),
            ],
            ..Default::default()
        };
        let result = state.record_manager.filter("csm", "sys_autos", &filter);
        if let Some(rows) = result.get("rows").or_else(|| result.get("data")).and_then(|v| v.as_array()) {
            if let Some(first) = rows.first() {
                let p_code = first.get("p_code").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                if !p_code.is_empty() {
                    // Skip if decryption fails — mirrors Java which logs a warning and skips
                    if let Ok(decrypted) = state.record_manager.csm_decrypt(&p_code) {
                        if !decrypted.is_empty() {
                            templates.insert(name.clone(), Value::String(decrypted));
                        }
                    }
                }
            }
        }
    }

    Value::Object(templates)
}

// ─── SSR service data — mirrors Java injectServiceDetailList ──────────────────

/// Load paginated service detail records for SSR page injection.
/// Mirrors Java: query tbl_service_detail with service_type + domain filters + pagination.
fn load_ssr_service_data(
    state: &AppState,
    route: &ResolvedRoute,
    domain: &str,
    service_type: &str,
    page: usize,
    page_size: usize,
    search_q: &str,
    params: &HashMap<String, String>,
) -> Map<String, Value> {
    let mut conditions: Vec<SearchFilter> = Vec::new();

    // Filter by service_type if specified
    if !service_type.is_empty() {
        conditions.push(SearchFilter::eq("service_type", service_type));
    }

    // Domain: LIKE domain OR IS NULL OR = "" (mirrors Java domain filter)
    conditions.push(SearchFilter {
        operator: "OR".into(),
        conditions: vec![
            SearchFilter {
                field: "domain".into(),
                filter_type: "like".into(),
                value: Value::String(domain.to_string()),
                ..Default::default()
            },
            SearchFilter { field: "domain".into(), filter_type: "isnull".into(), ..Default::default() },
            SearchFilter::eq("domain", ""),
        ],
        ..Default::default()
    });

    // status = active
    conditions.push(SearchFilter::eq("status", "active"));

    // Search query across title fields (mirrors Java q param)
    if !search_q.is_empty() {
        conditions.push(SearchFilter {
            operator: "OR".into(),
            conditions: vec![
                SearchFilter { field: "title".into(), filter_type: "like".into(), value: Value::String(search_q.to_string()), ..Default::default() },
                SearchFilter { field: "title_en".into(), filter_type: "like".into(), value: Value::String(search_q.to_string()), ..Default::default() },
                SearchFilter { field: "title_zh".into(), filter_type: "like".into(), value: Value::String(search_q.to_string()), ..Default::default() },
            ],
            ..Default::default()
        });
    }

    // Property-specific filters (real estate domain — mirrors Java)
    for (param_key, field_name) in &[
        ("propertyType", "property_type"),
        ("transactionType", "transaction_type"),
        ("address", "address"),
        ("legalStatus", "legal_status"),
        ("furnished", "furnished"),
    ] {
        if let Some(v) = params.get(*param_key).filter(|s| !s.is_empty()) {
            conditions.push(SearchFilter::eq(*field_name, v.as_str()));
        }
    }
    for (param_key, field_name) in &[
        ("price_min", "price"),
        ("bedrooms", "bedrooms"),
        ("bathrooms", "bathrooms"),
        ("floors", "floors"),
        ("frontWidth", "front_width"),
    ] {
        if let Some(v) = params.get(*param_key).and_then(|s| s.parse::<i64>().ok()) {
            conditions.push(SearchFilter {
                field: field_name.to_string(),
                filter_type: "gte".into(),
                value: Value::Number(v.into()),
                ..Default::default()
            });
        }
    }
    if let Some(v) = params.get("price_max").and_then(|s| s.parse::<i64>().ok()) {
        conditions.push(SearchFilter {
            field: "price".into(),
            filter_type: "lte".into(),
            value: Value::Number(v.into()),
            ..Default::default()
        });
    }

    let filter = SearchFilter {
        operator: "AND".into(),
        conditions,
        ..Default::default()
    };

    let offset = page.saturating_sub(1) * page_size;
    let result = state.record_manager.filter_with_pagination(
        &route.app_id,
        &route.tbl_service_detail,
        &filter,
        None,
        Some(offset),
        page_size,
    );

    let rows = result.get("rows").or_else(|| result.get("data"))
        .and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let total_count = result.get("totalCount").and_then(|v| v.as_i64()).unwrap_or(rows.len() as i64);
    let next_cursor = result.get("nextCursor").and_then(|v| v.as_str()).map(String::from);

    let mut data = Map::new();
    data.insert("serviceDetailList".into(), Value::Array(rows));
    data.insert("totalCount".into(), json!(total_count));
    data.insert("page".into(), json!(page));
    data.insert("pageSize".into(), json!(page_size));
    data.insert("take".into(), json!(page_size));
    data.insert("paginationMode".into(), Value::String("page".into()));
    data.insert("service_type".into(), Value::String(service_type.to_string()));
    data.insert("search_query".into(), Value::String(search_q.to_string()));
    if let Some(nc) = next_cursor {
        data.insert("nextCursor".into(), Value::String(nc.clone()));
        data.insert("lastkey".into(), Value::String(nc));
    }
    data
}

// ─── HTML injection helpers ────────────────────────────────────────────────────

fn build_scripts(
    app_config: &Value,
    initial_data: &Value,
    categories: &Value,
    ssr_routes: &Value,
    dynamic_templates: &Value,
    meta: &Value,
) -> String {
    let safe = |v: &Value| serde_json::to_string(v).unwrap_or_else(|_| "{}".into())
        .replace("</", "<\\/");

    // window.meta overrides the unprocessed Thymeleaf default: window.meta = /*[[${meta}]]*/ {}
    // window.__INITIAL_DATA__ mirrors __INITIAL_REACT_DATA__ for legacy compat (same Thymeleaf slot)
    // window.menus = [] matches Java's templateData.put("menus", new ArrayList<>())
    format!(
        "<script>window.meta={m};window.__INITIAL_DATA__={id};window.menus=[];</script>\
         <script>window.__APP_CONFIG__={ac};</script>\
         <script>window.__INITIAL_REACT_DATA__={id};</script>\
         <script>window.__SSR_WEBSITE_CATEGORIES__={cats};</script>\
         <script>window.__SSR_WEBSITE_ROUTES__={routes};</script>\
         <script>window.__SSR_DYNAMIC_CODE_TEMPLATES__={tmpl};</script>",
        m = safe(meta),
        ac = safe(app_config),
        id = safe(initial_data),
        cats = safe(categories),
        routes = safe(ssr_routes),
        tmpl = safe(dynamic_templates),
    )
}

/// Process Thymeleaf attributes in the HTML with real route values.
/// Replaces th:text, th:content, th:href on known SEO elements so crawlers see real meta.
/// Also clears unresolved th:inline="javascript" inline expressions (Thymeleaf comment syntax).
pub fn preprocess_html(html: &mut String, title: &str, description: &str, canonical: &str,
    image: &str, site_name: &str, logo: &str) {
    // <title th:text="...">fallback</title>  →  <title>Real Title</title>
    if let Some(start) = html.find("<title") {
        if let Some(end) = html[start..].find("</title>") {
            let tag_end = html[start..start + end].find('>').unwrap_or(0);
            let before = &html[..start];
            let after = &html[start + end + 8..];
            *html = format!("{}<title>{}</title>{}", before, html_esc(title), after);
        }
    }

    // Replace th:content and th:href attribute values on <meta> and <link> tags.
    // We do simple targeted replacements for the key SEO elements.
    let replace_meta = |html: &mut String, name_attr: &str, val: &str| {
        // Find <meta name="X" ... th:content="..."> and set content="val"
        // Strategy: insert content=val, remove th:content=...
        let target = format!("name=\"{}\"", name_attr);
        if let Some(pos) = html.find(&target) {
            if let Some(end) = html[pos..].find('>') {
                let tag = html[pos..pos + end].to_string();
                let new_tag = remove_th_content_attr(&tag, val);
                html.replace_range(pos..pos + end, &new_tag);
            }
        }
    };

    // canonical link
    replace_link_href(html, "canonical", canonical);
    replace_meta(html, "description", description);
    replace_meta(html, "keywords", description);
    replace_og_content(html, "og:url", canonical);
    replace_og_content(html, "og:site_name", site_name);
    replace_og_content(html, "og:title", title);
    replace_og_content(html, "og:description", description);
    replace_og_content(html, "og:image", image);
    replace_og_content(html, "twitter:title", title);
    replace_og_content(html, "twitter:description", description);
    replace_og_content(html, "twitter:image", image);

    // icon links
    replace_link_href_rel(html, "icon", logo);
    replace_link_href_rel(html, "apple-touch-icon", logo);

    // <base th:href="..."> → <base href="site_name">
    if let Some(pos) = html.find("<base ") {
        if let Some(end) = html[pos..].find('>') {
            let new_base = format!("<base href=\"{}\" />", html_esc(site_name));
            html.replace_range(pos..pos + end + 1, &new_base);
        }
    }

    // <body ... th:attr="data-app-id=..."> — strip th:attr and th:name
    // These are irrelevant to React rendering; remove them to avoid confusing parsers.
    strip_th_attrs(html, "th:name");
    strip_th_attrs(html, "th:attr");
}

fn html_esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn remove_th_content_attr(tag: &str, val: &str) -> String {
    // Remove existing th:content="..." and ensure content="val" is present
    let re = regex::Regex::new(r#"\s*th:content="[^"]*""#).unwrap();
    let mut t = re.replace(tag, "").to_string();
    // Remove old content="..."
    let re2 = regex::Regex::new(r#"\s*content="[^"]*""#).unwrap();
    t = re2.replace(&t, "").to_string();
    format!("{} content=\"{}\"", t, html_esc(val))
}

fn replace_link_href(html: &mut String, rel: &str, href: &str) {
    let target = format!("rel=\"{}\"", rel);
    if let Some(pos) = html.find(&target) {
        if let Some(end) = html[pos..].find('>') {
            let tag = html[pos..pos + end].to_string();
            let re = regex::Regex::new(r#"\s*th:href="[^"]*""#).unwrap();
            let mut t = re.replace(&tag, "").to_string();
            let re2 = regex::Regex::new(r#"\s*href="[^"]*""#).unwrap();
            t = re2.replace(&t, "").to_string();
            let new_tag = format!("{} href=\"{}\"", t, html_esc(href));
            html.replace_range(pos..pos + end, &new_tag);
        }
    }
}

fn replace_link_href_rel(html: &mut String, rel: &str, href: &str) {
    // Targets <link rel="icon" or rel="apple-touch-icon"
    replace_link_href(html, rel, href);
}

fn replace_og_content(html: &mut String, property: &str, val: &str) {
    let target = format!("property=\"{}\"", property);
    if let Some(pos) = html.find(&target) {
        if let Some(end) = html[pos..].find('>') {
            let tag = html[pos..pos + end].to_string();
            let re = regex::Regex::new(r#"\s*th:content="[^"]*""#).unwrap();
            let mut t = re.replace(&tag, "").to_string();
            let re2 = regex::Regex::new(r#"\s*content="[^"]*""#).unwrap();
            t = re2.replace(&t, "").to_string();
            let new_tag = format!("{} content=\"{}\"", t, html_esc(val));
            html.replace_range(pos..pos + end, &new_tag);
        }
    }
}

fn strip_th_attrs(html: &mut String, attr: &str) {
    while let Some(pos) = html.find(attr) {
        if let Some(end) = html[pos..].find('"').and_then(|q1| {
            html[pos + q1 + 1..].find('"').map(|q2| pos + q1 + 1 + q2 + 1)
        }) {
            // Remove from the attribute name up to and including the closing quote
            html.replace_range(pos..end, "");
        } else {
            break;
        }
    }
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

fn fallback_html(title: &str, _uri: &str, _app_id: &str, scripts: &str) -> String {
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

// ─── Query string parser ───────────────────────────────────────────────────────

fn parse_qs(qs: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for part in qs.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if !k.is_empty() {
                let decoded = urlencoding::decode(v)
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| v.to_string());
                map.insert(k.to_string(), decoded);
            }
        }
    }
    map
}

/// Extract the first path segment as a candidate service_type slug.
/// e.g. "/nha-dat/slug-detail" → "nha-dat"
fn extract_slug_from_path(uri: &str) -> Option<String> {
    let p = uri.trim_start_matches('/');
    let p = p.replace(".shtml", "");
    let slug = p.split('/').next().unwrap_or("").trim().to_string();
    if slug.is_empty() { None } else { Some(slug) }
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

    let mut seen = HashSet::new();
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
    let mut s = format!("\n  <url>\n    <loc>{url}</loc>\n");
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
