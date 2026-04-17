import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Collapse, Divider, Input, Progress, Upload, message, Radio, Select, Space, Switch, Tag } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { useTranslation } from "react-i18next";
import { useUserStore } from "#src/store/user";
import { useSocket } from "#src/hooks/useSocket";

import type { MenuItemType } from "#src/api/system/menu";
import { fetchAppList, fetchMenuList } from "#src/api/system/menu";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { csmDecrypt, csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import { request } from "#src/utils";

const { TextArea } = Input;

type AiRequestRecord = {
  id?: string;
  app_id_target: string;
  request_text?: string;
  request_history?: string;
  last_prompt?: string;
  last_result?: string;
  context_files_json?: string;
  generate_mode?: "full" | "diff";
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

type CoverageEntry = {
  item: string;
  menus: string[];
  status: "covered" | "partial" | "missing";
};

type AiOutputMeta = {
  coverageModules: CoverageEntry[];
  coverageTables: CoverageEntry[];
  unresolvedAssumptions: string[];
};

type JsonContextFile = {
  id: string;
  name: string;
  size: number;
  content: string;
  summary: string;
};

/**
 * 2 operation scenarios:
 * - new_build: Design from scratch - AI analyzes business requirements and creates full menu tree
 * - incremental_update: Edit existing menu deeply (menu/field/trigger) - AI returns FULL tree
 */
type OperationScenario = "new_build" | "incremental_update";

type FieldDelta = {
  fieldName: string;
  oldVal: string | null;
  newVal: string | null;
};

type PatchOp = {
  action: "add" | "edit" | "delete";
  nodeId: string;
  nodeName: string;
  nodePath: string;
  changedFields: FieldDelta[];
};

type PatchOpView = PatchOp & {
  line?: number;
};

type MenuMergeResult = {
  mergedMenu: unknown[];
  patchOps: PatchOp[];
  added: number;
  edited: number;
  deleted: number;
};

type PatchReviewStatus = "kept" | "undone";

// ─── CodeMirror Diff Decoration Infrastructure ──────────────────────────────

type DiffLineInfo = {
  line: number;
  action: "add" | "edit" | "delete";
  nodeId: string;
  nodeName: string;
  nodePath: string;
  reviewStatus?: "pending" | PatchReviewStatus;
  onKeep?: (nodeId: string) => void;
  onUndo?: (nodeId: string) => void;
};

class DiffReviewWidget extends WidgetType {
  constructor(private readonly info: DiffLineInfo) {
    super();
  }

  eq(other: DiffReviewWidget) {
    return other.info.line === this.info.line
      && other.info.action === this.info.action
      && other.info.nodeId === this.info.nodeId
      && other.info.nodePath === this.info.nodePath
      && other.info.reviewStatus === this.info.reviewStatus;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-ai-review-widget";

    const badge = document.createElement("span");
    badge.className = `cm-ai-review-pill cm-ai-review-pill-${this.info.action}`;
    badge.textContent = `${String(this.info.action || "edit").toUpperCase()} ${this.info.nodePath || this.info.nodeName || this.info.nodeId}`;
    wrap.appendChild(badge);

    const status = this.info.reviewStatus || "pending";
    if (status === "pending" && this.info.onKeep) {
      const keepButton = document.createElement("button");
      keepButton.type = "button";
      keepButton.className = "cm-ai-review-button cm-ai-review-button-keep";
      keepButton.textContent = "Keep";
      keepButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.info.onKeep?.(this.info.nodeId);
      };
      wrap.appendChild(keepButton);
    }

    if (status === "pending" && this.info.onUndo) {
      const undoButton = document.createElement("button");
      undoButton.type = "button";
      undoButton.className = "cm-ai-review-button cm-ai-review-button-undo";
      undoButton.textContent = "Undo";
      undoButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.info.onUndo?.(this.info.nodeId);
      };
      wrap.appendChild(undoButton);
    }

    if (status !== "pending") {
      const reviewed = document.createElement("span");
      reviewed.className = `cm-ai-review-pill ${status === "kept" ? "cm-ai-review-pill-keep" : "cm-ai-review-pill-undo"}`;
      reviewed.textContent = status === "kept" ? "KEPT" : "UNDONE";
      wrap.appendChild(reviewed);
    }

    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

/** StateEffect to apply a new set of line decorations */
const setDiffDecorations = StateEffect.define<DiffLineInfo[]>();

/** StateField that holds the current set of diff line decorations */
const diffDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiffDecorations)) {
        const ranges = effect.value
          .filter((d) => d.line >= 1 && d.line <= tr.state.doc.lines)
          .flatMap((d) => {
            const lineObj = tr.state.doc.line(d.line);
            const cls =
              d.action === "add"
                ? "cm-diff-added"
                : d.action === "delete"
                  ? "cm-diff-deleted"
                  : "cm-diff-edited";
            const lineRanges = [Decoration.line({ class: cls }).range(lineObj.from)];
            if (d.onKeep || d.onUndo) {
              lineRanges.push(
                Decoration.widget({
                  widget: new DiffReviewWidget(d),
                  side: 1,
                  block: true,
                }).range(lineObj.to),
              );
            }
            return lineRanges;
          })
          .sort((a, b) => a.from - b.from);
        return Decoration.set(ranges, true);
      }
    }
    return decos.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Theme that styles the diff decoration CSS classes */
const diffTheme = EditorView.theme({
  ".cm-diff-added": { backgroundColor: "rgba(70,149,74,0.22)", display: "block" },
  ".cm-diff-deleted": { backgroundColor: "rgba(201,48,44,0.22)", textDecoration: "line-through", display: "block" },
  ".cm-diff-edited": { backgroundColor: "rgba(187,128,9,0.22)", display: "block" },
  ".cm-ai-review-widget": {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "4px 12px 8px 36px",
    backgroundColor: "rgba(17,24,39,0.94)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  ".cm-ai-review-pill": {
    fontSize: "11px",
    lineHeight: "18px",
    padding: "0 8px",
    borderRadius: "999px",
    color: "#f8fafc",
    border: "1px solid transparent",
  },
  ".cm-ai-review-pill-add": { backgroundColor: "rgba(34,197,94,0.24)", borderColor: "rgba(34,197,94,0.35)" },
  ".cm-ai-review-pill-edit": { backgroundColor: "rgba(245,158,11,0.24)", borderColor: "rgba(245,158,11,0.35)" },
  ".cm-ai-review-pill-delete": { backgroundColor: "rgba(239,68,68,0.24)", borderColor: "rgba(239,68,68,0.35)" },
  ".cm-ai-review-pill-keep": { backgroundColor: "rgba(59,130,246,0.24)", borderColor: "rgba(59,130,246,0.35)" },
  ".cm-ai-review-pill-undo": { backgroundColor: "rgba(148,163,184,0.26)", borderColor: "rgba(148,163,184,0.36)" },
  ".cm-ai-review-button": {
    fontSize: "11px",
    lineHeight: "18px",
    padding: "0 8px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.18)",
    backgroundColor: "transparent",
    color: "#f8fafc",
    cursor: "pointer",
  },
  ".cm-ai-review-button-keep": { borderColor: "rgba(34,197,94,0.4)", color: "#bbf7d0" },
  ".cm-ai-review-button-undo": { borderColor: "rgba(248,113,113,0.4)", color: "#fecaca" },
});

/**
 * Given a pretty-printed JSON string and a list of patch ops,
 * return 1-based line numbers where each patched node's "id" field appears.
 */
function buildNodeLineMap(jsonStr: string, patchOps: PatchOp[]): Map<string, DiffLineInfo> {
  const result = new Map<string, DiffLineInfo>();
  const lines = jsonStr.split("\n");
  const idToPatch = new Map(patchOps.map((op) => [op.nodeId, op]));
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/"id"\s*:\s*"([^"]+)"/);
    const patch = m ? idToPatch.get(m[1]!) : null;
    if (m && patch) {
      result.set(m[1]!, {
        line: i + 1,
        action: patch.action as DiffLineInfo["action"],
        nodeId: patch.nodeId,
        nodeName: String(patch.nodeName || patch.nodeId),
        nodePath: String(patch.nodePath || patch.nodeName || patch.nodeId),
      });
      idToPatch.delete(m[1]!);
    }
  }
  return result;
}

function buildMergeStatsFromPatchOps(ops: PatchOp[]): { added: number; edited: number; deleted: number } | null {
  if (!Array.isArray(ops) || ops.length === 0) return null;
  return ops.reduce(
    (acc, op) => {
      if (op.action === "add") acc.added += 1;
      else if (op.action === "delete") acc.deleted += 1;
      else acc.edited += 1;
      return acc;
    },
    { added: 0, edited: 0, deleted: 0 },
  );
}

function requestSuggestsBulkDelete(text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  return /(\bxoa\b|\bxóa\b|\bdelete\b|\bremove\b|\bclean\b|\bclear\b|\bdon dep\b|\bdọn dẹp\b|\breset\b)/i.test(normalized);
}

function shouldTriggerMassDeleteGuard(params: {
  scenario: OperationScenario;
  baseNodes: number;
  deleted: number;
  requestText: string;
}): boolean {
  const { scenario, baseNodes, deleted, requestText } = params;
  if (scenario !== "incremental_update") return false;
  if (baseNodes <= 0 || deleted <= 0) return false;
  if (requestSuggestsBulkDelete(requestText)) return false;

  const safeDeleteAbs = Math.max(12, Math.floor(baseNodes * 0.2));
  const safeDeleteRatio = 0.35;
  return deleted > safeDeleteAbs || (deleted / Math.max(1, baseNodes)) >= safeDeleteRatio;
}

function formatFieldDeltaValue(value: string | null | undefined, maxLength = 80): string {
  if (value == null) return "(null)";
  const text = String(value);
  if (!text.trim()) return '""';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

async function callAiMenuMerge(params: {
  scenario: "incremental_update";
  old_json: string;
  new_json: string;
}): Promise<MenuMergeResult> {
  try {
    const res = await request
      .post("ai/menu-merge", {
        json: params,
        timeout: 30000,
      })
      .json<any>();
    const result = (res?.result || res?.data || {}) as Partial<MenuMergeResult>;
    return {
      mergedMenu: Array.isArray(result.mergedMenu) ? result.mergedMenu : [],
      patchOps: Array.isArray(result.patchOps) ? (result.patchOps as PatchOp[]) : [],
      added: Number(result.added || 0),
      edited: Number(result.edited || 0),
      deleted: Number(result.deleted || 0),
    };
  } catch {
    return { mergedMenu: [], patchOps: [], added: 0, edited: 0, deleted: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const AI_REQUEST_TABLE = "csm_ai_menu_requests";
const MAX_CONTEXT_FILES = 8;
const MAX_CONTEXT_FILE_CHARS = 50000;
const MAX_CONTEXT_APPENDIX_CHARS = 80000;

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
    loaddb: "load_db",
    loadTableDb: "load_table_db",
    loadtabledb: "load_table_db",
    reportDb: "report_db",
    reportdb: "report_db",
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

export function buildAiMenuRequestPayload(
  appId: string | undefined,
  requestText: string,
  scope: "minimal" | "complete" = "complete",
  currentMenus?: MenuItemType[],
  sampleMenus?: MenuItemType[],
  contextFiles?: JsonContextFile[],
) {
  const normalizedRequest = trimToMax(String(requestText || "").trim(), 12000);
  const currentMenuCompact = Array.isArray(currentMenus) && currentMenus.length > 0
    ? buildCompactMenuContext(currentMenus, 150)
    : "(khong co menu hien tai)";
  const sampleMenuCompact = Array.isArray(sampleMenus) && sampleMenus.length > 0
    ? buildCompactMenuContext(sampleMenus, 100)
    : undefined;

  return {
    request_schema: "csm.ai.menu.request.v2",
    operation_scenario: "new_build",
    system_core: "backend_master_prompt",
    app_id_specific_metadata: {
      app_id: String(appId || ""),
      menu_type_catalog: buildMenuTypeCatalog(),
      menu_logic_guide: buildMenuOrganizationGuide(),
      current_menu_compact: currentMenuCompact,
      ...(sampleMenuCompact ? { sample_menu_compact: sampleMenuCompact } : {}),
      detected_modules: extractRequirementModules(normalizedRequest, 20),
      detected_tables: extractRequirementTables(normalizedRequest, 30),
      context_files: (contextFiles || []).map((file) => ({
        name: file.name,
        summary: file.summary,
        content: trimToMax(file.content, MAX_CONTEXT_FILE_CHARS),
      })),
    },
    current_task: {
      task_type: "menu_design_generate",
      scope,
      requirement_text: normalizedRequest,
    },
    output_contract: {
      format: "json_object",
      root_key: "menu",
      include_meta: ["notes", "warnings", "coverage_modules", "coverage_tables", "unresolved_assumptions"],
    },
  };
}

export function buildAiMenuRefinePayload(
  appId: string | undefined,
  baseRequest: string,
  refineRequest: string,
  previousResultJson: string,
  scope: "minimal" | "complete" = "complete",
  currentMenus?: MenuItemType[],
  sampleMenus?: MenuItemType[],
  isSampleBase?: boolean,
  contextFiles?: JsonContextFile[],
) {
  const combinedRequirement = trimToMax(`${baseRequest || ""}\n${refineRequest || ""}`.trim(), 16000);

  return {
    request_schema: "csm.ai.menu.request.v2",
    operation_scenario: "incremental_update",
    system_core: "backend_master_prompt",
    app_id_specific_metadata: {
      app_id: String(appId || ""),
      menu_type_catalog: buildMenuTypeCatalog(),
      menu_logic_guide: buildMenuOrganizationGuide(),
      current_menu_compact: Array.isArray(currentMenus) && currentMenus.length > 0
        ? buildCompactMenuContext(currentMenus, 120)
        : "(khong co menu hien tai)",
      sample_menu_compact: Array.isArray(sampleMenus) && sampleMenus.length > 0
        ? buildCompactMenuContext(sampleMenus, 100)
        : undefined,
      detected_modules: extractRequirementModules(combinedRequirement, 25),
      detected_tables: extractRequirementTables(combinedRequirement, 40),
      context_files: (contextFiles || []).map((file) => ({
        name: file.name,
        summary: file.summary,
        content: trimToMax(file.content, MAX_CONTEXT_FILE_CHARS),
      })),
    },
    current_task: {
      task_type: "menu_design_refine",
      scope,
      base_requirement_text: trimToMax(String(baseRequest || ""), 9000),
      refine_requirement_text: trimToMax(String(refineRequest || ""), 5000),
      requirement_text: combinedRequirement,
      previous_result_json: trimToMax(String(previousResultJson || ""), isSampleBase ? 90000 : 30000),
      use_sample_as_base: !!isSampleBase,
    },
    output_contract: {
      format: "json_object",
      root_key: "menu",
      include_meta: ["notes", "warnings", "coverage_modules", "coverage_tables", "unresolved_assumptions"],
    },
  };
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

function isLikelyEncryptedCode(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw || raw.length < 32) return false;
  // Heuristic: encrypted payloads are typically single-line base64-like and contain no JS keywords.
  const hasJsSignals = /\b(return|const|let|var|function|if|for|while|=>)\b|[{};]/.test(raw);
  if (hasJsSignals) return false;
  return /^[A-Za-z0-9_\-+/=.%]+$/.test(raw) && !raw.includes(" ") && !raw.includes("\n");
}

function decodeTriggerCodeForEditor(rawValue: any): any {
  if (typeof rawValue !== "string") return rawValue;
  const text = String(rawValue || "").trim();
  if (!text) return "";

  if (text.includes("%")) {
    try {
      const decodedUri = decodeURIComponent(text);
      if (decodedUri && decodedUri !== text) return decodedUri;
    } catch {
      // ignore uri decode failure
    }
  }

  if (!isLikelyEncryptedCode(text)) return rawValue;

  try {
    const decrypted = csmDecrypt(text);
    if (typeof decrypted === "string" && decrypted.trim()) return decrypted;
  } catch {
    // keep original on decrypt failure
  }
  return rawValue;
}

function encodeTriggerCodeForSave(rawValue: any): any {
  if (typeof rawValue !== "string") return rawValue;
  const text = String(rawValue || "").trim();
  if (!text) return "";
  if (isLikelyEncryptedCode(text)) return text;
  try {
    return csmEncrypt(text);
  } catch {
    return rawValue;
  }
}

function transformMenuTriggers(
  menus: MenuItemType[] | null | undefined,
  mode: "decode" | "encode",
): MenuItemType[] {
  const walk = (items: MenuItemType[] | null | undefined): MenuItemType[] => {
    return (Array.isArray(items) ? items : []).map((item) => {
      const next: any = { ...(item as any) };
      const triggerObj = next?.trigger && typeof next.trigger === "object" ? { ...next.trigger } : {};
      Object.keys(triggerObj).forEach((key) => {
        const val = triggerObj[key];
        triggerObj[key] = mode === "decode"
          ? decodeTriggerCodeForEditor(val)
          : encodeTriggerCodeForSave(val);
      });
      next.trigger = triggerObj;
      if (Array.isArray(next.children)) {
        next.children = walk(next.children as MenuItemType[]);
      }
      return next as MenuItemType;
    });
  };
  return walk(menus);
}

function restoreMissingTriggersFromBase(baseMenus: MenuItemType[], nextMenus: MenuItemType[]): MenuItemType[] {
  const baseById = new Map<string, any>();
  const collect = (items: MenuItemType[] | undefined | null) => {
    (Array.isArray(items) ? items : []).forEach((node) => {
      const id = String((node as any)?.id || "").trim();
      if (id) baseById.set(id, node);
      const children = (node as any)?.children;
      if (Array.isArray(children)) collect(children);
    });
  };
  collect(baseMenus);

  const fill = (items: MenuItemType[] | undefined | null): MenuItemType[] => {
    return (Array.isArray(items) ? items : []).map((node) => {
      const next: any = { ...(node as any) };
      const id = String(next?.id || "").trim();
      const baseNode: any = id ? baseById.get(id) : null;
      const nextTrigger = next?.trigger && typeof next.trigger === "object" ? next.trigger : {};
      const baseTrigger = baseNode?.trigger && typeof baseNode.trigger === "object" ? baseNode.trigger : {};
      if (Object.keys(nextTrigger).length === 0 && Object.keys(baseTrigger).length > 0) {
        next.trigger = { ...baseTrigger };
      }
      if (Array.isArray(next.children)) {
        next.children = fill(next.children as MenuItemType[]);
      }
      return next as MenuItemType;
    });
  };

  return fill(nextMenus);
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
    "- Type 6 theo luong moi: co linked_data_menu_id; neu 2 bang thi co linked_progress_menu_id + progressTracking.",
    "- 3=Dynamic Link: bat buoc co dynamic_link_url.",
    "- 4=Dynamic Code: bat buoc co auto_code_name.",
    "- Bao cao noi bo: report_name + trigger.report_db (khong doi sang type 3).",
    "- Node group (type 0) phai co children; menu con phai parentId dung cha.",
    "- Field combo (co/coro/cbo) bat buoc co f_cbo_query string khong rong.",
    "- Trigger chi dat trong object trigger; khong dung trigger_* o cap menu.",
    "- Type 1/2/6 thuong khong can path (runtime /system/grid/:menuId).",
    "- data_scope_override hop le: NONE | ALL | OWNER | DEPARTMENT | BRANCH.",
    "- Khong tu them module ngoai yeu cau; khong tao lai menu he thong co san.",
  ].join("\n");
}

function buildMenuOrganizationGuide(): string {
  return [
    "1) Chia theo nhom nghiep vu: moi nhom la 1 node type_form=0, ben trong la menu chuc nang.",
    "2) Menu chuc nang khong duoc de type_form=0; chon type dung muc dich 1/2/3/4/6.",
    "3) CRUD uu tien type 1/2; Kanban dung type 6; chi dung 3/4 khi yeu cau ro.",
    "3.1) Kanban luong moi: lien ket menu task bang linked_data_menu_id; neu 2 bang thi lien ket them linked_progress_menu_id.",
    "3.2) Kanban 2 bang can progressTracking.mode=separate_table va mapping taskRef/stage/progress/changedAt.",
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
  if (Array.isArray(rawQuery)) return true;
  if (rawQuery && typeof rawQuery === "object") {
    const obj = rawQuery as any;
    if (Array.isArray(obj.query) || Array.isArray(obj.options)) return true;
    // Legacy runtime occasionally stores pre-normalized combo objects.
    return true;
  }

  const text = String(rawQuery || "").trim();
  if (!text) return false;
  if (/\breturn\b/.test(text)) return true;
  // Accept static: shorthand that normalizeComboQueryValue converts at runtime.
  if (/^static:/i.test(text)) return true;
  // Accept raw SQL SELECT that normalizeComboQueryValue converts at runtime.
  if (/^select\s+.+\s+from\s+/i.test(text)) return true;
  // Accept legacy compact form like: table_name,value_field,label_field
  if (/^[^{}\[\]\n,]+\s*,\s*[^,\n]+(\s*,\s*[^,\n]+)+$/.test(text)) return true;
  // Accept legacy plain table alias/name form.
  if (/^[A-Za-z0-9_.$-]+$/.test(text)) return true;

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

function validateMenusForApply(menus: MenuItemType[], profile: "strict" | "legacy" = "strict"): MenuValidationIssue[] {
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
      const normalizedTrigger = normalizeTriggerShape(node);
      const hasNormalizedTriggerCode = (targetKey: string): boolean => {
        const normalizedDirect = String((normalizedTrigger as any)?.[targetKey] ?? "").trim();
        if (normalizedDirect) return true;

        if (trigger && typeof trigger === "object") {
          for (const key of Object.keys(trigger)) {
            if (normalizeTriggerKeyName(key) !== targetKey) continue;
            if (String((trigger as any)[key] ?? "").trim()) return true;
          }
        }

        const compactKey = targetKey.replace(/_/g, "");
        const topLevelCandidates = [
          (node as any)?.[targetKey],
          (node as any)?.[`trigger_${targetKey}`],
          (node as any)?.[compactKey],
          (node as any)?.[`trigger_${compactKey}`],
        ];
        return topLevelCandidates.some((value) => String(value ?? "").trim() !== "");
      };
      const hasReportDbTrigger = hasNormalizedTriggerCode("report_db");
      const hasLoadDbTrigger = hasNormalizedTriggerCode("load_db");
      const isReportRuntime = !!reportName || hasReportDbTrigger;
      const isStrict = profile === "strict";
      const allowLegacyWithoutTable = !isStrict && hasLoadDbTrigger;

      if ((typeForm === 1 || typeForm === 2) && !tableName && !isContainerLike && !isReportRuntime && !allowLegacyWithoutTable) {
        issues.push({
          severity: isStrict ? "error" : "warning",
          rule: isStrict ? "table_name_required" : "table_name_missing_legacy",
          path,
          message: isStrict
            ? "Menu type_form=1/2 thiếu table_name."
            : "Menu type_form=1/2 thiếu table_name (legacy app có thể vẫn chạy, nên rà soát khi chỉnh sửa mới).",
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

      // Report runtime (CsmReport): enforce only for report form in strict profile to avoid legacy false positives.
      if (isStrict && typeForm === 5 && isReportRuntime && !hasReportDbTrigger) {
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
            if (isStrict) {
              if (!isValidComboQueryShape(field?.f_cbo_query)) {
                issues.push({
                  severity: "error",
                  rule: "combo_query_invalid",
                  path: fieldPath,
                  message: `Field ${fName || "(unknown)"} có kiểu combo nhưng f_cbo_query chưa hợp lệ.`,
                });
              }
            } else {
              const rawLegacyCombo = field?.f_cbo_query;
              const hasLegacyComboValue = rawLegacyCombo != null && String(rawLegacyCombo).trim() !== "";
              if (!hasLegacyComboValue) {
                issues.push({
                  severity: "warning",
                  rule: "combo_query_missing_legacy",
                  path: fieldPath,
                  message: `Field ${fName || "(unknown)"} có kiểu combo nhưng đang thiếu f_cbo_query.`,
                });
              }
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

function normalizeCoverageEntries(raw: any, keyName: "module" | "table"): CoverageEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const value = String(item?.[keyName] || item?.item || "").trim();
      if (!value) return null;

      const menus = Array.isArray(item?.menus)
        ? item.menus.map((m: any) => String(m || "").trim()).filter(Boolean)
        : [];

      const rawStatus = String(item?.status || (menus.length > 0 ? "covered" : "missing")).toLowerCase();
      const status = (rawStatus === "covered" || rawStatus === "partial" || rawStatus === "missing")
        ? rawStatus
        : (menus.length > 0 ? "covered" : "missing");

      return { item: value, menus, status } as CoverageEntry;
    })
    .filter((entry): entry is CoverageEntry => !!entry);
}

function extractAiOutputMeta(payload: any): AiOutputMeta {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    coverageModules: normalizeCoverageEntries(source?.coverage_modules, "module"),
    coverageTables: normalizeCoverageEntries(source?.coverage_tables, "table"),
    unresolvedAssumptions: Array.isArray(source?.unresolved_assumptions)
      ? source.unresolved_assumptions.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [],
  };
}

function summarizeJsonContent(value: any): string {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).slice(0, 12);
    return `Object keys: ${keys.join(", ")}${Object.keys(value).length > keys.length ? ", ..." : ""}`;
  }
  return typeof value;
}

function buildContextFilesAppendix(files: JsonContextFile[]): string {
  if (!Array.isArray(files) || files.length === 0) return "";

  const sections = files.map((file, index) => {
    const body = trimToMax(file.content, MAX_CONTEXT_FILE_CHARS);
    return [
      `### FILE ${index + 1}: ${file.name}`,
      `- Summary: ${file.summary}`,
      `- Size(bytes): ${file.size}`,
      "```json",
      body,
      "```",
    ].join("\n");
  });

  return [
    "## CUSTOMER LEGACY JSON CONTEXT (HIGH PRIORITY)",
    "Use these JSON files as the source of truth for backward-compatible redesign.",
    "Do not drop business entities or trigger logic that appears in these files unless explicitly requested.",
    ...sections,
  ].join("\n\n");
}

function buildAppContextAppendix(
  appId: string | undefined,
  storedRequest: string,
  storedLastResult: string,
  files: JsonContextFile[],
): string {
  const lastResultCompact = storedLastResult
    ? buildPreviousResultContext(storedLastResult, 60)
    : "(chua co ket qua AI truoc do)";

  const fileAppendix = buildContextFilesAppendix(files);

  const text = [
    "## APP CONTINUITY MEMORY (MUST USE)",
    `Current app_id: ${String(appId || "")}`,
    "When upgrading, keep continuity for this app_id:",
    "- Preserve existing module intent and menu hierarchy where possible.",
    "- Keep IDs/menu_id/parent relationships stable unless requirement asks to change.",
    "- Respect legacy data structure and trigger semantics from attached JSON files.",
    "",
    "### Previous requirement history",
    trimToMax(String(storedRequest || "(khong co)"), 6000),
    "",
    "### Previous AI output summary",
    lastResultCompact,
    fileAppendix ? `\n${fileAppendix}` : "",
  ].join("\n");

  return trimToMax(text, MAX_CONTEXT_APPENDIX_CHARS);
}

function serializeContextFiles(files: JsonContextFile[]): string {
  try {
    return JSON.stringify(Array.isArray(files) ? files : []);
  } catch {
    return "[]";
  }
}

function parseContextFiles(raw: any): JsonContextFile[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const name = String(item.name || "").trim();
        const content = String(item.content || "").trim();
        if (!name || !content) return null;
        return {
          id: String(item.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          name,
          size: Number(item.size || content.length),
          content: trimToMax(content, MAX_CONTEXT_FILE_CHARS),
          summary: String(item.summary || summarizeJsonContent(content)),
        } as JsonContextFile;
      })
      .filter((item): item is JsonContextFile => !!item)
      .slice(0, MAX_CONTEXT_FILES);
  } catch {
    return [];
  }
}

/**
 * Find a single menu node by id in the tree.
 */
function findMenuNodeById(menus: MenuItemType[], id: string): MenuItemType | null {
  for (const node of Array.isArray(menus) ? menus : []) {
    if ((node as any).id === id) return node;
    const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
    const found = findMenuNodeById(children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Replace a node by id in the tree with an updated version.
 */
function replaceMenuNodeById(menus: MenuItemType[], id: string, updated: MenuItemType): MenuItemType[] {
  return (Array.isArray(menus) ? menus : []).map((node) => {
    if ((node as any).id === id) return updated;
    const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
    if (children.length > 0) {
      return { ...node, children: replaceMenuNodeById(children, id, updated) } as MenuItemType;
    }
    return node;
  });
}

function cloneMenuTree<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function removeMenuNodeById(menus: MenuItemType[], id: string): MenuItemType[] {
  return (Array.isArray(menus) ? menus : [])
    .filter((node) => String((node as any).id || "") !== id)
    .map((node) => {
      const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
      if (children.length === 0) return node;
      return { ...node, children: removeMenuNodeById(children, id) } as MenuItemType;
    });
}

function findMenuNodePlacement(
  menus: MenuItemType[],
  id: string,
  parentId?: string,
): { node: MenuItemType; index: number; parentId?: string } | null {
  const source = Array.isArray(menus) ? menus : [];
  for (let index = 0; index < source.length; index += 1) {
    const node = source[index]!;
    if (String((node as any).id || "") === id) {
      return { node: cloneMenuTree(node), index, parentId };
    }
    const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
    const found = findMenuNodePlacement(children, id, String((node as any).id || ""));
    if (found) return found;
  }
  return null;
}

function insertMenuNodeAtPosition(
  menus: MenuItemType[],
  parentId: string | undefined,
  nodeToInsert: MenuItemType,
  index: number,
): MenuItemType[] {
  const nodeId = String((nodeToInsert as any).id || "");
  if (!nodeId) return menus;

  if (!parentId) {
    const next = [...(Array.isArray(menus) ? menus : [])];
    const existingIndex = next.findIndex((item) => String((item as any).id || "") === nodeId);
    if (existingIndex >= 0) {
      next.splice(existingIndex, 1, nodeToInsert);
      return next;
    }
    next.splice(Math.min(Math.max(index, 0), next.length), 0, nodeToInsert);
    return next;
  }

  let inserted = false;
  const visit = (nodes: MenuItemType[]): MenuItemType[] => {
    return (Array.isArray(nodes) ? nodes : []).map((node) => {
      if (String((node as any).id || "") === parentId) {
        const children = Array.isArray((node as any).children) ? [...((node as any).children as MenuItemType[])] : [];
        const existingIndex = children.findIndex((item) => String((item as any).id || "") === nodeId);
        if (existingIndex >= 0) {
          children.splice(existingIndex, 1, nodeToInsert);
        } else {
          children.splice(Math.min(Math.max(index, 0), children.length), 0, nodeToInsert);
        }
        inserted = true;
        return { ...node, children } as MenuItemType;
      }

      const children = Array.isArray((node as any).children) ? ((node as any).children as MenuItemType[]) : [];
      if (children.length === 0) return node;
      const nextChildren = visit(children);
      if (nextChildren === children) return node;
      return { ...node, children: nextChildren } as MenuItemType;
    });
  };

  const next = visit(Array.isArray(menus) ? menus : []);
  if (inserted) return next;
  return [...next, nodeToInsert];
}

function restoreMenuNodeFromBase(menus: MenuItemType[], baseMenus: MenuItemType[], id: string): MenuItemType[] {
  const placement = findMenuNodePlacement(baseMenus, id);
  if (!placement) return menus;
  return insertMenuNodeAtPosition(menus, placement.parentId, placement.node, placement.index);
}

function revertPatchOpOnMenus(draftMenus: MenuItemType[], baseMenus: MenuItemType[], op: PatchOp): MenuItemType[] {
  if (!op?.nodeId) return draftMenus;
  if (op.action === "add") {
    return removeMenuNodeById(draftMenus, op.nodeId);
  }
  if (op.action === "delete") {
    return restoreMenuNodeFromBase(draftMenus, baseMenus, op.nodeId);
  }
  const originalNode = findMenuNodeById(baseMenus, op.nodeId);
  if (!originalNode) {
    return draftMenus;
  }
  if (findMenuNodeById(draftMenus, op.nodeId)) {
    return replaceMenuNodeById(draftMenus, op.nodeId, cloneMenuTree(originalNode));
  }
  return restoreMenuNodeFromBase(draftMenus, baseMenus, op.nodeId);
}

/**
 * Kịch bản 2: Incremental Update payload.
 * AI nhận toàn bộ cây menu hiện tại + yêu cầu thay đổi.
 * Prompt ép AI trả về TOÀN BỘ cây JSON sau khi sửa.
 */
export function buildAiIncrementalUpdatePayload(
  appId: string | undefined,
  baseRequest: string,
  changeRequest: string,
  currentMenusFull: MenuItemType[],
  contextFiles?: JsonContextFile[],
) {
  const currentMenuJson = JSON.stringify(
    { menu: currentMenusFull },
    null,
    2,
  );

  return {
    request_schema: "csm.ai.menu.request.v3",
    operation_scenario: "incremental_update",
    system_core: "backend_master_prompt",
    scenario_instruction: [
      "KỊCH BẢN: CHỈNH SỬA GIA TĂNG TRÊN MENU CÓ SẴN.",
      "RÀNG BUỘC BẮT BUỘC (KHÔNG ĐƯỢC VI PHẠM):",
      "1. Trả về TOÀN BỘ cấu trúc JSON cây menu (bao gồm TẤT CẢ các menu không liên quan đến yêu cầu - KHÔNG được lược bỏ).",
      "2. Chỉ ADD/EDIT/DELETE các menu liên quan đến yêu cầu thay đổi bên dưới.",
      "3. Giữ nguyên id, parentId, menu_id, path của tất cả các node không bị yêu cầu thay đổi.",
      "4. Nếu thêm menu mới: phải có đầy đủ table_name, table fields, type_form đúng chuẩn.",
      "5. Output format: JSON object với key 'menu' là mảng toàn bộ cây menu.",
    ].join("\n"),
    app_id_specific_metadata: {
      app_id: String(appId || ""),
      menu_type_catalog: buildMenuTypeCatalog(),
      menu_logic_guide: buildMenuOrganizationGuide(),
      current_menu_full_json: trimToMax(currentMenuJson, 60000),
      current_menu_node_count: Array.isArray(currentMenusFull) ? currentMenusFull.length : 0,
      context_files: (contextFiles || []).map((file) => ({
        name: file.name,
        summary: file.summary,
        content: trimToMax(file.content, MAX_CONTEXT_FILE_CHARS),
      })),
    },
    current_task: {
      task_type: "menu_design_incremental_update",
      base_requirement_text: trimToMax(String(baseRequest || ""), 6000),
      change_requirement_text: trimToMax(String(changeRequest || ""), 8000),
      requirement_text: trimToMax(`${baseRequest || ""}\n[THAY ĐỔI YÊU CẦU]\n${changeRequest || ""}`.trim(), 14000),
    },
    output_contract: {
      format: "json_object",
      root_key: "menu",
      must_include_all_existing_nodes: true,
      include_meta: ["notes", "warnings", "coverage_modules", "coverage_tables"],
    },
  };
}

export function AiMenuDesigner({ appId, currentMenus, onApply }: AiMenuDesignerProps) {
  const { t } = useTranslation();
  const user = useUserStore();
  const isDevUser = !!user?.dev || !!user?.roles?.includes("dev");
  const { socket, connected: socketConnected } = useSocket({ enabled: true });

  // ── Scenario selection ────────────────────────────────────────────────────
  const [operationScenario, setOperationScenario] = useState<OperationScenario>("new_build");

  // Editable AI draft shown in result editor for all scenarios
  const [editableAiDraftText, setEditableAiDraftText] = useState<string>("");

  // ── Common state ──────────────────────────────────────────────────────────
  const [requestText, setRequestText] = useState("");
  const [storedRequest, setStoredRequest] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiMenus, setAiMenus] = useState<MenuItemType[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<string | undefined>(undefined);
  const [sampleAppList, setSampleAppList] = useState<any[]>([]);
  const [sampleAppId, setSampleAppId] = useState<string | undefined>(undefined);
  const [sampleMenuLoading, setSampleMenuLoading] = useState(false);
  const [sampleMenuParsed, setSampleMenuParsed] = useState<MenuItemType[] | null>(null);
  const [sampleMenuError, setSampleMenuError] = useState<string | null>(null);
  const [sampleUseAsBase, setSampleUseAsBase] = useState(false);
  const [aiLiveEditEnabled, setAiLiveEditEnabled] = useState(true);
  const [allowManualEditWhileRunning, setAllowManualEditWhileRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState<AiProgressState | null>(null);
  const [aiOutputMeta, setAiOutputMeta] = useState<AiOutputMeta>({
    coverageModules: [],
    coverageTables: [],
    unresolvedAssumptions: [],
  });
  const [storedLastResult, setStoredLastResult] = useState("");
  const [contextFiles, setContextFiles] = useState<JsonContextFile[]>([]);
  const [validationProfile, setValidationProfile] = useState<"strict" | "legacy">("strict");

  // ── Jackson diff/merge state ───────────────────────────────────────────────
  const [patchOps, setPatchOps] = useState<PatchOp[]>([]);
  const [patchReviewStatus, setPatchReviewStatus] = useState<Partial<Record<string, PatchReviewStatus>>>({});
  const [liveEditLines, setLiveEditLines] = useState<DiffLineInfo[]>([]);
  const [patchKeyword, setPatchKeyword] = useState("");
  const [patchActionFilter, setPatchActionFilter] = useState<"all" | "add" | "edit" | "delete">("all");
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeStats, setMergeStats] = useState<{ added: number; edited: number; deleted: number } | null>(null);
  const [aiStopReason, setAiStopReason] = useState<string>("");
  /** Ref to the result CodeMirror view so we can dispatch decoration effects */
  const resultEditorViewRef = useRef<any>(null);
  const activeAiJobIdRef = useRef<string | null>(null);
  const aiJobResolveRef = useRef<((value: any) => void) | null>(null);
  const aiJobRejectRef = useRef<((reason?: unknown) => void) | null>(null);
  const aiJobTimeoutRef = useRef<number | null>(null);
  const aiJobPollRef = useRef<number | null>(null);

  const cancelActiveAiRun = (reason: string, notify: boolean = true) => {
    const activeJobId = activeAiJobIdRef.current;
    if (activeJobId) {
      request
        .post("ai-generate-seo-content", {
          json: { mode: "cancel", jobId: activeJobId },
          timeout: 8000,
        })
        .json<any>()
        .catch(() => {
          // UI cancellation is already applied locally; backend cancel is best-effort.
        });
    }

    if (aiJobTimeoutRef.current) {
      window.clearTimeout(aiJobTimeoutRef.current);
      aiJobTimeoutRef.current = null;
    }
    if (aiJobPollRef.current) {
      window.clearInterval(aiJobPollRef.current);
      aiJobPollRef.current = null;
    }

    const reject = aiJobRejectRef.current;
    activeAiJobIdRef.current = null;
    aiJobResolveRef.current = null;
    aiJobRejectRef.current = null;

    setAiStopReason(reason);
    setAiProgress((prev) => ({
      ...(prev || {}),
      status: "failed",
      stage: "stopped",
      message: reason,
    }));

    if (notify) {
      message.warning(reason);
    }

    reject?.(new Error(reason));
  };

  const setMergePreviewState = (mergePreview: any) => {
    if (!mergePreview) return;
    syncPatchReviewState(Array.isArray(mergePreview.patchOps) ? mergePreview.patchOps : []);
    setMergeStats({
      added: Number(mergePreview.added || 0),
      edited: Number(mergePreview.edited || 0),
      deleted: Number(mergePreview.deleted || 0),
    });
  };

  const setEditorFromMenus = (
    menus: MenuItemType[] | null | undefined,
    source: "current" | "sample" = "current",
  ) => {
    const decodedMenus = transformMenuTriggers(Array.isArray(menus) ? menus : [], "decode");
    const normalized = normalizeMenuList(decodedMenus);
    if (normalized.length === 0) return;
    const payload = { menu: normalized };
    const text = JSON.stringify(payload, null, 2);
    setEditableAiDraftText(text);
    setAiResultText(text);
    setAiMenus(normalized);
    setAiProgress({
      status: "ready",
      stage: "editor_seeded",
      message: source === "sample"
        ? (t("system.menu.aiDesigner.editorSeed.sample") || "Đã nạp JSON từ chương trình mẫu vào editor")
        : (t("system.menu.aiDesigner.editorSeed.current") || "Đã nạp JSON menu hiện tại vào editor"),
      current: 0,
      total: 1,
      percent: 0,
    });
    syncPatchReviewState([]);
    setLiveEditLines([]);
    setMergeStats(null);
    setValidationProfile("legacy");
  };

  const applyTextEditsToDraft = (currentText: string, textEdits: any[]): string => {
    if (!Array.isArray(textEdits) || textEdits.length === 0) return currentText;
    const lines = String(currentText || "").split("\n");
    const normalizeLine = (edit: any, key: "start" | "end"): number => {
      if (!edit) return key === "start" ? 1 : 1;
      if (key === "start") {
        return Number(
          edit?.startLine
          ?? edit?.range?.startLine
          ?? edit?.range?.start?.line
          ?? edit?.line
          ?? 1,
        );
      }
      return Number(
        edit?.endLine
        ?? edit?.range?.endLine
        ?? edit?.range?.end?.line
        ?? edit?.startLine
        ?? edit?.range?.startLine
        ?? edit?.range?.start?.line
        ?? 1,
      );
    };

    const getReplacement = (edit: any): string => {
      return String(
        edit?.replacement
        ?? edit?.newText
        ?? edit?.text
        ?? "",
      );
    };

    const sorted = [...textEdits].sort((a, b) => normalizeLine(b, "start") - normalizeLine(a, "start"));
    for (const edit of sorted) {
      const startLine = Math.max(1, normalizeLine(edit, "start"));
      const endLine = Math.max(startLine, normalizeLine(edit, "end"));
      const replacementLines = getReplacement(edit).split("\n");
      lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines);
    }
    return lines.join("\n");
  };

  const buildLiveEditLineInfos = (textEdits: any[]): DiffLineInfo[] => {
    if (!Array.isArray(textEdits) || textEdits.length === 0) return [];
    const normalizeLine = (edit: any, key: "start" | "end"): number => {
      if (key === "start") {
        return Number(edit?.startLine ?? edit?.range?.startLine ?? edit?.range?.start?.line ?? edit?.line ?? 1);
      }
      return Number(edit?.endLine ?? edit?.range?.endLine ?? edit?.range?.end?.line ?? edit?.startLine ?? 1);
    };
    const unique = new Map<string, DiffLineInfo>();
    textEdits.forEach((edit, idx) => {
      const startLine = Math.max(1, normalizeLine(edit, "start"));
      const endLine = Math.max(startLine, normalizeLine(edit, "end"));
      for (let line = startLine; line <= endLine; line++) {
        const key = `live_${line}`;
        if (!unique.has(key)) {
          unique.set(key, {
            line,
            action: "edit",
            nodeId: key,
            nodeName: `Live edit ${idx + 1}`,
            nodePath: `AI live edit · line ${line}`,
            reviewStatus: "pending",
          });
        }
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.line - b.line);
  };

  const applySocketDraftPayload = (payload: any) => {
    const status = String(payload?.status || "").toLowerCase();
    if (!aiLiveEditEnabled && status !== "completed") {
      return;
    }

    const progress = payload?.progress || payload;
    const mergePreview = payload?._merge_preview || payload?.result?._merge_preview || payload?.result?.data?._merge_preview || progress?._merge_preview;
    if (mergePreview) {
      setMergePreviewState(mergePreview);
      setLiveEditLines([]);
    }

    const patchPayload = progress?.patchOps || payload?.patchOps;
    if (Array.isArray(patchPayload)) {
      const nextPatchOps = patchPayload as PatchOp[];
      syncPatchReviewState(nextPatchOps);

      const deletedCount = nextPatchOps.filter((op) => op.action === "delete").length;
      const baseNodeCount = flattenMenuNodes(decodedCurrentMenus, 5000).length;
      const guardRequestText = [storedRequest, requestText].filter(Boolean).join("\n");
      if (shouldTriggerMassDeleteGuard({
        scenario: operationScenario,
        baseNodes: baseNodeCount,
        deleted: deletedCount,
        requestText: guardRequestText,
      })) {
        const reason = `Da phat hien AI xoa bat thuong (${deletedCount}/${baseNodeCount} node). Da dung job de bao ve menu goc.`;
        setEditableAiDraftText(JSON.stringify({ menu: decodedCurrentMenus }, null, 2));
        cancelActiveAiRun(reason);
        return;
      }
    }

    const explicitDraft = payload?.draftText || payload?.result?.draftText || progress?.draftText || progress?.partialJson || progress?.previewJson;
    if (typeof explicitDraft === "string" && explicitDraft.trim()) {
      setEditableAiDraftText(explicitDraft);
      return;
    }

    const textEdits = payload?.textEdits || progress?.textEdits;
    if (Array.isArray(textEdits) && textEdits.length > 0) {
      setLiveEditLines(buildLiveEditLineInfos(textEdits));
      setEditableAiDraftText((prev) => applyTextEditsToDraft(prev || aiResultText || "", textEdits));
    }
  };

  const applyProgressPayload = (payload: any) => {
    const progress = payload?.progress || payload;
    if (!progress) return;
    applySocketDraftPayload(payload);
    const nextProgress: AiProgressState = {
      jobId: payload?.jobId || activeAiJobIdRef.current || undefined,
      status: payload?.status || progress?.status,
      stage: progress?.stage,
      message: progress?.message,
      current: Number(progress?.current ?? 0),
      total: Number(progress?.total ?? 1),
      percent: Number(progress?.percent ?? 0),
      elapsedMs: Number(payload?.elapsedMs ?? progress?.elapsedMs ?? 0),
      waitingMs: Number(payload?.waitingMs ?? progress?.waitingMs ?? 0),
      level: progress?.level != null ? Number(progress.level) : undefined,
    };
    setAiProgress(nextProgress);
  };

  useEffect(() => {
    if (!socket) return;

    const handleRealtimeProgress = (payload: any) => {
      if (!payload?.jobId || payload.jobId !== activeAiJobIdRef.current) return;
      applyProgressPayload(payload);
    };

    const handleRealtimePatch = (payload: any) => {
      if (!payload?.jobId || payload.jobId !== activeAiJobIdRef.current) return;
      applySocketDraftPayload(payload);
    };

    const handleRealtimeResult = (payload: any) => {
      if (!payload?.jobId || payload.jobId !== activeAiJobIdRef.current) return;
      applySocketDraftPayload(payload);
      applyProgressPayload(payload);
      if (aiJobTimeoutRef.current) {
        window.clearTimeout(aiJobTimeoutRef.current);
        aiJobTimeoutRef.current = null;
      }
      if (aiJobPollRef.current) {
        window.clearInterval(aiJobPollRef.current);
        aiJobPollRef.current = null;
      }
      const result = payload?.result;
      if (String(payload?.status || "").toLowerCase() === "failed") {
        aiJobRejectRef.current?.(new Error(String(result?.message || payload?.progress?.message || "AI failed")));
      } else {
        aiJobResolveRef.current?.(result || payload);
      }
      aiJobResolveRef.current = null;
      aiJobRejectRef.current = null;
      activeAiJobIdRef.current = null;
    };

    socket.on("ai_job_progress", handleRealtimeProgress);
    socket.on("ai_job_patch", handleRealtimePatch);
    socket.on("ai_job_result", handleRealtimeResult);
    return () => {
      socket.off?.("ai_job_progress", handleRealtimeProgress);
      socket.off?.("ai_job_patch", handleRealtimePatch);
      socket.off?.("ai_job_result", handleRealtimeResult);
    };
  }, [socket]);

  useEffect(() => {
    if (loading) return;
    if (!appId) return;
    if (editableAiDraftText.trim()) return;
    if (aiResultText.trim()) return;
    if (!Array.isArray(currentMenus) || currentMenus.length === 0) return;
    setEditorFromMenus(currentMenus, "current");
  }, [appId, currentMenus, loading, editableAiDraftText, aiResultText]);

  const generateMenuWithRealtime = async (
    prompt: string,
    taskType: string,
    mergeScenario?: "incremental_update",
    mergeOldJson?: string,
  ) => {
    if (!socket || !socketConnected || !appId) {
      return generateSeoContentWithPrompt(prompt, {
        providerPreference: isDevUser ? "github_models" : undefined,
        disableGeminiFallback: isDevUser,
        taskType,
        menuDesignByDev: isDevUser,
        onProgress: applyProgressPayload,
      });
    }

    const submitResponse = await request
      .post("ai-generate-seo-content", {
        json: {
          prompt,
          mode: "submit",
          async: true,
          providerPreference: isDevUser ? "github_models" : undefined,
          disableGeminiFallback: isDevUser,
          taskType,
          menuDesignByDev: isDevUser,
          realtimeAppId: appId,
          mergeScenario,
          mergeOldJson,
        },
        timeout: 30000,
      })
      .json<any>();

    const submitPayload = (submitResponse?.result || submitResponse?.data || {}) as Record<string, any>;
    const jobId = String(submitPayload?.jobId || "").trim();
    if (!jobId) {
      return generateSeoContentWithPrompt(prompt, {
        providerPreference: isDevUser ? "github_models" : undefined,
        disableGeminiFallback: isDevUser,
        taskType,
        menuDesignByDev: isDevUser,
        onProgress: applyProgressPayload,
      });
    }

    activeAiJobIdRef.current = jobId;
    if (submitPayload?.progress) {
      applyProgressPayload({ jobId, status: submitPayload?.status || "queued", progress: submitPayload.progress });
    }

    return await new Promise<any>((resolve, reject) => {
      let done = false;
      let pollingInFlight = false;
      let notFoundCount = 0;

      const finishSuccess = (value: any) => {
        if (done) return;
        done = true;
        if (aiJobTimeoutRef.current) {
          window.clearTimeout(aiJobTimeoutRef.current);
          aiJobTimeoutRef.current = null;
        }
        if (aiJobPollRef.current) {
          window.clearInterval(aiJobPollRef.current);
          aiJobPollRef.current = null;
        }
        activeAiJobIdRef.current = null;
        aiJobResolveRef.current = null;
        aiJobRejectRef.current = null;
        resolve(value);
      };

      const finishError = (error: unknown) => {
        if (done) return;
        done = true;
        if (aiJobTimeoutRef.current) {
          window.clearTimeout(aiJobTimeoutRef.current);
          aiJobTimeoutRef.current = null;
        }
        if (aiJobPollRef.current) {
          window.clearInterval(aiJobPollRef.current);
          aiJobPollRef.current = null;
        }
        activeAiJobIdRef.current = null;
        aiJobResolveRef.current = null;
        aiJobRejectRef.current = null;
        reject(error instanceof Error ? error : new Error(String(error || "AI failed")));
      };

      aiJobResolveRef.current = finishSuccess;
      aiJobRejectRef.current = finishError;

      const pollStatus = async () => {
        if (done || pollingInFlight || activeAiJobIdRef.current !== jobId) return;
        pollingInFlight = true;
        try {
          const statusResponse = await request
            .post("ai-generate-seo-content", {
              json: { mode: "status", jobId },
              timeout: 20000,
            })
            .json<any>();

          const ok = Boolean(statusResponse?.success);
          const statusPayload = (statusResponse?.result || statusResponse?.data || {}) as Record<string, any>;
          if (statusPayload?.progress) {
            applyProgressPayload({
              jobId,
              status: statusPayload?.status,
              progress: statusPayload.progress,
              elapsedMs: statusPayload?.elapsedMs,
            });
          }

          if (!ok) {
            const errorCode = String(statusResponse?.errorCode || statusResponse?.result?.errorCode || "").trim();
            if (errorCode === "ASYNC_JOB_NOT_FOUND") {
              notFoundCount += 1;
              if (notFoundCount >= 3) {
                finishError(new Error("Không tìm thấy AI job realtime (job có thể đã hết hạn)."));
              }
            }
            return;
          }

          notFoundCount = 0;
          const status = String(statusPayload?.status || "").toLowerCase();
          if (status === "completed") {
            finishSuccess(statusPayload?.result || statusPayload);
            return;
          }
          if (status === "failed") {
            const result = statusPayload?.result;
            finishError(new Error(String(result?.message || statusPayload?.progress?.message || "AI failed")));
          }
        } catch {
          // Keep polling: transient errors should not break an in-flight job.
        } finally {
          pollingInFlight = false;
        }
      };

      const pollAfterMs = Math.max(2000, Number(submitPayload?.pollAfterMs || 3000));
      aiJobPollRef.current = window.setInterval(() => {
        void pollStatus();
      }, pollAfterMs);
      void pollStatus();

      aiJobTimeoutRef.current = window.setTimeout(() => {
        if (activeAiJobIdRef.current !== jobId) return;
        finishError(new Error("Hết thời gian chờ realtime AI"));
      }, 45 * 60 * 1000);
    });
  };

  /**
   * Send old/new JSON to backend Jackson merge service to compute precise add/edit/delete patch ops.
   * The backend does the real merge logic; frontend uses patchOps only for visual diff rendering.
   */
  const runBackendMenuMerge = async (
    scenario: "incremental_update",
    oldJson: string,
    newJson: string,
  ): Promise<MenuMergeResult | null> => {
    try {
      setMergeLoading(true);
      const result = await callAiMenuMerge({ scenario, old_json: oldJson, new_json: newJson });
      syncPatchReviewState(Array.isArray(result.patchOps) ? result.patchOps : []);
      setMergeStats({
        added: Number(result.added || 0),
        edited: Number(result.edited || 0),
        deleted: Number(result.deleted || 0),
      });
      return result;
    } catch {
      syncPatchReviewState([]);
      setMergeStats(null);
      return null;
    } finally {
      setMergeLoading(false);
    }
  };

  const syncPatchReviewState = (nextOps: PatchOp[]) => {
    setPatchOps(nextOps);
    setMergeStats(buildMergeStatsFromPatchOps(nextOps));
    setPatchReviewStatus((prev) => {
      const active = new Set((Array.isArray(nextOps) ? nextOps : []).map((op) => String(op.nodeId || "")).filter(Boolean));
      const retained: Partial<Record<string, PatchReviewStatus>> = {};
      Object.entries(prev || {}).forEach(([key, value]) => {
        if (active.has(key) && value) retained[key] = value;
      });
      return retained;
    });
  };

  const handleKeepAiPatch = (nodeId: string) => {
    if (!nodeId) return;
    setPatchReviewStatus((prev) => ({ ...prev, [nodeId]: "kept" }));
  };

  const handleUndoAiPatch = (nodeId: string) => {
    if (!nodeId) return;
    const targetOp = patchOps.find((item) => item.nodeId === nodeId);
    if (!targetOp) return;

    const rawDraftText = String(editableAiDraftText || aiResultText || "").trim();
    if (!rawDraftText) {
      message.warning("Khong co draft AI de undo");
      return;
    }

    try {
      const parsedDraft = JSON.parse(rawDraftText);
      const baseMenus = normalizeMenuList(Array.isArray(currentMenus) ? currentMenus : []);

      if (isLikelyMenuNode(parsedDraft?.menu_node)) {
        const originalNode = findMenuNodeById(baseMenus, nodeId);
        if (!originalNode) {
          message.warning("Khong tim thay node goc de undo");
          return;
        }

        const nextPayload = isPlainObject(parsedDraft)
          ? { ...parsedDraft, menu_node: cloneMenuTree(originalNode) }
          : { menu_node: cloneMenuTree(originalNode) };
        const nextText = JSON.stringify(nextPayload, null, 2);
        const nextMenus = restoreMenuNodeFromBase(Array.isArray(aiMenus) ? aiMenus : baseMenus, baseMenus, nodeId);
        setEditableAiDraftText(nextText);
        setAiMenus(nextMenus);
        setPatchReviewStatus((prev) => ({ ...prev, [nodeId]: "undone" }));
        return;
      }

      const extractedMenus = extractMenuListFromPayload(parsedDraft);
      const draftMenus = normalizeMenuList(extractedMenus.length > 0 ? extractedMenus : (Array.isArray(aiMenus) ? aiMenus : []));
      const revertedMenus = revertPatchOpOnMenus(draftMenus, baseMenus, targetOp);

      let nextPayload: any;
      if (Array.isArray(parsedDraft?.menu)) {
        nextPayload = { ...parsedDraft, menu: revertedMenus };
      } else if (Array.isArray(parsedDraft?.data?.menu)) {
        nextPayload = { ...parsedDraft, data: { ...parsedDraft.data, menu: revertedMenus } };
      } else if (Array.isArray(parsedDraft)) {
        nextPayload = revertedMenus;
      } else {
        nextPayload = { ...(isPlainObject(parsedDraft) ? parsedDraft : {}), menu: revertedMenus };
      }

      setEditableAiDraftText(JSON.stringify(nextPayload, null, 2));
      setAiMenus(revertedMenus);
      setPatchReviewStatus((prev) => ({ ...prev, [nodeId]: "undone" }));
    } catch {
      message.warning("Draft hien tai khong phai JSON hop le, khong the undo");
    }
  };

  /**
   * Whenever the result JSON or patch ops change, map node ids -> line numbers and
   * ask CodeMirror to decorate exactly those lines with add/edit/delete coloring.
   */
  useEffect(() => {
    const view = resultEditorViewRef.current;
    if (!view) return;
    const activeText = editableAiDraftText || aiResultText;
    if (!activeText) {
      view.dispatch({ effects: setDiffDecorations.of([]) });
      return;
    }

    if (patchOps.length === 0) {
      view.dispatch({ effects: setDiffDecorations.of(liveEditLines) });
      return;
    }

    const map = buildNodeLineMap(activeText, patchOps);
    view.dispatch({
      effects: setDiffDecorations.of(
        Array.from(map.values()).map((item) => {
          const reviewStatus: "pending" | PatchReviewStatus = patchReviewStatus[item.nodeId] ?? "pending";
          return {
            ...item,
            reviewStatus,
            onKeep: reviewStatus === "pending" ? handleKeepAiPatch : undefined,
            onUndo: reviewStatus === "pending" ? handleUndoAiPatch : undefined,
          };
        }),
      ),
    });
  }, [editableAiDraftText, aiResultText, patchOps, liveEditLines, patchReviewStatus, handleKeepAiPatch, handleUndoAiPatch]);

  const patchLineMap = useMemo(() => {
    const activeText = editableAiDraftText || aiResultText;
    if (!activeText || patchOps.length === 0) return new Map<string, DiffLineInfo>();
    return buildNodeLineMap(activeText, patchOps);
  }, [editableAiDraftText, aiResultText, patchOps]);

  const patchOpsView = useMemo<PatchOpView[]>(() => {
    return (Array.isArray(patchOps) ? patchOps : []).map((op) => ({
      ...op,
      line: patchLineMap.get(op.nodeId)?.line,
    }));
  }, [patchOps, patchLineMap]);

  const visiblePatchOps = useMemo<PatchOpView[]>(() => {
    const q = String(patchKeyword || "").trim().toLowerCase();
    return patchOpsView.filter((op) => {
      if (patchActionFilter !== "all" && op.action !== patchActionFilter) return false;
      if (!q) return true;
      const haystack = `${op.nodePath || ""} ${op.nodeName || ""} ${op.nodeId || ""} ${(op.changedFields || []).map((f) => f.fieldName).join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [patchOpsView, patchKeyword, patchActionFilter]);

  const focusPatchOpLine = (nodeId: string) => {
    const view = resultEditorViewRef.current;
    if (!view) return;
    const lineNo = patchLineMap.get(nodeId)?.line;
    if (!lineNo || lineNo < 1 || lineNo > view.state.doc.lines) {
      message.info("Khong tim thay dong node trong editor hien tai.");
      return;
    }
    const line = view.state.doc.line(lineNo);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
  };

  const effectiveDraftMenus = useMemo(() => {
    const rawDraftText = String(editableAiDraftText || "").trim();
    if (rawDraftText) {
      try {
        const parsedDraft = JSON.parse(rawDraftText);
        const extracted = extractMenuListFromPayload(parsedDraft);
        if (extracted.length > 0) return normalizeMenuList(extracted);
      } catch {
        return [];
      }
    }
    return normalizeMenuList(aiMenus || []);
  }, [editableAiDraftText, aiMenus]);

  const menuValidationIssues = useMemo(() => {
    return validateMenusForApply(effectiveDraftMenus || [], validationProfile);
  }, [effectiveDraftMenus, validationProfile]);
  const menuValidationErrors = useMemo(
    () => menuValidationIssues.filter((item) => item.severity === "error"),
    [menuValidationIssues],
  );
  const menuValidationWarnings = useMemo(
    () => menuValidationIssues.filter((item) => item.severity === "warning"),
    [menuValidationIssues],
  );

  const expectedModules = useMemo(() => extractRequirementModules(storedRequest || requestText || "", 20), [storedRequest, requestText]);
  const expectedTables = useMemo(() => extractRequirementTables(storedRequest || requestText || "", 30), [storedRequest, requestText]);

  const applyGuardIssues = useMemo(() => {
    const issues: string[] = [];
    const unresolvedThreshold = 2;

    if (aiOutputMeta.unresolvedAssumptions.length > unresolvedThreshold) {
      issues.push(`AI còn ${aiOutputMeta.unresolvedAssumptions.length} unresolved assumptions (ngưỡng cho phép: ${unresolvedThreshold}).`);
    }

    if (expectedModules.length >= 2 && aiOutputMeta.coverageModules.length === 0) {
      issues.push("Thiếu coverage_modules dù requirement có nhiều module.");
    }

    if (expectedTables.length >= 1 && aiOutputMeta.coverageTables.length === 0) {
      issues.push("Thiếu coverage_tables dù requirement có bảng/entity rõ ràng.");
    }

    if (aiOutputMeta.coverageModules.some((entry) => entry.status === "missing")) {
      issues.push("coverage_modules còn trạng thái missing.");
    }

    if (aiOutputMeta.coverageTables.some((entry) => entry.status === "missing")) {
      issues.push("coverage_tables còn trạng thái missing.");
    }

    return issues;
  }, [aiOutputMeta.coverageModules, aiOutputMeta.coverageTables, aiOutputMeta.unresolvedAssumptions.length, expectedModules.length, expectedTables.length]);

  const hasStoredRequest = storedRequest.trim().length > 0;
  const applyMenuCount = effectiveDraftMenus.length;
  const decodedCurrentMenus = useMemo(
    () => transformMenuTriggers(Array.isArray(currentMenus) ? currentMenus : [], "decode"),
    [currentMenus],
  );
  const decodedSampleMenus = useMemo(
    () => transformMenuTriggers(sampleMenuParsed || [], "decode"),
    [sampleMenuParsed],
  );

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
          setStoredLastResult(item.last_result || "");
          setContextFiles(parseContextFiles(item.context_files_json));
          setRecordId(item.id);
        } else {
          setStoredRequest("");
          setStoredLastResult("");
          setContextFiles([]);
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
      context_files_json: serializeContextFiles(contextFiles),
      generate_mode: "full",
      updated_at: now,
      created_at: payload.created_at || now,
      ...payload,
    };

    try {
      await updateTableData<AiRequestRecord>({
        app_id: "csm",
        obj_name: AI_REQUEST_TABLE,
        command: mode,
        obj_update: objUpdate,
        pk_fields: ["app_id_target"],
      });
    } catch (error: any) {
      const errorText = String(error?.message || error?.response?.data?.message || "").toLowerCase();
      const isDuplicateCreate = mode === "create"
        && (errorText.includes("trùng khóa chính")
          || errorText.includes("trung khoa chinh")
          || errorText.includes("duplicate")
          || errorText.includes("primary key"));

      if (!isDuplicateCreate) {
        throw error;
      }

      await updateTableData<AiRequestRecord>({
        app_id: "csm",
        obj_name: AI_REQUEST_TABLE,
        command: "update",
        obj_update: objUpdate,
        pk_fields: ["app_id_target"],
      });
    }

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
        setSampleMenuError(t("system.menu.aiDesigner.sampleMenu.loadNotFound", { appId: targetAppId }) || `Không tìm thấy menu mẫu trong ứng dụng ${targetAppId}.`);
        return;
      }
      const normalized = normalizeMenuList(rawMenuList);
      setSampleMenuParsed(normalized);
      setSampleMenuError(null);
      setEditorFromMenus(normalized, "sample");
      message.success(t("system.menu.aiDesigner.sampleMenu.loadSuccess", { count: normalized.length, appId: targetAppId }) || `Đã nạp ${normalized.length} menu gốc từ app ${targetAppId} làm mẫu cho AI.`);
    } catch (e: any) {
      setSampleMenuParsed(null);
      setSampleMenuError(t("system.menu.aiDesigner.sampleMenu.loadFailed", { appId: targetAppId, error: e?.message || "Unknown error" }) || `Không thể tải menu mẫu từ app ${targetAppId}: ${e?.message || "Unknown error"}`);
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

  const handleContextJsonFile = async (file: File) => {
    if (!file) return false;

    if (contextFiles.length >= MAX_CONTEXT_FILES) {
      message.warning(t("system.menu.aiDesigner.context.maxFiles", { max: MAX_CONTEXT_FILES }) || `Chi duoc dinh kem toi da ${MAX_CONTEXT_FILES} file JSON.`);
      return false;
    }

    const name = String(file.name || "");
    if (!name.toLowerCase().endsWith(".json")) {
      message.warning(t("system.menu.aiDesigner.context.jsonOnly") || "Chi nhan file .json de dam bao AI doc dung cau truc.");
      return false;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const normalized = JSON.stringify(parsed, null, 2);
      const next: JsonContextFile = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        size: Number(file.size || normalized.length),
        content: trimToMax(normalized, MAX_CONTEXT_FILE_CHARS),
        summary: summarizeJsonContent(parsed),
      };

      setContextFiles((prev) => {
        const exists = prev.some((item) => item.name === next.name);
        if (exists) {
          return prev.map((item) => (item.name === next.name ? next : item));
        }
        return [...prev, next];
      });
      message.success(t("system.menu.aiDesigner.context.fileLoaded", { name }) || `Da nap context JSON: ${name}`);
    } catch (error) {
      console.error("Invalid JSON context file:", error);
      message.error(t("system.menu.aiDesigner.context.fileInvalid", { name }) || `File ${name} khong hop le JSON.`);
    }

    return false;
  };

  const removeContextFile = (id: string) => {
    setContextFiles((prev) => prev.filter((item) => item.id !== id));
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

    const prompt = trimToMax(
      promptOverride
        || JSON.stringify(
          buildAiMenuRequestPayload(appId, inputRequest, scope, decodedCurrentMenus, decodedSampleMenus || undefined, contextFiles),
          null,
          2,
        ),
      120000,
    );
    setLoading(true);
    setAiStopReason("");
    setValidationProfile("strict");
    setAiMenus(null);
    setAiResultText("");
    setLiveEditLines([]);
    setAiOutputMeta({ coverageModules: [], coverageTables: [], unresolvedAssumptions: [] });

    if (operationScenario === "incremental_update" && decodedCurrentMenus.length > 0) {
      setEditableAiDraftText(JSON.stringify({ menu: decodedCurrentMenus }, null, 2));
    }
    const preparingProgress: AiProgressState = {
      status: "preparing",
      stage: "preparing",
      message: t("system.menu.aiDesigner.progress.preparing") || "Đang chuẩn bị và gửi yêu cầu AI",
      current: 0,
      total: 1,
      percent: 0,
      elapsedMs: 0,
    };
    setAiProgress(preparingProgress);

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

      const res = await generateMenuWithRealtime(
        prompt,
        "menu_design",
        operationScenario === "incremental_update" ? "incremental_update" : undefined,
        operationScenario === "incremental_update" && Array.isArray(currentMenus)
          ? JSON.stringify(decodedCurrentMenus, null, 2)
          : undefined,
      );
      const payload = extractAiPayload(res);
      if (!payload) {
        message.error(t("system.menu.aiDesigner.invalidJson") || "AI trả về không đúng JSON");
        setAiResultText(String(res?.message || "AI error"));
        setEditableAiDraftText(String(res?.message || "AI error"));
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
      let finalMenus = normalized;
      if (operationScenario === "incremental_update" && decodedCurrentMenus.length > 0) {
        const mergeResult = payload?._merge_preview || payload?.data?._merge_preview || await runBackendMenuMerge(
          "incremental_update",
          JSON.stringify(decodedCurrentMenus, null, 2),
          JSON.stringify(normalized, null, 2),
        );
        if (mergeResult && Array.isArray(mergeResult.mergedMenu) && mergeResult.mergedMenu.length > 0) {
          finalMenus = normalizeMenuList(mergeResult.mergedMenu as MenuItemType[]);
        }
        if (mergeResult) {
          syncPatchReviewState(Array.isArray(mergeResult.patchOps) ? mergeResult.patchOps : []);
          setMergeStats({
            added: Number(mergeResult.added || 0),
            edited: Number(mergeResult.edited || 0),
            deleted: Number(mergeResult.deleted || 0),
          });
        }
        finalMenus = restoreMissingTriggersFromBase(decodedCurrentMenus, finalMenus);

        const deletedCount = Number(mergeResult?.deleted || 0);
        const baseNodeCount = flattenMenuNodes(decodedCurrentMenus, 5000).length;
        const guardRequestText = [storedRequest, requestText].filter(Boolean).join("\n");
        if (shouldTriggerMassDeleteGuard({
          scenario: operationScenario,
          baseNodes: baseNodeCount,
          deleted: deletedCount,
          requestText: guardRequestText,
        })) {
          const stopMessage = `Ket qua AI bi chan an toan: xoa ${deletedCount}/${baseNodeCount} node (vuot nguong incremental update).`;
          setAiMenus(decodedCurrentMenus);
          setAiResultText(JSON.stringify({
            success: false,
            stage: "guard_blocked",
            message: stopMessage,
            action: "giu_nguyen_menu_goc",
          }, null, 2));
          setEditableAiDraftText(JSON.stringify({ menu: decodedCurrentMenus }, null, 2));
          setAiProgress((prev) => ({
            ...(prev || {}),
            status: "failed",
            stage: "guard_blocked",
            message: stopMessage,
          }));
          message.error(stopMessage);
          return;
        }
      } else {
        syncPatchReviewState([]);
        setMergeStats(null);
      }

      const outputMeta = extractAiOutputMeta(payload);
      const output = {
        menu: finalMenus,
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
        coverage_modules: outputMeta.coverageModules.map((entry) => ({
          module: entry.item,
          menus: entry.menus,
          status: entry.status,
        })),
        coverage_tables: outputMeta.coverageTables.map((entry) => ({
          table: entry.item,
          menus: entry.menus,
          status: entry.status,
        })),
        unresolved_assumptions: outputMeta.unresolvedAssumptions,
      };

      const severeIssues = detectSevereAiOutputIssues(finalMenus, inputRequest);
      if (severeIssues.length > 0 && attempt < 1) {
        const autoRefineText = buildAutoRepairRefineText(severeIssues);
        const autoRepairPrompt = JSON.stringify(
          buildAiMenuRefinePayload(
            appId,
            inputRequest,
            autoRefineText,
            JSON.stringify(output),
            "complete",
            decodedCurrentMenus,
            decodedSampleMenus || undefined,
            false,
            contextFiles,
          ),
          null,
          2,
        );

        setAiProgress({
          status: "running",
          stage: "refining",
          message: t("system.menu.aiDesigner.progress.autoRefining") || "Ket qua AI lan 1 chua dat. Dang tu dong sua va tao lai...",
          current: 0,
          total: 1,
          percent: 0,
        });
        setAiResultText(JSON.stringify({
          success: false,
          stage: "refining",
          message: t("system.menu.aiDesigner.progress.autoRefineResult") || "KQ lan 1 chua dat chat luong, dang auto-refine.",
          issues: severeIssues,
        }, null, 2));
        setEditableAiDraftText(JSON.stringify({
          success: false,
          stage: "refining",
          message: t("system.menu.aiDesigner.progress.autoRefineResult") || "KQ lan 1 chua dat chat luong, dang auto-refine.",
          issues: severeIssues,
        }, null, 2));

        await runGenerate(inputRequest, scope, autoRepairPrompt, attempt + 1);
        return;
      }

        setAiMenus(finalMenus);
  setAiOutputMeta(outputMeta);
      setAiResultText(JSON.stringify(output, null, 2));
          setEditableAiDraftText(JSON.stringify(output, null, 2));

      await saveRequestRecord(
        {
          request_text: inputRequest,
          last_result: JSON.stringify(output),
          context_files_json: serializeContextFiles(contextFiles),
          updated_at: Date.now(),
        },
        "update",
      );
      setStoredLastResult(JSON.stringify(output));

      setAiProgress((prev) => ({
        ...(prev || {}),
        status: "completed",
        stage: "completed",
        message: t("system.menu.aiDesigner.progress.completedWithCount", { count: finalMenus.length }) || `Đã hoàn tất tạo ${finalMenus.length} menu/chức năng`,
        current: 1,
        total: 1,
        percent: 100,
      }));

      message.success(
        operationScenario === "incremental_update"
          ? (t("system.menu.aiDesigner.incremental.mergeComputed") || "Đã tính chính xác các thay đổi add/edit/delete bằng Jackson")
          : (t("system.menu.aiDesigner.generateSuccess") || "Đã tạo menu bằng AI"),
      );
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

  const handleGenerate = async () => {
    // ── Kịch bản 2: Chỉnh sửa toàn diện trên menu hiện có ─────────────────
    if (operationScenario === "incremental_update") {
      if (!requestText.trim()) {
        message.warning(t("system.menu.aiDesigner.incremental.enterRequest") || "Hãy nhập mô tả thay đổi (menu/field/trigger)");
        return;
      }
      const baseMenus = decodedCurrentMenus;
      if (baseMenus.length === 0) {
        message.warning(t("system.menu.aiDesigner.incremental.noBaseMenu") || "Không có menu hiện tại để chỉnh sửa. Hãy dùng kịch bản Tạo mới.");
        return;
      }
      const prompt = trimToMax(
        JSON.stringify(
          buildAiIncrementalUpdatePayload(
            appId,
            storedRequest,
            requestText,
            baseMenus,
            contextFiles,
          ),
          null, 2,
        ),
        120000,
      );
      const combinedRequest = [storedRequest || "", "\n[Incremental update]\n", requestText].join("\n").trim();
      await runGenerate(combinedRequest, "complete", prompt);
      return;
    }

    // ── Kịch bản 1: New Build ─────────────────────────────────────────────

    if (sampleUseAsBase && sampleMenuParsed && sampleMenuParsed.length > 0) {
      const baseJson = JSON.stringify({ menu: decodedSampleMenus }, null, 2);
      const prompt = JSON.stringify(
        buildAiMenuRefinePayload(
          appId,
          "",
          mergedRequestText,
          baseJson,
          "complete",
          decodedCurrentMenus,
          decodedSampleMenus || undefined,
          true,
          contextFiles,
        ),
        null,
        2,
      );
      await runGenerate(mergedRequestText, "complete", prompt);
    } else {
      await runGenerate(mergedRequestText, "complete");
    }
  };

  const handleApply = async () => {
    let draftMenus = aiMenus || [];
    if (editableAiDraftText.trim()) {
      try {
        const parsedDraft = JSON.parse(editableAiDraftText);
        if (isLikelyMenuNode(parsedDraft?.menu_node)) {
          const baseMenus = Array.isArray(currentMenus) ? currentMenus : [];
          draftMenus = replaceMenuNodeById(
            baseMenus,
            String((parsedDraft.menu_node as any).id),
            normalizeAiMenuNode(parsedDraft.menu_node) as MenuItemType,
          );
        } else {
          const extracted = extractMenuListFromPayload(parsedDraft);
          if (extracted.length > 0) {
            draftMenus = normalizeMenuList(extracted);
          }
        }
      } catch {
        // Keep fallback aiMenus when draft text is temporarily invalid JSON.
      }
    }

    draftMenus = normalizeMenuList(draftMenus || []);

    if (!draftMenus || draftMenus.length === 0) {
      message.warning(t("system.menu.aiDesigner.noMenuToApply") || "Không có menu để áp dụng");
      return;
    }

    if (menuValidationErrors.length > 0) {
      message.error(`Khong the ap dung vi con ${menuValidationErrors.length} loi schema/nghiep vu.`);
      return;
    }

    if (applyGuardIssues.length > 0) {
      message.error(`Khong the ap dung: ${applyGuardIssues[0]}`);
      return;
    }

    const nextMenus = normalizeMenuList(transformMenuTriggers(draftMenus, "decode"));
    const menusForSave = transformMenuTriggers(nextMenus, "encode");

    try {
      await onApply(menusForSave);
      const canonicalOutput = JSON.stringify({ menu: nextMenus }, null, 2);
      setAiMenus(nextMenus);
      setAiResultText(canonicalOutput);
      setEditableAiDraftText(canonicalOutput);
      message.success(t("system.menu.aiDesigner.applySuccess") || "Đã áp dụng menu vào hệ thống");
    } catch (error) {
      console.error("Apply AI menu failed:", error);
      message.error(t("system.menu.aiDesigner.applyFailed") || "Áp dụng menu thất bại");
    }
  };

  return (
    <>
      <Card title={t("system.menu.aiDesigner.panelTitle") || "AI Thiet ke Menu Tu dong"} bordered={false}>
        {!appId && <Alert type="warning" showIcon message={t("system.menu.aiDesigner.selectAppFirst") || "Vui long chon App truoc khi su dung AI."} />}

        {/* ── Scenario Selector ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{t("system.menu.aiDesigner.operationScenario.label") || "Chọn kịch bản thao tác:"}</div>
          <Radio.Group
            value={operationScenario}
            onChange={(e) => {
              setOperationScenario(e.target.value as OperationScenario);
              setAiMenus(null);
              setAiResultText("");
              setEditableAiDraftText("");
              setAiProgress(null);
                syncPatchReviewState([]);
              setLiveEditLines([]);
              setMergeStats(null);
            }}
            style={{ width: "100%" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <Radio value="new_build" style={{ padding: "8px 12px", borderRadius: 6, border: operationScenario === "new_build" ? "1px solid var(--ant-color-primary)" : "1px solid var(--ant-color-border)", width: "100%", background: operationScenario === "new_build" ? "var(--ant-color-primary-bg)" : undefined }}>
                <span style={{ fontWeight: 600 }}>{t("system.menu.aiDesigner.operationScenario.newBuildTitle") || "Kịch bản 1: Tạo mới hoàn toàn"}</span>
                <span style={{ fontSize: 12, color: "var(--ant-color-text-secondary)", marginLeft: 8 }}>{t("system.menu.aiDesigner.operationScenario.newBuildDesc") || "AI tự phân tích nghiệp vụ từ mô tả và thiết kế toàn bộ cây menu"}</span>
              </Radio>
              <Radio value="incremental_update" style={{ padding: "8px 12px", borderRadius: 6, border: operationScenario === "incremental_update" ? "1px solid var(--ant-color-primary)" : "1px solid var(--ant-color-border)", width: "100%", background: operationScenario === "incremental_update" ? "var(--ant-color-primary-bg)" : undefined }}>
                <span style={{ fontWeight: 600 }}>{t("system.menu.aiDesigner.operationScenario.incrementalTitle") || "Kịch bản 2: Chỉnh sửa menu hiện có"}</span>
                <span style={{ fontSize: 12, color: "var(--ant-color-text-secondary)", marginLeft: 8 }}>{t("system.menu.aiDesigner.operationScenario.incrementalDesc") || "Cho phép chỉnh sửa bất kỳ đâu trong menu/field/trigger, AI trả về TOÀN BỘ cây menu"}</span>
              </Radio>
            </Space>
          </Radio.Group>
        </div>

        <Divider />

        {/* ── Kịch bản 2: Incremental Update UI ───────────────────────── */}
        {operationScenario === "incremental_update" && (
          <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
            <Alert
              type="warning"
              showIcon
              message={t("system.menu.aiDesigner.incremental.alertTitle") || "Kịch bản 2: Chỉnh sửa menu hiện có — AI sẽ trả về TOÀN BỘ cây menu"}
              description={
                <div>
                  <div>AI nhận toàn bộ menu hiện tại và cho phép chỉnh bất kỳ đâu: menu, table fields, trigger, validation, query.</div>
                  <div style={{ marginTop: 4 }}><strong>Menu hiện tại:</strong> {Array.isArray(currentMenus) ? currentMenus.length : 0} node cấp 1</div>
                  {(!currentMenus || currentMenus.length === 0) && (
                    <div style={{ color: "var(--ant-color-error)", marginTop: 4 }}>⚠ Không có menu hiện tại. Hãy dùng Kịch bản 1 để tạo mới.</div>
                  )}
                </div>
              }
            />
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{t("system.menu.aiDesigner.incremental.requestLabel") || "Mô tả thay đổi cần thực hiện:"}</div>
              <TextArea
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder={t("system.menu.aiDesigner.incremental.requestPlaceholder") || "Ví dụ: Thêm module Quản lý Nhân sự gồm: Danh sách nhân viên, Bảng lương, Chấm công. Sửa menu Báo cáo doanh thu thành Master-Detail. Xóa module test..."}
                rows={6}
              />
            </div>
          </Space>
        )}

        {/* ── Kịch bản 1: New Build UI ──────────────────────────────────── */}
        {operationScenario === "new_build" && (
          <>
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
                  ? (sampleUseAsBase
                    ? (t("system.menu.aiDesigner.sampleMenu.sectionLabelLoadedBase", {
                      count: sampleMenuParsed.length,
                      app: sampleAppLabel || sampleAppId || (t("system.menu.aiDesigner.sampleMenu.appSelectedFallback") || "app đã chọn"),
                    }) || `Menu mẫu ✓ [Dùng làm gốc] — ${sampleMenuParsed.length} menu từ ${sampleAppLabel || sampleAppId || "app đã chọn"}`)
                    : (t("system.menu.aiDesigner.sampleMenu.sectionLabelLoadedReference", {
                      count: sampleMenuParsed.length,
                      app: sampleAppLabel || sampleAppId || (t("system.menu.aiDesigner.sampleMenu.appSelectedFallback") || "app đã chọn"),
                    }) || `Menu mẫu ✓ [Tham khảo] — ${sampleMenuParsed.length} menu từ ${sampleAppLabel || sampleAppId || "app đã chọn"}`))
                  : (t("system.menu.aiDesigner.sampleMenu.sectionLabelEmpty") || "Menu mẫu tham khảo (tùy chọn) — chọn ứng dụng để AI học theo hoặc chỉnh sửa"),
                children: (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Alert
                      type="info"
                      showIcon
                      message={t("system.menu.aiDesigner.sampleMenu.pickAppTitle") || "Chọn ứng dụng để tự động lấy menu mẫu"}
                      description={t("system.menu.aiDesigner.sampleMenu.pickAppDesc") || "Chọn ứng dụng để tải menu mẫu. Chế độ Tham khảo: AI học theo cấu trúc để tự thiết kế mới. Chế độ Dùng làm gốc: AI lấy đúng menu này và adapt theo yêu cầu khách hàng mới."}
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
                          {t("system.menu.aiDesigner.sampleMenu.reloadButton") || "Tải lại menu mẫu"}
                        </Button>
                      )}
                      {(sampleMenuParsed || sampleAppId) && (
                        <Button onClick={handleClearSampleMenu} danger>
                          {t("system.menu.aiDesigner.sampleMenu.clearButton") || "Bỏ mẫu"}
                        </Button>
                      )}
                    </Space>
                    {sampleMenuParsed && (
                      <>
                        <Alert
                          type="success"
                          showIcon
                          message={t("system.menu.aiDesigner.sampleMenu.loadedMessage", { count: sampleMenuParsed.length, app: sampleAppLabel || sampleAppId || "" }) || `Đã nạp ${sampleMenuParsed.length} menu gốc từ ${sampleAppLabel || sampleAppId}`}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 6, border: `1px solid ${sampleUseAsBase ? "var(--ant-color-primary-border)" : "var(--ant-color-border)"}`, background: sampleUseAsBase ? "var(--ant-color-primary-bg)" : "var(--ant-color-fill-quaternary)" }}>
                          <Switch
                            checked={sampleUseAsBase}
                            onChange={setSampleUseAsBase}
                            checkedChildren={t("system.menu.aiDesigner.sampleMenu.modeBaseOn") || "Dùng làm gốc"}
                            unCheckedChildren={t("system.menu.aiDesigner.sampleMenu.modeReferenceOn") || "Chỉ tham khảo"}
                          />
                          <span style={{ fontSize: 13 }}>
                            {sampleUseAsBase
                              ? <><strong>{t("system.menu.aiDesigner.sampleMenu.modeBaseTitle") || "Chỉnh sửa từ menu mẫu"}</strong> — {t("system.menu.aiDesigner.sampleMenu.modeBaseDesc") || "AI lấy menu này làm gốc, adapt theo yêu cầu khách hàng"}<Tag color="blue" style={{ marginLeft: 6 }}>{t("system.menu.aiDesigner.sampleMenu.baseTag") || "Gốc"}</Tag></>
                              : <><strong>{t("system.menu.aiDesigner.sampleMenu.modeReferenceTitle") || "Chỉ tham khảo cấu trúc"}</strong> — {t("system.menu.aiDesigner.sampleMenu.modeReferenceDesc") || "AI tự thiết kế mới, dùng menu mẫu như hướng dẫn"}</>}
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
          </>
        )}

        {/* ── Context JSON Files (all scenarios) ───────────────────────── */}
        <Space direction="vertical" style={{ width: "100%", marginBottom: 12 }}>
          <Upload
            accept=".json,application/json"
            multiple
            showUploadList={false}
            beforeUpload={(file) => handleContextJsonFile(file as unknown as File)}
            disabled={!appId}
          >
            <Button disabled={!appId}>{t("system.menu.aiDesigner.context.uploadButton", { max: MAX_CONTEXT_FILES }) || "Dinh kem JSON he thong cu (toi da 8 file)"}</Button>
          </Upload>

          {contextFiles.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={t("system.menu.aiDesigner.context.attachedMessage", { count: contextFiles.length, appId: appId || "" }) || `Da dinh kem ${contextFiles.length} file JSON context cho app_id ${appId || ""}`}
              description={
                <Space wrap>
                  {contextFiles.map((file) => (
                    <Tag key={file.id} closable onClose={(e) => {
                      e.preventDefault();
                      removeContextFile(file.id);
                    }}>
                      {file.name}
                    </Tag>
                  ))}
                </Space>
              }
            />
          )}
        </Space>

        <Divider />

        <Space style={{ marginBottom: 12 }} wrap>
          <Switch
            checked={aiLiveEditEnabled}
            onChange={setAiLiveEditEnabled}
            checkedChildren={t("system.menu.aiDesigner.editor.livePatchOn") || "Live patch bật"}
            unCheckedChildren={t("system.menu.aiDesigner.editor.livePatchOff") || "Live patch tắt"}
          />
          <Tag color={aiLiveEditEnabled ? "blue" : "default"}>
            {aiLiveEditEnabled
              ? (t("system.menu.aiDesigner.editor.livePatchHintOn") || "AI có thể sửa trực tiếp từng dòng / nhiều dòng trong editor khi đang chạy")
              : (t("system.menu.aiDesigner.editor.livePatchHintOff") || "AI chỉ cập nhật editor khi hoàn tất")}
          </Tag>
          <Switch
            checked={allowManualEditWhileRunning}
            onChange={setAllowManualEditWhileRunning}
            checkedChildren={t("system.menu.aiDesigner.editor.manualWhileRunOn") || "Sửa tay khi chạy: bật"}
            unCheckedChildren={t("system.menu.aiDesigner.editor.manualWhileRunOff") || "Sửa tay khi chạy: tắt"}
          />
        </Space>

        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={handleGenerate} loading={loading} disabled={!appId} size="large">
            {loading
              ? "Đang xử lý AI..."
              : operationScenario === "new_build"
                ? (t("system.menu.aiDesigner.generateAll") || "Tạo bằng AI toàn bộ menu")
                : operationScenario === "incremental_update"
                  ? (t("system.menu.aiDesigner.incremental.generateButton") || "Chỉnh sửa menu bằng AI")
                  : (t("system.menu.aiDesigner.incremental.generateButton") || "Chỉnh sửa menu bằng AI")}
          </Button>

          {loading && activeAiJobIdRef.current && (
            <Button
              danger
              size="large"
              onClick={() => cancelActiveAiRun("Nguoi dung da dung AI job")}
            >
              Dung AI ngay
            </Button>
          )}

          {applyMenuCount > 0 && (
            <>
              <Button
                type="primary"
                onClick={handleApply}
                size="large"
                disabled={menuValidationErrors.length > 0 || applyGuardIssues.length > 0}
                style={{ background: "#52c41a", borderColor: "#52c41a" }}
              >
                {`${t("system.menu.aiDesigner.applySystem") || "Ap dung vao He thong"} (${applyMenuCount} menu JSON)`}
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

        {aiStopReason && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="AI da bi dung de bao ve menu"
            description={aiStopReason}
          />
        )}

        {aiProgress?.status !== "completed" && liveEditLines.length > 0 && patchOps.length === 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`AI đang cập nhật trực tiếp editor: ${liveEditLines.length} dòng vừa được chỉnh`}
            description="Các dòng thay đổi được highlight ngay trong editor theo thời gian thực."
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

              {applyGuardIssues.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  message="AI coverage gate: chưa đủ điều kiện áp dụng"
                  description={
                    <div style={{ maxHeight: 180, overflow: "auto", paddingRight: 8 }}>
                      {applyGuardIssues.map((issue, idx) => (
                        <div key={`apply_guard_${idx}`} style={{ marginBottom: 6 }}>
                          - {issue}
                        </div>
                      ))}
                    </div>
                  }
                />
              )}

              {(aiOutputMeta.coverageModules.length > 0 || aiOutputMeta.coverageTables.length > 0 || aiOutputMeta.unresolvedAssumptions.length > 0) && (
                <Alert
                  type="info"
                  showIcon
                  message={`Coverage: modules=${aiOutputMeta.coverageModules.length}, tables=${aiOutputMeta.coverageTables.length}, unresolved=${aiOutputMeta.unresolvedAssumptions.length}`}
                  description={
                    <div style={{ maxHeight: 220, overflow: "auto", paddingRight: 8 }}>
                      {aiOutputMeta.coverageModules.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <strong>coverage_modules</strong>
                          {aiOutputMeta.coverageModules.slice(0, 20).map((entry, idx) => (
                            <div key={`cm_${idx}`}>
                              - {entry.item}: {entry.status} {entry.menus.length > 0 ? `(${entry.menus.join(", ")})` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                      {aiOutputMeta.coverageTables.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <strong>coverage_tables</strong>
                          {aiOutputMeta.coverageTables.slice(0, 20).map((entry, idx) => (
                            <div key={`ct_${idx}`}>
                              - {entry.item}: {entry.status} {entry.menus.length > 0 ? `(${entry.menus.join(", ")})` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                      {aiOutputMeta.unresolvedAssumptions.length > 0 && (
                        <div>
                          <strong>unresolved_assumptions</strong>
                          {aiOutputMeta.unresolvedAssumptions.slice(0, 20).map((entry, idx) => (
                            <div key={`ua_${idx}`}>- {entry}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              )}

              {mergeStats && operationScenario === "incremental_update" && (
                <Alert
                  type="info"
                  showIcon
                  message={t("system.menu.aiDesigner.mergePreview.title") || "Xem trước thay đổi chính xác kiểu Copilot"}
                  description={
                    <div>
                      <div>
                        {(t("system.menu.aiDesigner.mergePreview.summary", {
                          added: mergeStats.added,
                          edited: mergeStats.edited,
                          deleted: mergeStats.deleted,
                        }) as string) || `Thêm ${mergeStats.added}, sửa ${mergeStats.edited}, xóa ${mergeStats.deleted}`}
                        {mergeLoading ? ` • ${t("system.menu.aiDesigner.mergePreview.computing") || "đang tính merge"}` : ""}
                      </div>
                      {patchOps.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <Tag color="processing">Changes: {patchOps.length}</Tag>
                          <Tag color="green">Kept: {patchOps.filter((op) => patchReviewStatus[op.nodeId] === "kept").length}</Tag>
                          <Tag color="default">Undone: {patchOps.filter((op) => patchReviewStatus[op.nodeId] === "undone").length}</Tag>
                        </div>
                      )}
                      {patchOps.length > 0 && (
                        <div style={{ marginTop: 6, color: "rgba(0,0,0,0.68)" }}>
                          Dòng có thay đổi sẽ hiện Keep hoặc Undo ngay trong editor. Các mục xóa hoặc ngoài màn hình có thể review ở danh sách bên dưới.
                        </div>
                      )}
                      {patchOps.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <Space size={8} wrap>
                            <Select
                              size="small"
                              value={patchActionFilter}
                              onChange={(val) => setPatchActionFilter(val)}
                              options={[
                                { value: "all", label: "Tất cả" },
                                { value: "add", label: "Thêm" },
                                { value: "edit", label: "Sửa" },
                                { value: "delete", label: "Xóa" },
                              ]}
                              style={{ width: 110 }}
                            />
                            <Input
                              size="small"
                              value={patchKeyword}
                              onChange={(e) => setPatchKeyword(e.target.value)}
                              placeholder="Tìm node/field..."
                              style={{ width: 240 }}
                              allowClear
                            />
                            <Tag color="processing">Hiển thị: {visiblePatchOps.length}/{patchOps.length}</Tag>
                          </Space>

                          <div style={{ marginTop: 8, maxHeight: 280, overflow: "auto", paddingRight: 8, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 8 }}>
                            {visiblePatchOps.map((op, idx) => (
                              <div
                                key={`${op.nodeId}_${idx}`}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  padding: "8px 0",
                                  borderBottom: "1px dashed rgba(0,0,0,0.08)",
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600 }}>
                                    [{op.action.toUpperCase()}] {op.nodePath || op.nodeName || op.nodeId}
                                    {op.line ? <Tag style={{ marginLeft: 8 }}>Line {op.line}</Tag> : null}
                                  </div>
                                  <div style={{ marginTop: 4 }}>
                                    <Tag color={patchReviewStatus[op.nodeId] === "kept" ? "blue" : patchReviewStatus[op.nodeId] === "undone" ? "default" : "gold"}>
                                      {(patchReviewStatus[op.nodeId] || "pending").toUpperCase()}
                                    </Tag>
                                  </div>
                                  {Array.isArray(op.changedFields) && op.changedFields.length > 0 && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.78)" }}>
                                      {op.changedFields.slice(0, 6).map((field, fIdx) => (
                                        <div key={`${op.nodeId}_${field.fieldName}_${fIdx}`}>
                                          • {field.fieldName}: {formatFieldDeltaValue(field.oldVal)} → {formatFieldDeltaValue(field.newVal)}
                                        </div>
                                      ))}
                                      {op.changedFields.length > 6 && (
                                        <div style={{ color: "rgba(0,0,0,0.55)" }}>...{op.changedFields.length - 6} thay đổi field nữa</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <Space size={6} direction="vertical" style={{ alignItems: "flex-end" }}>
                                  <Button size="small" onClick={() => focusPatchOpLine(op.nodeId)} disabled={!op.line}>
                                    Đến dòng
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => handleKeepAiPatch(op.nodeId)}
                                    disabled={!!patchReviewStatus[op.nodeId]}
                                  >
                                    Keep
                                  </Button>
                                  <Button
                                    size="small"
                                    danger
                                    onClick={() => handleUndoAiPatch(op.nodeId)}
                                    disabled={!!patchReviewStatus[op.nodeId]}
                                  >
                                    Undo
                                  </Button>
                                </Space>
                              </div>
                            ))}
                            {visiblePatchOps.length === 0 && (
                              <div style={{ color: "rgba(0,0,0,0.55)" }}>Không có mục thay đổi phù hợp bộ lọc hiện tại.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  }
                />
              )}

              <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, overflow: "hidden" }}>
                <CodeMirror
                  value={
                    editableAiDraftText
                      ? editableAiDraftText
                      : (aiResultText || buildAiProgressResultText(aiProgress))
                  }
                  height="360px"
                  theme={vscodeDark}
                  extensions={[json(), diffDecorationsField, diffTheme]}
                  onCreateEditor={(view: any) => {
                    resultEditorViewRef.current = view;
                  }}
                  editable={allowManualEditWhileRunning ? true : (!!editableAiDraftText || aiProgress?.status === "completed")}
                  onChange={(val) => {
                    setEditableAiDraftText(val);
                  }}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLineGutter: true,
                    highlightActiveLine: true,
                    bracketMatching: true,
                    closeBrackets: true,
                  }}
                  placeholder={
                    editableAiDraftText
                      ? "Kết quả AI sẽ hiển thị ở đây. Có thể chỉnh sửa JSON trước khi áp dụng."
                      : (t("system.menu.aiDesigner.resultPlaceholder") || "Kết quả AI sẽ hiển thị ở đây (JSON format)")
                  }
                />
              </div>
              {aiProgress?.status === "completed" && editableAiDraftText && (
                <Alert
                  type="success"
                  showIcon
                  message={t("system.menu.aiDesigner.property.editableResultHint") || "Node đã được chỉnh sửa — JSON trong editor có thể chỉnh thêm trước khi Áp dụng"}
                />
              )}
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
