# CSM DynamicCode — Runtime Contract (JavaScript)

Version: 1.0  
Audience: AI Local lane **code** — `CodeEditor.tsx`, `contextType=code`, `flowType=code_editor`  
**Không áp dụng** cho lane menu JSON.

---

## 1. Hai lane AI — tách tuyệt đối

| | Code (DynamicCode) | Menu JSON |
|--|-------------------|-----------|
| Màn hình | Trình biên tập mã | Quản lý menu → tab AI |
| `contextType` | `code` | `menu_json` |
| `flowType` | `code_editor` | `menu_manager` |
| `taskType` | `code_assistant` | `menu_design` |
| Buffer | JS string `currentCode` | JSON menu string |
| Output edit | `{ textEdits: [...] }` | `{ patches: [...] }` hoặc `{ menu: [...] }` |
| Apply | CodeMirror line splice | Parse JSON → saveMenuStruct |
| Gate | AST JS + dry-run line edits | MenuQualityGateService |

Backend (`ApiSpringController` ~1709): `menu_manager` ↔ `menu_json`, `code_editor` ↔ `code`. Mismatch → `flow_context_mismatch` blocked.

---

## 2. Lưu trữ & CodeEditor

- Bảng: `sys_autos` (app_id thường `csm`)
- Record: `p_name` (vd `seo`, `broadcast_csang`, `csang`), `p_type=0` (DynamicCode JS), `p_code` (encrypted)
- **CodeEditor.tsx**: load/save qua `fetchCodeList` / `saveCode`; AI gửi `contextType: "code"`, `pName`, `pType`, `currentCode` full string
- Workspace citation (`auto-lmkt.js`, …): read-only preview — lưu qua sys_autos record tương ứng

---

## 3. Ba điểm mount runtime

### A. Trang chủ — `pages/homepage/index.tsx`

```tsx
<DynamicCodeMenu
  autoCodeName={`broadcast_${user.app_id}`}
  containerId="broadcast-auto-root-homepage"
  hideOnError
/>
```

- Load **chỉ** `p_name = broadcast_{appId}` (không fallback app_id)
- Container DOM: `#broadcast-auto-root-homepage`

### B. Auto Setup — `pages/auto/AutoSetup.tsx`

```tsx
<DynamicCodeMenu
  inlineCode={inlineCode}           // optional từ session/state
  autoCodeName={user.app_id}        // khi không có inlineCode
  containerId="context-auto"
/>
```

- Load `p_name = {app_id}` (vd `csang`, `seo` alias tùy cấu hình)
- Legacy scripts (seo.js) thường query `#context-auto`
- Container DOM: `#context-auto`

### C. Menu admin type_form=4

- Menu JSON: `type_form: 4`, `auto_code_name: "ten_trong_sys_autos"`
- AdminPage → `DynamicCodeMenu` với `menuData.auto_code_name`
- Container: `#dynamic-code-root-{scope}` hoặc scoped theo menu id

---

## 4. DynamicCodeMenu execution model

File: `pages/system/dynamic-code/index.tsx`

### Load sequence

1. Resolve `autoCodeName` (prop hoặc menu)
2. Query `sys_autos` WHERE `p_name` = name AND `p_type` = 0
3. `csmDecrypt(p_code)` → string JS
4. Wait `#${containerId}` in DOM
5. Execute via `new Function(...)`

### Function signature (code body nhận implicit globals qua scoped proxy)

```javascript
// Injected parameters:
// seft, __dynamicContainerId, __scopedWindow, __scopedDocument
// Inside body: const window = __scopedWindow; const document = __scopedDocument;
```

### Globals exposed BEFORE execute

| Global | Nội dung |
|--------|----------|
| `window.React` / `ReactDOM` | React 18 |
| `window.antd` | Ant Design + dayjs + CsmDynamicGrid + CsmKanbanBoard + locale/theme |
| `window.csmApi` | getTableData, updateTableData, andWhere, SEO/queue helpers, … |
| `window.seft` | Context object (synced from React useMemo) |
| `window.thongbao` / `canhbao` | notification success / warn |
| `window.csmDynamicCodeContainerId` | container id hiện tại |
| `window.csmUserData` | User options persistence API |

### `seft` object (legacy scripts depend on this)

```javascript
seft = {
  app_id, appId, menuId, containerId,
  getContainer: () => document.getElementById(containerId),
  user, t, navigate,
  Uinfos: { appToken, userAddress },
  csm_obj_tables(params, callback),   // getTableData wrapper
  csm_obj_updates(params, callback),  // updateTableData wrapper
  csm_savedb(key, data, callback),
  csm_encrypt, csm_decrypt,
  csm_userinfo_update(...),
  // + Facebook, SEO AI, CsmApi spread
}
```

Code **có thể** gán `window.seft = seft` cuối file (seo.js pattern) — runtime cũng set từ host.

---

## 5. Pattern templates (reference implementations)

### Pattern A — Legacy monolith (seo.js ~7k+ lines)

- Top-level functions, `setupWhenContainerReady()` polling `#context-auto`
- `mainAppCode()` → grids, proxy, webview lifecycle
- React islands: `ReactDOM.createRoot(container).render(React.createElement(...))`
- Embedded `CsmDynamicGrid` via `window.antd.CsmDynamicGrid` hoặc global
- **Không** wrap IIFE bắt buộc; idempotent guards on `window.checkIP`, etc.
- Kết thúc: `window.seft = seft`

### Pattern B — IIFE React self-contained (auto-kqxs.js)

```javascript
(function autoKqxsReactAntdSelfContained() {
  var ReactRef = window.React;
  var ReactDOMRef = window.ReactDOM;
  var antdRef = window.antd || {};
  var h = ReactRef.createElement;
  // Fallback components when antd.* missing
  var Card = antdRef.Card || FallbackCard;
  // ... app component KQXSApp ...
  var containerId = window.csmDynamicCodeContainerId || "dynamic-code-root";
  var container = document.getElementById(containerId)
    || document.getElementById("context-auto");
  var root = ReactDOMRef.createRoot(mountNode);
  root.render(h(KQXSApp));
  window.__dynamicCodeDispose = function () { root.unmount(); ... };
})();
```

- Double-load safe via IIFE scope
- Always implement `__dynamicCodeDispose` for tab/language remount
- Fallback UI khi thiếu antd sub-component

### Pattern C — Multi-module content manager (auto-lmkt.js)

```javascript
if (window.__AUTO_UPLOAD_LMKT_LOADED__) { /* skip re-init */ return; }
window.__AUTO_UPLOAD_LMKT_LOADED__ = true;
const uiTranslations = { vi: {...}, en: {...}, zh: {...} };
// Domain/industry/project selectors, Zalo/Facebook upload, IndexedDB cache
```

- Guard flag `__AUTO_{MODULE}_LOADED__` — **bắt buộc** khi code có thể re-execute on language change
- i18n: resolve từ `window.i18n.language` + `uiTranslations`
- Data: `csmApi.getTableData` / `seft.csm_obj_tables` cho `web_services`, posts, …

---

## 6. Quy tắc viết code AI (DynamicCode)

### Cấm

- `import` / `export` / `require` / `module.exports`
- Node.js: `fs`, `path`, `process` (except minimal `process.env` shims nếu đã có trong file)
- Giả định build step (webpack/vite) — code chạy thẳng trong browser

### Bắt buộc / khuyến nghị

- Dùng `window.React.createElement` hoặc JSX-less `h()` — không JSX trong sys_autos trừ khi file legacy đã có Babel inline
- Container: luôn resolve `seft.containerId || window.csmDynamicCodeContainerId || "context-auto"`
- DB: `await window.csmApi.getTableData({ app_id, obj_name, where })` hoặc callback `seft.csm_obj_tables`
- Persist: `window.csmApi.updateTableData({ command, obj_update, pk_fields, where })`
- Thông báo: `thongbao(msg)` / `canhbao(msg)` thay alert (trừ catch fatal)
- Idempotent init: guard flags, cleanup timers/listeners trong `__dynamicCodeDispose`
- Linked edits: sửa hàm + mọi call site trong cùng response (textEdits batch)

### React mount checklist

1. `const el = document.getElementById(containerId); if (!el) return;`
2. `el.innerHTML = ""`; tạo mount child nếu cần
3. `const root = ReactDOM.createRoot(mountNode); root.render(...)`
4. Register `window.__dynamicCodeDispose = () => root.unmount()`

---

## 7. AI edit contract (CodeEditor)

Output **chỉ JSON**:

```json
{
  "summary": "Mô tả ngắn tiếng Việt",
  "changes": ["symbol/function touched"],
  "textEdits": [
    {
      "startLine": 120,
      "endLine": 125,
      "replacement": "// full replacement lines\n...",
      "action": "edit"
    }
  ]
}
```

- `startLine` / `endLine`: **1-based inclusive**, trên **toàn bộ** `currentCode` tại thời điểm request
- `action`: `add` | `edit` | `delete`
- Không overlap edits; sort apply bottom-up ở frontend
- File lớn (>30k): planner multi-slice — mỗi slice vẫn dùng **số dòng tuyệt đối**
- Greenfield editor trống: `{ "code": "<full JS string>", "summary": "...", "changes": [] }`

Fallback:

```json
{"summary":"Không tạo được patch an toàn","changes":[],"textEdits":[]}
```

---

## 8. Greenfield scaffold (deterministic fallback)

Khi model yếu, backend seed tối thiểu:

```javascript
window.seft = window.seft || {};
var ctx = window.seft;
ctx.helperApi = ctx.helperApi || {};

function initModule() {
  var container = document.getElementById(
    ctx.containerId || window.csmDynamicCodeContainerId || "context-auto"
  );
  if (!container) return;
  // bind UI
}
initModule();
```

---

## 9. Phân biệt với menu JSON

- **Không** sinh `type_form`, `table[]`, `f_cbo_query` trong lane code (trừ khi user yêu cầu sửa chuỗi JSON trong editor — hiếm)
- Menu `type_form=4` chỉ **trỏ** tới `auto_code_name`; nội dung JS nằm trong sys_autos, edit tại CodeEditor
- `CsmDynamicGrid` trong DynamicCode: dùng qua `window.antd.CsmDynamicGrid` với props `m_configs`, `appId`, `database` — config grid lấy từ menu JSON riêng hoặc inline object

---

## 10. File tham chiếu

| File | Vai trò |
|------|---------|
| `pages/system/developer/CodeEditor.tsx` | AI chat, `contextType=code` |
| `pages/system/dynamic-code/index.tsx` | Load + execute DynamicCode |
| `pages/homepage/index.tsx` | broadcast_* homepage |
| `pages/auto/AutoSetup.tsx` | app_id / inline auto |
| `pages/auto/seo.js` | Legacy SEO + grid pattern |
| `lmkt/src/api/ai/auto-kqxs.js` | IIFE React + dispose |
| `lmkt/src/api/ai/auto-lmkt.js` | Multi-domain + i18n |
| `ai_code_master_prompt.md` | Patch schema v7 |
| `AiAssistantGatewayService` | `FRONTEND_CODE` intent, code master |
