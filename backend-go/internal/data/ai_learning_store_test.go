package data

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestAILearningStoreUpsertAndList(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:        dir,
		NativeDataDir:  filepath.Join(dir, "native"),
		VectorStoreDir: filepath.Join(dir, "native", "vector", "chromem"),
		PebbleRoot:     filepath.Join(dir, "native", "pebble"),
		EqIndexRoot:    filepath.Join(dir, "native", "eq_index"),
		EqIndexMode:    "memory",
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("NewRecordManager: %v", err)
	}
	defer rm.ShutdownAll()

	entry := AILearningEntry{
		ID: "menulearn-abc123", AppID: "banhang", Kind: string(AILearningKindMenu),
		Digest: "digest1", CreatedAtMs: 1_700_000_000_000,
		RequestText: "fix combo co", Summary: "f_types=co needs f_cbo_query",
		MenuCount: 3, ContextType: "menu_json",
	}
	if err := rm.UpsertAILearningEntry(entry); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	got, err := rm.ListAILearningEntries("banhang", AILearningKindMenu)
	if err != nil || len(got) != 1 {
		t.Fatalf("list len=%d err=%v", len(got), err)
	}
	if got[0].Digest != "digest1" {
		t.Fatalf("digest=%q", got[0].Digest)
	}
}
