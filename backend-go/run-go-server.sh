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

PROFILE="${CSM_LOCAL_PROFILE:-}"
if [ -z "$PROFILE" ]; then
    case "$(uname -s)" in
        Darwin) PROFILE="m1" ;;
        *) PROFILE="8gb" ;;
    esac
fi

load_env_file "$ROOT/config.env" || config_log "config.env not found"
case "$PROFILE" in
    m1|m1-16gb|local-m1) load_env_file "$ROOT/config.local-m1.env" || true ;;
    strong|local-strong) load_env_file "$ROOT/config.local-strong.env" || true ;;
    8gb|7b|local-8gb|*) load_env_file "$ROOT/config.local-8gb.env" || true ;;
esac

export CSM_HOME="${CSM_HOME:-$ROOT/backend}"
export APP_DATA_DIR="${APP_DATA_DIR:-$CSM_HOME/csm_datas}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
export CSM_SEARCH_DB_PATH="${CSM_SEARCH_DB_PATH:-$CSM_NATIVE_DATA_DIR/search/vectors.db}"
export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$APP_DATA_DIR/database}"
export SERVER_PORT="${SERVER_PORT:-9999}"
export SOCKET_SERVER_PORT="${SOCKET_SERVER_PORT:-15301}"
export JWT_SECRET="${JWT_SECRET:-}"

# Resolve relative GGUF paths against APP_DATA_DIR (config.local-*.env uses ./csm_datas/...)
resolve_model_path() {
    local raw="${1:-}"
    [ -z "$raw" ] && return 0
    case "$raw" in
        /*) export AI_LOCAL_LLAMA_MODEL_PATH="$raw" ;;
        ./*)
            local rel="${raw#./}"
            if [[ "$rel" == csm_datas/* ]]; then
                export AI_LOCAL_LLAMA_MODEL_PATH="$ROOT/backend/$rel"
            else
                export AI_LOCAL_LLAMA_MODEL_PATH="$APP_DATA_DIR/${rel#csm_datas/}"
            fi
            ;;
        *) export AI_LOCAL_LLAMA_MODEL_PATH="$APP_DATA_DIR/$raw" ;;
    esac
}
resolve_model_path "${AI_LOCAL_LLAMA_MODEL_PATH:-}"

# Mac dev: profile env phải thắng config.env (tránh ctx 8192 + prompt 120k gây SIGABRT llama.cpp)
if [ "$(uname -s)" = "Darwin" ]; then
    export AI_LOCAL_LLAMA_CONTEXT_WINDOW="${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-4096}"
    if [ "${AI_LOCAL_LLAMA_CONTEXT_WINDOW}" -gt 4096 ] 2>/dev/null; then
        AI_LOCAL_LLAMA_CONTEXT_WINDOW=4096
        export AI_LOCAL_LLAMA_CONTEXT_WINDOW
    fi
    export AI_LOCAL_LLAMA_BATCH_SIZE="${AI_LOCAL_LLAMA_BATCH_SIZE:-512}"
    if [ "${AI_LOCAL_LLAMA_BATCH_SIZE}" -lt 512 ] 2>/dev/null; then
        AI_LOCAL_LLAMA_BATCH_SIZE=512
        export AI_LOCAL_LLAMA_BATCH_SIZE
    fi
    export AI_LOCAL_LLAMA_UBATCH_SIZE="${AI_LOCAL_LLAMA_UBATCH_SIZE:-64}"
    export AI_LOCAL_LLAMA_MAX_PROMPT_CHARS="${AI_LOCAL_LLAMA_MAX_PROMPT_CHARS:-32000}"
    export AI_SEO_ARTICLE_MAX_TOKENS="${AI_SEO_ARTICLE_MAX_TOKENS:-1536}"
fi

# Chỉ 1 instance — Pebble lock "resource temporarily unavailable" nếu chạy song song go run + csm-server
if command -v lsof >/dev/null 2>&1; then
    OLD_PID="$(lsof -ti tcp:"$SERVER_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    if [ -n "$OLD_PID" ]; then
        config_log "ERROR: port ${SERVER_PORT} đang dùng bởi PID ${OLD_PID}. Dừng instance cũ: kill ${OLD_PID}"
        exit 1
    fi
fi

cd "$GO_DIR"

if ! command -v go >/dev/null 2>&1; then
    echo "Go not found in PATH. Install Go 1.22+ from https://go.dev/dl/"
    exit 1
fi

config_log "CSM_HOME ${CSM_HOME}"
config_log "HTTP port ${SERVER_PORT}"
config_log "Profile ${PROFILE}"
config_log "Pebble root ${CSM_PEBBLE_ROOT}/{app_id}/{table_name}/ (pure Go — no RocksDB/CGO)"
config_log "Data dir ${APP_DATA_DIR}"
config_log "AI model ${AI_LOCAL_LLAMA_MODEL_PATH:-<unset>}"
config_log "AI ctx=${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-?} batch=${AI_LOCAL_LLAMA_BATCH_SIZE:-?} seoMaxTok=${AI_SEO_ARTICLE_MAX_TOKENS:-?}"
config_log "Using go: $(command -v go) ($(go version 2>/dev/null || echo unknown))"

# Local AI requires CGO + -tags llamacpp (in-process llama.cpp). Plain `go run` → LOCAL_PROVIDER_UNAVAILABLE.
export CGO_ENABLED=1
export AI_LOCAL_LLAMA_NATIVE_ENABLED="${AI_LOCAL_LLAMA_NATIVE_ENABLED:-true}"

NATIVE_BIN="$GO_DIR/csm-server"
if [ "${CSM_USE_NATIVE_BINARY:-}" = "1" ] && [ -x "$NATIVE_BIN" ]; then
    config_log "Starting prebuilt binary: $NATIVE_BIN (build: ./scripts/build-go-darwin-native.sh)"
    exec "$NATIVE_BIN"
fi

config_log "Starting: go run -tags llamacpp ./cmd/server (first compile ~30s; or build: ./scripts/build-go-darwin-native.sh && CSM_USE_NATIVE_BINARY=1)"
exec go run -tags llamacpp ./cmd/server
