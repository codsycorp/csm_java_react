#!/bin/bash
# Chép dữ liệu từ server cũ → server mới (Ubuntu 22.04).
#
# Mặc định:
#   Nguồn : root@www.csmbridge.net  (DNS → 45.119.82.92, server cũ)
#   Đích  : root@103.48.195.5
#   Thư mục: /root/la_server, /root/la_php_server
#   MySQL : toàn bộ database (--all-databases)
#
# ── Cách A: Mac có SSH tới CẢ 2 server ──
#   export MYSQL_ROOT_PASSWORD='...'
#   ./scripts/migrate-server-data.sh
#
# ── Cách B (khuyên dùng): chỉ SSH được tới server đích ──
#   Mac → 103, script chạy TRÊN 103 và pull từ 45:
#   export MYSQL_ROOT_PASSWORD='...'
#   ./scripts/migrate-server-data.sh --on-dest
#
#   Trên 103 cần SSH được tới 45 (một lần):
#   ssh root@www.csmbridge.net
#   hoặc: ssh-copy-id root@www.csmbridge.net
#
# ── Cách C: đã SSH vào 103, chạy trực tiếp (khuyên sau ssh-copy-id) ──
#   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
#   ssh-copy-id root@www.csmbridge.net
#   export MYSQL_ROOT_PASSWORD='...'
#   /root/migrate-server-data.sh --local-dest
#
# Lưu ý: cài MySQL trước khi restore (install-lemp-ubuntu22.sh) hoặc dùng --dirs-only
#
# Tuỳ chọn:
#   --dry-run  --dirs-only  --mysql-only  --delete  --no-stop-services
#
# Biến môi trường:
#   SOURCE_HOST, DEST_HOST, SOURCE_USER, DEST_USER
#   MYSQL_ROOT_PASSWORD, MYSQL_ROOT_USER
#   SSH_IDENTITY_FILE=/path/to/key   (tuỳ chọn)
#   SSH_EXTRA_OPTS='-o ...'          (tuỳ chọn)
set -euo pipefail

normalize_ssh_host() {
	local raw="${1:-}"
	raw="${raw#https://}"
	raw="${raw#http://}"
	raw="${raw%%/*}"
	raw="${raw%%:*}" # bỏ :443 nếu user dán cả URL
	printf '%s' "$raw"
}

SOURCE_HOST="$(normalize_ssh_host "${SOURCE_HOST:-www.csmbridge.net}")"
DEST_HOST="$(normalize_ssh_host "${DEST_HOST:-103.48.195.5}")"
SOURCE_USER="${SOURCE_USER:-root}"
DEST_USER="${DEST_USER:-root}"
SOURCE="${SOURCE_USER}@${SOURCE_HOST}"
DEST="${DEST_USER}@${DEST_HOST}"

MYSQL_ROOT_USER="${MYSQL_ROOT_USER:-root}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"

DIRS=(
	"/root/la_server"
	"/root/la_php_server"
)

DRY_RUN=false
DIRS_ONLY=false
MYSQL_ONLY=false
RSYNC_DELETE=false
STOP_SERVICES=true
LOCAL_DEST=false
ON_DEST=false

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dry-run)
		DRY_RUN=true
		shift
		;;
	--dirs-only)
		DIRS_ONLY=true
		shift
		;;
	--mysql-only)
		MYSQL_ONLY=true
		shift
		;;
	--delete)
		RSYNC_DELETE=true
		shift
		;;
	--no-stop-services)
		STOP_SERVICES=false
		shift
		;;
	--local-dest)
		LOCAL_DEST=true
		shift
		;;
	--on-dest)
		ON_DEST=true
		shift
		;;
	-h | --help)
		sed -n '2,38p' "$0"
		exit 0
		;;
	*)
		echo "[migrate] unknown option: $1" >&2
		exit 1
		;;
	esac
done

if $DIRS_ONLY && $MYSQL_ONLY; then
	echo "[migrate] ERROR: --dirs-only and --mysql-only are mutually exclusive" >&2
	exit 1
fi

SSH_CONTROL_PATH="${SSH_CONTROL_PATH:-${HOME}/.ssh/csm-migrate-%r@%h:%p}"

log() {
	echo "[$(date '+%F %T')] $*"
}

# Mac/laptop: đẩy script lên server đích và chạy --local-dest tại đó.
if $ON_DEST && ! $LOCAL_DEST; then
	REMOTE_SCRIPT="/tmp/csm-migrate-server-data.sh"
	REMOTE_ARGS=()
	$DRY_RUN && REMOTE_ARGS+=(--dry-run)
	$DIRS_ONLY && REMOTE_ARGS+=(--dirs-only)
	$MYSQL_ONLY && REMOTE_ARGS+=(--mysql-only)
	$RSYNC_DELETE && REMOTE_ARGS+=(--delete)
	$STOP_SERVICES || REMOTE_ARGS+=(--no-stop-services)
	REMOTE_ARGS+=(--local-dest)

	echo "[migrate] Upload script → $DEST and run --local-dest (pull from $SOURCE)"
	mkdir -p "${HOME}/.ssh"
	chmod 700 "${HOME}/.ssh" 2>/dev/null || true
	scp_common=(
		-o StrictHostKeyChecking=accept-new
		-o ControlMaster=auto
		-o "ControlPath=${SSH_CONTROL_PATH}"
		-o ControlPersist=3600
	)
	[[ -n "${SSH_IDENTITY_FILE:-}" && -f "${SSH_IDENTITY_FILE}" ]] && scp_common+=(-i "$SSH_IDENTITY_FILE")
	log "SSH tới $DEST (nhập password 1 lần nếu chưa có key)..."
	scp "${scp_common[@]}" "$0" "${DEST}:${REMOTE_SCRIPT}"
	ssh_common_opts
	ssh "${SSH_OPTS_ARR[@]}" "$DEST" \
		"chmod +x '$REMOTE_SCRIPT' && \
		 SOURCE_HOST='$SOURCE_HOST' SOURCE_USER='$SOURCE_USER' \
		 MYSQL_ROOT_USER='$MYSQL_ROOT_USER' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' \
		 LOG_DIR='${LOG_DIR:-}' \
		 bash '$REMOTE_SCRIPT' ${REMOTE_ARGS[*]:-}"
	exit $?
fi

TS="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${LOG_DIR:-/tmp/csm-migrate-$TS}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/migrate.log"

log() {
	echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"
}

ssh_common_opts() {
	SSH_OPTS_ARR=(
		-o StrictHostKeyChecking=accept-new
		-o ConnectTimeout=20
		-o ControlMaster=auto
		-o "ControlPath=${SSH_CONTROL_PATH}"
		-o ControlPersist=3600
	)
	if [[ -n "${SSH_IDENTITY_FILE:-}" && -f "${SSH_IDENTITY_FILE}" ]]; then
		SSH_OPTS_ARR+=(-i "$SSH_IDENTITY_FILE")
	fi
	if [[ -n "${SSH_EXTRA_OPTS:-}" ]]; then
		# shellcheck disable=SC2206
		SSH_OPTS_ARR+=($SSH_EXTRA_OPTS)
	fi
}

ssh_has_key_auth() {
	local target="$1"
	ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
		${SSH_IDENTITY_FILE:+-i "$SSH_IDENTITY_FILE"} \
		"$target" "echo ok" >/dev/null 2>&1
}

warmup_ssh_sessions() {
	log "Mở phiên SSH (nếu chưa có key: nhập password MỖI server MỘT lần)..."
	ssh_common_opts
	ssh "${SSH_OPTS_ARR[@]}" "$SOURCE" "echo '[migrate] SSH source OK'"
	if ! $LOCAL_DEST; then
		ssh "${SSH_OPTS_ARR[@]}" "$DEST" "echo '[migrate] SSH dest OK'"
	fi
}

check_ssh_requirements() {
	mkdir -p "${HOME}/.ssh"
	chmod 700 "${HOME}/.ssh" 2>/dev/null || true

	local need_source_key=true
	local need_dest_key=true
	$LOCAL_DEST && need_dest_key=false

	if ! ssh_has_key_auth "$SOURCE"; then
		need_source_key=false
	fi
	if $need_dest_key && ! $LOCAL_DEST && ! ssh_has_key_auth "$DEST"; then
		need_dest_key=false
	fi

	if $LOCAL_DEST && $need_source_key; then
		return 0
	fi

	if $LOCAL_DEST && ! $need_source_key; then
		log "ERROR: server đích chưa có SSH key tới nguồn $SOURCE"
		log "  ssh-keygen -t ed25519 -N \"\" -f ~/.ssh/id_ed25519"
		log "  ssh-copy-id $SOURCE"
		exit 1
	fi
	if ! $LOCAL_DEST && $need_source_key && $need_dest_key; then
		return 0
	fi
	if $ON_DEST && ! $LOCAL_DEST && $need_dest_key; then
		return 0
	fi

	log "⚠ Mac chưa có SSH key (password-only)."
	if ! $LOCAL_DEST && ! $need_source_key; then
		log "  Nguồn $SOURCE: chưa có key → rsync sẽ hỏi password rất nhiều lần."
		log "  Khuyên: ./scripts/migrate-server-data.sh --on-dest"
		log "          (chỉ SSH Mac→103; trên 103 chạy ssh-copy-id $SOURCE)"
		if [[ "${ALLOW_SSH_PASSWORD:-}" != 1 ]]; then
			echo "[migrate] ERROR: thiếu SSH key tới nguồn. Dùng --on-dest hoặc ssh-copy-id $SOURCE" >&2
			echo "  Hoặc: ALLOW_SSH_PASSWORD=1 $0 ...  (nhập pass 1 lần/server nhờ SSH multiplex)" >&2
			exit 1
		fi
	fi
}

ssh_cmd() {
	local target="$1"
	shift
	ssh_common_opts
	ssh "${SSH_OPTS_ARR[@]}" "$target" "$@"
}

ssh_src() {
	ssh_cmd "$SOURCE" "$@"
}

ssh_dest() {
	if $LOCAL_DEST; then
		if [[ $# -eq 1 ]]; then
			bash -c "$1"
		else
			bash -c "$(printf '%q ' "$@")"
		fi
	else
		ssh_cmd "$DEST" "$@"
	fi
}

rsync_ssh_shell() {
	ssh_common_opts
	local parts=()
	local o
	for o in "${SSH_OPTS_ARR[@]}"; do
		parts+=("$(printf '%q' "$o")")
	done
	printf 'ssh %s' "${parts[*]}"
}

test_ssh() {
	local target="$1"
	local label="$2"
	local err_file
	err_file="$(mktemp)"
	if ssh_cmd "$target" "echo ok" >/dev/null 2>"$err_file"; then
		rm -f "$err_file"
		return 0
	fi
	echo "[migrate] ERROR: cannot SSH to $label ($target)" >&2
	if [[ -s "$err_file" ]]; then
		echo "  $(tail -3 "$err_file" | tr '\n' ' ')" >&2
	fi
	rm -f "$err_file"
	echo "  Fix:" >&2
	if [[ "$target" == "$SOURCE" ]]; then
		echo "    ssh $target" >&2
		echo "    ssh-copy-id $target    # từ máy đang chạy script" >&2
		echo "    hoặc chạy từ Mac: ./scripts/migrate-server-data.sh --on-dest" >&2
	else
		echo "    ssh $target" >&2
		echo "    ssh-copy-id $target" >&2
	fi
	return 1
}

preflight() {
	log "=== Preflight ==="
	log "Mode  : $( $LOCAL_DEST && echo 'local-dest (pull on dest)' || echo 'remote orchestrator' )"
	log "Source: $SOURCE"
	if $LOCAL_DEST; then
		log "Dest  : localhost ($DEST_HOST)"
	else
		log "Dest  : $DEST"
	fi
	log "Log   : $LOG_FILE"

	check_ssh_requirements
	warmup_ssh_sessions

	if ! test_ssh "$SOURCE" "source"; then
		exit 1
	fi
	if ! $LOCAL_DEST; then
		if ! test_ssh "$DEST" "dest"; then
			exit 1
		fi
	fi

	if ! $MYSQL_ONLY; then
		for dir in "${DIRS[@]}"; do
			if ! ssh_src "test -d '$dir'"; then
				echo "[migrate] ERROR: missing on source: $dir" >&2
				exit 1
			fi
		done
	fi

	if ! $DIRS_ONLY; then
		if [[ -z "$MYSQL_ROOT_PASSWORD" ]]; then
			echo "[migrate] ERROR: set MYSQL_ROOT_PASSWORD for MySQL migration" >&2
			echo "  export MYSQL_ROOT_PASSWORD='...'" >&2
			exit 1
		fi
		if ! ssh_src "command -v mysqldump >/dev/null && command -v mysql >/dev/null"; then
			echo "[migrate] ERROR: source missing mysqldump/mysql (apt install mysql-client)" >&2
			exit 1
		fi
		if $LOCAL_DEST; then
			if ! command -v mysql >/dev/null; then
				echo "[migrate] ERROR: chưa có mysql client — chạy install-lemp-ubuntu22.sh trước" >&2
				exit 1
			fi
			if ! systemctl is-active mysql >/dev/null 2>&1; then
				log "WARNING: mysql chưa chạy — thử systemctl start mysql"
				systemctl start mysql 2>/dev/null || true
			fi
		elif ! ssh_dest "command -v mysql >/dev/null"; then
			echo "[migrate] ERROR: dest missing mysql client (apt install mysql-client)" >&2
			exit 1
		fi
		if ! ssh_src "MYSQL_PWD='${MYSQL_ROOT_PASSWORD}' mysql -u'${MYSQL_ROOT_USER}' -e 'SELECT 1' >/dev/null 2>&1"; then
			echo "[migrate] ERROR: MySQL auth failed on source (check MYSQL_ROOT_PASSWORD)" >&2
			exit 1
		fi
	fi
}

stop_dest_services() {
	if ! $STOP_SERVICES || $DRY_RUN; then
		return 0
	fi
	log "=== Stop services on dest (avoid writing during sync) ==="
	if $LOCAL_DEST; then
		bash <<'EOF' || true
set +e
for svc in csm-go csm-rust csm-java nginx mysql php5.6-fpm php8.2-fpm php8.1-fpm php-fpm; do
	systemctl stop "$svc" 2>/dev/null
done
EOF
	else
		ssh_dest bash -s <<'EOF' || true
set +e
for svc in csm-go csm-rust csm-java nginx mysql php5.6-fpm php8.2-fpm php8.1-fpm php-fpm; do
	systemctl stop "$svc" 2>/dev/null
done
EOF
	fi
}

start_dest_services() {
	if ! $STOP_SERVICES || $DRY_RUN; then
		return 0
	fi
	log "=== Start services on dest ==="
	if $LOCAL_DEST; then
		bash <<'EOF' || true
set +e
systemctl start mysql 2>/dev/null
for svc in php5.6-fpm php8.2-fpm php8.1-fpm php-fpm csm-go csm-rust csm-java nginx; do
	systemctl start "$svc" 2>/dev/null
done
systemctl is-active mysql csm-go nginx 2>/dev/null || true
EOF
	else
		ssh_dest bash -s <<'EOF' || true
set +e
systemctl start mysql 2>/dev/null
for svc in php5.6-fpm php8.2-fpm php8.1-fpm php-fpm csm-go csm-rust csm-java nginx; do
	systemctl start "$svc" 2>/dev/null
done
systemctl is-active mysql csm-go nginx 2>/dev/null || true
EOF
	fi
}

rsync_one_dir() {
	local remote_dir="$1"

	log "=== Rsync $remote_dir ==="

	local -a rsync_opts=(
		-az
		--partial
		--numeric-ids
		--info=progress2
		--human-readable
	)
	if $RSYNC_DELETE; then
		rsync_opts+=(--delete)
	fi
	if $DRY_RUN; then
		rsync_opts+=(--dry-run)
	fi

	local -a excludes=(
		"--exclude=.git/"
		"--exclude=**/node_modules/"
		"--exclude=**/.cache/"
		"--exclude=**/target/"
	)
	if [[ -n "${RSYNC_EXCLUDES:-}" && -f "$RSYNC_EXCLUDES" ]]; then
		excludes+=("--exclude-from=$RSYNC_EXCLUDES")
	fi

	mkdir -p "$(dirname "$remote_dir")"

	local rsync_ssh
	rsync_ssh="$(rsync_ssh_shell)"

	if $LOCAL_DEST; then
		rsync "${rsync_opts[@]}" "${excludes[@]}" \
			-e "$rsync_ssh" \
			"${SOURCE}:${remote_dir}/" \
			"${remote_dir}/" \
			2>&1 | tee -a "$LOG_FILE"
	else
		ssh_dest "mkdir -p '$(dirname "$remote_dir")'"
		rsync "${rsync_opts[@]}" "${excludes[@]}" \
			-e "$rsync_ssh" \
			"${SOURCE}:${remote_dir}/" \
			"${DEST}:${remote_dir}/" \
			2>&1 | tee -a "$LOG_FILE"
	fi

	log "Disk usage dest $remote_dir:"
	if ! $DRY_RUN; then
		if $LOCAL_DEST; then
			du -sh "$remote_dir" 2>/dev/null | tee -a "$LOG_FILE" || true
		else
			ssh_dest "du -sh '$remote_dir' 2>/dev/null || true" | tee -a "$LOG_FILE"
		fi
	fi
}

migrate_dirs() {
	for dir in "${DIRS[@]}"; do
		rsync_one_dir "$dir"
	done
}

migrate_mysql() {
	log "=== MySQL: dump source → restore dest (all databases) ==="

	local dump_file="$LOG_DIR/csm-mysql-all.sql.gz"

	if $DRY_RUN; then
		log "[dry-run] mysqldump --all-databases from $SOURCE → dest"
		ssh_src "MYSQL_PWD='${MYSQL_ROOT_PASSWORD}' mysql -u'${MYSQL_ROOT_USER}' -e 'SHOW DATABASES;'" \
			2>&1 | tee -a "$LOG_FILE" || true
		return 0
	fi

	log "Dumping on source (compressed)..."
	ssh_src "MYSQL_PWD='${MYSQL_ROOT_PASSWORD}' mysqldump -u'${MYSQL_ROOT_USER}' \
		--all-databases \
		--single-transaction \
		--routines \
		--events \
		--triggers \
		--hex-blob \
		--default-character-set=utf8mb4 \
		--set-gtid-purged=OFF \
		| gzip -1" >"$dump_file"

	local size
	size="$(du -h "$dump_file" | awk '{print $1}')"
	log "Dump size: $size ($dump_file)"

	log "Restore on dest (may take several minutes)..."
	if $LOCAL_DEST; then
		systemctl start mysql 2>/dev/null || true
		gunzip -c "$dump_file" | MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -u"${MYSQL_ROOT_USER}"
		MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -u"${MYSQL_ROOT_USER}" -e "SHOW DATABASES;" \
			| tee -a "$LOG_FILE"
	else
		scp_common=(-o StrictHostKeyChecking=accept-new)
		[[ -n "${SSH_IDENTITY_FILE:-}" && -f "${SSH_IDENTITY_FILE}" ]] && scp_common+=(-i "$SSH_IDENTITY_FILE")
		scp "${scp_common[@]}" "$dump_file" "${DEST}:/tmp/csm-mysql-all.sql.gz"
		ssh_dest "MYSQL_PWD='${MYSQL_ROOT_PASSWORD}' bash -s" <<RESTORE
set -euo pipefail
systemctl start mysql 2>/dev/null || true
gunzip -c /tmp/csm-mysql-all.sql.gz | mysql -u'${MYSQL_ROOT_USER}'
rm -f /tmp/csm-mysql-all.sql.gz
mysql -u'${MYSQL_ROOT_USER}' -e "SHOW DATABASES;"
RESTORE
	fi

	log "MySQL migration done."
}

post_check() {
	log "=== Post-check ==="
	if ! $DRY_RUN; then
		if $LOCAL_DEST; then
			echo "--- directories ---" | tee -a "$LOG_FILE"
			for d in /root/la_server /root/la_php_server; do
				if [[ -d "$d" ]]; then
					du -sh "$d" | tee -a "$LOG_FILE"
				else
					echo "missing: $d" | tee -a "$LOG_FILE"
				fi
			done
			echo "--- services ---" | tee -a "$LOG_FILE"
			systemctl is-active mysql nginx csm-go 2>/dev/null | tee -a "$LOG_FILE" || true
		else
			ssh_dest bash -s <<'EOF' | tee -a "$LOG_FILE"
echo "--- directories ---"
for d in /root/la_server /root/la_php_server; do
	[ -d "$d" ] && du -sh "$d" || echo "missing: $d"
done
echo "--- services ---"
systemctl is-active mysql nginx csm-go 2>/dev/null || true
EOF
		fi
	fi
	log "=== Done ==="
	log "Next steps:"
	log "  1. Kiểm tra config.env / PHP DB host (127.0.0.1)"
	log "  2. systemctl restart csm-go nginx php-fpm mysql"
	log "  3. curl -s http://127.0.0.1:9999/api/monitoring/health"
}

main() {
	preflight
	stop_dest_services

	if ! $MYSQL_ONLY; then
		migrate_dirs
	fi

	if ! $DIRS_ONLY; then
		migrate_mysql
	fi

	start_dest_services
	post_check
}

main "$@"
