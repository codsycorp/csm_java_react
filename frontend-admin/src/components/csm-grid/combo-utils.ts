import { csmDecrypt } from "./CsmCrypto";
import { getTableData } from "./CsmApi";
import { normalizeTableRows } from "./grid-bigdata-policy";
import {
	getUserAccessContext,
	normalizePlainAppId,
	resolveTableRequestAppId,
	type UserAppIdInput,
} from "#src/utils/user-app-id";

export type ComboOption = {
  value: any;
  label: string;
};

export type ComboQuerySpec = {
  appId: string;
  tableName: string;
  where?: any;
};

function toUserContext(fallbackAppId: unknown, userContext?: UserAppIdInput): UserAppIdInput {
  if (userContext) return userContext;
  const fallback = String(fallbackAppId || "").trim();
  const storeContext = getUserAccessContext();
  if (fallback && !storeContext.app_id) {
    return { ...storeContext, app_id: fallback };
  }
  return storeContext;
}

export function resolveComboQueryAppId(
  tableName: unknown,
  preferredAppId: unknown,
  fallbackAppId: unknown,
  userContext?: UserAppIdInput,
  decrypt: (value: string) => string = csmDecrypt,
): string {
  return resolveTableRequestAppId(
    String(tableName || ""),
    String(preferredAppId || ""),
    toUserContext(fallbackAppId, userContext),
    decrypt,
  );
}

/** app_id runtime cho CRUD — khớp Java/Rust user access context. */
export function resolveRuntimeAppId(
  tableName: unknown,
  preferredAppId?: unknown,
  userContext?: UserAppIdInput,
  decrypt: (value: string) => string = csmDecrypt,
): string {
  return resolveTableRequestAppId(
    String(tableName || ""),
    String(preferredAppId || ""),
    userContext ?? getUserAccessContext(),
    decrypt,
  );
}

export function getComboTableRows(database: Record<string, any> | undefined, tableName: string): any[] {
  const source = database?.[tableName];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.rows)) return source.rows;
  return [];
}

/** Default obj_where used when query spec omits filter — should not force refetch over cached rows. */
export function isDefaultComboWhereClause(whereClause: unknown): boolean {
  if (!whereClause || typeof whereClause !== "object") return false;
  const clause = whereClause as { field?: string; type?: string; value?: unknown };
  return clause.field === "id" && clause.type === "like" && String(clause.value ?? "") === "";
}

export function storedTableAppIdMatches(
  storedAppId: unknown,
  expectedAppId: string,
  decrypt?: (s: string) => string,
): boolean {
  const stored = String(storedAppId ?? "").trim();
  const expected = String(expectedAppId ?? "").trim();
  if (!stored || !expected) return true;
  if (stored === expected) return true;
  return normalizePlainAppId(stored, decrypt || csmDecrypt) === expected;
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

/** Align with CsmDynamicGrid — infer combo from f_cbo_query / f_options / field name. */
export function resolveEffectiveFieldTypes(field: Record<string, any> | null | undefined): string {
  const explicit = String(field?.f_types ?? field?.f_type ?? "").trim().toLowerCase();
  if (explicit === "editor") return "codejs";
  if (explicit && explicit !== "string" && explicit !== "ed") return explicit;

  const fieldName = String(field?.f_name ?? "").trim().toLowerCase();
  if (["menuspermissions", "menuspermissionsadd", "menuspermissionsdeny"].includes(fieldName)) return "menu_tree";
  if (["permissions", "permissionsadd", "permissionsdeny", "data_app_ids"].includes(fieldName)) return "multi_tag";
  if (["permissionpreset", "datascope", "role_level", "branch_id", "dept_id", "department_id", "group_id", "roles", "permissiongroups", "status", "app_id"].includes(fieldName)) return "co";
  if (["is_global", "actived", "active", "dev", "enabled", "disabled"].includes(fieldName) || /^is_/.test(fieldName) || /^has_/.test(fieldName)) return "checkbox";

  if (field?.f_cbo_query) return "co";
  if (Array.isArray(field?.f_options) && field.f_options.length > 0) {
    if (fieldName.includes("menu")) return "menu_tree";
    if (fieldName.includes("permission")) return "multi_tag";
    return "co";
  }

  return explicit || "ed";
}

export function isComboLikeType(rawTypes: unknown): boolean {
  const types = String(rawTypes || "").toLowerCase();
  const tokens = types.split(/[\s,;|_:-]+/).filter(Boolean);
  return tokens.includes("co")
    || tokens.includes("coro")
    || tokens.includes("cbo")
    || tokens.includes("cp")
    || /cbo|select|multi_tag|multi_select|menu_tree|tag|etag/.test(types);
}

export function isMultiSelectLikeType(rawTypes: unknown): boolean {
  const types = String(rawTypes || "").toLowerCase();
  return /multi_tag|menu_tree|multi_select|tag|etag/.test(types);
}

export function parseFieldOptions(raw: unknown): ComboOption[] {
  if (!raw) return [];
  let source: unknown = raw;
  if (typeof source === "string") {
    const text = source.trim();
    if (!text) return [];
    try {
      source = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (source && typeof source === "object" && Array.isArray((source as any).options)) {
    source = (source as any).options;
  }
  if (!Array.isArray(source)) return [];
  return normalizeComboOptions(source);
}

export function getLegacyFallbackComboQuery(fieldNameRaw: unknown): string {
  const fieldName = String(fieldNameRaw || "").trim().toLowerCase();
  if (!fieldName) return "";

  if (fieldName === "permissionpreset") {
    return JSON.stringify({
      options: [
        { value: "", label: "system.userPermission.preset.custom" },
        { value: "viewer", label: "system.userPermission.preset.viewer" },
        { value: "editor", label: "system.userPermission.preset.editor" },
        { value: "full_crud", label: "system.userPermission.preset.fullCrud" },
        { value: "full_crud_export", label: "system.userPermission.preset.fullCrudExport" },
        { value: "admin_full", label: "system.userPermission.preset.adminFull" },
      ],
    });
  }

  if (fieldName === "datascope") {
    return JSON.stringify({
      options: [
        { value: "NONE", label: "system.userPermission.scope.none" },
        { value: "OWNER", label: "system.userPermission.scope.owner" },
        { value: "DEPARTMENT", label: "system.userPermission.scope.department" },
        { value: "BRANCH", label: "system.userPermission.scope.branch" },
        { value: "ALL", label: "system.userPermission.scope.all" },
      ],
    });
  }

  if (fieldName === "role_level") {
    return JSON.stringify({
      options: [
        { value: "admin", label: "system.userPermission.level.admin" },
        { value: "director", label: "system.userPermission.level.director" },
        { value: "manager", label: "system.userPermission.level.manager" },
        { value: "dept_head", label: "system.userPermission.level.deptHead" },
        { value: "team_lead", label: "system.userPermission.level.teamLead" },
        { value: "staff", label: "system.userPermission.level.staff" },
      ],
    });
  }

  if (fieldName === "status") {
    return JSON.stringify({
      options: [
        { value: "1", label: "common.activated" },
        { value: "0", label: "common.deactivated" },
      ],
    });
  }

  if (fieldName === "branch_id") {
    return JSON.stringify({
      query: [{ obj_name: "csm_branches", fields: ["id", "branch_name"], obj_where: { field: "id", type: "like", value: "" } }],
    });
  }

  if (["dept_id", "department_id"].includes(fieldName)) {
    return JSON.stringify({
      query: [{ obj_name: "csm_depts", fields: ["id", "dept_name", "branch_id"], obj_where: { field: "id", type: "like", value: "" } }],
    });
  }

  if (["group_id", "permissiongroups", "group_rights", "grouprights"].includes(fieldName)) {
    return JSON.stringify({
      query: [{ obj_name: "csm_roles", fields: ["id", "role_name", "role_code"], obj_where: { field: "id", type: "like", value: "" } }],
    });
  }

  return "";
}

export function selectEnumToAntdOptions(
  enumObj: Record<string, { text: string }> | undefined,
  localizeLabel?: (label: string) => string,
): Array<{ value: string; label: string }> {
  if (!enumObj) return [];
  return Object.entries(enumObj).map(([value, item]) => {
    const rawLabel = String(item?.text ?? value);
    const label = localizeLabel ? localizeLabel(rawLabel) : rawLabel;
    return { value, label };
  });
}

function isResolvedComboQueryText(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (/^(f_grid:|query:)/.test(trimmed)) return true;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return false;
    return Array.isArray((parsed as any).query)
      || Array.isArray((parsed as any).options)
      || Boolean((parsed as any).cascadeFrom);
  } catch {
    return false;
  }
}

/** Decrypt combo query text — mirrors CsmDynamicGrid (decrypt prop, then csmDecrypt fallback). */
export function resolveEffectiveComboQueryText(
  rawQuery: unknown,
  decryptFn?: (s: string) => string,
): string {
  let resolved = String(rawQuery || "").trim();
  if (!resolved) return "";

  if (decryptFn) {
    try {
      const decrypted = String(decryptFn(resolved) || "").trim();
      if (decrypted && decrypted !== resolved) {
        resolved = decrypted;
      }
    } catch {
      // ignore
    }
  }

  if (isResolvedComboQueryText(resolved)) {
    return resolved;
  }

  try {
    const csmDecrypted = String(csmDecrypt(resolved) || "").trim();
    if (csmDecrypted && csmDecrypted !== resolved) {
      return csmDecrypted;
    }
  } catch {
    // ignore
  }

  return resolved;
}

export function resolveComboQueryText(
  rawQuery: unknown,
  decryptFn?: (s: string) => string,
): string {
  return resolveEffectiveComboQueryText(rawQuery, decryptFn);
}

export function extractComboQueriesFromField(
  field: { f_cbo_query?: string; f_name?: string },
  decryptFn: (s: string) => string,
  fallbackAppId: string,
): ComboQuerySpec[] {
  const raw = String(field.f_cbo_query || getLegacyFallbackComboQuery(field.f_name) || "").trim();
  if (!raw) return [];

  const resolved = resolveEffectiveComboQueryText(raw, decryptFn);

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

export type ComboTableFetchRequest = {
  tableName: string;
  appId: string;
  whereClause: any;
};

function normalizeComboWhereClause(whereClause: any): any {
  const isInvalidWhere = !whereClause
    || (typeof whereClause === "string" && !whereClause.trim())
    || (
      typeof whereClause === "object"
      && (!whereClause.field || !whereClause.type)
      && !(whereClause.operator && Array.isArray(whereClause.conditions))
    );
  return isInvalidWhere ? { field: "id", type: "like", value: "" } : whereClause;
}

/** Flatten app menu tree into id → menu map (Vue seft.menus / getAllMenu parity). */
export function flattenAppMenusById(menus: any[]): Map<string, any> {
  const map = new Map<string, any>();
  const walk = (items: any[]) => {
    for (const item of items || []) {
      if (!item) continue;
      const id = String(item.id || "").trim();
      if (id) map.set(id, item);
      const aliases = [
        item.path,
        item.v_link,
        item.name,
        item.menu_code,
        item.code,
      ];
      aliases.forEach((alias) => {
        const key = String(alias || "").trim();
        if (key && !map.has(key)) map.set(key, item);
      });
      if (Array.isArray(item.children)) walk(item.children);
    }
  };
  walk(menus);
  return map;
}

export function parseFieldGridComboFields(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((part) => {
      const [src] = part.split("->").map((s) => s.trim());
      return src;
    }).filter(Boolean);
  }
  return [];
}

export function resolveFieldGridComboTableName(
  field: { f_grid?: unknown },
  menuById?: Map<string, any>,
): string {
  const menuId = String(field?.f_grid || "").trim();
  if (!menuId || !menuById) return "";
  const menu = menuById.get(menuId);
  return String(menu?.table_name || "").split(",")[0].trim();
}

export type ComboGridEvalContext = {
  seft?: any;
  database?: Record<string, any>;
};

/**
 * Resolve f_grid + f_grid_fields from field props or f_cbo_query (Vue getOptionsSelect parity).
 */
export function resolveFieldGridComboConfig(
  field: { f_grid?: unknown; f_grid_fields?: unknown; f_cbo_query?: string; f_name?: string },
  options: {
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
  } = {},
): { f_grid: string; f_grid_fields: unknown } | null {
  const directGrid = String(field?.f_grid || "").trim();
  const directFields = field?.f_grid_fields;
  if (directGrid && directFields != null && String(directFields).trim() !== "") {
    return { f_grid: directGrid, f_grid_fields: directFields };
  }

  const rawQuery = String(field?.f_cbo_query || getLegacyFallbackComboQuery(field?.f_name) || "").trim();
  if (!rawQuery) return null;

  const resolved = resolveEffectiveComboQueryText(rawQuery, options.decrypt);
  const trimmed = resolved.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.f_grid && parsed?.f_grid_fields) {
        return { f_grid: String(parsed.f_grid), f_grid_fields: parsed.f_grid_fields };
      }
    } catch {
      try {
        const parsed = new Function(`return (${trimmed})`)();
        if (parsed?.f_grid && parsed?.f_grid_fields) {
          return { f_grid: String(parsed.f_grid), f_grid_fields: parsed.f_grid_fields };
        }
      } catch {
        // ignore
      }
    }
  }

  const { seft, database } = options.evalContext || {};
  if (seft && database) {
    try {
      const body = (trimmed.includes("return ") ? "" : "return ") + trimmed;
      const fn = new Function("seft", "data", body) as (seft: any, data: any) => any;
      const objQa = fn(seft, database);
      if (objQa?.f_grid && objQa?.f_grid_fields) {
        return { f_grid: String(objQa.f_grid), f_grid_fields: objQa.f_grid_fields };
      }
    } catch {
      // ignore dynamic eval errors
    }
  }

  return null;
}

/** Vue csm_grid lookup displayExpr: `${f_grid_fields[0]} <${f_grid_fields[1]}>` */
export function formatGridComboDisplayLabel(row: any, gridFields: string[]): string {
  if (!row || gridFields.length === 0) return "";
  if (gridFields.length >= 2) {
    const ma = String(row[gridFields[0]] ?? "").trim();
    const ten = String(row[gridFields[1]] ?? "").trim();
    if (ma && ten) return `${ma} <${ten}>`;
    return ten || ma;
  }
  return String(row[gridFields[0]] ?? "").trim();
}

/** Vue optionsSelect[tree_id+"_^_"+f_name] — kết quả getOptionsSelect. */
export type OptionsSelectResult = {
  options: Array<{ ma: string; ten: string }>;
  fields?: string[];
  data?: Record<string, unknown>[];
  table_name?: string;
  where?: string;
  f_grid?: string;
  f_grid_fields?: unknown;
};

function normalizeMaTenOptions(options: unknown[]): Array<{ ma: string; ten: string }> {
  return (options || [])
    .map((opt) => {
      if (Array.isArray(opt)) {
        return {
          ma: String(opt[0] ?? "").trim(),
          ten: String(opt[1] ?? opt[0] ?? "").trim(),
        };
      }
      if (opt && typeof opt === "object") {
        const row = opt as Record<string, unknown>;
        return {
          ma: String(row.ma ?? row.value ?? row.id ?? row.key ?? "").trim(),
          ten: String(row.ten ?? row.label ?? row.text ?? row.name ?? row.ma ?? "").trim(),
        };
      }
      const text = String(opt ?? "").trim();
      return { ma: text, ten: text };
    })
    .filter((item) => item.ma !== "")
    .sort((a, b) => a.ten.localeCompare(b.ten, undefined, { numeric: true, sensitivity: "base" }));
}

function maTenOptionsToSelectEnum(options: Array<{ ma: string; ten: string }>): Record<string, { text: string }> {
  const enumObj: Record<string, { text: string }> = {};
  options.forEach(({ ma, ten }) => {
    enumObj[ma] = { text: ten || ma };
  });
  return enumObj;
}

/**
 * Vue csm_grid.getOptionsSelect(f_cbo_query, tree_id, f_name) — eval query và map database rows → {ma, ten}.
 * React dùng stateless: không lưu optionsSelect global, trả về struct tương đương.
 */
export function getOptionsSelect(
  f_cbo_query: unknown,
  database: Record<string, any> | undefined,
  options: {
    fieldName?: string;
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
  } = {},
): OptionsSelectResult {
  const empty: OptionsSelectResult = { options: [] };
  const rawQuery = String(
    f_cbo_query || (options.fieldName ? getLegacyFallbackComboQuery(options.fieldName) : "") || "",
  ).trim();
  if (!rawQuery) return empty;

  const seft = options.evalContext?.seft || { database };
  const db = database || options.evalContext?.database;
  const objQa = executeComboQueryObject(rawQuery, seft, db, options.decrypt);
  if (!objQa || typeof objQa !== "object") return empty;

  if (objQa.f_grid && objQa.f_grid_fields) {
    return {
      options: [],
      f_grid: String(objQa.f_grid),
      f_grid_fields: objQa.f_grid_fields,
      fields: parseFieldGridComboFields(objQa.f_grid_fields),
      data: Array.isArray(objQa.data) ? objQa.data : [],
      where: objQa.where,
    };
  }

  if (!Object.prototype.hasOwnProperty.call(objQa, "options")
    && !Object.prototype.hasOwnProperty.call(objQa, "query")) {
    return empty;
  }

  const result: OptionsSelectResult = {
    options: [],
    fields: ["ma", "ten"],
    data: [],
  };

  if (Array.isArray(objQa.query) && objQa.query.length === 1) {
    const querySpec = objQa.query[0] || {};
    const objName = String(querySpec.obj_name || "").trim();
    const fields = Array.isArray(querySpec.fields)
      ? querySpec.fields.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];
    const objWhere = querySpec.obj_where;

    result.fields = fields.length >= 2 ? fields : ["ma", "ten"];

    if (!objName && fields.length === 0 && objWhere) {
      if (String(objWhere).trim()) result.where = String(objWhere);
      return result;
    }

    if (objName && fields.length >= 2 && db) {
      const rows = getComboTableRows(db, objName);
      result.table_name = objName;
      result.fields = fields;
      result.data = rows;
      result.options = rows.map((row) => ({
        ma: String(resolveComboRowFieldValue(row, fields[0]) ?? "").trim(),
        ten: String(resolveComboRowFieldValue(row, fields[1]) ?? "").trim(),
      })).sort((a, b) => a.ten.localeCompare(b.ten, undefined, { numeric: true, sensitivity: "base" }));
      if (objWhere && String(objWhere).trim()) result.where = String(objWhere);
    }
    return result;
  }

  if (Array.isArray(objQa.options) && objQa.options.length > 0) {
    result.fields = ["ma", "ten"];
    result.data = objQa.options;
    result.options = normalizeMaTenOptions(objQa.options);
    return result;
  }

  return result;
}

/** Lookup table + value/label fields cho co thường (query obj_name + 2 fields — Vue valueExpr ma / displayExpr ten). */
export function resolveFieldQueryComboConfig(
  field: { f_cbo_query?: string; f_name?: string; f_grid?: unknown; f_grid_fields?: unknown },
  database: Record<string, any> | undefined,
  options: {
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
  } = {},
): { tableName: string; valueField: string; labelField: string; fields: string[] } | null {
  if (resolveFieldGridComboConfig(field, options)) return null;

  const os = getOptionsSelect(field?.f_cbo_query, database, {
    fieldName: field?.f_name,
    decrypt: options.decrypt,
    evalContext: options.evalContext,
  });
  if (!os.table_name || !os.fields || os.fields.length < 2) return null;

  return {
    tableName: os.table_name,
    valueField: os.fields[0],
    labelField: os.fields[1],
    fields: os.fields,
  };
}

/** Resolve combo lookup table name — f_grid menu hoặc query obj_name. */
export function resolveFieldComboLookupTableName(
  field: { f_cbo_query?: string; f_name?: string; f_grid?: unknown; f_grid_fields?: unknown },
  menuById: Map<string, any> | undefined,
  database: Record<string, any> | undefined,
  options: {
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
  } = {},
): string {
  const gridConfig = resolveFieldGridComboConfig(field, options);
  if (gridConfig && menuById) {
    return resolveFieldGridComboTableName({ f_grid: gridConfig.f_grid }, menuById);
  }
  const queryConfig = resolveFieldQueryComboConfig(field, database, options);
  return queryConfig?.tableName || "";
}

/** Build selectEnums cho tất cả co fields — Vue loadData gọi getOptionsSelect trước khi render grid. */
export function buildSelectEnumsForFields(
  fields: unknown[],
  database: Record<string, any> | undefined,
  options: {
    menuById?: Map<string, any>;
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
    fallbackAppId?: string;
    userContext?: UserAppIdInput;
    localizeLabel?: (label: string) => string;
  } = {},
): Record<string, Record<string, { text: string }>> {
  const map: Record<string, Record<string, { text: string }>> = {};
  const localize = options.localizeLabel ?? ((label: string) => label);
  const menuById = options.menuById instanceof Map ? options.menuById : new Map<string, any>();

  (fields || []).forEach((rawField) => {
    const field = rawField as {
      f_name?: string;
      f_types?: string;
      f_show?: number;
      f_options?: unknown;
      f_cbo_query?: string;
      f_grid?: unknown;
      f_grid_fields?: unknown;
    };
    const types = resolveEffectiveFieldTypes(field);
    if (!isComboLikeType(types)) return;
    if (Number(field.f_show ?? 1) !== 1) return;

    const fieldName = String(field.f_name || "").trim();
    if (!fieldName) return;

    const optionsFromField = parseFieldOptions(field.f_options);
    if (optionsFromField.length > 0) {
      const enumFromOptions: Record<string, { text: string }> = {};
      optionsFromField.forEach((opt) => {
        enumFromOptions[String(opt.value)] = { text: localize(opt.label) };
      });
      if (Object.keys(enumFromOptions).length > 0) {
        map[fieldName] = enumFromOptions;
        return;
      }
    }

    const evalContext = options.evalContext || { database };

    if (menuById.size > 0) {
      const gridEnum = buildGridFieldComboSelectEnum(
        field,
        database,
        menuById,
        options.userContext,
        options.decrypt,
        evalContext,
      );
      if (Object.keys(gridEnum).length > 0) {
        map[fieldName] = Object.fromEntries(
          Object.entries(gridEnum).map(([key, item]) => [key, { text: localize(item.text) }]),
        );
        return;
      }
    }

    const os = getOptionsSelect(field.f_cbo_query, database, {
      fieldName,
      decrypt: options.decrypt,
      evalContext,
    });

    if (os.f_grid && os.f_grid_fields && menuById.size > 0) {
      const gridEnum = buildGridFieldComboSelectEnum(
        { f_grid: os.f_grid, f_grid_fields: os.f_grid_fields },
        database,
        menuById,
        options.userContext,
        options.decrypt,
        evalContext,
      );
      if (Object.keys(gridEnum).length > 0) {
        map[fieldName] = Object.fromEntries(
          Object.entries(gridEnum).map(([key, item]) => [key, { text: localize(item.text) }]),
        );
        return;
      }
    }

    if (os.options.length > 0) {
      const enumFromOptions = maTenOptionsToSelectEnum(os.options);
      if (Object.keys(enumFromOptions).length > 0) {
        map[fieldName] = Object.fromEntries(
          Object.entries(enumFromOptions).map(([key, item]) => [key, { text: localize(item.text) }]),
        );
        return;
      }
    }

    const queryEnum = buildFieldQueryComboSelectEnum(field, database, {
      fallbackAppId: options.fallbackAppId,
      userContext: options.userContext,
      decrypt: options.decrypt,
      evalContext,
      menuById,
    });
    if (Object.keys(queryEnum).length > 0) {
      map[fieldName] = Object.fromEntries(
        Object.entries(queryEnum).map(([key, item]) => [key, { text: localize(item.text) }]),
      );
    }
  });

  return map;
}

/** Build valueEnum from field.f_grid menu table (Vue f_grid + f_grid_fields parity). */
export function buildGridFieldComboSelectEnum(
  field: { f_name?: string; f_grid?: unknown; f_grid_fields?: unknown; f_cbo_query?: string },
  database: Record<string, any> | undefined,
  menuById: Map<string, any>,
  userContext?: UserAppIdInput,
  decrypt?: (s: string) => string,
  evalContext?: ComboGridEvalContext,
): Record<string, { text: string }> {
  const gridConfig = resolveFieldGridComboConfig(field, { decrypt, evalContext });
  const mergedField = gridConfig
    ? { ...field, f_grid: gridConfig.f_grid, f_grid_fields: gridConfig.f_grid_fields }
    : field;
  const gridFields = parseFieldGridComboFields(mergedField?.f_grid_fields);
  const tableName = resolveFieldGridComboTableName(mergedField, menuById);
  if (!tableName || gridFields.length === 0) return {};

  const rows = getComboTableRows(database, tableName);
  const enumObj: Record<string, { text: string }> = {};
  rows.forEach((row) => {
    const text = formatGridComboDisplayLabel(row, gridFields);
    if (!text) return;
    const keys = new Set<string>();
    const idKey = String(row?.id ?? "").trim();
    if (idKey) keys.add(idKey);
    gridFields.forEach((gridField) => {
      const alt = String(row?.[gridField] ?? "").trim();
      if (alt) keys.add(alt);
    });
    keys.forEach((key) => {
      enumObj[key] = { text };
    });
  });
  return enumObj;
}

/** Read row column — exact key first, then case-insensitive (menu JSON often has ID/Ten_kho, DB has id/ten_kho). */
export function resolveComboRowFieldValue(
  row: Record<string, any> | null | undefined,
  fieldName: string,
): unknown {
  if (!row || fieldName == null || String(fieldName).trim() === "") return undefined;
  const name = String(fieldName).trim();
  const direct = row[name];
  if (direct != null && direct !== "") return direct;

  const target = name.toLowerCase();
  for (const key of Object.keys(row)) {
    if (String(key).trim().toLowerCase() === target) {
      const val = row[key];
      if (val != null && val !== "") return val;
    }
  }
  return direct;
}

/** Match cell value to combo enum key — handles number/string and trim. */
export function lookupValueEnumLabel(
  valueEnum: Record<string, { text: string }> | undefined,
  rawValue: unknown,
): string {
  if (!valueEnum) return "";
  const text = String(rawValue ?? "").trim();
  if (!text) return "";

  const direct = valueEnum[text]?.text;
  if (direct) return direct;

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    const fromNum = valueEnum[String(numeric)]?.text ?? valueEnum[numeric as any]?.text;
    if (fromNum) return fromNum;
  }

  const lower = text.toLowerCase();
  for (const [key, item] of Object.entries(valueEnum)) {
    if (String(key).trim().toLowerCase() === lower) return item.text;
  }
  return "";
}

function comboRowMatchesValue(
  row: Record<string, any>,
  valueKey: string,
  valueFields: string[],
): boolean {
  const normalizedKey = String(valueKey).trim();
  if (!normalizedKey) return false;

  const idVal = String(resolveComboRowFieldValue(row, "id") ?? "").trim();
  if (idVal && idVal === normalizedKey) return true;

  for (const field of valueFields) {
    const cell = String(resolveComboRowFieldValue(row, field) ?? "").trim();
    if (cell && cell === normalizedKey) return true;
  }
  return false;
}

/** Fetch combo lookup rows for visible cell values (big-data safe — batched eq OR). */
export const COMBO_VALUE_FETCH_BATCH = 40;

export async function fetchComboRowsByValues(
  appId: string,
  tableName: string,
  lookupFields: string | string[],
  values: string[],
): Promise<Record<string, unknown>[]> {
  const fields = Array.from(new Set(
    (Array.isArray(lookupFields) ? lookupFields : [lookupFields])
      .map((field) => String(field || "").trim())
      .filter(Boolean),
  ));
  if (fields.length === 0) fields.push("id");

  const unique = Array.from(new Set(values.map((v) => String(v).trim()).filter(Boolean)));
  if (!appId || !tableName || unique.length === 0) return [];

  const buildConditions = (batch: string[]) => {
    const conditions: Array<{ field: string; type: "eq"; value: string | number }> = [];
    batch.forEach((value) => {
      fields.forEach((field) => {
        conditions.push({ field, type: "eq", value });
      });
      const numeric = Number(value);
      if (Number.isFinite(numeric) && String(numeric) === value) {
        fields.forEach((field) => {
          conditions.push({ field, type: "eq", value: numeric });
        });
      }
    });
    return conditions;
  };

  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += COMBO_VALUE_FETCH_BATCH) {
    batches.push(unique.slice(index, index + COMBO_VALUE_FETCH_BATCH));
  }

  const fetchBatch = async (batch: string[]) => {
    const conditions = buildConditions(batch);
    const response = await getTableData<Record<string, unknown>>({
      app_id: appId,
      obj_name: tableName,
      where: conditions.length === 1
        ? conditions[0]
        : { operator: "OR", conditions },
      limit: Math.max(batch.length * fields.length, batch.length),
      fresh: true,
    });
    return normalizeTableRows(response as Record<string, unknown>) as Record<string, unknown>[];
  };

  const pages = await Promise.all(batches.map((batch) => fetchBatch(batch).catch(() => [])));
  const merged = new Map<string, Record<string, unknown>>();
  pages.flat().forEach((row) => {
    const id = String(row?.id ?? "").trim();
    const key = id || JSON.stringify(row);
    merged.set(key, row);
  });
  return Array.from(merged.values());
}

export function resolveComboValueField(
  field: { f_grid_fields?: unknown; f_cbo_query?: string; f_name?: string; f_grid?: unknown },
  menuById?: Map<string, any>,
  options: {
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
    database?: Record<string, any>;
  } = {},
): string {
  const gridConfig = resolveFieldGridComboConfig(field, options);
  if (gridConfig) {
    // Vue f_grid lookup: valueExpr = 'id'
    return "id";
  }
  const queryConfig = resolveFieldQueryComboConfig(
    field,
    options.database || options.evalContext?.database,
    options,
  );
  if (queryConfig) return queryConfig.valueField;
  return "id";
}

/** Fields to match when fetching combo rows by cell value (id + configured grid/query columns). */
export function resolveComboLookupQueryFields(
  field: { f_grid_fields?: unknown; f_cbo_query?: string; f_name?: string; f_grid?: unknown },
  menuById?: Map<string, any>,
  options: {
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
    database?: Record<string, any>;
  } = {},
): string[] {
  const db = options.database || options.evalContext?.database;
  const gridConfig = resolveFieldGridComboConfig(field, options);
  const fields = new Set<string>(["id"]);
  if (gridConfig) {
    parseFieldGridComboFields(gridConfig.f_grid_fields).forEach((name) => {
      if (name) fields.add(name);
    });
  } else {
    const queryConfig = resolveFieldQueryComboConfig(field, db, options);
    if (queryConfig) {
      queryConfig.fields.forEach((name) => {
        if (name) fields.add(name);
      });
    }
  }
  const primary = resolveComboValueField(field, menuById, { ...options, database: db });
  if (primary) fields.add(primary);
  return Array.from(fields);
}

export function resolveQueryRowComboLabel(
  row: any,
  valueField: string,
  labelField: string,
  fields: unknown,
): string {
  const configuredFields = Array.isArray(fields)
    ? fields.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const effectiveLabelField = String(labelField || configuredFields[1] || valueField).trim() || valueField;
  const directLabel = String(resolveComboRowFieldValue(row, effectiveLabelField) ?? "").trim();
  const value = String(resolveComboRowFieldValue(row, valueField) ?? "").trim();
  return directLabel || value;
}

function filterComboRowsByWhere(rows: any[], whereClause: unknown): any[] {
  if (!whereClause || !Array.isArray(rows) || rows.length === 0) return rows;
  try {
    if (typeof whereClause === "object" && (whereClause as any).field && (whereClause as any).type) {
      const field = (whereClause as any).field;
      const type = (whereClause as any).type;
      const value = (whereClause as any).value;
      return rows.filter((row: any) => {
        const rowValue = row[field];
        switch (type) {
          case "eq": return rowValue == value;
          case "ne": return rowValue != value;
          case "gt": return rowValue > value;
          case "gte": return rowValue >= value;
          case "lt": return rowValue < value;
          case "lte": return rowValue <= value;
          case "like": return String(rowValue || "").toLowerCase().includes(String(value || "").toLowerCase());
          case "in": return Array.isArray(value) && value.includes(rowValue);
          default: return true;
        }
      });
    }
  } catch {
    // ignore filter errors
  }
  return rows;
}

function rowsToComboSelectEnum(
  rows: any[],
  valueField: string,
  labelField: string,
  fields: unknown,
): Record<string, { text: string }> {
  const enumObj: Record<string, { text: string }> = {};
  rows.forEach((row) => {
    const optionLabel = resolveQueryRowComboLabel(row, valueField, labelField, fields);
    const value = resolveComboRowFieldValue(row, valueField);
    if (value == null || value === "") return;
    enumObj[String(value)] = { text: optionLabel || String(value) };
    const idKey = String(resolveComboRowFieldValue(row, "id") ?? "").trim();
    if (idKey && idKey !== String(value)) {
      enumObj[idKey] = { text: optionLabel || idKey };
    }
  });
  return enumObj;
}

/** Vue getOptionsSelect parity — eval f_cbo_query as Function("seft","data", body). */
export function executeComboQueryObject(
  rawQuery: unknown,
  seft: any,
  database: Record<string, any> | undefined,
  decrypt?: (s: string) => string,
): any {
  const raw = String(rawQuery ?? "").trim();
  if (!raw) return null;

  const resolved = resolveEffectiveComboQueryText(raw, decrypt);
  if (!resolved) return null;

  const trimmed = resolved.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = parseStaticComboQuery(trimmed);
    if (parsed) return parsed;
  }

  try {
    const body = (resolved.includes("return ") ? "" : "return ") + resolved;
    const fn = new Function("seft", "data", body) as (seft: any, data: any) => any;
    return fn(seft, database) ?? null;
  } catch {
    return null;
  }
}

function optionItemsToSelectEnum(options: any[]): Record<string, { text: string }> {
  const enumObj: Record<string, { text: string }> = {};
  (options || []).forEach((opt: any) => {
    if (Array.isArray(opt)) {
      const ma = opt[0];
      const ten = opt[1] ?? opt[0];
      if (ma != null && ma !== "") enumObj[String(ma)] = { text: String(ten ?? ma) };
      return;
    }
    const ma = opt?.ma ?? opt?.value ?? opt?.id ?? opt?.key;
    const ten = opt?.ten ?? opt?.label ?? opt?.text ?? String(ma ?? "");
    if (ma != null && ma !== "") enumObj[String(ma)] = { text: String(ten) };
  });
  return enumObj;
}

/** Build valueEnum from evaluated f_cbo_query result object (Vue getOptionsSelect after eval). */
export function buildComboSelectEnumFromQueryObject(
  objQa: any,
  database: Record<string, any> | undefined,
  options: {
    menuById?: Map<string, any>;
    evalContext?: ComboGridEvalContext;
    decrypt?: (s: string) => string;
    userContext?: UserAppIdInput;
  } = {},
): Record<string, { text: string }> {
  if (!objQa || typeof objQa !== "object") return {};

  const gridId = String(objQa.f_grid ?? "").trim();
  if (
    gridId
    && objQa.f_grid_fields
    && gridId !== "true"
    && gridId !== "false"
    && options.menuById
    && options.menuById.size > 0
  ) {
    const gridEnum = buildGridFieldComboSelectEnum(
      { f_grid: objQa.f_grid, f_grid_fields: objQa.f_grid_fields },
      database,
      options.menuById,
      options.userContext,
      options.decrypt,
      options.evalContext,
    );
    if (Object.keys(gridEnum).length > 0) return gridEnum;
  }

  if (Array.isArray(objQa.options) && objQa.options.length > 0) {
    return optionItemsToSelectEnum(objQa.options);
  }

  if (!Array.isArray(objQa.query) || objQa.query.length === 0) return {};

  const enumObj: Record<string, { text: string }> = {};
  objQa.query.forEach((querySpec: any) => {
    const tableName = String(querySpec?.obj_name || "").trim();
    const fields = querySpec?.fields || [];
    if (!tableName || fields.length < 1) return;

    const valueField = String(querySpec?.value_field || fields[0] || "id").trim() || "id";
    const labelField = String(querySpec?.label_field || fields[1] || fields[0] || valueField).trim() || valueField;
    const rows = getComboTableRows(database, tableName);
    if (rows.length === 0) return;

    // Vue: load all rows first; obj_where is applied at edit-time for cascade, not here.
    Object.assign(enumObj, rowsToComboSelectEnum(rows, valueField, labelField, fields));
  });

  return enumObj;
}

/** Build select enum from f_cbo_query (static JSON or dynamic JS — Vue getOptionsSelect parity). */
export function buildFieldQueryComboSelectEnum(
  field: { f_cbo_query?: string; f_name?: string },
  database: Record<string, any> | undefined,
  options: {
    fallbackAppId?: string;
    userContext?: UserAppIdInput;
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
    menuById?: Map<string, any>;
  } = {},
): Record<string, { text: string }> {
  const rawQuery = String(field?.f_cbo_query || getLegacyFallbackComboQuery(field?.f_name) || "").trim();
  if (!rawQuery || !database) return {};

  const seft = options.evalContext?.seft || { database, appId: options.fallbackAppId };
  const objQa = executeComboQueryObject(rawQuery, seft, database, options.decrypt);
  if (!objQa) return {};

  return buildComboSelectEnumFromQueryObject(objQa, database, {
    menuById: options.menuById,
    evalContext: options.evalContext,
    decrypt: options.decrypt,
    userContext: options.userContext,
  });
}

/** Resolve Ant Design Select options for edit form — grid DB fallback when selectEnums empty. */
export function resolveEditFieldComboSelectOptions(
  field: { f_cbo_query?: string; f_name?: string; f_grid?: unknown; f_grid_fields?: unknown; f_options?: unknown },
  database: Record<string, any> | undefined,
  options: {
    selectEnum?: Record<string, { text: string }>;
    rawSelectOptions?: ComboOption[];
    menuById?: Map<string, any>;
    fallbackAppId?: string;
    userContext?: UserAppIdInput;
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
    localizeLabel?: (label: string) => string;
    cascadeOptions?: Array<{ value: any; label?: React.ReactNode }> | null;
    cascadeFrom?: string;
  } = {},
): ComboOption[] {
  const localize = options.localizeLabel ?? ((label: string) => label);

  if (options.cascadeFrom && options.cascadeOptions != null) {
    return (options.cascadeOptions ?? []).map((opt) => ({
      value: opt.value,
      label: localize(String(opt.label ?? opt.value ?? "")),
    }));
  }

  if (options.rawSelectOptions?.length) {
    return normalizeComboOptions(options.rawSelectOptions).map((opt) => ({
      value: opt.value,
      label: localize(opt.label),
    }));
  }

  let enumObj = options.selectEnum && Object.keys(options.selectEnum).length > 0
    ? options.selectEnum
    : {};

  if (Object.keys(enumObj).length === 0 && options.menuById && options.menuById.size > 0) {
    enumObj = buildGridFieldComboSelectEnum(
      field,
      database,
      options.menuById,
      options.userContext,
      options.decrypt,
      options.evalContext,
    );
  }

  if (Object.keys(enumObj).length === 0) {
    enumObj = buildFieldQueryComboSelectEnum(field, database, {
      fallbackAppId: options.fallbackAppId,
      userContext: options.userContext,
      decrypt: options.decrypt,
      evalContext: options.evalContext,
      menuById: options.menuById,
    });
  }

  return selectEnumToAntdOptions(enumObj, localize);
}

export function resolveComboCellDisplayLabel(
  rawValue: unknown,
  fieldName: string,
  valueEnum?: Record<string, { text: string }>,
  database?: Record<string, any>,
): string {
  const valueKey = String(rawValue ?? "").trim();
  if (!valueKey) return "";
  const fromEnum = lookupValueEnumLabel(valueEnum, rawValue);
  if (fromEnum) return fromEnum;
  if (["group_id", "permissionGroups"].includes(fieldName)) {
    return resolveRoleComboLabel(valueKey, database) || valueKey;
  }
  return valueKey;
}

/** Grid cell label with f_grid lookup fallback when valueEnum is stale or incomplete. */
export function resolveGridComboCellLabel(
  rawValue: unknown,
  field: { f_name?: string; f_grid?: unknown; f_grid_fields?: unknown; f_cbo_query?: string },
  database: Record<string, any> | undefined,
  menuById: Map<string, any>,
  valueEnum?: Record<string, { text: string }>,
  options: {
    decrypt?: (s: string) => string;
    evalContext?: ComboGridEvalContext;
  } = {},
): string {
  const valueKey = String(rawValue ?? "").trim();
  if (!valueKey) return "";

  const fromEnum = lookupValueEnumLabel(valueEnum, rawValue);
  if (fromEnum) return fromEnum;

  const gridConfig = resolveFieldGridComboConfig(field, options);
  if (gridConfig) {
    const mergedField = { ...field, f_grid: gridConfig.f_grid, f_grid_fields: gridConfig.f_grid_fields };
    const gridFields = parseFieldGridComboFields(gridConfig.f_grid_fields);
    const tableName = resolveFieldGridComboTableName(mergedField, menuById);
    if (tableName && gridFields.length > 0) {
      const rows = getComboTableRows(database, tableName);
      const valueFields = ["id", ...gridFields];
      const matched = rows.find((row) => comboRowMatchesValue(row, valueKey, valueFields));
      if (matched) return formatGridComboDisplayLabel(matched, gridFields);
    }
  }

  const queryConfig = resolveFieldQueryComboConfig(field, database, options);
  if (queryConfig) {
    const rows = getComboTableRows(database, queryConfig.tableName);
    const valueFields = [queryConfig.valueField, "id", queryConfig.labelField];
    const matched = rows.find((row) => comboRowMatchesValue(row, valueKey, valueFields));
    if (matched) {
      return resolveQueryRowComboLabel(
        matched,
        queryConfig.valueField,
        queryConfig.labelField,
        queryConfig.fields,
      );
    }
  }

  const os = getOptionsSelect(field?.f_cbo_query, database, {
    fieldName: field?.f_name,
    decrypt: options.decrypt,
    evalContext: options.evalContext,
  });
  if (os.options.length > 0) {
    const fromOptions = os.options.find((opt) => opt.ma === valueKey);
    if (fromOptions) return fromOptions.ten || valueKey;
  }

  return resolveComboCellDisplayLabel(rawValue, String(field?.f_name || ""), valueEnum, database);
}

/** Collect combo lookup tables to prefetch — same scan as CsmDynamicGrid mount effect. */
export function collectComboTableFetchRequests(
  fields: any[],
  options: {
    decrypt?: (s: string) => string;
    fallbackAppId?: string;
    menuById?: Map<string, any>;
    userContext?: UserAppIdInput;
    evalContext?: ComboGridEvalContext;
  } = {},
): ComboTableFetchRequest[] {
  const { decrypt, fallbackAppId = "csm", menuById, userContext, evalContext } = options;
  const tablesToFetch: ComboTableFetchRequest[] = [];

  (fields || []).forEach((f) => {
    const types = resolveEffectiveFieldTypes(f);
    if (!isComboLikeType(types)) return;

    const gridConfig = resolveFieldGridComboConfig(f, { decrypt, evalContext });
    const gridTableName = gridConfig
      ? resolveFieldGridComboTableName({ f_grid: gridConfig.f_grid }, menuById)
      : resolveFieldGridComboTableName(f, menuById);
    if (gridTableName) {
      tablesToFetch.push({
        tableName: gridTableName,
        appId: resolveComboQueryAppId(gridTableName, undefined, fallbackAppId, userContext, decrypt),
        whereClause: normalizeComboWhereClause(undefined),
      });
    }

    const rawQuery = String(f.f_cbo_query || getLegacyFallbackComboQuery(f.f_name) || "").trim();
    if (!rawQuery) return;

    const objQa = executeComboQueryObject(rawQuery, evalContext?.seft, evalContext?.database, decrypt);
    if (objQa?.f_grid && objQa?.f_grid_fields && menuById) {
      const gridTableName = resolveFieldGridComboTableName({ f_grid: objQa.f_grid }, menuById);
      if (gridTableName) {
        tablesToFetch.push({
          tableName: gridTableName,
          appId: resolveComboQueryAppId(gridTableName, undefined, fallbackAppId, userContext, decrypt),
          whereClause: normalizeComboWhereClause(undefined),
        });
      }
    }
    if (objQa && Array.isArray(objQa.query)) {
      objQa.query.forEach((querySpec: any) => {
        if (!querySpec?.obj_name) return;
        tablesToFetch.push({
          tableName: querySpec.obj_name,
          appId: resolveComboQueryAppId(querySpec.obj_name, querySpec.app_id, fallbackAppId, userContext, decrypt),
          whereClause: normalizeComboWhereClause(querySpec.obj_where),
        });
      });
      return;
    }

    const q = resolveEffectiveComboQueryText(rawQuery, decrypt);

    if (q.startsWith("f_grid:")) {
      const tableName = q.split(":")[1];
      if (tableName) {
        tablesToFetch.push({
          tableName,
          appId: resolveComboQueryAppId(tableName, undefined, fallbackAppId, userContext, decrypt),
          whereClause: normalizeComboWhereClause(undefined),
        });
      }
      return;
    }

    const trimmedQ = q.trim();
    if (!(trimmedQ.startsWith("{") || trimmedQ.startsWith("["))) return;

    const parsed = parseStaticComboQuery(trimmedQ);
    if (!parsed || !Array.isArray(parsed.query)) return;

    parsed.query.forEach((querySpec: any) => {
      if (!querySpec?.obj_name) return;
      tablesToFetch.push({
        tableName: querySpec.obj_name,
        appId: resolveComboQueryAppId(querySpec.obj_name, querySpec.app_id, fallbackAppId, userContext, decrypt),
        whereClause: normalizeComboWhereClause(querySpec.obj_where),
      });
    });
  });

  return tablesToFetch.filter((item, index, self) => {
    const key = `${item.appId}::${item.tableName}::${JSON.stringify(item.whereClause)}`;
    return index === self.findIndex((t) => `${t.appId}::${t.tableName}::${JSON.stringify(t.whereClause)}` === key);
  });
}
