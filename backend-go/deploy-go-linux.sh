#!/usr/bin/env bash
# Convenience wrapper: allow running deploy from backend-go directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec "$REPO_ROOT/deploy-go-linux.sh" "$@"
