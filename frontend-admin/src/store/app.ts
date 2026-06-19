import { create } from "zustand";
import { getAuthStorage } from "#src/utils/browser-client-id";

type Row = Record<string, any>;
export type Database = Record<string, {
	id?: string
	fields?: any
	fieldsPK?: string[]
	rows: Row[]
	app_id?: string
	totalCount?: number
	serverPaged?: boolean
	pageSize?: number
}>;

import { isPlainTenantAppId } from "#src/utils/user-app-id";

function sanitizeStoredAppId(value: string | undefined | null): string {
	const text = String(value || "").trim();
	if (text && isPlainTenantAppId(text)) {
		return text.toLowerCase() === "csm" ? "csm" : text;
	}
	return "csm";
}

const CURRENT_APP_ID_KEY = "current_app_id";

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

function readStoredAppId(): string {
	if (typeof window === "undefined") {
		return "csm";
	}
	const stored = getAuthStorage().getItem(CURRENT_APP_ID_KEY)?.trim();
	if (stored) {
		return sanitizeStoredAppId(stored);
	}
	if (window.__INITIAL_REACT_DATA__?.app_id) {
		return sanitizeStoredAppId(window.__INITIAL_REACT_DATA__.app_id);
	}
	return "csm";
}

const initialAppId = readStoredAppId();
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
	mergeTableRows: (tableName: string, rows: Row[], meta?: Partial<Database[string]>) => void
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
		const safeAppId = sanitizeStoredAppId(appId);
		set({ currentAppId: safeAppId });
		if (typeof window !== "undefined") {
			getAuthStorage().setItem(CURRENT_APP_ID_KEY, safeAppId);
			try { localStorage.removeItem(CURRENT_APP_ID_KEY); } catch {}
		}
	},

	getCurrentAppId: () => {
		const fromState = get().currentAppId?.trim();
		if (fromState) {
			return fromState;
		}
		return readStoredAppId();
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

	mergeTableRows: (tableName: string, rows: Row[], meta?: Partial<Database[string]>) => {
		if (!tableName || !Array.isArray(rows) || rows.length === 0) return;
		set((state) => {
			const existing = state.database[tableName];
			const existingRows = Array.isArray(existing?.rows) ? existing.rows : [];
			const merged = new Map<string, Row>();
			const rowKey = (row: Row) => {
				const id = row?.id;
				if (id != null && String(id).trim() !== "") return String(id);
				return JSON.stringify(row);
			};
			existingRows.forEach((row) => merged.set(rowKey(row), row));
			rows.forEach((row) => merged.set(rowKey(row), row));
			return {
				database: {
					...state.database,
					[tableName]: {
						...(existing || {}),
						...(meta || {}),
						id: tableName,
						rows: Array.from(merged.values()),
					},
				},
			};
		});
	},

	getDatabase: (): Database => {
		return get().database;
	},

	reset: () => {
		set({ currentAppId: "csm", database: {} });
		if (typeof window !== "undefined") {
			try { getAuthStorage().removeItem(CURRENT_APP_ID_KEY); } catch {}
			try { localStorage.removeItem(CURRENT_APP_ID_KEY); } catch {}
		}
	},

}));
