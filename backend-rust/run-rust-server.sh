#!/bin/bash
# CSM Rust backend launcher — mirrors start.sh env loading
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUST_DIR="$(cd "$(dirname "$0")" && pwd)"

config_log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [rust-config] $*"
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

export APP_DATA_DIR="${APP_DATA_DIR:-$ROOT/csm_datas}"
export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$APP_DATA_DIR/database}"
export ROCKSDB_BACKUP_DIR="${ROCKSDB_BACKUP_DIR:-$APP_DATA_DIR/backups}"
export LUCENE_INDEX_ROOT_DIR="${LUCENE_INDEX_ROOT_DIR:-$APP_DATA_DIR/lucene_index}"
export SERVER_PORT="${SERVER_PORT:-9999}"
export SOCKET_SERVER_PORT="${SOCKET_SERVER_PORT:-15301}"
export JWT_SECRET="${JWT_SECRET:-}"

cd "$RUST_DIR"

# rustup installs to ~/.cargo/bin — often missing in IDE terminals until sourced
if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v cargo >/dev/null 2>&1; then
    echo "Rust/Cargo not found in PATH."
    echo "Install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "Then run: source \"\$HOME/.cargo/env\" && ./run-rust-server.sh"
    exit 1
fi

config_log "HTTP port ${SERVER_PORT} (nginx backend_pool expects 9999 in production)"
config_log "Using cargo: $(command -v cargo) ($(cargo --version 2>/dev/null || echo unknown))"
exec cargo run --release
