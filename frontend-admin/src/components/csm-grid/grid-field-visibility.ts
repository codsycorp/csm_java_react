/** Internal/audit fields — never show as grid columns (Vue csm_grid parity + CSM convention). */
export const GRID_HIDDEN_SYSTEM_FIELD_NAMES = new Set([
	"crt_user",
	"upd_user",
	"mod_user",
	"modify_user",
	"lock_status",
	"lock_user",
	"lock_by",
]);

export function normalizeGridFieldName(fName: unknown): string {
	return String(fName ?? "").trim().toLowerCase();
}

export function isGridHiddenFieldName(fName: unknown): boolean {
	const name = normalizeGridFieldName(fName);
	if (!name) return true;
	if (name === "id" || name === "parent_id") return true;
	return GRID_HIDDEN_SYSTEM_FIELD_NAMES.has(name);
}

/** Whether a menu table field may appear as a data grid column. */
export function isGridVisibleTableField(field: {
	f_name?: string;
	f_show?: number | string | null;
	f_showgrid?: number | string | null;
}): boolean {
	if (Number(field?.f_show) !== 1) return false;
	if (isGridHiddenFieldName(field?.f_name)) return false;
	const showGrid = field?.f_showgrid;
	if (showGrid != null && showGrid !== "" && Number(showGrid) === 0) return false;
	return true;
}
