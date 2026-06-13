package services

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestIsAvailableRequiresInferenceBackend(t *testing.T) {
	modelFile := filepath.Join(t.TempDir(), "model.gguf")
	if err := os.WriteFile(modelFile, []byte("fake"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := config.AppConfig{
		AI: config.AIConfig{
			LlamaModelPath:     modelFile,
			LlamaNativeEnabled:   true,
			LlamaServerURL:       "http://127.0.0.1:1",
		},
	}
	svc := NewLlamaService(cfg, http.DefaultClient)
	if !svc.ModelOnDisk() {
		t.Fatal("expected model on disk")
	}
	if svc.IsAvailable() {
		t.Fatal("model file alone must not make inference available")
	}
}

func TestIsAvailableTrueWhenSidecarHealthy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	cfg := config.AppConfig{
		AI: config.AIConfig{
			LlamaModelPath:   filepath.Join(t.TempDir(), "missing.gguf"),
			LlamaNativeEnabled: true,
			LlamaServerURL:     srv.URL,
		},
	}
	svc := NewLlamaService(cfg, srv.Client())
	if !svc.SidecarReachable() {
		t.Fatal("expected sidecar reachable")
	}
	if !svc.IsAvailable() {
		t.Fatal("expected sidecar health to make inference available")
	}
}
