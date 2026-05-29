# CSM Menu — Structure Runtime (LEGO · học CẤU TRÚC, không học nghiệp vụ)

Version: 2.0  
Mirror dev thực tế:
`use-menu.ts` · `menu-type-resolver.ts` · `menu-logic.ts` · `MenuConfigBadge.tsx` ·
`MenuRequirementForm.tsx` · `menu-tree-table.tsx` · `saveMenuStruct` · `menu/index.tsx` · `detail.tsx`

**Nguyên tắc Lego:** AI học **mảnh cấu trúc** (type_form, field, trigger, lưu/chạy).  
**Nghiệp vụ** (tên module, bảng, luồng) **chỉ** từ `USER_REQUEST` + Pass 1 Comprehend — **không** nạp cây ERP mẫu.

---

## A. Dev thủ công hằng ngày (= AI phải làm tương đương)

Giống `MenuRequirementForm` — dev **không** chọn type_form từng menu; chỉ nhập:

1. **Tên module** (`title`)
2. **Mô tả nghiệp vụ** (`description`) — khách muốn gì
3. *(Tuỳ chọn)* **Bảng có sẵn** — mỗi dòng một `table_name`
4. **Scope:** `complete` = đầy đủ field/trigger; `minimal` = khung cấu trúc

AI thay dev ở bước 3–6:

| Bước dev | Việc | AI |
|----------|------|-----|
| Phân rã cây | group → leaf | `type_form=0` + children |
| Chọn loại màn | resolver | Gán `type_form` theo bảng B |
| Khai báo node | `detail.tsx` form | `id`, `parentId`, labels, `table[]`, `trigger` |
| Master-Detail | `MenuConfigBadge` | `type_form=2` + tab trong `nodes[]`/`children[]` |
| Lưu | `saveMenuStruct` | Output `{ "menu": [...] }` |
| Chạy | `use-menu.ts` click | `/system/grid/:menuId` |

---

## B. Lưu & đọc menu (saveMenuStruct)

```
saveMenuStruct(appId, menuTree[])
  → loadMenuStruct (decrypt struct nếu có)
  → persistMenuStruct → csmEncrypt(JSON.stringify(menuTree))
  → update-table-data: obj_name=index, id="menu", struct=encrypted

fetchNavigationMenus → decrypt struct → permission store → use-menu.ts sidebar
```

**AI output** = cùng schema dev lưu: `{ "menu": [ nodes ] }` — không `menu_items`, không path React `/sales`.

---

## C. Mảnh Lego — type_form (`menu-type-resolver.ts`)

| type_form | Lego piece | Runtime | Payload bắt buộc |
|-----------|------------|---------|------------------|
| **0** | `group_folder` | Sidebar nhóm, không grid | `children[]` có ≥1 leaf runtime; **không** `table_name` |
| **1** | `grid_crud` | CsmDynamicGrid + CsmEditModal | `table_name`, `table[]` (f_*), `trigger`; `row_type_edit` 0=popup, 1=inline |
| **2** | `master_detail` | CsmMasterDetail | master `table_name` + `table[]`; tab = **`nodes[]` hoặc `children[]`** |
| **3** | `dynamic_link` | Router / window.open | `dynamic_link_url` hoặc `v_link` |
| **4** | `dynamic_code` | DynamicCodeMenu | `auto_code_name` → `sys_autos` |
| **5/report** | `report` | CsmReport (ưu tiên nếu có `report_name`) | `report_name`, `trigger.report_db`, `table[]` filter |
| **6** | `kanban` | CsmKanbanBoard | `kanban_config`, `table_name`, `table[]` |

**Suy type_form từ *cấu trúc* nghiệp vụ user mô tả (không từ template):**

- Danh sách CRUD một bảng → **1**
- Phiếu + dòng chi tiết / tab → **2** (tab `table_name` = **field JSON array** trong master, vd `chi_tiet`)
- Chỉ link/dashboard URL → **3**
- Màn JS custom → **4**
- In/tổng hợp/báo cáo → **report** (`report_name`)
- Kéo thả trạng thái → **6**

---

## D. Master-Detail (`menu-logic.ts` — hay sai nhất)

```
isMasterDetailMenu: type_form===2 && table_name
getDetailTabs: nodes[] HOẶC children[]  (AI dùng children[] cho output mới)
filterVisibleChildren: ẩn tab khỏi sidebar — tab chỉ trong form master
```

**MenuConfigBadge cảnh báo:** MD không có tab → tag đỏ "Chưa có Tab".

Tab detail: `type_form=1`, `table_name="chi_tiet"` ← tên **field array** trong record master, **không** phải `bh_donhang_ct` DB.

---

## E. Click menu (`use-menu.ts`)

```
hasRuntimePayload =
  (table_name + table[]) | report_name | kanban_config | auto_code/auto_code_name | type_form 4|6
  → addTab("/system/grid/:menuId", { menuData, type_form, table_name, ... })

Group (0) không payload → fetchRuntimeDescendantFromServer → mở leaf con đầu tiên
  → AI: mọi group phải có ≥1 leaf có payload

type_form=3 → mở dynamic_link_url (http _blank hoặc path nội bộ)

type_menu=1 → sidebar nhóm 3 item một hàng (optional)
m_show=false → ẩn khi không dev
```

---

## F. Node schema (dev khai báo trong detail.tsx)

Mọi node:
`id`, `parentId`, `label`, `label_en`, `label_zh`, `icon`, `type_form`, `m_show`, `order`

Leaf grid/report/kanban thêm:
`table_name`, `table[]`, `trigger`, `row_type_edit`

Field (`table[]`):
- Prefix **f_** only: `f_name`, `f_header`, `f_header_en`, `f_header_zh`, `f_types`, `f_pkid`, `f_show`, `f_width`, `f_dec`, `f_cbo_query`
- PK: `{ "f_name":"id", "f_pkid":1, "f_types":"ed", "f_show":0 }`
- Combo: `f_types` co|coro|cbo|cp + **f_cbo_query** (JSON query hoặc options)

Trigger object (whitelist): `load_db`, `beforeSave`, `update`, `report_db` — JS string `(seft, data, bang)` hoặc `(seft, db)`.

---

## G. Pipeline AI local (Lego)

```
[Structure MD này]     → biết mảnh Lego
[USER_REQUEST]         → Comprehend: modules, tables, flows (nghiệp vụ)
[ExecutionPlan]        → map module → type_form + group/leaf
[Worker]               → lắp JSON { menu: [...] }
[saveMenuStruct path]  → gate → apply editor
```

**Nguồn học pattern field/trigger (không copy cây):** LIVE_APP_MENU tenant, SAMPLE attachment, TENANT_RAG.

**Cấm:** cây ERP cố định; patches khi editor trống; path `/sales`; field key `label` thay `f_header`.

---

## H. Output greenfield

```json
{
  "menu": [ "/* cây đầy đủ — parentId/children nhất quán */" ],
  "notes": [],
  "warnings": [],
  "coverage_modules": [{ "module": "từ USER_REQUEST", "status": "covered" }]
}
```

Edit menu có sẵn: `{ "patches": [ add|edit|delete ] }`.
