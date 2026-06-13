package data

import "testing"

func TestBuildFTSMatchQuery(t *testing.T) {
	got := buildFTSMatchQuery([]string{"%Nguyen%", "test"})
	if got != `"Nguyen"* AND "test"*` {
		t.Fatalf("unexpected query: %q", got)
	}
}

func TestExtractSearchText(t *testing.T) {
	title, content := ExtractSearchText(map[string]any{
		"name":  "Nguyen Van A",
		"email": "a@test.com",
		"note":  "hello",
	})
	if title != "Nguyen Van A" {
		t.Fatalf("title=%q", title)
	}
	if content == "" {
		t.Fatal("expected content")
	}
}
