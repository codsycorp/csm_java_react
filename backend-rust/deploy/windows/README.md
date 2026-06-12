# CSM Rust — Windows Service (NSSM)

`csm_server.exe` chạy **cùng cấp** với `csm_datas\`, `config.env`, `nssm.exe`.

## Cấu trúc thư mục trên Windows

```
D:\hldragon250725\               ← CSM_HOME (thư mục chứa exe + bat)
  csm_server.exe                 ← binary Rust
  config.env                     ← JWT, port, Redis...
  csm_datas\                     ← RocksDB, backup, index...
    database\
    backups\
    lucene_index\
  nssm.exe                       ← https://nssm.cc/download
  logs\                          ← tạo tự động khi cài service
  install-csm-rust-service.bat
  uninstall-csm-rust-service.bat
  start-csm-rust-service.bat
  status-csm-rust-service.bat
  load-csm-rust-env.bat
```

Script tự lấy `CSM_HOME` từ vị trí file `.bat` (`%~dp0`) — **không cần sửa đường dẫn** trong script.

## Build trên Mac/Linux

```bash
cd backend-rust
./build-windows-release.sh
```

Copy lên Windows (**bắt buộc cả exe + tất cả `lib*.dll`**):

```bash
cd backend-rust
./build-windows-release.sh   # tự bundle runtime MinGW, fail nếu thiếu
```

Sau build, copy sang `D:\hldragon250725\`:

- `csm_server.exe`
- `lib*.dll` (8 file — script tự copy, ~42MB)
- `config.env`, `csm_datas\`, `nssm.exe`, các file `.bat`

Trên Windows kiểm tra trước:

```bat
check-windows-runtime.bat
```

## Cài service

1. CMD **Run as administrator**
2. `cd D:\hldragon250725`
3. `install-csm-rust-service.bat`

Service: **`CSM_Rust_Service`** — tự khởi động cùng Windows, restart khi crash.

## Gỡ service

```bat
uninstall-csm-rust-service.bat
```

Nếu gỡ không được: chạy CMD **Administrator**, sau đó thử lại. Script sẽ `nssm stop` → chờ → `nssm remove` → fallback `sc delete`.

## Kiểm tra lỗi

```bat
status-csm-rust-service.bat
```

Xem log chi tiết: `logs\csm_rust_stderr.log`

## Chạy thử (không cài service)

```bat
start-csm-rust-service.bat
```

## Biến môi trường

Mặc định (có thể ghi trong `config.env`):

| Biến | Mặc định |
|------|----------|
| `SERVER_PORT` | 9999 |
| `SOCKET_SERVER_PORT` | 15301 |
| `APP_DATA_DIR` | `./csm_datas` → absolute path cùng CSM_HOME |

Build **không AI**: `--no-default-features` (xem `build-windows-release.sh`).

### Runtime MinGW (không thiếu DLL nữa)

Build GNU/MinGW cần runtime DLL trên Windows. Script `scripts/bundle-mingw-runtime.sh` (gọi tự động từ `build-windows-release.sh`):

1. Copy **toàn bộ** `lib*.dll` từ toolchain MinGW
2. Quét phụ thuộc đệ quy từ `csm_server.exe`
3. **Fail build** nếu còn thiếu DLL

| DLL | Ghi chú |
|-----|---------|
| `libstdc++-6.dll` | C++ runtime (RocksDB) |
| `libgcc_s_seh-1.dll` | GCC runtime |
| `libwinpthread-1.dll` | pthread |
| `libatomic-1.dll`, `libssp-0.dll`, … | Copy sẵn phòng phụ thuộc ẩn |

Chỉ bundle lại (không build): `backend-rust/scripts/bundle-mingw-runtime.sh csm_server.exe .`
