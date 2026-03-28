import type { MenuProps } from "antd";
import type { MenuItemType } from "./types";

import { useDeviceType } from "#src/hooks";
import { LayoutContext } from "#src/layout/container-layout/layout-context";
import { removeTrailingSlash } from "#src/router/utils";
import { useAppStore, useUserStore } from "#src/store";

import { Menu } from "antd";
import { useContext, useEffect, useMemo, useState } from "react";
import { useMatches, useLocation } from "react-router";

import { findChildrenLen } from "./utils";

interface LayoutMenuProps {
	mode?: MenuProps["mode"]
	/**
	 * 是否自动展开菜单，用于解决水平菜单下子菜单展开自动关闭的问题
	 */
	autoOpenMenu?: boolean
	menus?: MenuItemType[]
	handleMenuSelect?: (key: string, mode: MenuProps["mode"]) => void
}

const emptyArray: MenuItemType[] = [];
export default function LayoutMenu({
	mode = "inline",
	autoOpenMenu,
	handleMenuSelect,
	menus = emptyArray,
}: LayoutMenuProps) {
	const matches = useMatches();
	const location = useLocation();
	const { sidebarCollapsed } = useContext(LayoutContext);
	const [openKeys, setOpenKeys] = useState<string[]>([]);
	const { isMobile } = useDeviceType();
	const currentAppId = useAppStore(state => state.currentAppId);
	const userAppId = useUserStore(state => state.app_id);

	const effectiveAppId = useMemo(() => {
		const fromUser = String(userAppId || "").trim();
		if (fromUser) return fromUser;
		const fromStore = String(currentAppId || "").trim();
		return fromStore || "csm";
	}, [userAppId, currentAppId]);

	const openKeysStorageKey = useMemo(() => {
		return `layout_menu_open_keys:${effectiveAppId}:${mode}`;
	}, [effectiveAppId, mode]);

	const getSelectedKeys = useMemo(() => {
		const homePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
		const pathRaw = removeTrailingSlash(location.pathname);
		const normalizedPath = pathRaw === "/" ? homePath : pathRaw;
		// For dynamic grid routes, extract menuId and use it as selected key
		const match = normalizedPath.match(/\/system\/grid\/(.+)$/);
		if (match) {
			return [match[1]]; // Use menuId as selected key
		}
		return [normalizedPath];
	}, [location.pathname]);

	const selectedKey = useMemo(() => String(getSelectedKeys[0] || ""), [getSelectedKeys]);

	const findMenuKeyPath = (
		items: MenuItemType[],
		targetKey: string,
		parents: string[] = [],
	): string[] => {
		for (const item of items) {
			const key = String(item?.key || "");
			if (!key) continue;

			if (key === targetKey) {
				return [...parents, key];
			}

			const children = Array.isArray(item?.children)
				? (item.children as MenuItemType[])
				: [];
			if (children.length > 0) {
				const found = findMenuKeyPath(children, targetKey, [...parents, key]);
				if (found.length > 0) {
					return found;
				}
			}
		}

		return [];
	};

	const menuInlineCollapsedProp = useMemo(
		() => {
			/* inlineCollapsed 只在 inline 模式可用 */
			if (mode === "inline") {
				return { inlineCollapsed: isMobile ? false : sidebarCollapsed };
			}
			return {};
		},
		[mode, isMobile, sidebarCollapsed],
	);

	const handleOpenChange: MenuProps["onOpenChange"] = (keys) => {
		const normalizedKeys = (Array.isArray(keys) ? keys : [])
			.map(key => String(key))
			.filter(key => !!key && !!findChildrenLen(menus, key));
		setOpenKeys(normalizedKeys);
	};

	const menuOpenProps = useMemo(
		() => {
			/* inlineCollapsed 只在 inline 模式可用 */
			if (autoOpenMenu) {
				return {
					openKeys,
					onOpenChange: handleOpenChange,
				};
			}
			return {};
		},
		[autoOpenMenu, openKeys],
	);

	useEffect(() => {
		if (!autoOpenMenu) return;
		try {
			const raw = sessionStorage.getItem(openKeysStorageKey);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return;
			const restored = parsed
				.map((key: unknown) => String(key || ""))
				.filter((key: string) => !!key && !!findChildrenLen(menus, key));
			if (restored.length > 0) {
				setOpenKeys(restored);
			}
		} catch {
			// Ignore broken storage payload.
		}
	}, [autoOpenMenu, openKeysStorageKey, menus]);

	useEffect(() => {
		if (!autoOpenMenu) return;
		sessionStorage.setItem(openKeysStorageKey, JSON.stringify(openKeys));
	}, [autoOpenMenu, openKeysStorageKey, openKeys]);

	useEffect(() => {
		if (!autoOpenMenu || sidebarCollapsed || !selectedKey) return;
		const keyPath = findMenuKeyPath(menus, selectedKey);
		if (keyPath.length === 0) return;

		// Keep user-expanded branches and ensure current branch is always expanded.
		setOpenKeys((prev) => {
			const merged = Array.from(new Set([...prev, ...keyPath.slice(0, -1)]));
			return merged.filter((key) => !!findChildrenLen(menus, key));
		});
	}, [autoOpenMenu, sidebarCollapsed, selectedKey, menus, matches]);

	return (
		<Menu
			/**
			 * min-w-0 flex-auto 解决在 Flex 布局中，Menu 没有按照预期响应式省略菜单
			 * @see https://ant-design.antgroup.com/components/menu#why-menu-do-not-responsive-collapse-in-flex-layout
			 */
			className="!border-none min-w-0 flex-auto"
			inlineIndent={16}
			{...menuInlineCollapsedProp}
			style={{ height: isMobile ? "100%" : "initial" }}
			mode={mode}
			// theme="dark"
			items={menus}
			{...menuOpenProps}
			selectedKeys={getSelectedKeys}
			onSelect={({ key }) => handleMenuSelect?.(key, mode)}
		/>
	);
}
