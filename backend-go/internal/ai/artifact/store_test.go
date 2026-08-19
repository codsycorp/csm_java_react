package artifact

import (
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func TestArtifactIsChecksumVerifiedAndTenantScoped(t *testing.T) {
	root := t.TempDir()
	cfg := config.AppConfig{
		DataDir: root, NativeDataDir: filepath.Join(root, "native"),
		PebbleRoot:     filepath.Join(root, "native", "pebble"),
		VectorStoreDir: filepath.Join(root, "native", "vector"),
		EqIndexRoot:    filepath.Join(root, "native", "eq_index"), EqIndexMode: "memory",
	}
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer records.ShutdownAll()
	store := New(records)
	saved, err := store.Save(Artifact{
		TenantID: "tenant-a", RunID: "run-1", StepID: "s01", ContentType: "application/json",
		Content: `{"total":10}`, VerifiedFacts: map[string]any{"total": 10},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := store.GetForTenant("tenant-b", saved.ID); ok {
		t.Fatal("tenant-b must not read tenant-a artifact")
	}
	loaded, ok := store.GetForTenant("tenant-a", saved.ID)
	if !ok || loaded.Digest == "" || loaded.Content != saved.Content {
		t.Fatalf("expected verified tenant artifact: %+v", loaded)
	}
}
