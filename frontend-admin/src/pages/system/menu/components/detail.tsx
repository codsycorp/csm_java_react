import type { MenuItemType } from "#src/api/system/menu";
import { fetchAddMenuItem, fetchUpdateMenuItem, saveMenuStruct } from "#src/api/system/menu";
import { AI_TIMEOUT_MS } from "#src/api/ai";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";
import { handleTree, request } from "#src/utils";
import { isMasterDetailMenu, getMenuDisplayConfig } from "../utils/menu-logic";
import { resolveMenuTypeForm } from "../utils/menu-type-resolver";
import { getTableData, andWhere } from "#src/components/csm-grid/CsmApi";
import PizZip from "pizzip";

import {
  ModalForm,
  ProFormCascader,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from "@ant-design/pro-components";
import * as AntdIcons from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormInstance, UploadProps } from "antd";
import { Tabs, Alert, Card, Upload, Button, Space, message, Spin, Input, InputNumber, Modal, Switch } from "antd";
import FieldConfigEditor from "./FieldConfigEditor";
import TriggerEditor from "./TriggerEditor";
import LineItemsConfigEditor from "./LineItemsConfigEditor";
import type { LineItemsEditorConfig } from "#src/components/production-order/types";
import { PHUSON_PANEL_CONFIG } from "#src/components/production-order/defaultConfig";
import { readPrintSampleFile } from "#src/components/production-order/line-items-print-import";
import {
  createDocxTemplateBuffer,
  arrayBufferToDataUrl,
  type DocxTemplateBlueprint,
} from "#src/components/production-order/line-items-docx-template";
import { probeDocxTemplateUrl } from "#src/components/production-order/line-items-docx-print";
import type { PdfLayoutSpec } from "#src/components/production-order/line-items-pdf-layout";
import {
  buildPhusonMenuConfig,
  type PhusonMenuPresetId,
} from "#src/components/production-order/line-items-menu-presets";
import { getFieldLiAuto } from "#src/components/production-order/line-items-field-utils";
import {
  autoFormatTriggerKey,
  autoParseTriggerKey,
  resolveFieldAutoTriggerPrefix,
} from "#src/components/csm-grid/csm-trigger-runner";
import type { TableField, TriggerConfig } from "#src/components/csm-grid/CsmDynamicGrid";
import { KANBAN_CONFIG_TEMPLATE } from "#src/components/csm-kanban";
import { csmDecrypt, csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import { useUserStore } from "#src/store/user";
import { getDefaultSystemUserModeConfig, parseSystemUserModes, type SystemUserMenuModeConfig } from "#src/pages/system/admin/system-user-menu-config";

import { getMenuTypeOptions } from "../constants";
import MenuFieldLabel from "./MenuFieldLabel";
import { useMenuDesignerOptions } from "../utils/useMenuDesignerOptions";
import { buildPdfReportDesignSpec, resolvePdfOverlayText, buildPdfOverlayPreviewContext } from "./pdf-overlay-design";

function buildLineItemsTriggerOptions(
  tableRows: TableField[],
  lineItemsConfig: Partial<LineItemsEditorConfig>,
): Array<{ label: string; value: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; value: string }> = [];

  const push = (value: string, label: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push({ value, label });
  };

  for (const pc of lineItemsConfig.line_items_print ?? []) {
    const key = String(pc.trigger_key ?? "").trim();
    if (key) push(key, `In PDF — ${key}`);
  }
  for (const key of lineItemsConfig.line_items_ui?.print_keys ?? []) {
    const k = String(key ?? "").trim();
    if (k) push(k, `In PDF — ${k}`);
  }

  for (const f of tableRows ?? []) {
    if (!getFieldLiAuto(f as Record<string, any>)) continue;
    const prefix = resolveFieldAutoTriggerPrefix(f as Record<string, any>);
    if (!prefix) continue;
    push(autoParseTriggerKey(prefix), `Auto parse — ${prefix}`);
    push(autoFormatTriggerKey(prefix), `Auto format — ${prefix}`);
  }

  return out;
}

interface DetailProps {
  title: React.ReactNode;
  flatParentMenus: MenuItemType[];
  open: boolean;
  detailData: Partial<MenuItemType>;
  onCloseChange: () => void;
  refreshTable?: () => void;
  appId?: string; // App ID for saving menu items
  treeData: any[];
  saveMenuApp?: () => Promise<void>;
  fullMenuList?: MenuItemType[];
  setFullMenuList?: (menus: MenuItemType[]) => void;
}

const QUICK_ANT_ICON_NAMES = [
  "AppstoreOutlined",
  "HomeOutlined",
  "DashboardOutlined",
  "UserOutlined",
  "TeamOutlined",
  "SettingOutlined",
  "ToolOutlined",
  "DatabaseOutlined",
  "FileTextOutlined",
  "BarChartOutlined",
  "PieChartOutlined",
  "ShoppingCartOutlined",
  "ShopOutlined",
  "MailOutlined",
  "BellOutlined",
  "SafetyOutlined",
  "LockOutlined",
  "CloudOutlined",
  "ApiOutlined",
  "CodeOutlined",
];

function findMenuById(menus: MenuItemType[], id: string): MenuItemType | undefined {
	for (const menu of menus) {
		if (menu.id === id) return menu;
		if ((menu as any).children && findMenuById((menu as any).children, id)) {
			return findMenuById((menu as any).children, id);
		}
	}
	return undefined;
}

function findParentId(menus: MenuItemType[], id: string, parentId: string = ""): string {
	for (const menu of menus) {
		if (menu.id === id) return parentId;
		if ((menu as any).children) {
			const found = findParentId((menu as any).children, id, menu.id);
			if (found !== "") return found;
		}
	}
	return "";
}

function updateMenuInTree(menus: MenuItemType[], id: string, newData: Partial<MenuItemType>): boolean {
	for (let i = 0; i < menus.length; i++) {
		if (menus[i].id === id) {
			const currentParentId = findParentId(menus, id);
			const newParentId = newData.parentId;
			console.log("Updating menu", id, "currentParentId:", currentParentId, "newParentId:", newParentId);
			if (currentParentId !== newParentId) {
				// Move
				console.log("Moving menu", id, "from", currentParentId, "to", newParentId);
				const menu = menus.splice(i, 1)[0];
				Object.assign(menu, newData);
				// Đảm bảo parentId được set đúng
				menu.parentId = newParentId || "";
				if (!newParentId || newParentId === "") {
					console.log("Moving to root");
					menus.push(menu);
				} else {
					const newParent = findMenuById(menus, newParentId);
					if (newParent) {
						console.log("New parent found:", newParent.id);
						if (!(newParent as any).children) (newParent as any).children = [];
						(newParent as any).children.push(menu);
					} else {
						console.error("Parent not found for", newParentId, "moving to root");
						menus.push(menu); // fallback
					}
				}
			} else {
				Object.assign(menus[i], newData);
				// Đảm bảo parentId được set nếu có trong newData
				if (newData.parentId !== undefined) {
					menus[i].parentId = newData.parentId;
				}
			}
			return true;
		}
		if ((menus[i] as any).children && updateMenuInTree((menus[i] as any).children, id, newData)) {
			return true;
		}
	}
	return false;
}

function extractLineItemsConfig(data: Record<string, any>): Partial<LineItemsEditorConfig> {
	return {
		line_items_data_field: data.line_items_data_field,
		line_items_groups_key: data.line_items_groups_key,
		line_items_list: Array.isArray(data.line_items_list) ? data.line_items_list : undefined,
		line_items_columns: Array.isArray(data.line_items_columns) ? data.line_items_columns : undefined,
		line_items_group: data.line_items_group,
		line_items_totals: Array.isArray(data.line_items_totals) ? data.line_items_totals : undefined,
		line_items_print: Array.isArray(data.line_items_print) ? data.line_items_print : undefined,
		line_items_ui: data.line_items_ui,
		line_items_workflow: data.line_items_workflow,
	};
}

function mergeLineItemsConfigIntoPayload(
	payload: Record<string, any>,
	config: Partial<LineItemsEditorConfig>,
) {
	if (config.line_items_data_field !== undefined) payload.line_items_data_field = config.line_items_data_field;
	if (config.line_items_groups_key !== undefined) payload.line_items_groups_key = config.line_items_groups_key;
	if (config.line_items_list !== undefined) payload.line_items_list = config.line_items_list;
	if (config.line_items_columns !== undefined) payload.line_items_columns = config.line_items_columns;
	if (config.line_items_group !== undefined) payload.line_items_group = config.line_items_group;
	if (config.line_items_totals !== undefined) payload.line_items_totals = config.line_items_totals;
	if (config.line_items_print !== undefined) payload.line_items_print = config.line_items_print;
	if (config.line_items_ui !== undefined) payload.line_items_ui = config.line_items_ui;
	if (config.line_items_workflow !== undefined) payload.line_items_workflow = config.line_items_workflow;
}

const UPLOAD_ENDPOINT = "/upload.shtml";

function buildUploadEndpointCandidates(): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    const endpoint = String(value || "").trim();
    if (!endpoint || out.includes(endpoint)) return;
    out.push(endpoint);
  };

  if (import.meta.env.DEV) {
    push("/api/upload.shtml");
  }
  push(UPLOAD_ENDPOINT);

  const apiBase = String((import.meta as any)?.env?.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (apiBase) {
    push(`${apiBase}/upload.shtml`);
  }

  return out;
}

async function postUploadJsonWithFallback(
  payload: { app_id: string; name: string; src: string },
  token?: string,
): Promise<Response> {
  const endpoints = buildUploadEndpointCandidates();
  let lastErr: any = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || "",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        lastErr = new Error(`Upload failed on ${endpoint}: 404 Not Found`);
        continue;
      }

      return response;
    } catch (error: any) {
      lastErr = error;
    }
  }

  throw lastErr || new Error("Upload failed: no reachable upload endpoint");
}

function normalizeAsciiText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeTemplateToken(name: string): string {
  const normalized = normalizeAsciiText(name)
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "field";
}

function extractLabelPrefix(line: string): string {
  const text = String(line || "").trim();
  if (!text) return "";
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx <= 50) {
    return text.slice(0, colonIdx).trim();
  }
  return text;
}

function buildHeaderTemplateLines(headerLines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(headerLines.length, 8); i += 1) {
    const raw = String(headerLines[i] || "").trim();
    if (!raw) continue;
    const label = extractLabelPrefix(raw) || `Thong tin ${i + 1}`;
    out.push(`${label}: {hdr_${i + 1}}`);
  }
  if (out.length === 0) {
    out.push("Thong tin 1: {hdr_1}");
    out.push("Thong tin 2: {hdr_2}");
    out.push("Thong tin 3: {hdr_3}");
  }
  return out;
}

function buildTablePlaceholders(headers: string[]): string[] {
  const count = Math.max(1, Math.min(headers.length, 10));
  const placeholders: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = `col_${i + 1}`;
    if (i === 0 && count === 1) {
      placeholders.push(`{#items}{${key}}{/items}`);
    } else if (i === 0) {
      placeholders.push(`{#items}{${key}}`);
    } else if (i === count - 1) {
      placeholders.push(`{${key}}{/items}`);
    } else {
      placeholders.push(`{${key}}`);
    }
  }
  return placeholders;
}

function buildPdfFieldCatalog(fields: TableField[]): Array<{ fieldName: string; tokens: string[] }> {
  return (Array.isArray(fields) ? fields : [])
    .map((field) => {
      const fieldName = String((field as any)?.f_name || "").trim();
      if (!fieldName) return null;
      const rawTokens = [
        fieldName,
        String((field as any)?.f_header || "").trim(),
        String((field as any)?.f_header_en || "").trim(),
        String((field as any)?.f_header_zh || "").trim(),
      ].filter(Boolean);
      const tokens = rawTokens
        .map((value) => normalizeAsciiText(value).toLowerCase())
        .map((value) => value.replace(/[^a-z0-9]+/g, " ").trim())
        .filter(Boolean);
      return { fieldName, tokens };
    })
    .filter(Boolean) as Array<{ fieldName: string; tokens: string[] }>;
}

function buildPdfDynamicLabelHints(fields: TableField[]): string[] {
  const catalog = buildPdfFieldCatalog(fields);
  return catalog
    .slice(0, 24)
    .map((entry) => {
      const sampleLabel = entry.tokens[0] || entry.fieldName;
      return `${sampleLabel} -> {${entry.fieldName}}`;
    });
}

function resolvePdfFieldByLabel(label: string, catalog: Array<{ fieldName: string; tokens: string[] }>): string {
  const normalizedLabel = normalizeAsciiText(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalizedLabel) return "";
  const compactLabel = normalizedLabel.replace(/\s+/g, "");
  let bestField = "";
  let bestScore = 0;

  for (const entry of catalog) {
    for (const token of entry.tokens) {
      const compactToken = token.replace(/\s+/g, "");
      let score = 0;
      if (compactToken === compactLabel) score = 100;
      else if (compactToken.includes(compactLabel) || compactLabel.includes(compactToken)) score = 80;
      else {
        const labelParts = new Set(normalizedLabel.split(/\s+/).filter(Boolean));
        const tokenParts = new Set(token.split(/\s+/).filter(Boolean));
        let overlap = 0;
        for (const part of labelParts) {
          if (tokenParts.has(part)) overlap += 1;
        }
        score = overlap >= 2 ? 60 + overlap : overlap === 1 && compactLabel.length > 3 ? 35 : 0;
      }
      if (score > bestScore) {
        bestScore = score;
        bestField = entry.fieldName;
      }
    }
  }

  return bestScore >= 60 ? bestField : "";
}

function buildPdfOverlaySeedItems(params: {
  lineBoxes: Array<{ text: string; x: number; y: number; page: number }>;
  fields: TableField[];
}): PdfOverlayPlanItem[] {
  const lineBoxes = Array.isArray(params.lineBoxes) ? params.lineBoxes : [];
  const catalog = buildPdfFieldCatalog(params.fields);
  const seeds: PdfOverlayPlanItem[] = [];

  for (const box of lineBoxes) {
    const raw = String(box?.text || "").trim();
    if (!raw) continue;
    const label = extractLabelPrefix(raw) || raw.replace(/:.*$/, "").trim();
    if (!label) continue;
    const matchedField = resolvePdfFieldByLabel(label, catalog);
    const token = matchedField || safeTemplateToken(label);
    const replacement = `${label}: {${token}}`;
    seeds.push({
      page: Number(box.page || 1),
      x: Number(box.x || 0),
      y: Number(box.y || 0),
      fontSize: 11,
      fontName: "Helvetica",
      color: "#000000",
      opacity: 1,
      rotate: 0,
      text: replacement,
    });
  }

  return seeds;
}

function normalizeFieldToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function computeDocxColumnWidths(headers: string[]): number[] {
  const sanitized = (headers || []).map((h) => String(h || "").trim());
  if (!sanitized.length) return [];

  const weights = sanitized.map((header, idx) => {
    const n = normalizeFieldToken(header);
    if (idx === 0 || n === "stt" || n === "tt" || n === "no" || n === "id") return 0.7;
    return Math.max(1, Math.min(2.2, Math.round((header.length / 6) * 10) / 10));
  });

  const sum = weights.reduce((acc, v) => acc + v, 0) || sanitized.length;
  const totalTwip = 9600;
  const widths = weights.map((w) => Math.max(480, Math.floor((w / sum) * totalTwip)));
  const delta = totalTwip - widths.reduce((acc, v) => acc + v, 0);
  widths[widths.length - 1] += delta;
  return widths;
}

function extractDocxTemplateTokens(file: File): Promise<{ scalarTokens: string[]; loopTokens: string[] }> {
  return file.arrayBuffer().then((ab) => {
    const zip = new PizZip(ab);
    const scalar = new Set<string>();
    const loops = new Set<string>();
    const files = Object.keys(zip.files || {}).filter((name) => name.startsWith("word/") && name.endsWith(".xml"));
    const tagRegex = /\{([#\/]?)([^{}]+)\}/g;

    const normalizeToken = (raw: string): string => {
      const cleaned = String(raw || "")
        .trim()
        .replace(/\|.*$/, "")
        .replace(/^\./, "")
        .replace(/\s+/g, "");
      if (!cleaned) return "";
      if (!/^[a-zA-Z0-9_.]+$/.test(cleaned)) return "";
      return cleaned;
    };

    for (const name of files) {
      const xml = zip.file(name)?.asText() || "";
      if (!xml) continue;
      let m: RegExpExecArray | null = null;
      while ((m = tagRegex.exec(xml)) !== null) {
        const prefix = String(m[1] || "").trim();
        const token = normalizeToken(String(m[2] || ""));
        if (!token) continue;
        if (prefix === "#") {
          loops.add(token);
          continue;
        }
        if (prefix === "/") continue;
        scalar.add(token);
      }
    }

    return {
      scalarTokens: Array.from(scalar).slice(0, 200),
      loopTokens: Array.from(loops).slice(0, 40),
    };
  });
}

function buildDocxDrivenReportDbBody(params: {
  tableName: string;
  fields: TableField[];
  scalarTokens: string[];
  loopTokens: string[];
}): string {
  const tableName = String(params.tableName || "").trim();
  const allFields = Array.isArray(params.fields) ? params.fields : [];
  const visibleFieldNames = allFields
    .map((f) => String((f as any)?.f_name || "").trim())
    .filter(Boolean)
    .slice(0, 12);

  const scalarTokens = (params.scalarTokens || []).map((x) => String(x || "").trim()).filter(Boolean);
  const loopTokens = (params.loopTokens || []).map((x) => String(x || "").trim()).filter(Boolean);

  return `
const TABLE_NAME = "${escapeTemplateLiteral(tableName)}";
const cfg = seft?.m_configs || {};
const cfgTableName = String(cfg?.table_name || TABLE_NAME || "").trim();
const activeTableName = cfgTableName || TABLE_NAME;
const fieldNames = ${JSON.stringify(visibleFieldNames)};
const scalarTokens = ${JSON.stringify(scalarTokens)};
const loopTokens = ${JSON.stringify(loopTokens)};

const safeNumber = (value) => {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const normalized = String(value).replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9\-\.]/g, "").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

const normalizeFilterText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const dataRowsCandidates = [
  Array.isArray(data?.list) ? data.list : undefined,
  Array.isArray(data?.rows) ? data.rows : undefined,
  Array.isArray(data?.items) ? data.items : undefined,
  Array.isArray(data?.data?.list) ? data.data.list : undefined,
  Array.isArray(data?.data?.rows) ? data.data.rows : undefined,
  Array.isArray(data?.data?.items) ? data.data.items : undefined,
];

const configPaths = [
  cfg?.line_items_data_field,
  cfg?.line_items_list,
  cfg?.line_items_groups_key,
  cfg?.line_items_group,
].filter((x) => typeof x === "string" && x.trim());

const getByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
};

for (const p of configPaths) {
  const v = getByPath(data, p);
  if (Array.isArray(v)) dataRowsCandidates.push(v);
}

const tableRowsCandidates = [
  Array.isArray(bang?.[activeTableName]?.rows) ? bang[activeTableName].rows : undefined,
  Array.isArray(bang?.[TABLE_NAME]?.rows) ? bang[TABLE_NAME].rows : undefined,
  Array.isArray(bang?.[cfgTableName]?.rows) ? bang[cfgTableName].rows : undefined,
  Array.isArray(bang?.[cfg?.line_items_data_field]?.rows) ? bang[cfg.line_items_data_field].rows : undefined,
  Array.isArray(bang?.[cfg?.line_items_list]?.rows) ? bang[cfg.line_items_list].rows : undefined,
];

const resolvedRows = [...dataRowsCandidates, ...tableRowsCandidates].find((x) => Array.isArray(x));
const rowsRaw = Array.isArray(resolvedRows) ? resolvedRows : [];

const filterEntries = Object.entries(data || {}).filter(([key, val]) => {
  if (!key || val == null) return false;
  if (typeof val === "object") return false;
  const raw = String(val).trim();
  return raw !== "" && raw.toLowerCase() !== "all" && raw !== "*";
});

const rows = rowsRaw.filter((row) => {
  if (!row || typeof row !== "object") return false;
  for (const [key, val] of filterEntries) {
    if (!(key in row)) continue;
    const rv = row?.[key];
    if (rv == null || rv === "") return false;
    const rowNum = safeNumber(rv);
    const valNum = safeNumber(val);
    if (Number.isFinite(rowNum) && Number.isFinite(valNum)) {
      if (Math.abs(rowNum - valNum) > 1e-9) return false;
      continue;
    }
    const rowText = normalizeFilterText(rv);
    const valText = normalizeFilterText(val);
    if (valText && rowText && !rowText.includes(valText)) return false;
  }
  return true;
});

const setByPath = (obj, path, value) => {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
};

const items = rows.map((row, idx) => {
  const out = { ...(row || {}), stt: idx + 1 };
  for (let i = 0; i < fieldNames.length; i += 1) {
    const name = fieldNames[i];
    out['col_' + (i + 1)] = row?.[name] ?? '';
  }
  return out;
});

const totals = {};
for (const row of rows) {
  for (const [key, val] of Object.entries(row || {})) {
    const n = safeNumber(val);
    if (!Number.isFinite(n)) continue;
    totals[key] = Number(totals[key] || 0) + n;
  }
}
const totalKeyPriority = [
  "thanh_tien", "thanh_tien_vnd", "amount", "total", "tong_tien", "tong_gia_tri", "tong_thanhtoan", "tong_thanh_toan",
];
const totalsKey = totalKeyPriority.find((k) => Number.isFinite(Number(totals[k])));
const totalsNumbers = Object.values(totals).filter((n) => typeof n === 'number' && Number.isFinite(n));
const totalsValue = totalsKey ? Number(totals[totalsKey] || 0) : (totalsNumbers.length ? Number(totalsNumbers[0]) : 0);

const moneyFormatter = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  return num.toLocaleString('vi-VN');
};

const base = {
  order: data?.order ?? {},
  data: data ?? {},
  params: data ?? {},
  cfg,
  rows,
  items,
  items_flat: items,
  totals,
  table_name: activeTableName,
  totals_value: totalsValue,
  tong_cong: moneyFormatter(totalsValue),
  ghi_chu: data?.ghi_chu ?? '',
  ten_cong_ty: bang?.sys_apps?.rows?.[0]?.app_name ?? data?.ten_cong_ty ?? '',
  com_logo: seft?.com_logo ?? data?.com_logo ?? '',
};

const out = { ...base };
const firstRow = rows[0] || {};
for (const token of scalarTokens) {
  if (!token) continue;
  const v = [
    getByPath(out, token),
    getByPath(firstRow, token),
    getByPath(base.order, token),
    getByPath(base.data, token),
    getByPath(totals, token),
  ].find((x) => x !== undefined && x !== null);
  if (v !== undefined) {
    setByPath(out, token, v);
  } else {
    setByPath(out, token, '');
  }
}

for (const token of loopTokens) {
  if (!token) continue;
  const candidate = [
    getByPath(out, token),
    Array.isArray(bang?.[token]?.rows) ? bang[token].rows : undefined,
    items,
    rows,
  ].find((x) => Array.isArray(x));
  setByPath(out, token, Array.isArray(candidate) ? candidate : items);
}

return out;
`.trim();
}

function selectFieldSourcesByHeaders(headers: string[], fields: TableField[], colCount: number): string[] {
  const names = (fields || [])
    .map((f) => String((f as any)?.f_name || "").trim())
    .filter(Boolean);
  if (!names.length) {
    return Array.from({ length: colCount }).map((_, i) => `col_${i + 1}`);
  }

  const indexed = (fields || []).map((f) => {
    const fieldName = String((f as any)?.f_name || "").trim();
    const header = String((f as any)?.f_header || "").trim();
    return {
      fieldName,
      tokenName: normalizeFieldToken(fieldName),
      tokenHeader: normalizeFieldToken(header),
    };
  }).filter((f) => f.fieldName);

  const used = new Set<string>();
  const selected: string[] = [];
  for (let i = 0; i < colCount; i += 1) {
    const token = normalizeFieldToken(String(headers[i] || ""));
    let match = indexed.find((f) => !used.has(f.fieldName) && token && (f.tokenHeader === token || f.tokenName === token));
    if (!match) {
      match = indexed.find((f) => !used.has(f.fieldName) && token && (f.tokenHeader.includes(token) || token.includes(f.tokenHeader) || f.tokenName.includes(token) || token.includes(f.tokenName)));
    }
    if (!match) {
      match = indexed.find((f) => !used.has(f.fieldName));
    }
    const source = match?.fieldName || names[i] || `col_${i + 1}`;
    used.add(source);
    selected.push(source);
  }
  return selected;
}

function sanitizeTemplateLine(input: unknown): string {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function looksLikeTableHeaderLine(line: string): boolean {
  const lower = sanitizeTemplateLine(line).toLowerCase();
  if (!lower) return false;
  const hints = ["tt", "stt", "tên", "quy cách", "đơn vị", "chiều", "khối lượng", "đơn giá", "thành tiền"];
  const hitCount = hints.filter((h) => lower.includes(h)).length;
  return hitCount >= 3;
}

function buildSignatureTemplateLines(rawLines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let idx = 1;
  for (const raw of rawLines) {
    const line = sanitizeTemplateLine(raw);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    out.push(`{sig_${idx}}`);
    idx += 1;
    if (idx > 6) break;
  }
  if (!out.length) {
    out.push("Người lập", "{sig_1}", "Đại diện khách hàng", "{sig_2}");
  }
  return out;
}

function buildDocxBlueprintFromPdfLayout(layout: PdfLayoutSpec): DocxTemplateBlueprint {
  const title = sanitizeTemplateLine(layout.docTitle || "BÁO CÁO") || "BÁO CÁO";
  const subtitle = sanitizeTemplateLine(layout.docSubtitle || "");
  const tableHeaders = (layout.tableColumnHeaders || [])
    .map((h) => sanitizeTemplateLine(h))
    .filter(Boolean)
    .slice(0, 10);
  const resolvedTableHeaders = tableHeaders.length > 0
    ? tableHeaders
    : ["COL_1", "COL_2", "COL_3", "COL_4", "COL_5", "COL_6"];

  const orderedLines = (layout.orderedLines || []).map((x) => sanitizeTemplateLine(x)).filter(Boolean);
  const headerSeed = (layout.headerLines || []).map((x) => sanitizeTemplateLine(x)).filter(Boolean);
  const fallbackHeaderLines = orderedLines
    .filter((line) => !looksLikeTableHeaderLine(line))
    .slice(0, 12);
  const headerLines = buildHeaderTemplateLines((headerSeed.length ? headerSeed : fallbackHeaderLines).slice(0, 10));

  const signatureRaw = (layout.signatureLabels || []).map((s) => sanitizeTemplateLine(s)).filter(Boolean);
  const signatureLabels = buildSignatureTemplateLines(signatureRaw);

  const dynamicNoteLines: string[] = [];
  if (layout.showPrice) {
    dynamicNoteLines.push("Tổng cộng: {tong_cong}");
  }
  const sectionHints = (layout.sections || [])
    .map((s) => sanitizeTemplateLine(s.title || s.preview || ""))
    .filter(Boolean)
    .slice(0, 2);
  dynamicNoteLines.push(...sectionHints);
  dynamicNoteLines.push("Ghi chú: {ghi_chu}");

  return {
    title,
    subtitle: subtitle || undefined,
    headerLines,
    tableHeaders: resolvedTableHeaders,
    tableRowPlaceholders: buildTablePlaceholders(resolvedTableHeaders),
    signatureLabels,
    noteLines: dynamicNoteLines,
    pageSizeTwip: { width: 11906, height: 16838 },
    pageMarginsTwip: { top: 720, right: 720, bottom: 720, left: 720 },
    baseFontName: "Times New Roman",
    baseFontSizeHalfPt: 22,
    tableColWidthsTwip: computeDocxColumnWidths(resolvedTableHeaders),
    titleAlign: "center",
    headerAlign: "left",
  };
}

function tryParseLooseJson(raw: string): Record<string, any> | null {
  const text = String(raw || "").trim();
  if (!text) return null;

  const direct = (() => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
    } catch {
      return null;
    }
  })();
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced.trim());
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
    } catch {
      // ignore
    }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
    } catch {
      // ignore
    }
  }

  return null;
}

async function refineDocxBlueprintWithLocalAi(params: {
  appId?: string;
  baseBlueprint: DocxTemplateBlueprint;
  layout: PdfLayoutSpec;
}): Promise<{ blueprint: DocxTemplateBlueprint; status: string }> {
  const base = params.baseBlueprint;
  const layout = params.layout;

  const prompt = [
    "Bạn là AI local chuyên tái tạo DOCX template từ PDF mẫu trong CSM.",
    "Mục tiêu: giữ layout gần nhất với PDF đầu vào, KHÔNG hardcode theo loại chứng từ.",
    "Chỉ trả về 1 JSON object hợp lệ, không markdown, không giải thích.",
    "Bắt buộc giữ placeholders Docxtemplater dạng {field}.",
    "Không đổi tên field placeholders hiện có nếu chưa chắc chắn.",
    "",
    "Schema JSON output:",
    "{",
    "  \"title\": string,",
    "  \"subtitle\": string,",
    "  \"headerLines\": string[],",
    "  \"tableHeaders\": string[],",
    "  \"tableRowPlaceholders\": string[],",
    "  \"signatureLabels\": string[],",
    "  \"noteLines\": string[]",
    "}",
    "",
    `pdfLayout: ${JSON.stringify({
      docTitle: layout.docTitle,
      docSubtitle: layout.docSubtitle,
      headerLines: (layout.headerLines || []).slice(0, 20),
      tableColumnHeaders: (layout.tableColumnHeaders || []).slice(0, 16),
      signatureLabels: (layout.signatureLabels || []).slice(0, 12),
      sections: (layout.sections || []).slice(0, 8),
      showPrice: layout.showPrice,
      orderedLines: (layout.orderedLines || []).slice(0, 120),
    }, null, 2)}`,
    "",
    `currentBlueprint: ${JSON.stringify(base, null, 2)}`,
  ].join("\n");

  try {
    const response = await request.post("ai-code-stream", {
      json: {
        appId: String(params.appId || "menu_docx").trim() || "menu_docx",
        message: prompt,
        currentCode: JSON.stringify(base, null, 2),
        flowType: "code_editor",
        taskType: "code_assistant",
        language: "json",
        contextType: "code",
        responseMode: "raw_code",
        editorMetadata: {
          source: "MenuDetail.report_pdf_to_docx_blueprint",
          docTitle: String(layout.docTitle || ""),
        },
      },
      timeout: AI_TIMEOUT_MS,
      throwHttpErrors: false,
    });

    if (!response.ok || !response.body) {
      return { blueprint: base, status: "AI local không sẵn sàng, dùng blueprint chuẩn." };
    }

    let fullResponse = "";
    let completed = false;
    await consumeSseStream(response as any, {
      onEvent: (evt) => {
        const payload = evt.payload && typeof evt.payload === "object"
          ? (evt.payload as Record<string, unknown>)
          : null;
        if (!payload) return;
        const result = dispatchAiCodeStreamEvent(payload, fullResponse, {
          onChunk: (_chunk, accumulated) => { fullResponse = accumulated; },
          onComplete: (p) => {
            if (typeof p.fullResponse === "string") fullResponse = p.fullResponse;
            completed = true;
          },
          onError: () => {},
        });
        fullResponse = result.accumulated;
        if (result.completed) completed = true;
      },
    });

    const parsed = tryParseLooseJson(completed ? fullResponse : "");
    if (!parsed) {
      return { blueprint: base, status: "AI local trả về không hợp lệ, dùng blueprint chuẩn." };
    }

    const next: DocxTemplateBlueprint = {
      ...base,
      title: sanitizeTemplateLine(parsed.title || base.title),
      subtitle: sanitizeTemplateLine(parsed.subtitle || base.subtitle || "") || undefined,
      headerLines: Array.isArray(parsed.headerLines)
        ? parsed.headerLines.map((x) => sanitizeTemplateLine(x)).filter(Boolean).slice(0, 16)
        : base.headerLines,
      tableHeaders: Array.isArray(parsed.tableHeaders)
        ? parsed.tableHeaders.map((x) => sanitizeTemplateLine(x)).filter(Boolean).slice(0, 12)
        : base.tableHeaders,
      tableRowPlaceholders: Array.isArray(parsed.tableRowPlaceholders)
        ? parsed.tableRowPlaceholders.map((x) => sanitizeTemplateLine(x)).filter(Boolean).slice(0, 12)
        : base.tableRowPlaceholders,
      signatureLabels: Array.isArray(parsed.signatureLabels)
        ? parsed.signatureLabels.map((x) => sanitizeTemplateLine(x)).filter(Boolean).slice(0, 16)
        : base.signatureLabels,
      noteLines: Array.isArray(parsed.noteLines)
        ? parsed.noteLines.map((x) => sanitizeTemplateLine(x)).filter(Boolean).slice(0, 12)
        : base.noteLines,
    };

    if (!next.tableHeaders.length) next.tableHeaders = base.tableHeaders;
    if (!next.tableRowPlaceholders.length || next.tableRowPlaceholders.length !== next.tableHeaders.length) {
      next.tableRowPlaceholders = buildTablePlaceholders(next.tableHeaders);
    }
    next.tableColWidthsTwip = computeDocxColumnWidths(next.tableHeaders);

    return { blueprint: next, status: "AI local đã tinh chỉnh blueprint theo PDF mẫu." };
  } catch {
    return { blueprint: base, status: "AI local lỗi, dùng blueprint chuẩn." };
  }
}

type PdfOverlayPlanItem = {
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  align?: "L" | "C" | "R";
  fontSize?: number;
  fontName?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
  rotate?: number;
  text?: string;
};

function normalizeOverlayAlign(value: unknown): "L" | "C" | "R" {
  const upper = String(value || "").trim().toUpperCase();
  if (upper === "C" || upper === "R") return upper;
  return "L";
}

type BackendPdfExtractResponse = {
  layout?: Partial<PdfLayoutSpec>;
  lineBoxes: Array<{ text: string; x: number; y: number; page: number }>;
  imageHints: Array<{ fileName?: string; path?: string; url?: string; size?: number }>;
  status?: string;
};

function mergePdfLayoutSpec(base: PdfLayoutSpec, patch?: Partial<PdfLayoutSpec>): PdfLayoutSpec {
  if (!patch) return base;
  return {
    pages: Number(patch.pages || base.pages || 1),
    docTitle: String(patch.docTitle || base.docTitle || "").trim() || undefined,
    docSubtitle: String(patch.docSubtitle || base.docSubtitle || "").trim() || undefined,
    headerLines: Array.isArray(patch.headerLines) && patch.headerLines.length ? patch.headerLines : (base.headerLines || []),
    tableColumnHeaders: Array.isArray(patch.tableColumnHeaders) && patch.tableColumnHeaders.length
      ? patch.tableColumnHeaders
      : (base.tableColumnHeaders || []),
    tableGridLikely: typeof patch.tableGridLikely === "boolean" ? patch.tableGridLikely : Boolean(base.tableGridLikely),
    pageWidth: Number(patch.pageWidth || base.pageWidth || 0) || undefined,
    pageHeight: Number(patch.pageHeight || base.pageHeight || 0) || undefined,
    showPrice: typeof patch.showPrice === "boolean" ? patch.showPrice : Boolean(base.showPrice),
    showGroupSubtotal: typeof patch.showGroupSubtotal === "boolean"
      ? patch.showGroupSubtotal
      : Boolean(base.showGroupSubtotal),
    sections: Array.isArray(patch.sections) && patch.sections.length ? patch.sections : (base.sections || []),
    signatureLabels: Array.isArray(patch.signatureLabels) && patch.signatureLabels.length
      ? patch.signatureLabels
      : (base.signatureLabels || []),
    orderedLines: Array.isArray(patch.orderedLines) && patch.orderedLines.length
      ? patch.orderedLines
      : (base.orderedLines || []),
  };
}

async function extractPdfLayoutWithBackend(params: {
  appId?: string;
  sourcePdfPath: string;
}): Promise<BackendPdfExtractResponse> {
  try {
    const response = await request.post("ai-local/report/pdf-layout-extract", {
      json: {
        appId: String(params.appId || "").trim() || undefined,
        pdfPath: params.sourcePdfPath,
        maxPages: 3,
      },
      timeout: 120000,
      ignoreLoading: true,
      retry: { limit: 0 },
    } as any).json();

    const payload = (response as any)?.result || response || {};
    if (payload?.success === false) {
      const msg = String(payload?.message || "").trim();
      return {
        layout: undefined,
        lineBoxes: [],
        imageHints: [],
        status: msg || "Backend chưa trích được layout PDF.",
      };
    }

    const rawLayout = (payload?.layoutHints && typeof payload.layoutHints === "object") ? payload.layoutHints : {};
    const mappedLayout: Partial<PdfLayoutSpec> = {
      pages: Number(rawLayout?.pages || 1),
      docTitle: String(rawLayout?.docTitle || "").trim() || undefined,
      headerLines: Array.isArray(rawLayout?.headerLines) ? rawLayout.headerLines.map((x: any) => sanitizeTemplateLine(x)).filter(Boolean) : [],
      tableColumnHeaders: Array.isArray(rawLayout?.tableColumnHeaders)
        ? rawLayout.tableColumnHeaders.map((x: any) => sanitizeTemplateLine(x)).filter(Boolean)
        : [],
      tableGridLikely: Boolean(rawLayout?.tableGridLikely),
      pageWidth: Number(payload?.pageWidth || rawLayout?.pageWidth || 0) || undefined,
      pageHeight: Number(payload?.pageHeight || rawLayout?.pageHeight || 0) || undefined,
      showPrice: Boolean(rawLayout?.showPrice),
      showGroupSubtotal: Boolean(rawLayout?.showGroupSubtotal),
      signatureLabels: Array.isArray(rawLayout?.signatureLabels)
        ? rawLayout.signatureLabels.map((x: any) => sanitizeTemplateLine(x)).filter(Boolean)
        : [],
      orderedLines: Array.isArray(payload?.orderedLines)
        ? payload.orderedLines.map((x: any) => sanitizeTemplateLine(x)).filter(Boolean)
        : [],
    };

    const lineBoxes = Array.isArray(payload?.lineBoxes)
      ? payload.lineBoxes
        .map((x: any) => ({
          text: sanitizeTemplateLine(x?.text || ""),
          x: Number(x?.x || 0),
          y: Number(x?.y || 0),
          page: Number(x?.page || 1),
        }))
        .filter((x: any) => x.text)
      : [];

    const imageHints = Array.isArray(payload?.imageHints)
      ? payload.imageHints
        .map((x: any) => ({
          fileName: String(x?.fileName || "").trim() || undefined,
          path: String(x?.path || "").trim() || undefined,
          url: String(x?.url || "").trim() || undefined,
          size: Number(x?.size || 0) || undefined,
        }))
      : [];

    const status = lineBoxes.length > 0
      ? `Backend đã trích ${lineBoxes.length} dòng text từ PDF.`
      : "Backend chưa trích được text-position từ PDF, giữ fallback frontend.";

    return { layout: mappedLayout, lineBoxes, imageHints, status };
  } catch {
    return {
      layout: undefined,
      lineBoxes: [],
      imageHints: [],
      status: "Backend trích layout PDF lỗi, dùng fallback frontend.",
    };
  }
}

function buildFallbackPdfOverlayPlan(layout: PdfLayoutSpec): PdfOverlayPlanItem[] {
  const out: PdfOverlayPlanItem[] = [];
  const title = sanitizeTemplateLine(layout.docTitle || "");
  if (title) {
    out.push({ page: 1, x: 180, y: 770, fontSize: 16, fontName: "Helvetica", color: "#000000", text: title });
  }

  const headerLines = (layout.headerLines || []).map((x) => sanitizeTemplateLine(x)).filter(Boolean).slice(0, 8);
  for (let i = 0; i < headerLines.length; i += 1) {
    const idx = i + 1;
    out.push({
      page: 1,
      x: 40,
      y: 730 - i * 18,
      fontSize: 11,
      fontName: "Helvetica",
      color: "#000000",
      text: `{hdr_${idx}}`,
    });
  }

  if (layout.showPrice) {
    out.push({ page: 1, x: 420, y: 95, fontSize: 12, fontName: "Helvetica", color: "#000000", text: "{tong_cong}" });
  }

  return out;
}

async function buildPdfOverlayPlanWithLocalAi(params: {
  appId?: string;
  layout: PdfLayoutSpec;
  fields: TableField[];
  fallbackItems?: PdfOverlayPlanItem[];
}): Promise<{ overlays: PdfOverlayPlanItem[]; status: string }> {
  const fallback = Array.isArray(params.fallbackItems) && params.fallbackItems.length > 0
    ? params.fallbackItems
    : buildFallbackPdfOverlayPlan(params.layout);
  const prompt = [
    "Bạn là AI local chuyên phân tích PDF mẫu để sinh reportDesignSpec động cho backend Go/gofpdf.",
    "Mục tiêu: giữ bố cục, logo, khung bảng, nhãn chữ ký, nhóm hàng, subtotal, VAT và dữ liệu động giống PDF mẫu, nhưng KHÔNG dùng PDF làm nền.",
    "Chỉ trả về 1 JSON object hợp lệ, không markdown, không giải thích.",
    "Giữ text dạng placeholder {field} khi là dữ liệu động.",
    "Không được sinh quá ít item: hãy bao phủ đủ header, bảng, tổng, ghi chú và chữ ký nếu chúng có mặt trong layout.",
    "Không chồng đè lên PDF nền gốc; backend sẽ render PDF mới bằng dữ liệu thật.",
    "Ưu tiên khớp theo đúng vị trí dòng từ orderedLines/headerLines, không bẻ sang bố cục cố định.",
    "",
    "Schema:",
    "{",
    "  \"overlays\": [",
    "    {",
    "      \"page\": number,",
    "      \"x\": number,",
    "      \"y\": number,",
    "      \"fontSize\": number,",
    "      \"fontName\": string,",
    "      \"color\": string,",
    "      \"opacity\": number,",
    "      \"rotate\": number,",
    "      \"text\": string",
    "    }",
    "  ]",
    "}",
    "",
    `pdfLayout: ${JSON.stringify({
      docTitle: params.layout.docTitle,
      docSubtitle: params.layout.docSubtitle,
      headerLines: (params.layout.headerLines || []).slice(0, 8),
      tableColumnHeaders: (params.layout.tableColumnHeaders || []).slice(0, 10),
      tableGridLikely: params.layout.tableGridLikely,
      pageWidth: params.layout.pageWidth,
      pageHeight: params.layout.pageHeight,
      signatureLabels: (params.layout.signatureLabels || []).slice(0, 6),
      sections: (params.layout.sections || []).slice(0, 4),
      showPrice: params.layout.showPrice,
      orderedLines: (params.layout.orderedLines || []).slice(0, 40),
    }, null, 2)}`,
    `fieldHints: ${JSON.stringify(buildPdfDynamicLabelHints(params.fields).slice(0, 24), null, 2)}`,
    "- Nếu là báo giá có nhóm hàng, tổng nhóm, VAT, hãy giữ dấu hiệu grouped-table để backend render như mẫu báo giá.",
    "- Với mỗi dòng có nhãn động, hãy xuất placeholder/dữ liệu vào đúng field của menu hiện tại; không phụ thuộc text cũ trên PDF.",
    "",
    `fallbackPlan: ${JSON.stringify(fallback.slice(0, 12), null, 2)}`,
  ].join("\n");

  try {
    const response = await request.post("ai-code-stream", {
      json: {
        appId: String(params.appId || "menu_pdf_overlay").trim() || "menu_pdf_overlay",
        message: prompt,
        currentCode: JSON.stringify({ overlays: fallback }, null, 2),
        flowType: "code_editor",
        taskType: "code_assistant",
        language: "json",
        contextType: "code",
        responseMode: "raw_code",
        editorMetadata: {
          source: "MenuDetail.report_pdf_overlay_plan",
          docTitle: String(params.layout.docTitle || ""),
        },
      },
      timeout: AI_TIMEOUT_MS,
      throwHttpErrors: false,
    });

    if (!response.ok || !response.body) {
      return { overlays: fallback, status: "AI local chưa sẵn sàng, dùng trích xuất backend từ PDF mẫu." };
    }

    let fullResponse = "";
    let completed = false;
    await consumeSseStream(response as any, {
      onEvent: (evt) => {
        const payload = evt.payload && typeof evt.payload === "object"
          ? (evt.payload as Record<string, unknown>)
          : null;
        if (!payload) return;
        const result = dispatchAiCodeStreamEvent(payload, fullResponse, {
          onChunk: (_chunk, accumulated) => { fullResponse = accumulated; },
          onComplete: (p) => {
            if (typeof p.fullResponse === "string") fullResponse = p.fullResponse;
            completed = true;
          },
          onError: () => {},
        });
        fullResponse = result.accumulated;
        if (result.completed) completed = true;
      },
    });

    const parsed = tryParseLooseJson(completed ? fullResponse : "");
    const overlaysRaw = Array.isArray(parsed?.overlays) ? parsed?.overlays : [];
    const overlays = overlaysRaw
      .map((x) => ({
        page: Number((x as any)?.page || 1),
        x: Number((x as any)?.x || 0),
        y: Number((x as any)?.y || 0),
        width: Number((x as any)?.width || 0) || undefined,
        align: normalizeOverlayAlign((x as any)?.align),
        fontSize: Number((x as any)?.fontSize || 11),
        fontName: sanitizeTemplateLine((x as any)?.fontName || "Helvetica") || "Helvetica",
        color: sanitizeTemplateLine((x as any)?.color || "#000000") || "#000000",
        bold: Boolean((x as any)?.bold),
        italic: Boolean((x as any)?.italic),
        opacity: Number((x as any)?.opacity || 1),
        rotate: Number((x as any)?.rotate || 0),
        text: sanitizeTemplateLine((x as any)?.text || ""),
      }))
      .filter((x) => x.text);

    if (!overlays.length) {
      return { overlays: fallback, status: "AI local không trả layout hợp lệ, dùng trích xuất backend từ PDF mẫu." };
    }
    return { overlays, status: "AI local đã phân tích PDF mẫu và sinh layout động." };
  } catch {
    return { overlays: fallback, status: "AI local lỗi khi phân tích mẫu, dùng trích xuất backend từ PDF mẫu." };
  }
}

function escapeTemplateLiteral(value: string): string {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildAutoReportDbBody(params: {
  tableName: string;
  fields: TableField[];
  layout: PdfLayoutSpec;
  blueprint?: DocxTemplateBlueprint;
  designSpec?: ReturnType<typeof buildPdfReportDesignSpec>;
}): string {
  const tableName = String(params.tableName || "").trim();
  const allFields = Array.isArray(params.fields) ? params.fields : [];

  const derivedBlueprint: DocxTemplateBlueprint = params.blueprint || {
    title: sanitizeTemplateLine(params.layout.docTitle || "BAO CAO") || "BAO CAO",
    headerLines: (params.layout.headerLines || []).slice(0, 8),
    tableHeaders: (params.layout.tableColumnHeaders || []).slice(0, 10),
    tableRowPlaceholders: buildTablePlaceholders((params.layout.tableColumnHeaders || []).slice(0, 10)),
    signatureLabels: (params.layout.signatureLabels || []).slice(0, 6),
    noteLines: [],
    pageSizeTwip: { width: 11906, height: 16838 },
    pageMarginsTwip: { top: 920, right: 920, bottom: 920, left: 920 },
    baseFontName: "Times New Roman",
    baseFontSizeHalfPt: 24,
    tableColWidthsTwip: computeDocxColumnWidths((params.layout.tableColumnHeaders || []).slice(0, 10)),
    titleAlign: "center",
    headerAlign: "left",
  };

  const colCount = Math.max(1, Math.min(derivedBlueprint.tableHeaders.length || 1, 10));
  const colSource = selectFieldSourcesByHeaders(derivedBlueprint.tableHeaders || [], allFields, colCount);

  const headerCount = Math.min(derivedBlueprint.headerLines.length || 0, 8);
  const signatureCount = Math.min(derivedBlueprint.signatureLabels.length || 0, 6);

  const headerAssignments = Array.from({ length: headerCount }).map((_, i) => {
    const n = i + 1;
    return `  hdr_${n}: data?.hdr_${n} ?? "",`;
  }).join("\n");

  const signatureAssignments = Array.from({ length: signatureCount }).map((_, i) => {
    const n = i + 1;
    return `  sig_${n}: data?.sig_${n} ?? "",`;
  }).join("\n");

  const itemAssignments = Array.from({ length: colCount }).map((_, i) => {
    const n = i + 1;
    const source = colSource[i];
    if (n === 1) return `      col_${n}: (idx + 1),`;
    return `      col_${n}: row?.["${source}"] ?? "",`;
  }).join("\n");

  const filterCandidateFields = allFields
    .map((f) => {
      const name = String((f as any)?.f_name || "").trim();
      const types = String((f as any)?.f_types || "").toLowerCase();
      if (!name) return "";
      if (types.includes("co") || types.includes("cb") || types.includes("date") || types.includes("datetime") || types.includes("time") || types.includes("txt") || types.includes("ed")) {
        return name;
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 20);

  return `
const TABLE_NAME = "${escapeTemplateLiteral(tableName)}";
const cfg = seft?.m_configs || {};
const cfgTableName = String(cfg?.table_name || TABLE_NAME || "").trim();
const activeTableName = cfgTableName || TABLE_NAME;
const filterKeys = ${JSON.stringify(filterCandidateFields)};

const safeNumber = (value) => {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const normalized = String(value).replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9\-\.]/g, "").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

const normalizeFilterText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const dataRowsCandidates = [
  Array.isArray(data?.list) ? data.list : undefined,
  Array.isArray(data?.rows) ? data.rows : undefined,
  Array.isArray(data?.items) ? data.items : undefined,
  Array.isArray(data?.data?.list) ? data.data.list : undefined,
  Array.isArray(data?.data?.rows) ? data.data.rows : undefined,
  Array.isArray(data?.data?.items) ? data.data.items : undefined,
];

const configPaths = [
  cfg?.line_items_data_field,
  cfg?.line_items_list,
  cfg?.line_items_groups_key,
  cfg?.line_items_group,
].filter((x) => typeof x === "string" && x.trim());

const getByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
};

for (const p of configPaths) {
  const v = getByPath(data, p);
  if (Array.isArray(v)) dataRowsCandidates.push(v);
}

const tableRowsCandidates = [
  Array.isArray(bang?.[activeTableName]?.rows) ? bang[activeTableName].rows : undefined,
  Array.isArray(bang?.[TABLE_NAME]?.rows) ? bang[TABLE_NAME].rows : undefined,
  Array.isArray(bang?.[cfgTableName]?.rows) ? bang[cfgTableName].rows : undefined,
  Array.isArray(bang?.[cfg?.line_items_data_field]?.rows) ? bang[cfg.line_items_data_field].rows : undefined,
  Array.isArray(bang?.[cfg?.line_items_list]?.rows) ? bang[cfg.line_items_list].rows : undefined,
];

const resolvedRows = [...dataRowsCandidates, ...tableRowsCandidates].find((x) => Array.isArray(x));
const rowsRaw = Array.isArray(resolvedRows) ? resolvedRows : [];

const filterEntries = (filterKeys.length ? filterKeys : Object.keys(data || {})).map((k) => {
  const v = data?.[k];
  return [k, v];
}).filter(([key, val]) => {
  if (!key || val == null) return false;
  if (typeof val === "object") return false;
  const raw = String(val).trim();
  return raw !== "" && raw.toLowerCase() !== "all" && raw !== "*";
});

const rows = rowsRaw.filter((row) => {
  if (!row || typeof row !== "object") return false;
  for (const [key, val] of filterEntries) {
    if (!(key in row)) continue;
    const rv = row?.[key];
    if (rv == null || rv === "") return false;
    const rowNum = safeNumber(rv);
    const valNum = safeNumber(val);
    if (Number.isFinite(rowNum) && Number.isFinite(valNum)) {
      if (Math.abs(rowNum - valNum) > 1e-9) return false;
      continue;
    }
    const rowText = normalizeFilterText(rv);
    const valText = normalizeFilterText(val);
    if (valText && rowText && !rowText.includes(valText)) return false;
  }
  return true;
});

const moneyFormatter = (value) => {
  const num = safeNumber(value);
  if (!Number.isFinite(num)) return String(value ?? "");
  return num.toLocaleString("vi-VN");
};

const items = rows.map((row, idx) => ({
  ...(row || {}),
  stt: idx + 1,
  index: idx + 1,
${itemAssignments}
}));

const totals = {};
for (const row of rows) {
  for (const [key, val] of Object.entries(row || {})) {
    const n = safeNumber(val);
    if (!Number.isFinite(n)) continue;
    totals[key] = Number(totals[key] || 0) + n;
  }
}
const totalKeyPriority = [
  "thanh_tien", "thanh_tien_vnd", "amount", "total", "tong_tien", "tong_gia_tri", "tong_thanhtoan", "tong_thanh_toan",
];
const totalsKey = totalKeyPriority.find((k) => Number.isFinite(Number(totals[k])));
const tongCongRaw = totalsKey
  ? Number(totals[totalsKey] || 0)
  : rows.reduce((sum, row) => {
      const values = Object.values(row || {});
      let maxNum = 0;
      for (const val of values) {
        const n = safeNumber(val);
        if (Number.isFinite(n) && Math.abs(n) > Math.abs(maxNum)) maxNum = n;
      }
      return sum + maxNum;
    }, 0);

const reportDesignSpec = ${JSON.stringify(params.designSpec || null)};

return {
  ...(data || {}),
  ten_cong_ty: bang?.sys_apps?.rows?.[0]?.app_name ?? data?.ten_cong_ty ?? "",
  com_logo: seft?.com_logo ?? data?.com_logo ?? "",
  table_name: activeTableName,
  rows,
  totals,
${headerAssignments ? `${headerAssignments}\n` : ""}
  items,
  tong_cong: moneyFormatter(tongCongRaw),
  ghi_chu: data?.ghi_chu ?? "",
${signatureAssignments ? `${signatureAssignments}\n` : ""}
  reportDesignSpec,
};
`.trim();
}

async function uploadReportAsset(params: {
  appId: string;
  token?: string;
  fileName: string;
  dataUrl: string;
}): Promise<string> {
  const response = await postUploadJsonWithFallback({
    app_id: params.appId,
    name: params.fileName,
    src: params.dataUrl,
  }, params.token);

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();
  try {
    const parsed = JSON.parse(responseText);
    const candidate = typeof parsed?.path === "string"
      ? parsed.path
      : (typeof parsed?.url === "string" ? parsed.url : "");
    if (candidate) return candidate.startsWith("/") ? candidate : `/${candidate}`;
  } catch {
    // fallback to plain text below
  }

  const trimmed = responseText.trim();
  if (trimmed && !/^<!doctype html>/i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  throw new Error("Upload response invalid path");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function normalizeFileName(originalName: string): string {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? `.${parts.pop()}` : "";
  const base = parts.join(".");
  return base
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
    .replace(/[èéẹẻẽêềếệểễ]/g, "e")
    .replace(/[ìíịỉĩ]/g, "i")
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
    .replace(/[ùúụủũưừứựửữ]/g, "u")
    .replace(/[ỳýỵỷỹ]/g, "y")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9.\-]/g, "")
    .concat(ext ? ext.toLowerCase() : "");
}

function looksLikeDocxZipBuffer(buffer: ArrayBuffer): boolean {
  if (!buffer || buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x50 && bytes[1] === 0x4b && (
    (bytes[2] === 0x03 && bytes[3] === 0x04)
    || (bytes[2] === 0x05 && bytes[3] === 0x06)
    || (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function buildReportTemplateCandidates(path: string, appId?: string): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const v = String(value || "").trim();
    if (!v || out.includes(v)) return;
    out.push(v);
  };

  const input = String(path || "").trim();
  if (!input) return out;

  push(input);
  const plain = input.split("?")[0];
  if (!plain.startsWith("/")) push(`/${plain}`);

  const normalized = plain.startsWith("/") ? plain : `/${plain}`;
  const base = normalized.split("/").pop() || "";
  if (base && appId) {
    push(`/app_images/${appId}/${base}`);
  }

  const apiBase = String((import.meta as any)?.env?.VITE_API_BASE_URL || "").trim();
  if (apiBase) {
    const origin = apiBase.replace(/\/+$/, "");
    for (const p of [...out]) {
      if (p.startsWith("/")) push(`${origin}${p}`);
    }
  }

  return out;
}

function parseTriggerConfig(raw: unknown): TriggerConfig | Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as TriggerConfig | Record<string, any>;
  if (typeof raw !== "string") return {};

  const tryParse = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct && typeof direct === "object") return direct as TriggerConfig | Record<string, any>;

  let decoded: string | null = null;
  if (raw.includes("%")) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = null;
    }
  }
  if (decoded) {
    const parsedDecoded = tryParse(decoded);
    if (parsedDecoded && typeof parsedDecoded === "object") return parsedDecoded as TriggerConfig | Record<string, any>;
  }

  try {
    const decrypted = csmDecrypt(raw);
    const parsedDecrypted = tryParse(decrypted);
    if (parsedDecrypted && typeof parsedDecrypted === "object") {
      return parsedDecrypted as TriggerConfig | Record<string, any>;
    }
  } catch {
    // Ignore decrypt errors
  }

  if (decoded) {
    try {
      const decryptedDecoded = csmDecrypt(decoded);
      const parsedDecryptedDecoded = tryParse(decryptedDecoded);
      if (parsedDecryptedDecoded && typeof parsedDecryptedDecoded === "object") {
        return parsedDecryptedDecoded as TriggerConfig | Record<string, any>;
      }
    } catch {
      // Ignore decrypt errors
    }
  }

  return {};
}

function parseKanbanConfig(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string") return null;

  const text = raw.trim();
  if (!text) return null;

  if (text === "KANBAN_CONFIG_TEMPLATE" || text === "#sym:KANBAN_CONFIG_TEMPLATE") {
    try {
      const parsedTemplate = JSON.parse(KANBAN_CONFIG_TEMPLATE);
      return parsedTemplate && typeof parsedTemplate === "object" ? parsedTemplate : null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string" && (parsed === "KANBAN_CONFIG_TEMPLATE" || parsed === "#sym:KANBAN_CONFIG_TEMPLATE")) {
      const parsedTemplate = JSON.parse(KANBAN_CONFIG_TEMPLATE);
      return parsedTemplate && typeof parsedTemplate === "object" ? parsedTemplate : null;
    }
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const KANBAN_STAGE_COLORS = ["blue", "orange", "green", "red", "purple", "cyan", "gold"];

function pickExistingFieldName(fields: TableField[], candidates: string[], fallback = ""): string {
  if (!Array.isArray(fields) || fields.length === 0) return fallback;
  const mapByLower = new Map<string, string>();
  fields.forEach((field) => {
    const name = String((field as any).f_name || "").trim();
    if (name) mapByLower.set(name.toLowerCase(), name);
  });

  for (const candidate of candidates) {
    const key = String(candidate || "").toLowerCase().trim();
    if (!key) continue;
    if (mapByLower.has(key)) return mapByLower.get(key)!;
  }

  return fallback;
}

function extractStagesFromTableFields(fields: TableField[], stageField: string): Array<{ id: string; label: string; color: string }> {
  if (!Array.isArray(fields) || fields.length === 0 || !stageField) return [];
  const stageFieldMeta = fields.find((field) => String((field as any).f_name || "").trim().toLowerCase() === stageField.toLowerCase());
  if (!stageFieldMeta) return [];
  const rawQuery = String((stageFieldMeta as any).f_cbo_query || "").trim();
  if (!rawQuery) return [];

  const stageItems: Array<{ id: string; label: string; color: string }> = [];
  const addStage = (idRaw: any, labelRaw: any) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const label = String(labelRaw ?? id).trim() || id;
    if (stageItems.some((item) => item.id === id)) return;
    const color = KANBAN_STAGE_COLORS[(stageItems.length % KANBAN_STAGE_COLORS.length)];
    stageItems.push({ id, label, color });
  };

  if (rawQuery.startsWith("{") || rawQuery.startsWith("[")) {
    try {
      const parsed = JSON.parse(rawQuery);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          if (item && typeof item === "object") {
            addStage(item.ma ?? item.value ?? item.id, item.ten ?? item.label ?? item.name);
          } else {
            addStage(item, item);
          }
        });
      } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).options)) {
        (parsed as any).options.forEach((item: any) => {
          if (item && typeof item === "object") {
            addStage(item.ma ?? item.value ?? item.id, item.ten ?? item.label ?? item.name);
          } else {
            addStage(item, item);
          }
        });
      }
    } catch {
      // Ignore malformed combo JSON and fallback to existing config stages.
    }
  }

  return stageItems;
}

function tightenKanbanConfig(
  inputConfig: Record<string, any> | null,
  tableName: string,
  fields: TableField[]
): Record<string, any> {
  const baseFromInput = inputConfig && typeof inputConfig === "object" ? inputConfig : {};
  const baseTemplate = parseKanbanConfig(KANBAN_CONFIG_TEMPLATE) || {};
  const nextConfig: Record<string, any> = {
    ...baseTemplate,
    ...baseFromInput,
  };

  const resolvedTableName = String(tableName || nextConfig.tableName || nextConfig.table_name || "").trim();
  if (resolvedTableName) {
    nextConfig.tableName = resolvedTableName;
    delete nextConfig.table_name;
  }

  const resolvedPkField = pickExistingFieldName(fields, [
    String(nextConfig.pkField || ""),
    "id",
    "pk",
  ], String(nextConfig.pkField || "id") || "id");
  nextConfig.pkField = resolvedPkField || "id";

  const resolvedStageField = pickExistingFieldName(fields, [
    String(nextConfig.stageField || ""),
    "status",
    "stage",
    "trang_thai",
  ], String(nextConfig.stageField || "status") || "status");
  nextConfig.stageField = resolvedStageField || "status";

  const resolvedTitleField = pickExistingFieldName(fields, [
    String(nextConfig.titleField || ""),
    "title",
    "name",
    "ten",
    "subject",
  ], String(nextConfig.titleField || "title") || "title");
  nextConfig.titleField = resolvedTitleField || "title";

  const resolvedDueField = pickExistingFieldName(fields, [
    String(nextConfig.dueDateField || ""),
    "due_at",
    "deadline",
    "han_xu_ly",
    "ngay_het_han",
  ], String(nextConfig.dueDateField || "due_at") || "due_at");
  nextConfig.dueDateField = resolvedDueField || "due_at";

  nextConfig.assigneeField = pickExistingFieldName(fields, [
    String(nextConfig.assigneeField || ""),
    "owner_id",
    "assignee_id",
    "user_id",
  ], String(nextConfig.assigneeField || ""));

  nextConfig.priorityField = pickExistingFieldName(fields, [
    String(nextConfig.priorityField || ""),
    "priority",
    "muc_do",
  ], String(nextConfig.priorityField || ""));

  nextConfig.descriptionField = pickExistingFieldName(fields, [
    String(nextConfig.descriptionField || ""),
    "description",
    "task_type",
    "ghi_chu",
  ], String(nextConfig.descriptionField || ""));

  if (!nextConfig.timeline || typeof nextConfig.timeline !== "object") {
    nextConfig.timeline = {};
  }
  nextConfig.timeline = {
    ...nextConfig.timeline,
    primaryDateField: pickExistingFieldName(fields, [
      String(nextConfig.timeline?.primaryDateField || ""),
      String(nextConfig.dueDateField || ""),
      "due_at",
      "start_at",
      "created_at",
    ], String(nextConfig.timeline?.primaryDateField || nextConfig.dueDateField || "due_at") || "due_at"),
  };

  if (!nextConfig.kpi || typeof nextConfig.kpi !== "object") {
    nextConfig.kpi = {};
  }
  nextConfig.kpi = {
    enabled: nextConfig.kpi.enabled ?? true,
    doneStageIds: Array.isArray(nextConfig.kpi.doneStageIds) ? nextConfig.kpi.doneStageIds : ["done"],
    createdAtField: pickExistingFieldName(fields, [
      String(nextConfig.kpi.createdAtField || ""),
      "created_at",
      "ngay_tao",
    ], String(nextConfig.kpi.createdAtField || "created_at") || "created_at"),
    startedAtField: pickExistingFieldName(fields, [
      String(nextConfig.kpi.startedAtField || ""),
      "start_at",
      "ngay_bat_dau",
    ], String(nextConfig.kpi.startedAtField || "start_at") || "start_at"),
    completedAtField: pickExistingFieldName(fields, [
      String(nextConfig.kpi.completedAtField || ""),
      "completed_at",
      "ngay_hoan_thanh",
    ], String(nextConfig.kpi.completedAtField || "completed_at") || "completed_at"),
  };

  const stageFromCombo = extractStagesFromTableFields(fields, String(nextConfig.stageField || ""));
  if (stageFromCombo.length > 0) {
    nextConfig.stages = stageFromCombo;
  } else if (!Array.isArray(nextConfig.stages) || nextConfig.stages.length === 0) {
    nextConfig.stages = [
      { id: "todo", label: "Chưa xử lý", color: "blue" },
      { id: "in_progress", label: "Đang xử lý", color: "orange" },
      { id: "done", label: "Hoàn thành", color: "green" },
    ];
  }

  return nextConfig;
}

function parseDoneStageIdsInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(raw || "").trim();
  if (!text) return [];
  return text
    .split(/[\n,;]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function buildProgressByStage(
  stages: Array<{ id: string; label?: string; color?: string }>,
  doneStageIds: string[]
): Record<string, number> {
  const doneSet = new Set((doneStageIds || []).map((item) => String(item || "").trim()).filter(Boolean));
  const nonDone = stages.filter((stage) => !doneSet.has(String(stage.id || "").trim()));
  const result: Record<string, number> = {};
  const step = nonDone.length > 0 ? (90 / Math.max(nonDone.length, 1)) : 0;

  nonDone.forEach((stage, index) => {
    const value = Math.min(90, Math.max(0, Math.round((index + 1) * step)));
    result[String(stage.id || "")] = value;
  });
  (doneStageIds || []).forEach((stageId) => {
    result[String(stageId || "")] = 100;
  });

  return result;
}

function buildProgressTrackingDefaults(fields: TableField[]): Record<string, string> {
  return {
    taskRefField: pickExistingFieldName(fields, ["task_id", "id_task", "task_ref", "id_congviec"], "task_id"),
    stageField: pickExistingFieldName(fields, ["status", "stage", "trang_thai"], "status"),
    progressField: pickExistingFieldName(fields, ["progress_percent", "progress", "tien_do"], "progress_percent"),
    changedAtField: pickExistingFieldName(fields, ["updated_at", "changed_at", "created_at", "thoi_gian_cap_nhat"], "updated_at"),
    noteField: pickExistingFieldName(fields, ["note", "notes", "ghi_chu"], "note"),
    actorField: pickExistingFieldName(fields, ["updated_by", "actor_id", "user_id", "nguoi_cap_nhat"], "updated_by"),
  };
}

function buildFieldNameSet(fields: TableField[]): Set<string> {
  return new Set(
    (fields || [])
      .map((field) => String((field as any).f_name || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function fieldExistsInSet(fieldSet: Set<string>, fieldName: string): boolean {
  const normalized = String(fieldName || "").trim().toLowerCase();
  if (!normalized) return false;
  return fieldSet.has(normalized);
}

function shouldAutofillField(fieldSet: Set<string>, currentValue: unknown): boolean {
  const normalized = String(currentValue || "").trim();
  if (!normalized) return true;
  return !fieldExistsInSet(fieldSet, normalized);
}

function linkedMenuFieldsEqual(left: TableField[], right: TableField[]): boolean {
  const leftNames = (left || []).map((field) => String((field as any).f_name || "").trim()).filter(Boolean);
  const rightNames = (right || []).map((field) => String((field as any).f_name || "").trim()).filter(Boolean);
  if (leftNames.length !== rightNames.length) return false;
  return leftNames.every((name, index) => name === rightNames[index]);
}

type KanbanFieldSpec = {
  name: string;
  header: string;
  type: string;
  required?: number;
  search?: number;
  report?: number;
  cboQuery?: string;
};

function createKanbanTableField(spec: KanbanFieldSpec, stt: number): TableField {
  return {
    f_stt: stt,
    f_name: spec.name,
    f_header: spec.header,
    f_types: spec.type,
    f_show: 1,
    f_required: spec.required ?? 0,
    f_search: spec.search ?? 0,
    f_report: spec.report ?? 0,
    f_fixcol: 0,
    f_pkid: 0,
    ...(spec.cboQuery ? { f_cbo_query: spec.cboQuery } : {}),
  } as TableField;
}

function mergeMissingFields(existingFields: TableField[], specs: KanbanFieldSpec[]): { fields: TableField[]; addedNames: string[] } {
  const fields = Array.isArray(existingFields) ? [...existingFields] : [];
  const fieldSet = buildFieldNameSet(fields);
  const addedNames: string[] = [];
  let nextStt = fields.reduce((maxValue, field) => Math.max(maxValue, Number((field as any).f_stt || 0)), 0);

  specs.forEach((spec) => {
    if (fieldExistsInSet(fieldSet, spec.name)) return;
    nextStt += 1;
    fields.push(createKanbanTableField(spec, nextStt));
    fieldSet.add(String(spec.name || "").trim().toLowerCase());
    addedNames.push(spec.name);
  });

  return { fields, addedNames };
}

function addMenuToTree(menus: MenuItemType[], newMenu: MenuItemType): void {
	const parentId = newMenu.parentId;
	if (!parentId || parentId === "") {
		menus.push(newMenu);
	} else {
		const parent = findMenuById(menus, parentId);
		if (parent) {
			if (!(parent as any).children) (parent as any).children = [];
			(parent as any).children.push(newMenu);
		} else {
			menus.push(newMenu); // fallback
		}
	}
}

const ID_TO_I18N_KEY: Record<string, string> = {
	"system": "common.menu.system",
	"user": "common.menu.user",
	"menu": "common.menu.menu",
	"developer": "common.menu.developer",
	"dept": "common.menu.permissionGroup",
};

function getMenuLabel(menu: MenuItemType, lang: string = 'vi', t?: (key: string) => string): string {
	const currentLang = lang.toLowerCase().startsWith('en') ? 'en' : lang.toLowerCase().startsWith('zh') ? 'zh' : 'vi';
	
	if (currentLang === 'en' && menu.label_en) return menu.label_en;
	if (currentLang === 'zh' && menu.label_zh) return menu.label_zh;
	
	// Fallback to VI - check if label is i18n key
	if (menu.label) {
		// If label looks like an i18n key (e.g., "common.menu.system"), translate it
		if (t && menu.label.includes('.')) {
			return t(menu.label);
		}
		return menu.label;
	}
	if (menu.name) {
		// Same for name field
		if (t && menu.name.includes('.')) {
			return t(menu.name);
		}
		return menu.name;
	}
	// Try ID mapping as final fallback
	if (menu.id && t && ID_TO_I18N_KEY[menu.id]) {
		return t(ID_TO_I18N_KEY[menu.id]);
	}
	return menu.id || '';
}

function normalizeMenuSelectNumber(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildConfigString(data: Partial<MenuItemType> = {}) {
  if (!data) return "";
  if (typeof data.config === "string" && data.config.trim()) return data.config;

  const merged: Record<string, any> = {};
  if (data.table_name) merged.table_name = data.table_name;
  if (data.table) merged.table = data.table;
  if (data.trigger) merged.trigger = data.trigger;

  return Object.keys(merged).length ? JSON.stringify(merged, null, 2) : "";
}

export function Detail({
  title,
  open,
  flatParentMenus,
  onCloseChange,
  detailData,
  refreshTable,
  appId,
  treeData,
  saveMenuApp,
  fullMenuList,
  setFullMenuList,
}: DetailProps) {
  // Log treeData để kiểm tra giá trị truyền vào
  const { t, i18n } = useTranslation();
  const menuOptions = useMenuDesignerOptions(t);
  const formRef = useRef<FormInstance>(null);
  const autoSyncingRef = useRef(false);
  const resolvedMenuFormFields = useMemo(() => ({
    type_form: resolveMenuTypeForm(detailData),
    row_type_edit: normalizeMenuSelectNumber(detailData.row_type_edit, 0),
    type_menu: normalizeMenuSelectNumber(detailData.type_menu, 0),
    ...(detailData.m_show != null ? { m_show: Number(detailData.m_show) } : {}),
  }), [detailData]);
  const [applyingLinkedFieldFix, setApplyingLinkedFieldFix] = useState(false);
  const [tableRows, setTableRows] = useState<TableField[]>([]);
  const [progressTableRows, setProgressTableRows] = useState<TableField[]>([]);
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig | Record<string, any>>({});
  const [lineItemsConfig, setLineItemsConfig] = useState<Partial<LineItemsEditorConfig>>({});
  const [subUserModeConfig, setSubUserModeConfig] = useState<SystemUserMenuModeConfig>(() => getDefaultSystemUserModeConfig("sub", t));
  const user = useUserStore();
  const [generatingReportFromPdf, setGeneratingReportFromPdf] = useState(false);
  const [pdfOverlayDraft, setPdfOverlayDraft] = useState("");
  const [pdfOverlayModalOpen, setPdfOverlayModalOpen] = useState(false);
  const [pdfOverlayEditItems, setPdfOverlayEditItems] = useState<PdfOverlayPlanItem[]>([]);
  const [pdfOverlayPreviewUrls, setPdfOverlayPreviewUrls] = useState<string[]>([]);
  const [pdfOverlayPending, setPdfOverlayPending] = useState<null | {
    sourcePdfPath: string;
    tableName: string;
    layout: PdfLayoutSpec;
    overlayItems: PdfOverlayPlanItem[];
    designSpec?: ReturnType<typeof buildPdfReportDesignSpec>;
  }>(null);
  const [autoCodeOptions, setAutoCodeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [loadingAutoCode, setLoadingAutoCode] = useState(false);
  const [downloadingReportTemplate, setDownloadingReportTemplate] = useState(false);
  const [comparingPdfTemplate, setComparingPdfTemplate] = useState(false);
  const [pdfCompareResult, setPdfCompareResult] = useState<null | {
    qualityGate?: string;
    textCoveragePercent?: number;
    matchedLines?: number;
    sampleLineCount?: number;
    renderedLineCount?: number;
    positionDriftMm?: { avg?: number; p95?: number; max?: number };
    missingSampleLines?: string[];
    unexpectedRenderLines?: string[];
  }>(null);

  const previewDesignSpec = useMemo(() => {
    if (!pdfOverlayPending) return null;
    const sampleLines = Array.isArray(pdfOverlayPending.layout?.orderedLines)
      ? pdfOverlayPending.layout.orderedLines.slice(0, 20)
      : [];
    return buildPdfReportDesignSpec(pdfOverlayPending.layout, pdfOverlayEditItems, tableRows, sampleLines);
  }, [pdfOverlayPending, pdfOverlayEditItems, tableRows]);

  const previewOverlayItems = useMemo(() => {
    return (pdfOverlayEditItems.length > 0 ? pdfOverlayEditItems : pdfOverlayPending?.overlayItems || [])
      .filter((item) => String(item?.text || "").trim())
      .slice(0, 120);
  }, [pdfOverlayEditItems, pdfOverlayPending]);

  const previewOverlayContext = useMemo(() => {
    if (!pdfOverlayPending) return {} as Record<string, any>;
    return buildPdfOverlayPreviewContext(tableRows, pdfOverlayPending.layout as any);
  }, [pdfOverlayPending, tableRows]);

  const compareHighlightSets = useMemo(() => {
    const normalize = (value: string) => String(value || "")
      .toLowerCase()
      .replace(/\u00a0/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const missing = new Set(
      (pdfCompareResult?.missingSampleLines || [])
        .map((line) => normalize(String(line || "")))
        .filter(Boolean),
    );
    const unexpected = new Set(
      (pdfCompareResult?.unexpectedRenderLines || [])
        .map((line) => normalize(String(line || "")))
        .filter(Boolean),
    );
    return { normalize, missing, unexpected };
  }, [pdfCompareResult]);

  const previewOverlayDisplayItems = useMemo(() => {
    return previewOverlayItems.map((item) => {
      const resolved = resolvePdfOverlayText(String(item?.text || ""), previewOverlayContext) || String(item?.text || "");
      const key = compareHighlightSets.normalize(resolved);
      let status: "neutral" | "ok" | "warn" | "miss" = "neutral";
      if (pdfCompareResult) {
        if (key && compareHighlightSets.missing.has(key)) status = "miss";
        else if (key && compareHighlightSets.unexpected.has(key)) status = "warn";
        else status = "ok";
      }
      return { item, resolved, status };
    });
  }, [previewOverlayItems, previewOverlayContext, compareHighlightSets, pdfCompareResult]);

  const previewPageMetrics = useMemo(() => {
    const widthPt = Number(previewDesignSpec?.pageWidth || 595);
    const heightPt = Number(previewDesignSpec?.pageHeight || 842);
    const toPercent = (item: PdfOverlayPlanItem) => {
      const xPt = Number(item?.x || 0);
      const yPt = Number(item?.y || 0);
      const left = widthPt > 0 ? (xPt / widthPt) * 100 : 0;
      const top = heightPt > 0 ? ((heightPt - yPt) / heightPt) * 100 : 0;
      return {
        left: Number.isFinite(left) ? left : 0,
        top: Number.isFinite(top) ? top : 0,
      };
    };
    return { toPercent };
  }, [previewDesignSpec]);

  const antIconOptions = useMemo(() => {
    const fullOptions = Object.keys(AntdIcons)
      .filter((name) => /Outlined$|Filled$|TwoTone$/.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const IconComp = (AntdIcons as any)[name];
        return {
          label: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconComp />
              <span>{name}</span>
            </span>
          ),
          value: name,
          searchText: name.toLowerCase(),
        };
      });

    const quickSet = new Set(QUICK_ANT_ICON_NAMES.map((name) => name.toLowerCase()));
    const quickOptions = fullOptions.filter((opt) => quickSet.has(String(opt.value || "").toLowerCase()));
    const allOptionsWithoutQuick = fullOptions.filter((opt) => !quickSet.has(String(opt.value || "").toLowerCase()));

    return [
      {
        label: t("system.menu.iconQuickGroup"),
        options: quickOptions,
      },
      {
        label: t("system.menu.iconAllGroup"),
        options: allOptionsWithoutQuick,
      },
    ];
  }, [t]);

  const relatedDataMenuOptions = useMemo(() => {
    return (flatParentMenus || [])
      .filter((menu) => String((menu as any).table_name || "").trim())
      .map((menu) => ({
        label: `${getMenuLabel(menu, i18n.language, t)} [${String((menu as any).table_name || "").trim()}]`,
        value: menu.id,
      }));
  }, [flatParentMenus, i18n.language, t]);

  const progressDataMenuOptions = useMemo(() => {
    return (flatParentMenus || [])
      .filter((menu) => String((menu as any).table_name || "").trim())
      .map((menu) => ({
        label: `${getMenuLabel(menu, i18n.language, t)} [${String((menu as any).table_name || "").trim()}]`,
        value: menu.id,
      }));
  }, [flatParentMenus, i18n.language, t]);

  const kanbanFieldOptions = useMemo(() => {
    return (tableRows || [])
      .map((field) => String((field as any).f_name || "").trim())
      .filter(Boolean)
      .map((name) => ({ label: name, value: name }));
  }, [tableRows]);

  const kanbanProgressFieldOptions = useMemo(() => {
    return (progressTableRows || [])
      .map((field) => String((field as any).f_name || "").trim())
      .filter(Boolean)
      .map((name) => ({ label: name, value: name }));
  }, [progressTableRows]);

  const menuScopeAiMetadata = useMemo(() => {
    const activeMenuId = String((detailData as any)?.id || "").trim();
    const activeMenuName = String((detailData as any)?.name || (detailData as any)?.label || (detailData as any)?.title || "").trim();
    const tableName = String((detailData as any)?.table_name || "").trim();
    const triggerKeys = Object.keys(triggerConfig || {}).filter((key) => String((triggerConfig as any)?.[key] || "").trim());
    return {
      focusMode: "current_file",
      activeScope: "menu_detail",
      activeMenuId,
      activeMenuName,
      tableName,
      triggerKeys,
      activeMenuNode: detailData || {},
      activeTableFields: tableRows || [],
      activeProgressTableFields: progressTableRows || [],
      activeTriggerConfig: triggerConfig || {},
    } as Record<string, unknown>;
  }, [detailData, progressTableRows, tableRows, triggerConfig]);

  const handleApplyLineItemsTemplate = useCallback(() => {
    setLineItemsConfig({
      line_items_data_field: PHUSON_PANEL_CONFIG.line_items_data_field,
      line_items_groups_key: PHUSON_PANEL_CONFIG.line_items_groups_key,
      line_items_list: PHUSON_PANEL_CONFIG.line_items_list,
      line_items_columns: PHUSON_PANEL_CONFIG.line_items_columns,
      line_items_group: PHUSON_PANEL_CONFIG.line_items_group,
      line_items_totals: PHUSON_PANEL_CONFIG.line_items_totals,
      line_items_print: PHUSON_PANEL_CONFIG.line_items_print,
      line_items_workflow: PHUSON_PANEL_CONFIG.line_items_workflow,
    });
    setTableRows(Array.isArray(PHUSON_PANEL_CONFIG.table) ? [...PHUSON_PANEL_CONFIG.table] as TableField[] : []);
    setTriggerConfig((prev) => ({
      ...(prev || {}),
      print_bao_gia: PHUSON_PANEL_CONFIG.trigger?.print_bao_gia ?? (prev as any)?.print_bao_gia,
      print_lenh_sx: PHUSON_PANEL_CONFIG.trigger?.print_lenh_sx ?? (prev as any)?.print_lenh_sx,
      print_pxk: PHUSON_PANEL_CONFIG.trigger?.print_pxk ?? (prev as any)?.print_pxk,
    }));
    formRef.current?.setFieldsValue({
      table_name: PHUSON_PANEL_CONFIG.table_name,
      type_form: 7,
    });
    message.success(t("system.menu.lineItemsTemplateApplied"));
  }, [t]);

  const handleApplyPhusonMenuPreset = useCallback((presetId: PhusonMenuPresetId) => {
    const cfg = buildPhusonMenuConfig(presetId);
    setLineItemsConfig({
      line_items_data_field: cfg.line_items_data_field,
      line_items_groups_key: cfg.line_items_groups_key,
      line_items_list: cfg.line_items_list,
      line_items_columns: cfg.line_items_columns,
      line_items_group: cfg.line_items_group,
      line_items_totals: cfg.line_items_totals,
      line_items_print: cfg.line_items_print,
      line_items_workflow: cfg.line_items_workflow,
      line_items_ui: cfg.line_items_ui,
    });
    setTableRows(Array.isArray(cfg.table) ? [...cfg.table] as TableField[] : []);
    setTriggerConfig((prev) => ({ ...(prev || {}), ...cfg.trigger }));
    formRef.current?.setFieldsValue({
      table_name: cfg.table_name,
      type_form: 7,
    });
    message.success(t("system.menu.lineItemsPresetApplied", `Đã áp preset ${presetId} — nhớ Lưu menu để ghi DB`));
  }, [t]);

  const syncLineItemsDocxTemplateUrl = useCallback((templatePath: string) => {
    const normalizedPath = String(templatePath || "").trim();
    if (!normalizedPath) return;

    setLineItemsConfig((prev) => {
      const currentPrintConfigs = Array.isArray(prev?.line_items_print) ? prev.line_items_print : [];
      if (currentPrintConfigs.length === 0) return prev;

      let changed = false;
      const nextPrintConfigs = currentPrintConfigs.map((cfg: any) => {
        const docxCfg = cfg?.print_docx && typeof cfg.print_docx === "object" ? cfg.print_docx : undefined;
        const engine = String(cfg?.print_engine || "").trim().toLowerCase();
        const shouldSync = engine === "docx" || !!docxCfg;
        if (!shouldSync) return cfg;

        const currentTemplate = String(docxCfg?.template_url || "").trim();
        if (currentTemplate === normalizedPath) return cfg;

        changed = true;
        return {
          ...cfg,
          print_engine: engine || "docx",
          print_docx: {
            ...(docxCfg || {}),
            template_url: normalizedPath,
          },
        };
      });

      if (!changed) return prev;
      return {
        ...prev,
        line_items_print: nextPrintConfigs,
      };
    });
  }, []);

  const buildKanbanFieldAdvice = (depValues: Record<string, any>): string[] => {
    const advices: string[] = [];
    const mode = String(depValues.kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    const autoProgressRaw = depValues.kanban_auto_update_progress;
    const autoProgress = autoProgressRaw === undefined || autoProgressRaw === null || autoProgressRaw === "inherit"
      ? true
      : (autoProgressRaw === true || autoProgressRaw === "true" || autoProgressRaw === 1);

    const taskFieldSet = buildFieldNameSet(tableRows);
    const progressFieldSet = buildFieldNameSet(progressTableRows);

    const linkedTaskMenuId = String(depValues.linked_data_menu_id || "").trim();
    if (!linkedTaskMenuId) {
      advices.push(t("system.menu.kanbanSmartAdviceTaskMenuMissing"));
    }

    const taskMissing: string[] = [];
    const taskCandidates: string[] = [];
    const taskChecks = [
      {
        label: t("system.menu.kanbanStageFieldLabel"),
        selected: String(depValues.kanban_stage_field || "").trim(),
        candidates: ["status", "stage", "trang_thai"],
      },
      {
        label: t("system.menu.kanbanTitleFieldLabel"),
        selected: String(depValues.kanban_title_field || "").trim(),
        candidates: ["title", "name", "ten", "subject"],
      },
      {
        label: t("system.menu.kanbanDueDateFieldLabel"),
        selected: String(depValues.kanban_due_date_field || "").trim(),
        candidates: ["due_at", "deadline", "han_xu_ly"],
      },
      {
        label: t("system.menu.kanbanProgressFieldLabel"),
        selected: String(depValues.kanban_progress_field || "").trim(),
        candidates: ["progress_percent", "progress", "tien_do"],
        enabled: autoProgress,
      },
    ];

    taskChecks.forEach((check) => {
      if (check.enabled === false) return;
      if (check.selected && fieldExistsInSet(taskFieldSet, check.selected)) return;
      const suggested = pickExistingFieldName(tableRows, [check.selected, ...check.candidates], "");
      if (suggested && fieldExistsInSet(taskFieldSet, suggested)) return;
      taskMissing.push(check.label);
      taskCandidates.push(...check.candidates);
    });

    if (taskMissing.length > 0) {
      advices.push(
        `${t("system.menu.kanbanSmartAdviceTaskFieldsMissing")}: ${taskMissing.join(", ")}. ${t("system.menu.kanbanSmartAdviceCandidatePrefix")}: ${Array.from(new Set(taskCandidates)).join(", ")}`
      );
    }

    if (mode === "separate_table") {
      const linkedProgressMenuId = String(depValues.linked_progress_menu_id || "").trim();
      if (!linkedProgressMenuId) {
        advices.push(t("system.menu.kanbanSmartAdviceProgressMenuMissing"));
      }

      const progressMissing: string[] = [];
      const progressCandidates: string[] = [];
      const progressChecks = [
        {
          label: t("system.menu.kanbanProgressTaskRefFieldLabel"),
          selected: String(depValues.kanban_progress_task_ref_field || "").trim(),
          candidates: ["task_id", "id_task", "task_ref", "id_congviec"],
        },
        {
          label: t("system.menu.kanbanProgressStageLogFieldLabel"),
          selected: String(depValues.kanban_progress_stage_log_field || "").trim(),
          candidates: ["status", "stage", "trang_thai"],
        },
        {
          label: t("system.menu.kanbanProgressPercentLogFieldLabel"),
          selected: String(depValues.kanban_progress_percent_log_field || "").trim(),
          candidates: ["progress_percent", "progress", "tien_do"],
        },
        {
          label: t("system.menu.kanbanProgressTimeFieldLabel"),
          selected: String(depValues.kanban_progress_time_field || "").trim(),
          candidates: ["updated_at", "changed_at", "created_at", "thoi_gian_cap_nhat"],
        },
      ];

      progressChecks.forEach((check) => {
        if (check.selected && fieldExistsInSet(progressFieldSet, check.selected)) return;
        const suggested = pickExistingFieldName(progressTableRows, [check.selected, ...check.candidates], "");
        if (suggested && fieldExistsInSet(progressFieldSet, suggested)) return;
        progressMissing.push(check.label);
        progressCandidates.push(...check.candidates);
      });

      if (progressMissing.length > 0) {
        advices.push(
          `${t("system.menu.kanbanSmartAdviceProgressFieldsMissing")}: ${progressMissing.join(", ")}. ${t("system.menu.kanbanSmartAdviceCandidatePrefix")}: ${Array.from(new Set(progressCandidates)).join(", ")}`
        );
      }
    }

    return advices;
  };

  const getMissingKanbanFieldPlan = (depValues?: Record<string, any>) => {
    const values = depValues || formRef.current?.getFieldsValue?.() || {};
    const mode = String(values.kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    const autoProgressRaw = values.kanban_auto_update_progress;
    const autoProgress = autoProgressRaw === undefined || autoProgressRaw === null || autoProgressRaw === "inherit"
      ? true
      : (autoProgressRaw === true || autoProgressRaw === "true" || autoProgressRaw === 1);
    const defaultStageQuery = JSON.stringify([
      { ma: "todo", ten: "Chua xu ly" },
      { ma: "in_progress", ten: "Dang xu ly" },
      { ma: "done", ten: "Hoan thanh" },
    ]);

    const taskMenuId = String(values.linked_data_menu_id || "").trim();
    const taskMenu = (flatParentMenus || []).find((menu) => menu.id === taskMenuId) as any;
    const taskFields = Array.isArray(taskMenu?.table) ? taskMenu.table : tableRows;
    const taskFieldSet = buildFieldNameSet(taskFields);
    const taskSpecs: KanbanFieldSpec[] = [];
    const pushTaskSpecIfMissing = (selected: string, candidates: string[], spec: KanbanFieldSpec) => {
      const matched = pickExistingFieldName(taskFields, [selected, ...candidates], "");
      if (matched && fieldExistsInSet(taskFieldSet, matched)) return;
      taskSpecs.push(spec);
    };

    if (taskMenuId) {
      pushTaskSpecIfMissing(String(values.kanban_stage_field || "").trim(), ["status", "stage", "trang_thai"], {
        name: "status",
        header: "Trang thai",
        type: "co",
        required: 1,
        search: 1,
        report: 1,
        cboQuery: defaultStageQuery,
      });
      pushTaskSpecIfMissing(String(values.kanban_title_field || "").trim(), ["title", "name", "ten", "subject"], {
        name: "title",
        header: "Tieu de",
        type: "ed",
        required: 1,
        search: 1,
        report: 1,
      });
      pushTaskSpecIfMissing(String(values.kanban_due_date_field || "").trim(), ["due_at", "deadline", "han_xu_ly"], {
        name: "due_at",
        header: "Han xu ly",
        type: "datetime",
        report: 1,
      });
      if (autoProgress) {
        pushTaskSpecIfMissing(String(values.kanban_progress_field || "").trim(), ["progress_percent", "progress", "tien_do"], {
          name: "progress_percent",
          header: "Tien do (%)",
          type: "nummeric",
          report: 1,
        });
      }
    }

    const progressMenuId = String(values.linked_progress_menu_id || "").trim();
    const progressMenu = (flatParentMenus || []).find((menu) => menu.id === progressMenuId) as any;
    const progressFields = Array.isArray(progressMenu?.table) ? progressMenu.table : progressTableRows;
    const progressFieldSet = buildFieldNameSet(progressFields);
    const progressSpecs: KanbanFieldSpec[] = [];
    const pushProgressSpecIfMissing = (selected: string, candidates: string[], spec: KanbanFieldSpec) => {
      const matched = pickExistingFieldName(progressFields, [selected, ...candidates], "");
      if (matched && fieldExistsInSet(progressFieldSet, matched)) return;
      progressSpecs.push(spec);
    };

    if (mode === "separate_table" && progressMenuId) {
      pushProgressSpecIfMissing(String(values.kanban_progress_task_ref_field || "").trim(), ["task_id", "id_task", "task_ref", "id_congviec"], {
        name: "task_id",
        header: "Ma cong viec",
        type: "ed",
        required: 1,
        search: 1,
        report: 1,
      });
      pushProgressSpecIfMissing(String(values.kanban_progress_stage_log_field || "").trim(), ["status", "stage", "trang_thai"], {
        name: "status",
        header: "Trang thai",
        type: "co",
        required: 1,
        search: 1,
        report: 1,
        cboQuery: defaultStageQuery,
      });
      pushProgressSpecIfMissing(String(values.kanban_progress_percent_log_field || "").trim(), ["progress_percent", "progress", "tien_do"], {
        name: "progress_percent",
        header: "Tien do (%)",
        type: "nummeric",
        report: 1,
      });
      pushProgressSpecIfMissing(String(values.kanban_progress_time_field || "").trim(), ["updated_at", "changed_at", "created_at", "thoi_gian_cap_nhat"], {
        name: "updated_at",
        header: "Thoi diem cap nhat",
        type: "datetime",
        required: 1,
        search: 1,
        report: 1,
      });
    }

    return {
      taskMenu,
      taskSpecs,
      progressMenu,
      progressSpecs,
      mode,
    };
  };

  const syncLinkedTaskMenuFields = (options?: { silent?: boolean; force?: boolean; linkedMenuId?: string; linkedMenu?: any }) => {
    const linkedMenuId = String(options?.linkedMenuId || formRef.current?.getFieldValue("linked_data_menu_id") || "").trim();
    if (!linkedMenuId) return;

    const linkedMenu = (options?.linkedMenu || (flatParentMenus || []).find((menu) => menu.id === linkedMenuId)) as any;
    if (!linkedMenu) return;

    const linkedTableName = String(linkedMenu.table_name || "").trim();
    const linkedTableFields = Array.isArray(linkedMenu.table) ? linkedMenu.table : [];
    const taskFieldSet = buildFieldNameSet(linkedTableFields);
    const currentValues = formRef.current?.getFieldsValue?.() || {};
    const currentKanban = parseKanbanConfig(currentValues.kanban_config);
    const nextKanban = tightenKanbanConfig(currentKanban, linkedTableName, linkedTableFields);
    nextKanban.linkedDataMenuId = linkedMenuId;

    if (linkedMenuFieldsEqual(tableRows, linkedTableFields) === false) {
      setTableRows(linkedTableFields);
    }

    if (linkedMenu.trigger && typeof linkedMenu.trigger === "object") {
      setTriggerConfig((prev) => {
        if (JSON.stringify(prev || {}) === JSON.stringify(linkedMenu.trigger || {})) return prev;
        return linkedMenu.trigger;
      });
    }

    const updates: Record<string, any> = {};
    const force = options?.force === true;
    if (linkedTableName && (force || !String(currentValues.table_name || "").trim())) {
      updates.table_name = linkedTableName;
    }

    if (force || shouldAutofillField(taskFieldSet, currentValues.kanban_stage_field)) {
      updates.kanban_stage_field = nextKanban.stageField;
    }
    if (force || shouldAutofillField(taskFieldSet, currentValues.kanban_title_field)) {
      updates.kanban_title_field = nextKanban.titleField;
    }
    if (force || shouldAutofillField(taskFieldSet, currentValues.kanban_due_date_field)) {
      updates.kanban_due_date_field = nextKanban.dueDateField;
    }

    const nextProgressField = String(nextKanban?.kpi?.progressField || "").trim();
    if (nextProgressField && (force || shouldAutofillField(taskFieldSet, currentValues.kanban_progress_field))) {
      updates.kanban_progress_field = nextProgressField;
    }

    if (force || !String(currentValues.kanban_done_stage_ids || "").trim()) {
      const doneStageIds = Array.isArray(nextKanban?.kpi?.doneStageIds) ? nextKanban.kpi.doneStageIds : [];
      updates.kanban_done_stage_ids = doneStageIds.join(",");
    }

    const strictModeSelection = currentValues.kanban_strict_mode;
    if (strictModeSelection !== undefined && strictModeSelection !== null && strictModeSelection !== "inherit") {
      nextKanban.governance = {
        ...(nextKanban.governance || {}),
        strictMode: strictModeSelection === true || strictModeSelection === "true" || strictModeSelection === 1,
      };
    }

    const autoProgressSelection = currentValues.kanban_auto_update_progress;
    if (autoProgressSelection !== undefined && autoProgressSelection !== null && autoProgressSelection !== "inherit") {
      nextKanban.kpi = {
        ...(nextKanban.kpi || {}),
        autoUpdateProgressOnStageChange: autoProgressSelection === true || autoProgressSelection === "true" || autoProgressSelection === 1,
      };
    }

    const mergedConfig = {
      ...nextKanban,
      stageField: updates.kanban_stage_field || currentValues.kanban_stage_field || nextKanban.stageField,
      titleField: updates.kanban_title_field || currentValues.kanban_title_field || nextKanban.titleField,
      dueDateField: updates.kanban_due_date_field || currentValues.kanban_due_date_field || nextKanban.dueDateField,
      kpi: {
        ...(nextKanban.kpi || {}),
        progressField: updates.kanban_progress_field || currentValues.kanban_progress_field || nextKanban?.kpi?.progressField,
        doneStageIds: parseDoneStageIdsInput(updates.kanban_done_stage_ids || currentValues.kanban_done_stage_ids || nextKanban?.kpi?.doneStageIds),
      },
    };

    updates.kanban_config = JSON.stringify(mergedConfig, null, 2);

    if (Object.keys(updates).length > 0) {
      autoSyncingRef.current = true;
      formRef.current?.setFieldsValue(updates);
      queueMicrotask(() => {
        autoSyncingRef.current = false;
      });
    }

    if (!options?.silent) {
      message.success(t("system.menu.kanbanAutoFilledFromLinkedMenus"));
    }
  };

  const syncLinkedProgressMenuFields = (options?: { silent?: boolean; force?: boolean; linkedProgressMenuId?: string; mode?: string; linkedMenu?: any }) => {
    const currentValues = formRef.current?.getFieldsValue?.() || {};
    const mode = String(options?.mode || currentValues.kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    if (mode !== "separate_table") return;

    const linkedProgressMenuId = String(options?.linkedProgressMenuId || currentValues.linked_progress_menu_id || "").trim();
    if (!linkedProgressMenuId) return;

    const progressMenu = (options?.linkedMenu || (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuId)) as any;
    if (!progressMenu) return;

    const progressFields = Array.isArray(progressMenu.table) ? progressMenu.table : [];
    const progressFieldSet = buildFieldNameSet(progressFields);
    const defaults = buildProgressTrackingDefaults(progressFields);
    const currentKanban = parseKanbanConfig(currentValues.kanban_config);
    const nextKanban = { ...(currentKanban || {}) } as Record<string, any>;

    if (linkedMenuFieldsEqual(progressTableRows, progressFields) === false) {
      setProgressTableRows(progressFields);
    }

    const force = options?.force === true;
    const updates: Record<string, any> = {};
    const mappingPairs = [
      ["kanban_progress_task_ref_field", defaults.taskRefField],
      ["kanban_progress_stage_log_field", defaults.stageField],
      ["kanban_progress_percent_log_field", defaults.progressField],
      ["kanban_progress_time_field", defaults.changedAtField],
      ["kanban_progress_note_field", defaults.noteField],
      ["kanban_progress_actor_field", defaults.actorField],
    ] as const;

    mappingPairs.forEach(([formKey, suggestedValue]) => {
      if (!suggestedValue) return;
      if (force || shouldAutofillField(progressFieldSet, currentValues[formKey])) {
        updates[formKey] = suggestedValue;
      }
    });

    nextKanban.linkedProgressMenuId = linkedProgressMenuId;
    nextKanban.progressTracking = {
      ...(nextKanban.progressTracking || {}),
      mode: "separate_table",
      progressTableName: String(progressMenu.table_name || "").trim(),
      taskRefField: updates.kanban_progress_task_ref_field || currentValues.kanban_progress_task_ref_field || defaults.taskRefField,
      stageField: updates.kanban_progress_stage_log_field || currentValues.kanban_progress_stage_log_field || defaults.stageField,
      progressField: updates.kanban_progress_percent_log_field || currentValues.kanban_progress_percent_log_field || defaults.progressField,
      changedAtField: updates.kanban_progress_time_field || currentValues.kanban_progress_time_field || defaults.changedAtField,
      noteField: updates.kanban_progress_note_field || currentValues.kanban_progress_note_field || defaults.noteField,
      actorField: updates.kanban_progress_actor_field || currentValues.kanban_progress_actor_field || defaults.actorField,
      appendOnly: true,
      writeBackMainTable: true,
    };

    updates.kanban_config = JSON.stringify(nextKanban, null, 2);

    if (Object.keys(updates).length > 0) {
      autoSyncingRef.current = true;
      formRef.current?.setFieldsValue(updates);
      queueMicrotask(() => {
        autoSyncingRef.current = false;
      });
    }

    if (!options?.silent) {
      message.success(t("system.menu.kanbanAutoFilledFromLinkedMenus"));
    }

    const unresolved = [
      nextKanban.progressTracking.taskRefField,
      nextKanban.progressTracking.stageField,
      nextKanban.progressTracking.progressField,
      nextKanban.progressTracking.changedAtField,
    ].filter((fieldName) => !fieldExistsInSet(progressFieldSet, String(fieldName || "")));

    if (unresolved.length > 0) {
      message.warning(
        `${t("system.menu.kanbanSmartAutoMappedWithGaps")} ${Array.from(new Set(unresolved)).join(", ")}`
      );
    }
  };

  const applyMissingFieldsToLinkedMenus = async (depValues?: Record<string, any>) => {
    if (!appId) {
      message.error(t("system.menu.pleaseSelectApp"));
      return;
    }

    const plan = getMissingKanbanFieldPlan(depValues);
    const taskUpdate = plan.taskMenu && plan.taskSpecs.length > 0
      ? { menu: plan.taskMenu, merged: mergeMissingFields(Array.isArray(plan.taskMenu.table) ? plan.taskMenu.table : [], plan.taskSpecs) }
      : null;
    const progressUpdate = plan.progressMenu && plan.progressSpecs.length > 0
      ? { menu: plan.progressMenu, merged: mergeMissingFields(Array.isArray(plan.progressMenu.table) ? plan.progressMenu.table : [], plan.progressSpecs) }
      : null;

    if (!taskUpdate && !progressUpdate) {
      message.info(t("system.menu.kanbanAutoCreateNoMissingFields"));
      return;
    }

    setApplyingLinkedFieldFix(true);
    try {
      if (fullMenuList && setFullMenuList) {
        const nextMenuTree = JSON.parse(JSON.stringify(fullMenuList)) as MenuItemType[];
        if (taskUpdate) {
          updateMenuInTree(nextMenuTree, taskUpdate.menu.id, { table: taskUpdate.merged.fields });
        }
        if (progressUpdate) {
          updateMenuInTree(nextMenuTree, progressUpdate.menu.id, { table: progressUpdate.merged.fields });
        }
        setFullMenuList(nextMenuTree);
        await saveMenuStruct(appId, nextMenuTree);
      } else {
        if (taskUpdate) {
          await fetchUpdateMenuItem({ ...taskUpdate.menu, table: taskUpdate.merged.fields }, appId);
        }
        if (progressUpdate) {
          await fetchUpdateMenuItem({ ...progressUpdate.menu, table: progressUpdate.merged.fields }, appId);
        }
        if (typeof refreshTable === "function") {
          await refreshTable();
        }
      }

      if (taskUpdate) {
        taskUpdate.menu.table = taskUpdate.merged.fields;
        setTableRows(taskUpdate.merged.fields);
        syncLinkedTaskMenuFields({
          silent: true,
          force: true,
          linkedMenuId: taskUpdate.menu.id,
          linkedMenu: taskUpdate.menu,
        });
      }
      if (progressUpdate) {
        progressUpdate.menu.table = progressUpdate.merged.fields;
        setProgressTableRows(progressUpdate.merged.fields);
        syncLinkedProgressMenuFields({
          silent: true,
          force: true,
          linkedProgressMenuId: progressUpdate.menu.id,
          mode: plan.mode,
          linkedMenu: progressUpdate.menu,
        });
      }

      const addedNames = [
        ...(taskUpdate?.merged.addedNames || []),
        ...(progressUpdate?.merged.addedNames || []),
      ];
      message.success(`${t("system.menu.kanbanAutoCreateSuccess")} ${addedNames.join(", ")}`);
    } catch (error) {
      console.error("Failed to auto-create linked menu fields:", error);
      message.error(t("system.menu.kanbanAutoCreateFailed"));
    } finally {
      setApplyingLinkedFieldFix(false);
    }
  };

  const handleReportUpload: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    if (!appId) {
      message.error(t("system.menu.pleaseSelectApp"));
      onError?.(new Error("Missing appId"));
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const originalName = (file as File).name;
          const normalizedName = normalizeFileName(originalName);

          const uploadData = {
            app_id: appId,
            name: normalizedName,
            src: dataUrl,
          };

          const response = await postUploadJsonWithFallback(uploadData, user.app_token || "");

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
          }

          const responseText = await response.text();
          let finalPath = "";

          try {
            const parsed = JSON.parse(responseText);
            const candidate = typeof parsed?.path === "string"
              ? parsed.path
              : (typeof parsed?.url === "string" ? parsed.url : "");
            if (candidate) {
              finalPath = candidate.startsWith("/") ? candidate : `/${candidate}`;
            }
          } catch {
            const trimmed = responseText.trim();
            if (trimmed && !/^<!doctype html>/i.test(trimmed)) {
              finalPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
            }
          }

          if (!finalPath) {
            throw new Error("Upload response invalid path");
          }

          const probe = await probeDocxTemplateUrl(finalPath, { checkExternalTargets: true, appIdHint: appId });
          if (!probe.ok) {
            throw new Error(probe.message || "Template DOCX upload không hợp lệ");
          }

          formRef.current?.setFieldsValue({ report_name: finalPath });
          syncLineItemsDocxTemplateUrl(finalPath);

          const currentTableName = String(
            formRef.current?.getFieldValue("table_name") || detailData.table_name || "",
          ).trim();
          const lowerName = String((file as File)?.name || "").toLowerCase();
          let generatedBody = "";

          if (lowerName.endsWith(".docx")) {
            try {
              const extracted = await extractDocxTemplateTokens(file as File);
              generatedBody = buildDocxDrivenReportDbBody({
                tableName: currentTableName,
                fields: tableRows,
                scalarTokens: extracted.scalarTokens,
                loopTokens: extracted.loopTokens,
              });
            } catch (parseErr) {
              console.warn("DOCX token parse failed, fallback to generic report_db", parseErr);
            }
          }

          if (!generatedBody) {
            const fallbackHeaders = (Array.isArray(tableRows) ? tableRows : [])
              .map((f) => normalizeAsciiText(String((f as any)?.f_name || "").trim().toUpperCase()))
              .filter(Boolean)
              .slice(0, 6);
            const tableHeaders = fallbackHeaders.length > 0
              ? fallbackHeaders
              : ["COL_1", "COL_2", "COL_3", "COL_4", "COL_5", "COL_6"];
            generatedBody = buildAutoReportDbBody({
              tableName: currentTableName,
              fields: tableRows,
              layout: {} as PdfLayoutSpec,
              blueprint: {
                title: "BAO CAO",
                headerLines: ["Thong tin 1: {hdr_1}", "Thong tin 2: {hdr_2}"],
                tableHeaders,
                tableRowPlaceholders: buildTablePlaceholders(tableHeaders),
                signatureLabels: ["Ky 1: {sig_1}", "Ky 2: {sig_2}"],
                noteLines: ["Tong cong: {tong_cong}", "Ghi chu: {ghi_chu}"],
                pageSizeTwip: { width: 11906, height: 16838 },
                pageMarginsTwip: { top: 920, right: 920, bottom: 920, left: 920 },
                baseFontName: "Times New Roman",
                baseFontSizeHalfPt: 24,
                tableColWidthsTwip: computeDocxColumnWidths(tableHeaders),
                titleAlign: "center",
                headerAlign: "left",
              },
            });
          }

          let didSetReportDb = false;
          setTriggerConfig((prev) => {
            const currentReportDb = String((prev as any)?.report_db || "").trim();
            if (currentReportDb) return prev;
            didSetReportDb = true;

            return {
              ...(prev || {}),
              report_db: csmEncrypt(generatedBody),
            };
          });

          onSuccess?.("ok");
          message.success(t("system.menu.uploadReportSuccess", { file: normalizedName }));
          if (didSetReportDb) {
            message.info("Đã tự sinh trigger report_db mặc định vì trước đó chưa có.");
          }
        } catch (uploadErr) {
          console.error("Upload error:", uploadErr);
          onError?.(uploadErr as Error);
          message.error(t("system.menu.uploadReportFailed"));
        }
      };
      reader.onerror = () => {
        onError?.(new Error("FileReader failed"));
      };
      reader.readAsDataURL(file as File);
    } catch (err) {
      onError?.(err as Error);
      message.error(t("system.menu.readFileFailed"));
    }
  };

  const handleGenerateReportFromPdf: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    if (!appId) {
      message.error(t("system.menu.pleaseSelectApp"));
      onError?.(new Error("Missing appId"));
      return;
    }

    try {
      setGeneratingReportFromPdf(true);
      const sourceFile = file as File;
      const sample = await readPrintSampleFile(sourceFile, 3);
      const pdfDataUrl = await readFileAsDataUrl(sourceFile);

      const sourcePdfName = normalizeFileName(`${safeTemplateToken(sample.pdfLayout.docTitle || "bao_cao")}_${Date.now()}_source.pdf`);
      const sourcePdfPath = await uploadReportAsset({
        appId,
        token: user.app_token || "",
        fileName: sourcePdfName,
        dataUrl: pdfDataUrl,
      });

      const backendExtract = await extractPdfLayoutWithBackend({ appId, sourcePdfPath });
      const effectiveLayout = mergePdfLayoutSpec(sample.pdfLayout, backendExtract.layout);
      const effectiveLineBoxes = (backendExtract.lineBoxes || []).length > 0
        ? backendExtract.lineBoxes
        : (Array.isArray(sample.pdfLineBoxes) ? sample.pdfLineBoxes : []);

      const tableName = String(formRef.current?.getFieldValue("table_name") || detailData.table_name || "").trim();
      const exactOverlaySeeds = buildPdfOverlaySeedItems({
        lineBoxes: effectiveLineBoxes,
        fields: tableRows,
      });
      setPdfOverlayPreviewUrls(Array.isArray(sample.previewUrls) ? sample.previewUrls : []);

      const overlayPlan = await buildPdfOverlayPlanWithLocalAi({
        appId,
        layout: effectiveLayout,
        fields: tableRows,
        fallbackItems: exactOverlaySeeds,
      });

      const designSpec = buildPdfReportDesignSpec(
        effectiveLayout,
        overlayPlan.overlays,
        tableRows,
        Array.isArray(effectiveLayout?.orderedLines) ? effectiveLayout.orderedLines : [],
      );
      const reportDbBody = buildAutoReportDbBody({
        tableName,
        fields: tableRows,
        layout: effectiveLayout,
        designSpec,
      });

      formRef.current?.setFieldsValue({ report_name: "" });
      if (!String(formRef.current?.getFieldValue("orientation") || "").trim()) {
        formRef.current?.setFieldsValue({ orientation: "p" });
      }
      if (!Number(formRef.current?.getFieldValue("p_width") || 0)) {
        formRef.current?.setFieldsValue({ p_width: 8.27 });
      }
      if (!Number(formRef.current?.getFieldValue("p_height") || 0)) {
        formRef.current?.setFieldsValue({ p_height: 11.69 });
      }

      if (overlayPlan.status) {
        message.info(overlayPlan.status);
      }
      if (backendExtract.status) {
        message.info(backendExtract.status);
      }
      if ((backendExtract.imageHints || []).length > 0) {
        message.info(`Backend đã trích ${backendExtract.imageHints.length} ảnh/logo từ PDF mẫu.`);
      }

      setPdfOverlayDraft(JSON.stringify(overlayPlan.overlays, null, 2));
      setPdfOverlayEditItems(overlayPlan.overlays);
      setPdfOverlayPending({
        sourcePdfPath,
        tableName,
        layout: effectiveLayout,
        overlayItems: overlayPlan.overlays,
        designSpec,
      });
      setPdfCompareResult(null);
      setPdfOverlayModalOpen(true);

      message.success(
        t(
          "system.menu.reportAutoGeneratedFromPdf",
          "Đã sinh mẫu báo cáo động từ PDF mẫu. Hãy kiểm tra preview rồi bấm Lưu mẫu báo cáo động để lưu trigger report_db.",
        ),
      );
      onSuccess?.("ok");
    } catch (error: any) {
      console.error("Generate report from PDF failed:", error);
      message.error(error?.message || t("system.menu.uploadReportFailed"));
      onError?.(error as Error);
    } finally {
      setGeneratingReportFromPdf(false);
    }
  };

  const handleReportTemplateUpload: UploadProps["customRequest"] = async (options) => {
    const fileName = String((options.file as File)?.name || "").toLowerCase();
    if (fileName.endsWith(".pdf")) {
      await handleGenerateReportFromPdf(options);
      return;
    }

    options.onError?.(new Error("Chỉ hỗ trợ file PDF mẫu cho mẫu báo cáo"));
    message.error("Chỉ hỗ trợ file PDF mẫu cho mẫu báo cáo");
  };

  const handleApplyPdfOverlayDraft = useCallback(() => {
    if (!pdfOverlayPending) {
      message.warning("Chưa có overlay để áp dụng");
      return;
    }

    const overlayItems = pdfOverlayEditItems
      .map((item) => ({
        page: Number(item?.page || 1),
        x: Number(item?.x || 0),
        y: Number(item?.y || 0),
        width: Number(item?.width || 0) || undefined,
        align: normalizeOverlayAlign(item?.align),
        fontSize: Number(item?.fontSize || 11),
        fontName: sanitizeTemplateLine(item?.fontName || "Helvetica") || "Helvetica",
        color: sanitizeTemplateLine(item?.color || "#000000") || "#000000",
        bold: Boolean(item?.bold),
        italic: Boolean(item?.italic),
        opacity: Number(item?.opacity || 1),
        rotate: Number(item?.rotate || 0),
        text: sanitizeTemplateLine(item?.text || ""),
      }))
      .filter((item) => item.text);

    if (overlayItems.length === 0) {
      message.error("Overlay JSON không hợp lệ hoặc không có vị trí nào để áp dụng");
      return;
    }

    const designSpec = buildPdfReportDesignSpec(
      pdfOverlayPending.layout,
      overlayItems,
      tableRows,
      Array.isArray(pdfOverlayPending.layout?.orderedLines) ? pdfOverlayPending.layout.orderedLines : [],
    );
    const reportDbBody = buildAutoReportDbBody({
      tableName: pdfOverlayPending.tableName,
      fields: tableRows,
      layout: pdfOverlayPending.layout,
      designSpec,
    });

    setTriggerConfig((prev) => ({
      ...(prev || {}),
      report_db: csmEncrypt(reportDbBody),
      report_design_spec: csmEncrypt(JSON.stringify(designSpec, null, 2)),
    }));
    setPdfOverlayPending((prev) => prev ? { ...prev, overlayItems, designSpec } : prev);
    setPdfCompareResult(null);
    setPdfOverlayModalOpen(false);
    message.success("Đã lưu trigger report_db cho mẫu báo cáo động");
  }, [pdfOverlayEditItems, pdfOverlayPending, tableRows]);

  const handleCompareWithSourcePdf = useCallback(async () => {
    if (!pdfOverlayPending || !previewDesignSpec || !appId) {
      message.warning("Thiếu dữ liệu để so sánh mẫu PDF");
      return;
    }

    try {
      setComparingPdfTemplate(true);
      const previewContext = buildPdfOverlayPreviewContext(tableRows, pdfOverlayPending.layout);

      const previewRes = await fetch("/api/ai-local/report/render-template/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": user.app_token || "",
        },
        body: JSON.stringify({
          appId,
          reportDesignSpec: previewDesignSpec,
          data: previewContext,
          saveToDisk: false,
          returnBase64: true,
          outputName: `compare_preview_${Date.now()}.pdf`,
        }),
      });

      const previewJson = await previewRes.json().catch(() => ({}));
      const previewResult = (previewJson?.result || previewJson || {}) as Record<string, any>;
      if (!previewRes.ok || !previewResult?.success || !String(previewResult?.pdfBase64 || "").trim()) {
        throw new Error(String(previewResult?.message || "Không render được PDF preview để so sánh"));
      }

      const compareRes = await fetch("/api/ai-local/report/render-template/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": user.app_token || "",
        },
        body: JSON.stringify({
          samplePdfPath: pdfOverlayPending.sourcePdfPath,
          renderedPdfBase64: previewResult.pdfBase64,
        }),
      });
      const compareJson = await compareRes.json().catch(() => ({}));
      const compareResult = (compareJson?.result || compareJson || {}) as Record<string, any>;
      if (!compareRes.ok || !compareResult?.success) {
        throw new Error(String(compareResult?.message || "So sánh PDF thất bại"));
      }

      const coverage = Number(compareResult.textCoveragePercent || 0);
      const p95 = Number(compareResult?.positionDriftMm?.p95 || 0);
      setPdfCompareResult({
        qualityGate: String(compareResult.qualityGate || ""),
        textCoveragePercent: coverage,
        matchedLines: Number(compareResult.matchedLines || 0),
        sampleLineCount: Number(compareResult.sampleLineCount || 0),
        renderedLineCount: Number(compareResult.renderedLineCount || 0),
        positionDriftMm: {
          avg: Number(compareResult?.positionDriftMm?.avg || 0),
          p95,
          max: Number(compareResult?.positionDriftMm?.max || 0),
        },
        missingSampleLines: Array.isArray(compareResult.missingSampleLines) ? compareResult.missingSampleLines : [],
        unexpectedRenderLines: Array.isArray(compareResult.unexpectedRenderLines) ? compareResult.unexpectedRenderLines : [],
      });

      if (coverage >= 80 && p95 <= 6) {
        message.success(`So sánh đạt: coverage ${coverage.toFixed(1)}%, drift p95 ${p95.toFixed(2)}mm`);
      } else {
        message.warning(`Cần tinh chỉnh: coverage ${coverage.toFixed(1)}%, drift p95 ${p95.toFixed(2)}mm`);
      }
    } catch (error: any) {
      message.error(error?.message || "So sánh PDF thất bại");
    } finally {
      setComparingPdfTemplate(false);
    }
  }, [appId, pdfOverlayPending, previewDesignSpec, tableRows, user.app_token]);

  const updatePdfOverlayItem = useCallback((index: number, patch: Partial<PdfOverlayPlanItem>) => {
    setPdfOverlayEditItems((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }, []);

  const addPdfOverlayItem = useCallback(() => {
    setPdfOverlayEditItems((prev) => ([
      ...prev,
      { page: 1, x: 40, y: 40, fontSize: 11, fontName: "Helvetica", color: "#000000", opacity: 1, rotate: 0, text: "{field}" },
    ]));
  }, []);

  const removePdfOverlayItem = useCallback((index: number) => {
    setPdfOverlayEditItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleOpenCurrentReportTemplate = useCallback(() => {
    const currentPath = String(formRef.current?.getFieldValue("report_name") || "").trim();
    if (!currentPath) {
      message.warning("Chưa có đường dẫn report_name");
      return;
    }

    const candidates = buildReportTemplateCandidates(currentPath, appId);
    const target = candidates[0] || currentPath;
    window.open(target, "_blank", "noopener,noreferrer");
  }, [appId]);

  const handleDownloadCurrentReportTemplate = useCallback(async () => {
    const currentPath = String(formRef.current?.getFieldValue("report_name") || "").trim();
    if (!currentPath) {
      message.warning("Chưa có đường dẫn report_name");
      return;
    }

    setDownloadingReportTemplate(true);
    try {
      const candidates = buildReportTemplateCandidates(currentPath, appId);
      let selectedBlob: Blob | null = null;
      let selectedFileName = "template.pdf";

      for (const candidate of candidates) {
        try {
          const res = await fetch(candidate, { cache: "no-store" });
          if (!res.ok) continue;
          const contentType = String(res.headers.get("content-type") || "").toLowerCase();
          if (!contentType.includes("pdf") && !candidate.toLowerCase().endsWith(".pdf")) continue;

          const ab = await res.arrayBuffer();
          selectedBlob = new Blob([ab], { type: "application/pdf" });
          const pathName = candidate.split("?")[0].split("/").pop() || "template.pdf";
          selectedFileName = /\.pdf$/i.test(pathName) ? pathName : `${pathName}.pdf`;
          break;
        } catch {
          // try next candidate
        }
      }

      if (!selectedBlob) {
        throw new Error("Không tải được mẫu PDF từ report_name hiện tại");
      }

      const url = URL.createObjectURL(selectedBlob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = selectedFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        URL.revokeObjectURL(url);
      }

      message.success("Đã tải mẫu PDF để đối chiếu");
    } catch (error: any) {
      message.error(error?.message || "Không tải được mẫu PDF");
    } finally {
      setDownloadingReportTemplate(false);
    }
  }, [appId]);

  const onFinish = async (values: MenuItemType) => {
    if (!appId) {
      window.$message?.error(t("system.menu.pleaseSelectApp"));
      return false;
    }

    // Sử dụng parentId từ form values, nếu không có thì từ detailData
    let parentId = values.parentId !== undefined ? values.parentId : detailData.parentId;
    if (parentId === undefined) parentId = ""; // Đảm bảo parentId luôn có giá trị
    parentId = parentId?.trim() || ""; // Trim để tránh space

    const payload: MenuItemType = {
      ...detailData,
      ...values,
      table: tableRows,
      trigger: triggerConfig,
      parentId, // Luôn set parentId
    };

    const isKanbanMenu = Number(values.type_form ?? detailData.type_form ?? payload.type_form ?? 0) === 6;
    const isLineItemsMenu = Number(values.type_form ?? detailData.type_form ?? payload.type_form ?? 0) === 7;

    if (isLineItemsMenu) {
      if (!String(payload.table_name || "").trim()) {
        window.$message?.error(t("system.menu.lineItemsTableRequired"));
        return false;
      }
      if (!Array.isArray(lineItemsConfig.line_items_columns) || lineItemsConfig.line_items_columns.length === 0) {
        window.$message?.error(t("system.menu.lineItemsColumnsRequired"));
        return false;
      }
      mergeLineItemsConfigIntoPayload(payload as Record<string, any>, lineItemsConfig);
    }

    const linkedDataMenuIdRaw = String((values as any).linked_data_menu_id || "").trim();
    const progressTrackingMode = String((values as any).kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    const linkedProgressMenuIdRaw = String((values as any).linked_progress_menu_id || "").trim();
    const progressTaskRefFieldRaw = String((values as any).kanban_progress_task_ref_field || "").trim();
    const stageFieldRaw = String((values as any).kanban_stage_field || "").trim();
    const progressFieldRaw = String((values as any).kanban_progress_field || "").trim();
    const autoProgressRaw = (values as any).kanban_auto_update_progress;
    const autoUpdateProgress = autoProgressRaw === undefined || autoProgressRaw === null || autoProgressRaw === "inherit"
      ? true
      : (autoProgressRaw === true || autoProgressRaw === "true" || autoProgressRaw === 1);

    if (isKanbanMenu && !linkedDataMenuIdRaw) {
      window.$message?.error(t("system.menu.kanbanLinkedMenuRequired"));
      return false;
    }

    if (isKanbanMenu && autoUpdateProgress) {
      if (!stageFieldRaw) {
        window.$message?.error(t("system.menu.kanbanStageFieldRequired"));
        return false;
      }
      if (!progressFieldRaw) {
        window.$message?.error(t("system.menu.kanbanProgressFieldRequired"));
        return false;
      }
    }

    if (isKanbanMenu && progressTrackingMode === "separate_table") {
      if (!linkedProgressMenuIdRaw) {
        window.$message?.error(t("system.menu.kanbanProgressLinkedMenuRequired") || "Vui lòng chọn menu bảng tiến độ");
        return false;
      }
      if (!progressTaskRefFieldRaw) {
        window.$message?.error(t("system.menu.kanbanProgressTaskRefFieldRequired") || "Vui lòng chọn field tham chiếu công việc ở bảng tiến độ");
        return false;
      }
    }

    const isSystemUserMenu = (values.path || detailData.path) === "/system/user";
    if (isSystemUserMenu) {
      payload.system_user_modes = {
        main: {
          table_name: payload.table_name,
          table: tableRows,
          trigger: triggerConfig,
          type_form: payload.type_form,
          row_type_edit: payload.row_type_edit,
          g_readonly: payload.g_readonly,
        },
        sub: {
          ...subUserModeConfig,
          table_name: String(subUserModeConfig.table_name || "csm_group_members").trim() || "csm_group_members",
          table: Array.isArray(subUserModeConfig.table) ? subUserModeConfig.table : [],
          trigger: subUserModeConfig.trigger && typeof subUserModeConfig.trigger === "object" ? subUserModeConfig.trigger : {},
          type_form: subUserModeConfig.type_form ?? payload.type_form ?? 1,
          row_type_edit: subUserModeConfig.row_type_edit ?? payload.row_type_edit ?? 0,
          g_readonly: subUserModeConfig.g_readonly ?? false,
        },
      };
    }

    if (typeof values.kanban_config === "string") {
      const trimmed = values.kanban_config.trim();
      if (trimmed) {
        const parsedKanban = parseKanbanConfig(trimmed);
        if (!parsedKanban) {
          window.$message?.error(t("system.menu.kanbanConfigInvalidJson"));
          return false;
        }

        const sourceTableName = String(values.table_name || payload.table_name || parsedKanban.tableName || "").trim();
        const normalizedKanban = tightenKanbanConfig(parsedKanban, sourceTableName, tableRows);

        const strictModeSelection = (values as any).kanban_strict_mode;
        if (strictModeSelection !== undefined && strictModeSelection !== null && strictModeSelection !== "inherit") {
          normalizedKanban.governance = {
            ...(normalizedKanban.governance || {}),
            strictMode: strictModeSelection === true || strictModeSelection === "true" || strictModeSelection === 1,
          };
        }

        const stageFieldOverride = String((values as any).kanban_stage_field || "").trim();
        if (stageFieldOverride) {
          normalizedKanban.stageField = pickExistingFieldName(tableRows, [stageFieldOverride], stageFieldOverride);
        }

        const titleFieldOverride = String((values as any).kanban_title_field || "").trim();
        if (titleFieldOverride) {
          normalizedKanban.titleField = pickExistingFieldName(tableRows, [titleFieldOverride], titleFieldOverride);
        }

        const dueDateFieldOverride = String((values as any).kanban_due_date_field || "").trim();
        if (dueDateFieldOverride) {
          normalizedKanban.dueDateField = pickExistingFieldName(tableRows, [dueDateFieldOverride], dueDateFieldOverride);
          normalizedKanban.timeline = {
            ...(normalizedKanban.timeline || {}),
            primaryDateField: normalizedKanban.dueDateField,
          };
        }

        const progressFieldOverride = String((values as any).kanban_progress_field || "").trim();
        if (!normalizedKanban.kpi || typeof normalizedKanban.kpi !== "object") {
          normalizedKanban.kpi = {};
        }
        const autoProgressSelection = (values as any).kanban_auto_update_progress;
        if (autoProgressSelection !== undefined && autoProgressSelection !== null && autoProgressSelection !== "inherit") {
          normalizedKanban.kpi.autoUpdateProgressOnStageChange = autoProgressSelection === true || autoProgressSelection === "true" || autoProgressSelection === 1;
        } else if (normalizedKanban.kpi.autoUpdateProgressOnStageChange == null) {
          normalizedKanban.kpi.autoUpdateProgressOnStageChange = true;
        }
        if (progressFieldOverride) {
          normalizedKanban.kpi.progressField = pickExistingFieldName(tableRows, [progressFieldOverride], progressFieldOverride);
        }

        if (normalizedKanban.kpi.autoUpdateProgressOnStageChange && !normalizedKanban.kpi.progressField) {
          window.$message?.error(t("system.menu.kanbanProgressFieldRequired"));
          return false;
        }

        const doneStageIds = parseDoneStageIdsInput((values as any).kanban_done_stage_ids);
        if (doneStageIds.length > 0) {
          normalizedKanban.kpi.doneStageIds = doneStageIds;
        }

        const refreshedStages = extractStagesFromTableFields(tableRows, String(normalizedKanban.stageField || ""));
        if (refreshedStages.length > 0) {
          normalizedKanban.stages = refreshedStages;
        }
        if (Array.isArray(normalizedKanban.stages) && normalizedKanban.stages.length > 0) {
          const doneIds = Array.isArray(normalizedKanban.kpi.doneStageIds) ? normalizedKanban.kpi.doneStageIds : [];
          normalizedKanban.kpi.progressByStage = buildProgressByStage(normalizedKanban.stages, doneIds);
        }

        const linkedDataMenuId = String((values as any).linked_data_menu_id || "").trim();
        if (linkedDataMenuId) {
          normalizedKanban.linkedDataMenuId = linkedDataMenuId;
        }

        const progressTracking: Record<string, any> = {
          mode: progressTrackingMode === "separate_table" ? "separate_table" : "single_table",
          writeBackMainTable: true,
          appendOnly: true,
        };

        if (progressTracking.mode === "separate_table") {
          const linkedProgressMenu = (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuIdRaw) as any;
          const linkedProgressTableName = String(linkedProgressMenu?.table_name || (values as any).kanban_progress_table_name || "").trim();
          if (linkedProgressMenuIdRaw) normalizedKanban.linkedProgressMenuId = linkedProgressMenuIdRaw;
          if (linkedProgressTableName) progressTracking.progressTableName = linkedProgressTableName;

          const fallbackProgressFields = Array.isArray(progressTableRows) ? progressTableRows : [];
          const defaults = buildProgressTrackingDefaults(fallbackProgressFields);
          progressTracking.taskRefField = String((values as any).kanban_progress_task_ref_field || defaults.taskRefField || "task_id").trim() || "task_id";
          progressTracking.stageField = String((values as any).kanban_progress_stage_log_field || defaults.stageField || "status").trim() || "status";
          progressTracking.progressField = String((values as any).kanban_progress_percent_log_field || defaults.progressField || "progress_percent").trim() || "progress_percent";
          progressTracking.changedAtField = String((values as any).kanban_progress_time_field || defaults.changedAtField || "updated_at").trim() || "updated_at";
          progressTracking.noteField = String((values as any).kanban_progress_note_field || defaults.noteField || "note").trim() || "note";
          progressTracking.actorField = String((values as any).kanban_progress_actor_field || defaults.actorField || "updated_by").trim() || "updated_by";

          if (!normalizedKanban.kpi?.progressField && progressTracking.progressField) {
            normalizedKanban.kpi.progressField = progressTracking.progressField;
          }
        }

        normalizedKanban.progressTracking = progressTracking;

        payload.kanban_config = normalizedKanban;
      }
      else {
        payload.kanban_config = undefined;
      }
    }

    if (values.config) {
      try {
        const parsed = JSON.parse(values.config);
        if (parsed && typeof parsed === "object") {
          Object.assign(payload, parsed);
        }
      } catch (err) {
        console.warn("Config JSON parse failed, storing raw string", err);
      }
      payload.config = values.config;
    }

    try {
      if (saveMenuApp && fullMenuList && setFullMenuList) {
        // Tree view: update local tree and save
        let success = false;
        if (detailData.id) {
          // Update existing
          success = updateMenuInTree(fullMenuList, detailData.id, payload);
        } else {
          // Add new
          addMenuToTree(fullMenuList, payload as any);
          success = true;
        }
        if (!success) {
          window.$message?.error(t("system.menu.menuNotFoundForUpdate"));
          return false;
        }
        setFullMenuList([...fullMenuList]);

        // Save to backend
        await saveMenuApp();

        window.$message?.success(detailData.id ? t("common.updateSuccess") : t("common.addSuccess"));
        onCloseChange();
        return true;
      } else {
        // Table view: use API calls
        if (detailData.id) {
          await fetchUpdateMenuItem(payload, appId);
          window.$message?.success(t("common.updateSuccess"));
        } else {
          await fetchAddMenuItem(payload, appId);
          window.$message?.success(t("common.addSuccess"));
        }
        if (typeof refreshTable === 'function') {
          await refreshTable();
        }
        onCloseChange();
        return true;
      }
    } catch (err) {
      window.$message?.error(t("common.saveFailed"));
      return false;
    }
  };

  useEffect(() => {
    if (!open || !formRef.current || !detailData) return;

    const nextData = { ...detailData } as any;
    const configText = buildConfigString(detailData);
    if (configText) {
      nextData.config = configText;
    }
    
    // Đảm bảo các giá trị được convert về đúng type
    // Select/Dropdown fields - convert to number
    nextData.type_form = resolveMenuTypeForm(nextData);
    nextData.row_type_edit = normalizeMenuSelectNumber(nextData.row_type_edit, 0);
    nextData.type_menu = normalizeMenuSelectNumber(nextData.type_menu, 0);
    if (nextData.m_show !== undefined && nextData.m_show !== null) {
      nextData.m_show = Number(nextData.m_show);
    }
      
      // Boolean fields
      if (nextData.dev !== undefined && nextData.dev !== null && typeof nextData.dev === 'string') {
        nextData.dev = nextData.dev === 'true' || nextData.dev === '1' || nextData.dev === true;
      }
      if (nextData.g_readonly !== undefined && nextData.g_readonly !== null && typeof nextData.g_readonly === 'string') {
        nextData.g_readonly = nextData.g_readonly === 'true' || nextData.g_readonly === '1' || nextData.g_readonly === true;
      }
      
      // Numeric fields
      if (nextData.table_pagesize !== undefined && nextData.table_pagesize !== null) {
        nextData.table_pagesize = Number(nextData.table_pagesize);
      }
      if (nextData.p_width !== undefined && nextData.p_width !== null) {
        nextData.p_width = Number(nextData.p_width);
      }
      if (nextData.p_height !== undefined && nextData.p_height !== null) {
        nextData.p_height = Number(nextData.p_height);
      }
      const parsedKanbanOnLoad = parseKanbanConfig(nextData.kanban_config);
      if (parsedKanbanOnLoad) {
        const sourceFields = Array.isArray(nextData.table) ? nextData.table : [];
        const tightenedKanbanOnLoad = tightenKanbanConfig(
          parsedKanbanOnLoad,
          String(nextData.table_name || parsedKanbanOnLoad.tableName || "").trim(),
          sourceFields,
        );
        if (tightenedKanbanOnLoad?.governance && typeof tightenedKanbanOnLoad.governance === "object") {
          nextData.kanban_strict_mode = tightenedKanbanOnLoad.governance.strictMode;
        }
        if (tightenedKanbanOnLoad?.linkedDataMenuId) {
          nextData.linked_data_menu_id = tightenedKanbanOnLoad.linkedDataMenuId;
        }
        nextData.kanban_auto_update_progress = tightenedKanbanOnLoad?.kpi?.autoUpdateProgressOnStageChange;
        nextData.kanban_stage_field = tightenedKanbanOnLoad.stageField;
        nextData.kanban_title_field = tightenedKanbanOnLoad.titleField;
        nextData.kanban_due_date_field = tightenedKanbanOnLoad.dueDateField;
        nextData.kanban_progress_field = tightenedKanbanOnLoad?.kpi?.progressField;
        nextData.kanban_progress_tracking_mode = tightenedKanbanOnLoad?.progressTracking?.mode || "single_table";
        nextData.linked_progress_menu_id = tightenedKanbanOnLoad?.linkedProgressMenuId;
        nextData.kanban_progress_task_ref_field = tightenedKanbanOnLoad?.progressTracking?.taskRefField;
        nextData.kanban_progress_stage_log_field = tightenedKanbanOnLoad?.progressTracking?.stageField;
        nextData.kanban_progress_percent_log_field = tightenedKanbanOnLoad?.progressTracking?.progressField;
        nextData.kanban_progress_time_field = tightenedKanbanOnLoad?.progressTracking?.changedAtField;
        nextData.kanban_progress_note_field = tightenedKanbanOnLoad?.progressTracking?.noteField;
        nextData.kanban_progress_actor_field = tightenedKanbanOnLoad?.progressTracking?.actorField;
        nextData.kanban_done_stage_ids = Array.isArray(tightenedKanbanOnLoad?.kpi?.doneStageIds)
          ? tightenedKanbanOnLoad.kpi.doneStageIds.join(",")
          : "";
        nextData.kanban_config = JSON.stringify(tightenedKanbanOnLoad, null, 2);

        const linkedProgressMenuId = String(tightenedKanbanOnLoad?.linkedProgressMenuId || nextData.linked_progress_menu_id || "").trim();
        if (linkedProgressMenuId) {
          const linkedProgressMenu = (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuId) as any;
          if (linkedProgressMenu && Array.isArray(linkedProgressMenu.table)) {
            setProgressTableRows(linkedProgressMenu.table);
          }
        }
      }

      const systemUserModes = parseSystemUserModes(detailData);
      setSubUserModeConfig({
        ...getDefaultSystemUserModeConfig("sub", t),
        ...(systemUserModes.sub || {}),
      });
      
      setTableRows(Array.isArray(detailData.table) ? detailData.table : []);
      setLineItemsConfig(extractLineItemsConfig(nextData));
      setTriggerConfig(parseTriggerConfig(detailData.trigger));
      // Set fields except parentId since initialValues has it
      const { parentId, ...fieldsToSet } = nextData;
      formRef.current.setFieldsValue(fieldsToSet);
  }, [detailData, flatParentMenus, open]);

  useEffect(() => {
    if (!open && formRef.current) {
      formRef.current.resetFields();
      setTableRows([]);
      setProgressTableRows([]);
      setTriggerConfig({});
      setSubUserModeConfig(getDefaultSystemUserModeConfig("sub", t));
    }
  }, [open, t]);

  // Load sys_autos (dynamic code templates) when modal opens
  useEffect(() => {
    if (!open) return;
    
    const loadAutoCode = async () => {
      try {
        setLoadingAutoCode(true);
        const where = andWhere([
          { field: "p_type", type: "eq", value: 0 } // Only load p_type=0 (code templates)
        ]);
        
        const response = await getTableData<any>({
          app_id: "csm",
          obj_name: "sys_autos",
          where,
          take: 100
        });
        
        const rows = (response as any)?.rows || (response as any)?.data || [];
        const options = rows
          .filter((r: any) => r?.p_name)
          .map((r: any) => ({
            label: r.p_name,
            value: r.p_name
          }));
        
        setAutoCodeOptions(options);
      } catch (err) {
        console.error("Failed to load auto code templates:", err);
        setAutoCodeOptions([]);
      } finally {
        setLoadingAutoCode(false);
      }
    };
    
    loadAutoCode();
  }, [open]);

  const linkRelatedDataMenu = () => {
    const linkedMenuId = String(formRef.current?.getFieldValue("linked_data_menu_id") || "").trim();
    if (!linkedMenuId) {
      message.warning(t("system.menu.kanbanSelectLinkedMenu"));
      return;
    }

    const linkedMenu = (flatParentMenus || []).find((menu) => menu.id === linkedMenuId) as any;
    if (!linkedMenu) {
      message.error(t("system.menu.kanbanLinkedMenuNotFound"));
      return;
    }

    syncLinkedTaskMenuFields({ force: true });

    message.success(t("system.menu.kanbanGeneratedFromLinkedMenu"));
  };

  const linkProgressDataMenu = () => {
    const linkedProgressMenuId = String(formRef.current?.getFieldValue("linked_progress_menu_id") || "").trim();
    if (!linkedProgressMenuId) {
      message.warning(t("system.menu.kanbanProgressSelectLinkedMenu") || "Vui lòng chọn menu bảng tiến độ");
      return;
    }

    const progressMenu = (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuId) as any;
    if (!progressMenu) {
      message.error(t("system.menu.kanbanProgressLinkedMenuNotFound") || "Không tìm thấy menu bảng tiến độ");
      return;
    }

    formRef.current?.setFieldsValue({
      kanban_progress_tracking_mode: "separate_table",
    });
    syncLinkedProgressMenuFields({ force: true });

    message.success(t("system.menu.kanbanProgressGeneratedFromLinkedMenu") || "Đã liên kết bảng cập nhật tiến độ");
  };

  return (
    <ModalForm<MenuItemType>
      title={title}
      open={open}
      onOpenChange={(visible: boolean) => {
        if (!visible) {
          onCloseChange();
          formRef.current?.resetFields();
        }
      }}
      labelCol={{ md: 5, xl: 3 }}
      layout="horizontal"
      labelAlign="left"
      formRef={formRef}
      autoFocusFirstInput
      modalProps={{ destroyOnClose: true }}
      grid
      width={{ xl: 800, md: 500 }}
      onValuesChange={(changedValues) => {
        if (autoSyncingRef.current) return;

        if (Object.prototype.hasOwnProperty.call(changedValues, "linked_data_menu_id")) {
          syncLinkedTaskMenuFields({ silent: true });
        }

        if (
          Object.prototype.hasOwnProperty.call(changedValues, "linked_progress_menu_id") ||
          Object.prototype.hasOwnProperty.call(changedValues, "kanban_progress_tracking_mode")
        ) {
          syncLinkedProgressMenuFields({ silent: true });
        }
      }}
      onFinish={onFinish}
      key={detailData.id || 'new'}
      initialValues={{
        data_scope_override: "NONE",
        ...detailData,
        ...resolvedMenuFormFields,
      }}
    >

    {/* Group các trường đa ngôn ngữ */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t("system.menu.multilingualGroup")}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <Tabs
          defaultActiveKey="vi"
          style={{ marginBottom: 0, paddingLeft: 8, paddingRight: 8 }}
          tabBarGutter={32}
          centered
        >
          <Tabs.TabPane tab="Tiếng Việt (VI)" key="vi">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.name') || 'Tên Menu'}
                  <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
                </div>
                <ProFormText
                  name="label"
                  noStyle
                  rules={[{ required: true, message: t("form.required") }]}
                  fieldProps={{
                    placeholder: t("system.menu.labelViPlaceholder"),
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.routeName') || 'Tên đường dẫn'}
                </div>
                <ProFormText
                  name="name"
                  noStyle
                  fieldProps={{
                    placeholder: t("system.menu.nameViPlaceholder"),
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="English (EN)" key="en">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.name') || 'Menu Name'}
                </div>
                <ProFormText
                  name="label_en"
                  noStyle
                  fieldProps={{
                    placeholder: t("system.menu.labelEnPlaceholder"),
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.routeName') || 'Route Name'}
                </div>
                <ProFormText
                  name="name_en"
                  noStyle
                  fieldProps={{
                    placeholder: t("system.menu.nameEnPlaceholder"),
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="中文 (ZH)" key="zh">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.name') || '菜单名称'}
                </div>
                <ProFormText
                  name="label_zh"
                  noStyle
                  fieldProps={{
                    placeholder: t("system.menu.labelZhPlaceholder"),
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.routeName') || '路由名称'}
                </div>
                <ProFormText
                  name="name_zh"
                  noStyle
                  fieldProps={{
                    placeholder: t("system.menu.nameZhPlaceholder"),
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>

    {/* ...existing code... */}

    {/* Bố cục cài đặt hiển thị dữ liệu */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t("system.menu.dataDisplaySettings")}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          {/* Thêm field type_form để chọn hình thức hiển thị */}
          <div>
            <MenuFieldLabel i18nKey="system.menu.typeForm" required />
            <ProFormSelect
              name="type_form"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.typeFormPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.typeForm}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.typeFormHint")}
            </div>
          </div>

          {/* Thêm field row_type_edit để chọn kiểu chỉnh sửa */}
          <div>
            <MenuFieldLabel i18nKey="system.menu.rowTypeEdit" required />
            <ProFormSelect
              name="row_type_edit"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.rowTypeEditPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.rowTypeEdit}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.rowTypeEditHint")}
            </div>
          </div>

          {/* Thêm field type_menu để chọn kiểu menu */}
          <div>
            <MenuFieldLabel i18nKey="system.menu.typeMenu" required />
            <ProFormSelect
              name="type_menu"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.typeMenuPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.typeMenu}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.typeMenuHint")}
            </div>
          </div>
        </div>
      </Card>
    </div>

    <ProFormDependency name={["table_name", "type_form"]}>
      {(values: Record<string, any>) => {
        const hasTable = !!values.table_name;
        const isMasterDetail = Number(values.type_form) === 2;
        
        // Hiển thị cảnh báo khi menu là Master-Detail
        if (hasTable && isMasterDetail) {
          return (
            <Alert
              message={t("system.menu.masterDetailAlertTitle")}
              description={t("system.menu.masterDetailAlertDesc")}
              type="info"
              showIcon
              style={{ marginBottom: 16, marginTop: 16 }}
              closable
            />
          );
        }
        
        // Hiển thị cảnh báo khi menu là Dynamic Code
        const typeForm = Number(values.type_form || 1);
        if (typeForm === 4) {
          return (
            <Alert
              message={t("system.menu.dynamicCodeAlertTitle")}
              description={t("system.menu.dynamicCodeAlertDesc")}
              type="warning"
              showIcon
              style={{ marginBottom: 16, marginTop: 16 }}
              closable
            />
          );
        }

    if (typeForm === 6) {
      return (
        <Alert
          message={t("system.menu.kanbanAlertTitle")}
          description={t("system.menu.kanbanAlertDesc")}
          type="success"
          showIcon
          style={{ marginBottom: 16, marginTop: 16 }}
          closable
        />
      );
    }

    if (typeForm === 7) {
      return (
        <Alert
          message={t("system.menu.lineItemsAlertTitle")}
          description={t("system.menu.lineItemsAlertDesc")}
          type="success"
          showIcon
          style={{ marginBottom: 16, marginTop: 16 }}
          closable
        />
      );
    }

        // Hiển thị cảnh báo khi menu là Dynamic Link
        if (typeForm === 3) {
          return (
            <Alert
              message={t("system.menu.dynamicLinkAlertTitle")}
              description={t("system.menu.dynamicLinkAlertDesc")}
              type="info"
              showIcon
              style={{ marginBottom: 16, marginTop: 16 }}
              closable
            />
          );
        }
        
        return null;
      }}
    </ProFormDependency>

  <ProFormDependency name={["path"]}>
    {(values: Record<string, any>) => {
      const currentPath = values.path || detailData.path;
      if (currentPath !== "/system/user") return null;

      return (
        <div style={{ marginBottom: 32, width: '100%' }}>
          <Card
            title={t('common.menu.userSub') || 'Cấu hình Sub-user'}
            bordered
            style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
            bodyStyle={{ padding: 20 }}
          >
            <Alert
              type="info"
              showIcon
              message={t("system.menu.systemUserDualConfigTitle")}
              description={t("system.menu.systemUserDualConfigDesc")}
              style={{ marginBottom: 16 }}
            />
            <Tabs
              defaultActiveKey="sub"
              items={[
                {
                  key: 'main',
                  label: t("system.menu.systemUserMainTab"),
                  children: (
                    <Alert
                      type="success"
                      showIcon
                      message={t("system.menu.systemUserMainConfigTitle")}
                      description={t("system.menu.systemUserMainConfigDesc")}
                    />
                  ),
                },
                {
                  key: 'sub',
                  label: t("system.menu.systemUserSubTab"),
                  children: (
                    <div style={{ display: 'grid', gap: 16 }}>
                      <div>
                        <MenuFieldLabel i18nKey="system.menu.table" />
                        <Input
                          value={String(subUserModeConfig.table_name || '')}
                          placeholder="csm_group_members"
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setSubUserModeConfig((prev) => ({ ...prev, table_name: nextValue }));
                          }}
                        />
                      </div>
                      <div>
                        <MenuFieldLabel i18nKey="system.menu.fieldConfigLabel" />
                        <FieldConfigEditor
                          value={Array.isArray(subUserModeConfig.table) ? subUserModeConfig.table : []}
                          onChange={(nextTable) => {
                            setSubUserModeConfig((prev) => ({ ...prev, table: nextTable }));
                          }}
                        />
                      </div>
                      <div>
                        <MenuFieldLabel i18nKey="system.menu.triggerConfigLabel" />
                        <div style={{ width: '100%', minWidth: 0 }}>
                          <TriggerEditor
                            value={subUserModeConfig.trigger && typeof subUserModeConfig.trigger === 'object' ? subUserModeConfig.trigger : {}}
                            appId={appId}
                            pName={String((detailData as any)?.p_name || "").trim() || undefined}
                            pType={typeof (detailData as any)?.p_type === "number" ? (detailData as any).p_type : undefined}
                            editorMetadata={{
                              ...menuScopeAiMetadata,
                              activeScope: "sub_user_trigger",
                              activeTriggerConfig: subUserModeConfig.trigger && typeof subUserModeConfig.trigger === 'object' ? subUserModeConfig.trigger : {},
                              activeTableFields: Array.isArray(subUserModeConfig.table) ? subUserModeConfig.table : [],
                            }}
                            onChange={(nextTrigger) => {
                              setSubUserModeConfig((prev) => ({ ...prev, trigger: nextTrigger }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      );
    }}
  </ProFormDependency>

  <ProFormDependency name={["type_form"]}>
  {(values: Record<string, any>) => {
    const typeForm = Number(values.type_form || 1);
    if (typeForm !== 6) return null;

    return (
      <div style={{ marginBottom: 32, width: '100%' }}>
        <Card
          title={t("system.menu.kanbanConfigTitle")}
          bordered
          style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
          bodyStyle={{ padding: 20 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanLinkedDataMenuLabel" />
              <ProFormSelect
                name="linked_data_menu_id"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanLinkedDataMenuPlaceholder') || "Chọn menu có cấu hình bảng liên quan",
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                  onChange: (value) => {
                    const linkedMenuId = String(value || "").trim();
                    if (!linkedMenuId) return;
                    queueMicrotask(() => {
                      syncLinkedTaskMenuFields({ silent: true, force: true, linkedMenuId });
                    });
                  },
                }}
                options={relatedDataMenuOptions}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="primary" onClick={linkRelatedDataMenu}>{t('system.menu.kanbanGenerateFromLinkedMenu') || 'Tạo config từ menu liên kết'}</Button>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
                {t('system.menu.kanbanGenerateFromLinkedMenuHint') || 'Không dùng template cứng. Cấu hình Kanban sẽ sinh trực tiếp từ bảng của menu liên kết.'}
              </div>
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanProgressLinkedMenuLabel" />
              <ProFormSelect
                name="linked_progress_menu_id"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanProgressLinkedMenuPlaceholder') || "Chọn menu lưu lịch sử tiến độ",
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                  onChange: (value) => {
                    const linkedProgressMenuId = String(value || "").trim();
                    if (!linkedProgressMenuId) return;
                    queueMicrotask(() => {
                      syncLinkedProgressMenuFields({
                        silent: true,
                        force: true,
                        linkedProgressMenuId,
                        mode: String(formRef.current?.getFieldValue("kanban_progress_tracking_mode") || "single_table"),
                      });
                    });
                  },
                }}
                options={progressDataMenuOptions}
              />
              <div style={{ marginTop: 8 }}>
                <Button onClick={linkProgressDataMenu}>{t('system.menu.kanbanProgressLinkButton') || 'Liên kết bảng tiến độ'}</Button>
              </div>
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanProgressTrackingModeLabel" />
            <ProFormSelect
                name="kanban_progress_tracking_mode"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanProgressTrackingModePlaceholder') || 'Chọn mô hình',
                  allowClear: false,
                  size: 'large',
                  style: { width: '100%' },
                  onChange: (value) => {
                    const mode = String(value || "single_table").trim() || "single_table";
                    if (mode !== "separate_table") return;
                    queueMicrotask(() => {
                      syncLinkedProgressMenuFields({
                        silent: true,
                        force: true,
                        mode,
                        linkedProgressMenuId: String(formRef.current?.getFieldValue("linked_progress_menu_id") || ""),
                      });
                    });
                  },
                }}
                options={menuOptions.kanbanProgressTracking}
              />
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanStrictModeLabel" />
              <ProFormSelect
                name="kanban_strict_mode"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanInheritJson') || 'Kế thừa từ JSON',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={menuOptions.kanbanStrictMode}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
                {t('system.menu.kanbanStrictModeHint') || 'Strict mode sẽ kiểm soát transition trạng thái và trường bắt buộc theo stage.'}
              </div>
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanAutoProgressLabel" />
              <ProFormSelect
                name="kanban_auto_update_progress"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanInheritJson') || 'Kế thừa từ JSON',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={menuOptions.kanbanAutoProgress}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
                {t('system.menu.kanbanAutoProgressHint') || 'Khi bật: đổi stage sẽ tự cập nhật field tiến độ (%) và mốc thời gian KPI.'}
              </div>
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanStageFieldLabel" />
              <ProFormSelect
                name="kanban_stage_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanStageFieldPlaceholder') || 'status / trang_thai',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanTitleFieldLabel" />
              <ProFormSelect
                name="kanban_title_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanTitleFieldPlaceholder') || 'title / ten',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanDueDateFieldLabel" />
              <ProFormSelect
                name="kanban_due_date_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanDueDateFieldPlaceholder') || 'due_at / deadline',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div>
              <MenuFieldLabel i18nKey="system.menu.kanbanProgressFieldLabel" />
              <ProFormSelect
                name="kanban_progress_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanProgressFieldPlaceholder') || 'progress_percent',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <MenuFieldLabel i18nKey="system.menu.kanbanDoneStagesLabel" />
              <ProFormText
                name="kanban_done_stage_ids"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanDoneStagesPlaceholder') || 'done,completed',
                  size: 'large',
                  style: { width: '100%' },
                }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
                {t('system.menu.kanbanDoneStagesHint') || 'Nhập danh sách stage hoàn thành, phân tách bằng dấu phẩy. Ví dụ: done,completed'}
              </div>
            </div>

            <ProFormDependency
              name={[
                "linked_data_menu_id",
                "linked_progress_menu_id",
                "kanban_progress_tracking_mode",
                "kanban_auto_update_progress",
                "kanban_stage_field",
                "kanban_title_field",
                "kanban_due_date_field",
                "kanban_progress_field",
                "kanban_progress_task_ref_field",
                "kanban_progress_stage_log_field",
                "kanban_progress_percent_log_field",
                "kanban_progress_time_field",
              ]}
            >
              {(depValues: Record<string, any>) => {
                const mode = String(depValues.kanban_progress_tracking_mode || "single_table");
                const advices = buildKanbanFieldAdvice(depValues);
                const missingPlan = getMissingKanbanFieldPlan(depValues);
                const canAutoCreate = Boolean(
                  (missingPlan.taskMenu && missingPlan.taskSpecs.length > 0) ||
                  (missingPlan.progressMenu && missingPlan.progressSpecs.length > 0)
                );
                return (
                  <>
                    {advices.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Alert
                          type="warning"
                          showIcon
                          message={t("system.menu.kanbanSmartAdviceTitle")}
                          description={
                            <div>
                              {advices.map((advice, index) => (
                                <div key={`kanban-advice-${index}`}>- {advice}</div>
                              ))}
                              {canAutoCreate && (
                                <div style={{ marginTop: 12 }}>
                                  <Button
                                    type="primary"
                                    loading={applyingLinkedFieldFix}
                                    onClick={() => {
                                      Modal.confirm({
                                        title: t("system.menu.kanbanAutoCreateConfirmTitle"),
                                        content: (
                                          <div>
                                            <div>{t("system.menu.kanbanAutoCreateConfirmDesc")}</div>
                                            {missingPlan.taskMenu && missingPlan.taskSpecs.length > 0 && (
                                              <div style={{ marginTop: 8 }}>
                                                {t("system.menu.kanbanAutoCreateTaskMenuPlan")}: {missingPlan.taskSpecs.map((spec) => spec.name).join(", ")}
                                              </div>
                                            )}
                                            {missingPlan.progressMenu && missingPlan.progressSpecs.length > 0 && (
                                              <div style={{ marginTop: 8 }}>
                                                {t("system.menu.kanbanAutoCreateProgressMenuPlan")}: {missingPlan.progressSpecs.map((spec) => spec.name).join(", ")}
                                              </div>
                                            )}
                                          </div>
                                        ),
                                        okText: t("system.menu.kanbanAutoCreateButton"),
                                        cancelText: t("common.cancel") || "Cancel",
                                        onOk: async () => {
                                          await applyMissingFieldsToLinkedMenus(depValues);
                                        },
                                      });
                                    }}
                                  >
                                    {t("system.menu.kanbanAutoCreateButton")}
                                  </Button>
                                </div>
                              )}
                            </div>
                          }
                        />
                      </div>
                    )}
                    {mode !== "separate_table" ? null : (
                      <>
                    <div>
                      <MenuFieldLabel i18nKey="system.menu.kanbanProgressTaskRefFieldLabel" />
                      <ProFormSelect
                        name="kanban_progress_task_ref_field"
                        noStyle
                        fieldProps={{ placeholder: 'task_id', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <MenuFieldLabel i18nKey="system.menu.kanbanProgressStageLogFieldLabel" />
                      <ProFormSelect
                        name="kanban_progress_stage_log_field"
                        noStyle
                        fieldProps={{ placeholder: 'status', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <MenuFieldLabel i18nKey="system.menu.kanbanProgressPercentLogFieldLabel" />
                      <ProFormSelect
                        name="kanban_progress_percent_log_field"
                        noStyle
                        fieldProps={{ placeholder: 'progress_percent', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <MenuFieldLabel i18nKey="system.menu.kanbanProgressTimeFieldLabel" />
                      <ProFormSelect
                        name="kanban_progress_time_field"
                        noStyle
                        fieldProps={{ placeholder: 'updated_at', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <MenuFieldLabel i18nKey="system.menu.kanbanProgressNoteFieldLabel" />
                      <ProFormSelect
                        name="kanban_progress_note_field"
                        noStyle
                        fieldProps={{ placeholder: 'note', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <MenuFieldLabel i18nKey="system.menu.kanbanProgressActorFieldLabel" />
                      <ProFormSelect
                        name="kanban_progress_actor_field"
                        noStyle
                        fieldProps={{ placeholder: 'updated_by', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                      </>
                    )}
                  </>
                );
              }}
            </ProFormDependency>
          </div>

          <ProFormTextArea
            name="kanban_config"
            fieldProps={{
              rows: 20,
              style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
              placeholder: KANBAN_CONFIG_TEMPLATE,
              readOnly: true,
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ant-colorTextTertiary)', whiteSpace: 'pre-line' }}>
            {t('system.menu.kanbanConfigHint') || 'Khai báo JSON cho board độc lập: bảng nguồn, khóa chính, cột trạng thái, các stage hiển thị, chế độ kanban, timeline và báo cáo theo thời gian.'}
          </div>
        </Card>
      </div>
    );
  }}
  </ProFormDependency>

    {/* Cài đặt cơ bản */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t("system.menu.basicSettings")}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          <div>
            <MenuFieldLabel i18nKey="system.menu.parentMenu" />
            <ProFormSelect
              name="parentId"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.parentMenuPlaceholder"),
                allowClear: true,
                size: 'large',
                style: { width: '100%' },
                showSearch: true,
                filterOption: (input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase()),
              }}
              options={[
                ...menuOptions.rootMenu,
                ...flatParentMenus
                  .filter(menu => menu.id !== detailData.id) // Loại trừ chính menu đang edit
                  .map(menu => ({
                    label: (() => {
                      const baseLabel = getMenuLabel(menu, i18n.language, t);
                      const extra: string[] = [];
                      if (menu.label_en) extra.push(`EN: ${menu.label_en}`);
                      if (menu.label_zh) extra.push(`ZH: ${menu.label_zh}`);
                      return extra.length > 0 ? `${baseLabel} (${extra.join(" | ")})` : baseLabel;
                    })(),
                    value: menu.id,
                  }))
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.parentMenuHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.icon" />
            <ProFormSelect
              name="icon"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.iconPlaceholder") || "Ví dụ: AppstoreOutlined",
                showSearch: true,
                allowClear: true,
                size: 'large',
                style: { width: '100%' },
                filterOption: (input: string, option: any) => {
                  const q = String(input || "").toLowerCase();
                  return String(option?.value || "").toLowerCase().includes(q)
                    || String(option?.searchText || "").toLowerCase().includes(q);
                },
              }}
              options={antIconOptions}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.iconHint") || "Gõ để tìm icon Ant Design (ví dụ: UserOutlined, SettingOutlined). Nếu để trống sẽ dùng icon mặc định."}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.table" />
            <ProFormText
              name="table_name"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.tablePlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.tableHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.dataScopeTitle" />
            <ProFormSelect
              name="data_scope_override"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.dataScopePlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.dataScope}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.dataScopeHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.dev" />
            <ProFormSelect
              name="dev"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.selectPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.yesNoBool}
            />
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.prefixPk" />
            <ProFormText
              name="prefix_pk"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.prefixPkPlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.prefixPkHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.tablePagesize" />
            <ProFormDigit
              name="table_pagesize"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.tablePagesizePlaceholder"),
                size: 'large',
                style: { width: '100%' },
                precision: 0,
              }}
              min={1}
              max={1000}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.tablePagesizeHint")}
            </div>
          </div>
        </div>
      </Card>
    </div>

    {/* Cài đặt báo cáo */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t("system.menu.reportSettings")}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          <div>
            <MenuFieldLabel i18nKey="system.menu.reportName" />
            <ProFormText
              name="report_name"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.reportNamePlaceholder"),
                size: 'large',
                style: { width: '100%' },
                addonAfter: (
                  <Space>
                    <Upload
                      accept=".pdf"
                      showUploadList={false}
                      customRequest={handleReportTemplateUpload}
                      disabled={generatingReportFromPdf}
                    >
                      <Button type="default" size="small" loading={generatingReportFromPdf}>
                        {t("system.menu.uploadPdfTemplate", "Upload PDF mẫu")}
                      </Button>
                    </Upload>
                    <Upload
                      accept=".pdf"
                      showUploadList={false}
                      customRequest={handleGenerateReportFromPdf}
                      disabled={generatingReportFromPdf}
                    >
                      <Button type="primary" size="small" loading={generatingReportFromPdf}>
                        {t("system.menu.importPdfGenerateOverlay", "Nạp PDF mẫu -> preview/overlay")}
                      </Button>
                    </Upload>
                  </Space>
                ),
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.reportNameHint", "Chỉ hỗ trợ file PDF mẫu để thiết kế báo cáo")}
            </div>
            <ProFormDependency name={["report_name"]}>
              {(depValues: Record<string, any>) => {
                const reportPath = String(depValues.report_name || "").trim();
                if (!reportPath) return null;
                const candidates = buildReportTemplateCandidates(reportPath, appId);
                const openHref = candidates[0] || reportPath;
                const downloadHref = `${openHref}${openHref.includes("?") ? "&" : "?"}download=1`;
                return (
                  <Space size={12} wrap style={{ marginTop: 8 }}>
                    <a href={openHref} target="_blank" rel="noreferrer noopener">
                      Mở mẫu PDF
                    </a>
                    <a href={downloadHref} target="_blank" rel="noreferrer noopener">
                      Tải mẫu PDF
                    </a>
                    <Button
                      size="small"
                      loading={downloadingReportTemplate}
                      onClick={handleDownloadCurrentReportTemplate}
                    >
                      Tải PDF mẫu
                    </Button>
                  </Space>
                );
              }}
            </ProFormDependency>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.orientation" />
            <ProFormSelect
              name="orientation"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.orientationPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.orientation}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.orientationHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.pWidth" />
            <ProFormDigit
              name="p_width"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.pWidthPlaceholder"),
                size: 'large',
                style: { width: '100%' },
                precision: 2,
              }}
              min={0}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.mmUnit")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.pHeight" />
            <ProFormDigit
              name="p_height"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.pHeightPlaceholder"),
                size: 'large',
                style: { width: '100%' },
                precision: 2,
              }}
              min={0}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.mmUnit")}
            </div>
          </div>
        </div>
      </Card>

      <Modal
        title="Thiết kế báo cáo động từ PDF mẫu"
        open={pdfOverlayModalOpen}
        onCancel={() => setPdfOverlayModalOpen(false)}
        width={1320}
        destroyOnClose
        footer={[
          <Button key="close" onClick={() => setPdfOverlayModalOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="compare"
            onClick={handleCompareWithSourcePdf}
            loading={comparingPdfTemplate}
            disabled={!pdfOverlayPending}
          >
            So sánh với PDF gốc
          </Button>,
          <Button key="apply" type="primary" onClick={handleApplyPdfOverlayDraft} disabled={!pdfOverlayPending}>
            Lưu mẫu báo cáo động
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Review báo cáo động bằng dữ liệu mẫu và bố cục từ PDF gốc. Không dùng nền PDF làm preview nữa."
        />
        {pdfCompareResult && (
          <Alert
            style={{ marginBottom: 12 }}
            type={pdfCompareResult.qualityGate === "pass" ? "success" : "warning"}
            showIcon
            message={pdfCompareResult.qualityGate === "pass" ? "Kết quả so sánh: Đạt" : "Kết quả so sánh: Cần tinh chỉnh"}
            description={(
              <div style={{ display: "grid", gap: 4 }}>
                <div>Coverage text: {Number(pdfCompareResult.textCoveragePercent || 0).toFixed(1)}% ({pdfCompareResult.matchedLines}/{pdfCompareResult.sampleLineCount})</div>
                <div>Drift vị trí (mm): avg {Number(pdfCompareResult.positionDriftMm?.avg || 0).toFixed(2)} | p95 {Number(pdfCompareResult.positionDriftMm?.p95 || 0).toFixed(2)} | max {Number(pdfCompareResult.positionDriftMm?.max || 0).toFixed(2)}</div>
              </div>
            )}
          />
        )}
        {pdfCompareResult && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span style={{ border: "1px solid rgba(74,222,128,0.55)", background: "rgba(220,252,231,0.62)", borderRadius: 999, padding: "2px 10px", fontSize: 12, color: "#14532d" }}>Khớp</span>
            <span style={{ border: "1px solid rgba(251,191,36,0.7)", background: "rgba(254,243,199,0.82)", borderRadius: 999, padding: "2px 10px", fontSize: 12, color: "#92400e" }}>Lệch/Nghi ngờ</span>
            <span style={{ border: "1px solid rgba(248,113,113,0.65)", background: "rgba(254,226,226,0.78)", borderRadius: 999, padding: "2px 10px", fontSize: 12, color: "#991b1b" }}>Thiếu so với mẫu gốc</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, alignItems: "start" }}>
          <Card
            size="small"
            title={(
              <Space size={10} style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Preview trang 1</span>
              </Space>
            )}
            style={{ background: "#f6f7f9" }}
            bodyStyle={{ padding: 12 }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "210 / 297",
                maxWidth: 760,
                margin: "0 auto",
                border: "1px solid #d9d9d9",
                borderRadius: 12,
                backgroundColor: "#fff",
                backgroundImage: "linear-gradient(180deg, #fff 0%, #fafafa 100%)",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
                {previewOverlayDisplayItems.map(({ item, resolved, status }, index) => {
                  const pos = previewPageMetrics.toPercent(item);
                  const text = String(resolved || item.text || "").trim();
                  if (!text) return null;
                  const fontSizePx = Math.max(9, Math.min(18, Number(item.fontSize || 11)));
                  const tone = status === "miss"
                    ? { color: "#991b1b", bg: "rgba(254,226,226,0.78)", border: "1px solid rgba(248,113,113,0.65)" }
                    : status === "warn"
                      ? { color: "#92400e", bg: "rgba(254,243,199,0.82)", border: "1px solid rgba(251,191,36,0.7)" }
                      : status === "ok"
                        ? { color: "#14532d", bg: "rgba(220,252,231,0.62)", border: "1px solid rgba(74,222,128,0.55)" }
                        : { color: "#111827", bg: "transparent", border: "none" };
                  return (
                    <div
                      key={`preview-overlay-${index}`}
                      style={{
                        position: "absolute",
                        left: `${Math.max(0, Math.min(95, pos.left))}%`,
                        top: `${Math.max(0, Math.min(98, pos.top))}%`,
                        transform: "translateY(-50%)",
                        fontSize: fontSizePx,
                        whiteSpace: "nowrap",
                        maxWidth: "92%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        opacity: 0.9,
                        padding: tone.bg === "transparent" ? "0" : "1px 4px",
                        borderRadius: tone.bg === "transparent" ? 0 : 4,
                        background: tone.bg,
                        border: tone.border,
                        color: tone.color,
                      }}
                      title={text}
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
              <div style={{ position: "relative", zIndex: 1, padding: 24, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ borderBottom: "1px solid #ececec", paddingBottom: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{previewDesignSpec?.title || "BÁO CÁO"}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Preview động từ trigger mẫu — không dùng nền PDF</div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(previewDesignSpec?.header || []).slice(0, 6).map((item, index) => (
                    <div key={`${item.token}-${index}`} style={{ fontSize: 12, color: "#374151" }}>
                      {(() => {
                        const label = String(item.label || "").trim();
                        const value = String(item.sampleValue || "").trim();
                        if (!value) return <strong>{label}</strong>;
                        const normalizedLabel = label.toLowerCase();
                        const normalizedValue = value.toLowerCase();
                        if (normalizedValue === normalizedLabel || normalizedValue.startsWith(`${normalizedLabel}:`)) {
                          return <strong>{label}</strong>;
                        }
                        return <><strong>{label}</strong>: {value}</>;
                      })()}
                    </div>
                  ))}
                </div>
                <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10, background: "rgba(255,255,255,0.9)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Dòng dữ liệu</div>
                  {(previewDesignSpec?.sections || []).length > 0 ? previewDesignSpec!.sections.map((section, index) => (
                    <div key={`${section.id}-${index}`} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#4b5563" }}>{section.title}</div>
                      {(section.lines || []).slice(0, 3).map((line, lineIndex) => (
                        <div key={`${section.id}-${lineIndex}`} style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{line}</div>
                      ))}
                    </div>
                  )) : <div style={{ fontSize: 11, color: "#6b7280" }}>Không có section dữ liệu, sẽ dùng các item overlay đã sinh.</div>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(previewDesignSpec?.totals || []).map((item, index) => (
                    <div key={`${item.token}-${index}`} style={{ border: "1px solid #d1d5db", borderRadius: 999, padding: "4px 8px", background: "#f9fafb", fontSize: 12, color: "#111827" }}>
                      {item.label}: {item.value}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: "auto" }}>
                  {(previewDesignSpec?.footer || []).slice(0, 4).map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                </div>
              </div>
            </div>
          </Card>

          <Card
            size="small"
            title={(
              <Space>
                <span>Thành phần mẫu động</span>
                <Button size="small" onClick={addPdfOverlayItem}>Thêm item</Button>
              </Space>
            )}
            bodyStyle={{ padding: 12 }}
          >
            {pdfCompareResult && (
              <div style={{ marginBottom: 10, display: "grid", gap: 6 }}>
                {(pdfCompareResult.missingSampleLines || []).length > 0 && (
                  <div style={{ fontSize: 12, color: "#991b1b" }}>
                    Thiếu ({Math.min((pdfCompareResult.missingSampleLines || []).length, 3)} dòng đầu): {(pdfCompareResult.missingSampleLines || []).slice(0, 3).join(" | ")}
                  </div>
                )}
                {(pdfCompareResult.unexpectedRenderLines || []).length > 0 && (
                  <div style={{ fontSize: 12, color: "#92400e" }}>
                    Dư/lệch ({Math.min((pdfCompareResult.unexpectedRenderLines || []).length, 3)} dòng đầu): {(pdfCompareResult.unexpectedRenderLines || []).slice(0, 3).join(" | ")}
                  </div>
                )}
              </div>
            )}
            <div style={{ maxHeight: 640, overflow: "auto", display: "grid", gap: 12 }}>
              {(pdfOverlayEditItems.length > 0 ? pdfOverlayEditItems : pdfOverlayPending?.overlayItems || []).map((item, index) => (
                <Card
                  key={`${index}-${String(item.text || "")}`}
                  size="small"
                  style={{ borderRadius: 10 }}
                  bodyStyle={{ padding: 12 }}
                  title={
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <span>Item {index + 1}</span>
                      <Button size="small" danger onClick={() => removePdfOverlayItem(index)}>Xóa</Button>
                    </Space>
                  }
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Text</div>
                      <Input value={String(item.text || "")} onChange={(e) => updatePdfOverlayItem(index, { text: e.target.value })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Page</div>
                      <InputNumber min={1} value={Number(item.page || 1)} style={{ width: "100%" }} onChange={(value) => updatePdfOverlayItem(index, { page: Number(value || 1) })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>X</div>
                      <InputNumber min={0} value={Number(item.x || 0)} style={{ width: "100%" }} onChange={(value) => updatePdfOverlayItem(index, { x: Number(value || 0) })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Y</div>
                      <InputNumber min={0} value={Number(item.y || 0)} style={{ width: "100%" }} onChange={(value) => updatePdfOverlayItem(index, { y: Number(value || 0) })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Font size</div>
                      <InputNumber min={4} value={Number(item.fontSize || 11)} style={{ width: "100%" }} onChange={(value) => updatePdfOverlayItem(index, { fontSize: Number(value || 11) })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Opacity</div>
                      <InputNumber min={0} max={1} step={0.1} value={Number(item.opacity || 1)} style={{ width: "100%" }} onChange={(value) => updatePdfOverlayItem(index, { opacity: Number(value || 1) })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Font</div>
                      <Input value={String(item.fontName || "Helvetica")} onChange={(e) => updatePdfOverlayItem(index, { fontName: e.target.value })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>Color</div>
                      <Input value={String(item.color || "#000000")} onChange={(e) => updatePdfOverlayItem(index, { color: e.target.value })} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      </Modal>
    </div>

    {/* Cài đặt hiển thị nâng cao */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t("system.menu.advancedSettings")}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          <div>
            <MenuFieldLabel i18nKey="system.menu.fieldRoot" />
            <ProFormText
              name="field_root"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.fieldRootPlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.fieldRootHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.mShow" />
            <ProFormSelect
              name="m_show"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.selectPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.yesNoNum}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.mShowHint")}
            </div>
          </div>

          <div>
            <MenuFieldLabel i18nKey="system.menu.gReadonly" />
            <ProFormSelect
              name="g_readonly"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.selectPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={menuOptions.yesNoBool}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
              {t("system.menu.gReadonlyHint")}
            </div>
          </div>

          <ProFormDependency name={["type_form"]}>
            {(values: Record<string, any>) => {
              const typeForm = Number(values.type_form || 1);

              if (typeForm === 3) {
                return (
                  <div>
                    <MenuFieldLabel i18nKey="system.menu.vLink" />
                    <ProFormText
                      name="v_link"
                      noStyle
                      fieldProps={{
                        placeholder: t("system.menu.vLinkFallbackPlaceholder"),
                        size: "large",
                        style: { width: "100%" },
                      }}
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--ant-colorTextTertiary)" }}>
                      {t("system.menu.vLinkFallbackHint")}
                    </div>
                  </div>
                );
              }

              return (
                <div>
                  <MenuFieldLabel i18nKey="system.menu.vLink" />
                  <ProFormText
                    name="v_link"
                    noStyle
                    fieldProps={{
                      placeholder: t("system.menu.vLinkComponentPlaceholder"),
                      size: "large",
                      style: { width: "100%" },
                    }}
                  />
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--ant-colorTextTertiary)" }}>
                    {t("system.menu.vLinkComponentHint")}
                  </div>
                </div>
              );
            }}
          </ProFormDependency>

          {/* Auto Code Selector - chỉ hiện khi type_form === 4 (Dynamic Code) */}
          <ProFormDependency name={["type_form"]}>
            {(values: Record<string, any>) => {
              const typeForm = Number(values.type_form || 1);
              
              if (typeForm === 4) {
                return (
                  <div style={{ position: 'relative' }}>
                    <Spin spinning={loadingAutoCode} size="small">
                      <MenuFieldLabel i18nKey="system.menu.autoCodeTemplate" required />
                      <ProFormSelect
                        name="auto_code_name"
                        noStyle
                        rules={[{ required: true, message: t("form.required") }]}
                        fieldProps={{
                          placeholder: t("system.menu.autoCodeTemplatePlaceholder"),
                          allowClear: true,
                          size: 'large',
                          style: { width: '100%' },
                          loading: loadingAutoCode,
                        }}
                        options={autoCodeOptions}
                      />
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
                        {t("system.menu.autoCodeTemplateHint")}
                      </div>
                    </Spin>
                  </div>
                );
              }
              
              if (typeForm === 3) {
                return (
                  <div>
                    <MenuFieldLabel i18nKey="system.menu.dynamicLinkUrl" />
                    <ProFormText
                      name="dynamic_link_url"
                      noStyle
                      fieldProps={{
                        placeholder: t("system.menu.dynamicLinkUrlPlaceholder"),
                        size: 'large',
                        style: { width: '100%' },
                      }}
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>
                      {t("system.menu.dynamicLinkUrlHint")}
                    </div>
                  </div>
                );
              }
              
              return null;
            }}
          </ProFormDependency>
        </div>
      </Card>
    </div>

      {/* ...các trường còn lại giữ nguyên... */}
      <div style={{ height: 16 }} />

      <ProFormDependency name={["type_form"]}>
        {(depValues: Record<string, any>) => {
          const typeForm = Number(depValues.type_form ?? detailData.type_form ?? 0);
          const tabItems = [
            {
              key: "fields",
              label: t("system.menu.tab.fields"),
              children: (
                <FieldConfigEditor
                  value={tableRows}
                  onChange={setTableRows}
                  appId={appId}
                  lineItemsMode={typeForm === 7}
                  aiAssistantPName={String((detailData as any)?.p_name || "").trim() || undefined}
                  aiAssistantPType={typeof (detailData as any)?.p_type === "number" ? (detailData as any).p_type : undefined}
                  aiAssistantEditorMetadata={{ ...menuScopeAiMetadata, activeScope: "field_config" }}
                />
              ),
            },
            ...(typeForm === 7
              ? [{
                key: "line_items",
                label: t("system.menu.tab.lineItems"),
                children: (
                  <LineItemsConfigEditor
                    value={lineItemsConfig}
                    onChange={setLineItemsConfig}
                    tableFields={tableRows}
                    onApplyTemplate={handleApplyLineItemsTemplate}
                    onApplyMenuPreset={handleApplyPhusonMenuPreset}
                    appId={appId}
                    editorMetadata={menuScopeAiMetadata}
                    onApplyTrigger={(key, body) => {
                      setTriggerConfig((prev) => ({ ...(prev || {}), [key]: csmEncrypt(String(body || "")) }));
                      message.success(t("system.menu.lineItemsTriggerApplied", `Đã cập nhật trigger "${key}" — nhớ Lưu menu`));
                    }}
                  />
                ),
              }]
              : []),
            {
              key: "trigger",
              label: t("system.menu.tab.trigger"),
              children: (
                <div style={{ width: "100%", minWidth: 0 }}>
                  <TriggerEditor
                    value={triggerConfig}
                    onChange={setTriggerConfig}
                    appId={appId}
                    pName={String((detailData as any)?.p_name || "").trim() || undefined}
                    pType={typeof (detailData as any)?.p_type === "number" ? (detailData as any).p_type : undefined}
                    editorMetadata={{ ...menuScopeAiMetadata, activeScope: "menu_trigger" }}
                    extraOptions={typeForm === 7 ? buildLineItemsTriggerOptions(tableRows, lineItemsConfig) : []}
                  />
                </div>
              ),
            },
          ];
          return <Tabs style={{ marginTop: 24, width: "100%" }} items={tabItems} />;
        }}
      </ProFormDependency>
    </ModalForm>
  );
}
