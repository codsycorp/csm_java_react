import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTableData } from "./CsmApi";
import { globalTableFetchCache } from "./CsmEditModal";
import {
	collectComboTableFetchRequests,
	fetchComboRowsByValues,
	getLegacyFallbackComboQuery,
	isComboLikeType,
	isDefaultComboWhereClause,
	lookupValueEnumLabel,
	resolveComboQueryAppId,
	resolveComboLookupQueryFields,
	resolveEffectiveFieldTypes,
	resolveFieldComboLookupTableName,
	resolveGridComboCellLabel,
	storedTableAppIdMatches,
	type ComboTableFetchRequest,
	type ComboGridEvalContext,
} from "./combo-utils";
import { loadComboLookupTable, loadComboLookupTableForEdit, type PrimaryTableLoadPlan } from "./grid-bigdata-policy";
import { gridDevLog } from "./grid-perf-utils";
import { csmDecrypt } from "./CsmCrypto";
import type { UserAppIdInput } from "#src/utils/user-app-id";

export type ComboPrefetchStore = {
	database: Record<string, unknown>
	setTableData: (tableName: string, data: any) => void
	mergeTableRows?: (tableName: string, rows: Record<string, unknown>[], meta?: Record<string, unknown>) => void
	decrypt?: (input: string) => string
};

export type ComboPrefetchOptions = ComboPrefetchStore & {
	fields: unknown[]
	fallbackAppId?: string
	menuById?: Map<string, unknown>
	userContext?: UserAppIdInput
	evalContext?: ComboGridEvalContext
};

export type ComboHydrationItem = {
	key: string
	appId: string
	tableName: string
	lookupFields: string[]
	values: string[]
};

export type ComboFetchMode = "cached" | "probe" | "full";

export type ComboLoadPurpose = "grid" | "edit";

function hasUsableComboWhere(whereClause: unknown): boolean {
	return Boolean(
		whereClause
		&& !isDefaultComboWhereClause(whereClause)
		&& (
			(typeof whereClause === "string" && whereClause.trim())
			|| (typeof whereClause === "object" && (
				((whereClause as any).field && (whereClause as any).type)
				|| ((whereClause as any).operator && Array.isArray((whereClause as any).conditions))
			))
		),
	);
}

/** True when combo lookup is fully loaded for edit dropdowns (all rows in store). */
export function isComboTableFullyLoaded(
	req: ComboTableFetchRequest,
	database: Record<string, unknown>,
	decrypt?: (input: string) => string,
): boolean {
	const appId = String(req.appId || "csm");
	const tableName = String(req.tableName || "").trim();
	if (!tableName) return true;

	const existing = database[tableName] as {
		rows?: unknown[]
		app_id?: string
		serverPaged?: boolean
		totalCount?: number
		comboHydrationOnly?: boolean
	} | undefined;
	if (!existing || !Array.isArray(existing.rows)) return false;

	const storedAppId = String(existing.app_id || "").trim();
	if (!storedTableAppIdMatches(storedAppId, appId, decrypt || csmDecrypt)) return false;
	if (existing.comboHydrationOnly) return false;

	const totalCount = Number(existing.totalCount ?? existing.rows.length);
	if (totalCount <= 0) return existing.rows.length > 0;

	return existing.rows.length >= totalCount;
}

/** True when grid can skip combo prefetch (probe metadata or full load already in store). */
export function isComboTableCachedForGrid(
	req: ComboTableFetchRequest,
	database: Record<string, unknown>,
	decrypt?: (input: string) => string,
): boolean {
	if (isComboTableFullyLoaded(req, database, decrypt)) return true;

	const appId = String(req.appId || "csm");
	const tableName = String(req.tableName || "").trim();
	if (!tableName) return true;

	if (hasUsableComboWhere(req.whereClause)) return false;

	const existing = database[tableName] as {
		rows?: unknown[]
		app_id?: string
		serverPaged?: boolean
		totalCount?: number
		comboHydrationOnly?: boolean
	} | undefined;
	if (!existing) return false;

	const storedAppId = String(existing.app_id || "").trim();
	if (!storedTableAppIdMatches(storedAppId, appId, decrypt || csmDecrypt)) return false;

	const totalCount = Number(existing.totalCount ?? existing.rows?.length ?? 0);
	return Boolean(existing.comboHydrationOnly || existing.serverPaged) && totalCount > 0;
}

/** @deprecated Use isComboTableCachedForGrid or isComboTableFullyLoaded */
export function isComboTableCached(
	req: ComboTableFetchRequest,
	database: Record<string, unknown>,
	decrypt?: (input: string) => string,
): boolean {
	return isComboTableCachedForGrid(req, database, decrypt);
}

/** Stable signature for combo field config — drives prefetch invalidation. */
export function buildComboFieldsSignature(fields: unknown[], suffix = ""): string {
	const comboFields = (fields || []).filter((field) => {
		const types = resolveEffectiveFieldTypes(field as { f_types?: string });
		return isComboLikeType(types);
	});
	const base = comboFields
		.map((field: any) => `${String(field?.f_name || "")}:${String(field?.f_cbo_query || getLegacyFallbackComboQuery(field?.f_name) || "")}`)
		.sort()
		.join("|");
	return suffix ? `${base}::${suffix}` : base;
}

function comboCacheKey(appId: string, tableName: string, whereClause: unknown): string {
	const effectiveWhere = whereClause ?? { field: "id", type: "like", value: "" };
	return `${appId}::${tableName}::${JSON.stringify(effectiveWhere)}`;
}

/** Fetch one combo lookup table into the global store. */
export async function fetchComboTableIntoStore(
	req: ComboTableFetchRequest,
	store: ComboPrefetchStore,
	options?: {
		purpose?: ComboLoadPurpose
		onFullLoadStart?: () => void
		onFullLoadEnd?: () => void
	},
): Promise<ComboFetchMode> {
	const purpose = options?.purpose ?? "grid";
	const { database, setTableData, decrypt } = store;
	const appId = String(req.appId || "csm");
	const tableName = String(req.tableName || "").trim();
	if (!tableName) return "cached";

	const hasUsableWhere = hasUsableComboWhere(req.whereClause);
	const effectiveWhere = hasUsableWhere
		? req.whereClause
		: { field: "id", type: "like", value: "" };

	const cacheKey = `${purpose}::${comboCacheKey(appId, tableName, effectiveWhere)}`;

	const isCached = purpose === "edit"
		? isComboTableFullyLoaded(req, database, decrypt)
		: isComboTableCachedForGrid(req, database, decrypt);
	if (!hasUsableWhere && isCached) {
		return "cached";
	}

	if (globalTableFetchCache.has(cacheKey)) {
		await globalTableFetchCache.get(cacheKey);
		return purpose === "edit" ? "full" : "cached";
	}

	const fetchPage = (limit: number, offset: number) => getTableData({
		app_id: appId,
		obj_name: tableName,
		where: effectiveWhere as any,
		limit,
		offset,
		fresh: purpose === "edit" || (offset > 0 || limit > 1),
	});

	const loadPromise = purpose === "edit"
		? loadComboLookupTableForEdit<Record<string, unknown>>(fetchPage, {
			onFullLoadStart: options?.onFullLoadStart,
			onFullLoadEnd: options?.onFullLoadEnd,
		})
		: loadComboLookupTable<Record<string, unknown>>(fetchPage, {
			forceFullLoad: hasUsableWhere,
			onFullLoadStart: options?.onFullLoadStart,
			onFullLoadEnd: options?.onFullLoadEnd,
		});

	const fetchPromise = loadPromise.then((load: PrimaryTableLoadPlan) => {
		setTableData(tableName, {
			id: tableName,
			rows: load.rows,
			fieldsPK: load.fieldsPK,
			totalCount: load.totalCount,
			serverPaged: load.serverPaged,
			pageSize: load.pageSize,
			comboHydrationOnly: purpose === "edit" ? false : load.comboHydrationOnly,
			app_id: appId,
		});
		gridDevLog(
			`[combo-prefetch:${purpose}] ${tableName}: ${load.rows.length}/${load.totalCount} rows`
			+ (load.comboHydrationOnly ? " (hydration-only)" : " (full)"),
		);
		if (purpose === "edit" || !load.comboHydrationOnly) return "full" as const;
		return "probe" as const;
	}).catch((err: unknown) => {
		console.warn(`[combo-prefetch:${purpose}] failed ${tableName}:`, err);
		setTableData(tableName, { id: tableName, rows: [], app_id: appId });
		throw err;
	}).finally(() => {
		globalTableFetchCache.delete(cacheKey);
	});

	globalTableFetchCache.set(cacheKey, fetchPromise);
	return fetchPromise;
}

/** Prefetch combo tables in parallel — returns count of network fetches started. */
export async function prefetchComboTablesForFields(
	options: ComboPrefetchOptions & { purpose?: ComboLoadPurpose },
	hooks?: {
		onFullLoadStart?: () => void
		onFullLoadEnd?: () => void
	},
): Promise<number> {
	const {
		fields,
		fallbackAppId,
		menuById,
		userContext,
		evalContext,
		purpose = "grid",
		...store
	} = options;

	const requests = collectComboTableFetchRequests(fields as any[], {
		decrypt: store.decrypt,
		fallbackAppId,
		menuById,
		userContext,
		evalContext,
	});
	if (requests.length === 0) return 0;

	const isCached = purpose === "edit" ? isComboTableFullyLoaded : isComboTableCachedForGrid;
	const pending = requests.filter((req) => !isCached(req, store.database, store.decrypt));
	if (pending.length === 0) return 0;

	await Promise.all(
		pending.map((req) => fetchComboTableIntoStore(req, store, { purpose, ...hooks }).catch(() => undefined)),
	);
	return pending.length;
}

/** Full combo load for edit/form — all dropdown options available. */
export async function prefetchComboTablesForEdit(
	options: ComboPrefetchOptions,
	hooks?: {
		onFullLoadStart?: () => void
		onFullLoadEnd?: () => void
	},
): Promise<number> {
	return prefetchComboTablesForFields({ ...options, purpose: "edit" }, hooks);
}

/** Collect combo values on visible rows that still need label lookup. */
export function buildComboHydrationPlan(
	rows: Record<string, unknown>[],
	fields: unknown[],
	options: {
		database: Record<string, unknown>
		menuById?: Map<string, unknown>
		decrypt?: (input: string) => string
		fallbackAppId?: string
		userContext?: UserAppIdInput
		evalContext?: ComboGridEvalContext
		selectEnums?: Record<string, Record<string, { text: string }>>
	},
): ComboHydrationItem[] {
	const {
		database,
		menuById = new Map(),
		decrypt,
		fallbackAppId = "csm",
		userContext,
		evalContext,
		selectEnums = {},
	} = options;

	if (!Array.isArray(rows) || rows.length === 0) return [];

	const comboFields = (fields || []).filter((field: any) => {
		const types = resolveEffectiveFieldTypes(field);
		return Number(field?.f_show ?? 1) === 1 && isComboLikeType(types);
	});
	if (comboFields.length === 0) return [];

	const plan: ComboHydrationItem[] = [];

	comboFields.forEach((field: any) => {
		const tableName = resolveFieldComboLookupTableName(field, menuById as Map<string, any>, database as Record<string, any>, {
			decrypt,
			evalContext,
		});
		if (!tableName) return;

		const lookupFields = resolveComboLookupQueryFields(field, menuById as Map<string, any>, {
			decrypt,
			evalContext,
			database: database as Record<string, any>,
		});
		const valueEnum = selectEnums[field.f_name];
		const missing = new Set<string>();

		rows.forEach((row) => {
			const raw = row[field.f_name];
			if (raw == null || raw === "") return;
			const valueKey = String(raw).trim();
			if (!valueKey) return;
			if (lookupValueEnumLabel(valueEnum, raw)) return;
			const label = resolveGridComboCellLabel(valueKey, field, database as Record<string, any>, menuById as Map<string, any>, valueEnum, {
				decrypt,
				evalContext,
			});
			if (label === valueKey) missing.add(valueKey);
		});

		if (missing.size === 0) return;
		const appId = resolveComboQueryAppId(tableName, fallbackAppId, fallbackAppId, userContext, decrypt);
		plan.push({
			key: `${appId}::${tableName}::${lookupFields.join(",")}`,
			appId,
			tableName,
			lookupFields,
			values: Array.from(missing),
		});
	});

	return plan;
}

/** Fetch missing combo labels for values on visible rows (big-data safe). */
export async function hydrateComboLabelsForRows(
	rows: Record<string, unknown>[],
	fields: unknown[],
	options: Omit<ComboPrefetchOptions, "fields"> & {
		selectEnums?: Record<string, Record<string, { text: string }>>
	},
): Promise<number> {
	const plan = buildComboHydrationPlan(rows, fields, options);
	if (plan.length === 0) return 0;

	const results = await Promise.all(plan.map(async (item) => {
		try {
			const lookupRows = await fetchComboRowsByValues(item.appId, item.tableName, item.lookupFields, item.values);
			if (lookupRows.length === 0) return 0;
			if (options.mergeTableRows) {
				options.mergeTableRows(item.tableName, lookupRows, { app_id: item.appId });
			} else {
				const existing = (options.database[item.tableName] as { rows?: unknown[] } | undefined)?.rows;
				const merged = new Map<string, Record<string, unknown>>();
				(existing || []).forEach((row: any) => {
					const id = String(row?.id ?? "").trim();
					merged.set(id || JSON.stringify(row), row);
				});
				lookupRows.forEach((row) => {
					const id = String(row?.id ?? "").trim();
					merged.set(id || JSON.stringify(row), row);
				});
				options.setTableData(item.tableName, {
					...(options.database[item.tableName] as object || {}),
					id: item.tableName,
					rows: Array.from(merged.values()),
					app_id: item.appId,
				});
			}
			return lookupRows.length;
		} catch {
			return 0;
		}
	}));

	return results.reduce((sum, count) => sum + count, 0);
}

export type ComboPrefetchGateOptions = ComboPrefetchOptions & {
	enabled?: boolean
	signatureSuffix?: string
	/** grid = probe/hydrate for display; edit = full load for dropdowns */
	purpose?: ComboLoadPurpose
};

export type ComboPrefetchGate = {
	/** UI may render — opens immediately; labels hydrate in background for big lookups. */
	ready: boolean
	/** True only while small combo tables are fully loading (dropdown data). */
	blockingBusy: boolean
	/** Any combo prefetch still in flight. */
	busy: boolean
	version: number
	hasComboFields: boolean
};

/**
 * Fast combo gate: probe large tables (1 row), full-load small only, never block bigdata grid.
 */
export function useComboPrefetchGate(options: ComboPrefetchGateOptions): ComboPrefetchGate {
	const {
		fields,
		enabled = true,
		signatureSuffix = "",
		purpose = "grid",
		fallbackAppId,
		menuById,
		userContext,
		evalContext,
		database,
		setTableData,
		mergeTableRows,
		decrypt,
	} = options;

	const signature = useMemo(
		() => buildComboFieldsSignature(fields, signatureSuffix),
		[fields, signatureSuffix],
	);
	const hasComboFields = Boolean(signature);
	const [ready, setReady] = useState(true);
	const [blockingBusy, setBlockingBusy] = useState(false);
	const [busy, setBusy] = useState(false);
	const [version, setVersion] = useState(0);
	const lastSignatureRef = useRef("");
	const blockingLoadsRef = useRef(0);

	const syncBlockingBusy = useCallback(() => {
		setBlockingBusy(blockingLoadsRef.current > 0);
	}, []);

	useEffect(() => {
		if (!enabled || !hasComboFields) {
			setReady(true);
			setBlockingBusy(false);
			setBusy(false);
			return;
		}
		if (signature === lastSignatureRef.current) {
			return;
		}
		lastSignatureRef.current = signature;

		const requests = collectComboTableFetchRequests(fields as any[], {
			decrypt,
			fallbackAppId,
			menuById,
			userContext,
			evalContext,
		});
		const isCached = purpose === "edit" ? isComboTableFullyLoaded : isComboTableCachedForGrid;
		const pending = requests.filter((req) => !isCached(req, database, decrypt));

		if (pending.length === 0) {
			setReady(true);
			setBlockingBusy(false);
			setBusy(false);
			setVersion((value) => value + 1);
			return;
		}

		let cancelled = false;
		setReady(true);
		setBusy(true);

		const onFullLoadStart = () => {
			if (cancelled) return;
			blockingLoadsRef.current += 1;
			syncBlockingBusy();
		};
		const onFullLoadEnd = () => {
			if (cancelled) return;
			blockingLoadsRef.current = Math.max(0, blockingLoadsRef.current - 1);
			syncBlockingBusy();
		};

		void prefetchComboTablesForFields({
			fields,
			fallbackAppId,
			menuById,
			userContext,
			evalContext,
			database,
			setTableData,
			mergeTableRows,
			decrypt,
			purpose,
		}, { onFullLoadStart, onFullLoadEnd }).then((count) => {
			if (cancelled) return;
			gridDevLog(`[combo-prefetch] gate done (${count} fetches)`);
			setVersion((value) => value + 1);
			setReady(true);
		}).finally(() => {
			if (!cancelled) {
				blockingLoadsRef.current = 0;
				setBlockingBusy(false);
				setBusy(false);
			}
		});

		return () => {
			cancelled = true;
			blockingLoadsRef.current = 0;
		};
	}, [
		enabled,
		hasComboFields,
		signature,
		fields,
		fallbackAppId,
		menuById,
		userContext,
		evalContext,
		database,
		setTableData,
		mergeTableRows,
		decrypt,
		purpose,
		syncBlockingBusy,
	]);

	return { ready, blockingBusy, busy, version, hasComboFields };
}
