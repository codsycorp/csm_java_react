package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func TestTenantRAGIndexAndSearch(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:        dir,
		NativeDataDir:  filepath.Join(dir, "native"),
		VectorStoreDir: filepath.Join(dir, "native", "vector", "chromem"),
		PebbleRoot:     filepath.Join(dir, "native", "pebble"),
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "testrag"
	markdown := "# Org\n\n- role admin\n- dept sales\n- module ban_hang orders table"
	indexChunks(rm, appID, "tenant_knowledge_org_snapshot", markdown, scopeBusiness, []string{"acl:tenant"})

	hits, err := rm.SearchTenantRAG(appID, "ban_hang orders module org role", scopeBusiness, 4)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("expected tenant rag hits")
	}
}

func TestBuildSelfDirectedRetrievalQuery(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Thêm module kho",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
		TaskType:    "menu_design",
		ResponseMode: "edit",
	}
	q := buildSelfDirectedRetrievalQuery(req)
	if q == "" || len(q) > 400 {
		t.Fatalf("query=%q", q)
	}
	if !containsStr(q, "menu_json") {
		t.Fatalf("missing context in query: %q", q)
	}
}

func TestRunTenantRAGNilRM(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{AppID: "csm", Message: "test", ContextType: "code"}
	got := RunTenantRAG(cfg, nil, req)
	if got.Block != "" || got.HitCount != 0 {
		t.Fatalf("expected empty rag for nil rm, got %+v", got)
	}
}

func TestRagCitationsSSEShape(t *testing.T) {
	req := &CodeStreamRequest{RequestID: "r1"}
	rag := TenantRAGResult{
		Query: "test query", HitCount: 1,
		Hits: []TenantRAGCitation{{
			Source: "active_menu", ChunkID: "c1", Summary: "menu hit",
			Score: 0.8, SourceCategory: "current_menu",
		}},
	}
	evt := RagCitationsSSE(req, rag)
	if evt["stage"] != "rag_citations" {
		t.Fatalf("stage=%v", evt["stage"])
	}
	citations, ok := evt["citations"].([]map[string]any)
	if !ok || len(citations) != 1 {
		t.Fatalf("citations=%v", evt["citations"])
	}
}
