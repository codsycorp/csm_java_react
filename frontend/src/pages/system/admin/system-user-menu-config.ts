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

export const SYSTEM_ACCOUNT_DEFAULT_FIELDS: TableField[] = [
	{ f_name: "id", f_header: "ID", f_show: 1, f_types: "number", f_align: "right" },
	{ f_name: "username", f_header: "common.username", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "email", f_header: "common.email", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "phoneNumber", f_header: "common.phoneNumber", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "full_name", f_header: "common.fullName", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "user_address", f_header: "common.address", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "app_id", f_header: "common.appId", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "app_token", f_header: "common.appToken", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "pass", f_header: "common.password", f_show: 1, f_types: "password", f_align: "left" },
	{ f_name: "roles", f_header: "Roles", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "permissions", f_header: "Permissions", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "menusPermissions", f_header: "Menu Permissions", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "actived", f_header: "common.active", f_show: 1, f_types: "checkbox", f_align: "left" },
];

export const SUB_USER_DEFAULT_FIELDS: TableField[] = [
	{ f_name: "id", f_header: "ID", f_show: 1, f_types: "number", f_align: "right" },
	{ f_name: "parent_account_id", f_header: "common.parentAccountId", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "login_identifier", f_header: "common.loginIdentifier", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "group_id", f_header: "common.groupId", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "app_token", f_header: "common.appToken", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "pass", f_header: "common.password", f_show: 1, f_types: "password", f_align: "left" },
	{ f_name: "permissions", f_header: "Permissions", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "menusPermissions", f_header: "Menu Permissions", f_show: 1, f_types: "string", f_align: "left" },
	{ f_name: "actived", f_header: "common.active", f_show: 1, f_types: "checkbox", f_align: "left" },
];

export const SYSTEM_ACCOUNT_BEFORE_SAVE = `
function beforeSave(row, seft) {
	const resolvedAppId = String(row.app_id || seft.appId || "").trim();
	if (!resolvedAppId) {
		window.$message?.error("Vui lòng chọn app_id trước khi tạo tài khoản");
		return false;
	}
	const primaryIdentifier = String(row.username || row.email || row.phoneNumber || "").trim();
	if (!primaryIdentifier) {
		window.$message?.error("Cần username, email hoặc phoneNumber để tạo tài khoản");
		return false;
	}
	row.app_id = resolvedAppId;
	const roleValue = Array.isArray(row.roles) && row.roles.length > 0
		? String(row.roles[0] || "admin").trim() || "admin"
		: "admin";
	const accessRight = roleValue.toLowerCase() === "dev" ? "1" : "0";
	row.app_token = seft.csmEncrypt([resolvedAppId, primaryIdentifier, roleValue, accessRight].join("_____"));
	row.refresh = row.app_token;
	const currentPass = String(row.pass || "").trim();
	if (currentPass) {
		const decryptedPass = String(seft.csmDecrypt(currentPass) || "");
		if (!decryptedPass.startsWith(primaryIdentifier + "_____")) {
			row.pass = seft.csmEncrypt(primaryIdentifier + "_____" + currentPass);
		}
	}
	if (row.actived == null) row.actived = true;
	return row;
}
`;

export const SUB_USER_BEFORE_SAVE = `
function beforeSave(row, seft) {
	const sourceAppToken = String(seft.user?.app_token || "").trim();
	if (!sourceAppToken) {
		window.$message?.error("Không tìm thấy app_token của tài khoản hiện tại");
		return false;
	}
	const decryptedSource = String(seft.csmDecrypt(sourceAppToken) || "");
	const sourceParts = decryptedSource.split("_____");
	const sourceAppId = String(sourceParts[0] || seft.user?.app_id || "").trim();
	if (!sourceAppId) {
		window.$message?.error("Không xác định được app_id từ tài khoản hiện tại");
		return false;
	}
	const loginIdentifier = String(row.login_identifier || "").trim();
	if (!loginIdentifier) {
		window.$message?.error("Vui lòng nhập login_identifier cho sub-user");
		return false;
	}
	row.parent_account_id = String(row.parent_account_id || seft.user?.app_id || sourceAppId).trim();
	row.app_token = seft.csmEncrypt([sourceAppId, loginIdentifier, "user", "0"].join("_____"));
	row.refresh = row.app_token;
	const currentPass = String(row.pass || "").trim();
	if (currentPass) {
		const decryptedPass = String(seft.csmDecrypt(currentPass) || "");
		if (!decryptedPass.startsWith(loginIdentifier + "_____")) {
			row.pass = seft.csmEncrypt(loginIdentifier + "_____" + currentPass);
		}
	}
	if (row.actived == null) row.actived = true;
	return row;
}
`;

export function mergeMenuTableFields(currentFields: any, defaultFields: TableField[], t: (key: string) => string) {
	const existingFields = Array.isArray(currentFields) ? [...currentFields] : [];
	const existingNames = new Set(existingFields.map((field: any) => String(field?.f_name || "").trim()));
	const missingFields = defaultFields
		.filter((field) => !existingNames.has(field.f_name))
		.map((field) => ({
			...field,
			f_header: String(field.f_header || "").includes(".") ? t(field.f_header) : field.f_header,
		}));
	return [...existingFields, ...missingFields];
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