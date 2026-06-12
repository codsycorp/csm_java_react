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

## Build & deploy thủ công

```bash
pnpm build
```

Copy **toàn bộ** nội dung `dist/` vào `csm_datas/public/{rp_index}/` (ví dụ `admin/`):

```
dist/index.html          →  csm_datas/public/admin/index.html
dist/assets/*            →  csm_datas/public/admin/assets/*
dist/version.json        →  csm_datas/public/admin/version.json
```

URL `/admin/assets/index.{hash}.js` phải trỏ tới file `csm_datas/public/admin/assets/index.{hash}.js`.

`sys_la_routers.rp_index` phải khớp thư mục đích (thường là `admin`).

## Ghi chu

- App nay la source rieng, khong goi cheo sang `frontend-web`.
- Route admin nam tai `src/router/routes/index.ts` (static admin + modules/system).
