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
import { Form, Modal, Radio } from "antd";

import { Detail } from "./components/detail";
import { csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import { MenuTreeView } from "./menu-tree-view";
import TreeMenu from "./tree-menu";
import AiMenuDesigner from "./components/AiMenuDesigner";

export default function Menu() {
	const { t, i18n } = useTranslation();
	const [copyForm] = Form.useForm();
	const hasAuth = useAuth();
	const { setCurrentAppId } = useAppStore();
	const { handleAsyncRoutes } = usePermissionStore();
	const userDev = useUserStore(state => state.dev);
	const userRoles = useUserStore(state => state.roles || []);
	const isDevUser = resolveDevFlag(userDev, userRoles);
	const [activeTab, setActiveTab] = useState("table");
	const [selectedApp, setSelectedApp] = useState<string>("");
	const [appList, setAppList] = useState<any[]>([]);
	const [menuData, setMenuData] = useState<any[]>([]);
	const [tableLoading, setTableLoading] = useState(false);
	const [referralToken, setReferralToken] = useState<string>("");
	const [copyOpen, setCopyOpen] = useState(false);
	const [copySubmitting, setCopySubmitting] = useState(false);
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

		const resolveOrderValue = (value: unknown): number => {
			if (value === null || value === undefined || value === "") return Number.MAX_SAFE_INTEGER;
			const num = Number(value);
			return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
		};

		const compareMenuOrder = (a: any, b: any): number => {
			const orderDiff = resolveOrderValue(a?.order) - resolveOrderValue(b?.order);
			if (orderDiff !== 0) return orderDiff;
			const labelA = String(a?.label || a?.name || a?.id || "").toLowerCase();
			const labelB = String(b?.label || b?.name || b?.id || "").toLowerCase();
			if (labelA < labelB) return -1;
			if (labelA > labelB) return 1;
			return 0;
		};

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

		// Sort by configured order first, then label as deterministic fallback.
		const sortMenu = (menus: any[]): any[] => {
			return [...menus]
				.sort(compareMenuOrder)
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

	const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

	const pickSelectedSubtrees = (menus: any[], selectedIds: Set<string>): any[] => {
		const out: any[] = [];

		const walk = (items: any[]) => {
			items.forEach((item) => {
				if (selectedIds.has(item.id)) {
					out.push(deepClone(item));
					return;
				}
				if (Array.isArray(item.children) && item.children.length > 0) {
					walk(item.children);
				}
			});
		};

		walk(menus);
		return out;
	};

	const cloneMenusForTargetApp = (menus: any[], targetAppId: string): any[] => {
		let counter = 0;
		const seed = Date.now();

		const cloneNode = (node: any, parentId: string): any => {
			counter += 1;
			const newId = `menu_${seed}_${counter}`;
			const clonedChildren = Array.isArray(node.children)
				? node.children.map((child: any) => cloneNode(child, newId))
				: undefined;

			const cloned = {
				...deepClone(node),
				id: newId,
				parentId,
				app_id: targetAppId,
				menu_id: "",
				children: clonedChildren,
			};

			delete cloned.nodes;
			return cloned;
		};

		return menus.map((item) => cloneNode(item, ""));
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

	const resolveOrderValue = (value: unknown): number => {
		if (value === null || value === undefined || value === "") return Number.MAX_SAFE_INTEGER;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
	};

	const reorderMenuTree = (
		items: any[],
		targetId: string,
		direction: "up" | "down" | "top" | "bottom",
	): { next: any[]; moved: boolean } => {
		const sortSiblings = (siblings: any[]) => {
			return [...siblings].sort((a, b) => {
				const diff = resolveOrderValue(a?.order) - resolveOrderValue(b?.order);
				if (diff !== 0) return diff;
				const labelA = String(a?.label || a?.name || a?.id || "").toLowerCase();
				const labelB = String(b?.label || b?.name || b?.id || "").toLowerCase();
				if (labelA < labelB) return -1;
				if (labelA > labelB) return 1;
				return 0;
			});
		};

		const normalizeSiblingOrder = (siblings: any[]) => {
			return siblings.map((item, index) => ({
				...item,
				order: (index + 1) * 10,
			}));
		};

		const walk = (siblings: any[]): { nodes: any[]; moved: boolean } => {
			const sorted = sortSiblings(siblings).map((item) => ({
				...item,
				children: Array.isArray(item?.children) ? [...item.children] : item.children,
			}));

			const index = sorted.findIndex((item) => String(item?.id || "") === targetId);
			if (index >= 0) {
				const targetIndex = direction === "up"
					? index - 1
					: direction === "down"
						? index + 1
						: direction === "top"
							? 0
							: sorted.length - 1;
				if (targetIndex < 0 || targetIndex >= sorted.length) {
					return { nodes: normalizeSiblingOrder(sorted), moved: false };
				}
				if (targetIndex === index) {
					return { nodes: normalizeSiblingOrder(sorted), moved: false };
				}
				const swapped = [...sorted];
				const [movedItem] = swapped.splice(index, 1);
				swapped.splice(targetIndex, 0, movedItem);
				return { nodes: normalizeSiblingOrder(swapped), moved: true };
			}

			let moved = false;
			const updated = sorted.map((item) => {
				if (!Array.isArray(item?.children) || item.children.length === 0) return item;
				const result = walk(item.children);
				if (result.moved) moved = true;
				return {
					...item,
					children: result.nodes,
				};
			});

			return { nodes: normalizeSiblingOrder(updated), moved };
		};

		const result = walk(Array.isArray(items) ? items : []);
		return { next: result.nodes, moved: result.moved };
	};

	const normalizeTreeOrder = (items: any[]): any[] => {
		const sortSiblings = (siblings: any[]): any[] => {
			const sorted = [...siblings].sort((a, b) => {
				const diff = resolveOrderValue(a?.order) - resolveOrderValue(b?.order);
				if (diff !== 0) return diff;
				const labelA = String(a?.label || a?.name || a?.id || "").toLowerCase();
				const labelB = String(b?.label || b?.name || b?.id || "").toLowerCase();
				if (labelA < labelB) return -1;
				if (labelA > labelB) return 1;
				return 0;
			});
			return sorted.map((item, index): any => ({
				...item,
				order: (index + 1) * 10,
				children: Array.isArray(item?.children) ? sortSiblings(item.children) : item.children,
			}));
		};

		return sortSiblings(Array.isArray(items) ? items : []);
	};

	const persistMenuOrder = async (nextMenu: any[]) => {
		setMenuData(nextMenu);
		buildFlatParentMenus(nextMenu);

		try {
			await saveMenuStruct(selectedApp, nextMenu);
			await handleAsyncRoutes(selectedApp);
			window.$message?.success(t("system.menu.reorderSuccess") || "Đã cập nhật thứ tự menu");
		} catch (error) {
			console.error("Failed to save menu order:", error);
			window.$message?.error(t("system.menu.reorderFailed") || "Lưu thứ tự menu thất bại");
			await refreshTable();
		}
	};

	const removeMenuNode = (items: any[], targetId: string): { next: any[]; removed: any | null } => {
		const siblings = [...items];
		const index = siblings.findIndex((item) => String(item?.id || "") === targetId);
		if (index >= 0) {
			const [removed] = siblings.splice(index, 1);
			return { next: siblings, removed };
		}

		for (let i = 0; i < siblings.length; i += 1) {
			const item = siblings[i];
			if (!Array.isArray(item?.children) || item.children.length === 0) continue;
			const result = removeMenuNode(item.children, targetId);
			if (result.removed) {
				siblings[i] = {
					...item,
					children: result.next,
				};
				return { next: siblings, removed: result.removed };
			}
		}

		return { next: siblings, removed: null };
	};

	const findMenuNode = (items: any[], targetId: string): any | null => {
		for (const item of items) {
			if (String(item?.id || "") === targetId) return item;
			if (Array.isArray(item?.children) && item.children.length > 0) {
				const found = findMenuNode(item.children, targetId);
				if (found) return found;
			}
		}
		return null;
	};

	const insertMenuNode = (
		items: any[],
		targetId: string,
		dragNode: any,
		dropToGap: boolean,
		relativeDropPosition: number,
	): any[] => {
		if (!dropToGap) {
			const walk = (siblings: any[]): any[] => {
				return siblings.map((item) => {
					if (String(item?.id || "") === targetId) {
						const nextChildren = Array.isArray(item?.children) ? [...item.children, dragNode] : [dragNode];
						return {
							...item,
							children: nextChildren,
						};
					}
					if (!Array.isArray(item?.children) || item.children.length === 0) return item;
					return {
						...item,
						children: walk(item.children),
					};
				});
			};
			return walk(items);
		}

		const parentId = findParentId(items, targetId);
		const targetIndexBySiblings = (siblings: any[]) => siblings.findIndex((item) => String(item?.id || "") === targetId);

		if (!parentId) {
			const siblings = [...items];
			const targetIndex = targetIndexBySiblings(siblings);
			const insertIndex = relativeDropPosition < 0 ? targetIndex : targetIndex + 1;
			siblings.splice(Math.max(0, insertIndex), 0, dragNode);
			return siblings;
		}

		const walk = (siblings: any[]): any[] => {
			return siblings.map((item) => {
				if (String(item?.id || "") !== parentId) {
					if (!Array.isArray(item?.children) || item.children.length === 0) return item;
					return {
						...item,
						children: walk(item.children),
					};
				}

				const nextChildren = Array.isArray(item?.children) ? [...item.children] : [];
				const targetIndex = targetIndexBySiblings(nextChildren);
				const insertIndex = relativeDropPosition < 0 ? targetIndex : targetIndex + 1;
				nextChildren.splice(Math.max(0, insertIndex), 0, dragNode);
				return {
					...item,
					children: nextChildren,
				};
			});
		};

		return walk(items);
	};

	const actionRef = useRef<ActionType>(null);

	const handleMoveMenuOrder = async (menuId: string, direction: "up" | "down" | "top" | "bottom") => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp"));
			return;
		}

		const { next, moved } = reorderMenuTree(menuData, menuId, direction);
		if (!moved) {
			window.$message?.info(t("system.menu.reorderBoundary") || "Menu đã ở vị trí giới hạn");
			return;
		}

		await persistMenuOrder(next);
	};

	const handleDragDropMenuOrder = async (payload: { dragId: string; targetId: string; dropToGap: boolean; relativeDropPosition: number }) => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp"));
			return;
		}
		if (!payload.dragId || !payload.targetId || payload.dragId === payload.targetId) return;

		const removedResult = removeMenuNode(menuData, payload.dragId);
		if (!removedResult.removed) return;
		const dragNode = { ...removedResult.removed };

		if (payload.dropToGap) {
			const parentId = findParentId(removedResult.next, payload.targetId);
			dragNode.parentId = parentId || "";
		} else {
			dragNode.parentId = payload.targetId;
		}

		const inserted = insertMenuNode(removedResult.next, payload.targetId, dragNode, payload.dropToGap, payload.relativeDropPosition);
		const normalized = normalizeTreeOrder(inserted);
		await persistMenuOrder(normalized);
	};

	// Load app list
	useEffect(() => {
		loadAppList();
	}, []);

	const loadAppList = async () => {
		try {
			const response = await fetchAppList();
			const apps = (response?.result?.list || []).filter((app: any) => String(app?.app_id || "").trim().toLowerCase() !== "csm");
			setAppList(apps);
			setSelectedApp(prev => {
				if (prev && apps.some((app: any) => String(app?.app_id || "") === prev)) {
					return prev;
				}
				return String(apps[0]?.app_id || "");
			});
		} catch (error) {

		}
	};

	const buildFlatParentMenus = (menuList: any[]) => {
		const currentLang = String(i18n.language || "vi").toLowerCase();
		setFlatParentMenus(
			flattenMenus(menuList)
				.map((item: MenuItemType) => {
					let displayName = "" as string;
					if (currentLang.startsWith("en") && typeof (item as any).label_en === "string" && (item as any).label_en) {
						displayName = (item as any).label_en;
					} else if (currentLang.startsWith("zh") && typeof (item as any).label_zh === "string" && (item as any).label_zh) {
						displayName = (item as any).label_zh;
					} else if (typeof (item as any).label === 'string') {
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

	// Reload menu data when selectedApp changes (local only, do NOT affect global sidebar/tabbar)
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
	}, [selectedApp, t]);

	const handleDeleteRow = async (id: string) => {
		try {
			await fetchDeleteMenuItem(id, selectedApp);
			window.$message?.success(t("common.deleteSuccess"));
			// Reload menu data
			const responseData = await fetchMenuList(selectedApp);
			const rawMenuList = responseData?.result?.list || [];
			const normalized = normalizeMenus(rawMenuList);
			setMenuData(normalized);
			buildFlatParentMenus(normalized);
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

	// Khi user muốn áp dụng menu mới cho sidebar/app global, mới gọi setCurrentAppId & handleAsyncRoutes
	const handleApplyAiMenu = async (menus: MenuItemType[], applyToSidebar = false) => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp"));
			return;
		}
		await saveMenuStruct(selectedApp, menus);
		await refreshTable();
		if (applyToSidebar) {
			setCurrentAppId(selectedApp);
			handleAsyncRoutes(selectedApp);
		}
		window.$message?.success(t("system.menu.savedSuccess"));
	};

	const openCopyModal = () => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp"));
			return;
		}

		copyForm.setFieldsValue({
			mode: "all",
			copyStrategy: "merge",
			selectedMenuIds: [],
			targetAppIds: [],
		});
		setCopyOpen(true);
	};

	const handleConfirmCopy = async () => {
		try {
			const values = await copyForm.validateFields();
			const mode: "all" | "selected" = values.mode;
			const copyStrategy: "merge" | "replace" = values.copyStrategy || "merge";
			const selectedMenuIds: string[] = values.selectedMenuIds || [];
			const targetAppIdsRaw: string[] = values.targetAppIds || [];
			const targetAppIds = Array.from(new Set(
				targetAppIdsRaw
					.map(item => String(item || "").trim())
					.filter(Boolean)
			)).filter(item => item !== selectedApp);

			if (!targetAppIds.length) {
				window.$message?.warning(t("system.menu.copyTargetRequired") || "Vui lòng chọn ít nhất 1 chương trình đích khác chương trình nguồn");
				return;
			}

			const sourceTrees = mode === "all"
				? deepClone(menuData)
				: pickSelectedSubtrees(menuData, new Set(selectedMenuIds));

			if (!sourceTrees.length) {
				window.$message?.warning(t("system.menu.copySourceEmpty") || "Không có menu nguồn để copy");
				return;
			}

			setCopySubmitting(true);
			const failedTargets: string[] = [];

			for (const targetAppId of targetAppIds) {
				// Clone with new IDs so copied menus are independent per program.
				const copiedTree = cloneMenusForTargetApp(sourceTrees, targetAppId);

				const ensureSaveSuccess = (result: any) => {
					const code = Number(result?.code ?? 200);
					if (result?.success === false || code >= 400) {
						throw new Error(result?.message || `Save menu failed for app ${targetAppId}`);
					}
				};

				if (copyStrategy === "replace") {
					try {
						const saveRes = await saveMenuStruct(targetAppId, copiedTree);
						ensureSaveSuccess(saveRes);
					} catch (error) {
						failedTargets.push(targetAppId);
					}
					continue;
				}

				const responseData = await fetchMenuList(targetAppId);
				const rawTargetList = responseData?.result?.list || [];
				const targetTree = normalizeMenus(rawTargetList);
				const mergedTree = [...targetTree, ...copiedTree];

				try {
					const saveRes = await saveMenuStruct(targetAppId, mergedTree);
					ensureSaveSuccess(saveRes);
				} catch (error) {
					failedTargets.push(targetAppId);
				}
			}

			if (targetAppIds.includes(selectedApp)) {
				await refreshTable();
			}

			const successCount = targetAppIds.length - failedTargets.length;
			if (successCount > 0) {
				setCopyOpen(false);
				window.$message?.success(
					t("system.menu.copySuccessSummary", {
						copiedType: mode === "all" ? (t("system.menu.copyModeAll") || "toàn bộ") : (t("system.menu.copyModeSelected") || "menu đã chọn"),
						strategy: copyStrategy === "replace" ? (t("system.menu.copyStrategyReplace") || "thay thế toàn bộ") : (t("system.menu.copyStrategyMerge") || "gộp thêm"),
						count: successCount,
					}) || `Đã copy menu sang ${successCount} chương trình`
				);
			}
			if (failedTargets.length > 0) {
				window.$message?.error(
					t("system.menu.copyFailedTargets", { targets: failedTargets.join(", ") }) || `Copy thất bại ở: ${failedTargets.join(", ")}`
				);
			}
		} catch (error: any) {
			if (error?.errorFields) return;
			console.error("Failed to copy menus:", error);
			window.$message?.error(t("system.menu.copyFailed") || "Copy menu thất bại");
		} finally {
			setCopySubmitting(false);
		}
	};

	const menuOptions = flattenMenus(menuData).map((item: any) => {
		const currentLang = String(i18n.language || "vi").toLowerCase();
		const baseLabel = currentLang.startsWith("en")
			? (item.label_en || item.label || item.name || item.id)
			: currentLang.startsWith("zh")
				? (item.label_zh || item.label || item.name || item.id)
				: (item.label || item.name || item.id);
		const translatedBase = typeof baseLabel === "string" && baseLabel.includes(".") ? t(baseLabel) : baseLabel;
		const extras: string[] = [];
		if (item.label_en) extras.push(`EN: ${item.label_en}`);
		if (item.label_zh) extras.push(`ZH: ${item.label_zh}`);
		return {
			label: extras.length > 0 ? `${translatedBase} (${extras.join(" | ")})` : translatedBase,
			value: item.id,
		};
	});

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
						options={appList.map(app => ({
							label: app.app_name || app.app_id,
							value: app.app_id
						}))}
					/>
				</Col>

			</Row>

			<Row gutter={[16, 16]} className="mb-4">
				<Col>
					<Button onClick={openCopyModal} disabled={!selectedApp}>
						{t("system.menu.copyMenuToOtherApp") || "Copy menu sang chương trình khác"}
					</Button>
				</Col>
			</Row>

			{/* Nút tạo mã giới thiệu */}
			<Row gutter={[16, 16]} className="mb-4">
				<Col>
					<Button
						type="primary"
						onClick={() => {
							if (!selectedApp) {
								window.$message?.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn ứng dụng");
								return;
							}
							const result = csmEncrypt(selectedApp + "_____phanmemmottrieu@gmail.com_____phanmemmottrieu@gmail.com_____0");
							setReferralToken(result);
						}}
					>
						{t("system.menu.generateReferralCode") || "Tạo mã giới thiệu"}
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
									window.$message?.success(t("system.menu.referralCodeCopied") || "Đã copy mã giới thiệu!");
								}
							}}
						>
							{t("system.menu.copy") || "Copy"}
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
												onMoveUp={(id) => handleMoveMenuOrder(id, "up")}
												onMoveDown={(id) => handleMoveMenuOrder(id, "down")}
												onMoveTop={(id) => handleMoveMenuOrder(id, "top")}
												onMoveBottom={(id) => handleMoveMenuOrder(id, "bottom")}
												onDragDrop={handleDragDropMenuOrder}
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
							onMoveUp={(id) => handleMoveMenuOrder(id, "up")}
							onMoveDown={(id) => handleMoveMenuOrder(id, "down")}
							onMoveTop={(id) => handleMoveMenuOrder(id, "top")}
							onMoveBottom={(id) => handleMoveMenuOrder(id, "bottom")}
							onDragDrop={handleDragDropMenuOrder}
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

				<Modal
					open={copyOpen}
					title={t("system.menu.copyModalTitle") || "Copy menu giữa các chương trình"}
					onCancel={() => setCopyOpen(false)}
					onOk={handleConfirmCopy}
					confirmLoading={copySubmitting}
					okText={t("system.menu.copyModalConfirm") || "Thực hiện copy"}
					cancelText={t("common.cancel")}
				>
					<Form form={copyForm} layout="vertical">
						<Form.Item name="mode" label={t("system.menu.copyScopeLabel") || "Phạm vi copy"} initialValue="all">
							<Radio.Group>
								<Radio value="all">{t("system.menu.copyScopeAll") || "Toàn bộ menu chương trình nguồn"}</Radio>
								<Radio value="selected">{t("system.menu.copyScopeSelected") || "Chỉ menu được chọn"}</Radio>
							</Radio.Group>
						</Form.Item>

						<Form.Item name="copyStrategy" label={t("system.menu.copyStrategyLabel") || "Cách ghi vào chương trình đích"} initialValue="merge">
							<Radio.Group>
								<Radio value="merge">{t("system.menu.copyStrategyMergeDescription") || "Gộp thêm vào menu hiện có của chương trình đích"}</Radio>
								<Radio value="replace">{t("system.menu.copyStrategyReplaceDescription") || "Thay thế toàn bộ menu chương trình đích bằng menu nguồn"}</Radio>
							</Radio.Group>
						</Form.Item>

						<Form.Item shouldUpdate noStyle>
							{({ getFieldValue }) => {
								const mode = getFieldValue("mode");
								if (mode !== "selected") return null;
								return (
									<Form.Item
										name="selectedMenuIds"
										label={t("system.menu.copySelectMenusLabel") || "Chọn menu cần copy"}
										rules={[{ required: true, message: t("system.menu.copySelectMenusRequired") || "Vui lòng chọn ít nhất 1 menu" }]}
									>
										<Select mode="multiple" showSearch options={menuOptions} placeholder={t("system.menu.copySelectMenusPlaceholder") || "Chọn menu..."} />
									</Form.Item>
								);
							}}
						</Form.Item>

						<Form.Item
							name="targetAppIds"
							label={t("system.menu.copyTargetAppsLabel") || "Chương trình đích"}
							rules={[{ required: true, message: t("system.menu.copyTargetAppsRequired") || "Vui lòng chọn ít nhất 1 chương trình đích" }]}
						>
							<Select
								mode="multiple"
								showSearch
								options={appList.map((app) => ({
									label: app.app_name || app.app_id,
									value: app.app_id,
								}))}
								placeholder={t("system.menu.copyTargetAppsPlaceholder") || "Chọn 1 hoặc nhiều chương trình..."}
							/>
						</Form.Item>

						<div style={{ color: "#8c8c8c", fontSize: 12 }}>
							{t("system.menu.copyInfo") || "Menu copy sang app đích sẽ được tạo ID mới để tránh đè dữ liệu. Cấu hình Kanban/report/trigger được giữ nguyên, nhưng dữ liệu CRUD/tìm kiếm vẫn chạy độc lập theo từng app_id. Nếu chọn \"Thay thế toàn bộ\", menu hiện tại của chương trình đích sẽ bị ghi đè hoàn toàn."}
						</div>
					</Form>
				</Modal>
		</BasicContent>
	);
};