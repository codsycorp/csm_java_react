use serde_json::Map;

use crate::model::StandardResponse;
use crate::state::AppState;

pub async fn handle_chat_history(state: &AppState, params: &Map<String, serde_json::Value>) -> StandardResponse {
    let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
    let room = params
        .get("room_id")
        .or_else(|| params.get("room"))
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    let data = state.chat_service.get_history(app_id, room);
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r.set("result", serde_json::Value::Object(data));
    r
}

pub async fn handle_chat_guests_list(_state: &AppState, params: &Map<String, serde_json::Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r.set("guests", serde_json::json!([]));
    let _ = params;
    r
}

pub async fn handle_chat_mark_read(_state: &AppState, params: &Map<String, serde_json::Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r.set("room", params.get("room").cloned().unwrap_or(serde_json::Value::Null));
    r
}

pub async fn handle_chat_mark_all_read(_state: &AppState, _params: &Map<String, serde_json::Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r
}

pub async fn handle_chat_delete_message(_state: &AppState, params: &Map<String, serde_json::Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r.set("messageId", params.get("messageId").cloned().unwrap_or(serde_json::Value::Null));
    r
}
