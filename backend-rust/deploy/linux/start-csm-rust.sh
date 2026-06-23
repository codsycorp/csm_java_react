#!/usr/bin/env bash
# Foreground run (no systemd) — for smoke test after copy deploy package.
set -euo pipefail
CSM_HOME="$(cd "$(dirname "$0")" && pwd)"
export CSM_HOME
export LD_LIBRARY_PATH="${CSM_HOME}/lib:${LD_LIBRARY_PATH:-}"
if [[ -f "$CSM_HOME/config.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$CSM_HOME/config.env"
  set +a
fi
exec "$CSM_HOME/csm_rust_server"
