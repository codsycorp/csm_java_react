use axum::http::{header, HeaderMap};

use crate::model::User;

/// Mirror Java JwtAuthenticationFilter / AuthHandler IP normalization.
pub fn normalize_client_ip(ip: &str) -> String {
    let normalized = ip.trim();
    match normalized {
        "::1" | "0:0:0:0:0:0:0:1" => "127.0.0.1".into(),
        _ => normalized.to_string(),
    }
}

pub fn normalize_user_agent(ua: &str) -> String {
    ua.trim().to_string()
}

pub fn user_agent_matches(current_ua: &str, saved_ua: &str) -> bool {
    let current = normalize_user_agent(current_ua);
    let saved = normalize_user_agent(saved_ua);
    !current.is_empty() && !saved.is_empty() && current == saved
}

pub fn client_ip_from_headers(headers: &HeaderMap) -> String {
    if let Some(ip) = headers
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return normalize_client_ip(ip);
    }
    if let Some(ip) = headers
        .get("x-real-ip")
        .and_then(|h| h.to_str().ok())
        .filter(|s| !s.is_empty())
    {
        return normalize_client_ip(ip);
    }
    String::new()
}

pub fn user_agent_from_headers(headers: &HeaderMap) -> String {
    headers
        .get(header::USER_AGENT)
        .and_then(|h| h.to_str().ok())
        .map(normalize_user_agent)
        .unwrap_or_default()
}

pub fn refresh_token_expired(user: &User) -> bool {
    let expiry = user.refresh_token_expiry.unwrap_or(0);
    expiry > 0 && expiry <= chrono::Utc::now().timestamp_millis()
}

/// Refresh token session is bound to the IP + User-Agent stored at login/refresh.
pub fn refresh_session_matches(user: &User, client_ip: &str, client_ua: &str) -> bool {
    let saved_ip = user.refresh_token_ip.as_deref().unwrap_or("");
    let saved_ua = user.refresh_token_ua.as_deref().unwrap_or("");
    !saved_ip.is_empty()
        && !saved_ua.is_empty()
        && normalize_client_ip(saved_ip) == normalize_client_ip(client_ip)
        && user_agent_matches(client_ua, saved_ua)
}

pub fn refresh_session_valid(user: &User, client_ip: &str, client_ua: &str) -> bool {
    !refresh_token_expired(user) && refresh_session_matches(user, client_ip, client_ua)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_loopback_ipv6() {
        assert_eq!(normalize_client_ip("::1"), "127.0.0.1");
    }

    #[test]
    fn user_agent_must_match_exactly() {
        assert!(user_agent_matches("Mozilla/5.0", "Mozilla/5.0"));
        assert!(!user_agent_matches("Mozilla/5.0 A", "Mozilla/5.0 B"));
        assert!(!user_agent_matches("", "Mozilla/5.0"));
    }
}
