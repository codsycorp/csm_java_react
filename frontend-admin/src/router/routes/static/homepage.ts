import type { AppRouteRecordRaw } from "#src/router/types";
import { ContainerLayout } from "#src/layout";

import { $t } from "#src/locales";
import { home } from "#src/router/extra-info";
import { HomeFilled } from "@ant-design/icons";
import { createElement, lazy } from "react";

const Home = lazy(() => import("#src/pages/homepage/index.js"));

const routes: AppRouteRecordRaw[] = [
	{
		path: "homepage",
		Component: ContainerLayout,
		handle: {
			order: home,
			title: $t("home"),
			icon: createElement(HomeFilled),
			// keepAlive: true (default)
		},
		children: [
			{
				index: true,
				Component: Home,
				handle: {
					title: $t("home"),
					icon: createElement(HomeFilled),
					// keepAlive: true (default)
				},
			},
		],
	},
];

export default routes;
