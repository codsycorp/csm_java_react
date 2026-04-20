export type ComboOption = {
  value: any;
  label: string;
};

export type ComboQuerySpec = {
  appId: string;
  tableName: string;
  where?: any;
};

const SYSTEM_CSM_TABLES = new Set([
  "csm_accounts",
  "csm_group_members",
  "sys_la_routers",
  "sys_apps",
  "sys_reactnative",
]);

export function resolveComboQueryAppId(tableName: unknown, preferredAppId: unknown, fallbackAppId: unknown): string {
  const normalizedTable = String(tableName || "").trim().toLowerCase();
  if (SYSTEM_CSM_TABLES.has(normalizedTable)) return "csm";

  const preferred = String(preferredAppId || "").trim();
  if (preferred) return preferred;

  const fallback = String(fallbackAppId || "").trim();
  return fallback || "csm";
}

export function safeEvalWhere(expr: string): any {
  try {
    const body = expr.includes("return ") ? expr : `return (${expr})`;
    // eslint-disable-next-line no-new-func
    const fn = new Function("data", body) as (data: any) => any;
    return fn({});
  } catch {
    return undefined;
  }
}

export function normalizeComboOptions(raw: any): ComboOption[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => {
      if (Array.isArray(item)) {
        const value = item[0];
        const label = String(item[1] ?? item[0] ?? "");
        return value == null || value === "" ? null : { value, label };
      }

      if (item && typeof item === "object") {
        const value = item.value ?? item.ma ?? item.id ?? item.key;
        const label = String(item.label ?? item.ten ?? item.text ?? value ?? "");
        return value == null || value === "" ? null : { value, label };
      }

      if (item == null || item === "") return null;
      return { value: item, label: String(item) };
    })
    .filter(Boolean) as ComboOption[];
}

export function parseStaticComboQuery(input: string): any {
  const text = String(input || "").trim();
  if (!text) return null;
  if (!(text.startsWith("{") || text.startsWith("["))) return null;

  try {
    return JSON.parse(text);
  } catch {
    try {
      // eslint-disable-next-line no-new-func
      return new Function(`return (${text})`)();
    } catch {
      return null;
    }
  }
}

export function extractComboQueriesFromField(
  field: { f_cbo_query?: string },
  decryptFn: (s: string) => string,
  fallbackAppId: string,
): ComboQuerySpec[] {
  const raw = String(field.f_cbo_query || "").trim();
  if (!raw) return [];

  let resolved = raw;
  try {
    resolved = decryptFn(raw) || raw;
  } catch {
    resolved = raw;
  }

  const parsed = parseStaticComboQuery(resolved);
  if (!parsed) return [];

  const queries = Array.isArray(parsed?.query) ? parsed.query : [];
  return queries
    .map((q: any) => {
      const tableName = String(q?.obj_name || "").trim();
      if (!tableName) return null;

      const appId = resolveComboQueryAppId(tableName, q?.app_id, fallbackAppId);
      let where: any = undefined;

      if (q?.obj_where && typeof q.obj_where === "object") {
        where = q.obj_where;
      } else if (typeof q?.obj_where === "string" && q.obj_where.trim()) {
        where = safeEvalWhere(q.obj_where.trim());
      }

      return { appId, tableName, where };
    })
    .filter(Boolean) as ComboQuerySpec[];
}
