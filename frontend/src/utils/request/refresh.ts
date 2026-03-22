// This file is intentionally left blank as cookie-based authentication is handled by the backend.
import type { KyResponse, Options } from "ky";
import { fetchRefreshToken } from "#src/api/user";

import { useAuthStore, useUserStore } from "#src/store";
import ky from "ky";
import { AUTH_HEADER } from "./constants";
import { goLogin } from "./go-login";

let isRefreshing = false;

/**
 * 刷新token并重新发起请求
 *
 * @param request 请求对象
 * @param options 请求选项
 * @param refreshToken 刷新token
 * @returns 响应对象
 * @throws 刷新 token 失败时抛出异常
 */
export async function refreshTokenAndRetry(request: Request, options: Options) {
	if (!isRefreshing) {
		isRefreshing = true;
		try {
			// Gọi fetchRefreshToken, backend sẽ lấy refreshToken từ cookie
			const freshResponse = await fetchRefreshToken();
			const nextToken = freshResponse?.result?.token;
			const nextRefreshToken = freshResponse?.result?.refreshToken;
			if (nextToken) {
				useAuthStore.setState({ token: nextToken });
				request.headers.set(AUTH_HEADER, `${nextToken}`);
				onRefreshed(nextToken);
			}
			if (nextRefreshToken) {
				useAuthStore.setState({ refreshToken: nextRefreshToken });
				try {
					localStorage.setItem("refreshToken", nextRefreshToken);
				} catch (e) {}
			}
			// Retry the original request after successful token refresh
			// Use request.url instead of request object to ensure middleware chain runs again
			return ky(request.url, {
				...options,
				method: request.method,
				headers: request.headers,
				body: request.body,
			});
		} catch (error) {
			onRefreshFailed(error);
			// Clear user data when refresh token fails
			try {
				useUserStore.getState().reset();
			} catch (e) {
				console.warn("Failed to reset user store:", e);
			}
			goLogin();
			throw error;
		} finally {
			isRefreshing = false;
		}
	} else {
		return new Promise<KyResponse>((resolve, reject) => {
			addRefreshSubscriber({
				resolve: async (newToken) => {
					request.headers.set(AUTH_HEADER, `${newToken}`);
					resolve(ky(request.url, {
						...options,
						method: request.method,
						headers: request.headers,
						body: request.body,
					}));
				},
				// 当 token 刷新失败时，拒绝当前 Promise
				reject,
			});
		});
	}
}

// 定义一个数组，用于存储所有等待 token 刷新的订阅者
// 每个订阅者对象包含 resolve 和 reject 方法，分别用于在 token 刷新成功或失败时调用
let refreshSubscribers: Array<{
	resolve: (token: string) => void // 当 token 刷新成功时调用的函数，传入新的 token
	reject: (error: any) => void // 当 token 刷新失败时调用的函数，传入错误信息
}> = [];

/**
 * 当 token 刷新成功时，通知所有等待的订阅者。
 * 遍历所有订阅者，调用其 resolve 方法，并传入新的 token。
 * 然后清空订阅者列表，准备下一次 token 刷新。
 *
 * @param token 刷新后的令牌字符串
 */
function onRefreshed(token: string) {
	refreshSubscribers.forEach(subscriber => subscriber.resolve(token));
	refreshSubscribers = []; // 清空订阅者列表
}

/**
 * 当 token 刷新失败时，通知所有等待的订阅者。
 * 遍历所有订阅者，调用其 reject 方法，并传入错误信息。
 * 然后清空订阅者列表。
 *
 * @param error 刷新失败时产生的错误信息
 */
function onRefreshFailed(error: any) {
	refreshSubscribers.forEach(subscriber => subscriber.reject(error));
	refreshSubscribers = []; // 清空订阅者列表
}

/**
 * 添加一个新的订阅者到列表中。
 * 订阅者对象应包含 resolve 和 reject 方法。
 *
 * @param subscriber 订阅者对象，包含 resolve 和 reject 方法
 */
function addRefreshSubscriber(subscriber: {
	resolve: (token: string) => void // 当 token 刷新成功时调用的函数
	reject: (error: any) => void // 当 token 刷新失败时调用的函数
}) {
	refreshSubscribers.push(subscriber); // 将新的订阅者添加到列表中
}
