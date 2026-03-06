import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';
import i18n from 'i18next';
import InternalChatBox from '#src/components/InternalChatBox';
import type { ChatMessage } from '#src/model/ChatMessage';
import { useSocket } from '#src/hooks/useSocket';
import { useGuestPhone } from '#src/hooks/useGuestPhone';
import { useUserStore } from '#src/store/user';
import { useAppStore } from '#src/store/app';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Row,
  Col,
  Typography,
  Image,
  Button,
  Rate,
  Descriptions,
  Card,
  Tag,
  Space,
  Divider,
  Empty,
  Result,
  Breadcrumb,
  Form,
  Modal,
  Input,
  DatePicker,
  message,
  Pagination,
} from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
  HomeOutlined, SkinOutlined, CarOutlined, ShoppingOutlined, AreaChartOutlined, CompassOutlined, CheckCircleOutlined, TagOutlined, GlobalOutlined, InboxOutlined, SafetyCertificateOutlined, TeamOutlined, CarFilled,
  LeftOutlined, RightOutlined,
  ZoomInOutlined, ZoomOutOutlined, RotateLeftOutlined, RotateRightOutlined
} from '@ant-design/icons';
import WebsiteLayout from '#src/layout/website/WebsiteLayout';
import { 
  getRelativeTime, 
  formatExpiryDate,
  formatPrice,
  formatArea,
  formatBedrooms,
  formatBathrooms,
  getCategoryLabel
} from '#src/api/wu_service';
import type { ServicePost } from '#src/api/wu_service';
import { useWebsiteMenu } from '#src/layout/website/wu_menu';
import MediaGallery from '#src/components/MediaGallery';

// Helper function to get multilingual field value
const getMultilingualField = (obj: any, fieldName: string, currentLang: string): string => {
  if (!obj) return '';
  if (currentLang === 'vi') return obj[fieldName] || '';
  const langField = `${fieldName}_${currentLang}`;
  return obj[langField] || obj[fieldName] || '';
};

// Chuẩn hóa giá trị thông số: coi các placeholder như "N/A", "NA", "null" là chưa có dữ liệu
const PLACEHOLDER_MARKERS = ['n/a', 'na', 'n.a', 'null', 'undefined', 'dangcapnhat', 'dangcapnhat.', 'dangcapnhat..', 'dang cap nhat', 'updating', 'pending', '-', '--'];
const isMissingSpecValue = (value: any): boolean => {
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

const normalizeSpecValue = (value: any, t: any) => {
  if (isMissingSpecValue(value)) return t('website.services.detail.not_available', 'Chưa cập nhật');
  return typeof value === 'string' ? value.trim() : value;
};

import { normalizeServiceDetail } from "../../utils/normalize";
import { getDefaultCategorySlug } from '../../utils/getDefaultCategorySlug';
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { createOrUpdateCustomer, type CRMCustomer } from "#src/components/csm-grid/CsmApi";
const { Title, Paragraph, Text } = Typography;

type TrafficAttribution = {
  source: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrer: string;
  landingPage: string;
};

const normalizeSourceName = (value?: string): string => {
  const raw = (value || '').toLowerCase().trim();
  if (!raw) return '';
  if (raw.includes('facebook') || raw.includes('fb') || raw.includes('instagram') || raw.includes('ig')) return 'facebook';
  if (raw.includes('zalo')) return 'zalo';
  if (raw.includes('google') || raw.includes('gads') || raw.includes('google_ads') || raw.includes('adwords')) return 'google';
  return raw;
};

const detectTrafficAttribution = (): TrafficAttribution => {
  if (typeof window === 'undefined') {
    return {
      source: 'direct',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      referrer: '',
      landingPage: '',
    };
  }

  const params = new URLSearchParams(window.location.search || '');
  const utmSourceRaw = params.get('utm_source') || '';
  const utmMedium = params.get('utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || '';
  const referrer = document.referrer || '';
  const hasGclid = params.has('gclid');
  const hasFbclid = params.has('fbclid');
  const utmSource = normalizeSourceName(utmSourceRaw);

  let source = 'direct';
  if (utmSource) {
    source = utmSource;
  } else if (hasFbclid) {
    source = 'facebook';
  } else if (hasGclid) {
    source = 'google';
  } else if (referrer) {
    source = normalizeSourceName(referrer) || 'referral';
  }

  return {
    source,
    utmSource,
    utmMedium,
    utmCampaign,
    referrer,
    landingPage: window.location.href,
  };
};

// SSR-safe lấy slug mặc định
const DEFAULT_CATEGORY = typeof window !== 'undefined' ? getDefaultCategorySlug() : 'phan-mem';

// Helper function to decode URL-encoded HTML
// Helper function to decode HTML - csmDecrypt đã tự làm decodeURIComponent bên trong
// Nếu decrypt fail (dữ liệu cũ), fallback về decodeURIComponent
const decodeHtml = (html?: string): string | undefined => {
  if (!html) return html;
  console.log('🔍 decodeHtml input (first 100 chars):', html.substring(0, 100));
  
  // Nếu input chứa %, chắc chắn là dữ liệu cũ (URL-encoded), SKIP decrypt
  if (html.includes('%')) {
    console.log('📄 Input contains %, skipping decrypt (old URL-encoded data)');
    try {
      const decoded = decodeURIComponent(html);
      console.log('✅ decodeURIComponent success (first 100 chars):', decoded.substring(0, 100));
      return decoded;
    } catch (e) {
      console.warn('⚠️ decodeURIComponent failed:', e);
      return html;
    }
  }
  
  // Kiểm tra nếu input là plain HTML/text - KHÔNG decrypt
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  const hasVietnamese = /[\u00C0-\u1EF9]/i.test(html); // Tiếng Việt Unicode range
  
  if (hasHtmlTags || hasVietnamese) {
    // Chắc chắn là plain text/HTML, KHÔNG phải encrypted
    console.log('✅ Input is plain HTML or Vietnamese text (not encrypted), using as-is');
    return html;
  }
  
  // Thử decrypt (cho dữ liệu MỚI - encrypted)
  try {
    const decrypted = csmDecrypt(html);
    console.log('✅ csmDecrypt returned (first 100 chars):', decrypted?.substring(0, 100));
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

// Helper function to normalize image URL (fix old /images.shtml format)
const normalizeImageUrl = (url?: string): string | undefined => {
  if (!url) return url;
  
  // Fix old format: /images.shtml?app_id=xxx&name=/app_images/... → /app_images/...
  if (url.includes('/images.shtml')) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const namePath = urlObj.searchParams.get('name');
      if (namePath) {
        return namePath;
      }
    } catch (e) {
      console.error(`Failed to parse URL:`, url, e);
    }
  }
  
  return url;
};

// ---------------- REMOVED OLD ImageGallery - Now using MediaGallery component ----------------

// Simple SVG placeholder as data URL in case remote image URLs fail
const svgPlaceholder = (label: string, w = 1200, h = 800) => {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
      <defs>
        <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
          <stop offset='0%' stop-color='#e6f0ff'/>
          <stop offset='100%' stop-color='#f5f7fb'/>
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <g fill='#8aa0c7' font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle'>
        <text x='50%' y='48%' font-size='42' font-weight='700'>Hình minh họa</text>
        <text x='50%' y='58%' font-size='26' opacity='0.8'>${label || 'CSM'}</text>
      </g>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Helper: Parse JSON field safely
function parseJsonField<T>(value: any, defaultValue: T): T {
  if (!value) return defaultValue;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      let parsed = JSON.parse(value);
      // Handle double-stringified JSON
      if (Array.isArray(parsed)) {
        parsed = parsed.map((item: any) => {
          if (typeof item === 'string') {
            try {
              return JSON.parse(item);
            } catch {
              return item;
            }
          }
          return item;
        }).filter((item: any) => item && (typeof item === 'string' ? item.trim().length > 0 : true));
      }
      return parsed as T;
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

// Helper: Map SSR detail to ServicePost
function mapSsrDetailToPost(sd: any): ServicePost {
  const images = parseJsonField<string[]>(sd.images, []);
  const videos = parseJsonField<string[]>(sd.videos, []); // Parse videos field
  // Parse thumbnail/cover - they might be arrays or JSON strings
  const getThumbnailString = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') {
      // Try to parse if it's a JSON array string
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed[0] || '';
        return value;
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) return value[0] || '';
    return String(value);
  };
  
  // Flatten all fields with attributes_ and specifications_ prefix, plus all other flat fields
  const flatFields: Record<string, any> = {};
  Object.keys(sd).forEach(key => {
    // Copy all flat fields from database except the ones we explicitly map below
    const excludeKeys = ['id', 'title', 'slug', 'excerpt', 'content', 'service_type', 'thumbnail', 
                         'cover', 'publish_date', 'expiry_date', 'tags', 'keywords', 'featured', 
                         'activeHome', 'images', 'videos'];
    if (!excludeKeys.includes(key)) {
      // Decode multilingual content fields (content_en, content_fr, etc.)
      if (key.startsWith('content_')) {
        flatFields[key] = decodeHtml(sd[key]);
      } 
      // Also handle URL-encoded excerpt variants (excerpt_en, excerpt_fr, etc.)
      else if (key.startsWith('excerpt_') && sd[key] && typeof sd[key] === 'string' && sd[key].includes('%')) {
        try {
          flatFields[key] = decodeURIComponent(sd[key]);
        } catch (e) {
          flatFields[key] = sd[key];
        }
      } 
      else {
        flatFields[key] = sd[key];
      }
    }
  });
  
  const mapped = {
    id: String(sd.id || ''),
    title: String(sd.title || ''),
    slug: sd.slug || '',
    excerpt: sd.excerpt || '',
    content: decodeHtml(sd.content) || '',
    category: sd.service_type || '',
    serviceType: sd.service_type || '',
    thumbnail: getThumbnailString(sd.thumbnail) || getThumbnailString(sd.cover) || '',
    publishDate: sd.publish_date || '',
    readTime: '',
    expiryDate: sd.expiry_date || '',
    views: 0,
    tags: (sd.tags || sd.keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean),
    featured: Boolean(sd.featured),
    activeHome: Boolean(sd.activeHome),
    ...flatFields,
    images,
    videos,
  } as ServicePost;
  
  return mapped;
}

// Hook lấy chi tiết dịch vụ từ SSR (không gọi API phía client)
function useServiceDetailAndRelated(category: string | undefined, id: string | undefined) {
  const [post, setPost] = React.useState<ServicePost | null>(null);
  const [relatedPosts, setRelatedPosts] = React.useState<ServicePost[]>([]);  // Chỉ trang hiện tại
  const [totalRelated, setTotalRelated] = React.useState(0);  // Tổng số
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  // 🔴 BUGFIX: Separate effect for main post (triggers only when category/id changes)
  // Do NOT re-fetch main post when relatedPage changes!
  // ✅ CRITICAL: Must use SSR data for detail post - server is single source of truth
  React.useEffect(() => {
    if (!category || !id) {
      setLoading(false);
      setError('Thiếu tham số danh mục hoặc slug.');
      return;
    }

    setLoading(true);
    setError(null);

    let ssrDetailPost: ServicePost | null = null;
    let relatedPrefilled = false;
    let targetServiceType = '';

    // Parse SSR data - MUST exist for detail pages (rendered by backend with correct slug)
    const w: any = (typeof window !== 'undefined') ? window : undefined;
    const initial = w && (w.__INITIAL_REACT_DATA__ || w.initialReactData);

    if (initial && initial.currentPagePath === (w?.location?.pathname || '')) {
      try {
        // Main detail post from SSR
        if (initial.serviceDetail) {
          ssrDetailPost = mapSsrDetailToPost(initial.serviceDetail);
          setPost(ssrDetailPost);
          targetServiceType = ssrDetailPost.serviceType || ssrDetailPost.category || category || '';
          console.log('✅ SSR: Loaded service detail from SSR (server is source of truth):', ssrDetailPost.title);
        } else {
          console.warn('⚠️ WARNING: No serviceDetail in SSR data - backend should provide this for detail pages');
        }

        // Related posts from SSR (new structure with pagination metadata)
        if (Array.isArray(initial.relatedDetailList) && initial.relatedDetailList.length > 0) {
          const getThumbnail = (r: any): string => {
            const value = r.thumbnail || r.cover || '';
            if (Array.isArray(value)) return value[0] || '';
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed[0] || '';
              } catch {}
            }
            return value || '';
          };
          const mapped = initial.relatedDetailList
            .filter((r: any) => String(r.id || r.service_id || '') !== id)
            .map((r: any) => ({
              id: String(r.id || r.service_id || ''),
              title: String(r.title || ''),
              slug: r.slug || '',
              excerpt: r.excerpt || r.summary || '',
              thumbnail: getThumbnail(r),
              serviceType: r.service_type || '',
              category: r.service_type || '',
              publishDate: r.publish_date || r.created_at || r.updated_at || '',
            })) as ServicePost[];
          // ✅ CRITICAL: Filter to same service_type ONLY (backend already filters, double-check client-side)
          const filtered = targetServiceType
            ? mapped.filter((r) => {
                const rType = r.serviceType || r.category || '';
                return rType === targetServiceType;
              })
            : mapped;
          // ✅ Adjust total count to match filtered results if server total doesn't account for exclusion
          const serverTotal = typeof initial.totalRelatedCount === 'number'
            ? initial.totalRelatedCount
            : mapped.length;
          // Backend already excludes current post and filters by service_type, so use server total
          const safeTotal = serverTotal > 0 ? serverTotal : filtered.length;
          const serverPaginated = Boolean(initial.relatedNextCursor) || serverTotal > mapped.length;
          if (serverPaginated) {
            setRelatedPosts(filtered);
            setTotalRelated(safeTotal);
          } else {
            setRelatedPosts(filtered);
            setTotalRelated(filtered.length);
          }
          relatedPrefilled = true;
        }

        // Legacy fallback (rare) - use SSR list if provided
        if (!ssrDetailPost && Array.isArray(initial.serviceDetailList) && initial.serviceDetailList.length > 0) {
          const getThumbnail = (r: any): string => {
            const value = r.thumbnail || r.cover || '';
            if (Array.isArray(value)) return value[0] || '';
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed[0] || '';
              } catch {}
            }
            return value || '';
          };
          const mapped = initial.serviceDetailList
            .filter((r: any) => String(r.id || r.service_id || '') !== id)
            .map((r: any) => ({
              id: String(r.id || r.service_id || ''),
              title: String(r.title || ''),
              slug: r.slug || '',
              excerpt: r.excerpt || r.summary || '',
              thumbnail: getThumbnail(r),
              serviceType: r.service_type || '',
              category: r.service_type || '',
              publishDate: r.created_at || r.updated_at || '',
            })) as ServicePost[];

          // ✅ CRITICAL: Filter to same service_type ONLY
          const filtered = targetServiceType
            ? mapped.filter((r) => {
                const rType = r.serviceType || r.category || '';
                return rType === targetServiceType;
              })
            : mapped;

          setRelatedPosts(filtered);
          setTotalRelated(filtered.length);
          relatedPrefilled = true;

          console.warn('⚠️ Using legacy serviceDetailList (no pagination metadata)');
        }
      } catch (e) {
        console.warn('⚠️ Error loading SSR data:', e);
      }

      // Clear SSR data after first use to prevent stale data on SPA navigation
      if (w && w.__INITIAL_REACT_DATA__) {
        delete w.__INITIAL_REACT_DATA__;
      }
      if (w && w.initialReactData) {
        delete w.initialReactData;
      }
    } else {
      console.log(`ℹ️ No SSR data or mismatched path: SSR available=${!!initial}, currentPath=${initial?.currentPagePath}, pagePath=${w?.location?.pathname}`);
    }

    if (!ssrDetailPost) {
      setError('Không tìm thấy dữ liệu SSR cho tin này. Vui lòng tải lại trang.');
      setPost(null);
      setRelatedPosts([]);
      setTotalRelated(0);
    } else if (!relatedPrefilled) {
      // Backend did not send related posts; keep UI stable with empty state
      setRelatedPosts([]);
      setTotalRelated(0);
    }

    setLoading(false);
  }, [category, id]);
  
  return { post, relatedPosts, totalRelated, loading, error };
}

// Helper: Safely get images and videos array from post
function getPostImages(post: ServicePost): string[] {
  const images: string[] = [];
  if (post.images && Array.isArray(post.images)) {
    images.push(
      ...post.images.filter((img: unknown): img is string => typeof img === 'string' && img.length > 0),
    );
  }
  if (images.length === 0 && post.thumbnail) {
    images.push(post.thumbnail);
  }
  return images;
}

function getPostVideos(post: ServicePost): string[] {
  const videos: string[] = [];
  if (post.videos && Array.isArray(post.videos)) {
    videos.push(
      ...post.videos.filter((vid: unknown): vid is string => typeof vid === 'string' && vid.length > 0),
    );
  }
  return videos;
}

// Helper: Safely convert rating to number
function getRatingValue(rating: string | number | undefined): number {
  if (typeof rating === 'number') return rating;
  if (typeof rating === 'string') {
    const parsed = parseFloat(rating);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Currency formatting (VND) helper and unified price resolver
function formatVND(value: number): string {
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  } catch {
    // Fallback manual formatting
    return value.toLocaleString('vi-VN') + ' ₫';
  }
}

// Unified price resolver for ServicePost
function resolveFormattedPrice(post: any, serviceType: string, t?: any) {
  let n: number | undefined;
  if (serviceType === 'cho-thue-xe' && typeof post.pricePerDayValue === 'number') {
    n = post.pricePerDayValue;
  } else if (typeof post.priceValue === 'number') {
    n = post.priceValue;
  }
  if (n !== undefined) {
    const perDay = serviceType === 'cho-thue-xe' && t ? t('website.services.detail.per_day', '/ngày') : '';
    return formatVND(n) + perDay;
  }
  // fallback to existing textual price (could already include đơn vị như "2 tỷ")
  return post.price;
}

// ================== COMPONENTS CHI TIẾT ==================
const GenericDetail = ({ post, t }: { post: ServicePost, t: any }) => {
  if (!post) {
    return null;
  }

  const currentLang = i18n.language || 'vi';
  const postTitle = getMultilingualField(post, 'title', currentLang);
  const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
  const postContent = getMultilingualField(post, 'content', currentLang);

  // Rewritten to avoid syntax issues (use React.createElement)
  const renderCtaButton = () => {
    if (!post) return null;
    if (post.serviceType === 'phan-mem') {
      return React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(DownloadOutlined, null) }, t('website.services.detail.download', 'Tải xuống'));
    }
    if (post.serviceType === 'bat-dong-san' || post.serviceType === 'cho-thue-xe') {
      return React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(CalendarOutlined, null) }, t('website.services.detail.contact_realtor', 'Liên hệ'));
    }
    if (post.serviceType === 'lam-dep-my-pham' || post.serviceType === 'booking-online') {
      return React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(CalendarOutlined, null) }, t('website.services.detail.book_now', 'Đặt lịch ngay'));
    }
    return null;
  };

  const renderSupplementaryInfo = () => {
    if (!post) return null;
    const items = [];
    const attrs = post.attributes;
    // Use only flat fields
    // Chỉ hiển thị các trường specifications_ có giá trị thực sự (không phải placeholder)
    const specKeys = Object.keys(post).filter(key => key.startsWith('specifications_'));
    if (specKeys.length > 0) {
      specKeys.forEach(key => {
        const rawValue = post[key];
        // Bỏ qua nếu là giá trị placeholder
        if (!isMissingSpecValue(rawValue)) {
          // Format label: chuyển snake_case sang tiếng Việt dễ đọc
          const label = key.replace('specifications_', '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
          const value = normalizeSpecValue(rawValue, t);
          items.push({ key, label, children: value });
        }
      });
    }
    // Các trường đặc biệt cho từng lĩnh vực vẫn giữ nguyên
    switch (post.serviceType) {
      case 'phan-mem':
        if (post.attributes_version && !isMissingSpecValue(post.attributes_version)) items.push({ key: 'version', label: t('website.services.detail.version', 'Phiên bản'), children: post.attributes_version });
        if (post.attributes_os && !isMissingSpecValue(post.attributes_os)) items.push({ key: 'os', label: t('website.services.detail.os', 'Hệ điều hành'), children: Array.isArray(post.attributes_os) ? post.attributes_os.join(', ') : post.attributes_os });
        if (post.author && !isMissingSpecValue(post.author)) items.push({ key: 'developer', label: t('website.services.detail.developer', 'Nhà phát triển'), children: post.author });
        break;
      case 'bat-dong-san':
        if (!isMissingSpecValue(post.legalStatus)) items.push({ key: 'legal', label: t('website.services.detail.legal', 'Pháp lý'), children: t('website.services.detail.legal_clear', 'Sổ hồng') });
        break;
      case 'cho-thue-xe':
        if (post.transmission && !isMissingSpecValue(post.transmission)) items.push({ key: 'transmission', label: t('website.services.detail.transmission', 'Hộp số'), children: post.transmission });
        break;
    }
    // Nếu không có thông số nào, ẩn luôn cả khối Descriptions
    if (items.length === 0) {
      return null;
    }
    return React.createElement(
      Descriptions,
      { bordered: true, column: 1 },
      items.map(item => React.createElement(
        Descriptions.Item,
        { label: item.label, children: item.children, key: item.key }
      ))
    );
  };

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'img' },
          React.createElement(MediaGallery, { images: getPostImages(post), videos: getPostVideos(post), alt: postTitle })
        ),
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'info' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'middle', style: { width: '100%' } },
            [
              React.createElement(Tag, { color: 'blue', key: 'cat' }, getCategoryLabel(post.category)),
                React.createElement(
                  'div',
                  { key: 'meta', style: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' } },
                  [
                    getRelativeTime(post.publishDate) && React.createElement(Text, { key: 'time', style: { color: 'var(--text-secondary)', fontSize: 13 } }, getRelativeTime(post.publishDate)),
                    post.expiryDate && React.createElement(Tag, { key: 'expiry', color: formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange', style: { fontSize: 12, borderRadius: 6 } }, formatExpiryDate(post.expiryDate))
                  ].filter(Boolean)
                ),
              React.createElement(
                'div',
                { key: 'meta-soft', style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
                [
                  React.createElement(Title, { level: 2, style: { margin: 0, color: 'var(--text-primary)' }, key: 'title' }, postTitle),
                  getRelativeTime(post.publishDate) && React.createElement(Text, { key: 'time', style: { color: 'var(--text-secondary)', fontSize: 13 } }, getRelativeTime(post.publishDate)),
                  post.expiryDate && React.createElement(Tag, { key: 'expiry', color: formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange', style: { fontSize: 12, borderRadius: 6 } }, formatExpiryDate(post.expiryDate))
                ].filter(Boolean)
              ),
              React.createElement(Paragraph, { style: { color: 'var(--text-secondary)' }, key: 'excerpt' }, postExcerpt),
              (() => {
                const formatted = resolveFormattedPrice(post, post.serviceType || '', t);
                return formatted ? React.createElement(Title, { level: 3, style: { color: 'var(--ant-primary-color)', margin: 0 }, key: 'price' }, formatted) : null;
              })(),
              post.attributes && post.attributes.rating ? React.createElement(
                Space,
                { key: 'rating' },
                [
                  React.createElement(Rate, { disabled: true, defaultValue: getRatingValue(post.attributes.rating), key: 'rate' }),
                  React.createElement(Text, { style: { color: 'var(--text-primary)' }, key: 'reviews' }, `(${post.attributes.reviews} ${t('website.services.detail.reviews', 'đánh giá')})`)
                ]
              ) : null,
              React.createElement('div', { style: { marginTop: 24 }, key: 'cta' }, renderCtaButton())
            ].filter(Boolean)
          )
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'supp' },
          renderSupplementaryInfo()
        ),
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'desc' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'middle', style: { width: '100%' } },
            [
              React.createElement(Title, { level: 3, style: { color: 'var(--text-primary)' }, key: 'desc-title' }, t('website.services.detail.description', 'Mô tả dịch vụ')),
              postContent 
                ? React.createElement('div', { 
                    style: { color: 'var(--text-primary)', lineHeight: 1.8 }, 
                    dangerouslySetInnerHTML: { __html: decodeHtml(postContent) }, 
                    key: 'desc-html' 
                  })
                : React.createElement(Paragraph, { 
                    style: { color: 'var(--text-secondary)' }, 
                    key: 'no-content' 
                  }, t('website.services.detail.no_description', 'Chưa có mô tả chi tiết.'))
            ]
          )
        )
      ]
    )
  );
};

const SoftwareDetail = ({ post, t }: { post: ServicePost, t: any }) => {
  const currentLang = i18n.language || 'vi';
  const postTitle = getMultilingualField(post, 'title', currentLang);
  const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
  const postContent = getMultilingualField(post, 'content', currentLang);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 10, key: 'img' },
          React.createElement(MediaGallery, { images: getPostImages(post), videos: getPostVideos(post), alt: postTitle })
        ),
        React.createElement(
          Col,
          { xs: 24, md: 14, key: 'info' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'middle', style: { width: '100%' } },
            [
              React.createElement(
                'div',
                { key: 'meta-re', style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
                [
                  React.createElement(Title, { level: 2, style: { margin: 0, color: 'var(--text-primary)' }, key: 'title' }, postTitle),
                  getRelativeTime(post.publishDate) && React.createElement(Text, { key: 'time', style: { color: 'var(--text-secondary)', fontSize: 13 } }, getRelativeTime(post.publishDate)),
                  post.expiryDate && React.createElement(Tag, { key: 'expiry', color: formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange', style: { fontSize: 12, borderRadius: 6 } }, formatExpiryDate(post.expiryDate))
                ].filter(Boolean)
              ),
              React.createElement(Paragraph, { style: { color: 'var(--text-secondary)' }, key: 'excerpt' }, postExcerpt),
              React.createElement(
                Descriptions,
                { bordered: true, column: 1, size: 'small', key: 'desc' },
                [
                  post.author ? React.createElement(Descriptions.Item, { key: 'developer', label: t('website.services.detail.developer', 'Nhà phát triển'), children: post.author }) : null,
                  post.attributes && post.attributes.version ? React.createElement(Descriptions.Item, { key: 'version', label: t('website.services.detail.version', 'Phiên bản'), children: post.attributes.version }) : null,
                  post.attributes && post.attributes.os ? React.createElement(Descriptions.Item, { key: 'os', label: t('website.services.detail.os', 'Hệ điều hành'), children: post.attributes.os.join(', ') }) : null
                ].filter(Boolean)
              ),
              React.createElement('div', { style: { marginTop: 16 }, key: 'cta' },
                React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(DownloadOutlined, null) }, t('website.services.detail.download', 'Tải xuống'))
              )
            ]
          )
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(Title, { level: 4, style: { color: 'var(--text-primary)' } }, t('website.services.detail.features', 'Các tính năng nổi bật')),
    (postContent
      ? React.createElement('div', { style: { color: 'var(--text-primary)', lineHeight: 1.7 }, dangerouslySetInnerHTML: { __html: decodeHtml(postContent) || '' } })
      : React.createElement(Paragraph, { style: { color: 'var(--text-secondary)' } }, t('website.services.detail.no_description', 'Chưa có mô tả chi tiết.')))
  );
};

const RealEstateDetail = ({ post, t }: { post: ServicePost, t: any }) => {
  const currentLang = i18n.language || 'vi';
  const postTitle = getMultilingualField(post, 'title', currentLang);
  const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
  const postContent = getMultilingualField(post, 'content', currentLang);

  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  // IMPORTANT: Wrap in useMemo to ensure stable appId reference across renders
  const appId = useMemo(
    () => (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm",
    [user.app_id]
  );
  const { guestPhone, setGuestPhone, setChatUrl } = useGuestPhone();

  const [contactModalOpen, setContactModalOpen] = React.useState(false);
  const [contactForm] = Form.useForm();
  const [contactLoading, setContactLoading] = React.useState(false);

  const [phoneRevealed, setPhoneRevealed] = React.useState(false);
  
  // Sử dụng ChatHistoryContext để gửi tin nhắn
  // Context sẽ tự động handle socket connection và history
  const sendChatMessage = React.useCallback((message: string) => {
    // Trigger global chat open với message
    if (typeof window !== 'undefined' && (window as any).openWebsiteChat) {
      (window as any).openWebsiteChat(message);
    }
  }, []);

  const maskPhoneNumber = React.useCallback((raw: string, reveal: boolean) => {
    if (!raw) return '';
    if (reveal) return raw;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '***';
    const visibleCount = Math.max(3, Math.ceil(digits.length / 2));
    const maskedPart = '*'.repeat(Math.max(digits.length - visibleCount, 3));
    return `${digits.slice(0, visibleCount)}${maskedPart}`;
  }, []);

  // Auto-fill form with saved guestPhone when modal opens OR when guestPhone changes
  React.useEffect(() => {
    if (contactModalOpen && guestPhone) {
      contactForm.setFieldsValue({ phone: guestPhone });
    }
  }, [contactModalOpen, guestPhone, contactForm]);
  
  // Auto-reveal phone if already saved
  React.useEffect(() => {
    if (guestPhone && guestPhone.trim()) {
      setPhoneRevealed(true);
    }
  }, [guestPhone]);

  const handleContactFinish = (values: any) => {
    const phoneValue = values.phone?.trim();
    if (!phoneValue) {
      return; // Form validation should prevent this, but safeguard anyway
    }

    setContactLoading(true);
    
    // ✅ CRITICAL: Use setGuestPhone hook to save phone
    // This will automatically save to localStorage AND emit event to sync all components
    setGuestPhone(phoneValue);

    const traffic = detectTrafficAttribution();
    const sourceDetails = [
      traffic.utmSource ? `utm_source=${traffic.utmSource}` : '',
      traffic.utmMedium ? `utm_medium=${traffic.utmMedium}` : '',
      traffic.utmCampaign ? `utm_campaign=${traffic.utmCampaign}` : '',
      traffic.referrer ? `referrer=${traffic.referrer}` : '',
      traffic.landingPage ? `landing=${traffic.landingPage}` : '',
    ].filter(Boolean).join(' | ');

    const customerPayload: Partial<CRMCustomer> = {
      appId,
      phone: phoneValue,
      source: traffic.source,
      status: 'new',
      notes: sourceDetails,
      utm_source: traffic.utmSource,
      utm_medium: traffic.utmMedium,
      utm_campaign: traffic.utmCampaign,
      referrer: traffic.referrer,
      landing_page: traffic.landingPage,
    };

    void createOrUpdateCustomer(customerPayload).catch((err: any) => {
      console.warn('Failed to upsert CRM customer from website contact', err?.message || err);
    });
    
    // Lần đầu contact, lưu URL hiện tại
    const currentUrl = window.location.href;
    setChatUrl(currentUrl);
    
    // Gửi tin nhắn liên hệ ngay (không delay)
    // Message template dùng %link% và %phone% (từ i18n locales)
    const messageTemplate = t('website.services.detail.contact_message_text', 'Tôi quan tâm đến tin này: %link% - Số điện thoại của tôi: %phone%');
    const message = messageTemplate
      .replace('%link%', currentUrl)
      .replace('%phone%', phoneValue);
    
    // Gửi message qua shared pipeline (auto open chat, không hỏi phone lại)
    // openWebsiteChat sẽ check localStorage, thấy phone rồi, không hỏi nhập lại
    sendChatMessage(message);
    
    // Close modal và reset state
    setContactLoading(false);
    setContactModalOpen(false);
    setPhoneRevealed(true);
  };

  const htmlBlock = postContent
    ? React.createElement('div', { key: 'html-block', style: { color: 'var(--text-primary)', lineHeight: 1.7 }, dangerouslySetInnerHTML: { __html: decodeHtml(postContent) } })
    : React.createElement(Paragraph, { key: 'no-desc', style: { color: 'var(--text-secondary)' } }, t('website.services.detail.no_description', 'Chưa có mô tả chi tiết.'));
  
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'img' },
          React.createElement(MediaGallery, { images: getPostImages(post), videos: getPostVideos(post), alt: postTitle })
        ),
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'info' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'large', style: { width: '100%' } },
            [
              React.createElement(
                'div',
                { key: 'meta-beauty', style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
                [
                  React.createElement(Title, { level: 2, style: { margin: 0, color: 'var(--text-primary)' }, key: 'title' }, postTitle),
                  getRelativeTime(post.publishDate) && React.createElement(Text, { key: 'time', style: { color: 'var(--text-secondary)', fontSize: 13 } }, getRelativeTime(post.publishDate)),
                  post.expiryDate && React.createElement(Tag, { key: 'expiry', color: formatExpiryDate(post.expiryDate).includes('hết hạn') ? 'red' : 'orange', style: { fontSize: 12, borderRadius: 6 } }, formatExpiryDate(post.expiryDate))
                ].filter(Boolean)
              ),
              React.createElement(
                Descriptions,
                { bordered: true, column: 2, size: 'small', key: 'desc' },
                // Build an array with stable keys to avoid React key warning
                (() => {
                  const items: any[] = [];
                  
                  // Build attrs object from post.attributes OR directly from post (for attributes_* flat fields)
                  const attrs = post.attributes || {};
                  // If post has flat attributes_* fields, use those directly
                  const flatAttrs: Record<string, any> = {};
                  Object.keys(post).forEach(key => {
                    if (key.startsWith('attributes_')) {
                      const fieldName = key.replace('attributes_', '');
                      flatAttrs[fieldName] = post[key];
                    }
                  });
                  // Merge: attributes_* fields override post.attributes
                  const resolvedAttrs = { ...attrs, ...flatAttrs };
                  
                  // Property Type - Loại hình BĐS
                  const propertyTypeLabel = post.propertyTypeLabel || '';
                  if (propertyTypeLabel) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.property_type', 'Loại hình BĐS'), 
                      children: propertyTypeLabel, 
                      key: 'property_type_item',
                      span: 2 
                    }));
                  }
                  
                  // Transaction Type - Loại giao dịch (Bán/Cho thuê)
                  const transactionLabel = post.transactionTypeLabel || '';
                  if (transactionLabel) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.transaction_type', 'Loại giao dịch'), 
                      children: transactionLabel, 
                      key: 'transaction_type_item',
                      span: 2
                    }));
                  }
                  
                  // Price - dùng helper function nhất quán, hỗ trợ unit
                  const priceUnit = post.priceUnit;
                  const priceRaw = formatPrice(resolvedAttrs, priceUnit);
                  const priceDisplay = priceRaw ? normalizeSpecValue(priceRaw, t) : '';
                  if (priceDisplay) items.push(React.createElement(Descriptions.Item, { label: t('website.services.detail.price', 'Giá'), children: priceDisplay, key: 'price_item' }));
                  
                  // Area - dùng helper function nhất quán
                  const areaRaw = formatArea(resolvedAttrs);
                  const areaDisplay = areaRaw ? normalizeSpecValue(areaRaw, t) : '';
                  if (areaDisplay) items.push(React.createElement(Descriptions.Item, { label: t('website.services.detail.area', 'Diện tích'), children: areaDisplay, key: 'area_item' }));
                  
                  // Bedrooms - dùng helper function nhất quán
                  const bedroomsRaw = formatBedrooms(resolvedAttrs);
                  const bedroomsDisplay = bedroomsRaw ? normalizeSpecValue(bedroomsRaw, t) : '';
                  if (bedroomsDisplay) items.push(React.createElement(Descriptions.Item, { label: t('website.services.detail.bedrooms', 'Phòng ngủ'), children: bedroomsDisplay, key: 'bedrooms_item' }));
                  
                  // Bathrooms - dùng helper function nhất quán
                  const bathroomsRaw = formatBathrooms(resolvedAttrs);
                  const bathroomsDisplay = bathroomsRaw ? normalizeSpecValue(bathroomsRaw, t) : '';
                  if (bathroomsDisplay) items.push(React.createElement(Descriptions.Item, { label: t('website.services.detail.bathrooms', 'Phòng tắm'), children: bathroomsDisplay, key: 'bathrooms_item' }));
                  
                  // Dimensions - kích thước (nếu có)
                  const dimensionsRaw = post.attributes_dimensions || resolvedAttrs.dimensions;
                  const dimensionsDisplay = dimensionsRaw ? normalizeSpecValue(dimensionsRaw, t) : '';
                  if (dimensionsDisplay) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.dimensions', 'Kích thước'), 
                      children: dimensionsDisplay, 
                      key: 'dimensions_item' 
                    }));
                  }
                  
                  // Floors - số tầng (nếu có)
                  if (post.attributes_floors || post.floors) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.floors', 'Số tầng'), 
                      children: normalizeSpecValue(post.attributes_floors || post.floors, t), 
                      key: 'floors_item' 
                    }));
                  }
                  
                  // Front Width - mặt tiền (nếu có)
                  if (post.attributes_frontWidth || post.frontWidth) {
                    const fw = post.attributes_frontWidth || post.frontWidth;
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.front_width', 'Mặt tiền'), 
                      children: typeof fw === 'number' ? `${fw}m` : normalizeSpecValue(fw, t), 
                      key: 'front_width_item' 
                    }));
                  }
                  
                  // Road Width - độ rộng đường (nếu có)
                  if (post.attributes_roadWidth) {
                    const rw = post.attributes_roadWidth;
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.road_width', 'Độ rộng đường'), 
                      children: typeof rw === 'number' ? `${rw}m` : normalizeSpecValue(rw, t), 
                      key: 'road_width_item' 
                    }));
                  }
                  
                  // Floor level - tầng (cho căn hộ, officetel)
                  if (post.floor) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.floor', 'Tầng'), 
                      children: normalizeSpecValue(post.floor, t), 
                      key: 'floor_item' 
                    }));
                  }
                  
                  // Furnished - nội thất
                  if (post.furnished !== undefined) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.furnished', 'Nội thất'), 
                      children: post.furnished ? t('website.services.search.furnished_yes', 'Có nội thất') : t('website.services.search.furnished_no', 'Không nội thất'), 
                      key: 'furnished_item' 
                    }));
                  }
                  
                  // Garden - sân vườn (biệt thự)
                  if (post.hasGarden) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.garden', 'Sân vườn'), 
                      children: `✓ ${t('website.services.detail.yes', 'Có')}`, 
                      key: 'garden_item' 
                    }));
                  }
                  
                  // Pool - hồ bơi (biệt thự)
                  if (post.hasPool) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.pool', 'Hồ bơi'), 
                      children: `✓ ${t('website.services.detail.yes', 'Có')}`, 
                      key: 'pool_item' 
                    }));
                  }
                  
                  // Parking - bãi đỗ xe
                  if (post.parking) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.parking', 'Bãi đỗ xe'), 
                      children: `✓ ${t('website.services.detail.yes', 'Có')}`, 
                      key: 'parking_item' 
                    }));
                  }
                  
                  // Grade - hạng (văn phòng)
                  if (post.grade) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.grade', 'Hạng'), 
                      children: `${t('website.services.detail.grade', 'Hạng')} ${post.grade}`, 
                      key: 'grade_item' 
                    }));
                  }
                  
                  // Expected ROI - lợi nhuận kỳ vọng (condotel)
                  if (post.expectedROI) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.expected_roi', 'Lợi nhuận kỳ vọng'), 
                      children: post.expectedROI, 
                      key: 'roi_item' 
                    }));
                  }
                  
                  // Managed by operator - quản lý bởi (condotel)
                  if (post.managedByOperator) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.management', 'Quản lý'), 
                      children: t('website.services.detail.professional_management', 'Đơn vị vận hành chuyên nghiệp'), 
                      key: 'managed_item' 
                    }));
                  }
                  
                  // Utilities - tiện ích (phòng trọ)
                  if (post.utilities) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.utilities', 'Tiện ích'), 
                      children: normalizeSpecValue(post.utilities, t), 
                      key: 'utilities_item',
                      span: 2 
                    }));
                  }
                  
                  // AC - điều hòa (phòng trọ)
                  if (post.hasAC !== undefined) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.ac', 'Điều hòa'), 
                      children: post.hasAC ? `✓ ${t('website.services.detail.yes', 'Có')}` : `✗ ${t('website.services.detail.no', 'Không')}`, 
                      key: 'ac_item' 
                    }));
                  }
                  
                  // Legal Status - tình trạng pháp lý
                  if (post.legalStatus) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.legal_status', 'Pháp lý'), 
                      children: post.legalStatus, 
                      key: 'legal_status_item' 
                    }));
                  }
                  
                  // Location/Address
                  const location = post.location || post.address || post.attributes_location;
                  const locationDisplay = location ? normalizeSpecValue(location, t) : '';
                  if (locationDisplay) {
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.location', 'Vị trí'), 
                      children: locationDisplay, 
                      key: 'location_item',
                      span: 2 
                    }));
                  }
                  
                  // Contact/Phone
                  if (post.attributes_contact) {
                    const phone = post.attributes_contact;
                    const maskedPhone = maskPhoneNumber(phone, phoneRevealed);
                    items.push(React.createElement(Descriptions.Item, { 
                      label: t('website.services.detail.contact', 'Liên hệ'), 
                      children: maskedPhone, 
                      key: 'contact_item',
                      span: 2 
                    }));
                  }
                  
                  return items;
                })()
              ),
              React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(CalendarOutlined, null), key: 'cta', onClick: () => { 
                // Nếu đã có guestPhone, mở chat luôn + reveal phone; nếu chưa, mở modal nhập phone
                if (guestPhone && guestPhone.trim()) {
                  // Reveal phone number
                  setPhoneRevealed(true);
                  // Open chat with contact message
                  const messageTemplate = t('website.services.detail.contact_message_text', 'Tôi quan tâm đến tin này: %link% - Số điện thoại của tôi: %phone%');
                  const message = messageTemplate
                    .replace('%link%', window.location.href)
                    .replace('%phone%', guestPhone);
                  sendChatMessage(message);
                } else {
                  setContactModalOpen(true);
                }
              } }, t('website.services.detail.contact_realtor', 'Liên hệ'))
            ]
          )
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, key: 'desc' },
          [
            React.createElement(Title, { level: 4, style: { color: 'var(--text-primary)' }, key: 'desc-title' }, t('website.services.detail.description', 'Mô tả chi tiết')),
            htmlBlock
          ]
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(Modal, {
      open: contactModalOpen,
      onCancel: () => { 
        contactForm.resetFields(); // Reset form when closing modal
        setContactModalOpen(false); 
      },
      footer: null,
      closable: false,
      maskClosable: false,
      title: t('website.services.detail.contact_modal_title', 'Liên hệ với người đăng'),
      centered: true
    },
      React.createElement(Form, {
        form: contactForm,
        layout: 'vertical',
        onFinish: handleContactFinish
      },
        [
          React.createElement(Form.Item, {
            name: 'phone',
            label: t('website.services.detail.contact_phone_label', 'Số điện thoại của bạn'),
            rules: [{ required: true, message: t('website.services.detail.contact_phone_required', 'Vui lòng nhập số điện thoại') }],
            key: 'phone'
          }, React.createElement(Input, { placeholder: t('website.services.detail.contact_phone_placeholder', 'Nhập số điện thoại') })),
          React.createElement(Form.Item, { key: 'submit' },
            React.createElement(Button, { type: 'primary', htmlType: 'submit', loading: contactLoading, block: true },
              t('website.services.detail.contact_submit', 'Gửi liên hệ')
            )
          )
        ]
      )
    )
    // Không cần InternalChatBox riêng nữa - sử dụng global chat từ WebsiteLayout
  );
};

const BeautyDetail = ({ post, t }: { post: ServicePost, t: any }) => {
  const currentLang = i18n.language || 'vi';
  const postTitle = getMultilingualField(post, 'title', currentLang);
  const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
  const postContent = getMultilingualField(post, 'content', currentLang);

  // Hiển thị tất cả các trường specifications_ cho lĩnh vực làm đẹp, dùng i18n cho label
  const specKeys = Object.keys(post).filter(key => key.startsWith('specifications_'));
  const infoItems = [];
  if (specKeys.length > 0) {
    specKeys.forEach(key => {
      const specKey = key.replace('specifications_', '');
      const label = t(`website.services.specifications.${specKey}`, specKey.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'));
      const value = normalizeSpecValue(post[key], t);
      infoItems.push({ label, value });
    });
  } else {
    infoItems.push({ label: t('website.services.detail.no_spec', 'Thông số'), value: t('website.services.detail.not_available', 'Chưa cập nhật') });
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 10, key: 'img' },
          React.createElement(MediaGallery, { images: getPostImages(post), videos: getPostVideos(post), alt: postTitle })
        ),
        React.createElement(
          Col,
          { xs: 24, md: 14, key: 'info' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'middle', style: { width: '100%' } },
            [
              React.createElement(Title, { level: 2, style: { margin: 0, color: 'var(--text-primary)' }, key: 'title' }, postTitle),
              React.createElement(
                Descriptions,
                { bordered: true, column: 1, size: 'small', key: 'desc' },
                infoItems.map((item, idx) => React.createElement(Descriptions.Item, { label: item.label, children: item.value, key: item.label + idx }))
              ),
              React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(ShoppingCartOutlined, null), key: 'cta' }, t('website.services.detail.buy_now', 'Mua ngay'))
            ]
          )
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(Title, { level: 4, style: { color: 'var(--text-primary)' }, key: 'ing-title' }, t('website.services.detail.ingredients_usage', 'Thành phần & Công dụng')),
    (postContent
      ? React.createElement('div', { key: 'ing-content', style: { color: 'var(--text-primary)', lineHeight: 1.7 }, dangerouslySetInnerHTML: { __html: decodeHtml(postContent) } })
      : React.createElement(Paragraph, { key: 'ing-content', style: { color: 'var(--text-secondary)' } }, t('website.services.detail.no_description', 'Chưa có mô tả chi tiết.')))
  );
};

const BookingDetail = ({ post, t }: { post: ServicePost, t: any }) => {
  const currentLang = i18n.language || 'vi';
  const postTitle = getMultilingualField(post, 'title', currentLang);
  const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
  const postContent = getMultilingualField(post, 'content', currentLang);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const handleBookClick = () => setModalOpen(true);
  const handleModalCancel = () => setModalOpen(false);
  const handleFinish = (values: any) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setModalOpen(false);
      message.success(t('website.services.detail.booking_success', 'Đặt lịch thành công!'));
      form.resetFields();
    }, 1200);
  };

  // Hiển thị tất cả các trường specifications_ cho lĩnh vực đặt lịch online, dùng i18n cho label
  const specKeys = Object.keys(post).filter(key => key.startsWith('specifications_'));
  const infoItems = [];
  if (specKeys.length > 0) {
    specKeys.forEach(key => {
      const specKey = key.replace('specifications_', '');
      const label = t(`website.services.specifications.${specKey}`, specKey.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'));
      const value = normalizeSpecValue(post[key], t);
      infoItems.push({ label, value });
    });
  } else {
    infoItems.push({ label: t('website.services.detail.no_spec', 'Thông số'), value: t('website.services.detail.not_available', 'Chưa cập nhật') });
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 10, key: 'img' },
          React.createElement(MediaGallery, { images: getPostImages(post), videos: getPostVideos(post), alt: postTitle })
        ),
        React.createElement(
          Col,
          { xs: 24, md: 14, key: 'info' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'middle', style: { width: '100%' } },
            [
              React.createElement(Title, { level: 2, style: { margin: 0, color: 'var(--text-primary)' }, key: 'title' }, postTitle),
              React.createElement(
                Descriptions,
                { bordered: true, column: 1, size: 'small', key: 'desc' },
                infoItems.map((item, idx) => React.createElement(Descriptions.Item, { label: item.label, children: item.value, key: item.label + idx }))
              ),
              React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(CalendarOutlined, null), key: 'cta', onClick: handleBookClick }, t('website.services.detail.book_now', 'Đặt lịch ngay'))
            ]
          )
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(Title, { level: 4, style: { color: 'var(--text-primary)' }, key: 'desc-title' }, t('website.services.detail.description', 'Mô tả dịch vụ')),
    (postContent
      ? React.createElement('div', { key: 'desc-content', style: { color: 'var(--text-primary)', lineHeight: 1.7 }, dangerouslySetInnerHTML: { __html: decodeHtml(postContent) } })
      : React.createElement(Paragraph, { key: 'desc-content', style: { color: 'var(--text-secondary)' } }, t('website.services.detail.no_description', 'Chưa có mô tả chi tiết.'))),
    React.createElement(Modal, {
      open: modalOpen,
      onCancel: handleModalCancel,
      footer: null,
      title: t('website.services.detail.book_now', 'Đặt lịch ngay'),
      centered: true
    },
      React.createElement(Form, {
        form,
        layout: 'vertical',
        onFinish: handleFinish
      },
        [
          React.createElement(Form.Item, {
            name: 'name',
            label: t('website.services.detail.form.name', 'Họ và tên'),
            rules: [{ required: true, message: t('website.services.detail.form.name_required', 'Vui lòng nhập họ tên') }],
            key: 'name'
          }, React.createElement(Input, { placeholder: t('website.services.detail.form.name_placeholder', 'Nhập họ tên') })),
          React.createElement(Form.Item, {
            name: 'phone',
            label: t('website.services.detail.form.phone', 'Số điện thoại'),
            rules: [{ required: true, message: t('website.services.detail.form.phone_required', 'Vui lòng nhập số điện thoại') }],
            key: 'phone'
          }, React.createElement(Input, { placeholder: t('website.services.detail.form.phone_placeholder', 'Nhập số điện thoại') })),
          React.createElement(Form.Item, {
            name: 'datetime',
            label: t('website.services.detail.form.datetime', 'Thời gian đặt'),
            rules: [{ required: true, message: t('website.services.detail.form.datetime_required', 'Vui lòng chọn thời gian') }],
            key: 'datetime'
          }, React.createElement(DatePicker, { showTime: true, style: { width: '100%' } })),
          React.createElement(Form.Item, {
            name: 'note',
            label: t('website.services.detail.form.note', 'Ghi chú'),
            key: 'note'
          }, React.createElement(Input.TextArea, { rows: 3, placeholder: t('website.services.detail.form.note_placeholder', 'Ghi chú thêm (tuỳ chọn)') })),
          React.createElement(Form.Item, { key: 'submit' },
            React.createElement(Button, { type: 'primary', htmlType: 'submit', loading: loading, block: true },
              t('website.services.detail.form.submit', 'Xác nhận đặt lịch')
            )
          )
        ]
      )
    )
  );
};

const CarRentalDetail = ({ post, t }: { post: ServicePost, t: any }) => {
  const currentLang = i18n.language || 'vi';
  const postTitle = getMultilingualField(post, 'title', currentLang);
  const postExcerpt = getMultilingualField(post, 'excerpt', currentLang);
  const postContent = getMultilingualField(post, 'content', currentLang);

  // Hiển thị tất cả các trường specifications_ cho lĩnh vực cho-thue-xe, dùng i18n cho label
  const specKeys = Object.keys(post).filter(key => key.startsWith('specifications_'));
  const infoItems = [];
  if (specKeys.length > 0) {
    specKeys.forEach(key => {
      const specKey = key.replace('specifications_', '');
      const label = t(`website.services.specifications.${specKey}`, specKey.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'));
      const value = normalizeSpecValue(post[key], t);
      infoItems.push({ label, value });
    });
  } else {
    infoItems.push({ label: t('website.services.detail.no_spec', 'Thông số'), value: t('website.services.detail.not_available', 'Chưa cập nhật') });
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Row,
      { gutter: [48, 32] },
      [
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'img' },
          React.createElement(MediaGallery, { images: getPostImages(post), videos: getPostVideos(post), alt: postTitle })
        ),
        React.createElement(
          Col,
          { xs: 24, md: 12, key: 'info' },
          React.createElement(
            Space,
            { direction: 'vertical', size: 'large', style: { width: '100%' } },
            [
              React.createElement(Title, { level: 2, style: { margin: 0 }, key: 'title' }, postTitle),
              React.createElement(
                Descriptions,
                { bordered: true, column: 1, size: 'small', key: 'desc' },
                infoItems.map((item, idx) => React.createElement(Descriptions.Item, { label: item.label, children: item.value, key: item.label + idx }))
              ),
              React.createElement('div', { style: { marginTop: 24 }, key: 'cta' },
                React.createElement(Button, { type: 'primary', size: 'large', icon: React.createElement(CalendarOutlined, null) }, t('website.services.detail.book_now', 'Đặt xe ngay'))
              )
            ]
          )
        )
      ]
    ),
    React.createElement(Divider, null),
    React.createElement(Title, { level: 4, key: 'terms-title' }, t('website.services.detail.rental_terms', 'Giá & Điều khoản thuê')),
    (postContent
      ? React.createElement('div', { key: 'terms-content', style: { color: 'var(--text-primary)', lineHeight: 1.7 }, dangerouslySetInnerHTML: { __html: decodeHtml(postContent) } })
      : React.createElement(Paragraph, { key: 'terms-content', style: { color: 'var(--text-secondary)' } }, t('website.services.detail.no_description', 'Chưa có mô tả chi tiết.')))
  );
};
// ================== END COMPONENTS ==================

// Hàm tạo slug thân thiện với SEO từ tiêu đề
const slugify = (text: string) => {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};


export default function WuServiceDetail() {
  // All hooks must be called in order at the top of the component
  const location = useLocation();
  const { t } = useTranslation();
  const { category, slug } = useParams<{ category: string; slug: string }>();
  const navigate = useNavigate();
  
  // � DEBUG: Log raw params to diagnose issue
  console.log('🔍 WuServiceDetail render:', { 
    category, 
    slug, 
    pathname: location.pathname, 
    search: location.search,
    fullURL: location.pathname + location.search
  });
  
  // �🔧 CRITICAL: Extract ID reactively using useMemo to re-compute when slug changes
  // This ensures ID is always clean even when URL query params change
  const id = React.useMemo(() => {
    if (!slug) return undefined;
    
    // No need to remove .shtml anymore - URLs are now clean (no .shtml extension)
    // Just handle query string stripping if present
    let cleanSlug = slug;
    
    // Strip query string (e.g. ?page=2) to prevent contaminated slug
    const queryIndex = cleanSlug.indexOf('?');
    if (queryIndex > 0) {
      const beforeStrip = cleanSlug;
      cleanSlug = cleanSlug.substring(0, queryIndex);
      console.warn('🚨 SLUG HAD QUERY STRING! Before:', beforeStrip, 'After:', cleanSlug);
    }
    
    console.log('🔎 Extracted ID from slug:', { originalSlug: slug, cleanSlug, category, search: location.search });
    return cleanSlug;
  }, [slug, category, location.search]); // Re-compute when slug OR search params change
  
  const RELATED_PAGE_SIZE = 12;

  // Đọc trang từ URL query param (?page=2), mặc định là 1
  const [relatedPage, setRelatedPage] = useState(() => {
    const params = new URLSearchParams(location.search);
    const pageParam = params.get('page');
    const parsed = parseInt(pageParam || '1', 10);
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  });

  // Handle language from query param (?hl=xx)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hl = params.get("hl");
    if (hl === "en" || hl === "vi") {
      i18n.changeLanguage(hl);
      // Only delete ?hl if it's Vietnamese to keep URL clean, other languages keep it
      if (hl === "vi") {
        const url = new URL(window.location.href);
        params.delete("hl");
        url.search = params.toString();
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } else if (!i18n.language || i18n.language === "" || i18n.language === "cimode") {
      i18n.changeLanguage("vi");
    }
  }, [location.search]);

  // Cleanup query params: backend cố định take=12 nên xoá take/pageSize khỏi URL để tránh hiểu nhầm client đang set
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('take')) { url.searchParams.delete('take'); changed = true; }
    if (url.searchParams.has('pageSize')) { url.searchParams.delete('pageSize'); changed = true; }
    if (changed) {
      const newSearch = url.searchParams.toString();
      const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [location.pathname]);

  // Backend now manages pagination cache based on page number + search query
  // No need to cache or manage lastkey client-side
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pageParam = params.get('page');
    const parsed = parseInt(pageParam || '1', 10);
    const urlPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    if (relatedPage !== urlPage) {
      setRelatedPage(urlPage);
    }
  }, [location.search, relatedPage]);

  const { post, relatedPosts, totalRelated, loading, error } = useServiceDetailAndRelated(category, id);

  
  // Get multilingual fields from post
  const currentLang = i18n.language || 'vi';
  const postTitle = post ? getMultilingualField(post, 'title', currentLang) : '';
  const postExcerpt = post ? getMultilingualField(post, 'excerpt', currentLang) : '';
  const postContent = post ? getMultilingualField(post, 'content', currentLang) : '';
  
  // Lấy categories từ SSR giống như menu
  const ssrCategoryObjects = (typeof window !== 'undefined' && (window as any).__SSR_WEBSITE_CATEGORIES__) || [];
  
  // Helper function to get translated category name based on current language
  const getCategoryLabel = (cat: any): string => {
    const currentLang = i18n.language || 'vi-VN';
    if (currentLang.includes('en')) {
      const en = cat.category_en;
      return en && en.trim() ? en : cat.category;
    } else if (currentLang.includes('zh')) {
      const zh = cat.category_zh;
      return zh && zh.trim() ? zh : cat.category;
    }
    return cat.category;
  };
  
  // Xác định lĩnh vực hiện tại từ SSR categories
  let currentCategory = ssrCategoryObjects.find((cat: any) => cat.slug === post?.serviceType);
  if (!currentCategory && category) {
    currentCategory = ssrCategoryObjects.find((cat: any) => cat.slug === category);
  }
  const menuItems = useWebsiteMenu();
  // Lấy màu đặc trưng cho dịch vụ hiện tại
  const accentColor = currentCategory?.color || "#1890ff";

  // ⚠️ IMPORTANT: Title và meta tags PHẢI được render từ server (index.html Thymeleaf)
  // Không được dùng JavaScript client-side update document.title/meta vì sẽ ảnh hưởng SEO
  // Googlebot crawl HTML tĩnh từ server, không đợi React JavaScript chạy xong
  // Backend (WebSpringController) đã set title/description/og:* đúng ngôn ngữ rồi
  // Frontend chỉ dùng postTitle/postExcerpt/postContent cho React UI rendering, không ghi đè DOM

  // Build ?hl=xx only khi ngôn ngữ không phải tiếng Việt
  const langSuffix = (() => {
    const lang = i18n.language || '';
    const short = lang.slice(0, 2).toLowerCase();
    if (short === 'vi' || lang === 'cimode') return '';
    return short ? `?hl=${short}` : '';
  })();

  // Professional, always-visible breadcrumb for clear navigation
  const renderBreadcrumb = () => {
    const { t } = useTranslation();
    // Custom style for breadcrumb links
    const linkBase = {
      color: 'var(--text-primary, #1a365d)',
      fontWeight: 600,
      fontSize: 17,
      background: 'transparent',
      border: 'none',
      padding: '4px 8px',
      borderRadius: 8,
      transition: 'color 0.2s, background 0.2s',
      textDecoration: 'none',
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 8,
      boxShadow: 'none',
      outline: 'none',
      cursor: 'pointer',
    };
    // Use a custom class for hover effect
    const linkClass = 'csm-breadcrumb-link';
    // Inject style tag for hover and active
    if (!document.getElementById('csm-breadcrumb-style')) {
      const style = document.createElement('style');
      style.id = 'csm-breadcrumb-style';
      style.innerHTML = `
        .${linkClass} {
          color: var(--text-primary, #1a365d);
          background: transparent;
        }
        .${linkClass}:hover, .${linkClass}:focus {
          color: var(--ant-primary-color, #1677ff);
          background: var(--bg-secondary, #f0f5ff);
          text-decoration: none;
        }
        .${linkClass}:active {
          color: var(--ant-primary-color-hover, #0958d9);
          background: var(--bg-primary, #e6f4ff);
        }
      `;
      document.head.appendChild(style);
    }
    const items = [
      React.createElement(
        Breadcrumb.Item,
        { key: 'home' },
        React.createElement(
          'a',
          {
            href: '/',
            className: linkClass,
            style: linkBase,
            tabIndex: 0,
          },
          React.createElement(HomeOutlined, { style: { marginRight: 6, fontSize: 18 } }), t('website.menu.home')
        )
      )
    ];
    
    // Nếu currentCategory là sub-category (có group_slug), thêm group category trước
    if (currentCategory && currentCategory.group_slug && currentCategory.group_slug !== '') {
      const parentGroup = ssrCategoryObjects.find((cat: any) => 
        cat.slug === currentCategory.group_slug && cat.is_group_slug === true
      );
      if (parentGroup) {
        items.push(
          React.createElement(
            Breadcrumb.Item,
            { key: 'group' },
            React.createElement(
              'a',
              {
                href: `/${parentGroup.slug}`,
                className: linkClass,
                style: linkBase,
                tabIndex: 0,
              },
              getCategoryLabel(parentGroup)
            )
          )
        );
      }
    }
    
    // Thêm currentCategory (có thể là group hoặc sub)
    if (currentCategory) {
      items.push(
        React.createElement(
          Breadcrumb.Item,
          { key: 'cat' },
          React.createElement(
            'a',
            {
              href: `/${currentCategory.slug}`,
              className: linkClass,
              style: linkBase,
              tabIndex: 0,
            },
            getCategoryLabel(currentCategory)
          )
        )
      );
    }
    return React.createElement(
      Breadcrumb,
      {
        separator: React.createElement('span', { style: { color: 'var(--ant-primary-color, #1677ff)', fontWeight: 500, fontSize: 16, margin: '0 6px', verticalAlign: 'middle' } }, '/'),
        style: {
          marginBottom: 18,
          marginLeft: 0,
          fontSize: 17,
          fontWeight: 600,
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--text-primary, #1a365d)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
        }
      },
      items
    );
  };

  // Main content: sector-specific detail layout
  const renderSectorDetail = () => {
    if (!post) {
      return React.createElement(
        'div',
        { style: { padding: '50px', textAlign: 'center' } },
        React.createElement(Empty, { description: t('website.services.detail.not_found', 'Không tìm thấy dịch vụ') })
      );
    }
    switch (post.serviceType) {
      case DEFAULT_CATEGORY:
        return React.createElement(SoftwareDetail, { post, t });
      case 'bat-dong-san':
        return React.createElement(RealEstateDetail, { post, t });
      case 'lam-dep-my-pham':
        return React.createElement(BeautyDetail, { post, t });
      case 'cho-thue-xe':
        return React.createElement(CarRentalDetail, { post, t });
      case 'booking-online':
        return React.createElement(BookingDetail, { post, t });
      default:
        return React.createElement(GenericDetail, { post, t });
    }
  };

  // ...existing code...

  return (
    <WebsiteLayout
      title={post ? `${postTitle} - Dịch vụ` : 'Dịch vụ'}
      menuItems={menuItems}
      selectedKey={`/${DEFAULT_CATEGORY}`}
    >
      <div
        className="service-detail-theme"
        style={{
          background: `linear-gradient(120deg, var(--bg-primary) 80%, ${accentColor}11 100%)`,
          color: 'var(--text-primary)',
          minHeight: '100vh',
          transition: 'background 0.4s cubic-bezier(.4,2,.6,1), color 0.3s',
        }}
      >
        {/* Always show breadcrumb at the top of content */}
        <div
          style={{
            maxWidth: 1200,
            paddingTop: 16, // keep top padding
            paddingBottom: 0, // remove extra bottom padding
            background: 'transparent',
            boxSizing: 'border-box'
          }}
        >
          {renderBreadcrumb()}
        </div>
        <main
          style={{
            background: `linear-gradient(120deg, var(--bg-secondary) 80%, ${accentColor}11 100%)`,
            borderRadius: 18,
            boxShadow: `0 4px 32px ${accentColor}22, 0 2px 8px var(--shadow-color, rgba(0,0,0,0.06))`,
            padding: 40,
            minHeight: 600,
            maxWidth: 1200,
            width: '100%',
            margin: '0 auto',
            marginBottom: 150,
            transition: 'background 0.4s cubic-bezier(.4,2,.6,1), box-shadow 0.3s',
          }}
          itemScope
          itemType="https://schema.org/Service"
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80 }}><span>Đang tải dữ liệu...</span></div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'red' }}>{error}</div>
          ) : !post ? (
            <div style={{ textAlign: 'center', padding: 100 }}>
              <Result
                status="404"
                title={t('website.services.detail.service_not_found', 'Không tìm thấy dịch vụ')}
                subTitle={t('website.services.detail.service_not_found_message', 'Bài viết hoặc dịch vụ bạn tìm kiếm không tồn tại hoặc đã bị xoá.')}
                extra={
                  <Button 
                    type="primary" 
                    onClick={() => {
                      const targetCategory = currentCategory?.key || category || DEFAULT_CATEGORY;
                      window.location.href = `/${targetCategory}`;
                    }}
                  >
                    {t('website.services.detail.back_to_services', 'Quay lại trang dịch vụ')}
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <article itemProp="hasOfferCatalog" itemScope itemType="https://schema.org/OfferCatalog">
                <section style={{ marginBottom: 32 }}>{renderSectorDetail()}</section>
              </article>
              {/* Related posts section */}
              {relatedPosts.length > 0 && (
                <section id="related-posts-section" style={{ marginTop: 48 }} aria-label="related-posts">
                  <Divider orientation="left" style={{ fontSize: 20, color: accentColor }}>
                    {t('website.services.detail.related_posts', 'Tin liên quan')}
                  </Divider>
                  <Row gutter={[24, 24]} align="stretch">
                    {relatedPosts.map((rel) => {
                      const relCurrentLang = i18n.language || 'vi';
                      const relTitle = getMultilingualField(rel, 'title', relCurrentLang);
                      const relExcerpt = getMultilingualField(rel, 'excerpt', relCurrentLang);
                      // Fallback to post/category/default when serviceType is missing from SSR
                      const relServiceType = rel.serviceType || rel.category || post?.serviceType || DEFAULT_CATEGORY;
                      const relHref = `/${relServiceType}/${rel.slug}${langSuffix}`;
                      return (
                      <Col xs={24} sm={12} md={12} lg={6} key={rel.id}>
                        <Card
                          hoverable
                          style={{
                            borderRadius: 14,
                            boxShadow: `0 2px 8px ${accentColor}22`,
                            minHeight: 320,
                            border: `1.5px solid ${accentColor}33`,
                            background: 'var(--card-bg)',
                            color: 'var(--text-primary)',
                            transition: 'box-shadow 0.3s, border 0.3s, background 0.3s, color 0.3s',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column'
                          }}
                          cover={
                            <a 
                              href={relHref} 
                              aria-label={relTitle} 
                              style={{ display:'block', position: 'relative', paddingBottom: '62%', overflow: 'hidden', borderRadius: '14px 14px 0 0' }}
                            >
                              <img
                                src={normalizeImageUrl(rel.thumbnail) || svgPlaceholder(relTitle || 'CSM', 640, 360)}
                                alt={relTitle}
                                loading="lazy"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = svgPlaceholder(relTitle || 'CSM', 640, 360); }}
                                style={{ 
                                  position: 'absolute', 
                                  inset: 0, 
                                  width: '100%', 
                                  height: '100%', 
                                  objectFit: 'cover',
                                  borderRadius: '14px 14px 0 0'
                                }}
                              />
                            </a>
                          }
                          bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
                        >
                          <Tag color={accentColor} style={{ marginBottom: 8 }}>{rel.category}</Tag>
                          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            <a href={relHref} style={{ color: 'var(--text-primary)', textDecoration:'none' }} aria-label={relTitle}>{relTitle}</a>
                          </h3>
                          <Paragraph ellipsis={{ rows: 2 }} style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{relExcerpt}</Paragraph>
                          {(() => {
                            const rawPrice = formatPrice(rel.attributes);
                            const priceDisplay = rawPrice ? normalizeSpecValue(rawPrice, t) : '';
                            return priceDisplay ? (
                              <div style={{ marginTop: 'auto' }}>
                                <Text strong style={{ fontSize: 16, color: accentColor }}>{priceDisplay}</Text>
                              </div>
                            ) : null;
                          })()}
                          <Button
                            type="link"
                            href={relHref}
                            style={{ padding: 0, marginTop: 4, color: accentColor, fontWeight: 600, alignSelf: 'flex-start' }}
                          >
                            {t('website.services.detail.view_details', 'Xem chi tiết')}
                          </Button>
                        </Card>
                      </Col>
                      );
                    })}
                  </Row>
                  {totalRelated > RELATED_PAGE_SIZE && (
                    <div style={{ textAlign: 'center', marginTop: 28, marginBottom: 140, paddingBottom: 20 }}>
                      <Pagination
                        current={relatedPage}
                        pageSize={RELATED_PAGE_SIZE}
                        total={totalRelated}
                        onChange={(newPage) => {
                          const params = new URLSearchParams(location.search);
                          
                          // Backend manages 100% pagination logic including cursor derivation
                          // Client ONLY sends page number - NO client-side data manipulation
                          params.set('page', String(newPage));
                          
                          // ✅ Clean URL (no session ID)
                          // Query signature = domain:service_id:filters
                          // Same detail → Same signature → Same related posts
                          
                          const newUrl = location.pathname + `?${params.toString()}`;
                          // FULL PAGE RELOAD to trigger server-side rendering with new page
                          // This ensures backend handles pagination completely (SSR + cursor derivation)
                          window.location.href = newUrl;
                        }}
                        showSizeChanger={false}
                        showTotal={undefined}
                        size="small"
                        style={{
                          display: 'inline-flex',
                          padding: '10px 14px',
                          borderRadius: 14,
                          border: '1px solid var(--border-color, #e5e7eb)',
                          boxShadow: '0 6px 20px #0000000f',
                          background: 'var(--card-bg, #fff)',
                          minWidth: 260,
                          justifyContent: 'center'
                        }}
                      />
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
        {/* SEO Breadcrumb structured data */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": (() => {
            const items = [
              { "@type": "ListItem", "position": 1, "name": t('website.menu.home', 'Trang chủ'), "item": `${window.location.origin}/` },
              { "@type": "ListItem", "position": 2, "name": t('website.menu.services', 'Dịch vụ'), "item": `${window.location.origin}/${DEFAULT_CATEGORY}` }
            ];
            if (currentCategory && currentCategory.title) {
              items.push({ "@type": "ListItem", "position": items.length + 1, "name": currentCategory.title, "item": `${window.location.origin}/${currentCategory.key}` });
            }
            if (postTitle) {
              items.push({ "@type": "ListItem", "position": items.length + 1, "name": postTitle, "item": window.location.href });
            }
            return items;
          })()
        }) }} />
      </div>
    </WebsiteLayout>
  );
}