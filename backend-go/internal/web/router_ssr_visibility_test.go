package web

import (
	"net/http/httptest"
	"testing"
)

func TestShouldInjectVisibleSSRBody_DefaultsToHTMLFirst(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36")
	if !shouldInjectVisibleSSRBody(req, "") {
		t.Fatal("expected normal browser UA to receive visible SSR content")
	}

	reqWithoutUA := httptest.NewRequest("GET", "/", nil)
	if !shouldInjectVisibleSSRBody(reqWithoutUA, "") {
		t.Fatal("expected requests without a user agent to receive visible SSR content")
	}
}

func TestShouldInjectVisibleSSRBody_QueryOverrideWins(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh) Chrome/138.0 Safari/537.36")

	if !shouldInjectVisibleSSRBody(req, "ssr_visible=1") {
		t.Fatal("expected ssr_visible=1 to force injection")
	}
	if shouldInjectVisibleSSRBody(req, "ssr_visible=0") {
		t.Fatal("expected ssr_visible=0 to force disable injection")
	}
}
