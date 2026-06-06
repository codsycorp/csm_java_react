use serde_json::Value;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
    pub username: String,
    pub app_token: String,
    pub login_version: i32,
    pub permissions: Vec<String>,
    pub menus_permissions: Vec<String>,
    pub dev: bool,
    pub app_id: String,
    pub extra: serde_json::Map<String, Value>,
}

impl AuthUser {
    pub fn from_user(crate::model::User { id, username, app_token, login_version, permissions, menus_permissions, dev, app_id, .. }: crate::model::User) -> Self {
        Self {
            user_id: id.unwrap_or_default(),
            username: username.unwrap_or_default(),
            app_token: app_token.unwrap_or_default(),
            login_version: login_version.unwrap_or(0),
            permissions: permissions.unwrap_or_default(),
            menus_permissions: menus_permissions.unwrap_or_default(),
            dev: dev.unwrap_or(false),
            app_id: app_id.unwrap_or_default(),
            extra: serde_json::Map::new(),
        }
    }
}
