package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestEffectiveSeoPromptMaxChars(t *testing.T) {
	cfg := config.AppConfig{
		AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 48000, LlamaBatchSize: 8192},
	}
	got := EffectiveSeoPromptMaxChars(cfg)
	if got < 12000 {
		t.Fatalf("expected SEO prompt cap >= 12k when batch=ctx, got %d", got)
	}
	weak := config.AppConfig{
		AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 48000, LlamaBatchSize: 512},
	}
	if gotWeak := EffectiveSeoPromptMaxChars(weak); gotWeak < 8000 {
		t.Fatalf("expected SEO floor 8k on batch-limited tier, got %d", gotWeak)
	}
}

func TestEffectiveSeoArticleMaxTokens(t *testing.T) {
	t.Setenv("AI_SEO_ARTICLE_MAX_TOKENS", "2048")
	cfg := config.AppConfig{}
	if got := EffectiveSeoArticleMaxTokens(cfg); got != 2048 {
		t.Fatalf("got %d want 2048", got)
	}
}

func TestResolveHeuristicCreativeFromSeedDeterministic(t *testing.T) {
	ctx := map[string]any{
		"seed":  "fixed-seed-123",
		"topic": "Căn hộ Vinhomes 2PN Quận 1",
	}
	a := resolveHeuristicCreativeFromContext(ctx)
	b := resolveHeuristicCreativeFromContext(ctx)
	if a.PersonaKey != b.PersonaKey || a.ContentPattern != b.ContentPattern {
		t.Fatalf("creative not deterministic: %+v vs %+v", a, b)
	}
	if a.Hook == "" || a.Angle == "" || a.Tone == "" {
		t.Fatal("expected hook/angle/tone filled")
	}
}

func TestHasRecoverableSeoContent(t *testing.T) {
	ok := hasRecoverableSeoContent(map[string]any{
		"title": "Tiêu đề bài viết SEO",
		"content": "<p>Nội dung HTML đủ dài để xử lý.</p>",
	})
	if !ok {
		t.Fatal("expected recoverable")
	}
	if hasRecoverableSeoContent(map[string]any{"title": "...", "content": "<p>x</p>"}) {
		t.Fatal("ellipsis title should fail")
	}
}

func TestParseSeoArticleMap(t *testing.T) {
	raw := `{"title":"A","content":"<p>B</p>","keywords":["k1"]}`
	data := parseSeoArticleMap(raw)
	if paramString(data, "title", "") != "A" {
		t.Fatalf("parse failed: %+v", data)
	}
}

func TestContainsVietnamese(t *testing.T) {
	if !containsVietnamese("Căn hộ Quận 1") {
		t.Fatal("expected vietnamese diacritics")
	}
	if containsVietnamese("Apartment District 1") {
		t.Fatal("expected no vietnamese")
	}
}

func TestBuildCompactViOnlyArticlePromptNoLocaleKeys(t *testing.T) {
	p := buildCompactViOnlyArticlePrompt("bat-dong-san", "Topic test", "lmkt", seoCreativeParams{
		PersonaKey: "investor", ContentPattern: "landing_page", Hook: "h", Angle: "a", Tone: "t",
	}, map[string]any{})
	if !strings.Contains(p, "KHÔNG có title_en") || !strings.Contains(p, "Topic test") {
		t.Fatalf("unexpected prompt head: %s", p[:min(200, len(p))])
	}
}
