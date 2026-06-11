/** Helpers dùng chung cho header form type_form=7 */

export function parsePipeOptions(raw: unknown): { value: string; label: string }[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text.split("|").map((part) => {
    const [value, label] = part.split(":").map((s) => s.trim());
    return { value, label: label ?? value };
  }).filter((o) => o.value);
}

export function parseCoOptions(f: Record<string, any>): { value: string; label: string }[] {
  const fromPipe = parsePipeOptions(f.f_options);
  if (fromPipe.length > 0) return fromPipe;

  const raw = String(f.f_cbo_query ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.options) && parsed.options.length > 0) {
      return parsed.options.map((o: any) => ({
        value: String(o.ma ?? o.value ?? ""),
        label: String(o.ten ?? o.label ?? o.ma ?? ""),
      })).filter((o: { value: string }) => o.value);
    }
  } catch { /* ignore */ }
  return [];
}

export function parseGridFieldMap(f: Record<string, any>): Record<string, string> {
  const map: Record<string, string> = {};
  const raw = f.f_grid_fields;
  if (typeof raw === "string" && raw.trim()) {
    raw.split(",").forEach((pair: string) => {
      const [src, dst] = pair.split("->").map((s) => s.trim());
      if (src && dst) map[src] = dst;
    });
    return map;
  }
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      const text = String(item ?? "").trim();
      if (!text) return;
      if (text.includes("->")) {
        const [src, dst] = text.split("->").map((s) => s.trim());
        if (src && dst) map[src] = dst;
      } else {
        map[text] = text;
      }
    });
  }
  return map;
}

export function resolveComboQueryMeta(f: Record<string, any>): {
  tableName: string;
  valueField: string;
  labelField: string;
} {
  try {
    const parsed = JSON.parse(String(f.f_cbo_query ?? "{}"));
    const q = parsed?.query?.[0];
    const fields = Array.isArray(q?.fields) ? q.fields : [];
    return {
      tableName: String(q?.obj_name ?? "").trim(),
      valueField: String(q?.value_field || fields[0] || "id").trim(),
      labelField: String(q?.label_field || fields[1] || fields[0] || "ten").trim(),
    };
  } catch {
    return { tableName: "", valueField: "id", labelField: "ten" };
  }
}

export function buildComboOptionsFromRows(
  f: Record<string, any>,
  rows: Record<string, any>[],
): { value: string; label: string }[] {
  const staticOpts = parseCoOptions(f);
  if (staticOpts.length > 0) return staticOpts;
  const { valueField, labelField } = resolveComboQueryMeta(f);
  return rows.map((r) => ({
    value: String(r[valueField] ?? r.id ?? ""),
    label: String(r[labelField] ?? r.ten_kh ?? r.ten ?? r[valueField] ?? ""),
  })).filter((o) => o.value);
}

export function applyGridFieldMap(
  map: Record<string, string>,
  row: Record<string, any>,
  base: Record<string, any> = {},
): Record<string, any> {
  const patch = { ...base };
  Object.entries(map).forEach(([src, dst]) => {
    if (row[src] != null) patch[dst] = row[src];
  });
  return patch;
}

export function blockNonNumericKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault: () => void }, allowDecimal = true) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const allowed = allowDecimal ? /^[0-9.,\-]$/ : /^[0-9]$/;
  if (e.key.length === 1 && !allowed.test(e.key)) e.preventDefault();
}

export function isDateFieldName(name: string): boolean {
  const n = String(name ?? "").toLowerCase();
  return /ngay|date|hieu_luc|thoi_han/.test(n);
}

export function isDateFieldConfig(f: Record<string, any>): boolean {
  const t = String(f.f_types ?? "ed").toLowerCase().trim();
  if (["date", "datetime", "time"].includes(t)) return true;
  return isDateFieldName(String(f.f_name ?? ""));
}

export function isAutoNumberField(name: string): boolean {
  const n = String(name ?? "").toLowerCase();
  return n === "so_bao_gia" || n === "so_lenh";
}
