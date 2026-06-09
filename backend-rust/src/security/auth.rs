use serde_json::Value;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
    pub username: String,
    pub app_token: String,
    pub login_version: i32,
    pub permissions: Vec<String>,
    pub menus_permissions: Option<Vec<String>>,
    pub dev: bool,
    pub app_id: String,
    pub data_app_ids: Vec<String>,
    pub extra: serde_json::Map<String, Value>,
}

impl AuthUser {
    pub fn from_user(
        crate::model::User {
            id,
            username,
            app_token,
            login_version,
            permissions,
            menus_permissions,
            dev,
            app_id,
            data_app_ids,
            ..
        }: crate::model::User,
    ) -> Self {
        let permissions = permissions.unwrap_or_default();
        let is_dev = dev.unwrap_or(false);
        Self {
            user_id: id.unwrap_or_default(),
            username: username.unwrap_or_default(),
            app_token: app_token.unwrap_or_default(),
            login_version: login_version.unwrap_or(0),
            menus_permissions,
            permissions,
            dev: is_dev,
            app_id: app_id.unwrap_or_default(),
            data_app_ids: data_app_ids.unwrap_or_default(),
            extra: serde_json::Map::new(),
        }
    }

    /// Mirrors Java TableHandler.canAccessAppData
    pub fn can_access_app_data(&self, target_app_id: &str) -> bool {
        let target = target_app_id.trim();
        if target.is_empty() {
            return true;
        }
        if self.dev {
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
