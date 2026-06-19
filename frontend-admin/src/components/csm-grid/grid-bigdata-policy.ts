/** Above this row count → server-paged grid (never hold full table in React state). */
export const GRID_SERVER_PAGE_THRESHOLD = 500;

/** Default page size when menu does not specify table_pagesize. */
export const GRID_SERVER_DEFAULT_PAGE_SIZE = 50;

/** Max rows fetched per request during full export / combo preload. */
export const GRID_SERVER_MAX_PAGE_SIZE = 1000;

export type TableStoreMeta = {
	rows?: unknown[]
	fieldsPK?: string[]
	totalCount?: number
	serverPaged?: boolean
	pageSize?: number
	app_id?: string
};

export function parseTableTotalCount(response: Record<string, unknown> | null | undefined, fallback = 0): number {
	const raw = response?.totalCount ?? response?.total ?? response?.total_count;
	const n = Number(raw);
	if (Number.isFinite(n) && n >= 0) return n;
	const rows = response?.rows ?? response?.data;
	if (Array.isArray(rows)) return Math.max(fallback, rows.length);
	return fallback;
}

export function normalizeTableRows(response: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
	const rows = response?.rows ?? response?.data;
	return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

export function shouldEnableServerPaging(totalCount: number, pageRows: number, pageSize: number): boolean {
	if (totalCount > GRID_SERVER_PAGE_THRESHOLD) return true;
	if (pageRows >= pageSize && totalCount > pageSize) return true;
	return false;
}

export type PrimaryTableLoadPlan = {
	rows: Record<string, unknown>[]
	fieldsPK: string[]
	totalCount: number
	serverPaged: boolean
	pageSize: number
};

/** Probe + first page — avoids downloading 100k rows on menu open. */
export async function loadPrimaryTablePage<T extends Record<string, unknown>>(
	fetchPage: (limit: number, offset: number) => Promise<T>,
	options: { pageSize?: number; threshold?: number } = {},
): Promise<PrimaryTableLoadPlan> {
	const pageSize = Math.max(10, Math.min(200, options.pageSize ?? GRID_SERVER_DEFAULT_PAGE_SIZE));
	const threshold = options.threshold ?? GRID_SERVER_PAGE_THRESHOLD;

	const first = await fetchPage(pageSize, 0);
	const firstRows = normalizeTableRows(first);
	const totalCount = parseTableTotalCount(first, firstRows.length);
	const fieldsPK = Array.isArray((first as any).fieldsPK) ? (first as any).fieldsPK as string[] : ["id"];
	const serverPaged = shouldEnableServerPaging(totalCount, firstRows.length, pageSize);

	if (!serverPaged && totalCount > firstRows.length && totalCount <= threshold) {
		const full = await fetchPage(totalCount, 0);
		const allRows = normalizeTableRows(full);
		return {
			rows: allRows,
			fieldsPK,
			totalCount: parseTableTotalCount(full, allRows.length),
			serverPaged: false,
			pageSize,
		};
	}

	return {
		rows: firstRows,
		fieldsPK,
		totalCount,
		serverPaged,
		pageSize,
	};
}

export type FetchTablePageOptions = {
	appId: string
	tableName: string
	where?: import("./CsmApi").Where
	sort?: import("./grid-server-query").GridSortSpec[]
	limit: number
	offset: number
	onlyMySubusers?: boolean
};

/** Fetch all rows for export — streams pages up to maxRows. */
export async function fetchAllTableRows(
	fetchPage: (limit: number, offset: number) => Promise<Record<string, unknown>>,
	options: { pageSize?: number; maxRows?: number } = {},
): Promise<Record<string, unknown>[]> {
	const pageSize = Math.max(10, Math.min(GRID_SERVER_MAX_PAGE_SIZE, options.pageSize ?? GRID_SERVER_MAX_PAGE_SIZE));
	const maxRows = Math.max(pageSize, options.maxRows ?? 50000);
	const allRows: Record<string, unknown>[] = [];
	let offset = 0;

	while (allRows.length < maxRows) {
		const response = await fetchPage(pageSize, offset);
		const pageRows = normalizeTableRows(response);
		if (pageRows.length === 0) break;
		allRows.push(...pageRows);
		const total = parseTableTotalCount(response, allRows.length);
		offset += pageRows.length;
		if (pageRows.length < pageSize || offset >= total) break;
	}

	return allRows.slice(0, maxRows);
}
