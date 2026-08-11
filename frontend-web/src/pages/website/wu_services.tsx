// Helper to get default category slug from SSR categories
function getDefaultCategorySlug() {
  if (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) {
    const cat = window.__SSR_WEBSITE_CATEGORIES__.find(
      (c) => typeof c === 'object' && c !== null && 'is_group_slug_default' in c && (c as any).is_group_slug_default === true
    );
    if (cat && (cat as any).slug) return (cat as any).slug;
  }
  return 'phan-mem';
}

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "react-router";
import i18n from "i18next";
import {
  Card,
  Col,
  Pagination,
  Row,
  Space,
  Tag,
  Typography,
  Spin,
  Empty,
  List,
  Avatar,
  Timeline,
  Tabs,
  Input,
  InputNumber,
  Select,
  Row as AntRow,
  Col as AntCol,
  Button,
  Form,
} from "antd";
import { useTranslation } from "react-i18next";
import {
  CalendarOutlined,
  CarOutlined,
  EnvironmentOutlined,
  StarOutlined,
  CodeOutlined,
} from "@ant-design/icons";

import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
// Import ServicePost type from API instead of defining local type
import { 
  getRelativeTime, 
  formatExpiryDate, 
  formatPrice,
  formatArea,
  formatBedrooms,
  formatBathrooms,
  getCategoryLabel,
  getPropertyTypeLabel,
  getTransactionTypeLabel,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
  type ServicePost 
} from "#src/api/wu_service";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";

// Helper function to decode HTML - csmDecrypt đã tự làm decodeURIComponent bên trong
// Nếu decrypt fail (dữ liệu cũ), fallback về decodeURIComponent
const decodeHtml = (html?: string): string | undefined => {
  if (!html) return html;
  
  // Nếu input chứa %, chắc chắn là dữ liệu cũ (URL-encoded), SKIP decrypt
  if (html.includes('%')) {
    try {
      return decodeURIComponent(html);
    } catch {
      return html;
    }
  }
  
  // Kiểm tra nếu input là base64 (encrypted) - nếu không thì là plain text
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  const hasVietnamese = /[\u00C0-\u1EF9]/i.test(html);
  
  if (hasHtmlTags || hasVietnamese) {
    return html;
  }
  
  // Thử decrypt (cho dữ liệu MỚI - encrypted)
  try {
    const decrypted = csmDecrypt(html);
    // Kiểm tra nếu decrypt thành công: chứa HTML tags hợp lệ
    if (decrypted && typeof decrypted === 'string' && decrypted.length > 0) {
      // Nếu chứa HTML tag thì OK
      if (/<[a-z][\s\S]*>/i.test(decrypted)) {
        return decrypted;
      }
    }
  } catch {
    // Fallback below
  }
  
  // Fallback: return nguyên bản
  return html;
};

const sanitizeHtmlForRender = (html?: string): string => {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('script,iframe,object,embed,link[rel="import"]').forEach((node) => node.remove());

    const allElements = doc.body.querySelectorAll('*');
    allElements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();

        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }

        if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body.innerHTML;
  } catch {
    return html;
  }
};

// Helper functions to get translated property types and transaction types
const getTranslatedPropertyTypes = (t: any): string[] => {
  return [
    t('website.services.property_types.house', 'Nhà riêng'),
    t('website.services.property_types.apartment', 'Căn hộ'),
    t('website.services.property_types.land', 'Đất nền'),
    t('website.services.property_types.villa', 'Biệt thự'),
    t('website.services.property_types.townhouse', 'Nhà phố'),
    t('website.services.property_types.office', 'Văn phòng'),
    t('website.services.property_types.warehouse', 'Kho xưởng'),
    t('website.services.property_types.motel', 'Nhà trọ'),
    t('website.services.property_types.condotel', 'Condotel'),
  ];
};

const getTranslatedTransactionTypes = (t: any): string[] => {
  return [
    t('website.services.transaction_types.sell', 'Bán'),
    t('website.services.transaction_types.rent', 'Cho thuê'),
  ];
};

// Helper function to translate property type key to label
const translatePropertyType = (key: string, t: any): string => {
  const mapping: Record<string, string> = {
    'can-ho-chung-cu': t('website.services.property_types.apartment', 'Căn hộ'),
    'nha-rieng-nha-pho': t('website.services.property_types.house', 'Nhà riêng'),
    'biet-thu': t('website.services.property_types.villa', 'Biệt thự'),
    'dat-nen': t('website.services.property_types.land', 'Đất nền'),
    'shophouse': t('website.services.property_types.townhouse', 'Nhà phố'),
    'officetel': t('website.services.property_types.office', 'Văn phòng'),
    'condotel-resort-villa': t('website.services.property_types.condotel', 'Condotel'),
    'van-phong': t('website.services.property_types.office', 'Văn phòng'),
    'phong-tro-nha-tro': t('website.services.property_types.motel', 'Nhà trọ'),
  };
  return mapping[key] || key;
};

const { Title, Paragraph, Text } = Typography;

const SPECIAL_MENU_SLUGS = new Set([
  'thong-ke-ket-qua-xo-so',
  'hop-tac-kinh-doanh',
]);

export interface ServiceCategory {
  key: string;
  title: string;
  color: string;
  icon: React.ReactNode;
  description: string;
  content?: string;
  dynamicCodeName?: string;
}

const DEFAULT_KQXS_LANDING_CONTENT: Record<'vi' | 'en' | 'zh', string> = {
  vi: `
    <article>
      <h3>Thống Kê Kết Quả Xổ Số 3 Miền Theo Dữ Liệu Minh Bạch</h3>
      <p>Trang này tập trung vào thống kê công khai: giải đặc biệt theo tuần và theo tổng, tần suất lô tô, chu kỳ 100 ngày và so sánh dữ liệu theo từng miền.</p>
      <h4>1. Thống kê giải đặc biệt đa chiều</h4>
      <p>Người dùng có thể xem dữ liệu theo tuần, theo tổng, theo ngày và theo đài để theo dõi xu hướng thay đổi theo thời gian.</p>
      <h4>2. Tần suất lô tô và khoảng trễ</h4>
      <p>Hệ thống hỗ trợ thống kê tần suất xuất hiện và khoảng trễ để phục vụ mục đích tham khảo dữ liệu, không phải dự đoán cá cược.</p>
      <h4>3. Bộ lọc theo ngày, miền, đài</h4>
      <p>Có thể lọc theo ngày, thứ, miền và đài để truy xuất nhanh đúng lát cắt dữ liệu cần xem.</p>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px;margin:16px 0;">
        <strong>Tuyên bố pháp lý:</strong> Nội dung chỉ phục vụ tham khảo thống kê dữ liệu, không hỗ trợ cá cược và không khuyến khích hành vi vi phạm pháp luật.
      </div>
    </article>
  `,
  en: `
    <article>
      <h3>Three-Region Lottery Statistics With Transparent Data</h3>
      <p>This page focuses on public statistics: special-prize weekly/sum grouping, loto frequency, 100-day cycles, and cross-region comparisons.</p>
      <h4>1. Multi-angle special-prize analytics</h4>
      <p>Review data by week, by sum, by day, and by station to observe trend changes over time.</p>
      <h4>2. Loto frequency and gap intervals</h4>
      <p>The system highlights appearance frequency and gap intervals for data reference, not betting predictions.</p>
      <h4>3. Filters by date, region, and station</h4>
      <p>Use filters to quickly narrow down the exact data slice you need.</p>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px;margin:16px 0;">
        <strong>Legal note:</strong> This content is for statistical reference only and does not support gambling or illegal activity.
      </div>
    </article>
  `,
  zh: `
    <article>
      <h3>三地区彩票开奖数据统计（透明数据）</h3>
      <p>本页面聚焦公开统计：特别奖按周/按总和、号码频率、100天周期，以及跨地区对比。</p>
      <h4>1. 特别奖多维统计</h4>
      <p>可按星期、总和、日期、站点查看数据趋势变化。</p>
      <h4>2. 号码频率与遗漏间隔</h4>
      <p>系统展示出现频率与间隔，仅用于数据参考，不用于博彩预测。</p>
      <h4>3. 日期/地区/站点筛选</h4>
      <p>通过筛选快速定位你需要的数据切片。</p>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px;margin:16px 0;">
        <strong>法律声明：</strong> 本内容仅供统计参考，不支持赌博或任何违法行为。
      </div>
    </article>
  `,
};

import { extractLangAndSlug } from "../../utils/lang-slug";
import { slugify, normalizeServiceDetail } from "../../utils/normalize";

// Currency formatting for listing cards - ĐÃ XÓA, dùng formatPrice() từ wu_service.ts

// Helper to normalize legacy image URLs and provide consistent placeholders
const normalizeImageUrl = (url?: string): string | undefined => {
  if (!url) return url;
  if (url.includes('/images.shtml')) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const namePath = urlObj.searchParams.get('name');
      if (namePath && (/^\/?app_images\//.test(namePath) || /^https?:\/\//i.test(namePath))) {
        return namePath.startsWith('/') ? namePath : `/${namePath}`;
      }
    } catch (e) {
      console.error(`❌ Failed to parse URL:`, url, e);
    }
  }
  return url;
};

const isSvgDataPlaceholder = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  return url.trim().toLowerCase().startsWith('data:image/svg+xml');
};

const getMediaAssetPath = (url?: string): string => {
  if (!url || typeof url !== 'string') return '';
  try {
    if (url.includes('/images.shtml')) {
      const parsed = new URL(url, window.location.origin);
      return (parsed.searchParams.get('name') || url).trim();
    }
  } catch {
    return url.trim();
  }
  return url.trim();
};

const isLikelyVideoUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = getMediaAssetPath(url).split('?')[0].split('#')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v|m3u8|mpd)$/.test(clean);
};

const isLikelyImageUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  if (isSvgDataPlaceholder(url) || isLikelyVideoUrl(url)) return false;
  const clean = getMediaAssetPath(url).split('?')[0].split('#')[0].toLowerCase();
  // If extension is present, only allow known image extensions (including .thumb.jpg).
  if (/\.[a-z0-9]+$/.test(clean)) {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|thumb\.jpg)$/.test(clean);
  }
  // Extension-less CDN/API URLs are treated as image candidates.
  return true;
};

const parseMediaUrls = (value: any): string[] => {
  const toUrl = (u: unknown): string => {
    if (typeof u !== 'string') return '';
    return (normalizeImageUrl(u)?.trim() || '').trim();
  };

  const walk = (input: any, depth = 0): string[] => {
    if (depth > 3 || input == null) return [];
    if (Array.isArray(input)) return input.flatMap((item) => walk(item, depth + 1));
    if (typeof input === 'object') {
      return [input.url, input.src, input.path, input.name]
        .map((v) => toUrl(v))
        .filter((v) => v.length > 0);
    }
    if (typeof input === 'string') {
      const raw = input.trim();
      if (!raw) return [];
      try {
        return walk(JSON.parse(raw), depth + 1);
      } catch {
        const direct = toUrl(raw);
        return direct ? [direct] : [];
      }
    }
    return [];
  };

  return Array.from(new Set(walk(value).filter(Boolean)));
};

const deriveVideoThumbnailUrl = (videoUrl?: string): string => {
  if (!videoUrl || typeof videoUrl !== 'string') return '';
  const input = videoUrl.trim();
  if (!input) return '';

  try {
    if (input.includes('/images.shtml')) {
      const parsed = new URL(input, window.location.origin);
      const name = parsed.searchParams.get('name');
      if (name) {
        const cleanName = name.split('?')[0].split('#')[0];
        const dotIndex = cleanName.lastIndexOf('.');
        if (dotIndex > 0) {
          const thumbName = `${cleanName.slice(0, dotIndex)}.thumb.jpg`;
          parsed.searchParams.set('name', thumbName);
          return `${parsed.pathname}?${parsed.searchParams.toString()}`;
        }
      }
    }
  } catch {
    // Keep fallback path conversion below.
  }

  const clean = input.split('?')[0].split('#')[0];
  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return `${clean.slice(0, dotIndex)}.thumb.jpg`;
};

const svgPlaceholder = (label: string, w = 800, h = 520) => {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
      <defs>
        <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
          <stop offset='0%' stop-color='#f5f7fb'/>
          <stop offset='100%' stop-color='#e6f0ff'/>
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <g fill='#8aa0c7' font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle'>
        <text x='50%' y='48%' font-size='38' font-weight='700'>Hình minh họa</text>
        <text x='50%' y='60%' font-size='24' opacity='0.85'>${label || 'CSM'}</text>
      </g>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const getPrimaryImage = (post: ServicePost, categoryKey?: string) => {
  const placeholder = svgPlaceholder(post.title || categoryKey || 'CSM');

  const videoCandidates = Array.from(new Set([
    ...parseMediaUrls(post.videos),
    ...parseMediaUrls((post as any).album),
    ...parseMediaUrls((post as any).video),
    ...parseMediaUrls((post as any).video_url),
  ]))
    .filter((u) => !!u && !isSvgDataPlaceholder(u));

  const derivedThumbCandidates = videoCandidates
    .filter((u) => isLikelyVideoUrl(u))
    .map((u) => normalizeImageUrl(deriveVideoThumbnailUrl(u)) || '')
    .filter((u) => !!u && isLikelyImageUrl(u));

  // Priority 1: always prefer image fields first (including derived thumbnails from videos).
  const imageCandidates = [
    ...parseMediaUrls(post.thumbnail),
    ...parseMediaUrls((post as any).cover),
    ...parseMediaUrls(post.images),
    ...derivedThumbCandidates,
  ];
  const realImage = imageCandidates.find((u) => isLikelyImageUrl(u));

  if (realImage) {
    return { src: realImage, placeholder, type: 'image' as const };
  }

  // Priority 2: only when no image, use video as card cover.
  const videoUrl = videoCandidates.find(Boolean);
  if (videoUrl) {
    return { src: videoUrl, placeholder, type: 'video' as const };
  }
  
  // Fallback: placeholder
  return { src: placeholder, placeholder, type: 'image' as const };
};

// Helper function to render media (image or video) for card thumbnails
const renderCardMedia = (post: ServicePost, categoryKey: string, altText: string) => {
  const { src, placeholder, type } = getPrimaryImage(post, categoryKey);
  
  if (type === 'video') {
    return (
      <video
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        autoPlay
        onError={(e) => {
          // Fallback to placeholder image on video error
          const videoEl = e.currentTarget as HTMLVideoElement;
          videoEl.style.display = 'none';
          const img = document.createElement('img');
          img.src = placeholder;
          img.alt = altText;
          img.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;';
          videoEl.parentElement?.appendChild(img);
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }
  
  // Default: image
  return (
    <img
      alt={altText}
      src={src}
      loading="lazy"
      decoding="async"
      width={640}
      height={360}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = placeholder; }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
};

// Helper function to get multilingual field value
const getMultilingualField = (obj: any, fieldName: string, currentLang: string = 'vi'): string => {
  if (!obj) return '';
  
  // For Vietnamese, use field without suffix first
  if (currentLang === 'vi') {
    return obj[fieldName] || obj[`${fieldName}_vi`] || '';
  }
  
  // For other languages, use field with suffix, fallback to Vietnamese
  const langField = `${fieldName}_${currentLang}`;
  return obj[langField] || obj[fieldName] || obj[`${fieldName}_vi`] || '';
};

// Helper: get localized attribute (attributes_* like legalStatus, address, location)
const getAttrLocalized = (attrs: Record<string, any> | undefined, key: string, currentLang: string = 'vi'): string => {
  if (!attrs) return '';
  if (currentLang === 'vi') return attrs[key] || attrs[`${key}_vi`] || '';
  const langField = `${key}_${currentLang}`;
  return attrs[langField] || attrs[key] || attrs[`${key}_vi`] || '';
};

// Chuẩn hóa giá trị hiển thị, thay "N/A" và các placeholder khác bằng "Chưa cập nhật"
const PLACEHOLDER_MARKERS = ['n/a', 'na', 'n.a', 'null', 'undefined', 'dangcapnhat', 'dangcapnhat.', 'dangcapnhat..', 'dang cap nhat', 'updating', 'pending', '-', '--'];
const isMissingDisplayValue = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return true;
    const lower = trimmed.toLowerCase();
    if (/^n\/?a\b/.test(lower) || /^n\.a\b/.test(lower) || /^na\b/.test(lower)) return true;
    const sanitized = lower.replace(/[^a-z]/g, '');
    if (PLACEHOLDER_MARKERS.includes(sanitized)) return true;
    if (sanitized.startsWith('na')) return true;
    return false;
  }
  return false;
};

const normalizeDisplayValue = (value: any, t: any) => {
  if (isMissingDisplayValue(value)) return t('website.services.detail.not_available', 'Chưa cập nhật');
  return typeof value === 'string' ? value.trim() : value;
};

const resolveSupportedLang = (raw?: string | null): 'vi' | 'en' | 'zh' => {
  const norm = String(raw || '').trim().toLowerCase();
  if (norm.startsWith('en')) return 'en';
  if (norm.startsWith('zh')) return 'zh';
  return 'vi';
};

const resolveLangFromPathname = (pathname: string): 'vi' | 'en' | 'zh' => {
  const strippedPath = stripBasePathname(pathname);
  const first = String(strippedPath || '').trim().split('/').filter(Boolean)[0] || '';
  return resolveSupportedLang(first);
};

const stripBasePathname = (pathname: string): string => {
  const rawPath = pathname || '/';
  const base = String((import.meta as any)?.env?.BASE_URL || '/').trim();
  if (!base || base === '/') return rawPath;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  if (!normalizedBase || normalizedBase === '/') return rawPath;
  if (rawPath === normalizedBase) return '/';
  if (rawPath.startsWith(`${normalizedBase}/`)) {
    const stripped = rawPath.slice(normalizedBase.length);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return rawPath;
};

const localizePath = (path: string, rawLang?: string | null): string => {
  const lang = resolveSupportedLang(rawLang);
  const normalized = (path.startsWith('/') ? path : `/${path}`).replace(/\/+/g, '/');
  const withoutLangPrefix = normalized.replace(/^\/(vi|en|zh)(?=\/|$)/i, '') || '/';
  const basePath = withoutLangPrefix.startsWith('/') ? withoutLangPrefix : `/${withoutLangPrefix}`;
  if (lang === 'vi') return basePath;
  if (basePath === '/') return `/${lang}`;
  return `/${lang}${basePath}`;
};

const WuServicesPage: React.FC = () => {
  const { t, i18n: i18nInstance } = useTranslation();
  const location = useLocation();
  const FIXED_PAGE_SIZE = 12; // Backend cố định page size, frontend không gửi take/pageSize
  const [activeTabKey, setActiveTabKey] = useState('');
  // Cleanup query params: backend cố định take=12 nên xoá take/pageSize khỏi URL để tránh hiểu nhầm client đang set
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('take')) { url.searchParams.delete('take'); changed = true; }
    if (url.searchParams.has('pageSize')) { url.searchParams.delete('pageSize'); changed = true; }
    // Also remove lastkey from URL - backend now manages pagination via cache
    if (url.searchParams.has('lastkey')) { url.searchParams.delete('lastkey'); changed = true; }
    if (changed) {
      const newSearch = url.searchParams.toString();
      const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [location.pathname]);

  // Backend now manages pagination cache based on page number + search query
  // Client only needs to handle page number, backend provides nextCursor for next request
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hl = params.get("hl");
    const langFromPath = resolveLangFromPathname(location.pathname);
    const targetLang = hl ? resolveSupportedLang(hl) : langFromPath;
    if (hl === 'vi' || hl === 'en' || hl === 'zh') {
      const url = new URL(window.location.href);
      params.delete('hl');
      const cleanQuery = params.toString();
      const targetPath = localizePath(location.pathname, targetLang);
      const targetUrl = `${targetPath}${cleanQuery ? `?${cleanQuery}` : ''}${url.hash}`;
      window.location.replace(targetUrl);
      return;
    }
    if (i18n.language !== targetLang) {
      i18n.changeLanguage(targetLang);
    }
  }, [location.pathname, location.search]);

  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<ServicePost[]>([]);
  const [pagination, setPagination] = useState<Record<string, number>>({});
  const [beautyTypeFilter, setBeautyTypeFilter] = useState<'all' | 'my-pham' | 'spa'>('all');
  const [searchValues, setSearchValues] = useState<Record<string, Record<string, string>>>({});
  const [searchSubmitted, setSearchSubmitted] = useState<Record<string, boolean>>({});
  const [searchUsedServer, setSearchUsedServer] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [fallbackInitialData, setFallbackInitialData] = useState<any | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      try {
        setIsMobile(window.innerWidth <= 576);
      } catch {}
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  // Track initialization per category to avoid capturing URL params under wrong tab when SSR hydrates
  const initializedSearchFromUrl = useRef<Record<string, boolean>>({});
  // Cache last applied search string per category so reload/back/forward rehydrates form values reliably
  const searchQueryCache = useRef<Record<string, string>>({});
  const BRIDGE_DEFAULT_CATEGORY = 'phan-mem';
  const BRIDGE_CONTEXT_STORAGE_KEY = 'csm_bridge_context';

  const initialReactData = useMemo(() => {
    const w: any = typeof window !== 'undefined' ? window : undefined;
    return (w && (w.__INITIAL_REACT_DATA__ || w.initialReactData)) || fallbackInitialData || null;
  }, [fallbackInitialData]);

  const resolveBackendSSRBaseUrl = () => {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === 'localhost' || host === '127.0.0.1') && (port === '3333' || port === '5173')) {
      return 'http://localhost:9999';
    }
    return window.location.origin;
  };

  const extractInitialDataFromHtml = (html: string): any | null => {
    if (!html || typeof html !== 'string') return null;
    const marker = 'window.__INITIAL_REACT_DATA__=';
    const start = html.indexOf(marker);
    if (start < 0) return null;

    const from = start + marker.length;
    const scriptEnd = html.indexOf('</script>', from);
    if (scriptEnd < 0) return null;
    const segment = html.slice(from, scriptEnd);
    const semicolonPos = segment.lastIndexOf(';');
    const raw = (semicolonPos >= 0 ? segment.slice(0, semicolonPos) : segment).trim();
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const fetchSSRInitialDataByPath = useCallback(async (pathname: string, rawSearch = ''): Promise<any | null> => {
    try {
      const base = resolveBackendSSRBaseUrl();
      if (!base) return null;
      const url = new URL(`${base}${pathname}${rawSearch || ''}`);
      if (base.includes('localhost:9999')) {
        url.searchParams.set('__host', window.location.host || 'localhost:3333');
      }
      const resp = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (!resp.ok) return null;
      const html = await resp.text();
      return extractInitialDataFromHtml(html);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const w: any = typeof window !== 'undefined' ? window : undefined;
    const hasInlineData = Boolean(w && (w.__INITIAL_REACT_DATA__ || w.initialReactData));
    if (hasInlineData) {
      return;
    }

    const loadSSRDataFromBackend = async () => {
      try {
        const parsed = await fetchSSRInitialDataByPath(window.location.pathname, window.location.search || '');
        if (!cancelled && parsed && typeof parsed === 'object') {
          setFallbackInitialData(parsed);
        }
      } catch {
        // Keep UI resilient with existing category/content fallback.
      }
    };

    void loadSSRDataFromBackend();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, fetchSSRInitialDataByPath]);

  // Per-user session id to keep pagination & search stable
  const getSessionId = () => {
    try {
      let sid = localStorage.getItem('csm_sid');
      if (!sid || sid.trim() === '') {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('csm_sid', sid);
      }
      return sid;
    } catch {
      return 'sid-' + Date.now().toString(36);
    }
  };

  const renderPaginationTotal = useCallback(
    (total: number, range: [number, number]) =>
      t(
        'website.services.pagination.total',
        'Hiển thị {{start}}-{{end}} của {{total}} kết quả',
        { start: range[0], end: range[1], total }
      ),
    [t]
  );

  const parseNum = (val: any): number | undefined => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      let s = val.toLowerCase();
      s = s.replace(/(\d+)\s*tỷ/gi, (_, n) => (Number(n) * 1000000000).toString());
      s = s.replace(/(\d+(?:\.\d+)?)\s*m/gi, (_, n) => (Number(n) * 1000000).toString());
      s = s.replace(/(\d+(?:\.\d+)?)\s*k/gi, (_, n) => (Number(n) * 1000).toString());
      s = s.replace(/m²|vnd|đ|dong|\/\s*ngày/gi, '');
      s = s.replace(/[^0-9.]/g, '');
      const num = Number(s);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  };

  const normalizeSearchText = (text: string) => {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  };

  const matchSmartKeywords = (haystack: string, query?: string) => {
    if (!query || query.trim() === '') return true;
    const normalizedHaystack = normalizeSearchText(haystack);
    const tokens = query
      .split(/[\s,.;/\\-]+/)
      .map(t => normalizeSearchText(t))
      .filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.every(token => normalizedHaystack.includes(token));
  };

  const matchKeywordPriority = (title: string, haystack: string, query?: string) => {
    if (!query || query.trim() === '') return true;
    const normalizedQuery = normalizeSearchText(query);
    const normalizedTitle = normalizeSearchText(title || '');
    if (normalizedTitle.includes(normalizedQuery)) return true; // ưu tiên khớp tiêu đề
    return matchSmartKeywords(haystack, query);
  };

  // Security: Sanitize input to prevent XSS attacks
  const sanitizeInput = (input: string): string => {
    if (!input) return '';
    
    // Remove potentially dangerous characters and scripts
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
      .replace(/<\/?[^>]+(>|$)/g, ''); // Remove all HTML tags
    
    // Limit length to prevent buffer overflow
    const MAX_LENGTH = 500;
    if (sanitized.length > MAX_LENGTH) {
      sanitized = sanitized.substring(0, MAX_LENGTH);
    }
    
    return sanitized.trim();
  };

  // Security: Validate search params
  const validateSearchParams = (params: Record<string, string>): { valid: boolean; error?: string } => {
    const DANGEROUS_PATTERNS = [
      /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i, // SQL injection patterns
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+\w+\s+set/i,
      /exec\s*\(/i,
      /script\s*:/i,
      /<script/i,
    ];

    for (const [key, value] of Object.entries(params)) {
      if (!value) continue;
      
      // Check for SQL injection and XSS patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(value)) {
          console.warn('⚠️ Suspicious input detected:', key, value);
          return { valid: false, error: 'Invalid search parameters detected' };
        }
      }
      
      // Validate key names (only allow alphanumeric and underscore)
      if (!/^[a-zA-Z0-9_]+$/.test(key)) {
        console.warn('⚠️ Invalid parameter key:', key);
        return { valid: false, error: 'Invalid parameter name' };
      }
    }
    
    return { valid: true };
  };

  // Smart parser: tự động phân tích text input và điền các trường tìm kiếm
  const parseSmartSearch = (categoryKey: string, text: string): Record<string, string> => {
    const parsed: Record<string, string> = {};
    const lower = text.toLowerCase().trim();
    
    if (categoryKey === 'bat-dong-san') {
      // Phân tích giá: "2 tỷ", "500 triệu", "10-20 triệu", "500tr-1ty"
      const pricePatterns = [
        /(?:từ\s+)?(\d+(?:[.,]\d+)?)\s*(?:-|đến|->)\s*(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty|billion)/gi,
        /(?:từ\s+)?(\d+(?:[.,]\d+)?)\s*(?:-|đến|->)\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|tr|million)/gi,
        /(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty|billion)/gi,
        /(\d+(?:[.,]\d+)?)\s*(?:triệu|tr|million)/gi,
      ];
      
      let matchedPrice = false;
      for (const pattern of pricePatterns) {
        const matches = [...text.matchAll(pattern)];
        if (matches.length > 0) {
          const match = matches[0];
          if (match[2]) { // Có khoảng
            const isBillion = /tỷ|ty|billion/i.test(match[0]);
            parsed.price_min = match[1].replace(',', '.');
            parsed.price_max = match[2].replace(',', '.');
            matchedPrice = true;
          } else if (match[1]) { // Giá đơn
            const val = match[1].replace(',', '.');
            const isBillion = /tỷ|ty|billion/i.test(match[0]);
            // Nếu chỉ có 1 giá, set làm max để tìm "dưới giá này"
            parsed.price_max = val;
            matchedPrice = true;
          }
          if (matchedPrice) break;
        }
      }
      
      // Phân tích diện tích: "100m2", "50-80 m²", "100-150m2"
      const areaPatterns = [
        /(?:từ\s+)?(\d+(?:[.,]\d+)?)\s*(?:-|đến|->)\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²|mét vuông)/gi,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|mét vuông)/gi,
      ];
      
      for (const pattern of areaPatterns) {
        const matches = [...text.matchAll(pattern)];
        if (matches.length > 0) {
          const match = matches[0];
          if (match[2]) {
            parsed.area_min = match[1].replace(',', '.');
            parsed.area_max = match[2].replace(',', '.');
          } else if (match[1]) {
            parsed.area_max = match[1].replace(',', '.');
          }
          break;
        }
      }
      
      // Phân tích phòng ngủ: "2pn", "3 phòng ngủ", "2-3pn"
      const bedroomMatch = lower.match(/(\d+)\s*(?:pn|phòng ngủ|bedroom)/i);
      if (bedroomMatch) parsed.bedrooms = bedroomMatch[1];
      
      // Phân tích loại giao dịch
      if (/\b(cần bán|bán|mua|sale)\b/i.test(lower)) {
        parsed.transactionType = 'Bán';
      } else if (/\b(cho thuê|thuê|rent)\b/i.test(lower)) {
        parsed.transactionType = 'Cho thuê';
      }
      
      // Phân tích loại hình BĐS
      const propertyTypes = [
        { pattern: /\b(căn hộ|chung cư|apartment)\b/i, value: 'Căn hộ chung cư' },
        { pattern: /\b(nhà phố|nhà riêng|townhouse)\b/i, value: 'Nhà riêng/nhà phố' },
        { pattern: /\b(biệt thự|villa)\b/i, value: 'Biệt thự' },
        { pattern: /\b(đất nền|đất|land)\b/i, value: 'Đất nền' },
        { pattern: /\b(shophouse)\b/i, value: 'Shophouse' },
        { pattern: /\b(officetel)\b/i, value: 'Officetel' },
      ];
      
      for (const { pattern, value } of propertyTypes) {
        if (pattern.test(lower)) {
          parsed.propertyType = value;
          break;
        }
      }
      
      // Địa chỉ: lấy phần còn lại (loại bỏ số và ký tự đặc biệt đã parse)
      const addressText = text
        .replace(/\d+(?:[.,]\d+)?\s*(?:tỷ|ty|triệu|tr|m2|m²|pn|phòng)/gi, '')
        .replace(/(?:cần bán|bán|cho thuê|thuê|căn hộ|chung cư|nhà phố|biệt thự|đất)/gi, '')
        .replace(/[,;-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (addressText && addressText.length > 2) {
        parsed.address = addressText;
      }
    }
    
    if (categoryKey === 'cho-thue-xe') {
      // Phân tích giá thuê xe: "500k", "1tr/ngày", "500-800k"
      const pricePatterns = [
        /(?:từ\s+)?(\d+(?:[.,]\d+)?)\s*(?:-|đến|->)\s*(\d+(?:[.,]\d+)?)\s*(?:k|tr|triệu|nghìn)/gi,
        /(\d+(?:[.,]\d+)?)\s*(?:k|tr|triệu|nghìn)/gi,
      ];
      
      for (const pattern of pricePatterns) {
        const matches = [...text.matchAll(pattern)];
        if (matches.length > 0) {
          const match = matches[0];
          if (match[2]) {
            parsed.price_min = match[1].replace(',', '.');
            parsed.price_max = match[2].replace(',', '.');
          } else if (match[1]) {
            parsed.price_max = match[1].replace(',', '.');
          }
          break;
        }
      }
      
      // Phân tích số chỗ: "4 chỗ", "7chỗ"
      const seatsMatch = lower.match(/(\d+)\s*(?:chỗ|seat)/i);
      if (seatsMatch) parsed.seats = seatsMatch[1];
      
      // Phân tích loại xe
      const carTypes = [
        { pattern: /\b(sedan|se dan)\b/i, value: 'Sedan' },
        { pattern: /\b(suv)\b/i, value: 'SUV' },
        { pattern: /\b(mpv|van)\b/i, value: 'MPV' },
        { pattern: /\b(bán tải|pickup)\b/i, value: 'Bán tải' },
        { pattern: /\b(xe cưới|wedding)\b/i, value: 'Xe cưới' },
      ];
      
      for (const { pattern, value } of carTypes) {
        if (pattern.test(lower)) {
          parsed.carType = value;
          break;
        }
      }
    }
    
    return parsed;
  };
  // Lĩnh vực mặc định
  const DEFAULT_CATEGORY = getDefaultCategorySlug();
  const menuItems = useWebsiteMenu();

  // Hiển thị các filter đang áp dụng dưới dạng tag + nút xóa tất cả
  function ActiveFilters({ categoryKey, color }: { categoryKey: string; color: string }) {
    const submitted = searchSubmitted[categoryKey];
    const values = searchValues[categoryKey] || {};
    const activeEntries = Object.entries(values).filter(([_, v]) => v !== undefined && v !== '');
    if (!submitted || activeEntries.length === 0) return null;
    const removeFilter = (key: string) => {
      setSearchValues(prev => ({ ...prev, [categoryKey]: { ...prev[categoryKey], [key]: '' } }));
      // Giữ submitted = true để không cần nhấn lại tìm kiếm
      setSearchSubmitted(prev => ({ ...prev, [categoryKey]: true }));
    };
    const clearAll = () => {
      setSearchValues(prev => ({ ...prev, [categoryKey]: {} }));
      setSearchSubmitted(prev => ({ ...prev, [categoryKey]: true }));
    };
    return (
      <div style={{ margin: '4px 0 12px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }} aria-label="active-filters">
        {activeEntries.map(([k, v]) => (
          <Tag
            key={k}
            closable
            onClose={(e) => { e.preventDefault(); removeFilter(k); }}
            color={color}
            style={{ padding: '4px 10px', borderRadius: 6 }}
          >
            <b>{k}</b>: {v}
          </Tag>
        ))}
        <Button size="small" onClick={clearAll} style={{ alignSelf: 'center' }}>
          {t('website.services.filters.clear_all', 'Xóa tất cả')}
        </Button>
      </div>
    );
  }

  // Strict SSR category mapping: use only SSR fields (color, icon, description, category, slug)
  const iconMap: Record<string, React.ReactNode> = {
    CalendarOutlined: <CalendarOutlined />,
    CarOutlined: <CarOutlined />,
    EnvironmentOutlined: <EnvironmentOutlined />,
    StarOutlined: <StarOutlined />,
    CodeOutlined: <CodeOutlined />,
  };
  const defaultCategories = [
    {
      color: "#1890ff",
      icon: "CodeOutlined",
      description: "Giải pháp phần mềm, ứng dụng quản lý, tự động hóa, ERP, CRM, ...",
      description_en: "Software solutions, management applications, automation, ERP, CRM, ...",
      description_zh: "软件解决方案、管理应用、自动化、ERP、CRM 等。",
      category: "Phần Mềm",
      category_en: "Software",
      category_zh: "软件",
      slug: "phan-mem",
      group_slug: "root",
      is_group_slug: false,
    },
    {
      color: "#13c2c2",
      icon: "EnvironmentOutlined",
      description: "Tin tức, dự án, mua bán, cho thuê nhà đất, căn hộ, biệt thự, ...",
      description_en: "News, projects, buying, selling and renting land, apartments and villas, ...",
      description_zh: "房产资讯、项目，以及土地、公寓、别墅买卖与租赁信息。",
      category: "Bất Động Sản",
      category_en: "Real Estate",
      category_zh: "房地产",
      slug: "bat-dong-san",
      group_slug: "root",
      is_group_slug: false,
    },
    {
      color: "#eb2f96",
      icon: "StarOutlined",
      description: "Sản phẩm làm đẹp, spa, thẩm mỹ viện, thương hiệu mỹ phẩm, ...",
      description_en: "Beauty products, spa services, cosmetic clinics and beauty brands, ...",
      description_zh: "美容产品、水疗、医美机构与美妆品牌等内容。",
      category: "Mỹ Phẩm & Làm Đẹp",
      category_en: "Beauty & Cosmetics",
      category_zh: "美容与化妆品",
      slug: "lam-dep-my-pham",
      group_slug: "root",
      is_group_slug: false,
    },
    {
      color: "#1890ff",
      icon: "CarOutlined",
      description: "Dịch vụ thuê xe tự lái, có lái, xe du lịch, xe cưới hỏi, ...",
      description_en: "Self-drive and chauffeured car rental, tourism cars and wedding transport, ...",
      description_zh: "自驾与带司机租车、旅游用车、婚庆用车等服务。",
      category: "Cho Thuê Xe 4-7 Chỗ",
      category_en: "Car Rental (4-7 Seats)",
      category_zh: "4-7座租车服务",
      slug: "cho-thue-xe",
      group_slug: "root",
      is_group_slug: false,
    },
    {
      color: "#faad14",
      icon: "CalendarOutlined",
      description: "Đặt lịch khám bệnh, làm đẹp, sự kiện, dịch vụ tiện ích, ...",
      description_en: "Booking for medical visits, beauty services, events and other convenience services, ...",
      description_zh: "预约就医、美容、活动及各类生活服务。",
      category: "Đặt Lịch Online",
      category_en: "Online Booking",
      category_zh: "在线预约",
      slug: "booking-online",
      group_slug: "root",
      is_group_slug: false,
    },
    {
      color: "#722ed1",
      icon: "CalendarOutlined",
      description: "Thống kê và tổng hợp dữ liệu kết quả xổ số theo ngày, đài và miền.",
      description_en: "Statistics and aggregation of lottery results by day, station and region.",
      description_zh: "按日期、站点与区域汇总彩票开奖结果统计。",
      content: DEFAULT_KQXS_LANDING_CONTENT.vi,
      content_en: DEFAULT_KQXS_LANDING_CONTENT.en,
      content_zh: DEFAULT_KQXS_LANDING_CONTENT.zh,
      category: "Thống Kê Kết Quả Xổ Số",
      category_en: "Lottery Statistics",
      category_zh: "彩票统计",
      slug: "thong-ke-ket-qua-xo-so",
      group_slug: "root",
      is_group_slug: false,
    },
    {
      color: "#13c2c2",
      icon: "EnvironmentOutlined",
      description: "Hợp tác kinh doanh các lĩnh vực online trên cùng nền tảng.",
      description_en: "Business partnership across online service verticals on one shared platform.",
      description_zh: "在同一平台开展多行业线上商业合作。",
      category: "Hợp Tác Kinh Doanh",
      category_en: "Business Partnership",
      category_zh: "商业合作",
      slug: "hop-tac-kinh-doanh",
      group_slug: "root",
      is_group_slug: false,
    }
  ];
  // SSR categories injected from backend
  const ssrCategories = (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) ? window.__SSR_WEBSITE_CATEGORIES__ : [];
  // Type guard cho category chuẩn hóa
  function isSSRCategory(cat: any): cat is { color: string; icon: string; description: string; category: string; slug: string; group_slug: string; is_group_slug: boolean } {
    return cat && typeof cat === 'object' && 'color' in cat && 'icon' in cat && 'description' in cat && 'category' in cat && 'slug' in cat && 'group_slug' in cat && typeof cat.group_slug === 'string' && 'is_group_slug' in cat && typeof cat.is_group_slug === 'boolean';
  }
  const pickServiceCategories = (cats: any[]) =>
    cats.filter(cat => typeof cat === 'object' && isSSRCategory(cat) && cat.group_slug !== '' && cat.is_group_slug === false);

  const ssrServiceCategories = pickServiceCategories(ssrCategories);
  const validCategories = ssrServiceCategories.length > 0
    ? ssrServiceCategories
    : pickServiceCategories(defaultCategories as any[]);
  
  // SSR current service category meta injected via initialReactData (for the current route)
  const ssrServiceCategory = (initialReactData && initialReactData.serviceCategory)
    ? initialReactData.serviceCategory
    : undefined;

  // FIXED: Build allCategories with language-aware title selection using useMemo (like wu_menu.tsx)
  const allCategories: ServiceCategory[] = useMemo(() => {
    const currentLang = i18n.language || 'vi-VN';
    return validCategories.map(cat => {
      // Select title based on current language
      let categoryTitle = '';
      if (currentLang.includes('en')) {
        categoryTitle = (cat as any).category_en && (cat as any).category_en.trim()
          ? (cat as any).category_en
          : (typeof cat !== 'string' ? cat.category : '');
      } else if (currentLang.includes('zh')) {
        categoryTitle = (cat as any).category_zh && (cat as any).category_zh.trim()
          ? (cat as any).category_zh
          : (typeof cat !== 'string' ? cat.category : '');
      } else {
        // Default to Vietnamese
        categoryTitle = typeof cat !== 'string' ? cat.category : '';
      }
      
      // Select description based on current language
      let categoryDescription = '';
      if (currentLang.includes('en')) {
        categoryDescription = (cat as any).description_en && (cat as any).description_en.trim()
          ? (cat as any).description_en
          : (typeof cat !== 'string' ? cat.description : '');
      } else if (currentLang.includes('zh')) {
        categoryDescription = (cat as any).description_zh && (cat as any).description_zh.trim()
          ? (cat as any).description_zh
          : (typeof cat !== 'string' ? cat.description : '');
      } else {
        // Default to Vietnamese
        categoryDescription = typeof cat !== 'string' ? cat.description : '';
      }
      // Prefer language-specific content when available; fallback to base content.
      let content = '';
      if (typeof cat !== 'string') {
        if (currentLang.includes('en')) {
          content = ((cat as any).content_en && String((cat as any).content_en).trim())
            ? (cat as any).content_en
            : ((cat as any).content || '');
        } else if (currentLang.includes('zh')) {
          content = ((cat as any).content_zh && String((cat as any).content_zh).trim())
            ? (cat as any).content_zh
            : ((cat as any).content || '');
        } else {
          content = (cat as any).content || '';
        }
      }
      return {
        key: typeof cat !== 'string' ? cat.slug : '',
        title: categoryTitle,
        color: typeof cat !== 'string' ? (cat.color || "#13c2c2") : "#13c2c2",
        icon: typeof cat !== 'string' ? (iconMap[cat.icon] || <CodeOutlined />) : <CodeOutlined />,
        description: categoryDescription,
        content,
        dynamicCodeName: typeof cat !== 'string' ? ((cat as any).dynamic_code_name || (cat as any).auto_code_name || '') : '',
      };
    });
  }, [i18n.language, ssrServiceCategory]);

  // Helper: get header meta for a given category key, prefer SSR current serviceCategory
  // 🔧 FIX: Support multi-language description from SSR category object
  const getHeaderMeta = (categoryKey: string) => {
    const currentLang = i18n.language || 'vi-VN';
    
    // Try precise match from ssrServiceCategory (provided for current slug)
    if (ssrServiceCategory && typeof ssrServiceCategory === 'object') {
      const slug = String(ssrServiceCategory.slug || '').trim();
      if (slug && slug === categoryKey) {
        const iconVal = ssrServiceCategory.icon;
        const iconNode = typeof iconVal === 'string'
          ? (iconMap[iconVal] || (/^https?:\/\//.test(iconVal) || iconVal.startsWith('/') ? <img alt="" src={iconVal} style={{ width: 24, height: 24 }} /> : <CodeOutlined />))
          : <CodeOutlined />;
        
        // Extract language-specific title and description
        let title = '';
        let description = '';
        
        if (currentLang.includes('en')) {
          title = (ssrServiceCategory as any).category_en && (ssrServiceCategory as any).category_en.trim()
            ? (ssrServiceCategory as any).category_en
            : (ssrServiceCategory.category || ssrServiceCategory.title || '');
          description = (ssrServiceCategory as any).description_en && (ssrServiceCategory as any).description_en.trim()
            ? (ssrServiceCategory as any).description_en
            : (ssrServiceCategory.description || '');
        } else if (currentLang.includes('zh')) {
          title = (ssrServiceCategory as any).category_zh && (ssrServiceCategory as any).category_zh.trim()
            ? (ssrServiceCategory as any).category_zh
            : (ssrServiceCategory.category || ssrServiceCategory.title || '');
          description = (ssrServiceCategory as any).description_zh && (ssrServiceCategory as any).description_zh.trim()
            ? (ssrServiceCategory as any).description_zh
            : (ssrServiceCategory.description || '');
        } else {
          // Default to Vietnamese
          title = ssrServiceCategory.category || ssrServiceCategory.title || '';
          description = ssrServiceCategory.description || '';
        }
        
        let content = '';
        if (currentLang.includes('en')) {
          content = ((ssrServiceCategory as any).content_en && String((ssrServiceCategory as any).content_en).trim())
            ? (ssrServiceCategory as any).content_en
            : ((ssrServiceCategory as any).content || '');
        } else if (currentLang.includes('zh')) {
          content = ((ssrServiceCategory as any).content_zh && String((ssrServiceCategory as any).content_zh).trim())
            ? (ssrServiceCategory as any).content_zh
            : ((ssrServiceCategory as any).content || '');
        } else {
          content = (ssrServiceCategory as any).content || '';
        }
        const dynamicCodeName = '';
        const dynamicCode = '';
        
        return {
          key: categoryKey,
          title,
          description,
          color: ssrServiceCategory.color || '#13c2c2',
          icon: iconNode,
          content,
          dynamicCodeName,
          dynamicCode,
        } as ServiceCategory;
      }
    }
    // Fallback to existing allCategories (built from SSR categories list, already language-aware)
    const found = allCategories.find(c => c.key === categoryKey);
    return found || { key: categoryKey, title: '', description: '', content: '', color: '#13c2c2', icon: <CodeOutlined /> } as ServiceCategory;
  };

  const resolveLangCode = (rawLang: string): 'vi' | 'en' | 'zh' => {
    const lower = String(rawLang || '').toLowerCase();
    if (lower.includes('en')) return 'en';
    if (lower.includes('zh')) return 'zh';
    return 'vi';
  };

  // Ensure landing content is always visible:
  // 1) SSR serviceCategory.content
  // 2) Landing article from serviceDetailList (post content)
  // 3) Built-in default template for critical pages (KQXS)
  const resolveCategoryLandingContent = (categoryKey: string): string => {
    const langCode = resolveLangCode(i18n.language || 'vi');
    const categoryPosts = getPostsByServiceType(categoryKey);

    const landingPost = categoryPosts.find((post) => Boolean((post as any).featured))
      || categoryPosts.find((post) => String(post?.content || '').trim().length > 0);

    const fromPost = landingPost
      ? String(getMultilingualField(landingPost, 'content', langCode) || landingPost.content || '').trim()
      : '';

    const fromMeta = String(
      getHeaderMeta(categoryKey)?.content
      || (categoryKey === (slug || '') ? (initialReactData?.pageContent || '') : '')
      || ''
    ).trim();

    // Lottery landing is managed by uploaded content entries, so prefer post content over category CMS text.
    if (categoryKey === 'thong-ke-ket-qua-xo-so') {
      if (fromPost) return fromPost;
      if (fromMeta) return fromMeta;
      return DEFAULT_KQXS_LANDING_CONTENT[langCode];
    }

    if (fromMeta) return fromMeta;
    if (fromPost) return fromPost;

    return '';
  };

  // Định nghĩa các trường tìm kiếm đặc thù cho từng lĩnh vực, dùng đa ngôn ngữ
  // Mở rộng form tìm kiếm: hỗ trợ khoảng (min/max) và giới hạn nhập số cho trường số
  // Dùng useMemo để re-create khi ngôn ngữ thay đổi
  const searchFields: Record<string, Array<{ key: string; label: string; type?: string; options?: string[]; input?: 'text' | 'number' }>> = useMemo(() => ({
    "phan-mem": [
      { key: "q", label: t('website.services.search_by_title', 'Từ khóa, mô tả...'), input: 'text' },
      { key: "category", label: t('website.services.search.service_type', 'Loại dịch vụ'), input: 'text' },
      { key: "platform", label: t('website.services.search.platform', 'Nền tảng'), input: 'text' },
      { key: "price_min", label: t('website.services.search.price_min', 'Giá từ'), input: 'number' },
      { key: "price_max", label: t('website.services.search.price_max', 'Giá đến'), input: 'number' },
    ],
    "bat-dong-san": [
      { key: "q", label: t('website.services.search_by_title', 'Tìm kiếm thông minh (địa chỉ, loại hình, giá, diện tích...)'), input: 'text' },
      { key: "propertyType", label: t('website.services.search.property_type', 'Loại hình BĐS'), type: "select", options: [
        t('website.services.search.all', 'Tất cả'),
        ...getTranslatedPropertyTypes(t)
      ] },
      { key: "transactionType", label: t('website.services.search.transaction_type', 'Loại giao dịch'), type: "select", options: [
        t('website.services.search.all', 'Tất cả'),
        ...getTranslatedTransactionTypes(t)
      ] },
      { key: "address", label: t('website.services.search.location', 'Vị trí'), input: 'text' },
      { key: "area_min", label: t('website.services.search.area_min', 'Diện tích từ (m²)'), input: 'number' },
      { key: "area_max", label: t('website.services.search.area_max', 'Diện tích đến (m²)'), input: 'number' },
      { key: "price_min", label: t('website.services.search.price_min', 'Giá từ (triệu/tỷ)'), input: 'number' },
      { key: "price_max", label: t('website.services.search.price_max', 'Giá đến (triệu/tỷ)'), input: 'number' },
      { key: "bedrooms", label: t('website.services.search.bedrooms', 'Phòng ngủ'), input: 'number' },
      { key: "bathrooms", label: t('website.services.search.bathrooms', 'Phòng tắm'), input: 'number' },
      { key: "floors", label: t('website.services.search.floors', 'Số tầng'), input: 'number' },
      { key: "frontWidth", label: t('website.services.search.front_width', 'Mặt tiền (m)'), input: 'number' },
      { key: "legalStatus", label: t('website.services.search.legal_status', 'Pháp lý'), type: "select", options: [
        t('website.services.search.all', 'Tất cả'),
        t('website.services.search.legal.pink_book', 'Sổ hồng'),
        t('website.services.search.legal.red_book', 'Sổ đỏ'),
        t('website.services.search.legal.other', 'Giấy tờ khác')
      ] },
      { key: "furnished", label: t('website.services.search.furnished', 'Nội thất'), type: "select", options: [
        t('website.services.search.all', 'Tất cả'),
        t('website.services.search.furnished_yes', 'Có nội thất'),
        t('website.services.search.furnished_no', 'Không nội thất')
      ] },
    ],
    "lam-dep-my-pham": [
      { key: "q", label: t('website.services.search_by_title', 'Từ khóa, mô tả...'), input: 'text' },
      { key: "brand", label: t('website.services.search.brand', 'Thương hiệu'), input: 'text' },
      { key: "origin", label: t('website.services.search.origin', 'Xuất xứ'), input: 'text' },
      { key: "price_min", label: t('website.services.search.price_min', 'Giá từ'), input: 'number' },
      { key: "price_max", label: t('website.services.search.price_max', 'Giá đến'), input: 'number' },
    ],
    "cho-thue-xe": [
      { key: "q", label: t('website.services.search_by_title', 'Tìm kiếm thông minh (loại xe, số chỗ, giá...)'), input: 'text' },
      { key: "carType", label: t('website.services.search.car_type', 'Loại xe'), input: 'text' },
      { key: "seats", label: t('website.services.search.seats', 'Số chỗ'), input: 'number' },
      { key: "fuelType", label: t('website.services.search.fuel_type', 'Nhiên liệu'), input: 'text' },
      { key: "price_min", label: t('website.services.search.price_min', 'Giá từ'), input: 'number' },
      { key: "price_max", label: t('website.services.search.price_max', 'Giá đến'), input: 'number' },
    ],
    "booking-online": [
      { key: "q", label: t('website.services.search_by_title', 'Từ khóa, mô tả...'), input: 'text' },
      { key: "date", label: t('website.services.search.date', 'Ngày'), input: 'text' },
      { key: "location", label: t('website.services.search.location', 'Địa điểm'), input: 'text' },
      { key: "price_min", label: t('website.services.search.price_min', 'Giá từ'), input: 'number' },
      { key: "price_max", label: t('website.services.search.price_max', 'Giá đến'), input: 'number' },
    ]
  }), [i18nInstance.language, t]);

  const filterPostsForCategory = (
    categoryKey: string,
    posts: ServicePost[],
    searchObj: Record<string, string>,
    submitted: boolean
  ): ServicePost[] => {
    if (!submitted || !Object.values(searchObj).some(Boolean)) return posts;
    const currentLang = i18nInstance.language || 'vi';

    const scalePriceInput = (catKey: string, raw?: string): number | undefined => {
      if (!raw) return undefined;
      const n = Number(raw);
      if (isNaN(n)) return undefined;
      if (catKey === 'bat-dong-san') return n * 1000000000;
      if (catKey === 'cho-thue-xe' || catKey === 'booking-online' || catKey === 'lam-dep-my-pham') return n * 1000;
      return n;
    };

    const propertyTypeMap: Record<string, string> = {
      'căn hộ chung cư': 'can-ho-chung-cu',
      'nhà riêng/nhà phố': 'nha-rieng-nha-pho',
      'biệt thự': 'biet-thu',
      'đất nền': 'dat-nen',
      'shophouse': 'shophouse',
      'officetel': 'officetel',
      'condotel/resort villa': 'condotel-resort-villa',
      'văn phòng cho thuê': 'van-phong',
      'phòng trọ/nhà trọ': 'phong-tro-nha-tro',
    };

    return posts.filter(post => {
      const attrs = post.attributes || {};
      const postTitle = getMultilingualField(post, 'title', currentLang);
      const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);

      const priceValCommon = attrs.priceValue ?? parseNum(attrs.price);

      if (categoryKey === 'phan-mem') {
        const priceVal = priceValCommon;
        const min = scalePriceInput(categoryKey, searchObj.price_min);
        const max = scalePriceInput(categoryKey, searchObj.price_max);
        const matchRange = (!min || (priceVal !== undefined && priceVal >= min)) && (!max || (priceVal !== undefined && priceVal <= max));
        const catLabel = getCategoryLabel(post.category)?.toLowerCase?.() || '';
        const searchText = ((postTitle || '') + ' ' + (postExcerpt || ''));
        return matchKeywordPriority(postTitle, searchText, searchObj.q) &&
          (!searchObj.category || post.category?.toLowerCase().includes(searchObj.category.toLowerCase()) || catLabel.includes(searchObj.category.toLowerCase())) &&
          (!searchObj.platform || (attrs.platform && attrs.platform.toString().toLowerCase().includes(searchObj.platform.toLowerCase()))) &&
          matchRange;
      }

      if (categoryKey === 'bat-dong-san') {
        const matchesPropertyType = (() => {
          if (!searchObj.propertyType || searchObj.propertyType.toLowerCase().includes('tất')) return true;
          const normalizeText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const searchKey = propertyTypeMap[searchObj.propertyType.toLowerCase()];
          const postPropertyType = (attrs.propertyType || '').toString().toLowerCase();
          if (searchKey && postPropertyType === searchKey) return true;
          const postPropertyTypeNormalized = normalizeText(postPropertyType);
          return postPropertyTypeNormalized === normalizeText(searchKey || '');
        })();

        const transactionTypeRaw = (attrs.transactionType || attrs.listingType || attrs.type || '').toString().toLowerCase();
        const matchesTransactionType = (() => {
          const searchType = searchObj.transactionType || searchObj.type;
          if (!searchType || searchType.toLowerCase().includes('tất')) return true;
          const q = searchType.toLowerCase();
          if (q.includes('bán')) return transactionTypeRaw === 'sell' || transactionTypeRaw === 'ban' || transactionTypeRaw.includes('bán');
          if (q.includes('thuê')) return transactionTypeRaw === 'rent' || transactionTypeRaw === 'cho-thue' || transactionTypeRaw.includes('thuê');
          return transactionTypeRaw.includes(q);
        })();

        const priceVal = priceValCommon;
        const areaVal = attrs.areaValue ?? parseNum(attrs.area);
        const bedroomsVal = attrs.bedroomsValue ?? parseNum(attrs.bedrooms);
        const bathroomsVal = attrs.bathrooms ? parseNum(attrs.bathrooms) : undefined;
        const floorsVal = attrs.floors ? parseNum(attrs.floors) : undefined;
        const frontWidthVal = attrs.frontWidth ? parseNum(attrs.frontWidth) : undefined;

        const pMin = scalePriceInput(categoryKey, searchObj.price_min);
        const pMax = scalePriceInput(categoryKey, searchObj.price_max);
        const aMin = searchObj.area_min ? Number(searchObj.area_min) : undefined;
        const aMax = searchObj.area_max ? Number(searchObj.area_max) : undefined;

        const matchPrice = (!pMin || (priceVal !== undefined && priceVal >= pMin)) && (!pMax || (priceVal !== undefined && priceVal <= pMax));
        const matchArea = (!aMin || (areaVal !== undefined && areaVal >= aMin)) && (!aMax || (areaVal !== undefined && areaVal <= aMax));
        const matchBedrooms = (!searchObj.bedrooms || (bedroomsVal !== undefined && String(bedroomsVal) === searchObj.bedrooms));
        const matchBathrooms = (!searchObj.bathrooms || (bathroomsVal !== undefined && String(bathroomsVal) === searchObj.bathrooms));
        const matchFloors = (!searchObj.floors || (floorsVal !== undefined && String(floorsVal) === searchObj.floors));
        const matchFrontWidth = (!searchObj.frontWidth || (frontWidthVal !== undefined && frontWidthVal >= Number(searchObj.frontWidth)));
        const matchLocation = !searchObj.address || (attrs.location && attrs.location.toLowerCase().includes(searchObj.address.toLowerCase())) || (attrs.address && attrs.address.toLowerCase().includes(searchObj.address.toLowerCase()));

        const searchText = (
          (postTitle || '') + ' ' +
          (postExcerpt || '') + ' ' +
          (attrs.location || '') + ' ' +
          (attrs.address || '') + ' ' +
          (attrs.attributes_location || '') + ' ' +
          (attrs.attributes_area || '') + ' ' +
          (attrs.attributes_dimensions || '') + ' ' +
          (attrs.attributes_price || '') + ' ' +
          (attrs.attributes_contact || '') + ' ' +
          (attrs.attributes_bedrooms || '') + ' ' +
          (attrs.attributes_bathrooms || '') + ' ' +
          (attrs.attributes_floors || '') + ' ' +
          (attrs.attributes_frontWidth || '') + ' ' +
          (attrs.attributes_roadWidth || '') + ' ' +
          (post.keywords || '') + ' ' +
          (post.title || '') + ' ' +
          (post.excerpt || '')
        );
        const matchKeyword = matchKeywordPriority(postTitle, searchText, searchObj.q);

        const matchLegalStatus = (() => {
          if (!searchObj.legalStatus || searchObj.legalStatus.toLowerCase().includes('tất')) return true;
          const legal = (attrs.legalStatus || '').toString().toLowerCase();
          return legal.includes(searchObj.legalStatus.toLowerCase());
        })();

        const matchFurnished = (() => {
          if (!searchObj.furnished || searchObj.furnished.toLowerCase().includes('tất')) return true;
          const hasFurnished = attrs.furnished === true || attrs.furnished === 'true';
          if (searchObj.furnished.toLowerCase().includes('có')) return hasFurnished;
          if (searchObj.furnished.toLowerCase().includes('không')) return !hasFurnished;
          return true;
        })();

        return matchKeyword && matchesPropertyType && matchesTransactionType && matchLocation && matchArea && matchPrice &&
               matchBedrooms && matchBathrooms && matchFloors && matchFrontWidth && matchLegalStatus && matchFurnished;
      }

      if (categoryKey === 'lam-dep-my-pham') {
        const priceVal = priceValCommon;
        const min = scalePriceInput(categoryKey, searchObj.price_min);
        const max = scalePriceInput(categoryKey, searchObj.price_max);
        const matchRange = (!min || (priceVal !== undefined && priceVal >= min)) && (!max || (priceVal !== undefined && priceVal <= max));
        const searchText = ((postTitle || '') + ' ' + (postExcerpt || ''));
        return matchKeywordPriority(postTitle, searchText, searchObj.q) &&
          (!searchObj.brand || (attrs.brand && attrs.brand.toLowerCase().includes(searchObj.brand.toLowerCase()))) &&
          (!searchObj.origin || (attrs.origin && attrs.origin.toLowerCase().includes(searchObj.origin.toLowerCase()))) &&
          matchRange;
      }

      if (categoryKey === 'cho-thue-xe') {
        const priceVal = attrs.pricePerDayValue ?? parseNum(attrs.price);
        const min = scalePriceInput(categoryKey, searchObj.price_min);
        const max = scalePriceInput(categoryKey, searchObj.price_max);
        const matchRange = (!min || (priceVal !== undefined && priceVal >= min)) && (!max || (priceVal !== undefined && priceVal <= max));
        const searchText = (
          (postTitle || '') + ' ' +
          (postExcerpt || '') + ' ' +
          (attrs.carType || '') + ' ' +
          (attrs.brand || '') + ' ' +
          (attrs.attributes_area || '') + ' ' +
          (attrs.attributes_price || '') + ' ' +
          (attrs.attributes_contact || '') + ' ' +
          (attrs.attributes_location || '') + ' ' +
          (post.keywords || '') + ' ' +
          (post.title || '') + ' ' +
          (post.excerpt || '')
        );
        const matchKeyword = matchKeywordPriority(postTitle, searchText, searchObj.q);
        const matchRangeBudget = (() => {
          const budget = searchObj.budget ? Number(searchObj.budget) * 1000 : undefined;
          if (!budget) return true;
          return priceVal !== undefined && priceVal <= budget;
        })();
        return matchKeyword &&
          (!searchObj.carType || (attrs.carType && attrs.carType.toLowerCase().includes(searchObj.carType.toLowerCase()))) &&
          (!searchObj.seats || (attrs.seats && String(attrs.seats) === searchObj.seats)) &&
          (!searchObj.fuelType || (attrs.fuelType && attrs.fuelType.toLowerCase().includes(searchObj.fuelType.toLowerCase()))) &&
          matchRange &&
          matchRangeBudget;
      }

      if (categoryKey === 'booking-online') {
        const priceVal = priceValCommon;
        const min = scalePriceInput(categoryKey, searchObj.price_min);
        const max = scalePriceInput(categoryKey, searchObj.price_max);
        const matchRange = (!min || (priceVal !== undefined && priceVal >= min)) && (!max || (priceVal !== undefined && priceVal <= max));
        const searchText = ((postTitle || '') + ' ' + (postExcerpt || ''));
        return matchKeywordPriority(postTitle, searchText, searchObj.q) &&
          (!searchObj.date || (attrs.date && attrs.date.includes(searchObj.date))) &&
          (!searchObj.location || (attrs.location && attrs.location.toLowerCase().includes(searchObj.location.toLowerCase()))) &&
          matchRange;
      }

      return true;
    });
  };

  // Lấy lang và slug từ URL
  // Lấy ngôn ngữ hiện tại từ i18n hoặc URL, fallback 'vi'
  const currentLang = i18nInstance.language && i18nInstance.language !== 'cimode' ? i18nInstance.language : 'vi';
  const currentLangCode = resolveSupportedLang(currentLang || 'vi');
  const nonDefaultLangCode = currentLangCode && currentLangCode !== 'vi' ? currentLangCode : '';
  const pathnameWithoutBase = useMemo(() => stripBasePathname(location.pathname), [location.pathname]);
  const { lang, slug: rawSlug } = extractLangAndSlug(pathnameWithoutBase);
  const slug = String(rawSlug || '').replace(/^\/+|\/+$/g, '');
  const bridgeChildSlugSet = useMemo(() => {
    const slugs = new Set<string>([
      'phan-mem',
      'bat-dong-san',
      'lam-dep-my-pham',
      'cho-thue-xe',
      'booking-online',
    ]);

    const bridgeMenu = (menuItems || []).find((item) => item.key === '/hop-tac-kinh-doanh');
    (bridgeMenu?.children || []).forEach((child) => {
      const childPath = String(child?.path || child?.key || '').split('?')[0].replace(/^\/+/, '').trim();
      if (childPath) {
        slugs.add(childPath);
      }
    });

    return slugs;
  }, [menuItems]);
  const isLotteryLandingRoute = slug === 'thong-ke-ket-qua-xo-so';
  const isBridgeLandingRoute = slug === 'hop-tac-kinh-doanh';
  const isBridgeChildRoute = Boolean(slug && bridgeChildSlugSet.has(slug));
  const isBridgeContextStored = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(BRIDGE_CONTEXT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }, [pathnameWithoutBase]);
  const isBridgeContext = isBridgeLandingRoute || (isBridgeChildRoute && isBridgeContextStored);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (isBridgeLandingRoute || isBridgeChildRoute) {
        window.sessionStorage.setItem(BRIDGE_CONTEXT_STORAGE_KEY, '1');
        return;
      }
      if (slug) {
        window.sessionStorage.removeItem(BRIDGE_CONTEXT_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [isBridgeLandingRoute, isBridgeChildRoute, slug]);

  const visibleCategories = useMemo(() => {
    if (!isBridgeContext) {
      return allCategories;
    }
    return allCategories.filter(
      (cat) => cat.key !== 'thong-ke-ket-qua-xo-so' && cat.key !== 'hop-tac-kinh-doanh',
    );
  }, [allCategories, isBridgeContext]);

  // Check if we're on a group route (e.g., /du-an accessed directly)
  // ssrCategories already declared at component scope level (line 647)
  const isGroupRoute = slug && ssrCategories.some(cat => cat && typeof cat === 'object' && cat.slug === slug && cat.is_group_slug === true);
  
  // Kiểm tra slug có hợp lệ không (không phải group route thì phải là valid category slug)
  useEffect(() => {
    if (slug && !isGroupRoute && !allCategories.some(c => c.key === slug) && !SPECIAL_MENU_SLUGS.has(slug)) {
      window.location.replace("/");
    }
  }, [slug, allCategories, isGroupRoute]);
  
  // If on a group route, redirect to default service route
  useEffect(() => {
    if (isGroupRoute && allCategories.length > 0) {
      if (slug && SPECIAL_MENU_SLUGS.has(slug)) {
        return;
      }
      const defaultServiceSlug = allCategories[0].key;
      const targetUrl = localizePath(`/${defaultServiceSlug}`, nonDefaultLangCode || 'vi');
      if (window.location.pathname === targetUrl) {
        return;
      }
      window.location.replace(targetUrl);
    }
  }, [isGroupRoute, slug, allCategories, nonDefaultLangCode]);
  
  // Lấy key lĩnh vực từ slug hoặc fallback
  function getCategoryKeyFromUrl() {
    if (slug && visibleCategories.some(c => c.key === slug)) {
      return slug;
    }
    if (isBridgeLandingRoute && visibleCategories.some(c => c.key === BRIDGE_DEFAULT_CATEGORY)) {
      return BRIDGE_DEFAULT_CATEGORY;
    }
    if (visibleCategories.some(c => c.key === DEFAULT_CATEGORY)) {
      return DEFAULT_CATEGORY;
    }
    if (visibleCategories.length > 0 && visibleCategories[0].key) {
      return visibleCategories[0].key;
    }
    return '';
  }

  useEffect(() => {
    let cancelled = false;

    const tryLoadActiveCategoryData = async () => {
      if (loading || !activeTabKey || services.length > 0 || isLotteryLandingRoute) return;

      const langCode = nonDefaultLangCode;
      const data = await fetchSSRInitialDataByPath(localizePath(`/${activeTabKey}`, langCode || 'vi'), '');
      if (cancelled || !data || !Array.isArray(data.serviceDetailList) || data.serviceDetailList.length === 0) {
        return;
      }

      const normalized = data.serviceDetailList.map((r: any) => normalizeServiceDetail(r)) as ServicePost[];
      setServices(normalized);
      setTotal(Number(data.totalCount) || normalized.length);
      setPagination(prev => ({ ...prev, [activeTabKey]: Number(data.page) || 1 }));
      setSearchUsedServer(prev => ({ ...prev, [activeTabKey]: true }));
    };

    void tryLoadActiveCategoryData();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    activeTabKey,
    services.length,
    isLotteryLandingRoute,
    currentLang,
    fetchSSRInitialDataByPath,
  ]);

  // Initialize activeTabKey based on URL slug and available categories
  useEffect(() => {
    const targetKey = getCategoryKeyFromUrl();
    if (targetKey && targetKey !== activeTabKey) {
      setActiveTabKey(targetKey);
    }
  }, [slug, visibleCategories, activeTabKey]);

  // Khi đổi tab: reload trang với URL mới, SSR sẽ xử lý
  const handleTabChange = (key: string) => {
    if (key !== activeTabKey) {
      const params = new URLSearchParams();
      const langCode = nonDefaultLangCode;
      const query = params.toString();
      const url = localizePath(`/${key}`, langCode || 'vi') + (query ? `?${query}` : '');
      window.location.href = url;
    }
  }

  // Luôn đồng bộ tab với URL khi mount và khi user back/forward
  useEffect(() => {
    const syncTabWithUrl = () => {
      const urlKey = getCategoryKeyFromUrl();
      setActiveTabKey(urlKey);
    };
    syncTabWithUrl(); // mount
    window.addEventListener('popstate', syncTabWithUrl);
    return () => window.removeEventListener('popstate', syncTabWithUrl);
  }, []);

  // Prefill search form from URL params (reload/back/forward) and keep in sync when the query string changes
  useEffect(() => {
    if (!activeTabKey) return; // wait until tab is resolved from URL

    const params = new URLSearchParams(location.search || "");
    const currentSearch = params.toString();
    if (initializedSearchFromUrl.current[activeTabKey] && searchQueryCache.current[activeTabKey] === currentSearch) {
      return;
    }

    if (!params || currentSearch === "") {
      // No URL params → try load last search preferences from localStorage
      try {
        const raw = localStorage.getItem('csm_last_search');
        const sid = getSessionId();
        if (raw) {
          const saved = JSON.parse(raw || '{}');
          const bySid = saved[sid] || saved;
          const last = bySid[activeTabKey];
          if (last && typeof last === 'object') {
            const hasValues = Object.values(last).some(Boolean);
            setSearchValues((prev) => ({ ...prev, [activeTabKey]: last }));
            setSearchSubmitted((prev) => ({ ...prev, [activeTabKey]: hasValues }));
            setSearchUsedServer((prev) => ({ ...prev, [activeTabKey]: hasValues }));
            setPagination((prev) => ({ ...prev, [activeTabKey]: 1 }));
            initializedSearchFromUrl.current[activeTabKey] = true;
            searchQueryCache.current[activeTabKey] = currentSearch;
            return;
          }
        }
      } catch {}
      initializedSearchFromUrl.current[activeTabKey] = true;
      searchQueryCache.current[activeTabKey] = currentSearch;
      return;
    }

    const obj: Record<string, string> = {};
    params.forEach((v, k) => {
      if (k === "page" || k === "pageSize" || k === "lastkey" || k === "take" || k === "hl") return; // handled separately
      obj[k] = v;
    });

    const hasValues = Object.values(obj).some(Boolean);
    const urlPage = Number(params.get("page")) || 1;

    setSearchValues((prev) => ({ ...prev, [activeTabKey]: obj }));
    setSearchSubmitted((prev) => ({ ...prev, [activeTabKey]: hasValues }));
    setSearchUsedServer((prev) => ({ ...prev, [activeTabKey]: hasValues }));
    setPagination((prev) => ({ ...prev, [activeTabKey]: urlPage }));

    initializedSearchFromUrl.current[activeTabKey] = true;
    searchQueryCache.current[activeTabKey] = currentSearch;
  }, [activeTabKey, location.search]);

  // Sync pagination state with URL page parameter
  useEffect(() => {
    if (!activeTabKey) return;
    const params = new URLSearchParams(window.location.search || "");
    const parsedPage = Number(params.get('page'));
    const urlPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    setPagination(prev => (prev[activeTabKey] === urlPage ? prev : { ...prev, [activeTabKey]: urlPage }));
  }, [activeTabKey, location.search]);

  const getPostsByServiceType = (key: string): ServicePost[] => {
    // API only: không dùng mock
    return services.filter(p => p.serviceType === key);
  };
  const formatDate = (date?: string) => date ? new Date(date).toLocaleDateString() : "";
  // Build SEO friendly href for service detail
  const getServiceDetailUrl = (post: ServicePost) => {
    const langCode = resolveSupportedLang(currentLang || 'vi');
    return localizePath(`/${post.serviceType}/${post.slug}`, langCode);
  };

  // Hàm render search box đặc thù cho từng lĩnh vực
  function renderSearchBox(category: ServiceCategory) {
    const fields = searchFields[category.key] || [{ key: "q", label: t('website.search.keyword', 'Từ khóa') }];
    const values = searchValues[category.key] || {};
    const isAdvancedOpen = !!advancedOpen[category.key];
    const primaryField = fields.find(f => f.key === 'q') || fields[0];
    const advancedFields = fields.filter(f => f.key !== (primaryField?.key || 'q'));
    
    const handleSearchSubmit = (formValues: any) => {
      setError(null);
      
      // Mark as submitted for UI state
      setSearchSubmitted(s => ({ ...s, [category.key]: true }));
      
      // ✅ Check if form has any non-empty values
      const hasSearchValues = Object.values(formValues || {}).some(v => v !== undefined && v !== null && v !== '' && String(v).trim() !== '');
      const queryParams = new URLSearchParams();

      // Build query from current form values (sanitized)
      if (hasSearchValues) {
        Object.entries(formValues || {}).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '' && String(value).trim() !== '') {
            queryParams.append(key, sanitizeInput(String(value)));
          }
        });
        queryParams.set('page', '1');
        setSearchUsedServer(prev => ({ ...prev, [category.key]: true }));
        setPagination(prev => ({ ...prev, [category.key]: 1 }));
      } else {
        // ✅ Clear search state when form is empty
        setSearchSubmitted(s => ({ ...s, [category.key]: false }));
        setSearchUsedServer(prev => ({ ...prev, [category.key]: false }));
        setPagination(prev => ({ ...prev, [category.key]: 1 }));
        setSearchValues(s => ({ ...s, [category.key]: {} }));
      }

      const currentLang = resolveSupportedLang(i18nInstance.language || 'vi');

      const nextUrl = (() => {
        const base = localizePath(`/${category.key}`, currentLang);
        const qs = queryParams.toString();
        // ✅ Return clean URL without query params if form is empty
        return qs ? `${base}?${qs}` : base;
      })();

      // Persist latest search per user/session for UX continuity
      try {
        const sid = getSessionId();
        const raw = localStorage.getItem('csm_last_search');
        const db = raw ? JSON.parse(raw) : {};
        db[sid] = db[sid] || {};
        db[sid][category.key] = hasSearchValues ? formValues : {};
        localStorage.setItem('csm_last_search', JSON.stringify(db));
      } catch {/* ignore storage errors */}

      // Full reload to let server render filtered list (SSR is source of truth)
      window.location.href = nextUrl;
    };
    
    return (
      <Form
        key={category.key + '-' + JSON.stringify(values)}
        layout="vertical"
        onFinish={handleSearchSubmit}
        style={{ marginBottom: 24, background: "var(--card-bg)", borderRadius: 16, padding: 16, boxShadow: `0 2px 12px ${category.color}22` }}
        initialValues={values}
      >
        <AntRow gutter={12} align="middle">
          {/* Primary title field */}
          {primaryField && (
            <AntCol xs={24} sm={16} md={18} lg={18} key={primaryField.key}>
              <Form.Item name={primaryField.key} label={t('website.services.search.keywords', 'Từ khóa')} style={{ marginBottom: 8 }} preserve>
                {primaryField.input === 'number' ? (
                  <Input
                    allowClear
                    type="number"
                    min={0}
                    step="any"
                    placeholder={t('website.services.search.keywords', 'Từ khóa')}
                    style={{ width: '100%', borderRadius: 12, borderColor: category.color }}
                  />
                ) : (
                  <Input
                    allowClear
                    placeholder={t('website.services.search.keywords', 'Từ khóa')}
                    maxLength={500}
                    style={{ borderRadius: 12, borderColor: category.color }}
                  />
                )}
              </Form.Item>
            </AntCol>
          )}
          {/* Search button */}
          <AntCol xs={12} sm={6} md={4} lg={4}>
            <Form.Item label=" " style={{ marginBottom: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                style={{ width: "100%", height: 40, borderRadius: 12, background: category.color, borderColor: category.color, fontWeight: 600 }}
                icon={<span className="anticon"><svg width="1em" height="1em" fill="currentColor" viewBox="0 0 1024 1024"><path d="M909.6 834.8L700.6 625.8c54.4-70.4 86.8-158.4 86.8-254.2C787.4 167.6 619.8 0 409.7 0S32 167.6 32 371.6s167.6 371.6 377.7 371.6c95.8 0 183.8-32.4 254.2-86.8l209 209c15.6 15.6 40.8 15.6 56.4 0 15.6-15.6 15.6-40.8 0-56.4zM409.7 640c-148.2 0-268.4-120.2-268.4-268.4S261.5 103.2 409.7 103.2 678.1 223.4 678.1 371.6 557.9 640 409.7 640z"></path></svg></span>}
              >
                {t('website.services.search_button', 'Tìm kiếm')}
              </Button>
            </Form.Item>
          </AntCol>
          {/* Toggle advanced */}
          {advancedFields.length > 0 && (
            <AntCol xs={12} sm={2} md={2} lg={2}>
              <Form.Item label=" " style={{ marginBottom: 8 }}>
                <Button
                  onClick={() => setAdvancedOpen(prev => ({ ...prev, [category.key]: !isAdvancedOpen }))}
                  style={{ width: '100%', height: 40, borderRadius: 12, fontWeight: 600 }}
                >
                  {isAdvancedOpen ? t('website.services.search.collapse') : t('website.services.search.expand')}
                </Button>
              </Form.Item>
            </AntCol>
          )}
        </AntRow>

        {/* Advanced fields */}
        {advancedFields.length > 0 && isAdvancedOpen && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-color, #eee)' }}>
            <AntRow gutter={12} align="middle">
              {advancedFields.map(field => (
                <AntCol xs={24} sm={12} md={8} lg={6} key={field.key}>
                  {field.type === "select" ? (
                    <Form.Item name={field.key} label={field.label} style={{ marginBottom: 8 }} preserve>
                      <Select
                        allowClear
                        placeholder={field.label}
                        style={{ width: "100%", borderRadius: 12, borderColor: category.color }}
                        options={field.options?.map(opt => ({ value: opt, label: opt }))}
                      />
                    </Form.Item>
                  ) : (
                    <Form.Item name={field.key} label={field.label} style={{ marginBottom: 8 }} preserve>
                      {field.input === 'number' ? (
                        <Input
                          allowClear
                          type="number"
                          min={0}
                          step="any"
                          placeholder={(() => {
                            const isPrice = field.key.startsWith('price_');
                            const isArea = field.key.startsWith('area_');
                            const isBedrooms = field.key === 'bedrooms';
                            const isSeats = field.key === 'seats';
                            let unit = '';
                            if (isPrice) {
                              if (category.key === 'bat-dong-san') unit = ' (tỷ)';
                              else if (category.key === 'cho-thue-xe' || category.key === 'booking-online' || category.key === 'lam-dep-my-pham') unit = ' (k)';
                            } else if (isArea) unit = ' (m²)';
                            else if (isBedrooms || isSeats) unit = ' (#)';
                            return field.label + unit;
                          })()}
                          style={{ width: '100%', borderRadius: 12, borderColor: category.color }}
                        />
                      ) : (
                        <Input
                          allowClear
                          placeholder={field.label}
                          maxLength={500}
                          style={{ borderRadius: 12, borderColor: category.color }}
                        />
                      )}
                    </Form.Item>
                  )}
                </AntCol>
              ))}
            </AntRow>
          </div>
        )}
      </Form>
    );
  }

  // Custom tab bar UI - luxury, modern, system-adaptive, cân đối hơn
  function CustomTabBar(props: any, DefaultTabBar: any) {
    return (
      <nav
        aria-label="Service Categories"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          marginBottom: 40,
          overflowX: "auto",
          background: "var(--card-bg, #fff)",
          backdropFilter: "blur(10px)",
          borderRadius: 36,
          boxShadow: "0 8px 32px var(--card-shadow, #0001)",
          padding: "20px 14px 20px 14px",
          border: "1.2px solid var(--border-color, #e5e7eb)",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 110,
          transition: 'background .2s',
        }}
      >
        {props.panes.map((pane: any) => {
          const category = allCategories.find(c => c.key === pane.key)!;
          const isActive = props.activeKey === pane.key;
          // Lấy màu chủ đạo từ hệ thống nếu có, ưu tiên màu category cho active
          const mainColor = isActive
            ? `var(--primary-color, ${category.color})`
            : `var(--text-primary, ${category.color})`;
          return (
            <button
              key={pane.key}
              aria-current={isActive ? "page" : undefined}
              onClick={() => props.onTabClick(pane.key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 140,
                height: 104,
                padding: '0 8px',
                borderRadius: 22,
                background: isActive
                  ? `linear-gradient(135deg, var(--primary-color, ${category.color}) 85%, var(--card-bg, #fff) 100%)`
                  : "var(--card-bg, #fff)",
                color: mainColor,
                boxShadow: isActive
                  ? `0 8px 32px var(--primary-color, ${category.color})22, 0 2px 12px #0001`
                  : "0 1.5px 6px #0001",
                cursor: "pointer",
                transform: isActive ? "scale(1.09)" : "scale(1)",
                transition: "all .15s cubic-bezier(.4,1.2,.4,1)",
                fontWeight: isActive ? 900 : 700,
                border: isActive
                  ? `2px solid var(--primary-color, ${category.color})`
                  : `1.2px solid var(--border-color, #e5e7eb)`,
                marginBottom: 0,
                outline: isActive ? `2px solid var(--primary-color, ${category.color})` : "none",
                boxSizing: "border-box",
                position: "relative",
                zIndex: isActive ? 2 : 1,
                filter: isActive ? `drop-shadow(0 4px 14px var(--primary-color, ${category.color})22)` : 'none',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = `linear-gradient(135deg, var(--primary-color, ${category.color}) 18%, var(--hover-bg, #f5f5f5) 100%)`;
                  e.currentTarget.style.border = `2px solid var(--primary-color, ${category.color})`;
                  e.currentTarget.style.boxShadow = `0 4px 18px var(--primary-color, ${category.color})22`;
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--card-bg, #fff)';
                  e.currentTarget.style.border = `1.2px solid var(--border-color, #e5e7eb)`;
                  e.currentTarget.style.boxShadow = `0 1.5px 6px #0001`;
                  e.currentTarget.style.color = mainColor;
                }
              }}
            >
              <span style={{
                fontSize: 38,
                marginBottom: 8,
                color: isActive ? "#fff" : `var(--primary-color, ${category.color})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isActive ? `var(--primary-color, ${category.color})` : "var(--tab-icon-bg, #f5f5f5)",
                borderRadius: "50%",
                width: 46,
                height: 46,
                boxShadow: isActive ? `0 2px 8px var(--primary-color, ${category.color})22` : 'none',
                border: isActive ? `1.5px solid #fff` : `1.2px solid var(--border-color, #e5e7eb)`,
                transition: 'color .2s, background .2s',
              }}>{category.icon}</span>
              <span style={{
                fontSize: category.title.length > 16 ? 13 : 15,
                color: isActive ? "#fff" : `var(--text-primary, ${category.color})`,
                fontWeight: 700,
                letterSpacing: 0.12,
                marginTop: 2,
                fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
                textShadow: isActive ? `0 2px 8px var(--primary-color, ${category.color})22` : 'none',
                transition: 'color .2s, text-shadow .2s',
                textAlign: 'center',
                lineHeight: 1.25,
                width: '100%',
                maxWidth: '100%',
                whiteSpace: 'normal',
                overflow: 'visible',
                textOverflow: 'unset',
                padding: '0 2px',
                wordBreak: 'break-word',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                display: '-webkit-box',
              }}>{category.title}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  // Render different display styles for each service category
  const renderServiceSection = (category: ServiceCategory, activeTabKey: string) => {
    const posts = getPostsByServiceType(category.key);
    const currentLang = i18nInstance.language || 'vi';
    const effectivePageSize = FIXED_PAGE_SIZE;
    // Backend now manages pagination cache - no need to check for lastkey or cursor seed
    const serverFlag = Boolean(searchUsedServer[category.key]);

    // Helpers for card display
    const resolveAreaDisplay = (attrs: Record<string, any> | undefined) => {
      if (!attrs) return '';
      const raw = (
        formatArea(attrs) ||
        (attrs.areaValue ? `${attrs.areaValue} m²` : '') ||
        (attrs.area ? `${attrs.area} m²` : '')
      );
      if (!raw) return '';
      return normalizeDisplayValue(raw, t);
    };
    
    // Handle page change for pagination - always delegate to server
    // ✅ FIXED: Must preserve ALL search filters when changing pages
    const handlePageChange = (newPage: number) => {
      const currentPath = window.location.pathname || `/${category.key}`;
      const queryParams = new URLSearchParams();
      
      // ✅ CRITICAL FIX: Get search params from URL first (preserved state)
      // This ensures backward navigation remembers filters
      const currentUrl = new URL(window.location.href);
      const urlParams = new URLSearchParams(currentUrl.search);
      
      // Copy ALL existing search parameters from URL
      // This preserves any filters from previous searches
      for (const [key, value] of urlParams.entries()) {
        // Skip pagination-specific params that we'll re-add
        if (key !== 'page' && key !== 'lastkey') {
          queryParams.append(key, value);
        }
      }
      
      // Also add from searchValues state (in case not in URL yet)
      const searchObj = searchValues[category.key] || {};
      Object.entries(searchObj).forEach(([key, value]) => {
        if (value && value.trim() !== '' && !queryParams.has(key)) {
          queryParams.append(key, sanitizeInput(value));
        }
      });
      
      // Backend manages 100% pagination logic including cursor derivation
      // Client ONLY sends page number - NO client-side data manipulation
      queryParams.set('page', String(newPage)); // Use set() to replace if exists
      
      // ✅ Clean URL (no session ID)
      // Query signature = domain:slug:filters
      // Same query → Same signature → Same cursor → Same data
      
      const newUrl = `${currentPath}?${queryParams.toString()}`;
      
      // FULL PAGE RELOAD to trigger server-side rendering with new page
      // This ensures backend handles pagination completely (SSR + cursor derivation)
      window.location.href = newUrl;
    };
    // Show loading spinner while awaiting SSR hydration data
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Spin size="large" tip={t('website.services.loading_search', 'Đang tải dữ liệu...')} />
        </div>
      );
    }
    
    // Show error message if search failed
    if (error && searchSubmitted[category.key]) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Empty
            description={
              <div>
                <div style={{ color: 'var(--error-color, #ff4d4f)', marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
                  {t('website.services.search_error', 'Lỗi tìm kiếm')}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{error}</div>
              </div>
            }
          />
        </div>
      );
    }
    
    // Deduplicate posts by ID to prevent React key warnings
    const uniquePosts = Array.from(new Map(posts.map(p => [p.id, p])).values());
    
    if (uniquePosts.length === 0) return null;

    // ✅ CRITICAL FIX: Trust server's totalCount completely
    // Do NOT do client-side filtering that loses totalCount accuracy
    // Backend provides filtered results + accurate totalCount
    const searchObj = searchValues[category.key] || {};
    const submitted = searchSubmitted[category.key];
    
    // IMPORTANT: filterPostsForCategory should NOT filter further
    // It should only apply display logic, NOT reduce the result set
    // The server has already applied all filters and returned totalCount
    const filteredPosts = uniquePosts; // Use all posts from server as-is

    // Pagination: delegate entirely to server; do not slice on client
    const computePaging = (list: ServicePost[]) => {
      const currentPage = pagination[category.key] || 1;
      const paginatedList = list; // backend already returns the correct page
      const useServerPagination = true;
      // ✅ CRITICAL FIX: Use server's total count, NOT list.length
      // Server counted filtered results, frontend must trust this
      const totalForPagination = total > 0 ? total : list.length;
      
      return { paginatedList, useServerPagination, totalForPagination, currentPage };
    };

    // Helper function to render property-specific info for real estate
    const renderPropertySpecificInfo = (propType: string, attrs: Record<string, any>) => {
      const norm = (v: any) => normalizeDisplayValue(v, t);
      // 1. Căn hộ Chung cư
      if (propType === 'can-ho-chung-cu') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(24, 144, 255, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(24, 144, 255, 0.15)' }}>
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.floor && <span><b>📍 Tầng:</b> {norm(attrs.floor)}</span>}
            {attrs.furnished !== undefined && <span><b>🪑 Nội thất:</b> {attrs.furnished ? 'Đầy đủ' : 'Trống'}</span>}
            {attrs.utilities && <span><b>🏢 Tiện ích:</b> {Array.isArray(attrs.utilities) ? attrs.utilities.slice(0,2).join(', ') : norm(attrs.utilities)}</span>}
          </div>
        );
      }
      
      // 2. Nhà riêng/Nhà Phố
      if (propType === 'nha-rieng-nha-pho') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(82, 196, 26, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(82, 196, 26, 0.15)' }}>
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.floors && <span><b>🏢 {t('website.services.detail.floors', 'Số tầng')}:</b> {norm(attrs.floors)}</span>}
            {attrs.frontWidth && <span><b>📏 MT:</b> {norm(attrs.frontWidth)}m</span>}
            {attrs.hasGarden && <span style={{ color: '#52c41a' }}><b>🌳 Sân vườn</b></span>}
            {attrs.parking && <span><b>🚗 Parking:</b> {norm(attrs.parking)}</span>}
          </div>
        );
      }
      
      // 3. Biệt thự
      if (propType === 'biet-thu') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(250, 173, 20, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(250, 173, 20, 0.15)' }}>
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.floors && <span><b>🏢 {t('website.services.detail.floors', 'Tầng')}:</b> {norm(attrs.floors)}</span>}
            {attrs.hasPool && <span style={{ color: '#1890ff' }}><b>🏊 {t('website.services.detail.pool', 'Hồ bơi')}</b></span>}
            {attrs.hasGarden && <span style={{ color: '#52c41a' }}><b>🌳 {t('website.services.detail.garden', 'Sân vườn')}</b></span>}
            {attrs.parking && <span><b>🚗 Parking:</b> {norm(attrs.parking)}</span>}
            {attrs.furnished !== undefined && <span><b>🪑 {t('website.services.detail.furniture_short', 'NT')}:</b> {attrs.furnished ? t('website.services.detail.furnished_full', 'Đủ') : t('website.services.detail.furnished_empty', 'Trống')}</span>}
          </div>
        );
      }
      
      // 4. Đất nền
      if (propType === 'dat-nen') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(255, 193, 7, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255, 193, 7, 0.15)' }}>
            {attrs.frontWidth && <span><b>📏 {t('website.services.detail.front_width', 'Mặt tiền')}:</b> {norm(attrs.frontWidth)}m</span>}
            {attrs.direction && <span><b>🧭 {t('website.services.detail.direction', 'Hướng')}:</b> {norm(attrs.direction)}</span>}
            {attrs.roadWidth && <span><b>🛣️ {t('website.services.detail.road_width', 'Đường')}:</b> {norm(attrs.roadWidth)}m</span>}
          </div>
        );
      }
      
      // 5. Shophouse
      if (propType === 'shophouse') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(114, 46, 209, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(114, 46, 209, 0.15)' }}>
            {attrs.floors && <span><b>🏢 {t('website.services.detail.floors', 'Tầng')}:</b> {norm(attrs.floors)}</span>}
            {attrs.frontWidth && <span><b>📏 MT:</b> {norm(attrs.frontWidth)}m</span>}
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.furnished !== undefined && <span><b>🪑 {t('website.services.detail.furniture_short', 'NT')}:</b> {attrs.furnished ? '✓' : '✗'}</span>}
          </div>
        );
      }
      
      // 6. Officetel
      if (propType === 'officetel') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(19, 194, 194, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(19, 194, 194, 0.15)' }}>
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.floor && <span><b>📍 {t('website.services.detail.floor', 'Tầng')}:</b> {norm(attrs.floor)}</span>}
            {attrs.furnished !== undefined && <span><b>🪑 {t('website.services.detail.furnished', 'Nội thất')}:</b> {attrs.furnished ? t('website.services.detail.yes', 'Có') : t('website.services.detail.no', 'Không')}</span>}
            {attrs.hasAC && <span><b>❄️ {t('website.services.detail.ac', 'Điều hòa')}</b></span>}
          </div>
        );
      }
      
      // 7. Condotel/Resort Villa
      if (propType === 'condotel-resort-villa') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(235, 47, 150, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(235, 47, 150, 0.15)' }}>
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.expectedROI && <span><b>📈 ROI:</b> {norm(attrs.expectedROI)}%</span>}
            {attrs.managedByOperator && <span style={{ color: '#52c41a' }}><b>✓ {t('website.services.detail.managed', 'Quản lý vận hành')}</b></span>}
            {attrs.hasPool && <span style={{ color: '#1890ff' }}><b>🏊 {t('website.services.detail.pool', 'Hồ bơi')}</b></span>}
          </div>
        );
      }
      
      // 8. Văn phòng cho thuê
      if (propType === 'van-phong') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(160, 217, 17, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(160, 217, 17, 0.15)' }}>
            {attrs.floor && <span><b>📍 {t('website.services.detail.floor', 'Tầng')}:</b> {norm(attrs.floor)}</span>}
            {attrs.grade && <span><b>⭐ {t('website.services.detail.grade', 'Hạng')}:</b> {norm(attrs.grade)}</span>}
            {attrs.furnished !== undefined && <span><b>🪑 {t('website.services.detail.furniture_short', 'NT')}:</b> {attrs.furnished ? t('website.services.detail.yes', 'Có') : t('website.services.detail.no', 'Không')}</span>}
            {attrs.hasAC && <span><b>❄️ {t('website.services.detail.ac', 'Điều hòa')}</b></span>}
            {attrs.parking && <span><b>🚗 Parking:</b> {norm(attrs.parking)}</span>}
          </div>
        );
      }
      
      // 9. Phòng trọ/Nhà trọ
      if (propType === 'phong-tro-nha-tro') {
        return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'rgba(47, 84, 235, 0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(47, 84, 235, 0.15)' }}>
            {attrs.bedrooms && <span><b>🛏️ PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
            {attrs.bathrooms && <span><b>🚿 PT:</b> {norm(attrs.bathrooms)}</span>}
            {attrs.hasAC && <span><b>❄️ {t('website.services.detail.ac', 'Điều hòa')}</b></span>}
            {attrs.furnished !== undefined && <span><b>🪑 {t('website.services.detail.furniture_short', 'NT')}:</b> {attrs.furnished ? t('website.services.detail.yes', 'Có') : t('website.services.detail.no', 'Không')}</span>}
            {attrs.utilities && <span><b>⚡ {t('website.services.detail.utilities', 'Tiện ích')}:</b> {Array.isArray(attrs.utilities) ? attrs.utilities.slice(0,2).join(', ') : norm(attrs.utilities)}</span>}
          </div>
        );
      }
      
      // Fallback: hiển thị thông tin cơ bản
      return (
        <div style={{ marginTop: 12, display: "flex", flexWrap: 'wrap', gap: 16, fontSize: 14, color: "var(--text-primary)", background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          {attrs.bedrooms && <span><b>PN:</b> {norm(formatBedrooms(attrs) || attrs.bedrooms)}</span>}
          {attrs.bathrooms && <span><b>PT:</b> {norm(attrs.bathrooms)}</span>}
          {attrs.floors && <span><b>{t('website.services.detail.floors', 'Tầng')}:</b> {norm(attrs.floors)}</span>}
          {attrs.furnished !== undefined && <span><b>{t('website.services.detail.furniture_short', 'NT')}:</b> {attrs.furnished ? '✓' : '✗'}</span>}
        </div>
      );
    };

    // Custom layout for each category
    let content = null;
    if (category.key === "bat-dong-san") {
      // Real Estate: Luxury grid with premium styling
      const currentLang = i18nInstance.language || 'vi';
      const { paginatedList, useServerPagination, totalForPagination, currentPage } = computePaging(filteredPosts);
      content = (
        <>
          <Row gutter={[24, 28]} style={{ padding: "32px 0" }} align="stretch">
            {paginatedList.map((post: ServicePost) => {
              const postTitle = getMultilingualField(post, 'title', currentLang);
              const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
              const propertyTypeKey = (post.attributes?.propertyType || '').toString();
              const propertyTypeLabel = post.attributes?.propertyTypeLabel || (propertyTypeKey ? translatePropertyType(propertyTypeKey, t) : '');
              const transactionTypeKey = (post.attributes?.transactionType || post.attributes?.listingType || post.attributes?.type || '').toString().toLowerCase();
              let transactionLabel = post.attributes?.transactionTypeLabel || '';
              if (!transactionLabel) {
                if (transactionTypeKey === 'sell' || transactionTypeKey === 'ban' || transactionTypeKey.includes('bán')) {
                  transactionLabel = t('website.services.transaction_types.sell', 'Bán');
                } else if (transactionTypeKey === 'rent' || transactionTypeKey === 'cho-thue' || transactionTypeKey.includes('thuê')) {
                  transactionLabel = t('website.services.transaction_types.rent', 'Cho thuê');
                }
              }
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={post.id!}>
                  <a href={getServiceDetailUrl(post)} aria-label={postTitle} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
                    <Card
                      hoverable
                      style={{
                        borderRadius: 18,
                        boxShadow: `0 8px 32px ${(category.color || '#13c2c2')}22, var(--card-shadow, 0 2px 8px #0001)`,
                        border: `1.5px solid ${(category.color || '#13c2c2')}22`,
                        background: "var(--card-bg, #fff)",
                        color: "var(--text-primary)",
                        minHeight: 420,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        overflow: "hidden",
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        height: '100%',
                      }}
                      cover={<div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18, background: 'linear-gradient(135deg, #13c2c211 0%, #13c2c207 100%)' }}>{renderCardMedia(post, 'bat-dong-san', postTitle)}{transactionLabel && <Tag color={transactionLabel === "Bán" ? "#52c41a" : "#faad14"} style={{ position: "absolute", bottom: 12, left: 12, fontWeight: 700, fontSize: 11, borderRadius: 6, color: '#fff', border: 'none', backdropFilter: 'blur(6px)', background: transactionLabel === "Bán" ? 'rgba(82, 196, 26, 0.85)' : 'rgba(250, 173, 20, 0.85)', padding: '4px 10px', letterSpacing: '0.5px' }}>{transactionLabel}</Tag>}{propertyTypeLabel && <Tag color="#1890ff" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, borderRadius: 6, color: '#fff', border: 'none', fontWeight: 600, backdropFilter: 'blur(6px)', background: 'rgba(24, 144, 255, 0.85)', padding: '4px 8px', letterSpacing: '0.3px' }}>{propertyTypeLabel}</Tag>}</div>}
                      bodyStyle={{ padding: '18px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, background: 'var(--card-bg, #fff)', color: 'var(--text-primary)' }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                        {getCategoryLabel(post.category) && <Tag color={category.color || '#13c2c2'} style={{ backgroundColor: category.color || '#13c2c2', fontSize: 11, borderRadius: 6, padding: "2px 8px" }}>{getCategoryLabel(post.category)}</Tag>}
                        {getRelativeTime(post.publishDate) && <Text style={{ color: "var(--text-secondary)", fontSize: 11 }}>{getRelativeTime(post.publishDate)}</Text>}
                        {post.expiryDate && <Tag color={formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange'} style={{ fontSize: 10, borderRadius: 4 }}>{formatExpiryDate(post.expiryDate)}</Tag>}
                      </div>
                      <Title level={5} style={{ margin: "0 0 8px 0", color: category.color || 'var(--brand-primary)', fontWeight: 700, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>{postTitle}</Title>
                      {postExcerpt && <Text style={{ color: "var(--text-secondary)", fontSize: 13, display: "block", marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{postExcerpt}</Text>}
                      <div style={{ marginTop: "auto" }}>
                        {(() => { const priceUnit = post.attributes?.priceUnit; const fpRaw = formatPrice(post.attributes, priceUnit); const fp = fpRaw ? normalizeDisplayValue(fpRaw, t) : ''; return fp ? <Text style={{ display: 'block', marginBottom: 10, color: category.color || '#13c2c2', fontWeight: 700, fontSize: 16 }}>{fp}</Text> : null; })()}
                        {(() => {
                          const area = resolveAreaDisplay(post.attributes);
                          const bedrooms = !isMissingDisplayValue(post.attributes?.bedroomsValue) ? normalizeDisplayValue(post.attributes?.bedroomsValue, t) : null;
                          const floors = !isMissingDisplayValue(post.attributes?.floors) ? normalizeDisplayValue(post.attributes?.floors, t) : null;
                          const legal = getAttrLocalized(post.attributes, 'legalStatus', currentLang);
                          const legalDisplay = !isMissingDisplayValue(legal) ? normalizeDisplayValue(legal, t) : null;
                          const hasSpecs = [area, bedrooms, floors, legalDisplay].some(Boolean);
                          if (!hasSpecs) return null;
                          return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, rowGap: 8, fontSize: 12, color: 'var(--text-primary)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '8px 10px' }}>
                              {area && (
                                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t('website.services.detail.area', 'Diện tích')}:</span>
                                  <span>{area}</span>
                                </span>
                              )}
                              {bedrooms && (
                                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t('website.services.detail.bedrooms', 'Phòng ngủ')}:</span>
                                  <span>{bedrooms}</span>
                                </span>
                              )}
                              {floors && (
                                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t('website.services.detail.floors', 'Tầng')}:</span>
                                  <span>{floors}</span>
                                </span>
                              )}
                              {legalDisplay && (
                                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t('website.services.detail.legal_status', 'Pháp lý')}:</span>
                                  <span>{legalDisplay}</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </Card>
                  </a>
                </Col>
              );
            })}
          </Row>
          <div style={{ textAlign: "center", marginTop: 32, marginBottom: 96 }}>
            <Pagination 
              current={currentPage} 
              pageSize={effectivePageSize}
              total={totalForPagination} 
              onChange={(page) => handlePageChange(page)} 
              showTotal={isMobile ? undefined : renderPaginationTotal}
              showSizeChanger={false} 
              size={isMobile ? 'small' : undefined}
              style={{ minWidth: 200, display: "inline-block" }} 
            />
          </div>
        </>
      );
    } else if (category.key === "lam-dep-my-pham") {
      // Beauty & Cosmetics: Elegant, soft, feminine design with premium feel
      const filteredByType = filteredPosts.filter((post: ServicePost) => {
        if (beautyTypeFilter === 'all') return true;
        const t = String(post.attributes?.type || '').toLowerCase();
        return t === beautyTypeFilter;
      });
      const currentLang = i18nInstance.language || 'vi';
      const { paginatedList, useServerPagination, totalForPagination, currentPage } = computePaging(filteredByType);
      content = (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '8px 0 0 0' }}>
            <Text style={{ color: 'var(--text-secondary)' }}>{t('website.services.detail.type_filter_label', 'Loại:')}</Text>
            <Select
              size="small"
              value={beautyTypeFilter}
              style={{ width: 140 }}
              onChange={(v) => { setPagination(prev => ({ ...prev, [category.key]: 1 })); setBeautyTypeFilter(v as any); }}
              options={[
                { label: t('website.services.detail.type_filter_all', 'Tất cả'), value: 'all' },
                { label: t('website.services.detail.type_filter_cosmetics', 'Mỹ Phẩm'), value: 'my-pham' },
                { label: t('website.services.detail.type_filter_spa', 'Spa'), value: 'spa' },
              ]}
            />
          </div>
          <Row gutter={[24, 28]} style={{ padding: "16px 0 32px" }} align="stretch">
            {paginatedList.map((post: ServicePost) => {
              const postTitle = getMultilingualField(post, 'title', currentLang);
              const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
              return (
              <Col xs={24} sm={12} md={8} lg={6} key={post.id!}>
                <a href={getServiceDetailUrl(post)} aria-label={postTitle} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
                <Card
                  hoverable
                  style={{ 
                    borderRadius: 18, 
                    boxShadow: `0 8px 32px ${(category.color || '#eb2f96')}18, var(--card-shadow, 0 2px 8px #0001)`, 
                    border: `1.5px solid ${(category.color || '#eb2f96')}22`, 
                    background: "var(--card-bg, #fff)", 
                    color: "var(--text-primary)",
                    minHeight: 400, 
                    height: '100%',
                    display: "flex", 
                    flexDirection: "column", 
                    justifyContent: "space-between",
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  cover={(
                    <div style={{ position: 'relative', paddingBottom: '62%', overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                      {renderCardMedia(post, 'lam-dep-my-pham', postTitle)}
                    </div>
                  )}
                  bodyStyle={{ background: 'var(--card-bg, #fff)', color: 'var(--text-primary)' }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    {getCategoryLabel(post.category) && (
                      <Tag color={category.color || '#eb2f96'} style={{ backgroundColor: category.color || '#eb2f96', fontSize: 11, borderRadius: 6, padding: "2px 8px" }}>
                        {getCategoryLabel(post.category)}
                      </Tag>
                    )}
                    {post.attributes?.type && (
                      <Tag color={String(post.attributes.type).toLowerCase()==='spa' ? '#87e8de' : '#fadbff'} style={{ color: String(post.attributes.type).toLowerCase()==='spa' ? '#08979c' : '#eb2f96', fontSize: 11, borderRadius: 7 }}>
                        {String(post.attributes.type).toLowerCase()==='spa' ? 'Spa' : 'Mỹ Phẩm'}
                      </Tag>
                    )}
                    {getRelativeTime(post.publishDate) && (
                      <Text style={{ color: "var(--text-secondary)", fontSize: 11 }}>{getRelativeTime(post.publishDate)}</Text>
                    )}
                    {post.expiryDate && (
                      <Tag color={formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange'} style={{ fontSize: 11, borderRadius: 6 }}>{formatExpiryDate(post.expiryDate)}</Tag>
                    )}
                    {post.attributes?.brand && (
                      <Tag color="#fadbff" style={{ color: "#eb2f96", fontSize: 11, borderRadius: 7 }}>
                        {post.attributes.brand}
                      </Tag>
                    )}
                  </div>
                  <Title level={5} style={{ margin: "0 0 8px 0", color: category.color || 'var(--brand-primary)', fontWeight: 700, lineHeight: 1.4 }}>
                    {postTitle}
                  </Title>
                  {postExcerpt && (
                  <Text style={{ color: "var(--text-secondary)", fontSize: 14, display: "block", marginBottom: 12 }}>
                    {postExcerpt}
                  </Text>
                  )}
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <span>👁️ {post.views || 0}</span>
                      <span>⏱️ {post.readTime}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {(() => { const fpRaw = formatPrice(post.attributes); const fp = fpRaw ? normalizeDisplayValue(fpRaw, t) : ''; return fp ? <Text strong style={{ color: category.color || '#eb2f96', fontSize: 16 }}>{fp}</Text> : null; })()}
                      {post.attributes?.origin && (
                        <Tag color="#fadbff" style={{ color: "#eb2f96", borderRadius: 7 }}>
                          {post.attributes.origin}
                        </Tag>
                      )}
                    </div>
                  </div>
                </Card>
                </a>
              </Col>
              );
            })}
          </Row>
          <div style={{ textAlign: "center", marginTop: 32, marginBottom: 96 }}>
            <Pagination
              current={currentPage}
              pageSize={effectivePageSize}
              total={totalForPagination}
              onChange={(page) => handlePageChange(page)}
              showTotal={isMobile ? undefined : renderPaginationTotal}
              showSizeChanger={false}
              size={isMobile ? 'small' : undefined}
              style={{ minWidth: 200, display: "inline-block" }}
            />
          </div>
        </>
      );
    } else if (category.key === "cho-thue-xe") {
      // Car Rental: Dynamic, modern, professional design
      const currentLang = i18nInstance.language || 'vi';
      const { paginatedList, useServerPagination, totalForPagination, currentPage } = computePaging(filteredPosts);
      content = (
        <>
          <Row gutter={[24, 28]} style={{ padding: "32px 0" }} align="stretch">
            {paginatedList.map((post: ServicePost) => {
              const postTitle = getMultilingualField(post, 'title', currentLang);
              const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
              return (
              <Col xs={24} sm={12} md={8} lg={6} key={post.id!}>
                <a href={getServiceDetailUrl(post)} aria-label={postTitle} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
                <Card
                  hoverable
                  style={{ 
                    borderRadius: 18, 
                    boxShadow: `0 8px 32px ${(category.color || '#1890ff')}18, var(--card-shadow, 0 2px 8px #0001)`, 
                    border: `1.5px solid ${(category.color || '#1890ff')}22`, 
                    background: "var(--card-bg, #fff)", 
                    color: "var(--text-primary)",
                    minHeight: 400, 
                    height: '100%',
                    display: "flex", 
                    flexDirection: "column", 
                    justifyContent: "space-between",
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  cover={(
                    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18, background: 'linear-gradient(135deg, #1890ff11 0%, #1890ff07 100%)' }}>
                      {renderCardMedia(post, 'cho-thue-xe', postTitle)}
                    </div>
                  )}
                  bodyStyle={{ background: 'var(--card-bg, #fff)', color: 'var(--text-primary)' }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    {getCategoryLabel(post.category) && (
                      <Tag color={category.color || '#1890ff'} style={{ backgroundColor: category.color || '#1890ff', fontSize: 11, borderRadius: 6, padding: "2px 8px" }}>
                        {getCategoryLabel(post.category)}
                      </Tag>
                    )}
                    {getRelativeTime(post.publishDate) && (
                      <Text style={{ color: "var(--text-secondary)", fontSize: 11 }}>{getRelativeTime(post.publishDate)}</Text>
                    )}
                    {post.expiryDate && (
                      <Tag color={formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange'} style={{ fontSize: 11, borderRadius: 6 }}>{formatExpiryDate(post.expiryDate)}</Tag>
                    )}
                  </div>
                  <Title level={5} style={{ margin: "0 0 8px 0", color: category.color || 'var(--brand-primary)', fontWeight: 700, lineHeight: 1.4 }}>
                    {postTitle}
                  </Title>
                  {postExcerpt && (
                  <Text style={{ color: "var(--text-secondary)", fontSize: 14, display: "block", marginBottom: 12 }}>
                    {postExcerpt}
                  </Text>
                  )}
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      {post.attributes?.carType && <span>🚗 {post.attributes.carType}</span>}
                      {post.attributes?.seats && <span>👥 {post.attributes.seats} chỗ</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {(() => { const fpRaw = formatPrice(post.attributes); const fp = fpRaw ? normalizeDisplayValue(fpRaw, t) : ''; return fp ? <Text strong style={{ color: category.color || '#1890ff', fontSize: 16 }}>{fp}</Text> : null; })()}
                    </div>
                  </div>
                </Card>
                </a>
              </Col>
              );
            })}
          </Row>
          <div style={{ textAlign: "center", marginTop: 32, marginBottom: 96 }}>
            <Pagination
              current={currentPage}
              pageSize={effectivePageSize}
              total={totalForPagination}
              onChange={(page) => handlePageChange(page)}
              showTotal={isMobile ? undefined : renderPaginationTotal}
              showSizeChanger={false}
              size={isMobile ? 'small' : undefined}
              style={{ minWidth: 200, display: "inline-block" }}
            />
          </div>
        </>
      );
    } else if (category.key === "booking-online") {
      // Booking Online: Event-style, vibrant, modern design
      const currentLang = i18nInstance.language || 'vi';
      const { paginatedList, useServerPagination, totalForPagination, currentPage } = computePaging(filteredPosts);
      content = (
        <>
          <Row gutter={[24, 28]} style={{ padding: "32px 0" }} align="stretch">
            {paginatedList.map((post: ServicePost) => {
              const postTitle = getMultilingualField(post, 'title', currentLang);
              const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
              return (
              <Col xs={24} sm={12} md={12} lg={6} key={post.id!}>
                <a href={getServiceDetailUrl(post)} aria-label={postTitle} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
                <Card
                  hoverable
                  style={{ 
                    borderRadius: 18, 
                    boxShadow: `0 8px 32px ${(category.color || '#faad14')}20, var(--card-shadow, 0 2px 8px #0001)`, 
                    border: `1px solid ${(category.color || '#faad14')}10`, 
                    background: "var(--card-bg, #fff)", 
                    color: "var(--text-primary)",
                    minHeight: 400, 
                    height: '100%',
                    display: "flex", 
                    flexDirection: "column", 
                    justifyContent: "space-between",
                    overflow: "hidden",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                  }}
                  cover={(() => {
                    return (
                      <div style={{ position: 'relative', paddingBottom: '56.25%', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18, background: "linear-gradient(135deg, #faad1430, #faad1420)" }}>
                        {renderCardMedia(post, 'booking-online', postTitle)}
                        <div style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          background: "#faad14",
                          color: "#fff",
                          padding: "8px 12px",
                          borderRadius: "0 18px 0 12px",
                          fontSize: "12px",
                          fontWeight: 700,
                          zIndex: 2
                        }}>
                          Sự Kiện
                        </div>
                      </div>
                    );
                  })()}
                  bodyStyle={{ background: 'var(--card-bg, #fff)', color: 'var(--text-primary)' }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    {getCategoryLabel(post.category) && (
                      <Tag color={category.color || '#faad14'} style={{ backgroundColor: category.color || '#faad14', fontSize: 11, borderRadius: 6, padding: "2px 8px" }}>
                        {getCategoryLabel(post.category)}
                      </Tag>
                    )}
                    {getRelativeTime(post.publishDate) && (
                      <Text style={{ color: "var(--text-secondary)", fontSize: 11 }}>{getRelativeTime(post.publishDate)}</Text>
                    )}
                    {post.expiryDate && (
                      <Tag color={formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange'} style={{ fontSize: 11, borderRadius: 6 }}>{formatExpiryDate(post.expiryDate)}</Tag>
                    )}
                  </div>
                  <Title level={5} style={{ margin: "0 0 8px 0", color: category.color || 'var(--brand-primary)', fontWeight: 700, lineHeight: 1.4 }}>
                    {postTitle}
                  </Title>
                  {postExcerpt && (
                  <Text style={{ color: "var(--text-secondary)", fontSize: 14, display: "block", marginBottom: 12 }}>
                    {postExcerpt}
                  </Text>
                  )}
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      {post.attributes && "date" in post.attributes && post.attributes.date && (
                        <span>📅 {String(post.attributes.date)}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {(() => { const fpRaw = formatPrice(post.attributes); const fp = fpRaw ? normalizeDisplayValue(fpRaw, t) : ''; return fp ? <Text strong style={{ color: category.color || '#faad14', fontSize: 16 }}>{fp}</Text> : null; })()}
                      {post.tags?.includes("Khuyến mãi") && <Tag color="red" style={{ fontSize: 10 }}>{t('website.services.detail.promotion', 'Khuyến mãi')}</Tag>}
                    </div>
                  </div>
                </Card>
                </a>
              </Col>
              );
            })}
            <Col span={24} style={{ textAlign: "center", marginTop: 32, marginBottom: 96 }}>
              <Pagination
                current={currentPage}
                pageSize={effectivePageSize}
                total={totalForPagination}
                onChange={(page) => handlePageChange(page)}
                showTotal={isMobile ? undefined : renderPaginationTotal}
                showSizeChanger={false}
                size={isMobile ? 'small' : undefined}
                style={{ minWidth: 200, display: "inline-block" }}
              />
            </Col>
          </Row>
        </>
      );
    } else {
      // Default (phan-mem)
      const currentLang = i18nInstance.language || 'vi';
      const { paginatedList, useServerPagination, totalForPagination, currentPage } = computePaging(filteredPosts);
      content = (
        <>
        <Row gutter={[24, 24]} style={{ padding: "32px 0" }} align="stretch">
          {paginatedList.map((post: ServicePost) => {
            const postTitle = getMultilingualField(post, 'title', currentLang);
            const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
            return (
            <Col xs={24} sm={12} md={12} lg={6} key={post.id!}>
              <a href={getServiceDetailUrl(post)} aria-label={postTitle} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
              <Card 
                hoverable 
                style={{
                  borderRadius: 18,
                  boxShadow: `0 2px 16px ${(category.color || '#1890ff')}11, var(--card-shadow, 0 4px 12px #0002)`,
                  border: `1.5px solid ${(category.color || '#1890ff')}22`,
                  background: 'var(--card-bg, #fff)',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                cover={(() => {
                  return (
                    <div style={{ position: 'relative', paddingBottom: '62%', overflow: 'hidden' }}>
                      {renderCardMedia(post, 'phan-mem', postTitle)}
                    </div>
                  );
                })()}
                bodyStyle={{ background: 'var(--card-bg, #fff)', color: 'var(--text-primary)' }}
              >
                <Space align="start" style={{ width: '100%' }}>
                  <Avatar shape="square" size={48} icon={<CodeOutlined />} style={{ background: category.color }} />
                  <div style={{ flex: 1 }}>
                    <Title level={5} style={{ margin: 0, lineHeight: 1.3, color: 'var(--text-primary)' }}>{postTitle}</Title>
                    <Text style={{ color: "var(--text-secondary)", fontSize: 13 }}>{getCategoryLabel(post.category)}</Text>
                      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {getRelativeTime(post.publishDate) && (
                          <Text style={{ color: "var(--text-secondary)", fontSize: 12 }}>{getRelativeTime(post.publishDate)}</Text>
                        )}
                        {post.expiryDate && (
                          <Tag color={formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange'} style={{ fontSize: 11, borderRadius: 6 }}>{formatExpiryDate(post.expiryDate)}</Tag>
                        )}
                      </div>
                  </div>
                </Space>
                {postExcerpt && (
                  <Paragraph style={{ color: "var(--text-secondary)", margin: "12px 0 0 0", fontSize: 14 }} ellipsis={{ rows: 2 }}>
                    {postExcerpt}
                  </Paragraph>
                )}
                <Row justify="space-between" align="middle" style={{ marginTop: 16 }}>
                  <Col>
                    {post.attributes?.rating && (
                      <Space>
                        <StarOutlined style={{ color: "#faad14" }} />
                        <Text strong>{post.attributes.rating} ({post.attributes.reviews} {t('website.services.detail.reviews', 'đánh giá')})</Text>
                      </Space>
                    )}
                  </Col>
                  <Col>
                    {(() => { const fpRaw = formatPrice(post.attributes); const fp = fpRaw ? normalizeDisplayValue(fpRaw, t) : ''; return <Text strong style={{ color: category.color, fontSize: 16 }}>{fp || t('website.services.detail.free', 'Miễn phí')}</Text>; })()}
                  </Col>
                </Row>
              </Card>
              </a>
            </Col>
            );
          })}
        </Row>
        <div style={{ textAlign: "center", marginTop: 32, marginBottom: 96 }}>
          <Pagination
            current={currentPage}
            pageSize={effectivePageSize}
            total={totalForPagination}
            onChange={(page) => handlePageChange(page)}
            showTotal={isMobile ? undefined : renderPaginationTotal}
            showSizeChanger={false}
            size={isMobile ? 'small' : undefined}
            style={{ minWidth: 200, display: "inline-block" }}
          />
        </div>
        </>
      );
    }
    // Default: just return the service list content
    // Category content is now rendered in header section (see tabItems below)
    return content;
  };

  // Create tab items with category key and rendered content, add SEO/semantic heading per tab
  const tabItems = visibleCategories.map(category => ({
    key: category.key,
    label: (
      <span style={{ display: 'none' }}>{(getHeaderMeta(category.key).title) || category.title}</span>
    ),
    children: (
      <section aria-labelledby={`tab-title-${category.key}`} style={{ minHeight: 400 }}>
        <header style={{ marginBottom: 24 }}>
          {(() => {
            const meta = getHeaderMeta(category.key);
            const color = meta.color || category.color;
            const title = meta.title || category.title;
            const desc = meta.description || category.description;
            const content = resolveCategoryLandingContent(category.key);
            
            return <>
              <h1 id={`tab-title-${category.key}`} style={{ fontSize: 28, fontWeight: 800, color, margin: 0, letterSpacing: 0.2, textShadow: `0 2px 8px ${color}22` }}>
                {meta.icon} <span style={{ marginLeft: 8 }}>{title}</span>
              </h1>
              <Paragraph style={{ fontSize: 17, color: 'var(--text-secondary)', margin: '8px 0 0 0' }}>{desc}</Paragraph>
              
              {/* 🎯 SEO OPTIMIZATION: Render category content for better indexing */}
              {content && (
                <div 
                  style={{ 
                    marginTop: 16,
                    padding: '16px 20px',
                    background: 'var(--card-bg, #fff)',
                    borderRadius: 12,
                    border: `1px solid ${color}22`,
                    boxShadow: `0 2px 12px ${color}11`,
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: 'var(--text-primary)'
                  }}
                  className="category-content-intro"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtmlForRender(decodeHtml(content) || '') }}
                />
              )}

            </>;
          })()}
        </header>
        {renderSearchBox(category)}
        <ActiveFilters categoryKey={category.key} color={category.color} />
        {renderServiceSection(category, activeTabKey)}
      </section>
    )
  }));

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Lấy dữ liệu SSR - backend đã xử lý phân trang qua query params
    try {
      const initialData = initialReactData;
      
      // Parse URL query params để lấy page number
      const urlParams = new URLSearchParams(window.location.search);
      const urlPage = parseNum(urlParams.get('page')) || 1;
      
      let dataList = null;
      let totalCount = 0;
      let nextCursor: string | null = null;
      let ssrPage = urlPage;  // Default từ URL
      
      // PRIORITY 1: Category page data (serviceDetailList)
      if (initialData && initialData.serviceDetailList) {
        if (Array.isArray(initialData.serviceDetailList) && initialData.serviceDetailList.length > 0) {
          dataList = initialData.serviceDetailList;
          totalCount = Number(initialData.totalCount) || dataList.length;
          nextCursor = initialData.nextCursor || null;
          ssrPage = Number(initialData.page) || urlPage;  // SSR page có ưu tiên cao hơn
        } else {
        }
      }
      
      // PRIORITY 2: Homepage data (homeDetailList) - only if serviceDetailList not available
      if (!dataList && initialData && initialData.homeDetailList) {
        if (Array.isArray(initialData.homeDetailList) && initialData.homeDetailList.length > 0) {
          dataList = initialData.homeDetailList;
          totalCount = Number(initialData.totalCount) || dataList.length;
          ssrPage = Number(initialData.page) || urlPage;
        }
      }
      
      if (dataList && dataList.length > 0) {
        // Normalize SSR data
        const allData = (dataList as any[]).map((r: any) => normalizeServiceDetail(r)) as ServicePost[];
        
        setServices(allData);
        setTotal(totalCount);
        
        // Seed pagination state với page từ SSR hoặc URL
        const serverPaginated = totalCount > allData.length || Boolean(nextCursor);
        if (activeTabKey) {
          setPagination(prev => ({ ...prev, [activeTabKey]: ssrPage }));
        }

        if (activeTabKey) {
          setSearchUsedServer(prev => ({ ...prev, [activeTabKey]: serverPaginated }));
        }
        setLoading(false);
        return;
      } else {
      }
    } catch (e) {
    }

    // Fallback: không có dữ liệu
    setServices([]);
    setTotal(0);
    setLoading(false);
  }, [activeTabKey, initialReactData]);

  // Lấy category đang active
  const activeCategory = allCategories.find(c => c.key === activeTabKey) || visibleCategories[0] || { key: '', title: '', color: '', icon: null, description: '' };

  // Xác định selectedKey cho menu/submenu (clean URLs)
  const selectedMenuKey = isBridgeLandingRoute
    ? '/hop-tac-kinh-doanh'
    : (slug ? `/${slug}` : (activeTabKey ? `/${activeTabKey}` : `/${DEFAULT_CATEGORY}`));

  if (isLotteryLandingRoute) {
    const lotteryKey = 'thong-ke-ket-qua-xo-so';
    const lotteryMeta = getHeaderMeta(lotteryKey);
    const lotteryColor = lotteryMeta.color || '#722ed1';
    const lotteryTitle = lotteryMeta.title || t('website.menu.lottery_statistics', 'Thống Kê Kết Quả Xổ Số');
    const lotteryDesc = lotteryMeta.description || t('website.services.lottery.description', 'Thống kê và tổng hợp dữ liệu kết quả xổ số theo ngày, đài và miền.');
    const lotteryContent = resolveCategoryLandingContent(lotteryKey);

    return (
      <WebsiteLayout menuItems={menuItems} selectedKey={selectedMenuKey}>
        <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 96px' }}>
          <section aria-labelledby="lottery-landing-title" style={{ background: 'var(--card-bg, #fff)', borderRadius: 20, border: `1px solid ${lotteryColor}22`, boxShadow: `0 8px 32px ${lotteryColor}11`, overflow: 'hidden' }}>
            <header style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${lotteryColor}18`, background: `linear-gradient(120deg, ${lotteryColor}12 0%, transparent 70%)` }}>
              <h1 id="lottery-landing-title" style={{ margin: 0, color: lotteryColor, fontWeight: 800, letterSpacing: 0.2, fontSize: 32, lineHeight: 1.25 }}>
                {lotteryMeta.icon} <span style={{ marginLeft: 8 }}>{lotteryTitle}</span>
              </h1>
              <Paragraph style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 17 }}>{lotteryDesc}</Paragraph>
            </header>

            <div style={{ padding: '20px 24px 28px' }}>
              <article
                className="category-content-intro"
                style={{ fontSize: 16, lineHeight: 1.85, color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlForRender(decodeHtml(lotteryContent) || '') }}
              />
            </div>
          </section>
        </main>
      </WebsiteLayout>
    );
  }

  return (
    <WebsiteLayout menuItems={menuItems} selectedKey={selectedMenuKey}>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, paddingBottom: 96 }}>
        <Tabs
          activeKey={activeTabKey}
          items={tabItems}
          onChange={handleTabChange}
          renderTabBar={CustomTabBar}
        />
      </main>
    </WebsiteLayout>
  );
};

export default WuServicesPage;
