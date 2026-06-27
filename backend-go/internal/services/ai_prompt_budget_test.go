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
	if got != 512*3 {
		t.Fatalf("expected batch-limited safe chars %d even when budget disabled, got %d", 512*3, got)
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
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 16384, LlamaMaxTokens: 4096, LlamaMaxPromptChars: 500_000, LlamaBatchSize: 16384}}
	got := EffectiveLocalPromptCap(cfg, "code", "edit")
	want := MaxSafePromptChars(cfg)
	if got != want {
		t.Fatalf("expected context cap %d when batch=ctx, got %d", want, got)
	}
	if IsConstrained8GbTier(cfg) {
		t.Fatal("budget disabled should not be constrained tier")
	}
}

func TestMaxSafePromptCharsLargeBatch(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 16384, LlamaMaxTokens: 4096, LlamaBatchSize: 16384}}
	got := MaxSafePromptChars(cfg)
	if got <= 512*3 {
		t.Fatalf("expected context-based cap > batch-only cap, got %d", got)
	}
}

func TestEffectiveLocalPromptCapMenuJsonEdit(t *testing.T) {
	t.Setenv("AI_LOCAL_PROMPT_BUDGET_DISABLED", "true")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 16384, LlamaMaxTokens: 4096, LlamaMaxPromptChars: 500_000, LlamaBatchSize: 16384}}
	got := EffectiveLocalPromptCap(cfg, "menu_json", "edit")
	want := MaxSafePromptChars(cfg)
	if got != want {
		t.Fatalf("menu_json edit should use full safe cap %d, got %d", want, got)
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
		"message":     "Phân tích code hiện tại đang xử lý những logic gì",
		"contextType": "code",
		"taskType":    "qa",
	}
	if got := inferResponseModeFromParams(params); got != "analyze" {
		t.Fatalf("got %q want analyze", got)
	}
	if cap := maxOutgoingEditorFromParams(params); cap != 12_000 {
		t.Fatalf("cap=%d want 12000", cap)
	}
}

func TestInferResponseModeFromParamsMessageOnlyDoesNotForceAnalyze(t *testing.T) {
	params := map[string]any{
		"message":     "Bạn hãy phân tích giúp tôi",
		"contextType": "code",
	}
	if got := inferResponseModeFromParams(params); got != "edit" {
		t.Fatalf("got %q want edit by context default when no explicit/task signal", got)
	}
}

func TestInferResponseModeFromParamsLegacyPlanFromAutoLMKT(t *testing.T) {
	params := map[string]any{
		"message":      "Lập kế hoạch nội dung video cho chiến dịch mới",
		"contextType":  "business",
		"taskType":     "media_script",
		"responseMode": "plan",
	}
	if got := inferResponseModeFromParams(params); got != "analyze" {
		t.Fatalf("got %q want analyze for legacy plan mode", got)
	}
}

func TestIsConstrained8GbTierM1Dev(t *testing.T) {
	t.Setenv("AI_LOCAL_PROMPT_BUDGET_DISABLED", "")
	t.Setenv("CSM_LOCAL_PROFILE", "m1-16gb")
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "m1-16gb")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaBatchSize: 8192}}
	if IsConstrained8GbTier(cfg) {
		t.Fatal("M1 dev profile should not use 8GB constrained tier")
	}
	editorMax, _, _, _ := ConstrainedPromptSlotCaps(cfg)
	if editorMax < 20_000 {
		t.Fatalf("editor slot too small on M1: %d", editorMax)
	}
}

func TestTruncateMiddlePreservingEditorBlocks(t *testing.T) {
	open := "[ACTIVE_EDITOR_MENU_JSON]\n"
	close := "\n[/ACTIVE_EDITOR_MENU_JSON]"
	menu := strings.Repeat(`{"id":"n","label":"x"},`, 2000)
	prompt := strings.Repeat("SYS", 5000) + open + menu + close + strings.Repeat("USER", 5000)
	got := TruncateMiddlePreservingEditorBlocks(prompt, 12_000)
	if !strings.Contains(got, open) || !strings.Contains(got, close) {
		t.Fatal("editor block tags missing")
	}
	if strings.Contains(got, strings.Repeat("SYS", 4000)) {
		t.Fatal("expected system prefix truncated before editor")
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
	t.Setenv("AI_CODE_STREAM_EDIT_MAX_TOKENS", "4096")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 768}}
	got := EffectiveInferenceMaxTokens(cfg, "edit")
	if got != 4096 {
		t.Fatalf("edit on 8gb want 4096 output tok, got %d", got)
	}
	analyze := EffectiveInferenceMaxTokens(cfg, "analyze")
	if analyze != 512 {
		t.Fatalf("analyze on 8gb want 512, got %d", analyze)
	}
}

func TestEffectiveInferenceMaxTokensPrintImport(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	t.Setenv("AI_CODE_STREAM_PRINT_IMPORT_MAX_TOKENS", "6144")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 768}}
	params := map[string]any{
		"editorMetadata": map[string]any{"source": "LineItemsPdfImport"},
	}
	got := EffectiveInferenceMaxTokensFromParams(cfg, "edit", params)
	if got != 6144 {
		t.Fatalf("print import on 8192 ctx want 6144 output tok, got %d", got)
	}
}

func TestEffectiveLocalPromptCapForPrintImport(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	t.Setenv("AI_CODE_STREAM_PRINT_IMPORT_MAX_TOKENS", "6144")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxPromptChars: 28000}}
	got := EffectiveLocalPromptCapForPrintImport(cfg)
	if got < 4096 || got > 28_000 {
		t.Fatalf("print import prompt cap out of range: %d", got)
	}
}
