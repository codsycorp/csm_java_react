# CSM DynamicCode — Compact Digest (Comprehend / SYSTEM_MASTER)

Version: 1.0 — lane **code** only (`contextType=code`, `flowType=code_editor`).

## Tách lane (BẮT BUỘC)

| Lane | contextType | flowType | Output | KHÔNG dùng |
|------|-------------|----------|--------|------------|
| Trình biên tập mã | `code` | `code_editor` | `textEdits` JSON | patches, menu tree |
| Quản lý menu | `menu_json` | `menu_manager` | patches / menu | textEdits trên JS |

Backend `flow_guard` chặn nếu flowType/contextType lệch nhau.

## Nơi code chạy (sys_autos p_type=0)

1. **Trang chủ** `homepage/index.tsx` → `DynamicCodeMenu` `autoCodeName=broadcast_{appId}`, container `#broadcast-auto-root-homepage`
2. **Auto setup** `AutoSetup.tsx` → `autoCodeName={app_id}` hoặc `inlineCode`, container `#context-auto`
3. **Menu type_form=4** AdminPage → `auto_code_name` = `p_name` trong sys_autos

Load: `getTableData(sys_autos)` where `p_name` + `p_type=0` → decrypt `p_code` → execute.

## Runtime execute (`dynamic-code/index.tsx`)

```js
new Function("seft", "__dynamicContainerId", "__scopedWindow", "__scopedDocument", code)
```

- Browser only: **cấm** import/export/require/module.exports/Node APIs
- Globals: `window.React`, `ReactDOM`, `antd`, `csmApi`, `seft`, `thongbao`, `canhbao`
- `seft`: appId, containerId, getContainer(), csm_obj_tables, csm_obj_updates, csm_encrypt/decrypt, …
- Mount UI: `document.getElementById(seft.containerId || window.csmDynamicCodeContainerId || "context-auto")`
- React 18: `ReactDOM.createRoot(mountNode).render(...)`; dispose: `window.__dynamicCodeDispose`

## Pattern file mẫu

- **seo.js**: legacy script lớn, `#context-auto`, `CsmDynamicGrid`, `window.seft = seft`
- **auto-kqxs.js**: IIFE self-contained, fallback antd, mount KQXSApp, `__dynamicCodeDispose`
- **auto-lmkt.js**: guard `__AUTO_*_LOADED__`, `uiTranslations` vi/en/zh, multi-domain CRUD

## Edit output

```json
{"summary":"","changes":[],"textEdits":[{"startLine":N,"endLine":N,"replacement":"...","action":"edit"}]}
```

`startLine`/`endLine` = **1-based trên FULL currentCode** (CodeEditor buffer), không phải slice.
