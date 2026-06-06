use std::sync::Arc;

use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};

pub struct RoleHandler {
    record_manager: Arc<RecordManager>,
}

impl RoleHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn handle_role_list(&self, params: &Map<String, Value>) -> StandardResponse {
        let filter = SearchFilter::eq("id", "roleList");
        let data = self.record_manager.find("csm", "index", &filter);
        let list: Vec<Value> = match data.get("data") {
            Some(Value::Array(arr)) => arr.clone(),
            _ => vec![],
        };

        let name_filter = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let status_filter = params.get("status").and_then(|v| v.as_str()).unwrap_or("");

        let filtered: Vec<Value> = list
            .into_iter()
            .filter(|item| {
                let name_ok = if name_filter.is_empty() {
                    true
                } else {
                    item.get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .contains(name_filter)
                };
                let status_ok = if status_filter.is_empty() {
                    true
                } else {
                    item.get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .contains(status_filter)
                };
                name_ok && status_ok
            })
            .collect();

        let total = filtered.len();
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "ok");
        r.set(
            "result",
            json!({ "list": filtered, "total": total, "pageSize": 10, "current": 1 }),
        );
        r
    }

    pub fn handle_role_item(&self, method: &str, params: &Map<String, Value>) -> StandardResponse {
        let filter = SearchFilter::eq("id", "roleList");
        let data = self.record_manager.find("csm", "index", &filter);
        let mut list: Vec<Value> = match data.get("data") {
            Some(Value::Array(arr)) => arr.clone(),
            _ => vec![],
        };

        let mut params_val = Value::Object(params.clone());

        match method.to_uppercase().as_str() {
            "POST" => {
                let id = Uuid::new_v4().to_string();
                if let Value::Object(ref mut m) = params_val {
                    m.insert("id".into(), Value::String(id));
                }
                list.push(params_val.clone());
            }
            "PUT" => {
                let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("");
                for item in list.iter_mut() {
                    if item.get("id").and_then(|v| v.as_str()) == Some(id) {
                        if let (Value::Object(dst), Some(src)) =
                            (item, params_val.as_object())
                        {
                            dst.extend(src.clone());
                        }
                        break;
                    }
                }
            }
            "DELETE" => {
                let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("");
                list.retain(|item| item.get("id").and_then(|v| v.as_str()) != Some(id));
            }
            _ => {}
        }

        let mut save_record = Map::new();
        save_record.insert("id".into(), Value::String("roleList".into()));
        save_record.insert("data".into(), Value::Array(list));
        let _ = self.record_manager.create_record("csm", "index", save_record, None);

        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "ok");
        r.set("result", params_val);
        r
    }

    pub fn handle_role_menu(&self) -> StandardResponse {
        let filter = SearchFilter::eq("id", "menuR");
        let data = self.record_manager.find("csm", "index", &filter);
        let list = data.get("data").cloned().unwrap_or(Value::Array(vec![]));
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "ok");
        r.set("result", list);
        r
    }
}
