import type {
  LiColumnDef, LiTotalConfig, LineItem,
  ProductGroup, GroupCalcResult, EditorCalcResult,
} from "./types";

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

/** Gợi ý số báo giá ddmmyy.01 theo ngày lập. */
export function formatSoBaoGia(date?: Date, seq = 1): string {
  const d = date ?? new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}.${String(seq).padStart(2, "0")}`;
}

export function parseNgayDate(ngay?: string): Date | undefined {
  const m = String(ngay ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

export function buildPrintUtils(settings: Record<string, any> = {}) {
  return {
    fmtVND,
    fmtNum,
    soThanhChu,
    groupLabel,
    settings,
    formatSoLenh,
    buildCompanyHdr,
    parseNoteLines,
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
