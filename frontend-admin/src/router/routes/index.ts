import type { AppRouteRecordRaw, RouteFileModule } from "#src/router/types";

import { ascending, mergeRouteModules } from "#src/router/utils";
import { coreRouteRootChildren, coreRoutes } from "./core";

// 前端静态路由文件
export const staticRouteFiles: RouteFileModule = import.meta.glob([
	"./static/about.ts",
	"./static/auto-setup.ts",
	"./static/home.ts",
	"./static/iframe.ts",
	"./static/personal-center.ts",
	"./static/routeNest.ts",
], { eager: true }) as RouteFileModule;

/**
 * 后端动态路由文件
 * 这个目录没有意义，只是为了方便管理和后端对接的路由
 * 如果后端接口报错或其他原因不可用，可以临时启用这个目录，防止项目无法访问
 */
export const dynamicRouteFiles: RouteFileModule = import.meta.glob([
	"./modules/system.ts",
], { eager: true }) as RouteFileModule;

/** 动态路由 */
const dynamicRoutes: AppRouteRecordRaw[] = mergeRouteModules(dynamicRouteFiles);

/** 静态路由 */
const staticRoutes: AppRouteRecordRaw[] = mergeRouteModules(staticRouteFiles);


// Đảm bảo '/' luôn là Home
import { lazy } from "react";
const Home = lazy(() => import("#src/pages/home"));
const rootChildRoutes = ascending([
   {
	   path: "/",
	   Component: Home,
	   handle: {
		   title: "Home",
		   icon: undefined,
	   },
   },
   ...coreRouteRootChildren,
   ...dynamicRoutes,
   ...staticRoutes,
]);

coreRoutes[0].children = rootChildRoutes;
/**
 * 路由列表，包含所有的路由，用于初始化路由
 */
const routes: AppRouteRecordRaw[] = coreRoutes;

export {
	rootChildRoutes,
	routes,
};
