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
  buildComboOptionsFromRows,
  getInputCharFilter,
  isAutoNumberField,
  isDateFieldConfig,
  parseGridFieldMap,
  resolveComboQueryMeta,
  resolveGridDisplayColumns,
} from "./line-items-field-utils";
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
      const { tableName } = resolveComboQueryMeta(f);
      const rows = tableName ? comboData[tableName] ?? [] : [];
      const options = buildComboOptionsFromRows(f, rows);
      const selectEl = (
        <Select
          style={{ width: "100%" }}
          showSearch
          optionFilterProp="label"
          disabled={readOnly}
          value={val != null && val !== "" ? String(val) : undefined}
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
    const { tableName } = resolveComboQueryMeta(gridField);
    return tableName ? comboData[tableName] ?? [] : [];
  }, [gridField, comboData]);

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
    const { tableName, valueField } = resolveComboQueryMeta(field);
    const rows = tableName ? comboData[tableName] ?? [] : [];
    const row = rows.find((r) => String(r[valueField] ?? r.id) === String(value));
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
    const { valueField } = resolveComboQueryMeta(gridField);
    const value = row[valueField] ?? row.id;
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
          rowKey={(r) => String(r.id ?? r.ma_kh ?? JSON.stringify(r))}
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
