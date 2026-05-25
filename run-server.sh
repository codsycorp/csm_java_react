#!/bin/bash
# Server production yếu (~5GB RAM / 2 CPU)
# Usage: ./run-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export CSM_LOCAL_PROFILE=5gb
exec "$ROOT/start.sh" 5gb "$@"
