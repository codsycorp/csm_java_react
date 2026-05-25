#!/bin/bash
# Máy dev mạnh — chạy jar (giống production nhưng profile local-strong)
# Usage: ./run-dev-jar.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export CSM_LOCAL_PROFILE=strong
exec "$ROOT/start.sh" strong "$@"
