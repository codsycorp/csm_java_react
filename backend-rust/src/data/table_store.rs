//! Per-table Pebble KV store — mirrors `backend-go` layout `{pebble_root}/{app}/{table}/`.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use pebbledb::{Batch, Db, Options as PebbleOptions};

use crate::config::ensure_dir;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BatchOpKind {
    Put,
    Delete,
}

#[derive(Clone)]
pub struct TableBatchOp {
    pub kind: BatchOpKind,
    pub key: Vec<u8>,
    pub value: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct TableBatch {
    pub ops: Vec<TableBatchOp>,
}

impl TableBatch {
    pub fn put(&mut self, key: impl AsRef<[u8]>, value: impl AsRef<[u8]>) {
        self.ops.push(TableBatchOp {
            kind: BatchOpKind::Put,
            key: key.as_ref().to_vec(),
            value: Some(value.as_ref().to_vec()),
        });
    }

    pub fn delete(&mut self, key: impl AsRef<[u8]>) {
        self.ops.push(TableBatchOp {
            kind: BatchOpKind::Delete,
            key: key.as_ref().to_vec(),
            value: None,
        });
    }
}

pub struct DbHandle {
    db: Arc<Db>,
}

impl DbHandle {
    pub fn open_pebble(db_path: &Path) -> Result<Self> {
        ensure_dir(db_path)?;
        let mut opts = PebbleOptions::default();
        opts.create_if_missing = true;
        let db = Db::open(db_path, opts)
            .with_context(|| format!("Failed to open Pebble at {}", db_path.display()))?;
        Ok(Self { db: Arc::new(db) })
    }

    pub fn get(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        match self.db.get(key) {
            Ok(Some(v)) => Ok(Some(v)),
            Ok(None) => Ok(None),
            Err(pebbledb::Error::NotFound) => Ok(None),
            Err(e) => Err(e).context("pebble get"),
        }
    }

    pub fn write_batch(&self, batch: &TableBatch) -> Result<()> {
        if batch.ops.is_empty() {
            return Ok(());
        }
        let mut pb = Batch::new();
        for op in &batch.ops {
            match op.kind {
                BatchOpKind::Put => {
                    let value = op.value.as_deref().unwrap_or_default();
                    pb.set(&op.key, value);
                }
                BatchOpKind::Delete => pb.delete(&op.key),
            }
        }
        self.db.apply(pb).context("pebble apply batch")?;
        Ok(())
    }

    pub fn for_each_entry<F>(&self, mut visit: F) -> Result<()>
    where
        F: FnMut(&[u8], &[u8]) -> Result<()>,
    {
        let mut it = self.db.iter().context("pebble iter")?;
        if it.first().is_ok() {
            while it.valid() {
                visit(it.key(), it.value()).context("pebble visit")?;
                it.next().context("pebble iter next")?;
            }
        }
        Ok(())
    }
}

pub fn open_table_db(
    root: &Path,
    app_id: &str,
    table_name: &str,
    db_map: &dashmap::DashMap<String, Arc<DbHandle>>,
    db_locks: &dashmap::DashMap<String, Arc<Mutex<()>>>,
) -> Result<Arc<DbHandle>> {
    let db_key = format!("{app_id}_{table_name}");

    if let Some(existing) = db_map.get(&db_key) {
        return Ok(existing.clone());
    }

    let lock = db_locks
        .entry(db_key.clone())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone();
    let _guard = lock.lock();

    if let Some(existing) = db_map.get(&db_key) {
        return Ok(existing.clone());
    }

    let db_path = root.join(app_id).join(table_name);
    ensure_dir(&db_path)?;

    let db_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let resolved = db_path.canonicalize().unwrap_or_else(|_| db_path.clone());
    if !resolved.starts_with(&db_root) {
        return Err(anyhow!("KV path escapes database root"));
    }

    let handle = Arc::new(DbHandle::open_pebble(&db_path)?);
    db_map.insert(db_key, handle.clone());
    Ok(handle)
}

pub fn sanitize_kv_segment(segment: &str, label: &str) -> Result<String> {
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

pub fn table_db_path(root: &Path, app_id: &str, table_name: &str) -> PathBuf {
    root.join(app_id).join(table_name)
}
