import { useTranslation } from "react-i18next";
import React,{ useEffect, useMemo } from "react";
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
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.log('[LayoutContent] userId:', userId, 'openTabs:', openTabs, 'pathname:', pathname);
	}, [userId, openTabs, pathname]);


	// SPA: Luôn dùng activeKey làm cacheKey cho SPA tab, riêng tab Trang Chủ luôn là 'homepage'
	const cacheKey = useMemo(() => {
		if (activeKey === "/" || activeKey === "/home" || activeKey === "homepage") return "homepage";
		return activeKey || "homepage";
	}, [activeKey]);

	// SPA: render component theo tab đang active, không phụ thuộc router path




	const tab = openTabs.get(activeKey);
	const resolveRouteByKey = (routeKey: string) => {
		if (!routeKey) return undefined;
		const directRoute = flatRouteList[routeKey];
		if (directRoute) return directRoute;
		if (/^\/system\/grid\/[^/]+$/.test(routeKey)) {
			return flatRouteList["/system/grid/:menuId"];
		}
		if (/^\/system\/(report|kanban)\/[^/]+$/.test(routeKey)) {
			return flatRouteList["/system/grid/:menuId"];
		}
		return undefined;
	};
	let route = resolveRouteByKey(activeKey);
	let PatchedComponent: any = null;
	// Fallback: "homepage" tab key may map to "/" route if path was recently changed
	if (!route && (activeKey === "homepage" || activeKey === "/home")) {
		route = flatRouteList["/"];
	}

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

	let tabProps: any = tab;

	if (route && tab) {
		// Patch lại route động mỗi lần render để lấy đúng Component (chuẩn SPA)
		const patched = patchDynamicRoutesWithComponent([{ ...route, ...tab }]);
		if (patched && patched[0] && patched[0].Component) {
			PatchedComponent = patched[0].Component;
			// Với các tab hệ thống, luôn truyền toàn bộ tab object (tabProps = tab) để AdminPage nhận đủ props động
			// Không dùng staticTabPropsMap cho các tab hệ thống nữa
			// tabProps = tab luôn đúng cho SPA/tabbar
		}
	}
	if (!PatchedComponent) {
		// Fallback về Home nếu không có component động
		// Ưu tiên lấy đúng key đang có trong openTabs/flatRouteList
		let homeKey = "homepage";
		if (!flatRouteList[homeKey] && flatRouteList["/home"]) homeKey = "/home";
		if (!flatRouteList[homeKey] && flatRouteList["/"]) homeKey = "/";
		route = flatRouteList[homeKey];
		PatchedComponent = route && route.Component ? route.Component : null;
		// Lấy đúng tabProps cho Home
		tabProps = openTabs.get(homeKey) || tab;
	}
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
	const TabComponent = PatchedComponent && tabProps
		? () => React.createElement(PatchedComponent, { ...tabProps, decrypt: csmDecrypt })
		: null;

	// KeepAlive logic giữ nguyên
	useEffect(() => {
		const cacheNodes = aliveRef.current?.getCacheNodes?.();
		cacheNodes?.forEach((node) => {
			// Không destroy cache của Trang Chủ và AutoSetup
			if (!openTabs.has(node.cacheKey) && node.cacheKey !== "homepage" && node.cacheKey !== "/auto-setup") {
				aliveRef.current?.destroy(node.cacheKey);
			}
		});
	}, [openTabs, cacheKey]);

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
						max={20}
						transition
						duration={300}
						cacheNodeClassName={transitionEnable ? `keepalive-${transitionName}` : undefined}
						exclude={keepAliveExclude}
						activeCacheKey={cacheKey}
						aliveRef={aliveRef}
					>
						{TabComponent ? <TabComponent /> : null}
					</KeepAlive>
				</GlobalSpin>
			</Scrollbar>
		</main>
	);
}
