import type { BreadcrumbProps } from "antd";

import { isString } from "#src/utils";

import { Breadcrumb } from "antd";
import { useTranslation } from "react-i18next";
import { useMatches, useLocation, useParams } from "react-router";
import { useMemo } from "react";
import { usePermissionStore, useUserStore } from "#src/store";

const itemRender: BreadcrumbProps["itemRender"] = (route, params, routes) => {
	const last = routes.indexOf(route) === routes.length - 1;
	return last || !route.path
		? (
			<span>{route.title}</span>
		)
		: (
			<span>{route.title}</span>
			// <NavLink to={route.path}>{route.title}</NavLink>
		);
};

export function BreadcrumbViews() {
	const { t } = useTranslation();
	const matches = useMatches();
	const location = useLocation();
	const params = useParams();
	const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
	const selectedMenuIdForTab = useUserStore(state => state.selectedMenuIdForTab);

	// Check if current route has custom menu label (from navigation state)
	const customLabel = (location.state as any)?.menuLabel;

	// Derive label from menu tree when page reload loses state
	const derivedLabel = useMemo(() => {
		// Prefer id from params (system/grid/:menuId) then store
		const menuId = params.menuId || selectedMenuIdForTab;
		if (!menuId) return undefined;

		const findMenuInTree = (menus: any[], targetId: string): any => {
			for (const menu of menus) {
				if (menu.id === targetId || menu.key === targetId) return menu;
				if (menu.children && menu.children.length) {
					const found = findMenuInTree(menu.children, targetId);
					if (found) return found;
				}
			}
			return null;
		};

		const menu = findMenuInTree(apiWholeMenus || [], menuId as string);
		if (!menu) return undefined;

		const rawLabel = menu.label || menu.title || menu.name || menuId;
		return rawLabel.replace(/^[\d\.\s]+/, "").trim();
	}, [apiWholeMenus, params.menuId, selectedMenuIdForTab]);

	const effectiveLabel = customLabel || derivedLabel;

	// If there is an effective label (from state or derived), only show that as breadcrumb
	if (effectiveLabel) {
		return (
			<Breadcrumb
				className="hidden md:block"
				separator="->"
				itemRender={itemRender}
				items={[{ title: effectiveLabel, path: location.pathname }]}
			/>
		);
	}

	return (
		<Breadcrumb
			className="hidden md:block"
			separator="->"
			// https://ant.design/components/breadcrumb#use-with-browserhistory
			itemRender={itemRender}
			items={matches
				// filter - root route & index route
				.filter(match => match.handle && !match.pathname.endsWith("/"))
				.map((match) => {
					const isCurrentRoute = match.pathname === location.pathname;
					const defaultTitle = isString(match.handle?.title) ? t(match.handle?.title) : match.handle?.title;
					
					// Use custom label for current route if available
					return {
						title: isCurrentRoute && customLabel ? customLabel : defaultTitle,
						path: match.pathname,
					};
				})}
		/>
	);
}

