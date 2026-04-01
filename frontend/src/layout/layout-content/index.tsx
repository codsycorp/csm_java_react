import { GlobalSpin, Scrollbar } from "#src/components";
import { removeTrailingSlash } from "#src/router/utils";
import { usePermissionStore, usePreferencesStore, useTabsStore } from "#src/store";
import { cn } from "#src/utils";
import { theme } from "antd";
import KeepAlive, { useKeepaliveRef } from "keepalive-for-react";
import { useEffect, useMemo } from "react";
import { useLocation, useOutlet } from "react-router";

export interface LayoutContentProps { }

export default function LayoutContent() {
	const {
		token: { colorBgLayout },
	} = theme.useToken();
	const { pathname } = useLocation();
	const outlet = useOutlet();
	const aliveRef = useKeepaliveRef();
	const isRefresh = useTabsStore(state => state.isRefresh);
	const openTabs = useTabsStore(state => state.openTabs);
	const tabbarEnable = usePreferencesStore(state => state.tabbarEnable);
	const flatRouteList = usePermissionStore(state => state.flatRouteList);
	const transitionName = usePreferencesStore(state => state.transitionName);
	const transitionEnable = usePreferencesStore(state => state.transitionEnable);

	/**
	 * to distinguish different pages to cache
	 */
	// Use normalized pathname only so cache keys are stable and aligned with tab keys.
	const cacheKey = useMemo(() => {
		const homePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
		const normalized = removeTrailingSlash(pathname);
		return normalized === "/" ? homePath : normalized;
	}, [pathname]);

	/**
	 * 当使用关闭当前标签页、关闭右侧标签页、关闭左侧标签页、关闭其他标签页、关闭所有标签页功能时，需要清除这个标签页的缓存
	 */
	useEffect(() => {
		const cacheNodes = aliveRef.current?.getCacheNodes?.();
		cacheNodes?.forEach((node) => {
			if (!openTabs.has(node.cacheKey)) {
				aliveRef.current?.destroy(node.cacheKey);
			}
		});
	}, [openTabs, cacheKey]);

	/**
	 * 关闭多 tab 功能，清空所有的缓存页面
	 */
	useEffect(() => {
		if (!tabbarEnable) {
			const cacheNodes = aliveRef.current?.getCacheNodes?.();
			cacheNodes?.forEach((node) => {
				/* 不包含当前页面 */
				if (node.cacheKey !== cacheKey) {
					aliveRef.current?.destroy(node.cacheKey);
				}
			});
		}
	}, [tabbarEnable, cacheKey]);

	/* KeepAlive 的刷新 */
	useEffect(() => {
		/* 仅在启用标签栏时生效 */
		if (tabbarEnable && isRefresh) {
			aliveRef.current?.refresh();
		}
	}, [isRefresh]);

	/* 路由设置 keepAlive = false 则不缓存页面 */
	const keepAliveExclude = useMemo(() => {
		/**
		 * 如果不开启多 tab 功能，则不需要 KeepAlive 功能
		 * 为了保留页面的切换动画，只需要把所有的路由放到 exclude 数组中
		 */
		if (!tabbarEnable) {
			return Object.keys(flatRouteList);
		}
		return Object.entries(flatRouteList).reduce<string[]>((acc, [key, value]) => {
			if (value.handle.keepAlive === false) {
				acc.push(key);
			}
			return acc;
		}, []);
	}, [flatRouteList, tabbarEnable]);

	return (
		<main
			className="flex h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden"
			style={
				{
					backgroundColor: colorBgLayout,
				}
			}
		>
			<Scrollbar className="h-full w-full min-h-0 min-w-0">
				<GlobalSpin className="h-full w-full min-h-0 min-w-0">
					<KeepAlive
						max={20}
						transition
						duration={300}
						cacheNodeClassName={cn("h-full w-full min-h-0 min-w-0", transitionEnable ? `keepalive-${transitionName}` : undefined)}
						exclude={keepAliveExclude}
						activeCacheKey={cacheKey}
						aliveRef={aliveRef}
					>
						<div className="h-full w-full min-h-0 min-w-0 overflow-hidden">
							{outlet}
						</div>
					</KeepAlive>
				</GlobalSpin>
			</Scrollbar>
		</main>
	);
}
