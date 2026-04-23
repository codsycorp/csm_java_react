import { isString } from "#src/utils";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { toPermissionBigInt, isSuperPermissionProfile } from "#src/utils/permission-bitfield";
import { useUserStore } from "#src/store";

import { useMatches } from "react-router";

/**
 * 用于权限认证的自定义 Hook。
 *
 * @returns 返回一个函数，该函数用于检查用户是否具有指定权限。
 * 如果用户具有指定权限，则返回 true；否则返回 false。
 */
export function useAuth() {
	const matches = useMatches();
	const currentRoute = matches[matches.length - 1];
	const userRoles = useUserStore(state => state.roles || []);
	const userDev = useUserStore(state => state.dev);
	const permissionBitfield = useUserStore(state => (state as any).permissionBitfield);

	const isDevUser = resolveDevFlag(userDev, userRoles);
	const isTokenAdmin = isSuperPermissionProfile(toPermissionBigInt(permissionBitfield));

	const toTokenSet = (rawPermissions: unknown): Set<string> => {
		if (!Array.isArray(rawPermissions)) return new Set();
		const tokens = rawPermissions
			.map((item: any) => {
				if (typeof item === "string") return item.trim().toLowerCase();
				if (item && typeof item === "object") {
					const code = item.code ?? item.permission ?? item.value;
					return typeof code === "string" ? code.trim().toLowerCase() : "";
				}
				return "";
			})
			.filter(Boolean);
		return new Set(tokens);
	};

	/**
	 *
	 * @param permission 全部小写的权限名称或权限名称数组，比如 `["add", "delete"]`。
	 * @returns boolean 是否具有指定权限
	 */
	const hasAuth = (permission?: string | Array<string>) => {
		if (!permission)
			return false;
		/** 从当前路由的 `handle` 字段里获取按钮级别的所有自定义 `code` 值 */
		const routeRoles = Array.isArray(currentRoute?.handle?.roles)
			? (currentRoute?.handle?.roles as string[]).map(item => String(item || "").trim().toLowerCase())
			: [];
		const metaAuth = toTokenSet(currentRoute?.handle?.permissions);

		const requested = isString(permission) ? [permission] : permission;
		const normalizedRequested = requested
			.map(item => String(item || "").trim().toLowerCase())
			.filter(Boolean);
		const requestedTokens = new Set<string>();
		normalizedRequested.forEach((item) => {
			requestedTokens.add(item);
			requestedTokens.add(`permission:button:${item}`);
		});

		// Dev users should never be blocked by missing button tokens on dynamic routes.
		if (isDevUser) {
			if (routeRoles.length === 0 || routeRoles.includes("dev")) {
				return true;
			}
		}

		// Super-admin profile can operate on admin routes even if route tokens are incomplete.
		if (isTokenAdmin) {
			if (routeRoles.length === 0 || routeRoles.includes("admin")) {
				return true;
			}
		}

		if (metaAuth.size === 0) {
			return false;
		}

		for (const token of requestedTokens) {
			if (metaAuth.has(token)) {
				return true;
			}
		}
		return false;
	};
	return hasAuth;
}
