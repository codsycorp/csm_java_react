use std::sync::Arc;

use serde_json::{Map, Value};

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};
use crate::security::auth::AuthUser;
use crate::services::chat::ChatPersistenceService;
use crate::services::user::UserService;
use crate::socket::SocketIo;

// Mirrors Java TableHandler.RESERVED_INDEX_IDS exactly
const RESERVED_INDEX_IDS: &[&str] = &[
    "menu", "menuList", "menuR", "roleList", "accessRights", "menu_permissions",
];

pub struct TableHandler {
    record_manager: Arc<RecordManager>,
    #[allow(dead_code)]
    user_service: Arc<UserService>,
    #[allow(dead_code)]
    chat_service: Arc<ChatPersistenceService>,
    socket_io: SocketIo,
}

impl TableHandler {
    pub fn new(
        record_manager: Arc<RecordManager>,
        user_service: Arc<UserService>,
        chat_service: Arc<ChatPersistenceService>,
        socket_io: SocketIo,
    ) -> Self {
        Self {
            record_manager,
            user_service,
            chat_service,
            socket_io,
        }
    }

    /// Read existing record by its PK values then overlay obj_update on top.
    /// Mirrors Java: newRow = new LinkedHashMap<>(existingRow); newRow.putAll(objUpdate).
    fn merge_with_existing(
        &self,
        app_id: &str,
        table: &str,
        obj_update: Map<String, Value>,
    ) -> Map<String, Value> {
        let existing = self.record_manager.find_existing_by_pk_values(app_id, table, &obj_update);
        if existing.is_empty() {
            return obj_update;
        }
        let mut merged = existing;
        for (k, v) in obj_update {
            merged.insert(k, v);
        }
        merged
    }

    /// Broadcast csm_msg_update to app room + csm admin room.
    /// Mirrors Java socketIOConfig.sendUpdateNotification(appId, table, action, pkValues, row).
    fn emit_update_notification(&self, app_id: &str, table: &str, action: &str, row: &Map<String, Value>) {
        let pk_fields = self.record_manager
            .get_table_search_keys(app_id, table, "fieldsPK")
            .unwrap_or_default();
        let primary_keys: Map<String, Value> = pk_fields.iter()
            .filter_map(|f| row.get(f).map(|v| (f.clone(), v.clone())))
            .collect();

        let notification = serde_json::json!({
            "appId": app_id,
            "table": table,
            "action": action,
            "primaryKeys": primary_keys,
            "dataRow": row,
        });

        let _ = self.socket_io.to(app_id.to_string()).emit("csm_msg_update", &notification);
        if app_id != "csm" {
            let _ = self.socket_io.to("csm".to_string()).emit("csm_msg_update", &notification);
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
        // Java always returns HTTP 200 (Spring default); code field is 200/400 in JSON body only.
        // Rust's StandardResponse maps code→HTTP status, so always use 200 to match Java behavior.
        r.set("code", 200);
        r.set("success", success);
        r.set(
            "message",
            result.get("message").cloned().unwrap_or_else(|| {
                Value::String(if success { "ok".into() } else { "error".into() })
            }),
        );

        if !success {
            return r;
        }

        // Mirrors Java's response.setProperties(result) — inline all result keys
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
        let table = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        r.set("id", table);

        if let Some(rows) = result.get("rows") {
            r.set("rows", rows.clone());
        }
        if let Some(cursor) = result.get("nextCursor") {
            r.set("nextCursor", cursor.clone());
        }

        // fetch struct (fieldsPK / fields) from index — mirrors Java's ensureTableStructReadyForOperation
        let struct_filter = crate::model::SearchFilter::eq("id", table);
        let struct_record = self.record_manager.find(app_id, "index", &struct_filter);
        if let Some(Value::Object(struct_map)) = struct_record.get("struct") {
            if let Some(pk) = struct_map.get("fieldsPK") {
                r.set("fieldsPK", pk.clone());
            }
            if let Some(fields) = struct_map.get("fields") {
                r.set("fields", fields.clone());
            }
        }
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
        // Java: HTTP 200 always, code field in JSON body is 200/400
        r.set("code", 200);
        r.set("success", success);
        r.set(
            "message",
            result
                .get("message")
                .cloned()
                .unwrap_or_else(|| Value::String(if success { "ok".into() } else { "error".into() })),
        );

        // Mirror Java's copyIfPresent for fields the client needs
        for key in &["command", "socket_actions", "updated_row", "obj_name", "app_id"] {
            if let Some(v) = result.get(*key) {
                r.set(*key, v.clone());
            }
        }
        // ensure obj_name / app_id come through even if result didn't copy them
        if r.get("obj_name").is_none() {
            if let Some(v) = params.get("obj_name") {
                r.set("obj_name", v.clone());
            }
        }
        if r.get("app_id").is_none() {
            if let Some(v) = params.get("app_id") {
                r.set("app_id", v.clone());
            }
        }
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
                if !user.can_access_app_data(app_id) {
                    let action = if is_update { "write" } else { "read" };
                    out.insert("success".into(), Value::Bool(false));
                    out.insert(
                        "message".into(),
                        Value::String(format!(
                            "Cross-app {action} denied for '{app_id}' (user.app_id='{}')",
                            user.app_id
                        )),
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
            let command = params
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("create")
                .to_ascii_lowercase();

            let obj_update: Map<String, Value> = params
                .get("obj_update")
                .or_else(|| params.get("data"))
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();

            if command == "delete" {
                // obj_update contains the record with primary key values.
                // e_where is a SearchFilter (field/type/value structure), not a flat record map —
                // so we must NOT pass e_where directly to delete_record.
                // If obj_update is empty, fall back to finding the record via the filter.
                let target = if !obj_update.is_empty() {
                    obj_update.clone()
                } else if let Ok(sf) = serde_json::from_value::<SearchFilter>(
                    params.get("e_where").cloned().unwrap_or(Value::Null),
                ) {
                    self.record_manager.find(app_id, table, &sf)
                } else {
                    obj_update.clone()
                };

                if target.is_empty() {
                    out.insert("success".into(), Value::Bool(false));
                    out.insert("message".into(), Value::String("Record not found for delete".into()));
                } else {
                    match self.record_manager.delete_record(app_id, table, &target) {
                        Ok(()) => {
                            out.insert("success".into(), Value::Bool(true));
                            out.insert("command".into(), Value::String("delete".into()));
                            out.insert("message".into(), Value::String("Record deleted".into()));
                            out.insert("updated_row".into(), Value::Object(target.clone()));
                            // Notify connected clients (mirrors Java sendUpdateNotification)
                            self.emit_update_notification(app_id, table, "delete", &target);
                        }
                        Err(e) => {
                            out.insert("success".into(), Value::Bool(false));
                            out.insert("message".into(), Value::String(e.to_string()));
                        }
                    }
                }
            } else {
                // Merge incoming fields on top of the existing record to avoid overwriting
                // fields the client didn't include — mirrors Java's newRow.putAll(objUpdate).
                let final_obj = self.merge_with_existing(app_id, table, obj_update);
                match self.record_manager.create_record(app_id, table, final_obj.clone(), None) {
                    Ok(cmd) => {
                        out.insert("success".into(), Value::Bool(true));
                        out.insert("command".into(), Value::String(cmd.clone()));
                        out.insert("message".into(), Value::String("ok".into()));
                        out.insert("updated_row".into(), Value::Object(final_obj.clone()));
                        out.insert("obj_name".into(), Value::String(table.to_string()));
                        out.insert("app_id".into(), Value::String(app_id.to_string()));
                        // Notify connected clients (mirrors Java sendUpdateNotification)
                        self.emit_update_notification(app_id, table, &cmd, &final_obj);
                    }
                    Err(e) => {
                        out.insert("success".into(), Value::Bool(false));
                        out.insert("message".into(), Value::String(e.to_string()));
                    }
                }
            }
        } else {
            let take = params.get("take").and_then(|v| v.as_u64()).unwrap_or(500) as usize;
            let cursor = params.get("cursor").and_then(|v| v.as_str());
            let lastkey = params.get("lastkey").and_then(|v| v.as_str()).or(cursor);
            let data = self.record_manager.filter_with_pagination(
                app_id, table, &filter, lastkey, None, take,
            );
            let rows = data.get("rows")
                .or_else(|| data.get("data"))
                .cloned()
                .unwrap_or(Value::Array(vec![]));
            out.insert("success".into(), Value::Bool(true));
            out.insert("rows".into(), rows);
            if let Some(cursor_val) = data.get("nextCursor") {
                out.insert("nextCursor".into(), cursor_val.clone());
            }
            if let Some(tc) = data.get("totalCount") {
                out.insert("totalCount".into(), tc.clone());
            }
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
        let continue_on_error = params
            .get("continue_on_error")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let ops = params
            .get("operations")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let total = ops.len();
        let mut success_count = 0usize;
        let mut failed_count = 0usize;
        let mut results: Vec<Value> = Vec::with_capacity(total);

        for (i, op) in ops.into_iter().enumerate() {
            let mut op_result = Map::new();
            op_result.insert("index".into(), Value::Number(i.into()));

            let Some(obj) = op.as_object() else {
                failed_count += 1;
                op_result.insert("success".into(), Value::Bool(false));
                op_result.insert("message".into(), Value::String("Invalid operation".into()));
                results.push(Value::Object(op_result));
                if !continue_on_error { break; }
                continue;
            };

            let op_app_id = obj.get("app_id").and_then(|v| v.as_str()).unwrap_or(app_id);
            let op_table = obj.get("obj_name").and_then(|v| v.as_str()).unwrap_or(table);
            let command = obj.get("command").and_then(|v| v.as_str()).unwrap_or("create").to_ascii_lowercase();

            let obj_update: Map<String, Value> = obj
                .get("obj_update")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_else(|| obj.clone());

            let (item_ok, cmd_str, msg, saved_row) = if command == "delete" {
                // obj_update has pk values; e_where is a SearchFilter (not a flat map)
                let target = if !obj_update.is_empty() {
                    obj_update.clone()
                } else if let Ok(sf) = serde_json::from_value::<SearchFilter>(
                    obj.get("e_where").cloned().unwrap_or(Value::Null),
                ) {
                    self.record_manager.find(op_app_id, op_table, &sf)
                } else {
                    obj_update.clone()
                };
                if target.is_empty() {
                    (false, "delete".to_string(), "Record not found for delete".to_string(), obj_update)
                } else {
                    match self.record_manager.delete_record(op_app_id, op_table, &target) {
                        Ok(()) => (true, "delete".to_string(), "ok".to_string(), target),
                        Err(e) => (false, "delete".to_string(), e.to_string(), obj_update),
                    }
                }
            } else {
                // Merge incoming fields on top of existing record (mirrors Java newRow.putAll)
                let final_obj = self.merge_with_existing(op_app_id, op_table, obj_update);
                match self.record_manager.create_record(op_app_id, op_table, final_obj.clone(), None) {
                    Ok(cmd) => (true, cmd, "ok".to_string(), final_obj),
                    Err(e) => (false, command.clone(), e.to_string(), Map::new()),
                }
            };

            if item_ok {
                success_count += 1;
                self.emit_update_notification(op_app_id, op_table, &cmd_str, &saved_row);
            } else {
                failed_count += 1;
            }
            op_result.insert("success".into(), Value::Bool(item_ok));
            op_result.insert("command".into(), Value::String(cmd_str));
            op_result.insert("message".into(), Value::String(msg));
            op_result.insert("updated_row".into(), Value::Object(saved_row));
            results.push(Value::Object(op_result));

            if !item_ok && !continue_on_error { break; }
        }

        let all_success = failed_count == 0;
        let partial = success_count > 0 && failed_count > 0;
        r.set("code", if all_success { 200 } else if partial { 207 } else { 400 });
        r.set("success", all_success);
        r.set("partial", partial);
        r.set(
            "message",
            if all_success { "Bulk update thành công" }
            else if partial { "Bulk update hoàn tất với một số lỗi" }
            else { "Bulk update thất bại" },
        );
        r.set("total", total);
        r.set("successCount", success_count);
        r.set("failedCount", failed_count);
        r.set("results", Value::Array(results));
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
