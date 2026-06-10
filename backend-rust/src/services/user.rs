use std::sync::Arc;

use serde_json::{json, Map, Value};
use tracing::{info, warn};

use crate::data::RecordManager;
use crate::model::{SearchFilter, User};
use crate::util::{app_id_from_token, parse_app_token, is_dev_access_right, PermissionBitfieldUtil};
use crate::security::user_access::has_any_action_permission;

const CSM_APP_ID: &str = "csm";
const ACCOUNTS_TABLE: &str = "csm_accounts";
const SUB_ACCOUNTS_TABLE: &str = "csm_group_members";

pub struct UserService {
    record_manager: Arc<RecordManager>,
}

impl UserService {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn find_by_id(&self, user_id: &str) -> Option<User> {
        if user_id.is_empty() {
            return None;
        }
        let filter = SearchFilter::eq("id", user_id);
        let record = self.record_manager.find(CSM_APP_ID, ACCOUNTS_TABLE, &filter);
        if !record.is_empty() {
            return Some(self.map_record_to_user(&record, true));
        }
        let sub = self.record_manager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, &filter);
        if !sub.is_empty() {
            return self.map_sub_user(&sub);
        }
        None
    }

    pub fn find_by_app_token(&self, app_token: &str) -> Option<User> {
        if app_token.is_empty() {
            return None;
        }
        let filter = SearchFilter::eq("app_token", app_token);
        let record = self.record_manager.find(CSM_APP_ID, ACCOUNTS_TABLE, &filter);
        if !record.is_empty() {
            return Some(self.map_record_to_user(&record, true));
        }

        let sub = self.record_manager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, &filter);
        if !sub.is_empty() {
            return self.map_sub_user(&sub);
        }
        None
    }

    pub fn find_by_refresh_token(&self, refresh_token: &str) -> Option<User> {
        if refresh_token.is_empty() {
            return None;
        }
        for field in ["refresh_token", "refresh"] {
            let filter = SearchFilter::eq(field, refresh_token);
            let record = self.record_manager.find(CSM_APP_ID, ACCOUNTS_TABLE, &filter);
            if !record.is_empty() {
                return self.canonicalize_refresh_user(&record, refresh_token);
            }
            let sub = self.record_manager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, &filter);
            if !sub.is_empty() {
                return self.map_sub_user(&sub);
            }
        }
        None
    }

    pub fn find_by_login_and_password(
        &self,
        login_identifier: &str,
        raw_password: &str,
    ) -> Option<User> {
        for finder in [
            Self::find_by_email,
            Self::find_by_username,
            Self::find_by_phone,
        ] {
            if let Some((user, record)) = finder(self, login_identifier) {
                let field = login_field(&user, login_identifier);
                if self.password_matches(&record, &user, &field, raw_password) {
                    info!("Login success for {}", login_identifier);
                    return Some(user);
                }
            }
        }

        let filter = SearchFilter::eq("login_identifier", login_identifier);
        let sub = self.record_manager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, &filter);
        if !sub.is_empty() {
            let combined = format!("{login_identifier}_____{raw_password}");
            let encoded = self.record_manager.csm_encrypt(&combined);
            let pass = sub.get("pass").and_then(|v| v.as_str()).unwrap_or("");
            let actived = sub.get("actived").and_then(|v| v.as_bool()).unwrap_or(true);
            if actived && pass == encoded {
                return self.map_sub_user(&sub);
            }
        }
        None
    }

    pub fn resolve_from_jwt_with_util(
        &self,
        jwt: &crate::security::jwt::JwtUtil,
        token: &str,
    ) -> Option<User> {
        let claims = jwt.parse_claims(token).ok()?;
        let subject = claims.sub.trim();
        let token_user_id = claims.uid.trim();
        if subject.is_empty() {
            return None;
        }

        let mut user = if !token_user_id.is_empty() {
            self.find_by_id(token_user_id)
        } else {
            None
        };

        // JWT subject is usually encrypted app_token — mirror Java JwtAuthenticationFilter.
        if looks_like_app_token(subject) {
            if let Some(by_token) = self.find_by_app_token(subject) {
                if !token_user_id.is_empty() {
                    let resolved_id = by_token.id.as_deref().unwrap_or("");
                    if resolved_id != token_user_id {
                        return None;
                    }
                }
                user = Some(by_token);
            }
        }

        if user.is_none() {
            user = self
                .find_by_app_token(subject)
                .or_else(|| self.find_by_id(subject))
                .or_else(|| self.find_account("email", subject).map(|(u, _)| u))
                .or_else(|| self.find_account("username", subject).map(|(u, _)| u))
                .or_else(|| self.find_account("phoneNumber", subject).map(|(u, _)| u));
        }

        let mut user = user?;

        if !subject_matches_user(subject, &user) {
            return None;
        }

        if let Some(app_token) = user.app_token.clone().filter(|t| !t.is_empty()) {
            if let Some(fresh) = self.find_by_app_token(&app_token) {
                user = fresh;
            }
        }

        let current_version = user.login_version.unwrap_or(0);
        if current_version > 0 && claims.ver != current_version {
            return None;
        }

        Some(user)
    }

    fn canonicalize_refresh_user(
        &self,
        record: &Map<String, Value>,
        refresh_token: &str,
    ) -> Option<User> {
        let expiry = record
            .get("refresh_token_expiry")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0);
        if expiry > 0 && expiry <= chrono::Utc::now().timestamp_millis() {
            return None;
        }

        let stored = record
            .get("refresh_token")
            .or_else(|| record.get("refresh"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if stored != refresh_token {
            return None;
        }

        Some(self.map_record_to_user(record, true))
    }

    pub fn update_session_token(
        &self,
        user: &User,
        refresh_token: &str,
        ip: &str,
        ua: &str,
        expiry_ms: i64,
        login_version: i32,
    ) {
        let mut fields = Map::new();
        fields.insert("refresh_token".into(), Value::String(refresh_token.into()));
        fields.insert("refresh".into(), Value::String(refresh_token.into()));
        fields.insert("refresh_token_ip".into(), Value::String(ip.into()));
        fields.insert("refresh_token_ua".into(), Value::String(ua.into()));
        fields.insert("refresh_token_expiry".into(), json!(expiry_ms));
        fields.insert("login_version".into(), json!(login_version));
        if let Some(id) = user.id.as_deref().filter(|s| !s.is_empty()) {
            self.update_by_id(id, &fields);
        } else {
            warn!("update_session_token: missing user id, session not persisted");
        }
    }

    /// Mirror Java UserService.clearSessionToken — invalidate refresh session metadata.
    pub fn clear_session_token(&self, user: &User) {
        let mut fields = Map::new();
        fields.insert("refresh_token".into(), Value::String(String::new()));
        fields.insert("refresh".into(), Value::String(String::new()));
        fields.insert("refresh_token_ip".into(), Value::Null);
        fields.insert("refresh_token_ua".into(), Value::Null);
        fields.insert("refresh_token_expiry".into(), Value::Null);
        if let Some(id) = user.id.as_deref().filter(|s| !s.is_empty()) {
            self.update_by_id(id, &fields);
        }
    }

    pub fn update_by_id(&self, user_id: &str, fields: &Map<String, Value>) {
        let filter = SearchFilter::eq("id", user_id);
        let mut record = self.record_manager.find(CSM_APP_ID, ACCOUNTS_TABLE, &filter);
        if record.is_empty() {
            record = self.record_manager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, &filter);
            if record.is_empty() {
                warn!("update_by_id: user not found id={user_id}");
                return;
            }
            let mut merged = record;
            merged.extend(fields.clone());
            sync_refresh_fields(&mut merged, fields);
            merged.insert("id".into(), json!(user_id));
            let _ = self.record_manager.create_record(
                CSM_APP_ID,
                SUB_ACCOUNTS_TABLE,
                merged,
                Some(vec!["id".into(), "login_identifier".into()]),
            );
            return;
        }

        let mut merged = record;
        merged.extend(fields.clone());
        sync_refresh_fields(&mut merged, fields);
        merged.insert("id".into(), json!(user_id));

        // Mirror Java applyUserRecordUpdate: app_token + refresh aliases + canonical PK
        if merged
            .get("app_token")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.is_empty())
        {
            let _ = self.record_manager.create_record(
                CSM_APP_ID,
                ACCOUNTS_TABLE,
                merged.clone(),
                Some(vec!["app_token".into()]),
            );
        }
        let refresh_val = merged
            .get("refresh")
            .or_else(|| merged.get("refresh_token"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if refresh_val.is_some() {
            let _ = self.record_manager.create_record(
                CSM_APP_ID,
                ACCOUNTS_TABLE,
                merged.clone(),
                Some(vec!["refresh".into()]),
            );
        }
        let _ = self.record_manager.create_record(CSM_APP_ID, ACCOUNTS_TABLE, merged, None);
    }

    fn find_by_email(&self, email: &str) -> Option<(User, Map<String, Value>)> {
        self.find_account("email", email)
    }

    fn find_by_username(&self, username: &str) -> Option<(User, Map<String, Value>)> {
        self.find_account("username", username)
    }

    fn find_by_phone(&self, phone: &str) -> Option<(User, Map<String, Value>)> {
        self.find_account("phoneNumber", phone)
    }

    fn find_account(&self, field: &str, value: &str) -> Option<(User, Map<String, Value>)> {
        let filter = SearchFilter {
            operator: "AND".into(),
            field: field.into(),
            filter_type: "eqIgnoreCase".into(),
            value: Value::String(value.into()),
            conditions: vec![],
        };
        let r = self.record_manager.find(CSM_APP_ID, ACCOUNTS_TABLE, &filter);
        if r.is_empty() {
            None
        } else {
            Some((self.map_record_to_user(&r, true), r))
        }
    }

    fn password_matches(
        &self,
        record: &Map<String, Value>,
        user: &User,
        login_field: &str,
        raw_password: &str,
    ) -> bool {
        let combined = format!("{login_field}_____{raw_password}");
        let encoded = self.record_manager.csm_encrypt(&combined);
        let stored = record
            .get("pass")
            .or_else(|| record.get("password"))
            .and_then(|v| v.as_str())
            .or(user.password.as_deref());
        let actived = record
            .get("actived")
            .and_then(|v| v.as_bool())
            .or(user.actived)
            .unwrap_or(true);
        actived && stored == Some(encoded.as_str())
    }

    /// Mirrors Java `mapRecordToUser` / `mapMainAccountToUser`.
    fn map_record_to_user(&self, record: &Map<String, Value>, is_main_account: bool) -> User {
        let mut user = User::from_record(record);

        let app_id = extract_app_id_from_token(&self.record_manager, user.app_token.as_deref())
            .or_else(|| {
                record
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .or(user.app_id.clone())
            .unwrap_or_default();
        if !app_id.is_empty() {
            user.app_id = Some(app_id.clone());
        }

        user.data_app_ids = Some(resolve_effective_data_app_ids(
            record,
            user.app_id.as_deref().unwrap_or(""),
            user.dev.unwrap_or(false),
        ));

        let mut permissions = string_list_from_value(record.get("permissions"));
        let mut menus_permissions = string_list_from_value(
            record
                .get("menusPermissions")
                .or_else(|| record.get("menus_permissions")),
        );

        let raw_bitfield = record
            .get("permissionBitfield")
            .or_else(|| record.get("permission_bitfield"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if raw_bitfield.is_some() {
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &PermissionBitfieldUtil::permissions_from_bitfield(raw_bitfield),
            );
            menus_permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &menus_permissions,
                &PermissionBitfieldUtil::menus_from_bitfield(raw_bitfield),
            );
        }

        let mut is_dev = user.dev.unwrap_or(false);
        if let Some(token) = user.app_token.as_deref() {
            if let Some(access_right) = extract_access_right_from_token(&self.record_manager, token) {
                is_dev = access_right > 0;
            }
        }
        user.dev = Some(is_dev);

        if is_dev {
            permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &permissions,
                &["dev".into(), "admin".into(), "scope:all".into()],
            );
            // Mirror Java mapMainAccountToUser: unconditionally set menus = [appId] for dev.
            // Java line 1251-1254: if (!currentAppId.isBlank()) user.setMenusPermissions(List.of(currentAppId))
            // This ensures frontend hasLegacyAppOnly=true → shouldBypassMenuFilter=true → all routes shown.
            if !app_id.is_empty() {
                menus_permissions = vec![app_id.clone()];
            }
            user.data_app_ids = Some(resolve_effective_data_app_ids(record, &app_id, true));
        } else if is_main_account {
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
            user.data_scope = Some("ALL".into());
        }

        user.permissions = Some(permissions.clone());
        user.menus_permissions = if menus_permissions.is_empty() {
            None
        } else {
            Some(menus_permissions.clone())
        };

        let bitfield =
            PermissionBitfieldUtil::build_bitfield(&permissions, &menus_permissions, is_dev);
        user.permission_bitfield = Some(PermissionBitfieldUtil::to_compact_token(bitfield));
        user.permission_schema_version = Some(PermissionBitfieldUtil::SCHEMA_V3.into());
        user.data_scope = Some(PermissionBitfieldUtil::resolve_data_scope(bitfield));
        user.is_sub_user = Some(false);
        user
    }

    fn find_parent_account(&self, parent_key: &str) -> Option<Map<String, Value>> {
        for field in ["id", "app_id", "email", "username", "phoneNumber"] {
            let filter = SearchFilter::eq(field, parent_key);
            let record = self.record_manager.find(CSM_APP_ID, ACCOUNTS_TABLE, &filter);
            if !record.is_empty() {
                return Some(record);
            }
        }
        None
    }

    fn find_role_by_code(&self, app_id: &str, role_code: &str) -> Option<Map<String, Value>> {
        if role_code.trim().is_empty() {
            return None;
        }
        let effective_app_id = if app_id.trim().is_empty() {
            CSM_APP_ID
        } else {
            app_id
        };
        for field in ["role_code", "id"] {
            let filter = SearchFilter::eq(field, role_code);
            let record = self
                .record_manager
                .find(effective_app_id, "csm_roles", &filter);
            if !record.is_empty() {
                return Some(record);
            }
        }
        None
    }

    /// Mirrors Java `mapSubUserRecordToUser`.
    fn map_sub_user(&self, record: &Map<String, Value>) -> Option<User> {
        let parent_key = record.get("parent_account_id").and_then(|v| v.as_str())?;
        let parent_record = self.find_parent_account(parent_key)?;
        let mut user = self.map_record_to_user(&parent_record, false);

        if let Some(id) = record.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.id = Some(id.to_string());
        }
        if let Some(login) = record.get("login_identifier").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.username = Some(login.to_string());
            if user.email.as_deref().unwrap_or("").is_empty() {
                user.email = Some(login.to_string());
            }
        }
        if let Some(email) = record.get("email").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.email = Some(email.to_string());
        }
        if let Some(username) = record.get("username").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.username = Some(username.to_string());
        }
        if let Some(phone) = record.get("phoneNumber").and_then(|v| v.as_str()) {
            user.phone_number = Some(phone.to_string());
        }
        if let Some(full_name) = record.get("full_name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.full_name = Some(full_name.to_string());
        }
        if let Some(avatar) = record.get("avatar").and_then(|v| v.as_str()) {
            user.avatar = Some(avatar.to_string());
        }
        if let Some(pass) = record.get("pass").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.password = Some(pass.to_string());
        }
        if let Some(actived) = record.get("actived").and_then(|v| v.as_bool()) {
            user.actived = Some(actived);
        }

        if let Some(refresh) = record
            .get("refresh")
            .or_else(|| record.get("refresh_token"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            user.refresh_token = Some(refresh.to_string());
        }
        user.login_version = record
            .get("login_version")
            .or_else(|| record.get("loginVersion"))
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .map(|v| v as i32)
            .or(Some(0));

        if let Some(scope) = record.get("dataScope").or_else(|| record.get("data_scope")).and_then(|v| v.as_str()) {
            user.data_scope = Some(scope.to_string());
        }
        if let Some(dept) = record.get("dept_id").and_then(|v| v.as_str()) {
            user.dept_id = Some(dept.to_string());
        }
        if let Some(branch) = record.get("branch_id").and_then(|v| v.as_str()) {
            user.branch_id = Some(branch.to_string());
        }

        let mut direct_permissions = string_list_from_value(record.get("permissions"));
        let mut direct_menus = string_list_from_value(
            record
                .get("menusPermissions")
                .or_else(|| record.get("menus_permissions")),
        );
        let permissions_add = string_list_from_value(record.get("permissionsAdd"));
        let permissions_deny = string_list_from_value(record.get("permissionsDeny"));
        let menus_add = string_list_from_value(
            record
                .get("menusPermissionsAdd")
                .or_else(|| record.get("menus_permissions_add")),
        );
        let menus_deny = string_list_from_value(
            record
                .get("menusPermissionsDeny")
                .or_else(|| record.get("menus_permissions_deny")),
        );

        if let Some(sub_token) = record.get("app_token").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.app_token = Some(sub_token.to_string());
            let meta = parse_app_token(&self.record_manager, sub_token);
            if !meta.app_id.is_empty() {
                user.app_id = Some(meta.app_id);
            }
            user.dev = Some(is_dev_access_right(meta.access_right));
        }

        let group_id = record.get("group_id").and_then(|v| v.as_str()).unwrap_or("");
        let role_lookup_app_id = user
            .app_id
            .clone()
            .filter(|s| !s.is_empty())
            .or_else(|| {
                record
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .or_else(|| {
                parent_record
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .unwrap_or_default();

        let mut has_authoritative_role = false;
        let mut role_bitfield: Option<String> = None;
        if !group_id.is_empty() {
            if let Some(role_record) = self.find_role_by_code(&role_lookup_app_id, group_id) {
                has_authoritative_role = true;
                role_bitfield = role_record
                    .get("permissionBitfield")
                    .or_else(|| role_record.get("permission_bitfield"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from);

                let role_perms = string_list_from_value(role_record.get("permissions"));
                if !role_perms.is_empty() {
                    direct_permissions = role_perms;
                } else if let Some(raw) = role_bitfield.as_deref() {
                    direct_permissions =
                        PermissionBitfieldUtil::permissions_from_bitfield(Some(raw));
                }

                let role_menus = string_list_from_value(
                    role_record
                        .get("menusPermissions")
                        .or_else(|| role_record.get("menus_permissions")),
                );
                if !role_menus.is_empty() {
                    direct_menus = role_menus;
                } else if let Some(raw) = role_bitfield.as_deref() {
                    direct_menus = PermissionBitfieldUtil::menus_from_bitfield(Some(raw));
                }
            }

            if (direct_menus.is_empty() || direct_permissions.is_empty())
                && !has_authoritative_role
            {
                if let Some(group) = find_group_right(&parent_record, group_id) {
                    let group_perms = string_list_from_value(group.get("permissions"));
                    if !group_perms.is_empty() {
                        direct_permissions = group_perms;
                    }
                    let group_menus = string_list_from_value(
                        group
                            .get("menusPermissions")
                            .or_else(|| group.get("menus_permissions")),
                    );
                    if !group_menus.is_empty() {
                        direct_menus = group_menus;
                    }
                }
            }
        }

        let sub_bitfield = record
            .get("permissionBitfield")
            .or_else(|| record.get("permission_bitfield"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from);

        let mut bitfield_from_record = sub_bitfield.clone();
        if has_authoritative_role
            && role_bitfield.is_some()
            && direct_permissions.is_empty()
            && direct_menus.is_empty()
        {
            bitfield_from_record = role_bitfield;
        }

        let (mut effective_permissions, mut effective_menus) =
            if let Some(raw) = bitfield_from_record.as_deref() {
                (
                    PermissionBitfieldUtil::permissions_from_bitfield(Some(raw)),
                    PermissionBitfieldUtil::menus_from_bitfield(Some(raw)),
                )
            } else {
                (direct_permissions.clone(), direct_menus.clone())
            };

        effective_permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
            &effective_permissions,
            &permissions_add,
        );
        effective_permissions = PermissionBitfieldUtil::subtract_case_insensitive(
            &effective_permissions,
            &permissions_deny,
        );
        effective_menus =
            PermissionBitfieldUtil::merge_unique_case_insensitive(&effective_menus, &menus_add);
        effective_menus =
            PermissionBitfieldUtil::subtract_case_insensitive(&effective_menus, &menus_deny);

        if effective_permissions.is_empty() && !direct_permissions.is_empty() {
            effective_permissions = direct_permissions;
        }
        if effective_menus.is_empty() && !direct_menus.is_empty() {
            effective_menus = direct_menus;
        }

        effective_permissions = PermissionBitfieldUtil::subtract_case_insensitive(
            &effective_permissions,
            &["admin".into(), "dev".into()],
        );
        if !has_any_action_permission(&effective_permissions) {
            effective_permissions = PermissionBitfieldUtil::merge_unique_case_insensitive(
                &effective_permissions,
                &["view".into()],
            );
        }
        if effective_permissions.is_empty() {
            effective_permissions = vec!["view".into(), "scope:owner".into()];
        }

        user.permissions = Some(effective_permissions.clone());
        user.menus_permissions = if effective_menus.is_empty() {
            None
        } else {
            Some(effective_menus.clone())
        };
        user.data_app_ids = Some(vec![]);
        user.is_sub_user = Some(true);
        user.dev = Some(false);

        let bitfield = PermissionBitfieldUtil::build_bitfield(
            &effective_permissions,
            &effective_menus,
            false,
        );
        user.permission_bitfield = Some(PermissionBitfieldUtil::to_compact_token(bitfield));
        user.permission_schema_version = Some(PermissionBitfieldUtil::SCHEMA_V3.into());
        user.data_scope = Some(PermissionBitfieldUtil::resolve_data_scope(bitfield));

        Some(user)
    }
}

fn find_group_right<'a>(
    parent_record: &'a Map<String, Value>,
    group_id: &str,
) -> Option<&'a Map<String, Value>> {
    parent_record
        .get("group_rights")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|item| {
                let obj = item.as_object()?;
                let gid = obj.get("group_id").and_then(|v| v.as_str()).unwrap_or("");
                if gid == group_id {
                    Some(obj)
                } else {
                    None
                }
            })
        })
}

fn looks_like_app_token(subject: &str) -> bool {
    subject.contains("_____") || (subject.len() > 40 && !subject.contains('.'))
}

fn subject_matches_user(subject: &str, user: &User) -> bool {
    let subject = subject.trim();
    if subject.is_empty() {
        return false;
    }
    if user.app_token.as_deref() == Some(subject) {
        return true;
    }
    if user.id.as_deref() == Some(subject) {
        return true;
    }
    if user.email.as_deref() == Some(subject) {
        return true;
    }
    if user.username.as_deref() == Some(subject) {
        return true;
    }
    user.phone_number.as_deref() == Some(subject)
}

fn sync_refresh_fields(merged: &mut Map<String, Value>, fields: &Map<String, Value>) {
    if fields.contains_key("refresh_token") {
        if let Some(v) = fields.get("refresh_token") {
            merged.insert("refresh".into(), v.clone());
        }
    }
    if fields.contains_key("refresh") {
        if let Some(v) = fields.get("refresh") {
            merged.insert("refresh_token".into(), v.clone());
        }
    }
}

fn login_field(user: &User, identifier: &str) -> String {
    if user.email.as_deref() == Some(identifier) {
        return user.email.clone().unwrap_or_default();
    }
    if user.username.as_deref() == Some(identifier) {
        return user.username.clone().unwrap_or_default();
    }
    if user.phone_number.as_deref() == Some(identifier) {
        return user.phone_number.clone().unwrap_or_default();
    }
    identifier.to_string()
}

fn string_list_from_value(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => vec![],
    }
}

fn extract_app_id_from_token(record_manager: &RecordManager, token: Option<&str>) -> Option<String> {
    app_id_from_token(record_manager, token)
}

fn extract_access_right_from_token(record_manager: &RecordManager, token: &str) -> Option<i32> {
    let decrypted = record_manager.csm_decrypt(token).ok()?;
    decrypted
        .split("_____")
        .last()?
        .parse::<i32>()
        .ok()
}

fn resolve_effective_data_app_ids(record: &Map<String, Value>, menu_app_id: &str, _is_dev: bool) -> Vec<String> {
    let explicit = string_list_from_value(
        record
            .get("data_app_ids")
            .or_else(|| record.get("dataAppIds")),
    );
    exclude_menu_app_from_data_app_ids(&explicit, menu_app_id)
}

fn exclude_menu_app_from_data_app_ids(apps: &[String], menu_app_id: &str) -> Vec<String> {
    let menu = menu_app_id.trim();
    apps.iter()
        .map(|s| s.trim())
        .filter(|value| !value.is_empty() && !value.eq_ignore_ascii_case(menu))
        .map(String::from)
        .collect()
}
