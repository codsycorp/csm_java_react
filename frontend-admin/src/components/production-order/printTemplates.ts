// @ts-nocheck — legacy hardcoded reference; print templates live in m_configs.trigger.
import type { ProductionOrder, OrderCalc } from "./types";
import { calcItemKL, calcItemTT, groupLabel, soThanhChu, fmtVND, fmtNum } from "./utils";

const COMPANY = `CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN`;
const ADDR = `Địa chỉ: Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội`;
const MST = `MST: 0104113174`;
const WEB = `https://panelphuson.vn &nbsp;&nbsp; https://javta.vn`;
const NOTES_STD = [
  "Đơn giá đã bao gồm VAT: Tấm lợp PU, EPS, RW, GW, Vận chuyển thuế 8%; Phụ kiện tôn, inox, 1 lớp thuế 10%",
  "Dung sai kích thước chiều dài ±5mm, chiều rộng ±4mm",
  "Dung sai độ dày PU/EPS ±2mm, tấm lấy sáng ±0,2mm.",
  "Tỷ trọng PU ±3kg/m³, tỷ trọng EPS ±1kg/m³",
  "Dung sai độ dày tôn ±0,03÷0,04mm",
];

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; color: #000; line-height: 1.4; }
.page { width: 780px; padding: 15px 20px; }
.co-name { text-align: center; font-size: 13pt; font-weight: bold; text-transform: uppercase; }
.co-addr { text-align: center; font-size: 9.5pt; }
.co-mst  { text-align: center; font-size: 9.5pt; }
.doc-title { text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 14px 0 8px; }
.doc-sub { text-align: center; font-size: 10pt; font-style: italic; margin-bottom: 8px; }
.hdr-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 10.5pt; }
.hdr-table td { padding: 2px 4px; vertical-align: top; }
.intro { font-size: 10pt; margin-bottom: 8px; font-style: italic; }

/* Items table */
.it { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 6px 0; }
.it th { background: #d9d9d9; border: 1px solid #555; padding: 4px 3px; text-align: center; font-size: 9pt; }
.it td { border: 1px solid #555; padding: 3px; vertical-align: top; }
.it .c  { text-align: center; }
.it .r  { text-align: right; }
.it .grp-spec { background: #f2f2f2; font-size: 9pt; white-space: pre-wrap; font-weight: 600; }
.it .sub-row { background: #e8e8e8; font-weight: bold; font-size: 9pt; }
.it .tot-row td { background: #fff3cd; font-weight: bold; font-size: 10pt; }

/* Totals block */
.tot-wrap { display: flex; justify-content: flex-end; margin: 6px 0; }
.tot-tbl  { border-collapse: collapse; width: 340px; font-size: 10pt; }
.tot-tbl td { padding: 2px 6px; border: 1px solid #aaa; }
.tot-tbl .lbl { font-weight: 600; }
.tot-tbl .amt { text-align: right; font-weight: 600; }
.tot-tbl .grand td { background: #cfe2ff; font-weight: bold; font-size: 10.5pt; }
.bang-chu { font-style: italic; margin: 6px 0 10px; font-size: 10pt; }

/* Notes */
.note-block { font-size: 9.5pt; margin: 6px 0; }
.note-block .lbl { font-weight: bold; }
.note-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; }

/* Payment / delivery */
.payment { font-size: 9.5pt; margin: 8px 0 4px; }
.pay-title { font-weight: bold; margin-bottom: 2px; }
.delivery-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; font-size: 10pt; margin: 6px 0; }
.delivery-item { display: flex; gap: 4px; }
.delivery-item .dlbl { font-weight: bold; min-width: 100px; }

/* Signatures */
.sig-row  { display: flex; justify-content: space-between; margin-top: 18px; }
.sig-box  { text-align: center; min-width: 130px; font-size: 9.5pt; }
.sig-box .sig-lbl { font-weight: bold; margin-bottom: 2px; }
.sig-box .sig-note { font-size: 8.5pt; color: #444; }
.sig-box .sig-name { margin-top: 38px; font-weight: bold; font-size: 9.5pt; }

/* PXK receive line */
.receive-line { margin: 16px 0 8px; font-size: 10pt; border-top: 1px solid #aaa; padding-top: 10px; }
`;

// ─── Items table builder (shared for all 3 doc types) ─────────────────────────

function buildItemsTable(
  order: ProductionOrder,
  calc: OrderCalc,
  showPrice: boolean,
): string {
  const priceHeaders = showPrice
    ? `<th style="width:9%">Đơn giá<br/>(VNĐ)</th><th style="width:10%">Thành tiền<br/>(VNĐ)</th>`
    : "";

  let rows = "";

  order.groups.forEach((group, gIdx) => {
    const label = groupLabel(gIdx);
    const gc = calc.groups[group.id];
    const specHtml = group.spec.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const colSpan = showPrice ? 9 : 7;

    // Group spec header row
    rows += `<tr>
      <td class="c grp-spec" style="font-weight:bold;width:4%">${label}.</td>
      <td colspan="${colSpan - 1}" class="grp-spec">${specHtml}</td>
    </tr>`;

    // Subtotal row (appears before items, matching PDF layout)
    const subPriceCells = showPrice
      ? `<td class="r sub-row">${gc?.uniform_don_gia != null ? fmtVND(gc.uniform_don_gia) : ""}</td>
         <td class="r sub-row">${gc ? fmtVND(gc.thanh_tien) : ""}</td>`
      : "";
    rows += `<tr>
      <td class="sub-row"></td>
      <td class="sub-row" colspan="3">Cộng nhóm ${label} – chưa VAT ${group.vat_rate}%</td>
      <td class="r sub-row">${gc ? gc.so_tam : ""}</td>
      <td class="r sub-row">${gc ? fmtNum(gc.khoi_luong) : ""}</td>
      ${subPriceCells}
    </tr>`;

    // Item rows
    group.items.forEach((item, idx) => {
      const kl = calcItemKL(item);
      const tt = calcItemTT(item);
      const priceCells = showPrice
        ? `<td class="r">${item.don_gia != null ? fmtVND(item.don_gia) : ""}</td>
           <td class="r">${tt ? fmtVND(tt) : ""}</td>`
        : "";
      rows += `<tr>
        <td class="c">${idx + 1}</td>
        <td>${item.ten_sp}</td>
        <td class="c">${item.don_vi}</td>
        <td class="r">${item.chieu_rong != null ? fmtNum(item.chieu_rong, 2) : ""}</td>
        <td class="r">${item.chieu_dai != null ? fmtNum(item.chieu_dai, 3) : ""}</td>
        <td class="r">${item.so_tam != null ? item.so_tam : ""}</td>
        <td class="r">${kl ? fmtNum(kl) : ""}</td>
        ${priceCells}
      </tr>`;
    });
  });

  return `
  <table class="it">
    <thead>
      <tr>
        <th style="width:4%">TT</th>
        <th style="width:${showPrice ? "28%" : "40%"}">Tên sản phẩm/Quy cách</th>
        <th style="width:5%">Đơn<br/>vị</th>
        <th style="width:7%">Chiều<br/>rộng</th>
        <th style="width:7%">Chiều<br/>dài</th>
        <th style="width:6%">Số<br/>tấm</th>
        <th style="width:8%">Khối<br/>lượng</th>
        ${priceHeaders}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ─── Totals block ──────────────────────────────────────────────────────────────

function buildTotals(calc: OrderCalc): string {
  const bangChu = soThanhChu(calc.D);
  return `
  <div class="tot-wrap">
    <table class="tot-tbl">
      <tr><td class="lbl">A &nbsp; Tổng giá trị hàng hóa chưa VAT:</td><td class="amt">${fmtVND(calc.A)}</td></tr>
      <tr><td class="lbl">B &nbsp; Tiền VAT 8%</td><td class="amt">${fmtVND(calc.B)}</td></tr>
      <tr><td class="lbl">C &nbsp; Tiền VAT 10%</td><td class="amt">${fmtVND(calc.C)}</td></tr>
      <tr class="grand"><td class="lbl">D &nbsp; Tổng giá trị thanh toán (A+B+C):</td><td class="amt">${fmtVND(calc.D)}</td></tr>
    </table>
  </div>
  <div class="bang-chu"><b>Bằng chữ:</b> ${bangChu}</div>`;
}

// ─── Notes block ──────────────────────────────────────────────────────────────

function buildNotes(phi_vc: "chua" | "da"): string {
  const note6 = phi_vc === "da"
    ? "Giá trên đã bao gồm vận chuyển."
    : "Giá trên chưa bao gồm vận chuyển.";
  const allNotes = [...NOTES_STD, note6];
  const items = allNotes.map((n, i) => `<div>${i + 1}. ${n}</div>`).join("");
  return `<div class="note-block"><div class="lbl">Ghi chú:</div><div class="note-grid">${items}</div></div>`;
}

// ─── Doc wrapper ──────────────────────────────────────────────────────────────

function wrap(title: string, subtitle: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>${BASE_CSS}</style>
</head><body><div class="page">
  <div class="co-name">${COMPANY}</div>
  <div class="co-addr">${ADDR}</div>
  <div class="co-mst">${MST} &nbsp;&nbsp;&nbsp; ${WEB}</div>
  <div class="doc-title">${title}</div>
  ${subtitle ? `<div class="doc-sub">${subtitle}</div>` : ""}
  ${body}
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bản 1: BÁO GIÁ
// ═══════════════════════════════════════════════════════════════════════════════

export function buildBaoGiaHtml(order: ProductionOrder, calc: OrderCalc): string {
  const hdr = `
  <table class="hdr-table">
    <tr>
      <td style="width:55%">Kính gửi: <b>${order.khach_hang}</b></td>
      <td>Số: <b>${order.so_bao_gia}</b> &nbsp;&nbsp; Ngày: <b>${order.ngay}</b></td>
    </tr>
    <tr>
      <td>Địa chỉ: ${order.dia_chi_kh}</td>
      <td>Hiệu lực đến: <b>${order.hieu_luc_den}</b></td>
    </tr>
    <tr>
      <td>Người liên hệ: ${order.nguoi_lien_he}</td>
      <td>NVKD: <b>${order.nvkd}</b></td>
    </tr>
  </table>
  <div class="intro">Cảm ơn Quý khách hàng đã quan tâm tới sản phẩm do Công ty TNHH Công nghệ Công nghiệp Phú Sơn sản xuất.
  Chúng tôi xin gửi Báo giá sản phẩm theo yêu cầu Quý khách đã cung cấp với nội dung như sau:</div>`;

  const itemsTable = buildItemsTable(order, calc, true);
  const totals = buildTotals(calc);
  const notes = buildNotes(order.phi_vc);

  const payment = `
  <div class="payment">
    <div class="pay-title">Phương thức thanh toán:</div>
    <div>- Lần 1: Bên mua đặt cọc sản xuất tương ứng 50% giá trị đơn hàng ngay sau khi xác nhận đơn đặt hàng.</div>
    <div>- Lần 2: Thanh toán 50% giá trị còn lại và lấy phát sinh (nếu có) trước khi xuất xưởng của bên bán</div>
    <div style="margin-top:4px">Thông tin tài khoản nhận đơn đặt hàng:</div>
    <div>Tên TK: Công ty TNHH Công Nghệ Công Nghiệp Phú Sơn.</div>
    <div>Số TK: 7999989399 mở tại ngân hàng TMCP Quân Đội - CN Hai Bà Trưng</div>
  </div>`;

  const sigs = `
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-lbl">ĐẠI DIỆN BÊN MUA</div>
      <div class="sig-note">(ký, ghi rõ họ tên)</div>
      <div class="sig-name"></div>
    </div>
    <div class="sig-box">
      <div class="sig-lbl">ĐẠI DIỆN BÊN BÁN</div>
      <div class="sig-note">(ký, ghi rõ họ tên)</div>
      <div class="sig-name">${order.nvkd}</div>
    </div>
  </div>`;

  return wrap(
    "BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG",
    "",
    hdr + itemsTable + totals + notes + payment + sigs,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bản 2: LỆNH SẢN XUẤT NỘI BỘ
// ═══════════════════════════════════════════════════════════════════════════════

export function buildLenhSXHtml(order: ProductionOrder, calc: OrderCalc): string {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${now.toLocaleDateString("vi-VN")}`;

  const hdr = `
  <table class="hdr-table">
    <tr>
      <td style="width:50%">Số lệnh sản xuất: <b>${order.so_lenh}</b></td>
      <td>Thời gian gửi: <b>${timeStr}</b></td>
    </tr>
  </table>
  <table class="hdr-table">
    <tr>
      <td style="width:60%">Khách hàng: <b>${order.khach_hang}</b></td>
      <td>NVKD: <b>${order.nvkd}</b></td>
    </tr>
    <tr>
      <td>Liên hệ: ${order.nguoi_lien_he}</td>
      <td>Điện thoại: ${order.nvkd.split(" - ")[1] ?? ""}</td>
    </tr>
  </table>
  <div style="font-weight:bold;margin:6px 0 2px">* NỘI DUNG YÊU CẦU SẢN XUẤT:</div>`;

  const itemsTable = buildItemsTable(order, calc, true);
  const totals = buildTotals(calc);
  const notes = buildNotes(order.phi_vc);

  const d = order.delivery;
  const delivery = `
  <div style="font-weight:bold;margin:10px 0 4px;font-size:10.5pt">** ĐIỀU KIỆN GIAO HÀNG VÀ THANH TOÁN</div>
  <div class="delivery-grid">
    <div class="delivery-item"><span class="dlbl">1. Nghiệm thu:</span><span>tại Nhà máy Phú Sơn</span></div>
    <div class="delivery-item"><span class="dlbl">2. Ngày nghiệm thu:</span><span>${d.ngay_nghiem_thu}</span></div>
    <div class="delivery-item"><span class="dlbl">3. Vận chuyển:</span><span>${d.van_chuyen_nd}</span></div>
    <div class="delivery-item"><span class="dlbl">4. Thông tin SP:</span><span>${d.thong_tin_sp}</span></div>
    <div class="delivery-item"><span class="dlbl">5. Phiếu giao:</span><span>${d.phieu_giao}</span></div>
    <div class="delivery-item"><span class="dlbl">6. Thời gian giao:</span><span><b>${d.thoi_gian_giao}</b></span></div>
  </div>
  <div class="delivery-item" style="font-size:10pt;margin:3px 0">
    <span class="dlbl">7. Người nhận:</span><span>${d.nguoi_nhan}</span>
  </div>
  <div class="delivery-item" style="font-size:10pt;margin:3px 0">
    <span class="dlbl">8. Địa điểm:</span><span>${d.dia_diem_giao}</span>
  </div>
  <div class="delivery-item" style="font-size:10pt;margin:3px 0">
    <span class="dlbl">9. Thanh toán:</span><span>${d.thanh_toan_nd}</span>
  </div>
  <div class="delivery-item" style="font-size:10pt;margin:3px 0">
    <span class="dlbl">10. Ghi chú:</span><span>${d.ghi_chu_giao}</span>
  </div>`;

  const sigs = `
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-lbl">GIÁM ĐỐC PHÊ DUYỆT</div>
      <div class="sig-note">(ký, ghi rõ họ tên)</div>
      <div class="sig-name"></div>
    </div>
    <div class="sig-box">
      <div class="sig-lbl">NGƯỜI YÊU CẦU SẢN XUẤT</div>
      <div class="sig-note">(ký, ghi rõ họ tên)</div>
      <div class="sig-name">${order.nvkd}</div>
    </div>
  </div>`;

  return wrap(
    "LỆNH SẢN XUẤT",
    `Số lệnh: ${order.so_lenh}/PS`,
    hdr + itemsTable + totals + notes + delivery + sigs,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bản 3: LỆNH SẢN XUẤT KIÊM PHIẾU XUẤT KHO (không hiện giá)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildPXKHtml(order: ProductionOrder, calc: OrderCalc): string {
  const d = order.delivery;
  const dateStr = order.ngay;
  const parts = dateStr.split("/");
  const dayStr = parts[0] ?? "";
  const monStr = parts[1] ?? "";
  const yearStr = parts[2] ?? "";

  const hdr = `
  <div style="text-align:center;font-style:italic;margin-bottom:6px">
    Ngày ${dayStr} tháng ${monStr} năm ${yearStr}
  </div>
  <table class="hdr-table">
    <tr>
      <td style="width:60%">Khách hàng: <b>${order.khach_hang}</b></td>
      <td>Số: <b>${order.so_lenh}/PS</b></td>
    </tr>
    <tr>
      <td>Địa chỉ: ${order.dia_chi_kh}</td>
      <td></td>
    </tr>
    <tr>
      <td>Thời gian giao: <b>${d.thoi_gian_giao}</b></td>
      <td>Người nhận hàng: <b>${d.nguoi_nhan}</b></td>
    </tr>
    <tr>
      <td colspan="2">Giao hàng tại: <b>${d.dia_diem_giao}</b></td>
    </tr>
    <tr>
      <td colspan="2">Nhân viên KD: <b>${order.nvkd}</b></td>
    </tr>
  </table>`;

  // PXK: không hiện đơn giá / thành tiền
  const itemsTable = buildItemsTable(order, calc, false);

  const receive = `
  <div class="receive-line">
    Khách hàng nhận hàng lúc: …….... giờ …….. phút, ngày ….. tháng ….. năm ${yearStr || new Date().getFullYear()}
  </div>`;

  const sigs5 = `
  <div class="sig-row" style="justify-content:space-around">
    ${["Người lập phiếu", "Người nhận hàng", "Lái xe", "Thủ kho", "BGĐ Nhà máy"].map(lbl => `
      <div class="sig-box">
        <div class="sig-lbl">${lbl}</div>
        <div class="sig-note">(ký, ghi rõ họ tên)</div>
        <div class="sig-name"></div>
      </div>`).join("")}
  </div>`;

  return wrap(
    "LỆNH SẢN XUẤT KIÊM PHIẾU XUẤT KHO",
    "",
    hdr + itemsTable + receive + sigs5,
  );
}
