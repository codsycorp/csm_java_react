#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/logs/seo"
REPORT_FILE="$REPORT_DIR/seo-audit-$(date +%Y%m%d-%H%M%S).json"

BASE_URL="${SEO_AUDIT_BASE_URL:-http://localhost:9999}"
HOST_OVERRIDE="${SEO_AUDIT_HOST_OVERRIDE:-localhost:3333}"
MAX_LATENCY_MS="${SEO_AUDIT_MAX_LATENCY_MS:-1200}"
MAX_LATENCY_DETAIL_MS="${SEO_AUDIT_MAX_LATENCY_DETAIL_MS:-2200}"
WARMUP_ROUNDS="${SEO_AUDIT_WARMUP_ROUNDS:-1}"
LANGS="${SEO_AUDIT_LANGS:-vi,en,zh}"
PATHS="${SEO_AUDIT_PATHS:-/phan-mem,/bat-dong-san,/lam-dep-my-pham,/cho-thue-xe,/booking-online,/hop-tac-kinh-doanh,/thong-ke-ket-qua-xo-so,/phan-mem/dich-vu-viet-tool-theo-yeu-cau-tu-dong-hoa-quy-trinh-but-pha-doanh-thu-2026,/bat-dong-san/3-bds-tp-hcm-dau-la-khoan-dau-tu-tot-nhat-nam-2024-phan-tich-roi-rui-ro}"

mkdir -p "$REPORT_DIR"

echo "[seo-predeploy] Running SEO gate"
echo "  base=$BASE_URL"
echo "  host_override=$HOST_OVERRIDE"
echo "  max_latency_ms=$MAX_LATENCY_MS"
echo "  max_latency_detail_ms=$MAX_LATENCY_DETAIL_MS"
echo "  warmup_rounds=$WARMUP_ROUNDS"
echo "  report=$REPORT_FILE"

python3 "$ROOT_DIR/scripts/seo_audit_ssr.py" \
  --base "$BASE_URL" \
  --host-override "$HOST_OVERRIDE" \
  --langs "$LANGS" \
  --paths "$PATHS" \
  --max-latency-ms "$MAX_LATENCY_MS" \
  --max-latency-detail-ms "$MAX_LATENCY_DETAIL_MS" \
  --warmup-rounds "$WARMUP_ROUNDS" \
  --output "$REPORT_FILE"

echo "[seo-predeploy] PASS: SEO gate passed"
echo "[seo-predeploy] Report: $REPORT_FILE"
