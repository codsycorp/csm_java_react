# CSM Server — Rust Backend

Rust rewrite of the Java Spring Boot backend (`backend/`). Drop-in replacement using the same RocksDB data in `csm_datas/`.

## Stack

| Layer | Java | Rust |
|-------|------|------|
| HTTP | Spring Boot + Tomcat | Axum + Tokio |
| DB | RocksDB JNI | `rocksdb` crate |
| Search | Apache Lucene | Tantivy |
| Auth | jjwt + Spring Security | `jsonwebtoken` + Tower middleware |
| Cache | Redis + Caffeine | `redis` crate |
| Real-time | Netty Socket.IO | `socketioxide` |
| AI | llama.cpp JNI | llama.cpp sidecar (`llama-cli`) |

## Quick start

```bash
# Install Rust: https://rustup.rs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# From repo root
cd backend-rust
cp ../config.env.example ../config.env   # if needed
./run-rust-server.sh
```

Server listens on **15300** (HTTP) and **15301** (Socket.IO) — same ports as Java.

## Environment

Loads `../config.env` and profile overlays (`config.local-8gb.env`, etc.).

| Variable | Default |
|----------|---------|
| `APP_DATA_DIR` | `./csm_datas` |
| `SERVER_PORT` | `15300` |
| `SOCKET_SERVER_PORT` | `15301` |
| `JWT_SECRET` | from `config.env` |
| `REDIS_HOST` | `localhost` |

## Module map (Java → Rust)

```
backend/src/main/java/net/phanmemmottrieu/
├── controller/     → src/api/router.rs, src/controllers/, src/web/
├── handler/        → src/handlers/
├── service/        → src/services/
├── data/           → src/data/
├── security/       → src/security/
├── socket/         → src/socket/
├── model/          → src/model/
└── util/           → src/util/
```

## API compatibility

All 64 switch-case paths from `ApiSpringController` are routed in `src/api/router.rs`:

- Auth: `/login`, `/logout`, `/refresh-token`, `/user-info`, `/register`
- Tables: `/get-table-data`, `/update-table-data`, `/create-table`, `/backupdb`, …
- CRM: `/crm/*`
- Chat: `/chat-history*`
- AI: `/ai-local/*`, `/ai-code-stream/*` (orchestration layer)

## Migration status

| Module | Status |
|--------|--------|
| RocksDB RecordManager | Core CRUD, filter, encrypt |
| JWT + auth middleware | Done |
| Auth handler (login/logout/refresh) | Done |
| Table handler | Core ops |
| CRM / Menu / Role / Home | Core ops |
| Socket.IO chat | Basic |
| Web SSR (WebSpringController) | Static + stub SSR |
| AI services (41k LOC Java) | Sidecar + HTTP gateway |
| InitHandler seed data | Stub — port from Java |

## Build

```bash
# Native (macOS/Linux) — có local AI llama.cpp
cargo build --release
cargo run --release

# Windows cross-compile từ macOS/Linux — không link llama.cpp
rustup target add x86_64-pc-windows-gnu   # một lần
brew install mingw-w64                    # macOS: linker x86_64-w64-mingw32-gcc
cargo build --target x86_64-pc-windows-gnu --release --no-default-features

# Windows native hoặc Linux server có AI
cargo build --release --features local-ai
```

Feature `local-ai` (bật mặc định trên build native): llama.cpp in-process. Tắt bằng `--no-default-features` khi cross-compile sang Windows.

Binary Windows: `target/x86_64-pc-windows-gnu/release/csm_server.exe`

### Windows Service (NSSM) — exe cùng cấp csm_datas

Sau `./build-windows-release.sh`, copy folder lên Windows:

```
csm_server.exe
config.env
csm_datas/
nssm.exe
install-csm-rust-service.bat   ← Admin CMD
```

Chi tiết: [`deploy/windows/README.md`](deploy/windows/README.md)

## Data compatibility

Uses existing `csm_datas/database/` RocksDB files. Lucene indexes in `csm_datas/lucene_index/` are rebuilt via Tantivy on `/update-table-data-index`.
