// ─── Column definitions (stored in m_configs) ────────────────────────────────

export interface LiColumnDef {
  name: string;
  label: string;
  label_en?: string;
  label_zh?: string;
  /** "text" | "number" | "price" | "select" | "formula" | "formula_or_manual" */
  type: string;
  options?: string;          // select options: "m2|m|cái"
  formula?: string;          // JS expression; field names of same row are variables
  manual_condition?: string; // JS condition: if true → allow manual entry instead of formula
  width?: number;
  align?: "left" | "right" | "center";
  hidden?: boolean;          // exclude column from form (still computed)
}

// ─── Group config (stored in m_configs.line_items_group) ─────────────────────

export interface LiGroupConfig {
  spec_field?: string;       // column that holds multi-line spec text (default "spec")
  vat_field?: string;        // column that holds VAT rate (default "vat_rate")
  vat_default?: number;      // default VAT for new groups (default 10)
  vat_options?: Array<{ value: number; label: string }>;
  label_prefix?: string;     // "nhóm " → label = "nhóm I", etc.
  /** Template dòng cộng nhóm: {{group}}, {{vat}} */
  subtotal_label?: string;
}

/** Lọc danh sách theo giai đoạn / trạng thái (menu Bán hàng tách BG | LSXNB | PXK) */
export interface LineItemsListFilter {
  field: string;
  values: string[];
}

/** Nhãn UI runtime — cấu hình trong menu designer tab Dòng hàng */
export interface LineItemsUiConfig {
  header_title?: string;
  header_title_en?: string;
  header_title_zh?: string;
  create_label?: string;
  create_label_en?: string;
  create_label_zh?: string;
  edit_label?: string;
  edit_label_en?: string;
  edit_label_zh?: string;
  back_label?: string;
  back_label_en?: string;
  back_label_zh?: string;
  list_title?: string;
  list_title_en?: string;
  list_title_zh?: string;
  /** Trường ngày tham chiếu khi sinh số tự động (mặc định: field date đầu tiên) */
  date_ref_field?: string;
  /** Nhóm field header theo thứ tự tổng hợp → chi tiết */
  field_sections?: LiFieldSection[];
  /** Lọc hàng danh sách (AND giữa các filter) */
  list_filter?: LineItemsListFilter[];
  /** Giá trị header mặc định khi tạo mới (vd. giai_doan) */
  default_header?: Record<string, any>;
  /** Chỉ hiện nút in có trigger_key trong danh sách */
  print_keys?: string[];
}

export interface LiFieldSection {
  key: string;
  label?: string;
  label_en?: string;
  label_zh?: string;
  fields: string[];
}

// ─── Totals config (stored in m_configs.line_items_totals) ────────────────────

export interface LiTotalConfig {
  key: string;              // "A" | "B" | "C" | "D" | any identifier
  label: string;
  label_en?: string;
  label_zh?: string;
  /**
   * Formula using these built-in vars:
   *   groupSum          → sum of all groups' total_thanh_tien
   *   vatSum(rate)       → sum of thanh_tien for groups with vat_rate === rate
   *   A, B, C, D, ...   → previously computed total values (top-down)
   * Example: "vatSum(8) * 0.08"
   */
  formula: string;
  highlight?: boolean;
  show_words?: boolean;     // show amount-in-words below this row
}

// ─── Print template config (stored in m_configs.line_items_print) ────────────

export interface LiPrintConfig {
  label: string;            // button label shown in UI
  label_en?: string;
  label_zh?: string;
  trigger_key: string;      // key inside m_configs.trigger
  /**
   * JS function body stored in m_configs.trigger[trigger_key].
   * Receives: (order, groups, calc, utils)
   *   order  → header field values from the form
   *   groups → array of {spec, vat_rate, items:[{...colValues, _kl, _tt}]}
   *   calc   → {totals: Record<key, number>, groups: Record<groupId, {sum, kl}>}
   *   utils  → {fmtVND, fmtNum, soThanhChu, groupLabel}
   * Must return: HTML string (full document)
   */
  filename_expr?: string;   // JS expression for file name, vars: order, calc
}

export interface LineItemsListColumn {
  field: string;
  label?: string;
  label_en?: string;
  label_zh?: string;
  width?: number;
}

// ─── Full editor config (embedded in m_configs) ───────────────────────────────

export interface LineItemsEditorConfig {
  /** DB table for CRUD list + save */
  table_name?: string;
  /** Primary key fields — default ["id"] */
  struct?: { fieldsPK?: string[] };
  /** Menu label (optional) */
  label?: string;
  /** Header field definitions — same format as CsmDynamicGrid m_configs.table */
  table?: any[];
  /** JSON column storing line-item groups — default payload_json */
  line_items_data_field?: string;
  /** Key inside JSON payload for groups array — default groups */
  line_items_groups_key?: string;
  /** Columns shown in list view; defaults to first visible table fields */
  line_items_list?: LineItemsListColumn[];
  /** Line item column definitions */
  line_items_columns?: LiColumnDef[];
  /** Group behaviour config */
  line_items_group?: LiGroupConfig;
  /** Totals/summary rows */
  line_items_totals?: LiTotalConfig[];
  /** Print buttons */
  line_items_print?: LiPrintConfig[];
  /** Nhãn form / danh sách (tuỳ chọn — mặc định theo i18n) */
  line_items_ui?: LineItemsUiConfig;
  /**
   * JS function bodies, possibly encrypted.
   * Keys match line_items_print[i].trigger_key.
   * Function signature: (order, groups, calc, utils) => string (HTML)
   */
  trigger?: Record<string, string>;
  [key: string]: any;
}

// ─── Runtime data types ───────────────────────────────────────────────────────

export interface LineItem {
  key: string;
  [col: string]: any;  // dynamic columns from LiColumnDef
}

export interface ProductGroup {
  id: string;
  spec: string;
  vat_rate: number;
  items: LineItem[];
}

export interface OrderHeader {
  [field: string]: any;
}

export interface GroupCalcResult {
  sum: number;               // sum of the "total" column (last formula col)
  kl: number;                // sum of the "kl" column (second-last formula col)
  so_tam: number;
  uniform_price: number | null;
}

export interface EditorCalcResult {
  totals: Record<string, number>;   // keyed by LiTotalConfig.key
  groups: Record<string, GroupCalcResult>;  // keyed by group.id
}
