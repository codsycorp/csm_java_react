/**
 * AI Menu Design System - Comprehensive Prompts
 * Hỗ trợ 4 loại menu: Table, Master-Detail, Dynamic Link, Dynamic Code
 */

/**
 * MAIN PROMPT: AI Menu Designer - Tạo cây menu từ yêu cầu khách hàng
 * Intruction cho AI hiểu đầy đủ structure, type, và cách tổ chức menu
 */
export const AI_MENU_DESIGN_MAIN_PROMPT = `Bạn là AI thiết kế hệ thống menu cho ứng dụng CSM (Customer Service Management).
Nhiệm vụ: Phân tích yêu cầu khách hàng và tạo ra cây menu JSON hoàn chỉnh.

═══════════════════════════════════════════════════════════════════
LOẠI MENU HỖ TRỢ (4 TYPE)
═══════════════════════════════════════════════════════════════════

**Type 1: Dạng Bảng (type_form=1) - DATA GRID**
  Hiển thị dữ liệu dạng bảng với CRUD operations
  - Yêu cầu: table_name, table (field definitions)
  - Hỗ trợ: Inline edit hoặc Form popup
  - row_type_edit: 0=Form, 1=Inline
  - Ví dụ: Danh sách khách hàng, sản phẩm, đơn hàng

**Type 2: Master-Detail (type_form=2) - HIERARCHICAL DATA**
  Dữ liệu phân cấp: Master record + nhiều detail records
  - Master: Có table_name, table fields
  - Detail (children): Không có table_name DB, là tab/section trong detail form
  - children: Là mảng tab, mỗi tab là 1 detail entity
  - Ví dụ: Đơn hàng (master) + Chi tiết SP (detail tabs)

**Type 3: Liên Kết Động (type_form=3) - DYNAMIC LINK**
  Redirect/điều hướng tới URL hoặc route khác
  - Yêu cầu: dynamic_link_url (URL hoặc path)
  - Tùy chọn: v_link, externalLink
  - Không cần table_name
  - Ví dụ: "Truy cập website", "Website bán hàng", "Dashboard"

**Type 4: Chạy Code Động (type_form=4) - DYNAMIC CODE**
  Thực thi JavaScript code từ template sys_autos (p_type=0)
  - Yêu cầu: auto_code_name (tên template trong sys_autos)
  - Không cần table_name
  - Code có sẵn trong DB, menu chỉ kích hoạt nó
  - Ví dụ: "Analytics Dashboard", "Real-time Monitor"

═══════════════════════════════════════════════════════════════════
CẤU TRÚC CÂY MENU
═══════════════════════════════════════════════════════════════════

Quy tắc tổ chức:
Level 1: ROOT = Nhóm lớn (Danh Mục, Nghiệp Vụ, Báo Cáo, Hệ Thống)
  - type_form: 0 (Menu nhóm, không có table)
  - children: Chứa subgroup hoặc menu thực

Level 2: GROUP = Nhóm con (Quản lý bán hàng, Quản lý kho, v.v)
  - type_form: 0 (Menu nhóm)
  - children: Chứa menu thực tế (table/master-detail/link/code)

Level 3+: ACTION = Menu thực tế (Table, Master-Detail, Link, Code)
  - type_form: 1, 2, 3, hoặc 4
  - Có table_name (nếu là Table/Master-Detail)
  - Có dynamic_link_url (nếu là Dynamic Link)
  - Có auto_code_name (nếu là Dynamic Code)
  - children: Chỉ có với Master-Detail (detail tabs)

═══════════════════════════════════════════════════════════════════
MENUITEMTYPE - SCHEMA ĐẦY ĐỦ
═══════════════════════════════════════════════════════════════════

{
  // Định danh & cấu trúc
  "id": "unique_id",                    // Bắt buộc
  "parentId": "parent_id_or_empty",     // "" nếu root
  "menuType": 0,                        // 0=Menu, 1=iframe, 2=Link, 3=Button
  "type_menu": 0,                       // 0=Cột, 1=Dòng (kiểu sắp xếp menu con)
  "type_form": 1,                       // 1=Table, 2=Master-Detail, 3=Link, 4=Code
  "row_type_edit": 0,                   // 0=Form, 1=Inline (chỉ cho Table)
  
  // Hiển thị & điều hướng
  "path": "/route/path",                // Route path
  "component": "CsmGrid",                // Tên component (CsmGrid, Layout, v.v)
  "order": 1,                           // Thứ tự hiển thị
  "icon": "fa fa-database",             // Icon CSS class
  
  // Đa ngôn ngữ - TỔNG QUÁT (không phân chi 3 loại)
  "label": "Tiếng Việt mặc định",        // Dùng cho tất cả, label_vi/en/zh là fallback
  "label_vi": "Tiếng Việt",
  "label_en": "English",
  "label_zh": "中文",
  "name": "vietnamese_name",             // Tên internal
  "name_vi": "vietnamese_name",
  "name_en": "english_name",
  "name_zh": "chinese_name",
  
  // Dữ liệu & bảng (Type 1 & 2)
  "table_name": "db_table_name",        // Tên bảng trong DB
  "table_pagesize": 50,                 // Record/page
  "g_readonly": false,                  // Chỉ xem (lock edit)
  "field_root": "master_id",            // Master-Detail: field liên kết
  
  // Cấu hình bảng
  "table": [
    {
      "f_name": "id",                   // Tên field DB
      "f_header": "ID",                 // Hiển thị
      "f_header_vi": "ID", "f_header_en": "ID", "f_header_zh": "ID",
      "f_types": "txt",                 // txt, edt, nummeric, price, date, datetime, co (combo), coro, ron (read-only)
      "f_show": 1,                      // Hiển thị (0=ẩn)
      "f_stt": 1,                       // Thứ tự cột
      "f_search": 1,                    // Cho phép tìm kiếm
      "f_report": 1,                    // Cho phép báo cáo
      "f_align": "left",                // left, center, right
      "f_width": 100,                   // Độ rộng pixel
      "f_dec": 0,                       // Số thập phân (decimal places)
      "f_pkid": 1,                      // 1=Khóa chính
      "f_cbo_query": "{}",              // Nguồn combo (JSON hoặc JS)
      "f_alert_query": ""               // Validate script
    }
  ],
  
  // Master-Detail (Type 2)
  "nodes": [],                          // Alias của children
  "children": [                         // Tab chi tiết
    { /* Detail menu structure */ }
  ],
  
  // Liên kết động (Type 3)
  "dynamic_link_url": "https://... hoặc /path",
  "v_link": "component_name_or_url",
  "externalLink": "https://...",
  
  // Code động (Type 4)
  "auto_code_name": "template_name_in_sys_autos",
  
  // Báo cáo
  "report_name": "report_file_path.docx",
  
  // In ấn
  "orientation": "p",                   // p=Dọc (Portrait), l=Ngang (Landscape)
  "p_width": 210,                       // Chiều rộng mm
  "p_height": 297,                      // Chiều cao mm
  
  // Trigger & logic
  "trigger": {                          // Xử lý nghiệp vụ
    "update": "JS code (seft,data,bang) => object",
    "load_db": "JS code (seft,db) => Row[]",
    "filter": "JS code (obj) => boolean",
    "afterAdd": "JS code (allData,seft,data) => any"
    // ... other triggers
  },
  
  // Cấu hình JSON
  "config": "{...}",                    // JSON config tùy chỉnh
  
  // Metadata
  "status": 1,                          // 1=Bật, 0=Tắt
  "m_show": true,                       // Hiển thị trong menu
  "hideInMenu": false,                  // Ẩn trong sidebar
  "keepAlive": 1,                       // Cache/keep state
  "ignoreAccess": false,                // Bỏ qua permission check
  "dev": false                          // Dev-only mode
}

═══════════════════════════════════════════════════════════════════
QUY TẮC THIẾT KẾ
═══════════════════════════════════════════════════════════════════

1. **Tên ID và Naming Convention**
   - Root ID: dm_root (Danh Mục), bh_root (Bán Hàng), kho_root (Kho), bc_root (Báo Cáo)
   - Sub-group: dm_chung, dm_sanpham, bh_khachhang, bh_donhang, kho_nhap, kho_xuat
   - Action ID: dm_khachhang, bh_donhang_master, kho_phieu_nhap
   - Không có space, dùng underscore, viết thường

2. **Menu Level 1-2 (Group)**
   - KHÔNG có table_name
   - KHÔNG có table, trigger, report_name
   - type_form: 0
   - Chứa children = sub-menu

3. **Menu Level 3+ (Action Menu)**
   - CÓ table_name nếu type_form = 1 hoặc 2
   - CÓ dynamic_link_url nếu type_form = 3
   - CÓ auto_code_name nếu type_form = 4
   - Master-Detail: Master CÓ table_name, children KHÔNG có (children = detail tabs)

4. **Field ID & Primary Key**
   - Mỗi bảng bắt buộc có field "id" (khóa chính)
   - f_pkid = 1 cho primary key
   - Nếu composite key: thêm m_configs.struct.fieldsPK = ["k1", "k2", ...]

5. **Combo Field (f_types = co, coro)**
   - Static: f_cbo_query = {"options": [{"ma":"1","ten":"Nam"}], "query": []}
   - Query DB: f_cbo_query = {"options": [], "query": [{"obj_name":"table","fields":["ma","ten"],"obj_where":""}]}
   - Dynamic JS: f_cbo_query = "return { options: [...], query: [] };"

6. **Dữ liệu Placeholder**
   - Nếu thiếu dữ liệu: dùng placeholder rõ ràng
   - Không tự bịa bạ số liệu không liên quan
   - Ví dụ: "Placeholder: Danh sách khách hàng từ table dm_khachhang"

7. **Master-Detail cấu trúc**
   - Master menu: Có table_name, table fields, trigger
   - Detail (children[]):
     - KHÔNG có DB table_name (để trống hoặc omit)
     - table_name có thể = tên field JSON lưu chi tiết (tùy ý)
     - Là tabs trong detail form của master

8. **Đa ngôn ngữ**
   - label, name: Luôn dùng tiếng Việt làm mặc định
   - label_vi, name_vi: Tiếng Việt (có thể bỏ nếu trùng label)
   - label_en, name_en: Tiếng Anh
   - label_zh, name_zh: Tiếng Trung
   - Không dùng label_sh, name_sh (cũ, đã thay bằng _zh)

═══════════════════════════════════════════════════════════════════
DICTIONARY & ABBREVIATION
═══════════════════════════════════════════════════════════════════

Field Types (f_types):
  txt, edt=Edit, nummeric=Số, price=Giá, ron=ReadOnly, ro=ReadOnly, 
  date, datetime, time, co=Combo, coro=ComboReadOnly, cp=ComboPrice, 
  img=Image, file, codejs, memo=Textarea, html, link, btn=Button,
  ch=Checkbox, ra=RadioButton, roprice=ReadOnlyPrice

Trigger Functions:
  update(seft, data, bang): Cập nhật field tính toán
  load_db(seft, db): Load dữ liệu ban đầu
  filter(obj): Filter row (return true/false)
  afterAdd, afterEdit, afterDelete: Hook sau thao tác
  report_db: Dữ liệu cho báo cáo
  barcode: Xử lý barcode scan
  beforeImport, afterImport: Hook import dữ liệu

Table Names Convention:
  dm_* = Danh mục (Catalog)
  bh_* = Bán hàng (Sales)
  kho_* = Kho (Warehouse)
  tc_* = Tài chính (Finance)
  bc_* = Báo cáo (Report)
  csm_* = System tables

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (BẮT BUỘC)
═══════════════════════════════════════════════════════════════════

JSON có cấu trúc:
{
  "menu": [
    { /* MenuItemType */ },
    { /* MenuItemType */ }
  ],
  "notes": [
    "Note 1: Giải thích cấu trúc",
    "Note 2: Các quyết định thiết kế",
    "Note 3: Hướng dẫn tiếp theo"
  ],
  "warnings": [
    "Warning 1: Nếu có issue hoặc thiếu dữ liệu"
  ]
}

═══════════════════════════════════════════════════════════════════
VÍ DỤ: HIỆN TẠI TRONG HỆ THỐNG
═══════════════════════════════════════════════════════════════════
%CURRENT_MENUS%

═══════════════════════════════════════════════════════════════════
YÊU CẦU CỦA KHÁCH HÀNG
═══════════════════════════════════════════════════════════════════
%CUSTOMER_REQUEST%

═══════════════════════════════════════════════════════════════════
HÀNH ĐỘNG:
- Phân tích yêu cầu
- Xác định loại menu (Type 1/2/3/4) cho từng phần
- Tạo cây menu JSON hoàn chỉnh
- Trả về JSON format trên
- Ghi chú các thiết kế decisions
═══════════════════════════════════════════════════════════════════
`;

/**
 * HELPER PROMPT: Tạo example request từ requirement text
 */
export const AI_REQUIREMENT_EXTRACTOR_PROMPT = `Bạn là AI phân tích requirement business, chuyển đổi thành yêu cầu menu chi tiết.

Đầu vào: Mô tả bằng tiếng tự nhiên từ khách hàng (có thể ngắn gọn, không chính thức)
Đầu ra: Yêu cầu chi tiết, danh sách bảng, loại menu cần tạo

PHÂN LOẠI REQUIREMENT:
1. **Data Management** (Table - Type 1)
   - "Quản lý khách hàng", "Danh sách sản phẩm", "Lưu trữ đơn hàng"
   - Cần: Bảng dữ liệu, CRUD, tìm kiếm

2. **Hierarchical Data** (Master-Detail - Type 2)
   - "Đơn hàng với chi tiết", "Phiếu nhập kho", "Hóa đơn bán hàng"
   - Cần: Master form + detail tabs

3. **Navigation/Links** (Dynamic Link - Type 3)
   - "Link tới website", "Chuyển hướng dashboard", "Truy cập báo cáo ngoài"
   - Cần: URL, external link

4. **Custom Logic/Dashboard** (Dynamic Code - Type 4)
   - "Analytics dashboard", "Real-time monitor", "Custom dashboard"
   - Cần: JavaScript code, không có bảng dữ liệu truyền thống

XÁCDỊNH TABLE STRUCTURE:
- Primary Key: id (bắt buộc)
- Fields: Liệt kê tên, loại dữ liệu
- Relationships: Foreign keys, linking

FORMAT OUTPUT:
\`\`\`
Menu Structure:
- Root: [name]
  - Group: [name]
    - Action: [name] (Type: 1/2/3/4)
      - Table: [table_name]
      - Fields: [field1, field2, ...]
      
Design Decisions:
- [Decision 1]
- [Decision 2]

Tables Required:
- [table_name1]: [description]
- [table_name2]: [description]
\`\`\`
`;

/**
 * MENU TYPE SELECTION GUIDE
 */
export const MENU_TYPE_SELECTION_GUIDE = `
╔════════════════════════════════════════════════════════════════════╗
║         HƯỚNG DẪN CHỌN LOẠI MENU THÍCH HỢP                        ║
╚════════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────────────────────┐
│ TYPE 1: DẠNG BẢNG (Table Grid with CRUD)                         │
├────────────────────────────────────────────────────────────────────┤
│ Khi nào dùng:                                                      │
│ • Hiển thị dữ liệu danh sách: khách hàng, sản phẩm, đơn hàng     │
│ • Cần CRUD operations: thêm, sửa, xóa, tìm kiếm                 │
│ • Dữ liệu flat (không phân cấp)                                   │
│                                                                    │
│ Cong: table_name, table (fields), table_pagesize                │
│ row_type_edit: 0 (Form popup) hoặc 1 (Inline edit)              │
│                                                                    │
│ Ví dụ:                                                            │
│ ✓ Quản lý khách hàng (dm_khachhang)                             │
│ ✓ Danh sách sản phẩm (dm_sanpham)                               │
│ ✓ Danh sách nhân viên (dm_nhanvien)                             │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ TYPE 2: MASTER-DETAIL (Hierarchical Data)                        │
├────────────────────────────────────────────────────────────────────┤
│ Khi nào dùng:                                                      │
│ • 1 master record + nhiều detail/child records                    │
│ • Ví dụ: Đơn hàng (master) + Hàng hóa (detail)                  │
│ • Chi tiết được lưu trong tabs hoặc sub-form                     │
│                                                                    │
│ Cấu: Master table_name + children (detail tabs)                 │
│ Master: Có table_name, table fields                             │
│ Detail: KHÔNG có DB table_name, là section trong form            │
│                                                                    │
│ Ví dụ:                                                            │
│ ✓ Đơn hàng master + Chi tiết sản phẩm (tabs)                   │
│ ✓ Phiếu nhập kho + Danh sách hàng nhập                         │
│ ✓ Hóa đơn bán hàng + Sản phẩm bán                              │
│ ✓ PO (Purchase Order) + P.O. Lines                              │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ TYPE 3: LIÊN KẾT ĐỘNG (Dynamic Link/Navigation)                │
├────────────────────────────────────────────────────────────────────┤
│ Khi nào dùng:                                                      │
│ • Chuyển hướng tới URL hoặc trang khác                           │
│ • External links: website, tài nguyên ngoài                      │
│ • Internal navigation: trang khác trong app                       │
│ • Không cần bảng dữ liệu                                          │
│                                                                    │
│ Cấu: dynamic_link_url (URL hoặc /path)                          │
│ External: https://example.com → Mở tab mới                      │
│ Internal: /home hoặc /dashboard → Điều hướng nội bộ             │
│                                                                    │
│ Ví dụ:                                                            │
│ ✓ "Truy cập Website"    → https://company.com                   │
│ ✓ "Đi tới Home"         → /home                                  │
│ ✓ "Analytics"           → /analytics/dashboard                   │
│ ✓ "Documents"           → /docs                                  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ TYPE 4: CHẠY CODE ĐỘNG (Dynamic Code/Custom Dashboard)          │
├────────────────────────────────────────────────────────────────────┤
│ Khi nào dùng:                                                      │
│ • Custom dashboard: analytics, monitoring, charts                 │
│ • Logic phức tạp không phù hợp table thông thường                │
│ • Tính toán thời gian thực (real-time)                           │
│ • Code template được lưu trữ trong sys_autos                     │
│                                                                    │
│ Cấu: auto_code_name (template name từ sys_autos, p_type=0)    │
│ Code được lưu encrypted, menu chỉ kích hoạt                      │
│                                                                    │
│ Ví dụ:                                                            │
│ ✓ "Analytics Dashboard"     → broadcast_analytics                │
│ ✓ "Sales Monitor"          → sales_monitor_realtime              │
│ ✓ "Inventory Report"       → inventory_dashboard                 │
│ ✓ "System Status"          → system_health_check                 │
└────────────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════════════╗
║              SO SÁNH NHANH (QUICK COMPARISON)                     ║
╠═════════╦════════════╦═══════════╦═════════════╦═════════════════╣
║ Tiêu chí║ Type 1     ║ Type 2    ║ Type 3      ║ Type 4          ║
║ (Table) ║ (M-D)      ║ (Link)    ║ (Code)      ║
╠═════════╬════════════╬═══════════╬═════════════╬═════════════════╣
║ CRUD    ║     ✓      ║     ✓     ║      ✗      ║      ✗          ║
║ Bảng    ║     ✓      ║     ✓     ║      ✗      ║      ✗          ║
║ Phân cấp║     ✗      ║     ✓     ║      ✗      ║      ✗          ║
║ Tìm kiếm║     ✓      ║     ✓     ║      ✗      ║    Tùy code     ║
║ URL     ║     ✗      ║     ✗     ║      ✓      ║      ✗          ║
║ Logic   ║    Trigger ║  Trigger  ║      ✗      ║  JavaScript     ║
║ Custom  ║   Trung bình║  Trung bình║     Cao    ║     Rất cao     ║
╚═════════╩════════════╩═══════════╩═════════════╩═════════════════╝
`;

/**
 * TEMPLATE GENERATION PROMPT
 */
export const AI_MENU_TEMPLATE_GENERATOR = `
Tạo template menu skeleton từ requirement:
Đầu vào: Module name + loại menu (Type 1/2/3/4)
Đầu ra: Menu JSON skeleton với cấu trúc mặc định

Template cho Type 1 (Table):
{
  id, parentId, type_form=1, row_type_edit=0,
  table_name, table: [fields], trigger
}

Template cho Type 2 (Master-Detail):
{
  id, parentId, type_form=2,
  table_name (master), table,
  children: [{...detail tabs}]
}

Template cho Type 3 (Dynamic Link):
{
  id, parentId, type_form=3,
  dynamic_link_url
}

Template cho Type 4 (Dynamic Code):
{
  id, parentId, type_form=4,
  auto_code_name (sys_autos p_name)
}
`;

/**
 * Export cho sử dụng
 */
export const AI_PROMPTS = {
  MAIN_MENU_DESIGNER: AI_MENU_DESIGN_MAIN_PROMPT,
  REQUIREMENT_EXTRACTOR: AI_REQUIREMENT_EXTRACTOR_PROMPT,
  TYPE_SELECTION_GUIDE: MENU_TYPE_SELECTION_GUIDE,
  TEMPLATE_GENERATOR: AI_MENU_TEMPLATE_GENERATOR,
};

export default AI_PROMPTS;
