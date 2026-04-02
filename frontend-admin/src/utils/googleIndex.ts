/**
 * Google Index API Helper
 * 
 * Sử dụng hàm googleIndexUrl từ CsmApi để index hoặc remove URLs từ Google
 * Hàm này tự động thêm token authentication khi đã đăng nhập
 */

import { googleIndexUrl, type GoogleIndexResponse } from "#src/components/csm-grid/CsmApi";

/**
 * Index một hoặc nhiều URLs lên Google
 * 
 * @example
 * ```typescript
 * // Index một URL
 * const result = await indexUrls("https://example.com/page1");
 * 
 * // Index nhiều URLs
 * const result = await indexUrls([
 *   "https://example.com/page1",
 *   "https://example.com/page2",
 *   "https://example.com/page3"
 * ]);
 * 
 * // Kiểm tra kết quả
 * if (result.success) {
 *   console.log(`Đã index ${result.data.success_count}/${result.data.total_requested} URLs`);
 *   console.log(`Quota còn lại: ${result.data.daily_quota.remaining}`);
 * }
 * ```
 */
export async function indexUrls(urls: string | string[]): Promise<GoogleIndexResponse> {
	return googleIndexUrl(urls, "publish");
}

/**
 * Remove một hoặc nhiều URLs khỏi Google Index
 * 
 * @example
 * ```typescript
 * // Remove một URL
 * const result = await removeUrls("https://example.com/page1");
 * 
 * // Remove nhiều URLs
 * const result = await removeUrls([
 *   "https://example.com/page1",
 *   "https://example.com/page2"
 * ]);
 * ```
 */
export async function removeUrls(urls: string | string[]): Promise<GoogleIndexResponse> {
	return googleIndexUrl(urls, "remove");
}

/**
 * Helper: Index URLs từ array objects (lấy URL từ property cụ thể)
 * 
 * @example
 * ```typescript
 * const posts = [
 *   { slug: "post-1", url: "https://example.com/post-1" },
 *   { slug: "post-2", url: "https://example.com/post-2" }
 * ];
 * 
 * // Index tất cả URLs từ property 'url'
 * const result = await indexUrlsFromObjects(posts, "url");
 * ```
 */
export async function indexUrlsFromObjects<T extends Record<string, any>>(
	objects: T[],
	urlProperty: keyof T
): Promise<GoogleIndexResponse> {
	const urls = objects
		.map(obj => obj[urlProperty])
		.filter((url) => typeof url === "string" && url.length > 0) as string[];
	
	if (urls.length === 0) {
		throw new Error("No valid URLs found in objects");
	}
	
	return indexUrls(urls);
}

/**
 * Helper: Tạo full URL từ slug và domain
 * 
 * @example
 * ```typescript
 * const posts = [
 *   { slug: "bai-viet-1" },
 *   { slug: "bai-viet-2" }
 * ];
 * 
 * // Index với domain hiện tại
 * const result = await indexSlugs(posts.map(p => p.slug));
 * 
 * // Index với domain cụ thể
 * const result = await indexSlugs(
 *   posts.map(p => p.slug),
 *   "https://example.com",
 *   "/blog"
 * );
 * ```
 */
export async function indexSlugs(
	slugs: string[],
	baseUrl?: string,
	pathPrefix: string = ""
): Promise<GoogleIndexResponse> {
	const base = baseUrl || `${window.location.protocol}//${window.location.hostname}`;
	const prefix = pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`;
	
	const urls = slugs.map(slug => {
		const cleanSlug = slug.startsWith("/") ? slug.substring(1) : slug;
		return `${base}${prefix}/${cleanSlug}`;
	});
	
	return indexUrls(urls);
}

/**
 * Helper: Kiểm tra quota hiện tại
 * 
 * @example
 * ```typescript
 * const quota = await checkQuota();
 * console.log(`Đã dùng: ${quota.used_today}/${quota.daily_limit}`);
 * console.log(`Còn lại: ${quota.remaining}`);
 * ```
 */
export async function checkQuota() {
	// Gửi một request dummy để lấy quota info
	const result = await googleIndexUrl("https://example.com/quota-check", "publish");
	return result.data?.daily_quota;
}
