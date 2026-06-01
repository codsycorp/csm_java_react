#!/bin/bash
# Server production — single worker 1.5B Q8_0, JVM bounded cho Linux ~5GB
# Usage: ./run-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export CSM_LOCAL_PROFILE=5gb
exec "$ROOT/start.sh" 5gb "$@"
