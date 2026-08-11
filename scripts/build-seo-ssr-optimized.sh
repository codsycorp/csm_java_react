#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_ROOT="${1:-$ROOT/csm_datas/public}"

log() {
  printf '[seo-build] %s\n' "$*"
}

build_app() {
  local app_dir="$1"
  local rp_index="$2"

  log "build ${app_dir} -> ${rp_index}"
  cd "$ROOT/$app_dir"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build:monolith

  mkdir -p "$PUBLIC_ROOT/$rp_index"
  rsync -az --delete \
    --exclude '.DS_Store' \
    "$ROOT/$app_dir/dist/" \
    "$PUBLIC_ROOT/$rp_index/"

  local js_count
  local br_count
  local gz_count
  js_count="$(find "$PUBLIC_ROOT/$rp_index" -type f -name '*.js' | wc -l | tr -d ' ')"
  br_count="$(find "$PUBLIC_ROOT/$rp_index" -type f -name '*.br' | wc -l | tr -d ' ')"
  gz_count="$(find "$PUBLIC_ROOT/$rp_index" -type f -name '*.gz' | wc -l | tr -d ' ')"

  log "artifact ${rp_index}: js=${js_count} br=${br_count} gz=${gz_count}"
}

mkdir -p "$PUBLIC_ROOT"

build_app "frontend-admin" "admin"
build_app "frontend-web" "web"
build_app "lmkt" "lmkt"

"$ROOT/scripts/verify-monolith-mfe.sh" "$PUBLIC_ROOT"

log "done"
log "public root: $PUBLIC_ROOT"
log "Next step: run backend and execute scripts/seo_predeploy_check.sh for SSR/meta latency gates."
