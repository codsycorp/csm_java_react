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

log "[1/4] Prepare runtime directories"
ssh "$SERVER" "mkdir -p '$SERVER_PATH' '$SERVER_PATH/csm_datas/native/pebble' '$SERVER_PATH/csm_datas/native/search' '$SERVER_PATH/csm_datas/database' '$SERVER_PATH/csm_datas/backups' '$SERVER_PATH/csm_datas/ai_local/model'"

log "[2/4] Upload binary + optional config"
scp "$ARTIFACT" "$SERVER:$SERVER_PATH/csm_go_server"
ssh "$SERVER" "chmod +x '$SERVER_PATH/csm_go_server'"

if [[ -f "$REPO_ROOT/config.env" ]]; then
  scp "$REPO_ROOT/config.env" "$SERVER:$SERVER_PATH/config.env"
  log "Uploaded config.env"
else
  log "Skip config.env (local file not found)"
fi

if [[ -f "$REPO_ROOT/config.local-8gb.env" ]]; then
  scp "$REPO_ROOT/config.local-8gb.env" "$SERVER:$SERVER_PATH/config.local-8gb.env"
  log "Uploaded config.local-8gb.env"
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
