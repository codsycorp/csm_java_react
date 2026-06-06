//! Tantivy search index — Rust equivalent of Java Lucene integration.
//! Indexes are rebuilt from RocksDB via `/update-table-data-index` API.

use std::path::PathBuf;

use anyhow::Result;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};
use tracing::info;

pub struct SearchIndex {
    index: Index,
    schema: Schema,
    id_field: Field,
    body_field: Field,
}

impl SearchIndex {
    pub fn open_or_create(path: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&path)?;
        let mut schema_builder = Schema::builder();
        let id_field = schema_builder.add_text_field("id", STRING | STORED);
        let body_field = schema_builder.add_text_field("body", TEXT | STORED);
        let schema = schema_builder.build();
        let index = Index::open_or_create(
            tantivy::directory::MmapDirectory::open(&path)?,
            schema.clone(),
        )?;
        Ok(Self {
            index,
            schema,
            id_field,
            body_field,
        })
    }

    pub fn index_record(&self, id: &str, body: &str) -> Result<()> {
        let mut writer: IndexWriter = self.index.writer(50_000_000)?;
        writer.delete_term(tantivy::Term::from_field_text(self.id_field, id));
        writer.add_document(doc!(
            self.id_field => id,
            self.body_field => body,
        ))?;
        writer.commit()?;
        Ok(())
    }

    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<String>> {
        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        let searcher = reader.searcher();
        let query_parser = tantivy::query::QueryParser::for_index(
            &self.index,
            vec![self.body_field],
        );
        let query = query_parser.parse_query(query_str)?;
        let top = searcher.search(&query, &tantivy::collector::TopDocs::with_limit(limit))?;
        let mut ids = Vec::new();
        for (_score, addr) in top {
            let doc: TantivyDocument = searcher.doc(addr)?;
            if let Some(id) = doc.get_first(self.id_field).and_then(|v| v.as_str()) {
                ids.push(id.to_string());
            }
        }
        Ok(ids)
    }

    pub fn rebuild_from_records(
        path: PathBuf,
        records: &[(String, String)],
    ) -> Result<()> {
        let idx = Self::open_or_create(path)?;
        let mut writer = idx.index.writer(100_000_000)?;
        writer.delete_all_documents()?;
        for (id, body) in records {
            writer.add_document(doc!(
                idx.id_field => id.as_str(),
                idx.body_field => body.as_str(),
            ))?;
        }
        writer.commit()?;
        info!("Rebuilt search index with {} records", records.len());
        Ok(())
    }
}
