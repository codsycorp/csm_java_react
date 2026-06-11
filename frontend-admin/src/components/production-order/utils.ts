import type {
  LiColumnDef, LiTotalConfig, LineItem,
  ProductGroup, GroupCalcResult, EditorCalcResult,
  OrderHeader,
} from "./types";
import { resolveTriLangLabel } from "./line-items-label";

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

  return {
    sum: Math.round(sumTT),
    kl: parseFloat(sumKL.toFixed(3)),
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

const DEFAULT_COMPANY = {
  ten_cong_ty: "CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN",
  dia_chi: "Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội",
  mst: "0104113174",
  website: "https://panelphuson.vn",
  email: "https://javta.vn",
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

export function parseSoBaoGia(value?: string): { prefix: string; seq: number } | null {
  const m = String(value ?? "").trim().match(/^(\d{6})\.(\d{1,2})$/);
  if (!m) return null;
  return { prefix: m[1], seq: Number(m[2]) };
}

/** Số báo giá kế tiếp trong cùng ngày (prefix ddmmyy), không trùng với rows hiện có. */
export function nextSoBaoGia(
  ngay: string,
  rows: Record<string, any>[],
  excludePk?: string,
  pkField = "id",
): string {
  const norm = normalizeNgayString(ngay);
  const d = norm ? parseNgayDate(norm) : undefined;
  if (!d) return formatSoBaoGia(new Date(), 1);
  const prefix = soBaoGiaPrefix(d);
  let maxSeq = 0;
  for (const row of rows) {
    if (excludePk && String(row[pkField] ?? row.id ?? "") === excludePk) continue;
    const parsed = parseSoBaoGia(String(row.so_bao_gia ?? ""));
    if (parsed?.prefix === prefix) maxSeq = Math.max(maxSeq, parsed.seq);
  }
  return formatSoBaoGia(d, maxSeq + 1);
}

export function parseSoLenhBase(value?: string): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Số lệnh SX kế tiếp: ưu tiên tăng trong cùng ngày; ngày mới thì max toàn hệ thống + 1.
 */
export function nextSoLenh(
  ngay: string,
  rows: Record<string, any>[],
  excludePk?: string,
  pkField = "id",
): string {
  const norm = normalizeNgayString(ngay);
  let maxGlobal = 0;
  let maxSameDay = 0;
  for (const row of rows) {
    if (excludePk && String(row[pkField] ?? row.id ?? "") === excludePk) continue;
    const base = parseSoLenhBase(String(row.so_lenh ?? ""));
    if (base == null) continue;
    maxGlobal = Math.max(maxGlobal, base);
    if (norm && normalizeNgayString(String(row.ngay ?? "")) === norm) {
      maxSameDay = Math.max(maxSameDay, base);
    }
  }
  const next = maxSameDay > 0 ? maxSameDay + 1 : (maxGlobal > 0 ? maxGlobal + 1 : 1);
  return String(next);
}

export function buildAutoHeaderNumbers(
  ngay: string,
  rows: Record<string, any>[],
  opts?: { excludePk?: string; pkField?: string },
): { so_bao_gia: string; so_lenh: string; hieu_luc_den: string } {
  const norm = normalizeNgayString(ngay) ?? formatNgay(new Date());
  const pkField = opts?.pkField ?? "id";
  return {
    so_bao_gia: nextSoBaoGia(norm, rows, opts?.excludePk, pkField),
    so_lenh: nextSoLenh(norm, rows, opts?.excludePk, pkField),
    hieu_luc_den: addDaysToNgay(norm, 5) ?? "",
  };
}

export function validateLineItemsHeader(
  header: OrderHeader,
  rows: Record<string, any>[],
  headerFields: Record<string, any>[],
  opts?: { excludePk?: string; pkField?: string },
): { ok: boolean; message?: string } {
  const pkField = opts?.pkField ?? "id";
  const excludePk = opts?.excludePk;

  for (const f of headerFields) {
    const name = String(f.f_name ?? "").toLowerCase();
    if (!name) continue;
    const types = String(f.f_types ?? "ed").toLowerCase();
    const val = header[name];
    if (val == null || val === "") continue;
    const isDate = types === "date" || types === "datetime"
      || /ngay|date|hieu_luc|thoi_han/.test(name);
    if (isDate && types !== "datetime") {
      if (!isValidNgay(String(val))) {
        const label = String(f.f_header ?? name);
        return { ok: false, message: `"${label}" không hợp lệ (định dạng DD/MM/YYYY)` };
      }
    }
  }

  const ngay = String(header.ngay ?? "").trim();
  if (ngay && !isValidNgay(ngay)) {
    return { ok: false, message: "Ngày lập không hợp lệ (định dạng DD/MM/YYYY)" };
  }

  const soBg = String(header.so_bao_gia ?? "").trim();
  if (soBg && !parseSoBaoGia(soBg)) {
    return { ok: false, message: "Số báo giá không đúng định dạng (vd: 060626.01)" };
  }
  if (soBg) {
    const dup = rows.find((row) => {
      if (excludePk && String(row[pkField] ?? row.id ?? "") === excludePk) return false;
      return String(row.so_bao_gia ?? "").trim() === soBg;
    });
    if (dup) return { ok: false, message: `Số báo giá "${soBg}" đã tồn tại` };
  }

  const soLenh = String(header.so_lenh ?? "").trim();
  if (soLenh && parseSoLenhBase(soLenh) == null) {
    return { ok: false, message: "Số lệnh SX phải là số (vd: 6508)" };
  }
  if (soLenh) {
    const dup = rows.find((row) => {
      if (excludePk && String(row[pkField] ?? row.id ?? "") === excludePk) return false;
      return String(row.so_lenh ?? "").trim() === soLenh;
    });
    if (dup) return { ok: false, message: `Số lệnh SX "${soLenh}" đã tồn tại` };
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
  return `<div class="co-name">${c.ten_cong_ty}</div>
  <div class="co-addr">Địa chỉ: ${c.dia_chi}</div>
  <div class="co-addr">MST: ${c.mst}${links ? ` &nbsp;&nbsp; ${links}` : ""}</div>`;
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
  opts?: { totalConfigs?: LiTotalConfig[]; lang?: string },
) {
  const totalConfigs = opts?.totalConfigs ?? [];
  const lang = opts?.lang ?? "vi";
  const base = { fmtVND, fmtNum, soThanhChu, groupLabel };
  return {
    ...base,
    settings,
    totalConfigs,
    lang,
    formatSoLenh,
    buildCompanyHdr,
    parseNoteLines,
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
