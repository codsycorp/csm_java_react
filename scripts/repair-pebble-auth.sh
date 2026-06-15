#!/bin/bash
# Repair auth tables: copy csm_accounts + csm_group_members from Java RocksDB → Go Pebble.
# Stop Go server first (Pebble LOCK), then restart after repair.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$ROOT/backend-go"
source "$ROOT/config.env" 2>/dev/null || true

export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$ROOT/backend/csm_datas/database}"
export APP_DATA_DIR="${APP_DATA_DIR:-$ROOT/backend/csm_datas}"
DEST="${APP_DATA_DIR}/native"

echo "[repair-auth] RocksDB source: $ROCKSDB_ROOT_DIR"
echo "[repair-auth] Pebble dest:    $DEST/pebble"
echo "[repair-auth] Stop ./run-go-server.sh (Ctrl+C) if running, then press Enter..."
read -r _

cd "$GO_DIR"
go run ./cmd/migrate \
  -source "$ROCKSDB_ROOT_DIR" \
  -dest "$DEST" \
  -only-tables "csm/csm_accounts,csm/csm_group_members,csm/sys_autos"

echo "[repair-auth] Done. Start Go server: cd backend-go && ./run-go-server.sh"
