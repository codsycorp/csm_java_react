package web

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPreferredEncoding(t *testing.T) {
	if got := preferredEncoding("gzip, br"); got != "br" {
		t.Fatalf("preferredEncoding br priority = %q", got)
	}
	if got := preferredEncoding("gzip;q=1, br;q=0"); got != "gzip" {
		t.Fatalf("preferredEncoding fallback gzip = %q", got)
	}
	if got := preferredEncoding("identity"); got != "" {
		t.Fatalf("preferredEncoding identity should be empty, got %q", got)
	}
}

func TestStaticCacheControlImmutableForHashedAssets(t *testing.T) {
	path := "/var/www/public/web/assets/index.D3u45W_A.js"
	got := staticCacheControl(path)
	if got != "public, max-age=31536000, immutable" {
		t.Fatalf("staticCacheControl immutable mismatch: %q", got)
	}
}

func TestReadStaticCandidatePrefersBrotli(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "app.js")
	if err := os.WriteFile(base, []byte("console.log('plain')"), 0o644); err != nil {
		t.Fatalf("write base: %v", err)
	}
	if err := os.WriteFile(base+".br", []byte("brotli-bytes"), 0o644); err != nil {
		t.Fatalf("write br: %v", err)
	}
	if err := os.WriteFile(base+".gz", []byte("gzip-bytes"), 0o644); err != nil {
		t.Fatalf("write gz: %v", err)
	}

	data, source, enc, ok := readStaticCandidate(base, "gzip, br")
	if !ok {
		t.Fatal("expected candidate to be readable")
	}
	if source != base {
		t.Fatalf("source path mismatch: %q", source)
	}
	if enc != "br" {
		t.Fatalf("expected br encoding, got %q", enc)
	}
	if string(data) != "brotli-bytes" {
		t.Fatalf("unexpected brotli payload: %q", string(data))
	}
}
