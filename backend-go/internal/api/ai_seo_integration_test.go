package api

import (
	"net/http"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/handlers"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

func TestAiGenerateSeoContentEndpointRequiresAuth(t *testing.T) {
	root := t.TempDir()
	cfg := config.AppConfig{
		DataDir: root, NativeDataDir: filepath.Join(root, "native"),
		PebbleRoot:     filepath.Join(root, "native", "pebble"),
		VectorStoreDir: filepath.Join(root, "native", "vector"),
		EqIndexRoot:    filepath.Join(root, "native", "eq_index"), EqIndexMode: "memory",
		AI: config.AIConfig{LlamaContextWindow: 8192, LlamaBatchSize: 8192, LlamaMaxPromptChars: 24000},
	}
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer records.ShutdownAll()

	llama := services.NewLlamaService(cfg)
	aiSeo := services.NewAiSeoService(cfg, llama, records)
	apiExt := handlers.NewApiExtHandler(cfg, &http.Client{}, nil, aiSeo)

	resp := apiExt.HandleAiGenerateSeoContent(map[string]any{
		"mode": "sync", "async": false,
		"seoPipeline":      "anti_ai_one_shot",
		"responseContract": "article",
		"seoContext": map[string]any{
			"industry": "bat-dong-san", "topic": "Căn hộ Vinhomes Quận 9",
			"domainKey": "lmkt", "seed": "integration-test",
		},
	}, nil)
	if resp.Code() != 401 {
		t.Fatalf("expected 401 without auth, got %d: %+v", resp.Code(), resp.Properties)
	}
}

func TestAiGenerateSeoContentEndpointWithAuth(t *testing.T) {
	root := t.TempDir()
	cfg := config.AppConfig{
		DataDir: root, NativeDataDir: filepath.Join(root, "native"),
		PebbleRoot:     filepath.Join(root, "native", "pebble"),
		VectorStoreDir: filepath.Join(root, "native", "vector"),
		EqIndexRoot:    filepath.Join(root, "native", "eq_index"), EqIndexMode: "memory",
		AI: config.AIConfig{LlamaContextWindow: 8192, LlamaBatchSize: 8192, LlamaMaxPromptChars: 24000},
	}
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer records.ShutdownAll()

	llama := services.NewLlamaService(cfg)
	aiSeo := services.NewAiSeoService(cfg, llama, records)
	apiExt := handlers.NewApiExtHandler(cfg, &http.Client{}, nil, aiSeo)

	auth := &security.AuthUser{AppID: "tenant-integration", UserID: "user-1", Dev: true}
	resp := apiExt.HandleAiGenerateSeoContent(map[string]any{
		"mode": "sync", "async": false,
		"seoPipeline":      "anti_ai_one_shot",
		"responseContract": "article",
		"seoContext": map[string]any{
			"industry": "bat-dong-san", "topic": "Căn hộ Vinhomes Quận 9",
			"domainKey": "lmkt", "seed": "integration-test",
		},
	}, auth)
	if resp.Success() {
		// Llama may not be available in test; success is optional. Just ensure no panic.
		t.Logf("success response: %+v", resp.Properties)
	} else {
		t.Logf("expected response (llama may be unavailable): %+v", resp.Properties)
	}
}
