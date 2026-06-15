#!/bin/bash
# Quick compile check before deploy (Mac/Linux dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$ROOT/backend-go"
cd "$GO_DIR"

echo "[verify-go-build] module download..."
go mod download

echo "[verify-go-build] CGO=0 smoke (dev local)..."
CGO_ENABLED=0 go build -o /tmp/csm_go_verify ./cmd/server
rm -f /tmp/csm_go_verify
echo "[verify-go-build] OK — safe to deploy (server build uses -tags llamacpp + CGO)"
