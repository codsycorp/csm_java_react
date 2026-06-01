#!/usr/bin/env bash
# Bundles ggml Metal shader + precompiled default.metallib for net.ladenthin:llama (Mac M1).
# Runtime compile of ggml-metal.metal spikes RAM → OOM exit 137 when loading 3B in-JVM.
#
# Usage: ./scripts/setup-llama-metal-macos.sh
#
# Requires full Xcode (not CommandLineTools-only) + Metal Toolchain:
#   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
#   xcodebuild -downloadComponent MetalToolchain

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/backend/src/main/resources/net/ladenthin/llama/Mac/aarch64"
BASE="https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src"

log() { printf '[setup-llama-metal] %s\n' "$*"; }

resolve_metal() {
  if xcrun --find metal >/dev/null 2>&1; then
    xcrun --find metal
    return
  fi
  if [ -x "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/metal" ]; then
    echo "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/metal"
    return
  fi
  command -v metal 2>/dev/null || true
}

resolve_metallib() {
  if xcrun --find metallib >/dev/null 2>&1; then
    xcrun --find metallib
    return
  fi
  if [ -x "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/metallib" ]; then
    echo "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/metallib"
    return
  fi
  command -v metallib 2>/dev/null || true
}

mkdir -p "$DEST"
for f in ggml-metal/ggml-metal.metal ggml-common.h ggml-metal/ggml-metal-impl.h; do
  name="$(basename "$f")"
  log "Download $name"
  curl -fsSL "$BASE/$f" -o "$DEST/$name"
done

METAL="$(resolve_metal)"
METALLIB="$(resolve_metallib)"
if [ -n "$METAL" ] && [ -n "$METALLIB" ]; then
  log "Compile default.metallib (may take 1–2 min)..."
  cd "$DEST"
  "$METAL" -c ggml-metal.metal -o ggml-metal.air
  "$METALLIB" ggml-metal.air -o default.metallib
  rm -f ggml-metal.air
  log "OK: $DEST/default.metallib ($(du -h default.metallib | cut -f1))"
else
  log "WARN: metal/metallib not found."
  log "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  log "  xcodebuild -downloadComponent MetalToolchain"
  log "  Then re-run this script. Until then use AI_LOCAL_LLAMA_GPU_LAYERS=0 (CPU, slower)."
fi
ls -lh "$DEST"/ggml-metal.metal "$DEST"/default.metallib 2>/dev/null || ls -lh "$DEST"/ggml-metal.metal
