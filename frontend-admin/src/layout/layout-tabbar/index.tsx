import type { TabItemProps } from "#src/store";
import type { TabsProps } from "antd";

import { useCurrentRoute } from "#src/hooks";
import { isDynamicRoutingEnabled } from "#src/router/routes/config";
import { removeTrailingSlash } from "#src/router/utils";
import { usePermissionStore, usePreferencesStore, useTabsStore, useUserStore } from "#src/store";
import { isString } from "#src/utils";

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

// Helper: ưu tiên chọn tab Home nếu có
function getDefaultTabKey(openTabs: Map<string, any>) {
	if (openTabs.has("/")) return "/";
	if (openTabs.has("/home")) return "/home";
	const first = openTabs.keys().next();
	return first && typeof first.value === "string" ? first.value : "";
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

	const { tabbarStyleType, tabbarShowMaximize, tabbarShowMore } = usePreferencesStore();
	const { flatRouteList, hasFetchedDynamicRoutes, apiWholeMenus } = usePermissionStore();
	const selectedMenuIdForTab = useUserStore(state => state.selectedMenuIdForTab);
	const { activeKey, isRefresh, setActiveKey, setIsRefresh, openTabs, addTab, insertBeforeTab } = useTabsStore();
	const homePath = "/home";
	const closingKeyRef = useRef<string | null>(null);
	
	// Get store instance for direct access (not reactive)
	const getTabsStore = useTabsStore.getState;
	
	const [items, onClickMenu] = useDropdownMenu();

	// Debug: Log openTabs to see what's stored
	// useEffect(() => {
	// 	console.log('📊 [openTabs State]', Array.from(openTabs.entries()).map(([key, value]) => ({
	// 		path: key,
	// 		label: value.label
	// 	})));
	// }, [openTabs]);

	const tabItems: TabItemProps[] = Array.from(openTabs.values()).map(item => {
		const isHome = item.key === "homepage";
		return {
			...item,
			closable: isHome ? false : (item.closable ?? true),
			draggable: isHome ? false : (item.draggable ?? true),
			       label: (
				       <div className="relative flex items-center gap-1">
					       {isHome ? t("common.menu.home") : (isString(item.label) ? item.label : item.label)}
				       </div>
			       ),
		};
	});

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
		// Nếu user click vào '/home', chuyển thành '/'
		const normalizedKey = key === "/home" ? "/" : key;
		setActiveKey(normalizedKey);
	}, [setActiveKey]);

	/**
	 * 处理标签页编辑（关闭）
	 * @param {React.MouseEvent | React.KeyboardEvent | string} key - 被编辑的标签页的key
	 * @param {string} action - 编辑动作，这里只处理 "remove"
	 */
	 const handleEditTabs = useCallback<Required<TabsProps>["onEdit"]>((key, action) => {
	 	if (action === "remove") {
	 		const closingKey = key as string;
	 		const home = "/home";
	 		const state = useTabsStore.getState();

	 		// Cannot close home
	 		if (closingKey === home) return;

	 		const newTabs = new Map(state.openTabs);
	 		newTabs.delete(closingKey);
	 		if (!newTabs.has(home) && state.openTabs.has(home)) {
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
	 }, []);

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
	const deriveTabLabel = useCallback((path: string, locationState: any): string => {
		const SYSTEM_TAB_LABEL_MAP: Record<string, string> = {
			"/system/dept": "common.menu.permissionGroup",
			"/system/departments": "common.menu.dept",
			"/system/branches": "common.menu.branch",
			"/system/user": "common.menu.user",
		};

		const canonicalSystemLabelKey = SYSTEM_TAB_LABEL_MAP[path];
		if (canonicalSystemLabelKey) {
			return t(canonicalSystemLabelKey);
		}

		// 1. Check navigation state first (passed from menu click)
		if (locationState?.menuLabel) {
			return locationState.menuLabel;
		}


		// 2. For dynamic grid/report routes, derive from menu tree
		const gridMatch = path.match(/\/system\/grid\/(.+)$/);
		const reportMatch = path.match(/\/system\/report\/(.+)$/);
		const menuId = gridMatch?.[1] || reportMatch?.[1];
		if (menuId && apiWholeMenus) {
			const findMenuInTree = (menus: any[], targetId: string): any => {
				const targetStr = String(targetId);
				for (const menu of menus) {
					const menuIdStr = menu.id != null ? String(menu.id) : undefined;
					const menuKeyStr = menu.key != null ? String(menu.key) : undefined;
					if (menuIdStr === targetStr || menuKeyStr === targetStr) return menu;
					if (menu.children?.length) {
						const found = findMenuInTree(menu.children, targetId);
						if (found) return found;
					}
				}
				return null;
			};

			const menu = findMenuInTree(apiWholeMenus, menuId);
			if (menu) {
				const rawLabel = menu.label || menu.title || menu.name || menuId;
				const cleanLabel = rawLabel.replace(/^[\d\.\s]+/, "").trim();
				return cleanLabel;
			}
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
				return translated;
			}
			// Convert to string if not already
			const labelStr = String(label);
			return labelStr;
		}

		// 4. Last resort: use path as label
		return path;
	}, [apiWholeMenus, flatRouteList, t]);

	// Re-derive labels for restored tabs (e.g., from sessionStorage) to fix stale/wrong titles
	useEffect(() => {
		// Wait for dynamic routes if enabled, so flatRouteList is ready
		if (isDynamicRoutingEnabled && !hasFetchedDynamicRoutes) return;
		for (const [key, tab] of openTabs.entries()) {
			const newLabel = deriveTabLabel(key, null);
			if (newLabel && newLabel !== tab.label) {
				addTab(key, { ...tab, label: newLabel });
			}
		}
	}, [openTabs, deriveTabLabel, addTab, hasFetchedDynamicRoutes]);

	/**
	 * 监听路由变化，添加标签页和激活标签页
	 */
	useEffect(() => {
		// '/' luôn là Home, không còn '/home'
		const activePath = location.pathname;
		const normalizedPath = activePath === "/home" ? "/" : removeTrailingSlash(activePath);

		if (closingKeyRef.current && closingKeyRef.current === normalizedPath) {
			closingKeyRef.current = null;
			return;
		}

		setActiveKey(normalizedPath);
	}, [location, setActiveKey]);

	// ĐÃ ĐỒNG BỘ SPA: Không tự động mở tab Home khi vào app, chỉ mở khi click menu

	// ĐÃ ĐỒNG BỘ SPA: Không tự động mở tab Home khi vào '/', chỉ mở khi click menu

	// Khi reload lại trang, nếu activeKey rỗng hoặc không tồn tại trong openTabs thì tự động setActiveKey về tab đầu tiên (ưu tiên / hoặc /home)
	useEffect(() => {
		if (!activeKey || !openTabs.has(activeKey)) {
			const defaultKey = getDefaultTabKey(openTabs);
			if (defaultKey) setActiveKey(defaultKey);
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
