/**
 * Engine sinh / parse số tự động — đọc cấu hình từ m_configs.table (menu designer).
 *
 * Field config:
 *   f_li_auto          — daily_seq | daily_int | date_offset
 *   f_li_auto_format   — template: {dd}{mm}{yy}.{seq:02}
 *   f_li_auto_parse    — regex parse (group prefix/seq/num qua f_li_auto_*_group)
 *   f_li_auto_prefix_group / f_li_auto_seq_group / f_li_auto_num_group
 *   f_li_auto_scope    — day | global (daily_int)
 *   f_li_auto_trigger  — prefix key trong tab Trigger (mặc định = f_name)
 *   f_li_auto_parse_fn — JS inline (legacy, ưu tiên thấp hơn trigger)
 *   f_li_auto_format_fn — JS inline (legacy)
 *
 * Trigger tab (m_configs.trigger):
 *   auto_parse_{prefix}  — (value, ctx) => { prefix?, seq?, num? } | null
 *   auto_format_{prefix} — (date, seq, ctx) => string
 */
import {
  readAutoFormatFromTrigger,
  readAutoParseFromTrigger,
  runAutoFormatTrigger,
  runAutoParseTrigger,
} from "#src/components/csm-grid/csm-trigger-runner";
import { getFieldLiAuto, type LiAutoRule } from "./line-items-field-utils";
import { addDaysToNgay, formatNgay, normalizeNgayString, parseNgayDate } from "./utils";

export interface LiAutoEngineContext {
  triggers?: Record<string, unknown>;
  decrypt?: (s: string) => string;
}

export interface LiAutoSpec extends LiAutoRule {
  format?: string;
  parse?: string;
  prefixGroup?: number;
  seqGroup?: number;
  numGroup?: number;
  scope?: "day" | "global";
  parseFn?: string;
  formatFn?: string;
}

export interface ParsedAutoValue {
  prefix?: string;
  seq?: number;
  num?: number;
}

const MODE_DEFAULTS: Partial<Record<string, Partial<LiAutoSpec>>> = {
  daily_seq: {
    format: "{dd}{mm}{yy}.{seq:02}",
    parse: String.raw`^(\d{6})\.(\d{1,2})$`,
    prefixGroup: 1,
    seqGroup: 2,
  },
  daily_int: {
    parse: String.raw`^(\d+)`,
    numGroup: 1,
    scope: "day",
  },
};

export function resolveAutoSpec(
  f: Record<string, any>,
  ctx?: LiAutoEngineContext,
): LiAutoSpec | null {
  const rule = getFieldLiAuto(f);
  if (!rule) return null;
  const defs = MODE_DEFAULTS[rule.mode] ?? {};
  const parseFromTrigger = readAutoParseFromTrigger(f, ctx?.triggers, ctx?.decrypt);
  const formatFromTrigger = readAutoFormatFromTrigger(f, ctx?.triggers, ctx?.decrypt);
  const parseFnInline = String(f.f_li_auto_parse_fn ?? "").trim() || undefined;
  const formatFnInline = String(f.f_li_auto_format_fn ?? "").trim() || undefined;
  return {
    ...rule,
    format: String(f.f_li_auto_format ?? defs.format ?? "").trim() || defs.format,
    parse: String(f.f_li_auto_parse ?? f.f_validate ?? defs.parse ?? "").trim() || defs.parse,
    prefixGroup: Number(f.f_li_auto_prefix_group ?? defs.prefixGroup ?? 0) || defs.prefixGroup,
    seqGroup: Number(f.f_li_auto_seq_group ?? defs.seqGroup ?? 0) || defs.seqGroup,
    numGroup: Number(f.f_li_auto_num_group ?? defs.numGroup ?? 0) || defs.numGroup,
    scope: (String(f.f_li_auto_scope ?? defs.scope ?? "day").toLowerCase() === "global" ? "global" : "day") as "day" | "global",
    parseFn: parseFromTrigger || parseFnInline,
    formatFn: formatFromTrigger || formatFnInline,
  };
}

export function applyFormatTemplate(template: string, date: Date, seq: number): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  const yyyy = String(date.getFullYear());
  return template
    .replace(/\{seq:(\d+)\}/g, (_, w) => String(seq).padStart(Number(w), "0"))
    .replace(/\{seq\}/g, String(seq))
    .replace(/\{dd\}/g, dd)
    .replace(/\{mm\}/g, mm)
    .replace(/\{yy\}/g, yy)
    .replace(/\{yyyy\}/g, yyyy);
}

export function parseAutoFieldValue(
  f: Record<string, any>,
  value?: string,
  ctx?: LiAutoEngineContext,
): ParsedAutoValue | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const spec = resolveAutoSpec(f, ctx);
  if (!spec) return null;

  if (spec.parseFn) {
    const fromFn = runAutoParseTrigger(spec.parseFn, text, { field: f.f_name });
    if (fromFn) return fromFn as ParsedAutoValue;
  }

  if (!spec.parse) return spec.mode === "daily_int" ? { num: Number(text) || null } as any : null;

  try {
    const m = text.match(new RegExp(spec.parse));
    if (!m) return null;
    const out: ParsedAutoValue = {};
    if (spec.prefixGroup && m[spec.prefixGroup] != null) out.prefix = m[spec.prefixGroup];
    if (spec.seqGroup && m[spec.seqGroup] != null) out.seq = Number(m[spec.seqGroup]);
    if (spec.numGroup && m[spec.numGroup] != null) out.num = Number(m[spec.numGroup]);
    if (spec.mode === "daily_int" && out.num == null && spec.numGroup) return null;
    if (spec.mode === "daily_seq" && out.seq == null) return null;
    return out;
  } catch {
    return null;
  }
}

export function formatAutoFieldValue(
  f: Record<string, any>,
  date: Date,
  seq: number,
  ctx: Record<string, any> = {},
  engineCtx?: LiAutoEngineContext,
): string {
  const spec = resolveAutoSpec(f, engineCtx);
  if (!spec) return String(seq);

  if (spec.formatFn) {
    const fromFn = runAutoFormatTrigger(spec.formatFn, date, seq, ctx);
    if (fromFn) return fromFn;
  }

  if (spec.format) return applyFormatTemplate(spec.format, date, seq);
  if (spec.mode === "daily_int") return String(seq);
  return String(seq);
}

/** Prefix ngày dùng so khớp daily_seq — lấy từ template bỏ phần {seq}. */
export function autoPrefixFromDate(
  f: Record<string, any>,
  date: Date,
  engineCtx?: LiAutoEngineContext,
): string {
  const spec = resolveAutoSpec(f, engineCtx);
  if (!spec?.format) return "";
  const prefixTpl = spec.format.replace(/\{seq(?::\d+)?\}/g, "");
  return applyFormatTemplate(prefixTpl, date, 0);
}

export function validateAutoFieldValue(
  f: Record<string, any>,
  value?: string,
  ctx?: LiAutoEngineContext,
): boolean {
  const text = String(value ?? "").trim();
  if (!text) return true;
  const spec = resolveAutoSpec(f, ctx);
  if (!spec) return true;
  if (spec.mode === "date_offset") return true;
  return parseAutoFieldValue(f, text, ctx) != null;
}

export function nextAutoFieldValue(
  f: Record<string, any>,
  ngay: string,
  fieldName: string,
  rows: Record<string, any>[],
  opts?: {
    excludePk?: string;
    pkField?: string;
    dateRefField?: string;
    header?: Record<string, any>;
    engineCtx?: LiAutoEngineContext;
  },
): string {
  const spec = resolveAutoSpec(f, opts?.engineCtx);
  const engineCtx = opts?.engineCtx;
  if (!spec) return "";
  const pkField = opts?.pkField ?? "id";
  const dateRef = String(opts?.dateRefField ?? "ngay").toLowerCase();
  const norm = normalizeNgayString(ngay) ?? formatNgay(new Date());
  const d = parseNgayDate(norm) ?? new Date();

  if (spec.mode === "date_offset") {
    const refName = (spec.ref ?? dateRef).toLowerCase();
    const refRaw = opts?.header?.[refName] ?? ngay;
    const refVal = normalizeNgayString(String(refRaw)) ?? norm;
    return addDaysToNgay(refVal, spec.days ?? 0) ?? "";
  }

  if (spec.mode === "daily_seq") {
    const prefix = autoPrefixFromDate(f, d, engineCtx);
    let maxSeq = 0;
    for (const row of rows) {
      if (opts?.excludePk && String(row[pkField] ?? row.id ?? "") === opts.excludePk) continue;
      const parsed = parseAutoFieldValue(f, String(row[fieldName] ?? ""), engineCtx);
      if (parsed?.prefix === prefix || (!parsed?.prefix && prefix && String(row[fieldName] ?? "").startsWith(prefix))) {
        maxSeq = Math.max(maxSeq, parsed?.seq ?? 0);
      }
    }
    return formatAutoFieldValue(f, d, maxSeq + 1, { ngay: norm, fieldName, rows }, engineCtx);
  }

  if (spec.mode === "daily_int") {
    let maxGlobal = 0;
    let maxSameDay = 0;
    for (const row of rows) {
      if (opts?.excludePk && String(row[pkField] ?? row.id ?? "") === opts.excludePk) continue;
      const parsed = parseAutoFieldValue(f, String(row[fieldName] ?? ""), engineCtx);
      const num = parsed?.num;
      if (num == null || Number.isNaN(num)) continue;
      maxGlobal = Math.max(maxGlobal, num);
      if (spec.scope !== "global" && norm && normalizeNgayString(String(row[dateRef] ?? "")) === norm) {
        maxSameDay = Math.max(maxSameDay, num);
      }
    }
    const next = spec.scope === "global"
      ? (maxGlobal > 0 ? maxGlobal + 1 : 1)
      : (maxSameDay > 0 ? maxSameDay + 1 : (maxGlobal > 0 ? maxGlobal + 1 : 1));
    return formatAutoFieldValue(f, d, next, { ngay: norm, fieldName, rows }, engineCtx);
  }

  return "";
}
