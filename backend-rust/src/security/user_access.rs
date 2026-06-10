use serde_json::{Map, Value};

use crate::data::RecordManager;
use crate::model::SearchFilter;
use crate::security::auth::AuthUser;
use crate::util::{parse_app_token, PermissionBitfieldUtil, is_sub_user_role};

const OWNER_SCOPE_FIELDS: &[&str] = &[
    "created_by", "create_by", "owner_id", "owner", "user_id", "userid", "account_id",
    "parent_account_id",
];
const DEPARTMENT_SCOPE_FIELDS: &[&str] = &["dept_id", "department_id", "team_id"];
const BRANCH_SCOPE_FIELDS: &[&str] = &["branch_id", "branchId"];

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
    pub parent_account_candidates: Vec<String>,
    pub department_candidates: Vec<String>,
    pub branch_candidates: Vec<String>,
    pub preferred_owner: String,
    pub preferred_department: String,
    pub preferred_branch: String,
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
        let mut menus_permissions = user.menus_permissions.clone().unwrap_or_default();
        let mut app_id = crate::util::app_id_from_token(record_manager, Some(&user.app_token))
            .filter(|id| !id.is_empty())
            .unwrap_or_else(|| user.app_id.clone());
        if app_id.is_empty() {
            app_id = resolve_primary_app_id_from_menus(&menus_permissions);
        }

        let mut permissions = user.permissions.clone();
        let parsed_token = PermissionBitfieldUtil::parse_security_token(user.permission_bitfield.as_deref());
        if parsed_token.is_some() {
            let from_token =
                PermissionBitfieldUtil::permissions_from_bitfield(user.permission_bitfield.as_deref());
            permissions =
                PermissionBitfieldUtil::merge_unique_case_insensitive(&permissions, &from_token);
        }

        if user.dev {
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &["dev".into(), "admin".into(), "scope:all".into()],
            );
        }

        if is_sub_user {
            permissions = PermissionBitfieldUtil::subtract_case_insensitive(
                &permissions,
                &["admin".into(), "dev".into(), "scope:all".into()],
            );
        }

        let is_admin_by_default = !user.dev && !is_sub_user;
        let mut is_admin = if is_sub_user {
            false
        } else {
            is_admin_by_default
                || permissions.iter().any(|p| p.eq_ignore_ascii_case("admin"))
                || token_meta.role.eq_ignore_ascii_case("admin")
                || parsed_token.is_some_and(PermissionBitfieldUtil::has_admin_privilege)
        };

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

        if !user.dev && !is_sub_user && is_admin && has_legacy_full_app_scope(&menus_permissions, &app_id) {
            data_scope = "ALL".into();
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &["admin".into(), "scope:all".into()],
            );
            is_admin = true;
        }
        if user.dev {
            data_scope = "ALL".into();
        }

        // Mirror Java mapMainAccountToUser: main accounts always operate with full app admin scope.
        if is_admin_by_default && !is_sub_user && !user.dev {
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &[
                    "admin".into(),
                    "scope:all".into(),
                    "view".into(),
                    "create".into(),
                    "edit".into(),
                    "delete".into(),
                    "export".into(),
                ],
            );
            if menus_permissions.is_empty() && !app_id.is_empty() {
                menus_permissions = vec![app_id.clone()];
            }
            data_scope = "ALL".into();
            is_admin = true;
        }

        let owner_candidates = collect_owner_candidates(user);
        let parent_account_candidates = collect_parent_account_candidates(user);
        let department_candidates = collect_department_candidates(user);
        let branch_candidates = collect_branch_candidates(user);
        let preferred_owner = owner_candidates
            .first()
            .cloned()
            .unwrap_or_default();
        let preferred_department = department_candidates
            .first()
            .cloned()
            .unwrap_or_default();
        let preferred_branch = branch_candidates.first().cloned().unwrap_or_default();

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
            owner_candidates,
            parent_account_candidates,
            department_candidates,
            branch_candidates,
            preferred_owner,
            preferred_department,
            preferred_branch,
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
    if !is_p_type_zero_str(p_type) || p_name.is_empty() {
        return false;
    }
    let effective_app_id = resolve_autosetup_effective_app_id(ctx, p_name);
    if effective_app_id.is_empty() {
        return false;
    }
    is_same_or_broadcast_variant(&effective_app_id, p_name)
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
            let effective_app_id = resolve_autosetup_effective_app_id(ctx, requested_p_name);
            !effective_app_id.is_empty()
                && is_same_or_broadcast_variant(&effective_app_id, requested_p_name)
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
    // Sub-user must always operate on csm_group_members — mirror Java isAllowedSelfCsmAccountsAccess.
    if ctx.is_sub_user || !ctx.is_admin {
        return Some("Bảng csm_accounts chỉ dành cho tài khoản dev. Admin/Sub-user vui lòng thao tác trên csm_group_members.".into());
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
    let target_app = app_id.trim();
    if target_app.is_empty() || ctx.can_access_app_data(target_app) {
        return None;
    }
    Some("Bạn chỉ được quản lý Nhóm quyền trong app_id của chính mình.".into())
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
        user.app_token.as_str(),
    ] {
        let normalized = normalized_identity(value);
        if !normalized.is_empty() {
            out.push(normalized);
        }
    }
    out
}

/// Mirrors Java parentAccountCandidates (id, app_id, username, email, phoneNumber).
fn collect_parent_account_candidates(user: &AuthUser) -> Vec<String> {
    let mut out = Vec::new();
    for value in [
        user.user_id.as_str(),
        user.app_id.as_str(),
        user.username.as_str(),
        user.email.as_str(),
        user.phone_number.as_str(),
    ] {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            out.push(trimmed.to_string());
        }
    }
    out
}

fn collect_department_candidates(user: &AuthUser) -> Vec<String> {
    let normalized = normalized_identity(&user.dept_id);
    if normalized.is_empty() {
        vec![]
    } else {
        vec![normalized]
    }
}

fn collect_branch_candidates(user: &AuthUser) -> Vec<String> {
    let normalized = normalized_identity(&user.branch_id);
    if normalized.is_empty() {
        vec![]
    } else {
        vec![normalized]
    }
}

fn normalized_identity(raw: &str) -> String {
    raw.trim().to_ascii_lowercase()
}

fn field_value_as_identity(value: Option<&Value>) -> String {
    value
        .and_then(|v| match v {
            Value::String(s) => {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            }
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            _ => None,
        })
        .map(|s| normalized_identity(&s))
        .unwrap_or_default()
}

/// Apply Java `handleSelectTableOperation` row filters after fetch.
pub fn apply_table_read_row_filters(
    app_id: &str,
    table_name: &str,
    rows: Vec<Map<String, Value>>,
    ctx: Option<&UserAccessContext>,
    record_manager: &RecordManager,
) -> Vec<Map<String, Value>> {
    let Some(ctx) = ctx else {
        return rows;
    };
    let mut data = filter_managed_account_descendants(table_name, rows, ctx, app_id, record_manager);
    data = apply_data_scope_row_filter(table_name, data, ctx);
    data = filter_main_account_rows(table_name, data, record_manager);
    if table_name == "csm_accounts" {
        data = mask_self_account_rows_for_non_dev(data, ctx);
    }
    decrypt_pass_for_display(table_name, &mut data, record_manager);
    data
}

/// Optional read scope: only_my_subusers=true on csm_group_members.
pub fn merge_only_my_subusers_filter(
    table_name: &str,
    is_update: bool,
    only_my_subusers: bool,
    existing: SearchFilter,
    ctx: Option<&UserAccessContext>,
) -> SearchFilter {
    if is_update || table_name != "csm_group_members" || !only_my_subusers {
        return existing;
    }
    let Some(ctx) = ctx else {
        return existing;
    };
    if ctx.parent_account_candidates.is_empty() {
        return existing;
    }
    let scope = build_field_scope_filter(&ctx.parent_account_candidates, "parent_account_id");
    let Some(scope) = scope else {
        return existing;
    };
    if existing.field.is_empty() && existing.conditions.is_empty() {
        return scope;
    }
    SearchFilter {
        operator: "AND".into(),
        conditions: vec![existing, scope],
        ..Default::default()
    }
}

pub fn filter_rows_for_update(
    table_name: &str,
    records: Vec<Map<String, Value>>,
    ctx: &UserAccessContext,
    app_id: &str,
    record_manager: &RecordManager,
) -> Vec<Map<String, Value>> {
    let is_system_users_table = table_name == "csm_accounts";
    let is_sub_user_table = table_name == "csm_group_members";
    let is_admin_non_dev = ctx.is_admin && !ctx.is_dev;

    let mut records = records;
    if is_system_users_table && !ctx.is_dev {
        let visible = resolve_managed_account_visible_id_set(app_id, ctx, record_manager);
        records.retain(|row| {
            visible.contains(&field_value_as_identity(row.get("id")))
        });
    }
    if is_sub_user_table && (is_admin_non_dev || ctx.is_dev) {
        records.retain(|row| is_owned_sub_user_row(row, ctx));
    }
    apply_data_scope_row_filter(table_name, records, ctx)
}

fn filter_managed_account_descendants(
    table_name: &str,
    rows: Vec<Map<String, Value>>,
    access: &UserAccessContext,
    app_id: &str,
    record_manager: &RecordManager,
) -> Vec<Map<String, Value>> {
    if table_name != "csm_accounts" || rows.is_empty() || access.is_dev {
        return rows;
    }
    let visible = resolve_managed_account_visible_id_set(app_id, access, record_manager);
    if visible.is_empty() {
        return vec![];
    }
    rows.into_iter()
        .filter(|row| visible.contains(&field_value_as_identity(row.get("id"))))
        .collect()
}

fn resolve_managed_account_visible_id_set(
    app_id: &str,
    access: &UserAccessContext,
    record_manager: &RecordManager,
) -> std::collections::HashSet<String> {
    if access.is_dev || access.owner_candidates.is_empty() {
        return std::collections::HashSet::new();
    }
    let filter = SearchFilter {
        field: "id".into(),
        filter_type: "like".into(),
        value: Value::String(String::new()),
        ..Default::default()
    };
    let all_rows_result = record_manager.filter(app_id, "csm_accounts", &filter);
    let all_rows = rows_as_maps(all_rows_result.get("rows"));
    build_managed_account_visible_id_set(&all_rows, access)
}

fn build_managed_account_visible_id_set(
    rows: &[Map<String, Value>],
    access: &UserAccessContext,
) -> std::collections::HashSet<String> {
    if rows.is_empty() || access.owner_candidates.is_empty() {
        return std::collections::HashSet::new();
    }

    let mut reachable_parents: std::collections::HashSet<String> =
        access.owner_candidates.iter().cloned().collect();
    let mut visible_ids = std::collections::HashSet::new();
    let mut changed = true;

    while changed {
        changed = false;
        for row in rows {
            if is_self_managed_account_row(row, access) {
                let self_id = field_value_as_identity(row.get("id"));
                if !self_id.is_empty() && visible_ids.insert(self_id.clone()) {
                    changed = true;
                }
                let before = reachable_parents.len();
                for key in ["id", "username", "email", "phoneNumber", "app_token"] {
                    collect_candidate(&mut reachable_parents, row.get(key));
                }
                if reachable_parents.len() != before {
                    changed = true;
                }
            }

            let parent = field_value_as_identity(row.get("parent_account_id"));
            if parent.is_empty() || !reachable_parents.contains(&parent) {
                continue;
            }
            let row_id = field_value_as_identity(row.get("id"));
            if row_id.is_empty() {
                continue;
            }
            if visible_ids.insert(row_id.clone()) {
                changed = true;
            }
            let before = reachable_parents.len();
            for key in ["id", "username", "email", "phoneNumber"] {
                collect_candidate(&mut reachable_parents, row.get(key));
            }
            if reachable_parents.len() != before {
                changed = true;
            }
        }
    }

    visible_ids
}

fn is_self_managed_account_row(row: &Map<String, Value>, access: &UserAccessContext) -> bool {
    if access.owner_candidates.is_empty() {
        return false;
    }
    for key in ["id", "username", "email", "phoneNumber", "app_token"] {
        let normalized = field_value_as_identity(row.get(key));
        if !normalized.is_empty() && access.owner_candidates.contains(&normalized) {
            return true;
        }
    }
    false
}

fn collect_candidate(target: &mut std::collections::HashSet<String>, value: Option<&Value>) {
    let normalized = field_value_as_identity(value);
    if !normalized.is_empty() {
        target.insert(normalized);
    }
}

fn is_owned_sub_user_row(row: &Map<String, Value>, access: &UserAccessContext) -> bool {
    if access.parent_account_candidates.is_empty() {
        return false;
    }
    let parent = row
        .get("parent_account_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    contains_identifier_candidate_ignore_case(&access.parent_account_candidates, parent)
}

fn contains_identifier_candidate_ignore_case(candidates: &[String], value: &str) -> bool {
    let normalized = value.trim();
    if normalized.is_empty() {
        return false;
    }
    candidates
        .iter()
        .any(|c| c.eq_ignore_ascii_case(normalized))
}

fn build_field_scope_filter(candidates: &[String], field_name: &str) -> Option<SearchFilter> {
    let conditions: Vec<SearchFilter> = candidates
        .iter()
        .filter(|c| !c.trim().is_empty())
        .map(|candidate| SearchFilter::eq(field_name, candidate.trim()))
        .collect();
    match conditions.len() {
        0 => None,
        1 => Some(conditions.into_iter().next().unwrap()),
        _ => Some(SearchFilter {
            operator: "OR".into(),
            conditions,
            ..Default::default()
        }),
    }
}

fn is_data_scope_exempt_table(table_name: &str) -> bool {
    matches!(
        table_name,
        "index"
            | "csm_accounts"
            | "csm_group_members"
            | "csm_roles"
            | "csm_permissions"
            | "csm_role_permissions"
            | "csm_user_roles"
            | "csm_user_depts"
            | "csm_depts"
            | "csm_menu"
            | "sys_autos"
    )
}

fn apply_data_scope_row_filter(
    table_name: &str,
    rows: Vec<Map<String, Value>>,
    access: &UserAccessContext,
) -> Vec<Map<String, Value>> {
    if rows.is_empty() || access.is_dev || is_data_scope_exempt_table(table_name) {
        return rows;
    }
    let scope = access.data_scope.to_ascii_uppercase();
    if scope == "ALL" || scope == "NONE" {
        return rows;
    }
    rows.into_iter()
        .filter(|row| row_matches_data_scope(row, access))
        .collect()
}

fn row_matches_data_scope(row: &Map<String, Value>, access: &UserAccessContext) -> bool {
    let scope = access.data_scope.to_ascii_uppercase();
    match scope.as_str() {
        "OWNER" => matches_by_fields(row, OWNER_SCOPE_FIELDS, &access.owner_candidates),
        "DEPARTMENT" => {
            matches_by_fields(row, DEPARTMENT_SCOPE_FIELDS, &access.department_candidates)
        }
        "BRANCH" => matches_by_fields(row, BRANCH_SCOPE_FIELDS, &access.branch_candidates),
        _ => true,
    }
}

fn matches_by_fields(
    row: &Map<String, Value>,
    fields: &[&str],
    allowed_values: &[String],
) -> bool {
    if allowed_values.is_empty() {
        return false;
    }
    let allowed: std::collections::HashSet<&str> =
        allowed_values.iter().map(|s| s.as_str()).collect();
    for field in fields {
        let normalized = field_value_as_identity(row.get(*field));
        if !normalized.is_empty() {
            return allowed.contains(normalized.as_str());
        }
    }
    false
}

fn filter_main_account_rows(
    table_name: &str,
    rows: Vec<Map<String, Value>>,
    record_manager: &RecordManager,
) -> Vec<Map<String, Value>> {
    if table_name != "csm_accounts" || rows.is_empty() {
        return rows;
    }
    rows.into_iter()
        .filter(|row| {
            let role = extract_role_from_app_token(row.get("app_token"), record_manager);
            !role.eq_ignore_ascii_case("user")
        })
        .collect()
}

fn extract_role_from_app_token(value: Option<&Value>, record_manager: &RecordManager) -> String {
    let token = value.and_then(|v| v.as_str()).unwrap_or("").trim();
    if token.is_empty() {
        return String::new();
    }
    parse_app_token(record_manager, token).role
}

fn mask_self_account_rows_for_non_dev(
    rows: Vec<Map<String, Value>>,
    access: &UserAccessContext,
) -> Vec<Map<String, Value>> {
    if rows.is_empty() || access.is_dev {
        return rows;
    }
    const KEEP: &[&str] = &[
        "id",
        "username",
        "email",
        "phoneNumber",
        "full_name",
        "avatar",
        "app_id",
        "app_token",
        "user_address",
    ];
    rows.into_iter()
        .map(|row| {
            let mut masked = Map::new();
            for key in KEEP {
                if let Some(v) = row.get(*key) {
                    masked.insert((*key).into(), v.clone());
                }
            }
            masked
        })
        .collect()
}

fn decrypt_pass_for_display(
    table_name: &str,
    rows: &mut [Map<String, Value>],
    record_manager: &RecordManager,
) {
    if table_name != "csm_accounts" && table_name != "csm_group_members" {
        return;
    }
    for row in rows.iter_mut() {
        let Some(Value::String(pass)) = row.get("pass") else {
            continue;
        };
        if pass.is_empty() {
            continue;
        }
        if let Ok(decrypted) = record_manager.csm_decrypt(pass) {
            if let Some((_, raw)) = decrypted.split_once("_____") {
                row.insert("pass".into(), Value::String(raw.to_string()));
            } else {
                row.insert("pass".into(), Value::String(decrypted));
            }
        }
    }
}

fn rows_as_maps(value: Option<&Value>) -> Vec<Map<String, Value>> {
    value
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_object().cloned())
                .collect()
        })
        .unwrap_or_default()
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

/// Resolve app identity for sys_autos homepage/broadcast reads.
/// Client sends `p_name = broadcast_{effectiveAppId}`; when token `app_id` is empty or mismatched,
/// fall back to legacy menu scope (`menusPermissions = [app]`) or explicit `data_app_ids`.
fn resolve_autosetup_effective_app_id(ctx: &UserAccessContext, requested_p_name: &str) -> String {
    let requested = requested_p_name.trim();
    if !ctx.app_id.is_empty()
        && (requested.is_empty() || is_same_or_broadcast_variant(&ctx.app_id, requested))
    {
        return ctx.app_id.clone();
    }

    if let Some(target) = autosetup_target_app_from_p_name(requested) {
        if has_legacy_full_app_scope(&ctx.menus_permissions, &target) {
            return target;
        }
        if ctx.can_access_app_data(&target) && (ctx.is_admin || ctx.is_dev) {
            return target;
        }
        if ctx
            .data_app_ids
            .iter()
            .any(|app| app.eq_ignore_ascii_case(&target))
        {
            return target;
        }
        let primary_menu_app = resolve_primary_app_id_from_menus(&ctx.menus_permissions);
        if !primary_menu_app.is_empty() && is_same_or_broadcast_variant(&primary_menu_app, requested) {
            return primary_menu_app;
        }
    }

    ctx.app_id.clone()
}

/// Resolve a single app id token from legacy menusPermissions (e.g. `lmkt`, `app:lmkt`).
pub fn resolve_primary_app_id_from_menus(menus_permissions: &[String]) -> String {
    for menu in menus_permissions {
        let token = menu.trim();
        if token.is_empty() || token == "*" {
            continue;
        }
        let lower = token.to_ascii_lowercase();
        if let Some(app) = lower.strip_prefix("app:") {
            let app = app.trim();
            if !app.is_empty() {
                return app.to_string();
            }
            continue;
        }
        if lower.starts_with('/') {
            continue;
        }
        if !token.contains(':') {
            return token.to_string();
        }
    }
    String::new()
}

fn autosetup_target_app_from_p_name(requested_p_name: &str) -> Option<String> {
    let requested = requested_p_name.trim();
    if requested.is_empty() {
        return None;
    }
    if let Some(app) = requested.strip_prefix("broadcast_") {
        let app = app.trim();
        if app.is_empty() {
            return None;
        }
        return Some(app.to_string());
    }
    Some(requested.to_string())
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
    use crate::security::AuthUser;
    use serde_json::json;
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
            parent_account_candidates: vec![],
            department_candidates: vec![],
            branch_candidates: vec![],
            preferred_owner: String::new(),
            preferred_department: String::new(),
            preferred_branch: String::new(),
        }
    }

    #[test]
    fn sub_user_never_admin_in_access_context() {
        std::env::set_var("APP_DATA_DIR", "/Volumes/Datas/CSM/JavaProjects/csm_server/csm_datas");
        std::env::set_var(
            "ROCKSDB_ROOT_DIR",
            "/Volumes/Datas/CSM/JavaProjects/csm_server/csm_datas/database",
        );
        let config = AppConfig::from_env().expect("config");
        let rm = RecordManager::new(config).expect("record manager");
        let user = AuthUser {
            user_id: "sub-1".into(),
            username: "subuser".into(),
            email: "sub@example.com".into(),
            phone_number: String::new(),
            app_token: String::new(),
            login_version: 0,
            permissions: vec!["admin".into(), "view".into(), "scope:all".into()],
            menus_permissions: Some(vec!["lmkt".into()]),
            permission_bitfield: None,
            data_scope: "ALL".into(),
            dev: false,
            is_sub_user: true,
            app_id: "lmkt".into(),
            data_app_ids: vec![],
            dept_id: String::new(),
            branch_id: String::new(),
            extra: serde_json::Map::new(),
        };
        let ctx = UserAccessContext::from_auth(Some(&user), &rm).expect("context");
        assert!(!ctx.is_admin, "sub-user must not be treated as admin");
        assert!(ctx.is_sub_user);
        assert!(!ctx.permissions.iter().any(|p| p.eq_ignore_ascii_case("admin")));
    }

    #[test]
    fn broadcast_variant_matches_home_app() {
        assert!(is_same_or_broadcast_variant("lmkt", "broadcast_lmkt"));
        assert!(is_same_or_broadcast_variant("lmkt", "lmkt"));
        assert!(!is_same_or_broadcast_variant("csm", "broadcast_lmkt"));
    }

    #[test]
    fn main_account_default_policy_grants_all_scope_and_autosetup() {
        let filter = lmkt_broadcast_filter();
        let user = AuthUser {
            user_id: "admin-1".into(),
            username: "admin".into(),
            email: "admin@test.com".into(),
            phone_number: String::new(),
            app_token: String::new(),
            login_version: 0,
            permissions: vec![],
            menus_permissions: Some(vec!["lmkt".into()]),
            permission_bitfield: None,
            data_scope: String::new(),
            dev: false,
            is_sub_user: false,
            app_id: String::new(),
            data_app_ids: vec![],
            dept_id: String::new(),
            branch_id: String::new(),
            extra: serde_json::Map::new(),
        };
        std::env::set_var("APP_DATA_DIR", "/Volumes/Datas/CSM/JavaProjects/csm_server/csm_datas");
        std::env::set_var(
            "ROCKSDB_ROOT_DIR",
            "/Volumes/Datas/CSM/JavaProjects/csm_server/csm_datas/database",
        );
        let config = AppConfig::from_env().expect("config");
        let rm = RecordManager::new(config).expect("record manager");
        let ctx = UserAccessContext::from_auth(Some(&user), &rm).expect("context");
        assert!(ctx.is_admin);
        assert_eq!(ctx.data_scope, "ALL");
        assert_eq!(ctx.app_id, "lmkt");
        assert!(has_action_permission(&ctx.permissions, "view"));
        assert!(is_allowed_autosetup_template_read(
            "csm",
            "sys_autos",
            false,
            &filter,
            Some(&ctx),
        ));
    }

    #[test]
    fn autosetup_resolves_app_from_menus_when_token_app_id_empty() {
        let filter = lmkt_broadcast_filter();
        let ctx = UserAccessContext {
            app_id: String::new(),
            menus_permissions: vec!["lmkt".into()],
            ..lmkt_ctx(false)
        };
        assert!(is_allowed_autosetup_template_read(
            "csm",
            "sys_autos",
            false,
            &filter,
            Some(&ctx),
        ));
        let rows = Value::Array(vec![json!({
            "p_name": "broadcast_lmkt",
            "p_type": 0,
            "p_code": "encrypted-placeholder"
        })]);
        let filtered = filter_sys_autos_rows(rows, &filter, Some(&ctx));
        assert_eq!(filtered.as_array().map(|a| a.len()), Some(1));
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
