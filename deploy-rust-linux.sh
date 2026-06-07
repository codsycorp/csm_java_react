#!/bin/bash
# deploy-rust-linux.sh — Build và deploy Rust backend lên Linux server
# Dùng: ./deploy-rust-linux.sh [user@server-ip] [/path/on/server]
# Ví dụ: ./deploy-rust-linux.sh root@123.456.789.0 /root/csm_server

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/csm_server}}"

if [ -z "$SERVER" ]; then
    echo "Usage: $0 user@server-ip [/path/on/server]"
    echo "  Or set DEPLOY_SERVER env var"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/backend-rust"

echo "=== Deploy Rust backend → $SERVER:$SERVER_PATH ==="

# ── Bước 1: Cài dependencies trên server (chạy 1 lần) ──────────────────────
echo ""
echo "▶ [1/4] Kiểm tra/cài build tools trên server..."
ssh "$SERVER" bash <<'REMOTE_SETUP'
set -e

# Rust toolchain
if ! command -v cargo &>/dev/null; then
    echo "Cài Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    source "$HOME/.cargo/env"
fi

# Build tools cho RocksDB + llama.cpp
if command -v apt-get &>/dev/null; then
    apt-get install -y --no-install-recommends \
        build-essential cmake pkg-config libclang-dev clang \
        libssl-dev libzstd-dev libbz2-dev liblz4-dev libsnappy-dev \
        git curl 2>/dev/null || true
elif command -v yum &>/dev/null; then
    yum install -y gcc gcc-c++ cmake pkgconfig openssl-devel \
        zstd-devel bzip2-devel lz4-devel git curl 2>/dev/null || true
fi

echo "Build tools OK"
REMOTE_SETUP

# ── Bước 2: Git pull trên server ─────────────────────────────────────────
echo ""
echo "▶ [2/4] Đồng bộ code trên server..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE_PULL'
set -e
SERVER_PATH="$1"

if [ ! -d "$SERVER_PATH/.git" ]; then
    echo "Chưa có repo — clone..."
    mkdir -p "$(dirname "$SERVER_PATH")"
    git clone https://github.com/codsycorp/csm_java_react.git "$SERVER_PATH"
else
    cd "$SERVER_PATH"
    git fetch origin
    git reset --hard origin/main
    echo "Git pull: $(git log --oneline -1)"
fi
REMOTE_PULL

# ── Bước 3: Build release trên server ────────────────────────────────────
echo ""
echo "▶ [3/4] Build release binary (có thể mất 5-15 phút lần đầu)..."
ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE_BUILD'
set -e
source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$PATH"

cd "$1/backend-rust"

# Tắt LTO nặng nếu server RAM < 8GB
RAM_GB=$(free -g 2>/dev/null | awk '/Mem:/{print $2}' || echo 8)
if [ "${RAM_GB:-8}" -lt 6 ]; then
    echo "RAM thấp ($RAM_GB GB) — dùng lto=off để tránh OOM"
    CARGO_PROFILE_RELEASE_LTO=off cargo build --release
else
    cargo build --release
fi

echo "Build OK: $(ls -lh target/release/csm_server)"
REMOTE_BUILD

# ── Bước 4: Upload config.env và tạo/restart systemd service ────────────────
echo ""
echo "▶ [4/4] Cấu hình và khởi động service..."

# Upload config.env (không commit secret lên git)
scp "$SCRIPT_DIR/config.env" "$SERVER:$SERVER_PATH/config.env"

ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE_SERVICE'
set -e
SERVER_PATH="$1"
BINARY="$SERVER_PATH/backend-rust/target/release/csm_server"
SERVICE_FILE="/etc/systemd/system/csm-rust.service"

# Tạo thư mục data
mkdir -p "$SERVER_PATH/csm_datas/database"
mkdir -p "$SERVER_PATH/csm_datas/backups"
mkdir -p "$SERVER_PATH/csm_datas/lucene_index"
mkdir -p "$SERVER_PATH/csm_datas/ai_local/model"

# Tạo systemd service
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=CSM Rust Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$SERVER_PATH
EnvironmentFile=$SERVER_PATH/config.env
ExecStart=$BINARY
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable csm-rust
systemctl restart csm-rust
sleep 2
systemctl status csm-rust --no-pager | head -15
REMOTE_SERVICE

echo ""
echo "✅ Deploy xong! Server đang chạy trên port 15300."
echo ""
echo "Xem log:   ssh $SERVER 'journalctl -u csm-rust -f'"
echo "Dừng:      ssh $SERVER 'systemctl stop csm-rust'"
echo "Khởi lại:  ssh $SERVER 'systemctl restart csm-rust'"
echo ""
echo "⚠️  Nếu dùng AI local, copy model GGUF vào:"
echo "   scp model.gguf $SERVER:$SERVER_PATH/csm_datas/ai_local/model/qwen2.5-coder-7b-instruct-q4_k_m.gguf"
