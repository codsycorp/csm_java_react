import CsmDynamicGrid from "#src/components/csm-grid/CsmDynamicGrid";
import CsmMasterDetail from "#src/components/csm-grid/CsmMasterDetail";
import CsmReport from "#src/components/csm-report/CsmReport";
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useAppStore, useUserStore, usePermissionStore, useTabsStore } from "#src/store";
import { Empty, Spin, Alert } from "antd";
import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router";
import { getTableData } from "#src/components/csm-grid/CsmApi";
import { useTranslation } from "react-i18next";
// Import hàm hỗ trợ đa ngôn ngữ
import { getLocalizedField, SupportedLanguage } from "#src/utils/i18nHelper";

interface MenuData {
	id: string;
	label: string;
	table_name?: string;
	report_name?: string;
	type_form?: "" | 1 | 2;
	row_type_edit?: 0 | 1;
	[key: string]: any;
}

/**
 * AdminPage - Renders dynamic grid/report based on menuId parameter
 * Integrates with layout tabbar system for tab-based navigation
 */
export default function AdminPage() {
	const { menuId } = useParams<{ menuId: string }>();
	const location = useLocation();
	const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
	// Prefer reactive currentAppId from AppStore; fallback to user.app_id
	const currentAppId = useAppStore(state => state.currentAppId);
	const userAppId = useUserStore(state => state.app_id);
	// Prefer logged-in user's app_id; fallback to selected app or localStorage default
	const appId = (userAppId && userAppId.trim())
		|| (currentAppId && currentAppId.trim())
		|| useAppStore.getState().getCurrentAppId();
	const selectedMenuIdForTab = useUserStore(state => state.selectedMenuIdForTab);
	const { addTab } = useTabsStore();
	const { t, i18n } = useTranslation();
	
	const [menuData, setMenuData] = useState<MenuData | null>(null);
	const [loading, setLoading] = useState(true);
	const [database, setDatabase] = useState<Record<string, any>>({});
	const [dbLoading, setDbLoading] = useState(false);
	const [dbError, setDbError] = useState<string | null>(null);
	const [reloadTrigger, setReloadTrigger] = useState(0);

	// Merge in-memory updates from grids immediately without forcing a server reload
	const handleDataChange = (newData: Record<string, { rows: any[] }>) => {
		setTimeout(() => {
			setDatabase(prev => ({ ...prev, ...newData }));
		}, 0);
	};

	// Known system menu fallback map for translation when API lacks multilingual fields
	const SYSTEM_MENU_I18N_MAP: Record<string, string> = {
		"/system": "common.menu.system",
		"system": "common.menu.system",
		"/system/user": "common.menu.user",
		"user": "common.menu.user",
		"/system/role": "common.menu.role",
		"role": "common.menu.role",
		"/system/menu": "common.menu.menu",
		"menu": "common.menu.menu",
		"/system/developer": "common.menu.developer",
		"developer": "common.menu.developer",
		"/system/dept": "common.menu.dept",
		"dept": "common.menu.dept",
	};

	const resolveDisplayLabel = (menu: any): string => {
		const rawLabel = menu?.label || menu?.name || menu?.id || "";
		if (typeof rawLabel === "string" && rawLabel.includes(".")) {
			return t(rawLabel);
		}
		const mappedKey = [menu?.path, menu?.key, menu?.id, menu?.name]
			.map((k: any) => (typeof k === "string" ? SYSTEM_MENU_I18N_MAP[k] : undefined))
			.find(Boolean);
		if (mappedKey) return t(mappedKey);
		// Strip numerical prefixes like "19. Label"
		return typeof rawLabel === "string" ? rawLabel.replace(/^[\d\.\s]+/, "").trim() : rawLabel;
	};

	// Find menu in tree or get from location state
	useEffect(() => {
		// Try to get menu data from navigation state first (faster)
		const locationState = location.state as any;
		if (locationState?.menuData) {
			const withLabel = {
				...locationState.menuData,
				label: resolveDisplayLabel(locationState.menuData),
			};
			setMenuData(withLabel);
			setLoading(false);
			if (selectedMenuIdForTab === menuId) {
				useUserStore.getState().setSelectedMenuIdForTab("");
			}
			return;
		}

		// Fallback: search in tree
		const findMenuInTree = (menus: any[], targetId: string): any => {
			for (const menu of menus) {
				// Match by id, key, or path to support routes like /system/user and /system/role
				if (menu.id === targetId || menu.key === targetId || menu.path === targetId) return menu;
				if (menu.children?.length) {
					const found = findMenuInTree(menu.children, targetId);
					if (found) return found;
				}
			}
			return null;
		};
		// Use menuId from params if available, else fallback to current pathname
		const targetId = menuId || location.pathname;
		if (targetId) {
			let found = apiWholeMenus.length > 0 ? findMenuInTree(apiWholeMenus, targetId) : null;
			// If not found or missing table_name, apply known fallbacks
			if (!found || !found.table_name) {
				   const FALLBACK_MENU_MAP: Record<string, any> = {
					   "/system/user": {
						   id: "user",
						   path: "/system/user",
						   label: t("common.menu.user"),
						   table_name: "csm_accounts",
						   app_id: "csm",
						   type_form: 1,
						   row_type_edit: 0,
						   g_readonly: false,
					   },
					   "/system/role": {
						   id: "role",
						   path: "/system/role",
						   label: t("common.menu.role"),
						   table_name: "csm_roles",
						   app_id: "csm",
						   type_form: 1,
						   row_type_edit: 0,
						   g_readonly: false,
					   },
					   // Add more fallbacks here if needed
				   };
				   const fb = FALLBACK_MENU_MAP[targetId];
				   if (fb) {
					   found = fb;
				   }
			}
			const withLabel = found ? { ...found, label: resolveDisplayLabel(found) } : found;
			setMenuData(withLabel);
			setLoading(false);
			
			// Update tab label when loaded from tree (e.g., after page reload)
			if (withLabel?.label) {
				const cleanLabel = resolveDisplayLabel(withLabel);
				addTab(location.pathname, {
					key: location.pathname,
					label: cleanLabel,
					closable: true,
					draggable: true,
					historyState: { search: location.search, hash: location.hash },
				});
				useTabsStore.getState().setActiveKey(location.pathname); // Kích hoạt tab ngay sau khi thêm
			}
			
			// Clear stored menuId
			if (selectedMenuIdForTab === menuId) {
				useUserStore.getState().setSelectedMenuIdForTab("");
			}
		}
	}, [menuId, apiWholeMenus, selectedMenuIdForTab, location.state, location.pathname, location.search, location.hash, addTab]);

	// Di chuyển hàm loadTableData ra ngoài useEffect để có thể tái sử dụng
	const loadTableData = async () => {
		if (!menuData?.table_name) return;

		setDbLoading(true);
		setDbError(null);
		try {
			const rawTableName = menuData.table_name;
			const tableList = rawTableName.split(",").map(s => s.trim()).filter(Boolean);
			const primaryTable = tableList[0];
			const defaultFilter = {
				operator: "AND" as const,
				conditions: [{ field: "id", type: "like", value: "" }]
			};

			// Use menu-specific app_id if available, otherwise fall back to global appId
			const effectiveAppId = menuData.app_id || appId;

			const response = await getTableData<any>({
				app_id: effectiveAppId,
				obj_name: primaryTable,
				where: defaultFilter
			});

			const rows = response.rows || response.data || [];
			const deduped = Array.from(new Map(rows.map((r: any) => [r.id, r])).values());
			const fieldsPK = response.fieldsPK || ["id"];

			const newDatabase: Record<string, any> = {
				[primaryTable]: { rows: deduped, fieldsPK: fieldsPK }
			};

			// If multiple tables are defined, load companion tables into database (for triggers/cbo_query)
			if (tableList.length > 1) {
				for (const t of tableList.slice(1)) {
					try {
						const resT = await getTableData<any>({ app_id: effectiveAppId, obj_name: t, where: defaultFilter });
						const rowsT = (resT as any).rows || (resT as any).data || [];
						const pkT = (resT as any).fieldsPK || ["id"];
						newDatabase[t] = { rows: rowsT, fieldsPK: pkT };
						   // ...existing code...
					} catch (e) {
						console.warn(`⚠️ Failed to load companion table ${t}:`, (e as any)?.message);
					}
				}
			}

			// Extract dependency tables from trigger config
			const dependencyTables = new Set<string>();
			if (menuData && menuData.trigger && typeof menuData.trigger === 'object') {
				Object.values(menuData.trigger).forEach((trigger: any) => {
					if (trigger?.query && Array.isArray(trigger.query)) {
						trigger.query.forEach((q: any) => {
							if (q.obj_name) {
								// Support comma-separated obj_name in trigger queries
								const names = String(q.obj_name).split(",").map((s: string) => s.trim()).filter(Boolean);
								names.forEach((n: string) => dependencyTables.add(n));
							}
						});
					}
				});
			}

			// Load dependency tables
			for (const depTable of dependencyTables) {
				try {
					const depResponse = await getTableData<any>({
						app_id: effectiveAppId,
						obj_name: depTable,
						where: defaultFilter
					});
					const depRows = (depResponse as any).rows || (depResponse as any).data || [];
					const depFieldsPK = (depResponse as any).fieldsPK || ["id"];
					newDatabase[depTable] = { rows: depRows, fieldsPK: depFieldsPK };
					   // ...existing code...
				} catch (depErr: any) {
					console.warn(`⚠️ Failed to load dependency table ${depTable}:`, depErr?.message);
				}
			}
			
			// Update both local state AND global store database
			setDatabase(newDatabase);
			
			// Update global store so CsmDynamicGrid can access the data
			const currentStoreDb = useAppStore.getState().getDatabase();
			useAppStore.getState().setDatabase({
				...currentStoreDb,
				...newDatabase
			});
			
			console.log('💾 Database updated (local + global store):', Object.keys(newDatabase));
		} catch (err: any) {
			const msg = err?.message || "Failed to load table data";
			setDbError(msg);
			console.error("❌ Load table data failed:", err);
		} finally {
			setDbLoading(false);
		}
	};

	// Load table data from API when menuData changes
	useEffect(() => {
		loadTableData();
	}, [menuData?.table_name, appId, reloadTrigger]);

	// Refresh function for data changes
	const refreshDatabase = () => {
		// ...existing code...
		setReloadTrigger(prev => prev + 1);
	};

	// Theo dõi thay đổi ngôn ngữ và cập nhật giao diện
	useEffect(() => {
		const handleLanguageChange = () => {
			setDatabase({}); // Xóa dữ liệu cũ
			setReloadTrigger(prev => prev + 1); // Kích hoạt render lại lưới

			// Tải lại dữ liệu lưới
			if (menuData?.table_name) {
				loadTableData();
			}
		};

		i18n.on('languageChanged', handleLanguageChange);
		return () => {
			i18n.off('languageChanged', handleLanguageChange);
		};
	}, [i18n, menuData]);

	if (loading || dbLoading) {
		return (
			<div style={{ padding: 24, textAlign: "center" }}>
				<Spin size="large" />
				<p style={{ marginTop: 16, color: "#666" }}>
					{loading ? "Đang tải menu..." : "Đang tải dữ liệu..."}
				</p>
			</div>
		);
	}

	if (!menuData) {
		return <Empty description="Menu not found" />;
	}

	if (dbError) {
		return (
			<div style={{ padding: 24 }}>
				<Alert
					message="Lỗi tải dữ liệu"
					description={dbError}
					type="error"
					showIcon
				/>
			</div>
		);
	}

	// Use menu-specific app_id if available, otherwise fall back to global appId
	const effectiveAppId = menuData.app_id || appId;

	// Render grid
	if (menuData.table_name) {
		// Extract type_form and row_type_edit from backend, with support for override
		let typeForm: "" | 1 | 2 = menuData.type_form || "";
		let rowTypeEdit: 0 | 1 = menuData.row_type_edit ?? 0;
		
		// Check localStorage for overrides (for testing purposes)
		// Can be set via: localStorage.setItem(`${menuId}:type_form`, "1")
		// localStorage.setItem(`${menuId}:row_type_edit`, "1")
		try {
			const storedTypeForm = localStorage.getItem(`${menuId}:type_form`);
			const storedRowTypeEdit = localStorage.getItem(`${menuId}:row_type_edit`);
			if (storedTypeForm === "" || storedTypeForm === "1" || storedTypeForm === "2") {
				typeForm = storedTypeForm as "" | 1 | 2;
			}
			if (storedRowTypeEdit === "0" || storedRowTypeEdit === "1") {
				rowTypeEdit = parseInt(storedRowTypeEdit, 10) as 0 | 1;
			}
		} catch (e) {
			// localStorage not available
		}
		
		// Fallback: try to find type_form and row_type_edit in the table configuration
		if (!typeForm && menuData.table && Array.isArray(menuData.table)) {
			const typeFormField = menuData.table.find((f: any) => f.f_name === "type_form");
			if (typeFormField && menuData.table_name === "csm_menu") {
				// If we're in csm_menu table, try to get the current menu's type_form
				// This is stored as a table field value, not in the menu metadata
			}
		}
		
		// Transform menu data to m_configs format expected by CsmDynamicGrid
		const m_configs = {
			id: menuData.id,
			label: menuData.label,
			table_name: menuData.table_name,
			table: menuData.table || [],
			trigger: menuData.trigger || {},
			g_readonly: menuData.g_readonly,
			table_pagesize: menuData.table_pagesize,
			type_form: typeForm,
			row_type_edit: rowTypeEdit,
			struct: {
				...(menuData.struct || {}),
				fieldsPK: database[menuData.table_name]?.fieldsPK || menuData.struct?.fieldsPK || ["id"]
			}
		};

		// If columns are missing, auto-generate sensible defaults for known tables
		if ((!m_configs.table || m_configs.table.length === 0) && menuData.table_name) {
			const rows = database[menuData.table_name]?.rows || [];
			const firstRow = rows[0] || {};
			// Default column headers mapping (Vietnamese i18n keys used where applicable)
			// Cập nhật ánh xạ trong DEFAULT_HEADERS
			const DEFAULT_HEADERS: Record<string, string> = {
				id: "ID",
				username: "common.username",
				email: "common.email",
				avatar: "Avatar",
				phoneNumber: "common.phoneNumber",
				description: "common.description",
				roles: "Roles",
				actived: "common.active",
				permissions: "Permissions",
				menusPermissions: "Menu Permissions",
				group_rights: "Group Rights",
				full_name: "common.fullName",
				user_address: "common.address",
				app_id: "common.appId",
				app_token: "common.appToken",
				refresh: "Refresh Token",
				picture: "common.picture",
				userid: "common.userId",
				pass: "common.password",
				active: "common.active",
				action: "common.action",
			};
			const keys = Object.keys(firstRow);
			// If no rows yet, choose a sensible schema for csm_accounts
			const fallbackKeys = [
				"id", "username", "email", "avatar", "phoneNumber", "description", "roles", "actived",
				"permissions", "menusPermissions", "group_rights", "full_name", "user_address", "app_id", "app_token", "refresh",
				"picture", "userid", "pass", "app_token", "app_id", "active", "action"
			];
			const fields = (keys.length ? keys : fallbackKeys).map((k) => ({
				f_name: k,
				f_header: t(DEFAULT_HEADERS[k] || k), // Sử dụng hàm `t` để dịch tiêu đề cột
				f_show: 1,
				f_types: k === "id" ? "number" : "string",
				f_align: k === "id" ? "right" : "left",
			}));
			m_configs.table = fields as any;
		}
		
		// Debug log to check if backend returned type_form and row_type_edit
		   // ...existing code...

		// If this is a Master-Detail config (type_form=2 and has nodes), render master grid + detail tabs
		// Define master-detail configurations here
		const MASTER_DETAIL_CONFIGS: Record<string, any[]> = {
			// Example: 'hld_nhapvt': [detail config 1, detail config 2]
			// Uncomment and configure when needed
		};

		let nodes = MASTER_DETAIL_CONFIGS[menuData.table_name!] || [];
		
		// Log menuData to check for nodes or children
		   // ...existing code...
		
		// If no hardcoded config, try to get from backend/menuData
		if (nodes.length === 0 && (menuData as any).nodes) {
			nodes = (menuData as any).nodes;
			   // ...existing code...
		}
		
		// Try children if nodes not found
		if (nodes.length === 0 && (menuData as any).children && Array.isArray((menuData as any).children)) {
			const children = (menuData as any).children;
			// Filter children that might be detail tables (have table_name)
			nodes = children.filter((c: any) => c.table_name);
			   // ...existing code...
		}
		
		// AUTO-DETECT: If type_form=2 but no nodes, generate from menu structure
		if (nodes.length === 0 && Number(m_configs.type_form) === 2 && menuData.table_name) {
			   // ...existing code...
			// Try to find detail tables by looking for tables with same prefix
			const masterTableName = menuData.table_name;
			const allTables = Object.keys(database);
			
			// Look for tables that might be detail tables
			const detailTablePatterns = ['_ct', '_detail', '_line', '_row', '_item'];
			const possibleDetailTables = allTables.filter(t => 
				detailTablePatterns.some(pattern => t === `${masterTableName}${pattern}` || t.startsWith(`${masterTableName}_`))
				&& t !== masterTableName
			);
			
			// If found detail tables, auto-create nodes config
			if (possibleDetailTables.length > 0) {
				nodes = possibleDetailTables.map((tableName, idx) => ({
					id: tableName,
					table_name: tableName,
					label: t('common.detail', { index: idx + 1 }),
					table: menuData.table || [],
					trigger: menuData.trigger || {},
					g_readonly: false,
					type_form: "",
					row_type_edit: 0,
				}));
			   // ...existing code...
			}
			else {
				// As a final fallback, create a single detail node with a conventional name
				const fallbackDetail = `${masterTableName}_detail`;
				nodes = [
					{
						id: fallbackDetail,
						table_name: fallbackDetail,
						label: "Chi tiết",
						table: menuData.table || [],
						trigger: menuData.trigger || {},
						g_readonly: false,
						type_form: "",
						row_type_edit: 0,
					}
				];
			   // ...existing code...
			}
		}
		
		   const hasNodes = Array.isArray(nodes) && nodes.length > 0;
		if (Number(m_configs.type_form) === 2 && hasNodes) {
			return (
				<div style={{ padding: 16, height: "100%" }}>
					<CsmMasterDetail
						appId={effectiveAppId}
						permissions={-1}
						menusPermissions={{}}
						database={database}
						decrypt={(s: string) => s}
						m_configs={{ ...m_configs, nodes }}
						onDataChange={() => handleDataChange(database)}
					/>
				</div>
			);
		}

		// Otherwise render single grid
		return (
			<div style={{ padding: 16, height: "100%" }}>
				<CsmDynamicGrid
					m_configs={m_configs}
					database={database}
					appId={effectiveAppId}
					permissions={-1}
					menusPermissions={{}}
					menuId={menuData.id}
					decrypt={(s: string) => s}
					onDataChange={() => handleDataChange(database)}
				/>
			</div>
		);
	}

	// Render report
	if (menuData.report_name) {
		return (
			<div style={{ padding: 16, height: "100%" }}>
				<CsmReport
					appId={effectiveAppId}
					m_configs={menuData}
				/>
			</div>
		);
	}

	// Render dynamic code menu (type_form = 4)
	const typeForm = Number(menuData.type_form || 1);
	const hasAutoCodeName = !!(menuData as any).auto_code_name || typeForm === 4;
	if (hasAutoCodeName) {
		return (
			<div style={{ padding: 16, height: "100%" }}>
				<DynamicCodeMenu menuId={menuId} menuData={menuData} />
			</div>
		);
	}

	return <Empty description="Invalid menu type" />;
}
