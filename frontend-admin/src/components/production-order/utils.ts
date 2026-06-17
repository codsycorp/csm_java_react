import type {
  LiColumnDef, LiTotalConfig, LiPrintTableOpts, LineItem,
  ProductGroup, GroupCalcResult, EditorCalcResult,
  OrderHeader, LineItemsUiConfig,
} from "./types";
import { resolveTriLangLabel } from "./line-items-label";
import { getFieldLiAuto, isDateFieldConfig } from "./line-items-field-utils";
import {
  nextAutoFieldValue,
  validateAutoFieldValue,
  type LiAutoEngineContext,
} from "./line-items-auto-engine";

// ─── Formula evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate a JS expression with field values as variables.
 * Used for "formula" columns and totals.
 */
export function evalFormula(
  formula: string,
  vars: Record<string, any>,
): number | null {
  if (!formula) return null;
  try {
    const keys = Object.keys(vars);
    const vals = Object.values(vars);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict";try{const _r=(${formula});return _r==null?null:Number(_r);}catch{return null;}`);
    return fn(...vals);
  } catch {
    return null;
  }
}

export function evalCondition(formula: string, vars: Record<string, any>): boolean {
  if (!formula) return false;
  try {
    const keys = Object.keys(vars);
    const vals = Object.values(vars);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict";try{return !!(${formula});}catch{return false;}`);
    return Boolean(fn(...vals));
  } catch {
    return false;
  }
}

/**
 * Compute auto-calculated column values for a single row.
 * Returns a new row object with formula columns filled in.
 */
export function computeRowValues(
  row: LineItem,
  columns: LiColumnDef[],
): Record<string, any> {
  const result: Record<string, any> = { ...row };
  // Cột chưa nhập → null để công thức / manual_condition tham chiếu an toàn
  for (const col of columns) {
    if (!(col.name in result)) result[col.name] = null;
  }
  for (const col of columns) {
    if (col.type !== "formula" && col.type !== "formula_or_manual") continue;
    // For formula_or_manual: only compute if NOT in manual mode
    if (col.type === "formula_or_manual") {
      const isManual = col.manual_condition
        ? evalCondition(col.manual_condition, result)
        : false;
      if (isManual) continue; // keep user-entered value
    }
    if (!col.formula) continue;
    const computed = evalFormula(col.formula, result);
    result[col.name] = computed != null ? computed : null;
  }
  return result;
}

// ─── Find "KL" and "TT" columns (convention: last two formula cols) ───────────

function findSumCols(columns: LiColumnDef[]): { klCol?: string; ttCol?: string } {
  const formulaCols = columns.filter(c =>
    c.type === "formula" || c.type === "formula_or_manual",
  );
  if (formulaCols.length === 0) return {};
  if (formulaCols.length === 1) return { ttCol: formulaCols[0].name };
  return {
    klCol: formulaCols[formulaCols.length - 2].name,
    ttCol: formulaCols[formulaCols.length - 1].name,
  };
}

function findSoTamCol(columns: LiColumnDef[]): string | undefined {
  // heuristic: number column named "so_tam" or "so_luong" or "qty"
  const candidates = ["so_tam", "so_luong", "qty", "quantity"];
  for (const c of candidates) {
    if (columns.find(col => col.name === c)) return c;
  }
  // fallback: first non-formula number col
  return columns.find(c => c.type === "number" || c.type === "price")?.name;
}

function findPriceCol(columns: LiColumnDef[]): string | undefined {
  const candidates = ["don_gia", "unit_price", "price", "gia"];
  for (const c of candidates) {
    if (columns.find(col => col.name === c)) return c;
  }
  return undefined;
}

// ─── Group calculation ────────────────────────────────────────────────────────

export function calcGroupResult(
  group: ProductGroup,
  columns: LiColumnDef[],
): GroupCalcResult {
  const { klCol, ttCol } = findSumCols(columns);
  const soTamCol = findSoTamCol(columns);
  const priceCol = findPriceCol(columns);

  let sumKL = 0;
  let sumTT = 0;
  let sumSoTam = 0;
  let firstPrice: number | null = null;
  let uniformPrice = true;

  for (const rawItem of group.items) {
    const item = computeRowValues(rawItem, columns);
    if (klCol) sumKL += Number(item[klCol] ?? 0);
    if (ttCol) sumTT += Number(item[ttCol] ?? 0);
    if (soTamCol) sumSoTam += Number(item[soTamCol] ?? 0);
    if (priceCol) {
      const p = item[priceCol] as number | null;
      if (p != null) {
        if (firstPrice === null) firstPrice = p;
        else if (p !== firstPrice) uniformPrice = false;
      }
    }
  }

  const klRounded = parseFloat(sumKL.toFixed(3));
  // Excel: nhóm đơn giá đồng nhất → J_sub = I_nhóm × H_sub; nhóm nhiều giá → SUM(J_dòng)
  const sum = uniformPrice && firstPrice != null
    ? Math.round(firstPrice * klRounded)
    : Math.round(sumTT);

  return {
    sum,
    kl: klRounded,
    so_tam: sumSoTam,
    uniform_price: uniformPrice ? firstPrice : null,
  };
}

// ─── Order-level calculation ──────────────────────────────────────────────────

export function calcEditorTotals(
  groups: ProductGroup[],
  columns: LiColumnDef[],
  totalConfigs: LiTotalConfig[],
): EditorCalcResult {
  const groupResults: Record<string, GroupCalcResult> = {};
  for (const g of groups) {
    groupResults[g.id] = calcGroupResult(g, columns);
  }

  // Build totals top-down
  const totals: Record<string, number> = {};
  const groupSum = groups.reduce((s, g) => s + (groupResults[g.id]?.sum ?? 0), 0);

  function vatSum(rate: number): number {
    return groups
      .filter(g => g.vat_rate === rate)
      .reduce((s, g) => s + (groupResults[g.id]?.sum ?? 0), 0);
  }

  for (const tc of totalConfigs) {
    const vars: Record<string, any> = { ...totals, groupSum, vatSum };
    const val = evalFormula(tc.formula, vars);
    totals[tc.key] = Math.round(val ?? 0);
  }

  return { totals, groups: groupResults };
}

// ─── Runtime eval for print templates ────────────────────────────────────────

/**
 * Eval a stored function body and call it with (order, groups, calc, utils).
 * The function body must return an HTML string.
 */
export function evalPrintTemplate(
  fnBody: string,
  order: Record<string, any>,
  groups: ProductGroup[],
  calc: EditorCalcResult,
  utils: Record<string, any>,
): string {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("order", "groups", "calc", "utils", fnBody);
    const result = fn(order, groups, calc, utils);
    if (typeof result === "string") return result;
    return "<p style='color:red'>Template không trả về HTML string.</p>";
  } catch (e: any) {
    return `<p style='color:red'>Lỗi render template: ${String(e?.message ?? e)}</p>`;
  }
}

// ─── Number to words (Vietnamese) ────────────────────────────────────────────

const ONES = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const DVT  = ["", "nghìn", "triệu", "tỷ"];

function doc3(n: number, isLead: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  let s = "";
  if (h > 0) s += ONES[h] + " trăm ";
  else if (!isLead) s += "không trăm ";
  if (t === 0) {
    if (o > 0) s += (h > 0 || !isLead ? "lẻ " : "") + ONES[o];
  } else if (t === 1) {
    s += "mười";
    if (o === 5) s += " lăm";
    else if (o > 0) s += " " + ONES[o];
  } else {
    s += ONES[t] + " mươi";
    if (o === 1) s += " mốt";
    else if (o === 5) s += " lăm";
    else if (o > 0) s += " " + ONES[o];
  }
  return s.trim();
}

export function soThanhChu(so: number): string {
  so = Math.round(Math.abs(so));
  if (so === 0) return "Không đồng ./.";
  const blocks: number[] = [];
  let n = so;
  while (n > 0) { blocks.push(n % 1000); n = Math.floor(n / 1000); }
  const parts: string[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i] === 0) continue;
    const t = doc3(blocks[i], parts.length === 0);
    parts.push(t + (DVT[i] ? " " + DVT[i] : ""));
  }
  const r = parts.join(", ");
  return r.charAt(0).toUpperCase() + r.slice(1) + " đồng ./.";
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function fmtVND(n: number | null | undefined): string {
  if (n == null) return "";
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

export function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n == null) return "";
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0, maximumFractionDigits: dec,
  }).format(n);
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function groupLabel(idx: number): string {
  return ROMAN[idx] ?? String(idx + 1);
}

// ─── Print helpers (also passed via utils at runtime) ─────────────────────────

const DEFAULT_COMPANY: Record<string, string> = {
  ten_cong_ty: "CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN",
  dia_chi: "Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội",
  mst: "0104113174",
  website: "https://panelphuson.vn",
  email: "https://javta.vn",
  logo_url: "",
};

/** Ghép số lệnh in: 6508 + E1 → 6508/PS.E1 (không lặp /PS). */
export function formatSoLenh(soLenh?: string, phienBan?: string): string {
  let s = String(soLenh ?? "").trim();
  const pb = String(phienBan ?? "").trim();
  if (!s) return pb ? `/PS.${pb}` : "";
  if (!/\/PS/i.test(s)) s = `${s}/PS`;
  if (pb && !new RegExp(`\\.${pb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(s)) {
    s = s.replace(/\.\w+$/, "") + `.${pb}`;
  }
  return s;
}

/** Định dạng ngày chuẩn DD/MM/YYYY. */
export function formatNgay(date?: Date): string {
  const d = date ?? new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Kiểm tra và chuẩn hoá chuỗi ngày DD/MM/YYYY (từ chối ngày không hợp lệ). */
export function normalizeNgayString(ngay?: string): string | null {
  const m = String(ngay ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return formatNgay(d);
}

export function isValidNgay(ngay?: string): boolean {
  return normalizeNgayString(ngay) != null;
}

export function addDaysToNgay(ngay: string, days: number): string | null {
  const norm = normalizeNgayString(ngay);
  if (!norm) return null;
  const d = parseNgayDate(norm)!;
  d.setDate(d.getDate() + days);
  return formatNgay(d);
}

/** Gợi ý số báo giá ddmmyy.01 theo ngày lập. */
export function formatSoBaoGia(date?: Date, seq = 1): string {
  const d = date ?? new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}.${String(seq).padStart(2, "0")}`;
}

export function soBaoGiaPrefix(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

/** @deprecated Dùng parseAutoFieldValue(fieldConfig, value) — giữ cho trigger cũ */
export function parseSoBaoGia(value?: string): { prefix: string; seq: number } | null {
  const m = String(value ?? "").trim().match(/^(\d{6})\.(\d{1,2})$/);
  if (!m) return null;
  return { prefix: m[1], seq: Number(m[2]) };
}

/** @deprecated Dùng parseAutoFieldValue(fieldConfig, value) */
export function parseSoLenhBase(value?: string): number | null {
  const m = String(value ?? "").trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

export function resolveDateRefField(
  headerFields: Record<string, any>[],
  ui?: LineItemsUiConfig,
): string {
  const configured = String(ui?.date_ref_field ?? "").trim().toLowerCase();
  if (configured) return configured;
  const first = (headerFields ?? []).find(
    (f) => isDateFieldConfig(f) && String(f.f_types ?? "").toLowerCase() === "date",
  );
  return String(first?.f_name ?? "ngay").toLowerCase();
}

/** Sinh giá trị auto cho các field có f_li_auto trong menu config. */
export function buildAutoHeaderValues(
  headerFields: Record<string, any>[],
  header: OrderHeader,
  rows: Record<string, any>[],
  opts?: {
    excludePk?: string;
    pkField?: string;
    ui?: LineItemsUiConfig;
    engineCtx?: LiAutoEngineContext;
  },
): Record<string, any> {
  const pkField = opts?.pkField ?? "id";
  const dateRef = resolveDateRefField(headerFields, opts?.ui);
  const ngayRaw = String(header[dateRef] ?? "").trim();
  const norm = normalizeNgayString(ngayRaw) ?? formatNgay(new Date());
  const out: Record<string, any> = {};

  for (const f of headerFields ?? []) {
    const name = String(f.f_name ?? "").toLowerCase();
    if (!name) continue;
    if (!getFieldLiAuto(f)) continue;
    out[name] = nextAutoFieldValue(f, norm, name, rows, {
      excludePk: opts?.excludePk,
      pkField,
      dateRefField: dateRef,
      header,
      engineCtx: opts?.engineCtx,
    });
  }
  return out;
}

/** @deprecated — dùng buildAutoHeaderValues */
export function buildAutoHeaderNumbers(
  ngay: string,
  rows: Record<string, any>[],
  opts?: { excludePk?: string; pkField?: string },
): { so_bao_gia: string; so_lenh: string; hieu_luc_den: string } {
  const stubBg = { f_li_auto: "daily_seq", f_li_auto_format: "{dd}{mm}{yy}.{seq:02}", f_li_auto_parse: String.raw`^(\d{6})\.(\d{1,2})$`, f_li_auto_prefix_group: 1, f_li_auto_seq_group: 2 };
  const stubLenh = { f_li_auto: "daily_int", f_li_auto_parse: String.raw`^(\d+)`, f_li_auto_num_group: 1 };
  const stubHl = { f_li_auto: "date_offset", f_li_auto_days: 5, f_li_auto_ref: "ngay" };
  const norm = normalizeNgayString(ngay) ?? formatNgay(new Date());
  const pk = opts?.pkField ?? "id";
  return {
    so_bao_gia: nextAutoFieldValue(stubBg, norm, "so_bao_gia", rows, { ...opts, pkField: pk, dateRefField: "ngay" }),
    so_lenh: nextAutoFieldValue(stubLenh, norm, "so_lenh", rows, { ...opts, pkField: pk, dateRefField: "ngay" }),
    hieu_luc_den: nextAutoFieldValue(stubHl, norm, "hieu_luc_den", rows, { dateRefField: "ngay" }),
  };
}

export function validateLineItemsHeader(
  header: OrderHeader,
  rows: Record<string, any>[],
  headerFields: Record<string, any>[],
  opts?: { excludePk?: string; pkField?: string; engineCtx?: LiAutoEngineContext },
): { ok: boolean; message?: string } {
  const pkField = opts?.pkField ?? "id";
  const excludePk = opts?.excludePk;

  for (const f of headerFields) {
    const name = String(f.f_name ?? "").toLowerCase();
    if (!name) continue;
    const label = String(f.f_header ?? name);
    const val = header[name];
    if (val == null || val === "") continue;

    const types = String(f.f_types ?? "ed").toLowerCase();
    if (isDateFieldConfig(f) && types !== "datetime") {
      if (!isValidNgay(String(val))) {
        return { ok: false, message: `"${label}" không hợp lệ (định dạng DD/MM/YYYY)` };
      }
    }

    const rule = getFieldLiAuto(f);
    if (rule && !validateAutoFieldValue(f, String(val), opts?.engineCtx)) {
      const hint = String(f.f_placeholder ?? f.f_li_auto_format ?? "").trim();
      return {
        ok: false,
        message: hint
          ? `"${label}" không đúng định dạng (vd: ${hint})`
          : `"${label}" không đúng định dạng`,
      };
    }

    const pattern = String(f.f_validate ?? "").trim();
    if (pattern) {
      try {
        if (!new RegExp(pattern).test(String(val))) {
          return { ok: false, message: `"${label}" không đúng định dạng yêu cầu` };
        }
      } catch { /* invalid regex in config — skip */ }
    }

    if (rule?.mode === "daily_seq" || rule?.mode === "daily_int" || Number(f.f_unique ?? 0) === 1) {
      const text = String(val).trim();
      const dup = rows.find((row) => {
        if (excludePk && String(row[pkField] ?? row.id ?? "") === excludePk) return false;
        return String(row[name] ?? "").trim() === text;
      });
      if (dup) return { ok: false, message: `"${label}" "${text}" đã tồn tại` };
    }
  }

  return { ok: true };
}

export function parseNgayDate(ngay?: string): Date | undefined {
  const norm = normalizeNgayString(ngay);
  if (!norm) return undefined;
  const m = norm.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function buildCompanyHdr(cfg: Record<string, any> = {}): string {
  const c = { ...DEFAULT_COMPANY, ...cfg };
  const links = [c.website, c.email].filter(Boolean).join(" &nbsp;&nbsp; ");
  const logoUrl = String(c.logo_url ?? c.logo ?? c.f_logo ?? "").trim();
  const companyName = String(c.ten_cong_ty ?? c.app_name ?? c.name ?? DEFAULT_COMPANY.ten_cong_ty).trim();
  const logoHtml = logoUrl
    ? `<div style="text-align:center;margin-bottom:6px"><img src="${logoUrl.replace(/"/g, "&quot;")}" alt="" style="max-height:64px;max-width:220px;object-fit:contain"/></div>`
    : "";
  return `${logoHtml}<div class="co-name">${companyName}</div>
  <div class="co-addr">Địa chỉ: ${c.dia_chi}</div>
  <div class="co-addr">MST: ${c.mst}${links ? ` &nbsp;&nbsp; ${links}` : ""}</div>`;
}

const DEFAULT_PRINT_COLUMN_ORDER = [
  "ten_sp", "don_vi", "chieu_rong", "chieu_dai", "so_tam", "khoi_luong", "don_gia", "thanh_tien",
];

const PRINT_COL_META: Record<string, { header: string; width: string; align: "left" | "right" | "center"; decimals?: number }> = {
  ten_sp: { header: "Tên sản phẩm/Quy cách", width: "26%", align: "left" },
  don_vi: { header: "Đơn vị", width: "5%", align: "center" },
  chieu_rong: { header: "Chiều<br/>rộng", width: "7%", align: "right" },
  chieu_dai: { header: "Chiều<br/>dài", width: "8%", align: "right", decimals: 3 },
  so_tam: { header: "Số<br/>tấm", width: "6%", align: "right" },
  khoi_luong: { header: "Khối<br/>lượng", width: "8%", align: "right" },
  don_gia: { header: "Đơn giá<br/>(VNĐ)", width: "9%", align: "right" },
  thanh_tien: { header: "Thành tiền<br/>(VNĐ)", width: "10%", align: "right" },
};

function isPriceColumn(name: string, col?: LiColumnDef): boolean {
  if (col?.type === "price") return true;
  return name === "don_gia" || name === "thanh_tien" || name.includes("gia") || name.includes("tien");
}

function resolvePrintTableColumns(
  columns: LiColumnDef[] | undefined,
  opts: LiPrintTableOpts,
): string[] {
  const priceHidden = opts.showPrice === false;
  const hideSet = new Set((opts.hideColumns ?? []).map(n => String(n).trim()).filter(Boolean));
  let names: string[];
  if (opts.visibleColumns?.length) {
    names = opts.visibleColumns.map(n => String(n).trim()).filter(Boolean);
  } else if (columns?.length) {
    names = columns.filter(c => !c.hidden).map(c => c.name);
  } else {
    names = [...DEFAULT_PRINT_COLUMN_ORDER];
  }
  return names.filter(name => {
    if (hideSet.has(name)) return false;
    if (priceHidden && isPriceColumn(name)) return false;
    return true;
  });
}

function printColHeader(name: string, columns?: LiColumnDef[]): string {
  const col = columns?.find(c => c.name === name);
  const meta = PRINT_COL_META[name];
  const label = col?.label ?? meta?.header ?? name;
  const width = meta?.width ?? "8%";
  return `<th style="width:${width}">${label.replace(/\n/g, "<br/>")}</th>`;
}

function formatPrintCell(name: string, item: Record<string, any>, columns?: LiColumnDef[]): string {
  const col = columns?.find(c => c.name === name);
  const val = item[name];
  if (val == null || val === "") return "";
  if (isPriceColumn(name, col)) return fmtVND(Number(val));
  const decimals = PRINT_COL_META[name]?.decimals ?? (col?.type === "number" ? 2 : 2);
  if (typeof val === "number") return fmtNum(val, decimals);
  return String(val);
}

function findPrintAggColumns(visibleNames: string[], columns?: LiColumnDef[]): {
  soTam?: string;
  kl?: string;
  tt?: string;
  price?: string;
} {
  const formulaCols = (columns ?? []).filter(c =>
    c.type === "formula" || c.type === "formula_or_manual",
  );
  const klFromFormula = formulaCols.length >= 2
    ? formulaCols[formulaCols.length - 2].name
    : "khoi_luong";
  const ttFromFormula = formulaCols.length >= 1
    ? formulaCols[formulaCols.length - 1].name
    : "thanh_tien";
  const soTamCandidates = ["so_tam", "so_luong", "qty", "quantity"];
  const soTam = visibleNames.find(n => soTamCandidates.includes(n))
    ?? visibleNames.find(n => (columns?.find(c => c.name === n)?.type === "number"));
  return {
    soTam: soTam && visibleNames.includes(soTam) ? soTam : undefined,
    kl: visibleNames.includes(klFromFormula) ? klFromFormula : undefined,
    tt: visibleNames.includes(ttFromFormula) ? ttFromFormula : undefined,
    price: visibleNames.find(n => n === "don_gia" || (columns?.find(c => c.name === n)?.type === "price")),
  };
}

/** Bảng dòng hàng in PDF — cột ẩn/hiện qua print_table (hideColumns, showPrice…). */
export function buildItemsTableHtml(
  groups: ProductGroup[],
  calc: EditorCalcResult,
  utils: { fmtVND: typeof fmtVND; fmtNum: typeof fmtNum; groupLabel: typeof groupLabel; lineItemsColumns?: LiColumnDef[] },
  opts: LiPrintTableOpts = {},
): string {
  const showPrice = opts.showPrice ?? true;
  const showGroupSubtotal = opts.showGroupSubtotal ?? showPrice;
  const columns = utils.lineItemsColumns;
  const visibleNames = resolvePrintTableColumns(columns, opts);
  const { fmtVND, fmtNum, groupLabel } = utils;
  const agg = findPrintAggColumns(visibleNames, columns);
  const dataColCount = visibleNames.length;

  const headerCells = visibleNames.map(name => printColHeader(name, columns)).join("");
  let rows = "";

  for (const [gi, g] of groups.entries()) {
    const label = groupLabel(gi);
    const specHtml = String(g.spec ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    rows += `<tr><td class="c it-grp" style="font-weight:bold">${label}.</td>
      <td colspan="${dataColCount}" class="it-grp">${specHtml}</td></tr>`;

    if (showGroupSubtotal) {
      const gc = calc.groups[g.id];
      const totalTt = gc?.sum ?? g.items.reduce((s, i) => s + Number(i.thanh_tien ?? 0), 0);
      const totalKl = gc?.kl ?? g.items.reduce((s, i) => s + Number(i.khoi_luong ?? 0), 0);
      const totalSt = gc?.so_tam ?? g.items.reduce((s, i) => s + Number(i.so_tam ?? 0), 0);
      const uniformPrice = gc?.uniform_price != null ? fmtVND(gc.uniform_price) : "";

      const firstAggIdx = visibleNames.findIndex(n =>
        n === agg.soTam || n === agg.kl || n === agg.price || n === agg.tt,
      );
      const labelSpan = firstAggIdx >= 0 ? firstAggIdx : visibleNames.length;
      let subRow = `<tr><td class="it-sub"></td><td class="it-sub" colspan="${Math.max(labelSpan, 1)}">Cộng nhóm ${label} – chưa VAT ${g.vat_rate}%</td>`;
      for (let i = labelSpan; i < visibleNames.length; i++) {
        const name = visibleNames[i];
        if (name === agg.soTam) subRow += `<td class="r it-sub">${totalSt}</td>`;
        else if (name === agg.kl) subRow += `<td class="r it-sub">${fmtNum(totalKl)}</td>`;
        else if (name === agg.price && showPrice) subRow += `<td class="r it-sub">${uniformPrice}</td>`;
        else if (name === agg.tt && showPrice) subRow += `<td class="r it-sub">${fmtVND(totalTt)}</td>`;
        else subRow += `<td class="it-sub"></td>`;
      }
      rows += `${subRow}</tr>`;
    }

    g.items.forEach((item, idx) => {
      const cells = visibleNames.map(name => {
        const align = PRINT_COL_META[name]?.align ?? "left";
        const cls = align === "right" ? "r" : align === "center" ? "c" : "";
        const content = formatPrintCell(name, item, columns);
        return `<td class="${cls}">${content}</td>`;
      });
      rows += `<tr><td class="c">${idx + 1}</td>${cells.join("")}</tr>`;
    });
  }

  const nameColWidth = visibleNames.includes("ten_sp") ? "26%" : "38%";
  return `<table class="it"><thead><tr>
    <th style="width:4%">TT</th>
    ${headerCells.replace('width:26%', `width:${nameColWidth}`)}
    </tr></thead><tbody>${rows}</tbody></table>`;
}

export function parseNoteLines(text: string | undefined, fallback: string[]): string[] {
  if (!text || !String(text).trim()) return fallback;
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : fallback;
}

/** HTML bảng tổng in PDF — đọc từ line_items_totals + calc.totals */
export function buildTotalsHtml(
  calc: EditorCalcResult,
  totalConfigs: LiTotalConfig[],
  utils: { fmtVND: typeof fmtVND; soThanhChu: typeof soThanhChu },
  lang = "vi",
): string {
  if (!Array.isArray(totalConfigs) || totalConfigs.length === 0) return "";
  const { fmtVND, soThanhChu } = utils;
  let rows = "";
  let wordsHtml = "";
  for (const tc of totalConfigs) {
    const v = calc.totals[tc.key] ?? 0;
    const lbl = resolveTriLangLabel(tc, lang, ["label"]);
    const rowClass = tc.highlight ? ' class="grand"' : "";
    rows += `<tr${rowClass}><td class="lbl">${tc.key} &nbsp; ${lbl}:</td><td class="amt">${fmtVND(v)}</td></tr>`;
    if (tc.show_words) {
      wordsHtml = `<div class="bang-chu"><b>Bằng chữ:</b> ${soThanhChu(v)}</div>`;
    }
  }
  return `<div class="tot-wrap"><table class="tot">${rows}</table></div>${wordsHtml}`;
}

export function buildPrintUtils(
  settings: Record<string, any> = {},
  opts?: { totalConfigs?: LiTotalConfig[]; lang?: string; lineItemsColumns?: LiColumnDef[]; printTableOpts?: LiPrintTableOpts },
) {
  const totalConfigs = opts?.totalConfigs ?? [];
  const lang = opts?.lang ?? "vi";
  const lineItemsColumns = opts?.lineItemsColumns;
  const printTableOpts = opts?.printTableOpts ?? {};
  const base = { fmtVND, fmtNum, soThanhChu, groupLabel, lineItemsColumns };
  return {
    ...base,
    settings,
    totalConfigs,
    lang,
    printTableOpts,
    formatSoLenh,
    buildCompanyHdr,
    parseNoteLines,
    buildItemsTableHtml: (
      groups: ProductGroup[],
      calc: EditorCalcResult,
      u: Record<string, any>,
      tableOpts?: LiPrintTableOpts,
    ) => buildItemsTableHtml(groups, calc, { ...base, ...u }, { ...printTableOpts, ...tableOpts }),
    buildTotalsHtml: (calc: EditorCalcResult, u: Record<string, any>) =>
      buildTotalsHtml(calc, u.totalConfigs ?? totalConfigs, base, u.lang ?? lang),
  };
}

// ─── Utils object passed to print functions ───────────────────────────────────

export const printUtils = buildPrintUtils();

// ─── Factory helpers ──────────────────────────────────────────────────────────

let _c = 0;
export function newItem(): LineItem {
  return { key: `i_${Date.now()}_${++_c}` };
}

export function newGroup(cfg?: { vat_default?: number }): ProductGroup {
  return {
    id: `g_${Date.now()}_${++_c}`,
    spec: "",
    vat_rate: cfg?.vat_default ?? 10,
    items: [newItem()],
  };
}
