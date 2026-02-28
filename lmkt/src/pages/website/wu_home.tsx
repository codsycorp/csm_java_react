// Dùng slugify chuẩn hoá dùng chung
import { slugify } from "../../utils/normalize";
import { getDefaultCategorySlug } from "../../utils/getDefaultCategorySlug";
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router";
import i18n from "i18next";
// Hook đổi ngôn ngữ theo ?hl= trên URL
function useLanguageFromQuery() {
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hl = params.get("hl");
    if (hl === "en" || hl === "vi") {
      i18n.changeLanguage(hl);
      // Chỉ xóa ?hl nếu là tiếng Việt để giữ URL sạch, các ngôn ngữ khác giữ nguyên
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
}
// Local lightweight type for service posts
type ServicePost = {
  id: string;
  title: string;
  slug?: string;
  excerpt?: string;
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
  Space,
  Statistic,
  Tag,
  Avatar,
  List,
} from "antd";
import {
  RocketOutlined,
  CodeOutlined,
  CloudDownloadOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  ArrowRightOutlined,
  TrophyOutlined,
  UserOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  SafetyOutlined,
  StarOutlined,
  HomeOutlined,
  SkinOutlined,
  CarOutlined,
  ShoppingOutlined,
  CalendarOutlined, // Thêm dòng này để fix lỗi không tìm thấy CalendarOutlined
  MobileOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  PhoneOutlined,
  StarFilled,
  AppstoreOutlined,
} from "@ant-design/icons";
import { extractSSRInitialData } from "../../utils/normalize";
import { useTranslation } from "react-i18next";
import styles from "#src/layout/website/websiteLayout.module.css";
import { fetchServiceList } from "#src/api/wu_service";

const { Title, Paragraph, Text } = Typography;

// Inline SVG placeholder generator
const generatePlaceholder = (text: string, bgColor: string = '1890ff') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180" viewBox="0 0 400 180">
    <rect width="400" height="180" fill="#${bgColor}"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial, sans-serif" font-size="16" font-weight="600">${text}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

export default function WuHome() {
  useLanguageFromQuery();
  const { t } = useTranslation();
  const menuItems = useWebsiteMenu();

  // Navigation handlers - All use SSR (window.location.href)
  const handleNavigateToSector = (sectorSlug: string) => {
    // Not used - sectors use direct href in render
  };

  const getLangCode = () => (i18n.language && i18n.language !== 'vi' && i18n.language !== 'cimode') ? i18n.language.slice(0,2) : '';
  const getListingUrl = () => {
    const lang = getLangCode();
    const defaultSlug = getDefaultCategorySlug();
    return lang && lang !== 'vi' ? `/${defaultSlug}?hl=${lang}` : `/${defaultSlug}`;
  };
  const getContactUrl = () => '/lien-he';
  const computePostHref = (post: ServicePost) => {
    const lang = getLangCode();
    const langParam = lang && lang !== 'vi' ? `?hl=${lang}` : '';
    if (!post.serviceType || !post.slug) return getListingUrl();
    return `/${post.serviceType}/${post.slug}${langParam}`;
  };

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
          {t('website.hero.title', 'Giải Pháp Bất Động Sản & Cầu Nối Đầu Tư')}
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
          {t('website.hero.subtitle', 'Tổng hợp dự án căn hộ, nhà phố, đất nền khu Tây; tư vấn đầu tư, mua bán, chuyển nhượng và hỗ trợ pháp lý minh bạch.')}
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
            icon={<HomeOutlined />}
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
            {t('website.hero.exploreProducts', 'Xem Dự Án Bất Động Sản')}
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
            {t('website.hero.contactNow', 'Tư Vấn Miễn Phí')}
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
            <span className={styles.statNumber}>5</span>
            <span className={styles.statLabel}>{t('website.stats.projects', 'Dự Án Tiêu Biểu')}</span>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>1000+</span>
            <span className={styles.statLabel}>{t('website.stats.satisfaction', 'Căn Hộ Đã Bán')}</span>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>50+</span>
            <span className={styles.statLabel}>{t('website.stats.experience', 'Chuyên Viên Tư Vấn')}</span>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>24/7</span>
            <span className={styles.statLabel}>{t('website.stats.sectors', 'Hỗ Trợ Khách Hàng')}</span>
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
  let businessSectors: Array<any> = [];
  if (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) {
    // Ưu tiên danh mục SSR: lấy các danh mục con thuộc group chính (ví dụ: 'bat-dong-san')
    const categories = window.__SSR_WEBSITE_CATEGORIES__ as Array<any>;
    const isGroup = (cat: any): cat is { slug: string; group_slug: string; is_group_slug: boolean } => (
      cat && typeof cat === 'object' && 'slug' in cat && 'group_slug' in cat && 'is_group_slug' in cat &&
      typeof cat.slug === 'string' && typeof cat.group_slug === 'string' && typeof cat.is_group_slug === 'boolean'
    );
    const isChild = (cat: any): cat is { slug: string; group_slug: string; is_group_slug: boolean } => (
      isGroup(cat) && cat.group_slug !== '' && cat.is_group_slug === false
    );
    const groupCandidates = categories.filter((c) => isGroup(c) && c.group_slug === '' && c.is_group_slug === true);
    // Chọn group ưu tiên: mặc định 'bat-dong-san' nếu có, nếu không chọn group có is_group_slug_default, nếu vẫn không có thì lấy group đầu tiên
    let selectedGroup: any | undefined = groupCandidates.find((g) => g.slug === 'bat-dong-san');
    if (!selectedGroup) {
      selectedGroup = groupCandidates.find((g: any) => !!g.is_group_slug_default);
    }
    if (!selectedGroup) {
      selectedGroup = groupCandidates.length > 0 ? groupCandidates[0] : undefined;
    }
    if (selectedGroup) {
      const lang = i18n.language && i18n.language !== 'cimode' ? i18n.language.slice(0,2) : 'vi';
      const getTitleByLang = (cat: any) => {
        if (lang === 'en') return cat.category_en || cat.category || '';
        if (lang === 'zh') return cat.category_zh || cat.category || '';
        return cat.category || '';
      };
      const getDescByLang = (cat: any) => {
        if (lang === 'en') return cat.description_en || cat.description || '';
        if (lang === 'zh') return cat.description_zh || cat.description || '';
        return cat.description || '';
      };
      businessSectors = categories
        .filter((c) => isChild(c) && c.group_slug === selectedGroup.slug)
        .map((cat: any) => ({
          key: cat.slug,
          slug: cat.slug,
          title: getTitleByLang(cat),
          description: getDescByLang(cat),
          icon: iconMap[cat.icon] || <GlobalOutlined />,
          color: cat.color || '#1890ff',
          route: (() => {
            return lang !== 'vi' ? `/${cat.slug}?hl=${lang}` : `/${cat.slug}`;
          })(),
          stats: '',
        }));
    }
  }
  if (!businessSectors || businessSectors.length === 0) {
    // Fallback tĩnh như lmkt_bk: 5 dự án tiêu biểu
    businessSectors = [
      {
        key: "sunshine",
        slug: "sunshine",
        title: "Sunshine",
        description: "Dự án Sunshine hiện đại, vị trí đắc địa, tiện ích đa dạng.",
        icon: <HomeOutlined />, 
        color: "#13c2c2",
        route: "/sunshine",
        stats: "Hơn 2.000 căn hộ"
      },
      {
        key: "kieu-by-kita",
        slug: "kieu-by-kita",
        title: "Kiều by Kita",
        description: "Dự án Kiều by Kita sang trọng, thiết kế tinh tế, pháp lý minh bạch.",
        icon: <HomeOutlined />, 
        color: "#1890ff",
        route: "/kieu-by-kita",
        stats: "Hơn 1.500 căn hộ"
      },
      {
        key: "destino-centro",
        slug: "destino-centro",
        title: "Destino Centro",
        description: "Destino Centro - trung tâm kết nối, tiện ích vượt trội.",
        icon: <HomeOutlined />, 
        color: "#faad14",
        route: "/destino-centro",
        stats: "Hơn 1.200 căn hộ"
      },
      {
        key: "the-win-city",
        slug: "the-win-city",
        title: "The Win City",
        description: "The Win City - cộng đồng trẻ trung, năng động, giá trị bền vững.",
        icon: <HomeOutlined />, 
        color: "#eb2f96",
        route: "/the-win-city",
        stats: "Hơn 1.000 căn hộ"
      },
      {
        key: "king-hill-residences",
        slug: "king-hill-residences",
        title: "King Hill Residences",
        description: "King Hill Residences - phong cách đẳng cấp, tiện ích quốc tế.",
        icon: <HomeOutlined />, 
        color: "#52c41a",
        route: "/king-hill-residences",
        stats: "Hơn 800 căn hộ"
      }
    ];
  }

  // State cho sản phẩm nổi bật và đặc biệt lấy từ API hoặc mock
  const [featuredSoftwarePosts, setFeaturedSoftwarePosts] = useState<ServicePost[]>([]);
  const [specialSoftwarePosts, setSpecialSoftwarePosts] = useState<ServicePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featuredPage, setFeaturedPage] = useState(1);
  const [specialPage, setSpecialPage] = useState(1);
  const PAGE_SIZE = 3;
  React.useEffect(() => {
    setLoading(true);
    setError(null);
    
    // 1. Ưu tiên sử dụng dữ liệu SSR từ backend
    let ssrList: ServicePost[] | undefined = undefined;
    try {
      const w: any = typeof window !== 'undefined' ? window : undefined;
      const initial = w && (w.__INITIAL_REACT_DATA__ || w.initialReactData);
      
      // SSR Home: Checking data
      
      // Check if SSR data matches current page (homepage)
      if (initial && (initial.currentPagePath === '/' || initial.currentPagePath === (w?.location?.pathname || ''))) {
        let dataList = null;
        
        // Priority: homeDetailList (homepage) > serviceDetailList (fallback)
        if (Array.isArray(initial.homeDetailList) && initial.homeDetailList.length > 0) {
          dataList = initial.homeDetailList;
          // SSR: Found posts in homeDetailList
        } else if (Array.isArray(initial.serviceDetailList) && initial.serviceDetailList.length > 0) {
          dataList = initial.serviceDetailList;
          // SSR: Found posts in serviceDetailList (fallback)
        }
        
        if (dataList) {
          ssrList = dataList.map((p: any) => ({
            id: String(p.id || ''),
            title: String(p.title || ''),
            slug: p.slug || '',
            excerpt: p.excerpt || '',
            thumbnail: p.thumbnail || p.cover || '',
            serviceType: String(p.service_type || p.serviceType || 'bat-dong-san'),
            publishDate: p.publish_date || p.publishDate || '',
            featured: !!p.featured,
            activeHome: !!p.activeHome || !!p.active_home,
            attributes: typeof p.attributes === 'string' ? JSON.parse(p.attributes) : (p.attributes || {}),
          }));
          if (ssrList) {
            // SSR: Normalized home posts from SSR data
          }
        }
      }
    } catch (e) {
      // Error loading SSR data
    }
    
    // If SSR data available, use it and skip API
    if (ssrList && ssrList.length > 0) {
      // Chỉ hiển thị bài viết thuộc category 'bat-dong-san' trên trang chủ
      const filteredList = ssrList.filter((post) => post.serviceType === 'bat-dong-san');
      const featuredData = filteredList.filter((post) => !!post.featured);
      const specialData = filteredList.filter((post) => !!post.activeHome);
      setFeaturedSoftwarePosts(featuredData.length > 0 ? featuredData : filteredList.slice(0, 6));
      setSpecialSoftwarePosts(specialData.length > 0 ? specialData : filteredList.slice(6, 12));
      setLoading(false);
      // Using SSR data, filtered to 'bat-dong-san', skipping API call
      return;
    }
    
    // 2. Fallback to API if no SSR data
    // No SSR data, fetching from API...
    // Server-side filter: chỉ lấy bài viết active + category 'bat-dong-san'.
    fetchServiceList('bat-dong-san', 20, undefined, { q: undefined })
      .then((res) => {
        // API: fetchServiceList response
        const data = Array.isArray(res?.data) ? res.data as ServicePost[] : [];
        const featuredData = data.filter((post) => !!post.featured);
        const specialData = data.filter((post) => !!post.activeHome);
        setFeaturedSoftwarePosts(featuredData.length > 0 ? featuredData : data.slice(0, 6));
        setSpecialSoftwarePosts(specialData.length > 0 ? specialData : data.slice(6, 12));
        // API: Loaded featured and special
      }).catch((err) => {
        // API Error
        setFeaturedSoftwarePosts([]);
        setSpecialSoftwarePosts([]);
        setError('Lỗi tải dữ liệu');
      })
      .finally(() => setLoading(false));
  }, []);
  const featuredTotalPages = Math.ceil(featuredSoftwarePosts.length / PAGE_SIZE);
  const specialTotalPages = Math.ceil(specialSoftwarePosts.length / PAGE_SIZE);
  const featuredPagePosts = featuredSoftwarePosts.slice((featuredPage-1)*PAGE_SIZE, featuredPage*PAGE_SIZE);
  const specialPagePosts = specialSoftwarePosts.slice((specialPage-1)*PAGE_SIZE, specialPage*PAGE_SIZE);

  // Featured Projects for "Top 5" section: load from SSR serviceDetailList first, fallback to SSR categories
  const featuredProjects = React.useMemo(() => {
    const sourceList = (featuredSoftwarePosts && featuredSoftwarePosts.length > 0)
      ? featuredSoftwarePosts
      : (specialSoftwarePosts && specialSoftwarePosts.length > 0)
        ? specialSoftwarePosts
        : [];
    // Deduplicate by slug/id and map to card shape
    const seen = new Set<string>();
    const mapped = sourceList
      .filter((p) => {
        const key = String(p.slug || p.id || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5)
      .map((p) => ({
        key: String(p.slug || p.id || ''),
        slug: p.slug,
        title: p.title,
        description: p.excerpt || '',
        icon: <HomeOutlined />,
        color: '#1890ff',
        route: computePostHref(p),
        stats: p.publishDate ? new Date(p.publishDate).toLocaleDateString() : ''
      }));
    return mapped;
  }, [featuredSoftwarePosts, specialSoftwarePosts]);

  // Display list: prefer dynamic projects; fallback to SSR categories or static
  // Hiển thị đúng số danh mục mà backend trả về (không giới hạn 5)
  const displayProjects = (businessSectors && businessSectors.length > 0)
    ? businessSectors
    : (featuredProjects && featuredProjects.length > 0)
      ? featuredProjects
      : [];

  return (

  <WebsiteLayout menuItems={menuItems} selectedKey="/">
      {HeroSection()}

      {/* Debug: show counts when loaded (helps identify missing data) */}
      {!loading && featuredSoftwarePosts.length === 0 && specialSoftwarePosts.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
          <strong>Không có dữ liệu hiển thị trên trang chủ.</strong>
          {/* Debug info removed for production */}
        </div>
      )}

  {/* Main Products Section */}
      <div style={{ 
        padding: "100px 24px",
        background: "var(--bg-primary)"
      }}>
        <Row justify="center">
          <Col xs={24} lg={20}>
            <div style={{ textAlign: "center", marginBottom: "60px" }}>
              <h2 style={{ 
                color: "var(--text-primary)", 
                marginBottom: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)"
              }}
            >
              {t('website.products.title', 'Dự Án Bất Động Sản Tiêu Biểu')}
              </h2>
              <Paragraph style={{ 
                fontSize: "18px", 
                color: "var(--text-secondary)", 
                maxWidth: "600px", 
                margin: "0 auto" 
              }}
            >
                {t('website.products.subtitle', 'Các dự án nổi bật, vị trí đắc địa, tiện ích đa dạng, pháp lý minh bạch giúp tối ưu hóa đầu tư của bạn')}
              </Paragraph>
            </div>
            
            <Row gutter={[32, 32]}>
              {featuredPagePosts.map((post) => {
                const slug = post.slug;
                return (
                  <Col xs={24} lg={8} key={post.id}>
                    <Card
                      className={styles.productCard}
                      style={{
                        height: "100%",
                        borderRadius: "20px",
                        overflow: "hidden",
                        border: "1px solid var(--card-border)",
                        boxShadow: "var(--card-shadow)",
                        transition: "all 0.3s ease",
                        background: "var(--card-bg)",
                        cursor: "pointer",
                      }}
                      hoverable
                      cover={
                        <a href={computePostHref(post)} aria-label={post.title} style={{ display:'block' }}>
                          <img 
                            src={post.thumbnail || generatePlaceholder(post.title.substring(0, 30), '1890ff')} 
                            alt={post.title} 
                            style={{ height: 180, objectFit: "cover" }} 
                            onError={(e) => { 
                              const target = e.target as HTMLImageElement;
                              if (!target.src.startsWith('data:')) {
                                target.onerror = null; 
                                target.src = generatePlaceholder('Image Error', 'cccccc');
                              }
                            }}
                          />
                        </a>
                      }
                    >
                      <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
                        <a href={computePostHref(post)} style={{ color: 'var(--brand-primary)', textDecoration: 'none' }} aria-label={post.title}>{post.title}</a>
                      </h3>
                      <Paragraph style={{ color: "var(--text-secondary)", minHeight: 48 }}>{post.excerpt}</Paragraph>
                      <div style={{ marginTop: 12 }}>
                        {post.attributes?.downloadLink ? (
                          <Button type="primary" href={post.attributes.downloadLink} target="_blank" rel="noopener noreferrer">
                            {t("website.products.download", "Tải ứng dụng")}
                          </Button>
                        ) : (
                          <Button type="link" href={computePostHref(post)}>
                            {t("website.products.detail", "Xem chi tiết")}
                          </Button>
                        )}
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
            {/* Pagination for featured: only show if more than 1 page */}
            {featuredTotalPages > 1 && (
              <div style={{ textAlign: "center", marginTop: 32 }}>
                <Button
                  disabled={featuredPage === 1}
                  onClick={() => setFeaturedPage(p => Math.max(1, p-1))}
                  style={{ marginRight: 12 }}
                >
                  {t('website.pagination.prev', 'Trước')}
                </Button>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{featuredPage} / {featuredTotalPages}</span>
                <Button
                  disabled={featuredPage === featuredTotalPages}
                  onClick={() => setFeaturedPage(p => Math.min(featuredTotalPages, p+1))}
                  style={{ marginLeft: 12 }}
                >
                  {t('website.pagination.next', 'Sau')}
                </Button>
              </div>
            )}
          </Col>
        </Row>
      </div>

  {/* Software Services Section */}
      <div style={{ 
        padding: "100px 24px",
        background: "var(--bg-primary)"
      }}>
        <Row justify="center">
          <Col xs={24} lg={20}>
            <div style={{ textAlign: "center", marginBottom: "60px" }}>
              <h2 style={{ 
                color: "var(--text-primary)", 
                marginBottom: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)"
              }}>
                {t('website.services.title', 'Dịch vụ hỗ trợ bất động sản')}
              </h2>
              <Paragraph style={{ 
                fontSize: "18px", 
                color: "var(--text-secondary)", 
                maxWidth: "600px", 
                margin: "0 auto" 
              }}>
                {t('website.services.subtitle', 'Tư vấn đầu tư, chuyển nhượng, cho thuê, quản lý và truyền thông dự án bất động sản khu Tây')}
              </Paragraph>
            </div>
            <Row gutter={[32, 32]}>
              {specialPagePosts.length === 0 ? (
                <Col span={24} style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 18 }}>
                  {t('website.services.noSpecial', 'Hiện chưa có dịch vụ bất động sản đặc biệt nào.')}
                </Col>
              ) : (
                specialPagePosts.map((post) => {
                  const slug = post.slug;
                  return (
                    <Col xs={24} lg={8} key={post.id}>
                      <Card
                        className={styles.productCard}
                        style={{
                          height: "100%",
                          borderRadius: "20px",
                          overflow: "hidden",
                          border: "1px solid var(--card-border)",
                          boxShadow: "var(--card-shadow)",
                          transition: "all 0.3s ease",
                          background: "var(--card-bg)",
                          cursor: "pointer",
                        }}
                        hoverable
                        cover={
                          <a href={computePostHref(post)} aria-label={post.title} style={{ display:'block' }}>
                            <img 
                              src={post.thumbnail || generatePlaceholder(post.title.substring(0, 30), '52c41a')} 
                              alt={post.title} 
                              style={{ height: 180, objectFit: "cover" }} 
                              onError={(e) => { 
                                const target = e.target as HTMLImageElement;
                                if (!target.src.startsWith('data:')) {
                                  target.onerror = null; 
                                  target.src = generatePlaceholder('Image Error', 'cccccc');
                                }
                              }}
                            />
                          </a>
                        }
                      >
                        <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
                          <a href={computePostHref(post)} style={{ color: 'var(--brand-primary)', textDecoration: 'none' }} aria-label={post.title}>{post.title}</a>
                        </h3>
                        <Paragraph style={{ color: "var(--text-secondary)", minHeight: 48 }}>{post.excerpt}</Paragraph>
                        <div style={{ marginTop: 12 }}>
                          <Button type="link" href={computePostHref(post)}>{t('website.products.detail', 'Xem chi tiết')}</Button>
                        </div>
                      </Card>
                    </Col>
                  );
                })
              )}
            </Row>
            {/* Pagination for special: only show if more than 1 page */}
            {specialTotalPages > 1 && (
              <div style={{ textAlign: "center", marginTop: 32 }}>
                <Button
                  disabled={specialPage === 1}
                  onClick={() => setSpecialPage(p => Math.max(1, p-1))}
                  style={{ marginRight: 12 }}
                >
                  {t('website.pagination.prev', 'Trước')}
                </Button>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{specialPage} / {specialTotalPages}</span>
                <Button
                  disabled={specialPage === specialTotalPages}
                  onClick={() => setSpecialPage(p => Math.min(specialTotalPages, p+1))}
                  style={{ marginLeft: 12 }}
                >
                  {t('website.pagination.next', 'Sau')}
                </Button>
              </div>
            )}
          </Col>
        </Row>
      </div>


      {/* Dự án bất động sản nổi bật */}
      <div style={{
        padding: "100px 24px",
        background: "var(--bg-primary)"
      }}>
        <Row justify="center">
          <Col xs={24} lg={20}>
            <div style={{ textAlign: "center", marginBottom: "60px" }}>
              <h2 style={{
                color: "var(--text-primary)",
                marginBottom: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)"
              }}>
                {t('website.projects.featured.title', 'Dự Án Bất Động Sản Tiêu Biểu')}
              </h2>
              <Paragraph style={{
                fontSize: "18px",
                color: "var(--text-secondary)",
                maxWidth: "600px",
                margin: "0 auto"
              }}>
                {t('website.projects.featured.subtitle', 'Tổng hợp các dự án căn hộ nổi bật, vị trí đắc địa, tiện ích đa dạng, pháp lý minh bạch.')}
              </Paragraph>
            </div>
            <Row gutter={[32, 32]}>
              {displayProjects.map((project) => (
                <Col xs={24} lg={8} key={project.key}>
                  <Card
                    className={styles.productCard}
                    style={{
                      height: "100%",
                      borderRadius: "20px",
                      overflow: "hidden",
                      border: `1px solid ${project.color}`,
                      boxShadow: "var(--card-shadow)",
                      transition: "all 0.3s ease",
                      background: "var(--card-bg)",
                      cursor: "pointer",
                    }}
                    hoverable
                  >
                    <div style={{ textAlign: "center", marginBottom: 18 }}>
                      <div style={{
                        width: 70,
                        height: 70,
                        margin: "0 auto 18px auto",
                        borderRadius: 16,
                        background: `linear-gradient(135deg, ${project.color}22 0%, var(--bg-secondary) 100%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 36,
                        color: project.color,
                        boxShadow: `0 2px 12px ${project.color}22`,
                        transition: "background 0.3s, color 0.3s"
                      }}>
                        {project.icon}
                      </div>
                      <h3 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 8px 0", color: project.color }}>{project.title}</h3>
                      <Paragraph style={{ color: "var(--text-secondary)", minHeight: 48, marginBottom: 12, fontSize: 15 }}>{project.description}</Paragraph>
                      <Tag color={project.color} style={{ fontWeight: 600, borderRadius: 8, fontSize: 14, padding: "2px 14px", background: `${project.color}11`, color: project.color, border: "none" }}>{project.stats}</Tag>
                    </div>
                    <Button type="primary" href={project.route} style={{ marginTop: 12 }}>
                      {t('website.projects.viewDetails', 'Xem chi tiết dự án')}
                    </Button>
                  </Card>
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
