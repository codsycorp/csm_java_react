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
import { useAuthStore } from "./auth";
import { useUserStore } from "./user";
import { create } from "zustand";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { toPermissionBigInt, isSuperPermissionProfile } from "#src/utils/permission-bitfield";
import { getTableData, type Where } from "#src/components/csm-grid/CsmApi";

function stripMenuPrefixFromLabel(label: string): string {
	if (!label || typeof label !== 'string') {
		return label;
	}
	return label.replace(/^.*?\.\s+/, '').trim();
}

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
	return result;
}

function resolveOrderValue(value: unknown): number {
	if (value === null || value === undefined || value === "") return Number.MAX_SAFE_INTEGER;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortApiMenuTreeByOrder(items: ApiMenuItemType[]): ApiMenuItemType[] {
	return [...(items || [])]
		.sort((a, b) => {
			const diff = resolveOrderValue((a as any)?.order) - resolveOrderValue((b as any)?.order);
			if (diff !== 0) return diff;
			const labelA = String((a as any)?.label || (a as any)?.name || (a as any)?.id || "").toLowerCase();
			const labelB = String((b as any)?.label || (b as any)?.name || (b as any)?.id || "").toLowerCase();
			if (labelA < labelB) return -1;
			if (labelA > labelB) return 1;
			return 0;
		})
		.map((item) => ({
			...item,
			children: Array.isArray(item?.children) ? sortApiMenuTreeByOrder(item.children as ApiMenuItemType[]) : item?.children,
		}));
}

function normalizeAccessKey(raw: unknown): string {
	if (raw == null) return "";
	return String(raw).trim().toLowerCase();
}

function isDesktopProcessBypassEnabled(): boolean {
	if (typeof window === "undefined") return false;
	const proc = (window as any)?.process;
	const nwVersion = proc?.versions?.nw;
	const hasNwGlobal = !!(window as any)?.nw;
	return !!(hasNwGlobal || nwVersion);
}

function findFirstAutoCode(items: any[]): string {
	for (const item of items || []) {
		const autoCode = String(item?.auto_code || "").trim();
		if (autoCode) {
			return autoCode;
		}
		if (Array.isArray(item?.children) && item.children.length > 0) {
			const nested = findFirstAutoCode(item.children);
			if (nested) {
				return nested;
			}
		}
	}
	return "";
}

function ensureAutoSetupMenuForDesktop(currentMenus: MenuItemType[], routeMenus: MenuItemType[], autoCode: string): MenuItemType[] {
	if (!isDesktopProcessBypassEnabled()) {
		return (currentMenus || []).filter((menu: any) => normalizeAccessKey(menu?.key || menu?.path) !== "/auto-setup");
	}
	if (!String(autoCode || "").trim()) {
		return (currentMenus || []).filter((menu: any) => normalizeAccessKey(menu?.key || menu?.path) !== "/auto-setup");
	}

	const hasAutoSetup = (currentMenus || []).some((menu: any) => normalizeAccessKey(menu?.key || menu?.path) === "/auto-setup");
	if (hasAutoSetup) {
		return (currentMenus || []).map((menu: any) => {
			const key = normalizeAccessKey(menu?.key || menu?.path);
			if (key !== "/auto-setup") return menu;
			if (String(menu?.auto_code || "").trim()) return menu;
			return { ...menu, auto_code: autoCode };
		}) as MenuItemType[];
	}

	const autoSetupMenu = (routeMenus || []).find((menu: any) => normalizeAccessKey(menu?.key || menu?.path) === "/auto-setup");
	if (autoSetupMenu) {
		return [...(currentMenus || []), { ...autoSetupMenu, auto_code: autoCode } as MenuItemType];
	}

	const fallbackAutoSetupMenu: MenuItemType = {
		key: "/auto-setup",
		path: "/auto-setup",
		id: "auto",
		label: "common.menu.auto_setup",
		auto_code: autoCode,
	} as any;

	return [...(currentMenus || []), fallbackAutoSetupMenu];
}

function ensureAutoSetupApiMenuForDesktop(currentApiMenus: ApiMenuItemType[], autoCode: string): ApiMenuItemType[] {
	if (!isDesktopProcessBypassEnabled()) {
		return (currentApiMenus || []).filter((menu: any) => normalizeAccessKey(menu?.path || menu?.id || menu?.name) !== "/auto-setup");
	}
	if (!String(autoCode || "").trim()) {
		return (currentApiMenus || []).filter((menu: any) => normalizeAccessKey(menu?.path || menu?.id || menu?.name) !== "/auto-setup");
	}

	const hasAutoSetup = (currentApiMenus || []).some((menu: any) => normalizeAccessKey(menu?.path || menu?.id || menu?.name) === "/auto-setup");
	if (hasAutoSetup) {
		return (currentApiMenus || []).map((menu: any) => {
			const key = normalizeAccessKey(menu?.path || menu?.id || menu?.name);
			if (key !== "/auto-setup") return menu;
			if (String(menu?.auto_code || "").trim()) return menu;
			return { ...menu, auto_code: autoCode };
		});
	}

	return [
		...(currentApiMenus || []),
		{
			id: "auto",
			name: "auto_setup",
			label: "common.menu.auto_setup",
			path: "/auto-setup",
			auto_code: autoCode,
		} as any,
	];
}

function toTokenList(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.map(item => String(item || '').trim()).filter(Boolean);
	}
	if (typeof raw === 'string') {
		const text = raw.trim();
		if (!text) return [];
		if (text.startsWith('[') || text.startsWith('{')) {
			try {
				return toTokenList(JSON.parse(text));
			} catch {
				return [];
			}
		}
		return text.split(/[;,\n]/g).map(item => item.trim()).filter(Boolean);
	}
	if (raw && typeof raw === 'object') {
		return Object.values(raw as Record<string, unknown>)
			.map(item => String(item || '').trim())
			.filter(Boolean);
	}
	return [];
}

function resolvePrivilegeFlags(userState: any, devOverride?: boolean): { isDev: boolean; isAdmin: boolean } {
	const isDev = typeof devOverride === "boolean"
		? devOverride
		: resolveDevFlag(userState?.dev, userState?.roles);
	const permissionBits = toPermissionBigInt(userState?.permissionBitfield);
	const isAdmin = !isDev && isSuperPermissionProfile(permissionBits);
	return { isDev, isAdmin };
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
	const isSystemPath = path.startsWith("/system");
	const hasAutoCode = !!(menu?.auto_code);
	const isAlwaysVisible = path === "/" || path === "/home" || path === "/auto-setup" || id === "home" || id === "auto" || hasAutoCode;

	if (isAlwaysVisible) return true;

	if (isSystemPath && path && allowedPaths.has(path)) return true;
	if (path && allowedKeys.has(path)) return true;
	if (id && allowedKeys.has(id)) return true;
	if (name && allowedKeys.has(name)) return true;

	return false;
}

function isDevOnlySystemPath(rawPath: unknown): boolean {
	const path = normalizeAccessKey(rawPath);
	if (!path) return false;
	return path === "/system/menu"
		|| path.startsWith("/system/menu/")
		|| path === "/system/developer"
		|| path.startsWith("/system/developer/")
		|| path === "/system/broadcast"
		|| path.startsWith("/system/broadcast/");
}

function pruneDevOnlySystemMenusForAdmin(items: any[]): any[] {
	return (items || []).reduce((acc: any[], item: any) => {
		const path = item?.path || item?.key;
		if (isDevOnlySystemPath(path)) {
			return acc;
		}
		const nextChildren = Array.isArray(item?.children)
			? pruneDevOnlySystemMenusForAdmin(item.children)
			: undefined;
		acc.push({
			...item,
			children: nextChildren && nextChildren.length > 0 ? nextChildren : undefined,
		});
		return acc;
	}, []);
}

function pruneSystemMenusFromApiForAdmin(items: any[]): any[] {
	return (items || []).reduce((acc: any[], item: any) => {
		const path = normalizeAccessKey(item?.path || item?.key);
		if (path.startsWith('/system')) {
			return acc;
		}
		const nextChildren = Array.isArray(item?.children)
			? pruneSystemMenusFromApiForAdmin(item.children)
			: undefined;
		acc.push({
			...item,
			children: nextChildren && nextChildren.length > 0 ? nextChildren : undefined,
		});
		return acc;
	}, []);
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

function moveSystemMenuLast(items: MenuItemType[]): MenuItemType[] {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}
	const systemMenus: MenuItemType[] = [];
	const otherMenus: MenuItemType[] = [];
	for (const item of items) {
		const key = normalizeAccessKey((item as any)?.key || (item as any)?.path);
		if (key === '/system') {
			systemMenus.push(item);
		} else {
			otherMenus.push(item);
		}
	}
	return [...otherMenus, ...systemMenus];
}

async function loadDatabaseFromMenus(menuTree: ApiMenuItemType[], appId: string): Promise<void> {
	const tableNames = new Set<string>();

	function collectTableNames(menus: ApiMenuItemType[]) {
		menus.forEach(menu => {
			if (menu.table_name) {
				const tables = menu.table_name.split(/,/g).filter(t => t.trim() !== "");
				tables.forEach(t => tableNames.add(t.trim()));
			}
			if (menu.children && menu.children.length > 0) {
				collectTableNames(menu.children);
			}
		});
	}

	collectTableNames(menuTree);

	const defaultWhere: Where = {
		operator: "AND",
		conditions: [{ field: "id", type: "like", value: "" }]
	};

	const loadPromises = Array.from(tableNames).map(async (tableName) => {
		try {
			const res = await getTableData<any>({
				app_id: appId,
				obj_name: tableName,
				where: defaultWhere,
			});

			const rows = res?.rows || [];
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
		const maybeAutoPath = (apiMenu.path || "").toLowerCase();
		const maybeAutoId = (apiMenu.id || "").toLowerCase();
		const maybeAutoName = (apiMenu.name || "").toLowerCase();
		const autoCode = (apiMenu as any).auto_code;
		const isAutoMenu = maybeAutoPath === "/auto-setup" || maybeAutoId === "auto" || maybeAutoName.includes("auto");
		if (isAutoMenu && (!autoCode || String(autoCode).trim() === "")) {
			return;
		}
		const menuItem: any = {
			key: apiMenu.path || apiMenu.id || "",
			label: stripMenuPrefixFromLabel(apiMenu.label || apiMenu.name || ""),
			name: apiMenu.name ? stripMenuPrefixFromLabel(apiMenu.name) : undefined,
			name_en: apiMenu.name_en ? stripMenuPrefixFromLabel(apiMenu.name_en) : undefined,
			name_zh: apiMenu.name_zh ? stripMenuPrefixFromLabel(apiMenu.name_zh) : undefined,
			disabled: apiMenu.status === 0 || apiMenu.m_show === false,
			label_en: apiMenu.label_en ? stripMenuPrefixFromLabel(apiMenu.label_en) : undefined,
			label_zh: apiMenu.label_zh ? stripMenuPrefixFromLabel(apiMenu.label_zh) : undefined,
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

		if (apiMenu.children && apiMenu.children.length > 0) {
			menuItem.children = transformApiMenusToLayoutMenus(apiMenu.children as any);
		}

		result.push(menuItem);
	});

	return result;
}

interface InitialStateType {
	constantMenus: MenuItemType[]
	wholeMenus: MenuItemType[]
	apiWholeMenus: ApiMenuItemType[]
	routeList: AppRouteRecordRaw[]
	flatRouteList: Record<string, AppRouteRecordRaw>
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
	handleAsyncRoutes: (appIdParam?: string, authToken?: string) => Promise<InitialStateType>
	applyAsyncRoutesFromLogin: (routesFromLogin: AppRouteRecordRaw[], appIdParam?: string, devFlag?: boolean) => Promise<InitialStateType>
	reset: () => void
};

export const usePermissionStore = create<PermissionState & PermissionAction>(set => ({
	...initialState,

	handleAsyncRoutes: async (appIdParam?: string, authToken?: string) => {
		const tokenFromArg = String(authToken || "").trim();
		const tokenFromStore = String(useAuthStore.getState().token || "").trim();
		const effectiveToken = tokenFromArg || tokenFromStore;
		const asyncRouteHeaders = effectiveToken
			? { "csm-token": effectiveToken }
			: undefined;
		const { result } = await fetchAsyncRoutes(asyncRouteHeaders);
		const dynamicRoutes = addAsyncRoutes(result);
		const newRoutes = ascending([...rootChildRoutes, ...dynamicRoutes]);

		const constantMenus = getMenuItems((router.routes[0].children || []) as AppRouteRecordRaw[]);
		router.patchRoutes(ROOT_ROUTE_ID, dynamicRoutes);
		const flatRouteList = flattenRoutes(newRoutes);

		const userState = useUserStore.getState();
		const { isDev, isAdmin } = resolvePrivilegeFlags(userState);
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

		const routeMenus: MenuItemType[] = getMenuItems(routesForMenu);
		const homeMenu = routeMenus.find(m => m.key === "/home");
		const systemMenusFromRoute = routeMenus.filter(m => m.key === "/system");
		let wholeMenus: MenuItemType[] = [];
		let apiWholeMenus: ApiMenuItemType[] = [];
		let firstAutoCode = "";
		try {
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
			const shouldBypassMenuFilter = isDev || isAdmin || hasLegacyAppOnly;
			const allowedRoutePaths = buildAllowedPathSet(routesForMenu);
			const apiMenuResponse = await fetchNavigationMenus(effectiveAppId);
			if (apiMenuResponse?.result?.list && apiMenuResponse.result.list.length > 0) {
				let apiMenuList = apiMenuResponse.result.list;
				const hasParentId = apiMenuList.some((m: ApiMenuItemType) => 'parentId' in m);
				const hasChildren = apiMenuList.some((m: ApiMenuItemType) => m.children && m.children.length > 0);
				if (hasParentId && !hasChildren) {
					apiMenuList = buildMenuTree(apiMenuList);
				}
				apiMenuList = sortApiMenuTreeByOrder(apiMenuList);
				apiWholeMenus = apiMenuList;
				firstAutoCode = findFirstAutoCode(apiMenuList as any[]);

				loadDatabaseFromMenus(apiMenuList, effectiveAppId).catch(() => {
				});

				const apiMenus = transformApiMenusToLayoutMenus(apiMenuList as (ApiMenuItemType & { children?: MenuItemType[] })[]);
				const sanitizedApiMenus = isAdmin
					? pruneSystemMenusFromApiForAdmin(apiMenus)
					: apiMenus;
				const filteredByLegacyAccess = shouldBypassMenuFilter
					? sanitizedApiMenus
					: filterMenuTreeByLegacyAccess(
						sanitizedApiMenus,
						explicitAllowedKeys,
						allowedRoutePaths,
					);
				const filterAutoSetup = (m: any) => !(m.key === "/auto-setup" && !m.auto_code);
				const filterDuplicatedSystemApiMenus = (m: any) => {
					const key = normalizeAccessKey(m?.key || m?.path);
					return !(key === "/system" || key.startsWith("/system/"));
				};
				const apiMenusFiltered = filteredByLegacyAccess
					.filter(m => m.key !== "/system" && m.key !== "/home" && m.key !== "/" && String((m as any).id || "") !== "home")
					.filter(filterDuplicatedSystemApiMenus)
					.filter(filterAutoSetup);
				if (isDev || isAdmin) {
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
			wholeMenus: moveSystemMenuLast(ensureAutoSetupMenuForDesktop(wholeMenus, routeMenus, firstAutoCode)),
			apiWholeMenus: ensureAutoSetupApiMenuForDesktop(apiWholeMenus, firstAutoCode),
			routeList: newRoutes,
			flatRouteList,
			hasFetchedDynamicRoutes: true,
		};
		set(() => newState);
		return newState;
	},

	applyAsyncRoutesFromLogin: async (routesFromLogin: AppRouteRecordRaw[], appIdParam?: string, devFlag?: boolean) => {
		const dynamicRoutes = addAsyncRoutes(routesFromLogin);
		const newRoutes = ascending([...rootChildRoutes, ...dynamicRoutes]);

		const constantMenus = getMenuItems((router.routes[0].children || []) as AppRouteRecordRaw[]);
		router.patchRoutes(ROOT_ROUTE_ID, dynamicRoutes);
		const flatRouteList = flattenRoutes(newRoutes);
		let wholeMenus = getMenuItems(newRoutes);
		const baseRouteMenus = wholeMenus;
		let apiWholeMenus: ApiMenuItemType[] = [];
		let firstAutoCode = "";

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
			const { isDev, isAdmin } = resolvePrivilegeFlags(userState, devFlag ?? userState.dev);
			const shouldBypassMenuFilter = isDev || isAdmin || hasLegacyAppOnly;
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
				apiMenuList = sortApiMenuTreeByOrder(apiMenuList);
				apiWholeMenus = apiMenuList;
				firstAutoCode = findFirstAutoCode(apiMenuList as any[]);
				loadDatabaseFromMenus(apiMenuList, effectiveAppId).catch(() => {
				});
				const apiMenus = transformApiMenusToLayoutMenus(apiMenuList as (ApiMenuItemType & { children?: MenuItemType[] })[]);
				const sanitizedApiMenus = isAdmin
					? pruneSystemMenusFromApiForAdmin(apiMenus)
					: apiMenus;
				const filteredByLegacyAccess = shouldBypassMenuFilter
					? sanitizedApiMenus
					: filterMenuTreeByLegacyAccess(
						sanitizedApiMenus,
						explicitAllowedKeys,
						allowedRoutePaths,
					);
				const filterAutoSetup = (m: any) => !(m.key === '/auto-setup' && !m.auto_code);
				const filterDuplicatedSystemApiMenus = (m: any) => {
					const key = normalizeAccessKey(m?.key || m?.path);
					return !(key === '/system' || key.startsWith('/system/'));
				};
				const apiMenusFiltered = filteredByLegacyAccess
					.filter(m => m.key !== '/system' && m.key !== '/home' && m.key !== '/' && String((m as any).id || '') !== 'home')
					.filter(filterDuplicatedSystemApiMenus)
					.filter(filterAutoSetup);
				if (isDev || isAdmin) {
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
				wholeMenus = [
					...(homeMenu ? [homeMenu] : []),
					...systemMenus,
				];
			} else {
				wholeMenus = homeMenu ? [homeMenu] : [];
			}
		} catch {
			const userState = useUserStore.getState();
			const { isDev, isAdmin } = resolvePrivilegeFlags(userState, devFlag ?? userState.dev);
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
			wholeMenus: moveSystemMenuLast(ensureAutoSetupMenuForDesktop(wholeMenus, baseRouteMenus, firstAutoCode)),
			apiWholeMenus: ensureAutoSetupApiMenuForDesktop(apiWholeMenus, firstAutoCode),
			routeList: newRoutes,
			flatRouteList,
			hasFetchedDynamicRoutes: true,
		};
		set(() => newState);
		return newState;
	},

	reset: () => {
		router._internalSetRoutes(routes);
		set(initialState);
	},
}));
