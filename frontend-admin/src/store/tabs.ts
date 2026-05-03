import type { TabPaneProps } from "antd";
import { usePreferencesStore } from "#src/store/preferences";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 标签页项目属性接口
 */
export interface TabItemProps extends Omit<TabPaneProps, "tab"> {
	key: string
	label: React.ReactNode
	/**
	 * 是否可拖拽
	 */
	draggable?: boolean
	/**
	 * 可选的历史状态值，如 search 和 hash，可存储于此
	 * 在目标路由中可通过 useLocation 钩子访问该状态
	 * @see {@link https://reactrouter.com/en/main/hooks/use-navigate#optionsstate | usenavigate - options state}
	 */
	historyState?: Record<string, any>
}

// Mở rộng TabStateType để cho phép các props động cho tab động
export interface TabStateType extends Omit<TabItemProps, "label"> {
	label: string;
	icon?: React.ReactNode | string;
	m_icon?: string;
	m_icons?: string;
	// Các props động cho tab động
	menuData?: any;
	m_configs?: any;
	type_form?: any;
	table_name?: string;
	report_name?: string;
	kanban_config?: any;
	auto_code_name?: string;
	auto_code?: string;
	appId?: string;
	menuId?: string;
}

/**
 * 初始状态
 */
const initialState = {
	// 打开的标签页
	openTabs: new Map<string, TabStateType>([]),
	// 当前激活的标签页
	activeKey: "",
	// 标签页是否处于刷新状态
	isRefresh: false,
	// 是否处于最大化
	isMaximize: false,
};

const HOME_TAB_KEY = "homepage";

function normalizeHomePath(routePath: string) {
	if (routePath === "/" || routePath === "/home" || routePath === HOME_TAB_KEY) return HOME_TAB_KEY;
	return routePath;
}

function pickTabIconProps(tabProps: TabStateType): Pick<TabStateType, "icon" | "m_icon" | "m_icons"> {
	const menuLike = tabProps?.menuData || tabProps?.m_configs || {};
	const icon = tabProps?.icon ?? menuLike?.icon;
	const mIcon = String(tabProps?.m_icon || menuLike?.m_icon || "").trim();
	const mIcons = String(tabProps?.m_icons || menuLike?.m_icons || "").trim();
	return {
		icon,
		m_icon: mIcon || undefined,
		m_icons: mIcons || undefined,
	};
}

type TabsState = typeof initialState;

/**
 * 标签页操作接口
 */
interface TabsAction {
	setIsRefresh: (state: boolean) => void
	addTab: (routePath: string, tabProps: TabStateType) => void
	insertBeforeTab: (routePath: string, tabProps: TabStateType) => void
	removeTab: (routePath: string) => void
	closeRightTabs: (routePath: string) => void
	closeLeftTabs: (routePath: string) => void
	closeOtherTabs: (routePath: string) => void
	closeAllTabs: () => void
	setActiveKey: (routePath: string) => void
	resetTabs: () => void
	changeTabOrder: (from: number, to: number) => void
	toggleMaximize: (state: boolean) => void
};

/**
 * 标签页状态管理
 */
export const useTabsStore = create<TabsState & TabsAction>()(
	persist(
		set => ({
			...initialState,

			/**
			 * 设置标签页是否处于刷新状态
			 */
			setIsRefresh: (state: boolean) => {
				set({ isRefresh: state });
			},

			/**
			 * 设置标签页
			 */
			setActiveKey: (routePath: string) => {
				set({ activeKey: normalizeHomePath(routePath) });
			},

			/**
			 * 在最前面插入标签页
			 */
			insertBeforeTab: (routePath: string, tabProps: TabStateType) => {
				set((state) => {
					if (routePath.length) {
						const newMap = new Map([[routePath, tabProps]]);
						for (const [key, value] of state.openTabs) {
							newMap.set(key, value);
						}
						return { openTabs: newMap };
					}
					return state;
				});
			},

		/**
		 * 添加标签页
		 */
		addTab: (routePath: string, tabProps: TabStateType) => {
			set((state) => {
				const normalizedPath = normalizeHomePath(routePath);
				if (!normalizedPath.length) return state;

				const isHome = normalizedPath === HOME_TAB_KEY;
				const iconProps = pickTabIconProps(tabProps);

				// If tab already exists, only update label (avoid overwriting menuData/m_configs
				// which would change prop references and re-trigger data-loading effects in the component).
				if (state.openTabs.has(normalizedPath)) {
					const existingTab = state.openTabs.get(normalizedPath)!;
					const nextIcon = iconProps.icon ?? existingTab.icon;
					const nextModernIcon = iconProps.m_icon || existingTab.m_icon;
					const nextLegacyIcon = iconProps.m_icons || existingTab.m_icons;
					if (
						existingTab.label === tabProps.label
						&& existingTab.icon === nextIcon
						&& existingTab.m_icon === nextModernIcon
						&& existingTab.m_icons === nextLegacyIcon
					) {
						return state; // Nothing changed, skip to avoid spurious re-renders
					}
					const newTabs = new Map(state.openTabs);
					newTabs.set(normalizedPath, {
						...existingTab,
						label: tabProps.label,
						icon: nextIcon,
						m_icon: nextModernIcon,
						m_icons: nextLegacyIcon,
						closable: isHome ? false : existingTab.closable,
						draggable: isHome ? false : existingTab.draggable,
					});
					return { openTabs: newTabs };
				}

				const newTabs = new Map(state.openTabs);
				newTabs.set(normalizedPath, {
					...tabProps,
					...iconProps,
					key: normalizedPath,
					closable: isHome ? false : tabProps.closable,
					draggable: isHome ? false : tabProps.draggable,
				});
				return { openTabs: newTabs };
			});
		},			/**
			 * 移除标签页
			 */
			removeTab: (routePath: string) => {
				set((state) => {
					routePath = normalizeHomePath(routePath);
					const homePath = HOME_TAB_KEY;

					// 如果是首页，不允许关闭
					if (routePath === homePath) {
						return state;
					}

					const newTabs = new Map(state.openTabs);
					newTabs.delete(routePath);
					let newActiveKey = state.activeKey;

					// 移除当前激活的标签页，则选择最后一个标签页
					if (routePath === state.activeKey) {
						const tabsArray = Array.from(newTabs.keys());
						newActiveKey = tabsArray.at(-1) || homePath;
					}

					// 确保至少保留首页标签
					if (newTabs.size === 0) {
						newTabs.set(homePath, state.openTabs.get(homePath)!);
						newActiveKey = homePath;
					}

					return { openTabs: newTabs, activeKey: newActiveKey };
				});
			},

			/**
			 * 关闭右侧标签页
			 */
			closeRightTabs: (routePath: string) => {
				set((state) => {
					routePath = normalizeHomePath(routePath);
					const newTabs = new Map();
					let found = false;
					let activeKeyFound = false;
					let newActiveKey = state.activeKey;

					// 遍历当前所有标签页
					for (const [key, value] of state.openTabs) {
						// 如果已找到指定路径，停止遍历
						if (found) {
							break;
						}
						// 将当前标签页添加到新的Map中
						newTabs.set(key, value);
						// 如果当前key等于指定路径，标记为已找到
						if (key === routePath) {
							found = true;
						}
						// 如果当前key等于当前激活的标签页，标记activeKey已找到
						if (key === state.activeKey) {
							activeKeyFound = true;
						}
					}

					// 如果当前激活的标签页被关闭，将新的激活标签页设置为指定路径
					if (!activeKeyFound) {
						newActiveKey = routePath;
					}

					// 返回更新后的状态
					return { openTabs: newTabs, activeKey: newActiveKey };
				});
			},

			/**
			 * 关闭左侧标签页
			 */
			closeLeftTabs: (routePath: string) => {
				set((state) => {
					routePath = normalizeHomePath(routePath);
					const newTabs = new Map();
					const homePath = HOME_TAB_KEY;
					let found = false;
					let newActiveKey = state.activeKey;
					let activeKeyOnRight = false;

					// 首先添加首页标签，因为它不能被删除
					newTabs.set(homePath, state.openTabs.get(homePath)!);

					// 遍历当前所有标签页
					for (const [key, value] of state.openTabs) {
						if (key === homePath)
							continue; // 跳过首页，因为已经添加过了

						if (found || key === routePath) {
							newTabs.set(key, value);
							found = true;
						}

						if (key === state.activeKey && found) {
							activeKeyOnRight = true;
						}
					}

					// 如果当前激活的标签页在左侧被关闭，将新的激活标签页设置为指定路径
					if (!activeKeyOnRight) {
						newActiveKey = routePath;
					}

					// 返回更新后的状态
					return { openTabs: newTabs, activeKey: newActiveKey };
				});
			},

			/**
			 * 关闭其他标签页
			 */
			closeOtherTabs: (routePath: string) => {
				set((state) => {
					routePath = normalizeHomePath(routePath);
					const newTabs = new Map();
					const homePath = HOME_TAB_KEY;

					// 保留首页标签
					newTabs.set(homePath, state.openTabs.get(homePath)!);

					// 保留指定的标签页
					if (routePath !== homePath && state.openTabs.has(routePath)) {
						newTabs.set(routePath, state.openTabs.get(routePath)!);
					}

					// 更新激活的标签页
					let newActiveKey = state.activeKey;
					if (!newTabs.has(state.activeKey)) {
						newActiveKey = routePath;
					}

					return { openTabs: newTabs, activeKey: newActiveKey };
				});
			},

			/**
			 * 关闭所有标签页
			 */
			closeAllTabs: () => {
				set((state) => {
					const newTabs = new Map();
					const homePath = HOME_TAB_KEY;
					newTabs.set(homePath, state.openTabs.get(homePath)!);
					return { openTabs: newTabs, activeKey: homePath };
				});
			},

			/**
			 * 更改标签页顺序
			 */
			changeTabOrder: (from: number, to: number) => {
				set((state) => {
					// 也可以使用 import { arrayMove } from "@dnd-kit/sortable"; 来交换位置
					const newTabs = Array.from(state.openTabs.entries());
					const [movedTab] = newTabs.splice(from, 1); // 直接解构获取移动的标签
					newTabs.splice(to, 0, movedTab); // 插入到新位置

					const newOpenTabs = new Map(newTabs); // 直接使用 Map 构造函数
					return { openTabs: newOpenTabs };
				});
			},

			/**
			 * 切换标签页最大化状态
			 * @param {boolean} state - 最大化状态
			 */
			toggleMaximize: (state: boolean) => {
				set({ isMaximize: state });
			},

			/**
			 * 重置标签页状态
			 */
			resetTabs: () => {
				set(() => {
					return { ...initialState };
				});
			},

		}),
		{
			name: "tabbar",
			/**
			 * activeKey 不需要持久化存储
			 *
			 * 假如页面路由为 /home
			 * 手动在地址栏输入 /about
			 * activeKey 仍为 /home 导致 src/layout/layout-tabbar/index.tsx 的自动导航功能失效
			 * @see https://github.com/condorheroblog/react-antd-admin/issues/1
			 */
			partialize: (state) => {
				return Object.fromEntries(
					Object.entries(state).filter(([key]) => !["activeKey"].includes(key)),
				);
			},
			/**
			 * openTabs 是一个 Map，持久化存储需要手动管理
			 * How do I use it with Map and Set
			 * @see https://github.com/pmndrs/zustand/blob/v5.0.1/docs/integrations/persisting-store-data.md#how-do-i-use-it-with-map-and-set
			 */
			storage: {
				getItem: (name) => {
					const str = sessionStorage.getItem(name);
					// 是否开启持久化存储，如果未开启则在页面初次进入时返回 null 即可
					const isPersist = usePreferencesStore.getState().tabbarPersist;
					if (!str || !isPersist)
						return null;
					const existingValue = JSON.parse(str);
					const homePath = HOME_TAB_KEY;

					// Normalize restored openTabs to avoid duplicate home tabs (/ vs /home) and ensure home is not closable
					const normalizedEntries: [string, any][] = [];
					for (const [key, value] of existingValue.state.openTabs as [string, any][]) {
						const normalizedKey = key === "/" || key === "/home" ? homePath : key;
						const isHome = normalizedKey === homePath;
						normalizedEntries.push([
							normalizedKey,
							{ ...value, closable: !isHome, draggable: !isHome },
						]);
					}

					return {
						...existingValue,
						state: {
							...existingValue.state,
							openTabs: new Map(normalizedEntries),
						},
					};
				},
				setItem: (name, newValue) => {
					// functions cannot be JSON encoded
					const str = JSON.stringify({
						...newValue,
						state: {
							...newValue.state,
							openTabs: Array.from(newValue.state.openTabs.entries()),
						},
					});
					sessionStorage.setItem(name, str);
				},
				removeItem: name => sessionStorage.removeItem(name),
			},
		},
	),

);
