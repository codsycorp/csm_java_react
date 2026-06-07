#!/bin/bash
# deploy-rust-linux.sh — Build và deploy Rust backend lên Linux server
# Dùng: ./deploy-rust-linux.sh user@server-ip [/path/on/server]

set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/csm_server}}"

if [ -z "$SERVER" ]; then
    echo "Usage: $0 user@server-ip [/path/on/server]"
    echo "  Hoặc set: DEPLOY_SERVER=user@ip ./deploy-rust-linux.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploy Rust backend → $SERVER:$SERVER_PATH ==="

# ── Bước 1: Cài build tools (chỉ lần đầu) ──────────────────────────────────
echo ""
echo "▶ [1/4] Kiểm tra build tools trên server..."
ssh "$SERVER" bash <<'REMOTE_SETUP'
set -e

# Rust
if ! command -v cargo &>/dev/null; then
    echo "Cài Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
source "$HOME/.cargo/env" 2>/dev/null || true

# Build deps
if command -v apt-get &>/dev/null; then
    apt-get install -y --no-install-recommends \
        build-essential cmake pkg-config libclang-dev clang \
        libssl-dev libzstd-dev libbz2-dev liblz4-dev libsnappy-dev \
        git curl 2>/dev/null || true
elif command -v yum &>/dev/null; then
    yum install -y gcc gcc-c++ cmake pkgconfig openssl-devel \
        zstd-devel bzip2-devel lz4-devel git curl 2>/dev/null || true
fi

# Thêm swap 4GB nếu chưa có (cần cho build llama.cpp + RocksDB trên RAM thấp)
if [ "$(swapon --show | wc -l)" -le 1 ] && [ ! -f /swapfile ]; then
    echo "Tạo swap 4GB để build an toàn..."
    fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 2>/dev/null
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab 2>/dev/null || true
    echo "Swap OK: $(free -h | grep Swap)"
fi

echo "Setup OK"
REMOTE_SETUP

# ── Bước 2: Git pull ─────────────────────────────────────────────────────────
echo ""
echo "▶ [2/4] Đồng bộ code..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE_PULL'
set -e
P="$1"
if [ ! -d "$P/.git" ]; then
    echo "Clone repo..."
    mkdir -p "$(dirname "$P")"
    git clone https://github.com/codsycorp/csm_java_react.git "$P"
else
    cd "$P"
    git fetch origin
    git reset --hard origin/main
    echo "$(git log --oneline -1)"
fi
REMOTE_PULL

# ── Bước 3: Build với profile nhẹ cho server RAM thấp ───────────────────────
echo ""
echo "▶ [3/4] Build (lần đầu ~15-30 phút, lần sau ~2-5 phút)..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE_BUILD'
set -e
source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$PATH"
cd "$1/backend-rust"

RAM_GB=$(free -g | awk '/Mem:/{print $2}')
echo "RAM: ${RAM_GB}GB"

# Server ≤8GB: dùng release-server profile (lto=off, 16 codegen-units)
# Giới hạn 2 jobs song song để tránh OOM khi link
CARGO_BUILD_JOBS=2 cargo build --profile release-server

BINARY="target/release-server/csm_server"
echo "Binary: $(ls -lh $BINARY)"

# Copy sang target/release để service dùng chung path
cp "$BINARY" target/release/csm_server
REMOTE_BUILD

# ── Bước 4: Config + systemd service ────────────────────────────────────────
echo ""
echo "▶ [4/4] Cấu hình service..."

# Upload config.env (chứa secrets, không commit git)
scp "$SCRIPT_DIR/config.env" "$SERVER:$SERVER_PATH/config.env"

ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE_SERVICE'
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
ExecStart=$BINARY
Restart=always
RestartSec=5
# Giới hạn RAM 6GB để tránh OOM kill các process khác
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
sleep 3
systemctl status csm-rust --no-pager | head -20
REMOTE_SERVICE

echo ""
echo "✅ Deploy xong!"
echo ""
echo "Lệnh hữu ích:"
echo "  Log realtime : ssh $SERVER 'journalctl -u csm-rust -f'"
echo "  Dừng service : ssh $SERVER 'systemctl stop csm-rust'"
echo "  Khởi lại     : ssh $SERVER 'systemctl restart csm-rust'"
echo "  RAM usage    : ssh $SERVER 'free -h && ps aux | grep csm_server'"
echo ""
echo "⚠️  Với server 8GB RAM:"
echo "  - AI local (7B model) dùng 4.4GB → chỉ còn 3.6GB cho app+OS"
echo "  - Khuyến nghị: tắt AI local trên server, để config.env:"
echo "    AI_LOCAL_LLAMA_MODEL_PATH="
echo "  - Hoặc dùng model nhỏ hơn (1.5B ~1GB):"
echo "    https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF"
