#!/bin/bash
# CSM Rust backend launcher — mirrors backend-go/run-go-server.sh env loading
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
export CSM_VECTOR_DIR="${CSM_VECTOR_DIR:-$CSM_NATIVE_DATA_DIR/vector/qdrant}"
export CSM_KV_BACKUP_DIR="${CSM_KV_BACKUP_DIR:-$APP_DATA_DIR/backups}"
case "$PROFILE" in
    8gb|7b|local-8gb)
        export CSM_EQ_INDEX_MODE="${CSM_EQ_INDEX_MODE:-pebble}"
        export CSM_EQ_INDEX_ROOT="${CSM_EQ_INDEX_ROOT:-$CSM_NATIVE_DATA_DIR/eq_index}"
        export CSM_PEBBLE_CACHE_MB="${CSM_PEBBLE_CACHE_MB:-32}"
        export CSM_PEBBLE_MEMTABLE_MB="${CSM_PEBBLE_MEMTABLE_MB:-8}"
        export CSM_PEBBLE_INDEX_MEMTABLE_MB="${CSM_PEBBLE_INDEX_MEMTABLE_MB:-4}"
        export CSM_VECTOR_RECORDS_ENABLED="${CSM_VECTOR_RECORDS_ENABLED:-false}"
        export CSM_STARTUP_REINDEX_TABLES="${CSM_STARTUP_REINDEX_TABLES:-csm/csm_accounts,csm/csm_group_members,csm/sys_autos}"
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
export LUCENE_INDEX_ROOT_DIR="${LUCENE_INDEX_ROOT_DIR:-$APP_DATA_DIR/lucene_index}"
export SERVER_PORT="${SERVER_PORT:-9999}"
export SOCKET_SERVER_PORT="${SOCKET_SERVER_PORT:-15301}"
export JWT_SECRET="${JWT_SECRET:-}"

# Resolve relative data paths (config.local-*.env uses ./csm_datas/...)
resolve_data_path_env() {
    local key="$1"
    local raw="${!key:-}"
    [ -z "$raw" ] && return 0
    case "$raw" in
        /*) export "$key=$raw" ;;
        ./*)
            local rel="${raw#./}"
            if [[ "$rel" == csm_datas/* ]]; then
                export "$key=$CSM_HOME/$rel"
            else
                export "$key=$APP_DATA_DIR/${rel#csm_datas/}"
            fi
            ;;
        *) export "$key=$APP_DATA_DIR/$raw" ;;
    esac
}
for _ai_path_key in \
    AI_LOCAL_LLAMA_MODEL_PATH \
    AI_LOCAL_LLAMA_SEO_MODEL_PATH \
    AI_LOCAL_LLAMA_EMBEDDING_MODEL_PATH \
    AI_CONTEXT_DIR \
    AI_MENU_MASTER_PROMPT_PATH \
    AI_CODE_MASTER_PROMPT_PATH; do
    resolve_data_path_env "$_ai_path_key"
done

# Mac dev: profile env must win over config.env (avoid ctx 8192 + prompt 120k SIGABRT)
if [ "$(uname -s)" = "Darwin" ]; then
    export AI_LOCAL_LLAMA_GPU_LAYERS="${AI_LOCAL_LLAMA_GPU_LAYERS:-0}"
    export GGML_METAL="${GGML_METAL:-0}"
    export AI_LOCAL_LLAMA_ISOLATED="${AI_LOCAL_LLAMA_ISOLATED:-true}"
    export AI_LOCAL_RUNTIME_AUTO_TUNE="${AI_LOCAL_RUNTIME_AUTO_TUNE:-true}"
    if [ "${AI_LOCAL_RUNTIME_AUTO_TUNE}" = "true" ] || [ "${AI_LOCAL_RUNTIME_AUTO_TUNE}" = "1" ]; then
        config_log "AI runtime auto-tune: Rust server adjusts ctx/batch by RAM (isolated worker default on)"
    else
        export AI_LOCAL_LLAMA_BATCH_SIZE="${AI_LOCAL_LLAMA_BATCH_SIZE:-512}"
        export AI_LOCAL_LLAMA_UBATCH_SIZE="${AI_LOCAL_LLAMA_UBATCH_SIZE:-64}"
        if [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "true" ] || [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "1" ]; then
            config_log "AI max mode: prompt/output clamp tier off (AI_LOCAL_PROMPT_BUDGET_DISABLED)"
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

# Linux/server: batch < 512 + long prompt → GGML_ASSERT
if [ "${AI_LOCAL_LLAMA_BATCH_SIZE:-0}" -lt 512 ] 2>/dev/null; then
    config_log "WARN: clamp AI_LOCAL_LLAMA_BATCH_SIZE ${AI_LOCAL_LLAMA_BATCH_SIZE} → 512 (small batch causes SIGABRT on long prompts)"
    export AI_LOCAL_LLAMA_BATCH_SIZE=512
fi

if command -v lsof >/dev/null 2>&1; then
    OLD_PID="$(lsof -ti tcp:"$SERVER_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    if [ -n "$OLD_PID" ]; then
        config_log "ERROR: port ${SERVER_PORT} in use by PID ${OLD_PID}. Stop old instance: kill ${OLD_PID}"
        exit 1
    fi
fi

cd "$RUST_DIR"

if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v cargo >/dev/null 2>&1; then
    echo "Rust/Cargo not found in PATH."
    echo "Install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

export AI_LOCAL_LLAMA_NATIVE_ENABLED="${AI_LOCAL_LLAMA_NATIVE_ENABLED:-true}"

config_log "CSM_HOME ${CSM_HOME}"
config_log "HTTP port ${SERVER_PORT}"
config_log "Profile ${PROFILE}"
config_log "Pebble root ${CSM_PEBBLE_ROOT}/{app_id}/{table_name}/"
config_log "Vector root ${CSM_VECTOR_DIR}"
config_log "Data dir ${APP_DATA_DIR}"
config_log "AI model ${AI_LOCAL_LLAMA_MODEL_PATH:-<unset>}"
config_log "AI SEO model ${AI_LOCAL_LLAMA_SEO_MODEL_PATH:-<unset>}"
config_log "AI embedding model ${AI_LOCAL_LLAMA_EMBEDDING_MODEL_PATH:-<unset>}"
config_log "AI ctx=${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-auto} batch=${AI_LOCAL_LLAMA_BATCH_SIZE:-auto} isolated=${AI_LOCAL_LLAMA_ISOLATED:-true} autoTune=${AI_LOCAL_RUNTIME_AUTO_TUNE:-true}"
config_log "Using cargo: $(command -v cargo) ($(cargo --version 2>/dev/null || echo unknown))"
exec cargo run --release
