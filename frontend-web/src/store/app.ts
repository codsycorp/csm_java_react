import { create } from "zustand";

type Row = Record<string, any>;
export type Database = Record<string, { id: string; fields?: any; fieldsPK?: string[]; rows: Row[]; app_id?: string }>;

/**
 * @zh 应用状态管理
 * @en Application state management
 */
// Fix: Extend Window interface for SSR hydration
declare global {
	interface Window {
		__INITIAL_REACT_DATA__?: {
			app_id?: string;
			[key: string]: any;
		};
	}
}
// Ưu tiên lấy app_id từ localStorage (sau khi login), SSR, hoặc mặc định
let initialAppId = "csm";
if (typeof window !== "undefined") {
	// 1. Ưu tiên localStorage (đã lưu từ lần login trước)
	const storedAppId = localStorage.getItem("current_app_id");
	if (storedAppId) {
		initialAppId = storedAppId;
	}
	// 2. Nếu không có localStorage, lấy từ SSR data
	else if (window.__INITIAL_REACT_DATA__ && window.__INITIAL_REACT_DATA__.app_id) {
		initialAppId = window.__INITIAL_REACT_DATA__.app_id;
	}
}
const initialState = {
	currentAppId: initialAppId,
	database: {} as Database,
};

type AppState = typeof initialState;

interface AppAction {
	/**
	 * @zh 设置当前应用 ID
	 * @en Set current app ID
	 */
	setCurrentAppId: (appId: string) => void
	/**
	 * @zh 获取当前应用 ID
	 * @en Get current app ID
	 */
	getCurrentAppId: () => string
	/**
	 * @zh 设置数据库表数据
	 * @en Set database table data
	 */
	setDatabase: (database: Database) => void
	/**
	 * @zh 设置单个表数据
	 * @en Set single table data
	 */
	setTableData: (tableName: string, data: Database[string]) => void
	/**
	 * @zh 获取数据库
	 * @en Get database
	 */
	getDatabase: () => Database
	/**
	 * @zh 重置为默认应用
	 * @en Reset to default app
	 */
	reset: () => void
}

export const useAppStore = create<AppState & AppAction>((set, get) => ({
	...initialState,

	setCurrentAppId: (appId: string) => {
		set({ currentAppId: appId });
		// 保存到 localStorage 以便刷新后保留
		if (typeof window !== "undefined") {
			localStorage.setItem("current_app_id", appId);
		}
	},

	getCurrentAppId: () => {
		// Priority: localStorage > SSR data > fallback "csm"
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem("current_app_id");
			if (stored) {
				return stored;
			}
			// Check SSR data before falling back
			if (window.__INITIAL_REACT_DATA__?.app_id) {
				return window.__INITIAL_REACT_DATA__.app_id;
			}
		}
		return "csm";
	},

	setDatabase: (database: Database) => {
		set({ database });
	},

	setTableData: (tableName: string, data: Database[string]) => {
		set(state => ({
			database: {
				...state.database,
				[tableName]: data,
			},
		}));
	},

	getDatabase: (): Database => {
		return get().database;
	},

	reset: () => {
		set({ currentAppId: "csm", database: {} });
		if (typeof window !== "undefined") {
			localStorage.removeItem("current_app_id");
		}
	},

}));
