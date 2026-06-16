#!/bin/bash
# Backup Pebble native data FROM server (download to local) — không ghi đè server.
#
# Usage:
#   ./backend-go/scripts/export-sys-autos-from-server.sh root@csmbridge.net /root/la_server
#
# Output: ./backups/server-native-YYYYMMDD-HHMMSS.tgz
set -euo pipefail

SERVER="${1:?user@host}"
SERVER_PATH="${2:-/root/la_server}"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$REPO_ROOT/backups"
OUT="$OUT_DIR/server-native-$STAMP.tgz"
REMOTE_TAR="/tmp/csm-native-backup-$STAMP.tgz"

mkdir -p "$OUT_DIR"

echo "=== Backup native data FROM server (read-only) ==="
echo "Server: $SERVER"
echo "Path:   $SERVER_PATH/csm_datas/native"
echo "Local:  $OUT"
echo ""

ssh "$SERVER" bash -s "$SERVER_PATH" "$REMOTE_TAR" <<'REMOTE'
set -e
P="$1"
TAR="$2"
NATIVE="$P/csm_datas/native"
if [ ! -d "$NATIVE" ]; then
  echo "missing $NATIVE" >&2
  exit 1
fi
echo "On server:"
echo "  legacy csm.kv: $(test -d "$NATIVE/pebble/csm.kv" && echo YES || echo NO)"
echo "  sys_autos dir: $(test -d "$NATIVE/pebble/csm/sys_autos" && echo YES || echo NO)"
du -sh "$NATIVE/pebble/csm.kv" "$NATIVE/pebble/csm/sys_autos" 2>/dev/null || true
tar czf "$TAR" -C "$P/csm_datas" native
echo "Created $TAR ($(du -h "$TAR" | cut -f1))"
REMOTE

scp "$SERVER:$REMOTE_TAR" "$OUT"
ssh "$SERVER" "rm -f '$REMOTE_TAR'" || true

echo ""
echo "✅ Downloaded: $OUT"
echo ""
echo "Giải nén local:"
echo "  mkdir -p /tmp/server-native-$STAMP && tar xzf $OUT -C /tmp/server-native-$STAMP"
echo ""
echo "sys_autos thường nằm ở 2 chỗ:"
echo "  native/pebble/csm.kv              ← legacy (JS vẫn chạy từ đây)"
echo "  native/pebble/csm/sys_autos/      ← per-table (editor thiếu trước fix Go)"
