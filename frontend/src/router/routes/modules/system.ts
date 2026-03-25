import type { AppRouteRecordRaw } from "#src/router/types";
import { ContainerLayout } from "#src/layout";
import { system } from "#src/router/extra-info";

import { lazy } from "react";

const User = lazy(() => import("#src/pages/system/user"));
const Menu = lazy(() => import("#src/pages/system/menu"));
const AdminPage = lazy(() => import("#src/pages/system/admin"));
const Developer = lazy(() => import("#src/pages/system/developer"));
const Broadcast = lazy(() => import("#src/pages/system/broadcast"));
const PermissionMatrix = lazy(() => import("#src/pages/system/permission-matrix"));

const routes: AppRouteRecordRaw[] = [
	{
		path: "/system",
		Component: ContainerLayout,
		handle: {
			icon: "SettingOutlined",
			title: "common.menu.system",
			order: system,
			roles: ["admin", "dev"],
		},
		children: [
			{
				path: "/system/user",
				Component: User,
				handle: {
					icon: "UserOutlined",
					title: "common.menu.user",
					roles: ["admin", "dev"],
					permissions: [
						"permission:button:add",
						"permission:button:update",
						"permission:button:delete",
					],
				},
			},
			{
				path: "/system/menu",
				Component: Menu,
				handle: {
					icon: "MenuOutlined",
					title: "common.menu.menu",
					roles: ["dev"],
					permissions: [
						"permission:button:add",
						"permission:button:update",
						"permission:button:delete",
					],
				},
			},
			{
				path: "/system/developer",
				Component: Developer,
				handle: {
					icon: "CodeOutlined",
					title: "common.menu.developer",
					roles: ["dev"],
					permissions: [
						"permission:button:add",
						"permission:button:update",
						"permission:button:delete",
					],
				},
			},
			{
				path: "/system/dept",
				Component: AdminPage,
				handle: {
					keepAlive: false,
					icon: "SafetyOutlined",
					title: "common.menu.permissionGroup",
					roles: ["admin", "dev"],
					permissions: [
						"permission:button:add",
						"permission:button:update",
						"permission:button:delete",
					],
				},
			},
			{
				path: "/system/broadcast",
				Component: Broadcast,
				handle: {
					icon: "BellOutlined",
					title: "common.menu.broadcast",
					roles: ["dev"],
				},
			},
			{
				path: "/system/permission-matrix",
				Component: PermissionMatrix,
				handle: {
					icon: "SafetyOutlined",
					title: "Permission Matrix",
					roles: ["admin"],
					permissions: [
						"permission:button:view",
					],
				},
			},
			{
				path: "/system/grid/:menuId",
				Component: AdminPage,
				handle: {
					// Technical route for dynamic grids/reports/code menus
					// Always hidden from sidebar to avoid showing a fixed menu item.
					hideInMenu: true,
					title: "",
					currentActiveMenu: "/system",
				},
			},
			],
		},
	];

	export default routes;