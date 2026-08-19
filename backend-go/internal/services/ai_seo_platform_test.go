package services

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"csm_server/backend-go/internal/ai/domain"
	"csm_server/backend-go/internal/ai/provider"
	aistore "csm_server/backend-go/internal/ai/store"
	"csm_server/backend-go/internal/ai/verifier"
	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

type fixedResponseProvider struct {
	response provider.CompletionResponse
}

func (fixedResponseProvider) Name() string    { return "fixed" }
func (fixedResponseProvider) Available() bool { return true }
func (fixedResponseProvider) CountTokens(text string) (int, error) {
	return (len(text) + 2) / 3, nil
}
func (p fixedResponseProvider) Complete(context.Context, provider.CompletionRequest) (provider.CompletionResponse, error) {
	return p.response, nil
}

func TestSeoGeneratePersistsPlatformRun(t *testing.T) {
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

	fakeProvider := provider.FuncProvider{
		ProviderName: "fake-local", ModelName: "fake-model",
		IsAvailable: func() bool { return true },
		CompleteFunc: func(context.Context, string, uint32) (string, error) {
			return `{"title":"VI title","title_en":"EN title","title_zh":"中文标题","description":"Mô tả","description_en":"Description","description_zh":"描述","content":"<p>Nội dung tiếng Việt đủ dài để kiểm thử.</p>","content_en":"<p>English content long enough for validation.</p>","content_zh":"<p>用于验证的中文内容足够长。</p>","keywords":"k1","keywords_en":"k1","keywords_zh":"关键词","excerpt":"Dẫn nhập","excerpt_en":"Lead","excerpt_zh":"导语"}`, nil
		},
	}
	service := &AiSeoService{cfg: cfg, provider: fakeProvider, store: aistore.New(records)}
	response := service.Generate(context.Background(), map[string]any{
		"appId": "tenant-a", "requestId": "req-1", "prompt": "write article",
	})
	if !response.Success() {
		t.Fatalf("expected success: %+v", response.Properties)
	}
	runID, _ := response.Properties["runId"].(string)
	if runID == "" {
		t.Fatal("expected runId in compatible SEO response")
	}
	row, ok := service.store.GetRun(runID)
	if !ok || row["status"] != string(domain.RunSucceeded) {
		t.Fatalf("expected succeeded durable run: %+v", row)
	}
	if row["completed_steps"] != float64(1) && row["completed_steps"] != 1 {
		t.Fatalf("expected one completed inference step: %+v", row)
	}
}

func TestSeoArticleContractRejectsMissingLocale(t *testing.T) {
	service := &AiSeoService{
		cfg: config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaBatchSize: 8192}},
		provider: provider.FuncProvider{
			ProviderName: "fake-local", ModelName: "fake-model", IsAvailable: func() bool { return true },
			CompleteFunc: func(context.Context, string, uint32) (string, error) {
				return `{"title":"VI","content":"<p>Nội dung tiếng Việt đủ dài.</p>"}`, nil
			},
		},
	}
	t.Setenv("AI_SEO_LOCALE_TRANSLATE_FALLBACK_ON_INCOMPLETE", "false")
	response := service.Generate(context.Background(), map[string]any{
		"prompt": "write article", "responseContract": "article",
	})
	if response.Success() || response.Properties["errorCode"] != "REQUIREMENT_COVERAGE_FAILED" {
		t.Fatalf("expected incomplete article rejection: %+v", response.Properties)
	}
}

func TestGenericJSONContractDoesNotRequireSeoFields(t *testing.T) {
	service := &AiSeoService{
		cfg: config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaBatchSize: 8192}},
		provider: provider.FuncProvider{
			ProviderName: "fake-local", ModelName: "fake-model", IsAvailable: func() bool { return true },
			CompleteFunc: func(context.Context, string, uint32) (string, error) {
				return `{"message":"facebook post","hashtags":["#csm"]}`, nil
			},
		},
	}
	response := service.Generate(context.Background(), map[string]any{
		"prompt": "write json", "responseContract": "json",
	})
	if !response.Success() {
		t.Fatalf("expected generic JSON success: %+v", response.Properties)
	}
}

func TestAiSeoOneShotFromAutoLmktContract(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaBatchSize: 8192}}
	fakeProvider := provider.FuncProvider{
		ProviderName: "fake-local", ModelName: "fake-model",
		IsAvailable: func() bool { return true },
		CompleteFunc: func(_ context.Context, prompt string, maxTokens uint32) (string, error) {
			if strings.Contains(prompt, "[SEO_LOCALE_TRANSLATE]") {
				return `{"title_en":"EN title","title_zh":"中文标题","content_en":"<p>English content long enough for validation.</p>","content_zh":"<p>用于验证的中文内容足够长。</p>"}`, nil
			}
			return `{"title":"VI title","description":"Mô tả","content":"<p>Nội dung tiếng Việt đủ dài để kiểm thử.</p>","keywords":"k1","excerpt":"Dẫn nhập"}`, nil
		},
	}
	service := &AiSeoService{cfg: cfg, provider: fakeProvider, verifier: verifier.NewSeoArticle()}
	response := service.Generate(context.Background(), map[string]any{
		"appId": "tenant-a", "requestId": "req-auto-lmkt",
		"mode": "sync", "async": false,
		"seoPipeline":      "anti_ai_one_shot",
		"responseContract": "article",
		"seoContext": map[string]any{
			"industry":  "bat-dong-san",
			"topic":     "Căn hộ Vinhomes Quận 9",
			"domainKey": "lmkt",
			"property":  "Vinhomes Grand Park",
			"location":  "Quận 9",
			"business":  "Bất động sản",
			"seed":      "auto-lmkt-test-seed",
		},
	})
	if !response.Success() {
		t.Fatalf("expected success for auto-lmkt one-shot: %+v", response.Properties)
	}
	data, ok := response.Properties["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object in response: %+v", response.Properties)
	}
	for _, field := range []string{"title", "content", "title_en", "content_en", "title_zh", "content_zh"} {
		if v, ok := data[field].(string); !ok || strings.TrimSpace(v) == "" {
			t.Fatalf("missing field %s in response data: %+v", field, data)
		}
	}
}

func TestSeoRejectsMaxTokenFinishReason(t *testing.T) {
	service := &AiSeoService{
		cfg: config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaBatchSize: 8192}},
		provider: fixedResponseProvider{response: provider.CompletionResponse{
			Text: `{"message":"cut"}`, FinishReason: provider.FinishReasonMaxTokens,
		}},
	}
	response := service.Generate(context.Background(), map[string]any{
		"prompt": "write json", "responseContract": "json",
	})
	if response.Success() {
		t.Fatalf("max_tokens must not return success: %+v", response.Properties)
	}
}
