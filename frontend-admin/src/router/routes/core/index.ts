import { ROOT_ROUTE_ID } from "#src/router/constants";
import { addIdToRoutes } from "#src/router/utils";
import { ContainerLayout } from "#src/layout";
import { lazy } from "react";
import authRoutes from "./auth";
import errorRoutes from "./error";

const Home = lazy(() => import("#src/pages/homepage"));

// Route cho layout admin (chỉ các route quản trị)
export const adminLayoutChildren = addIdToRoutes([
       {
	       path: "homepage",
	       Component: Home,
	       handle: { title: "menu.home", icon: undefined },
       },
	// ...các route quản trị khác sẽ được merge ở index.ts
]);

// Route hệ thống (login, error, ...), KHÔNG bọc ContainerLayout
export const coreRoutes: any = [
	...addIdToRoutes(authRoutes),
	...addIdToRoutes(errorRoutes),
	{
		path: "/",
		id: ROOT_ROUTE_ID,
		Component: ContainerLayout,
		children: adminLayoutChildren,
	},
];
