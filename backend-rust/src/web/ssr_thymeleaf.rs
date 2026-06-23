use serde_json::{json, Map, Value};

use crate::web::ssr::{html_esc, record_str, strip_th_attrs};

pub fn finalize_thymeleaf_html(html: &mut String, gtag: &str) {
    fix_gtag_async_script(html, gtag);
    remove_thymeleaf_bootstrap_scripts(html);
    strip_thymeleaf_expressions(html);
}

fn remove_thymeleaf_bootstrap_scripts(html: &mut String) {
    for marker in [
        "/*[[${meta}]]*/",
        "/*[[${__INITIAL_DATA__}]]*/",
        "/*[[${menus}]]*/",
    ] {
        loop {
            let Some(idx) = html.find(marker) else {
                break;
            };
            let Some(script_start) = html[..idx].rfind("<script") else {
                break;
            };
            let Some(rel_end) = html[idx..].find("</script>") else {
                break;
            };
            let end = idx + rel_end + "</script>".len();
            html.replace_range(script_start..end, "");
        }
    }
}

fn strip_thymeleaf_expressions(html: &mut String) {
    for attr in [
        "th:name", "th:attr", "th:inline", "th:src", "th:content", "th:href", "th:text",
    ] {
        strip_th_attrs(html, attr);
    }
    loop {
        let Some(start) = html.find("[[${") else {
            break;
        };
        let Some(rel) = html[start..].find("}]]") else {
            break;
        };
        let end = start + rel + 3;
        html.replace_range(start..end, "\"\"");
    }
    while html.contains("${meta.") {
        let Some(start) = html.find("${meta.") else {
            break;
        };
        let Some(rel) = html[start..].find('}') else {
            break;
        };
        let end = start + rel + 1;
        html.replace_range(start..end, "\"\"");
    }
}

fn fix_gtag_async_script(html: &mut String, gtag: &str) {
    let Some(pos) = html.find("googletagmanager.com/gtag/js") else {
        return;
    };
    let Some(script_start) = html[..pos].rfind("<script") else {
        return;
    };
    let Some(rel_end) = html[script_start..].find("</script>") else {
        return;
    };
    let end = script_start + rel_end + "</script>".len();
    if gtag.trim().is_empty() {
        html.replace_range(script_start..end, "");
        return;
    }
    let src = format!(
        "https://www.googletagmanager.com/gtag/js?id={}",
        html_esc(gtag)
    );
    html.replace_range(
        script_start..end,
        &format!("<script async src=\"{src}\"></script>"),
    );
}

fn build_item_list_elements(
    list: &[Value],
    protocol: &str,
    host: &str,
    service_type: &str,
) -> Vec<Map<String, Value>> {
    let max_items = list.len().min(10);
    let mut out = Vec::with_capacity(max_items);
    for (i, item) in list.iter().take(max_items).enumerate() {
        let Some(row) = item.as_object() else {
            continue;
        };
        let mut title = record_str(row, "title");
        if title.is_empty() {
            title = record_str(row, "title_vi");
        }
        let slug = record_str(row, "slug")
            .trim()
            .trim_end_matches(".shtml")
            .to_string();
        let mut svc_type = record_str(row, "service_type");
        if svc_type.is_empty() {
            svc_type = service_type.to_string();
        }
        let item_url = if !slug.is_empty() && !svc_type.is_empty() {
            format!("{protocol}://{host}/{svc_type}/{slug}")
        } else {
            String::new()
        };
        let mut item_node = Map::new();
        item_node.insert("@type".into(), json!("Article"));
        item_node.insert("name".into(), json!(title));
        item_node.insert("url".into(), json!(item_url));
        let mut list_item = Map::new();
        list_item.insert("@type".into(), json!("ListItem"));
        list_item.insert("position".into(), json!(i + 1));
        list_item.insert("name".into(), json!(title));
        list_item.insert("item".into(), Value::Object(item_node));
        out.push(list_item);
    }
    out
}

pub fn enrich_initial_data(
    initial_data: &mut Map<String, Value>,
    listing: &Map<String, Value>,
    protocol: &str,
    host: &str,
) {
    for (k, v) in listing {
        initial_data.insert(k.clone(), v.clone());
    }
    if let Some(Value::Array(raw)) = listing.get("serviceDetailList") {
        if !raw.is_empty() {
            let svc_type = listing
                .get("service_type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let elements: Vec<Value> = build_item_list_elements(raw, protocol, host, svc_type)
                .into_iter()
                .map(Value::Object)
                .collect();
            initial_data.insert("itemListElements".into(), Value::Array(elements));
        }
    }
}
