import type { UserInfoType } from "#src/api/user/types";
import { fetchUserInfo, USER_INFO_REQUEST_OPTIONS } from "#src/api/user";
import { normalizeUserSessionAppId } from "#src/utils/user-app-id";
import { parseJwtSessionClaims, sanitizeUserInfoAgainstLogin, sessionClaimsMatchUser } from "#src/utils/jwt-session";
import { getAuthCredentials } from "#src/utils/request/auth-session";
import { readRefreshTokenMirror } from "#src/utils/auth-storage";
import { useAppStore } from "#src/store/app";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getAuthStorage } from "#src/utils/browser-client-id";

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
	dept_id: "",
	branch_id: "",
	app_id: "",
	app_token: "",
	account_type: "main" as "main" | "sub-user",
	is_sub_user: false,
	login_identifier: "",
	dev: false,
	wholeMenus: [] as unknown[],
	selectedMenuIdForTab: "",
};

type UserState = typeof initialState;

interface UserAction {
	getUserInfo: (headers?: HeadersInit) => Promise<UserInfoType>
	reset: () => void
	setSelectedMenuIdForTab: (menuId: string) => void
}

export const useUserStore = create<UserState & UserAction>()(
	persist(
		(set, get) => ({
			...initialState,

			getUserInfo: async (headers?: HeadersInit): Promise<UserInfoType> => {
				const creds = getAuthCredentials();
				const sessionToken = (headers as Record<string, string> | undefined)?.["csm-token"]?.trim()
					|| creds.token?.trim();
				const tabRefresh = creds.refreshToken?.trim() || readRefreshTokenMirror()?.trim();
				if (!sessionToken && !tabRefresh) {
					throw new Error("No session credentials");
				}
				const requestHeaders = sessionToken
					? { ...(headers as Record<string, string> | undefined), "csm-token": sessionToken }
					: headers;
				const response = await fetchUserInfo(requestHeaders, USER_INFO_REQUEST_OPTIONS);
				const raw = (response.result ?? {}) as UserInfoType;
				const claims = parseJwtSessionClaims(sessionToken);
				if (sessionToken && claims && raw?.userId && !sessionClaimsMatchUser(claims, raw)) {
					throw new Error("Session user mismatch");
				}
				const persisted = get();
				const loginHint = {
					userId: persisted.userId,
					app_token: persisted.app_token,
				};
				const safeRaw = sanitizeUserInfoAgainstLogin(loginHint, raw);
				if (!safeRaw?.userId) {
					throw new Error("Session user mismatch");
				}
				const normalized: UserInfoType = {
					...safeRaw,
					app_id: normalizeUserSessionAppId({
						app_id: raw.app_id ?? safeRaw.app_id,
						app_token: raw.app_token ?? safeRaw.app_token,
						menusPermissions: raw.menusPermissions ?? safeRaw.menusPermissions,
						dev: raw.dev ?? safeRaw.dev,
					}),
				};
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
		{
			name: "user-info",
			storage: createJSONStorage(getAuthStorage),
		}
	),
);
