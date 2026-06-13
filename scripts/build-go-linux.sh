#!/bin/bash
# Build linux/amd64 csm_go_server on Mac or Linux (CI). No build on production server.
#
# Usage (from repo root):
#   ./scripts/build-go-linux.sh
#   ./scripts/build-go-linux.sh /path/to/csm_go_server
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/csm_go_server}"
GO_DIR="$ROOT/backend-go"

mkdir -p "$(dirname "$OUT")"
cd "$GO_DIR"

export CGO_ENABLED=0
export GOOS=linux
export GOARCH=amd64

echo "[build-go-linux] GOOS=$GOOS GOARCH=$GOARCH → $OUT"
go build -ldflags="-s -w" -trimpath -o "$OUT" ./cmd/server
chmod +x "$OUT"
ls -lh "$OUT"
file "$OUT" || true
