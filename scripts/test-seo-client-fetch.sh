#!/usr/bin/env bash
# Reproduce browser fetch to POST /ai-generate-seo-content (same headers as admin client).
# Usage:
#   CSM_TOKEN='eyJ...' ./scripts/test-seo-client-fetch.sh
#   CSM_TOKEN='...' CLIENT_ID='csm-...' MAX_TIME=30 ./scripts/test-seo-client-fetch.sh
#   CSM_TOKEN='...' BODY_FILE=/path/to/body.json ./scripts/test-seo-client-fetch.sh
set -euo pipefail

API_HOST="${API_HOST:-https://api.csmbridge.net}"
ORIGIN="${ORIGIN:-https://admin.csmbridge.net}"
CSM_TOKEN="${CSM_TOKEN:-${TOKEN:-}}"
CLIENT_ID="${CLIENT_ID:-csm-test-client-$(date +%s)}"
MAX_TIME="${MAX_TIME:-20}"
LANG="${CSM_LANG:-vi-VN}"

if [[ -z "$CSM_TOKEN" ]]; then
	echo "Thiếu CSM_TOKEN (hoặc TOKEN). Ví dụ:"
	echo "  CSM_TOKEN='eyJ...' $0"
	exit 1
fi

tmp_body="$(mktemp)"
tmp_hdr="$(mktemp)"
tmp_out="$(mktemp)"
trap 'rm -f "$tmp_body" "$tmp_hdr" "$tmp_out"' EXIT

if [[ -n "${BODY_FILE:-}" && -f "$BODY_FILE" ]]; then
	cp "$BODY_FILE" "$tmp_body"
elif [[ -n "${PROMPT:-}" ]]; then
	printf '%s' "{\"mode\":\"sync\",\"async\":false,\"taskType\":\"seo_content\",\"prompt\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$PROMPT")}" > "$tmp_body"
else
	cat > "$tmp_body" <<'EOF'
{"mode":"sync","async":false,"taskType":"seo_content","prompt":"test ping from test-seo-client-fetch.sh"}
EOF
fi

body_bytes="$(wc -c < "$tmp_body" | tr -d ' ')"
echo "=== test-seo-client-fetch ==="
echo "URL:      POST $API_HOST/ai-generate-seo-content"
echo "Origin:   $ORIGIN"
echo "Body:     ${body_bytes} bytes"
echo "Timeout:  ${MAX_TIME}s"
echo ""

code="$(curl -sS -D "$tmp_hdr" -o "$tmp_out" -w "%{http_code}" --max-time "$MAX_TIME" \
	-X POST "$API_HOST/ai-generate-seo-content" \
	-H "accept: application/json" \
	-H "accept-language: en-US,en;q=0.9" \
	-H "content-type: application/json" \
	-H "csm-lang: $LANG" \
	-H "csm-token: $CSM_TOKEN" \
	-H "x-client-id: $CLIENT_ID" \
	-H "Origin: $ORIGIN" \
	-H "Referer: $ORIGIN/" \
	-d @"$tmp_body" 2>/dev/null || true)"
code="${code:-000}"

head_body="$(head -c 200 "$tmp_out" | tr '\n' ' ')"
echo "HTTP:     $code"
echo "Headers:"
grep -E '^(HTTP/|content-type:|server:|x-request-id:)' "$tmp_hdr" 2>/dev/null | sed 's/^/  /' || true
echo "Body:     $head_body"

if grep -qi '<center>nginx</center>' "$tmp_out" 2>/dev/null; then
	echo ""
	echo "DIAG: nginx HTML 404 — request KHÔNG tới Go backend."
	echo "      Deploy nginx.conf: NGINX_CONF=/root/csm_server/nginx.conf ./scripts/install-ssl-nginx.sh --deploy-only"
	exit 1
fi

if [[ "$code" == "000" ]]; then
	echo ""
	echo "DIAG: timeout sau ${MAX_TIME}s — backend đang xử lý AI (OK, không phải nginx 404)."
	echo "      Tăng MAX_TIME nếu cần chờ kết quả: MAX_TIME=600 $0"
	exit 0
fi

if [[ "$code" == "404" ]]; then
	echo ""
	echo "DIAG: HTTP 404 JSON từ backend — route không tồn tại hoặc proxy sai upstream."
	exit 1
fi

if [[ "$code" =~ ^(401|403)$ ]]; then
	echo ""
	echo "DIAG: auth — token hết hạn hoặc thiếu quyền (endpoint tồn tại)."
	exit 0
fi

if [[ "$code" =~ ^(200|202)$ ]]; then
	echo ""
	echo "DIAG: OK — SEO endpoint phản hồi thành công."
	exit 0
fi

echo ""
echo "DIAG: HTTP $code — xem body phía trên."
exit 0
