package data

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const defaultTenantRAGTopK = 6

// TenantRAGChunk is one indexed tenant context document for AI retrieval.
type TenantRAGChunk struct {
	ChunkID     string
	AppID       string
	SourceName  string
	ScopeMask   int
	ScopeTags   string
	Tags        string
	CreatedAtMs int64
	Summary     string
	Structure   string
	Content     string
}

// TenantRAGHit is a retrieval result row.
type TenantRAGHit struct {
	ChunkID     string
	AppID       string
	SourceName  string
	ScopeMask   int
	Tags        string
	Summary     string
	Content     string
	Score       float64
	CreatedAtMs int64
}

func tenantRAGSchemaStatements() []string {
	return []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS tenant_rag_fts USING fts5(
			chunk_id UNINDEXED,
			app_id UNINDEXED,
			source_name UNINDEXED,
			scope_mask UNINDEXED,
			scope_tags UNINDEXED,
			tags UNINDEXED,
			created_at_ms UNINDEXED,
			summary,
			structure,
			content,
			tokenize='unicode61'
		)`,
	}
}

// EnsureTenantRAGSchema creates vectors.db (if missing) and tenant_rag_fts table.
func (rm *RecordManager) EnsureTenantRAGSchema() error {
	if rm.searchDB != nil {
		return rm.applyTenantRAGSchema(rm.searchDB)
	}
	if rm.cfg.SearchDBPath == "" {
		return fmt.Errorf("search db path empty")
	}
	if err := os.MkdirAll(filepath.Dir(rm.cfg.SearchDBPath), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(rm.cfg.SearchDBPath, os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	_ = f.Close()

	db, err := sql.Open("sqlite", rm.cfg.SearchDBPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	if err := rm.applyTenantRAGSchema(db); err != nil {
		_ = db.Close()
		return err
	}
	// Also ensure records_fts exists for hybrid table search.
	for _, q := range []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
			pebble_key UNINDEXED,
			app_id UNINDEXED,
			table_name UNINDEXED,
			record_id UNINDEXED,
			title,
			content,
			tokenize='unicode61'
		)`,
	} {
		if _, err := db.Exec(q); err != nil {
			_ = db.Close()
			return fmt.Errorf("records_fts schema: %w", err)
		}
	}
	rm.searchDB = db
	return nil
}

func (rm *RecordManager) applyTenantRAGSchema(db *sql.DB) error {
	for _, q := range tenantRAGSchemaStatements() {
		if _, err := db.Exec(q); err != nil {
			return fmt.Errorf("tenant_rag schema: %w", err)
		}
	}
	return nil
}

// UpsertTenantRAGChunk indexes or replaces one tenant RAG chunk.
func (rm *RecordManager) UpsertTenantRAGChunk(chunk TenantRAGChunk) error {
	if err := rm.EnsureTenantRAGSchema(); err != nil {
		return err
	}
	if chunk.ChunkID == "" || chunk.AppID == "" || strings.TrimSpace(chunk.Content) == "" {
		return nil
	}
	if chunk.CreatedAtMs <= 0 {
		chunk.CreatedAtMs = time.Now().UnixMilli()
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM tenant_rag_fts WHERE chunk_id = ?`, chunk.ChunkID)
	_, err := rm.searchDB.Exec(
		`INSERT INTO tenant_rag_fts(
			chunk_id, app_id, source_name, scope_mask, scope_tags, tags, created_at_ms,
			summary, structure, content
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		chunk.ChunkID, chunk.AppID, chunk.SourceName, chunk.ScopeMask,
		chunk.ScopeTags, chunk.Tags, chunk.CreatedAtMs,
		chunk.Summary, chunk.Structure, chunk.Content,
	)
	return err
}

// DeleteTenantRAGSource removes all chunks for a source name within an app.
func (rm *RecordManager) DeleteTenantRAGSource(appID, sourceName string) error {
	if rm.searchDB == nil || appID == "" || sourceName == "" {
		return nil
	}
	_, err := rm.searchDB.Exec(
		`DELETE FROM tenant_rag_fts WHERE app_id = ? AND source_name = ?`,
		appID, sourceName,
	)
	return err
}

// SearchTenantRAG runs FTS5 BM25 search with optional scope mask filter.
func (rm *RecordManager) SearchTenantRAG(appID, match string, scopeMask, limit int) ([]TenantRAGHit, error) {
	if err := rm.EnsureTenantRAGSchema(); err != nil {
		return nil, err
	}
	if appID == "" || strings.TrimSpace(match) == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = defaultTenantRAGTopK
	}
	rows, err := rm.searchDB.Query(
		`SELECT chunk_id, app_id, source_name, scope_mask, tags, summary, content, created_at_ms,
		        bm25(tenant_rag_fts) AS rank_score
		 FROM tenant_rag_fts
		 WHERE app_id = ? AND tenant_rag_fts MATCH ?
		   AND (? = 0 OR (scope_mask & ?) != 0)
		 ORDER BY rank_score
		 LIMIT ?`,
		appID, match, scopeMask, scopeMask, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hits []TenantRAGHit
	for rows.Next() {
		var h TenantRAGHit
		var rank float64
		if err := rows.Scan(&h.ChunkID, &h.AppID, &h.SourceName, &h.ScopeMask, &h.Tags,
			&h.Summary, &h.Content, &h.CreatedAtMs, &rank); err != nil {
			return hits, err
		}
		h.Score = -rank // bm25 returns negative values; lower is better
		if h.Score < 0 {
			h.Score = -h.Score
		}
		hits = append(hits, h)
	}
	return hits, rows.Err()
}

// SearchRecordsFTSForApp searches records_fts across tables for one app (org tables, index, etc.).
func (rm *RecordManager) SearchRecordsFTSForApp(appID, match string, tableNames []string, limit int) ([]TenantRAGHit, error) {
	if rm.searchDB == nil || appID == "" || strings.TrimSpace(match) == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = defaultTenantRAGTopK
	}
	if len(tableNames) == 0 {
		tableNames = []string{"csm_roles", "csm_depts", "csm_branches", "index", "sys_autos"}
	}

	var hits []TenantRAGHit
	for _, tableName := range tableNames {
		keys, err := rm.ftsSearchKeys(appID, tableName, match, limit)
		if err != nil || len(keys) == 0 {
			continue
		}
		for _, pebbleKey := range keys {
			record, err := rm.loadRecordByPebbleKey(pebbleKey)
			if err != nil || record == nil {
				continue
			}
			title, content := ExtractSearchText(record)
			if content == "" {
				continue
			}
			hits = append(hits, TenantRAGHit{
				ChunkID:     pebbleKey,
				AppID:       appID,
				SourceName:  tableName,
				ScopeMask:   scopeMaskForTable(tableName),
				Summary:     title,
				Content:     content,
				Score:       0.5,
				CreatedAtMs: time.Now().UnixMilli(),
			})
			if len(hits) >= limit {
				return hits, nil
			}
		}
	}
	return hits, nil
}

func scopeMaskForTable(tableName string) int {
	switch tableName {
	case "index":
		return 1 // menu
	case "sys_autos":
		return 2 // code
	default:
		return 16 // business
	}
}

// ChunkText splits long text into retrieval-sized chunks (~2200 chars).
func ChunkText(sourceName, text string, maxChunk int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if maxChunk <= 0 {
		maxChunk = 2200
	}
	if len(text) <= maxChunk {
		return []string{text}
	}
	var chunks []string
	for len(text) > 0 {
		if len(text) <= maxChunk {
			chunks = append(chunks, text)
			break
		}
		cut := maxChunk
		if idx := strings.LastIndex(text[:cut], "\n\n"); idx > maxChunk/2 {
			cut = idx
		}
		chunks = append(chunks, strings.TrimSpace(text[:cut]))
		text = strings.TrimSpace(text[cut:])
	}
	_ = sourceName
	return chunks
}
