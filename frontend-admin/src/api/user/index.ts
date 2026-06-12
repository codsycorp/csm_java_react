import type { PasswordLoginFormType } from "#src/pages/login/components/password-login";
import type { AppRouteRecordRaw } from "#src/router/types";
import type { UserInfoType } from "./types";
import { getAuthCredentials } from "#src/utils/request/auth-session";
import { readRefreshTokenMirror } from "#src/utils/auth-storage";
import { request } from "#src/utils";

/** Tab-scoped user-info: JWT + X-Refresh-Token mirror only — never shared HttpOnly cookie (cross-tab bleed). */
export const USER_INFO_REQUEST_OPTIONS = {
	omitCredentials: true,
} as const;


// For cookie-based auth, do not expect any token in response
export function fetchLogin(data: PasswordLoginFormType) {
	 return request
	   .post("login", { json: { ...data, _origin: window.location.origin } })
	   .json<ApiResponse<any>>();
}

export function fetchLogout() {
	return request.post("logout").json();
}

export function fetchAsyncRoutes(headers?: HeadersInit) {
	return request.get("get-async-routes", headers ? { headers } : undefined).json<ApiResponse<AppRouteRecordRaw[]>>();
}

export function fetchUserInfo(headers?: HeadersInit, options?: { omitRefreshToken?: boolean; omitCredentials?: boolean }) {
	return request.get("user-info", {
		...(headers ? { headers } : {}),
		...(options?.omitRefreshToken ? { omitRefreshToken: true } : {}),
		...(options?.omitCredentials ? { credentials: "omit" } : {}),
	} as any).json<ApiResponse<UserInfoType>>();
}

export interface RefreshTokenResult {
	token: string
	refreshToken: string
	csrfToken?: string
}

export const refreshTokenPath = "refresh-token";

export function fetchRefreshToken() {
	const { refreshToken } = getAuthCredentials();
	const effectiveRefresh = refreshToken || readRefreshTokenMirror();
	return request
		.post(refreshTokenPath, {
			// Java: cookie refreshToken + optional X-Refresh-Token / body (cross-site admin→api).
			credentials: "include",
			headers: effectiveRefresh
				? { "X-Refresh-Token": effectiveRefresh }
				: undefined,
			json: {
				_origin: window.location.origin,
				...(effectiveRefresh ? { refreshToken: effectiveRefresh } : {}),
			},
		})
		.json<ApiResponse<RefreshTokenResult>>();
}
