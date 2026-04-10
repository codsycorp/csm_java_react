import type { BreadcrumbProps } from "antd";

import { isString } from "#src/utils";

import { Breadcrumb } from "antd";
import { useTranslation } from "react-i18next";
import { useMatches, useLocation, useParams } from "react-router";
import { useMemo } from "react";
import { usePermissionStore, useUserStore, useTabsStore } from "#src/store";

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
	const openTabs = useTabsStore(state => state.openTabs);
	const activeKey = useTabsStore(state => state.activeKey);
	const tab = openTabs.get(activeKey);

	// Ưu tiên label từ tabbar (tab.label hoặc tab.menuData)
	let tabLabel: string | undefined = undefined;
	if (tab) {
		if (tab.label) {
			tabLabel = isString(tab.label) ? t(tab.label) : tab.label;
		} else if (tab.menuData && (tab.menuData.label || tab.menuData.title || tab.menuData.name)) {
			tabLabel = tab.menuData.label || tab.menuData.title || tab.menuData.name;
		}
	}


	       // Nếu có label từ tabbar, chỉ hiện 1 breadcrumb
	       if (tabLabel) {
		       return (
			       <Breadcrumb
				       className="hidden md:block"
				       separator="->"
				       itemRender={itemRender}
				       items={[{ title: tabLabel, path: activeKey }]}
			       />
		       );
	       }

	       // Nếu là homepage, luôn dịch đúng label
	       if (activeKey === "homepage") {
		       return (
			       <Breadcrumb
				       className="hidden md:block"
				       separator="->"
				       itemRender={itemRender}
				       items={[{ title: t("menu.home"), path: "homepage" }]}
			       />
		       );
	       }

	// Fallback: vẫn dùng matches nếu không có tab (trường hợp đặc biệt)
	return (
		<Breadcrumb
			className="hidden md:block"
			separator="->"
			// https://ant.design/components/breadcrumb#use-with-browserhistory
			itemRender={itemRender}
			items={matches
				.filter(match => match.handle && !match.pathname.endsWith("/"))
				.map((match) => {
					const defaultTitle = isString(match.handle?.title) ? t(match.handle?.title) : match.handle?.title;
					return {
						title: defaultTitle,
						path: match.pathname,
					};
				})}
		/>
	);
}

