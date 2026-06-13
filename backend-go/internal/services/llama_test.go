package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestIsAvailableRequiresNativeBackend(t *testing.T) {
	modelFile := filepath.Join(t.TempDir(), "model.gguf")
	if err := os.WriteFile(modelFile, []byte("fake"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := config.AppConfig{
		AI: config.AIConfig{
			LlamaModelPath:     modelFile,
			LlamaNativeEnabled: true,
		},
	}
	svc := NewLlamaService(cfg)
	if !svc.ModelOnDisk() {
		t.Fatal("expected model on disk")
	}
	if svc.IsAvailable() {
		t.Fatal("model file alone must not make inference available without -tags llamacpp build")
	}
}
