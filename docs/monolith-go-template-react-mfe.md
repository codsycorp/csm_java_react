# CSM Monolith Standard: Go Template + React Ant Design Micro-Frontend/Hydrate

## Muc tieu

Chuan hoa 4 module thanh mot mo hinh monolith:

- `backend-go`: server monolith, SSR shell, API, static, hydrate metadata
- `frontend-admin`: micro-frontend quan tri (Ant Design)
- `frontend-web`: micro-frontend website (Ant Design)
- `lmkt`: micro-frontend marketing/noi dung (Ant Design)

## Hop dong chung

Moi frontend xuat `dist/mfe.manifest.json` theo schema `csm.monolith.mfe.v1`:

- `app`: ten ung dung
- `rpIndex`: vung static (`admin`, `web`, `lmkt`)
- `hydrate`: bat hydrateRoot khi co SSR markup
- `entry`, `js`, `css`: asset runtime

Backend-go expose runtime manifest:

- `GET /mfe/manifest`
- inject `window.__CSM_MONOLITH__` vao SSR shell

## Cau truc output monolith

Public root:

- `csm_datas/public/admin/*`
- `csm_datas/public/web/*`
- `csm_datas/public/lmkt/*`

Moi vung co:

- `index.html`
- `mfe.manifest.json`
- `<rpIndex>/assets/*`

## Lenh build chuan hoa

Tai root workspace:

```bash
chmod +x scripts/build-monolith-mfe.sh scripts/verify-monolith-mfe.sh
./scripts/build-monolith-mfe.sh
./scripts/verify-monolith-mfe.sh
```

## Deploy monolith frontend

Sau khi build local xong, deploy 3 micro-frontend len server trong mot lenh:

```bash
chmod +x scripts/deploy-monolith-mfe.sh
./scripts/deploy-monolith-mfe.sh root@your-server /root/la_server
```

Script se dong bo:

- `public/admin`
- `public/web`
- `public/lmkt`

va verify `index.html` + `mfe.manifest.json` tren server.

## Runtime behavior

1. Backend-go route web request, resolve `rp_index` theo host/domain.
2. SSR render shell + SEO + data hydration.
3. Inject `window.__CSM_MONOLITH__` va `window.__INITIAL_DATA__`.
4. Frontend se:
   - `hydrateRoot` neu `#root` da co child nodes
   - fallback `createRoot` neu CSR mode

## Quy tac migration tiep theo

- Uu tien host-based mapping: `admin.* -> admin`, `web/public -> web`, campaign/LMKT -> `lmkt`.
- Loai bo deploy rieng le theo tung frontend khi da on dinh, chuyen sang script monolith chung.
- Giu nguyen API path contract hien tai (`/api/*`, bare-path compat) de tranh regression.

## Ghi chu

Mo hinh nay la buoc chuan hoa khung de chuyen doi an toan; khong bat buoc rewrite toan bo route/component mot lan.
