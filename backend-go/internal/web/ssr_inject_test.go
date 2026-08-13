package web

import (
	"strings"
	"testing"
)

func TestInjectSSRVisibleBody_SkipsReactRootEvenWhenAnchorExists(t *testing.T) {
	html := `<!doctype html><html><body><noscript>x</noscript><!-- SSR_CONTENT_ANCHOR --><div id="root"></div></body></html>`
	injectSSRVisibleBody(&html, `<main id="ssr-content">A</main>`)

	if strings.Contains(html, `<main id="ssr-content">A</main>`) {
		t.Fatalf("React shell must not receive an external SSR body, got: %s", html)
	}
	if !strings.Contains(html, "<!-- SSR_CONTENT_ANCHOR -->") {
		t.Fatalf("React shell anchor should remain untouched, got: %s", html)
	}
}

func TestInjectSSRVisibleBody_SkipsReactRootWithoutAnchor(t *testing.T) {
	html := `<!doctype html><html><body><div class="x"></div><div id="root"></div></body></html>`
	injectSSRVisibleBody(&html, `<main id="ssr-content">B</main>`)

	if strings.Contains(html, `<main id="ssr-content">B</main>`) {
		t.Fatalf("React shell must not receive an external SSR body, got: %s", html)
	}
}

func TestInjectSSRVisibleBody_UsesAnchorWithoutReactRoot(t *testing.T) {
	html := `<!doctype html><html><body><!-- SSR_CONTENT_ANCHOR --></body></html>`
	injectSSRVisibleBody(&html, `<main id="ssr-content">C</main>`)

	if !strings.Contains(html, `<main id="ssr-content">C</main>`) {
		t.Fatalf("expected non-React shell anchor to receive SSR body, got: %s", html)
	}
}

func TestShouldInjectSSRVisibleBody_UsesSSRPageData(t *testing.T) {
	if shouldInjectSSRVisibleBody(map[string]any{
		"serviceCategory": map[string]any{"slug": "custom-category"},
	}) {
		t.Fatal("expected a React-managed category landing to skip the external SSR body")
	}
	if shouldInjectSSRVisibleBody(map[string]any{"isSpecialPage": true}) {
		t.Fatal("expected a CMS-marked special page to skip the external SSR body")
	}
	if !shouldInjectSSRVisibleBody(map[string]any{
		"serviceCategory": map[string]any{"slug": "custom-category"},
		"serviceDetail":   map[string]any{"slug": "article"},
	}) {
		t.Fatal("expected service detail pages to retain their visible SSR body")
	}
	if !shouldInjectSSRVisibleBody(nil) {
		t.Fatal("expected pages without service data to retain their visible SSR body")
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

func TestBuildSSRVisibleBodyHTML_UsesHomeCMSContent(t *testing.T) {
	html := buildSSRVisibleBodyHTML(&preprocessCtx{
		Title:       "Trang chu",
		Description: "Mo ta",
		InitialData: map[string]any{
			"homeDetailList": []any{
				map[string]any{"slug": "san-pham", "content": "Khong dung cho trang chu"},
				map[string]any{"slug": "home", "content": "<p>Noi dung CMS trang chu</p>"},
			},
		},
	})

	if !strings.Contains(html, "Noi dung CMS trang chu") {
		t.Fatalf("expected homepage CMS content in SSR body, got: %s", html)
	}
	if strings.Contains(html, "Khong dung cho trang chu") {
		t.Fatalf("expected only the home CMS entry in SSR body, got: %s", html)
	}
}
