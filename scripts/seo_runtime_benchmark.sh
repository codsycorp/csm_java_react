#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/logs/seo"
REPORT_FILE="$REPORT_DIR/seo-runtime-benchmark-$(date +%Y%m%d-%H%M%S).txt"

BASE_URL="${SEO_BENCH_BASE_URL:-http://localhost:9999}"
HOST_OVERRIDE="${SEO_BENCH_HOST_OVERRIDE:-localhost:3333}"
RUNS="${SEO_BENCH_RUNS:-3}"
PATHS="${SEO_BENCH_PATHS:-/phan-mem,/bat-dong-san,/hop-tac-kinh-doanh,/phan-mem/dich-vu-viet-tool-theo-yeu-cau-tu-dong-hoa-quy-trinh-but-pha-doanh-thu-2026}"

mkdir -p "$REPORT_DIR"

IFS=',' read -r -a URL_PATHS <<< "$PATHS"

log() {
  printf '%s\n' "$*" | tee -a "$REPORT_FILE"
}

curl_stats() {
  local url="$1"
  curl -sS -o /dev/null \
    -H "Accept-Encoding: br, gzip" \
    -w "code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download} type=%{content_type}" \
    "$url"
}

header_value() {
  local url="$1"
  local header_name="$2"
  curl -sSI -H "Accept-Encoding: br, gzip" "$url" | awk -v h="$header_name" 'BEGIN{IGNORECASE=1} $0 ~ "^"h":" {sub(/^[^:]+:[[:space:]]*/, "", $0); gsub(/\r/, "", $0); print; exit}'
}

log "[seo-bench] base=$BASE_URL host_override=$HOST_OVERRIDE runs=$RUNS"
log "[seo-bench] report=$REPORT_FILE"

for raw_path in "${URL_PATHS[@]}"; do
  path="$(echo "$raw_path" | xargs)"
  if [[ -z "$path" ]]; then
    continue
  fi
  if [[ "$path" != /* ]]; then
    path="/$path"
  fi

  page_url="$BASE_URL$path?__host=$HOST_OVERRIDE&hl=vi"
  log ""
  log "=== PAGE $path ==="

  for ((i=1; i<=RUNS; i++)); do
    stats="$(curl_stats "$page_url")"
    log "run#$i $stats"
  done

  html="$(curl -sS -H "Accept-Encoding: br, gzip" "$page_url")"
  asset="$(printf '%s' "$html" | grep -Eo '<script[^>]+src="[^"]*/assets/[^"]+\.(js|mjs)"' | sed -E 's/.*src="([^"]+)".*/\1/' | head -n1)"
  if [[ -z "$asset" ]]; then
    asset="$(printf '%s' "$html" | grep -Eo '<link[^>]+href="[^"]*/assets/[^"]+\.css"' | sed -E 's/.*href="([^"]+)".*/\1/' | head -n1)"
  fi

  if [[ -n "$asset" ]]; then
    [[ "$asset" == /* ]] || asset="/$asset"
    asset_url="$BASE_URL$asset?__host=$HOST_OVERRIDE"
    enc="$(header_value "$asset_url" "Content-Encoding")"
    cache="$(header_value "$asset_url" "Cache-Control")"
    vary="$(header_value "$asset_url" "Vary")"
    log "asset=$asset"
    log "asset.headers encoding=${enc:-<none>} cache=${cache:-<none>} vary=${vary:-<none>}"
  else
    log "asset=<not-found-in-html>"
  fi
done

log ""
log "[seo-bench] done"
