package web

import "testing"

func TestFilterListingRowsForSEO_ServiceTypeDomainStatus(t *testing.T) {
	listing := map[string]any{
		"service_type": "thong-ke-ket-qua-xo-so",
		"domain":       "example.com",
	}
	rows := []any{
		map[string]any{"id": "1", "service_type": "thong-ke-ket-qua-xo-so", "domain": "example.com", "status": "active", "slug": "ok-1"},
		map[string]any{"id": "2", "service_type": "thong-ke-ket-qua-xo-so", "domain": "example.com", "status": "draft", "slug": "bad-status"},
		map[string]any{"id": "3", "service_type": "landing-ai-giam-sat-giao-thong-realtime", "domain": "example.com", "status": "active", "slug": "bad-service"},
		map[string]any{"id": "4", "service_type": "thong-ke-ket-qua-xo-so", "domain": "other.com", "status": "active", "slug": "bad-domain"},
		map[string]any{"id": "1", "service_type": "thong-ke-ket-qua-xo-so", "domain": "example.com", "status": "active", "slug": "dup-id"},
	}

	got := filterListingRowsForSEO(listing, rows, "example.com")
	if len(got) != 1 {
		t.Fatalf("expected 1 valid row, got %d", len(got))
	}
	row, ok := got[0].(map[string]any)
	if !ok {
		t.Fatalf("unexpected row type %T", got[0])
	}
	if id := recordStr(row, "id"); id != "1" {
		t.Fatalf("expected id=1, got %q", id)
	}
}

func TestFilterListingRowsForSEO_DomainFallbackToHost(t *testing.T) {
	listing := map[string]any{
		"service_type": "kqxs",
	}
	rows := []any{
		map[string]any{"id": "1", "service_type": "kqxs", "domain": "www.example.com", "status": "active", "slug": "ok"},
		map[string]any{"id": "2", "service_type": "kqxs", "domain": "another.com", "status": "active", "slug": "bad"},
	}

	got := filterListingRowsForSEO(listing, rows, "example.com:443")
	if len(got) != 1 {
		t.Fatalf("expected 1 valid row by host fallback, got %d", len(got))
	}
	row := got[0].(map[string]any)
	if slug := recordStr(row, "slug"); slug != "ok" {
		t.Fatalf("expected slug ok, got %q", slug)
	}
}
