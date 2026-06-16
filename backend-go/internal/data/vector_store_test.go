package data

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"csm_server/backend-go/internal/config"
)

func TestVectorStoreTenantRAGSearch(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:        dir,
		NativeDataDir:  filepath.Join(dir, "native"),
		VectorStoreDir: filepath.Join(dir, "native", "vector", "chromem"),
		PebbleRoot:     filepath.Join(dir, "native", "pebble"),
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "testvec"
	chunk := TenantRAGChunk{
		ChunkID: "c1", AppID: appID, SourceName: "src",
		ScopeMask: 16, Content: "module ban_hang orders table sales workflow",
		Summary: "org snapshot", CreatedAtMs: time.Now().UnixMilli(),
	}
	if err := rm.UpsertTenantRAGChunk(chunk); err != nil {
		t.Fatal(err)
	}
	hits, err := rm.SearchTenantRAG(appID, "ban hang orders", 16, 4)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("expected vector hits")
	}
}
