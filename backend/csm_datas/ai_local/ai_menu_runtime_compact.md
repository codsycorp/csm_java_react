# CSM Menu Runtime — Compact Digest (Comprehend / SYSTEM_MASTER)

Version: 1.0 — dùng cho Pass 1 BusinessSpec (cap ~2400 chars).

## Luồng admin thực tế

- **Quản lý hệ thống → Quản lý menu** (`AiMenuDesigner`, `contextType=menu_json`, `flowType=menu_manager`): AI sửa JSON menu → `saveMenuStruct` → sidebar `/system/grid/:menuId`.
- **Quản lý hệ thống → Trình biên tập mã** (`CodeEditor`, `contextType=code`, `flowType=code_editor`): AI sửa JS trong `sys_autos`, **không** sinh menu JSON.

## AdminPage dispatch (ưu tiên, file `admin/index.tsx`)

1. `type_form=6` hoặc có `kanban_config` → **CsmKanbanBoard**
2. `auto_code_name` hoặc `type_form=4` → **DynamicCodeMenu**
3. `report_name` + (`type_form=5` hoặc `trigger.report_db`) → **CsmReport**
4. `type_form=2` + `nodes[]` → **CsmMasterDetail** (master grid + tab detail)
5. `type_form=1` / `table_name` / `trigger.load_db` → **CsmDynamicGrid** + **CsmEditModal** (popup nếu `row_type_edit=0`)

## type_form bắt buộc

| type | Component | Bắt buộc |
|------|-----------|----------|
| 0 | Sidebar group | `children[]` không rỗng; **không** `table_name` |
| 1 | CsmDynamicGrid | `table_name`, `table[]` (f_*), `trigger` |
| 2 | CsmMasterDetail | master `table_name` + `nodes[]`; tab con: `table_name` = **tên field JSON array trong master** (không phải bảng DB riêng) |
| 3 | Router link | `dynamic_link_url` |
| 4 | DynamicCode | `auto_code_name` |
| 5/ report | CsmReport | `report_name`, `trigger.report_db`, `table[]` filter |
| 6 | CsmKanbanBoard | `kanban_config` + `table_name` + `table[]` cho modal sửa |

## Field schema (runtime chỉ đọc f_*)

- PK: `{f_name:"id",f_pkid:1,f_types:"ed",f_show:0,...}`
- Combo: `f_types` = co/coro/cbo/cp + **f_cbo_query** string (JSON query, options tĩnh, hoặc JS)
- Trigger trong object `trigger`: `load_db`, `beforeSave`, `update`, `report_db`, …

## Sai lầm hay gặp (AI tránh)

- Leaf `type_form=0` → click không mở gì
- Detail tab dùng bảng DB riêng thay vì field master → dùng 2 menu type_form=1 hoặc type_form=2 đúng pattern
- Combo `f_types="ed"` + f_cbo_query → select hỏng
- Thiếu `table[]` → grid trống cột

## Output greenfield

`{ "menu": [...], "notes": [], "warnings": [], "coverage_modules": [...] }`
