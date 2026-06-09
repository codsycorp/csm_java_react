use serde_json::Value;

use crate::model::SearchFilter;
use crate::security::auth::AuthUser;
use crate::util::{parse_app_token, PermissionBitfieldUtil, is_sub_user_role};

/// Mirrors Java `TableHandler.UserAccessContext`.
#[derive(Debug, Clone)]
pub struct UserAccessContext {
    pub is_admin: bool,
    pub is_dev: bool,
    pub is_sub_user: bool,
    pub app_id: String,
    pub permissions: Vec<String>,
    pub menus_permissions: Vec<String>,
    pub data_scope: String,
    pub data_app_ids: Vec<String>,
    pub owner_candidates: Vec<String>,
}

impl UserAccessContext {
    /// Mirrors Java `TableHandler.resolveCurrentUserAccessContext`.
    pub fn from_auth(user: Option<&AuthUser>, record_manager: &crate::data::RecordManager) -> Option<Self> {
        let user = user?;
        let token_meta = if !user.app_token.is_empty() {
            parse_app_token(record_manager, &user.app_token)
        } else {
            Default::default()
        };
        let is_sub_user = user.is_sub_user || is_sub_user_role(&token_meta.role);
        let menus_permissions = user.menus_permissions.clone().unwrap_or_default();
        let app_id = crate::util::app_id_from_token(record_manager, Some(&user.app_token))
            .filter(|id| !id.is_empty())
            .unwrap_or_else(|| user.app_id.clone());

        let mut permissions = user.permissions.clone();
        let parsed_token = PermissionBitfieldUtil::parse_security_token(user.permission_bitfield.as_deref());
        if parsed_token.is_some() {
            permissions =
                PermissionBitfieldUtil::permissions_from_bitfield(user.permission_bitfield.as_deref());
        }

        if user.dev {
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &["dev".into(), "admin".into(), "scope:all".into()],
            );
        }

        let is_admin_by_default = !user.dev && !is_sub_user;
        let is_admin = is_admin_by_default
            || permissions.iter().any(|p| p.eq_ignore_ascii_case("admin"))
            || token_meta.role.eq_ignore_ascii_case("admin")
            || parsed_token.is_some_and(PermissionBitfieldUtil::has_admin_privilege);

        let mut data_scope = if let Some(token) = parsed_token {
            PermissionBitfieldUtil::resolve_data_scope(token)
        } else if !user.data_scope.is_empty() {
            user.data_scope.clone()
        } else {
            PermissionBitfieldUtil::resolve_data_scope(PermissionBitfieldUtil::build_bitfield(
                &permissions,
                &menus_permissions,
                user.dev,
            ))
        };

        if !user.dev && is_admin && has_legacy_full_app_scope(&menus_permissions, &app_id) {
            data_scope = "ALL".into();
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &["admin".into(), "scope:all".into()],
            );
        }
        if user.dev {
            data_scope = "ALL".into();
        }

        let data_app_ids = if is_sub_user {
            vec![]
        } else {
            user.data_app_ids.clone()
        };

        Some(Self {
            is_admin,
            is_dev: user.dev,
            is_sub_user,
            app_id,
            permissions,
            menus_permissions,
            data_scope,
            data_app_ids,
            owner_candidates: collect_owner_candidates(user),
        })
    }

    /// Mirrors Java `TableHandler.canAccessAppData`.
    pub fn can_access_app_data(&self, target_app_id: &str) -> bool {
        let target = target_app_id.trim();
        if target.is_empty() {
            return true;
        }
        if self.is_dev {
            return true;
        }
        if self.app_id.eq_ignore_ascii_case("csm") {
            return true;
        }
        if self.app_id.eq_ignore_ascii_case(target) {
            return true;
        }
        self.data_app_ids
            .iter()
            .any(|a| a.eq_ignore_ascii_case(target))
    }
}

pub fn has_legacy_full_app_scope(menus_permissions: &[String], app_id: &str) -> bool {
    let normalized_app_id = app_id.trim().to_ascii_lowercase();
    if normalized_app_id.is_empty() || menus_permissions.is_empty() {
        return false;
    }
    menus_permissions.iter().any(|menu| {
        let normalized = menu.trim().to_ascii_lowercase();
        normalized == normalized_app_id
            || normalized == format!("app:{normalized_app_id}")
            || normalized == format!("/{normalized_app_id}")
    })
}

pub fn has_action_permission(permissions: &[String], action: &str) -> bool {
    let expected = action.trim().to_ascii_lowercase();
    if expected.is_empty() {
        return false;
    }
    permissions.iter().any(|permission| {
        let normalized = permission.trim().to_ascii_lowercase();
        normalized == expected || normalized == "admin"
    })
}

pub fn has_any_action_permission(permissions: &[String]) -> bool {
    for action in ["view", "create", "edit", "delete", "export", "admin", "dev"] {
        if has_action_permission(permissions, action) {
            return true;
        }
    }
    false
}

/// Mirrors Java `validateActionPermissionForCurrentUser` — only dev bypasses.
pub fn validate_action_permission(ctx: Option<&UserAccessContext>, required_action: &str) -> Option<String> {
    let Some(ctx) = ctx else {
        return None;
    };
    if ctx.is_dev {
        return None;
    }
    if required_action.is_empty() {
        return None;
    }
    if has_action_permission(&ctx.permissions, required_action) {
        return None;
    }
    Some(match required_action {
        "view" => "Bạn không có quyền xem dữ liệu (view)".into(),
        "create" => "Bạn không có quyền tạo dữ liệu (create)".into(),
        "edit" => "Bạn không có quyền cập nhật dữ liệu (edit)".into(),
        "delete" => "Bạn không có quyền xóa dữ liệu (delete)".into(),
        _ => "Bạn không có quyền thực hiện thao tác này".into(),
    })
}

pub fn resolve_required_action(params: &serde_json::Map<String, serde_json::Value>, is_update: bool) -> String {
    if !is_update {
        return "view".into();
    }
    match params
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "create" => "create".into(),
        "update" => "edit".into(),
        "delete" => "delete".into(),
        _ => String::new(),
    }
}

pub fn is_allowed_autosetup_template_read(
    app_id: &str,
    table_name: &str,
    is_update: bool,
    filter: &SearchFilter,
    ctx: Option<&UserAccessContext>,
) -> bool {
    if is_update {
        return false;
    }
    let Some(ctx) = ctx else {
        return false;
    };
    if app_id != "csm" || table_name != "sys_autos" {
        return false;
    }
    if ctx.is_dev {
        return true;
    }

    let eq_values = collect_eq_values(filter);
    let p_type = eq_values.get("p_type").map(String::as_str).unwrap_or("");
    let p_name = eq_values.get("p_name").map(String::as_str).unwrap_or("");
    if !is_p_type_zero_str(p_type) || p_name.is_empty() || ctx.app_id.is_empty() {
        return false;
    }
    is_same_or_broadcast_variant(&ctx.app_id, p_name)
}

pub fn filter_sys_autos_rows(
    rows: Value,
    filter: &SearchFilter,
    ctx: Option<&UserAccessContext>,
) -> Value {
    let Some(ctx) = ctx else {
        return rows;
    };
    if ctx.is_dev {
        return rows;
    }
    let eq_values = collect_eq_values(filter);
    let requested_p_name = eq_values.get("p_name").map(String::as_str).unwrap_or("");
    if requested_p_name.is_empty() {
        return Value::Array(vec![]);
    }
    let Some(arr) = rows.as_array() else {
        return rows;
    };
    let filtered: Vec<Value> = arr
        .iter()
        .filter(|row| {
            let p_name = field_value_as_str(row.get("p_name"));
            if !is_p_type_zero(row.get("p_type")) {
                return false;
            }
            if requested_p_name != p_name {
                return false;
            }
            is_same_or_broadcast_variant(&ctx.app_id, requested_p_name)
        })
        .cloned()
        .collect();
    Value::Array(filtered)
}

pub fn validate_system_user_table_access(
    table_name: &str,
    is_update: bool,
    params: &serde_json::Map<String, Value>,
    filter: &SearchFilter,
    ctx: Option<&UserAccessContext>,
) -> Option<String> {
    let ctx = ctx?;
    if table_name != "csm_accounts" || ctx.is_dev {
        return None;
    }
    if is_allowed_self_csm_accounts_access(is_update, params, filter, ctx) {
        return None;
    }
    Some("Bảng csm_accounts chỉ dành cho tài khoản dev. Admin/Sub-user vui lòng thao tác trên csm_group_members.".into())
}

pub fn validate_permission_group_app_boundary(
    app_id: &str,
    table_name: &str,
    ctx: Option<&UserAccessContext>,
) -> Option<String> {
    let ctx = ctx?;
    if ctx.is_dev || table_name != "csm_roles" {
        return None;
    }
    let context_app = ctx.app_id.trim();
    let target_app = app_id.trim();
    if context_app.is_empty() || target_app.is_empty() {
        return None;
    }
    if !context_app.eq_ignore_ascii_case(target_app) {
        return Some("Bạn chỉ được quản lý Nhóm quyền trong app_id của chính mình.".into());
    }
    None
}

fn is_allowed_self_csm_accounts_access(
    is_update: bool,
    params: &serde_json::Map<String, Value>,
    filter: &SearchFilter,
    ctx: &UserAccessContext,
) -> bool {
    if ctx.is_dev {
        return true;
    }
    if !ctx.is_admin {
        return false;
    }

    let eq_values = collect_eq_values(filter);
    let has_self_identity = matches_eq_candidate(&eq_values, &ctx.owner_candidates, &[
        "id", "username", "email", "phoneNumber", "phone_number", "app_token", "appToken", "source_app_token",
    ]);

    if !is_update {
        return has_self_identity;
    }

    let command = params
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if command != "update" {
        return false;
    }
    let obj_update = params.get("obj_update").and_then(|v| v.as_object());
    if obj_update.is_none() || obj_update.unwrap().is_empty() {
        return false;
    }
    has_self_identity
}

fn collect_owner_candidates(user: &AuthUser) -> Vec<String> {
    let mut out = Vec::new();
    for value in [
        user.user_id.as_str(),
        user.username.as_str(),
        user.email.as_str(),
        user.phone_number.as_str(),
        user.app_id.as_str(),
        user.app_token.as_str(),
    ] {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            out.push(trimmed.to_string());
        }
    }
    out
}

fn matches_eq_candidate(
    eq_values: &std::collections::HashMap<String, String>,
    candidates: &[String],
    fields: &[&str],
) -> bool {
    if eq_values.is_empty() || candidates.is_empty() {
        return false;
    }
    let candidate_set: std::collections::HashSet<String> = candidates
        .iter()
        .map(|v| v.trim().to_ascii_lowercase())
        .collect();
    for field in fields {
        if let Some(value) = eq_values.get(*field) {
            let normalized = value.trim().to_ascii_lowercase();
            if !normalized.is_empty() && candidate_set.contains(&normalized) {
                return true;
            }
        }
    }
    false
}

fn is_same_or_broadcast_variant(user_app_id: &str, requested: &str) -> bool {
    let user = user_app_id.trim();
    let requested = requested.trim();
    if user.is_empty() || requested.is_empty() {
        return false;
    }
    if user.eq_ignore_ascii_case(requested) {
        return true;
    }
    const BROADCAST_PREFIX: &str = "broadcast_";
    if let Some(suffix) = user.strip_prefix(BROADCAST_PREFIX) {
        return suffix.eq_ignore_ascii_case(requested);
    }
    if let Some(suffix) = requested.strip_prefix(BROADCAST_PREFIX) {
        return suffix.eq_ignore_ascii_case(user);
    }
    false
}

fn collect_eq_values(filter: &SearchFilter) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    collect_eq_values_inner(filter, &mut out);
    out
}

fn collect_eq_values_inner(filter: &SearchFilter, out: &mut std::collections::HashMap<String, String>) {
    if !filter.conditions.is_empty() {
        for condition in &filter.conditions {
            collect_eq_values_inner(condition, out);
        }
        return;
    }
    if !filter.filter_type.eq_ignore_ascii_case("eq") || filter.field.is_empty() {
        return;
    }
    if let Some(normalized) = normalize_eq_filter_value(&filter.value) {
        out.entry(filter.field.clone())
            .or_insert(normalized);
    }
}

/// Mirrors Java `safeStr` for filter/row field comparison (string or numeric JSON values).
fn normalize_eq_filter_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn field_value_as_str(value: Option<&Value>) -> String {
    value
        .and_then(|v| normalize_eq_filter_value(v))
        .unwrap_or_default()
}

fn is_p_type_zero_str(raw: &str) -> bool {
    let t = raw.trim();
    t == "0" || t.parse::<i64>().ok() == Some(0)
}

fn is_p_type_zero(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Number(n)) => {
            n.as_i64() == Some(0)
                || n.as_f64().map(|f| f.abs() < f64::EPSILON).unwrap_or(false)
        }
        Some(Value::String(s)) => {
            let t = s.trim();
            t == "0" || t.parse::<i64>().ok() == Some(0)
        }
        Some(Value::Bool(false)) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;
    use crate::data::RecordManager;
    use crate::model::SearchFilter;
    use std::sync::Arc;

    fn lmkt_broadcast_filter() -> SearchFilter {
        SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                SearchFilter::eq("p_name", "broadcast_lmkt"),
                SearchFilter::eq("p_type", 0i64),
            ],
            ..Default::default()
        }
    }

    fn lmkt_ctx(is_dev: bool) -> UserAccessContext {
        UserAccessContext {
            is_admin: !is_dev,
            is_dev,
            is_sub_user: false,
            app_id: "lmkt".into(),
            permissions: vec!["admin".into(), "view".into()],
            menus_permissions: vec![],
            data_scope: "ALL".into(),
            data_app_ids: vec![],
            owner_candidates: vec![],
        }
    }

    #[test]
    fn broadcast_variant_matches_home_app() {
        assert!(is_same_or_broadcast_variant("lmkt", "broadcast_lmkt"));
        assert!(is_same_or_broadcast_variant("lmkt", "lmkt"));
        assert!(!is_same_or_broadcast_variant("csm", "broadcast_lmkt"));
    }

    #[test]
    fn autosetup_read_allowed_for_broadcast_home_template() {
        let filter = lmkt_broadcast_filter();
        let ctx = lmkt_ctx(false);
        assert!(is_allowed_autosetup_template_read(
            "csm",
            "sys_autos",
            false,
            &filter,
            Some(&ctx),
        ));
    }

    #[test]
    fn sys_autos_broadcast_lmkt_row_survives_non_dev_filter() {
        std::env::set_var("APP_DATA_DIR", "/Volumes/Datas/CSM/JavaProjects/csm_server/csm_datas");
        std::env::set_var(
            "ROCKSDB_ROOT_DIR",
            "/Volumes/Datas/CSM/JavaProjects/csm_server/csm_datas/database",
        );
        let config = AppConfig::from_env().expect("config");
        let rm = Arc::new(RecordManager::new(config).expect("record manager"));
        let filter = lmkt_broadcast_filter();
        let data = rm.filter("csm", "sys_autos", &filter);
        let rows = data.get("rows").cloned().unwrap_or(Value::Array(vec![]));
        let raw_count = rows.as_array().map(|a| a.len()).unwrap_or(0);
        assert!(raw_count > 0, "expected broadcast_lmkt row in RocksDB");

        let ctx = lmkt_ctx(false);
        let filtered = filter_sys_autos_rows(rows, &filter, Some(&ctx));
        let filtered_count = filtered.as_array().map(|a| a.len()).unwrap_or(0);
        assert_eq!(filtered_count, raw_count, "non-dev lmkt user should keep broadcast row");

        let first = filtered.as_array().and_then(|a| a.first()).expect("row");
        assert_eq!(
            first.get("p_name").and_then(|v| v.as_str()),
            Some("broadcast_lmkt")
        );
        assert!(is_p_type_zero(first.get("p_type")));
        let p_code = first
            .get("p_code")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        assert!(!p_code.is_empty(), "p_code must be returned for client decrypt");
        let decrypted = rm.csm_decrypt(p_code).expect("p_code decrypt");
        assert!(
            !decrypted.trim().is_empty(),
            "decrypted broadcast home template must not be empty"
        );
    }
}
