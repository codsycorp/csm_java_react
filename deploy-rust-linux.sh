#!/bin/bash
# deploy-rust-linux.sh — Git push → build trên server → restart service
# Dùng: ./deploy-rust-linux.sh user@server-ip [/path/on/server]

set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/csm_server}}"

if [ -z "$SERVER" ]; then
    echo "Usage: $0 user@server-ip [/path/on/server]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== CSM Rust Deploy → $SERVER:$SERVER_PATH ==="

# ── Bước 1: Cài build tools + swap (chỉ chạy nếu chưa có) ──────────────────
echo ""
echo "▶ [1/4] Setup server (bỏ qua nếu đã setup)..."
ssh "$SERVER" bash <<'SETUP'
set -e

# Rust
if ! command -v cargo &>/dev/null; then
    echo "→ Cài Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
source "$HOME/.cargo/env" 2>/dev/null || true

# Build dependencies
if command -v apt-get &>/dev/null && ! command -v cmake &>/dev/null; then
    echo "→ Cài build tools..."
    apt-get update -qq
    apt-get install -y --no-install-recommends \
        build-essential cmake pkg-config libclang-dev clang \
        libssl-dev libzstd-dev libbz2-dev liblz4-dev libsnappy-dev git
fi

# Swap 4GB (cần cho link step llama.cpp + RocksDB trên RAM thấp)
if [ ! -f /swapfile ]; then
    echo "→ Tạo swap 4GB..."
    fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab 2>/dev/null || true
fi

echo "Setup OK — RAM: $(free -h | awk '/Mem:/{print $2}'), Swap: $(free -h | awk '/Swap:/{print $2}')"
SETUP

# ── Bước 2: Git pull ─────────────────────────────────────────────────────────
echo ""
echo "▶ [2/4] Pull code mới nhất..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'PULL'
set -e
P="$1"
if [ ! -d "$P/.git" ]; then
    echo "→ Clone repo lần đầu..."
    mkdir -p "$(dirname "$P")"
    git clone https://github.com/codsycorp/csm_java_react.git "$P"
else
    cd "$P" && git fetch origin && git reset --hard origin/main
fi
echo "Code: $(git -C "$P" log --oneline -1)"
PULL

# ── Bước 3: Build trên server ────────────────────────────────────────────────
echo ""
echo "▶ [3/4] Build release (lần đầu ~15-20 phút, lần sau ~2-3 phút)..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'BUILD'
set -e
source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$PATH"
cd "$1/backend-rust"

echo "Cargo: $(cargo --version)"

# release-server profile: lto=off, codegen-units=16 → ít RAM hơn khi link
# JOBS=2 → không bị OOM trên server 8GB
CARGO_BUILD_JOBS=2 cargo build --profile release-server 2>&1

BINARY="target/release-server/csm_server"
echo "✅ $(ls -lh $BINARY)"

# Copy sang release/ để service dùng path cố định
cp "$BINARY" target/release/csm_server
BUILD

# ── Bước 4: Upload config + restart service ──────────────────────────────────
echo ""
echo "▶ [4/4] Config và khởi động..."

# Upload config.env (secrets không commit git)
scp "$SCRIPT_DIR/config.env" "$SERVER:$SERVER_PATH/config.env"

ssh "$SERVER" bash -s "$SERVER_PATH" <<'SERVICE'
set -e
P="$1"
BINARY="$P/backend-rust/target/release/csm_server"

mkdir -p "$P/csm_datas/database" "$P/csm_datas/backups" \
         "$P/csm_datas/lucene_index" "$P/csm_datas/ai_local/model"

cat > /etc/systemd/system/csm-rust.service <<EOF
[Unit]
Description=CSM Rust Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$P
            EnvironmentFile=$P/config.env
            Environment=SERVER_PORT=9999
            Environment=SOCKET_SERVER_PORT=15301
            ExecStart=$BINARY
Restart=always
RestartSec=5
MemoryMax=6G
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable csm-rust
systemctl restart csm-rust
sleep 2
systemctl status csm-rust --no-pager | head -15
SERVICE

echo ""
echo "✅ Deploy xong!"
echo ""
echo "Log  : ssh $SERVER 'journalctl -u csm-rust -f'"
echo "Stop : ssh $SERVER 'systemctl stop csm-rust'"
