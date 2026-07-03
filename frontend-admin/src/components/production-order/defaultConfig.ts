/**
 * Config mẫu cho hệ thống quản lý đơn hàng sản xuất panel Phú Sơn.
 * Đây là dữ liệu lưu trong database (menu config), KHÔNG phải source code.
 *
 * Cách dùng:
 *   1. Lưu object này vào menu config trong database
 *   2. Thay "trigger" bằng các function body đã encrypt
 *   3. Mỗi dự án tạo config riêng với columns / formulas / templates khác
 *
 * Menu Bán hàng (PM.docx): 3 menu lá dùng chung bảng pm_orders —
 *   pm_bao_gia (giai_doan nhap|bao_gia), pm_lsx_nb, pm_lsx_pxk.
 *   Xem menu.json mẫu đầy đủ.
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

type ItemsTableOpts = { showPrice?: boolean; showGroupSubtotal?: boolean };

function buildItemsTable(groups: any[], calc: any, utils: any, opts: boolean | ItemsTableOpts = true): string {
  if (typeof utils?.buildItemsTableHtml === "function") {
    const o: ItemsTableOpts = typeof opts === "boolean" ? { showPrice: opts, showGroupSubtotal: opts } : opts;
    return utils.buildItemsTableHtml(groups, calc, utils, o);
  }
  const o: ItemsTableOpts = typeof opts === "boolean" ? { showPrice: opts, showGroupSubtotal: opts } : opts;
  const showPrice = o.showPrice ?? true;
  const showGroupSubtotal = o.showGroupSubtotal ?? showPrice;
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
    if (showGroupSubtotal) {
      const gc = calc?.groups?.[g.id];
      const total_tt = gc?.sum ?? g.items.reduce((s: number, i: any) => s + (i.thanh_tien ?? 0), 0);
      const total_kl = gc?.kl ?? g.items.reduce((s: number, i: any) => s + (i.khoi_luong ?? 0), 0);
      const total_st = gc?.so_tam ?? g.items.reduce((s: number, i: any) => s + (i.so_tam ?? 0), 0);
      const uniformPrice = gc?.uniform_price != null ? fmtVND(gc.uniform_price) : "";
      const priceSubCells = showPrice
        ? `<td class="r it-sub">${uniformPrice}</td><td class="r it-sub">${fmtVND(total_tt)}</td>`
        : "";
      rows += `<tr><td class="it-sub"></td><td class="it-sub" colspan="3">Cộng nhóm ${label} – chưa VAT ${g.vat_rate}%</td>
        <td class="r it-sub">${total_st}</td><td class="r it-sub">${fmtNum(total_kl)}</td>${priceSubCells}</tr>`;
    }
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
    <th style="width:5%">Đơn vị</th>
    <th style="width:7%">Chiều<br/>rộng</th>
    <th style="width:8%">Chiều<br/>dài</th>
    <th style="width:6%">Số<br/>tấm</th>
    <th style="width:8%">Khối<br/>lượng</th>
    ${priceHdr}</tr></thead><tbody>${rows}</tbody></table>`;
}

function buildTotals(calc: any, utils: any): string {
  if (typeof utils.buildTotalsHtml === "function") {
    return utils.buildTotalsHtml(calc, utils);
  }
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
const cfg = utils.settings || {};
const companyHdr = utils.buildCompanyHdr ? utils.buildCompanyHdr(cfg) : '';
const introDefault = 'Cảm ơn Quý khách hàng đã quan tâm tới sản phẩm do Công ty TNHH Công nghệ Công nghiệp Phú Sơn sản xuất. Chúng tôi xin gửi Báo giá theo yêu cầu Quý khách với nội dung như sau:';
const intro = cfg.intro_bao_gia || introDefault;
const phi_vc = order.phi_vc === 'da' ? 'Giá trên đã bao gồm vận chuyển.' : 'Giá trên chưa bao gồm vận chuyển.';
const hdr = \`<table class="hdr">
  <tr><td style="width:55%">Kính gửi: <b>\${order.khach_hang??''}</b></td>
    <td>Số: <b>\${order.so_bao_gia??''}</b> &nbsp;&nbsp; Ngày: <b>\${order.ngay??''}</b></td></tr>
  <tr><td>Địa chỉ: \${order.dia_chi_kh??''}</td>
    <td>Hiệu lực đến: <b>\${order.hieu_luc_den??''}</b></td></tr>
  <tr><td>Người mua hàng – SĐT: \${order.nguoi_lien_he??''}</td>
    <td>NV bán hàng – SĐT: <b>\${order.nvkd??''}</b></td></tr></table>
  <div class="intro">\${intro}</div>\`;

const items = utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || { showPrice: true, showGroupSubtotal: true });
const totals = utils.buildTotalsHtml(calc, utils);
const defaultNotes = ${JSON.stringify(NOTES)};
const noteLines = utils.parseNoteLines ? utils.parseNoteLines(cfg.ghi_chu_bao_gia, defaultNotes) : defaultNotes;
const notes = '<div class="notes"><b>Ghi chú:</b><div class="note-grid">' +
  noteLines.concat(['']).map((n,i)=>i<noteLines.length?'<div>'+(i+1)+'. '+n+'</div>':'<div>'+(noteLines.length+1)+'. '+phi_vc+'</div>').join('') + '</div></div>';
const tt1 = cfg.thanh_toan_1 || 'Lần 1: Đặt cọc 50% sau khi xác nhận đơn.';
const tt2 = cfg.thanh_toan_2 || 'Lần 2: Thanh toán 50% còn lại trước khi xuất xưởng.';
const stkLine = (cfg.so_tk && cfg.ngan_hang) ? ('Số TK: ' + cfg.so_tk + ' ' + cfg.ngan_hang + (cfg.ten_tk ? ' - ' + cfg.ten_tk : '')) : 'Số TK: 7999989399 MB Bank - CN Hai Bà Trưng';
const payment = \`<div class="notes"><b>Phương thức thanh toán:</b>
  <div>- \${tt1}</div>
  <div>- \${tt2}</div>
  <div style="margin-top:4px">\${stkLine}</div></div>\`;
const sigs = \`<div class="sig-row">
  <div class="sig-box"><div class="lbl">ĐẠI DIỆN BÊN MUA</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>
  <div class="sig-box"><div class="lbl">ĐẠI DIỆN BÊN BÁN</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name">\${order.nvkd??''}</div></div>
</div>\`;
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS.replace(/`/g, "\\`")}</style></head>
<body><div class="page">
\${companyHdr}
<div class="doc-title">BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG</div>
\${hdr}\${items}\${totals}\${notes}\${payment}\${sigs}
</div></body></html>\`;
`;

const FN_LENH_SX = `
const cfg = utils.settings || {};
const companyHdr = utils.buildCompanyHdr ? utils.buildCompanyHdr(cfg) : '';
const soLenh = utils.formatSoLenh ? utils.formatSoLenh(order.so_lenh, order.phien_ban) : (order.so_lenh??'');
const now = new Date();
const timeStr = now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) + ' ' + now.toLocaleDateString('vi-VN');
const d = order;
const hdr = \`<table class="hdr">
  <tr><td>Số lệnh sản xuất: <b>\${soLenh}</b></td><td>Thời gian gửi: <b>\${timeStr}</b></td></tr>
  <tr><td>Khách hàng: <b>\${d.khach_hang??''}</b></td><td>NV bán hàng – SĐT: <b>\${d.nvkd??''}</b></td></tr>
  <tr><td>Người mua hàng – SĐT: \${d.nguoi_lien_he??''}</td><td></td></tr>
</table><div style="font-weight:bold;margin:6px 0 2px">* NỘI DUNG YÊU CẦU SẢN XUẤT:</div>\`;

const items = utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || { showPrice: true, showGroupSubtotal: true });
const totals = utils.buildTotalsHtml(calc, utils);
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
const lsxNotes = utils.parseNoteLines ? utils.parseNoteLines(cfg.ghi_chu_lenh_sx, []) : [];
const lsxNoteBlock = lsxNotes.length ? ('<div class="notes"><b>Ghi chú:</b>' + lsxNotes.map((n,i)=>'<div>'+(i+1)+'. '+n+'</div>').join('') + '</div>') : '';

const sigs = \`<div class="sig-row">
  <div class="sig-box"><div class="lbl">GIÁM ĐỐC PHÊ DUYỆT</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>
  <div class="sig-box"><div class="lbl">NGƯỜI YÊU CẦU SẢN XUẤT</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name">\${d.nvkd??''}</div></div>
</div>\`;
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS.replace(/`/g, "\\`")}</style></head>
<body><div class="page">
\${companyHdr}
<div class="doc-title">LỆNH SẢN XUẤT NỘI BỘ</div>
<div style="text-align:center;font-size:10pt;font-style:italic;margin-bottom:8px">Số lệnh: \${soLenh}</div>
\${hdr}\${items}\${totals}\${delivery}\${lsxNoteBlock}\${sigs}
</div></body></html>\`;
`;

const FN_PXK = `
const cfg = utils.settings || {};
const companyHdr = utils.buildCompanyHdr ? utils.buildCompanyHdr(cfg) : '';
const soLenh = utils.formatSoLenh ? utils.formatSoLenh(order.so_lenh, order.phien_ban) : (order.so_lenh??'');
const d = order;
const parts = (d.ngay??'').split('/');
const hdr = \`<div style="text-align:center;font-style:italic;margin-bottom:6px">Ngày \${parts[0]??''} tháng \${parts[1]??''} năm \${parts[2]??''}</div>
<table class="hdr">
  <tr><td style="width:60%">Khách hàng: <b>\${d.khach_hang??''}</b></td><td>Số: <b>\${soLenh}</b></td></tr>
  <tr><td>Địa chỉ: \${d.dia_chi_kh??''}</td><td></td></tr>
  <tr><td>Thời gian giao: <b>\${d.thoi_gian_giao??''}</b></td><td>Người nhận hàng: <b>\${d.nguoi_nhan??''}</b></td></tr>
  <tr><td colspan="2">Giao hàng tại: <b>\${d.dia_diem_giao??''}</b></td></tr>
  <tr><td colspan="2">NV bán hàng – SĐT: <b>\${d.nvkd??''}</b></td></tr>
</table>\`;

const items = utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || { showPrice: false, showGroupSubtotal: false, hideColumns: ['chieu_rong'] });
const pxkNotes = utils.parseNoteLines ? utils.parseNoteLines(cfg.ghi_chu_lsx_pxk, []) : [];
const pxkNoteBlock = pxkNotes.length ? ('<div class="notes"><b>Ghi chú:</b>' + pxkNotes.map((n,i)=>'<div>'+(i+1)+'. '+n+'</div>').join('') + '</div>') : '';
const receive = '<div class="receive-line">Khách hàng nhận hàng lúc: …….... giờ …….. phút, ngày ….. tháng ….. năm ' + (parts[2]??new Date().getFullYear()) + '</div>';
const sigs5 = '<div class="sig-row" style="justify-content:space-around">' +
  ['Người lập phiếu','Người nhận hàng','Lái xe','Thủ kho','BGĐ Nhà máy'].map(l=>
    \`<div class="sig-box"><div class="lbl">\${l}</div><div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>\`
  ).join('') + '</div>';
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PRINT_CSS.replace(/`/g, "\\`")}</style></head>
<body><div class="page">
\${companyHdr}
<div class="doc-title">LỆNH SẢN XUẤT KIÊM PHIẾU XUẤT KHO</div>
\${hdr}\${items}\${pxkNoteBlock}\${receive}\${sigs5}
</div></body></html>\`;
`;

// ─── AUTO FIELD TRIGGERS (tab Trigger — mẫu tham khảo) ───────────────────────
// Signature parse: (value, ctx) => { prefix?, seq?, num? } | null
// Signature format: (date, seq, ctx) => string

const AUTO_PARSE_SO_BAO_GIA = `const m = value.match(/^(\\d{6})\\.(\\d{1,2})$/); return m ? { prefix: m[1], seq: +m[2] } : null;`;

const AUTO_FORMAT_SO_BAO_GIA = `const dd = String(date.getDate()).padStart(2, '0');
const mm = String(date.getMonth() + 1).padStart(2, '0');
const yy = String(date.getFullYear()).slice(-2);
return dd + mm + yy + '.' + String(seq).padStart(2, '0');`;

const AUTO_PARSE_SO_LENH = `const m = value.match(/^(\\d+)/); return m ? { num: +m[1] } : null;`;

const AUTO_FORMAT_SO_LENH = `return String(seq);`;

/** Quy trình BG → LSXNB → PXK — dùng chung cho 3 menu bán hàng */
export const PHUSON_WORKFLOW = {
  stage_field: "giai_doan",
  steps: [
    {
      stage: "nhap",
      label: "Nháp",
      next: "bao_gia",
      next_label: "Chuyển sang Báo giá",
      set_fields: { giai_doan: "bao_gia" },
    },
    {
      stage: "bao_gia",
      label: "Báo giá",
      next: "lenh_sx_nb",
      next_label: "Chuyển LSX nội bộ",
      require_fields: ["khach_hang", "so_bao_gia"],
      set_fields: { giai_doan: "lenh_sx_nb", trang_thai_bg: "da_chot" },
    },
    {
      stage: "lenh_sx_nb",
      label: "LSX nội bộ",
      next: "lenh_sx_pxk",
      next_label: "Chuyển LSX + PXK",
      require_fields: ["so_lenh"],
      set_fields: { giai_doan: "lenh_sx_pxk" },
    },
    {
      stage: "lenh_sx_pxk",
      label: "LSX + PXK",
      next: "xuong",
      next_label: "Gửi xưởng",
      set_fields: { giai_doan: "xuong" },
    },
  ],
};

// ─── Config object (lưu vào database / menu config) ──────────────────────────

export const PHUSON_PANEL_CONFIG: LineItemsEditorConfig = {
  table_name: "pm_orders",
  line_items_data_field: "payload_json",
  line_items_list: [
    { field: "ngay", label: "Ngày lập", width: 110 },
    { field: "so_bao_gia", label: "Số báo giá", width: 130 },
    { field: "khach_hang", label: "Khách hàng", width: 220 },
    { field: "giai_doan", label: "Giai đoạn", width: 120 },
    { field: "trang_thai_bg", label: "Trạng thái BG", width: 130 },
    { field: "so_lenh", label: "Số lệnh SX", width: 110 },
    { field: "nvkd", label: "NVKD", width: 160 },
  ],
  struct: { fieldsPK: ["id"] },
  // ── Header fields (m_configs.table format) ──
  table: [
    { f_name: "ngay",          f_header: "Ngày lập",          f_header_en: "Date",               f_header_zh: "日期",
      f_types: "date",   f_show: 1, f_stt: 1,  f_width_col: 4, f_placeholder: "09/06/2026" },
    { f_name: "so_bao_gia",    f_header: "Số báo giá",        f_header_en: "Quote no.",          f_header_zh: "报价单号",
      f_types: "text",   f_show: 1, f_stt: 2,  f_width_col: 8, f_placeholder: "060626.01",
      f_li_auto: "daily_seq",
      f_li_auto_format: "{dd}{mm}{yy}.{seq:02}",
      f_li_auto_parse: String.raw`^(\d{6})\.(\d{1,2})$`,
      f_li_auto_prefix_group: 1, f_li_auto_seq_group: 2,
      f_validate: String.raw`^\d{6}\.\d{1,2}$`, f_unique: 1, f_input_chars: "doc_no" },
    { f_name: "hieu_luc_den",  f_header: "Hiệu lực đến",      f_header_en: "Valid until",        f_header_zh: "有效期至",
      f_types: "date",   f_show: 1, f_stt: 3,  f_width_col: 4, f_placeholder: "14/06/2026",
      f_li_auto: "date_offset", f_li_auto_ref: "ngay", f_li_auto_days: 5 },
    { f_name: "khach_hang_id", f_header: "Chọn khách hàng",   f_header_en: "Select customer",    f_header_zh: "选择客户",
      f_types: "co",     f_show: 1, f_stt: 4,  f_width_col: 12,
      f_cbo_query: JSON.stringify({ query: [{ fields: ["id", "ten_kh", "ma_kh", "dia_chi", "dai_dien", "dien_thoai"], obj_name: "tvp_khachhang", obj_where: "" }], options: [] }),
      f_grid: "pm_khachhang", f_grid_fields: "ten_kh->khach_hang,dia_chi->dia_chi_kh" },
    { f_name: "khach_hang",    f_header: "Tên khách hàng",    f_header_en: "Customer",           f_header_zh: "客户名称",
      f_types: "text",   f_show: 1, f_stt: 5,  f_width_col: 12 },
    { f_name: "dia_chi_kh",    f_header: "Địa chỉ KH",        f_header_en: "Customer address",   f_header_zh: "客户地址",
      f_types: "text",   f_show: 1, f_stt: 6,  f_width_col: 12 },
    { f_name: "nguoi_lien_he", f_header: "Người mua hàng – SĐT", f_header_en: "Buyer – phone", f_header_zh: "采购人–电话",
      f_types: "text",   f_show: 1, f_stt: 7, f_width_col: 12, f_placeholder: "Mr Thành - 0982476556" },
    { f_name: "nvkd",          f_header: "NV bán hàng – SĐT", f_header_en: "Sales rep. – phone", f_header_zh: "销售–电话",
      f_types: "text",   f_show: 1, f_stt: 8, f_width_col: 12, f_placeholder: "Mr Long - 0978349917" },
    { f_name: "phi_vc",        f_header: "Vận chuyển",        f_header_en: "Shipping",           f_header_zh: "运输",
      f_types: "co", f_show: 1, f_stt: 9, f_width_col: 10,
      f_cbo_query: JSON.stringify({ query: [], options: [
        { ma: "chua", ten: "Giá chưa bao gồm vận chuyển" },
        { ma: "da", ten: "Giá đã bao gồm vận chuyển" },
      ] }) },
    { f_name: "giai_doan",     f_header: "Giai đoạn",         f_header_en: "Stage",              f_header_zh: "阶段",
      f_types: "co", f_show: 1, f_stt: 10, f_width_col: 8,
      f_cbo_query: JSON.stringify({ query: [], options: [
        { ma: "nhap", ten: "Nháp" }, { ma: "bao_gia", ten: "Báo giá" },
        { ma: "lenh_sx_nb", ten: "Lệnh SX nội bộ" }, { ma: "lenh_sx_pxk", ten: "Lệnh SX + PXK" },
        { ma: "xuong", ten: "Đã gửi xưởng" },
      ] }) },
    { f_name: "trang_thai_bg", f_header: "Trạng thái BG",     f_header_en: "Quote status",       f_header_zh: "报价状态",
      f_types: "co", f_show: 1, f_stt: 11, f_width_col: 8,
      f_cbo_query: JSON.stringify({ query: [], options: [
        { ma: "nhap", ten: "Nháp" }, { ma: "da_gui", ten: "Đã gửi" },
        { ma: "thuong_luong", ten: "Đang thương lượng" }, { ma: "da_chot", ten: "Đã chốt" },
        { ma: "khong_chot", ten: "Không chốt" },
      ] }) },
    { f_name: "phien_ban",     f_header: "Phiên bản",         f_header_en: "Revision",           f_header_zh: "版本",
      f_types: "text",   f_show: 1, f_stt: 12, f_width_col: 4, f_placeholder: "E1" },
    { f_name: "so_lenh",       f_header: "Số lệnh SX",       f_header_en: "Production order no.", f_header_zh: "生产令号",
      f_types: "text",   f_show: 1, f_stt: 13,  f_width_col: 8, f_placeholder: "6508",
      f_li_auto: "daily_int",
      f_li_auto_parse: String.raw`^(\d+)`, f_li_auto_num_group: 1, f_li_auto_scope: "day",
      f_unique: 1, f_input_chars: "integer" },
    // Điều kiện giao hàng LSXNB (chi tiết)
    { f_name: "ngay_nghiem_thu", f_header: "Ngày nghiệm thu",   f_types: "date",   f_show: 1, f_stt: 30, f_width_col: 8 },
    { f_name: "van_chuyen_nd",   f_header: "Vận chuyển (chi tiết)", f_types: "text", f_show: 1, f_stt: 31, f_width_col: 12 },
    { f_name: "thong_tin_sp",    f_header: "Thông tin sản phẩm", f_types: "text",  f_show: 1, f_stt: 32, f_width_col: 12 },
    { f_name: "phieu_giao",      f_header: "Phiếu giao",         f_types: "text",  f_show: 1, f_stt: 33, f_width_col: 12 },
    { f_name: "thoi_gian_giao",  f_header: "Thời gian giao",    f_types: "text",   f_show: 1, f_stt: 34, f_width_col: 8 },
    { f_name: "nguoi_nhan",      f_header: "Người nhận hàng",   f_types: "text",   f_show: 1, f_stt: 35, f_width_col: 8 },
    { f_name: "dia_diem_giao",   f_header: "Địa điểm giao",     f_types: "text",   f_show: 1, f_stt: 36, f_width_col: 16 },
    { f_name: "thanh_toan_nd",   f_header: "Thanh toán",         f_types: "text",  f_show: 1, f_stt: 37, f_width_col: 12 },
    { f_name: "ghi_chu_giao",    f_header: "Ghi chú giao hàng",  f_types: "textarea", f_show: 1, f_stt: 38, f_width_col: 24 },
  ],

  // ── Line item columns ──
  line_items_columns: [
    { name: "ten_sp",     label: "Tên sản phẩm / Quy cách",  type: "text",    width: 200 },
    { name: "don_vi",     label: "Đơn vị", type: "select",  options: "m2|m|cái",  width: 66 },
    {
      name: "chieu_rong", label: "Chiều rộng / Hệ số",  type: "number", width: 88,
      // m²: hệ số khổ (1.13, 1.08…). m: khổ hiển thị, không nhân vào KL.
    },
    { name: "chieu_dai",  label: "Chiều dài",   type: "number", width: 86 },
    { name: "so_tam",     label: "Số tấm",       type: "number", width: 72 },
    {
      name: "khoi_luong", label: "Khối lượng",
      // formula_or_manual: nếu manual_condition=true → cho nhập tay (Hao phí)
      type: "formula_or_manual", width: 92, align: "right",
      formula: "don_vi === 'cái' ? (so_tam ?? 0) : don_vi === 'm' ? (chieu_dai ?? 0) * (so_tam ?? 0) : (chieu_rong ?? 1) * (chieu_dai ?? 0) * (so_tam ?? 0)",
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
    subtotal_label: "Cộng nhóm {{group}} - chưa VAT {{vat}}%",
  },

  line_items_ui: {
    header_title: "Thông tin đơn hàng",
    list_title: "Báo giá | LSXNB | LSX-PXK",
    date_ref_field: "ngay",
    create_label: "Tạo mới",
    edit_label: "Chỉnh sửa",
    back_label: "← Danh sách",
    field_sections: [
      {
        key: "bg",
        label: "Báo giá — thông tin chung",
        fields: [
          "ngay", "so_bao_gia", "hieu_luc_den",
          "khach_hang_id", "khach_hang", "dia_chi_kh",
          "nguoi_lien_he", "nvkd", "phi_vc",
        ],
      },
      {
        key: "flow",
        label: "Quy trình BG → LSXNB → LSX-PXK",
        fields: ["giai_doan", "trang_thai_bg", "phien_ban", "so_lenh"],
      },
      {
        key: "lsx",
        label: "LSX nội bộ — điều kiện giao hàng",
        fields: [
          "ngay_nghiem_thu", "van_chuyen_nd", "thong_tin_sp", "phieu_giao",
          "thoi_gian_giao", "nguoi_nhan", "dia_diem_giao", "thanh_toan_nd", "ghi_chu_giao",
        ],
      },
    ],
  },

  // ── Totals ──
  line_items_totals: [
    { key: "A", label: "Tổng giá trị hàng hóa chưa VAT",         formula: "groupSum" },
    { key: "B", label: "Tiền VAT 8%",                             formula: "vatSum(8) * 0.08" },
    { key: "C", label: "Tiền VAT 10%",                            formula: "vatSum(10) * 0.10" },
    { key: "D", label: "Tổng giá trị thanh toán, đã bao gồm VAT (A+B+C)", formula: "A + B + C", highlight: true, show_words: true },
  ],

  // ── Print buttons ──
  line_items_print: [
    {
      label: "Xuất Báo giá",
      trigger_key: "print_bao_gia",
      filename_expr: "`BaoGia_${order.so_bao_gia || 'draft'}.pdf`",
      print_table: { showPrice: true, showGroupSubtotal: true },
    },
    {
      label: "Xuất Lệnh SX nội bộ",
      trigger_key: "print_lenh_sx",
      filename_expr: "`LenhSX_${order.so_lenh || 'draft'}.pdf`",
      print_table: { showPrice: true, showGroupSubtotal: true },
    },
    {
      label: "Xuất Lệnh SX + PXK",
      trigger_key: "print_pxk",
      filename_expr: "`LenhSX_PXK_${order.so_lenh || 'draft'}.pdf`",
      print_table: {
        showPrice: false,
        showGroupSubtotal: false,
        hideColumns: ["chieu_rong", "don_gia", "thanh_tien"],
      },
    },
  ],

  line_items_workflow: PHUSON_WORKFLOW,

  // ── Trigger scripts (lưu encrypted trong production) ──
  trigger: {
    print_bao_gia: FN_BAO_GIA,
    print_lenh_sx: FN_LENH_SX,
    print_pxk:     FN_PXK,
    auto_parse_so_bao_gia: AUTO_PARSE_SO_BAO_GIA,
    auto_format_so_bao_gia: AUTO_FORMAT_SO_BAO_GIA,
    auto_parse_so_lenh: AUTO_PARSE_SO_LENH,
    auto_format_so_lenh: AUTO_FORMAT_SO_LENH,
  },
};
