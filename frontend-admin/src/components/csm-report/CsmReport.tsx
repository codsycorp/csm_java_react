import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Input, InputNumber, Select, Space, DatePicker, TimePicker, message, Card } from "antd";
import dayjs from "dayjs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import html2pdf from "html2pdf.js";

import { csmDecrypt } from "../csm-grid/CsmCrypto";
import {
  buildDetailGridSelectEnums,
  buildSelectOptions,
  ensureTableInDatabase,
  globalTableFetchCache,
  resolveCascadeSelectOptions,
} from "../csm-grid/CsmEditModal";
import {
  buildRoleComboOptions,
  collectComboTableFetchRequests,
  getComboTableRows,
  getLegacyFallbackComboQuery,
  isComboLikeType,
  isMultiSelectLikeType,
  parseFieldOptions,
  resolveEffectiveFieldTypes,
  resolveEffectiveComboQueryText,
} from "../csm-grid/combo-utils";
import { useAppStore } from "#src/store";
import LunarCalendar, { INT, jdFromDate, jdToDate, NewMoon, KinhDoMatTroi, SunLongitude, getSunLongitude, getNewMoonDay, getLunarMonth11, getLeapMonthOffset, duong_qua_am, am_qua_duong } from "#src/utils/lunarCalendar";
import { dateFormat, chuyenNgay, TruNgayRaSoNgay, CongNgay, CongGio, validateEmail, validatePhone, DateUtils } from "#src/utils/dateUtils";
import { useEnterToTab } from "#src/hooks/useEnterToTab";
import { formatDateForStorage, resolveDateLocaleFormat } from "#src/utils/dateControl";
import { useTranslation } from "react-i18next";

type Row = Record<string, any>;

const CO = "[CsmReport.co]";

function previewText(value: unknown, max = 120): string {
  const text = String(value ?? "").trim();
  if (!text) return "(empty)";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function resolveComboQueryPreview(field: any, decryptFn?: (input: string) => string): string {
  const raw = String(field?.f_cbo_query || getLegacyFallbackComboQuery(field?.f_name) || "").trim();
  if (!raw) return "(empty)";
  if (!decryptFn) return previewText(raw);
  try {
    return previewText(decryptFn(raw) || raw);
  } catch {
    return previewText(raw);
  }
}

function getTableRowCount(database: Record<string, any>, tableName: string): number {
  const tableData = database?.[tableName];
  if (Array.isArray(tableData)) return tableData.length;
  if (Array.isArray(tableData?.rows)) return tableData.rows.length;
  return 0;
}

export interface CsmReportProps {
  appId?: string;
  m_configs: any; // Menu config (includes table fields, trigger, report_name, orientation, p_width, p_height)
  decrypt?: (s: string) => string;
}

function isDataUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

async function fetchArrayBuffer(src: string): Promise<ArrayBuffer> {
  if (isDataUrl(src)) {
    const res = await fetch(src);
    return await res.arrayBuffer();
  }
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`);
  return await res.arrayBuffer();
}

function safeEval<TArgs extends any[], TReturn>(args: string[], body: string): ((...a: TArgs) => TReturn) | null {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...args, body) as any;
    return fn;
  } catch (e) {
    console.warn("safeEval error:", e);
    return null;
  }
}

export default function CsmReport({ appId, m_configs, decrypt }: CsmReportProps) {
  const { i18n, t } = useTranslation();
  const dateLocaleFormat = useMemo(() => resolveDateLocaleFormat(i18n.language), [i18n.language]);
  const [form] = Form.useForm();
  const [reportSrc, setReportSrc] = useState<string>("");
  const [databaseVersion, setDatabaseVersion] = useState(0);
  const [formUpdated, setFormUpdated] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastComboFetchSignatureRef = useRef("");

  useEnterToTab(containerRef);

  const database = useAppStore(state => state.database);
  const setTableData = useAppStore(state => state.setTableData);

  const effectiveAppId = useMemo(() => {
    if (appId) return appId;
    try {
      return useAppStore.getState().getCurrentAppId?.() || "csm";
    } catch {
      return "csm";
    }
  }, [appId]);

  const reportDecrypt = useCallback((input: string) => {
    return resolveEffectiveComboQueryText(input, decrypt);
  }, [decrypt]);

  const fields = useMemo(() => {
    const tableFields: any[] = (m_configs.table || [])
      .filter((f: any) => Number(f.f_show) === 1 && f.f_name?.toLowerCase() !== "id")
      .sort((a: any, b: any) => Number(a.f_stt) - Number(b.f_stt));
    return tableFields.filter((f: any) => f.f_name?.toLowerCase() !== "parent_id");
  }, [m_configs]);

  const comboFetchSignature = useMemo(() => {
    const comboFields = (m_configs.table || []).filter((f: any) => {
      const types = resolveEffectiveFieldTypes(f);
      return isComboLikeType(types);
    });
    return comboFields
      .map((f: any) => `${String(f.f_name || "")}:${String(f.f_cbo_query || getLegacyFallbackComboQuery(f.f_name) || "")}`)
      .sort()
      .join("|");
  }, [m_configs.table]);

  useEffect(() => {
    if (!comboFetchSignature || comboFetchSignature === lastComboFetchSignatureRef.current) return;
    lastComboFetchSignatureRef.current = comboFetchSignature;

    console.log(`${CO} Scanning combo queries for missing tables...`);
    console.log(`${CO} comboFetchSignature:`, previewText(comboFetchSignature, 200));

    const requests = collectComboTableFetchRequests(m_configs.table || [], {
      decrypt: reportDecrypt,
      fallbackAppId: effectiveAppId,
    });

    if (requests.length === 0) {
      console.warn(`${CO} No combo tables to prefetch`);
      return;
    }

    console.log(`${CO} Found ${requests.length} combo tables to prefetch:`, requests);

    Promise.all(
      requests.map(({ tableName, appId: queryAppId, whereClause }) => {
        console.log(`${CO} Prefetch start: table=${tableName}, app=${queryAppId}, where=`, whereClause);
        return ensureTableInDatabase(tableName, queryAppId, useAppStore.getState().database, whereClause, setTableData)
          .then((started) => {
            console.log(`${CO} Prefetch ${tableName}:`, started ? "started/waiting" : "already cached");
            return started;
          })
          .catch((err) => {
            console.error(`${CO} Prefetch FAILED ${tableName}:`, err);
            return null;
          });
      }),
    ).then(() => {
      console.log(`${CO} All combo prefetches settled, bump databaseVersion`);
      setDatabaseVersion((v) => v + 1);
    });
  }, [comboFetchSignature, effectiveAppId, reportDecrypt, setTableData, m_configs.table]);

  useEffect(() => {
    if (globalTableFetchCache.size === 0) return;

    console.log(`${CO} Waiting for ${globalTableFetchCache.size} in-flight table fetch(es)...`);

    const checkInterval = setInterval(() => {
      if (globalTableFetchCache.size === 0) {
        console.log(`${CO} All in-flight table fetches completed, bump databaseVersion`);
        setDatabaseVersion((v) => v + 1);
        clearInterval(checkInterval);
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [globalTableFetchCache.size, databaseVersion]);

  const cascadeParentFields = useMemo(() => {
    const parents = new Set<string>();
    (m_configs.table || []).forEach((field: any) => {
      const rawQuery = String(field?.f_cbo_query || getLegacyFallbackComboQuery(field?.f_name) || "").trim();
      if (!rawQuery) return;
      let resolvedQuery = rawQuery;
      try {
        resolvedQuery = reportDecrypt(rawQuery) || rawQuery;
      } catch {
        resolvedQuery = rawQuery;
      }
      const parsed = (() => {
        try {
          return JSON.parse(resolvedQuery);
        } catch {
          try {
            return new Function(`return (${resolvedQuery})`)();
          } catch {
            return null;
          }
        }
      })();
      const cascadeFrom = String(parsed?.cascadeFrom || "").trim().toLowerCase();
      if (cascadeFrom) parents.add(cascadeFrom);
    });
    return Array.from(parents);
  }, [m_configs.table, reportDecrypt]);

  Form.useWatch(cascadeParentFields.length > 0 ? cascadeParentFields : ["__cascade_watch__"], form);

  const selectEnums = useMemo(() => {
    console.log(`${CO} selectEnums useMemo triggered`);
    console.log(`${CO} m_configs.table count:`, (m_configs.table || []).length);
    console.log(`${CO} database keys:`, Object.keys(database || {}));
    console.log(`${CO} decrypt available:`, Boolean(decrypt));
    console.log(`${CO} effectiveAppId:`, effectiveAppId);
    console.log(`${CO} databaseVersion:`, databaseVersion);

    const seftContext = {
      appId: effectiveAppId,
      setTableData,
      m_configs,
      context: {},
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
    const built = buildDetailGridSelectEnums(m_configs.table || [], database, reportDecrypt, seftContext);
    console.log(`${CO} buildDetailGridSelectEnums keys:`, Object.keys(built));
    return built;
  }, [m_configs.table, database, reportDecrypt, m_configs, databaseVersion, effectiveAppId, setTableData, formUpdated, decrypt]);

  const comboFieldDiagnostics = useMemo(() => {
    const allCoFields = (m_configs.table || []).filter((f: any) => {
      const types = resolveEffectiveFieldTypes(f);
      return isComboLikeType(types);
    });

    console.log(`${CO} Found ${allCoFields.length} combo-like fields:`,
      allCoFields.map((f: any) => ({
        name: f.f_name,
        rawTypes: f.f_types,
        effectiveTypes: resolveEffectiveFieldTypes(f),
        f_show: f.f_show,
        has_query: Boolean(f.f_cbo_query || getLegacyFallbackComboQuery(f.f_name)),
      })),
    );

    return allCoFields.map((field: any) => {
      const fieldKey = String(field.f_name || "").trim();
      const types = resolveEffectiveFieldTypes(field);
      const enumObj = selectEnums[fieldKey];
      const enumCount = enumObj ? Object.keys(enumObj).length : 0;
      const staticOptions = parseFieldOptions(field.f_options);
      const cascadeConfig = resolveCascadeSelectOptions(field, form, database, reportDecrypt, (label) => String(label ?? ""));
      const roleFieldNames = new Set(["group_id", "permissiongroups", "group_rights", "grouprights"]);
      const roleRows = roleFieldNames.has(fieldKey.toLowerCase()) ? getComboTableRows(database, "csm_roles") : [];
      let renderOptionCount = 0;
      let renderSource = "none";

      if (roleRows.length > 0) {
        renderOptionCount = buildRoleComboOptions(roleRows).length;
        renderSource = "csm_roles";
      } else if (cascadeConfig.options) {
        renderOptionCount = cascadeConfig.options.length;
        renderSource = cascadeConfig.cascadeFrom ? `cascade:${cascadeConfig.cascadeFrom}` : "cascade";
      } else {
        const built = buildSelectOptions(undefined, enumObj, (label) => String(label ?? ""));
        renderOptionCount = built.length;
        renderSource = "selectEnums";
      }

      const queryPreview = resolveComboQueryPreview(field, reportDecrypt);
      let referencedTables: string[] = [];
      if (queryPreview.startsWith("{") || queryPreview.startsWith("[")) {
        try {
          const parsed = JSON.parse(queryPreview.replace(/\.\.\.$/, ""));
          if (Array.isArray(parsed?.query)) {
            referencedTables = parsed.query.map((q: any) => String(q?.obj_name || "")).filter(Boolean);
          }
        } catch {
          // ignore parse errors in diagnostic
        }
      } else if (queryPreview.startsWith("f_grid:")) {
        referencedTables = [queryPreview.split(":")[1]].filter(Boolean);
      }

      const tableStats = referencedTables.map((tableName) => {
        const tableData = database?.[tableName] as any;
        return {
          tableName,
          rowCount: getTableRowCount(database, tableName),
          appId: String(tableData?.app_id || tableData?.appId || ""),
        };
      });

      const inFilterForm = fields.some((f: any) => f.f_name === fieldKey);

      return {
        name: fieldKey,
        types,
        f_show: field.f_show,
        inFilterForm,
        isMulti: isMultiSelectLikeType(types),
        staticOptionCount: staticOptions.length,
        enumOptionCount: enumCount,
        renderOptionCount,
        renderSource,
        cascadeFrom: cascadeConfig.cascadeFrom || null,
        hasParentValue: cascadeConfig.hasParentValue,
        queryPreview,
        tableStats,
        sampleEnum: enumCount > 0 ? Object.entries(enumObj).slice(0, 3) : null,
        sampleRenderOptions: renderOptionCount > 0
          ? (cascadeConfig.options ?? buildSelectOptions(undefined, enumObj)).slice(0, 3)
          : null,
      };
    });
  }, [m_configs.table, selectEnums, database, reportDecrypt, fields, form, formUpdated]);

  useEffect(() => {
    console.log(`${CO} ===== COMBO DIAGNOSTIC =====`);
    console.log(`${CO} menu:`, m_configs?.label || m_configs?.name || m_configs?.table_name || m_configs?.id);
    console.log(`${CO} filter form fields:`, fields.map((f: any) => f.f_name));
    console.log(`${CO} cascadeParentFields:`, cascadeParentFields);
    console.log(`${CO} globalTableFetchCache.size:`, globalTableFetchCache.size);
    comboFieldDiagnostics.forEach((item: {
      name: string;
      renderOptionCount: number;
      renderSource: string;
      [key: string]: unknown;
    }) => {
      if (item.renderOptionCount === 0) {
        console.warn(`${CO} EMPTY options for "${item.name}":`, item);
      } else {
        console.log(`${CO} OK "${item.name}": ${item.renderOptionCount} options via ${item.renderSource}`, item);
      }
    });
    console.log(`${CO} ===== END COMBO DIAGNOSTIC =====`);
  }, [comboFieldDiagnostics, fields, cascadeParentFields, m_configs]);

  const localizeLabel = useCallback((label: unknown) => {
    const text = String(label ?? "");
    return text.includes(".") ? t(text) : text;
  }, [t]);

  function renderComboField(field: any) {
    const width = Number(field.f_width) || 200;
    const name = field.f_name;
    const fieldKey = String(name || "").trim();
    const formName = fieldKey.toLowerCase();
    const label = field.f_header;
    const roleFieldNames = new Set(["group_id", "permissiongroups", "group_rights", "grouprights"]);
    const cascadeConfig = resolveCascadeSelectOptions(field, form, database, reportDecrypt, localizeLabel);
    const roleRows = roleFieldNames.has(formName)
      ? getComboTableRows(database, "csm_roles")
      : [];

    let options = cascadeConfig.options;
    if (roleRows.length > 0) {
      options = buildRoleComboOptions(roleRows).map((opt) => ({
        value: opt.value,
        label: localizeLabel(opt.label),
      }));
    } else {
      options = cascadeConfig.options ?? buildSelectOptions(undefined, selectEnums[fieldKey], localizeLabel);
    }

    if (!options?.length) {
      console.warn(`${CO} RENDER empty Select for "${fieldKey}"`, {
        f_types: field.f_types,
        effectiveTypes: resolveEffectiveFieldTypes(field),
        queryPreview: resolveComboQueryPreview(field, reportDecrypt),
        enumOptionCount: selectEnums[fieldKey] ? Object.keys(selectEnums[fieldKey]).length : 0,
        cascadeFrom: cascadeConfig.cascadeFrom,
        hasParentValue: cascadeConfig.hasParentValue,
        roleRowCount: roleRows.length,
      });
    } else {
      console.log(`${CO} RENDER "${fieldKey}": ${options.length} options`, options.slice(0, 3));
    }

    return (
      <Form.Item key={fieldKey} name={formName} label={label}>
        <Select
          style={{ width }}
          allowClear
          showSearch
          optionFilterProp="label"
          disabled={Boolean(cascadeConfig.cascadeFrom) && !cascadeConfig.hasParentValue}
          placeholder={`Chọn ${label}`}
          options={options || []}
          onChange={(val) => {
            form.setFieldsValue({ [formName]: val });
            setFormUpdated((v) => v + 1);
          }}
        />
      </Form.Item>
    );
  }

  function renderField(field: any) {
    const width = Number(field.f_width) || 200;
    const name = field.f_name;
    const label = field.f_header;
    const types = resolveEffectiveFieldTypes(field);

    if (types.includes("ro")) {
      return null; // read-only in filter form
    }

    if (types.includes("datetime")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <DatePicker showTime format={dateLocaleFormat.datetime} style={{ width }} />
        </Form.Item>
      );
    }
    if (types.includes("date")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <DatePicker format={dateLocaleFormat.date} style={{ width }} />
        </Form.Item>
      );
    }
    if (types.includes("time")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <TimePicker format={dateLocaleFormat.time} style={{ width }} />
        </Form.Item>
      );
    }
    if (types.includes("num") || types.includes("price") || types.includes("ron")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <InputNumber style={{ width }} />
        </Form.Item>
      );
    }
    if (isComboLikeType(types) && !isMultiSelectLikeType(types)) {
      return renderComboField(field);
    }
    return (
      <Form.Item key={name} name={name.toLowerCase()} label={label}>
        <Input style={{ width }} />
      </Form.Item>
    );
  }

  async function createReport(datas_report: any, dai: number, cao: number, kieu_in: "p" | "l" | string) {
    try {
      const templateUrl: string = m_configs.report_name;
      if (!templateUrl) {
        message.error("Không có mẫu báo cáo (report_name)");
        return;
      }
      const content = await fetchArrayBuffer(templateUrl);

      // Load DocxtemplaterHtmlModule from public/assets
      const DocxtemplaterHtmlModule = (window as any).DocxtemplaterHtmlModule;
      if (!DocxtemplaterHtmlModule) {
        message.error("DocxtemplaterHtmlModule chưa được load. Hãy thêm <script src='/assets/html-module.min.js'> vào index.html");
        return;
      }

      const opts: any = {};
      opts.centered = false;
      opts.getImage = async function (_tagValue: string) {
        const ab = await fetchArrayBuffer(_tagValue);
        return ab;
      };
      opts.getSize = function (_img: any, tagValue: string) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.src = tagValue;
          let maxH = 100;
          if (datas_report && datas_report["logo_height"]) maxH = Number(datas_report["logo_height"]);
          image.onload = function () {
            if (image.height > maxH) {
              const ratio = maxH / image.height;
              const newWidth = image.width * ratio;
              resolve([newWidth, maxH]);
            } else {
              resolve([image.width, image.height]);
            }
          };
          image.onerror = function (e) { reject(e); };
        });
      };

      const imageModule: any = new ImageModule(opts);
      const zip = new PizZip(content);
      const doc: any = new Docxtemplater(zip, {
        modules: [
          new DocxtemplaterHtmlModule({ ignoreUnknownTags: true }),
          imageModule
        ],
        paragraphLoop: true,
        linebreaks: true
      });

      await doc.renderAsync(datas_report);
      const output = doc.getZip().generate({ type: "arraybuffer", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

      // Convert to HTML then to PDF
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      document.body.appendChild(container);
      // Ensure browser environment for docx2html detection
      (globalThis as any).process = undefined;
      const { default: docx2html } = await import("docx2html");
      const html = await (docx2html as any)(output, { container });

      const w = html.content.body.section.clientWidth + (kieu_in === "p" ? 110 : 200);
      const h = html.content.body.section.clientHeight + (kieu_in === "p" ? 40 : 55);
      const margin = kieu_in === "p" ? [-0.2, 0, 0.2, 0] : [-0.2, 0.05, 0, 0];
      const sizeP: [number, number] = [Number(dai), Number(cao)];
      const px2pt = 0.115;

      const opt = {
        margin,
        html2canvas: { dpi: 192, scale: 2, useCORS: true, letterRendering: true, width: w - w * px2pt, height: h - h * px2pt },
        pageBreak: { mode: "css", before: "#nextpage1" },
        jsPDF: { unit: "in", format: sizeP, orientation: kieu_in === "l" ? "landscape" : "portrait", compress: true }
      } as any;

      const dataUri: string = await (html2pdf as any)().set(opt).from(html.toString()).outputPdf("datauristring");
      setReportSrc(dataUri);
      if (container.parentNode && container.parentNode.contains(container)) {
        container.parentNode.removeChild(container);
      }
    } catch (e: any) {
      console.error(e);
      message.error(e?.message || "Lỗi tạo báo cáo");
    }
  }

  async function onViewReport() {
    try {
      const vals = await form.validateFields();
      
      const dataForm: Record<string, any> = {};
      (m_configs.table || []).forEach((elF: any) => {
        const k = elF.f_name?.toLowerCase();
        if (!k) return;
        if (vals[k] !== undefined) {
          const v = vals[k];
          if (dayjs.isDayjs(v)) {
            const types = String(elF.f_types || "").toLowerCase();
            const kind = types.includes("datetime") ? "datetime" : /^time$/.test(types) ? "time" : "date";
            dataForm[k] = formatDateForStorage(v, kind);
          }
          else dataForm[k] = v;
        }
      });

      const trigger = m_configs.trigger || {};
      let reportCode = "";
      if (trigger && trigger["report_db"]) {
        const codeEnc = trigger["report_db"];
        const dec = decrypt ? decrypt(codeEnc) : csmDecrypt(codeEnc);
        reportCode = dec;
      }
      
      if (!reportCode) {
        message.warning("Chưa cấu hình trigger report_db");
        return;
      }
      
      // Parse trigger to find required tables
      const requiredTables = new Set<string>();
      const bangMatches = reportCode.match(/bang\["([^"]+)"\]/g) || [];
      bangMatches.forEach(match => {
        const tableName = match.match(/bang\["([^"]+)"\]/)?.[1];
        if (tableName) requiredTables.add(tableName);
      });
      
      // Check if database has required tables
      const missingTables = Array.from(requiredTables).filter(t => !database[t]);
      if (missingTables.length > 0) {
        message.error(`Thiếu dữ liệu bảng: ${missingTables.join(", ")}. Đang tải từ menu...`);
        console.error("❌ Missing required tables:", missingTables);
        return;
      }
      
      // Match Vue: Function("seft","data","bang",seft.report_script) - không dùng ensureReturn
      // Add utility functions as parameters for direct access in trigger code
      const utilityParams = [
        "seft", "data", "bang",
        // Date utilities
        "dateFormat", "chuyenNgay", "TruNgayRaSoNgay", "CongNgay", "CongGio",
        // Lunar calendar utilities
        "PI", "INT", "jdFromDate", "jdToDate", "NewMoon", "KinhDoMatTroi",
        "SunLongitude", "getSunLongitude", "getNewMoonDay", "getLunarMonth11",
        "getLeapMonthOffset", "duong_qua_am", "am_qua_duong"
      ];
      const load_report_db = safeEval(utilityParams, reportCode);
      if (!load_report_db) {
        message.error("Lỗi compile trigger report_db");
        console.error("❌ Failed to compile report_db trigger");
        return;
      }
      
      // Match Vue: load_report_db(seft, dataForm, seft.database)
      // seft needs to have both m_configs and database as properties
      // Also include lunar calendar functions and date utilities for compatibility with Vue code
      const seft = { 
        m_configs, 
        database,
        // Lunar calendar functions
        PI: LunarCalendar.PI,
        INT: LunarCalendar.INT,
        jdFromDate: LunarCalendar.jdFromDate,
        jdToDate: LunarCalendar.jdToDate,
        NewMoon: LunarCalendar.NewMoon,
        KinhDoMatTroi: LunarCalendar.KinhDoMatTroi,
        SunLongitude: LunarCalendar.SunLongitude,
        getSunLongitude: LunarCalendar.getSunLongitude,
        getNewMoonDay: LunarCalendar.getNewMoonDay,
        getLunarMonth11: LunarCalendar.getLunarMonth11,
        getLeapMonthOffset: LunarCalendar.getLeapMonthOffset,
        duong_qua_am: LunarCalendar.duong_qua_am,
        am_qua_duong: LunarCalendar.am_qua_duong,
        // Date utility functions
        dateFormat: DateUtils.dateFormat,
        chuyenNgay: DateUtils.chuyenNgay,
        TruNgayRaSoNgay: DateUtils.TruNgayRaSoNgay,
        CongNgay: DateUtils.CongNgay,
        CongGio: DateUtils.CongGio,
        validateEmail: DateUtils.validateEmail,
        validatePhone: DateUtils.validatePhone,
      };
      
      // Execute with all utility functions as parameters
      const datas_report = await load_report_db(
        seft, 
        dataForm, 
        database,
        // Date utilities
        DateUtils.dateFormat,
        DateUtils.chuyenNgay,
        DateUtils.TruNgayRaSoNgay,
        DateUtils.CongNgay,
        DateUtils.CongGio,
        // Lunar calendar utilities
        LunarCalendar.PI,
        LunarCalendar.INT,
        LunarCalendar.jdFromDate,
        LunarCalendar.jdToDate,
        LunarCalendar.NewMoon,
        LunarCalendar.KinhDoMatTroi,
        LunarCalendar.SunLongitude,
        LunarCalendar.getSunLongitude,
        LunarCalendar.getNewMoonDay,
        LunarCalendar.getLunarMonth11,
        LunarCalendar.getLeapMonthOffset,
        LunarCalendar.duong_qua_am,
        LunarCalendar.am_qua_duong
      );
      await createReport(datas_report, Number(m_configs.p_width || 8.3), Number(m_configs.p_height || 11.7), String(m_configs.orientation || "p"));
    } catch (e: any) {
      console.error("❌ Error in onViewReport:", e);
      message.error(e?.message || "Lỗi tạo báo cáo");
    }
  }

  return (
    <Card title={m_configs.label || m_configs.name || "Báo cáo"} bordered style={{ height: "100%" }} bodyStyle={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div ref={containerRef} style={{ flexShrink: 0 }}>
        <Form form={form} layout="vertical">
          <Space wrap>
            {fields.map(renderField)}
          </Space>
          <div style={{ marginTop: 12 }}>
            <Button type="primary" onClick={onViewReport}>
              Xem
            </Button>
          </div>
        </Form>
      </div>
      <div style={{ marginTop: 16, flex: 1, minHeight: 0, overflow: "hidden" }}>
        <iframe src={reportSrc} title="report" aria-hidden="true" style={{ right: 0, top: 0, bottom: 0, height: "100%", width: "100%", minHeight: 0, border: 0 }} />
      </div>
    </Card>
  );
}
