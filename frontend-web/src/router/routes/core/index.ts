import { ROOT_ROUTE_ID } from "#src/router/constants";
import { RouterGuards } from "#src/router/guards";
import { addIdToRoutes } from "#src/router/utils";

import { lazy } from "react";

const WuHome = lazy(() => import("#src/pages/website/wu_home"));

/** 核心路由，根路由的 children */
export const coreRouteRootChildren = addIdToRoutes([]);
export const coreRoutes: any = [
	{
		path: "/",
		id: ROOT_ROUTE_ID,
		Component: RouterGuards,
		children: coreRouteRootChildren,
	},
	{
		path: "*",
		id: "404",
		Component: WuHome,
	},
];
