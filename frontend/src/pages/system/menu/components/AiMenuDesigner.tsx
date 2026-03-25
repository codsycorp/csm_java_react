import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Divider, Input, message, Radio, Space } from "antd";
import type { RadioChangeEvent } from "antd";
import { useTranslation } from "react-i18next";

import type { MenuItemType } from "#src/api/system/menu";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { AI_PROMPTS } from "../ai-prompts/menu-design-system";

const { TextArea } = Input;

type MergeMode = "merge" | "replace";

type AiRequestRecord = {
  id?: string;
  app_id_target: string;
  request_text?: string;
  request_history?: string;
  last_prompt?: string;
  last_result?: string;
  updated_at?: number;
  created_at?: number;
};

type AiMenuDesignerProps = {
  appId?: string;
  currentMenus?: MenuItemType[];
  onApply: (menus: MenuItemType[]) => Promise<void>;
};

type MenuValidationIssue = {
  severity: "error" | "warning";
  rule: string;
  path: string;
  message: string;
};

const AI_REQUEST_TABLE = "csm_ai_menu_requests";

const TRIGGER_CODE_TEMPLATES: Record<string, string> = {
  validate_order_debt_limit: `const customerId = data.id_khachhang || data.id_kh || data.khachhang_id;
if (!customerId) return data;

const customers = bang?.dm_doituong?.rows || [];
const customer = customers.find((r) => String(r.id) === String(customerId));
if (!customer) return data;

const debtLimit = Number(customer.han_muc_no || 0);
if (!debtLimit || debtLimit <= 0) return data;

const currentDebt = Number(customer.con_no || customer.tong_no || 0);
const orderValue = Number(data.tong_tien || data.so_tien_no || 0);

if (currentDebt + orderValue > debtLimit) {
  throw new Error("Vuot han muc no cua khach hang");
}

return data;`,

  update_order_total: `const orderId = data.id || data.id_donhang || data.id_don_hang;
if (!orderId) return {};

const details = bang?.bh_donhang_chitiet?.rows || bang?.bh_donhang_ct?.rows || [];
const rows = details.filter((r) => {
  const refId = r.id_donhang || r.id_don_hang || r.order_id;
  return String(refId) === String(orderId);
});

const tong_tien = rows.reduce((sum, r) => {
  const line = Number(r.thanh_tien ?? (Number(r.so_luong || 0) * Number(r.don_gia || 0)));
  return sum + line;
}, 0);

const da_thanh_toan = Number(data.da_thanh_toan || 0);
return {
  tong_tien,
  con_no: Math.max(tong_tien - da_thanh_toan, 0),
};`,

  recalculate_order_total: `const orderId = data.id_donhang || data.id_don_hang || data.order_id;
if (!orderId) return {};

const details = bang?.bh_donhang_chitiet?.rows || bang?.bh_donhang_ct?.rows || [];
const rows = details.filter((r) => {
  const refId = r.id_donhang || r.id_don_hang || r.order_id;
  return String(refId) === String(orderId);
});

const tong_tien = rows.reduce((sum, r) => {
  const line = Number(r.thanh_tien ?? (Number(r.so_luong || 0) * Number(r.don_gia || 0)));
  return sum + line;
}, 0);

return { tong_tien };`,

  validate_order_item_stock: `const qty = Number(data.so_luong || 0);
if (qty <= 0) throw new Error("So luong phai lon hon 0");

const productId = data.id_sanpham || data.id_sp;
if (!productId) return data;

const products = bang?.dm_sanpham?.rows || [];
const product = products.find((r) => String(r.id) === String(productId));
if (!product) return data;

const stock = Number(product.ton_kho_hien_tai ?? product.ton_kho ?? 0);
if (qty > stock) {
  throw new Error("Khong du ton kho cho san pham");
}

return {
  ...data,
  thanh_tien: Number(data.don_gia || 0) * qty,
};`,

  validate_delivery_item_stock: `const qty = Number(data.so_luong || 0);
if (qty <= 0) throw new Error("So luong xuat phai lon hon 0");

const productId = data.id_sanpham || data.id_sp;
if (!productId) return data;

const products = bang?.dm_sanpham?.rows || [];
const product = products.find((r) => String(r.id) === String(productId));
if (!product) return data;

const stock = Number(product.ton_kho_hien_tai ?? product.ton_kho ?? 0);
if (qty > stock) {
  throw new Error("Ton kho khong du de xuat");
}

return {
  ...data,
  thanh_tien: Number(data.don_gia || 0) * qty,
};`,

  validate_receipt_item_quantity: `const qty = Number(data.so_luong || 0);
if (qty <= 0) throw new Error("So luong nhap phai lon hon 0");

const don_gia = Number(data.don_gia || 0);
return {
  ...data,
  thanh_tien: don_gia * qty,
};`,

  update_stock_on_delivery: `const productId = data.id_sanpham || data.id_sp;
if (!productId) return {};

const qty = Number(data.so_luong || 0);
if (qty <= 0) return {};

const products = bang?.dm_sanpham?.rows || [];
const product = products.find((r) => String(r.id) === String(productId));
if (!product) return {};

const currentStock = Number(product.ton_kho_hien_tai ?? product.ton_kho ?? 0);
return {
  ton_kho_hien_tai: Math.max(currentStock - qty, 0),
};`,

  update_stock_on_receipt: `const productId = data.id_sanpham || data.id_sp;
if (!productId) return {};

const qty = Number(data.so_luong || 0);
if (qty <= 0) return {};

const products = bang?.dm_sanpham?.rows || [];
const product = products.find((r) => String(r.id) === String(productId));
if (!product) return {};

const currentStock = Number(product.ton_kho_hien_tai ?? product.ton_kho ?? 0);
return {
  ton_kho_hien_tai: currentStock + qty,
};`,
};

function isLikelyExecutableCode(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  return /\n|;|\breturn\b|=>|\bif\b|\bthrow\b|\bconst\b|\blet\b|\bfunction\b/.test(v);
}

function isPlainObject(value: any): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSelectOption(option: any): Record<string, any> {
  if (isPlainObject(option)) {
    const ma = option.ma ?? option.value ?? option.id ?? "";
    const ten = option.ten ?? option.label ?? option.text ?? option.name ?? String(ma || "");
    return { ...option, ma, ten };
  }
  return {
    ma: option,
    ten: String(option ?? ""),
  };
}

function normalizeComboQueryValue(rawValue: any, fName: string, fTypes: string): string {
  const isComboField = /co|coro|cbo/i.test(String(fTypes || ""));
  if (!isComboField) return String(rawValue ?? "");

  const fallback = JSON.stringify({ options: [], query: [] });
  if (rawValue == null || rawValue === "") return fallback;

  if (Array.isArray(rawValue)) {
    return JSON.stringify({
      options: rawValue.map(normalizeSelectOption),
      query: [],
    });
  }

  if (isPlainObject(rawValue)) {
    if (Array.isArray(rawValue.query) || Array.isArray(rawValue.options)) {
      const normalized = {
        ...rawValue,
        options: Array.isArray(rawValue.options) ? rawValue.options.map(normalizeSelectOption) : [],
        query: Array.isArray(rawValue.query) ? rawValue.query : [],
      };
      return JSON.stringify(normalized);
    }

    if (typeof rawValue.obj_name === "string" && rawValue.obj_name.trim()) {
      return JSON.stringify({
        options: [],
        query: [{
          obj_name: rawValue.obj_name.trim(),
          fields: Array.isArray(rawValue.fields) && rawValue.fields.length > 0 ? rawValue.fields : ["id", "name"],
          obj_where: rawValue.obj_where || { field: "id", type: "like", value: "" },
          ...(rawValue.app_id ? { app_id: rawValue.app_id } : {}),
        }],
      });
    }

    return fallback;
  }

  const text = String(rawValue || "").trim();
  if (!text) return fallback;

  if (/^[a-z0-9_]+$/i.test(text) && !text.includes("return")) {
    return JSON.stringify({
      options: [],
      query: [{
        obj_name: text,
        fields: ["id", "name"],
        obj_where: { field: "id", type: "like", value: "" },
      }],
    });
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return normalizeComboQueryValue(parsed, fName, fTypes);
    } catch {
      try {
        const fn = new Function(`return (${text})`);
        const parsed = fn();
        return normalizeComboQueryValue(parsed, fName, fTypes);
      } catch {
        return text;
      }
    }
  }

  return text;
}

function normalizeTriggerKeyName(key: string): string {
  const raw = String(key || "").trim();
  if (!raw) return raw;

  const aliasMap: Record<string, string> = {
    beforeSave: "before_save",
    afterSave: "after_save",
    beforeDelete: "before_delete",
    afterDelete: "after_delete",
    loadDb: "load_db",
    loadTableDb: "load_table_db",
    reportDb: "report_db",
    beforeImport: "beforeImport",
    afterImport: "afterImport",
  };
  if (aliasMap[raw]) return aliasMap[raw];

  return raw
    .replace(/[\s-]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function normalizeTriggerCodeValue(triggerKey: string, rawValue: any): any {
  if (typeof rawValue !== "string") return rawValue;
  const value = rawValue.trim();
  if (!value) return value;
  if (isLikelyExecutableCode(value)) return value;

  const template = TRIGGER_CODE_TEMPLATES[value];
  if (template) return template;

  // Fallback templates by trigger phase so AI symbolic output still executes safely.
  if (triggerKey === "before_save" || triggerKey === "before_delete") {
    return `return data;`;
  }
  if (triggerKey === "after_save" || triggerKey === "after_delete") {
    return `return {};`;
  }
  return value;
}

function createMenuExample(): MenuItemType[] {
  return [
    {
      id: "dm_1",
      label: "Danh mục",
      m_icons: "fa fa-database",
      m_show: true,
      menu_id: "1",
      children: [
        {
          id: "dm_kh",
          parentId: "dm_1",
          label: "Khách hàng",
          m_icons: "fa fa-users",
          m_show: true,
          menu_id: "1.1",
          type_form: 1,
          table_name: "dm_khachhang",
          table_pagesize: 50,
          trigger: {
            before_save: "validate_customer",
            after_save: "update_customer_stats"
          },
          table: [
            { f_name: "id", f_header: "ID", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "150" },
            { f_name: "ma_kh", f_header: "Mã KH", f_types: "ed", f_pkid: 1, f_show: 1, f_width: "120" },
            { f_name: "ten_kh", f_header: "Tên KH", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "250" }
          ]
        },
        {
          id: "bh_dh",
          parentId: "dm_1",
          label: "Đơn hàng",
          m_icons: "fa fa-shopping-cart",
          m_show: true,
          menu_id: "1.2",
          type_form: 2,
          table_name: "bh_donhang",
          table_pagesize: 50,
          field_root: "id_don_hang",
          trigger: {
            before_save: "validate_order",
            after_save: "calculate_order_total",
            before_delete: "check_order_status"
          },
          table: [
            { f_name: "id", f_header: "ID", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "150" },
            { f_name: "ma_dh", f_header: "Mã ĐH", f_types: "ro", f_pkid: 1, f_show: 1, f_width: "120" },
            { f_name: "ngay_ct", f_header: "Ngày CT", f_types: "date", f_pkid: 0, f_show: 1, f_width: "100" },
            { f_name: "tong_tien", f_header: "Tổng tiền", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "120", f_dec: 2 }
          ],
          children: [
            {
              id: "bh_dh_ct",
              parentId: "bh_dh",
              label: "Chi tiết ĐH",
              m_show: true,
              menu_id: "1.2.1",
              table_name: "bh_donhang_ct",
              trigger: {
                after_save: "update_order_total",
                after_delete: "recalculate_order_total"
              },
              table: [
                { f_name: "id", f_header: "ID", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "150" },
                { f_name: "id_sp", f_header: "Sản phẩm", f_types: "co", f_pkid: 1, f_show: 1, f_width: "250", f_cbo_query: "{\"query\":[{\"obj_name\":\"dm_sanpham\",\"fields\":[\"id\",\"ten_sp\"]}]}" },
                { f_name: "so_luong", f_header: "SL", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "100", f_dec: 2 },
                { f_name: "don_gia", f_header: "Đơn giá", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "120", f_dec: 2 },
                { f_name: "thanh_tien", f_header: "Thành tiền", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "120", f_dec: 2 }
              ]
            }
          ]
        }
      ]
    }
  ];
}

function buildPromptWithRequirement(
  requestText: string,
  scope: "minimal" | "complete" = "minimal",
  currentMenus?: MenuItemType[],
): string {
  const referenceMenus = Array.isArray(currentMenus) && currentMenus.length > 0
    ? currentMenus.slice(0, 12)
    : createMenuExample();
  const mainPrompt = trimToMax(AI_PROMPTS.MAIN_MENU_DESIGNER || "", 5200);
  const extractorPrompt = trimToMax(AI_PROMPTS.REQUIREMENT_EXTRACTOR || "", 2200);
  const selectorGuide = trimToMax(AI_PROMPTS.TYPE_SELECTION_GUIDE || "", 2200);
  const requestCore = trimToMax(requestText || "", 2800);
  const compactMenuContext = buildCompactMenuContext(referenceMenus, 80);

  const prompt = `${mainPrompt}

${extractorPrompt}

${selectorGuide}

## TRACH NHIEM CUA BAN
1) Phan tich yeu cau khach hang
2) Chon menu type phu hop (${scope === "minimal" ? "uu tien type 1/3" : "co the dung 1/2/3/4"})
3) Tao JSON hop le theo MenuItemType
4) Neu can, ghi chu gia dinh vao notes
5) Neu da co menu cu: chuan hoa theo schema he thong hien tai, giu ID/path/menu_id on dinh toi da

## MENU HE THONG HIEN TAI (COMPACT REFERENCE)
${compactMenuContext}

## YEU CAU KHACH HANG
${requestCore}

## SCHEMA GUARDRAIL (BAT BUOC)
- CHI dung table field theo format f_*: f_name, f_header, f_types, f_pkid, f_show, f_width, f_dec.
- KHONG dung field generic: field, label, type, primaryKey, required, editable.
- Trigger phai nam trong object "trigger": { "before_save": "...", "after_save": "..." }
- KHONG dung key trigger_* o cap menu (vd: trigger_before_save, trigger_after_save).
- GIA TRI trigger phai la JS code body thuc thi duoc voi dung chu ky:
  before_save/after_save/update: (seft, data, bang) => return object
  afterAdd/afterEdit/afterDelete: (allData, seft, data) => return any
  load_db/report_db: (seft, db) => return Row[]
- KHONG tra ve ten ham rong nhu "validate_order_debt_limit" neu khong co code.
- Field select/combo (f_types co/coro/cbo) BAT BUOC co f_cbo_query hop le:
  + Dang static: {"options":[{"ma":"...","ten":"..."}],"query":[]}
  + Dang query DB: {"options":[],"query":[{"obj_name":"table","fields":["id","name"],"obj_where":{"field":"id","type":"like","value":""}}]}
  + Khong tra ve JSON loi hoac SQL thuan.
- Neu yeu cau nghiep vu co ket noi master-detail, bao cao, combo phu thuoc: phai tao du trigger va f_cbo_query tuong ung.

## OUTPUT SHAPE (LEGACY COMPAT)
- Moi menu item uu tien co day du key: id, label, trigger, m_icons, field_root, report_name,
  orientation, p_width, p_height, m_show, g_readonly, table_name, type_menu, type_form,
  row_type_edit, dev, prefix_pk, table_pagesize, menu_id, parentId, children.
- Moi field trong table uu tien co key: id, f_name, f_pkid, f_sort, f_align, f_stt, f_header,
  f_filter, f_width, f_sorting, f_types, f_show, f_cbo_query, f_dec, f_showgrid, f_showonreport, f_alert_query.

## LUU Y TOKEN
Khong lap lai JSON mau dai. Tap trung logic nghiep vu va tra ve JSON menu hoan chinh, dung schema.`;

  return trimToMax(prompt, 18000);
}

function buildRefinementPrompt(
  baseRequest: string,
  refineRequest: string,
  previousResultJson: string,
  scope: "minimal" | "complete" = "complete",
  currentMenus?: MenuItemType[],
): string {
  const referenceMenus = Array.isArray(currentMenus) && currentMenus.length > 0
    ? currentMenus.slice(0, 24)
    : createMenuExample();

  const mainPrompt = trimToMax(AI_PROMPTS.MAIN_MENU_DESIGNER || "", 5200);
  const extractorPrompt = trimToMax(AI_PROMPTS.REQUIREMENT_EXTRACTOR || "", 2200);
  const selectorGuide = trimToMax(AI_PROMPTS.TYPE_SELECTION_GUIDE || "", 2200);

  const requestCore = trimToMax(baseRequest || "(khong co)", 2600);
  const refineCore = trimToMax(refineRequest || "", 1800);
  const currentMenuContext = buildCompactMenuContext(referenceMenus, 80);
  const previousMenuContext = buildPreviousResultContext(previousResultJson, 90);
  const strictScope = scope === "minimal" ? "uu tien type 1/3" : "duoc dung day du type 1/2/3/4";

  const prompt = `${mainPrompt}

${extractorPrompt}

${selectorGuide}

## NHIEM VU REFINE (TOI UU TOKEN)
Ban da co ket qua menu lan truoc. Hay cap nhat theo yeu cau moi voi nguyen tac:
1) Giu on dinh phan dung, chi sua phan can thay doi.
2) Van tra ve TOAN BO menu sau khi cap nhat (khong tra ve delta).
3) Dam bao schema MenuItemType hop le va ${strictScope}.
4) Neu thong tin chua du, dua ra gia dinh hop ly va ghi vao warnings.
5) Chuan hoa lai cac menu cu chua dung schema (field generic, trigger sai cho, combo sai format).

## YEU CAU GOC (RUT GON)
${requestCore}

## YEU CAU BO SUNG MOI (UU TIEN CAO NHAT)
${refineCore}

## MENU HE THONG HIEN TAI (COMPACT REFERENCE)
${currentMenuContext}

## TOM TAT KET QUA AI LAN TRUOC (COMPACT)
${previousMenuContext}

## SCHEMA GUARDRAIL (BAT BUOC)
- CHI dung table field theo format f_*: f_name, f_header, f_types, f_pkid, f_show, f_width, f_dec.
- KHONG dung field generic: field, label, type, primaryKey, required, editable.
- Trigger phai nam trong object "trigger": { "before_save": "...", "after_save": "..." }
- KHONG dung key trigger_* o cap menu (vd: trigger_before_save, trigger_after_save).
- GIA TRI trigger phai la JS code body thuc thi duoc voi dung chu ky:
  before_save/after_save/update: (seft, data, bang) => return object
  afterAdd/afterEdit/afterDelete: (allData, seft, data) => return any
  load_db/report_db: (seft, db) => return Row[]
- KHONG tra ve ten ham rong nhu "validate_order_debt_limit" neu khong co code.
- Field select/combo (f_types co/coro/cbo) BAT BUOC co f_cbo_query hop le theo 1 trong 2 mau static/query DB.
- Neu refine tu menu cu: giu id/menu_id/path/menu cha-con toi da, chi thay doi phan duoc yeu cau.

## OUTPUT SHAPE (LEGACY COMPAT)
- Moi menu item uu tien co day du key: id, label, trigger, m_icons, field_root, report_name,
  orientation, p_width, p_height, m_show, g_readonly, table_name, type_menu, type_form,
  row_type_edit, dev, prefix_pk, table_pagesize, menu_id, parentId, children.
- Moi field trong table uu tien co key: id, f_name, f_pkid, f_sort, f_align, f_stt, f_header,
  f_filter, f_width, f_sorting, f_types, f_show, f_cbo_query, f_dec, f_showgrid, f_showonreport, f_alert_query.

## DINH DANG DAU RA BAT BUOC
{ "menu": [...], "notes": [...], "warnings": [...] }

## LUU Y TOKEN
Khong lap lai JSON mau dai. Chi tap trung logic nghiep vu va tra ve JSON menu hoan chinh, dung schema.
`;

  return trimToMax(prompt, 22000);
}

function trimToMax(text: string, maxChars: number): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.length <= maxChars) return raw;

  const keepHead = Math.floor(maxChars * 0.65);
  const keepTail = Math.max(0, maxChars - keepHead - 24);
  const head = raw.slice(0, keepHead).trim();
  const tail = raw.slice(Math.max(0, raw.length - keepTail)).trim();
  return `${head}\n...[truncated for token budget]...\n${tail}`;
}

function estimateTokenCount(text: string): number {
  const raw = String(text || "");
  // Practical approximation for mixed Vietnamese/English prompts.
  return Math.ceil(raw.length / 4);
}

function mapGenericTypeToFTypes(input: any): string {
  const raw = String(input || "").toLowerCase().trim();
  if (!raw) return "ed";
  if (raw === "cbo") return "co";
  if (raw === "number" || raw === "int" || raw === "float" || raw === "decimal") return "nummeric";
  if (raw === "date") return "date";
  if (raw === "datetime") return "datetime";
  if (raw === "time") return "time";
  if (raw === "foreignkey" || raw === "enum" || raw === "select" || raw === "combo") return "co";
  if (raw === "text" || raw === "textarea" || raw === "memo") return "memo";
  if (raw === "boolean" || raw === "bool" || raw === "checkbox") return "ch";
  return "ed";
}

function normalizeTableField(field: any): any {
  const raw = field && typeof field === "object" ? { ...field } : {};

  const existingType = raw.f_types || raw.type || raw.dataType;
  let fTypes = mapGenericTypeToFTypes(existingType);

  // Respect read-only intent from generic payload.
  if (raw.editable === false && fTypes !== "co" && fTypes !== "coro") {
    fTypes = fTypes === "nummeric" ? "ron" : "ro";
  }

  const fName = raw.f_name || raw.field || raw.name || "field_unknown";
  const fHeader = raw.f_header || raw.label || raw.title || fName;
  const fPkid = raw.f_pkid === 1 || raw.primaryKey === true || fName === "id" ? 1 : 0;

  const normalized: any = {
    ...raw,
    f_name: fName,
    f_header: fHeader,
    f_types: fTypes,
    f_pkid: fPkid,
    f_show: raw.hidden === true ? 0 : (raw.f_show ?? 1),
    f_width: String(raw.f_width ?? 140),
  };

  if (typeof raw.f_dec === "number") normalized.f_dec = raw.f_dec;
  if (typeof raw.decimals === "number") normalized.f_dec = raw.decimals;
  if (fTypes === "nummeric" && typeof normalized.f_dec !== "number") normalized.f_dec = 2;

  if (raw.foreignKey || raw.enum || raw.options) {
    normalized.f_types = raw.editable === false ? "coro" : "co";
  }

  if (/co|coro|cbo/i.test(String(normalized.f_types || ""))) {
    normalized.f_cbo_query = normalizeComboQueryValue(
      normalized.f_cbo_query ?? raw.cbo_query ?? raw.options ?? raw.foreignKey,
      fName,
      normalized.f_types,
    );
  }

  // Remove generic aliases to keep output clean and consistent for backend.
  delete normalized.field;
  delete normalized.label;
  delete normalized.type;
  delete normalized.primaryKey;
  delete normalized.required;
  delete normalized.editable;
  delete normalized.default;
  delete normalized.foreignKey;
  delete normalized.enum;
  delete normalized.hidden;
  delete normalized.cbo_query;
  delete normalized.dataSource;

  return normalized;
}

function normalizeTriggerShape(node: any): Record<string, any> {
  const fromObject = node?.trigger && typeof node.trigger === "object" ? { ...node.trigger } : {};
  const trigger: Record<string, any> = { ...fromObject };

  Object.keys(node || {}).forEach((key) => {
    if (!key.startsWith("trigger_")) return;
    const triggerName = normalizeTriggerKeyName(key.replace(/^trigger_/, ""));
    const triggerValue = node[key];
    if (triggerName && triggerValue !== undefined && triggerValue !== null && triggerValue !== "") {
      trigger[triggerName] = triggerValue;
    }
  });

  ["load_db", "load_table_db", "report_db", "update", "filter", "beforeImport", "afterImport", "barcode"]
    .forEach((key) => {
      const value = node?.[key];
      if (value !== undefined && value !== null && value !== "" && trigger[key] === undefined) {
        trigger[key] = value;
      }
    });

  Object.keys({ ...trigger }).forEach((key) => {
    const normalizedKey = normalizeTriggerKeyName(key);
    const triggerValue = trigger[key];
    if (normalizedKey !== key) {
      delete trigger[key];
    }
    trigger[normalizedKey] = normalizeTriggerCodeValue(normalizedKey, triggerValue);
  });

  return trigger;
}

function normalizeAiMenuNode(input: any): MenuItemType {
  const node: any = input && typeof input === "object" ? { ...input } : {};

  const normalized: any = {
    ...node,
    id: String(node.id || "menu_undefined"),
    parentId: node.parentId ?? "",
  };

  if (Array.isArray(node.table)) {
    normalized.table = node.table.map(normalizeTableField);
  }

  const trigger = normalizeTriggerShape(node);
  if (Object.keys(trigger).length > 0) {
    normalized.trigger = trigger;
  }

  Object.keys(normalized).forEach((key) => {
    if (key.startsWith("trigger_")) delete normalized[key];
  });

  if (Array.isArray(node.children)) {
    normalized.children = node.children.map(normalizeAiMenuNode);
  }

  if (!Array.isArray(node.children) && Array.isArray(node.nodes)) {
    normalized.children = node.nodes.map(normalizeAiMenuNode);
  }

  return normalized as MenuItemType;
}

function normalizeAiMenuSchema(menus: MenuItemType[]): MenuItemType[] {
  return (Array.isArray(menus) ? menus : []).map((menu) => normalizeAiMenuNode(menu));
}

function ensureLegacyFieldShape(field: any, index: number, menuId: string): any {
  const fName = String(field?.f_name || field?.field || `field_${index + 1}`);
  return {
    id: field?.id || `${menuId}@@@@@${fName}`,
    f_name: fName,
    f_pkid: Number(field?.f_pkid ?? 0),
    f_sort: String(field?.f_sort ?? ""),
    f_align: String(field?.f_align ?? "left"),
    f_stt: Number(field?.f_stt ?? index + 1),
    f_header: String(field?.f_header ?? fName),
    f_filter: String(field?.f_filter ?? "text_filter"),
    f_width: String(field?.f_width ?? "150"),
    f_sorting: String(field?.f_sorting ?? "str"),
    f_types: String(field?.f_types ?? "ed"),
    f_show: Number(field?.f_show ?? 1),
    f_cbo_query: field?.f_cbo_query ?? "",
    f_dec: Number(field?.f_dec ?? 0),
    f_showgrid: Number(field?.f_showgrid ?? field?.f_show ?? 1),
    f_showonreport: Number(field?.f_showonreport ?? field?.f_show ?? 1),
    f_alert_query: String(field?.f_alert_query ?? ""),
    ...field,
  };
}

function applyLegacyMenuShape(menus: MenuItemType[]): MenuItemType[] {
  const walk = (nodes: MenuItemType[], parentId: string, pathPrefix: string): MenuItemType[] => {
    return (Array.isArray(nodes) ? nodes : []).map((rawNode, index) => {
      const menuId = rawNode.id ? String(rawNode.id) : `${Date.now()}_${Math.random().toString(16).slice(2, 14)}`;
      const nextMenuId = String((rawNode as any).menu_id || (pathPrefix ? `${pathPrefix}.${index + 1}` : `${index + 1}`));
      const childrenInput = Array.isArray((rawNode as any).children)
        ? ((rawNode as any).children as MenuItemType[])
        : [];

      const table = Array.isArray((rawNode as any).table)
        ? ((rawNode as any).table as any[]).map((f, idx) => ensureLegacyFieldShape(f, idx, menuId))
        : [];

      const typeForm = Number((rawNode as any).type_form ?? 1);
      
      const node: MenuItemType = {
        ...rawNode,
        id: menuId,
        parentId,
        label: rawNode.label || (rawNode as any).label_vi || rawNode.name || "Ten menu moi",
        trigger: (rawNode as any).trigger && typeof (rawNode as any).trigger === "object" ? (rawNode as any).trigger : {},
        m_icons: (rawNode as any).m_icons || rawNode.icon || "",
        field_root: (rawNode as any).field_root ?? "",
        report_name: (rawNode as any).report_name ?? "",
        orientation: (rawNode as any).orientation ?? "",
        p_width: (rawNode as any).p_width ?? 0,
        p_height: (rawNode as any).p_height ?? 0,
        m_show: (rawNode as any).m_show ?? true,
        g_readonly: (rawNode as any).g_readonly ?? false,
        table_name: (rawNode as any).table_name ?? "",
        type_menu: (rawNode as any).type_menu ?? 0,
        type_form: typeForm,
        row_type_edit: (rawNode as any).row_type_edit ?? "",
        dev: (rawNode as any).dev ?? false,
        prefix_pk: (rawNode as any).prefix_pk ?? "",
        table_pagesize: (rawNode as any).table_pagesize ?? 0,
        menu_id: nextMenuId,
        table,
        // Explicit support for Type 3 (Dynamic Link) and Type 4 (Dynamic Code)
        ...(typeForm === 3 && { dynamic_link_url: (rawNode as any).dynamic_link_url ?? "" }),
        ...(typeForm === 4 && { auto_code_name: (rawNode as any).auto_code_name ?? "" }),
      };

      if (childrenInput.length > 0) {
        (node as any).children = walk(childrenInput, menuId, nextMenuId);
      }

      return node;
    });
  };

  return walk(menus, "", "");
}

function flattenMenuNodes(menus: MenuItemType[], maxNodes: number): MenuItemType[] {
  const out: MenuItemType[] = [];
  const stack = [...menus];

  while (stack.length > 0 && out.length < maxNodes) {
    const node = stack.shift();
    if (!node) continue;
    out.push(node);

    const children = Array.isArray((node as any).children)
      ? ((node as any).children as MenuItemType[])
      : [];
    if (children.length > 0) {
      stack.unshift(...children);
    }
  }

  return out;
}

function compactNodeLine(node: MenuItemType): string {
  const label = node.label_vi || node.label || node.name_vi || node.name || "(unnamed)";
  const tableName = (node as any).table_name || "";
  const hasChildren = Array.isArray((node as any).children) && (node as any).children.length > 0;
  return [
    `id=${node.id}`,
    `parent=${node.parentId || "root"}`,
    `path=${node.path || ""}`,
    `type=${(node as any).type_form ?? (node as any).menuType ?? "?"}`,
    `label=${label}`,
    tableName ? `table=${tableName}` : "",
    hasChildren ? "children=yes" : "",
  ].filter(Boolean).join(" | ");
}

function buildCompactMenuContext(menus: MenuItemType[], maxNodes: number): string {
  const nodes = flattenMenuNodes(menus, maxNodes);
  const lines = nodes.map((node) => `- ${compactNodeLine(node)}`);
  const truncated = nodes.length >= maxNodes ? "\n- ...more nodes omitted for token budget..." : "";
  return `total_nodes_sampled=${nodes.length}${truncated ? " (truncated)" : ""}\n${lines.join("\n")}${truncated}`;
}

function buildPreviousResultContext(previousResultJson: string, maxNodes: number): string {
  const raw = String(previousResultJson || "").trim();
  if (!raw) return "(khong co ket qua truoc)";

  try {
    const parsed = JSON.parse(raw);
    const menuList = Array.isArray(parsed?.menu)
      ? parsed.menu
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (!Array.isArray(menuList) || menuList.length === 0) {
      return `khong tim thay mang menu hop le. raw_preview=${trimToMax(raw, 1200)}`;
    }

    const normalized = normalizeMenuList(menuList as MenuItemType[]);
    const compact = buildCompactMenuContext(normalized, maxNodes);
    const notesPreview = Array.isArray((parsed as any)?.notes)
      ? trimToMax(JSON.stringify((parsed as any).notes), 600)
      : "[]";

    return `menu_count=${menuList.length}\n${compact}\nnotes_preview=${notesPreview}`;
  } catch {
    return `khong parse duoc JSON ket qua truoc. raw_preview=${trimToMax(raw, 1200)}`;
  }
}

function ensureMenuDefaults(menu: MenuItemType): MenuItemType {
  const next: MenuItemType = { ...menu };

  if ((next as any).label_vi && !next.label) next.label = (next as any).label_vi;
  if ((next as any).name_vi && !next.name) next.name = (next as any).name_vi;
  if ((next as any).label_sh && !next.label_zh) next.label_zh = (next as any).label_sh;
  if ((next as any).name_sh && !next.name_zh) next.name_zh = (next as any).name_sh;

  if (Array.isArray((next as any).table)) {
    (next as any).table = (next as any).table.map((field: any) => {
      const f = { ...field };
      if (f.f_header_vi && !f.f_header) f.f_header = f.f_header_vi;
      if (f.f_header_sh && !f.f_header_zh) f.f_header_zh = f.f_header_sh;
      return f;
    });
  }

  if (Array.isArray((next as any).children)) {
    (next as any).children = (next as any).children.map(ensureMenuDefaults);
  }

  return next;
}

function normalizeMenuList(menus: MenuItemType[]) {
  const schemaNormalized = normalizeAiMenuSchema(menus);
  const legacyShaped = applyLegacyMenuShape(schemaNormalized);
  return legacyShaped.map(ensureMenuDefaults);
}

function mergeMenus(baseMenus: MenuItemType[], incomingMenus: MenuItemType[]) {
  const byId = new Map<string, MenuItemType>();
  baseMenus.forEach((m) => byId.set(m.id, { ...m }));

  incomingMenus.forEach((incoming) => {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, { ...incoming });
      return;
    }

    const merged: MenuItemType = {
      ...existing,
      ...incoming,
      children: undefined,
    };

    const existingChildren = Array.isArray((existing as any).children)
      ? ((existing as any).children as MenuItemType[])
      : [];
    const incomingChildren = Array.isArray((incoming as any).children)
      ? ((incoming as any).children as MenuItemType[])
      : [];

    if (existingChildren.length > 0 || incomingChildren.length > 0) {
      (merged as any).children = mergeMenus(existingChildren, incomingChildren);
    }

    byId.set(incoming.id, merged);
  });

  return Array.from(byId.values());
}

function extractAiPayload(response: any) {
  let payload = response?.result ?? response?.data ?? response;
  if (payload?.result) payload = payload.result;

  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  return payload && typeof payload === "object" ? payload : null;
}

function isComboType(rawType: any): boolean {
  return /co|coro|cbo/i.test(String(rawType || ""));
}

function isValidComboQueryShape(rawQuery: any): boolean {
  const text = String(rawQuery || "").trim();
  if (!text) return false;
  if (/\breturn\b/.test(text)) return true;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return true;
    if (parsed && typeof parsed === "object") {
      if (Array.isArray((parsed as any).options) || Array.isArray((parsed as any).query)) {
        return true;
      }
    }
  } catch {
    try {
      const fn = new Function(`return (${text})`);
      const parsed = fn();
      if (Array.isArray(parsed)) return true;
      if (parsed && typeof parsed === "object") {
        if (Array.isArray((parsed as any).options) || Array.isArray((parsed as any).query)) {
          return true;
        }
      }
    } catch {
      return false;
    }
  }

  return false;
}

function validateMenusForApply(menus: MenuItemType[]): MenuValidationIssue[] {
  const issues: MenuValidationIssue[] = [];

  const walk = (nodes: MenuItemType[], parentPath: string) => {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
      const id = String((node as any).id || "menu_undefined");
      const label = String((node as any).label || (node as any).name || id);
      const path = parentPath ? `${parentPath} > ${label}` : label;
      const typeForm = Number((node as any).type_form || 0);
      const tableName = String((node as any).table_name || "").trim();
      const trigger = (node as any).trigger;
      const fields = Array.isArray((node as any).table) ? (node as any).table : [];

      if ((typeForm === 1 || typeForm === 2) && !tableName) {
        issues.push({
          severity: "error",
          rule: "table_name_required",
          path,
          message: "Menu type_form=1/2 thiếu table_name.",
        });
      }

      if (typeForm === 3 && !String((node as any).dynamic_link_url || (node as any).v_link || "").trim()) {
        issues.push({
          severity: "error",
          rule: "dynamic_link_required",
          path,
          message: "Menu type_form=3 thiếu dynamic_link_url (hoặc v_link).",
        });
      }

      if (typeForm === 4 && !String((node as any).auto_code_name || "").trim()) {
        issues.push({
          severity: "error",
          rule: "dynamic_code_required",
          path,
          message: "Menu type_form=4 thiếu auto_code_name.",
        });
      }

      if (trigger != null && typeof trigger !== "object") {
        issues.push({
          severity: "error",
          rule: "trigger_object_required",
          path,
          message: "Trigger phải là object.",
        });
      }

      if (fields.length > 0) {
        fields.forEach((field: any, index: number) => {
          const fName = String(field?.f_name || "").trim();
          const fTypes = String(field?.f_types || "").trim();
          const fieldPath = `${path} > field[${index + 1}]`;

          if (!fName) {
            issues.push({
              severity: "error",
              rule: "field_name_required",
              path: fieldPath,
              message: "Thiếu f_name.",
            });
          }

          if (!fTypes) {
            issues.push({
              severity: "error",
              rule: "field_type_required",
              path: fieldPath,
              message: `Field ${fName || "(unknown)"} thiếu f_types.`,
            });
          }

          if (isComboType(fTypes)) {
            if (!isValidComboQueryShape(field?.f_cbo_query)) {
              issues.push({
                severity: "error",
                rule: "combo_query_invalid",
                path: fieldPath,
                message: `Field ${fName || "(unknown)"} có kiểu combo nhưng f_cbo_query chưa hợp lệ.`,
              });
            }
          }
        });
      }

      const normalizedTrigger = trigger && typeof trigger === "object" ? trigger : {};
      if ((tableName.includes("donhang") || tableName.includes("phieuxuat") || tableName.includes("phieunhap")) && typeForm === 2) {
        if (!normalizedTrigger.before_save) {
          issues.push({
            severity: "warning",
            rule: "business_before_save_recommended",
            path,
            message: `Menu nghiệp vụ ${tableName} nên có trigger.before_save để validate dữ liệu.`,
          });
        }
        if (!normalizedTrigger.after_save) {
          issues.push({
            severity: "warning",
            rule: "business_after_save_recommended",
            path,
            message: `Menu nghiệp vụ ${tableName} nên có trigger.after_save để đồng bộ nghiệp vụ liên quan.`,
          });
        }
      }

      const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
      if (children.length > 0) {
        walk(children, path);
      }
    });
  };

  walk(menus, "");
  return issues;
}

export function AiMenuDesigner({ appId, currentMenus, onApply }: AiMenuDesignerProps) {
  const { t } = useTranslation();
  const [requestText, setRequestText] = useState("");
  const [storedRequest, setStoredRequest] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiMenus, setAiMenus] = useState<MenuItemType[] | null>(null);
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<string | undefined>(undefined);
  const [refineText, setRefineText] = useState("");

  const menuValidationIssues = useMemo(() => {
    return validateMenusForApply(aiMenus || []);
  }, [aiMenus]);
  const menuValidationErrors = useMemo(
    () => menuValidationIssues.filter((item) => item.severity === "error"),
    [menuValidationIssues],
  );
  const menuValidationWarnings = useMemo(
    () => menuValidationIssues.filter((item) => item.severity === "warning"),
    [menuValidationIssues],
  );

  const hasStoredRequest = storedRequest.trim().length > 0;

  const mergedRequestText = useMemo(() => {
    if (!requestText.trim()) return storedRequest;
    if (!storedRequest.trim()) return requestText;
    return `${storedRequest}\n---\n${requestText}`;
  }, [requestText, storedRequest]);

  useEffect(() => {
    if (!appId) return;

    const loadRequest = async () => {
      try {
        const res = await getTableData<AiRequestRecord>({
          app_id: "csm",
          obj_name: AI_REQUEST_TABLE,
          where: {
            field: "app_id_target",
            type: "eq",
            value: appId,
          },
        });

        const rows = (res as any)?.rows || (res as any)?.data || [];
        const item = rows[0];
        if (item) {
          setStoredRequest(item.request_text || "");
          setRecordId(item.id);
        } else {
          setStoredRequest("");
          setRecordId(undefined);
        }
      } catch (error) {
        console.warn("Failed to load AI menu request:", error);
      }
    };

    loadRequest();
  }, [appId]);

  const saveRequestRecord = async (payload: Partial<AiRequestRecord>, mode: "create" | "update") => {
    if (!appId) return;

    const now = Date.now();
    const objUpdate: AiRequestRecord = {
      id: recordId || `ai_menu_${appId}`,
      app_id_target: appId,
      request_text: storedRequest,
      request_history: payload.request_history || storedRequest,
      updated_at: now,
      created_at: payload.created_at || now,
      ...payload,
    };

    await updateTableData<AiRequestRecord>({
      app_id: "csm",
      obj_name: AI_REQUEST_TABLE,
      command: mode,
      obj_update: objUpdate,
      pk_fields: ["app_id_target"],
    });

    if (!recordId) setRecordId(objUpdate.id);
  };

  const runGenerate = async (
    inputRequest: string,
    scope: "minimal" | "complete" = "minimal",
    promptOverride?: string,
  ) => {
    if (!appId) {
      message.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn app");
      return;
    }
    if (!inputRequest.trim()) {
      message.warning(t("system.menu.aiDesigner.enterRequirement") || "Hãy nhập yêu cầu khách hàng");
      return;
    }

    const prompt = promptOverride || buildPromptWithRequirement(inputRequest, scope, currentMenus);
    const estimatedTokens = estimateTokenCount(prompt);
    if (estimatedTokens > 6000) {
      message.warning(
        `Prompt dang lon (~${estimatedTokens} tokens uoc luong). Neu goi mien phi bi gioi han, hay rut gon yeu cau.`,
      );
    }
    setLoading(true);

    try {
      const command = recordId ? "update" : "create";

      await saveRequestRecord(
        {
          request_text: inputRequest,
          last_prompt: prompt,
          updated_at: Date.now(),
        },
        command,
      );
      setStoredRequest(inputRequest);

      const res = await generateSeoContentWithPrompt(prompt);
      const payload = extractAiPayload(res);
      if (!payload) {
        message.error(t("system.menu.aiDesigner.invalidJson") || "AI trả về không đúng JSON");
        setAiResultText(String(res?.message || "AI error"));
        return;
      }

      const menuPayload = Array.isArray(payload.menu) ? payload.menu : Array.isArray(payload) ? payload : [];
      if (menuPayload.length === 0) {
        message.warning(t("system.menu.aiDesigner.emptyMenu") || "AI chưa trả về danh sách menu");
      }

      const normalized = normalizeMenuList(menuPayload);
      const output = {
        menu: normalized,
        notes: Array.isArray(payload.notes) ? payload.notes : [],
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      };

      setAiMenus(normalized);
      setAiResultText(JSON.stringify(output, null, 2));

      await saveRequestRecord(
        {
          request_text: inputRequest,
          last_result: JSON.stringify(output),
          updated_at: Date.now(),
        },
        "update",
      );

      message.success(t("system.menu.aiDesigner.generateSuccess") || "Đã tạo menu bằng AI");
    } catch (error) {
      console.error("AI menu generation failed:", error);
      message.error(t("system.menu.aiDesigner.generateFailed") || "Lỗi gọi AI");
    } finally {
      setLoading(false);
    }
  };

  const handleRefineGenerate = async () => {
    if (!refineText.trim()) {
      message.warning(t("system.menu.aiDesigner.enterRefine") || "Hãy nhập yêu cầu bổ sung/chỉnh sửa");
      return;
    }

    const prompt = buildRefinementPrompt(
      storedRequest,
      refineText,
      aiResultText,
      "complete",
      currentMenus,
    );

    const combinedRequest = [
      storedRequest || "",
      "\n[Bo sung/chinh sua]\n",
      refineText,
    ].join("\n").trim();

    await runGenerate(combinedRequest, "complete", prompt);
    setRefineText("");
  };

  const handleGenerate = async () => {
    await runGenerate(mergedRequestText, "complete");
  };

  const handleApply = async () => {
    if (!aiMenus || aiMenus.length === 0) {
      message.warning(t("system.menu.aiDesigner.noMenuToApply") || "Không có menu để áp dụng");
      return;
    }

    if (menuValidationErrors.length > 0) {
      message.error(`Khong the ap dung vi con ${menuValidationErrors.length} loi schema/nghiep vu.`);
      return;
    }

    const baseMenus = Array.isArray(currentMenus) ? currentMenus : [];
    const nextMenus = mergeMode === "merge" ? mergeMenus(baseMenus, aiMenus) : aiMenus;

    try {
      await onApply(normalizeMenuList(nextMenus));
      message.success(t("system.menu.aiDesigner.applySuccess") || "Đã áp dụng menu vào hệ thống");
    } catch (error) {
      console.error("Apply AI menu failed:", error);
      message.error(t("system.menu.aiDesigner.applyFailed") || "Áp dụng menu thất bại");
    }
  };

  const handleMergeModeChange = (evt: RadioChangeEvent) => {
    setMergeMode(evt.target.value as MergeMode);
  };

  return (
    <>
      <Card title={t("system.menu.aiDesigner.panelTitle") || "AI Thiet ke Menu Tu dong"} bordered={false}>
        {!appId && <Alert type="warning" showIcon message={t("system.menu.aiDesigner.selectAppFirst") || "Vui long chon App truoc khi su dung AI."} />}

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("system.menu.aiDesigner.autoAnalyzeTitle") || "AI tự động thiết kế toàn bộ menu theo nghiệp vụ"}
          description={t("system.menu.aiDesigner.autoAnalyzeDesc") || "AI sẽ tự phân tích yêu cầu và tự chọn loại menu phù hợp cho từng chức năng trong toàn bộ cây menu."}
        />

        {hasStoredRequest && (
          <div style={{ marginBottom: 12 }}>
            <Alert
              type="success"
              showIcon
              message={t("system.menu.aiDesigner.hasStoredRequestTitle") || "Da co yeu cau truoc do"}
              description={t("system.menu.aiDesigner.hasStoredRequestDesc") || "Neu nhap them, he thong se ket hop voi yeu cau cu de AI hieu ro hon."}
            />
          </div>
        )}

        <TextArea
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          placeholder={t("system.menu.aiDesigner.singleInputPlaceholder") || "Nhập yêu cầu đầy đủ nghiệp vụ của khách hàng để AI tự động thiết kế toàn bộ menu app..."}
          rows={8}
          style={{ marginBottom: 16 }}
        />

        <Divider />

        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={handleGenerate} loading={loading} disabled={!appId} size="large">
            {loading
              ? (t("system.menu.aiDesigner.generatingAll") || "Đang tạo toàn bộ menu...")
              : (t("system.menu.aiDesigner.generateAll") || "Tạo bằng AI toàn bộ menu")}
          </Button>

          {aiMenus && aiMenus.length > 0 && (
            <>
              <Radio.Group onChange={handleMergeModeChange} value={mergeMode}>
                <Radio value="merge">{t("system.menu.aiDesigner.mergeLabel") || "Merge"}</Radio>
                <Radio value="replace">{t("system.menu.aiDesigner.replaceLabel") || "Replace"}</Radio>
              </Radio.Group>

              <Button
                type="primary"
                onClick={handleApply}
                size="large"
                disabled={menuValidationErrors.length > 0}
                style={{ background: "#52c41a", borderColor: "#52c41a" }}
              >
                {`${t("system.menu.aiDesigner.applySystem") || "Ap dung vao He thong"} (${aiMenus.length} menu)`}
              </Button>
            </>
          )}
        </Space>

        {aiResultText && (
          <>
            <Divider orientation="left">{t("system.menu.aiDesigner.resultTitle") || "Ket qua tu AI"}</Divider>

            <Space direction="vertical" style={{ width: "100%" }}>
              {aiMenus && aiMenus.length > 0 && (
                <Alert
                  type="success"
                  showIcon
                  message={`${t("system.menu.aiDesigner.generatedCount") || "AI đã tạo thành công"} ${aiMenus.length} ${t("system.menu.aiDesigner.menuFeatures") || "menu/chức năng"}`}
                  description={t("system.menu.aiDesigner.reviewBeforeApply") || "Xem JSON bên dưới và kiểm tra trước khi áp dụng."}
                />
              )}

              {menuValidationIssues.length > 0 && (
                <Alert
                  type={menuValidationErrors.length > 0 ? "error" : "warning"}
                  showIcon
                  message={`Checklist chuan hoa: ${menuValidationErrors.length} loi, ${menuValidationWarnings.length} canh bao`}
                  description={
                    <div style={{ maxHeight: 220, overflow: "auto", paddingRight: 8 }}>
                      {(menuValidationIssues || []).slice(0, 50).map((issue, idx) => (
                        <div key={`${issue.rule}_${idx}`} style={{ marginBottom: 6 }}>
                          [{issue.severity.toUpperCase()}] {issue.path}: {issue.message}
                        </div>
                      ))}
                      {menuValidationIssues.length > 50 && (
                        <div>...con {menuValidationIssues.length - 50} muc nua</div>
                      )}
                    </div>
                  }
                />
              )}

              <TextArea
                value={aiResultText}
                placeholder={t("system.menu.aiDesigner.resultPlaceholder") || "Kết quả AI sẽ hiển thị ở đây (JSON format)"}
                rows={15}
                readOnly
                style={{ fontFamily: "Monaco, Consolas, monospace", fontSize: 12 }}
              />

              <Divider orientation="left">{t("system.menu.aiDesigner.refineTitle") || "Yêu cầu bổ sung / chỉnh sửa"}</Divider>
              <Alert
                type="info"
                showIcon
                message={t("system.menu.aiDesigner.refineHintTitle") || "Bạn có thể yêu cầu AI chỉnh sửa thêm"}
                description={t("system.menu.aiDesigner.refineHintDesc") || "Nhập thay đổi mong muốn, AI sẽ dựa trên kết quả đã tạo và phân tích lại toàn bộ menu theo đúng nghiệp vụ."}
              />
              <TextArea
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder={t("system.menu.aiDesigner.refinePlaceholder") || "Ví dụ: Thêm menu báo cáo doanh thu theo tháng, sửa đơn hàng thành Master-Detail có tab lịch sử thanh toán..."}
                rows={4}
              />
              <Button type="primary" onClick={handleRefineGenerate} loading={loading} disabled={!appId}>
                {t("system.menu.aiDesigner.refineButton") || "Phân tích lại theo yêu cầu bổ sung"}
              </Button>
            </Space>
          </>
        )}
      </Card>
    </>
  );
}

export default AiMenuDesigner;
