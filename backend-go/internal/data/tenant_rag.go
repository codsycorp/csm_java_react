package data

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

const (
	defaultTenantRAGTopK = 6
	vectorMetaApp        = "_csm"
	vectorMetaTable      = "vector_chunks"
)

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

// EnsureTenantRAGSchema ensures chromem collections are ready (no SQLite).
func (rm *RecordManager) EnsureTenantRAGSchema() error {
	if rm.vectorStore == nil {
		return fmt.Errorf("vector store unavailable")
	}
	_, err := rm.vectorStore.collection(vectorCollTenantRAG)
	return err
}

// UpsertTenantRAGChunk indexes one tenant RAG chunk in chromem (+ optional Pebble mirror).
func (rm *RecordManager) UpsertTenantRAGChunk(chunk TenantRAGChunk) error {
	if err := rm.EnsureTenantRAGSchema(); err != nil {
		return err
	}
	if chunk.ChunkID == "" || chunk.AppID == "" || strings.TrimSpace(chunk.Content) == "" {
		return nil
	}
	meta := tenantChunkMeta(chunk)
	text := tenantChunkEmbedText(chunk)
	if err := rm.vectorStore.upsertDoc(vectorCollTenantRAG, chunk.ChunkID, meta, text); err != nil {
		return err
	}
	rm.mirrorVectorChunkPebble(chunk)
	return nil
}

// DeleteTenantRAGSource removes all chunks for a source within an app.
func (rm *RecordManager) DeleteTenantRAGSource(appID, sourceName string) error {
	if rm.vectorStore == nil || appID == "" || sourceName == "" {
		return nil
	}
	_ = rm.vectorStore.deleteWhere(vectorCollTenantRAG, map[string]string{
		"app_id":      appID,
		"source_name": sourceName,
	})
	rm.deleteVectorChunksPebbleBySource(appID, sourceName)
	return nil
}

// SearchTenantRAG runs semantic vector search (chromem) with scope mask filter.
// queryText is natural language (not FTS match syntax).
func (rm *RecordManager) SearchTenantRAG(appID, queryText string, scopeMask, limit int) ([]TenantRAGHit, error) {
	if rm.vectorStore == nil {
		return nil, fmt.Errorf("vector store unavailable")
	}
	if appID == "" || strings.TrimSpace(queryText) == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = defaultTenantRAGTopK
	}
	results, err := rm.vectorStore.query(vectorCollTenantRAG, queryText, map[string]string{"app_id": appID}, limit*3)
	if err != nil {
		return nil, err
	}
	var hits []TenantRAGHit
	for _, r := range results {
		h := chromemHitToTenantRAG(r)
		if !scopeMaskMatches(strconv.Itoa(h.ScopeMask), scopeMask) {
			continue
		}
		hits = append(hits, h)
		if len(hits) >= limit {
			break
		}
	}
	return hits, nil
}

// SearchRecordsVectorForApp semantic search over indexed org/menu tables (replaces records_fts RAG leg).
func (rm *RecordManager) SearchRecordsVectorForApp(appID, queryText string, tableNames []string, limit int) ([]TenantRAGHit, error) {
	if rm.vectorStore == nil || appID == "" || strings.TrimSpace(queryText) == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = defaultTenantRAGTopK
	}
	if len(tableNames) == 0 {
		tableNames = []string{"csm_roles", "csm_depts", "csm_branches", "index", "sys_autos"}
	}
	tableSet := make(map[string]struct{}, len(tableNames))
	for _, t := range tableNames {
		tableSet[t] = struct{}{}
	}
	results, err := rm.vectorStore.query(vectorCollRecords, queryText, map[string]string{"app_id": appID}, limit*4)
	if err != nil {
		return nil, err
	}
	var hits []TenantRAGHit
	for _, r := range results {
		tableName := r.Metadata["table_name"]
		if _, ok := tableSet[tableName]; !ok {
			continue
		}
		scope := scopeMaskForTable(tableName)
		hits = append(hits, TenantRAGHit{
			ChunkID:     r.ID,
			AppID:       appID,
			SourceName:  tableName,
			ScopeMask:   scope,
			Summary:     r.Metadata["title"],
			Content:     r.Content,
			Score:       float64(r.Similarity),
			CreatedAtMs: 0,
		})
		if len(hits) >= limit {
			break
		}
	}
	return hits, nil
}

// SearchRecordsFTSForApp kept for callers — delegates to vector search.
func (rm *RecordManager) SearchRecordsFTSForApp(appID, queryText string, tableNames []string, limit int) ([]TenantRAGHit, error) {
	return rm.SearchRecordsVectorForApp(appID, queryText, tableNames, limit)
}

func (rm *RecordManager) mirrorVectorChunkPebble(chunk TenantRAGChunk) {
	rec := map[string]any{
		"chunk_id": chunk.ChunkID, "app_id": chunk.AppID, "source_name": chunk.SourceName,
		"scope_mask": chunk.ScopeMask, "scope_tags": chunk.ScopeTags, "tags": chunk.Tags,
		"created_at_ms": chunk.CreatedAtMs, "summary": chunk.Summary,
		"structure": chunk.Structure, "content": chunk.Content,
	}
	_, _ = rm.CreateRecord(vectorMetaApp, vectorMetaTable, rec, []string{"chunk_id"})
}

func (rm *RecordManager) deleteVectorChunksPebbleBySource(appID, sourceName string) {
	_ = rm.scanTable(vectorMetaApp, vectorMetaTable, func(storageKey string, raw []byte) error {
		var rec map[string]any
		if json.Unmarshal(raw, &rec) != nil {
			return nil
		}
		if fmt.Sprint(rec["app_id"]) != appID || fmt.Sprint(rec["source_name"]) != sourceName {
			return nil
		}
		rm.deleteAtStorageKey(vectorMetaApp, vectorMetaTable, storageKey)
		return nil
	})
}

func scopeMaskForTable(tableName string) int {
	switch tableName {
	case "index":
		return 1
	case "sys_autos":
		return 2
	default:
		return 16
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
