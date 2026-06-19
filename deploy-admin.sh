#!/bin/bash
# Build frontend-admin và đồng bộ lên server (csm_datas/public/{rp_index}/).
#
# Local dev (pnpm dev) dùng source mới; production phục vụ static từ public/admin/
# — commit git + deploy Go KHÔNG tự cập nhật admin SPA.
#
# Usage:
#   ./deploy-admin.sh root@your-server
#   ./deploy-admin.sh root@your-server /root/la_server admin
#
#   RP_INDEX=admin DEPLOY_PATH=/root/la_server ./deploy-admin.sh root@host
set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/la_server}}"
RP_INDEX="${3:-${RP_INDEX:-admin}}"

if [ -z "$SERVER" ]; then
	echo "Usage: $0 user@server-ip [/runtime-path] [rp_index]"
	echo "  rp_index mặc định: admin (khớp sys_la_routers.rp_index cho admin.*)"
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN_DIR="$SCRIPT_DIR/frontend-admin"
TARGET="$SERVER_PATH/csm_datas/public/$RP_INDEX"

echo "=== CSM Admin Frontend Deploy → $SERVER ==="
echo "    runtime : $TARGET"
echo "    source  : $ADMIN_DIR"

if [ ! -f "$ADMIN_DIR/package.json" ]; then
	echo "ERROR: frontend-admin/package.json not found" >&2
	exit 1
fi

echo ""
echo "▶ [1/3] Build frontend-admin (production)..."
cd "$ADMIN_DIR"
if ! command -v pnpm >/dev/null 2>&1; then
	echo "ERROR: pnpm not installed" >&2
	exit 1
fi
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build
if [ ! -f dist/index.html ]; then
	echo "ERROR: build failed — dist/index.html missing" >&2
	exit 1
fi
BUILD_VER="$(cat dist/version.json 2>/dev/null || echo unknown)"
echo "    build version: $BUILD_VER"

echo ""
echo "▶ [2/3] Rsync dist/ → $SERVER:$TARGET ..."
ssh "$SERVER" "mkdir -p '$TARGET'"
rsync -az --delete \
	--exclude '.DS_Store' \
	"$ADMIN_DIR/dist/" \
	"$SERVER:$TARGET/"

echo ""
echo "▶ [3/3] Verify on server..."
ssh "$SERVER" bash -s "$TARGET" <<'VERIFY'
set -e
T="$1"
if [ ! -f "$T/index.html" ]; then
	echo "ERROR: $T/index.html missing after rsync" >&2
	exit 1
fi
echo "    files: $(find "$T" -type f | wc -l | tr -d ' ')"
if [ -f "$T/version.json" ]; then
	echo "    version.json: $(cat "$T/version.json")"
fi
VERIFY

echo ""
echo "✅ Admin frontend deployed."
echo ""
echo "Kiểm tra sau deploy:"
echo "  curl -s https://admin.csmbridge.net/version.json"
echo "  (hard refresh trình duyệt: Cmd+Shift+R / Ctrl+Shift+R)"
echo ""
echo "Nếu combo vẫn lỗi sau khi version.json đúng — redeploy Go backend:"
echo "  ./deploy-go-linux.sh $SERVER $SERVER_PATH"
