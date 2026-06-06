use serde_json::{json, Map, Value};

use crate::model::StandardResponse;
use crate::state::AppState;

pub async fn handle_facebook_post(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    let token = std::env::var("FACEBOOK_ACCESS_TOKEN").unwrap_or_default();
    let message = params.get("message").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() {
        let mut r = StandardResponse::new();
        r.set("success", false);
        r.set("error", "FACEBOOK_ACCESS_TOKEN not configured");
        return r;
    }
    let url = format!(
        "https://graph.facebook.com/me/feed?message={}&access_token={}",
        urlencoding::encode(message),
        token
    );
    match state.http_client.post(&url).send().await {
        Ok(resp) => {
            let body: Value = resp.json().await.unwrap_or(json!({}));
            let mut r = StandardResponse::new();
            r.set("success", true);
            r.set("result", body);
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

pub fn handle_facebook_stub(action: &str) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("success", false);
    r.set("message", format!("Facebook {action} — configure OAuth tokens in config.env"));
    r
}
