import { request } from "#src/utils";
import { AI_TIMEOUT_MS } from "#src/api/ai/index";

// Định nghĩa kiểu GoogleIndexResponse cho các API Google Index
export type GoogleIndexResponse = {
	success: boolean;
	message?: string;
	data?: any;
	[key: string]: any;
};

/**
 * Gửi 1 hoặc nhiều URLs lên Google Indexing API (publish/remove)
 * Có thể truyền timeout (ms), mặc định dùng AI_TIMEOUT_MS
 * @param urls URL hoặc mảng URLs
 * @param action "publish" (mặc định) hoặc "remove"
 * @param timeoutMs Thời gian timeout (ms), mặc định AI_TIMEOUT_MS
 * @returns Promise<GoogleIndexResponse>
 */
export async function googleIndexUrl(
	urls: string | string[],
	action: "publish" | "remove" = "publish",
	timeoutMs?: number
): Promise<any> {
	const payload: any = Array.isArray(urls)
		? { urls, action }
		: { url: urls, action };
	let response;
	try {
		response = await request
			.post("indexgoogle", {
				json: payload,
				ignoreLoading: false,
				timeout: timeoutMs ?? AI_TIMEOUT_MS,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Google Index API error",
			error,
		};
	}
	return response;
}

/**
 * Kiểm tra quota Google Index API
 * @returns Promise<GoogleIndexResponse>
 */
export async function checkGoogleIndexQuota(): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "quota" },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Quota check error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Kiểm tra indexing status của URL
 * @param url URL cần kiểm tra
 * @returns Promise<GoogleIndexResponse>
 */
export async function checkGoogleIndexStatus(url: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "check", url },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Status check error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy danh sách verified sites từ Google Search Console
 * @returns Promise<GoogleIndexResponse>
 */
export async function getGoogleSearchConsoleSites(): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "sites" },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Sites list error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Kiểm tra indexing status và tự động publish nếu NEUTRAL
 * @param url URL cần kiểm tra và auto-publish
 * @returns Promise<GoogleIndexResponse>
 */
export async function checkAndAutoPublish(url: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "check-auto", url },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Auto-publish error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

// ========== QUEUE MANAGEMENT APIs ==========

/**
 * Thêm URL vào queue để gửi sau
 * @param url URL cần gửi
 * @param action "publish" hoặc "remove"
 * @param priority 1 (cao nhất) - 10 (thấp nhất), mặc định 5
 * @returns Promise<GoogleIndexResponse>
 */
export async function addToQueue(
	url: string,
	action: "publish" | "remove" = "publish",
	priority: number = 5
): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "add-to-queue", url, action, priority },
				ignoreLoading: false,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Add to queue error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Thêm nhiều URLs vào queue cùng lúc (RECOMMENDED cho bulk URLs)
 * @param urls Mảng URLs cần gửi
 * @param action "publish" hoặc "remove"
 * @param priority 1 (cao nhất) - 10 (thấp nhất), mặc định 5
 * @returns Promise<GoogleIndexResponse>
 */
export async function addBatchToQueue(
	urls: string[],
	action: "publish" | "remove" = "publish",
	priority: number = 5
): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "add-batch-to-queue", urls, action, priority },
				ignoreLoading: false,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Add batch to queue error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy thông tin queue và quota
 * @returns Promise<GoogleIndexResponse>
 */
export async function getQueueInfo(): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "queue-info" },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Queue info error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy danh sách URLs trong queue
 * @param page Trang (0-based)
 * @param pageSize Số items mỗi trang
 * @returns Promise<GoogleIndexResponse>
 */
export async function getQueueItems(
	page: number = 0,
	pageSize: number = 20
): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "queue-items", page, pageSize },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Queue items error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Trigger xử lý queue thủ công
 * @param batchSize Số URLs tối đa để xử lý (mặc định 10)
 * @returns Promise<GoogleIndexResponse>
 */
export async function processQueue(batchSize: number = 10): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "process-queue", batchSize },
				ignoreLoading: false,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Process queue error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Xóa URL khỏi queue
 * @param url URL cần xóa
 * @returns Promise<GoogleIndexResponse>
 */
export async function removeFromQueue(url: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "remove-from-queue", url },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Remove from queue error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy lịch sử submission của 1 URL
 * @param url URL cần kiểm tra lịch sử
 * @returns Promise<GoogleIndexResponse>
 */
export async function getUrlHistory(url: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "history", url },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "History error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy lịch sử submission gần đây (tất cả URLs)
 * @param limit Số lượng entries tối đa (mặc định 50)
 * @returns Promise<GoogleIndexResponse>
 */
export async function getRecentHistory(limit: number = 50): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("indexgoogle", {
				json: { operation: "recent-history", limit },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Recent history error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

// ==================== CHAT API ====================

/**
 * Lấy lịch sử chat theo room
 * @param room Room name
 * @param limit Số lượng messages tối đa (mặc định 50)
 * @returns Promise<GoogleIndexResponse>
 */
export async function getChatHistory(room: string, limit: number = 50): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("chat-history", {
				json: { room, limit },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Chat history error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

export async function getChatHistoryWithAppId(
	room: string,
	appId: string,
	limit: number = 50
): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("chat-history", {
				json: { room, appId, app_id: appId, limit },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Chat history error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy lịch sử chat của guest user (không cần authentication)
 * @param appId Application ID
 * @param guestPhone Guest phone number
 * @param limit Số lượng messages tối đa (mặc định 50)
 * @returns Promise<GoogleIndexResponse>
 */
export async function getChatHistoryGuest(
	appId: string,
	guestIdentity: string,
	limit: number = 50,
	guestPhone?: string
): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		const trimmedIdentity = guestIdentity?.trim() || "";
		const trimmedPhone = guestPhone?.trim() || "";
		const looksLikePhone = /^\+?\d[\d\s-]{7,}$/.test(trimmedIdentity);
		response = await request
			.post("chat-history-guest", {
				json: {
					appId,
					guestSessionId: looksLikePhone ? undefined : trimmedIdentity,
					guestPhone: looksLikePhone ? trimmedIdentity : trimmedPhone,
					limit,
				},
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Guest chat history error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy lịch sử chat của app (cho admin)
 * @param appId Application ID
 * @param limit Số lượng messages tối đa (mặc định 200)
 * @returns Promise<GoogleIndexResponse>
 */
export async function getChatHistoryApp(appId: string, limit: number = 200): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("chat-history-app", {
				json: { appId, limit },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "App chat history error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy danh sách guest phones đã chat trong app
 * @param appId Application ID
 * @returns Promise<GoogleIndexResponse>
 */
export async function getChatGuestsList(appId: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("chat-guests-list", {
				json: { appId },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Guests list error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Đánh dấu messages của guest là đã đọc (không cần authentication)
 * @param appId Application ID
 * @param guestPhone Guest phone number
 * @returns Promise<GoogleIndexResponse>
 */
export async function markChatAsReadGuest(appId: string, guestPhone: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		const trimmedIdentity = guestPhone?.trim() || "";
		const looksLikePhone = /^\+?\d[\d\s-]{7,}$/.test(trimmedIdentity);
		response = await request
			.post("chat-mark-read", {
				json: {
					appId,
					guestSessionId: looksLikePhone ? undefined : trimmedIdentity,
					guestPhone: looksLikePhone ? trimmedIdentity : undefined,
				},
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Mark as read error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Đánh dấu tất cả messages trong room là đã đọc
 * @param room Room name
 * @param userId User ID
 * @returns Promise<GoogleIndexResponse>
 */
export async function markChatAsReadAll(room: string, userId: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("chat-mark-all-read", {
				json: { room, userId },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Mark all as read error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Xóa một message theo timestamp
 * @param timestamp Message timestamp
 * @param appId Application ID (default csm)
 * @returns Promise<GoogleIndexResponse>
 */
export async function deleteChatMessage(timestamp: number, appId: string = "csm"): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("chat-delete-message", {
				json: { timestamp, appId },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Delete message error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

export interface ApiListResponse<T> {
	data: T[]
	total?: number
	[key: string]: any
}

export interface ApiResponse<T> {
	data: T
	[key: string]: any
}

export interface Condition {
	field: string
	type: string
	value: any
}

export type Where = Condition | { operator: "AND" | "OR"; conditions: Condition[] };

export interface CreateTableStruct {
	defaultValue: Record<string, any>
	fieldsPK: string[]
	fieldsSearch?: string[]
	fields: string[]
	[key: string]: any
}

function clearGetTableDataCache() {
	const globalAny = globalThis as any;
	const cache: Map<string, Promise<any>> | undefined = globalAny.__csm_getTableDataCache;
	if (cache) {
		cache.clear();
	}
}

export async function createTableStruct(params: {
	app_id: string
	obj_table: {
		id: string
		struct: CreateTableStruct
	}
}) {
	const res = await request
		.post("create-table", {
			json: params,
			ignoreLoading: true,
			timeout: 60000,
		})
		.json<any>();
	clearGetTableDataCache();
	return res;
}

export function buildDomainCondition() {
	try {
		const host = window?.location?.hostname;
		// Localhost: không lọc domain, lấy hết tất cả dữ liệu
		if (!host || host === "localhost" || host === "127.0.0.1") {
			return undefined;
		}
		// Production: chuẩn hóa domain và lọc theo domain
		// Loại bỏ www. và lấy apex domain (2 phần cuối)
		// VD: www.phanmemmottrieu.net hoặc dev.phanmemmottrieu.net -> phanmemmottrieu.net
		const noWww = host.replace(/^www\./i, "");
		const parts = noWww.split(".");
		const apex = parts.length >= 3 ? parts.slice(-2).join(".") : noWww;
		return { field: "domain", type: "eq", value: apex } as Condition;
	}
	catch {}
	return undefined;
}

export function andWhere(conditions: Array<Condition | undefined>): Where | undefined {
	const conds = conditions.filter(Boolean) as Condition[];
	if (conds.length === 0)
		return undefined;
	if (conds.length === 1)
		return conds[0];
	return { operator: "AND", conditions: conds };
}

export async function getTableData<T>(params: {
	app_id: string
	obj_name: string
	where?: Where
	take?: number
	lastkey?: any
	offset?: number
	limit?: number
}) {
	const TABLE_DATA_TIMEOUT_MS = 120000;
	// In-memory cache to avoid repeated identical requests
	const cacheKey = (() => {
		let whereKey = "";
		try { whereKey = params.where ? JSON.stringify(params.where) : ""; } catch { whereKey = String(params.where); }
		return `${params.app_id}::${params.obj_name}::${whereKey}::${params.take ?? ''}::${params.lastkey ?? ''}::${params.offset ?? ''}::${params.limit ?? ''}`;
	})();
	const globalAny = window as any;
	if (!globalAny.__csm_getTableDataCache) {
		globalAny.__csm_getTableDataCache = new Map<string, Promise<ApiListResponse<T>>>();
	}
	const cache: Map<string, Promise<ApiListResponse<T>>> = globalAny.__csm_getTableDataCache;

	if (cache.has(cacheKey)) {
		return cache.get(cacheKey) as Promise<ApiListResponse<T>>;
	}

	const payload: any = {
		app_id: params.app_id,
		obj_name: params.obj_name,
		...(params.where ? { e_where: params.where } : {}),
		...(params.take ? { take: params.take } : {}),
		...(params.lastkey ? { lastkey: params.lastkey } : {}),
		...(Number.isInteger(params.offset) ? { offset: params.offset } : {}),
		...(Number.isInteger(params.limit) ? { limit: params.limit } : {}),
	};
	const promise = request
		.post<ApiListResponse<T>>("get-table-data", {
			json: payload,
			ignoreLoading: true,
			timeout: TABLE_DATA_TIMEOUT_MS,
		})
		.json<ApiListResponse<T>>()
		.catch((err) => {
			// On error, ensure we don't keep a failed promise in cache
			try { cache.delete(cacheKey); } catch {}
			throw err;
		})
		.finally(() => {
			// Keep cache for in-flight dedupe only; avoid stale data after mutations.
			try { cache.delete(cacheKey); } catch {}
		});
	cache.set(cacheKey, promise);
	return promise;
}

export async function updateTableData<T extends Record<string, any>>(params: {
	app_id: string
	obj_name: string
	command: "create" | "update" | "delete"
	obj_update: T
	pk_fields?: string[] // Primary key field names
	where?: Record<string, any> // Giá trị PK cũ (nếu cần)
}) {
	const payload: any = {
		app_id: params.app_id,
		obj_name: params.obj_name,
		command: params.command,
		obj_update: params.obj_update,
	};

	// Only create command gets mandatory id assignment.
	if (params.command === "create") {
		const idVal = payload.obj_update?.id;
		if (idVal == null || String(idVal).trim() === "") {
			const generatedId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
				? crypto.randomUUID()
				: `_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
			payload.obj_update = { ...payload.obj_update, id: generatedId };
			// Keep caller object in sync so local grid can render the new row immediately.
			try {
				(params.obj_update as any).id = generatedId;
			} catch {
				// ignore if caller object is immutable
			}
		}
	}
	
	// Always add e_where with primary key conditions for all commands
	// Backend uses e_where to check existing records and determine action
	const whereSource: Record<string, any> = params.where ? params.where : {};
	const updateSource: Record<string, any> = params.obj_update ? params.obj_update : {};
	// Keep old-PK values from where, but still allow fallback to obj_update.id.
	const pkSource: Record<string, any> = params.where
		? { ...updateSource, ...whereSource }
		: updateSource;
	const stableId = params.command === "create"
		? payload.obj_update?.id
		: (whereSource.id !== undefined ? whereSource.id : updateSource.id);
	if (params.pk_fields && params.pk_fields.length > 0) {
		const conditions: any[] = [];
		for (const pkField of params.pk_fields) {
			if (pkSource[pkField] !== undefined) {
				conditions.push({
					field: pkField,
					type: "eq",
					value: pkSource[pkField]
				});
			}
		}
		// Include id when provided; create always has id after normalization above.
		if (stableId !== undefined && !conditions.some(c => c.field === "id")) {
			conditions.push({
				field: "id",
				type: "eq",
				value: stableId
			});
		}
		// Build e_where with correct format: operator (uppercase) + conditions
		if (conditions.length > 0) {
			payload.e_where = conditions.length === 1 
				? conditions[0]
				: { operator: "AND", conditions };
		}
	}
	
	console.log("📤 updateTableData request:", {
		command: params.command,
		pk_fields: params.pk_fields,
		e_where: payload.e_where,
		obj_update: params.obj_update,
		full_payload: payload
	});
	
	const res = await request
		.post<ApiResponse<string>>("update-table-data", { json: payload, ignoreLoading: true })
		.json<ApiResponse<string>>();
	clearGetTableDataCache();
	if (res && (res as any).success === false) {
		throw new Error(String((res as any).message || "Lưu dữ liệu thất bại"));
	}
	return res;
}

// ========================================
// CRM APIs - Customer Relationship Management
// ========================================

export interface CRMCustomer {
	phone: string;
	app_id: string;
	appId?: string;
	name?: string;
	email?: string;
	birthday?: string; // YYYY-MM-DD
	nick_zalo?: string;
	nick_facebook?: string;
	status?: string; // new, contacted, interested, purchased, cancelled
	source?: string; // chat, website, facebook, google
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	referrer?: string;
	landing_page?: string;
	assigned_to?: string; // userId
	notes?: string;
	created_at?: number;
	updated_at?: number;
	last_contact_at?: number;
	contacted_by_count?: number;
	contacted_by_list?: string; // JSON array
}

export interface CRMPurchase {
	id?: string;
	phone: string;
	app_id: string;
	product_id?: string;
	product_name?: string;
	price?: number;
	advisor_id?: string; // nhân viên tư vấn
	purchased_at?: number;
}

export interface CRMAd {
	id?: string;
	app_id: string;
	platform: string; // facebook, google
	ad_id?: string; // ID từ platform
	name?: string;
	status?: string; // active, paused, completed, cancelled
	budget?: number;
	spent?: number;
	impressions?: number;
	clicks?: number;
	conversions?: number;
	target_url?: string;
	created_at?: number;
	updated_at?: number;
	metadata?: string; // JSON
}

/**
 * Tạo hoặc cập nhật customer
 */
export async function createOrUpdateCustomer(customer: Partial<CRMCustomer>): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/customer", {
				json: customer,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "CRM customer error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy danh sách customers
 */
export async function getCustomers(params: {
	appId: string;
	status?: string;
	assignedTo?: string;
	search?: string;
	limit?: number;
	offset?: number;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/customers", {
				json: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get customers error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy chi tiết customer theo phone
 */
export async function getCustomerDetail(phone: string, appId: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.get(`crm/customer?phone=${encodeURIComponent(phone)}&appId=${encodeURIComponent(appId)}`, {
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get customer detail error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Phân bổ customer cho nhân viên
 */
export async function assignCustomer(phone: string, appId: string, assignedTo: string): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/customer/assign", {
				json: { phone, appId, assignedTo },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Assign customer error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Cập nhật trạng thái customer
 */
export async function updateCustomerStatus(
	phone: string,
	appId: string,
	status: string,
	notes?: string
): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/customer/status", {
				json: { phone, appId, status, notes },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Update status error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Thêm purchase cho customer
 */
export async function addCustomerPurchase(purchase: CRMPurchase): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/customer/purchase", {
				json: purchase,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Add purchase error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Thêm contact history
 */
export async function addContactHistory(params: {
	phone: string;
	appId: string;
	staffId: string;
	contactType?: string; // call, message, meeting, email
	notes?: string;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/customer/contact", {
				json: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Add contact error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy khách hàng có sinh nhật sắp tới
 */
export async function getUpcomingBirthdays(appId: string, days: number = 7): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/birthdays", {
				json: { appId, days },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get birthdays error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy thống kê CRM
 */
export async function getCRMStats(params: {
	appId: string;
	fromDate?: string;
	toDate?: string;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/stats", {
				json: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get CRM stats error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy thống kê website (posts, views, Google bot visits)
 */
export async function getWebsiteStats(params: {
	appId: string;
	fromDate?: string;
	toDate?: string;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/website-stats", {
				json: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get website stats error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy thống kê quảng cáo Facebook/Google
 */
export async function getAdsStats(params: {
	appId: string;
	platform?: string; // facebook, google, all
	fromDate?: string;
	toDate?: string;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/ads-stats", {
				json: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get ads stats error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Tạo quảng cáo Facebook/Google
 */
export async function createAd(ad: Partial<CRMAd>): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/ads", {
				json: { appId: ad.app_id, platform: ad.platform, adData: ad },
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Create ad error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy danh sách quảng cáo
 */
export async function getAds(params: {
	appId: string;
	platform?: string;
	status?: string;
	limit?: number;
	offset?: number;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("crm/ads", {
				json: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get ads error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Lấy thống kê Googlebot visits cho Home/Broadcast dashboards
 */
export async function getGooglebotStats(params?: {
	limit?: number;
	offset?: number;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.get("home/googlebot", {
				searchParams: params,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Get Googlebot stats error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}

/**
 * Xóa Googlebot visits (theo ids hoặc xóa toàn bộ)
 */
export async function deleteGooglebotStats(data: {
	ids?: string[];
	deleteAll?: boolean;
}): Promise<GoogleIndexResponse> {
	let response: any;
	try {
		response = await request
			.post("home/googlebot/delete", {
				json: data,
				ignoreLoading: true,
			})
			.json();
	} catch (error: any) {
		response = {
			success: false,
			message: error?.message || "Delete Googlebot stats error",
			error,
		};
	}
	return response as GoogleIndexResponse;
}
