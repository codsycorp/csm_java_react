// @ts-nocheck — legacy hardcoded reference; use CsmLineItemsEditor + m_configs instead.
import React, { useCallback, useMemo, useState } from "react";
import {
  Button, Card, Col, Divider, Input, InputNumber,
  Row, Select, Space, Table, Typography, message,
} from "antd";
import { DeleteOutlined, PlusOutlined, PrinterOutlined, SaveOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import html2pdf from "html2pdf.js";

import type { LineItem, ProductGroup, ProductionOrder, OrderCalc } from "./types";
import {
  calcItemKL, calcItemTT, calcGroupTotals, calcOrderTotals,
  groupLabel, soThanhChu, fmtVND, fmtNum,
  newItem, newGroup, defaultOrder,
} from "./utils";
import { buildBaoGiaHtml, buildLenhSXHtml, buildPXKHtml } from "./printTemplates";
import { useLineItemsTheme } from "./line-items-theme";
import "./line-items-editor.css";

const { TextArea } = Input;
const { Text } = Typography;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialValue?: ProductionOrder;
  onSave?: (order: ProductionOrder) => void;
}

// ─── Sub: item columns factory ────────────────────────────────────────────────

function makeItemColumns(
  groupId: string,
  onUpdate: (gId: string, iKey: string, partial: Partial<LineItem>) => void,
  onRemove: (gId: string, iKey: string) => void,
): ColumnsType<LineItem> {
  const up = (iKey: string, partial: Partial<LineItem>) => onUpdate(groupId, iKey, partial);

  return [
    {
      title: "TT", width: 42, align: "center",
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: "Tên sản phẩm / Quy cách",
      dataIndex: "ten_sp",
      render: (val: string, item: LineItem) => (
        <Input
          size="small" value={val}
          onChange={e => up(item.key, { ten_sp: e.target.value })}
        />
      ),
    },
    {
      title: "ĐV", dataIndex: "don_vi", width: 68,
      render: (val: string, item: LineItem) => (
        <Select
          size="small" style={{ width: 65 }}
          value={val || "m2"}
          options={[
            { value: "m2", label: "m²" },
            { value: "m", label: "m" },
            { value: "cái", label: "cái" },
          ]}
          onChange={v => up(item.key, { don_vi: v })}
        />
      ),
    },
    {
      title: "Chiều rộng / Hệ số", dataIndex: "chieu_rong", width: 90,
      render: (val: number | null, item: LineItem) => (
        <InputNumber
          size="small" style={{ width: 86 }}
          value={val} min={0} step={0.01}
          onChange={v => up(item.key, { chieu_rong: v ?? null })}
        />
      ),
    },
    {
      title: "Chiều dài (m)", dataIndex: "chieu_dai", width: 88,
      render: (val: number | null, item: LineItem) => (
        <InputNumber
          size="small" style={{ width: 84 }}
          value={val} min={0} step={0.1}
          onChange={v => up(item.key, { chieu_dai: v ?? null })}
        />
      ),
    },
    {
      title: "Số tấm", dataIndex: "so_tam", width: 74,
      render: (val: number | null, item: LineItem) => (
        <InputNumber
          size="small" style={{ width: 70 }}
          value={val} min={0}
          onChange={v => up(item.key, { so_tam: v ?? null })}
        />
      ),
    },
    {
      title: "Khối lượng", width: 96, align: "right",
      render: (_: any, item: LineItem) => {
        const isManual = item.chieu_dai == null && item.so_tam == null;
        if (isManual) {
          return (
            <InputNumber
              size="small" style={{ width: 88 }}
              value={item.khoi_luong} min={0} step={0.1}
              placeholder="Nhập tay"
              onChange={v => up(item.key, { khoi_luong: v ?? null })}
            />
          );
        }
        return <Text>{fmtNum(calcItemKL(item))}</Text>;
      },
    },
    {
      title: "Đơn giá (VNĐ)", dataIndex: "don_gia", width: 120, align: "right",
      render: (val: number | null, item: LineItem) => (
        <InputNumber
          size="small" style={{ width: 116 }}
          value={val} min={0} step={1000}
          formatter={(v) => v != null ? fmtVND(v) : ""}
          parser={(v: string | undefined) => (v ? parseInt(v.replace(/\D/g, ""), 10) || 0 : 0) as any}
          onChange={v => up(item.key, { don_gia: v ?? null })}
        />
      ),
    },
    {
      title: "Thành tiền (VNĐ)", width: 120, align: "right",
      render: (_: any, item: LineItem) => (
        <Text strong>{fmtVND(calcItemTT(item))}</Text>
      ),
    },
    {
      title: "", width: 36, align: "center",
      render: (_: any, item: LineItem) => (
        <Button
          type="text" danger icon={<DeleteOutlined />} size="small"
          onClick={() => onRemove(groupId, item.key)}
        />
      ),
    },
  ];
}

// ─── Sub: Group section ───────────────────────────────────────────────────────

interface GroupSectionProps {
  group: ProductGroup;
  gIdx: number;
  calc: OrderCalc;
  onUpdateGroup: (gId: string, partial: Partial<ProductGroup>) => void;
  onAddItem: (gId: string) => void;
  onRemoveItem: (gId: string, iKey: string) => void;
  onUpdateItem: (gId: string, iKey: string, partial: Partial<LineItem>) => void;
  onRemoveGroup: (gId: string) => void;
}

const GroupSection = React.memo(function GroupSection({
  group, gIdx, calc,
  onUpdateGroup, onAddItem, onRemoveItem, onUpdateItem, onRemoveGroup,
}: GroupSectionProps) {
  const { inheritText, groupCard, groupTitle } = useLineItemsTheme();
  const label = groupLabel(gIdx);
  const gc = calc.groups[group.id];

  const columns = useMemo(
    () => makeItemColumns(group.id, onUpdateItem, onRemoveItem),
    [group.id, onUpdateItem, onRemoveItem],
  );

  const summary = useCallback(() => (
    <Table.Summary.Row className="csm-li-accent-summary">
      <Table.Summary.Cell index={0} colSpan={2} align="left">
        <Text strong style={inheritText}>Cộng nhóm {label} – chưa VAT {group.vat_rate}%</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2} />
      <Table.Summary.Cell index={3} />
      <Table.Summary.Cell index={4} />
      <Table.Summary.Cell index={5} align="right">
        <Text strong style={inheritText}>{gc ? gc.so_tam : 0}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={6} align="right">
        <Text strong style={inheritText}>{gc ? fmtNum(gc.khoi_luong) : 0}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={7} align="right">
        <Text style={inheritText}>{gc?.uniform_don_gia != null ? fmtVND(gc.uniform_don_gia) : ""}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={8} align="right">
        <Text strong style={inheritText}>{gc ? fmtVND(gc.thanh_tien) : 0}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={9} />
    </Table.Summary.Row>
  ), [gc, group.vat_rate, label, inheritText]);

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
            onChange={v => onUpdateGroup(group.id, { vat_rate: v })}
            options={[
              { value: 8, label: "VAT 8%" },
              { value: 10, label: "VAT 10%" },
            ]}
          />
        </Space>
      }
      extra={
        <Button
          type="text" danger icon={<DeleteOutlined />} size="small"
          onClick={() => onRemoveGroup(group.id)}
        >
          Xoá nhóm
        </Button>
      }
    >
      <TextArea
        rows={4}
        value={group.spec}
        placeholder={`Tên và quy cách kỹ thuật nhóm ${label}\nVí dụ: PANEL PUR VÁCH TRONG (TÔN + PU + TÔN):\n* Mặt thứ nhất: ...\n* Lớp giữa: ...`}
        onChange={e => onUpdateGroup(group.id, { spec: e.target.value })}
        style={{ marginBottom: 8, fontFamily: "monospace", fontSize: 12 }}
      />

      <Table<LineItem>
        size="small"
        dataSource={group.items}
        columns={columns}
        rowKey="key"
        pagination={false}
        scroll={{ x: 900 }}
        summary={summary}
      />

      <Button
        icon={<PlusOutlined />}
        size="small"
        onClick={() => onAddItem(group.id)}
        style={{ marginTop: 8 }}
      >
        Thêm dòng
      </Button>
    </Card>
  );
});

// ─── Sub: Order totals display ────────────────────────────────────────────────

function OrderTotalsDisplay({ calc }: { calc: OrderCalc }) {
  const { accentRow, accentCell, totalsTable, totalsWords, token } = useLineItemsTheme();
  const bangChu = useMemo(() => soThanhChu(calc.D), [calc.D]);
  const normalCell = { padding: "3px 8px", fontWeight: 600, color: token.colorText } as const;
  return (
    <Row justify="end" style={{ marginTop: 8 }}>
      <Col>
        <table style={{ ...totalsTable, minWidth: 340 }}>
          <tbody>
            {([
              ["A", "Tổng giá trị hàng hoá chưa VAT", calc.A],
              ["B", "Tiền VAT 8%", calc.B],
              ["C", "Tiền VAT 10%", calc.C],
            ] as [string, string, number][]).map(([k, lbl, v]) => (
              <tr key={k}>
                <td style={normalCell}>{k} – {lbl}:</td>
                <td style={{ ...normalCell, textAlign: "right" }}>
                  {fmtVND(v)} VNĐ
                </td>
              </tr>
            ))}
            <tr style={accentRow}>
              <td style={{ ...accentCell, padding: "4px 8px", fontWeight: 700 }}>
                D – Tổng thanh toán (A+B+C):
              </td>
              <td style={{
                ...accentCell,
                padding: "4px 8px",
                textAlign: "right",
                fontWeight: 700,
                fontSize: 15,
              }}>
                {fmtVND(calc.D)} VNĐ
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ ...totalsWords, marginTop: 6, maxWidth: 480 }}>
          Bằng chữ: {bangChu}
        </div>
      </Col>
    </Row>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductionOrderForm({ initialValue, onSave }: Props) {
  const [order, setOrder] = useState<ProductionOrder>(initialValue ?? defaultOrder());

  const calc: OrderCalc = useMemo(() => calcOrderTotals(order.groups), [order.groups]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const set = useCallback(<K extends keyof ProductionOrder>(key: K, value: ProductionOrder[K]) => {
    setOrder(prev => ({ ...prev, [key]: value }));
  }, []);

  const setDelivery = useCallback((partial: Partial<ProductionOrder["delivery"]>) => {
    setOrder(prev => ({ ...prev, delivery: { ...prev.delivery, ...partial } }));
  }, []);

  // ── Group mutations ────────────────────────────────────────────────────────

  const addGroup = useCallback(() => {
    setOrder(prev => ({ ...prev, groups: [...prev.groups, newGroup()] }));
  }, []);

  const removeGroup = useCallback((gId: string) => {
    setOrder(prev => ({ ...prev, groups: prev.groups.filter(g => g.id !== gId) }));
  }, []);

  const updateGroup = useCallback((gId: string, partial: Partial<ProductGroup>) => {
    setOrder(prev => ({
      ...prev,
      groups: prev.groups.map(g => (g.id === gId ? { ...g, ...partial } : g)),
    }));
  }, []);

  // ── Item mutations ─────────────────────────────────────────────────────────

  const addItem = useCallback((gId: string) => {
    setOrder(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === gId ? { ...g, items: [...g.items, newItem()] } : g,
      ),
    }));
  }, []);

  const removeItem = useCallback((gId: string, iKey: string) => {
    setOrder(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === gId ? { ...g, items: g.items.filter(i => i.key !== iKey) } : g,
      ),
    }));
  }, []);

  const updateItem = useCallback((gId: string, iKey: string, partial: Partial<LineItem>) => {
    setOrder(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === gId
          ? { ...g, items: g.items.map(i => (i.key === iKey ? { ...i, ...partial } : i)) }
          : g,
      ),
    }));
  }, []);

  // ── Print ──────────────────────────────────────────────────────────────────

  const handlePrint = useCallback(async (docType: "bao_gia" | "lenh_sx" | "pxk") => {
    const html =
      docType === "bao_gia" ? buildBaoGiaHtml(order, calc)
      : docType === "lenh_sx" ? buildLenhSXHtml(order, calc)
      : buildPXKHtml(order, calc);

    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1";
    container.innerHTML = html;
    document.body.appendChild(container);

    const fileName =
      docType === "bao_gia" ? `BaoGia_${order.so_bao_gia || "draft"}.pdf`
      : docType === "lenh_sx" ? `LenhSX_${order.so_lenh || "draft"}.pdf`
      : `LenhSX_PXK_${order.so_lenh || "draft"}.pdf`;

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
  }, [order, calc]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={12}>

      {/* Action bar */}
      <Card size="small">
        <Space wrap>
          {onSave && (
            <Button type="primary" icon={<SaveOutlined />} onClick={() => onSave(order)}>
              Lưu
            </Button>
          )}
          <Button icon={<PrinterOutlined />} onClick={() => handlePrint("bao_gia")}>
            Xuất Báo giá
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => handlePrint("lenh_sx")}>
            Xuất Lệnh SX nội bộ
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => handlePrint("pxk")}>
            Xuất Lệnh SX + PXK
          </Button>
        </Space>
      </Card>

      {/* ── Thông tin đơn hàng ── */}
      <Card title="Thông tin đơn hàng" size="small">
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={8}>
            <div className="form-lbl">Số lệnh sản xuất</div>
            <Input
              value={order.so_lenh}
              placeholder="6508"
              onChange={e => set("so_lenh", e.target.value)}
            />
          </Col>
          <Col xs={24} sm={8}>
            <div className="form-lbl">Số báo giá</div>
            <Input
              value={order.so_bao_gia}
              placeholder="090626.01"
              onChange={e => set("so_bao_gia", e.target.value)}
            />
          </Col>
          <Col xs={12} sm={4}>
            <div className="form-lbl">Ngày lập</div>
            <Input
              value={order.ngay}
              placeholder="09/06/2026"
              onChange={e => set("ngay", e.target.value)}
            />
          </Col>
          <Col xs={12} sm={4}>
            <div className="form-lbl">Hiệu lực đến</div>
            <Input
              value={order.hieu_luc_den}
              placeholder="14/06/2026"
              onChange={e => set("hieu_luc_den", e.target.value)}
            />
          </Col>

          <Col xs={24} sm={12}>
            <div className="form-lbl">Tên khách hàng</div>
            <Input
              value={order.khach_hang}
              onChange={e => set("khach_hang", e.target.value)}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">Địa chỉ khách hàng</div>
            <Input
              value={order.dia_chi_kh}
              onChange={e => set("dia_chi_kh", e.target.value)}
            />
          </Col>

          <Col xs={24} sm={12}>
            <div className="form-lbl">Người liên hệ (tên - SĐT)</div>
            <Input
              value={order.nguoi_lien_he}
              placeholder="Mr Thành - 0982476556"
              onChange={e => set("nguoi_lien_he", e.target.value)}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">NVKD (tên - SĐT)</div>
            <Input
              value={order.nvkd}
              placeholder="Mr Long - 0978349917"
              onChange={e => set("nvkd", e.target.value)}
            />
          </Col>

          <Col xs={24} sm={10}>
            <div className="form-lbl">Ghi chú vận chuyển (xuất hiện trong báo giá)</div>
            <Select
              style={{ width: "100%" }}
              value={order.phi_vc}
              onChange={v => set("phi_vc", v)}
              options={[
                { value: "chua", label: "Giá chưa bao gồm vận chuyển" },
                { value: "da", label: "Giá đã bao gồm vận chuyển" },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* ── Sản phẩm ── */}
      <Card
        title="Sản phẩm (nhóm I / II / III...)"
        size="small"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Khối lượng tự tính = Chiều rộng × Dài × Số tấm (m²) hoặc Dài × Số tấm (m).
            Để trống Dài + Số tấm để nhập tay (dùng cho dòng Hao phí).
          </Text>
        }
      >
        {order.groups.map((group, gIdx) => (
          <GroupSection
            key={group.id}
            group={group}
            gIdx={gIdx}
            calc={calc}
            onUpdateGroup={updateGroup}
            onAddItem={addItem}
            onRemoveItem={removeItem}
            onUpdateItem={updateItem}
            onRemoveGroup={removeGroup}
          />
        ))}

        <Button icon={<PlusOutlined />} onClick={addGroup} style={{ marginBottom: 16 }}>
          Thêm nhóm sản phẩm
        </Button>

        <Divider style={{ margin: "8px 0" }} />
        <OrderTotalsDisplay calc={calc} />
      </Card>

      {/* ── Điều kiện giao hàng (Lệnh SX nội bộ) ── */}
      <Card title="Điều kiện giao hàng (dùng cho Lệnh SX nội bộ)" size="small">
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12}>
            <div className="form-lbl">1. Ngày nghiệm thu</div>
            <Input
              value={order.delivery.ngay_nghiem_thu}
              placeholder="15/06/2026"
              onChange={e => setDelivery({ ngay_nghiem_thu: e.target.value })}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">2. Phiếu giao</div>
            <Input
              value={order.delivery.phieu_giao}
              onChange={e => setDelivery({ phieu_giao: e.target.value })}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">3. Vận chuyển</div>
            <Input
              value={order.delivery.van_chuyen_nd}
              onChange={e => setDelivery({ van_chuyen_nd: e.target.value })}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">4. Thông tin sản phẩm</div>
            <Input
              value={order.delivery.thong_tin_sp}
              onChange={e => setDelivery({ thong_tin_sp: e.target.value })}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">5. Thời gian giao hàng</div>
            <Input
              value={order.delivery.thoi_gian_giao}
              placeholder="17/06/2026"
              onChange={e => setDelivery({ thoi_gian_giao: e.target.value })}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">6. Người nhận (tên - SĐT)</div>
            <Input
              value={order.delivery.nguoi_nhan}
              placeholder="Mr Thuyết - 0955123654"
              onChange={e => setDelivery({ nguoi_nhan: e.target.value })}
            />
          </Col>
          <Col xs={24}>
            <div className="form-lbl">7. Địa điểm giao hàng</div>
            <Input
              value={order.delivery.dia_diem_giao}
              placeholder="Lô 4 CN6 - Khu công nghiệp Sông Công II - Thái Nguyên"
              onChange={e => setDelivery({ dia_diem_giao: e.target.value })}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div className="form-lbl">8. Thanh toán</div>
            <Input
              value={order.delivery.thanh_toan_nd}
              onChange={e => setDelivery({ thanh_toan_nd: e.target.value })}
            />
          </Col>
          <Col xs={24}>
            <div className="form-lbl">9. Ghi chú giao hàng (lái xe, hạ hàng...)</div>
            <TextArea
              rows={2}
              value={order.delivery.ghi_chu_giao}
              onChange={e => setDelivery({ ghi_chu_giao: e.target.value })}
            />
          </Col>
        </Row>
      </Card>

    </Space>
  );
}
