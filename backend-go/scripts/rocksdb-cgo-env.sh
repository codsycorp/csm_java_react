#!/bin/bash
# Source before building cmd/migrate (grocksdb / CGO).
set -euo pipefail

export CGO_ENABLED=1

rocksdb_prefix() {
  if command -v brew >/dev/null 2>&1; then
    brew --prefix rocksdb 2>/dev/null || true
  fi
}

PREFIX="${ROCKSDB_PREFIX:-$(rocksdb_prefix)}"
if [ -z "$PREFIX" ] || [ ! -d "$PREFIX/include/rocksdb" ]; then
  echo "[rocksdb-cgo] RocksDB not found. Install: brew install rocksdb" >&2
  return 1 2>/dev/null || exit 1
fi

export CGO_CFLAGS="${CGO_CFLAGS:-} -I${PREFIX}/include"
export CGO_LDFLAGS="${CGO_LDFLAGS:-} -L${PREFIX}/lib -lrocksdb -lstdc++ -lm -lz -lbz2 -lsnappy -lzstd -llz4"

echo "[rocksdb-cgo] PREFIX=$PREFIX"
echo "[rocksdb-cgo] CGO_CFLAGS=$CGO_CFLAGS"
echo "[rocksdb-cgo] CGO_LDFLAGS=$CGO_LDFLAGS"
