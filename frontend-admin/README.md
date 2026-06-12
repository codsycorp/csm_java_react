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

App chay tai **goc domain** (vd. `https://admin.csmbridge.net/`, route `/login` — **khong** `/admin/login`).

## Build & deploy thu cong

```bash
pnpm build
```

Sau build, copy len server (`rp_index=admin`):

```
dist/index.html              →  csm_datas/public/admin/index.html
dist/admin/assets/*          →  csm_datas/public/admin/assets/*
dist/assets/html-module.min.js → csm_datas/public/admin/assets/  (neu co)
```

URL static `/admin/assets/index.{hash}.js` tro toi file `csm_datas/public/admin/assets/index.{hash}.js`.
Day la **duong dan thu muc deploy**, khong phai route SPA.

## Ghi chu

- App nay la source rieng, khong goi cheo sang `frontend-web`.
- Route admin nam tai `src/router/routes/index.ts` (static admin + modules/system).
