#!/bin/bash
# Build csm_go_server with -tags llamacpp ON a Linux host (Ubuntu 22.04+).
# Called by build-go-linux-native.sh (docker / --remote / --on-host).
#
# Usage:
#   build-go-native-inner.sh <backend-go-dir> <output-binary> [go-version]
set -euo pipefail

GO_DIR="${1:?backend-go dir required}"
OUT="${2:?output binary path required}"
GO_VERSION="${3:-$(awk '/^go / { print $2; exit }' "$GO_DIR/go.mod")}"

export DEBIAN_FRONTEND=noninteractive

need_apt=false
for cmd in gcc g++ cmake make curl; do
	command -v "$cmd" >/dev/null 2>&1 || need_apt=true
done
if $need_apt; then
	if command -v apt-get >/dev/null 2>&1; then
		apt-get update -qq
		apt-get install -y -qq build-essential cmake wget curl ca-certificates
	else
		echo "[build-native-inner] ERROR: missing build tools (gcc, cmake, make, curl)" >&2
		exit 1
	fi
fi

install_go() {
	if command -v go >/dev/null 2>&1 && go version | grep -q "go${GO_VERSION} "; then
		return 0
	fi
	echo "[build-native-inner] installing Go ${GO_VERSION}..."
	curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" | tar -C /usr/local -xz
}
install_go
export PATH="/usr/local/go/bin:$PATH"

cd "$GO_DIR"
echo "[build-native-inner] downloading modules..."
go mod download

NATIVEML="$(go list -m -f '{{.Dir}}' github.com/footprintai/go-nativeml)"
echo "[build-native-inner] rebuilding llama.cpp in $NATIVEML ($(ldd --version 2>/dev/null | head -1 || echo linux))"
cd "$NATIVEML"
make build-libs-llama

cd "$GO_DIR"
export CGO_ENABLED=1
export GOOS=linux
export GOARCH=amd64

mkdir -p "$(dirname "$OUT")"
echo "[build-native-inner] linking → $OUT"
go build -ldflags="-s -w" -trimpath -tags llamacpp -o "$OUT" ./cmd/server
chmod +x "$OUT"

ls -lh "$OUT"
file "$OUT" || true
ldd "$OUT" 2>/dev/null | head -5 || true
echo "[build-native-inner] OK"
