import type { MenuItemType } from "./types";

import { isString } from "#src/utils";
import { getLocalizedField, type SupportedLanguage } from "#src/utils/i18nHelper";
import { useTranslation } from "react-i18next";

/**
 * Strip menu prefix từ label
 * Ví dụ: "A. Danh Mục" → "Danh Mục"
 *        "A.01. Quản Lý" → "Quản Lý"
 *        "01.02.03. Test" → "Test"
 */
function stripMenuPrefix(label: string): string {
	return label;
}

/**
 * Hàm lấy nhãn menu ưu tiên theo ngôn ngữ hiện tại
 * Sử dụng getLocalizedField từ i18nHelper để lấy field theo ngôn ngữ
 * Thứ tự fallback: label_[lang] → label → name → id
 */
export function getMenuLabelByLanguage(
	menu: any,
	language: string = "vi"
): string {
	// Normalize language to supported format
	const lang = (language.toLowerCase().startsWith("en") ? "en" : 
	              language.toLowerCase().startsWith("zh") ? "zh" : "vi") as SupportedLanguage;

	// Resolve in strict order to avoid premature fallback to Vietnamese:
	// 1) label_<lang> / label
	// 2) name_<lang> / name
	// 3) fallback across other languages for label/name
	const labelByLang = getLocalizedField(menu, "label", lang, false);
	const nameByLang = getLocalizedField(menu, "name", lang, false);
	let labelValue = labelByLang || nameByLang;

	if (!labelValue) {
		const labelFallback = getLocalizedField(menu, "label", lang, true);
		const nameFallback = getLocalizedField(menu, "name", lang, true);
		labelValue = labelFallback || nameFallback;
	}
	
	// If still no value, use id as fallback
	if (!labelValue) {
		labelValue = menu.id || menu.key || "";
	}

	// Strip menu prefix from the label
	return stripMenuPrefix(labelValue);
}

// Known system menu paths/ids mapped to i18n keys (fallback when backend lacks label_en/label_zh)
const SYSTEM_MENU_I18N_MAP: Record<string, string> = {
	"/system": "common.menu.system",
	"system": "common.menu.system",
	"/system/user": "common.menu.user",
	"user": "common.menu.user",
	"/system/menu": "common.menu.menu",
	"menu": "common.menu.menu",
	"/system/developer": "common.menu.developer",
	"developer": "common.menu.developer",
	"/system/dept": "common.menu.permissionGroup",
	"dept": "common.menu.permissionGroup",
};

function getI18nKeyFromMenu(menu: MenuItemType): string | null {
	const candidates = [menu.path, menu.key, menu.id, menu.name];
	for (const c of candidates) {
		if (typeof c === "string" && SYSTEM_MENU_I18N_MAP[c]) {
			return SYSTEM_MENU_I18N_MAP[c];
		}
	}
	return null;
}

/**
 * 将菜单树中的所有 label 转换为国际化文本，支持多语言
 * @param menus 原始菜单数组
 * @param t Translation 函数
 * @param currentLanguage 当前语言 (vi/en/zh)
 * @returns 转换后的菜单数组，只保留Ant Design Menu需要的字段
 */
export function translateMenus(
	menus: MenuItemType[],
	t: (key: string) => string,
	currentLanguage: string = "vi"
): MenuItemType[] {
	return menus.map((menu) => {
		// Only keep Ant Design Menu compatible properties
		// This is the strict field list - ONLY these fields will be rendered
		const translatedMenu: MenuItemType = {
			key: menu.key,
			// Get multilingual label or use label/name field
			label: (() => {
				const multiLangLabel = getMenuLabelByLanguage(menu, currentLanguage);
				if (
					multiLangLabel &&
					multiLangLabel !== menu.label &&
					multiLangLabel !== menu.name &&
					multiLangLabel !== menu.id &&
					multiLangLabel !== menu.key &&
					// Do not treat i18n keys as final labels; they must be translated
					!String(multiLangLabel).includes('.')
				) {
					// If getMenuLabelByLanguage returned a localized label (not id/key, not i18n key), use it
					return multiLangLabel;
				}
				// Otherwise, check if label/name is an i18n key and translate it
				const labelValue = menu.label || menu.name;
				if (isString(labelValue) && labelValue.includes('.')) {
					// Looks like an i18n key (e.g., "common.menu.system")
					return t(labelValue);
				}

				// If backend did not provide multilingual labels, use known path/id mapping as fallback
				const mappedKey = getI18nKeyFromMenu(menu);
				if (mappedKey) {
					return t(mappedKey);
				}

				// Fallback to original label (strip prefix for consistency)
				return isString(labelValue) ? stripMenuPrefix(labelValue) : labelValue;
			})(),
		};

		// Include optional Ant-compatible fields only
		// Note: Icon must be a React component, not a string
		// String icon names will be rendered as text and break the UI
		if (menu.icon !== undefined && typeof menu.icon !== 'string') {
			translatedMenu.icon = menu.icon;
		}
		if (menu.disabled === true) {
			translatedMenu.disabled = menu.disabled;
		}

		// Preserve multilingual labels for potential re-rendering with different languages
		// These are needed by getMenuLabelByLanguage if language changes dynamically
		if (menu.label_en !== undefined) translatedMenu.label_en = menu.label_en;
		if (menu.label_zh !== undefined) translatedMenu.label_zh = menu.label_zh;

		// Preserve additional fields needed for app logic (NOT for rendering)
		// These fields are stored but Ant Design Menu will NOT render them
		if (menu.table_name !== undefined) translatedMenu.table_name = menu.table_name;
		if (menu.report_name !== undefined) translatedMenu.report_name = menu.report_name;
		if (menu.path !== undefined) translatedMenu.path = menu.path;
		if (menu.menuId !== undefined) translatedMenu.menuId = menu.menuId;
		if (menu.id !== undefined) translatedMenu.id = menu.id;
		if (menu.type_form !== undefined) translatedMenu.type_form = menu.type_form;

		if (menu.children && menu.children.length > 0) {
			translatedMenu.children = translateMenus(menu.children, t, currentLanguage);
		}

		return translatedMenu;
	});
}

/**
 * 通过路径查找菜单
 *
 * @param list 菜单列表
 * @param path 菜单路径
 * @returns 找到的菜单对象，未找到则返回 null
 */
export function findMenuByPath(
	list: MenuItemType[],
	path?: string,
): MenuItemType | null {
	for (const menu of list) {
		if (menu.key === path) {
			return menu;
		}
		const findMenu = menu.children && findMenuByPath(menu.children, path);
		if (findMenu) {
			return findMenu;
		}
	}
	return null;
}

/**
 * 通过路径查找根菜单
 *
 * @param menus 菜单列表
 * @param path 菜单路径，可选
 * @returns 包含查找到的菜单、根菜单和根菜单路径的对象
 */
export function findRootMenuByPath(menus: MenuItemType[], path?: string): {
	findMenu: MenuItemType | null
	rootMenu: MenuItemType | null
	rootMenuPath: string | null
} {
	// 初始化返回值
	let findMenu: MenuItemType | null = null;
	let rootMenu: MenuItemType | null = null;
	let rootMenuPath: string | null = null;

	// 如果没有提供路径，返回默认值
	if (!path) {
		return {
			findMenu: null,
			rootMenu: null,
			rootMenuPath: null,
		};
	}

	// 递归查找函数
	const find = (
		list: MenuItemType[],
		targetPath: string,
		parents: MenuItemType[] = [],
	): boolean => {
		for (const menu of list) {
			// 如果找到目标菜单
			if (menu.key === targetPath) {
				findMenu = menu;
				// 如果没有父级菜单，说明当前菜单就是根菜单
				if (parents.length === 0) {
					rootMenu = menu;
					rootMenuPath = menu.key || null;
				}
				else {
					// 获取最顶层的父级菜单
					rootMenu = parents[0];
					rootMenuPath = parents[0].key || null;
				}
				return true;
			}

			// 如果有子菜单，继续递归查找
			if (menu.children && menu.children.length > 0) {
				// 将当前菜单加入父级菜单数组
				const found = find(menu.children, targetPath, [...parents, menu]);
				if (found) {
					return true;
				}
			}
		}
		return false;
	};

	// 开始查找
	find(menus, path);

	return {
		findMenu,
		rootMenu,
		rootMenuPath,
	};
}

/**
 * 递归查找第一个子菜单路径下的最深层级的第一个菜单项
 *
 * @param splitSideNavItems 菜单列表
 * @returns 找到的最深层级的第一个菜单项
 */
export function findDeepestFirstItem(splitSideNavItems: MenuItemType[]): MenuItemType | null {
	// 如果列表为空，返回 null
	if (!splitSideNavItems || splitSideNavItems.length === 0) {
		return null;
	}

	// 获取第一个菜单项
	const firstItem = splitSideNavItems[0];

	// 如果当前项有子菜单，继续递归查找
	if (firstItem.children && firstItem.children.length > 0) {
		return findDeepestFirstItem(firstItem.children);
	}

	// 如果没有子菜单了，说明到达最底层，返回当前项
	return firstItem;
}

/**
 * 判断目标键是否在子路由列表中
 *
 * @param menuItems 菜单项数组
 * @param targetKey 目标键
 * @returns 如果目标键在子路由列表中，则返回 true；否则返回 false
 */
export function findChildrenLen(menuItems: MenuItemType[], targetKey: string) {
	const subRouteChildren: string[] = [];

	for (const { children, key } of menuItems) {
		if (key && Array.isArray(children) && children.length) {
			subRouteChildren.push(key);
		}
	}

	return subRouteChildren.includes(targetKey);
}

/**
 * Logic thể hiện menu con dựa trên table_name và type_form
 * - Nếu menu có table_name có giá trị → hiển thị children (submenu)
 * - Nếu menu có type_form = 2 (Master-Detail) → ẩn children (thay bằng tabs trong grid)
 * - Nếu menu KHÔNG có table_name → ẩn children
 * - NHƯNG: Nếu children có table_name (bất chấp parent), vẫn giữ lại children
 * 
 * @param menus Mảng menu items
 * @returns Menu items với children được xử lý theo logic
 */
export function processMenuChildrenVisibility(menus: MenuItemType[]): MenuItemType[] {
	return menus.map((menu) => {
		const processedMenu = { ...menu };

		// Xử lý children một cách đệ quy (nếu có)
		if (processedMenu.children && processedMenu.children.length > 0) {
			// Đầu tiên, xử lý children của children
			processedMenu.children = processMenuChildrenVisibility(processedMenu.children);
		}

		// Quyết định có hiển thị children hay không dựa trên điều kiện
		// 1. Nếu type_form = 2 (Master-Detail), ẩn children (chúng sẽ thành tabs trong grid)
		if (Number(processedMenu.type_form) === 2) {
			processedMenu.children = [];
		}
		// 2. Mặc định: GIỮ LẠI children nếu menu có children
		// Chỉ xóa children nếu có lý do cụ thể (type_form=2 ở trên)
		// Không cần kiểm tra table_name vì menu tree từ API có thể là navigation menus không có table_name

		return processedMenu;
	});
}
