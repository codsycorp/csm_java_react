package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestMaxSafePromptChars8Gb(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024}}
	got := MaxSafePromptChars(cfg)
	if got > 20_000 || got < 10_000 {
		t.Fatalf("expected ~18k safe chars for 8gb ctx, got %d", got)
	}
}

func TestEffectiveLocalPromptCapEditCodeConstrained(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 32000}}
	got := EffectiveLocalPromptCap(cfg, "code", "edit")
	if got > 15_000 {
		t.Fatalf("edit code cap too high for 8gb: %d", got)
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

func TestClampPromptForLocalProvider(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	cfg := config.AppConfig{AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 32000}}
	long := strings.Repeat("x", 30_000) + "\n[/USER_REQUEST]\n"
	got := ClampPromptForLocalProvider(cfg, long, "code", "edit")
	if len(got) > 15_000 {
		t.Fatalf("clamped len=%d want <=15000", len(got))
	}
}
