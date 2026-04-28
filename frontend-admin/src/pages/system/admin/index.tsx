import { normalizeMenuRuntimeConfig } from "#src/components/csm-crm/crm-config";
import { createTableStruct, type CreateTableStruct, getTableData } from "#src/components/csm-grid/CsmApi";
// Patch lại label đa ngữ cho menuData theo i18n hiện tại
import CsmDynamicGrid from "#src/components/csm-grid/CsmDynamicGrid";
import CsmMasterDetail from "#src/components/csm-grid/CsmMasterDetail";
import { CsmKanbanBoard } from "#src/components/csm-kanban";
import CsmReport from "#src/components/csm-report/CsmReport";
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useAppStore, usePermissionStore, useTabsStore, useUserStore } from "#src/store";
import { resolveDevFlag } from "#src/utils/dev-flag";
// Import hàm hỗ trợ đa ngôn ngữ
import { isSuperPermissionProfile, resolvePermissionDataScope, toPermissionBigInt } from "#src/utils/permission-bitfield";
import { Alert, Empty, Spin } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { ACTION_PRESET_OPTIONS_JSON, adaptSystemUserConfigForActor, APP_ID_QUERY_JSON, BRANCH_SELECT_QUERY_JSON, buildSystemUserMenuConfig, DATA_SCOPE_OPTIONS_JSON, DEPT_SELECT_QUERY_BY_BRANCH_JSON, DEPT_SELECT_QUERY_JSON, MENU_PERMISSION_OPTIONS, PERMISSION_GROUP_BEFORE_SAVE, PERMISSION_TOKEN_OPTIONS, ROLE_LEVEL_OPTIONS_JSON, type SystemUserActorType } from "./system-user-menu-config";

function patchMenuI18n(menu: any, t: (k: string) => string, tEn: (k: string) => string, tZh: (k: string) => string): any {
	if (!menu || typeof menu !== "object")
		return menu;
	const patched = { ...menu };
	// Nếu label là key thì dịch, nếu là chuỗi thường thì giữ nguyên
	const isKey = (v: any) => typeof v === "string" && v.includes(".");
	if (isKey(menu.label))
		patched.label = t(menu.label);
	if (isKey(menu.label_vi))
		patched.label_vi = t(menu.label_vi);
	if (isKey(menu.label_en))
		patched.label_en = tEn(menu.label_en);
	if (isKey(menu.label_zh))
		patched.label_zh = tZh(menu.label_zh);
	// Nếu không có label_en/zh/vi thì fallback từ label
	if (!patched.label_vi)
		patched.label_vi = patched.label;
	if (!patched.label_en)
		patched.label_en = patched.label;
	if (!patched.label_zh)
		patched.label_zh = patched.label;
	return patched;
}

interface MenuData {
	id: string
	label: string
	table_name?: string
	report_name?: string
	type_form?: "" | 1 | 2 | 3 | 4 | 6
	row_type_edit?: 0 | 1
	[key: string]: any
}

interface TableBootstrapDefinition {
	tableName: string
	struct: CreateTableStruct
}

function buildStruct(defaultValue: Record<string, any>, fieldsPK: string[], fieldsSearch: string[]): CreateTableStruct {
	return {
		defaultValue,
		fieldsPK,
		fieldsSearch,
		fields: Array.from(new Set(Object.keys(defaultValue))),
	};
}

const ROUTER_APP_TYPE_OPTIONS_JSON = JSON.stringify({
	options: [
		{ ma: "web", ten: "Web" },
		{ ma: "app", ten: "App" },
	],
});

function buildStrictThreeMenuSchema(tableName: string): Array<Record<string, any>> | null {
	if (tableName === "sys_la_routers") {
		return [
			{ f_name: "f_case", f_header: "Tình huống", f_header_vi: "Tình huống", f_header_en: "Case", f_header_zh: "场景", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "f_do", f_header: "Hành động", f_header_vi: "Hành động", f_header_en: "Action", f_header_zh: "动作", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "domain_name", f_header: "Tên miền", f_header_vi: "Tên miền", f_header_en: "Domain", f_header_zh: "域名", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "run", f_header: "Kích hoạt", f_header_vi: "Kích hoạt", f_header_en: "Enabled", f_header_zh: "启用", f_show: 1, f_types: "checkbox", f_align: "center" },
			{ f_name: "app_type", f_header: "Loại ứng dụng", f_header_vi: "Loại ứng dụng", f_header_en: "App Type", f_header_zh: "应用类型", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: ROUTER_APP_TYPE_OPTIONS_JSON },
			{ f_name: "rp_index", f_header: "Thư mục React build", f_header_vi: "Thư mục React build", f_header_en: "React Build Folder", f_header_zh: "React 构建目录", f_show: 1, f_types: "ed", f_align: "right" },
			{ f_name: "gtag", f_header: "GTag", f_header_vi: "GTag", f_header_en: "GTag", f_header_zh: "GTag", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "tbl_service_detail", f_header: "Bảng dịch vụ chi tiết", f_header_vi: "Bảng dịch vụ chi tiết", f_header_en: "Service Detail Table", f_header_zh: "服务明细表", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "gsv", f_header: "GSV", f_header_vi: "GSV", f_header_en: "GSV", f_header_zh: "GSV", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "f_title", f_header: "Tiêu đề", f_header_vi: "Tiêu đề", f_header_en: "Title", f_header_zh: "标题", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "f_keyword", f_header: "Từ khóa", f_header_vi: "Từ khóa", f_header_en: "Keyword", f_header_zh: "关键字", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "app_id", f_header: "ID ứng dụng", f_header_vi: "ID ứng dụng", f_header_en: "App ID", f_header_zh: "应用 ID", f_show: 1, f_types: "co", f_align: "left", f_cbo_query: APP_ID_QUERY_JSON },
			{ f_name: "tbl_services", f_header: "Bảng dịch vụ", f_header_vi: "Bảng dịch vụ", f_header_en: "Services Table", f_header_zh: "服务表", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "id", f_header: "Mã", f_header_vi: "Mã", f_header_en: "Id", f_header_zh: "标识", f_show: 1, f_types: "number", f_align: "right" },
			{ f_name: "f_logo", f_header: "Logo", f_header_vi: "Logo", f_header_en: "Logo", f_header_zh: "图标", f_show: 1, f_types: "image", f_align: "left" },
		];
	}

	if (tableName === "sys_apps") {
		return [
			{ f_name: "id", f_header: "Mã", f_header_vi: "Mã", f_header_en: "Id", f_header_zh: "标识", f_show: 1, f_types: "number", f_align: "right" },
			{ f_name: "app_id", f_header: "ID ứng dụng", f_header_vi: "ID ứng dụng", f_header_en: "App ID", f_header_zh: "应用 ID", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "app_name", f_header: "Tên ứng dụng", f_header_vi: "Tên ứng dụng", f_header_en: "App Name", f_header_zh: "应用名称", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "f_logo", f_header: "Logo", f_header_vi: "Logo", f_header_en: "Logo", f_header_zh: "图标", f_show: 1, f_types: "image", f_align: "left" },
			{ f_name: "index", f_header: "Thứ tự", f_header_vi: "Thứ tự", f_header_en: "Order", f_header_zh: "排序", f_show: 1, f_types: "number", f_align: "right" },
		];
	}

	if (tableName === "sys_reactnative") {
		return [
			{ f_name: "id", f_header: "Mã", f_header_vi: "Mã", f_header_en: "Id", f_header_zh: "标识", f_show: 1, f_types: "number", f_align: "right" },
			{ f_name: "c_name", f_header: "Mã màn hình", f_header_vi: "Mã màn hình", f_header_en: "Screen Code", f_header_zh: "页面编码", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "name", f_header: "Tên màn hình", f_header_vi: "Tên màn hình", f_header_en: "Screen Name", f_header_zh: "页面名称", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "router", f_header: "Đường dẫn", f_header_vi: "Đường dẫn", f_header_en: "Route", f_header_zh: "路由", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "f_pops", f_header: "Tham số", f_header_vi: "Tham số", f_header_en: "Params", f_header_zh: "参数", f_show: 1, f_types: "string", f_align: "left" },
			{ f_name: "component_code", f_header: "Mã giao diện", f_header_vi: "Mã giao diện", f_header_en: "Component Code", f_header_zh: "组件代码", f_show: 1, f_types: "codejs", f_align: "left" },
		];
	}

	return null;
}

const SYSTEM_ROUTE_TABLE_SCHEMAS: Record<string, TableBootstrapDefinition[]> = {
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

const SYSTEM_MENU_KEY_TO_SCHEMA_PATH: Record<string, string> = {
	user: "/system/user",
	dept: "/system/dept",
	role: "/system/role",
	roles: "/system/roles",
	departments: "/system/departments",
	branches: "/system/branches",
};

const SYSTEM_MENU_KEY_TO_EXPECTED_TABLES: Record<string, string[]> = {
	user: ["csm_accounts", "csm_group_members"],
	dept: ["csm_roles"],
	role: ["csm_roles"],
	roles: ["csm_roles"],
	departments: ["csm_depts"],
	branches: ["csm_branches"],
};

function normalizeSystemMenuKey(raw: unknown): string {
	const value = String(raw || "").trim().toLowerCase();
	if (!value)
		return "";
	const normalized = value
		.replace(/^\/?system\/grid\//, "")
		.replace(/^\/?system\//, "")
		.replace(/^\/?grid\//, "")
		.replace(/^\//, "");
	if (normalized === "users")
		return "user";
	if (normalized === "department")
		return "departments";
	if (normalized === "branch")
		return "branches";
	if (normalized === "reactnative")
		return "react-native";
	if (normalized === "permission-group")
		return "dept";
	return normalized;
}

function normalizeStringList(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return Array.from(new Set(raw.map(item => String(item || "").trim()).filter(Boolean)));
	}
	if (raw && typeof raw === "object") {
		return Array.from(new Set(Object.values(raw).map(item => String(item || "").trim()).filter(Boolean)));
	}
	if (typeof raw === "string") {
		const text = raw.trim();
		if (!text)
			return [];
		if (text.startsWith("[") || text.startsWith("{")) {
			try {
				return normalizeStringList(JSON.parse(text));
			}
			catch {
				return [];
			}
		}
		return Array.from(new Set(text.split(/[;,\n]/g).map(item => item.trim()).filter(Boolean)));
	}
	return [];
}

function structMatchesExpected(currentStruct: unknown, expectedStruct: CreateTableStruct): boolean {
	if (!currentStruct || typeof currentStruct !== "object")
		return false;
	const currentMap = currentStruct as Record<string, unknown>;
	const currentFields = new Set(normalizeStringList(currentMap.fields).map(item => item.toLowerCase()));
	const currentPK = new Set(normalizeStringList(currentMap.fieldsPK).map(item => item.toLowerCase()));

	const expectedFields = expectedStruct.fields.map(item => item.toLowerCase());
	const expectedPK = expectedStruct.fieldsPK.map(item => item.toLowerCase());

	const fieldsOk = expectedFields.every(field => currentFields.has(field));
	const pkOk = expectedPK.every(field => currentPK.has(field));
	return fieldsOk && pkOk;
}

function parsePermissionMask(raw: unknown): number | null {
	const bits = toPermissionBigInt(raw);
	if (bits === null)
		return null;
	const asNumber = Number(bits);
	return Number.isSafeInteger(asNumber) ? asNumber : null;
}

function parseMenusPermissions(raw: unknown): Record<string | number, number> {
	if (!raw)
		return {};

	let source: unknown = raw;
	if (typeof source === "string") {
		const trimmed = source.trim();
		if (!trimmed)
			return {};
		try {
			source = JSON.parse(trimmed);
		}
		catch {
			return {};
		}
	}

	const output: Record<string | number, number> = {};

	if (Array.isArray(source)) {
		source.forEach((item) => {
			if (typeof item === "string") {
				const key = item.trim();
				if (key)
					output[key] = 14;
				return;
			}
			if (!item || typeof item !== "object")
				return;
			const obj = item as Record<string, unknown>;
			const key = String(obj.menuId || obj.menu_id || obj.id || obj.key || "").trim();
			if (!key)
				return;
			const mask = parsePermissionMask(obj.mask ?? obj.permission ?? obj.permissions ?? obj.value);
			if (mask !== null)
				output[key] = mask;
		});
		return output;
	}

	if (typeof source !== "object")
		return {};
	Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
		const parsed = parsePermissionMask(value);
		if (parsed !== null)
			output[key] = parsed;
	});

	return output;
}

function normalizeTableNames(raw: unknown): string[] {
	const value = String(raw || "").trim().toLowerCase();
	if (!value)
		return [];
	return Array.from(new Set(value.split(",").map(item => item.trim()).filter(Boolean)));
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

const PRESET_RULES: Record<string, { permissions: string[], menus: string[] }> = {
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
	if (value === "OWNER" || value === "DEPARTMENT" || value === "BRANCH" || value === "ALL")
		return value;
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

function parseOptionsFromQuery(json: string): Array<{ value: string, label: string }> {
	try {
		const parsed = JSON.parse(json);
		if (Array.isArray(parsed?.options))
			return parsed.options;
	}
	catch {
		return [];
	}
	return [];
}

function normalizeMenuTokens(raw: unknown): string[] {
	if (Array.isArray(raw))
		return normalizeStringList(raw);
	if (raw && typeof raw === "object") {
		const keys = Object.keys(raw as Record<string, unknown>);
		if (keys.length > 0)
			return Array.from(new Set(keys.map(item => String(item || "").trim()).filter(Boolean)));
	}
	return normalizeStringList(raw);
}

function tokenMatchesMenu(target: string, allowedSet: Set<string>): boolean {
	if (allowedSet.has(target))
		return true;
	if (target.startsWith("/") && allowedSet.has(target.slice(1)))
		return true;
	if (!target.startsWith("/") && allowedSet.has(`/${target}`))
		return true;
	return false;
}

function hasLegacyFullAppScope(menus: string[], appId: string): boolean {
	const app = String(appId || "").trim().toLowerCase();
	if (!app)
		return false;
	return menus.some((token) => {
		const value = String(token || "").trim().toLowerCase();
		return value === app || value === `app:${app}` || value === `/${app}`;
	});
}

/**
 * Enriches DB-supplied table fields with required f_types / f_cbo_query / f_options
 * for well-known special field names (e.g. menu_tree, multi_tag, checkbox, status).
 * DB values for headers, f_show, and f_align are always preserved.
 * Enrichment is only injected when the DB field is MISSING the property.
 */
function enrichRequiredFieldConfigs(
	fields: any[],
	knownOverrides: Record<string, Partial<{ f_types: string, f_cbo_query: string, f_options: any[] }>>,
): any[] {
	if (!Array.isArray(fields) || fields.length === 0)
		return fields;
	return fields.map((field) => {
		const fName = String(field?.f_name || "").trim();
		const override = knownOverrides[fName];
		if (!override)
			return field;
		const currentType = String(field?.f_types || "").trim().toLowerCase();
		const currentTypeIsGeneric = !currentType || currentType === "string" || currentType === "ed";
		return {
			...field,
			// Apply f_types override only when DB has no specific type
			...(override.f_types && currentTypeIsGeneric ? { f_types: override.f_types } : {}),
			// Inject f_cbo_query only if missing
			...(override.f_cbo_query && !field.f_cbo_query ? { f_cbo_query: override.f_cbo_query } : {}),
			// Inject f_options only if missing
			...(override.f_options && !field.f_options ? { f_options: override.f_options } : {}),
		};
	});
}

function enforceLegacyReadonlySystemUserFields(fields: any[], actorType?: SystemUserActorType): any[] {
	if (!Array.isArray(fields))
		return fields;
	return fields.map((field) => {
		const fName = String(field?.f_name || "").trim();
		if (fName === "pass") {
			return { ...field, f_types: "password" };
		}
		if (fName === "user_address") {
			return { ...field, f_types: "json", f_show: 0 };
		}
		if (fName === "app_id") {
			const currentType = String(field?.f_types || "").trim().toLowerCase();
			const currentQuery = String(field?.f_cbo_query || "").trim();
			if (actorType === "dev") {
				const hasEditableCombo = currentType.includes("co") && !currentType.includes("ro");
				return {
					...field,
					f_types: hasEditableCombo ? field.f_types : "co",
					f_cbo_query: currentQuery || APP_ID_QUERY_JSON,
				};
			}
			const hasReadonlyCombo = currentType.includes("ro") && currentType.includes("co");
			return {
				...field,
				f_types: hasReadonlyCombo ? field.f_types : "co_ro",
				f_cbo_query: currentQuery || APP_ID_QUERY_JSON,
			};
		}
		if (fName === "parent_account_id") {
			const currentType = String(field?.f_types || "").trim().toLowerCase();
			if (currentType.includes("ro"))
				return field;
			return { ...field, f_types: "string_ro" };
		}
		if (fName === "permissionBitfield") {
			const currentType = String(field?.f_types || "").trim().toLowerCase();
			if (currentType.includes("ro"))
				return field;
			return { ...field, f_types: "string_ro" };
		}
		return field;
	});
}

function enforceLegacyReadonlyRoleFields(fields: any[]): any[] {
	if (!Array.isArray(fields))
		return fields;
	return fields.map((field) => {
		const fName = String(field?.f_name || "").trim();
		if (fName === "role_code") {
			const currentType = String(field?.f_types || "").trim().toLowerCase();
			if (currentType.includes("ro"))
				return field;
			return { ...field, f_types: "string_ro" };
		}
		if (fName === "permissionBitfield") {
			const currentType = String(field?.f_types || "").trim().toLowerCase();
			if (currentType.includes("ro"))
				return field;
			return { ...field, f_types: "string_ro" };
		}
		if (fName === "permissionSchemaVersion") {
			return { ...field, f_show: 0 };
		}
		if (fName === "login_version" || fName === "loginVersion") {
			return { ...field, f_show: 0 };
		}
		return field;
	});
}

function localizeRoleTableFields(
	fields: any[],
	t: (key: string) => string,
	tEn: (key: string) => string,
	tZh: (key: string) => string,
) {
	if (!Array.isArray(fields))
		return fields;
	// Full i18n key map for every field that can appear in a role / permission-group table
	const headerKeyMap: Record<string, string> = {
		role_code: "system.role.id",
		role_name: "system.role.name",
		description: "common.description",
		permissionPreset: "system.userPermission.fields.permissionPreset",
		permissions: "system.userPermission.fields.permissions",
		permissionsAdd: "system.userPermission.fields.permissionsAdd",
		permissionsDeny: "system.userPermission.fields.permissionsDeny",
		menusPermissions: "system.userPermission.fields.menusPermissions",
		menusPermissionsAdd: "system.userPermission.fields.menusPermissionsAdd",
		menusPermissionsDeny: "system.userPermission.fields.menusPermissionsDeny",
		dataScope: "system.userPermission.fields.dataScope",
		role_level: "system.userPermission.fields.roleLevel",
		branch_id: "system.userPermission.fields.branchId",
		dept_id: "system.userPermission.fields.deptId",
		department_id: "system.userPermission.fields.deptId",
		permissionBitfield: "system.userPermission.fields.permissionBitfield",
		status: "common.status",
		is_global: "system.dept.fields.isGlobal",
		create_time: "common.createTime",
		update_time: "common.updateTime",
	};
	// Fields that must always be hidden regardless of DB config
	const forceHiddenFields = new Set([
		"permissionSchemaVersion",
		"login_version",
		"loginVersion",
	]);
	return fields.map((field) => {
		const fName = String(field?.f_name || "").trim();
		if (forceHiddenFields.has(fName)) {
			return { ...field, f_show: 0 };
		}
		const key = headerKeyMap[fName];
		if (!key)
			return field;
		return {
			...field,
			f_header: t(key),
			f_header_vi: t(key),
			f_header_en: tEn(key),
			f_header_zh: tZh(key),
		};
	});
}

function localizeSystemUserTableFields(
	fields: any[],
	tVi: (key: string) => string,
	tEn: (key: string) => string,
	tZh: (key: string) => string,
) {
	if (!Array.isArray(fields)) {
		return fields;
	}
	const headerKeyMap: Record<string, string> = {
		username: "common.username",
		full_name: "common.fullName",
		email: "common.email",
		phoneNumber: "common.phoneNumber",
		app_id: "common.menu.apps",
		actived: "common.active",
	};
	return fields.map((field) => {
		const fName = String(field?.f_name || "").trim();
		const key = headerKeyMap[fName];
		if (!key) {
			return field;
		}
		return {
			...field,
			f_header: tVi(key),
			f_header_vi: tVi(key),
			f_header_en: tEn(key),
			f_header_zh: tZh(key),
		};
	});
}

function buildMenuFieldSignature(field: any) {
	if (!field || typeof field !== "object")
		return "";
	return JSON.stringify({
		f_name: field.f_name ?? "",
		f_types: field.f_types ?? "",
		f_show: field.f_show ?? "",
		f_header: field.f_header ?? "",
		f_header_vi: field.f_header_vi ?? "",
		f_header_en: field.f_header_en ?? "",
		f_header_zh: field.f_header_zh ?? "",
		f_cbo_query: field.f_cbo_query ?? "",
		f_options: Array.isArray(field.f_options) ? field.f_options : field.f_options ?? "",
	});
}

function buildMenuCompareSignature(menu: any): string {
	if (!menu || typeof menu !== "object")
		return "";
	const normalized = normalizeMenuRuntimeConfig(menu);
	const tableSignature = Array.isArray(normalized.table)
		? normalized.table.map(buildMenuFieldSignature)
		: [];
	return JSON.stringify({
		id: normalized.id ?? "",
		path: normalized.path ?? "",
		label: normalized.label ?? "",
		label_vi: normalized.label_vi ?? "",
		label_en: normalized.label_en ?? "",
		label_zh: normalized.label_zh ?? "",
		table_name: normalized.table_name ?? "",
		app_id: normalized.app_id ?? "",
		type_form: normalized.type_form ?? "",
		row_type_edit: normalized.row_type_edit ?? "",
		g_readonly: normalized.g_readonly ?? "",
		fieldsPK: Array.isArray(normalized?.struct?.fieldsPK) ? normalized.struct.fieldsPK : [],
		tableSignature,
	});
}

function areMenusEquivalent(left: any, right: any): boolean {
	return buildMenuCompareSignature(left) === buildMenuCompareSignature(right);
}

function buildDeptMenuFields(
	t: (key: string) => string,
	tEn: (key: string) => string,
	tZh: (key: string) => string,
) {
	return DEPT_MENU_FIELD_KEYS.map(field => ({
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
	return BRANCH_MENU_FIELD_KEYS.map(field => ({
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
	permissionOptions: Array<{ value: string, label: string }>,
	menuOptions: Array<{ value: string, label: string }>,
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
		{ f_name: "role_code", ...h("system.role.id"), f_show: 1, f_types: "string_ro", f_align: "left" },
		{ f_name: "role_name", ...h("system.role.name"), f_show: 1, f_types: "string", f_align: "left" },
		{ f_name: "description", ...h("common.description"), f_show: 1, f_types: "string", f_align: "left" },
		{ f_name: "permissionPreset", ...h("system.userPermission.fields.permissionPreset"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: presetOptionsQuery },
		{ f_name: "permissions", ...h("system.userPermission.fields.permissions"), f_show: 1, f_types: "multi_tag", f_align: "left", f_options: permissionOptions },
		{ f_name: "menusPermissions", ...h("system.userPermission.fields.menusPermissions"), f_show: 1, f_types: "menu_tree", f_align: "left", f_options: menuOptions },
		{ f_name: "dataScope", ...h("system.userPermission.fields.dataScope"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: dataScopeOptionsQuery },
		{ f_name: "role_level", ...h("system.userPermission.fields.roleLevel"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: ROLE_LEVEL_OPTIONS_JSON },
		{ f_name: "branch_id", ...h("system.userPermission.fields.branchId"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
		{ f_name: "dept_id", ...h("system.userPermission.fields.deptId"), f_show: 1, f_types: "co", f_align: "left", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
		{ f_name: "permissionBitfield", ...h("system.userPermission.fields.permissionBitfield"), f_show: 0, f_types: "string_ro", f_align: "left" },
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
	"dev": [
		"id",
		"username",
		"full_name",
		"email",
		"phoneNumber",
		"app_id",
		"pass",
		"actived",
	],
	"admin": [
		"id",
		"username",
		"full_name",
		"email",
		"phoneNumber",
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
		if (ia !== ib)
			return ia - ib;
		return String(a?.f_name || "").localeCompare(String(b?.f_name || ""));
	});

	return normalized;
}

function normalizeSysAppsFieldConfig(rawFields: any[]): any[] {
	if (!Array.isArray(rawFields) || rawFields.length === 0) {
		return rawFields;
	}
	return rawFields.map((field) => {
		const fName = String(field?.f_name || "").trim();
		if (fName !== "app_id") {
			return field;
		}
		const { f_cbo_query, f_options, ...rest } = field || {};
		return {
			...rest,
			// Use a non-generic text type so grid heuristics do not auto-convert app_id* to combo.
			f_types: "text",
		};
	});
}

/**
 * AdminPage - Renders dynamic grid/report based on menuId parameter
 * Integrates with layout tabbar system for tab-based navigation
 */
export default function AdminPage(props: any = {}) {
	const { menuId: routeMenuId } = useParams<{ menuId: string }>();
	// Prefer props passed from tab (stable per-tab identity), fallback to router param.
	// Do NOT use global activeTabKey/activeTab — they change on every tab switch and
	// would contaminate cached (KeepAlive) instances of AdminPage, triggering false mismatch warnings.
	const menuId = props.menuId || routeMenuId;
	const propMenuData = props.menuData || props.m_configs || null;
	const normalizedMenuSource = useMemo(() => {
		const candidates = [
			propMenuData?.path,
			propMenuData?.id,
			props.menuId,
			menuId,
		];
		return String(candidates.find(item => Boolean(item)) || "");
	}, [propMenuData?.path, propMenuData?.id, props.menuId, menuId]);
	const normalizedMenuKey = useMemo(
		() => normalizeSystemMenuKey(normalizedMenuSource),
		[normalizedMenuSource],
	);
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
	const isSystemUserRoute = normalizedMenuKey === "user";
	// Prefer logged-in user's app_id; fallback to selected app or localStorage default
	const appId = (userAppId && userAppId.trim()) || (currentAppId && currentAppId.trim()) || useAppStore.getState().getCurrentAppId();
	const { t, i18n } = useTranslation();
	const tVi = useMemo(() => i18n.getFixedT("vi-VN"), [i18n]);
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

		const actorPermissions = normalizeStringList(userPermissionsRaw).map(item => item.toLowerCase());
		const actorMenus = normalizeMenuTokens(userMenusPermissionsRaw).map(item => item.toLowerCase());
		const actorScope = normalizeScopeValue(runtimeDataScope);
		const permissionSet = new Set(actorPermissions);
		const menuSet = new Set(actorMenus);
		const allowAllMenus = hasLegacyFullAppScope(actorMenus, appId || "");

		const permissionOptions = PERMISSION_TOKEN_OPTIONS.filter((option) => {
			const value = String(option.value || "").trim().toLowerCase();
			if (!value || value === "dev" || value === "admin")
				return false;
			if (value.startsWith("scope:")) {
				const scope = normalizeScopeValue(value.replace("scope:", ""));
				return scopeRank(scope) <= scopeRank(actorScope);
			}
			return permissionSet.has(value);
		});

		const menuOptions = allowAllMenus
			? MENU_PERMISSION_OPTIONS
			: MENU_PERMISSION_OPTIONS.filter(option => tokenMatchesMenu(String(option.value || "").trim().toLowerCase(), menuSet));

		const scopeOptions = parseOptionsFromQuery(DATA_SCOPE_OPTIONS_JSON).filter((option) => {
			const scope = normalizeScopeValue(option?.value);
			if (scope === "NONE")
				return true;
			return scopeRank(scope) <= scopeRank(actorScope);
		});

		const presetOptions = parseOptionsFromQuery(ACTION_PRESET_OPTIONS_JSON).filter((option) => {
			const preset = String(option?.value || "").trim().toLowerCase();
			if (!preset)
				return true;
			const definition = PRESET_RULES[preset];
			if (!definition)
				return false;
			const permissionOk = definition.permissions.every((token) => {
				const value = token.toLowerCase();
				if (value === "dev" || value === "admin")
					return false;
				if (value.startsWith("scope:")) {
					const scope = normalizeScopeValue(value.replace("scope:", ""));
					return scopeRank(scope) <= scopeRank(actorScope);
				}
				return permissionSet.has(value);
			});
			if (!permissionOk)
				return false;
			if (allowAllMenus)
				return true;
			return definition.menus.every(menu => tokenMatchesMenu(menu.toLowerCase(), menuSet));
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
			id: base?.id || "user",
			path: base?.path || "/system/user",
			label: base?.label || t("common.menu.user"),
			label_en: base?.label_en || "System User Management",
			label_zh: base?.label_zh || "系统用户管理",
			table_name: actorTableName,
			app_id: base?.app_id || "csm",
			type_form: base?.type_form ?? 1,
			row_type_edit: base?.row_type_edit ?? 0,
			g_readonly: base?.g_readonly ?? false,
		}, actorMode, resolvedAppId, t, tEn, tZh);

		// Respect menu-declared field config for fixed system routes when provided.
		// Apply enrichment so special field types (menu_tree, multi_tag, checkbox, co)
		// survive even when DB-supplied fields carry only generic f_types.
		if (Array.isArray(base?.table) && base.table.length > 0) {
			runtimeConfig.table = enrichRequiredFieldConfigs(base.table, {
				app_id: { f_types: systemUserActorType === "dev" ? "co" : "co_ro", f_cbo_query: APP_ID_QUERY_JSON },
				pass: { f_types: "password" },
				user_address: { f_types: "json" },
				menusPermissions: { f_types: "menu_tree", f_options: MENU_PERMISSION_OPTIONS },
				menusPermissionsAdd: { f_types: "menu_tree", f_options: MENU_PERMISSION_OPTIONS },
				menusPermissionsDeny: { f_types: "menu_tree", f_options: MENU_PERMISSION_OPTIONS },
				permissions: { f_types: "multi_tag", f_options: PERMISSION_TOKEN_OPTIONS },
				permissionsAdd: { f_types: "multi_tag", f_options: PERMISSION_TOKEN_OPTIONS },
				permissionsDeny: { f_types: "multi_tag", f_options: PERMISSION_TOKEN_OPTIONS },
				permissionPreset: { f_types: "co", f_cbo_query: ACTION_PRESET_OPTIONS_JSON },
				dataScope: { f_types: "co", f_cbo_query: DATA_SCOPE_OPTIONS_JSON },
				branch_id: { f_types: "co", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
				dept_id: { f_types: "co", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
				actived: { f_types: "checkbox" },
				dev: { f_types: "checkbox" },
			});
		}
		runtimeConfig.table = enforceLegacyReadonlySystemUserFields(runtimeConfig.table, systemUserActorType);
		runtimeConfig.table = applyFriendlyFieldPolicy(actorTableName, runtimeConfig.table, systemUserActorType);
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
	}, [isSystemUserRoute, isDevUser, isAdminUser, t, tEn, tZh, appId, systemUserActorType, userPermissionsRaw, userMenusPermissionsRaw, runtimeDataScope]);

	const normalizeKnownSystemMenu = useCallback((menu: any = {}): any => {
		if (normalizedMenuKey === "role" || normalizedMenuKey === "roles") {
			const rawRoleTable = Array.isArray(menu?.table) && menu.table.length > 0
				? menu.table
				: buildRoleMenuFields(
					t,
					tEn,
					tZh,
					roleFieldConstraints.permissionOptions,
					roleFieldConstraints.menuOptions,
					roleFieldConstraints.presetOptionsQuery,
					roleFieldConstraints.dataScopeOptionsQuery,
				);
			const configuredTable = localizeRoleTableFields(enforceLegacyReadonlyRoleFields(enrichRequiredFieldConfigs(rawRoleTable, {
				menusPermissions: { f_types: "menu_tree", f_options: roleFieldConstraints.menuOptions },
				permissions: { f_types: "multi_tag", f_options: roleFieldConstraints.permissionOptions },
				permissionPreset: { f_types: "co", f_cbo_query: roleFieldConstraints.presetOptionsQuery },
				dataScope: { f_types: "co", f_cbo_query: roleFieldConstraints.dataScopeOptionsQuery },
				role_level: { f_types: "co", f_cbo_query: ROLE_LEVEL_OPTIONS_JSON },
				branch_id: { f_types: "co", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
				dept_id: { f_types: "co", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
				status: { f_types: "co", f_cbo_query: STATUS_OPTIONS_JSON },
				is_global: { f_types: "checkbox" },
			})), t, tEn, tZh);
			return normalizeMenuRuntimeConfig({
				...menu,
				id: menu?.id || "permission-group",
				path: menu?.path || `/system/${normalizedMenuKey}`,
				label: menu?.label || t("common.menu.permissionGroup"),
				app_id: menu?.app_id || appId,
				table_name: menu?.table_name || "csm_roles",
				type_form: menu?.type_form ?? 1,
				row_type_edit: menu?.row_type_edit ?? 0,
				g_readonly: menu?.g_readonly ?? false,
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

		if (normalizedMenuKey === "dept") {
			const rawDeptRoleTable = Array.isArray(menu?.table) && menu.table.length > 0
				? menu.table
				: buildRoleMenuFields(
					t,
					tEn,
					tZh,
					roleFieldConstraints.permissionOptions,
					roleFieldConstraints.menuOptions,
					roleFieldConstraints.presetOptionsQuery,
					roleFieldConstraints.dataScopeOptionsQuery,
				);
			const configuredTable = localizeRoleTableFields(enforceLegacyReadonlyRoleFields(enrichRequiredFieldConfigs(rawDeptRoleTable, {
				menusPermissions: { f_types: "menu_tree", f_options: roleFieldConstraints.menuOptions },
				permissions: { f_types: "multi_tag", f_options: roleFieldConstraints.permissionOptions },
				permissionPreset: { f_types: "co", f_cbo_query: roleFieldConstraints.presetOptionsQuery },
				dataScope: { f_types: "co", f_cbo_query: roleFieldConstraints.dataScopeOptionsQuery },
				role_level: { f_types: "co", f_cbo_query: ROLE_LEVEL_OPTIONS_JSON },
				branch_id: { f_types: "co", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
				dept_id: { f_types: "co", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
				status: { f_types: "co", f_cbo_query: STATUS_OPTIONS_JSON },
				is_global: { f_types: "checkbox" },
			})), t, tEn, tZh);
			return normalizeMenuRuntimeConfig({
				...menu,
				id: menu?.id || "permission-group",
				path: menu?.path || "/system/dept",
				label: menu?.label || t("common.menu.permissionGroup"),
				app_id: menu?.app_id || appId,
				table_name: menu?.table_name || "csm_roles",
				type_form: menu?.type_form ?? 1,
				row_type_edit: menu?.row_type_edit ?? 0,
				g_readonly: menu?.g_readonly ?? false,
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

		if (normalizedMenuKey === "departments") {
			const rawDeptTable = Array.isArray(menu?.table) && menu.table.length > 0 ? menu.table : buildDeptMenuFields(t, tEn, tZh);
			const configuredTable = enrichRequiredFieldConfigs(rawDeptTable, {
				branch_id: { f_types: "co", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
				status: { f_types: "co", f_cbo_query: STATUS_OPTIONS_JSON },
				is_global: { f_types: "checkbox" },
			});
			return normalizeMenuRuntimeConfig({
				...menu,
				id: menu?.id || "departments",
				path: menu?.path || "/system/departments",
				label: menu?.label || t("common.menu.dept"),
				label_vi: menu?.label_vi || t("common.menu.dept"),
				label_en: menu?.label_en || tEn("common.menu.dept"),
				label_zh: menu?.label_zh || tZh("common.menu.dept"),
				table_name: menu?.table_name || "csm_depts",
				app_id: menu?.app_id || appId,
				type_form: menu?.type_form ?? 1,
				row_type_edit: menu?.row_type_edit ?? 0,
				g_readonly: menu?.g_readonly ?? false,
				table: configuredTable,
				struct: {
					...(menu?.struct || {}),
					fieldsPK: ["id", "dept_code"],
				},
			});
		}

		if (normalizedMenuKey === "branches") {
			const rawBranchTable = Array.isArray(menu?.table) && menu.table.length > 0 ? menu.table : buildBranchMenuFields(t, tEn, tZh);
			const configuredTable = enrichRequiredFieldConfigs(rawBranchTable, {
				dept_id: { f_types: "co", f_cbo_query: DEPT_SELECT_QUERY_JSON },
				status: { f_types: "co", f_cbo_query: STATUS_OPTIONS_JSON },
				is_global: { f_types: "checkbox" },
			});
			return normalizeMenuRuntimeConfig({
				...menu,
				id: menu?.id || "branches",
				path: menu?.path || "/system/branches",
				label: menu?.label || t("common.menu.branch"),
				label_vi: menu?.label_vi || t("common.menu.branch"),
				label_en: menu?.label_en || tEn("common.menu.branch"),
				label_zh: menu?.label_zh || tZh("common.menu.branch"),
				table_name: menu?.table_name || "csm_branches",
				app_id: menu?.app_id || appId,
				type_form: menu?.type_form ?? 1,
				row_type_edit: menu?.row_type_edit ?? 0,
				g_readonly: menu?.g_readonly ?? false,
				table: configuredTable,
				struct: {
					...(menu?.struct || {}),
					fieldsPK: ["id", "branch_code"],
				},
			});
		}

		const rawLabel = menu?.label ?? menu?.label_vi ?? menu?.name ?? menu?.title ?? "";
		const normalizedLabel = typeof rawLabel === "string" ? rawLabel.replace(/^[\d.\s]+/, "").trim() : rawLabel;
		return normalizeMenuRuntimeConfig({
			...menu,
			...(normalizedLabel ? { label: normalizedLabel } : {}),
		});
	}, [normalizedMenuKey, t, tEn, tZh, appId, roleFieldConstraints]);

	const enforceCanonicalSystemRouteMenu = useCallback((rawMenu: any = {}): any => {
		const normalized = normalizeMenuRuntimeConfig(rawMenu || {});
		if (normalizedMenuKey === "role" || normalizedMenuKey === "roles") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: normalized.id || "permission-group",
				path: normalized.path || `/system/${normalizedMenuKey}`,
				table_name: normalized.table_name || "csm_roles",
				app_id: normalized.app_id || appId,
			});
		}
		if (normalizedMenuKey === "dept") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: normalized.id || "permission-group",
				path: normalized.path || "/system/dept",
				table_name: normalized.table_name || "csm_roles",
				app_id: normalized.app_id || appId,
			});
		}
		if (normalizedMenuKey === "user") {
			// QUY TẮC QUAN TRỌNG: Chỉ duy nhất user dev mới thao tác trên bảng chính (csm_accounts),
			// còn lại (admin, sub-user, user thường) luôn thao tác trên bảng con (csm_group_members).
			// Mọi thao tác thêm/sửa/xoá/xem đều chỉ tác động lên bảng con nếu không phải dev.
			const actorTableName = isDevUser ? "csm_accounts" : "csm_group_members";
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: normalized.id || "user",
				path: normalized.path || "/system/user",
				table_name: actorTableName,
				app_id: normalized.app_id || "csm",
			});
		}
		if (normalizedMenuKey === "departments") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: normalized.id || "departments",
				path: normalized.path || "/system/departments",
				table_name: normalized.table_name || "csm_depts",
				app_id: normalized.app_id || appId,
			});
		}
		if (normalizedMenuKey === "branches") {
			return normalizeMenuRuntimeConfig({
				...normalized,
				id: normalized.id || "branches",
				path: normalized.path || "/system/branches",
				table_name: normalized.table_name || "csm_branches",
				app_id: normalized.app_id || appId,
			});
		}
		return normalized;
	}, [normalizedMenuKey, isDevUser, appId]);

	const resolveDisplayLabel = useCallback((menu: any = {}): any => {
		const rawLabel = menu?.label ?? menu?.label_vi ?? menu?.name ?? menu?.title ?? "";
		return typeof rawLabel === "string" ? rawLabel.replace(/^[\d.\s]+/, "").trim() : rawLabel;
	}, []);

	const handleDataChange = useCallback(() => {
		setReloadTrigger(prev => prev + 1);
	}, []);

	// Refactor: Lấy menuData từ tab state hoặc menuId props, không dùng location.pathname
	useEffect(() => {
		if (propMenuData) {
			const roleAdjustedMenu = normalizedMenuKey === "user" ? buildUserMenuByRole(propMenuData) : propMenuData;
			const withLabel = normalizeKnownSystemMenu({
				...roleAdjustedMenu,
				label: resolveDisplayLabel(roleAdjustedMenu),
			});
			const canonicalMenu = enforceCanonicalSystemRouteMenu(withLabel);
			if (!areMenusEquivalent(canonicalMenu, menuData)) {
				setMenuData(canonicalMenu);
			}
			if (loading)
				setLoading(false);
			return;
		}

		// Ưu tiên lấy menuData từ tab state (store) nếu có
		const tabsStore = useTabsStore.getState();
		const activeTab = tabsStore.openTabs?.get?.(tabsStore.activeKey) as any;
		const menuDataFromTab = activeTab?.menuData || activeTab?.m_configs;
		if (menuDataFromTab) {
			const roleAdjustedMenu = normalizedMenuKey === "user" ? buildUserMenuByRole(menuDataFromTab) : menuDataFromTab;
			const withLabel = normalizeKnownSystemMenu({
				...roleAdjustedMenu,
				label: resolveDisplayLabel(roleAdjustedMenu),
			});
			const canonicalMenu = enforceCanonicalSystemRouteMenu(withLabel);
			if (!areMenusEquivalent(canonicalMenu, menuData)) {
				setMenuData(canonicalMenu);
			}
			if (loading)
				setLoading(false);
			return;
		}
		// Nếu không có, fallback lấy từ menuId param (cũ)
		const findMenuInTree = (menus: any[], targetId: string): any => {
			const normalizedTargetId = String(targetId || "").trim();
			const systemPathVariant = normalizedTargetId && !normalizedTargetId.startsWith("/")
				? `/system/${normalizedTargetId}`
				: normalizedTargetId;
			for (const menu of menus) {
				if (
					menu.id === normalizedTargetId
					|| menu.key === normalizedTargetId
					|| menu.path === normalizedTargetId
					|| menu.path === systemPathVariant
				) {
					return menu;
				}
				if (menu.children?.length) {
					const found = findMenuInTree(menu.children, targetId);
					if (found)
						return found;
				}
			}
			return null;
		};
		const targetId = menuId;
		if (targetId) {
			let found = apiWholeMenus.length > 0 ? findMenuInTree(apiWholeMenus, targetId) : null;
			// Fallback cho các menu hệ thống khi không tìm thấy hoặc thiếu table_name
			if (!found || !found.table_name) {
				const actorTableName = isDevUser ? "csm_accounts" : "csm_group_members";
				const fallbackMenuById: Record<string, any> = {
					user: {
						id: "user",
						path: "/system/user",
						label: t("common.menu.user"),
						table_name: actorTableName,
						app_id: "csm",
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					dept: {
						id: "permission-group",
						path: "/system/dept",
						label: t("common.menu.permissionGroup"),
						table_name: "csm_roles",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					role: {
						id: "permission-group",
						path: "/system/role",
						label: t("common.menu.permissionGroup"),
						table_name: "csm_roles",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					roles: {
						id: "permission-group",
						path: "/system/roles",
						label: t("common.menu.permissionGroup"),
						table_name: "csm_roles",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					departments: {
						id: "departments",
						path: "/system/departments",
						label: t("common.menu.dept"),
						table_name: "csm_depts",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					branches: {
						id: "branches",
						path: "/system/branches",
						label: t("common.menu.branch"),
						table_name: "csm_branches",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					routers: {
						id: "routers",
						path: "/system/routers",
						label: t("common.menu.routers"),
						table_name: "sys_la_routers",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					apps: {
						id: "apps",
						path: "/system/apps",
						label: t("common.menu.apps"),
						table_name: "sys_apps",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					"react-native": {
						id: "react-native",
						path: "/system/react-native",
						label: t("common.menu.reactNative"),
						table_name: "sys_reactnative",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
					reactnative: {
						id: "react-native",
						path: "/system/react-native",
						label: t("common.menu.reactNative"),
						table_name: "sys_reactnative",
						app_id: appId,
						type_form: 1,
						row_type_edit: 0,
						g_readonly: false,
					},
				};
				const fallback = fallbackMenuById[normalizedMenuKey];
				if (fallback)
					found = fallback;
			}
			if (found) {
				const roleAdjustedMenu = normalizedMenuKey === "user" ? buildUserMenuByRole(found) : found;
				const withLabel = normalizeKnownSystemMenu({
					...roleAdjustedMenu,
					label: resolveDisplayLabel(roleAdjustedMenu),
				});
				const canonicalMenu = enforceCanonicalSystemRouteMenu(withLabel);
				if (!areMenusEquivalent(canonicalMenu, menuData)) {
					setMenuData(canonicalMenu);
				}
				if (loading)
					setLoading(false);
			}
		}
		// Nếu không tìm thấy menuData thì không set lại liên tục
	}, [menuId, normalizedMenuKey, apiWholeMenus, menuData, loading, isDevUser, t, appId, buildUserMenuByRole, normalizeKnownSystemMenu, enforceCanonicalSystemRouteMenu, resolveDisplayLabel, propMenuData]);

	// Di chuyển hàm loadTableData ra ngoài useEffect để có thể tái sử dụng
	const loadTableData = async () => {
		const runtimeMenu = menuData ? normalizeMenuRuntimeConfig(menuData) : null;
		if (!runtimeMenu)
			return;

		const resolvedUserAppId = (appId && String(appId).trim()) || "csm";
		const TENANT_ORG_TABLES_LOAD = new Set(["csm_branches", "csm_depts", "csm_roles"]);
		const resolveTableAppId = (tableName: string): string => {
			if (isSystemUserRoute) {
				if (tableName === "csm_accounts")
					return "csm";
				if (tableName === "csm_group_members")
					return "csm";
			}
			// Org tables always use the logged-in user’s app_id, never the menu’s stored app_id.
			if (TENANT_ORG_TABLES_LOAD.has(tableName)) return resolvedUserAppId;
			return runtimeMenu.app_id || resolvedUserAppId;
		};

		const ensureSystemRouteTables = async () => {
			const schemaPath = SYSTEM_MENU_KEY_TO_SCHEMA_PATH[normalizedMenuKey];
			if (!schemaPath)
				return;
			const definitions = SYSTEM_ROUTE_TABLE_SCHEMAS[schemaPath] || [];
			if (definitions.length === 0)
				return;

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
				}
				catch {
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
		if (allMenuTables.size === 0)
			return;

		setDbLoading(true);
		setDbError(null);
		try {
			const tableList = Array.from(allMenuTables);
			const primaryTable = tableList[0];
			const primaryTableAppId = resolveTableAppId(primaryTable);
			const defaultFilter = {
				operator: "AND" as const,
				conditions: [{ field: "id", type: "like", value: "" }],
			};
			// Enforce child-user scope for all non-dev actors on /system/user.
			// This avoids missing backend guard when admin profile bits are not fully populated.
			const shouldRestrictSystemSubUsers = isSystemUserRoute && !isDevUser;
			const shouldRequestOnlyMySubusers = (tableName: string) => (
				shouldRestrictSystemSubUsers && tableName === "csm_group_members"
			);
			const ownerCandidates = new Set(
				userSubOwnerCandidates
					.map(value => String(value).trim().toLowerCase())
					.filter(Boolean),
			);
			const applySubuserOwnershipFilter = (tableName: string, inputRows: any[]) => {
				if (!shouldRequestOnlyMySubusers(tableName) || !Array.isArray(inputRows) || inputRows.length === 0) {
					return inputRows;
				}
				if (ownerCandidates.size === 0) {
					return inputRows;
				}

				const ownerFields = ["parent_account_id", "parent_id", "parent_user_id"];
				const hasOwnerField = inputRows.some((row: any) => ownerFields.some(field => row?.[field] != null && String(row[field]).trim() !== ""));
				if (!hasOwnerField) {
					return inputRows;
				}

				return inputRows.filter((row: any) => {
					for (const field of ownerFields) {
						const rawValue = row?.[field];
						if (rawValue == null)
							continue;
						const normalizedValue = String(rawValue).trim().toLowerCase();
						if (normalizedValue && ownerCandidates.has(normalizedValue)) {
							return true;
						}
					}
					return false;
				});
			};

			await ensureSystemRouteTables();

			const response = await getTableData<any>({
				app_id: (primaryTable === "csm_accounts" || primaryTable === "csm_group_members") ? "csm" : primaryTableAppId,
				obj_name: primaryTable,
				where: defaultFilter,
				...(shouldRequestOnlyMySubusers(primaryTable) ? { only_my_subusers: true } : {}),
			});

			const rawRows = response.rows || response.data || [];
			const rows = applySubuserOwnershipFilter(primaryTable, rawRows);
			const fieldsPK = response.fieldsPK || ["id"];
			const deduped = Array.from(
				new Map(
					rows.map((row: any, index: number) => {
						const compositeKey = (Array.isArray(fieldsPK) ? fieldsPK : ["id"])
							.map((field: string) => `${field}:${row?.[field] == null ? "" : String(row[field])}`)
							.join("|");
						const fallbackKey = row?.id != null ? `id:${String(row.id)}` : `index:${index}`;
						return [compositeKey.replace(/[|:]/g, "").trim() ? compositeKey : fallbackKey, row];
					}),
				).values(),
			);

			const newDatabase: Record<string, any> = {
				[primaryTable]: { rows: deduped, fieldsPK },
			};

			// If multiple tables are defined, load companion tables into database (for triggers/cbo_query)
			if (tableList.length > 1) {
				for (const t of tableList.slice(1)) {
					try {
						const tableAppId = resolveTableAppId(t);
						const tableFilter: any = JSON.parse(JSON.stringify(defaultFilter));
						const resT = await getTableData<any>({
							app_id: (t === "csm_accounts" || t === "csm_group_members") ? "csm" : tableAppId,
							obj_name: t,
							where: tableFilter,
							...(shouldRequestOnlyMySubusers(t) ? { only_my_subusers: true } : {}),
						});
						const rawRowsT = (resT as any).rows || (resT as any).data || [];
						const rowsT = applySubuserOwnershipFilter(t, rawRowsT);
						const pkT = (resT as any).fieldsPK || ["id"];
						newDatabase[t] = { rows: rowsT, fieldsPK: pkT };
						// ...existing code...
					}
					catch (e) {
						console.warn(`⚠️ Failed to load companion table ${t}:`, (e as any)?.message);
					}
				}
			}

			// Extract dependency tables from trigger config
			const dependencyTables = new Set<string>();
			if (runtimeMenu.trigger && typeof runtimeMenu.trigger === "object") {
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
						app_id: (depTable === "csm_accounts" || depTable === "csm_group_members") ? "csm" : tableAppId,
						obj_name: depTable,
						where: tableFilter,
						...(shouldRequestOnlyMySubusers(depTable) ? { only_my_subusers: true } : {}),
					});
					const rawDepRows = (depResponse as any).rows || (depResponse as any).data || [];
					const depRows = applySubuserOwnershipFilter(depTable, rawDepRows);
					const depFieldsPK = (depResponse as any).fieldsPK || ["id"];
					newDatabase[depTable] = { rows: depRows, fieldsPK: depFieldsPK };
					// ...existing code...
				}
				catch (depErr: any) {
					console.warn(`⚠️ Failed to load dependency table ${depTable}:`, depErr?.message);
				}
			}

			// Update both local state AND global store database
			setDatabase(newDatabase);

			// Update global store so CsmDynamicGrid can access the data
			const currentStoreDb = useAppStore.getState().getDatabase();
			useAppStore.getState().setDatabase({
				...currentStoreDb,
				...newDatabase,
			});
		}
		catch (err: any) {
			const msg = err?.message || "Failed to load table data";
			setDbError(msg);
			console.error("❌ Load table data failed:", err);
		}
		finally {
			setDbLoading(false);
		}
	};

	// Load table data from API when menuData changes
	useEffect(() => {
		loadTableData();
	}, [menuData?.table_name, appId, reloadTrigger, isSystemUserRoute, isAdminUser, userSubOwnerCandidates.join("|")]);

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

		i18n.on("languageChanged", handleLanguageChange);
		return () => {
			i18n.off("languageChanged", handleLanguageChange);
		};
	}, [i18n, menuData]);

	// Keep hook dependencies stable even before menu data is ready.
	const runtimeMenuData = menuData ? patchMenuI18n(normalizeMenuRuntimeConfig(menuData), t, tEn, tZh) : null;
	const runtimeTableNames = String(runtimeMenuData?.table_name || "")
		.split(",")
		.map(item => item.trim().toLowerCase())
		.filter(Boolean);
	const isSystemUserTableRuntime = runtimeTableNames.some(name => name === "csm_accounts" || name === "csm_group_members");
	// These organizational tables belong to each tenant — always use the logged-in user’s app_id.
	const TENANT_ORG_TABLES = new Set(["csm_branches", "csm_depts", "csm_roles"]);
	const isOrgTableRuntime = runtimeTableNames.some(name => TENANT_ORG_TABLES.has(name));
	const effectiveAppId = (isSystemUserRoute || isSystemUserTableRuntime)
		? "csm"
		: isOrgTableRuntime
			? appId
			: (runtimeMenuData?.app_id || appId);
	const typeForm = Number(runtimeMenuData?.type_form || 1);
	const expectedTableNames = (SYSTEM_MENU_KEY_TO_EXPECTED_TABLES[normalizedMenuKey] || []).map(item => item.toLowerCase());
	const currentTableName = String(runtimeMenuData?.table_name || "").trim();
	const currentTableNames = normalizeTableNames(runtimeMenuData?.table_name);
	const hasSystemMenuTableMismatch = expectedTableNames.length > 0 && currentTableNames.length > 0 && !currentTableNames.some(name => expectedTableNames.includes(name));

	useEffect(() => {
		if (!hasSystemMenuTableMismatch) {
			mismatchLogRef.current = "";
			return;
		}
		const currentKey = currentTableNames.join(",");
		const expectedKey = expectedTableNames.join(",");
		const mismatchKey = `${normalizedMenuKey}|${currentKey}|${expectedKey}|${String(runtimeMenuData?.id || "")}`;
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
	}, [hasSystemMenuTableMismatch, normalizedMenuKey, currentTableNames, expectedTableNames, runtimeMenuData?.id, runtimeMenuData?.label]);

	if (loading || dbLoading) {
		return (
			<div style={{ padding: 24, textAlign: "center" }}>
				<Spin size="large" />
				<p style={{ marginTop: 16, color: 'var(--ant-colorTextSecondary)' }}>
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

	const mismatchAlertNode = hasSystemMenuTableMismatch
		? (
			<Alert
				type="warning"
				showIcon
				message={t("system.menu.configMismatch.title") || "Menu configuration mismatch"}
				description={
					`${t("system.menu.configMismatch.desc") || "The current menu and table configuration are inconsistent."
					} menuId=${normalizedMenuKey || menuId}, table=${currentTableName}, expected=${expectedTableNames.join(" | ")}`
				}
				style={{ marginBottom: 12 }}
			/>
		)
		: null;

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

	// Legacy-compatible grid detection: some menus run as grid via trigger.load_db without table_name.
	const hasGridLikePayload = Boolean(
		runtimeMenuData.table_name
		|| (runtimeMenuData as any)?.trigger?.load_db
		|| typeForm === 1
		|| typeForm === 2,
	);
	// Báo cáo runtime legacy có thể vẫn có table_name để lấy dữ liệu/filter.
	// Vì vậy report_name + trigger.report_db phải được ưu tiên render báo cáo,
	// không để table_name kéo nhầm sang grid.
	const hasReportRuntimePayload = Boolean(
		String(runtimeMenuData.report_name || "").trim()
		&& (
			typeForm === 5
			|| String((runtimeMenuData as any)?.trigger?.report_db || "").trim()
		),
	);
	const isReportMode = hasReportRuntimePayload || (!!runtimeMenuData.report_name && !hasGridLikePayload);
	if (isReportMode) {
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

	// Render grid (including trigger-only menus without table_name)
	if (hasGridLikePayload) {
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
				|| (normalizedMenuKey ? `/system/${normalizedMenuKey}` : "")
				|| menuId
				|| "system-grid",
			).trim();
			const storedTypeForm = localStorage.getItem(`${menuStorageScope}:type_form`) ?? localStorage.getItem(`${menuId}:type_form`);
			const storedRowTypeEdit = localStorage.getItem(`${menuStorageScope}:row_type_edit`) ?? localStorage.getItem(`${menuId}:row_type_edit`);
			if (storedTypeForm === "" || storedTypeForm === "1" || storedTypeForm === "2") {
				typeForm = storedTypeForm as "" | 1 | 2;
			}
			if (storedRowTypeEdit === "0" || storedRowTypeEdit === "1") {
				rowTypeEdit = Number.parseInt(storedRowTypeEdit, 10) as 0 | 1;
			}
		}
		catch {
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
		const configuredTableFromMenu = Array.isArray(runtimeMenuData.table)
			? runtimeMenuData.table
				.filter((field: any) => field && typeof field === "object")
				.map((field: any) => ({ ...field }))
			: [];
		const hasConfiguredTableFields = configuredTableFromMenu.some((field: any) => String(field?.f_name || "").trim().length > 0);

		const m_configs = {
			id: runtimeMenuData.id,
			label: runtimeMenuData.label,
			table_name: runtimeMenuData.table_name,
			table: configuredTableFromMenu,
			trigger: runtimeMenuData.trigger || {},
			g_readonly: runtimeMenuData.g_readonly,
			table_pagesize: runtimeMenuData.table_pagesize,
			type_form: typeForm,
			row_type_edit: rowTypeEdit,
			struct: {
				...(runtimeMenuData.struct || {}),
				fieldsPK: database[runtimeMenuData.table_name]?.fieldsPK || runtimeMenuData.struct?.fieldsPK || ["id"],
			},
		};

		const runtimePath = String(runtimeMenuData.path || "").trim().toLowerCase();
		const candidateKeys = Array.from(new Set([
			normalizeSystemMenuKey(normalizedMenuKey),
			normalizeSystemMenuKey(menuId),
			normalizeSystemMenuKey((runtimeMenuData as any)?.id),
			normalizeSystemMenuKey(runtimePath),
		]));
		const runtimeTableNameLower = String(runtimeMenuData.table_name || "").trim().toLowerCase();
		const isThreeTargetMenus = candidateKeys.includes("routers")
			|| candidateKeys.includes("apps")
			|| candidateKeys.includes("react-native")
			|| runtimeTableNameLower === "sys_la_routers"
			|| runtimeTableNameLower === "sys_apps"
			|| runtimeTableNameLower === "sys_reactnative"
			|| runtimePath === "/routers"
			|| runtimePath === "/apps"
			|| runtimePath === "/react-native"
			|| runtimePath === "/system/routers"
			|| runtimePath === "/system/apps"
			|| runtimePath === "/system/react-native"
			|| runtimePath === "/system/grid/routers"
			|| runtimePath === "/system/grid/apps"
			|| runtimePath === "/system/grid/react-native";

		let appliedStrictThreeMenuSchema = false;
		if (isThreeTargetMenus) {
			const strictTableName = candidateKeys.includes("routers")
				? "sys_la_routers"
				: candidateKeys.includes("apps")
					? "sys_apps"
					: candidateKeys.includes("react-native")
						? "sys_reactnative"
						: runtimeTableNameLower === "sys_la_routers"
							? "sys_la_routers"
							: runtimeTableNameLower === "sys_apps"
								? "sys_apps"
								: runtimeTableNameLower === "sys_reactnative"
									? "sys_reactnative"
						: runtimePath.includes("routers")
							? "sys_la_routers"
							: runtimePath.includes("apps")
								? "sys_apps"
								: "sys_reactnative";

			const strictSchema = buildStrictThreeMenuSchema(strictTableName);
			if (strictSchema) {
				m_configs.table_name = strictTableName;
				m_configs.table = strictSchema as any;
				m_configs.type_form = 1;
				m_configs.row_type_edit = 0;
				appliedStrictThreeMenuSchema = true;
			}
		}

		// CHÍNH SÁCH CỐ ĐỊNH: Nếu menu DB đã có cấu hình cột, giữ nguyên tuyệt đối (không áp policy/fallback).
		if (!hasConfiguredTableFields && !appliedStrictThreeMenuSchema) {
			m_configs.table = configuredTableFromMenu;
		}

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
				const isKey = typeof rawHeader === "string" && rawHeader.includes(".");
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
			m_configs.table = fields as any;
		}

		if (runtimeMenuData.table_name === "csm_accounts" || runtimeMenuData.table_name === "csm_group_members") {
			m_configs.table = localizeSystemUserTableFields(m_configs.table as any[], tVi, tEn, tZh);
			m_configs.table = enforceLegacyReadonlySystemUserFields(m_configs.table as any[], systemUserActorType);
			m_configs.table = applyFriendlyFieldPolicy(runtimeMenuData.table_name, m_configs.table as any[], systemUserActorType);
		}
		// Bảng nhóm quyền (csm_roles): luôn ẩn các trường nội bộ và đảm bảo nhãn 3 ngôn ngữ đúng,
		// bất kể bảng đến từ config server hay được tự sinh từ dòng dữ liệu đầu tiên.
		if (runtimeMenuData.table_name === "csm_roles") {
			m_configs.table = localizeRoleTableFields(
				enforceLegacyReadonlyRoleFields(
					enrichRequiredFieldConfigs(m_configs.table as any[], {
						menusPermissions: { f_types: "menu_tree", f_options: roleFieldConstraints.menuOptions },
						permissions: { f_types: "multi_tag", f_options: roleFieldConstraints.permissionOptions },
						permissionPreset: { f_types: "co", f_cbo_query: roleFieldConstraints.presetOptionsQuery },
						dataScope: { f_types: "co", f_cbo_query: roleFieldConstraints.dataScopeOptionsQuery },
						role_level: { f_types: "co", f_cbo_query: ROLE_LEVEL_OPTIONS_JSON },
						branch_id: { f_types: "co", f_cbo_query: BRANCH_SELECT_QUERY_JSON },
						dept_id: { f_types: "co", f_cbo_query: DEPT_SELECT_QUERY_BY_BRANCH_JSON },
						status: { f_types: "co", f_cbo_query: STATUS_OPTIONS_JSON },
						is_global: { f_types: "checkbox" },
					}),
				),
				t,
				tEn,
				tZh,
			);
		}

		if (m_configs.table_name === "sys_apps") {
			m_configs.table = normalizeSysAppsFieldConfig(m_configs.table as any[]);
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
			const detailTablePatterns = ["_ct", "_detail", "_line", "_row", "_item"];
			const possibleDetailTables = allTables.filter(t =>
				detailTablePatterns.some(pattern => t === `${masterTableName}${pattern}` || t.startsWith(`${masterTableName}_`))
				&& t !== masterTableName,
			);

			// If found detail tables, auto-create nodes config
			if (possibleDetailTables.length > 0) {
				nodes = possibleDetailTables.map((tableName, idx) => ({
					id: tableName,
					table_name: tableName,
					label: t("common.detail", { index: idx + 1 }),
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
					},
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
