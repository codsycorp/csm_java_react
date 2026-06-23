#!/usr/bin/env bash
# Bundle MinGW runtime DLLs for Windows deploy (runs inside Docker Linux + mingw).
set -euo pipefail

EXE="${1:?exe path}"
DEST="${2:?dest dir}"

MINGW_BIN="$(dirname "$(command -v x86_64-w64-mingw32-gcc)")"
MINGW_SYS_BIN="$MINGW_BIN/../x86_64-w64-mingw32/bin"
MINGW_SYS_LIB="$MINGW_BIN/../x86_64-w64-mingw32/lib"
MINGW_SEARCH_DIRS=("$MINGW_SYS_BIN" "$MINGW_SYS_LIB" "$MINGW_BIN")

is_windows_system_dll() {
  local lower
  lower="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    kernel32.dll|ntdll.dll|ws2_32.dll|advapi32.dll|bcrypt.dll|bcryptprimitives.dll|\
    crypt32.dll|rpcrt4.dll|secur32.dll|shlwapi.dll|user32.dll|gdi32.dll|\
    shell32.dll|ole32.dll|oleaut32.dll|comctl32.dll|comdlg32.dll|\
    msimg32.dll|msvcrt.dll|ucrtbase.dll|version.dll|winmm.dll|imm32.dll|\
    setupapi.dll|cfgmgr32.dll|dhcpcsvc.dll|iphlpapi.dll|dnsapi.dll|\
    userenv.dll|profapi.dll|powrprof.dll|winspool.drv|wtsapi32.dll|\
    pdh.dll|psapi.dll|dbghelp.dll)
      return 0 ;;
  esac
  [[ "$lower" == api-ms-win-* ]] && return 0
  [[ "$lower" == vcruntime*.dll ]] && return 0
  return 1
}

list_pe_dll_deps() {
  x86_64-w64-mingw32-objdump -p "$1" 2>/dev/null | awk '/DLL Name:/ {print $3}' | sort -u
}

find_mingw_dll() {
  local name="$1" dir p
  p="$(x86_64-w64-mingw32-gcc -print-file-name="$name" 2>/dev/null || true)"
  if [[ -n "$p" && -f "$p" && "$p" != "$name" ]]; then
    echo "$p"
    return 0
  fi
  for dir in "${MINGW_SEARCH_DIRS[@]}"; do
    [[ -f "$dir/$name" ]] && { echo "$dir/$name"; return 0; }
  done
  return 1
}

mkdir -p "$DEST"
echo "→ copy proactive lib*.dll from MinGW..."
for dir in "${MINGW_SEARCH_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  for f in "$dir"/lib*.dll; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    [[ -f "$DEST/$base" ]] || cp -f "$f" "$DEST/$base"
  done
done

seen="$(mktemp)"
queue="$(mktemp)"
trap 'rm -f "$seen" "$queue"' EXIT
list_pe_dll_deps "$EXE" > "$queue"

while [[ -s "$queue" ]]; do
  dll="$(head -n 1 "$queue")"
  tail -n +2 "$queue" > "${queue}.tmp" && mv "${queue}.tmp" "$queue"
  grep -Fxq "$dll" "$seen" 2>/dev/null && continue
  echo "$dll" >> "$seen"
  is_windows_system_dll "$dll" && continue
  if [[ ! -f "$DEST/$dll" ]]; then
    path="$(find_mingw_dll "$dll" || true)"
    if [[ -n "$path" ]]; then
      cp -f "$path" "$DEST/$dll"
      echo "  + $dll"
    else
      echo "  [WARN] missing in toolchain: $dll"
    fi
  fi
  [[ -f "$DEST/$dll" ]] || continue
  while read -r sub; do
    grep -Fxq "$sub" "$seen" 2>/dev/null || echo "$sub" >> "$queue"
  done < <(list_pe_dll_deps "$DEST/$dll")
done

missing=0
while read -r dll; do
  is_windows_system_dll "$dll" && continue
  if [[ ! -f "$DEST/$dll" ]]; then
    echo "[LOI] thieu DLL: $dll" >&2
    missing=1
  fi
done < <(list_pe_dll_deps "$EXE")

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi
echo "[OK] Windows runtime bundle complete"
