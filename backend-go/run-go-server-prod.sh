#!/bin/bash
# Chạy Go backend trên server production (/root/la_server layout).
set -euo pipefail
GO_DIR="$(cd "$(dirname "$0")" && pwd)"
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
if [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "true" ] || [ "${AI_LOCAL_PROMPT_BUDGET_DISABLED:-}" = "1" ]; then
    load_env_file "$CSM_HOME/config.ai-local-max-8gb.env" || load_env_file "$CSM_HOME/config.ai-local-max.env" || true
fi

export CSM_HOME
export APP_DATA_DIR="${APP_DATA_DIR:-$CSM_HOME/csm_datas}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
export CSM_VECTOR_DIR="${CSM_VECTOR_DIR:-$CSM_NATIVE_DATA_DIR/vector/chromem}"
export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$APP_DATA_DIR/database}"
export SERVER_PORT="${SERVER_PORT:-9999}"
export CSM_LOCAL_PROFILE="${CSM_LOCAL_PROFILE:-8gb}"
export AI_LOCAL_ONLY_ENABLED="${AI_LOCAL_ONLY_ENABLED:-true}"
export AI_LOCAL_LLAMA_NATIVE_ENABLED="${AI_LOCAL_LLAMA_NATIVE_ENABLED:-true}"
export AI_LOCAL_RUNTIME_AUTO_TUNE="${AI_LOCAL_RUNTIME_AUTO_TUNE:-true}"
export AI_LOCAL_PROMPT_BUDGET_DISABLED="${AI_LOCAL_PROMPT_BUDGET_DISABLED:-true}"

BIN="${CSM_GO_BIN:-$CSM_HOME/csm_go_server}"
if [ ! -x "$BIN" ]; then
    echo "Binary not found: $BIN"
    echo "Build: ./build-linux.sh $CSM_HOME/csm_go_server"
    exit 1
fi

echo "[csm-go] CSM_HOME=$CSM_HOME"
echo "[csm-go] APP_DATA_DIR=$APP_DATA_DIR"
echo "[csm-go] CSM_PEBBLE_ROOT=$CSM_PEBBLE_ROOT"
echo "[csm-go] port=$SERVER_PORT"
exec "$BIN"
