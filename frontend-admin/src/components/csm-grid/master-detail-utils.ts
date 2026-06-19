import { csmDecrypt } from "./CsmCrypto";

type Row = Record<string, any>;

function safeEvalFilter(body: string): ((obj: Row) => boolean) | null {
	try {
		// eslint-disable-next-line no-new-func
		return new Function("obj", body) as (obj: Row) => boolean;
	} catch {
		return null;
	}
}

/** Parse detail rows embedded on a master record field (array or JSON string). */
export function parseDetailRowsFromMasterField(raw: unknown): Row[] {
	if (raw == null) return [];
	if (Array.isArray(raw)) return raw;
	if (typeof raw === "string" && raw.trim()) {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
}

/**
 * Vue parity (csm_grid.vue): detail grid dataSource = select_row[mn.table_name], not database[mn.table_name].rows.
 */
export function resolveDetailGridRowsFromMaster(
	selectRow: Row | null | undefined,
	detailTableName: string,
	options?: {
		filterCode?: string;
		decrypt?: (input: string) => string;
	},
): Row[] {
	if (!selectRow || !detailTableName) return [];

	let rows = parseDetailRowsFromMasterField(selectRow[detailTableName]);
	const filterCode = String(options?.filterCode || "").trim();
	if (!filterCode) return rows;

	let code = filterCode;
	const decryptFn = options?.decrypt || csmDecrypt;
	try {
		code = decryptFn(filterCode) || filterCode;
	} catch {
		try {
			code = csmDecrypt(filterCode);
		} catch {
			code = filterCode;
		}
	}

	const filterFn = safeEvalFilter(code);
	if (!filterFn) return rows;

	try {
		rows = rows.filter((row) => !!filterFn(row));
	} catch {
		// ignore broken filter trigger
	}
	return rows;
}

export function cloneRow<T extends Row>(row: T | null | undefined): T | null {
	if (!row || typeof row !== "object") return null;
	return JSON.parse(JSON.stringify(row)) as T;
}

export function getPrimaryKeyFieldsFromConfig(mConfig: { struct?: { fieldsPK?: string[] } } | null | undefined): string[] {
	const rawFields = Array.isArray(mConfig?.struct?.fieldsPK) ? mConfig!.struct!.fieldsPK! : [];
	const normalizedFields = rawFields.map((field) => String(field || "").trim()).filter(Boolean);
	return normalizedFields.length > 0 ? normalizedFields : ["id"];
}

export function buildMasterRowKey(row: Row | null | undefined, pkFields: string[]): string {
	if (!row) return "";
	const fields = pkFields.length > 0 ? pkFields : ["id"];
	const compositeKey = fields
		.map((field) => `${field}:${row[field] == null ? "" : String(row[field])}`)
		.join("|");
	if (compositeKey.replace(/[|:]/g, "").trim()) return compositeKey;
	if (row.id != null && row.id !== "") return `id:${String(row.id)}`;
	return JSON.stringify(row);
}

/** Resolve the full master row from in-memory grid data (Vue: load_db.find(it => it.id === data.id)). */
export function resolveMasterRowFromGridSelection(
	selectedRow: Row | null | undefined,
	candidateRows: Row[] | undefined,
	pkFields: string[],
): Row | null {
	if (!selectedRow) return null;
	const rows = Array.isArray(candidateRows) ? candidateRows : [];
	if (rows.length === 0) return cloneRow(selectedRow);

	const selectedKey = buildMasterRowKey(selectedRow, pkFields);
	const matched = rows.find((row) => buildMasterRowKey(row, pkFields) === selectedKey);
	return cloneRow(matched || selectedRow);
}
