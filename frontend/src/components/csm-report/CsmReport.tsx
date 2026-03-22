import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Input, InputNumber, Select, Space, DatePicker, TimePicker, message, Card } from "antd";
import dayjs from "dayjs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
// NOTE: docx2html will try to require "jsdom" if it detects Node.
// We load it lazily inside the browser code path and ensure `process` is undefined
// so it picks the browser implementation, avoiding dynamic require of jsdom.
// Do NOT import at top-level.
// import docx2html from "docx2html";
import html2pdf from "html2pdf.js";

import { csmDecrypt } from "../csm-grid/CsmCrypto";
import { getTableData, type Where } from "../csm-grid/CsmApi";
import { useAppStore } from "#src/store";
import LunarCalendar from "#src/utils/lunarCalendar";
import DateUtils from "#src/utils/dateUtils";
import { useEnterToTab } from "#src/hooks/useEnterToTab";

type Row = Record<string, any>;
type Database = Record<string, { rows: Row[] }>;

export interface CsmReportProps {
  appId?: string;
  m_configs: any; // Menu config (includes table fields, trigger, report_name, orientation, p_width, p_height)
  decrypt?: (s: string) => string;
}

interface Option { ma: any; ten: string }

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

function ensureReturn(code: string): string {
  const trimmed = code?.trim() || "";
  if (!trimmed) return "return null";
  return trimmed.includes("return ") ? trimmed : `return (${trimmed})`;
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
  const [form] = Form.useForm();
  const [optionsSelect, setOptionsSelect] = useState<Record<string, any>>({});
  const [reportSrc, setReportSrc] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Enable Enter to Tab functionality for all inputs in the form
  useEnterToTab(containerRef);
  
  // Get database from global AppStore instead of props
  const database = useAppStore(state => state.database);
  const databaseRef = useRef(database);

  // Update refs when database changes
  useEffect(() => {
    databaseRef.current = database;
  }, [database]);

  const tableName: string = m_configs.table_name || m_configs.id;
  const fields = useMemo(() => {
    const tableFields: any[] = (m_configs.table || [])
      .filter((f: any) => Number(f.f_show) === 1 && f.f_name?.toLowerCase() !== "id")
      .sort((a: any, b: any) => Number(a.f_stt) - Number(b.f_stt));
    return tableFields.filter((f: any) => f.f_name?.toLowerCase() !== "parent_id");
  }, [m_configs]);

  function getKey(tb: string, f: string) { return `${tb}_^_${f}`; }

  function buildOptionsFromDb(objName: string, fields: string[], objWhere?: string): { options: Option[], where?: any, data?: Row[] } {
    const objTBL = database[objName];
    const out: { options: Option[], where?: any, data?: Row[] } = { options: [] };
    if (!objTBL) return out;
    out.data = objTBL.rows;
    out.options = objTBL.rows.map((o: Row) => ({ ma: o[fields[0]], ten: o[fields[1]] }));
    out.options.sort((a, b) => a.ten.localeCompare(b.ten));
    if (objWhere) {
      const fn = safeEval(["data"], ensureReturn(objWhere));
      try { out.where = fn?.({}) ?? undefined; } catch { /* ignore */ }
    }
    return out;
  }

  function setOptions(tb: string, f: string, value: any) {
    setOptionsSelect(prev => ({ ...prev, [getKey(tb, f)]: value }));
  }

  async function getOptionsSelect(f_cbo_query: string, tb_name: string, f_name: string): Promise<void> {
    const key = getKey(tb_name, f_name);
    setOptionsSelect(prev => ({ ...prev, [key]: { options: [] } }));
    if (!f_cbo_query) return;

    // Decrypt first if needed (like CsmDynamicGrid)
    const body = (f_cbo_query.indexOf("return ") === -1 ? "return " : "") + f_cbo_query;
    let code = body;
    if (decrypt) {
      try {
        const dec = decrypt(body);
        if (dec) code = dec;
      } catch (err) {
        console.warn("Decrypt error:", err);
      }
    }

    // Eval with proper context (like CsmDynamicGrid)
    const fn = safeEval(["seft", "data"], code);
    if (!fn) {
      console.warn("Failed to eval f_cbo_query for", f_name);
      return;
    }

    try {
      const objQa: any = fn({ m_configs }, databaseRef.current) || {};
      
      // Skip grid select
      if (objQa.hasOwnProperty("f_grid") && objQa.hasOwnProperty("f_grid_fields")) {
        setOptions(tb_name, f_name, objQa);
        return;
      }
      
      // Must have options and query
      if (!objQa.hasOwnProperty("options") || !objQa.hasOwnProperty("query")) {
        console.warn("Invalid objQa for", f_name, objQa);
        return;
      }

      let options: any[] = [];

      // Case 1: query API get-table-data (like CsmDynamicGrid)
      if (Array.isArray(objQa.query) && objQa.query.length === 1) {
        const queryItem = objQa.query[0];
        const obj_name = queryItem.obj_name || "";
        const fieldsQ = queryItem.fields || [];
        const obj_where = queryItem.obj_where || "";

        if (obj_name !== "" && fieldsQ.length === 2) {
          try {
            // Get app_id
            let queryAppId = queryItem.app_id;
            if (!queryAppId) {
              queryAppId = appId;
              if (!queryAppId) {
                try { queryAppId = useAppStore.getState().getCurrentAppId(); } catch {}
              }
            }

            if (queryAppId) {
              // Default WHERE condition
              const defaultWhere: Where = {
                operator: "AND",
                conditions: [
                  {
                    field: "id",
                    type: "like",
                    value: ""
                  }
                ]
              };

              // Xây dựng điều kiện WHERE từ obj_where nếu có
              const where: Where = obj_where
                ? typeof obj_where === "string" 
                  ? safeEval(["data"], (obj_where.includes("return ") ? "" : "return ") + obj_where)?.({}) as any ?? defaultWhere 
                  : obj_where
                : defaultWhere;

              // Fetch from API
              const res = await getTableData<Row>({
                app_id: queryAppId,
                obj_name,
                where,
              });

              const rows = res?.rows || [];
              options = rows.map((row: any) => ({
                ma: row[fieldsQ[0]] != null ? row[fieldsQ[0]] : "",
                ten: row[fieldsQ[1]] != null ? row[fieldsQ[1]] : "",
              }));
            } else {
              // Fallback to database
              const out = buildOptionsFromDb(obj_name, fieldsQ, obj_where);
              options = out.options;
            }
          } catch (error) {
            console.error("Error loading select options from API:", error);
            // Fallback to database
            const out = buildOptionsFromDb(obj_name, fieldsQ, obj_where);
            options = out.options;
          }
        }
      }

      // Case 2: static options
      if (options.length === 0 && Array.isArray(objQa.options) && objQa.options.length > 0) {
        options = objQa.options;
      }

      if (options.length === 0) {
        console.warn("No options found for", f_name);
        return;
      }

      // Sort and set
      const sorted = [...options].sort((a: any, b: any) => {
        const aText = String(a.ten || a.label || "");
        const bText = String(b.ten || b.label || "");
        return aText.localeCompare(bText);
      });

      setOptions(tb_name, f_name, { 
        fields: ["ma", "ten"], 
        data: sorted, 
        options: sorted 
      });
    } catch (err) {
      console.error("Error in getOptionsSelect:", err);
    }
  }

  useEffect(() => {
    // Preload select options from f_cbo_query fields
    fields.forEach((Obj: any) => {
      if (String(Obj.f_types).includes("co") && Obj.f_cbo_query) {
        getOptionsSelect(Obj.f_cbo_query, tableName, Obj.f_name);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderField(field: any) {
    const width = Number(field.f_width) || 200;
    const name = field.f_name;
    const label = field.f_header;
    const types = String(field.f_types);

    if (types.includes("ro")) {
      return null; // read-only in filter form
    }

    if (types.includes("datetime")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <DatePicker showTime format="DD/MM/YYYY HH:mm:ss" style={{ width }} />
        </Form.Item>
      );
    }
    if (types.includes("date")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <DatePicker format="DD/MM/YYYY" style={{ width }} />
        </Form.Item>
      );
    }
    if (types.includes("time")) {
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <TimePicker format="HH:mm:ss" style={{ width }} />
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
    if (types.includes("co")) {
      const opt = optionsSelect[getKey(tableName, name)] || { options: [] };
      return (
        <Form.Item key={name} name={name.toLowerCase()} label={label}>
          <Select
            style={{ width }}
            allowClear
            showSearch
            optionFilterProp="children"
            placeholder={`Chọn ${label}`}
          >
            {(opt.options || []).map((o: Option) => (
              <Select.Option key={String(o.ma)} value={o.ma}>{o.ten}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      );
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
          if (dayjs.isDayjs(v)) dataForm[k] = v.format(elF.f_types.includes("datetime") ? "DD/MM/YYYY HH:mm:ss" : elF.f_types.includes("date") ? "DD/MM/YYYY" : "HH:mm:ss");
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
    <Card title={m_configs.label || m_configs.name || "Báo cáo"} bordered>
      <div ref={containerRef}>
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
      <div style={{ marginTop: 16 }}>
        <iframe src={reportSrc} title="report" aria-hidden="true" style={{ right: 0, top: 0, bottom: 0, height: "100%", width: "100%", minHeight: 480 }} />
      </div>
    </Card>
  );
}
