#!/bin/bash
# deploy-rust-linux.sh — Cross-compile trên Mac, upload binary lên Linux server
# Không cần Rust/build tools trên server. Server chỉ cần SSH access.
#
# Yêu cầu trên Mac:
#   cargo install cross   (1 lần)
#   Docker Desktop đang chạy
#
# Dùng: ./deploy-rust-linux.sh user@server-ip [/path/on/server]

set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/csm_server}}"
TARGET="x86_64-unknown-linux-gnu"

if [ -z "$SERVER" ]; then
    echo "Usage: $0 user@server-ip [/path/on/server]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/backend-rust"
BINARY="$RUST_DIR/target/$TARGET/release/csm_server"

echo "=== CSM Rust Deploy → $SERVER:$SERVER_PATH ==="

# ── Bước 1: Cross-compile trên Mac ──────────────────────────────────────────
echo ""
echo "▶ [1/3] Cross-compile cho Linux ($TARGET)..."

# Kiểm tra cross tool
if ! command -v cross &>/dev/null; then
    echo "Cài cross..."
    cargo install cross --git https://github.com/cross-rs/cross
fi

# Kiểm tra Docker
if ! docker info &>/dev/null 2>&1; then
    echo "❌ Docker chưa chạy. Mở Docker Desktop rồi thử lại."
    exit 1
fi

cd "$RUST_DIR"
cross build --release --target "$TARGET"

echo "✅ Build xong: $(ls -lh "$BINARY")"

# ── Bước 2: Upload binary + config lên server ────────────────────────────────
echo ""
echo "▶ [2/3] Upload lên server..."

# Tạo thư mục trên server
ssh "$SERVER" "mkdir -p $SERVER_PATH/bin $SERVER_PATH/csm_datas/database \
    $SERVER_PATH/csm_datas/backups $SERVER_PATH/csm_datas/lucene_index \
    $SERVER_PATH/csm_datas/ai_local/model"

# Upload binary (~20MB, không cần upload source)
scp "$BINARY" "$SERVER:$SERVER_PATH/bin/csm_server"
ssh "$SERVER" "chmod +x $SERVER_PATH/bin/csm_server"

# Upload config (secrets không commit git)
scp "$SCRIPT_DIR/config.env" "$SERVER:$SERVER_PATH/config.env"

echo "✅ Upload xong"

# ── Bước 3: Tạo/restart systemd service ─────────────────────────────────────
echo ""
echo "▶ [3/3] Khởi động service..."

ssh "$SERVER" bash -s "$SERVER_PATH" <<'REMOTE'
set -e
P="$1"

cat > /etc/systemd/system/csm-rust.service <<EOF
[Unit]
Description=CSM Rust Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$P
EnvironmentFile=$P/config.env
ExecStart=$P/bin/csm_server
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
REMOTE

echo ""
echo "✅ Deploy xong! Binary chạy trực tiếp, không cần Rust trên server."
echo ""
echo "Lệnh hữu ích:"
echo "  Log    : ssh $SERVER 'journalctl -u csm-rust -f'"
echo "  Stop   : ssh $SERVER 'systemctl stop csm-rust'"
echo "  Restart: ssh $SERVER 'systemctl restart csm-rust'"
