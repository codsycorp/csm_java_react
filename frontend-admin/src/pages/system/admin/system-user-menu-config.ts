import type { TableField, TriggerConfig } from "#src/components/csm-grid/CsmDynamicGrid";

export interface SystemUserMenuModeConfig {
	table_name?: string;
	table?: TableField[];
	trigger?: TriggerConfig | Record<string, any>;
	type_form?: number | string;
	row_type_edit?: number | string;
	g_readonly?: boolean;
	label?: string;
	label_en?: string;
	label_zh?: string;
	[key: string]: any;
}

export interface SystemUserModesConfig {
	main?: SystemUserMenuModeConfig;
	sub?: SystemUserMenuModeConfig;
}

export type SystemUserActorType = "dev" | "admin" | "sub-user";

export interface SystemUserPermissionContext {
	permissions?: unknown;
	menusPermissions?: unknown;
	dataScope?: string;
	appId?: string;
	isDev?: boolean;
}

function isSystemUserTableName(tableName: unknown): boolean {
	const normalizedList = String(tableName || "")
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
	return normalizedList.some((item) => item === "csm_accounts" || item === "csm_group_members");
}

export const PERMISSION_TOKEN_OPTIONS = [
	{ value: "admin", label: "system.userPermission.option.admin" },
	{ value: "dev", label: "system.userPermission.option.dev" },
	{ value: "user", label: "system.userPermission.option.user" },
	{ value: "view", label: "system.userPermission.option.view" },
	{ value: "create", label: "system.userPermission.option.create" },
	{ value: "edit", label: "system.userPermission.option.edit" },
	{ value: "delete", label: "system.userPermission.option.delete" },
	{ value: "export", label: "system.userPermission.option.export" },
	{ value: "scope:owner", label: "system.userPermission.option.scopeOwner" },
	{ value: "scope:department", label: "system.userPermission.option.scopeDepartment" },
	{ value: "scope:branch", label: "system.userPermission.option.scopeBranch" },
	{ value: "scope:all", label: "system.userPermission.option.scopeAll" },
];

const PERMISSION_GROUP_OPTIONS = [
	{ value: "system_admin", label: "system.userPermission.group.systemAdmin" },
	{ value: "manager", label: "system.userPermission.group.manager" },
	{ value: "staff", label: "system.userPermission.group.staff" },
	{ value: "viewer", label: "system.userPermission.group.viewer" },
];

export const MENU_PERMISSION_OPTIONS = [
	{ value: "dashboard", label: "system.userPermission.menu.dashboard" },
	{ value: "/dashboard", label: "system.userPermission.menu.dashboardPath" },
	{ value: "homepage", label: "system.userPermission.menu.home" },
	{ value: "/system/user", label: "system.userPermission.menu.systemUser" },
	{ value: "/system/dept", label: "system.userPermission.menu.systemDept" },
	{ value: "/system/departments", label: "system.userPermission.menu.systemDepartments" },
	{ value: "/system/branches", label: "system.userPermission.menu.systemBranches" },
	{ value: "/system/menu", label: "system.userPermission.menu.systemMenu" },
	{ value: "/system/developer", label: "system.userPermission.menu.systemDeveloper" },
	{ value: "/system/broadcast", label: "system.userPermission.menu.systemBroadcast" },
	{ value: "/crm", label: "system.userPermission.menu.crm" },
];

const SYSTEM_USER_PERMISSION_FIELD_NAMES = new Set([
	"roles",
	"permissionPreset",
	"permissionGroups",
	"permissions",
	"permissionsAdd",
	"permissionsDeny",
	"menusPermissions",
	"menusPermissionsAdd",
	"menusPermissionsDeny",
	"permissionBitfield",
	"permissionSchemaVersion",
	"dataScope",
	"dept_id",
	"branch_id",
]);

const SYSTEM_USER_INTERNAL_FIELD_NAMES = new Set([
	"parent_account_id",
	"app_token",
	"permissionBitfield",
	"permissionSchemaVersion",
]);

export const ACTION_PRESET_OPTIONS_JSON = JSON.stringify({
	options: [
		{ value: "", label: "system.userPermission.preset.custom" },
		{ value: "viewer", label: "system.userPermission.preset.viewer" },
		{ value: "editor", label: "system.userPermission.preset.editor" },
		{ value: "full_crud", label: "system.userPermission.preset.fullCrud" },
		{ value: "full_crud_export", label: "system.userPermission.preset.fullCrudExport" },
		{ value: "admin_full", label: "system.userPermission.preset.adminFull" },
	],
});

const ROLE_SELECT_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_roles",
			fields: ["id", "role_name"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
});

export const DEPT_SELECT_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_depts",
			fields: ["id", "dept_name", "branch_id"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
});

export const DEPT_SELECT_QUERY_BY_BRANCH_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_depts",
			fields: ["id", "dept_name", "branch_id"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
	cascadeFrom: "branch_id",
	cascadeField: "branch_id",
});

export const BRANCH_SELECT_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_branches",
			fields: ["id", "branch_name"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
});

// Cascading branch query - filtered by dept_id from parent field
export const BRANCH_SELECT_QUERY_BY_DEPT_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_branches",
			fields: ["id", "branch_name", "dept_id"],
			obj_where: { field: "dept_id", type: "eq", value: "{dept_id}" },
		},
	],
	// Marks this query as cascading from dept_id field
	cascadeFrom: "dept_id",
});

export const ROLE_LEVEL_OPTIONS_JSON = JSON.stringify({
	options: [
		{ value: "manager", label: "system.userPermission.level.manager" },
		{ value: "team_lead", label: "system.userPermission.level.teamLead" },
		{ value: "staff", label: "system.userPermission.level.staff" },
	],
});

// Query sys_apps table (always from csm app) to populate app_id dropdown
export const APP_ID_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "sys_apps",
			app_id: "csm",
			fields: ["app_id", "app_name"],
			value_field: "app_id",
			label_field: "app_name",
		},
	],
});

export const PERMISSION_GROUP_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_roles",
			fields: ["id", "role_name"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
});

export const DATA_SCOPE_OPTIONS_JSON = JSON.stringify({
	options: [
		{ value: "NONE", label: "system.userPermission.scope.none" },
		{ value: "OWNER", label: "system.userPermission.scope.owner" },
		{ value: "DEPARTMENT", label: "system.userPermission.scope.department" },
		{ value: "BRANCH", label: "system.userPermission.scope.branch" },
		{ value: "ALL", label: "system.userPermission.scope.all" },
	],
});

const PERMISSION_PRESET_DEFINITIONS: Record<string, { permissions: string[]; menus: string[] }> = {
	viewer: { permissions: ["view"], menus: ["homepage"] },
	editor: { permissions: ["view", "create", "edit"], menus: ["/dashboard", "homepage", "/crm"] },
	full_crud: { permissions: ["view", "create", "edit", "delete"], menus: ["/dashboard", "homepage", "/crm"] },
	full_crud_export: { permissions: ["view", "create", "edit", "delete", "export"], menus: ["/dashboard", "homepage", "/crm"] },
	admin_full: {
		permissions: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		menus: ["/system/user", "/system/dept", "/system/departments", "/system/branches", "/system/menu", "/dashboard", "homepage", "/crm"],
	},
};

function normalizeStringList(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)));
	}
	if (raw && typeof raw === "object") {
		return Array.from(new Set(Object.values(raw as Record<string, unknown>).map((item) => String(item || "").trim()).filter(Boolean)));
	}
	if (typeof raw === "string") {
		const text = raw.trim();
		if (!text) return [];
		if (text.startsWith("[") || text.startsWith("{")) {
			try {
				return normalizeStringList(JSON.parse(text));
			} catch {
				return [];
			}
		}
		return Array.from(new Set(text.split(/[;,\n]/g).map((item) => item.trim()).filter(Boolean)));
	}
	return [];
}

function normalizeScope(scope: unknown): "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL" {
	const value = String(scope || "").trim().toUpperCase();
	if (value === "OWNER" || value === "DEPARTMENT" || value === "BRANCH" || value === "ALL") return value;
	return "NONE";
}

function scopeRank(scope: "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL"): number {
	switch (scope) {
		case "OWNER": return 1;
		case "DEPARTMENT": return 2;
		case "BRANCH": return 3;
		case "ALL": return 4;
		default: return 0;
	}
}

function tokenMatchesMenu(target: string, allowedSet: Set<string>): boolean {
	if (allowedSet.has(target)) return true;
	if (target.startsWith("/") && allowedSet.has(target.slice(1))) return true;
	if (!target.startsWith("/") && allowedSet.has("/" + target)) return true;
	return false;
}

function hasLegacyFullAppScope(menus: string[], appId: string): boolean {
	const normalizedAppId = String(appId || "").trim().toLowerCase();
	if (!normalizedAppId) return false;
	return menus.some((token) => {
		const value = String(token || "").trim().toLowerCase();
		return value === normalizedAppId || value === "app:" + normalizedAppId || value === "/" + normalizedAppId;
	});
}

function buildTagField(
	f_name: string,
	f_header: string,
	options: Array<{ value: string; label: string }>,
): TableField {
	return {
		f_name,
		f_header,
		f_show: 1,
		f_types: "multi_tag",
		f_align: "left",
		f_options: options,
	} as any;
}

const SYSTEM_USER_FIELD_WIDTHS: Record<string, number> = {
	username: 180,
	email: 220,
	phoneNumber: 160,
	full_name: 200,
	app_id: 220,
	permissionGroups: 220,
	permissionsAdd: 220,
	permissionsDeny: 220,
	menusPermissionsAdd: 260,
	menusPermissionsDeny: 260,
	dataScope: 180,
	actived: 120,
	pass: 160,
	group_id: 220,
	login_identifier: 220,
};

export const SYSTEM_ACCOUNT_DEFAULT_FIELDS: TableField[] = [
	{ f_name: "id", f_header: "ID", f_show: 1, f_types: "number", f_align: "right" },
	{ f_name: "parent_account_id", f_header: "common.parentAccountId", f_show: 0, f_types: "string_ro", f_align: "left" },
	{ f_name: "username", f_header: "common.username", f_show: 1, f_types: "string", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.username },
	{ f_name: "email", f_header: "common.email", f_show: 1, f_types: "string", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.email },
	{ f_name: "phoneNumber", f_header: "common.phoneNumber", f_show: 1, f_types: "string", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.phoneNumber },
	{ f_name: "full_name", f_header: "common.fullName", f_show: 1, f_types: "string", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.full_name },
	{ f_name: "user_address", f_header: "common.address", f_show: 0, f_types: "json", f_align: "left" },
	{ f_name: "app_id", f_header: "common.menu.apps", f_show: 0, f_types: "co_ro", f_align: "left", f_cbo_query: APP_ID_QUERY_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.app_id } as any,
	{ f_name: "dev", f_header: "system.userPermission.option.dev", f_show: 1, f_types: "checkbox", f_align: "left" },
	{ f_name: "app_token", f_header: "common.appToken", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "pass", f_header: "common.password", f_show: 1, f_types: "password", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.pass },
	{ f_name: "roles", f_header: "system.userPermission.fields.roles", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: ROLE_SELECT_QUERY_JSON },
	{ f_name: "permissionPreset", f_header: "system.userPermission.fields.permissionPreset", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: ACTION_PRESET_OPTIONS_JSON },
	{ f_name: "permissionGroups", f_header: "system.userPermission.fields.permissionGroups", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: PERMISSION_GROUP_QUERY_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.permissionGroups },
	{ ...buildTagField("permissions", "system.userPermission.fields.permissions", PERMISSION_TOKEN_OPTIONS), f_show: 0 } as any,
	{ ...buildTagField("permissionsAdd", "system.userPermission.fields.permissionsAdd", PERMISSION_TOKEN_OPTIONS), f_width: SYSTEM_USER_FIELD_WIDTHS.permissionsAdd } as any,
	{ ...buildTagField("permissionsDeny", "system.userPermission.fields.permissionsDeny", PERMISSION_TOKEN_OPTIONS), f_width: SYSTEM_USER_FIELD_WIDTHS.permissionsDeny } as any,
	{
		f_name: "menusPermissions",
		f_header: "system.userPermission.fields.menusPermissions",
		f_show: 0,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
	} as any,
	{
		f_name: "menusPermissionsAdd",
		f_header: "system.userPermission.fields.menusPermissionsAdd",
		f_show: 1,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
		f_width: SYSTEM_USER_FIELD_WIDTHS.menusPermissionsAdd,
	} as any,
	{
		f_name: "menusPermissionsDeny",
		f_header: "system.userPermission.fields.menusPermissionsDeny",
		f_show: 1,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
		f_width: SYSTEM_USER_FIELD_WIDTHS.menusPermissionsDeny,
	} as any,
	{ f_name: "permissionBitfield", f_header: "system.userPermission.fields.permissionBitfield", f_show: 0, f_types: "string_ro", f_align: "left" },
	{ f_name: "permissionSchemaVersion", f_header: "system.userPermission.fields.permissionSchemaVersion", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "dataScope", f_header: "system.userPermission.fields.dataScope", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: DATA_SCOPE_OPTIONS_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.dataScope },
	{ f_name: "branch_id", f_header: "system.userPermission.fields.branchId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
	{ f_name: "dept_id", f_header: "system.userPermission.fields.deptId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
	{ f_name: "actived", f_header: "common.active", f_show: 1, f_types: "checkbox", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.actived },
];

export const SUB_USER_DEFAULT_FIELDS: TableField[] = [
	{ f_name: "id", f_header: "ID", f_show: 1, f_types: "number", f_align: "right" },
	{ f_name: "parent_account_id", f_header: "common.parentAccountId", f_show: 1, f_types: "string_ro", f_align: "left" },
	{ f_name: "login_identifier", f_header: "common.loginIdentifier", f_show: 1, f_types: "string", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.login_identifier },
	{ f_name: "user_address", f_header: "common.address", f_show: 0, f_types: "json", f_align: "left" },
	{ f_name: "app_id", f_header: "common.menu.apps", f_show: 0, f_types: "co_ro", f_align: "left", f_cbo_query: APP_ID_QUERY_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.app_id } as any,
	{ f_name: "group_id", f_header: "common.groupId", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: PERMISSION_GROUP_QUERY_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.group_id },
	{ f_name: "app_token", f_header: "common.appToken", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "pass", f_header: "common.password", f_show: 1, f_types: "password", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.pass },
	{ f_name: "permissionPreset", f_header: "system.userPermission.fields.permissionPreset", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: ACTION_PRESET_OPTIONS_JSON },
	{ f_name: "permissionGroups", f_header: "system.userPermission.fields.permissionGroups", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: PERMISSION_GROUP_QUERY_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.permissionGroups },
	{ ...buildTagField("permissions", "system.userPermission.fields.permissions", PERMISSION_TOKEN_OPTIONS), f_show: 0 } as any,
	{ ...buildTagField("permissionsAdd", "system.userPermission.fields.permissionsAdd", PERMISSION_TOKEN_OPTIONS), f_width: SYSTEM_USER_FIELD_WIDTHS.permissionsAdd } as any,
	{ ...buildTagField("permissionsDeny", "system.userPermission.fields.permissionsDeny", PERMISSION_TOKEN_OPTIONS), f_width: SYSTEM_USER_FIELD_WIDTHS.permissionsDeny } as any,
	{
		f_name: "menusPermissions",
		f_header: "system.userPermission.fields.menusPermissions",
		f_show: 0,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
	} as any,
	{
		f_name: "menusPermissionsAdd",
		f_header: "system.userPermission.fields.menusPermissionsAdd",
		f_show: 1,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
		f_width: SYSTEM_USER_FIELD_WIDTHS.menusPermissionsAdd,
	} as any,
	{
		f_name: "menusPermissionsDeny",
		f_header: "system.userPermission.fields.menusPermissionsDeny",
		f_show: 1,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
		f_width: SYSTEM_USER_FIELD_WIDTHS.menusPermissionsDeny,
	} as any,
	{ f_name: "permissionBitfield", f_header: "system.userPermission.fields.permissionBitfield", f_show: 1, f_types: "string_ro", f_align: "left" },
	{ f_name: "permissionSchemaVersion", f_header: "system.userPermission.fields.permissionSchemaVersion", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "dataScope", f_header: "system.userPermission.fields.dataScope", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: DATA_SCOPE_OPTIONS_JSON, f_width: SYSTEM_USER_FIELD_WIDTHS.dataScope },
	{ f_name: "branch_id", f_header: "system.userPermission.fields.branchId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
	{ f_name: "dept_id", f_header: "system.userPermission.fields.deptId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
	{ f_name: "actived", f_header: "common.active", f_show: 1, f_types: "checkbox", f_align: "left", f_width: SYSTEM_USER_FIELD_WIDTHS.actived },
];

export const SYSTEM_ACCOUNT_BEFORE_SAVE = `
function beforeSave(row, seft) {
	function isDevActor() {
		return Boolean(seft?.user?.dev);
	}

	function getCurrentAppId() {
		return String(seft?.user?.app_id || seft?.appId || "").trim();
	}

	function getDefaultFullMenus() {
		return ["/dashboard", "homepage", "/system/user", "/system/dept", "/system/departments", "/system/branches", "/system/menu", "/crm"];
	}

	function rankScope(scope) {
		const normalized = String(scope || "").trim().toUpperCase();
		const map = { NONE: 0, OWNER: 1, DEPARTMENT: 2, BRANCH: 3, ALL: 4 };
		return map[normalized] ?? 0;
	}

	function minScope(left, right) {
		const values = ["NONE", "OWNER", "DEPARTMENT", "BRANCH", "ALL"];
		return values[Math.min(rankScope(left), rankScope(right))] || "NONE";
	}

	function intersectPreserveOrder(source, allowed) {
		const allowedSet = new Set(uniqueList(allowed).map((item) => String(item || "").trim().toLowerCase()));
		if (allowedSet.size === 0) return [];
		return uniqueList(source).filter((item) => allowedSet.has(String(item || "").trim().toLowerCase()));
	}

	function hasLegacyAppScope(menusList, appId) {
		if (!appId) return false;
		const appKey = String(appId).trim().toLowerCase();
		return uniqueList(menusList).some((token) => {
			const t = String(token || "").trim().toLowerCase();
			return t === appKey || t === "app:" + appKey || t === "/" + appKey;
		});
	}

	function getLang() {
		const fromI18n = String(seft?.i18n?.language || seft?.language || "").toLowerCase();
		const fromNavigator = String((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase();
		const value = fromI18n || fromNavigator;
		if (value.indexOf("zh") === 0) return "zh";
		if (value.indexOf("en") === 0) return "en";
		return "vi";
	}

	function tr(messages) {
		const lang = getLang();
		return messages[lang] || messages.vi || messages.en || "";
	}

	function applyDataScopeToPermissions(row) {
		const scopeMap = {
			OWNER: "scope:owner",
			DEPARTMENT: "scope:department",
			BRANCH: "scope:branch",
			ALL: "scope:all",
		};
		const selectedScope = String(row.dataScope || "").trim().toUpperCase();
		const scopeToken = scopeMap[selectedScope] || "";
		const noScopeTokens = (row.permissions || []).filter((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			return normalized !== "scope:owner"
				&& normalized !== "scope:department"
				&& normalized !== "scope:branch"
				&& normalized !== "scope:all";
		});
		if (scopeToken) noScopeTokens.push(scopeToken);
		row.permissions = noScopeTokens;
	}

	function uniqueList(items) {
		return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
	}

	function listMinus(source, denied) {
		const denySet = new Set(uniqueList(denied).map((item) => item.toLowerCase()));
		return uniqueList(source).filter((item) => !denySet.has(item.toLowerCase()));
	}

	function buildGroupPermissions(groups) {
		const map = {
			admin: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
			system_admin: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
			dept_manager: ["view", "create", "edit", "export", "scope:department"],
			manager: ["view", "create", "edit", "export", "scope:department"],
			staff: ["view", "create", "edit", "scope:owner"],
			user: ["view", "scope:owner"],
			common: ["view", "scope:owner"],
			viewer: ["view", "scope:owner"],
		};
		const normalizedGroups = uniqueList(groups).map((item) => item.toLowerCase());
		const collected = [];
		normalizedGroups.forEach((groupName) => {
			const values = map[groupName];
			if (Array.isArray(values)) collected.push(...values);
		});
		return uniqueList(collected);
	}

	function buildGroupMenus(groups) {
		const map = {
			admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
			system_admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
			dept_manager: ["/system/user", "/dashboard", "homepage", "/crm"],
			manager: ["/system/user", "/dashboard", "homepage", "/crm"],
			staff: ["/dashboard", "homepage", "/crm"],
			user: ["homepage"],
			common: ["homepage"],
			viewer: ["/dashboard", "homepage"],
		};
		const normalizedGroups = uniqueList(groups).map((item) => item.toLowerCase());
		const collected = [];
		normalizedGroups.forEach((groupName) => {
			const values = map[groupName];
			if (Array.isArray(values)) collected.push(...values);
		});
		return uniqueList(collected);
	}

	function buildPresetPermissions(preset) {
		const normalized = String(preset || "").trim().toLowerCase();
		const map = {
			viewer: ["view"],
			editor: ["view", "create", "edit"],
			full_crud: ["view", "create", "edit", "delete"],
			full_crud_export: ["view", "create", "edit", "delete", "export"],
			admin_full: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		};
		return uniqueList(map[normalized] || []);
	}

	function buildPresetMenus(preset) {
		const normalized = String(preset || "").trim().toLowerCase();
		const map = {
			viewer: ["homepage"],
			editor: ["/dashboard", "homepage", "/crm"],
			full_crud: ["/dashboard", "homepage", "/crm"],
			full_crud_export: ["/dashboard", "homepage", "/crm"],
			admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
		};
		return uniqueList(map[normalized] || []);
	}

	function toBitfield(row) {
		const actionBitMap = {
			view: 0,
			create: 1,
			edit: 2,
			delete: 3,
			export: 4,
		};
		const menuBitMap = {
			dashboard: 0,
			"/dashboard": 0,
			homepage: 0,
			"homepage": 0,
			user: 1,
			"/system/user": 1,
			menu: 3,
			"/system/menu": 3,
			dept: 4,
			"/system/dept": 4,
			developer: 5,
			"/system/developer": 5,
			broadcast: 6,
			"/system/broadcast": 6,
			report: 7,
			"/system/report": 7,
			crm: 8,
			"/crm": 8,
		};
		const scopeBitMap = {
			OWNER: 0,
			DEPARTMENT: 1,
			BRANCH: 2,
			ALL: 3,
		};
		const TOKEN_SIGNATURE = 0x43534d33n;
		let menuMask = 0n;
		let actionMask = 0n;
		let scopeMask = 0n;
		uniqueList(row.permissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = actionBitMap[normalized];
			if (typeof bit === "number") actionMask = actionMask | (1n << BigInt(bit));
		});
		uniqueList(row.menusPermissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = menuBitMap[normalized];
			if (typeof bit === "number" && bit <= 15) menuMask = menuMask | (1n << BigInt(bit));
		});
		const dataScope = String(row.dataScope || "").trim().toUpperCase();
		const scopeBit = scopeBitMap[dataScope];
		if (typeof scopeBit === "number") scopeMask = scopeMask | (1n << BigInt(scopeBit));
		return (menuMask << 48n) | (actionMask << 40n) | (scopeMask << 32n) | TOKEN_SIGNATURE;
	}

	function normalizeList(value) {
		if (Array.isArray(value)) {
			return value.map((item) => {
				if (item && typeof item === "object") {
					return String(item.value ?? item.id ?? item.key ?? item.code ?? "").trim();
				}
				return String(item || "").trim();
			}).filter(Boolean);
		}
		if (typeof value === "string") {
			const raw = value.trim();
			if (!raw) return [];
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return parsed.map((item) => String(item || "").trim()).filter(Boolean);
				}
			} catch (error) {}
			return raw.split(/[,;\\n]/g).map((item) => item.trim()).filter(Boolean);
		}
		return [];
	}
	function findFieldConfig(fieldName) {
		const fields = Array.isArray(seft?.m_configs?.table) ? seft.m_configs.table : [];
		return fields.find((f) => String(f?.f_name || "").trim() === String(fieldName || "").trim()) || null;
	}
	function getRowsFromTable(tableName) {
		const data = seft?.database?.[tableName];
		if (Array.isArray(data)) return data;
		if (Array.isArray(data?.rows)) return data.rows;
		return [];
	}
	function resolveComboValueByQuery(fieldName, input) {
		const rawValue = String(input || "").trim();
		if (!rawValue) return "";

		const field = findFieldConfig(fieldName);
		const rawQuery = String(field?.f_cbo_query || "").trim();
		if (!rawQuery) return rawValue;

		let parsed = null;
		try {
			parsed = JSON.parse(rawQuery);
		} catch (e) {
			return rawValue;
		}

		const query = Array.isArray(parsed?.query) ? parsed.query : [];
		for (let i = 0; i < query.length; i++) {
			const q = query[i] || {};
			const tableName = String(q?.obj_name || "").trim();
			const fields = Array.isArray(q?.fields) ? q.fields : [];
			const valueField = String(q?.value_field || fields[0] || "id").trim() || "id";
			const labelField = String(q?.label_field || fields[1] || valueField).trim() || valueField;
			if (!tableName) continue;

			const rows = getRowsFromTable(tableName);
			if (!Array.isArray(rows) || rows.length === 0) continue;

			const byValue = rows.find((r) => String(r?.[valueField] || "").trim() === rawValue);
			if (byValue) return String(byValue?.[valueField] || "").trim();

			if (labelField) {
				const byLabel = rows.find((r) => String(r?.[labelField] || "").trim() === rawValue);
				if (byLabel) return String(byLabel?.[valueField] || "").trim();
			}
		}

		return "";
	}
	function resolveValidRoleId(input) {
		const value = String(input || "").trim();
		if (!value) return "";
		const rows = Array.isArray(seft?.database?.csm_roles)
			? seft.database.csm_roles
			: (Array.isArray(seft?.database?.csm_roles?.rows) ? seft.database.csm_roles.rows : []);
		if (!Array.isArray(rows) || rows.length === 0) return value;

		const matched = rows.find((r) => {
			const id = String(r?.id || "").trim();
			const code = String(r?.role_code || "").trim();
			return value === id || value === code;
		});
		if (!matched) return "";
		return String(matched?.id || "").trim();
	}
	function findRow(tableName, fieldName, value) {
		const rows = Array.isArray(seft?.database?.[tableName])
			? seft.database[tableName]
			: (Array.isArray(seft?.database?.[tableName]?.rows) ? seft.database[tableName].rows : []);
		const lookup = String(value || "").trim();
		if (!lookup) return null;
		return rows.find((item) => String(item?.[fieldName] || "").trim() === lookup) || null;
	}
	function validateOrgLink(row) {
		const branchId = String(row.branch_id || "").trim();
		const deptId = String(row.dept_id || "").trim();
		const deptRow = deptId ? findRow("csm_depts", "id", deptId) : null;
		if (deptId && !deptRow) {
			window.$message?.error(tr({ vi: "Phòng ban đã chọn không tồn tại", en: "Selected department does not exist", zh: "所选部门不存在" }));
			return false;
		}
		const deptBranchId = String(deptRow?.branch_id || "").trim();
		if (deptBranchId) {
			if (!branchId) {
				row.branch_id = deptBranchId;
			} else if (branchId !== deptBranchId) {
				window.$message?.error(tr({ vi: "Phòng ban không thuộc chi nhánh đã chọn", en: "Department does not belong to the selected branch", zh: "该部门不属于所选分支" }));
				return false;
			}
		}
		const scope = String(row.dataScope || "").trim().toUpperCase();
		if (scope === "BRANCH" && !String(row.branch_id || "").trim()) {
			window.$message?.error(tr({ vi: "Phạm vi Chi nhánh yêu cầu chọn Chi nhánh", en: "Branch scope requires a branch", zh: "分支范围必须选择分支" }));
			return false;
		}
		if (scope === "DEPARTMENT" && !String(row.dept_id || "").trim()) {
			window.$message?.error(tr({ vi: "Phạm vi Phòng ban yêu cầu chọn Phòng ban", en: "Department scope requires a department", zh: "部门范围必须选择部门" }));
			return false;
		}
		return true;
	}
	function findRow(tableName, fieldName, value) {
		const rows = Array.isArray(seft?.database?.[tableName])
			? seft.database[tableName]
			: (Array.isArray(seft?.database?.[tableName]?.rows) ? seft.database[tableName].rows : []);
		const lookup = String(value || "").trim();
		if (!lookup) return null;
		return rows.find((item) => String(item?.[fieldName] || "").trim() === lookup) || null;
	}
	function validateOrgLink(row) {
		const branchId = String(row.branch_id || "").trim();
		const deptId = String(row.dept_id || "").trim();
		const deptRow = deptId ? findRow("csm_depts", "id", deptId) : null;
		if (deptId && !deptRow) {
			window.$message?.error(tr({ vi: "Phòng ban đã chọn không tồn tại", en: "Selected department does not exist", zh: "所选部门不存在" }));
			return false;
		}
		const deptBranchId = String(deptRow?.branch_id || "").trim();
		if (deptBranchId) {
			if (!branchId) {
				row.branch_id = deptBranchId;
			} else if (branchId !== deptBranchId) {
				window.$message?.error(tr({ vi: "Phòng ban không thuộc chi nhánh đã chọn", en: "Department does not belong to the selected branch", zh: "该部门不属于所选分支" }));
				return false;
			}
		}
		const scope = String(row.dataScope || "").trim().toUpperCase();
		if (scope === "BRANCH" && !String(row.branch_id || "").trim()) {
			window.$message?.error(tr({ vi: "Phạm vi Chi nhánh yêu cầu chọn Chi nhánh", en: "Branch scope requires a branch", zh: "分支范围必须选择分支" }));
			return false;
		}
		if (scope === "DEPARTMENT" && !String(row.dept_id || "").trim()) {
			window.$message?.error(tr({ vi: "Phạm vi Phòng ban yêu cầu chọn Phòng ban", en: "Department scope requires a department", zh: "部门范围必须选择部门" }));
			return false;
		}
		return true;
	}

	const actorIsDev = isDevActor();
	const currentActorAppId = getCurrentAppId();
	const normalizedAppId = resolveComboValueByQuery("app_id", row.app_id);
	const resolvedAppId = String(normalizedAppId || row.app_id || currentActorAppId || "csm").trim();
	const primaryIdentifier = String(row.username || row.email || row.phoneNumber || "").trim();
	if (!primaryIdentifier) {
		window.$message?.error(tr({
			vi: "Cần username, email hoặc phoneNumber để tạo tài khoản",
			en: "Username, email, or phoneNumber is required to create account",
			zh: "创建账号需要 username、email 或 phoneNumber",
		}));
		return false;
	}
	const currentPass = String(row.pass || "").trim();
	const accountRows = getRowsFromTable("csm_accounts");
	const rowId = String(row.id || "").trim();
	const existingAccount = accountRows.find((item) => {
		if (rowId) {
			return String(item?.id || "").trim() === rowId;
		}
		const itemIdentifier = String(item?.username || item?.email || item?.phoneNumber || "").trim();
		return Boolean(itemIdentifier) && itemIdentifier === primaryIdentifier;
	}) || null;
	const previousPass = String(existingAccount?.pass || "").trim();
	if (!currentPass) {
		if (previousPass) {
			row.pass = previousPass;
		} else {
			window.$message?.error(tr({
				vi: "Vui lòng nhập mật khẩu cho tài khoản",
				en: "Password is required",
				zh: "请填写账号密码",
			}));
			return false;
		}
	}
	row.app_id = resolvedAppId || "csm";
	row.dev = Boolean(row.dev);
	const targetIsDev = Boolean(row.dev);
	const normalizedRoles = actorIsDev
		? ["admin"]
		: normalizeList(row.roles)
			.map((item) => resolveComboValueByQuery("roles", item))
			.filter(Boolean);
	row.roles = normalizedRoles.length > 0 ? normalizedRoles : ["admin"];
	const roleValue = targetIsDev
		? "dev"
		: (row.roles.length > 0
			? String(row.roles[0] || "admin").trim() || "admin"
			: "admin");
	const accessRight = targetIsDev ? "1" : "0";
	row.app_token = seft.csmEncrypt([resolvedAppId, primaryIdentifier, roleValue, accessRight].join("_____"));
	row.refresh = row.app_token;
	if (currentPass) {
		// Backend chịu trách nhiệm mã hóa pass theo định danh hiện tại.
		row.pass = currentPass;
	}
	row.permissionGroups = normalizeList(row.permissionGroups)
		.map((item) => resolveComboValueByQuery("permissionGroups", item))
		.filter(Boolean);
	row.permissions = normalizeList(row.permissions);
	row.permissionsAdd = normalizeList(row.permissionsAdd);
	row.permissionsDeny = normalizeList(row.permissionsDeny);
	row.menusPermissions = normalizeList(row.menusPermissions);
	row.menusPermissionsAdd = normalizeList(row.menusPermissionsAdd);
	row.menusPermissionsDeny = normalizeList(row.menusPermissionsDeny);
	row.permissionPreset = String(row.permissionPreset || "").trim();
	const parentPermissions = normalizeList(seft?.user?.permissions);
	const parentMenus = normalizeList(seft?.user?.menusPermissions);
	const parentScope = String(seft?.user?.dataScope || "ALL").trim().toUpperCase() || "ALL";

	if (actorIsDev) {
		row.permissions = targetIsDev
			? ["dev", "admin", "scope:all"]
			: ["admin", "scope:all"];
		row.menusPermissions = resolvedAppId ? [resolvedAppId] : (parentMenus.length > 0 ? parentMenus : getDefaultFullMenus());
		row.permissionGroups = [];
		row.permissionsAdd = [];
		row.permissionsDeny = [];
		row.menusPermissionsAdd = [];
		row.menusPermissionsDeny = [];
		row.permissionPreset = "";
		row.dataScope = "ALL";
	} else {
		row.dataScope = minScope(row.dataScope || parentScope, parentScope);
		const hasPermissionGroups = row.permissionGroups.length > 0;
		const fromPreset = hasPermissionGroups ? [] : buildPresetPermissions(row.permissionPreset);
		const presetMenus = hasPermissionGroups ? [] : buildPresetMenus(row.permissionPreset);

		row.permissionsAdd = listMinus(row.permissionsAdd, row.permissionsDeny);
		row.menusPermissionsAdd = listMinus(row.menusPermissionsAdd, row.menusPermissionsDeny);

		if (hasPermissionGroups) {
			// Khi đã chọn nhóm quyền từ /system/dept, để backend resolve theo csm_roles.
			// Frontend chỉ giữ delta add/deny để tránh thao tác dư thừa/chồng chéo.
			row.permissions = [];
			row.menusPermissions = [];
			row.permissionPreset = "";
		} else {
			const basePermissionAllow = uniqueList([...(row.permissions || []), ...(fromPreset || [])]);
			const mergedPermissionAllow = uniqueList([...(basePermissionAllow || []), ...(row.permissionsAdd || [])]);
			row.permissions = listMinus(mergedPermissionAllow, row.permissionsDeny);

			const baseMenuAllow = uniqueList([...(row.menusPermissions || []), ...(presetMenus || [])]);
			const mergedMenuAllow = uniqueList([...(baseMenuAllow || []), ...(row.menusPermissionsAdd || [])]);
			row.menusPermissions = listMinus(mergedMenuAllow, row.menusPermissionsDeny);
		}

		// Chặn vượt quyền theo quyền parent hiện tại.
		row.permissions = intersectPreserveOrder(row.permissions, parentPermissions);
		const finalMenuAllow = row.menusPermissions;
		// Nếu admin có "legacy full-app-scope" (menusPermissions=[appId]), cho phép gán bất kỳ menu app nào
		row.menusPermissions = hasLegacyAppScope(parentMenus, currentActorAppId)
			? uniqueList(finalMenuAllow)
			: intersectPreserveOrder(finalMenuAllow, parentMenus);
	}

	applyDataScopeToPermissions(row);
	if (!validateOrgLink(row)) {
		return false;
	}
	row.permissionBitfield = toBitfield(row).toString(36).toUpperCase();
	if (Object.prototype.hasOwnProperty.call(row, "permissionSchemaVersion")) {
		delete row.permissionSchemaVersion;
	}
	if (row.actived == null) row.actived = true;
	return row;
}
`;

export const SUB_USER_BEFORE_SAVE = `
function beforeSave(row, seft) {
	function isDevActor() {
		return Boolean(seft?.user?.dev);
	}

	function rankScope(scope) {
		const normalized = String(scope || "").trim().toUpperCase();
		const map = { NONE: 0, OWNER: 1, DEPARTMENT: 2, BRANCH: 3, ALL: 4 };
		return map[normalized] ?? 0;
	}

	function minScope(left, right) {
		const values = ["NONE", "OWNER", "DEPARTMENT", "BRANCH", "ALL"];
		return values[Math.min(rankScope(left), rankScope(right))] || "NONE";
	}

	function intersectPreserveOrder(source, allowed) {
		const allowedSet = new Set(uniqueList(allowed).map((item) => String(item || "").trim().toLowerCase()));
		if (allowedSet.size === 0) return [];
		return uniqueList(source).filter((item) => allowedSet.has(String(item || "").trim().toLowerCase()));
	}

	function hasLegacyAppScope(menusList, appId) {
		if (!appId) return false;
		const appKey = String(appId).trim().toLowerCase();
		return uniqueList(menusList).some((token) => {
			const t = String(token || "").trim().toLowerCase();
			return t === appKey || t === "app:" + appKey || t === "/" + appKey;
		});
	}

	function getLang() {
		const fromI18n = String(seft?.i18n?.language || seft?.language || "").toLowerCase();
		const fromNavigator = String((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase();
		const value = fromI18n || fromNavigator;
		if (value.indexOf("zh") === 0) return "zh";
		if (value.indexOf("en") === 0) return "en";
		return "vi";
	}

	function tr(messages) {
		const lang = getLang();
		return messages[lang] || messages.vi || messages.en || "";
	}

	function applyDataScopeToPermissions(row) {
		const scopeMap = {
			OWNER: "scope:owner",
			DEPARTMENT: "scope:department",
			BRANCH: "scope:branch",
			ALL: "scope:all",
		};
		const selectedScope = String(row.dataScope || "").trim().toUpperCase();
		const scopeToken = scopeMap[selectedScope] || "";
		const noScopeTokens = (row.permissions || []).filter((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			return normalized !== "scope:owner"
				&& normalized !== "scope:department"
				&& normalized !== "scope:branch"
				&& normalized !== "scope:all";
		});
		if (scopeToken) noScopeTokens.push(scopeToken);
		row.permissions = noScopeTokens;
	}

	function uniqueList(items) {
		return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
	}

	function listMinus(source, denied) {
		const denySet = new Set(uniqueList(denied).map((item) => item.toLowerCase()));
		return uniqueList(source).filter((item) => !denySet.has(item.toLowerCase()));
	}

	function buildGroupPermissions(groups) {
		const map = {
			admin: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
			system_admin: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
			dept_manager: ["view", "create", "edit", "export", "scope:department"],
			manager: ["view", "create", "edit", "export", "scope:department"],
			staff: ["view", "create", "edit", "scope:owner"],
			user: ["view", "scope:owner"],
			common: ["view", "scope:owner"],
			viewer: ["view", "scope:owner"],
		};
		const normalizedGroups = uniqueList(groups).map((item) => item.toLowerCase());
		const collected = [];
		normalizedGroups.forEach((groupName) => {
			const values = map[groupName];
			if (Array.isArray(values)) collected.push(...values);
		});
		return uniqueList(collected);
	}

	function buildGroupMenus(groups) {
		const map = {
			admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
			system_admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
			dept_manager: ["/system/user", "/dashboard", "homepage", "/crm"],
			manager: ["/system/user", "/dashboard", "homepage", "/crm"],
			staff: ["/dashboard", "homepage", "/crm"],
			user: ["homepage"],
			common: ["homepage"],
			viewer: ["/dashboard", "homepage"],
		};
		const normalizedGroups = uniqueList(groups).map((item) => item.toLowerCase());
		const collected = [];
		normalizedGroups.forEach((groupName) => {
			const values = map[groupName];
			if (Array.isArray(values)) collected.push(...values);
		});
		return uniqueList(collected);
	}

	function buildPresetPermissions(preset) {
		const normalized = String(preset || "").trim().toLowerCase();
		const map = {
			viewer: ["view"],
			editor: ["view", "create", "edit"],
			full_crud: ["view", "create", "edit", "delete"],
			full_crud_export: ["view", "create", "edit", "delete", "export"],
			admin_full: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		};
		return uniqueList(map[normalized] || []);
	}

	function buildPresetMenus(preset) {
		const normalized = String(preset || "").trim().toLowerCase();
		const map = {
			viewer: ["homepage"],
			editor: ["/dashboard", "homepage", "/crm"],
			full_crud: ["/dashboard", "homepage", "/crm"],
			full_crud_export: ["/dashboard", "homepage", "/crm"],
			admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
		};
		return uniqueList(map[normalized] || []);
	}

	function toBitfield(row) {
		const actionBitMap = {
			view: 0,
			create: 1,
			edit: 2,
			delete: 3,
			export: 4,
		};
		const menuBitMap = {
			dashboard: 0,
			"/dashboard": 0,
			homepage: 0,
			"/homepage": 0,
			user: 1,
			"/system/user": 1,
			menu: 3,
			"/system/menu": 3,
			dept: 4,
			"/system/dept": 4,
			developer: 5,
			"/system/developer": 5,
			broadcast: 6,
			"/system/broadcast": 6,
			report: 7,
			"/system/report": 7,
			crm: 8,
			"/crm": 8,
		};
		const scopeBitMap = {
			OWNER: 0,
			DEPARTMENT: 1,
			BRANCH: 2,
			ALL: 3,
		};
		const TOKEN_SIGNATURE = 0x43534d33n;
		let menuMask = 0n;
		let actionMask = 0n;
		let scopeMask = 0n;
		uniqueList(row.permissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = actionBitMap[normalized];
			if (typeof bit === "number") actionMask = actionMask | (1n << BigInt(bit));
		});
		uniqueList(row.menusPermissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = menuBitMap[normalized];
			if (typeof bit === "number" && bit <= 15) menuMask = menuMask | (1n << BigInt(bit));
		});
		const dataScope = String(row.dataScope || "").trim().toUpperCase();
		const scopeBit = scopeBitMap[dataScope];
		if (typeof scopeBit === "number") scopeMask = scopeMask | (1n << BigInt(scopeBit));
		return (menuMask << 48n) | (actionMask << 40n) | (scopeMask << 32n) | TOKEN_SIGNATURE;
	}

	function normalizeList(value) {
		if (Array.isArray(value)) {
			return value.map((item) => {
				if (item && typeof item === "object") {
					return String(item.value ?? item.id ?? item.key ?? item.code ?? "").trim();
				}
				return String(item || "").trim();
			}).filter(Boolean);
		}
		if (typeof value === "string") {
			const raw = value.trim();
			if (!raw) return [];
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return parsed.map((item) => String(item || "").trim()).filter(Boolean);
				}
			} catch (error) {}
			return raw.split(/[,;\\n]/g).map((item) => item.trim()).filter(Boolean);
		}
		return [];
	}

	function findFieldConfig(fieldName) {
		const fields = Array.isArray(seft?.m_configs?.table) ? seft.m_configs.table : [];
		return fields.find((f) => String(f?.f_name || "").trim() === String(fieldName || "").trim()) || null;
	}

	function getRowsFromTable(tableName) {
		const data = seft?.database?.[tableName];
		if (Array.isArray(data)) return data;
		if (Array.isArray(data?.rows)) return data.rows;
		return [];
	}

	function normalizeComboInput(input, valueField, labelField) {
		if (input && typeof input === "object") {
			const obj = input;
			const candidates = [
				obj?.[valueField],
				obj?.value,
				obj?.id,
				obj?.key,
				obj?.code,
				labelField ? obj?.[labelField] : "",
				obj?.label,
				obj?.name,
				obj?.text,
			];
			for (let i = 0; i < candidates.length; i++) {
				const value = String(candidates[i] || "").trim();
				if (value) return value;
			}
			return "";
		}
		return String(input || "").trim();
	}

	function resolveComboValueByQuery(fieldName, input) {
		const field = findFieldConfig(fieldName);
		const rawQuery = String(field?.f_cbo_query || "").trim();
		if (!rawQuery) return String(input || "").trim();

		let parsed = null;
		try {
			parsed = JSON.parse(rawQuery);
		} catch (e) {
			return String(input || "").trim();
		}

		const query = Array.isArray(parsed?.query) ? parsed.query : [];
		for (let i = 0; i < query.length; i++) {
			const q = query[i] || {};
			const tableName = String(q?.obj_name || "").trim();
			const fields = Array.isArray(q?.fields) ? q.fields : [];
			const valueField = String(q?.value_field || fields[0] || "id").trim() || "id";
			const labelField = String(q?.label_field || fields[1] || valueField).trim() || valueField;
			if (!tableName) continue;

			const rows = getRowsFromTable(tableName);
			if (!Array.isArray(rows) || rows.length === 0) continue;

			const rawValue = normalizeComboInput(input, valueField, labelField);
			if (!rawValue) return "";

			const byValue = rows.find((r) => String(r?.[valueField] || "").trim() === rawValue);
			if (byValue) return String(byValue?.[valueField] || "").trim();

			if (labelField) {
				const byLabel = rows.find((r) => String(r?.[labelField] || "").trim() === rawValue);
				if (byLabel) return String(byLabel?.[valueField] || "").trim();
			}
		}

		return "";
	}

	const sourceAppToken = String(seft.user?.app_token || "").trim();
	if (!sourceAppToken) {
		window.$message?.error(tr({
			vi: "Không tìm thấy app_token của tài khoản hiện tại",
			en: "Current account app_token not found",
			zh: "未找到当前账号的 app_token",
		}));
		return false;
	}
	const decryptedSource = String(seft.csmDecrypt(sourceAppToken) || "");
	const sourceParts = decryptedSource.split("_____");
	const sourceAppId = String(sourceParts[0] || seft?.user?.app_id || "").trim() || "csm";
	const loginIdentifier = String(row.login_identifier || "").trim();
	if (!loginIdentifier) {
		window.$message?.error(tr({
			vi: "Vui lòng nhập login_identifier cho sub-user",
			en: "Please input login_identifier for sub-user",
			zh: "请填写子账号的 login_identifier",
		}));
		return false;
	}
	const normalizedAppId = resolveComboValueByQuery("app_id", row.app_id);
	if (normalizedAppId) {
		row.app_id = normalizedAppId;
	}
	if (!String(row.app_id || "").trim()) {
		row.app_id = sourceAppId;
	}
	if (!String(row.parent_account_id || "").trim()) {
		row.parent_account_id = sourceAppId;
	}
	if (!String(row.app_token || "").trim()) {
		row.app_token = seft.csmEncrypt([sourceAppId, loginIdentifier, "user", "0"].join("_____"));
	}
	if (!String(row.refresh || "").trim()) {
		row.refresh = row.app_token;
	}
	const currentPass = String(row.pass || "").trim();
	const groupRows = getRowsFromTable("csm_group_members");
	const groupRowId = String(row.id || "").trim();
	const existingGroupUser = groupRows.find((item) => {
		if (groupRowId) {
			return String(item?.id || "").trim() === groupRowId;
		}
		return String(item?.login_identifier || "").trim() === loginIdentifier;
	}) || null;
	const persistedGroupUserId = String(existingGroupUser?.id || "").trim();
	const persistedLoginIdentifier = String(existingGroupUser?.login_identifier || "").trim();
	if (groupRowId) {
		row.id = groupRowId;
	} else if (persistedGroupUserId) {
		row.id = persistedGroupUserId;
	}
	if (groupRowId && persistedLoginIdentifier) {
		row.login_identifier = persistedLoginIdentifier;
	} else {
		row.login_identifier = loginIdentifier;
	}
	const previousGroupPass = String(existingGroupUser?.pass || "").trim();
	if (!currentPass) {
		if (previousGroupPass) {
			row.pass = previousGroupPass;
		} else {
			window.$message?.error(tr({
				vi: "Vui lòng nhập mật khẩu cho sub-user",
				en: "Password is required for sub-user",
				zh: "子账号必须填写密码",
			}));
			return false;
		}
	}
	if (currentPass) {
		// Backend chịu trách nhiệm mã hóa pass theo login_identifier hiện tại.
		row.pass = currentPass;
	}
	const rawPermissionGroups = normalizeList(row.permissionGroups);
	const groupIdFromField = resolveComboValueByQuery("group_id", row.group_id);
	const groupIdFromGroups = rawPermissionGroups
		.map((item) => resolveComboValueByQuery("group_id", item))
		.find(Boolean) || "";
	const normalizedGroupId = groupIdFromField || groupIdFromGroups;
	row.group_id = normalizedGroupId;
	row.permissionGroups = normalizedGroupId ? [normalizedGroupId] : [];
	row.permissions = normalizeList(row.permissions);
	row.permissionsAdd = normalizeList(row.permissionsAdd);
	row.permissionsDeny = normalizeList(row.permissionsDeny);
	row.menusPermissions = normalizeList(row.menusPermissions);
	row.menusPermissionsAdd = normalizeList(row.menusPermissionsAdd);
	row.menusPermissionsDeny = normalizeList(row.menusPermissionsDeny);
	row.permissionPreset = String(row.permissionPreset || "").trim();
	const parentPermissions = normalizeList(seft?.user?.permissions);
	const parentMenus = normalizeList(seft?.user?.menusPermissions);
	const parentScope = String(seft?.user?.dataScope || "OWNER").trim().toUpperCase() || "OWNER";
	const actorIsDev = isDevActor();
	row.dataScope = actorIsDev ? String(row.dataScope || parentScope).trim().toUpperCase() : minScope(row.dataScope || parentScope, parentScope);

	const hasPermissionGroups = row.permissionGroups.length > 0;
	const fromPreset = hasPermissionGroups ? [] : buildPresetPermissions(row.permissionPreset);
	const presetMenus = hasPermissionGroups ? [] : buildPresetMenus(row.permissionPreset);

	row.permissionsAdd = listMinus(row.permissionsAdd, row.permissionsDeny);
	row.menusPermissionsAdd = listMinus(row.menusPermissionsAdd, row.menusPermissionsDeny);

	if (hasPermissionGroups) {
		// Khi đã chọn mã quyền/nhóm quyền thì backend sẽ resolve từ csm_roles
		// và ghi ra permissionBitfield cuối cùng. Frontend chỉ gửi delta add/deny.
		row.permissions = [];
		row.menusPermissions = [];
		row.permissionPreset = "";
	} else {
		const basePermissionAllow = uniqueList([...(row.permissions || []), ...(fromPreset || [])]);
		const mergedPermissionAllow = uniqueList([...(basePermissionAllow || []), ...(row.permissionsAdd || [])]);
		row.permissions = listMinus(mergedPermissionAllow, row.permissionsDeny);

		const baseMenuAllow = uniqueList([...(row.menusPermissions || []), ...(presetMenus || [])]);
		const mergedMenuAllow = uniqueList([...(baseMenuAllow || []), ...(row.menusPermissionsAdd || [])]);
		row.menusPermissions = listMinus(mergedMenuAllow, row.menusPermissionsDeny);
	}

	if (!actorIsDev) {
		row.permissions = intersectPreserveOrder(row.permissions, parentPermissions);
		row.menusPermissions = hasLegacyAppScope(parentMenus, sourceAppId)
			? uniqueList(row.menusPermissions)
			: intersectPreserveOrder(row.menusPermissions, parentMenus);
	}

	applyDataScopeToPermissions(row);
	if (!validateOrgLink(row)) {
		return false;
	}
	row.permissionBitfield = toBitfield(row).toString(36).toUpperCase();
	if (Object.prototype.hasOwnProperty.call(row, "permissionSchemaVersion")) {
		delete row.permissionSchemaVersion;
	}
	if (row.actived == null) row.actived = true;
	return row;
}
`;

export const SYSTEM_USER_UPDATE_TRIGGER = `
function uniqueList(items) {
	return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizeList(value) {
	if (Array.isArray(value)) {
		return value.map((item) => {
			if (item && typeof item === "object") {
				return String(item.value ?? item.id ?? item.key ?? item.code ?? "").trim();
			}
			return String(item || "").trim();
		}).filter(Boolean);
	}
	if (typeof value === "string") {
		const raw = value.trim();
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
		} catch (e) {}
		return raw.split(/[,;\\n]/g).map((item) => item.trim()).filter(Boolean);
	}
	return [];
}

function listMinus(source, denied) {
	const denySet = new Set(uniqueList(denied).map((item) => item.toLowerCase()));
	return uniqueList(source).filter((item) => !denySet.has(item.toLowerCase()));
}

function buildPresetPermissions(preset) {
	const normalized = String(preset || "").trim().toLowerCase();
	const map = {
		viewer: ["view"],
		editor: ["view", "create", "edit"],
		full_crud: ["view", "create", "edit", "delete"],
		full_crud_export: ["view", "create", "edit", "delete", "export"],
		admin_full: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
	};
	return uniqueList(map[normalized] || []);
}

function buildPresetMenus(preset) {
	const normalized = String(preset || "").trim().toLowerCase();
	const map = {
		viewer: ["homepage"],
		editor: ["/dashboard", "homepage", "/crm"],
		full_crud: ["/dashboard", "homepage", "/crm"],
		full_crud_export: ["/dashboard", "homepage", "/crm"],
		admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
	};
	return uniqueList(map[normalized] || []);
}

function buildGroupPermissionsFallback(groups) {
	const map = {
		admin: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		system_admin: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		dept_manager: ["view", "create", "edit", "export", "scope:department"],
		manager: ["view", "create", "edit", "export", "scope:department"],
		staff: ["view", "create", "edit", "scope:owner"],
		user: ["view", "scope:owner"],
		common: ["view", "scope:owner"],
		viewer: ["view", "scope:owner"],
	};
	const normalizedGroups = uniqueList(groups).map((item) => item.toLowerCase());
	const collected = [];
	normalizedGroups.forEach((groupName) => {
		const values = map[groupName];
		if (Array.isArray(values)) collected.push(...values);
	});
	return uniqueList(collected);
}

function buildGroupMenusFallback(groups) {
	const map = {
		admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
		system_admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
		dept_manager: ["/system/user", "/dashboard", "homepage", "/crm"],
		manager: ["/system/user", "/dashboard", "homepage", "/crm"],
		staff: ["/dashboard", "homepage", "/crm"],
		user: ["homepage"],
		common: ["homepage"],
		viewer: ["/dashboard", "homepage"],
	};
	const normalizedGroups = uniqueList(groups).map((item) => item.toLowerCase());
	const collected = [];
	normalizedGroups.forEach((groupName) => {
		const values = map[groupName];
		if (Array.isArray(values)) collected.push(...values);
	});
	return uniqueList(collected);
}

function resolveGroupBaseFromDatabase(groups, seft) {
	const rows = Array.isArray(seft?.database?.csm_roles)
		? seft.database.csm_roles
		: (Array.isArray(seft?.database?.csm_roles?.rows) ? seft.database.csm_roles.rows : []);
	if (!Array.isArray(rows) || rows.length === 0) {
		return { permissions: [], menus: [] };
	}

	const normalizedGroups = uniqueList(groups).map((item) => String(item || "").trim().toLowerCase());
	const permissions = [];
	const menus = [];

	normalizedGroups.forEach((groupId) => {
		const matched = rows.find((r) => {
			const id = String(r?.id || "").trim().toLowerCase();
			const roleCode = String(r?.role_code || "").trim().toLowerCase();
			return groupId === id || groupId === roleCode;
		});
		if (!matched) return;
		permissions.push(...normalizeList(matched.permissions));
		menus.push(...normalizeList(matched.menusPermissions));
	});

	return { permissions: uniqueList(permissions), menus: uniqueList(menus) };
}

function applyDataScope(perms, scope) {
	const selectedScope = String(scope || "").trim().toUpperCase();
	const scopeMap = {
		OWNER: "scope:owner",
		DEPARTMENT: "scope:department",
		BRANCH: "scope:branch",
		ALL: "scope:all",
	};
	const scopeToken = scopeMap[selectedScope] || "";
	const cleaned = uniqueList(perms).filter((token) => {
		const t = String(token || "").trim().toLowerCase();
		return t !== "scope:owner" && t !== "scope:department" && t !== "scope:branch" && t !== "scope:all";
	});
	if (scopeToken) cleaned.push(scopeToken);
	return uniqueList(cleaned);
}

function toBitfield(permissions, menusPermissions, dataScope) {
	const actionBitMap = { view: 0, create: 1, edit: 2, delete: 3, export: 4 };
	const menuBitMap = {
		dashboard: 0, "/dashboard": 0,
		homepage: 0, "/homepage": 0,
		user: 1, "/system/user": 1,
		menu: 3, "/system/menu": 3,
		dept: 4, "/system/dept": 4,
		developer: 5, "/system/developer": 5,
		broadcast: 6, "/system/broadcast": 6,
		report: 7, "/system/report": 7,
		crm: 8, "/crm": 8,
	};
	const scopeBitMap = { OWNER: 0, DEPARTMENT: 1, BRANCH: 2, ALL: 3 };
	const TOKEN_SIGNATURE = 0x43534d33n;
	let menuMask = 0n;
	let actionMask = 0n;
	let scopeMask = 0n;

	uniqueList(permissions).forEach((token) => {
		const bit = actionBitMap[String(token || "").trim().toLowerCase()];
		if (typeof bit === "number") actionMask = actionMask | (1n << BigInt(bit));
	});
	uniqueList(menusPermissions).forEach((token) => {
		const bit = menuBitMap[String(token || "").trim().toLowerCase()];
		if (typeof bit === "number" && bit <= 15) menuMask = menuMask | (1n << BigInt(bit));
	});

	const scopeBit = scopeBitMap[String(dataScope || "").trim().toUpperCase()];
	if (typeof scopeBit === "number") scopeMask = scopeMask | (1n << BigInt(scopeBit));
	return (menuMask << 48n) | (actionMask << 40n) | (scopeMask << 32n) | TOKEN_SIGNATURE;
}

const row = data || {};
row.permissionGroups = normalizeList(row.permissionGroups);
row.permissions = normalizeList(row.permissions);
row.permissionsAdd = normalizeList(row.permissionsAdd);
row.permissionsDeny = normalizeList(row.permissionsDeny);
row.menusPermissions = normalizeList(row.menusPermissions);
row.menusPermissionsAdd = normalizeList(row.menusPermissionsAdd);
row.menusPermissionsDeny = normalizeList(row.menusPermissionsDeny);
row.permissionPreset = String(row.permissionPreset || "").trim();

row.permissionsAdd = listMinus(row.permissionsAdd, row.permissionsDeny);
row.menusPermissionsAdd = listMinus(row.menusPermissionsAdd, row.menusPermissionsDeny);

const hasPermissionGroups = row.permissionGroups.length > 0;
const fromPreset = hasPermissionGroups ? [] : buildPresetPermissions(row.permissionPreset);
const presetMenus = hasPermissionGroups ? [] : buildPresetMenus(row.permissionPreset);

let effectivePermissions = [];
let effectiveMenus = [];

if (hasPermissionGroups) {
	const dbBase = resolveGroupBaseFromDatabase(row.permissionGroups, seft);
	const fallbackPermissions = buildGroupPermissionsFallback(row.permissionGroups);
	const fallbackMenus = buildGroupMenusFallback(row.permissionGroups);
	const basePermissions = dbBase.permissions.length > 0 ? dbBase.permissions : fallbackPermissions;
	const baseMenus = dbBase.menus.length > 0 ? dbBase.menus : fallbackMenus;

	effectivePermissions = listMinus(uniqueList([...(basePermissions || []), ...(row.permissionsAdd || [])]), row.permissionsDeny);
	effectiveMenus = listMinus(uniqueList([...(baseMenus || []), ...(row.menusPermissionsAdd || [])]), row.menusPermissionsDeny);
} else {
	const basePermissionAllow = uniqueList([...(row.permissions || []), ...(fromPreset || [])]);
	const mergedPermissionAllow = uniqueList([...(basePermissionAllow || []), ...(row.permissionsAdd || [])]);
	effectivePermissions = listMinus(mergedPermissionAllow, row.permissionsDeny);

	const baseMenuAllow = uniqueList([...(row.menusPermissions || []), ...(presetMenus || [])]);
	const mergedMenuAllow = uniqueList([...(baseMenuAllow || []), ...(row.menusPermissionsAdd || [])]);
	effectiveMenus = listMinus(mergedMenuAllow, row.menusPermissionsDeny);
}

effectivePermissions = applyDataScope(effectivePermissions, row.dataScope);
row.permissionBitfield = toBitfield(effectivePermissions, effectiveMenus, row.dataScope).toString(36).toUpperCase();
if (Object.prototype.hasOwnProperty.call(row, "permissionSchemaVersion")) {
	delete row.permissionSchemaVersion;
}

return row;
`;

export const PERMISSION_GROUP_BEFORE_SAVE = `
function beforeSave(row, seft) {
	function getLang() {
		const fromI18n = String(seft?.i18n?.language || seft?.language || "").toLowerCase();
		const fromNavigator = String((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase();
		const value = fromI18n || fromNavigator;
		if (value.indexOf("zh") === 0) return "zh";
		if (value.indexOf("en") === 0) return "en";
		return "vi";
	}
	function tr(messages) {
		const lang = getLang();
		return messages[lang] || messages.vi || messages.en || "";
	}
	function uniqueList(items) {
		return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
	}
	function normalizeList(value) {
		if (Array.isArray(value)) {
			return value.map((item) => {
				if (item && typeof item === "object") {
					return String(item.value ?? item.id ?? item.key ?? item.code ?? "").trim();
				}
				return String(item || "").trim();
			}).filter(Boolean);
		}
		if (typeof value === "string") {
			const raw = value.trim();
			if (!raw) return [];
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
			} catch (e) {}
			return raw.split(/[,;\\n]/g).map((item) => item.trim()).filter(Boolean);
		}
		return [];
	}
	function buildPresetPermissions(preset) {
		const normalized = String(preset || "").trim().toLowerCase();
		const map = {
			viewer: ["view"],
			editor: ["view", "create", "edit"],
			full_crud: ["view", "create", "edit", "delete"],
			full_crud_export: ["view", "create", "edit", "delete", "export"],
			admin_full: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		};
		return uniqueList(map[normalized] || []);
	}
	function buildPresetMenus(preset) {
		const normalized = String(preset || "").trim().toLowerCase();
		const map = {
			viewer: ["homepage"],
			editor: ["/dashboard", "homepage", "/crm"],
			full_crud: ["/dashboard", "homepage", "/crm"],
			full_crud_export: ["/dashboard", "homepage", "/crm"],
			admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "homepage", "/crm"],
		};
		return uniqueList(map[normalized] || []);
	}
	function toBitfield(row) {
		const actionBitMap = { view: 0, create: 1, edit: 2, delete: 3, export: 4 };
		const menuBitMap = {
			dashboard: 0, "/dashboard": 0, homepage: 0, "/homepage": 0,
			user: 1, "/system/user": 1,
			menu: 3, "/system/menu": 3,
			dept: 4, "/system/dept": 4, "permission-group": 4,
			developer: 5, "/system/developer": 5,
			broadcast: 6, "/system/broadcast": 6,
			report: 7, "/system/report": 7,
			crm: 8, "/crm": 8,
		};
		const scopeBitMap = { OWNER: 0, DEPARTMENT: 1, BRANCH: 2, ALL: 3 };
		const TOKEN_SIGNATURE = 0x43534d33n;
		let menuMask = 0n;
		let actionMask = 0n;
		let scopeMask = 0n;
		uniqueList(row.permissions).forEach((token) => {
			const bit = actionBitMap[String(token || "").trim().toLowerCase()];
			if (typeof bit === "number") actionMask = actionMask | (1n << BigInt(bit));
		});
		uniqueList(row.menusPermissions).forEach((token) => {
			const bit = menuBitMap[String(token || "").trim().toLowerCase()];
			if (typeof bit === "number" && bit <= 15) menuMask = menuMask | (1n << BigInt(bit));
		});
		const scopeBit = scopeBitMap[String(row.dataScope || "").trim().toUpperCase()];
		if (typeof scopeBit === "number") scopeMask = scopeMask | (1n << BigInt(scopeBit));
		return (menuMask << 48n) | (actionMask << 40n) | (scopeMask << 32n) | TOKEN_SIGNATURE;
	}
	function scopeFromRoleLevel(level) {
		const normalized = String(level || "").trim().toLowerCase();
		if (normalized === "manager") return "BRANCH";
		if (normalized === "team_lead") return "DEPARTMENT";
		if (normalized === "staff") return "OWNER";
		return "NONE";
	}
	function findRow(tableName, fieldName, value) {
		const rows = Array.isArray(seft?.database?.[tableName])
			? seft.database[tableName]
			: (Array.isArray(seft?.database?.[tableName]?.rows) ? seft.database[tableName].rows : []);
		const lookup = String(value || "").trim();
		if (!lookup) return null;
		return rows.find((item) => String(item?.[fieldName] || "").trim() === lookup) || null;
	}
	function validateOrgLink(row) {
		const branchId = String(row.branch_id || "").trim();
		const deptId = String(row.dept_id || "").trim();
		const deptRow = deptId ? findRow("csm_depts", "id", deptId) : null;
		if (deptId && !deptRow) {
			window.$message?.error(tr({ vi: "Phòng ban đã chọn không tồn tại", en: "Selected department does not exist", zh: "所选部门不存在" }));
			return false;
		}
		const deptBranchId = String(deptRow?.branch_id || "").trim();
		if (deptBranchId) {
			if (!branchId) {
				row.branch_id = deptBranchId;
			} else if (branchId !== deptBranchId) {
				window.$message?.error(tr({ vi: "Phòng ban không thuộc chi nhánh đã chọn", en: "Department does not belong to the selected branch", zh: "该部门不属于所选分支" }));
				return false;
			}
		}
		const scope = String(row.dataScope || "").trim().toUpperCase();
		if (scope === "BRANCH" && !String(row.branch_id || "").trim()) {
			window.$message?.error(tr({ vi: "Phạm vi Chi nhánh yêu cầu chọn Chi nhánh", en: "Branch scope requires a branch", zh: "分支范围必须选择分支" }));
			return false;
		}
		if (scope === "DEPARTMENT" && !String(row.dept_id || "").trim()) {
			window.$message?.error(tr({ vi: "Phạm vi Phòng ban yêu cầu chọn Phòng ban", en: "Department scope requires a department", zh: "部门范围必须选择部门" }));
			return false;
		}
		return true;
	}

	const roleCode = String(row.role_code || "").trim();
	if (!roleCode) {
		window.$message?.error(tr({
			vi: "Cần nhập mã nhóm quyền (role_code)",
			en: "Role code (role_code) is required",
			zh: "必须填写权限组代码 (role_code)",
		}));
		return false;
	}

	row.permissions = normalizeList(row.permissions);
	row.menusPermissions = normalizeList(row.menusPermissions);
	row.permissionPreset = String(row.permissionPreset || "").trim();
	row.role_level = String(row.role_level || "").trim().toLowerCase();

	const mappedScope = scopeFromRoleLevel(row.role_level);
	if (!String(row.dataScope || "").trim() && mappedScope !== "NONE") {
		row.dataScope = mappedScope;
	}

	// Nếu đã chọn tay permissions/menus thì ưu tiên dữ liệu đã chọn,
	// preset chỉ dùng để khởi tạo nhanh khi danh sách còn trống.
	if (row.permissions.length === 0) {
		const fromPreset = buildPresetPermissions(row.permissionPreset);
		row.permissions = uniqueList([...fromPreset]);
	}
	if (row.menusPermissions.length === 0) {
		const fromPresetMenus = buildPresetMenus(row.permissionPreset);
		row.menusPermissions = uniqueList([...fromPresetMenus]);
	}
	if (!validateOrgLink(row)) {
		return false;
	}

	// Single number representing all permissions for this group
	row.permissionBitfield = toBitfield(row).toString(36).toUpperCase();
	if (Object.prototype.hasOwnProperty.call(row, "permissionSchemaVersion")) {
		delete row.permissionSchemaVersion;
	}
	if (row.status == null) row.status = 1;
	return row;
}
`;

export function mergeMenuTableFields(
	currentFields: any,
	defaultFields: TableField[],
	t: (key: string) => string,
	tEn?: (key: string) => string,
	tZh?: (key: string) => string,
) {
	const existingFields = Array.isArray(currentFields) ? [...currentFields] : [];
	const translateLabel = (label: unknown) => {
		const text = String(label || "");
		return text.includes(".") ? t(text) : text;
	};
	const translateLabelByLang = (label: unknown, lang: "vi" | "en" | "zh") => {
		const text = String(label || "");
		if (!text.includes(".")) return text;
		if (lang === "en" && typeof tEn === "function") return tEn(text);
		if (lang === "zh" && typeof tZh === "function") return tZh(text);
		return t(text);
	};
	const treeFieldNames = new Set(["menusPermissions", "menusPermissionsAdd", "menusPermissionsDeny"]);
	const translateField = (field: any) => ({
		...field,
		f_types: treeFieldNames.has(String(field?.f_name || "")) ? "menu_tree" : field?.f_types,
		f_header: translateLabel(field?.f_header),
		f_header_vi: String(field?.f_header_vi || "").trim() || translateLabelByLang(field?.f_header, "vi"),
		f_header_en: String(field?.f_header_en || "").trim() || translateLabelByLang(field?.f_header, "en"),
		f_header_zh: String(field?.f_header_zh || "").trim() || translateLabelByLang(field?.f_header, "zh"),
		f_width: Math.max(Number(field?.f_width || 0), Number(SYSTEM_USER_FIELD_WIDTHS[String(field?.f_name || "")] || 0)) || field?.f_width,
		f_options: Array.isArray(field?.f_options)
			? field.f_options.map((opt: any) => ({
				...opt,
				label: translateLabel(opt?.label),
			}))
			: field?.f_options,
	});
	const existingNames = new Set(existingFields.map((field: any) => String(field?.f_name || "").trim()));
	const missingFields = defaultFields
		.filter((field) => !existingNames.has(field.f_name))
		.map((field) => translateField(field));
	const normalizedExistingFields = existingFields.map((field: any) => translateField(field));
	const merged = [...normalizedExistingFields, ...missingFields];
	const enforced = merged.map((field: any) => {
		const fName = String(field?.f_name || "").trim();
		if (!fName) return field;
		if (fName === "pass") {
			return { ...field, f_types: "password" };
		}
		if (fName === "user_address") {
			return { ...field, f_types: "json", f_show: 0 };
		}
		if (fName === "app_id") {
			return {
				...field,
				f_header: translateLabel("common.menu.apps"),
				f_header_vi: translateLabelByLang("common.menu.apps", "vi"),
				f_header_en: translateLabelByLang("common.menu.apps", "en"),
				f_header_zh: translateLabelByLang("common.menu.apps", "zh"),
				f_types: "co_ro",
				f_show: 0,
				f_width: Math.max(Number(field?.f_width || 0), Number(SYSTEM_USER_FIELD_WIDTHS.app_id || 0)) || field?.f_width,
				f_cbo_query: field?.f_cbo_query || APP_ID_QUERY_JSON,
			};
		}
		return field;
	});
	if (!enforced.some((field: any) => String(field?.f_name || "").trim() === "app_id")) {
		enforced.push({
			f_name: "app_id",
			f_header: translateLabel("common.menu.apps"),
			f_header_vi: translateLabelByLang("common.menu.apps", "vi"),
			f_header_en: translateLabelByLang("common.menu.apps", "en"),
			f_header_zh: translateLabelByLang("common.menu.apps", "zh"),
			f_show: 0,
			f_types: "co_ro",
			f_align: "left",
			f_width: SYSTEM_USER_FIELD_WIDTHS.app_id,
			f_cbo_query: APP_ID_QUERY_JSON,
		} as any);
	}
	return enforced;
}

function parseObject(raw: unknown): Record<string, any> | undefined {
	if (!raw) return undefined;
	if (typeof raw === "object") return raw as Record<string, any>;
	if (typeof raw !== "string") return undefined;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function parseSystemUserModes(base: any): SystemUserModesConfig {
	const direct = parseObject(base?.system_user_modes);
	if (direct) {
		return direct as SystemUserModesConfig;
	}
	const parsedConfig = parseObject(base?.config);
	const nested = parseObject(parsedConfig?.system_user_modes);
	return (nested as SystemUserModesConfig) || {};
}

export function getDefaultSystemUserModeConfig(
	mode: "main" | "sub",
	t: (key: string) => string,
	tEn?: (key: string) => string,
	tZh?: (key: string) => string,
): SystemUserMenuModeConfig {
	const defaultFields = mode === "main" ? SYSTEM_ACCOUNT_DEFAULT_FIELDS : SUB_USER_DEFAULT_FIELDS;
	const defaultBeforeSave = mode === "main" ? SYSTEM_ACCOUNT_BEFORE_SAVE : SUB_USER_BEFORE_SAVE;
	return {
		table_name: mode === "main" ? "csm_accounts" : "csm_group_members",
		table: mergeMenuTableFields([], defaultFields, t, tEn, tZh),
		trigger: { beforeSave: defaultBeforeSave, update: SYSTEM_USER_UPDATE_TRIGGER },
		type_form: 1,
		row_type_edit: 0,
		g_readonly: false,
	};
}

function normalizeModeConfig(
	rawMode: SystemUserMenuModeConfig | undefined,
	mode: "main" | "sub",
	t: (key: string) => string,
	tEn?: (key: string) => string,
	tZh?: (key: string) => string,
): SystemUserMenuModeConfig {
	const fallback = getDefaultSystemUserModeConfig(mode, t, tEn, tZh);
	const rawTrigger = rawMode?.trigger && typeof rawMode.trigger === "object" ? rawMode.trigger : {};
	const normalizedTableName = String(rawMode?.table_name || fallback.table_name || "").trim();
	const normalizedAppId = isSystemUserTableName(normalizedTableName)
		? "csm"
		: String(rawMode?.app_id || "").trim();
	return {
		...fallback,
		...rawMode,
		table_name: normalizedTableName,
		app_id: normalizedAppId || undefined,
		table: mergeMenuTableFields(rawMode?.table, mode === "main" ? SYSTEM_ACCOUNT_DEFAULT_FIELDS : SUB_USER_DEFAULT_FIELDS, t, tEn, tZh),
		trigger: {
			...rawTrigger,
			beforeSave: rawTrigger.beforeSave || (fallback.trigger as any)?.beforeSave,
			update: rawTrigger.update || (fallback.trigger as any)?.update,
		},
		type_form: rawMode?.type_form ?? fallback.type_form,
		row_type_edit: rawMode?.row_type_edit ?? fallback.row_type_edit,
		g_readonly: rawMode?.g_readonly ?? fallback.g_readonly,
	};
}

export function buildSystemUserMenuConfig(
	base: any,
	mode: "main" | "sub",
	resolvedAppId: string,
	t: (key: string) => string,
	tEn?: (key: string) => string,
	tZh?: (key: string) => string,
) {
	const modes = parseSystemUserModes(base);
	const normalizedMain = normalizeModeConfig(modes.main, "main", t, tEn, tZh);
	const normalizedSub = normalizeModeConfig(modes.sub, "sub", t, tEn, tZh);
	const selectedMode = mode === "main" ? normalizedMain : normalizedSub;
	const canonicalAppId = "csm";

	return {
		...base,
		...selectedMode,
		app_id: canonicalAppId,
		system_user_modes: {
			main: normalizedMain,
			sub: normalizedSub,
		},
	};
}

export function adaptSystemUserConfigForActor(
	config: SystemUserMenuModeConfig,
	actorType: SystemUserActorType,
	permissionContext?: SystemUserPermissionContext,
): SystemUserMenuModeConfig {
	if (!config || config.table_name !== "csm_accounts") {
		return config;
	}

	const actorPermissions = normalizeStringList(permissionContext?.permissions).map((item) => item.toLowerCase());
	const actorMenus = normalizeStringList(permissionContext?.menusPermissions).map((item) => item.toLowerCase());
	const actorScope = normalizeScope(permissionContext?.dataScope);
	const actorAppId = String(permissionContext?.appId || "").trim().toLowerCase();
	const isDevContext = Boolean(permissionContext?.isDev);

	const allowedPermissionSet = new Set(actorPermissions);
	const allowedMenuSet = new Set(actorMenus);
	const allowAllMenus = isDevContext || hasLegacyFullAppScope(actorMenus, actorAppId);

	const filteredPermissionOptions = isDevContext
		? PERMISSION_TOKEN_OPTIONS
		: PERMISSION_TOKEN_OPTIONS.filter((option) => {
			const value = String(option.value || "").trim().toLowerCase();
			if (!value) return false;
			if (value === "dev") return false;
			if (value === "admin" && actorType !== "dev") return false;
			if (value.startsWith("scope:")) {
				const scope = normalizeScope(value.replace("scope:", ""));
				return scopeRank(scope) <= scopeRank(actorScope);
			}
			return allowedPermissionSet.has(value);
		});

	const filteredMenuOptions = allowAllMenus
		? MENU_PERMISSION_OPTIONS
		: MENU_PERMISSION_OPTIONS.filter((option) => tokenMatchesMenu(String(option.value || "").trim().toLowerCase(), allowedMenuSet));

	const filteredDataScopeOptions = JSON.parse(DATA_SCOPE_OPTIONS_JSON).options.filter((option: any) => {
		const scope = normalizeScope(option?.value);
		if (isDevContext) return true;
		if (scope === "NONE") return true;
		return scopeRank(scope) <= scopeRank(actorScope);
	});

	const filteredPresetOptions = JSON.parse(ACTION_PRESET_OPTIONS_JSON).options.filter((option: any) => {
		const presetValue = String(option?.value || "").trim().toLowerCase();
		if (!presetValue) return true;
		const definition = PERMISSION_PRESET_DEFINITIONS[presetValue];
		if (!definition) return false;
		const permissionOk = definition.permissions.every((token) => {
			const normalized = token.toLowerCase();
			if (normalized === "dev") return false;
			if (normalized === "admin" && actorType !== "dev") return false;
			if (normalized.startsWith("scope:")) {
				const scope = normalizeScope(normalized.replace("scope:", ""));
				return scopeRank(scope) <= scopeRank(actorScope);
			}
			return isDevContext || allowedPermissionSet.has(normalized);
		});
		if (!permissionOk) return false;
		if (allowAllMenus) return true;
		return definition.menus.every((menu) => tokenMatchesMenu(menu.toLowerCase(), allowedMenuSet));
	});

	const filteredDataScopeQuery = JSON.stringify({ options: filteredDataScopeOptions });
	const filteredPresetQuery = JSON.stringify({ options: filteredPresetOptions });

	return {
		...config,
		table: Array.isArray(config.table)
			? config.table.map((field: any) => {
				const fName = String(field?.f_name || "");
				const hiddenByActor = SYSTEM_USER_INTERNAL_FIELD_NAMES.has(fName)
					|| fName === "app_id"
					|| (actorType === "dev" && SYSTEM_USER_PERMISSION_FIELD_NAMES.has(fName));
				if (hiddenByActor) {
					return { ...field, f_show: 0 };
				}
				if (fName === "permissionPreset") {
					return { ...field, f_cbo_query: filteredPresetQuery };
				}
				if (fName === "dataScope") {
					return { ...field, f_cbo_query: filteredDataScopeQuery };
				}
				if (fName === "permissions" || fName === "permissionsAdd" || fName === "permissionsDeny") {
					return { ...field, f_options: filteredPermissionOptions };
				}
				if (fName === "menusPermissions" || fName === "menusPermissionsAdd" || fName === "menusPermissionsDeny") {
					return { ...field, f_options: filteredMenuOptions };
				}
				return field;
			})
			: config.table,
	};
}