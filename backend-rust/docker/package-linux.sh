#!/usr/bin/env bash
# Runs inside Docker — build Linux binary + bundle + tar.gz to /dist
set -euo pipefail

DIST="${DIST:-/dist}"
STAGING="/tmp/csm-rust-linux-amd64"
PKG_NAME="csm-rust-linux-amd64"
PROFILE="${CSM_BUILD_PROFILE:-release-server}"
FEATURES="${CSM_BUILD_FEATURES:-local-ai}"

cd /build

echo "=== [linux] cargo build profile=$PROFILE features=$FEATURES ==="
ARGS=(build --profile "$PROFILE")
if [[ -n "$FEATURES" ]]; then
  ARGS+=(--features "$FEATURES")
else
  ARGS+=(--no-default-features)
fi
cargo "${ARGS[@]}"

BIN="/build/target/$PROFILE/csm_server"
[[ -f "$BIN" ]] || BIN="/build/target/release/csm_server"
[[ -f "$BIN" ]] || { echo "[linux] binary not found" >&2; exit 1; }

verify_binary_amd64() {
  local bin="$1" desc=""
  if command -v file >/dev/null 2>&1; then
    desc="$(file -b "$bin")"
    if echo "$desc" | grep -qE 'x86-64|Intel 80386'; then
      echo "[linux] binary arch OK: $(echo "$desc" | awk -F, '{print $2}' | xargs)"
      return 0
    fi
    echo "[linux] ERROR: cần binary linux/amd64, nhận được: $desc" >&2
    return 1
  fi
  if readelf -h "$bin" 2>/dev/null | grep -q 'Machine:.*X86-64'; then
    echo "[linux] binary arch OK: x86-64 (readelf)"
    return 0
  fi
  echo "[linux] ERROR: không xác nhận được arch amd64 (cài 'file' hoặc dùng readelf)" >&2
  return 1
}
verify_binary_amd64 "$BIN" || {
  echo "[linux] Trên Mac ARM: docker build phải dùng --platform linux/amd64 (xem docker-build.sh)" >&2
  exit 1
}

rm -rf "$STAGING"
mkdir -p "$STAGING/bin" "$STAGING/lib" "$STAGING/logs"

cp -f "$BIN" "$STAGING/bin/csm_rust_server"
chmod +x "$STAGING/bin/csm_rust_server"

/build/docker/bundle-linux-runtime.sh "$STAGING/bin/csm_rust_server" "$STAGING/lib"

# Wrapper ensures LD_LIBRARY_PATH even if patchelf missing
cat > "$STAGING/csm_rust_server" <<'WRAP'
#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="${ROOT}/lib:${LD_LIBRARY_PATH:-}"
exec "${ROOT}/bin/csm_rust_server" "$@"
WRAP
chmod +x "$STAGING/csm_rust_server"

cp -f /build/deploy/linux/*.sh "$STAGING/" 2>/dev/null || true
cp -f /build/run-rust-server-prod.sh "$STAGING/" 2>/dev/null || true
chmod +x "$STAGING"/*.sh 2>/dev/null || true
cp -f /build/deploy/config.env.example "$STAGING/config.env.example"
cp -f /build/deploy/linux/config.la-server.env.example "$STAGING/config.la-server.env.example"

cat > "$STAGING/README-DEPLOY.txt" <<'EOF'
CSM Rust — Linux deploy (Ubuntu 22.04+ / glibc 2.35+)

Production path: /root/la_server

  mkdir -p /root/la_server
  tar xzf csm-rust-linux-amd64.tar.gz -C /root/la_server

Giữ config.env + csm_datas/ cũ nếu đã có (tar merge, không --delete).

  cp config.la-server.env.example config.env   # lần đầu
  sudo ./install-csm-rust-service.sh

  curl http://127.0.0.1:9999/monitoring/health
  systemctl stop csm-go && systemctl status csm-rust

Từ Mac: ./deploy-rust-la-server.sh root@SERVER --install
EOF

mkdir -p "$DIST"
rm -f "$DIST/${PKG_NAME}.tar.gz"
tar -C "$STAGING" -czf "$DIST/${PKG_NAME}.tar.gz" .
ls -lh "$DIST/${PKG_NAME}.tar.gz"
echo "=== [linux] done: $DIST/${PKG_NAME}.tar.gz ==="
