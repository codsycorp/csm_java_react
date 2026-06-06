use std::collections::HashMap;

use axum::{
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StandardResponse {
    #[serde(flatten)]
    pub properties: Map<String, Value>,
    #[serde(skip)]
    pub binary_body: Option<Vec<u8>>,
    #[serde(skip)]
    pub content_type: Option<String>,
    #[serde(skip)]
    pub extra_headers: HeaderMap,
}

impl StandardResponse {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.properties.get(key)
    }

    pub fn set(&mut self, key: impl Into<String>, value: impl Into<Value>) {
        self.properties.insert(key.into(), value.into());
    }

    pub fn code(&self) -> u16 {
        self.get("code")
            .and_then(|v| v.as_u64())
            .unwrap_or(200) as u16
    }

    pub fn success(&self) -> bool {
        self.get("success").and_then(|v| v.as_bool()).unwrap_or(true)
    }

    pub fn set_html_body(&mut self, html: impl Into<String>) {
        self.set("body", html.into());
    }

    pub fn set_binary(&mut self, data: Vec<u8>, content_type: impl Into<String>) {
        self.binary_body = Some(data);
        self.content_type = Some(content_type.into());
    }

    pub fn into_json_value(self) -> Value {
        Value::Object(self.properties)
    }
}

impl IntoResponse for StandardResponse {
    fn into_response(self) -> Response {
        let code = self.code();
        if let Some(data) = self.binary_body {
            let ct = self
                .content_type
                .unwrap_or_else(|| "application/octet-stream".to_string());
            let mut headers = self.extra_headers;
            if let Ok(v) = HeaderValue::from_str(&ct) {
                headers.insert(header::CONTENT_TYPE, v);
            }
            return (StatusCode::from_u16(code).unwrap_or(StatusCode::OK), headers, data)
                .into_response();
        }

        let status = StatusCode::from_u16(code).unwrap_or(StatusCode::OK);
        let extra_headers = self.extra_headers;
        let mut response = (status, Json(Value::Object(self.properties))).into_response();
        for (k, v) in extra_headers.iter() {
            response.headers_mut().append(k.clone(), v.clone());
        }
        response
    }
}

pub fn error_response(code: u16, message: impl Into<String>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", code);
    r.set("success", false);
    r.set("message", message.into());
    r
}

pub fn ok_response(result: Value) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r.set("message", "ok");
    r.set("result", result);
    r
}

pub fn params_from_value(value: Value) -> HashMap<String, Value> {
    match value {
        Value::Object(map) => map.into_iter().collect(),
        _ => HashMap::new(),
    }
}

pub fn params_to_json(params: &HashMap<String, Value>) -> Value {
    json!(params)
}

pub type ApiParams = HashMap<String, Value>;
