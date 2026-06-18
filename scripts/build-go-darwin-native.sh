#!/bin/bash
# Build CSM Go backend with in-process llama.cpp on macOS (M1/M2/M3 arm64 or Intel).
#
# Usage:
#   ./scripts/build-go-darwin-native.sh
#   ./scripts/build-go-darwin-native.sh /path/to/csm-server
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$ROOT/backend-go"
OUT="${1:-$GO_DIR/csm-server}"

mkdir -p "$(dirname "$OUT")"
cd "$GO_DIR"

export CGO_ENABLED=1
export GOOS=darwin
export GOARCH="$(go env GOARCH)"

echo "[build-darwin-native] GOOS=$GOOS GOARCH=$GOARCH CGO_ENABLED=1 -tags llamacpp"
"$ROOT/scripts/patch-go-nativeml-chunked-prefill.sh" "$GO_DIR"
go build -tags llamacpp -trimpath -ldflags="-s -w" -o "$OUT" ./cmd/server
go mod edit -dropreplace=github.com/footprintai/go-nativeml 2>/dev/null || true

echo "[build-darwin-native] OK → $OUT"
ls -lh "$OUT"
file "$OUT" || true
