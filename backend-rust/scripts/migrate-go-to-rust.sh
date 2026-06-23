#!/bin/bash
# Migrate Go backend data → Rust runtime (shared Pebble KV + rebuild Rust indexes).
#
# Go stores KV in Pebble (no RocksDB at runtime). Rust reads the same Pebble paths and
# rebuilds Tantivy + Qdrant vector + eq-index (chromem from Go is NOT converted).
#
# Usage (from repo root or backend-rust/):
#   ./backend-rust/scripts/migrate-go-to-rust.sh
#   ./backend-rust/scripts/migrate-go-to-rust.sh --dry-run
#   ./backend-rust/scripts/migrate-go-to-rust.sh --skip-backup --skip-rocksdb-migrate
#   ./backend-rust/scripts/migrate-go-to-rust.sh --only csm/sys_autos,csm/csm_accounts
#
# Phases:
#   1. Load env (same as run-rust-server.sh)
#   2. Optional tarball backup of csm_datas
#   3. RocksDB → Pebble key rewrite via backend-go/run-migrate.sh (if database/ has gaps)
#   4. Optional monolithic csm.kv → per-table repartition (Go tool)
#   5. Prepare Qdrant vector dir (Rust; chromem ignored)
#   6. Reindex all Pebble tables (cargo run --bin csm_migrate_go)
#
# Requires: bash, cargo, curl optional. For phase 3: go + rocksdb_ldb (brew install rocksdb).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUST_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$ROOT/backend-go"

log() {
	echo "[$(date +'%F %T')] [migrate-go→rust] $*"
}

load_env_file() {
	local file_path="$1"
	if [ -f "$file_path" ]; then
		set -a
		# shellcheck source=/dev/null
		source "$file_path"
		set +a
		log "Loaded $(basename "$file_path")"
		return 0
	fi
	return 1
}

load_csm_env() {
	PROFILE="${CSM_LOCAL_PROFILE:-}"
	if [ -z "$PROFILE" ]; then
		case "$(uname -s)" in
		Darwin) PROFILE="m1" ;;
		*) PROFILE="8gb" ;;
		esac
	fi

	load_env_file "$ROOT/config.env" || log "config.env not found (optional)"
	case "$PROFILE" in
	m1 | m1-16gb | local-m1) load_env_file "$ROOT/config.local-m1.env" || true ;;
	strong | local-strong) load_env_file "$ROOT/config.local-strong.env" || true ;;
	8gb | 7b | local-8gb | *) load_env_file "$ROOT/config.local-8gb.env" || true ;;
	esac

	export CSM_HOME="${CSM_HOME:-$ROOT/backend}"
	export APP_DATA_DIR="${APP_DATA_DIR:-$CSM_HOME/csm_datas}"
	export CSM_NATIVE_DATA_DIR="${CSM_NATIVE_DATA_DIR:-$APP_DATA_DIR/native}"
	export CSM_PEBBLE_ROOT="${CSM_PEBBLE_ROOT:-$CSM_NATIVE_DATA_DIR/pebble}"
	export CSM_VECTOR_DIR="${CSM_VECTOR_DIR:-$CSM_NATIVE_DATA_DIR/vector/qdrant}"
	export CSM_KV_ENGINE="${CSM_KV_ENGINE:-pebble}"
	export ROCKSDB_ROOT_DIR="${ROCKSDB_ROOT_DIR:-$APP_DATA_DIR/database}"
	export LUCENE_INDEX_ROOT_DIR="${LUCENE_INDEX_ROOT_DIR:-$APP_DATA_DIR/lucene_index}"
	export CSM_STARTUP_REINDEX="${CSM_STARTUP_REINDEX:-true}"
	export CSM_STARTUP_REINDEX_TABLES="${CSM_STARTUP_REINDEX_TABLES:-csm/csm_accounts,csm/csm_group_members,csm/sys_autos}"

	log "CSM_HOME=$CSM_HOME"
	log "APP_DATA_DIR=$APP_DATA_DIR"
	log "CSM_PEBBLE_ROOT=$CSM_PEBBLE_ROOT"
	log "CSM_VECTOR_DIR=$CSM_VECTOR_DIR"
	log "ROCKSDB_ROOT_DIR=$ROCKSDB_ROOT_DIR"
}

DRY_RUN=false
SKIP_BACKUP=false
SKIP_ROCKSDB_MIGRATE=false
SKIP_REPARTITION=false
SKIP_REINDEX=false
ONLY_TABLES=""
AUTO_ROCKSDB_MIGRATE=false

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dry-run)
		DRY_RUN=true
		shift
		;;
	--skip-backup)
		SKIP_BACKUP=true
		shift
		;;
	--skip-rocksdb-migrate)
		SKIP_ROCKSDB_MIGRATE=true
		shift
		;;
	--skip-repartition)
		SKIP_REPARTITION=true
		shift
		;;
	--skip-reindex)
		SKIP_REINDEX=true
		shift
		;;
	--auto-rocksdb-migrate)
		AUTO_ROCKSDB_MIGRATE=true
		shift
		;;
	--only)
		ONLY_TABLES="${2:-}"
		[ -n "$ONLY_TABLES" ] || {
			echo "--only requires comma list app/table,..." >&2
			exit 1
		}
		shift 2
		;;
	-h | --help)
		sed -n '2,22p' "$0"
		exit 0
		;;
	*)
		echo "Unknown option: $1 (try --help)" >&2
		exit 1
		;;
	esac
done

load_csm_env

if [ ! -d "$APP_DATA_DIR" ]; then
	log "ERROR: APP_DATA_DIR not found: $APP_DATA_DIR"
	exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${CSM_BACKUP_DIR:-$APP_DATA_DIR/backups}"
mkdir -p "$BACKUP_DIR"

# ── Phase 1: backup ──────────────────────────────────────────────────────────
if ! $SKIP_BACKUP; then
	BACKUP_FILE="$BACKUP_DIR/csm_datas-pre-rust-$STAMP.tgz"
	log "Phase 1: backup → $BACKUP_FILE"
	if $DRY_RUN; then
		log "[dry-run] tar czf $BACKUP_FILE -C $(dirname "$APP_DATA_DIR") $(basename "$APP_DATA_DIR")"
	else
		tar czf "$BACKUP_FILE" -C "$(dirname "$APP_DATA_DIR")" "$(basename "$APP_DATA_DIR")"
		log "Backup size: $(du -h "$BACKUP_FILE" | awk '{print $1}')"
	fi
else
	log "Phase 1: skip backup (--skip-backup)"
fi

# ── Phase 2: RocksDB gap check / migrate ─────────────────────────────────────
if ! $SKIP_ROCKSDB_MIGRATE && [ -d "$ROCKSDB_ROOT_DIR" ]; then
	log "Phase 2: check RocksDB vs Pebble (Go data-compare)"
	if command -v go >/dev/null 2>&1 && [ -d "$GO_DIR/cmd/data-compare" ]; then
		COMPARE_OUT="$(mktemp)"
		set +e
		(
			cd "$GO_DIR"
			go run ./cmd/data-compare \
				-rocksdb "$ROCKSDB_ROOT_DIR" \
				-pebble "$CSM_PEBBLE_ROOT" \
				>${COMPARE_OUT} 2>&1
		)
		COMPARE_RC=$?
		set -e
		if [ "$COMPARE_RC" -eq 0 ]; then
			if grep -q "MISMATCHES" "$COMPARE_OUT" && grep -qE "rocksdb != pebble|RocksDB only" "$COMPARE_OUT"; then
				log "RocksDB/Pebble gaps detected — see summary below:"
				tail -30 "$COMPARE_OUT"
				if $AUTO_ROCKSDB_MIGRATE || $DRY_RUN; then
					if $DRY_RUN; then
						log "[dry-run] would run: $GO_DIR/run-migrate.sh"
					elif command -v rocksdb_ldb >/dev/null 2>&1 || [ -x /opt/homebrew/bin/rocksdb_ldb ]; then
						log "Running Go RocksDB→Pebble migrate (key rewrite)..."
						(
							cd "$GO_DIR"
							./run-migrate.sh
						)
					else
						log "WARN: rocksdb_ldb missing — install: brew install rocksdb"
						log "      Then: cd backend-go && ./run-migrate.sh"
					fi
				else
					log "Re-run with --auto-rocksdb-migrate to fix via backend-go/run-migrate.sh"
				fi
			else
				log "Pebble looks complete vs RocksDB (or RocksDB empty)"
			fi
		else
			log "WARN: data-compare failed (rc=$COMPARE_RC); check Go install"
			tail -10 "$COMPARE_OUT" 2>/dev/null || true
		fi
		rm -f "$COMPARE_OUT"
	else
		log "Phase 2: skip compare (go not installed or backend-go missing)"
	fi
else
	log "Phase 2: skip RocksDB migrate"
fi

# ── Phase 3: monolithic csm.kv repartition ───────────────────────────────────
LEGACY_KV="$CSM_PEBBLE_ROOT/csm.kv"
if ! $SKIP_REPARTITION && [ -d "$LEGACY_KV" ]; then
	log "Phase 3: legacy monolithic Pebble detected at $LEGACY_KV"
	if $DRY_RUN; then
		log "[dry-run] would run: $GO_DIR/run-pebble-repartition.sh"
	else
		if command -v go >/dev/null 2>&1 && [ -f "$GO_DIR/run-pebble-repartition.sh" ]; then
			log "Repartition csm.kv → per-table Pebble dirs..."
			(
				cd "$GO_DIR"
				chmod +x run-pebble-repartition.sh
				./run-pebble-repartition.sh
			)
		else
			log "WARN: cannot repartition — need Go + $GO_DIR/run-pebble-repartition.sh"
		fi
	fi
else
	log "Phase 3: skip repartition (no csm.kv or --skip-repartition)"
fi

# ── Phase 4: Qdrant vector dir (Rust) ──────────────────────────────────────
log "Phase 4: Rust vector store at $CSM_VECTOR_DIR (Go chromem at ${CSM_NATIVE_DATA_DIR}/vector/chromem is NOT migrated)"
if $DRY_RUN; then
	log "[dry-run] mkdir -p $CSM_VECTOR_DIR"
else
	mkdir -p "$CSM_VECTOR_DIR"
fi

# ── Phase 5: reindex (Tantivy + Qdrant + eq-index) ───────────────────────────
if ! $SKIP_REINDEX; then
	log "Phase 5: rebuild Rust indexes (Tantivy + Qdrant + eq-index)"
	if [ -f "$HOME/.cargo/env" ]; then
		# shellcheck source=/dev/null
		source "$HOME/.cargo/env"
	fi
	export PATH="$HOME/.cargo/bin:$PATH"
	if ! command -v cargo >/dev/null 2>&1; then
		log "ERROR: cargo not found — install Rust toolchain"
		exit 1
	fi

	REINDEX_ARGS=()
	$DRY_RUN && REINDEX_ARGS+=(--dry-run)
	[ -n "$ONLY_TABLES" ] && REINDEX_ARGS+=(--only "$ONLY_TABLES")

	(
		cd "$RUST_DIR"
		if $DRY_RUN; then
			cargo run --release --bin csm_migrate_go -- "${REINDEX_ARGS[@]}"
		else
			cargo run --release --bin csm_migrate_go -- "${REINDEX_ARGS[@]}"
		fi
	)
else
	log "Phase 5: skip reindex (--skip-reindex)"
fi

log ""
log "=== Migration complete ==="
log "Next:"
log "  1. Stop Go:  systemctl stop csm-go  (or Ctrl+C run-go-server.sh)"
log "  2. Start Rust: cd backend-rust && ./run-rust-server.sh"
log "  3. Verify: cargo run --release --bin csm_find_login"
log "  4. Health:  curl -s http://127.0.0.1:\${SERVER_PORT:-9999}/monitoring/health"
log ""
log "KV data path (unchanged): $CSM_PEBBLE_ROOT/{app}/{table}/"
log "Vector (new):             $CSM_VECTOR_DIR"
