//! Shared eq-index helpers — mirrors Go `search_eq_index.go` + `memory_eq_index.go`.

use serde_json::Value;

pub const MAX_EQ_INDEX_KEYS: usize = 50_000;

pub fn field_lookup_key(app_id: &str, table_name: &str, field_name: &str, field_value: &str) -> String {
    format!("{app_id}\0{table_name}\0{field_name}\0{field_value}")
}

pub fn table_lookup_key(app_id: &str, table_name: &str) -> String {
    format!("{app_id}\0{table_name}")
}

pub fn is_indexable_eq_field(field: &str, value: &Value) -> bool {
    let field = field.trim();
    if field.is_empty() || field.starts_with('_') || field.eq_ignore_ascii_case("password") {
        return false;
    }
    match field.to_ascii_lowercase().as_str() {
        "code" | "content" | "data" | "json" | "html" | "body" | "note" | "notes"
        | "description" | "template" | "config" => {
            if let Value::String(s) = value {
                if s.len() > 256 {
                    return false;
                }
            }
        }
        _ => {}
    }
    match value {
        Value::String(s) => s.len() <= 512,
        Value::Bool(_) | Value::Number(_) => true,
        _ => false,
    }
}

pub fn normalize_eq_index_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => value.to_string(),
    }
}
