import type { MenuItemType } from "#src/api/system";
import type { ActionType } from "@ant-design/pro-components";
import { fetchDeleteMenuItem, fetchMenuList, fetchAppList, fetchMenuItemDetail, saveMenuStruct } from "#src/api/system/menu";
import { BasicButton, BasicContent } from "#src/components";
import { useAuth } from "#src/hooks";
import { useAppStore, useUserStore } from "#src/store";
import { usePermissionStore } from "#src/store";
import { handleTree } from "#src/utils";
import { resolveDevFlag } from "#src/utils/dev-flag";

import { PlusCircleOutlined } from "@ant-design/icons";
import { Button, Tabs, Select, Row, Col } from "antd";
import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Detail } from "./components/detail";
import { csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import { MenuTreeView } from "./menu-tree-view";
import TreeMenu from "./tree-menu";
import AiMenuDesigner from "./components/AiMenuDesigner";

export default function Menu() {
	const { t, i18n } = useTranslation();
	const hasAuth = useAuth();
	const { setCurrentAppId } = useAppStore();
	const { handleAsyncRoutes } = usePermissionStore();
	const userDev = useUserStore(state => state.dev);
	const userRoles = useUserStore(state => state.roles || []);
	const isDevUser = resolveDevFlag(userDev, userRoles);
	const [activeTab, setActiveTab] = useState("table");
	const [selectedApp, setSelectedApp] = useState<string>("csm");
	const [appList, setAppList] = useState<any[]>([]);
	const [menuData, setMenuData] = useState<any[]>([]);
	const [tableLoading, setTableLoading] = useState(false);
	const [referralToken, setReferralToken] = useState<string>("");
	/* Detail Data */
	const [isOpen, setIsOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [detailData, setDetailData] = useState<Partial<MenuItemType>>({});
	const [flatParentMenus, setFlatParentMenus] = useState<MenuItemType[]>([]);
	// Normalize backend menu list to a tree structure (supports parentId or nodes fields)
	const removeDuplicates = (list: any[]): any[] => {
		const seen = new Set<string>();
		return list.filter(item => {
			if (seen.has(item.id)) {
				console.warn(`Removing duplicate menu id: ${item.id}`);
				return false;
			}
			seen.add(item.id);
			return true;
		});
	};

	/**
	 * Remove duplicate menu items from tree structure
	 * Keep first occurrence globally, remove subsequent occurrences
	 */
	const removeDuplicateMenus = (menus: any[]): any[] => {
		const globalSeenIds = new Set<string>();
		
		function filterDuplicates(items: any[]): any[] {
			return items
				.filter(item => {
					if (globalSeenIds.has(item.id)) {
						console.warn(`Removing duplicate menu id from tree: ${item.id}`);
						return false; // Remove duplicate
					}
					globalSeenIds.add(item.id);
					return true;
				})
				.map(item => ({
					...item,
					children: item.children ? filterDuplicates(item.children) : undefined,
				}));
		}
		
		return filterDuplicates(menus);
	};

	const normalizeMenus = (list: any[]): any[] => {
		if (!Array.isArray(list)) return [];

		const hasParentId = list.some((m) => "parentId" in m);
		const hasChildren = list.some((m) => Array.isArray((m as any).children) && (m as any).children.length > 0);
		const hasNodes = list.some((m) => Array.isArray((m as any).nodes) && (m as any).nodes.length > 0);

		const mapNodesToChildren = (items: any[]): any[] => {
			return items.map((item) => {
				const children = Array.isArray((item as any).nodes) ? mapNodesToChildren((item as any).nodes) : (item as any).children;
				const { nodes, ...rest } = item as any;
				return {
					...rest,
					children,
				};
			});
		};

		let processedList;
		if (hasParentId && !hasChildren) {
			processedList = handleTree(list);
		}
		if (hasNodes && !hasChildren) {
			processedList = mapNodesToChildren(list);
		}
		if (hasNodes && hasChildren) {
			processedList = mapNodesToChildren(list);
		}
		if (!processedList) {
			processedList = list;
		}

		// Sort menu by label like Vue sortAllMenu
		const sortMenu = (menus: any[]): any[] => {
			return menus
				.sort((a, b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0))
				.map(item => ({
					...item,
					children: item.children ? sortMenu(item.children) : undefined,
				}));
		};

		return sortMenu(processedList);
	};

	const flattenMenus = (list: any[]): any[] => {
		const result: any[] = [];
		const walk = (items: any[]) => {
			items.forEach((item) => {
				result.push(item);
				if (Array.isArray(item.children) && item.children.length > 0) {
					walk(item.children);
				}
			});
		};
		walk(list);
		return result;
	};

	// Find parentId of a menu in the tree
	const findParentId = (tree: any[], id: string, parentId: string = ""): string => {
		for (const item of tree) {
			if (item.id === id) return parentId;
			if (item.children) {
				const found = findParentId(item.children, id, item.id);
				if (found !== "") return found;
			}
		}
		return "";
	};

	const actionRef = useRef<ActionType>(null);

	// Load app list
	useEffect(() => {
		loadAppList();
	}, []);

	const loadAppList = async () => {
		try {
			const response = await fetchAppList();
			const apps = response?.result?.list || [];
			setAppList(apps);
		} catch (error) {

		}
	};

	const buildFlatParentMenus = (menuList: any[]) => {
		setFlatParentMenus(
			flattenMenus(menuList)
				.map((item: MenuItemType) => {
					let displayName = "" as string;
					if (typeof (item as any).label === 'string') {
						const lbl = (item as any).label as string;
						displayName = lbl.includes('.') ? t(lbl) : lbl;
					} else if (typeof (item as any).name === 'string') {
						const nm = (item as any).name as string;
						displayName = nm.includes('.') ? t(nm) : nm;
					} else {
						displayName = (item as any).label || (item as any).name || '';
					}
					return {
						...item,
						name: displayName,
					};
				}),
		);
	};

	// Reload menu data when selectedApp changes
	useEffect(() => {
		if (!selectedApp) return;

		const loadMenuData = async () => {
			setTableLoading(true);
			try {
				const responseData = await fetchMenuList(selectedApp);
				const rawMenuList = responseData?.result?.list || [];
				let menuList = normalizeMenus(rawMenuList);

				setMenuData(menuList);
				buildFlatParentMenus(menuList);
			} catch (error) {

			} finally {
				setTableLoading(false);
			}
		};

		loadMenuData();
		// Update global app store and reload sidebar menu
		setCurrentAppId(selectedApp);
		handleAsyncRoutes(selectedApp);
	}, [selectedApp, t, setCurrentAppId, handleAsyncRoutes]);

	const handleDeleteRow = async (id: string) => {
		try {
			await fetchDeleteMenuItem(id, selectedApp);
			window.$message?.success(t("common.deleteSuccess"));
			// Reload menu data
			const responseData = await fetchMenuList(selectedApp);
			const rawMenuList = responseData?.result?.list || [];
			const normalized = normalizeMenus(rawMenuList);
			setMenuData(normalized);
		} catch (error) {

			window.$message?.error(t("common.deleteFailed"));
		}
	};

	const onCloseChange = () => {
		setIsOpen(false);
		setDetailData({});
	};

	const refreshTable = async () => {
		const responseData = await fetchMenuList(selectedApp);
		const rawMenuList = responseData?.result?.list || [];
		const normalized = normalizeMenus(rawMenuList);
		setMenuData(normalized);
		buildFlatParentMenus(normalized);
	};

	const handleApplyAiMenu = async (menus: MenuItemType[]) => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp"));
			return;
		}
		await saveMenuStruct(selectedApp, menus);
		await refreshTable();
		window.$message?.success(t("system.menu.savedSuccess"));
	};

	return (
		<BasicContent className="h-full">
			{/* App Selector */}
			<Row gutter={[16, 16]} className="mb-4">
				<Col>
					<span>{t("system.menu.selectApp")}:</span>
				</Col>
				<Col>
					<Select
						style={{ width: 200 }}
						value={selectedApp}
						onChange={setSelectedApp}
						options={[
							{ label: "CSM", value: "csm" },
							...appList.map(app => ({
								label: app.app_name || app.app_id,
								value: app.app_id
							}))
						]}
					/>
				</Col>

			</Row>

			{/* Nút tạo mã giới thiệu */}
			<Row gutter={[16, 16]} className="mb-4">
				<Col>
					<Button
						type="primary"
						onClick={() => {
							if (!selectedApp) {
								window.alert("Vui lòng điền Mã chương trình");
								return;
							}
							const result = csmEncrypt(selectedApp + "_____phanmemmottrieu@gmail.com_____phanmemmottrieu@gmail.com_____0");
							setReferralToken(result);
						}}
					>
						Tạo mã giới thiệu
					</Button>
				</Col>
				{referralToken && (
					<Col>
						<input
							type="text"
							value={referralToken}
							readOnly
							id="referralTokenInput"
							style={{
								width: 400,
								padding: 4,
								borderRadius: 4,
								border: '1px solid #d9d9d9',
								background: 'var(--background-color, #f5f5f5)',
								color: 'var(--text-color, #222)',
								transition: 'background 0.2s,color 0.2s',
							}}
						/>
						<Button
							type="default"
							onClick={() => {
								const input = document.getElementById('referralTokenInput') as HTMLInputElement;
								if (input) {
									input.select();
									document.execCommand('copy');
									window.$message?.success('Đã copy mã giới thiệu!');
								}
							}}
						>
							Copy
						</Button>
					</Col>
				)}
			</Row>

			{isDevUser && (
				<Tabs
					activeKey={activeTab}
					onChange={setActiveTab}
					items={[
						{
							key: "table",
							label: t("system.menu.tableView"),
							children: (
								<>
									<div className="mb-4">
										<Button
											key="add-role"
											icon={<PlusCircleOutlined />}
											type="primary"
											disabled={!hasAuth("add")}
											onClick={() => {
												setIsOpen(true);
												setTitle(t("system.menu.addMenu"));
												setDetailData({});
											}}
										>
											{t("common.add")}
										</Button>
									</div>
									{Array.isArray(menuData) && menuData.length > 0 && (
										<MenuTreeView
											data={menuData}
											t={t}
											lang={i18n.language}
											onEdit={async (record) => {
												setIsOpen(true);
												setTitle(t("system.menu.editMenu"));
												// Fetch full menu item details to ensure table and trigger data is loaded
												const fullDetails = await fetchMenuItemDetail(record.id, selectedApp);
												const parentId = findParentId(menuData, record.id);
												setDetailData({ ...record, ...(fullDetails || {}), parentId });
											}}
											onDelete={(id) => handleDeleteRow(id)}
											onAdd={(parentId) => {
												setIsOpen(true);
												setTitle(t("system.menu.addMenu"));
												setDetailData(parentId ? { parentId } : {});
											}}
											hasAuth={hasAuth}
											loading={tableLoading}
										/>
									)}
									<Detail
										title={title}
										open={isOpen}
										flatParentMenus={flatParentMenus}
										onCloseChange={onCloseChange}
										detailData={detailData}
										refreshTable={refreshTable}
										appId={selectedApp}
										treeData={menuData}
									/>
								</>
							),
						},
						{
							key: "tree",
							label: t("system.menu.treeView"),
							children: <TreeMenu appId={selectedApp} />,
						},
						{
							key: "ai",
							label: "AI",
							children: (
								<AiMenuDesigner
									appId={selectedApp}
									currentMenus={menuData}
									onApply={handleApplyAiMenu}
								/>
							),
						},
					]}
				/>
			)}
			{!isDevUser && (
				<>
					<div className="mb-4">
						<Button
							key="add-role"
							icon={<PlusCircleOutlined />}
							type="primary"
							disabled={!hasAuth("add")}
							onClick={() => {
								setIsOpen(true);
								setTitle(t("system.menu.addMenu"));
								setDetailData({});
							}}
						>
							{t("common.add")}
						</Button>
					</div>
					{Array.isArray(menuData) && menuData.length > 0 && (
						<MenuTreeView
							data={menuData}
							t={t}
							lang={i18n.language}
							onEdit={async (record) => {
								setIsOpen(true);
								setTitle(t("system.menu.editMenu"));
								// Fetch full menu item details to ensure table and trigger data is loaded
								const fullDetails = await fetchMenuItemDetail(record.id, selectedApp);
								const parentId = findParentId(menuData, record.id);
								setDetailData({ ...record, ...(fullDetails || {}), parentId });
							}}
							onDelete={(id) => handleDeleteRow(id)}
							onAdd={(parentId) => {
								setIsOpen(true);
								setTitle(t("system.menu.addMenu"));
								setDetailData(parentId ? { parentId } : {});
							}}
							hasAuth={hasAuth}
							loading={tableLoading}
						/>
					)}
					<Detail
						title={title}
						open={isOpen}
						flatParentMenus={flatParentMenus}
						onCloseChange={onCloseChange}
						detailData={detailData}
						refreshTable={refreshTable}
						appId={selectedApp}
						treeData={menuData}
					/>
				</>
			)}
		</BasicContent>
	);
};
