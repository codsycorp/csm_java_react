// External libraries

import type { Options } from "ky";
import ky from "ky";

// API & Store
import { refreshTokenPath } from "#src/api/user";
import { LOGIN } from "#src/router/constants";
import { usePreferencesStore, useUserStore } from "#src/store";
import { clearAllClientState } from "#src/utils/app-reset";

// Local utilities
import { AUTH_HEADER, CLIENT_ID_HEADER, LANG_HEADER } from "./constants";
import { getClientSessionId, isNwjsRuntime } from "#src/utils/browser-client-id";
import { readRefreshTokenMirror } from "#src/utils/auth-storage";
import { getAuthCredentials, hasAuthSession, readPersistedAuthState } from "./auth-session";
import { handleErrorResponse } from "./error-response";
import { globalProgress } from "./global-progress";
import { goLogin } from "./go-login";
import { refreshTokenAndRetry } from "./refresh";


// Request whitelist - các endpoint không cần token
const requestWhiteList = ["/login"];

// Flag to prevent multiple simultaneous 401 handling
let is401HandlingInProgress = false;

// Helper: Lấy CSRF token từ cookie chỉ theo domain của VITE_API_BASE_URL
import { useAuthStore } from "#src/store/auth";

function getCsrfToken() {
	// Ưu tiên đồng bộ với cookie để tránh mismatch
	const match = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )CSRF-TOKEN=([^;]*)/) : null;
	if (match) return decodeURIComponent(match[1]);
	// Fallback: lấy từ Zustand store nếu cookie chưa có
	try {
		const token = useAuthStore.getState().csrfToken;
		if (token) return token;
	} catch {}
	// Fallback cuối: lấy từ persisted localStorage khi store chưa hydrate xong
	const persisted = readPersistedAuthState().csrfToken;
	if (persisted) return persisted;
	return null;
}

// Không cần set cookie CSRF-TOKEN từ frontend nữa


function hasAuthState() {
	return hasAuthSession();
}

function shouldForceSubuserScope(payload: any): boolean {
	if (!payload || typeof payload !== "object") return false;
	if (payload.only_my_subusers) return false;
	if (String(payload.obj_name || "").trim() !== "csm_group_members") return false;
	if (typeof window === "undefined") return false;
	const pathname = String(window.location?.pathname || "").toLowerCase();
	if (!pathname.includes("/system/user")) return false;
	try {
		const userState = useUserStore.getState() as any;
		const rolesRaw = userState?.roles;
		const roles = Array.isArray(rolesRaw)
			? rolesRaw
			: (typeof rolesRaw === "string" ? rolesRaw.split(/[;,\n]/g) : Object.values(rolesRaw || {}));
		const normalizedRoles = roles.map((item: any) => String(item || "").trim().toLowerCase()).filter(Boolean);
		const isDevUser = Boolean(userState?.dev) || normalizedRoles.includes("dev");
		return !isDevUser;
	} catch {
		return false;
	}
}

function withForcedSubuserScope(payload: any): any {
	if (!shouldForceSubuserScope(payload)) return payload;
	return { ...payload, only_my_subusers: true };
}
// 请求超时时间
const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 10000;

function sanitizeDoublePrefixedUrl(rawUrl: string): string | null {
	// Ky + prefixUrl bug: https://api.* /https://admin.*/api/ai-generate-seo-content
	const doublePrefixed = rawUrl.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i);
	if (!doublePrefixed) {
		return null;
	}
	const inner = doublePrefixed[1];
	if (/ai-generate-seo-content/i.test(inner)) {
		const apiBase = String(import.meta.env.VITE_API_BASE_URL || "https://api.csmbridge.net").replace(/\/+$/, "");
		return `${apiBase}/ai-generate-seo-content`;
	}
	return inner;
}

const defaultConfig: Options = {
	// In dev, always use Vite proxy to keep auth/cookie flow same-origin and stable.
	// In production, keep env-based API base URL behavior.
	prefixUrl: import.meta.env.DEV
		? '/api'
		: (import.meta.env.VITE_API_BASE_URL || '/api'),
   timeout: API_TIMEOUT,
   credentials: 'include', // LUÔN gửi cookie lên backend
   retry: {
	   // 当请求失败时，最多重试次数
	   limit: 3,
   },
   hooks: {
	   beforeRequest: [
		   async (request, options) => {
				let requestOverride: Request | undefined;
				const fixedUrl = sanitizeDoublePrefixedUrl(request.url);
				if (fixedUrl) {
					console.warn("[REQ] Fixed double-prefixed URL:", request.url, "→", fixedUrl);
					requestOverride = new Request(fixedUrl, request);
					request = requestOverride;
				}
			   const ignoreLoading = options.ignoreLoading;
			   if (!ignoreLoading) {
				   globalProgress.start();
			   }
				try {
					if (request.url.includes("/get-table-data")) {
						const optionsAny = options as any;
						if (optionsAny.json && typeof optionsAny.json === "object") {
							optionsAny.json = withForcedSubuserScope(optionsAny.json);
						} else if (typeof optionsAny.body === "string") {
							const parsedBody = JSON.parse(optionsAny.body);
							const nextPayload = withForcedSubuserScope(parsedBody);
							if (nextPayload !== parsedBody) {
								optionsAny.body = JSON.stringify(nextPayload);
								requestOverride = new Request(request, { body: optionsAny.body });
							}
						}
					}
				} catch {
					// Ignore payload rewrite failures and continue with original request.
				}
				// Set language header for all requests
				request.headers.set(LANG_HEADER, usePreferencesStore.getState().language);
				const clientId = getClientSessionId();
				if (clientId) {
					request.headers.set(CLIENT_ID_HEADER, clientId);
				}
				const isRefreshTokenRequest = [`/${refreshTokenPath}`].some(url => request.url.endsWith(url));
				const isWhiteRequest = requestWhiteList.some(url => request.url.endsWith(url));
				const isSeoSyncRequest = request.url.includes("ai-generate-seo-content");
				const omitRefreshToken = Boolean((options as any)?.omitRefreshToken) || isSeoSyncRequest;

				// Login: never send stale session headers.
				if (isWhiteRequest) {
					request.headers.delete("X-Refresh-Token");
					request.headers.delete(AUTH_HEADER);
					request.headers.delete("csm-token");
				} else if (!omitRefreshToken) {
					const refreshToken = getAuthCredentials().refreshToken || readRefreshTokenMirror();
					if (refreshToken) {
						request.headers.set("X-Refresh-Token", refreshToken);
					} else if (isNwjsRuntime()) {
						try {
							const legacy = localStorage.getItem("refreshToken");
							if (legacy) {
								request.headers.set("X-Refresh-Token", legacy);
							}
						} catch (e) {
							console.error("[NWJS] Error reading refreshToken from localStorage:", e);
						}
					}
				} else {
					request.headers.delete("X-Refresh-Token");
				}

				// Do not attach access token for refresh-token or login endpoints.
				if (!isWhiteRequest && !isRefreshTokenRequest) {
					try {
						const existingToken = request.headers.get(AUTH_HEADER)?.trim();
						const token = existingToken || getAuthCredentials().token;
						if (token) {
							request.headers.set(AUTH_HEADER, `${token}`);
							try {
								console.debug("[REQ DEBUG] url:", request.url, AUTH_HEADER + ":", request.headers.get(AUTH_HEADER));
							} catch (e) {}
						}
					} catch (e) {
						// ignore
					}
				}
				
				

				
				// CSRF: Send token for data modification requests
					if (["POST", "PUT", "DELETE"].includes(request.method.toUpperCase())) {
						const csrfToken = getCsrfToken();
						if (csrfToken) {
							// Luôn ghi đè header, không merge để tránh lặp giá trị
							request.headers.delete("X-CSRF-Token");
							request.headers.set("X-CSRF-Token", csrfToken);
						}
					}
				
				// DIAGNOSTIC: Log user-info / refresh-token request headers
				if (request.url.includes('/user-info') || isRefreshTokenRequest) {
					console.log("[DIAGNOSTIC] user-info request - sending headers:", {
						url: request.url,
						'csm-token': request.headers.get('csm-token'),
						'X-Refresh-Token': request.headers.get('X-Refresh-Token'),
						'Authorization': request.headers.get('Authorization'),
						all_headers: Array.from(request.headers.entries()).map(([k, v]) => ({ key: k, value: v }))
					});
				}
				return requestOverride ?? request;
			},
		],
		afterResponse: [
			async (request, options, response) => {
				const ignoreLoading = options.ignoreLoading;
				if (!ignoreLoading) {
					globalProgress.done();
				}
				// request error
				   if (!response.ok) {
					   // Long sync SEO: không refresh+retry (tránh storm / nginx 404 khi gửi kèm X-Refresh-Token).
					   if (request.url.includes("ai-generate-seo-content")) {
						   return response;
					   }
					   if (response.status === 401) {
						   const isOnLoginPage = typeof window !== "undefined" && window.location.pathname.includes("/login");
						   if ([`/${refreshTokenPath}`].some(url => request.url.endsWith(url))) {
						   // Clear cache when refresh token endpoint fails
						   clearAllClientState();
						   goLogin();
						   return response;
					   }

						   if (isOnLoginPage) {
							   const hasExplicitToken = Boolean(request.headers.get(AUTH_HEADER));
							   if (hasExplicitToken && request.url.includes("/user-info")) {
								   return response;
							   }
							   if (hasAuthState()) {
								   try {
									   return await refreshTokenAndRetry(request, options);
								   } catch (error) {
									   console.warn("[Auth] Refresh failed during login bootstrap:", error);
								   }
							   }
							   // Đã ở trang login, không log lỗi, không throw, chỉ return response
							   // console.warn("[Auth] Ignoring stale 401 on login page without clearing fresh login state:", request.url);
							   return response;
						   }
					   
					   // Prevent multiple simultaneous 401 handling — queue behind active refresh instead of returning raw 401.
					   if (is401HandlingInProgress) {
						   try {
							   return await refreshTokenAndRetry(request, options);
						   } catch (queuedRefreshError) {
							   console.warn("[Auth] Queued refresh retry failed:", queuedRefreshError);
							   return response;
						   }
					   }
					   
					   is401HandlingInProgress = true;
					   try {
						   return await refreshTokenAndRetry(request, options);
					   } finally {
						   is401HandlingInProgress = false;
					   }
					   }
					// Nếu bị 403 do CSRF, cố gắng đọc csrfToken từ response JSON (server trả kèm) rồi retry 1 lần
					if (response.status === 403 && !(options as any)._csrfRetried) {
						try {
							const cloned = response.clone();
							const raw = await cloned.text();
							console.log(`[403 DEBUG] URL: ${request.url}, Response body length: ${raw.length}`, raw.substring(0, 500));
							
							let data: any = {};
							if (raw && raw.trim()) {
								try {
									data = JSON.parse(raw);
								} catch (parseErr) {
									console.log("[403 DEBUG] Failed to parse JSON:", parseErr);
								}
							}
							
							const tokenFromBody = (data as any)?.csrfToken || (data as any)?.result?.csrfToken;
							console.log(`[403 DEBUG] CSRF token in body: ${Boolean(tokenFromBody)}, hasAuthState: ${hasAuthState()}`);
							
						if (tokenFromBody) {
							// Cập nhật store để các request sau dùng token mới
							try { 
								useAuthStore.setState({ csrfToken: tokenFromBody });
								console.log("[CSRF] Token mới từ 403:", tokenFromBody);
							} catch {}
							
							// Retry với token mới - luôn tạo instance Headers mới để không bị merge header cũ
							const newHeaders = new Headers(request.headers);
							newHeaders.delete("X-CSRF-Token");
							newHeaders.set("X-CSRF-Token", tokenFromBody);
							const retryOptions = {
								...options,
								_csrfRetried: true,
								headers: newHeaders,
								prefixUrl: undefined
							};
							return ky(request.url, retryOptions);
						}
					} catch (e) {
						console.error("[CSRF] Lỗi khi parse 403 body:", e);
					}
						// Không có csrfToken trong body: có thể là 403 do token hết hạn/thiếu token ở API bảo vệ.
						// Thử refresh + retry 1 lần nếu có trạng thái đăng nhập.
						if (!(options as any)._authRetried && hasAuthState()) {
							try {
								console.log("[403] Attempting auth refresh + retry for:", request.url);
								const retryOptions = { ...options, _authRetried: true } as Options;
								return await refreshTokenAndRetry(request, retryOptions);
							} catch (refreshError) {
								console.warn("[AUTH] Refresh after 403 failed:", refreshError);
							}
						}
					}
					   return handleErrorResponse(response);
				   }
				   // request success
				   return response;
			},
		],
	},
};

export const request = ky.create(defaultConfig);
