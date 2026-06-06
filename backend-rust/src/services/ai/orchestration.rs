use reqwest::Client;
use serde_json::{json, Value};

pub struct AiOrchestrationService {
    http: Client,
}

impl AiOrchestrationService {
    pub fn new(http: Client) -> Self {
        Self { http }
    }

    pub async fn code_stream_placeholder(&self, params: &Value) -> Value {
        json!({
            "status": "streaming",
            "message": "AI code stream endpoint ready — wire local/cloud providers",
            "params_received": params.is_object(),
        })
    }

    pub async fn call_gemini(&self, api_key: &str, prompt: &str) -> anyhow::Result<String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}"
        );
        let body = json!({
            "contents": [{ "parts": [{ "text": prompt }] }]
        });
        let resp: Value = self.http.post(&url).json(&body).send().await?.json().await?;
        Ok(resp
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string())
    }
}
