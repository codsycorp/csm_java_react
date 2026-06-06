use serde_json::{json, Map, Value};

use crate::model::StandardResponse;
use crate::state::AppState;

pub async fn handle_scrape_web(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    let url = params.get("url").and_then(|v| v.as_str()).unwrap_or("");
    if url.is_empty() {
        let mut r = StandardResponse::new();
        r.set("success", false);
        r.set("error", "url required");
        return r;
    }
    match state.http_client.get(url).send().await {
        Ok(resp) => {
            let html = resp.text().await.unwrap_or_default();
            let mut r = StandardResponse::new();
            r.set("success", true);
            r.set("html", html.chars().take(50_000).collect::<String>());
            r
        }
        Err(e) => {
            let mut r = StandardResponse::new();
            r.set("success", false);
            r.set("error", e.to_string());
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
    use crate::services::ai::AiOrchestrationService;
    let prompt = params.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
    let svc = AiOrchestrationService::new(state.http_client.clone());
    let mut r = StandardResponse::new();
    if let Ok(key) = std::env::var("GEMINI_API_KEY") {
        if !key.is_empty() {
            match svc.call_gemini(&key, prompt).await {
                Ok(text) => {
                    r.set("success", true);
                    r.set("content", text);
                    return r;
                }
                Err(e) => r.set("error", e.to_string()),
            }
        }
    }
    r.set("success", false);
    r.set("message", "Configure GEMINI_API_KEY for SEO content generation");
    r
}

pub fn handle_apps_list(_params: &Map<String, Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("success", true);
    r.set("apps", json!(["csm", "web", "kqxs", "vpts"]));
    r
}
