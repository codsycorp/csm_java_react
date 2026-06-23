//! Key helpers — mirrors `backend-go/internal/data/pebble_keys.go`.

pub const PEBBLE_KEY_PREFIX: &str = "v1|";

pub fn pebble_key(app_id: &str, table_name: &str, storage_key: &str) -> String {
    format!("{PEBBLE_KEY_PREFIX}{app_id}|{table_name}|{storage_key}")
}

pub fn table_prefix(app_id: &str, table_name: &str) -> String {
    format!("{PEBBLE_KEY_PREFIX}{app_id}|{table_name}|")
}

pub fn storage_key_candidates(app_id: &str, table_name: &str, base: &str) -> Vec<String> {
    vec![
        base.to_string(),
        format!("{table_name}_{base}"),
        format!("{app_id}_{table_name}_{base}"),
    ]
}

pub fn rocks_key_from_pebble_key(pebble_key: &str) -> String {
    let stripped = pebble_key.strip_prefix(PEBBLE_KEY_PREFIX).unwrap_or(pebble_key);
    let parts: Vec<&str> = stripped.splitn(3, '|').collect();
    if parts.len() == 3 {
        parts[2].to_string()
    } else {
        pebble_key.to_string()
    }
}

pub fn parse_pebble_key(pebble_key: &str) -> Option<(String, String, String)> {
    let stripped = pebble_key.strip_prefix(PEBBLE_KEY_PREFIX)?;
    let parts: Vec<&str> = stripped.splitn(3, '|').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((parts[0].to_string(), parts[1].to_string(), parts[2].to_string()))
}
