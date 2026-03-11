import { InitialReactData, ServicePost, SeoMeta, WebServiceMenu } from "../types/website";

// Shared slugify for consistent SEO-friendly URLs
export function slugify(text: string): string {
  return (text || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-{2,}/g, "-");
}

function toBool(v: any): boolean | undefined {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return undefined;
}

function parseJsonMaybe<T = any>(v: any): T | undefined {
  if (!v) return undefined;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return undefined; }
  }
  return undefined;
}

function toArrayOfStrings(v: any): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean);
  if (typeof v === "string") return v.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  return undefined;
}

// Normalize a service detail row coming from DB/API/SSR to the canonical ServicePost
export function normalizeServiceDetail(raw: any): ServicePost {
  const id = String(raw?.id ?? raw?.service_id ?? "");
  const title = String(raw?.title ?? raw?.name ?? "");
  const slug = String(raw?.slug ?? (title ? slugify(title) : ""));
  const excerpt = raw?.excerpt ?? raw?.summary ?? raw?.meta_description ?? "";
  const content = raw?.content ?? raw?.html ?? "";
  const thumbnail = raw?.thumbnail ?? raw?.image_url ?? raw?.cover ?? undefined;
  const images = toArrayOfStrings(raw?.images) ?? (thumbnail ? [thumbnail] : undefined);
  const videos = toArrayOfStrings(raw?.videos ?? raw?.video ?? raw?.video_url ?? raw?.album);
  // service_code (web_services) tương đương service_type (web_service_detail)
  // Không còn dùng category/service_category nữa
  const serviceType = raw?.service_type ?? raw?.service_code ?? raw?.type ?? undefined;
  const category = undefined;
  const serviceId = raw?.service_id ? String(raw.service_id) : undefined;
  // Đảm bảo có thể đọc code từ cả 2 cột tùy bảng/nguồn dữ liệu
  const serviceCode = raw?.service_code ?? raw?.service_type ?? undefined;
  const publishDate = raw?.publish_date ?? raw?.created_at ?? raw?.updated_at ?? raw?.ngay_tao ?? undefined;
  const expiryDate = raw?.expiry_date ?? raw?.expired_at ?? undefined;
  const featured = toBool(raw?.featured);
  const activeHome = toBool(raw?.active_home);
  // Collect attribute-like fields (prefixed + important flat fields) so cards/detail show correct values
  const attributes: Record<string, any> = {};
  Object.keys(raw).forEach(key => {
    if (key.startsWith('attributes_') || key.startsWith('specifications_')) {
      attributes[key] = raw[key];
      // Also expose a simplified key (attributes_area -> area) for UI helpers
      const stripped = key.replace(/^attributes_/, '');
      if (stripped && attributes[stripped] === undefined) {
        attributes[stripped] = raw[key];
      }
    }
  });

  // Pass through common flat fields that backend may expose without prefix (real estate numeric/textual info)
  const passthroughKeys = [
    'price', 'priceValue', 'priceUnit', 'area', 'areaValue',
    'bedrooms', 'bedroomsValue', 'bathrooms', 'bathroomsValue',
    'floors', 'frontWidth', 'roadWidth', 'location', 'address',
    'propertyType', 'propertyTypeLabel', 'transactionType', 'transactionTypeLabel', 'listingType', 'type',
    'legalStatus', 'furnished', 'utilities', 'direction', 'floor', 'grade',
    'hasGarden', 'hasPool', 'parking', 'expectedROI', 'managedByOperator', 'hasAC',
    'service_code', 'serviceCode',
    // Keep prefixed text fields if API already flattened them
    'attributes_price', 'attributes_area', 'attributes_location', 'attributes_contact', 'attributes_dimensions',
    'attributes_bedrooms', 'attributes_bathrooms', 'attributes_floors', 'attributes_frontWidth', 'attributes_roadWidth'
  ];
  passthroughKeys.forEach(key => {
    if (raw[key] !== undefined && attributes[key] === undefined) {
      attributes[key] = raw[key];
    }
  });
  // Normalize numeric helper fields when they arrive as strings
  ['priceValue', 'areaValue', 'bedroomsValue', 'bathroomsValue', 'floors', 'frontWidth', 'roadWidth'].forEach(numKey => {
    if (attributes[numKey] !== undefined && typeof attributes[numKey] === 'string') {
      const parsed = Number(attributes[numKey]);
      attributes[numKey] = isNaN(parsed) ? attributes[numKey] : parsed;
    }
  });

  return {
    id,
    title,
    slug,
    excerpt,
    content,
    thumbnail,
    images,
    videos,
    serviceType,
    category,
    serviceId,
    serviceCode,
    publishDate,
    expiryDate,
    featured,
    activeHome,
    attributes,
  };
}

export function normalizeMenu(raw: any): WebServiceMenu {
  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? raw?.title ?? ""),
    slug: String(raw?.slug ?? slugify(String(raw?.name ?? ""))),
    parentId: raw?.parent_id ? String(raw.parent_id) : undefined,
    icon: raw?.icon ?? undefined,
    sortOrder: typeof raw?.sort_order === "number" ? raw.sort_order : (raw?.sort_order ? Number(raw.sort_order) : undefined),
    status: raw?.status ?? undefined,
    description: raw?.description ?? undefined,
    createdAt: raw?.created_at ?? undefined,
    updatedAt: raw?.updated_at ?? undefined,
  };
}

// Read SSR initial data safely and normalize lists
export function extractSSRInitialData(w: any = (typeof window !== "undefined" ? (window as any) : undefined)): InitialReactData {
  const initial = (w && (w.__INITIAL_REACT_DATA__ || w.initialReactData)) || {};
  const homeDetailRaw: any[] = Array.isArray(initial.homeDetailList) ? initial.homeDetailList : [];
  const serviceDetailRaw: any[] = Array.isArray(initial.serviceDetailList) ? initial.serviceDetailList : [];
  const menuRaw: any[] = Array.isArray(initial.menu) ? initial.menu : [];

  const data: InitialReactData = {
    ...initial,
    homeDetailList: homeDetailRaw.map(normalizeServiceDetail),
    serviceDetailList: serviceDetailRaw.map(normalizeServiceDetail),
    menu: menuRaw.map(normalizeMenu),
  };
  return data;
}

// Build a minimal SEO meta from a ServicePost (used as fallback)
export function buildSeoFromPost(post: ServicePost, baseUrl?: string, path?: string): SeoMeta {
  const canonical = baseUrl && path ? `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}` : undefined;
  return {
    title: post.title,
    description: post.excerpt,
    canonical,
    ogImage: post.thumbnail,
    keywords: Array.isArray(post.attributes?.keywords) ? post.attributes!.keywords.join(', ') : (post.attributes?.keywords || undefined)
  };
}
