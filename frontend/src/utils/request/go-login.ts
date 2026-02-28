import { forceLogoutAndReload } from "#src/utils/app-reset";
import { rememberRoute } from "#src/utils";

/**
 * 跳转到登录页面
 * Clear all cached data when session expires
 *
 * @returns 无返回值
 */
export function goLogin() {
	// Centralized hard reset and reload to login
	forceLogoutAndReload("goLogin invoked");
}
