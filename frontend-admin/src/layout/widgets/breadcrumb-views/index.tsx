import type { BreadcrumbProps } from "antd";

import { isString } from "#src/utils";

import { Breadcrumb } from "antd";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { useMemo } from "react";
import { useAppStore, usePermissionStore, useTabsStore, useUserStore } from "#src/store";

const itemRender: BreadcrumbProps["itemRender"] = (route, params, routes) => {
	const last = routes.indexOf(route) === routes.length - 1;
	return last || !route.path
		? (
			<span>{route.title}</span>
		)
		: (
			<span>{route.title}</span>
			// <NavLink to={route.path}>{route.title}</NavLink>
		);
};

type AnyMenuNode = Record<string, any>;

interface IndexedMenuNode {
	id: string;
	key: string;
	path: string;
	appId: string;
	label: string;
	label_en: string;
	label_zh: string;
	name: string;
	name_en: string;
	name_zh: string;
	parent?: IndexedMenuNode;
}

const SYSTEM_PATH_TITLE_KEY_MAP: Record<string, string> = {
	"/system": "common.menu.system",
	"/system/user": "common.menu.user",
	"/system/dept": "common.menu.permissionGroup",
	"/system/role": "common.menu.permissionGroup",
	"/system/roles": "common.menu.permissionGroup",
	"/system/departments": "common.menu.dept",
	"/system/branches": "common.menu.branch",
	"/system/menu": "common.menu.menu",
	"/system/routers": "common.menu.routers",
	"/system/apps": "common.menu.apps",
	"/system/react-native": "common.menu.reactNative",
	"/system/developer": "common.menu.developer",
	"/system/broadcast": "common.menu.broadcast",
};

const RAW_SYSTEM_TITLE_KEY_MAP: Record<string, string> = {
	system: "common.menu.system",
	user: "common.menu.user",
	dept: "common.menu.dept",
	department: "common.menu.dept",
	branch: "common.menu.branch",
	menu: "common.menu.menu",
	routers: "common.menu.routers",
	apps: "common.menu.apps",
};

function normalizeToken(raw: unknown): string {
	return String(raw || "").trim().toLowerCase();
}

function dedupeTitles(items: Array<{ title: string; path: string }>): Array<{ title: string; path: string }> {
	const out: Array<{ title: string; path: string }> = [];
	const seen = new Set<string>();
	items.forEach((item) => {
		const title = String(item.title || "").trim();
		if (!title) return;
		const signature = `${normalizeToken(title)}::${normalizeToken(item.path)}`;
		if (seen.has(signature)) return;
		seen.add(signature);
		out.push({ title, path: item.path });
	});
	return out;
}


export function BreadcrumbViews() {
	const { t, i18n } = useTranslation();
	const matches = useMatches();
	const openTabs = useTabsStore(state => state.openTabs);
	const activeKey = useTabsStore(state => state.activeKey);
	const currentAppId = useAppStore(state => state.currentAppId);
	const userAppId = useUserStore(state => state.app_id);
	const wholeMenus = usePermissionStore(state => state.wholeMenus);
	const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
	const tab = openTabs.get(activeKey);
	const currentLang = String(i18n.language || "vi").toLowerCase();

	const tabLabel = useMemo(() => {
		if (!tab) return "";
		if (tab.label) {
			return String(isString(tab.label) ? t(tab.label) : tab.label);
		}
		if (tab.menuData && (tab.menuData.label || tab.menuData.title || tab.menuData.name)) {
			return String(tab.menuData.label || tab.menuData.title || tab.menuData.name);
		}
		return "";
	}, [tab, t]);

	const resolvedAppId = useMemo(() => {
		const candidates = [
			tab?.appId,
			tab?.menuData?.app_id,
			tab?.m_configs?.app_id,
			userAppId,
			currentAppId,
		];
		return String(candidates.find(Boolean) || "").trim();
	}, [tab?.appId, tab?.menuData?.app_id, tab?.m_configs?.app_id, userAppId, currentAppId]);

	const indexedMenus = useMemo(() => {
		const indexed: IndexedMenuNode[] = [];

		const visit = (items: AnyMenuNode[] | undefined, parent?: IndexedMenuNode) => {
			if (!Array.isArray(items)) return;
			items.forEach((item) => {
				if (!item || typeof item !== "object") return;
				const node: IndexedMenuNode = {
					id: String(item.id || item.menuId || item.key || item.path || "").trim(),
					key: String(item.key || item.path || item.id || "").trim(),
					path: String(item.path || item.key || "").trim(),
					appId: String(item.app_id || "").trim(),
					label: String(item.label || item.title || "").trim(),
					label_en: String(item.label_en || "").trim(),
					label_zh: String(item.label_zh || "").trim(),
					name: String(item.name || "").trim(),
					name_en: String(item.name_en || "").trim(),
					name_zh: String(item.name_zh || "").trim(),
					parent,
				};
				indexed.push(node);
				const nextChildren = Array.isArray(item.children) && item.children.length > 0
					? item.children
					: (Array.isArray(item.nodes) ? item.nodes : undefined);
				visit(nextChildren, node);
			});
		};

		visit(wholeMenus as any[]);
		visit(apiWholeMenus as any[]);
		return indexed;
	}, [wholeMenus, apiWholeMenus]);

	const resolveNodeTitle = (node?: IndexedMenuNode): string => {
		if (!node) return "";
		const normalizedPath = normalizeToken(node.path);
		const mappedPathKey = SYSTEM_PATH_TITLE_KEY_MAP[normalizedPath];
		if (mappedPathKey) {
			return t(mappedPathKey);
		}
		const localized = currentLang.startsWith("en")
			? (node.label_en || node.name_en || node.label || node.name)
			: currentLang.startsWith("zh")
				? (node.label_zh || node.name_zh || node.label || node.name)
				: (node.label || node.name || node.label_en || node.label_zh);
		if (!localized) return "";
		if (localized.includes(".")) {
			return t(localized);
		}
		const normalizedLocalized = normalizeToken(localized);
		const mappedRawKey = RAW_SYSTEM_TITLE_KEY_MAP[normalizedLocalized];
		if (mappedRawKey) {
			return t(mappedRawKey);
		}
		return localized;
	};

	const breadcrumbItems = useMemo(() => {
		if (activeKey === "homepage") {
			return [{ title: t("common.menu.home"), path: "homepage" }];
		}

		const runtimeMenuId = String(
			tab?.menuId
			|| tab?.menuData?.id
			|| tab?.m_configs?.id
			|| (String(activeKey || "").startsWith("/system/grid/") ? String(activeKey).replace("/system/grid/", "") : "")
			|| "",
		).trim();

		const activePathCandidates = [
			String(activeKey || "").trim(),
			String(tab?.menuData?.path || "").trim(),
			String(tab?.m_configs?.path || "").trim(),
		].filter(Boolean);

		const appNormalized = normalizeToken(resolvedAppId);
		const pickByApp = (nodes: IndexedMenuNode[]) => {
			if (nodes.length <= 1) return nodes[0];
			const matchedApp = nodes.find(node => normalizeToken(node.appId) && normalizeToken(node.appId) === appNormalized);
			if (matchedApp) return matchedApp;
			const noAppNode = nodes.find(node => !normalizeToken(node.appId));
			return noAppNode || nodes[0];
		};

		let matchedNode: IndexedMenuNode | undefined;
		if (runtimeMenuId) {
			const byId = indexedMenus.filter(node => normalizeToken(node.id) === normalizeToken(runtimeMenuId));
			matchedNode = pickByApp(byId);
		}

		if (!matchedNode) {
			for (const candidatePath of activePathCandidates) {
				const byPath = indexedMenus.filter(node => normalizeToken(node.path) === normalizeToken(candidatePath) || normalizeToken(node.key) === normalizeToken(candidatePath));
				if (byPath.length > 0) {
					matchedNode = pickByApp(byPath);
					break;
				}
			}
		}

		const chain: Array<{ title: string; path: string }> = [];
		if (matchedNode) {
			let cursor: IndexedMenuNode | undefined = matchedNode;
			while (cursor) {
				const title = resolveNodeTitle(cursor);
				if (title) {
					chain.unshift({ title, path: cursor.path || cursor.key || activeKey });
				}
				cursor = cursor.parent;
			}
		}

		const activePath = String(activePathCandidates[0] || "");
		const isSystemContext = activePath.startsWith("/system")
			|| normalizeToken(tab?.menuData?.path).startsWith("/system")
			|| normalizeToken(tab?.m_configs?.path).startsWith("/system")
			|| chain.some(item => normalizeToken(item.path).startsWith("/system"));

		if (isSystemContext) {
			const systemTitle = t("common.menu.system");
			if (!chain.some(item => normalizeToken(item.title) === normalizeToken(systemTitle))) {
				chain.unshift({ title: systemTitle, path: "/system" });
			}
		} else if (resolvedAppId) {
			chain.unshift({ title: `${t("common.appId")}: ${resolvedAppId}`, path: `/app/${resolvedAppId}` });
		}

		if (tabLabel) {
			const currentTitle = chain.length > 0 ? chain[chain.length - 1]?.title : "";
			if (normalizeToken(currentTitle) !== normalizeToken(tabLabel)) {
				chain.push({ title: tabLabel, path: activeKey || "" });
			}
		}

		if (chain.length > 0) {
			return dedupeTitles(chain);
		}

		if (tabLabel) {
			return dedupeTitles([{ title: tabLabel, path: activeKey || "" }]);
		}

		return [] as Array<{ title: string; path: string }>;
	}, [activeKey, indexedMenus, resolvedAppId, tab?.m_configs?.id, tab?.m_configs?.path, tab?.menuData?.id, tab?.menuData?.path, tab?.menuId, tabLabel, t]);

	if (breadcrumbItems.length > 0) {
		return (
			<Breadcrumb
				className="hidden md:block"
				separator="/"
				itemRender={itemRender}
				items={breadcrumbItems}
			/>
		);
	}

	// Fallback: vẫn dùng matches nếu không có tab (trường hợp đặc biệt)
	return (
		<Breadcrumb
			className="hidden md:block"
			separator="/"
			// https://ant.design/components/breadcrumb#use-with-browserhistory
			itemRender={itemRender}
			items={matches
				.filter(match => match.handle && !match.pathname.endsWith("/"))
				.map((match) => {
					const defaultTitle = isString(match.handle?.title) ? t(match.handle?.title) : match.handle?.title;
					return {
						title: defaultTitle,
						path: match.pathname,
					};
				})}
		/>
	);
}

