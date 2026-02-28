
/**
 * Script tạo dữ liệu mẫu cho hệ thống dịch vụ mới
 * Sử dụng cấu trúc 2 bảng: web_services + web_service_detail
 * 
 * Chạy script: node seed_services_data.js
 */

const CSM_TOKEN = '4d543bb4-714c-4bb1-952f-a2e0bf8b24a3';
const APP_ID = 'wuweb';
const DOMAIN = 'phanmemmottrieu.net';
const API_URL = 'https://api.phanmemmottrieu.net';
// const API_URL = 'http://localhost:15300/api'; // Dùng local server để test
// Luồng tạo bảng web_services
async function createWebServicesTable() {
  const payload = {
    app_id: APP_ID,
    obj_table: {
      id: "web_services",
      struct: {
        defaultValue: {
          id: "",
          service_code: "",
          slug: "",
          group_slug: "",
          is_service: false,
          is_group_slug: false,
          is_group_slug_default: false,
          category: "",
          category_en: "",
          category_zh: "",
          image: "",
          attributes_icon: "",
          attributes_color: "",
          attributes_priority: 0,
          attributes_title: "",
          attributes_title_en: "",
          attributes_title_zh: "",
          attributes_keywords: "",
          attributes_keywords_en: "",
          attributes_keywords_zh: "",
          attributes_description: "",
          attributes_description_en: "",
          attributes_description_zh: "",
          status: "active",
          domain: DOMAIN
        },
        fieldsPK: ["slug","domain","status"],
        fieldsSearch: ["id", "service_code", "slug", "category", "category_en", "category_zh", "group_slug","is_service","is_group_slug","is_group_slug_default","domain","status"],
        fields: {
          0: "id",
          1: "service_code",
          2: "slug",
          3: "group_slug",
          4: "is_service",
          5: "is_group_slug",
          6: "is_group_slug_default",
          7: "category",
          8: "category_en",
          9: "category_zh",
          10: "image",
          11: "attributes_icon",
          12: "attributes_color",
          13: "attributes_priority",
          14: "attributes_title",
          15: "attributes_title_en",
          16: "attributes_title_zh",
          17: "attributes_keywords",
          18: "attributes_keywords_en",
          19: "attributes_keywords_zh",
          20: "attributes_description",
          21: "attributes_description_en",
          22: "attributes_description_zh",
          23: "status",
          24: "domain"
        }
      }
    }
  };
  const response = await fetch(`${API_URL}/create-table`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "csm-token": CSM_TOKEN
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  console.log("Create web_services Table result:", result);
  return result;
}

// Luồng tạo bảng web_service_detail
async function createWebServiceDetailTable() {
  const payload = {
    app_id: APP_ID,
    obj_table: {
      id: "web_service_detail",
      struct: {
        defaultValue: {
          id: "",
          service_type: "",
          slug: "",
          title: "",
          title_en: "",
          title_zh: "",
          keywords: "",
          keywords_en: "",
          keywords_zh: "",
          excerpt: "",
          excerpt_en: "",
          excerpt_zh: "",
          content: "",
          content_en: "",
          content_zh: "",
          image: "",
          author: "",
          avatar: "",
          publishDate: "",
          readTime: "",
          views: 0,
          tags: [],
          thumbnail: "",
          images: "",
          activeHome: false,
          featured: false,
          priority: 0,
          serviceType: "",
          created_at: "",
          updated_at: ""
        },
        fieldsPK: ["slug","domain","status"],
        fieldsSearch: ["id", "service_type", "slug", "title", "title_en", "title_zh", "tags","author","status","domain","activeHome","featured","priority"],
        fields: {
          0: "id",
          1: "service_type",
          2: "slug",
          3: "title",
          4: "title_en",
          5: "title_zh",
          6:"keywords",
          7:"keywords_en",
          8:"keywords_zh",
          9: "excerpt",
          10: "excerpt_en",
          11: "excerpt_zh",
          12: "content",
          13: "content_en",
          14: "content_zh",
          15: "image",
          16: "author",
          17: "avatar",
          18: "publishDate",
          19: "readTime",
          20: "views",
          21: "tags",
          22: "thumbnail",
          23: "images",
          24: "featured",
          25: "activeHome",
          26: "priority",
          27: "created_at",
          28: "updated_at"
        }
      }
    }
  };
  const response = await fetch(`${API_URL}/create-table`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "csm-token": CSM_TOKEN
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  console.log("Create web_service_detail Table result:", result);
  return result;
}
// API Helper
async function csm_obj_updates(payload) {
  const response = await fetch(`${API_URL}/update-table-data`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'csm-token': CSM_TOKEN 
    },
    body: JSON.stringify(payload)
  });
  
  return response.json();
}

createWebServiceDetailTable();
createWebServicesTable();

// Helper: Generate slug
function generateSlug(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

// Dữ liệu danh mục dịch vụ (web_services)
const serviceCategories = [
  {
    id: "phan-mem",
    service_code: "phan-mem",
    is_service: true,
    slug: "phan-mem",
    group_slug: "dich-vu",
    is_group_slug: false,
    is_group_slug_default: true,
    image: `https://www.${DOMAIN}/app_images/services/phan-mem-og.jpg`,
    category: "Phần Mềm",
    category_en: "Software",
    category_zh: "软件",
    attributes_icon: "CodeOutlined",
    attributes_color: "#1890ff",
    attributes_priority: 1,
    attributes_title: "Phần Mềm - Giải Pháp Công Nghệ",
    attributes_keywords: "phần mềm, giải pháp công nghệ, ứng dụng quản lý, tự động hóa doanh nghiệp",
    attributes_keywords_en: "software, technology solutions, management apps, business automation",
    attributes_keywords_zh: "软件, 技术解决方案, 管理应用程序, 企业自动化",
    attributes_description: "Giải pháp phần mềm, ứng dụng quản lý, tự động hóa doanh nghiệp.",
    attributes_title_en: "Software & Technology Solutions",
    attributes_description_en: "Software solutions, management apps, business automation.",
    attributes_title_zh: "软件与技术解决方案",
    attributes_description_zh: "软件解决方案、管理应用程序、企业自动化。"
  },
  {
    id: "bat-dong-san",
    service_code: "bat-dong-san",
    is_service: true,
    slug: "bat-dong-san",
    group_slug: "dich-vu",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Bất Động Sản",
    category_en: "Real Estate",
    category_zh: "房地产",
    image: `https://www.${DOMAIN}/app_images/services/bat-dong-san-og.jpg`,
    attributes_icon: "HomeOutlined",
    attributes_color: "#13c2c2",
    attributes_priority: 2,
    attributes_title: "Bất Động Sản - Mua Bán & Cho Thuê",
    attributes_keywords: "tin tức bất động sản, dự án, căn hộ, nhà đất.",
    attributes_keywords_en: "real estate news, projects, apartments, land.",
    attributes_keywords_zh: "房地产新闻、项目、公寓、土地。",
    attributes_description: "Tin tức bất động sản, dự án, căn hộ, nhà đất.",
    attributes_title_en: "Real Estate - Buy, Sell & Rent",
    attributes_description_en: "Real estate news, projects, apartments, land.",
    attributes_title_zh: "房地产 - 买卖与出租",
    attributes_description_zh: "房地产新闻、项目、公寓、土地。"
  },
  {
    id: "lam-dep-my-pham",
    service_code: "lam-dep-my-pham",
    is_service: true,
    slug: "lam-dep-my-pham",
    group_slug: "dich-vu",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Mỹ Phẩm & Làm Đẹp",
    category_en: "Beauty & Cosmetics",
    category_zh: "美容化妆品",
    image: `https://www.${DOMAIN}/app_images/services/lam-dep-my-pham-og.jpg`,
    attributes_icon: "SkinOutlined",
    attributes_color: "#eb2f96",
    attributes_priority: 3,
    attributes_title: "Mỹ Phẩm & Làm Đẹp - Spa & Thẩm Mỹ",
    attributes_keywords: "xu hướng làm đẹp, review mỹ phẩm, dịch vụ spa.",
    attributes_keywords_en: "beauty trends, cosmetics reviews, spa services.",
    attributes_keywords_zh: "美容趋势、化妆品评论、水疗服务。",
    attributes_description: "Xu hướng làm đẹp, review mỹ phẩm, dịch vụ spa.",
    attributes_title_en: "Beauty & Cosmetics - Spa & Aesthetics",
    attributes_description_en: "Beauty trends, cosmetics reviews, spa services.",
    attributes_title_zh: "美容化妆品 - 水疗与美容",
    attributes_description_zh: "美容趋势、化妆品评论、水疗服务。",
  },
  {
    id: "cho-thue-xe",
    service_code: "cho-thue-xe",
    is_service: true,
    slug: "cho-thue-xe",
    group_slug: "dich-vu",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Cho Thuê Xe 4-7 Chỗ",
    category_en: "Car Rental 4-7 Seats",
    category_zh: "租车 4-7座",
    image: `https://www.${DOMAIN}/app_images/services/cho-thue-xe-og.jpg`,
    attributes_icon: "CarOutlined",
    attributes_color: "#1890ff",
    attributes_priority: 4,
    attributes_title: "Cho Thuê Xe 4-7 Chỗ - Xe Du Lịch",
    attributes_keywords: "thuê xe tự lái/có lái. Xe du lịch, cưới hỏi, doanh nghiệp.",
    attributes_keywords_en: "self-drive or with driver. Travel, wedding, corporate vehicles.",
    attributes_keywords_zh: "自驾或带司机。旅游、婚礼、企业车辆。",
    attributes_description: "Thuê xe tự lái/có lái. Xe du lịch, cưới hỏi, doanh nghiệp.",
    attributes_title_en: "Car Rental 4-7 Seats - Travel Cars",
    attributes_description_en: "Self-drive or with driver. Travel, wedding, corporate vehicles.",
    attributes_title_zh: "租车 4-7座 - 旅游车",
    attributes_description_zh: "自驾或带司机。旅游、婚礼、企业车辆。"
  },
  {
    id: "booking-online",
    service_code: "booking-online",
    is_service: true,
    slug: "booking-online",
    group_slug: "dich-vu",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Đặt Lịch Online",
    category_en: "Online Booking",
    category_zh: "在线预订",
    image: `https://www.${DOMAIN}/app_images/services/booking-online-og.jpg`,
    attributes_icon: "CalendarOutlined",
    attributes_color: "#faad14",
    attributes_priority: 5,
    attributes_title: "Đặt Lịch Online - Booking Dịch Vụ",
    attributes_keywords: "đặt lịch, khám bác sĩ, spa, salon, nhà hàng.",
    attributes_keywords_en: "booking, doctor appointments, spa, salon, restaurants.",
    attributes_keywords_zh: "预约，医生预约，水疗，沙龙，餐厅。",
    attributes_description: "Đặt lịch: khám bác sĩ, spa, salon, nhà hàng.",
    attributes_title_en: "Online Booking - Service Reservation",
    attributes_description_en: "Book: doctor appointments, spa, salon, restaurants.",
    attributes_title_zh: "在线预订 - 服务预约",
    attributes_description_zh: "预订：医生预约、水疗、沙龙、餐厅。"
  },
  {
    id: "dich-vu",
    service_code: "dich-vu",
    is_service: true,
    slug: "dich-vu",
    group_slug: "",
    is_group_slug: true,
    is_group_slug_default: false,
    category: "Dịch Vụ",
    category_en: "Services",
    category_zh: "服务",
    image: `https://www.${DOMAIN}/app_images/services/dich-vu-og.jpg`,
    attributes_icon: "AppstoreOutlined",
    attributes_color: "#722ed1",
    attributes_priority: 0,
    attributes_title: "Dịch Vụ - Tổng Hợp Dịch Vụ",
    attributes_title_en: "Services - General Services",
    attributes_title_zh: "服务 - 综合服务",
    attributes_keywords: "dịch vụ chuyên nghiệp, dịch vụ uy tín, dịch vụ đa lĩnh vực.",
    attributes_keywords_en: "professional services, reputable services, multi-field services.",
    attributes_keywords_zh: "专业服务、信誉良好的服务、多领域服务。",
    attributes_description: "Tổng hợp các dịch vụ chuyên nghiệp, uy tín trong nhiều lĩnh vực khác nhau.",
    attributes_description_en: "A collection of professional and reputable services in various fields.",
    attributes_description_zh: "各个领域的专业和信誉良好的服务集合。"
  },
  {
    id: "home",
    service_code: "home",
    is_service: false,
    slug: "home",
    group_slug: "",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Trang Chủ",
    category_en: "Home",
    category_zh: "首页",
    image: `https://www.${DOMAIN}/app_images/services/home-og.jpg`,
    attributes_icon: "HomeFilled",
    attributes_color: "#52c41a",
    attributes_priority: 0,
    attributes_title: "Trang Chủ - Dịch Vụ Nổi Bật",
    attributes_title_en: "Home - Featured Services",
    attributes_title_zh: "首页 - 特色服务",
    attributes_keywords: "dịch vụ nổi bật, dịch vụ phổ biến, dịch vụ hàng đầu.",
    attributes_keywords_en: "featured services, popular services, top-tier services.",
    attributes_keywords_zh: "特色服务、热门服务、顶级服务。",
    attributes_description: "Khám phá các dịch vụ nổi bật và phổ biến nhất hiện nay.",
    attributes_description_en: "Discover the most popular and featured services right now.",
    attributes_description_zh: "立即发现最受欢迎和特色服务。"
  },
  {
    id:"ve-chung-toi",
    service_code: "ve-chung-toi",
    is_service: false,
    slug: "ve-chung-toi",
    group_slug: "",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Về Chung Tôi",
    category_en: "About Me",
    category_zh: "关于我",
    image: `https://www.${DOMAIN}/app_images/services/ve-chung-toi-og.jpg`,
    attributes_icon: "InfoCircleOutlined",
    attributes_color: "#faad14",
    attributes_priority: 0,
    attributes_title: "Về Chung Tôi - Giới Thiệu Dịch Vụ",
    attributes_title_en: "About Me - Service Introduction",
    attributes_title_zh: "关于我 - 服务介绍",
    attributes_keywords: "giới thiệu dịch vụ, về chúng tôi, thông tin dịch vụ.",
    attributes_keywords_en: "service introduction, about us, service information.",
    attributes_keywords_zh: "服务介绍、关于我们、服务信息。",
    attributes_description: "Tìm hiểu về chúng tôi và các dịch vụ mà chúng tôi cung cấp.",
    attributes_description_en: "Learn about us and the services we offer.",
    attributes_description_zh: "了解我们和我们提供的服务。"
  },
  {
    id:"lien-he",
    service_code: "lien-he",
    is_service: false,
    slug: "lien-he",
    group_slug: "",
    is_group_slug: false,
    is_group_slug_default: false,
    category: "Liên Hệ",
    category_en: "Contact",
    category_zh: "联系我们",
    image: `https://www.${DOMAIN}/app_images/services/lien-he-og.jpg`,
    attributes_icon: "PhoneOutlined",
    attributes_color: "#1890ff",
    attributes_priority: 0,
    attributes_title: "Liên Hệ - Kết Nối Với Chúng Tôi",
    attributes_title_en: "Contact - Connect With Us",
    attributes_title_zh: "联系我们 - 与我们联系",
    attributes_keywords: "liên hệ dịch vụ, kết nối với chúng tôi, hỗ trợ khách hàng.",
    attributes_keywords_en: "service contact, connect with us, customer support.",
    attributes_keywords_zh: "服务联系、与我们联系、客户支持。",
    attributes_description: "Kết nối với chúng tôi để biết thêm thông tin về dịch vụ và hỗ trợ khách hàng.",
    attributes_description_en: "Connect with us to learn more about our services and customer support.",
    attributes_description_zh: "与我们联系，了解更多关于我们的服务和客户支持的信息。"
  },

];

// Dữ liệu chi tiết (web_service_detail) - 2 bài/category
const serviceDetails = [{
    id: "web_250903014311_4c7e4210b93e",
    slug: generateSlug('Công cụ cào dữ liệu có thể click'),
    title: 'Công cụ cào dữ liệu có thể click',
    title_en: 'Clickable Data Scraping Tools',
    title_zh: '可点击的数据爬虫工具',
    keywords: 'công cụ cào dữ liệu, web scraper, bot lấy dữ liệu tự động, thu thập thông tin',
    keywords_en: 'data scraping tools, web scraper, automated data extraction bots, information gathering',
    keywords_zh: '数据爬取工具、网络爬虫、自动化数据提取机器人、信息收集',
    excerpt: 'Cần một giải pháp cào dữ liệu mạnh mẽ? Chúng tôi cung cấp dịch vụ viết phần mềm phát triển công cụ cào dữ liệu có thể click, Web Scraper, Bot lấy dữ liệu tự động giúp bạn thu thập thông tin hiệu quả.',
    expect_en: 'Need a powerful data scraping solution? We offer custom software development services to create clickable data scraping tools, web scrapers, and automated data extraction bots to help you gather information efficiently.',
    expect_zh: '需要强大的数据爬取解决方案？我们提供定制软件开发服务，创建可点击的数据爬取工具、网络爬虫和自动化数据提取机器人，帮助您高效收集信息。',
    content: decodeURIComponent("%3Ch2%3EGi%E1%BA%A3i%20Ph%C3%A1p%20T%E1%BB%B1%20%C4%90%E1%BB%99ng%20H%C3%B3a%20Thu%20Th%E1%BA%ADp%20D%E1%BB%AF%20Li%E1%BB%87u%20To%C3%A0n%20Di%E1%BB%87n%3C%2Fh2%3E%0A%0A%3Cp%3ETrong%20k%E1%BB%B7%20nguy%C3%AAn%20s%E1%BB%91%2C%20d%E1%BB%AF%20li%E1%BB%87u%20l%C3%A0%20v%C3%A0ng.%20Tuy%20nhi%C3%AAn%2C%20vi%E1%BB%87c%20thu%20th%E1%BA%ADp%20v%C3%A0%20x%E1%BB%AD%20l%C3%BD%20d%E1%BB%AF%20li%E1%BB%87u%20th%E1%BB%A7%20c%C3%B4ng%20t%E1%BB%91n%20th%E1%BB%9Di%20gian%20v%C3%A0%20c%C3%B4ng%20s%E1%BB%A9c.%20Ch%C3%BAng%20t%C3%B4i%20cung%20c%E1%BA%A5p%20d%E1%BB%8Bch%20v%E1%BB%A5%20vi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20chuy%C3%AAn%20nghi%E1%BB%87p%2C%20t%E1%BA%ADp%20trung%20v%C3%A0o%20vi%E1%BB%87c%20ph%C3%A1t%20tri%E1%BB%83n%20c%C3%A1c%20gi%E1%BA%A3i%20ph%C3%A1p%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a%20thu%20th%E1%BA%ADp%20d%E1%BB%AF%20li%E1%BB%87u%2C%20%C4%91%E1%BA%B7c%20bi%E1%BB%87t%20l%C3%A0%20c%C3%A1c%20%3Cstrong%3Ec%C3%B4ng%20c%E1%BB%A5%20c%C3%A0o%20d%E1%BB%AF%20li%E1%BB%87u%20c%C3%B3%20th%E1%BB%83%20click%3C%2Fstrong%3E%2C%20gi%C3%BAp%20doanh%20nghi%E1%BB%87p%20t%E1%BB%91i%20%C6%B0u%20h%C3%B3a%20quy%20tr%C3%ACnh%20v%C3%A0%20%C4%91%C6%B0a%20ra%20quy%E1%BA%BFt%20%C4%91%E1%BB%8Bnh%20d%E1%BB%B1a%20tr%C3%AAn%20d%E1%BB%AF%20li%E1%BB%87u%20ch%C3%ADnh%20x%C3%A1c.%3C%2Fp%3E%0A%0A%3Ch2%3ED%E1%BB%8Bch%20V%E1%BB%A5%20Ph%C3%A1t%20Tri%E1%BB%83n%20Ph%E1%BA%A7n%20M%E1%BB%81m%20C%C3%A0o%20D%E1%BB%AF%20Li%E1%BB%87u%20%C4%90a%20D%E1%BA%A1ng%3C%2Fh2%3E%0A%0A%3Cp%3ECh%C3%BAng%20t%C3%B4i%20chuy%C3%AAn%20thi%E1%BA%BFt%20k%E1%BA%BF%20v%C3%A0%20ph%C3%A1t%20tri%E1%BB%83n%20c%C3%A1c%20lo%E1%BA%A1i%20ph%E1%BA%A7n%20m%E1%BB%81m%20sau%3A%3C%2Fp%3E%0A%0A%3Cul%3E%0A%09%3Cli%3E%3Cstrong%3ETool%20crawl%20d%E1%BB%AF%20li%E1%BB%87u%20t%E1%BB%AB%20c%C3%A1c%20website%3A%3C%2Fstrong%3E%20Thu%20th%E1%BA%ADp%20d%E1%BB%AF%20li%E1%BB%87u%20t%E1%BB%AB%20b%E1%BA%A5t%20k%E1%BB%B3%20trang%20web%20n%C3%A0o%20theo%20y%C3%AAu%20c%E1%BA%A7u%2C%20t%E1%BB%AB%20th%C3%B4ng%20tin%20s%E1%BA%A3n%20ph%E1%BA%A9m%2C%20gi%C3%A1%20c%E1%BA%A3%20%C4%91%E1%BA%BFn%20n%E1%BB%99i%20dung%20b%C3%A0i%20vi%E1%BA%BFt.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EWeb%20Scraper%3A%3C%2Fstrong%3E%20X%C3%A2y%20d%E1%BB%B1ng%20c%C3%A1c%20%E1%BB%A9ng%20d%E1%BB%A5ng%20c%C3%A0o%20d%E1%BB%AF%20li%E1%BB%87u%20chuy%C3%AAn%20bi%E1%BB%87t%2C%20c%C3%B3%20kh%E1%BA%A3%20n%C4%83ng%20x%E1%BB%AD%20l%C3%BD%20c%C3%A1c%20trang%20web%20ph%E1%BB%A9c%20t%E1%BA%A1p%20v%E1%BB%9Bi%20c%E1%BA%A5u%20tr%C3%BAc%20kh%C3%A1c%20nhau.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3ET%E1%BB%B1%20%C4%91%E1%BB%99ng%20click%20%C4%91%E1%BB%83%20thu%20th%E1%BA%ADp%20d%E1%BB%AF%20li%E1%BB%87u%3A%3C%2Fstrong%3E%20Ph%C3%A1t%20tri%E1%BB%83n%20c%C3%A1c%20bot%20c%C3%B3%20kh%E1%BA%A3%20n%C4%83ng%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%20t%C6%B0%C6%A1ng%20t%C3%A1c%20v%E1%BB%9Bi%20trang%20web%2C%20click%20v%C3%A0o%20c%C3%A1c%20li%C3%AAn%20k%E1%BA%BFt%2C%20%C4%91i%E1%BB%81n%20form%20v%C3%A0%20thu%20th%E1%BA%ADp%20d%E1%BB%AF%20li%E1%BB%87u.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EPh%E1%BA%A7n%20m%E1%BB%81m%20l%E1%BA%A5y%20d%E1%BB%AF%20li%E1%BB%87u%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%3A%3C%2Fstrong%3E%20T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a%20ho%C3%A0n%20to%C3%A0n%20quy%20tr%C3%ACnh%20thu%20th%E1%BA%ADp%20d%E1%BB%AF%20li%E1%BB%87u%2C%20t%E1%BB%AB%20vi%E1%BB%87c%20t%C3%ACm%20ki%E1%BA%BFm%2C%20truy%20c%E1%BA%ADp%20trang%20web%20%C4%91%E1%BA%BFn%20l%C6%B0u%20tr%E1%BB%AF%20d%E1%BB%AF%20li%E1%BB%87u.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EBot%20l%E1%BA%A5y%20d%E1%BB%AF%20li%E1%BB%87u%3A%3C%2Fstrong%3E%20X%C3%A2y%20d%E1%BB%B1ng%20c%C3%A1c%20bot%20th%C3%B4ng%20minh%2C%20c%C3%B3%20kh%E1%BA%A3%20n%C4%83ng%20th%C3%ADch%20%E1%BB%A9ng%20v%E1%BB%9Bi%20c%C3%A1c%20thay%20%C4%91%E1%BB%95i%20tr%C3%AAn%20trang%20web%20v%C3%A0%20duy%20tr%C3%AC%20ho%E1%BA%A1t%20%C4%91%E1%BB%99ng%20%E1%BB%95n%20%C4%91%E1%BB%8Bnh.%3C%2Fli%3E%0A%3C%2Ful%3E%0A%0A%3Ch2%3E%E1%BB%A8ng%20D%E1%BB%A5ng%20Th%E1%BB%B1c%20T%E1%BA%BF%20C%E1%BB%A7a%20C%C3%A1c%20C%C3%B4ng%20C%E1%BB%A5%20C%C3%A0o%20D%E1%BB%AF%20Li%E1%BB%87u%3C%2Fh2%3E%0A%0A%3Cdiv%20style%3D%22text-align%3Acenter%22%3E%0A%3Cfigure%20class%3D%22image%22%20style%3D%22display%3Ainline-block%22%3E%3Cimg%20alt%3D%22C%C3%B4ng%20c%E1%BB%A5%20c%C3%A0o%20d%E1%BB%AF%20li%E1%BB%87u%20c%C3%B3%20th%E1%BB%83%20click%22%20height%3D%22484%22%20src%3D%22app_images%2Fcsm%2Fcongcucaodulieucotheclick.png%22%20width%3D%22909%22%20%2F%3E%0A%3Cfigcaption%3EC%C3%B4ng%20c%E1%BB%A5%20c%C3%A0o%20d%E1%BB%AF%20li%E1%BB%87u%20c%C3%B3%20th%E1%BB%83%20click%3C%2Ffigcaption%3E%0A%3C%2Ffigure%3E%0A%3C%2Fdiv%3E%0A%0A%3Cp%3ECh%C3%BAng%20t%C3%B4i%20%C4%91%C3%A3%20tri%E1%BB%83n%20khai%20th%C3%A0nh%20c%C3%B4ng%20nhi%E1%BB%81u%20d%E1%BB%B1%20%C3%A1n%2C%20bao%20g%E1%BB%93m%3A%3C%2Fp%3E%0A%0A%3Cul%3E%0A%09%3Cli%3E%3Cstrong%3ET%E1%BB%B1%20%C4%91%E1%BB%99ng%20%C4%91%C4%83ng%20k%C3%BD%20visa%20th%E1%BB%8B%20th%E1%BB%B1c%3A%3C%2Fstrong%3E%20Ph%E1%BA%A7n%20m%E1%BB%81m%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%20%C4%91i%E1%BB%81n%20th%C3%B4ng%20tin%20v%C3%A0%20n%E1%BB%99p%20%C4%91%C6%A1n%20%C4%91%C4%83ng%20k%C3%BD%20visa%2C%20ti%E1%BA%BFt%20ki%E1%BB%87m%20th%E1%BB%9Di%20gian%20v%C3%A0%20c%C3%B4ng%20s%E1%BB%A9c.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3E%C4%90%E1%BA%A5u%20gi%C3%A1%20tr%E1%BB%B1c%20tuy%E1%BA%BFn%20(Lazada%2C%20Shopee%2C%20Sendo)%3A%3C%2Fstrong%3E%20Bot%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%20tham%20gia%20%C4%91%E1%BA%A5u%20gi%C3%A1%2C%20t%C4%83ng%20c%C6%A1%20h%E1%BB%99i%20tr%C3%BAng%20th%E1%BA%A7u.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EClick%20qu%E1%BA%A3ng%20c%C3%A1o%20Google%3A%3C%2Fstrong%3E%20T%E1%BB%B1%20%C4%91%E1%BB%99ng%20click%20v%C3%A0o%20qu%E1%BA%A3ng%20c%C3%A1o%20Google%2C%20t%C4%83ng%20traffic%20v%C3%A0%20c%E1%BA%A3i%20thi%E1%BB%87n%20th%E1%BB%A9%20h%E1%BA%A1ng%20t%E1%BB%AB%20kh%C3%B3a.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EZalo%20Web%20Chat%20nh%C3%B3m%20th%C3%B4ng%20b%C3%A1o%20tin%20qu%C3%A9t%3A%3C%2Fstrong%3E%20T%E1%BB%B1%20%C4%91%E1%BB%99ng%20qu%C3%A9t%20th%C3%B4ng%20tin%20b%E1%BA%A5t%20%C4%91%E1%BB%99ng%20s%E1%BA%A3n%20v%C3%A0%20tuy%E1%BB%83n%20d%E1%BB%A5ng%2C%20g%E1%BB%ADi%20th%C3%B4ng%20b%C3%A1o%20%C4%91%E1%BA%BFn%20nh%C3%B3m%20Zalo.%3C%2Fli%3E%0A%3C%2Ful%3E%0A%0A%3Ch2%3EC%C3%B4ng%20Ngh%E1%BB%87%20Ti%C3%AAn%20Ti%E1%BA%BFn%3C%2Fh2%3E%0A%0A%3Cp%3ECh%C3%BAng%20t%C3%B4i%20s%E1%BB%AD%20d%E1%BB%A5ng%20c%C3%A1c%20c%C3%B4ng%20ngh%E1%BB%87%20ti%C3%AAn%20ti%E1%BA%BFn%20%C4%91%E1%BB%83%20%C4%91%E1%BA%A3m%20b%E1%BA%A3o%20hi%E1%BB%87u%20su%E1%BA%A5t%20v%C3%A0%20%C4%91%E1%BB%99%20tin%20c%E1%BA%ADy%20c%E1%BB%A7a%20ph%E1%BA%A7n%20m%E1%BB%81m%3A%3C%2Fp%3E%0A%0A%3Cul%3E%0A%09%3Cli%3E%3Cstrong%3ET%E1%BB%B1%20%C4%91%E1%BB%95i%20IP%3A%3C%2Fstrong%3E%20Ph%E1%BA%A7n%20m%E1%BB%81m%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%20thay%20%C4%91%E1%BB%95i%20%C4%91%E1%BB%8Ba%20ch%E1%BB%89%20IP%20%C4%91%E1%BB%83%20tr%C3%A1nh%20b%E1%BB%8B%20ch%E1%BA%B7n.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EGi%E1%BA%A3i%20m%C3%A3%20Captcha%3A%3C%2Fstrong%3E%20H%E1%BB%97%20tr%E1%BB%A3%20gi%E1%BA%A3i%20m%C3%A3%20c%C3%A1c%20lo%E1%BA%A1i%20Captcha%20t%E1%BB%AB%20%C4%91%C6%A1n%20gi%E1%BA%A3n%20%C4%91%E1%BA%BFn%20ph%E1%BB%A9c%20t%E1%BA%A1p%2C%20s%E1%BB%AD%20d%E1%BB%A5ng%20c%E1%BA%A3%20d%E1%BB%8Bch%20v%E1%BB%A5%20tr%E1%BA%A3%20ph%C3%AD%20online.%3C%2Fli%3E%0A%3C%2Ful%3E%0A%0A%3Ch2%3ET%E1%BA%A1i%20Sao%20Ch%E1%BB%8Dn%20Ch%C3%BAng%20T%C3%B4i%3F%3C%2Fh2%3E%0A%0A%3Cp%3ECh%C3%BAng%20t%C3%B4i%20cam%20k%E1%BA%BFt%3A%3C%2Fp%3E%0A%0A%3Cul%3E%0A%09%3Cli%3E%3Cstrong%3ECh%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng%3A%3C%2Fstrong%3E%20Ph%E1%BA%A7n%20m%E1%BB%81m%20%C4%91%C6%B0%E1%BB%A3c%20ph%C3%A1t%20tri%E1%BB%83n%20b%E1%BB%9Fi%20%C4%91%E1%BB%99i%20ng%C5%A9%20k%E1%BB%B9%20s%C6%B0%20gi%C3%A0u%20kinh%20nghi%E1%BB%87m%2C%20%C4%91%E1%BA%A3m%20b%E1%BA%A3o%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng%20v%C3%A0%20%C4%91%E1%BB%99%20%E1%BB%95n%20%C4%91%E1%BB%8Bnh.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3ET%C3%B9y%20bi%E1%BA%BFn%3A%3C%2Fstrong%3E%20Ch%C3%BAng%20t%C3%B4i%20cung%20c%E1%BA%A5p%20c%C3%A1c%20gi%E1%BA%A3i%20ph%C3%A1p%20t%C3%B9y%20bi%E1%BA%BFn%20theo%20y%C3%AAu%20c%E1%BA%A7u%20c%E1%BB%A5%20th%E1%BB%83%20c%E1%BB%A7a%20kh%C3%A1ch%20h%C3%A0ng.%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3EH%E1%BB%97%20tr%E1%BB%A3%3A%3C%2Fstrong%3E%20Ch%C3%BAng%20t%C3%B4i%20cung%20c%E1%BA%A5p%20d%E1%BB%8Bch%20v%E1%BB%A5%20h%E1%BB%97%20tr%E1%BB%A3%20k%E1%BB%B9%20thu%E1%BA%ADt%20t%E1%BA%ADn%20t%C3%ACnh%2C%20gi%C3%BAp%20kh%C3%A1ch%20h%C3%A0ng%20gi%E1%BA%A3i%20quy%E1%BA%BFt%20m%E1%BB%8Di%20v%E1%BA%A5n%20%C4%91%E1%BB%81.%3C%2Fli%3E%0A%3C%2Ful%3E%0A%0A%3Ch2%3ELi%C3%AAn%20H%E1%BB%87%20Ngay%20%C4%90%E1%BB%83%20%C4%90%C6%B0%E1%BB%A3c%20T%C6%B0%20V%E1%BA%A5n%20Mi%E1%BB%85n%20Ph%C3%AD%3C%2Fh2%3E%0A%0A%3Cp%3EH%C3%A3y%20li%C3%AAn%20h%E1%BB%87%20v%E1%BB%9Bi%20ch%C3%BAng%20t%C3%B4i%20ngay%20h%C3%B4m%20nay%20%C4%91%E1%BB%83%20%C4%91%C6%B0%E1%BB%A3c%20t%C6%B0%20v%E1%BA%A5n%20mi%E1%BB%85n%20ph%C3%AD%20v%C3%A0%20nh%E1%BA%ADn%20b%C3%A1o%20gi%C3%A1%20chi%20ti%E1%BA%BFt%20v%E1%BB%81%20d%E1%BB%8Bch%20v%E1%BB%A5%20ph%C3%A1t%20tri%E1%BB%83n%20%3Cstrong%3Ec%C3%B4ng%20c%E1%BB%A5%20c%C3%A0o%20d%E1%BB%AF%20li%E1%BB%87u%20c%C3%B3%20th%E1%BB%83%20click%3C%2Fstrong%3E%20v%C3%A0%20c%C3%A1c%20gi%E1%BA%A3i%20ph%C3%A1p%20t%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a%20thu%20th%E1%BA%ADp%20d%E1%BB%AF%20li%E1%BB%87u%20kh%C3%A1c.%3C%2Fp%3E%0A"),
    content_en: decodeURIComponent(""),
    content_zh: decodeURIComponent(""),
    serviceType: "phan-mem",
    author: "Mr.Anh",
    publishDate: "2025-09-03",
    readTime: "10 phút",
    views: 6390,
    tags: ["phan-mem", "web-scraper", "crawl-data", "automation"],
    activeHome: true,
    featured: true,
    thumbnail: "https://www.phanmemmottrieu.net/app_images/web/congcucaodulieucotheclick.png",
    images: JSON.stringify(["https://www.phanmemmottrieu.net/app_images/web/congcucaodulieucotheclick.png"]),
    priority: 1,
    attributes_contact: "0964.014.947",
  },
  {
    id: "web_250903041512_124d12f01dde",
    slug: generateSlug("Viết phần mềm theo yêu cầu"),
    title: "Viết phần mềm theo yêu cầu",
    title_en: "Custom Software Development Services",
    title_zh: "定制软件开发服务",
    keywords: "viết phần mềm theo yêu cầu, dịch vụ viết phần mềm, viết app theo yêu cầu, phần mềm quản lý kho, phần mềm nhân sự, phần mềm bán hàng",
    keywords_en: "custom software development, software development services, custom app development, inventory management software, HR software, sales software",
    keywords_zh: "定制软件开发, 软件开发服务, 定制应用开发, 库存管理软件, 人力资源软件, 销售软件",
    excerpt: 'Dịch vụ viết phần mềm theo yêu cầu chuyên nghiệp, giá rẻ, uy tín. Nhận viết app, code phần mềm quản lý kho, nhân sự, bán hàng. Liên hệ ngay 0964.014.947.',
    excerpt_en: 'Professional, affordable, and reputable custom software development services. We offer app development and software coding for inventory management, HR, and sales. Contact us now at 0964.014.947.',
    excerpt_zh: '专业、实惠且信誉良好的定制软件开发服务。我们提供库存管理、人力资源和销售的软件开发和编码服务。立即联系我们，电话0964.014.947。',
    content: decodeURIComponent("%3Ch2%3EGi%E1%BA%A3i%20Ph%C3%A1p%20Ph%E1%BA%A7n%20M%E1%BB%81m%20T%E1%BB%91i%20%C6%AFu%20Cho%20Doanh%20Nghi%E1%BB%87p%20C%E1%BB%A7a%20B%E1%BA%A1n%3C%2Fh2%3E%0A%0A%3Cp%3EKhi%20c%C3%A1c%20ph%E1%BA%A7n%20m%E1%BB%81m%20hi%E1%BB%87n%20s%E1%BA%B5n%20c%C3%B3%20tr%C3%AAn%20th%E1%BB%8B%20tr%C6%B0%E1%BB%9Dng%20kh%C3%B4ng%20th%E1%BB%83%20%C4%91%C3%A1p%20%E1%BB%A9ng%20%C4%91%C6%B0%E1%BB%A3c%20c%C3%A1c%20y%C3%AAu%20c%E1%BA%A7u%20c%C3%B4ng%20vi%E1%BB%87c%20%C4%91%E1%BA%B7c%20th%C3%B9%20c%E1%BB%A7a%20m%C3%ACnh%2C%20qu%C3%BD%20v%E1%BB%8B%20c%C3%B3%20th%E1%BB%83%20ngh%C4%A9%20ngay%20%C4%91%E1%BA%BFn%20vi%E1%BB%87c%20%C4%91%E1%BA%B7t%20%3Cstrong%3Evi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fstrong%3E%20ri%C3%AAng.%20V%E1%BB%9Bi%20Mr.Anh%2C%20vi%E1%BB%87c%20thi%E1%BA%BFt%20k%E1%BA%BF%20v%C3%A0%20x%C3%A2y%20d%E1%BB%B1ng%20m%E1%BB%99t%20ph%E1%BA%A7n%20m%E1%BB%81m%20ho%C3%A0n%20to%C3%A0n%20theo%20y%C3%AAu%20c%E1%BA%A7u%20%C4%91%E1%BA%B7c%20th%C3%B9%20c%C3%B4ng%20vi%E1%BB%87c%20c%E1%BB%A7a%20b%E1%BA%A1n%20kh%C3%B4ng%20c%C3%B2n%20qu%C3%A1%20kh%C3%B3%20kh%C4%83n%20hay%20t%E1%BB%91n%20k%C3%A9m%20n%E1%BB%AFa.%20V%E1%BB%9Bi%20d%E1%BB%8Bch%20v%E1%BB%A5%20v%C3%A0%20quy%20tr%C3%ACnh%20%3Cem%3Evi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fem%3E%20chuy%C3%AAn%20nghi%E1%BB%87p%20c%E1%BB%A7a%20Mr.Anh%2C%20m%E1%BB%8Di%20y%C3%AAu%20c%E1%BA%A7u%20ri%C3%AAng%20%C4%91%E1%BA%B7c%20bi%E1%BB%87t%20c%E1%BB%A7a%20qu%C3%BD%20v%E1%BB%8B%20%C4%91%E1%BB%81u%20%C4%91%C6%B0%E1%BB%A3c%20%C4%91%C3%A1p%20%E1%BB%A9ng%20h%C6%A1n%20c%E1%BA%A3%20mong%20%C4%91%E1%BB%A3i.%3C%2Fp%3E%0A%0A%3Ch2%3ED%E1%BB%8Bch%20V%E1%BB%A5%20Vi%E1%BA%BFt%20Ph%E1%BA%A7n%20M%E1%BB%81m%20Theo%20Y%C3%AAu%20C%E1%BA%A7u%20%C4%90a%20D%E1%BA%A1ng%3C%2Fh2%3E%0A%0A%3Cp%3ECh%C3%BAng%20t%C3%B4i%20%3Cu%3Enh%E1%BA%ADn%20vi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fu%3E%20(c%C3%B3%20th%E1%BB%83%20ch%E1%BA%A1y%20online%20v%C3%A0%20offline)%20trong%20th%E1%BB%9Di%20gian%20nhanh%20nh%E1%BA%A5t%2C%20chi%20ph%C3%AD%20th%E1%BA%A5p%20nh%E1%BA%A5t%2C%20%C4%91%E1%BA%A3m%20b%E1%BA%A3o%20uy%20t%C3%ADn%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng.%20V%E1%BB%9Bi%20kinh%20nghi%E1%BB%87m%20nhi%E1%BB%81u%20n%C4%83m%20l%C3%A0m%20vi%E1%BB%87c%20%E1%BB%9F%20c%C3%A1c%20c%C3%B4ng%20ty%20chuy%C3%AAn%20v%E1%BB%81%20ph%E1%BA%A7n%20m%E1%BB%81m%20qu%E1%BA%A3n%20l%C3%BD%20%E1%BB%9F%20t%E1%BA%A5t%20c%E1%BA%A3%20c%C3%A1c%20l%C4%A9nh%20v%E1%BB%B1c%20nh%C6%B0%3A%20Ph%E1%BA%A7n%20m%E1%BB%81m%20K%E1%BA%BF%20to%C3%A1n%2C%20Ph%E1%BA%A7n%20m%E1%BB%81m%20Nh%C3%A2n%20S%E1%BB%B1%2C%20Ph%E1%BA%A7n%20m%E1%BB%81m%20Qu%E1%BA%A3n%20l%C3%BD%20Kho%20-%20V%E1%BA%ADt%20t%C6%B0%2C%20Ph%E1%BA%A7n%20m%E1%BB%81m%20B%C3%A1n%20H%C3%A0ng%2C%20Ph%E1%BA%A7n%20m%E1%BB%81m%20Kh%C3%A1ch%20S%E1%BA%A1n%2C%20Nh%C3%A0%20h%C3%A0ng%20Caf%C3%A9%2C%20Karaoke%2C...%20Ch%C3%BAng%20t%C3%B4i%20s%E1%BA%B5n%20s%C3%A0ng%20%C4%91%C3%A1p%20%E1%BB%A9ng%20t%E1%BA%A5t%20c%E1%BA%A3%20c%C3%A1c%20nhu%20c%E1%BA%A7u%20ri%C3%AAng%20%C4%91%E1%BA%B7c%20bi%E1%BB%87t%20c%E1%BB%A7a%20qu%C3%BD%20kh%C3%A1ch%20v%E1%BB%81%20ph%E1%BA%A7n%20m%E1%BB%81m%20qu%E1%BA%A3n%20l%C3%BD%2C%20v%E1%BB%9Bi%20m%E1%BB%8Di%20quy%20m%C3%B4%20t%E1%BB%AB%20nh%E1%BB%8F%20%C4%91%E1%BA%BFn%20l%E1%BB%9Bn%2C%20%C4%91a%20ng%C3%A0nh%2C%20%C4%91a%20%C4%91%E1%BB%8Ba%20%C4%91i%E1%BB%83m.%3C%2Fp%3E%0A%0A%3Cdiv%20style%3D%22text-align%3Acenter%22%3E%0A%3Cfigure%20class%3D%22image%22%20style%3D%22display%3Ainline-block%22%3E%3Cimg%20alt%3D%22Vi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%22%20height%3D%22675%22%20src%3D%22app_images%2Fcsm%2Fvietphanmemtheoyeucau.png%22%20width%3D%22900%22%20%2F%3E%0A%3Cfigcaption%3EC%C3%B4ng%20Ty%20Vi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Ffigcaption%3E%0A%3C%2Ffigure%3E%0A%3C%2Fdiv%3E%0A%0A%3Ch2%3EC%C3%A1c%20Lo%E1%BA%A1i%20Ph%E1%BA%A7n%20M%E1%BB%81m%20Ch%C3%BAng%20T%C3%B4i%20Nh%E1%BA%ADn%20Vi%E1%BA%BFt%3C%2Fh2%3E%0A%0A%3Cul%3E%0A%09%3Cli%3EPh%E1%BA%A7n%20m%E1%BB%81m%20qu%E1%BA%A3n%20l%C3%BD%20kho%20v%E1%BA%ADt%20t%C6%B0%3C%2Fli%3E%0A%09%3Cli%3EPh%E1%BA%A7n%20m%E1%BB%81m%20qu%E1%BA%A3n%20l%C3%BD%20nh%C3%A2n%20s%E1%BB%B1%3C%2Fli%3E%0A%09%3Cli%3EPh%E1%BA%A7n%20m%E1%BB%81m%20marketing%20online%3C%2Fli%3E%0A%09%3Cli%3EPh%E1%BA%A7n%20m%E1%BB%81m%20qu%E1%BA%A3n%20l%C3%BD%20%C4%91%E1%BA%B7t%20v%C3%A9%20online%3C%2Fli%3E%0A%09%3Cli%3EPh%E1%BA%A7n%20m%E1%BB%81m%20qu%E1%BA%A3n%20l%C3%BD%20nh%C3%A0%20h%C3%A0ng%20qu%C3%A1n%20cafe%3C%2Fli%3E%0A%09%3Cli%3E%3Cu%3EVi%E1%BA%BFt%20app%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fu%3E%3C%2Fli%3E%0A%09%3Cli%3E%3Cstrong%3ECode%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fstrong%3E%3C%2Fli%3E%0A%3C%2Ful%3E%0A%0A%3Ch2%3EQuy%20Tr%C3%ACnh%20Vi%E1%BA%BFt%20Ph%E1%BA%A7n%20M%E1%BB%81m%20Theo%20Y%C3%AAu%20C%E1%BA%A7u%3C%2Fh2%3E%0A%0A%3Cp%3EQuy%20tr%C3%ACnh%20th%E1%BB%B1c%20hi%E1%BB%87n%20c%E1%BB%A7a%20ch%C3%BAng%20t%C3%B4i%20bao%20g%E1%BB%93m%3A%3C%2Fp%3E%0A%0A%3Col%3E%0A%09%3Cli%3EL%E1%BA%A5y%20y%C3%AAu%20c%E1%BA%A7u%20kh%C3%A1ch%20h%C3%A0ng%3C%2Fli%3E%0A%09%3Cli%3ET%C6%B0%20v%E1%BA%A5n%20gi%E1%BA%A3i%20ph%C3%A1p%3C%2Fli%3E%0A%09%3Cli%3ETri%E1%BB%83n%20khai%20ph%E1%BA%A7n%20m%E1%BB%81m%3C%2Fli%3E%0A%3C%2Fol%3E%0A%0A%3Ch2%3E%C6%AFu%20%C4%90i%E1%BB%83m%20V%C6%B0%E1%BB%A3t%20Tr%E1%BB%99i%20C%E1%BB%A7a%20D%E1%BB%8Bch%20V%E1%BB%A5%20C%E1%BB%A7a%20Ch%C3%BAng%20T%C3%B4i%3C%2Fh2%3E%0A%0A%3Cul%3E%0A%09%3Cli%3EChi%20ph%C3%AD%20th%E1%BA%A5p%20v%C3%A0%20th%E1%BB%9Di%20gian%20tri%E1%BB%83n%20khai%20nhanh%20nh%E1%BA%A5t.%3C%2Fli%3E%0A%09%3Cli%3ECam%20k%E1%BA%BFt%20v%E1%BB%81%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng.%3C%2Fli%3E%0A%09%3Cli%3EH%E1%BB%97%20tr%E1%BB%A3%2024%2F7.%3C%2Fli%3E%0A%09%3Cli%3E%C4%90%C3%A3%20%C4%91%C6%B0%E1%BB%A3c%20nhi%E1%BB%81u%20c%C3%A1%20nh%C3%A2n%2C%20%C4%91%C6%A1n%20v%E1%BB%8B%20s%E1%BB%AD%20d%E1%BB%A5ng%20v%C3%A0%20%C4%91%C3%A1nh%20gi%C3%A1%20cao.%3C%2Fli%3E%0A%09%3Cli%3EC%C3%B3%20th%E1%BB%83%20n%C3%A2ng%20c%E1%BA%A5p%2C%20m%E1%BB%9F%20r%E1%BB%99ng%20kh%C3%B4ng%20gi%E1%BB%9Bi%20h%E1%BA%A1n%20c%C3%A1c%20ch%E1%BB%A9c%20n%C4%83ng%20ph%E1%BA%A7n%20m%E1%BB%81m%20t%C3%B9y%20nhu%20c%E1%BA%A7u%20s%E1%BB%AD%20d%E1%BB%A5ng.%3C%2Fli%3E%0A%3C%2Ful%3E%0A%0A%3Ch2%3ET%E1%BA%A1i%20Sao%20N%C3%AAn%20Ch%E1%BB%8Dn%20D%E1%BB%8Bch%20V%E1%BB%A5%20Vi%E1%BA%BFt%20Ph%E1%BA%A7n%20M%E1%BB%81m%20C%E1%BB%A7a%20Ch%C3%BAng%20T%C3%B4i%3F%3C%2Fh2%3E%0A%0A%3Cp%3EPh%C6%B0%C6%A1ng%20ch%C3%A2m%20ho%E1%BA%A1t%20%C4%91%E1%BB%99ng%20c%E1%BB%A7a%20ch%C3%BAng%20t%C3%B4i%20l%C3%A0%20%22L%E1%BA%A5y%20Kh%C3%A1ch%20h%C3%A0ng%20l%C3%A0m%20tr%E1%BB%8Dng%20t%C3%A2m%2C%20mang%20l%E1%BA%A1i%20gi%C3%A1%20tr%E1%BB%8B%20th%E1%BA%ADt%20s%E1%BB%B1%20cho%20kh%C3%A1ch%20h%C3%A0ng%20b%E1%BA%B1ng%20%C6%B0u%20th%E1%BA%BF%20%C4%91%E1%BB%99t%20ph%C3%A1%22.%20Ch%C3%BAng%20t%C3%B4i%20cam%20k%E1%BA%BFt%20cung%20c%E1%BA%A5p%20d%E1%BB%8Bch%20v%E1%BB%A5%20%3Cstrong%3Enh%E1%BA%ADn%20l%C3%A0m%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fstrong%3E%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng%20cao%20v%E1%BB%9Bi%20chi%20ph%C3%AD%20t%E1%BB%91i%20%C6%B0u.%20N%E1%BA%BFu%20b%E1%BA%A1n%20%C4%91ang%20t%C3%ACm%20ki%E1%BA%BFm%20m%E1%BB%99t%20gi%E1%BA%A3i%20ph%C3%A1p%20ph%E1%BA%A7n%20m%E1%BB%81m%20t%C3%B9y%20ch%E1%BB%89nh%2C%20h%C3%A3y%20li%C3%AAn%20h%E1%BB%87%20v%E1%BB%9Bi%20ch%C3%BAng%20t%C3%B4i%20ngay%20h%C3%B4m%20nay!%3C%2Fp%3E%0A%0A%3Ch2%3ELi%C3%AAn%20H%E1%BB%87%3C%2Fh2%3E%0A%0A%3Cp%3E%E2%80%9C%C4%90%E1%BA%BFn%20v%E1%BB%9Bi%20ch%C3%BAng%20t%C3%B4i%20l%C3%A0%20%C4%91%E1%BA%BFn%20v%E1%BB%9Bi%20gi%E1%BA%A3i%20ph%C3%A1p%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng%20v%C3%A0%20chi%20ph%C3%AD%20t%E1%BB%91i%20%C6%B0u%E2%80%9D%3C%2Fp%3E%0A%0A%3Cp%3E%3Cstrong%3ELi%C3%AAn%20H%E1%BB%87%3A%20Mr.Anh%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%3Cp%3E%C4%90T%3A%200964.014.947%3C%2Fp%3E%0A%0A%3Cp%3EEmail%3A%20phanmemmottrieu%40gmail.com%3C%2Fp%3E%0A%0A%3Cp%3EWebsite%3A%20%3Ca%20href%3D%22http%3A%2F%2Fwww.phanmemmottrieu.net%2F%22%3Ehttp%3A%2F%2Fwww.phanmemmottrieu.net%2F%3C%2Fa%3E%3C%2Fp%3E%0A%0A%3Cp%3EHotline%3A%200964.014.947%3C%2Fp%3E%0A%0A%3Cp%3EH%C3%A3y%20%C4%91%E1%BB%83%20ch%C3%BAng%20t%C3%B4i%20gi%C3%BAp%20b%E1%BA%A1n%20gi%E1%BA%A3i%20quy%E1%BA%BFt%20c%C3%A1c%20b%C3%A0i%20to%C3%A1n%20qu%E1%BA%A3n%20l%C3%BD%20v%C3%A0%20v%E1%BA%ADn%20h%C3%A0nh%20doanh%20nghi%E1%BB%87p%20m%E1%BB%99t%20c%C3%A1ch%20hi%E1%BB%87u%20qu%E1%BA%A3%20nh%E1%BA%A5t.%20%C4%90%E1%BB%ABng%20ng%E1%BA%A7n%20ng%E1%BA%A1i%20li%C3%AAn%20h%E1%BB%87%20%C4%91%E1%BB%83%20%C4%91%C6%B0%E1%BB%A3c%20t%C6%B0%20v%E1%BA%A5n%20mi%E1%BB%85n%20ph%C3%AD%20v%E1%BB%81%20d%E1%BB%8Bch%20v%E1%BB%A5%20%3Ca%20href%3D%22%23%22%3E%3Cu%3Ethu%C3%AA%20vi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%3C%2Fu%3E%3C%2Fa%3E%20v%C3%A0%20%3Cstrong%3Egi%C3%A1%20vi%E1%BA%BFt%20ph%E1%BA%A7n%20m%E1%BB%81m%20theo%20y%C3%AAu%20c%E1%BA%A7u%3C%2Fstrong%3E.%3C%2Fp%3E%0A"),
    content_en: decodeURIComponent(""),
    content_zh: decodeURIComponent(""),
    serviceType: "phan-mem",
    author: "Mr.Anh",
    publishDate: "2025-09-03",
    readTime: "12 phút",
    views: 6671,
    tags: ["phan-mem", "custom-software", "erp", "crm"],
    activeHome: true,
    featured: false,
    thumbnail: "https://www.phanmemmottrieu.net/app_images/web/vietphanmemtheoyeucau.png",
    images: JSON.stringify(["https://www.phanmemmottrieu.net/app_images/web/vietphanmemtheoyeucau.png"]),
    priority: 2,
    attributes_contact: "0964.014.947",
  },
    {
      id: 'web_250903022140_7bba556a41bb',
      slug: generateSlug('Tool tăng thứ hạng website') ,
      title: decodeURIComponent('Tool%20t%C4%83ng%20th%E1%BB%A9%20h%E1%BA%A1ng%20website'),
      title_en: 'Website Ranking Tool',
      title_zh: '网站排名工具',
      keywords: 'tool tăng thứ hạng website, tool seo, phần mềm seo, tăng thứ hạng google, seo google, seo website',
      keywords_en: 'website ranking tool, seo tool, seo software, google ranking, google seo, website seo',
      keywords_zh: '网站排名工具, SEO工具, SEO软件, 谷歌排名, 谷歌SEO, 网站SEO',
      excerpt: 'Tool tăng thứ hạng website là giải pháp đưa website lên TOP đầu Google nhanh chóng và hiệu quả. Chúng tôi cung cấp giải pháp tối ưu SEO toàn diện, giúp tăng thứ hạng trên các công cụ tìm kiếm như Google, Bing và Coc Coc. Liên hệ ngay: 0964.014.947 để nhận tư vấn và báo giá chi tiết.',
      excerpt_en: 'Website ranking tool is a solution to quickly and effectively bring your website to the top of Google. We provide comprehensive SEO optimization solutions to help improve rankings on search engines like Google, Bing, and Coc Coc. Contact us now at 0964.014.947 for consultation and detailed pricing.',
      excerpt_zh: '网站排名工具是一种快速有效地将您的网站提升到Google顶部的解决方案。我们提供全面的SEO优化解决方案，帮助提高Google、Bing和Coc Coc等搜索引擎的排名。立即联系我们，电话0964.014.947，获取咨询和详细报价。',
      content: decodeURIComponent('%3Cdiv%20style%3D%22font-size%3A14px%3Bcolor%3A%23000000%22%3E%3Cp%3ETool%20t%C4%83ng%20th%E1%BB%A9%20h%E1%BA%A1ng%20website%20l%C3%A0%20gi%E1%BA%A3i%20ph%C3%A1p%20ho%C3%A0n%20h%E1%BA%A3o%20gi%C3%BAp%20doanh%20nghi%E1%BB%87p%20v%C3%A0%20c%C3%A1%20nh%C3%A2n%20c%E1%BA%A3i%20thi%E1%BB%87n%20th%E1%BB%A9%20h%E1%BA%A1ng%20tr%C3%AAn%20c%C3%A1c%20c%C3%B4ng%20c%E1%BB%A5%20t%C3%ACm%20ki%E1%BA%BFm%20m%E1%BB%99t%20c%C3%A1ch%20nhanh%20ch%C3%B3ng%20v%C3%A0%20hi%E1%BB%87u%20qu%E1%BA%A3.%3C%2Fp%3E%3Cp%3E%3Cb%3EGi%E1%BA%A3i%20ph%C3%A1p%20%C4%91a%20d%E1%BA%A1ng%3A%3C%2Fb%3E%3C%2Fp%3E%3Cul%3E%3Cli%3EPh%C3%A2n%20t%C3%ADch%20v%C3%A0%20t%E1%BB%91i%20%C6%B0u%20t%E1%BB%AB%20kh%C3%B3a%3C%2Fli%3E%3Cli%3ET%E1%BA%A1o%20backlink%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng%3C%2Fli%3E%3Cli%3EXu%E1%BA%A5t%20b%E1%BA%A3n%20n%E1%BB%99i%20dung%20chu%E1%BA%A9n%20SEO%3C%2Fli%3E%3Cli%3EGi%C3%A1m%20s%C3%A1t%20v%C3%A0%20b%C3%A1o%20c%C3%A1o%20th%E1%BB%A9%20h%E1%BA%A1ng%20theo%20th%E1%BB%9Di%20gian%20th%E1%BB%B1c%3C%2Fli%3E%3C%2Ful%3E%3Cp%3E%3Cb%3ELi%C3%AAn%20h%E1%BB%87%20ngay%3A%3C%2Fb%3E%20%3Ca%20href%3D%22tel%3A0964014947%22%3E0964.014.947%3C%2Fa%3E%20ho%E1%BA%B7c%20truy%20c%E1%BA%ADp%20%3Ca%20href%3D%22https%3A%2F%2Fphanmemmottrieu.net%22%20target%3D%22_blank%22%3Ephanmemmottrieu.net%3C%2Fa%3E%20%C4%91%E1%BB%83%20bi%E1%BA%BFt%20th%C3%AAm%20chi%20ti%E1%BA%BFt.%3C%2Fp%3E%3C%2Fdiv%3E'),
      content_en: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3EThe%20website%20ranking%20tool%20is%20a%20perfect%20solution%20to%20help%20businesses%20and%20individuals%20improve%20their%20rankings%20on%20search%20engines%20quickly%20and%20effectively.%3C/p%3E%3Cp%3E%3Cb%3EDiverse%20solutions:%3C/b%3E%3C/p%3E%3Cul%3E%3Cli%3EKeyword%20analysis%20and%20optimization%3C/li%3E%3Cli%3ECreating%20high-quality%20backlinks%3C/li%3E%3Cli%3EPublishing%20SEO-standardized%20content%3C/li%3E%3Cli%3EMonitoring%20and%20reporting%20rankings%20in%20real-time%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3EContact%20us%20now:%3C/b%3E%20at%20a href=%22tel:%220964014947%22%3E0964.014.947%3C/a%3E or visit %3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E to know more details.%3C/p%3E%3C/div%3E',
      content_zh: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3E网站排名工具是帮助企业和个人快速有效提升搜索引擎排名的完美解决方案。%3C/p%3E%3Cp%3E%3Cb%3E多样化的解决方案：%3C/b%3E%3C/p%3E%3Cul%3E%3Cli%3E关键词分析和优化%3C/li%3E%3Cli%3E创建高质量的反向链接%3C/li%3E%3Cli%3E发布符合SEO标准的内容%3C/li%3E%3Cli%3E实时监控和报告排名情况%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3E立即联系我们：%3C/b%3E%20电话0964.014.947或访问%3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E了解更多详情。%3C/p%3E%3C/div%3E',
      serviceType: 'phan-mem',
      author: 'Phần Mềm Một Triệu',
      avatar: 'https://phanmemmottrieu.net/media/icon.png',
      publishDate: '2025-09-03',
      readTime: '5 phút',
      views: 2500,
      tags: ['seo', 'tool', 'thu-hang', 'website', 'google'],
      thumbnail: 'https://www.phanmemmottrieu.net/app_images/web/tool-tang-thu-hang-website.png',
      images: JSON.stringify(['https://www.phanmemmottrieu.net/app_images/web/tool-tang-thu-hang-website.png']),
      featured: false,
      priority: 5
    },
    {
      id: 'web_250826090309_8b8f650ed0f3',
      slug: generateSlug('Làm thế nào để đưa web lên top google') ,
      title: decodeURIComponent('L%C3%A0m%20th%E1%BA%BF%20n%C3%A0o%20%C4%91%E1%BB%83%20%C4%91%C6%B0a%20web%20l%C3%AAn%20top%20google'),
      title_en: 'How to Get Your Website to the Top of Google',
      title_zh: '如何将网站提升到谷歌首页',
      keywords: 'l%C3%A0m%20th%E1%BA%BF%20n%C3%A0o%20%C4%91%E1%BB%83%20%C4%91%C6%B0a%20web%20l%C3%AAn%20top%20google, seo, seo google, tăng thứ hạng google, tối ưu hóa website, dịch vụ seo',
      keywords_en: 'how to get your website to the top of google, seo, google seo, increase google ranking, website optimization, seo services',
      keywords_zh: '如何将网站提升到谷歌首页, SEO, 谷歌SEO, 提高谷歌排名, 网站优化, SEO服务',
      excerpt: 'Đưa website lên TOP Google là mục tiêu của mọi doanh nghiệp. Với kinh nghiệm nhiều năm trong lĩnh vực SEO, chúng tôi sẽ giúp bạn tối ưu hoá website và đạt thứ hạng cao nhất. Liên hệ: 0964.014.947 để nhận tư vấn miễn phí.',
      excerpt_en: 'Getting your website to the top of Google is the goal of every business. With years of experience in SEO, we will help you optimize your website and achieve the highest rankings. Contact us at 0964.014.947 for free consultation.',
      excerpt_zh: '将网站提升到谷歌首页是每个企业的目标。凭借多年的SEO经验，我们将帮助您优化网站并实现最高排名。请致电0964.014.947获取免费咨询。',
      content: decodeURIComponent('%3Cdiv%20style%3D%22font-size%3A14px%3Bcolor%3A%23000000%22%3E%3Cp%3E%C4%90%E1%BB%83%20%C4%91%C6%B0a%20website%20l%C3%AAn%20TOP%20Google%2C%20b%E1%BA%A1n%20c%E1%BA%A7n%20%C3%A1p%20d%E1%BB%A5ng%20nhi%E1%BB%81u%20chi%E1%BA%BFn%20l%C6%B0%E1%BB%A3c%20SEO%20hi%E1%BB%87u%20qu%E1%BA%A3.%20Ch%C3%BAng%20t%C3%B4i%20cung%20c%E1%BA%A5p%20d%E1%BB%8Bch%20v%E1%BB%A5%3A%3C%2Fp%3E%3Cul%3E%3Cli%3ET%E1%BB%91i%20%C6%B0u%20h%C3%B3a%20n%E1%BB%99i%20dung%20website%3C%2Fli%3E%3Cli%3ET%E1%BA%A1o%20backlink%20ch%E1%BA%A5t%20l%C6%B0%E1%BB%A3ng%20cao%3C%2Fli%3E%3Cli%3EC%E1%BA%A3i%20thi%E1%BB%87n%20t%E1%BB%91c%20%C4%91%E1%BB%99%20t%E1%BA%A3i%20trang%3C%2Fli%3E%3Cli%3EPh%C3%A2n%20t%C3%ADch%20v%C3%A0%20gi%C3%A1m%20s%C3%A1t%20k%E1%BA%BFt%20qu%E1%BA%A3%3C%2Fli%3E%3C%2Ful%3E%3Cp%3E%3Cb%3ELi%C3%AAn%20h%E1%BB%87%3A%3C%2Fb%3E%20%3Ca%20href%3D%22tel%3A0964014947%22%3E0964.014.947%3C%2Fa%3E%20ho%E1%BA%B7c%20truy%20c%E1%BA%ADp%20%3Ca%20href%3D%22https%3A%2F%2Fphanmemmottrieu.net%22%20target%3D%22_blank%22%3Ephanmemmottrieu.net%3C%2Fa%3E%3C%2Fp%3E%3C%2Fdiv%3E'),
      content_en: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3ETo%20get%20your%20website%20to%20the%20top%20of%20Google%2C%20you%20need%20to%20apply%20various%20effective%20SEO%20strategies.%20We%20provide%20services:%3C/p%3E%3Cul%3E%3Cli%3EOptimizing%20website%20content%3C/li%3E%3Cli%3ECreating%20high-quality%20backlinks%3C/li%3E%3Cli%3EImproving%20page%20loading%20speed%3C/li%3E%3Cli%3EAnalyzing%20and%20monitoring%20results%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3EContact:%3C/b%3E at %3Ca href=%22tel:%220964014947%22%3E0964.014.947%3C/a%3E or visit %3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E.%3C/p%3E%3C/div%3E',
      content_zh: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3E要将网站提升到谷歌首页，您需要应用各种有效的SEO策略。我们提供以下服务：%3C/p%3E%3Cul%3E%3Cli%3E优化网站内容%3C/li%3E%3Cli%3E创建高质量的反向链接%3C/li%3E%3Cli%3E提高页面加载速度%3C/li%3E%3Cli%3E分析和监控结果%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3E联系方式：%3C/b%3E电话0964.014.947或访问%3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E。%3C/p%3E%3C/div%3E',
      serviceType: 'phan-mem',
      author: 'Phần Mềm Một Triệu',
      avatar: 'https://phanmemmottrieu.net/media/icon.png',
      publishDate: '2025-08-26',
      readTime: '7 phút',
      views: 3200,
      tags: ['seo', 'google', 'top-ranking', 'website', 'optimization'],
      thumbnail: 'https://www.phanmemmottrieu.net/app_images/web/lam-the-nao-de-dua-web-len-top-google.png',
      images: JSON.stringify(['https://www.phanmemmottrieu.net/app_images/web/lam-the-nao-de-dua-web-len-top-google.png']),
      featured: true,
      priority: 6
    },
    {
      id: 'web_250826080427_4cbbdde7c9b0',
      slug: generateSlug('Tăng traffic user') ,
      title: decodeURIComponent('T%C4%83ng%20traffic%20user'),
      title_en: 'Increase Real User Traffic',
      title_zh: '增加真实用户流量',
      keywords: 'tăng traffic user, dịch vụ tăng traffic, tăng traffic website, tăng lượt truy cập website, tăng traffic thật',
      keywords_en: 'increase real user traffic, traffic increase service, increase website traffic, increase website visits, real traffic increase',
      keywords_zh: '增加真实用户流量, 流量增加服务, 增加网站流量, 增加网站访问量, 真实流量增加',
      excerpt: 'Dịch vụ tăng traffic user thật giúp nâng cao độ uy tín và thứ hạng website của bạn. Chúng tôi cung cấp traffic chất lượng cao từ nhiều nguồn khác nhau. Liên hệ: 0964.014.947',
      excerpt_en: 'The real user traffic increase service helps enhance the credibility and ranking of your website. We provide high-quality traffic from various sources. Contact us at 0964.014.947',
      excerpt_zh: '真实用户流量增加服务有助于提升您网站的信誉和排名。我们提供来自各种来源的高质量流量。请致电0964.014.947联系我们。',
      content: decodeURIComponent('%3Cdiv%20style%3D%22font-size%3A14px%3Bcolor%3A%23000000%22%3E%3Cp%3ED%E1%BB%8Bch%20v%E1%BB%A5%20t%C4%83ng%20traffic%20user%20th%E1%BA%ADt%20gi%C3%BAp%20website%20c%E1%BB%A7a%20b%E1%BA%A1n%20c%C3%B3%20l%C6%B0%E1%BB%A3ng%20truy%20c%E1%BA%ADp%20cao%2C%20c%E1%BA%A3i%20thi%E1%BB%87n%20th%E1%BB%A9%20h%E1%BA%A1ng%20v%C3%A0%20t%C4%83ng%20%C4%91%E1%BB%99%20uy%20t%C3%ADn.%3C%2Fp%3E%3Cp%3E%3Cb%3E%C6%AF u%20%C4%91i%E1%BB%83m%20d%E1%BB%8Bch%20v%E1%BB%A5%3A%3C%2Fb%3E%3C%2Fp%3E%3Cul%3E%3Cli%3ETraffic%20user%20th%E1%BA%ADt%20100%25%3C%2Fli%3E%3Cli%3EC%C3%B3%20th%E1%BB%83%20t%C3%B9y%20ch%E1%BB%89nh%20ngu%E1%BB%93n%20traffic%3C%2Fli%3E%3Cli%3ET%C4%83ng%20th%E1%BB%9Di%20gian%20l%C6%B0u%20tr%C3%BA%20tr%C3%AAn%20website%3C%2Fli%3E%3Cli%3EGi%C3%A1m%20t%E1%BB%B7%20l%E1%BB%87%20tho%C3%A1t%20(bounce%20rate)%3C%2Fli%3E%3C%2Ful%3E%3Cp%3E%3Cb%3ELi%C3%AAn%20h%E1%BB%87%3A%3C%2Fb%3E%20%3Ca%20href%3D%22tel%3A0964014947%22%3E0964.014.947%3C%2Fa%3E%20ho%E1%BA%B7c%20truy%20c%E1%BA%ADp%20%3Ca%20href%3D%22https%3A%2F%2Fphanmemmottrieu.net%22%20target%3D%22_blank%22%3Ephanmemmottrieu.net%3C%2Fa%3E%3C%2Fp%3E%3C%2Fdiv%3E'),
      content_en: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3EThe%20real%20user%20traffic%20increase%20service%20helps%20enhance%20the%20credibility%20and%20ranking%20of%20your%20website.%20We%20provide%20high-quality%20traffic%20from%20various%20sources.%20Contact%20us%20at%200964.014.947.%3C/p%3E%3Cp%3E%3Cb%3EReal%20user%20traffic%3A%3C/b%3E%3C/p%3E%3Cul%3E%3Cli%3E100%25%3C%2Fli%3E%3Cli%3EOrganic%20traffic%3C%2Fli%3E%3Cli %3EIncreased%20dwell%20time%20on%20website%3C%2Fli%3E%3Cli%3EReduced%20bounce%20rate%3C%2Fli%3E%3C/ul%3E%3Cp%3E%3Cb%3EContact:%3C/b%3E at %3Ca href=%22tel:%220964014947%22%3E0964.014.947%3C/a%3E or visit %3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E.%3C/p%3E%3C/div%3E',
      content_zh: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3E真实用户流量增加服务有助于提升您网站的信誉和排名。我们提供来自各种来源的高质量流量。请致电0964.014.947联系我们。%3C/p%3E%3Cp%3E%3Cb%3E真实用户流量：%3C/b%3E%3C/p%3E%3Cul%3E%3Cli%3E100%25真实用户%3C/li%3E%3Cli%3E自然流量%3C/li%3E%3Cli %3E增加网站停留时间%3C/li%3E%3Cli%3E降低跳出率%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3E联系方式：%3C/b%3E电话0964.014.947或访问%3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E。%3C/p%3E%3C/div%3E',
      serviceType: 'phan-mem',
      author: 'Phần Mềm Một Triệu',
      avatar: 'https://phanmemmottrieu.net/media/icon.png',
      publishDate: '2025-08-26',
      readTime: '6 phút',
      views: 2800,
      tags: ['traffic', 'user', 'website', 'seo', 'optimization'],
      thumbnail: 'https://www.phanmemmottrieu.net/app_images/web/tang-traffic-user.png',
      images: JSON.stringify(['https://www.phanmemmottrieu.net/app_images/web/tang-traffic-user.png']),
      featured: false,
      priority: 7
    },
    {
      id: '221028100112_5373c2d8bvisao',
      slug: generateSlug('Chuyên Gia Tư Vấn Phần Mềm'),
      title: decodeURIComponent('Chuy%C3%AAn%20Gia%20T%C6%B0%20V%E1%BA%A5n%20Ph%E1%BA%A7n%20M%E1%BB%81m'),
      title_en: 'Software Consulting Experts',
      title_zh: '软件咨询专家',
      keywords: 'chuyên gia tư vấn phần mềm, tư vấn phần mềm doanh nghiệp, tư vấn giải pháp phần mềm, dịch vụ tư vấn phần mềm',
      keywords_en: 'software consulting experts, enterprise software consulting, software solution consulting, software consulting services',
      keywords_zh: '软件咨询专家, 企业软件咨询, 软件解决方案咨询, 软件咨询服务',
      excerpt: 'Đội ngũ chuyên gia giàu kinh nghiệm sẵn sàng tư vấn và hỗ trợ bạn trong việc lựa chọn và triển khai giải pháp phần mềm phù hợp. Liên hệ: 0964.014.947',
      excerpt_en: 'Our team of experienced experts is ready to advise and support you in selecting and implementing the right software solutions. Contact us at 0964.014.947',
      excerpt_zh: '我们经验丰富的专家团队随时准备为您提供建议和支持，帮助您选择和实施合适的软件解决方案。请致电0964.014.947联系我们。',
      content: decodeURIComponent('%3Cdiv%20style%3D%22font-size%3A14px%3Bcolor%3A%23000000%22%3E%3Cp%3EV%E1%BB%9Bi%20%C4%91%E1%BB%99i%20ng%C5%A9%20chuy%C3%AAn%20gia%20c%C3%B3%20nhi%E1%BB%81u%20n%C4%83m%20kinh%20nghi%E1%BB%87m%2C%20ch%C3%BAng%20t%C3%B4i%20cung%20c%E1%BA%A5p%20d%E1%BB%8Bch%20v%E1%BB%A5%20t%C6%B0%20v%E1%BA%A5n%20chuy%C3%AAn%20s%C3%A2u%20v%E1%BB%81%20ph%E1%BA%A7n%20m%E1%BB%81m%20v%C3%A0%20c%C3%B4ng%20ngh%E1%BB%87.%3C%2Fp%3E%3Cp%3E%3Cb%3EL%C4%A9nh%20v%E1%BB%B1c%20t%C6%B0%20v%E1%BA%A5n%3A%3C%2Fb%3E%3C%2Fp%3E%3Cul%3E%3Cli%3EL%E1%BB%B1a%20ch%E1%BB%8Dn%20c%C3%B4ng%20ngh%E1%BB%87%20ph%C3%B9%20h%E1%BB%A3p%3C%2Fli%3E%3Cli%3EThi%E1%BA%BFt%20k%E1%BA%BF%20ki%E1%BA%BFn%20tr%C3%BAc%20h%E1%BB%87%20th%E1%BB%91ng%3C%2Fli%3E%3Cli%3ET%E1%BB%91i%20%C6%B0u%20h%C3%B3a%20quy%20tr%C3%ACnh%20ph%C3%A1t%20tri%E1%BB%83n%3C%2Fli%3E%3Cli%3E%C4%90%C3%A1nh%20gi%C3%A1%20v%C3%A0%20c%E1%BA%A3i%20ti%E1%BA%BFn%20ph%E1%BA%A7n%20m%E1%BB%81m%20hi%E1%BB%87n%20t%E1%BA%A1i%3C%2Fli%3E%3C%2Ful%3E%3Cp%3E%3Cb%3ELi%C3%AAn%20h%E1%BB%87%3A%3C%2Fb%3E%20%3Ca%20href%3D%22tel%3A0964014947%22%3E0964.014.947%3C%2Fa%3E%20ho%E1%BA%B7c%20truy%20c%E1%BA%ADp%20%3Ca%20href%3D%22https%3A%2F%2Fphanmemmottrieu.net%22%20target%3D%22_blank%22%3Ephanmemmottrieu.net%3C%2Fa%3E%3C%2Fp%3E%3C%2Fdiv%3E'),
      content_en: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3EWith%20a%20team%20of%20experienced%20experts%2C%20we%20provide%20specialized%20consulting%20services%20in%20software%20and%20technology.%3C/p%3E%3Cp%3E%3Cb%3EConsulting%20areas:%3C/b%3E%3C/p%3E%3Cul%3E%3Cli%3EChoosing%20the%20right%20technology%3C/li%3E%3Cli%3ESystem%20architecture%20design%3C/li%3E%3Cli%3EOptimizing%20development%20processes%3C/li%3E%3Cli%3EEvaluating%20and%20improving%20existing%20software%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3EContact:%3C/b%3E at %3Ca href=%22tel:%220964014947%22%3E0964.014.947%3C/a%3E or visit %3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E.%3C/p%3E%3C/div%3E',
      content_zh: '%3Cdiv style=%22font-size%3A14px;color%3A%23000000%22%3E%3Cp%3E凭借一支经验丰富的专家团队，我们在软件和技术领域提供专业的咨询服务。%3C/p%3E%3Cp%3E%3Cb%3E咨询领域：%3C/b%3E%3C/p%3E%3Cul%3E%3Cli%3E选择合适的技术%3C/li%3E%3Cli%3E系统架构设计%3C/li%3E%3Cli%3E优化开发流程%3C/li%3E%3Cli%3E评估和改进现有软件%3C/li%3E%3C/ul%3E%3Cp%3E%3Cb%3E联系方式：%3C/b%3E电话0964.014.947或访问%3Ca href=%22https://phanmemmottrieu.net%22 target=%22_blank%22%3Ephanmemmottrieu.net%3C/a%3E。%3C/p%3E%3C/div%3E',
      serviceType: 'phan-mem',
      author: 'Phần Mềm Một Triệu',
      avatar: 'https://phanmemmottrieu.net/media/icon.png',
      publishDate: '2022-10-28',
      readTime: '8 phút',
      views: 1500,
      tags: ['consulting', 'expert', 'software', 'technology', 'advisory'],
      thumbnail: 'https://www.phanmemmottrieu.net/app_images/web/chuyen-gia-tu-van-phan-mem.png',
      images: JSON.stringify(['https://www.phanmemmottrieu.net/app_images/web/chuyen-gia-tu-van-phan-mem.png']),
      featured: false,
      priority: 8
    },
  
  // Bất động sản
  {
    id: "bat-dong-san-1",
    service_code: "bat-dong-san",
    slug: generateSlug("Căn hộ 2PN Quận 7 - Full nội thất") + "-bat-dong-san-1",
    title: "Căn hộ 2PN Quận 7 - Full nội thất",
    title_en: "2-Bedroom Apartment in District 7 - Fully Furnished",
    title_zh: "第7区两居室公寓 - 全套家具",
    keywords: "căn hộ 2 phòng ngủ, căn hộ quận 7, căn hộ full nội thất, căn hộ bán, căn hộ đẹp, căn hộ tiện ích",
    keywords_en: "2-bedroom apartment, district 7 apartment, fully furnished apartment, apartment for sale, beautiful apartment, apartment with amenities",
    keywords_zh: "两居室公寓，第7区公寓，全套家具公寓，待售公寓，美丽公寓，配备设施的公寓",
    excerpt: "Căn hộ 70m², 2 phòng ngủ, view đẹp, tiện ích đầy đủ, gần trường học và siêu thị.",
    excerpt_en: "70m² apartment, 2 bedrooms, beautiful view, full amenities, close to schools and supermarkets.",
    excerpt_zh: "70平方米公寓，2间卧室，景观优美，设施齐全，靠近学校和超市。",
    content: `<h2>Căn hộ 2PN Quận 7 - Full nội thất</h2><p>Căn hộ 70m², 2 phòng ngủ, view đẹp, tiện ích đầy đủ, gần trường học và siêu thị.</p>`,
    content_en: `<h2>2-Bedroom Apartment in District 7 - Fully Furnished</h2><p>70m² apartment, 2 bedrooms, beautiful view, full amenities, close to schools and supermarkets.</p>`,
    content_zh: `<h2>第7区两居室公寓 - 全套家具</h2><p>70平方米公寓，2间卧室，景观优美，设施齐全，靠近学校和超市。</p>`,
    price: "2.3 tỷ",
    featured: 1,
    active_home: 0,
    specifications_area: "70m²",
    specifications_bedrooms: 2,
    specifications_bathrooms: 2,
    specifications_address: "Quận 7, TP.HCM",
    specifications_type: "sell",
    specifications_direction: "Đông Nam",
    specifications_legalStatus: "Sổ hồng lâu dài",
    specifications_furnished: true,
    specifications_floor: 12,
    specifications_frontWidth: "5m",
    specifications_utilities: "Hồ bơi, Gym, Siêu thị, Trường học",
    specifications_hasGarden: false,
    specifications_hasPool: true,
    specifications_parking: "Có tầng hầm",
    specifications_grade: "A",
    specifications_expectedROI: "8%/năm",
    specifications_managedByOperator: "CBRE",
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/bat-dong-san-1.jpg`])
  },
  {
    id: "bat-dong-san-2",
    service_code: "bat-dong-san",
    slug: generateSlug("Cho thuê căn hộ 1PN Q.1, đầy đủ nội thất") + "-bat-dong-san-2",
    title: "Cho thuê căn hộ 1PN Q.1, đầy đủ nội thất",
    title_en: "1-Bedroom Apartment for Rent in District 1, Fully Furnished",
    title_zh: "第1区一居室公寓出租，全套家具",
    keywords: "căn hộ 1 phòng ngủ, căn hộ quận 1, căn hộ cho thuê, căn hộ đầy đủ nội thất, căn hộ an ninh, căn hộ trung tâm",
    keywords_en: "1-bedroom apartment, district 1 apartment, apartment for rent, fully furnished apartment, secure apartment, central apartment",
    keywords_zh: "一居室公寓，第1区公寓，出租公寓，全套家具公寓，安全公寓，市中心公寓",
    excerpt: "Căn hộ 45m², trung tâm Q.1, phù hợp gia đình nhỏ hoặc cặp đôi, an ninh 24/7.",
    excerpt_en: "45m² apartment, central District 1, suitable for small families or couples, 24/7 security.",
    excerpt_zh: "45平方米公寓，位于第1区中心，适合小家庭或情侣，24/7安保。",
    content: `<h2>Cho thuê căn hộ 1PN Q.1, đầy đủ nội thất</h2><p>Căn hộ 45m², trung tâm Q.1, phù hợp gia đình nhỏ hoặc cặp đôi, an ninh 24/7.</p>`,
    content_en: `<h2>1-Bedroom Apartment for Rent in District 1, Fully Furnished</h2><p>45m² apartment, central District 1, suitable for small families or couples, 24/7 security.</p>`,
    content_zh: `<h2>第1区一居室公寓出租，全套家具</h2><p>45平方米公寓，位于第1区中心，适合小家庭或情侣，24/7安保。</p>`,
    price: "12 triệu/tháng",
    featured: 0,
    active_home: 0,
    specifications_area: "45m²",
    specifications_bedrooms: 1,
    specifications_bathrooms: 1,
    specifications_address: "Quận 1, TP.HCM",
    specifications_type: "rent",
    specifications_direction: "Tây Bắc",
    specifications_legalStatus: "Hợp đồng thuê",
    specifications_furnished: true,
    specifications_floor: 5,
    specifications_frontWidth: "4m",
    specifications_utilities: "Thang máy, Bảo vệ 24/7, Gần trung tâm",
    specifications_hasGarden: false,
    specifications_hasPool: false,
    specifications_parking: "Có tầng hầm",
    specifications_grade: "B",
    specifications_expectedROI: "6%/năm",
    specifications_managedByOperator: "Chủ nhà",
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/bat-dong-san-2.jpg`])
  },
  
  // Mỹ phẩm & làm đẹp
  {
    id: "lam-dep-my-pham-1",
    service_code: "lam-dep-my-pham",
    slug: generateSlug("Serum Vitamin C 30ml") + "-lam-dep-my-pham-1",
    title: "Serum Vitamin C 30ml",
    title_en: "Serum Vitamin C 30ml",
    title_zh: "Serum Vitamin C 30ml",
    keywords: "serum vitamin C, serum làm sáng da, serum chống oxy hoá, serum mờ thâm, serum phù hợp mọi loại da",
    keywords_en: "serum vitamin C, serum brightens skin, serum antioxidant, serum fades dark spots, serum suitable for all skin types",
    keywords_zh: "维生素C精华液，提亮肤色精华液，抗氧化精华液，淡化黑斑精华液，适合所有肤质精华液",
    excerpt: "Làm sáng da, mờ thâm, chống oxy hoá. Phù hợp mọi loại da.",
    excerpt_en: "Brightens skin, fades dark spots, antioxidant. Suitable for all skin types.",
    excerpt_zh: "提亮肤色，淡化黑斑，抗氧化。适合所有肤质。",
    content: `<h2>Serum Vitamin C 30ml</h2><p>Làm sáng da, mờ thâm, chống oxy hoá. Phù hợp mọi loại da.</p>`,
    content_en: `<h2>Serum Vitamin C 30ml</h2><p>Brightens skin, fades dark spots, antioxidant. Suitable for all skin types.</p>`,
    content_zh: `<h2>Serum Vitamin C 30ml</h2><p>提亮肤色，淡化黑斑，抗氧化。适合所有肤质。</p>`,
    price: "390,000đ",
    featured: 1,
    active_home: 0,
    specifications_brand: "DermaLab",
    specifications_origin: "Korea",
    specifications_volume: "30ml",
    specifications_ingredients: "Vitamin C, Hyaluronic Acid, Niacinamide",
    specifications_skinType: "Mọi loại da",
    specifications_expiry: "2027-12-31",
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/lam-dep-my-pham-1.jpg`])
  },
  {
    id: "lam-dep-my-pham-2",
    service_code: "lam-dep-my-pham",
    slug: generateSlug("Kem chống nắng SPF50+ PA++++") + "-lam-dep-my-pham-2",
    title: "Kem chống nắng SPF50+ PA++++",
    title_en: "Sunscreen SPF50+ PA++++",
    title_zh: "防晒霜 SPF50+ PA++++",
    keywords: "kem chống nắng, kem chống nắng phổ rộng, kem chống nắng kiềm dầu, kem chống nắng không nhờn rít, kem chống nắng nâng tone",
    keywords_en: "sunscreen, broad-spectrum sunscreen, oil control sunscreen, non-greasy sunscreen, tone-up sunscreen",
    keywords_zh: "防晒霜，广谱防晒霜，控油防晒霜，不油腻防晒霜，提亮肤色防晒霜",
    excerpt: "Chống nắng phổ rộng, kiềm dầu, không nhờn rít, nâng tone nhẹ.",
    excerpt_en: "Broad-spectrum sun protection, oil control, non-greasy, light tone-up effect.",
    excerpt_zh: "广谱防晒，控油，不油腻，轻微提亮肤色。",
    content: `<h2>Kem chống nắng SPF50+ PA++++</h2><p>Chống nắng phổ rộng, kiềm dầu, không nhờn rít, nâng tone nhẹ.</p>`,
    content_en: `<h2>Sunscreen SPF50+ PA++++</h2><p>Broad-spectrum sun protection, oil control, non-greasy, light tone-up effect.</p>`,
    content_zh: `<h2>防晒霜 SPF50+ PA++++</h2><p>广谱防晒，控油，不油腻，轻微提亮肤色。</p>`,
    price: "290,000đ",
    featured: 0,
    active_home: 0,
    specifications_brand: "SunCare",
    specifications_origin: "Japan",
    specifications_volume: "60ml",
    specifications_ingredients: "Zinc Oxide, Titanium Dioxide, Aloe Vera",
    specifications_skinType: "Da dầu, Da hỗn hợp",
    specifications_expiry: "2026-06-30",
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/lam-dep-my-pham-2.jpg`])
  },
  
  // Cho thuê xe
  {
    id: "cho-thue-xe-1",
    service_code: "cho-thue-xe",
    slug: generateSlug("Thuê xe 4 chỗ - Toyota Vios 2022") + "-cho-thue-xe-1",
    title: "Thuê xe 4 chỗ - Toyota Vios 2022",
    title_en: "4-Seater Car Rental - Toyota Vios 2022",
    title_zh: "4座汽车租赁 - 丰田威驰2022",
    keywords: "thuê xe 4 chỗ, thuê xe gia đình, thuê xe tiết kiệm nhiên liệu, thuê xe tự lái, thuê xe có tài xế",
    keywords_en: "4-seater car rental, family car rental, fuel-efficient car rental, self-drive car rental, chauffeur car rental",
    keywords_zh: "4座汽车租赁，家庭用车租赁，节能汽车租赁，自驾车租赁，带司机汽车租赁",
    excerpt: "Xe mới 2022, tiết kiệm nhiên liệu, nội thất rộng rãi, phù hợp gia đình.",
    excerpt_en: "New 2022 model, fuel-efficient, spacious interior, suitable for families.",
    excerpt_zh: "2022年新款，节能，宽敞的内饰，适合家庭使用。",
    content_en: `<h2>4-Seater Car Rental - Toyota Vios 2022</h2><p>New 2022 model, fuel-efficient, spacious interior, suitable for families.</p>`,
    content_zh: `<h2>4座汽车租赁 - 丰田威驰2022</h2><p>2022年新款，节能，宽敞的内饰，适合家庭使用。</p>`,
    price: "800,000đ/ngày",
    featured: 1,
    active_home: 0,
    specifications_seats: 4,
    specifications_fuelType: "xăng",
    specifications_transmission: "AT",
    specifications_year: 2022,
    specifications_color: "Trắng",
    specifications_driver: "Tự lái hoặc có tài xế",
    specifications_insurance: "Bảo hiểm vật chất xe, bảo hiểm dân sự",
    specifications_airConditioner: true,
    specifications_gps: true,
    specifications_bluetooth: true,
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/cho-thue-xe-1.jpg`])
  },
  {
    id: "cho-thue-xe-2",
    service_code: "cho-thue-xe",
    slug: generateSlug("Thuê xe 7 chỗ - Innova 2021") + "-cho-thue-xe-2",
    title: "Thuê xe 7 chỗ - Innova 2021",
    title_en: "7-Seater Car Rental - Innova 2021",
    title_zh: "7座汽车租赁 - Innova 2021",
    keywords: "thuê xe 7 chỗ, thuê xe gia đình, thuê xe du lịch, thuê xe rộng rãi, thuê xe có tài xế",
    keywords_en: "7-seater car rental, family car rental, travel car rental, spacious car rental, chauffeur car rental",
    keywords_zh: "7座汽车租赁，家庭用车租赁，旅游用车租赁，宽敞汽车租赁，带司机汽车租赁",
    excerpt: "Phù hợp đi gia đình, du lịch, xe sạch sẽ, lái êm.",
    excerpt_en: "Suitable for family trips, clean car, smooth driving.",
    excerpt_zh: "适合家庭出游，车内干净，驾驶平稳。",
    content: `<h2>Thuê xe 7 chỗ - Innova 2021</h2><p>Phù hợp đi gia đình, du lịch, xe sạch sẽ, lái êm.</p>`,
    content_en: `<h2>7-Seater Car Rental - Innova 2021</h2><p>Suitable for family trips, clean car, smooth driving.</p>`,
    content_zh: `<h2>7座汽车租赁 - Innova 2021</h2><p>适合家庭出游，车内干净，驾驶平稳。</p>`,
    price: "1,200,000đ/ngày",
    featured: 0,
    active_home: 0,
    specifications_seats: 7,
    specifications_fuelType: "xăng",
    specifications_transmission: "AT",
    specifications_year: 2021,
    specifications_color: "Bạc",
    specifications_driver: "Có tài xế",
    specifications_insurance: "Bảo hiểm vật chất xe, bảo hiểm dân sự",
    specifications_airConditioner: true,
    specifications_gps: true,
    specifications_bluetooth: true,
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/cho-thue-xe-2.jpg`])
  },
  
  // Booking online
  {
    id: "booking-online-1",
    service_code: "booking-online",
    slug: generateSlug("Đặt lịch khám Da liễu - BS. An") + "-booking-online-1",
    title: "Đặt lịch khám Da liễu - BS. An",
    title_en: "Book Dermatology Appointment - Dr. An",
    title_zh: "预约皮肤科 - 安医生",
    keywords: "đặt lịch khám da liễu, bác sĩ da liễu, tư vấn chăm sóc da, điều trị mụn, điều trị nám",
    keywords_en: "book dermatology appointment, dermatologist, skin care consultation, acne treatment, melasma treatment",
    keywords_zh: "预约皮肤科，皮肤科医生，护肤咨询，痤疮治疗，黄褐斑治疗",
    excerpt: "Chuyên điều trị mụn, nám, tàn nhang, tư vấn chăm sóc da.",
    excerpt_en: "Specializing in acne, melasma, freckles treatment, skin care consultation.",
    excerpt_zh: "专治痤疮、黄褐斑、雀斑，提供护肤咨询。",
    content: `<h2>Đặt lịch khám Da liễu - BS. An</h2><p>Chuyên điều trị mụn, nám, tàn nhang, tư vấn chăm sóc da.</p>`,
    content_en: `<h2>Book Dermatology Appointment - Dr. An</h2><p>Specializing in acne, melasma, freckles treatment, skin care consultation.</p>`,
    content_zh: `<h2>预约皮肤科 - 安医生</h2><p>专治痤疮、黄褐斑、雀斑，提供护肤咨询。</p>`,
    price: "150,000đ",
    featured: 1,
    active_home: 0,
    specifications_location: "Q.3, TP.HCM",
    specifications_duration: "30 phút",
    specifications_doctor: "BS. An",
    specifications_specialty: "Da liễu",
    specifications_contact: "0909.123.456",
    specifications_room: "Phòng 203",
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/booking-online-1.jpg`])
  },
  {
    id: "booking-online-2",
    service_code: "booking-online",
    slug: generateSlug("Đặt lịch Spa - Chăm sóc da chuyên sâu") + "-booking-online-2",
    title: "Đặt lịch Spa - Chăm sóc da chuyên sâu",
    title_en: "Book Spa Appointment - Advanced Skin Care",
    title_zh: "预约水疗 - 深层护肤",
    keywords: "đặt lịch spa, chăm sóc da chuyên sâu, massage thư giãn, đắp mặt nạ, tái tạo da",
    keywords_en: "book spa appointment, advanced skin care, relaxing massage, facial mask, skin rejuvenation",
    keywords_zh: "预约水疗，深层护肤，放松按摩，面膜，皮肤再生",
    excerpt: "Làm sạch sâu, massage thư giãn, đắp mặt nạ, tái tạo da.",
    excerpt_en: "Deep cleansing, relaxing massage, facial mask, skin rejuvenation.",
    excerpt_zh: "深层清洁，放松按摩，面膜，皮肤再生。",
    content: `<h2>Đặt lịch Spa - Chăm sóc da chuyên sâu</h2><p>Làm sạch sâu, massage thư giãn, đắp mặt nạ, tái tạo da.</p>`,
    content_en: `<h2>Book Spa Appointment - Advanced Skin Care</h2><p>Deep cleansing, relaxing massage, facial mask, skin rejuvenation.</p>`,
    content_zh: `<h2>预约水疗 - 深层护肤</h2><p>深层清洁，放松按摩，面膜，皮肤再生。</p>`,
    price: "450,000đ",
    featured: 0,
    active_home: 0,
    specifications_location: "Q.1, TP.HCM",
    specifications_duration: "60 phút",
    specifications_service: "Chăm sóc da chuyên sâu",
    specifications_contact: "0908.888.888",
    specifications_room: "Spa VIP 2",
    images: JSON.stringify([`https://www.${DOMAIN}/app_images/wuweb/booking-online-2.jpg`])
  }
];

// Main execution
async function seedData() {
  console.log('🌱 SEED DATA SCRIPT - Version 2.0 (Multi-language: VI/EN/ZH)');
  console.log('='.repeat(80));
  console.log('Script này sẽ tạo dữ liệu mẫu với 3 ngôn ngữ cho:');
  console.log('1. web_services: 5 danh mục dịch vụ (VI/EN/ZH)');
  console.log('2. web_service_detail: 10+ bài viết chi tiết (VI/EN/ZH)');
  console.log('\n⏳ Bắt đầu sau 2 giây...\n');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const now = Date.now();
  let successCount = 0;
  let errorCount = 0;
  
  try {
    // Step 1: Create service categories with multi-language support
    console.log('\n📋 Bước 1: Tạo danh mục dịch vụ (web_services) - 3 ngôn ngữ...\n');
    
    for (const service of serviceCategories) {
      try {
        const payload = {
          app_id: APP_ID,
          obj_name: "web_services",
          command: "create",
          obj_update: {
            ...service,
            app_id: APP_ID,
            domain: DOMAIN,
            status: "active",
            created_at: now,
            updated_at: now
          }
        };
        
        const result = await csm_obj_updates(payload);
        if (result.success) {
          console.log(`  ✅ Created (VI/EN/ZH): ${service.id}`);
          successCount++;
        } else {
          console.log(`  ⚠️ ${service.id}: ${result.message || 'Có thể đã tồn tại'}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`  ❌ Error creating ${service.id}: ${error.message}`);
        errorCount++;
      }
    }
    
    // Step 2: Create service details with SEO meta for 3 languages
    console.log('\n📝 Bước 2: Tạo chi tiết bài viết (web_service_detail) - 3 ngôn ngữ...\n');
    
    for (const detail of serviceDetails) {
      try {
        // Generate SEO meta cho từng bài với 3 ngôn ngữ (VI/EN/ZH)
        const serviceCode = detail.serviceType || detail.service_code || '';
        const category = serviceCategories.find(s => s.service_code === serviceCode);

        const payload = {
          app_id: APP_ID,
          obj_name: "web_service_detail",
          command: "create",
          obj_update: {
            ...detail,
            app_id: APP_ID,
            domain: DOMAIN,
            category: category?.category || "",
            service_type: serviceCode,
            thumbnail: detail.images ? JSON.parse(detail.images)[0] : "",
            cover: detail.images ? JSON.parse(detail.images)[0] : "",
            tags: JSON.stringify([serviceCode]),
            publish_date: new Date().toISOString(),
            status: "active",
            created_at: now,
            updated_at: now
          }
        };
        
        const result = await csm_obj_updates(payload);
        if (result.success) {
          console.log(`  ✅ Created (VI/EN/ZH): ${detail.id}`);
          successCount++;
        } else {
          console.log(`  ⚠️ ${detail.id}: ${result.message || 'Có thể đã tồn tại'}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`  ❌ Error creating ${detail.id}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 Hoàn thành seed data với 3 ngôn ngữ (VI/EN/ZH)!');
    console.log('='.repeat(80));
    console.log(`✅ Thành công: ${successCount} records`);
    console.log(`❌ Lỗi: ${errorCount} records`);
    console.log('\n💡 Kiểm tra kết quả theo ngôn ngữ:');
    console.log(`   🇻🇳 Tiếng Việt: https://www.${DOMAIN}/`);
    console.log(`   🇬🇧 English: https://www.${DOMAIN}/en/`);
    console.log(`   🇨🇳 中文: https://www.${DOMAIN}/zh/`);
    console.log(`\n   📊 Thống kê:`);
    console.log(`   - Categories: ${serviceCategories.length} (mỗi category có 3 ngôn ngữ)`);
    console.log(`   - Articles: ${serviceDetails.length} (mỗi bài có 3 ngôn ngữ)`);
    console.log(`   - Featured: ${serviceDetails.filter(d => d.featured).length} bài`);
    console.log(`   - Homepage: ${serviceDetails.filter(d => d.active_home).length} bài`);
    
  } catch (error) {
    console.error('\n❌ Lỗi seed data:', error.message);
  }
}

// Run
seedData().catch(error => {
  console.error('❌ Fatal error:', error);
  // process.exit(1);
});