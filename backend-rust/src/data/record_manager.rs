use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use dashmap::DashMap;
use parking_lot::Mutex;
use serde_json::{json, Map, Value};
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::{ensure_dir, AppConfig};
use crate::model::SearchFilter;
use crate::util::compare_records_desc;

use super::eq_index_backend::EqIndex;
use super::pebble_keys::{pebble_key, storage_key_candidates};
use super::table_store::{open_table_db, sanitize_kv_segment, DbHandle, TableBatch};
use super::vector_store::open_vector_store;
use super::vector_store::VectorStore;

pub const PHONE: &str = "0937.528.839";
pub const WRITEBY: &str = "base._co.osa";

const BATCH_SIZE: usize = 50;
const MAX_FILTER_TAKE: usize = 1000;
pub const DEFAULT_FILTER_TAKE: usize = 500;
const MAX_FIND_SCAN_RECORDS: usize = 2000;
const MAX_SAFE_FIND_RECORD_BYTES: usize = 4 * 1024 * 1024;
const MAX_SAFE_JSON_RECORD_BYTES: usize = 32 * 1024 * 1024;

pub struct RecordManager {
    pub(crate) config: AppConfig,
    data_dir: PathBuf,
    db_map: DashMap<String, Arc<DbHandle>>,
    db_locks: DashMap<String, Arc<Mutex<()>>>,
    shutdown: AtomicBool,
    table_schema_cache: DashMap<String, Vec<String>>,
    pub(crate) eq_index: Arc<EqIndex>,
    pub(crate) vector_store: Option<Arc<VectorStore>>,
}

impl RecordManager {
    pub fn new(config: AppConfig) -> Result<Self> {
        ensure_dir(&config.data_dir)?;
        ensure_dir(&config.native_data_dir)?;
        ensure_dir(config.table_kv_root())?;
        ensure_dir(&config.vector_store_dir)?;
        ensure_dir(&config.eq_index_root)?;
        ensure_dir(&config.kv_backup_dir)?;
        ensure_dir(&config.lucene_index_root)?;

        let vector_store = open_vector_store(&config);
        let eq_index = Arc::new(EqIndex::open(&config)?);

        Ok(Self {
            data_dir: config.data_dir.clone(),
            config,
            db_map: DashMap::new(),
            db_locks: DashMap::new(),
            shutdown: AtomicBool::new(false),
            table_schema_cache: DashMap::new(),
            eq_index,
            vector_store,
        })
    }

    pub fn init(&self) -> Result<()> {
        info!(
            "RecordManager initialized: data_dir={}, kv_engine={}, kv_root={}",
            self.data_dir.display(),
            self.config.kv_engine_name(),
            self.config.table_kv_root().display()
        );
        if self.vector_store.is_some() {
            info!(
                "Vector engine: qdrant-edge embedded at {}",
                self.config.vector_store_dir.display()
            );
        } else {
            warn!("Vector store unavailable — set CSM_VECTOR_DIR and restart");
        }
        if !self.config.vector_records_enabled {
            info!("Record vector indexing disabled (CSM_VECTOR_RECORDS_ENABLED=false)");
        }
        if let Ok(engine) = std::env::var("CSM_KV_ENGINE") {
            let e = engine.trim().to_ascii_lowercase();
            if e == "rocksdb" || e == "rocks" {
                warn!("CSM_KV_ENGINE={engine} ignored — Rust uses Pebble only");
            }
        }
        info!(
            "Eq-index backend={} root={}",
            self.eq_index.mode_label(),
            self.config.eq_index_root.display()
        );
        self.warm_auth_eq_index();
        Ok(())
    }

    pub fn shutdown_all(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        self.db_map.clear();
        self.eq_index.close();
        info!("All KV connections closed");
    }

    fn sanitize_segment(segment: &str, label: &str) -> Result<String> {
        sanitize_kv_segment(segment, label)
    }

    pub fn get_db(&self, app_id: &str, table_name: &str) -> Result<Arc<DbHandle>> {
        if self.shutdown.load(Ordering::SeqCst) {
            return Err(anyhow!("Server shutting down, cannot open KV store"));
        }

        let safe_app = Self::sanitize_segment(app_id, "app_id")?;
        let safe_table = Self::sanitize_segment(table_name, "table_name")?;

        open_table_db(
            self.config.table_kv_root(),
            &safe_app,
            &safe_table,
            &self.db_map,
            &self.db_locks,
        )
    }

    pub fn csm_encrypt(&self, plain: &str) -> String {
        let b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            plain.as_bytes(),
        );
        strtr(&b64, &(PHONE.to_string() + WRITEBY), &(WRITEBY.to_string() + PHONE))
    }

    pub fn csm_decrypt(&self, encoded: &str) -> Result<String> {
        let swapped = strtr(encoded, &(WRITEBY.to_string() + PHONE), &(PHONE.to_string() + WRITEBY));
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, swapped)?;
        Ok(String::from_utf8(bytes)?)
    }

    pub fn create_record(
        &self,
        app_id: &str,
        table_name: &str,
        mut record: Map<String, Value>,
        custom_pk: Option<Vec<String>>,
    ) -> Result<String> {
        let db = self.get_db(app_id, table_name)?;
        let primary_keys = if let Some(pk) = custom_pk {
            pk
        } else if table_name.eq_ignore_ascii_case("index") {
            vec!["id".into()]
        } else {
            self.get_table_search_keys(app_id, table_name, "fieldsPK")?
        };

        if primary_keys.is_empty() {
            // Java fallback: if no fieldsPK schema, use "id" field as default PK.
            // Only generate UUID key when record truly has no id (pure create, never update).
            if let Some(id_val) = record.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                let base = url_encode_key(id_val);
                let candidates = storage_key_candidates(app_id, table_name, &base);
                let found = candidates.iter().find(|c| db.get(c.as_bytes()).ok().flatten().is_some());
                let actual_key = found.cloned().unwrap_or_else(|| base.clone());
                let cmd = if found.is_some() { "update" } else { "create" };
                let json = serde_json::to_vec(&record)?;
                let mut batch = TableBatch::default();
                batch.put(actual_key.as_bytes(), &json);
                if cmd == "create" {
                    self.increment_meta_count(&db, &mut batch, 1)?;
                }
                db.write_batch(&batch)?;
                if self.config.uses_eq_index() {
                    self.eq_index.upsert(app_id, table_name, &actual_key, &record);
                }
                self.upsert_vector_index(
                    app_id,
                    table_name,
                    &pebble_key(app_id, table_name, &actual_key),
                    &actual_key,
                    &record,
                );
                return Ok(cmd.to_string());
            }
            // Truly no id — UUID fallback (matches Java createRecordWithUUID)
            let key = format!("{table_name}_{}", Uuid::new_v4());
            let json = serde_json::to_vec(&record)?;
            let mut batch = TableBatch::default();
            batch.put(key.as_bytes(), &json);
            self.increment_meta_count(&db, &mut batch, 1)?;
            db.write_batch(&batch)?;
            if self.config.uses_eq_index() {
                let mut map = Map::new();
                map.insert("id".into(), Value::String(key.clone()));
                self.eq_index.upsert(app_id, table_name, &key, &map);
            }
            return Ok("create".into());
        }

        if !table_name.eq_ignore_ascii_case("index") {
            if record.get("id").map(|v| v.as_str().unwrap_or("").is_empty()).unwrap_or(true) {
                record.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
            }
        }

        let key_base = self.build_primary_key(app_id, table_name, &record, &primary_keys)?;

        // Find which key format already holds this record.
        // Java stores records as "app_table_pkvalue"; Rust uses bare "pkvalue".
        // Checking all candidate variants prevents creating duplicate records when
        // updating Java-migrated data, which would cause stale data on reload.
        let candidates = storage_key_candidates(app_id, table_name, &key_base);
        let found_key = candidates.iter().find(|c| {
            db.get(c.as_bytes()).ok().flatten().is_some()
        });
        let actual_key = found_key.cloned().unwrap_or_else(|| key_base.clone());
        let command = if found_key.is_some() { "update" } else { "create" };

        let json = serde_json::to_vec(&record)?;
        if json.len() > MAX_SAFE_JSON_RECORD_BYTES {
            return Err(anyhow!("Record exceeds max safe size"));
        }

        let mut batch = TableBatch::default();
        batch.put(actual_key.as_bytes(), &json);
        if command == "create" {
            self.increment_meta_count(&db, &mut batch, 1)?;
        }
        db.write_batch(&batch)?;
        if self.config.uses_eq_index() {
            self.eq_index.upsert(app_id, table_name, &actual_key, &record);
        }
        self.upsert_vector_index(
            app_id,
            table_name,
            &pebble_key(app_id, table_name, &actual_key),
            &actual_key,
            &record,
        );

        if table_name.eq_ignore_ascii_case("index") {
            if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
                let prefix = format!("{app_id}_{id}_");
                self.table_schema_cache.retain(|k, _| !k.starts_with(&prefix));
            }
        }

        Ok(command.to_string())
    }

    pub fn delete_record(&self, app_id: &str, table_name: &str, record: &Map<String, Value>) -> Result<()> {
        let db = self.get_db(app_id, table_name)?;
        let primary_keys = if table_name.eq_ignore_ascii_case("index") {
            vec!["id".into()]
        } else {
            self.get_table_search_keys(app_id, table_name, "fieldsPK")?
        };
        let key_base = self.build_primary_key(app_id, table_name, record, &primary_keys)?;

        // Find the actual key (Java may have stored with app_table_ prefix)
        let candidates = storage_key_candidates(app_id, table_name, &key_base);
        let actual_key = candidates.iter()
            .find(|c| db.get(c.as_bytes()).ok().flatten().is_some())
            .cloned()
            .unwrap_or_else(|| key_base.clone());

        let mut batch = TableBatch::default();
        batch.delete(actual_key.as_bytes());
        self.increment_meta_count(&db, &mut batch, -1)?;
        db.write_batch(&batch)?;
        if self.config.uses_eq_index() {
            self.eq_index.delete_storage_key(app_id, table_name, &actual_key);
        }
        self.delete_search_index(&pebble_key(app_id, table_name, &actual_key));
        Ok(())
    }

    pub fn find(&self, app_id: &str, table_name: &str, filter: &SearchFilter) -> Map<String, Value> {
        match self.get_db(app_id, table_name) {
            Err(e) => { warn!("KV open failed for {app_id}/{table_name}: {e:#}"); Map::new() }
            Ok(db) => {
                if let Some(record) = self.try_find_by_pk_variants(&db, app_id, table_name, filter) {
                    return record;
                }
                if let Some(record) = self.try_find_direct_eq(&db, app_id, table_name, filter) {
                    return record;
                }
                if let Some(record) = self.try_find_by_auth_field_eq(&db, app_id, table_name, filter) {
                    return record;
                }
                if let Some(record) = self.try_find_via_eq_index(&db, app_id, table_name, filter) {
                    return record;
                }
                if let Some(record) = self.try_find_by_token_field_eq(&db, app_id, table_name, filter) {
                    return record;
                }
                if is_strict_no_scan_find_filter(filter) {
                    return Map::new();
                }
                if let Some(record) = self.try_find_by_scan(&db, filter, is_simple_eq_filter(filter)) {
                    return record;
                }
                Map::new()
            }
        }
    }

    pub fn filter(
        &self,
        app_id: &str,
        table_name: &str,
        search_filter: &SearchFilter,
    ) -> Map<String, Value> {
        let records = self.collect_filtered_records(app_id, table_name, search_filter);
        let total_count = records.len();
        let slice: Vec<Value> = records.into_iter().map(Value::Object).collect();
        let mut result = Map::new();
        result.insert("rows".into(), Value::Array(slice.clone()));
        result.insert("data".into(), Value::Array(slice));
        result.insert("totalCount".into(), json!(total_count));
        result
    }

    fn collect_filtered_records(
        &self,
        app_id: &str,
        table_name: &str,
        search_filter: &SearchFilter,
    ) -> Vec<Map<String, Value>> {
        if self.should_use_eq_index_list_fast_path(app_id, table_name, search_filter) {
            let records = self.collect_via_eq_index(app_id, table_name, search_filter);
            if !records.is_empty() {
                let mut sorted = records;
                sorted.sort_by(|a, b| compare_records_desc(a, b));
                return sorted;
            }
        }

        let mut records: Vec<Map<String, Value>> = Vec::new();
        let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        match self.get_db(app_id, table_name) {
            Err(e) => warn!("RocksDB open failed for {app_id}/{table_name}: {e:#}"),
            Ok(db) => {
                let _ = db.for_each_entry(|key, value| {
                    let key_str = String::from_utf8_lossy(key);
                    if key_str.starts_with("__meta_") {
                        return Ok(());
                    }
                    if let Ok(Value::Object(record)) = serde_json::from_slice::<Value>(value) {
                        if SearchFilter::matches(&record, search_filter) {
                            let dedup = record
                                .get("id")
                                .and_then(|v| v.as_str())
                                .map(String::from)
                                .or_else(|| {
                                    record
                                        .get("id")
                                        .and_then(|v| v.as_i64())
                                        .map(|n| n.to_string())
                                })
                                .unwrap_or_else(|| key_str.to_string());
                            if seen_ids.insert(dedup) {
                                records.push(record);
                            }
                        }
                    }
                    Ok(())
                });
            }
        }

        records.sort_by(|a, b| compare_records_desc(a, b));
        records
    }

    pub fn filter_with_pagination(
        &self,
        app_id: &str,
        table_name: &str,
        search_filter: &SearchFilter,
        cursor: Option<&str>,
        offset: Option<usize>,
        take: usize,
    ) -> Map<String, Value> {
        let take = take.min(MAX_FILTER_TAKE);

        if is_unfiltered_list_query(search_filter) && self.config.uses_eq_index() {
            if let Ok(db) = self.get_db(app_id, table_name) {
                let start = offset.unwrap_or(0);
                let (keys, total) =
                    self.eq_index
                        .list_table_storage_keys(app_id, table_name, start, take);
                if total > 0 {
                    let records = self.load_records_by_storage_keys(&db, &keys, search_filter);
                    let slice: Vec<Value> = records.into_iter().map(Value::Object).collect();
                    let mut result = Map::new();
                    result.insert("rows".into(), Value::Array(slice.clone()));
                    result.insert("data".into(), Value::Array(slice));
                    result.insert("totalCount".into(), json!(total));
                    return result;
                }
            }
        }

        let records = self.collect_filtered_records(app_id, table_name, search_filter);
        let total_count = records.len();

        // cursor semantics match Java filterWithPagination:
        // cursor = first key of NEXT page → startIndex = indexOf(cursor), no +1
        let start = if let Some(c) = cursor {
            records
                .iter()
                .position(|r| record_key(r).as_deref() == Some(c))
                .unwrap_or(0)
        } else {
            offset.unwrap_or(0)
        };

        let end = (start + take).min(total_count);

        // nextCursor = first key of the page after this one (Java convention)
        let next_cursor: Option<String> = if end < total_count {
            records.get(end).and_then(|r| record_key(r))
        } else {
            None
        };

        let slice: Vec<Value> = records
            .into_iter()
            .skip(start)
            .take(take)
            .map(Value::Object)
            .collect();

        let mut result = Map::new();
        // "rows" is the primary key (matches Java); "data" kept as alias for internal callers
        result.insert("rows".into(), Value::Array(slice.clone()));
        result.insert("data".into(), Value::Array(slice));
        result.insert("totalCount".into(), json!(total_count));
        if let Some(nc) = next_cursor {
            result.insert("nextCursor".into(), Value::String(nc));
        }
        result
    }

    pub fn full_scan(&self, app_id: &str, table_name: &str) -> Map<String, Value> {
        let mut records = Vec::new();
        match self.get_db(app_id, table_name) {
            Err(e) => warn!("RocksDB open failed for {app_id}/{table_name}: {e:#}"),
            Ok(db) => {
                let _ = db.for_each_entry(|key, value| {
                    let key_str = String::from_utf8_lossy(key);
                    if key_str.starts_with("__meta_") {
                        return Ok(());
                    }
                    if let Ok(Value::Object(record)) = serde_json::from_slice::<Value>(value) {
                        records.push(Value::Object(record));
                    }
                    Ok(())
                });
            }
        }
        let mut result = Map::new();
        result.insert("data".into(), Value::Array(records));
        result
    }

    pub fn create_table(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
        let table_name = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        match self.get_db(app_id, table_name) {
            Ok(_) => {
                let mut r = Map::new();
                r.insert("success".into(), Value::Bool(true));
                r.insert("message".into(), Value::String(format!("Table {table_name} ready")));
                r
            }
            Err(e) => {
                let mut r = Map::new();
                r.insert("success".into(), Value::Bool(false));
                r.insert("message".into(), Value::String(e.to_string()));
                r
            }
        }
    }

    pub fn drop_table(&self, params: &Map<String, Value>) -> Map<String, Value> {
        let app_id = params.get("app_id").and_then(|v| v.as_str()).unwrap_or("default");
        let table_name = params.get("obj_name").and_then(|v| v.as_str()).unwrap_or("");
        let db_key = format!(
            "{}_{}",
            Self::sanitize_segment(app_id, "app_id").unwrap_or_default(),
            Self::sanitize_segment(table_name, "table_name").unwrap_or_default()
        );
        self.db_map.remove(&db_key);
        let path = self.config.table_kv_root().join(app_id).join(table_name);
        let mut r = Map::new();
        if path.exists() {
            if let Err(e) = std::fs::remove_dir_all(&path) {
                r.insert("success".into(), Value::Bool(false));
                r.insert("message".into(), Value::String(e.to_string()));
            } else {
                r.insert("success".into(), Value::Bool(true));
                r.insert("message".into(), Value::String(format!("Dropped {table_name}")));
            }
        } else {
            r.insert("success".into(), Value::Bool(true));
            r.insert("message".into(), Value::String("Table not found".into()));
        }
        r
    }

    pub fn backup_db(&self, app_id: &str, table_name: &str) -> Result<()> {
        let src = self.config.table_kv_root().join(app_id).join(table_name);
        let dst = self
            .config
            .kv_backup_dir
            .join(app_id)
            .join(format!("{table_name}_{}", chrono::Utc::now().timestamp()));
        copy_dir_recursive(&src, &dst)?;
        info!("Backed up {app_id}/{table_name} to {}", dst.display());
        Ok(())
    }

    pub fn restore_db(&self, app_id: &str, table_name: &str) -> Result<()> {
        let backup_dir = self.config.kv_backup_dir.join(app_id);
        if !backup_dir.exists() {
            return Err(anyhow!("No backups for {app_id}"));
        }
        let latest = std::fs::read_dir(&backup_dir)?
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(table_name))
            .max_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()));
        let Some(latest) = latest else {
            return Err(anyhow!("No backup found for {table_name}"));
        };
        let dst = self.config.table_kv_root().join(app_id).join(table_name);
        if dst.exists() {
            std::fs::remove_dir_all(&dst)?;
        }
        copy_dir_recursive(&latest.path(), &dst)?;
        let db_key = format!("{app_id}_{table_name}");
        self.db_map.remove(&db_key);
        Ok(())
    }

    pub fn migrate_keys(&self, app_id: &str, table_name: &str) -> Result<()> {
        info!("migrateKeys no-op for Pebble engine ({app_id}/{table_name})");
        let _ = (app_id, table_name);
        Ok(())
    }

    pub fn get_table_search_keys(
        &self,
        app_id: &str,
        table_name: &str,
        field_type: &str,
    ) -> Result<Vec<String>> {
        let cache_key = format!("{app_id}_{table_name}_{field_type}");
        if let Some(cached) = self.table_schema_cache.get(&cache_key) {
            return Ok(cached.clone());
        }

        // Direct RocksDB read — must NOT call find() on "index" (causes infinite recursion via try_find_by_pk).
        let meta = self.get_index_schema_entry(app_id, table_name)?;
        if meta.is_empty() {
            return Ok(vec![]);
        }

        let fields_value = meta
            .get("struct")
            .and_then(|v| v.get(field_type))
            .or_else(|| meta.get(field_type));

        if let Some(Value::Array(fields)) = fields_value {
            let keys: Vec<String> = fields
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
            self.table_schema_cache.insert(cache_key, keys.clone());
            return Ok(keys);
        }
        Ok(vec![])
    }

    /// Read schema row from `index` table by entry id without going through `find()`.
    /// Java's generateKey stores index records at url_encode(id) — the bare canonical key.
    /// We must try all storage_key_candidates to find whichever format Java used.
    fn get_index_schema_entry(&self, app_id: &str, entry_id: &str) -> Result<Map<String, Value>> {
        let db = self.get_db(app_id, "index")?;
        let base = url_encode_key(entry_id);
        // Java stores at bare key (e.g. "csm_accounts"); legacy may use "index_..." or "app_index_..."
        for key in storage_key_candidates(app_id, "index", &base) {
            if let Some(bytes) = db.get(key.as_bytes())? {
                if bytes.len() <= MAX_SAFE_FIND_RECORD_BYTES {
                    if let Ok(Value::Object(obj)) = serde_json::from_slice(&bytes) {
                        return Ok(obj);
                    }
                }
            }
        }
        Ok(Map::new())
    }

    pub fn batch_update_records(
        &self,
        app_id: &str,
        table_name: &str,
        records: Vec<Map<String, Value>>,
    ) -> Result<usize, String> {
        let mut ok = 0usize;
        for record in records {
            if self.create_record(app_id, table_name, record, None).is_ok() {
                ok += 1;
            }
        }
        Ok(ok)
    }

    pub fn index_existing_records(&self, app_id: &str, table_name: &str) -> Result<usize, String> {
        use crate::data::search_index::SearchIndex;
        let scan = self.full_scan(app_id, table_name);
        let rows = scan
            .get("data")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let index_path = self.config.lucene_index_root.join(format!("{app_id}_{table_name}"));
        let mut pairs = Vec::new();
        for row in &rows {
            if let Some(obj) = row.as_object() {
                let id = obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let body = serde_json::to_string(obj).unwrap_or_default();
                pairs.push((id, body));
            }
        }
        SearchIndex::rebuild_from_records(index_path, &pairs).map_err(|e| e.to_string())?;
        self.delete_search_index_for_table(app_id, table_name);
        let mut vector_indexed = 0usize;
        for row in &rows {
            if let Some(obj) = row.as_object() {
                let storage_key = obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let pk = pebble_key(app_id, table_name, &storage_key);
                self.upsert_vector_index(app_id, table_name, &pk, &storage_key, obj);
                if self.config.uses_eq_index() {
                    self.eq_index.upsert(app_id, table_name, &storage_key, obj);
                }
                vector_indexed += 1;
            }
        }
        info!(
            "search reindex {app_id}/{table_name}: tantivy={} vector={vector_indexed}",
            pairs.len()
        );
        Ok(pairs.len())
    }

    pub fn exists_by_primary_key(
        &self,
        app_id: &str,
        table_name: &str,
        record: &Map<String, Value>,
        pk_fields: &[String],
    ) -> bool {
        self.build_primary_key(app_id, table_name, record, pk_fields)
            .ok()
            .and_then(|key| {
                self.get_db(app_id, table_name)
                    .ok()
                    .map(|db| db.get(key.as_bytes()).ok().flatten().is_some())
            })
            .unwrap_or(false)
    }

    pub fn count_actual_records(&self, app_id: &str, table_name: &str) -> u64 {
        if let Ok(db) = self.get_db(app_id, table_name) {
            let mut count = 0u64;
            let _ = db.for_each_entry(|key, _value| {
                let key_str = String::from_utf8_lossy(key);
                if !key_str.starts_with("__meta_") {
                    count += 1;
                }
                Ok(())
            });
            return count;
        }
        0
    }

    pub fn search_keys(
        &self,
        app_id: &str,
        table_name: &str,
        query: &str,
        limit: usize,
    ) -> Vec<String> {
        use crate::data::search_index::SearchIndex;
        let index_path = self.config.lucene_index_root.join(format!("{app_id}_{table_name}"));
        if let Ok(idx) = SearchIndex::open_or_create(index_path) {
            if let Ok(ids) = idx.search(query, limit) {
                if !ids.is_empty() {
                    return ids;
                }
            }
        }
        let filter = SearchFilter::default();
        let page = self.filter_with_pagination(app_id, table_name, &filter, None, None, limit);
        page.get("data")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|r| r.get("id").and_then(|v| v.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn delete_database(&self, app_id: &str, table_name: &str) -> Result<()> {
        if let Ok(db) = self.get_db(app_id, table_name) {
            let mut batch = TableBatch::default();
            let _ = db.for_each_entry(|key, _value| {
                batch.delete(key);
                Ok(())
            });
            db.write_batch(&batch)?;
        }
        let index_path = self.config.lucene_index_root.join(format!("{app_id}_{table_name}"));
        if index_path.exists() {
            let _ = std::fs::remove_dir_all(&index_path);
        }
        Ok(())
    }

    pub fn get_static_file(&self, relative_path: &str) -> Option<PathBuf> {
        // Java: basePath = DIR_PATH + "/public/" — all static files live under {data_dir}/public/
        let path = self.data_dir.join("public").join(relative_path.trim_start_matches('/'));
        if path.exists() && path.is_file() {
            Some(path)
        } else {
            None
        }
    }

    /// Read a record using an explicit PK field list (mirrors Java createRecord custom PK).
    pub fn find_by_custom_pk(
        &self,
        app_id: &str,
        table_name: &str,
        record: &Map<String, Value>,
        pk_fields: &[&str],
    ) -> Map<String, Value> {
        let pk_vec: Vec<String> = pk_fields.iter().map(|s| (*s).to_string()).collect();
        let key_base = match self.build_primary_key(app_id, table_name, record, &pk_vec) {
            Ok(k) => k,
            Err(_) => return Map::new(),
        };
        let db = match self.get_db(app_id, table_name) {
            Ok(db) => db,
            Err(_) => return Map::new(),
        };
        for candidate in storage_key_candidates(app_id, table_name, &key_base) {
            if let Ok(Some(bytes)) = db.get(candidate.as_bytes()) {
                if bytes.len() <= MAX_SAFE_FIND_RECORD_BYTES {
                    if let Ok(Value::Object(obj)) = serde_json::from_slice(&bytes) {
                        return obj;
                    }
                }
            }
        }
        Map::new()
    }

    /// Read the existing record by its primary-key values — direct RocksDB lookup.
    /// Used by TableHandler to merge incoming obj_update on top of the stored record
    /// (mirrors Java: existingRow = recordManager.findRecord(); newRow.putAll(objUpdate)).
    pub fn find_existing_by_pk_values(
        &self,
        app_id: &str,
        table_name: &str,
        record: &Map<String, Value>,
    ) -> Map<String, Value> {
        let pk_fields = match self.get_table_search_keys(app_id, table_name, "fieldsPK") {
            Ok(f) if !f.is_empty() => f,
            // Schema absent or empty fieldsPK — fall back to "id" (Java default)
            _ => vec!["id".to_string()],
        };
        let key_base = match self.build_primary_key(app_id, table_name, record, &pk_fields) {
            Ok(k) => k,
            Err(_) => return Map::new(),
        };
        let db = match self.get_db(app_id, table_name) {
            Ok(db) => db,
            Err(_) => return Map::new(),
        };
        for candidate in storage_key_candidates(app_id, table_name, &key_base) {
            if let Ok(Some(bytes)) = db.get(candidate.as_bytes()) {
                if bytes.len() <= MAX_SAFE_FIND_RECORD_BYTES {
                    if let Ok(Value::Object(obj)) = serde_json::from_slice(&bytes) {
                        return obj;
                    }
                }
            }
        }
        Map::new()
    }

    fn build_primary_key(
        &self,
        _app_id: &str,
        _table_name: &str,
        record: &Map<String, Value>,
        pk_fields: &[String],
    ) -> Result<String> {
        if pk_fields.iter().all(|f| {
            record
                .get(f)
                .map(value_to_string)
                .unwrap_or_default()
                .is_empty()
        }) {
            return Err(anyhow!("Cannot build primary key — all PK fields empty"));
        }
        Ok(generate_key_suffix(record, pk_fields))
    }

    fn try_find_by_pk_variants(
        &self,
        db: &DbHandle,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        let mut eq_map = Map::new();
        extract_equality_conditions(filter, &mut eq_map);
        if eq_map.is_empty() {
            return None;
        }

        if table_name.eq_ignore_ascii_case("index") {
            let id = eq_map.get("id").map(value_to_string).unwrap_or_default();
            if id.is_empty() {
                return None;
            }
            let base = url_encode_key(&id);
            for key in storage_key_candidates(app_id, table_name, &base) {
                if let Some(record) = self.load_record_by_key(db, &key, filter) {
                    return Some(record);
                }
            }
            return None;
        }

        let pk_fields = self.get_table_search_keys(app_id, table_name, "fieldsPK").ok()?;
        if pk_fields.is_empty() {
            return None;
        }

        let present_fields: Vec<String> = pk_fields
            .iter()
            .filter(|f| {
                eq_map
                    .get(*f)
                    .map(value_to_string)
                    .is_some_and(|v| !v.is_empty())
            })
            .cloned()
            .collect();
        if present_fields.is_empty() {
            return None;
        }

        let mut filled = eq_map.clone();
        for pk in &pk_fields {
            filled.entry(pk.clone()).or_insert(Value::String(String::new()));
        }

        let mut bases = vec![generate_key_suffix(&filled, &pk_fields)];
        let present_only = generate_key_suffix(&eq_map, &present_fields);
        if present_only != bases[0] {
            bases.push(present_only);
        }

        for base in bases {
            for key in storage_key_candidates(app_id, table_name, &base) {
                if let Some(record) = self.load_record_by_key(db, &key, filter) {
                    return Some(record);
                }
            }
        }
        None
    }

    fn try_find_direct_eq(
        &self,
        db: &DbHandle,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        let mut eq_map = Map::new();
        extract_equality_conditions(filter, &mut eq_map);
        if eq_map.len() != 1 {
            return None;
        }
        let (field, value) = eq_map.iter().next()?;
        let supported = matches!(
            field.to_ascii_lowercase().as_str(),
            "id" | "app_token" | "refresh" | "refresh_token"
        );
        if !supported {
            return None;
        }
        let value = value_to_string(value).trim().to_string();
        if value.is_empty() {
            return None;
        }
        let base = url_encode_key(&value);
        for key in storage_key_candidates(app_id, table_name, &base) {
            if let Some(record) = self.load_record_by_key(db, &key, filter) {
                return Some(record);
            }
        }
        None
    }

    /// Mirrors Go `tryFindByAuthFieldEq` — email/username/phone/login_identifier lookup when KV key is `id`.
    fn try_find_by_auth_field_eq(
        &self,
        db: &DbHandle,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        let mut eq_map = Map::new();
        extract_equality_conditions(filter, &mut eq_map);
        if eq_map.len() != 1 {
            return None;
        }
        let (field, value) = eq_map.iter().next()?;
        if !is_auth_lookup_field(field) {
            return None;
        }
        let value = value_to_string(value).trim().to_string();
        if value.is_empty() {
            return None;
        }

        let base = url_encode_key(&value);
        for key in storage_key_candidates(app_id, table_name, &base) {
            if let Some(record) = self.load_record_by_key(db, &key, filter) {
                return Some(record);
            }
        }

        if let Some(record) = self.try_find_via_eq_index(db, app_id, table_name, filter) {
            return Some(record);
        }

        self.try_find_by_scan(db, filter, false)
    }

    fn try_find_by_token_field_eq(
        &self,
        db: &DbHandle,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        if !is_auth_token_table(table_name) {
            return None;
        }
        let mut eq_map = Map::new();
        extract_equality_conditions(filter, &mut eq_map);
        if eq_map.len() != 1 {
            return None;
        }
        let field = eq_map.keys().next()?.to_ascii_lowercase();
        if !matches!(field.as_str(), "app_token" | "refresh_token" | "refresh") {
            return None;
        }
        self.try_find_via_eq_index(db, app_id, table_name, filter)
    }

    fn try_find_via_eq_index(
        &self,
        db: &DbHandle,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        if !self.config.uses_eq_index() {
            return None;
        }
        let records = self.collect_via_eq_index_with_db(db, app_id, table_name, filter);
        records.into_iter().next()
    }

    fn collect_via_eq_index(
        &self,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Vec<Map<String, Value>> {
        let Ok(db) = self.get_db(app_id, table_name) else {
            return Vec::new();
        };
        self.collect_via_eq_index_with_db(&db, app_id, table_name, filter)
    }

    fn collect_via_eq_index_with_db(
        &self,
        db: &DbHandle,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Vec<Map<String, Value>> {
        let keys = self.search_keys_consistent(app_id, table_name, filter);
        if keys.is_empty() {
            return Vec::new();
        }
        self.load_records_by_storage_keys(db, &keys, filter)
    }

    fn search_keys_consistent(
        &self,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> Vec<String> {
        if !self.config.uses_eq_index() || has_like_filter(filter) {
            return Vec::new();
        }
        let mut eq_map = Map::new();
        extract_equality_conditions(filter, &mut eq_map);
        if eq_map.is_empty() {
            return Vec::new();
        }

        let mut keys: Option<Vec<String>> = None;
        for (field, value) in &eq_map {
            let norm = value_to_string(value).trim().to_string();
            if norm.is_empty() {
                return Vec::new();
            }
            let batch = self.eq_index.keys_for_eq(app_id, table_name, field, &norm);
            if batch.is_empty() {
                return Vec::new();
            }
            keys = Some(match keys {
                None => batch,
                Some(prev) => intersect_string_slices(&prev, &batch),
            });
            if keys.as_ref().is_some_and(|k| k.is_empty()) {
                return Vec::new();
            }
        }
        keys.unwrap_or_default()
    }

    fn load_records_by_storage_keys(
        &self,
        db: &DbHandle,
        keys: &[String],
        filter: &SearchFilter,
    ) -> Vec<Map<String, Value>> {
        let mut seen = std::collections::HashSet::new();
        let mut records = Vec::with_capacity(keys.len());
        for key in keys {
            if let Some(record) = self.load_record_by_key(db, key, filter) {
                let dedup = record_key(&record).unwrap_or_else(|| key.clone());
                if seen.insert(dedup) {
                    records.push(record);
                }
            }
        }
        records
    }

    fn should_use_eq_index_list_fast_path(
        &self,
        app_id: &str,
        table_name: &str,
        filter: &SearchFilter,
    ) -> bool {
        if !self.config.uses_eq_index() || has_like_filter(filter) {
            return false;
        }
        let mut eq_map = Map::new();
        extract_equality_conditions(filter, &mut eq_map);
        if eq_map.is_empty() {
            return false;
        }
        if !table_name.eq_ignore_ascii_case("sys_autos") {
            return true;
        }
        let Ok(pk_fields) = self.get_table_search_keys(app_id, table_name, "fieldsPK") else {
            return false;
        };
        if pk_fields.is_empty() {
            return true;
        }
        pk_fields.iter().all(|pk| eq_map.contains_key(pk))
    }

    fn try_find_by_scan(
        &self,
        db: &DbHandle,
        filter: &SearchFilter,
        unlimited: bool,
    ) -> Option<Map<String, Value>> {
        let mut scanned = 0usize;
        let mut found: Option<Map<String, Value>> = None;
        let _ = db.for_each_entry(|key, value| {
            if found.is_some() {
                return Ok(());
            }
            if !unlimited && scanned >= MAX_FIND_SCAN_RECORDS {
                return Ok(());
            }
            let key_str = String::from_utf8_lossy(key);
            if key_str.starts_with("__meta_") {
                scanned += 1;
                return Ok(());
            }
            if value.len() > MAX_SAFE_FIND_RECORD_BYTES {
                scanned += 1;
                return Ok(());
            }
            if let Ok(Value::Object(record)) = serde_json::from_slice::<Value>(value) {
                if SearchFilter::matches(&record, filter) {
                    found = Some(record);
                    return Ok(());
                }
            }
            scanned += 1;
            Ok(())
        });
        found
    }


    fn load_record_by_key(
        &self,
        db: &DbHandle,
        key: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        let value = db.get(key.as_bytes()).ok()??;
        if value.len() > MAX_SAFE_FIND_RECORD_BYTES {
            return None;
        }
        let record: Map<String, Value> = serde_json::from_slice(&value).ok()?;
        if SearchFilter::matches(&record, filter) {
            Some(record)
        } else {
            None
        }
    }

    fn increment_meta_count(&self, db: &DbHandle, batch: &mut TableBatch, delta: i64) -> Result<()> {
        let key = b"__meta_count";
        let current: i64 = db
            .get(key)?
            .and_then(|b| String::from_utf8(b).ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let next = (current + delta).max(0);
        batch.put(key, next.to_string().as_bytes());
        Ok(())
    }
}

fn is_simple_eq_filter(filter: &SearchFilter) -> bool {
    filter.conditions.is_empty()
        && (filter.filter_type.eq_ignore_ascii_case("eq")
            || filter.filter_type.eq_ignore_ascii_case("eqIgnoreCase"))
        && !filter.field.is_empty()
}

fn is_strict_no_scan_find_filter(filter: &SearchFilter) -> bool {
    let mut eq_map = Map::new();
    extract_equality_conditions(filter, &mut eq_map);
    if eq_map.len() != 1 {
        return false;
    }
    matches!(
        eq_map.keys().next().unwrap().to_ascii_lowercase().as_str(),
        "refresh_token" | "refresh" | "app_token"
    )
}

fn is_auth_lookup_field(field: &str) -> bool {
    matches!(
        field.trim().to_ascii_lowercase().as_str(),
        "email" | "username" | "phonenumber" | "phone" | "login_identifier"
    )
}

fn is_auth_token_table(table_name: &str) -> bool {
    matches!(
        table_name.trim().to_ascii_lowercase().as_str(),
        "csm_accounts" | "csm_group_members"
    )
}

fn is_unfiltered_list_query(filter: &SearchFilter) -> bool {
    filter.conditions.is_empty() && filter.field.is_empty() && filter.filter_type.is_empty()
}

fn has_like_filter(filter: &SearchFilter) -> bool {
    if filter.filter_type.eq_ignore_ascii_case("like") {
        return true;
    }
    filter.conditions.iter().any(has_like_filter)
}

fn intersect_string_slices(a: &[String], b: &[String]) -> Vec<String> {
    if a.is_empty() || b.is_empty() {
        return Vec::new();
    }
    let set: std::collections::HashSet<&str> = a.iter().map(String::as_str).collect();
    b.iter()
        .filter(|s| set.contains(s.as_str()))
        .cloned()
        .collect()
}

fn extract_equality_conditions(filter: &SearchFilter, out: &mut Map<String, Value>) {
    if !filter.conditions.is_empty() {
        for sub in &filter.conditions {
            extract_equality_conditions(sub, out);
        }
        return;
    }
    if (filter.filter_type.eq_ignore_ascii_case("eq")
        || filter.filter_type.eq_ignore_ascii_case("eqIgnoreCase"))
        && !filter.field.is_empty()
    {
        out.insert(filter.field.clone(), filter.value.clone());
    }
}

fn url_encode_key(input: &str) -> String {
    urlencoding::encode(input).into_owned()
}

fn generate_key_suffix(record: &Map<String, Value>, pk_fields: &[String]) -> String {
    pk_fields
        .iter()
        .map(|f| {
            let raw = record.get(f).map(value_to_string).unwrap_or_default();
            url_encode_key(&raw)
        })
        .collect::<Vec<_>>()
        .join(":")
}
fn strtr(input: &str, from: &str, to: &str) -> String {
    let mut result = String::with_capacity(input.len());
    for ch in input.chars() {
        if let Some(pos) = from.find(ch) {
            if let Some(repl) = to.chars().nth(pos) {
                result.push(repl);
                continue;
            }
        }
        result.push(ch);
    }
    result
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => v.to_string(),
    }
}

fn record_key(record: &Map<String, Value>) -> Option<String> {
    record.get("id").and_then(|v| v.as_str()).map(String::from)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}
