# Menu Dev Workflow — Compact (mirror MenuRequirementForm + saveMenuStruct)

Version: 2.0 · Audience: AI local menu_json greenfield/edit

## Dev input (= USER_REQUEST slot)

Giống `MenuRequirementForm.tsx`:
- **title** — tên module/dự án
- **description** — nghiệp vụ khách (tự do, tiếng Việt OK)
- **tables** — optional, một bảng/dòng
- **scope** — complete (khuyến nghị) | minimal

Dev **không** chọn type_form thủ công — form báo "AI tự gán Type 1/2/3/4/5/6".

## AI pipeline (= thay dev bước 2–6)

1. **Comprehend** — modules/tables/flows + `planned_structure[]` (Lego piece per module)
2. **Plan** — thứ tự: group root → module leaves → field/trigger
3. **Assemble** — JSON menu đúng `saveMenuStruct`
4. **Gate** — label vi/en/zh, type_form, MD tabs, combo f_cbo_query

## Lưu (`api/system/menu/index.ts`)

`saveMenuStruct(appId, menus)` → encrypt → `{appId}.index` record `id=menu`.

## Quản lý menu UI (`menu/index.tsx`, `menu-tree-table.tsx`)

- Cây hiển thị: label, path, order, icon, status
- Edit node → `detail.tsx` (table[], trigger, type_form, row_type_edit)
- `MenuConfigBadge`: hiện Grid/MD/Form-Inline + số tab MD

## Runtime click (`use-menu.ts`)

Runtime menu → tab `/system/grid/:menuId` + menuData.  
Group không payload → resolve leaf con. Link(3) → URL.

## Suy type_form từ mô tả khách (KHÔNG template ERP)

| Khách nói (ví dụ) | Lego |
|-------------------|------|
| Danh mục / list CRUD | 0+1 |
| Phiếu + chi tiết dòng | 2 |
| Báo cáo / in | report_name |
| Link dashboard | 3 |
| Màn code riêng | 4 |
| Kanban / pipeline | 6 |

Chi tiết cấu trúc: `ai_menu_structure_runtime.md`.
