package web

import (
	"strings"
	"testing"
)

func TestNormalizeSSRCacheQuery_DropsTrackingAndSorts(t *testing.T) {
	got := normalizeSSRCacheQuery("utm_source=google&page=2&hl=vi&fbclid=abc&q=nha%20dep")
	want := "hl=vi&page=2&q=nha+dep"
	if got != want {
		t.Fatalf("normalizeSSRCacheQuery mismatch\nwant: %s\ngot:  %s", want, got)
	}
}

func TestIsSafeSSRCacheQuery(t *testing.T) {
	if !isSafeSSRCacheQuery("__host=localhost:3333&hl=vi") {
		t.Fatal("expected host/lang-only query to be safe for cache")
	}
	if isSafeSSRCacheQuery("hl=vi&page=2") {
		t.Fatal("expected pagination query to be unsafe for full-page SSR cache")
	}
}

func TestNormalizeMetaText_StripsTagsAndLimitsLength(t *testing.T) {
	raw := "<p>  Xin chao <strong>the gioi</strong>  </p>"
	got := normalizeMetaText(raw, 20)
	if got != "Xin chao the gioi" {
		t.Fatalf("unexpected normalizeMetaText result: %q", got)
	}
}

func TestMetaFallback_UsesTitleWhenDescriptionEmpty(t *testing.T) {
	title := normalizeMetaText("Cho thue xe gia re", 120)
	desc := firstNonEmpty(
		normalizeMetaText("", 220),
		normalizeMetaText("", 220),
		normalizeMetaText(title, 220),
		"Noi dung dang duoc cap nhat.",
	)
	if desc != title {
		t.Fatalf("expected fallback description from title, got %q", desc)
	}
}

func TestShouldUseDetailSlugPrefixFallback(t *testing.T) {
	if !shouldUseDetailSlugPrefixFallback("slug-ngan") {
		t.Fatal("expected short slug to allow prefix fallback")
	}
	longSlug := "dich-vu-viet-tool-theo-yeu-cau-tu-dong-hoa-quy-trinh-but-pha-doanh-thu-2026"
	if shouldUseDetailSlugPrefixFallback(longSlug) {
		t.Fatal("expected very long slug to skip prefix fallback")
	}
}

func TestShouldUseSSRListingFastPath(t *testing.T) {
	if !shouldUseSSRListingFastPath(map[string]string{"hl": "vi"}, 1, "") {
		t.Fatal("expected first page without filters to use fast path")
	}
	if shouldUseSSRListingFastPath(map[string]string{"q": "can-ho"}, 1, "") {
		t.Fatal("expected search query to disable fast path")
	}
	if shouldUseSSRListingFastPath(map[string]string{"hl": "vi"}, 2, "") {
		t.Fatal("expected page > 1 to disable fast path")
	}
	if shouldUseSSRListingFastPath(map[string]string{"hl": "vi"}, 1, "abc123") {
		t.Fatal("expected cursor pagination to disable fast path")
	}
}

func TestRouterDomainMatches(t *testing.T) {
	if !routerDomainMatches("h-holding.vn,h-holding.com.vn,localhost:3333", "h-holding.vn") {
		t.Fatal("expected alias list to match h-holding.vn")
	}
	if !routerDomainMatches("www.h-holding.com.vn", "h-holding.com.vn") {
		t.Fatal("expected www prefix to be ignored")
	}
	if routerDomainMatches("h-holding.com.vn", "h-holding.vn") {
		t.Fatal("expected different apex domains to not match")
	}
}

func TestApplyServiceCategorySeoOverrides(t *testing.T) {
	cat := map[string]any{
		"category":    "Tin trong chuyên mục",
		"description": "Mo ta category",
		"keywords":    "kw-cat",
		"seo_meta":    `{"vi":{"meta_title":"Tieu de SEO","meta_description":"Mo ta SEO","keywords":"kw-seo","canonical":"https://example.com/tin-trong","og_image":"https://example.com/og-cat.png"}}`,
	}
	title, desc, keywords, canonical, image := applyServiceCategorySeoOverrides(cat, "vi", "Base title", "Base desc", "Base kw", "https://example.com/base", "https://example.com/base.png")
	if title != "Tieu de SEO" {
		t.Fatalf("title = %q", title)
	}
	if desc != "Mo ta SEO" {
		t.Fatalf("description = %q", desc)
	}
	if keywords != "kw-seo" {
		t.Fatalf("keywords = %q", keywords)
	}
	if canonical != "https://example.com/tin-trong" {
		t.Fatalf("canonical = %q", canonical)
	}
	if image != "https://example.com/og-cat.png" {
		t.Fatalf("image = %q", image)
	}
}

func TestApplyServiceCategorySeoOverrides_IgnoresNonViSeoMeta(t *testing.T) {
	cat := map[string]any{
		"category": "Tin trong chuyên mục",
		"seo_meta": `{"en":{"meta_title":"English title","meta_description":"English desc","keywords":"en-kw","canonical":"https://example.com/en","og_image":"https://example.com/en.png"}}`,
	}
	title, desc, keywords, canonical, image := applyServiceCategorySeoOverrides(cat, "en", "Base title", "Base desc", "Base kw", "https://example.com/base", "https://example.com/base.png")
	if title != "Tin trong chuyên mục" {
		t.Fatalf("title = %q", title)
	}
	if desc != "Base desc" {
		t.Fatalf("description = %q", desc)
	}
	if keywords != "Base kw" {
		t.Fatalf("keywords = %q", keywords)
	}
	if canonical != "https://example.com/base" {
		t.Fatalf("canonical = %q", canonical)
	}
	if image != "https://example.com/base.png" {
		t.Fatalf("image = %q", image)
	}
}

func TestShouldApplyServiceCategorySeoOverrides(t *testing.T) {
	if !shouldApplyServiceCategorySeoOverrides(map[string]any{
		"serviceCategory": map[string]any{"category": "Tin"},
	}) {
		t.Fatal("expected category SEO to apply when detail is absent")
	}
	if shouldApplyServiceCategorySeoOverrides(map[string]any{
		"serviceCategory": map[string]any{"category": "Tin"},
		"serviceDetail":   map[string]any{"title": "Chi tiet"},
	}) {
		t.Fatal("expected category SEO to skip detail pages")
	}
}

func TestBuildSSRResourceHints(t *testing.T) {
	hints := buildSSRResourceHints("https://cdn.example.com/img/cover.jpg", "G-ABC123")
	if !strings.Contains(hints, `dns-prefetch" href="//cdn.example.com`) {
		t.Fatalf("missing dns-prefetch for og image host: %q", hints)
	}
	if !strings.Contains(hints, `preconnect" href="https://www.googletagmanager.com`) {
		t.Fatalf("missing preconnect for gtag host: %q", hints)
	}
}

func TestExtractHostFromAbsoluteURL(t *testing.T) {
	if got := extractHostFromAbsoluteURL("https://cdn.example.com/path/file.jpg?x=1"); got != "cdn.example.com" {
		t.Fatalf("unexpected host: %q", got)
	}
	if got := extractHostFromAbsoluteURL("/relative/path.jpg"); got != "" {
		t.Fatalf("expected empty host for relative path, got %q", got)
	}
}
