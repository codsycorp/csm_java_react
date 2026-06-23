#!/usr/bin/env bash
# Bundle non-glibc shared libs next to Linux binary (for copy-and-run deploy).
set -euo pipefail

BIN="${1:?binary path}"
LIB_DIR="${2:?lib output dir}"

if [[ ! -f "$BIN" ]]; then
  echo "[bundle-linux] missing binary: $BIN" >&2
  exit 1
fi

mkdir -p "$LIB_DIR"

skip_lib() {
  local base="$1"
  case "$base" in
    ld-linux*.so*|linux-vdso.so*|libc.so*|libm.so*|libpthread.so*|libdl.so*|librt.so*|libresolv.so*|libnss_*|libutil.so*)
      return 0
      ;;
  esac
  return 1
}

copy_lib() {
  local src="$1"
  local base
  base="$(basename "$src")"
  skip_lib "$base" && return 0
  if [[ ! -f "$LIB_DIR/$base" ]]; then
    cp -fL "$src" "$LIB_DIR/$base"
    echo "  + $base"
  fi
}

echo "→ bundle-linux-runtime: $BIN → $LIB_DIR"
while IFS= read -r line; do
  if [[ "$line" =~ =\>\ (/.*)\ \(0x ]]; then
    copy_lib "${BASH_REMATCH[1]}"
  elif [[ "$line" =~ =\>\ (/.*)$ ]]; then
    copy_lib "${BASH_REMATCH[1]}"
  fi
done < <(ldd "$BIN" 2>/dev/null || true)

# Transitive deps from bundled libs
changed=1
round=0
while [[ "$changed" -eq 1 && "$round" -lt 8 ]]; do
  changed=0
  round=$((round + 1))
  for lib in "$LIB_DIR"/*.so*; do
    [[ -f "$lib" ]] || continue
    while IFS= read -r line; do
      if [[ "$line" =~ =\>\ (/.*)\ \(0x ]]; then
        src="${BASH_REMATCH[1]}"
        base="$(basename "$src")"
        if ! skip_lib "$base" && [[ ! -f "$LIB_DIR/$base" ]]; then
          cp -fL "$src" "$LIB_DIR/$base"
          echo "  + $base (transitive)"
          changed=1
        fi
      fi
    done < <(ldd "$lib" 2>/dev/null || true)
  done
done

if command -v patchelf >/dev/null 2>&1; then
  patchelf --set-rpath '$ORIGIN/../lib' "$BIN" 2>/dev/null || patchelf --set-rpath '$ORIGIN/lib' "$BIN"
  echo "→ patchelf rpath set on $(basename "$BIN")"
fi

echo "→ bundled $(find "$LIB_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ') libs"
