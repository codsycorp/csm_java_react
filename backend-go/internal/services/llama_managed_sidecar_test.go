package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestSidecarHostPortFromURL(t *testing.T) {
	cfg := config.AppConfig{
		AI: config.AIConfig{LlamaServerURL: "http://127.0.0.1:9090/completion"},
	}
	host, port := sidecarHostPort(cfg)
	if host != "127.0.0.1" || port != 9090 {
		t.Fatalf("unexpected host/port: %s:%d", host, port)
	}
}

func TestResolveSidecarBinaryPrefersConfiguredPath(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "llama-server")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := config.AppConfig{
		DataDir: dir,
		AI:      config.AIConfig{LlamaServerBin: bin},
	}
	got, err := resolveSidecarBinary(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if got != bin {
		t.Fatalf("expected %s, got %s", bin, got)
	}
}
