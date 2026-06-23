#!/usr/bin/env bash
# Install Prometheus on production VM to scrape CSM Go metrics.
# Usage:
#   sudo ./deploy/observability/install-prometheus-production.sh
#   CSM_GO_HOST=127.0.0.1 CSM_GO_PORT=9999 sudo ./deploy/observability/install-prometheus-production.sh
set -euo pipefail

CSM_GO_HOST="${CSM_GO_HOST:-127.0.0.1}"
CSM_GO_PORT="${CSM_GO_PORT:-9999}"
PROM_VERSION="${PROM_VERSION:-2.54.1}"
INSTALL_DIR="${INSTALL_DIR:-/opt/prometheus}"
CONFIG_DIR="${CONFIG_DIR:-/etc/prometheus}"
DATA_DIR="${DATA_DIR:-/var/lib/prometheus}"
USER="${PROM_USER:-prometheus}"

echo "▶ Installing Prometheus ${PROM_VERSION}..."

id -u "$USER" &>/dev/null || useradd --no-create-home --shell /usr/sbin/nologin "$USER"
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
chown -R "$USER:$USER" "$DATA_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

TARBALL="prometheus-${PROM_VERSION}.linux-${ARCH}.tar.gz"
URL="https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/${TARBALL}"
TMP="/tmp/${TARBALL}"

if [[ ! -x "${INSTALL_DIR}/prometheus" ]]; then
  curl -fsSL "$URL" -o "$TMP"
  tar -xzf "$TMP" -C /tmp
  cp "/tmp/prometheus-${PROM_VERSION}.linux-${ARCH}/prometheus" "$INSTALL_DIR/"
  cp "/tmp/prometheus-${PROM_VERSION}.linux-${ARCH}/promtool" "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/prometheus" "$INSTALL_DIR/promtool"
  rm -rf "$TMP" "/tmp/prometheus-${PROM_VERSION}.linux-${ARCH}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/prometheus-rules.yml" "${CONFIG_DIR}/rules.yml"

cat > "${CONFIG_DIR}/prometheus.yml" <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - ${CONFIG_DIR}/rules.yml

scrape_configs:
  - job_name: csm-go
    metrics_path: /metrics
    static_configs:
      - targets: ['${CSM_GO_HOST}:${CSM_GO_PORT}']
        labels:
          service: csm-go
EOF

chown -R "$USER:$USER" "$CONFIG_DIR"

cat > /etc/systemd/system/prometheus.service <<EOF
[Unit]
Description=Prometheus
After=network-online.target
Wants=network-online.target

[Service]
User=${USER}
Group=${USER}
Type=simple
ExecStart=${INSTALL_DIR}/prometheus \\
  --config.file=${CONFIG_DIR}/prometheus.yml \\
  --storage.tsdb.path=${DATA_DIR} \\
  --web.listen-address=0.0.0.0:9090
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable prometheus
systemctl restart prometheus

echo "✅ Prometheus running on :9090"
echo "   Scrape target: http://${CSM_GO_HOST}:${CSM_GO_PORT}/metrics"
echo "   Verify: curl -s http://127.0.0.1:9090/-/healthy"
echo "   Query:  curl -s 'http://127.0.0.1:9090/api/v1/query?query=up{job=\"csm-go\"}'"
