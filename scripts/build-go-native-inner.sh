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
for cmd in gcc g++ cmake make curl wget; do
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

NATIVEML_DIR="$(go list -m -f '{{.Dir}}' github.com/footprintai/go-nativeml)"
PLATFORM="$(go env GOOS)-$(go env GOARCH)"
PREBUILT="$NATIVEML_DIR/ggml/llamacpp/third_party/prebuilt/$PLATFORM"

nativeml_has_prebuilt() {
	[[ -f "$PREBUILT/libllama.a" && -f "$PREBUILT/libggml.a" ]]
}

nativeml_rebuild_from_source() {
	local cache_dir build_dir
	cache_dir="$(go list -m -f '{{.Dir}}' github.com/footprintai/go-nativeml)"
	build_dir="${NATIVEML_BUILD:-$GO_DIR/.cache/go-nativeml}"
	rm -rf "$build_dir"
	mkdir -p "$build_dir"
	cp -r "$cache_dir/." "$build_dir/"
	chmod -R u+w "$build_dir"
	# llama.cpp mới có LLAMA_BUILD_UI — tắt server/UI (Go chỉ cần lib inference in-process)
	sed -i 's/cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF/cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_CURL=OFF -DBUILD_TESTING=OFF/' "$build_dir/Makefile"
	echo "[build-native-inner] rebuilding llama.cpp in $build_dir ($(ldd --version 2>/dev/null | head -1 || echo linux))"
	(cd "$build_dir" && make build-libs-llama)
	NATIVEML_DIR="$build_dir"
	REPLACE_ADDED=false
	if ! grep -q '^replace github.com/footprintai/go-nativeml ' go.mod 2>/dev/null; then
		go mod edit -replace="github.com/footprintai/go-nativeml=$build_dir"
		REPLACE_ADDED=true
	fi
}

REPLACE_ADDED=false
if nativeml_has_prebuilt && [[ "${CSM_FORCE_NATIVEML_REBUILD:-0}" != 1 ]]; then
	echo "[build-native-inner] using prebuilt llama.cpp ($PREBUILT) — skip compile"
elif [[ "${CSM_FORCE_NATIVEML_REBUILD:-0}" == 1 ]]; then
	echo "[build-native-inner] CSM_FORCE_NATIVEML_REBUILD=1 — compile from source"
	nativeml_rebuild_from_source
else
	echo "[build-native-inner] no prebuilt for $PLATFORM — compile from source"
	nativeml_rebuild_from_source
fi

cd "$GO_DIR"

export CGO_ENABLED=1
export GOOS=linux
export GOARCH=amd64

mkdir -p "$(dirname "$OUT")"
echo "[build-native-inner] linking → $OUT"
go build -ldflags="-s -w" -trimpath -tags llamacpp -o "$OUT" ./cmd/server

if $REPLACE_ADDED; then
	go mod edit -dropreplace=github.com/footprintai/go-nativeml
fi
chmod +x "$OUT"

ls -lh "$OUT"
file "$OUT" || true
ldd "$OUT" 2>/dev/null | head -5 || true
echo "[build-native-inner] OK"
