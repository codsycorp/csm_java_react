use std::collections::HashMap;

use serde_json::{json, Map, Value};

use crate::web::ssr::{html_esc, record_str, resolve_lang, PreprocessCtx};

const SUPPORTED_SSR_LANGS: &[&str] = &["vi", "en", "zh"];

fn path_escape_segment(segment: &str) -> String {
    segment
        .split('/')
        .map(|part| urlencoding::encode(part).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

struct HreflangLink {
    lang: String,
    href: String,
}

pub fn locale_tag(lang: &str) -> String {
    match lang.trim().to_lowercase().as_str() {
        "en" => "en_US".into(),
        "zh" => "zh_CN".into(),
        _ => "vi_VN".into(),
    }
}

fn breadcrumb_menu_labels(lang: &str) -> (&'static str, &'static str) {
    match resolve_lang(&HashMap::from([("hl".into(), lang.to_string())])).as_str() {
        "en" => ("Home", "Services"),
        "zh" => ("首页", "服务"),
        _ => ("Trang chủ", "Dịch vụ"),
    }
}

fn build_localized_url(base_url: &str, page_path: &str, lang: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let mut path = page_path.to_string();
    if path.is_empty() {
        path = "/".into();
    }
    if !path.starts_with('/') {
        path = format!("/{path}");
    }
    let u = format!("{base}{path}");
    let lang = resolve_lang(&HashMap::from([("hl".into(), lang.to_string())]));
    if lang.is_empty() || lang == "vi" {
        return u;
    }
    let sep = if u.contains('?') { '&' } else { '?' };
    format!("{u}{sep}hl={}", urlencoding::encode(&lang))
}

pub fn build_hreflang_links(base_url: &str, page_path: &str) -> Vec<(String, String)> {
    let mut out = Vec::with_capacity(SUPPORTED_SSR_LANGS.len() + 1);
    for lang in SUPPORTED_SSR_LANGS {
        out.push((
            (*lang).into(),
            build_localized_url(base_url, page_path, lang),
        ));
    }
    out.push((
        "x-default".into(),
        build_localized_url(base_url, page_path, "vi"),
    ));
    out
}

fn render_hreflang_links(links: &[(String, String)]) -> String {
    let mut b = String::new();
    for (lang, href) in links {
        if href.trim().is_empty() {
            continue;
        }
        b.push_str(&format!(
            "<link rel=\"alternate\" hreflang=\"{}\" href=\"{}\" />\n",
            html_esc(lang),
            html_esc(href)
        ));
    }
    b
}

pub fn inject_hreflang_links(html: &mut String, links: &[(String, String)]) {
    let block = render_hreflang_links(links).trim().to_string();
    if block.is_empty() {
        return;
    }
    let lower = html.to_lowercase();
    if let Some(pos) = lower.find("</head>") {
        html.insert_str(pos, &format!("{block}\n"));
    }
}

fn replace_attr_value(tag: &str, attr_prefix: &str, new_suffix: &str) -> String {
    let lower = tag.to_lowercase();
    let prefix_lower = attr_prefix.to_lowercase();
    let Some(idx) = lower.find(&prefix_lower) else {
        return tag.to_string();
    };
    let start = idx + attr_prefix.len();
    let rest = &tag[start..];
    if let Some(q) = rest.find('"') {
        format!("{}{}{}", &tag[..start], new_suffix, &rest[q + 1..])
    } else {
        tag.to_string()
    }
}

pub fn replace_html_lang(html: &mut String, lang: &str) {
    let lang = resolve_lang(&HashMap::from([("hl".into(), lang.to_string())]));
    let lang = if lang.is_empty() { "vi" } else { lang.as_str() };
    let lower = html.to_lowercase();
    let Some(start) = lower.find("<html") else {
        return;
    };
    let Some(rel_end) = html[start..].find('>') else {
        return;
    };
    let end = start + rel_end;
    let tag = &html[start..end];
    let new_tag = if tag.to_lowercase().contains("lang=\"") {
        replace_attr_value(tag, "lang=\"", &format!("{lang}\""))
    } else {
        format!("{} lang=\"{}\">", tag.trim_end_matches('>'), html_esc(lang))
    };
    html.replace_range(start..end, &new_tag);
}

fn inject_meta_property(html: &mut String, property: &str, content: &str) {
    if content.trim().is_empty() {
        return;
    }
    let block = format!(
        "<meta property=\"{}\" content=\"{}\" />\n",
        html_esc(property),
        html_esc(content)
    );
    let lower = html.to_lowercase();
    if let Some(pos) = lower.find("</head>") {
        html.insert_str(pos, &block);
    }
}

pub fn inject_og_locale_alternates(html: &mut String, current_lang: &str) {
    let current = locale_tag(current_lang);
    for lang in SUPPORTED_SSR_LANGS {
        let tag = locale_tag(lang);
        if tag == current {
            continue;
        }
        inject_meta_property(html, "og:locale:alternate", &tag);
    }
}

fn category_display_name(cat: &Map<String, Value>, lang: &str) -> String {
    if lang != "vi" {
        for key in [format!("title_{lang}"), format!("category_{lang}")] {
            let v = record_str(cat, &key);
            if !v.is_empty() {
                return v;
            }
        }
    }
    for key in ["title", "name", "category"] {
        let v = record_str(cat, key);
        if !v.is_empty() {
            return v;
        }
    }
    String::new()
}

fn find_category_title(categories: &[Value], service_code: &str, lang: &str) -> String {
    let code = service_code.trim().to_lowercase();
    if code.is_empty() {
        return String::new();
    }
    for item in categories {
        let Some(cat) = item.as_object() else {
            continue;
        };
        let mut sc = record_str(cat, "service_code").to_lowercase();
        if sc.is_empty() {
            sc = record_str(cat, "slug").to_lowercase();
        }
        if sc != code {
            continue;
        }
        let mut name = record_str(cat, "category");
        if lang != "vi" {
            if let Some(v) = cat
                .get(&format!("category_{lang}"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                name = v.to_string();
            }
        }
        if name.is_empty() {
            name = record_str(cat, "description");
        }
        return name;
    }
    String::new()
}

fn breadcrumb_list_item(position: i64, name: &str, item_url: &str) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("@type".into(), json!("ListItem"));
    m.insert("position".into(), json!(position));
    m.insert("name".into(), json!(name));
    m.insert("item".into(), json!(item_url));
    m
}

fn build_breadcrumb_list(ctx: &PreprocessCtx) -> Map<String, Value> {
    let base_url = ctx.base_url.trim().trim_end_matches('/');
    let mut default_category = ctx.default_category.trim().to_string();
    if default_category.is_empty() {
        if let Some(obj) = ctx.initial_data.as_object() {
            default_category = record_str(obj, "serviceCode");
        }
    }
    if default_category.is_empty() {
        default_category = "dich-vu".into();
    }

    let categories = ctx.categories.as_array().cloned().unwrap_or_default();
    let (home_label, default_services) = breadcrumb_menu_labels(&ctx.lang);
    let services_label = {
        let name = find_category_title(&categories, &default_category, &ctx.lang);
        if name.is_empty() {
            default_services.to_string()
        } else {
            name
        }
    };

    let mut items = vec![
        breadcrumb_list_item(1, home_label, &format!("{base_url}/")),
        breadcrumb_list_item(
            2,
            &services_label,
            &format!("{base_url}/{}", path_escape_segment(&default_category)),
        ),
    ];

    let mut next_pos = 3i64;
    let mut page_url = format!("{base_url}{}", ctx.page_path);
    if !ctx.page_path.starts_with('/') {
        page_url = format!("{base_url}/{}", ctx.page_path.trim_start_matches('/'));
    }

    if let Some(detail) = ctx
        .initial_data
        .get("serviceDetail")
        .and_then(|v| v.as_object())
    {
        let mut service_type = record_str(detail, "service_type");
        if service_type.is_empty() {
            if let Some(obj) = ctx.initial_data.as_object() {
                service_type = record_str(obj, "serviceCode");
            }
        }
        if !service_type.is_empty() && !service_type.eq_ignore_ascii_case(&default_category) {
            let mut cat_name = find_category_title(&categories, &service_type, &ctx.lang);
            if cat_name.is_empty() {
                cat_name = service_type.clone();
            }
            items.push(breadcrumb_list_item(
                next_pos,
                &cat_name,
                &format!("{base_url}/{}", path_escape_segment(&service_type)),
            ));
            next_pos += 1;
        }
        let mut title = record_str(detail, "title");
        if title.is_empty() {
            title = record_str(detail, "name");
        }
        if !title.is_empty() {
            items.push(breadcrumb_list_item(next_pos, &title, &page_url));
        }
    } else if let Some(cat) = ctx
        .initial_data
        .get("serviceCategory")
        .and_then(|v| v.as_object())
    {
        let mut code = record_str(cat, "service_code");
        if code.is_empty() {
            if let Some(obj) = ctx.initial_data.as_object() {
                code = record_str(obj, "serviceCode");
            }
        }
        let name = category_display_name(cat, &ctx.lang);
        if !name.is_empty() && !code.is_empty() {
            items.push(breadcrumb_list_item(
                next_pos,
                &name,
                &format!("{base_url}/{}", path_escape_segment(&code)),
            ));
        }
    }

    let mut m = Map::new();
    m.insert("@type".into(), json!("BreadcrumbList"));
    m.insert("itemListElement".into(), Value::Array(items.into_iter().map(Value::Object).collect()));
    m
}

fn build_primary_json_ld(ctx: &PreprocessCtx) -> Map<String, Value> {
    let mut page_type = ctx.page_type.trim().to_string();
    if page_type.is_empty() {
        page_type = "WebPage".into();
    }
    let lang = resolve_lang(&HashMap::from([("hl".into(), ctx.lang.clone())]));
    let lang = if lang.is_empty() {
        "vi".to_string()
    } else {
        lang
    };

    if page_type.eq_ignore_ascii_case("article") {
        let mut node = Map::new();
        node.insert("@type".into(), json!("Article"));
        node.insert("headline".into(), json!(ctx.title));
        node.insert("url".into(), json!(ctx.canonical));
        node.insert("description".into(), json!(ctx.description));
        node.insert("inLanguage".into(), json!(lang));
        node.insert("mainEntityOfPage".into(), json!(ctx.canonical));
        node.insert("image".into(), json!(ctx.image));
        let mut publisher = Map::new();
        publisher.insert("@type".into(), json!("Organization"));
        publisher.insert("name".into(), json!(ctx.site_name));
        publisher.insert("url".into(), json!(ctx.site_name));
        let mut logo = Map::new();
        logo.insert("@type".into(), json!("ImageObject"));
        logo.insert("url".into(), json!(ctx.logo));
        publisher.insert("logo".into(), Value::Object(logo));
        node.insert("publisher".into(), Value::Object(publisher));
        if !ctx.author.is_empty() {
            let mut author = Map::new();
            author.insert("@type".into(), json!("Person"));
            author.insert("name".into(), json!(ctx.author));
            node.insert("author".into(), Value::Object(author));
        }
        if !ctx.published_at.is_empty() {
            node.insert("datePublished".into(), json!(ctx.published_at));
            node.insert("dateModified".into(), json!(ctx.published_at));
        }
        return node;
    }

    let mut node = Map::new();
    node.insert("@type".into(), json!("WebPage"));
    node.insert("headline".into(), json!(ctx.title));
    node.insert("url".into(), json!(ctx.canonical));
    node.insert("description".into(), json!(ctx.description));
    node.insert("inLanguage".into(), json!(lang));
    let mut image = Map::new();
    image.insert("@type".into(), json!("ImageObject"));
    image.insert("url".into(), json!(ctx.image));
    image.insert("height".into(), json!("1000"));
    image.insert("width".into(), json!("1920"));
    node.insert("image".into(), Value::Object(image));
    let mut publisher = Map::new();
    publisher.insert("@type".into(), json!("Organization"));
    publisher.insert("name".into(), json!(ctx.site_name));
    publisher.insert("url".into(), json!(ctx.site_name));
    let mut logo = Map::new();
    logo.insert("@type".into(), json!("ImageObject"));
    logo.insert("url".into(), json!(ctx.logo));
    logo.insert("width".into(), json!("506"));
    logo.insert("height".into(), json!("132"));
    publisher.insert("logo".into(), Value::Object(logo));
    node.insert("publisher".into(), Value::Object(publisher));
    node
}

pub fn build_structured_data_graph(ctx: &PreprocessCtx) -> String {
    let primary = build_primary_json_ld(ctx);
    let breadcrumb = build_breadcrumb_list(ctx);
    let payload = json!({
        "@context": "https://schema.org",
        "@graph": [Value::Object(primary), Value::Object(breadcrumb)],
    });
    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into())
}
