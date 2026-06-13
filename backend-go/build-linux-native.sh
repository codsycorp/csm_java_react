#!/bin/bash
# Build CSM Go backend with in-process llama.cpp (CGO + -tags llamacpp).
#
# Production (Ubuntu 20.04): use ../scripts/build-go-linux-native.sh (Docker + glibc 2.31).
# Dev on Linux 22.04+: run this script directly.
#   ./build-linux-native.sh                    → ../dist/csm_go_server
#   ./build-linux-native.sh /path/to/binary
set -euo pipefail
GO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$GO_DIR/../dist/csm_go_server}"

mkdir -p "$(dirname "$OUT")"
cd "$GO_DIR"

export CGO_ENABLED=1
export GOOS="${GOOS:-linux}"
export GOARCH="${GOARCH:-amd64}"

echo "[build-native] GOOS=$GOOS GOARCH=$GOARCH CGO_ENABLED=1 -tags llamacpp"
go build -tags llamacpp -ldflags="-s -w" -trimpath -o "$OUT" ./cmd/server

echo "[build-native] OK → $OUT"
ls -lh "$OUT"
file "$OUT" || true
