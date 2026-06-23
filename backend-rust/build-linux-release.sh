#!/usr/bin/env bash
# Build csm_server cho Linux (Ubuntu 22.04 glibc) từ macOS — dùng Docker hoặc SSH remote.
#
# Vì RocksDB/pebbledb/llama-cpp là native C++, cross-compile Mac→Linux trực tiếp rất khó.
# Khuyến nghị: Docker (Mac) hoặc --remote build trên server Linux.
#
# Usage (từ repo root hoặc backend-rust/):
#   ./backend-rust/build-linux-release.sh
#   ./backend-rust/build-linux-release.sh dist/csm_rust_server
#   ./backend-rust/build-linux-release.sh --no-local-ai
#   ./backend-rust/build-linux-release.sh --remote root@your-server
#   ./backend-rust/build-linux-release.sh --on-host          # đang SSH trên Linux
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUST_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${CSM_RUST_BUILD_IMAGE:-ubuntu:22.04}"
MODE="docker"
REMOTE=""
OUT="$ROOT/dist/csm_rust_server"
FEATURES="local-ai"
PROFILE="release-server"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--remote)
		MODE="remote"
		REMOTE="${2:?user@host required after --remote}"
		shift 2
		;;
	--on-host)
		MODE="on-host"
		shift
		;;
	--no-local-ai)
		FEATURES=""
		shift
		;;
	--profile)
		PROFILE="${2:?profile name required}"
		shift 2
		;;
	-h | --help)
		sed -n '2,14p' "$0"
		exit 0
		;;
	-*)
		echo "[build-linux] unknown option: $1" >&2
		exit 1
		;;
	*)
		OUT="$1"
		shift
		;;
	esac
done

OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
OUT_DIR="$(dirname "$OUT")"
OUT_NAME="$(basename "$OUT")"
mkdir -p "$OUT_DIR"

build_inner() {
	local src_root="$1"
	local out_path="$2"
	local features="$3"
	local profile="$4"

	if ! command -v cargo >/dev/null 2>&1; then
		if [[ -f "$HOME/.cargo/env" ]]; then
			# shellcheck source=/dev/null
			source "$HOME/.cargo/env"
		fi
	fi
	if ! command -v cargo >/dev/null 2>&1; then
		echo "[build-linux] installing rustup..."
		curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
		# shellcheck source=/dev/null
		source "$HOME/.cargo/env"
	fi

	export DEBIAN_FRONTEND=noninteractive
	if command -v apt-get >/dev/null 2>&1; then
		apt-get update -qq
		apt-get install -y -qq \
			build-essential pkg-config libssl-dev cmake clang git curl ca-certificates \
			>/dev/null 2>&1 || true
	fi

	cd "$src_root/backend-rust"
	local -a cargo_args=(build --profile "$profile")
	if [[ -n "$features" ]]; then
		cargo_args+=(--features "$features")
	else
		cargo_args+=(--no-default-features)
	fi
	echo "[build-linux] cargo ${cargo_args[*]}"
	cargo "${cargo_args[@]}"

	local bin="$src_root/backend-rust/target/$profile/csm_server"
	if [[ ! -f "$bin" ]]; then
		bin="$src_root/backend-rust/target/release/csm_server"
	fi
	if [[ ! -f "$bin" ]]; then
		echo "[build-linux] ERROR: binary not found after build" >&2
		exit 1
	fi
	cp -f "$bin" "$out_path"
	chmod +x "$out_path"
	echo "[build-linux] OK: $out_path ($(du -h "$out_path" | awk '{print $1}'))"
}

if [[ "$MODE" == "on-host" ]]; then
	echo "[build-linux] --on-host features=${FEATURES:-none} profile=$PROFILE → $OUT"
	build_inner "$ROOT" "$OUT" "$FEATURES" "$PROFILE"
	exit 0
fi

if [[ "$MODE" == "remote" ]]; then
	echo "[build-linux] --remote $REMOTE features=${FEATURES:-none} → $OUT"
	REMOTE_DIR="/tmp/csm-rust-build-$$"
	ssh "$REMOTE" "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR'"
	scp -qr "$ROOT/backend-rust" "$REMOTE:$REMOTE_DIR/"
	ssh "$REMOTE" bash -s "$REMOTE_DIR" "$REMOTE_DIR/$OUT_NAME" "$FEATURES" "$PROFILE" <<'REMOTE_BUILD'
set -euo pipefail
SRC="$1"
OUT="$2"
FEAT="$3"
PROF="$4"
if [[ -f "$HOME/.cargo/env" ]]; then source "$HOME/.cargo/env"; fi
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq build-essential pkg-config libssl-dev cmake clang git curl ca-certificates >/dev/null
cd "$SRC/backend-rust"
ARGS=(build --profile "$PROF")
if [[ -n "$FEAT" ]]; then ARGS+=(--features "$FEAT"); else ARGS+=(--no-default-features); fi
cargo "${ARGS[@]}"
BIN="$SRC/backend-rust/target/$PROF/csm_server"
[[ -f "$BIN" ]] || BIN="$SRC/backend-rust/target/release/csm_server"
cp -f "$BIN" "$OUT"
chmod +x "$OUT"
echo "built $OUT"
REMOTE_BUILD
	scp -q "$REMOTE:$REMOTE_DIR/$OUT_NAME" "$OUT"
	ssh "$REMOTE" "rm -rf '$REMOTE_DIR'"
	echo "[build-linux] done: $OUT"
	exit 0
fi

# Docker mode (Mac)
if ! command -v docker >/dev/null 2>&1; then
	echo "[build-linux] ERROR: docker not installed." >&2
	echo "  Cách B: ./build-linux-release.sh --remote root@YOUR_SERVER" >&2
	exit 1
fi
if ! docker info >/dev/null 2>&1; then
	echo "[build-linux] ERROR: Docker daemon không chạy (bật Docker Desktop)." >&2
	echo "  Cách B: ./build-linux-release.sh --remote root@YOUR_SERVER" >&2
	exit 1
fi

echo "[build-linux] docker $IMAGE (platform=linux/amd64) features=${FEATURES:-none} profile=$PROFILE → $OUT"

docker run --rm --platform linux/amd64 \
	-v "$ROOT:/src:ro" \
	-v "$OUT_DIR:/out" \
	-e OUT_NAME="$OUT_NAME" \
	-e FEATURES="$FEATURES" \
	-e PROFILE="$PROFILE" \
	"$IMAGE" \
	bash -c '
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential pkg-config libssl-dev cmake clang git curl ca-certificates >/dev/null
if [[ ! -f /root/.cargo/bin/cargo ]]; then
  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
source /root/.cargo/env
cd /src/backend-rust
ARGS=(build --profile "$PROFILE")
if [[ -n "$FEATURES" ]]; then
  ARGS+=(--features "$FEATURES")
else
  ARGS+=(--no-default-features)
fi
echo "[docker] cargo ${ARGS[*]}"
cargo "${ARGS[@]}"
BIN="/src/backend-rust/target/$PROFILE/csm_server"
[[ -f "$BIN" ]] || BIN="/src/backend-rust/target/release/csm_server"
cp -f "$BIN" "/out/$OUT_NAME"
chmod +x "/out/$OUT_NAME"
ls -lh "/out/$OUT_NAME"
'

echo ""
echo "✅ Linux binary: $OUT"
echo ""
echo "Deploy lên server:"
echo "  scp $OUT root@server:/root/la_server/csm_rust_server"
echo "  scp config.env config.local-8gb.env root@server:/root/la_server/"
echo "  # systemd unit — xem deploy-go-linux.sh (đổi ExecStart → csm_rust_server)"
echo ""
echo "Chạy thử trên server:"
echo "  CSM_HOME=/root/la_server APP_DATA_DIR=/root/la_server/csm_datas ./csm_rust_server"
