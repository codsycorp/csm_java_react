export type CrmSectionKey = "pipeline" | "inventory" | "activities" | "analytics";

export interface CrmStageConfig {
	id: string;
	label: string;
	color?: string;
	staleAfterHours?: number;
	probability?: number;
}

export interface CrmDataSourceConfig {
	tableName?: string;
	pkField?: string;
	appId?: string;
	statusField?: string;
	titleField?: string;
	phoneField?: string;
	projectField?: string;
	valueField?: string;
	lastInteractionField?: string;
	updatedAtField?: string;
	createdAtField?: string;
	sourceField?: string;
	assignedToField?: string;
	teamField?: string;
	notesField?: string;
	productIdsField?: string;
	productNameField?: string;
	productCodeField?: string;
	leadRefField?: string;
	contactTypeField?: string;
	resultField?: string;
	titleKeyField?: string;
	dueDateField?: string;
	scheduledAtField?: string;
	completedAtField?: string;
	appointmentSuccessValue?: string;
	priceField?: string;
	areaField?: string;
	directionField?: string;
	bedroomField?: string;
	useCrmApi?: boolean;
}

export interface CrmPhoneMaskConfig {
	enabled?: boolean;
	visibleDigits?: number;
	unmaskedStages?: string[];
	placeholder?: string;
}

export interface CrmSecurityConfig {
	adminRoles?: string[];
	leaderRoles?: string[];
	visibilityMode?: "owner-team-admin" | "owner-admin" | "all";
	phoneMask?: CrmPhoneMaskConfig;
	exportAlertThreshold?: number;
	exportLogTable?: string;
}

export interface CrmInventoryFilterConfig {
	field: string;
	label: string;
	type?: "select" | "range" | "text";
	minField?: string;
	maxField?: string;
	options?: Array<{ label: string; value: string | number }>;
}

export interface CrmConfig {
	title?: string;
	description?: string;
	defaultSection?: CrmSectionKey;
	sections?: Partial<Record<CrmSectionKey, boolean>>;
	dataSources?: {
		leads?: CrmDataSourceConfig;
		inventory?: CrmDataSourceConfig;
		activities?: CrmDataSourceConfig;
		tasks?: CrmDataSourceConfig;
		exports?: CrmDataSourceConfig;
	};
	pipeline?: {
		stages?: CrmStageConfig[];
		defaultStaleHours?: number;
		warningStageIds?: string[];
	};
	inventory?: {
		statuses?: Array<{ id: string; label: string; color?: string }>;
		filters?: CrmInventoryFilterConfig[];
		leadLinkField?: string;
	};
	activities?: {
		activityTypes?: string[];
		taskStatuses?: string[];
	};
	analytics?: {
		closedStageIds?: string[];
		bookingStageIds?: string[];
	};
	security?: CrmSecurityConfig;
}

export const DEFAULT_CRM_STAGES: CrmStageConfig[] = [
	{ id: "lead", label: "Mới", color: "#1677ff", staleAfterHours: 24, probability: 10 },
	{ id: "contacted", label: "Đã liên hệ", color: "#13c2c2", probability: 25 },
	{ id: "site_visit", label: "Tham quan dự án", color: "#722ed1", probability: 45 },
	{ id: "booking", label: "Đặt cọc", color: "#fa8c16", probability: 70 },
	{ id: "contract", label: "Hợp đồng", color: "#52c41a", probability: 95 },
	{ id: "after_sale", label: "Chăm sóc sau bán", color: "#2f54eb", probability: 100 },
];

export const CRM_CONFIG_TEMPLATE = JSON.stringify(
	{
		title: "CRM Kinh doanh",
		description: "Workspace quản lý phễu bán hàng, tồn kho, hoạt động và phân tích hiệu suất.",
		defaultSection: "pipeline",
		sections: {
			pipeline: true,
			inventory: true,
			activities: true,
			analytics: true,
		},
		dataSources: {
			leads: {
				tableName: "crm_customers",
				pkField: "id",
				statusField: "status",
				titleField: "name",
				phoneField: "phone",
				projectField: "project_name",
				valueField: "expected_value",
				lastInteractionField: "last_contact_at",
				updatedAtField: "updated_at",
				createdAtField: "created_at",
				sourceField: "source",
				assignedToField: "assigned_to",
				teamField: "team_id",
				productIdsField: "interested_product_ids",
				useCrmApi: false,
			},
			inventory: {
				tableName: "crm_inventory",
				pkField: "id",
				statusField: "status",
				titleField: "product_name",
				productCodeField: "product_code",
				projectField: "project_name",
				priceField: "price",
				areaField: "area_m2",
				directionField: "direction",
				bedroomField: "bedrooms",
				leadRefField: "lead_id",
			},
			activities: {
				tableName: "crm_activities",
				pkField: "id",
				leadRefField: "lead_id",
				contactTypeField: "activity_type",
				resultField: "result",
				notesField: "notes",
				scheduledAtField: "scheduled_at",
				completedAtField: "completed_at",
				assignedToField: "owner_id",
				appointmentSuccessValue: "success",
			},
			tasks: {
				tableName: "crm_tasks",
				pkField: "id",
				titleKeyField: "title",
				leadRefField: "lead_id",
				statusField: "status",
				dueDateField: "due_at",
				assignedToField: "owner_id",
			},
			exports: {
				tableName: "crm_export_logs",
				pkField: "id",
				assignedToField: "owner_id",
				createdAtField: "created_at",
			},
		},
		pipeline: {
			stages: DEFAULT_CRM_STAGES,
			defaultStaleHours: 24,
			warningStageIds: ["lead"],
		},
		inventory: {
			statuses: [
				{ id: "available", label: "Trống", color: "green" },
				{ id: "booking", label: "Đang giữ chỗ", color: "orange" },
				{ id: "sold", label: "Đã bán", color: "red" },
			],
			filters: [
				{ field: "direction", label: "Hướng", type: "select" },
				{ field: "bedrooms", label: "Số phòng ngủ", type: "select" },
				{ field: "area_m2", label: "Diện tích", type: "range", minField: "area_min", maxField: "area_max" },
				{ field: "price", label: "Khoảng giá", type: "range", minField: "price_min", maxField: "price_max" },
			],
			leadLinkField: "lead_id",
		},
		activities: {
			activityTypes: ["call", "meeting", "site_visit", "email"],
			taskStatuses: ["todo", "in_progress", "done"],
		},
		analytics: {
			closedStageIds: ["contract", "after_sale"],
			bookingStageIds: ["booking"],
		},
		security: {
			adminRoles: ["admin", "dev"],
			leaderRoles: ["leader", "manager", "team_leader"],
			visibilityMode: "owner-team-admin",
			phoneMask: {
				enabled: true,
				visibleDigits: 3,
				unmaskedStages: ["contract", "after_sale"],
				placeholder: "***",
			},
			exportAlertThreshold: 100,
			exportLogTable: "crm_export_logs",
		},
	},
	null,
	2,
);

function isNonEmptyValue(value: unknown) {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
	return true;
}

function normalizeFieldName(rawName: unknown, index: number): string {
	const base = String(rawName || "").trim();
	if (!base) {
		return `field_${index + 1}`;
	}
	return base;
}

function normalizeLegacyTableFields(rawTable: unknown): unknown {
	if (!Array.isArray(rawTable)) {
		return rawTable;
	}

	const seenNames = new Map<string, number>();

	return rawTable.map((field, index) => {
		const source = (field && typeof field === "object") ? (field as Record<string, any>) : {};
		const baseName = normalizeFieldName(source.f_name, index);
		const lower = baseName.toLowerCase();
		const duplicateCount = seenNames.get(lower) ?? 0;
		seenNames.set(lower, duplicateCount + 1);
		const normalizedName = duplicateCount === 0 ? baseName : `${baseName}_${duplicateCount + 1}`;

		const headerRaw = String(source.f_header || "").trim();
		const header = headerRaw || normalizedName;
		const typeRaw = String(source.f_types || source.f_type || "").trim().toLowerCase();
		const showRaw = source.f_show;
		const show = (showRaw === false || showRaw === 0 || showRaw === "0") ? 0 : 1;

		return {
			...source,
			f_name: normalizedName,
			f_header: header,
			f_show: show,
			f_types: typeRaw || "ed",
			f_stt: source.f_stt ?? (index + 1),
		};
	});
}

export function parseCrmConfig(raw: unknown): CrmConfig {
	if (!raw) return {};
	if (typeof raw === "object") return raw as CrmConfig;
	if (typeof raw !== "string") return {};
	try {
		return JSON.parse(raw) as CrmConfig;
	}
	catch {
		return {};
	}
}

export function normalizeMenuRuntimeConfig<T extends Record<string, any>>(menu: T): T {
	if (!menu) return menu;
	const parsed = (() => {
		if (typeof menu.config !== "string" || !menu.config.trim()) return {} as Record<string, any>;
		try {
			return JSON.parse(menu.config);
		}
		catch {
			return {} as Record<string, any>;
		}
	})();

	const merged: Record<string, any> = { ...parsed, ...menu };
	const keys = [
		"table_name",
		"table",
		"trigger",
		"report_name",
		"type_form",
		"row_type_edit",
		"nodes",
		"children",
		"struct",
		"crm_config",
		"auto_code_name",
		"dynamic_link_url",
		"field_root",
		"g_readonly",
		"p_width",
		"p_height",
		"orientation",
	];

	for (const key of keys) {
		if (!isNonEmptyValue(merged[key]) && isNonEmptyValue(parsed[key])) {
			merged[key] = parsed[key];
		}
	}

	const parseJsonIfNeeded = (value: unknown): unknown => {
		if (typeof value !== "string") return value;
		const trimmed = value.trim();
		if (!trimmed) return value;
		const looksLikeJson = (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
		if (!looksLikeJson) return value;
		try {
			return JSON.parse(trimmed);
		}
		catch {
			return value;
		}
	};

	// Backend menu rows can store runtime config fields as JSON strings.
	// Parse them here so downstream grid/report code always receives structured data.
	const jsonShapeKeys = ["table", "trigger", "nodes", "children", "struct", "crm_config", "kanban_config", "v_query", "db_filter"];
	for (const key of jsonShapeKeys) {
		merged[key] = parseJsonIfNeeded(merged[key]);
	}

	merged.table = normalizeLegacyTableFields(merged.table);

	if (Array.isArray(merged.nodes)) {
		merged.nodes = merged.nodes.map((node: any) => {
			if (!node || typeof node !== "object") return node;
			return {
				...node,
				table: normalizeLegacyTableFields(node.table),
			};
		});
	}

	return merged as T;
}

export function hasConfiguredMenuFields(menu: unknown): boolean {
	if (!menu || typeof menu !== "object") return false;
	const rawTable = normalizeLegacyTableFields((menu as Record<string, any>).table);
	if (!Array.isArray(rawTable)) return false;
	return rawTable.some((field: any) => String(field?.f_name || "").trim().length > 0);
}

export function isGridRuntimeMenu(menu: unknown): boolean {
	if (!menu || typeof menu !== "object") return false;
	const normalized = normalizeMenuRuntimeConfig(menu as Record<string, any>);
	if (!hasConfiguredMenuFields(normalized)) return false;
	const hasTableName = String(normalized.table_name || "").trim().length > 0;
	const hasLoadDbTrigger = String(normalized?.trigger?.load_db || "").trim().length > 0;
	return hasTableName || hasLoadDbTrigger;
}

export function isReportRuntimeMenu(menu: unknown): boolean {
	if (!menu || typeof menu !== "object") return false;
	const normalized = normalizeMenuRuntimeConfig(menu as Record<string, any>);
	return Boolean(
		String(normalized.report_name || "").trim()
		&& (
			Number(normalized.type_form || 0) === 5
			|| String(normalized?.trigger?.report_db || "").trim()
		),
	);
}

export function collectCrmTableNames(crmConfig: unknown): string[] {
	const parsed = parseCrmConfig(crmConfig);
	const tables = new Set<string>();
	const sources = parsed.dataSources || {};
	Object.values(sources).forEach((source) => {
		if (source?.tableName) tables.add(source.tableName);
	});
	if (parsed.security?.exportLogTable) tables.add(parsed.security.exportLogTable);
	return Array.from(tables);
}
