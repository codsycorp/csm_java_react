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
   export CSM_HOME=/Volumes/Datas/CSM/JavaProjects/csm_server          # folder containing csm_datas
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
   cd /Volumes/Datas/CSM/JavaProjects/csm_server/backend-go
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

## Build + Deploy Linux server (`/root/la_server`)

Muc tieu: build binary Linux va chay dung file `/root/la_server/csm_go_server`.

### 1) Build artifact Linux native

Tu repo root:

```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server
chmod +x scripts/build-go-linux-native.sh deploy-go-linux.sh

# Cach khuyen nghi: build tren server Linux roi copy ve local
./scripts/build-go-linux-native.sh --remote root@csmbridge.net dist/csm_go_server

# Kiem tra artifact
ls -lh dist/csm_go_server
file dist/csm_go_server
```

Neu ban dang SSH truc tiep tren server Linux, co the build tai cho:

```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server
./scripts/build-go-linux-native.sh --on-host /root/la_server/csm_go_server
```

### 2) Deploy artifact vao dung duong dan `/root/la_server`

```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server
./deploy-go-linux.sh root@csmbridge.net /root/la_server /Volumes/Datas/CSM/JavaProjects/csm_server/dist/csm_go_server

chmod +x scripts/build-go-linux-native.sh deploy-go-linux.sh && ./scripts/build-go-linux-native.sh --remote root@csmbridge.net dist/csm_go_server

```

Script se:
- tao runtime folders trong `/root/la_server`
- upload binary thanh `/root/la_server/csm_go_server`
- upload `config.env` va `config.local-8gb.env` neu co
- cai/refresh `systemd` service `csm-go`
- restart service va health-check nhanh

### 3) Neu gap loi upload `scp: dest open ... Failure` hoac `Text file busy`

Nguyen nhan thuong la service dang chay va khoa binary. Chay fallback an toan:

```bash
# 1) Dung service
ssh root@csmbridge.net "systemctl stop csm-go"

# 2) Upload bang scp legacy mode (-O)
cd /Volumes/Datas/CSM/JavaProjects/csm_server
scp -O dist/csm_go_server root@csmbridge.net:/root/la_server/csm_go_server
scp -O config.env root@csmbridge.net:/root/la_server/config.env
scp -O config.local-8gb.env root@csmbridge.net:/root/la_server/config.local-8gb.env

# 3) Chay lai service
ssh root@csmbridge.net "chmod +x /root/la_server/csm_go_server && systemctl start csm-go"
```

### 4) Verify sau deploy

```bash
# Service status
ssh root@csmbridge.net "systemctl --no-pager --full status csm-go | head -25"

# Kiem tra binary local/remote trung checksum
shasum -a 256 dist/csm_go_server
ssh root@csmbridge.net "sha256sum /root/la_server/csm_go_server"

# AI local health
ssh root@csmbridge.net "curl -sf http://127.0.0.1:9999/ai-local/health | head -c 1400"
```

Can dam bao trong health response co:
- `reasoning.nativeReady: true`
- `status.available: true`
- `modelPath: /root/la_server/csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf`

### 5) Kiem tra model tren server

```bash
ssh root@csmbridge.net "ls -lh /root/la_server/csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf"
```

Neu thieu model, download vao dung thu muc tren truoc khi restart service.

### 6) Build + deploy bang Docker, bat day du AI local (khuyen nghi)

Copy nguyen khoi lenh ben duoi va chay (khong can sua file script):

```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server
chmod +x backend-go/docker-build.sh deploy-go-linux.sh

# 1) Build Linux amd64 native llamacpp (Docker)
./backend-go/docker-build.sh --linux --linux-arch amd64 --llamacpp

# 2) Deploy artifact len server
./deploy-go-linux.sh root@csmbridge.net /root/la_server /Volumes/Datas/CSM/JavaProjects/csm_server/dist/csm-go-linux-amd64

# 3) Verify service + health
ssh root@csmbridge.net "systemctl --no-pager --full status csm-go | head -25"
ssh root@csmbridge.net "curl -sf http://127.0.0.1:9999/api/monitoring/health | head -c 500"
ssh root@csmbridge.net "curl -sf http://127.0.0.1:9999/ai-local/health | head -c 1400"
```

Neu ban thay loi `zsh: command not found: deploy-go-linux.sh`:

```bash
# Dang dung sai thu muc hoac thieu ./
cd /Volumes/Datas/CSM/JavaProjects/csm_server
./deploy-go-linux.sh root@csmbridge.net /root/la_server /Volumes/Datas/CSM/JavaProjects/csm_server/dist/csm-go-linux-amd64
```

Neu can chi upload lai binary thu cong (fallback nhanh):

```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server
scp -O dist/csm-go-linux-amd64 root@csmbridge.net:/root/la_server/csm_go_server.candidate
ssh root@csmbridge.net "systemctl stop csm-go || true && mv -f /root/la_server/csm_go_server.candidate /root/la_server/csm_go_server && chmod +x /root/la_server/csm_go_server && systemctl start csm-go"
```

Sau deploy, service `csm-go` tu nap env theo thu tu:
- `config.env`
- `config.local-8gb.env`
- `config.ai-local-max-8gb.env`
- `config.ai-local-max.env`

Va mac dinh bat full local AI:
- `AI_LOCAL_ONLY_ENABLED=true`
- `AI_LOCAL_LLAMA_NATIVE_ENABLED=true`
- `AI_LOCAL_RUNTIME_AUTO_TUNE=true`
- `AI_LOCAL_PROMPT_BUDGET_DISABLED=true`

## Notes

- **CGO required** for RocksDB compatibility with existing Java database files.
- Drop-in replacement goal: point nginx `backend_pool` to Go port instead of Rust/Java when ready.
- For production parity testing, compare responses with Java/Rust on `/login`, `/user-info`, `/get-table-data`.
