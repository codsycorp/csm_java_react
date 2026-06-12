#!/usr/bin/env bash
# Gom day du runtime MinGW cho csm_server.exe (goi tu build-windows-release.sh)
set -euo pipefail

usage() {
  echo "Usage: $0 <csm_server.exe> <dest_dir>"
  exit 1
}

[[ $# -ge 2 ]] || usage

EXE="$1"
DEST="$2"

if [[ ! -f "$EXE" ]]; then
  echo "[LOI] Khong tim thay exe: $EXE"
  exit 1
fi

if ! command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
  echo "[LOI] Thieu x86_64-w64-mingw32-gcc (brew install mingw-w64)"
  exit 1
fi

if ! command -v x86_64-w64-mingw32-objdump >/dev/null 2>&1; then
  echo "[LOI] Thieu x86_64-w64-mingw32-objdump"
  exit 1
fi

init_mingw_paths() {
  MINGW_BIN=""
  if command -v brew >/dev/null 2>&1; then
    local _prefix
    _prefix="$(brew --prefix mingw-w64 2>/dev/null || true)"
    if [[ -n "$_prefix" && -d "$_prefix/toolchain-x86_64/bin" ]]; then
      MINGW_BIN="$_prefix/toolchain-x86_64/bin"
    fi
  fi
  if [[ -z "$MINGW_BIN" ]]; then
    MINGW_BIN="$(dirname "$(command -v x86_64-w64-mingw32-gcc)")"
  fi
  MINGW_SYS_BIN="$MINGW_BIN/../x86_64-w64-mingw32/bin"
  MINGW_SYS_LIB="$MINGW_BIN/../x86_64-w64-mingw32/lib"
  MINGW_SEARCH_DIRS=("$MINGW_SYS_BIN" "$MINGW_SYS_LIB" "$MINGW_BIN")
}

is_windows_system_dll() {
  local lower
  lower="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    kernel32.dll|ntdll.dll|ws2_32.dll|advapi32.dll|bcrypt.dll|bcryptprimitives.dll|\
    crypt32.dll|rpcrt4.dll|secur32.dll|shlwapi.dll|user32.dll|gdi32.dll|\
    shell32.dll|ole32.dll|oleaut32.dll|comctl32.dll|comdlg32.dll|\
    msimg32.dll|msvcrt.dll|ucrtbase.dll|version.dll|winmm.dll|imm32.dll|\
    setupapi.dll|cfgmgr32.dll|dhcpcsvc.dll|iphlpapi.dll|dnsapi.dll|\
    userenv.dll|profapi.dll|powrprof.dll|winspool.drv|wtsapi32.dll)
      return 0
      ;;
  esac
  [[ "$lower" == api-ms-win-* ]] && return 0
  [[ "$lower" == vcruntime*.dll ]] && return 0
  return 1
}

list_pe_dll_deps() {
  local file="$1"
  x86_64-w64-mingw32-objdump -p "$file" 2>/dev/null | awk '/DLL Name:/ {print $3}' | sort -u
}

find_mingw_dll() {
  local name="$1"
  local p dir
  p="$(x86_64-w64-mingw32-gcc -print-file-name="$name" 2>/dev/null || true)"
  if [[ -n "$p" && -f "$p" && "$p" != "$name" ]]; then
    echo "$p"
    return 0
  fi
  for dir in "${MINGW_SEARCH_DIRS[@]}"; do
    if [[ -f "$dir/$name" ]]; then
      echo "$dir/$name"
      return 0
    fi
  done
  return 1
}

copy_proactive_runtime() {
  local dir f base
  echo "→ Copy toan bo lib*.dll tu MinGW toolchain..."
  for dir in "${MINGW_SEARCH_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    for f in "$dir"/lib*.dll; do
      [[ -f "$f" ]] || continue
      base="$(basename "$f")"
      if [[ ! -f "$DEST/$base" ]]; then
        cp -f "$f" "$DEST/"
        echo "  + $base"
      fi
    done
  done
}

bundle_transitive_deps() {
  local seen_file queue_file dll path scanned sub
  seen_file="$(mktemp)"
  queue_file="$(mktemp)"
  trap 'rm -f "$seen_file" "$queue_file"' RETURN

  list_pe_dll_deps "$EXE" > "$queue_file"

  while [[ -s "$queue_file" ]]; do
    dll="$(head -n 1 "$queue_file")"
    tail -n +2 "$queue_file" > "${queue_file}.tmp" && mv "${queue_file}.tmp" "$queue_file"

    grep -Fxq "$dll" "$seen_file" 2>/dev/null && continue
    echo "$dll" >> "$seen_file"

    is_windows_system_dll "$dll" && continue

    if [[ ! -f "$DEST/$dll" ]]; then
      if path="$(find_mingw_dll "$dll")"; then
        cp -f "$path" "$DEST/"
        echo "  + $dll (phu thuoc exe/DLL)"
      else
        echo "  [WARN] Khong tim thay trong toolchain: $dll"
        continue
      fi
    fi

    scanned="$DEST/$dll"
    [[ -f "$scanned" ]] || continue
    while read -r sub; do
      grep -Fxq "$sub" "$seen_file" 2>/dev/null || echo "$sub" >> "$queue_file"
    done < <(list_pe_dll_deps "$scanned")
  done
}

verify_runtime() {
  local missing=0 dll
  echo "→ Kiem tra runtime sau khi bundle..."
  while read -r dll; do
    is_windows_system_dll "$dll" && continue
    if [[ ! -f "$DEST/$dll" ]]; then
      echo "  [LOI] Thieu: $dll"
      missing=1
    else
      echo "  OK  $dll"
    fi
  done < <(list_pe_dll_deps "$EXE")

  if [[ "$missing" -ne 0 ]]; then
    echo ""
    echo "[LOI] Bundle runtime chua du — build that bai."
    exit 1
  fi
}

init_mingw_paths
mkdir -p "$DEST"

echo "=== Bundle MinGW runtime ==="
echo "Exe  : $EXE"
echo "Dest : $DEST"
echo "MinGW: $MINGW_BIN"
echo ""

copy_proactive_runtime
echo ""
echo "→ Quet phu thuoc de quy tu exe + DLL da copy..."
bundle_transitive_deps
echo ""
verify_runtime

echo ""
echo "→ Danh sach lib*.dll trong goi trien khai:"
ls -lh "$DEST"/lib*.dll 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo "[OK] Da bundle day du runtime MinGW."
