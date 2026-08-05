package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/state"
)

func newTestRecordManager(t *testing.T) (*data.RecordManager, string) {
	t.Helper()
	root := t.TempDir()
	cfg := config.AppConfig{
		DataDir:               root,
		NativeDataDir:         filepath.Join(root, "native"),
		PebbleRoot:            filepath.Join(root, "native", "pebble"),
		SearchDBPath:          filepath.Join(root, "native", "search", "vectors.db"),
		SearchDBDir:           filepath.Join(root, "native", "search"),
		VectorStoreDir:        filepath.Join(root, "native", "vector", "chromem"),
		EqIndexMode:           "memory",
		EqIndexRoot:           filepath.Join(root, "native", "eq_index"),
		PebbleCacheMB:         32,
		PebbleMemTableMB:      8,
		PebbleIndexMemTableMB: 4,
		VectorRecordsEnabled:  false,
	}
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("new record manager: %v", err)
	}
	t.Cleanup(func() { rm.ShutdownAll() })
	return rm, root
}

func writeManifestFixture(t *testing.T, dataDir, rpIndex, app string) {
	t.Helper()
	manifest := map[string]any{
		"schema":    "csm.monolith.mfe.v1",
		"app":       app,
		"rpIndex":   rpIndex,
		"routeBase": "/",
		"hydrate":   true,
		"entry":     rpIndex + "/assets/index.hash.js",
		"js":        []string{rpIndex + "/assets/index.hash.js"},
		"css":       []string{rpIndex + "/assets/index.hash.css"},
	}
	raw, _ := json.Marshal(manifest)
	path := filepath.Join(dataDir, "public", rpIndex, "mfe.manifest.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir manifest dir: %v", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
}

func TestLoadMonolithMFEManifest(t *testing.T) {
	rm, root := newTestRecordManager(t)
	writeManifestFixture(t, root, "admin", "frontend-admin")

	mf, ok := loadMonolithMFEManifest(rm, "admin")
	if !ok || mf == nil {
		t.Fatalf("expected manifest to be loaded")
	}
	if mf.App != "frontend-admin" {
		t.Fatalf("unexpected app: %s", mf.App)
	}
}

func TestServeMonolithManifest(t *testing.T) {
	rm, root := newTestRecordManager(t)
	writeManifestFixture(t, root, "admin", "frontend-admin")
	writeManifestFixture(t, root, "web", "frontend-web")

	st := &state.AppState{RecordManager: rm}
	w := httptest.NewRecorder()

	ServeMonolithManifest(st, w, "admin.example.com", "admin")
	res := w.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", res.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["schema"] != "csm.monolith.runtime.v1" {
		t.Fatalf("unexpected schema: %v", payload["schema"])
	}
	if payload["activeRPIndex"] != "admin" {
		t.Fatalf("unexpected activeRPIndex: %v", payload["activeRPIndex"])
	}
	manifests, ok := payload["manifests"].(map[string]any)
	if !ok {
		t.Fatalf("manifests missing")
	}
	if _, ok := manifests["admin"]; !ok {
		t.Fatalf("admin manifest missing")
	}
	if _, ok := manifests["web"]; !ok {
		t.Fatalf("web manifest missing")
	}
}
