use std::sync::Arc;

use serde_json::{Map, Value};

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};
use crate::security::auth::AuthUser;
use crate::services::chat::ChatPersistenceService;
use crate::services::user::UserService;

const RESERVED_INDEX_IDS: &[&str] = &[
    "menu", "menuR", "roleList", "deptList", "permissionList", "routers",
];

pub struct TableHandler {
    record_manager: Arc<RecordManager>,
    #[allow(dead_code)]
    user_service: Arc<UserService>,
    #[allow(dead_code)]
    chat_service: Arc<ChatPersistenceService>,
}

impl TableHandler {
    pub fn new(
        record_manager: Arc<RecordManager>,
        user_service: Arc<UserService>,
        chat_service: Arc<ChatPersistenceService>,
    ) -> Self {
        Self {
            record_manager,
            user_service,
            chat_service,
        }
    }

    pub fn handle_create_table(&self, params: &Map<String, Value>) -> StandardResponse {
        let result = self.record_manager.create_table(params);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", result.get("success").and_then(|v| v.as_bool()).unwrap_or(true));
        r.set("message", result.get("message").cloned().unwrap_or(Value::String("ok".into())));
        r.set("result", Value::Object(result));
        r
    }

    pub fn handle_drop_table(&self, params: &Map<String, Value>) -> StandardResponse {
        let result = self.record_manager.drop_table(params);
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", result.get("success").and_then(|v| v.as_bool()).unwrap_or(true));
        r.set("message", result.get("message").cloned().unwrap_or(Value::Null));
        r
    }

    pub fn handle_get_table_data(&self, params: &Map<String, Value>, auth: Option<&AuthUser>) -> StandardResponse {
        let result = self.handle_table_operation(params, false, auth);
        let mut r = StandardResponse::new();
        let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(true);
        r.set("code", if success { 200 } else { 403 });
        r.set("success", success);
        if let Some(msg) = result.get("message") {
            r.set("message", msg.clone());
        }
        r.set("result", Value::Object(result));
        r
    }

    pub fn handle_update_table_data(
        &self,
        params: &Map<String, Value>,
        auth: Option<&AuthUser>,
    ) -> StandardResponse {
        let result = self.handle_table_operation(params, true, auth);
        let mut r = StandardResponse::new();
        let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(true);
        r.set("code", if success { 200 } else { 403 });
        r.set("success", success);
        if let Some(msg) = result.get("message") {
            r.set("message", msg.clone());
        }
        r.set("result", Value::Object(result));
        r
    }

    fn handle_table_operation(
        &self,
        params: &Map<String, Value>,
        is_update: bool,
        auth: Option<&AuthUser>,
    ) -> Map<String, Value> {
        let mut out = Map::new();
        let app_id = params
            .get("app_id")
            .and_then(|v| v.as_str())
            .or_else(|| auth.map(|a| a.app_id.as_str()))
            .unwrap_or("default");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");

        if RESERVED_INDEX_IDS.contains(&table) {
            out.insert("success".into(), Value::Bool(false));
            out.insert(
                "message".into(),
                Value::String(format!("Table name '{table}' is reserved")),
            );
            return out;
        }

        if !table.starts_with("csm_") && !table.starts_with("sys_") {
            if let Some(user) = auth {
                if !user.dev && user.app_id != app_id && user.app_id != "csm" {
                    out.insert("success".into(), Value::Bool(false));
                    out.insert(
                        "message".into(),
                        Value::String(format!("Cross-app access denied for '{app_id}'")),
                    );
                    return out;
                }
            }
        }

        let filter: SearchFilter = params
            .get("e_where")
            .or_else(|| params.get("filter"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        if is_update {
            let record: Map<String, Value> = params
                .get("obj_update")
                .or_else(|| params.get("data"))
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();
            match self.record_manager.create_record(app_id, table, record, None) {
                Ok(cmd) => {
                    out.insert("success".into(), Value::Bool(true));
                    out.insert("message".into(), Value::String(format!("Record {cmd}")));
                }
                Err(e) => {
                    out.insert("success".into(), Value::Bool(false));
                    out.insert("message".into(), Value::String(e.to_string()));
                }
            }
        } else {
            let take = params.get("take").and_then(|v| v.as_u64()).unwrap_or(500) as usize;
            let cursor = params.get("cursor").and_then(|v| v.as_str());
            let data = self.record_manager.filter_with_pagination(
                app_id, table, &filter, cursor, None, take,
            );
            out.insert("success".into(), Value::Bool(true));
            out.insert("data".into(), Value::Object(data));
        }
        out
    }

    pub fn backup_db(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        match self.record_manager.backup_db(app_id, table) {
            Ok(_) => {
                r.set("success", true);
                r.set("message", format!("Backed up {table}"));
            }
            Err(e) => {
                r.set("success", false);
                r.set("message", e.to_string());
            }
        }
        r
    }

    pub fn restore_db(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        match self.record_manager.restore_db(app_id, table) {
            Ok(_) => {
                r.set("success", true);
                r.set("message", format!("Restored {table}"));
            }
            Err(e) => {
                r.set("success", false);
                r.set("message", e.to_string());
            }
        }
        r
    }

    pub fn handle_bulk_update(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        let ops = params
            .get("operations")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let total = ops.len();
        let mut success_count = 0usize;
        for op in ops {
            if let Some(obj) = op.as_object() {
                if self
                    .record_manager
                    .create_record(app_id, table, obj.clone(), None)
                    .is_ok()
                {
                    success_count += 1;
                }
            }
        }
        r.set("code", 200);
        r.set("success", true);
        r.set("total", total);
        r.set("successCount", success_count);
        r.set("failedCount", total.saturating_sub(success_count));
        r
    }

    pub fn handle_index_existing(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        match self.record_manager.index_existing_records(app_id, table) {
            Ok(n) => {
                r.set("success", true);
                r.set("message", format!("Indexed {n} records for {table}"));
            }
            Err(e) => {
                r.set("success", false);
                r.set("message", e.to_string());
            }
        }
        r
    }

    pub fn migrate_keys(&self, params: &Map<String, Value>) -> StandardResponse {
        let mut r = StandardResponse::new();
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        match self.record_manager.migrate_keys(app_id, table) {
            Ok(_) => {
                r.set("success", true);
                r.set("message", format!("Migrated keys for {table}"));
            }
            Err(e) => {
                r.set("success", false);
                r.set("message", e.to_string());
            }
        }
        r
    }
}
