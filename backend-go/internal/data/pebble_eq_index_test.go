package data

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

func TestPebbleEqIndexSearchKeysConsistent(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:              dir,
		NativeDataDir:        filepath.Join(dir, "native"),
		SearchDBPath:         filepath.Join(dir, "native", "search", "vectors.db"),
		SearchDBDir:          filepath.Join(dir, "native", "search"),
		VectorStoreDir:       filepath.Join(dir, "native", "vector", "chromem"),
		PebbleRoot:           filepath.Join(dir, "native", "pebble"),
		EqIndexMode:          "pebble",
		EqIndexRoot:          filepath.Join(dir, "native", "eq_index"),
		PebbleCacheMB:        8,
		PebbleMemTableMB:     4,
		PebbleIndexMemTableMB: 4,
		VectorRecordsEnabled: false,
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

	rm.markSearchIndexComplete(appID, table, 2, 2)

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

	// Index survives close/reopen (SSD-backed, no RAM rebuild).
	rm.ShutdownAll()

	rm2, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm2.ShutdownAll()
	rm2.markSearchIndexComplete(appID, table, 2, rm2.countEqIndexPebbleKeys(appID, table))

	keys2 := rm2.searchKeysConsistent(appID, table, model.EqFilter("status", "open"))
	if len(keys2) != 1 {
		t.Fatalf("after reopen expected 1 key, got %d", len(keys2))
	}
}
