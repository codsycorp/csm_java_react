import { useTranslation } from "react-i18next";
import React,{ useEffect, useMemo, useRef } from "react";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { patchDynamicRoutesWithComponent } from "#src/router/patchDynamicRoutes";
import { GlobalSpin, Scrollbar } from "#src/components";
import { usePermissionStore, usePreferencesStore, useTabsStore } from "#src/store";
import { useUserStore } from "#src/store/user";
import { theme } from "antd";
import KeepAlive, { useKeepaliveRef } from "keepalive-for-react";
import { useLocation } from "react-router";


export interface LayoutContentProps { }

export default function LayoutContent() {
	const { token: { colorBgLayout } } = theme.useToken();
	const { pathname } = useLocation();
	const aliveRef = useKeepaliveRef();
	const isRefresh = useTabsStore(state => state.isRefresh);
	const openTabs = useTabsStore(state => state.openTabs);
	const tabbarEnable = usePreferencesStore(state => state.tabbarEnable);
	const flatRouteList = usePermissionStore(state => state.flatRouteList);
	const transitionName = usePreferencesStore(state => state.transitionName);
	const transitionEnable = usePreferencesStore(state => state.transitionEnable);
	const activeKey = useTabsStore(state => state.activeKey);
	const { i18n } = useTranslation();
	const userId = useUserStore(state => state.userId);
	const userAppId = useUserStore(state => (state.app_id || "").trim());
	const tabComponentCacheRef = useRef<Map<string, any>>(new Map());
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.log('[LayoutContent] userId:', userId, 'openTabs:', openTabs, 'pathname:', pathname);
	}, [userId, openTabs, pathname]);


	const normalizeTabKey = (rawKey: string) => {
		if (rawKey === "/" || rawKey === "/home" || rawKey === "homepage") return "homepage";
		return rawKey || "homepage";
	};

	const normalizedActiveTabKey = useMemo(() => normalizeTabKey(activeKey || "homepage"), [activeKey]);

	const resolveTabAppId = (tabLike: any) => {
		const candidates = [
			tabLike?.appId,
			tabLike?.app_id,
			tabLike?.menuData?.app_id,
			tabLike?.m_configs?.app_id,
			userAppId,
			"csm",
		];
		return String(candidates.find(item => typeof item === "string" && item.trim().length > 0) || "csm").trim();
	};

	const buildScopedCacheKey = (rawKey: string, tabLike: any) => {
		const baseKey = normalizeTabKey(rawKey);
		const appId = resolveTabAppId(tabLike);
		return `${appId}::${baseKey}`;
	};

	const tab = openTabs.get(activeKey);

	// Cache theo app_id + tab key để giữ trạng thái ổn định cho mọi tab (kể cả Trang chủ)
	const cacheKey = useMemo(() => {
		return buildScopedCacheKey(activeKey || "homepage", tab);
	}, [activeKey, tab, userAppId]);

	// SPA: render component theo tab đang active, không phụ thuộc router path




	const standaloneDynamicRouteKeys = new Set(["homepage", "/home", "/auto-setup"]);
	const resolveRouteByKey = (routeKey: string) => {
		if (!routeKey) return undefined;
		const directRoute = flatRouteList[routeKey];
		if (directRoute) {
			// If this is a parent layout-wrapper route (e.g. /auto-setup → ContainerLayout),
			// prefer the index child route (/auto-setup/ → AutoSetup) for SPA tab rendering.
			const indexRoute = flatRouteList[routeKey + "/"];
			if (indexRoute?.Component) {
				return { ...directRoute, Component: indexRoute.Component };
			}
			return directRoute;
		}
		if (/^\/system\/grid\/[^/]+$/.test(routeKey)) {
			return flatRouteList["/system/grid/:menuId"];
		}
		if (/^\/system\/(report|kanban)\/[^/]+$/.test(routeKey)) {
			return flatRouteList["/system/grid/:menuId"];
		}
		return undefined;
	};
	const resolvedTabView = useMemo(() => {
		const cachedComponent = tabComponentCacheRef.current.get(normalizedActiveTabKey);
		let route = resolveRouteByKey(activeKey);
		let PatchedComponent: any = cachedComponent || null;
		let tabProps: any = tab;

		if (!route && (activeKey === "homepage" || activeKey === "/home")) {
			route = flatRouteList["/"];
		}

		if (!PatchedComponent && route && standaloneDynamicRouteKeys.has(activeKey)) {
			PatchedComponent = route.Component || null;
		}

		if (!PatchedComponent && route && tab) {
			const patched = patchDynamicRoutesWithComponent([{ ...route, ...tab }]);
			if (patched && patched[0] && patched[0].Component) {
				PatchedComponent = patched[0].Component;
			}
		}

		if (!PatchedComponent) {
			let homeKey = "homepage";
			if (!flatRouteList[homeKey] && flatRouteList["/home"]) homeKey = "/home";
			if (!flatRouteList[homeKey] && flatRouteList["/"]) homeKey = "/";
			route = flatRouteList[homeKey];
			PatchedComponent = route && route.Component ? route.Component : null;
			tabProps = openTabs.get(homeKey) || tab;
		}

		if (PatchedComponent) {
			tabComponentCacheRef.current.set(normalizedActiveTabKey, PatchedComponent);
		}

		return {
			Component: PatchedComponent,
			tabProps,
		};
	}, [activeKey, tab, flatRouteList, openTabs, normalizedActiveTabKey]);

	// Memo hóa props cho các tab tĩnh để tránh tạo object mới mỗi lần render
	const staticSystemPaths = useMemo(() => ([
		"/system/user", "/system/menu", "/system/developer", "/system/broadcast",
		"/system/dept", "/system/role", "/system/roles", "/system/departments", "/system/branches", "/system/grid/:menuId"
	]), []);
	const staticTabPropsMap = useMemo(() => {
		const map = new Map<string, { key: string; label: any }>();
		for (const path of staticSystemPaths) {
			const staticTab = openTabs.get(path);
			if (staticTab) {
				map.set(path, { key: staticTab.key, label: staticTab.label });
			}
		}
		return map;
	}, [openTabs, staticSystemPaths]);

	const PatchedComponent = resolvedTabView.Component;
	const tabProps = resolvedTabView.tabProps;
	// Log props để debug (luôn log khi render)
	if (PatchedComponent && tabProps) {
		// eslint-disable-next-line no-console
		console.log('TabComponent render:', {
			PatchedComponent,
			tab: tabProps,
			activeKey,
			flatRouteList
		});
	}
	const tabElement = useMemo(() => {
		if (!PatchedComponent || !tabProps) return null;
		return React.createElement(PatchedComponent, { ...tabProps, decrypt: csmDecrypt });
	}, [PatchedComponent, tabProps, cacheKey]);

	// KeepAlive logic giữ nguyên
	useEffect(() => {
		const cacheNodes = aliveRef.current?.getCacheNodes?.();
		const scopedOpenTabKeys = new Set(
			Array.from(openTabs.entries()).map(([tabKey, tabValue]) => buildScopedCacheKey(tabKey, tabValue)),
		);
		const normalizedOpenTabKeys = new Set(
			Array.from(openTabs.keys()).map((tabKey) => normalizeTabKey(tabKey)),
		);
		Array.from(tabComponentCacheRef.current.keys()).forEach((cachedTabKey) => {
			if (!normalizedOpenTabKeys.has(cachedTabKey)) {
				tabComponentCacheRef.current.delete(cachedTabKey);
			}
		});
		cacheNodes?.forEach((node) => {
			const cacheKeyValue = String(node.cacheKey || "");
			const isProtectedHome = cacheKeyValue.endsWith("::homepage");
			const isProtectedAutoSetup = cacheKeyValue.endsWith("::/auto-setup") || cacheKeyValue.endsWith("::auto-setup");
			// Không destroy cache của tab còn mở và các tab bảo vệ
			if (!scopedOpenTabKeys.has(cacheKeyValue) && !isProtectedHome && !isProtectedAutoSetup) {
				aliveRef.current?.destroy(node.cacheKey);
			}
		});
	}, [openTabs, cacheKey, userAppId]);

	useEffect(() => {
		if (!tabbarEnable) {
			const cacheNodes = aliveRef.current?.getCacheNodes?.();
			cacheNodes?.forEach((node) => {
				if (node.cacheKey !== cacheKey) {
					aliveRef.current?.destroy(node.cacheKey);
				}
			});
		}
	}, [tabbarEnable, cacheKey]);

	useEffect(() => {
		if (tabbarEnable && isRefresh) {
			aliveRef.current?.refresh();
		}
	}, [isRefresh]);

	const keepAliveExclude = useMemo(() => {
		if (!tabbarEnable) {
			return Object.keys(flatRouteList);
		}
		   return Object.entries(flatRouteList).reduce<string[]>((acc, [key, value]) => {
			   if (value && value.handle && value.handle.keepAlive === false) {
				   acc.push(key);
			   }
			   return acc;
		   }, []);
	}, [flatRouteList, tabbarEnable]);

	return (
		<main
			className="overflow-y-auto overflow-x-hidden flex-grow"
			style={{ backgroundColor: colorBgLayout }}
		>
			<Scrollbar>
				<GlobalSpin>
					<KeepAlive
						max={Math.max(50, openTabs.size + 10)}
						transition
						duration={300}
						cacheNodeClassName={transitionEnable ? `keepalive-${transitionName}` : undefined}
						exclude={keepAliveExclude}
						activeCacheKey={cacheKey}
						aliveRef={aliveRef}
					>
						{tabElement}
					</KeepAlive>
				</GlobalSpin>
			</Scrollbar>
		</main>
	);
}
