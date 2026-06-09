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

    /// Trim large code fields in the updated_row response (mirrors Java trimLargeCodeFieldsInUpdatedRow).
    /// For sys_autos: replaces p_code > 8192 chars with "[saved:N chars]" to prevent nginx/response bloat.
    /// Applied only to the response row, NOT to what is stored in RocksDB.
    fn trim_large_code_fields(table: &str, mut row: Map<String, Value>) -> Map<String, Value> {
        const MAX_CODE_BYTES: usize = 8192;
        if table == "sys_autos" {
            if let Some(Value::String(code)) = row.get("p_code") {
                if code.len() > MAX_CODE_BYTES {
                    let n = code.len();
                    row.insert("p_code".into(), Value::String(format!("[saved:{n} chars]")));
                }
            }
        }
        row
    }

    /// Handle _changePassword / _oldPassword / _newPassword pattern (mirrors Java handlePasswordChangePayload).
    /// Returns (modified obj_update, optional error message).
    fn handle_password_change(
        &self,
        app_id: &str,
        table: &str,
        mut obj_update: Map<String, Value>,
        filter: &SearchFilter,
    ) -> (Map<String, Value>, Option<String>) {
        let change_flag = obj_update.remove("_changePassword");
        let old_pw = obj_update.remove("_oldPassword")
            .and_then(|v| match v { Value::String(s) => Some(s), _ => None })
            .unwrap_or_default();
        let new_pw = obj_update.remove("_newPassword")
            .and_then(|v| match v { Value::String(s) => Some(s), _ => None })
            .unwrap_or_default();

        let is_change = change_flag.as_ref().and_then(|v| v.as_bool()).unwrap_or(false)
            || change_flag.as_ref().and_then(|v| v.as_str())
                .map(|s| s.eq_ignore_ascii_case("true"))
                .unwrap_or(false);

        if !is_change {
            return (obj_update, None);
        }
        if new_pw.is_empty() {
            return (obj_update, Some("Mật khẩu mới không được để trống".into()));
        }

        let existing = self.record_manager.find(app_id, table, filter);
        if existing.is_empty() {
            return (obj_update, Some("Không xác định được tài khoản để đổi mật khẩu".into()));
        }

        let login_id = if table == "csm_accounts" {
            existing.get("username").or_else(|| existing.get("email")).or_else(|| existing.get("phoneNumber"))
        } else {
            existing.get("login_identifier")
        }
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

        if login_id.is_empty() {
            return (obj_update, Some("Không xác định được tài khoản để đổi mật khẩu".into()));
        }

        if !old_pw.is_empty() {
            let stored = existing.get("pass").and_then(|v| v.as_str()).unwrap_or("");
            if !stored.is_empty() {
                let expected = self.record_manager.csm_encrypt(&format!("{login_id}_____{old_pw}"));
                if expected != stored {
                    return (obj_update, Some("Mật khẩu cũ không chính xác".into()));
                }
            }
        }

        let encrypted = self.record_manager.csm_encrypt(&format!("{login_id}_____{new_pw}"));
        obj_update.insert("pass".into(), Value::String(encrypted));
        (obj_update, None)
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

        let message = if action == "delete" {
            format!("Table '{}' has been deleted.", table)
        } else {
            format!("Table '{}' has been {}d.", table, action)
        };
        let notification = serde_json::json!({
            "appId": app_id,
            "table": table,
            "action": action,
            "obj_name": table,
            "cmd": action,
            "primaryKeys": primary_keys,
            "dataRow": row,
            "data": row,
            "message": message,
            "success": true,
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

        if table == "index" {
            return self.handle_index_table_operation(app_id, params, is_update, auth);
        }

        // "index" is exempted from cross-app check — handled above.
        if table != "index" && !table.starts_with("csm_") && !table.starts_with("sys_") {
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
                // Handle _changePassword pattern before merging (mirrors Java handlePasswordChangePayload).
                let (obj_update, pw_err) = self.handle_password_change(app_id, table, obj_update, &filter);
                if let Some(err) = pw_err {
                    out.insert("success".into(), Value::Bool(false));
                    out.insert("message".into(), Value::String(err));
                    return out;
                }

                // Merge incoming fields on top of the existing record.
                // When obj_update lacks PK fields (e.g. profile update sends only full_name/avatar),
                // use the e_where filter to locate the record first — mirrors Java's filter-then-merge.
                let has_filter = !filter.conditions.is_empty() || !filter.field.is_empty();
                let final_obj = if has_filter {
                    let existing = self.record_manager.find(app_id, table, &filter);
                    if !existing.is_empty() {
                        let mut merged = existing;
                        for (k, v) in obj_update {
                            merged.insert(k, v);
                        }
                        merged
                    } else {
                        self.merge_with_existing(app_id, table, obj_update)
                    }
                } else {
                    self.merge_with_existing(app_id, table, obj_update)
                };

                match self.record_manager.create_record(app_id, table, final_obj.clone(), None) {
                    Ok(cmd) => {
                        out.insert("success".into(), Value::Bool(true));
                        out.insert("command".into(), Value::String(cmd.clone()));
                        out.insert("message".into(), Value::String("ok".into()));
                        let response_row = Self::trim_large_code_fields(table, final_obj.clone());
                        out.insert("updated_row".into(), Value::Object(response_row));
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
            let response_row = Self::trim_large_code_fields(op_table, saved_row);
            op_result.insert("updated_row".into(), Value::Object(response_row));
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

    /// Mirrors Java `TableHandler.handleIndexTableOperation`.
    fn handle_index_table_operation(
        &self,
        app_id: &str,
        params: &Map<String, Value>,
        is_update: bool,
        auth: Option<&AuthUser>,
    ) -> Map<String, Value> {
        let mut out = Map::new();
        let filter: SearchFilter = params
            .get("e_where")
            .or_else(|| params.get("filter"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let take = parse_usize_param(params.get("take"));
        let offset = parse_usize_param(params.get("offset"));
        let limit = parse_usize_param(params.get("limit"));
        let lastkey = params
            .get("lastkey")
            .or_else(|| params.get("cursor"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let filter_result = if let Some(lim) = limit.filter(|&n| n > 0) {
            let safe_offset = offset.unwrap_or(0);
            self.record_manager
                .filter_with_pagination(app_id, "index", &filter, None, Some(safe_offset), lim)
        } else if let Some(t) = take.filter(|&n| n > 0) {
            self.record_manager.filter_with_pagination(
                app_id,
                "index",
                &filter,
                lastkey.as_deref(),
                None,
                t,
            )
        } else {
            self.record_manager.filter(app_id, "index", &filter)
        };

        let tables: Vec<Map<String, Value>> = filter_result
            .get("rows")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_object().cloned())
                    .collect()
            })
            .unwrap_or_default();

        if !is_update {
            let rows = extract_index_read_rows(&tables);
            out.insert("success".into(), Value::Bool(true));
            out.insert("id".into(), Value::String("index".into()));
            out.insert("rows".into(), Value::Array(rows));
            if let Some(cursor) = filter_result.get("nextCursor") {
                out.insert("nextCursor".into(), cursor.clone());
            }
            return out;
        }

        if let Some(user) = auth {
            if !user.dev && !user.can_access_app_data(app_id) {
                out.insert("success".into(), Value::Bool(false));
                out.insert(
                    "message".into(),
                    Value::String(format!(
                        "Bạn không có quyền thay đổi dữ liệu của ứng dụng '{app_id}'"
                    )),
                );
                return out;
            }
        }

        let command = params
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        let obj_update: Map<String, Value> = params
            .get("obj_update")
            .or_else(|| params.get("data"))
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        if obj_update.is_empty() {
            out.insert("success".into(), Value::Bool(false));
            out.insert("message".into(), Value::String("Thiếu dữ liệu cập nhật".into()));
            return out;
        }

        let record_id = obj_update.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let mut existing_rows = tables;
        if !record_id.is_empty() && existing_rows.is_empty() {
            let id_filter = SearchFilter::eq("id", record_id);
            existing_rows = self
                .record_manager
                .filter(app_id, "index", &id_filter)
                .get("rows")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_object().cloned())
                        .collect()
                })
                .unwrap_or_default();
        }

        match command.as_str() {
            "create" => {
                if record_id.is_empty() {
                    out.insert("success".into(), Value::Bool(false));
                    out.insert(
                        "message".into(),
                        Value::String("Thiếu giá trị khóa chính 'id'".into()),
                    );
                    return out;
                }
                if self
                    .record_manager
                    .exists_by_primary_key(app_id, "index", &obj_update, &["id".to_string()])
                {
                    out.insert("success".into(), Value::Bool(false));
                    out.insert(
                        "message".into(),
                        Value::String("Trùng khóa chính (id) cho bảng index".into()),
                    );
                    return out;
                }
                if !existing_rows.is_empty() {
                    // fall through to update semantics like Java
                } else {
                    match self.record_manager.create_record(app_id, "index", obj_update.clone(), None)
                    {
                        Ok(cmd) => {
                            self.emit_update_notification(app_id, "index", &cmd, &obj_update);
                            out.insert("success".into(), Value::Bool(true));
                            out.insert("command".into(), Value::String(cmd));
                            out.insert("message".into(), Value::String("Thao tác thành công".into()));
                            out.insert("updated_row".into(), Value::Object(obj_update));
                            return out;
                        }
                        Err(e) => {
                            out.insert("success".into(), Value::Bool(false));
                            out.insert("message".into(), Value::String(e.to_string()));
                            return out;
                        }
                    }
                }
            }
            "delete" => {
                for row in &existing_rows {
                    if row.get("id").and_then(|v| v.as_str()) == Some(record_id) {
                        if self.record_manager.delete_record(app_id, "index", row).is_ok() {
                            self.emit_update_notification(app_id, "index", "delete", row);
                            out.insert("success".into(), Value::Bool(true));
                            out.insert("command".into(), Value::String("delete".into()));
                            out.insert("message".into(), Value::String("Thao tác thành công".into()));
                            return out;
                        }
                    }
                }
                out.insert("success".into(), Value::Bool(false));
                out.insert("message".into(), Value::String("Không tìm thấy bản ghi index".into()));
                return out;
            }
            "update" | "" => {}
            _ => {
                out.insert("success".into(), Value::Bool(false));
                out.insert(
                    "message".into(),
                    Value::String("Lệnh không hợp lệ cho bảng index".into()),
                );
                return out;
            }
        }

        // update (also used when create finds existing row)
        for row in existing_rows {
            if row.get("id").and_then(|v| v.as_str()) == Some(record_id) {
                let mut merged = row;
                for (k, v) in obj_update {
                    merged.insert(k, v);
                }
                match self.record_manager.create_record(app_id, "index", merged.clone(), None) {
                    Ok(cmd) => {
                        self.emit_update_notification(app_id, "index", &cmd, &merged);
                        out.insert("success".into(), Value::Bool(true));
                        out.insert("command".into(), Value::String(cmd));
                        out.insert("message".into(), Value::String("Thao tác thành công".into()));
                        out.insert("updated_row".into(), Value::Object(merged));
                        return out;
                    }
                    Err(e) => {
                        out.insert("success".into(), Value::Bool(false));
                        out.insert("message".into(), Value::String(e.to_string()));
                        return out;
                    }
                }
            }
        }

        out.insert("success".into(), Value::Bool(false));
        out.insert("message".into(), Value::String("Không tìm thấy bản ghi index".into()));
        out
    }
}

fn parse_usize_param(value: Option<&Value>) -> Option<usize> {
    let v = value?;
    v.as_u64()
        .map(|n| n as usize)
        .or_else(|| v.as_i64().and_then(|n| (n >= 0).then_some(n as usize)))
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

/// Java: when exactly one index row is returned, unwrap `.data` array or return the row itself.
fn extract_index_read_rows(tables: &[Map<String, Value>]) -> Vec<Value> {
    if tables.len() == 1 {
        let record = &tables[0];
        if let Some(Value::Array(data)) = record.get("data") {
            let items: Vec<Value> = data
                .iter()
                .filter_map(|item| item.as_object().map(|m| Value::Object(m.clone())))
                .collect();
            return items;
        }
        return vec![Value::Object(record.clone())];
    }
    tables
        .iter()
        .map(|row| Value::Object(row.clone()))
        .collect()
}
