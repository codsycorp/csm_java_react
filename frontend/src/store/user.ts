import type { UserInfoType } from "#src/api/user/types";
import { fetchUserInfo } from "#src/api/user";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const initialState = {
	userId: "",
	avatar: "",
	username: "",
	email: "",
	phoneNumber: "",
	full_name: "",
	description: "",
	roles: [] as string[],
	permissions: [] as string[],
	menusPermissions: [] as string[],
	app_id: "",
	app_token: "",
	dev: false, // Thêm dev flag để track quyền dev/admin
	wholeMenus: [],
	selectedMenuIdForTab: "", // Track selected menu for grid/report tab
};

type UserState = UserInfoType & {
	selectedMenuIdForTab: string;
};

interface UserAction {
	getUserInfo: (headers?: HeadersInit) => Promise<UserInfoType>
	reset: () => void
	setSelectedMenuIdForTab: (menuId: string) => void
};

export const useUserStore = create<UserState & UserAction>()(
	persist(
		set => ({
			...initialState,

			getUserInfo: async (headers) => {
				const response = await fetchUserInfo(headers);
				set({
					...response.result,
				});
				return response.result;
			},

			reset: () => {
				return set({
					...initialState,
				});
			},

			setSelectedMenuIdForTab: (menuId: string) => {
				set({ selectedMenuIdForTab: menuId });
			},

		}),
		{ name: "user-info" }
	),
);
