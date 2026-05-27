# CSM Frontend Admin

Source doc lap cho luong admin.

## Pham vi source

- Chi giu source/router admin.
- Khong con source pages web `wu_` trong app nay.

## Chay local

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Build tạo `dist/version.json` (cùng timestamp với bundle). Khi deploy lên server, copy **toàn bộ** `dist/` vào `csm_datas/public/{rp_index}/` (ví dụ `admin/`) — `sys_la_routers.rp_index` phải khớp thư mục đó. Backend phục vụ `/version.json` theo domain → `{rp_index}/version.json`.

## Ghi chu

- App nay la source rieng, khong goi cheo sang `frontend-web`.
- Route admin nam tai `src/router/routes/index.ts` (static admin + modules/system).
