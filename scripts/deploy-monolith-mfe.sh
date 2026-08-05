#!/usr/bin/env bash
set -euo pipefail

SERVER="${1:-${DEPLOY_SERVER:-}}"
SERVER_PATH="${2:-${DEPLOY_PATH:-/root/la_server}}"
SOURCE_PUBLIC="${3:-$(cd "$(dirname "$0")/.." && pwd)/csm_datas/public}"

if [[ -z "$SERVER" ]]; then
  echo "Usage: $0 user@server [/remote/runtime/path] [/local/public/root]"
  exit 1
fi

for rp in admin web lmkt; do
  if [[ ! -f "$SOURCE_PUBLIC/$rp/index.html" ]]; then
    echo "ERROR: missing $SOURCE_PUBLIC/$rp/index.html"
    exit 1
  fi
  if [[ ! -f "$SOURCE_PUBLIC/$rp/mfe.manifest.json" ]]; then
    echo "ERROR: missing $SOURCE_PUBLIC/$rp/mfe.manifest.json"
    exit 1
  fi
done

echo "[mfe-deploy] target=$SERVER:$SERVER_PATH"
echo "[mfe-deploy] source=$SOURCE_PUBLIC"

ssh "$SERVER" "mkdir -p '$SERVER_PATH/csm_datas/public/admin' '$SERVER_PATH/csm_datas/public/web' '$SERVER_PATH/csm_datas/public/lmkt'"

rsync -az --delete \
  --exclude '.DS_Store' \
  "$SOURCE_PUBLIC/admin/" \
  "$SERVER:$SERVER_PATH/csm_datas/public/admin/"

rsync -az --delete \
  --exclude '.DS_Store' \
  "$SOURCE_PUBLIC/web/" \
  "$SERVER:$SERVER_PATH/csm_datas/public/web/"

rsync -az --delete \
  --exclude '.DS_Store' \
  "$SOURCE_PUBLIC/lmkt/" \
  "$SERVER:$SERVER_PATH/csm_datas/public/lmkt/"

ssh "$SERVER" bash -s "$SERVER_PATH" <<'VERIFY'
set -euo pipefail
P="$1"
for rp in admin web lmkt; do
  if [[ ! -f "$P/csm_datas/public/$rp/index.html" ]]; then
    echo "ERROR: missing $P/csm_datas/public/$rp/index.html"
    exit 1
  fi
  if [[ ! -f "$P/csm_datas/public/$rp/mfe.manifest.json" ]]; then
    echo "ERROR: missing $P/csm_datas/public/$rp/mfe.manifest.json"
    exit 1
  fi
  echo "[ok] $rp files=$(find "$P/csm_datas/public/$rp" -type f | wc -l | tr -d ' ')"
done
VERIFY

echo "[mfe-deploy] done"
