#!/bin/bash
# Cài LEMP stack trên Ubuntu 22.04 — parity server cũ (20.04):
#   nginx  1.18.x
#   MySQL  5.7.x
#   PHP    5.6 + php5.6-fpm  (socket: /var/run/php/php5.6-fpm.sock)
#
# Chạy TRÊN server mới (103.48.195.5), quyền root:
#   chmod +x scripts/install-lemp-ubuntu22.sh
#   ./scripts/install-lemp-ubuntu22.sh
#
# Tuỳ chọn:
#   MYSQL_ROOT_PASSWORD='...' ./scripts/install-lemp-ubuntu22.sh
#   ./scripts/install-lemp-ubuntu22.sh --skip-mysql   # đã restore DB từ migrate
#   ./scripts/install-lemp-ubuntu22.sh --skip-nginx
#
# Sau khi cài + migrate xong:
#   cp nginx.conf từ repo → /etc/nginx/nginx.conf
#   ./reload_nginx.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

SKIP_MYSQL=false
SKIP_NGINX=false
SKIP_PHP=false

while [[ $# -gt 0 ]]; do
	case "$1" in
	--skip-mysql) SKIP_MYSQL=true; shift ;;
	--skip-nginx) SKIP_NGINX=true; shift ;;
	--skip-php) SKIP_PHP=true; shift ;;
	-h | --help)
		sed -n '2,20p' "$0"
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

check_ubuntu() {
	if ! grep -qi 'ubuntu' /etc/os-release 2>/dev/null; then
		log "WARNING: không phải Ubuntu — script vẫn thử chạy"
		return
	fi
	local ver
	ver="$(. /etc/os-release && echo "${VERSION_ID:-}")"
	log "OS: Ubuntu ${ver}"
	if [[ "$ver" != "22.04" ]]; then
		log "WARNING: script tối ưu cho 22.04 (server cũ thường là 20.04)"
	fi
}

apt_base() {
	log "=== Cập nhật apt + gói nền ==="
	apt-get update -qq
	apt-get install -y -qq \
		ca-certificates curl gnupg lsb-release software-properties-common \
		apt-transport-https rsync openssh-client wget debconf-utils
}

install_nginx() {
	if $SKIP_NGINX; then
		log "Skip nginx"
		return
	fi
	log "=== Cài nginx ==="
	apt-get install -y -qq nginx
	mkdir -p /var/cache/nginx/proxy /etc/nginx/snippets
	touch /etc/nginx/blocked_ips.conf
	systemctl enable nginx
	systemctl restart nginx
	nginx -v 2>&1 | tee /tmp/lemp-versions.txt
}

install_mysql57() {
	if $SKIP_MYSQL; then
		log "Skip MySQL"
		return
	fi
	log "=== Cài MySQL 5.7 (Oracle APT repo) ==="

	if mysql --version 2>/dev/null | grep -q '5.7'; then
		log "MySQL 5.7 đã có: $(mysql --version)"
		return
	fi

	local cfg_deb="/tmp/mysql-apt-config.deb"
	local cfg_url="https://repo.mysql.com/mysql-apt-config_0.8.29-1_all.deb"
	wget -qO "$cfg_deb" "$cfg_url"

	# mysql-5.7 + repo Ubuntu focal (5.7 không có bản native jammy)
	echo "mysql-apt-config mysql-apt-config/select-server select mysql-5.7" | debconf-set-selections
	echo "mysql-apt-config mysql-apt-config/select-product select Ok" | debconf-set-selections
	echo "mysql-apt-config mysql-apt-config/repo-codename select focal" | debconf-set-selections
	if [[ -z "${MYSQL_ROOT_PASSWORD:-}" ]]; then
		log "WARNING: MYSQL_ROOT_PASSWORD chưa set — dpkg sẽ hỏi password root MySQL"
	else
		echo "mysql-community-server mysql-community-server/root-pass password ${MYSQL_ROOT_PASSWORD}" | debconf-set-selections
		echo "mysql-community-server mysql-community-server/re-root-pass password ${MYSQL_ROOT_PASSWORD}" | debconf-set-selections
	fi

	dpkg -i "$cfg_deb" || apt-get install -fy -qq
	rm -f "$cfg_deb"

	# Key + repo
	apt-get update -qq
	apt-get install -y -qq mysql-community-server mysql-client || {
		log "ERROR: cài mysql-community-server thất bại."
		log "Thử thủ công: dpkg -i mysql-apt-config && apt install mysql-community-server"
		exit 1
	}

	systemctl enable mysql
	systemctl restart mysql
	mysql --version | tee -a /tmp/lemp-versions.txt
}

install_php56() {
	if $SKIP_PHP; then
		log "Skip PHP"
		return
	fi
	log "=== Cài PHP 5.6 (Ondrej / sury) + php5.6-fpm ==="

	if php -v 2>/dev/null | grep -q 'PHP 5.6'; then
		log "PHP 5.6 đã có: $(php -v | head -1)"
		return
	fi

	# packages.sury.org — cùng nguồn server cũ (deb.sury.org)
	curl -fsSL https://packages.sury.org/php/apt.gpg | gpg --dearmor -o /usr/share/keyrings/sury-php.gpg
	echo "deb [signed-by=/usr/share/keyrings/sury-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" \
		>/etc/apt/sources.list.d/sury-php.list

	apt-get update -qq

	if ! apt-cache show php5.6-fpm >/dev/null 2>&1; then
		log "ERROR: php5.6-fpm không có trên $(lsb_release -sc)."
		log "Ubuntu 22.04 có thể không còn PHP 5.6 trên sury."
		log "Phương án:"
		log "  1) Dùng Docker: docker run php:5.6-fpm ..."
		log "  2) Giữ server nguồn 20.04 cho PHP, 103 chỉ chạy Go API + nginx proxy"
		exit 1
	fi

	apt-get install -y -qq \
		php5.6-fpm php5.6-cli php5.6-common \
		php5.6-mysql php5.6-mysqli php5.6-pdo \
		php5.6-gd php5.6-mbstring php5.6-xml php5.6-curl \
		php5.6-zip php5.6-json php5.6-opcache php5.6-readline

	# nginx.conf repo dùng socket này
	local sock="/var/run/php/php5.6-fpm.sock"
	if [[ ! -S "$sock" ]]; then
		log "WARNING: chưa thấy $sock — kiểm tra php5.6-fpm"
	fi

	systemctl enable php5.6-fpm
	systemctl restart php5.6-fpm
	php -v | head -1 | tee -a /tmp/lemp-versions.txt
}

post_install_notes() {
	log "=== Phiên bản đã cài ==="
	echo "--- nginx ---"
	nginx -v 2>&1 || true
	echo "--- mysql ---"
	mysql --version 2>/dev/null || true
	echo "--- php ---"
	php -v 2>/dev/null | head -1 || true
	echo "--- php-fpm socket ---"
	ls -la /var/run/php/php5.6-fpm.sock 2>/dev/null || echo "(chưa có socket)"

	cat <<'EOF'

=== Việc cần làm tiếp ===

1) Deploy nginx config từ repo:
   cp /root/la_server/../nginx.conf /etc/nginx/nginx.conf
   # hoặc scp từ Mac repo nginx.conf → /etc/nginx/nginx.conf
   nginx -t && systemctl reload nginx

2) PHP root (đã migrate):
   /root/la_php_server/   → php.csmbridge.net
   fastcgi_pass unix:/var/run/php/php5.6-fpm.sock;

3) MySQL: DB đã restore từ migrate-server-data.sh
   mysql -uroot -p -e "SHOW DATABASES;"

4) SSL (Let's Encrypt) — khớp nginx.conf:
   export CERTBOT_EMAIL='admin@csmbridge.net'
   ./scripts/install-ssl-nginx.sh
   # hoặc copy cert từ server cũ trước khi cắt DNS:
   # ./scripts/install-ssl-nginx.sh --copy-from root@www.csmbridge.net

5) Go backend (port 9999):
   systemctl enable --now csm-go

EOF
}

main() {
	require_root
	check_ubuntu
	apt_base
	install_nginx
	install_mysql57
	install_php56
	post_install_notes
	log "=== Xong ==="
}

main "$@"
