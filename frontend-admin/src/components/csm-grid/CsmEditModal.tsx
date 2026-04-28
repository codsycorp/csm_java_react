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
import { Form, Input, Button, Select, Divider, Typography, InputNumber, DatePicker, TimePicker, Switch, Modal, Tabs, Space, TreeSelect, theme } from "antd";
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
import { normalizeComboOptions, resolveComboQueryAppId } from "./combo-utils";
import { formatDateForStorage, parseDateValueToDayjs, resolveDateLocaleFormat } from "#src/utils/dateControl";

// Helper: safeEval for trigger execution (same as CsmDynamicGrid)
// CRITICAL: Handle both side-effect triggers (alert, console.log) and return-value triggers
function safeEval<TArgs extends any[], TReturn>(args: string[], body: string): ((...a: TArgs) => TReturn) | null {
	try {
		// Check if body looks encrypted (Base64-like pattern)
		// Encrypted trigger code usually looks like: YWxl2nQ8... (mix of letters, numbers, special chars)
		const looksEncrypted = /^[A-Za-z0-9_\-\/]+$/.test(body) && body.length > 50 && !body.includes('\n') && !body.includes('return');
		if (looksEncrypted) {
			console.error("[safeEval] Code looks encrypted but was not decrypted properly:", body.substring(0, 100));
			return null;
		}

		const trimmed = body.trim();
		// Check if it's a function declaration or IIFE
		const isIIFE = trimmed.startsWith('(function') || trimmed.startsWith('(() =>') || trimmed.startsWith('(async') || trimmed.startsWith('(async () =>');
		const isFuncDecl = trimmed.startsWith('function ');
		// Check for explicit return or side effects like alert, console
		const hasReturn = trimmed.includes('return ');
		const hasSideEffects = /\b(alert|console\.|debugger|throw|window\.)/.test(trimmed);
		
		// If it's IIFE, function declaration, has explicit return, or has side effects - use as-is
		// Otherwise wrap in return statement for expression evaluation
		const code = (isIIFE || isFuncDecl || hasReturn || hasSideEffects) ? body : `return (${body})`;
		
		console.log("[safeEval] Code preparation:", { 
			isIIFE, 
			isFuncDecl, 
			hasReturn, 
			hasSideEffects,
			originalLength: body.length,
			willWrap: !(isIIFE || isFuncDecl || hasReturn || hasSideEffects),
			looksEncrypted
		});
		
		return new Function(...args, code) as any;
	} catch (err) {
		console.error("[safeEval] Error creating function:", err);
		console.error("[safeEval] Args:", args);
		console.error("[safeEval] Body (first 500 chars):", body.substring(0, 500));
		return null;
	}
}

// ============================================================================
// GLOBAL CACHE: Tự động fetch missing tables cho combo queries
// ============================================================================
const globalTableFetchCache = new Map<string, Promise<any>>();

function resolveEffectiveFieldTypes(field: Partial<TableField> | Record<string, any> | null | undefined): string {
  const explicit = String(field?.f_types ?? (field as any)?.f_type ?? "").trim().toLowerCase();
  if (explicit === "editor") return "codejs";
  if (explicit && explicit !== "string" && explicit !== "ed") return explicit;

  const fieldName = String(field?.f_name ?? "").trim().toLowerCase();
  if (["menuspermissions", "menuspermissionsadd", "menuspermissionsdeny"].includes(fieldName)) return "menu_tree";
  if (["permissions", "permissionsadd", "permissionsdeny"].includes(fieldName)) return "multi_tag";
  if (["permissionpreset", "datascope", "role_level", "branch_id", "dept_id", "department_id", "group_id", "roles", "permissiongroups", "status", "app_id"].includes(fieldName)) return "co";
  if (["is_global", "actived", "active", "dev", "enabled", "disabled"].includes(fieldName) || /^is_/.test(fieldName) || /^has_/.test(fieldName)) return "checkbox";

  if ((field as any)?.f_cbo_query) return "co";
  if (Array.isArray((field as any)?.f_options) && (field as any).f_options.length > 0) {
    if (fieldName.includes("menu")) return "menu_tree";
    if (fieldName.includes("permission")) return "multi_tag";
  }

  return explicit || "ed";
}

function isComboLikeType(rawTypes: unknown): boolean {
  const types = String(rawTypes || "").toLowerCase();
  const tokens = types.split(/[\s,;|_:-]+/).filter(Boolean);
  return tokens.includes("co")
    || tokens.includes("coro")
    || tokens.includes("cbo")
    || tokens.includes("cp")
    || /cbo|select|multi_tag|multi_select|menu_tree|tag|etag/.test(types);
}

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
async function ensureTableInDatabase(
  tableName: string,
  appId: string,
  database: any,
  whereClause?: any
): Promise<boolean> {
  // Include where clause in cache key to handle different filters on same table
  const whereSuffix = whereClause ? `::${JSON.stringify(whereClause)}` : '';
  const cacheKey = `${appId}::${tableName}${whereSuffix}`;
  
  // ✅ IMPORTANT: If whereClause exists, ALWAYS fetch (API requires obj_where to return data)
  // Don't check existing data because previous fetch might have different/no where clause
  if (!whereClause) {
    // Only check existing data if no where clause
    const existing = database[tableName];
    if (existing && (Array.isArray(existing) || (existing.rows && Array.isArray(existing.rows)))) {
      const rowCount = Array.isArray(existing) ? existing.length : existing.rows?.length || 0;
      const storedAppId = Array.isArray(existing) ? "" : String(existing?.app_id || existing?.appId || "").trim();
      const isMatchingApp = !storedAppId || storedAppId === appId;
      if (rowCount > 0 && isMatchingApp) {
        console.log(`✓ [AutoFetch] Table ${tableName} already in database (${rowCount} rows, app: ${storedAppId || "unknown"})`);
        return false; // Already have data
      }
      if (rowCount > 0 && !isMatchingApp) {
        console.log(`🔄 [AutoFetch] Table ${tableName} exists for app ${storedAppId}, refetching for app ${appId}`);
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
  console.log(`🔄 [AutoFetch] Fetching missing table: ${tableName} (app: ${appId})`, whereClause ? 'with where:' : '', whereClause);
  
  // Build request params - include where if provided
  const requestParams: any = {
    app_id: appId,
    obj_name: tableName,
  };
  if (whereClause) {
    requestParams.where = whereClause;
  }
  
  const fetchPromise = getTableData<any>(requestParams)
    .then((response) => {
      const rows = response?.rows || [];
      console.log(`✅ [AutoFetch] Fetched ${tableName}: ${rows.length} rows`);
      // Mutate database object directly (will trigger re-render in parent)
      database[tableName] = {
        rows,
        total: response?.total || rows.length,
        app_id: appId,
      };
      globalTableFetchCache.delete(cacheKey);
      return rows;
    })
    .catch((err) => {
      console.error(`❌ [AutoFetch] Failed to fetch ${tableName}:`, err);
      globalTableFetchCache.delete(cacheKey);
      // Set empty data để avoid repeated failures
      database[tableName] = { rows: [], total: 0, app_id: appId };
      throw err;
    });

  globalTableFetchCache.set(cacheKey, fetchPromise);
  
  // Kick off fetch but don't wait
  fetchPromise.catch(() => {}); // Ignore error (already logged)
  
  return true; // Started fetching
}

// Helper: Build selectEnums từ trigger f_cbo_query (Vue compatible)
// Giống CsmDynamicGrid.selectEnums nhưng dành cho detail grid
function resolveDynamicQueryLabel(row: any, valueField: string, labelField: string, fields: unknown): string {
  const value = String(row?.[valueField] ?? "").trim();
  const configuredFields = Array.isArray(fields)
    ? fields.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const effectiveLabelField = String(labelField || configuredFields[1] || valueField).trim() || valueField;
  const directLabel = String(row?.[effectiveLabelField] ?? "").trim();
  return directLabel || value;
}

// Detail grid không có database table riêng nên phải build từ trigger
export function buildDetailGridSelectEnums(
  fields: any[],
  database: any,
  decrypt?: (s: string) => string,
  seft?: any
): Record<string, any> {
  const result: Record<string, any> = {};
  const seftContext = seft || { m_configs: { table: fields }, context: {} };

  const toEnumObj = (options: any[]): Record<string, { text: string }> => {
    const enumObj: Record<string, { text: string }> = {};
    options.forEach((opt: any) => {
      let value: any;
      let label: any;
      if (Array.isArray(opt)) {
        value = opt[0];
        label = opt[1] ?? opt[0];
      } else if (opt && typeof opt === "object") {
        value = opt.ma ?? opt.value ?? opt.id ?? opt.key;
        label = opt.ten ?? opt.label ?? opt.text ?? String(value ?? '');
      } else {
        value = opt;
        label = String(opt);
      }
      if (value !== undefined && value !== null && value !== "") {
        enumObj[String(value)] = { text: String(label) };
      }
    });
    return enumObj;
  };

  fields.forEach((f: any) => {
    const types = resolveEffectiveFieldTypes(f);
    const isCombo = isComboLikeType(types);
    if (!isCombo) return;

    const rawQuery = f.f_cbo_query;
    if (!rawQuery) return;

    let q = rawQuery;
    if (decrypt) {
      try {
        q = decrypt(rawQuery);
      } catch {}
    }

    try {
      // f_grid:table:display:value
      if (q.startsWith('f_grid:')) {
        const parts = q.split(':');
        const [_, tableName, displayField = 'ten', valueField = 'id'] = parts;
        if (database?.[tableName]?.rows) {
          const options = database[tableName].rows.map((row: any) => ({
            ma: row[valueField] ?? row.id,
            ten: row[displayField] ?? ''
          }));
          const enumObj = toEnumObj(options);
          if (Object.keys(enumObj).length > 0) result[f.f_name] = enumObj;
        }
        return;
      }

      // query:code
      if (q.startsWith('query:')) {
        let code = q.substring(6);
        if (decrypt) {
          try { code = decrypt(code); } catch {}
        }
        const fn = new Function('seft', 'db', `return (${code})`);
        const queryResult = fn(seftContext, database);
        if (Array.isArray(queryResult)) {
          const options = queryResult.map((item: any) => ({
            ma: item.ma ?? item.id ?? item.value ?? item,
            ten: item.ten ?? item.name ?? item.label ?? item.text ?? String(item)
          }));
          const enumObj = toEnumObj(options);
          if (Object.keys(enumObj).length > 0) result[f.f_name] = enumObj;
        }
        return;
      }

      const trimmedQ = q.trim();
      if (trimmedQ.startsWith('{') || trimmedQ.startsWith('[')) {
        let parsed: any;
        try {
          // Try strict JSON parse first
          parsed = JSON.parse(trimmedQ);
        } catch (jsonErr) {
          console.warn(`[buildDetailGridSelectEnums] JSON.parse failed for ${f.f_name}, trying JS object literal fallback...`);
          // Fallback: Try parsing as JavaScript object literal using Function()
          // This handles cases like: {field: "value"} instead of {"field": "value"}
          try {
            const evalFn = new Function(`return (${trimmedQ})`);
            parsed = evalFn();
            console.log(`[buildDetailGridSelectEnums] Successfully parsed JS object literal for ${f.f_name}`);
          } catch (evalErr) {
            console.error(`[buildDetailGridSelectEnums] Both JSON.parse and JS eval failed for ${f.f_name}:`, evalErr);
            console.error(`[buildDetailGridSelectEnums] Query was:`, trimmedQ);
            // Skip this field if parsing fails
            return;
          }
        }

        // Handle query array in JSON
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.query) && parsed.query.length > 0) {
          const allOptions: any[] = [];
          parsed.query.forEach((querySpec: any) => {
            if (!querySpec?.obj_name || !database) return;
            const tableName = querySpec.obj_name;
            const fields = querySpec.fields || [];
            const appId = resolveComboQueryAppId(tableName, querySpec.app_id, seftContext?.appId || 'csm');
            // Default obj_where if not provided or invalid
            // Check for: undefined, null, empty string, empty object, or object without required fields
            let whereClause = querySpec.obj_where;
            const isInvalidWhere = !whereClause 
              || (typeof whereClause === 'string' && !whereClause.trim())
              || (typeof whereClause === 'object' && (!whereClause.field || !whereClause.type));
            
            if (isInvalidWhere) {
              whereClause = {field: 'id', type: 'like', value: ""};
              console.log(`[buildDetailGridSelectEnums] Using default where clause for ${tableName}:`, whereClause);
            }
            
            const tableData = database[tableName];
            const tableAppId = Array.isArray(tableData) ? "" : String((tableData as any)?.app_id || (tableData as any)?.appId || "").trim();
            const tableExists = tableData && (Array.isArray(tableData) || (tableData.rows && Array.isArray(tableData.rows)));
            const rowCount = tableExists ? (Array.isArray(tableData) ? tableData.length : tableData.rows?.length || 0) : 0;
            const hasMatchingAppData = !tableAppId || tableAppId === appId;
            const hasData = tableExists && rowCount > 0 && hasMatchingAppData;
            
            // Build cache key to check if already fetching
            const whereSuffix = whereClause ? `::${JSON.stringify(whereClause)}` : '';
            const cacheKey = `${appId}::${tableName}${whereSuffix}`;
            
            // 🔄 AUTO-FETCH: If query has where clause and no data, ALWAYS fetch with it
            // But check if already fetching to prevent infinite loop
            if (whereClause && !hasData) {
              // Check if already fetching this specific query
              if (globalTableFetchCache.has(cacheKey)) {
                console.log(`⏳ [ComboQuery] Already fetching ${tableName} with this where clause, waiting...`);
                return; // Skip, will have data on next render after fetch completes
              }
              
              console.log(`⚠️ [ComboQuery] Query has where clause but no data, fetching table "${tableName}" with filter...`);
              // Kick off fetch with where clause (fire-and-forget) - will populate database when done
              ensureTableInDatabase(tableName, appId, database, whereClause).catch(err => {
                console.error(`Failed to auto-fetch table ${tableName}:`, err);
              });
              // Return early for this query - will have data on next render after fetch completes
              return;
            }
            
            // No where clause or already have data: check if need to fetch
            if (!whereClause && !hasData) {
              // Check if already fetching
              if (globalTableFetchCache.has(cacheKey)) {
                console.log(`⏳ [ComboQuery] Already fetching ${tableName}, waiting...`);
                return; // Skip, will have data on next render
              }
              
              console.warn(`⚠️ [ComboQuery] Table "${tableName}" ${tableExists ? `exists for app ${tableAppId || "unknown"} but is empty/mismatched` : 'not found'}. Auto-fetching...`);
              // Kick off fetch without where clause
              ensureTableInDatabase(tableName, appId, database).catch(err => {
                console.error(`Failed to auto-fetch table ${tableName}:`, err);
              });
              // Return early for this query - will have data on next render after fetch completes
              return;
            }
            
            // Have data (from fetch with where clause or without), build options
            const rows = Array.isArray(tableData) ? tableData : (tableData as any)?.rows || [];
            if (!Array.isArray(rows)) return;

            const valueField = String(querySpec?.value_field || fields?.[0] || "id").trim() || "id";
            const labelField = String(querySpec?.label_field || fields?.[1] || valueField).trim() || valueField;

            let filteredData = rows;
            if (whereClause) {
              try {
                // Support both object and string format for obj_where
                if (typeof whereClause === 'object' && whereClause.field && whereClause.type) {
                  // Object format: { field: "p_type", type: "eq", value: 1 }
                  const field = whereClause.field;
                  const type = whereClause.type;
                  const value = whereClause.value;
                  filteredData = rows.filter((row: any) => {
                    const rowValue = row[field];
                    switch (type) {
                      case 'eq': return rowValue == value;
                      case 'ne': return rowValue != value;
                      case 'gt': return rowValue > value;
                      case 'gte': return rowValue >= value;
                      case 'lt': return rowValue < value;
                      case 'lte': return rowValue <= value;
                      case 'like': return String(rowValue || '').toLowerCase().includes(String(value || '').toLowerCase());
                      case 'in': return Array.isArray(value) && value.includes(rowValue);
                      default: return true;
                    }
                  });
                } else if (typeof whereClause === 'string') {
                  // String format: "row.p_type === 1"
                  const whereFn = safeEval(['row'], `return ${whereClause}`);
                  if (whereFn) filteredData = rows.filter((row: any) => whereFn(row));
                }
              } catch (error) {
                console.warn('Failed to apply obj_where filter:', error);
              }
            }

            filteredData.forEach((row: any) => {
              const optionLabel = resolveDynamicQueryLabel(row, valueField, labelField, fields);
              allOptions.push({ ma: row[valueField], ten: optionLabel || String(row?.[valueField] || "").trim() });
            });
          });

          allOptions.sort((a, b) => String(a.ten || '').localeCompare(String(b.ten || '')));
          const enumObj = toEnumObj(allOptions);
          if (Object.keys(enumObj).length > 0) {
            result[f.f_name] = enumObj;
            return;
          }
        }

        // Handle options array in JSON
        let options: any[] = [];
        if (Array.isArray(parsed)) options = parsed;
        else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.options)) options = parsed.options;

        if (options.length > 0) {
          options.sort((a, b) => {
            const aLabel = Array.isArray(a)
              ? String(a[1] ?? a[0] ?? '')
              : String(a?.ten ?? a?.label ?? a?.text ?? a?.ma ?? a?.value ?? a?.id ?? a ?? '');
            const bLabel = Array.isArray(b)
              ? String(b[1] ?? b[0] ?? '')
              : String(b?.ten ?? b?.label ?? b?.text ?? b?.ma ?? b?.value ?? b?.id ?? b ?? '');
            return aLabel.localeCompare(bLabel);
          });
          const enumObj = toEnumObj(options);
          if (Object.keys(enumObj).length > 0) result[f.f_name] = enumObj;
        }
        return;
      }

      // Dynamic code
      // IMPORTANT: Check if raw q is encrypted BEFORE wrapping with "return "
      // Because if we wrap encrypted string as "return (encrypted...)", it looks like JS!
      let rawCode = q;
      
      // Try to detect if it's encrypted (Base64-like pattern, long, no JS keywords)
      const hasJSSyntax = /[{}()\[\];:,.\s]|return|function|const|let|var|if|for|while|=>|alert|console/.test(rawCode);
      const hasBase64Pattern = /[A-Za-z0-9_\-\/]{50,}/.test(rawCode);
      const looksEncrypted = !hasJSSyntax && hasBase64Pattern;
      
      if (looksEncrypted && decrypt) {
        try {
          const decrypted = decrypt(rawCode);
          rawCode = decrypted;
        } catch (err) {
          console.error(`[buildDetailGridSelectEnums] Decrypt failed for encrypted code in ${f.f_name}:`, err);
          return;
        }
      }
      
      // Now add return prefix if needed
      const body = (rawCode.includes("return ") ? "" : "return ") + rawCode;
      const fn = safeEval(["seft", "data"], body) as ((seft: any, data: any) => any) | null;
      if (!fn) return;
      const objQa = fn(seftContext, database);
      if (!objQa || !objQa.options || !Array.isArray(objQa.options)) return;
      const options = objQa.options;
      options.sort((a: any, b: any) => {
        const aLabel = a?.ten ?? a?.label ?? a?.text ?? String(a);
        const bLabel = b?.ten ?? b?.label ?? b?.text ?? String(b);
        return String(aLabel).localeCompare(String(bLabel));
      });
      const enumObj = toEnumObj(options);
      if (Object.keys(enumObj).length > 0) result[f.f_name] = enumObj;
    } catch (err) {
      console.error(`[buildDetailGridSelectEnums] Error parsing ${f.f_name}:`, err);
    }
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
  
  // 🔄 Track database version để force re-compute selectEnums khi missing tables được fetch
  const [databaseVersion, setDatabaseVersion] = useState(0);
  
  // Poll for completed table fetches and trigger re-compute
  useEffect(() => {
    if (globalTableFetchCache.size === 0) return;
    
    const checkInterval = setInterval(() => {
      // If all fetches completed, increment version to trigger re-compute
      if (globalTableFetchCache.size === 0) {
        console.log('✅ [DetailGridTab] All table fetches completed, triggering re-compute...');
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
    if (!detailData && record) {
      detailData = record[detailFieldName];
    }
    
    // Parse dữ liệu
    const parsedData = parseDetailData(detailData);
    
    console.log(`[DetailGridTab] Syncing ${detailFieldName}:`, {
      hasFormValue: !!form.getFieldValue(detailFieldName),
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
  }, [record?.id, detailFieldName, appId, setTableData]); // Depend on record.id, not record
  
  // Lắng nghe thay đổi từ database (khi grid update) và sync ngược vào form
  // GIỐNG VUE: objRowData[mn.table_name]=seft.select_row[mn.table_name]||[];
  useEffect(() => {
    const tableData = database[detailFieldName];
    if (tableData && Array.isArray(tableData.rows)) {
      const currentFormValue = form.getFieldValue(detailFieldName);
      const needsUpdate = !currentFormValue || 
                         !Array.isArray(currentFormValue) || 
                         currentFormValue.length !== tableData.rows.length ||
                         JSON.stringify(currentFormValue) !== JSON.stringify(tableData.rows);
      
      if (needsUpdate) {
        console.log(`[DetailGridTab] Syncing database → form for ${detailFieldName}:`, {
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
    console.log(`[DetailGridTab] Node config for ${detailFieldName}:`, {
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
      appId, // 🔄 Pass appId for auto-fetch logic
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
  }, [node?.table, database, decrypt, node, databaseVersion, appId]); // 🔄 Re-compute when databaseVersion changes (after table fetches)
  
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
        onDataChange={() => {
          // Khi grid thay đổi, force sync database → form ngay lập tức
          const tableData = database[detailFieldName];
          if (tableData && Array.isArray(tableData.rows)) {
            console.log(`[DetailGridTab] onDataChange: Syncing ${detailFieldName} → form (${tableData.rows.length} rows)`);
            form.setFieldsValue({ [detailFieldName]: tableData.rows });
          } else {
            console.warn(`[DetailGridTab] onDataChange: No data for ${detailFieldName}`, tableData);
          }
        }}
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

function buildSelectOptions(
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

function resolveCascadeSelectOptions(
  field: TableField,
  form: any,
  database: Record<string, any> | undefined,
  decrypt?: (s: string) => string,
  localizeLabel?: (value: unknown) => string,
): { options: SelectOption[] | null; cascadeFrom?: string; hasParentValue: boolean } {
  const rawQuery = String(field?.f_cbo_query || "").trim();
  if (!rawQuery) return { options: null, hasParentValue: true };

  let resolvedQuery = rawQuery;
  if (decrypt) {
    try {
      resolvedQuery = decrypt(rawQuery) || rawQuery;
    } catch {
      resolvedQuery = rawQuery;
    }
  }

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
  currentLang?: string
) {
  const types = resolveEffectiveFieldTypes(f); // infer special types even when DB sends generic f_types
  const key = f.f_name;
  const lang = String(currentLang || navigator.language || 'vi').toLowerCase();
  const numberLocale = resolveNumberLocale(lang);
  const dateLocaleFormat = resolveDateLocaleFormat(lang);
  const fieldLabel = resolveFieldLabel(f, lang, translate);
  const initialVal = fieldValues?.[key];
  
  // Kiểu Readonly: chứa 'ro' trong f_types - chỉ hiển thị, không cho edit
  const isReadonly = types.indexOf('ro') !== -1;

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
      <Input.TextArea rows={8} disabled={isReadonly} />
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
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <DatePicker showTime format={dateLocaleFormat.datetime} style={{ width: '100%' }} disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Kiểu Date (chỉ ngày)
  if (/^date$/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <DatePicker format={dateLocaleFormat.date} style={{ width: '100%' }} disabled={isReadonly} />
    </Form.Item>;
  }
  
  // Kiểu Time (chỉ giờ)
  if (/^time$/.test(types)) {
    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
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
      <Input.TextArea rows={6} disabled={isReadonly} />
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
    const rawTagOptions = Array.isArray((f as any).f_options)
      ? (f as any).f_options
      : (Array.isArray(selectOptions?.[key]) ? selectOptions?.[key] : []);
    const tagOptions = rawTagOptions.map((opt: any) => {
      if (opt && typeof opt === "object") {
        const value = opt.value ?? opt.ma ?? opt.id ?? opt.key;
        const label = localizeLabel(opt.label ?? opt.ten ?? opt.text ?? value);
        return { ...opt, value, label };
      }
      const value = String(opt ?? "");
      return { value, label: localizeLabel(value) };
    });

    const normalizeTagValues = (input: any): string[] => {
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
            const parsed = JSON.parse(text);
            return normalizeTagValues(parsed);
          } catch {
            return text.split(",").map((item) => item.trim()).filter(Boolean);
          }
        }
        return text.split(",").map((item) => item.trim()).filter(Boolean);
      }
      if (input == null) return [];
      return [String(input).trim()].filter(Boolean);
    };

    const normalizedInitial = normalizeTagValues(form.getFieldValue(key) ?? initialVal);
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
          const normalized = normalizeTagValues(nextValue);
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
    const enumObj = selectEnums?.[key];
    const cascadeConfig = resolveCascadeSelectOptions(f, form, database, decrypt, localizeLabel);
    const localizedOptions = cascadeConfig.options ?? buildSelectOptions(rawOptions, enumObj, localizeLabel);
    const rawSelectValue = form.getFieldValue(key) ?? initialVal;
    const selectValue = normalizeSelectValue(rawSelectValue, localizedOptions);

    return <Form.Item key={key} name={key} label={fieldLabel} initialValue={initialVal}>
      <Select 
        style={{ width: '100%' }} 
        options={localizedOptions}
        showSearch
        optionFilterProp="label"
        allowClear
        disabled={isReadonly || (Boolean(cascadeConfig.cascadeFrom) && !cascadeConfig.hasParentValue)}
        placeholder={translate ? translate("common.select", `Select ${fieldLabel}`) : `Select ${fieldLabel}`}
        value={selectValue}
        onChange={val => form.setFieldsValue({ [key]: val })}
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
    <Input id={key} disabled={isReadonly} />
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
  const [formUpdated, setFormUpdated] = useState(0);
  const [valuesReady, setValuesReady] = useState(false);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const user = useUserStore();
  const currentAppId = appId || user.app_id || "csm";
  const isEmbedded = mode === "embedded";
  
  // Track if we're currently updating from trigger to prevent recursion
  const isUpdatingFromTrigger = useRef(false);
  const updateTriggerTimer = useRef<NodeJS.Timeout | null>(null);

  // Helper: Create seft context with all utility functions
  const createSeftContext = useCallback(() => ({
    m_configs,
    database,
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
  }), [m_configs, database]);
  const applyRowTrigger = useCallback((triggerName: string, data: any) => {
    let triggerCode = (m_configs.trigger as any)?.[triggerName];
    if (!triggerCode) {
      console.log(`[CsmEditModal.applyRowTrigger] No trigger code for: ${triggerName}`);
      return null;
    }

    if (decrypt) {
      try {
        triggerCode = decrypt(triggerCode);
      } catch (err) {
      console.warn(`[CsmEditModal.applyRowTrigger] Decrypt failed for ${triggerName}, using raw trigger code`, err);
      }
    }

    console.log(`[CsmEditModal.applyRowTrigger] Executing ${triggerName} trigger`);
    console.log(`[CsmEditModal.applyRowTrigger] Trigger code (first 200 chars):`, triggerCode.substring(0, 200));

    const fn = safeEval(["seft", "data", "bang"], triggerCode) as ((seft: any, data: any, bang: any) => any) | null;
    if (!fn) {
      console.error(`[CsmEditModal.applyRowTrigger] Failed to create function for: ${triggerName}`);
      return null;
    }

    const seftContext = createSeftContext();
    try {
      const result = fn(seftContext, JSON.parse(JSON.stringify(data)), database);
      console.log(`[CsmEditModal.applyRowTrigger] ${triggerName} result:`, result);
      return result;
    } catch (err) {
      console.error(`[CsmEditModal.applyRowTrigger] Error executing ${triggerName}:`, err);
      return null;
    }
  }, [m_configs, database, decrypt]);
  
  // Helper: Run UPDATE trigger realtime (near-instant)
  const runUpdateTriggerRealtime = useCallback((changedValues: any, allValues: any) => {
    console.log('[CsmEditModal.runUpdateTriggerRealtime] Triggered with changed values:', changedValues);
    
    // Prevent recursion: don't run trigger if we're already updating from trigger
    if (isUpdatingFromTrigger.current) {
      console.log('[CsmEditModal.runUpdateTriggerRealtime] Skipping - already updating from trigger');
      return;
    }
    
    // Clear previous timer
    if (updateTriggerTimer.current) {
      clearTimeout(updateTriggerTimer.current);
    }
    
    // Short debounce to keep trigger responsive while avoiding noisy recursion.
    updateTriggerTimer.current = setTimeout(() => {
      if (!m_configs.trigger?.update && !m_configs.trigger?.barcode) {
        console.log('[CsmEditModal.runUpdateTriggerRealtime] No update or barcode triggers configured');
        return;
      }
      
      try {
        const currentValues = allValues && typeof allValues === "object"
          ? allValues
          : form.getFieldsValue();
        console.log('[CsmEditModal.runUpdateTriggerRealtime] Current form values:', currentValues);
        
        let updatedData = currentValues;
        
        if (m_configs.trigger?.update) {
          console.log('[CsmEditModal.runUpdateTriggerRealtime] Applying update trigger');
          const updateResult = applyRowTrigger("update", updatedData);
          if (updateResult && typeof updateResult === "object") {
            updatedData = { ...updatedData, ...updateResult };
            console.log('[CsmEditModal.runUpdateTriggerRealtime] Update trigger returned:', updateResult);
          }
        }
        
        if (m_configs.trigger?.barcode) {
          console.log('[CsmEditModal.runUpdateTriggerRealtime] Applying barcode trigger');
          const barcodeResult = applyRowTrigger("barcode", updatedData);
          if (barcodeResult && typeof barcodeResult === "object") {
            updatedData = { ...updatedData, ...barcodeResult };
            console.log('[CsmEditModal.runUpdateTriggerRealtime] Barcode trigger returned:', barcodeResult);
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
          console.log('[CsmEditModal.runUpdateTriggerRealtime] Updating form fields:', fieldsToUpdate);
          form.setFieldsValue(fieldsToUpdate);
        } else {
          console.log('[CsmEditModal.runUpdateTriggerRealtime] No fields to update');
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
  
  // Debug: log selectEnums when modal opens
  useEffect(() => {
    if (open) {
      console.log('[CsmEditModal] Modal opened with selectEnums:', selectEnums);
      console.log('[CsmEditModal] Database available:', !!database);
      console.log('[CsmEditModal] Decrypt available:', !!decrypt);
      console.log('[CsmEditModal] Fields with "co" type:', 
        m_configs?.table?.filter(f => isComboLikeType(resolveEffectiveFieldTypes(f))).map(f => ({
          name: f.f_name,
          types: f.f_types,
          effectiveTypes: resolveEffectiveFieldTypes(f),
          has_cbo_query: !!f.f_cbo_query,
          has_enum: !!selectEnums?.[f.f_name],
          cbo_query_preview: f.f_cbo_query ? (
            f.f_cbo_query.length > 100 ? f.f_cbo_query.substring(0, 100) + '...' : f.f_cbo_query
          ) : 'N/A'
        }))
      );
    }
  }, [open, selectEnums, m_configs, database, decrypt]);
  
  // Enable EnterToTab for form inputs
  useEnterToTab(modalContentRef);

  // Lấy fields động từ m_configs.table
  const dynamicFields: TableField[] = useMemo(() => {
    return Array.isArray(m_configs?.table)
      ? m_configs.table
          .filter(f => Number(f.f_show) === 1 && f.f_name !== 'id') // Hide 'id' field
          .sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0))
      : [];
  }, [m_configs]);

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
        if (/date|datetime|time/.test(types) && convertedValues[key]) {
          const kind = /datetime/.test(types) ? "datetime" : /^time$/.test(types) ? "time" : "date";
          const parsedValue = parseDateValueToDayjs(convertedValues[key], kind);
          if (parsedValue) {
            convertedValues[key] = parsedValue;
          }
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

        if (isComboLikeType(types)) {
          const normalizedOptions = buildSelectOptions(
            selectOptions?.[key],
            selectEnums?.[key],
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
      // Force re-render to ensure Form items display the values
      const timer = setTimeout(() => {
        setTimeout(() => {
          setFormUpdated(prev => prev + 1);
          form.setFieldsValue(convertedValues);
          setTimeout(() => {
            setValuesReady(true);
          }, 0);
        }, 0);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      // ...existing code...
    }
  }, [form, open, record, dynamicFields, selectEnums, selectOptions, t]);

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
        nodes.forEach((node: any) => {
          const detailFieldName = node.table_name;
          const currentFormValue = form.getFieldValue(detailFieldName);
          const detailValue = currentFormValue || [];

          console.log(`[CsmEditModal] Saving ${detailFieldName}:`, {
            rowCount: Array.isArray(detailValue) ? detailValue.length : 0,
            rawValue: detailValue,
            detailFieldName: detailFieldName,
            type: typeof detailValue,
            sampleRow: Array.isArray(detailValue) && detailValue.length > 0 ? detailValue[2] : null
          });

          if (Array.isArray(detailValue)) {
            finalValues[detailFieldName] = JSON.stringify(detailValue);
            console.log(`[CsmEditModal] Stringified ${detailFieldName}: ${finalValues[detailFieldName].substring(0, 100)}...`);
          } else if (typeof detailValue === 'string') {
            finalValues[detailFieldName] = detailValue;
            console.log(`[CsmEditModal] ${detailFieldName} already stringified`);
          } else {
            finalValues[detailFieldName] = '[]';
            console.log(`[CsmEditModal] ${detailFieldName} set to empty array`);
          }
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
  }, [submitting, form, dynamicFields, i18n.language, t, m_configs, applyRowTrigger, onSubmit, onOpenChange, onNavigateRecord]);

  const editorContent = (
    <div ref={modalContentRef}>
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

      {commonFields.length > 0 && (
        <>
          {(multilangFields.length > 0 || (m_configs as any).nodes?.length > 0) && (
            <Divider orientation="left" style={{ marginTop: 0, marginBottom: 6 }}>
              <Title level={5} style={{ margin: 0, fontSize: 13 }}>Thông tin chung</Title>
            </Divider>
          )}
          {(() => {
            const formValues = form.getFieldsValue();
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
                        <div key={`${f.f_name}-${formUpdated}`} style={{ minWidth: 0 }}>
                          {getFieldComponent(
                            f,
                            form,
                            selectEnums,
                            formValues,
                            selectOptions,
                            database,
                            m_configs,
                            appId,
                            permissions,
                            menusPermissions,
                            (val: string) => {
                              let decoded = val;
                              try {
                                decoded = csmDecrypt(val);
                                if (/%/.test(decoded)) {
                                  decoded = decodeURIComponent(decoded);
                                }
                              } catch {}
                              return decoded;
                            },
                            (key: string, defaultValue?: string) => t(key, defaultValue || ""),
                            i18n.language
                          )}
                        </div>
                      ))}
                    </div>
                  </Form.Item>
                )}
                {fullWidthFields.length > 0 && fullWidthFields.map((f) => (
                  <div key={`${f.f_name}-fullwidth-${formUpdated}`} style={{ marginBottom: 4 }}>
                    {getFieldComponent(
                      f,
                      form,
                      selectEnums,
                      formValues,
                      selectOptions,
                      database,
                      m_configs,
                      appId,
                      permissions,
                      menusPermissions,
                      (val: string) => {
                        let decoded = val;
                        try {
                          decoded = csmDecrypt(val);
                          if (/%/.test(decoded)) {
                            decoded = decodeURIComponent(decoded);
                          }
                        } catch {}
                        return decoded;
                      },
                      (key: string, defaultValue?: string) => t(key, defaultValue || ""),
                      i18n.language
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
              destroyInactiveTabPane={false}
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
          <div key={`multilang-tabs-${formUpdated}`}>
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
                key={`tabs-inner-${formUpdated}`}
                size="small"
                destroyInactiveTabPane={false}
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
                        const formValues = form.getFieldsValue();
                        const fieldValue = formValues[actualFieldName];

                        if (/html|richtext/.test(types)) {
                          const value = decodeHtmlValue(String(form.getFieldValue(actualFieldName) ?? fieldValue ?? ''));
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
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <Select mode="tags" style={{ width: '100%' }} tokenSeparators={[',']} />
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
                          const enumObj = selectEnums?.[actualFieldName];
                          const options = buildSelectOptions(rawOptions, enumObj, (label) => {
                            const text = String(label == null ? '' : label);
                            return text.includes('.') ? t(text) : text;
                          });
                          const selectValue = normalizeSelectValue(
                            form.getFieldValue(actualFieldName) ?? fieldValue,
                            options
                          );
                          return (
                            <Form.Item key={actualFieldName} name={actualFieldName} label={fieldLabel}>
                              <Select
                                showSearch
                                allowClear
                                placeholder={t("common.select", { defaultValue: `Select ${fieldLabel}` })}
                                options={options}
                                value={selectValue}
                                onChange={val => form.setFieldsValue({ [actualFieldName]: val })}
                                filterOption={(input, option) =>
                                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
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
      </Form>
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
