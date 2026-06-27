#!/bin/bash
# Build CSM Go backend for Linux amd64 inside Docker, then optionally deploy.
#
# Usage:
#   ./build-linux.sh                          → ../dist/csm_go_server
#   ./build-linux.sh /path/to/csm_go_server
# Optional auto deploy (after successful build):
#   DEPLOY_SERVER=root@1.2.3.4 ./build-linux.sh
#   DEPLOY_SERVER=root@1.2.3.4 DEPLOY_PATH=/root/la_server DEPLOY_SERVICE=csm-go ./build-linux.sh
# Build variants:
#   BUILD_VARIANT=native  → local AI enabled, requires llamacpp binary build (default)
#   BUILD_VARIANT=pure    → smaller pure-Go binary, local AI unavailable
set -euo pipefail
GO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$GO_DIR/../dist/csm_go_server}"
OUT_BIN="$(basename "$OUT")"
DEPLOY_SERVER="${DEPLOY_SERVER:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/la_server}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-csm-go}"
DEPLOY_BIN="${DEPLOY_BIN:-csm_go_server}"
SCP_FLAGS="${SCP_FLAGS:--O}"
BUILD_IMAGE="${BUILD_IMAGE:-golang:1.25-bookworm}"
BUILD_PLATFORM="${BUILD_PLATFORM:-linux/amd64}"
BUILD_VARIANT="${BUILD_VARIANT:-native}"

log() { echo "[$(date +'%F %T')] [go-build-linux] $*"; }

if [[ -n "$DEPLOY_SERVER" && "$OUT" == /* && "$OUT" != "$GO_DIR"/* ]]; then
	OUT="$GO_DIR/../dist/$OUT_BIN"
	log "Deploy mode: using local build output $OUT"
fi

OUT_DIR_RAW="$(dirname "$OUT")"
if [[ "$OUT_DIR_RAW" != /* ]]; then
	OUT_DIR_RAW="$GO_DIR/$OUT_DIR_RAW"
fi
mkdir -p "$OUT_DIR_RAW"
OUT_DIR="$(cd "$OUT_DIR_RAW" && pwd)"
cd "$GO_DIR"

if [[ "$BUILD_VARIANT" == "pure" ]]; then
	if ! command -v docker >/dev/null 2>&1; then
		log "ERROR: docker not installed"
		exit 1
	fi
	if ! docker info >/dev/null 2>&1; then
		log "ERROR: Docker daemon not running"
		exit 1
	fi
	log "Building pure-Go binary in Docker image=$BUILD_IMAGE platform=$BUILD_PLATFORM"
	docker run --rm --platform "$BUILD_PLATFORM" \
		-v "$GO_DIR:/src" -v "$OUT_DIR:/out" -w /src \
		"$BUILD_IMAGE" \
		sh -lc 'export PATH=/usr/local/go/bin:/go/bin:$PATH; go version; go mod download && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o "/out/'"$OUT_BIN"'" ./cmd/server'
	log "Build variant: pure-Go (local AI disabled)"
else
	log "Building native local-AI binary via scripts/build-go-linux-native.sh"
	"$GO_DIR/../scripts/build-go-linux-native.sh" "$OUT"
	log "Build variant: native (llamacpp enabled when runtime config/model are ready)"
fi

log "Build OK → $OUT"
ls -lh "$OUT"
file "$OUT" || true

if [[ -n "$DEPLOY_SERVER" ]]; then
	log "Deploy target: $DEPLOY_SERVER"
	log "Deploy path  : $DEPLOY_PATH"
	command -v ssh >/dev/null 2>&1 || { echo "[deploy] ERROR: ssh not found"; exit 1; }
	command -v scp >/dev/null 2>&1 || { echo "[deploy] ERROR: scp not found"; exit 1; }

	ssh "$DEPLOY_SERVER" "systemctl stop '$DEPLOY_SERVICE'"
	ssh "$DEPLOY_SERVER" "mkdir -p '$DEPLOY_PATH'"
	# Use legacy scp mode by default for servers that do not like the SFTP-based default.
	scp $SCP_FLAGS "$OUT" "$DEPLOY_SERVER:$DEPLOY_PATH/$DEPLOY_BIN"

	ssh "$DEPLOY_SERVER" "chmod +x '$DEPLOY_PATH/$DEPLOY_BIN' && systemctl daemon-reload && systemctl start '$DEPLOY_SERVICE' && systemctl --no-pager --full status '$DEPLOY_SERVICE' | head -20"
	log "Deploy done"
fi
