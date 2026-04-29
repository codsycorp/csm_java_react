import type { MenuItemType } from "#src/api/system";
import type { ActionType } from "@ant-design/pro-components";
import { fetchDeleteMenuItem, fetchMenuList, fetchAppList, fetchMenuItemDetail, saveMenuStruct } from "#src/api/system/menu";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import { BasicButton, BasicContent } from "#src/components";
import { useAuth } from "#src/hooks";
import { useAppStore, useUserStore } from "#src/store";
import { usePermissionStore, usePreferencesStore } from "#src/store";
import { handleTree } from "#src/utils";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { getLocalizedField, type SupportedLanguage } from "#src/utils/i18nHelper";

import { PlusCircleOutlined } from "@ant-design/icons";
import { Button, Tabs, Select, Row, Col, Space } from "antd";
import { useRef, useState, useEffect, useMemo } from "react";
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
	const preferenceLanguage = usePreferencesStore(state => state.language);
	const isDevUser = resolveDevFlag(userDev, userRoles);

	const resolveMenuLanguage = (raw: string | null | undefined): "vi" | "en" | "zh" => {
		const normalized = String(raw || "").toLowerCase();
		if (normalized.startsWith("en")) return "en";
		if (normalized.startsWith("zh")) return "zh";
		return "vi";
	};

	const getMenuDisplayLabel = (item: any, lang: string) => {
		const currentLang = resolveMenuLanguage(lang) as SupportedLanguage;
		const labelByLang = getLocalizedField(item, "label", currentLang, false);
		if (labelByLang) {
			const text = String(labelByLang);
			return text.includes(".") ? t(text) : text;
		}

		const nameByLang = getLocalizedField(item, "name", currentLang, false);
		if (nameByLang) {
			const text = String(nameByLang);
			return text.includes(".") ? t(text) : text;
		}

		const fallback = getLocalizedField(item, "label", currentLang, true) || getLocalizedField(item, "name", currentLang, true);
		if (fallback) {
			const text = String(fallback);
			return text.includes(".") ? t(text) : text;
		}

		return String(item?.id || "");
	};

	const currentLanguage = useMemo(() => {
		if (preferenceLanguage) {
			return resolveMenuLanguage(preferenceLanguage);
		}

		if (i18n.language) {
			return resolveMenuLanguage(i18n.language);
		}

		return resolveMenuLanguage(localStorage.getItem("selectedLanguage") || "vi");
	}, [preferenceLanguage, i18n.language]);
	const [activeTab, setActiveTab] = useState("table");
	const [selectedApp, setSelectedApp] = useState<string>("");
	const [appList, setAppList] = useState<any[]>([]);
	const [menuData, setMenuData] = useState<any[]>([]);
	const [tableLoading, setTableLoading] = useState(false);
	const [referralToken, setReferralToken] = useState<string>("");
	const [copyOpen, setCopyOpen] = useState(false);
	const [copySubmitting, setCopySubmitting] = useState(false);
	const [languageGenerating, setLanguageGenerating] = useState(false);
	const [languageGenerateProgress, setLanguageGenerateProgress] = useState<string>("");
	const [pendingLanguageMenus, setPendingLanguageMenus] = useState<any[] | null>(null);
	const [languageSaving, setLanguageSaving] = useState(false);
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
			setPendingLanguageMenus(null);
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
		setFlatParentMenus(
			flattenMenus(menuList)
				.map((item: MenuItemType) => {
					const displayName = getMenuDisplayLabel(item as any, currentLanguage);
					return {
						...item,
						name: displayName,
					};
				}),
		);
	};

	useEffect(() => {
		buildFlatParentMenus(menuData);
	}, [menuData, currentLanguage, t]);

	// Reload menu data when selectedApp changes (local only, do NOT affect global sidebar/tabbar)
	useEffect(() => {
		if (!selectedApp) return;
		setPendingLanguageMenus(null);

		const loadMenuData = async () => {
			setTableLoading(true);
			setMenuData([]);
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
	}, [selectedApp]);

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
		setPendingLanguageMenus(null);
	};

	// Khi user muốn áp dụng menu mới cho sidebar/app global, mới gọi setCurrentAppId & handleAsyncRoutes
	const handleApplyAiMenu = async (menus: MenuItemType[], applyToSidebar = false) => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp"));
			return;
		}
		const completedMenus = fillMenuLanguageFallbacks(menus as any[]);
		if (!hasFullThreeLanguageData(completedMenus)) {
			window.$message?.error(t("system.menu.languageDataIncomplete") || "Thiếu dữ liệu 3 ngôn ngữ cho menu/table. Vui lòng tạo lại.");
			return;
		}
		await saveMenuStruct(selectedApp, completedMenus as any);
		setPendingLanguageMenus(null);
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
		const translatedBase = getMenuDisplayLabel(item, currentLanguage);
		const extras: string[] = [];
		if (item.label_en) extras.push(`EN: ${item.label_en}`);
		if (item.label_zh) extras.push(`ZH: ${item.label_zh}`);
		return {
			label: extras.length > 0 ? `${translatedBase} (${extras.join(" | ")})` : translatedBase,
			value: item.id,
		};
	});

	const extractBalancedJsonBlock = (text: string, startIndex: number): string | null => {
		if (startIndex < 0 || startIndex >= text.length) return null;
		const opener = text[startIndex];
		const closer = opener === "{" ? "}" : opener === "[" ? "]" : "";
		if (!closer) return null;

		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let i = startIndex; i < text.length; i += 1) {
			const ch = text[i];
			if (inString) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === "\\") {
					escaped = true;
					continue;
				}
				if (ch === '"') inString = false;
				continue;
			}

			if (ch === '"') {
				inString = true;
				continue;
			}
			if (ch === opener) depth += 1;
			if (ch === closer) {
				depth -= 1;
				if (depth === 0) return text.slice(startIndex, i + 1);
			}
		}
		return null;
	};

	const extractMenuListFromAnyPayload = (payload: any): any[] => {
		if (!payload) return [];
		if (Array.isArray(payload)) return payload;
		if (Array.isArray(payload.menu)) return payload.menu;
		if (Array.isArray(payload.code?.menu)) return payload.code.menu;
		if (Array.isArray(payload.data?.menu)) return payload.data.menu;
		if (Array.isArray(payload.result?.menu)) return payload.result.menu;
		if (Array.isArray(payload.result?.code?.menu)) return payload.result.code.menu;
		if (Array.isArray(payload.data?.code?.menu)) return payload.data.code.menu;

		if (typeof payload === "string") {
			const text = payload.trim();
			if (!text) return [];
			try {
				return extractMenuListFromAnyPayload(JSON.parse(text));
			} catch {
				// continue with block extraction
			}
			const strippedFence = text
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/\s*```$/i, "")
				.trim();
			if (strippedFence && strippedFence !== text) {
				try {
					return extractMenuListFromAnyPayload(JSON.parse(strippedFence));
				} catch {
					// continue
				}
			}

			for (let i = 0; i < text.length; i += 1) {
				const ch = text[i];
				if (ch !== "{" && ch !== "[") continue;
				const block = extractBalancedJsonBlock(text, i);
				if (!block) continue;
				try {
					return extractMenuListFromAnyPayload(JSON.parse(block));
				} catch {
					// try next
				}
			}
		}

		return [];
	};

	const fillMenuLanguageFallbacks = (menus: any[]): any[] => {
		return (Array.isArray(menus) ? menus : []).map((menu) => {
			const next = { ...menu };
			next.label = String(next.label || next.name || next.id || "");
			next.label_en = String(next.label_en || next.name_en || next.label || next.name || next.id || "");
			next.label_zh = String(next.label_zh || next.name_zh || next.label || next.name || next.id || "");

			if (Array.isArray(next.table)) {
				next.table = next.table.map((field: any) => {
					const f = { ...field };
					f.f_header = String(f.f_header || f.f_name || "");
					f.f_header_en = String(f.f_header_en || f.f_header || f.f_name || "");
					f.f_header_zh = String(f.f_header_zh || f.f_header || f.f_name || "");
					return f;
				});
			}

			if (Array.isArray(next.children)) {
				next.children = fillMenuLanguageFallbacks(next.children);
			}

			return next;
		});
	};

	const compactMenusForLanguagePrompt = (menus: any[]): any[] => {
		const walk = (items: any[]): any[] => {
			return (Array.isArray(items) ? items : []).map((menu) => {
				const next: any = {
					id: menu?.id,
					parentId: menu?.parentId,
					path: menu?.path,
					name: menu?.name,
					name_en: menu?.name_en,
					name_zh: menu?.name_zh,
					label: menu?.label,
					label_en: menu?.label_en,
					label_zh: menu?.label_zh,
				};

				if (Array.isArray(menu?.table)) {
					next.table = menu.table.map((field: any) => ({
						f_name: field?.f_name,
						f_header: field?.f_header,
						f_header_en: field?.f_header_en,
						f_header_zh: field?.f_header_zh,
					}));
				}

				if (Array.isArray(menu?.children) && menu.children.length > 0) {
					next.children = walk(menu.children);
				}

				return next;
			});
		};

		return walk(menus);
	};

	const collectMenuIds = (menus: any[]): string[] => {
		const ids: string[] = [];
		const walk = (items: any[]) => {
			for (const item of items || []) {
				const id = String(item?.id || "").trim();
				if (id) ids.push(id);
				if (Array.isArray(item?.children) && item.children.length > 0) walk(item.children);
			}
		};
		walk(menus);
		return ids;
	};

	const buildMenuChunksBySize = (menus: any[], maxCharsPerChunk: number) => {
		const chunks: any[][] = [];
		let current: any[] = [];

		const estimate = (items: any[]) => JSON.stringify({ menu: items }).length;

		for (const menu of menus || []) {
			const candidate = [...current, menu];
			if (current.length > 0 && estimate(candidate) > maxCharsPerChunk) {
				chunks.push(current);
				current = [menu];
				continue;
			}
			current = candidate;
		}

		if (current.length > 0) chunks.push(current);
		return chunks;
	};

	const mergeGeneratedLanguagesToSourceMenus = (sourceMenus: any[], generatedMenus: any[]) => {
		const generatedById = new Map<string, any>();
		const walkGenerated = (items: any[]) => {
			for (const item of items || []) {
				const id = String(item?.id || "").trim();
				if (id) generatedById.set(id, item);
				if (Array.isArray(item?.children) && item.children.length > 0) walkGenerated(item.children);
			}
		};
		walkGenerated(generatedMenus);

		const walkSource = (items: any[]): any[] => {
			return (items || []).map((sourceItem) => {
				const next = { ...sourceItem };
				const sourceId = String(sourceItem?.id || "").trim();
				const generated = sourceId ? generatedById.get(sourceId) : undefined;

				if (generated) {
					next.label = generated?.label ?? next.label;
					next.label_en = generated?.label_en ?? next.label_en;
					next.label_zh = generated?.label_zh ?? next.label_zh;

					if (Array.isArray(next.table)) {
						const generatedFields = Array.isArray(generated?.table) ? generated.table : [];
						const generatedFieldByName = new Map<string, any>();
						for (const field of generatedFields) {
							const fName = String(field?.f_name || "").trim();
							if (fName) generatedFieldByName.set(fName, field);
						}

						next.table = next.table.map((sourceField: any) => {
							const fieldNext = { ...sourceField };
							const fName = String(sourceField?.f_name || "").trim();
							const generatedField = fName ? generatedFieldByName.get(fName) : undefined;
							if (generatedField) {
								fieldNext.f_header = generatedField?.f_header ?? fieldNext.f_header;
								fieldNext.f_header_en = generatedField?.f_header_en ?? fieldNext.f_header_en;
								fieldNext.f_header_zh = generatedField?.f_header_zh ?? fieldNext.f_header_zh;
							}
							return fieldNext;
						});
					}
				}

				if (Array.isArray(sourceItem?.children) && sourceItem.children.length > 0) {
					next.children = walkSource(sourceItem.children);
				}

				return next;
			});
		};

		return walkSource(sourceMenus);
	};

	const extractAiFailureMessage = (resp: any): string => {
		const candidates = [
			resp,
			resp?.result,
			resp?.data,
			resp?.result?.data,
			resp?.data?.result,
			resp?.result?.result,
		].filter(Boolean);

		for (const item of candidates) {
			const failed = item?.success === false || item?.error === true || item?.status === "failed";
			if (!failed) continue;
			const provider = String(item?.provider || item?.data?.provider || "").trim();
			const code = String(item?.errorCode || item?.data?.errorCode || "").trim();
			const message = String(item?.message || item?.data?.message || "").trim();
			const combined = [provider ? `[${provider}]` : "", code ? `(${code})` : "", message]
				.filter(Boolean)
				.join(" ")
				.trim();
			if (combined) return combined;
		}

		return "";
	};

	const hasFullThreeLanguageData = (menus: any[]): boolean => {
		const walkMenus = (items: any[]): boolean => {
			for (const item of items || []) {
				if (!String(item?.label || "").trim()) return false;
				if (!String(item?.label_en || "").trim()) return false;
				if (!String(item?.label_zh || "").trim()) return false;

				if (Array.isArray(item?.table)) {
					for (const field of item.table) {
						if (!String(field?.f_header || "").trim()) return false;
						if (!String(field?.f_header_en || "").trim()) return false;
						if (!String(field?.f_header_zh || "").trim()) return false;
					}
				}

				if (Array.isArray(item?.children) && !walkMenus(item.children)) return false;
			}
			return true;
		};

		return walkMenus(Array.isArray(menus) ? menus : []);
	};

	const handleAutoGenerateMenuLanguage = async () => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn ứng dụng");
			return;
		}
		if (!Array.isArray(menuData) || menuData.length === 0) {
			window.$message?.warning(t("system.menu.emptyMenu") || "Không có menu để tạo ngôn ngữ");
			return;
		}

		setLanguageGenerating(true);
		setLanguageGenerateProgress("");
		const progressMsgKey = "menu-language-generate-progress";
		try {
			const sourceMenus = deepClone(menuData);
			const compactMenus = compactMenusForLanguagePrompt(sourceMenus);
			const maxCharsPerChunk = Number(import.meta.env.VITE_AI_MENU_LANG_CHUNK_CHARS) || 120000;
			const initialChunks = buildMenuChunksBySize(compactMenus, Math.max(30000, maxCharsPerChunk));
			if (!initialChunks.length) {
				window.$message?.error(t("system.menu.aiDesigner.invalidJson") || "Không có menu hợp lệ để xử lý");
				return;
			}

			const maxRetry = 3;
			let pendingChunks = initialChunks.map((menus, index) => ({
				menus,
				chunkIndex: index + 1,
				expectedIds: new Set(collectMenuIds(menus)),
			}));
			const successfulChunkMenus: any[] = [];

			for (let attempt = 1; attempt <= maxRetry && pendingChunks.length > 0; attempt += 1) {
				const nextPending: typeof pendingChunks = [];

				for (let i = 0; i < pendingChunks.length; i += 1) {
					const chunk = pendingChunks[i];
					const chunkJson = JSON.stringify({ menu: chunk.menus }, null, 2);
					const prompt = [
						"Bạn là chuyên gia chuẩn hóa đa ngôn ngữ cho cấu hình menu JSON.",
						"NHIỆM VỤ:",
						"1) Giữ nguyên toàn bộ cấu trúc menu hiện tại, không đổi id/path/parentId/table_name/type_form/trigger.",
						"2) Bổ sung cho mỗi menu: label (VI), label_en (EN), label_zh (ZH).",
						"3) Với mỗi field trong table: bắt buộc đủ 3 ngôn ngữ cho f_header:",
						"   - f_header (VI), f_header_en (EN), f_header_zh (ZH)",
						"4) Không xóa menu/field nào, không tự ý thêm menu mới.",
						"5) Trả về JSON duy nhất theo 1 trong 2 dạng:",
						"   - {\"menu\": [...]}",
						"   - {\"code\": {\"menu\": [...]}}",
						"6) Tuyệt đối không kèm giải thích/prose ngoài JSON.",
						"7) Không đổi tên kỹ thuật f_name, chỉ dịch các trường label/f_header theo yêu cầu.",
						`8) Đây là chunk ${chunk.chunkIndex}/${initialChunks.length}, lần thử ${attempt}/${maxRetry}.`,
						"DỮ LIỆU MENU HIỆN TẠI:",
						chunkJson,
					].join("\n\n");

					const response = await generateSeoContentWithPrompt(prompt, {
						taskType: "menu_i18n_generate",
						menuDesignByDev: isDevUser,
						onProgress: (progress) => {
							const text = `Chunk ${chunk.chunkIndex}/${initialChunks.length}: ${String(progress?.message || progress?.stage || progress?.status || "Đang xử lý AI")}`;
							setLanguageGenerateProgress(text);
							window.$message?.loading({ content: text, key: progressMsgKey, duration: 0 });
						},
					});

					const failureMessage = extractAiFailureMessage(response);
					if (failureMessage) {
						if (attempt < maxRetry) {
							nextPending.push(chunk);
							continue;
						}
						window.$message?.error(failureMessage);
						return;
					}

					const menuFromAi = extractMenuListFromAnyPayload(response?.result ?? (response as any)?.data ?? response);
					if (!Array.isArray(menuFromAi) || menuFromAi.length === 0) {
						if (attempt < maxRetry) {
							nextPending.push(chunk);
							continue;
						}
						window.$message?.error(t("system.menu.aiDesigner.invalidJson") || "AI trả về sai định dạng menu");
						return;
					}

					const returnedIds = new Set(collectMenuIds(menuFromAi));
					let coveredAll = true;
					for (const expectedId of chunk.expectedIds) {
						if (!returnedIds.has(expectedId)) {
							coveredAll = false;
							break;
						}
					}

					if (!coveredAll && attempt < maxRetry) {
						nextPending.push(chunk);
						continue;
					}

					successfulChunkMenus.push(...menuFromAi);
				}

				pendingChunks = nextPending;
			}

			if (pendingChunks.length > 0) {
				window.$message?.error(t("system.menu.aiDesigner.invalidJson") || "AI chưa trả đủ dữ liệu menu. Vui lòng chạy lại.");
				return;
			}

			const mergedMenus = mergeGeneratedLanguagesToSourceMenus(sourceMenus, successfulChunkMenus);
			const completedMenus = fillMenuLanguageFallbacks(mergedMenus);
			if (!hasFullThreeLanguageData(completedMenus)) {
				window.$message?.error(t("system.menu.languageDataIncomplete") || "Thiếu dữ liệu 3 ngôn ngữ cho menu/table. Vui lòng tạo lại.");
				return;
			}
			setMenuData(completedMenus);
			buildFlatParentMenus(completedMenus);
			setPendingLanguageMenus(completedMenus);
			window.$message?.success(t("system.menu.generatedPreviewReady") || "Đã áp dụng tạm ngôn ngữ menu/table. Nhấn 'Lưu 3 ngôn ngữ' để lưu thật vào hệ thống.");
		} catch (error) {
			window.$message?.destroy(progressMsgKey);
			console.error("Failed to auto-generate menu languages:", error);
			window.$message?.error(t("system.menu.copyFailed") || "Tạo ngôn ngữ menu thất bại");
		} finally {
			window.$message?.destroy(progressMsgKey);
			setLanguageGenerating(false);
			setLanguageGenerateProgress("");
		}
	};

	const handleSaveGeneratedLanguages = async () => {
		if (!selectedApp) {
			window.$message?.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn ứng dụng");
			return;
		}
		if (!pendingLanguageMenus || pendingLanguageMenus.length === 0) {
			window.$message?.warning(t("system.menu.noPendingLanguageData") || "Không có dữ liệu ngôn ngữ tạm để lưu");
			return;
		}

		const completedMenus = fillMenuLanguageFallbacks(pendingLanguageMenus);
		if (!hasFullThreeLanguageData(completedMenus)) {
			window.$message?.error(t("system.menu.languageDataIncomplete") || "Thiếu dữ liệu 3 ngôn ngữ cho menu/table. Vui lòng tạo lại.");
			return;
		}

		setLanguageSaving(true);
		try {
			await saveMenuStruct(selectedApp, completedMenus as any);
			setPendingLanguageMenus(null);
			await refreshTable();
			window.$message?.success(t("system.menu.savedSuccess") || "Menu Đã Được Lưu");
		} catch (error) {
			console.error("Failed to save generated menu languages:", error);
			window.$message?.error(t("system.menu.saveFailed") || "Lưu Menu Thất Bại");
		} finally {
			setLanguageSaving(false);
		}
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
						border: '1px solid var(--ant-colorBorder)',
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
										<Space wrap>
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
											<Button onClick={handleAutoGenerateMenuLanguage} loading={languageGenerating} disabled={!selectedApp || tableLoading}>
												{t("system.menu.autoGenerateMenuLang") || "Tự tạo ngôn ngữ menu/table"}
											</Button>
											{Array.isArray(pendingLanguageMenus) && pendingLanguageMenus.length > 0 && (
												<Button type="primary" onClick={handleSaveGeneratedLanguages} loading={languageSaving}>
													{t("system.menu.saveThreeLanguages") || "Lưu 3 ngôn ngữ"}
												</Button>
											)}
										</Space>
									</div>
									{Array.isArray(menuData) && menuData.length > 0 && (
										<MenuTreeView
											key={`menu-tree-${currentLanguage}`}
											data={menuData}
											t={t}
											lang={currentLanguage}
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
									key={`ai-menu-designer-${selectedApp || "none"}`}
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
						<Space wrap>
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
							<Button onClick={handleAutoGenerateMenuLanguage} loading={languageGenerating} disabled={!selectedApp || tableLoading}>
								{t("system.menu.autoGenerateMenuLang") || "Tự tạo ngôn ngữ menu/table"}
							</Button>
							{Array.isArray(pendingLanguageMenus) && pendingLanguageMenus.length > 0 && (
								<Button type="primary" onClick={handleSaveGeneratedLanguages} loading={languageSaving}>
									{t("system.menu.saveThreeLanguages") || "Lưu 3 ngôn ngữ"}
								</Button>
							)}
						</Space>
					</div>
					{Array.isArray(menuData) && menuData.length > 0 && (
						<MenuTreeView
							key={`menu-tree-${currentLanguage}`}
							data={menuData}
							t={t}
							lang={currentLanguage}
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