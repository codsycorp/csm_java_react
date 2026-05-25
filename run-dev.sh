#!/bin/bash
# Alias ngắn — tương đương: cd backend && set -a && source ../config.local-strong.env && set +a && mvn spring-boot:run
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/backend/run-dev.sh" "$@"
