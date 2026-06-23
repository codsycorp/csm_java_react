//! Tenant RAG vector search — mirrors `backend-go/internal/data/tenant_rag.go`.

use std::collections::HashMap;

use super::vector_store::{VectorQueryHit, VECTOR_COLL_TENANT_RAG};

const DEFAULT_TENANT_RAG_TOP_K: usize = 6;

#[derive(Debug, Clone)]
pub struct TenantRagChunk {
    pub chunk_id: String,
    pub app_id: String,
    pub source_name: String,
    pub scope_mask: i32,
    pub scope_tags: String,
    pub tags: String,
    pub created_at_ms: i64,
    pub summary: String,
    pub structure: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct TenantRagHit {
    pub chunk_id: String,
    pub app_id: String,
    pub source_name: String,
    pub scope_mask: i32,
    pub tags: String,
    pub summary: String,
    pub content: String,
    pub score: f64,
    pub created_at_ms: i64,
}

impl super::RecordManager {
    pub fn ensure_tenant_rag_schema(&self) -> Result<(), String> {
        if self.vector_store.is_none() {
            return Err("vector store unavailable".into());
        }
        Ok(())
    }

    pub fn upsert_tenant_rag_chunk(&self, chunk: TenantRagChunk) -> Result<(), String> {
        self.ensure_tenant_rag_schema()?;
        if chunk.chunk_id.is_empty() || chunk.app_id.is_empty() || chunk.content.trim().is_empty() {
            return Ok(());
        }
        let vs = self.vector_store.as_ref().unwrap();
        let meta = tenant_chunk_meta(&chunk);
        let text = tenant_chunk_embed_text(&chunk);
        vs.upsert_doc(VECTOR_COLL_TENANT_RAG, &chunk.chunk_id, &meta, &text)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_tenant_rag_source(&self, app_id: &str, source_name: &str) {
        if app_id.is_empty() || source_name.is_empty() {
            return;
        }
        if let Some(vs) = &self.vector_store {
            let mut where_clause = HashMap::new();
            where_clause.insert("app_id".into(), app_id.to_string());
            where_clause.insert("source_name".into(), source_name.to_string());
            let _ = vs.delete_where(VECTOR_COLL_TENANT_RAG, &where_clause);
        }
    }

    pub fn search_tenant_rag(
        &self,
        app_id: &str,
        query_text: &str,
        scope_mask: i32,
        limit: usize,
    ) -> Result<Vec<TenantRagHit>, String> {
        let vs = self
            .vector_store
            .as_ref()
            .ok_or_else(|| "vector store unavailable".to_string())?;
        if app_id.is_empty() || query_text.trim().is_empty() {
            return Ok(Vec::new());
        }
        let limit = if limit == 0 {
            DEFAULT_TENANT_RAG_TOP_K
        } else {
            limit
        };
        let mut where_clause = HashMap::new();
        where_clause.insert("app_id".into(), app_id.to_string());
        let results = vs
            .query(VECTOR_COLL_TENANT_RAG, query_text, &where_clause, limit * 3)
            .map_err(|e| e.to_string())?;
        let mut hits = Vec::new();
        for r in results {
            let h = hit_to_tenant_rag(r);
            if !scope_mask_matches(h.scope_mask, scope_mask) {
                continue;
            }
            hits.push(h);
            if hits.len() >= limit {
                break;
            }
        }
        Ok(hits)
    }

    pub fn search_records_vector_for_app(
        &self,
        app_id: &str,
        query_text: &str,
        table_names: &[String],
        limit: usize,
    ) -> Result<Vec<TenantRagHit>, String> {
        let vs = self
            .vector_store
            .as_ref()
            .ok_or_else(|| "vector store unavailable".to_string())?;
        if app_id.is_empty() || query_text.trim().is_empty() {
            return Ok(Vec::new());
        }
        let limit = if limit == 0 {
            DEFAULT_TENANT_RAG_TOP_K
        } else {
            limit
        };
        let default_tables = [
            "csm_roles", "csm_depts", "csm_branches", "index", "sys_autos",
        ];
        let tables: Vec<&str> = if table_names.is_empty() {
            default_tables.to_vec()
        } else {
            table_names.iter().map(String::as_str).collect()
        };
        let table_set: HashMap<&str, ()> = tables.into_iter().map(|t| (t, ())).collect();

        let mut where_clause = HashMap::new();
        where_clause.insert("app_id".into(), app_id.to_string());
        let results = vs
            .query(
                super::vector_store::VECTOR_COLL_RECORDS,
                query_text,
                &where_clause,
                limit * 4,
            )
            .map_err(|e| e.to_string())?;

        let mut hits = Vec::new();
        for r in results {
            let table_name = r.metadata.get("table_name").cloned().unwrap_or_default();
            if !table_set.contains_key(table_name.as_str()) {
                continue;
            }
            let scope = scope_mask_for_table(&table_name);
            hits.push(TenantRagHit {
                chunk_id: r.doc_id,
                app_id: app_id.to_string(),
                source_name: table_name,
                scope_mask: scope,
                tags: String::new(),
                summary: r.metadata.get("title").cloned().unwrap_or_default(),
                content: r.content,
                score: f64::from(r.score.max(0.0)),
                created_at_ms: 0,
            });
            if hits.len() >= limit {
                break;
            }
        }
        Ok(hits)
    }
}

fn tenant_chunk_meta(chunk: &TenantRagChunk) -> HashMap<String, String> {
    let mut m = HashMap::new();
    m.insert("app_id".into(), chunk.app_id.clone());
    m.insert("source_name".into(), chunk.source_name.clone());
    m.insert("scope_mask".into(), chunk.scope_mask.to_string());
    m.insert("scope_tags".into(), chunk.scope_tags.clone());
    m.insert("tags".into(), chunk.tags.clone());
    m.insert("created_at_ms".into(), chunk.created_at_ms.to_string());
    m.insert("summary".into(), chunk.summary.clone());
    m.insert("structure".into(), chunk.structure.clone());
    m
}

fn tenant_chunk_embed_text(chunk: &TenantRagChunk) -> String {
    format!(
        "{}\n{}\n{}",
        chunk.summary, chunk.structure, chunk.content
    )
}

fn hit_to_tenant_rag(r: VectorQueryHit) -> TenantRagHit {
    let scope_mask = r
        .metadata
        .get("scope_mask")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let created_at_ms = r
        .metadata
        .get("created_at_ms")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let score = f64::from(r.score.max(0.0));
    TenantRagHit {
        chunk_id: r.doc_id,
        app_id: r.metadata.get("app_id").cloned().unwrap_or_default(),
        source_name: r.metadata.get("source_name").cloned().unwrap_or_default(),
        scope_mask,
        tags: r.metadata.get("tags").cloned().unwrap_or_default(),
        summary: r.metadata.get("summary").cloned().unwrap_or_default(),
        content: r.content,
        score,
        created_at_ms,
    }
}

fn scope_mask_matches(doc_scope_mask: i32, filter_mask: i32) -> bool {
    if filter_mask == 0 {
        return true;
    }
    (doc_scope_mask & filter_mask) != 0
}

fn scope_mask_for_table(table_name: &str) -> i32 {
    match table_name {
        "index" => 1,
        "sys_autos" => 2,
        _ => 16,
    }
}

pub fn chunk_text(source_name: &str, text: &str, max_chunk: usize) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }
    let max_chunk = if max_chunk == 0 { 2200 } else { max_chunk };
    if text.len() <= max_chunk {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        if rest.len() <= max_chunk {
            chunks.push(rest.to_string());
            break;
        }
        let mut cut = max_chunk;
        if let Some(idx) = rest[..cut].rfind("\n\n") {
            if idx > max_chunk / 2 {
                cut = idx;
            }
        }
        chunks.push(rest[..cut].trim().to_string());
        rest = rest[cut..].trim();
    }
    let _ = source_name;
    chunks
}
