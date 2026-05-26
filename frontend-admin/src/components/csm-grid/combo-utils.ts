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

const TENANT_ORG_TABLES = new Set([
  "csm_roles",
  "csm_depts",
  "csm_branches",
]);

function pickTenantAppId(preferredAppId: unknown, fallbackAppId: unknown): string {
  const preferred = String(preferredAppId || "").trim();
  if (preferred && preferred !== "csm") return preferred;

  const fallback = String(fallbackAppId || "").trim();
  if (fallback && fallback !== "csm") return fallback;

  return preferred || fallback || "csm";
}

export function resolveComboQueryAppId(tableName: unknown, preferredAppId: unknown, fallbackAppId: unknown): string {
  const normalizedTable = String(tableName || "").trim().toLowerCase();
  if (SYSTEM_CSM_TABLES.has(normalizedTable)) return "csm";
  if (TENANT_ORG_TABLES.has(normalizedTable)) return pickTenantAppId(preferredAppId, fallbackAppId);

  const preferred = String(preferredAppId || "").trim();
  if (preferred) return preferred;

  const fallback = String(fallbackAppId || "").trim();
  return fallback || "csm";
}

export function getComboTableRows(database: Record<string, any> | undefined, tableName: string): any[] {
  const source = database?.[tableName];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.rows)) return source.rows;
  return [];
}

export function buildRoleComboValueEnum(rows: any[]): Record<string, { text: string }> {
  const enumObj: Record<string, { text: string }> = {};
  (rows || []).forEach((row) => {
    const id = String(row?.id ?? "").trim();
    const roleCode = String(row?.role_code ?? "").trim();
    const roleName = String(row?.role_name ?? "").trim();
    const label = roleName || roleCode || id;
    if (!label) return;
    if (id) enumObj[id] = { text: label };
    if (roleCode && roleCode !== id) enumObj[roleCode] = { text: label };
  });
  return enumObj;
}

export function buildRoleComboOptions(rows: any[]): ComboOption[] {
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const options: ComboOption[] = [];
  (rows || []).forEach((row) => {
    const id = String(row?.id ?? "").trim();
    const roleName = String(row?.role_name ?? "").trim();
    const roleCode = String(row?.role_code ?? "").trim().toUpperCase();
    const label = roleName || roleCode || id;
    if (!id || seenIds.has(id)) return;
    if (roleCode && seenCodes.has(roleCode)) return;
    seenIds.add(id);
    if (roleCode) seenCodes.add(roleCode);
    options.push({ value: id, label });
  });
  return options.sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

export function buildRoleComboSelectEnum(rows: any[]): Record<string, { text: string }> {
  const enumObj: Record<string, { text: string }> = {};
  buildRoleComboOptions(rows).forEach((opt) => {
    enumObj[String(opt.value)] = { text: opt.label };
  });
  return enumObj;
}

export function resolveRoleComboLabel(value: unknown, database: Record<string, any> | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const rows = getComboTableRows(database, "csm_roles");
  const matched = rows.find((row) => (
    raw === String(row?.id ?? "").trim() || raw === String(row?.role_code ?? "").trim()
  ));
  if (!matched) return raw;
  return String(matched?.role_name ?? matched?.role_code ?? raw).trim() || raw;
}

export function mergeRowsById(primaryRows: any[], extraRows: any[]): any[] {
  const merged = new Map<string, any>();
  const seenRoleCodes = new Set<string>();
  const register = (row: any) => {
    const id = String(row?.id ?? "").trim();
    const roleCode = String(row?.role_code ?? "").trim().toUpperCase();
    if (!id || merged.has(id)) return;
    if (roleCode && seenRoleCodes.has(roleCode)) return;
    merged.set(id, row);
    if (roleCode) seenRoleCodes.add(roleCode);
  };
  (primaryRows || []).forEach(register);
  (extraRows || []).forEach(register);
  return Array.from(merged.values());
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
