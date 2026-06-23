#!/usr/bin/env bash
# Runs inside Docker — cross-build Windows exe + DLL bundle + zip to /dist
set -euo pipefail

DIST="${DIST:-/dist}"
STAGING="/tmp/csm-rust-windows-amd64"
PKG_NAME="csm-rust-windows-amd64"
PROFILE="${CSM_BUILD_PROFILE:-release}"

cd /build

export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc
export CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc
export CXX_x86_64_pc_windows_gnu=x86_64-w64-mingw32-g++

echo "=== [windows] cargo build --target x86_64-pc-windows-gnu (no local-ai) ==="
cargo build --target x86_64-pc-windows-gnu --profile "$PROFILE" --no-default-features

EXE="/build/target/x86_64-pc-windows-gnu/$PROFILE/csm_server.exe"
[[ -f "$EXE" ]] || EXE="/build/target/x86_64-pc-windows-gnu/release/csm_server.exe"
[[ -f "$EXE" ]] || { echo "[windows] exe not found" >&2; exit 1; }

rm -rf "$STAGING"
mkdir -p "$STAGING/logs"

cp -f "$EXE" "$STAGING/csm_server.exe"
/build/docker/bundle-windows-runtime.sh "$STAGING/csm_server.exe" "$STAGING"

cp -f /build/deploy/windows/*.bat "$STAGING/" 2>/dev/null || true
cp -f /build/deploy/config.env.example "$STAGING/config.env.example"

cat > "$STAGING/README-DEPLOY.txt" <<'EOF'
CSM Rust — Windows deploy package (x64)

1. Giải nén vào thư mục runtime, ví dụ D:\csm_server
2. Tải nssm.exe vào cùng thư mục: https://nssm.cc/download
3. Copy config.env + csm_datas\
4. CMD Administrator: check-windows-runtime.bat
5. install-csm-rust-service.bat

Gồm sẵn csm_server.exe + lib*.dll MinGW (nếu có native deps).
Build Pebble + Qdrant only (no RocksDB).
Build không có local-ai (llama) — dùng API AI remote nếu cần.
Service: CSM_Rust_Service (NSSM)
EOF

mkdir -p "$DIST"
rm -f "$DIST/${PKG_NAME}.zip"
(
  cd "$(dirname "$STAGING")"
  zip -rq "$DIST/${PKG_NAME}.zip" "$(basename "$STAGING")"
)
ls -lh "$DIST/${PKG_NAME}.zip"
echo "=== [windows] done: $DIST/${PKG_NAME}.zip ==="
