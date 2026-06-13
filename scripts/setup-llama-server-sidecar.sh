#!/bin/bash
# Install/start llama-server sidecar for Go backend when native llamacpp build is unavailable.
# Usage: setup-llama-server-sidecar.sh /root/la_server [--require-healthy]
set -euo pipefail

P="${1:-/root/la_server}"
REQUIRE_HEALTHY="${2:-}"

PORT="${AI_LOCAL_LLAMA_SERVER_PORT:-8888}"
THREADS="${AI_LOCAL_LLAMA_THREADS:-3}"
CTX="${AI_LOCAL_LLAMA_CONTEXT_WINDOW:-8192}"

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
	if command -v llama-server >/dev/null 2>&1; then
		echo "[llama-sidecar] Using existing $(command -v llama-server)"
		return 0
	fi

	echo "[llama-sidecar] Installing llama-server binary..."
	apt-get update -qq
	apt-get install -y --no-install-recommends curl ca-certificates tar

	local TMP
	TMP="$(mktemp -d)"
	trap 'rm -rf "$TMP"' RETURN

	local TAG ARCHIVE URL FOUND=""
	for TAG in ${LLAMA_CPP_RELEASE_TAG:-b9562} b7274 b7224 b4895; do
		for ARCHIVE in \
			"llama-${TAG}-bin-ubuntu-x64.tar.gz" \
			"llama-${TAG}-bin-linux-x64.tar.gz" \
			"llama-${TAG}-bin-ubuntu-x64.zip" \
			"llama-b${TAG#b}-bin-ubuntu-x64.tar.gz"; do
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
					install -m 755 "$FOUND" /usr/local/bin/llama-server
					echo "[llama-sidecar] Installed from $ARCHIVE"
					return 0
				fi
			fi
		done
	done

	echo "[llama-sidecar] ERROR — could not download llama-server from GitHub releases"
	return 1
}

MODEL="$(resolve_model_path)"
if [ ! -f "$MODEL" ]; then
	echo "[llama-sidecar] ERROR — model not found: $MODEL"
	echo "[llama-sidecar] Run: bash $P/src/scripts/download-ai-local-models.sh 8gb (or copy GGUF manually)"
	if [ "$REQUIRE_HEALTHY" = "--require-healthy" ]; then
		exit 1
	fi
	exit 0
fi

install_llama_server_binary
LLAMA_BIN="$(command -v llama-server)"

echo "[llama-sidecar] Using $LLAMA_BIN"
echo "[llama-sidecar] Model: $MODEL"
echo "[llama-sidecar] Port: $PORT threads=$THREADS ctx=$CTX"

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

echo "[llama-sidecar] Waiting for HTTP on :$PORT (model load may take up to 2 min)..."
if wait_sidecar_healthy 120; then
	echo "[llama-sidecar] OK — sidecar healthy on :$PORT"
	exit 0
fi

echo "[llama-sidecar] WARN — service started but health check timed out"
journalctl -u csm-llama -n 30 --no-pager || true
if [ "$REQUIRE_HEALTHY" = "--require-healthy" ]; then
	exit 1
fi
exit 0
