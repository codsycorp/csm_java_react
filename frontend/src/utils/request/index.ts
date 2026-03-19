// External libraries

import type { Options } from "ky";
import ky from "ky";

// API & Store
import { refreshTokenPath } from "#src/api/user";
import { LOGIN } from "#src/router/constants";
import { usePreferencesStore, useUserStore } from "#src/store";
import { clearAllClientState } from "#src/utils/app-reset";

// Local utilities
import { AUTH_HEADER, LANG_HEADER } from "./constants";
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
	return null;
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
					const refreshToken = useAuthStore.getState().refreshToken;
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
							// Luôn ghi đè header, không merge để tránh lặp giá trị
							request.headers.delete("X-CSRF-Token");
							request.headers.set("X-CSRF-Token", csrfToken);
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
							   try {
								   clearAllClientState();
							   } catch (error) {
								   console.warn("[Auth] Failed to clear stale client state on login page:", error);
							   }
							   console.warn("[Auth] Ignoring stale 401 on login page:", request.url);
							   return response;
						   }
						   
						   if ([`/${refreshTokenPath}`].some(url => request.url.endsWith(url))) {
						   // Clear cache when refresh token endpoint fails
						   clearAllClientState();
						   goLogin();
						   return response;
					   }
					   
					   // Prevent multiple simultaneous 401 handling
					   if (is401HandlingInProgress) {
						   return response;
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
							const data = await cloned.json().catch(() => ({} as any));
							const tokenFromBody = (data as any)?.csrfToken || (data as any)?.result?.csrfToken;
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
