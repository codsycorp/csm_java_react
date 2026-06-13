package web

import "testing"

func TestNormalizeTableName(t *testing.T) {
	if got := normalizeTableName("wuweb", "wuweb.web_services"); got != "web_services" {
		t.Fatalf("expected web_services, got %q", got)
	}
	if got := normalizeTableName("lmkt", "web_services"); got != "web_services" {
		t.Fatalf("expected web_services, got %q", got)
	}
	if got := normalizeTableName("csm", "web.web_services"); got != "web_services" {
		t.Fatalf("expected web_services, got %q", got)
	}
}
