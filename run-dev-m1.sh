#!/bin/bash
# Alias — cd backend && ./run-dev-m1.sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/backend/run-dev-m1.sh" "$@"
