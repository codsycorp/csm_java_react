import type { MenuItemType } from "#src/api/system/menu";
import type { TreeDataNode } from "antd";

import { fetchDeleteMenuItem, fetchMenuList, fetchAppList, fetchMenuItemDetail } from "#src/api/system/menu";
import { BasicButton, BasicContent } from "#src/components";
import { getAllExpandedKeys, handleTree, request } from "#src/utils";
import { resolveDevFlag } from "#src/utils/dev-flag";

import { MinusCircleOutlined, PlusCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { Card, Input, Radio, Select, Spin, Tag, Tree, Modal, Space, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Detail } from "./components/detail";

type MenuTreeItem = MenuItemType & { children?: MenuTreeItem[]; nodes?: MenuTreeItem[] };

interface AppOption {
	app_id: string;
	app_name: string;
	id?: string;
}

/**
 * Remove duplicate menu items from flat list
 * Keep first occurrence, remove subsequent occurrences by id
 */
function removeDuplicates(menus: MenuTreeItem[]): MenuTreeItem[] {
	const seen = new Set<string>();
	return menus.filter(item => {
		if (seen.has(item.id)) {
			console.warn(`Removing duplicate menu id: ${item.id}`);
			return false;
		}
		seen.add(item.id);
		return true;
	});
}

/**
 * Remove duplicate menu items from tree structure
 * Keep first occurrence globally, remove subsequent occurrences
 * This handles cases where same menu ID appears in different branches
 */
function removeDuplicateMenus(menus: MenuTreeItem[]): MenuTreeItem[] {
	const globalSeenIds = new Set<string>();
	let removedCount = 0;
	
	function filterDuplicates(items: MenuTreeItem[]): MenuTreeItem[] {
		return items
			.filter(item => {
				if (globalSeenIds.has(item.id)) {
					removedCount++;
					console.warn(`⚠️ Duplicate menu ID removed (occurrence #${removedCount}): ${item.id} (${item.label})`);
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
	
	const result = filterDuplicates(menus);
	return result;
}

/**
 * Count total menu items in tree
 */
function getMenuCount(menus: MenuTreeItem[]): number {
	return menus.reduce((count, item) => {
		return count + 1 + (item.children ? getMenuCount(item.children) : 0);
	}, 0);
}

function flattenMenus(menus: MenuTreeItem[]): MenuTreeItem[] {
	const result: MenuTreeItem[] = [];
	const walk = (items: MenuTreeItem[]) => {
		items.forEach((item) => {
			result.push(item);
			if (Array.isArray(item.children) && item.children.length > 0) {
				walk(item.children);
			}
		});
	};
	walk(menus);
	return result;
}

function resolveOrderValue(value: unknown): number {
	if (value === null || value === undefined || value === "") return Number.MAX_SAFE_INTEGER;
	const num = Number(value);
	return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
}

function sortMenusByOrder(items: MenuTreeItem[]): MenuTreeItem[] {
	return [...(items || [])]
		.sort((a, b) => {
			const orderDiff = resolveOrderValue(a?.order) - resolveOrderValue(b?.order);
			if (orderDiff !== 0) return orderDiff;
			const labelA = String(a?.label || a?.name || a?.id || "").toLowerCase();
			const labelB = String(b?.label || b?.name || b?.id || "").toLowerCase();
			if (labelA < labelB) return -1;
			if (labelA > labelB) return 1;
			return 0;
		})
		.map((item) => ({
			...item,
			children: Array.isArray(item?.children) ? sortMenusByOrder(item.children) : item.children,
		}));
}

const ID_TO_I18N_KEY: Record<string, string> = {
	"system": "common.menu.system",
	"user": "common.menu.user",
	"menu": "common.menu.menu",
	"developer": "common.menu.developer",
	"dept": "common.menu.permissionGroup",
};

function getMenuLabel(menu: MenuTreeItem, lang: string = "vi", t?: (key: string) => string): string {
	const lowerLang = String(lang || "vi").toLowerCase();
	const currentLang = lowerLang.startsWith("en") ? "en" : lowerLang.startsWith("zh") ? "zh" : "vi";

	if (currentLang === "en" && menu.label_en) return menu.label_en;
	if (currentLang === "zh" && menu.label_zh) return menu.label_zh;

	if (menu.label) {
		if (t && menu.label.includes(".")) return t(menu.label);
		return menu.label;
	}
	if (menu.name) {
		if (t && menu.name.includes(".")) return t(menu.name);
		return menu.name;
	}
	if (menu.id && t && ID_TO_I18N_KEY[menu.id]) {
		return t(ID_TO_I18N_KEY[menu.id]);
	}
	return menu.id || "";
}

function toTreeNodes(
	data: MenuTreeItem[],
	t: (key: string) => string,
	lang: string,
	parentPath = "",
	usedKeys = new Map<string, number>(),
): TreeDataNode[] {
	
	return data.map((item, index) => {
		// Create unique key
		let uniqueKey = item.id;
		
		// Track how many times this ID is used
		const count = (usedKeys.get(item.id) || 0) + 1;
		usedKeys.set(item.id, count);
		
		// If ID is used multiple times, append counter and timestamp
		if (count > 1) {
			uniqueKey = `${item.id}_${count}_${Date.now()}`;
			console.warn(`⚠️ Duplicate key found in toTreeNodes: ${item.id}, using: ${uniqueKey}`);
		}
		
		return {
			// Display multilingual label based on current language.
			title: getMenuLabel(item, lang, t),
			key: uniqueKey,
			// Use children field (unified)
			children: item.children ? toTreeNodes(item.children, t, lang, `${parentPath}/${item.id}`, usedKeys) : undefined,
		};
	});
}

function findMenuById(menus: MenuTreeItem[], id: string): MenuTreeItem | undefined {
	for (const menu of menus) {
		if (menu.id === id) return menu;
		// Use children field (unified)
		if (menu.children) {
			const found = findMenuById(menu.children, id);
			if (found) return found;
		}
	}
	return undefined;
}

function findParentId(menus: MenuTreeItem[], id: string, parentId: string = ""): string {
	for (const menu of menus) {
		if (menu.id === id) return parentId;
		if (menu.children) {
			const found = findParentId(menu.children, id, menu.id);
			if (found !== "") return found;
		}
	}
	return "";
}

function removeMenuById(menus: MenuTreeItem[], id: string): boolean {
	const index = menus.findIndex((m) => m.id === id);
	if (index > -1) {
		menus.splice(index, 1);
		return true;
	}
	for (const menu of menus) {
		// Use children field (unified)
		if (menu.children && removeMenuById(menu.children, id)) {
			return true;
		}
	}
	return false;
}

function updateMenuInTree(menus: MenuTreeItem[], id: string, newData: Partial<MenuTreeItem>): boolean {
	for (let i = 0; i < menus.length; i++) {
		if (menus[i].id === id) {
			const currentParentId = findParentId(menus, id);
			const newParentId = newData.parentId;
			if (currentParentId !== newParentId) {
				// Move
				const menu = menus.splice(i, 1)[0];
				Object.assign(menu, newData);
				if (!newParentId || newParentId === "") {
					menus.push(menu);
				} else {
					const newParent = findMenuById(menus, newParentId);
					if (newParent) {
						if (!newParent.children) newParent.children = [];
						newParent.children.push(menu);
					} else {
						menus.push(menu); // fallback
					}
				}
			} else {
				Object.assign(menus[i], newData);
			}
			return true;
		}
		if (menus[i].children && updateMenuInTree(menus[i].children!, id, newData)) {
			return true;
		}
	}
	return false;
}

function addMenuToTree(menus: MenuTreeItem[], newMenu: MenuTreeItem): void {
	const parentId = newMenu.parentId;
	if (!parentId || parentId === "") {
		menus.push(newMenu);
	} else {
		const parent = findMenuById(menus, parentId);
		if (parent) {
			if (!parent.children) parent.children = [];
			parent.children.push(newMenu);
		} else {
			menus.push(newMenu); // fallback
		}
	}
}

export default function MenuTree({ appId: initialAppId = "" }: { appId?: string }) {
	const { t, i18n } = useTranslation();
	const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
	const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
	const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
	const [flatMenus, setFlatMenus] = useState<MenuTreeItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [detailTitle, setDetailTitle] = useState("");
	const [detailData, setDetailData] = useState<Partial<MenuItemType>>({});
	const [appId, setAppId] = useState<string>(initialAppId || "");
	const [apps, setApps] = useState<AppOption[]>([]);
	const [copiedMenu, setCopiedMenu] = useState<MenuTreeItem | null>(null);
	const [isDevUser, setIsDevUser] = useState(false);
	const [fullMenuList, setFullMenuList] = useState<MenuTreeItem[]>([]);
	const [contextMenuTarget, setContextMenuTarget] = useState<string | null>(null);

	const allExpandedKeys = useMemo(() => getAllExpandedKeys(treeData, "key"), [treeData]);

	// Load available apps
	const loadApps = useCallback(async () => {
		try {
			const response = await fetchAppList();
			const appList = response.result?.list || [];
			setApps(appList);
			// Set first app as default if exists
			if (appList.length > 0 && !appId) {
				setAppId(appList[0].app_id);
			}
		} catch (error) {
			console.error("Failed to load apps:", error);
		}
	}, [appId]);

	const loadMenus = useCallback(async () => {
		if (!appId) return;
		setLoading(true);
		try {
			// Pass appId to fetch menu for this specific app
			const response = await fetchMenuList(appId);
			const list = (response.result.list || []) as MenuTreeItem[];
			
			// Check for duplicate IDs in raw data
			const idCounts = new Map<string, number>();
			list.forEach(item => {
				idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
			});
			const duplicateIds = Array.from(idCounts.entries()).filter(([, count]) => count > 1);
			if (duplicateIds.length > 0) {
				console.warn("⚠️ Duplicate IDs found in raw data:", duplicateIds);
			}
			
			const dedupedList = list;
			setFlatMenus(dedupedList);
			setFullMenuList(dedupedList);
			
			// Check if data is flat structure with parentId (like from backend)
			// or already tree structure with children (like from hdragon app)
			const hasParentId = list.some(m => 'parentId' in m);
			
			// Also check if data already has children (converted from nodes)
			const hasChildren = list.some(m => m.children && m.children.length > 0);
			
			let processedList = dedupedList;
			
			if (hasParentId) {
				// Convert flat structure to tree using handleTree
				processedList = handleTree(list) as MenuTreeItem[];
			} else if (hasChildren || list.some(m => m.children !== undefined)) {
				// Data already in tree format
			} else {
				// console.log("⚠️ Data format unknown - no parentId and no children");
			}

			processedList = sortMenusByOrder(processedList);
			
			// Flatten for flatMenus
			const flattened = flattenMenus(processedList);
			setFlatMenus(flattened);
			setFullMenuList(processedList);
			
			// Directly convert to tree nodes for Ant Design Tree
			const tree = toTreeNodes(processedList, t, i18n.language);
			setTreeData(tree);
			setExpandedKeys(tree.map((n) => n.key));
		} finally {
			setLoading(false);
		}
	}, [appId, i18n.language, t]);

	useEffect(() => {
		loadApps();
	}, [loadApps]);

	useEffect(() => {
		if (appId) {
			loadMenus();
		}
	}, [appId, loadMenus]);

	// Sync appId from parent component props
	useEffect(() => {
		if (initialAppId) {
			setAppId(initialAppId);
		}
	}, [initialAppId]);

	// Detect dev user
	useEffect(() => {
		try {
			const userDevFlag = localStorage.getItem("user_dev");
			const userInfo = localStorage.getItem("user_info");
			
			if (userDevFlag === "true") {
				setIsDevUser(true);
			} else if (userInfo) {
				const parsed = JSON.parse(userInfo);
				setIsDevUser(resolveDevFlag(parsed.dev, parsed.roles));
			}
		} catch (error) {
			console.error("Failed to detect dev user:", error);
		}
	}, []);

	// Rebuild tree data when fullMenuList changes
	useEffect(() => {
		if (fullMenuList.length > 0) {
			const tree = toTreeNodes(fullMenuList, t, i18n.language);
			setTreeData(tree);
			setExpandedKeys(tree.map(n => n.key));
		}
	}, [fullMenuList, i18n.language, t]);

	// Save menu to backend
	const saveMenuApp = useCallback(async () => {
		if (!appId) return;

		try {
			// Import crypto function
			const { csmEncrypt } = await import("#src/components/csm-grid/CsmCrypto");

			// Encrypt menu data using system encryption
			const menuStruct = csmEncrypt(JSON.stringify(fullMenuList));
			console.log("Saving menu tree:", fullMenuList); // Thêm log để debug
			
			const menuToSave = {
				id: "menu",
				struct: menuStruct, // 使用加密的 struct 字段
			};

			const response = await request.post<ApiResponse<string>>("update-table-data", {
				json: {
					app_id: appId, // 保存到选中的应用
					obj_name: "index",
					obj_update: menuToSave,
					command: "update",
					e_where: {
						field: "id",
						type: "eq",
						value: "menu", // 固定 id="menu"
					},
				},
				ignoreLoading: true,
			}).json();

			if (response) {
				window.$message?.success(t("system.menu.savedSuccess"));
				loadMenus();
			}
		} catch (error) {
			console.error("Failed to save menu:", error);
			window.$message?.error(t("system.menu.saveFailed"));
		}
	}, [appId, fullMenuList, loadMenus, t]);

	const openAdd = (parentId?: string) => {
		setDetailData(parentId ? { parentId } : {});
		setDetailTitle(t("system.menu.addMenu"));
		setIsOpen(true);
		// Clear copied menu when adding to avoid confusion
		setCopiedMenu(null);
	};

	const openEdit = async (id: string) => {
		const target = findMenuById(fullMenuList, id);
		if (!target) return;
		// Fetch full menu item details to ensure table and trigger data is loaded
		const fullDetails = await fetchMenuItemDetail(id, appId);
		const parentId = findParentId(fullMenuList, id);
		setDetailData({ ...target, ...(fullDetails || {}), parentId });
		setDetailTitle(t("system.menu.editMenu"));
		setIsOpen(true);
		// Clear copied menu when editing to avoid confusion
		setCopiedMenu(null);
	};

	const handleDelete = async (id: string) => {
		if (!appId) {
			window.$message?.error(t("system.menu.pleaseSelectApp"));
			return;
		}
		await fetchDeleteMenuItem(id, appId);
		window.$message?.success(t("common.deleteSuccess"));
		loadMenus();
	};

	const handleCopy = (id: string) => {
		const menu = findMenuById(fullMenuList, id);
		if (menu) {
			setCopiedMenu(JSON.parse(JSON.stringify(menu)));
			window.$message?.success(t("system.menu.copiedSuccess"));
		}
	};

	const handlePaste = async (targetId: string, pasteConfig: boolean = false) => {
		if (!copiedMenu) {
			window.$message?.warning(t("system.menu.pleaseCopyMenuFirst"));
			return;
		}

		const targetMenu = findMenuById(fullMenuList, targetId);
		if (!targetMenu) return;

		let newMenu = JSON.parse(JSON.stringify(copiedMenu));
		newMenu.id = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		if (pasteConfig) {
			// Only copy config, keep target menu's properties
			newMenu.name = targetMenu.name;
			newMenu.id = targetMenu.id;
			newMenu.parentId = targetMenu.parentId;
		}

		if (!targetMenu.children) {
			targetMenu.children = [];
		}
		targetMenu.children.push(newMenu);
		setFullMenuList([...fullMenuList]);
		await saveMenuApp();
		window.$message?.success(t("system.menu.pastedSuccess"));
	};

	const handleMove = async (menuId: string, targetParentId: string) => {
		const menu = findMenuById(fullMenuList, menuId);
		if (!menu) return;

		removeMenuById(fullMenuList, menuId);

		if (targetParentId === "root") {
			setFullMenuList([...fullMenuList, menu]);
		} else {
			const targetParent = findMenuById(fullMenuList, targetParentId);
			if (targetParent) {
				if (!targetParent.children) {
					targetParent.children = [];
				}
				targetParent.children.push(menu);
			}
		}

		menu.parentId = targetParentId === "root" ? "" : targetParentId;
		setFullMenuList([...fullMenuList]);
		await saveMenuApp();
		window.$message?.success(t("system.menu.movedSuccess"));
	};

	const getAllMenus = (menus: MenuTreeItem[] = []): MenuTreeItem[] => {
		return menus.reduce((acc: MenuTreeItem[], item) => {
			acc.push(item);
			if (item.children) {
				acc.push(...getAllMenus(item.children));
			}
			return acc;
		}, []);
	};

	const createContextMenu = (menuId: string): MenuProps["items"] => [
		{
			label: t("system.menu.addChild"),
			key: "add_child",
			onClick: () => openAdd(menuId),
		},
		{
			label: t("system.menu.edit"),
			key: "edit",
			onClick: () => openEdit(menuId),
		},
		{
			label: t("system.menu.copy"),
			key: "copy",
			onClick: () => handleCopy(menuId),
		},
		{
			label: t("system.menu.paste"),
			key: "paste",
			onClick: () => handlePaste(menuId, false),
			disabled: !copiedMenu,
		},
		{
			label: t("system.menu.pasteConfig"),
			key: "paste_config",
			onClick: () => handlePaste(menuId, true),
			disabled: !copiedMenu,
		},
		{
			type: "divider",
		},
		{
			label: t("system.menu.moveTo"),
			key: "move",
			children: [
				{
					label: t("system.menu.root"),
					key: "move_root",
					onClick: () => handleMove(menuId, "root"),
				},
				...getAllMenus(fullMenuList)
					.filter((m) => m.id !== menuId)
					.map((m) => ({
						label: getMenuLabel(m, i18n.language, t),
						key: `move_${m.id}`,
						onClick: () => handleMove(menuId, m.id),
					})),
			],
		},
		{
			type: "divider",
		},
		{
			label: t("system.menu.delete"),
			key: "delete",
			danger: true,
			onClick: () => {
				Modal.confirm({
					title: t("system.menu.confirmDelete"),
					content: t("system.menu.deleteConfirmMsg"),
					okText: t("common.confirm"),
					cancelText: t("common.cancel"),
					onOk: () => handleDelete(menuId),
				});
			},
		},
	];

	return (
		<BasicContent className="h-full">
			<Card className="h-full [&_.ant-card-body]:h-full">
				<div className="flex flex-col h-full">
					{/* App Selector */}
					{isDevUser && (
						<div className="mb-4 pb-4 border-b">
							<label className="block text-sm font-medium mb-2">{t("system.menu.selectApp")}</label>
							<div className="flex gap-2 flex-wrap">
								<Select
									placeholder={t("system.menu.selectApp")}
									value={appId || undefined}
									onChange={setAppId}
									options={apps.map((app) => ({
										label: app.app_name || app.app_id,
										value: app.app_id,
									}))}
									className="flex-1 min-w-[200px]"
								/>
								<BasicButton
									type="primary"
									onClick={saveMenuApp}
									disabled={!appId}
								>
									{t("system.menu.saveMenu")}
								</BasicButton>
							</div>
						</div>
					)}

					<div className="relative flex-1 overflow-hidden border-r-[1px] border-r-gray-200 pr-5">
						<div className="flex gap-3 mb-4">
							<Input placeholder={t("common.search") || "搜索"} className="flex-1" prefix={<SearchOutlined />} disabled />
							<Radio.Group
								value={expandedKeys.length === allExpandedKeys.length ? "expand" : "collapse"}
								onChange={(e) => {
									const value = e.target.value;
									if (value === "expand") {
										setExpandedKeys(allExpandedKeys as React.Key[]);
									} else {
										setExpandedKeys([]);
									}
								}}
							>
								   <Radio.Button value="expand">{t("common.expand")}</Radio.Button>
								   <Radio.Button value="collapse">{t("common.collapse")}</Radio.Button>
							</Radio.Group>
						</div>
						<div className="flex flex-col gap-y-1">
							<Spin spinning={loading}>
								{!appId && !isDevUser ? (
									<div className="text-center text-gray-500 py-8">
										{t("system.menu.selectApp")}
									</div>
								) : (
									<Tree
										className="[&_.ant-tree-treenode-selected_.tree-actions]:flex"
										blockNode
										showLine
										expandedKeys={expandedKeys}
										onExpand={(keys) => setExpandedKeys(keys)}
										selectedKeys={selectedKeys}
										onSelect={(keys) => setSelectedKeys(keys)}
										titleRender={(node: any) => (
											<Dropdown
												menu={{ items: createContextMenu(String(node.key)) }}
												trigger={["contextMenu"]}
											>
												<div className="group flex justify-between items-center w-full cursor-context-menu">
													<span>{node.title}</span>
													<div className="tree-actions hidden group-hover:flex items-center gap-1">
														<Tag color="processing" className="mr-0 h-fit text-xs">
															{t("system.menu.menu")}
														</Tag>
														<div className="flex items-center gap-0.5">
															<BasicButton
																color="primary"
																variant="text"
																size="small"
																icon={<PlusCircleOutlined />}
																onClick={() => openAdd(String(node.key))}
															/>
															<BasicButton
																danger
																type="text"
																size="small"
																icon={<MinusCircleOutlined />}
																onClick={() => handleDelete(String(node.key))}
															/>
														</div>
													</div>
												</div>
											</Dropdown>
										)}
										onDoubleClick={(_, node) => openEdit(String(node.key))}
										treeData={treeData}
									/>
								)}
							</Spin>
						</div>
					</div>
				</div>
			</Card>
			<Detail
				title={detailTitle}
				open={isOpen}
				flatParentMenus={flatMenus}
				onCloseChange={() => setIsOpen(false)}
				detailData={detailData}
				refreshTable={loadMenus}
				appId={appId}
				treeData={treeData}
				saveMenuApp={saveMenuApp}
				fullMenuList={fullMenuList}
				setFullMenuList={setFullMenuList}
			/>
		</BasicContent>
	);
}
