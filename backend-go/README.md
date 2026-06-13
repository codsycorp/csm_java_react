# CSM Server — Go Backend

Go rewrite of the Java Spring Boot backend (`backend/`) and Rust port (`backend-rust/`). Runtime uses **Pebble + sqlite-vec** (pure Go, no RocksDB/CGO).

## Stack

| Layer | Java | Go |
|-------|------|-----|
| HTTP | Spring Boot + Tomcat | chi + net/http |
| DB | RocksDB JNI | **Pebble** (pure Go) |
| Search/vector | Lucene | **sqlite-vec** + FTS5 |
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
| `CSM_SEARCH_DB_PATH` | `./csm_datas/native/search/vectors.db` |
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

## Migration: RocksDB → Pebble + sqlite-vec (pure Go runtime)

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
| `csm_datas/native/search/vectors.db` | FTS5 + sqlite-vec for AI/search |

After migration, run backend with Pebble+sqlite (no RocksDB service). Hash embeddings are placeholders — re-embed with your model for production AI quality.

### Scale (Pebble + sqlite-vec)

| Workload | Fit |
|----------|-----|
| CSM admin CRM tables (GB) | Pebble ✅ |
| AI code context (100k–1M chunks) | sqlite-vec ✅ |
| 10M+ vectors | Shard `search/*.db` |
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
