#!/bin/bash
# Server production — Qwen2.5-Coder-7B Q4_K_M, Linux ~8GB RAM / 4 CPU
# Usage: ./run-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export CSM_LOCAL_PROFILE=8gb
exec "$ROOT/start.sh" 8gb "$@"
