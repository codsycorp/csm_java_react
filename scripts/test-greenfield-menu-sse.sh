#!/usr/bin/env bash
# Retest greenfield menu on 1.5B: scaffold-first + business_reasoning SSE
# Usage:
#   export CSM_TEST_USER="your@email.com"
#   export CSM_TEST_PASS="yourpassword"
#   ./scripts/test-greenfield-menu-sse.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${CSM_BASE_URL:-http://127.0.0.1:15300}"
USER="${CSM_TEST_USER:-}"
PASS="${CSM_TEST_PASS:-}"

if [[ -z "$USER" || -z "$PASS" ]]; then
  echo "Set CSM_TEST_USER and CSM_TEST_PASS (dev account with menu AI access)."
  exit 1
fi

echo "[1/3] Login..."
LOGIN_JSON=$(curl -sS -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER\",\"password\":\"$PASS\"}")

TOKEN=$(echo "$LOGIN_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result') or d; print(r.get('token',''))" 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  echo "Login failed: $LOGIN_JSON"
  exit 1
fi
echo "  OK — token acquired"

APP_ID=$(echo "$LOGIN_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result') or d; print(r.get('app_id','csm'))" 2>/dev/null || echo "csm")
JOB_ID="job_test_$(date +%s)_gf"
MSG="Tạo menu ERP đầy đủ: danh mục sản phẩm, khách hàng, xuất nhập tồn, công nợ khách hàng, báo cáo bán hàng và tồn kho"

echo "[2/3] SSE ai-code-stream (menu greenfield, empty editor)..."
echo "  jobId=$JOB_ID"
echo "  message=$MSG"

OUT_FILE=$(mktemp /tmp/csm_gf_sse_XXXXXX.txt)
START_MS=$(python3 -c "import time; print(int(time.time()*1000))")

curl -sS -N -X POST "$BASE_URL/api/ai-code-stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"appId\": \"$APP_ID\",
    \"jobId\": \"$JOB_ID\",
    \"message\": \"$MSG\",
    \"currentCode\": \"{\\\"menu\\\": []}\",
    \"language\": \"json\",
    \"contextType\": \"menu_json\",
    \"responseMode\": \"edit\",
    \"flowType\": \"menu_manager\",
    \"taskType\": \"menu_design\"
  }" 2>&1 | tee "$OUT_FILE" &
CURL_PID=$!

# Wait up to 15 minutes
for i in $(seq 1 900); do
  if ! kill -0 "$CURL_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
if kill -0 "$CURL_PID" 2>/dev/null; then
  kill "$CURL_PID" 2>/dev/null || true
  echo "  TIMEOUT after 900s"
fi

END_MS=$(python3 -c "import time; print(int(time.time()*1000))")
ELAPSED=$(( (END_MS - START_MS) / 1000 ))

echo ""
echo "[3/3] Checklist (elapsed ${ELAPSED}s)"
check_stage() {
  local stage="$1"
  if grep -q "\"stage\":\"$stage\"" "$OUT_FILE" || grep -q "stage.*$stage" "$OUT_FILE"; then
    echo "  ✅ SSE stage: $stage"
    return 0
  else
    echo "  ❌ SSE stage: $stage — NOT FOUND"
    return 1
  fi
}

FAIL=0
check_stage "business_comprehend" || FAIL=1
check_stage "business_plan" || FAIL=1
check_stage "business_reasoning" || FAIL=1
check_stage "menu_module_step" || FAIL=1
check_stage "menu_scaffold_assemble" || FAIL=1
check_stage "menu_module_enrich" || FAIL=1

if grep -q "skipped thin LLM worker\|skippedLlmWorker\|local_scaffold" "$OUT_FILE" 2>/dev/null; then
  echo "  ✅ scaffold-first path detected"
else
  echo "  ⚠️  scaffold-first message not in SSE (check server log MENU_GREENFIELD scaffold-first)"
fi

echo ""
echo "Server log grep hints:"
echo "  grep '$JOB_ID\\|scaffold-first\\|business_reasoning' $ROOT/backend/logs/console.log"
echo ""
echo "SSE saved: $OUT_FILE"
exit $FAIL
