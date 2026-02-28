import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import {
  FacebookOutlined,
  TwitterOutlined,
  LinkedinOutlined,
  YoutubeOutlined,
  MailOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  CarOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
  CodeOutlined,
  SkinOutlined,
  HomeOutlined
} from "@ant-design/icons";


import styles from "./websiteLayout.module.css";
import logo from "#src/assets/svg/logo.svg?url";
import i18n from "i18next";
import { getDefaultCategorySlug } from "#src/utils/getDefaultCategorySlug";

export default function WebsiteFooter() {
  const { t } = useTranslation();
  const location = useLocation();
  const currentYear = new Date().getFullYear();

  // Replace {{year}} in translation with current year
  const copyrightText = t("website.footer.copyright").replace("{{year}}", currentYear.toString());

  // Không thêm ?hl=xx cho link trong admin/footer, chỉ dùng cho các trang wu_
  const langParam = "";
  // SSR category objects (with group_slug etc) injected as window.__SSR_WEBSITE_CATEGORY_OBJECTS__
  // Import SSR category object type
  let ssrCategories: any[] = (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) ? window.__SSR_WEBSITE_CATEGORIES__ : [];
  // Type guard cho category chuẩn hóa
  function isSSRCategory(cat: any): cat is { color: string; icon: string; description: string; category: string; slug: string; group_slug: string; is_group_slug: boolean } {
    return cat && typeof cat === 'object' && 'color' in cat && 'icon' in cat && 'description' in cat && 'category' in cat && 'slug' in cat && 'group_slug' in cat && typeof cat.group_slug === 'string' && 'is_group_slug' in cat && typeof cat.is_group_slug === 'boolean';
  }
  // Map icon name to AntD icon
  const iconMap: Record<string, React.ReactNode> = {
    ApartmentOutlined: <ApartmentOutlined />,
    ShoppingCartOutlined: <ShoppingCartOutlined />,
    CarOutlined: <CarOutlined />,
    CalendarOutlined: <CalendarOutlined />,
    AppstoreOutlined: <AppstoreOutlined />,
    CodeOutlined: <CodeOutlined />,
    SkinOutlined: <SkinOutlined />,
    HomeOutlined: <HomeOutlined />,
  };

  // Helper: language-aware category label from SSR fields
  const labelFromSSR = (cat: any): string => {
    const lang = i18n.language || 'vi-VN';
    if (lang.includes('en')) {
      const en = (cat?.category_en || '').toString();
      return en.trim() ? en : (cat?.category || '').toString();
    }
    if (lang.includes('zh')) {
      const zh = (cat?.category_zh || '').toString();
      return zh.trim() ? zh : (cat?.category || '').toString();
    }
    return (cat?.category || '').toString();
  };

  // Lấy các group tổng (group_slug === '' && is_group_slug === true)
function isSSRGroupCategory(cat: any): cat is {
  slug: string;
  group_slug: string;
  is_group_slug: boolean;
  category?: string;
  [key: string]: unknown;
} {
  if (!cat || typeof cat !== 'object') return false;
  if (cat.is_group_slug !== true) return false;
  if (typeof cat.slug !== 'string' || cat.slug.length === 0) return false;
  // Hỗ trợ dữ liệu group_slug rỗng hoặc bằng chính slug (định dạng hiện tại)
  return cat.group_slug === '' || cat.group_slug === cat.slug;
}
  // Lấy các lĩnh vực con cho tất cả group tổng
  let serviceCategories: Array<{ color: string; icon: React.ReactNode; description: string; category: string; slug: string; path: string }> = [];
  if (ssrCategories.length > 0) {
    const groupCategories = ssrCategories.filter(isSSRGroupCategory);
    for (const groupCat of groupCategories) {
      const children = ssrCategories
        .filter((cat: any) => cat.group_slug === groupCat.slug && cat.is_group_slug === false)
        .map((cat: any) => ({
          color: cat.color,
          icon: iconMap[cat.icon] || <AppstoreOutlined />,
          description: cat.description,
          category: labelFromSSR(cat),
          slug: cat.slug,
          path: `/${cat.slug}`,
        }));
      serviceCategories = serviceCategories.concat(children);
    }
  }

  return (
    <footer className={styles.websiteFooter}>
      <div className={styles.footerContent}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", justifyContent: "space-between", gap: 48, marginBottom: 32 }}>
          {/* Brand & Contact (Left) */}
          <div className={styles.footerBrand} style={{ minWidth: 260, flex: 1 }}>
            <div className={styles.footerLogo}>
              <img src={logo} alt="Logo" style={{ width: 52, height: 52, borderRadius: 16, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }} />
              <span className={styles.footerBrandName}>{t("website.footer.companyName", "Connecting Services")}</span>
            </div>
            <div className={styles.footerDescription} style={{ maxWidth: 320 }}>
              {t("website.footer.description", "Chuyên phát triển phần mềm, tool automation và kết nối đa lĩnh vực kinh doanh.")}
            </div>
            <div style={{ fontSize: 15, marginBottom: 10 }}>
              <MailOutlined style={{ color: "var(--brand-primary, #ffa726)", marginRight: 8 }} />
              {t("website.footer.email", "phanmemmottrieu@gmail.com")}
            </div>
            <div style={{ fontSize: 15, marginBottom: 10 }}>
              <PhoneOutlined style={{ color: "var(--brand-primary, #ffa726)", marginRight: 8 }} />
              {t("website.footer.phone", "0964014947 (Phone & Zalo)")}
            </div>
            <div style={{ fontSize: 15, marginBottom: 18 }}>
              <EnvironmentOutlined style={{ color: "var(--brand-primary, #ffa726)", marginRight: 8 }} />
              {t("website.footer.location", "TP.HCM , Việt Nam")}
            </div>
            <div className={styles.socialLinks}>
              <a className={styles.socialLink} href="https://facebook.com/connectingservices" aria-label="Facebook" target="_blank" rel="noopener noreferrer"><FacebookOutlined /></a>
              <a className={styles.socialLink} href="https://twitter.com/connectingservices" aria-label="Twitter" target="_blank" rel="noopener noreferrer"><TwitterOutlined /></a>
              <a className={styles.socialLink} href="https://linkedin.com/company/connectingservices" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer"><LinkedinOutlined /></a>
              <a className={styles.socialLink} href="https://youtube.com/@connectingservices" aria-label="YouTube" target="_blank" rel="noopener noreferrer"><YoutubeOutlined /></a>
            </div>
          </div>
          {/* Service Links (Right) - Tiêu đề động từ group tổng SSR */}
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-start", gap: 8 }}>
            <div className={styles.footerSection} style={{ alignSelf: "flex-end", width: "100%" }}>
              <h4>
                {ssrCategories.length > 0
                  ? (() => {
                      const groupCategories = ssrCategories.filter(isSSRGroupCategory);
                      if (groupCategories.length > 0) {
                        return labelFromSSR(groupCategories[0]) || groupCategories[0].slug;
                      }
                      return t('website.footer.services_title', 'Lĩnh Vực Dịch Vụ');
                    })()
                  : t('website.footer.services_title', 'Lĩnh Vực Dịch Vụ')}
              </h4>
              <ul className={styles.footerLinks} style={{ width: "100%", textAlign: "right", paddingRight: 0 }}>
                {serviceCategories.map((cat) => (
                  <li key={cat.slug}>
                    <a href={cat.path} style={{ color: cat.color }}>
                      <span style={{ fontSize: 20, display: "inline-flex", alignItems: "center" }}>{cat.icon}</span>
                      <span>{cat.category}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        {/* Bottom */}
        <div style={{ borderTop: "1px solid var(--card-border)", marginTop: 24, padding: "18px 0 8px 0", display: "flex", flexDirection: "column", alignItems: "center", color: "var(--text-secondary)", fontSize: 15 }}>
          <div style={{ marginBottom: 6 }}>
            {copyrightText}
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
            <a href="/privacy-policy" style={{ color: "inherit", textDecoration: "underline", borderRadius: 6, padding: "2px 8px" }}>{t("website.footer.privacy", "Chính Sách Bảo Mật")}</a>
            <a href="/terms-of-service" style={{ color: "inherit", textDecoration: "underline", borderRadius: 6, padding: "2px 8px" }}>{t("website.footer.terms", "Điều Khoản Sử Dụng")}</a>
            <a href="/ve-chung-toi" style={{ color: "inherit", textDecoration: "underline", borderRadius: 6, padding: "2px 8px" }}>{t("website.footer.about", "Về Chúng Tôi")}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}