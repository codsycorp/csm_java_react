#!/bin/bash
# Download linux amd64 llama-server for Ubuntu 20.04 (glibc 2.31). Used in CI — NOT on production server.
# Usage: fetch-llama-server-linux.sh [output_path]
set -euo pipefail

OUT="${1:-llama-server}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

download() {
	local url="$1"
	echo "[fetch-llama] $url"
	curl -fsSL "$url" -o "$TMP/archive.tar.gz"
}

verify() {
	local bin="$1"
	chmod +x "$bin"
	if "$bin" --version >/dev/null 2>&1 || "$bin" --help >/dev/null 2>&1; then
		return 0
	fi
	return 1
}

extract() {
	tar -xzf "$TMP/archive.tar.gz" -C "$TMP"
	local found
	found="$(find "$TMP" -name llama-server -type f | head -1)"
	if [ -z "$found" ]; then
		return 1
	fi
	install -m755 "$found" "$OUT"
}

TAGS="${LLAMA_CPP_RELEASE_TAG:-b4895} b5273 b5892 b6187 b7274"
for TAG in $TAGS; do
	for ARCHIVE in \
		"llama-${TAG}-bin-ubuntu-x64.tar.gz" \
		"llama-${TAG}-bin-linux-x64.tar.gz"; do
		URL="https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ARCHIVE}"
		if download "$URL" && extract && verify "$OUT"; then
			echo "[fetch-llama] OK → $OUT ($ARCHIVE)"
			file "$OUT" || true
			exit 0
		fi
		rm -f "$OUT"
	done
done

echo "[fetch-llama] ERROR: no compatible prebuilt llama-server found"
exit 1
