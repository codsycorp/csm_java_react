import type { Where, Condition } from "./CsmApi";

export type GridSortSpec = {
	field: string
	order: "asc" | "desc"
};

export type GridServerQuery = {
	where?: Where
	sort: GridSortSpec[]
};

function mergeWhereClauses(...parts: Array<Where | undefined>): Where | undefined {
	const clauses = parts.filter(Boolean) as Where[];
	if (clauses.length === 0) return undefined;
	if (clauses.length === 1) return clauses[0];
	return { operator: "AND", conditions: clauses as Condition[] };
}

function parseFreeSearchTokens(input: string): string[] {
	const tokens = String(input || "").match(/"[^"]+"|\S+/g) || [];
	return tokens.map((token) => token.replace(/^"|"$/g, "").trim()).filter(Boolean);
}

function buildTokenWhere(token: string, searchFields: string[]): Where | undefined {
	const fieldExpr = token.match(/^([^:<>=!\s]+)\s*(<=|>=|=|<|>|:)\s*(.+)$/);
	if (fieldExpr) {
		const field = String(fieldExpr[1] || "").trim();
		const op = fieldExpr[2];
		const value = String(fieldExpr[3] || "").trim();
		if (!field || !value) return undefined;

		const typeMap: Record<string, string> = {
			"=": "eq",
			":": "like",
			">": "gt",
			"<": "lt",
			">=": "gte",
			"<=": "lte",
		};
		return { field, type: typeMap[op] || "like", value };
	}

	const term = token.trim();
	if (!term) return undefined;
	const fields = searchFields.filter(Boolean);
	if (fields.length === 0) return undefined;
	if (fields.length === 1) {
		return { field: fields[0], type: "like", value: term };
	}
	return {
		operator: "OR",
		conditions: fields.map((field) => ({ field, type: "like", value: term })),
	};
}

/** Build backend e_where for server-paged grid free-text search. */
export function buildServerSearchWhere(
	rawSearch: string,
	searchFields: string[],
	baseWhere?: Where,
): Where | undefined {
	const tokens = parseFreeSearchTokens(rawSearch);
	if (tokens.length === 0) {
		return baseWhere;
	}

	const tokenClauses = tokens
		.map((token) => buildTokenWhere(token, searchFields))
		.filter(Boolean) as Where[];

	const searchWhere = tokenClauses.length === 0
		? undefined
		: tokenClauses.length === 1
			? tokenClauses[0]
			: { operator: "AND" as const, conditions: tokenClauses as Condition[] };

	return mergeWhereClauses(baseWhere, searchWhere);
}

export function buildServerSortSpecs(
	sorters: Array<{ field: string; order?: "ascend" | "descend" | null }>,
): GridSortSpec[] {
	return sorters
		.filter((item) => item?.field && item.order)
		.map((item) => ({
			field: String(item.field),
			order: item.order === "descend" ? "desc" as const : "asc" as const,
		}));
}

export function buildGridServerQuery(options: {
	searchTerm?: string
	searchFields?: string[]
	baseWhere?: Where
	sorters?: Array<{ field: string; order?: "ascend" | "descend" | null }>
}): GridServerQuery {
	return {
		where: buildServerSearchWhere(
			options.searchTerm || "",
			options.searchFields || [],
			options.baseWhere,
		),
		sort: buildServerSortSpecs(options.sorters || []),
	};
}

export function serializeGridServerQuery(query: GridServerQuery): string {
	try {
		return JSON.stringify({
			where: query.where ?? null,
			sort: query.sort ?? [],
		});
	} catch {
		return "";
	}
}
