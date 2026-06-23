#!/usr/bin/env bash
# Install CSM Rust as systemd service (run as root on Linux).
set -euo pipefail

CSM_HOME="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="${SERVICE_NAME:-csm-rust}"
RUN_USER="${RUN_USER:-root}"
BIN="$CSM_HOME/csm_rust_server"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[install] ERROR: run as root (sudo $0)" >&2
  exit 1
fi

if [[ ! -x "$BIN" ]]; then
  echo "[install] ERROR: missing executable: $BIN" >&2
  exit 1
fi

REAL_BIN="$CSM_HOME/bin/csm_rust_server"
if [[ ! -x "$REAL_BIN" ]]; then
  echo "[install] ERROR: missing executable: $REAL_BIN" >&2
  exit 1
fi
chmod +x "$BIN" "$REAL_BIN"

HOST_ARCH="$(uname -m)"
BIN_DESC="$(file -b "$REAL_BIN")"
case "$HOST_ARCH" in
  x86_64|amd64)
    if ! echo "$BIN_DESC" | grep -qE 'x86-64|Intel 80386'; then
      echo "[install] ERROR: server là x86_64 nhưng binary không phải amd64:" >&2
      echo "  $BIN_DESC" >&2
      echo "[install] Build lại trên Mac: ./docker-build.sh --linux (có --platform linux/amd64)" >&2
      exit 1
    fi
    ;;
  aarch64|arm64)
    if ! echo "$BIN_DESC" | grep -q 'aarch64'; then
      echo "[install] ERROR: server là ARM nhưng binary không phải aarch64:" >&2
      echo "  $BIN_DESC" >&2
      exit 1
    fi
    ;;
esac

if [[ ! -f "$CSM_HOME/config.env" ]]; then
  echo "[install] WARN: config.env not found — copy from config.env.example"
  if [[ -f "$CSM_HOME/config.env.example" ]]; then
    cp -n "$CSM_HOME/config.env.example" "$CSM_HOME/config.env"
    echo "[install] created config.env from example — edit JWT_SECRET before production"
  fi
fi

mkdir -p "$CSM_HOME/logs" \
  "$CSM_HOME/csm_datas/native/pebble" \
  "$CSM_HOME/csm_datas/native/vector/qdrant" \
  "$CSM_HOME/csm_datas/backups" \
  "$CSM_HOME/csm_datas/lucene_index" \
  "$CSM_HOME/csm_datas/ai_local/model"

UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
cat > "$UNIT" <<EOF
[Unit]
Description=CSM Rust Backend
After=network.target mysql.service
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${CSM_HOME}
Environment=CSM_HOME=${CSM_HOME}
Environment=CSM_LOCAL_PROFILE=8gb
Environment=APP_DATA_DIR=${CSM_HOME}/csm_datas
Environment=CSM_NATIVE_DATA_DIR=${CSM_HOME}/csm_datas/native
Environment=CSM_PEBBLE_ROOT=${CSM_HOME}/csm_datas/native/pebble
Environment=CSM_VECTOR_DIR=${CSM_HOME}/csm_datas/native/vector/qdrant
Environment=CSM_KV_BACKUP_DIR=${CSM_HOME}/csm_datas/backups
Environment=LUCENE_INDEX_ROOT_DIR=${CSM_HOME}/csm_datas/lucene_index
Environment=SERVER_PORT=9999
Environment=SOCKET_SERVER_PORT=15301
Environment=CSM_STARTUP_REINDEX=true
Environment=CSM_STARTUP_REINDEX_TABLES=csm/csm_accounts,csm/csm_group_members,csm/sys_autos,csm/sys_la_routers
Environment=LD_LIBRARY_PATH=${CSM_HOME}/lib
EnvironmentFile=-${CSM_HOME}/config.env
EnvironmentFile=-${CSM_HOME}/config.local-8gb.env
ExecStart=${CSM_HOME}/bin/csm_rust_server
Restart=always
RestartSec=5
LimitNOFILE=65536
MemoryMax=7800M
StandardOutput=append:${CSM_HOME}/logs/stdout.log
StandardError=append:${CSM_HOME}/logs/stderr.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2
systemctl status "$SERVICE_NAME" --no-pager | head -20 || true

echo ""
echo "[install] OK — service ${SERVICE_NAME}"
echo "  Health: curl -s http://127.0.0.1:\${SERVER_PORT:-9999}/monitoring/health"
echo "  Logs:   journalctl -u ${SERVICE_NAME} -f"
echo "          ${CSM_HOME}/logs/stderr.log"
