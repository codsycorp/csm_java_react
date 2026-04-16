#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="csm-server"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/start.sh"
STOP_SCRIPT="${SCRIPT_DIR}/stop.sh"
MAP_PORT_SCRIPT="${SCRIPT_DIR}/map_port.sh"
RUN_MAP_PORT="${RUN_MAP_PORT:-true}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Vui long chay bang sudo: sudo bash setup_wsl_autostart.sh"
  exit 1
fi

if [[ ! -f "${START_SCRIPT}" ]]; then
  echo "[ERROR] Khong tim thay start.sh tai: ${START_SCRIPT}"
  exit 1
fi

if [[ ! -f "${STOP_SCRIPT}" ]]; then
  echo "[WARN] Khong tim thay stop.sh tai: ${STOP_SCRIPT}"
  echo "[WARN] Service van duoc tao, nhung ExecStop se bo qua."
fi

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=CSM Server Auto Start
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/bin/bash ${START_SCRIPT}
$( [[ -f "${STOP_SCRIPT}" ]] && echo "ExecStop=/bin/bash ${STOP_SCRIPT}" )
RemainAfterExit=yes
TimeoutStartSec=120
User=root

[Install]
WantedBy=multi-user.target
EOF

echo "[INFO] Da tao service: ${SERVICE_FILE}"

if [[ -f /etc/wsl.conf ]] && grep -q "^systemd=true" /etc/wsl.conf; then
  echo "[INFO] Da phat hien systemd=true trong /etc/wsl.conf"
else
  echo "[WARN] Chua bat systemd cho WSL. Them vao /etc/wsl.conf:"
  echo "[boot]"
  echo "systemd=true"
  echo "Sau do chay tren Windows PowerShell: wsl --shutdown"
fi

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"

# Start non-blocking to avoid looking stuck when start.sh performs cleanup/retry loops.
systemctl start --no-block "${SERVICE_NAME}.service"

echo "[INFO] Dang khoi dong service, cho toi da 120 giay..."
start_deadline=$((SECONDS + 120))
seen_activating=false
while (( SECONDS < start_deadline )); do
  state=$(systemctl is-active "${SERVICE_NAME}.service" 2>/dev/null || true)
  substate=$(systemctl show -p SubState --value "${SERVICE_NAME}.service" 2>/dev/null || true)

  if [[ "${state}" == "activating" || "${substate}" == "start" ]]; then
    seen_activating=true
  fi

  # active  = oneshot da chay xong thanh cong (RemainAfterExit=yes)
  # failed  = start.sh thoat voi loi
  # inactive = chi dung neu da tung thay activating (tuc la da chay xong)
  if [[ "${state}" == "active" || "${state}" == "failed" ]]; then
    break
  fi
  if [[ "${state}" == "inactive" && "${seen_activating}" == "true" ]]; then
    break
  fi

  echo "[INFO] state=${state:-unknown}, substate=${substate:-unknown} ..."
  sleep 2
done

echo "[INFO] Trang thai service:"
systemctl --no-pager --full status "${SERVICE_NAME}.service" || true

if ! systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  echo "[WARN] Service chua active ngay. Xem log chi tiet bang lenh:"
  echo "journalctl -u ${SERVICE_NAME}.service -n 100 --no-pager"
fi

if [[ "${RUN_MAP_PORT}" == "true" ]]; then
  if [[ -f "${MAP_PORT_SCRIPT}" ]]; then
    # Tìm PowerShell theo nhiều đường dẫn Windows phổ biến
    ps_exe=""
    for candidate in \
      "$(command -v powershell.exe 2>/dev/null || true)" \
      "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" \
      "/mnt/c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" \
      "/mnt/c/Program Files/PowerShell/7/pwsh.exe"; do
      if [[ -n "$candidate" && -x "$candidate" ]]; then
        ps_exe="$candidate"
        break
      fi
    done

    if [[ -n "$ps_exe" ]]; then
      chmod +x "${MAP_PORT_SCRIPT}" 2>/dev/null || true
      echo "[INFO] Dang goi map port Windows <-> WSL qua: ${MAP_PORT_SCRIPT}"
      if POWERSHELL_EXE="${ps_exe}" /bin/bash "${MAP_PORT_SCRIPT}"; then
        echo "[INFO] Da goi map_port.sh thanh cong."
      else
        echo "[WARN] map_port.sh bi loi. Bo qua de khong chan setup auto-start."
      fi
    else
      echo "[WARN] Khong tim thay PowerShell. WSL interop co the dang tat."
      echo "       Them vao /etc/wsl.conf: [interop] / enabled=true / appendWindowsPath=true"
      echo "       Sau do chay lai tu Windows: wsl --shutdown"
    fi
  else
    echo "[WARN] Khong tim thay file map_port.sh tai: ${MAP_PORT_SCRIPT}"
  fi
fi

echo
echo "[DONE] Cau hinh xong auto-start trong WSL."
echo "Neu reboot Windows ma WSL chua tu khoi dong, tao Scheduled Task chay:"
echo "wsl -d <TenDistro> -u root -- bash -lc 'echo WSL started'"