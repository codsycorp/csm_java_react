package web

import (
	"strings"
	"testing"
)

func TestInjectSSRVisibleBody_UsesAnchorWhenPresent(t *testing.T) {
	html := `<!doctype html><html><body><noscript>x</noscript><!-- SSR_CONTENT_ANCHOR --><div id="root"></div></body></html>`
	injectSSRVisibleBody(&html, `<main id="ssr-content">A</main>`)

	if strings.Contains(html, "SSR_CONTENT_ANCHOR") {
		t.Fatalf("anchor placeholder should be replaced")
	}
	if !strings.Contains(html, `<main id="ssr-content">A</main><div id="root">`) {
		t.Fatalf("expected content injected at anchor before root, got: %s", html)
	}
}

func TestInjectSSRVisibleBody_FallsBackBeforeRoot(t *testing.T) {
	html := `<!doctype html><html><body><div class="x"></div><div id="root"></div></body></html>`
	injectSSRVisibleBody(&html, `<main id="ssr-content">B</main>`)

	idxContent := strings.Index(html, `<main id="ssr-content">B</main>`)
	idxRoot := strings.Index(html, `<div id="root">`)
	if idxContent < 0 || idxRoot < 0 || idxContent > idxRoot {
		t.Fatalf("expected content before root, got: %s", html)
	}
}

func TestHasVisibleSEOContent_DataDrivenEligibility(t *testing.T) {
	if hasVisibleSEOContent(map[string]any{}) {
		t.Fatal("expected empty initial data to be ineligible")
	}
	if hasVisibleSEOContent(map[string]any{"pageTitle": "Home"}) {
		t.Fatal("expected meta-only initial data to be ineligible")
	}
	if !hasVisibleSEOContent(map[string]any{"serviceCategory": map[string]any{"slug": "phan-mem"}}) {
		t.Fatal("expected serviceCategory data to be eligible")
	}
	if !hasVisibleSEOContent(map[string]any{"serviceDetailList": []any{map[string]any{"id": "1"}}}) {
		t.Fatal("expected serviceDetailList data to be eligible")
	}
}

func TestBuildSSRVisibleBodyHTML_RequiresBodyText(t *testing.T) {
	html := buildSSRVisibleBodyHTML(&preprocessCtx{
		Title:       "Admin",
		Description: "Dashboard",
		InitialData: map[string]any{},
	})
	if html != "" {
		t.Fatalf("expected empty visible body when no page/service content exists, got: %s", html)
	}
}
