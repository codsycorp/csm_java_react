import type { PasswordLoginFormType } from "#src/pages/login/components/password-login";
import type { AppRouteRecordRaw } from "#src/router/types";
import type { UserInfoType } from "./types";
import { request } from "#src/utils";


// For cookie-based auth, do not expect any token in response
export function fetchLogin(data: PasswordLoginFormType) {
	 return request
	   .post("login", { json: { ...data, _origin: window.location.origin } })
	   .json<ApiResponse<any>>();
}

export function fetchLogout() {
	return request.post("logout").json();
}

export function fetchAsyncRoutes() {
	return request.get("get-async-routes").json<ApiResponse<AppRouteRecordRaw[]>>();
}

export function fetchUserInfo(headers?: HeadersInit) {
	return request.get("user-info", headers ? { headers } : undefined).json<ApiResponse<UserInfoType>>();
}

export interface RefreshTokenResult {
	token: string
	refreshToken: string
	csrfToken?: string
}

export const refreshTokenPath = "refresh-token";
// Không gửi refreshToken trong body, backend sẽ lấy từ httpOnly cookie
export function fetchRefreshToken() {
	 return request.post(refreshTokenPath, { json: { _origin: window.location.origin } }).json<ApiResponse<RefreshTokenResult>>();
}
