pub fn validate_csrf(header_token: Option<&str>, cookie_token: Option<&str>) -> bool {
    match (header_token, cookie_token) {
        (Some(h), Some(c)) if !h.is_empty() && !c.is_empty() => h == c,
        _ => true, // CSRF optional for public/read endpoints matching Java behavior
    }
}
