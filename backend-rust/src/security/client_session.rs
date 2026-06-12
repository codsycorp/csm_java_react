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
    if current.is_empty() || saved.is_empty() {
        return false;
    }
    current == saved
}

/// Mirror Java AuthHandler.handleRefreshToken IP/UA check (empty equals empty).
pub fn refresh_token_ip_matches(user: &User, client_ip: &str) -> bool {
    let saved = user
        .refresh_token_ip
        .as_deref()
        .map(normalize_client_ip)
        .unwrap_or_default();
    normalize_client_ip(client_ip) == saved
}

pub fn refresh_token_ua_matches(user: &User, client_ua: &str) -> bool {
    user_agent_matches(client_ua, user.refresh_token_ua.as_deref().unwrap_or(""))
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
    expiry <= 0 || expiry <= chrono::Utc::now().timestamp_millis()
}

pub fn client_id_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-client-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_default()
}

pub fn refresh_token_client_matches(user: &User, client_id: &str) -> bool {
    let saved = user
        .refresh_token_client_id
        .as_deref()
        .unwrap_or("")
        .trim();
    if saved.is_empty() {
        return true;
    }
    !client_id.trim().is_empty() && saved == client_id.trim()
}

/// Refresh token session is bound to IP + User-Agent + browser client id stored at login/refresh.
pub fn refresh_session_matches(user: &User, client_ip: &str, client_ua: &str, client_id: &str) -> bool {
    refresh_token_ip_matches(user, client_ip)
        && refresh_token_ua_matches(user, client_ua)
        && refresh_token_client_matches(user, client_id)
}

pub fn refresh_session_valid(user: &User, client_ip: &str, client_ua: &str, client_id: &str) -> bool {
    !refresh_token_expired(user) && refresh_session_matches(user, client_ip, client_ua, client_id)
}

/// Mirror Java JwtAuthenticationFilter refresh fallback (requires saved IP/UA present).
pub fn refresh_session_valid_for_middleware(
    user: &User,
    client_ip: &str,
    client_ua: &str,
    client_id: &str,
) -> bool {
    // Java: getRefreshTokenIp() != null (empty string is allowed).
    let saved_ip = user.refresh_token_ip.as_deref();
    let saved_ua = user.refresh_token_ua.as_deref();
    saved_ip.is_some()
        && saved_ua.is_some()
        && user.refresh_token_expiry.unwrap_or(0) > chrono::Utc::now().timestamp_millis()
        && normalize_client_ip(saved_ip.unwrap_or("")) == normalize_client_ip(client_ip)
        && user_agent_matches(client_ua, saved_ua.unwrap_or(""))
        && refresh_token_client_matches(user, client_id)
}

pub fn cookie_from_headers(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some((key, value)) = part.split_once('=') {
            if key.trim() == name {
                let decoded = urlencoding::decode(value.trim())
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| value.trim().to_string());
                if !decoded.is_empty() {
                    return Some(decoded);
                }
            }
        }
    }
    None
}

/// Mirror Java JwtAuthenticationFilter: X-Refresh-Token header first, then cookie.
pub fn refresh_token_candidates(headers: &HeaderMap) -> Vec<String> {
    let mut out = Vec::new();
    let mut push = |token: Option<String>| {
        if let Some(token) = token.filter(|t| !t.is_empty()) {
            if !out.iter().any(|existing| existing == &token) {
                out.push(token);
            }
        }
    };
    push(
        headers
            .get("x-refresh-token")
            .and_then(|h| h.to_str().ok())
            .map(String::from),
    );
    push(cookie_from_headers(headers, "refreshToken"));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_loopback_ipv6() {
        assert_eq!(normalize_client_ip("::1"), "127.0.0.1");
    }

    #[test]
    fn refresh_client_id_must_match_when_bound() {
        use crate::model::User;
        let mut user = User::default();
        user.refresh_token_client_id = Some("csm-a|tab-b".into());
        user.refresh_token_ip = Some("127.0.0.1".into());
        user.refresh_token_ua = Some("Mozilla/5.0".into());
        user.refresh_token_expiry = Some(chrono::Utc::now().timestamp_millis() + 60_000);
        assert!(refresh_session_valid_for_middleware(
            &user,
            "127.0.0.1",
            "Mozilla/5.0",
            "csm-a|tab-b",
        ));
        assert!(!refresh_session_valid_for_middleware(
            &user,
            "127.0.0.1",
            "Mozilla/5.0",
            "csm-a|tab-c",
        ));
    }
}
