// Stub store for tabs - no tab management needed for public website
import { create } from "zustand";

interface TabsState {
	activeKey?: string;
	isRefresh: boolean;
	isMaximize: boolean;
	openTabs: any[];
	setActiveKey: (key: string) => void;
	setIsRefresh: (refresh: boolean) => void;
	addTab: (tab: any) => void;
	insertBeforeTab: (tab: any) => void;
	changeTabOrder: (tabs: any[]) => void;
	resetTabs: () => void;
}

export const useTabsStore = create<TabsState>()(() => ({
	activeKey: undefined,
	isRefresh: false,
	isMaximize: false,
	openTabs: [],
	setActiveKey: () => {},
	setIsRefresh: () => {},
	addTab: () => {},
	insertBeforeTab: () => {},
	changeTabOrder: () => {},
	resetTabs: () => {},
}));
