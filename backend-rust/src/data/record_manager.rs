use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use dashmap::DashMap;
use parking_lot::Mutex;
use rocksdb::{BlockBasedOptions, DBCompressionType, Options, WriteBatch, DB};
use serde_json::{json, Map, Value};
use tracing::info;
use uuid::Uuid;

use crate::config::{ensure_dir, AppConfig};
use crate::model::SearchFilter;

pub const PHONE: &str = "0937.528.839";
pub const WRITEBY: &str = "base._co.osa";

const BATCH_SIZE: usize = 50;
const MAX_FILTER_TAKE: usize = 1000;
const DEFAULT_FILTER_TAKE: usize = 500;
const MAX_FIND_SCAN_RECORDS: usize = 2000;
const MAX_SAFE_FIND_RECORD_BYTES: usize = 4 * 1024 * 1024;
const MAX_SAFE_JSON_RECORD_BYTES: usize = 32 * 1024 * 1024;

struct DbHandle {
    db: DB,
}

pub struct RecordManager {
    config: AppConfig,
    data_dir: PathBuf,
    db_map: DashMap<String, Arc<DbHandle>>,
    db_locks: DashMap<String, Arc<Mutex<()>>>,
    shutdown: AtomicBool,
    table_schema_cache: DashMap<String, Vec<String>>,
}

impl RecordManager {
    pub fn new(config: AppConfig) -> Result<Self> {
        ensure_dir(&config.data_dir)?;
        ensure_dir(&config.rocksdb_root)?;
        ensure_dir(&config.rocksdb_backup)?;
        ensure_dir(&config.lucene_index_root)?;

        Ok(Self {
            data_dir: config.data_dir.clone(),
            config,
            db_map: DashMap::new(),
            db_locks: DashMap::new(),
            shutdown: AtomicBool::new(false),
            table_schema_cache: DashMap::new(),
        })
    }

    pub fn init(&self) -> Result<()> {
        info!("RecordManager initialized: data_dir={}", self.data_dir.display());
        self.clean_rocksdb_logs();
        Ok(())
    }

    pub fn shutdown_all(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        self.db_map.clear();
        info!("All RocksDB connections closed");
    }

    fn clean_rocksdb_logs(&self) {
        let db_root = self.config.rocksdb_root.clone();
        if !db_root.exists() {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(&db_root) {
            for app_entry in entries.flatten() {
                if let Ok(tables) = std::fs::read_dir(app_entry.path()) {
                    for table_entry in tables.flatten() {
                        self.clean_logs_in_dir(&table_entry.path());
                    }
                }
            }
        }
    }

    fn clean_logs_in_dir(&self, dir: &Path) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_log = name == "LOG" || name == "LOG.old" || name.starts_with("LOG.old.");
            let is_manifest_old =
                name.starts_with("MANIFEST-") && name.ends_with(".old") || name == "MANIFEST.old";
            let is_obsolete = name.ends_with(".old")
                && !name.ends_with(".sst.old")
                && !name.ends_with(".ldb.old");
            let is_data = name.ends_with(".sst") || name.ends_with(".ldb");
            let is_current = name == "CURRENT" || name.starts_with("MANIFEST");

            if (is_log || is_manifest_old || is_obsolete) && !is_data && !is_current {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    fn sanitize_segment(segment: &str, label: &str) -> Result<String> {
        let s = segment.trim().to_lowercase();
        if s.is_empty() {
            return Err(anyhow!("{label} cannot be empty"));
        }
        if s.contains('/')
            || s.contains('\\')
            || s.contains('\0')
            || s == "."
            || s == ".."
            || s.contains("..")
        {
            return Err(anyhow!("{label} contains invalid path characters: {segment}"));
        }
        Ok(s)
    }

    pub fn get_db(&self, app_id: &str, table_name: &str) -> Result<Arc<DbHandle>> {
        if self.shutdown.load(Ordering::SeqCst) {
            return Err(anyhow!("Server shutting down, cannot open RocksDB"));
        }

        let safe_app = Self::sanitize_segment(app_id, "app_id")?;
        let safe_table = Self::sanitize_segment(table_name, "table_name")?;
        let db_key = format!("{safe_app}_{safe_table}");

        if let Some(existing) = self.db_map.get(&db_key) {
            return Ok(existing.clone());
        }

        let lock = self
            .db_locks
            .entry(db_key.clone())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone();
        let _guard = lock.lock();

        if let Some(existing) = self.db_map.get(&db_key) {
            return Ok(existing.clone());
        }

        let db_path = self
            .config
            .rocksdb_root
            .join(&safe_app)
            .join(&safe_table);
        let db_root = self
            .config
            .rocksdb_root
            .canonicalize()
            .unwrap_or_else(|_| self.config.rocksdb_root.clone());
        // Path may not exist yet before create_dir_all — compare via normalized join
        let resolved = db_path
            .canonicalize()
            .unwrap_or_else(|_| self.config.rocksdb_root.join(&safe_app).join(&safe_table));
        if !resolved.starts_with(&db_root) {
            return Err(anyhow!("RocksDB path escapes database root"));
        }

        std::fs::create_dir_all(&db_path)?;

        let mut block_opts = BlockBasedOptions::default();
        block_opts.set_bloom_filter(10.0, false);
        block_opts.set_block_size(16 * 1024);
        block_opts.set_cache_index_and_filter_blocks(true);
        block_opts.set_pin_l0_filter_and_index_blocks_in_cache(true);

        let mut opts = Options::default();
        opts.create_if_missing(true);
        opts.set_max_open_files(2048);
        opts.set_compression_type(DBCompressionType::Lz4);
        opts.set_write_buffer_size(32 * 1024 * 1024);
        opts.set_max_write_buffer_number(2);
        opts.set_db_write_buffer_size(64 * 1024 * 1024);
        opts.set_block_based_table_factory(&block_opts);

        let db = DB::open(&opts, &db_path)
            .with_context(|| format!("Failed to open RocksDB at {}", db_path.display()))?;

        let handle = Arc::new(DbHandle { db });
        self.db_map.insert(db_key, handle.clone());
        Ok(handle)
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
            let key = format!("{table_name}_{}", Uuid::new_v4());
            let json = serde_json::to_vec(&record)?;
            db.db.put(key.as_bytes(), &json)?;
            return Ok("create".into());
        }

        if !table_name.eq_ignore_ascii_case("index") {
            if record.get("id").map(|v| v.as_str().unwrap_or("").is_empty()).unwrap_or(true) {
                record.insert("id".into(), Value::String(Uuid::new_v4().to_string()));
            }
        }

        let key = self.build_primary_key(app_id, table_name, &record, &primary_keys)?;
        let existing = db.db.get(key.as_bytes())?;
        let command = if existing.is_some() { "update" } else { "create" };

        let json = serde_json::to_vec(&record)?;
        if json.len() > MAX_SAFE_JSON_RECORD_BYTES {
            return Err(anyhow!("Record exceeds max safe size"));
        }

        let mut batch = WriteBatch::default();
        batch.put(key.as_bytes(), &json);
        if command == "create" {
            self.increment_meta_count(&db, &mut batch, 1)?;
        }
        db.db.write(batch)?;

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
        let key = self.build_primary_key(app_id, table_name, record, &primary_keys)?;
        let mut batch = WriteBatch::default();
        batch.delete(key.as_bytes());
        self.increment_meta_count(&db, &mut batch, -1)?;
        db.db.write(batch)?;
        Ok(())
    }

    pub fn find(&self, app_id: &str, table_name: &str, filter: &SearchFilter) -> Map<String, Value> {
        if let Ok(db) = self.get_db(app_id, table_name) {
            if let Some(record) = self.try_find_by_pk_variants(&db, app_id, table_name, filter) {
                return record;
            }
            if let Some(record) = self.try_find_direct_eq(&db, app_id, table_name, filter) {
                return record;
            }
            if let Some(record) = self.try_find_by_scan(&db, filter, is_simple_eq_filter(filter)) {
                return record;
            }
        }
        Map::new()
    }

    pub fn filter(
        &self,
        app_id: &str,
        table_name: &str,
        search_filter: &SearchFilter,
    ) -> Map<String, Value> {
        self.filter_with_pagination(app_id, table_name, search_filter, None, None, DEFAULT_FILTER_TAKE)
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
        let mut records: Vec<Map<String, Value>> = Vec::new();

        if let Ok(db) = self.get_db(app_id, table_name) {
            let iter = db.db.iterator(rocksdb::IteratorMode::Start);
            for item in iter {
                if records.len() >= take.saturating_mul(4) {
                    break;
                }
                if let Ok((key, value)) = item {
                    let key_str = String::from_utf8_lossy(&key);
                    if key_str.starts_with("__meta_") {
                        continue;
                    }
                    if let Ok(Value::Object(record)) = serde_json::from_slice(&value) {
                        if SearchFilter::matches(&record, search_filter) {
                            records.push(record);
                        }
                    }
                }
            }
        }

        records.sort_by(|a, b| compare_records_desc(a, b));

        let start = if let Some(c) = cursor {
            records
                .iter()
                .position(|r| record_key(r).as_deref() == Some(c))
                .map(|i| i + 1)
                .unwrap_or(0)
        } else {
            offset.unwrap_or(0)
        };

        let slice: Vec<Value> = records
            .into_iter()
            .skip(start)
            .take(take)
            .map(|r| Value::Object(r))
            .collect();

        let mut result = Map::new();
        result.insert("data".into(), Value::Array(slice));
        result.insert("total".into(), json!(start + take));
        result
    }

    pub fn full_scan(&self, app_id: &str, table_name: &str) -> Map<String, Value> {
        let mut records = Vec::new();
        if let Ok(db) = self.get_db(app_id, table_name) {
            let iter = db.db.iterator(rocksdb::IteratorMode::Start);
            for item in iter {
                if let Ok((key, value)) = item {
                    let key_str = String::from_utf8_lossy(&key);
                    if key_str.starts_with("__meta_") {
                        continue;
                    }
                    if let Ok(Value::Object(record)) = serde_json::from_slice(&value) {
                        records.push(Value::Object(record));
                    }
                }
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
        let path = self.config.rocksdb_root.join(app_id).join(table_name);
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
        let src = self.config.rocksdb_root.join(app_id).join(table_name);
        let dst = self
            .config
            .rocksdb_backup
            .join(app_id)
            .join(format!("{table_name}_{}", chrono::Utc::now().timestamp()));
        copy_dir_recursive(&src, &dst)?;
        info!("Backed up {app_id}/{table_name} to {}", dst.display());
        Ok(())
    }

    pub fn restore_db(&self, app_id: &str, table_name: &str) -> Result<()> {
        let backup_dir = self.config.rocksdb_backup.join(app_id);
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
        let dst = self.config.rocksdb_root.join(app_id).join(table_name);
        if dst.exists() {
            std::fs::remove_dir_all(&dst)?;
        }
        copy_dir_recursive(&latest.path(), &dst)?;
        let db_key = format!("{app_id}_{table_name}");
        self.db_map.remove(&db_key);
        Ok(())
    }

    pub fn migrate_keys(&self, app_id: &str, table_name: &str) -> Result<()> {
        let db = self.get_db(app_id, table_name)?;
        let primary_keys = self.get_table_search_keys(app_id, table_name, "fieldsPK")?;
        if primary_keys.is_empty() {
            return Ok(());
        }
        let iter = db.db.iterator(rocksdb::IteratorMode::Start);
        let mut batch = WriteBatch::default();
        let mut migrated = 0usize;
        for item in iter {
            let (key, value) = item?;
            let key_str = String::from_utf8_lossy(&key);
            if key_str.starts_with("__meta_") {
                continue;
            }
            if let Ok(Value::Object(record)) = serde_json::from_slice(&value) {
                let new_key = self.build_primary_key(app_id, table_name, &record, &primary_keys)?;
                if new_key != key_str {
                    batch.put(new_key.as_bytes(), &value);
                    batch.delete(&key);
                    migrated += 1;
                }
            }
        }
        if migrated > 0 {
            db.db.write(batch)?;
        }
        info!("Migrated {migrated} keys for {app_id}/{table_name}");
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
    fn get_index_schema_entry(&self, app_id: &str, entry_id: &str) -> Result<Map<String, Value>> {
        let db = self.get_db(app_id, "index")?;
        let key = format!("{app_id}_index_{entry_id}");
        if let Some(bytes) = db.db.get(key.as_bytes())? {
            if let Ok(Value::Object(obj)) = serde_json::from_slice(&bytes) {
                return Ok(obj);
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
                    .map(|db| db.db.get(key.as_bytes()).ok().flatten().is_some())
            })
            .unwrap_or(false)
    }

    pub fn count_actual_records(&self, app_id: &str, table_name: &str) -> u64 {
        if let Ok(db) = self.get_db(app_id, table_name) {
            let mut count = 0u64;
            let iter = db.db.iterator(rocksdb::IteratorMode::Start);
            for item in iter {
                if let Ok((key, _)) = item {
                    let key_str = String::from_utf8_lossy(&key);
                    if !key_str.starts_with("__meta_") {
                        count += 1;
                    }
                }
            }
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
            let iter = db.db.iterator(rocksdb::IteratorMode::Start);
            let mut batch = rocksdb::WriteBatch::default();
            for item in iter {
                if let Ok((key, _)) = item {
                    batch.delete(key);
                }
            }
            db.db.write(batch)?;
        }
        let index_path = self.config.lucene_index_root.join(format!("{app_id}_{table_name}"));
        if index_path.exists() {
            let _ = std::fs::remove_dir_all(&index_path);
        }
        Ok(())
    }

    pub fn get_static_file(&self, relative_path: &str) -> Option<PathBuf> {
        let path = self.data_dir.join(relative_path.trim_start_matches('/'));
        if path.exists() && path.is_file() {
            Some(path)
        } else {
            None
        }
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
        if filter.filter_type != "eq" || filter.field.is_empty() {
            return None;
        }
        let supported = matches!(
            filter.field.as_str(),
            "id" | "app_token" | "refresh" | "refresh_token"
        );
        if !supported {
            return None;
        }
        let value = value_to_string(&filter.value);
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

    fn try_find_by_scan(
        &self,
        db: &DbHandle,
        filter: &SearchFilter,
        unlimited: bool,
    ) -> Option<Map<String, Value>> {
        let iter = db.db.iterator(rocksdb::IteratorMode::Start);
        let mut scanned = 0usize;
        for item in iter {
            if !unlimited && scanned >= MAX_FIND_SCAN_RECORDS {
                break;
            }
            if let Ok((key, value)) = item {
                let key_str = String::from_utf8_lossy(&key);
                if key_str.starts_with("__meta_") {
                    scanned += 1;
                    continue;
                }
                if value.len() > MAX_SAFE_FIND_RECORD_BYTES {
                    scanned += 1;
                    continue;
                }
                if let Ok(Value::Object(record)) = serde_json::from_slice(&value) {
                    if SearchFilter::matches(&record, filter) {
                        return Some(record);
                    }
                }
            }
            scanned += 1;
        }
        None
    }

    fn load_record_by_key(
        &self,
        db: &DbHandle,
        key: &str,
        filter: &SearchFilter,
    ) -> Option<Map<String, Value>> {
        let value = db.db.get(key.as_bytes()).ok()??;
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

    fn increment_meta_count(&self, db: &DbHandle, batch: &mut WriteBatch, delta: i64) -> Result<()> {
        let key = b"__meta_count";
        let current: i64 = db
            .db
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

fn extract_equality_conditions(filter: &SearchFilter, out: &mut Map<String, Value>) {
    if !filter.conditions.is_empty() {
        for sub in &filter.conditions {
            extract_equality_conditions(sub, out);
        }
        return;
    }
    if filter.filter_type.eq_ignore_ascii_case("eq") && !filter.field.is_empty() {
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

fn storage_key_candidates(app_id: &str, table_name: &str, base: &str) -> Vec<String> {
    vec![
        base.to_string(),
        format!("{table_name}_{base}"),
        format!("{app_id}_{table_name}_{base}"),
    ]
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

fn compare_records_desc(a: &Map<String, Value>, b: &Map<String, Value>) -> std::cmp::Ordering {
    let ta = resolve_sort_ts(a);
    let tb = resolve_sort_ts(b);
    tb.cmp(&ta).then_with(|| {
        let ida = record_key(a).unwrap_or_default();
        let idb = record_key(b).unwrap_or_default();
        idb.cmp(&ida)
    })
}

fn resolve_sort_ts(record: &Map<String, Value>) -> i64 {
    for field in ["publish_date", "updated_at", "created_at", "id"] {
        if let Some(v) = record.get(field) {
            if let Some(n) = v.as_i64() {
                if n > 0 && n < 1_000_000_000_000 {
                    return n * 1000;
                }
                return n.max(0);
            }
            if let Some(s) = v.as_str() {
                if let Ok(n) = s.parse::<i64>() {
                    if n > 0 && n < 1_000_000_000_000 {
                        return n * 1000;
                    }
                    return n.max(0);
                }
            }
        }
    }
    0
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
