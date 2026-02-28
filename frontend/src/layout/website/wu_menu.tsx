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

  // Build main menu dynamically from SSR group tổng (group_slug === '' && is_group_slug === true)
  function isSSRGroupCategory(cat: any): cat is SSRCategoryObject {
    return cat && typeof cat === 'object' && cat.group_slug === '' && cat.is_group_slug === true && typeof cat.slug === 'string';
  }
  // Helper function to get translated category name based on current language
  const getCategoryLabel = (cat: SSRCategoryObject): string => {
    const currentLang = i18n.language || 'vi-VN';
    if (currentLang.includes('en')) {
      return cat.category_en && cat.category_en.trim() ? cat.category_en : cat.category;
    } else if (currentLang.includes('zh')) {
      return cat.category_zh && cat.category_zh.trim() ? cat.category_zh : cat.category;
    }
    return cat.category;
  };

  // ssrCategoryObjects debug removed
  const mainServiceMenus = ssrCategoryObjects.filter(isSSRGroupCategory).map((groupCat) => {
    // Building menu for group category debug removed
    // Lấy các lĩnh vực con cho group này
    const children = ssrCategoryObjects
      .filter((cat) => cat.group_slug === groupCat.slug && !cat.is_group_slug)
      .map((cat) => ({
        key: `/${cat.slug}`,
        label: getCategoryLabel(cat),
        path: buildPath(`/${cat.slug}`),
        icon: iconMap[cat.attributes_icon ?? ''] || <DatabaseOutlined />,
        children: [], // Đảm bảo type an toàn
      }));
    return {
      key: `/${groupCat.slug}`,
      label: getCategoryLabel(groupCat),
      path: buildPath(`/${groupCat.slug}`),
      icon: iconMap[groupCat.attributes_icon ?? ''] || <DatabaseOutlined />,
      children,
    };
  });

  // Main menu structure
  return [
    {
      key: "/",
      label: t("website.menu.home", "Trang Chủ"),
      path: buildPath("/"),
      icon: <HomeOutlined />,
      children: [],
    },
    ...mainServiceMenus,
    {
      key: "/cong-cu",
      label: t("website.menu.tools", "Công Cụ"),
      path: buildPath("/cong-cu"),
      icon: <ToolOutlined />,
      children: [
        {
          key: "/kqxs",
          label: t("website.menu.tools_kqxs", "Kết Quả Xổ Số"),
          path: buildPath("/kqxs"),
          icon: <TrophyOutlined />,
          children: [],
        },
        {
          key: "/xem-ngay",
          label: t("website.menu.tools_xemngay", "Xem Ngày"),
          path: buildPath("/xem-ngay"),
          icon: <CalendarOutlined />,
          children: [],
        },
      ],
    },
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