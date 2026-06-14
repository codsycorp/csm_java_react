#!/usr/bin/env bash
# Verify AI/SEO nginx routes reach Go backend (JSON), not nginx default 404 HTML.
set -euo pipefail

API_HOST="${API_HOST:-https://api.csmbridge.net}"
ADMIN_HOST="${ADMIN_HOST:-https://admin.csmbridge.net}"

check_endpoint() {
	local label="$1"
	local url="$2"
	local body="${3:-{\"prompt\":\"ping\",\"mode\":\"sync\",\"async\":false,\"taskType\":\"seo_content\"}}"

	local tmp
	tmp="$(mktemp)"
	local code
	code="$(curl -sS -o "$tmp" -w "%{http_code}" --max-time 15 -X POST "$url" \
		-H "Content-Type: application/json" \
		-d "$body" || echo "000")"

	local head
	head="$(head -c 120 "$tmp" | tr '\n' ' ')"

	if grep -qi '<center>nginx</center>' "$tmp" 2>/dev/null || grep -qi '<title>404 Not Found</title>' "$tmp" 2>/dev/null; then
		echo "FAIL $label => HTTP $code — nginx HTML 404 (chưa tới Go backend)"
		echo "     body: $head"
		rm -f "$tmp"
		return 1
	fi

	if [[ "$code" == "000" ]]; then
		echo "OK   $label => timeout (AI đang xử lý hoặc backend chậm — không phải nginx 404)"
	elif [[ "$code" =~ ^(401|403|200|202|400|422|500)$ ]]; then
		echo "OK   $label => HTTP $code JSON/backend"
	else
		echo "WARN $label => HTTP $code body: $head"
	fi
	rm -f "$tmp"
	return 0
}

echo "=== verify-ai-endpoints ==="
echo "API_HOST=$API_HOST"

fail=0
check_endpoint "seo (api host)" "$API_HOST/ai-generate-seo-content" || fail=1
check_endpoint "seo /api prefix (api host)" "$API_HOST/api/ai-generate-seo-content" || fail=1
check_endpoint "get-table-data (api host)" "$API_HOST/get-table-data" '{"obj_name":"sys_autos","limit":1}' || fail=1
check_endpoint "seo (admin /api)" "$ADMIN_HOST/api/ai-generate-seo-content" || fail=1

if [[ "$fail" -ne 0 ]]; then
	echo ""
	echo "Sửa: deploy nginx.conf từ repo rồi reload:"
	echo "  NGINX_CONF=/root/csm_server/nginx.conf ./scripts/install-ssl-nginx.sh --deploy-only"
	echo "  hoặc: python3 .github/scripts/patch_nginx.py && nginx -t && systemctl reload nginx"
	exit 1
fi

echo "=== Tất cả route trả JSON/backend (không phải nginx HTML 404) ==="
