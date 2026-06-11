/**
 * CsmLineItemsEditor — component nhập liệu dòng hàng có nhóm + xuất PDF động.
 *
 * Toàn bộ hành vi được đọc từ m_configs:
 *   - m_configs.table              → các trường header (giống CsmDynamicGrid)
 *   - m_configs.line_items_columns → định nghĩa cột cho bảng dòng hàng
 *   - m_configs.line_items_group   → cấu hình nhóm (spec, vat)
 *   - m_configs.line_items_totals  → cấu hình dòng tổng cộng
 *   - m_configs.line_items_print   → nút in + trigger_key
 *   - m_configs.trigger[key]       → JS function body trả về HTML string
 *
 * Thêm loại tài liệu mới = thêm phần tử vào line_items_print + viết trigger key.
 * Thêm trường mới = thêm phần tử vào line_items_columns.
 * Thay đổi công thức = sửa formula trong config, không cần sửa source code.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  Button, Card, Col, Divider, Input, InputNumber,
  Row, Select, Space, Table, Typography, message,
} from "antd";
import { DeleteOutlined, PlusOutlined, PrinterOutlined, SaveOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import html2pdf from "html2pdf.js";
import { useTranslation } from "react-i18next";

import type {
  LineItemsEditorConfig, LiColumnDef, LiGroupConfig,
  LineItem, ProductGroup, OrderHeader, EditorCalcResult,
} from "./types";
import { resolveTriLangLabel } from "./line-items-label";
import {
  computeRowValues, calcGroupResult, calcEditorTotals,
  evalPrintTemplate, evalCondition,
  soThanhChu, fmtVND, fmtNum, groupLabel, printUtils,
  newItem, newGroup,
} from "./utils";

const { TextArea } = Input;
const { Text } = Typography;

// ─── Default config values ────────────────────────────────────────────────────

const DEFAULT_GROUP_CFG: Required<LiGroupConfig> = {
  spec_field: "spec",
  vat_field: "vat_rate",
  vat_default: 10,
  vat_options: [{ value: 8, label: "VAT 8%" }, { value: 10, label: "VAT 10%" }],
  label_prefix: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CsmLineItemsEditorProps {
  m_configs: LineItemsEditorConfig;
  decrypt?: (s: string) => string;
  initialValue?: { header?: OrderHeader; groups?: ProductGroup[] };
  onSave?: (data: { header: OrderHeader; groups: ProductGroup[] }) => void;
}

// ─── Cell renderer for one column in a row ────────────────────────────────────

function CellInput({
  col, value, row, computed,
  onChange,
}: {
  col: LiColumnDef;
  value: any;
  row: LineItem;
  computed: Record<string, any>;
  onChange: (v: any) => void;
}) {
  const isManual = col.type === "formula_or_manual"
    ? evalCondition(col.manual_condition ?? "", computed)
    : false;

  if (col.type === "formula" || (col.type === "formula_or_manual" && !isManual)) {
    // Display-only computed value
    return (
      <Text style={{ fontSize: 12 }}>
        {col.name.includes("gia") || col.name.includes("tien")
          ? fmtVND(computed[col.name])
          : fmtNum(computed[col.name])}
      </Text>
    );
  }

  if (col.type === "select") {
    const opts = (col.options ?? "").split("|").map(o => ({ value: o.trim(), label: o.trim() }));
    return (
      <Select
        size="small"
        style={{ width: col.width ? col.width - 4 : 80 }}
        value={value ?? opts[0]?.value}
        options={opts}
        onChange={onChange}
      />
    );
  }

  if (col.type === "number" || col.type === "formula_or_manual") {
    return (
      <InputNumber
        size="small"
        style={{ width: col.width ? col.width - 4 : 80 }}
        value={value}
        min={0} step={col.type === "formula_or_manual" ? 0.01 : 1}
        onChange={v => onChange(v ?? null)}
      />
    );
  }

  if (col.type === "price") {
    return (
      <InputNumber
        size="small"
        style={{ width: col.width ? col.width - 4 : 110 }}
        value={value}
        min={0} step={1000}
        formatter={(v) => v != null ? fmtVND(Number(v)) : ""}
        parser={(v: string | undefined) => (v ? parseInt(v.replace(/\D/g, ""), 10) || 0 : 0) as any}
        onChange={v => onChange(v ?? null)}
      />
    );
  }

  // default: text
  return (
    <Input
      size="small"
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
    />
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: ProductGroup;
  gIdx: number;
  columns: LiColumnDef[];
  groupCfg: Required<LiGroupConfig>;
  calc: EditorCalcResult;
  lang: string;
  onUpdateGroup: (id: string, partial: Partial<ProductGroup>) => void;
  onUpdateItem: (gId: string, iKey: string, field: string, val: any) => void;
  onAddItem: (gId: string) => void;
  onRemoveItem: (gId: string, iKey: string) => void;
  onRemoveGroup: (id: string) => void;
}

const GroupSection = React.memo(function GroupSection({
  group, gIdx, columns, groupCfg, calc, lang,
  onUpdateGroup, onUpdateItem, onAddItem, onRemoveItem, onRemoveGroup,
}: GroupSectionProps) {
  const label = groupLabel(gIdx);
  const gc = calc.groups[group.id];

  // Find "subtotal" columns (formula cols)
  const formulaCols = columns.filter(c =>
    c.type === "formula" || c.type === "formula_or_manual",
  );
  const klCol = formulaCols.length >= 2 ? formulaCols[formulaCols.length - 2] : undefined;
  const ttCol = formulaCols.length >= 1 ? formulaCols[formulaCols.length - 1] : undefined;
  const soTamCol = columns.find(c =>
    ["so_tam", "so_luong", "qty"].includes(c.name),
  );

  // Build antd Table columns dynamically
  const tableColumns: ColumnsType<LineItem> = useMemo(() => {
    const cols: ColumnsType<LineItem> = [
      {
        title: "TT", width: 40, align: "center" as const,
        render: (_: any, __: any, idx: number) => idx + 1,
      },
    ];

    for (const col of columns) {
      if (col.hidden) continue;
      cols.push({
        title: resolveTriLangLabel(col, lang, ["label", "name"]),
        dataIndex: col.name,
        width: col.width,
        align: (col.align ?? "left") as any,
        render: (val: any, item: LineItem) => {
          const computed = computeRowValues(item, columns);
          return (
            <CellInput
              col={col}
              value={val}
              row={item}
              computed={computed}
              onChange={v => onUpdateItem(group.id, item.key, col.name, v)}
            />
          );
        },
      });
    }

    cols.push({
      title: "", width: 36, align: "center" as const,
      render: (_: any, item: LineItem) => (
        <Button
          type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => onRemoveItem(group.id, item.key)}
        />
      ),
    });

    return cols;
  }, [columns, group.id, lang, onUpdateItem, onRemoveItem]);

  // Summary row
  const summary = useCallback(() => (
    <Table.Summary.Row style={{ background: "#f0f5ff" }}>
      <Table.Summary.Cell index={0} colSpan={2} align="left">
        <Text strong>Cộng nhóm {label} – chưa VAT {group.vat_rate}%</Text>
      </Table.Summary.Cell>
      {columns.filter(c => !c.hidden).map((col, ci) => {
        let content: React.ReactNode = null;
        if (col.name === soTamCol?.name) content = <Text strong>{gc?.so_tam ?? 0}</Text>;
        else if (col.name === klCol?.name) content = <Text strong>{fmtNum(gc?.kl)}</Text>;
        else if (col.name === ttCol?.name) content = <Text strong>{fmtVND(gc?.sum)}</Text>;
        else if (col.type === "price" && gc?.uniform_price != null)
          content = <Text>{fmtVND(gc.uniform_price)}</Text>;
        return (
          <Table.Summary.Cell key={ci} index={ci + 2} align={(col.align ?? "left") as any}>
            {content}
          </Table.Summary.Cell>
        );
      })}
      <Table.Summary.Cell index={columns.length + 2} />
    </Table.Summary.Row>
  ), [gc, group.vat_rate, label, columns, klCol, ttCol, soTamCol]);

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderLeft: "4px solid #1677ff" }}
      styles={{ body: { paddingTop: 8 } }}
      title={
        <Space>
          <Text strong style={{ color: "#1677ff", fontSize: 14 }}>{label}.</Text>
          <Select
            size="small"
            value={group.vat_rate}
            options={groupCfg.vat_options}
            onChange={v => onUpdateGroup(group.id, { vat_rate: v })}
          />
        </Space>
      }
      extra={
        <Button
          type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => onRemoveGroup(group.id)}
        >
          Xoá nhóm
        </Button>
      }
    >
      <TextArea
        rows={4}
        value={group.spec}
        placeholder={`Tên và quy cách kỹ thuật nhóm ${label}\nVí dụ: PANEL PUR VÁCH TRONG...\n* Mặt thứ nhất: ...\n* Lớp giữa: ...`}
        onChange={e => onUpdateGroup(group.id, { spec: e.target.value })}
        style={{ marginBottom: 8, fontFamily: "monospace", fontSize: 12 }}
      />

      <Table<LineItem>
        size="small"
        dataSource={group.items}
        columns={tableColumns}
        rowKey="key"
        pagination={false}
        scroll={{ x: "max-content" }}
        summary={summary}
      />

      <Button
        icon={<PlusOutlined />} size="small" style={{ marginTop: 8 }}
        onClick={() => onAddItem(group.id)}
      >
        Thêm dòng
      </Button>
    </Card>
  );
});

// ─── Totals display ───────────────────────────────────────────────────────────

function TotalsDisplay({
  calc, totalConfigs, lang,
}: {
  calc: EditorCalcResult;
  totalConfigs: NonNullable<LineItemsEditorConfig["line_items_totals"]>;
  lang: string;
}) {
  return (
    <Row justify="end" style={{ marginTop: 8 }}>
      <Col>
        <table style={{ borderCollapse: "collapse", minWidth: 360 }}>
          <tbody>
            {totalConfigs.map(tc => {
              const v = calc.totals[tc.key] ?? 0;
              const isGrand = tc.highlight;
              return (
                <React.Fragment key={tc.key}>
                  <tr style={isGrand ? { background: "#e6f4ff" } : {}}>
                    <td style={{ padding: "3px 8px", fontWeight: isGrand ? 700 : 600 }}>
                      {tc.key} – {resolveTriLangLabel(tc, lang, ["label"])}:
                    </td>
                    <td style={{
                      padding: "3px 8px", textAlign: "right",
                      fontWeight: isGrand ? 700 : 600,
                      fontSize: isGrand ? 15 : 13,
                    }}>
                      {fmtVND(v)} VNĐ
                    </td>
                  </tr>
                  {tc.show_words && (
                    <tr>
                      <td colSpan={2} style={{ padding: "2px 8px", fontStyle: "italic", color: "#555" }}>
                        Bằng chữ: {soThanhChu(v)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </Col>
    </Row>
  );
}

// ─── Header form (reads m_configs.table) ─────────────────────────────────────

function HeaderForm({
  fields, header, onChange, lang,
}: {
  fields: any[];
  header: OrderHeader;
  onChange: (key: string, val: any) => void;
  lang: string;
}) {
  if (!fields || fields.length === 0) return null;
  return (
    <Card title="Thông tin đơn hàng" size="small" style={{ marginBottom: 12 }}>
      <Row gutter={[12, 8]}>
        {fields
          .filter((f: any) => Number(f.f_show ?? 1) !== 0)
          .sort((a: any, b: any) => Number(a.f_stt ?? 0) - Number(b.f_stt ?? 0))
          .map((f: any) => {
            const name = String(f.f_name ?? "").toLowerCase();
            const label = resolveTriLangLabel(f, lang, ["f_header", "f_name"]);
            const types = String(f.f_types ?? "text").toLowerCase();
            const span = Number(f.f_width_col ?? 12);
            const val = header[name];
            let input: React.ReactNode;

            if (types.includes("select") || types.includes("cbo")) {
              const opts = String(f.f_options ?? "").split("|").map((o: string) => {
                const [value, label2] = o.split(":").map(s => s.trim());
                return { value, label: label2 ?? value };
              }).filter((o: any) => o.value);
              input = (
                <Select
                  style={{ width: "100%" }}
                  value={val}
                  options={opts}
                  onChange={v => onChange(name, v)}
                  allowClear
                />
              );
            } else if (types.includes("textarea") || types.includes("memo")) {
              input = (
                <TextArea
                  rows={2}
                  value={val ?? ""}
                  onChange={e => onChange(name, e.target.value)}
                />
              );
            } else if (types.includes("num") || types.includes("price")) {
              input = (
                <InputNumber
                  style={{ width: "100%" }}
                  value={val}
                  formatter={types.includes("price") ? (v) => fmtVND(Number(v)) : undefined}
                  onChange={v => onChange(name, v)}
                />
              );
            } else {
              input = (
                <Input
                  value={val ?? ""}
                  placeholder={f.f_placeholder ?? ""}
                  onChange={e => onChange(name, e.target.value)}
                />
              );
            }

            return (
              <Col key={name} xs={24} sm={span}>
                <div style={{ marginBottom: 2, fontSize: 12, color: "#555" }}>{label}</div>
                {input}
              </Col>
            );
          })}
      </Row>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CsmLineItemsEditor({
  m_configs, decrypt, initialValue, onSave,
}: CsmLineItemsEditorProps) {
  const { i18n } = useTranslation();
  const uiLang = i18n.language || "vi";
  const columns: LiColumnDef[] = m_configs.line_items_columns ?? [];
  const groupCfg: Required<LiGroupConfig> = {
    ...DEFAULT_GROUP_CFG,
    ...(m_configs.line_items_group ?? {}),
  };
  const totalConfigs = m_configs.line_items_totals ?? [];
  const printConfigs = m_configs.line_items_print ?? [];
  const headerFields: any[] = m_configs.table ?? [];

  const [header, setHeader] = useState<OrderHeader>(initialValue?.header ?? {});
  const [groups, setGroups] = useState<ProductGroup[]>(
    initialValue?.groups ?? [newGroup({ vat_default: groupCfg.vat_default })],
  );

  const calc: EditorCalcResult = useMemo(
    () => calcEditorTotals(groups, columns, totalConfigs),
    [groups, columns, totalConfigs],
  );

  // ── Header mutations ────────────────────────────────────────────────────────

  const updateHeader = useCallback((key: string, val: any) => {
    setHeader(prev => ({ ...prev, [key]: val }));
  }, []);

  // ── Group mutations ─────────────────────────────────────────────────────────

  const addGroup = useCallback(() => {
    setGroups(prev => [...prev, newGroup({ vat_default: groupCfg.vat_default })]);
  }, [groupCfg.vat_default]);

  const removeGroup = useCallback((id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  }, []);

  const updateGroup = useCallback((id: string, partial: Partial<ProductGroup>) => {
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, ...partial } : g)));
  }, []);

  // ── Item mutations ──────────────────────────────────────────────────────────

  const addItem = useCallback((gId: string) => {
    setGroups(prev => prev.map(g =>
      g.id === gId ? { ...g, items: [...g.items, newItem()] } : g,
    ));
  }, []);

  const removeItem = useCallback((gId: string, iKey: string) => {
    setGroups(prev => prev.map(g =>
      g.id === gId ? { ...g, items: g.items.filter(i => i.key !== iKey) } : g,
    ));
  }, []);

  const updateItem = useCallback((gId: string, iKey: string, field: string, val: any) => {
    setGroups(prev => prev.map(g =>
      g.id === gId
        ? { ...g, items: g.items.map(i => (i.key === iKey ? { ...i, [field]: val } : i)) }
        : g,
    ));
  }, []);

  // ── Print ───────────────────────────────────────────────────────────────────

  const handlePrint = useCallback(async (pc: (typeof printConfigs)[number]) => {
    const rawFn = m_configs.trigger?.[pc.trigger_key];
    if (!rawFn) {
      message.warning(`Chưa cấu hình trigger "${pc.trigger_key}" trong m_configs.trigger`);
      return;
    }
    // Decrypt if needed (same pattern as report_db in CsmReport)
    let fnBody = rawFn;
    if (decrypt) {
      try { fnBody = decrypt(rawFn) || rawFn; } catch { /* keep raw */ }
    }

    // Enrich groups with computed item values before passing to template
    const enrichedGroups = groups.map(g => ({
      ...g,
      items: g.items.map(item => ({
        ...computeRowValues(item, columns),
        key: item.key,
      })),
    })) as ProductGroup[];

    const html = evalPrintTemplate(fnBody, header, enrichedGroups, calc, printUtils);

    // Resolve filename
    let fileName = `document.pdf`;
    if (pc.filename_expr) {
      try {
        // eslint-disable-next-line no-new-func
        fileName = new Function("order", "calc", `return (${pc.filename_expr})`)(header, calc);
      } catch { /* keep default */ }
    }

    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1";
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
      await (html2pdf as any)()
        .set({
          margin: [8, 8, 8, 8],
          filename: fileName,
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(container.firstElementChild as HTMLElement)
        .save();
    } catch (e: any) {
      message.error("Lỗi xuất PDF: " + (e?.message ?? String(e)));
    } finally {
      document.body.removeChild(container);
    }
  }, [m_configs.trigger, decrypt, groups, columns, header, calc, printConfigs]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>

      {/* Action bar */}
      <Card size="small">
        <Space wrap>
          {onSave && (
            <Button
              type="primary" icon={<SaveOutlined />}
              onClick={() => onSave({ header, groups })}
            >
              Lưu
            </Button>
          )}
          {printConfigs.map(pc => (
            <Button
              key={pc.trigger_key}
              icon={<PrinterOutlined />}
              onClick={() => handlePrint(pc)}
            >
              {resolveTriLangLabel(pc, uiLang, ["label"])}
            </Button>
          ))}
        </Space>
      </Card>

      {/* Header fields — driven entirely by m_configs.table */}
      {headerFields.length > 0 && (
        <HeaderForm fields={headerFields} header={header} onChange={updateHeader} lang={uiLang} />
      )}

      {/* Line item groups */}
      <Card
        title="Sản phẩm"
        size="small"
        extra={
          columns.length === 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              Chưa cấu hình line_items_columns
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Công thức cột auto-calc đọc từ config — không cần sửa code khi thay đổi
            </Text>
          )
        }
      >
        {groups.map((group, gIdx) => (
          <GroupSection
            key={group.id}
            group={group}
            gIdx={gIdx}
            columns={columns}
            groupCfg={groupCfg}
            calc={calc}
            lang={uiLang}
            onUpdateGroup={updateGroup}
            onUpdateItem={updateItem}
            onAddItem={addItem}
            onRemoveItem={removeItem}
            onRemoveGroup={removeGroup}
          />
        ))}

        <Button icon={<PlusOutlined />} onClick={addGroup} style={{ marginBottom: 12 }}>
          Thêm nhóm sản phẩm
        </Button>

        {totalConfigs.length > 0 && (
          <>
            <Divider style={{ margin: "8px 0" }} />
            <TotalsDisplay calc={calc} totalConfigs={totalConfigs} lang={uiLang} />
          </>
        )}
      </Card>

    </Space>
  );
}
