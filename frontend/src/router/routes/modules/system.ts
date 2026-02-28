import type { AppRouteRecordRaw } from "#src/router/types";
import { ContainerLayout } from "#src/layout";
import { system } from "#src/router/extra-info";

import { lazy } from "react";

const User = lazy(() => import("#src/pages/system/user"));
const Dept = lazy(() => import("#src/pages/system/dept"));
const Role = lazy(() => import("#src/pages/system/role"));
const Menu = lazy(() => import("#src/pages/system/menu"));
const AdminPage = lazy(() => import("#src/pages/system/admin"));
const Developer = lazy(() => import("#src/pages/system/developer"));
const Broadcast = lazy(() => import("#src/pages/system/broadcast"));

const routes: AppRouteRecordRaw[] = [
	{
		path: "/system",
		Component: ContainerLayout,
		handle: {
			icon: "SettingOutlined",
			title: "common.menu.system",
			order: system,
			roles: ["dev"], // Only dev users can access system menu
		},
		children: [
			{
				path: "/system/user",
				Component: User,
				handle: {
					icon: "UserOutlined",
					title: "common.menu.user",
					roles: ["dev"],
					permissions: [
						"permission:button:add",
						"permission:button:update",
						"permission:button:delete",
					],
				},
			},
			{
				path: "/system/role",
				Component: Role,
				handle: {
					icon: "TeamOutlined",
					title: "common.menu.role",
					roles: ["dev"],
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
				Component: Dept,
				handle: {
					keepAlive: false,
					icon: "ApartmentOutlined",
					title: "common.menu.dept",
					roles: ["dev"],
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
				path: "/system/grid/:menuId",
				Component: AdminPage,
				handle: {
					// Hidden route for dynamic grids; not part of sidebar menu
					icon: "TableOutlined",
					title: "Dynamic Grid",
				},
			},
			],
		},
	];

	export default routes;