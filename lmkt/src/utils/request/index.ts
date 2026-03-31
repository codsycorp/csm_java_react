// External libraries
import type { Options } from "ky";
import ky from "ky";

import { LOGIN } from "#src/router/constants";
import { usePreferencesStore, useUserStore } from "#src/store";
import { clearAllClientState } from "#src/utils/app-reset";

// Local utilities
import { AUTH_HEADER, CLIENT_ID_HEADER, LANG_HEADER } from "./constants";
import { handleErrorResponse } from "./error-response";
import { globalProgress } from "./global-progress";
import { goLogin } from "./go-login";
import { refreshTokenAndRetry } from "./refresh";


// Request whitelist - các endpoint không cần token
const requestWhiteList = ["/login"];

// Flag to prevent multiple simultaneous 401 handling
let is401HandlingInProgress = false;

// Helper: Lấy domain từ VITE_API_BASE_URL
function getApiBaseDomain() {
	const apiUrl = import.meta.env.VITE_API_BASE_URL || '';
	try {
		const url = new URL(apiUrl);
		return url.hostname;
	} catch {
		return undefined;
	}
}

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

// 请求超时时间
const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 10000;

const defaultConfig: Options = {
   // The input argument cannot start with a slash / when using prefixUrl option.
   prefixUrl: import.meta.env.VITE_API_BASE_URL,
   timeout: API_TIMEOUT,
   credentials: 'include', // LUÔN gửi cookie lên backend
   retry: {
	   // 当请求失败时，最多重试次数
	   limit: 3,
   },
   hooks: {
	   beforeRequest: [
		   async (request, options) => {
			   const ignoreLoading = options.ignoreLoading;
			   if (!ignoreLoading) {
				   globalProgress.start();
			   }
				// Set language header for all requests
				request.headers.set(LANG_HEADER, usePreferencesStore.getState().language);
				const clientId = getClientId();
				if (clientId) {
					request.headers.set(CLIENT_ID_HEADER, clientId);
				}
				
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
					const refreshToken = localStorage.getItem('refreshToken');
					if (refreshToken) {
						request.headers.set('X-Refresh-Token', refreshToken);
					}
				} catch (e) {
					// ignore
				}

								// Check if this is a website request (no auth required)
								const isWebsiteRequest = request.url.includes('/wu_');
								const isWhiteRequest = requestWhiteList.some(url => request.url.endsWith(url));
								// If not a white request and not a website request, attach token header
								if (!isWhiteRequest && !isWebsiteRequest) {
									try {
										const token = useAuthStore.getState().token;
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
							request.headers.set("X-CSRF-Token", csrfToken);
						} else {
						}
					}
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
						   // Skip 401 handling if already on login page
						   const isOnLoginPage = typeof window !== "undefined" && window.location.pathname.includes("/login");
						   if (isOnLoginPage) {
							   return handleErrorResponse(response);
						   }
					   
					   // LMKT: No admin login, so no refresh token logic needed
					   // Clear cache and redirect to login on 401
					   clearAllClientState();
					   goLogin();
					   return response;
					   }
					// Nếu bị 403 do CSRF, cố gắng đọc csrfToken từ response JSON (server trả kèm) rồi retry 1 lần
					if (response.status === 403 && !(options as any)._csrfRetried) {
						try {
							const cloned = response.clone();
							const data = await cloned.json().catch(() => ({} as any));
							const tokenFromBody = (data as any)?.csrfToken || (data as any)?.result?.csrfToken;
						if (tokenFromBody) {
							// Cập nhật store để các request sau dùng token mới
							try { 
								useAuthStore.setState({ csrfToken: tokenFromBody });
								console.log("[CSRF] Token mới từ 403:", tokenFromBody);
							} catch {}
							
							// Retry với token mới - IMPORTANT: phải set header trên request mới
							const retryOptions = {
								...options,
								_csrfRetried: true,
								headers: {
									...Object.fromEntries(request.headers.entries()),
									"X-CSRF-Token": tokenFromBody,
								}
							};
							
							return ky(request.url, retryOptions);
						}
					} catch (e) {
						console.error("[CSRF] Lỗi khi retry 403:", e);
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
