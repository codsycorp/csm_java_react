//! Record vector indexing — mirrors `backend-go/internal/data/search_db.go`.

use std::collections::HashMap;

use serde_json::{Map, Value};

use super::vector_store::VECTOR_COLL_RECORDS;

const MIN_SEARCH_TEXT_LEN: usize = 8;

const SEARCH_TEXT_FIELDS: &[&str] = &[
    "name", "title", "summary", "content", "description", "body", "text", "email", "username",
    "full_name", "fullName", "phoneNumber", "note", "notes", "login_identifier", "app_token",
    "refresh_token", "refresh", "tag", "tags", "path", "scope", "message", "comment",
];

pub fn is_auth_table(table_name: &str) -> bool {
    matches!(
        table_name.trim().to_lowercase().as_str(),
        "csm_accounts" | "csm_group_members"
    )
}

pub fn extract_search_text(record: &Map<String, Value>) -> (String, String) {
    let mut parts = Vec::new();
    let mut title = String::new();
    for field in SEARCH_TEXT_FIELDS {
        let Some(v) = record.get(*field) else {
            continue;
        };
        let s = value_to_search_string(v);
        if s.is_empty() {
            continue;
        }
        if title.is_empty()
            && matches!(*field, "name" | "title" | "username" | "email")
        {
            title = s.clone();
        }
        parts.push(s);
    }
    let content = parts.join(" ");
    if title.is_empty() {
        if let Some(first) = parts.first() {
            title = trim_runes(first, 120);
        }
    }
    (title, content)
}

fn value_to_search_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

fn record_id_from_map(record: &Map<String, Value>, fallback_key: &str) -> String {
    for k in ["id", "chunkId", "chunk_id"] {
        if let Some(v) = record.get(k).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return v.to_string();
        }
    }
    fallback_key.to_string()
}

fn trim_runes(s: &str, max: usize) -> String {
    let r: Vec<char> = s.chars().collect();
    if r.len() <= max {
        s.to_string()
    } else {
        r[..max].iter().collect()
    }
}

impl super::RecordManager {
    pub fn upsert_vector_index(
        &self,
        app_id: &str,
        table_name: &str,
        pebble_key: &str,
        storage_key: &str,
        record: &Map<String, Value>,
    ) {
        let Some(vs) = &self.vector_store else {
            return;
        };
        if is_auth_table(table_name) || !self.config.vector_records_enabled {
            return;
        }

        let (title, content) = extract_search_text(record);
        if content.len() < MIN_SEARCH_TEXT_LEN {
            let _ = vs.delete_doc(VECTOR_COLL_RECORDS, pebble_key);
            return;
        }

        let record_id = record_id_from_map(record, storage_key);
        let mut meta = HashMap::new();
        meta.insert("app_id".into(), app_id.to_string());
        meta.insert("table_name".into(), table_name.to_string());
        meta.insert("record_id".into(), record_id);
        meta.insert("pebble_key".into(), pebble_key.to_string());
        meta.insert("title".into(), title.clone());
        let text = format!("{title}\n{content}");
        let _ = vs.upsert_doc(VECTOR_COLL_RECORDS, pebble_key, &meta, &text);
    }

    pub fn delete_vector_index(&self, pebble_key: &str) {
        if pebble_key.is_empty() {
            return;
        }
        if let Some(vs) = &self.vector_store {
            let _ = vs.delete_doc(VECTOR_COLL_RECORDS, pebble_key);
        }
    }

    pub fn delete_search_index(&self, pebble_key: &str) {
        if pebble_key.is_empty() {
            return;
        }
        if self.config.uses_eq_index() {
            self.eq_index.delete_pebble_key(pebble_key);
        }
        self.delete_vector_index(pebble_key);
    }

    pub fn delete_search_index_for_table(&self, app_id: &str, table_name: &str) {
        if self.config.uses_eq_index() {
            self.eq_index.delete_table(app_id, table_name);
        }
        if let Some(vs) = &self.vector_store {
            let mut where_clause = HashMap::new();
            where_clause.insert("app_id".into(), app_id.to_string());
            where_clause.insert("table_name".into(), table_name.to_string());
            let _ = vs.delete_where(VECTOR_COLL_RECORDS, &where_clause);
        }
    }
}
