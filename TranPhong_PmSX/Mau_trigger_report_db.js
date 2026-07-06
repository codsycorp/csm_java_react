// report_db body for CSM csm_baocao.vue
// Runtime calls: Function("seft", "data", "bang", report_db_body)

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const rows = Array.isArray(bang?.m_baogia_ct?.rows)
  ? bang.m_baogia_ct.rows
  : [];

const items = rows.map((r, i) => {
  const qty = Number(r.so_luong || 0);
  const price = Number(r.don_gia || 0);
  const amount = qty * price;
  return {
    stt: i + 1,
    ten_hang: r.ten_hang || "",
    dvt: r.dvt || "",
    so_luong: qty,
    don_gia: fmt(price),
    thanh_tien: fmt(amount)
  };
});

const tongTruocThue = items.reduce((s, x) => s + Number(String(x.thanh_tien).replace(/,/g, "") || 0), 0);
const vatPercent = Number(data?.vat_percent || 10);
const tienVat = Math.round((tongTruocThue * vatPercent) / 100);
const tongThanhToan = tongTruocThue + tienVat;

return {
  ten_cong_ty: bang?.sys_apps?.rows?.[0]?.app_name || "CONG TY TNHH ABC",
  com_logo: seft?.com_logo || "https://dummyimage.com/180x60/ffffff/000000.png&text=LOGO",
  so_bao_gia: data?.so_bao_gia || "BG-DRAFT",
  ngay_bao_gia: data?.ngay_bao_gia || new Date().toLocaleDateString("vi-VN"),
  ten_khach_hang: data?.ten_khach_hang || "",
  dia_chi_khach_hang: data?.dia_chi_khach_hang || "",
  dien_thoai_khach_hang: data?.dien_thoai_khach_hang || "",
  ghi_chu_dau_trang: data?.ghi_chu_dau_trang || "",
  items,
  tong_tien_truoc_thue: fmt(tongTruocThue),
  vat_percent: vatPercent,
  tien_vat: fmt(tienVat),
  tong_thanh_toan: fmt(tongThanhToan),
  tong_tien_bang_chu: data?.tong_tien_bang_chu || "",
  dieu_khoan_thanh_toan: data?.dieu_khoan_thanh_toan || "",
  thoi_gian_giao_hang: data?.thoi_gian_giao_hang || "",
  nguoi_lap: data?.nguoi_lap || "",
  khach_hang_xac_nhan: data?.khach_hang_xac_nhan || ""
};
