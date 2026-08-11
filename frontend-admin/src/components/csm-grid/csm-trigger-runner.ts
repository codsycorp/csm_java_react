/**
 * Chạy JS từ m_configs.trigger — dùng chung grid, kanban, line-items.
 * Cùng pattern với CsmDynamicGrid: decrypt → safeEval → gọi hàm.
 */
import { csmDecrypt } from "./CsmCrypto";

function looksLikePlainTriggerCode(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (/^(function\s|\(function\s|\(async\s*function|\(async\s*\()/.test(trimmed)) return true;
  if (/^return\s+/.test(trimmed)) return true;
  if (/=>/.test(trimmed)) return true;
  if (/\b(const|let|var|if|for|while|switch|try|catch|class)\b/.test(trimmed)) return true;
  if (/^[\[{]/.test(trimmed)) return true;
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return true;
  return false;
}

function looksEncryptedTriggerBody(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (looksLikePlainTriggerCode(trimmed)) return false;
  if (/^U2F/.test(trimmed) || /^eyJ/.test(trimmed)) return true;
  return /^[A-Za-z0-9+/=_-]{80,}$/.test(trimmed);
}

export function resolveTriggerBody(
  raw: unknown,
  decrypt?: (s: string) => string,
): string {
  if (raw == null) return "";
  const code = String(raw);
  if (looksLikePlainTriggerCode(code)) {
    return code;
  }
  if (!looksEncryptedTriggerBody(code)) {
    return code;
  }
  const effectiveDecrypt = decrypt ?? csmDecrypt;
  try {
    const dec = effectiveDecrypt(code);
    if (dec && typeof dec === "string") return dec;
  } catch {
    /* plain text trigger */
  }
  return code;
}

/**
 * safeEval dùng cho grid/kanban — giữ logic Vue legacy (IIFE, return wrap, encrypted detect).
 */
export function safeEvalGridTrigger<TArgs extends unknown[], TReturn>(
  argNames: string[],
  body: string,
): ((...args: TArgs) => TReturn) | null {
  if (!body?.trim()) return null;
  try {
    const trimmed = body.trim();
    const isIIFE = trimmed.startsWith("(function")
      || trimmed.startsWith("(() =>")
      || trimmed.startsWith("(async")
      || trimmed.startsWith("(async () =>");
    const isFuncDecl = trimmed.startsWith("function ");
    const hasReturn = trimmed.includes("return ");
    const hasSideEffects = /\b(alert|console\.|debugger|throw|window\.)/.test(trimmed);
    const code = (isIIFE || isFuncDecl || hasReturn || hasSideEffects) ? body : `return (${body})`;
    // eslint-disable-next-line no-new-func
    return new Function(...argNames, code) as (...args: TArgs) => TReturn;
  } catch (err) {
    if (err instanceof SyntaxError) {
      const hasJSSyntax = /[{}()\[\];:,.\s]|return|function|const|let|var|if|for|while|=>|alert|console/.test(body);
      const hasBase64Pattern = /[A-Za-z0-9_\-\/]{50,}/.test(body);
      if (!hasJSSyntax && hasBase64Pattern) {
        console.warn("[safeEvalGridTrigger] Code looks encrypted but not decrypted:", body.substring(0, 100));
        return null;
      }
    }
    console.error("[safeEvalGridTrigger]", err);
    console.error("[safeEvalGridTrigger] Args:", argNames);
    console.error("[safeEvalGridTrigger] Body (first 500 chars):", body.substring(0, 500));
    return null;
  }
}

/** Alias ngắn — thay thế safeEval nội bộ CsmDynamicGrid / CsmEditModal */
export const safeEval = safeEvalGridTrigger;

export function compileMenuTrigger<TArgs extends unknown[], TReturn>(
  triggers: Record<string, unknown> | undefined,
  key: string,
  argNames: string[],
  decrypt?: (s: string) => string,
): ((...args: TArgs) => TReturn) | null {
  if (!triggers?.[key]) return null;
  const body = resolveTriggerBody(triggers[key], decrypt);
  if (!body.trim()) return null;
  return safeEvalGridTrigger<TArgs, TReturn>(argNames, body);
}

export function safeEvalTrigger<TArgs extends unknown[], TReturn>(
  argNames: string[],
  body: string,
): ((...args: TArgs) => TReturn) | null {
  if (!body?.trim()) return null;
  const trimmed = body.trim();
  const looksEncrypted = trimmed.startsWith("U2F") || trimmed.startsWith("eyJ");
  if (looksEncrypted) {
    console.warn("[safeEvalTrigger] Code looks encrypted but was not decrypted");
    return null;
  }
  try {
    const isFnExpr = /^\(?\s*(async\s+)?function\b/.test(trimmed)
      || /^\(?\s*\([^)]*\)\s*=>/.test(trimmed)
      || /^\(?\s*[a-zA-Z_$][\w$]*\s*=>/.test(trimmed);
    const wrapped = isFnExpr ? `return (${trimmed});` : trimmed;
    // eslint-disable-next-line no-new-func
    return new Function(...argNames, wrapped) as (...args: TArgs) => TReturn;
  } catch (err) {
    console.error("[safeEvalTrigger]", err);
    return null;
  }
}

/** Keys trigger cho auto field: auto_parse_{prefix}, auto_format_{prefix} */
export function autoParseTriggerKey(prefix: string): string {
  return `auto_parse_${String(prefix ?? "").trim()}`;
}

export function autoFormatTriggerKey(prefix: string): string {
  return `auto_format_${String(prefix ?? "").trim()}`;
}

export function resolveFieldAutoTriggerPrefix(f: Record<string, any>): string {
  return String(f.f_li_auto_trigger ?? f.f_name ?? "").trim();
}

export function readAutoParseFromTrigger(
  f: Record<string, any>,
  triggers?: Record<string, unknown>,
  decrypt?: (s: string) => string,
): string | undefined {
  if (!triggers) return undefined;
  const prefix = resolveFieldAutoTriggerPrefix(f);
  if (!prefix) return undefined;
  const body = resolveTriggerBody(triggers[autoParseTriggerKey(prefix)], decrypt);
  return body || undefined;
}

export function readAutoFormatFromTrigger(
  f: Record<string, any>,
  triggers?: Record<string, unknown>,
  decrypt?: (s: string) => string,
): string | undefined {
  if (!triggers) return undefined;
  const prefix = resolveFieldAutoTriggerPrefix(f);
  if (!prefix) return undefined;
  const body = resolveTriggerBody(triggers[autoFormatTriggerKey(prefix)], decrypt);
  return body || undefined;
}

export function runAutoParseTrigger(
  body: string,
  value: string,
  ctx: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const fn = safeEvalTrigger<[string, Record<string, unknown>], Record<string, unknown> | null>(
    ["value", "ctx"],
    body.includes("return") ? body : `return (${body})(value, ctx);`,
  );
  if (!fn) return null;
  try {
    const r = fn(value, ctx);
    return r && typeof r === "object" ? r : null;
  } catch (err) {
    console.error("[runAutoParseTrigger]", err);
    return null;
  }
}

export function runAutoFormatTrigger(
  body: string,
  date: Date,
  seq: number,
  ctx: Record<string, unknown> = {},
): string | null {
  const fn = safeEvalTrigger<[Date, number, Record<string, unknown>], string | null>(
    ["date", "seq", "ctx"],
    body.includes("return") ? body : `return (${body})(date, seq, ctx);`,
  );
  if (!fn) return null;
  try {
    const r = fn(date, seq, ctx);
    return r != null ? String(r) : null;
  } catch (err) {
    console.error("[runAutoFormatTrigger]", err);
    return null;
  }
}
