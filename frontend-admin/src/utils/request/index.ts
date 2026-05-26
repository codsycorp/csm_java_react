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

function getClientId() {
	const cookieMatch = typeof document !== "undefined"
		? document.cookie.match(/(?:^|; )csm_client_id=([^;]*)/)
		: null;
	if (cookieMatch?.[1]) {
		return decodeURIComponent(cookieMatch[1]);
	}
	try {
		return localStorage.getItem("csm_client_id") || null;
	} catch {
		return null;
	}
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
				const clientId = getClientId();
				if (clientId) {
					request.headers.set(CLIENT_ID_HEADER, clientId);
				}
				const isRefreshTokenRequest = [`/${refreshTokenPath}`].some(url => request.url.endsWith(url));
				
				// NWJS Support: Send refreshToken in header since cookies don't persist
				const isNwjs = typeof (window as any).nw !== 'undefined' || 
				              navigator.userAgent.toLowerCase().includes('nwjs') ||
				              navigator.userAgent.toLowerCase().includes('node-webkit');
				
				if (isNwjs) {
					// For nwjs, send refreshToken from localStorage in header
					try {
						const refreshToken = localStorage.getItem('refreshToken');
						if (refreshToken) {
							request.headers.set('X-Refresh-Token', refreshToken);
							console.log('[NWJS] Sending refreshToken in header');
						}
					} catch (e) {
						console.error('[NWJS] Error reading refreshToken from localStorage:', e);
					}
				}

				try {
					const refreshToken = getAuthCredentials().refreshToken;
					if (refreshToken) {
						request.headers.set('X-Refresh-Token', refreshToken);
					}
				} catch (e) {
					// ignore
				}

								const isWhiteRequest = requestWhiteList.some(url => request.url.endsWith(url));
								// Do not attach access token for refresh-token endpoint.
								// Backend filter prioritizes csm-token over refresh token, so sending both breaks refresh flow.
								if (!isWhiteRequest && !isRefreshTokenRequest) {
									try {
										const token = getAuthCredentials().token;
										if (token) {
											// Attach custom csm-token header (used by some backend handlers)
											request.headers.set(AUTH_HEADER, `${token}`);
											// Debug: print csm-token header for troubleshooting (remove in prod)
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
				return requestOverride;
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
					   if (response.status === 401) {
						   const isOnLoginPage = typeof window !== "undefined" && window.location.pathname.includes("/login");
						   if ([`/${refreshTokenPath}`].some(url => request.url.endsWith(url))) {
						   // Clear cache when refresh token endpoint fails
						   clearAllClientState();
						   goLogin();
						   return response;
					   }

						   if (isOnLoginPage) {
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
						   // Clear user data immediately when session expires
						   try {
							   useUserStore.getState().reset();
						   } catch (e) {
							   console.warn("Failed to reset user store:", e);
						   }
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
