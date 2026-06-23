#!/usr/bin/env bash
set -euo pipefail
SERVICE_NAME="${SERVICE_NAME:-csm-rust}"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root: sudo $0" >&2
  exit 1
fi
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
echo "[uninstall] removed ${SERVICE_NAME}"
