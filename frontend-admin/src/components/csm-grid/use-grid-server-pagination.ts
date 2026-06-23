import { useCallback, useEffect, useRef, useState } from "react";
import { getTableData, type Where } from "./CsmApi";
import { GRID_SERVER_DEFAULT_PAGE_SIZE, normalizeTableRows, parseTableTotalCount } from "./grid-bigdata-policy";
import { buildRowsSyncSignature } from "./grid-perf-utils";
import type { GridSortSpec } from "./grid-server-query";
import { serializeGridServerQuery, type GridServerQuery } from "./grid-server-query";

type Row = Record<string, any>;

export type GridServerPaginationState = {
	rows: Row[]
	total: number
	page: number
	pageSize: number
	loading: boolean
	enabled: boolean
	fetchPage: (page: number, pageSize: number) => Promise<void>
};

export function useGridServerPagination(options: {
	enabled: boolean
	appId: string
	tableName: string
	baseWhere?: Where
	serverQuery?: GridServerQuery
	onlyMySubusers?: boolean
	initialPageSize?: number
	initialRows?: Row[]
	initialTotal?: number
}): GridServerPaginationState {
	const {
		enabled,
		appId,
		tableName,
		baseWhere,
		serverQuery,
		onlyMySubusers,
		initialPageSize = GRID_SERVER_DEFAULT_PAGE_SIZE,
		initialRows,
		initialTotal,
	} = options;

	const [rows, setRows] = useState<Row[]>(initialRows ?? []);
	const [total, setTotal] = useState(initialTotal ?? initialRows?.length ?? 0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(initialPageSize);
	const [loading, setLoading] = useState(false);
	const requestIdRef = useRef(0);
	const seededRef = useRef(Boolean(initialRows?.length));
	const serverQueryKey = serializeGridServerQuery(serverQuery ?? { sort: [] });
	const initialRowsSignature = buildRowsSyncSignature(initialRows);

	useEffect(() => {
		if (!enabled || !initialRows?.length) return;
		setRows(initialRows);
		if (typeof initialTotal === "number" && initialTotal >= 0) {
			setTotal(initialTotal);
		}
	}, [enabled, initialRowsSignature, initialTotal, initialRows]);

	const resolveWhere = useCallback((): Where | undefined => {
		return serverQuery?.where ?? baseWhere;
	}, [serverQuery?.where, baseWhere]);

	const resolveSort = useCallback((): GridSortSpec[] => {
		return serverQuery?.sort ?? [];
	}, [serverQuery?.sort]);

	const fetchPage = useCallback(async (nextPage: number, nextPageSize: number) => {
		if (!enabled || !tableName || !appId) return;

		const reqId = ++requestIdRef.current;
		setLoading(true);
		try {
			const offset = Math.max(0, (nextPage - 1) * nextPageSize);
			const sort = resolveSort();
			const response = await getTableData<Row>({
				app_id: appId,
				obj_name: tableName,
				where: resolveWhere(),
				limit: nextPageSize,
				offset,
				...(sort.length > 0 ? { sort } : {}),
				...(onlyMySubusers ? { only_my_subusers: true } : {}),
				fresh: true,
			});

			if (reqId !== requestIdRef.current) return;

			const pageRows = normalizeTableRows(response as Record<string, unknown>) as Row[];
			setRows(pageRows);
			setTotal(parseTableTotalCount(response as Record<string, unknown>, pageRows.length));
			setPage(nextPage);
			setPageSize(nextPageSize);
		} finally {
			if (reqId === requestIdRef.current) {
				setLoading(false);
			}
		}
	}, [appId, enabled, onlyMySubusers, resolveSort, resolveWhere, tableName]);

	const fetchPageRef = useRef(fetchPage);
	fetchPageRef.current = fetchPage;

	useEffect(() => {
		if (!enabled) {
			seededRef.current = false;
			return;
		}
		if (seededRef.current && initialRows?.length) {
			seededRef.current = false;
			return;
		}
		seededRef.current = false;
		void fetchPageRef.current(1, pageSize);
	}, [enabled, tableName, appId, pageSize, serverQueryKey]);

	return {
		rows,
		total,
		page,
		pageSize,
		loading,
		enabled,
		fetchPage,
	};
}
