import { request } from "#src/utils";
import ky from 'ky';
import i18n from 'i18next';

// Map internal table names to public service codes (security: hide internal table names)
const TABLE_TO_SERVICE_CODE: Record<string, string> = {
  'web_services': 'services',
  'web_service_detail': 'services-detail',
  'wu_home': 'home',
  'wu_about': 'about',
  'wu_contact': 'contact',
  'wu_products': 'products',
  'wu_news': 'news',
  'wu_events': 'events',
};

// Get backend API base URL
function getBackendUrl(): string {
  // Use VITE_API_BASE_URL from environment
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase && apiBase !== '/' && apiBase !== '') {
    // Remove /api suffix if present (we'll add it later for regular API calls)
    return apiBase.replace(/\/api\/?$/, '');
  }
  
  // Fallback: In dev, backend is usually on 15300
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const port = window.location.port;
    if (port === '3333' || port === '5173') {
      return 'http://localhost:15300';
    }
  }
  // Production: same origin
  return window.location.origin;
}

// Helper: detect if we're in website context (public, no auth) vs admin dashboard
function isWebsiteContext(): boolean {
  // Check if we're on website routes (clean URLs) AND no JWT token
  const path = window.location.pathname;
  const hasToken = !!localStorage.getItem('app_token');
  // Website context = public paths AND no auth token (guest user)
  // Public paths don't start with /admin, /login, /register, /error etc
  const isPublicPath = !path.startsWith('/admin') && !path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/error');
  return isPublicPath && !hasToken;
}

// Helper: Smart API call - automatically route to SSR (window.__INITIAL_REACT_DATA__) or API endpoint
async function smartGetTableData<T = any>(payload: {
  app_id: string;
  obj_name: string;
  e_where: any;
  take?: number;
  lastkey?: any;
}): Promise<ApiListResponse<T>> {
  const initialData = (window as any).__INITIAL_REACT_DATA__;
  if (initialData && initialData.serviceDetailList) {
    return {
      success: true,
      rows: initialData.serviceDetailList || [],
      data: initialData.serviceDetailList || [],
      totalCount: initialData.totalCount || initialData.serviceDetailList?.length || 0,
      page: initialData.page,
      pageSize: initialData.pageSize,
    };
  }
  // Nếu không có SSR data, không được phép fallback sang API, báo lỗi rõ ràng
  throw new Error('SSR data missing: Website routes must use SSR data, do not call API get-table-data!');
}

// Core API response types
export interface ApiListResponse<T> {
  success?: boolean;
  data: T[];
  total?: number;
  totalCount?: number;
  nextCursor?: any;
  message?: string;
  // Pagination fields for SSR
  page?: number;
  pageSize?: number;
  // New format from API
  rows?: T[];
  fields?: Record<string, string>;
  fieldsPK?: string[];
  id?: string;
}
export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

// Lightweight data model used by website pages
export interface ServicePost {
  id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  category?: string;
  serviceType?: string;
  author?: string;
  avatar?: string;
  publishDate?: string;
  readTime?: string;
  expiryDate?: string;
  views?: number;
  tags?: string[];
  thumbnail?: string;
  featured?: boolean;
  activeHome?: boolean;
  images?: string[]; // populated when detail is loaded
  // All flat fields from backend (attributes_*, specifications_*, etc.)
  [key: string]: any;
}

export function formatExpiryDate(expiryDate: string | undefined): string {
  if (!expiryDate) return '';
  try {
    const exp = new Date(expiryDate);
    if (isNaN(exp.getTime())) return '';
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    if (diffMs < 0) return 'Đã hết hạn';
    const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDay === 0) return 'Hết hạn hôm nay';
    if (diffDay === 1) return 'Hết hạn ngày mai';
    if (diffDay < 7) return `Còn ${diffDay} ngày`;
    if (diffDay < 30) return `Còn ${Math.floor(diffDay / 7)} tuần`;
    return `Còn ${Math.floor(diffDay / 30)} tháng`;
  } catch {
    return '';
  }
}

// Map key danh mục -> nhãn hiển thị
export const CATEGORY_LABELS: Record<string, string> = {
  "phan-mem": "Phần Mềm",
  "bat-dong-san": "Bất Động Sản",
  "lam-dep-my-pham": "Mỹ Phẩm & Làm Đẹp",
  "cho-thue-xe": "Cho Thuê Xe 4-7 Chỗ",
  "booking-online": "Booking Online",
};

// Các loại hình bất động sản phổ biến
export const PROPERTY_TYPES: Record<string, string> = {
  "can-ho-chung-cu": "Căn hộ Chung cư",
  "nha-rieng-nha-pho": "Nhà riêng/Nhà Phố",
  "biet-thu": "Biệt thự",
  "dat-nen": "Đất nền",
  "shophouse": "Shophouse",
  "officetel": "Officetel",
  "condotel-resort-villa": "Condotel/Resort Villa",
  "van-phong": "Văn phòng cho thuê",
  "phong-tro-nha-tro": "Phòng trọ/Nhà trọ",
};

// Loại giao dịch BĐS
export const TRANSACTION_TYPES: Record<string, string> = {
  "sell": "Bán",
  "rent": "Cho thuê",
};

// Language-aware dynamic labels from SSR categories
const CATEGORY_LABELS_DYNAMIC_VI: Record<string, string> = {};
const CATEGORY_LABELS_DYNAMIC_EN: Record<string, string> = {};
const CATEGORY_LABELS_DYNAMIC_ZH: Record<string, string> = {};

export function getCategoryLabel(code?: string): string {
  const k = (code || '').toString();
  const lang = i18n.language || 'vi-VN';
  if (lang.includes('en')) {
    return (
      CATEGORY_LABELS_DYNAMIC_EN[k] || CATEGORY_LABELS_DYNAMIC_VI[k] || CATEGORY_LABELS[k] || k
    );
  }
  if (lang.includes('zh')) {
    return (
      CATEGORY_LABELS_DYNAMIC_ZH[k] || CATEGORY_LABELS_DYNAMIC_VI[k] || CATEGORY_LABELS[k] || k
    );
  }
  return (CATEGORY_LABELS_DYNAMIC_VI[k] || CATEGORY_LABELS[k] || k);
}

// Dynamic description maps (populated from SSR data)
const CATEGORY_DESCRIPTIONS_DYNAMIC_VI: Record<string, string> = {};
const CATEGORY_DESCRIPTIONS_DYNAMIC_EN: Record<string, string> = {};
const CATEGORY_DESCRIPTIONS_DYNAMIC_ZH: Record<string, string> = {};

export function getCategoryDescription(code: string): string {
  const k = code.toLowerCase();
  const lang = i18n.language || 'vi-VN';
  
  // Try language-specific map first
  if (lang.includes('en')) {
    return CATEGORY_DESCRIPTIONS_DYNAMIC_EN[k] || CATEGORY_DESCRIPTIONS_DYNAMIC_VI[k] || '';
  }
  if (lang.includes('zh')) {
    return CATEGORY_DESCRIPTIONS_DYNAMIC_ZH[k] || CATEGORY_DESCRIPTIONS_DYNAMIC_VI[k] || '';
  }
  
  // Default to Vietnamese
  return CATEGORY_DESCRIPTIONS_DYNAMIC_VI[k] || '';
}

export function getPropertyTypeLabel(code?: string): string {
  const k = (code || '').toString();
  // map internal code to i18n key where possible
  const codeToKey: Record<string, string> = {
    'can-ho-chung-cu': 'apartment',
    'nha-rieng-nha-pho': 'house',
    'biet-thu': 'villa',
    'dat-nen': 'land',
    'shophouse': 'townhouse',
    'officetel': 'office',
    'condotel-resort-villa': 'condotel',
    'van-phong': 'office',
    'phong-tro-nha-tro': 'motel',
  };
  const mapped = codeToKey[k];
  if (mapped) return i18n.t(`website.services.property_types.${mapped}`, PROPERTY_TYPES[k] || k);
  return PROPERTY_TYPES[k] || k;
}

export function getTransactionTypeLabel(code?: string): string {
  const k = (code || '').toString();
  // use i18n keys for transaction types
  if (k === 'sell' || k === 'ban' || k.toLowerCase().includes('bán')) {
    return i18n.t('website.services.transaction_types.sell', TRANSACTION_TYPES['sell']);
  }
  if (k === 'rent' || k === 'cho-thue' || k.toLowerCase().includes('thuê')) {
    return i18n.t('website.services.transaction_types.rent', TRANSACTION_TYPES['rent']);
  }
  return TRANSACTION_TYPES[k] || k;
}

// Dynamic labels loaded from web_services.name by service_code
const CATEGORY_LABELS_DYNAMIC: Record<string, string> = {};
let CATEGORY_LABELS_LOADED = false;
let CATEGORY_LABELS_LOADING = false;

async function loadCategoryLabels(): Promise<void> {
  if (CATEGORY_LABELS_LOADING || CATEGORY_LABELS_LOADED) return;
  CATEGORY_LABELS_LOADING = true;
  try {
    // === SSR FIRST: Check window.__SSR_WEBSITE_CATEGORIES__ ===
    const ssrCategories = (window as any).__SSR_WEBSITE_CATEGORIES__;
    if (ssrCategories && Array.isArray(ssrCategories)) {
      for (const cat of ssrCategories) {
        const code = (cat?.slug || '').toString();
        const nameVi = (cat?.category || '').toString();
        const nameEn = (cat?.category_en || '').toString();
        const nameZh = (cat?.category_zh || '').toString();
        const descVi = (cat?.description || cat?.attributes_description || '').toString();
        const descEn = (cat?.attributes_description_en || '').toString();
        const descZh = (cat?.attributes_description_zh || '').toString();
        
        if (code) {
          // Labels
          if (nameVi) CATEGORY_LABELS_DYNAMIC_VI[code] = nameVi;
          if (nameEn) CATEGORY_LABELS_DYNAMIC_EN[code] = nameEn;
          if (nameZh) CATEGORY_LABELS_DYNAMIC_ZH[code] = nameZh;
          // Backward compatibility: populate legacy map too
          if (nameVi) CATEGORY_LABELS_DYNAMIC[code] = nameVi;
          
          // Descriptions
          if (descVi) CATEGORY_DESCRIPTIONS_DYNAMIC_VI[code] = descVi;
          if (descEn) CATEGORY_DESCRIPTIONS_DYNAMIC_EN[code] = descEn;
          if (descZh) CATEGORY_DESCRIPTIONS_DYNAMIC_ZH[code] = descZh;
        }
      }
      
      CATEGORY_LABELS_LOADED = true;
      CATEGORY_LABELS_LOADING = false;
      return;
    }
    
    throw new Error('SSR categories missing: Website must use SSR data, do not call API!');
  } catch (err) {
    // ignore errors; fall back to static labels
  } finally {
    CATEGORY_LABELS_LOADING = false;
  }
}

// Fire-and-forget prefetch in browser
try { if (typeof window !== 'undefined') { void loadCategoryLabels(); } } catch {}

function toAbsoluteIfNeeded(src?: string) {
  if (!src) return src;
  if (typeof src !== 'string') return src;
  if (src.startsWith("/")) return src;
  return src;
}

function parseJSON<T = any>(val: any, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === "object") return val as T;
  try { return JSON.parse(val as string) as T; } catch { return fallback; }
}

/**
 * Normalize API response to consistent format
 * Handles both old format (data/rows directly) and new format (rows + fields)
 */
function normalizeApiResponse<T = any>(response: any): ApiListResponse<T> {
  if (!response) {
    return { success: false, data: [], total: 0, totalCount: 0, message: 'No response' };
  }
  
  // New format: { rows: [...], fields: {...}, fieldsPK: [...], id: "table_name", success: true }
  if (response.rows && Array.isArray(response.rows)) {
    const rows = response.rows as T[];
    return {
      success: response.success !== false,
      data: rows,
      rows: rows,
      total: rows.length,
      totalCount: rows.length,
      nextCursor: response.nextCursor,
      message: response.message || 'ok',
      fields: response.fields,
      fieldsPK: response.fieldsPK,
      id: response.id,
    };
  }
  
  // Old format: { data: [...] } or direct array
  if (response.data && Array.isArray(response.data)) {
    return {
      success: response.success !== false,
      data: response.data,
      rows: response.data,
      total: response.total || response.totalCount || response.data.length,
      totalCount: response.totalCount || response.total || response.data.length,
      nextCursor: response.nextCursor,
      message: response.message || 'ok',
    };
  }
  
  // Fallback for array response
  if (Array.isArray(response)) {
    return {
      success: true,
      data: response,
      rows: response,
      total: response.length,
      totalCount: response.length,
      message: 'ok',
    };
  }
  
  // Empty response
  return {
    success: response.success !== false,
    data: [],
    rows: [],
    total: 0,
    totalCount: 0,
    message: response.message || 'Empty response',
  };
}

function buildDomainFilter() {
  try {
    const host = window?.location?.hostname;
    if (!host || host === "localhost" || host === "127.0.0.1") return undefined;
    const noWww = host.replace(/^www\./i, "");
    const parts = noWww.split(".");
    return parts.length >= 3 ? parts.slice(-2).join(".") : noWww;
  } catch { return undefined; }
}

// Backward-compat: accept multiple aliases for a given service category key
function categoryAliases(key: string): string[] {
  const map: Record<string, string[]> = {
    "phan-mem": ["phan-mem", "phanmem", "software", "app"],
    "bat-dong-san": ["bat-dong-san", "batdongsan", "real-estate", "realestate"],
    "lam-dep-my-pham": ["lam-dep-my-pham", "lam-dep", "my-pham", "beauty", "cosmetics"],
    "cho-thue-xe": ["cho-thue-xe", "chothuexe", "car-rental", "car"],
    "booking-online": ["booking-online", "booking", "events"],
  };
  const aliases = map[key] || [key];
  // make unique, lowercase
  return Array.from(new Set(aliases.map(s => String(s).toLowerCase())));
}

// Basic slugifier for matching titles to slugs when DB lacks a slug column
function slugify(text?: string): string {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

// Map web_services row -> ServicePost
function mapWebServicesRow(row: any): ServicePost {
  // Parse attributes JSON (can be string or object)
  const attributes = parseJSON<ServicePost["attributes"]>(row?.attributes, {});
  
  // Ensure raw numeric fields exist for filtering/formatting (defensive programming)
  // These should be populated by update_all_services.js but we add fallback parsing here
  if (attributes && !attributes.priceValue && attributes.price) {
    const priceStr = String(attributes.price).toLowerCase();
    if (priceStr.includes('tỷ')) {
      const match = priceStr.match(/(\d+(?:\.\d+)?)/);
      if (match) attributes.priceValue = parseFloat(match[1]) * 1000000000;
    } else if (priceStr.includes('k') || priceStr.includes('000')) {
      const match = priceStr.match(/(\d+(?:\.\d+)?)/);
      if (match) attributes.priceValue = parseFloat(match[1]) * 1000;
    }
  }
  
  if (attributes && !attributes.areaValue && attributes.area) {
    const areaMatch = String(attributes.area).match(/(\d+(?:\.\d+)?)/);
    if (areaMatch) attributes.areaValue = parseFloat(areaMatch[1]);
  }
  
  if (attributes && !attributes.bedroomsValue && attributes.bedrooms) {
    const br = parseInt(String(attributes.bedrooms));
    if (!isNaN(br)) attributes.bedroomsValue = br;
  }
  
  if (attributes && !attributes.pricePerDayValue && attributes.price && row?.service_type === 'cho-thue-xe') {
    const priceStr = String(attributes.price).toLowerCase();
    const match = priceStr.match(/(\d+(?:\.\d+)?)/);
    if (match) attributes.pricePerDayValue = parseFloat(match[1]) * 1000;
  }
  
  // Parse seo_meta JSON (can be string or object)
  const seoMeta = parseJSON<Record<string, any>>(row?.seo_meta, {});
  
  // Extract tags from keywords
  const tags: string[] = String(seoMeta?.keywords || row?.tags || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  
  const serviceType: string = row?.service_type || row?.serviceType || "phan-mem";
  // category chuẩn hóa = service_code/service_type (theo yêu cầu mới)
  const category = serviceType;
  
  const resolvedTitle = seoMeta?.meta_title || row?.title || row?.service_title || row?.name || 'Dịch vụ';
  
  return {
    id: String(row?.id || ""),
    title: resolvedTitle,
    slug: row?.slug || String(row?.id || ""),
    excerpt: row?.summary || row?.excerpt || "",
    content: "", // populated from detail
    category,
    serviceType,
    author: row?.author || "",
    avatar: row?.avatar || "",
    publishDate: String(row?.created_at || row?.updated_at || row?.publish_date || ""), 
    readTime: row?.readTime || "",
    expiryDate: row?.expiry_date || "",
    views: row?.views || 0,
    tags,
    thumbnail: toAbsoluteIfNeeded(row?.thumbnail) || toAbsoluteIfNeeded(row?.cover) || "",
    featured: !!(row?.featured || attributes?.featured),
    activeHome: !!(row?.active_home || attributes?.activeHome),
    attributes: {
      ...attributes,
      // keep service_code on attributes so UI / related-lookup can reuse it
      service_code: row?.service_code || row?.service_type || row?.serviceCode || row?.code || attributes?.service_code,
      __seo: seoMeta,
    },
    images: undefined,
  } as ServicePost;
}
export function getRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return '';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'Vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day === 1) return 'Hôm qua';
  if (day < 7) return `${day} ngày trước`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week} tuần trước`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} tháng trước`;
  const year = Math.floor(day / 365);
  return `${year} năm trước`;
}

function applyDetailToPost(post: ServicePost, detail: any): ServicePost {
  if (!detail) return post;
  
  const imagesArr: string[] = parseJSON<string[]>(detail?.images, []);
  (post as any).images = imagesArr;
  
  post.content = detail?.content_html || post.content || "";
  
  const features = parseJSON<string[]>(detail?.features, []);
  const relatedServices = parseJSON<string[]>(detail?.related_services, []);
  // Only use flat fields from detail
  const flatSpecs: Record<string, any> = {};
  Object.keys(detail).forEach(key => {
    if (key.startsWith('specifications_')) {
      flatSpecs[key] = detail[key];
    }
  });
  const mergedAttrs = {
    ...post.attributes,
    ...flatSpecs,
    __detail: {
      features,
      relatedServices,
      content_html: post.content,
    },
  };
  post.attributes = mergedAttrs;
  return post;
}

// ====== LISTING: web_services ======
// Extended listing fetch with optional server-side filters mapped to fieldsSearch.
// options:
// - lastkey: cursor for pagination
// - q: keyword search on title (uses 'like')
// - featured: only featured=1
// - activeHome: only active_home=1
// - excludeIds: list of ids to exclude (noteq/in logic client-side fallback)
export async function fetchServiceList(category: string, take = 12, lastkey?: any, options?: {
  q?: string;
  featured?: boolean;
  activeHome?: boolean;
  excludeIds?: string[];
}) {
  const domain = buildDomainFilter();
  const aliasList = categoryAliases(category);
  // Primary query (status + (service_type IN aliases OR category IN aliases) + optional domain)
  const primaryConds: any[] = [
    { field: 'status', type: 'eq', value: 'active' },
    { field: 'service_type', type: 'in', value: aliasList },
  ];
  // Map keyword search to title like (Lucene wildcard)
  if (options?.q) {
    primaryConds.push({ field: 'title', type: 'like', value: String(options.q).toLowerCase() });
  }
  if (options?.featured) {
    primaryConds.push({ field: 'featured', type: 'eq', value: 1 });
  }
  if (options?.activeHome) {
    primaryConds.push({ field: 'active_home', type: 'eq', value: 1 });
  }
  if (domain) primaryConds.push({ field: 'domain', type: 'eq', value: domain });
  // Use public service code instead of internal table name
  const tableForQuery = 'web_service_detail';
  const primaryPayload = { app_id: 'wuweb', obj_name: tableForQuery, e_where: { operator: 'AND', conditions: primaryConds }, take, ...(lastkey ? { lastkey } : {}) };
  
  // Chỉ lấy từ SSR, không được phép fallback API
  const initialData = (window as any).__INITIAL_REACT_DATA__;
  if (!initialData || !initialData.serviceDetailList) {
    throw new Error('SSR data missing: Website must use SSR data, do not call API get-table-data!');
  }
  let rows: any[] = initialData.serviceDetailList.filter((r: any) => {
    if (!r) return false;
    // Lọc theo category alias
    const st = (r.service_type || r.category || '').toLowerCase();
    return aliasList.map(a => a.toLowerCase()).includes(st);
  });
  // Lọc theo các options khác nếu có
  if (options?.q) {
    rows = rows.filter((r: any) => String(r.title || '').toLowerCase().includes(String(options.q).toLowerCase()));
  }
  if (options?.featured) {
    rows = rows.filter((r: any) => r.featured === 1);
  }
  if (options?.activeHome) {
    rows = rows.filter((r: any) => r.active_home === 1);
  }
  if (options?.excludeIds && Array.isArray(options.excludeIds)) {
    rows = rows.filter((r: any) => !options.excludeIds!.includes(String(r.id)));
  }
  // Sắp xếp theo publish_date (desc)
  if (rows.length > 1) {
    rows.sort((a, b) => {
      const da = new Date(a.publish_date || a.created_at || 0).getTime();
      const db = new Date(b.publish_date || b.created_at || 0).getTime();
      return db - da;
    });
  }
  const totalCount = rows.length;
  const data = Array.isArray(rows) ? rows.map(mapWebServicesRow) : [];
  return { success: true, data, total: totalCount, totalCount, nextCursor: undefined } as ApiListResponse<ServicePost>;
}

// ====== DETAIL: join web_services + web_service_detail ======
export async function fetchServiceDetail(category: string, id: string) {
  // Step 0: normalize inputs
  const domain = buildDomainFilter();
  const idStr = id;
  const maybeNumericId = /^\d+$/.test(idStr) ? idStr : undefined;
  const idSlug = slugify(idStr);

  // Helper: query a table with conditions
  const query = async (obj_name: string, conditions: any[], take = 50) => {
    const payload: any = { app_id: 'wuweb', obj_name, e_where: conditions.length === 1 ? conditions[0] : { operator: 'AND', conditions }, take };
    const res = await smartGetTableData<any>(payload);
    const normalized = normalizeApiResponse(res);
    return normalized.rows || normalized.data || [];
  };

  // Helper: try to find service in web_services by id/slug/service_code (no category constraint)
  const findService = async (): Promise<any | undefined> => {
    const andConds: any[] = [ { field: 'status', type: 'eq', value: 'active' } ];
    if (domain) andConds.push({ field: 'domain', type: 'eq', value: domain });
    // OR candidates
    const orConds: any[] = [];
    if (maybeNumericId) orConds.push({ field: 'id', type: 'eq', value: maybeNumericId });
    orConds.push({ field: 'slug', type: 'eq', value: idStr });
    orConds.push({ field: 'service_code', type: 'eq', value: idStr }); // Thêm service_code
    const rows1 = await query('web_services', [{ operator: 'AND', conditions: [...andConds, { operator: 'OR', conditions: orConds }] }], 1);
    if (Array.isArray(rows1) && rows1.length > 0) return rows1[0];
    // Fallback: fetch a page and match by computed slug from title
    const rows2 = await query('web_services', andConds, 200);
    const found = (rows2 as any[]).find(r => slugify(r?.slug || r?.service_code || r?.title) === idSlug);
    if (found) return found;
    // Fallback2: remove category constraint, try id/slug/service_code only
    const andConds2: any[] = [ { field: 'status', type: 'eq', value: 'active' } ];
    if (domain) andConds2.push({ field: 'domain', type: 'eq', value: domain });
    const rows3 = await query('web_services', [{ operator: 'AND', conditions: [...andConds2, { operator: 'OR', conditions: orConds }] }], 1);
    if (Array.isArray(rows3) && rows3.length > 0) return rows3[0];
    // Fallback3: scan a page without alias constraints and match by slugified title/code
    const rows4 = await query('web_services', andConds2, 200);
    return (rows4 as any[]).find(r => slugify(r?.slug || r?.service_code || r?.title) === idSlug);
  };

  // Helper: find a detail row by various references
  const findDetail = async (svc?: any): Promise<any | undefined> => {
    const andConds: any[] = [];
    if (domain) andConds.push({ field: 'domain', type: 'eq', value: domain });
    const orConds: any[] = [];
    if (svc?.id) orConds.push({ field: 'service_id', type: 'eq', value: String(svc.id) });
    const code = svc?.service_code || svc?.service_type || svc?.serviceCode || svc?.code;
    if (code) orConds.push({ field: 'service_type', type: 'eq', value: String(code) });
    if (maybeNumericId) orConds.push({ field: 'service_id', type: 'eq', value: maybeNumericId });
    // also allow lookup by slug/code directly on detail
    orConds.push({ field: 'slug', type: 'eq', value: idStr });
    orConds.push({ field: 'service_type', type: 'eq', value: idStr });
    const rows = await query('web_service_detail', [{ operator: 'AND', conditions: [...andConds, { operator: 'OR', conditions: orConds }] }], 200);
    if (Array.isArray(rows) && rows.length > 0) {
      // 1. Try exact slug match first (most precise)
      const exactSlugMatch = rows.find((r: any) => String(r.slug || '').toLowerCase() === idStr.toLowerCase());
      if (exactSlugMatch) return exactSlugMatch;
      
      // 2. Try slugified comparison (handle normalization)
      const slugified = rows.find((r: any) => slugify(r.slug || '') === idSlug);
      if (slugified) return slugified;
      
      // 3. Fallback: sort by date and pick first (only if slug didn't match)
      rows.sort((a: any, b: any) => new Date(b.publish_date || b.created_at || 0).getTime() - new Date(a.publish_date || a.created_at || 0).getTime());
      return rows[0];
    }
    // Fallback: try again without domain restriction (if any)
    const andConds2: any[] = [];
    const rows2 = await query('web_service_detail', [{ operator: 'AND', conditions: [...andConds2, { operator: 'OR', conditions: orConds }] }], 200);
    if (Array.isArray(rows2) && rows2.length > 0) {
      // 1. Try exact slug match first
      const exactSlugMatch = rows2.find((r: any) => String(r.slug || '').toLowerCase() === idStr.toLowerCase());
      if (exactSlugMatch) return exactSlugMatch;
      
      // 2. Try slugified comparison
      const slugified = rows2.find((r: any) => slugify(r.slug || '') === idSlug);
      if (slugified) return slugified;
      
      // 3. Fallback: sort by date
      rows2.sort((a: any, b: any) => new Date(b.publish_date || b.created_at || 0).getTime() - new Date(a.publish_date || a.created_at || 0).getTime());
      return rows2[0];
    }
    return undefined;
  };

  // STEP 1: Try find base service, then its detail (preferred)
  const baseSvc = await findService();
  let post: ServicePost | undefined = baseSvc ? mapWebServicesRow(baseSvc) : undefined;
  let detailRow = await findDetail(baseSvc);

  // Heuristic fallback: if id looks like "...-<service_code>" (missing numeric), fetch by service_type and prefix-match slug
  if (!detailRow) {
    const svcCode = (post?.attributes?.service_code || baseSvc?.service_code || '').toString();
    const missingNumericSuffix = svcCode && idStr.endsWith(`-${svcCode}`) && !/-\d+$/.test(idStr);
    if (missingNumericSuffix) {
      const andConds: any[] = [];
      if (domain) andConds.push({ field: 'domain', type: 'eq', value: domain });
      const rows = await query('web_service_detail', [{ operator: 'AND', conditions: [...andConds, { field: 'service_type', type: 'eq', value: svcCode }] }], 200);
      if (Array.isArray(rows) && rows.length > 0) {
        const pref = `${idStr}-`;
        const cand = rows.find((r: any) => String(r?.slug || '').startsWith(pref)) || rows[0];
        detailRow = cand;
      }
    }
  }

  // If not found in STEP 1, STEP 2: find detail first (by slug/code), then synthesize base post
  if (!post && !detailRow) {
    detailRow = await findDetail(undefined);
  }
  if (!post && detailRow) {
    // Build a minimal post from detail to satisfy UI; keep data centralized
    const serviceType: string = (detailRow.service_type || category || 'phan-mem').toString();
    const seoMeta = parseJSON<Record<string, any>>(detailRow.seo_meta, {});
    const title = seoMeta?.meta_title || 'Dịch vụ';
    const excerpt = seoMeta?.meta_description || '';
    const specifications = parseJSON<Record<string, any>>(detailRow.specifications, {});
    const attributes = {
      ...specifications,
      // propagate service_code so callers can fetch related detail rows by code
      service_code: detailRow.service_code || detailRow.service_type || detailRow.serviceCode || specifications?.service_code,
      __detail_only: true,
      __seo: seoMeta,
    } as Record<string, any>;
    post = {
      id: String(detailRow.service_id || detailRow.id || idStr),
      title,
      excerpt,
      content: '',
      category: serviceType,
      serviceType,
      thumbnail: detailRow.thumbnail || detailRow.cover || '',
      publishDate: String(detailRow.created_at || detailRow.updated_at || ''),
      readTime: '',
      expiryDate: '',
      views: 0,
      tags: String(seoMeta?.keywords || '').split(',').map(s => s.trim()).filter(Boolean),
      featured: false,
      activeHome: false,
      attributes,
    } as ServicePost;
  }

  // Merge detail into post (without overriding authoritative listing attributes)
  if (post && detailRow) {
    post = applyDetailToPost(post, detailRow);
  }

  return { data: post ? [post] : [] } as ApiListResponse<ServicePost>;
}

// ====== RELATED: ưu tiên related_services trong detail, fallback cùng serviceType ======
// Related services with optional keyword filter (q) mapped to title like.
export async function fetchRelatedServices(category: string, id: string, take = 4, page = 1, lastkey?: any, options?: { q?: string }) {
  // Chỉ lấy từ SSR, không được phép gọi API get-table-data
  const initialData = (window as any).__INITIAL_REACT_DATA__;
  if (!initialData || !initialData.serviceDetailList) {
    throw new Error('SSR data missing: Website must use SSR data, do not call API get-table-data!');
  }
  // Tìm detail theo id/slug/service_code trong SSR data
  const idStr = id;
  const idSlug = slugify(idStr);
  const detailRow = initialData.serviceDetailList.find((r: any) =>
    String(r?.id) === idStr ||
    String(r?.slug) === idStr ||
    String(r?.service_code) === idStr ||
    slugify(r?.slug || r?.service_code || r?.title) === idSlug
  );
  if (!detailRow) throw new Error('Service detail not found in SSR data');
  // 2) Nếu có related_services thì trả về các dịch vụ liên quan
  const relatedIds: string[] = parseJSON<string[]>(detailRow?.related_services, []);
  let related = [];
  if (relatedIds.length > 0) {
    related = initialData.serviceDetailList.filter((r: any) => relatedIds.includes(String(r?.id)));
  } else {
    // Nếu không có, trả về các dịch vụ cùng loại (service_type)
    related = initialData.serviceDetailList.filter((r: any) => r?.service_type === detailRow.service_type && String(r?.id) !== idStr);
  }
  // Có thể lọc thêm theo options.q nếu cần
  if (options?.q) {
    related = related.filter((r: any) => String(r?.title || '').toLowerCase().includes(String(options.q).toLowerCase()));
  }
  // Phân trang: tính start và end index
  const startIndex = (page - 1) * take;
  const endIndex = startIndex + take;
  const paginatedData = related.slice(startIndex, endIndex);
  return { success: true, data: paginatedData, total: related.length, totalCount: related.length };
}

// ====== BOOKING ======
export function createServiceBooking(serviceId: string, data: any) {
  const domain = buildDomainFilter();
  const payload = {
    app_id: "wuweb",
    obj_name: "web_service_bookings",
    command: "create",
    obj_update: { service_id: serviceId, ...(domain ? { domain } : {}), ...data },
  };
  return request.post<ApiResponse<string>>("update-table-data", { json: payload, ignoreLoading: true }).json<ApiResponse<string>>();
}

// ====== CATEGORIES ======
export function fetchServiceCategories() {
  // Lấy từ SSR, không fallback API, không gọi get-table-data
  if (typeof window !== 'undefined') {
    const ssrCategories = (window as any).__SSR_WEBSITE_CATEGORIES__;
    if (Array.isArray(ssrCategories)) {
      return Promise.resolve({
        success: true,
        data: ssrCategories,
        rows: ssrCategories,
        total: ssrCategories.length,
        totalCount: ssrCategories.length,
        message: 'SSR categories',
      });
    }
  }
  throw new Error('SSR categories missing: Website must use SSR data, do not call API!');
}

// ====== TAGS ======
export async function fetchServiceTags(serviceId: string) {
  // Lấy từ SSR, không fallback API, không gọi get-table-data
  if (typeof window !== 'undefined') {
    const ssrTags = (window as any).__SSR_WEBSITE_TAGS__;
    if (ssrTags && typeof ssrTags === 'object' && Array.isArray(ssrTags[serviceId])) {
      const tagsArr = ssrTags[serviceId];
      return {
        success: true,
        data: tagsArr,
        rows: tagsArr,
        total: tagsArr.length,
        totalCount: tagsArr.length,
        message: 'SSR tags',
      };
    }
  }
  throw new Error('SSR tags missing: Website must use SSR data, do not call API!');
}

// ====== REVIEWS ======
export async function fetchServiceReviews(serviceId: string, take = 10, lastkey?: any) {
  // Lấy từ SSR, không fallback API, không gọi get-table-data
  if (typeof window !== 'undefined') {
    const ssrReviews = (window as any).__SSR_WEBSITE_REVIEWS__;
    if (ssrReviews && typeof ssrReviews === 'object' && Array.isArray(ssrReviews[serviceId])) {
      const reviewsArr = ssrReviews[serviceId];
      return {
        success: true,
        data: reviewsArr,
        rows: reviewsArr,
        total: reviewsArr.length,
        totalCount: reviewsArr.length,
        message: 'SSR reviews',
      };
    }
  }
  throw new Error('SSR reviews missing: Website must use SSR data, do not call API!');
}

// ====== DISPLAY HELPERS - Nhất quán giữa listing và detail ======
/**
 * Format số theo định dạng VNĐ
 */
function formatVND(value: number): string {
  try {
    const locale = (i18n && i18n.language && i18n.language !== 'cimode') ? i18n.language : 'vi-VN';
    // Use Intl to format currency according to current locale, keep currency VND
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString('vi-VN') + ' ₫';
  }
}

/**
 * Format giá hiển thị từ attributes theo VNĐ, ưu tiên textual nếu đã format sẵn
 * Support unit parameter for rental prices (VND/tháng)
 */
export function formatPrice(attrs: Record<string, any> | undefined, unit?: string): string {
  if (!attrs) return '';

  const locale = (i18n && i18n.language && i18n.language !== 'cimode') ? i18n.language : 'vi-VN';

  // Handle numeric priceValue first - prefer numeric formatting using Intl
  if (typeof attrs.priceValue === 'number' && attrs.priceValue > 0) {
    const value = attrs.priceValue;
    // If current locale is Vietnamese, use compact, human-friendly units (tỷ/triệu/k)
    if (locale.startsWith('vi')) {
      const unitSuffix = unit === 'VND/tháng' ? '/tháng' : '';
      if (value >= 1000000000) {
        const billions = value / 1000000000;
        return `${billions.toFixed(1)} tỷ${unitSuffix}`;
      }
      if (value >= 1000000) {
        const millions = value / 1000000;
        return `${millions.toFixed(1)} triệu${unitSuffix}`;
      }
      if (value >= 1000) {
        const thousands = value / 1000;
        return `${thousands.toFixed(0)}k${unitSuffix}`;
      }
      return formatVND(value) + (unit === 'VND/tháng' ? '/tháng' : '');
    }

    // For non-VN locales, format as currency (VND) according to locale conventions
    try {
      // Use compact notation for large numbers when supported
      const nf = new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
      return nf.format(value);
    } catch {
      return formatVND(value);
    }
  }
  
  // Priority: attributes_price (flat field from database) > price (nested)
  const priceText = attrs.attributes_price !== undefined ? attrs.attributes_price : attrs.price;
  
  if (priceText && typeof priceText === 'string') {
    const trimmed = priceText.trim();
    
    // Nếu đã có format tốt (có chữ "tỷ", "triệu", "k" hoặc đã có dấu phân cách nghìn)
    // Kiểm tra xem có phải đã format hay chưa
    if (/(tỷ|triệu|tr|k\b)/i.test(trimmed) || /\d{1,3}(\.\d{3})+/.test(trimmed)) {
      return trimmed;
    }
    
    // Trường hợp 1: Số thuần túy hoặc có VND/đ không format (ví dụ: "180000", "180000 VND", "180000đ")
    // Extract số từ string và format lại
    const numericMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:VND|đ|₫|dong)?$/i);
    if (numericMatch) {
      const numStr = numericMatch[1].replace(/,/g, '');
      const parsed = parseFloat(numStr);
      if (!isNaN(parsed)) return formatVND(parsed);
    }
    
    // Trường hợp 2: String có số nhưng format lạ, cố parse
    const allDigits = trimmed.replace(/[^\d]/g, '');
    if (allDigits) {
      const parsed = parseFloat(allDigits);
      if (!isNaN(parsed) && parsed > 0) return formatVND(parsed);
    }
    
    // Fallback: giữ nguyên nếu có text
    if (trimmed.length > 0) return trimmed;
  }
  
  return '';
}

/**
 * Format diện tích hiển thị
 */
export function formatArea(attrs: Record<string, any> | undefined): string {
  if (!attrs) return '';
  // Priority: attributes_area (flat field) > area (nested) > areaValue (numeric)
  const areaVal = attrs.attributes_area !== undefined ? attrs.attributes_area : attrs.area;
  
  if (areaVal === undefined || areaVal === null || areaVal === '') return '';
  
  // If already a string with unit, return as-is
  if (typeof areaVal === 'string' && areaVal.trim()) {
    const trimmed = areaVal.trim();
    // Check if already has unit
    if (/(m2|m²)$/i.test(trimmed)) {
      return trimmed;
    }
    // Add m² if not present
    return `${trimmed} m²`;
  }
  
  // If numeric
  if (typeof areaVal === 'number' && areaVal > 0) {
    return `${areaVal} m²`;
  }
  
  // Fallback: areaValue numeric
  if (typeof attrs.areaValue === 'number' && attrs.areaValue > 0) {
    return `${attrs.areaValue} m²`;
  }
  
  return '';
}

/**
 * Format số phòng ngủ hiển thị
 */
export function formatBedrooms(attrs: Record<string, any> | undefined): string {
  if (!attrs) return '';
  // Priority: attributes_bedrooms (flat field) > bedrooms (nested) > bedroomsValue (numeric)
  const brVal = attrs.attributes_bedrooms !== undefined ? attrs.attributes_bedrooms : attrs.bedrooms;
  
  if (brVal === undefined || brVal === null || brVal === '') return '';
  
  // If string, check if empty after trim
  const strVal = String(brVal).trim();
  if (strVal) {
    return strVal;
  }
  
  // Fallback numeric
  if (typeof attrs.bedroomsValue === 'number' && attrs.bedroomsValue > 0) {
    return String(attrs.bedroomsValue);
  }
  
  return '';
}

/**
 * Format số phòng tắm hiển thị
 */
export function formatBathrooms(attrs: Record<string, any> | undefined): string {
  if (!attrs) return '';
  // Priority: attributes_bathrooms (flat field) > bathrooms (nested) > bathroomsValue (numeric)
  const btVal = attrs.attributes_bathrooms !== undefined ? attrs.attributes_bathrooms : attrs.bathrooms;
  
  if (btVal === undefined || btVal === null || btVal === '') return '';
  
  // If string, check if empty after trim
  const strVal = String(btVal).trim();
  if (strVal) {
    return strVal;
  }
  
  // Fallback numeric
  if (typeof attrs.bathroomsValue === 'number' && attrs.bathroomsValue > 0) {
    return String(attrs.bathroomsValue);
  }
  
  return '';
}
