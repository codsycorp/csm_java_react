#!/bin/bash
# Split monolithic csm.kv into pebble/{app_id}/{table_name}/ directories.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$(cd "$(dirname "$0")" && pwd)"

export APP_DATA_DIR="${APP_DATA_DIR:-$ROOT/backend/csm_datas}"
export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
LEGACY="${CSM_PEBBLE_LEGACY:-$CSM_PEBBLE_ROOT/csm.kv}"

cd "$GO_DIR"
echo "[repartition] legacy: $LEGACY"
echo "[repartition] dest:   $CSM_PEBBLE_ROOT/{app_id}/{table_name}/"

export CGO_ENABLED=0
go run ./cmd/pebble-repartition -legacy "$LEGACY" -dest "$CSM_PEBBLE_ROOT" "$@"
