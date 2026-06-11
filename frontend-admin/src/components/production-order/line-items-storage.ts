import type { LineItemsEditorConfig, OrderHeader, ProductGroup } from "./types";
import { newGroup } from "./utils";

export const DEFAULT_LINE_ITEMS_DATA_FIELD = "payload_json";
export const DEFAULT_LINE_ITEMS_GROUPS_KEY = "groups";

export function resolveLineItemsDataField(config: LineItemsEditorConfig): string {
	const field = String(config.line_items_data_field || DEFAULT_LINE_ITEMS_DATA_FIELD).trim();
	return field || DEFAULT_LINE_ITEMS_DATA_FIELD;
}

export function resolveLineItemsGroupsKey(config: LineItemsEditorConfig): string {
	const key = String(config.line_items_groups_key || DEFAULT_LINE_ITEMS_GROUPS_KEY).trim();
	return key || DEFAULT_LINE_ITEMS_GROUPS_KEY;
}

function parseJsonValue(raw: unknown): Record<string, unknown> | null {
	if (raw == null || raw === "") return null;
	if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
	if (typeof raw !== "string") return null;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: null;
	} catch {
		return null;
	}
}

export function extractHeaderFromRow(
	row: Record<string, any>,
	config: LineItemsEditorConfig,
): OrderHeader {
	const dataField = resolveLineItemsDataField(config);
	const header: OrderHeader = {};
	const reserved = new Set([dataField, "id", "app_id", "created_at", "updated_at"]);

	for (const field of config.table ?? []) {
		const name = String(field?.f_name ?? "").trim();
		if (!name || reserved.has(name)) continue;
		if (row[name] !== undefined) header[name] = row[name];
	}

	for (const [key, value] of Object.entries(row)) {
		if (reserved.has(key) || key.startsWith("_")) continue;
		if (!(key in header) && value !== undefined && typeof value !== "object") {
			header[key] = value;
		}
	}

	return header;
}

export function extractGroupsFromRow(
	row: Record<string, any>,
	config: LineItemsEditorConfig,
): ProductGroup[] {
	const dataField = resolveLineItemsDataField(config);
	const groupsKey = resolveLineItemsGroupsKey(config);
	const payload = parseJsonValue(row[dataField]);
	const rawGroups = payload?.[groupsKey];

	if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
		return [newGroup({ vat_default: config.line_items_group?.vat_default ?? 10 })];
	}

	return rawGroups.map((group: any, index: number) => ({
		id: String(group?.id ?? `g-${index + 1}`),
		spec: String(group?.spec ?? ""),
		vat_rate: Number(group?.vat_rate ?? config.line_items_group?.vat_default ?? 10),
		items: Array.isArray(group?.items)
			? group.items.map((item: any, itemIndex: number) => ({
				key: String(item?.key ?? `i-${index + 1}-${itemIndex + 1}`),
				...item,
			}))
			: [],
	}));
}

export function parseLineItemsRecord(
	row: Record<string, any>,
	config: LineItemsEditorConfig,
): { header: OrderHeader; groups: ProductGroup[] } {
	return {
		header: extractHeaderFromRow(row, config),
		groups: extractGroupsFromRow(row, config),
	};
}

export function buildLineItemsSavePayload(
	header: OrderHeader,
	groups: ProductGroup[],
	config: LineItemsEditorConfig,
	existingRow?: Record<string, any>,
): Record<string, any> {
	const dataField = resolveLineItemsDataField(config);
	const groupsKey = resolveLineItemsGroupsKey(config);
	const row: Record<string, any> = { ...(existingRow ?? {}) };

	for (const field of config.table ?? []) {
		const name = String(field?.f_name ?? "").trim();
		if (!name || name === dataField) continue;
		if (header[name] !== undefined) row[name] = header[name];
	}

	for (const [key, value] of Object.entries(header)) {
		if (key === dataField) continue;
		if (value !== undefined) row[key] = value;
	}

	row[dataField] = JSON.stringify({
		[groupsKey]: groups,
	});

	return row;
}

export interface LineItemsListColumn {
	field: string;
	label?: string;
	width?: number;
}

export function resolveLineItemsListColumns(
	config: LineItemsEditorConfig,
): LineItemsListColumn[] {
	if (Array.isArray(config.line_items_list) && config.line_items_list.length > 0) {
		return config.line_items_list
			.map(item => ({
				field: String(item?.field ?? "").trim(),
				label: item?.label,
				width: item?.width,
			}))
			.filter(item => item.field.length > 0);
	}

	return (config.table ?? [])
		.filter((field: any) => Number(field?.f_show ?? 1) !== 0)
		.sort((a: any, b: any) => Number(a?.f_stt ?? 0) - Number(b?.f_stt ?? 0))
		.slice(0, 6)
		.map((field: any) => ({
			field: String(field.f_name ?? "").trim(),
			label: String(field.f_label ?? field.f_header ?? field.f_name ?? ""),
			width: Number(field.f_width_col ?? 12) * 12,
		}))
		.filter(item => item.field.length > 0);
}
