import { useEffect, useState } from "react";
import { collectComboTableFetchRequests, getComboTableRows } from "./combo-utils";

/** Dev-only logging — no-op in production builds. */
export function gridDevLog(...args: unknown[]): void {
	if (import.meta.env.DEV) {
		console.log(...args);
	}
}

export function useDebouncedValue<T>(value: T, delayMs = 280): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

/** Signature of combo lookup tables — avoids selectEnums rebuild on unrelated database mutations. */
export function buildComboDatabaseSignature(
	fields: unknown[],
	database: Record<string, unknown> | undefined,
	options: Parameters<typeof collectComboTableFetchRequests>[1] = {},
): string {
	const fetches = collectComboTableFetchRequests(fields as any[], options);
	const tableNames = Array.from(new Set(fetches.map((item) => item.tableName))).sort();
	if (tableNames.length === 0) return "";
	return tableNames
		.map((name) => {
			const rows = getComboTableRows(database, name);
			const stored = database?.[name] as { app_id?: string; appId?: string } | undefined;
			const appId = String(stored?.app_id || stored?.appId || "");
			return `${name}:${rows.length}:${appId}`;
		})
		.join("|");
}

export const GRID_VIRTUAL_ROW_THRESHOLD = 120;
export const KANBAN_MAX_CARDS_PER_COLUMN = 100;
export const GRID_PAGE_SIZE_OPTIONS = ["10", "20", "50", "100", "200"] as const;

/** Client-side page slice — render only the current page, not the full dataset. */
export function paginateRows<T>(rows: readonly T[], current: number, pageSize: number): T[] {
	if (!rows.length || pageSize <= 0) return rows as T[];
	const start = (Math.max(1, current) - 1) * pageSize;
	if (start >= rows.length) return [];
	return rows.slice(start, start + pageSize);
}

export type RowTimeBounds = { start: number | null; end: number | null };

/** Single pass: cache row time bounds for timeline/report views. */
export function indexRowsWithTimeBounds<T>(
	rows: T[],
	getBounds: (row: T) => RowTimeBounds,
): Array<{ row: T; bounds: RowTimeBounds }> {
	return rows.map((row) => ({ row, bounds: getBounds(row) }));
}

export function filterIndexedRowsForBucket<T>(
	indexedRows: Array<{ row: T; bounds: RowTimeBounds }>,
	bucketStartMs: number,
	bucketEndMs: number,
): T[] {
	const out: T[] = [];
	for (let i = 0; i < indexedRows.length; i += 1) {
		const { row, bounds } = indexedRows[i];
		const compareStart = bounds.start ?? bounds.end;
		const compareEnd = bounds.end ?? bounds.start;
		if (compareStart == null && compareEnd == null) continue;
		if (compareStart! <= bucketEndMs && compareEnd! >= bucketStartMs) {
			out.push(row);
		}
	}
	return out;
}
