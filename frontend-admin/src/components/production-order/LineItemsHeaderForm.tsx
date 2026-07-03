/**
 * Form header type_form=7 — render field theo f_types từ menu designer (FieldConfigEditor).
 */
import React, { useMemo, useState } from "react";
import { Button, Card, Checkbox, Col, DatePicker, Input, InputNumber, Modal, Row, Select, Space, Table } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

import type { LineItemsUiConfig, OrderHeader } from "./types";
import { resolveTriLangLabel } from "./line-items-label";
import { fmtVND } from "./utils";
import {
  applyGridFieldMap,
  blockNonNumericKey,
  getInputCharFilter,
  isAutoNumberField,
  isDateFieldConfig,
  parseGridFieldMap,
  parseCoOptions,
  resolveComboQueryMeta,
  resolveGridDisplayColumns,
} from "./line-items-field-utils";
import { resolveComboRowFieldValue } from "#src/components/csm-grid/combo-utils";
import { validateAutoFieldValue, type LiAutoEngineContext } from "./line-items-auto-engine";
import { useLineItemsTheme } from "./line-items-theme";

dayjs.extend(customParseFormat);

const { TextArea } = Input;

function normalizeFieldType(f_types: unknown): string {
  return String(f_types ?? "ed").toLowerCase().trim();
}

function isNumericType(t: string): boolean {
  return ["nummeric", "numchu", "ron", "number"].includes(t);
}

function isPriceType(t: string): boolean {
  return ["price", "roprice"].includes(t);
}

function isComboType(t: string): boolean {
  return ["co", "cp", "coro", "select", "cbo"].includes(t);
}

function isTextareaType(t: string): boolean {
  return ["memo", "html", "textarea"].includes(t);
}

function isDateType(t: string): boolean {
  return ["date", "datetime", "time"].includes(t);
}

function isCheckboxType(t: string): boolean {
  return ["ch", "checkbox", "bool"].includes(t);
}

export interface LineItemsHeaderFormProps {
  fields: Record<string, any>[];
  header: OrderHeader;
  onChange: (key: string, val: any) => void;
  onPatch?: (patch: Record<string, any>) => void;
  lang: string;
  ui?: LineItemsUiConfig;
  comboData?: Record<string, Record<string, any>[]>;
  engineCtx?: LiAutoEngineContext;
}

export default function LineItemsHeaderForm({
  fields,
  header,
  onChange,
  onPatch,
  lang,
  ui,
  comboData = {},
  engineCtx,
}: LineItemsHeaderFormProps) {
  const [gridField, setGridField] = useState<Record<string, any> | null>(null);
  const { fieldLabel } = useLineItemsTheme();

  const norm = (v: any) => String(v ?? "").trim().toLowerCase();

  const applyWhereClause = (rows: Record<string, any>[], whereClause: any): Record<string, any>[] => {
    if (!whereClause || typeof whereClause !== "object") return rows;
    const field = String(whereClause.field ?? "").trim();
    const type = String(whereClause.type ?? "").trim().toLowerCase();
    const value = whereClause.value;
    if (!field || !type) return rows;

    return rows.filter((row) => {
      const left = row?.[field];
      switch (type) {
        case "eq":
          return norm(left) === norm(value);
        case "ne":
          return norm(left) !== norm(value);
        case "like":
          return norm(left).includes(norm(value));
        case "in":
          return Array.isArray(value) && value.some((v) => norm(v) === norm(left));
        default:
          return true;
      }
    });
  };

  const resolveRuntimeComboMeta = (field: Record<string, any>) => {
    const fallbackMeta = resolveComboQueryMeta(field);
    const rawQuery = String(field?.f_cbo_query ?? "").trim();
    const seftContext = { context: { select_row: header || {} } };

    let tableName = String(fallbackMeta.tableName || "").trim();
    let valueField = String(fallbackMeta.valueField || "id").trim() || "id";
    let labelField = String(fallbackMeta.labelField || "ten").trim() || "ten";
    let whereClause: any = null;
    let sourceConfig: any = null;
    let reconcileConfig: any = null;
    let displayConfig: any = null;

    if (rawQuery) {
      let evaluated: any = null;
      try {
        // 1) JSON/static config
        if (rawQuery.startsWith("{") || rawQuery.startsWith("[")) {
          evaluated = JSON.parse(rawQuery);
        }
      } catch {
        evaluated = null;
      }

      if (!evaluated) {
        try {
          // 2) Expression/IIFE config: "(function(){ ... return {...}; })()"
          // Always wrap by return so expression result is preserved.
          // eslint-disable-next-line no-new-func
          const fn = new Function("seft", "data", `return (${rawQuery});`);
          evaluated = fn(seftContext, comboData);
        } catch {
          evaluated = null;
        }
      }

      if (!evaluated) {
        try {
          // 3) Legacy function-body config that already contains statements.
          // eslint-disable-next-line no-new-func
          const fn = new Function("seft", "data", rawQuery.includes("return ") ? rawQuery : `return ${rawQuery};`);
          evaluated = fn(seftContext, comboData);
        } catch {
          evaluated = null;
        }
      }

      const q = evaluated?.query?.[0];
      if (q && typeof q === "object") {
        tableName = String(q.obj_name || tableName || "").trim();
        const fields = Array.isArray(q.fields) ? q.fields : [];
        valueField = String(q.value_field || valueField || fields[0] || "id").trim() || "id";
        labelField = String(q.label_field || labelField || fields[1] || fields[0] || "ten").trim() || "ten";
        whereClause = q.obj_where ?? null;
        sourceConfig = q.source ?? sourceConfig;
        reconcileConfig = q.reconcile ?? reconcileConfig;
        displayConfig = q.display ?? displayConfig;
      }

      sourceConfig = evaluated?.source ?? sourceConfig;
      reconcileConfig = evaluated?.reconcile ?? reconcileConfig;
      displayConfig = evaluated?.display ?? displayConfig;
    }

    const sourceRowsFromTable = tableName ? (comboData[tableName] ?? []) : [];

    const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);
    const asStringArray = (v: any, fallback: string[]): string[] => {
      if (!Array.isArray(v)) return fallback;
      const next = v.map((x) => String(x ?? "").trim()).filter(Boolean);
      return next.length > 0 ? next : fallback;
    };
    const getByPath = (obj: any, path: string): any => {
      const p = String(path ?? "").trim();
      if (!p) return undefined;
      return p.split(".").reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
    };
    const pickFirst = (obj: any, paths: string[]): any => {
      for (const p of paths) {
        const val = getByPath(obj, p);
        if (val !== undefined && val !== null && String(val).trim() !== "") return val;
      }
      return undefined;
    };
    const parseRowCollection = (raw: any, rowArrayKeys: string[]): Record<string, any>[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object");
      if (typeof raw === "string") {
        const text = raw.trim();
        if (!text) return [];
        try {
          const parsed = JSON.parse(text);
          return parseRowCollection(parsed, rowArrayKeys);
        } catch {
          return [];
        }
      }
      if (typeof raw === "object") {
        for (const k of rowArrayKeys) {
          const rows = (raw as any)?.[k];
          if (Array.isArray(rows)) return rows.filter((x) => x && typeof x === "object");
        }
        const hasShape = Object.keys(raw as Record<string, any>).length > 0;
        if (hasShape) return [raw as Record<string, any>];
      }
      return [];
    };
    const normalizeRowsByConfig = (
      rows: Record<string, any>[],
      normalizeMap: Record<string, string[]>,
      parentRow?: Record<string, any> | null,
      headerRow?: Record<string, any> | null,
    ): Record<string, any>[] => {
      if (!rows.length || !normalizeMap || typeof normalizeMap !== "object") return rows;
      return rows.map((row, idx) => {
        const next: Record<string, any> = { ...row };
        for (const [targetKey, sourcePaths] of Object.entries(normalizeMap)) {
          const paths = asStringArray(sourcePaths, []);
          if (paths.length === 0) continue;
          const picked = (() => {
            for (const p of paths) {
              const key = String(p ?? "").trim();
              if (!key) continue;
              if (key.startsWith("$parent.")) {
                const pv = getByPath(parentRow, key.slice("$parent.".length));
                if (pv !== undefined && pv !== null && String(pv).trim() !== "") return pv;
                continue;
              }
              if (key.startsWith("$header.")) {
                const hv = getByPath(headerRow, key.slice("$header.".length));
                if (hv !== undefined && hv !== null && String(hv).trim() !== "") return hv;
                continue;
              }
              const rv = getByPath(row, key);
              if (rv !== undefined && rv !== null && String(rv).trim() !== "") return rv;
            }
            return undefined;
          })();
          if (picked !== undefined) next[targetKey] = picked;
        }
        if (next.id == null || String(next.id).trim() === "") {
          next.id = String(next[valueField] ?? `${tableName || "row"}_${idx + 1}`);
        }
        return next;
      });
    };
    const resolveRowsFromSourceConfig = (): Record<string, any>[] => {
      if (!sourceConfig || typeof sourceConfig !== "object") return [];

      const mode = String((sourceConfig.mode ?? sourceConfig.type) || "").trim().toLowerCase();
      const rowArrayKeys = asStringArray(sourceConfig.row_array_keys, ["rows", "data", "list"]);
      const debugEnabled = Boolean((sourceConfig as any)?.debug);
      const normalizeMap = (sourceConfig.normalize_map && typeof sourceConfig.normalize_map === "object")
        ? Object.fromEntries(
          Object.entries(sourceConfig.normalize_map).map(([k, v]) => [k, asStringArray(v, [])]),
        ) as Record<string, string[]>
        : {};

      if (mode === "header_field") {
        const fields = asStringArray(sourceConfig.fields, asStringArray(sourceConfig.field_candidates, [String(sourceConfig.field ?? "").trim()])).filter(Boolean);
        for (const fieldName of fields) {
          const rows = parseRowCollection((header as any)?.[fieldName], rowArrayKeys);
          if (rows.length > 0) return normalizeRowsByConfig(rows, normalizeMap, null, header as Record<string, any>);
        }
      }

      if (mode === "parent_field") {
        const parentObjName = String(sourceConfig.parent_obj ?? "").trim();
        if (parentObjName) {
          const parentRows = asArray(comboData[parentObjName]);
          if (parentRows.length > 0) {
            const matchRules = asArray(sourceConfig.parent_match)
              .filter((m) => m && typeof m === "object")
              .map((m) => ({
                parentField: String((m as any).parent_field ?? "").trim(),
                headerField: String((m as any).header_field ?? "").trim(),
              }))
              .filter((m) => m.parentField && m.headerField);

            if (matchRules.length > 0) {
              const parentRow = parentRows.find((r) => matchRules.some((rule) => {
                const hv = (header as any)?.[rule.headerField];
                if (hv == null || String(hv).trim() === "") return false;
                return norm((r as any)?.[rule.parentField]) === norm(hv);
              }));

              if (parentRow) {
                const fields = asStringArray(sourceConfig.fields, asStringArray(sourceConfig.field_candidates, [String(sourceConfig.field ?? "").trim()])).filter(Boolean);
                for (const fieldName of fields) {
                  const rows = parseRowCollection((parentRow as any)?.[fieldName], rowArrayKeys);
                  if (rows.length > 0) return normalizeRowsByConfig(rows, normalizeMap, parentRow as Record<string, any>, header as Record<string, any>);
                }
              }

              if (debugEnabled) {
                console.debug("[LineItemsHeaderForm][combo source debug]", {
                  fieldName: String(field?.f_name ?? ""),
                  mode,
                  parentObjName,
                  parentRows: parentRows.length,
                  matchedParent: Boolean(parentRow),
                  header: {
                    khach_hang_id: (header as any)?.khach_hang_id,
                    ma_kh: (header as any)?.ma_kh,
                    khach_hang: (header as any)?.khach_hang,
                  },
                });
              }
            }
          }
        }
      }

      const fallbackQuery = sourceConfig.fallback_query;
      if (fallbackQuery && typeof fallbackQuery === "object") {
        const objName = String((fallbackQuery as any).obj_name ?? "").trim();
        if (objName) {
          const fbRows = asArray(comboData[objName]);
          if (fbRows.length > 0) {
            const matches = asArray((fallbackQuery as any).match)
              .filter((m) => m && typeof m === "object")
              .map((m) => ({
                rowFields: asStringArray((m as any).row_fields, [String((m as any).row_field ?? "").trim()]).filter(Boolean),
                headerFields: asStringArray((m as any).header_fields, [String((m as any).header_field ?? "").trim()]).filter(Boolean),
              }))
              .filter((m) => m.rowFields.length > 0 && m.headerFields.length > 0);

            const matchMode = String((fallbackQuery as any).match_mode ?? "any").trim().toLowerCase();
            const filtered = matches.length === 0
              ? fbRows
              : fbRows.filter((r) => {
                const checks = matches.map((m) => {
                  const headerValues = m.headerFields
                    .map((hf) => (header as any)?.[hf])
                    .filter((v) => v != null && String(v).trim() !== "");
                  if (headerValues.length === 0) return false;
                  const rowValues = m.rowFields
                    .map((rf) => (r as any)?.[rf])
                    .filter((v) => v != null && String(v).trim() !== "");
                  if (rowValues.length === 0) return false;
                  return headerValues.some((hv) => rowValues.some((rv) => norm(rv) === norm(hv)));
                });
                return matchMode === "all" ? checks.every(Boolean) : checks.some(Boolean);
              });

            if (debugEnabled) {
              console.debug("[LineItemsHeaderForm][combo fallback debug]", {
                fieldName: String(field?.f_name ?? ""),
                fallbackObj: objName,
                fallbackRows: fbRows.length,
                filteredRows: filtered.length,
                matchMode,
                header: {
                  khach_hang_id: (header as any)?.khach_hang_id,
                  ma_kh: (header as any)?.ma_kh,
                  khach_hang: (header as any)?.khach_hang,
                },
              });
            }

            if (filtered.length > 0) {
              return normalizeRowsByConfig(filtered, normalizeMap, null, header as Record<string, any>);
            }
          }
        }
      }

      return [];
    };

    const sourceRowsFromConfig = resolveRowsFromSourceConfig();
    const sourceRows = sourceRowsFromConfig.length > 0 ? sourceRowsFromConfig : sourceRowsFromTable;

    let rows = applyWhereClause(sourceRows, whereClause);

    return { tableName, valueField, labelField, rows, reconcileConfig, displayConfig };
  };

  const buildComboOptions = (
    field: Record<string, any>,
    rows: Record<string, any>[],
    valueField: string,
    labelField: string,
    displayConfig?: Record<string, any> | null,
  ): { value: string; label: string }[] => {
    const staticOptions = parseCoOptions(field);
    if (staticOptions.length > 0) return staticOptions;

    const labelCandidates = Array.isArray(displayConfig?.label_candidates)
      ? displayConfig!.label_candidates.map((x: any) => String(x ?? "").trim()).filter(Boolean)
      : [labelField, "ten", "name", "title"];
    const phoneField = String(displayConfig?.phone_field ?? "").trim();
    const appendPhone = Boolean(displayConfig?.append_phone && phoneField);

    return rows
      .map((r) => {
        const value = String(resolveComboRowFieldValue(r, valueField) ?? resolveComboRowFieldValue(r, "id") ?? "").trim();
        const baseLabel = String(
          labelCandidates
            .map((k) => resolveComboRowFieldValue(r, k))
            .find((v) => v != null && String(v).trim() !== "")
            ?? value,
        ).trim();
        const phone = appendPhone ? String(resolveComboRowFieldValue(r, phoneField) ?? "").trim() : "";
        const label = phone ? `${baseLabel} - ${phone}` : baseLabel;
        return value ? { value, label } : null;
      })
      .filter(Boolean) as { value: string; label: string }[];
  };

  const visibleFields = useMemo(
    () => (fields || [])
      .filter((f) => Number(f.f_show ?? 1) !== 0 && String(f.f_name ?? "").toLowerCase() !== "id")
      .sort((a, b) => Number(a.f_stt ?? 0) - Number(b.f_stt ?? 0)),
    [fields],
  );

  const fieldSections = useMemo(() => {
    const secs = ui?.field_sections;
    if (!Array.isArray(secs) || secs.length === 0) return null;
    const byName = new Map(
      visibleFields.map((f) => [String(f.f_name ?? "").toLowerCase(), f]),
    );
    return secs.map((sec) => ({
      key: sec.key,
      title: resolveTriLangLabel(sec, lang, ["label"]) || sec.key,
      fields: (sec.fields ?? [])
        .map((n) => byName.get(String(n).toLowerCase()))
        .filter(Boolean) as Record<string, any>[],
    })).filter((sec) => sec.fields.length > 0);
  }, [ui?.field_sections, visibleFields, lang]);

  const renderFieldInput = (f: Record<string, any>): React.ReactNode => {
    const name = String(f.f_name ?? "").toLowerCase();
    const types = normalizeFieldType(f.f_types);
    const val = header[name];
    const readOnly = Number(f.f_readonly ?? 0) === 1 || Number(f.g_readonly ?? 0) === 1;

    if (isComboType(types)) {
      const { rows, valueField, labelField, reconcileConfig, displayConfig } = resolveRuntimeComboMeta(f);
      const options = buildComboOptions(f, rows, valueField, labelField, displayConfig);
      let selectedValue: string | undefined = val != null && val !== "" ? String(val) : undefined;

      if (rows.length > 0 && reconcileConfig && typeof reconcileConfig === "object") {
        const headerField = String(reconcileConfig.header_field ?? "").trim();
        const rowField = String(reconcileConfig.row_field ?? headerField).trim();
        const matchLabel = Boolean(reconcileConfig.match_label);
        const hVal = headerField ? header?.[headerField] : undefined;
        const byHeaderField = (rowField && hVal != null && String(hVal).trim() !== "")
          ? rows.find((r) => norm(resolveComboRowFieldValue(r, rowField)) === norm(hVal))
          : null;
        const byLabel = (matchLabel && selectedValue)
          ? rows.find((r) => norm(resolveComboRowFieldValue(r, labelField)) === norm(selectedValue))
          : null;
        const matched = byHeaderField || byLabel;
        if (matched) selectedValue = String(matched?.[valueField] ?? matched?.id ?? selectedValue ?? "");
      }

      const selectEl = (
        <Select
          style={{ width: "100%" }}
          showSearch
          optionFilterProp="label"
          disabled={readOnly}
          value={selectedValue}
          options={options}
          onChange={(v) => applyComboValue(f, v)}
          allowClear
          placeholder={f.f_placeholder ?? "Chọn..."}
        />
      );
      return f.f_grid && !readOnly ? (
        <Space.Compact style={{ width: "100%" }}>
          {selectEl}
          <Button icon={<SearchOutlined />} title="Chọn từ lưới" onClick={() => setGridField(f)} />
        </Space.Compact>
      ) : selectEl;
    }
    if (isCheckboxType(types)) {
      return (
        <Checkbox
          checked={Boolean(val)}
          disabled={readOnly}
          onChange={(e) => onChange(name, e.target.checked ? 1 : 0)}
        />
      );
    }
    if (isTextareaType(types)) {
      return (
        <TextArea
          rows={types === "memo" ? 3 : 2}
          disabled={readOnly}
          value={val ?? ""}
          placeholder={f.f_placeholder ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
        />
      );
    }
    if (isDateType(types) || isDateFieldConfig(f)) {
      const isDatetime = types === "datetime";
      const fmt = isDatetime ? "DD/MM/YYYY HH:mm" : "DD/MM/YYYY";
      const parsed = val ? dayjs(String(val), fmt, true) : null;
      const dateValue = parsed?.isValid() ? parsed : null;
      return (
        <DatePicker
          style={{ width: "100%" }}
          disabled={readOnly}
          inputReadOnly
          allowClear={false}
          format={fmt}
          showTime={isDatetime}
          value={dateValue}
          onChange={(d) => {
            if (!d || !d.isValid()) return;
            onChange(name, d.format(fmt));
          }}
        />
      );
    }
    if (isAutoNumberField(f)) {
      const inputFilter = getInputCharFilter(f);
      return (
        <Input
          disabled={readOnly}
          value={val ?? ""}
          placeholder={f.f_placeholder ?? ""}
          onChange={(e) => {
            let raw = e.target.value;
            if (inputFilter === "doc_no") raw = raw.replace(/[^\d./]/g, "");
            else if (inputFilter === "integer") raw = raw.replace(/\D/g, "");
            onChange(name, raw);
          }}
          onBlur={(e) => {
            const text = e.target.value.trim();
            if (!text) return;
            if (!validateAutoFieldValue(f, text, engineCtx)) onChange(name, "");
          }}
        />
      );
    }
    if (isNumericType(types)) {
      const dec = Number(f.f_dec) > 0 ? Number(f.f_dec) : 0;
      return (
        <InputNumber
          style={{ width: "100%" }}
          disabled={readOnly}
          controls={false}
          value={val}
          min={types === "numchu" ? undefined : 0}
          step={dec > 0 ? 10 ** -dec : 1}
          precision={dec > 0 ? dec : undefined}
          parser={(v) => {
            const cleaned = String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
            return cleaned === "" || cleaned === "-" ? "" : Number(cleaned);
          }}
          onKeyDown={(e) => blockNonNumericKey(e, dec > 0)}
          onChange={(v) => onChange(name, v)}
        />
      );
    }
    if (isPriceType(types)) {
      return (
        <InputNumber
          style={{ width: "100%" }}
          disabled={readOnly}
          controls={false}
          value={val}
          min={0}
          step={1000}
          formatter={(v) => (v != null ? fmtVND(Number(v)) : "")}
          parser={(v) => (v ? parseInt(v.replace(/\D/g, ""), 10) || 0 : 0) as any}
          onKeyDown={(e) => blockNonNumericKey(e, false)}
          onChange={(v) => onChange(name, v)}
        />
      );
    }
    return (
      <Input
        disabled={readOnly}
        value={val ?? ""}
        placeholder={f.f_placeholder ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
      />
    );
  };

  const renderFieldCol = (f: Record<string, any>) => {
    const name = String(f.f_name ?? "").toLowerCase();
    const label = resolveTriLangLabel(f, lang, ["f_header", "f_name"]);
    const span = Number(f.f_width_col ?? 12);
    return (
      <Col key={name} xs={24} sm={span}>
        <div style={fieldLabel}>{label}</div>
        {renderFieldInput(f)}
      </Col>
    );
  };

  const renderFieldsGrid = (list: Record<string, any>[]) => (
    <Row gutter={[12, 8]}>
      {list.map(renderFieldCol)}
    </Row>
  );

  const gridRows = useMemo(() => {
    if (!gridField) return [];
    return resolveRuntimeComboMeta(gridField).rows;
  }, [gridField, comboData, header]);

  const gridColumns = useMemo(() => {
    if (!gridField) return [];
    const display = resolveGridDisplayColumns(gridField, gridRows);
    return display.map((c) => ({
      title: c,
      dataIndex: c,
      ellipsis: true,
    }));
  }, [gridField, gridRows]);

  if (visibleFields.length === 0) return null;

  const cardTitle = resolveTriLangLabel(ui ?? {}, lang, ["header_title"])
    || "Thông tin đơn hàng";

  const applyComboValue = (field: Record<string, any>, value: string | number) => {
    const name = String(field.f_name ?? "").toLowerCase();
    const { rows, valueField } = resolveRuntimeComboMeta(field);
    const row = rows.find((r) => String(resolveComboRowFieldValue(r, valueField) ?? resolveComboRowFieldValue(r, "id") ?? "") === String(value));
    const map = parseGridFieldMap(field);
    if (row && Object.keys(map).length > 0) {
      onPatch?.(applyGridFieldMap(map, row, { ...header, [name]: value }));
    } else {
      onChange(name, value);
    }
  };

  const applyGridRow = (row: Record<string, any>) => {
    if (!gridField) return;
    const name = String(gridField.f_name ?? "").toLowerCase();
    const { valueField } = resolveRuntimeComboMeta(gridField);
    const value = resolveComboRowFieldValue(row, valueField) ?? resolveComboRowFieldValue(row, "id");
    const map = parseGridFieldMap(gridField);
    onPatch?.(applyGridFieldMap(map, row, { ...header, [name]: value }));
    setGridField(null);
  };

  return (
    <>
      {fieldSections ? (
        fieldSections.map((sec) => (
          <Card key={sec.key} title={sec.title} size="small" style={{ marginBottom: 12 }}>
            {renderFieldsGrid(sec.fields)}
          </Card>
        ))
      ) : (
        <Card title={cardTitle} size="small" style={{ marginBottom: 12 }}>
          {renderFieldsGrid(visibleFields)}
        </Card>
      )}

      <Modal
        open={Boolean(gridField)}
        title={resolveTriLangLabel(gridField ?? {}, lang, ["f_header", "f_name"]) || "Chọn từ lưới"}
        onCancel={() => setGridField(null)}
        footer={null}
        width={820}
        destroyOnClose
      >
        <Table
          size="small"
          rowKey={(r) => {
            if (!gridField) return JSON.stringify(r);
            const { valueField } = resolveRuntimeComboMeta(gridField);
            return String(r?.[valueField] ?? r?.id ?? JSON.stringify(r));
          }}
          dataSource={gridRows}
          columns={gridColumns}
          pagination={{ pageSize: 8 }}
          onRow={(row) => ({
            onClick: () => applyGridRow(row),
            style: { cursor: "pointer" },
          })}
        />
      </Modal>
    </>
  );
}

// Re-export for CsmLineItemsEditor combo prefetch
export { resolveComboQueryMeta } from "./line-items-field-utils";
