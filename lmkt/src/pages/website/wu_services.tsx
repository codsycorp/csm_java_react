// Helper to get default category slug from SSR categories
function getDefaultCategorySlug() {
  if (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) {
    const cat = window.__SSR_WEBSITE_CATEGORIES__.find(
      (c) => typeof c === 'object' && c !== null && 'is_group_slug_default' in c && (c as any).is_group_slug_default === true
    );
    if (cat && (cat as any).slug) return (cat as any).slug;
  }
  return 'du-an';
}

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import i18n from "i18next";
// Hook đổi ngôn ngữ theo ?hl= trên URL
function useLanguageFromQuery() {
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hl = params.get("hl");
    // Chuẩn hóa mã ngôn ngữ về dạng đầy đủ để khớp resource: vi-VN, en-US, zh-CN
    let targetLang: string | undefined;
    if (hl === "vi") targetLang = "vi-VN";
    else if (hl === "en") targetLang = "en-US";
    else if (hl === "zh") targetLang = "zh-CN";
    // Áp dụng nếu có yêu cầu đổi ngôn ngữ
    if (targetLang) {
      i18n.changeLanguage(targetLang);
      // Xóa ?hl nếu là tiếng Việt để giữ URL sạch
      if (hl === "vi") {
        const url = new URL(window.location.href);
        params.delete("hl");
        url.search = params.toString();
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } else if (!i18n.language || i18n.language === "" || i18n.language === "cimode") {
      i18n.changeLanguage("vi-VN");
    }
  }, [location.search]);
}
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
  fetchServiceList, 
  getRelativeTime, 
  formatExpiryDate, 
  formatPrice,
  formatArea,
  formatBedrooms,
  formatBathrooms,
  getCategoryLabel,
  getCategoryDescription,
  getPropertyTypeLabel,
  getTransactionTypeLabel,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
  type ServicePost 
} from "#src/api/wu_service";
import { csmDecrypt } from "#src/components/CsmCrypto";

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

// Helper function to decode HTML or decrypt encrypted content
const decodeHtml = (html?: string): string | undefined => {
  if (!html) return html;
  
  // Nếu input chứa %, chắc chắn là dữ liệu cũ (URL-encoded), SKIP decrypt
  if (html.includes('%')) {
    try {
      const decoded = decodeURIComponent(html);
      console.log('✅ URL-decode success, returning decoded HTML');
      return decoded;
    } catch (e) {
      console.warn('⚠️ URL-decode failed:', e);
      // If decodeURIComponent fails, return as-is
      return html;
    }
  }
  
  // Kiểm tra nếu input là plain HTML/text - KHÔNG decrypt
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  const hasVietnamese = /[\u00C0-\u1EF9]/i.test(html); // Tiếng Việt Unicode range
  
  if (hasHtmlTags || hasVietnamese) {
    // Chắc chắn là plain text/HTML, KHÔNG phải encrypted
    console.log('✅ Input is plain HTML or Vietnamese text, using as-is');
    return html;
  }
  
  // Thử decrypt (cho dữ liệu MỚI - encrypted)
  try {
    const decrypted = csmDecrypt(html);
    console.log('✅ csmDecrypt returned result');
    // Kiểm tra nếu decrypt thành công: chứa HTML tags hợp lệ
    if (decrypted && typeof decrypted === 'string' && decrypted.length > 0) {
      // Nếu chứa HTML tag thì OK
      if (/<[a-z][\s\S]*>/i.test(decrypted)) {
        console.log('✅ Using decrypted result (contains valid HTML)');
        return decrypted;
      }
      console.warn('⚠️ Decrypt result doesn\'t contain HTML tags, likely corrupted');
    }
  } catch (e) {
    console.warn('❌ csmDecrypt failed:', (e as any).message);
  }
  
  // Fallback: return nguyên bản
  console.log('🔙 Using original input');
  return html;
};

export interface ServiceCategory {
  key: string;
  title: string;
  color: string;
  icon: React.ReactNode;
  description: string;
  content?: string;
  dynamicCodeName?: string;
}

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
      if (namePath) return namePath;
    } catch (e) {
      console.error(`❌ Failed to parse URL:`, url, e);
    }
  }
  return url;
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
  
  // Priority 1: Try images first (better for SEO/performance)
  const raw = post.thumbnail || (Array.isArray(post.images) ? post.images[0] : '');
  const normalized = normalizeImageUrl(raw);
  
  if (normalized) {
    // Image found - add ?w=480 for thumbnail optimization
    return { src: normalized + '?w=480', placeholder, type: 'image' as const };
  }
  
  // Priority 2: If no images, check for single video
  if (Array.isArray(post.videos) && post.videos.length === 1) {
    const videoUrl = normalizeImageUrl(post.videos[0]);
    if (videoUrl) {
      return { src: videoUrl, placeholder, type: 'video' as const };
    }
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
        poster={placeholder}
        muted
        loop
        playsInline
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

const WuServicesPage: React.FC = () => {
  useLanguageFromQuery();
  const { t, i18n: i18nInstance } = useTranslation();
  // Cleanup query params: backend fixes page size; remove client-side pagination params
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('take')) { url.searchParams.delete('take'); changed = true; }
    if (url.searchParams.has('pageSize')) { url.searchParams.delete('pageSize'); changed = true; }
    if (url.searchParams.has('lastkey')) { url.searchParams.delete('lastkey'); changed = true; }
    if (changed) {
      const newSearch = url.searchParams.toString();
      const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<ServicePost[]>([]);
  const [pagination, setPagination] = useState<Record<string, number>>({});
  const [beautyTypeFilter, setBeautyTypeFilter] = useState<'all' | 'my-pham' | 'spa'>('all');
  const [searchValues, setSearchValues] = useState<Record<string, Record<string, string>>>({});
  const [searchSubmitted, setSearchSubmitted] = useState<Record<string, boolean>>({});
  const [searchLoading, setSearchLoading] = useState<Record<string, boolean>>({});
  const [searchRequestCount, setSearchRequestCount] = useState<Record<string, number>>({});
  const [lastSearchTime, setLastSearchTime] = useState<Record<string, number>>({});
  const [searchUsedServer, setSearchUsedServer] = useState<Record<string, boolean>>({});
  const initializedSearchFromUrl = useRef(false);

  // Extract ssrServiceCategory from window for language-aware content
  const ssrServiceCategory = (() => {
    if (typeof window !== 'undefined') {
      const w: any = window;
      const initialData = w.__INITIAL_REACT_DATA__ || w.initialReactData;
      if (initialData && initialData.serviceCategory) {
        return initialData.serviceCategory;
      }
    }
    return null;
  })();

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

  // Scale numeric price inputs to a common unit
  const scalePriceInput = (catKey: string, raw?: string): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw);
    if (isNaN(n)) return undefined;
    if (catKey === 'du-an') return n * 1000000000;
    return n;
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

  // Security: Rate limiting for search requests (max 10 searches per minute per category)
  const checkSearchRateLimit = (categoryKey: string): boolean => {
    const now = Date.now();
    const lastTime = lastSearchTime[categoryKey] || 0;
    const count = searchRequestCount[categoryKey] || 0;
    
    const MAX_REQUESTS = 10;
    const TIME_WINDOW = 60000; // 1 minute
    
    // Reset counter if time window has passed
    if (now - lastTime > TIME_WINDOW) {
      setSearchRequestCount(prev => ({ ...prev, [categoryKey]: 1 }));
      setLastSearchTime(prev => ({ ...prev, [categoryKey]: now }));
      return true;
    }
    
    // Check if exceeded limit
    if (count >= MAX_REQUESTS) {
      console.warn('⚠️ Search rate limit exceeded for category:', categoryKey);
      setError(`Bạn đã tìm kiếm quá nhiều. Vui lòng đợi ${Math.ceil((TIME_WINDOW - (now - lastTime)) / 1000)}s`);
      return false;
    }
    
    // Increment counter
    setSearchRequestCount(prev => ({ ...prev, [categoryKey]: count + 1 }));
    return true;
  };

  // Function to fetch search results from backend
  const fetchSearchResults = async (categoryKey: string, searchParams: Record<string, string>, pageNum: number = 1) => {
    // Security: Check rate limit
    if (!checkSearchRateLimit(categoryKey)) {
      return;
    }
    
    // Security: Sanitize all search parameters
    const sanitizedParams: Record<string, string> = {};
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && value.trim() !== '') {
        sanitizedParams[key] = sanitizeInput(value);
      }
    });
    
    // Security: Validate sanitized params
    const validation = validateSearchParams(sanitizedParams);
    if (!validation.valid) {
      setError(validation.error || 'Invalid search parameters');
      return;
    }
    
    setSearchLoading(prev => ({ ...prev, [categoryKey]: true }));
    setError(null);
    
    try {
      const currentPath = (() => {
        const path = window.location.pathname || '/';
        if (path.includes(categoryKey)) return path;
        return `/${categoryKey}`;
      })();
      const queryParams = new URLSearchParams();
      
      // Add search parameters to query string (already sanitized)
      Object.entries(sanitizedParams).forEach(([key, value]) => {
        queryParams.append(key, value);
      });
      
      // Add pagination (validate numbers)
      const safePage = Math.max(1, Math.min(10000, pageNum)); // Limit page number
      queryParams.append('page', String(safePage));
      
      // Add language
      const currentLang = i18nInstance.language || 'vi';
      if (currentLang !== 'vi' && /^[a-z]{2}$/.test(currentLang)) { // Validate language code
        queryParams.append('hl', currentLang);
      }
      
      const searchUrl = `${currentPath}?${queryParams.toString()}`;
      console.log('🔍 Fetching search results from:', searchUrl);
      
      // Security: Set timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Security: Validate response size to prevent memory issues
      if (html.length > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Response too large');
      }
      
      // Parse HTML to extract __INITIAL_REACT_DATA__
      const scriptMatch = html.match(/window\.__INITIAL_REACT_DATA__\s*=\s*(\{[\s\S]*?\});/);
      if (scriptMatch && scriptMatch[1]) {
        try {
          const data = JSON.parse(scriptMatch[1]);
          console.log('✅ Parsed search results:', {
            serviceDetailList: data.serviceDetailList?.length || 0,
            homeDetailList: data.homeDetailList?.length || 0,
            totalCount: data.totalCount,
          });
          
          // Update services with search results (normalize to keep serviceType, attributes, etc.)
          const resultList = data.serviceDetailList || data.homeDetailList || [];
          const normalizedResults = (Array.isArray(resultList) ? resultList : []).map((item: any) => normalizeServiceDetail(item));
          setServices(normalizedResults);
          setTotal(Number(data.totalCount) || normalizedResults.length);
          setPagination(prev => ({ ...prev, [categoryKey]: safePage }));
          setSearchUsedServer(prev => ({ ...prev, [categoryKey]: true }));
          if (resultList.length === 0) {
            setError(t('website.services.no_results', 'Không tìm thấy kết quả'));
          }
          
          // Update URL without reloading
          const newUrl = `${currentPath}?${queryParams.toString()}`;
          window.history.pushState({}, '', newUrl);
          
        } catch (parseError) {
          console.error('❌ Failed to parse __INITIAL_REACT_DATA__:', parseError);
          throw new Error('Failed to parse search results');
        }
      } else {
        console.warn('⚠️ No __INITIAL_REACT_DATA__ found in response');
        throw new Error('No search results data found');
      }
      
    } catch (err) {
      console.error('❌ Search error:', err);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timeout - please try again');
      } else {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      setSearchLoading(prev => ({ ...prev, [categoryKey]: false }));
    }
  };

  // Smart parser: tự động phân tích text input và điền các trường tìm kiếm
  const parseSmartSearch = (categoryKey: string, text: string): Record<string, string> => {
    const parsed: Record<string, string> = {};
    const lower = text.toLowerCase().trim();
    
    if (categoryKey === 'du-an') {
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
  // Lĩnh vực mặc định - lấy động từ SSR categories
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

  // Get service category metadata with language-aware content
  // 🔧 FIX: Support multi-language description from SSR category object
  const getHeaderMeta = (categoryKey: string) => {
    const currentLang = i18n.language || 'vi-VN';
    
    // Try precise match from ssrServiceCategory (provided for current slug)
    if (ssrServiceCategory && typeof ssrServiceCategory === 'object') {
      const slug = String(ssrServiceCategory.slug || '').trim();
      if (slug && slug === categoryKey) {
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
        
        const content = ssrServiceCategory.content || '';
        const dynamicCodeName = (ssrServiceCategory as any).dynamic_code_name || (ssrServiceCategory as any).auto_code_name || '';
        
        return {
          key: categoryKey,
          title,
          description,
          color: ssrServiceCategory.color || '#13c2c2',
          icon: ssrServiceCategory.icon,
          content,
          dynamicCodeName,
        } as ServiceCategory;
      }
    }
    // Fallback to existing allCategories (built from SSR categories list, already language-aware)
    const found = allCategories.find(c => c.key === categoryKey);
    return found || { key: categoryKey, title: '', description: '', content: '', color: '#13c2c2', icon: <CodeOutlined /> } as ServiceCategory;
  };

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
      category: "Phần Mềm",
      slug: "phan-mem"
    },
    {
      color: "#13c2c2",
      icon: "EnvironmentOutlined",
      description: "Tin tức, dự án, mua bán, cho thuê nhà đất, căn hộ, biệt thự, ...",
      category: "Bất Động Sản",
      slug: "bat-dong-san"
    },
    {
      color: "#eb2f96",
      icon: "StarOutlined",
      description: "Sản phẩm làm đẹp, spa, thẩm mỹ viện, thương hiệu mỹ phẩm, ...",
      category: "Mỹ Phẩm & Làm Đẹp",
      slug: "lam-dep-my-pham"
    },
    {
      color: "#1890ff",
      icon: "CarOutlined",
      description: "Dịch vụ thuê xe tự lái, có lái, xe du lịch, xe cưới hỏi, ...",
      category: "Cho Thuê Xe 4-7 Chỗ",
      slug: "cho-thue-xe"
    },
    {
      color: "#faad14",
      icon: "CalendarOutlined",
      description: "Đặt lịch khám bệnh, làm đẹp, sự kiện, dịch vụ tiện ích, ...",
      category: "Đặt Lịch Online",
      slug: "booking-online"
    }
  ];
  // SSR categories injected from backend
  const ssrCategories = (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) ? window.__SSR_WEBSITE_CATEGORIES__ : [];
  // Type guard cho category chuẩn hóa
  function isSSRCategory(cat: any): cat is { color: string; icon: string; description: string; category: string; slug: string; group_slug: string; is_group_slug: boolean } {
    return cat && typeof cat === 'object' && 'color' in cat && 'icon' in cat && 'description' in cat && 'category' in cat && 'slug' in cat && 'group_slug' in cat && typeof cat.group_slug === 'string' && 'is_group_slug' in cat && typeof cat.is_group_slug === 'boolean';
  }
  // Lấy tất cả các dự án con từ group "du-an" từ SSR data
  const validCategories = (ssrCategories.length > 0 ? ssrCategories : defaultCategories)
    .filter(cat => {
      if (typeof cat !== 'object' || !isSSRCategory(cat)) return false;
      if (cat.group_slug === '' || cat.is_group_slug === true) return false;
      // Chỉ lấy các category con thuộc nhóm du-an
      return cat.group_slug === 'du-an';
    });
  const allCategories: ServiceCategory[] = validCategories.map(cat => ({
    key: typeof cat !== 'string' ? cat.slug : '',
    title: typeof cat !== 'string' ? getCategoryLabel(cat.slug) : '',
    color: typeof cat !== 'string' ? (cat.color || "#13c2c2") : "#13c2c2",
    icon: typeof cat !== 'string' ? (iconMap[cat.icon] || <EnvironmentOutlined />) : <EnvironmentOutlined />,
    description: typeof cat !== 'string' ? getCategoryDescription(cat.slug) : '',
    content: typeof cat !== 'string' ? (cat as any).content : '',
    dynamicCodeName: typeof cat !== 'string' ? ((cat as any).dynamic_code_name || (cat as any).auto_code_name || '') : '',
  }));

  // Định nghĩa các trường tìm kiếm đặc thù cho từng lĩnh vực, dùng đa ngôn ngữ
  // Mở rộng form tìm kiếm: hỗ trợ khoảng (min/max) và giới hạn nhập số cho trường số
  // Dùng useMemo để re-create khi ngôn ngữ thay đổi
  const searchFields: Record<string, Array<{ key: string; label: string; type?: string; options?: string[]; input?: 'text' | 'number' }>> = useMemo(() => ({
    "du-an": [
      { key: "q", label: t('website.services.search.keywords', 'Tìm kiếm thông minh (địa chỉ, loại hình, giá, diện tích...)'), input: 'text' },
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

      if (categoryKey === 'du-an') {
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
  const location = useLocation();
  const navigate = useNavigate();
  // Lấy ngôn ngữ hiện tại từ i18n hoặc URL, fallback 'vi'
  const currentLang = i18nInstance.language && i18nInstance.language !== 'cimode' ? i18nInstance.language : 'vi';
  const { lang, slug } = extractLangAndSlug(location.pathname);
  
  // Check if we're on a group route (e.g., /du-an accessed directly)
  // ssrCategories already declared at component scope level (line 786)
  const isGroupRoute = slug && ssrCategories.some(cat => cat && typeof cat === 'object' && cat.slug === slug && cat.is_group_slug === true);
  
  // Kiểm tra slug có hợp lệ không (không phải group route thì phải là valid category slug)
  useEffect(() => {
    if (slug && !isGroupRoute && !allCategories.some(c => c.key === slug)) {
      console.warn(`❌ Invalid category slug: ${slug}, redirecting to home`);
      navigate("/", { replace: true });
    }
  }, [slug, allCategories, isGroupRoute, navigate]);
  
  // If on a group route, redirect to default service route
  useEffect(() => {
    if (isGroupRoute && allCategories.length > 0) {
      const defaultServiceSlug = allCategories[0].key;
      const targetUrl = `/${defaultServiceSlug}`;
      console.log(`🔄 Redirecting group route /${slug} to default service: ${targetUrl}`);
      window.location.href = targetUrl;
    }
  }, [isGroupRoute, slug, allCategories]);
  
  // Lấy key lĩnh vực từ slug hoặc fallback
  function getCategoryKeyFromUrl() {
    if (slug && allCategories.some(c => c.key === slug)) {
      return slug;
    }
    if (allCategories.some(c => c.key === DEFAULT_CATEGORY)) {
      return DEFAULT_CATEGORY;
    }
    if (allCategories.length > 0 && allCategories[0].key) {
      return allCategories[0].key;
    }
    return '';
  }
  const [activeTabKey, setActiveTabKey] = useState(getCategoryKeyFromUrl());

  // Initialize activeTabKey based on URL slug and available categories
  useEffect(() => {
    const targetKey = getCategoryKeyFromUrl();
    if (targetKey && targetKey !== activeTabKey) {
      setActiveTabKey(targetKey);
    }
  }, [slug, allCategories, activeTabKey]);

  // Khi đổi tab: reload trang với URL mới, SSR sẽ xử lý
  const handleTabChange = (key: string) => {
    if (key !== activeTabKey) {
      let url = `/${key}`;
      const langCode = (currentLang && currentLang !== 'vi') ? currentLang.split('-')[0].slice(0, 2) : '';
      if (langCode && langCode !== 'vi') {
        url += `?hl=${langCode}`;
      }
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

  // Prefill search form from URL params on first load (so reload keeps user query)
  useEffect(() => {
    if (initializedSearchFromUrl.current) return;
    const params = new URLSearchParams(window.location.search || "");
    if (!params || params.toString() === "") return;

    const obj: Record<string, string> = {};
    params.forEach((v, k) => {
      if (k === "page" || k === "pageSize") return; // handled separately
      obj[k] = v;
    });

    const hasValues = Object.values(obj).some(Boolean);
    const urlPage = Number(params.get("page")) || 1;

    setSearchValues((prev) => ({ ...prev, [activeTabKey]: obj }));
    setSearchSubmitted((prev) => ({ ...prev, [activeTabKey]: hasValues }));
    setSearchUsedServer((prev) => ({ ...prev, [activeTabKey]: hasValues }));
    setPagination((prev) => ({ ...prev, [activeTabKey]: urlPage }));

    initializedSearchFromUrl.current = true;
  }, [activeTabKey, initializedSearchFromUrl]);

  const getPostsByServiceType = (key: string): ServicePost[] => {
    // API only: không dùng mock
    return services.filter(p => p.serviceType === key);
  };
  const formatDate = (date?: string) => date ? new Date(date).toLocaleDateString() : "";
  // Build SEO friendly href for service detail
  const getServiceDetailUrl = (post: ServicePost) => {
    const langCode = (currentLang && currentLang !== 'vi') ? currentLang.split('-')[0].slice(0,2) : '';
    let url = `/${post.serviceType}/${post.slug}`;
    if (langCode && langCode !== 'vi') url += `?hl=${langCode}`;
    return url;
  };

  // Hàm render search box đặc thù cho từng lĩnh vực
  function renderSearchBox(category: ServiceCategory) {
    const fields = searchFields[category.key] || [{ key: "q", label: t('website.search.keyword', 'Từ khóa') }];
    const values = searchValues[category.key] || {};
    
    const handleSearchSubmit = async () => {
      console.log('🔍 Search submitted for', category.key, 'with values:', values);
      setError(null);
      
      // Mark as submitted for UI state
      setSearchSubmitted(s => ({ ...s, [category.key]: true }));
      
      // If there are search values, fetch from backend
      const hasSearchValues = Object.values(values).some(v => v && v.trim() !== '');
      if (hasSearchValues) {
        setSearchUsedServer(prev => ({ ...prev, [category.key]: true }));
        await fetchSearchResults(category.key, values, 1);
      } else {
        // No filters: reset to default list
        setSearchSubmitted(s => ({ ...s, [category.key]: false }));
        setSearchUsedServer(prev => ({ ...prev, [category.key]: false }));
        setPagination(prev => ({ ...prev, [category.key]: 1 }));
        const url = new URL(window.location.href);
        const langParam = url.searchParams.get('hl');
        url.pathname = `/${category.key}`;
        url.search = '';
        if (langParam) url.searchParams.set('hl', langParam);
        window.location.href = url.toString();
      }
    };
    
    return (
      <Form
        layout="vertical"
        onFinish={handleSearchSubmit}
        style={{ marginBottom: 24, background: "var(--card-bg)", borderRadius: 16, padding: 16, boxShadow: `0 2px 12px ${category.color}22` }}
        initialValues={values}
      >
        <AntRow gutter={12} align="middle">
          {fields.map(field => (
            <AntCol xs={24} sm={12} md={8} lg={6} key={field.key}>
              {field.type === "select" ? (
                <Form.Item name={field.key} label={field.label} style={{ marginBottom: 8 }}>
                  <Select
                    allowClear
                    placeholder={field.label}
                    value={values[field.key]}
                    style={{ width: "100%", borderRadius: 12, borderColor: category.color }}
                    onChange={v => setSearchValues(s => ({ ...s, [category.key]: { ...s[category.key], [field.key]: v || "" } }))}
                    options={field.options?.map(opt => ({ value: opt, label: opt }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item name={field.key} label={field.label} style={{ marginBottom: 8 }}>
                  {field.input === 'number' ? (
                    <Input
                      allowClear
                      type="number"
                      min={0}
                      step="any"
                      placeholder={(() => {
                        // Add unit hint in placeholder
                        const isPrice = field.key.startsWith('price_');
                        const isArea = field.key.startsWith('area_');
                        const isBedrooms = field.key === 'bedrooms';
                        const isSeats = field.key === 'seats';
                        let unit = '';
                        if (isPrice) {
                          if (category.key === 'du-an') unit = ' (tỷ)';
                          else unit = ' (k)';
                        } else if (isArea) unit = ' (m²)';
                        else if (isBedrooms || isSeats) unit = ' (#)';
                        return field.label + unit;
                      })()}
                      value={values[field.key] || ''}
                      style={{ width: '100%', borderRadius: 12, borderColor: category.color }}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Only allow numeric values
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setSearchValues(s => ({ ...s, [category.key]: { ...s[category.key], [field.key]: val } }));
                        }
                      }}
                      onPressEnter={() => setSearchSubmitted(s => ({ ...s, [category.key]: true }))}
                    />
                  ) : (
                    <Input
                      allowClear
                      placeholder={field.label}
                      value={values[field.key] || ''}
                      maxLength={500}
                      style={{ borderRadius: 12, borderColor: category.color }}
                      onChange={e => {
                        let val = e.target.value;
                        
                        // Security: Basic sanitization on input (allow user to type but warn about dangerous content)
                        const hasDangerousContent = /<script|<iframe|javascript:|on\w+=/i.test(val);
                        if (hasDangerousContent) {
                          console.warn('⚠️ Potentially dangerous content detected in input');
                          // Remove dangerous patterns but allow user to continue typing
                          val = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                   .replace(/javascript:/gi, '')
                                   .replace(/on\w+\s*=/gi, '');
                        }
                        
                        // Tránh auto tách thông minh gây lọc sai; chỉ lưu đúng text người dùng nhập
                        if (field.key === 'q') {
                          setSearchValues(s => ({ ...s, [category.key]: { ...s[category.key], q: val } }));
                        } else {
                          setSearchValues(s => ({ ...s, [category.key]: { ...s[category.key], [field.key]: val } }));
                        }
                      }}
                      onPressEnter={() => setSearchSubmitted(s => ({ ...s, [category.key]: true }))}
                    />
                  )}
                </Form.Item>
              )}
            </AntCol>
          ))}
          <AntCol xs={24} sm={12} md={8} lg={4}>
            <Form.Item label=" " style={{ marginBottom: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={searchLoading[category.key]}
                disabled={searchLoading[category.key]}
                style={{ width: "100%", height: 40, borderRadius: 12, background: category.color, borderColor: category.color, fontWeight: 600 }}
                icon={!searchLoading[category.key] && <span className="anticon"><svg width="1em" height="1em" fill="currentColor" viewBox="0 0 1024 1024"><path d="M909.6 834.8L700.6 625.8c54.4-70.4 86.8-158.4 86.8-254.2C787.4 167.6 619.8 0 409.7 0S32 167.6 32 371.6s167.6 371.6 377.7 371.6c95.8 0 183.8-32.4 254.2-86.8l209 209c15.6 15.6 40.8 15.6 56.4 0 15.6-15.6 15.6-40.8 0-56.4zM409.7 640c-148.2 0-268.4-120.2-268.4-268.4S261.5 103.2 409.7 103.2 678.1 223.4 678.1 371.6 557.9 640 409.7 640z"></path></svg></span>}
              >
                {searchLoading[category.key] ? t('website.services.searching', 'Đang tìm...') : t('website.services.search_button', 'Tìm kiếm')}
              </Button>
            </Form.Item>
          </AntCol>
        </AntRow>
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
    
    // Handle page change for pagination - always delegate to server and preserve filters
    const handlePageChange = (newPage: number) => {
      const currentPath = window.location.pathname || `/${category.key}`;
      const queryParams = new URLSearchParams();

      // Copy ALL existing search parameters from URL (preserve filters)
      const currentUrl = new URL(window.location.href);
      const urlParams = new URLSearchParams(currentUrl.search);
      for (const [key, value] of urlParams.entries()) {
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

      // Server handles pagination logic entirely; client sets page only
      queryParams.set('page', String(newPage));

      // Add language for non-vi
      const currentLang = i18nInstance.language || 'vi';
      if (currentLang !== 'vi' && /^[a-z]{2}$/.test(currentLang)) {
        queryParams.set('hl', currentLang);
      }

      const newUrl = `${currentPath}?${queryParams.toString()}`;
      window.location.href = newUrl;
    };
    
    // Show loading spinner when searching
    if (searchLoading[category.key]) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Spin size="large" tip={t('website.services.loading_search', 'Đang tìm kiếm...')} />
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

    // Lọc theo nhiều trường search nếu có, chỉ lọc khi đã submit
    const searchObj = searchValues[category.key] || {};
    const submitted = searchSubmitted[category.key];
    const filteredPosts = filterPostsForCategory(category.key, uniquePosts, searchObj, submitted);

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
    if (category.key === "du-an") {
      // Real Estate: Luxury grid with premium styling
      const currentLang = i18nInstance.language || 'vi';
      const currentPage = pagination[category.key] || 1;
      const paginatedPosts = filteredPosts;
      content = (
        <>
          <Row gutter={[24, 28]} style={{ padding: "32px 0" }} align="stretch">
            {paginatedPosts.map((post: ServicePost) => {
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
                      cover={<div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18, background: 'linear-gradient(135deg, #13c2c211 0%, #13c2c207 100%)' }}>{renderCardMedia(post, 'du-an', postTitle)}{transactionLabel && <Tag color={transactionLabel === "Bán" ? "#52c41a" : "#faad14"} style={{ position: "absolute", bottom: 12, left: 12, fontWeight: 700, fontSize: 11, borderRadius: 6, color: '#fff', border: 'none', backdropFilter: 'blur(6px)', background: transactionLabel === "Bán" ? 'rgba(82, 196, 26, 0.85)' : 'rgba(250, 173, 20, 0.85)', padding: '4px 10px', letterSpacing: '0.5px' }}>{transactionLabel}</Tag>}{propertyTypeLabel && <Tag color="#1890ff" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, borderRadius: 6, color: '#fff', border: 'none', fontWeight: 600, backdropFilter: 'blur(6px)', background: 'rgba(24, 144, 255, 0.85)', padding: '4px 8px', letterSpacing: '0.3px' }}>{propertyTypeLabel}</Tag>}</div>}
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
          <Col span={24} style={{ textAlign: "center", marginTop: 32 }}>
            <Pagination 
              current={pagination[category.key] || 1} 
              pageSize={12} 
              total={total > 0 ? total : filteredPosts.length} 
              onChange={(page) => handlePageChange(page)} 
              showTotal={renderPaginationTotal}
              showSizeChanger={false} 
              style={{ minWidth: 200, display: "inline-block" }} 
            />
          </Col>
        </>
      );
    } else if (category.key === "lam-dep-my-pham") {
      // Beauty & Cosmetics: Elegant, soft, feminine design with premium feel
      const currentLang = i18nInstance.language || 'vi';
      const currentPage = pagination[category.key] || 1;
      const filteredByType = filteredPosts.filter((post: ServicePost) => {
        if (beautyTypeFilter === 'all') return true;
        const t = String(post.attributes?.type || '').toLowerCase();
        return t === beautyTypeFilter;
      });
      const paginatedPosts = filteredByType;
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
            {paginatedPosts.map((post: ServicePost) => {
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
                  cover={(() => {
                    return (
                      <div style={{ position: 'relative', paddingBottom: '62%', overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                        {renderCardMedia(post, 'lam-dep-my-pham', postTitle)}
                      </div>
                    );
                  })()}
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
            <Col span={24} style={{ textAlign: "center", marginTop: 32 }}>
              <Pagination
                current={pagination[category.key] || 1}
                pageSize={12}
                total={total > 0 ? total : filteredByType.length}
                onChange={(page) => handlePageChange(page)}
                showTotal={renderPaginationTotal}
                showSizeChanger={false}
                style={{ minWidth: 200, display: "inline-block" }}
              />
            </Col>
          </Row>
        </>
      );
    } else if (category.key === "cho-thue-xe") {
      // Car Rental: Dynamic, modern, professional design
      const currentLang = i18nInstance.language || 'vi';
      const currentPage = pagination[category.key] || 1;
      const paginatedPosts = filteredPosts;
      content = (
        <>
          <Row gutter={[24, 28]} style={{ padding: "32px 0" }} align="stretch">
            {paginatedPosts.map((post: ServicePost) => {
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
                  cover={(() => {
                    return (
                      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18, background: 'linear-gradient(135deg, #1890ff11 0%, #1890ff07 100%)' }}>
                        {renderCardMedia(post, 'cho-thue-xe', postTitle)}
                      </div>
                    );
                  })()}
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
            <Col span={24} style={{ textAlign: "center", marginTop: 32 }}>
              <Pagination
                current={pagination[category.key] || 1}
                pageSize={12}
                total={total > 0 ? total : filteredPosts.length}
                onChange={(page) => handlePageChange(page)}
                showSizeChanger={false}
                style={{ minWidth: 200, display: "inline-block" }}
              />
            </Col>
          </Row>
        </>
      );
    } else if (category.key === "booking-online") {
      // Booking Online: Event-style, vibrant, modern design
      const currentLang = i18nInstance.language || 'vi';
      const currentPage = pagination[category.key] || 1;
      const paginatedPosts = filteredPosts;
      content = (
        <>
          <Row gutter={[24, 28]} style={{ padding: "32px 0" }} align="stretch">
            {paginatedPosts.map((post: ServicePost) => {
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
            <Col span={24} style={{ textAlign: "center", marginTop: 32 }}>
              <Pagination
                current={pagination[category.key] || 1}
                pageSize={12}
                total={total > 0 ? total : filteredPosts.length}
                onChange={(page) => handlePageChange(page)}
                showSizeChanger={false}
                style={{ minWidth: 200, display: "inline-block" }}
              />
            </Col>
          </Row>
        </>
      );
    } else {
      // Default (phan-mem)
      const currentLang = i18nInstance.language || 'vi';
      const currentPage = pagination[category.key] || 1;
      const paginatedPosts = filteredPosts;
      content = (
        <Row gutter={[24, 24]} style={{ padding: "32px 0" }} align="stretch">
          {paginatedPosts.map((post: ServicePost) => {
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
          <Col span={24} style={{ textAlign: "center", marginTop: 32 }}>
            <Pagination
              current={pagination[category.key] || 1}
              pageSize={12}
              total={total > 0 ? total : filteredPosts.length}
              onChange={(page) => handlePageChange(page)}
              showTotal={renderPaginationTotal}
              showSizeChanger={false}
              style={{ minWidth: 200, display: "inline-block" }}
            />
          </Col>
        </Row>
      );
    }
    return (
      <div>
        {content}
      </div>
    );
  };

  // Create tab items with category key and rendered content, add SEO/semantic heading per tab
  const tabItems = allCategories.map(category => ({
    key: category.key,
    label: (
      <span style={{ display: 'none' }}>{category.title}</span>
    ),
    children: (
      <section aria-labelledby={`tab-title-${category.key}`} style={{ minHeight: 400 }}>
        <header style={{ marginBottom: 24 }}>
          {(() => {
            const meta = getHeaderMeta(category.key);
            const color = meta.color || category.color;
            const title = meta.title || category.title;
            const desc = meta.description || category.description;
            const content = meta.content || '';
            
            return <>
              <h1 id={`tab-title-${category.key}`} style={{ fontSize: 28, fontWeight: 800, color, margin: 0, letterSpacing: 0.2, textShadow: `0 2px 8px ${color}22` }}>
                {meta.icon || category.icon} <span style={{ marginLeft: 8 }}>{title}</span>
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
                  dangerouslySetInnerHTML={{ __html: decodeHtml(content) || '' }}
                />
              )}

              <div id={`wu-dynamic-code-${category.key}`} style={{ marginTop: 16 }} />
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
      const w: any = typeof window !== 'undefined' ? window : undefined;
      const initialData = w && (w.__INITIAL_REACT_DATA__ || w.initialReactData);
      
      // Debug: log toàn bộ initialData
      console.log('🔍 SSR initialData keys:', initialData ? Object.keys(initialData) : 'null');
      console.log('🔍 Current activeTabKey:', activeTabKey);
      console.log('🔍 URL path:', window.location.pathname);
      
      let dataList = null;
      let totalCount = 0;
      
      // PRIORITY 1: Category page data (serviceDetailList)
      if (initialData && initialData.serviceDetailList) {
        if (Array.isArray(initialData.serviceDetailList) && initialData.serviceDetailList.length > 0) {
          dataList = initialData.serviceDetailList;
          totalCount = Number(initialData.totalCount) || dataList.length;
          console.log('📊 Using serviceDetailList (category page):', {
            count: dataList.length,
            totalCount: totalCount,
            page: initialData.page,
            pageSize: initialData.pageSize
          });
        } else {
          console.warn('⚠️ serviceDetailList exists but is empty or not array:', initialData.serviceDetailList);
        }
      }
      
      // PRIORITY 2: Homepage data (homeDetailList) - only if serviceDetailList not available
      if (!dataList && initialData && initialData.homeDetailList) {
        if (Array.isArray(initialData.homeDetailList) && initialData.homeDetailList.length > 0) {
          dataList = initialData.homeDetailList;
          totalCount = Number(initialData.totalCount) || dataList.length;
          console.log('📊 Using homeDetailList (homepage):', {
            count: dataList.length,
            totalCount: totalCount
          });
        }
      }
      
      if (dataList && dataList.length > 0) {
        // Normalize SSR data
        const allData = (dataList as any[]).map((r: any) => normalizeServiceDetail(r)) as ServicePost[];
        setServices(allData);
        setTotal(totalCount);
        console.log('✅ Set services:', allData.length, 'total:', totalCount);
        setLoading(false);
        return;
      } else {
        console.warn('⚠️ No valid data found in SSR initialData');
      }
    } catch (e) {
      console.error('❌ Error loading SSR data:', e);
    }

    // Fallback: không có dữ liệu
    setServices([]);
    setTotal(0);
    setLoading(false);
  }, [activeTabKey]);

  useEffect(() => {
    if (!activeTabKey) return;

    const categoryMeta = getHeaderMeta(activeTabKey) as ServiceCategory;
    const codeName = String(categoryMeta.dynamicCodeName || '').trim();

    if (!codeName || typeof window === 'undefined') return;

    const codeMap = (window as any).__SSR_DYNAMIC_CODE_TEMPLATES__;
    const code = codeMap && typeof codeMap === 'object' && typeof codeMap[codeName] === 'string'
      ? codeMap[codeName]
      : null;

    if (!code) return;

    const containerId = `wu-dynamic-code-${activeTabKey}`;
    const timerId = window.setTimeout(() => {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '';
      try {
        const fn = new Function(
          'seft',
          `try{\n${code}\n} catch (dynamicErr) { console.error('[WU_DYNAMIC_CODE] Error:', dynamicErr); }`
        );
        fn({
          app_id: 'lmkt',
          categoryKey: activeTabKey,
          containerId,
          getContainer: () => document.getElementById(containerId),
          navigate,
          t,
          i18n: i18nInstance,
        });
      } catch (err) {
        console.error('[WU_DYNAMIC_CODE] Invalid code:', err);
      }
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [activeTabKey, navigate, t]);

  // Lấy category đang active
  const activeCategory = allCategories.find(c => c.key === activeTabKey) || allCategories[0] || { key: '', title: '', color: '', icon: null, description: '' };

  // Xác định selectedKey cho menu/submenu - phải có .shtml để khớp với menu definition
  const selectedMenuKey = activeTabKey ? `/${activeTabKey}` : `/${DEFAULT_CATEGORY}`;
  return (
    <WebsiteLayout menuItems={menuItems} selectedKey={selectedMenuKey}>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <Tabs
          activeKey={activeTabKey}
          items={tabItems}
          onChange={handleTabChange}
          renderTabBar={CustomTabBar}
        />
      </main>
      {/* SEO Breadcrumb structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": (() => {
          const items = [
            { "@type": "ListItem", "position": 1, "name": t('website.menu.home', 'Trang chủ'), "item": `${window.location.origin}/` },
            { "@type": "ListItem", "position": 2, "name": t('website.menu.real_estate', 'Bất động sản'), "item": `${window.location.origin}/${DEFAULT_CATEGORY}` }
          ];
          if (activeCategory && activeCategory.title && activeCategory.key !== DEFAULT_CATEGORY) {
            items.push({ "@type": "ListItem", "position": items.length + 1, "name": activeCategory.title, "item": `${window.location.origin}/${activeCategory.key}` });
          }
          return items;
        })()
      }) }} />
    </WebsiteLayout>
  );
};

export default WuServicesPage;
