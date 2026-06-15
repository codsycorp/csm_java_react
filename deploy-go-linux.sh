#!/bin/bash
# Deploy CSM Go backend with in-process llama.cpp → /root/la_server
#
# Native AI requires CGO — build runs ON the Linux server (not cross-compile from Mac).
#
# Usage:
#   ./deploy-go-linux.sh root@your-server
#   ./deploy-go-linux.sh root@your-server /root/la_server
#
#   REMOTE_BUILD=/root/csm_server ./deploy-go-linux.sh root@host /root/la_server
#     REMOTE_BUILD = git clone + build (mặc định /root/csm_server)
#     SERVER_PATH  = data + binary runtime (mặc định /root/la_server)
set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/la_server}}"
REMOTE_BUILD="${REMOTE_BUILD:-/root/csm_server}"

if [ -z "$SERVER" ]; then
	echo "Usage: $0 user@server-ip [/path/on/server]"
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

echo "=== CSM Go Deploy (native llama) → $SERVER ==="
echo "    runtime : $SERVER_PATH"
echo "    build   : $REMOTE_BUILD"

echo ""
echo "▶ [1/4] Sync config (nếu có local config.env)..."
ssh "$SERVER" "mkdir -p '$SERVER_PATH' '$REMOTE_BUILD'"
if [ -f "$REPO_ROOT/config.env" ]; then
	scp "$REPO_ROOT/config.env" "$SERVER:$SERVER_PATH/config.env"
	echo "    uploaded config.env → $SERVER_PATH"
else
	echo "    skip config.env (không có local file — giữ config trên server)"
fi
if [ -f "$REPO_ROOT/config.local-8gb.env" ]; then
	scp "$REPO_ROOT/config.local-8gb.env" "$SERVER:$SERVER_PATH/config.local-8gb.env"
fi

echo ""
echo "▶ [2/4] Pull source on server ($REMOTE_BUILD)..."
ssh "$SERVER" bash -s "$REMOTE_BUILD" <<'SYNC'
set -e
P="$1"
if [ -d "$P/.git" ]; then
	cd "$P"
	git fetch origin main
	git reset --hard origin/main
else
	mkdir -p "$(dirname "$P")"
	git clone https://github.com/codsycorp/csm_java_react.git "$P"
	cd "$P"
fi
echo "Code: $(git -C "$P" log --oneline -1)"
echo "Tip: cần commit mới nhất trên origin/main (vd. fix extras.go import data)"
SYNC

echo ""
echo "▶ [2b/4] Compile check (phát hiện lỗi Go trước khi link llama)..."
ssh "$SERVER" bash -s "$REMOTE_BUILD" <<'COMPILE'
set -e
BUILD="$1"
cd "$BUILD/backend-go"
export PATH="/usr/local/go/bin:$PATH"
if ! command -v go >/dev/null 2>&1; then
  echo "    skip compile check (go chưa cài — bước build sẽ cài)"
  exit 0
fi
go mod download
echo "    go build -tags llamacpp ./cmd/server ..."
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -tags llamacpp -o /tmp/csm_go_compile_check ./cmd/server
rm -f /tmp/csm_go_compile_check
echo "    compile OK"
COMPILE

echo ""
echo "▶ [3/4] Build on server (CGO + llamacpp, Ubuntu 22.04 glibc)..."
ssh "$SERVER" bash -s "$REMOTE_BUILD" "$SERVER_PATH" <<'BUILD'
set -e
BUILD="$1"
RUNTIME="$2"
apt-get update -qq
apt-get install -y -qq build-essential cmake wget curl ca-certificates git >/dev/null
cd "$BUILD"
chmod +x scripts/build-go-native-inner.sh scripts/build-go-linux-native.sh
./scripts/build-go-native-inner.sh "$BUILD/backend-go" "$RUNTIME/csm_go_server"
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
After=network.target mysql.service

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
MemoryMax=7800M
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl stop csm-rust csm-java csm-llama 2>/dev/null || true
systemctl disable csm-llama 2>/dev/null || true
systemctl enable csm-go
systemctl restart csm-go
sleep 3
systemctl status csm-go --no-pager | head -15
SERVICE

echo ""
echo "✅ Deploy xong (native llama in-process — không cần llama-server sidecar)."
echo ""
echo "Data paths (server):"
echo "  CSM_HOME=$SERVER_PATH"
echo "  APP_DATA_DIR=$SERVER_PATH/csm_datas"
echo "  CSM_PEBBLE_ROOT=$SERVER_PATH/csm_datas/native/pebble"
echo ""
echo "Dev local (Mac): backend-go/run-go-server.sh → CSM_HOME=<repo>/backend, APP_DATA_DIR=<repo>/backend/csm_datas"
echo ""
echo "Health: curl -s http://$SERVER:9999/api/monitoring/health"
echo "AI ops: curl -s http://$SERVER:9999/api/ai-local/health"
echo "Log   : ssh $SERVER 'journalctl -u csm-go -f'"
