#!/usr/bin/env bash
# Gộp file Rust từ csm-rust-linux-amd64/ lên thư mục runtime (vd. /root/la_server).
# Chạy khi deploy cũ giải nén vào subfolder thay vì flatten.
set -euo pipefail

CSM_HOME="$(cd "$(dirname "$0")" && pwd)"
SUB="$CSM_HOME/csm-rust-linux-amd64"

if [[ ! -d "$SUB" ]]; then
  echo "[flatten] Không có $SUB — bỏ qua"
  exit 0
fi

echo "[flatten] Gộp $SUB → $CSM_HOME"
rsync -a "$SUB/" "$CSM_HOME/"
rm -rf "$SUB"
chmod +x "$CSM_HOME/csm_rust_server" "$CSM_HOME/bin/csm_rust_server" 2>/dev/null || true
chmod +x "$CSM_HOME"/*.sh 2>/dev/null || true

if [[ -x "$CSM_HOME/install-csm-rust-service.sh" ]]; then
  echo "[flatten] OK — sẵn sàng: ./install-csm-rust-service.sh"
else
  echo "[flatten] WARN: vẫn thiếu install-csm-rust-service.sh" >&2
  exit 1
fi
