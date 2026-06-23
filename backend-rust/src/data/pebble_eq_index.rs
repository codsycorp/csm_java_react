//! SSD eq-index on Pebble — mirrors `backend-go/internal/data/pebble_eq_index.go`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use parking_lot::RwLock;
use pebbledb::{Batch, Db, IterOptions, Options as PebbleOptions};
use serde_json::Value;
use tracing::{info, warn};

use super::eq_index_common::{
    field_lookup_key, is_indexable_eq_field, normalize_eq_index_value, MAX_EQ_INDEX_KEYS,
};
use super::pebble_keys::{parse_pebble_key, pebble_key, rocks_key_from_pebble_key};
use crate::config::ensure_dir;

const EQ_INDEX_FORWARD_PREFIX: &str = "f\x00";
const EQ_INDEX_REVERSE_PREFIX: &str = "r\x00";
const EQ_INDEX_KEY_SEP: &str = "\x01";
const EQ_INDEX_META_KEYS: &[u8] = b"__meta|keys";

pub struct PebbleEqIndex {
    root: PathBuf,
    table_dbs: RwLock<HashMap<String, Arc<Db>>>,
    closed: AtomicBool,
}

impl PebbleEqIndex {
    pub fn open(root: &Path) -> Result<Self> {
        if root.as_os_str().is_empty() {
            anyhow::bail!("eq-index root empty");
        }
        ensure_dir(root)?;
        info!(
            "RecordManager: SSD eq-index (Pebble) {}/{{app}}/{{table}}/",
            root.display()
        );
        Ok(Self {
            root: root.to_path_buf(),
            table_dbs: RwLock::new(HashMap::new()),
            closed: AtomicBool::new(false),
        })
    }

    pub fn upsert(
        &self,
        app_id: &str,
        table_name: &str,
        storage_key: &str,
        record: &serde_json::Map<String, Value>,
    ) {
        let canonical = pebble_key(app_id, table_name, storage_key);
        if canonical.is_empty() {
            return;
        }
        let Ok(db) = self.index_db(app_id, table_name) else {
            return;
        };
        let had_key = self.pebble_key_indexed(&db, &canonical);
        if had_key {
            let _ = self.delete_pebble_key_locked(&db, &canonical);
        }

        let mut batch = Batch::new();
        let mut wrote = false;
        for (field, value) in record {
            if !is_indexable_eq_field(field, value) {
                continue;
            }
            let norm = normalize_eq_index_value(value);
            if norm.is_empty() {
                continue;
            }
            let fk = field_lookup_key(app_id, table_name, field, &norm);
            batch.set(&eq_forward_key(&fk, &canonical), b"");
            batch.set(&eq_reverse_key(&canonical, &fk), b"");
            wrote = true;
        }
        if !wrote {
            return;
        }
        if let Err(e) = db.apply(batch) {
            warn!("eq-index upsert commit failed {app_id}/{table_name}: {e:#}");
            return;
        }
        if !had_key {
            self.adjust_meta_count(&db, 1);
        }
    }

    pub fn delete_storage_key(&self, app_id: &str, table_name: &str, storage_key: &str) {
        let canonical = pebble_key(app_id, table_name, storage_key);
        self.delete_pebble_key(&canonical);
    }

    pub fn delete_pebble_key(&self, canonical: &str) {
        if canonical.is_empty() {
            return;
        }
        let Some((app_id, table_name, _)) = parse_pebble_key(canonical) else {
            return;
        };
        let Ok(db) = self.index_db(&app_id, &table_name) else {
            return;
        };
        if self.delete_pebble_key_locked(&db, canonical) {
            self.adjust_meta_count(&db, -1);
        }
    }

    pub fn delete_table(&self, app_id: &str, table_name: &str) {
        let key = table_key(app_id, table_name);
        if let Some(db) = self.table_dbs.write().remove(&key) {
            drop(db);
        }
        let path = self.root.join(app_id).join(table_name);
        let _ = std::fs::remove_dir_all(path);
    }

    pub fn keys_for_eq(
        &self,
        app_id: &str,
        table_name: &str,
        field: &str,
        value: &str,
    ) -> Vec<String> {
        let Ok(db) = self.index_db(app_id, table_name) else {
            return Vec::new();
        };
        let field_key = field_lookup_key(
            app_id,
            table_name,
            field,
            &normalize_eq_index_value(&Value::String(value.to_string())),
        );
        let prefix = eq_forward_prefix(&field_key);
        let upper = upper_bound_from_prefix(&prefix);
        let keys = match collect_keys_in_range(&db, &prefix, &upper) {
            Ok(k) => k,
            Err(e) => {
                warn!("eq-index keys iter failed {app_id}/{table_name}: {e:#}");
                return Vec::new();
            }
        };
        let prefix_str = String::from_utf8_lossy(&prefix);
        keys.into_iter()
            .filter_map(|k| {
                let s = String::from_utf8_lossy(&k);
                s.strip_prefix(prefix_str.as_ref())
                    .filter(|pk| !pk.is_empty())
                    .map(|pk| rocks_key_from_pebble_key(pk))
            })
            .take(MAX_EQ_INDEX_KEYS)
            .collect()
    }

    pub fn count_table_keys(&self, app_id: &str, table_name: &str) -> usize {
        let Ok(db) = self.index_db(app_id, table_name) else {
            return 0;
        };
        self.read_meta_count(&db)
    }

    pub fn list_table_storage_keys(
        &self,
        app_id: &str,
        table_name: &str,
        offset: usize,
        limit: usize,
    ) -> (Vec<String>, usize) {
        let limit = limit.max(1);
        let Ok(db) = self.index_db(app_id, table_name) else {
            return (Vec::new(), 0);
        };
        let total = self.read_meta_count(&db);
        if total == 0 {
            return (Vec::new(), 0);
        }
        let lower = EQ_INDEX_REVERSE_PREFIX.as_bytes().to_vec();
        let upper = upper_bound_from_prefix(&lower);
        let keys = match collect_keys_in_range(&db, &lower, &upper) {
            Ok(k) => k,
            Err(_) => return (Vec::new(), total),
        };
        let mut out = Vec::new();
        let mut skipped = 0usize;
        let mut last = String::new();
        for k in keys {
            let pk = parse_pebble_key_from_reverse_key(&k);
            if pk.is_empty() || pk == last {
                continue;
            }
            last = pk.clone();
            if skipped < offset {
                skipped += 1;
                continue;
            }
            out.push(rocks_key_from_pebble_key(&pk));
            if out.len() >= limit {
                break;
            }
        }
        (out, total)
    }

    pub fn close(&self) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        let mut dbs = self.table_dbs.write();
        for (_, db) in dbs.drain() {
            drop(db);
        }
    }

    fn index_db(&self, app_id: &str, table_name: &str) -> Result<Arc<Db>> {
        if self.closed.load(Ordering::SeqCst) {
            anyhow::bail!("eq-index shut down");
        }
        let key = table_key(app_id, table_name);
        if let Some(db) = self.table_dbs.read().get(&key) {
            return Ok(db.clone());
        }
        let mut guard = self.table_dbs.write();
        if let Some(db) = guard.get(&key) {
            return Ok(db.clone());
        }
        let path = self.root.join(app_id).join(table_name);
        ensure_dir(&path)?;
        let opts = index_pebble_options();
        let db = Arc::new(
            Db::open(&path, opts).with_context(|| format!("open eq-index {}", path.display()))?,
        );
        guard.insert(key, db.clone());
        Ok(db)
    }

    fn pebble_key_indexed(&self, db: &Db, pebble_key: &str) -> bool {
        let lower = eq_reverse_prefix(pebble_key);
        let upper = upper_bound_from_prefix(&lower);
        collect_keys_in_range(db, &lower, &upper)
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }

    fn delete_pebble_key_locked(&self, db: &Db, pebble_key: &str) -> bool {
        let lower = eq_reverse_prefix(pebble_key);
        let upper = upper_bound_from_prefix(&lower);
        let rev_keys = match collect_keys_in_range(db, &lower, &upper) {
            Ok(k) => k,
            Err(_) => return false,
        };
        if rev_keys.is_empty() {
            return false;
        }
        let mut batch = Batch::new();
        for rev in &rev_keys {
            batch.delete(rev);
            let rev_str = String::from_utf8_lossy(rev);
            let rest = rev_str.strip_prefix(EQ_INDEX_REVERSE_PREFIX).unwrap_or("");
            if let Some((pebble_part, field_key)) = rest.split_once(EQ_INDEX_KEY_SEP) {
                if !pebble_part.is_empty() && !field_key.is_empty() {
                    batch.delete(&eq_forward_key(field_key, pebble_part));
                }
            }
        }
        db.apply(batch).is_ok()
    }

    fn read_meta_count(&self, db: &Db) -> usize {
        match db.get(EQ_INDEX_META_KEYS) {
            Ok(Some(v)) => String::from_utf8_lossy(&v).parse().unwrap_or(0),
            _ => 0,
        }
    }

    fn adjust_meta_count(&self, db: &Db, delta: i32) {
        let n = self.read_meta_count(db) as i32 + delta;
        if n <= 0 {
            let _ = db.delete(EQ_INDEX_META_KEYS);
            return;
        }
        let _ = db.set(EQ_INDEX_META_KEYS, n.to_string().as_bytes());
    }
}

impl Drop for PebbleEqIndex {
    fn drop(&mut self) {
        self.close();
    }
}

fn table_key(app_id: &str, table_name: &str) -> String {
    format!("{app_id}/{table_name}")
}

fn index_pebble_options() -> PebbleOptions {
    let mut opts = PebbleOptions::default();
    opts.create_if_missing = true;
    opts.mem_table_size = 4 << 20;
    opts.mem_table_stop_writes_threshold = 2;
    opts
}

fn eq_forward_key(field_key: &str, pebble_key: &str) -> Vec<u8> {
    format!("{EQ_INDEX_FORWARD_PREFIX}{field_key}{EQ_INDEX_KEY_SEP}{pebble_key}").into_bytes()
}

fn eq_reverse_key(pebble_key: &str, field_key: &str) -> Vec<u8> {
    format!("{EQ_INDEX_REVERSE_PREFIX}{pebble_key}{EQ_INDEX_KEY_SEP}{field_key}").into_bytes()
}

fn eq_forward_prefix(field_key: &str) -> Vec<u8> {
    format!("{EQ_INDEX_FORWARD_PREFIX}{field_key}{EQ_INDEX_KEY_SEP}").into_bytes()
}

fn eq_reverse_prefix(pebble_key: &str) -> Vec<u8> {
    format!("{EQ_INDEX_REVERSE_PREFIX}{pebble_key}{EQ_INDEX_KEY_SEP}").into_bytes()
}

fn upper_bound_from_prefix(prefix: &[u8]) -> Vec<u8> {
    let mut upper = prefix.to_vec();
    upper.push(0xff);
    upper
}

fn collect_keys_in_range(db: &Db, lower: &[u8], upper: &[u8]) -> Result<Vec<Vec<u8>>> {
    let mut opts = IterOptions::default();
    opts.lower_bound = Some(lower.to_vec());
    opts.upper_bound = Some(upper.to_vec());
    let mut it = db.iter_with_options(opts).context("eq-index iter")?;
    let mut out = Vec::new();
    it.first()?;
    if it.valid() {
        while it.valid() {
            out.push(it.key().to_vec());
            it.next()?;
        }
    }
    Ok(out)
}

fn parse_pebble_key_from_reverse_key(key: &[u8]) -> String {
    let s = String::from_utf8_lossy(key);
    let rest = s.strip_prefix(EQ_INDEX_REVERSE_PREFIX).unwrap_or("");
    rest.split(EQ_INDEX_KEY_SEP).next().unwrap_or("").to_string()
}
