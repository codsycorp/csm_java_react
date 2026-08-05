#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_ROOT="${1:-$ROOT/csm_datas/public}"

build_app() {
  local app_dir="$1"
  local rp_index="$2"

  echo "[mfe] build ${app_dir} -> ${rp_index}"
  cd "$ROOT/$app_dir"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build:monolith

  mkdir -p "$PUBLIC_ROOT/$rp_index"
  rsync -az --delete \
    --exclude '.DS_Store' \
    "$ROOT/$app_dir/dist/" \
    "$PUBLIC_ROOT/$rp_index/"
}

mkdir -p "$PUBLIC_ROOT"

build_app "frontend-admin" "admin"
build_app "frontend-web" "web"
build_app "lmkt" "lmkt"

echo "[mfe] done"
echo "[mfe] public root: $PUBLIC_ROOT"
