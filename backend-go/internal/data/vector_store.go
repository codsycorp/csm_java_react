package data

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync"

	chromem "github.com/philippgille/chromem-go"

	"csm_server/backend-go/internal/config"
)

const (
	vectorCollTenantRAG = "tenant_rag"
	vectorCollRecords     = "records"
	vectorCollWorkspace   = "workspace"
	vectorEmbedDim        = 384
)

// VectorStore is an embedded chromem-go DB (no separate service). Chunk metadata is
// mirrored in Pebble (_csm/vector_chunks) for durability alongside KV records.
type VectorStore struct {
	dir string
	db  *chromem.DB
	mu  sync.RWMutex
}

func openVectorStore(cfg config.AppConfig) (*VectorStore, error) {
	dir := cfg.VectorStoreDir
	if dir == "" {
		return nil, fmt.Errorf("vector store dir empty")
	}
	if err := config.EnsureDir(dir); err != nil {
		return nil, err
	}
	db, err := chromem.NewPersistentDB(dir, false)
	if err != nil {
		return nil, err
	}
	vs := &VectorStore{dir: dir, db: db}
	for _, name := range []string{vectorCollTenantRAG, vectorCollRecords, vectorCollWorkspace} {
		if _, err := vs.collection(name); err != nil {
			return nil, err
		}
	}
	log.Printf("RecordManager: vector store (chromem) %s", dir)
	return vs, nil
}

func (vs *VectorStore) Close() {
	if vs == nil || vs.db == nil {
		return
	}
	vs.db = nil
}

func hashEmbedFunc(_ context.Context, text string) ([]float32, error) {
	return HashEmbed(text, vectorEmbedDim), nil
}

func (vs *VectorStore) collection(name string) (*chromem.Collection, error) {
	if vs == nil || vs.db == nil {
		return nil, fmt.Errorf("vector store closed")
	}
	vs.mu.RLock()
	defer vs.mu.RUnlock()
	return vs.db.GetOrCreateCollection(name, nil, hashEmbedFunc)
}

func (vs *VectorStore) upsertDoc(collName, docID string, meta map[string]string, content string) error {
	if docID == "" || content == "" {
		return nil
	}
	coll, err := vs.collection(collName)
	if err != nil {
		return err
	}
	ctx := context.Background()
	_ = coll.Delete(ctx, nil, nil, docID)
	emb := HashEmbed(content, vectorEmbedDim)
	return coll.AddDocument(ctx, chromem.Document{
		ID:        docID,
		Metadata:  meta,
		Embedding: emb,
		Content:   content,
	})
}

func (vs *VectorStore) deleteWhere(collName string, where map[string]string) error {
	coll, err := vs.collection(collName)
	if err != nil {
		return err
	}
	return coll.Delete(context.Background(), where, nil)
}

func (vs *VectorStore) clearCollection(name string) error {
	if vs == nil || vs.db == nil {
		return nil
	}
	vs.mu.Lock()
	defer vs.mu.Unlock()
	if err := vs.db.DeleteCollection(name); err != nil {
		return err
	}
	_, err := vs.db.GetOrCreateCollection(name, nil, hashEmbedFunc)
	return err
}

func (vs *VectorStore) deleteDoc(collName, docID string) error {
	if docID == "" {
		return nil
	}
	coll, err := vs.collection(collName)
	if err != nil {
		return err
	}
	return coll.Delete(context.Background(), nil, nil, docID)
}

func (vs *VectorStore) query(collName, queryText string, where map[string]string, limit int) ([]chromem.Result, error) {
	if queryText == "" || limit <= 0 {
		return nil, nil
	}
	coll, err := vs.collection(collName)
	if err != nil {
		return nil, err
	}
	nDocs := coll.Count()
	if nDocs == 0 {
		return nil, nil
	}
	if limit > nDocs {
		limit = nDocs
	}
	return coll.Query(context.Background(), queryText, limit, where, nil)
}

func scopeMaskMatches(docScopeMask string, filterMask int) bool {
	if filterMask == 0 {
		return true
	}
	v, err := strconv.Atoi(docScopeMask)
	if err != nil {
		return true
	}
	return (v & filterMask) != 0
}

func chromemHitToTenantRAG(r chromem.Result) TenantRAGHit {
	scope := 0
	if v, err := strconv.Atoi(r.Metadata["scope_mask"]); err == nil {
		scope = v
	}
	created := int64(0)
	if v, err := strconv.ParseInt(r.Metadata["created_at_ms"], 10, 64); err == nil {
		created = v
	}
	score := float64(r.Similarity)
	if score < 0 {
		score = 0
	}
	return TenantRAGHit{
		ChunkID:     r.ID,
		AppID:       r.Metadata["app_id"],
		SourceName:  r.Metadata["source_name"],
		ScopeMask:   scope,
		Tags:        r.Metadata["tags"],
		Summary:     r.Metadata["summary"],
		Content:     r.Content,
		Score:       score,
		CreatedAtMs: created,
	}
}

func tenantChunkMeta(chunk TenantRAGChunk) map[string]string {
	return map[string]string{
		"app_id":         chunk.AppID,
		"source_name":    chunk.SourceName,
		"scope_mask":     strconv.Itoa(chunk.ScopeMask),
		"scope_tags":     chunk.ScopeTags,
		"tags":           chunk.Tags,
		"created_at_ms":  strconv.FormatInt(chunk.CreatedAtMs, 10),
		"summary":        chunk.Summary,
		"structure":      chunk.Structure,
	}
}

func tenantChunkEmbedText(chunk TenantRAGChunk) string {
	return chunk.Summary + "\n" + chunk.Structure + "\n" + chunk.Content
}
