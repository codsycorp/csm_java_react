/**
 * Config mẫu cho hệ thống quản lý đơn hàng sản xuất panel Phú Sơn.
 * Đây là dữ liệu lưu trong database (menu config), KHÔNG phải source code.
 *
 * Cách dùng:
 *   1. Lưu object này vào menu config trong database
 *   2. Thay "trigger" bằng các function body đã encrypt
 *   3. Mỗi dự án tạo config riêng với columns / formulas / templates khác
 *
 * Thay đổi công thức = sửa "formula" trong line_items_columns → không sửa code.
 * Thêm tài liệu in = thêm phần tử vào line_items_print + thêm trigger key.
 * Thêm loại VAT = sửa vat_options trong line_items_group.
 */

import type { LineItemsEditorConfig } from "./types";

// ─── Print function bodies ────────────────────────────────────────────────────
// Trong production: các string này lưu encrypted trong database (trigger).
// Trong config này để dễ đọc / chỉnh sửa cho admin.

const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; color: #000; line-height: 1.4; }
.page { width: 780px; padding: 15px 20px; }
.co-name { text-align:center; font-size:13pt; font-weight:bold; text-transform:uppercase; }
.co-addr { text-align:center; font-size:9.5pt; }
.doc-title { text-align:center; font-size:14pt; font-weight:bold; text-transform:uppercase; margin:14px 0 8px; }
table.hdr { width:100%; border-collapse:collapse; margin-bottom:6px; }
table.hdr td { padding:2px 4px; vertical-align:top; font-size:10.5pt; }
.intro { font-size:10pt; margin-bottom:8px; font-style:italic; }
table.it { width:100%; border-collapse:collapse; font-size:9.5pt; margin:6px 0; }
table.it th { background:#d9d9d9; border:1px solid #555; padding:4px 3px; text-align:center; }
table.it td { border:1px solid #555; padding:3px 4px; vertical-align:top; }
.it-grp { background:#f2f2f2; font-weight:600; white-space:pre-wrap; font-size:9pt; }
.it-sub { background:#e8e8e8; font-weight:bold; font-size:9pt; }
.r { text-align:right; } .c { text-align:center; }
.tot-wrap { display:flex; justify-content:flex-end; margin:6px 0; }
.tot { border-collapse:collapse; width:340px; }
.tot td { padding:2px 6px; border:1px solid #aaa; font-size:10pt; }
.tot .lbl { font-weight:600; } .tot .amt { text-align:right; font-weight:600; }
.tot .grand td { background:#cfe2ff; font-weight:bold; font-size:10.5pt; }
.bang-chu { font-style:italic; margin:6px 0 10px; font-size:10pt; }
.notes { font-size:9.5pt; margin:6px 0; }
.note-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:20px; }
.sig-row { display:flex; justify-content:space-between; margin-top:18px; }
.sig-box { text-align:center; min-width:130px; font-size:9.5pt; }
.sig-box .lbl { font-weight:bold; }
.sig-box .sub { font-size:8.5pt; color:#444; }
.sig-box .name { margin-top:38px; font-weight:bold; }
.dlg { display:grid; grid-template-columns:1fr 1fr; gap:3px 20px; font-size:10pt; margin:6px 0; }
.di { display:flex; gap:4px; }
.di .k { font-weight:bold; min-width:100px; }
.receive-line { margin:16px 0 8px; font-size:10pt; border-top:1px solid #aaa; padding-top:10px; }
`;

const COMPANY_HDR = `
  <div class="co-name">CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN</div>
  <div class="co-addr">Địa chỉ: Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội</div>
  <div class="co-addr">MST: 0104113174 &nbsp;&nbsp; https://panelphuson.vn &nbsp;&nbsp; https://javta.vn</div>`;

function wrapDoc(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS}</style></head>
<body><div class="page">${COMPANY_HDR}
<div class="doc-title">${title}</div>${body}</div></body></html>`;
}

function buildItemsTable(groups: any[], utils: any, showPrice: boolean): string {
  const { fmtVND, fmtNum, groupLabel } = utils;
  const priceHdr = showPrice
    ? `<th style="width:9%">Đơn giá<br/>(VNĐ)</th><th style="width:10%">Thành tiền<br/>(VNĐ)</th>`
    : "";
  let rows = "";
  groups.forEach((g: any, gi: number) => {
    const label = groupLabel(gi);
    const specHtml = (g.spec ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    rows += `<tr><td class="c it-grp" style="font-weight:bold">${label}.</td>
      <td colspan="${showPrice ? 7 : 5}" class="it-grp">${specHtml}</td></tr>`;
    // subtotal
    const total_tt = g.items.reduce((s: number, i: any) => s + (i.thanh_tien ?? 0), 0);
    const total_kl = g.items.reduce((s: number, i: any) => s + (i.khoi_luong ?? 0), 0);
    const total_st = g.items.reduce((s: number, i: any) => s + (i.so_tam ?? 0), 0);
    const prices = [...new Set(g.items.map((i: any) => i.don_gia).filter(Boolean))];
    const uniformPrice = prices.length === 1 ? fmtVND(prices[0]) : "";
    const priceSubCells = showPrice
      ? `<td class="r it-sub">${uniformPrice}</td><td class="r it-sub">${fmtVND(total_tt)}</td>`
      : "";
    rows += `<tr><td class="it-sub"></td><td class="it-sub" colspan="3">Cộng nhóm ${label} – chưa VAT ${g.vat_rate}%</td>
      <td class="r it-sub">${total_st}</td><td class="r it-sub">${fmtNum(total_kl)}</td>${priceSubCells}</tr>`;
    // items
    g.items.forEach((item: any, idx: number) => {
      const priceCells = showPrice
        ? `<td class="r">${item.don_gia != null ? fmtVND(item.don_gia) : ""}</td>
           <td class="r">${item.thanh_tien ? fmtVND(item.thanh_tien) : ""}</td>`
        : "";
      rows += `<tr><td class="c">${idx + 1}</td><td>${item.ten_sp ?? ""}</td>
        <td class="c">${item.don_vi ?? ""}</td>
        <td class="r">${item.chieu_rong != null ? fmtNum(item.chieu_rong) : ""}</td>
        <td class="r">${item.chieu_dai != null ? fmtNum(item.chieu_dai, 3) : ""}</td>
        <td class="r">${item.so_tam != null ? item.so_tam : ""}</td>
        <td class="r">${item.khoi_luong != null ? fmtNum(item.khoi_luong) : ""}</td>
        ${priceCells}</tr>`;
    });
  });
  return `<table class="it"><thead><tr>
    <th style="width:4%">TT</th>
    <th style="width:${showPrice ? "26%" : "38%"}">Tên sản phẩm/Quy cách</th>
    <th style="width:5%">ĐV</th>
    <th style="width:7%">Chiều<br/>rộng</th>
    <th style="width:8%">Chiều<br/>dài</th>
    <th style="width:6%">Số<br/>tấm</th>
    <th style="width:8%">Khối<br/>lượng</th>
    ${priceHdr}</tr></thead><tbody>${rows}</tbody></table>`;
}

function buildTotals(calc: any, utils: any): string {
  const { fmtVND, soThanhChu } = utils;
  const { totals } = calc;
  const bangChu = soThanhChu(totals.D ?? 0);
  return `<div class="tot-wrap"><table class="tot">
    <tr><td class="lbl">A &nbsp; Tổng giá trị hàng hóa chưa VAT:</td><td class="amt">${fmtVND(totals.A ?? 0)}</td></tr>
    <tr><td class="lbl">B &nbsp; Tiền VAT 8%</td><td class="amt">${fmtVND(totals.B ?? 0)}</td></tr>
    <tr><td class="lbl">C &nbsp; Tiền VAT 10%</td><td class="amt">${fmtVND(totals.C ?? 0)}</td></tr>
    <tr class="grand"><td class="lbl">D &nbsp; Tổng giá trị thanh toán (A+B+C):</td><td class="amt">${fmtVND(totals.D ?? 0)}</td></tr>
    </table></div>
    <div class="bang-chu"><b>Bằng chữ:</b> ${bangChu}</div>`;
}

const NOTES = [
  "Đơn giá đã bao gồm VAT: Tấm lợp PU, EPS, RW, GW, Vận chuyển thuế 8%; Phụ kiện tôn, inox, 1 lớp thuế 10%",
  "Dung sai kích thước chiều dài ±5mm, chiều rộng ±4mm",
  "Dung sai độ dày PU/EPS ±2mm, tấm lấy sáng ±0,2mm.",
  "Tỷ trọng PU ±3kg/m³, tỷ trọng EPS ±1kg/m³",
  "Dung sai độ dày tôn ±0,03÷0,04mm",
];

// ─── TRIGGER FUNCTION BODIES (lưu encrypted trong production) ─────────────────
// Signature: (order, groups, calc, utils) => string (HTML)

const FN_BAO_GIA = `
const { fmtVND, fmtNum, soThanhChu, groupLabel } = utils;
const phi_vc = order.phi_vc === 'da' ? 'Giá trên đã bao gồm vận chuyển.' : 'Giá trên chưa bao gồm vận chuyển.';
const hdr = \`<table class="hdr">
  <tr><td style="width:55%">Kính gửi: <b>\${order.khach_hang??''}</b></td>
    <td>Số: <b>\${order.so_bao_gia??''}</b> &nbsp;&nbsp; Ngày: <b>\${order.ngay??''}</b></td></tr>
  <tr><td>Địa chỉ: \${order.dia_chi_kh??''}</td>
    <td>Hiệu lực đến: <b>\${order.hieu_luc_den??''}</b></td></tr>
  <tr><td>Người liên hệ: \${order.nguoi_lien_he??''}</td>
    <td>NVKD: <b>\${order.nvkd??''}</b></td></tr></table>
  <div class="intro">Cảm ơn Quý khách hàng đã quan tâm tới sản phẩm do Công ty TNHH Công nghệ Công nghiệp Phú Sơn sản xuất. Chúng tôi xin gửi Báo giá theo yêu cầu Quý khách với nội dung như sau:</div>\`;

const items = ${buildItemsTable.toString().replace(/\n/g, " ")}(groups, utils, true);
const totals = ${buildTotals.toString().replace(/\n/g, " ")}(calc, utils);
const notes = '<div class="notes"><b>Ghi chú:</b><div class="note-grid">' +
  ${JSON.stringify([...NOTES, ""])}.map((n,i)=>i<5?\`<div>\${i+1}. \${n}</div>\`:\`<div>6. \${phi_vc}</div>\`).join('') + '</div></div>';
const payment = \`<div class="notes"><b>Phương thức thanh toán:</b>
  <div>- Lần 1: Đặt cọc 50% sau khi xác nhận đơn.</div>
  <div>- Lần 2: Thanh toán 50% còn lại trước khi xuất xưởng.</div>
  <div style="margin-top:4px">Số TK: 7999989399 MB Bank - CN Hai Bà Trưng</div></div>\`;
const sigs = \`<div class="sig-row">
  <div class="sig-box"><div class="lbl">ĐẠI DIỆN BÊN MUA</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>
  <div class="sig-box"><div class="lbl">ĐẠI DIỆN BÊN BÁN</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name">\${order.nvkd??''}</div></div>
</div>\`;
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS.replace(/`/g, "\\`")}</style></head>
<body><div class="page">
${COMPANY_HDR.replace(/`/g, "\\`")}
<div class="doc-title">BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG</div>
\${hdr}\${items}\${totals}\${notes}\${payment}\${sigs}
</div></body></html>\`;
`;

const FN_LENH_SX = `
const { fmtVND, fmtNum, soThanhChu, groupLabel } = utils;
const now = new Date();
const timeStr = now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) + ' ' + now.toLocaleDateString('vi-VN');
const d = order; // delivery fields flattened into order object
const hdr = \`<table class="hdr">
  <tr><td>Số lệnh sản xuất: <b>\${d.so_lenh??''}</b></td><td>Thời gian gửi: <b>\${timeStr}</b></td></tr>
  <tr><td>Khách hàng: <b>\${d.khach_hang??''}</b></td><td>NVKD: <b>\${d.nvkd??''}</b></td></tr>
  <tr><td>Liên hệ: \${d.nguoi_lien_he??''}</td><td></td></tr>
</table><div style="font-weight:bold;margin:6px 0 2px">* NỘI DUNG YÊU CẦU SẢN XUẤT:</div>\`;

const items = ${buildItemsTable.toString().replace(/\n/g, " ")}(groups, utils, true);
const totals = ${buildTotals.toString().replace(/\n/g, " ")}(calc, utils);
const delivery = \`<div style="font-weight:bold;margin:10px 0 4px;font-size:10.5pt">** ĐIỀU KIỆN GIAO HÀNG VÀ THANH TOÁN</div>
<div class="dlg">
  <div class="di"><span class="k">1. Nghiệm thu:</span><span>tại Nhà máy Phú Sơn</span></div>
  <div class="di"><span class="k">2. Ngày nghiệm thu:</span><span>\${d.ngay_nghiem_thu??''}</span></div>
  <div class="di"><span class="k">3. Vận chuyển:</span><span>\${d.van_chuyen_nd??''}</span></div>
  <div class="di"><span class="k">4. Thông tin SP:</span><span>\${d.thong_tin_sp??''}</span></div>
  <div class="di"><span class="k">5. Phiếu giao:</span><span>\${d.phieu_giao??''}</span></div>
  <div class="di"><span class="k">6. Thời gian giao:</span><span><b>\${d.thoi_gian_giao??''}</b></span></div>
</div>
<div class="di" style="margin:3px 0;font-size:10pt"><span class="k">7. Người nhận:</span><span>\${d.nguoi_nhan??''}</span></div>
<div class="di" style="margin:3px 0;font-size:10pt"><span class="k">8. Địa điểm:</span><span>\${d.dia_diem_giao??''}</span></div>
<div class="di" style="margin:3px 0;font-size:10pt"><span class="k">9. Thanh toán:</span><span>\${d.thanh_toan_nd??''}</span></div>
<div class="di" style="margin:3px 0;font-size:10pt"><span class="k">10. Ghi chú:</span><span>\${d.ghi_chu_giao??''}</span></div>\`;

const sigs = \`<div class="sig-row">
  <div class="sig-box"><div class="lbl">GIÁM ĐỐC PHÊ DUYỆT</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>
  <div class="sig-box"><div class="lbl">NGƯỜI YÊU CẦU SẢN XUẤT</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name">\${d.nvkd??''}</div></div>
</div>\`;
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS.replace(/`/g, "\\`")}</style></head>
<body><div class="page">
${COMPANY_HDR.replace(/`/g, "\\`")}
<div class="doc-title">LỆNH SẢN XUẤT</div>
<div style="text-align:center;font-size:10pt;font-style:italic;margin-bottom:8px">Số lệnh: \${d.so_lenh??''}/PS</div>
\${hdr}\${items}\${totals}\${delivery}\${sigs}
</div></body></html>\`;
`;

const FN_PXK = `
const { fmtVND, fmtNum, soThanhChu, groupLabel } = utils;
const d = order;
const parts = (d.ngay??'').split('/');
const hdr = \`<div style="text-align:center;font-style:italic;margin-bottom:6px">Ngày \${parts[0]??''} tháng \${parts[1]??''} năm \${parts[2]??''}</div>
<table class="hdr">
  <tr><td style="width:60%">Khách hàng: <b>\${d.khach_hang??''}</b></td><td>Số: <b>\${d.so_lenh??''}/PS</b></td></tr>
  <tr><td>Địa chỉ: \${d.dia_chi_kh??''}</td><td></td></tr>
  <tr><td>Thời gian giao: <b>\${d.thoi_gian_giao??''}</b></td><td>Người nhận hàng: <b>\${d.nguoi_nhan??''}</b></td></tr>
  <tr><td colspan="2">Giao hàng tại: <b>\${d.dia_diem_giao??''}</b></td></tr>
  <tr><td colspan="2">Nhân viên KD: <b>\${d.nvkd??''}</b></td></tr>
</table>\`;

const items = ${buildItemsTable.toString().replace(/\n/g, " ")}(groups, utils, false);
const receive = '<div class="receive-line">Khách hàng nhận hàng lúc: …….... giờ …….. phút, ngày ….. tháng ….. năm ' + (parts[2]??new Date().getFullYear()) + '</div>';
const sigs5 = '<div class="sig-row" style="justify-content:space-around">' +
  ['Người lập phiếu','Người nhận hàng','Lái xe','Thủ kho','BGĐ Nhà máy'].map(l=>
    \`<div class="sig-box"><div class="lbl">\${l}</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>\`
  ).join('') + '</div>';
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS.replace(/`/g, "\\`")}</style></head>
<body><div class="page">
${COMPANY_HDR.replace(/`/g, "\\`")}
<div class="doc-title">LỆNH SẢN XUẤT KIÊM PHIẾU XUẤT KHO</div>
\${hdr}\${items}\${receive}\${sigs5}
</div></body></html>\`;
`;

// ─── Config object (lưu vào database / menu config) ──────────────────────────

export const PHUSON_PANEL_CONFIG: LineItemsEditorConfig = {
  table_name: "pm_orders",
  line_items_data_field: "payload_json",
  line_items_list: [
    { field: "so_bao_gia", label: "Số báo giá", width: 130 },
    { field: "so_lenh", label: "Số lệnh SX", width: 130 },
    { field: "ngay", label: "Ngày lập", width: 110 },
    { field: "khach_hang", label: "Khách hàng", width: 220 },
    { field: "nvkd", label: "NVKD", width: 160 },
  ],
  struct: { fieldsPK: ["id"] },
  // ── Header fields (m_configs.table format) ──
  table: [
    { f_name: "giai_doan",     f_header: "Giai đoạn",         f_header_en: "Stage",              f_header_zh: "阶段",
      f_types: "select", f_show: 1, f_stt: 0, f_width_col: 8,
      f_options: "nhap:Nháp|bao_gia:Báo giá|lenh_sx_nb:Lệnh SX nội bộ|lenh_sx_pxk:Lệnh SX + PXK|xuong:Đã gửi xưởng" },
    { f_name: "trang_thai_bg", f_header: "Trạng thái BG",     f_header_en: "Quote status",       f_header_zh: "报价状态",
      f_types: "select", f_show: 1, f_stt: 1, f_width_col: 8,
      f_options: "nhap:Nháp|da_gui:Đã gửi|thuong_luong:Đang thương lượng|da_chot:Đã chốt|khong_chot:Không chốt" },
    { f_name: "phien_ban",     f_header: "Phiên bản",         f_header_en: "Revision",           f_header_zh: "版本",
      f_types: "text",   f_show: 1, f_stt: 2, f_width_col: 4, f_placeholder: "E1" },
    { f_name: "so_lenh",       f_header: "Số lệnh SX",       f_header_en: "Production order no.", f_header_zh: "生产令号",
      f_types: "text",   f_show: 1, f_stt: 3,  f_width_col: 8, f_placeholder: "6508/PS.E1" },
    { f_name: "so_bao_gia",    f_header: "Số báo giá",        f_header_en: "Quote no.",          f_header_zh: "报价单号",
      f_types: "text",   f_show: 1, f_stt: 4,  f_width_col: 8, f_placeholder: "060626.01" },
    { f_name: "ngay",          f_header: "Ngày lập",          f_header_en: "Date",               f_header_zh: "日期",
      f_types: "text",   f_show: 1, f_stt: 5,  f_width_col: 4, f_placeholder: "09/06/2026" },
    { f_name: "hieu_luc_den",  f_header: "Hiệu lực đến",      f_header_en: "Valid until",        f_header_zh: "有效期至",
      f_types: "text",   f_show: 1, f_stt: 6,  f_width_col: 4, f_placeholder: "14/06/2026" },
    { f_name: "khach_hang",    f_header: "Tên khách hàng",    f_header_en: "Customer",           f_header_zh: "客户名称",
      f_types: "text",   f_show: 1, f_stt: 7,  f_width_col: 12 },
    { f_name: "dia_chi_kh",    f_header: "Địa chỉ KH",        f_header_en: "Customer address",   f_header_zh: "客户地址",
      f_types: "text",   f_show: 1, f_stt: 8,  f_width_col: 12 },
    { f_name: "nguoi_lien_he", f_header: "Người liên hệ",     f_header_en: "Contact person",     f_header_zh: "联系人",
      f_types: "text",   f_show: 1, f_stt: 9,  f_width_col: 12, f_placeholder: "Mr Thành - 0982476556" },
    { f_name: "nvkd",          f_header: "NVKD",              f_header_en: "Sales rep.",         f_header_zh: "销售代表",
      f_types: "text",   f_show: 1, f_stt: 10, f_width_col: 12, f_placeholder: "Mr Long - 0978349917" },
    { f_name: "phi_vc",        f_header: "Vận chuyển",        f_header_en: "Shipping",           f_header_zh: "运输",
      f_types: "select", f_show: 1, f_stt: 11, f_width_col: 10,
      f_options: "chua:Giá chưa bao gồm vận chuyển|da:Giá đã bao gồm vận chuyển" },
    // Delivery fields (dùng cho Lệnh SX)
    { f_name: "ngay_nghiem_thu", f_header: "Ngày nghiệm thu",   f_types: "text",   f_show: 1, f_stt: 20, f_width_col: 8 },
    { f_name: "thoi_gian_giao",  f_header: "Thời gian giao",    f_types: "text",   f_show: 1, f_stt: 21, f_width_col: 8 },
    { f_name: "nguoi_nhan",      f_header: "Người nhận hàng",   f_types: "text",   f_show: 1, f_stt: 22, f_width_col: 8 },
    { f_name: "dia_diem_giao",   f_header: "Địa điểm giao",     f_types: "text",   f_show: 1, f_stt: 23, f_width_col: 16 },
    { f_name: "van_chuyen_nd",   f_header: "Vận chuyển (chi tiết)", f_types: "text", f_show: 1, f_stt: 24, f_width_col: 12 },
    { f_name: "thong_tin_sp",    f_header: "Thông tin sản phẩm", f_types: "text",  f_show: 1, f_stt: 25, f_width_col: 12 },
    { f_name: "phieu_giao",      f_header: "Phiếu giao",         f_types: "text",  f_show: 1, f_stt: 26, f_width_col: 12 },
    { f_name: "thanh_toan_nd",   f_header: "Thanh toán",         f_types: "text",  f_show: 1, f_stt: 27, f_width_col: 12 },
    { f_name: "ghi_chu_giao",    f_header: "Ghi chú giao hàng",  f_types: "textarea", f_show: 1, f_stt: 28, f_width_col: 24 },
  ],

  // ── Line item columns ──
  line_items_columns: [
    { name: "ten_sp",     label: "Tên sản phẩm / Quy cách",  type: "text",    width: 200 },
    { name: "don_vi",     label: "ĐV",   type: "select",  options: "m2|m|cái",  width: 66 },
    {
      name: "chieu_rong", label: "Chiều rộng",  type: "number", width: 88,
      // Với m²: đây là hệ số (1.13, 1.08…). Với m: chỉ hiển thị, không tính
    },
    { name: "chieu_dai",  label: "Chiều dài",   type: "number", width: 86 },
    { name: "so_tam",     label: "Số tấm",       type: "number", width: 72 },
    {
      name: "khoi_luong", label: "Khối lượng",
      // formula_or_manual: nếu manual_condition=true → cho nhập tay (Hao phí)
      type: "formula_or_manual", width: 92, align: "right",
      formula: "don_vi === 'm' ? (chieu_dai ?? 0) * (so_tam ?? 0) : (chieu_rong ?? 1) * (chieu_dai ?? 0) * (so_tam ?? 0)",
      manual_condition: "chieu_dai == null && so_tam == null",
    },
    { name: "don_gia",    label: "Đơn giá (VNĐ)",   type: "price",   width: 118, align: "right" },
    {
      name: "thanh_tien", label: "Thành tiền (VNĐ)",
      type: "formula", width: 122, align: "right",
      formula: "(khoi_luong ?? 0) * (don_gia ?? 0)",
    },
  ],

  // ── Group config ──
  line_items_group: {
    spec_field:  "spec",
    vat_field:   "vat_rate",
    vat_default: 10,
    vat_options: [{ value: 8, label: "VAT 8%" }, { value: 10, label: "VAT 10%" }],
  },

  // ── Totals ──
  line_items_totals: [
    { key: "A", label: "Tổng giá trị hàng hóa chưa VAT",         formula: "groupSum" },
    { key: "B", label: "Tiền VAT 8%",                             formula: "vatSum(8) * 0.08" },
    { key: "C", label: "Tiền VAT 10%",                            formula: "vatSum(10) * 0.10" },
    { key: "D", label: "Tổng giá trị thanh toán (A+B+C)",         formula: "A + B + C", highlight: true, show_words: true },
  ],

  // ── Print buttons ──
  line_items_print: [
    {
      label: "Xuất Báo giá",
      trigger_key: "print_bao_gia",
      filename_expr: "`BaoGia_${order.so_bao_gia || 'draft'}.pdf`",
    },
    {
      label: "Xuất Lệnh SX nội bộ",
      trigger_key: "print_lenh_sx",
      filename_expr: "`LenhSX_${order.so_lenh || 'draft'}.pdf`",
    },
    {
      label: "Xuất Lệnh SX + PXK",
      trigger_key: "print_pxk",
      filename_expr: "`LenhSX_PXK_${order.so_lenh || 'draft'}.pdf`",
    },
  ],

  // ── Trigger scripts (lưu encrypted trong production) ──
  trigger: {
    print_bao_gia: FN_BAO_GIA,
    print_lenh_sx: FN_LENH_SX,
    print_pxk:     FN_PXK,
  },
};
