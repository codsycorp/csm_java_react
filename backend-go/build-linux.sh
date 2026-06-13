#!/bin/bash
# Cross-compile CSM Go backend for Linux amd64 (pure Go, CGO_ENABLED=0).
#
# Usage:
#   ./build-linux.sh                          → ../dist/csm_go_server
#   ./build-linux.sh /path/to/csm_go_server
set -euo pipefail
GO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$GO_DIR/../dist/csm_go_server}"

mkdir -p "$(dirname "$OUT")"
cd "$GO_DIR"

export CGO_ENABLED=0
export GOOS=linux
export GOARCH=amd64

echo "[build] GOOS=$GOOS GOARCH=$GOARCH CGO_ENABLED=$CGO_ENABLED (no native AI — use build-linux-native.sh)"
go build -ldflags="-s -w" -trimpath -o "$OUT" ./cmd/server

echo "[build] OK → $OUT"
ls -lh "$OUT"
file "$OUT" || true
