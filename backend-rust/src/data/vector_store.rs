//! Embedded vector store via **Qdrant Edge** (`qdrant-edge` crate).
//!
//! One on-disk Edge shard per logical collection (`tenant_rag`, `records`, `workspace`).
//! Vectors and payloads are stored on disk (mmap) — no separate vector service process.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use qdrant_edge::{
    Condition, Distance, EdgeConfigBuilder, EdgeShard, EdgeVectorParamsBuilder, FieldCondition,
    Filter, JsonPath, Match, MatchValue, NamedQuery, PointId, PointInsertOperations,
    PointOperations, PointStruct, QueryEnum, QueryRequest, SearchRequest, UpdateOperation,
    ValueVariants, Vector, Vectors, WithPayloadInterface, DEFAULT_VECTOR_NAME,
};
use sha2::{Digest, Sha256};
use tracing::info;

use crate::config::{ensure_dir, AppConfig};

use super::embed_hash::{hash_embed, DEFAULT_EMBED_DIM};

pub const VECTOR_COLL_TENANT_RAG: &str = "tenant_rag";
pub const VECTOR_COLL_RECORDS: &str = "records";
pub const VECTOR_COLL_WORKSPACE: &str = "workspace";

const COLLECTIONS: &[&str] = &[VECTOR_COLL_TENANT_RAG, VECTOR_COLL_RECORDS, VECTOR_COLL_WORKSPACE];

#[derive(Clone)]
pub struct VectorQueryHit {
    pub doc_id: String,
    pub score: f32,
    pub metadata: HashMap<String, String>,
    pub content: String,
}

pub struct VectorStore {
    root: PathBuf,
    shards: HashMap<String, Arc<Mutex<EdgeShard>>>,
}

impl VectorStore {
    pub fn open(cfg: &AppConfig) -> Result<Self> {
        let root = cfg.vector_store_dir.clone();
        if root.as_os_str().is_empty() {
            return Err(anyhow!("vector store dir empty"));
        }
        ensure_dir(&root)?;

        let mut shards = HashMap::new();
        for name in COLLECTIONS {
            let shard = open_or_create_shard(&root, name)?;
            shards.insert((*name).to_string(), Arc::new(Mutex::new(shard)));
        }

        info!(
            "RecordManager: vector store (qdrant-edge embedded, on-disk) {}",
            root.display()
        );
        Ok(Self { root, shards })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn upsert_doc(
        &self,
        collection: &str,
        doc_id: &str,
        meta: &HashMap<String, String>,
        content: &str,
    ) -> Result<()> {
        if doc_id.is_empty() || content.trim().is_empty() {
            return Ok(());
        }
        let shard = self.shard(collection)?;
        let embedding = hash_embed(content, DEFAULT_EMBED_DIM);
        let mut payload = serde_json::Map::new();
        payload.insert("doc_id".into(), serde_json::Value::String(doc_id.to_string()));
        payload.insert("content".into(), serde_json::Value::String(content.to_string()));
        for (k, v) in meta {
            payload.insert(k.clone(), serde_json::Value::String(v.clone()));
        }
        let point = PointStruct::new(
            doc_id_to_point_id(doc_id),
            Vectors::from(embedding),
            serde_json::Value::Object(payload),
        );
        let op = UpdateOperation::PointOperation(PointOperations::UpsertPoints(
            PointInsertOperations::PointsList(vec![point.into()]),
        ));
        shard
            .lock()
            .update(op)
            .map_err(|e| anyhow!("qdrant upsert {collection}/{doc_id}: {e}"))?;
        Ok(())
    }

    pub fn delete_doc(&self, collection: &str, doc_id: &str) -> Result<()> {
        if doc_id.is_empty() {
            return Ok(());
        }
        let shard = self.shard(collection)?;
        let filter = filter_eq("doc_id", doc_id);
        let op = UpdateOperation::PointOperation(PointOperations::DeletePointsByFilter(filter));
        shard
            .lock()
            .update(op)
            .map_err(|e| anyhow!("qdrant delete {collection}/{doc_id}: {e}"))?;
        Ok(())
    }

    pub fn delete_where(&self, collection: &str, where_clause: &HashMap<String, String>) -> Result<()> {
        if where_clause.is_empty() {
            return Ok(());
        }
        let shard = self.shard(collection)?;
        let filter = filter_from_where(where_clause);
        let op = UpdateOperation::PointOperation(PointOperations::DeletePointsByFilter(filter));
        shard
            .lock()
            .update(op)
            .map_err(|e| anyhow!("qdrant delete_where {collection}: {e}"))?;
        Ok(())
    }

    pub fn query(
        &self,
        collection: &str,
        query_text: &str,
        where_clause: &HashMap<String, String>,
        limit: usize,
    ) -> Result<Vec<VectorQueryHit>> {
        if query_text.trim().is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        let shard = self.shard(collection)?;
        let query_vec = hash_embed(query_text, DEFAULT_EMBED_DIM);
        let filter = filter_from_where(where_clause);
        let search = SearchRequest {
            query: QueryEnum::Nearest(NamedQuery::new(
                Vector::new_dense(query_vec).into(),
                DEFAULT_VECTOR_NAME,
            )),
            filter: filter_has_conditions(&filter).then_some(filter),
            limit,
            offset: 0,
            params: None,
            with_payload: Some(WithPayloadInterface::Bool(true)),
            with_vector: None,
            score_threshold: None,
        };
        let scored = shard
            .lock()
            .query(QueryRequest::from(search))
            .map_err(|e| anyhow!("qdrant query {collection}: {e}"))?;
        Ok(scored
            .into_iter()
            .filter_map(scored_point_to_hit)
            .collect())
    }

    fn shard(&self, collection: &str) -> Result<Arc<Mutex<EdgeShard>>> {
        self.shards
            .get(collection)
            .cloned()
            .ok_or_else(|| anyhow!("unknown vector collection: {collection}"))
    }
}

fn open_or_create_shard(root: &Path, collection: &str) -> Result<EdgeShard> {
    let path = root.join(collection);
    ensure_dir(&path)?;
    let config = edge_disk_config();
    if shard_has_data(&path) {
        EdgeShard::load(&path, None).with_context(|| format!("load qdrant shard {}", path.display()))
    } else {
        EdgeShard::new(&path, config)
            .with_context(|| format!("create qdrant shard {}", path.display()))
    }
}

fn shard_has_data(path: &Path) -> bool {
    let segments = path.join("segments");
    segments.is_dir()
        && std::fs::read_dir(&segments)
            .ok()
            .and_then(|mut it| it.next())
            .is_some()
}

fn edge_disk_config() -> qdrant_edge::EdgeConfig {
    EdgeConfigBuilder::new()
        .on_disk_payload(true)
        .wal_options(qdrant_edge::WalOptions {
            segment_capacity: 4 * 1024 * 1024,
            ..qdrant_edge::WalOptions::default()
        })
        .vector(
            DEFAULT_VECTOR_NAME,
            EdgeVectorParamsBuilder::new(DEFAULT_EMBED_DIM, Distance::Cosine)
                .on_disk(true)
                .build(),
        )
        .build()
}

fn doc_id_to_point_id(doc_id: &str) -> PointId {
    let digest = Sha256::digest(doc_id.as_bytes());
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&digest[..8]);
    PointId::NumId(u64::from_be_bytes(bytes))
}

fn payload_key(key: &str) -> JsonPath {
    key.parse().unwrap_or_else(|_| panic!("invalid payload key: {key}"))
}

fn filter_eq(key: &str, value: &str) -> Filter {
    Filter::new_must(Condition::Field(FieldCondition::new_match(
        payload_key(key),
        Match::Value(MatchValue {
            value: ValueVariants::String(value.to_string()),
        }),
    )))
}

fn filter_from_where(where_clause: &HashMap<String, String>) -> Filter {
    if where_clause.is_empty() {
        return Filter::new();
    }
    let mut must = Vec::with_capacity(where_clause.len());
    for (k, v) in where_clause {
        must.push(Condition::Field(FieldCondition::new_match(
            payload_key(k),
            Match::Value(MatchValue {
                value: ValueVariants::String(v.clone()),
            }),
        )));
    }
    Filter {
        must: Some(must),
        should: None,
        must_not: None,
        min_should: None,
    }
}

fn filter_has_conditions(filter: &Filter) -> bool {
    filter.must.as_ref().is_some_and(|m| !m.is_empty())
        || filter.should.as_ref().is_some_and(|m| !m.is_empty())
        || filter.must_not.as_ref().is_some_and(|m| !m.is_empty())
        || filter.min_should.is_some()
}

fn scored_point_to_hit(point: qdrant_edge::ScoredPoint) -> Option<VectorQueryHit> {
    let payload = point.payload?;
    let doc_id = payload
        .0
        .get("doc_id")
        .and_then(string_payload)
        .unwrap_or_default();
    let content = payload
        .0
        .get("content")
        .and_then(string_payload)
        .unwrap_or_default();
    let mut metadata = HashMap::new();
    for (k, v) in payload.0.iter() {
        if k == "content" {
            continue;
        }
        if let Some(s) = string_payload(v) {
            metadata.insert(k.clone(), s);
        }
    }
    Some(VectorQueryHit {
        doc_id,
        score: point.score,
        metadata,
        content,
    })
}

fn string_payload(v: &qdrant_edge::external::serde_json::Value) -> Option<String> {
    match v {
        qdrant_edge::external::serde_json::Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

pub fn open_vector_store(cfg: &AppConfig) -> Option<Arc<VectorStore>> {
    match VectorStore::open(cfg) {
        Ok(vs) => Some(Arc::new(vs)),
        Err(e) => {
            tracing::warn!("vector store unavailable ({e})");
            None
        }
    }
}
