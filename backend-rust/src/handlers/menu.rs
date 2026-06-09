use std::sync::Arc;

use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};
use crate::security::auth::AuthUser;

pub struct MenuHandler {
    record_manager: Arc<RecordManager>,
}

impl MenuHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn handle_menu_list(&self, auth: Option<&AuthUser>) -> StandardResponse {
        let filter = SearchFilter::eq("id", "menuList");
        let data = self.record_manager.find("csm", "index", &filter);
        let all_menus: Vec<Value> = match data.get("data") {
            Some(Value::Array(arr)) => arr.clone(),
            _ => vec![],
        };

        let filtered = if let Some(user) = auth {
            let is_privileged = user.dev
                || user.permissions.iter().any(|p| {
                    p.eq_ignore_ascii_case("admin") || p.eq_ignore_ascii_case("dev")
                });
            if is_privileged {
                all_menus
            } else {
                filter_menus_by_permissions(&all_menus, user.menus_permissions.as_deref())
            }
        } else {
            vec![]
        };

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

    pub fn handle_menu_by_role_id(&self, params: &Map<String, Value>) -> StandardResponse {
        let role_id = params
            .get("id")
            .or_else(|| params.get("role_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let filter = SearchFilter::eq("id", "menuR");
        let menu_r = self.record_manager.find("csm", "index", &filter);

        let menu_ids = if role_id == "1" {
            let data = menu_r.get("data").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let ids: Vec<Value> = data
                .iter()
                .filter_map(|item| item.get("id").cloned())
                .collect();
            Value::Array(ids)
        } else {
            Value::Array(vec![])
        };

        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "ok");
        r.set("result", menu_ids);
        r
    }

    pub fn handle_menu_item(&self, method: &str, params: &Map<String, Value>) -> StandardResponse {
        let filter = SearchFilter::eq("id", "menuList");
        let data = self.record_manager.find("csm", "index", &filter);
        let mut list: Vec<Value> = match data.get("data") {
            Some(Value::Array(arr)) => arr.clone(),
            _ => vec![],
        };

        match method.to_uppercase().as_str() {
            "POST" => {
                let mut item = Value::Object(params.clone());
                if let Value::Object(ref mut m) = item {
                    m.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
                }
                list.push(item);
            }
            "PUT" => {
                let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("");
                for item in list.iter_mut() {
                    if item.get("id").and_then(|v| v.as_str()) == Some(id) {
                        if let Value::Object(dst) = item {
                            dst.extend(params.clone());
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
        save_record.insert("id".into(), Value::String("menuList".into()));
        save_record.insert("data".into(), Value::Array(list));
        let _ = self.record_manager.create_record("csm", "index", save_record, None);

        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "ok");
        r.set("result", json!({}));
        r
    }
}

fn filter_menus_by_permissions(menus: &[Value], allowed_ids: Option<&[String]>) -> Vec<Value> {
    // Java: null allowedMenuIds → return all menus unchanged
    let Some(allowed_ids) = allowed_ids else {
        return menus.to_vec();
    };

    menus
        .iter()
        .filter_map(|menu| {
            let menu_id = menu.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !allowed_ids.iter().any(|id| id == menu_id) {
                return None;
            }
            let mut filtered_menu = menu.clone();
            if let Some(children) = menu.get("children").and_then(|v| v.as_array()) {
                let filtered_children = filter_menus_by_permissions(children, Some(allowed_ids));
                if let Value::Object(ref mut m) = filtered_menu {
                    if !filtered_children.is_empty() {
                        m.insert("children".into(), Value::Array(filtered_children));
                    } else {
                        m.remove("children");
                    }
                }
            }
            Some(filtered_menu)
        })
        .collect()
}
