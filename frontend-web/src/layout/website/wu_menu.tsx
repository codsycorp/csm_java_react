import { SSRCategoryObject } from "#src/types/ssr-category-object";
import React from "react";
import {
  HomeOutlined,
  DatabaseOutlined,
  ApartmentOutlined,
  ReadOutlined,
  MailOutlined,
  UserOutlined,
  CodeOutlined,
  SkinOutlined,
  CarOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { usePreferencesStore } from "#src/store";

export function useWebsiteMenu() {
  const { t, i18n } = useTranslation();
  const { changeLanguage } = usePreferencesStore();
  const initialCategories: SSRCategoryObject[] =
    (typeof window !== 'undefined' && Array.isArray((window as any).__SSR_WEBSITE_CATEGORIES__))
      ? (window as any).__SSR_WEBSITE_CATEGORIES__
      : [];
  const [ssrCategoryObjects, setSsrCategoryObjects] = React.useState<SSRCategoryObject[]>(initialCategories);

  const getPriority = (cat: SSRCategoryObject): number => {
    const raw = (cat as any).attributes_priority;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 999;
  };

  const getBackendBaseUrl = () => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const port = window.location.port;
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && (port === '3333' || port === '5173')) {
        return 'http://localhost:9999';
      }
      return window.location.origin;
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (apiBase && apiBase !== '/' && apiBase !== '') {
      return apiBase.replace(/\/api\/?$/, '');
    }

    return '';
  };

  React.useEffect(() => {
    let cancelled = false;

    async function loadCategoriesIfMissing() {
      if (typeof window === 'undefined') return;

      const existing = Array.isArray((window as any).__SSR_WEBSITE_CATEGORIES__)
        ? (window as any).__SSR_WEBSITE_CATEGORIES__
        : [];
      if (existing.length > 0) {
        setSsrCategoryObjects(existing);
        return;
      }

      try {
        const backendBase = getBackendBaseUrl();
        if (!backendBase) return;

        const response = await fetch(`${backendBase}/ssr/categories`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;

        const payload = await response.json();
        const categories = Array.isArray(payload?.data)
          ? payload.data
          : (Array.isArray(payload?.rows) ? payload.rows : []);

        if (cancelled || !Array.isArray(categories) || categories.length === 0) return;

        (window as any).__SSR_WEBSITE_CATEGORIES__ = categories;
        setSsrCategoryObjects(categories);
      } catch (err) {
        console.warn('[useWebsiteMenu] Failed to load SSR categories fallback:', err);
      }
    }

    void loadCategoriesIfMissing();

    return () => {
      cancelled = true;
    };
  }, []);

  // Lấy ngôn ngữ hiện tại từ i18n hoặc store
  React.useEffect(() => {
    function syncLangFromUrl() {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const hl = urlParams.get('hl');
        let targetLang = 'vi-VN';
        if (hl === 'en') targetLang = 'en-US';
        else if (hl === 'zh') targetLang = 'zh-CN';
        if (i18n.language !== targetLang) {
          changeLanguage(targetLang as import('#src/locales').LanguageType);
          i18n.changeLanguage(targetLang);
        }
      }
    }
    syncLangFromUrl();
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', syncLangFromUrl);
      window.addEventListener('hashchange', syncLangFromUrl);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', syncLangFromUrl);
        window.removeEventListener('hashchange', syncLangFromUrl);
      }
    };
  }, [i18n.language, changeLanguage]);
  // Luôn lấy ngôn ngữ hiện tại từ i18n
  const lang = i18n.language || 'vi-VN';
  // Helper để build path đúng ngôn ngữ
  const buildPath = (path: string) => {
    if (lang === 'vi' || lang === 'vi-VN') return path;
    // Chỉ thêm ?hl=xx cho các trang wu_
    return path + (path.includes('?') ? `&hl=${lang.slice(0,2)}` : `?hl=${lang.slice(0,2)}`);
  };

  // Helper: map icon name to AntD icon
  const iconMap: Record<string, React.ReactNode> = {
    HomeOutlined: <HomeOutlined />,
    DatabaseOutlined: <DatabaseOutlined />,
    ApartmentOutlined: <ApartmentOutlined />,
    CodeOutlined: <CodeOutlined />,
    ShoppingCartOutlined: <ShoppingCartOutlined />,
    CarOutlined: <CarOutlined />,
    CalendarOutlined: <CalendarOutlined />,
    MailOutlined: <MailOutlined />,
    UserOutlined: <UserOutlined />,
    SkinOutlined: <SkinOutlined />,
    ReadOutlined: <ReadOutlined />,
  };

  // Static menus have higher priority than dynamic SSR menus.
  // Any dynamic item with the same key will be removed to avoid duplication.
  const staticMenuKeys = new Set([
    "/",
    "/home",
    "/xem-ngay",
    "/lien-he",
    "/ve-chung-toi",
  ]);

  // Build main menu dynamically from SSR group tổng (group_slug === '' && is_group_slug === true && is_service === true)
  function isSSRGroupCategory(cat: any): cat is SSRCategoryObject {
    // CHỈ lấy SERVICE GROUPS thực sự (is_group_slug=true VÀ is_service=true)
    return cat && typeof cat === 'object' && cat.group_slug === '' && cat.is_group_slug === true && typeof cat.slug === 'string' && isService(cat);
  }
  // Helper function to get translated category name based on current language
  const getCategoryLabel = (cat: SSRCategoryObject): string => {
    const currentLang = i18n.language || 'vi-VN';
    if (currentLang.includes('en')) {
      const en = cat.category_en as string | undefined;
      return en && en.trim() ? en : cat.category;
    } else if (currentLang.includes('zh')) {
      const zh = cat.category_zh as string | undefined;
      return zh && zh.trim() ? zh : cat.category;
    }
    return cat.category;
  };

  // Helper: Check if item là service (is_service = true) hay là menu thường
  // Chỉ coi là service nếu is_service explicitly = true
  // Nếu undefined/null, mặc định là false (non-service menu)
  const isService = (cat: SSRCategoryObject): boolean => {
    const serviceFlag = (cat as any).is_service;
    // Explicitly true = service, otherwise = not service
    return serviceFlag === true;
  };

  // Helper: Build path theo slug cho tất cả menu động.
  // Không dùng /no-content/:slug để tránh URL sai (vd: /no-content/home).
  const buildMenuPath = (cat: SSRCategoryObject): string => {
    const slug = cat.slug;
    return buildPath(`/${slug}`);
  };

  // Build service group menus (is_group_slug=true, group_slug='', is_service=true)
  const serviceGroupMenus = ssrCategoryObjects
    .filter(isSSRGroupCategory)
    .sort((a, b) => getPriority(a) - getPriority(b))
    .map((groupCat) => {
    // Lấy các service children cho group này (CHỈ service items, is_service=true)
    const children = ssrCategoryObjects
      .filter((cat) => cat.group_slug === groupCat.slug && !cat.is_group_slug && isService(cat))
      .sort((a, b) => getPriority(a) - getPriority(b))
      .map((cat) => ({
        key: `/${cat.slug}`,
        label: getCategoryLabel(cat),
        path: buildPath(`/${cat.slug}`),
        icon: iconMap[cat.attributes_icon ?? ''] || <DatabaseOutlined />,
        children: [],
      }));
    return {
      key: `/${groupCat.slug}`,
      label: getCategoryLabel(groupCat),
      path: buildPath(`/${groupCat.slug}`),
      icon: iconMap[groupCat.attributes_icon ?? ''] || <DatabaseOutlined />,
      children,
    };
  });

  const filteredServiceGroupMenus = serviceGroupMenus
    .filter((menu) => !staticMenuKeys.has(menu.key))
    .map((menu) => ({
      ...menu,
      children: (menu.children || []).filter((child) => !staticMenuKeys.has(child.key)),
    }));

  const bySlug = new Map<string, SSRCategoryObject>();
  ssrCategoryObjects.forEach((cat) => {
    if (cat?.slug) bySlug.set(String(cat.slug), cat);
  });

  const buildChildrenFromSlugs = (slugs: string[]) => {
    const seen = new Set<string>();
    return slugs
      .map((slug) => bySlug.get(slug))
      .filter((cat): cat is SSRCategoryObject => !!cat && !!cat.slug && !cat.is_group_slug)
      .filter((cat) => {
        const key = `/${cat.slug}`;
        if (seen.has(key) || staticMenuKeys.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => getPriority(a) - getPriority(b))
      .map((cat) => ({
        key: `/${cat.slug}`,
        label: getCategoryLabel(cat),
        path: buildPath(`/${cat.slug}`),
        icon: iconMap[cat.attributes_icon ?? ''] || <DatabaseOutlined />,
        children: [],
      }));
  };

  const findGroupMenu = (slug: string) => {
    return filteredServiceGroupMenus.find((m) => m.key === `/${slug}`);
  };

  const getFallbackLabel = (labels: { vi: string; en: string; zh: string }) => {
    const currentLang = i18n.language || 'vi-VN';
    if (currentLang.includes('en')) return labels.en;
    if (currentLang.includes('zh')) return labels.zh;
    return labels.vi;
  };

  const buildStaticBridgeChildren = () => {
    const staticChildren = [
      {
        slug: 'phan-mem',
        label: { vi: 'Phần Mềm', en: 'Software', zh: '软件' },
      },
      {
        slug: 'bat-dong-san',
        label: { vi: 'Bất Động Sản', en: 'Real Estate', zh: '房地产' },
      },
      {
        slug: 'lam-dep-my-pham',
        label: { vi: 'Mỹ Phẩm & Làm Đẹp', en: 'Beauty & Cosmetics', zh: '美妆与美容' },
      },
      {
        slug: 'cho-thue-xe',
        label: { vi: 'Cho Thuê Xe 4-7 Chỗ', en: 'Car Rental 4-7 Seats', zh: '4-7座租车' },
      },
      {
        slug: 'booking-online',
        label: { vi: 'Đặt Lịch Online', en: 'Online Booking', zh: '在线预约' },
      },
    ];

    return staticChildren.map((item) => ({
      key: `/${item.slug}`,
      label: getFallbackLabel(item.label),
      path: buildPath(`/${item.slug}`),
      icon: <DatabaseOutlined />,
      children: [],
    }));
  };

  const resolvedTargetMenus = (() => {
    const lotteryParent = findGroupMenu('thong-ke-ket-qua-xo-so');
    const bridgeParent = findGroupMenu('hop-tac-kinh-doanh');

    const lotteryChildren: any[] = [];

    const bridgeChildren = (() => {
      const direct = bridgeParent?.children || [];
      if (direct.length > 0) return direct;
      // Legacy-compatible fallback: keep old categories but render under new bridge menu.
      const fromSlugs = buildChildrenFromSlugs([
        'phan-mem',
        'bat-dong-san',
        'lam-dep-my-pham',
        'cho-thue-xe',
        'booking-online',
      ]);
      if (fromSlugs.length > 0) return fromSlugs;
      // Guaranteed fallback when SSR categories are unavailable.
      return buildStaticBridgeChildren();
    })();

    return [
      {
        key: '/thong-ke-ket-qua-xo-so',
        label: lotteryParent?.label || getFallbackLabel({
          vi: 'Thống Kê Kết Quả Xổ Số',
          en: 'Lottery Statistics',
          zh: '彩票统计',
        }),
        path: lotteryParent?.path || buildPath('/thong-ke-ket-qua-xo-so'),
        icon: lotteryParent?.icon || <DatabaseOutlined />,
        children: lotteryChildren,
      },
      {
        key: '/hop-tac-kinh-doanh',
        label: bridgeParent?.label || getFallbackLabel({
          vi: 'Hợp Tác Kinh Doanh',
          en: 'Business Partnership',
          zh: '商业合作',
        }),
        path: bridgeParent?.path || buildPath('/hop-tac-kinh-doanh'),
        icon: bridgeParent?.icon || <ShoppingCartOutlined />,
        children: bridgeChildren,
      },
    ];
  })();

  const serviceMenuKeys = new Set<string>();
  filteredServiceGroupMenus.forEach((menu) => {
    serviceMenuKeys.add(menu.key);
    (menu.children || []).forEach((child) => serviceMenuKeys.add(child.key));
  });

  const hasDynamicLotteryMenu =
    serviceMenuKeys.has('/thong-ke-ket-qua-xo-so') ||
    serviceMenuKeys.has('/thong-ke-xo-so') ||
    serviceMenuKeys.has('/xo-so');

  console.log('📊 [Menu Stats]:', {
    totalCategories: ssrCategoryObjects.length,
    serviceGroups: filteredServiceGroupMenus.length,
    allCategories: ssrCategoryObjects.map(c => ({
      slug: c.slug,
      is_service: (c as any).is_service,
      is_group_slug: c.is_group_slug,
      group_slug: c.group_slug
    }))
  });

  // Main menu structure: Trang chủ → Service Groups → Standalone Menus → Static pages
  return [
    {
      key: "/",
      label: t("website.menu.home", "Trang Chủ"),
      path: buildPath("/"),
      icon: <HomeOutlined />,
      children: [],
    },
    ...(resolvedTargetMenus || filteredServiceGroupMenus),
    ...(!hasDynamicLotteryMenu
      ? [{
          key: "/xem-ngay",
          label: t("website.menu.xemngay", "Xem Ngày"),
          path: buildPath("/xem-ngay"),
          icon: <CalendarOutlined />,
          children: [],
        }]
      : []),
    {
      key: "/lien-he",
      label: t("website.menu.contact", "Liên Hệ"),
      path: buildPath("/lien-he"),
      icon: <MailOutlined />,
      children: [],
    },
    {
      key: "/ve-chung-toi",
      label: t("website.menu.about", "Về Chúng Tôi"),
      path: buildPath("/ve-chung-toi"),
      icon: <UserOutlined />,
      children: [],
    },
  ];
}