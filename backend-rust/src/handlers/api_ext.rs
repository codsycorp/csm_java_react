use reqwest::Client;
use serde_json::{json, Map, Value};

use crate::model::StandardResponse;
use crate::state::AppState;

fn param_str<'a>(params: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    params.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

/// Java `handleWebScrape` uses `link`; keep `url` as fallback for older callers.
fn scrape_target_url(params: &Map<String, Value>) -> Option<&str> {
    param_str(params, "link").or_else(|| param_str(params, "url"))
}

async fn scrape_http_client(state: &AppState, params: &Map<String, Value>) -> Result<Client, String> {
    let Some(server) = param_str(params, "proxyServer") else {
        return Ok(state.http_client.clone());
    };

    let proxy_url = if server.starts_with("http://") || server.starts_with("https://") {
        server.to_string()
    } else {
        format!("http://{server}")
    };

    let mut proxy = reqwest::Proxy::http(&proxy_url).map_err(|e| e.to_string())?;
    if let (Some(username), Some(password)) = (
        param_str(params, "proxyUsername"),
        param_str(params, "proxyPassword"),
    ) {
        proxy = proxy.basic_auth(username, password);
    }

    Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .proxy(proxy)
        .build()
        .map_err(|e| e.to_string())
}

pub async fn handle_scrape_web(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    let Some(link) = scrape_target_url(params) else {
        let mut r = StandardResponse::new();
        r.set("code", 400);
        r.set("success", false);
        r.set("message", "Missing 'link' parameter for web scraping.");
        return r;
    };

    let client = match scrape_http_client(state, params).await {
        Ok(c) => c,
        Err(e) => {
            let mut r = StandardResponse::new();
            r.set("code", 500);
            r.set("success", false);
            r.set("message", format!("Invalid proxy configuration: {e}"));
            return r;
        }
    };

    match client
        .get(link)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (compatible; CSMBridge/1.0; +https://csmbridge.net)",
        )
        .send()
        .await
    {
        Ok(resp) => {
            let html = resp.text().await.unwrap_or_default();
            let mut r = StandardResponse::new();
            if html.is_empty() {
                r.set("code", 500);
                r.set("success", false);
                r.set("message", format!("Failed to retrieve content from {link}"));
            } else {
                r.set("code", 200);
                r.set("success", true);
                r.set("message", "Scraping successful");
                r.set("data", html.chars().take(500_000).collect::<String>());
            }
            r
        }
        Err(e) => {
            let mut r = StandardResponse::new();
            r.set("code", 500);
            r.set("success", false);
            r.set("message", format!("Internal server error during scraping: {e}"));
            r
        }
    }
}

pub fn handle_index_google(_params: &Map<String, Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("success", true);
    r.set("message", "Google Index API — wire GOOGLE_INDEX_CREDENTIALS in config.env");
    r
}

pub fn handle_execute_js(_params: &Map<String, Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("success", false);
    r.set("message", "execute-js-on-page requires headless browser sidecar");
    r
}

pub async fn handle_ai_seo_content(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    use crate::services::ai::policy::{
        local_unavailable_hint, local_unavailable_message, LOCAL_PROVIDER_UNAVAILABLE_CODE,
    };

    let mut r = StandardResponse::new();

    // Check mode — "status"/"cancel" not supported in Rust backend
    let mode = params.get("mode").and_then(|v| v.as_str()).unwrap_or("sync");
    if mode == "status" || mode == "cancel" {
        r.set("code", 200);
        r.set("success", false);
        r.set("message", "async mode not supported in local backend");
        return r;
    }

    // Detect seoPipeline: "anti_ai_one_shot" | "seo_article_one_shot" | "seo_writer_2026"
    let seo_pipeline = params.get("seoPipeline").and_then(|v| v.as_str()).unwrap_or("");
    let is_one_shot = matches!(seo_pipeline, "anti_ai_one_shot" | "seo_article_one_shot" | "seo_writer_2026");

    // Extract seoContext (nested object merged with top-level fields)
    let seo_context = extract_seo_context(params);

    let llama = state.llama.clone();

    if is_one_shot {
        if !llama.is_available() {
            r.set("code", 200);
            r.set("success", false);
            r.set("message", local_unavailable_message());
            r.set("hint", local_unavailable_hint());
            r.set("errorCode", LOCAL_PROVIDER_UNAVAILABLE_CODE);
            return r;
        }
        let topic = seo_context.get("topic").and_then(|v| v.as_str()).unwrap_or("");
        let content_field = seo_context.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let effective_topic = if !topic.is_empty() { topic } else { content_field };
        if effective_topic.is_empty() {
            r.set("code", 200);
            r.set("success", false);
            r.set("message", "Thiếu topic/content trong seoContext");
            r.set("errorCode", "SEO_LANE_MISSING_TOPIC");
            return r;
        }
        let industry = seo_context.get("industry").and_then(|v| v.as_str()).unwrap_or("bat-dong-san");
        let location = seo_context.get("location").and_then(|v| v.as_str()).unwrap_or("");
        let domain_key = seo_context.get("domainKey").and_then(|v| v.as_str()).unwrap_or("lmkt");
        let business = seo_context.get("business").and_then(|v| v.as_str()).unwrap_or("");

        // Pick creative params heuristically (no extra LLM call, mirrors Java)
        let (persona_key, content_pattern, hook, angle, tone) =
            resolve_heuristic_creative_params(effective_topic, industry, location);

        let article_prompt = build_seo_article_prompt(
            effective_topic, industry, domain_key, location, business,
            &persona_key, &content_pattern, &hook, &angle, &tone,
            seo_pipeline == "seo_writer_2026",
        );

        // Java uses ai.seo.article.max-tokens = 4096
        match llama.complete_with_tokens(&article_prompt, 4096).await {
            Ok(raw) => {
                return populate_seo_response(&mut r, &raw);
            }
            Err(e) => {
                r.set("code", 200);
                r.set("success", false);
                r.set("message", format!("Lỗi tạo bài SEO: {e}"));
                return r;
            }
        }
    }

    // Fallback: plain prompt mode
    let prompt = params.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
    if prompt.is_empty() {
        r.set("code", 200);
        r.set("success", false);
        r.set("message", "Thiếu tham số 'prompt' để tạo nội dung AI.");
        return r;
    }

    if !llama.is_available() {
        r.set("success", false);
        r.set("message", local_unavailable_message());
        r.set("hint", local_unavailable_hint());
        r.set("errorCode", LOCAL_PROVIDER_UNAVAILABLE_CODE);
        return r;
    }

    match llama.complete(prompt).await {
        Ok(raw) => populate_seo_response(&mut r, &raw),
        Err(e) => {
            r.set("code", 200);
            r.set("success", false);
            r.set("message", format!("Lỗi AI: {e}"));
            r.set("errorCode", LOCAL_PROVIDER_UNAVAILABLE_CODE);
            r
        }
    }
}

/// Extract seoContext: merge nested seoContext map with top-level fields (mirrors Java extractSeoContext).
fn extract_seo_context(params: &Map<String, Value>) -> Map<String, Value> {
    let mut out = Map::new();
    if let Some(Value::Object(nested)) = params.get("seoContext") {
        out.extend(nested.clone());
    }
    for key in &["industry", "topic", "content", "domainKey", "property", "location", "business", "seed", "seoPipeline", "taskType", "prompt"] {
        if let Some(v) = params.get(*key) {
            out.insert((*key).into(), v.clone());
        }
    }
    out
}

fn resolve_heuristic_creative_params(topic: &str, _industry: &str, location: &str) -> (String, String, String, String, String) {
    let personas = ["investor", "family", "local_resident", "business_owner", "storyteller"];
    let patterns = ["investment_analysis", "family_story", "step_by_step_guide", "quick_tips", "landing_page"];
    let hash = (topic.len() + location.len()) as usize;
    let persona_key = personas[hash % personas.len()];
    let content_pattern = patterns[(hash + 7) % patterns.len()];
    let hook = match persona_key {
        "family" => format!("Gia đình tôi đang tìm {}", &topic[..topic.len().min(40)]),
        "business_owner" => format!("Mở quán tại {}", &topic[..topic.len().min(40)]),
        "local_resident" => format!("Sống lâu năm quanh {}", &topic[..topic.len().min(40)]),
        "storyteller" => format!("Câu chuyện thật về {}", &topic[..topic.len().min(40)]),
        _ => format!("Góc nhìn đầu tư {}", &topic[..topic.len().min(40)]),
    };
    let angle = match persona_key {
        "family" => "Trải nghiệm thực tế, ưu tiên không gian sống".into(),
        "business_owner" => "Tiềm năng kinh doanh và dòng khách".into(),
        "local_resident" => "Am hiểu khu vực, tiện ích hàng ngày".into(),
        "storyteller" => "Kể chuyện có nhân vật, có chi tiết cụ thể".into(),
        _ => "Phân tích số liệu, so sánh và rủi ro".into(),
    };
    let tone = match persona_key {
        "family" => "Ấm áp, gần gũi, thực tế".into(),
        "business_owner" => "Thực dụng, tập trung ROI".into(),
        "local_resident" => "Tự nhiên, như người trong cuộc".into(),
        "storyteller" => "Kể chuyện, có cảm xúc".into(),
        _ => "Chuyên gia, có số liệu".into(),
    };
    (persona_key.into(), content_pattern.into(), hook, angle, tone)
}

fn build_seo_article_prompt(
    topic: &str,
    industry: &str,
    domain_key: &str,
    location: &str,
    business: &str,
    persona_key: &str,
    content_pattern: &str,
    hook: &str,
    angle: &str,
    tone: &str,
    extended: bool,
) -> String {
    let unique_seed = chrono::Utc::now().timestamp_millis();
    let location_note = if !location.is_empty() { format!(" tại {location}") } else { String::new() };
    let business_note = if !business.is_empty() { format!("\nDoanh nghiệp: {business}") } else { String::new() };
    let extended_hint = if extended { "\n- urlSlug: slug URL không dấu" } else { "" };

    // Qwen2.5 chat format — assistant prefill with '{' forces JSON-only output
    format!(
        "<|im_start|>system\n\
Bạn là chuyên gia SEO. Nhiệm vụ: tạo bài viết SEO từ thông tin sản phẩm/dịch vụ.\n\
Luôn trả về MỘT JSON object hợp lệ, không có markdown, không giải thích.\n\
Seed: {unique_seed} | Persona: {persona_key} | Pattern: {content_pattern}\n\
<|im_end|>\n\
<|im_start|>user\n\
Chủ đề: {topic}{location_note}\n\
Ngành: {industry} | Domain: {domain_key}{business_note}\n\
Hook: {hook}\n\
Góc nhìn: {angle}\n\
Giọng văn: {tone}\n\
\n\
Viết bài SEO 3 ngôn ngữ (VI/EN/ZH). Trả về JSON với đúng các key sau:\n\
- title: ~55-80 ký tự long-tail tiếng Việt\n\
- title_en: English title (dịch thật, không placeholder)\n\
- title_zh: 简体中文 title\n\
- description: ~120-160 ký tự tiếng Việt, văn bản thuần\n\
- description_en: English description\n\
- description_zh: 简体中文 description\n\
- content: HTML tiếng Việt ~350 từ, dùng thẻ <h3><h4><p>, số liệu cụ thể từ chủ đề\n\
- content_en: HTML English ~120 words\n\
- content_zh: HTML 简体中文 ~120 words\n\
- keywords: mảng 5-7 cụm long-tail tiếng Việt\n\
- keywords_en: mảng 5-7 cụm long-tail English\n\
- keywords_zh: mảng 5-7 cụm long-tail 简体中文\n\
- excerpt: ~100-120 ký tự tiếng Việt\n\
- excerpt_en: English excerpt\n\
- excerpt_zh: 简体中文 excerpt\n\
- author: \"{domain_key}\"\n\
- readTime: số phút đọc (integer)\n\
- tags: mảng string tiếng Việt{extended_hint}\n\
\n\
Không dùng placeholder như \"...\" hay \"tiếng Việt\". Mỗi value phải là nội dung thật.\n\
<|im_end|>\n\
<|im_start|>assistant\n\
{{"
    )
}

/// Derive attributes_* and fill missing fields — mirrors Java normalizeSeoArticleForLmktClient.
fn normalize_seo_fields(data: &mut serde_json::Map<String, Value>) {
    // Derive description from excerpt or content if blank
    fill_blank_from(data, "description", "excerpt");
    fill_blank_from(data, "description_en", "excerpt_en");
    fill_blank_from(data, "description_zh", "excerpt_zh");
    if data.get("description").map(|v| v.as_str().unwrap_or("").is_empty()).unwrap_or(true) {
        if let Some(plain) = plain_text_excerpt(data, "content", 160) {
            data.insert("description".into(), Value::String(plain));
        }
    }

    // Derive attributes_* from top-level fields (fill if blank)
    fill_blank_from(data, "attributes_title", "title");
    fill_blank_from(data, "attributes_title_en", "title_en");
    fill_blank_from(data, "attributes_title_zh", "title_zh");

    fill_blank_from(data, "attributes_description", "description");
    fill_blank_from(data, "attributes_description_en", "description_en");
    fill_blank_from(data, "attributes_description_zh", "description_zh");

    // keywords can be array → join to string for attributes_keywords
    for (kw_field, attr_field) in &[
        ("keywords", "attributes_keywords"),
        ("keywords_en", "attributes_keywords_en"),
        ("keywords_zh", "attributes_keywords_zh"),
    ] {
        if data.get(*attr_field).map(|v| v.as_str().unwrap_or("").is_empty()).unwrap_or(true) {
            let joined = keywords_to_string(data, kw_field);
            if !joined.is_empty() {
                data.insert((*attr_field).into(), Value::String(joined));
            }
        }
    }

    // html_content = content (LMKT client expects this)
    if !data.contains_key("html_content") {
        if let Some(v) = data.get("content").cloned() {
            data.insert("html_content".into(), v);
        }
    }

    // Ensure provider
    data.entry(String::from("provider")).or_insert(Value::String("local_provider".into()));
}

fn fill_blank_from(data: &mut serde_json::Map<String, Value>, target: &str, source: &str) {
    if data.get(target).map(|v| v.as_str().unwrap_or("").is_empty()).unwrap_or(true) {
        if let Some(v) = data.get(source).cloned() {
            if !v.as_str().unwrap_or("").is_empty() {
                data.insert(target.into(), v);
            }
        }
    }
}

fn keywords_to_string(data: &serde_json::Map<String, Value>, field: &str) -> String {
    match data.get(field) {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn plain_text_excerpt(data: &serde_json::Map<String, Value>, field: &str, max_chars: usize) -> Option<String> {
    let html = data.get(field)?.as_str()?;
    // Strip HTML tags simply
    let text: String = html
        .chars()
        .scan(false, |in_tag, c| {
            if c == '<' { *in_tag = true; }
            let emit = !*in_tag;
            if c == '>' { *in_tag = false; }
            Some(if emit { Some(c) } else { None })
        })
        .flatten()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if text.is_empty() { return None; }
    Some(text.chars().take(max_chars).collect())
}

/// Parse AI raw output as SEO JSON, normalize fields, and build the response.
fn populate_seo_response(r: &mut StandardResponse, raw: &str) -> StandardResponse {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    let cleaned = cleaned.strip_prefix("```json").unwrap_or(cleaned);
    let cleaned = cleaned.strip_prefix("```").unwrap_or(cleaned);
    let cleaned = cleaned.strip_suffix("```").unwrap_or(cleaned).trim();

    // The SEO prompt prefills the assistant turn with '{', so the model generates the rest
    // of the JSON without the opening brace. Prepend '{' when needed.
    let json_candidate: String = if cleaned.trim_start().starts_with('{') {
        cleaned.to_string()
    } else {
        format!("{{{cleaned}")
    };

    // Find JSON boundaries — guard against inverted range (} before {) to prevent panic
    let json_start = json_candidate.find('{').unwrap_or(0);
    let json_end = json_candidate.rfind('}').map(|i| i + 1).unwrap_or(json_candidate.len());
    let json_str = if json_start < json_end { &json_candidate[json_start..json_end] } else { &json_candidate };

    match serde_json::from_str::<Value>(json_str) {
        Ok(Value::Object(mut data)) => {
            let has_title = data.get("title").map(|v| !v.as_str().unwrap_or("").is_empty()).unwrap_or(false);
            let has_content = data.get("content").map(|v| !v.as_str().unwrap_or("").is_empty()).unwrap_or(false);
            if !has_title || !has_content {
                r.set("code", 200);
                r.set("success", false);
                r.set("data", Value::Object(data));
                r.set("errorCode", "SEO_GENERATION_FAILED");
                r.set("message", "Model local không tạo được bài SEO đủ title và content.");
                return r.clone();
            }
            normalize_seo_fields(&mut data);
            r.set("code", 200);
            r.set("success", true);
            r.set("data", Value::Object(data));
            r.set("provider", "local_provider");
            r.set("message", "Thành công");
        }
        _ => {
            r.set("code", 200);
            r.set("success", false);
            r.set("message", "Model không trả về JSON hợp lệ.");
            r.set("rawContent", json_candidate.chars().take(2000).collect::<String>());
            r.set("errorCode", "SEO_PARSE_FAILED");
        }
    }
    r.clone()
}

pub fn handle_apps_list(_params: &Map<String, Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("success", true);
    r.set("apps", json!(["csm", "web", "kqxs", "vpts"]));
    r
}
