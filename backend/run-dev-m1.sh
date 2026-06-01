#!/usr/bin/env bash
# Mac M1 dev — source config.local-m1.env rồi chạy Spring Boot (giống GitHub 29/05).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
set -a
# shellcheck source=/dev/null
source "$ROOT/config.local-m1.env"
set +a
echo "[run-dev-m1] HEAP=${HEAP_SIZE} worker=qwen2.5-coder-1.5b-instruct-q8_0.gguf (de.kherud JNI, devtools off)"
exec mvn spring-boot:run \
  -Dspring-boot.run.jvmArguments="-Xms${HEAP_INIT} -Xmx${HEAP_SIZE} -Dspring.devtools.restart.enabled=false" \
  "$@"
