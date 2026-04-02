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
  Rate,
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
    const tags = (post.tags || []).map(s => String(s).toLowerCase());
    if (tags.includes('xem-ngay')) return '/xem-ngay';
    const lang = getLangCode();
    const langParam = lang && lang !== 'vi' ? `?hl=${lang}` : '';
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
  let businessSectors: Array<any> = [];
  if (typeof window !== 'undefined' && Array.isArray(window.__SSR_WEBSITE_CATEGORIES__)) {
    // Chuẩn hóa lấy các lĩnh vực con: group_slug === 'dich-vu' && is_group_slug === false
    const isSSRCategory = (cat: any): cat is { color: string; icon: string; description: string; category: string; slug: string; group_slug: string; is_group_slug: boolean } => {
      return cat && typeof cat === 'object' && 'color' in cat && 'icon' in cat && 'description' in cat && 'category' in cat && 'slug' in cat && 'group_slug' in cat && typeof cat.group_slug === 'string' && 'is_group_slug' in cat && typeof cat.is_group_slug === 'boolean';
    };
    businessSectors = window.__SSR_WEBSITE_CATEGORIES__
      .filter(cat => isSSRCategory(cat) && cat.group_slug !== '' && cat.is_group_slug === false)
      .map((cat: any) => ({
        key: cat.slug,
        slug: cat.slug,
        title: cat.category,
        description: cat.description,
        icon: iconMap[cat.icon] || <GlobalOutlined />,
        color: cat.color || '#1890ff',
        route: (() => {
          const lang = i18n.language && i18n.language !== 'cimode' ? i18n.language.slice(0,2) : 'vi';
          return lang !== 'vi' ? `/${cat.slug}?hl=${lang}` : `/${cat.slug}`;
        })(),
        stats: '',
      }));
  } else {
    // fallback: giữ nguyên logic cũ nếu không có SSR
    businessSectors = [
      {
        key: "bat-dong-san",
        slug: "bat-dong-san",
        title: t("website.services.categories.realEstate.title", "Bất Động Sản"),
        description: t("website.services.categories.realEstate.description", "Tin tức thị trường, dự án mới và tư vấn đầu tư bất động sản"),
        icon: <HomeOutlined />, 
        color: "#13c2c2",
        route: (() => {
          const lang = i18n.language && i18n.language !== 'cimode' ? i18n.language.slice(0,2) : 'vi';
          return lang !== 'vi' ? `/bat-dong-san?hl=${lang}` : "/bat-dong-san";
        })(),
        stats: t("website.business.realestate.stats", "500+ Dự án"),
      },
      // ... các sector khác như cũ ...
    ];
  }

  // Client testimonials with translations
  const testimonials = [
    {
      name: t('website.testimonials.client1.name', 'Nguyễn Văn A'),
      company: t('website.testimonials.client1.company', 'ABC Company'),
      content: t('website.testimonials.client1.content', 'Tool Traffic Google đã giúp website của chúng tôi tăng trưởng 300% lượt truy cập trong 3 tháng.'),
      rating: 5,
      avatar: "https://randomuser.me/api/portraits/men/1.jpg",
    },
    {
      name: t('website.testimonials.client2.name', 'Trần Thị B'),
      company: t('website.testimonials.client2.company', 'XYZ Corp'),
      content: t('website.testimonials.client2.content', 'Phần mềm cào dữ liệu rất hiệu quả, tiết kiệm 80% thời gian thu thập thông tin khách hàng.'),
      rating: 5,
      avatar: "https://randomuser.me/api/portraits/women/2.jpg",
    },
    {
      name: t('website.testimonials.client3.name', 'Lê Minh C'),
      company: t('website.testimonials.client3.company', 'Tech Startup'),
      content: t('website.testimonials.client3.content', 'Dịch vụ phát triển phần mềm chuyên nghiệp, đúng tiến độ và vượt mong đợi.'),
      rating: 5,
      avatar: "https://randomuser.me/api/portraits/men/3.jpg",
    },
  ];

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
            thumbnail: getThumbnail(p),
            serviceType: String(p.service_type || p.serviceType || 'phan-mem'),
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
      // Only show posts from 'phan-mem' category on homepage
      const filteredList = ssrList.filter((post) => post.serviceType === 'phan-mem');
      const featuredData = filteredList.filter((post) => !!post.featured);
      const specialData = filteredList.filter((post) => !!post.activeHome);
      setFeaturedSoftwarePosts(featuredData.length > 0 ? featuredData : filteredList.slice(0, 6));
      setSpecialSoftwarePosts(specialData.length > 0 ? specialData : filteredList.slice(6, 12));
      setLoading(false);
      // Using SSR data, filtered to 'phan-mem', skipping API call
      return;
    }
    
    // 2. Fallback to API if no SSR data
    // No SSR data, fetching from API...
    // Server-side filter: only active + category 'phan-mem'. We still filter featured/activeHome client-side.
    fetchServiceList('phan-mem', 20, undefined, { q: undefined })
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
              {t('website.products.title', 'Các công cụ và dịch vụ nổi bật')}
              </h2>
              <Paragraph style={{ 
                fontSize: "18px", 
                color: "var(--text-secondary)", 
                maxWidth: "600px", 
                margin: "0 auto" 
              }}
            >
                {t('website.products.subtitle', 'Cung cấp các công cụ phần mềm và dịch vụ phát triển chuyên nghiệp giúp doanh nghiệp tối ưu hóa hoạt động và tăng trưởng bền vững')}
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
                {t('website.services.title', 'Viết phần mềm theo yêu cầu')}
              </h2>
              <Paragraph style={{ 
                fontSize: "18px", 
                color: "var(--text-secondary)", 
                maxWidth: "600px", 
                margin: "0 auto" 
              }}>
                {t('website.services.subtitle', 'Cung cấp giải pháp công nghệ toàn diện từ thiết kế đến triển khai')}
              </Paragraph>
            </div>
            <Row gutter={[32, 32]}>
              {specialPagePosts.length === 0 ? (
                <Col span={24} style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 18 }}>
                  {t('website.services.noSpecial', 'Hiện chưa có dịch vụ phần mềm đặc biệt nào.')}
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


      {/* Business Sectors Section */}
      <div style={{
        padding: "80px 24px 60px 24px",
        background: "var(--bg-secondary)",
      }}>
        <Row justify="center">
          <Col xs={24} lg={20}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <h2 style={{
                color: "var(--text-primary)",
                marginBottom: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)"
              }}>
                {t('website.business.sectors.title', 'Cầu Nối Các Lĩnh Vực Kinh Doanh')}
              </h2>
              <Paragraph style={{
                fontSize: "18px",
                color: "var(--text-secondary)",
                maxWidth: "600px",
                margin: "0 auto"
              }}>
                {t('website.business.sectors.subtitle', 'Kết nối đa ngành, đa lĩnh vực, đa dịch vụ trên một nền tảng')}
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

      {/* Testimonials */}
      <div style={{ 
        padding: "100px 24px", 
        background: "var(--bg-secondary)",
        position: "relative"
      }}>
        <Row justify="center">
          <Col xs={24} lg={20}>
            <div style={{ textAlign: "center", marginBottom: "60px" }}>
              <h2 style={{ 
                color: "var(--text-primary)", 
                marginBottom: "1rem",
                fontSize: "clamp(2rem, 4vw, 3rem)"
              }}>
                {t('website.testimonials.title', 'Khách Hàng Nói Gì Về Chúng Tôi')}
              </h2>
              <Paragraph style={{ 
                fontSize: "18px", 
                color: "var(--text-secondary)" 
              }}>
                {t('website.testimonials.subtitle', 'Hàng nghìn khách hàng tin tưởng và hài lòng với dịch vụ')}
              </Paragraph>
            </div>
            
            <Row gutter={[32, 32]}>
              {testimonials.map((testimonial, index) => (
                <Col xs={24} lg={8} key={index}>
                  <Card
                    style={{
                      borderRadius: "20px",
                      border: "1px solid var(--card-border)",
                      height: "100%",
                      boxShadow: "var(--card-shadow)",
                      background: "var(--card-bg)",
                      transition: "all 0.3s ease"
                    }}
                    styles={{ body: { padding: "30px" } }}
                    hoverable
                  >
                    <div style={{ textAlign: "center", marginBottom: "20px" }}>
                      <Avatar src={testimonial.avatar} size={80} style={{ 
                        marginBottom: "15px",
                        border: "3px solid var(--brand-primary)"
                      }} />
                      <Title level={4} style={{ 
                        marginBottom: "5px", 
                        color: "var(--text-primary)",
                        fontSize: "1.1rem"
                      }}>
                        {testimonial.name}
                      </Title>
                      <Text style={{ color: "var(--text-secondary)" }}>
                        {testimonial.company}
                      </Text>
                    </div>
                    <div style={{ textAlign: "center", marginBottom: "15px" }}>
                      <Rate disabled defaultValue={testimonial.rating} style={{ 
                        fontSize: "16px",
                        color: "#faad14"
                      }} />
                    </div>
                    <Paragraph style={{ 
                      fontStyle: "italic", 
                      color: "var(--text-secondary)", 
                      fontSize: "16px",
                      lineHeight: "1.6",
                      textAlign: "center"
                    }}>
                      "{testimonial.content}"
                    </Paragraph>
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
