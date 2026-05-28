# CSM Menu JSON — Runtime Component Contract

Version: 1.0  
Audience: CSM AI Local (`contextType=menu_json`, Trò chuyện Trợ lý AI tại Quản lý menu)  
Source of truth: `frontend-admin` runtime components + `MenuQualityGateService`

---

## 1. Hai lane AI trong Quản lý hệ thống

| Màn hình | File | contextType | flowType | Output |
|----------|------|-------------|----------|--------|
| Quản lý menu → tab AI | `AiMenuDesigner.tsx` | `menu_json` | `menu_manager` | JSON `{ menu, patches, notes }` → encrypt vào `index.menu` |
| Trình biên tập mã | `CodeEditor.tsx` | `code` | `code_editor` | JS DynamicCode → `sys_autos` |

AI thiết kế menu **chỉ** chạy lane `menu_json`. Code editor lane **không** thay thế menu JSON.

---

## 2. Luồng runtime sau khi lưu menu

```
User click sidebar menu
  → /system/grid/:menuId
  → AdminPage (pages/system/admin/index.tsx)
  → chọn component theo type_form + payload
  → CsmDynamicGrid | CsmMasterDetail | CsmReport | CsmKanbanBoard | DynamicCodeMenu
```

Menu JSON **trực tiếp** quyết định component và hành vi. Schema sai = màn hình trống hoặc lỗi im lặng.

---

## 3. Thứ tự dispatch AdminPage (first match wins)

1. **Kanban**: `type_form === 6` **hoặc** `kanban_config` object không rỗng → `CsmKanbanBoard.tsx`
2. **Dynamic Code**: `auto_code_name` **hoặc** `type_form === 4` → `DynamicCodeMenu`
3. **Report**: `report_name` + (`type_form === 5` **hoặc** `trigger.report_db`) → `CsmReport.tsx`  
   (Report có thể có `table_name` cho combo/filter — không bị kéo sang grid nếu có `report_db`)
4. **Grid branch**: `table_name` / `trigger.load_db` / `type_form` 1 hoặc 2:
   - `type_form === 2` + `nodes[]` (hoặc `children[]` detail) → `CsmMasterDetail.tsx`
   - còn lại → `CsmDynamicGrid.tsx`

`CsmEditModal.tsx` **không** route từ menu — được gọi từ `CsmDynamicGrid` (popup `row_type_edit=0`) và `CsmKanbanBoard` (sửa thẻ).

---

## 4. type_form → component & fields bắt buộc

### type_form = 0 — Nhóm menu

- Chỉ sidebar folder; **không** render component khi click.
- **Bắt buộc**: `children[]` không rỗng.
- **Cấm**: `table_name`, `report_name`, `trigger` nghiệp vụ trên node nhóm.

### type_form = 1 — Bảng CRUD (`CsmDynamicGrid`)

| Field | Required | Ghi chú |
|-------|----------|---------|
| `id`, `label`, `label_en`, `label_zh` | ✓ | i18n menu |
| `table_name` | ✓ | Bảng DB load qua API |
| `table[]` | ✓ | Cột/form — chỉ key `f_*` |
| `trigger` | Khuyến nghị | `load_db`, `beforeSave`, `update_db`, … |
| `row_type_edit` | 0=popup (`CsmEditModal`), 1=inline | Mặc định 0 |
| `type_form` | 1 | |
| `struct.fieldsPK` | Optional | Mặc định `["id"]` |

Grid mount: quét `table[]` → combo `f_types` chứa `co` → parse `f_cbo_query` → auto-fetch bảng thiếu.

### type_form = 2 — Master-Detail (`CsmMasterDetail` + `CsmEditModal` tabs)

**Master** (node cha):

- `table_name` = bảng DB master (vd: `bh_donhang`)
- `table[]`, `trigger` cho master
- `nodes[]` (hoặc children detail) = các tab chi tiết

**Tab chi tiết (nodes[]) — QUAN TRỌNG**:

- `node.table_name` = **tên field trong bản ghi master** chứa mảng JSON chi tiết (vd: `chi_tiet`, `items`) — **KHÔNG** phải tên bảng DB riêng.
- Runtime: `selectedRow[node.table_name]` → parse JSON array → sync vào store → `CsmDynamicGrid` với `isDetailGrid=true`.
- Tab detail: `type_form: 1`, `row_type_edit: 1`, `g_readonly: true` (auto trong runtime).
- Chi tiết chỉ persist khi **Save master** (modal hoặc inline master).

**Khi nào dùng 2 menu type_form=1 riêng?** Khi detail có **bảng DB riêng** với FK (vd: `bh_donhang_ct.id_donhang`).

### type_form = 3 — Dynamic Link

- `dynamic_link_url`: URL ngoài hoặc path nội bộ.

### type_form = 4 — Dynamic Code

- `auto_code_name` = `p_name` trong bảng `sys_autos` (p_type=0).
- Code chạy trong browser qua `DynamicCodeMenu`.

### type_form = 5 / Report runtime (`CsmReport`)

- `report_name`: path template `.docx`
- `trigger.report_db`: JS `(seft, db) => Row[]`
- `table[]`: field filter trên form báo cáo (`f_show=1`)
- `orientation`, `p_width`, `p_height` optional

### type_form = 6 — Kanban (`CsmKanbanBoard`)

- `kanban_config` object (bắt buộc):

```json
{
  "tableName": "crm_tasks",
  "pkField": "id",
  "titleField": "title",
  "stageField": "status",
  "stages": [
    { "id": "todo", "label": "Chưa xử lý", "color": "blue" },
    { "id": "done", "label": "Hoàn thành", "color": "green" }
  ]
}
```

- `table_name` fallback nếu `kanban_config.tableName` thiếu
- `table[]` + `trigger` cho modal sửa thẻ (qua `CsmEditModal`)
- Màu stage hợp lệ: blue, orange, green, red, purple, cyan, gold, default

---

## 5. Schema field `table[]` — prefix `f_` bắt buộc

Runtime **bỏ qua** key không có prefix `f_` (vd: `label`, `field`, `type`).

| Key | Mô tả |
|-----|--------|
| `f_name` | Tên cột DB |
| `f_header`, `f_header_vi/en/zh` | Nhãn |
| `f_types` | ed, price, date, co, coro, ch, memo, … |
| `f_show`, `f_showgrid`, `f_showonreport` | 0/1 hiển thị |
| `f_pkid` | 1 = primary key |
| `f_stt`, `f_width`, `f_dec`, `f_align` | UI |
| `f_cbo_query` | **Bắt buộc** nếu f_types co/coro/cbo/cp |

Field ID chuẩn đầu mỗi table:

```json
{
  "f_name": "id", "f_header": "ID", "f_types": "ed", "f_show": 0, "f_stt": 0,
  "f_pkid": 1, "f_width": "80", "f_dec": 0, "f_align": "left",
  "f_search": 0, "f_report": 0, "f_showgrid": 0, "f_cbo_query": "", "f_alert_query": ""
}
```

### f_cbo_query — 4 dạng hợp lệ (luôn là STRING trong JSON)

1. **Query DB**: `{"query":[{"obj_name":"dm_khachhang","fields":["id","ten"],"obj_where":""}],"options":[]}`
2. **Options tĩnh**: `{"query":[],"options":[{"ma":"active","ten":"Hoạt động"}]}`
3. **JS thuần**: `var opts=[]; ... return {f_grid:true,f_grid_fields:true,options:opts}`
4. **JS + data store**: `var rows=data["dm_ncc"].rows||[]; ... return {f_grid:true,f_grid_fields:true,options:opts}`

---

## 6. Trigger object (whitelist MenuQualityGate)

Keys hợp lệ: `filter`, `load_db`, `datacolumntemplate`, `datarowtemplate`, `update`, `barcode`, `update_db`, `delete_db`, `report_db`, `beforeSave`, `beforeImport`, `afterImport`, `afterAdd`, `afterEdit`, `afterDelete`.

Chữ ký thường dùng:

- `load_db(seft, db)` → filter hoặc rows
- `beforeSave(seft, data, bang)` → validate/transform; return false để chặn
- `update(seft, data, bang)` → tính field realtime (inline edit)
- `report_db(seft, db)` → data merge vào template báo cáo

**Không** đặt trigger ở root menu ngoài object `trigger`.

---

## 7. Cây menu & hierarchy

- Mỗi node: `id` unique, không khoảng trắng, không `/`.
- `parentId` khớp `id` cha; đồng bộ với `children[]` nested.
- Prefix id gợi ý: `dm_` danh mục, `bh_` bán hàng, `kho_` kho, `bc_` báo cáo, `crm_` CRM.
- Icon: field `icon` (Ant Design name), **không** dùng `m_icon` (deprecated, gate migrate).

---

## 8. Ví dụ node tối thiểu chạy được

### Grid danh mục (type_form=1)

```json
{
  "id": "dm_khachhang", "parentId": "grp_banhang", "label": "Khách hàng",
  "label_en": "Customers", "label_zh": "客户", "icon": "UserOutlined",
  "type_form": 1, "row_type_edit": 0, "table_name": "dm_khachhang",
  "table": [
    { "f_name": "id", "f_header": "ID", "f_types": "ed", "f_show": 0, "f_stt": 0, "f_pkid": 1 },
    { "f_name": "ten_kh", "f_header": "Tên KH", "f_types": "ed", "f_show": 1, "f_stt": 1, "f_pkid": 0 }
  ],
  "trigger": { "load_db": "return (row) => true" }
}
```

### Master-Detail đơn hàng (type_form=2)

```json
{
  "id": "bh_donhang", "type_form": 2, "table_name": "bh_donhang",
  "table": [ "...master fields...", { "f_name": "chi_tiet", "f_types": "memo", "f_show": 0 } ],
  "trigger": { "beforeSave": "return data" },
  "nodes": [{
    "id": "bh_donhang_ct", "label": "Chi tiết", "table_name": "chi_tiet",
    "table": [
      { "f_name": "id", "f_pkid": 1, "f_types": "ed", "f_show": 0, "f_stt": 0 },
      { "f_name": "ma_sp", "f_header": "Mã SP", "f_types": "ed", "f_show": 1, "f_stt": 1, "f_pkid": 0 },
      { "f_name": "so_luong", "f_header": "SL", "f_types": "nummeric", "f_show": 1, "f_stt": 2, "f_pkid": 0 }
    ],
    "trigger": { "update": "data.thanh_tien=(data.so_luong||0)*(data.don_gia||0); return data;" }
  }]
}
```

### Báo cáo (CsmReport)

```json
{
  "id": "bc_doanh_so", "type_form": 1, "table_name": "bc_filter",
  "report_name": "/uploads/templates/bc_doanh_so.docx",
  "table": [
    { "f_name": "tu_ngay", "f_header": "Từ ngày", "f_types": "date", "f_show": 1, "f_stt": 1, "f_pkid": 0 }
  ],
  "trigger": { "report_db": "return db['bc_filter']?.rows || []" }
}
```

---

## 9. Output AI menu designer

**Greenfield / thiết kế mới:**

```json
{
  "menu": [ "...full tree..." ],
  "notes": [],
  "warnings": [],
  "coverage_modules": [{ "module": "...", "menus": ["id1"], "status": "covered" }],
  "coverage_tables": [{ "table": "...", "menus": ["id1"], "status": "covered" }]
}
```

**Patch / sửa menu có sẵn:**

```json
{
  "status": "success",
  "patches": [{ "action": "edit", "nodeId": "...", "after": { } }],
  "i18n": { "vi": {}, "en": {}, "zh": {} },
  "warnings": []
}
```

---

## 10. Tham chiếu frontend (đối chiếu khi debug)

| Component | Path |
|-----------|------|
| AdminPage dispatch | `pages/system/admin/index.tsx` |
| CsmDynamicGrid | `components/csm-grid/CsmDynamicGrid.tsx` |
| CsmMasterDetail | `components/csm-grid/CsmMasterDetail.tsx` |
| CsmEditModal | `components/csm-grid/CsmEditModal.tsx` |
| CsmReport | `components/csm-report/CsmReport.tsx` |
| CsmKanbanBoard | `components/csm-kanban/CsmKanbanBoard.tsx` |
| Menu AI prompts (frontend mirror) | `pages/system/menu/ai-prompts/menu-design-system.ts` |
| MenuQualityGate | `MenuQualityGateService.java` |
