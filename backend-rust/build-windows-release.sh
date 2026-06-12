#!/usr/bin/env bash
# Build csm_server.exe cho Windows — KHÔNG link llama.cpp (cross-compile từ macOS/Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$(dirname "$0")"
BUNDLE_SCRIPT="$(cd "$(dirname "$0")/scripts" && pwd)/bundle-mingw-runtime.sh"

if ! rustup target list --installed | grep -q '^x86_64-pc-windows-gnu$'; then
  echo "→ Cài target Windows GNU..."
  rustup target add x86_64-pc-windows-gnu
fi

if ! command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
  echo "[LOI] Thiếu MinGW linker. macOS: brew install mingw-w64"
  exit 1
fi

echo "=== Build Windows release (no local-ai) ==="
cargo build --target x86_64-pc-windows-gnu --release --no-default-features "$@"

EXE="target/x86_64-pc-windows-gnu/release/csm_server.exe"
DEPLOY_EXE="$ROOT/csm_server.exe"

if [[ ! -f "$EXE" ]]; then
  echo "[LOI] Khong tao duoc $EXE"
  exit 1
fi

cp -f "$EXE" "$DEPLOY_EXE"
echo ""
echo "✅ Binary: $(ls -lh "$DEPLOY_EXE" | awk '{print $5, $9}')"
echo ""

chmod +x "$BUNDLE_SCRIPT"
"$BUNDLE_SCRIPT" "$DEPLOY_EXE" "$ROOT"

echo ""
echo "=== Goi trien khai Windows (copy ca thu muc hoac cac file sau) ==="
echo "  $ROOT/"
echo "    csm_server.exe"
ls "$ROOT"/lib*.dll 2>/dev/null | while read -r f; do echo "    $(basename "$f")"; done
echo "    config.env"
echo "    csm_datas/"
echo "    nssm.exe"
echo "    *.bat"
echo ""
echo "Tren Windows (Admin):"
echo "  check-windows-runtime.bat"
echo "  install-csm-rust-service.bat"
