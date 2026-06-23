#!/usr/bin/env bash
# Đẩy gói Rust Linux lên server → /root/la_server và (tuỳ chọn) cài systemd.
#
# Usage:
#   ./docker-build.sh --linux
#   ./deploy-rust-la-server.sh root@your-server
#   ./deploy-rust-la-server.sh root@your-server --install
#   ./deploy-rust-la-server.sh root@your-server --install --migrate-go
#
# Layout server (/root/la_server):
#   csm_rust_server          wrapper + bin/ + lib/
#   config.env               (giữ nguyên nếu đã có)
#   csm_datas/               (giữ nguyên nếu đã có)
#   install-csm-rust-service.sh
set -euo pipefail

RUST_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$RUST_DIR/.." && pwd)"
SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${DEPLOY_PATH:-/root/la_server}"
PKG="${PKG:-$REPO_ROOT/dist/csm-rust-linux-amd64.tar.gz}"
DO_INSTALL=false
DO_MIGRATE=false

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) DO_INSTALL=true; shift ;;
    --migrate-go) DO_MIGRATE=true; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SERVER" ]]; then
  echo "Usage: $0 user@host [--install] [--migrate-go]" >&2
  exit 1
fi

if [[ ! -f "$PKG" ]]; then
  echo "[deploy] Package not found: $PKG" >&2
  echo "  Run: cd backend-rust && ./docker-build.sh --linux" >&2
  exit 1
fi

REMOTE_PKG="/tmp/csm-rust-linux-amd64.tar.gz"
echo "[deploy] Upload $PKG → $SERVER:$REMOTE_PKG"
scp "$PKG" "$SERVER:$REMOTE_PKG"

echo "[deploy] Extract → $SERVER_PATH (merge, không xóa csm_datas/config cũ)"
ssh "$SERVER" bash -s "$SERVER_PATH" "$REMOTE_PKG" <<'REMOTE'
set -euo pipefail
P="$1"
TAR="$2"
mkdir -p "$P"

# tar | head với pipefail → SIGPIPE/exit 141; tắt tạm khi đọc dòng đầu
set +o pipefail
FIRST=$(tar -tzf "$TAR" 2>/dev/null | head -1 || true)
set -o pipefail

if [[ "$FIRST" == csm-rust-linux-amd64/* ]]; then
  echo "[deploy] tarball có subfolder csm-rust-linux-amd64/ — flatten vào $P"
  tar xzf "$TAR" --strip-components=1 -C "$P"
else
  tar xzf "$TAR" -C "$P"
fi

# Lần deploy cũ có thể đã tạo subfolder — gộp lên root
if [[ -d "$P/csm-rust-linux-amd64" ]]; then
  echo "[deploy] gộp thư mục cũ csm-rust-linux-amd64/ → $P"
  rsync -a "$P/csm-rust-linux-amd64/" "$P/"
  rm -rf "$P/csm-rust-linux-amd64"
fi

chmod +x "$P/csm_rust_server" "$P/bin/csm_rust_server" 2>/dev/null || true
chmod +x "$P"/*.sh 2>/dev/null || true
rm -f "$TAR"

if [[ ! -x "$P/install-csm-rust-service.sh" ]]; then
  echo "[deploy] ERROR: thiếu $P/install-csm-rust-service.sh sau giải nén" >&2
  echo "[deploy] Kiểm tra: ls -la $P/csm-rust-linux-amd64/ 2>/dev/null || ls -la $P" >&2
  exit 1
fi

echo "[deploy] OK — Rust files:"
ls -la "$P"/csm_rust_server "$P"/bin/csm_rust_server "$P"/install-csm-rust-service.sh 2>/dev/null
if command -v file >/dev/null 2>&1; then
  echo "[deploy] binary arch: $(file -b "$P/bin/csm_rust_server")"
fi
du -sh "$P" "$P/csm_datas" 2>/dev/null || du -sh "$P"
REMOTE

if $DO_MIGRATE; then
  echo "[deploy] migrate-go-to-rust (reindex) on server..."
  ssh "$SERVER" bash -s "$SERVER_PATH" <<'MIGRATE'
set -euo pipefail
P="$1"
export CSM_HOME="$P"
export APP_DATA_DIR="$P/csm_datas"
export CSM_NATIVE_DATA_DIR="$APP_DATA_DIR/native"
export CSM_PEBBLE_ROOT="$CSM_NATIVE_DATA_DIR/pebble"
export CSM_VECTOR_DIR="$CSM_NATIVE_DATA_DIR/vector/qdrant"
export LD_LIBRARY_PATH="$P/lib:${LD_LIBRARY_PATH:-}"
if [[ -x "$P/bin/csm_rust_server" ]]; then
  # chạy reindex inline nếu chưa có cargo trên server
  echo "[deploy] Run csm_migrate_go via binary dir — use scripts on Mac before cutover if needed"
fi
MIGRATE
  echo "[deploy] Tip: trên Mac chạy scripts/migrate-go-to-rust.sh với APP_DATA_DIR trỏ data server"
fi

if $DO_INSTALL; then
  echo "[deploy] systemctl install csm-rust..."
  ssh "$SERVER" "cd '$SERVER_PATH' && ./install-csm-rust-service.sh"
fi

echo ""
echo "✅ Deploy xong → $SERVER:$SERVER_PATH"
echo "   Health: ssh $SERVER 'curl -s http://127.0.0.1:9999/monitoring/health'"
echo "   Logs:   ssh $SERVER 'journalctl -u csm-rust -f'"
echo ""
echo "Cutover Go → Rust:"
echo "   ssh $SERVER 'systemctl stop csm-go && systemctl start csm-rust'"
