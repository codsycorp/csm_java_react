# CSM Server — Rust Backend

Rust rewrite aligned with **`backend-go`**. Drop-in replacement using the same `csm_datas/` layout, port **9999** (HTTP) and **15301** (Socket.IO).

**Data stack:** Pebble KV + Qdrant Edge (embedded, on-disk) + Tantivy. Rust **không** đọc RocksDB — data phải nằm trong Pebble (dùng `backend-go/run-migrate.sh` nếu còn `database/` Java).

See **[GO_PARITY.md](GO_PARITY.md)** for module mapping and known gaps.

## Stack

| Layer | Go | Rust |
|-------|-----|------|
| HTTP | net/http + chi | Axum + Tokio |
| KV | Pebble per-table | `pebbledb` — **cùng path** `{app}/{table}/` |
| Vector | chromem | **Qdrant Edge** embedded (`CSM_VECTOR_DIR`) |
| Search | FTS + eq-index | Tantivy + memory eq-index |
| Auth | JWT | `jsonwebtoken` + Tower |
| Real-time | Socket.IO | `socketioxide` |
| AI | llama + providers | feature `local-ai` + HTTP gateway |

## Yêu cầu

| Môi trường | Cần |
|------------|-----|
| Dev Mac/Linux | [Rustup](https://rustup.rs), `config.env` ở repo root |
| Build gói deploy | Docker Desktop (build Linux/Windows từ Mac) |
| Linux server | Ubuntu 22.04+ (glibc 2.35+), systemd |
| Windows server | x64, [NSSM](https://nssm.cc/download), MinGW DLL (đã bundle trong zip) |

---

## Chạy dev (Mac / Linux local)

```bash
# 1. Cài Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Config (cùng Go)
cd /path/to/csm_server
cp config.env.example config.env   # nếu chưa có — sửa JWT_SECRET

# 3. Start (tự load config.env + config.local-m1.env / config.local-8gb.env)
cd backend-rust
./run-rust-server.sh
```

Profile tự chọn: **macOS → `m1`**, Linux → `8gb`. Ghi đè: `CSM_LOCAL_PROFILE=8gb ./run-rust-server.sh`.

Build thủ công (không qua script):

```bash
cd backend-rust
cargo build --release                    # có local-ai (mặc định)
cargo build --release --no-default-features   # không llama (nhẹ hơn)
./target/release/csm_server
```

---

## Biến môi trường

`run-rust-server.sh` và `load_config_env()` load `../config.env` + profile overlay.

| Variable | Default | Ghi chú |
|----------|---------|---------|
| `CSM_HOME` | `{repo}/backend` | Thư mục chứa `csm_datas` |
| `APP_DATA_DIR` | `$CSM_HOME/csm_datas` | Data gốc |
| `CSM_NATIVE_DATA_DIR` | `$APP_DATA_DIR/native` | |
| `CSM_PEBBLE_ROOT` | `$CSM_NATIVE_DATA_DIR/pebble` | **KV chính** — dùng chung với Go |
| `CSM_VECTOR_DIR` | `$CSM_NATIVE_DATA_DIR/vector/qdrant` | Qdrant embedded |
| `CSM_KV_BACKUP_DIR` | `$APP_DATA_DIR/backups` | Backup Pebble (API backupdb) |
| `LUCENE_INDEX_ROOT_DIR` | `$APP_DATA_DIR/lucene_index` | Tantivy |
| `CSM_EQ_INDEX_MODE` | `memory` (m1) / `pebble` (8gb env) | Eq-index: RAM hoặc SSD `csm_datas/native/eq_index/` |
| `CSM_STARTUP_REINDEX` | `true` | Warm eq-index lúc startup |
| `CSM_STARTUP_REINDEX_TABLES` | `csm/csm_accounts,...` | Bảng warm |
| `CSM_VECTOR_RECORDS_ENABLED` | `true` (m1) / `false` (8gb) | Index vector từng record |
| `SERVER_PORT` | `9999` | HTTP |
| `SOCKET_SERVER_PORT` | `15301` | Socket.IO |
| `JWT_SECRET` | từ `config.env` | **Phải khớp** data/server cũ |

Mẫu deploy: [deploy/config.env.example](deploy/config.env.example).

Layout data:

```
backend/csm_datas/
  native/pebble/{app_id}/{table_name}/   ← KV (shared với Go)
  native/vector/qdrant/                  ← Qdrant Edge
  lucene_index/                          ← Tantivy
  backups/                               ← backup Pebble
  public/                                ← static / SSR
  ai_local/model/                        ← GGUF (nếu bật local-ai)
```

---

## Build

### A. Native (chạy trên cùng máy)

```bash
cd backend-rust
cargo build --release
# Binary: target/release/csm_server
```

Profile server RAM thấp (≤8GB):

```bash
cargo build --profile release-server --features local-ai
```

### B. Docker — gói deploy Linux + Windows (khuyến nghị từ Mac)

Cần **Docker Desktop** đang chạy.

```bash
cd backend-rust
./docker-build.sh              # Linux + Windows
./docker-build.sh --linux      # chỉ Linux (có local-ai)
./docker-build.sh --windows    # chỉ Windows (không local-ai)
./docker-build.sh --no-cache   # build sạch
```

Output: `../dist/`

| File | Nội dung |
|------|----------|
| `csm-rust-linux-amd64.tar.gz` | `csm_rust_server` + `lib/` bundled + script systemd |
| `csm-rust-windows-amd64.zip` | `csm_server.exe` + `lib*.dll` + script NSSM |

Linux build chạy trong Ubuntu 22.04 container **linux/amd64** (kể cả Mac Apple Silicon — QEMU); Windows cross-compile MinGW trong container (Pebble + Qdrant, không RocksDB).

### C. Linux binary qua Docker/SSH (không đóng gói zip)

```bash
./build-linux-release.sh                    # Docker → dist/csm_rust_server
./build-linux-release.sh --remote root@host # build trên server, tải binary về
./build-linux-release.sh --no-local-ai
```

### D. Windows binary (Mac, không Docker)

```bash
brew install mingw-w64
./build-windows-release.sh
# → ../csm_server.exe + lib*.dll
```

Chi tiết Windows service: [deploy/windows/README.md](deploy/windows/README.md).

---

## Deploy Linux (production) — `/root/la_server`

Cùng layout với Go (`deploy-go-linux.sh`): binary + `csm_datas/` + `config.env` trong một thư mục.

### Cách 1 — Từ Mac (một lệnh)

```bash
cd backend-rust
./docker-build.sh --linux
./deploy-rust-la-server.sh root@your-server --install
```

### Cách 2 — Thủ công trên server

```bash
# 1. Build gói (Mac)
cd backend-rust && ./docker-build.sh --linux

# 2. Copy + giải nén thẳng vào /root/la_server (merge, không xóa data cũ)
scp ../dist/csm-rust-linux-amd64.tar.gz root@server:/tmp/
ssh root@server
mkdir -p /root/la_server
tar xzf /tmp/csm-rust-linux-amd64.tar.gz -C /root/la_server
cd /root/la_server

# 3. Config (lần đầu; nếu đã chạy Go thì giữ config.env hiện có)
cp -n config.la-server.env.example config.env   # chỉnh JWT_SECRET giống Go

# 4. csm_datas/ — thường đã có từ Go; Rust dùng chung Pebble:
#    csm_datas/native/pebble/
#    CSM_VECTOR_DIR → csm_datas/native/vector/qdrant (mới, rebuild bằng csm_migrate_go)

# 5. Cài systemd
sudo ./install-csm-rust-service.sh

# 6. Cutover
systemctl stop csm-go
systemctl start csm-rust
curl -s http://127.0.0.1:9999/monitoring/health
journalctl -u csm-rust -f
```

Layout sau deploy:

```
/root/la_server/
├── csm_rust_server          # wrapper (LD_LIBRARY_PATH + bin/)
├── bin/csm_rust_server
├── lib/
├── config.env
├── config.local-8gb.env     # optional
├── csm_datas/               # Pebble + public + ai_local + ...
├── logs/
└── install-csm-rust-service.sh
```

Chạy thử không cài service: `./start-csm-rust.sh` hoặc `./run-rust-server-prod.sh`

Gỡ service: `sudo ./uninstall-csm-rust-service.sh`

---

## Deploy Windows

1. Giải nén `csm-rust-windows-amd64.zip` → ví dụ `D:\csm_server\`
2. Tải [nssm.exe](https://nssm.cc/download) vào cùng thư mục
3. Copy `config.env` + `csm_datas\`
4. CMD **Administrator**:

```bat
cd D:\csm_server
check-windows-runtime.bat
install-csm-rust-service.bat
status-csm-rust-service.bat
```

Service: `CSM_Rust_Service`. Log: `logs\stderr.log`.

---

## Migrate data Go → Rust

KV Pebble **dùng chung** — không copy engine. Cần rebuild index phụ (Qdrant, Tantivy, eq-index):

```bash
# Từ repo root — backup + (tuỳ chọn) Go migrate RocksDB→Pebble + reindex
./backend-rust/scripts/migrate-go-to-rust.sh

# Chỉ reindex
cd backend-rust
cargo run --release --bin csm_migrate_go
cargo run --release --bin csm_migrate_go -- --only csm/sys_autos,csm/csm_accounts
cargo run --release --bin csm_migrate_go -- --dry-run
```

Nếu data còn trên RocksDB Java (`csm_datas/database/`):

```bash
cd backend-go
brew install rocksdb    # rocksdb_ldb CLI
./run-migrate.sh        # → native/pebble/
```

Sau đó chạy Rust và `csm_migrate_go`. **Dừng Go** trước khi Rust ghi cùng `csm_datas`.

Cutover checklist:

```
□ Backup csm_datas
□ Go migrate RocksDB → Pebble (nếu cần)
□ systemctl stop csm-go
□ ./scripts/migrate-go-to-rust.sh (hoặc csm_migrate_go)
□ ./run-rust-server.sh hoặc install-csm-rust-service.sh
□ csm_diag_login + login admin + /get-table-data
```

---

## CLI tiện ích

| Lệnh | Mô tả |
|------|--------|
| `cargo run --release --bin csm_diag_login` | Liệt kê / probe account trong Pebble |
| `cargo run --release --bin csm_find_login [user] [pass]` | Scan + test login |
| `cargo run --release --bin csm_migrate_go` | Reindex Tantivy + Qdrant + eq-index từ Pebble |

Ví dụ:

```bash
cd backend-rust
cargo run --release --bin csm_diag_login
cargo run --release --bin csm_find_login admin
```

---

## Kiểm tra sau khi chạy

```bash
curl -s http://127.0.0.1:9999/monitoring/health | jq .
# kv_engine: pebble, vector_engine: qdrant-edge

curl -s http://127.0.0.1:9999/api/monitoring/health   # qua proxy api.*
```

Re-index một bảng qua API (đã login admin):

```bash
curl -X POST 'http://localhost:9999/update-table-data-index' \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"csm","obj_name":"sys_autos"}'
```

---

## Cấu trúc mã

```
backend-rust/
├── run-rust-server.sh       # Dev launcher (env + cargo run)
├── run-rust-server-prod.sh  # Prod launcher (/root/la_server layout)
├── deploy-rust-la-server.sh # scp + extract → /root/la_server
├── docker-build.sh          # Gói deploy Linux/Windows
├── build-linux-release.sh   # Binary Linux (Docker/remote)
├── build-windows-release.sh # Binary Windows (MinGW)
├── scripts/
│   └── migrate-go-to-rust.sh
├── deploy/
│   ├── config.env.example
│   ├── linux/               # systemd install scripts
│   └── windows/             # NSSM bat scripts
├── docker/                  # Dockerfile + package scripts
└── src/
    ├── data/                # Pebble, Qdrant, Tantivy, eq-index
    ├── handlers/
    ├── services/
    └── bin/                 # csm_diag_login, csm_migrate_go, ...
```

Mapping Go: [GO_PARITY.md](GO_PARITY.md) · Java: [JAVA_PARITY.md](JAVA_PARITY.md)

---

## Ghi chú

- **Pebble + Qdrant only** — không link RocksDB; `CSM_KV_ENGINE=rocksdb` bị bỏ qua.
- **chromem (Go)** không convert sang Qdrant — chạy `csm_migrate_go` sau cutover.
- Windows build **không có** `local-ai` (llama); dùng API AI remote hoặc chạy Linux cho AI local.
- Linux Docker package target **Ubuntu 22.04+** (glibc 2.35).
