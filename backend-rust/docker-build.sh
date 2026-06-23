#!/usr/bin/env bash
# Build deploy packages for Linux + Windows via Docker (from macOS/Linux).
#
# Output (dist/):
#   csm-rust-linux-amd64.tar.gz   — binary + lib/ + systemd scripts + local-ai
#   csm-rust-windows-amd64.zip    — exe + MinGW DLLs + NSSM bat scripts
#
# Usage:
#   ./docker-build.sh              # build both
#   ./docker-build.sh --linux
#   ./docker-build.sh --windows
#   ./docker-build.sh --linux --no-cache
#
# Requires: Docker Desktop running
set -euo pipefail

RUST_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="${DIST:-$RUST_DIR/../dist}"
BUILD_LINUX=true
BUILD_WINDOWS=true
NO_CACHE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --linux) BUILD_WINDOWS=false; shift ;;
    --windows) BUILD_LINUX=false; shift ;;
    --no-cache) NO_CACHE="--no-cache"; shift ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown: $1" >&2
      exit 1
      ;;
  esac
done

log() { echo "[$(date +'%F %T')] [docker-build] $*"; }

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker not installed"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  log "ERROR: Docker daemon not running — start Docker Desktop"
  exit 1
fi

mkdir -p "$DIST"
chmod +x "$RUST_DIR/docker/"*.sh "$RUST_DIR/deploy/linux/"*.sh 2>/dev/null || true

build_one() {
  local platform="$1"
  local dockerfile="$RUST_DIR/docker/Dockerfile.$platform"
  local tag="csm-rust-builder:$platform"
  local docker_platform="linux/amd64"

  log "Building image $tag (platform=$docker_platform) ..."
  docker build $NO_CACHE --platform "$docker_platform" -f "$dockerfile" -t "$tag" "$RUST_DIR"

  log "Packaging $platform → $DIST"
  docker run --rm --platform "$docker_platform" \
    -e DIST=/dist \
    -v "$DIST:/dist" \
    "$tag"
}

if $BUILD_LINUX; then
  build_one linux
fi

if $BUILD_WINDOWS; then
  build_one windows
fi

log ""
log "=== Done ==="
ls -lh "$DIST"/csm-rust-* 2>/dev/null || true
log ""
log "Linux deploy:"
log "  scp dist/csm-rust-linux-amd64.tar.gz server:/root/"
log "  ssh server 'tar xzf csm-rust-linux-amd64.tar.gz && cd csm-rust-linux-amd64 && sudo ./install-csm-rust-service.sh'"
log ""
log "Windows deploy:"
log "  Copy dist/csm-rust-windows-amd64.zip → server, unzip"
log "  Add nssm.exe + config.env + csm_datas\\"
log "  Admin CMD: check-windows-runtime.bat && install-csm-rust-service.bat"
