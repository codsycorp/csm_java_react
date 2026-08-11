package web

import (
	"net/http/httptest"
	"testing"
)

func TestRedirectCanonicalLocalizedPath_QueryLangToPrefix(t *testing.T) {
	req := httptest.NewRequest("GET", "/cho-thue-xe?hl=en", nil)
	rr := httptest.NewRecorder()

	_, _, redirected := redirectCanonicalLocalizedPath(rr, req, "/cho-thue-xe", "hl=en")
	if !redirected {
		t.Fatal("expected redirect for legacy query lang URL")
	}
	if rr.Code != 301 {
		t.Fatalf("expected 301 status, got %d", rr.Code)
	}
	if loc := rr.Header().Get("Location"); loc != "/en/cho-thue-xe" {
		t.Fatalf("expected /en/cho-thue-xe location, got %q", loc)
	}
}

func TestRedirectCanonicalLocalizedPath_PrefixedPathNormalizedForSSR(t *testing.T) {
	req := httptest.NewRequest("GET", "/en/cho-thue-xe?page=2", nil)
	rr := httptest.NewRecorder()

	uri, query, redirected := redirectCanonicalLocalizedPath(rr, req, "/en/cho-thue-xe", "page=2")
	if redirected {
		t.Fatal("did not expect redirect for already canonical prefixed URL")
	}
	if uri != "/cho-thue-xe" {
		t.Fatalf("expected stripped uri /cho-thue-xe, got %q", uri)
	}
	if query != "page=2&hl=en" {
		t.Fatalf("expected internal query to carry hl=en, got %q", query)
	}
}
