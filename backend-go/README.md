# CSM Server — Go Backend

Go rewrite of the Java Spring Boot backend (`backend/`) and Rust port (`backend-rust/`). Runtime uses **Pebble + chromem-go** for records and AI RAG vectors (pure Go, no RocksDB/CGO for normal operation).

## Stack

| Layer | Java | Go |
|-------|------|-----|
| HTTP | Spring Boot + Tomcat | chi + net/http |
| DB | RocksDB JNI | **Pebble** (pure Go) |
| Search/vector | Lucene | **chromem-go** (semantic) + optional legacy **sqlite-vec** FTS5 |
| Auth | jjwt + Spring Security | golang-jwt + middleware |
| Real-time | Netty Socket.IO | deferred |
| AI | llama.cpp JNI | deferred |

## Quick start

```bash
brew install go   # RocksDB NOT required for server

cd backend-go
chmod +x run-go-server.sh run-migrate.sh
cp ../config.env.example ../config.env   # if needed
./run-go-server.sh
```

Legacy RocksDB import (one-time only): `brew install rocksdb && ./run-migrate.sh`

Server listens on `SERVER_PORT` (default **9999**, same as Rust/nginx `backend_pool`).

## Environment

Loads `../config.env` and profile overlays (`config.local-8gb.env`, etc.) — same as `run-rust-server.sh`.

| Variable | Default |
|----------|---------|
| `APP_DATA_DIR` | `./csm_datas` |
| `CSM_PEBBLE_PATH` | `./csm_datas/native/pebble/csm.kv` |
| `CSM_VECTOR_DIR` | `./csm_datas/native/vector/chromem` |
| `CSM_SEARCH_DB_PATH` | `./csm_datas/native/search/vectors.db` (legacy optional FTS) |
| `SERVER_PORT` | `9999` |
| `JWT_SECRET` | from `config.env` |

## Module map (Java → Go)

```
backend/src/main/java/net/phanmemmottrieu/
├── controller/     → internal/api/router.go, internal/web/
├── handler/        → internal/handlers/
├── service/        → internal/services/
├── data/           → internal/data/
├── security/       → internal/security/
└── model/          → internal/model/
```

## Migration status

| Module | Status |
|--------|--------|
| RocksDB RecordManager | Core find/filter/upsert, csm_encrypt |
| JWT + auth middleware | Done |
| Auth (login/logout/refresh/user-info) | Done |
| get-async-routes | Core |
| Table handler | get-table-data, update-table-data |
| Menu / Role / Home | Read stubs |
| CRM | Read stubs |
| Web SSR / static | Basic SPA fallback |
| Socket.IO chat | Stub (501) |
| AI stack | Stub (501) |

See [JAVA_PARITY.md](./JAVA_PARITY.md) for endpoint matrix.

## Migration: RocksDB → Pebble + chromem (pure Go runtime)

One-time migration (needs **librocksdb** only for reading legacy data):

```bash
brew install rocksdb   # one-time, for migrate only
export CGO_ENABLED=1
cd backend-go
go run ./cmd/migrate \
  -source ../csm_datas/database \
  -dest ../csm_datas/native
```

Output:

| Path | Role |
|------|------|
| `csm_datas/native/pebble/csm.kv` | All KV records (replaces RocksDB) |
| `csm_datas/native/vector/chromem/` | Embedded chromem-go vector index (tenant RAG, records, workspace) |
| `csm_datas/native/search/vectors.db` | Legacy optional FTS5 keyword search (admin `like` filters only) |

After migration, run backend with Pebble + chromem (no RocksDB service). Hash embeddings are placeholders — re-embed with your model for production AI quality.

**Re-index after switching to chromem:** existing `vectors.db` data is not auto-migrated. Trigger re-index via `IndexExistingRecords` or re-ingest tenant knowledge on first AI request.

### Scale (Pebble + chromem)

| Workload | Fit |
|----------|-----|
| CSM admin CRM tables (GB) | Pebble ✅ |
| AI code context (100k–1M chunks) | chromem-go ✅ |
| 10M+ vectors | Shard `vector/chromem-*` dirs or external vector DB |
| Hadoop/PB-scale analytics | ❌ use warehouse |

See `cmd/migrate/main.go` for `VectorSearch`, `HybridSearch`, `ScanTable` helpers.

## Build

```bash
cd backend-go
export CGO_ENABLED=1
go build -o csm-go-server ./cmd/server
```

## Notes

- **CGO required** for RocksDB compatibility with existing Java database files.
- Drop-in replacement goal: point nginx `backend_pool` to Go port instead of Rust/Java when ready.
- For production parity testing, compare responses with Java/Rust on `/login`, `/user-info`, `/get-table-data`.
