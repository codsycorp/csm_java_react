# Go → Rust parity (`backend-go` → `backend-rust`)

Rust backend is aligned with the production **Go** runtime (`backend-go`), not the legacy Java Spring stack.

## Runtime alignment

| Concern | `backend-go` | `backend-rust` |
|---------|--------------|----------------|
| HTTP port | `9999` (`SERVER_PORT`) | same |
| Socket.IO | `15301` | same |
| Default KV | Pebble per-table `{CSM_PEBBLE_ROOT}/{app}/{table}/` | same via `pebbledb` crate + **RocksDB read fallback** |
| KV | Pebble per-table | `pebbledb` — **Pebble only** (no RocksDB) |
| Vector | chromem (Go) | **Qdrant Edge** embedded on-disk |
| Eq-index (default m1/strong) | in-memory | `src/data/eq_index.rs` |
| Eq-index (8gb profile) | Pebble under `CSM_EQ_INDEX_ROOT` | `src/data/pebble_eq_index.rs` |
| Vector store | chromem under `CSM_VECTOR_DIR` | **Qdrant Edge** embedded (`qdrant-edge`) on disk under `CSM_VECTOR_DIR` |
| Env loading | `run-go-server.sh` + profile overlays | `run-rust-server.sh` (mirrored) |

## Module map

```
backend-go/internal/
├── config/          → src/config/mod.rs
├── data/
│   ├── record_manager.go   → src/data/record_manager.rs
│   ├── pebble_keys.go      → src/data/pebble_keys.rs
│   ├── memory_eq_index.go  → src/data/eq_index.rs
│   ├── pebble_eq_index.go  → src/data/pebble_eq_index.rs
│   ├── table_store (pebble) → src/data/table_store.rs
│   └── search_*.go         → partial in record_manager + search_index.rs
├── handler/         → src/handlers/
├── service/         → src/services/
├── security/        → src/security/
├── socket/          → src/socket/
├── model/           → src/model/
├── api/paths.go     → src/api/paths.rs
└── cmd/
    ├── csm-diag-login → src/bin/csm_diag_login.rs
    └── csm_migrate_go   → src/bin/csm_migrate_go.rs (reindex Tantivy + Qdrant from Pebble)
```

## Data layer — implemented

- Per-table **Pebble-only** KV (`DbHandle` + `TableBatch`) — no RocksDB in Rust
- Pebble key canonicalization (`pebble_key`, `storage_key_candidates`)
- CRUD, filter, find, pagination (core paths)
- Memory eq-index: upsert/delete on write, warm on startup (`CSM_STARTUP_REINDEX_TABLES`)
- Eq-index fast path: `find`, `filter`, unfiltered list pagination
- `csm_encrypt` / `csm_decrypt` (Java-compatible)
- Monitoring health exposes `kv_engine` + `kv_root`

## Data layer — gaps

| Feature | Go | Rust |
|---------|----|------|
| Pebble eq-index mode (`CSM_EQ_INDEX_MODE=pebble`) | yes | yes (`pebble_eq_index.rs`) |
| chromem vector records | yes | **Qdrant Edge** (`vector_store.rs`, `tenant_rag.rs`) |
| FTS / Tantivy eq shortcuts | partial | Tantivy index only |
| `filterWithSortPagination` | yes | partial |
| Key migration RocksDB→Pebble (rewrite) | `cmd/migrate` (Go only) | use `backend-go/run-migrate.sh` before Rust |
| Auth-field / token-field find shortcuts | yes | partial (eq-index covers many) |

## AI layer

| Concern | `backend-go` | `backend-rust` |
|---------|--------------|----------------|
| Model path resolution | `run-go-server.sh` `resolve_model_path` | `config/ai_paths.rs` + `run-rust-server.sh` |
| Runtime auto-tune | `ApplyAIRuntimeAutoTune` | `config/ai_runtime_tune.rs` |
| Effective batch size | `EffectiveLlamaBatchSize` | `AppConfig::effective_llama_batch_size()` |
| Darwin defaults | GPU=0, auto-tune on | same in shell + `load_config_env` |
| Max AI overlay | `config.ai-local-max*.env` | same when `AI_LOCAL_PROMPT_BUDGET_DISABLED` |
| Optional auth (`/scrape-web`) | `isOptionalAuthAPIPath` | `is_optional_auth_api_path` (fixed) |

Full 1:1 AI service parity is **not** claimed; path resolution + runtime tuning match Go.

## Path resolution (Go parity)

Rust `load_config_env()` + `AppConfig::from_env()` mirror Go `run-go-server.sh` + `config.LoadFromEnv()`:

| Variable | Resolution |
|----------|------------|
| `CSM_HOME` | `run-*.sh` → `$ROOT/backend`; auto-infer from repo when running `cargo` |
| `APP_DATA_DIR` | env, else `$CSM_HOME/csm_datas`, else first existing `*/csm_datas/database` |
| `CSM_PEBBLE_ROOT` | `$CSM_NATIVE_DATA_DIR/pebble` |
| `CSM_VECTOR_DIR` | `$CSM_NATIVE_DATA_DIR/vector/qdrant` |
| `CSM_KV_BACKUP_DIR` | `$APP_DATA_DIR/backups` |
| `AI_LOCAL_LLAMA_MODEL_PATH` | `./csm_datas/...` → `$CSM_HOME/csm_datas/...`; else `$APP_DATA_DIR/...` |
| `AI_CONTEXT_DIR` | same resolver as model paths |
| Default model | `$APP_DATA_DIR/ai_local/model/model.gguf` |

Local dev and server both use **`backend/csm_datas`** when launched via `run-rust-server.sh` (same as Go).

## AI layer — service gaps

Go has ~50 `ai_*.go` service files. Rust provides:

- Local llama (feature `local-ai`)
- AI orchestration / guest chat / code stream stubs
- HTTP gateway to external providers

## CLI tools

```bash
# Login table diagnostics (reads Pebble KV)
cargo run --release --bin csm_diag_login

# Rebuild Tantivy + Qdrant indexes from Pebble
cargo run --release --bin csm_migrate_go
```

## Data paths (Rust)

```bash
export CSM_PEBBLE_ROOT="$CSM_NATIVE_DATA_DIR/pebble"
export CSM_VECTOR_DIR="$CSM_NATIVE_DATA_DIR/vector/qdrant"
./run-rust-server.sh
```

Legacy `database/` (RocksDB) → migrate once with `backend-go/run-migrate.sh`, then Rust reads Pebble only.

- [ ] `cargo build --release` succeeds
- [ ] Open existing Go Pebble dir: `csm/csm_accounts`
- [ ] Login + `/get-table-data` against live `csm_datas`
- [ ] Compare `/monitoring/health` kv fields with Go
- [ ] Eq-index warm: `CSM_STARTUP_REINDEX_TABLES=csm/csm_accounts`
