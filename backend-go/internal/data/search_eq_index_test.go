package data

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

func TestEqIndexSearchKeysConsistent(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:        dir,
		NativeDataDir:  filepath.Join(dir, "native"),
		SearchDBPath:   filepath.Join(dir, "native", "search", "vectors.db"),
		SearchDBDir:    filepath.Join(dir, "native", "search"),
		VectorStoreDir: filepath.Join(dir, "native", "vector", "chromem"),
		PebbleRoot:     filepath.Join(dir, "native", "pebble"),
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "demo"
	table := "orders"
	_, _ = rm.CreateRecord(appID, table, map[string]any{
		"id": "o1", "status": "open", "customer": "Alice",
	}, []string{"id"})
	_, _ = rm.CreateRecord(appID, table, map[string]any{
		"id": "o2", "status": "closed", "customer": "Bob",
	}, []string{"id"})

	keys := rm.searchKeysConsistent(appID, table, model.EqFilter("status", "open"))
	if len(keys) != 1 {
		t.Fatalf("expected 1 key, got %d", len(keys))
	}

	records := rm.collectViaEqIndex(appID, table, model.EqFilter("status", "open"))
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if records[0]["id"] != "o1" {
		t.Fatalf("unexpected record id %v", records[0]["id"])
	}
}

func TestFilterWithPaginationScan(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:       dir,
		NativeDataDir: filepath.Join(dir, "native"),
		SearchDBPath:  filepath.Join(dir, "native", "search", "vectors.db"),
		SearchDBDir:   filepath.Join(dir, "native", "search"),
		PebbleRoot:    filepath.Join(dir, "native", "pebble"),
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "demo"
	table := "items"
	for i := 1; i <= 5; i++ {
		_, _ = rm.CreateRecord(appID, table, map[string]any{
			"id": fmtID(i), "n": i,
		}, []string{"id"})
	}

	page := rm.FilterWithPagination(appID, table, model.SearchFilter{}, "", 0, 2)
	rows, _ := page["rows"].([]any)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if page["totalCount"] != 5 {
		t.Fatalf("expected totalCount 5, got %v", page["totalCount"])
	}
}

func fmtID(i int) string {
	return string(rune('a' + i - 1))
}

func TestFilterListFallsThroughWhenEqIndexPartial(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:       dir,
		NativeDataDir: filepath.Join(dir, "native"),
		SearchDBPath:  filepath.Join(dir, "native", "search", "vectors.db"),
		SearchDBDir:   filepath.Join(dir, "native", "search"),
		PebbleRoot:    filepath.Join(dir, "native", "pebble"),
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "csm"
	table := "sys_autos"
	for i, name := range []string{"auto-lmkt", "auto-seo", "auto-kqxs"} {
		_, _ = rm.CreateRecord(appID, table, map[string]any{
			"p_name": name,
			"p_type": 0,
			"p_code": "code-" + name,
			"id":     name + "-id",
		}, []string{"p_name", "p_type"})
		if i == 0 {
			continue
		}
	}

	// Simulate partial eq-index: only one row indexed (legacy rows missing from memory index).
	rm.deleteEqIndexForTable(appID, table)
	keys := rm.searchKeysConsistent(appID, table, model.EqFilter("p_type", 0))
	if len(keys) != 0 {
		t.Fatalf("expected empty eq-index after delete, got %d keys", len(keys))
	}
	rm.upsertEqIndex(appID, table, PebbleKey(appID, table, "auto-lmkt:0"), map[string]any{
		"p_name": "auto-lmkt",
		"p_type": 0,
		"p_code": "code-auto-lmkt",
		"id":     "auto-lmkt-id",
	})
	rm.markSearchIndexComplete(appID, table, 3, 1)

	filter := model.EqFilter("p_type", 0)
	if rm.shouldUseEqIndexListFastPath(appID, table, filter) {
		t.Fatal("p_type-only sys_autos filter must not use eq-index fast path")
	}

	result := rm.Filter(appID, table, filter)
	rows, _ := result["rows"].([]any)
	if len(rows) != 3 {
		t.Fatalf("Filter(p_type=0) must scan Pebble and return all rows, got %d", len(rows))
	}
}
