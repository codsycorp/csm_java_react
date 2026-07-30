#!/usr/bin/env bash
# Deploy prebuilt Go artifact to Linux server (NO source upload, NO server-side build).
#
# Usage:
#   ./deploy-go-linux.sh user@server
#   ./deploy-go-linux.sh user@server /root/la_server
#   ./deploy-go-linux.sh user@server /root/la_server /abs/path/to/csm-go-linux-arm64
#
# Defaults:
#   SERVER_PATH=/root/la_server
#   ARTIFACT auto-detected by remote arch:
#     - x86_64  -> dist/csm-go-linux-amd64
#     - aarch64 -> dist/csm-go-linux-arm64
set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/la_server}}"
ARTIFACT="${3:-${ARTIFACT:-}}"
SCP_FLAGS="${SCP_FLAGS:--O}"
UPLOAD_AI_MODEL="${UPLOAD_AI_MODEL:-true}"
AI_LOCAL_MODEL_PATH="${AI_LOCAL_MODEL_PATH:-}"

if [[ -z "$SERVER" ]]; then
  echo "Usage: $0 user@server-ip [/path/on/server] [/abs/path/to/artifact]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

log() { echo "[$(date +'%F %T')] [deploy-go-artifact] $*"; }

log "Target server: $SERVER"
log "Runtime path : $SERVER_PATH"

REMOTE_UNAME="$(ssh "$SERVER" "uname -m" | tr -d '\r' | tr -d '\n')"
case "$REMOTE_UNAME" in
  x86_64|amd64) REMOTE_ARCH="amd64" ;;
  aarch64|arm64) REMOTE_ARCH="arm64" ;;
  *)
    log "ERROR: Unsupported remote architecture: $REMOTE_UNAME"
    exit 1
    ;;
esac

if [[ -z "$ARTIFACT" ]]; then
  ARTIFACT="$REPO_ROOT/dist/csm-go-linux-$REMOTE_ARCH"
fi

if [[ ! -f "$ARTIFACT" ]]; then
  log "ERROR: Artifact not found: $ARTIFACT"
  log "Build it first on your machine:"
  log "  ./backend-go/docker-build.sh --linux --linux-arch $REMOTE_ARCH"
  exit 1
fi

log "Detected remote arch: $REMOTE_UNAME -> $REMOTE_ARCH"
log "Using artifact      : $ARTIFACT"

if [[ -z "$AI_LOCAL_MODEL_PATH" ]]; then
  if [[ -f "$REPO_ROOT/Modelfile" ]]; then
    MODEL_FROM_FILE="$(awk '/^FROM /{print $2; exit}' "$REPO_ROOT/Modelfile" | tr -d '\r' || true)"
    if [[ -n "$MODEL_FROM_FILE" ]]; then
      if [[ "$MODEL_FROM_FILE" == ./* ]]; then
        AI_LOCAL_MODEL_PATH="$REPO_ROOT/${MODEL_FROM_FILE#./}"
      elif [[ "$MODEL_FROM_FILE" == /* ]]; then
        AI_LOCAL_MODEL_PATH="$MODEL_FROM_FILE"
      else
        AI_LOCAL_MODEL_PATH="$REPO_ROOT/$MODEL_FROM_FILE"
      fi
    fi
  fi
fi

if [[ "$UPLOAD_AI_MODEL" == "true" ]]; then
  if [[ -n "$AI_LOCAL_MODEL_PATH" && ! -f "$AI_LOCAL_MODEL_PATH" ]]; then
    log "WARN: Model from Modelfile not found at: $AI_LOCAL_MODEL_PATH"
    AI_LOCAL_MODEL_PATH=""
  fi
  if [[ -z "$AI_LOCAL_MODEL_PATH" ]]; then
    FALLBACK_MODEL="$(ls -1 "$REPO_ROOT"/backend/csm_datas/ai_local/model/*.gguf 2>/dev/null | head -n 1 || true)"
    if [[ -n "$FALLBACK_MODEL" ]]; then
      AI_LOCAL_MODEL_PATH="$FALLBACK_MODEL"
      log "Using fallback AI model: $AI_LOCAL_MODEL_PATH"
    fi
  fi
fi

if [[ "$UPLOAD_AI_MODEL" == "true" ]]; then
  if [[ -n "$AI_LOCAL_MODEL_PATH" && -f "$AI_LOCAL_MODEL_PATH" ]]; then
    log "AI local model      : $AI_LOCAL_MODEL_PATH"
  else
    log "WARN: AI model file not found. Set AI_LOCAL_MODEL_PATH=/abs/path/to/model.gguf to upload model."
  fi
else
  log "AI model upload     : disabled (UPLOAD_AI_MODEL=$UPLOAD_AI_MODEL)"
fi

log "[1/4] Prepare runtime directories"
ssh "$SERVER" "mkdir -p '$SERVER_PATH' '$SERVER_PATH/csm_datas/native/pebble' '$SERVER_PATH/csm_datas/native/search' '$SERVER_PATH/csm_datas/database' '$SERVER_PATH/csm_datas/backups' '$SERVER_PATH/csm_datas/ai_local/model'"

log "[2/4] Upload binary + optional config"
ssh "$SERVER" "systemctl stop csm-go || true"
scp $SCP_FLAGS "$ARTIFACT" "$SERVER:$SERVER_PATH/csm_go_server.candidate"
ssh "$SERVER" "mv -f '$SERVER_PATH/csm_go_server.candidate' '$SERVER_PATH/csm_go_server' && chmod +x '$SERVER_PATH/csm_go_server'"

if [[ -f "$REPO_ROOT/config.env" ]]; then
  scp $SCP_FLAGS "$REPO_ROOT/config.env" "$SERVER:$SERVER_PATH/config.env"
  log "Uploaded config.env"
else
  log "Skip config.env (local file not found)"
fi

if [[ -f "$REPO_ROOT/config.local-8gb.env" ]]; then
  scp $SCP_FLAGS "$REPO_ROOT/config.local-8gb.env" "$SERVER:$SERVER_PATH/config.local-8gb.env"
  log "Uploaded config.local-8gb.env"
fi

if [[ -f "$REPO_ROOT/config.ai-local-max-8gb.env" ]]; then
  scp $SCP_FLAGS "$REPO_ROOT/config.ai-local-max-8gb.env" "$SERVER:$SERVER_PATH/config.ai-local-max-8gb.env"
  log "Uploaded config.ai-local-max-8gb.env"
fi

if [[ -f "$REPO_ROOT/config.ai-local-max.env" ]]; then
  scp $SCP_FLAGS "$REPO_ROOT/config.ai-local-max.env" "$SERVER:$SERVER_PATH/config.ai-local-max.env"
  log "Uploaded config.ai-local-max.env"
fi

if [[ "$UPLOAD_AI_MODEL" == "true" && -n "$AI_LOCAL_MODEL_PATH" && -f "$AI_LOCAL_MODEL_PATH" ]]; then
  log "[2.5/4] Upload AI local model"
  MODEL_BASENAME="$(basename "$AI_LOCAL_MODEL_PATH")"
  scp $SCP_FLAGS "$AI_LOCAL_MODEL_PATH" "$SERVER:$SERVER_PATH/csm_datas/ai_local/model/$MODEL_BASENAME.candidate"
  ssh "$SERVER" "mv -f '$SERVER_PATH/csm_datas/ai_local/model/$MODEL_BASENAME.candidate' '$SERVER_PATH/csm_datas/ai_local/model/$MODEL_BASENAME'"
  if [[ -f "$REPO_ROOT/Modelfile" ]]; then
    scp $SCP_FLAGS "$REPO_ROOT/Modelfile" "$SERVER:$SERVER_PATH/Modelfile"
    log "Uploaded Modelfile"
  fi
  log "Uploaded AI model: $MODEL_BASENAME"
fi

log "[3/4] Install/refresh systemd service"
ssh "$SERVER" bash -s "$SERVER_PATH" <<'SERVICE'
set -euo pipefail
P="$1"
cat > /etc/systemd/system/csm-go.service <<EOF
[Unit]
Description=CSM Go Backend (artifact deploy)
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=$P
EnvironmentFile=-$P/config.env
EnvironmentFile=-$P/config.local-8gb.env
EnvironmentFile=-$P/config.ai-local-max-8gb.env
EnvironmentFile=-$P/config.ai-local-max.env
Environment=CSM_HOME=$P
Environment=CSM_LOCAL_PROFILE=8gb
Environment=APP_DATA_DIR=$P/csm_datas
Environment=CSM_NATIVE_DATA_DIR=$P/csm_datas/native
Environment=CSM_PEBBLE_ROOT=$P/csm_datas/native/pebble
Environment=CSM_SEARCH_DB_PATH=$P/csm_datas/native/search/vectors.db
Environment=ROCKSDB_ROOT_DIR=$P/csm_datas/database
Environment=LUCENE_INDEX_ROOT_DIR=$P/csm_datas/lucene_index
Environment=SERVER_PORT=9999
Environment=SOCKET_SERVER_PORT=15301
Environment=REDIS_ENABLED=0
Environment=CSM_SKIP_STARTUP_DB_INIT=1
Environment=AI_LOCAL_ONLY_ENABLED=true
Environment=AI_LOCAL_LLAMA_NATIVE_ENABLED=true
Environment=AI_LOCAL_RUNTIME_AUTO_TUNE=true
Environment=AI_LOCAL_PROMPT_BUDGET_DISABLED=true
ExecStart=$P/csm_go_server
Restart=always
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable csm-go
systemctl restart csm-go
SERVICE

log "[4/4] Runtime quick check"
ssh "$SERVER" "systemctl --no-pager --full status csm-go | head -20"
ssh "$SERVER" "curl -sf 'http://127.0.0.1:9999/api/monitoring/health' | head -c 800 || true"

log "Done. No source code was uploaded to server."
