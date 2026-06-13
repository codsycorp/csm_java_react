#!/bin/bash
# One-time RocksDB → Pebble + sqlite-vec migration (uses rocksdb_ldb CLI, no CGO).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$(cd "$(dirname "$0")" && pwd)"

export APP_DATA_DIR="${APP_DATA_DIR:-$ROOT/backend/csm_datas}"
export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$APP_DATA_DIR/database}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"

SOURCE="${1:-$ROCKSDB_ROOT_DIR}"
DEST="${2:-$CSM_NATIVE_DATA_DIR}"

if ! command -v rocksdb_ldb >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/rocksdb_ldb ]; then
  echo "rocksdb_ldb not found. Run: brew install rocksdb"
  exit 1
fi

cd "$GO_DIR"
echo "[migrate] source=$SOURCE dest=$DEST"
echo "[migrate] skipping app: fidovnemail (override with -skip-apps)"
export CGO_ENABLED=0
go run ./cmd/migrate -source "$SOURCE" -dest "$DEST" "${@:3}"
