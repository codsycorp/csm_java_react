use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Option<String>,
    #[serde(alias = "refresh")]
    pub refresh_token: Option<String>,
    pub refresh_token_ip: Option<String>,
    pub refresh_token_ua: Option<String>,
    pub refresh_token_expiry: Option<i64>,
    pub email: Option<String>,
    #[serde(alias = "pass")]
    pub password: Option<String>,
    pub username: Option<String>,
    pub phone_number: Option<String>,
    pub actived: Option<bool>,
    #[serde(rename = "app_token")]
    pub app_token: Option<String>,
    #[serde(rename = "app_id")]
    pub app_id: Option<String>,
    #[serde(rename = "data_app_ids", alias = "dataAppIds")]
    pub data_app_ids: Option<Vec<String>>,
    pub full_name: Option<String>,
    pub user_address: Option<Value>,
    pub avatar: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub menus_permissions: Option<Vec<String>>,
    pub permission_bitfield: Option<String>,
    pub permission_schema_version: Option<String>,
    pub data_scope: Option<String>,
    pub dept_id: Option<String>,
    pub branch_id: Option<String>,
    pub dev: Option<bool>,
    pub is_sub_user: Option<bool>,
    #[serde(alias = "login_version")]
    pub login_version: Option<i32>,
}

impl User {
    pub fn from_record(record: &serde_json::Map<String, Value>) -> Self {
        let mut user: User =
            serde_json::from_value(Value::Object(record.clone())).unwrap_or_default();
        if user.password.is_none() {
            user.password = record
                .get("pass")
                .or_else(|| record.get("password"))
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.refresh_token.is_none() {
            user.refresh_token = record
                .get("refresh_token")
                .or_else(|| record.get("refresh"))
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.phone_number.is_none() {
            user.phone_number = record
                .get("phoneNumber")
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.permissions.is_none() {
            user.permissions = parse_string_list(record.get("permissions"));
        }
        if user.menus_permissions.is_none() {
            user.menus_permissions = parse_string_list(
                record
                    .get("menusPermissions")
                    .or_else(|| record.get("menus_permissions")),
            );
        }
        if user.actived.is_none() {
            user.actived = record
                .get("actived")
                .and_then(|v| v.as_bool())
                .or_else(|| {
                    record
                        .get("actived")
                        .and_then(|v| v.as_str())
                        .map(|s| s.eq_ignore_ascii_case("true"))
                });
        }
        if user.id.is_none() {
            user.id = record
                .get("id")
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.login_version.is_none() {
            user.login_version = record
                .get("loginVersion")
                .or_else(|| record.get("login_version"))
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .map(|v| v as i32);
        }
        if user.refresh_token_ip.is_none() {
            user.refresh_token_ip = record
                .get("refresh_token_ip")
                .or_else(|| record.get("refreshTokenIp"))
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.refresh_token_ua.is_none() {
            user.refresh_token_ua = record
                .get("refresh_token_ua")
                .or_else(|| record.get("refreshTokenUa"))
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.refresh_token_expiry.is_none() {
            user.refresh_token_expiry = record
                .get("refresh_token_expiry")
                .or_else(|| record.get("refreshTokenExpiry"))
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())));
        }
        if user.app_id.is_none() {
            user.app_id = record
                .get("app_id")
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.app_token.is_none() {
            user.app_token = record
                .get("app_token")
                .and_then(|v| v.as_str())
                .map(String::from);
        }
        if user.data_app_ids.is_none() {
            user.data_app_ids = parse_string_list(
                record
                    .get("data_app_ids")
                    .or_else(|| record.get("dataAppIds")),
            );
        }
        if user.dev.is_none() {
            user.dev = record.get("dev").and_then(|v| v.as_bool());
        }
        user
    }

    pub fn to_info_map(&self) -> serde_json::Map<String, Value> {
        let mut map = serde_json::Map::new();
        if let Some(v) = &self.id {
            map.insert("userId".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.username {
            map.insert("username".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.email {
            map.insert("email".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.phone_number {
            map.insert("phoneNumber".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.full_name {
            map.insert("full_name".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.avatar {
            map.insert("avatar".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.user_address {
            map.insert("user_address".into(), v.clone());
        }
        if let Some(v) = &self.permissions {
            map.insert(
                "roles".into(),
                Value::Array(v.iter().cloned().map(Value::String).collect()),
            );
            map.insert(
                "permissions".into(),
                Value::Array(v.iter().cloned().map(Value::String).collect()),
            );
        }
        if let Some(v) = &self.menus_permissions {
            map.insert(
                "menusPermissions".into(),
                Value::Array(v.iter().cloned().map(Value::String).collect()),
            );
        }
        if let Some(v) = &self.permission_bitfield {
            map.insert("permissionBitfield".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.permission_schema_version {
            map.insert("permissionSchemaVersion".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.data_scope {
            map.insert("dataScope".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.dept_id {
            map.insert("dept_id".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.branch_id {
            map.insert("branch_id".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.app_id {
            map.insert("app_id".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.data_app_ids {
            map.insert(
                "data_app_ids".into(),
                Value::Array(v.iter().cloned().map(Value::String).collect()),
            );
        }
        if let Some(v) = &self.app_token {
            map.insert("app_token".into(), Value::String(v.clone()));
        }
        if let Some(v) = self.dev {
            map.insert("dev".into(), Value::Bool(v));
        }
        map
    }
}

fn parse_string_list(value: Option<&Value>) -> Option<Vec<String>> {
    match value {
        Some(Value::Array(arr)) => Some(
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect(),
        ),
        Some(Value::String(s)) if !s.is_empty() => Some(vec![s.clone()]),
        _ => None,
    }
}
