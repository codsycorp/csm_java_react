#!/bin/bash
# Cài SSL Let's Encrypt khớp nginx.conf trên server mới.
#
# nginx.conf dùng CHUNG một cert:
#   /etc/letsencrypt/live/admin.csmbridge.net/fullchain.pem
#   /etc/letsencrypt/live/admin.csmbridge.net/privkey.pem
#   include /etc/letsencrypt/options-ssl-nginx.conf
#   ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem
#
# ── Cách 1 (khuyên dùng): DNS đã trỏ IP server mới ──
#   export CERTBOT_EMAIL='admin@csmbridge.net'
#   ./scripts/install-ssl-nginx.sh
#
# ── Cách 2: copy cert từ server cũ (trước khi cắt DNS) ──
#   ./scripts/install-ssl-nginx.sh --copy-from root@www.csmbridge.net
#
# ── Chỉ deploy nginx.conf (cert đã có) ──
#   ./scripts/install-ssl-nginx.sh --deploy-only
#
# Biến môi trường:
#   CERTBOT_EMAIL          bắt buộc khi cấp cert mới (trừ --copy-from / --deploy-only)
#   NGINX_CONF             đường dẫn nginx.conf (auto-detect nếu không set)
#   CERT_NAME              mặc định: admin.csmbridge.net
#   SERVER_PUBLIC_IP       IP public (auto-detect nếu không set)
#   SKIP_DNS_CHECK=1       bỏ qua kiểm tra DNS trỏ về server này
#   CERTBOT_STAGING=1      dùng Let's Encrypt staging (test)
#
# Tuỳ chọn:
#   --dry-run  --force-renew  --cert-only  --deploy-only  --copy-from USER@HOST
#   --nginx-conf /path/to/nginx.conf
#
# Script copy lên /root (không trong repo):
#   scp nginx.conf scripts/install-ssl-nginx.sh root@103:/root/
#   NGINX_CONF=/root/nginx.conf /root/install-ssl-nginx.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Repo root chỉ hợp lệ khi script nằm trong scripts/
if [[ "$(basename "$SCRIPT_DIR")" == "scripts" && -f "$SCRIPT_DIR/../nginx.conf" ]]; then
	REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
	REPO_ROOT=""
fi

NGINX_CONF="${NGINX_CONF:-}"
CERT_NAME="${CERT_NAME:-admin.csmbridge.net}"
CERT_LIVE="/etc/letsencrypt/live/$CERT_NAME"

DRY_RUN=false
FORCE_RENEW=false
CERT_ONLY=false
DEPLOY_ONLY=false
COPY_FROM=""

resolve_nginx_conf() {
	if [[ -n "${NGINX_CONF:-}" && -f "$NGINX_CONF" ]]; then
		printf '%s' "$NGINX_CONF"
		return 0
	fi

	local candidate
	for candidate in \
		"${NGINX_CONF:-}" \
		"$SCRIPT_DIR/nginx.conf" \
		"/root/nginx.conf" \
		"/root/csm_server/nginx.conf" \
		"${REPO_ROOT:+$REPO_ROOT/nginx.conf}"; do
		[[ -n "$candidate" && -f "$candidate" ]] || continue
		printf '%s' "$candidate"
		return 0
	done
	return 1
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dry-run) DRY_RUN=true; shift ;;
	--force-renew) FORCE_RENEW=true; shift ;;
	--cert-only) CERT_ONLY=true; shift ;;
	--deploy-only) DEPLOY_ONLY=true; shift ;;
	--copy-from)
		COPY_FROM="${2:-}"
		[[ -n "$COPY_FROM" ]] || {
			echo "ERROR: --copy-from USER@HOST" >&2
			exit 1
		}
		shift 2
		;;
	--nginx-conf)
		NGINX_CONF="${2:-}"
		[[ -n "$NGINX_CONF" ]] || {
			echo "ERROR: --nginx-conf /path/to/nginx.conf" >&2
			exit 1
		}
		shift 2
		;;
	-h | --help)
		sed -n '2,35p' "$0"
		exit 0
		;;
	*)
		echo "Unknown option: $1" >&2
		exit 1
		;;
	esac
done

log() { echo "[$(date '+%F %T')] $*"; }

require_root() {
	if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
		echo "Chạy script bằng root: sudo $0" >&2
		exit 1
	fi
}

detect_public_ip() {
	if [[ -n "${SERVER_PUBLIC_IP:-}" ]]; then
		printf '%s' "$SERVER_PUBLIC_IP"
		return
	fi
	local ip=""
	ip="$(curl -4sf --max-time 8 ifconfig.me 2>/dev/null || true)"
	if [[ -z "$ip" ]]; then
		ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
	fi
	printf '%s' "$ip"
}

extract_domains_from_nginx() {
	local conf="$1"
	python3 - "$conf" <<'PY'
import re, sys
path = sys.argv[1]
names = set()
with open(path, encoding="utf-8", errors="replace") as fh:
    for raw in fh:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.search(r"\bserver_name\b(.+);", line)
        if not m:
            continue
        for part in m.group(1).split():
            part = part.strip()
            if part and part not in ("_", "default_server"):
                names.add(part)
for name in sorted(names):
    print(name)
PY
}

resolve_domain_ip() {
	local domain="$1"
	local ip=""
	ip="$(getent ahostsv4 "$domain" 2>/dev/null | awk '/RAW/{print $1; exit}')"
	if [[ -z "$ip" ]]; then
		ip="$(dig +short A "$domain" 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)"
	fi
	printf '%s' "$ip"
}

check_dns_for_domains() {
	local server_ip="$1"
	shift
	local domain failed=0
	log "Kiểm tra DNS (server IP: ${server_ip:-?})..."
	for domain; do
		local resolved
		resolved="$(resolve_domain_ip "$domain")"
		if [[ -z "$resolved" ]]; then
			log "  WARNING: $domain — không resolve được A record"
			failed=1
		elif [[ "$resolved" != "$server_ip" ]]; then
			log "  WARNING: $domain → $resolved (mong đợi $server_ip)"
			failed=1
		else
			log "  OK: $domain → $resolved"
		fi
	done
	if [[ $failed -ne 0 && "${SKIP_DNS_CHECK:-}" != 1 ]]; then
		log "ERROR: DNS chưa trỏ hết về server này."
		log "  Sau khi cắt DNS chạy lại, hoặc: SKIP_DNS_CHECK=1 $0 ..."
		exit 1
	fi
}

install_certbot() {
	if command -v certbot >/dev/null; then
		return 0
	fi
	log "Cài certbot..."
	apt-get update -qq
	apt-get install -y certbot
}

ensure_letsencrypt_ssl_extras() {
	mkdir -p /etc/letsencrypt

	if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
		log "Tạo /etc/letsencrypt/options-ssl-nginx.conf"
		local src=""
		for src in \
			/usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
			/usr/lib/python3*/site-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf; do
			if [[ -f "$src" ]]; then
				cp "$src" /etc/letsencrypt/options-ssl-nginx.conf
				break
			fi
		done
		if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
			curl -fsSL \
				"https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf" \
				-o /etc/letsencrypt/options-ssl-nginx.conf
		fi
	fi

	if [[ ! -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
		log "Tạo DH params (2048 bit, ~30s)..."
		openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
	fi
}

ensure_nginx_prereqs() {
	log "Chuẩn bị file/phụ thuộc nginx..."
	touch /etc/nginx/blocked_ips.conf
	mkdir -p /etc/nginx/snippets /var/cache/nginx/proxy
	if [[ ! -f /etc/nginx/snippets/fastcgi-php.conf ]]; then
		touch /etc/nginx/snippets/fastcgi-php.conf
	fi
	if [[ ! -f /etc/nginx/fastcgi.conf ]]; then
		# Ubuntu nginx package thường có; fallback tối thiểu
		cat >/etc/nginx/fastcgi.conf <<'EOF'
fastcgi_param  SCRIPT_FILENAME    $document_root$fastcgi_script_name;
include fastcgi_params;
EOF
	fi
}

cert_exists() {
	[[ -f "$CERT_LIVE/fullchain.pem" && -f "$CERT_LIVE/privkey.pem" ]]
}

copy_certs_from_source() {
	local source="$1"
	log "Copy /etc/letsencrypt từ $source ..."
	if $DRY_RUN; then
		log "[dry-run] rsync -a ${source}:/etc/letsencrypt/ /etc/letsencrypt/"
		return 0
	fi
	mkdir -p /etc/letsencrypt
	rsync -az "${source}:/etc/letsencrypt/" /etc/letsencrypt/
	chmod -R go-rwx /etc/letsencrypt/archive /etc/letsencrypt/live 2>/dev/null || true
	if ! cert_exists; then
		log "ERROR: sau copy không thấy $CERT_LIVE"
		log "  Kiểm tra cert trên server nguồn: ls /etc/letsencrypt/live/"
		exit 1
	fi
	log "Cert copy OK: $CERT_LIVE"
}

issue_cert_standalone() {
	local email="$1"
	shift
	local -a domains=("$@")
	local -a certbot_args=(
		certonly
		--standalone
		--non-interactive
		--agree-tos
		--keep-until-expiring
		--cert-name "$CERT_NAME"
		--email "$email"
	)
	if $FORCE_RENEW; then
		certbot_args+=(--force-renewal)
	fi
	if [[ "${CERTBOT_STAGING:-}" == 1 ]]; then
		certbot_args+=(--staging)
	fi
	local d
	for d in "${domains[@]}"; do
		certbot_args+=(-d "$d")
	done

	log "Cấp cert Let's Encrypt (${#domains[@]} domain, cert-name=$CERT_NAME)..."
	if $DRY_RUN; then
		log "[dry-run] certbot ${certbot_args[*]}"
		return 0
	fi

	local nginx_was_active=false
	if systemctl is-active nginx >/dev/null 2>&1; then
		nginx_was_active=true
		log "Dừng nginx tạm (standalone cần port 80)..."
		systemctl stop nginx
	fi

	local rc=0
	certbot "${certbot_args[@]}" || rc=$?

	if $nginx_was_active; then
		systemctl start nginx 2>/dev/null || true
	fi

	if [[ $rc -ne 0 ]]; then
		log "ERROR: certbot thất bại (exit $rc)"
		exit "$rc"
	fi

	if ! cert_exists; then
		log "ERROR: certbot xong nhưng không thấy $CERT_LIVE"
		exit 1
	fi
	log "Cert OK: $CERT_LIVE"
}

deploy_nginx_conf() {
	if [[ ! -f "$NGINX_CONF" ]]; then
		log "ERROR: không tìm thấy nginx.conf: $NGINX_CONF"
		exit 1
	fi

	log "Deploy nginx.conf → /etc/nginx/nginx.conf"
	if $DRY_RUN; then
		log "[dry-run] cp $NGINX_CONF /etc/nginx/nginx.conf && nginx -t && systemctl reload nginx"
		return 0
	fi

	cp /etc/nginx/nginx.conf "/etc/nginx/nginx.conf.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
	cp "$NGINX_CONF" /etc/nginx/nginx.conf
	nginx -t
	systemctl enable nginx 2>/dev/null || true
	systemctl reload nginx || systemctl start nginx
	log "nginx reload OK"
	if [[ -x "${SCRIPT_DIR}/verify-ai-endpoints.sh" ]]; then
		log "Verify AI endpoints..."
		"${SCRIPT_DIR}/verify-ai-endpoints.sh" || log "WARNING: verify-ai-endpoints failed — kiểm tra location blocks trên server"
	fi
}

setup_auto_renew() {
	if $DRY_RUN; then
		log "[dry-run] certbot renew --dry-run"
		return 0
	fi
	# Ubuntu 22: certbot.timer thường đã có sau apt install certbot
	systemctl enable certbot.timer 2>/dev/null || true
	systemctl start certbot.timer 2>/dev/null || true
	log "Test renew..."
	certbot renew --dry-run
}

verify_ssl() {
	local sample="${VERIFY_DOMAIN:-www.csmbridge.net}"
	log "Kiểm tra HTTPS $sample ..."
	if $DRY_RUN; then
		return 0
	fi
	if curl -fsSI --max-time 15 "https://${sample}/" >/dev/null 2>&1; then
		log "OK: https://${sample}/"
	else
		log "WARNING: curl https://${sample}/ thất bại — kiểm tra DNS/backend/nginx log"
	fi
	if command -v openssl >/dev/null && cert_exists; then
		log "Cert subject / expiry:"
		openssl x509 -in "$CERT_LIVE/fullchain.pem" -noout -subject -dates 2>/dev/null | sed 's/^/  /'
	fi
}

main() {
	require_root

	NGINX_CONF="$(resolve_nginx_conf)" || {
		log "ERROR: không tìm thấy nginx.conf"
		log "  scp nginx.conf lên server, rồi chạy:"
		log "  NGINX_CONF=/root/nginx.conf $0"
		log "  hoặc: $0 --nginx-conf /root/nginx.conf"
		exit 1
	}

	log "=== install-ssl-nginx ==="
	log "nginx.conf : $NGINX_CONF"
	log "cert-name  : $CERT_NAME"

	mapfile -t DOMAINS < <(extract_domains_from_nginx "$NGINX_CONF")
	if [[ ${#DOMAINS[@]} -eq 0 ]]; then
		log "ERROR: không trích được server_name từ nginx.conf"
		exit 1
	fi
	log "Domains (${#DOMAINS[@]}): ${DOMAINS[*]}"

	ensure_nginx_prereqs
	ensure_letsencrypt_ssl_extras

	if $DEPLOY_ONLY; then
		if ! cert_exists; then
			log "ERROR: --deploy-only nhưng chưa có cert tại $CERT_LIVE"
			exit 1
		fi
		deploy_nginx_conf
		verify_ssl
		log "=== Xong (deploy-only) ==="
		exit 0
	fi

	if [[ -n "$COPY_FROM" ]]; then
		copy_certs_from_source "$COPY_FROM"
	elif cert_exists && ! $FORCE_RENEW; then
		log "Cert đã tồn tại: $CERT_LIVE (bỏ qua cấp mới; dùng --force-renew để gia hạn sớm)"
	else
		install_certbot
		if [[ -z "${CERTBOT_EMAIL:-}" ]]; then
			log "ERROR: set CERTBOT_EMAIL khi cấp cert mới"
			log "  export CERTBOT_EMAIL='admin@csmbridge.net'"
			exit 1
		fi
		local server_ip
		server_ip="$(detect_public_ip)"
		check_dns_for_domains "$server_ip" "${DOMAINS[@]}"
		issue_cert_standalone "$CERTBOT_EMAIL" "${DOMAINS[@]}"
		setup_auto_renew
	fi

	if $CERT_ONLY; then
		log "=== Xong (cert-only) ==="
		exit 0
	fi

	deploy_nginx_conf
	verify_ssl
	log "=== Xong ==="
	log "Renew tự động: systemctl status certbot.timer"
}

main "$@"
