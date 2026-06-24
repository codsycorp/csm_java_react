#!/usr/bin/env bash
# Build Go artifacts for Linux and Windows via Docker (from macOS/Linux).
#
# Output (dist/):
#   csm-go-linux-amd64
#   csm-go-linux-arm64
#   csm-go-windows-amd64.exe
#
# Usage:
#   ./backend-go/docker-build.sh
#   ./backend-go/docker-build.sh --linux
#   ./backend-go/docker-build.sh --windows
#   ./backend-go/docker-build.sh --linux-arch arm64
#   ./backend-go/docker-build.sh --llamacpp --linux
#
# Notes:
# - Default builds are pure Go (CGO_ENABLED=0), portable and easy to deploy.
# - --llamacpp requires CGO and currently supports Linux amd64 output only.
set -euo pipefail

GO_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$GO_DIR/.." && pwd)"
DIST="${DIST:-$ROOT_DIR/dist}"
BUILD_LINUX=true
BUILD_WINDOWS=true
LINUX_ARCHES="amd64 arm64"
USE_LLAMACPP=false
NO_CACHE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --linux) BUILD_WINDOWS=false; shift ;;
    --windows) BUILD_LINUX=false; shift ;;
    --linux-arch)
      case "${2:-}" in
        amd64|arm64|both)
          if [[ "$2" == "both" ]]; then
            LINUX_ARCHES="amd64 arm64"
          else
            LINUX_ARCHES="$2"
          fi
          shift 2
          ;;
        *)
          echo "Invalid value for --linux-arch. Use: amd64 | arm64 | both" >&2
          exit 1
          ;;
      esac
      ;;
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

if $USE_LLAMACPP && [[ "$LINUX_ARCHES" == *"arm64"* ]]; then
  log "ERROR: --llamacpp currently supports only linux/amd64 in this script"
  exit 1
fi

mkdir -p "$DIST"

build_linux_one() {
  local arch="$1"
  local platform="linux/$arch"

  if $USE_LLAMACPP; then
    log "Building Linux $arch with llamacpp (CGO=1)..."
    docker build $NO_CACHE --platform linux/amd64 -f "$GO_DIR/Dockerfile" \
      --build-arg LLAMACPP=1 \
      -t csm-go-builder:llamacpp "$ROOT_DIR"

    docker run --rm --platform linux/amd64 \
      -v "$DIST:/out" \
      csm-go-builder:llamacpp \
      bash -lc "cp -f /app/csm-go /out/csm-go-linux-$arch && chmod +x /out/csm-go-linux-$arch"
  else
    log "Building Linux $arch (pure Go, CGO=0)..."
    docker run --rm --platform "$platform" \
      -v "$GO_DIR:/src" -v "$DIST:/out" -w /src \
      golang:1.25-bookworm \
      bash -lc "go mod download && CGO_ENABLED=0 GOOS=linux GOARCH=$arch go build -ldflags='-s -w' -trimpath -o /out/csm-go-linux-$arch ./cmd/server"
  fi
}

build_linux() {
  local arch
  for arch in $LINUX_ARCHES; do
    build_linux_one "$arch"
  done
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
