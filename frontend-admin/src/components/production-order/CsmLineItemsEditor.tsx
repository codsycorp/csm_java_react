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
  AutoComplete, Button, Card, Col, Divider, Input, InputNumber,
  Modal, Row, Select, Space, Table, Typography, message,
} from "antd";
import { DeleteOutlined, EyeOutlined, PlusOutlined, PrinterOutlined, SaveOutlined, StepForwardOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";

import { getTableData } from "#src/components/csm-grid/CsmApi";
import { resolveTriggerBody } from "#src/components/csm-grid/csm-trigger-runner";
import type {
  LineItemsEditorConfig, LiColumnDef, LiGroupConfig,
  LineItem, ProductGroup, OrderHeader, EditorCalcResult,
} from "./types";
import { resolveTriLangLabel } from "./line-items-label";
import LineItemsHeaderForm from "./LineItemsHeaderForm";
import { collectComboTableFetchRequests } from "#src/components/csm-grid/combo-utils";
import { blockNonNumericKey, collectAutoFieldNames } from "./line-items-field-utils";
import { useLineItemsTheme } from "./line-items-theme";
import "./line-items-editor.css";
import {
  computeRowValues, calcGroupResult, calcEditorTotals,
  evalPrintTemplate, evalCondition,
  soThanhChu, fmtVND, fmtNum, groupLabel,
  buildPrintUtils, buildAutoHeaderValues, validateLineItemsHeader,
  resolveDateRefField,
  formatNgay, normalizeNgayString,
  newItem, newGroup,
} from "./utils";
import { useUserStore } from "#src/store";
import {
  fetchSysAppRow,
  mergePrintCompanySettings,
  resolveTenantAppIdForPrint,
} from "./line-items-company";
import {
  exportHtmlToPdf,
  printHtmlInBrowser,
  validatePrintHtml,
} from "./line-items-print";
import {
  applyWorkflowPromotion,
  resolveWorkflowPromoteLabel,
  resolveWorkflowStageField,
  resolveWorkflowStep,
  validateWorkflowPromotion,
} from "./line-items-workflow";
import { extractGroupsFromRow } from "./line-items-storage";

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
  specHistoryOptions: string[];
  onUpdateGroup: (id: string, partial: Partial<ProductGroup>) => void;
  onUpdateItem: (gId: string, iKey: string, field: string, val: any) => void;
  onAddItem: (gId: string) => void;
  onRemoveItem: (gId: string, iKey: string) => void;
  onRemoveGroup: (id: string) => void;
}

const GroupSection = React.memo(function GroupSection({
  group, gIdx, columns, groupCfg, calc, lang, subtotalTemplate,
  specHistoryOptions,
  onUpdateGroup, onUpdateItem, onAddItem, onRemoveItem, onRemoveGroup,
}: GroupSectionProps) {
  const liTheme = useLineItemsTheme();
  const { inheritText, groupCard, groupTitle } = liTheme;
  const label = groupLabel(gIdx);
  const gc = calc.groups[group.id];
  const subtotalText = (subtotalTemplate || groupCfg.subtotal_label || "Cộng nhóm {{group}} – chưa VAT {{vat}}%")
    .replace(/\{\{group\}\}/g, label)
    .replace(/\{\{vat\}\}/g, String(group.vat_rate ?? ""));
  const specAutocompleteOptions = useMemo(() => {
    const query = String(group.spec || "").trim().toLowerCase();
    return specHistoryOptions
      .filter((item) => {
        if (!query || query.length < 2) return true;
        return item.toLowerCase().includes(query);
      })
      .slice(0, 20)
      .map((item) => ({
        value: item,
        label: item.replace(/\s+/g, " ").trim().slice(0, 120),
      }));
  }, [group.spec, specHistoryOptions]);

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
      <AutoComplete
        options={specAutocompleteOptions}
        filterOption={false}
        onSelect={(next) => onUpdateGroup(group.id, { spec: next })}
        dropdownMatchSelectWidth={false}
      >
        <TextArea
          rows={4}
          value={group.spec}
          placeholder={`Tên và quy cách kỹ thuật nhóm ${label}\nVí dụ: PANEL PUR VÁCH TRONG...\n* Mặt thứ nhất: ...\n* Lớp giữa: ...`}
          onChange={e => onUpdateGroup(group.id, { spec: e.target.value })}
          style={{ marginBottom: 8, fontFamily: "monospace", fontSize: 12 }}
        />
      </AutoComplete>
      {specAutocompleteOptions.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: 12, color: "var(--ant-colorTextDescription)" }}>
          Gợi ý nhanh từ báo giá cũ: nhập vài ký tự để lọc rồi chọn.
        </div>
      )}

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
  const userAppId = useUserStore(state => state.app_id);
  const userAppToken = useUserStore(state => state.app_token);
  const userMenus = useUserStore(state => state.menusPermissions);
  const userDev = useUserStore(state => state.dev);
  const tenantAppId = useMemo(
    () => resolveTenantAppIdForPrint(appId, {
      app_id: userAppId,
      app_token: userAppToken,
      menusPermissions: userMenus,
      dev: userDev,
    }, decrypt),
    [appId, userAppId, userAppToken, userMenus, userDev, decrypt],
  );
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
  const autoFieldNames = useMemo(() => collectAutoFieldNames(headerFields), [headerFields]);
  const dateRefField = useMemo(
    () => resolveDateRefField(headerFields, uiConfig),
    [headerFields, uiConfig],
  );
  const engineCtx = useMemo(
    () => ({ triggers: m_configs.trigger, decrypt }),
    [m_configs.trigger, decrypt],
  );

  const [header, setHeader] = useState<OrderHeader>(initialValue?.header ?? {});
  const [groups, setGroups] = useState<ProductGroup[]>(
    initialValue?.groups ?? [newGroup({ vat_default: groupCfg.vat_default })],
  );
  const [comboData, setComboData] = useState<Record<string, Record<string, any>[]>>({});
  const [printSettings, setPrintSettings] = useState<Record<string, any>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewFileName, setPreviewFileName] = useState("document.pdf");
  const [previewLabel, setPreviewLabel] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const currentCustomerCode = useMemo(() => {
    const raw = header?.ma_kh ?? header?.khach_hang_id ?? "";
    return String(raw || "").trim().toLowerCase();
  }, [header?.khach_hang_id, header?.ma_kh]);
  const specHistoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const matchedByCustomer: string[] = [];
    const fallback: string[] = [];
    for (let i = existingRows.length - 1; i >= 0; i -= 1) {
      const row = existingRows[i] || {};
      const rowCustomerCode = String(row?.ma_kh ?? row?.khach_hang_id ?? "").trim().toLowerCase();
      const isSameCustomer = Boolean(currentCustomerCode) && rowCustomerCode === currentCustomerCode;
      const groupsInRow = extractGroupsFromRow(row, m_configs);
      groupsInRow.forEach((g) => {
        const text = String(g?.spec || "").trim();
        if (!text) return;
        const normalized = text.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        if (isSameCustomer) {
          matchedByCustomer.push(text);
        } else {
          fallback.push(text);
        }
      });
      if (matchedByCustomer.length + fallback.length >= 120) break;
    }
    return [...matchedByCustomer, ...fallback];
  }, [currentCustomerCode, existingRows, m_configs]);
  const manualNumbersRef = useRef<Record<string, boolean>>(
    Object.fromEntries(autoFieldNames.map((n) => [n, Boolean(initialValue?.header?.[n])])),
  );

  const workflow = m_configs.line_items_workflow;
  const stageField = resolveWorkflowStageField(workflow);
  const currentStage = String(header[stageField] ?? "");
  const currentWorkflowStep = useMemo(
    () => resolveWorkflowStep(workflow, currentStage),
    [workflow, currentStage],
  );
  const promoteLabel = useMemo(
    () => resolveWorkflowPromoteLabel(currentWorkflowStep, uiLang),
    [currentWorkflowStep, uiLang],
  );

  const handleWorkflowPromote = useCallback(() => {
    const check = validateWorkflowPromotion(header, currentWorkflowStep, headerFields);
    if (!check.ok) {
      message.warning(check.message ?? "Không thể chuyển bước");
      return;
    }
    const nextHeader = applyWorkflowPromotion(header, workflow, currentStage);
    if (!nextHeader) {
      message.info("Đã ở bước cuối quy trình");
      return;
    }
    setHeader(nextHeader);
    message.success(`Đã chuyển sang "${nextHeader[stageField]}" — nhớ Lưu để ghi DB`);
  }, [currentStage, currentWorkflowStep, header, headerFields, stageField, workflow]);

  const applyAutoNumbers = useCallback((ngay: string, prev: OrderHeader): OrderHeader => {
    const norm = normalizeNgayString(ngay);
    if (!norm) return prev;
    const baseHeader = { ...prev, [dateRefField]: norm };
    const auto = buildAutoHeaderValues(headerFields, baseHeader, existingRows, {
      excludePk: recordPk,
      pkField,
      ui: uiConfig,
      engineCtx,
    });
    const next: OrderHeader = { ...baseHeader };
    for (const [key, val] of Object.entries(auto)) {
      if (!manualNumbersRef.current[key]) next[key] = val;
    }
    return next;
  }, [dateRefField, existingRows, headerFields, pkField, recordPk, uiConfig, engineCtx]);

  useEffect(() => {
    if (recordPk) return;
    setHeader((prev) => {
      const ngay = normalizeNgayString(String(prev[dateRefField] ?? prev.ngay ?? "")) ?? formatNgay(new Date());
      return applyAutoNumbers(ngay, prev);
    });
  }, [recordPk, existingRows, applyAutoNumbers, dateRefField]);

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
    Promise.all([
      ...tables.map(({ tableName, where }) =>
        getTableData<any>({ app_id: appId, obj_name: tableName, where })
          .then((res) => {
            const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
            return { tableName, rows: Array.isArray(rows) ? rows : [] };
          })
          .catch(() => ({ tableName, rows: [] as Record<string, any>[] })),
      ),
      fetchSysAppRow(tenantAppId),
    ]).then((results) => {
      const next: Record<string, Record<string, any>[]> = {};
      let pmRow: Record<string, any> = {};
      let sysAppRow: Record<string, any> | null = null;
      for (const item of results) {
        if (item && typeof item === "object" && "tableName" in item) {
          const { tableName, rows } = item as { tableName: string; rows: Record<string, any>[] };
          next[tableName] = rows;
          if (tableName === "pm_cai_dat" && rows[0]) pmRow = rows[0];
        } else if (item && typeof item === "object" && !Array.isArray(item)) {
          sysAppRow = item as Record<string, any>;
        }
      }
      setComboData(next);
      setPrintSettings(mergePrintCompanySettings(pmRow, sysAppRow));
    });
  }, [appId, comboFetchRequests, tenantAppId]);

  const calc: EditorCalcResult = useMemo(
    () => calcEditorTotals(groups, columns, totalConfigs),
    [groups, columns, totalConfigs],
  );

  // ── Header mutations ────────────────────────────────────────────────────────

  const updateHeader = useCallback((key: string, val: any) => {
    const k = key.toLowerCase();
    if (autoFieldNames.includes(k)) {
      manualNumbersRef.current[k] = true;
    }
    setHeader(prev => {
      if (k === dateRefField) {
        return applyAutoNumbers(String(val ?? ""), { ...prev, [k]: val });
      }
      return { ...prev, [key]: val };
    });
  }, [applyAutoNumbers, autoFieldNames, dateRefField]);

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

  /** Excel: trong nhóm chia sẻ ĐVT / hệ số (m²) / đơn giá ($I$12). */
  const updateItem = useCallback((gId: string, iKey: string, field: string, val: any) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== gId) return g;
      if (field === "don_vi") {
        return { ...g, items: g.items.map(i => ({ ...i, don_vi: val })) };
      }
      if (field === "chieu_rong") {
        return {
          ...g,
          items: g.items.map(i =>
            (i.don_vi === "m" ? i : { ...i, chieu_rong: val }),
          ),
        };
      }
      if (field === "don_gia") {
        const allSame = g.items.every(i => i.don_gia == null || i.don_gia === val);
        if (allSame) {
          return { ...g, items: g.items.map(i => ({ ...i, don_gia: val })) };
        }
      }
      return {
        ...g,
        items: g.items.map(i => (i.key === iKey ? { ...i, [field]: val } : i)),
      };
    }));
  }, []);

  // ── Print ───────────────────────────────────────────────────────────────────

  const buildPrintHtml = useCallback(async (pc: (typeof printConfigs)[number]) => {
    const rawFn = m_configs.trigger?.[pc.trigger_key];
    if (!rawFn) {
      return { ok: false as const, message: `Chưa cấu hình mẫu in "${resolveTriLangLabel(pc, uiLang, ["label"]) || pc.trigger_key}"` };
    }
    const fnBody = resolveTriggerBody(rawFn, decrypt);

    let settings = printSettings;
    if (appId) {
      try {
        const [pmRes, sysAppRow] = await Promise.all([
          getTableData<any>({ app_id: appId, obj_name: "pm_cai_dat" }).catch(() => null),
          fetchSysAppRow(tenantAppId),
        ]);
        const pmRows = pmRes
          ? (Array.isArray(pmRes?.rows) ? pmRes.rows : (Array.isArray(pmRes) ? pmRes : []))
          : [];
        settings = mergePrintCompanySettings(pmRows[0] ?? {}, sysAppRow);
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
      buildPrintUtils(settings, {
        totalConfigs,
        lang: uiLang,
        lineItemsColumns: columns,
        printTableOpts: pc.print_table ?? {},
      }),
    );

    const check = validatePrintHtml(html);
    if (!check.ok) return { ok: false as const, message: check.message };

    let fileName = "document.pdf";
    if (pc.filename_expr) {
      try {
        // eslint-disable-next-line no-new-func
        fileName = new Function("order", "calc", `return (${pc.filename_expr})`)(header, calc);
      } catch { /* keep default */ }
    }

    return { ok: true as const, html, fileName };
  }, [m_configs.trigger, decrypt, groups, columns, header, calc, printSettings, appId, tenantAppId, totalConfigs, uiLang]);

  const handleOpenPrintPreview = useCallback(async (pc: (typeof printConfigs)[number]) => {
    setPreviewLoading(true);
    try {
      const result = await buildPrintHtml(pc);
      if (!result.ok) {
        message.warning(result.message ?? "Không tạo được bản xem trước");
        return;
      }
      setPreviewHtml(result.html);
      setPreviewFileName(result.fileName);
      setPreviewLabel(resolveTriLangLabel(pc, uiLang, ["label"]) || pc.trigger_key);
      setPreviewOpen(true);
    } catch (e: any) {
      message.error("Lỗi tạo bản xem trước: " + (e?.message ?? String(e)));
    } finally {
      setPreviewLoading(false);
    }
  }, [buildPrintHtml, uiLang]);

  const handleExportPreviewPdf = useCallback(async () => {
    setExportLoading(true);
    try {
      await exportHtmlToPdf(previewHtml, previewFileName);
      message.success("Đã xuất PDF");
    } catch (e: any) {
      message.error("Lỗi xuất PDF: " + (e?.message ?? String(e)));
    } finally {
      setExportLoading(false);
    }
  }, [previewHtml, previewFileName]);

  const handlePreviewBrowserPrint = useCallback(() => {
    try {
      printHtmlInBrowser(previewHtml);
    } catch (e: any) {
      message.error("Lỗi in: " + (e?.message ?? String(e)));
    }
  }, [previewHtml]);

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
                  engineCtx,
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
          {currentWorkflowStep?.next && promoteLabel && (
            <Button icon={<StepForwardOutlined />} onClick={handleWorkflowPromote}>
              {promoteLabel}
            </Button>
          )}
          {printConfigs.map(pc => (
            <Button
              key={pc.trigger_key}
              icon={<EyeOutlined />}
              loading={previewLoading}
              onClick={() => handleOpenPrintPreview(pc)}
            >
              {resolveTriLangLabel(pc, uiLang, ["label"])}
            </Button>
          ))}
        </Space>
      </Card>

      <Modal
        title={`Xem trước — ${previewLabel}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width={900}
        destroyOnClose
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>
            Đóng
          </Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={handlePreviewBrowserPrint}>
            In
          </Button>,
          <Button
            key="pdf"
            type="primary"
            icon={<PrinterOutlined />}
            loading={exportLoading}
            onClick={handleExportPreviewPdf}
          >
            Xuất PDF
          </Button>,
        ]}
      >
        <iframe
          title="print-preview"
          srcDoc={previewHtml}
          style={{
            width: "100%",
            height: "72vh",
            border: "1px solid #d9d9d9",
            background: "#fff",
          }}
        />
      </Modal>

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
          engineCtx={engineCtx}
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
            specHistoryOptions={specHistoryOptions}
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
