/**
 * Initialize menu data for testing - separate file to avoid circular imports
 */

import { request } from "#src/utils";
import type { MenuItemType } from "#src/api/system/menu";

/**
 * Create sample menu data for an app
 */
export async function initializeMenuForApp(appId: string) {
	const sampleMenus: MenuItemType[] = [
		{
			id: "dashboard",
			name: "Dashboard",
			label: "Dashboard",
			path: "/dashboard",
			icon: "DashboardOutlined",
			menuType: 0,
			order: 1,
		},
		{
			id: "system",
			name: "System",
			label: "System Management",
			path: "/system",
			icon: "SettingOutlined",
			menuType: 0,
			order: 2,
			children: [
				{
					id: "system-users",
					name: "Users",
					label: "User Management",
					path: "/system/users",
					icon: "UserOutlined",
					menuType: 0,
					order: 1,
					parentId: "system",
				},
				{
					id: "system-roles",
					name: "Roles",
					label: "Role Management",
					path: "/system/roles",
					icon: "TeamOutlined",
					menuType: 0,
					order: 2,
					parentId: "system",
				},
				{
					id: "system-menu",
					name: "Menu",
					label: "Menu Management",
					path: "/system/menu",
					icon: "MenuOutlined",
					menuType: 0,
					order: 3,
					parentId: "system",
				},
			],
		},
		{
			id: "data",
			name: "Data",
			label: "Data Management",
			path: "/data",
			icon: "DatabaseOutlined",
			menuType: 0,
			order: 3,
			children: [
				{
					id: "data-tables",
					name: "Tables",
					label: "Table Management",
					path: "/data/tables",
					icon: "TableOutlined",
					menuType: 0,
					order: 1,
					parentId: "data",
				},
			],
		},
	];

	try {
		const menuId = `menu_${appId}`;
		const payload = {
			app_id: "csm",
			obj_name: "index",
			command: "create",
			obj_update: {
				id: menuId,
				app_id: "csm",
				data: sampleMenus,
			},
			e_where: {
				field: "id",
				type: "eq",
				value: menuId,
			},
		};

		const response = await request.post<any>("update-table-data", {
			json: payload,
			ignoreLoading: true,
		}).json();

		console.log(`Initialized menu for app ${appId}:`, response);
		return response;
	} catch (error) {
		console.error(`Failed to initialize menu for app ${appId}:`, error);
		throw error;
	}
}
