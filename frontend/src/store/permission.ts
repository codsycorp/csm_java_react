import type { MenuItemType } from "#src/layout/layout-menu/types";
import type { AppRouteRecordRaw } from "#src/router/types";
import type { MenuItemType as ApiMenuItemType } from "#src/api/system/menu";

import { fetchAsyncRoutes } from "#src/api/user";
import { fetchNavigationMenus } from "#src/api/system/menu";
import { router } from "#src/router";
import { ROOT_ROUTE_ID } from "#src/router/constants";
import { rootChildRoutes, routes } from "#src/router/routes";
import { addAsyncRoutes, ascending, flattenRoutes, getMenuItems } from "#src/router/utils";
import { useAppStore } from "./app";
import { useUserStore } from "./user";
import { create } from "zustand";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { getTableData, type Where } from "#src/components/csm-grid/CsmApi";

/**
 * 将平面的 API 菜单列表转换为树形结构的布局菜单格式
 * 支持两种格式：
 * 1. 基于 parentId 的平面列表
 * 2. 基于 nodes 字段的已有树形结构
 */

/**
 * 从菜单标签中移除前缀（只保留最后一个点之后的内容）
 * @param label 原始标签，例如 "B.01. Quản Lý Người Dùng" 或 "01.19. Báo Cáo" 或 "A. Cài Đặt"
 * @returns 清理后的标签，例如 "Quản Lý Người Dùng" 或 "Báo Cáo" 或 "Cài Đặt"
 */
function stripMenuPrefixFromLabel(label: string): string {
	if (!label || typeof label !== 'string') {
		return label;
	}
	
	// 移除所有开头的 "数字/字母.数字. " 或 "字母. " 等前缀
	// 只保留最后一个点之后的内容
	// 例如: "B.01. Quản Lý" → "Quản Lý"
	//      "01.19. Báo Cáo" → "Báo Cáo"
	//      "A. Cài Đặt" → "Cài Đặt"
	//      "01.02.03. Test" → "Test"
	return label.replace(/^.*?\.\s+/, '').trim();
}

/**
 * 从平面菜单列表（带 parentId）构建树形结构
 * @param flatMenus 平面的菜单列表
 * @param parentId 当前父菜单的 ID（用于递归）
 * @returns 树形结构的菜单列表
 */
function buildMenuTree(flatMenus: ApiMenuItemType[], parentId: string = ""): ApiMenuItemType[] {
	const result = flatMenus
		.filter(menu => (menu.parentId || "") === parentId)
		.map(menu => {
			const children = buildMenuTree(flatMenus, menu.id || "");
			return {
				...menu,
				children: children.length > 0 ? children : undefined
			};
		});
	
	// ...existing code...
	
	return result;
}

function normalizeAccessKey(raw: unknown): string {
	if (raw == null) return "";
	return String(raw).trim().toLowerCase();
}

function buildAllowedPathSet(routesForMenu: AppRouteRecordRaw[]): Set<string> {
	const pathSet = new Set<string>();
	const flat = flattenRoutes(routesForMenu);
	Object.values(flat).forEach((route: any) => {
		const path = typeof route?.path === "string" ? route.path.trim() : "";
		if (!path || !path.startsWith("/")) return;
		pathSet.add(path.toLowerCase());
	});
	return pathSet;
}

function isLegacyAppScopeToken(token: string, appId: string): boolean {
	if (!token) return false;
	const appKey = normalizeAccessKey(appId);
	if (!appKey) return false;
	return token === appKey || token === `app:${appKey}` || token === `/${appKey}`;
}

function isMenuAllowedByLegacyAccess(menu: any, allowedKeys: Set<string>, allowedPaths: Set<string>): boolean {
	const path = normalizeAccessKey(menu?.path || menu?.key);
	const id = normalizeAccessKey(menu?.id);
	const name = normalizeAccessKey(menu?.name);

	if (path && allowedPaths.has(path)) return true;
	if (path && allowedKeys.has(path)) return true;
	if (id && allowedKeys.has(id)) return true;
	if (name && allowedKeys.has(name)) return true;

	return false;
}

function filterMenuTreeByLegacyAccess(items: any[], allowedKeys: Set<string>, allowedPaths: Set<string>): any[] {
	return (items || []).reduce((acc: any[], item: any) => {
		const filteredChildren = item?.children && item.children.length > 0
			? filterMenuTreeByLegacyAccess(item.children, allowedKeys, allowedPaths)
			: undefined;
		const selfAllowed = isMenuAllowedByLegacyAccess(item, allowedKeys, allowedPaths);
		const hasChildren = !!(filteredChildren && filteredChildren.length > 0);
		if (!selfAllowed && !hasChildren) return acc;

		acc.push({
			...item,
			children: hasChildren ? filteredChildren : undefined,
		});
		return acc;
	}, []);
}

/**
 * Load all database tables from menu tree structure
 * @param menuTree API menu tree
 * @param appId Current app ID
 */
async function loadDatabaseFromMenus(menuTree: ApiMenuItemType[], appId: string): Promise<void> {
	// Collect all unique table names from menu tree
	const tableNames = new Set<string>();
	
	function collectTableNames(menus: ApiMenuItemType[]) {
		menus.forEach(menu => {
			if (menu.table_name) {
				// table_name can be comma-separated: "table1,table2,table3"
				const tables = menu.table_name.split(/,/g).filter(t => t.trim() !== "");
				tables.forEach(t => tableNames.add(t.trim()));
			}
			if (menu.children && menu.children.length > 0) {
				collectTableNames(menu.children);
			}
		});
	}
	
	collectTableNames(menuTree);
	
	
	// Default WHERE condition to get all rows
	const defaultWhere: Where = {
		operator: "AND",
		conditions: [{ field: "id", type: "like", value: "" }]
	};
	
	// Load all tables in parallel
	const loadPromises = Array.from(tableNames).map(async (tableName) => {
		try {
			const res = await getTableData<any>({
				app_id: appId,
				obj_name: tableName,
				where: defaultWhere,
			});
			
			const rows = res?.rows || [];
			
			// Store in AppStore
			useAppStore.getState().setTableData(tableName, {
				id: tableName,
				rows,
				app_id: appId,
			});
		} catch (error) {
		}
	});
	
	await Promise.all(loadPromises);
}

export function transformApiMenusToLayoutMenus(apiMenus: (ApiMenuItemType & { children?: MenuItemType[] })[]): MenuItemType[] {
	const result: MenuItemType[] = [];

	apiMenus.forEach((apiMenu) => {
		// Skip auto-setup menu when no auto_code is provided
		const maybeAutoPath = (apiMenu.path || "").toLowerCase();
		const maybeAutoId = (apiMenu.id || "").toLowerCase();
		const maybeAutoName = (apiMenu.name || "").toLowerCase();
		const autoCode = (apiMenu as any).auto_code;
		const isAutoMenu = maybeAutoPath === "/auto-setup" || maybeAutoId === "auto" || maybeAutoName.includes("auto");
		if (isAutoMenu && (!autoCode || String(autoCode).trim() === "")) {
			return; // do not include this menu item
		}
		// ONLY preserve fields that Ant Design Menu understands or app logic needs
		// DO NOT spread all API fields - this prevents unwanted rendering
		const menuItem: any = {
			// Ant Design Menu fields
			key: apiMenu.path || apiMenu.id || "",
			// Use original label (will be translated in translateMenus)
			label: stripMenuPrefixFromLabel(apiMenu.label || apiMenu.name || ""),
			disabled: apiMenu.status === 0 || apiMenu.m_show === false,
			
			// Preserve multilingual labels for use during rendering
			label_en: apiMenu.label_en ? stripMenuPrefixFromLabel(apiMenu.label_en) : undefined,
			label_zh: apiMenu.label_zh ? stripMenuPrefixFromLabel(apiMenu.label_zh) : undefined,
			
			// Only include icon if it's a React component, not a string
			// String icon names will be rendered as text and break the UI
			// So we skip the icon field entirely for safety
			
			// Preserve these fields for app logic (NOT for rendering)
			id: apiMenu.id,
			path: apiMenu.path,
			table_name: apiMenu.table_name,
			report_name: apiMenu.report_name,
			table: apiMenu.table,
			trigger: apiMenu.trigger,
			config: apiMenu.config,
			crm_config: (apiMenu as any).crm_config,
			type_menu: apiMenu.type_menu,
			type_form: apiMenu.type_form,
			row_type_edit: apiMenu.row_type_edit,
			m_show: apiMenu.m_show,
			status: apiMenu.status,
			hideInMenu: apiMenu.hideInMenu,
			keepAlive: apiMenu.keepAlive,
			currentActiveMenu: apiMenu.currentActiveMenu,
			iframeLink: apiMenu.iframeLink,
			externalLink: apiMenu.externalLink,
			prefix_pk: apiMenu.prefix_pk,
			p_width: apiMenu.p_width,
			p_height: apiMenu.p_height,
			orientation: apiMenu.orientation,
			g_readonly: apiMenu.g_readonly,
			field_root: apiMenu.field_root,
			auto_code: (apiMenu as any).auto_code,
		};

		// Recursively transform children
		if (apiMenu.children && apiMenu.children.length > 0) {
			menuItem.children = transformApiMenusToLayoutMenus(apiMenu.children as any);
		}

		result.push(menuItem);
	});

	return result;
}

interface InitialStateType {
	// 静态路由生成的菜单
	constantMenus: MenuItemType[]
	// 静态路由（前端）和动态路由（后端）生成的菜单
	wholeMenus: MenuItemType[]
	// API 返回的原始菜单数据（保留 table_name, report_name 等自定义字段）
	apiWholeMenus: ApiMenuItemType[]
	// 有权限的 React Router 路由
	routeList: AppRouteRecordRaw[]
	// 扁平化后的路由，路由 id 作为索引 key
	flatRouteList: Record<string, AppRouteRecordRaw>
	// 表示 hasFetchedDynamicRoutes 是否被请求过
	hasFetchedDynamicRoutes: boolean
}
const initialState: InitialStateType = {
	constantMenus: [],
	wholeMenus: [],
	apiWholeMenus: [],
	routeList: rootChildRoutes,
	flatRouteList: flattenRoutes(rootChildRoutes),
	hasFetchedDynamicRoutes: false,
};

type PermissionState = typeof initialState;

interface PermissionAction {
	handleAsyncRoutes: (appIdParam?: string) => Promise<InitialStateType>
	applyAsyncRoutesFromLogin: (routesFromLogin: AppRouteRecordRaw[], appIdParam?: string, devFlag?: boolean) => Promise<InitialStateType>
	reset: () => void
};

export const usePermissionStore = create<PermissionState & PermissionAction>(set => ({
	...initialState,

	handleAsyncRoutes: async (appIdParam?: string) => {
		const { result } = await fetchAsyncRoutes();
		// 为动态路由添加前端组件
		const dynamicRoutes = addAsyncRoutes(result);
		const newRoutes = ascending([...rootChildRoutes, ...dynamicRoutes]);

		const constantMenus = getMenuItems((router.routes[0].children || []) as AppRouteRecordRaw[]);

		/* 添加动态路由到前端根路由 */
		router.patchRoutes(ROOT_ROUTE_ID, dynamicRoutes);

		const flatRouteList = flattenRoutes(newRoutes);

		// Dev flag to decide whether to keep system menus
		const userState = useUserStore.getState();
		const isDev = resolveDevFlag(userState.dev, userState.roles);
		const isAdmin = !isDev && (userState.roles || []).some(r => r.trim().toLowerCase() === 'admin');
		// Nếu dev, bỏ roles trên nhánh /system để giữ đầy đủ menu hệ thống
		// Nếu admin, chỉ giữ sub-menus có roles chứa 'admin'
		const routesForMenu = (isDev
			? newRoutes.map(r => r.path === "/system"
				? {
					...r,
					children: (r.children || []).map(c => ({
						...c,
						handle: { ...(c as any).handle, roles: undefined }
					})),
				}
				: r)
			: isAdmin
				? newRoutes.map(r => r.path === "/system"
					? {
						...r,
						children: (r.children || [])
							.filter(c => {
								const childRoles: string[] | undefined = (c as any).handle?.roles;
								return !childRoles || childRoles.includes('admin');
							})
							.map(c => ({ ...c, handle: { ...(c as any).handle, roles: undefined } })),
					}
					: r)
				: newRoutes) as AppRouteRecordRaw[];

		let routeMenus: MenuItemType[] = getMenuItems(routesForMenu);
		const homeMenu = routeMenus.find(m => m.key === "/home");
		const systemMenusFromRoute = routeMenus.filter(m => m.key === "/system");
		let wholeMenus: MenuItemType[] = [];
		let apiWholeMenus: ApiMenuItemType[] = [];
		try {
			// 获取当前应用 ID - 优先使用登录用户 app_id，其次参数，再次 store
			const effectiveAppId = (appIdParam || "").trim()
				|| (useUserStore.getState().app_id || "").trim()
				|| useAppStore.getState().getCurrentAppId();
			const userMenusPermissions = Array.isArray(userState.menusPermissions) ? userState.menusPermissions : [];
			const normalizedMenuTokens = userMenusPermissions.map(normalizeAccessKey).filter(Boolean);
			const hasLegacyAppOnly = normalizedMenuTokens.length > 0
				&& normalizedMenuTokens.every(token => isLegacyAppScopeToken(token, effectiveAppId));
			const explicitAllowedKeys = new Set(
				normalizedMenuTokens.filter(token => !isLegacyAppScopeToken(token, effectiveAppId))
			);
			const shouldBypassMenuFilter = isDev || hasLegacyAppOnly || (isAdmin && explicitAllowedKeys.size === 0);
			const allowedRoutePaths = buildAllowedPathSet(routesForMenu);
			console.log("[MENU-FILTER] handleAsyncRoutes", {
				effectiveAppId,
				roles: userState.roles,
				isDev,
				isAdmin,
				userMenusPermissions,
				hasLegacyAppOnly,
				explicitAllowedCount: explicitAllowedKeys.size,
				allowedRoutePathCount: allowedRoutePaths.size,
				shouldBypassMenuFilter,
			});
			const apiMenuResponse = await fetchNavigationMenus(effectiveAppId);
			// ...existing code (API menu processing, tree transform, etc)...
			if (apiMenuResponse?.result?.list && apiMenuResponse.result.list.length > 0) {
				let apiMenuList = apiMenuResponse.result.list;
				const hasParentId = apiMenuList.some((m: ApiMenuItemType) => 'parentId' in m);
				const hasChildren = apiMenuList.some((m: ApiMenuItemType) => m.children && m.children.length > 0);
				if (hasParentId && !hasChildren) {
					apiMenuList = buildMenuTree(apiMenuList);
				}
				apiWholeMenus = apiMenuList;
				
				// Load database from menu tree (don't await to avoid blocking menu rendering)
				loadDatabaseFromMenus(apiMenuList, effectiveAppId).catch(err => {
				});
				
				const apiMenus = transformApiMenusToLayoutMenus(apiMenuList as (ApiMenuItemType & { children?: MenuItemType[] })[]);
				// Giữ auto-setup nếu có auto_code; loại bỏ chỉ khi không có auto_code
				const filterAutoSetup = (m: any) => !(m.key === "/auto-setup" && !m.auto_code);
				// isDev hoặc hasLegacyAppOnly (menusPermissions=[appId] = tài khoản chính, full quyền app)
				// thì bypass filter → hiện toàn bộ menu app
				// Ngược lại lọc theo các path/id cụ thể trong menusPermissions
				const filteredByLegacyAccess = shouldBypassMenuFilter
					? apiMenus
					: filterMenuTreeByLegacyAccess(
						apiMenus,
						explicitAllowedKeys,
						allowedRoutePaths,
					);
				const apiMenusFiltered = filteredByLegacyAccess.filter(m => m.key !== "/system" && m.key !== "/home").filter(filterAutoSetup);
				if (isDev || isAdmin) {
					// dev/admin luôn có system routes; API business menus đã được filter ở trên
					wholeMenus = [
						...(homeMenu ? [homeMenu] : []),
						...systemMenusFromRoute,
						...apiMenusFiltered,
					];
				} else {
					const shouldShowOnlyHome = hasLegacyAppOnly && apiMenusFiltered.length === 0;
					wholeMenus = [
						...(homeMenu ? [homeMenu] : []),
						...(shouldShowOnlyHome ? [] : apiMenusFiltered),
					];
				}
			} else {
				// API trả về rỗng: chỉ giữ system menu nếu dev hoặc admin, ngược lại không menu
				if (isDev || isAdmin) {
					wholeMenus = [
						...(homeMenu ? [homeMenu] : []),
						...systemMenusFromRoute,
					];
				} else {
					wholeMenus = homeMenu ? [homeMenu] : [];
				}
			}
		} catch (error) {
			// Nếu API 请求失败: dev/admin giữ system, user không menu
			if (isDev || isAdmin) {
				wholeMenus = [
					...(homeMenu ? [homeMenu] : []),
					...systemMenusFromRoute,
				];
			} else {
				wholeMenus = homeMenu ? [homeMenu] : [];
			}
		}

		const newState = {
			constantMenus,
			wholeMenus,
			apiWholeMenus,
			routeList: newRoutes,
			flatRouteList,
			hasFetchedDynamicRoutes: true,
		};
		set(() => newState);
		return newState;
	},

	// Áp dụng routes nhận từ login, không gọi API get-async-routes
	applyAsyncRoutesFromLogin: async (routesFromLogin: AppRouteRecordRaw[], appIdParam?: string, devFlag?: boolean) => {
		// Chuẩn hóa và gắn Component/lazy tương ứng
		const dynamicRoutes = addAsyncRoutes(routesFromLogin);
		const newRoutes = ascending([...rootChildRoutes, ...dynamicRoutes]);

		const constantMenus = getMenuItems((router.routes[0].children || []) as AppRouteRecordRaw[]);

		// Thêm dynamic routes vào Router
		router.patchRoutes(ROOT_ROUTE_ID, dynamicRoutes);

		const flatRouteList = flattenRoutes(newRoutes);

		// Luôn tạo menu từ routes trước (bao gồm cả system routes)
		let wholeMenus = getMenuItems(newRoutes);
		let apiWholeMenus: ApiMenuItemType[] = [];
		
		// Thử lấy menu điều hướng API để có đủ metadata
		try {
			const effectiveAppId = (appIdParam || "").trim()
				|| (useUserStore.getState().app_id || "").trim()
				|| useAppStore.getState().getCurrentAppId();
			const apiMenuResponse = await fetchNavigationMenus(effectiveAppId);
			const userState = useUserStore.getState();
			const userMenusPermissions = Array.isArray(userState.menusPermissions) ? userState.menusPermissions : [];
			const normalizedMenuTokens = userMenusPermissions.map(normalizeAccessKey).filter(Boolean);
			const hasLegacyAppOnly = normalizedMenuTokens.length > 0
				&& normalizedMenuTokens.every(token => isLegacyAppScopeToken(token, effectiveAppId));
			const explicitAllowedKeys = new Set(
				normalizedMenuTokens.filter(token => !isLegacyAppScopeToken(token, effectiveAppId))
			);
			const isDev = resolveDevFlag(devFlag ?? userState.dev, userState.roles);
			const isAdmin = !isDev && (userState.roles || []).some(r => r.trim().toLowerCase() === 'admin');
			const shouldBypassMenuFilter = isDev || hasLegacyAppOnly || (isAdmin && explicitAllowedKeys.size === 0);
			const routesForMenu = (isDev
				? newRoutes.map(r => r.path === '/system'
					? {
						...r,
						children: (r.children || []).map(c => ({
							...c,
							handle: { ...(c as any).handle, roles: undefined },
						})),
					}
					: r)
				: isAdmin
					? newRoutes.map(r => r.path === '/system'
						? {
							...r,
							children: (r.children || [])
								.filter(c => {
									const childRoles: string[] | undefined = (c as any).handle?.roles;
									return !childRoles || childRoles.includes('admin');
								})
								.map(c => ({ ...c, handle: { ...(c as any).handle, roles: undefined } })),
						}
						: r)
					: newRoutes) as AppRouteRecordRaw[];
			const allowedRoutePaths = buildAllowedPathSet(routesForMenu);
			console.log("[MENU-FILTER] applyAsyncRoutesFromLogin", {
				effectiveAppId,
				roles: userState.roles,
				isDev,
				isAdmin,
				userMenusPermissions,
				hasLegacyAppOnly,
				explicitAllowedCount: explicitAllowedKeys.size,
				allowedRoutePathCount: allowedRoutePaths.size,
				shouldBypassMenuFilter,
			});
			const routeMenus = getMenuItems(routesForMenu);
			const homeMenu = routeMenus.find(m => m.key === '/home');
			const systemMenus = routeMenus.filter(m => m.key === '/system');
			if (apiMenuResponse?.result?.list && apiMenuResponse.result.list.length > 0) {
				let apiMenuList = apiMenuResponse.result.list;
				const hasParentId = apiMenuList.some((m: ApiMenuItemType) => 'parentId' in m);
				const hasChildren = apiMenuList.some((m: ApiMenuItemType) => m.children && m.children.length > 0);
				if (hasParentId && !hasChildren) {
					apiMenuList = buildMenuTree(apiMenuList);
				}
				apiWholeMenus = apiMenuList;
				
				// Load database from menu tree (don't await to avoid blocking menu rendering)
				loadDatabaseFromMenus(apiMenuList, effectiveAppId).catch(err => {
				});
				
				const apiMenus = transformApiMenusToLayoutMenus(apiMenuList as (ApiMenuItemType & { children?: MenuItemType[] })[]);
				const filterAutoSetup = (m: any) => !(m.key === '/auto-setup' && !m.auto_code);
				// isDev hoặc hasLegacyAppOnly (menusPermissions=[appId] = tài khoản chính, full quyền app)
				// thì bypass filter → hiện toàn bộ menu app
				// Ngược lại lọc theo các path/id cụ thể trong menusPermissions
				const filteredByLegacyAccess = shouldBypassMenuFilter
					? apiMenus
					: filterMenuTreeByLegacyAccess(
						apiMenus,
						explicitAllowedKeys,
						allowedRoutePaths,
					);
				const apiMenusFiltered = filteredByLegacyAccess.filter(m => m.key !== '/system' && m.key !== '/home').filter(filterAutoSetup);
				if (isDev || isAdmin) {
					// dev/admin luôn có system routes; API business menus đã được filter ở trên
					wholeMenus = [
						...(homeMenu ? [homeMenu] : []),
						...systemMenus,
						...apiMenusFiltered,
					];
				} else {
					const shouldShowOnlyHome = hasLegacyAppOnly && apiMenusFiltered.length === 0;
					wholeMenus = [
						...(homeMenu ? [homeMenu] : []),
						...(shouldShowOnlyHome ? [] : apiMenusFiltered),
					];
				}
			} else if (isDev || isAdmin) {
				// API rỗng và dev/admin: chỉ giữ home + system
				wholeMenus = [
					...(homeMenu ? [homeMenu] : []),
					...systemMenus,
				];
			} else {
				// API rỗng và không dev/admin: chỉ giữ home (nếu có)
				wholeMenus = homeMenu ? [homeMenu] : [];
			}
		} catch {
			const userState = useUserStore.getState();
			const isDev = resolveDevFlag(devFlag ?? userState.dev, userState.roles);
			const isAdmin = !isDev && (userState.roles || []).some(r => r.trim().toLowerCase() === 'admin');
			const routesForMenu = (isDev
				? newRoutes.map(r => r.path === '/system'
					? {
						...r,
						children: (r.children || []).map(c => ({
							...c,
							handle: { ...(c as any).handle, roles: undefined },
						})),
					}
					: r)
				: isAdmin
					? newRoutes.map(r => r.path === '/system'
						? {
							...r,
							children: (r.children || [])
								.filter(c => {
									const childRoles: string[] | undefined = (c as any).handle?.roles;
									return !childRoles || childRoles.includes('admin');
								})
								.map(c => ({ ...c, handle: { ...(c as any).handle, roles: undefined } })),
						}
						: r)
					: newRoutes) as AppRouteRecordRaw[];
			const routeMenus = getMenuItems(routesForMenu);
			const homeMenu = routeMenus.find(m => m.key === '/home');
			const systemMenus = routeMenus.filter(m => m.key === '/system');
			wholeMenus = (isDev || isAdmin)
				? [...(homeMenu ? [homeMenu] : []), ...systemMenus]
				: (homeMenu ? [homeMenu] : []);
		}

		const newState = {
			constantMenus,
			wholeMenus,
			apiWholeMenus,
			routeList: newRoutes,
			flatRouteList,
			hasFetchedDynamicRoutes: true,
		};
		set(() => newState);
		return newState;
	},

	reset: () => {
		/* 移除动态路由 */
		router._internalSetRoutes(routes);
		set(initialState);
	},
}));
