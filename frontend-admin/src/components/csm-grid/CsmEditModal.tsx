import CodeMirror from '#src/components/editor/CodeMirrorWithAiAssistant';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import React, { useEffect, useMemo, useState, Suspense, lazy, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Form, Input, Button, Select, AutoComplete, Divider, Typography, InputNumber, DatePicker, TimePicker, Switch, Modal, Tabs, Space, TreeSelect, theme, Spin } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { csmEncrypt, csmDecrypt } from "./CsmCrypto";
import { INT, jdFromDate, jdToDate, NewMoon, KinhDoMatTroi, SunLongitude, getSunLongitude, getNewMoonDay, getLunarMonth11, getLeapMonthOffset, duong_qua_am, am_qua_duong, LunarCalendar } from "#src/utils/lunarCalendar";
import { dateFormat, chuyenNgay, TruNgayRaSoNgay, CongNgay, CongGio, validateEmail, validatePhone, DateUtils } from "#src/utils/dateUtils";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { MConfig, TableField } from "./CsmDynamicGrid";
import { useEnterToTab } from "#src/hooks/useEnterToTab";
import { HtmlEditor } from "./HtmlEditor";
import { InlineImageUploader } from "./InlineImageUploader";
import CsmDynamicGrid from "./CsmDynamicGrid";
import { useAppStore } from "#src/store/app";
import { usePermissionStore } from "#src/store";
import { useUserStore } from "#src/store/user";
import { getTableData } from "./CsmApi";
import { normalizeComboOptions, resolveComboQueryAppId, buildRoleComboOptions, getComboTableRows, buildRoleComboValueEnum, buildRoleComboSelectEnum, resolveRoleComboLabel, parseFieldOptions, getLegacyFallbackComboQuery, resolveEffectiveComboQueryText, buildGridFieldComboSelectEnum, buildFieldQueryComboSelectEnum, buildComboSelectEnumFromQueryObject, buildSelectEnumsForFields, executeComboQueryObject, resolveEditFieldComboSelectOptions, resolveQueryRowComboLabel, collectComboTableFetchRequests, flattenAppMenusById, isDefaultComboWhereClause, storedTableAppIdMatches, resolveEffectiveFieldTypes, isComboLikeType } from "./combo-utils";
import { getUserAccessContext } from "#src/utils/user-app-id";
import { formatDateForStorage, parseDateValueToDayjs, resolveDateLocaleFormat } from "#src/utils/dateControl";
import { compileMenuTrigger, resolveTriggerBody, safeEval } from "./csm-trigger-runner";
import { gridDevLog } from "./grid-perf-utils";
import { prefetchComboTablesForEdit } from "./combo-prefetch";

// ============================================================================
// GLOBAL CACHE: Tự động fetch missing tables cho combo queries
// ============================================================================
export const globalTableFetchCache = new Map<string, Promise<any>>();

function resolveMediaUrl(pathValue: string): string {
  if (!pathValue) return "";
  if (/^(https?:)?\/\//i.test(pathValue)) return pathValue;
  if (pathValue.startsWith("data:") || pathValue.startsWith("blob:")) return pathValue;
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

/**
 * Fetch table data nếu chưa có trong database
 * Returns true nếu đang fetch, false nếu đã có data
 */
export async function ensureTableInDatabase(
  tableName: string,
  appId: string,
  database: any,
  whereClause?: any,
  setTableData?: (tableName: string, data: { id: string; rows: any[]; app_id?: string }) => void,
): Promise<boolean> {
  const hasUsableWhere = Boolean(
    whereClause
    && !isDefaultComboWhereClause(whereClause)
    && (
      (typeof whereClause === "string" && whereClause.trim())
      || (typeof whereClause === "object" && (
        (whereClause.field && whereClause.type)
        || (whereClause.operator && Array.isArray(whereClause.conditions))
      ))
    )
  );
  const effectiveWhereClause = hasUsableWhere
    ? whereClause
    : { field: "id", type: "like", value: "" };

  // Include where clause in cache key to handle different filters on same table
  const whereSuffix = effectiveWhereClause ? `::${JSON.stringify(effectiveWhereClause)}` : '';
  const cacheKey = `${appId}::${tableName}${whereSuffix}`;
  
  // ✅ IMPORTANT: If whereClause exists, ALWAYS fetch (API requires obj_where to return data)
  if (!hasUsableWhere) {
    const existing = database[tableName];
    if (existing && (Array.isArray(existing) || (existing.rows && Array.isArray(existing.rows)))) {
      const rowCount = Array.isArray(existing) ? existing.length : existing.rows?.length || 0;
      const storedAppId = Array.isArray(existing) ? "" : String(existing?.app_id || existing?.appId || "").trim();
      const isMatchingApp = storedTableAppIdMatches(storedAppId, appId, csmDecrypt);
      if (rowCount > 0 && isMatchingApp) {
        gridDevLog(`✓ [AutoFetch] Table ${tableName} already in database (${rowCount} rows, app: ${storedAppId || "unknown"})`);
        return false;
      }
      if (rowCount > 0 && !isMatchingApp) {
        gridDevLog(`🔄 [AutoFetch] Table ${tableName} exists for app ${storedAppId}, refetching for app ${appId}`);
      }
    }
  } else {
    gridDevLog(`🔍 [AutoFetch] Query has where clause, will fetch ${tableName} with filter (ignore existing data)`);
  }

  if (globalTableFetchCache.has(cacheKey)) {
    gridDevLog(`⏳ [AutoFetch] Already fetching ${tableName} with same where clause, waiting...`);
    try {
      await globalTableFetchCache.get(cacheKey);
      return true;
    } catch (err) {
      console.warn(`[ensureTableInDatabase] Failed to fetch ${tableName}:`, err);
      globalTableFetchCache.delete(cacheKey);
      return true;
    }
  }

  gridDevLog(`🔄 [AutoFetch] Fetching missing table: ${tableName} (app: ${appId})`, `with where:`, effectiveWhereClause);
  
  const requestParams: any = {
    app_id: appId,
    obj_name: tableName,
    where: effectiveWhereClause,
  };
  
  const fetchPromise = getTableData<any>(requestParams)
    .then((response) => {
      const rows = (() => {
        if (Array.isArray(response?.rows)) return response.rows;
        if (Array.isArray(response?.data)) return response.data;
        if (Array.isArray((response as any)?.data?.rows)) return (response as any).data.rows;
        if (Array.isArray((response as any)?.result?.list)) return (response as any).result.list;
        return [];
      })();
      gridDevLog(`✅ [AutoFetch] Fetched ${tableName}: ${rows.length} rows`);
      const payload = {
        id: tableName,
        rows,
        total: response?.total || rows.length,
        app_id: appId,
      };
      if (setTableData) {
        setTableData(tableName, payload);
      } else {
        database[tableName] = payload;
      }
      globalTableFetchCache.delete(cacheKey);
      return rows;
    })
    .catch((err) => {
      console.error(`❌ [AutoFetch] Failed to fetch ${tableName}:`, err);
      globalTableFetchCache.delete(cacheKey);
      const emptyPayload = { rows: [], total: 0, app_id: appId };
      if (setTableData) {
        setTableData(tableName, { id: tableName, ...emptyPayload });
      } else {
        database[tableName] = emptyPayload;
      }
      throw err;
    });

  globalTableFetchCache.set(cacheKey, fetchPromise);
  fetchPromise.catch(() => {});
  return true;
}

// Vue loadData → getOptionsSelect per co field; React dùng buildSelectEnumsForFields.
export function buildDetailGridSelectEnums(
  fields: any[],
  database: any,
  decrypt?: (s: string) => string,
  seft?: any
): Record<string, any> {
  const seftContext = seft || { m_configs: { table: fields }, context: {} };
  const menuById: Map<string, any> = seftContext?.menuById instanceof Map
    ? seftContext.menuById
    : flattenAppMenusById(seftContext?.menus || []);

  const result = buildSelectEnumsForFields(fields, database, {
    menuById,
    decrypt,
    evalContext: { seft: seftContext, database },
    fallbackAppId: seftContext?.appId,
    userContext: getUserAccessContext(),
  });

  (["group_id", "permissionGroups"] as const).forEach((fieldName) => {
    const roleRows = getComboTableRows(database, "csm_roles");
    if (roleRows.length === 0) return;
    if (result[fieldName] && Object.keys(result[fieldName]).length > 0) return;
    result[fieldName] = buildRoleComboSelectEnum(roleRows);
  });

  return result;
}

// Detail Grid Tab Component - Đọc/ghi dữ liệu trực tiếp từ/vào trường form master
// Giống hệt logic Vue: seft.select_row[mn.table_name]
// detailFieldName = node.table_name = tên trường trong master record (VD: "chi_tiet_don_hang", "items")
// Dữ liệu lưu dưới dạng JSON array trong trường đó
function DetailGridTab({ node, record, appId, permissions, menusPermissions, decrypt, form, detailFieldName, menuId }: any) {
  const setTableData = useAppStore(state => state.setTableData);
  const database = useAppStore(state => state.database);
  const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
  const menuById = useMemo(() => flattenAppMenusById(apiWholeMenus || []), [apiWholeMenus]);
  
  // 🔄 Track database version để force re-compute selectEnums khi missing tables được fetch
  const [databaseVersion, setDatabaseVersion] = useState(0);
  const [detailRowsState, setDetailRowsState] = useState<Row[] | null>(null);

  const formDetailValue = form.getFieldValue(detailFieldName);

  const currentDetailRows = useMemo(() => {
    const raw = detailRowsState ?? (formDetailValue ?? record?.[detailFieldName]);
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw.trim());
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [detailFieldName, detailRowsState, formDetailValue, record, databaseVersion]);

  const detailContextRow = useMemo(() => ({
    ...(record || {}),
    [detailFieldName]: currentDetailRows,
  }), [currentDetailRows, detailFieldName, record]);
  
  // Poll for completed table fetches and trigger re-compute
  useEffect(() => {
    if (globalTableFetchCache.size === 0) return;
    
    const checkInterval = setInterval(() => {
      // If all fetches completed, increment version to trigger re-compute
      if (globalTableFetchCache.size === 0) {
        gridDevLog('✅ [DetailGridTab] All table fetches completed, triggering re-compute...');
        setDatabaseVersion(v => v + 1);
        clearInterval(checkInterval);
      }
    }, 500);
    
    return () => clearInterval(checkInterval);
  }, [globalTableFetchCache.size]);
  
  // Helper: parse detail data từ string hoặc array
  const parseDetailData = (data: any): Row[] => {
    if (Array.isArray(data)) return data;
    if (typeof data === 'string' && data.trim()) {
      try {
        const trimmed = data.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : [];
        }
      } catch (e) {
        console.warn(`Failed to parse detail data for ${detailFieldName}:`, e);
      }
    }
    return [];
  };
  
  // Khởi tạo & sync chi tiết từ form field hoặc record
  // Trigger: khi record thay đổi (chọn dòng master khác) hoặc form field thay đổi
  useEffect(() => {
    // Lấy từ form trước (ưu tiên)
    let detailData = form.getFieldValue(detailFieldName);
    
    // Fallback: lấy từ record
    if ((detailData === undefined || detailData === null) && record) {
      detailData = record[detailFieldName];
    }
    
    // Parse dữ liệu
    const parsedData = parseDetailData(detailData);
    
    gridDevLog(`[DetailGridTab] Syncing ${detailFieldName}:`, {
      hasFormValue: form.getFieldValue(detailFieldName) !== undefined && form.getFieldValue(detailFieldName) !== null,
      hasRecord: !!record,
      dataLength: parsedData.length,
      recordId: record?.id
    });
    
    // Sync to AppStore for CsmDynamicGrid
    setTableData(detailFieldName, {
      id: detailFieldName,
      rows: parsedData,
      app_id: appId,
    });
    setDetailRowsState(parsedData);
  }, [record?.id, detailFieldName, appId, setTableData]); // Depend on record.id, not record
  
  // Lắng nghe thay đổi từ database (khi grid update) và sync ngược vào form
  // GIỐNG VUE: objRowData[mn.table_name]=seft.select_row[mn.table_name]||[];
  useEffect(() => {
    const tableData = database[detailFieldName];
    if (tableData && Array.isArray(tableData.rows)) {
      const currentFormValue = form.getFieldValue(detailFieldName);
      const needsUpdate = currentFormValue === undefined || currentFormValue === null || 
                         !Array.isArray(currentFormValue) || 
                         currentFormValue.length !== tableData.rows.length ||
                         JSON.stringify(currentFormValue) !== JSON.stringify(tableData.rows);
      
      if (needsUpdate) {
        gridDevLog(`[DetailGridTab] Syncing database → form for ${detailFieldName}:`, {
          from: currentFormValue?.length || 0,
          to: tableData.rows.length
        });
        form.setFieldsValue({ [detailFieldName]: tableData.rows });
      }
    }
  }, [database[detailFieldName], detailFieldName, form]);
  
  // Wrapper để truyền vào CsmDynamicGrid:
  // Trigger code chỉ cần decrypt bằng csmDecrypt, không cần fallback hay decodeURIComponent
  // Priority: decrypt prop từ parent > csmDecrypt fallback
  const gridDecrypt = decrypt || csmDecrypt;
  
    // Debug: xem detail grid config có gì
  useEffect(() => {
    gridDevLog(`[DetailGridTab] Node config for ${detailFieldName}:`, {
      node_id: node?.id,
      node_table_name: node?.table_name,
      node_label: node?.label,
      table_fields_count: node?.table?.length,
      table_fields: node?.table?.map((f: any) => ({
        f_name: f.f_name,
        f_types: f.f_types,
        f_cbo_query: f.f_cbo_query ? '(exists)' : '(empty)',
      })),
      trigger_keys: Object.keys(node?.trigger || {}),
    });
  }, [node, detailFieldName]);
  
  // Build selectEnums từ trigger f_cbo_query (tránh phụ thuộc vào database table)
  const detailGridSelectEnums = useMemo(() => {
    const seftContext = {
      appId,
      setTableData,
      menus: apiWholeMenus,
      menuById,
      m_configs: node,
      context: {},
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
    };
    return buildDetailGridSelectEnums(node?.table || [], database, decrypt, seftContext);
  }, [node?.table, database, decrypt, node, databaseVersion, appId, apiWholeMenus, menuById, setTableData]);
  
  return (
    <div style={{ minHeight: 'auto', padding: '8px 0' }}>
      <CsmDynamicGrid
        appId={appId}
        database={database}
        permissions={permissions}
        menusPermissions={menusPermissions}
        menuId={menuId ?? node?.menu_id}
        decrypt={gridDecrypt}
        m_configs={{
          ...node,
          table_name: detailFieldName, // Tên trường chứa detail data (không phải tên bảng database!)
          table: node.table,
          type_form: 1, // Single grid
          row_type_edit: 1, // Inline editing
          selectEnumsOverride: detailGridSelectEnums, // Override selectEnums from trigger
        } as any}
        isDetailGrid={true} // Đánh dấu detail grid - không load từ database riêng
        context={{ select_row: detailContextRow }}
        onDetailRowsChange={(rows: Row[]) => {
          const nextRows = Array.isArray(rows) ? rows : [];
          setDetailRowsState(nextRows);
          setTableData(detailFieldName, {
            id: detailFieldName,
            rows: nextRows,
            app_id: appId,
          });
          form.setFieldsValue({ [detailFieldName]: nextRows });
        }}
        onDataChange={() => {}}
      />
    </div>
  );
}

// Helper lấy text đa ngôn ngữ
function getLangText(lang: string, texts: { vi: string; en: string; zh: string }) {
  if (!lang) lang = (typeof navigator !== 'undefined' ? navigator.language : 'vi') || 'vi';
  lang = lang.toLowerCase();
  if (lang.startsWith('en')) return texts.en;
  if (lang.startsWith('zh')) return texts.zh;
  return texts.vi;
}

function resolveMultilingualText(raw: any, fallback = "", langInput?: string): string {
  if (raw == null || raw === "") return String(fallback || "");
  if (typeof raw === "string" || typeof raw === "number") return String(raw);

  if (typeof raw === "object") {
    const lang = String(langInput || (typeof navigator !== "undefined" ? navigator.language : "vi") || "vi").toLowerCase();
    const vi = raw.vi ?? raw.vn;
    const en = raw.en;
    const zh = raw.zh ?? raw.cn;

    const preferred = lang.startsWith("en") ? en : lang.startsWith("zh") ? zh : vi;
    if (preferred != null && preferred !== "") return String(preferred);
    if (vi != null && vi !== "") return String(vi);
    if (en != null && en !== "") return String(en);
    if (zh != null && zh !== "") return String(zh);

    const firstScalar = Object.values(raw).find((v) => typeof v === "string" || typeof v === "number");
    if (firstScalar != null) return String(firstScalar);
  }

  return String(fallback || "");
}

function resolveFieldLabel(field: TableField, langInput?: string, translate?: any): string {
  const lang = String(langInput || (typeof navigator !== "undefined" ? navigator.language : "vi") || "vi").toLowerCase();
  const rawHeaderByLang = lang.startsWith("en")
    ? ((field as any).f_header_en ?? (field as any).f_header)
    : lang.startsWith("zh")
      ? ((field as any).f_header_zh ?? (field as any).f_header)
      : ((field as any).f_header_vi ?? (field as any).f_header);

  const resolved = resolveMultilingualText(rawHeaderByLang, field.f_name, lang);
  if (resolved.includes(".")) {
    return translate ? translate(resolved, { defaultValue: resolved }) : resolved;
  }
  return resolved;
}

function isRequiredByConfig(field: TableField): boolean {
  const requiredFlag = Number((field as any).f_required ?? (field as any).required ?? (field as any).f_buocnhap);
  if (requiredFlag === 1) return true;
  const types = String(field.f_types || "").toLowerCase();
  const tokens = types.split(/[\s,;|]+/).filter(Boolean);
  return tokens.includes("rq") || tokens.includes("required") || tokens.includes("notnull") || tokens.includes("nn");
}

function isEmptyRequiredValue(value: any): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (dayjs.isDayjs(value)) return !value.isValid();
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
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

function parseNumberByLocale(input: any, locale: string): number {
  if (typeof input === "number") return input;
  if (input == null) return NaN;

  const { group, decimal } = getLocaleNumberSeparators(locale);
  const raw = String(input)
    .trim()
    .replace(/\s+/g, "")
    .replace(new RegExp(`[^0-9\\-\\${group}\\${decimal}]`, "g"), "");

  if (!raw) return NaN;
  const normalized = raw
    .replace(new RegExp(`\\${group}`, "g"), "")
    .replace(new RegExp(`\\${decimal}`, "g"), ".");

  return Number(normalized);
}

function formatNumberByLocale(value: any, locale: string, decimals: number): string {
  if (value == null || value === "") return "";
  const parsed = typeof value === "number" ? value : parseNumberByLocale(value, locale);
  if (!Number.isFinite(parsed)) return String(value ?? "");
  const precision = Number.isFinite(decimals) && decimals > 0 ? decimals : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(parsed);
}

function encodeHtmlValue(raw: string): string {
  if (raw == null) return "";
  try {
    return encodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

function decodeHtmlValue(raw: string): string {
  if (raw == null) return "";
  try {
    return decodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

// Helper encode HTML - csmEncrypt đã tự làm encodeURIComponent bên trong rồi!
// CHỈ cần gọi csmEncrypt(plainHTML)
function encodeHtmlField(html: string): string {
  if (!html) return html;
  try {
    return csmEncrypt(String(html));
  } catch (e) {
    console.warn('⚠️ encodeHtmlField failed:', e);
    return html;
  }
}

// Helper decode HTML - csmDecrypt đã tự làm decodeURIComponent bên trong rồi!
// Nếu decrypt fail (dữ liệu cũ), fallback về decodeURIComponent
function decodeHtmlField(html: string): string {
  if (!html) return html;
  
  // Nếu input chứa %, chắc chắn là dữ liệu cũ (URL-encoded), SKIP decrypt
  if (html.includes('%')) {
    // console.log('📄 [CsmEditModal] Input contains %, skipping decrypt (old URL-encoded data)');
    try {
      const decoded = decodeURIComponent(html);
      // console.log('✅ [CsmEditModal] decodeURIComponent success');
      return decoded;
    } catch (e) {
      console.warn('⚠️ [CsmEditModal] decodeURIComponent failed:', e);
      return html;
    }
  }
  
  // Kiểm tra nếu input là plain HTML/tiếng Việt - KHÔNG decrypt
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  const hasVietnamese = /[\u00C0-\u1EF9]/i.test(html); // Tiếng Việt Unicode range
  
  if (hasHtmlTags || hasVietnamese) {
    // Chắc chắn là plain text/HTML, KHÔNG phải encrypted
    // console.log('✅ [CsmEditModal] Input is plain HTML or Vietnamese text (not encrypted), using as-is');
    return html;
  }
  
  // Thử decrypt (cho dữ liệu MỚI - encrypted)
  try {
    const decrypted = csmDecrypt(String(html));
    // Kiểm tra nếu decrypt thành công: chứa HTML tags hợp lệ
    if (decrypted && typeof decrypted === 'string' && decrypted.length > 0) {
      // Nếu chứa HTML tag thì OK
      if (/<[a-z][\s\S]*>/i.test(decrypted)) {
        // console.log('✅ [CsmEditModal] Using decrypted result (contains valid HTML)');
        return decrypted;
      }
      // console.warn('⚠️ [CsmEditModal] Decrypt result doesn\'t contain HTML tags, likely corrupted');
    }
  } catch (e) {
    console.warn('❌ [CsmEditModal] csmDecrypt failed:', (e as any).message);
  }
  
  // Fallback: return nguyên bản
  // console.log('🔙 [CsmEditModal] Using original input');
  return html;
}

const { Title } = Typography;
const { TextArea } = Input;

export type Row = Record<string, any>;
export type EditSubmitAction = "close" | "stay" | "prev" | "next" | "addAnother";

type SelectOption = {
  label: React.ReactNode;
  value: any;
};

type TextSuggestionOption = {
  label: string;
  value: string;
};

export function buildSelectOptions(
  rawOptions: { label: string; value: any }[] | undefined,
  enumObj: Record<string, { text: string }> | undefined,
  localizeLabel?: (value: unknown) => string
): SelectOption[] {
  const options = rawOptions
    ? rawOptions.map((item: any) => ({
        value: item?.value ?? item?.ma ?? item?.id ?? item?.key,
        label: resolveMultilingualText(item?.label ?? item?.ten ?? item?.text, item?.value ?? item?.ma ?? item?.id ?? item?.key),
      }))
    : enumObj
      ? Object.entries(enumObj).map(([value, enumValue]) => ({
          label: resolveMultilingualText((enumValue as any)?.text, value),
          value,
        }))
      : [];

  const normalized = normalizeComboOptions(options);

  return normalized.map((opt) => ({
    value: opt.value,
    label: localizeLabel ? localizeLabel(opt.label) : opt.label,
  }));
}

export function resolveCascadeSelectOptions(
  field: TableField,
  form: any,
  database: Record<string, any> | undefined,
  decrypt?: (s: string) => string,
  localizeLabel?: (value: unknown) => string,
): { options: SelectOption[] | null; cascadeFrom?: string; hasParentValue: boolean } {
  const rawQuery = String(field?.f_cbo_query || getLegacyFallbackComboQuery(field?.f_name) || "").trim();
  if (!rawQuery) return { options: null, hasParentValue: true };

  const resolvedQuery = resolveEffectiveComboQueryText(rawQuery, decrypt);

  let parsed: any = null;
  try {
    parsed = JSON.parse(resolvedQuery);
  } catch {
    try {
      parsed = new Function(`return (${resolvedQuery})`)();
    } catch {
      parsed = null;
    }
  }

  const cascadeFrom = String(parsed?.cascadeFrom || "").trim();
  if (!cascadeFrom) return { options: null, hasParentValue: true };

  const parentValue = form.getFieldValue(cascadeFrom);
  if (parentValue == null || String(parentValue).trim() === "") {
    return { options: [], cascadeFrom, hasParentValue: false };
  }

  const querySpec = Array.isArray(parsed?.query) ? parsed.query[0] : null;
  const tableName = String(querySpec?.obj_name || "").trim();
  const valueField = String(querySpec?.value_field || querySpec?.fields?.[0] || "id").trim() || "id";
  const labelField = String(querySpec?.label_field || querySpec?.fields?.[1] || valueField).trim() || valueField;
  const cascadeField = String(parsed?.cascadeField || querySpec?.obj_where?.field || "").trim();
  const rowsSource = tableName ? database?.[tableName] : null;
  const rows = Array.isArray(rowsSource) ? rowsSource : (Array.isArray(rowsSource?.rows) ? rowsSource.rows : []);
  if (!cascadeField || !Array.isArray(rows) || rows.length === 0) {
    return { options: [], cascadeFrom, hasParentValue: true };
  }

  const normalizedParent = String(parentValue).trim();
  const options = rows
    .filter((row: any) => String(row?.[cascadeField] || "").trim() === normalizedParent)
    .map((row: any) => ({
      value: row?.[valueField],
      label: localizeLabel ? localizeLabel(resolveMultilingualText(row?.[labelField], row?.[valueField])) : resolveMultilingualText(row?.[labelField], row?.[valueField]),
    }))
    .filter((option) => option.value != null && String(option.value).trim() !== "");

  return { options, cascadeFrom, hasParentValue: true };
}

function normalizeSelectValue(value: any, options: SelectOption[]): any {
  if (value == null || value === "") return value;

  const normalizeOne = (input: any) => {
    const directMatch = options.find((option) => option.value === input);
    if (directMatch) return directMatch.value;

    const inputText = String(input).trim();
    const looseMatch = options.find((option) => String(option.value).trim() === inputText);
    return looseMatch ? looseMatch.value : input;
  };

  if (Array.isArray(value)) {
    return value.map(normalizeOne);
  }

  return normalizeOne(value);
}

function isMultiSelectLikeType(rawTypes: unknown): boolean {
  const types = String(rawTypes || "").toLowerCase();
  return /multi_tag|menu_tree|multi_select|tag|etag/.test(types);
}

function parseMultiTagRawValue(input: any): string[] {
  if (Array.isArray(input)) {
    return Array.from(new Set(
      input
        .map((item) => {
          if (item && typeof item === "object") {
            return String(item.value ?? item.ma ?? item.id ?? item.key ?? item.label ?? item.ten ?? item.text ?? "").trim();
          }
          return String(item ?? "").trim();
        })
        .filter(Boolean),
    ));
  }
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return [];
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        return parseMultiTagRawValue(JSON.parse(text));
      } catch {
        return text.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }
    return text.split(/[,;\n]/g).map((item) => item.trim()).filter(Boolean);
  }
  if (input == null) return [];
  return [String(input).trim()].filter(Boolean);
}

function buildMultiTagSelectOptions(
  field: TableField,
  key: string,
  selectOptions: Record<string, { label: string; value: any }[]> | undefined,
  selectEnums: Record<string, Record<string, { text: string }>> | undefined,
  localizeLabel: (value: unknown) => string,
): SelectOption[] {
  const rawFromField = Array.isArray((field as any).f_options) ? (field as any).f_options : [];
  if (rawFromField.length > 0) {
    return rawFromField.map((opt: any) => {
      if (opt && typeof opt === "object") {
        const value = opt.value ?? opt.ma ?? opt.id ?? opt.key;
        const label = localizeLabel(opt.label ?? opt.ten ?? opt.text ?? value);
        return { value, label };
      }
      const value = String(opt ?? "");
      return { value, label: localizeLabel(value) };
    });
  }
  return buildSelectOptions(
    Array.isArray(selectOptions?.[key]) ? selectOptions[key] : undefined,
    selectEnums?.[key],
    localizeLabel,
  );
}

function normalizeMultiTagValues(input: any, options: SelectOption[]): string[] {
  const parsed = parseMultiTagRawValue(input);
  if (options.length === 0) return parsed;
  return Array.from(new Set(
    parsed
      .map((item) => {
        const directMatch = options.find((option) => option.value === item);
        if (directMatch) return directMatch.value;
        const looseMatch = options.find((option) => String(option.value).trim() === String(item).trim());
        return looseMatch ? looseMatch.value : item;
      })
      .filter(Boolean),
  ));
}

function collectFieldTextHistory(
  rowsSource: any,
  fieldName: string,
  currentValue: string,
  query: string,
  limit = 20,
): TextSuggestionOption[] {
  const rows = Array.isArray(rowsSource)
    ? rowsSource
    : (Array.isArray(rowsSource?.rows) ? rowsSource.rows : []);
  if (!Array.isArray(rows) || rows.length === 0 || !fieldName) return [];

  const normalizedQuery = String(query || "").trim().toLowerCase();
  const normalizedCurrent = String(currentValue || "").trim();
  const seen = new Set<string>();
  const options: TextSuggestionOption[] = [];

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const raw = rows[i]?.[fieldName];
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (!text) continue;
    if (normalizedCurrent && text === normalizedCurrent) continue;
    const normalizedText = text.toLowerCase();
    if (normalizedQuery.length >= 2 && !normalizedText.includes(normalizedQuery)) continue;
    if (seen.has(normalizedText)) continue;
    seen.add(normalizedText);
    const oneLine = text.replace(/\s+/g, " ").trim();
    options.push({
      value: text,
      label: oneLine.length > 90 ? `${oneLine.slice(0, 90)}...` : oneLine,
    });
    if (options.length >= limit) break;
  }

  return options;
}

// Key-value editor for JSON fields
function JSONKeyValueEditor({ name, form }: { name: string; form: any }) {
  const getPairs = useCallback(() => {
    const val = form.getFieldValue(name) || {};
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          return parsed.map((v, i) => ({ k: i, v }));
        }
        if (typeof parsed === 'object') {
          return Object.entries(parsed).map(([k, v]) => ({ k, v }));
        }
        return [{ k: '', v: parsed }];
      } catch {
        return [{ k: '', v: val }];
      }
    }
    if (Array.isArray(val)) {
      return val.map((v, i) => ({ k: i, v }));
    }
    if (val && typeof val === 'object') {
      return Object.entries(val).map(([k, v]) => ({ k, v }));
    }
    return [{ k: '', v: val }];
  }, [form, name]);
  const [pairs, setPairs] = useState(getPairs);
  useEffect(() => { setPairs(getPairs()); }, [getPairs]);
  const commit = (next: Array<{ k: any; v: any }>) => {
    setPairs(next);
    let obj: any;
    if (next.every(p => typeof p.k === 'number' || p.k === '' || !p.k)) {
      obj = next.map(p => p.v);
    } else {
      obj = {};
      next.forEach(p => { if (p.k) obj[p.k] = p.v; });
    }
    form.setFieldsValue({ [name]: obj });
  };
  return (
    <div>
      {pairs.map((p: any, idx: number) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          <Input id={`${name}-key-${idx}`} placeholder="Key" value={p.k} onChange={e => { const next = [...pairs]; next[idx] = { ...next[idx], k: e.target.value }; commit(next); }} />
          <Input id={`${name}-value-${idx}`} placeholder="Value" value={p.v} onChange={e => { const next = [...pairs]; next[idx] = { ...next[idx], v: e.target.value }; commit(next); }} />
          <Button danger size="small" onClick={() => { const next = pairs.filter((_: any, i: number) => i !== idx); commit(next); }}>Xóa</Button>
        </div>
      ))}
      <Button type="dashed" block onClick={() => commit([...pairs, { k: '', v: '' }])}>Thêm cặp</Button>
    </div>
  );
}

// Multilingual field tabs
function MultilingualTabs({ fields, form }: { fields: TableField[]; form: any }) {
	const { i18n } = useTranslation();
  // Gom trường theo ngôn ngữ: trường gốc là tiếng Việt, các trường có hậu tố là ngôn ngữ tương ứng
  const langs = ['vi', 'en', 'zh'];
  const defaultLang = 'vi';
  const currentAppId = useUserStore(state => state.app_id) || 'csm';

  // Gom các trường thành nhóm theo base name
  const baseMap: Record<string, Record<string, TableField>> = {};
  fields.forEach(f => {
    // Tách base name và lang
    const match = f.f_name.match(/^(.*?)(_([a-z]{2}))?$/);
    let base = f.f_name;
    let lang = 'vi';
    if (match) {
      base = match[1];
      if (match[3] && langs.includes(match[3])) {
        lang = match[3];
      }
    }
    if (!baseMap[base]) baseMap[base] = {};
    // Nếu là trường gốc (không hậu tố) và có _en hoặc _zh thì gán cho 'vi'
    if (match && !match[2]) {
      const hasEn = !!fields.find(ff => ff.f_name === `${base}_en`);
      const hasZh = !!fields.find(ff => ff.f_name === `${base}_zh`);
      if (hasEn || hasZh) {
        baseMap[base]['vi'] = f;
      } else {
        baseMap[base][lang] = f;
      }
    } else if (match) {
      baseMap[base][lang] = f;
    }
  });

  // Chỉ lấy các base có ít nhất một trường thuộc ngôn ngữ
  return (
    <Form.Item label="Nội dung đa ngôn ngữ" style={{ marginBottom: 24 }}>
      <Tabs defaultActiveKey={defaultLang}>
        {langs.map(lang => (
          <Tabs.TabPane tab={lang === 'vi' ? '🇻🇳 Tiếng Việt' : lang === 'en' ? '🇬🇧 English' : '🇨🇳 中文'} key={lang}>
            {(() => {
              // Render các trường thuộc ngôn ngữ tab
              const tabFields = Object.entries(baseMap).map(([base, langObj]) => {
                const field = langObj[lang];
                if (!field) return null;
                const fieldLabel = resolveMultilingualText(field.f_header, field.f_name, lang);
                const types = (field.f_types || '').toLowerCase();
                if (/html|richtext/.test(types)) {
                  const value = decodeHtmlValue(String(form.getFieldValue(field.f_name) ?? ''));
                  return (
                    <Form.Item key={field.f_name} name={field.f_name} label={fieldLabel}>
                      <HtmlEditor value={value} onChange={(val: string) => form.setFieldsValue({ [field.f_name]: val })} appId={currentAppId} />
                    </Form.Item>
                  );
                }
                if (/textarea|memo/.test(types)) {
                  return <Form.Item key={field.f_name} name={field.f_name} label={fieldLabel}><TextArea rows={6} /></Form.Item>;
                }
                if (types === 'image') {
                  const MediaUploader = lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));
                  return (
                    <Form.Item key={field.f_name} name={field.f_name} label={fieldLabel}>
                      <Suspense fallback={<span>Đang tải...</span>}>
                        <MediaUploader appId={currentAppId} />
                      </Suspense>
                    </Form.Item>
                  );
                }
                if (/^multi_tag$|^multi_select$|(^|[\s,;|])tag([\s,;|]|$)|(^|[\s,;|])etag([\s,;|]|$)/.test(types)) {
                  return <Form.Item key={field.f_name} name={field.f_name} label={fieldLabel}><Select mode="tags" style={{ width: '100%' }} tokenSeparators={[',']} /></Form.Item>;
                }
                return <Form.Item key={field.f_name} name={field.f_name} label={fieldLabel}><Input id={field.f_name} /> </Form.Item>;
              });
              if (tabFields.filter(Boolean).length === 0) {
				return <div style={{ color: 'var(--ant-colorTextDisabled)', fontStyle: 'italic', padding: '16px 0' }}>{getLangText(i18n.language, {
					vi: 'Không có dữ liệu cho ngôn ngữ này',
					en: 'No data available for this language',
					zh: '该语言暂无数据',
				})}</div>;
              }
              return tabFields;
            })()}
          </Tabs.TabPane>
        ))}
      </Tabs>
    </Form.Item>
  );
}

function parseFieldComboQuery(field: TableField, decrypt?: (s: string) => string): any | null {
  const rawQuery = String(field?.f_cbo_query || "").trim();
  if (!rawQuery) return null;
  const resolvedQuery = resolveEffectiveComboQueryText(rawQuery, decrypt);
  try {
    return JSON.parse(resolvedQuery);
  } catch {
    try {
      return new Function(`return (${resolvedQuery})`)();
    } catch {
      return null;
    }
  }
}

function extractCascadeParentFields(fields: TableField[], decrypt?: (s: string) => string): string[] {
  const parents = new Set<string>();
  fields.forEach((field) => {
    const parsed = parseFieldComboQuery(field, decrypt);
    const cascadeFrom = String(parsed?.cascadeFrom || "").trim();
    if (cascadeFrom) parents.add(cascadeFrom);
  });
  return Array.from(parents);
}

function extractCascadeChildFields(fields: TableField[], parentField: string, decrypt?: (s: string) => string): string[] {
  const normalizedParent = String(parentField || "").trim();
  if (!normalizedParent) return [];
  return fields
    .filter((field) => String(parseFieldComboQuery(field, decrypt)?.cascadeFrom || "").trim() === normalizedParent)
    .map((field) => String(field.f_name || "").trim())
    .filter(Boolean);
}

function getFieldComponent(
  f: TableField,
  form: any,
  selectEnums?: Record<string, any>,
  fieldValues?: Record<string, any>,
  selectOptions?: Record<string, { label: string; value: any }[]>,
  database?: Record<string, any>,
  m_configs?: MConfig,
  appId?: string,
  permissions?: number,
  menusPermissions?: Record<string | number, number>,
  decrypt?: (s: string) => string,
  translate?: (key: string, defaultValue?: string) => string,
  currentLang?: string,
  record?: Row | null,
  onFieldChange?: (fieldName: string, value: unknown) => void,
  menuById?: Map<string, any>,
  comboEvalSeft?: Record<string, any>,
) {
  const types = resolveEffectiveFieldTypes(f); // infer special types even when DB sends generic f_types
  const key = f.f_name;
  const lang = String(currentLang || navigator.language || 'vi').toLowerCase();
  const numberLocale = resolveNumberLocale(lang);
  const dateLocaleFormat = resolveDateLocaleFormat(lang);
  const fieldLabel = resolveFieldLabel(f, lang, translate);
  const initialVal = fieldValues?.[key];
  const activeFieldValue = String(form.getFieldValue(key) ?? initialVal ?? "");
  const activeFieldQuery = activeFieldValue.split("\n").slice(-1)[0] || activeFieldValue;
  const tableName = String(m_configs?.table_name || "").split(",")[0].trim();
  const textHistoryOptions = collectFieldTextHistory(
    tableName ? database?.[tableName] : undefined,
    key,
    activeFieldValue,
    activeFieldQuery,
    25,
  );
  const recordId = String(record?.id ?? fieldValues?.id ?? form.getFieldValue("id") ?? "").trim();
  const isExistingRecord = Boolean(recordId);
  
  // Kiểu Readonly: chứa 'ro' trong f_types - chỉ hiển thị, không cho edit
  const isReadonly = types.indexOf('ro') !== -1 || (key === "role_code" && isExistingRecord);

  const parseStringArray = (raw: any): string[] => {
    if (Array.isArray(raw)) {
      return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)));
    }
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) return [];
      if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean)));
          }
        } catch {
          // Fallback to delimiter split below.
        }
      }
      return Array.from(new Set(text.split(/[;,\n]/g).map((item) => item.trim()).filter(Boolean)));
    }
    return [];
  };

  const localizeLabel = (raw: unknown) => {
    const text = resolveMultilingualText(raw, "", lang).trim();
    if (!text) return "";
    if (text.includes(".")) {
      return translate ? translate(text, text) : text;
    }
    return text;
  };

  const buildMenuPermissionTreeData = () => {
    const sourceMenus = usePermissionStore.getState().apiWholeMenus || [];
    const mapNode = (node: any): any => {
      const rawValue = String(node?.path || node?.id || node?.key || node?.name || "").trim();
      if (!rawValue) return null;
      const rawTitle = resolveMultilingualText(node?.label || node?.title || node?.name, rawValue, lang);
      const children = Array.isArray(node?.children)
        ? node.children.map((child: any) => mapNode(child)).filter(Boolean)
        : undefined;
      return {
        title: rawTitle,
        value: rawValue,
        key: rawValue,
        children: children && children.length > 0 ? children : undefined,
      };
    };
    return sourceMenus.map((item: any) => mapNode(item)).filter(Boolean);
  };
  
  // Kiểu HTML/RichText dùng HtmlEditor thuần (không mã hóa/giải mã)
  if (/html|richtext/.test(types)) {
    const value = decodeHtmlValue(String(form.getFieldValue(key) ?? initialVal ?? ''));
    return (
      <Form.Item key={key} name={key} label={fieldLabel}>
        <HtmlEditor value={value} onChange={(val: string) => form.setFieldsValue({ [key]: val })} appId={appId} />
      </Form.Item>
    );
  }

  // edt dùng TextArea
  if (types === 'edt') {
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <div>
        <AutoComplete
          options={textHistoryOptions}
          filterOption={false}
          onSelect={(nextValue) => {
            form.setFieldsValue({ [key]: nextValue });
            onFieldChange?.(key, nextValue);
          }}
          dropdownMatchSelectWidth={false}
        >
          <Input.TextArea
            rows={8}
            disabled={isReadonly}
            placeholder={textHistoryOptions.length > 0 ? "Nhập để lọc mẫu cũ và chọn nhanh" : undefined}
            onChange={(event) => onFieldChange?.(key, event.target.value)}
          />
        </AutoComplete>
        {textHistoryOptions.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--ant-colorTextDescription)" }}>
            Gợi ý nhanh từ dữ liệu cũ cùng trường.
          </div>
        )}
      </div>
    </Form.Item>;
  }
  
  // Kiểu Code Editor: codejs, codejava, codehtml, ... (dùng CodeMirror như TriggerEditor)
  if (/code/.test(types)) {
    function getLanguageExtension(mode: string) {
      switch (mode) {
        case 'html': return html();
        case 'css': return css();
        case 'python': return python();
        case 'sql': return sql();
        case 'xml': return xml();
        case 'javascript':
        default:
          return javascript();
      }
    }

    function CodeEditorField() {
      const formValue = form.getFieldValue(key);
      const hasFormValue = formValue !== undefined && formValue !== null && formValue !== '';
      const value = React.useMemo(() => {
        // Nếu form có giá trị, giải mã (hỗ trợ cả dữ liệu cũ lẫn mới)
        if (hasFormValue && typeof formValue === 'string') {
          return decodeHtmlField(formValue);
        }
        // Nếu không có form value, dùng initialVal (đã được giải mã rồi)
        if (initialVal && typeof initialVal === 'string') {
          return initialVal;
        }
        return '';
      }, [formValue, hasFormValue]);
      // Chọn mode dựa trên types
      let codeMode = 'javascript';
      if (/python/.test(types)) codeMode = 'python';
      else if (/html/.test(types)) codeMode = 'html';
      else if (/css/.test(types)) codeMode = 'css';
      else if (/sql/.test(types)) codeMode = 'sql';
      else if (/xml/.test(types)) codeMode = 'xml';

      const handleCodeChange = React.useCallback((val: string) => {
        // Mã hóa khi thay đổi: encodeURIComponent → csmEncrypt
        const encoded = encodeHtmlField(val);
        const current = form.getFieldValue(key);
        if (encoded !== current) {
          form.setFieldsValue({ [key]: encoded });
        }
      }, [form, key]);

      return (
        <div style={{ border: '1px solid var(--ant-colorBorder)', borderRadius: 4, overflow: 'hidden', width: '100%' }}>
          <CodeMirror
            value={value}
            height="400px"
            width="100%"
            theme={vscodeDark}
            extensions={[getLanguageExtension(codeMode)]}
            onChange={handleCodeChange}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              autocompletion: true,
              bracketMatching: true,
              closeBrackets: true,
            }}
            readOnly={isReadonly}
          />
        </div>
      );
    }
    // initialValue được set từ form.setFieldsValue() trước khi component render
    return (
      <Form.Item key={key} name={key} label={fieldLabel}>
        <CodeEditorField />
      </Form.Item>
    );
  }
  
  // Kiểu JSON
    // Kiểu JSON: nếu là bảng chi tiết (array field) thì render DetailGridTab (subgrid)
    if (types === 'json') {
      // Đối với kiểu json, không cần có field trong fields cha, chỉ cần match với table_name của node con
      const detailFieldName = key;
      if (typeof m_configs === 'object' && Array.isArray(m_configs.nodes)) {
        const detailNode = m_configs.nodes.find(
          (n: any) => n.table_name === key || n.id === key
        );
        if (detailNode) {
          return (
            <DetailGridTab
              key={key}
              node={detailNode}
              record={fieldValues}
              appId={appId}
              permissions={permissions}
              menusPermissions={menusPermissions}
              decrypt={decrypt}
              form={form}
              detailFieldName={detailFieldName}
              menuId={(m_configs as any)?.menu_id ?? detailNode?.menu_id}
            />
          );
        }
      }
      return (
        <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
          <JSONKeyValueEditor name={key} form={form} />
        </Form.Item>
      );
    }
  
  // Kiểu số: price, number, int, float, double, money, currency
  if (/price|number|int|float|double|money|currency/.test(types)) {
    const dec = parseInt(String((f as TableField & { f_dec?: number | string }).f_dec || 0));
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <InputNumber 
        style={{ width: '100%' }} 
        precision={dec > 0 ? dec : 0}
        formatter={(value) => formatNumberByLocale(value, numberLocale, dec > 0 ? dec : 0)}
        parser={(value) => {
          const parsed = parseNumberByLocale(value, numberLocale);
          return Number.isFinite(parsed) ? String(parsed) : "";
        }}
        disabled={isReadonly}
      />
    </Form.Item>;
  }
  
  // Kiểu DateTime
  if (/datetime/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel}>
      <DatePicker showTime format={dateLocaleFormat.datetime} style={{ width: '100%' }} disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Kiểu Date (chỉ ngày)
  if (/^date$/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel}>
      <DatePicker format={dateLocaleFormat.date} style={{ width: '100%' }} disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Kiểu Time (chỉ giờ)
  if (/^time$/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel}>
      <TimePicker format={dateLocaleFormat.time} style={{ width: '100%' }} disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Kiểu Check/Boolean: check, bool, switch, checkbox
  if (/check|bool|switch|checkbox/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel} valuePropName="checked" initialValue={initialVal}>
      <Switch disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Kiểu Textarea/Memo
  if (/textarea|memo/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <div>
        <AutoComplete
          options={textHistoryOptions}
          filterOption={false}
          onSelect={(nextValue) => {
            form.setFieldsValue({ [key]: nextValue });
            onFieldChange?.(key, nextValue);
          }}
          dropdownMatchSelectWidth={false}
        >
          <Input.TextArea
            rows={6}
            disabled={isReadonly}
            placeholder={textHistoryOptions.length > 0 ? "Nhập để lọc mẫu cũ và chọn nhanh" : undefined}
            onChange={(event) => onFieldChange?.(key, event.target.value)}
          />
        </AutoComplete>
        {textHistoryOptions.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--ant-colorTextDescription)" }}>
            Gợi ý nhanh từ dữ liệu cũ cùng trường.
          </div>
        )}
      </div>
    </Form.Item>;
  }
  
  // Kiểu File Upload
  if (/^file$/.test(types)) {
    const value = form.getFieldValue(key) || initialVal;
    return (
      <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
        <Input 
          type="file" 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onloadend = () => {
                form.setFieldsValue({ [key]: reader.result });
              };
              reader.readAsDataURL(file);
            }
          }}
        />
        {value && (
          <div style={{ marginTop: 8 }}>
            <a href={resolveMediaUrl(String(value))} target="_blank" rel="noopener noreferrer" download>
              📎 Download {fieldLabel}
            </a>
          </div>
        )}
      </Form.Item>
    );
  }
  // Kiểu Image/Video Inline Upload: image_inline, album_inline, video_inline, album_video_inline (cho phép upload ngay trong form)
  if (types === 'image_inline' || types === 'album_inline' || types === 'video_inline' || types === 'album_video_inline') {
    const isAlbum = types === 'album_inline' || types === 'album_video_inline';
    const isVideo = types === 'video_inline' || types === 'album_video_inline';
    const value = form.getFieldValue(key) || initialVal;
    return (
      <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
        <InlineImageUploader value={value} onChange={(url) => form.setFieldsValue({ [key]: url })} multiple={isAlbum} acceptVideo={isVideo} appId={appId} />
      </Form.Item>
    );
  }
  // Kiểu Video: video, videos, media
  if (/^video$|^videos$|^media$/.test(types)) {
    const formValue = form.getFieldValue(key);
    const currentValue = (formValue !== undefined && formValue !== null && formValue !== '') ? formValue : initialVal;
    const MediaUploader = lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));
    
    function VideoField() {
      const [videoUrl, setVideoUrl] = React.useState(currentValue || '');
      React.useEffect(() => {
        setVideoUrl(currentValue || '');
      }, [currentValue]);
      
      const handleVideoChange = React.useCallback((urls: string | string[]) => {
        const url = Array.isArray(urls) ? urls[0] : urls;
        setVideoUrl(url);
        form.setFieldsValue({ [key]: url });
      }, []);
      
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {videoUrl && (
            <div style={{ position: 'relative' }}>
              <video src={resolveMediaUrl(videoUrl)} style={{ maxWidth: 120, maxHeight: 100, borderRadius: 8, border: '1px solid var(--ant-colorBorderSecondary)' }} />
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ant-colorTextTertiary)' }}>Preview</div>
            </div>
          )}
          <Suspense fallback={<span>Đang tải...</span>}>
            <MediaUploader value={videoUrl} onChange={handleVideoChange} type="video" appId={appId || "csm"} />
          </Suspense>
        </div>
      );
    }
    
    return (
      <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
        <VideoField />
      </Form.Item>
    );
  }
  // Kiểu Image: img, image, avatar, cover
  if (/img|image|avatar|cover/.test(types)) {
    const formValue = form.getFieldValue(key);
    const currentValue = (formValue !== undefined && formValue !== null && formValue !== '') ? formValue : initialVal;
    const MediaUploader = lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));
    
    function ImageField() {
      const [imageUrl, setImageUrl] = React.useState(currentValue || '');
      React.useEffect(() => {
        setImageUrl(currentValue || '');
      }, [currentValue]);
      
      const handleImageChange = React.useCallback((urls: string | string[]) => {
        const url = Array.isArray(urls) ? urls[0] : urls;
        setImageUrl(url);
        form.setFieldsValue({ [key]: url });
      }, []);
      
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {imageUrl && <img src={resolveMediaUrl(imageUrl)} alt="Ảnh" style={{ maxWidth: 100, maxHeight: 100, borderRadius: 8, border: '1px solid var(--ant-colorBorderSecondary)' }} />}
          <Suspense fallback={<span>Đang tải...</span>}>
            <MediaUploader value={imageUrl} onChange={handleImageChange} appId={appId || "csm"} />
          </Suspense>
        </div>
      );
    }
    
    return (
      <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
        <ImageField />
      </Form.Item>
    );
  }
  if (types === 'album' || types === 'images' || types === 'gallery') {
    const formValue = form.getFieldValue(key);
    const normalizedInitial = (() => {
      if (Array.isArray(initialVal)) return initialVal;
      if (typeof initialVal === 'string') {
        try {
          const parsed = JSON.parse(initialVal);
          return Array.isArray(parsed) ? parsed : (initialVal ? [initialVal] : []);
        } catch {
          return initialVal ? [initialVal] : [];
        }
      }
      return [];
    })();
    const currentValue = Array.isArray(formValue) ? formValue : normalizedInitial;
    const MediaUploader = lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));

    function AlbumField() {
      const [mediaUrls, setMediaUrls] = React.useState<string[]>(currentValue || []);
      React.useEffect(() => {
        setMediaUrls(currentValue || []);
      }, [currentValue]);

      const handleMediaChange = React.useCallback((urls: string | string[]) => {
        const next = Array.isArray(urls) ? urls : (urls ? [urls] : []);
        setMediaUrls(next);
        form.setFieldsValue({ [key]: next });
      }, []);

      return (
        <Suspense fallback={<span>Đang tải...</span>}>
          <MediaUploader value={mediaUrls} onChange={handleMediaChange} type="both" multiple={true} appId={appId || "csm"} />
        </Suspense>
      );
    }

    return (
      <Form.Item key={key} name={key} label={fieldLabel} initialValue={currentValue}>
        <AlbumField />
      </Form.Item>
    );
  }
  // Kiểu Album Video: album_video (multiple videos)
  if (types === 'album_video' || types === 'videos_album') {
    const formValue = form.getFieldValue(key);
    const currentValue = Array.isArray(formValue) ? formValue : (initialVal && Array.isArray(initialVal) ? initialVal : []);
    const MediaUploader = lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));
    
    function AlbumVideoField() {
      const [videos, setVideos] = React.useState(currentValue || []);
      React.useEffect(() => {
        setVideos(currentValue || []);
      }, [currentValue]);
      
      const handleVideoAdd = React.useCallback((urls: string | string[]) => {
        const url = Array.isArray(urls) ? urls[0] : urls;
        if (url && url !== '') {
          const newVideos = [...videos, url];
          setVideos(newVideos);
          form.setFieldsValue({ [key]: newVideos });
        }
      }, [videos]);
      
      const handleVideoRemove = React.useCallback((idx: number) => {
        const newVideos = videos.filter((_: string, i: number) => i !== idx);
        setVideos(newVideos);
        form.setFieldsValue({ [key]: newVideos });
      }, [videos]);
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {videos.map((vid: string, idx: number) => (
              <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                <video src={resolveMediaUrl(vid)} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }} />
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  style={{ position: 'absolute', top: 4, right: 4 }}
                  onClick={() => handleVideoRemove(idx)}
                />
              </div>
            ))}
          </div>
          <Suspense fallback={<span>Đang tải...</span>}>
            <MediaUploader value={undefined} onChange={handleVideoAdd} type="video" multiple={false} appId={appId || "csm"} />
          </Suspense>
        </div>
      );
    }
    
    return (
      <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
        <AlbumVideoField />
      </Form.Item>
    );
  }
  // Kiểu Multi Tag / Tag legacy aliases
  if (/^multi_tag$|^multi_select$|(^|[\s,;|])tag([\s,;|]|$)|(^|[\s,;|])etag([\s,;|]|$)/.test(types)) {
    const tagOptions = buildMultiTagSelectOptions(f, key, selectOptions, selectEnums, localizeLabel);
    const normalizedInitial = normalizeMultiTagValues(form.getFieldValue(key) ?? initialVal, tagOptions);
    const selectMode = tagOptions.length > 0 ? "multiple" : "tags";

    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={normalizedInitial}>
      <Select
        mode={selectMode as any}
        style={{ width: '100%' }}
        tokenSeparators={[',']}
        options={tagOptions}
        optionFilterProp="label"
        allowClear
        onChange={(nextValue) => {
          const normalized = normalizeMultiTagValues(nextValue, tagOptions);
          form.setFieldsValue({ [key]: normalized });
        }}
      />
    </Form.Item>;
  }

  // Kiểu cây menu phân quyền (new permission model)
  if (types.indexOf('menu_tree') !== -1) {
    const treeData = buildMenuPermissionTreeData();
    const selectedValues = parseStringArray(form.getFieldValue(key) ?? initialVal);
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={selectedValues}>
      <TreeSelect
        treeData={treeData}
        value={selectedValues}
        style={{ width: '100%' }}
        treeCheckable
        showSearch
        allowClear
        disabled={isReadonly}
        placeholder={translate ? translate("system.userPermission.fields.menusPermissions", "Select menu permissions") : "Select menu permissions"}
        onChange={(nextValue) => {
          const normalized = Array.isArray(nextValue)
            ? nextValue.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          form.setFieldsValue({ [key]: Array.from(new Set(normalized)) });
        }}
      />
    </Form.Item>;
  }
  
  // Kiểu Select/CBO (combobox) - hỗ trợ thêm alias select/cbo cho tương thích dữ liệu cũ
  if (isComboLikeType(types)) {
    const rawOptions = selectOptions?.[key];
    const cascadeConfig = resolveCascadeSelectOptions(f, form, database, decrypt, localizeLabel);
    const roleFieldNames = new Set(["group_id", "permissiongroups", "group_rights", "grouprights"]);
    const roleRows = roleFieldNames.has(String(key || "").trim().toLowerCase())
      ? getComboTableRows(database, "csm_roles")
      : [];
    let localizedOptions: SelectOption[];
    if (roleRows.length > 0) {
      localizedOptions = buildRoleComboOptions(roleRows).map((opt) => ({
        value: opt.value,
        label: localizeLabel ? localizeLabel(opt.label) : opt.label,
      }));
    } else {
      localizedOptions = resolveEditFieldComboSelectOptions(f, database, {
        selectEnum: selectEnums?.[key],
        rawSelectOptions: rawOptions,
        menuById,
        fallbackAppId: appId,
        userContext: getUserAccessContext(),
        decrypt,
        evalContext: { seft: comboEvalSeft || { m_configs, database, appId }, database },
        localizeLabel: (label) => localizeLabel(label),
        cascadeFrom: cascadeConfig.cascadeFrom && cascadeConfig.hasParentValue ? cascadeConfig.cascadeFrom : undefined,
        cascadeOptions: cascadeConfig.cascadeFrom && cascadeConfig.hasParentValue ? (cascadeConfig.options ?? []) : null,
      });
    }
    const rawSelectValue = form.getFieldValue(key) ?? initialVal;
    const selectValue = normalizeSelectValue(rawSelectValue, localizedOptions);
    if (selectValue != null && String(selectValue).trim() !== "") {
      const hasSelectedOption = localizedOptions.some((option) => String(option.value).trim() === String(selectValue).trim());
      if (!hasSelectedOption) {
        const fallbackLabel = roleFieldNames.has(String(key || "").trim().toLowerCase())
          ? resolveRoleComboLabel(selectValue, database)
          : String(selectValue);
        localizedOptions = [{ value: selectValue, label: fallbackLabel }, ...localizedOptions];
      }
    }

    return <Form.Item key={key} name={key} label={fieldLabel}>
      <Select 
        key={`${key}-opts-${localizedOptions.length}`}
        style={{ width: '100%' }} 
        options={localizedOptions}
        showSearch
        virtual={localizedOptions.length > 50}
        optionFilterProp="label"
        allowClear
        disabled={isReadonly || (Boolean(cascadeConfig.cascadeFrom) && !cascadeConfig.hasParentValue)}
        placeholder={translate ? translate("common.select", `Select ${fieldLabel}`) : `Select ${fieldLabel}`}
        onChange={(val) => {
          form.setFieldsValue({ [key]: val });
          onFieldChange?.(key, val);
        }}
      />
    </Form.Item>;
  }
  
  // Kiểu Password
  if (/password/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <Input.Password disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Mặc định: ed (text input)
  return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
    <Input id={key} readOnly={isReadonly} />
  </Form.Item>;
}

export function CsmEditModal({
  open,
  onOpenChange,
  mode = "modal",
  canNavigatePrev = false,
  canNavigateNext = false,
  showRowNavigator = false,
  showAddAnother = false,
  onNavigateRecord,
  title,
  m_configs,
  fields,
  record,
  onSubmit,
  selectEnums,
  selectOptions,
  database,
  appId,
  permissions,
  menusPermissions,
  decrypt,
  embeddedPanelContainer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode?: "modal" | "embedded";
  embeddedPanelContainer?: React.RefObject<HTMLElement>;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
  showRowNavigator?: boolean;
  showAddAnother?: boolean;
  onNavigateRecord?: (direction: "prev" | "next") => void;
  title: string;
  m_configs: MConfig;
  fields: TableField[];
  record?: Row | null;
  onSubmit: (values: Row, action?: EditSubmitAction) => Promise<void> | void;
  selectEnums?: Record<string, Record<string, { text: string }>>;
  selectOptions?: Record<string, { label: string; value: any }[]>;
  database?: Record<string, { rows: Row[] }>;
  appId?: string;
  permissions?: number;
  menusPermissions?: Record<string | number, number>;
  decrypt?: (s: string) => string;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [valuesReady, setValuesReady] = useState(false);
  const [databaseVersion, setDatabaseVersion] = useState(0);
  const [comboEditBusy, setComboEditBusy] = useState(false);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const user = useUserStore();
  const globalDatabase = useAppStore(state => state.database);
  const setTableData = useAppStore(state => state.setTableData);
  const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
  const menuById = useMemo(() => flattenAppMenusById(apiWholeMenus || []), [apiWholeMenus]);
  const mergedDatabase = useMemo(
    () => ({ ...(database || {}), ...globalDatabase }),
    [database, globalDatabase],
  );
  const currentAppId = appId || user.app_id || "csm";
  const isEmbedded = mode === "embedded";
  
  // Track if we're currently updating from trigger to prevent recursion
  const isUpdatingFromTrigger = useRef(false);
  const updateTriggerTimer = useRef<NodeJS.Timeout | null>(null);

  // Helper: Create seft context with all utility functions
  const createSeftContext = useCallback(() => ({
    m_configs,
    database: mergedDatabase,
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
  }), [m_configs, mergedDatabase]);
  const effectiveDecrypt = decrypt || csmDecrypt;

  const comboEvalSeft = useMemo(() => ({
    m_configs,
    database: mergedDatabase,
    appId: currentAppId,
    menus: apiWholeMenus,
    menuById,
    setTableData,
    context: {},
  }), [m_configs, mergedDatabase, currentAppId, apiWholeMenus, menuById, setTableData]);

  const dynamicFields: TableField[] = useMemo(() => {
    return Array.isArray(m_configs?.table)
      ? m_configs.table
          .filter(f => Number(f.f_show) === 1 && f.f_name !== 'id')
          .sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0))
      : [];
  }, [m_configs]);

  useEffect(() => {
    if (!open || globalTableFetchCache.size === 0) return;
    const checkInterval = window.setInterval(() => {
      if (globalTableFetchCache.size === 0) {
        setDatabaseVersion((v) => v + 1);
        window.clearInterval(checkInterval);
      }
    }, 500);
    return () => window.clearInterval(checkInterval);
  }, [open, globalTableFetchCache.size]);

  useEffect(() => {
    if (!open) {
      setComboEditBusy(false);
      return;
    }
    const comboFields = dynamicFields.filter((field) => isComboLikeType(resolveEffectiveFieldTypes(field)));
    if (comboFields.length === 0) {
      setComboEditBusy(false);
      return;
    }

    let cancelled = false;
    setComboEditBusy(true);

    void prefetchComboTablesForEdit({
      fields: comboFields,
      fallbackAppId: currentAppId,
      menuById,
      userContext: getUserAccessContext(),
      evalContext: {
        seft: comboEvalSeft,
        database: mergedDatabase,
      },
      database: mergedDatabase,
      setTableData,
      decrypt: effectiveDecrypt,
    }, {
      onFullLoadStart: () => { if (!cancelled) setComboEditBusy(true); },
      onFullLoadEnd: () => { if (!cancelled) setComboEditBusy(false); },
    }).then(() => {
      if (!cancelled) setDatabaseVersion((v) => v + 1);
    }).finally(() => {
      if (!cancelled) setComboEditBusy(false);
    });

    return () => {
      cancelled = true;
      setComboEditBusy(false);
    };
  }, [open, dynamicFields, mergedDatabase, currentAppId, menuById, effectiveDecrypt, comboEvalSeft, setTableData]);

  const modalSelectEnums = useMemo(() => {
    if (!open) return selectEnums || {};
    const seftContext = {
      appId: currentAppId,
      setTableData,
      menus: apiWholeMenus,
      menuById,
      m_configs,
      context: {},
      database: mergedDatabase,
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
      dateFormat,
      chuyenNgay,
      TruNgayRaSoNgay,
      CongNgay,
      CongGio,
      validateEmail,
      validatePhone,
      DateUtils,
    };
    const built = buildDetailGridSelectEnums(
      dynamicFields,
      mergedDatabase,
      effectiveDecrypt,
      seftContext,
    );
    const merged = { ...(selectEnums || {}) };
    Object.entries(built).forEach(([fieldName, enumObj]) => {
      if (enumObj && Object.keys(enumObj).length > 0) {
        merged[fieldName] = enumObj;
      }
    });
    return merged;
  }, [
    open,
    selectEnums,
    dynamicFields,
    mergedDatabase,
    effectiveDecrypt,
    currentAppId,
    menuById,
    apiWholeMenus,
    databaseVersion,
    setTableData,
    m_configs,
  ]);

  const applyRowTrigger = useCallback((triggerName: string, data: any) => {
    if (!(m_configs.trigger as any)?.[triggerName]) {
      gridDevLog(`[CsmEditModal.applyRowTrigger] No trigger code for: ${triggerName}`);
      return null;
    }

    const effectiveDecrypt = decrypt || csmDecrypt;
    const fn = compileMenuTrigger<[any, any, any], any>(
      m_configs?.trigger as Record<string, unknown>,
      triggerName,
      ["seft", "data", "bang"],
      effectiveDecrypt,
    );
    if (!fn) {
      console.error(`[CsmEditModal.applyRowTrigger] Failed to create function for: ${triggerName}`);
      return null;
    }

    const seftContext = createSeftContext();
    try {
      const result = fn(seftContext, JSON.parse(JSON.stringify(data)), mergedDatabase);
      gridDevLog(`[CsmEditModal.applyRowTrigger] ${triggerName} result:`, result);
      return result;
    } catch (err) {
      console.error(`[CsmEditModal.applyRowTrigger] Error executing ${triggerName}:`, err);
      return null;
    }
  }, [m_configs, mergedDatabase, decrypt, createSeftContext]);
  
  // Helper: Run UPDATE trigger realtime (near-instant)
  const runUpdateTriggerRealtime = useCallback((changedValues: any, allValues: any) => {
    gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Triggered with changed values:', changedValues);

    const isMasterDetail = Number(m_configs.type_form) === 2;
    if (isMasterDetail && changedValues && typeof changedValues === 'object') {
      const nodes = Array.isArray((m_configs as any).nodes) ? (m_configs as any).nodes : [];
      const detailFieldNames = new Set(
        nodes
          .map((node: any) => String(node?.table_name || '').trim())
          .filter(Boolean),
      );
      const changedKeys = Object.keys(changedValues);
      if (changedKeys.some((key) => detailFieldNames.has(key))) {
        gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Skip master realtime trigger for detail field change');
        return;
      }
    }
    
    // Prevent recursion: don't run trigger if we're already updating from trigger
    if (isUpdatingFromTrigger.current) {
      gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Skipping - already updating from trigger');
      return;
    }
    
    // Clear previous timer
    if (updateTriggerTimer.current) {
      clearTimeout(updateTriggerTimer.current);
    }
    
    // Short debounce to keep trigger responsive while avoiding noisy recursion.
    updateTriggerTimer.current = setTimeout(() => {
      if (!m_configs.trigger?.update && !m_configs.trigger?.barcode) {
        gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] No update or barcode triggers configured');
        return;
      }
      
      try {
        const currentValues = allValues && typeof allValues === "object"
          ? allValues
          : form.getFieldsValue();
        gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Current form values:', currentValues);
        
        let updatedData = currentValues;
        
        if (m_configs.trigger?.update) {
          gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Applying update trigger');
          const updateResult = applyRowTrigger("update", updatedData);
          if (updateResult && typeof updateResult === "object") {
            updatedData = { ...updatedData, ...updateResult };
            gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Update trigger returned:', updateResult);
          }
        }
        
        if (m_configs.trigger?.barcode) {
          gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Applying barcode trigger');
          const barcodeResult = applyRowTrigger("barcode", updatedData);
          if (barcodeResult && typeof barcodeResult === "object") {
            updatedData = { ...updatedData, ...barcodeResult };
            gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Barcode trigger returned:', barcodeResult);
          }
        }
        
        // Set flag to prevent recursion
        isUpdatingFromTrigger.current = true;
        
        // Merge updated fields back to form (chỉ update các field có thay đổi)
        const fieldsToUpdate: any = {};
        const isEqualValue = (left: any, right: any) => {
          if (Object.is(left, right)) return true;
          if (dayjs.isDayjs(left) && dayjs.isDayjs(right)) return left.valueOf() === right.valueOf();
          if (left && right && typeof left === "object" && typeof right === "object") {
            try {
              return JSON.stringify(left) === JSON.stringify(right);
            } catch {
              return false;
            }
          }
          return false;
        };
        Object.keys(updatedData || {}).forEach(key => {
          if (!isEqualValue(updatedData[key], currentValues[key])) {
            fieldsToUpdate[key] = updatedData[key];
          }
        });
        
        if (Object.keys(fieldsToUpdate).length > 0) {
          gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] Updating form fields:', fieldsToUpdate);
          form.setFieldsValue(fieldsToUpdate);
        } else {
          gridDevLog('[CsmEditModal.runUpdateTriggerRealtime] No fields to update');
        }
        
        // Reset flag after a short delay
        setTimeout(() => {
          isUpdatingFromTrigger.current = false;
        }, 100);
      } catch (err) {
        console.error('[CsmEditModal.runUpdateTriggerRealtime] Error:', err);
        isUpdatingFromTrigger.current = false;
      }
    }, 80);
  }, [m_configs, form, applyRowTrigger]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTriggerTimer.current) {
        clearTimeout(updateTriggerTimer.current);
      }
    };
  }, []);
  
  // Enable EnterToTab for form inputs
  useEnterToTab(modalContentRef);

  const decryptComboQuery = useCallback((val: string) => {
    let decoded = val;
    try {
      decoded = csmDecrypt(val);
      if (/%/.test(decoded)) {
        decoded = decodeURIComponent(decoded);
      }
    } catch {}
    return decoded;
  }, []);

  const cascadeParentFields = useMemo(
    () => extractCascadeParentFields(dynamicFields, decryptComboQuery),
    [dynamicFields, decryptComboQuery],
  );
  Form.useWatch(cascadeParentFields.length > 0 ? cascadeParentFields : ["__cascade_watch__"], form);

  const handleFieldChange = useCallback((fieldName: string) => {
    const childFields = extractCascadeChildFields(dynamicFields, fieldName, decryptComboQuery);
    if (childFields.length > 0) {
      form.setFieldsValue(Object.fromEntries(childFields.map((child) => [child, undefined])));
    }
  }, [dynamicFields, decryptComboQuery, form]);

  useEffect(() => {
    if (!open) {
      // Reset form when modal closes
      form.resetFields();
      setValuesReady(false);
      return;
    }
    setValuesReady(false);
    if (record) {
      // Đảm bảo tất cả các trường đa ngôn ngữ đều có giá trị (nếu thiếu thì gán rỗng)
      const initialValues = { ...record };
      const allFieldNames = dynamicFields.map(f => f.f_name);
      allFieldNames.forEach(name => {
        if (initialValues[name] === undefined) initialValues[name] = "";
      });
      // Nếu trường gốc (không hậu tố) rỗng, tự động lấy giá trị từ các trường cùng base có hậu tố (_en, _zh, ...)
      dynamicFields.forEach(f => {
        const match = f.f_name.match(/^(.*?)(_([a-z]{2}))?$/);
        if (match && !match[2]) { // trường gốc
          const base = match[1];
          if (initialValues[base] === undefined || initialValues[base] === "") {
            const candidates = dynamicFields.filter(ff => ff.f_name.startsWith(base + "_") && initialValues[ff.f_name]);
            const val = candidates.map(ff => initialValues[ff.f_name]).find(v => v !== undefined && v !== "");
            if (val !== undefined) initialValues[base] = val;
          }
        }
      });
      // Convert date fields to dayjs objects
      const convertedValues = { ...initialValues };
      const parseMediaArray = (input: any): string[] => {
        if (!input) return [];
        if (Array.isArray(input)) return input.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => String(v));
        if (typeof input === 'string') {
          const s = input.trim();
          if (!s) return [];
          if (s.startsWith('[') || s.startsWith('{')) {
            try {
              const parsed = JSON.parse(s);
              if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => String(v));
              if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
            } catch {
              // Keep fallback below
            }
          }
          return [s];
        }
        return [];
      };
      dynamicFields.forEach(f => {
        const types = resolveEffectiveFieldTypes(f);
        const key = f.f_name;
        if (/password/.test(types)) {
          const rawPassword = convertedValues[key];
          const normalizedRaw = String(rawPassword ?? "").trim();
          if (!normalizedRaw) {
            convertedValues[key] = "";
            return;
          }

          let decodedPassword = normalizedRaw;
          try {
            const decrypted = String(csmDecrypt(normalizedRaw) || "").trim();
            if (decrypted) decodedPassword = decrypted;
          } catch {}

          const sep = "_____";
          const rawSepIndex = normalizedRaw.indexOf(sep);
          if (rawSepIndex >= 0) {
            const rawPlain = normalizedRaw.slice(rawSepIndex + sep.length).trim();
            convertedValues[key] = rawPlain || normalizedRaw;
            return;
          }

          const sepIndex = decodedPassword.indexOf(sep);
          if (sepIndex >= 0) {
            const plainPart = decodedPassword.slice(sepIndex + sep.length).trim();
            convertedValues[key] = plainPart || normalizedRaw;
            return;
          }

          const encryptedLikeToken = /^[A-Za-z0-9_\-./+=]+$/.test(normalizedRaw) && normalizedRaw.length >= 12;
          const decryptedLooksReadable = /[\w\s!@#$%^&*()\-+=\[\]{};:'",.<>/?\\|`~]/.test(decodedPassword) && !decodedPassword.includes("\u0000");
          convertedValues[key] = encryptedLikeToken && decryptedLooksReadable ? decodedPassword : normalizedRaw;
          return;
        }
        if (/date|datetime|time/.test(types)) {
          const kind = /datetime/.test(types) ? "datetime" : /^time$/.test(types) ? "time" : "date";
          convertedValues[key] = parseDateValueToDayjs(convertedValues[key], kind);
        }
        // Keep html/edt values as plain text (no decrypt transform)
        if (/html|richtext/.test(types) && typeof convertedValues[key] === 'string') {
          convertedValues[key] = decodeHtmlValue(convertedValues[key]);
        }
        // Parse JSON for image/album fields - only if it's a JSON array string
        if (/img|image|avatar|cover|album|images|gallery/.test(types) && typeof convertedValues[key] === 'string') {
          const strValue = String(convertedValues[key]).trim();
          // Only parse if it looks like JSON (starts with [ or {)
          if (strValue.startsWith('[') || strValue.startsWith('{')) {
            try {
              convertedValues[key] = JSON.parse(strValue);
            } catch (e) {
              console.warn(`Failed to parse JSON for image field ${key}:`, e);
              // Keep as string if parse fails
            }
          }
          // If it's a plain URL string, keep it as is (MediaUploader will handle it)
        }

        // Migrate legacy video/videos fields into unified album media field.
        if (types === 'album' || types === 'images' || types === 'gallery') {
          const merged = [
            ...parseMediaArray(convertedValues[key]),
            ...parseMediaArray(convertedValues[`${key}_video`]),
            ...parseMediaArray(convertedValues[`${key}_videos`]),
            ...parseMediaArray(convertedValues.video),
            ...parseMediaArray(convertedValues.videos),
            ...parseMediaArray(convertedValues.video_url),
            ...parseMediaArray(convertedValues.video_urls),
          ];
          if (merged.length > 0) {
            convertedValues[key] = Array.from(new Set(merged));
          }
        }

        if (isMultiSelectLikeType(types)) {
          const tagOptions = buildMultiTagSelectOptions(
            f,
            key,
            selectOptions,
            modalSelectEnums,
            (label) => {
              const text = String(label == null ? "" : label);
              return text.includes(".") ? t(text) : text;
            },
          );
          convertedValues[key] = normalizeMultiTagValues(convertedValues[key], tagOptions);
        } else if (isComboLikeType(types)) {
          const normalizedOptions = buildSelectOptions(
            selectOptions?.[key],
            modalSelectEnums?.[key],
            (label) => {
              const text = String(label == null ? '' : label);
              return text.includes('.') ? t(text) : text;
            }
          );
          convertedValues[key] = normalizeSelectValue(convertedValues[key], normalizedOptions);
        }
      });
      
      // Parse JSON for detail grid fields (master-detail nodes)
      const isMasterDetail = Number(m_configs.type_form) === 2;
      const nodes = (m_configs as any).nodes || [];
      if (isMasterDetail && Array.isArray(nodes)) {
        nodes.forEach((node: any) => {
          const detailFieldName = node.table_name;
          const detailValue = convertedValues[detailFieldName];
          
          // Parse JSON string to array
          if (typeof detailValue === 'string' && detailValue.trim()) {
            try {
              convertedValues[detailFieldName] = JSON.parse(detailValue);
            } catch (e) {
              console.warn(`Failed to parse JSON for detail field ${detailFieldName}:`, e);
              convertedValues[detailFieldName] = [];
            }
          } else if (!Array.isArray(detailValue)) {
            // Ensure it's always an array
            convertedValues[detailFieldName] = [];
          }
        });
      }
      
      form.setFieldsValue(convertedValues);
      setValuesReady(true);
    } else {
      form.resetFields();
      setValuesReady(true);
    }
  }, [form, open, record, dynamicFields, modalSelectEnums, selectOptions, t, m_configs]);

  // Phân loại field: đa ngôn ngữ & chung
  const langs = ['vi', 'en', 'zh'];
  // Các field đa ngôn ngữ: có hậu tố _en/_zh hoặc là block seo_multi/content_multi
  // Trường đa ngôn ngữ: có hậu tố _en/_zh (hoặc _vi) hoặc là block seo_multi/content_multi
  const isMultilangField = (f: TableField) => {
    // Kiểm tra hậu tố _en, _zh, _vi
    if (/_((vi|en|zh))$/.test(f.f_name)) return true;
    if (["seo_multi", "content_multi"].includes(f.f_types || "")) return true;
    // Kiểm tra xem có phiên bản _en hoặc _zh không
    const base = f.f_name;
    const hasEn = !!dynamicFields.find(ff => ff.f_name === `${base}_en`);
    const hasZh = !!dynamicFields.find(ff => ff.f_name === `${base}_zh`);
    // Nếu có variant _en hoặc _zh thì trường gốc cũng là multilang
    return hasEn || hasZh;
  };
  // Đảm bảo không lặp lại các trường: mỗi field chỉ xuất hiện ở 1 nơi
  // Tạo set các tên trường đa ngôn ngữ
  const multilangFieldNames = new Set(
    dynamicFields.filter(isMultilangField).map(f => f.f_name)
  );
  const multilangFields = dynamicFields.filter(f => multilangFieldNames.has(f.f_name));
  const commonFields = dynamicFields.filter(f => !multilangFieldNames.has(f.f_name));
  const actionText = useMemo(() => ({
    cancel: getLangText(i18n.language, { vi: "Hủy", en: "Cancel", zh: "取消" }),
    save: getLangText(i18n.language, { vi: "Lưu", en: "Save", zh: "保存" }),
    savePrev: getLangText(i18n.language, { vi: "Lưu & Trước", en: "Save & Previous", zh: "保存并上一条" }),
    saveNext: getLangText(i18n.language, { vi: "Lưu & Tiếp", en: "Save & Next", zh: "保存并下一条" }),
    saveAddAnother: getLangText(i18n.language, { vi: "Lưu & Thêm tiếp", en: "Save & Add Another", zh: "保存并继续添加" }),
  }), [i18n.language]);

  const handleCancel = useCallback(() => {
    if (submitting) return;
    form.resetFields();
    onOpenChange(false);
  }, [submitting, form, onOpenChange]);

  const handleSubmit = useCallback((submitAction: EditSubmitAction = "close") => {
    if (submitting) return;
    setSubmitting(true);
    form.validateFields().then(async (values) => {
      const missingRequiredField = dynamicFields.find((f) => {
        if (!isRequiredByConfig(f)) return false;
        return isEmptyRequiredValue(values?.[f.f_name]);
      });

      if (missingRequiredField) {
        const missingLabel = resolveFieldLabel(missingRequiredField, i18n.language, t);
        const warningTitle = getLangText(i18n.language, {
          vi: "Thiếu dữ liệu bắt buộc",
          en: "Missing required data",
          zh: "缺少必填数据",
        });
        const warningContent = getLangText(i18n.language, {
          vi: `Vui lòng nhập trường: ${missingLabel}`,
          en: `Please fill in field: ${missingLabel}`,
          zh: `请填写字段：${missingLabel}`,
        });
        form.scrollToField(missingRequiredField.f_name, { behavior: "smooth", block: "center" } as any);
        Modal.warning({
          title: warningTitle,
          content: warningContent,
        });
        return;
      }

      const encodedValues = { ...values };
      dynamicFields.forEach(f => {
        const types = resolveEffectiveFieldTypes(f);
        if (/date|datetime|time/.test(types) && encodedValues[f.f_name]) {
          const kind = /datetime/.test(types) ? "datetime" : /^time$/.test(types) ? "time" : "date";
          encodedValues[f.f_name] = formatDateForStorage(encodedValues[f.f_name], kind);
        }
        if (/html|richtext/.test(types) && typeof encodedValues[f.f_name] === 'string') {
          encodedValues[f.f_name] = encodeHtmlValue(encodedValues[f.f_name]);
        }
        if (/img|image|avatar|cover|album|images|gallery/.test(types)) {
          if (Array.isArray(encodedValues[f.f_name])) {
            encodedValues[f.f_name] = JSON.stringify(encodedValues[f.f_name]);
          }
        }
      });

      let finalValues = { ...encodedValues };
      try {
        if (m_configs.trigger?.update) {
          console.log('[CsmEditModal] Applying update trigger on save');
          const updateResult = applyRowTrigger("update", finalValues);
          if (updateResult && typeof updateResult === "object") {
            finalValues = { ...finalValues, ...updateResult };
            console.log('[CsmEditModal] Update trigger applied:', updateResult);
          }
        }
        if (m_configs.trigger?.barcode) {
          console.log('[CsmEditModal] Applying barcode trigger on save');
          const barcodeResult = applyRowTrigger("barcode", finalValues);
          if (barcodeResult && typeof barcodeResult === "object") {
            finalValues = { ...finalValues, ...barcodeResult };
            console.log('[CsmEditModal] Barcode trigger applied:', barcodeResult);
          }
        }
      } catch (err) {
        console.error('[CsmEditModal] Trigger error on save:', err);
      }

      const isMasterDetail = Number(m_configs.type_form) === 2;
      const nodes = (m_configs as any).nodes || [];
      if (isMasterDetail && Array.isArray(nodes)) {
        console.log('[CsmEditModal] Master-Detail save: processing detail grids');
        const normalizeDetailArray = (input: any): any[] => {
          if (Array.isArray(input)) return input;
          if (typeof input === 'string') {
            const text = input.trim();
            if (!text) return [];
            try {
              const parsed = JSON.parse(text);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          }
          return [];
        };
        nodes.forEach((node: any) => {
          const detailFieldName = String(node?.table_name || '').trim();
          if (!detailFieldName) return;
          const currentFormValue = form.getFieldValue(detailFieldName);
          const detailStoreValue = (database as any)?.[detailFieldName]?.rows;
          const detailRecordValue = record?.[detailFieldName];
          const detailSource = (currentFormValue !== undefined && currentFormValue !== null)
            ? currentFormValue
            : (detailStoreValue !== undefined && detailStoreValue !== null)
              ? detailStoreValue
              : detailRecordValue;
          const detailRows = normalizeDetailArray(
            detailSource,
          );

          console.log(`[CsmEditModal] Saving ${detailFieldName}:`, {
            rowCount: detailRows.length,
            rawValue: currentFormValue,
            storeValueCount: Array.isArray(detailStoreValue) ? detailStoreValue.length : 0,
            recordValueCount: Array.isArray(detailRecordValue) ? detailRecordValue.length : 0,
            detailFieldName: detailFieldName,
            type: typeof currentFormValue,
            sampleRow: detailRows.length > 0 ? detailRows[0] : null
          });

          // Persist detail tabs as JSON array string on master row field (Vue parity contract).
          finalValues[detailFieldName] = JSON.stringify(detailRows);
          console.log(`[CsmEditModal] Normalized ${detailFieldName}: ${detailRows.length} rows`);
        });
      }

      console.log('[CsmEditModal] Final values to submit:', finalValues);

      await onSubmit(finalValues as Row, submitAction);
      form.resetFields();
      if (submitAction === "close" || submitAction === "addAnother") {
        if (submitAction === "close") onOpenChange(false);
        // addAnother: form is already reset, stay open
      }
      if ((submitAction === "prev" || submitAction === "next") && onNavigateRecord) {
        onNavigateRecord(submitAction);
      }
    }).catch(err => console.error('Validation error:', err)).finally(() => {
      setSubmitting(false);
    });
  }, [submitting, form, dynamicFields, i18n.language, t, m_configs, applyRowTrigger, onSubmit, onOpenChange, onNavigateRecord, database, record]);

  const editorContent = (
    <div ref={modalContentRef}>
      <Spin spinning={comboEditBusy} tip="Đang tải dữ liệu combo (co)...">
      <Form
        key={`form-${record?.id || 'new'}`}
        form={form}
        layout="vertical"
        onValuesChange={runUpdateTriggerRealtime}
      >
      {/* Thêm hidden fields cho các trường chi tiết (detail tabs) để lưu dữ liệu */}
      {(() => {
        const isMasterDetail = Number(m_configs.type_form) === 2;
        const nodes = (m_configs as any).nodes || [];
        if (!isMasterDetail || !Array.isArray(nodes) || nodes.length === 0) return null;

        return nodes.map((node: any) => {
          const detailFieldName = node.table_name;
          return (
            <Form.Item key={detailFieldName} name={detailFieldName} hidden noStyle>
              <Input type="hidden" />
            </Form.Item>
          );
        });
      })()}

      {!valuesReady ? (
        <div style={{ padding: 24, textAlign: "center", color: token.colorTextSecondary }}>
          {t("common.loading", "Đang tải...")}
        </div>
      ) : (
      <>
      {commonFields.length > 0 && (
        <>
          {(multilangFields.length > 0 || (m_configs as any).nodes?.length > 0) && (
            <Divider orientation="left" style={{ marginTop: 0, marginBottom: 6 }}>
              <Title level={5} style={{ margin: 0, fontSize: 13 }}>Thông tin chung</Title>
            </Divider>
          )}
          {(() => {
            const fullWidthFields = commonFields.filter(f => {
              const types = resolveEffectiveFieldTypes(f);
              return /html|richtext/.test(types) || /code/.test(types) || types === 'edt';
            });
            const gridFields = commonFields.filter(f => {
              const types = resolveEffectiveFieldTypes(f);
              return !(/html|richtext/.test(types) || /code/.test(types) || types === 'edt');
            });
            return (
              <>
                {gridFields.length > 0 && (
                  <Form.Item style={{ marginBottom: 4 }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 8,
                      width: '100%'
                    }}>
                      {gridFields.map((f) => (
                        <div key={f.f_name} style={{ minWidth: 0 }}>
                          {getFieldComponent(
                            f,
                            form,
                            modalSelectEnums,
                            record ?? undefined,
                            selectOptions,
                            mergedDatabase,
                            m_configs,
                            appId,
                            permissions,
                            menusPermissions,
                            decryptComboQuery,
                            (key: string, defaultValue?: string) => t(key, defaultValue || ""),
                            i18n.language,
                            record,
                            handleFieldChange,
                            menuById,
                            comboEvalSeft,
                          )}
                        </div>
                      ))}
                    </div>
                  </Form.Item>
                )}
                {fullWidthFields.length > 0 && fullWidthFields.map((f) => (
                  <div key={`${f.f_name}-fullwidth`} style={{ marginBottom: 4 }}>
                    {getFieldComponent(
                      f,
                      form,
                      modalSelectEnums,
                      record ?? undefined,
                      selectOptions,
                      mergedDatabase,
                      m_configs,
                      appId,
                      permissions,
                      menusPermissions,
                      decryptComboQuery,
                      (key: string, defaultValue?: string) => t(key, defaultValue || ""),
                      i18n.language,
                      record,
                      handleFieldChange,
                      menuById,
                      comboEvalSeft,
                    )}
                  </div>
                ))}
              </>
            );
          })()}
        </>
      )}

      {(() => {
        const isMasterDetail = Number(m_configs.type_form) === 2;
        const nodes = (m_configs as any).nodes || [];
        const hasNodes = Array.isArray(nodes) && nodes.length > 0;
        if (!isMasterDetail || !hasNodes) return null;

        return (
          <div style={{ marginBottom: 4, marginTop: 8 }}>
            <Divider orientation="left" style={{ marginTop: 0, marginBottom: 6 }}>
              <Title level={5} style={{ margin: 0, fontSize: 13 }}>Chi tiết</Title>
            </Divider>
            <Tabs
              defaultActiveKey="0"
              type="card"
              size="small"
              destroyInactiveTabPane
              tabBarStyle={{ marginBottom: 6 }}
            >
              {nodes.map((node: any, idx: number) => {
                const nodeLabel = (node.label && node.label.split(".").slice(-1)[0]) || node.label || t('common.detail', { index: idx + 1 });
                const detailFieldName = node.table_name;

                return (
                  <Tabs.TabPane tab={nodeLabel} key={String(idx)}>
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                      <DetailGridTab
                        node={node}
                        record={record}
                        appId={appId}
                        permissions={permissions}
                        menusPermissions={menusPermissions}
                        decrypt={decrypt}
                        form={form}
                        detailFieldName={detailFieldName}
                        menuId={(m_configs as any)?.menu_id ?? node?.menu_id}
                      />
                    </div>
                  </Tabs.TabPane>
                );
              })}
            </Tabs>
          </div>
        );
      })()}

      {multilangFields.length > 0 && (
        <>
          <Divider orientation="left" style={{ marginTop: 12, marginBottom: 6 }}>
            <Title level={5} style={{ margin: 0, fontSize: 13 }}>Nội dung đa ngôn ngữ</Title>
          </Divider>
          <div>
          {(() => {
            const baseMap: Record<string, Record<string, TableField>> = {};
            const specialBlocks: TableField[] = dynamicFields.filter(f => ["seo_multi", "content_multi"].includes(f.f_types || ""));
            dynamicFields.forEach(f => {
              if (f.f_name === 'i18n_content') return;
              const match = f.f_name.match(/^(.*?)(_([a-z]{2}))?$/);
              let base = f.f_name;
              let fLang = 'vi';
              if (match) {
                base = match[1];
                if (match[3] && langs.includes(match[3])) {
                  fLang = match[3];
                }
              }
              if (!baseMap[base]) baseMap[base] = {};
              baseMap[base][fLang] = f;
            });
            const multiBases = Object.entries(baseMap)
              .filter(([base, langObj]) => {
                if (base === 'i18n_content') return false;
                if (langObj['vi'] && (langObj['en'] || langObj['zh'])) return true;
                if (!langObj['vi'] && (langObj['en'] || langObj['zh'])) return true;
                return false;
              })
              .map(([base]) => base);
            if (multiBases.length === 0 && specialBlocks.length === 0) return null;
            return (
              <Tabs
                defaultActiveKey="vi"
                style={{ marginBottom: 8 }}
                size="small"
                destroyInactiveTabPane
                tabBarStyle={{ marginBottom: 6 }}
              >
                {langs.map(lang => (
                  <Tabs.TabPane tab={lang === 'vi' ? '🇻🇳 Tiếng Việt' : lang === 'en' ? '🇬🇧 English' : '🇨🇳 中文'} key={lang}>
                    <div style={{ marginBottom: 0 }}>
                    {multiBases.map(base => {
                        let field: TableField | undefined;
                        let actualFieldName: string;

                        if (lang === 'vi') {
                          field = baseMap[base]['vi'];
                          if (!field && baseMap[base]) {
                            field = Object.values(baseMap[base])[0];
                          }
                          actualFieldName = field?.f_name || base;
                        } else {
                          field = baseMap[base][lang];
                          actualFieldName = field?.f_name || `${base}_${lang}`;
                          if (!field && baseMap[base]['vi']) {
                            field = baseMap[base]['vi'];
                          }
                        }

                        if (!field) return null;

                        const types = (field.f_types || '').toLowerCase();
                        const fieldLabel = resolveMultilingualText(field.f_header, actualFieldName, lang);

                        if (/html|richtext/.test(types)) {
                          const value = decodeHtmlValue(String(form.getFieldValue(actualFieldName) ?? record?.[actualFieldName] ?? ''));
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <HtmlEditor value={value} onChange={(val: string) => form.setFieldsValue({ [actualFieldName]: val })} appId={currentAppId} />
                            </Form.Item>
                          );
                        }

                        if (types === 'edt') {
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <TextArea rows={6} />
                            </Form.Item>
                          );
                        }

                        if (/textarea|memo/.test(types)) {
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <TextArea rows={6} />
                            </Form.Item>
                          );
                        }

                        if (/img|image|avatar|cover/.test(types)) {
                          const MediaUploader = React.lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <Suspense fallback={<span>Đang tải...</span>}>
                                <MediaUploader appId={currentAppId} />
                              </Suspense>
                            </Form.Item>
                          );
                        }

                        if (types === 'album' || types === 'images' || types === 'gallery') {
                          const MediaUploader = React.lazy(() => import('./MediaUploader').then(mod => ({ default: mod.MediaUploader })));
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <Suspense fallback={<span>Đang tải...</span>}>
                                <MediaUploader multiple={true} appId={currentAppId} />
                              </Suspense>
                            </Form.Item>
                          );
                        }

                        if (/^multi_tag$|^multi_select$|(^|[\s,;|])tag([\s,;|]|$)|(^|[\s,;|])etag([\s,;|]|$)/.test(types)) {
                          const tagOptions = buildMultiTagSelectOptions(
                            field as TableField,
                            actualFieldName,
                            selectOptions,
                            modalSelectEnums,
                            (label) => {
                              const text = String(label == null ? "" : label);
                              return text.includes(".") ? t(text) : text;
                            },
                          );
                          const selectMode = tagOptions.length > 0 ? "multiple" : "tags";
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <Select
                                mode={selectMode as any}
                                style={{ width: "100%" }}
                                tokenSeparators={[","]}
                                options={tagOptions}
                                optionFilterProp="label"
                                allowClear
                                onChange={(nextValue) => {
                                  form.setFieldsValue({
                                    [actualFieldName]: normalizeMultiTagValues(nextValue, tagOptions),
                                  });
                                }}
                              />
                            </Form.Item>
                          );
                        }

                        if (/price|number|int|float|double|money|currency/.test(types)) {
                          const dec = parseInt(String((field as any).f_dec || 0));
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <InputNumber
                                style={{ width: '100%' }}
                                precision={dec}
                                formatter={value => /money|currency|price/.test(types) && value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `${value}`}
                                parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                              />
                            </Form.Item>
                          );
                        }

                        if (/check|bool|switch|checkbox/.test(types)) {
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel} valuePropName="checked">
                              <Switch />
                            </Form.Item>
                          );
                        }

                        if (/^date$/.test(types)) {
                          const fmt = resolveDateLocaleFormat(i18n.language);
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <DatePicker style={{ width: '100%' }} format={fmt.date} />
                            </Form.Item>
                          );
                        }

                        if (/datetime/.test(types)) {
                          const fmt = resolveDateLocaleFormat(i18n.language);
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <DatePicker showTime style={{ width: '100%' }} format={fmt.datetime} />
                            </Form.Item>
                          );
                        }

                        if (/^time$/.test(types)) {
                          const fmt = resolveDateLocaleFormat(i18n.language);
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <TimePicker style={{ width: '100%' }} format={fmt.time} />
                            </Form.Item>
                          );
                        }

                        if (isComboLikeType(types)) {
                          const rawOptions = selectOptions?.[actualFieldName];
                          const options = resolveEditFieldComboSelectOptions(field as TableField, mergedDatabase, {
                            selectEnum: modalSelectEnums?.[actualFieldName],
                            rawSelectOptions: rawOptions,
                            menuById,
                            fallbackAppId: currentAppId,
                            userContext: getUserAccessContext(),
                            decrypt: effectiveDecrypt,
                            evalContext: { seft: comboEvalSeft, database: mergedDatabase },
                            localizeLabel: (label) => {
                              const text = String(label == null ? '' : label);
                              return text.includes('.') ? t(text) : text;
                            },
                          });
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <Select
                                key={`${actualFieldName}-opts-${options.length}`}
                                showSearch
                                allowClear
                                virtual={options.length > 50}
                                placeholder={t("common.select", { defaultValue: `Select ${fieldLabel}` })}
                                options={options}
                                onChange={val => form.setFieldsValue({ [actualFieldName]: val })}
                                optionFilterProp="label"
                              />
                            </Form.Item>
                          );
                        }

                        return (
                          <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                            <Input id={actualFieldName} />
                          </Form.Item>
                        );
                      })}
                    {specialBlocks.map(block => {
                      const fieldName = block.f_name + (lang === 'vi' ? '' : `_${lang}`);
                      const baseLabel = resolveMultilingualText(block.f_header, block.f_name, lang);
                      const label = baseLabel + (lang === 'vi' ? '' : ` (${lang.toUpperCase()})`);
                      const types = (block.f_types || '').toLowerCase();
                      if (types === 'content_multi' || /html|richtext/.test(types)) {
                        const value = decodeHtmlValue(String(form.getFieldValue(fieldName) ?? ''));
                        return (
                          <Form.Item key={fieldName} name={fieldName} label={label}>
                            <HtmlEditor value={value} onChange={(val: string) => form.setFieldsValue({ [fieldName]: val })} appId={currentAppId} />
                          </Form.Item>
                        );
                      }
                      return (
                        <Form.Item key={fieldName} name={fieldName} label={label}>
                          <TextArea rows={6} />
                        </Form.Item>
                      );
                    })}
                    {(multiBases.length === 0 && specialBlocks.length === 0) && <div style={{ color: 'var(--ant-colorTextDisabled)', fontStyle: 'italic', padding: '16px 0' }}>Không có dữ liệu cho ngôn ngữ này</div>}
                    </div>
                  </Tabs.TabPane>
                ))}
              </Tabs>
            );
          })()}
          </div>
        </>
      )}
      </>
      )}
      </Form>
      </Spin>
    </div>
  );
  
  if (isEmbedded) {
    if (!open) return null;
    const embeddedNode = (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: token.colorBgElevated,
          backgroundImage: "none",
          opacity: 1,
          isolation: "isolate",
          border: `1px solid ${token.colorBorder}`,
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: token.boxShadow,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            backgroundColor: token.colorBgContainer,
            borderBottom: "1px solid var(--ant-colorBorderSecondary)",
            flex: "0 0 auto",
          }}
        >
          <div style={{ fontWeight: 600 }}>{title}</div>
          <Space size="small">
            {showRowNavigator && (
              <>
                <Button disabled={submitting || !canNavigatePrev} onClick={() => handleSubmit("prev")}>{actionText.savePrev}</Button>
                <Button disabled={submitting || !canNavigateNext} onClick={() => handleSubmit("next")}>{actionText.saveNext}</Button>
              </>
            )}
            {showAddAnother && (
              <Button disabled={submitting} onClick={() => handleSubmit("addAnother")}>{actionText.saveAddAnother}</Button>
            )}
            <Button disabled={submitting} onClick={handleCancel}>{actionText.cancel}</Button>
            <Button type="primary" loading={submitting} disabled={submitting} onClick={() => handleSubmit("close")}>{actionText.save}</Button>
          </Space>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "8px 12px",
            backgroundColor: token.colorBgContainer,
            opacity: 1,
          }}
        >
          {editorContent}
        </div>
      </div>
    );
    const portalTarget = embeddedPanelContainer?.current;
    if (portalTarget) {
      return createPortal(embeddedNode, portalTarget);
    }
    return embeddedNode;
  }

  return (
    <Modal
      open={open}
      mask
      maskClosable
      onCancel={handleCancel}
      title={title}
      width="95%"
      style={{ maxWidth: 1200 }}
      centered
      destroyOnClose={true}
      footer={[
        <Button key="cancel" disabled={submitting} onClick={handleCancel}>{actionText.cancel}</Button>,
        ...(showRowNavigator ? [
          <Button key="submit-prev" disabled={submitting || !canNavigatePrev} onClick={() => handleSubmit("prev")}>{actionText.savePrev}</Button>,
          <Button key="submit-next" disabled={submitting || !canNavigateNext} onClick={() => handleSubmit("next")}>{actionText.saveNext}</Button>,
        ] : []),
        ...(showAddAnother ? [
          <Button key="submit-add-another" disabled={submitting} onClick={() => handleSubmit("addAnother")}>{actionText.saveAddAnother}</Button>,
        ] : []),
        <Button key="submit" type="primary" loading={submitting} disabled={submitting} onClick={() => handleSubmit("close")}>{actionText.save}</Button>,
      ]}
      styles={{ body: { maxHeight: "75vh", overflowY: "auto", padding: "8px 12px" } }}
    >
      {editorContent}
    </Modal>
  );
}

export default CsmEditModal;
export { DetailGridTab };
