//! Grace window for rotated refresh tokens — mirrors `backend-go/internal/services/refresh_grace.go`.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;

use crate::model::User;

const REFRESH_GRACE_TTL: Duration = Duration::from_secs(120);

struct RefreshGraceEntry {
    until: Instant,
    app_token: String,
    user_id: String,
    login_version: i32,
    refresh_ip: String,
    refresh_ua: String,
    refresh_expiry: i64,
    refresh_client_id: String,
}

static REFRESH_TOKEN_GRACE: Lazy<Mutex<Vec<(String, RefreshGraceEntry)>>> =
    Lazy::new(|| Mutex::new(Vec::new()));

pub fn remember_rotated_refresh_token(old_token: &str, user: &User) {
    if old_token.is_empty() {
        return;
    }
    let entry = RefreshGraceEntry {
        until: Instant::now() + REFRESH_GRACE_TTL,
        app_token: user.app_token.clone().unwrap_or_default(),
        user_id: user.id.clone().unwrap_or_default(),
        login_version: user.login_version.unwrap_or(0),
        refresh_ip: user.refresh_token_ip.clone().unwrap_or_default(),
        refresh_ua: user.refresh_token_ua.clone().unwrap_or_default(),
        refresh_expiry: user.refresh_token_expiry.unwrap_or(0),
        refresh_client_id: user.refresh_token_client_id.clone().unwrap_or_default(),
    };
    let mut guard = REFRESH_TOKEN_GRACE.lock().expect("refresh grace lock");
    guard.retain(|(_, e)| e.until > Instant::now());
    guard.push((old_token.to_string(), entry));
}

pub fn lookup_refresh_grace_user(old_token: &str) -> Option<User> {
    let mut guard = REFRESH_TOKEN_GRACE.lock().expect("refresh grace lock");
    guard.retain(|(_, e)| e.until > Instant::now());
    let idx = guard.iter().position(|(t, _)| t == old_token)?;
    let (_, entry) = guard.get(idx)?;
    if Instant::now() > entry.until {
        guard.remove(idx);
        return None;
    }
    let mut user = User::default();
    if !entry.app_token.is_empty() {
        user.app_token = Some(entry.app_token.clone());
    }
    if !entry.user_id.is_empty() {
        user.id = Some(entry.user_id.clone());
    }
    user.login_version = Some(entry.login_version);
    if !entry.refresh_ip.is_empty() {
        user.refresh_token_ip = Some(entry.refresh_ip.clone());
    }
    if !entry.refresh_ua.is_empty() {
        user.refresh_token_ua = Some(entry.refresh_ua.clone());
    }
    if entry.refresh_expiry > 0 {
        user.refresh_token_expiry = Some(entry.refresh_expiry);
    }
    if !entry.refresh_client_id.is_empty() {
        user.refresh_token_client_id = Some(entry.refresh_client_id.clone());
    }
    user.refresh_token = Some(old_token.to_string());
    Some(user)
}
