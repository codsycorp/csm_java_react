import { usePreferences } from "#src/hooks";
import PageError from "#src/pages/error/page-error";
import { isString, toggleHtmlClass } from "#src/utils";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { toPermissionBigInt, isSuperPermissionProfile } from "#src/utils/permission-bitfield";
import { useAuthStore, useUserStore } from "#src/store";

import { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useMatches, Navigate } from "react-router";

/**
 * RouterGuards 组件用于路由守卫，主要处理路由守卫相关的逻辑。
 *
 * @returns 返回 JSX.Element，用于渲染 Outlet 组件。
 */
export function RouterGuards() {
	const matches = useMatches();
	const { t } = useTranslation();
	const location = useLocation();
	const { language, isDark } = usePreferences();
	// Đăng nhập dựa vào userId từ useUserStore
	const userId = useUserStore(state => state.userId);
	const userRoles = useUserStore(state => state.roles);
	const devFlag = useUserStore(state => state.dev);
	const permissionBitfield = useUserStore(state => (state as any).permissionBitfield);
	const isDev = resolveDevFlag(devFlag, userRoles);
	const isTokenAdmin = isSuperPermissionProfile(toPermissionBigInt(permissionBitfield));

	/* tailwind theme */
	useEffect(() => {
		if (isDark) {
			toggleHtmlClass("dark").add();
		}
		else {
			toggleHtmlClass("dark").remove();
		}
	}, [isDark]);

	/* Check authentication and roles - MUST be after all hooks */
	const currentRoute = matches[matches.length - 1];
	const routeHandle = currentRoute?.handle as any;
	
	// Check if route requires authentication (has roles requirement)
	if (routeHandle?.roles && Array.isArray(routeHandle.roles)) {
		// Check if user is logged in (has userId)
		   if (!userId) {
			   console.warn("🔒 Access denied: User not logged in, redirecting to /login?redirect=admin");
			   return <Navigate to="/login?redirect=admin" replace />;
		   }
		
		// Dev role has absolute access to ALL routes (highest privilege)
		const isDevUser = isDev || userRoles.includes("dev");
		if (isDevUser) {
			// console.log("✅ Dev user with absolute access, isDev:", isDev, "roles:", userRoles, "path:", location.pathname);
			return (
				<ErrorBoundary FallbackComponent={PageError}>
					<Outlet />
				</ErrorBoundary>
			);
		}
		
		const currentPath = location.pathname;
		const isDynamicSystemGridRoute = currentPath.startsWith("/system/grid");
		
		// Dynamic /system/grid routes are runtime menus and should inherit backend menu permissions.
		// Keep them accessible for authenticated users.
		if (isDynamicSystemGridRoute) {
			return (
				<ErrorBoundary FallbackComponent={PageError}>
					<Outlet />
				</ErrorBoundary>
			);
		}
		
		const hasRequiredRole = routeHandle.roles.some((requiredRole: string) => {
			const normalized = String(requiredRole || "").trim().toLowerCase();
			if (normalized === "admin") {
				return isTokenAdmin;
			}
			return userRoles.includes(requiredRole);
		});
		
		if (!hasRequiredRole) {
			console.warn("🔒 Access denied: User roles", userRoles, "don't match required roles", routeHandle.roles);
			return <Navigate to="/error/403" replace />;
		}
	}

	/* document title */
	/* ❌ DISABLED - Keep server-side rendered title for SEO (no duplicate title tags) */
	// useEffect(() => {
	// 	const currentRoute = matches[matches.length - 1];
	// 	const documentTitle = currentRoute.handle?.title as React.ReactElement | string;
	// 	const newTitle = isString(documentTitle) ? documentTitle : documentTitle?.props?.children;
	// 	document.title = t(newTitle) || document.title;
	// }, [language, location]);

	return (
		<ErrorBoundary FallbackComponent={PageError}>
			<Outlet />
		</ErrorBoundary>
	);
}
