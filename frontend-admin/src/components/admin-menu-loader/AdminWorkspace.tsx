/**
 * AdminWorkspace - Main admin interface with ribbon menu and dynamic content tabs
 * 
 * Architecture (matching Vue csm_baocao and csm_grid):
 * - Left: Ribbon menu with menu groups and items
 * - Right: Tab container with dynamic content (Reports or Grids)
 * - Logic: menu.report_name → baocao | menu.table_name → grid
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Layout, Menu, Tabs, Spin, Empty, Button, Space, Drawer, Input, Select } from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import type { MenuProps, TabsProps, DrawerProps } from "antd";
import { useTranslation } from "react-i18next";

import CsmCrmWorkspace from "../csm-crm/CsmCrmWorkspace";
import CsmDynamicGrid from "../csm-grid/CsmDynamicGrid";
import CsmReport from "../csm-report/CsmReport";
import { useUserStore } from "#src/store";
import { toPermissionBigInt, isSuperPermissionProfile } from "#src/utils/permission-bitfield";
import { router } from "#src/router";
import type { MenuConfig } from "./index";

const { Sider, Content } = Layout;

export interface AdminWorkspaceProps {
	appId?: string;
	allMenus: MenuConfig[];
	database: Record<string, { rows: any[] }>;
	permissions?: number;
	menusPermissions?: Record<string | number, number>;
	decrypt?: (s: string) => string;
	loading?: boolean;
	isDevMode?: boolean;
}

interface TabItem {
	menuId: string;
	menu: MenuConfig;
	menuType: "system" | "report" | "grid" | "crm" | "unknown";
}

/**
 * Parse menu path to get display label
 */
function getMenuLabel(menu: MenuConfig): string {
	if (menu.label) return menu.label;
	if (menu.name) {
		// Extract last segment from i18n key like "menu.system.management"
		const parts = menu.name.split(".");
		return parts[parts.length - 1];
	}
	return menu.id;
}

/**
 * Get menu type based on menu configuration
 * Logic follows system convention:
 * - menuType 0 = navigation menu (system/component)
 * - report_name = report display
 * - table_name = grid/CRUD display
 * - Containers (menus with children but no action) = system
 */
function getMenuType(menu: MenuConfig): "system" | "report" | "grid" | "crm" | "unknown" {
	// Priority 1: Explicit type field
	if (menu.type === "system") return "system";

	if (Number(menu.type_form || 0) === 5 || menu.crm_config) return "crm";
	
	// Priority 2: Report name
	if (menu.report_name) return "report";
	
	// Priority 3: Table name (grid)
	if (menu.table_name) {
		// console.log(`✅ Menu "${menu.label}" detected as GRID (table_name: ${menu.table_name})`);
		return "grid";
	}
	
	// Priority 4: menuType 0 = navigation/system menu
	if (menu.menuType === 0 || menu.menuType === "0") return "system";
	
	// Priority 5: Has component or path = navigable menu
	if (menu.component || menu.path) return "system";
	
	// Priority 6: Has children (is a container) = treat as system menu for grouping
	if (menu.children && Array.isArray(menu.children) && menu.children.length > 0) {
		// console.log(`✅ Menu "${menu.label}" detected as SYSTEM (has children, is a container)`);
		return "system";
	}
	
	return "unknown";
}

function CrmContent({
	menu,
	appId,
	database,
}: {
	menu: MenuConfig;
	appId?: string;
	database: Record<string, { rows: any[] }>;
}) {
	return <CsmCrmWorkspace appId={appId} menuData={menu as any} database={database as any} />;
}

/**
 * Report placeholder component
 */
function ReportContent({ menu, appId, decrypt }: { menu: MenuConfig; appId?: string; decrypt?: (s: string) => string }) {
	return (
		<CsmReport m_configs={menu as any} appId={appId} decrypt={decrypt} />
	);
}

/**
 * Grid content wrapper
 */
function GridContent({
	menu,
	appId,
	database,
	permissions,
	menusPermissions,
	decrypt,
}: {
	menu: MenuConfig;
	appId?: string;
	database: Record<string, { rows: any[] }>;
	permissions?: number;
	menusPermissions?: Record<string | number, number>;
	decrypt?: (s: string) => string;
}) {
	return (
		<CsmDynamicGrid
			appId={appId}
			m_configs={menu as any}
			database={database}
			permissions={permissions}
			menusPermissions={menusPermissions}
			menuId={menu.id}
			decrypt={decrypt}
		/>
	);
}

/**
 * Main admin workspace component
 */
export function AdminWorkspace({
	appId,
	allMenus,
	database,
	permissions,
	menusPermissions,
	decrypt,
	loading = false,
	isDevMode = false,
}: AdminWorkspaceProps) {
	const { t } = useTranslation();
	const [collapsed, setCollapsed] = useState(false);
	const [activeTab, setActiveTab] = useState<string | null>(null);
	const [openTabs, setOpenTabs] = useState<Map<string, TabItem>>(new Map());
	const [selectedMenuGroup, setSelectedMenuGroup] = useState<string | null>(null);
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
	
	// Detect screen size changes
	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 768);
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);
	
	// Subscribe to selectedMenuIdForTab from store
	const selectedMenuIdForTab = useUserStore(state => state.selectedMenuIdForTab);

	// Debug: Log allMenus structure
	// console.log(`🔍 AdminWorkspace received allMenus: ${allMenus.length} items`);
	allMenus.forEach(menu => {
		const childCount = (menu.children && Array.isArray(menu.children)) ? menu.children.length : 0;
		// console.log(`  - "${menu.label}" (id: ${menu.id}, has children: ${childCount > 0}, children count: ${childCount})`);
		if (childCount > 0 && menu.id === "system") {
			menu.children?.forEach((child: MenuConfig) => {
				// console.log(`    └─ "${child.label}" (id: ${child.id})`);
			});
		}
	});

	// Group menus by parent - handle both flat lists (with parentId) and tree structures (with children)
	const menuGroups = useMemo(() => {
		const groups: Record<string, MenuConfig[]> = {};
		
		// First pass: build groups from parentId (for flat lists)
		allMenus.forEach((menu) => {
			const parentId = menu.parentId || "root";
			if (!groups[parentId]) groups[parentId] = [];
			groups[parentId].push(menu);
		});
		
		// Second pass: if menus have children array, add them to groups (tree structure)
		allMenus.forEach((menu) => {
			if (menu.children && Array.isArray(menu.children) && menu.children.length > 0) {
				if (!groups[menu.id]) groups[menu.id] = [];
				groups[menu.id].push(...menu.children);
			}
		});
		
		return groups;
	}, [allMenus]);

	// Build sidebar menu structure with nested submenu support
	const sidebarMenuItems: MenuProps["items"] = useMemo(() => {
		// Token-first privilege check for admin-level system menu visibility.
		const userState = useUserStore.getState();
		const isAdmin = isSuperPermissionProfile(toPermissionBigInt((userState as any).permissionBitfield));

		// Get root level menus - items without parentId (real root) OR parentId points to non-existent menu
		const allMenuIds = new Set(allMenus.map(m => m.id));
		const allRootMenus = allMenus.filter(menu => {
			// Root if: no parentId, or parentId doesn't exist in menu list
			const isRoot = !menu.parentId || !allMenuIds.has(menu.parentId);
			if (menu.id === "system") {
				// console.log(`🔍 DEBUG: Menu "system" check - id: ${menu.id}, parentId: ${menu.parentId || 'none'}, isRoot: ${isRoot}`);
			}
			return isRoot;
		});

		//console.log(`🔍 DEBUG: allMenus count: ${allMenus.length}, allRootMenus count: ${allRootMenus.length}`);
		// console.log(`🔍 DEBUG: allRootMenus:`, allRootMenus.map(m => ({ id: m.id, label: m.label })));
		// console.log(`🔍 DEBUG: menuGroups keys:`, Object.keys(menuGroups));

		// Helper function to build menu item recursively
		const buildMenuItem = (menu: MenuConfig): any => {
			// Get children from menuGroups (flat lists) or directly from menu.children (tree structure)
			let menuChildren: MenuConfig[] = menuGroups[menu.id] || [];
			
			// If no children found in groups and menu has children array, use those
			if (menuChildren.length === 0 && menu.children && Array.isArray(menu.children)) {
				menuChildren = menu.children;
				// console.log(`🔍 DEBUG: Using menu.children for "${menu.label}" (${menu.id}), found ${menuChildren.length} children`);
			} else if (menuChildren.length > 0) {
				// console.log(`🔍 DEBUG: Using menuGroups for "${menu.label}" (${menu.id}), found ${menuChildren.length} children`);
			} else {
				// console.log(`🔍 DEBUG: No children for "${menu.label}" (${menu.id}), menu.children:`, menu.children?.length || 0);
			}
			
			const validChildren = menuChildren.filter(m => {
				const type = getMenuType(m);
				const isValid = type !== "unknown";
				// console.log(`  ├─ Child: "${m.label || m.name}" (${m.id}, type: ${type}, menuType: ${m.menuType}, path: ${m.path}, table_name: ${m.table_name}) -> ${isValid ? 'VALID' : 'FILTERED OUT'}`);
				if (!isValid) {
					// console.log(`     🔍 Full child object:`, m);
				}
				return isValid;
			});

			// console.log(`🔍 DEBUG: "${menu.label}" (${menu.id}): ${menuChildren.length} total children, ${validChildren.length} valid children`);

			// Base menu item with click handler
			const menuItem: any = {
				key: menu.id,
				label: getMenuLabel(menu),
				onClick: () => {
					const menuType = getMenuType(menu);
					// console.log(`🎯 buildMenuItem onClick: "${menu.label}" (menuType: ${menuType}, path: ${menu.path}, table_name: ${menu.table_name})`);
					
					// Only navigate for navigation menus (not grids/reports)
					// Grids and reports are rendered in tabs, not navigated
					if (menuType === "system" && menu.path) {
						// console.log(`  → NAVIGATING to ${menu.path}`);
						router.navigate(menu.path);
					} else {
						// console.log(`  → NOT navigating (menuType: ${menuType})`);
					}
					// Always open tab (for all menu types)
					handleMenuClick(menu);
				},
			};

			// If has children, add them as submenu
			if (validChildren.length > 0) {
				menuItem.children = validChildren.map(buildMenuItem).filter(Boolean);
				// console.log(`📁 Menu "${menu.label}" (${menu.id}) has ${validChildren.length} valid children`);
			} else if (menu.id === "system") {
				// console.log(`⚠️ WARN: System menu "${menu.label}" has NO valid children! menuChildren:`, menuChildren.map(m => ({ id: m.id, label: m.label })));
			}

			return menuItem;
		};

		const result = allRootMenus
			.filter((parentMenu) => {
				// Filter: System management only for admin
				if (parentMenu.id === "system" || parentMenu.path === "/system") {
					const canShow = isAdmin;
					// console.log(`🔐 System menu filter: "${parentMenu.label}" (${parentMenu.id}) -> ${canShow ? 'SHOW' : 'HIDE'}`);
					return canShow;
				}
				return true;
			})
			.map(buildMenuItem)
			.filter(Boolean);
		
		// console.log(`✅ Final sidebarMenuItems count: ${result.length}`);
		return result;
	}, [menuGroups, t]);

	// Handle menu item click
	const handleMenuClick = useCallback((menu: MenuConfig) => {
		const menuType = getMenuType(menu);
		// console.log(`🔗 Menu clicked: "${menu.label}" (id: ${menu.id}, type: ${menuType})`);
		
		// Create tab if not exists
		const tabItem: TabItem = {
			menuId: menu.id,
			menu,
			menuType,
		};
		
		const newTabs = new Map(openTabs);
		newTabs.set(menu.id, tabItem);
		setOpenTabs(newTabs);
		setActiveTab(menu.id);
		// console.log(`📋 Tab created with type: ${menuType}`);
	}, [openTabs]);

	// Watch selectedMenuIdForTab from store (set by layout menu when user clicks grid/report menu)
	useEffect(() => {
		if (selectedMenuIdForTab) {
			// console.log(`🔔 Selected menu ID from store: ${selectedMenuIdForTab}`);
			// Find the menu with this ID
			const selectedMenu = allMenus.find(m => m.id === selectedMenuIdForTab);
			if (selectedMenu) {
				// console.log(`✅ Found menu in allMenus: "${selectedMenu.label}"`);
				handleMenuClick(selectedMenu);
				// Clear the selection from store
				useUserStore.getState().setSelectedMenuIdForTab("");
			} else {
				console.warn(`⚠️ Menu with ID "${selectedMenuIdForTab}" not found in allMenus`);
			}
		}
	}, [selectedMenuIdForTab, allMenus, handleMenuClick]);

	// Close tab
	const handleCloseTab = useCallback((menuId: string) => {
		const newTabs = new Map(openTabs);
		newTabs.delete(menuId);
		setOpenTabs(newTabs);
		
		// Switch to another tab if closing active
		if (activeTab === menuId) {
			const remaining = Array.from(newTabs.keys());
			setActiveTab(remaining.length > 0 ? remaining[0] : null);
		}
	}, [openTabs, activeTab]);

	// Build tab items
	const tabItems: TabsProps["items"] = useMemo(() => {
		return Array.from(openTabs.values()).map((tabItem) => {
			const { menu, menuType } = tabItem;
			// console.log(`🎨 Rendering tab for: "${menu.label}" with type: ${menuType}`);
			
			let content: React.ReactNode;
			if (menuType === "report") {
				// console.log("  → Rendering ReportContent");
				content = <ReportContent menu={menu} appId={appId} decrypt={decrypt} />;
			} else if (menuType === "crm") {
				content = <CrmContent menu={menu} appId={appId} database={database} />;
			} else if (menuType === "grid") {
				// console.log("  → Rendering GridContent");
				content = (
					<GridContent
						menu={menu}
						appId={appId}
						database={database}
						permissions={permissions}
						menusPermissions={menusPermissions}
						decrypt={decrypt}
					/>
				);
			} else {
				// console.log("  → Rendering Empty");
				content = <Empty description={t("common.noData")} />;
			}
			
			return {
				key: menu.id,
				label: getMenuLabel(menu),
				closable: true,
				children: content,
			};
		});
	}, [openTabs, appId, database, permissions, menusPermissions, decrypt, t]);

	if (loading) {
		return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
	}

	if (allMenus.length === 0) {
		return <Empty description={t("common.noMenus", "Không có menu nào")} />;
	}

	// console.log("🎯 AdminWorkspace render state:");
	// console.log("  - openTabs count:", openTabs.size);
	// console.log("  - activeTab:", activeTab);
	// console.log("  - tabItems count:", tabItems.length);
	// console.log("  - sidebarMenuItems count:", sidebarMenuItems.length);

	return (
		<Layout style={{ minHeight: "100vh" }}>
			{/* Sidebar - responsive: auto-collapse on mobile */}
			<Sider
				collapsible
				collapsed={isMobile ? true : collapsed}
				onCollapse={setCollapsed}
				width={250}
				breakpoint="md"
				collapsedWidth={0}
				style={{
					background: "#001529",
					position: "sticky",
					top: 0,
					left: 0,
					bottom: 0,
					overflowY: "auto",
					zIndex: 100,
				}}
			>
				<div style={{ padding: "16px", textAlign: "center", color: "#fff", fontSize: "16px", fontWeight: "bold" }}>
					{!collapsed && t("common.admin", "Admin")}
				</div>
				<Menu
					theme="dark"
					mode="inline"
					items={sidebarMenuItems}
					selectedKeys={activeTab ? [activeTab] : []}
				/>
			</Sider>

			{/* Main content */}
			<Layout>
				<Content style={{ padding: isMobile ? "12px" : "24px", background: "#fff", overflowX: "auto" }}>
					{openTabs.size === 0 ? (
						<Empty
							description={t("common.selectMenu", "Chọn menu từ bên trái để bắt đầu")}
							style={{ marginTop: "100px" }}
						/>
					) : (
						<Tabs
							activeKey={activeTab || undefined}
							onChange={setActiveTab}
							items={tabItems}
							onEdit={(targetKey, action) => {
								if (action === "remove") {
									handleCloseTab(targetKey as string);
								}
							}}
							type="card"
							size={isMobile ? "small" : "middle"}
						/>
					)}
				</Content>
			</Layout>
		</Layout>
	);
}

export default AdminWorkspace;
