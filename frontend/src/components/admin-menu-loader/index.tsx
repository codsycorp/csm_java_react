/**
 * MenuContentRenderer - Detects and renders menu content based on type
 * Logic from Vue: csm_baocao.vue (report_name) and csm_grid.vue (table_name)
 * 
 * Usage in admin layout:
 * <MenuContentRenderer menu={selectedMenu} database={db} ... />
 */

import React from "react";
import { Empty } from "antd";
import CsmCrmWorkspace from "../csm-crm/CsmCrmWorkspace";
import CsmDynamicGrid from "../csm-grid/CsmDynamicGrid";
import CsmReport from "../csm-report/CsmReport";

export interface MenuConfig {
	id: string;
	label?: string;
	name: string;
	path?: string;
	type?: "system" | "report" | "grid";
	menuType?: number | string;
	component?: string;
	report_name?: string;
	table_name?: string;
	table?: any[];
	trigger?: Record<string, string>;
	struct?: Record<string, any>;
	crm_config?: Record<string, any> | string;
	m_icons?: string;
	parentId?: string;
	[key: string]: any;
}

export interface MenuContentRendererProps {
	menu: MenuConfig;
	appId?: string;
	database: Record<string, { rows: any[] }>;
	permissions?: number;
	menusPermissions?: Record<string | number, number>;
	decrypt?: (s: string) => string;
	onDataChange?: () => void;
}

/**
 * Get menu type based on config
 * Priority: type field → report_name → table_name → unknown
 */
export function getMenuType(menu: MenuConfig): "system" | "report" | "grid" | "crm" | "unknown" {
	if (menu.type) return menu.type as "system" | "report" | "grid";
	if (Number(menu.type_form || 0) === 5 || menu.crm_config) return "crm";
	if (menu.report_name) return "report";
	if (menu.table_name) return "grid";
	return "unknown";
}

/**
 * System management content placeholder
 */
function SystemContent({ menu }: { menu: MenuConfig }) {
	return (
		<div style={{ padding: "24px", textAlign: "center", color: "#999" }}>
			<h3>{menu.label || menu.name}</h3>
			<p>Quản lý hệ thống: {menu.path || "/system"}</p>
			<code style={{ fontSize: "12px" }}>type: system</code>
		</div>
	);
}

/**
 * Report content placeholder
 */
function ReportContent({ menu, appId, decrypt }: { menu: MenuConfig; appId?: string; decrypt?: (s: string) => string }) {
	return <CsmReport m_configs={menu as any} appId={appId} decrypt={decrypt} />;
}

/**
 * Grid content renderer
 */
function GridContent({
	menu,
	appId,
	database,
	permissions,
	menusPermissions,
	decrypt,
	onDataChange,
}: MenuContentRendererProps) {
	return (
		<CsmDynamicGrid
			appId={appId}
			m_configs={menu as any}
			database={database}
			permissions={permissions}
			menusPermissions={menusPermissions}
			menuId={menu.id}
			decrypt={decrypt}
			onDataChange={onDataChange}
		/>
	);
}

function CrmContent({ menu, appId, database, onDataChange }: MenuContentRendererProps) {
	return <CsmCrmWorkspace appId={appId} menuData={menu as any} database={database} onDataChange={onDataChange} />;
}

/**
 * Main renderer - chooses what to display based on menu type
 * 
 * Logic:
 * - type: "system" → System management component (placeholder)
 * - report_name → Report placeholder (ready for baocao component)
 * - table_name → CsmDynamicGrid (CRUD operations)
 * - else → Empty state
 */
export function MenuContentRenderer({
	menu,
	appId,
	database,
	permissions,
	menusPermissions,
	decrypt,
	onDataChange,
}: MenuContentRendererProps) {
	const menuType = getMenuType(menu);

	switch (menuType) {
		case "system":
			return <SystemContent menu={menu} />;
		case "report":
			return <ReportContent menu={menu} appId={appId} decrypt={decrypt} />;
			case "crm":
				return <CrmContent menu={menu} appId={appId} database={database} onDataChange={onDataChange} />;
		case "grid":
			return (
				<GridContent
					menu={menu}
					appId={appId}
					database={database}
					permissions={permissions}
					menusPermissions={menusPermissions}
					decrypt={decrypt}
					onDataChange={onDataChange}
				/>
			);
		default:
			return <Empty description="Menu type không được hỗ trợ" />;
	}
}

export default MenuContentRenderer;
