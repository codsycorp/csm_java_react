//! Startup eq-index rebuild — mirrors `backend-go/internal/data/search_startup.go` + `warmAuthEqIndex`.

use std::sync::Arc;

use anyhow::Result;
use serde_json::Value;
use tracing::{info, warn};

use super::record_manager::RecordManager;

fn parse_startup_table_ref(spec: &str) -> Option<(&str, &str)> {
    let spec = spec.trim();
    let (app, table) = spec.split_once('/')?;
    if app.is_empty() || table.is_empty() {
        return None;
    }
    Some((app, table))
}

impl RecordManager {
    fn count_pebble_rows(&self, app_id: &str, table_name: &str) -> usize {
        let Ok(db) = self.get_db(app_id, table_name) else {
            return 0;
        };
        let mut count = 0usize;
        let _ = db.for_each_entry(|key, _value| {
            let key_str = String::from_utf8_lossy(key);
            if !key_str.starts_with("__meta_") {
                count += 1;
            }
            Ok(())
        });
        count
    }

    fn needs_search_reindex(&self, app_id: &str, table_name: &str) -> bool {
        if !self.config.uses_eq_index() {
            return false;
        }
        let pebble_rows = self.count_pebble_rows(app_id, table_name);
        if pebble_rows == 0 {
            return false;
        }
        let indexed_keys = self.eq_index.count_table_keys(app_id, table_name);
        indexed_keys < pebble_rows
    }

    /// Rebuild eq-index for one table from Pebble KV (no vector writes).
    pub fn index_eq_index_only(&self, app_id: &str, table_name: &str) -> Result<usize> {
        if !self.config.uses_eq_index() {
            anyhow::bail!("eq-index unavailable");
        }
        self.eq_index.delete_table(app_id, table_name);
        let db = self.get_db(app_id, table_name)?;
        let mut indexed = 0usize;
        db.for_each_entry(|key, value| {
            let key_str = String::from_utf8_lossy(key);
            if key_str.starts_with("__meta_") {
                return Ok(());
            }
            if let Ok(Value::Object(map)) = serde_json::from_slice::<Value>(value) {
                self.eq_index.upsert(app_id, table_name, &key_str, &map);
                indexed += 1;
            }
            Ok(())
        })?;
        Ok(indexed)
    }

    /// Sync warmup for login tables — must complete before auth traffic (Go `warmAuthEqIndex`).
    pub fn warm_auth_eq_index(&self) {
        if !self.config.uses_eq_index() {
            return;
        }
        for spec in ["csm/csm_accounts", "csm/csm_group_members"] {
            let Some((app_id, table_name)) = parse_startup_table_ref(spec) else {
                continue;
            };
            if self.count_pebble_rows(app_id, table_name) == 0 {
                continue;
            }
            if !self.needs_search_reindex(app_id, table_name) {
                info!(
                    "[auth-eq-index] {app_id}/{table_name} OK (pebble={} eq_keys={})",
                    self.count_pebble_rows(app_id, table_name),
                    self.eq_index.count_table_keys(app_id, table_name)
                );
                continue;
            }
            let pebble_rows = self.count_pebble_rows(app_id, table_name);
            let indexed_keys = self.eq_index.count_table_keys(app_id, table_name);
            info!(
                "[auth-eq-index] rebuilding {app_id}/{table_name} (pebble={pebble_rows} indexed_keys={indexed_keys})…"
            );
            match self.index_eq_index_only(app_id, table_name) {
                Ok(n) => info!("[auth-eq-index] {app_id}/{table_name} ready: {n} rows indexed"),
                Err(e) => warn!("[auth-eq-index] {app_id}/{table_name} failed: {e:#}"),
            }
        }
    }

    /// Background rebuild for configured tables (Go `runStartupReindex`).
    pub fn run_startup_reindex(self: &Arc<Self>, tables: &[String]) {
        if !self.config.uses_eq_index() {
            return;
        }
        for spec in tables {
            let Some((app_id, table_name)) = parse_startup_table_ref(spec) else {
                warn!("[startup-reindex] skip invalid table ref {spec:?} (want app_id/table_name)");
                continue;
            };
            if !self.needs_search_reindex(app_id, table_name) {
                info!(
                    "[startup-reindex] {app_id}/{table_name} index OK (pebble={} eq_keys={})",
                    self.count_pebble_rows(app_id, table_name),
                    self.eq_index.count_table_keys(app_id, table_name)
                );
                continue;
            }
            let pebble_rows = self.count_pebble_rows(app_id, table_name);
            let indexed_keys = self.eq_index.count_table_keys(app_id, table_name);
            info!(
                "[startup-reindex] rebuilding {app_id}/{table_name} (pebble={pebble_rows} indexed_keys={indexed_keys})…"
            );
            match self.index_eq_index_only(app_id, table_name) {
                Ok(n) => info!("[startup-reindex] {app_id}/{table_name} done: {n} records indexed"),
                Err(e) => warn!("[startup-reindex] {app_id}/{table_name} failed: {e:#}"),
            }
        }
    }

    pub fn spawn_startup_reindex(self: &Arc<Self>) {
        if !self.config.startup_reindex || self.config.startup_reindex_tables.is_empty() {
            return;
        }
        let tables = self.config.startup_reindex_tables.clone();
        let rm = Arc::clone(self);
        std::thread::spawn(move || rm.run_startup_reindex(&tables));
    }
}
