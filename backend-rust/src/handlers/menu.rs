use std::sync::Arc;

use serde_json::{Map, Value};

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};

pub struct MenuHandler {
    record_manager: Arc<RecordManager>,
}

impl MenuHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn handle_menu_list(&self) -> StandardResponse {
        let filter = SearchFilter::eq("id", "menuList");
        let data = self.record_manager.find("csm", "index", &filter);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("result", data.get("data").cloned().unwrap_or(Value::Array(vec![])));
        r
    }

    pub fn handle_menu_by_role_id(&self, params: &Map<String, Value>) -> StandardResponse {
        let role_id = params.get("role_id").and_then(|v| v.as_str()).unwrap_or("");
        let filter = SearchFilter::eq("id", "menuR");
        let menu_r = self.record_manager.find("csm", "index", &filter);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("result", menu_r.get(role_id).cloned().unwrap_or(Value::Array(vec![])));
        r
    }

    pub fn handle_menu_item(&self, method: &str, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", format!("menu-item {method}"));
        let _ = params;
        r
    }
}
