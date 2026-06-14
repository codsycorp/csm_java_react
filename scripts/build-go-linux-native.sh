#!/bin/bash
# Build csm_go_server with in-process llama.cpp (Java LlamaCppNativeService parity).
# Rebuilds go-nativeml static libs for glibc on target Linux (Ubuntu 22.04 = 2.35).
#
# Usage (from repo root):
#   ./scripts/build-go-linux-native.sh                          → dist/csm_go_server
#   ./scripts/build-go-linux-native.sh dist/csm_go_server
#   ./scripts/build-go-linux-native.sh --remote root@SERVER     → build on server, copy binary về Mac
#   ./scripts/build-go-linux-native.sh --on-host dist/csm_go_server   → đang SSH trên Linux
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$ROOT/backend-go"
IMAGE="${CSM_NATIVE_BUILD_IMAGE:-ubuntu:22.04}"
MODE="docker"
REMOTE=""
OUT="$ROOT/dist/csm_go_server"

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
	-h | --help)
		sed -n '2,12p' "$0"
		exit 0
		;;
	-*)
		echo "[build-go-linux-native] unknown option: $1" >&2
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
GO_VERSION="$(awk '/^go / { print $2; exit }' "$GO_DIR/go.mod")"
INNER="$ROOT/scripts/build-go-native-inner.sh"
mkdir -p "$OUT_DIR"

if [[ "$MODE" == "on-host" ]]; then
	echo "[build-go-linux-native] --on-host go=$GO_VERSION → $OUT"
	chmod +x "$INNER"
	exec "$INNER" "$GO_DIR" "$OUT" "$GO_VERSION"
fi

if [[ "$MODE" == "remote" ]]; then
	echo "[build-go-linux-native] --remote $REMOTE go=$GO_VERSION → $OUT"
	REMOTE_DIR="/tmp/csm-native-build-$$"
	scp -q "$INNER" "$REMOTE:/tmp/build-go-native-inner.sh"
	ssh "$REMOTE" "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR'"
	scp -qr "$GO_DIR" "$REMOTE:$REMOTE_DIR/backend-go"
	ssh "$REMOTE" "chmod +x /tmp/build-go-native-inner.sh && /tmp/build-go-native-inner.sh '$REMOTE_DIR/backend-go' '$REMOTE_DIR/$OUT_NAME' '$GO_VERSION'"
	scp -q "$REMOTE:$REMOTE_DIR/$OUT_NAME" "$OUT"
	ssh "$REMOTE" "rm -rf '$REMOTE_DIR' /tmp/build-go-native-inner.sh"
	echo "[build-go-linux-native] done: $OUT"
	exit 0
fi

# Docker mode (Mac / CI when daemon is up)
if ! command -v docker >/dev/null 2>&1; then
	echo "[build-go-linux-native] ERROR: docker not installed." >&2
	echo "  Dùng build trên server (không cần Docker Mac):" >&2
	echo "    ./scripts/build-go-linux-native.sh --remote root@YOUR_SERVER dist/csm_go_server" >&2
	echo "  Hoặc ./deploy-go-linux.sh root@YOUR_SERVER /root/la_server" >&2
	exit 1
fi
if ! docker info >/dev/null 2>&1; then
	echo "[build-go-linux-native] ERROR: Docker daemon không chạy." >&2
	echo "  Cách A — bật Docker Desktop, đợi Running, rồi chạy lại script." >&2
	echo "  Cách B — build trên server Linux (không cần Docker Mac):" >&2
	echo "    ./scripts/build-go-linux-native.sh --remote root@YOUR_SERVER dist/csm_go_server" >&2
	echo "  Cách C — ./deploy-go-linux.sh root@YOUR_SERVER /root/la_server" >&2
	exit 1
fi

echo "[build-go-linux-native] docker image=$IMAGE go=$GO_VERSION → $OUT"

docker run --rm \
	-v "$ROOT:/src:ro" \
	-v "$OUT_DIR:/out" \
	-e GO_VERSION="$GO_VERSION" \
	-e OUT_NAME="$OUT_NAME" \
	"$IMAGE" \
	bash -c "chmod +x /src/scripts/build-go-native-inner.sh && /src/scripts/build-go-native-inner.sh /src/backend-go /out/\${OUT_NAME} \${GO_VERSION}"

echo "[build-go-linux-native] done: $OUT"
