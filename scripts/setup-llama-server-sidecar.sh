#!/bin/bash
# Install/start llama-server sidecar for Go backend when native llamacpp build is unavailable.
# Usage: setup-llama-server-sidecar.sh /root/la_server
set -euo pipefail

P="${1:-/root/la_server}"
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

MODEL="$(resolve_model_path)"
if [ ! -f "$MODEL" ]; then
	echo "[llama-sidecar] SKIP — model not found: $MODEL"
	exit 0
fi

LLAMA_BIN="$(command -v llama-server || true)"
if [ -z "$LLAMA_BIN" ]; then
	echo "[llama-sidecar] Installing llama-server binary..."
	apt-get update -qq
	apt-get install -y --no-install-recommends curl ca-certificates tar
	TMP="$(mktemp -d)"
	trap 'rm -rf "$TMP"' EXIT
	# Pin a release with linux x64 server binary; override via LLAMA_CPP_RELEASE_TAG if needed.
	TAG="${LLAMA_CPP_RELEASE_TAG:-b4895}"
	ARCHIVE="llama-${TAG}-bin-linux-x64.tar.gz"
	URL="https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ARCHIVE}"
	if ! curl -fsSL "$URL" -o "$TMP/$ARCHIVE"; then
		echo "[llama-sidecar] WARN — could not download $URL"
		exit 0
	fi
	tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
	FOUND="$(find "$TMP" -name llama-server -type f | head -1)"
	if [ -z "$FOUND" ]; then
		echo "[llama-sidecar] WARN — llama-server not found in archive"
		exit 0
	fi
	install -m 755 "$FOUND" /usr/local/bin/llama-server
	LLAMA_BIN="/usr/local/bin/llama-server"
fi

echo "[llama-sidecar] Using $LLAMA_BIN with model $MODEL"

cat > /etc/systemd/system/csm-llama.service <<EOF
[Unit]
Description=CSM llama-server sidecar (AI local)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$P
ExecStart=$LLAMA_BIN -m $MODEL --host 127.0.0.1 --port $PORT -c $CTX -t $THREADS
Restart=always
RestartSec=5
MemoryMax=5G
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable csm-llama
systemctl restart csm-llama
sleep 3
if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
	echo "[llama-sidecar] OK — listening on :$PORT"
else
	echo "[llama-sidecar] WARN — service started but health check failed; see journalctl -u csm-llama"
fi
