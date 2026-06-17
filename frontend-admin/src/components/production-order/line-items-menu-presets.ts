/**
 * Preset từng menu lá PM (khớp menu.json) — dùng trên Menu Designer, KHÔNG hardcode runtime.
 *
 * Luồng sống:
 *   PDF mẫu → tab Nút in PDF (Áp mẫu / AI) → trigger trong DB
 *   + preset menu → line_items_print / line_items_ui / print_keys
 *   menu.json = backup/seed Git; runtime đọc m_configs từ DB sau khi Lưu menu.
 */
import type { LiPrintConfig, LineItemsUiConfig } from "./types";
import { PHUSON_PANEL_CONFIG } from "./defaultConfig";

export type PhusonMenuPresetId = "pm_bao_gia" | "pm_lsx_nb" | "pm_lsx_pxk";

export interface PhusonMenuPreset {
  id: PhusonMenuPresetId;
  label: string;
  /** Trigger keys cần có trong tab Trigger (body lấy từ PHUSON_PANEL_CONFIG.trigger) */
  trigger_keys: string[];
  line_items_print: LiPrintConfig[];
  line_items_ui: LineItemsUiConfig;
}

const SHARED_FIELD_SECTIONS_BG = [
  {
    key: "bg",
    label: "Báo giá — thông tin chung",
    label_en: "Quote — header",
    fields: [
      "ngay", "so_bao_gia", "hieu_luc_den", "khach_hang_id", "khach_hang",
      "dia_chi_kh", "nguoi_lien_he", "nvkd", "phi_vc",
    ],
  },
  {
    key: "flow",
    label: "Quy trình BG → LSXNB → LSX-PXK",
    label_en: "Workflow",
    fields: ["giai_doan", "trang_thai_bg", "phien_ban", "so_lenh"],
  },
] as LineItemsUiConfig["field_sections"];

const LSX_FIELD_SECTION = {
  key: "lsx",
  label: "LSX nội bộ — điều kiện giao hàng",
  label_en: "Production — delivery",
  fields: [
    "ngay_nghiem_thu", "van_chuyen_nd", "thong_tin_sp", "phieu_giao",
    "thoi_gian_giao", "nguoi_nhan", "dia_diem_giao", "thanh_toan_nd", "ghi_chu_giao",
  ],
};

const BASE_UI: LineItemsUiConfig = {
  header_title: "Thông tin đơn hàng",
  create_label: "Tạo mới",
  edit_label: "Chỉnh sửa",
  back_label: "← Danh sách",
  date_ref_field: "ngay",
};

/** 3 preset menu lá — mirror menu.json pm_bao_gia | pm_lsx_nb | pm_lsx_pxk */
export const PHUSON_MENU_PRESETS: Record<PhusonMenuPresetId, PhusonMenuPreset> = {
  pm_bao_gia: {
    id: "pm_bao_gia",
    label: "Báo giá",
    trigger_keys: ["print_bao_gia", "auto_parse_so_bao_gia", "auto_format_so_bao_gia"],
    line_items_print: [{
      label: "Xuất Báo giá",
      trigger_key: "print_bao_gia",
      filename_expr: "`BaoGia_${order.so_bao_gia || 'draft'}.pdf`",
      print_table: { showPrice: true, showGroupSubtotal: true },
    }],
    line_items_ui: {
      ...BASE_UI,
      list_title: "Báo giá",
      list_title_en: "Quotation",
      field_sections: SHARED_FIELD_SECTIONS_BG,
      list_filter: [{ field: "giai_doan", values: ["nhap", "bao_gia"] }],
      default_header: { giai_doan: "bao_gia", trang_thai_bg: "nhap" },
      print_keys: ["print_bao_gia"],
    },
  },
  pm_lsx_nb: {
    id: "pm_lsx_nb",
    label: "Lệnh sản xuất nội bộ",
    trigger_keys: ["print_lenh_sx", "auto_parse_so_bao_gia", "auto_format_so_bao_gia", "auto_parse_so_lenh", "auto_format_so_lenh"],
    line_items_print: [{
      label: "Xuất Lệnh SX nội bộ",
      trigger_key: "print_lenh_sx",
      filename_expr: "`LenhSX_${order.so_lenh || 'draft'}.pdf`",
      print_table: { showPrice: true, showGroupSubtotal: true },
    }],
    line_items_ui: {
      ...BASE_UI,
      list_title: "Lệnh sản xuất nội bộ",
      list_title_en: "Internal production order",
      field_sections: [...(SHARED_FIELD_SECTIONS_BG ?? []), LSX_FIELD_SECTION],
      list_filter: [{ field: "giai_doan", values: ["lenh_sx_nb"] }],
      default_header: { giai_doan: "lenh_sx_nb" },
      print_keys: ["print_lenh_sx"],
    },
  },
  pm_lsx_pxk: {
    id: "pm_lsx_pxk",
    label: "Lệnh SX kiêm phiếu xuất kho",
    trigger_keys: ["print_pxk", "auto_parse_so_bao_gia", "auto_format_so_bao_gia", "auto_parse_so_lenh", "auto_format_so_lenh"],
    line_items_print: [{
      label: "Xuất Lệnh SX + PXK",
      trigger_key: "print_pxk",
      filename_expr: "`LenhSX_PXK_${order.so_lenh || 'draft'}.pdf`",
      print_table: {
        showPrice: false,
        showGroupSubtotal: false,
        hideColumns: ["chieu_rong", "don_gia", "thanh_tien"],
      },
    }],
    line_items_ui: {
      ...BASE_UI,
      list_title: "Lệnh sản xuất kiêm phiếu xuất kho",
      list_title_en: "Production + delivery note",
      field_sections: [...(SHARED_FIELD_SECTIONS_BG ?? []), LSX_FIELD_SECTION],
      list_filter: [{ field: "giai_doan", values: ["lenh_sx_pxk", "xuong"] }],
      default_header: { giai_doan: "lenh_sx_pxk" },
      print_keys: ["print_pxk"],
    },
  },
};

/** Lấy trigger bodies từ defaultConfig (cùng nội dung printTemplates → HTML string). */
export function resolvePhusonPresetTriggers(presetId: PhusonMenuPresetId): Record<string, string> {
  const preset = PHUSON_MENU_PRESETS[presetId];
  const src = PHUSON_PANEL_CONFIG.trigger ?? {};
  const out: Record<string, string> = {};
  for (const key of preset.trigger_keys) {
    const body = (src as Record<string, string | undefined>)[key];
    if (body) out[key] = body;
  }
  return out;
}

/** Gộp preset menu + config dòng hàng chung (cột, tổng, workflow). */
export function buildPhusonMenuConfig(presetId: PhusonMenuPresetId) {
  const preset = PHUSON_MENU_PRESETS[presetId];
  return {
    line_items_data_field: PHUSON_PANEL_CONFIG.line_items_data_field,
    line_items_groups_key: PHUSON_PANEL_CONFIG.line_items_groups_key,
    line_items_list: PHUSON_PANEL_CONFIG.line_items_list,
    line_items_columns: PHUSON_PANEL_CONFIG.line_items_columns,
    line_items_group: PHUSON_PANEL_CONFIG.line_items_group,
    line_items_totals: PHUSON_PANEL_CONFIG.line_items_totals,
    line_items_workflow: PHUSON_PANEL_CONFIG.line_items_workflow,
    line_items_print: preset.line_items_print,
    line_items_ui: preset.line_items_ui,
    table: PHUSON_PANEL_CONFIG.table,
    table_name: PHUSON_PANEL_CONFIG.table_name,
    trigger: resolvePhusonPresetTriggers(presetId),
  };
}

export const PHUSON_PRESET_OPTIONS = Object.values(PHUSON_MENU_PRESETS).map(p => ({
  value: p.id,
  label: p.label,
}));
