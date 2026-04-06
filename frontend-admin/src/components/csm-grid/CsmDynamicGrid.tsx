import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BasicTable } from "#src/components/basic-table";
import { updateTableData, getTableData, bulkUpdateTableData } from "./CsmApi";
import CsmEditModal, { DetailGridTab } from "./CsmEditModal";
import { csmDecrypt, csmEncrypt } from "./CsmCrypto";
import { INT, jdFromDate, jdToDate, NewMoon, KinhDoMatTroi, SunLongitude, getSunLongitude, getNewMoonDay, getLunarMonth11, getLeapMonthOffset, duong_qua_am, am_qua_duong, LunarCalendar } from "#src/utils/lunarCalendar";
import { dateFormat, chuyenNgay, TruNgayRaSoNgay, CongNgay, CongGio, validateEmail, validatePhone, DateUtils } from "#src/utils/dateUtils";
import { useSocket } from "#src/hooks/useSocket";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { Button, Input, Space, Tooltip, message, Modal, Tabs, Divider } from "antd";
import { PlusOutlined, ImportOutlined, ExportOutlined, SearchOutlined } from "@ant-design/icons";
import { read, utils, writeFile } from "xlsx";
import { useAppStore } from "#src/store/app";
import { useUserStore } from "#src/store/user";
import { PERMISSION_BITS, hasAnyPermissionBit, hasPermissionBit, parseMenuBitIndex, toPermissionBigInt } from "#src/utils/permission-bitfield";
import { formatDateForDisplay, formatDateForStorage, resolveDateLocaleFormat } from "#src/utils/dateControl";
import dayjs from "dayjs";

// Minimal types (kept local to avoid wider type churn)
type Row = Record<string, any>;
type Database = Record<string, { rows: Row[] }>;

export interface TableField {
	f_name: string;
	f_header: string;
	f_header_vi?: string;
	f_header_en?: string;
	f_header_zh?: string;
	f_show: number | string;
	f_stt?: number | string;
	f_types?: string;
	f_report?: number | string;
	f_cbo_query?: string;
	f_format?: string;
	f_search?: number | string;
	f_fixcol?: number | string;
	f_pkid?: number | string;
	f_required?: number | string;
	f_align?: "left" | "right" | "center" | string;
	width?: number | string;
	// Grouping / template
	f_group_header_template?: string;
	f_group_footer_template?: string;
	f_group_index?: number | string;
}
								

export interface TriggerConfig {
	filter?: string;
	load_db?: string;
	datacolumntemplate?: string;
	datarowtemplate?: string;
	update?: string; // Vue compatibility: tính toán fields TRƯỚC KHI save - Function("seft", "data", "bang")
	barcode?: string;
	update_db?: string;
	delete_db?: string;
	report_db?: string;
	beforeSave?: string;
	beforeImport?: string; // Hàm xử lý tùy chỉnh trước khi import: (items: Row[], seft: any) => Row[] | Promise<Row[]>
	afterImport?: string; // Hàm xử lý sau khi import: (items: Row[], seft: any) => any
	afterAdd?: string; // Hàm xử lý sau khi thêm dòng: (allData: Row[], seft: any, data: Database) => any
	afterEdit?: string; // Hàm xử lý sau khi sửa dòng: (allData: Row[], seft: any, data: Database) => any
	afterDelete?: string; // Hàm xử lý sau khi xóa dòng: (allData: Row[], seft: any, data: Database) => any
}

export interface MConfig {
	id: string;
	label: string;
	table_name: string;
	table: TableField[];
	trigger: TriggerConfig;
	g_readonly?: boolean;
	table_pagesize?: number | string;
	struct?: {
		fieldsPK?: string[];
		[key: string]: any;
	};
	// Bổ sung các thuộc tính thường dùng trong codebase
	nodes?: any[];
	type_form?: number | string;
	row_type_edit?: number | string;
	selectEnumsOverride?: Record<string, any>; // For detail grid: override selectEnums from trigger
}

function getPrimaryKeyFields(mConfig: MConfig): string[] {
	const rawFields = Array.isArray(mConfig.struct?.fieldsPK) ? mConfig.struct.fieldsPK : [];
	const normalizedFields = rawFields
		.map((field) => String(field || "").trim())
		.filter(Boolean);
	return normalizedFields.length > 0 ? normalizedFields : ["id"];
}

function normalizePrimaryKeyValue(value: any): string {
	if (value == null) return "";
	return String(value).trim();
}

function hasCompletePrimaryKeyValues(row: Row | null | undefined, pkFields: string[]): boolean {
	if (!row) return false;
	const fields = pkFields.length > 0 ? pkFields : ["id"];
	return fields.every((field) => normalizePrimaryKeyValue(row[field]) !== "");
}

function hasSamePrimaryKeyValues(left: Row | null | undefined, right: Row | null | undefined, pkFields: string[]): boolean {
	if (!left || !right) return false;
	const fields = pkFields.length > 0 ? pkFields : ["id"];
	return fields.every((field) => normalizePrimaryKeyValue(left[field]) === normalizePrimaryKeyValue(right[field]));
}

function buildRowKey(row: Row | null | undefined, pkFields: string[]): string {
	if (!row) return "";
	const fields = pkFields.length > 0 ? pkFields : ["id"];
	const compositeKey = fields
		.map((field) => `${field}:${row[field] == null ? "" : String(row[field])}`)
		.join("|");
	if (compositeKey.replace(/[|:]/g, "").trim()) {
		return compositeKey;
	}
	if (row.id != null && row.id !== "") {
		return `id:${String(row.id)}`;
	}
	return JSON.stringify(row);
}

function safeEval<TArgs extends any[], TReturn>(args: string[], body: string): ((...a: TArgs) => TReturn) | null {
	try {
		// Ensure a return if missing - but don't wrap if it's already a function call or has return
		const trimmed = body.trim();
		const isIIFE = trimmed.startsWith('(function') || trimmed.startsWith('(() =>') || trimmed.startsWith('(async') || trimmed.startsWith('(async () =>');
		const isFuncDecl = trimmed.startsWith('function ');
		const hasReturn = trimmed.includes('return ');
		const hasSideEffects = /\b(alert|console\.|debugger|throw|window\.)/.test(trimmed);
		
		const code = (isIIFE || isFuncDecl || hasReturn || hasSideEffects) ? body : `return (${body})`;
		return new Function(...args, code) as any;
	} catch (err) {
		// If it's a SyntaxError, check if it looks like encrypted code that wasn't decrypted
		if (err instanceof SyntaxError) {
			const hasJSSyntax = /[{}()\[\];:,.\s]|return|function|const|let|var|if|for|while|=>|alert|console/.test(body);
			const hasBase64Pattern = /[A-Za-z0-9_\-\/]{50,}/.test(body);
			
			if (!hasJSSyntax && hasBase64Pattern) {
				console.warn("[safeEval] Code looks encrypted but not decrypted - skipping execution:", body.substring(0, 100));
				return null;
			}
		}
		
		console.error("[safeEval] Error creating function:", err);
		console.error("[safeEval] Args:", args);
		console.error("[safeEval] Body (first 500 chars):", body.substring(0, 500));
		return null;
	}
}

function resolveNumberLocale(langInput?: string): string {
	const lang = String(langInput || (typeof navigator !== "undefined" ? navigator.language : "vi") || "vi").toLowerCase();
	if (lang.startsWith("zh")) return "zh-CN";
	if (lang.startsWith("vi")) return "vi-VN";
	return "en-US";
}

function getLocaleNumberSeparators(locale: string): { group: string; decimal: string } {
	try {
		const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
		const group = parts.find((part) => part.type === "group")?.value || ",";
		const decimal = parts.find((part) => part.type === "decimal")?.value || ".";
		return { group, decimal };
	} catch {
		return { group: ",", decimal: "." };
	}
}

function normalizeScope(scope: unknown): "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL" {
	const value = String(scope || "").trim().toUpperCase();
	if (value === "OWNER" || value === "DEPARTMENT" || value === "BRANCH" || value === "ALL") return value;
	return "NONE";
}

function scopeRank(scope: "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL"): number {
	switch (scope) {
		case "OWNER": return 1;
		case "DEPARTMENT": return 2;
		case "BRANCH": return 3;
		case "ALL": return 4;
		default: return 0;
	}
}

function minScope(
	requested: "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL",
	allowed: "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL",
): "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL" {
	const values: Array<"NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL"> = ["NONE", "OWNER", "DEPARTMENT", "BRANCH", "ALL"];
	const idx = Math.min(scopeRank(requested), scopeRank(allowed));
	return values[Math.max(0, Math.min(idx, values.length - 1))];
}

function parseFlexibleNumberInput(input: any, locale?: string): number {
	if (typeof input === "number") return input;
	if (input == null) return NaN;
	let text = String(input).trim();
	if (!text) return NaN;

	if (locale) {
		const { group, decimal } = getLocaleNumberSeparators(locale);
		text = text
			.replace(/\s+/g, "")
			.replace(new RegExp(`[^0-9\\-\\${group}\\${decimal}]`, "g"), "")
			.replace(new RegExp(`\\${group}`, "g"), "")
			.replace(new RegExp(`\\${decimal}`, "g"), ".");
		return Number(text);
	}

	text = text.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
	const lastComma = text.lastIndexOf(",");
	const lastDot = text.lastIndexOf(".");
	let normalized = text;

	if (lastComma >= 0 && lastDot >= 0) {
		const decimalSep = lastComma > lastDot ? "," : ".";
		const groupSep = decimalSep === "," ? "." : ",";
		normalized = normalized.replace(new RegExp(`\\${groupSep}`, "g"), "");
		normalized = normalized.replace(new RegExp(`\\${decimalSep}`, "g"), ".");
	} else if (lastComma >= 0) {
		const parts = normalized.split(",");
		if (parts.length > 2) {
			normalized = parts.join("");
		} else {
			const fraction = parts[1] || "";
			normalized = fraction.length === 3 ? parts.join("") : `${parts[0]}.${fraction}`;
		}
	} else if (lastDot >= 0) {
		const parts = normalized.split(".");
		if (parts.length > 2) {
			normalized = parts.join("");
		} else {
			const fraction = parts[1] || "";
			normalized = fraction.length === 3 ? parts.join("") : `${parts[0]}.${fraction}`;
		}
	}

	return Number(normalized);
}

function formatLocalizedNumber(value: any, locale: string, decimals: number): string {
	if (value == null || value === "") return "";
	const parsed = typeof value === "number" ? value : parseFlexibleNumberInput(value);
	if (!Number.isFinite(parsed)) return String(value ?? "");
	const precision = Number.isFinite(decimals) && decimals > 0 ? decimals : 0;
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: precision,
		maximumFractionDigits: precision,
	}).format(parsed);
}

function buildInlineValidationRules(field: TableField): any[] {
	const types = String(field.f_types || "").toLowerCase();
	const tokens = types.split(/[\s,;|]+/).filter(Boolean);
	const key = String(field.f_name || "").toLowerCase();
	const rules: any[] = [];

	const requiredFlag = Number((field as any).f_required ?? (field as any).required ?? (field as any).f_buocnhap);
	const isRequired = requiredFlag === 1 || tokens.includes("rq") || tokens.includes("required") || tokens.includes("notnull") || tokens.includes("nn");
	const isNumber = /price|number|int|float|double|money|currency/.test(types);
	const isDate = /^date$/.test(types);
	const isDateTime = /datetime/.test(types);
	const isTime = /^time$/.test(types);
	const isEmail = tokens.includes("email") || key.includes("email");
	const isPhone = tokens.includes("phone") || tokens.includes("mobile") || tokens.includes("tel") || key.includes("phone") || key.includes("mobile") || key.includes("tel");

	if (isRequired) {
		rules.push({
			required: true,
			message: `${field.f_header || field.f_name} là bắt buộc`,
		});
	}

	if (isNumber) {
		rules.push({
			validator: (_: any, value: any) => {
				if (value == null || value === "") return Promise.resolve();
				const parsed = parseFlexibleNumberInput(value);
				if (Number.isNaN(parsed)) return Promise.reject(new Error(`${field.f_header || field.f_name} phải là số`));
				return Promise.resolve();
			},
		});

		const minRaw = Number((field as any).f_min ?? (field as any).min);
		const maxRaw = Number((field as any).f_max ?? (field as any).max);
		if (Number.isFinite(minRaw)) {
			rules.push({
				validator: (_: any, value: any) => {
					if (value == null || value === "") return Promise.resolve();
					const parsed = parseFlexibleNumberInput(value);
					if (Number.isNaN(parsed) || parsed < minRaw) {
						return Promise.reject(new Error(`${field.f_header || field.f_name} phải >= ${minRaw}`));
					}
					return Promise.resolve();
				},
			});
		}
		if (Number.isFinite(maxRaw)) {
			rules.push({
				validator: (_: any, value: any) => {
					if (value == null || value === "") return Promise.resolve();
					const parsed = parseFlexibleNumberInput(value);
					if (Number.isNaN(parsed) || parsed > maxRaw) {
						return Promise.reject(new Error(`${field.f_header || field.f_name} phải <= ${maxRaw}`));
					}
					return Promise.resolve();
				},
			});
		}
	}

	if (isEmail) {
		rules.push({
			validator: (_: any, value: any) => {
				if (value == null || value === "") return Promise.resolve();
				return validateEmail(String(value).trim())
					? Promise.resolve()
					: Promise.reject(new Error(`${field.f_header || field.f_name} không đúng định dạng email`));
			},
		});
	}

	if (isPhone) {
		rules.push({
			validator: (_: any, value: any) => {
				if (value == null || value === "") return Promise.resolve();
				return validatePhone(String(value).trim())
					? Promise.resolve()
					: Promise.reject(new Error(`${field.f_header || field.f_name} không đúng định dạng số điện thoại`));
			},
		});
	}

	const maxLenRaw = Number((field as any).f_len ?? (field as any).maxlength ?? (field as any).max_length);
	if (Number.isFinite(maxLenRaw) && maxLenRaw > 0 && !isNumber && !isDate && !isDateTime && !isTime) {
		rules.push({
			max: maxLenRaw,
			message: `${field.f_header || field.f_name} tối đa ${maxLenRaw} ký tự`,
		});
	}

	return rules;
}

function normalizeInlineRowValues(input: Row, fields: TableField[]): Row {
	const normalized: Row = { ...input };

	fields.forEach((field) => {
		const key = field.f_name;
		if (!(key in normalized)) return;

		const raw = normalized[key];
		const types = String(field.f_types || "").toLowerCase();
		const isNumber = /price|number|int|float|double|money|currency/.test(types);
		const isDate = /^date$/.test(types);
		const isDateTime = /datetime/.test(types);
		const isTime = /^time$/.test(types);

		if (dayjs.isDayjs(raw)) {
			if (isDate) {
				normalized[key] = formatDateForStorage(raw, "date");
				return;
			}
			if (isTime) {
				normalized[key] = formatDateForStorage(raw, "time");
				return;
			}
			if (isDateTime) {
				normalized[key] = formatDateForStorage(raw, "datetime");
				return;
			}
		}

		if ((isDate || isDateTime || isTime) && typeof raw === "string" && raw.trim() !== "") {
			normalized[key] = isDate
				? formatDateForStorage(raw, "date")
				: isDateTime
					? formatDateForStorage(raw, "datetime")
					: formatDateForStorage(raw, "time");
			return;
		}

		if (isNumber) {
			if (raw === "") {
				normalized[key] = null;
				return;
			}
			if (typeof raw === "string") {
				const parsed = parseFlexibleNumberInput(raw);
				if (!Number.isNaN(parsed)) {
					normalized[key] = parsed;
				}
			}
		}

		if (/img|image|avatar|cover|album|images|gallery/.test(types) && Array.isArray(raw)) {
			normalized[key] = JSON.stringify(raw);
		}
	});

	return normalized;
}

function parseComboQueryConfig(rawQuery: unknown, decryptFn?: (s: string) => string): any {
	const text = String(rawQuery || "").trim();
	if (!text) return null;

	const candidates = [text];
	if (decryptFn) {
		try {
			const decrypted = decryptFn(text);
			if (decrypted && decrypted !== text) {
				candidates.unshift(String(decrypted));
			}
		} catch {
			// Keep raw text when decrypt fails.
		}
	}

	for (const candidate of candidates) {
		const trimmed = String(candidate || "").trim();
		if (!trimmed) continue;
		try {
			return JSON.parse(trimmed);
		} catch {
			try {
				return new Function(`return (${trimmed})`)();
			} catch {
				// Try next candidate
			}
		}
	}

	return null;
}

function getComboRows(database: Database | undefined, tableName: string): any[] {
	const source = (database as any)?.[tableName];
	if (Array.isArray(source)) return source;
	if (Array.isArray(source?.rows)) return source.rows;
	return [];
}

function collectComboCandidates(input: any, valueField: string, labelField: string): string[] {
	if (input == null) return [];
	if (Array.isArray(input)) {
		return Array.from(new Set(input.flatMap((item) => collectComboCandidates(item, valueField, labelField)).filter(Boolean)));
	}
	if (typeof input === "object") {
		const obj = input as Record<string, any>;
		const values = [
			obj?.[valueField],
			obj?.value,
			obj?.id,
			obj?.key,
			obj?.code,
			labelField ? obj?.[labelField] : "",
			obj?.label,
			obj?.name,
			obj?.text,
		].map((v) => String(v || "").trim()).filter(Boolean);
		return Array.from(new Set(values));
	}
	const text = String(input || "").trim();
	return text ? [text] : [];
}

function resolveComboSingleValue(input: any, querySpecs: any[], database: Database | undefined): { value: string; hasAnyRows: boolean } {
	let hasAnyRows = false;
	for (const querySpec of querySpecs) {
		const tableName = String(querySpec?.obj_name || "").trim();
		if (!tableName) continue;
		const fields = Array.isArray(querySpec?.fields) ? querySpec.fields : [];
		const valueField = String(fields[0] || "id").trim() || "id";
		const labelField = String(fields[1] || "").trim();
		const rows = getComboRows(database, tableName);
		if (!Array.isArray(rows) || rows.length === 0) continue;
		hasAnyRows = true;

		const candidates = collectComboCandidates(input, valueField, labelField);
		for (const candidate of candidates) {
			const byValue = rows.find((row) => String(row?.[valueField] || "").trim() === candidate);
			if (byValue) return { value: String(byValue?.[valueField] || "").trim(), hasAnyRows: true };

			if (labelField) {
				const byLabel = rows.find((row) => String(row?.[labelField] || "").trim() === candidate);
				if (byLabel) return { value: String(byLabel?.[valueField] || "").trim(), hasAnyRows: true };
			}
		}
	}

	return { value: "", hasAnyRows };
}

function normalizeComboFieldByQuery(
	input: any,
	rawQuery: unknown,
	database: Database | undefined,
	decryptFn?: (s: string) => string,
): any {
	const parsed = parseComboQueryConfig(rawQuery, decryptFn);
	const querySpecs = Array.isArray(parsed?.query) ? parsed.query : [];
	if (querySpecs.length === 0) return input;

	if (Array.isArray(input)) {
		let hasAnyRows = false;
		const nextValues = input
			.map((item) => {
				const resolved = resolveComboSingleValue(item, querySpecs, database);
				hasAnyRows = hasAnyRows || resolved.hasAnyRows;
				return resolved.value;
			})
			.filter(Boolean);
		if (!hasAnyRows) return input;
		return Array.from(new Set(nextValues));
	}

	const resolved = resolveComboSingleValue(input, querySpecs, database);
	if (!resolved.hasAnyRows) return input;
	return resolved.value;
}

function normalizeRowComboFieldsByQuery(
	rowData: Row,
	fields: TableField[],
	database: Database | undefined,
	decryptFn?: (s: string) => string,
): Row {
	const next: Row = { ...rowData };
	const fieldNameSet = new Set((fields || []).map((field) => String(field?.f_name || "").trim()).filter(Boolean));
	fields.forEach((field) => {
		const fieldName = String(field?.f_name || "").trim();
		if (!fieldName || !(fieldName in next)) return;
		const types = String(field?.f_types || "").toLowerCase();
		if (types.indexOf("co") === -1) return;
		if (!field?.f_cbo_query) return;

		next[fieldName] = normalizeComboFieldByQuery(next[fieldName], field.f_cbo_query, database, decryptFn);
	});

	const shouldSyncGroupAliases = ["group_id", "permissionGroups", "group_rights", "groupRights"].some(
		(name) => fieldNameSet.has(name) || Object.prototype.hasOwnProperty.call(next, name),
	);
	if (shouldSyncGroupAliases) {
		const toList = (value: any): string[] => {
			if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
			if (value && typeof value === "object") {
				return Object.values(value).map((item) => String(item || "").trim()).filter(Boolean);
			}
			if (typeof value === "string") {
				const raw = value.trim();
				if (!raw) return [];
				if (raw.startsWith("[") || raw.startsWith("{")) {
					try {
						return toList(JSON.parse(raw));
					} catch {
						return [];
					}
				}
				return raw.split(/[;,\n]/g).map((item) => item.trim()).filter(Boolean);
			}
			return [];
		};

		const candidates = [
			String(next.group_id || "").trim(),
			toList(next.permissionGroups)[0] || "",
			toList(next.group_rights)[0] || "",
			toList(next.groupRights)[0] || "",
		].map((item) => String(item || "").trim()).filter(Boolean);
		const selectedGroupId = candidates[0] || "";
		if (selectedGroupId) {
			next.group_id = selectedGroupId;
			if (fieldNameSet.has("permissionGroups") || Object.prototype.hasOwnProperty.call(next, "permissionGroups")) {
				next.permissionGroups = [selectedGroupId];
			}
			if (fieldNameSet.has("group_rights") || Object.prototype.hasOwnProperty.call(next, "group_rights")) {
				next.group_rights = [selectedGroupId];
			}
			if (fieldNameSet.has("groupRights") || Object.prototype.hasOwnProperty.call(next, "groupRights")) {
				next.groupRights = [selectedGroupId];
			}
		}
	}
	return next;
}

/** Resolve a stored path to a URL usable as img/video src */
function resolveMediaUrl(pathValue: string): string {
	if (!pathValue) return "";
	if (/^https?:\/\//i.test(pathValue)) return pathValue;
	return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

export function CsmDynamicGrid({
	m_configs,
	database: _unusedDatabaseProp, // DEPRECATED: Now using global store database
	appId,
	permissions,
	menusPermissions,
	menuId,
	dataScope,
	decrypt,
	onAdd,
	onEdit,
	onDelete,
	onSelectRow,
	onDataChange,
	context,
  enableSearch = true,
  searchFields,
  isDetailGrid = false,
  disablePagination = false,
  allowReadonlyExport = false,
}: {
	m_configs: MConfig
	database?: Database // DEPRECATED: Kept for backward compatibility, not used
	appId?: string
	permissions?: number | string | bigint
	menusPermissions?: Record<string | number, number>
	menuId?: string | number
	dataScope?: string
	decrypt?: (s: string) => string
	onAdd?: () => void
	onEdit?: (row: Row) => void
	onDelete?: (row: Row) => void
	onSelectRow?: (row: Row | null) => void
	onDataChange?: () => void
	context?: { select_row?: Row }
  enableSearch?: boolean
  searchFields?: string[]
  isDetailGrid?: boolean
	disablePagination?: boolean
	allowReadonlyExport?: boolean
}) {
	const { t, i18n } = useTranslation();
	const numberLocale = useMemo(() => resolveNumberLocale(i18n.language), [i18n.language]);
	const dateLocaleFormat = useMemo(() => resolveDateLocaleFormat(i18n.language), [i18n.language]);
	const saveActionLabel = useMemo(() => {
		const lang = String(i18n.language || "").toLowerCase();
		if (lang.startsWith("zh")) return "保存";
		if (lang.startsWith("vi")) return "Lưu";
		return "Save";
	}, [i18n.language]);
	const cancelActionLabel = useMemo(() => {
		const lang = String(i18n.language || "").toLowerCase();
		if (lang.startsWith("zh")) return "取消";
		if (lang.startsWith("vi")) return "Hủy";
		return "Cancel";
	}, [i18n.language]);
	const actionRef = useRef<ActionType>();
	const hotkeyScopeRef = useRef<HTMLDivElement>(null);
	const [data, setData] = useState<Row[]>([]);
	const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
	const [editableKeys, setEditableKeys] = useState<React.Key[]>([]);
	const [pendingEditableRowId, setPendingEditableRowId] = useState<string | null>(null);
	
	// 🔄 Track database version để force re-compute selectEnums khi missing tables được fetch
	const [databaseVersion, setDatabaseVersion] = useState(0);
	const globalTableFetchCache = useRef(new Map<string, Promise<any>>()).current;
	const hasFetchedComboTables = useRef(false); // Track if we already fetched combo tables on mount
	const [_selectedRow, setSelectedRow] = useState<Row | null>(null);
	const [selectedDetailRow, setSelectedDetailRow] = useState<Row | null>(null); // For detail tabs panel
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingRecord, setEditingRecord] = useState<Row | null>(null);
	const [cloneData, setCloneData] = useState<Row | null>(null);
	const submitInFlightRef = useRef(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
	
	// State để prevent trigger update recursion khi inline edit
	const [isUpdatingFromTrigger, setIsUpdatingFromTrigger] = useState(false);
	const updateTriggerTimeoutRef = useRef<NodeJS.Timeout>();

	// SINGLE SOURCE OF TRUTH: Use database from props first (from AdminPage)
	// Then merge with global database from store for real-time updates
	// This ensures non-menu tables like csm_accounts are available
	const globalDatabase = useAppStore(state => state.database);
	const setTableData = useAppStore(state => state.setTableData); // For updating fetched tables
	const userAppId = useUserStore(state => state.app_id); // Get user appId for fallback
	const userId = useUserStore(state => state.userId);
	const username = useUserStore(state => state.username);
	const userEmail = useUserStore(state => state.email);
	const phoneNumber = useUserStore(state => state.phoneNumber);
	const userDeptId = useUserStore(state => state.dept_id);
	const userBranchId = useUserStore(state => state.branch_id);
	const isDev = useUserStore(state => Boolean(state.dev));
	const database = useMemo(
		() => ({ ..._unusedDatabaseProp, ...globalDatabase }),
		[globalDatabase, _unusedDatabaseProp]
	);
	const effectiveScope = useMemo(() => {
		if (isDev) return "ALL";
		const userScope = normalizeScope(dataScope);
		const menuScope = normalizeScope((m_configs as any)?.data_scope_override || (m_configs as any)?.dataScopeOverride || "NONE");
		if (menuScope === "NONE") return userScope;
		return minScope(menuScope, userScope);
	}, [isDev, dataScope, m_configs]);
	// Helpers
	const tableName = (m_configs.table_name || "").split(",")[0];
	const hasTableName = Boolean(tableName);
	const [, setUpdateTrigger] = useState(0);
	const pkFields = useMemo(() => getPrimaryKeyFields(m_configs), [m_configs.struct?.fieldsPK]);
	const getRowKey = useCallback((row: Row | null | undefined) => buildRowKey(row, pkFields), [pkFields]);
	const syncMasterTableRows = useCallback((nextRows: Row[]) => {
		if (isDetailGrid || !tableName) return;
		const currentStoreTable = useAppStore.getState().database[tableName];
		const fallbackTable = database[tableName];
		const sourceTable = currentStoreTable || fallbackTable;
		setTableData(tableName, {
			id: sourceTable?.id || tableName,
			fields: sourceTable?.fields,
			fieldsPK: sourceTable?.fieldsPK || pkFields,
			rows: nextRows,
			app_id: sourceTable?.app_id || appId,
		});
	}, [appId, database, isDetailGrid, pkFields, setTableData, tableName]);

	// Enable socket for real-time database updates
	useSocket({ enabled: true });
	
	// 🔄 Auto-fetch missing combo tables ONCE on mount
	useEffect(() => {
		// Only fetch once per component lifecycle
		if (hasFetchedComboTables.current) return;
		hasFetchedComboTables.current = true;
		
		console.log('[CsmDynamicGrid] Scanning combo queries for missing tables...');
		
		// Collect all combo queries that need table data
		const comboFields = (m_configs?.table || []).filter((f: TableField) => {
			const types = (f.f_types || '').toLowerCase();
			return types.indexOf('co') !== -1; // co = combo
		});
		
		const tablesToFetch: Array<{tableName: string; appId: string; whereClause: any}> = [];
		
		comboFields.forEach((f: TableField) => {
			const rawQuery = f.f_cbo_query;
			if (!rawQuery) return;
			
			let q = rawQuery;
			// Try decrypt
			if (decrypt) {
				try {
					const decrypted = decrypt(q);
					q = decrypted;
				} catch {}
			}
			
			const trimmedQ = q.trim();
			if (trimmedQ.startsWith('{') || trimmedQ.startsWith('[')) {
				let parsed: any;
				try {
					parsed = JSON.parse(trimmedQ);
				} catch {
					try {
						const evalFn = new Function(`return (${trimmedQ})`);
						parsed = evalFn();
					} catch {
						return;
					}
				}
				
				// Extract table info from parsed query
				if (parsed && Array.isArray(parsed.query)) {
					parsed.query.forEach((querySpec: any) => {
						if (!querySpec?.obj_name) return;
						
						const tableName = querySpec.obj_name;
						const queryAppId = querySpec.app_id || userAppId || appId || 'csm';
						let whereClause = querySpec.obj_where;
						
						// Default obj_where if not provided or invalid
						// Check for: undefined, null, empty string, empty object, or object without required fields
						const isInvalidWhere = !whereClause 
							|| (typeof whereClause === 'string' && !whereClause.trim())
							|| (typeof whereClause === 'object' && (!whereClause.field || !whereClause.type));
						
						if (isInvalidWhere) {
							whereClause = {field: 'id', type: 'like', value: ""};
							console.log(`[CsmDynamicGrid] Using default where clause for ${tableName}:`, whereClause);
						}
						
						tablesToFetch.push({ tableName, appId: queryAppId, whereClause });
					});
				}
			}
		});
		
		// Remove duplicates (same table + same where clause)
		const uniqueFetches = tablesToFetch.filter((item, index, self) => {
			const key = `${item.appId}::${item.tableName}::${JSON.stringify(item.whereClause)}`;
			return index === self.findIndex(t => 
				`${t.appId}::${t.tableName}::${JSON.stringify(t.whereClause)}` === key
			);
		});
		
		if (uniqueFetches.length === 0) {
			console.log('[CsmDynamicGrid] No combo tables to fetch');
			return;
		}
		
		console.log(`[CsmDynamicGrid] Found ${uniqueFetches.length} combo tables to fetch:`, uniqueFetches);
		
		// Fetch all tables in parallel
		Promise.all(
			uniqueFetches.map(({tableName, appId, whereClause}) => 
				ensureTableInDatabase(tableName, appId, whereClause)
					.catch(err => {
						console.error(`Failed to fetch ${tableName}:`, err);
						return null; // Don't fail entire Promise.all
					})
			)
		).then(() => {
			console.log('[CsmDynamicGrid] All combo tables fetched, triggering re-compute...');
			setDatabaseVersion(v => v + 1);
		});
	}, []); // Empty deps = run once on mount
	
	// 🔧 Helper: Auto-fetch missing table when combo query needs it
	const ensureTableInDatabase = useCallback(async (
		tableName: string,
		queryAppId?: string,
		whereClause?: any
	): Promise<boolean> => {
		// Fallback appId: query.app_id > logged-in user.app_id > props.appId
		const effectiveAppId = queryAppId || userAppId || appId || 'csm';
		
		// Include where clause in cache key to handle different filters on same table
		const whereSuffix = whereClause ? `::${JSON.stringify(whereClause)}` : '';
		const cacheKey = `${effectiveAppId}::${tableName}${whereSuffix}`;
		
		// ✅ IMPORTANT: If whereClause exists, ALWAYS fetch (API requires obj_where to return data)
		// Don't check existing data because previous fetch might have different/no where clause
		if (!whereClause) {
			// Only check existing data if no where clause
			const existing = database[tableName];
			if (existing && (Array.isArray(existing) || (existing.rows && Array.isArray(existing.rows)))) {
				const rowCount = Array.isArray(existing) ? existing.length : existing.rows?.length || 0;
				if (rowCount > 0) {
					console.log(`✓ [AutoFetch] Table ${tableName} already in database (${rowCount} rows)`);
					return false; // Already have data
				}
			}
		} else {
			console.log(`🔍 [AutoFetch] Query has where clause, will fetch ${tableName} with filter (ignore existing data)`);
		}

		// Check if currently fetching this specific query (same table + same where)
		if (globalTableFetchCache.has(cacheKey)) {
			// Already fetching, wait for it
			console.log(`⏳ [AutoFetch] Already fetching ${tableName} with same where clause, waiting...`);
			try {
				await globalTableFetchCache.get(cacheKey);
				return true; // Was fetching
			} catch (err) {
				console.warn(`[ensureTableInDatabase] Failed to fetch ${tableName}:`, err);
				globalTableFetchCache.delete(cacheKey);
				return true;
			}
		}

		// Start fetching
		console.log(`🔄 [AutoFetch] Fetching missing table: ${tableName} (app: ${effectiveAppId})`, whereClause ? `with where:` : '', whereClause);
		
		// Build request params - include where if provided
		const requestParams: any = {
			app_id: effectiveAppId,
			obj_name: tableName,
		};
		if (whereClause) {
			requestParams.where = whereClause;
		}
		
		const fetchPromise = getTableData<any>(requestParams)
			.then((response) => {
				const rows = response?.rows || [];
				console.log(`✅ [AutoFetch] Fetched ${tableName}: ${rows.length} rows`, rows.slice(0, 3));
				
				// ✅ CRITICAL: Update global store instead of mutating local database object
				// This triggers re-render and database useMemo will have new data
				setTableData(tableName, {
					id: tableName,
					rows,
					app_id: effectiveAppId,
				});
				
				globalTableFetchCache.delete(cacheKey);
				console.log(`🎉 [AutoFetch] Successfully populated ${tableName} in global store`);
				return rows;
			})
			.catch((err) => {
				console.error(`❌ [AutoFetch] Failed to fetch ${tableName}:`, err);
				globalTableFetchCache.delete(cacheKey);
				// Set empty data to avoid repeated failures
				setTableData(tableName, {
					id: tableName,
					rows: [],
					app_id: effectiveAppId,
				});
				throw err;
			});

		globalTableFetchCache.set(cacheKey, fetchPromise);
		
		// Kick off fetch but don't wait
		fetchPromise.catch(() => {}); // Ignore error (already logged)
		
		return true; // Started fetching
	}, [database, appId, userAppId, globalTableFetchCache, setTableData]);

	// Helper: Create seft context with all utility functions
	const createSeftContext = useCallback(() => ({
		m_configs,
		context,
		database,
		appId,
		user: useUserStore.getState(),
		csmEncrypt,
		csmDecrypt,
		// Lunar calendar utilities
		INT,
		jdFromDate,
		jdToDate,
		NewMoon,
		KinhDoMatTroi,
		SunLongitude,
		getSunLongitude,
		getNewMoonDay,
		getLunarMonth11,
		getLeapMonthOffset,
		duong_qua_am,
		am_qua_duong,
		LunarCalendar,
		// Date utilities
		dateFormat,
		chuyenNgay,
		TruNgayRaSoNgay,
		CongNgay,
		CongGio,
		validateEmail,
		validatePhone,
		DateUtils,
	}), [m_configs, context, database, appId]);

	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 768);
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	const permissionBits = useMemo(() => toPermissionBigInt(permissions), [permissions]);
	const canAll = permissions === -1 || permissionBits === -1n;
	const legacyMask = menusPermissions && menuId != null ? Number(menusPermissions[menuId] ?? 0) : 0;
	const hasBitfieldActions = hasAnyPermissionBit(permissionBits, PERMISSION_BITS.action.view, PERMISSION_BITS.action.export);
	const hasBitfieldMenus = hasAnyPermissionBit(permissionBits, PERMISSION_BITS.menu.min, PERMISSION_BITS.menu.max);
	const menuBitIndex = parseMenuBitIndex(menuId);
	const menuGrantedByBitfield = !hasBitfieldMenus || (menuBitIndex !== null && hasPermissionBit(permissionBits, menuBitIndex));
	const canCreateByBitfield = hasPermissionBit(permissionBits, PERMISSION_BITS.action.create);
	const canEditByBitfield = hasPermissionBit(permissionBits, PERMISSION_BITS.action.edit);
	const canDeleteByBitfield = hasPermissionBit(permissionBits, PERMISSION_BITS.action.delete);
	const isReadonly = !!m_configs.g_readonly;
	const canAdd = !isReadonly && (canAll || ((legacyMask & 2) !== 0) || (hasBitfieldActions && menuGrantedByBitfield && canCreateByBitfield));
	const canEdit = !isReadonly && (canAll || ((legacyMask & 4) !== 0) || (hasBitfieldActions && menuGrantedByBitfield && canEditByBitfield));
	const canDelete = !isReadonly && (canAll || ((legacyMask & 8) !== 0) || (hasBitfieldActions && menuGrantedByBitfield && canDeleteByBitfield));

	// type_form: "" (không chọn), 1 (dạng bảng), 2 (dạng Master-Detail)
	// row_type_edit: 0 (dạng Form popup), 1 (chỉnh sửa trên dòng)
	const typeForm = m_configs.type_form || "";
	const rowTypeEdit = m_configs.row_type_edit || 0;

	// Enable inline cell editing when row_type_edit = 1 (regardless of type_form)
	// This allows inline editing in both table and master-detail views
	const enableInlineCellEdit = Number(rowTypeEdit) === 1;
	
	// Debug log
	// console.log('[CsmDynamicGrid] Edit mode config:', {
	// 	typeForm,
	// 	rowTypeEdit,
	// 	enableInlineCellEdit,
	// 	canEdit
	// });

	// Kiểm tra có table_name hay không

	// Subscribe to database changes to force re-render when socket updates nested data
	useEffect(() => {
		console.log(`[CsmDynamicGrid] 🎬 Component rendered (tableName: ${tableName})`);
		console.log(`[CsmDynamicGrid] 🔔 Subscription useEffect triggered for table: ${tableName}`);
		const unsubscribe = useAppStore.subscribe(
			() => {
				console.log(`[CsmDynamicGrid] 📢 Store subscription fired, incrementing trigger for ${tableName}`);
				setUpdateTrigger(prev => prev + 1);
			}
		);
		console.log(`[CsmDynamicGrid] ✅ Subscription registered`);
		return () => {
			console.log(`[CsmDynamicGrid] 🗑️ Subscription cleanup for ${tableName}`);
			unsubscribe();
		};
	}, [tableName, setUpdateTrigger]);

	// Helper: Run UPDATE trigger (Vue compatibility)
	// Chạy TRƯỚC KHI save để tính toán các field tự động
	// Signature: Function("seft", "data", "bang", code)
	// Returns: updated row data
	const runRowTrigger = (triggerName: string, rowData: Row, merge: boolean = true): Row => {
		let code = (m_configs.trigger as any)?.[triggerName];
		if (!code) return rowData;
		
		// Use provided decrypt OR fall back to csmDecrypt
		const effectiveDecrypt = decrypt || csmDecrypt;
		try {
			code = effectiveDecrypt(code);
		} catch (err) {
			console.warn(`Decrypt failed for ${triggerName} trigger, using raw code:`, err);
		}
		const fn = safeEval(["seft", "data", "bang"], code) as ((seft: any, data: Row, bang: Database) => any) | null;
		if (!fn) return rowData;
		try {
			const seftContext = createSeftContext();
			const updatedData = fn(seftContext, JSON.parse(JSON.stringify(rowData)), database);
			if (!merge) return rowData;
			if (updatedData && typeof updatedData === 'object') {
				return { ...rowData, ...updatedData };
			}
			return rowData;
		} catch (err) {
			console.error(`${triggerName} trigger error:`, err);
			return rowData;
		}
	};

	const runSideEffectTrigger = (triggerName: string, rowData: Row) => {
		let code = (m_configs.trigger as any)?.[triggerName];
		if (!code) return;
		
		// Use provided decrypt OR fall back to csmDecrypt
		const effectiveDecrypt = decrypt || csmDecrypt;
		try {
			code = effectiveDecrypt(code);
		} catch (err) {
			console.warn(`Decrypt failed for ${triggerName} trigger, using raw code:`, err);
		}
		const fn = safeEval(["seft", "data", "bang"], code) as ((seft: any, data: Row, bang: Database) => any) | null;
		if (!fn) return;
		try {
			fn({ m_configs, context, database }, JSON.parse(JSON.stringify(rowData)), database);
		} catch (err) {
			console.error(`${triggerName} trigger error:`, err);
		}
	};

	const runUpdateTrigger = (rowData: Row): Row => {
		let next = rowData;
		next = runRowTrigger("update", next, true);
		next = runRowTrigger("barcode", next, true);
		return next;
	};

	const runBeforeSaveTrigger = useCallback(async (rowData: Row): Promise<Row | false> => {
		const trigger = m_configs.trigger?.beforeSave;
		if (!trigger) {
			return normalizeRowComboFieldsByQuery(rowData, m_configs.table || [], database, decrypt || csmDecrypt);
		}

		const seftContext = createSeftContext();
		const inputRow = JSON.parse(JSON.stringify(rowData || {}));

		const normalizeResult = (result: any): Row | false => {
			if (result === false) return false;
			const merged = result && typeof result === "object"
				? { ...rowData, ...result }
				: rowData;
			return normalizeRowComboFieldsByQuery(merged, m_configs.table || [], database, decrypt || csmDecrypt);
		};

		if (typeof trigger === "function") {
			const result = await (trigger as (row: Row, seft: any, data: Database) => any)(inputRow, seftContext, database);
			return normalizeResult(result);
		}

		let code = String(trigger);
		const effectiveDecrypt = decrypt || csmDecrypt;
		try {
			code = effectiveDecrypt(code);
		} catch {
			// Keep raw code when trigger is not encrypted.
		}

		const compileAttempts: Array<{ body: string; label: string }> = [
			{
				label: "shimmed-wrapper",
				body: [
					"var validateOrgLink = typeof validateOrgLink === 'function' ? validateOrgLink : function () { return true; };",
					"var findRow = typeof findRow === 'function' ? findRow : function () { return null; };",
					"var resolveComboValueByQuery = typeof resolveComboValueByQuery === 'function' ? resolveComboValueByQuery : function (_field, value) { return value == null ? '' : String(value); };",
					`const __beforeSave = (${code}); return __beforeSave(row, seft, data);`,
				].join("\n"),
			},
			{ label: "plain-wrapper", body: `const __beforeSave = (${code}); return __beforeSave(row, seft, data);` },
			{ label: "raw-code", body: code },
		];

		let lastError: unknown = null;
		for (const attempt of compileAttempts) {
			const body = attempt.body;
			const fn = safeEval<[Row, any, Database], any>(["row", "seft", "data"], body);
			if (!fn) continue;

			try {
				const result = await fn(inputRow, seftContext, database);
				return normalizeResult(result);
			} catch (err) {
				lastError = err;
			}
		}

		if (lastError) {
			console.error("beforeSave trigger error (all attempts failed):", lastError);
		}

		return normalizeRowComboFieldsByQuery(rowData, m_configs.table || [], database, decrypt || csmDecrypt);
	}, [m_configs.trigger, m_configs.table, createSeftContext, database, decrypt]);

	// Helper: Run after trigger (afterAdd, afterEdit, afterDelete)
	// Truyền toàn bộ mảng dữ liệu sau khi thay đổi để trigger có thể sync
	const runAfterTrigger = async (triggerName: 'afterAdd' | 'afterEdit' | 'afterDelete', allData: Row[]) => {
		let code = m_configs.trigger?.[triggerName];
		if (!code) return;
		
		if (decrypt) {
			try {
				code = decrypt(code);
			} catch (err) {
				console.error(`Decrypt error for ${triggerName}:`, err);
				return;
			}
		}
		
		const fn = safeEval(["allData", "seft", "data"], code) as ((allData: Row[], seft: any, data: Database) => any) | null;
		if (fn) {
			try {
				await fn(allData, { m_configs, context }, database);
			} catch (err) {
				console.error(`${triggerName} trigger error:`, err);
			}
		}
	};

	// Build valueEnum for select fields via f_cbo_query (Vue parity: getOptionsSelect)
	const selectEnums = useMemo(() => {
		console.log('[selectEnums] useMemo triggered');
		console.log('[selectEnums] m_configs.table:', m_configs.table);
		console.log('[selectEnums] database keys:', Object.keys(database || {}));
		console.log('[selectEnums] decrypt available:', !!decrypt);

		const localizeOptionLabel = (raw: unknown) => {
			const text = String(raw == null ? "" : raw);
			if (!text) return "";
			return text.includes(".") ? t(text) : text;
		};
		
		const map: Record<string, Record<string, { text: string }>> = {};
		
		// Start with override if provided (for detail grid)
		if (m_configs.selectEnumsOverride) {
			console.log('[selectEnums] Using selectEnumsOverride:', Object.keys(m_configs.selectEnumsOverride));
			Object.assign(map, m_configs.selectEnumsOverride);
		}
		
		const coFields = (m_configs.table || [])
			.filter((f) => Number(f.f_show) === 1 && (f.f_types || "").toLowerCase().indexOf('co') !== -1);
		
		console.log(`[selectEnums] Found ${coFields.length} fields with 'co' type:`, 
			coFields.map(f => ({ name: f.f_name, types: f.f_types, has_query: !!f.f_cbo_query }))
		);
		
		coFields.forEach((f) => {
			let q = f.f_cbo_query || "";
			if (!q) {
				console.warn(`[selectEnums] Field ${f.f_name} has 'co' type but no f_cbo_query`);
				return;
			}
			
			console.log(`[selectEnums] Processing field ${f.f_name}, query (first 100 chars):`, q.substring(0, 100));
			
			// Try decrypt first if available - f_cbo_query might be encrypted!
			if (decrypt) {
				try {
					const decrypted = decrypt(q);
					console.log(`[selectEnums] Successfully decrypted f_cbo_query for ${f.f_name}`);
					q = decrypted;
				} catch (err) {
					// Not encrypted or decrypt failed, use original
					console.log(`[selectEnums] f_cbo_query for ${f.f_name} not encrypted or decrypt failed`);
				}
			}
				
			// Check if it's static JSON (starts with { or [)
			const trimmedQ = q.trim();
			if (trimmedQ.startsWith('{') || trimmedQ.startsWith('[')) {
				// Static JSON - parse directly without decrypt
				let parsed: any;
				try {
					// Try strict JSON parse first
					parsed = JSON.parse(trimmedQ);
				} catch (jsonErr) {
					console.warn(`[selectEnums] JSON.parse failed for ${f.f_name}, trying JS object literal fallback...`);
					// Fallback: Try parsing as JavaScript object literal using Function()
					// This handles cases like: {field: "value"} instead of {"field": "value"}
					try {
						const evalFn = new Function(`return (${trimmedQ})`);
						parsed = evalFn();
						console.log(`[selectEnums] Successfully parsed JS object literal for ${f.f_name}`);
					} catch (evalErr) {
						console.error(`[selectEnums] Both JSON.parse and JS eval failed for ${f.f_name}:`, evalErr);
						console.error(`[selectEnums] Query was:`, trimmedQ);
						// Skip this field if parsing fails
						return;
					}
				}
				
				try {
					console.log(`[selectEnums] Parsed static JSON for ${f.f_name}:`, parsed);
					console.log(`[selectEnums] 🔍 DEBUG parsed.query[0]:`, parsed?.query?.[0]);
					
					// Check if this has a query array (hybrid format: {query: [...], options: [...]})
					// If query exists and is non-empty, we need to process it dynamically
					console.log(`[selectEnums] Checking query for ${f.f_name}:`, {
						hasQuery: parsed && typeof parsed === 'object' && Array.isArray(parsed.query),
						queryLength: Array.isArray(parsed.query) ? parsed.query.length : 0,
						hasDatabase: !!database
					});
					
					if (parsed && typeof parsed === 'object' && 
					    Array.isArray(parsed.query) && parsed.query.length > 0) {
						console.log(`[selectEnums] Detected query array for ${f.f_name}, processing dynamically...`);
							
							// Process each query specification
							const allOptions: any[] = [];
							parsed.query.forEach((querySpec: any) => {
								if (!querySpec.obj_name || !database) {
									return;
								}
								
								const tableName = querySpec.obj_name;
								const fields = querySpec.fields || [];
								// Default obj_where if not provided or invalid
								// Check for: undefined, null, empty string, empty object, or object without required fields
								let whereClause = querySpec.obj_where;
								const isInvalidWhere = !whereClause 
									|| (typeof whereClause === 'string' && !whereClause.trim())
									|| (typeof whereClause === 'object' && (!whereClause.field || !whereClause.type));
								
								if (isInvalidWhere) {
									whereClause = {field: 'id', type: 'like', value: ""};
									console.log(`[selectEnums] Using default where clause for ${tableName}:`, whereClause);
								}
								const queryAppId = querySpec.app_id; // May be undefined
								
								console.log(`[selectEnums] 🔍 Raw querySpec.obj_where:`, querySpec.obj_where);
								console.log(`[selectEnums] 🔍 whereClause after assignment:`, whereClause);
								console.log(`[selectEnums] Querying table: ${tableName}, fields:`, fields, 'where:', whereClause);
								
								const tableData = database[tableName];
								const tableExists = tableData && (Array.isArray(tableData) || (tableData.rows && Array.isArray(tableData.rows)));
								const rows = tableExists ? (Array.isArray(tableData) ? tableData : (tableData as any).rows || []) : [];
								const hasData = tableExists && rows.length > 0;
								
								console.log(`[selectEnums] Checking table ${tableName} in database:`, {
									exists: tableExists,
									rowCount: rows.length,
									hasData,
								});
								
								// Already fetched all combo tables in useEffect mount
								// ONLY build options from database, NO fetch in useMemo
								if (!hasData) {
									console.warn(`[selectEnums] Table ${tableName} not available yet (will be fetched on mount)`);
								

									return;
								}
								
								console.log(`[selectEnums] Building options from ${tableName}: ${rows.length} rows`);


								// Database tables have structure: { rows: Row[] }
								if (!Array.isArray(rows)) {
									console.warn(`[selectEnums] Table ${tableName} has no valid rows array`);
									return;
								}
								
								console.log(`[selectEnums] Table ${tableName} has ${rows.length} total rows`);
								if (rows.length > 0) {
									console.log(`[selectEnums] Sample rows from ${tableName}:`, rows.slice(0, 3));
									console.log(`[selectEnums] 🔍 p_type values in first 10 rows:`, rows.slice(0, 10).map((r: any) => r.p_type));
								}
								
								// Filter data if where clause exists
								let filteredData = rows;
								if (whereClause) {
									try {
										// Support both object and string format for obj_where
										if (typeof whereClause === 'object' && whereClause.field && whereClause.type) {
											// Object format: { field: "p_type", type: "eq", value: 1 }
											const field = whereClause.field;
											const type = whereClause.type;
											const value = whereClause.value;
											
											console.log(`[selectEnums] 🔍 Filtering with object where: field="${field}", type="${type}", value=`, value, `(typeof: ${typeof value})`);
											
											filteredData = rows.filter((row: any) => {
												const rowValue = row[field];
												let matches = false;
												switch (type) {
													case 'eq': matches = rowValue == value; break;
													case 'ne': matches = rowValue != value; break;
													case 'gt': matches = rowValue > value; break;
													case 'gte': matches = rowValue >= value; break;
													case 'lt': matches = rowValue < value; break;
													case 'lte': matches = rowValue <= value; break;
													case 'like': matches = String(rowValue || '').toLowerCase().includes(String(value || '').toLowerCase()); break;
													case 'in': matches = Array.isArray(value) && value.includes(rowValue); break;
													default: matches = true; break;
												}
												return matches;
											});
											
											console.log(`[selectEnums] 🔍 After filtering: ${filteredData.length} rows (from ${rows.length})`);
											if (filteredData.length > 0) {
												console.log(`[selectEnums] 🔍 Sample filtered rows:`, filteredData.slice(0, 3));
											}
										} else if (typeof whereClause === 'string') {
											// String format: "row.p_type === 1"
											const whereFn = safeEval(['row'], `return ${whereClause}`);
											if (whereFn) {
												filteredData = rows.filter((row: any) => whereFn(row));
											}
										}
									} catch (err) {
										console.warn(`[selectEnums] Where clause evaluation failed for ${f.f_name}:`, err);
									}
								}
								
								// Map to options format
								filteredData.forEach((row: any, idx: number) => {
									if (idx === 0) {
										// Log first row to debug field mapping
										console.log(`[selectEnums] Sample row from ${tableName}:`, row);
										console.log(`[selectEnums] Fields mapping:`, {
											fields,
											field0: fields[0],
											field1: fields[1],
											value: row[fields[0]],
											label: row[fields[1]],
											allKeys: Object.keys(row)
										});
									}
									
									if (fields.length >= 2) {
										// First field is value (ma), second is label (ten)
										allOptions.push({
											ma: row[fields[0]],
											ten: row[fields[1]]
										});
									} else if (fields.length === 1) {
										// Single field: use as both value and label
										allOptions.push({
											ma: row[fields[0]],
											ten: row[fields[0]]
										});
									}
								});
							});
							
							// Vue parity: Sort by 'ten' field alphabetically
							allOptions.sort((a, b) => String(a.ten || '').localeCompare(String(b.ten || '')));
							
							console.log(`[selectEnums] Query result for ${f.f_name}: ${allOptions.length} options`, allOptions);
							
							// Now process allOptions as normal
							const enumObj: Record<string, { text: string }> = {};
							allOptions.forEach((opt: any) => {
								if (opt && typeof opt === 'object' && 'ma' in opt && 'ten' in opt) {
									const value = opt.ma;
									const label = localizeOptionLabel(opt.ten);
									console.log(`[selectEnums] Processing option:`, { opt, value, label });
									if (value !== undefined && value !== null) {
										enumObj[String(value)] = { text: String(label) };
									}
								}
							});
							
							if (Object.keys(enumObj).length > 0) {
								console.log(`[selectEnums] ✅ Query result for ${f.f_name}:`, enumObj);
								map[f.f_name] = enumObj;
							} else {
								console.warn(`[selectEnums] No options from query for ${f.f_name}`);
							}
							return; // Done with query processing
						}
						
						// Handle multiple formats:
						// 1. Direct array: ["opt1", "opt2"] or [[val1, label1], [val2, label2]]
						// 2. Object with options key: { options: [...] }
						let options: any[] = [];
						if (Array.isArray(parsed)) {
							options = parsed;
						} else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.options)) {
							options = parsed.options;
						} else {
							console.warn(`[selectEnums] Invalid static JSON format for ${f.f_name}:`, parsed);
							return;
						}
						
						// Vue parity: Sort by label alphabetically
						options.sort((a, b) => {
							let aLabel: string;
							let bLabel: string;
							if (Array.isArray(a)) {
									aLabel = localizeOptionLabel(a[1] ?? a[0] ?? '');
							} else if (a && typeof a === 'object') {
									aLabel = localizeOptionLabel(a.ten ?? a.label ?? a.text ?? a.ma ?? a.value ?? a.id ?? '');
							} else {
									aLabel = localizeOptionLabel(a);
							}
							if (Array.isArray(b)) {
									bLabel = localizeOptionLabel(b[1] ?? b[0] ?? '');
							} else if (b && typeof b === 'object') {
									bLabel = localizeOptionLabel(b.ten ?? b.label ?? b.text ?? b.ma ?? b.value ?? b.id ?? '');
							} else {
									bLabel = localizeOptionLabel(b);
							}
							return aLabel.localeCompare(bLabel);
						});
						
						const enumObj: Record<string, { text: string }> = {};
						options.forEach((opt: any) => {
							let value: any;
							let label: any;
							if (Array.isArray(opt)) {
								// Format: [value, label]
								value = opt[0];
								label = localizeOptionLabel(opt[1] ?? opt[0]);
							} else if (opt && typeof opt === "object") {
								// Format: { ma, ten } (Vue format) or { value, label }
								if ('ma' in opt && 'ten' in opt) {
									value = opt.ma;
									label = localizeOptionLabel(opt.ten);
								} else {
									value = opt.value ?? opt[0];
									label = localizeOptionLabel(opt.label ?? opt.text ?? opt[1] ?? value);
								}
							} else {
								// Primitive value: use as both value and label
								value = opt;
								label = localizeOptionLabel(opt);
							}
							
							// Add to enumObj
							if (value !== undefined && value !== null) {
								enumObj[String(value)] = { text: String(label) };
							}
						});
						
						if (Object.keys(enumObj).length > 0) {
							console.log(`[selectEnums] ✅ Static JSON for ${f.f_name}:`, enumObj);
							map[f.f_name] = enumObj;
						} else {
							console.warn(`[selectEnums] No valid options extracted from static JSON for ${f.f_name}`);
						}
					} catch (e) {
						console.error(`[selectEnums] Failed to parse static JSON for ${f.f_name}:`, e, 'Query:', trimmedQ);
					}
					return;
				}
				
				// Dynamic code - needs evaluation and possibly decryption
				// IMPORTANT: Check if raw q is encrypted BEFORE wrapping with "return "
				// Because if we wrap encrypted string as "return (encrypted...)", it looks like JS!
				let rawCode = q;
				
				// Try to detect if it's encrypted (Base64-like pattern, long, no JS keywords)
				const hasJSSyntax = /[{}()\[\];:,.\s]|return|function|const|let|var|if|for|while|=>|alert|console/.test(rawCode);
				const hasBase64Pattern = /[A-Za-z0-9_\-\/]{50,}/.test(rawCode);
				const looksEncrypted = !hasJSSyntax && hasBase64Pattern;
				
				if (looksEncrypted) {
					// Try decrypt prop first, fall back to csmDecrypt
					if (decrypt) {
						try {
							const decrypted = decrypt(rawCode);
							const before = rawCode.substring(0, 20);
							const after = decrypted.substring(0, 20);
							if (before !== after) {
								rawCode = decrypted;
								console.log(`[selectEnums] decrypt prop worked for ${f.f_name}`);
							} else {
								console.log(`[selectEnums] decrypt prop didn't change code for ${f.f_name}, using csmDecrypt`);
								rawCode = csmDecrypt(rawCode);
							}
						} catch (err) {
							console.warn(`[selectEnums] decrypt prop failed for ${f.f_name}, using csmDecrypt:`, err);
							try {
								rawCode = csmDecrypt(rawCode);
							} catch (decryptErr) {
								console.error(`[selectEnums] csmDecrypt also failed for ${f.f_name}:`, decryptErr);
								return;
							}
						}
					} else {
						try {
							rawCode = csmDecrypt(rawCode);
						} catch (err) {
							console.error(`[selectEnums] csmDecrypt failed for ${f.f_name}:`, err);
							return;
						}
					}
				}
				
				// Now add return prefix if needed
				const body = (rawCode.includes("return ") ? "" : "return ") + rawCode;
				
				const fn = safeEval(["seft", "data"], body) as ((seft: any, data: Database) => any) | null;
				if (!fn) {
					console.error(`[selectEnums] Failed to create function for ${f.f_name}. Code (first 200 chars):`, body.substring(0, 200));
					return;
				}
				
				try {
					const seftContext = createSeftContext();
					const objQa = fn(seftContext, database);
					if (!objQa) {
						console.warn(`[selectEnums] Dynamic code returned null/undefined for ${f.f_name}`);
						return;
					}
					
					console.log(`[selectEnums] Dynamic code result for ${f.f_name}:`, objQa);
					
					// Vue logic: check if has f_grid (special grid combo)
					// f_grid format still has options array - process it!
					if (objQa.hasOwnProperty('f_grid') && objQa.hasOwnProperty('f_grid_fields')) {
						console.log(`[selectEnums] Field ${f.f_name} has f_grid format`);
						// Fall through to process options array below
					}
					
					// Vue logic: must have options property
					if (!objQa.hasOwnProperty('options')) {
						console.warn(`[selectEnums] Result missing 'options' property for ${f.f_name}:`, objQa);
						return;
					}
					
					const options: any[] = Array.isArray(objQa.options) ? objQa.options : [];
					if (options.length === 0) {
						console.warn(`[selectEnums] Empty options array for ${f.f_name}`);
						return;
					}
					
					// Vue parity: Sort by 'ten' field alphabetically (before building enumObj)
					options.sort((a, b) => {
						const aLabel = localizeOptionLabel(a?.ten ?? a?.label ?? a?.text ?? String(a));
						const bLabel = localizeOptionLabel(b?.ten ?? b?.label ?? b?.text ?? String(b));
						return String(aLabel).localeCompare(String(bLabel));
					});
					
					const enumObj: Record<string, { text: string }> = {};
					options.forEach((opt: any) => {
						// Vue format: {ma, ten} or array [value, label]
						let value: any;
						let label: any;
						if (Array.isArray(opt)) {
							// Format: [value, label]
							value = opt[0];
							label = localizeOptionLabel(opt[1] ?? opt[0]);
						} else if (opt && typeof opt === "object") {
							// Format: { ma, ten } (Vue format) - prioritize ma/ten first!
							value = opt.ma ?? opt.value ?? opt.id ?? opt.key;
							label = localizeOptionLabel(opt.ten ?? opt.label ?? opt.text ?? String(value));
						} else {
							// Simple value: "option"
							value = String(opt);
							label = localizeOptionLabel(String(opt));
						}
						if (value != null && value !== "") {
							enumObj[String(value)] = { text: String(label) };
						}
					});
					
					if (Object.keys(enumObj).length > 0) {
						console.log(`[selectEnums] ✅ Dynamic code for ${f.f_name}:`, enumObj);
						map[f.f_name] = enumObj;
					} else {
						console.warn(`[selectEnums] No valid options extracted from dynamic code for ${f.f_name}`);
					}
				} catch (err) {
					console.error(`[selectEnums] Dynamic code execution error for ${f.f_name}:`, err);
				}
			});
		console.log('[selectEnums] Final map:', map);
		return map;
	}, [m_configs.table, database, decrypt, context, m_configs, m_configs.selectEnumsOverride, databaseVersion, ensureTableInDatabase, i18n.language, t]); // 🔄 Re-compute when database/language changes

	// Map backend fields to ProColumns with f_types rules
	const baseColumns: ProColumns<Row>[] = useMemo(() => {
		const shown = (m_configs.table || [])
			.filter((f) => Number(f.f_show) === 1 && f.f_name !== 'id' && !/richtext|html/.test(String(f.f_types || '').toLowerCase()))
			.sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0));

		const cols: ProColumns<Row>[] = shown.map((f) => {
			// Resolve header following current language
			const lang = (i18n.language || "").toLowerCase();
			const candidates: (string | undefined)[] = [];
			if (lang.startsWith("vi")) {
				candidates.push(f.f_header_vi, f.f_header_en, f.f_header_zh, f.f_header);
			} else if (lang.startsWith("en")) {
				candidates.push(f.f_header_en, f.f_header_vi, f.f_header_zh, f.f_header);
			} else if (lang.startsWith("zh")) {
				candidates.push(f.f_header_zh, f.f_header_vi, f.f_header_en, f.f_header);
			} else {
				candidates.push(f.f_header, f.f_header_vi, f.f_header_en, f.f_header_zh);
			}
			const headerText = candidates.find((h) => typeof h === "string" && h.trim() !== "") || f.f_name;

			const types = (f.f_types || "").toLowerCase();
			const typeTokens = types.split(/[,\s;|]+/).filter(Boolean);
			const key = f.f_name;
			const isNumber = /price|number|int|float|double|money|currency/.test(types);
			const isDate = /\bdate\b/.test(types) && !/datetime/.test(types);
			const isDateTime = /datetime/.test(types);
			const isTime = /\btime\b/.test(types) && !/datetime/.test(types);
			const isSelect = typeTokens.includes('co') || /cbo|select/.test(types);
			const isSwitch = /bool|switch|checkbox/.test(types);
			const isTextArea = /textarea|memo/.test(types);
			const isRichText = /richtext|html/.test(types);
			const isPassword = /password/.test(types);
			const isFile = /^file$/.test(types);
			// Kiểu ảnh inline: image_inline, album_inline (cho phép upload trực tiếp trong cell)
			const isImageInline = /image_inline|album_inline/.test(types);
			// Kiểu video inline: video_inline, album_video_inline (cho phép upload trực tiếp trong cell)
			const isVideoInline = /video_inline|album_video_inline/.test(types);
			const isAlbumMedia = /^(album|images|gallery)$/.test(types);
			// Check both f_types and field name for image detection
			const isImage = (/img|image|avatar|photo|picture/.test(types)
				|| /^(thumbnail|cover|avatar|photo)$/i.test(key)) && !isImageInline && !isAlbumMedia;
			// Check for video types (not inline)
			const isVideo = (/^video$|^videos$|^media$|album_video|videos_album/.test(types)) && !isVideoInline;
			// Determine if album (multiple images)
			const isAlbum = /album|album_inline/.test(types);
			// Determine if album video (multiple videos)
			const isAlbumVideo = /album_video|album_video_inline/.test(types);

			const resolvedAlign =
				typeof f.f_align === "string" && ["left", "right", "center"].includes(f.f_align)
					? (f.f_align as "left" | "right" | "center")
					: undefined;

			const col: ProColumns<Row> = {
				title: headerText,
				dataIndex: f.f_name,
				key: f.f_name,
				width: f.width,
				align: resolvedAlign ?? (isNumber ? "right" : "left"),
				// Add responsive property to hide less important columns on mobile
				responsive: (isImage || isVideo || isAlbumMedia) ? ['lg'] : isRichText ? ['md'] : isTextArea ? ['md'] : undefined,
			};

			if (isNumber) col.valueType = "digit";
			else if (isDateTime) col.valueType = "dateTime";
			else if (isDate) col.valueType = "date";
			else if (isTime) col.valueType = "time";
			else if (isTextArea) col.valueType = "textarea";
			else if (isRichText) col.valueType = "text"; // plain text for grid, editor in modal
			else if (isSwitch) col.valueType = "switch";
			else if (isSelect) {
				col.valueType = "select";
				const ve = selectEnums[f.f_name];
				if (ve) col.valueEnum = ve as any;
			}

			if (isNumber) {
				const decimals = Number((f as any).f_dec ?? 0);
				col.render = (_dom, entity) => {
					const raw = entity[f.f_name];
					if (raw == null || raw === "") return "";
					return formatLocalizedNumber(raw, numberLocale, Number.isFinite(decimals) && decimals > 0 ? decimals : 0);
				};
			}

			if (isDate) {
				col.render = (_dom, entity) => formatDateForDisplay(entity[f.f_name], "date", i18n.language);
			}

			if (isDateTime) {
				col.render = (_dom, entity) => formatDateForDisplay(entity[f.f_name], "datetime", i18n.language);
			}

			if (isTime) {
				col.render = (_dom, entity) => formatDateForDisplay(entity[f.f_name], "time", i18n.language);
			}

			if (isFile) {
				// Hiển thị link download cho file
				col.render = (dom, entity) => {
					const value = entity[f.f_name];
					if (!value) return null;
					const fileName = typeof value === 'string' && value.includes('/')
						? value.split('/').pop()
						: 'Download';
					return React.createElement("a", {
						href: String(value),
						target: "_blank",
						rel: "noopener noreferrer",
						style: { color: '#1890ff' }
					}, "📎 " + fileName);
				};
			} else if (isPassword) {
				col.render = () => "••••••";
			} else if (isAlbumMedia) {
				col.render = (dom, entity) => {
					let value = entity[f.f_name];
					if (!value) return null;

					if (typeof value === 'string' && value.trim().startsWith('[')) {
						try {
							value = JSON.parse(value);
						} catch {
							// Not valid JSON, treat as single URL
						}
					}

					const urls: string[] = Array.isArray(value)
						? value.filter((u) => u && typeof u === 'string')
						: (typeof value === 'string' && value ? [value] : []);

					if (urls.length === 0) return null;

					const firstUrl = String(urls[0]);
					const isFirstVideo = /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(firstUrl);

					return React.createElement("a", {
						href: firstUrl,
						target: "_blank",
						rel: "noopener noreferrer",
						style: { position: "relative", display: "inline-block" }
					},
						React.createElement("div", {
							style: { position: "relative", width: 64, height: 64, borderRadius: 4, border: "1px solid #eee", overflow: "hidden", background: "#000" }
						},
							isFirstVideo
								? React.createElement("video", {
									src: firstUrl,
									style: { width: "100%", height: "100%", objectFit: "cover" },
									muted: true,
									playsInline: true,
									preload: "metadata"
								})
								: React.createElement("img", {
									src: firstUrl,
									alt: f.f_header,
									style: { width: "100%", height: "100%", objectFit: "cover" }
								}),
							isFirstVideo ? React.createElement("div", {
								style: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: 20 }
							}, "▶") : null,
							urls.length > 1 ? React.createElement("span", {
								style: {
									position: "absolute",
									bottom: 4,
									right: 4,
									background: "rgba(0,0,0,0.65)",
									color: "white",
									padding: "1px 5px",
									borderRadius: 6,
									fontSize: 11,
									fontWeight: 600
								}
							}, `+${urls.length - 1}`) : null
						)
					);
				};
			} else if (isImage) {
				col.render = (dom, entity) => {
					let value = entity[f.f_name];
					if (!value) return null;

					// Handle JSON string (e.g., '["url1", "url2"]')
					if (typeof value === 'string' && value.trim().startsWith('[')) {
						try {
							value = JSON.parse(value);
						} catch {
							// Not valid JSON, treat as single URL
						}
					}

					const renderThumb = (url: string, extra?: number) => (
						(() => {
							const resolvedUrl = resolveMediaUrl(url);
							return (
						React.createElement("a", {
							href: resolvedUrl,
							target: "_blank",
							rel: "noopener noreferrer",
							style: { position: "relative", display: "inline-block" }
						},
							React.createElement("img", {
								src: resolvedUrl,
								alt: f.f_header,
								style: { maxWidth: 64, maxHeight: 64, objectFit: "cover", borderRadius: 4, border: "1px solid #eee" }
							}),
							extra && extra > 0 ? React.createElement("span", {
								style: {
									position: "absolute",
									bottom: 4,
									right: 4,
									background: "rgba(0,0,0,0.65)",
									color: "white",
									padding: "1px 5px",
									borderRadius: 6,
									fontSize: 11,
									fontWeight: 600
								}
							}, `+${extra}`) : null
						)
							);
						})()
					);

					// Handle array of URLs (show first image with count badge)
					if (Array.isArray(value)) {
						const urls = value.filter(u => u && typeof u === 'string');
						if (urls.length === 0) return null;
						return renderThumb(urls[0], urls.length - 1);
					}

					// Handle single URL string
					return renderThumb(String(value));
				};
			} else if (isImageInline) {
				// Inline image upload in table cell
				col.render = (dom, entity) => {
					const value = entity[f.f_name];

					// Handle JSON string (e.g., '["url1", "url2"]')
					let parsedValue = value;
					if (typeof value === 'string' && value && value.trim().startsWith('[')) {
						try {
							parsedValue = JSON.parse(value);
						} catch {
							// Not valid JSON, treat as single URL
						}
					}

					// Display thumbnail preview
					let urls: string[] = [];
					if (Array.isArray(parsedValue)) {
						urls = parsedValue.filter(u => u && typeof u === 'string');
					} else if (parsedValue && typeof parsedValue === 'string') {
						urls = [parsedValue];
					}

					if (urls.length === 0) {
						return React.createElement("span", { style: { color: '#999', fontSize: 12 } }, "Chưa có ảnh");
					}

					// Show first image with count if album
					const renderThumb = (url: string, extra?: number) => (
						(() => {
							const resolvedUrl = resolveMediaUrl(url);
							return (
						React.createElement("div", { style: { position: "relative", display: "inline-block", width: 48, height: 48 } },
							React.createElement("img", {
								src: resolvedUrl,
								alt: f.f_header,
								style: { maxWidth: 48, maxHeight: 48, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }
							}),
							extra && extra > 0 ? React.createElement("span", {
								style: {
									position: "absolute",
									bottom: -4,
									right: -4,
									background: "#1890ff",
									color: "white",
									padding: "1px 4px",
									borderRadius: 3,
									fontSize: 10,
									fontWeight: 600
								}
							}, `+${extra}`) : null
						)
							);
						})()
					);

					if (isAlbum) {
						return renderThumb(urls[0], urls.length - 1);
					} else {
						return renderThumb(urls[0], 0);
					}
				};
			} else if (isVideo) {
				// Hiển thị thumbnail video
				col.render = (dom, entity) => {
					let value = entity[f.f_name];
					if (!value) return null;

					// Handle JSON string (e.g., '["url1", "url2"]')
					if (typeof value === 'string' && value.trim().startsWith('[')) {
						try {
							value = JSON.parse(value);
						} catch {
							// Not valid JSON, treat as single URL
						}
					}

					const renderVideoThumb = (url: string, extra?: number) => (
						(() => {
							const resolvedUrl = resolveMediaUrl(url);
							return (
						React.createElement("a", {
							href: resolvedUrl,
							target: "_blank",
							rel: "noopener noreferrer",
							style: { position: "relative", display: "inline-block" }
						},
							React.createElement("div", {
								style: { position: "relative", width: 64, height: 64, borderRadius: 4, border: "1px solid #eee", overflow: "hidden", backgroundColor: "#000" }
							},
								React.createElement("video", {
									src: resolvedUrl,
									style: { maxWidth: 64, maxHeight: 64, objectFit: "cover" }
								}),
								React.createElement("div", {
									style: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: 24 }
								}, "▶")
							),
							extra && extra > 0 ? React.createElement("span", {
								style: {
									position: "absolute",
									bottom: 4,
									right: 4,
									background: "rgba(0,0,0,0.65)",
									color: "white",
									padding: "1px 5px",
									borderRadius: 6,
									fontSize: 11,
									fontWeight: 600
								}
							}, `+${extra}`) : null
						)
							);
						})()
					);

					// Handle array of URLs (show first video with count badge)
					if (Array.isArray(value)) {
						const urls = value.filter(u => u && typeof u === 'string');
						if (urls.length === 0) return null;
						return renderVideoThumb(urls[0], urls.length - 1);
					}

					// Handle single URL string
					return renderVideoThumb(String(value));
				};
			} else if (isVideoInline) {
				// Inline video upload in table cell
				col.render = (dom, entity) => {
					const value = entity[f.f_name];

					// Handle JSON string (e.g., '["url1", "url2"]')
					let parsedValue = value;
					if (typeof value === 'string' && value && value.trim().startsWith('[')) {
						try {
							parsedValue = JSON.parse(value);
						} catch {
							// Not valid JSON, treat as single URL
						}
					}

					const urls = Array.isArray(parsedValue) ? parsedValue : (parsedValue ? [parsedValue] : []);
					if (urls.length === 0) return null;

					const renderVideoThumb = (url: string, extra?: number) => (
						(() => {
							const resolvedUrl = resolveMediaUrl(url);
							return (
						React.createElement("div", { style: { position: "relative", display: "inline-block", width: 48, height: 48 } },
							React.createElement("div", {
								style: { position: "relative", width: 48, height: 48, borderRadius: 4, border: "1px solid #ddd", overflow: "hidden", backgroundColor: "#000" }
							},
								React.createElement("video", {
									src: resolvedUrl,
									style: { maxWidth: 48, maxHeight: 48, objectFit: "cover" }
								}),
								React.createElement("div", {
									style: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: 12 }
								}, "▶")
							),
								extra && extra > 0 ? React.createElement("span", {
									style: {
										position: "absolute",
										bottom: -4,
										right: -4,
										background: "#1890ff",
										color: "white",
										padding: "1px 4px",
										borderRadius: 3,
										fontSize: 10,
										fontWeight: 600
									}
								}, `+${extra}`) : null
						)
							);
						})()
					);

					if (isAlbumVideo) {
						return renderVideoThumb(urls[0], urls.length - 1);
					} else {
						return renderVideoThumb(urls[0], 0);
					}
				};
			} else if (isRichText) {
				// Strip HTML tags for grid preview, show ellipsis
				col.render = (dom, entity) => {
					const html = entity[f.f_name];
					if (!html) return "";
					const text = String(html).replace(/<[^>]+>/g, "").trim();
					const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;
					return React.createElement("span", { title: text, style: { fontSize: 12, color: "#666" } }, preview);
				};
			}

			if (f.f_format && !isImage && !isPassword && !isRichText) {
				const fmt = f.f_format;
				col.render = (dom, entity) => {
					const val = entity[f.f_name];
					if (val == null) return "";
					try {
						// simple replace: e.g. "{0}" templates
						return String(fmt).replace(/\{0\}/g, String(val));
					} catch {
						return String(val);
					}
				};
			}

			return col;
		});
		return cols;
	}, [m_configs.table, selectEnums, i18n.language, numberLocale]);

  // Apply datacolumntemplate trigger (mutates columns)
	const columns = useMemo<ProColumns<Row>[]>(() => {
		const cols = [...baseColumns];
		
		// Add inline cell editing support when enableInlineCellEdit is true
		if (enableInlineCellEdit && canEdit) {
			cols.forEach((col) => {
				// Skip id column
				if (col.key === 'id' || col.dataIndex === 'id') {
					return;
				}

				// Make column editable
				const field = m_configs.table.find(f => f.f_name === col.dataIndex);
				if (!field) return;

				const types = (field.f_types || "ed").toLowerCase();
				const isReadonly = types.indexOf('ro') !== -1;
				const isRichText = /richtext|html/.test(types);
				const isCodeEditor = /code/.test(types);
				const isFile = /^file$/.test(types);
				const isImageInline = /image_inline|album_inline/.test(types);
				const isVideoInline = /video_inline|album_video_inline/.test(types);
				const isImage = (/img|image|avatar|photo|picture|album|gallery/.test(types)
					|| /^(thumbnail|cover|images|avatar|photo)$/i.test(String(col.dataIndex))) && !isImageInline;
				const isVideo = (/^video$|^videos$|^media$|album_video|videos_album/.test(types)) && !isVideoInline;
				const isPassword = /password/.test(types);

				// Skip readonly, complex types, and non-editable types
				// Allow image_inline, album_inline, video_inline and album_video_inline to be edited
				if (isReadonly || isRichText || isCodeEditor || isFile || isImage || isVideo || isPassword) {
					return;
				}

				// Enable editing for this column
				col.editable = () => true;

				const validationRules = buildInlineValidationRules(field);
				if (validationRules.length > 0) {
					col.formItemProps = () => ({ rules: validationRules });
				}

				const minRaw = Number((field as any).f_min ?? (field as any).min);
				const maxRaw = Number((field as any).f_max ?? (field as any).max);
				const decimals = Number((field as any).f_dec ?? 0);
				const typeTokens = types.split(/[\s,;|]+/).filter(Boolean);
				const isNumberField = /price|number|int|float|double|money|currency/.test(types);
				const isSelectField = typeTokens.includes('co') || /cbo|select/.test(types);
				const isDateField = /^date$/.test(types);
				const isDateTimeField = /datetime/.test(types);
				const isTimeField = /^time$/.test(types);

				if (isNumberField) {
					col.fieldProps = {
						...(col.fieldProps as Record<string, any> || {}),
						precision: Number.isFinite(decimals) && decimals > 0 ? decimals : 0,
						formatter: (value: any) => formatLocalizedNumber(value, numberLocale, Number.isFinite(decimals) && decimals > 0 ? decimals : 0),
						parser: (value: any) => {
							const parsed = parseFlexibleNumberInput(value, numberLocale);
							return Number.isFinite(parsed) ? String(parsed) : "";
						},
						...(Number.isFinite(minRaw) ? { min: minRaw } : {}),
						...(Number.isFinite(maxRaw) ? { max: maxRaw } : {}),
					};
				}

				if (isSelectField) {
					col.fieldProps = {
						...(col.fieldProps as Record<string, any> || {}),
						showSearch: true,
						allowClear: true,
						optionFilterProp: "label",
					};
				}

				if (isDateField) {
					col.fieldProps = {
						...(col.fieldProps as Record<string, any> || {}),
						format: dateLocaleFormat.date,
					};
				}

				if (isDateTimeField) {
					col.fieldProps = {
						...(col.fieldProps as Record<string, any> || {}),
						format: dateLocaleFormat.datetime,
					};
				}

				if (isTimeField) {
					col.fieldProps = {
						...(col.fieldProps as Record<string, any> || {}),
						format: dateLocaleFormat.time,
					};
				}
			});
		}
		
		let code = m_configs.trigger?.datacolumntemplate;
		if (code && decrypt) {
			try { code = decrypt(code); } catch {}
		}
		if (code) {
			const fn = safeEval(["columns", "seft", "React"], code) as ((columns: ProColumns<Row>[], seft: any, React: any) => ProColumns<Row>[]) | null;
			if (fn) {
				try {
					const next = fn(cols, { m_configs, database, context }, React);
					if (Array.isArray(next)) return next;
				} catch {}
			}
		}

		if (canEdit || canDelete) {
			cols.push({
				title: t("common.action"),
				key: "action",
				valueType: "option",
				width: 200,
				fixed: "right",
				render: (_, record) => {
					const children: React.ReactNode[] = [];
					// Show Edit button for both inline and modal editing
					if (canEdit) {
						children.push(React.createElement(Button, { type: "link", style: { padding: 0, marginRight: 8 }, onClick: () => {
							handleEdit(record);
						}, key: "edit" }, t("common.edit")));
					}
					if (canAdd) {
						children.push(React.createElement(Button, { type: "link", style: { padding: 0, marginRight: 8, color: "#52c41a" }, onClick: () => {
							handleClone(record);
						}, key: "clone" }, t("common.clone")));
					}
					if (canDelete) {
						children.push(React.createElement(Button, { type: "link", danger: true, style: { padding: 0 }, onClick: () => {
							Modal.confirm({
								title: t("common.confirmDeleteTitle"),
								content: t("common.deleteRecordConfirm"),
								okText: t("common.delete"),
								okType: "danger",
								cancelText: t("common.cancel"),
								onOk: async () => {
									// Detail grid: chỉ xóa local, không gọi API
									// Giống Vue: chỉ lưu khi master save
									if (isDetailGrid || !hasTableName) {
										setData(prev => {
											const deletedRowKey = getRowKey(record);
											const next = prev.filter(row => getRowKey(row) !== deletedRowKey);
											runAfterTrigger('afterDelete', next);
											return next;
										});
										message.success(t("common.deleteSuccess"));
										onDelete?.(record);
										if (isDetailGrid) {
											onDataChange?.();
										}
										return;
									}
									
									if (!appId) {
										message.error(t("common.missingAppId"));
										return;
									}
									
									try {
										const pkFields = m_configs.struct?.fieldsPK || ["id"];
										const obj_update: any = {};
										const whereOld: any = {};
										
										for (const pkField of pkFields) {
											const oldVal = record[pkField];
											if (oldVal !== undefined && oldVal !== null) {
												obj_update[pkField] = oldVal;
												whereOld[pkField] = oldVal;
											}
										}
										
										// Check if at least one primary key is present
										if (Object.keys(whereOld).length === 0) {
											console.error("❌ No primary key values found:", pkFields);
											message.error(`Thiếu giá trị khóa chính: ${pkFields.join(", ")}`);
											return;
										}
										
										await updateTableData<Row>({ 
											app_id: appId, 
											obj_name: tableName, 
											command: "delete", 
											obj_update,
											pk_fields: pkFields,
											where: whereOld
										});
										
										// Update local state immediately
										const deletedRowKey = getRowKey(record);
										const nextRows = data.filter(row => getRowKey(row) !== deletedRowKey);
										runAfterTrigger('afterDelete', nextRows);
										setData(nextRows);
										syncMasterTableRows(nextRows);
										
										message.success(t("common.deleteSuccess"));
										onDelete?.(record);
									} catch (err) {
										console.error("❌ Delete error:", err);
										message.error(`${t("common.fail")}: ${(err as Error).message}`);
									}
								}
							});
						}, key: "del" }, t("common.delete")));
					}
					return React.createElement("span", null, ...children);
				},
			});
		}
		return cols;
	}, [baseColumns, m_configs, database, context, canEdit, canDelete, canAdd, onEdit, onDelete, decrypt, appId, tableName, enableInlineCellEdit, numberLocale, dateLocaleFormat]);

	// Apply datarowtemplate trigger (Vue parity: Function("container", "item", code))
	const rowTemplateFn = useMemo(() => {
		let code = m_configs.trigger?.datarowtemplate;
		if (!code) return null;
		
		// Use provided decrypt OR fall back to csmDecrypt
		const effectiveDecrypt = decrypt || csmDecrypt;
		try {
			code = effectiveDecrypt(code);
		} catch {
			// ignore decrypt errors
		}
		if (!code) return null;
		return safeEval(["container", "item", "React"], code) as ((container: any, item: Row, React: any) => any) | null;
	}, [m_configs.trigger, decrypt]);

	const useRowTemplate = !!rowTemplateFn;

	// load_db trigger or default database lookup
	// Nếu không có table_name: áp dụng load_db trigger từ field tables để đưa dữ liệu lên trang
	// Nếu có table_name: lấy từ API hoặc fullDatabase[tableName]
	useEffect(() => {
		// For detail grids, skip trigger and use database directly
		if (isDetailGrid) {
			const fallback = database[tableName]?.rows || [];
			setData(fallback);
			return;
		}
		
		let loadCode = m_configs.trigger?.load_db;
		if (loadCode && decrypt) {
			try {
				loadCode = decrypt(loadCode);
			} catch {
				// ignore
			}
		}
		
		// Nếu có load_db trigger, luôn chạy trigger trước
		if (loadCode) {
			const fn = safeEval(["seft", "db"], loadCode) as ((seft: any, db: Database) => Row[]) | null;
			if (fn) {
				try {
					const rows = fn({ m_configs, context }, database) || [];
					setData(Array.isArray(rows) ? rows : []);
					return;
				} catch (err) {
					console.warn("load_db trigger error:", err);
					// Fall back to default behavior
				}
			}
		}
		
		// Nếu không có load_db trigger hoặc trigger lỗi:
		// - Nếu có table_name: lấy từ database[tableName]
		// - Nếu không có table_name: dữ liệu sẽ được xử lý thông qua trigger và field tables
		if (hasTableName) {
			const fallback = database[tableName]?.rows || [];
			setData(fallback);
		} else {
			// Không có table_name: khởi tạo dữ liệu trống, chỉ cập nhật khi có trigger hoặc user nhập liệu
			setData([]);
		}
	}, [m_configs, database, context, isDetailGrid, tableName, hasTableName]);

	// Auto-reload data when global database changes (e.g., from socket updates)
	// This makes the component reactive to real-time updates without manual socket handling
	useEffect(() => {
		console.log(`[CsmDynamicGrid] 🔄 Data loading useEffect triggered (tableName: ${tableName}, hasTableName: ${hasTableName})`);
		console.log(`[CsmDynamicGrid] decrypt function available: ${!!decrypt}`);
		console.log(`[CsmDynamicGrid] decrypt function name: ${decrypt?.name || 'anonymous'}`);
		
		if (!hasTableName) return;
		
		const globalTableData = database[tableName];
		if (!globalTableData) {
			console.log(`[CsmDynamicGrid] ⚠️ No table data found for '${tableName}'`);
			return;
		}
		
		// Check if global data has changed
		const globalRows = globalTableData.rows || [];
		console.log(`[CsmDynamicGrid] 📊 Global rows for '${tableName}': ${globalRows.length} rows`);
		
		// Nếu có load_db trigger, luôn ưu tiên trigger
		let loadCode = m_configs.trigger?.load_db;
		if (loadCode) {
			console.log(`[CsmDynamicGrid] load_db trigger found, length: ${loadCode.length}`);
			console.log(`[CsmDynamicGrid] load_db trigger (first 100 chars): ${loadCode.substring(0, 100)}`);
			try {
				let resolvedCode = loadCode;
				
				// Try provided decrypt first
				if (decrypt) {
					try {
						const beforeDecrypt = resolvedCode.substring(0, 50);
						const decrypted = decrypt(loadCode);
						const afterDecrypt = decrypted.substring(0, 50);
						console.log("[CsmDynamicGrid] Decrypt attempt:", { before: beforeDecrypt, after: afterDecrypt });
						
						// Check if decrypt actually changed the code
						if (beforeDecrypt === afterDecrypt) {
							console.warn("[CsmDynamicGrid] ⚠️ decrypt prop did not change code - trying csmDecrypt fallback");
							resolvedCode = csmDecrypt(loadCode);
						} else {
							resolvedCode = decrypted;
							console.log("[CsmDynamicGrid] ✅ decrypt prop worked");
						}
					} catch (decryptErr) {
						console.warn("[CsmDynamicGrid] decrypt prop failed, trying csmDecrypt fallback:", decryptErr);
						resolvedCode = csmDecrypt(loadCode);
					}
				} else {
					console.log("[CsmDynamicGrid] No decrypt prop, using csmDecrypt");
					resolvedCode = csmDecrypt(loadCode);
				}
				
				console.log(`[CsmDynamicGrid] Final code (first 100 chars): ${resolvedCode.substring(0, 100)}`);
				const fn = safeEval(["seft", "db"], resolvedCode) as ((seft: any, db: Database) => Row[]) | null;
				if (fn) {
					const seftContext = createSeftContext();
					const rows = fn(seftContext, database) || [];
					setData(Array.isArray(rows) ? rows : []);
					console.log(`[CsmDynamicGrid] ✅ Data reloaded via trigger from global database (${rows.length} rows)`);
					return;
				}
			} catch (err) {
				console.warn("[CsmDynamicGrid] load_db trigger error:", err);
			}
		}
		
		// Fallback: load directly from global database
		setData(globalRows);
		console.log(`[CsmDynamicGrid] ✅ Data synced from global database (${globalRows.length} rows)`);
	}, [database, tableName, hasTableName, m_configs, context, decrypt]);

  // filter trigger (runs on data)
	const filtered = useMemo(() => {
		let code = m_configs.trigger?.filter;
		
		if (code) {
			try {
				// Try provided decrypt first, fall back to csmDecrypt if it doesn't work
				if (decrypt) {
					const before = code.substring(0, 20);
					const decrypted = decrypt(code);
					const after = decrypted.substring(0, 20);
					if (before === after) {
						console.log("[selectEnums.filter] decrypt prop didn't change code, using csmDecrypt");
						code = csmDecrypt(code);
					} else {
						code = decrypted;
					}
				} else {
					code = csmDecrypt(code);
				}
			} catch {
				// Try csmDecrypt as fallback
				try {
					code = csmDecrypt(code);
				} catch {
					// ignore
				}
			}
		}
		if (!code) return data;
		const fn = safeEval(["obj"], code) as ((obj: Row) => boolean) | null;
		if (!fn) return data;
		try {
			return data.filter((r) => !!fn(r));
		} catch {
			return data;
		}
	}, [data, m_configs.trigger]);

	// Derived searchable fields
	const derivedSearchFields = useMemo(() => {
		if (Array.isArray(searchFields) && searchFields.length) return searchFields;
		return (m_configs.table || [])
			.filter(f => Number(f.f_show) === 1)
			.map(f => f.f_name)
			.filter(name => {
				// Heuristic: only simple text-like fields
				const tf = (m_configs.table.find(f => f.f_name === name)?.f_types || "").toLowerCase();
				return /ed|text|textarea|html|slug|name|title|excerpt|code|status/.test(tf);
			});
	}, [searchFields, m_configs.table]);

	const searchedData = useMemo(() => {
		let sourceRows = filtered;

		if (effectiveScope === "OWNER") {
			const ownerCandidates = [userId, username, userEmail, phoneNumber, userAppId]
				.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
				.map(v => v.trim().toLowerCase());
			const ownerFields = ["created_by", "create_by", "owner_id", "owner", "user_id", "userid", "account_id", "parent_account_id"];

			sourceRows = filtered.filter((row) => {
				const existingOwnerField = ownerFields.find((field) => row?.[field] != null && String(row[field]).trim() !== "");
				if (!existingOwnerField) return true;
				const ownerValue = String(row[existingOwnerField] || "").trim().toLowerCase();
				return ownerCandidates.includes(ownerValue);
			});
		} else if (effectiveScope === "DEPARTMENT") {
			const deptCandidates = [userDeptId]
				.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
				.map(v => v.trim().toLowerCase());
			const deptFields = ["dept_id", "department_id", "team_id", "org_unit_id"];

			sourceRows = filtered.filter((row) => {
				const existingDeptField = deptFields.find((field) => row?.[field] != null && String(row[field]).trim() !== "");
				if (!existingDeptField) return true;
				const deptValue = String(row[existingDeptField] || "").trim().toLowerCase();
				return deptCandidates.includes(deptValue);
			});
		} else if (effectiveScope === "BRANCH") {
			const branchCandidates = [userBranchId]
				.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
				.map(v => v.trim().toLowerCase());
			const branchFields = ["branch_id", "site_id", "region_id"];

			sourceRows = filtered.filter((row) => {
				const existingBranchField = branchFields.find((field) => row?.[field] != null && String(row[field]).trim() !== "");
				if (!existingBranchField) return true;
				const branchValue = String(row[existingBranchField] || "").trim().toLowerCase();
				return branchCandidates.includes(branchValue);
			});
		}

		if (!enableSearch || !searchTerm.trim()) return sourceRows;
		const term = searchTerm.trim().toLowerCase();
		return sourceRows.filter(row => {
			return derivedSearchFields.some(field => {
				const val = row[field];
				if (val == null) return false;
				return String(val).toLowerCase().includes(term);
			});
		});
	}, [filtered, enableSearch, searchTerm, derivedSearchFields, effectiveScope, userId, username, userEmail, phoneNumber, userAppId, userDeptId, userBranchId]);

	// Auto-enable edit mode for newly added rows
	useEffect(() => {
		if (pendingEditableRowId && searchedData.some(row => getRowKey(row) === pendingEditableRowId)) {
			setEditableKeys([pendingEditableRowId]);
			setPendingEditableRowId(null);
		}
	}, [pendingEditableRowId, searchedData, getRowKey]);

	// Phím tắt theo cách tổ chức Vue: Ctrl+S (save), F4 (add), F3 (edit), F8 (delete)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const activeElement = document.activeElement as HTMLElement | null;
			const inGridScope = !!(activeElement && hotkeyScopeRef.current?.contains(activeElement));
			const modalOpen = editorOpen;
			if (!inGridScope && !modalOpen) return;

			if (e.ctrlKey && e.key.toLowerCase() === "s") {
				e.preventDefault();
				if (modalOpen) {
					const modalSaveBtn = Array.from(document.querySelectorAll(".ant-modal .ant-btn-primary"))
						.find((btn) => !(btn as HTMLButtonElement).disabled) as HTMLButtonElement | undefined;
					modalSaveBtn?.click();
					return;
				}
				if (enableInlineCellEdit && editableKeys.length > 0) {
					const anyAction = actionRef.current as any;
					if (typeof anyAction?.saveEditable === "function") {
						editableKeys.forEach((rowKey) => {
							void anyAction.saveEditable(rowKey);
						});
						return;
					}
					const localSaveBtn = hotkeyScopeRef.current
						? (hotkeyScopeRef.current.querySelector(".ant-btn-primary") as HTMLButtonElement | null)
						: null;
					localSaveBtn?.click();
				}
				return;
			}
			if (e.key === "F4" && canAdd) {
				e.preventDefault();
				handleAdd();
			}
			if (e.key === "F3" && canEdit && _selectedRow) {
				e.preventDefault();
				handleEdit(_selectedRow);
			}
			if (e.key === "F8" && canDelete && _selectedRow) {
				e.preventDefault();
				// eslint-disable-next-line no-alert
				const ok = window.confirm(t("common.deleteRecordConfirm"));
				if (ok) void handleDelete(_selectedRow);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [canAdd, canEdit, canDelete, _selectedRow, enableInlineCellEdit, editableKeys, editorOpen, handleAdd, handleEdit, handleDelete]);

	// Export Excel (.xlsx by default, .xls when configured)
	const handleExport = () => {
		const exportColumns = baseColumns.filter((c) => {
			const field = String(c.dataIndex ?? c.key ?? "").trim();
			return field.length > 0;
		});
		if (exportColumns.length === 0) {
			message.warning("Không có cột dữ liệu để xuất");
			return;
		}

		const headers = exportColumns.map((c) => (typeof c.title === "string" ? c.title : String(c.key || c.dataIndex || "")));
		const fields = exportColumns.map((c) => String(c.dataIndex ?? c.key ?? ""));
		const bodyRows = searchedData.map((row) =>
			fields.map((field) => {
				const value = row[field];
				if (value == null) return "";
				if (typeof value === "object") return JSON.stringify(value);
				return value;
			}),
		);

		const worksheet = utils.aoa_to_sheet([headers, ...bodyRows]);
		const workbook = utils.book_new();
		const rawSheetName = String(m_configs.label || m_configs.table_name || "Data");
		const sheetName = rawSheetName.replace(/[\\/?*\[\]:]/g, "_").slice(0, 31) || "Data";
		utils.book_append_sheet(workbook, worksheet, sheetName);

		const requestedType = String((m_configs as any)?.export_book_type || (m_configs as any)?.export_type || "xlsx").toLowerCase();
		const bookType = requestedType === "xls" ? "xls" : "xlsx";
		const fileNameBase = String(m_configs.label || "export").replace(/[\\/?*\[\]:]/g, "_");
		writeFile(workbook, `${fileNameBase}.${bookType}`, { bookType });
	};

	// Import CSV, Excel (.xls, .xlsx) with trigger support
	// Vue parity: Excel columns mapped by position (f_stt order), then save each row to server via updateTableData
	const handleImport = async () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		input.onchange = async () => {
			const file = (input.files && input.files[0]) as File | undefined;
			if (!file) return;

			try {
				const fileExt = file.name.split(".").pop()?.toLowerCase();
				let items: Row[] = [];

				// Fields for Excel positional mapping: same filter as export (f_show=1, not id, not richtext)
				// This matches the columns written by handleExport so col 0 → first visible field
				const importFields = (m_configs.table || [])
					.filter((f) => Number(f.f_show) === 1 && String(f.f_name).toLowerCase() !== 'id' && !/richtext|html/.test(String(f.f_types || '').toLowerCase()))
					.sort((a, b) => Number(a.f_stt ?? 0) - Number(b.f_stt ?? 0));

				if (fileExt === "csv") {
					// CSV: map by header name (more flexible for exported/external files)
					const text = await file.text();
					const lines = text.split(/\r?\n/).filter(Boolean);
					if (lines.length < 2) {
						message.error("File CSV rỗng");
						return;
					}
					const header = lines[0].split(",").map((h) => h.trim().replace(/^\"|\"$/g, ""));
					items = lines.slice(1).map((line) => {
						const cols = line.match(/\"(?:[^\"]|\\\")*\"|[^,]+/g) || [];
						const obj: Row = {};
						header.forEach((h, i) => {
							let v = cols[i] ?? "";
							v = v.replace(/^\"|\"$/g, "").replace(/\\\"/g, '"').trim();
							obj[h] = v;
						});
						return obj;
					});
				} else if (["xls", "xlsx"].includes(fileExt || "")) {
					// Excel: map columns by position to f_stt-sorted fields (Vue parity)
					const arrayBuffer = await file.arrayBuffer();
					const workbook = read(arrayBuffer, { type: "array" });
					const worksheet = workbook.Sheets[workbook.SheetNames[0]];
					if (!worksheet) {
						message.error("Sheet trống");
						return;
					}
					// header:1 = array-of-arrays format
					const rawRows = utils.sheet_to_json<any[]>(worksheet, { defval: "", header: 1 });

					// First row is the header row (skip it, map by column position)
					if (rawRows.length < 2) {
						message.error("File Excel rỗng");
						return;
					}

					items = rawRows.slice(1).map((rowArray) => {
						const cols = Array.isArray(rowArray) ? rowArray : Object.values(rowArray);
						const obj: Row = {};
						importFields.forEach((field, colIdx) => {
							const fieldName = field.f_name.toLowerCase();
							const rawVal = cols[colIdx] ?? "";
							const types = String(field.f_types || "").toLowerCase();
							let val: any = String(rawVal).trim();

							// Number type conversion (Vue: 1*val)
							if (/price|num|ron/.test(types)) {
								val = parseFlexibleNumberInput(rawVal) || 0;
							}
							// Combo type: resolve display label → stored id/value
							else if (types.includes("co") && field.f_cbo_query) {
								const parsed = parseComboQueryConfig(field.f_cbo_query, decrypt || csmDecrypt);
								const querySpecs = Array.isArray(parsed?.query) ? parsed.query : [];
								for (const spec of querySpecs) {
									const tbl = String(spec?.obj_name || "").trim();
									if (!tbl) continue;
									const fields = Array.isArray(spec?.fields) ? spec.fields : [];
									const valueField = String(fields[0] || "id").trim() || "id";
									const labelField = String(fields[1] || "").trim();
									const rows = getComboRows(database, tbl);
									if (labelField && rows.length > 0) {
										const found = rows.find((r) => String(r[labelField] || "").trim() === val);
										if (found) {
											val = found[valueField];
											break;
										}
									}
								}
							}
							obj[fieldName] = val;
						});
						return obj;
					});
				} else {
					message.error("Định dạng file không hỗ trợ (CSV, XLS, XLSX)");
					return;
				}

				if (items.length === 0) {
					message.warning("Không có dữ liệu để import");
					return;
				}

				// Run beforeImport trigger (can transform/filter items)
				let finalItems = items;
				if (m_configs.trigger?.beforeImport) {
					let code = m_configs.trigger.beforeImport;
					const effectiveDecrypt = decrypt || csmDecrypt;
					try { code = effectiveDecrypt(code); } catch { /* not encrypted */ }
					const fn = safeEval(["items", "seft", "data"], code) as ((items: Row[], seft: any, data: Database) => Row[] | Promise<Row[]>) | null;
					if (fn) {
						try {
							const result = await fn(items, createSeftContext(), database);
							if (Array.isArray(result)) finalItems = result;
						} catch (err) {
							console.error("beforeImport trigger error:", err);
							message.error("Lỗi xử lý beforeImport: " + (err as Error).message);
							return;
						}
					}
				}

				if (finalItems.length === 0) {
					message.warning("Không có dữ liệu sau xử lý beforeImport");
					return;
				}

				// Run update trigger on each row (Vue parity: calculate derived fields before save)
				finalItems = finalItems.map((item) => runUpdateTrigger(item));

				// Run afterImport trigger (side effects, e.g. custom server logic)
				if (m_configs.trigger?.afterImport) {
					let code = m_configs.trigger.afterImport;
					const effectiveDecrypt = decrypt || csmDecrypt;
					try { code = effectiveDecrypt(code); } catch { /* not encrypted */ }
					const fn = safeEval(["items", "seft", "data"], code) as ((items: Row[], seft: any, data: Database) => any) | null;
					if (fn) {
						try {
							await fn(finalItems, createSeftContext(), database);
						} catch (err) {
							console.error("afterImport trigger error:", err);
						}
					}
				}

				// Save each row to server or just update local state
				if (hasTableName && appId) {
					const progressKey = `import-progress-${Date.now()}`;
					const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

					const parseRetryAfterMs = (error: unknown): number | undefined => {
						const err = error as any;
						const headerValue = err?.response?.headers?.get?.("retry-after")
							?? err?.response?.headers?.["retry-after"]
							?? err?.headers?.get?.("retry-after")
							?? err?.headers?.["retry-after"];
						if (headerValue == null) return undefined;

						const retryAfterRaw = String(headerValue).trim();
						if (!retryAfterRaw) return undefined;

						const retryAfterSeconds = Number(retryAfterRaw);
						if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
							return Math.ceil(retryAfterSeconds * 1000);
						}

						const retryAt = Date.parse(retryAfterRaw);
						if (Number.isFinite(retryAt)) {
							const delta = retryAt - Date.now();
							return delta > 0 ? delta : 0;
						}

						return undefined;
					};

					const isRateLimitedError = (error: unknown): boolean => {
						const err = error as any;
						const status = Number(err?.response?.status ?? err?.status ?? 0);
						if (status === 429) return true;

						const msg = String(err?.message ?? err ?? "").toLowerCase();
						return msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests");
					};

					const isRowEmpty = (row: Row): boolean => {
						return Object.values(row || {}).every((value) => {
							if (value == null) return true;
							if (typeof value === "number") return Number.isNaN(value);
							if (typeof value === "boolean") return false;
							if (Array.isArray(value)) return value.length === 0;
							return String(value).trim() === "";
						});
					};

					const buildPkKey = (row: Row): string => {
						if (!hasCompletePrimaryKeyValues(row, pkFields)) return "";
						return pkFields.map((field) => `${field}:${normalizePrimaryKeyValue(row[field])}`).join("|");
					};

					const withRetry = async <T,>(task: () => Promise<T>, retries = 4): Promise<T> => {
						let lastError: unknown;
						for (let attempt = 0; attempt <= retries; attempt++) {
							try {
								return await task();
							} catch (error) {
								lastError = error;
								if (attempt >= retries) break;
								const retryAfterMs = parseRetryAfterMs(error);
								const limited = isRateLimitedError(error);
								const backoffMs = retryAfterMs ?? (limited ? (1400 + attempt * 1200) : (450 + attempt * 550));
								await sleep(backoffMs);
							}
						}
						throw lastError;
					};

					const nonEmptyItems = finalItems.filter((row) => !isRowEmpty(row));
					if (nonEmptyItems.length === 0) {
						message.warning("Không có dữ liệu hợp lệ để import");
						return;
					}

					// Dedupe by primary key: keep last row for same PK to avoid duplicate writes/overload
					const dedupedItems: Row[] = [];
					const dedupeIndexByPk = new Map<string, number>();
					for (const row of nonEmptyItems) {
						const pkKey = buildPkKey(row);
						if (pkKey && dedupeIndexByPk.has(pkKey)) {
							dedupedItems[dedupeIndexByPk.get(pkKey)!] = row;
						} else {
							dedupedItems.push(row);
							if (pkKey) dedupeIndexByPk.set(pkKey, dedupedItems.length - 1);
						}
					}

					const total = dedupedItems.length;
					const existingByPk = new Map<string, Row>();
					for (const row of data) {
						const pkKey = buildPkKey(row);
						if (pkKey) existingByPk.set(pkKey, row);
					}

					let completed = 0;
					let successCount = 0;
					let failedCount = 0;
					const savedItems: Row[] = [];
					const batchSize = total >= 1000 ? 40 : total >= 400 ? 30 : 20;
					const minBatchIntervalMs = total >= 1000 ? 450 : 320;
					const pauseEveryBatches = total >= 1000 ? 8 : 6;
					const pauseMs = total >= 1000 ? 1800 : 1300;
					let nextAllowedAt = Date.now();

					message.open({
						key: progressKey,
						type: "loading",
						content: `Đang import 0/${total}...`,
						duration: 0,
					});

					const updateProgress = () => {
						message.open({
							key: progressKey,
							type: "loading",
							content: `Đang import ${completed}/${total} (thành công: ${successCount}, lỗi: ${failedCount})...`,
							duration: 0,
						});
					};

					for (let batchStart = 0, batchNo = 0; batchStart < total; batchStart += batchSize, batchNo++) {
						const waitMs = nextAllowedAt - Date.now();
						if (waitMs > 0) {
							await sleep(waitMs);
						}
						nextAllowedAt = Date.now() + minBatchIntervalMs;

						const batchItems = dedupedItems.slice(batchStart, Math.min(batchStart + batchSize, total));
						const operations = batchItems.map((item) => {
							const itemPkKey = buildPkKey(item);
							const existingRow = itemPkKey ? existingByPk.get(itemPkKey) : undefined;
							const command: "create" | "update" = existingRow ? "update" : "create";

							if (existingRow && existingRow.id !== undefined) {
								item.id = existingRow.id;
							}

							const whereOld: Record<string, any> = {};
							const whereSource = existingRow || item;
							for (const pkField of pkFields) {
								if (whereSource?.[pkField] !== undefined && String(whereSource[pkField]).trim() !== "") {
									whereOld[pkField] = whereSource[pkField];
								}
							}

							return {
								item,
								existingRow,
								request: {
									command,
									obj_update: item,
									where: Object.keys(whereOld).length > 0 ? whereOld : undefined,
								},
							};
						});

						let batchResponse: any = null;
						try {
							batchResponse = await withRetry(() => bulkUpdateTableData({
								app_id: appId,
								obj_name: tableName,
								pk_fields: pkFields,
								continue_on_error: true,
								operations: operations.map((op) => op.request),
							}), 4);
						} catch (err) {
							for (const op of operations) {
								failedCount += 1;
								completed += 1;
								console.error("Import batch save error:", err, op.item);
							}
							if (completed % 5 === 0 || completed === total) {
								updateProgress();
							}
							continue;
						}

						const itemResults = Array.isArray(batchResponse?.results) ? batchResponse.results : [];
						for (let i = 0; i < operations.length; i++) {
							const op = operations[i];
							const result = itemResults[i] || {};
							const itemSuccess = result.success !== false;
							const updatedItem = (result.updated_row && typeof result.updated_row === "object")
								? ({ ...op.item, ...(result.updated_row as Row) } as Row)
								: op.item;

							if (itemSuccess) {
								successCount += 1;
								savedItems.push(updatedItem);

								const finalPkKey = buildPkKey(updatedItem);
								if (finalPkKey) {
									existingByPk.set(finalPkKey, { ...(op.existingRow || {}), ...updatedItem });
								}
							} else {
								failedCount += 1;
								console.error("Import row save error:", result?.message || "Unknown error", op.item);
							}

							completed += 1;
							if (completed % 5 === 0 || completed === total) {
								updateProgress();
							}
						}

						if (batchStart + batchSize < total && (batchNo + 1) % pauseEveryBatches === 0) {
							await sleep(pauseMs);
							nextAllowedAt = Date.now() + minBatchIntervalMs;
						}
					}
					message.destroy(progressKey);

					// Update local state: upsert saved rows
					if (savedItems.length > 0) {
						const mergeRows = (rows: Row[], incoming: Row[]) => {
							const next = [...rows];
							for (const item of incoming) {
								const idx = next.findIndex((r) => hasSamePrimaryKeyValues(r, item, pkFields));
								if (idx >= 0) next[idx] = { ...next[idx], ...item };
								else next.push(item);
							}
							return next;
						};

						setData((prev) => mergeRows(prev, savedItems));
						syncMasterTableRows(mergeRows(data, savedItems));
					}

					if (failedCount === 0) {
						message.success(`Import hoàn tất: ${successCount}/${total} dòng`);
					} else {
						message.warning(`Import hoàn tất: ${successCount}/${total} dòng thành công, lỗi ${failedCount} dòng`);
					}
				} else {
					// Detail grid or no table_name: only update local state
					setData((prev) => [...prev, ...finalItems]);
					message.success(`Đã import ${finalItems.length} bản ghi`);
				}
			} catch (error) {
				console.error("Import error:", error);
				message.error("Lỗi import: " + (error as Error).message);
			}
		};
		input.click();
	};

	// Default handlers if not provided
	function handleAdd() {
		// If inline editing, add new empty row to table
		if (enableInlineCellEdit) {
			// Generate unique ID: appId_timestamp_randomString to avoid collisions
			const randomSuffix = Math.random().toString(36).substring(2, 9);
			const newRowId = `${appId}_${Date.now()}_${randomSuffix}`;
			const newRow: Row = { id: newRowId };
			const fields = (m_configs.table || []).filter(f => Number(f.f_show) === 1);
			
			// Initialize fields with default values based on field type
			fields.forEach(f => {
				const types = (f.f_types || "").toLowerCase();
				if (/number|int|float|double|money|currency|digit/.test(types)) {
					newRow[f.f_name] = 0;
				} else if (/bool|switch|checkbox/.test(types)) {
					newRow[f.f_name] = false;
				} else if (/date|time|datetime/.test(types)) {
					newRow[f.f_name] = '';
				} else {
					newRow[f.f_name] = '';
				}
			});
			
			// Check if master-detail nodes exist
			const hasMasterDetail = m_configs.nodes && m_configs.nodes.length > 0;
			
			if (hasMasterDetail) {
				// If has master-detail nodes, open form modal for complete data entry
				setEditingRecord(newRow);
				setEditorOpen(true);
				onAdd?.();
			} else {
				// Add to beginning of data array for inline editing
				setData((prev) => {
					const next = [newRow, ...prev];
					// Run afterAdd trigger với toàn bộ mảng mới
					runAfterTrigger('afterAdd', next);
					return next;
				});
				// Select the new row
				const newRowKey = getRowKey(newRow);
				setSelectedKeys([newRowKey]);
				setSelectedRow(newRow);
				// Mark this row to be editable once it appears in the table
				setPendingEditableRowId(newRowKey);
				onAdd?.();
			}
		} else {
			// Modal-based add
			setEditingRecord(null);
			setEditorOpen(true);
			onAdd?.();
		}
	}
	function handleEdit(record: Row) {
		// If inline editing is enabled, activate inline edit mode for the row
		if (enableInlineCellEdit) {
			const rowKey = getRowKey(record);
			
			console.log('[CsmDynamicGrid] Activating inline edit:', {
				record,
				pkFields,
				rowKey,
				currentEditableKeys: editableKeys,
				columnsWithEditable: columns.filter(c => c.editable).map(c => c.dataIndex)
			});
			
			setEditableKeys([rowKey]);
			setSelectedKeys([rowKey]);
			setSelectedRow(record);
			onEdit?.(record);
		} else {
			// Modal-based editing for standard form or master-detail
			console.log('[CsmDynamicGrid] Opening modal editor');
			setEditingRecord(record);
			setCloneData(null);
			setEditorOpen(true);
			onEdit?.(record);
		}
	}
	const handleClone = (record: Row) => {
		const currentPkFields = getPrimaryKeyFields(m_configs);
		// Clear all PK fields so cloned row must use a new key.
		const cloned: Row = { ...record };
		currentPkFields.forEach((pk) => {
			cloned[pk] = "";
		});
		setEditingRecord(null); // create mode
		setCloneData(cloned);
		setEditorOpen(true);
	};
	async function handleDelete(record: Row) {
		try {
			// Detail grid hoặc không có table_name: chỉ xóa từ state local, KHÔNG gọi API
			// Giống Vue: detail grid chỉ update khi master save
			if (isDetailGrid || !hasTableName) {
				setData((prev) => {
					const deletedRowKey = getRowKey(record);
					const next = prev.filter(row => getRowKey(row) !== deletedRowKey);
					// Run afterDelete trigger với toàn bộ mảng còn lại
					runAfterTrigger('afterDelete', next);
					return next;
				});
				message.success(t("common.deleteSuccess"));
				onDelete?.(record);
				runSideEffectTrigger("delete_db", record);
				// Notify parent để sync vào form (nếu là detail grid)
				if (isDetailGrid) {
					onDataChange?.();
				}
				return;
			}
			
			if (!appId) {
				message.error(t("common.missingAppId"));
				return;
			}
			
			const pkFields = m_configs.struct?.fieldsPK || ["id"];
			
			// Build obj_update and where from OLD record PK values
			const obj_update: any = {};
			const whereOld: any = {};
			
			for (const pkField of pkFields) {
				const oldVal = record[pkField];
				if (oldVal !== undefined && oldVal !== null) {
					obj_update[pkField] = oldVal;
					whereOld[pkField] = oldVal;
				}
			}
			
			// Check if at least one primary key is present
			if (Object.keys(whereOld).length === 0) {
				console.error("❌ No primary key values found:", pkFields);
				message.error(`Thiếu giá trị khóa chính: ${pkFields.join(", ")}`);
				return;
			}
			
			await updateTableData<Row>({ 
				app_id: appId, 
				obj_name: tableName, 
				command: "delete", 
				obj_update,
				pk_fields: pkFields,
				where: whereOld
			});
			
			// Update local state và run afterDelete trigger
			setData((prev) => {
				const deletedRowKey = getRowKey(record);
				const next = prev.filter(row => getRowKey(row) !== deletedRowKey);
				// Run afterDelete trigger với toàn bộ mảng còn lại
				runAfterTrigger('afterDelete', next);
				return next;
			});
			
			message.success("Đã xóa thành công");
			onDelete?.(record);
			runSideEffectTrigger("delete_db", record);
		} catch (err) {
			console.error("Delete error:", err);
			message.error("Xóa thất bại: " + (err as Error).message);
		}
	}

	const tableProps: any = {
		rowKey: (record: Row) => {
			return getRowKey(record);
		},
		actionRef,
		columns,
		dataSource: searchedData,
		pagination: disablePagination ? false : { pageSize: Number(m_configs.table_pagesize) || 10 },
		// Responsive scroll: on mobile, use auto; on desktop, use max-content for horizontal scroll
		scroll: isMobile ? { x: 'auto', y: 'calc(100vh - 400px)' } : { x: 'max-content', y: 'calc(100vh - 400px)' },
		...(enableInlineCellEdit && canEdit ? {
			editable: {
				type: 'multiple' as const,
				editableKeys: editableKeys,
				onChange: setEditableKeys,
				// Realtime trigger update khi nhập liệu inline (Vue compatibility)
				onValuesChange: (record: Row, originRow: Row) => {
					// Prevent recursion: nếu đang update từ trigger thì skip
					if (isUpdatingFromTrigger) return;
					
					// Clear timeout cũ nếu có
					if (updateTriggerTimeoutRef.current) {
						clearTimeout(updateTriggerTimeoutRef.current);
					}
					
					// Debounce 300ms: đợi user nhập xong mới chạy trigger
					updateTriggerTimeoutRef.current = setTimeout(() => {
						if (!m_configs.trigger?.update) return;
						
						try {
							setIsUpdatingFromTrigger(true);
							const processedData = runUpdateTrigger(record);
							
							// Update lại data nếu trigger thay đổi giá trị
							const currentRowKey = getRowKey(originRow);
							
							setData((prev) => prev.map(row => {
								const isTarget = getRowKey(row) === currentRowKey;
								return isTarget ? { ...row, ...processedData } : row;
							}));
							
							// Reset flag sau khi update xong
							setTimeout(() => setIsUpdatingFromTrigger(false), 100);
						} catch (err) {
							console.error('Realtime trigger error:', err);
							setIsUpdatingFromTrigger(false);
						}
					}, 300);
				},
				onSave: async (rowKey: React.Key, newData: Row) => {
					// Find old row data
					let oldRow: Row | undefined = data.find((row: Row) => getRowKey(row) === String(rowKey));
					
					const safeNewData = oldRow?.id && newData.id == null ? { ...newData, id: oldRow.id } : newData;
					const normalizedInput = normalizeInlineRowValues(safeNewData, m_configs.table || []);
					
					// Detail grid: chỉ update local state, KHÔNG gọi API
					// Giống Vue: detail grid chỉ lưu khi master save
					if (isDetailGrid) {
						// Run UPDATE trigger TRƯỚC KHI save (Vue compatibility)
						const updatedDataFromTrigger = runUpdateTrigger(normalizedInput);
						const triggerNormalized = normalizeInlineRowValues(updatedDataFromTrigger, m_configs.table || []);
						const processedData = await runBeforeSaveTrigger(triggerNormalized);
						if (processedData === false) {
							return;
						}
						const normalizedProcessed = normalizeInlineRowValues(processedData, m_configs.table || []);
						
						// Update local state AND database object
						let updatedData: Row[] = [];
						setData((prev) => {
							const next = prev.map(row => {
								const isUpdatedRow = getRowKey(row) === String(rowKey);
								
								if (isUpdatedRow) {
									return { ...row, ...normalizedProcessed };
								}
								return row;
							});
							// Run afterEdit trigger
							runAfterTrigger('afterEdit', next);
							updatedData = next;
							return next;
						});
						
						// CRITICAL: Update database object BEFORE calling onDataChange
						if (tableName && database[tableName]) {
							database[tableName].rows = updatedData;
							console.log(`[CsmDynamicGrid] Detail grid updated database[${tableName}]:`, {
								rowCount: updatedData.length,
								data: updatedData
							});
						} else {
							console.warn(`[CsmDynamicGrid] Cannot update database[${tableName}] - not found`, { tableName, hasDatabase: !!database });
						}
						
						message.success('Đã lưu thay đổi');
						runSideEffectTrigger("update_db", normalizedProcessed);
						// Notify parent để sync vào form (sẽ đọc database[tableName])
						console.log(`[CsmDynamicGrid] Calling onDataChange for ${tableName}`);
						onDataChange?.();
						return;
					}
					
					// Master grid: gọi API để lưu ngay
					if (!appId) {
						message.error("Thiếu app_id");
						return;
					}
					
					try {
						// Run UPDATE trigger TRƯỚC KHI save (Vue compatibility)
						const updatedDataFromTrigger = runUpdateTrigger(normalizedInput);
						const triggerNormalized = normalizeInlineRowValues(updatedDataFromTrigger, m_configs.table || []);
						const processedData = await runBeforeSaveTrigger(triggerNormalized);
						if (processedData === false) {
							return;
						}
						const normalizedProcessed = normalizeInlineRowValues(processedData, m_configs.table || []);
						
						await updateTableData<Row>({
							app_id: appId,
							obj_name: tableName,
							command: 'update',
							obj_update: normalizedProcessed,
							pk_fields: pkFields,
							where: oldRow && pkFields.every((field) => oldRow?.[field] != null)
								? Object.fromEntries(pkFields.map((field) => [field, oldRow[field]]))
								: undefined,
						});
						
						// Update local state immediately with merged data
						setData((prev) => {
							const next = prev.map(row => {
								const isUpdatedRow = getRowKey(row) === String(rowKey);
								
								if (isUpdatedRow) {
									return { ...row, ...normalizedProcessed };
								}
								return row;
							});
							// Run afterEdit trigger
							runAfterTrigger('afterEdit', next);
							return next;
						});
						
						message.success('Đã lưu thay đổi');
						runSideEffectTrigger("update_db", normalizedProcessed);
					} catch (error) {
						message.error('Lưu thất bại: ' + (error as Error).message);
					}
				},
				actionRender: (_row: any, _config: any, defaultDom: any) => {
					const saveNode = React.isValidElement(defaultDom?.save)
						? React.cloneElement(defaultDom.save as React.ReactElement<any>, undefined, saveActionLabel)
						: defaultDom?.save;
					const cancelNode = React.isValidElement(defaultDom?.cancel)
						? React.cloneElement(defaultDom.cancel as React.ReactElement<any>, undefined, cancelActionLabel)
						: defaultDom?.cancel;
					return [saveNode, cancelNode];
				},
			},
		} : {}),
		rowSelection: {
			type: "checkbox",
			selectedRowKeys: selectedKeys,
			onChange: (keys: React.Key[], rows: Row[]) => {
				setSelectedKeys(keys);
				const r = rows[0] ?? null;
				setSelectedRow(r);
				setSelectedDetailRow(r); // Update detail panel
				onSelectRow?.(r);
			},
		},
		onRow: (record: Row) => ({
			onClick: () => {
				// Always select row on click for master-detail and inline edit
				const rowKey = getRowKey(record);
				setSelectedKeys([rowKey]);
				setSelectedRow(record);
				setSelectedDetailRow(record); // Update detail panel immediately
				onSelectRow?.(record);
			},
			onDoubleClick: () => canEdit && handleEdit(record),
			...(useRowTemplate ? ({ record } as any) : {}),
		}),
		...(useRowTemplate ? {
			components: {
				body: {
					row: (rowProps: any) => {
						const record = rowProps?.record as Row | undefined;
						if (!record) {
							return React.createElement("tr", rowProps, rowProps.children);
						}
						let tplResult: any = null;
						try {
							tplResult = rowTemplateFn ? rowTemplateFn(null, record, React) : null;
						} catch (err) {
							console.error("[CsmDynamicGrid] datarowtemplate error:", err);
						}
						if (tplResult == null || tplResult === false) {
							return React.createElement("tr", rowProps, rowProps.children);
						}
						let content: React.ReactNode = tplResult;
						let cellStyle: React.CSSProperties | undefined;
						let className: string | undefined;
						if (tplResult && typeof tplResult === "object" && !React.isValidElement(tplResult)) {
							if ("content" in tplResult) content = tplResult.content;
							if (tplResult.className) className = tplResult.className;
							if (tplResult.style) cellStyle = tplResult.style;
						}
						if (typeof content === "string") {
							content = React.createElement("div", { dangerouslySetInnerHTML: { __html: content } });
						}
						return React.createElement(
							"tr",
							{ ...rowProps, className: [rowProps.className, className].filter(Boolean).join(" ") },
							React.createElement(
								"td",
								{ colSpan: columns.length, style: { padding: 0, ...(cellStyle || {}) } },
								content
							)
						);
					},
				},
			},
		} : {}),
		toolBarRender: () => {
			const items: React.ReactNode[] = [];
			const canShowExport = !isReadonly || allowReadonlyExport;
			if (enableSearch) {
				items.push(
					React.createElement(Input, {
						key: "search",
						placeholder: t("common.searchInFields", { count: derivedSearchFields.length }),
						prefix: React.createElement(SearchOutlined, { style: { color: "#bfbfbf" } }),
						value: searchTerm,
						onChange: (e: any) => setSearchTerm(e.target.value),
						allowClear: true,
						style: { width: 280, marginRight: 12 },
					})
				);
			}
			const buttons = [];
			if (canAdd) {
				buttons.push(
					React.createElement(Tooltip, { key: "add-tooltip", title: t("common.shortcutAddF4") },
						React.createElement(Button, { 
							key: "add", 
							type: "primary", 
							icon: React.createElement(PlusOutlined),
							onClick: handleAdd
						}, t("common.add"))
					)
				);
			}
			// Add batch delete button when rows are selected
			if (canDelete && selectedKeys.length > 0) {
				buttons.push(
					React.createElement(Button, { 
						key: "batch-delete",
						danger: true,
						onClick: () => {
							const selectedRows = searchedData.filter(row => selectedKeys.includes(getRowKey(row)));
							if (selectedRows.length === 0) return;
							
							Modal.confirm({
								title: t("common.confirmDeleteTitle"),
								content: t("common.deleteSelectedConfirm", { count: selectedRows.length }),
								okText: t("common.delete"),
								okType: "danger",
								cancelText: t("common.cancel"),
								onOk: async () => {
									if (!appId) {
										message.error(t("common.missingAppId"));
										return;
									}
									
									const pkFields = m_configs.struct?.fieldsPK || ["id"];
									let deleteCount = 0;
									let deleteError = false;
									
									// Delete rows one by one
									for (const row of selectedRows) {
										try {
											const obj_update: any = {};
											const missingKeys: string[] = [];
											
											for (const pkField of pkFields) {
												if (row[pkField] !== undefined && row[pkField] !== null) {
													obj_update[pkField] = row[pkField];
												} else {
													missingKeys.push(pkField);
												}
											}
											
											if (missingKeys.length > 0) {
												console.error("❌ Missing primary key values:", missingKeys);
												deleteError = true;
												continue;
											}
											
											await updateTableData<Row>({
												app_id: appId,
												obj_name: tableName,
												command: "delete",
												obj_update,
												pk_fields: pkFields,
												where: pkFields.every((field) => row?.[field] != null)
													? Object.fromEntries(pkFields.map((field) => [field, row[field]]))
													: undefined
											});
											deleteCount++;
										} catch (err) {
											console.error("❌ Delete error:", err);
											deleteError = true;
										}
									}
									
									if (deleteCount > 0) {
										// Update local state immediately
										const deletedKeys = new Set(selectedRows.map((row) => getRowKey(row)));
										setData(prev => prev.filter(row => !deletedKeys.has(getRowKey(row))));
										message.success(`Đã xóa ${deleteCount} bản ghi`);
										setSelectedKeys([]);
									}
									if (deleteError) {
										message.warning(`Xóa ${deleteCount} bản ghi thành công, nhưng một số bản ghi thất bại`);
									}
								}
							});
						}
					}, `Xóa ${selectedKeys.length} dòng`)
				);
			}
			if (!isReadonly) {
				buttons.push(
					React.createElement(Button, { 
						key: "import",
						icon: React.createElement(ImportOutlined),
						onClick: handleImport 
					}, "Import")
				);
			}
			if (canShowExport) {
				buttons.push(
					React.createElement(Button, { 
						key: "export",
						icon: React.createElement(ExportOutlined),
						onClick: handleExport 
					}, "Export")
				);
			}
			items.push(
				React.createElement(Space, { key: "button-group", size: "small" }, buttons)
			);
			return items;
		},
		options: { reload: true, density: true, setting: true },
		cardProps: {
			bodyStyle: { padding: 0 }
		},
		search: false,
		dateFormatter: "string",
		headerTitle: false,
	};

	const children: React.ReactNode[] = [React.createElement(BasicTable as any, { key: "table", ...tableProps })];
	
	// Add detail panel when a master row is selected and it has detail nodes (Master-Detail structure)
	const isMasterDetail = !isDetailGrid && Number(m_configs.type_form) === 2;
	const detailNodes = (m_configs as any).nodes || [];
	const hasDetailNodes = Array.isArray(detailNodes) && detailNodes.length > 0;
	
	// Sync detail data to store when selectedDetailRow changes (must be at component level, not inside conditions)
	React.useEffect(() => {
		if (!isMasterDetail || !hasDetailNodes || !selectedDetailRow || !appId) return;
		
		detailNodes.forEach((node: any) => {
			const detailFieldName = node.table_name;
			let detailData = selectedDetailRow[detailFieldName];
			
			// Parse JSON string to array
			if (typeof detailData === 'string' && detailData.trim()) {
				try {
					detailData = JSON.parse(detailData);
				} catch {
					detailData = [];
				}
			}
			const rows = Array.isArray(detailData) ? detailData : [];
			
			// Sync to database store so detail grid can read it
			const setTableData = useAppStore.getState().setTableData;
			setTableData(detailFieldName, { 
				id: detailFieldName, 
				rows,
				app_id: appId
			});
		});
	}, [selectedDetailRow ? getRowKey(selectedDetailRow) : "", appId, isMasterDetail, hasDetailNodes, detailNodes, getRowKey]);
	
	// Detail panel rendering is now only in CsmEditModal, not here
	// Keep children array with just the table
	
	// Show edit modal unless we're doing inline cell editing
	const shouldShowEditModal = !enableInlineCellEdit;
	
	if (appId && (canAdd || canEdit) && shouldShowEditModal) {
		children.push(
			React.createElement(CsmEditModal as any, {
				key: "editor",
				open: editorOpen,
				onOpenChange: (o: boolean) => { setEditorOpen(o); if (!o) setCloneData(null); },
				title: editingRecord ? t("common.edit") : (cloneData ? t("common.clone") : t("common.add")),
				m_configs,
				fields: m_configs.table,
				record: editingRecord ?? cloneData,
				selectEnums,
				database,
				appId,
				permissions,
				menusPermissions,
				decrypt,
				onSubmit: async (values: Row) => {
					if (submitInFlightRef.current) {
						return;
					}
					submitInFlightRef.current = true;
					try {
					const beforeSaveInputSnapshot = JSON.parse(JSON.stringify(values || {}));
					const beforeSaveValues = await runBeforeSaveTrigger(values);
					if (beforeSaveValues === false) {
						return;
					}
					values = beforeSaveValues;
					try {
						const comboFields = (m_configs.table || [])
							.filter((field) => String(field?.f_types || "").toLowerCase().indexOf("co") !== -1)
							.map((field) => String(field?.f_name || "").trim())
							.filter(Boolean);
						const comboBefore: Record<string, any> = {};
						const comboAfter: Record<string, any> = {};
						comboFields.forEach((name) => {
							comboBefore[name] = beforeSaveInputSnapshot?.[name];
							comboAfter[name] = values?.[name];
						});
						console.log("[CsmDynamicGrid] beforeSave combo diff", {
							tableName,
							comboBefore,
							comboAfter,
						});
					} catch (debugErr) {
						console.warn("[CsmDynamicGrid] beforeSave combo diff log failed", debugErr);
					}

					// Nếu không có table_name: chỉ lưu vào state local
					if (!hasTableName) {
						const cmd = editingRecord ? "update" : "create";
						const pkFields = getPrimaryKeyFields(m_configs);
						const duplicateLocalRow = hasCompletePrimaryKeyValues(values, pkFields)
							? data.find((row) => {
								if (cmd === "update" && editingRecord && getRowKey(row) === getRowKey(editingRecord)) {
									return false;
								}
								return hasSamePrimaryKeyValues(row, values, pkFields);
							})
							: null;
						if (duplicateLocalRow) {
							const pkDesc = pkFields.map((field) => `${field}=${values?.[field] ?? ""}`).join(", ");
							message.error(`Trùng khóa chính (${pkDesc}). Vui lòng nhập khóa khác.`);
							return;
						}
						// Auto-generate ID cho bản ghi mới
						if (cmd === "create" && !values.id) {
							values.id = `_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
						}
						
						setData((prev) => {
							if (cmd === "create") {
								const next = [...prev, values];
								// Run afterAdd trigger với toàn bộ mảng mới
								runAfterTrigger('afterAdd', next);
								return next;
							} else if (editingRecord) {
								// Update: tìm và thay thế bản ghi cũ
								const editingRowKey = getRowKey(editingRecord);
								const idx = prev.findIndex(row => getRowKey(row) === editingRowKey);
								if (idx >= 0) {
									const next = [...prev];
									next[idx] = { ...next[idx], ...values };
									// Run afterEdit trigger với toàn bộ mảng đã sửa
									runAfterTrigger('afterEdit', next);
									return next;
								}
								return prev;
							}
							return prev;
						});
						
						setEditorOpen(false);
						message.success(cmd === "create" ? t("common.addSuccess") : t("common.updateSuccess"));
						runSideEffectTrigger("update_db", values);
						onAdd?.();
						return;
					}
					
					if (!appId) return;
					const cmd = editingRecord ? "update" : "create";

					const pkFields = getPrimaryKeyFields(m_configs);
					const duplicateRowByPk = hasCompletePrimaryKeyValues(values, pkFields)
						? data.find((row) => {
							if (cmd === "update" && editingRecord && getRowKey(row) === getRowKey(editingRecord)) {
								return false;
							}
							return hasSamePrimaryKeyValues(row, values, pkFields);
						})
						: null;

					if (duplicateRowByPk) {
						const pkDesc = pkFields.map((field) => `${field}=${values?.[field] ?? ""}`).join(", ");
						message.error(`Trùng khóa chính (${pkDesc}). Vui lòng nhập khóa khác.`);
						return;
					}

					const effectiveCommand = cmd;
					const targetRowForUpdate = editingRecord;

					const payloadValues = values;

					// Build where from the OLD PK values (for update) or NEW PK values (for create)
					let whereValues: Record<string, any> | undefined;
					if (effectiveCommand === "update" && targetRowForUpdate) {
						// Use old PK values from the existing record to locate it in Lucene
						const oldPkEntries = pkFields
							.filter((field) => targetRowForUpdate[field] != null)
							.map((field) => [field, targetRowForUpdate[field]]);
						if (oldPkEntries.length > 0) {
							whereValues = Object.fromEntries(oldPkEntries);
						}
					} else if (effectiveCommand === "create") {
						// Use NEW PK values from form so backend can check duplicates via Lucene
						const newPkEntries = pkFields
							.filter((field) => {
								if (tableName === "csm_accounts" && (field === "app_id" || field === "app_token")) {
									return false;
								}
								return values?.[field] != null && String(values[field]).trim() !== "";
							})
							.map((field) => [field, values[field]]);
						if (newPkEntries.length > 0) {
							whereValues = Object.fromEntries(newPkEntries);
						}
					}

					const updateResponse = await updateTableData<Row>({ 
						app_id: appId, 
						obj_name: tableName, 
						command: effectiveCommand as any, 
						obj_update: payloadValues,
						pk_fields: pkFields,
						where: whereValues
					});
					const responseAny = updateResponse as any;
					const serverUpdatedRow = (responseAny?.updated_row && typeof responseAny.updated_row === "object")
						? responseAny.updated_row
						: (responseAny?.data?.updated_row && typeof responseAny.data.updated_row === "object"
							? responseAny.data.updated_row
							: null);
					if (serverUpdatedRow && payloadValues?.group_id && serverUpdatedRow?.group_id && String(payloadValues.group_id) !== String(serverUpdatedRow.group_id)) {
						console.warn("[CsmDynamicGrid] backend rewrote group_id", {
							payload_group_id: payloadValues.group_id,
							response_group_id: serverUpdatedRow.group_id,
							response_permissionGroups: serverUpdatedRow.permissionGroups,
							response_group_rights: serverUpdatedRow.group_rights,
						});
					}
					const effectiveUpdatedValues = serverUpdatedRow
						? { ...payloadValues, ...serverUpdatedRow }
						: payloadValues;
					
					// Update local state và run after trigger
					// NOTE: For "create", we do NOT add the row locally here.
					// The backend sends a socket "create" event before returning the HTTP response.
					// The socket event updates database[tableName], which triggers the useEffect to reload
					// rows. Adding the row locally too would cause a duplicate (race condition).
					setData((prev) => {
						if (effectiveCommand === "create") {
							// Skip local add — socket event + useEffect will handle it
							return prev;
						} else if (targetRowForUpdate) {
							const editingRowKey = getRowKey(targetRowForUpdate);
							const idx = prev.findIndex(row => {
								return getRowKey(row) === editingRowKey;
							});
							if (idx >= 0) {
								const next = [...prev];
								next[idx] = { ...next[idx], ...effectiveUpdatedValues };
								// Run afterEdit trigger với toàn bộ mảng đã sửa
								runAfterTrigger('afterEdit', next);
								return next;
							}
							return prev;
						}
						return prev;
					});
					
					setEditorOpen(false);
					message.success(cmd === "create" ? t("common.addSuccess") : t("common.updateSuccess"));
					runSideEffectTrigger("update_db", effectiveUpdatedValues);
					onAdd?.();
					} finally {
						submitInFlightRef.current = false;
					}
				},
			})
		);
	}

	return React.createElement("div", { ref: hotkeyScopeRef }, ...children);
}

export default CsmDynamicGrid;
