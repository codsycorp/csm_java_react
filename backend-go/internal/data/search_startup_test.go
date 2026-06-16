package data

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestStartupReindexWhenEqIndexPartial(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:              dir,
		NativeDataDir:        filepath.Join(dir, "native"),
		SearchDBPath:         filepath.Join(dir, "native", "search", "vectors.db"),
		SearchDBDir:          filepath.Join(dir, "native", "search"),
		PebbleRoot:           filepath.Join(dir, "native", "pebble"),
		StartupReindex:       true,
		StartupReindexTables: []string{"csm/sys_autos"},
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "csm"
	table := "sys_autos"
	for _, name := range []string{"auto-a", "auto-b"} {
		_, _ = rm.CreateRecord(appID, table, map[string]any{
			"p_name": name,
			"p_type": 0,
			"p_code": "x",
			"id":     name,
		}, []string{"p_name", "p_type"})
	}

	if rm.eqIndex != nil {
		rm.deleteEqIndexForTable(appID, table)
		rm.upsertEqIndex(appID, table, PebbleKey(appID, table, "auto-a:0"), map[string]any{
			"p_name": "auto-a",
			"p_type": 0,
			"p_code": "x",
			"id":     "auto-a",
		})
	}

	if !rm.needsSearchReindex(appID, table) {
		t.Fatal("expected needsSearchReindex=true when eq-index covers fewer rows than Pebble")
	}

	rm.runStartupReindex([]string{"csm/sys_autos"})
	if rm.countEqIndexPebbleKeys(appID, table) < 2 {
		t.Fatalf("startup reindex should index all rows, got eq_keys=%d", rm.countEqIndexPebbleKeys(appID, table))
	}
	if rm.needsSearchReindex(appID, table) {
		t.Fatal("expected needsSearchReindex=false after startup reindex")
	}
}
