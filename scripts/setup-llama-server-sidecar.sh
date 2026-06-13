#!/bin/bash
# Install/start llama-server for Go AI local.
#
# Usage:
#   setup-llama-server-sidecar.sh /root/la_server --binary-only
#     → install llama-server to $P/csm_datas/bin/ (csm-go spawns it; no systemd)
#   setup-llama-server-sidecar.sh /root/la_server --systemd-service [--require-healthy]
#     → legacy separate csm-llama.service
set -euo pipefail

P="${1:-/root/la_server}"
MODE="${2:---binary-only}"
REQUIRE_HEALTHY="${3:-}"

PORT="${AI_LOCAL_LLAMA_SERVER_PORT:-8888}"
THREADS="${AI_LOCAL_LLAMA_THREADS:-3}"
CTX="${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-8192}"
BIN_DIR="$P/csm_datas/bin"
TARGET_BIN="$BIN_DIR/llama-server"

resolve_model_path() {
	local raw=""
	for f in "$P/config.local-8gb.env" "$P/config.env"; do
		if [ -f "$f" ]; then
			raw="$(grep -E '^AI_LOCAL_LLAMA_MODEL_PATH=' "$f" | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
			[ -n "$raw" ] && break
		fi
	done
	raw="${raw#./}"
	if [ -z "$raw" ]; then
		raw="csm_datas/ai_local/model/qwen2.5-coder-7b-instruct-q4_k_m.gguf"
	fi
	case "$raw" in
		/*) echo "$raw" ;;
		*) echo "$P/$raw" ;;
	esac
}

wait_sidecar_healthy() {
	local url="http://127.0.0.1:${PORT}"
	local max_wait="${1:-120}"
	local i=0
	while [ "$i" -lt "$max_wait" ]; do
		if curl -sf "${url}/health" >/dev/null 2>&1 || curl -sf "${url}/" >/dev/null 2>&1; then
			return 0
		fi
		sleep 2
		i=$((i + 2))
	done
	return 1
}

install_llama_server_binary() {
	mkdir -p "$BIN_DIR"
	if [ -x "$TARGET_BIN" ]; then
		echo "[llama-sidecar] Using bundled $TARGET_BIN"
		return 0
	fi
	if command -v llama-server >/dev/null 2>&1; then
		install -m 755 "$(command -v llama-server)" "$TARGET_BIN"
		echo "[llama-sidecar] Copied $(command -v llama-server) → $TARGET_BIN"
		return 0
	fi

	echo "[llama-sidecar] Downloading llama-server..."
	apt-get update -qq
	apt-get install -y --no-install-recommends curl ca-certificates tar

	local TMP
	TMP="$(mktemp -d)"
	trap 'rm -rf "$TMP"' RETURN

	local TAG ARCHIVE URL FOUND=""
	for TAG in ${LLAMA_CPP_RELEASE_TAG:-b9562} b7274 b7224; do
		for ARCHIVE in \
			"llama-${TAG}-bin-ubuntu-x64.tar.gz" \
			"llama-${TAG}-bin-linux-x64.tar.gz" \
			"llama-${TAG}-bin-ubuntu-x64.zip"; do
			URL="https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ARCHIVE}"
			echo "[llama-sidecar] Trying $URL"
			if curl -fsSL "$URL" -o "$TMP/archive"; then
				case "$ARCHIVE" in
					*.tar.gz) tar -xzf "$TMP/archive" -C "$TMP" ;;
					*.zip)
						apt-get install -y --no-install-recommends unzip >/dev/null 2>&1 || true
						unzip -q "$TMP/archive" -d "$TMP"
						;;
				esac
				FOUND="$(find "$TMP" -name llama-server -type f | head -1)"
				if [ -n "$FOUND" ]; then
					install -m 755 "$FOUND" "$TARGET_BIN"
					echo "[llama-sidecar] Installed → $TARGET_BIN ($ARCHIVE)"
					return 0
				fi
			fi
		done
	done

	echo "[llama-sidecar] ERROR — could not download llama-server"
	return 1
}

install_llama_server_binary

if [ "$MODE" = "--binary-only" ]; then
	echo "[llama-sidecar] Binary-only mode — csm-go will spawn $TARGET_BIN on startup"
	systemctl stop csm-llama 2>/dev/null || true
	systemctl disable csm-llama 2>/dev/null || true
	exit 0
fi

MODEL="$(resolve_model_path)"
if [ ! -f "$MODEL" ]; then
	echo "[llama-sidecar] ERROR — model not found: $MODEL"
	if [ "$REQUIRE_HEALTHY" = "--require-healthy" ]; then
		exit 1
	fi
	exit 0
fi

LLAMA_BIN="$TARGET_BIN"
echo "[llama-sidecar] Using $LLAMA_BIN"
echo "[llama-sidecar] Model: $MODEL"

cat > /etc/systemd/system/csm-llama.service <<EOF
[Unit]
Description=CSM llama-server sidecar (AI local)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$P
ExecStart=$LLAMA_BIN -m $MODEL --host 127.0.0.1 --port $PORT -c $CTX -t $THREADS --parallel 1
Restart=always
RestartSec=5
MemoryMax=5500M
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable csm-llama
systemctl restart csm-llama

echo "[llama-sidecar] Waiting for HTTP on :$PORT..."
if wait_sidecar_healthy 120; then
	echo "[llama-sidecar] OK — systemd sidecar on :$PORT"
	exit 0
fi

journalctl -u csm-llama -n 30 --no-pager || true
if [ "$REQUIRE_HEALTHY" = "--require-healthy" ]; then
	exit 1
fi
exit 0
