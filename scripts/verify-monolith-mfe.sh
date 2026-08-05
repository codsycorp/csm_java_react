#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_ROOT="${1:-$ROOT/csm_datas/public}"

check_one() {
  local rp="$1"
  local root="$PUBLIC_ROOT/$rp"

  if [[ ! -f "$root/index.html" ]]; then
    echo "[fail] missing $root/index.html"
    return 1
  fi

  if [[ ! -f "$root/mfe.manifest.json" ]]; then
    echo "[fail] missing $root/mfe.manifest.json"
    return 1
  fi

  echo "[ok] $rp"
}

check_one admin
check_one web
check_one lmkt

echo "[ok] monolith mfe artifacts are ready"
