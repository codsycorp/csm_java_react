#!/bin/bash
# Chạy Rust backend trên server production — layout /root/la_server (parity Go).
set -euo pipefail
RUST_DIR="$(cd "$(dirname "$0")" && pwd)"
CSM_HOME="${CSM_HOME:-/root/la_server}"

load_env_file() {
    local file_path="$1"
    if [ -f "$file_path" ]; then
        set -a
        # shellcheck source=/dev/null
        source "$file_path"
        set +a
        return 0
    fi
    return 1
}

load_env_file "$CSM_HOME/config.env" || true
load_env_file "$CSM_HOME/config.local-8gb.env" || true

export CSM_HOME
export APP_DATA_DIR="${APP_DATA_DIR:-$CSM_HOME/csm_datas}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
export CSM_VECTOR_DIR="${CSM_VECTOR_DIR:-$CSM_NATIVE_DATA_DIR/vector/qdrant}"
export CSM_KV_BACKUP_DIR="${CSM_KV_BACKUP_DIR:-$APP_DATA_DIR/backups}"
export LUCENE_INDEX_ROOT_DIR="${LUCENE_INDEX_ROOT_DIR:-$APP_DATA_DIR/lucene_index}"
export SERVER_PORT="${SERVER_PORT:-9999}"
export SOCKET_SERVER_PORT="${SOCKET_SERVER_PORT:-15301}"
export LD_LIBRARY_PATH="${CSM_HOME}/lib:${LD_LIBRARY_PATH:-}"

BIN="${CSM_RUST_BIN:-$CSM_HOME/csm_rust_server}"
if [ ! -x "$BIN" ]; then
    echo "Binary not found: $BIN"
    echo "Deploy: ./docker-build.sh --linux && ./deploy-rust-la-server.sh root@SERVER"
    exit 1
fi

echo "[csm-rust] CSM_HOME=$CSM_HOME"
echo "[csm-rust] APP_DATA_DIR=$APP_DATA_DIR"
echo "[csm-rust] CSM_PEBBLE_ROOT=$CSM_PEBBLE_ROOT"
echo "[csm-rust] CSM_VECTOR_DIR=$CSM_VECTOR_DIR"
echo "[csm-rust] port=$SERVER_PORT"
exec "$BIN"
