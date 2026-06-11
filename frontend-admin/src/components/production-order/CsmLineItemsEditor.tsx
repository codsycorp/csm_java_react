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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Card, Col, Divider, Input, InputNumber,
  Row, Select, Space, Table, Typography, message,
} from "antd";
import { DeleteOutlined, PlusOutlined, PrinterOutlined, SaveOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import html2pdf from "html2pdf.js";
import { useTranslation } from "react-i18next";

import { getTableData } from "#src/components/csm-grid/CsmApi";
import type {
  LineItemsEditorConfig, LiColumnDef, LiGroupConfig,
  LineItem, ProductGroup, OrderHeader, EditorCalcResult,
} from "./types";
import { resolveTriLangLabel } from "./line-items-label";
import LineItemsHeaderForm from "./LineItemsHeaderForm";
import { collectComboTableFetchRequests } from "#src/components/csm-grid/combo-utils";
import { blockNonNumericKey } from "./line-items-field-utils";
import { useLineItemsTheme } from "./line-items-theme";
import "./line-items-editor.css";
import {
  computeRowValues, calcGroupResult, calcEditorTotals,
  evalPrintTemplate, evalCondition,
  soThanhChu, fmtVND, fmtNum, groupLabel,
  buildPrintUtils, buildAutoHeaderNumbers, validateLineItemsHeader,
  formatNgay, normalizeNgayString,
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
  subtotal_label: "Cộng nhóm {{group}} – chưa VAT {{vat}}%",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CsmLineItemsEditorProps {
  m_configs: LineItemsEditorConfig;
  appId?: string;
  decrypt?: (s: string) => string;
  initialValue?: { header?: OrderHeader; groups?: ProductGroup[] };
  existingRows?: Record<string, any>[];
  recordPk?: string;
  pkField?: string;
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
        controls={false}
        value={value}
        min={0}
        step={col.type === "formula_or_manual" ? 0.01 : 1}
        parser={(v) => {
          const cleaned = String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
          return cleaned === "" ? null : Number(cleaned);
        }}
        onKeyDown={(e) => blockNonNumericKey(e, true)}
        onChange={v => onChange(v ?? null)}
      />
    );
  }

  if (col.type === "price") {
    return (
      <InputNumber
        size="small"
        style={{ width: col.width ? col.width - 4 : 110 }}
        controls={false}
        value={value}
        min={0}
        step={1000}
        formatter={(v) => v != null ? fmtVND(Number(v)) : ""}
        parser={(v: string | undefined) => (v ? parseInt(v.replace(/\D/g, ""), 10) || 0 : 0) as any}
        onKeyDown={(e) => blockNonNumericKey(e, false)}
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
  subtotalTemplate?: string;
  onUpdateGroup: (id: string, partial: Partial<ProductGroup>) => void;
  onUpdateItem: (gId: string, iKey: string, field: string, val: any) => void;
  onAddItem: (gId: string) => void;
  onRemoveItem: (gId: string, iKey: string) => void;
  onRemoveGroup: (id: string) => void;
}

const GroupSection = React.memo(function GroupSection({
  group, gIdx, columns, groupCfg, calc, lang, subtotalTemplate,
  onUpdateGroup, onUpdateItem, onAddItem, onRemoveItem, onRemoveGroup,
}: GroupSectionProps) {
  const liTheme = useLineItemsTheme();
  const { inheritText, groupCard, groupTitle } = liTheme;
  const label = groupLabel(gIdx);
  const gc = calc.groups[group.id];
  const subtotalText = (subtotalTemplate || groupCfg.subtotal_label || "Cộng nhóm {{group}} – chưa VAT {{vat}}%")
    .replace(/\{\{group\}\}/g, label)
    .replace(/\{\{vat\}\}/g, String(group.vat_rate ?? ""));

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
    <Table.Summary.Row className="csm-li-accent-summary">
      <Table.Summary.Cell index={0} colSpan={2} align="left">
        <Text strong style={inheritText}>{subtotalText}</Text>
      </Table.Summary.Cell>
      {columns.filter(c => !c.hidden).map((col, ci) => {
        let content: React.ReactNode = null;
        if (col.name === soTamCol?.name) content = <Text strong style={inheritText}>{gc?.so_tam ?? 0}</Text>;
        else if (col.name === klCol?.name) content = <Text strong style={inheritText}>{fmtNum(gc?.kl)}</Text>;
        else if (col.name === ttCol?.name) content = <Text strong style={inheritText}>{fmtVND(gc?.sum)}</Text>;
        else if (col.type === "price" && gc?.uniform_price != null)
          content = <Text style={inheritText}>{fmtVND(gc.uniform_price)}</Text>;
        return (
          <Table.Summary.Cell key={ci} index={ci + 2} align={(col.align ?? "left") as any}>
            {content}
          </Table.Summary.Cell>
        );
      })}
      <Table.Summary.Cell index={columns.length + 2} />
    </Table.Summary.Row>
  ), [gc, columns, klCol, ttCol, soTamCol, subtotalText, inheritText]);

  return (
    <Card
      size="small"
      style={groupCard}
      styles={{ body: { paddingTop: 8 } }}
      title={
        <Space>
          <Text strong style={groupTitle}>{label}.</Text>
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
  const { accentRow, accentCell, totalsTable, totalsWords, token } = useLineItemsTheme();
  return (
    <Row justify="end" style={{ marginTop: 8 }}>
      <Col>
        <table style={totalsTable}>
          <tbody>
            {totalConfigs.map(tc => {
              const v = calc.totals[tc.key] ?? 0;
              const isGrand = tc.highlight;
              const rowStyle = isGrand ? accentRow : { color: token.colorText };
              const cellStyle = {
                ...(isGrand ? accentCell : { color: token.colorText, fontWeight: 600 }),
                padding: isGrand ? "4px 8px" : "3px 8px",
              } as const;
              return (
                <React.Fragment key={tc.key}>
                  <tr style={rowStyle}>
                    <td style={cellStyle}>
                      {tc.key} – {resolveTriLangLabel(tc, lang, ["label"])}:
                    </td>
                    <td style={{
                      ...cellStyle,
                      textAlign: "right" as const,
                      fontSize: isGrand ? 15 : 13,
                      fontWeight: isGrand ? 700 : 600,
                    }}>
                      {fmtVND(v)} VNĐ
                    </td>
                  </tr>
                  {tc.show_words && (
                    <tr>
                      <td colSpan={2} style={totalsWords}>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function CsmLineItemsEditor({
  m_configs, appId, decrypt, initialValue, onSave,
  existingRows = [], recordPk, pkField = "id",
}: CsmLineItemsEditorProps) {
  const { i18n } = useTranslation();
  const uiLang = i18n.language || "vi";
  const columns: LiColumnDef[] = m_configs.line_items_columns ?? [];
  const groupCfg: Required<LiGroupConfig> = {
    ...DEFAULT_GROUP_CFG,
    ...(m_configs.line_items_group ?? {}),
  };
  const totalConfigs = m_configs.line_items_totals ?? [];
  const uiConfig = m_configs.line_items_ui ?? {};
  const printKeys = uiConfig.print_keys;
  const printConfigs = (m_configs.line_items_print ?? []).filter(
    p => !printKeys?.length || printKeys.includes(String(p.trigger_key ?? "")),
  );
  const headerFields: any[] = m_configs.table ?? [];

  const [header, setHeader] = useState<OrderHeader>(initialValue?.header ?? {});
  const [groups, setGroups] = useState<ProductGroup[]>(
    initialValue?.groups ?? [newGroup({ vat_default: groupCfg.vat_default })],
  );
  const [comboData, setComboData] = useState<Record<string, Record<string, any>[]>>({});
  const [printSettings, setPrintSettings] = useState<Record<string, any>>({});
  const manualNumbersRef = useRef({
    so_bao_gia: Boolean(initialValue?.header?.so_bao_gia),
    so_lenh: Boolean(initialValue?.header?.so_lenh),
    hieu_luc_den: Boolean(initialValue?.header?.hieu_luc_den),
  });

  const applyAutoNumbers = useCallback((ngay: string, prev: OrderHeader): OrderHeader => {
    const norm = normalizeNgayString(ngay);
    if (!norm) return prev;
    const auto = buildAutoHeaderNumbers(norm, existingRows, { excludePk: recordPk, pkField });
    const next: OrderHeader = { ...prev, ngay: norm };
    if (!manualNumbersRef.current.so_bao_gia) next.so_bao_gia = auto.so_bao_gia;
    if (!manualNumbersRef.current.so_lenh) next.so_lenh = auto.so_lenh;
    if (!manualNumbersRef.current.hieu_luc_den) next.hieu_luc_den = auto.hieu_luc_den;
    if (!next.phien_ban) next.phien_ban = "E1";
    return next;
  }, [existingRows, recordPk, pkField]);

  useEffect(() => {
    if (recordPk) return;
    setHeader((prev) => {
      const ngay = normalizeNgayString(String(prev.ngay ?? "")) ?? formatNgay(new Date());
      return applyAutoNumbers(ngay, prev);
    });
  }, [recordPk, existingRows, applyAutoNumbers]);

  const comboFetchRequests = useMemo(
    () => collectComboTableFetchRequests(headerFields, { fallbackAppId: appId }),
    [headerFields, appId],
  );

  useEffect(() => {
    if (!appId) return;
    const seen = new Set<string>();
    const tables = [
      ...comboFetchRequests.map((r) => ({ tableName: r.tableName, where: r.whereClause })),
      { tableName: "pm_cai_dat", where: undefined },
    ].filter(({ tableName }) => {
      if (!tableName || seen.has(tableName)) return false;
      seen.add(tableName);
      return true;
    });
    Promise.all(
      tables.map(({ tableName, where }) =>
        getTableData<any>({ app_id: appId, obj_name: tableName, where })
          .then((res) => {
            const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
            return { tableName, rows };
          })
          .catch(() => ({ tableName, rows: [] as Record<string, any>[] })),
      ),
    ).then((results) => {
      const next: Record<string, Record<string, any>[]> = {};
      for (const { tableName, rows } of results) {
        next[tableName] = rows;
        if (tableName === "pm_cai_dat" && rows[0]) setPrintSettings(rows[0]);
      }
      setComboData(next);
    });
  }, [appId, comboFetchRequests]);

  const calc: EditorCalcResult = useMemo(
    () => calcEditorTotals(groups, columns, totalConfigs),
    [groups, columns, totalConfigs],
  );

  // ── Header mutations ────────────────────────────────────────────────────────

  const updateHeader = useCallback((key: string, val: any) => {
    if (key === "so_bao_gia" || key === "so_lenh" || key === "hieu_luc_den") {
      manualNumbersRef.current[key] = true;
    }
    setHeader(prev => {
      if (key === "ngay") {
        return applyAutoNumbers(String(val ?? ""), { ...prev, ngay: val });
      }
      return { ...prev, [key]: val };
    });
  }, [applyAutoNumbers]);

  const patchHeader = useCallback((patch: OrderHeader) => {
    setHeader(prev => ({ ...prev, ...patch }));
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
      message.warning(`Chưa cấu hình mẫu in "${resolveTriLangLabel(pc, uiLang, ["label"]) || pc.trigger_key}"`);
      return;
    }
    let fnBody = rawFn;
    if (decrypt) {
      try { fnBody = decrypt(rawFn) || rawFn; } catch { /* keep raw */ }
    }

    let settings = printSettings;
    if (appId) {
      try {
        const res = await getTableData<any>({ app_id: appId, obj_name: "pm_cai_dat" });
        const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
        if (rows[0]) settings = rows[0];
      } catch { /* use cached */ }
    }

    const enrichedGroups = groups.map(g => ({
      ...g,
      items: g.items.map(item => ({
        ...computeRowValues(item, columns),
        key: item.key,
      })),
    })) as ProductGroup[];

    const html = evalPrintTemplate(
      fnBody,
      header,
      enrichedGroups,
      calc,
      buildPrintUtils(settings, { totalConfigs, lang: uiLang }),
    );

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
  }, [m_configs.trigger, decrypt, groups, columns, header, calc, printConfigs, appId, printSettings, totalConfigs, uiLang]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>

      {/* Action bar */}
      <Card size="small">
        <Space wrap>
          {onSave && (
            <Button
              type="primary" icon={<SaveOutlined />}
              onClick={() => {
                const check = validateLineItemsHeader(header, existingRows, headerFields, {
                  excludePk: recordPk,
                  pkField,
                });
                if (!check.ok) {
                  message.error(check.message ?? "Dữ liệu không hợp lệ");
                  return;
                }
                onSave({ header, groups });
              }}
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
        <LineItemsHeaderForm
          fields={headerFields}
          header={header}
          onChange={updateHeader}
          onPatch={patchHeader}
          lang={uiLang}
          ui={uiConfig}
          comboData={comboData}
        />
      )}

      {/* Line item groups */}
      <Card
        title="Sản phẩm"
        size="small"
        extra={
          columns.length === 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              Chưa có cột sản phẩm
            </Text>
          ) : undefined
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
            subtotalTemplate={groupCfg.subtotal_label}
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
