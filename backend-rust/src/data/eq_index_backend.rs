//! Eq-index backend selector — memory (RAM) or Pebble (SSD), mirrors Go `eq_index_backend.go`.

use anyhow::Result;
use serde_json::Value;

use super::eq_index::MemoryEqIndex;
use super::pebble_eq_index::PebbleEqIndex;
use crate::config::AppConfig;

pub enum EqIndex {
    Memory(MemoryEqIndex),
    Pebble(PebbleEqIndex),
}

impl EqIndex {
    pub fn open(config: &AppConfig) -> Result<Self> {
        if config.uses_pebble_eq_index() {
            Ok(Self::Pebble(PebbleEqIndex::open(&config.eq_index_root)?))
        } else {
            Ok(Self::Memory(MemoryEqIndex::default()))
        }
    }

    pub fn mode_label(&self) -> &'static str {
        match self {
            Self::Memory(_) => "memory",
            Self::Pebble(_) => "pebble",
        }
    }

    pub fn upsert(
        &self,
        app_id: &str,
        table_name: &str,
        storage_key: &str,
        record: &serde_json::Map<String, Value>,
    ) {
        match self {
            Self::Memory(idx) => idx.upsert(app_id, table_name, storage_key, record),
            Self::Pebble(idx) => idx.upsert(app_id, table_name, storage_key, record),
        }
    }

    pub fn delete_storage_key(&self, app_id: &str, table_name: &str, storage_key: &str) {
        match self {
            Self::Memory(idx) => idx.delete_storage_key(app_id, table_name, storage_key),
            Self::Pebble(idx) => idx.delete_storage_key(app_id, table_name, storage_key),
        }
    }

    pub fn delete_pebble_key(&self, canonical: &str) {
        match self {
            Self::Memory(idx) => idx.delete_pebble_key(canonical),
            Self::Pebble(idx) => idx.delete_pebble_key(canonical),
        }
    }

    pub fn delete_table(&self, app_id: &str, table_name: &str) {
        match self {
            Self::Memory(idx) => idx.delete_table(app_id, table_name),
            Self::Pebble(idx) => idx.delete_table(app_id, table_name),
        }
    }

    pub fn keys_for_eq(
        &self,
        app_id: &str,
        table_name: &str,
        field: &str,
        value: &str,
    ) -> Vec<String> {
        match self {
            Self::Memory(idx) => idx.keys_for_eq(app_id, table_name, field, value),
            Self::Pebble(idx) => idx.keys_for_eq(app_id, table_name, field, value),
        }
    }

    pub fn count_table_keys(&self, app_id: &str, table_name: &str) -> usize {
        match self {
            Self::Memory(idx) => idx.count_table_keys(app_id, table_name),
            Self::Pebble(idx) => idx.count_table_keys(app_id, table_name),
        }
    }

    pub fn list_table_storage_keys(
        &self,
        app_id: &str,
        table_name: &str,
        offset: usize,
        limit: usize,
    ) -> (Vec<String>, usize) {
        match self {
            Self::Memory(idx) => idx.list_table_storage_keys(app_id, table_name, offset, limit),
            Self::Pebble(idx) => idx.list_table_storage_keys(app_id, table_name, offset, limit),
        }
    }

    pub fn close(&self) {
        match self {
            Self::Memory(_) => {}
            Self::Pebble(idx) => idx.close(),
        }
    }
}

impl Drop for EqIndex {
    fn drop(&mut self) {
        self.close();
    }
}
