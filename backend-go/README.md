# CSM Server — Go Backend

Go rewrite of the Java Spring Boot backend (`backend/`) and Rust port (`backend-rust/`). Runtime uses **Pebble + chromem-go** for records and AI RAG vectors (pure Go, no RocksDB/CGO for normal operation).

## Stack

| Layer | Java | Go |
|-------|------|-----|
| HTTP | Spring Boot + Tomcat | chi + net/http |
| DB | RocksDB JNI | **Pebble** (pure Go) |
| Search/vector | Lucene | **chromem-go** (semantic) + **in-memory eq-index** (filter `=` / PK) |
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

## Manual artifact deploy (recommended)

This project now supports artifact-only deployment:
- Build on local machine via Docker
- Copy binary artifact to server
- Do not upload source code to Linux server
- Do not compile on Linux server

### Build artifacts (run inside `backend-go/`)

Linux ARM64 (for non-amd Linux servers):

```bash
./docker-build.sh --linux --linux-arch arm64
```

Linux AMD64:

```bash
./docker-build.sh --linux --linux-arch amd64
```

Both Linux architectures:

```bash
./docker-build.sh --linux --linux-arch both
```

Windows AMD64:

```bash
./docker-build.sh --windows
```

Output files (repo `dist/`):

- `../dist/csm-go-linux-arm64`
- `../dist/csm-go-linux-amd64`
- `../dist/csm-go-windows-amd64.exe`

If script returns exit code 1, verify Docker daemon first:

```bash
docker info
```

### Deploy to Linux (artifact-only)

From `backend-go/` directory:

```bash
./deploy-go-linux.sh root@your-server /root/la_server
```

Notes:
- `backend-go/deploy-go-linux.sh` is a wrapper to root `deploy-go-linux.sh`
- Script auto-detects remote arch (`uname -m`)
- Script selects matching artifact (`amd64` or `arm64`) from `../dist`
- Script uploads binary + optional config only
- Script refreshes `csm-go` systemd service

Explicit artifact path is also supported:

```bash
./deploy-go-linux.sh root@your-server /root/la_server /abs/path/to/csm-go-linux-arm64
```

### Run as Windows service

Use NSSM to wrap the Go executable as a Windows service.

Prepare files on Windows host:
- `C:\\la_server\\csm_go_server.exe`
- `C:\\la_server\\config.env` (optional)
- `C:\\la_server\\csm_datas\\...`

Install service (Admin CMD/PowerShell):

```powershell
nssm install csm-go C:\la_server\csm_go_server.exe
nssm set csm-go AppDirectory C:\la_server
nssm set csm-go AppStdout C:\la_server\logs\csm-go.out.log
nssm set csm-go AppStderr C:\la_server\logs\csm-go.err.log
nssm set csm-go AppEnvironmentExtra SERVER_PORT=9999 SOCKET_SERVER_PORT=15301 CSM_HOME=C:\la_server APP_DATA_DIR=C:\la_server\csm_datas
nssm set csm-go Start SERVICE_AUTO_START
nssm start csm-go
```

Service operations:

```powershell
nssm restart csm-go
nssm stop csm-go
nssm remove csm-go confirm
```

### Migrate on production server (Linux)

1. **Stop Go backend** (nginx `backend_pool` can stay on Java/Rust until migrate finishes):
   ```bash
   sudo systemctl stop csm-go   # or your unit name
   ```

2. **Install Go + rocksdb_ldb** (migrate tool only; server runtime does not need RocksDB):
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y golang-go rocksdb-tools
   # If rocksdb-tools unavailable: brew on mac dev, or build rocksdb from source for rocksdb_ldb
   ```

3. **Set data paths** (match `config.env` on server):
   ```bash
   export CSM_HOME=/path/to/backend          # folder containing csm_datas
   export APP_DATA_DIR="$CSM_HOME/csm_datas"
   export ROCKSDB_ROOT_DIR="$APP_DATA_DIR/database"   # Java/Rust source
   export CSM_NATIVE_DATA_DIR="$APP_DATA_DIR/native"  # Go Pebble output
   ```

4. **Backup before migrate**:
   ```bash
   tar czf csm_datas-backup-$(date +%Y%m%d).tgz -C "$CSM_HOME" csm_datas
   ```

5. **Run migrate** (full or one table):
   ```bash
   cd /path/to/repo/backend-go
   chmod +x run-migrate.sh

   # Full migrate (skip fidovnemail by default)
   ./run-migrate.sh

   # Only sys_autos first (faster smoke test)
   ./run-migrate.sh -only-tables csm/sys_autos

   # Dry run — count keys only
   ./run-migrate.sh -dry-run
   ```

6. **Verify** Pebble has data:
   ```bash
   ls "$CSM_NATIVE_DATA_DIR/pebble/csm/sys_autos/"
   # should see many .sst / MANIFEST files, not empty
   ```

7. **Start Go backend** — auto-reindex `sys_autos` on startup if in-memory eq-index is incomplete:
   ```bash
   ./run-go-server.sh
   # log: [startup-reindex] csm/sys_autos done: N records indexed
   ```

| Env | Default | Meaning |
|-----|---------|---------|
| `CSM_STARTUP_REINDEX` | `true` | Rebuild eq-index when Pebble rows > indexed keys |
| `CSM_STARTUP_REINDEX_TABLES` | `csm/sys_autos` | Comma list: `csm/sys_autos,csm/csm_accounts` |

**Query speed (after migrate):** Go uses eq-index for list filters when index is marked complete. Default `CSM_EQ_INDEX_MODE=pebble` on 8GB profile (SSD index, ~32MB shared Pebble cache — leaves RAM for AI model). Set `CSM_EQ_INDEX_MODE=memory` on larger servers. Filter `like` falls back to Pebble scan.

Server listens on `SERVER_PORT` (default **9999**, same as Rust/nginx `backend_pool`).

## Environment

Loads `../config.env` and profile overlays (`config.local-8gb.env`, etc.) — same as `run-rust-server.sh`.

| Variable | Default |
|----------|---------|
| `APP_DATA_DIR` | `./csm_datas` |
| `CSM_PEBBLE_PATH` | `./csm_datas/native/pebble/csm.kv` |
| `CSM_VECTOR_DIR` | `./csm_datas/native/vector/chromem` |
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
| `csm_datas/native/pebble/{app}/{table}/` | Per-table KV records (replaces RocksDB) |
| `csm_datas/native/vector/chromem/` | Embedded chromem-go vector index (tenant RAG, records, workspace) |

Eq-index for `=` filters is built in memory on startup / `POST /update-table-data-index` (not persisted to disk).

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
