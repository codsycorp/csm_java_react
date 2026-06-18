package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestMaxSafePromptChars8Gb(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaBatchSize: 512}}
	got := MaxSafePromptChars(cfg)
	if got != 512*3 {
		t.Fatalf("expected batch-limited safe chars %d, got %d", 512*3, got)
	}
}

func TestMaxSafePromptCharsBudgetDisabled(t *testing.T) {
	t.Setenv("AI_LOCAL_PROMPT_BUDGET_DISABLED", "true")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaBatchSize: 512}}
	got := MaxSafePromptChars(cfg)
	want := (8192 - 1024 - 768) * 3
	if got != want {
		t.Fatalf("expected context-limited safe chars %d, got %d", want, got)
	}
}

func TestSanitizeLocalInferencePromptStripsBase64(t *testing.T) {
	raw := "hello\n## Ảnh mẫu (base64)\ndata:image/png;base64," + strings.Repeat("A", 5000)
	got := SanitizeLocalInferencePrompt(raw)
	if strings.Contains(got, strings.Repeat("A", 500)) {
		t.Fatal("expected base64 stripped")
	}
	if !strings.Contains(got, "PDF sample images omitted") {
		t.Fatal("expected omission notice")
	}
}

func TestEffectiveLocalPromptCapEditCodeConstrained(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	t.Setenv("AI_LOCAL_PROMPT_BUDGET_DISABLED", "")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 32000}}
	got := EffectiveLocalPromptCap(cfg, "code", "edit")
	if got > 15_000 {
		t.Fatalf("edit code cap too high for 8gb: %d", got)
	}
}

func TestEffectiveLocalPromptCapBudgetDisabled(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	t.Setenv("AI_LOCAL_PROMPT_BUDGET_DISABLED", "true")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 16384, LlamaMaxTokens: 4096, LlamaMaxPromptChars: 500_000, LlamaBatchSize: 4096}}
	got := EffectiveLocalPromptCap(cfg, "code", "edit")
	if got < 10_000 {
		t.Fatalf("expected cap near MaxSafePromptChars when budget disabled, got %d", got)
	}
	if IsConstrained8GbTier(cfg) {
		t.Fatal("budget disabled should not be constrained tier")
	}
}

func TestTruncateMiddlePreservesEnds(t *testing.T) {
	head := strings.Repeat("A", 2000)
	tail := strings.Repeat("Z", 2000)
	mid := strings.Repeat("M", 20_000)
	raw := head + mid + tail
	got := TruncateMiddle(raw, 5000)
	if !strings.HasPrefix(got, "AAA") {
		t.Fatal("missing head")
	}
	if !strings.HasSuffix(got, "ZZZ") {
		t.Fatal("missing tail")
	}
	if !strings.Contains(got, "truncated") {
		t.Fatal("missing marker")
	}
}

func TestMaxOutgoingEditorCharsAnalyze8Gb(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	got := MaxOutgoingEditorChars(config.AppConfig{}, "code", "analyze")
	if got != 12_000 {
		t.Fatalf("got %d want 12000", got)
	}
}

func TestInferResponseModeFromParamsAnalyze(t *testing.T) {
	params := map[string]any{
		"message": "Phân tích code hiện tại đang xử lý những logic gì",
		"contextType": "code",
	}
	if got := inferResponseModeFromParams(params); got != "analyze" {
		t.Fatalf("got %q want analyze", got)
	}
	if cap := maxOutgoingEditorFromParams(params); cap != 12_000 {
		t.Fatalf("cap=%d want 12000", cap)
	}
}

func TestClampPromptForLocalProvider(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 32000}}
	long := strings.Repeat("x", 30_000) + "\n[/USER_REQUEST]\n"
	got := ClampPromptForLocalProvider(cfg, long, "code", "edit")
	if len(got) > 15_000 {
		t.Fatalf("clamped len=%d want <=15000", len(got))
	}
}

func TestEffectiveInferenceMaxTokensEdit8Gb(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	t.Setenv("AI_LOCAL_PROMPT_BUDGET_DISABLED", "")
	t.Setenv("AI_CODE_STREAM_EDIT_MAX_TOKENS", "2048")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 4096, LlamaMaxTokens: 768}}
	got := EffectiveInferenceMaxTokens(cfg, "edit")
	if got != 2048 {
		t.Fatalf("edit on 8gb want 2048 output tok, got %d", got)
	}
	analyze := EffectiveInferenceMaxTokens(cfg, "analyze")
	if analyze != 512 {
		t.Fatalf("analyze on 8gb want 512, got %d", analyze)
	}
}
