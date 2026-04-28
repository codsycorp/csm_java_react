// Cache for broadcast home auto_code per app_id
const broadcastHomeAutoCodeCache: Record<string, string | null> = {};

/**
 * Load auto_code for homepage (broadcast) for current app
 * p_name = 'broadcast_' + app_id, p_type = 0
 * Returns decrypted auto_code string or null
 */
export async function loadBroadcastHomeAutoCode(appIdParam: string): Promise<string | null> {
	if (!appIdParam) return null;
	if (broadcastHomeAutoCodeCache[appIdParam] !== undefined) {
		// Always return null if cached value is falsy
		return broadcastHomeAutoCodeCache[appIdParam] || null;
	}
	try {
		const response = await getTableData<any>({
			app_id: "csm",
			obj_name: "sys_autos",
			where: {
				operator: "AND",
				conditions: [
					{ field: "p_name", type: "eq", value: `broadcast_${appIdParam}` },
					{ field: "p_type", type: "eq", value: 0 },
				]
			}
		});
		const rows = (response as any)?.rows || (response as any)?.data || [];
		if (!rows.length) {
			broadcastHomeAutoCodeCache[appIdParam] = null;
			return null;
		}
		const decryptedCode = rows[0].p_code ? csmDecrypt(rows[0].p_code) : "";
		if (!decryptedCode) {
			broadcastHomeAutoCodeCache[appIdParam] = null;
			return null;
		}
		broadcastHomeAutoCodeCache[appIdParam] = decryptedCode;
		return decryptedCode;
	} catch (error) {
		console.warn("Failed to load broadcast home auto_code:", error);
		broadcastHomeAutoCodeCache[appIdParam] = null;
		return null;
	}
}
import type { MenuItemType } from "./types";
import { request } from "#src/utils";
import { handleTree } from "#src/utils";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { createTableStruct, getTableData } from "#src/components/csm-grid/CsmApi";
import { useUserStore } from "#src/store";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { toPermissionBigInt, isSuperPermissionProfile } from "#src/utils/permission-bitfield";

export * from "./types";

/**
 * Remove duplicate menu items from flat list
 * Keep first occurrence, remove subsequent occurrences by id
 */
function removeDuplicates(menus: MenuItemType[]): MenuItemType[] {
	const seen = new Set<string>();
	return menus.filter(item => {
		if (seen.has(item.id)) {
			console.warn(`Removing duplicate menu id: ${item.id}`);
			return false;
		}
		seen.add(item.id);
		return true;
	});
}

/**
 * Convert nodes field to children field for consistent tree structure
 * @param menuItem Menu item
 * @returns Converted menu item with children field
 */
// Memoization cache for normalizeMenuNodes
const _normalizeMenuNodesCache = new WeakMap<any, MenuItemType>();
function normalizeMenuNodes(menuItem: any, level = 0): MenuItemType {
	if (typeof menuItem !== "object" || menuItem === null) return menuItem;
	if (_normalizeMenuNodesCache.has(menuItem)) {
		return _normalizeMenuNodesCache.get(menuItem)!;
	}
	const normalized = { ...menuItem };
	// Sửa label: chỉ lấy phần sau dấu chấm cuối cùng nếu có
	if (typeof normalized.label === "string" && normalized.label.includes(".")) {
		const parts = normalized.label.split(".");
		normalized.label = parts[parts.length - 1].trim();
	}
	// Nếu không có label, thử lấy từ name
	if ((!normalized.label || normalized.label === "") && typeof normalized.name === "string" && normalized.name.includes(".")) {
		const parts = normalized.name.split(".");
		normalized.label = parts[parts.length - 1].trim();
	}
	// Convert nodes to children recursively
	if (normalized.nodes && Array.isArray(normalized.nodes)) {
		normalized.children = normalized.nodes.map((node: any) => normalizeMenuNodes(node, level + 1));
		delete normalized.nodes; // Remove nodes field
	}
	_normalizeMenuNodesCache.set(menuItem, normalized);
	return normalized;
}

/**
 * Flatten nested menu tree to flat list with parentId
 * @param menus Menu tree (nested with children)
 * @param parentId Parent ID for children
 * @returns Flat menu list with parentId
 */
function flattenMenuTree(menus: any[], parentId: string = ""): any[] {
	const result: any[] = [];
	
	menus.forEach(menu => {
		// Add current menu (remove children/nodes to avoid nested structure)
		const { children, nodes, ...flatMenu } = menu;
		// Use existing parentId if available, otherwise use parameter
		if (!flatMenu.parentId && parentId) {
			flatMenu.parentId = parentId;
		}
		result.push(flatMenu);
		
		// Recursively flatten children
		const childrenArray = children || nodes || [];
		if (childrenArray.length > 0) {
			const flattenedChildren = flattenMenuTree(childrenArray, menu.id);
			result.push(...flattenedChildren);
		}
	});
	
	return result;
}

/**
 * Build tree structure from flat menu list with parentId
 * @param flatMenus Menu list with parentId field
 * @param parentId Parent ID to filter by (empty string for root)
 * @returns Tree structure with children field
 */
function buildMenuTree(flatMenus: MenuItemType[], parentId: string = ""): MenuItemType[] {
	return flatMenus
		.filter(menu => (menu.parentId || "") === parentId)
		.map(menu => {
			const children = buildMenuTree(flatMenus, menu.id || "");
			return {
				...menu,
				children: children.length > 0 ? children : undefined
			};
		});
}

function asStringList(input: any): string[] {
	if (!Array.isArray(input)) return [];
	return input
		.map((item) => String(item || "").trim())
		.filter(Boolean);
}

function normalizeFieldName(field: any): string {
	return String(field?.f_name || field?.name || "").trim();
}

function normalizePrimaryKeys(keys: string[], fields: string[]): string[] {
	const uniqueKeys = Array.from(new Set(
		(keys || []).map((k) => String(k || "").trim()).filter(Boolean)
	));

	// System convention: every table has id and should be searchable by id.
	if (fields.includes("id")) {
		return ["id", ...uniqueKeys.filter((k) => k !== "id")];
	}

	if (uniqueKeys.length > 0) return uniqueKeys;
	if (fields.length > 0) return [fields[0]];
	return ["id"];
}

function pickPrimaryKeysFromMenu(menu: any, fields: string[]): string[] {
	const structPK = asStringList(menu?.struct?.fieldsPK);
	if (structPK.length > 0) return normalizePrimaryKeys(structPK, fields);

	const mConfigPK = asStringList(menu?.m_configs?.struct?.fieldsPK);
	if (mConfigPK.length > 0) return normalizePrimaryKeys(mConfigPK, fields);

	const tableFields = Array.isArray(menu?.table) ? menu.table : [];
	const fieldPk = tableFields
		.filter((f: any) => {
			const v = f?.f_pkid;
			return v === 1 || v === "1" || v === true || v === "true";
		})
		.map((f: any) => normalizeFieldName(f))
		.filter(Boolean);
	if (fieldPk.length > 0) return normalizePrimaryKeys(fieldPk, fields);

	return normalizePrimaryKeys([], fields);
}

function extractTableNamesFromMenu(menu: any): string[] {
	const raw = String(menu?.table_name || "").trim();
	if (!raw) return [];
	return Array.from(
		new Set(
			raw
				.split(",")
				.map((item) => String(item || "").trim())
				.filter(Boolean),
		),
	);
}

function buildStructFromMenu(menu: any): { tableName: string; struct: any }[] {
	const tableNames = extractTableNamesFromMenu(menu);
	if (tableNames.length === 0) return [];

	const tableFields = Array.isArray(menu?.table) ? menu.table : [];
	const fields: string[] = Array.from(new Set(
		tableFields
			.map((f: any) => normalizeFieldName(f))
			.filter(Boolean)
	));
	if (!fields.includes("id")) fields.unshift("id");

	const fieldsPK = pickPrimaryKeysFromMenu(menu, fields);
	fieldsPK.forEach((pk) => {
		if (!fields.includes(pk)) fields.push(pk);
	});
	if (fields.length === 0) fields.push("id");

	const fieldsSearch: string[] = Array.from(new Set(
		tableFields
			.filter((f: any) => {
				const v = f?.f_search;
				return v === 1 || v === "1" || v === true || v === "true";
			})
			.map((f: any) => normalizeFieldName(f))
			.filter(Boolean)
	));
	if (!fieldsSearch.includes("id")) fieldsSearch.unshift("id");

	const defaultValue: Record<string, any> = {};
	fields.forEach((name) => {
		defaultValue[name] = "";
	});

	const sharedStruct = {
		defaultValue,
		fieldsPK,
		fieldsSearch: fieldsSearch.length > 0 ? fieldsSearch : fields,
		fields,
	};

	return tableNames.map((tableName) => ({
		tableName,
		struct: sharedStruct,
	}));
}

// Tên ID được hệ thống dùng trong bảng "index" để lưu metadata quan trọng.
// Không được dùng làm table_name trong menu vì sẽ ghi đè metadata hệ thống.
const RESERVED_INDEX_IDS = new Set(["menu", "menuList", "menuR", "roleList", "accessRights", "menu_permissions"]);

function collectMenuStructs(menus: MenuItemType[]): Map<string, any> {
	const byTable = new Map<string, any>();

	const walk = (items: any[]) => {
		items.forEach((item) => {
			const candidates = buildStructFromMenu(item);
			candidates.forEach((candidate) => {
				// Bảo vệ: bỏ qua nếu table_name trùng với ID hệ thống trong index
				if (RESERVED_INDEX_IDS.has(candidate.tableName)) {
					console.warn(`[collectMenuStructs] Bỏ qua table_name="${candidate.tableName}" vì là tên hệ thống reserved.`);
					return;
				}
				const prev = byTable.get(candidate.tableName);
				if (!prev || (candidate.struct?.fields?.length || 0) > (prev?.fields?.length || 0)) {
					byTable.set(candidate.tableName, candidate.struct);
				}
			});

			if (Array.isArray(item?.children) && item.children.length > 0) walk(item.children);
			if (Array.isArray(item?.nodes) && item.nodes.length > 0) walk(item.nodes);
		});
	};

	walk(Array.isArray(menus) ? menus : []);
	return byTable;
}

const INDEX_TABLE_STRUCT = {
	defaultValue: {
		id: "",
		struct: "",
		data: "",
	},
	fieldsPK: ["id"],
	fieldsSearch: ["id"],
	fields: ["id", "struct", "data"],
};

async function ensureIndexTableStruct(appIdParam: string) {
	if (!appIdParam) return;
	await createTableStruct({
		app_id: appIdParam,
		obj_table: {
			id: "index",
			struct: INDEX_TABLE_STRUCT,
		},
	});
}

async function ensureMenuTableStructs(appIdParam: string, menus: MenuItemType[]) {
	if (!appIdParam || !Array.isArray(menus) || menus.length === 0) return;

	const tableStructMap = collectMenuStructs(menus);
	if (tableStructMap.size === 0) return;

	const CONCURRENCY = 6;
	const MAX_RETRY = 2;
	const pending = Array.from(tableStructMap.entries());
	const failedTables: string[] = [];

	const ensureOneTable = async (tableName: string, struct: any) => {
		let lastError: any = null;
		for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
			try {
				await createTableStruct({
					app_id: appIdParam,
					obj_table: {
						id: tableName,
						struct,
					},
				});
				return;
			} catch (error) {
				lastError = error;
				if (attempt < MAX_RETRY) {
					await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 250));
				}
			}
		}

		console.warn(`Failed to ensure table struct for ${appIdParam}.${tableName} after retries:`, lastError);
		failedTables.push(tableName);
	};

	for (let i = 0; i < pending.length; i += CONCURRENCY) {
		const chunk = pending.slice(i, i + CONCURRENCY);
		await Promise.all(chunk.map(([tableName, struct]) => ensureOneTable(tableName, struct)));
	}

	if (failedTables.length > 0) {
		console.warn(
			`[MenuStructSync] app=${appIdParam} synced=${pending.length - failedTables.length}/${pending.length}, failed=${failedTables.join(",")}`,
		);
	} else {
		console.info(`[MenuStructSync] app=${appIdParam} synced=${pending.length}/${pending.length}`);
	}
}

/**
 * Load auto setup menu (p_type = 0) from sys_autos for current app
 */
export async function loadAutoMenuItem(appIdParam: string): Promise<any | null> {
	try {
		const response = await getTableData<any>({
			app_id: "csm", // sys_autos is stored under app_id=csm
			obj_name: "sys_autos",
			where: {
				operator: "AND",
				conditions: [
					{ field: "p_name", type: "eq", value: appIdParam },
					{ field: "p_type", type: "eq", value: 0 },
				]
			}
		});

		const rows = (response as any)?.rows || (response as any)?.data || [];
		if (!rows.length) {
			return null;
		}

		const decryptedCode = rows[0].p_code ? csmDecrypt(rows[0].p_code) : "";
		if (!decryptedCode) {
			return null;
		}

		const autoMenu: any = {
			key: "/auto-setup",
			id: "auto",
			name: "menu.auto",
			label: "Cài đặt tự động",
			label_en: "Auto Setup",
			label_zh: "自动设置",
			path: "/auto-setup",
			m_icons: "fa fa-magic",
			menuType: 0,
			order: 1,
			auto_code: decryptedCode,
		};

		return autoMenu;
	} catch (error) {
		console.warn("Failed to load auto menu:", error);
		return null;
	}
}

// Parse menu struct or data from backend response
function parseMenuStructFromResponse(response: any): MenuItemType[] {
	if (!response?.rows || response.rows.length === 0) return [];

	let menuData: MenuItemType[] = [];
	const firstItem = response.rows[0];

	if (firstItem && typeof firstItem === "object") {
		if ("struct" in firstItem && firstItem.struct) {
			try {
				if (typeof firstItem.struct === "string") {
					const trimmedStruct = firstItem.struct.trim();

					if (trimmedStruct && !trimmedStruct.startsWith("{") && !trimmedStruct.startsWith("[")) {
						try {
							const decrypted = csmDecrypt(trimmedStruct);
							menuData = JSON.parse(decrypted);
						} catch (decryptError) {
							try {
								menuData = JSON.parse(firstItem.struct);
							} catch (parseError) {
								console.error("Failed to parse struct as JSON:", parseError, decryptError);
								menuData = [];
							}
						}
					} else {
						try {
							menuData = JSON.parse(firstItem.struct);
						} catch (parseError) {
							console.error("Failed to parse struct as JSON:", parseError);
							menuData = [];
						}
					}
				} else if (typeof firstItem.struct === "object") {
					if (Array.isArray(firstItem.struct)) {
						menuData = firstItem.struct as MenuItemType[];
					} else if (firstItem.struct) {
						menuData = [firstItem.struct] as MenuItemType[];
					}
				}
			} catch (error) {
				console.error("Unexpected error processing struct:", error);
				menuData = [];
			}
		} else if ("data" in firstItem && Array.isArray(firstItem.data)) {
			menuData = firstItem.data as MenuItemType[];
		} else if ("id" in firstItem) {
			menuData = [firstItem] as MenuItemType[];
		}
	}

	if (!Array.isArray(menuData)) return [];
	return menuData.map(menu => normalizeMenuNodes(menu));
}

/**
 * Recursively filter out auto-setup menu items (path="/auto-setup" or id="auto")
 */
function filterOutAutoMenu(items: MenuItemType[]): MenuItemType[] {
	return items
		.filter(item => (item.path || "") !== "/auto-setup" && (item.id || "") !== "auto")
		.map(item => {
			if (item.children && item.children.length > 0) {
				return {
					...item,
					children: filterOutAutoMenu(item.children as MenuItemType[])
				};
			}
			return item;
		});
}

// Load menu struct from backend for a specific app
async function loadMenuStruct(appIdParam: string): Promise<MenuItemType[]> {
	const payload = {
		app_id: appIdParam,
		obj_name: "index",
		e_where: {
			field: "id",
			type: "eq",
			value: "menu",
		},
	};

	const response = await request
		.post<any>("get-table-data", { json: payload, ignoreLoading: true })
		.json();

	return parseMenuStructFromResponse(response);
}

// Persist menu struct back to backend (create or update)
async function persistMenuStruct(appIdParam: string, menus: MenuItemType[], mode: "update" | "create" = "update") {
	const { csmEncrypt } = await import("#src/components/csm-grid/CsmCrypto");
	const payload = {
		app_id: appIdParam,
		obj_name: "index",
		command: mode,
		obj_update: {
			id: "menu",
			struct: csmEncrypt(JSON.stringify(menus)),
		},
		e_where: {
			field: "id",
			type: "eq",
			value: "menu",
		},
	};

	const req = mode === "create" ? request.post : request.put;
	return req<ApiResponse<string>>("update-table-data", {
		json: payload,
		ignoreLoading: true,
	}).json();
}

// Save full menu struct (create if missing, update otherwise)
export async function saveMenuStruct(appIdParam: string, menus: MenuItemType[]) {
	await ensureIndexTableStruct(appIdParam);

	let currentMenus: MenuItemType[] = [];
	try {
		currentMenus = await loadMenuStruct(appIdParam);
	} catch (error) {
		console.warn(`Failed to load menu struct for ${appIdParam}, fallback to create mode:`, error);
	}

	const mode: "update" | "create" = currentMenus.length === 0 ? "create" : "update";
	const saveResult = await persistMenuStruct(appIdParam, menus, mode);

	// Run create-table for menu-defined tables in background to avoid blocking menu save UX.
	void ensureMenuTableStructs(appIdParam, menus).catch((error) => {
		console.warn(`Background ensure menu table structs failed for ${appIdParam}:`, error);
	});

	return saveResult;
}

/* 获取导航菜单列表 (用于侧边栏) - 从 index 表中获取 id="menu" 的菜单配置 */
export async function fetchNavigationMenus(appIdParam?: string) {
	try {
		const targetAppId = appIdParam || "csm";
		const payload = {
			app_id: targetAppId,
			obj_name: "index",
			e_where: {
				field: "id",
				type: "eq",
				value: "menu"
			}
		};
		const response = await request.post<any>("get-table-data", { json: payload, ignoreLoading: true }).json();
		
		// Backend returns { rows: [...], id: "index" }
		// If the record has a data field, backend extracts it and puts items in rows
		// If the record doesn't have data field, backend puts the whole record in rows
		
		// Always compute menuData; if empty rows, keep [] and try auto fallback
		let menuData: MenuItemType[] = [];
		const hasRows = Array.isArray(response?.rows) && response.rows.length > 0;
		if (hasRows) {
			// Rows can be either:
			// 1. Array of menu items (if record.data was extracted)
			// 2. Array with one record object (if no data field)
			// Check if first item is a record with struct/data fields
			const firstItem = response.rows[0];
			if (firstItem && typeof firstItem === 'object' && 'struct' in firstItem) {
				// It's the record itself, extract struct
				if (firstItem.struct) {
					if (typeof firstItem.struct === 'string') {
						try {
							// Try to decrypt first if it looks encrypted
							const trimmedStruct = firstItem.struct.trim();
							if (trimmedStruct && !trimmedStruct.startsWith('{') && !trimmedStruct.startsWith('[')) {
								// Looks encrypted, try decrypt
								try {
									const decrypted = csmDecrypt(trimmedStruct);
									menuData = JSON.parse(decrypted);
								} catch {
									// Not encrypted, try parse directly
									try {
										menuData = JSON.parse(firstItem.struct);
									} catch {
										console.warn("Failed to parse menu struct:", firstItem.struct);
									}
								}
							} else {
								// Looks like JSON already, parse directly
								menuData = JSON.parse(firstItem.struct);
							}
						} catch {
							console.warn("Failed to parse menu struct:", firstItem.struct);
						}
					} else {
						menuData = firstItem.struct as MenuItemType[];
					}
				}
			} else if (firstItem && typeof firstItem === 'object' && 'data' in firstItem) {
				// It's the record with data field, extract data
				const data = firstItem.data;
				if (Array.isArray(data)) {
					menuData = data as MenuItemType[];
				}
			} else if (Array.isArray(response.rows) && response.rows.length > 0 && 'id' in response.rows[0]) {
				// rows contains menu items that were extracted from data field
				menuData = response.rows as MenuItemType[];
			} else {
				// rows contains the extracted menu items directly
				menuData = response.rows as MenuItemType[];
			}
		}
		
		// Ensure menuData is array
		if (!Array.isArray(menuData)) {
			menuData = menuData ? [menuData] : [];
		}

		// Always evaluate auto menu independently from index.menu existence.
		// If sys_autos has valid auto setup code for current app, inject it even when menuData is empty.
		try {
			const autoMenu = await loadAutoMenuItem(targetAppId);
			if (autoMenu) {
				const hasAuto = menuData.some(item => (item?.path || "") === "/auto-setup" || (item?.id || "") === "auto");
				if (!hasAuto) {
					menuData.push(autoMenu);
				}
			}
		} catch (autoErr) {
			console.warn("Failed to evaluate auto menu in navigation:", autoErr);
		}
		
		// Normalize nodes → children field for consistent tree structure
		menuData = menuData.map(item => normalizeMenuNodes(item));
		if (process.env.NODE_ENV !== 'production') {
			// Debug: log menuData after normalization
			// Only log for system menu
			if (menuData.some(item => item.path === '/system' || item.id === 'system')) {
				// Avoid logging large trees in production
				// eslint-disable-next-line no-console
				console.debug('[menu] Normalized menuData:', JSON.stringify(menuData, null, 2));
			}
		}
		
		// IMPORTANT: Keep tree structure intact - do NOT flatten
		// The tree will be rebuilt in permission.ts buildMenuTree() if needed
		// Flattening here and rebuilding in store causes menu items to be lost

		
		// 添加默认菜单项
		// 1. 所有程序都有首页
	const homeMenu: MenuItemType = {
		id: "home",
		name: "menu.home",
		label: "Trang chủ",
		path: "homepage",
		// Remove icon field - it's being rendered as text which breaks the UI
		// icon: "home",
		menuType: 0,
		order: -1 // 首页始终在最前
	};
	
	// 2. Admin 用户有系统管理菜单 - derive from current user state
	let isAdmin = false;
	let isDev = false;
	try {
		const userState = useUserStore.getState();
		const userRoles = Array.isArray(userState.roles) ? userState.roles : [];
		isDev = resolveDevFlag(userState.dev, userRoles);
		isAdmin = !isDev && isSuperPermissionProfile(toPermissionBigInt((userState as any).permissionBitfield));

	} catch (error) {
		console.warn("Failed to detect admin role from store:", error);
	}
	
	// Kiểm tra xem đã có System menu trong database chưa
	const existingSystemMenu = menuData.find(item => item.path === "/system" || item.id === "system");
	
	// Nếu chưa có và user là admin, thì inject menu System
	if (isAdmin && !isDev && !existingSystemMenu) {
		const systemMenu: MenuItemType = {
			id: "system",
			name: "menu.system",
			label: "Quản lý hệ thống",
			path: "/system",
			// Remove icon field - it's being rendered as text which breaks the UI
			// icon: "setting",
			menuType: 0,
			order: 9999, // 系统管理始终在最后
		};
		
		// Add system menu first
		menuData.push(systemMenu);
		
		// Then add children as separate items with parentId
		menuData.push({
			id: "system-user",
			name: "menu.system.user",
			label: "Quản lý người dùng",
			path: "/system/user",
			type: "system",
			// Remove icon field - it's being rendered as text which breaks the UI
			// icon: "user",
			menuType: 0,
			parentId: "system",
		});
		menuData.push({
			id: "system-dept",
			name: "menu.system.dept",
			label: "Quản lý phòng ban",
			path: "/system/dept",
			type: "system",
			// icon: "department",
			menuType: 0,
			parentId: "system",
		});
	}
	
	// Only show home menu if broadcast home auto_code exists for this app
	const broadcastHomeCode = await loadBroadcastHomeAutoCode(targetAppId);
	if (broadcastHomeCode) {
		// Add home if not already present
		const hasHome = menuData.some(item => item.path === "/" || item.path === "homepage" || item.id === "home");
		if (!hasHome) {
			menuData.unshift(homeMenu);
		}
	} else {
		// Remove any home menu item (even if stored in DB)
		menuData = menuData.filter(item => item.path !== "/" && item.path !== "homepage" && item.id !== "home");
	}
	
	// Convert nodes to children for consistent tree structure
	menuData = menuData.map(menu => normalizeMenuNodes(menu));
	
	// Build tree when any item uses parentId. To avoid losing existing nested children,
	// first flatten the current tree, then rebuild strictly from parentId.
	const hasParentId = menuData.some(item => item.parentId !== undefined && item.parentId !== null && item.parentId !== "");
	const hasChildren = menuData.some(item => Array.isArray(item.children) && item.children.length > 0);
	let menuDataWithChildren: MenuItemType[];
	if (hasParentId) {
		const flattened = flattenMenuTree(menuData);
		menuDataWithChildren = buildMenuTree(flattened);
	} else {
		menuDataWithChildren = menuData;
	}
	
	// Log tree structure for debugging

	menuDataWithChildren.forEach(item => {
		const childCount = item.children?.length || 0;

		if (item.children?.length) {
			item.children.forEach(child => {

			});
		}
	});
	
	return {
		result: {
			list: menuDataWithChildren,
			total: menuDataWithChildren.length,
			current: 1
		}
	};
	} catch (error) {
		console.error("Error fetching navigation menus:", error);
		return { result: { list: [], total: 0, current: 0 } };
	}
}

/* 获取应用列表 */
export async function fetchAppList() {
	const payload = {
		app_id: "csm",
		obj_name: "sys_apps",
		e_where: {
			field: "app_id",
			type: "like",
			value: "",
		},
	};
	const response = await request.post<any>("get-table-data", { json: payload, ignoreLoading: true }).json();
	
	// Backend returns { rows: [...], id: "sys_apps" }
	const appList = response?.rows || [];
	
	return {
		code: 200,
		success: true,
		message: "ok",
		result: {
			list: appList,
			total: Array.isArray(appList) ? appList.length : 0,
			pageSize: 10,
			current: 1
		}
	};
}

/* 获取菜单列表 - 根据 app_id 加载菜单，从 index 表查询 id="menu" */
export async function fetchMenuList(appIdParam?: string) {
	if (!appIdParam) {
		console.warn("appIdParam is required for fetchMenuList");
		return {
			code: 200,
			success: true,
			message: "ok",
			result: {
				list: [],
				total: 0,
				pageSize: 10,
				current: 1
			}
		};
	}

	try {
		let menuData = await loadMenuStruct(appIdParam);

		// IMPORTANT: Remove /auto-setup menu from editor view
		// /auto-setup is a global framework feature (not per-app), loaded from sys_autos
		// It should not appear in the menu admin editor, only in runtime sidebar
		menuData = filterOutAutoMenu(menuData);

		return {
			code: 200,
			success: true,
			message: "ok",
			result: {
				list: menuData,
				total: menuData.length,
				pageSize: 10,
				current: 1
			}
		};
	} catch (error) {
		console.error(`Error fetching menu for app_id=${appIdParam}:`, error);
		return {
			code: 200,
			success: true,
			message: "ok",
			result: {
				list: [],
				total: 0,
				pageSize: 10,
				current: 1
			}
		};
	}
}

/* 获取单个菜单项详情 - 根据 menuId 从已加载的菜单数据中查询 */
function findMenuItemById(menuList: MenuItemType[], menuId: string): MenuItemType | null {
	for (const item of menuList) {
		if (item.id === menuId) {
			return item;
		}
		if (item.children && item.children.length > 0) {
			const found = findMenuItemById(item.children as MenuItemType[], menuId);
			if (found) {
				return found;
			}
		}
	}
	return null;
}

export async function fetchMenuItemDetail(menuId: string, appIdParam?: string): Promise<MenuItemType | null> {
	if (!appIdParam) {
		console.warn("appIdParam is required for fetchMenuItemDetail");
		return null;
	}

	try {
		const menuData = await loadMenuStruct(appIdParam);
		return findMenuItemById(menuData, menuId);
	} catch (error) {
		console.error(`Error fetching menu item detail for id=${menuId}:`, error);
		return null;
	}
}

/* 新增菜单 */
export async function fetchAddMenuItem(data: MenuItemType, appIdParam?: string) {
	if (!appIdParam) {
		console.warn("appIdParam is required for fetchAddMenuItem");
		return {
			code: 400,
			success: false,
			message: "App ID is required",
			result: ""
		};
	}

	try {
		const currentMenus = await loadMenuStruct(appIdParam);
		// Replace existing item with same id to avoid duplicates
		const filtered = currentMenus.filter(item => item.id !== data.id);
		filtered.push({ ...data });
		return await persistMenuStruct(appIdParam, filtered, currentMenus.length === 0 ? "create" : "update");
	} catch (error) {
		console.error(`Failed to add menu item for app_id=${appIdParam}:`, error);
		return {
			code: 500,
			success: false,
			message: String(error),
			result: ""
		};
	}
}

/* 修改菜单 */
export async function fetchUpdateMenuItem(data: MenuItemType, appIdParam?: string) {
	if (!appIdParam) {
		console.warn("appIdParam is required for fetchUpdateMenuItem");
		return {
			code: 400,
			success: false,
			message: "App ID is required",
			result: ""
		};
	}

	try {
		const currentMenus = await loadMenuStruct(appIdParam);
		console.log("Current menus loaded:", currentMenus);
		let found = false;
		const updated = currentMenus.map(item => {
			if (item.id?.trim() === data.id?.trim()) {
				found = true;
				console.log("Updating menu", data.id, "old parentId:", item.parentId, "new parentId:", data.parentId);
				return { ...item, ...data, parentId: data.parentId?.trim() || "" };
			}
			return item;
		});
		if (!found) {
			console.log("Menu not found, adding new", data.id, "with parentId:", data.parentId);
			updated.push({ ...data, parentId: data.parentId?.trim() || "" });
		}
		console.log("Updated menus:", updated);
		// Flatten to ensure consistent structure
		const flattened = flattenMenuTree(updated);
		console.log("Flattened menus:", flattened);
		// Remove duplicates to avoid issues
		const deduped = removeDuplicates(flattened);
		console.log("Deduped menus:", deduped);
		return await persistMenuStruct(appIdParam, deduped, currentMenus.length === 0 ? "create" : "update");
	} catch (error) {
		console.error(`Failed to update menu item for app_id=${appIdParam}:`, error);
		return {
			code: 500,
			success: false,
			message: String(error),
			result: ""
		};
	}
}

/* 删除菜单 */
export async function fetchDeleteMenuItem(id: string, appIdParam?: string) {
	if (!appIdParam) {
		console.warn("appIdParam is required for fetchDeleteMenuItem");
		return {
			code: 400,
			success: false,
			message: "App ID is required",
			result: ""
		};
	}

	try {
		const currentMenus = await loadMenuStruct(appIdParam);
		const prune = (items: MenuItemType[], target: string): MenuItemType[] => {
			return items
				.filter(item => item.id !== target)
				.map(item => {
					const children = item.children ? prune(item.children, target) : undefined;
					const next: MenuItemType = { ...item };
					if (children && children.length > 0) {
						next.children = children;
					} else {
						delete next.children;
					}
					return next;
				});
		};

		const nextMenus = prune(currentMenus, id);
		return await persistMenuStruct(appIdParam, nextMenus, currentMenus.length === 0 ? "create" : "update");
	} catch (error) {
		console.error(`Failed to delete menu item for app_id=${appIdParam}:`, error);
		return {
			code: 500,
			success: false,
			message: String(error),
			result: ""
		};
	}
}
