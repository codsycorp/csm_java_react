import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Collapse, Divider, Input, Progress, message, Radio, Select, Space, Switch, Tag } from "antd";
import type { RadioChangeEvent } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useTranslation } from "react-i18next";

import type { MenuItemType } from "#src/api/system/menu";
import { fetchAppList, fetchMenuList } from "#src/api/system/menu";
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

type AiProgressState = {
  jobId?: string;
  status?: string;
  stage?: string;
  message?: string;
  current?: number;
  total?: number;
  percent?: number;
  elapsedMs?: number;
  waitingMs?: number;
  level?: number;
};

const AI_REQUEST_TABLE = "csm_ai_menu_requests";

function formatDurationMs(value: number | undefined): string {
  const totalMs = Number(value || 0);
  if (!Number.isFinite(totalMs) || totalMs <= 0) return "00:00";
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function describeAiProgress(progress: AiProgressState | null): string {
  if (!progress) return "";
  if (progress.message) return progress.message;
  const stage = String(progress.stage || progress.status || "running");
  switch (stage) {
    case "queued": return "Đang xếp hàng xử lý AI";
    case "preparing": return "Đang chuẩn bị yêu cầu AI";
    case "chunking": return "Đang chia và phân tích từng phần prompt";
    case "reducing": return "Đang gộp tóm tắt các phần";
    case "final_merge": return "Đang tổng hợp kết quả cuối";
    case "waiting_rate_limit": return "Đang chờ quota GitHub Models";
    case "parsing": return "Đang phân tích kết quả AI";
    case "completed": return "Đã hoàn tất";
    case "failed": return "Xử lý thất bại";
    default: return "Đang xử lý AI";
  }
}

function buildAiProgressResultText(progress: AiProgressState | null): string {
  if (!progress) return "";

  return JSON.stringify({
    success: progress.status === "completed",
    status: progress.status || "running",
    stage: progress.stage || progress.status || "running",
    message: describeAiProgress(progress),
    progress: {
      current: Number(progress.current ?? 0),
      total: Number(progress.total ?? 1),
      percent: Number(progress.percent ?? 0),
      elapsedMs: Number(progress.elapsedMs ?? 0),
      waitingMs: Number(progress.waitingMs ?? 0),
      ...(progress.level != null ? { level: Number(progress.level) } : {}),
      ...(progress.jobId ? { jobId: progress.jobId } : {}),
    },
    note: "Live status only. Final JSON menu payload will replace this block when AI completes.",
  }, null, 2);
}

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

  // Handle "static:val1,val2,val3" shorthand from AI output.
  if (/^static:/i.test(text)) {
    const vals = text.slice(7).split(",").map((v) => v.trim()).filter(Boolean);
    return JSON.stringify({
      options: vals.map((v) => ({ ma: v, ten: v })),
      query: [],
    });
  }

  // Handle raw SQL like "SELECT id, col FROM table" from AI output.
  if (/^select\s+/i.test(text)) {
    const m = text.match(/^select\s+(.+?)\s+from\s+([a-z0-9_]+)/i);
    if (m) {
      const rawFields = m[1].split(",").map((f) => f.trim().split(/\s+|\./g).pop() || f.trim()).filter(Boolean);
      return JSON.stringify({
        options: [],
        query: [{
          obj_name: m[2],
          fields: rawFields.length >= 2 ? [rawFields[0], rawFields[1]] : ["id", "name"],
          obj_where: { field: "id", type: "like", value: "" },
        }],
      });
    }
  }

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

function uniqueStrings(items: string[], limit = 20): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function extractRequirementTables(text: string, limit = 24): string[] {
  const raw = String(text || "");
  const tokens = raw.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/gi) || [];
  const blacklist = new Set([
    "type_form", "table_name", "menu_id", "parent_id", "field_root", "report_name",
    "dynamic_link_url", "auto_code_name", "table_pagesize", "row_type_edit",
    "f_name", "f_header", "f_types", "f_cbo_query", "f_pkid", "f_show",
  ]);
  return uniqueStrings(tokens.filter((t) => !blacklist.has(t.toLowerCase())), limit);
}

function extractRequirementModules(text: string, limit = 12): string[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const modules: string[] = [];
  for (const line of lines) {
    if (/^(\d+[\).]|[-*•])\s+/.test(line)) {
      const normalized = line.replace(/^(\d+[\).]|[-*•])\s+/, "").trim();
      if (normalized.length >= 4 && normalized.length <= 120) {
        modules.push(normalized);
      }
    }
    if (/^[^:]{4,80}:\s*$/.test(line)) {
      modules.push(line.replace(/:\s*$/, "").trim());
    }
  }
  return uniqueStrings(modules, limit);
}

function buildPromptWithRequirement(
  appId: string | undefined,
  requestText: string,
  scope: "minimal" | "complete" = "minimal",
  currentMenus?: MenuItemType[],
  sampleMenus?: MenuItemType[],
): string {
  const referenceMenus = Array.isArray(currentMenus) && currentMenus.length > 0
    ? currentMenus
    : [];
  const enforcerPrompt = trimToMax(AI_PROMPTS.EXTRACTION_AND_VALIDATION || "", 5000);
  const sysArchContext = trimToMax(AI_PROMPTS.SYSTEM_ARCHITECTURE || "", 8000);
  const mainPrompt = trimToMax(AI_PROMPTS.MAIN_MENU_DESIGNER || "", 5500);
  const extractorPrompt = trimToMax(AI_PROMPTS.REQUIREMENT_EXTRACTOR || "", 1200);
  const selectorGuide = trimToMax(AI_PROMPTS.TYPE_SELECTION_GUIDE || "", 1500);
  const requestCore = trimToMax(requestText || "", 10000);
  const detectedModules = extractRequirementModules(requestText || "", 20);
  const detectedTables = extractRequirementTables(requestText || "", 30);
  const moduleChecklist = detectedModules.length > 0
    ? detectedModules.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
    : "(khong trich xuat duoc module ro rang; AI phai tu phan tich day du theo yeu cau goc)";
  const tableChecklist = detectedTables.length > 0
    ? detectedTables.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
    : "(khong co ten bang ro rang trong yeu cau)";
  const compactMenuContext = referenceMenus.length > 0
    ? buildCompactMenuContext(referenceMenus, 150)
    : "(khong co menu he thong hien tai de tham chieu)";
  const typeCatalog = buildMenuTypeCatalog();
  const menuOrgGuide = buildMenuOrganizationGuide();
  const sampleMenuContext = sampleMenus && sampleMenus.length > 0
    ? buildCompactMenuContext(sampleMenus, 100)
    : null;

  const prompt = `${enforcerPrompt}

${sysArchContext}

${mainPrompt}

${extractorPrompt}

${selectorGuide}

## TRACH NHIEM CUA BAN
1) Phan tich yeu cau khach hang
2) Chon menu type phu hop (${scope === "minimal" ? "uu tien type 1/2/6, chi dung 3/4 khi yeu cau ro" : "co the dung 1/2/3/4/6"})
3) Tao JSON hop le theo MenuItemType
4) Neu can, ghi chu gia dinh vao notes
5) Neu da co menu cu: chuan hoa theo schema he thong hien tai, giu ID/path/menu_id on dinh toi da
6) KHONG tu them module/tinh nang khong co trong yeu cau (vd dashboard, KPI, bao cao tong hop, kanban, auto_code)
7) KHONG duoc bo sot dau muc yeu cau: moi module/chuc nang khach hang neu ra phai co menu tuong ung.
8) Khong duoc gom tat ca thanh 1-2 menu tong quat neu yeu cau co nhieu module nghiep vu.
9) So menu chuc nang (node la type_form!=0) phai phan anh day du cac nhom nghiep vu duoc neu trong yeu cau.

## APP_ID DANG THIET KE
${String(appId || "")}

## BO MENU TYPE HE THONG DANG CO
${typeCatalog}

## NGUYEN TAC TO CHUC MENU (NGAN GON - BAT BUOC)
${menuOrgGuide}

## MENU HE THONG HIEN TAI (COMPACT REFERENCE)
${compactMenuContext}
${sampleMenuContext ? `\n## MENU MAU THAM KHAO TU CHUONG TRINH KHAC\nDay la menu thuc te da trien khai tu mot chuong trinh khac de ban tham khao cau truc, pattern, va logic nghiep vu:\n${sampleMenuContext}\n` : ""}
## YEU CAU KHACH HANG
${requestCore}

## CHECKLIST MODULE BAT BUOC BAO PHU (TRICH TU YEU CAU)
${moduleChecklist}

## CHECKLIST BANG/ENTITY THAM KHAO (TRICH TU YEU CAU)
${tableChecklist}

## YEU CAU BAO PHU
- Bat buoc doi chieu tung module trong checklist va tao menu/chuc nang tuong ung.
- Neu thieu thong tin chi tiet cho mot module, van phai tao khung menu/table hop ly cho module do, khong duoc bo qua.
- Trong notes, liet ke module nao da duoc bao phu de de doi chieu.

## SCHEMA GUARDRAIL (BAT BUOC)
- CHI dung table field theo format f_*: f_name, f_header, f_types, f_pkid, f_show, f_width, f_dec.
- KHONG dung field generic: field, label, type, primaryKey, required, editable.
- KHONG dung key "fields" o cap menu. BAT BUOC dung key "table" cho danh sach cot.
- Trigger phai nam trong object "trigger": { "before_save": "...", "after_save": "..." }
- KHONG dung key trigger_* o cap menu (vd: trigger_before_save, trigger_after_save).
- GIA TRI trigger phai la JS code body thuc thi duoc voi dung chu ky:
  before_save/after_save/update: (seft, data, bang) => return object
  afterAdd/afterEdit/afterDelete: (allData, seft, data) => return any
  load_db/report_db: (seft, db) => return Row[]
- KHONG tra ve comment placeholder trong trigger code nhu "/* Validate */ return data" - thay vao do viet code that hoac ten template.
  Ten template co san: validate_order_debt_limit, update_order_total, validate_order_item_stock,
  recalculate_order_total, validate_delivery_item_stock, update_stock_on_delivery,
  validate_receipt_item_quantity, update_stock_on_receipt.
- Field select/combo (f_types co/coro/cbo) BAT BUOC co f_cbo_query KHONG RONG.
  f_cbo_query phai la STRING va chi dung cac dang runtime sau:
  + DANG 1 (query DB): "{\\"query\\":[{\\"obj_name\\":\\"ten_bang\\",\\"fields\\":[\\"id\\",\\"ten\\"],\\"obj_where\\":\\"\\"}],\\"options\\":[]}"
  + DANG 2 (options tinh): "{\\"query\\":[],\\"options\\":[{\\"ma\\":\\"v1\\",\\"ten\\":\\"Nhan 1\\"}]}"
  + DANG 3 (JS tinh toan): "var opts=[];...;return {f_grid:true,f_grid_fields:true,options:opts}"
  + DANG 4 (JS doc data store): "var rows=data[\\"ten_bang\\"].rows||[];...;return {f_grid:true,f_grid_fields:true,options:opts}"
  TUYET DOI KHONG de f_cbo_query rong ("") cho combo field.
- parentId CUA MENU CON PHAI = id cua menu cha. KHONG de tat ca parentId = "" roi de children:[] rong o cha.
  Dung: {"id":"dm_root","type_form":0,"children":[{"id":"dm_kh","parentId":"dm_root","type_form":1,...}]}
  SAI:  {"id":"dm_root","type_form":0,"children":[]}, {"id":"dm_kh","parentId":"","type_form":1,...}
- Rule click menu:
  + Node nhom (type_form=0) phai co children[] khong rong.
  + Node la (menu chuc nang) KHONG duoc de type_form=0.
  + type_form=1/2/6 bat buoc co table_name.
  + type_form=3 bat buoc co dynamic_link_url.
  + type_form=4 bat buoc co auto_code_name.
- Rule report noi bo:
  + Bao cao noi bo dung report_name + trigger.report_db (route /system/grid/:menuId).
  + KHONG duoc bien bao cao noi bo thanh type_form=3 + dynamic_link_url '/reports/...'.
  + Neu co report_name thi uu tien type_form=1 (hoac type_form dang duoc yeu cau), KHONG dung type_form=3.
- Neu yeu cau nghiep vu co ket noi master-detail, bao cao, combo phu thuoc: phai tao du trigger va f_cbo_query tuong ung.
- Type 6 (Kanban Board): uu tien co kanban_config hop le (JSON object), table_name, id/status/title fields theo config.
- Neu yeu cau la bao cao/dashboard tong hop cua he thong, uu tien su dung report_name + trigger.report_db + cac field loc trong table de runtime CsmReport tu render.
- Chi dung dynamic_link_url khi thuc su can dieu huong sang mot URL/route ben ngoai co san.
- Semantic field mapping:
  + cac field gia/ngan sach/chi phi/doanh thu/tong_tien -> f_types="price"
  + field trang_thai/loai/nguon/muc_do -> f_types="co" + f_cbo_query

## CHECKLIST TU KIEM TRA TRUOC KHI TRA KET QUA
- Doi chieu tung dau muc yeu cau khach hang -> da co menu/field/trigger tuong ung chua.
- So luong menu chuc nang da du theo so nhom nghiep vu khach hang yeu cau (khong tra ve qua it).
- Khong co menu type_form=0 dang la node la.
- Khong co menu report noi bo bi doi sang dynamic_link_url.
- Cac field tien te/ngan sach da dung f_types="price".

## OUTPUT SHAPE (SCHEMA)
- Moi menu item uu tien co day du key: id, label, trigger, m_icons, field_root, report_name,
  orientation, p_width, p_height, m_show, g_readonly, table_name, type_menu, type_form,
  row_type_edit, dev, prefix_pk, table_pagesize, menu_id, parentId, children.
- Moi field trong table uu tien co key: id, f_name, f_pkid, f_sort, f_align, f_stt, f_header,
  f_filter, f_width, f_sorting, f_types, f_show, f_cbo_query, f_dec, f_showgrid, f_showonreport, f_alert_query.

## DINH DANG DAU RA BAT BUOC
{ "menu": [...], "notes": [...], "warnings": [...] }
TUYET DOI KHONG tra ve JSON array don thuan ([ ... ]) hay chuoi text. Chi tra ve JSON object { "menu": [...] } duy nhat.

## LUU Y TOKEN
Khong lap lai JSON mau dai. Tap trung logic nghiep vu va tra ve JSON menu hoan chinh, dung schema.`;

  return trimToMax(prompt, 26000);
}

function buildRefinementPrompt(
  appId: string | undefined,
  baseRequest: string,
  refineRequest: string,
  previousResultJson: string,
  scope: "minimal" | "complete" = "complete",
  currentMenus?: MenuItemType[],
  sampleMenus?: MenuItemType[],
  isSampleBase?: boolean,
): string {
  const referenceMenus = Array.isArray(currentMenus) && currentMenus.length > 0
    ? currentMenus
    : [];

  const enforcerPrompt = trimToMax(AI_PROMPTS.EXTRACTION_AND_VALIDATION || "", 4500);
  const sysArchContext = trimToMax(AI_PROMPTS.SYSTEM_ARCHITECTURE || "", 7000);
  const mainPrompt = trimToMax(AI_PROMPTS.MAIN_MENU_DESIGNER || "", 5000);
  const extractorPrompt = trimToMax(AI_PROMPTS.REQUIREMENT_EXTRACTOR || "", 1000);
  const selectorGuide = trimToMax(AI_PROMPTS.TYPE_SELECTION_GUIDE || "", 1400);

  const requestCore = trimToMax(baseRequest || "(khong co)", 9000);
  const refineCore = trimToMax(refineRequest || "", 4000);
  const detectedModules = extractRequirementModules(`${baseRequest || ""}\n${refineRequest || ""}`, 25);
  const detectedTables = extractRequirementTables(`${baseRequest || ""}\n${refineRequest || ""}`, 40);
  const moduleChecklist = detectedModules.length > 0
    ? detectedModules.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
    : "(khong trich xuat duoc module ro rang; AI phai tu phan tich day du theo yeu cau)";
  const tableChecklist = detectedTables.length > 0
    ? detectedTables.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
    : "(khong co ten bang ro rang trong yeu cau)";
  const currentMenuContext = referenceMenus.length > 0
    ? buildCompactMenuContext(referenceMenus, 120)
    : "(khong co menu he thong hien tai de tham chieu)";
  const previousMenuContext = buildPreviousResultContext(previousResultJson, 80);
  const previousMenuContextFull = isSampleBase
    ? buildFullMenuContextFromJson(previousResultJson)
    : "";
  const strictScope = scope === "minimal" ? "uu tien type 1/2/6, chi dung 3/4 khi yeu cau ro" : "duoc dung day du type 1/2/3/4/6";
  const typeCatalog = buildMenuTypeCatalog();
  const menuOrgGuide = buildMenuOrganizationGuide();
  const sampleMenuContext = !isSampleBase && sampleMenus && sampleMenus.length > 0
    ? buildCompactMenuContext(sampleMenus, 100)
    : null;

  const taskHeader = isSampleBase
    ? `## NHIEM VU ADAPT MENU MAU THEO YEU CAU MOI
Day la menu thuc te tu mot ung dung khac. Hay chinh sua, adapt va mo rong de phu hop voi nghiep vu khach hang moi:
1) GIU NGUYEN nhung phan tot: table_name, f_* fields hop le, trigger logic dung, cau truc cha-con.
2) CHINH SUA theo yeu cau: doi label, them/bo/doi ten truong, cap nhat logic nghiep vu trigger.
3) THEM MOI chuc nang ma khach hang can nhung menu mau chua co.
4) Dam bao schema MenuItemType hop le va ${strictScope}.
5) Tra ve TOAN BO menu sau khi adapt (khong tra ve delta).`
    : `## NHIEM VU REFINE (TOI UU TOKEN)
Ban da co ket qua menu lan truoc. Hay cap nhat theo yeu cau moi voi nguyen tac:
1) Giu on dinh phan dung, chi sua phan can thay doi.
2) Van tra ve TOAN BO menu sau khi cap nhat (khong tra ve delta).
3) Dam bao schema MenuItemType hop le va ${strictScope}.
4) Neu thong tin chua du, dua ra gia dinh hop ly va ghi vao warnings.
5) Chuan hoa lai cac menu cu chua dung schema (field generic, trigger sai cho, combo sai format).
6) KHONG don gian hoa qua muc: giu day du cac module nghiep vu theo yeu cau goc + yeu cau bo sung.
7) Giu on dinh id/menu_id/path/parentId khi refine, chi sua phan duoc yeu cau.`;

  const previousResultLabel = isSampleBase
    ? "## MENU MAU DUNG LAM GOC (FULL JSON - UU TIEN CAO NHAT)"
    : "## TOM TAT KET QUA AI LAN TRUOC (COMPACT)";

  const prompt = `${enforcerPrompt}

${sysArchContext}

${mainPrompt}

${extractorPrompt}

${selectorGuide}

${taskHeader}

## APP_ID DANG THIET KE
${String(appId || "")}

## BO MENU TYPE HE THONG DANG CO
${typeCatalog}

## NGUYEN TAC TO CHUC MENU (NGAN GON - BAT BUOC)
${menuOrgGuide}

## YEU CAU GOC (RUT GON)
${requestCore}

## YEU CAU BO SUNG MOI (UU TIEN CAO NHAT)
${refineCore}

## CHECKLIST MODULE BAT BUOC BAO PHU (TRICH TU YEU CAU GOC + BO SUNG)
${moduleChecklist}

## CHECKLIST BANG/ENTITY THAM KHAO (TRICH TU YEU CAU GOC + BO SUNG)
${tableChecklist}

## YEU CAU BAO PHU
- Bat buoc doi chieu tung module trong checklist va tao/giu menu/chuc nang tuong ung.
- Khong duoc lam mat module da co neu yeu cau bo sung khong yeu cau loai bo.
- Trong warnings/notes, neu module nao chua du thong tin thi ghi ro gia dinh da dung.

## MENU HE THONG HIEN TAI (COMPACT REFERENCE)
${currentMenuContext}
${sampleMenuContext ? `\n## MENU MAU THAM KHAO TU CHUONG TRINH KHAC\nDay la menu thuc te da trien khai tu mot chuong trinh khac de ban tham khao cau truc, pattern, va logic nghiep vu:\n${sampleMenuContext}\n` : ""}
${previousResultLabel}
${isSampleBase ? previousMenuContextFull : previousMenuContext}

## SCHEMA GUARDRAIL (BAT BUOC)
- CHI dung table field theo format f_*: f_name, f_header, f_types, f_pkid, f_show, f_width, f_dec.
- KHONG dung field generic: field, label, type, primaryKey, required, editable.
- KHONG dung key "fields" o cap menu. BAT BUOC dung key "table" cho danh sach cot.
- Trigger phai nam trong object "trigger": { "before_save": "...", "after_save": "..." }
- KHONG dung key trigger_* o cap menu (vd: trigger_before_save, trigger_after_save).
- GIA TRI trigger phai la JS code body thuc thi duoc voi dung chu ky:
  before_save/after_save/update: (seft, data, bang) => return object
  afterAdd/afterEdit/afterDelete: (allData, seft, data) => return any
  load_db/report_db: (seft, db) => return Row[]
- KHONG tra ve comment placeholder nhu "/* Validate */ return data". Viet code that hoac ten template co san:
  validate_order_debt_limit, update_order_total, validate_order_item_stock, recalculate_order_total,
  validate_delivery_item_stock, update_stock_on_delivery, validate_receipt_item_quantity, update_stock_on_receipt.
- Field select/combo (f_types co/coro/cbo) BAT BUOC co f_cbo_query KHONG RONG.
  f_cbo_query phai la STRING va chi dung cac dang runtime sau:
  + DANG 1 (query DB): "{\\"query\\":[{\\"obj_name\\":\\"ten_bang\\",\\"fields\\":[\\"id\\",\\"ten\\"],\\"obj_where\\":\\"\\"}],\\"options\\":[]}"
  + DANG 2 (options tinh): "{\\"query\\":[],\\"options\\":[{\\"ma\\":\\"v1\\",\\"ten\\":\\"Nhan 1\\"}]}"
  + DANG 3 (JS tinh toan): "var opts=[];...;return {f_grid:true,f_grid_fields:true,options:opts}"
  + DANG 4 (JS doc data store): "var rows=data[\\"ten_bang\\"].rows||[];...;return {f_grid:true,f_grid_fields:true,options:opts}"
  TUYET DOI KHONG de f_cbo_query rong ("") cho combo field.
- parentId CUA MENU CON PHAI = id cua menu cha. KHONG de tat ca parentId = "" roi de children:[] rong o cha.
  Dung: {"id":"dm_root","type_form":0,"children":[{"id":"dm_kh","parentId":"dm_root","type_form":1,...}]}
  SAI:  {"id":"dm_root","type_form":0,"children":[]}, {"id":"dm_kh","parentId":"","type_form":1,...}
- Rule click menu:
  + Node nhom (type_form=0) phai co children[] khong rong.
  + Node la (menu chuc nang) KHONG duoc de type_form=0.
  + type_form=1/2/6 bat buoc co table_name.
  + type_form=3 bat buoc co dynamic_link_url.
  + type_form=4 bat buoc co auto_code_name.
- Rule report noi bo:
  + Bao cao noi bo dung report_name + trigger.report_db (route /system/grid/:menuId).
  + KHONG duoc bien bao cao noi bo thanh type_form=3 + dynamic_link_url '/reports/...'.
  + Neu co report_name thi uu tien type_form=1 (hoac type_form dang duoc yeu cau), KHONG dung type_form=3.
- Neu refine tu menu cu: giu id/menu_id/path/menu cha-con toi da, chi thay doi phan duoc yeu cau.
- Type 6 (Kanban Board) can uu tien kanban_config chuyen biet.
- Neu menu mang tinh chat bao cao/dashboard tong hop thi uu tien report_name + trigger.report_db thay vi path crm/reports/dashboard.
- Neu AI xuat menu ten Dashboard/Bao cao tong hop/KPI ma lai khong co report_name hoac auto_code_name thi phai tu sua lai truoc khi tra ket qua.
- KHONG tu them module/tinh nang khong co trong yeu cau goc + yeu cau bo sung.
- Semantic field mapping:
  + cac field gia/ngan sach/chi phi/doanh thu/tong_tien -> f_types="price"
  + field trang_thai/loai/nguon/muc_do -> f_types="co" + f_cbo_query

## CHECKLIST TU KIEM TRA TRUOC KHI TRA KET QUA
- Doi chieu tung dau muc yeu cau goc + yeu cau bo sung -> da co menu/field/trigger tuong ung chua.
- So luong menu chuc nang da du theo so nhom nghiep vu duoc yeu cau (khong tra ve qua it).
- Khong co menu type_form=0 dang la node la.
- Khong co menu report noi bo bi doi sang dynamic_link_url.
- Cac field tien te/ngan sach da dung f_types="price".

## OUTPUT SHAPE (SCHEMA)
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

  return isSampleBase ? prompt : trimToMax(prompt, 30000);
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

  // Auto-detect: if f_types is a plain text type but f_cbo_query has a real value,
  // the AI forgot to set the correct combo type — upgrade to co by default.
  const PLAIN_TEXT_TYPES = /^(ed|txt|text|ro|string)?$/i;
  if (PLAIN_TEXT_TYPES.test(String(normalized.f_types || "ed"))) {
    const rawCboQuery = normalized.f_cbo_query ?? raw.cbo_query ?? raw.options ?? raw.foreignKey;
    const hasCboValue = rawCboQuery != null && rawCboQuery !== ""
      && !(typeof rawCboQuery === "object" && !Array.isArray(rawCboQuery) && Object.keys(rawCboQuery).length === 0);
    if (hasCboValue) {
      normalized.f_types = raw.editable === false ? "coro" : "co";
    }
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

function toFiniteNumber(value: any): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function isSupportedTypeForm(value: any): value is number {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 6;
}

function inferTypeForm(node: any): number {
  const explicit = toFiniteNumber(node?.type_form);
  const fromType = toFiniteNumber(node?.type);

  const tableName = String(node?.table_name || "").trim();
  const tableFields = Array.isArray(node?.table)
    ? node.table
    : Array.isArray(node?.fields)
      ? node.fields
      : [];
  const children = Array.isArray(node?.children)
    ? node.children
    : Array.isArray(node?.nodes)
      ? node.nodes
      : [];
  const hasChildren = children.length > 0;

  // Strong signals first.
  if (node?.kanban_config != null) return 6;
  if (String(node?.auto_code_name || "").trim()) return 4;
  if (String(node?.dynamic_link_url || node?.v_link || node?.externalLink || "").trim()) return 3;

  // Container node: has children but no own table payload.
  if (hasChildren && !tableName && tableFields.length === 0) return 0;

  // Khi type_form=1/2 mà không có table payload, ưu tiên field "type" nếu hợp lệ.
  if ((explicit === 1 || explicit === 2) && !tableName && tableFields.length === 0 && isSupportedTypeForm(fromType) && fromType !== explicit) {
    return fromType;
  }

  // Prefer explicit type_form when valid.
  if (isSupportedTypeForm(explicit)) return explicit;

  // Fallback: dùng field "type" nếu trông giống type_form.
  if (isSupportedTypeForm(fromType)) return fromType;

  if (hasChildren && tableName) return 2;
  if (tableName || tableFields.length > 0) return 1;
  return 0;
}

function normalizeNodeByTypeForm(node: any, typeForm: number): void {
  // Keep schema minimal and avoid invalid cross-type leftovers.
  if (typeForm === 0) {
    node.table_name = "";
    node.table = [];
    delete node.dynamic_link_url;
    delete node.v_link;
    delete node.externalLink;
    delete node.auto_code_name;
    delete node.kanban_config;
    return;
  }

  if (typeForm !== 3) {
    delete node.dynamic_link_url;
  }
  if (typeForm !== 4) {
    delete node.auto_code_name;
  }
  if (typeForm !== 6) {
    delete node.kanban_config;
  }

  if (typeForm !== 1 && typeForm !== 2 && typeForm !== 6 && !String(node.table_name || "").trim()) {
    node.table = [];
  }
}

const KANBAN_STAGE_COLORS = ["blue", "orange", "green", "red", "purple", "cyan", "gold"];

function normalizeKanbanConfig(raw: any): any {
  if (!raw || typeof raw !== "object") return raw ?? {};
  const normalized = { ...raw };

  // Normalize stages: string[] → {id,label,color}[]
  if (Array.isArray(normalized.stages)) {
    normalized.stages = normalized.stages.map((s: any, i: number) => {
      if (s && typeof s === "object" && s.id !== undefined) return s; // already correct
      const label = String(s ?? "");
      const id = label.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || `stage_${i}`;
      return { id, label, color: KANBAN_STAGE_COLORS[i % KANBAN_STAGE_COLORS.length] };
    });
  }

  // Normalize fields shorthand: string[] → proper config keys
  if (Array.isArray(normalized.fields)) {
    const [pkField, titleField, stageField, dueDateField] = normalized.fields;
    if (!normalized.pkField && pkField) normalized.pkField = pkField;
    if (!normalized.titleField && titleField) normalized.titleField = titleField;
    if (!normalized.stageField && stageField) normalized.stageField = stageField;
    if (!normalized.dueDateField && dueDateField) normalized.dueDateField = dueDateField;
    delete normalized.fields;
  }

  // Ensure tableName from table_name sibling if missing
  if (!normalized.tableName && normalized.table_name) {
    normalized.tableName = normalized.table_name;
  }

  return normalized;
}

function normalizeAiMenuNode(input: any): MenuItemType {
  const node: any = input && typeof input === "object" ? { ...input } : {};

  const resolvedTypeForm = inferTypeForm(node);

  const normalized: any = {
    ...node,
    id: String(node.id || "menu_undefined"),
    parentId: node.parentId ?? "",
    type_form: resolvedTypeForm,
  };

  const sourceFields = Array.isArray(node.table)
    ? node.table
    : Array.isArray(node.fields)
      ? node.fields
      : [];

  if (sourceFields.length > 0) {
    normalized.table = sourceFields.map(normalizeTableField);
    delete normalized.fields;
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

  // Normalize kanban_config stages and fields shorthand
  if (resolvedTypeForm === 6 && normalized.kanban_config != null) {
    normalized.kanban_config = normalizeKanbanConfig(normalized.kanban_config);
    if (!normalized.kanban_config.tableName && normalized.table_name) {
      normalized.kanban_config.tableName = normalized.table_name;
    }
  }

  normalizeNodeByTypeForm(normalized, resolvedTypeForm);

  return normalized as MenuItemType;
}

function normalizeAiMenuSchema(menus: MenuItemType[]): MenuItemType[] {
  return (Array.isArray(menus) ? menus : []).map((menu) => normalizeAiMenuNode(menu));
}

function normalizeFieldShape(field: any, index: number, menuId: string): any {
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

function applyMenuShape(menus: MenuItemType[]): MenuItemType[] {
  const walk = (nodes: MenuItemType[], parentId: string, pathPrefix: string): MenuItemType[] => {
    return (Array.isArray(nodes) ? nodes : []).map((rawNode, index) => {
      const menuId = rawNode.id ? String(rawNode.id) : `${Date.now()}_${Math.random().toString(16).slice(2, 14)}`;
      const nextMenuId = String((rawNode as any).menu_id || (pathPrefix ? `${pathPrefix}.${index + 1}` : `${index + 1}`));
      const childrenInput = Array.isArray((rawNode as any).children)
        ? ((rawNode as any).children as MenuItemType[])
        : [];

      const sourceFields = Array.isArray((rawNode as any).table)
        ? ((rawNode as any).table as any[])
        : Array.isArray((rawNode as any).fields)
          ? ((rawNode as any).fields as any[])
          : [];

      const table = sourceFields.map((f, idx) => normalizeFieldShape(f, idx, menuId));

      const typeForm = inferTypeForm(rawNode);
      
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
        ...(typeForm === 6 && { kanban_config: normalizeKanbanConfig((rawNode as any).kanban_config ?? {}) }),
      };

      delete (node as any).fields;

      normalizeNodeByTypeForm(node, typeForm);

      if (typeForm === 1 || typeForm === 2 || typeForm === 6) {
        delete (node as any).path;
      }

      if (typeForm !== 3) {
        delete (node as any).dynamic_link_url;
      }

      if (typeForm !== 4) {
        delete (node as any).auto_code_name;
      }

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

function buildMenuTypeCatalog(): string {
  return [
    "- 0=Group: chi de to chuc cay menu, khong CRUD.",
    "- 1=Grid, 2=Master-Detail, 6=Kanban: bat buoc co table_name.",
    "- 3=Dynamic Link: bat buoc co dynamic_link_url.",
    "- 4=Dynamic Code: bat buoc co auto_code_name.",
    "- Bao cao noi bo: report_name + trigger.report_db (khong doi sang type 3).",
    "- Node group (type 0) phai co children; menu con phai parentId dung cha.",
    "- Field combo (co/coro/cbo) bat buoc co f_cbo_query string khong rong.",
    "- Trigger chi dat trong object trigger; khong dung trigger_* o cap menu.",
    "- Type 1/2/6 thuong khong can path (runtime /system/grid/:menuId).",
    "- Khong tu them module ngoai yeu cau; khong tao lai menu he thong co san.",
  ].join("\n");
}

function buildMenuOrganizationGuide(): string {
  return [
    "1) Chia theo nhom nghiep vu: moi nhom la 1 node type_form=0, ben trong la menu chuc nang.",
    "2) Menu chuc nang khong duoc de type_form=0; chon type dung muc dich 1/2/3/4/6.",
    "3) CRUD uu tien type 1/2; Kanban dung type 6; chi dung 3/4 khi yeu cau ro.",
    "4) Bao cao noi bo phai dung report_name + trigger.report_db, khong dung dynamic_link_url.",
    "5) Table field theo schema f_* va dung key table (khong dung fields).",
    "6) Giu on dinh id/menu_id/path/parentId khi refine, chi sua phan duoc yeu cau.",
    "7) He thong da co san menu Quan tri: nguoi dung, vai tro/phan quyen, menu he thong, nhom quyen. Khong thiet ke lai neu khach hang khong yeu cau ro.",
  ].join("\n");
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

function buildFullMenuContextFromJson(previousResultJson: string, maxChars?: number): string {
  const raw = String(previousResultJson || "").trim();
  if (!raw) return "(khong co menu goc)";

  try {
    const parsed = JSON.parse(raw);
    const menuList = Array.isArray(parsed?.menu)
      ? parsed.menu
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (!Array.isArray(menuList) || menuList.length === 0) {
      return typeof maxChars === "number" && maxChars > 0 ? trimToMax(raw, maxChars) : raw;
    }

    const normalized = normalizeMenuList(menuList as MenuItemType[]);
    const payload = {
      menu: normalized,
      notes: Array.isArray((parsed as any)?.notes) ? (parsed as any).notes : [],
      warnings: Array.isArray((parsed as any)?.warnings) ? (parsed as any).warnings : [],
    };

    const fullJson = JSON.stringify(payload, null, 2);
    return typeof maxChars === "number" && maxChars > 0 ? trimToMax(fullJson, maxChars) : fullJson;
  } catch {
    return typeof maxChars === "number" && maxChars > 0 ? trimToMax(raw, maxChars) : raw;
  }
}

function ensureMenuDefaults(menu: MenuItemType): MenuItemType {
  const next: MenuItemType = { ...menu };

  if ((next as any).name_en && !next.label_en) next.label_en = (next as any).name_en;
  if ((next as any).name_zh && !next.label_zh) next.label_zh = (next as any).name_zh;
  if ((next as any).name_vi && !next.label) next.label = (next as any).name_vi;

  if ((next as any).label_vi && !next.label) next.label = (next as any).label_vi;
  if ((next as any).name_vi && !next.name) next.name = (next as any).name_vi;
  if ((next as any).label_sh && !next.label_zh) next.label_zh = (next as any).label_sh;
  if ((next as any).name_sh && !next.name_zh) next.name_zh = (next as any).name_sh;

  if (isPlainObject(next.label)) {
    const labelObj = next.label as any;
    if (labelObj.vi && !(next as any).label_vi) (next as any).label_vi = String(labelObj.vi);
    if (labelObj.en && !next.label_en) next.label_en = String(labelObj.en);
    if ((labelObj.zh || labelObj.cn) && !next.label_zh) next.label_zh = String(labelObj.zh || labelObj.cn);
    next.label = String(labelObj.vi || labelObj.en || labelObj.zh || labelObj.cn || next.name || next.id || "");
  }

  if (isPlainObject(next.name)) {
    const nameObj = next.name as any;
    if (nameObj.vi && !(next as any).name_vi) (next as any).name_vi = String(nameObj.vi);
    if (nameObj.en && !next.name_en) next.name_en = String(nameObj.en);
    if ((nameObj.zh || nameObj.cn) && !next.name_zh) next.name_zh = String(nameObj.zh || nameObj.cn);
    next.name = String(nameObj.vi || nameObj.en || nameObj.zh || nameObj.cn || next.label || next.id || "");
  }

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
  const shaped = applyMenuShape(schemaNormalized);
  return shaped.map(ensureMenuDefaults);
}

function hasMeaningfulValue(value: any): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function mergeFieldList(existingFields: any[], incomingFields: any[]): any[] {
  if (!Array.isArray(existingFields) || existingFields.length === 0) return incomingFields || [];
  if (!Array.isArray(incomingFields) || incomingFields.length === 0) return existingFields;

  const keyOf = (field: any, index: number) => String(field?.f_name || field?.id || `idx_${index}`);
  const byKey = new Map<string, any>();
  existingFields.forEach((f, idx) => byKey.set(keyOf(f, idx), { ...f }));

  incomingFields.forEach((incoming, idx) => {
    const key = keyOf(incoming, idx);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...incoming });
      return;
    }

    const merged = { ...existing };
    Object.keys(incoming || {}).forEach((k) => {
      const nextVal = (incoming as any)[k];
      const prevVal = (existing as any)[k];
      if (!hasMeaningfulValue(prevVal) && hasMeaningfulValue(nextVal)) {
        (merged as any)[k] = nextVal;
      }
    });
    byKey.set(key, merged);
  });

  return Array.from(byKey.values());
}

function mergeObjectFillMissing(existingObj: Record<string, any>, incomingObj: Record<string, any>) {
  const merged: Record<string, any> = { ...(existingObj || {}) };
  Object.keys(incomingObj || {}).forEach((key) => {
    const prevVal = merged[key];
    const nextVal = incomingObj[key];

    if (Array.isArray(prevVal) && Array.isArray(nextVal)) {
      merged[key] = nextVal.length > 0 ? nextVal : prevVal;
      return;
    }

    if (
      prevVal && typeof prevVal === "object" && !Array.isArray(prevVal)
      && nextVal && typeof nextVal === "object" && !Array.isArray(nextVal)
    ) {
      merged[key] = mergeObjectFillMissing(prevVal, nextVal);
      return;
    }

    if (!hasMeaningfulValue(prevVal) && hasMeaningfulValue(nextVal)) {
      merged[key] = nextVal;
    }
  });
  return merged;
}

function mergeMenuNodeNonDestructive(existing: MenuItemType, incoming: MenuItemType): MenuItemType {
  const merged: any = { ...existing };
  const incomingObj: any = incoming || {};

  Object.keys(incomingObj).forEach((key) => {
    if (key === "children") return;
    const prevVal = (merged as any)[key];
    const nextVal = incomingObj[key];

    if (key === "table") {
      (merged as any)[key] = mergeFieldList(
        Array.isArray(prevVal) ? prevVal : [],
        Array.isArray(nextVal) ? nextVal : [],
      );
      return;
    }

    if (key === "trigger") {
      const prevObj = prevVal && typeof prevVal === "object" ? prevVal : {};
      const nextObj = nextVal && typeof nextVal === "object" ? nextVal : {};
      (merged as any)[key] = mergeObjectFillMissing(prevObj, nextObj);
      return;
    }

    if (
      prevVal && typeof prevVal === "object" && !Array.isArray(prevVal)
      && nextVal && typeof nextVal === "object" && !Array.isArray(nextVal)
    ) {
      (merged as any)[key] = mergeObjectFillMissing(prevVal, nextVal);
      return;
    }

    if (!hasMeaningfulValue(prevVal) && hasMeaningfulValue(nextVal)) {
      (merged as any)[key] = nextVal;
    }
  });

  return merged as MenuItemType;
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

    const merged: MenuItemType = mergeMenuNodeNonDestructive(existing, incoming);
    (merged as any).children = undefined;

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

function isLikelyMenuNode(value: any): boolean {
  if (!isPlainObject(value)) return false;
  const hasId = typeof value.id === "string" && value.id.trim().length > 0;
  const hasMenuShape =
    Object.prototype.hasOwnProperty.call(value, "type_form")
    || Object.prototype.hasOwnProperty.call(value, "table_name")
    || Array.isArray((value as any).table)
    || Array.isArray((value as any).children);
  return !!hasId && !!hasMenuShape;
}

function extractMenuListFromPayload(payload: any): MenuItemType[] {
  if (!payload) return [];

  if (Array.isArray(payload?.menu)) return payload.menu as MenuItemType[];
  if (isLikelyMenuNode(payload?.menu)) return [payload.menu as MenuItemType];
  if (Array.isArray(payload)) return payload as MenuItemType[];
  if (isLikelyMenuNode(payload)) return [payload as MenuItemType];

  const nestedData = payload?.data;
  if (Array.isArray(nestedData?.menu)) return nestedData.menu as MenuItemType[];
  if (isLikelyMenuNode(nestedData?.menu)) return [nestedData.menu as MenuItemType];
  if (Array.isArray(nestedData)) return nestedData as MenuItemType[];
  if (isLikelyMenuNode(nestedData)) return [nestedData as MenuItemType];

  return [];
}

function isComboType(rawType: any): boolean {
  return /co|coro|cbo/i.test(String(rawType || ""));
}

function isValidComboQueryShape(rawQuery: any): boolean {
  const text = String(rawQuery || "").trim();
  if (!text) return false;
  if (/\breturn\b/.test(text)) return true;
  // Accept static: shorthand that normalizeComboQueryValue converts at runtime.
  if (/^static:/i.test(text)) return true;
  // Accept raw SQL SELECT that normalizeComboQueryValue converts at runtime.
  if (/^select\s+.+\s+from\s+/i.test(text)) return true;

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
      const rawLabel = (node as any).label || (node as any).name || id;
      const label = rawLabel && typeof rawLabel === "object"
        ? String(rawLabel.vi || rawLabel.en || rawLabel.jp || id)
        : String(rawLabel || id);
      const path = parentPath ? `${parentPath} > ${label}` : label;
      const typeForm = Number((node as any).type_form || 0);
      const tableName = String((node as any).table_name || "").trim();
      const trigger = (node as any).trigger;
      const reportName = String((node as any).report_name || "").trim();
      const fields = Array.isArray((node as any).table) ? (node as any).table : [];
      const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
      const isContainerLike = children.length > 0 && !tableName && fields.length === 0;
      const normalizedTrigger = trigger && typeof trigger === "object" ? trigger : {};
      const hasReportDbTrigger = !!String((normalizedTrigger as any).report_db || "").trim();
      const isReportRuntime = !!reportName || hasReportDbTrigger;

      if ((typeForm === 1 || typeForm === 2) && !tableName && !isContainerLike && !isReportRuntime) {
        issues.push({
          severity: "error",
          rule: "table_name_required",
          path,
          message: "Menu type_form=1/2 thiếu table_name.",
        });
      }

      if ((typeForm === 1 || typeForm === 2) && isContainerLike) {
        issues.push({
          severity: "warning",
          rule: "container_type_should_be_zero",
          path,
          message: "Menu cha co children nhung khong co table_name/table. Nen dung type_form=0 (menu nhom).",
        });
      }

      // Report runtime (CsmReport): must have trigger.report_db to supply data; report_name can be added later by user.
      if (isReportRuntime && !hasReportDbTrigger) {
        issues.push({
          severity: "warning",
          rule: "report_db_recommended_for_report_runtime",
          path,
          message: "Menu bao cao runtime nen co trigger.report_db de cap du lieu bao cao.",
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

      if (typeForm === 6 && !tableName) {
        issues.push({
          severity: "warning",
          rule: "workspace_table_recommended",
          path,
          message: `Menu type_form=${typeForm} nên có table_name để đồng bộ CRUD/runtime.`,
        });
      }

      if (typeForm === 6 && !(node as any).kanban_config) {
        issues.push({
          severity: "warning",
          rule: "kanban_config_recommended",
          path,
          message: "Menu type_form=6 nên có kanban_config để cấu hình board.",
        });
      }

      if ((typeForm === 1 || typeForm === 2 || typeForm === 6) && String((node as any).path || "").trim()) {
        issues.push({
          severity: "warning",
          rule: "path_not_needed_for_grid_runtime",
          path,
          message: `Menu type_form=${typeForm} không cần path; nên để trống để tránh route sai.`,
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

      if (children.length > 0) {
        walk(children, path);
      }
    });
  };

  walk(menus, "");
  return issues;
}

function detectSevereAiOutputIssues(menus: MenuItemType[], requestText: string): string[] {
  const issues: string[] = [];
  const allNodes = flattenMenuNodes(Array.isArray(menus) ? menus : [], 500);
  const functionalNodes = allNodes.filter((node) => Number((node as any).type_form || 0) !== 0);
  const normalizeText = (v: any) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nodeSignals = functionalNodes.map((node) => {
    const label = (node as any).label || (node as any).label_vi || (node as any).name || "";
    const tableName = (node as any).table_name || "";
    return normalizeText(`${label} ${tableName}`);
  });

  if (!Array.isArray(menus) || menus.length === 0) {
    issues.push("Khong co menu nao duoc tao.");
    return issues;
  }

  const requiredModules = extractRequirementModules(requestText || "", 20);
  if (requiredModules.length >= 2) {
    const expectedMin = Math.max(2, Math.min(requiredModules.length, 8));
    if (functionalNodes.length < expectedMin) {
      issues.push(`So menu chuc nang qua it (${functionalNodes.length}/${expectedMin}) so voi yeu cau.`);
    }

    const missingModules: string[] = [];
    for (const moduleName of requiredModules) {
      const moduleNorm = normalizeText(moduleName);
      const moduleTokens = moduleNorm.split(/\s+/).filter((token) => token.length >= 3);
      const covered = nodeSignals.some((signal) => {
        if (signal.includes(moduleNorm)) return true;
        if (moduleTokens.length === 0) return false;
        const matched = moduleTokens.filter((token) => signal.includes(token)).length;
        return matched >= Math.max(1, Math.ceil(moduleTokens.length * 0.5));
      });
      if (!covered) {
        missingModules.push(moduleName);
      }
    }

    if (missingModules.length > 0) {
      issues.push(`Thieu bao phu module: ${missingModules.slice(0, 8).join(", ")}.`);
    }
  }

  let unknownFieldCount = 0;
  let totalFieldCount = 0;

  for (const node of functionalNodes) {
    const typeForm = Number((node as any).type_form || 0);
    const tableName = String((node as any).table_name || "").trim();
    const fields = Array.isArray((node as any).table) ? ((node as any).table as any[]) : [];

    if ((typeForm === 1 || typeForm === 2 || typeForm === 6) && !tableName) {
      issues.push(`Menu ${String((node as any).label || (node as any).id || "(unknown)")} thieu table_name.`);
    }

    if ((typeForm === 1 || typeForm === 2 || typeForm === 6) && fields.length === 0) {
      issues.push(`Menu ${String((node as any).label || (node as any).id || "(unknown)")} khong co field trong table.`);
    }

    for (const field of fields) {
      totalFieldCount += 1;
      const fName = String(field?.f_name || "").trim().toLowerCase();
      if (!fName || fName === "field_unknown" || fName.includes("unknown")) {
        unknownFieldCount += 1;
      }
    }
  }

  if (unknownFieldCount > 0) {
    issues.push(`Co ${unknownFieldCount} field placeholder (field_unknown/unknown).`);
  }

  if (totalFieldCount > 0 && (unknownFieldCount / totalFieldCount) >= 0.35) {
    issues.push("Ti le field placeholder qua cao, output chua dat chat luong de ap dung.");
  }

  return uniqueStrings(issues, 10);
}

function buildAutoRepairRefineText(issues: string[]): string {
  const lines = (Array.isArray(issues) ? issues : []).map((item) => `- ${item}`);
  return [
    "KET QUA TRUOC CHUA DAT CHAT LUONG. HAY SUA LAI TOAN BO MENU.",
    "YEU CAU BAT BUOC:",
    "- KHONG duoc dung field_unknown hoac bat ky placeholder unknown nao.",
    "- Bao phu day du cac module nghiep vu trong yeu cau.",
    "- Bat buoc map day du checklist module yeu cau vao menu/chuc nang tuong ung.",
    "- Moi menu type 1/2/6 phai co table_name + table fields hop le.",
    "- Trigger/f_cbo_query phai hop le theo schema guardrail.",
    "LOI PHAT HIEN:",
    ...(lines.length > 0 ? lines : ["- Output cu qua so sai schema nghiep vu."]),
  ].join("\n");
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
  const [sampleAppList, setSampleAppList] = useState<any[]>([]);
  const [sampleAppId, setSampleAppId] = useState<string | undefined>(undefined);
  const [sampleMenuLoading, setSampleMenuLoading] = useState(false);
  const [sampleMenuParsed, setSampleMenuParsed] = useState<MenuItemType[] | null>(null);
  const [sampleMenuError, setSampleMenuError] = useState<string | null>(null);
  const [sampleUseAsBase, setSampleUseAsBase] = useState(false);
  const [aiProgress, setAiProgress] = useState<AiProgressState | null>(null);

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

  const sampleAppOptions = useMemo(() => {
    const toLabel = (raw: any, fallback: string): string => {
      if (!raw) return fallback;
      if (typeof raw === "object") return String(raw.vi || raw.en || raw.zh || fallback);
      return String(raw);
    };
    const rows = [
      { label: "CSM", value: "csm" },
      ...((sampleAppList || []).map((app) => ({
        label: toLabel(app?.app_name, app?.app_id || ""),
        value: app?.app_id,
      }))),
    ].filter((opt) => !!opt.value);

    const seen = new Set<string>();
    return rows.filter((opt) => {
      if (seen.has(opt.value)) return false;
      seen.add(opt.value);
      return true;
    });
  }, [sampleAppList]);

  const sampleAppLabel = useMemo(() => {
    if (!sampleAppId) return "";
    const hit = sampleAppOptions.find((opt) => opt.value === sampleAppId);
    return hit?.label || sampleAppId;
  }, [sampleAppId, sampleAppOptions]);

  useEffect(() => {
    const loadApps = async () => {
      try {
        const res = await fetchAppList();
        const list = (res as any)?.result?.list || [];
        setSampleAppList(Array.isArray(list) ? list : []);
      } catch (error) {
        console.warn("Failed to load app list for sample menu:", error);
      }
    };
    loadApps();
  }, []);

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

  const loadSampleMenuFromApp = async (targetAppId: string) => {
    if (!targetAppId) {
      setSampleMenuParsed(null);
      setSampleMenuError(null);
      return;
    }
    setSampleMenuLoading(true);
    try {
      const res = await fetchMenuList(targetAppId);
      const rawMenuList = (res as any)?.result?.list || [];
      if (!Array.isArray(rawMenuList) || rawMenuList.length === 0) {
        setSampleMenuParsed(null);
        setSampleMenuError(`Không tìm thấy menu mẫu trong ứng dụng ${targetAppId}.`);
        return;
      }
      const normalized = normalizeMenuList(rawMenuList);
      setSampleMenuParsed(normalized);
      setSampleMenuError(null);
      message.success(`Đã nạp ${normalized.length} menu gốc từ app ${targetAppId} làm mẫu cho AI.`);
    } catch (e: any) {
      setSampleMenuParsed(null);
      setSampleMenuError(`Không thể tải menu mẫu từ app ${targetAppId}: ${e?.message || "Unknown error"}`);
    } finally {
      setSampleMenuLoading(false);
    }
  };

  const handleSampleAppChange = async (value: string) => {
    setSampleAppId(value);
    await loadSampleMenuFromApp(value);
  };

  const handleClearSampleMenu = () => {
    setSampleAppId(undefined);
    setSampleMenuParsed(null);
    setSampleMenuError(null);
    setSampleUseAsBase(false);
  };

  const runGenerate = async (
    inputRequest: string,
    scope: "minimal" | "complete" = "complete",
    promptOverride?: string,
    attempt: number = 0,
  ) => {
    if (!appId) {
      message.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn app");
      return;
    }
    if (!inputRequest.trim()) {
      message.warning(t("system.menu.aiDesigner.enterRequirement") || "Hãy nhập yêu cầu khách hàng");
      return;
    }

    const prompt = promptOverride || buildPromptWithRequirement(appId, inputRequest, scope, currentMenus, sampleMenuParsed || undefined);
    setLoading(true);
    setAiMenus(null);
    const preparingProgress: AiProgressState = {
      status: "preparing",
      stage: "preparing",
      message: "Đang chuẩn bị và gửi yêu cầu AI",
      current: 0,
      total: 1,
      percent: 0,
      elapsedMs: 0,
    };
    setAiProgress(preparingProgress);
    setAiResultText(buildAiProgressResultText(preparingProgress));

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

      const res = await generateSeoContentWithPrompt(prompt, {
        onProgress: (progress) => {
          const nextProgress: AiProgressState = {
            jobId: progress?.jobId,
            status: progress?.status,
            stage: progress?.stage,
            message: progress?.message,
            current: Number(progress?.current ?? 0),
            total: Number(progress?.total ?? 1),
            percent: Number(progress?.percent ?? 0),
            elapsedMs: Number(progress?.elapsedMs ?? 0),
            waitingMs: Number(progress?.waitingMs ?? 0),
            level: progress?.level != null ? Number(progress.level) : undefined,
          };
          setAiProgress(nextProgress);
          setAiResultText((prev) => {
            const nextText = buildAiProgressResultText(nextProgress);
            return nextText || prev;
          });
        },
      });
      const payload = extractAiPayload(res);
      if (!payload) {
        message.error(t("system.menu.aiDesigner.invalidJson") || "AI trả về không đúng JSON");
        setAiResultText(String(res?.message || "AI error"));
        setAiProgress((prev) => ({
          ...(prev || {}),
          status: "failed",
          stage: "failed",
          message: String(res?.message || "AI error"),
          percent: prev?.percent ?? 0,
        }));
        return;
      }

      const menuPayload = extractMenuListFromPayload(payload);
      if (menuPayload.length === 0) {
        message.warning(t("system.menu.aiDesigner.emptyMenu") || "AI chưa trả về danh sách menu");
      }

      const normalized = normalizeMenuList(menuPayload);
      const output = {
        menu: normalized,
        notes: Array.isArray(payload?.notes)
          ? payload.notes
          : Array.isArray(payload?.data?.notes)
            ? payload.data.notes
            : [],
        warnings: Array.isArray(payload?.warnings)
          ? payload.warnings
          : Array.isArray(payload?.data?.warnings)
            ? payload.data.warnings
            : [],
      };

      const severeIssues = detectSevereAiOutputIssues(normalized, inputRequest);
      if (severeIssues.length > 0 && attempt < 1) {
        const autoRefineText = buildAutoRepairRefineText(severeIssues);
        const autoRepairPrompt = buildRefinementPrompt(
          appId,
          inputRequest,
          autoRefineText,
          JSON.stringify(output),
          "complete",
          currentMenus,
          sampleMenuParsed || undefined,
        );

        setAiProgress({
          status: "running",
          stage: "refining",
          message: "Ket qua AI lan 1 chua dat. Dang tu dong sua va tao lai...",
          current: 0,
          total: 1,
          percent: 0,
        });
        setAiResultText(JSON.stringify({
          success: false,
          stage: "refining",
          message: "KQ lan 1 chua dat chat luong, dang auto-refine.",
          issues: severeIssues,
        }, null, 2));

        await runGenerate(inputRequest, scope, autoRepairPrompt, attempt + 1);
        return;
      }

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

      setAiProgress((prev) => ({
        ...(prev || {}),
        status: "completed",
        stage: "completed",
        message: `Đã hoàn tất tạo ${normalized.length} menu/chức năng`,
        current: 1,
        total: 1,
        percent: 100,
      }));

      message.success(t("system.menu.aiDesigner.generateSuccess") || "Đã tạo menu bằng AI");
    } catch (error) {
      console.error("AI menu generation failed:", error);
      setAiProgress((prev) => ({
        ...(prev || {}),
        status: "failed",
        stage: "failed",
        message: error instanceof Error ? error.message : "Lỗi gọi AI",
      }));
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
      appId,
      storedRequest,
      refineText,
      aiResultText,
      "complete",
      currentMenus,
      sampleMenuParsed || undefined,
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
    if (sampleUseAsBase && sampleMenuParsed && sampleMenuParsed.length > 0) {
      const baseJson = JSON.stringify({ menu: sampleMenuParsed }, null, 2);
      const prompt = buildRefinementPrompt(
        appId,
        "",
        mergedRequestText,
        baseJson,
        "complete",
        currentMenus,
        sampleMenuParsed || undefined,
        true,
      );
      await runGenerate(mergedRequestText, "complete", prompt);
    } else {
      await runGenerate(mergedRequestText, "complete");
    }
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

        <Collapse
          style={{ marginBottom: 12 }}
          items={[{
            key: "sample_menu",
            label: sampleMenuParsed
              ? `Menu mẫu ✓ ${sampleUseAsBase ? "[Dùng làm gốc]" : "[Tham khảo]"} — ${sampleMenuParsed.length} menu từ ${sampleAppLabel || sampleAppId || "app đã chọn"}`
              : "Menu mẫu tham khảo (tùy chọn) — chọn ứng dụng để AI học theo hoặc chỉnh sửa",
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Alert
                  type="info"
                  showIcon
                  message="Chọn ứng dụng để tự động lấy menu mẫu"
                  description="Chọn ứng dụng để tải menu mẫu. Chế độ Tham khảo: AI học theo cấu trúc để tự thiết kế mới. Chế độ Dùng làm gốc: AI lấy đúng menu này và adapt theo yêu cầu khách hàng mới."
                />
                <Space>
                  <Select
                    showSearch
                    style={{ minWidth: 300 }}
                    value={sampleAppId}
                    placeholder={t("system.menu.pleaseSelectApp") || "Vui lòng chọn ứng dụng"}
                    options={sampleAppOptions}
                    optionFilterProp="label"
                    onChange={handleSampleAppChange}
                    loading={sampleMenuLoading}
                    disabled={!appId}
                  />
                  {sampleAppId && (
                    <Button onClick={() => sampleAppId && loadSampleMenuFromApp(sampleAppId)} loading={sampleMenuLoading}>
                      Tải lại menu mẫu
                    </Button>
                  )}
                  {(sampleMenuParsed || sampleAppId) && (
                    <Button onClick={handleClearSampleMenu} danger>
                      Bỏ mẫu
                    </Button>
                  )}
                </Space>
                {sampleMenuParsed && (
                  <>
                    <Alert
                      type="success"
                      showIcon
                      message={`Đã nạp ${sampleMenuParsed.length} menu gốc từ ${sampleAppLabel || sampleAppId}`}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 6, border: `1px solid ${sampleUseAsBase ? "var(--ant-color-primary-border)" : "var(--ant-color-border)"}`, background: sampleUseAsBase ? "var(--ant-color-primary-bg)" : "var(--ant-color-fill-quaternary)" }}>
                      <Switch
                        checked={sampleUseAsBase}
                        onChange={setSampleUseAsBase}
                        checkedChildren="Dùng làm gốc"
                        unCheckedChildren="Chỉ tham khảo"
                      />
                      <span style={{ fontSize: 13 }}>
                        {sampleUseAsBase
                          ? <><strong>Chỉnh sửa từ menu mẫu</strong> — AI lấy menu này làm gốc, adapt theo yêu cầu khách hàng<Tag color="blue" style={{ marginLeft: 6 }}>Gốc</Tag></>
                          : <><strong>Chỉ tham khảo cấu trúc</strong> — AI tự thiết kế mới, dùng menu mẫu như hướng dẫn</>}
                      </span>
                    </div>
                  </>
                )}
                {sampleMenuError && (
                  <Alert
                    type="error"
                    showIcon
                    message={sampleMenuError}
                  />
                )}
              </Space>
            ),
          }]}
        />

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

        {aiProgress && (
          <Alert
            type={aiProgress.status === "failed" ? "error" : aiProgress.status === "completed" ? "success" : "info"}
            showIcon
            style={{ marginBottom: 16 }}
            message={describeAiProgress(aiProgress)}
            description={
              <Space direction="vertical" style={{ width: "100%" }}>
                <Progress
                  percent={Math.max(0, Math.min(100, Number(aiProgress.percent ?? 0)))}
                  status={aiProgress.status === "failed" ? "exception" : aiProgress.status === "completed" ? "success" : "active"}
                />
                <div style={{ fontSize: 12 }}>
                  Stage: {aiProgress.stage || aiProgress.status || "running"}
                  {aiProgress.current != null && aiProgress.total != null ? ` | Step: ${aiProgress.current}/${aiProgress.total}` : ""}
                  {aiProgress.level != null ? ` | Level: ${aiProgress.level}` : ""}
                  {aiProgress.elapsedMs ? ` | Elapsed: ${formatDurationMs(aiProgress.elapsedMs)}` : ""}
                  {aiProgress.waitingMs ? ` | Waiting: ${formatDurationMs(aiProgress.waitingMs)}` : ""}
                  {aiProgress.jobId ? ` | Job: ${aiProgress.jobId}` : ""}
                </div>
              </Space>
            }
          />
        )}

        {(aiResultText || aiProgress) && (
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

              <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, overflow: "hidden" }}>
                <CodeMirror
                  value={aiResultText || buildAiProgressResultText(aiProgress)}
                  height="360px"
                  theme={vscodeDark}
                  extensions={[json()]}
                  editable={false}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLineGutter: true,
                    highlightActiveLine: true,
                    bracketMatching: true,
                    closeBrackets: true,
                  }}
                  placeholder={t("system.menu.aiDesigner.resultPlaceholder") || "Kết quả AI sẽ hiển thị ở đây (JSON format)"}
                />
              </div>

              <Divider orientation="left">{t("system.menu.aiDesigner.refineTitle") || "Yêu cầu bổ sung / chỉnh sửa"}</Divider>
              <Alert
                type="info"
                showIcon
                message={t("system.menu.aiDesigner.refineHintTitle") || "Bạn có thể yêu cầu AI chỉnh sửa thêm"}
                description={t("system.menu.aiDesigner.refineHintDesc") || "Nhập thay đổi mong muốn, AI sẽ dựa trên kết quả đã tạo và phân tích lại toàn bộ menu theo đúng nghiệp vụ."}
              />
              {sampleMenuParsed && (
                <Alert
                  type="info"
                  showIcon
                  message={`Menu mẫu từ ${sampleAppLabel || sampleAppId} đang được đưa vào prompt bổ sung ${sampleUseAsBase ? "(chế độ gốc: AI tiếp tục chỉnh sửa trên menu đó)" : "(chế độ tham khảo)"}`}
                />
              )}
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

/** @deprecated Use detectSevereAiOutputIssues instead */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _validateMenuCoverage(
  requirementText: string,
  menus: MenuItemType[],
): { hasCoverageProblem: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const detectedModules = extractRequirementModules(requirementText, 20);
  const detectedTables = extractRequirementTables(requirementText, 40);

  // Count functional menus (type_form != 0)
  const countFunctionalMenus = (items: MenuItemType[]): number => {
    let count = 0;
    items.forEach((item) => {
      if (item.type_form !== 0) count++;
      if (item.children && item.children.length > 0) {
        count += countFunctionalMenus(item.children);
      }
    });
    return count;
  };

  const functionalMenuCount = countFunctionalMenus(menus);
  const expectedFromModules = detectedModules.length;
  const expectedFromTables = detectedTables.length > 0 ? Math.ceil(detectedTables.length * 0.6) : 0;
  const expectedMinMenuCount = Math.max(2, expectedFromModules, expectedFromTables);

  // Coverage validation
  if (expectedMinMenuCount >= 3 && functionalMenuCount < expectedMinMenuCount) {
    warnings.push(
      `⚠️ UNDERSIMPLIFICATION DETECTED: Requirement implies at least ${expectedMinMenuCount} functional menus ` +
        `(modules=${detectedModules.length}, tables=${detectedTables.length}) but output only has ${functionalMenuCount}. ` +
        `Expected minimum: ${expectedMinMenuCount} menus. Please verify all modules are covered.`
    );
    return { hasCoverageProblem: true, warnings };
  }

  // Schema validation warnings
  const validateSchemaCompliance = (items: MenuItemType[]): string[] => {
    const schemaWarnings: string[] = [];
    items.forEach((item) => {
      const typeForm = Number(item.type_form ?? 0);
      // Check if type_form 1/2/6 has table_name
      if ([1, 2, 6].includes(typeForm) && !item.table_name) {
        schemaWarnings.push(
          `⚠️ SCHEMA: Menu "${item.label}" has type_form=${typeForm} but missing table_name`
        );
      }
      // Check if type_form 3 has dynamic_link_url
      if (typeForm === 3 && !item.dynamic_link_url) {
        schemaWarnings.push(
          `⚠️ SCHEMA: Menu "${item.label}" has type_form=3 but missing dynamic_link_url`
        );
      }
      // Check if type_form 4 has auto_code_name
      if (typeForm === 4 && !item.auto_code_name) {
        schemaWarnings.push(
          `⚠️ SCHEMA: Menu "${item.label}" has type_form=4 but missing auto_code_name`
        );
      }
      // Check for fields without f_ prefix
      if (item.table && Array.isArray(item.table)) {
        item.table.forEach((field) => {
          const hasGenericKey = field?.field || field?.label || field?.type || field?.primaryKey || field?.required;
          if (hasGenericKey) {
            schemaWarnings.push(
              `⚠️ SCHEMA: Menu "${item.label}" has field using generic keys (field/label/type/primaryKey/required).`
            );
          }
        });
      }
      // Check combo fields for empty f_cbo_query
      if (item.table && Array.isArray(item.table)) {
        item.table.forEach((field) => {
          if (/co|coro|cbo/.test(String(field.f_types || "")) && !field.f_cbo_query) {
            schemaWarnings.push(
              `⚠️ SCHEMA: Combo field "${field.f_name}" in menu "${item.label}" missing f_cbo_query`
            );
          }
        });
      }
      // Recurse into children
      if (item.children && item.children.length > 0) {
        schemaWarnings.push(...validateSchemaCompliance(item.children));
      }
    });
    return schemaWarnings;
  };

  const schemaWarnings = validateSchemaCompliance(menus);
  warnings.push(...schemaWarnings);

  return {
    hasCoverageProblem: warnings.length > 0,
    warnings,
  };
}

export default AiMenuDesigner;
