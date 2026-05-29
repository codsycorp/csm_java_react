#!/bin/bash
# Server production — dual-lane 3B (swap), JVM bounded cho RAM ~6GB+
# Usage: ./run-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export CSM_LOCAL_PROFILE=5gb
exec "$ROOT/start.sh" 5gb "$@"
