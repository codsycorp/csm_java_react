#!/bin/bash
# Dev máy mạnh — cùng lệnh bạn hay dùng từ backend/
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck source=/dev/null
source ../config.local-strong.env
set +a
exec mvn spring-boot:run "$@"
