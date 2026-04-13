import type { PasswordLoginFormType } from "#src/pages/login/components/password-login";
import { fetchLogin, fetchLogout } from "#src/api/user";
import { usePermissionStore, useTabsStore, useUserStore, useAppStore } from "#src/store";

import { create } from "zustand";
import { persist } from "zustand/middleware";


// No token/refreshToken needed for cookie-based auth
const initialState = {};


// token/refreshToken stored here when backend returns them
type AuthState = {
	csrfToken?: string;
	token?: string;
	refreshToken?: string;
};

interface AuthAction {
	login: (loginPayload: PasswordLoginFormType) => Promise<any>
	logout: () => Promise<void>
	reset: () => void
};

export const useAuthStore = create<AuthState & AuthAction>()(

	persist((set, get) => ({
		...initialState,

				login: async (loginPayload) => {
						const res = await fetchLogin(loginPayload);

						// SECURITY: Check if login was successful
						if (!res || !res.success) {
								const errorMessage = res?.message || "Đăng nhập thất bại";
								throw new Error(errorMessage);
						}

						// Store csrfToken and token/refreshToken if provided by backend
						const csrf = res?.result?.csrfToken;
						const token = res?.result?.token;
						const refresh = res?.result?.refreshToken;

						set({ csrfToken: csrf, token: token, refreshToken: refresh });

						return res;
				},

		logout: async () => {
			/**
			 * 1. 退出登录
			 */
			try {
				await fetchLogout();
			} catch (err: any) {
				// Nếu là 401 thì chỉ log cảnh báo, không throw
				if (err?.response?.status === 401) {
					console.warn("[Auth] Ignore 401 on logout: session/token already expired.");
				} else {
					console.error("[Auth] Logout error:", err);
				}
			}
			/**
			 * 2. 清空 token 等其他信息
			 */
			get().reset();
		},

		reset: () => {
			set({
				...initialState,
				csrfToken: undefined,
			});
			
			/**
			 * Clear admin mode flag
			 */
			window.sessionStorage.removeItem('forceAdminMode');
			localStorage.removeItem('user_dev');
			
			/**
		 * 清空权限信息 TRƯỚC (để tránh hiện menu khi đang logout)
		 * @see https://github.com/pmndrs/zustand?tab=readme-ov-file#readingwriting-state-and-reacting-to-changes-outside-of-components
		 */
		usePermissionStore.getState().reset();
		
		/**
		 * 清空 app store (reset app_id về mặc định)
		 */
		useAppStore.getState().reset();

		/**
		 * 清空用户信息 SAU CÙNG (để dev flag được clear cuối)
		 * @see {@link https://github.com/pmndrs/zustand?tab=readme-ov-file#read-from-state-in-actions | Read from state in actions}
		 */
		useUserStore.getState().reset();
		useTabsStore.getState().resetTabs();
			/**
			 * 清空 keepAlive 缓存
			 * 在 container-layout 组件中，根据 openTabs 自动刷新 keepAlive 缓存
			 */
		},

	}), { name: "access-token" }),

);
