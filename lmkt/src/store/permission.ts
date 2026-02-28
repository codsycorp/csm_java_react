// Stub store for permission - no authentication needed for public website
import { create } from "zustand";

interface PermissionState {
	wholeMenus: any[];
	flatRouteList: any[];
	hasFetchedDynamicRoutes: boolean;
	apiWholeMenus: any[];
	handleAsyncRoutes: () => Promise<void>;
	reset: () => void;
}

export const usePermissionStore = create<PermissionState>()(() => ({
	wholeMenus: [],
	flatRouteList: [],
	hasFetchedDynamicRoutes: false,
	apiWholeMenus: [],
	handleAsyncRoutes: async () => {},
	reset: () => {},
}));
