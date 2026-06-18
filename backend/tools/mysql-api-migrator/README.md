# MySQL → CSM migrator (PHP legacy → Go Pebble)

Đồng bộ dữ liệu từ MySQL (app PHP cũ) vào CSM:

| `global.transport` | Ghi vào đâu | Khi nào dùng |
|--------------------|-------------|--------------|
| `pebble` / `go` / `api` | Go server → `native/pebble/{app}/{table}/` | **Khuyến nghị** — Go backend đang chạy |
| `rocksdb` | `database/{app}/{table}/` (Java/Rust) | Chỉ legacy, chưa có Go |
| `rocksdb+pebble` | RocksDB rồi `go run ./cmd/migrate` | Offline: không cần API, cần `rocksdb` npm + `go` |

## Đường dẫn dữ liệu Go (quan trọng)

Go lưu record tại:

```
{APP_DATA_DIR}/native/pebble/{app_id}/{table_name}/
```

Trên repo này (mặc định `run-go-server.sh`):

| Biến | Giá trị mặc định |
|------|------------------|
| `CSM_HOME` | `{repo}/backend` |
| `APP_DATA_DIR` | `{repo}/backend/csm_datas` |
| `CSM_PEBBLE_ROOT` | `{repo}/backend/csm_datas/native/pebble` |

Ví dụ app `banhang`:

```
backend/csm_datas/native/pebble/banhang/knk_bophan/
backend/csm_datas/native/pebble/banhang/index/
```

**Với `transport: pebble`**: script **không ghi file trực tiếp** — nó gọi API Go đang chạy. Dữ liệu vào đúng Pebble **nếu Go server dùng đúng `APP_DATA_DIR`**. Kiểm tra log khi start Go:

```
[go-config] Pebble root .../backend/csm_datas/native/pebble/{app_id}/{table_name}/
```

`global.data_dir` trong config migrator chỉ cần cho mode `rocksdb` / `rocksdb+pebble`. Để trống `""` → script tự tìm `backend/csm_datas`.

## Local (Mac dev)

### Bước 1 — Chạy Go backend

```bash
cd backend-go
./run-go-server.sh
# API: http://127.0.0.1:9999/api
```

### Bước 2 — Config migrator

```bash
cd backend/tools/mysql-api-migrator
cp config.local-go.example.json config.json
# Hoặc sửa config.banhang.json:
#   "transport": "pebble"
#   "api.base_url": "http://127.0.0.1:9999/api"
#   "api.login": { username, password }  — user dev trong csm_accounts
#   "global.data_dir": ""   (để trống = auto backend/csm_datas)
```

### Bước 3 — Chạy migrate

```bash
node migrate.js --config ./config.json --check-mysql
node migrate.js --config ./config.json --dry-run
node migrate.js --config ./config.json
```

Sau migrate, kiểm tra:

```bash
ls backend/csm_datas/native/pebble/banhang/
```

Restart Go (hoặc `reindex_after_migrate: true`) để eq-index / search cập nhật.

## Server (production)

### Cách A — Migrate trực tiếp lên server (khuyến nghị)

Chạy script **từ máy dev** (hoặc máy có VPN tới MySQL), trỏ API vào server:

```json
{
  "api": {
    "base_url": "https://api.phanmemmottrieu.net/api",
    "login": { "username": "...", "password": "..." }
  },
  "global": {
    "app_id": "banhang",
    "transport": "pebble"
  }
}
```

```bash
node migrate.js --config ./config.server.json
```

Dữ liệu ghi vào Pebble **trên server** (nơi Go prod đang chạy với `APP_DATA_DIR` của server).

### Cách B — Migrate local rồi copy `native/` lên server

1. Local: `transport: pebble` + Go local → đủ data trong `backend/csm_datas/native/`
2. Stop Go trên server
3. Copy (rsync/scp):

```bash
rsync -avz --delete \
  backend/csm_datas/native/pebble/banhang/ \
  user@server:/path/to/csm_datas/native/pebble/banhang/
```

4. Start lại Go server; gọi `POST /update-table-data-index` cho từng bảng nếu cần.

Tham khảo: `backend-go/scripts/export-sys-autos-from-server.sh` (chiều ngược).

### Cách C — Offline RocksDB → Pebble (không cần API)

```json
"transport": "rocksdb+pebble",
"data_dir": "/absolute/path/to/backend/csm_datas"
```

Ghi MySQL → `database/banhang/...` rồi tự chạy `go run ./cmd/migrate`. Trên server copy cả `native/pebble/banhang/` sau bước migrate.

## Chuẩn bị

```bash
cd backend/tools/mysql-api-migrator
npm install
```

## Lệnh thường dùng

```bash
node migrate.js --config ./config.json --check-mysql
node migrate.js --config ./config.json --sync-pk-fields
node migrate.js --config ./config.json --dry-run
node migrate.js --config ./config.json
```

## Ghi chú

- Go API bọc `{ "result": { successCount, ... } }` — script đã unwrap.
- `config.banhang.json` hiện có `"transport": "rocksdb"` → đổi thành `"pebble"` để ghi Go Pebble, không phải RocksDB legacy.
- Không commit config có mật khẩu MySQL/API.
