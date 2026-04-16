#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="csm-server"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"

JAR_PREFIX="csm_server-"
APP_PORT="${APP_PORT:-15300}"
SOCKET_PORT="${SOCKET_PORT:-15301}"
DB_PATH="${DB_PATH:-csm_datas/database}"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/console.log"
GC_LOG="${LOG_DIR}/gc.log"

RUN_MAP_PORT="${RUN_MAP_PORT:-true}"
LISTEN_IP="${LISTEN_IP:-0.0.0.0}"
AUTO_CREATE_WINDOWS_TASK="${AUTO_CREATE_WINDOWS_TASK:-true}"
WINDOWS_TASK_NAME="${WINDOWS_TASK_NAME:-CSM_WSL_AutoStart}"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

require_root_for_install() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "[ERROR] Vui long chay bang sudo: sudo bash setup_wsl_autostart.sh"
    exit 1
  fi
}

ensure_java_available() {
  if command -v java >/dev/null 2>&1; then
    return 0
  fi

  local candidate
  for candidate in \
    "/usr/lib/jvm/default-java/bin" \
    "/usr/lib/jvm/java-21-openjdk-amd64/bin" \
    "/usr/lib/jvm/java-17-openjdk-amd64/bin" \
    "/usr/lib/jvm/java-11-openjdk-amd64/bin" \
    "/usr/java/latest/bin"; do
    if [[ -x "${candidate}/java" ]]; then
      export PATH="${candidate}:${PATH}"
      return 0
    fi
  done

  return 1
}

detect_total_mem_mb() {
  local mem_kb
  if [[ -r /proc/meminfo ]]; then
    mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    echo $((mem_kb / 1024))
    return
  fi
  echo 0
}

compute_heap_size() {
  if [[ -n "${HEAP_SIZE:-}" ]]; then
    echo "${HEAP_SIZE}"
    return
  fi

  local total_mem_mb
  total_mem_mb=$(detect_total_mem_mb)
  if [[ "${total_mem_mb}" -lt 3500 ]]; then
    echo "1g"
  elif [[ "${total_mem_mb}" -lt 7000 ]]; then
    echo "2g"
  elif [[ "${total_mem_mb}" -lt 12000 ]]; then
    echo "4g"
  else
    echo "6g"
  fi
}

resolve_jar() {
  local jar_name
  jar_name=$(find "${SCRIPT_DIR}" -maxdepth 1 -type f -name "${JAR_PREFIX}*.jar" ! -name "*.jar.original" -print | sort | head -n 1 || true)
  echo "${jar_name}"
}

cleanup_runtime_artifacts() {
  if [[ -d "${SCRIPT_DIR}/${DB_PATH}" ]]; then
    find "${SCRIPT_DIR}/${DB_PATH}" -name "LOCK" -type f -delete 2>/dev/null || true
    find "${SCRIPT_DIR}/${DB_PATH}" -name "*.lock" -type f -delete 2>/dev/null || true
  fi
  rm -f /tmp/librocksdbjni*.so 2>/dev/null || true
}

kill_by_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti:"${port}" 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    kill ${pids} 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti:"${port}" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
      kill -9 ${pids} 2>/dev/null || true
    fi
  fi
}

stop_java_processes() {
  local pids
  pids=$(pgrep -f "java .*${JAR_PREFIX}" || true)
  if [[ -n "${pids}" ]]; then
    kill ${pids} 2>/dev/null || true
    sleep 2
    pids=$(pgrep -f "java .*${JAR_PREFIX}" || true)
    if [[ -n "${pids}" ]]; then
      kill -9 ${pids} 2>/dev/null || true
    fi
  fi
}

run_windows_portproxy() {
  local wsl_ip cmd
  local ports

  wsl_ip="${WSL_IP:-$(hostname -I | awk '{print $1}') }"
  wsl_ip="${wsl_ip%% *}"
  ports=(15300 15301)

  if [[ -z "$(find_powershell_exe)" || -z "${wsl_ip}" ]]; then
    log "[WARN] Bo qua map port vi thieu PowerShell hoac WSL IP"
    return 1
  fi

  cmd="netsh interface portproxy reset; "
  for p in "${ports[@]}"; do
    cmd+="netsh interface portproxy add v4tov4 listenport=${p} listenaddress=${LISTEN_IP} connectport=${p} connectaddress=${wsl_ip}; "
    cmd+="netsh advfirewall firewall delete rule name='WSL_Port_${p}' 2>NUL; "
    cmd+="netsh advfirewall firewall add rule name='WSL_Port_${p}' dir=in action=allow protocol=TCP localport=${p}; "
  done
  cmd+="netsh interface portproxy show all; "

  run_windows_powershell_admin "${cmd}" || true

  log "[INFO] Da gui lenh map port sang Windows. Neu hien UAC, hay nhan Yes"
  return 0
}

find_powershell_exe() {
  local powershell_exe candidate
  powershell_exe="${POWERSHELL_EXE:-}"
  if [[ -n "${powershell_exe}" && -x "${powershell_exe}" ]]; then
    echo "${powershell_exe}"
    return 0
  fi

  for candidate in \
    "$(command -v powershell.exe 2>/dev/null || true)" \
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" \
    "/mnt/c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" \
    "/mnt/c/Program Files/PowerShell/7/pwsh.exe"; do
    if [[ -n "${candidate}" && -x "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

run_windows_powershell_admin() {
  local ps_exe encoded_cmd
  local script_text="$1"

  ps_exe=$(find_powershell_exe || true)
  if [[ -z "${ps_exe}" ]]; then
    return 1
  fi

  encoded_cmd=$(echo -n "${script_text}" | iconv -t UTF-16LE | base64 -w 0)
  "${ps_exe}" -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded_cmd}' -Verb RunAs" >/dev/null 2>&1
}

create_windows_scheduled_task() {
  local distro_name cmd
  distro_name="${WSL_DISTRO_NAME:-}"

  if [[ -z "${distro_name}" ]]; then
    log "[WARN] Khong doc duoc WSL_DISTRO_NAME, bo qua tao Scheduled Task"
    return 1
  fi

  cmd="schtasks /Create /TN \"${WINDOWS_TASK_NAME}\" /SC ONSTART /RU SYSTEM /RL HIGHEST /F /TR \"wsl.exe -d ${distro_name} -u root -- bash -lc 'echo WSL started; systemctl start ${SERVICE_NAME}.service'\"; schtasks /Query /TN \"${WINDOWS_TASK_NAME}\" /V /FO LIST;"

  if run_windows_powershell_admin "${cmd}"; then
    log "[INFO] Da gui lenh tao Scheduled Task '${WINDOWS_TASK_NAME}' sang Windows"
    log "[INFO] Neu hien UAC thi nhan Yes de hoan tat"
    return 0
  fi

  log "[WARN] Tao Scheduled Task that bai. Kiem tra PowerShell/WSL interop"
  return 1
}

service_start() {
  mkdir -p "${LOG_DIR}"

  if ! ensure_java_available; then
    log "[ERROR] Khong tim thay java trong PATH"
    exit 1
  fi

  local jar_name
  jar_name=$(resolve_jar)
  if [[ -z "${jar_name}" ]]; then
    log "[ERROR] Khong tim thay file ${JAR_PREFIX}*.jar tai ${SCRIPT_DIR}"
    exit 1
  fi

  local heap_size heap_init direct_memory tomcat_threads tomcat_conns tomcat_accept
  heap_size=$(compute_heap_size)
  heap_init="${HEAP_INIT:-512m}"
  direct_memory="${DIRECT_MEMORY_SIZE:-192m}"
  tomcat_threads="${TOMCAT_MAX_THREADS:-48}"
  tomcat_conns="${TOMCAT_MAX_CONNECTIONS:-240}"
  tomcat_accept="${TOMCAT_ACCEPT_COUNT:-80}"

  stop_java_processes
  kill_by_port "${APP_PORT}"
  kill_by_port "${SOCKET_PORT}"
  cleanup_runtime_artifacts

  if [[ "${RUN_MAP_PORT}" == "true" ]]; then
    run_windows_portproxy || true
  fi

  cd "${SCRIPT_DIR}"
  log "[INFO] Java: $(command -v java)"
  log "[INFO] Start JAR: ${jar_name}"

  exec java \
    -Xms${heap_init} -Xmx${heap_size} \
    -XX:MetaspaceSize=128m \
    -XX:MaxMetaspaceSize=256m \
    -XX:MaxDirectMemorySize=${direct_memory} \
    -XX:+UseG1GC \
    -XX:MaxGCPauseMillis=200 \
    -XX:+UseStringDeduplication \
    -XX:+UseCompressedOops \
    -XX:+UseCompressedClassPointers \
    -XX:+TieredCompilation \
    -XX:+DisableExplicitGC \
    -XX:+HeapDumpOnOutOfMemoryError \
    -XX:HeapDumpPath="${LOG_DIR}/heapdump.hprof" \
    -XX:ErrorFile="${LOG_DIR}/hs_err_pid%p.log" \
    -Djava.awt.headless=true \
    -Djava.net.preferIPv4Stack=true \
    -Dfile.encoding=UTF-8 \
    -Dspring.jmx.enabled=false \
    -Xlog:gc*:file="${GC_LOG}":time,uptime,level,tags \
    -jar "${jar_name}" \
    --spring.profiles.active=prod \
    --server.port=${APP_PORT} \
    --logging.file.name="${LOG_DIR}/application.log" \
    --server.tomcat.threads.max=${tomcat_threads} \
    --server.tomcat.max-connections=${tomcat_conns} \
    --server.tomcat.accept-count=${tomcat_accept} \
    --logging.logback.rollingpolicy.file-name-pattern="${LOG_DIR}/application.log.%d{yyyy-MM-dd}.%i.gz" \
    --logging.logback.rollingpolicy.max-file-size="${APP_LOG_MAX_FILE_SIZE:-100MB}" \
    --logging.logback.rollingpolicy.max-history="${APP_LOG_MAX_HISTORY:-14}" \
    --logging.logback.rollingpolicy.total-size-cap="${APP_LOG_TOTAL_SIZE_CAP:-5GB}" \
    --logging.logback.rollingpolicy.clean-history-on-start="${APP_LOG_CLEAN_ON_START:-true}" \
    >> "${LOG_FILE}" 2>&1
}

service_stop() {
  log "[INFO] Dang stop backend Java"
  stop_java_processes
  kill_by_port "${APP_PORT}"
  kill_by_port "${SOCKET_PORT}"
  cleanup_runtime_artifacts
  log "[INFO] Da stop backend Java"
}

install_or_update_service() {
  require_root_for_install

  cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=CSM Server Auto Start (All In One)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/jvm/default-java/bin:/usr/lib/jvm/java-21-openjdk-amd64/bin:/usr/lib/jvm/java-17-openjdk-amd64/bin:/usr/lib/jvm/java-11-openjdk-amd64/bin
Environment=RUN_MAP_PORT=${RUN_MAP_PORT}
ExecStart=/bin/bash ${SCRIPT_PATH} --service-start
ExecStop=/bin/bash ${SCRIPT_PATH} --service-stop
Restart=always
RestartSec=5s
TimeoutStartSec=180
TimeoutStopSec=45
KillMode=control-group
User=root

[Install]
WantedBy=multi-user.target
EOF

  echo "[INFO] Da tao/cap nhat service: ${SERVICE_FILE}"

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
  systemctl restart "${SERVICE_NAME}.service"

  if [[ "${AUTO_CREATE_WINDOWS_TASK}" == "true" ]]; then
    create_windows_scheduled_task || true
  fi

  echo "[INFO] Trang thai service:"
  systemctl --no-pager --full status "${SERVICE_NAME}.service" || true

  if ! systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    echo "[WARN] Service chua active. Xem log:"
    echo "journalctl -u ${SERVICE_NAME}.service -n 100 --no-pager"
  fi

  echo
  echo "[DONE] Da cau hinh xong all-in-one auto-start trong WSL."
  echo "Tu lan sau reboot, systemd se tu khoi dong lai backend Java."
}

case "${1:-install}" in
  --service-start)
    service_start
    ;;
  --service-stop)
    service_stop
    ;;
  --map-port)
    run_windows_portproxy
    ;;
  --create-windows-task)
    create_windows_scheduled_task
    ;;
  install|--install|"")
    install_or_update_service
    ;;
  *)
    echo "Usage:"
    echo "  sudo bash setup_wsl_autostart.sh"
    echo "  bash setup_wsl_autostart.sh --service-start"
    echo "  bash setup_wsl_autostart.sh --service-stop"
    echo "  bash setup_wsl_autostart.sh --map-port"
    echo "  bash setup_wsl_autostart.sh --create-windows-task"
    exit 1
    ;;
esac
