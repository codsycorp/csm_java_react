#!/bin/bash
# Optional helper: pre-download llama-server to csm_datas/bin (csm-go can also bootstrap itself).
# Does NOT use apt-get (broken repos on some Ubuntu 20.04 hosts break apt update).
#
# Usage:
#   setup-llama-server-sidecar.sh /root/la_server --binary-only
set -euo pipefail

P="${1:-/root/la_server}"
MODE="${2:---binary-only}"

BIN_DIR="$P/csm_datas/bin"
TARGET_BIN="$BIN_DIR/llama-server"

download_with_curl() {
	local url="$1" out="$2"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url" -o "$out"
		return 0
	fi
	if command -v wget >/dev/null 2>&1; then
		wget -q -O "$out" "$url"
		return 0
	fi
	echo "[llama-sidecar] ERROR — need curl or wget"
	return 1
}

install_llama_server_binary() {
	mkdir -p "$BIN_DIR"
	if [ -x "$TARGET_BIN" ]; then
		echo "[llama-sidecar] Already installed: $TARGET_BIN"
		return 0
	fi

	local TMP
	TMP="$(mktemp -d)"
	trap 'rm -rf "$TMP"' RETURN

	local TAG ARCHIVE URL FOUND=""
	for TAG in ${LLAMA_CPP_RELEASE_TAG:-b9562} b7274 b7224; do
		for ARCHIVE in \
			"llama-${TAG}-bin-ubuntu-x64.tar.gz" \
			"llama-${TAG}-bin-linux-x64.tar.gz"; do
			URL="https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ARCHIVE}"
			echo "[llama-sidecar] Trying $URL"
			if download_with_curl "$URL" "$TMP/archive.tar.gz"; then
				tar -xzf "$TMP/archive.tar.gz" -C "$TMP"
				FOUND="$(find "$TMP" -name llama-server -type f | head -1)"
				if [ -n "$FOUND" ]; then
					install -m 755 "$FOUND" "$TARGET_BIN"
					echo "[llama-sidecar] Installed → $TARGET_BIN"
					return 0
				fi
			fi
		done
	done
	echo "[llama-sidecar] WARN — download failed (csm-go will retry on startup)"
	return 0
}

install_llama_server_binary

if [ "$MODE" = "--binary-only" ]; then
	echo "[llama-sidecar] Binary-only done — csm-go manages llama-server"
	systemctl stop csm-llama 2>/dev/null || true
	systemctl disable csm-llama 2>/dev/null || true
fi
