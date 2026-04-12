import type { MenuItemType } from "#src/layout/layout-menu/types";
import type { AppRouteRecordRaw } from "#src/router/types";

import { rootChildRoutes } from "#src/router/routes";
import { flattenRoutes, getMenuItems } from "#src/router/utils";
import { create } from "zustand";

interface PermissionState {
  wholeMenus: MenuItemType[];
  apiWholeMenus: any[];
  flatRouteList: Record<string, AppRouteRecordRaw>;
  hasFetchedDynamicRoutes: boolean;
  handleAsyncRoutes: (appIdParam?: string, authToken?: string) => Promise<void>;
  reset: () => void;
}

const initialState: Omit<PermissionState, "handleAsyncRoutes" | "reset"> = {
  wholeMenus: getMenuItems(rootChildRoutes),
  apiWholeMenus: [],
  flatRouteList: flattenRoutes(rootChildRoutes),
  hasFetchedDynamicRoutes: true,
};

// Frontend-web uses website flow and does not need admin/dynamic permission pipeline.
export const usePermissionStore = create<PermissionState>()((set) => ({
  ...initialState,
  handleAsyncRoutes: async () => {
    set({ hasFetchedDynamicRoutes: true });
  },
  reset: () => {
    set({ ...initialState });
  },
}));
