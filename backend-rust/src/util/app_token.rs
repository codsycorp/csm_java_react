use crate::data::RecordManager;

/// Parsed metadata from decrypted app_token: `app_id_____login_____role_____access_right`
#[derive(Debug, Clone, Default)]
pub struct AppTokenMeta {
    pub app_id: String,
    pub login_identifier: String,
    pub role: String,
    pub access_right: i32,
}

pub fn parse_app_token(record_manager: &RecordManager, token: &str) -> AppTokenMeta {
    let token = token.trim();
    if token.is_empty() {
        return AppTokenMeta::default();
    }
    let decrypted = record_manager
        .csm_decrypt(token)
        .unwrap_or_else(|_| token.to_string());
    parse_decrypted_token(&decrypted)
}

pub fn parse_decrypted_token(decrypted: &str) -> AppTokenMeta {
    let parts: Vec<&str> = decrypted.split("_____").collect();
    AppTokenMeta {
        app_id: parts.first().copied().unwrap_or("").trim().to_string(),
        login_identifier: parts.get(1).copied().unwrap_or("").trim().to_string(),
        role: parts.get(2).copied().unwrap_or("").trim().to_string(),
        access_right: parts
            .last()
            .and_then(|s| s.trim().parse::<i32>().ok())
            .unwrap_or(0),
    }
}

pub fn is_sub_user_role(role: &str) -> bool {
    role.eq_ignore_ascii_case("user")
}

pub fn is_dev_access_right(access_right: i32) -> bool {
    access_right > 0
}
