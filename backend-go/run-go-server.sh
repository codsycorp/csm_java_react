#!/bin/bash
# CSM Go backend launcher — mirrors run-rust-server.sh env loading
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$(cd "$(dirname "$0")" && pwd)"

config_log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [go-config] $*"
}

load_env_file() {
    local file_path="$1"
    if [ -f "$file_path" ]; then
        set -a
        # shellcheck source=/dev/null
        source "$file_path"
        set +a
        config_log "Loaded $(basename "$file_path")"
        return 0
    fi
    return 1
}

PROFILE="${CSM_LOCAL_PROFILE:-8gb}"
load_env_file "$ROOT/config.env" || config_log "config.env not found"
case "$PROFILE" in
    strong|local-strong) load_env_file "$ROOT/config.local-strong.env" || true ;;
    8gb|7b|local-8gb) load_env_file "$ROOT/config.local-8gb.env" || true ;;
esac

export APP_DATA_DIR="${APP_DATA_DIR:-$ROOT/backend/csm_datas}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
export CSM_SEARCH_DB_PATH="${CSM_SEARCH_DB_PATH:-$CSM_NATIVE_DATA_DIR/search/vectors.db}"
export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$APP_DATA_DIR/database}"
export SERVER_PORT="${SERVER_PORT:-9999}"
export SOCKET_SERVER_PORT="${SOCKET_SERVER_PORT:-15301}"
export JWT_SECRET="${JWT_SECRET:-}"

cd "$GO_DIR"

if ! command -v go >/dev/null 2>&1; then
    echo "Go not found in PATH. Install Go 1.22+ from https://go.dev/dl/"
    exit 1
fi

config_log "HTTP port ${SERVER_PORT}"
config_log "Pebble root ${CSM_PEBBLE_ROOT}/{app_id}/{table_name}/ (pure Go — no RocksDB/CGO)"
config_log "Data dir ${APP_DATA_DIR}"
config_log "Using go: $(command -v go) ($(go version 2>/dev/null || echo unknown))"

export CGO_ENABLED=0
go run ./cmd/server
