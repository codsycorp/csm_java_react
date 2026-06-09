use crate::security::auth::AuthUser;
use crate::util::{parse_app_token, PermissionBitfieldUtil, is_sub_user_role};

/// Effective permission projection shared by login, middleware and table access checks.
#[derive(Debug, Clone)]
pub struct ResolvedPermissions {
    pub permissions: Vec<String>,
    pub menus_permissions: Vec<String>,
    pub permission_bitfield: String,
    pub data_scope: String,
    pub is_dev: bool,
    pub is_sub_user: bool,
    pub is_admin: bool,
    pub app_id: String,
    pub data_app_ids: Vec<String>,
}

/// Mirrors Java `AuthHandler.enrichUserInfoWithBitfield` + `TableHandler.resolveCurrentUserAccessContext`.
pub fn resolve_effective_permissions(
    auth: &AuthUser,
    record_manager: &crate::data::RecordManager,
) -> ResolvedPermissions {
    let token_meta = if !auth.app_token.is_empty() {
        parse_app_token(record_manager, &auth.app_token)
    } else {
        Default::default()
    };

    let is_sub_user = auth.is_sub_user || is_sub_user_role(&token_meta.role);
    let is_dev = auth.dev;

    let base_permissions = auth.permissions.clone();
    let base_menus = auth.menus_permissions.clone().unwrap_or_default();

    // Merge list fields with stored bitfield — never discard mapped list permissions.
    let mut permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
        &base_permissions,
        &PermissionBitfieldUtil::permissions_from_bitfield(auth.permission_bitfield.as_deref()),
    );
    let mut menus_permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
        &base_menus,
        &PermissionBitfieldUtil::menus_from_bitfield(auth.permission_bitfield.as_deref()),
    );

    if is_dev {
        permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &permissions,
            &["dev".into(), "admin".into(), "scope:all".into()],
        );
        if !auth.app_id.is_empty() {
            menus_permissions = vec![auth.app_id.clone()];
        }
    } else if !is_sub_user {
        // Main account policy — mirrors Java `mapMainAccountToUser(isMainAccount=true)`.
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
        if menus_permissions.is_empty() && !auth.app_id.is_empty() {
            menus_permissions = vec![auth.app_id.clone()];
        }
    } else {
        // Sub-user policy — mirrors Java `mapSubUserRecordToUser` clamps.
        permissions = PermissionBitfieldUtil::subtract_case_insensitive(
            &permissions,
            &["admin".into(), "dev".into()],
        );
        if !has_any_action_permission(&permissions) {
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &["view".into()],
            );
        }
        if permissions.is_empty() {
            permissions = vec!["view".into(), "scope:owner".into()];
        }
    }

    let bitfield =
        PermissionBitfieldUtil::build_bitfield(&permissions, &menus_permissions, is_dev);
    let mut data_scope = PermissionBitfieldUtil::resolve_data_scope(bitfield);

    let is_admin_by_default = !is_dev && !is_sub_user;
    let is_admin = is_admin_by_default
        || permissions.iter().any(|p| p.eq_ignore_ascii_case("admin"))
        || token_meta.role.eq_ignore_ascii_case("admin")
        || PermissionBitfieldUtil::has_admin_privilege(bitfield);

    if !is_dev && is_admin && has_legacy_full_app_scope(&menus_permissions, &auth.app_id) {
        data_scope = "ALL".into();
        permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &permissions,
            &["admin".into(), "scope:all".into()],
        );
    }
    if is_dev {
        data_scope = "ALL".into();
    }

    let final_bitfield =
        PermissionBitfieldUtil::build_bitfield(&permissions, &menus_permissions, is_dev);

    ResolvedPermissions {
        permissions,
        menus_permissions,
        permission_bitfield: PermissionBitfieldUtil::to_compact_token(final_bitfield),
        data_scope,
        is_dev,
        is_sub_user,
        is_admin,
        app_id: auth.app_id.clone(),
        data_app_ids: if is_sub_user {
            vec![]
        } else {
            auth.data_app_ids.clone()
        },
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

/// Apply resolved permissions back onto an AuthUser (middleware refresh).
pub fn apply_resolved_to_auth(auth: &mut AuthUser, resolved: &ResolvedPermissions) {
    auth.permissions = resolved.permissions.clone();
    auth.menus_permissions = if resolved.menus_permissions.is_empty() {
        None
    } else {
        Some(resolved.menus_permissions.clone())
    };
    auth.permission_bitfield = Some(resolved.permission_bitfield.clone());
    auth.data_scope = resolved.data_scope.clone();
    auth.dev = resolved.is_dev;
    auth.is_sub_user = resolved.is_sub_user;
    auth.data_app_ids = resolved.data_app_ids.clone();
}

/// Apply resolved permissions onto login/user-info payload.
pub fn apply_resolved_to_info_map(resolved: &ResolvedPermissions, info: &mut serde_json::Map<String, serde_json::Value>) {
    use serde_json::{json, Value};
    info.insert(
        "permissions".into(),
        Value::Array(
            resolved
                .permissions
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    info.insert(
        "roles".into(),
        Value::Array(
            resolved
                .permissions
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    info.insert(
        "menusPermissions".into(),
        Value::Array(
            resolved
                .menus_permissions
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    info.insert(
        "permissionBitfield".into(),
        Value::String(resolved.permission_bitfield.clone()),
    );
    info.insert(
        "permissionSchemaVersion".into(),
        Value::String(PermissionBitfieldUtil::SCHEMA_V3.into()),
    );
    info.insert("dataScope".into(), Value::String(resolved.data_scope.clone()));
    info.insert("is_sub_user".into(), json!(resolved.is_sub_user));
    info.insert(
        "account_type".into(),
        Value::String(if resolved.is_sub_user {
            "sub-user".into()
        } else {
            "main".into()
        }),
    );
}
