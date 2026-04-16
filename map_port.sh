#!/bin/bash
set -euo pipefail

# ----------------------------------------------------------------
# 1. Cấu hình thông số
# ----------------------------------------------------------------
# Tự detect IP WSL hiện tại (thay đổi sau mỗi lần reboot WSL)
WSL_IP="${WSL_IP:-$(hostname -I | awk '{print $1}')}"
# Lắng nghe trên tất cả interface của Windows (0.0.0.0 = mọi IP LAN/WAN)
LISTEN_IP="${LISTEN_IP:-0.0.0.0}"
# Danh sách port cần map: 15300=HTTP alt, 15301=WebSocket
PORTS=(15300 15301)

# Tìm PowerShell theo nhiều vị trí phổ biến
POWERSHELL_EXE="${POWERSHELL_EXE:-}"
if [[ -z "$POWERSHELL_EXE" ]]; then
  for candidate in \
    "$(command -v powershell.exe 2>/dev/null || true)" \
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" \
    "/mnt/c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" \
    "/mnt/c/Program Files/PowerShell/7/pwsh.exe"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      POWERSHELL_EXE="$candidate"
      break
    fi
  done
fi

if [[ -z "$POWERSHELL_EXE" ]]; then
  echo "[ERROR] Khong tim thay PowerShell. Kiem tra WSL interop hoac truyen tay:"
  echo "  POWERSHELL_EXE=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe ./map_port.sh"
  exit 1
fi

if [[ -z "$WSL_IP" ]]; then
  echo "[ERROR] Khong the tu dong detect WSL_IP. Truyen tay: WSL_IP=x.x.x.x ./map_port.sh"
  exit 1
fi

echo "--------------------------------------------------------"
echo "WSL IP : $WSL_IP"
echo "Listen : $LISTEN_IP (tat ca IP tren Windows)"
echo "Ports  : ${PORTS[*]}"
echo "PS     : $POWERSHELL_EXE"
echo "--------------------------------------------------------"

# ----------------------------------------------------------------
# 2. Xây dựng lệnh PowerShell
# ----------------------------------------------------------------
CMD="netsh interface portproxy reset; "
for p in "${PORTS[@]}"; do
  CMD="$CMD netsh interface portproxy add v4tov4 listenport=$p listenaddress=$LISTEN_IP connectport=$p connectaddress=$WSL_IP; "
  CMD="$CMD netsh advfirewall firewall delete rule name='WSL_Port_$p' 2>NUL; "
  CMD="$CMD netsh advfirewall firewall add rule name='WSL_Port_$p' dir=in action=allow protocol=TCP localport=$p; "
done
CMD="$CMD netsh interface portproxy show all; "

# ----------------------------------------------------------------
# 3. Mã hóa Base64 (UTF-16LE) để PowerShell nhận chính xác
# ----------------------------------------------------------------
ENCODED_CMD=$(echo -n "$CMD" | iconv -t UTF-16LE | base64 -w 0)

# ----------------------------------------------------------------
# 4. Gọi sang Windows thực thi quyền Admin
# ----------------------------------------------------------------
"$POWERSHELL_EXE" -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand $ENCODED_CMD' -Verb RunAs"

echo "Da gui lenh thanh cong tu WSL sang Windows."
echo "Nhan 'Yes' tren cua so UAC Admin cua Windows vua hien ra."
echo "--------------------------------------------------------"
echo "Kiem tra tu may khac trong LAN: curl http://<IP-Windows>:9999/api/monitoring/health"
echo "Kiem tra port proxy: netsh interface portproxy show all"