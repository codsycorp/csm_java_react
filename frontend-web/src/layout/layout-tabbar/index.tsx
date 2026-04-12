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
	const homePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
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
		const isHome = item.key === (import.meta.env.VITE_BASE_HOME_PATH || "/home");
		return {
			...item,
			closable: isHome ? false : (item.closable ?? true),
			draggable: isHome ? false : (item.draggable ?? true),
			label: (
				<div className="relative flex items-center gap-1">
					{isString(item.label) ? item.label : item.label}
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
		const historyState = openTabs.get(key)?.historyState || { search: "", hash: "" };
		navigate(key + historyState.search + historyState.hash);
	}, [openTabs]);

	/**
	 * 处理标签页编辑（关闭）
	 * @param {React.MouseEvent | React.KeyboardEvent | string} key - 被编辑的标签页的key
	 * @param {string} action - 编辑动作，这里只处理 "remove"
	 */
	const handleEditTabs = useCallback<Required<TabsProps>["onEdit"]>((key, action) => {
		if (action === "remove") {
			const closingKey = key as string;
			const home = import.meta.env.VITE_BASE_HOME_PATH || "/home";
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
			const nextHistory = newTabs.get(nextKey)?.historyState || { search: "", hash: "" };
			navigate(nextKey + nextHistory.search + nextHistory.hash);
		}
	}, [navigate]);

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
	useEffect(() => {
		/**
		 * 以下动作会触发活动标签页被关闭：
		 * 1. 关闭当前标签页
		 * 2. 当使用 关闭左边/右边/其他/所有标签页 功能，激活的标签页被关闭
		 *
		 * 初次进入应用，activeKey 值为空，不触发自动导航
		 */
		const historyState = openTabs.get(activeKey)?.historyState || { search: "", hash: "" };
		const activeFullPath = activeKey + historyState.search + historyState.hash;
		const currentFullpath = location.pathname + location.search + location.hash;
		if (activeKey.length > 0 && activeFullPath !== currentFullpath) {
			navigate(activeFullPath);
		}
	}, [activeKey]);

	/**
	 * 用户刷新当前页面，但不是默认 Tab 页面时，需要添加默认 Tab
	 */
	useEffect(() => {
		// 检查默认 Tab 是否缺失
		const isDefaultTabMissing = !Array.from(openTabs.keys()).includes(import.meta.env.VITE_BASE_HOME_PATH);
		// 检查动态路由是否加载完成
		const isDynamicRoutingReady = !isDynamicRoutingEnabled || hasFetchedDynamicRoutes;

		if (isDefaultTabMissing && isDynamicRoutingReady) {
			const routeTitle = flatRouteList[import.meta.env.VITE_BASE_HOME_PATH]?.handle?.title;
			insertBeforeTab(import.meta.env.VITE_BASE_HOME_PATH, {
				key: import.meta.env.VITE_BASE_HOME_PATH,
				label: isValidElement(routeTitle) ? routeTitle?.props?.children : routeTitle,
				closable: false,
				draggable: false,
			});
		}
	}, [openTabs, insertBeforeTab, hasFetchedDynamicRoutes, flatRouteList]);

	/**
	 * Helper function to derive tab label from various sources
	 * Priority: navigation state > menu tree (for dynamic grids) > route definition
	 */
	const deriveTabLabel = useCallback((path: string, locationState: any): string => {
		// 1. Check navigation state first (passed from menu click)
		if (locationState?.menuLabel) {
			return locationState.menuLabel;
		}

		// 2. For dynamic grid routes, derive from menu tree
		const dynamicMatch = path.match(/\/system\/grid\/(.+)$/);
		if (dynamicMatch && apiWholeMenus) {
			const menuId = dynamicMatch[1];
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
		const homePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
		const activePath = location.pathname;
		const normalizedPathRaw = removeTrailingSlash(activePath);
		const normalizedPath = normalizedPathRaw === "/" ? homePath : normalizedPathRaw;

		// If this navigation is the tab we just closed, skip adding it back
		if (closingKeyRef.current && closingKeyRef.current === normalizedPath) {
			closingKeyRef.current = null;
			return;
		}

		// Always set active key to ensure tab is activated immediately
		setActiveKey(normalizedPath);

		// Derive the label using our centralized helper
		const tabLabel = deriveTabLabel(normalizedPath, location.state);

		// Add or update the tab with the derived label
		const tabData = {
			key: normalizedPath,
			label: tabLabel,
			historyState: {
				search: location.search,
				hash: location.hash,
			},
			closable: normalizedPath !== homePath,
			draggable: normalizedPath !== homePath,
		};
		
		// Always call addTab to ensure label is updated if changed
		addTab(normalizedPath, tabData);
	}, [location, setActiveKey, addTab, deriveTabLabel]);	return (
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
