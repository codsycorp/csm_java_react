// Patch lại label đa ngữ cho menuData theo i18n hiện tại
function patchMenuI18n(menu: any, t: (k: string) => string, tEn: (k: string) => string, tZh: (k: string) => string): any {
	if (!menu || typeof menu !== 'object') return menu;
	const patched = { ...menu };
	// Nếu label là key thì dịch, nếu là chuỗi thường thì giữ nguyên
	const isKey = (v: any) => typeof v === 'string' && v.includes('.');
	if (isKey(menu.label)) patched.label = t(menu.label);
	if (isKey(menu.label_vi)) patched.label_vi = t(menu.label_vi);
	if (isKey(menu.label_en)) patched.label_en = tEn(menu.label_en);
	if (isKey(menu.label_zh)) patched.label_zh = tZh(menu.label_zh);
	// Nếu không có label_en/zh/vi thì fallback từ label
	if (!patched.label_vi) patched.label_vi = patched.label;
	if (!patched.label_en) patched.label_en = patched.label;
	if (!patched.label_zh) patched.label_zh = patched.label;
	return patched;
}
import CsmDynamicGrid from "#src/components/csm-grid/CsmDynamicGrid";
import CsmMasterDetail from "#src/components/csm-grid/CsmMasterDetail";
import CsmReport from "#src/components/csm-report/CsmReport";
import { CsmKanbanBoard } from "#src/components/csm-kanban";
import { normalizeMenuRuntimeConfig } from "#src/components/csm-crm/crm-config";
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useAppStore, useUserStore, usePermissionStore, useTabsStore } from "#src/store";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { adaptSystemUserConfigForActor, buildSystemUserMenuConfig, PERMISSION_GROUP_BEFORE_SAVE, PERMISSION_TOKEN_OPTIONS, ACTION_PRESET_OPTIONS_JSON, MENU_PERMISSION_OPTIONS, DATA_SCOPE_OPTIONS_JSON, DEPT_SELECT_QUERY_JSON, DEPT_SELECT_QUERY_BY_BRANCH_JSON, BRANCH_SELECT_QUERY_JSON, ROLE_LEVEL_OPTIONS_JSON, type SystemUserActorType } from "./system-user-menu-config";
import { Empty, Spin, Alert } from "antd";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useLocation } from "react-router";
import { getTableData, createTableStruct, type CreateTableStruct } from "#src/components/csm-grid/CsmApi";
import { useTranslation } from "react-i18next";
import { toPermissionBigInt, resolvePermissionDataScope, isSuperPermissionProfile } from "#src/utils/permission-bitfield";
// Import hàm hỗ trợ đa ngôn ngữ
import { getLocalizedField, SupportedLanguage } from "#src/utils/i18nHelper";

interface MenuData {
	id: string;
	label: string;
	table_name?: string;
	report_name?: string;
	type_form?: "" | 1 | 2 | 3 | 4 | 6;
	row_type_edit?: 0 | 1;
	[key: string]: any;
}

interface TableBootstrapDefinition {
	tableName: string;
	struct: CreateTableStruct;
}

function buildStruct(defaultValue: Record<string, any>, fieldsPK: string[], fieldsSearch: string[]): CreateTableStruct {
	return {
		defaultValue,
		fieldsPK,
		fieldsSearch,
		fields: Array.from(new Set(Object.keys(defaultValue))),
	};
}

export const SYSTEM_ROUTE_TABLE_SCHEMAS: Record<string, TableBootstrapDefinition[]> = {
	"/system/dept": [
		{
			tableName: "csm_roles",
			struct: buildStruct(
				{
					id: "",
					role_code: "",
					role_name: "",
					is_global: 0,
					dept_id: "",
					branch_id: "",
					role_level: "staff",
					department_id: "",
					description: "",
					status: 1,
					permissionBitfield: "0",
					permissionSchemaVersion: "v3",
					dataScope: "NONE",
					create_time: 0,
					update_time: 0,
				},
				["id", "role_code"],
				["id", "role_code", "role_name", "description", "status", "dataScope", "dept_id", "branch_id"],
			),
		},
	],
	"/system/role": [
		{
			tableName: "csm_roles",
			struct: buildStruct(
				{
					id: "",
					role_code: "",
					role_name: "",
					is_global: 0,
					dept_id: "",
					branch_id: "",
					role_level: "staff",
					department_id: "",
					description: "",
					status: 1,
					permissionBitfield: "0",
					permissionSchemaVersion: "v3",
					dataScope: "NONE",
					create_time: 0,
					update_time: 0,
				},
				["id", "role_code"],
				["id", "role_code", "role_name", "description", "status", "dataScope", "dept_id", "branch_id"],
			),
		},
	],
	"/system/roles": [
		{
			tableName: "csm_roles",
			struct: buildStruct(
				{
					id: "",
					role_code: "",
					role_name: "",
					is_global: 0,
					dept_id: "",
					branch_id: "",
					role_level: "staff",
					department_id: "",
					description: "",
					status: 1,
					permissionBitfield: "0",
					permissionSchemaVersion: "v3",
					dataScope: "NONE",
					create_time: 0,
					update_time: 0,
				},
				["id", "role_code"],
				["id", "role_code", "role_name", "description", "status", "dataScope", "dept_id", "branch_id"],
			),
		},
	],
	"/system/departments": [
		{
			tableName: "csm_depts",
			struct: buildStruct(
				{
					id: "",
					parent_dept_id: "",
					branch_id: "",
					dept_code: "",
					dept_name: "",
					dept_full_name: "",
					description: "",
					manager_user_id: "",
					is_global: 0,
					status: 1,
					create_time: 0,
					update_time: 0,
				},
				["id", "dept_code"],
				["id", "dept_code", "dept_name", "dept_full_name", "branch_id", "description"],
			),
		},
	],
	"/system/branches": [
		{
			tableName: "csm_branches",
			struct: buildStruct(
				{
					id: "",
					parent_branch_id: "",
					branch_code: "",
					branch_name: "",
					branch_full_name: "",
					dept_id: "",
					description: "",
					manager_user_id: "",
					is_global: 0,
					status: 1,
					create_time: 0,
					update_time: 0,
				},
				["id", "branch_code"],
				["id", "branch_code", "branch_name", "branch_full_name", "dept_id", "description"],
			),
		},
	],
	"/system/user": [
		{
			tableName: "csm_accounts",
			struct: buildStruct(
				{
					id: "",
					parent_account_id: "",
					username: "",
					email: "",
					phoneNumber: "",
					full_name: "",
					user_address: "",
					app_id: "",
					app_token: "",
					refresh: "",
					pass: "",
					actived: true,
					roles: "[]",
					permissions: "[]",
					menusPermissions: "[]",
					permissionBitfield: "0",
					permissionSchemaVersion: "v3",
					dataScope: "NONE",
					dept_id: "",
					branch_id: "",
					department_id: "",
					team_id: "",
				},
				["id", "username", "email", "phoneNumber"],
				["id", "username", "email", "phoneNumber", "full_name", "app_id", "parent_account_id", "dept_id", "branch_id"],
			),
		},
		{
			tableName: "csm_group_members",
			struct: buildStruct(
				{
					id: "",
					parent_account_id: "",
					login_identifier: "",
					username: "",
					email: "",
					phoneNumber: "",
					full_name: "",
					user_address: "",
					avatar: "",
					group_rights: "[]",
					group_id: "",
					app_token: "",
					source_app_token: "",
					refresh_token: "",
					refresh: "",
					refresh_token_ip: "",
					refresh_token_ua: "",
					refresh_token_expiry: "",
					login_version: 0,
					loginVersion: 0,
					pass: "",
					actived: true,
					permissions: "[]",
					menusPermissions: "[]",
					permissionsAdd: "[]",
					permissionsDeny: "[]",
					menusPermissionsAdd: "[]",
					menusPermissionsDeny: "[]",
					permissionBitfield: "0",
					permissionSchemaVersion: "v3",
					dataScope: "NONE",
					dept_id: "",
					branch_id: "",
					department_id: "",
					team_id: "",
				},
				["id", "login_identifier"],
				["id", "login_identifier", "username", "email", "phoneNumber", "full_name", "parent_account_id", "group_id", "dept_id", "branch_id"],
			),
		},
	],
};

function normalizeStringList(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)));
	}
	if (raw && typeof raw === "object") {
		return Array.from(new Set(Object.values(raw).map((item) => String(item || "").trim()).filter(Boolean)));
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

function structMatchesExpected(currentStruct: unknown, expectedStruct: CreateTableStruct): boolean {
	if (!currentStruct || typeof currentStruct !== "object") return false;
	const currentMap = currentStruct as Record<string, unknown>;
	const currentFields = new Set(normalizeStringList(currentMap.fields).map((item) => item.toLowerCase()));
	const currentPK = new Set(normalizeStringList(currentMap.fieldsPK).map((item) => item.toLowerCase()));

	const expectedFields = expectedStruct.fields.map((item) => item.toLowerCase());
	const expectedPK = expectedStruct.fieldsPK.map((item) => item.toLowerCase());

	const fieldsOk = expectedFields.every((field) => currentFields.has(field));
	const pkOk = expectedPK.every((field) => currentPK.has(field));
	return fieldsOk && pkOk;
}

function parsePermissionMask(raw: unknown): number | null {
	const bits = toPermissionBigInt(raw);
	if (bits === null) return null;
	const asNumber = Number(bits);
	return Number.isSafeInteger(asNumber) ? asNumber : null;
}

function parseMenusPermissions(raw: unknown): Record<string | number, number> {
	if (!raw) return {};

	let source: unknown = raw;
	if (typeof source === "string") {
		const trimmed = source.trim();
		if (!trimmed) return {};
		try {
			source = JSON.parse(trimmed);
		} catch {
			return {};
		}
	}

	const output: Record<string | number, number> = {};

	if (Array.isArray(source)) {
		source.forEach((item) => {
			if (typeof item === "string") {
				const key = item.trim();
				if (key) output[key] = 14;
				return;
			}
			if (!item || typeof item !== "object") return;
			const obj = item as Record<string, unknown>;
			const key = String(obj.menuId || obj.menu_id || obj.id || obj.key || "").trim();
			if (!key) return;
			const mask = parsePermissionMask(obj.mask ?? obj.permission ?? obj.permissions ?? obj.value);
			if (mask !== null) output[key] = mask;
		});
		return output;
	}

	if (typeof source !== "object") return {};
	Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
		const parsed = parsePermissionMask(value);
		if (parsed !== null) output[key] = parsed;
	});

	return output;
}

function normalizeTableNames(raw: unknown): string[] {
	const value = String(raw || "").trim().toLowerCase();
	if (!value) return [];
	return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

const DEPT_MENU_FIELD_KEYS = [
	{ f_name: "id", key: "system.dept.fields.id", f_types: "string", f_align: "left" },
	{ f_name: "parent_dept_id", key: "system.dept.fields.parentDeptId", f_types: "string", f_align: "left" },
	{ f_name: "branch_id", key: "system.userPermission.fields.branchId", f_types: "co", f_align: "left" },
	{ f_name: "dept_code", key: "system.dept.fields.code", f_types: "string", f_align: "left" },
	{ f_name: "dept_name", key: "system.dept.fields.name", f_types: "string", f_align: "left" },
	{ f_name: "dept_full_name", key: "system.dept.fields.fullName", f_types: "string", f_align: "left" },
	{ f_name: "description", key: "system.dept.fields.description", f_types: "string", f_align: "left" },
	{ f_name: "manager_user_id", key: "system.dept.fields.managerUser", f_types: "string", f_align: "left" },
	{ f_name: "is_global", key: "system.dept.fields.isGlobal", f_types: "checkbox", f_align: "center" },
	{ f_name: "status", key: "system.dept.fields.status", f_types: "co", f_align: "center" },
	{ f_name: "create_time", key: "system.dept.fields.createTime", f_types: "number", f_align: "right" },
	{ f_name: "update_time", key: "system.dept.fields.updateTime", f_types: "number", f_align: "right" },
];

const BRANCH_MENU_FIELD_KEYS = [
	{ f_name: "id", key: "system.branch.fields.id", f_types: "string", f_align: "left" },
	{ f_name: "parent_branch_id", key: "system.branch.fields.parentBranchId", f_types: "string", f_align: "left" },
	{ f_name: "branch_code", key: "system.branch.fields.code", f_types: "string", f_align: "left" },
	{ f_name: "branch_name", key: "system.branch.fields.name", f_types: "string", f_align: "left" },
	{ f_name: "branch_full_name", key: "system.branch.fields.fullName", f_types: "string", f_align: "left" },
	{ f_name: "dept_id", key: "system.userPermission.fields.deptId", f_types: "co", f_align: "left" },
	{ f_name: "description", key: "system.branch.fields.description", f_types: "string", f_align: "left" },
	{ f_name: "manager_user_id", key: "system.branch.fields.managerUser", f_types: "string", f_align: "left" },
	{ f_name: "is_global", key: "system.branch.fields.isGlobal", f_types: "checkbox", f_align: "center" },
	{ f_name: "status", key: "system.branch.fields.status", f_types: "co", f_align: "center" },
	{ f_name: "create_time", key: "system.branch.fields.createTime", f_types: "number", f_align: "right" },
	{ f_name: "update_time", key: "system.branch.fields.updateTime", f_types: "number", f_align: "right" },
];

const STATUS_OPTIONS_JSON = JSON.stringify({
	options: [
		{ value: "1", label: "common.activated" },
		{ value: "0", label: "common.deactivated" },
	],
});

const PRESET_RULES: Record<string, { permissions: string[]; menus: string[] }> = {
	viewer: { permissions: ["view"], menus: ["homepage"] },
	editor: { permissions: ["view", "create", "edit"], menus: ["/dashboard", "homepage", "/crm"] },
	full_crud: { permissions: ["view", "create", "edit", "delete"], menus: ["/dashboard", "homepage", "/crm"] },
	full_crud_export: { permissions: ["view", "create", "edit", "delete", "export"], menus: ["/dashboard", "homepage", "/crm"] },
	admin_full: {
		permissions: ["admin", "view", "create", "edit", "delete", "export", "scope:all"],
		menus: ["/system/user", "/system/dept", "/system/departments", "/system/branches", "/system/menu", "/dashboard", "homepage", "/crm"],
	},
};

function normalizeScopeValue(scope: unknown): "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL" {
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

function parseOptionsFromQuery(json: string): Array<{ value: string; label: string }> {
	try {
		const parsed = JSON.parse(json);
		if (Array.isArray(parsed?.options)) return parsed.options;
	} catch {
		return [];
	}
	return [];
}

function normalizeMenuTokens(raw: unknown): string[] {
	if (Array.isArray(raw)) return normalizeStringList(raw);
	if (raw && typeof raw === "object") {
		const keys = Object.keys(raw as Record<string, unknown>);
		if (keys.length > 0) return Array.from(new Set(keys.map((item) => String(item || "").trim()).filter(Boolean)));
	}
	return normalizeStringList(raw);
}

function tokenMatchesMenu(target: string, allowedSet: Set<string>): boolean {
	if (allowedSet.has(target)) return true;
	if (target.startsWith("/") && allowedSet.has(target.slice(1))) return true;
	if (!target.startsWith("/") && allowedSet.has("/" + target)) return true;
	return false;
}

function hasLegacyFullAppScope(menus: string[], appId: string): boolean {
	const app = String(appId || "").trim().toLowerCase();
	if (!app) return false;
	return menus.some((token) => {
		const value = String(token || "").trim().toLowerCase();
		return value === app || value === "app:" + app || value === "/" + app;
	});
}

function buildDeptMenuFields(
	t: (key: string) => string,
	tEn: (key: string) => string,
	tZh: (key: string) => string,
) {
	return DEPT_MENU_FIELD_KEYS.map((field) => ({
		f_name: field.f_name,
		f_header: t(field.key),
		f_header_vi: t(field.key),
		f_header_en: tEn(field.key),
		f_header_zh: tZh(field.key),
		f_show: 1,
		f_types: field.f_types,
		f_align: field.f_align,
		...(field.f_name === "status" ? { f_cbo_query: STATUS_OPTIONS_JSON } : {}),
		...(field.f_name === "branch_id" ? { f_cbo_query: BRANCH_SELECT_QUERY_JSON } : {}),
	}));
}

function buildBranchMenuFields(
	t: (key: string) => string,
	tEn: (key: string) => string,
	tZh: (key: string) => string,
) {
	return BRANCH_MENU_FIELD_KEYS.map((field) => ({
		f_name: field.f_name,
		f_header: t(field.key),
		f_header_vi: t(field.key),
		f_header_en: tEn(field.key),
		f_header_zh: tZh(field.key),
		f_show: 1,
		f_types: field.f_types,
		f_align: field.f_align,
		...(field.f_name === "status" ? { f_cbo_query: STATUS_OPTIONS_JSON } : {}),
		...(field.f_name === "dept_id" ? { f_cbo_query: DEPT_SELECT_QUERY_JSON } : {}),
	}));
}

function buildRoleMenuFields(
	t: (key: string) => string,
	tEn: (key: string) => string,
	tZh: (key: string) => string,
	permissionOptions: Array<{ value: string; label: string }>,
	menuOptions: Array<{ value: string; label: string }>,
	presetOptionsQuery: string,
	dataScopeOptionsQuery: string,
) {
	const h = (key: string) => ({
		f_header: t(key),
		f_header_vi: t(key),
		f_header_en: tEn(key),
		f_header_zh: tZh(key),
	});
	return [
		{ f_name: "id", ...h("system.role.id"), f_show: 0, f_types: "string", f_align: "left" },
		{ f_name: "role_code", ...h("system.role.id"), f_show: 1, f_types: "string", f_align: "left" },
		{ f_name: "role_name", ...h("system.role.name"), f_show: 1, f_types: "string", f_align: "left" },
		{ f_name: "description", ...h("common.description"), f_show: 1, f_types: "string", f_align: "left" },
		{ f_name: "permissionPreset", ...h("system.userPermission.fields.permissionPreset"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: presetOptionsQuery },
		{ f_name: "permissions", ...h("system.userPermission.fields.permissions"), f_show: 1, f_types: "multi_tag", f_align: "left", f_options: permissionOptions },
		{ f_name: "menusPermissions", ...h("system.userPermission.fields.menusPermissions"), f_show: 1, f_types: "menu_tree", f_align: "left", f_options: menuOptions },
		{ f_name: "dataScope", ...h("system.userPermission.fields.dataScope"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: dataScopeOptionsQuery },
		{ f_name: "role_level", ...h("system.userPermission.fields.roleLevel"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: ROLE_LEVEL_OPTIONS_JSON },
		{ f_name: "branch_id", ...h("system.userPermission.fields.branchId"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
		{ f_name: "dept_id", ...h("system.userPermission.fields.deptId"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
		{ f_name: "permissionBitfield", ...h("system.userPermission.fields.permissionBitfield"), f_show: 0, f_types: "string", f_align: "left" },
		{ f_name: "permissionSchemaVersion", ...h("system.userPermission.fields.permissionSchemaVersion"), f_show: 0, f_types: "string", f_align: "left" },
		{ f_name: "status", ...h("common.status"), f_show: 1, f_types: "co", f_align: "center", f_cbo_query: STATUS_OPTIONS_JSON },
		{ f_name: "is_global", ...h("system.dept.fields.isGlobal"), f_show: 0, f_types: "checkbox", f_align: "center" },
		{ f_name: "department_id", ...h("system.userPermission.fields.deptId"), f_show: 0, f_types: "string", f_align: "left" },
		{ f_name: "create_time", ...h("common.createTime"), f_show: 0, f_types: "number", f_align: "right" },
		{ f_name: "update_time", ...h("common.updateTime"), f_show: 0, f_types: "number", f_align: "right" },
	];
}

const SYSTEM_FRIENDLY_VISIBLE_FIELDS: Record<string, string[]> = {
	csm_group_members: [
		"id",
		"login_identifier",
		"user_address",
		"pass",
		"group_id",
		"permissionsAdd",
		"permissionsDeny",
		"menusPermissionsAdd",
		"menusPermissionsDeny",
		"dataScope",
		"permissionBitfield",
		"actived",
	],
	csm_roles: [
		"id",
		"role_code",
		"role_name",
		"description",
		"role_level",
		"dept_id",
		"branch_id",
		"permissionPreset",
		"permissions",
		"menusPermissions",
		"dataScope",
		"status",
	],
	csm_depts: [
		"id",
		"branch_id",
		"dept_code",
		"dept_name",
		"parent_dept_id",
		"manager_user_id",
		"status",
	],
	csm_branches: [
		"id",
		"branch_code",
		"branch_name",
		"parent_branch_id",
		"dept_id",
		"manager_user_id",
		"status",
	],
};

const SYSTEM_USER_VISIBLE_FIELDS_BY_ACTOR: Record<SystemUserActorType, string[]> = {
	dev: [
		"id",
		"username",
		"full_name",
		"email",
		"phoneNumber",
		"user_address",
		"app_id",
		"pass",
		"actived",
	],
	admin: [
		"id",
		"username",
		"full_name",
		"email",
		"phoneNumber",
		"user_address",
		"pass",
		"permissionGroups",
		"permissionsAdd",
		"permissionsDeny",
		"menusPermissionsAdd",
		"menusPermissionsDeny",
		"dataScope",
		"actived",
	],
	"sub-user": [
		"id",
		"username",
		"full_name",
		"email",
		"phoneNumber",
		"user_address",
		"pass",
		"permissionGroups",
		"permissionsAdd",
		"permissionsDeny",
		"menusPermissionsAdd",
		"menusPermissionsDeny",
		"dataScope",
		"actived",
	],
};

function applyFriendlyFieldPolicy(tableName: string | undefined, rawFields: any[], actorType?: SystemUserActorType) {
	if (!tableName || !Array.isArray(rawFields) || rawFields.length === 0) {
		return rawFields;
	}
	const visibleFields = tableName === "csm_accounts"
		? SYSTEM_USER_VISIBLE_FIELDS_BY_ACTOR[actorType || "admin"]
		: SYSTEM_FRIENDLY_VISIBLE_FIELDS[tableName];
	if (!visibleFields || visibleFields.length === 0) {
		return rawFields;
	}

	const orderMap = new Map<string, number>();
	visibleFields.forEach((name, idx) => orderMap.set(name, idx));

	const normalized = rawFields.map((field: any) => {
		const fName = String(field?.f_name || "").trim();
		const isVisible = orderMap.has(fName);
		return {
			...field,
			f_show: isVisible ? 1 : 0,
		};
	});

	normalized.sort((a: any, b: any) => {
		const ia = orderMap.has(a?.f_name) ? (orderMap.get(a?.f_name) as number) : Number.MAX_SAFE_INTEGER;
		const ib = orderMap.has(b?.f_name) ? (orderMap.get(b?.f_name) as number) : Number.MAX_SAFE_INTEGER;
		if (ia !== ib) return ia - ib;
		return String(a?.f_name || "").localeCompare(String(b?.f_name || ""));
	});

	return normalized;
}

/**
 * AdminPage - Renders dynamic grid/report based on menuId parameter
 * Integrates with layout tabbar system for tab-based navigation
 */
export default function AdminPage() {
	const { menuId } = useParams<{ menuId: string }>();
	const location = useLocation();
	const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
	// Prefer reactive currentAppId from AppStore; fallback to user.app_id
	const currentAppId = useAppStore(state => state.currentAppId);
	const userAppId = useUserStore(state => state.app_id);
	const userRolesRaw = useUserStore(state => state.roles as any);
	const userRoles = normalizeStringList(userRolesRaw);
	const devFlag = useUserStore(state => state.dev);
	const userId = useUserStore(state => state.userId);
	const username = useUserStore(state => state.username);
	const email = useUserStore(state => state.email);
	const phoneNumber = useUserStore(state => state.phoneNumber);
	const userPermissionsRaw = useUserStore(state => state.permissions as any);
	const userMenusPermissionsRaw = useUserStore(state => state.menusPermissions as any);
	const userPermissionBitfieldRaw = useUserStore(state => (state as any).permissionBitfield as any);
	const isDevUser = resolveDevFlag(devFlag, userRoles);
	const isAdminUser = !isDevUser && isSuperPermissionProfile(toPermissionBigInt(userPermissionBitfieldRaw));
	const isSystemUserRoute = (menuId === "user");
	// Prefer logged-in user's app_id; fallback to selected app or localStorage default
	const appId = (userAppId && userAppId.trim())
		|| (currentAppId && currentAppId.trim())
		|| useAppStore.getState().getCurrentAppId();
	const selectedMenuIdForTab = useUserStore(state => state.selectedMenuIdForTab);
	const { addTab } = useTabsStore();
	const { t, i18n } = useTranslation();
	const tEn = useMemo(() => i18n.getFixedT("en-US"), [i18n]);
	const tZh = useMemo(() => i18n.getFixedT("zh-CN"), [i18n]);
	
	const [menuData, setMenuData] = useState<MenuData | null>(null);
	const [loading, setLoading] = useState(true);
	const [database, setDatabase] = useState<Record<string, any>>({});
	const [dbLoading, setDbLoading] = useState(false);
	const [dbError, setDbError] = useState<string | null>(null);
	const [reloadTrigger, setReloadTrigger] = useState(0);
	const mismatchLogRef = useRef("");

	const userSubOwnerCandidates = [userAppId, userId, username, email, phoneNumber]
		.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
	const runtimePermissionBits = (isDevUser || isAdminUser)
		? null
		: (toPermissionBigInt(userPermissionBitfieldRaw) ?? toPermissionBigInt(userPermissionsRaw));
	const hasMissingPermissionProfile = !isDevUser && !isAdminUser && runtimePermissionBits === null;
	const runtimePermissions = (isDevUser || isAdminUser || hasMissingPermissionProfile)
		? -1
		: (parsePermissionMask(runtimePermissionBits) ?? -1);
	const runtimeMenusPermissions = parseMenusPermissions(userMenusPermissionsRaw);
	const runtimeDataScope = (isDevUser || isAdminUser || hasMissingPermissionProfile)
		? "ALL"
		: resolvePermissionDataScope(runtimePermissionBits);
	const systemUserActorType: SystemUserActorType = isDevUser ? "dev" : (isAdminUser ? "admin" : "sub-user");

	const roleFieldConstraints = useMemo(() => {
		if (isDevUser) {
			return {
				permissionOptions: PERMISSION_TOKEN_OPTIONS,
				menuOptions: MENU_PERMISSION_OPTIONS,
				presetOptionsQuery: ACTION_PRESET_OPTIONS_JSON,
				dataScopeOptionsQuery: DATA_SCOPE_OPTIONS_JSON,
			};
		}

		const actorPermissions = normalizeStringList(userPermissionsRaw).map((item) => item.toLowerCase());
		const actorMenus = normalizeMenuTokens(userMenusPermissionsRaw).map((item) => item.toLowerCase());
		const actorScope = normalizeScopeValue(runtimeDataScope);
		const permissionSet = new Set(actorPermissions);
		const menuSet = new Set(actorMenus);
		const allowAllMenus = hasLegacyFullAppScope(actorMenus, appId || "");

		const permissionOptions = PERMISSION_TOKEN_OPTIONS.filter((option) => {
			const value = String(option.value || "").trim().toLowerCase();
			if (!value || value === "dev" || value === "admin") return false;
			if (value.startsWith("scope:")) {
				const scope = normalizeScopeValue(value.replace("scope:", ""));
				return scopeRank(scope) <= scopeRank(actorScope);
			}
			return permissionSet.has(value);
		});

		const menuOptions = allowAllMenus
			? MENU_PERMISSION_OPTIONS
			: MENU_PERMISSION_OPTIONS.filter((option) => tokenMatchesMenu(String(option.value || "").trim().toLowerCase(), menuSet));

		const scopeOptions = parseOptionsFromQuery(DATA_SCOPE_OPTIONS_JSON).filter((option) => {
			const scope = normalizeScopeValue(option?.value);
			if (scope === "NONE") return true;
			return scopeRank(scope) <= scopeRank(actorScope);
		});

		const presetOptions = parseOptionsFromQuery(ACTION_PRESET_OPTIONS_JSON).filter((option) => {
			const preset = String(option?.value || "").trim().toLowerCase();
			if (!preset) return true;
			const definition = PRESET_RULES[preset];
			if (!definition) return false;
			const permissionOk = definition.permissions.every((token) => {
				const value = token.toLowerCase();
				if (value === "dev" || value === "admin") return false;
				if (value.startsWith("scope:")) {
					const scope = normalizeScopeValue(value.replace("scope:", ""));
					return scopeRank(scope) <= scopeRank(actorScope);
				}
				return permissionSet.has(value);
			});
			if (!permissionOk) return false;
			if (allowAllMenus) return true;
			return definition.menus.every((menu) => tokenMatchesMenu(menu.toLowerCase(), menuSet));
		});

		return {
			permissionOptions,
			menuOptions,
			presetOptionsQuery: JSON.stringify({ options: presetOptions }),
			dataScopeOptionsQuery: JSON.stringify({ options: scopeOptions }),
		};
	}, [isDevUser, userPermissionsRaw, userMenusPermissionsRaw, runtimeDataScope, appId]);

	const buildUserMenuByRole = useCallback((base: any = {}): any => {
		if (!isSystemUserRoute) {
			return base;
		}

		const resolvedAppId = (appId && String(appId).trim()) || "csm";
		const actorMode: "main" | "sub" = isDevUser ? "main" : "sub";
		const actorTableName = actorMode === "main" ? "csm_accounts" : "csm_group_members";
		const runtimeConfig = buildSystemUserMenuConfig({
			...base,
			id: "user",
			path: "/system/user",
			label: t("common.menu.user"),
			label_en: "System User Management",
			label_zh: "系统用户管理",
			table_name: actorTableName,
			app_id: "csm",
			type_form: 1,
			row_type_edit: 0,
			g_readonly: false,
		}, actorMode, resolvedAppId, t);

		// Respect menu-declared field config for fixed system routes when provided.
		if (Array.isArray(base?.table) && base.table.length > 0) {
			runtimeConfig.table = base.table;
		}
		if (base?.trigger && typeof base.trigger === "object") {
			runtimeConfig.trigger = {
				...(runtimeConfig.trigger || {}),
				...base.trigger,
			};
		}
		if (base?.struct && typeof base.struct === "object") {
			runtimeConfig.struct = {
				...(runtimeConfig.struct || {}),
				...base.struct,
			};
		}

		return normalizeMenuRuntimeConfig(adaptSystemUserConfigForActor(runtimeConfig, systemUserActorType, {
			permissions: userPermissionsRaw,
			menusPermissions: userMenusPermissionsRaw,
			dataScope: runtimeDataScope,
			appId: resolvedAppId,
			isDev: isDevUser,
		}));
	}, [isSystemUserRoute, isDevUser, isAdminUser, t, appId, systemUserActorType, userPermissionsRaw, userMenusPermissionsRaw, runtimeDataScope]);

	const normalizeKnownSystemMenu = useCallback((menu: any = {}): any => {
		if (menuId === "role" || menuId === "roles") {
			const configuredTable = Array.isArray(menu?.table) && menu.table.length > 0 ? menu.table : buildRoleMenuFields(
				t,
				tEn,
				tZh,
				roleFieldConstraints.permissionOptions,
				roleFieldConstraints.menuOptions,
				roleFieldConstraints.presetOptionsQuery,
				roleFieldConstraints.dataScopeOptionsQuery,
			);
			return normalizeMenuRuntimeConfig({
				...menu,
				id: "permission-group",
				path: `/system/${menuId}`,
				label: t("common.menu.permissionGroup"),
				label_vi: t("common.menu.permissionGroup"),
				label_en: tEn("common.menu.permissionGroup"),
				label_zh: tZh("common.menu.permissionGroup"),
				table_name: "csm_roles",
				app_id: appId,
				type_form: 1,
				row_type_edit: 0,
				g_readonly: false,
				table: configuredTable,
				trigger: {
					beforeSave: PERMISSION_GROUP_BEFORE_SAVE,
					...(menu?.trigger && typeof menu.trigger === "object" ? menu.trigger : {}),
				},
				struct: {
					...(menu?.struct || {}),
					fieldsPK: ["id", "role_code"],
				},
			});
		}

		if (menuId === "dept") {
			const configuredTable = Array.isArray(menu?.table) && menu.table.length > 0 ? menu.table : buildRoleMenuFields(
				t,
				tEn,
				tZh,
				roleFieldConstraints.permissionOptions,
				roleFieldConstraints.menuOptions,
				roleFieldConstraints.presetOptionsQuery,
				roleFieldConstraints.dataScopeOptionsQuery,
			);
			return normalizeMenuRuntimeConfig({
				...menu,
				id: "permission-group",
				path: "/system/dept",
				label: t("common.menu.permissionGroup"),
				label_vi: t("common.menu.permissionGroup"),
				label_en: tEn("common.menu.permissionGroup"),
				label_zh: tZh("common.menu.permissionGroup"),
				table_name: "csm_roles",
				app_id: appId,
				type_form: 1,
				row_type_edit: 0,
				g_readonly: false,
				table: configuredTable,
				trigger: {
					beforeSave: PERMISSION_GROUP_BEFORE_SAVE,
					...(menu?.trigger && typeof menu.trigger === "object" ? menu.trigger : {}),
				},
				struct: {
					...(menu?.struct || {}),
					fieldsPK: ["id", "role_code"],
				},
			});
		}

		if (menuId === "departments") {
			const configuredTable = Array.isArray(menu?.table) && menu.table.length > 0 ? menu.table : buildDeptMenuFields(t, tEn, tZh);
			return normalizeMenuRuntimeConfig({
				...menu,
				id: "departments",
				path: "/system/departments",
				label: t("common.menu.dept"),
				label_vi: t("common.menu.dept"),
				label_en: tEn("common.menu.dept"),
				label_zh: tZh("common.menu.dept"),
				table_name: "csm_depts",
				app_id: appId,
				type_form: 1,
				row_type_edit: 0,
				g_readonly: false,
				table: configuredTable,
				struct: {
					...(menu?.struct || {}),
					fieldsPK: ["id", "dept_code"],
				},
			});
		}

		if (menuId === "branches") {
			const configuredTable = Array.isArray(menu?.table) && menu.table.length > 0 ? menu.table : buildBranchMenuFields(t, tEn, tZh);
			return normalizeMenuRuntimeConfig({
				...menu,
				id: "branches",
				path: "/system/branches",
				label: t("common.menu.branch"),
				label_vi: t("common.menu.branch"),
				label_en: tEn("common.menu.branch"),
				label_zh: tZh("common.menu.branch"),
				table_name: "csm_branches",
				app_id: appId,
				type_form: 1,
				row_type_edit: 0,
				g_readonly: false,
				table: configuredTable,
				struct: {
					...(menu?.struct || {}),
					fieldsPK: ["id", "branch_code"],
				},
			});
		}

		return normalizeMenuRuntimeConfig(menu);
	}, [menuId, t, tEn, tZh, appId, roleFieldConstraints]);

	// Centralized refresh hook for dynamic grid/report/crm widgets.
	const handleDataChange = useCallback(() => {
		setReloadTrigger(prev => prev + 1);
	}, []);

	// Known system menu fallback map for translation when API lacks multilingual fields
	const SYSTEM_MENU_I18N_MAP: Record<string, string> = {
		"/system": "common.menu.system",
		"system": "common.menu.system",
		"/system/user": "common.menu.user",
		"user": "common.menu.user",
		"/system/menu": "common.menu.menu",
		"menu": "common.menu.menu",
		"/system/developer": "common.menu.developer",
		"developer": "common.menu.developer",
		"/system/dept": "common.menu.permissionGroup",
		"dept": "common.menu.permissionGroup",
		"permission-group": "common.menu.permissionGroup",
		"/system/role": "common.menu.permissionGroup",
		"role": "common.menu.permissionGroup",
		"/system/roles": "common.menu.permissionGroup",
		"roles": "common.menu.permissionGroup",
		"/system/departments": "common.menu.dept",
		"departments": "common.menu.dept",
		"/system/branches": "common.menu.branch",
		"branches": "common.menu.branch",
	};

	const resolveDisplayLabel = (menu: any): string => {
		const rawLabel = menu?.label || menu?.name || menu?.id || "";
		if (typeof rawLabel === "string" && rawLabel.includes(".")) {
			return t(rawLabel);
		}
		const mappedKey = [menu?.path, menu?.key, menu?.id, menu?.name]
			.map((k: any) => (typeof k === "string" ? SYSTEM_MENU_I18N_MAP[k] : undefined))
			.find(Boolean);
		if (mappedKey) return t(mappedKey);
		// Strip numerical prefixes like "19. Label"
		return typeof rawLabel === "string" ? rawLabel.replace(/^[\d\.\s]+/, "").trim() : rawLabel;
	};

	const enforceCanonicalSystemRouteMenu = useCallback((rawMenu: any = {}): any => {
		const normalized = normalizeMenuRuntimeConfig(rawMenu || {});
		if (menuId === "role" || menuId === "roles") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: "permission-group",
				path: `/system/${menuId}`,
				table_name: "csm_roles",
				app_id: normalized.app_id || appId,
			});
		}
		if (menuId === "dept") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: "permission-group",
				path: "/system/dept",
				table_name: "csm_roles",
				app_id: normalized.app_id || appId,
			});
		}
		if (menuId === "user") {
			const actorTableName = isDevUser ? "csm_accounts" : "csm_group_members";
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: "user",
				path: "/system/user",
				table_name: actorTableName,
				app_id: "csm",
			});
		}
		if (menuId === "departments") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: "departments",
				path: "/system/departments",
				table_name: "csm_depts",
				app_id: normalized.app_id || appId,
			});
		}
		if (menuId === "branches") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: "branches",
				path: "/system/branches",
				table_name: "csm_branches",
				app_id: normalized.app_id || appId,
			});
		}
		return normalized;
	}, [menuId, isDevUser, appId]);


	// Refactor: Lấy menuData từ tab state hoặc menuId props, không dùng location.pathname
	useEffect(() => {
		// Ưu tiên lấy menuData từ tab state (store) nếu có
		const tabsStore = useTabsStore.getState();
		const activeTab = tabsStore.openTabs?.get?.(tabsStore.activeKey) as any;
		let menuDataFromTab = activeTab?.menuData || activeTab?.m_configs;
		const isSameMenu = (a: any, b: any) => {
			if (!a || !b) return false;
			return (a.id === b.id && a.path === b.path);
		};
		if (menuDataFromTab && !isSameMenu(menuDataFromTab, menuData)) {
			// Nếu là trang user, luôn ép lại menuData qua buildUserMenuByRole để đảm bảo table_name đúng quyền
			if (menuId === "user") {
				const normalizedMenu = buildUserMenuByRole(menuDataFromTab);
				setMenuData(normalizedMenu);
			} else {
				setMenuData(menuDataFromTab);
			}
			setLoading(false);
			return;
		}
		// Nếu không có, fallback lấy từ menuId param (cũ)
		const findMenuInTree = (menus: any[], targetId: string): any => {
			for (const menu of menus) {
				if (menu.id === targetId || menu.key === targetId || menu.path === targetId) return menu;
				if (menu.children?.length) {
					const found = findMenuInTree(menu.children, targetId);
					if (found) return found;
				}
			}
			return null;
		};
		const targetId = menuId;
		if (targetId) {
			let found = apiWholeMenus.length > 0 ? findMenuInTree(apiWholeMenus, targetId) : null;
			// Fallback cho /system/user nếu không tìm thấy hoặc thiếu table_name
			if ((!found || !found.table_name) && targetId === "user") {
				const actorTableName = isDevUser ? "csm_accounts" : "csm_group_members";
				found = {
					id: "user",
					path: "/system/user",
					label: t("common.menu.user"),
					table_name: actorTableName,
					app_id: "csm",
					type_form: 1,
					row_type_edit: 0,
					g_readonly: false,
				};
			}
			if (found && !isSameMenu(found, menuData)) {
				// Nếu là trang user, luôn ép lại menuData qua buildUserMenuByRole để đảm bảo table_name đúng quyền
				if (menuId === "user") {
					const normalizedMenu = buildUserMenuByRole(found);
					setMenuData(normalizedMenu);
				} else {
					setMenuData(found);
				}
				setLoading(false);
			}
		}
		// Nếu không tìm thấy menuData thì không set lại liên tục
	}, [menuId, apiWholeMenus, menuData, isDevUser, t]);

	// Di chuyển hàm loadTableData ra ngoài useEffect để có thể tái sử dụng
	const loadTableData = async () => {
		const runtimeMenu = menuData ? normalizeMenuRuntimeConfig(menuData) : null;
		if (!runtimeMenu) return;

		const resolvedUserAppId = (appId && String(appId).trim()) || "csm";
		const resolveTableAppId = (tableName: string): string => {
			if (isSystemUserRoute) {
				if (tableName === "csm_accounts") return "csm";
				if (tableName === "csm_group_members") return "csm";
			}
			return runtimeMenu.app_id || resolvedUserAppId;
		};

		const ensureSystemRouteTables = async () => {
			const definitions = SYSTEM_ROUTE_TABLE_SCHEMAS[location.pathname] || [];
			if (definitions.length === 0) return;

			for (const definition of definitions) {
				const tableAppId = resolveTableAppId(definition.tableName);
				try {
					const indexRes = await getTableData<any>({
						app_id: tableAppId,
						obj_name: "index",
						where: { field: "id", type: "eq", value: definition.tableName },
						take: 1,
					});
					const indexRows = (indexRes as any)?.rows || (indexRes as any)?.data || [];
					const currentStruct = Array.isArray(indexRows) && indexRows.length > 0 ? indexRows[0]?.struct : null;
					if (structMatchesExpected(currentStruct, definition.struct)) {
						continue;
					}
				} catch {
					// Continue to create-table fallback.
				}

				await createTableStruct({
					app_id: tableAppId,
					obj_table: {
						id: definition.tableName,
						struct: definition.struct,
					},
				});
			}
		};

		const allMenuTables = new Set<string>();
		(runtimeMenu.table_name || "")
			.split(",")
			.map((item: string) => item.trim())
			.filter(Boolean)
			.forEach((item: string) => allMenuTables.add(item));
		if (allMenuTables.size === 0) return;

		setDbLoading(true);
		setDbError(null);
		try {
			const tableList = Array.from(allMenuTables);
			const primaryTable = tableList[0];
			const primaryTableAppId = resolveTableAppId(primaryTable);
			const defaultFilter = {
				operator: "AND" as const,
				conditions: [{ field: "id", type: "like", value: "" }]
			};

			if (isSystemUserRoute && isAdminUser && primaryTable === "csm_group_members") {
				const ownerCandidates = Array.from(new Set([
					resolvedUserAppId,
					...userSubOwnerCandidates,
				]));
				const ownerConditions = ownerCandidates
					.filter((owner) => typeof owner === "string" && owner.trim().length > 0)
					.map(owner => ({
					field: "parent_account_id",
					type: "eq",
					value: owner,
				}));
				if (ownerConditions.length > 0) {
					(defaultFilter.conditions as any[]).push({ operator: "OR", conditions: ownerConditions });
				}
			}

			await ensureSystemRouteTables();

			const response = await getTableData<any>({
				app_id: primaryTableAppId,
				obj_name: primaryTable,
				where: defaultFilter
			});

			const rows = response.rows || response.data || [];
			const fieldsPK = response.fieldsPK || ["id"];
			const deduped = Array.from(
				new Map(
					rows.map((row: any, index: number) => {
						const compositeKey = (Array.isArray(fieldsPK) ? fieldsPK : ["id"])
							.map((field: string) => `${field}:${row?.[field] == null ? "" : String(row[field])}`)
							.join("|");
						const fallbackKey = row?.id != null ? `id:${String(row.id)}` : `index:${index}`;
						return [compositeKey.replace(/[|:]/g, "").trim() ? compositeKey : fallbackKey, row];
					})
				).values()
			);

			const newDatabase: Record<string, any> = {
				[primaryTable]: { rows: deduped, fieldsPK: fieldsPK }
			};

			// If multiple tables are defined, load companion tables into database (for triggers/cbo_query)
			if (tableList.length > 1) {
				for (const t of tableList.slice(1)) {
					try {
						const tableAppId = resolveTableAppId(t);
						const tableFilter: any = JSON.parse(JSON.stringify(defaultFilter));
						const resT = await getTableData<any>({ app_id: tableAppId, obj_name: t, where: tableFilter });
						const rowsT = (resT as any).rows || (resT as any).data || [];
						const pkT = (resT as any).fieldsPK || ["id"];
						newDatabase[t] = { rows: rowsT, fieldsPK: pkT };
						   // ...existing code...
					} catch (e) {
						console.warn(`⚠️ Failed to load companion table ${t}:`, (e as any)?.message);
					}
				}
			}

			// Extract dependency tables from trigger config
			const dependencyTables = new Set<string>();
			if (runtimeMenu.trigger && typeof runtimeMenu.trigger === 'object') {
				Object.values(runtimeMenu.trigger).forEach((trigger: any) => {
					if (trigger?.query && Array.isArray(trigger.query)) {
						trigger.query.forEach((q: any) => {
							if (q.obj_name) {
								// Support comma-separated obj_name in trigger queries
								const names = String(q.obj_name).split(",").map((s: string) => s.trim()).filter(Boolean);
								names.forEach((n: string) => dependencyTables.add(n));
							}
						});
					}
				});
			}

			// Load dependency tables
			for (const depTable of dependencyTables) {
				try {
					const tableAppId = resolveTableAppId(depTable);
					const tableFilter: any = JSON.parse(JSON.stringify(defaultFilter));
					const depResponse = await getTableData<any>({
						app_id: tableAppId,
						obj_name: depTable,
						where: tableFilter
					});
					const depRows = (depResponse as any).rows || (depResponse as any).data || [];
					const depFieldsPK = (depResponse as any).fieldsPK || ["id"];
					newDatabase[depTable] = { rows: depRows, fieldsPK: depFieldsPK };
					   // ...existing code...
				} catch (depErr: any) {
					console.warn(`⚠️ Failed to load dependency table ${depTable}:`, depErr?.message);
				}
			}
			
			// Update both local state AND global store database
			setDatabase(newDatabase);
			
			// Update global store so CsmDynamicGrid can access the data
			const currentStoreDb = useAppStore.getState().getDatabase();
			useAppStore.getState().setDatabase({
				...currentStoreDb,
				...newDatabase
			});
			
			console.log('💾 Database updated (local + global store):', Object.keys(newDatabase));
		} catch (err: any) {
			const msg = err?.message || "Failed to load table data";
			setDbError(msg);
			console.error("❌ Load table data failed:", err);
		} finally {
			setDbLoading(false);
		}
	};

	// Load table data from API when menuData changes
	useEffect(() => {
		loadTableData();
	}, [menuData?.table_name, appId, reloadTrigger, isSystemUserRoute, isAdminUser, userSubOwnerCandidates.join("|")]);

	// Refresh function for data changes
	const refreshDatabase = useCallback(() => {
		setReloadTrigger(prev => prev + 1);
	}, []);

	// Theo dõi thay đổi ngôn ngữ và cập nhật giao diện
	useEffect(() => {
		const handleLanguageChange = () => {
			setDatabase({}); // Xóa dữ liệu cũ
			setReloadTrigger(prev => prev + 1); // Kích hoạt render lại lưới

			// Tải lại dữ liệu lưới
			if (menuData?.table_name) {
				loadTableData();
			}
		};

		i18n.on('languageChanged', handleLanguageChange);
		return () => {
			i18n.off('languageChanged', handleLanguageChange);
		};
	}, [i18n, menuData]);

	// Keep hook dependencies stable even before menu data is ready.
	const runtimeMenuData = menuData ? patchMenuI18n(normalizeMenuRuntimeConfig(menuData), t, tEn, tZh) : null;
	const effectiveAppId = runtimeMenuData?.app_id || appId;
	const typeForm = Number(runtimeMenuData?.type_form || 1);
	const tableNameByMenuId: Record<string, string[]> = {
		user: ["csm_accounts", "csm_group_members"],
		dept: ["csm_roles"],
		role: ["csm_roles"],
		roles: ["csm_roles"],
		departments: ["csm_depts"],
		branches: ["csm_branches"],
	};
	const expectedTableNames = (tableNameByMenuId[menuId || ""] || []).map((item) => item.toLowerCase());
	const currentTableName = String(runtimeMenuData?.table_name || "").trim();
	const currentTableNames = normalizeTableNames(runtimeMenuData?.table_name);
	const hasSystemMenuTableMismatch = expectedTableNames.length > 0
		&& currentTableNames.length > 0
		&& !currentTableNames.some((name) => expectedTableNames.includes(name));

	useEffect(() => {
		if (!hasSystemMenuTableMismatch) {
			mismatchLogRef.current = "";
			return;
		}
		const currentKey = currentTableNames.join(",");
		const expectedKey = expectedTableNames.join(",");
		const mismatchKey = `${menuId}|${currentKey}|${expectedKey}|${String(runtimeMenuData?.id || "")}`;
		if (mismatchLogRef.current === mismatchKey) {
			return;
		}
		mismatchLogRef.current = mismatchKey;
		console.warn("[system-menu-config-mismatch]", {
			menuId: runtimeMenuData?.id,
			menuLabel: runtimeMenuData?.label,
			currentTableNames,
			expectedTableNames,
		});
	}, [hasSystemMenuTableMismatch, menuId, currentTableNames, expectedTableNames, runtimeMenuData?.id, runtimeMenuData?.label]);

	if (loading || dbLoading) {
		return (
			<div style={{ padding: 24, textAlign: "center" }}>
				<Spin size="large" />
				<p style={{ marginTop: 16, color: "#666" }}>
					{loading ? t("system.admin.loadingMenu") : t("system.admin.loadingData")}
				</p>
			</div>
		);
	}

	if (!runtimeMenuData) {
		return <Empty description={t("system.admin.menuNotFound")} />;
	}

	if (dbError) {
		return (
			<div style={{ padding: 24 }}>
				<Alert
					message={t("system.admin.loadDataError")}
					description={dbError}
					type="error"
					showIcon
				/>
			</div>
		);
	}

	const mismatchAlertNode = hasSystemMenuTableMismatch ? (
		<Alert
			type="warning"
			showIcon
			message={t("system.menu.configMismatch.title") || "Menu configuration mismatch"}
			description={
				(t("system.menu.configMismatch.desc") || "The current menu and table configuration are inconsistent.")
				+ ` menuId=${menuId}, table=${currentTableName}, expected=${expectedTableNames.join(" | ")}`
			}
			style={{ marginBottom: 12 }}
		/>
	) : null;
console.log("🔍 Rendering menu:", runtimeMenuData);
	// Render standalone Kanban board (type_form = 6 or kanban_config present)
	if (typeForm === 6 || (runtimeMenuData as any).kanban_config) {
		return (
			<div style={{ height: "100%" }}>
				{mismatchAlertNode}
				<CsmKanbanBoard
					appId={effectiveAppId}
					menuData={runtimeMenuData}
					database={database}
					onDataChange={handleDataChange}
					permissions={runtimePermissions}
					menusPermissions={runtimeMenusPermissions}
					menuId={runtimeMenuData.id || menuId}
				/>
			</div>
		);
	}

	// Render dynamic code menu (type_form = 4) with higher priority than grid/report.
	const hasAutoCodeName = !!(runtimeMenuData as any).auto_code_name || typeForm === 4;
	if (hasAutoCodeName) {
		return (
			<div style={{ padding: 16, height: "100%" }}>
				{mismatchAlertNode}
				<DynamicCodeMenu menuId={menuId} menuData={runtimeMenuData} />
			</div>
		);
	}

	// Render report before grid when both fields exist.
	if (runtimeMenuData.report_name) {
		return (
			<div style={{ padding: 16, height: "100%" }}>
				{mismatchAlertNode}
				<CsmReport
					appId={effectiveAppId}
					m_configs={runtimeMenuData}
				/>
			</div>
		);
	}

	// Render grid
	if (runtimeMenuData.table_name) {
		// Extract type_form and row_type_edit from backend, with support for override
		let typeForm: "" | 1 | 2 | 3 | 4 | 5 | 6 = runtimeMenuData.type_form || "";
		let rowTypeEdit: 0 | 1 = runtimeMenuData.row_type_edit ?? 0;
		
		// Check localStorage for overrides (for testing purposes)
		// Can be set via: localStorage.setItem(`${menuStorageScope}:type_form`, "1")
		// localStorage.setItem(`${menuStorageScope}:row_type_edit`, "1")
		try {
			const menuStorageScope = String(
				runtimeMenuData?.id
					|| runtimeMenuData?.path
					|| location.pathname
					|| menuId
					|| "system-grid"
			).trim();
			const storedTypeForm = localStorage.getItem(`${menuStorageScope}:type_form`)
				?? localStorage.getItem(`${menuId}:type_form`);
			const storedRowTypeEdit = localStorage.getItem(`${menuStorageScope}:row_type_edit`)
				?? localStorage.getItem(`${menuId}:row_type_edit`);
			if (storedTypeForm === "" || storedTypeForm === "1" || storedTypeForm === "2") {
				typeForm = storedTypeForm as "" | 1 | 2;
			}
			if (storedRowTypeEdit === "0" || storedRowTypeEdit === "1") {
				rowTypeEdit = parseInt(storedRowTypeEdit, 10) as 0 | 1;
			}
		} catch (e) {
			// localStorage not available
		}
		
		// Fallback: try to find type_form and row_type_edit in the table configuration
		if (!typeForm && runtimeMenuData.table && Array.isArray(runtimeMenuData.table)) {
			const typeFormField = runtimeMenuData.table.find((f: any) => f.f_name === "type_form");
			if (typeFormField && runtimeMenuData.table_name === "csm_menu") {
				// If we're in csm_menu table, try to get the current menu's type_form
				// This is stored as a table field value, not in the menu metadata
			}
		}
		
		// Transform menu data to m_configs format expected by CsmDynamicGrid
		const m_configs = {
			id: runtimeMenuData.id,
			label: runtimeMenuData.label,
			table_name: runtimeMenuData.table_name,
			table: runtimeMenuData.table || [],
			trigger: runtimeMenuData.trigger || {},
			g_readonly: runtimeMenuData.g_readonly,
			table_pagesize: runtimeMenuData.table_pagesize,
			type_form: typeForm,
			row_type_edit: rowTypeEdit,
			struct: {
				...(runtimeMenuData.struct || {}),
				fieldsPK: database[runtimeMenuData.table_name]?.fieldsPK || runtimeMenuData.struct?.fieldsPK || ["id"]
			}
		};

		m_configs.table = applyFriendlyFieldPolicy(runtimeMenuData.table_name, m_configs.table as any, systemUserActorType) as any;

		// If columns are missing, auto-generate sensible defaults for known tables
		if ((!m_configs.table || m_configs.table.length === 0) && runtimeMenuData.table_name) {
			const rows = database[runtimeMenuData.table_name]?.rows || [];
			const firstRow = rows[0] || {};
			// Default column headers mapping (Vietnamese i18n keys used where applicable)
			// Cập nhật ánh xạ trong DEFAULT_HEADERS
			const DEFAULT_HEADERS: Record<string, string> = {
				id: "common.id",
				username: "common.username",
				email: "common.email",
				avatar: "common.picture",
				phoneNumber: "common.phoneNumber",
				dev: "system.userPermission.option.dev",
				description: "common.description",
				roles: "system.userPermission.fields.roles",
				permissionPreset: "system.userPermission.fields.permissionPreset",
				permissionGroups: "system.userPermission.fields.permissionGroups",
				actived: "common.active",
				permissions: "system.userPermission.fields.permissions",
				permissionsAdd: "system.userPermission.fields.permissionsAdd",
				permissionsDeny: "system.userPermission.fields.permissionsDeny",
				menusPermissions: "system.userPermission.fields.menusPermissions",
				menusPermissionsAdd: "system.userPermission.fields.menusPermissionsAdd",
				menusPermissionsDeny: "system.userPermission.fields.menusPermissionsDeny",
				permissionBitfield: "system.userPermission.fields.permissionBitfield",
				permissionSchemaVersion: "system.userPermission.fields.permissionSchemaVersion",
				dataScope: "system.userPermission.fields.dataScope",
				dept_id: "system.userPermission.fields.deptId",
				branch_id: "system.userPermission.fields.branchId",
				department_id: "system.userPermission.fields.deptId",
				team_id: "system.userPermission.fields.deptId",
				group_rights: "common.groupId",
				full_name: "common.fullName",
				user_address: "common.address",
				app_id: "common.appId",
				app_token: "common.appToken",
				refresh: "common.refresh",
				picture: "common.picture",
				userid: "common.userId",
				pass: "common.password",
				active: "common.active",
				action: "common.action",
				role_code: "system.role.id",
				role_name: "system.role.name",
				dept_code: "system.dept.fields.code",
				dept_name: "system.dept.fields.name",
				parent_dept_id: "system.dept.fields.parentDeptId",
				manager_user_id: "system.dept.fields.managerUser",
				is_global: "system.dept.fields.isGlobal",
				create_time: "common.createTime",
				update_time: "common.updateTime",
			};
			const keys = Object.keys(firstRow);
			// If no rows yet, choose a sensible schema for csm_accounts
			const fallbackKeys = runtimeMenuData.table_name === "csm_group_members"
				? ["id", "parent_account_id", "login_identifier", "pass", "group_id", "permissionsAdd", "permissionsDeny", "menusPermissionsAdd", "menusPermissionsDeny", "permissionBitfield", "dataScope", "actived"]
				: runtimeMenuData.table_name === "csm_roles"
					? ["id", "role_code", "role_name", "description", "permissionPreset", "permissions", "menusPermissions", "dataScope", "permissionBitfield", "status"]
					: runtimeMenuData.table_name === "csm_depts"
						? ["id", "parent_dept_id", "branch_id", "dept_code", "dept_name", "dept_full_name", "description", "manager_user_id", "is_global", "status", "create_time", "update_time"]
						: runtimeMenuData.table_name === "csm_branches"
							? ["id", "parent_branch_id", "branch_code", "branch_name", "branch_full_name", "dept_id", "description", "manager_user_id", "is_global", "status", "create_time", "update_time"]
						: SYSTEM_USER_VISIBLE_FIELDS_BY_ACTOR[systemUserActorType];
			DEFAULT_HEADERS.parent_account_id = "common.parentAccountId";
			DEFAULT_HEADERS.login_identifier = "common.loginIdentifier";
			DEFAULT_HEADERS.group_id = "common.groupId";
			DEFAULT_HEADERS.parent_branch_id = "system.branch.fields.parentBranchId";
			DEFAULT_HEADERS.branch_code = "system.branch.fields.code";
			DEFAULT_HEADERS.branch_name = "system.branch.fields.name";
			DEFAULT_HEADERS.branch_full_name = "system.branch.fields.fullName";
			const normalizedKeys = Array.from(new Set(keys.length ? keys : fallbackKeys));
			const fields = normalizedKeys.map((k) => {
				const rawHeader = DEFAULT_HEADERS[k] || k;
				const isKey = typeof rawHeader === 'string' && rawHeader.includes('.');
				return {
					f_name: k,
					f_header: isKey ? t(rawHeader) : rawHeader,
					f_header_vi: isKey ? t(rawHeader) : rawHeader,
					f_header_en: isKey ? tEn(rawHeader) : rawHeader,
					f_header_zh: isKey ? tZh(rawHeader) : rawHeader,
					f_show: 1,
					f_types: k === "id" ? "number" : "string",
					f_align: k === "id" ? "right" : "left",
				};
			});
			m_configs.table = applyFriendlyFieldPolicy(runtimeMenuData.table_name, fields as any, systemUserActorType) as any;
		}
		
		// Debug log to check if backend returned type_form and row_type_edit
		   // ...existing code...

		// If this is a Master-Detail config (type_form=2 and has nodes), render master grid + detail tabs
		// Define master-detail configurations here
		const MASTER_DETAIL_CONFIGS: Record<string, any[]> = {
			// Example: 'hld_nhapvt': [detail config 1, detail config 2]
			// Uncomment and configure when needed
		};

		let nodes = MASTER_DETAIL_CONFIGS[runtimeMenuData.table_name!] || [];
		
		// Log menuData to check for nodes or children
		   // ...existing code...
		
		// If no hardcoded config, try to get from backend/menuData
		if (nodes.length === 0 && (runtimeMenuData as any).nodes) {
			nodes = (runtimeMenuData as any).nodes;
			   // ...existing code...
		}
		
		// Try children if nodes not found
		if (nodes.length === 0 && (runtimeMenuData as any).children && Array.isArray((runtimeMenuData as any).children)) {
			const children = (runtimeMenuData as any).children;
			// Filter children that might be detail tables (have table_name)
			nodes = children.filter((c: any) => c.table_name);
			   // ...existing code...
		}
		
		// AUTO-DETECT: If type_form=2 but no nodes, generate from menu structure
		if (nodes.length === 0 && Number(m_configs.type_form) === 2 && runtimeMenuData.table_name) {
			   // ...existing code...
			// Try to find detail tables by looking for tables with same prefix
			const masterTableName = runtimeMenuData.table_name;
			const allTables = Object.keys(database);
			
			// Look for tables that might be detail tables
			const detailTablePatterns = ['_ct', '_detail', '_line', '_row', '_item'];
			const possibleDetailTables = allTables.filter(t => 
				detailTablePatterns.some(pattern => t === `${masterTableName}${pattern}` || t.startsWith(`${masterTableName}_`))
				&& t !== masterTableName
			);
			
			// If found detail tables, auto-create nodes config
			if (possibleDetailTables.length > 0) {
				nodes = possibleDetailTables.map((tableName, idx) => ({
					id: tableName,
					table_name: tableName,
					label: t('common.detail', { index: idx + 1 }),
					table: runtimeMenuData.table || [],
					trigger: runtimeMenuData.trigger || {},
					g_readonly: false,
					type_form: "",
					row_type_edit: 0,
				}));
			   // ...existing code...
			}
			else {
				// As a final fallback, create a single detail node with a conventional name
				const fallbackDetail = `${masterTableName}_detail`;
				nodes = [
					{
						id: fallbackDetail,
						table_name: fallbackDetail,
						label: "Chi tiết",
						table: runtimeMenuData.table || [],
						trigger: runtimeMenuData.trigger || {},
						g_readonly: false,
						type_form: "",
						row_type_edit: 0,
					}
				];
			   // ...existing code...
			}
		}
		
		   const hasNodes = Array.isArray(nodes) && nodes.length > 0;
		if (Number(m_configs.type_form) === 2 && hasNodes) {
			return (
				<div style={{ padding: 16, height: "100%" }}>
					{mismatchAlertNode}
					<CsmMasterDetail
						appId={effectiveAppId}
						permissions={runtimePermissions}
						menusPermissions={runtimeMenusPermissions}
						dataScope={runtimeDataScope}
						database={database}
						decrypt={(s: string) => s}
						m_configs={{ ...m_configs, nodes }}
						onDataChange={handleDataChange}
					/>
				</div>
			);
		}

		// Otherwise render single grid
		return (
			<div style={{ padding: 16, height: "100%" }}>
				{mismatchAlertNode}
				<CsmDynamicGrid
					gridInstanceKey={`${menuId}::${String(runtimeMenuData.id || "")}`}
					m_configs={m_configs}
					database={database}
					appId={effectiveAppId}
					permissions={runtimePermissions}
					menusPermissions={runtimeMenusPermissions}
					dataScope={runtimeDataScope}
					menuId={runtimeMenuData.id}
					decrypt={(s: string) => s}
					onDataChange={handleDataChange}
				/>
			</div>
		);
	}

	return <Empty description="Invalid menu type" />;
}
