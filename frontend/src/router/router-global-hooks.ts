import type { BlockerFunction } from "react-router";
import type { ReactRouterType, RouterSubscriber } from "./types";

import { usePermissionStore, usePreferencesStore, useUserStore } from "#src/store";
import { NProgress } from "#src/utils";

import { matchRoutes } from "react-router";

import { LOGIN, ROUTE_WHITE_LIST } from "./constants";
import { goLogin } from "#src/utils/request/go-login";
import { isDynamicRoutingEnabled } from "./routes/config";
import { replaceBaseWithRoot } from "./utils";

// 不需要登录路由的路由白名单
const baseNoLoginWhiteList = Array.from(ROUTE_WHITE_LIST).filter(item => item !== LOGIN);

// Extend window type to include SSR website routes and categories
declare global {
	interface Window {
		__SSR_WEBSITE_ROUTES__?: Record<string, any> | string[];
		__SSR_WEBSITE_CATEGORIES__?: Array<any>;
	}
}
// Website routes that should be accessible when VITE_ISRUNWEB is true
let websiteRoutes: string[] = [];
if (typeof window !== "undefined" && window.__SSR_WEBSITE_ROUTES__) {
	const ssrRoutes = window.__SSR_WEBSITE_ROUTES__;
	// Backend sends it as an object (Map), so we need to extract the keys
	if (typeof ssrRoutes === 'object' && !Array.isArray(ssrRoutes)) {
		websiteRoutes = Object.keys(ssrRoutes); // Extract keys from object: ["/du-an", "/dich-vu"]
	} else if (Array.isArray(ssrRoutes)) {
		websiteRoutes = ssrRoutes;
	}
}
// Fallback for SSR not available (optional, can be removed if always SSR)
// NOTE: All URLs are now clean URLs (no .shtml extension)
// Old .shtml URLs will be 301 redirected by nginx to these clean URLs
if (!websiteRoutes.length) {
	websiteRoutes = [
		"/",
		"/dich-vu",
		"/services/live",
		"/cong-cu",
		"/phan-mem",
		"/bat-dong-san",
		"/lam-dep-my-pham",
		"/cho-thue-xe",
		"/booking-online",
		"/tap-hoa-online",
		"/lien-he",
		"/ve-chung-toi",
		"/xem-ngay",
		"/kqxs",
	];
}

// Helper: Check if a category is a group route (is_group_slug === true)
function isGroupRoute(cat: any): boolean {
	return cat && typeof cat === 'object' && cat.is_group_slug === true;
}

// Helper: Find default service for a group route (is_group_slug_default === true)
function findDefaultServiceForGroup(groupSlug: string): any {
	const categories = (window.__SSR_WEBSITE_CATEGORIES__ as Array<any>) || [];
	// Find all services that belong to this group (have matching group_slug)
	const groupServices = categories.filter(cat => cat && cat.group_slug === groupSlug && !isGroupRoute(cat));
	// Find one with is_group_slug_default === true
	const defaultService = groupServices.find(cat => cat && cat.is_group_slug_default === true);
	
	if (defaultService) {
		console.log(`✅ Found default service for group "${groupSlug}":`, defaultService.slug);
		return defaultService;
	}
	
	// Fallback: if no explicit default found, use first non-group service
	if (groupServices.length > 0) {
		console.log(`⚠️ No explicit default for group "${groupSlug}", using first service:`, groupServices[0].slug);
		return groupServices[0];
	}
	
	console.warn(`❌ No services found for group "${groupSlug}"`);
	return null;
}

// Check if website mode is enabled
export function isWebsiteMode() {
	// Nếu có forceAdminMode flag được set, luôn tuân theo nó
	const forceAdminMode = window.sessionStorage.getItem("forceAdminMode");
	// [PROD] Removed debug log: isWebsiteMode check
	if (forceAdminMode === "true") {
		// [PROD] Removed debug log: Admin mode
		return false;  // Admin mode
	}
	if (forceAdminMode === "false") {
		// [PROD] Removed debug log: Website mode
		return true;   // Website mode
	}
	// Nếu chưa set, kiểm tra env; nếu env cũng không có, mặc định WEBSITE mode
	const isWebDefault = import.meta.env.VITE_ISRUNWEB === "true";
	// [PROD] Removed debug log: Default Website mode
	// Cho người dùng đã đăng nhập, nếu không có cài đặt, mặc định là website mode
	return isWebDefault !== false;  // Default to true (website) if not explicitly set
}

// Check if current path is a website route
function isWebsiteRoute(pathname: string) {
	// [PROD] Removed debug log: isWebsiteRoute check
	if (websiteRoutes.includes(pathname)) {
		// [PROD] Removed debug log: Found in websiteRoutes
		return true;
	}
	const categories = (window.__SSR_WEBSITE_CATEGORIES__ as Array<any>) || [];
	// Check if pathname matches any SSR category slug (clean URLs, no .shtml)
	function isSSRCategory(cat: any): cat is { slug: string } {
		return cat && typeof cat === 'object' && typeof cat.slug === 'string';
	}
	for (const cat of categories) {
		if (isSSRCategory(cat) && pathname === `/${cat.slug}`) {
			// [PROD] Removed debug log: Found in SSR categories
			return true;
		}
	}
	
	// Kiểm tra xem có phải group route không (is_group_slug === true)
	// Now using clean URLs (no .shtml)
	for (const cat of categories) {
		if (isGroupRoute(cat) && pathname === `/${cat.slug}`) {
			return true; // Allow group routes
		}
	}
	
	// Kiểm tra pattern /category/slug - CHỈ validate category, không validate slug
	// Now using clean URLs (no .shtml)
	const detailMatch = pathname.match(/^\/([^/]+)\/[^/]+$/);
	if (detailMatch) {
		const category = detailMatch[1];
		// Kiểm tra category có trong SSR categories không
		const isValidCategory = categories.some(cat => isSSRCategory(cat) && cat.slug === category);
		if (isValidCategory) {
			return true;
		}
	}
	
	// Mở rộng: các trang tiền tố wu_ thuộc website
	if (/^\/wu_/i.test(pathname)) {
		console.log("  → Matches /wu_ pattern");
		return true;
	}
	// CHỈ các slug có trong websiteRoutes hoặc SSR categories mới là route hợp lệ
	// Các .shtml khác sẽ được xử lý bởi backend (redirect về trang chủ)
	return false;
}

/**
 * 全局前置守卫，用于在路由跳转前执行一些操作
 *
 * 触发条件：使用 react-router 中的 navigate、Link 等方法跳转路由时触发
 *
 * @returns 返回 true 则取消当前导航，返回 false 则继续导航
 */
export const routerBeforeEach: (reactRouter: ReactRouterType) => BlockerFunction = reactRouter => ({ nextLocation }) => {
	const { transitionProgress } = usePreferencesStore.getState();
	/* 开启进度条动画 */
	transitionProgress && NProgress.start();

	const matches = matchRoutes(
		reactRouter.routes,
		nextLocation,
		import.meta.env.BASE_URL,
	) ?? [];
	const currentRoute = matches[matches.length - 1];

	const { pathname, search } = nextLocation;
	const pathnameWithoutBase = replaceBaseWithRoot(pathname);

	/* 是否登录 */
	const isLogin = Boolean(useUserStore.getState().userId);
	const isWebsite = isWebsiteMode();
	const isWebRoute = isWebsiteRoute(pathnameWithoutBase);

	// Tự động bật/tắt admin mode theo đường dẫn
	if (isWebRoute) {
		// Nếu đang ở admin mode mà chuyển sang website route, reset về website mode
		if (window.sessionStorage.getItem("forceAdminMode") === "true") {
			window.sessionStorage.setItem("forceAdminMode", "false");
		}
	} else if (/^(\/home|\/system\b|\/personal-center\b|\/about\b)/.test(pathnameWithoutBase)) {
		// Nếu đang ở website mode mà chuyển sang admin route, set admin mode
		if (window.sessionStorage.getItem("forceAdminMode") !== "true") {
			window.sessionStorage.setItem("forceAdminMode", "true");
		}
	}

	// Bổ sung kiểm tra chi tiết dịch vụ: /:category/:slug (clean URLs, no .shtml)
	// CHỈ validate category exists trong SSR, KHÔNG validate slug vì slug là dynamic từ database
	if (isWebsiteMode() && /^\/[^/]+\/[^/]+$/.test(pathnameWithoutBase)) {
		const match = pathnameWithoutBase.match(/^\/([^/]+)\/([^/]+)$/);
		const category = match ? match[1] : undefined;
		const ssrCategories = (window.__SSR_WEBSITE_CATEGORIES__ as Array<any>) || [];
		
		// Nếu SSR categories chưa load, cho phép navigation (component sẽ handle 404)
		if (ssrCategories.length === 0) {
			console.warn(`⚠️ SSR categories not loaded yet, allowing navigation to ${pathnameWithoutBase}`);
			return false;
		}
		
		// Kiểm tra category có tồn tại trong bất kỳ slug nào của SSR categories
		// (bao gồm cả group và child categories)
		const isValidCategory = category && ssrCategories.some(cat => cat.slug === category);
		if (!isValidCategory) {
			// Log để debug
			console.warn(`❌ Invalid category: ${category}`);
			console.warn(`Available categories:`, ssrCategories.map(cat => cat.slug));
			// Redirect về home
			reactRouter.navigate("/", { replace: true });
			return true;
		}
		// Category hợp lệ, cho phép navigation (slug sẽ được validate bởi component/API)
		return false;
	}

	// No canonicalization needed - URLs are already clean (no .shtml)
	// Navigation to group routes uses clean URLs directly

	// Handle group routes: DO NOT redirect, let WuServices component handle it
	// When accessing a group route like /du-an, the WuServices component will load data for the default service
	if (isWebsite && /^\/[^/]+$/.test(pathnameWithoutBase) && pathnameWithoutBase !== "/") {
		const groupSlug = pathnameWithoutBase.slice(1); // Remove leading /
		const categories = (window.__SSR_WEBSITE_CATEGORIES__ as Array<any>) || [];
		
		// Check if this is a group route
		const groupRoute = categories.find(cat => cat && cat.slug === groupSlug && isGroupRoute(cat));
		if (groupRoute) {
			console.log(`🔍 Detected group route: ${pathnameWithoutBase}, allowing navigation to WuServices component`);
			// Don't redirect - let WuServices component handle loading data for the group
			return false;
		}
	}

	/* debug info removed for production */

	/* 路由白名单 - 总是允许访问 */
	if (baseNoLoginWhiteList.includes(pathnameWithoutBase)) {
		return false;
	}

	// 未登录的情况
	if (!isLogin) {
		// 在网站模式下，允许访问网站路由
		if (isWebsite && isWebRoute) {
			return false;
		}
		
		// 在网站模式下，访问非网站路由时重定向到首页
		if (isWebsite && !isWebRoute && pathnameWithoutBase !== LOGIN) {
			reactRouter.navigate("/");
			return true;
		}
		
		// 非网站模式或访问登录页，按正常逻辑处理
		if (pathnameWithoutBase !== LOGIN) {
			if (pathnameWithoutBase.length > 1) {
				reactRouter.navigate(`/login?redirect=${pathnameWithoutBase}${search}`);
			}
			else {
				reactRouter.navigate("/login");
			}
			return true;
		}
		
		// 访问登录页，放行
		return false;
	}

	/* --------------- 以下为已登录的处理逻辑 ------------------ */

	/* 根路由处理 */
	if (pathname === import.meta.env.BASE_URL && pathnameWithoutBase === "/") {
		// Luôn ép về website mode khi vào root path
		if (window.sessionStorage.getItem("forceAdminMode") !== "false") {
			window.sessionStorage.setItem("forceAdminMode", "false");
		}
		console.warn("🏠 Always staying on website home at root '/', force website mode");
		return false;
	}

	/* 已登录访问登录页，跳转到首页 */
	if (pathnameWithoutBase === "/login") {
		const redirectParam = nextLocation.search.match(/[?&]redirect=([^&]*)/)?.[1];
		
		// 如果有redirect=admin参数，跳转到admin home
		if (redirectParam === "admin") {
			const adminHomePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
			reactRouter.navigate(adminHomePath, { replace: true });
		}
		else if (redirectParam && redirectParam.startsWith("/")) {
			// 如果有其他redirect参数，跳转到指定路径
			reactRouter.navigate(redirectParam, { replace: true });
		}
		else if (isWebsite) {
			// 在网站模式下且没有特殊redirect，只有当前不在首页时才跳转
			if (pathname !== "/" && pathname !== import.meta.env.BASE_URL) {
				reactRouter.navigate("/", { replace: true });
			}
		}
		else {
			// 在admin模式下，跳转到admin首页
			const adminHomePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
			reactRouter.navigate(adminHomePath, { replace: true });
		}
		return true;
	}

	/* 已登录用户访问网站路由，允许访问（不 phụ thuộc website mode flag） */
	if (isWebRoute) {
		return false;
	}


	/**
	 * 路由权限校验逻辑
	 */
	const userRoles = useUserStore.getState().roles;
	const routeRoles = currentRoute?.route?.handle?.roles;
	const ignoreAccess = currentRoute?.route?.handle?.ignoreAccess;
	const hasChildren = currentRoute?.route?.children?.filter(item => !item.index)?.length;
	
	// 忽略权限校验
	if (ignoreAccess === true) {
		console.warn("✅ Route ignores access check, allowing");
		return false;
	}
	// 如果当前路由有子路由，则跳转到 404 页面
	if (hasChildren && hasChildren > 0) {
		console.warn("❌ Route has children but accessed directly, redirecting to 404");
		reactRouter.navigate("/error/404");
		return true;
	}

	// 路由权限校验
	const hasRoutePermission = userRoles.some(role => routeRoles?.includes(role));
	// 未通过权限校验，则跳转到 403 页面，如果路由上没有设置 roles，则默认放行
	if (routeRoles && routeRoles.length && !hasRoutePermission) {
		console.warn("❌ Permission denied, redirecting to 403");
		reactRouter.navigate("/error/403");
		return true;
	}

	return false;
};

/**
 * 路由守卫，在路由跳转完成后执行
 */
export const routerAfterEach: RouterSubscriber = (routerState) => {
	const { transitionProgress } = usePreferencesStore.getState();
	if (routerState.navigation.state === "idle") {
		/* 路由变化更新文档标题的逻辑放到了路由守卫组件中（guard.tsx） */
		/* 关闭进度条动画 */
		transitionProgress && NProgress.done();
	}
};

/**
 * 路由初始化完成后执行（只会执行一次）
 *
 * 为什么需要 routerInitReady ？
 * [应用初次加载/刷新浏览器/浏览器输入地址回车]并不会触发 routerBeforeEach 钩子，所以需要 routerInitReady 模仿一次 routerBeforeEach。
 */
export async function routerInitReady(reactRouter: ReactRouterType) {
	
	// Kiểm tra hợp lệ cho route /:category/:slug khi reload hoặc nhập URL trực tiếp
	// CHỈ validate category exists trong SSR, KHÔNG validate slug vì slug là dynamic từ database
	if (isWebsiteMode() && typeof window !== 'undefined') {
		const url = window.location.pathname;
		if (/^\/[^/]+\/[^/]+$/.test(url)) {
			const match = url.match(/^\/([^/]+)\/([^/]+)$/);
			const category = match ? match[1] : undefined;
			const ssrCategories = (window.__SSR_WEBSITE_CATEGORIES__ as Array<any>) || [];
			
			// Nếu SSR categories chưa load, cho phép load page (component sẽ handle 404)
			if (ssrCategories.length === 0) {
				console.warn(`⚠️ SSR categories not loaded on init for ${url}, allowing page load`);
				// Không redirect, để component tự xử lý
			} else {
				// Kiểm tra category có tồn tại trong bất kỳ slug nào của SSR categories
				const isValidCategory = category && ssrCategories.some(cat => cat.slug === category);
				if (!isValidCategory) {
					// Log để debug
					console.warn(`❌ Invalid category on init: ${category}`);
					console.warn(`Available categories:`, ssrCategories.map(cat => cat.slug));
					// Redirect về home
					reactRouter.navigate("/", { replace: true });
					return;
				}
			}
			// Category hợp lệ hoặc chưa có SSR data, cho phép load (slug sẽ được validate bởi component/API)
		}
	}
	/* 顶部进度条 */
	const { transitionProgress } = usePreferencesStore.getState();
	// 是否开启进度条动画
	if (transitionProgress) {
		NProgress.start();
		function handleDomReady() {
			NProgress.done();
			document.removeEventListener("DOMContentLoaded", handleDomReady);
		}
		document.addEventListener("DOMContentLoaded", handleDomReady);
	}

	const currentRoute = reactRouter.state.matches[reactRouter.state.matches.length - 1];
	const { pathname, search } = reactRouter.state.location;
	const pathnameWithoutBase = replaceBaseWithRoot(pathname);

	/* 路由白名单 - 总是允许访问 */
	if (baseNoLoginWhiteList.includes(pathnameWithoutBase)) {
		return;
	}

	/* 是否登录 */
	const isLogin = Boolean(useUserStore.getState().userId);
	const isWebsite = isWebsiteMode();
	const isWebRoute = isWebsiteRoute(pathnameWithoutBase);

	// Canonicalize to .shtml in website mode on initial load as well
	// Lấy dynamic categories từ SSR (backend cung cấp từ web_services table)
	if (isWebsite) {
		const ssrCategories = (window.__SSR_WEBSITE_CATEGORIES__ as Array<any>) || [];
		// Lọc các group categories (is_group_slug === true)
		const groupCategories = ssrCategories.filter(cat => 
			cat && 
			typeof cat === 'object' && 
			cat.is_group_slug === true &&
			typeof cat.slug === 'string' &&
			cat.slug.length > 0
		);
		
		// Kiểm tra nếu pathname khớp với bất kỳ category slug nào (không có .shtml)
		for (const cat of groupCategories) {
			if (pathnameWithoutBase === `/${cat.slug}`) {
				reactRouter.navigate(`/${cat.slug}`, { replace: true });
				return;
			}
		}
	}

	// 未登录的情况
	if (!isLogin) {
		// 在网站模式下，允许访问网站路由
		if (isWebsite && isWebRoute) {
			return;
		}
		
		// 在网站模式下，访问非网站路由时重定向到首页
		if (isWebsite && !isWebRoute && pathnameWithoutBase !== LOGIN) {
			reactRouter.navigate("/");
			return;
		}
		
		// 非网站模式或访问登录页，按正常逻辑处理
		if (pathnameWithoutBase !== LOGIN) {
			if (pathnameWithoutBase.length > 1) {
				reactRouter.navigate(`/login?redirect=${pathnameWithoutBase}${search}`);
			} else {
				reactRouter.navigate("/login");
			}
			return;
		}
		
		// 访问登录页，放行
		return;
	}

	/* --------------- 以下为已登录的处理逻辑 ------------------ */

	// 已登录，获取动态路由
	const { handleAsyncRoutes } = usePermissionStore.getState();

	// 初始化一个空数组来存放 Promise 对象
	const promises = [];

	// 总是添加获取用户信息的 Promise
	promises.push(useUserStore.getState().getUserInfo());

	// 如果启用了动态路由，则添加处理动态路由的 Promise
	if (isDynamicRoutingEnabled) {
		promises.push(handleAsyncRoutes());
	}

	/**
	 * 用户信息包含了用户角色，需要在获取菜单权限前面获取，用于权限校验
	 */
	const results = await Promise.allSettled(promises);
	const hasError = results.some(result => result.status === "rejected");

	// 网络请求失败，跳转到 500 页面
	if (hasError) {
		const unAuthorized = results.some((result: any) => result?.reason?.response?.status === 401);
		if (unAuthorized) {
			// Token expired or unauthorized: clear caches and redirect to login
			goLogin();
		} else {
			reactRouter.navigate("/error/500");
		}
		return;
	}

	/* --------------- Start ------------------ */
	// 判断路由跳转逻辑，需要在获取动态路由之后，防止路由跳转直接进入 getBlocker 中然后发送请求，但是 getBlocker 不支持异步
	/* Nếu là root path thì luôn ép về website mode */
	if (pathname === import.meta.env.BASE_URL) {
		if (window.sessionStorage.getItem("forceAdminMode") !== "false") {
			window.sessionStorage.setItem("forceAdminMode", "false");
		}
		// Nếu đã ở / thì không cần chuyển hướng nữa
		if (pathnameWithoutBase === "/") {
			return;
		}
		reactRouter.navigate("/", { replace: true });
		return;
	}

	/* 已登录时匹配 login 路由，跳转到首页 */
	if (pathnameWithoutBase === "/login") {
		// Kiểm tra redirect parameter
		const redirectParam = new URLSearchParams(search).get("redirect");
		
		if (redirectParam === "admin") {
			// Redirect đến admin home
			const adminHomePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
			reactRouter.navigate(adminHomePath, { replace: true });
		}
		else if (isWebsiteMode()) {
			// 在网站模式下，跳转到网站首页
			reactRouter.navigate("/", { replace: true });
		}
		else {
			// Admin mode, redirect to admin home
			const adminHomePath = import.meta.env.VITE_BASE_HOME_PATH || "/home";
			reactRouter.navigate(adminHomePath, { replace: true });
		}
		return;
	}

	/* 已登录用户在website模式下访问website路由，允许访问 */
	if (isWebsiteMode() && isWebsiteRoute(pathnameWithoutBase)) {
		return;
	}

	/**
	 * 需要替换当前路由
	 * https://router.vuejs.org/guide/advanced/dynamic-routing#Adding-routes
	 *
	 * 为什么需要替换当前路由？
	 * 1. 初始化路由
	 * 2. 导航进入动态路由地址，例如 /system/user
	 * 3. 动态路由未添加到路由，所以地址栏中依然是 /system/user 但匹配到的路由是 error/404 路由
	 * 4. 添加完动态路由后，使用 replace 触发地址栏的路径匹配对应的路由
	 *
	 * 注意：navigate 方法调用之后会触发 routerBeforeEach 钩子
	 */

	if (
		isDynamicRoutingEnabled
		/**
		 * 初次导航到动态路由，页面会匹配 404 路由
		 * 表现为：页面路径 currentRoute.pathname 和匹配的路由（currentRoute.route.id）不同，则替换当前路由
		 * 如果是初次导航到静态路由，则不需要触发替换
		 */
		&& currentRoute.pathname !== currentRoute.route.id) {
		/**
		 * 替换当前路由后，会触发 routerBeforeEach 钩子
		 */
		return reactRouter.navigate(`${pathnameWithoutBase}${search}`, { replace: true });
	}

	/**
	 * 纯静态路由，则会支持下面的代码
	 * 路由权限校验逻辑
	 */
	const userRoles = useUserStore.getState().roles;
	const routeRoles = currentRoute?.route?.handle?.roles;
	const ignoreAccess = currentRoute?.route?.handle?.ignoreAccess;
	const hasChildren = currentRoute?.route?.children?.filter(item => !item.index)?.length;
	// 忽略权限校验
	if (ignoreAccess === true) {
		return;
	}
	// 如果当前路由有子路由，则跳转到 404 页面
	if (hasChildren && hasChildren > 0) {
		return reactRouter.navigate("/error/404");
	}

	// 路由权限校验
	const hasRoutePermission = userRoles.some(role => routeRoles?.includes(role));
	// 未通过权限校验，则跳转到 403 页面，如果路由上没有设置 roles，则默认放行
	if (routeRoles && routeRoles.length && !hasRoutePermission) {
		return reactRouter.navigate("/error/403");
	}
}
