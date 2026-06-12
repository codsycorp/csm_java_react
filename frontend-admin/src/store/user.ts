import type { UserInfoType } from "#src/api/user/types";
import { fetchUserInfo } from "#src/api/user";
import { normalizeUserSessionAppId } from "#src/utils/user-app-id";
import { parseJwtSessionClaims, sanitizeUserInfoAgainstLogin, sessionClaimsMatchUser } from "#src/utils/jwt-session";
import { getAuthCredentials } from "#src/utils/request/auth-session";
import { useAppStore } from "#src/store/app";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const initialState = {
	userId: "",
	avatar: "",
	username: "",
	email: "",
	phoneNumber: "",
	user_address: "",
	user_adress: "",
	full_name: "",
	description: "",
	roles: [] as string[],
	permissions: [] as string[],
	menusPermissions: [] as string[],
	permissionBitfield: "",
	permissionSchemaVersion: "",
	dataScope: "NONE" as "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL",
	app_id: "",
	app_token: "",
	account_type: "main" as "main" | "sub-user",
	is_sub_user: false,
	login_identifier: "",
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
				const sessionToken = (headers as Record<string, string> | undefined)?.["csm-token"]?.trim()
					|| getAuthCredentials().token?.trim();
				const hasSessionToken = Boolean(sessionToken);
				const response = await fetchUserInfo(
					headers,
					hasSessionToken ? { omitRefreshToken: true, omitCredentials: true } : undefined,
				);
				const raw = response.result ?? {} as UserInfoType;
				const token = (headers as Record<string, string> | undefined)?.["csm-token"]
					|| getAuthCredentials().token;
				const claims = parseJwtSessionClaims(token);
				const persisted = useUserStore.getState();
				const safeRaw = sanitizeUserInfoAgainstLogin(
					{ userId: persisted.userId, app_token: persisted.app_token },
					raw,
				);
				const profileSource =
					safeRaw?.userId && claims && !sessionClaimsMatchUser(claims, safeRaw)
						? { userId: persisted.userId, app_token: persisted.app_token, ...persisted }
						: safeRaw;
				const normalized = {
					...profileSource,
					app_id: normalizeUserSessionAppId({
						app_id: raw.app_id ?? profileSource.app_id,
						app_token: raw.app_token ?? profileSource.app_token,
						menusPermissions: raw.menusPermissions ?? profileSource.menusPermissions,
						dev: raw.dev ?? profileSource.dev,
					}),
				};
				if (!normalized?.userId) {
					throw new Error("Session user mismatch");
				}
				set(normalized);
				if (normalized.app_id) {
					useAppStore.getState().setCurrentAppId(normalized.app_id);
				}
				return normalized;
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
