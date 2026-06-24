#!/usr/bin/env bash
# Build Go artifacts for Linux and Windows via Docker (from macOS/Linux).
#
# Output (dist/):
#   csm-go-linux-amd64
#   csm-go-windows-amd64.exe
#
# Usage:
#   ./backend-go/docker-build.sh
#   ./backend-go/docker-build.sh --linux
#   ./backend-go/docker-build.sh --windows
#   ./backend-go/docker-build.sh --llamacpp --linux
#
# Notes:
# - Default builds are pure Go (CGO_ENABLED=0), portable and easy to deploy.
# - --llamacpp requires CGO and currently supports Linux output only.
set -euo pipefail

GO_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$GO_DIR/.." && pwd)"
DIST="${DIST:-$ROOT_DIR/dist}"
BUILD_LINUX=true
BUILD_WINDOWS=true
USE_LLAMACPP=false
NO_CACHE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --linux) BUILD_WINDOWS=false; shift ;;
    --windows) BUILD_LINUX=false; shift ;;
    --llamacpp) USE_LLAMACPP=true; shift ;;
    --no-cache) NO_CACHE="--no-cache"; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

log() { echo "[$(date +'%F %T')] [go-docker-build] $*"; }

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker not installed"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  log "ERROR: Docker daemon not running"
  exit 1
fi

if $USE_LLAMACPP && $BUILD_WINDOWS; then
  log "ERROR: --llamacpp is not supported for Windows cross-build in this script"
  exit 1
fi

mkdir -p "$DIST"

build_linux() {
  if $USE_LLAMACPP; then
    log "Building Linux amd64 with llamacpp (CGO=1)..."
    docker build $NO_CACHE --platform linux/amd64 -f "$GO_DIR/Dockerfile" \
      --build-arg LLAMACPP=1 \
      -t csm-go-builder:llamacpp "$ROOT_DIR"

    docker run --rm --platform linux/amd64 \
      -v "$DIST:/out" \
      csm-go-builder:llamacpp \
      bash -lc 'cp -f /app/csm-go /out/csm-go-linux-amd64 && chmod +x /out/csm-go-linux-amd64'
  else
    log "Building Linux amd64 (pure Go, CGO=0)..."
    docker run --rm --platform linux/amd64 \
      -v "$GO_DIR:/src" -v "$DIST:/out" -w /src \
      golang:1.25-bookworm \
      bash -lc 'go mod download && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o /out/csm-go-linux-amd64 ./cmd/server'
  fi
}

build_windows() {
  log "Building Windows amd64 (pure Go, CGO=0)..."
  docker run --rm --platform linux/amd64 \
    -v "$GO_DIR:/src" -v "$DIST:/out" -w /src \
    golang:1.25-bookworm \
    bash -lc 'go mod download && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o /out/csm-go-windows-amd64.exe ./cmd/server'
}

$BUILD_LINUX && build_linux
$BUILD_WINDOWS && build_windows

log "Done"
ls -lh "$DIST"/csm-go-* 2>/dev/null || true
