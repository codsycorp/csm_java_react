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
# Sau profile: overlay max prompt/output (tắt clamp tier 8GB) khi bật trong config.env
if [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "true" ] || [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "1" ]; then
    case "$PROFILE" in
        8gb|7b|local-8gb)
            load_env_file "$ROOT/config.ai-local-max-8gb.env" \
                || load_env_file "$ROOT/config.ai-local-max.env" \
                || config_log "config.ai-local-max-8gb.env not found (optional max overlay)"
            ;;
        *)
            load_env_file "$ROOT/config.ai-local-max.env" \
                || config_log "config.ai-local-max.env not found (optional max overlay)"
            ;;
    esac
fi

export CSM_HOME="${CSM_HOME:-$ROOT/backend}"
export APP_DATA_DIR="${APP_DATA_DIR:-$CSM_HOME/csm_datas}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
export CSM_VECTOR_DIR="${CSM_VECTOR_DIR:-$CSM_NATIVE_DATA_DIR/vector/chromem}"
case "$PROFILE" in
    8gb|7b|local-8gb)
        export CSM_EQ_INDEX_MODE="${CSM_EQ_INDEX_MODE:-pebble}"
        export CSM_EQ_INDEX_ROOT="${CSM_EQ_INDEX_ROOT:-$CSM_NATIVE_DATA_DIR/eq_index}"
        export CSM_PEBBLE_CACHE_MB="${CSM_PEBBLE_CACHE_MB:-32}"
        export CSM_PEBBLE_MEMTABLE_MB="${CSM_PEBBLE_MEMTABLE_MB:-8}"
        export CSM_PEBBLE_INDEX_MEMTABLE_MB="${CSM_PEBBLE_INDEX_MEMTABLE_MB:-4}"
        export CSM_VECTOR_RECORDS_ENABLED="${CSM_VECTOR_RECORDS_ENABLED:-false}"
        export CSM_STARTUP_REINDEX_TABLES="${CSM_STARTUP_REINDEX_TABLES:-csm/csm_accounts,csm/csm_group_members}"
        ;;
    *)
        export CSM_EQ_INDEX_MODE="${CSM_EQ_INDEX_MODE:-memory}"
        export CSM_EQ_INDEX_ROOT="${CSM_EQ_INDEX_ROOT:-$CSM_NATIVE_DATA_DIR/eq_index}"
        export CSM_PEBBLE_CACHE_MB="${CSM_PEBBLE_CACHE_MB:-64}"
        export CSM_PEBBLE_MEMTABLE_MB="${CSM_PEBBLE_MEMTABLE_MB:-32}"
        export CSM_PEBBLE_INDEX_MEMTABLE_MB="${CSM_PEBBLE_INDEX_MEMTABLE_MB:-8}"
        export CSM_VECTOR_RECORDS_ENABLED="${CSM_VECTOR_RECORDS_ENABLED:-true}"
        ;;
esac
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
                local backend_path="$ROOT/backend/$rel"
                local root_path="$ROOT/$rel"
                if [ -f "$backend_path" ]; then
                    export AI_LOCAL_LLAMA_MODEL_PATH="$backend_path"
                elif [ -f "$root_path" ]; then
                    export AI_LOCAL_LLAMA_MODEL_PATH="$root_path"
                else
                    export AI_LOCAL_LLAMA_MODEL_PATH="$backend_path"
                fi
            else
                export AI_LOCAL_LLAMA_MODEL_PATH="$APP_DATA_DIR/${rel#csm_datas/}"
            fi
            ;;
        *) export AI_LOCAL_LLAMA_MODEL_PATH="$APP_DATA_DIR/$raw" ;;
    esac
}
resolve_model_path "${AI_LOCAL_LLAMA_MODEL_PATH:-}"

if [ -n "${AI_LOCAL_LLAMA_SEO_MODEL_PATH:-}" ] && [[ "${AI_LOCAL_LLAMA_SEO_MODEL_PATH}" == ./* ]]; then
    rel_seo="${AI_LOCAL_LLAMA_SEO_MODEL_PATH#./}"
    if [[ "$rel_seo" == csm_datas/* ]]; then
        backend_seo="$ROOT/backend/$rel_seo"
        root_seo="$ROOT/$rel_seo"
        if [ -f "$backend_seo" ]; then
            export AI_LOCAL_LLAMA_SEO_MODEL_PATH="$backend_seo"
        elif [ -f "$root_seo" ]; then
            export AI_LOCAL_LLAMA_SEO_MODEL_PATH="$root_seo"
        fi
    fi
fi

# Mac dev: profile env phải thắng config.env (tránh ctx 8192 + prompt 120k gây SIGABRT llama.cpp)
if [ "$(uname -s)" = "Darwin" ]; then
    export AI_LOCAL_LLAMA_GPU_LAYERS="${AI_LOCAL_LLAMA_GPU_LAYERS:-0}"
    export GGML_METAL="${GGML_METAL:-0}"
    export AI_LOCAL_LLAMA_ISOLATED="${AI_LOCAL_LLAMA_ISOLATED:-true}"
    export AI_LOCAL_RUNTIME_AUTO_TUNE="${AI_LOCAL_RUNTIME_AUTO_TUNE:-true}"
    if [ "${AI_LOCAL_RUNTIME_AUTO_TUNE}" = "true" ] || [ "${AI_LOCAL_RUNTIME_AUTO_TUNE}" = "1" ]; then
        config_log "AI runtime auto-tune: Go server tự chỉnh ctx/batch theo RAM (isolated worker mặc định bật)"
    else
        export AI_LOCAL_LLAMA_BATCH_SIZE="${AI_LOCAL_LLAMA_BATCH_SIZE:-512}"
        export AI_LOCAL_LLAMA_UBATCH_SIZE="${AI_LOCAL_LLAMA_UBATCH_SIZE:-64}"
        if [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "true" ] || [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "1" ]; then
            config_log "AI max mode: prompt/output clamp tier tắt (AI_LOCAL_PROMPT_BUDGET_DISABLED)"
        else
            export AI_LOCAL_LLAMA_CONTEXT_WINDOW="${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-4096}"
            if [ "${AI_LOCAL_LLAMA_CONTEXT_WINDOW}" -gt 4096 ] 2>/dev/null; then
                AI_LOCAL_LLAMA_CONTEXT_WINDOW=4096
                export AI_LOCAL_LLAMA_CONTEXT_WINDOW
            fi
            export AI_LOCAL_LLAMA_MAX_PROMPT_CHARS="${AI_LOCAL_LLAMA_MAX_PROMPT_CHARS:-32000}"
            if [ "${AI_LOCAL_LLAMA_MAX_PROMPT_CHARS}" -gt 32000 ] 2>/dev/null; then
                config_log "WARN: clamp AI_LOCAL_LLAMA_MAX_PROMPT_CHARS ${AI_LOCAL_LLAMA_MAX_PROMPT_CHARS} → 32000"
                AI_LOCAL_LLAMA_MAX_PROMPT_CHARS=32000
                export AI_LOCAL_LLAMA_MAX_PROMPT_CHARS
            fi
        fi
    fi
    export AI_SEO_ARTICLE_MAX_TOKENS="${AI_SEO_ARTICLE_MAX_TOKENS:-1536}"
fi

# Linux/server: batch < 512 + prompt dài → GGML_ASSERT (process exit)
if [ "${AI_LOCAL_LLAMA_BATCH_SIZE:-0}" -lt 512 ] 2>/dev/null; then
    config_log "WARN: clamp AI_LOCAL_LLAMA_BATCH_SIZE ${AI_LOCAL_LLAMA_BATCH_SIZE} → 512 (batch nhỏ gây SIGABRT khi prompt dài)"
    export AI_LOCAL_LLAMA_BATCH_SIZE=512
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

# Auto-heal stale go.mod replace generated in container builds
# (e.g. /src/backend-go/.cache/go-nativeml-patched) when running locally.
NATIVEML_REPLACE="$(awk '/^replace github.com\/footprintai\/go-nativeml / {print $4; exit}' go.mod 2>/dev/null || true)"
if [ -n "$NATIVEML_REPLACE" ] && [ ! -d "$NATIVEML_REPLACE" ]; then
    LOCAL_PATCHED_DIR="$GO_DIR/.cache/go-nativeml-patched"
    if [ -d "$LOCAL_PATCHED_DIR" ]; then
        config_log "Fixing go.mod replace: $NATIVEML_REPLACE -> $LOCAL_PATCHED_DIR"
        go mod edit -replace="github.com/footprintai/go-nativeml=$LOCAL_PATCHED_DIR"
    fi
fi

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
config_log "AI ctx=${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-auto} batch=${AI_LOCAL_LLAMA_BATCH_SIZE:-auto} isolated=${AI_LOCAL_LLAMA_ISOLATED:-true} autoTune=${AI_LOCAL_RUNTIME_AUTO_TUNE:-true}"
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
