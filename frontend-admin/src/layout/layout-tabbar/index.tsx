import type { TabItemProps } from "#src/store";
import type { TabsProps } from "antd";

import { useCurrentRoute } from "#src/hooks";
import { isDynamicRoutingEnabled } from "#src/router/routes/config";
import { removeTrailingSlash } from "#src/router/utils";
import { usePermissionStore, usePreferencesStore, useTabsStore, useUserStore } from "#src/store";
import { getLocalizedField, type SupportedLanguage } from "#src/utils/i18nHelper";
import { isString } from "#src/utils";
import { normalizeMenuLabel } from "#src/utils";

import * as AntIcons from "@ant-design/icons";
import { RedoOutlined } from "@ant-design/icons";
import { Button, Tabs } from "antd";
import { clsx } from "clsx";
import { isValidElement, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

import { DraggableTabBar } from "./components/draggable-tab-bar";
import { TabMaximize } from "./components/tab-maximize";
import { TabOptions } from "./components/tab-options";
import { TabActionKeys, useDropdownMenu } from "./hooks/use-dropdown-menu";
import { useStyles } from "./style";

const HOME_TAB_KEY = "homepage";

function normalizeI18nLabel(label: unknown, t: (key: string) => string): string {
	if (label == null) return "";
	const str = String(label).trim();
	if (!str) return "";
	const lower = str.toLowerCase();
	if (lower === "system") return t("common.menu.system");
	if (lower === "home" || lower === "homepage") return t("common.menu.home");
	if (str.includes(".")) {
		const translated = t(str);
		if (translated && translated !== str) return normalizeMenuLabel(translated);
	}
	return normalizeMenuLabel(str);
}

// Helper: ưu tiên chọn tab Home nếu có
function getDefaultTabKey(openTabs: Map<string, any>) {
	const homePath = HOME_TAB_KEY;
	if (openTabs.has(homePath)) return homePath;
	if (openTabs.has("/")) return homePath;
	if (openTabs.has("/home")) return homePath;
	const first = openTabs.keys().next();
	return first && typeof first.value === "string" ? first.value : "";
}

function normalizeAntIconName(raw: string): string {
	const text = String(raw || "").trim();
	if (!text) return "";
	if ((AntIcons as any)[text]) return text;
	for (const token of text.split(/\s+/)) {
		if ((AntIcons as any)[token]) return token;
	}
	if (!/Outlined$|Filled$|TwoTone$/i.test(text)) {
		const outlined = `${text}Outlined`;
		if ((AntIcons as any)[outlined]) return outlined;
	}
	return "";
}

function resolveTabIconNode(icon: unknown, modernIcon?: unknown, legacyIcon?: unknown, size = 13): React.ReactNode {
	if (isValidElement(icon)) return icon;
	const source = (typeof icon === "string" ? icon : "")
		|| (typeof modernIcon === "string" ? modernIcon : "")
		|| (typeof legacyIcon === "string" ? legacyIcon : "");
	if (!source) return null;
	const name = normalizeAntIconName(source);
	if (name && (AntIcons as any)[name]) {
		const Comp = (AntIcons as any)[name];
		return <Comp style={{ fontSize: size, lineHeight: 1 }} />;
	}
	return <i className={source} style={{ fontSize: size, lineHeight: 1 }} aria-hidden />;
}

/**
 * LayoutTabbar 组件
 * 用于渲染和管理应用程序的标签页导航
 */
export default function LayoutTabbar() {
	// const { token } = theme.useToken();
	const classes = useStyles();
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useTranslation();
	const currentRoute = useCurrentRoute();

	const { tabbarStyleType, tabbarShowIcon, tabbarShowMaximize, tabbarShowMore, language: preferenceLanguage } = usePreferencesStore();
	const { flatRouteList, hasFetchedDynamicRoutes, apiWholeMenus, broadcastHomeCode } = usePermissionStore();
	const selectedMenuIdForTab = useUserStore(state => state.selectedMenuIdForTab);
	const { activeKey, isRefresh, setActiveKey, setIsRefresh, openTabs, addTab, insertBeforeTab } = useTabsStore();
	const homePath = HOME_TAB_KEY;
	const closingKeyRef = useRef<string | null>(null);
	
	// Get store instance for direct access (not reactive)
	const getTabsStore = useTabsStore.getState;
	
	const [items, onClickMenu] = useDropdownMenu();

	const currentLanguage = useMemo<SupportedLanguage>(() => {
		const normalized = String(preferenceLanguage || "").toLowerCase();
		if (normalized.startsWith("en")) return "en";
		if (normalized.startsWith("zh")) return "zh";
		return "vi";
	}, [preferenceLanguage]);

	const resolveMenuLocalizedLabel = useCallback((menu: any): string => {
		if (!menu || typeof menu !== "object") return "";

		const byLabel = getLocalizedField(menu, "label", currentLanguage, false);
		if (byLabel) {
			const normalized = normalizeI18nLabel(byLabel, t);
			if (normalized) return normalized;
		}

		const byName = getLocalizedField(menu, "name", currentLanguage, false);
		if (byName) {
			const normalized = normalizeI18nLabel(byName, t);
			if (normalized) return normalized;
		}

		const fallback = getLocalizedField(menu, "label", currentLanguage, true) || getLocalizedField(menu, "name", currentLanguage, true);
		if (fallback) {
			const normalized = normalizeI18nLabel(fallback, t);
			if (normalized) return normalized;
		}

		return "";
	}, [currentLanguage, t]);

	const flatApiMenus = useMemo(() => {
		const result: any[] = [];
		const walk = (menus: any[]) => {
			if (!Array.isArray(menus)) return;
			for (const menu of menus) {
				if (!menu || typeof menu !== "object") continue;
				result.push(menu);
				if (Array.isArray(menu.children) && menu.children.length > 0) walk(menu.children);
				if (Array.isArray(menu.nodes) && menu.nodes.length > 0) walk(menu.nodes);
			}
		};
		walk(apiWholeMenus || []);
		return result;
	}, [apiWholeMenus]);

	const menuLookup = useMemo(() => {
		const byId = new Map<string, any>();
		const byPath = new Map<string, any>();
		const byKey = new Map<string, any>();
		for (const menu of flatApiMenus) {
			const id = String(menu?.id || "").trim();
			const key = String(menu?.key || "").trim();
			const path = String(menu?.path || menu?.component || "").trim();
			if (id && !byId.has(id)) byId.set(id, menu);
			if (key && !byKey.has(key)) byKey.set(key, menu);
			if (path && !byPath.has(path)) byPath.set(path, menu);
		}
		return { byId, byPath, byKey };
	}, [flatApiMenus]);

	// Migrate legacy Home keys ("/", "/home") in runtime state to canonical homePath
	useEffect(() => {
		const hasLegacyRoot = openTabs.has("/");
		const hasLegacyHome = openTabs.has("/home");
		if (!hasLegacyRoot && !hasLegacyHome) return;

		const migratedTabs = new Map(openTabs);
		const rootTab = migratedTabs.get("/");
		const slashHomeTab = migratedTabs.get("/home");
		const sourceTab = rootTab || slashHomeTab;

		migratedTabs.delete("/");
		migratedTabs.delete("/home");
		if (sourceTab) {
			migratedTabs.set(homePath, {
				...sourceTab,
				key: homePath,
				label: t("common.menu.home"),
				closable: false,
				draggable: false,
			});
		}

		const migratedActiveKey = (activeKey === "/" || activeKey === "/home") ? homePath : activeKey;
		if (!hasLegacyRoot && !hasLegacyHome && migratedActiveKey === activeKey) return;
		useTabsStore.setState({ openTabs: migratedTabs, activeKey: migratedActiveKey });
	}, [openTabs, activeKey, homePath, t]);


	// Always ensure Home tab exists after login or restore — only when broadcastHomeCode is available
	useEffect(() => {
		if (!hasFetchedDynamicRoutes) return;
		const hasHome = openTabs.has(homePath);
		if (!broadcastHomeCode) {
			// No home code: remove Home tab if it exists
			if (hasHome) {
				useTabsStore.setState(state => {
					const newTabs = new Map(state.openTabs);
					newTabs.delete(homePath);
					// Filter out any undefined entries left by store operations
					for (const [k, v] of newTabs) {
						if (!v) newTabs.delete(k);
					}
					const firstKey = newTabs.keys().next().value ?? "";
					const nextKey = (state.activeKey === homePath || !newTabs.has(state.activeKey))
						? firstKey
						: state.activeKey;
					return { openTabs: newTabs, activeKey: nextKey };
				});
			}
			return;
		}
		// Has home code: ensure Home tab is present
		if (!hasHome) {
			addTab(homePath, {
				key: homePath,
				label: t("common.menu.home"),
				closable: false,
				draggable: false,
			});
			if (activeKey !== homePath) {
				setActiveKey(homePath);
			}
		}
	}, [openTabs, addTab, setActiveKey, t, homePath, activeKey, broadcastHomeCode, hasFetchedDynamicRoutes]);

	/**
	 * 自动重置刷新状态
	 */
	useEffect(() => {
		if (isRefresh) {
			const timer = setTimeout(() => {
				setIsRefresh(false);
			}, 500);

			return () => clearTimeout(timer);
		}
	}, [isRefresh, setIsRefresh]);

	/**
	 * 处理标签页切换
	 * @param {string} key - 被选中的标签页的key
	 */
	const handleChangeTabs = useCallback((key: string) => {
		const normalizedKey = (key === "/" || key === "/home") ? homePath : key;
		setActiveKey(normalizedKey);
	}, [setActiveKey, homePath]);

	/**
	 * 处理标签页编辑（关闭）
	 * @param {React.MouseEvent | React.KeyboardEvent | string} key - 被编辑的标签页的key
	 * @param {string} action - 编辑动作，这里只处理 "remove"
	 */
	 const handleEditTabs = useCallback<Required<TabsProps>["onEdit"]>((key, action) => {
	 	if (action === "remove") {
	 		const closingKey = key as string;
	 		const home = homePath;
	 		const state = useTabsStore.getState();

	 		// Cannot close home (only when home exists as a pinned tab)
	 		if (closingKey === home && broadcastHomeCode) return;

	 		const newTabs = new Map(state.openTabs);
	 		newTabs.delete(closingKey);
	 		// Only re-add home if broadcastHomeCode is set and it somehow got removed
	 		if (broadcastHomeCode && !newTabs.has(home) && state.openTabs.has(home)) {
	 			newTabs.set(home, state.openTabs.get(home)!);
	 		}

	 		let nextKey = state.activeKey;
	 		if (state.activeKey === closingKey || !newTabs.has(state.activeKey)) {
	 			const keys = Array.from(newTabs.keys());
	 			nextKey = keys.at(-1) || home;
	 		}

	 		// mark closing to avoid re-adding on same-location effect
	 		closingKeyRef.current = closingKey;

	 		useTabsStore.setState({ openTabs: newTabs, activeKey: nextKey });
	 		// KHÔNG gọi navigate, chỉ set state
	 	}
	 }, [homePath, broadcastHomeCode]);

	/**
	 * 生成标签栏额外内容
	 */
	const tabBarExtraContent = useMemo(() => ({
		right: (
			<div className="flex items-center" style={{ height: 35 }}>
				<Button
					icon={(
						<RedoOutlined
							rotate={270}
							className={clsx({ "animate-spin": isRefresh })}
						/>
					)}
					size="middle"
					type="text"
					className={clsx("rounded-none h-full border-l border-l-colorBorderSecondary")}
					onClick={() => onClickMenu(TabActionKeys.REFRESH, activeKey)}
				/>
				{tabbarShowMaximize ? (<TabMaximize className="h-full border-l rounded-none border-l-colorBorderSecondary" />) : null}
				{tabbarShowMore ? (<TabOptions activeKey={activeKey} className="h-full border-l rounded-none border-l-colorBorderSecondary" />) : null}
			</div>
		),
	}), [isRefresh, activeKey, onClickMenu, tabbarShowMore, tabbarShowMaximize]);

	/**
	 * 活动标签页被关闭，自动导航到合适路由
	 */
	 // ĐÃ LOẠI BỎ navigate khi chuyển tab để SPA không đổi path

	// ĐÃ ĐỒNG BỘ SPA: Không tự động addTab Home ở đây nữa

	/**
	 * Helper function to derive tab label from various sources
	 * Priority: navigation state > menu tree (for dynamic grids) > route definition
	 */
	const deriveTabLabel = useCallback((path: string, locationState: any, tab?: any): string => {
		const SYSTEM_TAB_LABEL_MAP: Record<string, string> = {
			"/system": "common.menu.system",
			"/system/menu": "common.menu.menu",
			"/system/developer": "common.menu.developer",
			"/system/dept": "common.menu.permissionGroup",
			"/system/departments": "common.menu.dept",
			"/system/branches": "common.menu.branch",
			"/system/user": "common.menu.user",
			"/system/role": "common.menu.permissionGroup",
			"/system/roles": "common.menu.permissionGroup",
			"/system/routers": "common.menu.routers",
			"/system/apps": "common.menu.apps",
			"/system/react-native": "common.menu.reactNative",
		};

		const canonicalSystemLabelKey = SYSTEM_TAB_LABEL_MAP[path];
		if (canonicalSystemLabelKey) {
			return t(canonicalSystemLabelKey);
		}

		const tabCandidates = [
			tab?.menuData,
			tab?.m_configs,
		].filter(Boolean);
		for (const menuLike of tabCandidates) {
			const ownLocalized = resolveMenuLocalizedLabel(menuLike);
			if (ownLocalized) return ownLocalized;
			const ownLabel = normalizeI18nLabel(menuLike?.label || menuLike?.title || menuLike?.name, t);
			if (ownLabel) return ownLabel;
		}

		const findMenuByRuntimePath = (runtimePath: string) => {
			const byPath = menuLookup.byPath.get(runtimePath);
			if (byPath) return byPath;
			const normalizedRuntimePath = removeTrailingSlash(runtimePath);
			if (normalizedRuntimePath !== runtimePath) {
				const byNormalizedPath = menuLookup.byPath.get(normalizedRuntimePath);
				if (byNormalizedPath) return byNormalizedPath;
			}
			return null;
		};


		// 2. For dynamic grid/report routes, derive from menu tree
		const gridMatch = path.match(/\/system\/grid\/(.+)$/);
		const reportMatch = path.match(/\/system\/report\/(.+)$/);
		const menuId = String(
			tab?.menuId
			|| tab?.menuData?.id
			|| tab?.m_configs?.id
			|| gridMatch?.[1]
			|| reportMatch?.[1]
			|| "",
		).trim();
		if (menuId) {
			const menuById = menuLookup.byId.get(menuId) || menuLookup.byKey.get(menuId);
			if (menuById) {
				const localized = resolveMenuLocalizedLabel(menuById);
				if (localized) return localized;
				const resolved = normalizeI18nLabel(menuById.label || menuById.title || menuById.name || menuId, t);
				if (resolved) return resolved;
			}
		}

		const byPathMenu = findMenuByRuntimePath(path);
		if (byPathMenu) {
			const localized = resolveMenuLocalizedLabel(byPathMenu);
			if (localized) return localized;
			const resolved = normalizeI18nLabel(byPathMenu.label || byPathMenu.title || byPathMenu.name || path, t);
			if (resolved) return resolved;
		}

		// Keep navigation label as lower priority because it can be stale after language switch.
		if (locationState?.menuLabel) {
			const navLabel = normalizeI18nLabel(locationState.menuLabel, t);
			if (navLabel) return navLabel;
		}

		// 3. Fallback to route definition from flatRouteList
		const routeInfo = flatRouteList[path];
		if (routeInfo?.handle?.title) {
			let label = routeInfo.handle.title;
			// Extract string from React element
			if (isValidElement(label)) {
				label = (label as any)?.props?.children;
			}
			// Translate i18n key
			if (typeof label === 'string' && label.startsWith('common.')) {
				const translated = t(label);
				return normalizeMenuLabel(translated);
			}
			// Convert to string if not already
			const labelStr = String(label);
			const normalizedLabel = normalizeI18nLabel(labelStr, t);
			if (normalizedLabel) return normalizedLabel;
		}

		// 4. Do not fall back to path if an existing label is available.
		const existing = normalizeI18nLabel(tab?.label, t);
		if (existing) return existing;

		return "";
	}, [flatRouteList, menuLookup, t, resolveMenuLocalizedLabel]);

	const resolveTabIcon = useCallback((path: string, tab?: any): React.ReactNode => {
		const tabCandidates = [tab, tab?.menuData, tab?.m_configs].filter(Boolean);
		for (const candidate of tabCandidates) {
			const iconNode = resolveTabIconNode(candidate?.icon, candidate?.m_icon, candidate?.m_icons);
			if (iconNode) return iconNode;
		}

		const menuId = String(
			tab?.menuId
			|| tab?.menuData?.id
			|| tab?.m_configs?.id
			|| "",
		).trim();
		if (menuId) {
			const byId = menuLookup.byId.get(menuId) || menuLookup.byKey.get(menuId);
			const iconNode = resolveTabIconNode(byId?.icon, byId?.m_icon, byId?.m_icons);
			if (iconNode) return iconNode;
		}

		const byPath = menuLookup.byPath.get(path) || menuLookup.byPath.get(removeTrailingSlash(path));
		return resolveTabIconNode(byPath?.icon, byPath?.m_icon, byPath?.m_icons);
	}, [menuLookup]);

	const tabItems: TabItemProps[] = Array.from(openTabs.values()).map(item => {
		const isHome = item.key === "homepage";
		const derivedLabel = isHome
			? t("common.menu.home")
			: deriveTabLabel(item.key, item.historyState || null, item);
		const finalLabel = derivedLabel || (isString(item.label) ? item.label : String(item.label || item.key));
		const iconNode = !isHome && tabbarShowIcon ? resolveTabIcon(item.key, item) : null;
		return {
			...item,
			icon: undefined,
			closable: isHome ? false : (item.closable ?? true),
			draggable: isHome ? false : (item.draggable ?? true),
			label: (
				<div className="relative flex items-center gap-1">
					{iconNode ? <span className="inline-flex items-center justify-center text-[13px] leading-none">{iconNode}</span> : null}
					{finalLabel}
				</div>
			),
		};
	});

	/**
	 * 自定义渲染标签栏，添加右键菜单功能
	 * @param {object} tabBarProps - 标签栏属性
	 * @param {React.ComponentType} DefaultTabBar - 默认标签栏组件
	 * @returns {JSX.Element} 渲染的标签栏
	 */
	const renderTabBar = useCallback<Required<TabsProps>["renderTabBar"]>((tabBarProps, DefaultTabBar) => {
		return (
			<DraggableTabBar
				DefaultTabBar={DefaultTabBar}
				tabBarProps={tabBarProps}
				items={items}
				tabItems={tabItems}
				onClickMenu={onClickMenu}
			/>
		);
	}, [tabItems, items, onClickMenu]);

	// Re-derive labels for restored tabs (e.g., from sessionStorage) to fix stale/wrong titles
	useEffect(() => {
		// Wait for dynamic routes if enabled, so flatRouteList is ready
		if (isDynamicRoutingEnabled && !hasFetchedDynamicRoutes) return;
		const hasMenuIndex = menuLookup.byId.size > 0 || menuLookup.byPath.size > 0 || menuLookup.byKey.size > 0;
		if (!hasMenuIndex) return;
		for (const [key, tab] of openTabs.entries()) {
			const newLabel = deriveTabLabel(key, tab?.historyState || null, tab);
			if (newLabel && newLabel !== tab.label) {
				addTab(key, { ...tab, label: newLabel });
			}
		}
	}, [openTabs, deriveTabLabel, addTab, hasFetchedDynamicRoutes, menuLookup, currentLanguage]);

	/**
	 * 监听路由变化，添加标签页和激活标签页
	 */

	// Chỉ đồng bộ activeKey theo pathname khi URL thực sự đổi.
	// Không phụ thuộc openTabs để tránh reset activeKey về Home ngay sau khi vừa addTab trong SPA mode.
	useEffect(() => {
		const activePath = location.pathname;
		const strippedPath = removeTrailingSlash(activePath);
		const normalizedPath = (strippedPath === "/" || strippedPath === "/home")
			? homePath
			: strippedPath;

		if (closingKeyRef.current && closingKeyRef.current === normalizedPath) {
			closingKeyRef.current = null;
			return;
		}

		const currentOpenTabs = getTabsStore().openTabs;
		// Chỉ setActiveKey khi pathname đã có trong openTabs, không fallback về tab đầu tiên
		if (currentOpenTabs.has(normalizedPath)) {
			const currentActiveKey = getTabsStore().activeKey;
			if (currentActiveKey !== normalizedPath) {
				setActiveKey(normalizedPath);
			}
		}
		// Nếu không có thì không làm gì, tránh ghi đè activeKey khi vừa addTab
	}, [location.pathname, setActiveKey, homePath, getTabsStore]);

	// ĐÃ ĐỒNG BỘ SPA: Không tự động mở tab Home khi vào app, chỉ mở khi click menu

	// ĐÃ ĐỒNG BỘ SPA: Không tự động mở tab Home khi vào '/', chỉ mở khi click menu

	// Khi reload lại trang, nếu activeKey rỗng hoặc không tồn tại trong openTabs thì tự động setActiveKey về tab đầu tiên (ưu tiên / hoặc /home)
	useEffect(() => {
		if (!activeKey || !openTabs.has(activeKey)) {
			const defaultKey = getDefaultTabKey(openTabs);
			if (defaultKey && activeKey !== defaultKey) setActiveKey(defaultKey);
		}
	}, [activeKey, openTabs, setActiveKey]);

	return (
		<div className={classes.tabsContainer}>
			<Tabs
				className={clsx(
					classes.resetTabs,
					tabbarStyleType === "brisk" ? classes.brisk : "",
					tabbarStyleType === "plain" ? classes.plain : "",
					tabbarStyleType === "chrome" ? classes.chrome : "",
					tabbarStyleType === "card" ? classes.card : "",
				)}
				size="small"
				hideAdd
				animated
				onChange={handleChangeTabs}
				activeKey={removeTrailingSlash(activeKey)}
				type="editable-card"
				onEdit={handleEditTabs}
				items={tabItems}
				renderTabBar={renderTabBar}
				tabBarExtraContent={tabBarExtraContent}
			/>
		</div>
	);
}
