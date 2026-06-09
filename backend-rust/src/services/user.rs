use std::sync::Arc;

use serde_json::{json, Map, Value};
use tracing::{info, warn};

use crate::data::RecordManager;
use crate::model::{SearchFilter, User};
use crate::util::PermissionBitfieldUtil;

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
        let mut user = None;

        if !claims.uid.is_empty() {
            user = self.find_by_id(&claims.uid);
        }

        if user.is_none() && !claims.sub.is_empty() {
            user = self
                .find_by_app_token(&claims.sub)
                .or_else(|| self.find_by_id(&claims.sub))
                .or_else(|| self.find_account("email", &claims.sub).map(|(u, _)| u))
                .or_else(|| self.find_account("username", &claims.sub).map(|(u, _)| u))
                .or_else(|| self.find_account("phoneNumber", &claims.sub).map(|(u, _)| u));
        }

        let mut user = user?;

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

    fn map_sub_user(&self, record: &Map<String, Value>) -> Option<User> {
        let parent_key = record.get("parent_account_id").and_then(|v| v.as_str())?;
        let mut user = if let Some(parent_record) = self.find_parent_account(parent_key) {
            self.map_record_to_user(&parent_record, false)
        } else {
            self.find_by_id(parent_key)?
        };
        user.id = record.get("id").and_then(|v| v.as_str()).map(String::from);
        user.username = record
            .get("login_identifier")
            .and_then(|v| v.as_str())
            .map(String::from);
        if let Some(email) = record.get("email").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.email = Some(email.to_string());
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
        user.permissions = record
            .get("permissions")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect());
        user.menus_permissions = record
            .get("menusPermissions")
            .or_else(|| record.get("menus_permissions"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect());

        let sub_bitfield = record
            .get("permissionBitfield")
            .or_else(|| record.get("permission_bitfield"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let Some(raw) = sub_bitfield {
            let perms = PermissionBitfieldUtil::permissions_from_bitfield(Some(raw));
            let menus = PermissionBitfieldUtil::menus_from_bitfield(Some(raw));
            if !perms.is_empty() {
                user.permissions = Some(perms);
            }
            if !menus.is_empty() {
                user.menus_permissions = Some(menus);
            }
        }

        user.data_app_ids = Some(vec![]);
        if let Some(sub_token) = record.get("app_token").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            user.app_token = Some(sub_token.to_string());
            if let Some(app_id) = extract_app_id_from_token(&self.record_manager, Some(sub_token)) {
                user.app_id = Some(app_id);
            }
        }
        if user.app_id.as_deref().unwrap_or("").is_empty() {
            if let Some(app_id) = record.get("app_id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                user.app_id = Some(app_id.to_string());
            }
        }
        Some(user)
    }
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
    let token = token?.trim();
    if token.is_empty() {
        return None;
    }
    if let Ok(decrypted) = record_manager.csm_decrypt(token) {
        if let Some(part) = decrypted.split("_____").next().filter(|s| !s.is_empty()) {
            return Some(part.to_string());
        }
    }
    token
        .split("_____")
        .next()
        .filter(|s| !s.is_empty())
        .map(String::from)
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
