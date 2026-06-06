use std::sync::Arc;

use serde_json::{Map, Value};

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};

pub struct RoleHandler {
    record_manager: Arc<RecordManager>,
}

impl RoleHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn handle_role_list(&self, _params: &Map<String, Value>) -> StandardResponse {
        let filter = SearchFilter::eq("id", "roleList");
        let data = self.record_manager.find("csm", "index", &filter);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("result", data.get("data").cloned().unwrap_or(Value::Array(vec![])));
        r
    }

    pub fn handle_role_item(&self, method: &str, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", format!("role-item {method}"));
        let _ = params;
        r
    }

    pub fn handle_role_menu(&self) -> StandardResponse {
        let filter = SearchFilter::eq("id", "menuR");
        let data = self.record_manager.find("csm", "index", &filter);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("result", Value::Object(data));
        r
    }
}
