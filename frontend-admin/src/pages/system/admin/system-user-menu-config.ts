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
	{ value: "home", label: "system.userPermission.menu.home" },
	{ value: "/home", label: "system.userPermission.menu.homePath" },
	{ value: "/system/user", label: "system.userPermission.menu.systemUser" },
	{ value: "/system/dept", label: "system.userPermission.menu.systemDept" },
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
			fields: ["role_code", "role_name"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
});

const DEPT_SELECT_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_depts",
			fields: ["id", "dept_name"],
			obj_where: { field: "id", type: "like", value: "" },
		},
	],
});

// Query sys_apps table (always from csm app) to populate app_id dropdown
const APP_ID_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "sys_apps",
			app_id: "csm",
			fields: ["app_id", "app_name"],
		},
	],
});

export const PERMISSION_GROUP_QUERY_JSON = JSON.stringify({
	query: [
		{
			obj_name: "csm_roles",
			fields: ["role_code", "role_name"],
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

export const SYSTEM_ACCOUNT_DEFAULT_FIELDS: TableField[] = [
	{ f_name: "id", f_header: "ID", f_show: 1, f_types: "number", f_align: "right" },
	{ f_name: "parent_account_id", f_header: "common.parentAccountId", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "username", f_header: "common.username", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "email", f_header: "common.email", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "phoneNumber", f_header: "common.phoneNumber", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "full_name", f_header: "common.fullName", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "user_address", f_header: "common.address", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "app_id", f_header: "common.appId", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: APP_ID_QUERY_JSON } as any,
	{ f_name: "app_token", f_header: "common.appToken", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "pass", f_header: "common.password", f_show: 1, f_types: "password", f_align: "left" },
	{ f_name: "roles", f_header: "system.userPermission.fields.roles", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: ROLE_SELECT_QUERY_JSON },
	{ f_name: "permissionPreset", f_header: "system.userPermission.fields.permissionPreset", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: ACTION_PRESET_OPTIONS_JSON },
	{ f_name: "permissionGroups", f_header: "system.userPermission.fields.permissionGroups", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: PERMISSION_GROUP_QUERY_JSON },
	{ ...buildTagField("permissions", "system.userPermission.fields.permissions", PERMISSION_TOKEN_OPTIONS), f_show: 0 } as any,
	buildTagField("permissionsAdd", "system.userPermission.fields.permissionsAdd", PERMISSION_TOKEN_OPTIONS),
	buildTagField("permissionsDeny", "system.userPermission.fields.permissionsDeny", PERMISSION_TOKEN_OPTIONS),
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
	} as any,
	{
		f_name: "menusPermissionsDeny",
		f_header: "system.userPermission.fields.menusPermissionsDeny",
		f_show: 1,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
	} as any,
	{ f_name: "permissionBitfield", f_header: "system.userPermission.fields.permissionBitfield", f_show: 0, f_types: "string_ro", f_align: "left" },
	{ f_name: "permissionSchemaVersion", f_header: "system.userPermission.fields.permissionSchemaVersion", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "dataScope", f_header: "system.userPermission.fields.dataScope", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: DATA_SCOPE_OPTIONS_JSON },
	{ f_name: "dept_id", f_header: "system.userPermission.fields.deptId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_JSON },
	{ f_name: "branch_id", f_header: "system.userPermission.fields.branchId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_JSON },
	{ f_name: "actived", f_header: "common.active", f_show: 1, f_types: "checkbox", f_align: "left" },
];

export const SUB_USER_DEFAULT_FIELDS: TableField[] = [
	{ f_name: "id", f_header: "ID", f_show: 1, f_types: "number", f_align: "right" },
	{ f_name: "parent_account_id", f_header: "common.parentAccountId", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "login_identifier", f_header: "common.loginIdentifier", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "group_id", f_header: "common.groupId", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: PERMISSION_GROUP_QUERY_JSON },
	{ f_name: "app_token", f_header: "common.appToken", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "pass", f_header: "common.password", f_show: 1, f_types: "password", f_align: "left" },
	{ f_name: "permissionPreset", f_header: "system.userPermission.fields.permissionPreset", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: ACTION_PRESET_OPTIONS_JSON },
	{ f_name: "permissionGroups", f_header: "system.userPermission.fields.permissionGroups", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: PERMISSION_GROUP_QUERY_JSON },
	{ ...buildTagField("permissions", "system.userPermission.fields.permissions", PERMISSION_TOKEN_OPTIONS), f_show: 0 } as any,
	buildTagField("permissionsAdd", "system.userPermission.fields.permissionsAdd", PERMISSION_TOKEN_OPTIONS),
	buildTagField("permissionsDeny", "system.userPermission.fields.permissionsDeny", PERMISSION_TOKEN_OPTIONS),
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
	} as any,
	{
		f_name: "menusPermissionsDeny",
		f_header: "system.userPermission.fields.menusPermissionsDeny",
		f_show: 1,
		f_types: "menu_tree",
		f_align: "left",
		f_options: MENU_PERMISSION_OPTIONS,
	} as any,
	{ f_name: "permissionBitfield", f_header: "system.userPermission.fields.permissionBitfield", f_show: 1, f_types: "string_ro", f_align: "left" },
	{ f_name: "permissionSchemaVersion", f_header: "system.userPermission.fields.permissionSchemaVersion", f_show: 0, f_types: "string", f_align: "left" },
	{ f_name: "dataScope", f_header: "system.userPermission.fields.dataScope", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: DATA_SCOPE_OPTIONS_JSON },
	{ f_name: "dept_id", f_header: "system.userPermission.fields.deptId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_JSON },
	{ f_name: "branch_id", f_header: "system.userPermission.fields.branchId", f_show: 0, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_JSON },
	{ f_name: "actived", f_header: "common.active", f_show: 1, f_types: "checkbox", f_align: "left" },
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
		return ["/dashboard", "/home", "/system/user", "/system/menu", "/system/dept", "/crm"];
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
			admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
			system_admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
			dept_manager: ["/system/user", "/dashboard", "/home", "/crm"],
			manager: ["/system/user", "/dashboard", "/home", "/crm"],
			staff: ["/dashboard", "/home", "/crm"],
			user: ["/home"],
			common: ["/home"],
			viewer: ["/dashboard", "/home"],
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
			viewer: ["/home"],
			editor: ["/dashboard", "/home", "/crm"],
			full_crud: ["/dashboard", "/home", "/crm"],
			full_crud_export: ["/dashboard", "/home", "/crm"],
			admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
		};
		return uniqueList(map[normalized] || []);
	}

	function toBitfield(row) {
		const actionBitMap = {
			view: 31,
			edit: 32,
			create: 33,
			delete: 34,
			export: 35,
		};
		const menuBitMap = {
			dashboard: 0,
			"/dashboard": 0,
			home: 0,
			"/home": 0,
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
			OWNER: 41,
			DEPARTMENT: 42,
			BRANCH: 43,
			ALL: 44,
		};
		let bits = 0n;
		uniqueList(row.permissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = actionBitMap[normalized];
			if (typeof bit === "number") bits = bits | (1n << BigInt(bit));
		});
		uniqueList(row.menusPermissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = menuBitMap[normalized];
			if (typeof bit === "number") bits = bits | (1n << BigInt(bit));
		});
		const dataScope = String(row.dataScope || "").trim().toUpperCase();
		const scopeBit = scopeBitMap[dataScope];
		if (typeof scopeBit === "number") bits = bits | (1n << BigInt(scopeBit));
		return bits;
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
			return raw.split(/[,;\n]/g).map((item) => item.trim()).filter(Boolean);
		}
		return [];
	}

	const actorIsDev = isDevActor();
	const currentActorAppId = getCurrentAppId();
	const resolvedAppId = actorIsDev
		? String(row.app_id || seft.appId || "").trim()
		: currentActorAppId;
	if (!resolvedAppId) {
		window.$message?.error(tr({
			vi: "Vui lòng chọn app_id trước khi tạo tài khoản",
			en: "Please select app_id before creating account",
			zh: "创建账号前请先选择 app_id",
		}));
		return false;
	}
	const currentPass = String(row.pass || "").trim();
	if (!currentPass) {
		window.$message?.error(tr({
			vi: "Vui lòng nhập mật khẩu cho tài khoản",
			en: "Password is required",
			zh: "请填写账号密码",
		}));
		return false;
	}
	const primaryIdentifier = String(row.username || row.email || row.phoneNumber || "").trim();
	if (!primaryIdentifier) {
		window.$message?.error(tr({
			vi: "Cần username, email hoặc phoneNumber để tạo tài khoản",
			en: "Username, email, or phoneNumber is required to create account",
			zh: "创建账号需要 username、email 或 phoneNumber",
		}));
		return false;
	}
	row.app_id = resolvedAppId;
	const normalizedRoles = actorIsDev ? ["admin"] : normalizeList(row.roles);
	row.roles = normalizedRoles.length > 0 ? normalizedRoles : ["admin"];
	const roleValue = row.roles.length > 0
		? String(row.roles[0] || "admin").trim() || "admin"
		: "admin";
	const accessRight = roleValue.toLowerCase() === "dev" ? "1" : "0";
	row.app_token = seft.csmEncrypt([resolvedAppId, primaryIdentifier, roleValue, accessRight].join("_____"));
	row.refresh = row.app_token;
	if (currentPass) {
		const decryptedPass = String(seft.csmDecrypt(currentPass) || "");
		if (!decryptedPass.startsWith(primaryIdentifier + "_____")) {
			row.pass = seft.csmEncrypt(primaryIdentifier + "_____" + currentPass);
		}
	}
	row.permissionGroups = normalizeList(row.permissionGroups);
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
		row.permissions = ["admin", "scope:all"];
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
	row.permissionBitfield = String(toBitfield(row));
	row.permissionSchemaVersion = "v2";
	if (row.actived == null) row.actived = true;
	return row;
}
`;

export const SUB_USER_BEFORE_SAVE = `
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
			admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
			system_admin: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
			dept_manager: ["/system/user", "/dashboard", "/home", "/crm"],
			manager: ["/system/user", "/dashboard", "/home", "/crm"],
			staff: ["/dashboard", "/home", "/crm"],
			user: ["/home"],
			common: ["/home"],
			viewer: ["/dashboard", "/home"],
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
			viewer: ["/home"],
			editor: ["/dashboard", "/home", "/crm"],
			full_crud: ["/dashboard", "/home", "/crm"],
			full_crud_export: ["/dashboard", "/home", "/crm"],
			admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
		};
		return uniqueList(map[normalized] || []);
	}

	function toBitfield(row) {
		const actionBitMap = {
			view: 31,
			edit: 32,
			create: 33,
			delete: 34,
			export: 35,
		};
		const menuBitMap = {
			dashboard: 0,
			"/dashboard": 0,
			home: 0,
			"/home": 0,
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
			OWNER: 41,
			DEPARTMENT: 42,
			BRANCH: 43,
			ALL: 44,
		};
		let bits = 0n;
		uniqueList(row.permissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = actionBitMap[normalized];
			if (typeof bit === "number") bits = bits | (1n << BigInt(bit));
		});
		uniqueList(row.menusPermissions).forEach((token) => {
			const normalized = String(token || "").trim().toLowerCase();
			const bit = menuBitMap[normalized];
			if (typeof bit === "number") bits = bits | (1n << BigInt(bit));
		});
		const dataScope = String(row.dataScope || "").trim().toUpperCase();
		const scopeBit = scopeBitMap[dataScope];
		if (typeof scopeBit === "number") bits = bits | (1n << BigInt(scopeBit));
		return bits;
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
			return raw.split(/[,;\n]/g).map((item) => item.trim()).filter(Boolean);
		}
		return [];
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
	const sourceAppId = String(sourceParts[0] || seft.user?.app_id || "").trim();
	if (!sourceAppId) {
		window.$message?.error(tr({
			vi: "Không xác định được app_id từ tài khoản hiện tại",
			en: "Cannot resolve app_id from current account",
			zh: "无法从当前账号解析 app_id",
		}));
		return false;
	}
	const loginIdentifier = String(row.login_identifier || "").trim();
	if (!loginIdentifier) {
		window.$message?.error(tr({
			vi: "Vui lòng nhập login_identifier cho sub-user",
			en: "Please input login_identifier for sub-user",
			zh: "请填写子账号的 login_identifier",
		}));
		return false;
	}
	row.parent_account_id = String(seft.user?.app_id || sourceAppId).trim();
	row.app_token = seft.csmEncrypt([sourceAppId, loginIdentifier, "user", "0"].join("_____"));
	row.refresh = row.app_token;
	const currentPass = String(row.pass || "").trim();
	if (currentPass) {
		const decryptedPass = String(seft.csmDecrypt(currentPass) || "");
		if (!decryptedPass.startsWith(loginIdentifier + "_____")) {
			row.pass = seft.csmEncrypt(loginIdentifier + "_____" + currentPass);
		}
	}
	row.permissionGroups = normalizeList(row.permissionGroups);
	row.permissions = normalizeList(row.permissions);
	row.permissionsAdd = normalizeList(row.permissionsAdd);
	row.permissionsDeny = normalizeList(row.permissionsDeny);
	row.menusPermissions = normalizeList(row.menusPermissions);
	row.menusPermissionsAdd = normalizeList(row.menusPermissionsAdd);
	row.menusPermissionsDeny = normalizeList(row.menusPermissionsDeny);
	row.permissionPreset = String(row.permissionPreset || "").trim();

	const fromGroups = buildGroupPermissions(row.permissionGroups);
	const fromPreset = buildPresetPermissions(row.permissionPreset);
	const basePermissionAllow = fromGroups.length > 0
		? uniqueList([...(fromGroups || []), ...(fromPreset || [])])
		: uniqueList([...(row.permissions || []), ...(fromPreset || [])]);
	const mergedPermissionAllow = uniqueList([...(basePermissionAllow || []), ...(row.permissionsAdd || [])]);
	row.permissions = listMinus(mergedPermissionAllow, row.permissionsDeny);

	const groupMenus = buildGroupMenus(row.permissionGroups);
	const presetMenus = buildPresetMenus(row.permissionPreset);
	const baseMenuAllow = groupMenus.length > 0
		? uniqueList([...(groupMenus || []), ...(presetMenus || [])])
		: uniqueList([...(row.menusPermissions || []), ...(presetMenus || [])]);
	const mergedMenuAllow = uniqueList([...(baseMenuAllow || []), ...(row.menusPermissionsAdd || [])]);
	row.menusPermissions = listMinus(mergedMenuAllow, row.menusPermissionsDeny);

	applyDataScopeToPermissions(row);
	row.permissionBitfield = String(toBitfield(row));
	row.permissionSchemaVersion = "v2";
	if (row.actived == null) row.actived = true;
	return row;
}
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
			viewer: ["/home"],
			editor: ["/dashboard", "/home", "/crm"],
			full_crud: ["/dashboard", "/home", "/crm"],
			full_crud_export: ["/dashboard", "/home", "/crm"],
			admin_full: ["/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm"],
		};
		return uniqueList(map[normalized] || []);
	}
	function toBitfield(row) {
		const actionBitMap = { view: 31, edit: 32, create: 33, delete: 34, export: 35 };
		const menuBitMap = {
			dashboard: 0, "/dashboard": 0, home: 0, "/home": 0,
			user: 1, "/system/user": 1,
			menu: 3, "/system/menu": 3,
			dept: 4, "/system/dept": 4, "permission-group": 4,
			developer: 5, "/system/developer": 5,
			broadcast: 6, "/system/broadcast": 6,
			report: 7, "/system/report": 7,
			crm: 8, "/crm": 8,
		};
		const scopeBitMap = { OWNER: 41, DEPARTMENT: 42, BRANCH: 43, ALL: 44 };
		let bits = 0n;
		uniqueList(row.permissions).forEach((token) => {
			const bit = actionBitMap[String(token || "").trim().toLowerCase()];
			if (typeof bit === "number") bits = bits | (1n << BigInt(bit));
		});
		uniqueList(row.menusPermissions).forEach((token) => {
			const bit = menuBitMap[String(token || "").trim().toLowerCase()];
			if (typeof bit === "number") bits = bits | (1n << BigInt(bit));
		});
		const scopeBit = scopeBitMap[String(row.dataScope || "").trim().toUpperCase()];
		if (typeof scopeBit === "number") bits = bits | (1n << BigInt(scopeBit));
		return bits;
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

	// Single number representing all permissions for this group
	row.permissionBitfield = String(toBitfield(row));
	row.permissionSchemaVersion = "v2";
	if (row.status == null) row.status = 1;
	return row;
}
`;

export function mergeMenuTableFields(currentFields: any, defaultFields: TableField[], t: (key: string) => string) {
	const existingFields = Array.isArray(currentFields) ? [...currentFields] : [];
	const translateLabel = (label: unknown) => {
		const text = String(label || "");
		return text.includes(".") ? t(text) : text;
	};
	const treeFieldNames = new Set(["menusPermissions", "menusPermissionsAdd", "menusPermissionsDeny"]);
	const translateField = (field: any) => ({
		...field,
		f_types: treeFieldNames.has(String(field?.f_name || "")) ? "menu_tree" : field?.f_types,
		f_header: translateLabel(field?.f_header),
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
	return [...normalizedExistingFields, ...missingFields];
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
): SystemUserMenuModeConfig {
	const defaultFields = mode === "main" ? SYSTEM_ACCOUNT_DEFAULT_FIELDS : SUB_USER_DEFAULT_FIELDS;
	const defaultBeforeSave = mode === "main" ? SYSTEM_ACCOUNT_BEFORE_SAVE : SUB_USER_BEFORE_SAVE;
	return {
		table_name: mode === "main" ? "csm_accounts" : "csm_group_members",
		table: mergeMenuTableFields([], defaultFields, t),
		trigger: { beforeSave: defaultBeforeSave },
		type_form: 1,
		row_type_edit: 0,
		g_readonly: false,
	};
}

function normalizeModeConfig(
	rawMode: SystemUserMenuModeConfig | undefined,
	mode: "main" | "sub",
	t: (key: string) => string,
): SystemUserMenuModeConfig {
	const fallback = getDefaultSystemUserModeConfig(mode, t);
	const rawTrigger = rawMode?.trigger && typeof rawMode.trigger === "object" ? rawMode.trigger : {};
	return {
		...fallback,
		...rawMode,
		table_name: String(rawMode?.table_name || fallback.table_name || "").trim(),
		table: mergeMenuTableFields(rawMode?.table, mode === "main" ? SYSTEM_ACCOUNT_DEFAULT_FIELDS : SUB_USER_DEFAULT_FIELDS, t),
		trigger: {
			...rawTrigger,
			beforeSave: rawTrigger.beforeSave || (fallback.trigger as any)?.beforeSave,
		},
		type_form: rawMode?.type_form ?? fallback.type_form,
		row_type_edit: rawMode?.row_type_edit ?? fallback.row_type_edit,
		g_readonly: rawMode?.g_readonly ?? fallback.g_readonly,
	};
}

export function buildSystemUserMenuConfig(base: any, mode: "main" | "sub", resolvedAppId: string, t: (key: string) => string) {
	const modes = parseSystemUserModes(base);
	const normalizedMain = normalizeModeConfig(modes.main, "main", t);
	const normalizedSub = normalizeModeConfig(modes.sub, "sub", t);
	const selectedMode = mode === "main" ? normalizedMain : normalizedSub;

	return {
		...base,
		...selectedMode,
		app_id: (base?.app_id && String(base.app_id).trim()) || resolvedAppId,
		system_user_modes: {
			main: normalizedMain,
			sub: normalizedSub,
		},
	};
}

export function adaptSystemUserConfigForActor(
	config: SystemUserMenuModeConfig,
	actorType: SystemUserActorType,
): SystemUserMenuModeConfig {
	if (!config || config.table_name !== "csm_accounts") {
		return config;
	}
	return {
		...config,
		table: Array.isArray(config.table)
			? config.table.map((field: any) => (
				(SYSTEM_USER_INTERNAL_FIELD_NAMES.has(String(field?.f_name || ""))
					|| (actorType !== "dev" && String(field?.f_name || "") === "app_id"))
					? { ...field, f_show: 0 }
					: (actorType === "dev" && SYSTEM_USER_PERMISSION_FIELD_NAMES.has(String(field?.f_name || ""))
						? { ...field, f_show: 0 }
						: field)
			))
			: config.table,
	};
}