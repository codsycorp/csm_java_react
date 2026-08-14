// Dùng slugify chuẩn hoá dùng chung
import { getDefaultCategorySlug } from "../../utils/getDefaultCategorySlug";
import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import i18n from "i18next";

const resolveSupportedLang = (raw?: string | null): 'vi' | 'en' | 'zh' => {
  const norm = String(raw || '').trim().toLowerCase();
  if (norm.startsWith('en')) return 'en';
  if (norm.startsWith('zh')) return 'zh';
  return 'vi';
};

const resolveLangFromPathname = (pathname: string): 'vi' | 'en' | 'zh' => {
  const first = String(pathname || '').trim().split('/').filter(Boolean)[0] || '';
  return resolveSupportedLang(first);
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

const normalizeWebsitePath = (path?: string): string => {
  const normalized = String(path || '/').split('?')[0].replace(/\/+$/g, '') || '/';
  const stripped = normalized.replace(/^\/(vi|en|zh)(?=\/|$)/i, '') || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
};

// Hook đổi ngôn ngữ theo ?hl= trên URL
function useLanguageFromQuery() {
  const location = useLocation();
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
}
// Local lightweight type for service posts
type ServicePost = {
  id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  content_en?: string;
  content_zh?: string;
  thumbnail?: string;
  serviceType: string;
  category?: string;
  publishDate?: string;
  tags?: string[];
  featured?: boolean;
  activeHome?: boolean;
  attributes?: Record<string, any>;
};
// Navigation sử dụng window.location.href để trigger SSR
import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
import {
  Row,
  Col,
  Card,
  Typography,
  Button,
  Tag,
} from "antd";
import {
  RocketOutlined,
  CodeOutlined,
  GlobalOutlined,
  HomeOutlined,
  SkinOutlined,
  CarOutlined,
  CalendarOutlined, // Thêm dòng này để fix lỗi không tìm thấy CalendarOutlined
  PhoneOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "#src/layout/website/websiteLayout.module.css";

const { Paragraph } = Typography;

// Inline SVG placeholder generator
const generatePlaceholder = (text: string, bgColor: string = '1890ff') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180" viewBox="0 0 400 180">
    <rect width="400" height="180" fill="#${bgColor}"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial, sans-serif" font-size="16" font-weight="600">${text}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

const sanitizeHomeHtml = (html?: string) => {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed').forEach((n) => n.remove());
    return doc.body.innerHTML;
  } catch {
    return html;
  }
};

const getLocalizedHomeContent = (post: ServicePost | undefined, language: string): string => {
  if (!post) return '';
  const lang = resolveSupportedLang(language);
  if (lang === 'en') return post.content_en || post.content || '';
  if (lang === 'zh') return post.content_zh || post.content || '';
  return post.content || post.content_en || post.content_zh || '';
};

export default function WuHome() {
  useLanguageFromQuery();
  const { t } = useTranslation();
  const menuItems = useWebsiteMenu();

  const getLangCode = () => {
    const short = resolveSupportedLang(i18n.language);
    return short === 'vi' || i18n.language === 'cimode' ? '' : short;
  };
  const getListingUrl = () => {
    const lang = getLangCode();
    const defaultSlug = getDefaultCategorySlug();
    return localizePath(`/${defaultSlug}`, lang || 'vi');
  };
  const getContactUrl = () => '/lien-he';
  // Enhanced Hero Section with modern design and SEO structure
  const HeroSection = () => (
    <section
      style={{
        width: '100%',
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '64px 0 32px 0',
        transition: 'background 0.3s, color 0.3s',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
            fontWeight: 700,
            marginBottom: 20,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            transition: 'color 0.3s',
          }}
        >
          {t('website.hero.title', 'Giải Pháp Phần Mềm Chuyên Nghiệp')}
        </h1>
        <p
          style={{
            fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
            color: 'var(--text-secondary)',
            margin: '0 auto 36px auto',
            maxWidth: 650,
            fontWeight: 400,
            lineHeight: 1.6,
            transition: 'color 0.3s',
          }}
        >
          {t('website.hero.subtitle', 'Chuyên phát triển phần mềm theo yêu cầu, cung cấp các tool automation hàng đầu và giải pháp công nghệ toàn diện cho doanh nghiệp hiện đại')}
        </p>
        <div
          style={{
            display: 'flex',
            gap: 20,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: 24,
          }}
        >
          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            style={{
              background: 'var(--brand-primary)',
              color: 'var(--button-text-primary, #fff)',
              border: 'none',
              borderRadius: 32,
              fontWeight: 600,
              fontSize: 18,
              padding: '0 36px',
              height: 56,
              boxShadow: '0 4px 24px 0 rgba(26,54,93,0.08)',
              transition: 'background 0.3s, color 0.3s',
            }}
            href={getListingUrl()}
          >
            {t('website.hero.exploreProducts', 'Khám Phá Sản Phẩm')}
          </Button>
          <Button
            type="default"
            size="large"
            icon={<PhoneOutlined />}
            style={{
              background: 'var(--button-bg-secondary, transparent)',
              color: 'var(--brand-primary)',
              border: '2px solid var(--brand-primary)',
              borderRadius: 32,
              fontWeight: 600,
              fontSize: 18,
              padding: '0 36px',
              height: 56,
              boxShadow: 'none',
              transition: 'background 0.3s, color 0.3s, border 0.3s',
            }}
            href={getContactUrl()}
          >
            {t('website.hero.contactNow', 'Liên Hệ Ngay')}
          </Button>
        </div>
      </div>
    </section>
  );

  // Enhanced Stats Section with animations
  const StatsSection = () => (
    <section className={styles.statsContainer}>
      <Row gutter={[32, 32]} justify="center">
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>500+</span>
            <span className={styles.statLabel}>{t('website.stats.projects', 'Dự Án Hoàn Thành')}</span>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>98%</span>
            <span className={styles.statLabel}>{t('website.stats.satisfaction', 'Khách Hàng Hài Lòng')}</span>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>8+</span>
            <span className={styles.statLabel}>{t('website.stats.experience', 'Năm Kinh Nghiệm')}</span>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>4</span>
            <span className={styles.statLabel}>{t('website.stats.sectors', 'Lĩnh Vực Kinh Doanh')}</span>
          </div>
        </Col>
      </Row>
    </section>
  );

  // Business Bridge Sectors: lấy từ SSR nếu có
  // Map icon string từ SSR thành component
  const iconMap: Record<string, JSX.Element> = {
    CodeOutlined: <CodeOutlined />, 
    HomeOutlined: <HomeOutlined />, 
    SkinOutlined: <SkinOutlined />, 
    CarOutlined: <CarOutlined />, 
    CalendarOutlined: <CalendarOutlined />, 
    AppstoreOutlined: <AppstoreOutlined />, 
    GlobalOutlined: <GlobalOutlined />,
  };
  
  // Read SSR categories in useMemo to avoid re-render mismatches
  const ssrCategories = useMemo(() => {
    if (typeof window === 'undefined') return [];
    return Array.isArray(window.__SSR_WEBSITE_CATEGORIES__) ? window.__SSR_WEBSITE_CATEGORIES__ : [];
  }, []);
  
  const businessSectors = useMemo(() => {
    const isSSRCategory = (cat: any): cat is { color: string; icon: string; description: string; category: string; slug: string; group_slug: string; is_group_slug: boolean } => {
      return cat && typeof cat === 'object' && 'color' in cat && 'icon' in cat && 'description' in cat && 'category' in cat && 'slug' in cat && 'group_slug' in cat && typeof cat.group_slug === 'string' && 'is_group_slug' in cat && typeof cat.is_group_slug === 'boolean';
    };
    
    if (ssrCategories.length > 0) {
      return ssrCategories
        .filter(cat => isSSRCategory(cat) && cat.group_slug !== '' && cat.is_group_slug === false)
        .map((cat: any) => ({
          key: cat.slug,
          slug: cat.slug,
          title: cat.category,
          description: cat.description,
          icon: iconMap[cat.icon] || <GlobalOutlined />,
          color: cat.color || '#1890ff',
          route: (() => {
            const lang = getLangCode();
            return localizePath(`/${cat.slug}`, lang || 'vi');
          })(),
          stats: '',
        }));
    }
    
    // fallback: giữ nguyên logic cũ nếu không có SSR
    return [
      {
        key: "bat-dong-san",
        slug: "bat-dong-san",
        title: t("website.services.categories.realEstate.title", "Bất Động Sản"),
        description: t("website.services.categories.realEstate.description", "Tin tức thị trường, dự án mới và tư vấn đầu tư bất động sản"),
        icon: <HomeOutlined />, 
        color: "#13c2c2",
        route: (() => {
          const lang = getLangCode();
          return localizePath('/bat-dong-san', lang || 'vi');
        })(),
        stats: t("website.business.realestate.stats", "500+ Dự án"),
      },
    ];
  }, [ssrCategories, i18n.language, t, iconMap]);

  // State cho sản phẩm nổi bật và đặc biệt lấy từ API hoặc mock
  const [homeCmsContent, setHomeCmsContent] = useState<string>('');
  React.useEffect(() => {
    let ssrList: ServicePost[] = [];
    try {
      const w: any = typeof window !== 'undefined' ? window : undefined;
      const initial = w && (w.__INITIAL_REACT_DATA__ || w.initialReactData);
      const ssrPath = normalizeWebsitePath(initial?.currentPagePath || '/');
      const currentPath = normalizeWebsitePath(w?.location?.pathname || '/');
      if (initial && (ssrPath === '/' || ssrPath === currentPath)) {
        const dataList = Array.isArray(initial.homeDetailList)
          ? initial.homeDetailList
          : (Array.isArray(initial.serviceDetailList) ? initial.serviceDetailList : []);
        if (dataList.length > 0) {
          const getThumbnail = (p: any): string => {
            const value = p.thumbnail || p.cover || '';
            if (Array.isArray(value)) return value[0] || '';
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed[0] || '';
              } catch {}
            }
            return value || '';
          };
          
          ssrList = dataList.map((p: any) => ({
            id: String(p.id || ''),
            title: String(p.title || ''),
            slug: p.slug || '',
            excerpt: p.excerpt || '',
            content: p.content || '',
            content_en: p.content_en || '',
            content_zh: p.content_zh || '',
            thumbnail: getThumbnail(p),
            serviceType: String(p.service_type || p.serviceType || 'phan-mem'),
            publishDate: p.publish_date || p.publishDate || '',
            featured: !!p.featured,
            activeHome: !!p.activeHome || !!p.active_home,
            attributes: typeof p.attributes === 'string' ? JSON.parse(p.attributes) : (p.attributes || {}),
          }));
        }
      }
    } catch {
      ssrList = [];
    }

    if (ssrList.length > 0) {
      const homeEntry = ssrList.find((post) => post.slug === 'home' || post.serviceType === 'home');
      setHomeCmsContent(sanitizeHomeHtml(getLocalizedHomeContent(homeEntry, i18n.language)));
    } else {
      setHomeCmsContent('');
    }
  }, []);
  const belowFoldSectionStyle: React.CSSProperties = {
    contentVisibility: 'auto',
    containIntrinsicSize: '1000px',
  };
  const businessSectorsTitle = i18n.language?.startsWith('en')
    ? 'Business Partnership'
    : i18n.language?.startsWith('zh')
      ? '商业合作'
      : 'Hợp Tác Kinh Doanh';
  const businessSectorsSubtitle = i18n.language?.startsWith('en')
    ? 'Partnership across industries, services and business solutions on one platform'
    : i18n.language?.startsWith('zh')
      ? '在一个平台开展多行业、多服务和多种业务解决方案合作'
      : 'Hợp tác đa ngành, đa lĩnh vực và đa dịch vụ trên một nền tảng';

  return (

  <WebsiteLayout menuItems={menuItems} selectedKey="/">
      {HeroSection()}

      {homeCmsContent ? (
        <section style={{ padding: '16px 24px 32px', background: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', border: '1px solid var(--card-border)', borderRadius: 16, background: 'var(--card-bg)', padding: 24 }}>
            <div className="cms-content" style={{ color: 'var(--text-primary)', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: homeCmsContent }} />
          </div>
        </section>
      ) : null}

      {/* Business Sectors Section */}
      <div style={{
        padding: "80px 24px 60px 24px",
        background: "var(--bg-secondary)",
        ...belowFoldSectionStyle,
      }}>
        <Row justify="center">
          <Col xs={24} lg={20}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <h2 style={{
                color: "var(--text-primary)",
                marginBottom: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)"
              }}>
                {t('website.business.sectors.title', businessSectorsTitle)}
              </h2>
              <Paragraph style={{
                fontSize: "18px",
                color: "var(--text-secondary)",
                maxWidth: "600px",
                margin: "0 auto"
              }}>
                {t('website.business.sectors.subtitle', businessSectorsSubtitle)}
              </Paragraph>
            </div>
            <Row gutter={[32, 32]} justify="center">
              {businessSectors.map((sector, idx) => (
                <Col xs={24} sm={12} md={12} lg={6} key={sector.key} style={{ display: "flex" }}>
                  <a href={sector.route} style={{ display:'flex', flex:1, textDecoration:'none', color:'inherit' }} aria-label={sector.title}>
                  <Card
                    hoverable
                    style={{
                      borderRadius: 20,
                      minHeight: 340,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      alignItems: "center",
                      boxShadow: `0 2px 16px ${sector.color}22, 0 2px 8px var(--shadow-color, rgba(0,0,0,0.06))`,
                      border: `2px solid ${sector.color}33`,
                      background: "var(--card-bg)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      transition: "box-shadow 0.3s, border 0.3s, transform 0.25s cubic-bezier(.4,2,.6,1), background 0.3s, color 0.3s",
                      position: "relative",
                      overflow: "hidden",
                      padding: 0,
                    }}
                    bodyStyle={{ padding: 28, textAlign: "center", width: "100%", height: "100%" }}
                    className="business-sector-card"
                  >
                    <div style={{
                      width: 70,
                      height: 70,
                      margin: "0 auto 18px auto",
                      borderRadius: 16,
                      background: `linear-gradient(135deg, ${sector.color}22 0%, var(--bg-secondary) 100%)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 36,
                      color: sector.color,
                      boxShadow: `0 2px 12px ${sector.color}22`,
                      transition: "background 0.3s, color 0.3s"
                    }}>
                      {sector.icon}
                    </div>
                    <h3 style={{
                      fontWeight: 700,
                      fontSize: 20,
                      margin: "0 0 8px 0",
                      color: sector.color,
                      letterSpacing: 0.2,
                      transition: "color 0.3s"
                    }}>{sector.title}</h3>
                    <Paragraph style={{ color: "var(--text-secondary)", minHeight: 48, marginBottom: 12, fontSize: 15 }}>{sector.description}</Paragraph>
                    <Tag color={sector.color} style={{ fontWeight: 600, borderRadius: 8, fontSize: 14, padding: "2px 14px", background: `${sector.color}11`, color: sector.color, border: "none" }}>{sector.stats}</Tag>
                    {/* Hiệu ứng sóng khi hover */}
                    <span className="sector-card-wave" style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      width: "100%",
                      height: 6,
                      background: `linear-gradient(90deg, transparent 0%, ${sector.color}55 50%, transparent 100%)`,
                      opacity: 0.7,
                      filter: "blur(2px)",
                      transition: "opacity 0.3s"
                    }} />
                  </Card>
                  </a>
                </Col>
              ))}
            </Row>
          </Col>
        </Row>
      </div>

		</WebsiteLayout>
	);
}

/* CSS bổ sung (thêm vào file css hoặc styled-jsx):
.business-sector-card {
  background: var(--card-bg) !important;
  color: var(--text-primary) !important;
  min-height: 340px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 0 !important;
}
.business-sector-card:hover {
  transform: translateY(-8px) scale(1.04);
  box-shadow: 0 8px 32px var(--shadow-medium, rgba(0,0,0,0.12));
  border-color: var(--brand-primary, #1a365d);
  background: var(--bg-primary) !important;
  color: var(--brand-primary) !important;
}
.business-sector-card:hover .sector-card-wave {
  opacity: 1;
  filter: blur(0.5px);
}
*/
