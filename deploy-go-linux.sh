#!/bin/bash
# Deploy CSM Go backend with in-process llama.cpp → /root/la_server
#
# Native AI requires CGO — build runs ON the Linux server (not cross-compile from Mac).
#
# Usage:
#   ./deploy-go-linux.sh root@your-server
#   ./deploy-go-linux.sh root@your-server /root/la_server
set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/la_server}}"

if [ -z "$SERVER" ]; then
    echo "Usage: $0 user@server-ip [/path/on/server]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== CSM Go Deploy (native llama) → $SERVER:$SERVER_PATH ==="

echo ""
echo "▶ [1/4] Sync config..."
ssh "$SERVER" "mkdir -p '$SERVER_PATH'"
scp "$REPO_ROOT/config.env" "$SERVER:$SERVER_PATH/config.env"
if [ -f "$REPO_ROOT/config.local-8gb.env" ]; then
    scp "$REPO_ROOT/config.local-8gb.env" "$SERVER:$SERVER_PATH/config.local-8gb.env"
fi

echo ""
echo "▶ [2/4] Pull / sync source on server..."
ssh "$SERVER" bash -s "$SERVER_PATH" "$REPO_ROOT" <<'SYNC'
set -e
P="$1"
SRC="$2"
if [ -d "$P/.git" ]; then
    cd "$P" && git fetch origin && git reset --hard origin/main
else
    mkdir -p "$(dirname "$P")"
    git clone https://github.com/codsycorp/csm_java_react.git "$P"
fi
echo "Code: $(git -C "$P" log --oneline -1)"
SYNC

echo ""
echo "▶ [3/4] Build on server (CGO + llamacpp)..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'BUILD'
set -e
P="$1"
if ! command -v go >/dev/null 2>&1; then
    echo "Installing Go..."
    GO_VER=1.22.10
    curl -fsSL "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz" | tar -C /usr/local -xz
    export PATH="/usr/local/go/bin:$PATH"
fi
export PATH="/usr/local/go/bin:$PATH"
cd "$P/backend-go"
export CGO_ENABLED=1
go build -tags llamacpp -ldflags="-s -w" -trimpath -o "$P/csm_go_server" ./cmd/server
ls -lh "$P/csm_go_server"
BUILD

echo ""
echo "▶ [4/4] systemd + restart..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'SERVICE'
set -e
P="$1"
chmod +x "$P/csm_go_server"

mkdir -p "$P/csm_datas/native/pebble" \
         "$P/csm_datas/native/search" \
         "$P/csm_datas/database" \
         "$P/csm_datas/backups" \
         "$P/csm_datas/ai_local/model"

cat > /etc/systemd/system/csm-go.service <<EOF
[Unit]
Description=CSM Go Backend (native llama.cpp)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$P
EnvironmentFile=$P/config.env
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
Environment=AI_LOCAL_LLAMA_NATIVE_ENABLED=true
Environment=AI_LOCAL_LLAMA_GPU_LAYERS=0
Environment=AI_LOCAL_LLAMA_PRELOAD_ON_STARTUP=false
ExecStart=$P/csm_go_server
Restart=always
RestartSec=5
MemoryMax=7G
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable csm-go
systemctl restart csm-go
sleep 3
systemctl status csm-go --no-pager | head -15
SERVICE

echo ""
echo "✅ Deploy xong (native llama in-process — không cần llama-server sidecar)."
echo ""
echo "Health: curl -s http://SERVER:9999/api/monitoring/health"
echo "AI ops: curl -s http://SERVER:9999/api/ai-local/health  (provider=llama.cpp-native)"
echo "Log   : ssh $SERVER 'journalctl -u csm-go -f'"
echo ""
echo "Dừng backend cũ nếu cùng port 9999:"
echo "  ssh $SERVER 'systemctl stop csm-rust || true'"
