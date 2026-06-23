//! In-memory equality index — mirrors `backend-go/internal/data/memory_eq_index.go`.

use std::collections::{HashMap, HashSet};
use std::sync::RwLock;

use serde_json::Value;

use super::eq_index_common::{
    field_lookup_key, is_indexable_eq_field, normalize_eq_index_value, table_lookup_key,
};
use super::pebble_keys::{pebble_key, rocks_key_from_pebble_key};

#[derive(Default)]
pub struct MemoryEqIndex {
    inner: RwLock<EqIndexState>,
}

#[derive(Default)]
struct EqIndexState {
    lookup: HashMap<String, HashSet<String>>,
    pebble_fields: HashMap<String, Vec<String>>,
    table_keys: HashMap<String, HashSet<String>>,
}

impl MemoryEqIndex {
    pub fn upsert(&self, app_id: &str, table_name: &str, storage_key: &str, record: &serde_json::Map<String, Value>) {
        let canonical = pebble_key(app_id, table_name, storage_key);
        let mut state = self.inner.write().expect("eq_index lock");
        Self::delete_locked(&mut state, &canonical);

        let table_key = table_lookup_key(app_id, table_name);
        let mut field_keys = Vec::new();
        for (field, value) in record {
            if !is_indexable_eq_field(field, value) {
                continue;
            }
            let norm = normalize_eq_index_value(value);
            if norm.is_empty() {
                continue;
            }
            let fk = field_lookup_key(app_id, table_name, field, &norm);
            field_keys.push(fk.clone());
            state
                .lookup
                .entry(fk)
                .or_default()
                .insert(canonical.clone());
            state
                .table_keys
                .entry(table_key.clone())
                .or_default()
                .insert(canonical.clone());
        }
        if !field_keys.is_empty() {
            state.pebble_fields.insert(canonical, field_keys);
        }
    }

    pub fn delete_storage_key(&self, app_id: &str, table_name: &str, storage_key: &str) {
        let canonical = pebble_key(app_id, table_name, storage_key);
        let mut state = self.inner.write().expect("eq_index lock");
        Self::delete_locked(&mut state, &canonical);
    }

    pub fn delete_pebble_key(&self, canonical: &str) {
        let mut state = self.inner.write().expect("eq_index lock");
        Self::delete_locked(&mut state, canonical);
    }

    pub fn delete_table(&self, app_id: &str, table_name: &str) {
        let table_key = table_lookup_key(app_id, table_name);
        let keys: Vec<String> = {
            let state = self.inner.read().expect("eq_index lock");
            state
                .table_keys
                .get(&table_key)
                .map(|s| s.iter().cloned().collect())
                .unwrap_or_default()
        };
        let mut state = self.inner.write().expect("eq_index lock");
        for canonical in keys {
            Self::delete_locked(&mut state, &canonical);
        }
        state.table_keys.remove(&table_key);
    }

    pub fn keys_for_eq(&self, app_id: &str, table_name: &str, field: &str, value: &str) -> Vec<String> {
        let fk = field_lookup_key(app_id, table_name, field, &normalize_eq_index_value(&Value::String(value.to_string())));
        let state = self.inner.read().expect("eq_index lock");
        state
            .lookup
            .get(&fk)
            .map(|set| {
                set.iter()
                    .map(|k| rocks_key_from_pebble_key(k))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn count_table_keys(&self, app_id: &str, table_name: &str) -> usize {
        self.list_table_storage_keys(app_id, table_name, 0, 1).1
    }

    pub fn list_table_storage_keys(&self, app_id: &str, table_name: &str, offset: usize, limit: usize) -> (Vec<String>, usize) {
        let table_key = table_lookup_key(app_id, table_name);
        let state = self.inner.read().expect("eq_index lock");
        let Some(keys) = state.table_keys.get(&table_key) else {
            return (Vec::new(), 0);
        };
        let mut sorted: Vec<String> = keys
            .iter()
            .map(|k| rocks_key_from_pebble_key(k))
            .collect();
        sorted.sort();
        sorted.dedup();
        let total = sorted.len();
        let slice = sorted.into_iter().skip(offset).take(limit).collect();
        (slice, total)
    }

    fn delete_locked(state: &mut EqIndexState, canonical: &str) {
        if let Some(field_keys) = state.pebble_fields.remove(canonical) {
            for fk in field_keys {
                if let Some(set) = state.lookup.get_mut(&fk) {
                    set.remove(canonical);
                    if set.is_empty() {
                        state.lookup.remove(&fk);
                    }
                }
            }
        }
        for table in state.table_keys.values_mut() {
            table.remove(canonical);
        }
        state.table_keys.retain(|_, v| !v.is_empty());
    }
}
