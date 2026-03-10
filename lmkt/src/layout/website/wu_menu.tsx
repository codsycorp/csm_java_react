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
  TrophyOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { usePreferencesStore } from "#src/store";

export function useWebsiteMenu() {
  const { t, i18n } = useTranslation();
  const { changeLanguage } = usePreferencesStore();
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
  // Import SSR category object type
  const ssrCategoryObjects: SSRCategoryObject[] = (typeof window !== 'undefined' && (window as any).__SSR_WEBSITE_CATEGORIES__) || [];

  // Helper: map icon name to AntD icon
  const iconMap: Record<string, React.ReactNode> = {
    HomeOutlined: <HomeOutlined />,
    DatabaseOutlined: <DatabaseOutlined />,
    ApartmentOutlined: <ApartmentOutlined />,
    CodeOutlined: <CodeOutlined />,
    ShoppingCartOutlined: <ShoppingCartOutlined />,
    CarOutlined: <CarOutlined />,
    CalendarOutlined: <CalendarOutlined />,
    ToolOutlined: <ToolOutlined />,
    MailOutlined: <MailOutlined />,
    UserOutlined: <UserOutlined />,
    TrophyOutlined: <TrophyOutlined />,
    SkinOutlined: <SkinOutlined />,
    ReadOutlined: <ReadOutlined />,
  };

  // Static menus have higher priority than dynamic SSR menus.
  // Any dynamic item with the same key will be removed to avoid duplication.
  const staticMenuKeys = new Set([
    "/",
    "/lien-he",
    "/ve-chung-toi",
  ]);

  // Build main menu dynamically from SSR group tổng (group_slug === '' && is_group_slug === true && is_service !== false)
  function isSSRGroupCategory(cat: any): cat is SSRCategoryObject {
    // CHỈ lấy SERVICE GROUPS (is_group_slug=true VÀ is_service !== false)
    return cat && typeof cat === 'object' && cat.group_slug === '' && cat.is_group_slug === true && typeof cat.slug === 'string' && cat.is_service !== false;
  }
  // Helper function to get translated category name based on current language
  const getCategoryLabel = (cat: SSRCategoryObject): string => {
    const currentLang = i18n.language || 'vi-VN';
    if (currentLang.includes('en')) {
      const en = (cat as any).category_en as string | undefined;
      return en && en.trim() ? en : cat.category;
    } else if (currentLang.includes('zh')) {
      const zh = (cat as any).category_zh as string | undefined;
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

  // Helper: Build path cho menu items khác nhau
  // - Service items: /slug (để navigate đến service list)
  // - Non-service items với dynamic code: /dynamic-code/:slug
  // - Non-service items không có dynamic code: /no-content/:slug (trang báo chưa có nội dung)
  const buildMenuPath = (cat: SSRCategoryObject): string => {
    const slug = cat.slug;
    const dynamicCodeName = (cat as any).dynamic_code_name || undefined;
    
    if (isService(cat)) {
      // Service: /slug
      return buildPath(`/${slug}`);
    } else {
      // Non-service menu item (standalone menu)
      if (dynamicCodeName && dynamicCodeName.trim()) {
        // Có dynamic code: navigate đến dynamic code page
        return buildPath(`/dynamic-code/${slug}`);
      } else {
        // Không có dynamic code: show trang "chưa có nội dung"
        return buildPath(`/no-content/${slug}`);
      }
    }
  };

  // Build service group menus (is_group_slug=true, group_slug='', is_service=true)
  const serviceGroupMenus = ssrCategoryObjects.filter(isSSRGroupCategory).map((groupCat) => {
    // Lấy các service children cho group này (CHỈ service items, is_service=true)
    const children = ssrCategoryObjects
      .filter((cat) => cat.group_slug === groupCat.slug && !cat.is_group_slug && isService(cat))
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

  // Build standalone menus (is_service=false, group_slug='')
  // Bao gồm:
  // - Non-service items: is_group_slug=false, group_slug='', is_service=false
  // - Non-service groups: is_group_slug=true, group_slug='', is_service=false
  const standaloneMenus = ssrCategoryObjects
    .filter((cat) => {
      const isStandalone = (cat.group_slug === '' || !cat.group_slug) && !isService(cat);
      if (isStandalone) {
        console.log('🔍 [Standalone Menu Found]:', {
          slug: cat.slug,
          category: cat.category,
          is_service: (cat as any).is_service,
          is_group_slug: cat.is_group_slug,
          group_slug: cat.group_slug,
          dynamic_code_name: (cat as any).dynamic_code_name
        });
      }
      return isStandalone;
    })
    .map((cat) => {
      const pathForMenu = buildMenuPath(cat);
      console.log(`📋 Standalone menu path: ${cat.slug} -> ${pathForMenu}`, { is_service: (cat as any).is_service, dynamic_code_name: (cat as any).dynamic_code_name });
      return {
        key: `/${cat.slug}`,
        label: getCategoryLabel(cat),
        path: pathForMenu,
        icon: iconMap[cat.attributes_icon ?? ''] || <DatabaseOutlined />,
        children: [],
      };
    });

  const filteredStandaloneMenus = standaloneMenus.filter((menu) => !staticMenuKeys.has(menu.key));

  console.log('📊 [Menu Stats]:', {
    totalCategories: ssrCategoryObjects.length,
    serviceGroups: filteredServiceGroupMenus.length,
    standaloneMenus: filteredStandaloneMenus.length,
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
    ...filteredServiceGroupMenus,
    ...filteredStandaloneMenus,
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