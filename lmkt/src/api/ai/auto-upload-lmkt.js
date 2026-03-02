/**
 * AUTO_CODE - Multi-Domain Content Management (Chống Chất AI)
 * 
 * ========== GIẢI THÍCH TOÀN HỆ THỐNG ==========
 * 
 * FILE: auto-upload-lmkt.js
 * MỤC ĐÍCH: Quản lý nội dung cho 2 domain khác nhau:
 *   1. LMKT (h-holding.vn): Bất Động Sản - 6 Dự Án
 *   2. Phanmemmottrieu.net: 5 Lĩnh Vực Kinh Doanh
 */

// ========== PROTECTION AGAINST DOUBLE-LOAD ==========
// Note: Constants will be redeclared but that's OK in non-strict mode
if (typeof window !== 'undefined' && window.__AUTO_UPLOAD_LMKT_LOADED__) {
  console.warn('⚠️ auto-upload-lmkt.js đã được load rồi, bỏ qua re-initialization');
}
if (typeof window !== 'undefined') {
  window.__AUTO_UPLOAD_LMKT_LOADED__ = true;
}

// ========== CRYPTO HELPERS - ENCRYPT/DECRYPT HTML CONTENT ==========
/**
 * Lấy crypto functions từ window (exposed bởi AutoSetup.tsx)
 * Dùng để encrypt HTML content trước khi lưu database
 * 
 * Flow:
 * 1. AI tạo content (HTML plain)
 * 2. encryptHtmlContent() → mã hóa
 * 3. Lưu vào database (encrypted)
 * 4. Khi load lại: decryptHtmlContent() → hiển thị
 */
const getCryptoFunctions = () => {
  if (typeof window !== 'undefined' && window.csmCrypto) {
    return {
      encrypt: window.csmCrypto.encrypt,
      decrypt: window.csmCrypto.decrypt
    };
  }
  console.warn('⚠️ window.csmCrypto not found, crypto functions disabled');
  return {
    encrypt: (text) => text, // fallback: no encryption
    decrypt: (text) => text  // fallback: no decryption
  };
};

/**
 * Encrypt HTML content fields trước khi lưu database
 * @param {Object} data - Object chứa content fields
 * @returns {Object} - Object với content đã encrypt
 */
const encryptHtmlContent = (data) => {
  if (!data) return data;
  
  const crypto = getCryptoFunctions();
  const encrypted = { ...data };
  
  // Encrypt 3 content fields (HTML)
  const htmlFields = ['content', 'content_en', 'content_zh'];
  htmlFields.forEach(field => {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      try {
        encrypted[field] = crypto.encrypt(encrypted[field]);
        console.log(`✅ Encrypted ${field} (${encrypted[field].length} chars)`);
      } catch (e) {
        console.error(`❌ Failed to encrypt ${field}:`, e);
      }
    }
  });
  
  return encrypted;
};

/**
 * Decrypt HTML content fields khi load từ database
 * @param {Object} data - Object chứa encrypted content
 * @returns {Object} - Object với content đã decrypt
 */
const decryptHtmlContent = (data) => {
  if (!data) return data;
  
  const crypto = getCryptoFunctions();
  const decrypted = { ...data };
  
  // Decrypt 3 content fields
  const htmlFields = ['content', 'content_en', 'content_zh'];
  htmlFields.forEach(field => {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = crypto.decrypt(decrypted[field]);
        console.log(`✅ Decrypted ${field} (${decrypted[field].length} chars)`);
      } catch (e) {
        console.error(`❌ Failed to decrypt ${field}:`, e);
        // Keep original if decrypt fails (might be plain text)
      }
    }
  });
  
  return decrypted;
};

/**
 * ========== CẤU TRÚC CHÍNH ==========
 * 
 * 1. DOMAIN_OPTIONS: Cấu hình domain
 *    - phanmemmottrieu.net → app_id: "wuweb" (Phần mềm + 4 lĩnh vực khác)
 *    - h-holding.vn → app_id: "lmkt" (Bất động sản - 6 dự án)
 *    - domain: TOÀN BỘ danh sách (VD: "h-holding.vn,h-holding.com.vn,localhost:3333")
 * 
 * 2. INDUSTRY_TYPES: Config cho từng lĩnh vực phanmemmottrieu
 *    - bat-dong-san: Bất Động Sản
 *    - lam-dep-my-pham: Mỹ Phẩm - Làm Đẹp
 *    - booking-online: Đặt Lịch Online
 *    - phan-mem: Phần Mềm
 *    - cho-thue-xe: Cho Thuê Xe
 *    
 *    Mỗi lĩnh vực có:
 *    - prompt_role: Vai trò AI sẽ đóng (vd: "chuyên gia BĐS")
 *    - prompt_style: Phong cách viết (vd: "Kể chuyện về cảm xúc")
 *    - prompt_focus: Điều nhấn mạnh (vd: "Cảm giác sáng thức dậy")
 *    - prompt_avoid: Tránh gì (vd: "Tránh cấu trúc cũ kỹ")
 * 
 * 3. LMKT_PROJECT_DEFS: 6 Dự án BĐS cho LMKT
 *    - destino-centro, the-win-city, king-hill-residences, 
 *    - kiều-by-kita, ansana-kita, d-homme-quan-6
 * 
 * ========== QUY TRÌNH HOẠT ĐỘNG ==========
 * 
 * BƯỚC 1: User vào admin → Chọn Domain
 *         ↓ Script kiểm tra: LMKT hay Phanmemmottrieu?
 *
 * BƯỚC 2: Chọn Lĩnh Vực/Dự Án
 *         ↓ Hiển thị config (vai trò, phong cách, nhấn mạnh)
 *
 * BƯỚC 3: Nhập Hướng Dẫn Custom (tuỳ chỉnh)
 *         ↓ Kết hợp với config mặc định
 *
 * BƯỚC 4: Nhấn "Tạo Content"
 *         ↓ Script build prompt với 12 fields
 *         ↓ Gọi AI (generateSeoContentWithPrompt)
 *         ↓ AI trả về JSON với 12 fields (4 nhóm x 3 ngôn ngữ):
 *           • content, content_en, content_zh (HTML 1500-2000 từ)
 *           • attributes_title, attributes_title_en, attributes_title_zh (60-80 ký tự)
 *           • attributes_description, ..._en, ..._zh (150-160 ký tự)
 *           • attributes_keywords, ..._en, ..._zh (5-8 từ khóa)
 *
 * BƯỚC 5: Tự động lưu Database
 *         ↓ parseAIResponse: Validate & extract 12 fields
 *         ↓ updatePayload: Gửi đầy đủ 12 fields + metadata
 *         ↓ Cập nhật vào bảng web_services
 *         ↓ Hiển thị kết quả
 * 
 * ========== HELPER FUNCTIONS ==========
 * 
 * getCategoriesForDomain(domainKey)
 *   → Trả về danh sách lĩnh vực/dự án cho domain
 *   → LMKT: 6 dự án BĐS
 *   → Phanmemmottrieu: 5 lĩnh vực khác nhau
 *
 * buildCategoryPrompt(categoryData, userPrompt, domainKey)
 *   → Xây dựng prompt hoàn chỉnh cho AI
 *   → Kết hợp: config (vai trò + phong cách) + user custom prompt
 *   → Yêu cầu AI trả về đầy đủ 12 fields
 *
 * parseAIResponse(rawResponse)
 *   → Parse & validate AI response
 *   → Kiểm tra 12 fields tồn tại (warning nếu thiếu)
 *   → Trả về object với đầy đủ 12 fields
 *
 * getCategoryContentPrompt(categoryName, description, prompt)
 *   → Tạo prompt chi tiết cho việc tạo content landing page
 *   → Yêu cầu AI output 12 fields trong JSON format
 * 
 * ========== CÁCH DÙNG ==========
 * 
 * 1. Copy file này vào p_code của sys_autos (Admin)
 * 2. Chọn Domain (LMKT hoặc Phanmemmottrieu)
 * 3. Chọn Lĩnh Vực/Dự Án
 * 4. Nhập hướng dẫn nội dung (tùy chỉnh)
 * 5. Nhấn "Tạo Content"
 * 6. AI tự động tạo & lưu vào database (không cần copy thủ công)
 * 
 * ========== CÔNG NGHỆ ==========
 * 
 * - AI Backend: window.csmAI.generateSeoContentWithPrompt()
 * - Database: window.csmApi.updateTableData()
 * - Target Table: web_services
 * - AI Output: 12 fields (4 nhóm x 3 ngôn ngữ)
 * - Format: HTML (không Markdown)
 * 
 * ========== CẤU TRÚC DATABASE UPDATE ==========
 * 
 * Table: web_services
 * Primary Keys: ["slug", "domain", "status"]
 * 
 * Payload gửi lên:
 * {
 *   app_id: "wuweb" | "lmkt",
 *   obj_name: "web_services",
 *   command: "update",
 *   pk_fields: ["slug", "domain", "status"],
 *   obj_update: {
 *     slug: "...", 
 *     domain: "full,domain,list",
 *     status: "active",
 *     
 *     // 12 FIELDS từ AI
 *     content, content_en, content_zh,
 *     attributes_title, attributes_title_en, attributes_title_zh,
 *     attributes_description, attributes_description_en, attributes_description_zh,
 *     attributes_keywords, attributes_keywords_en, attributes_keywords_zh,
 *     
 *     updated_at: timestamp
 *   }
 * }
 * 
 * ========== LƯU Ý QUAN TRỌNG ==========
 * 
 * ⚠️ Cấu trúc bảng web_services phải có đầy đủ:
 *    - content, content_en, content_zh (LONGTEXT)
 *    - attributes_title, attributes_title_en, attributes_title_zh (VARCHAR)
 *    - attributes_description, ..._en, ..._zh (TEXT)
 *    - attributes_keywords, ..._en, ..._zh (TEXT)
 * 
 * ⚠️ Domain phải là TOÀN BỘ danh sách:
 *    - LMKT: "h-holding.vn,h-holding.com.vn,localhost:3333"
 *    - Phanmemmottrieu: "phanmemmottrieu.net,localhost:3333"
 * 
 * ⚠️ Mỗi domain phải có app_id đúng:
 *    - phanmemmottrieu.net → app_id: "wuweb"
 *    - h-holding.vn → app_id: "lmkt"
 * 
 * ⚠️ AI output phải là JSON hợp lệ (không có markdown wrapper)
 * ⚠️ Content phải là HTML (hỗ trợ thẻ: h3, h4, p, ul, li, strong, em)
 *
 * Hướng Dẫn:
 * 1. Copy code này vào p_code của sys_autos
 * 2. Chọn Domain → Chọn Lĩnh vực → Upload JSON/Tạo bài
 * 3. Script sử dụng Prompt "Chống Chất AI" để tạo nội dung tự nhiên
 */

// ===== CONFIG =====
/**
 * DOMAIN_OPTIONS: Cấu hình cho 2 domain chính
 * 
 * Cách hoạt động:
 * - value: Danh sách domain thực tế (ngăn cách bằng dấu phẩy)
 * - label: Tên hiển thị trong UI dropdown
 * - app_id: ID của app trong database (dùng để lấy dữ liệu đúng)
 * 
 * Ví dụ:
 *   LMKT → h-holding.vn → app_id: "lmkt" → Lấy data từ app LMKT
 *   Phanmemmottrieu → phanmemmottrieu.net → app_id: "wuweb" → Lấy data từ app Phanmemmottrieu
 */
const DEFAULT_UPLOAD_ENDPOINT = "/upload.shtml";
const UPLOAD_ENDPOINT_COOLDOWN_MS = 2 * 60 * 1000;
const uploadEndpointHealth = {};

function markUploadEndpointFailure(endpoint, status = 0) {
  if (!endpoint) return;
  uploadEndpointHealth[endpoint] = {
    failedAt: Date.now(),
    status
  };
}

function isUploadEndpointCoolingDown(endpoint) {
  if (!endpoint) return false;
  const info = uploadEndpointHealth[endpoint];
  if (!info || !info.failedAt) return false;
  return (Date.now() - info.failedAt) < UPLOAD_ENDPOINT_COOLDOWN_MS;
}

function clearUploadEndpointHealth(endpoint) {
  if (!endpoint) return;
  delete uploadEndpointHealth[endpoint];
}

function getCandidateUploadEndpoints(ctx = {}) {
  const candidates = [];

  // 1) Relative endpoint (same origin)
  candidates.push(DEFAULT_UPLOAD_ENDPOINT);

  // 2) From current origin
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      candidates.push(`${window.location.origin}${DEFAULT_UPLOAD_ENDPOINT}`);
    }
  } catch (e) {
    // ignore
  }

  // 3) From apiBase origin
  try {
    if (ctx.apiBase && /^https?:\/\//i.test(ctx.apiBase)) {
      const apiOrigin = new URL(ctx.apiBase).origin;
      candidates.push(`${apiOrigin}${DEFAULT_UPLOAD_ENDPOINT}`);
    }
  } catch (e) {
    // ignore invalid apiBase URL
  }

  // 4) From configured business domains
  const domains = (ctx.domain || "")
    .split(",")
    .map(d => (d || "").trim())
    .filter(d => d && !d.includes("localhost") && !d.includes("127.0.0.1"));

  domains.forEach(domain => {
    candidates.push(`https://${domain}${DEFAULT_UPLOAD_ENDPOINT}`);
    if (!domain.startsWith("www.")) {
      candidates.push(`https://www.${domain}${DEFAULT_UPLOAD_ENDPOINT}`);
    }
  });

  return Array.from(new Set(candidates));
}

// Domain Options
const DOMAIN_OPTIONS = {
  phanmemmottrieu: {
    value: "csmbridge.net,phanmemmottrieu.net,localhost:3333",
    label: "Phần Mềm Một Triệu (Multi-Industry)",
    app_id: "wuweb"
  },
  lmkt: {
    value: "h-holding.vn,h-holding.com.vn,localhost:3333",
    label: "LMKT - H-Holding (Real Estate Only)",
    app_id: "lmkt"
  }
};

/**
 * INDUSTRY_TYPES: Cấu hình cho 5 lĩnh vực của phanmemmottrieu.net
 * 
 * Mỗi lĩnh vực có:
 * - name, name_en, name_zh: Tên 3 ngôn ngữ
 * - prompt_role: Vai trò AI sẽ đóng khi viết (VD: "chuyên gia BĐS")
 * - prompt_style: Phong cách viết (VD: "Kể chuyện về cảm xúc")
 * - prompt_focus: Điều chính cần nhấn mạnh (VD: "Cảm giác sáng thức dậy")
 * - prompt_avoid: Những điều tuyệt đối tránh (VD: "Tránh cấu trúc cũ kỹ")
 * - color: Màu sắc trong giao diện
 * 
 * Cách dùng:
 *   Khi user chọn lĩnh vực → Script lấy config này
 *   → Kết hợp với user prompt → Gửi cho AI
 *   → AI viết content theo hướng dẫn này
 */
// Industry Types cho phanmemmottrieu.net
const INDUSTRY_TYPES = {
  "bat-dong-san": {
    name: "Bất Động Sản",
    name_en: "Real Estate",
    name_zh: "房地产",
    category: "Bất Động Sản",
    category_en: "Real Estate",
    category_zh: "房地产",
    image: "https://www.csmbridge.net/app_images/services/bat-dong-san-og.jpg",
    attributes_icon: "HomeOutlined",
    attributes_color: "#13c2c2",
    attributes_priority: 2,
    attributes_title: "Bất Động Sản - Mua Bán & Cho Thuê",
    attributes_title_en: "Real Estate - Buy, Sell & Rent",
    attributes_title_zh: "房地产 - 买卖与出租",
    attributes_description: "Tin tức bất động sản, dự án, căn hộ, nhà đất.",
    attributes_description_en: "Real estate news, projects, apartments, land.",
    attributes_description_zh: "房地产新闻、项目、公寓、土地。",
    attributes_keywords: "tin tức bất động sản, dự án, căn hộ, nhà đất",
    attributes_keywords_en: "real estate news, projects, apartments, land",
    attributes_keywords_zh: "房地产新闻、项目、公寓、土地",
    prompt_role: "chuyên gia môi giới bất động sản có tâm",
    prompt_style: "Kể chuyện về cảm xúc và tiềm năng đầu tư",
    prompt_avoid: "Tránh cấu trúc giới thiệu vị trí -> tiện ích -> mặt bằng cũ kỹ",
    prompt_focus: "Kể về cảm giác mỗi sáng thức dậy tại đây hoặc bài toán dòng tiền thực tế cho nhà đầu tư",
    title_requirement: "⚠️ TIÊU ĐỀ PHẢI LỒNG GHÉP TỰ NHIÊN ý nghĩa BÁN hoặc CHO THUÊ (dùng từ thường, không viết hoa toàn bộ). Biến thể đa dạng: 'bán', 'cần bán', 'chủ nhà bán', 'sang nhượng', 'chuyển nhượng', 'cho thuê', 'cần cho thuê', 'tìm người thuê', 'cho thuê dài hạn'",
    color: "#13c2c2"
  },
  "lam-dep-my-pham": {
    name: "Mỹ Phẩm - Làm Đẹp",
    name_en: "Beauty & Cosmetics",
    name_zh: "美容化妆品",
    category: "Mỹ Phẩm & Làm Đẹp",
    category_en: "Beauty & Cosmetics",
    category_zh: "美容化妆品",
    image: "https://www.csmbridge.net/app_images/services/lam-dep-my-pham-og.jpg",
    attributes_icon: "SkinOutlined",
    attributes_color: "#eb2f96",
    attributes_priority: 3,
    attributes_title: "Mỹ Phẩm & Làm Đẹp - Spa & Thẩm Mỹ",
    attributes_title_en: "Beauty & Cosmetics - Spa & Aesthetics",
    attributes_title_zh: "美容化妆品 - 水疗与美容",
    attributes_description: "Xu hướng làm đẹp, review mỹ phẩm, dịch vụ spa.",
    attributes_description_en: "Beauty trends, cosmetics reviews, spa services.",
    attributes_description_zh: "美容趋势、化妆品评论、水疗服务。",
    attributes_keywords: "xu hướng làm đẹp, review mỹ phẩm, dịch vụ spa",
    attributes_keywords_en: "beauty trends, cosmetics reviews, spa services",
    attributes_keywords_zh: "美容趋势、化妆品评论、水疗服务",
    prompt_role: "Beauty Blogger đang tâm sự với bạn thân",
    prompt_style: "Mô tả chi tiết trải nghiệm giác quan",
    prompt_avoid: "Tuyệt đối không dùng các từ quảng cáo 'thần thánh', 'tuyệt vời'",
    prompt_focus: "Mô tả chi tiết kết cấu (texture), mùi hương và cảm giác trên da sau 5 phút sử dụng",
    color: "#eb2f96"
  },
  "booking-online": {
    name: "Đặt Lịch Online",
    name_en: "Online Booking",
    name_zh: "在线预订",
    category: "Đặt Lịch Online",
    category_en: "Online Booking",
    category_zh: "在线预订",
    image: "https://www.csmbridge.net/app_images/services/booking-online-og.jpg",
    attributes_icon: "CalendarOutlined",
    attributes_color: "#faad14",
    attributes_priority: 5,
    attributes_title: "Đặt Lịch Online - Booking Dịch Vụ",
    attributes_title_en: "Online Booking - Service Reservation",
    attributes_title_zh: "在线预订 - 服务预约",
    attributes_description: "Đặt lịch: khám bác sĩ, spa, salon, nhà hàng.",
    attributes_description_en: "Book: doctor appointments, spa, salon, restaurants.",
    attributes_description_zh: "预订：医生预约、水疗、沙龙、餐厅。",
    attributes_keywords: "đặt lịch, khám bác sĩ, spa, salon, nhà hàng",
    attributes_keywords_en: "booking, doctor appointments, spa, salon, restaurants",
    attributes_keywords_zh: "预约，医生预约，水疗，沙龙，餐厅",
    prompt_role: "chuyên viên tư vấn dịch vụ thân thiện",
    prompt_style: "Giải quyết nỗi đau của khách hàng",
    prompt_avoid: "Không spam từ khóa, không dùng ngôn ngữ cứng nhắc",
    prompt_focus: "Nhấn mạnh sự tiện lợi, tiết kiệm thời gian, trải nghiệm dễ dàng",
    color: "#faad14"
  },
  "phan-mem": {
    name: "Phần Mềm",
    name_en: "Software",
    name_zh: "软件",
    category: "Phần Mềm",
    category_en: "Software",
    category_zh: "软件",
    image: "https://www.csmbridge.net/app_images/services/phan-mem-og.jpg",
    attributes_icon: "CodeOutlined",
    attributes_color: "#1890ff",
    attributes_priority: 1,
    attributes_title: "Phần Mềm - Giải Pháp Công Nghệ",
    attributes_title_en: "Software & Technology Solutions",
    attributes_title_zh: "软件与技术解决方案",
    attributes_description: "Giải pháp phần mềm, ứng dụng quản lý, tự động hóa doanh nghiệp.",
    attributes_description_en: "Software solutions, management apps, business automation.",
    attributes_description_zh: "软件解决方案、管理应用程序、企业自动化。",
    attributes_keywords: "phần mềm, giải pháp công nghệ, ứng dụng quản lý, tự động hóa doanh nghiệp",
    attributes_keywords_en: "software, technology solutions, management apps, business automation",
    attributes_keywords_zh: "软件, 技术解决方案, 管理应用程序, 企业自动化",
    prompt_role: "chuyên gia công nghệ giải thích đơn giản",
    prompt_style: "So sánh trước - sau khi dùng phần mềm",
    prompt_avoid: "Tránh thuật ngữ kỹ thuật khó hiểu",
    prompt_focus: "Tập trung vào lợi ích cụ thể, tính năng giải quyết vấn đề thực tế",
    color: "#1890ff"
  },
  "cho-thue-xe": {
    name: "Cho Thuê Xe 4-7 Chỗ",
    name_en: "Car Rental",
    name_zh: "租车服务",
    category: "Cho Thuê Xe 4-7 Chỗ",
    category_en: "Car Rental",
    category_zh: "租车服务",
    image: "https://www.csmbridge.net/app_images/services/cho-thue-xe-og.jpg",
    attributes_icon: "CarOutlined",
    attributes_color: "#faad14",
    attributes_priority: 4,
    attributes_title: "Cho Thuê Xe 4-7 Chỗ - Dịch Vụ Chuyên Nghiệp",
    attributes_title_en: "Car Rental - Professional Service",
    attributes_title_zh: "租车服务 - 专业服务",
    attributes_description: "Cho thuê xe sạch sẽ, tài xế uy tín, an toàn.",
    attributes_description_en: "Rental cars, professional drivers, safe service.",
    attributes_description_zh: "租赁汽车、专业司机、安全服务。",
    attributes_keywords: "cho thuê xe, dịch vụ chuyên nghiệp, tài xế, an toàn",
    attributes_keywords_en: "car rental, professional service, drivers, safety",
    attributes_keywords_zh: "租车、专业服务、司机、安全",
    prompt_role: "người cho thuê xe uy tín, chuyên nghiệp",
    prompt_style: "Bắt đầu từ nỗi khổ của khách hàng",
    prompt_avoid: "Không chỉ nói về đời xe, giá rẻ",
    prompt_focus: "Nhấn mạnh vào sự sạch sẽ của xe và tính cách niềm nở của tài xế, sự an toàn",
    color: "#faad14"
  }
};

// LMKT Contact
const LMKT_CONTACT_NAME = "Phòng Kinh Doanh";
const LMKT_CONTACT_PHONE = "0909879885";

// Article History
const ARTICLE_HISTORY_KEY = "multi_domain_article_history";
const MAX_HISTORY_SIZE = 50;

// Featured Image History
const FEATURED_IMAGE_HISTORY_KEY = "featured_image_history";
const MAX_IMAGE_HISTORY = 100;

// Processing Lock
let isProcessing = false;

// Auto Mode Flag - Khi true, tự động xác nhận confirm() để chạy auto
let isZaloAutoMode = false;

// ===== BUYER PERSONAS V2 - XÁC ĐỊNH NGƯỜI ĐỌC =====
const BUYER_PERSONAS_V2 = {
  "investor": {
    label: "Nhà Đầu Tư Kinh Nghiệm",
    age_range: "35-50 tuổi",
    mindset: "Tôi cần dòng tiền ổn định, ROI cao. Tôi không quan tâm view hay tiện ích, tôi quan tâm lãi suất & xu hướng thị trường.",
    content_traits: ["Phân tích chi tiết", "Con số cụ thể", "Dự báo", "So sánh", "Lịch sử giá"],
    content_angle: "Phân tích đầu tư - ROI, dòng tiền, so sánh, dự báo thị trường"
  },
  "family": {
    label: "Gia Đình Trẻ (Cặp Vợ Chồng + Con Em)",
    age_range: "25-40 tuổi",
    mindset: "Tôi cần một hốc tổ ấm cho gia đình. Tôi cần an toàn, yên tĩnh, gần trường tốt.",
    content_traits: ["Case study gia đình", "Hình ảnh sinh động", "Chi tiết đời sống", "Cảm xúc", "An ninh & giáo dục"],
    content_angle: "Câu chuyện gia đình - an ninh, tiện ích, giáo dục, cảm xúc"
  },
  "local_resident": {
    label: "Cư Dân Địa Phương Đã Ở",
    age_range: "Bất kỳ",
    mindset: "Tôi đã sống ở đây, tôi biết khu này tốt hay xấu sao, tôi nói sự thật chứ không nghe quảng cáo.",
    content_traits: ["Chi tiết hàng xóm", "Điểm yếu thực tế", "Bài học kinh nghiệm", "Lời khuyên từ sống thực"],
    content_angle: "Tâm sự thực tế - điểm tốt & tệ, đời sống hàng ngày"
  },
  "business_owner": {
    label: "Chủ Doanh Nghiệp / Freelancer",
    age_range: "25-50 tuổi",
    mindset: "Tôi bận rộn, tôi muốn công nghệ/dịch vụ giải quyết vấn đề thực tế & tiết kiệm thời gian.",
    content_traits: ["Bài toán cụ thể", "ROI", "Ví dụ case study", "Hướng dẫn setup", "FAQ"],
    content_angle: "Giải pháp vấn đề - ROI, setup, case study"
  },
  "storyteller": {
    label: "Người Kể Chuyện / Content Creator",
    age_range: "20-35 tuổi",
    mindset: "Tôi yêu thích chia sẻ kinh nghiệm, tôi thích kết nối với cộng đồng, tôi muốn truyền cảm hứng cho người khác.",
    content_traits: ["Câu chuyện cá nhân", "Cảm xúc chân thực", "Bài học rút ra", "Liên kết với độc giả", "Gọi hành động"],
    content_angle: "Kể chuyện cá nhân - hành trình, thách thức, cảm xúc, kết quả"
  }
};

// ===== CONTENT PATTERNS V2 - LOẠI BÀI LINH HOẠT =====
const CONTENT_PATTERNS_V2 = {
  "investment_analysis": {
    name: "Investment Analysis (Phân tích đầu tư)",
    structure: ["Đặt câu hỏi/vấn đề", "Cung cấp dữ liệu", "So sánh cụ thể", "Dự báo & rủi ro", "Kết luận & đề xuất"],
    tone: "Chuyên sâu, có dữ liệu, tỉnh thức",
    total_length: "1500-2000 từ",
    targets: ["investor"]
  },
  "family_story": {
    name: "Family Story (Câu chuyện gia đình)",
    structure: ["Giới thiệu nhân vật", "Vấn đề/Nỗi đau", "Hành trình tìm kiếm", "Lựa chọn & Quyết định", "Kết quả & Cảm xúc", "Lời khuyên"],
    tone: "Chân thực, cảm xúc, đồng cảm",
    total_length: "1200-1500 từ",
    targets: ["family", "storyteller"]
  },
  "step_by_step_guide": {
    name: "Step-by-Step Guide (Hướng dẫn chi tiết)",
    structure: ["Vấn đề & Tại sao", "Bước 1", "Bước 2", "Bước 3", "Bước 4", "Bước 5", "Tránh sai lầm", "FAQ"],
    tone: "Thực dụng, dễ hiểu, có sáng kiến",
    total_length: "1800-2200 từ",
    targets: ["family", "business_owner"]
  },
  "quick_tips": {
    name: "Quick Tips / Hot Take (Mẹo nhanh)",
    structure: ["Câu hook", "Tip 1 + lý do", "Tip 2 + lý do", "Tip 3 + lý do", "Kết luận"],
    tone: "Trực tiếp, nhanh gọn, có ý kiến cá nhân",
    total_length: "800-1200 từ",
    targets: ["investor", "business_owner", "local_resident"]
  },
  "landing_page": {
    name: "Landing Page (Giới thiệu dịch vụ)",
    structure: ["Headline", "Introduction", "Key Benefits", "Features", "Social Proof", "CTA"],
    tone: "Thân thiện, tự nhiên, tập trung lợi ích",
    total_length: "1500-2000 từ",
    targets: ["family", "business_owner"]
  }
};

// ===== VOICE PATTERNS V2 - THAY THẾ AI PHRASES =====
const VOICE_PATTERNS_V2 = {
  "vị trí đắc địa": [
    "Gần ga metro, chỉ 5 phút đi bộ",
    "Đối diện công viên - tôi chạy bộ ở đó 5 năm, vừa sạch vừa yên tĩnh",
    "Lối đi làm từ đây: quốc lộ 1A 15 phút, phố Nhân Chính 25 phút (tránh kẹt xe)"
  ],
  "tiềm năng sinh lời": [
    "Nếu bạn mua 3 tỷ hôm nay, 3 năm sau bán được 4.2 tỷ (tăng 10%/năm)",
    "Giá thuê 25 triệu/tháng = 300 triệu/năm, hồi vốn trong 10 năm",
    "So sánh: chứng chỉ 3.5%/năm, bất động sản tăng 8-10%/năm - hiệu số 5-6%"
  ],
  "không chỉ... mà còn": [
    "Nó là căn hộ, đồng thời có sân vườn 50m2 - hiếm ở khu này",
    "Giá rẻ nhất trong các căn cùng diện tích, mà view còn tốt hơn",
    "Tiền HOA rẻ hơn (200k vs 300k), nhưng tiện ích không kém"
  ],
  "sở hữu vị trí vàng": [
    "Nếu bạn là nhân viên công sở 8-5, căn này dành cho bạn: gần công viên, gần siêu thị, gần trường",
    "Từ nhà: Saigon Pearl (2km), Bitexco (5km), Bến Thành (8km) - tùy mục đích"
  ],
  "là sự kết hợp hoàn hảo": [
    "Với ngân sách 3 tỷ, tôi đánh giá đây là lựa chọn tốt nhất (không hoàn hảo, nhưng tốt nhất)",
    "Nó không hoàn hảo - kẹt xe sáng, tiền HOA cao - nhưng nó OK cho gia đình trẻ"
  ],
  "mang lại trải nghiệm tuyệt vời": [
    "Sáng mở cửa nhìn công viên, bé chạy tung tăng ở phòng 60m2 - đó là trải nghiệm",
    "Con em đi bộ 5 phút đến trường, không phải thức sớm 6 sáng - đó là trải nghiệm"
  ],
  "vô cùng hiệu quả": [
    "Với phần mềm này, bạn tiết kiệm 2 tiếng/ngày = 40 tiếng/tháng = 12 triệu giá trị",
    "Một quán cafe dùng phần mềm này, từ 3 nhân viên bây giờ chỉ cần 2"
  ]
};

// ===== SELLING INTENT RULES V2 - WHY / WHEN / WHERE STRUCTURE =====
const SELLING_INTENT_RULES_V2 = {
  "title_explicit": {
    label: "Nêu Rõ Bán/Cho Thuê Ở Tiêu Đề",
    
    why: "Vì người đọc đang tìm kiếm cơ hội cụ thể để mua/thuê. Nêu rõ ở tiêu đề giúp họ hiểu ngay bài viết này có liên quan đến cơ hội bán/cho thuê của họ.",
    
    when: [
      "Bài viết so sánh 2-3 căn hộ (Destino vs The Win vs King Hill)",
      "Bài viết hướng dẫn cách mua nhà, chọn nhà (người cần biết: bán hay cho thuê)",
      "Bài viết là review chi tiết về 1 căn cụ thể",
      "Investor tìm kiếm cơ hội đầu tư (họ muốn biết ngay là bán hay cho thuê)",
      "Bài viết tập trung vào phân tích tài chính (ROI, lợi nhuận)"
    ],
    
    where: "Bạn ghi rõ ở phần ĐẦU TIÊN của tiêu đề hoặc ở vị trí dễ nhìn",
    
    style: "Dùng từ thường (không viết hoa), tự nhiên, có context/lý do",
    
    examples: [
      {
        scenario: "So sánh 2 dự án",
        correct: "Bán căn hộ Destino vs The Win City - Nên chọn cái nào? (Phân tích ROI)",
        wrong: "CÁC DỰ ÁN BẤT ĐỘNG SẢN TỐT NHẤT (quá chung chung, không nêu rõ bán/cho thuê)"
      },
      {
        scenario: "Review chi tiết 1 căn",
        correct: "Bán căn hộ Destino 85m2 - Sau 3 năm sở hữu, đây là lý do chúng tôi bán",
        wrong: "Căn hộ Destino: Giới thiệu chung (không nêu bán/cho thuê, quá mơ hồ)"
      },
      {
        scenario: "Hướng dẫn mua nhà",
        correct: "Mua nhà lần đầu ở Q7 - 5 sai lầm tôi gặp khi ký hợp đồng",
        wrong: "Hướng dẫn mua nhà (mơ hồ, không rõ là mua ở đâu)"
      },
      {
        scenario: "Cho thuê kinh doanh",
        correct: "Cho thuê shophouse Phú Mỹ Hưng - Kinh doanh cafe tối ưu (lãi suất 20%/năm)",
        wrong: "Cho Thuê Mặt Bằng Phú Mỹ Hưng (viết hoa quá, cứng nhắc)"
      }
    ]
  },

  "content_subtle": {
    label: "Lồng Ghép Tinh Tế Ý Nghĩa Bán/Cho Thuê (Trong Nội Dung)",
    
    why: "Vì bài viết tập trung vào chia sẻ kinh nghiệm, câu chuyện, lời khuyên - nêu rõ bán/cho thuê ở tiêu đề sẽ làm gián đoạn luồng câu chuyện. Lồng ghép tinh tế giúp độc giả tự khám phá được ý đó từ nội dung.",
    
    when: [
      "Bài kể chuyện gia đình (tôi sống ở Destino, rồi bán để nâng cấp)",
      "Bài tâm sự từ kinh nghiệm (tôi mua nhà sai cách, rồi bán lỗ)",
      "Bài lời khuyên từ người đã từng làm (tôi cho thuê căn hộ này, đây là 3 điều cần chú ý)",
      "Bài chia sẻ rút ra học được (sau 5 năm ở Destino, tôi nhận ra cái gì)",
      "Content hướng tới người dân thường (không phải investor chuyên nghiệp)"
    ],
    
    where: "Tiêu đề NÊU CONTEXT/LÝ DO (tại sao bán, tại sao cho thuê), KHÔNG phải nêu rõ 'bán' hoặc 'cho thuê' quá nhanh",
    
    style: "Dùng từ ngụ ý (sang nhượng, chuyển đi, nâng cấp, bắt đầu kinh doanh) thay vì 'bán' hoặc 'cho thuê' đơn thuần",
    
    examples: [
      {
        scenario: "Câu chuyện gia đình nâng cấp nhà",
        correct: "Từ căn hộ 70m2 lên 100m2 ở Destino - Chuyến nâng cấp nhà ở của chúng tôi",
        subtitle: "(Ý bán/mua tinh tế ở tiêu đề qua 'lên 100m2', người đọc hiểu cần bán cái cũ)",
        wrong: "Chúng tôi bán căn hộ 70m2 để mua căn 100m2 (quá cứng nhắc, giống bảng tin)"
      },
      {
        scenario: "Tâm sự từ kinh nghiệm cho thuê",
        correct: "Tôi cho thuê căn hộ dạo này - 3 điều cần chú ý",
        subtitle: "(Tiêu đề không khiếp, nhưng nội dung sẽ bàn về cho thuê)",
        wrong: "Hướng dẫn cho thuê căn hộ - 3 bước (quá máy móc)"
      },
      {
        scenario: "Bắt đầu kinh doanh ở shophouse",
        correct: "Bắt đầu kinh doanh quán cà phê ở shophouse Phú Mỹ Hưng - Con đường từ 0",
        subtitle: "(Ý 'cho thuê' ẩn ở 'quán cà phê ở shophouse', không nêu rõ)",
        wrong: "Cho thuê shophouse Phú Mỹ Hưng để kinh doanh (quá trực diện)"
      },
      {
        scenario: "Chia sẻ sai lầm khi mua nhà lần đầu",
        correct: "Sai lầm tôi gặp khi ký hợp đồng mua nhà - Hãy tránh",
        subtitle: "(Ý 'mua' ở tiêu đề nhưng tinh tế, vì focus chính là lời khuyên)",
        wrong: "Mua nhà lần đầu - Tôi bị lừa như thế nào (quá tiêu cực)"
      },
      {
        scenario: "Người dân địa phương chia sẻ",
        correct: "Tôi sống 5 năm ở Quận 7 rồi chuyển đi - 3 lý do tại sao",
        subtitle: "(Ý 'bán nhà' rất tinh tế, qua 'chuyển đi', người đọc tự hiểu)",
        wrong: "Bán nhà ở Quận 7 - Lý do tôi chuyển đi (quá thẳng thừng)"
      }
    ]
  },

  "content_implicit": {
    label: "Ẩn Ý (Không Nhắc Đến Bán/Cho Thuê Rõ Ràng)",
    
    why: "Vì mục đích chính của bài không phải là bán/cho thuê, mà là giáo dục, hướng dẫn, hoặc phân tích. Nêu rõ bán/cho thuê sẽ làm bài viết bị hiểu lầm là quảng cáo.",
    
    when: [
      "Bài viết dạy người đọc cách phân biệt, lựa chọn (không phải bán 1 căn cụ thể)",
      "Bài phân tích so sánh các loại bất động sản (căn hộ vs nhà phố vs biệt thự)",
      "Bài hướng dẫn cách làm gì đó (VD: cách setup quán cafe, không phải cho thuê shophouse của tôi)",
      "Bài review, đánh giá chung về 1 khu vực (không phải review 1 căn cụ thể để bán)",
      "Bài giáo dục (VD: xu hướng bất động sản 2026)",
      "Content creator chia sẻ kinh nghiệm mà mục đích không phải bán, chỉ là chia sẻ"
    ],
    
    where: "Tiêu đề HOÀN TOÀN KHÔNG nhắc đến bán/cho thuê. Nó chỉ nêu chủ đề chính",
    
    style: "Tiêu đề tập trung vào giá trị, lợi ích, hoặc câu hỏi - không phải giao dịch",
    
    examples: [
      {
        scenario: "So sánh loại bất động sản",
        correct: "Căn hộ vs Nhà phố vs Biệt thự - Nên chọn loại nào để sống?",
        subtitle: "(Không nhắc bán/cho thuê, vì focus là lựa chọn tính năng)",
        context: "Nội dung giải thích ưu nhược điểm từng loại, không phải bán cái này"
      },
      {
        scenario: "Hướng dẫn cách làm gì đó",
        correct: "Cách setup quán cafe nhỏ trong shophouse - Bỏ vốn bao nhiêu?",
        subtitle: "(Không nhắc 'cho thuê shophouse', vì focus là setup kinh doanh)",
        context: "Bài hướng dẫn chung, không phải quảng cáo shophouse của tôi"
      },
      {
        scenario: "Phân tích khu vực",
        correct: "Quận 7 2026: Xu hướng bất động sản, giá dự báo",
        subtitle: "(Hoàn toàn không nhắc bán/cho thuê, là phân tích chung)",
        context: "Content giáo dục, không phải bán bất động sản ở Q7"
      },
      {
        scenario: "Review chung 1 dự án",
        correct: "Destino Centro: Những gì bạn cần biết trước khi chọn ở đây",
        subtitle: "(Nhắc đến 'chọn ở đây' nhưng không nêu bán/cho thuê)",
        context: "Review chung, không phải quảng cáo bán/cho thuê Destino"
      },
      {
        scenario: "Giáo dục & xu hướng",
        correct: "5 lý do bất động sản gần công viên tăng giá hơn các chỗ khác",
        subtitle: "(Không nhắc bán/cho thuê, là giáo dục về xu hướng)",
        context: "Content giáo dục, độc giả sẽ tự hiểu và áp dụng"
      }
    ]
  }
};

// ===== TITLE TEMPLATES BY SELLING INTENT =====
const TITLE_TEMPLATES_BY_SELLING_INTENT = {
  "title_explicit": {
    label: "Tiêu đề Rõ Ràng - Nêu Bán/Cho Thuê",
    templates: [
      // Pattern 1: [Verb: Bán/Cho thuê] + [Property] + [Reason/Context]
      "Bán {property} {context} - {reason}",
      "Cần bán {property} {location} - {reason}",
      "Cho thuê {property} {context} - {reason}",
      "Sang nhượng {property} {location} - {reason}",
      
      // Pattern 2: [Property] + [Verb: Bán/Cho thuê] - [Benefits]
      "{property} {location} - Bán {reason}",
      "{property} {context} - Cho thuê {benefits}",
      
      // Pattern 3: [Why sell] - [Property] + [Selling Action]
      "{reason} - Bán {property} {location}",
      "{context} - Cho thuê {property} {benefits}",
      
      // Pattern 4: Direct + Comparison (for comparing to buy/sell)
      "Bán căn hộ {location} - So sánh với {comparison}",
      "Cho thuê {property} - Lợi nhuận {benefits}",
      
      // Pattern 5: Question format with action
      "Bán nhà {location} - Bạn nên biết gì?",
      "Cho thuê shophouse - Kinh doanh gì có lợi?"
    ],
    guide: "Sử dụng động từ rõ ràng (bán, cho thuê, sang nhượng) ở vị trí đầu hoặc giữa tiêu đề. Nên có lý do cụ thể (tài chính, chuyển cấp, lợi nhuận)."
  },

  "content_subtle": {
    label: "Tiêu đề Tinh Tế - Ẩn Ý Bán/Cho Thuê",
    templates: [
      // Pattern 1: [Action/Journey] + [Property] - [Result]
      "Từ {old_property} lên {new_property} - {lesson}",
      "Nâng cấp nhà ở {location} - {experience}",
      "Chuyển {property} - {reason}",
      
      // Pattern 2: [Experience] + [Context] - [Learning]
      "{experience} với {property} {location} - {lesson}",
      "Tôi cho thuê {property} dạo này - {insight}",
      "{experience} khi bán {property} - {lesson}",
      
      // Pattern 3: [Story] + [Property Type] - [Advice]
      "Lịch sử {property} của tôi - {lesson}",
      "3 năm sở hữu {property} - {insight}",
      
      // Pattern 4: [Activity/Business] + [Property] - [Tips]
      "Kinh doanh {business} trong {property} - {tips}",
      "Quản lý {property} cho thuê - {lesson}",
      
      // Pattern 5: [Personal choice] + [Property]
      "Tại sao tôi chọn {property} {location}",
      "Câu chuyện về {property} của gia đình tôi",
      "Quyết định {property} tốt nhất của tôi"
    ],
    guide: "Không nhắc trực tiếp 'bán' hoặc 'cho thuê', thay vào đó dùng từ ẩn ý như: nâng cấp, chuyển nhà, kinh doanh, quản lý, lịch sử, câu chuyện, tại sao tôi chọn."
  },

  "content_implicit": {
    label: "Tiêu đề Ẩn Ý Hoàn Toàn - Không Nhắc Bán/Cho Thuê",
    templates: [
      // Pattern 1: [Question] + [Property Type] - [Choice]
      "{property} vs {comparison} - Nên chọn cái nào?",
      "Loại {property} nào tốt nhất cho {context}?",
      
      // Pattern 2: [How-to/Guide] + [Property/Business]
      "Cách {action} khi {property} - {steps}",
      "Hướng dẫn {topic} với {property} - {benefit}",
      "Setup {business} trong {property} - Bỏ vốn bao nhiêu?",
      
      // Pattern 3: [Feature] + [Property] - [Benefit]
      "{property} gần {landmark} - {benefit}",
      "{benefit} của {property} {location}",
      "Lợi ích {property} ở khu vực {location}",
      
      // Pattern 4: [Analysis] + [Market/Area]
      "{location} 2026 - Xu hướng {topic}",
      "Phân tích {property} {location} - {insight}",
      "{property}: Những gì bạn cần biết",
      
      // Pattern 5: [Comparison/Review] - [Educational]
      "So sánh {property1} vs {property2} vs {property3}",
      "Review {property}/{location} - {aspect}",
      "5 lý do {property} {location} {benefit}"
    ],
    guide: "Không được nhắc 'bán', 'cho thuê', 'cần bán', 'cần thuê', 'đầu tư' làm chính. Focus vào: giáo dục, so sánh, hướng dẫn, phân tích, review."
  }
};

// ===== KEYWORDS BY SELLING INTENT =====
const KEYWORDS_BY_SELLING_INTENT = {
  "title_explicit": {
    label: "Keywords Rõ Ràng - Giao Dịch",
    keywords: [
      // Transaction-focused keywords
      "bán {property}", "cần bán {property}", "sang nhượng {property}",
      "cho thuê {property}", "cần thuê {property}", "kinh doanh {property}",
      "mua {property}", "hỗ trợ bán {property}", "môi giới {property}",
      
      // Location + transaction
      "bán {property} {location}", "cho thuê {property} {location}",
      "{location} bán {property}", "{location} cho thuê {property}",
      
      // Type + transaction
      "{property_type} bán", "{property_type} cho thuê",
      "cần bán {property_type}", "cần thuê {property_type}",
      
      // Financial aspect (for investors)
      "giá bán {property}", "giá thuê {property}", "lợi nhuận {property}",
      "ROI {property}", "dòng tiền {property}", "hồi vốn {property}",
      
      // Urgency
      "bán gấp {property}", "bán rẻ {property}", "hạ giá {property}",
      "cho thuê giá rẻ", "chiết khấu {property}"
    ],
    guide: "Sử dụng từ khóa giao dịch trực tiếp: 'bán', 'cho thuê', 'cần bán', 'cần thuê', 'sang nhượng'. Kết hợp với loại bất động sản và địa điểm."
  },

  "content_subtle": {
    label: "Keywords Tinh Tế - Kinh Nghiệm & Thay Đổi",
    keywords: [
      // Experience/journey
      "kinh nghiệm {property}", "sở hữu {property}", "nâng cấp nhà",
      "chuyển nhà", "quản lý {property}", "cho thuê {property}",
      "sống ở {property}", "lịch sử {property}",
      
      // Business/entrepreneurship
      "kinh doanh {business} {property}", "setup {business}",
      "quán {business} shophouse", "café shophouse", "startup {property}",
      
      // Lifestyle/personal
      "lối sống {property}", "chọn {property}", "gia đình {property}",
      "trẻ em {property}", "an toàn {property}",
      
      // Learning/tips
      "kiến thức {property}", "bài học {property}", "kinh nghiệm chọn {property}",
      "tips {property}", "lỗi sai {property}", "cách chọn {property}",
      
      // Area/lifestyle
      "{location} ở", "{location} sinh sống", "cộng đồng {location}",
      "lân cận {location}", "cuộc sống {location}"
    ],
    guide: "Dùng từ khóa gợi ý kinh doanh/nâng cấp: 'kinh doanh', 'setup', 'nâng cấp', 'chuyển nhà', 'quản lý', 'kinh nghiệm'. Tránh từ 'bán'/'cho thuê' trực tiếp."
  },

  "content_implicit": {
    label: "Keywords Ẩn Ý - Giáo Dục & Thông Tin",
    keywords: [
      // Comparison/choice
      "{property1} vs {property2}", "so sánh {property}", "chọn {property}",
      "loại {property} nào tốt", "khác nhau {property}",
      
      // Education/how-to
      "hướng dẫn {topic}", "cách {topic}", "làm sao {topic}",
      "bước {topic}", "quy trình {topic}", "lưu ý {topic}",
      
      // Analysis/review
      "xu hướng {property}", "phân tích {property}", "đánh giá {property}",
      "review {property}", "nhận xét {property}", "tổng quan {property}",
      
      // Location/area
      "{location} {aspect}", "khu vực {location}", "quận {location}",
      "gần {landmark}", "hạ tầng {location}", "giao thông {location}",
      
      // Value/benefit
      "lợi ích {property}", "ưu điểm {property}", "tính năng {property}",
      "tiện nghi {property}", "chất lượng {property}",
      
      // Market info
      "bất động sản {location}", "thị trường {property}", "giá {property}"
    ],
    guide: "Tập trung vào từ khóa giáo dục: 'so sánh', 'hướng dẫn', 'phân tích', 'review', 'xu hướng', 'lợi ích'. Không dùng 'bán'/'cho thuê'/'đầu tư'."
  }
};

// ===== HASHTAGS BY SELLING INTENT =====
const HASHTAGS_BY_SELLING_INTENT = {
  "title_explicit": {
    label: "Hashtags Rõ Ràng - Giao Dịch",
    hashtags: [
      // Direct transaction
      "#Bán{PropertyType}", "#ChoThue{PropertyType}", "#ChoThueShophouse",
      "#BánNhaPhố", "#BánCănHộ", "#BánBiệtThự",
      "#CầnBán", "#CầnThue", "#SangNhượng",
      
      // Location-specific
      "#{LocationCaps}", "#Q{District}", "#{LocationCaps}BánBDS",
      "#{LocationCaps}ChoThue", "#BẤtĐộngSãn{Location}",
      
      // Financial/investment
      "#ĐầuTư{PropertyType}", "#LợiNhuận", "#ROI{PropertyType}",
      "#DòngTiền", "#HồiVốn", "#TăngGiá",
      
      // Urgency/price
      "#BánGấp", "#HạGiá", "#ChiếtKhấu",
      "#GiáRẻ", "#SốcGiá", "#OfferToday"
    ],
    guide: "Hashtag trực tiếp về giao dịch: #BánCănHộ, #ChoThueShophouse, #BánGấp, #{LocationCaps}. Phù hợp với lứa độc giả tìm kiếm để mua/thuê."
  },

  "content_subtle": {
    label: "Hashtags Tinh Tế - Kinh Nghiệm & Cuộc Sống",
    hashtags: [
      // Experience journey
      "#KihnhNghiệm{PropertyType}", "#SởHữu", "#NângCấp",
      "#ChuyênNhà", "#QuảnLý{PropertyType}", "#SốngỞ{Location}",
      
      // Business/entrepreneurship
      "#Kinh{BusinessType}", "#Setup{BusinessType}", "#QuánCafé",
      "#ShophouseKinhDoanh", "#StartupĐộ", "#NgườiKinh{Business}",
      
      // Lifestyle
      "#CộngĐồng{Location}", "#CuộcSống{Location}", "#GiaĐình",
      "#TreEm", "#AnToàn", "#TạoNơiỞ",
      
      // Learning/tips
      "#BàiHọc", "#Tips", "#CáchChọn",
      "#KiếnThức", "#LỗiSai", "#SửaLàm",
      
      // Personal connection
      "#CâuChuyệnCủaTôi", "#LựaChọnCủaTôi", "#TạiSaoTôiChọn"
    ],
    guide: "Hashtag gợi ý kinh doanh & cuộc sống: #KinhNghiệm, #NângCấp, #Kinh{Business}, #CâuChuyệnCủaTôi. Phù hợp lứa độc giả tìm kiếm chia sẻ kinh doanh/lifestyle."
  },

  "content_implicit": {
    label: "Hashtags Ẩn Ý - Giáo Dục & Thông Tin",
    hashtags: [
      // Comparison/education
      "#SoSánh{PropertyType}", "#ChọnLoại", "#Vs",
      "#NênChọnCáiNào", "#KháNhau", "#LoạiNào",
      
      // How-to/guide
      "#HướngDẫn", "#HướngDẫnMua{PropertyType}", "#CáchChọn",
      "#BướcMua", "#QuyTrình", "#LưuÝ",
      
      // Analysis/market
      "#PhânTích", "#XuHướng", "#ThịTrường",
      "#Đánh{PropertyType}", "#Review", "#TổngQuan",
      
      // Location/area
      "#{LocationCaps}", "#Q{District}", "#KhuVực",
      "#GiầnCông{Landmark}", "#HạTầng", "#GiaoThông",
      
      // Value/lifestyle
      "#LợiÍch", "#ƯuĐiểm", "#TínhNăng",
      "#TiệnNghi", "#ChấtLượng", "#LốiSốngXanh",
      
      // Educational series
      "#BĐSSeason", "#SứMệnh{Topic}", "#CommunityGuide"
    ],
    guide: "Hashtag giáo dục: #SoSánh, #HướngDẫn, #PhânTích, #XuHướng, #Review. Phù hợp lứa độc giả tìm kiếm thông tin học hỏi, không tìm kiếm bài quảng cáo."
  }
};

// ===== TITLE TEMPLATES FOR PHANMEMMOTTRIEU (Luôn có Bán/Cho thuê + Địa chỉ + Hook) =====
const TITLE_TEMPLATES_FOR_PHANMEM = {
  label: "Tiêu đề Phanmemmottrieu - [Giao dịch] + [Địa chỉ] + [Hook Hấp Dẫn]",
  templates: [
    // Pattern 1: [Bán/Cho thuê] + {location} - {hook}
    "Bán {property} {location} - {hook}",
    "Cần bán {property} {location} - {hook}",
    "Cho thuê {property} {location} - {hook}",
    "Sang nhượng {property} {location} - {hook}",
    
    // Pattern 2: [Bán/Cho thuê] + {location} - [Con số]
    "Bán {property} {location} - {number}",
    "Cho thuê {property} {location} - {benefit_number}",
    
    // Pattern 3: [Giao dịch tức thì] + {location}
    "Bán gấp {property} {location} - {urgency_reason}",
    "Cần cho thuê ngay {property} {location} - {target_customer}",
    
    // Pattern 4: [Lý do giao dịch] - [Loại BĐS/Dịch vụ] + {location}
    "{reason_transaction} - Bán {property} {location}",
    "{reason_transaction} - Cho thuê {property} {location}",
    
    // Pattern 5: [Tính năng]+ {location} - [Giao dịch]
    "{feature} {location} - Bán {property} với {benefit}",
    "{feature} {location} - Cho thuê {property} giá {price_range}"
  ],
  guide: "Format: [Động từ giao dịch: bán/cho thuê/sang nhượng] + [Loại & địa chỉ cụ thể] - [Hook hấp dẫn: con số, lý do, tính năng]"
};

// ===== HELPER: GENERATE TITLE FOR PHANMEMMOTTRIEU =====
function generateTitleForPhanmem(industry, opts = {}) {
  const templates = TITLE_TEMPLATES_FOR_PHANMEM.templates;
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  
  // Xác định loại giao dịch (bán/cho thuê)
  const transactionType = opts.transactionType || (Math.random() > 0.5 ? "bán" : "cho thuê");
  
  // Xác định con số/lợi ích phù hợp với industry
  let hookValue = opts.hook || "tại sao lại đáng mua";
  let numberValue = opts.number || "tại sao lại được lựa chọn";
  let benefitNumber = opts.benefit_number || "lợi ích gì có thể mang lại";
  
  if (industry === "bat-dong-san") {
    hookValue = opts.hook || "tại sao giá tăng 10% năm nay";
    numberValue = opts.number || "vị trí vàng cho đầu tư";
    benefitNumber = opts.benefit_number || "lợi nhuận 15-20% năm";
  } else if (industry === "lam-dep-my-pham") {
    hookValue = opts.hook || "khách hàng nói gì sau 7 ngày dùng";
    numberValue = opts.number || "tại sao được yêu thích nhất 2026";
    benefitNumber = opts.benefit_number || "hiệu quả thấy rõ sau 14 ngày";
  } else if (industry === "phan-mem") {
    hookValue = opts.hook || "tại sao doanh thu tăng 30%";
    numberValue = opts.number || "tại sao chọn software này";
    benefitNumber = opts.benefit_number || "tiết kiệm 5 giờ làm việc/ngày";
  } else if (industry === "cho-thue-xe") {
    hookValue = opts.hook || "tài xế tuyệt vời khách phải biết";
    numberValue = opts.number || "tại sao xe này được ưa chuộng";
    benefitNumber = opts.benefit_number || "an toàn, sạch sẽ, giá hợp lý";
  } else if (industry === "booking-online") {
    hookValue = opts.hook || "cách đặt lịch dễ nhất";
    numberValue = opts.number || "tại sao nên đặt trước";
    benefitNumber = opts.benefit_number || "khuyến mại 20% khi book online";
  }
  
  let title = randomTemplate
    .replace(/{property}/g, opts.property || (industry === "bat-dong-san" ? "căn hộ" : "dịch vụ"))
    .replace(/{location}/g, opts.location || "Quận 7")
    .replace(/{hook}/g, hookValue)
    .replace(/{number}/g, numberValue)
    .replace(/{benefit_number}/g, benefitNumber)
    .replace(/{urgency_reason}/g, opts.urgency_reason || "giá tốt nhất thị trường")
    .replace(/{target_customer}/g, opts.target_customer || "cho ai muốn dùng ngay")
    .replace(/{reason_transaction}/g, opts.reason_transaction || "chuyển cấp")
    .replace(/{feature}/g, opts.feature || "Vị trí đắc địa")
    .replace(/{benefit}/g, opts.benefit || "lợi nhuận cao")
    .replace(/{price_range}/g, opts.price_range || "rẻ hợp lý");
  
  // Giới hạn độ dài tiêu đề (55-85 ký tự)
  if (title.length > 85) {
    title = title.substring(0, 82) + "...";
  }
  
  return title;
}

// ===== HELPER: GENERATE TITLE FOR LMKT (Dựa trên nội dung bài viết) =====
function generateTitleForLmkt(topic, personaKey = "investor", patternKey = "investment_analysis", opts = {}) {
  // LMKT tiêu đề được tạo dựa trên:
  // - Persona: investor/family/local_resident/business_owner/storyteller
  // - Pattern: investment_analysis/family_story/step_by_step_guide/quick_tips/landing_page
  // - Topic context
  
  const persona = BUYER_PERSONAS_V2[personaKey];
  const pattern = CONTENT_PATTERNS_V2[patternKey];
  
  // Chuẩn bị thành phần tiêu đề theo persona + pattern
  let titleComponents = [];
  
  if (personaKey === "investor") {
    // Investor: Focus ROI, so sánh, phân tích
    if (patternKey === "investment_analysis") {
      titleComponents = [
        `${topic}: Phân tích ROI và dòng tiền từ góc độ nhà đầu tư`,
        `${topic} - Tại sao lại là lựa chọn tốt nhất để đầu tư năm 2026?`,
        `So sánh ${topic} - Cái nào mang lại lợi nhuận cao nhất?`,
        `${topic}: Dự báo giá 2 năm tới, nên mua hay không?`,
        `Phân tích ${topic} - 5 con số bạn phải biết trước khi quyết định`
      ];
    } else {
      titleComponents = [
        `${topic}: Lựa chọn thông minh của nhà đầu tư`,
        `Tại sao nhà đầu tư lại chọn ${topic}?`,
        `${topic} - Con đường đầu tư bền vững`
      ];
    }
  } else if (personaKey === "family") {
    // Family: Focus câu chuyện, cảm xúc, an ninh
    if (patternKey === "family_story") {
      titleComponents = [
        `Gia đình chúng tôi chọn ${topic} - Lý do nằm sâu trong tim`,
        `${topic}: Nơi gia đình tôi quyết định "gốc rễ"`,
        `Chuyên mục: Từ chạy trốn đến tìm thấy tổ ấm ở ${topic}`,
        `Câu chuyện gia đình: Tại sao ${topic} là lựa chọn hoàn hảo?`,
        `${topic} - Nơi tôi muốn nuôi con nên người`
      ];
    } else {
      titleComponents = [
        `${topic}: Không chỉ là nơi ở, mà là tổ ấm`,
        `Tại sao gia đình chọn ${topic}`,
        `${topic}: Những gì gia đình cần biết`
      ];
    }
  } else if (personaKey === "local_resident") {
    // Local: Focus thực tế, kinh nghiệm, chi tiết hàng xóm
    titleComponents = [
      `${topic}: Những gì người sống ở đây thực sự biết`,
      `Sống ở ${topic} - 3 năm kinh nghiệm thật sự`,
      `${topic}: Điểm yếu mà bên ngoài không nói`,
      `Cộng đồng ${topic} - Những gì bạn cần chuẩn bị`,
      `${topic}: Cuộc sống thực tế (không phải quảng cáo)`
    ];
  } else if (personaKey === "business_owner") {
    // Business owner: Focus ROI kinh doanh, setup
    titleComponents = [
      `Kinh doanh tại ${topic} - Bỏ vốn bao nhiêu, thu về bao nhiêu?`,
      `${topic}: Cơ hội kinh doanh cực tốt cho startup`,
      `Bài toán kinh doanh ${topic} - Tại sao doanh nhân chọn nơi này?`,
      `${topic}: Setup kinh doanh F&B - Chi phí thực tế`,
      `Người kinh doanh nên biết về ${topic}`
    ];
  } else if (personaKey === "storyteller") {
    // Storyteller: Focus câu chuyện, chia sẻ, truyền cảm hứng
    titleComponents = [
      `${topic}: Câu chuyện người dân thực sự`,
      `Tôi yêu ${topic} vì lý do này`,
      `${topic} - Hành trình tìm kiếm nơi tự do`,
      `Chia sẻ: Tại sao tôi lựa chọn ${topic}`,
      `${topic}: Không chỉ là địa điểm, mà là lối sống`
    ];
  }
  
  // Chọn random 1 từ titleComponents
  const finalTitle = titleComponents[Math.floor(Math.random() * titleComponents.length)];
  
  // Giới hạn độ dài
  if (finalTitle && finalTitle.length > 85) {
    return finalTitle.substring(0, 82) + "...";
  }
  
  return finalTitle || topic;
}

// ===== NORMALIZE TEXT =====
function normalizeZaloText(text) {
  if (!text) return "";
  
  try {
    // Chuẩn hóa NFKD để xử lý ký tự đặc biệt (in đậm, nghiêng, emoji, ...)
    let normalized = text.normalize("NFKD");
    
    // Loại bỏ các ký tự điều khiển và ký tự không hiển thị (zero-width, invisible)
    normalized = normalized.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "");
    
    return normalized.trim();
  } catch (error) {
    console.warn("normalizeZaloText error:", error);
    return text.trim();
  }
}

/**
 * Loại bỏ dấu tiếng Việt (chuẩn hóa sang không dấu)
 * VD: "Phần mềm" → "Phan mem", "Căn hộ" → "Can ho"
 */
function removeVietnameseTones(text) {
  if (!text) return "";
  
  const toneMap = {
    'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd',
    'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y'
  };
  
  return text
    .toLowerCase()
    .split('')
    .map(char => toneMap[char] || char)
    .join('')
    .replace(/[^a-z0-9\s]/g, '');
}

/**
 * Trích xuất keywords từ text cho hashtag (SEO)
 * ✅ SUPPORT ĐA NGÀNH: Hoạt động với bất động sản, phần mềm, dịch vụ, giáo dục, etc.
 * Lấy những từ quan trọng (tần suất cao), bỏ stop words
 */
function extractKeywordsForHashtags(text = '', limit = 5) {
  if (!text || text.length === 0) return [];
  
  // ✅ UNIVERSAL STOP WORDS - Hoạt động cho tất cả ngành
  // Bao gồm tiếng Việt + tiếng Anh (vì content mix)
  const stopWords = new Set([
    // Tiếng Việt
    'và', 'được', 'có', 'là', 'cái', 'chiếc', 'những', 'tại', 'từ', 
    'để', 'với', 'trong', 'ngoài', 'trên', 'dưới', 'cạnh', 'bên',
    'hoặc', 'hay', 'nhưng', 'mà', 'vì', 'sao', 'khi', 'thì',
    'làm', 'sử', 'dùng', 'nếu', 'không', 'mà', 'như', 'về', 'qua',
    // Tiếng Anh
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'if', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'was',
    'which', 'this', 'that', 'with', 'have', 'will', 'would'
  ]);
  
  // ✅ TÁCH TỪ - Hỗ trợ đa ngôn ngữ, giữ số, bỏ ký tự đặc biệt
  const words = text
    .toLowerCase()
    .replace(/[^a-zà-ỿ0-9\s]/g, ' ')  // Remove special chars but keep Vietnamese
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  // ✅ ĐẾM TẦN SUẤT TỪ (words appearing multiple times = important keywords)
  const freqMap = {};
  words.forEach(w => {
    freqMap[w] = (freqMap[w] || 0) + 1;
  });
  
  // ✅ SẮP XẾP & LẤY TOP KEYWORDS
  return Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])  // Descending by frequency
    .slice(0, limit)
    .map(([word]) => word);
}

// ===== ARTICLE HISTORY =====
function saveArticleToHistory(domainKey, industryOrProject, title, slug) {
  try {
    const historyStr = localStorage.getItem(ARTICLE_HISTORY_KEY) || "{}";
    const history = JSON.parse(historyStr);
    
    const key = `${domainKey}_${industryOrProject}`;
    if (!history[key]) {
      history[key] = [];
    }
    
    history[key].unshift({ title, slug, created: new Date().toISOString() });
    
    if (history[key].length > MAX_HISTORY_SIZE) {
      history[key] = history[key].slice(0, MAX_HISTORY_SIZE);
    }
    
    localStorage.setItem(ARTICLE_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Lỗi lưu lịch sử:", e);
  }
}

function getArticleHistory(domainKey, industryOrProject) {
  try {
    const historyStr = localStorage.getItem(ARTICLE_HISTORY_KEY) || "{}";
    const history = JSON.parse(historyStr);
    const key = `${domainKey}_${industryOrProject}`;
    return history[key] || [];
  } catch (e) {
    console.warn("Lỗi đọc lịch sử:", e);
    return [];
  }
}

function clearArticleHistory() {
  try {
    localStorage.removeItem(ARTICLE_HISTORY_KEY);
    thongbao("✅ Đã xóa lịch sử bài viết");
  } catch (e) {
    console.warn("Lỗi xóa lịch sử:", e);
  }
}

/**
 * Đăng bài lên Facebook Page bằng Node.js (NW.js) để bypass hạn chế trình duyệt
 */
async function postToFacebookPageNWJS(pageId, pageAccessToken, message, imageUrl = null, link = null, seft = {}) {
  console.warn('⚠️ postToFacebookPageNWJS is deprecated. Using postToFacebookPageWithImages instead.');
  const images = imageUrl ? [imageUrl] : [];
  return postToFacebookPageWithImages(pageId, pageAccessToken, message, images, link, seft);
}

// ===== FEATURED IMAGE HISTORY =====
function saveImageToHistory(imagePath) {
  if (!imagePath) return;
  
  try {
    const historyStr = localStorage.getItem(FEATURED_IMAGE_HISTORY_KEY) || "[]";
    const history = JSON.parse(historyStr);
    
    // Lưu ảnh với timestamp
    history.unshift({ path: imagePath, timestamp: Date.now() });
    
    // Giới hạn số lượng lịch sử
    if (history.length > MAX_IMAGE_HISTORY) {
      history.splice(MAX_IMAGE_HISTORY);
    }
    
    localStorage.setItem(FEATURED_IMAGE_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Lỗi lưu lịch sử ảnh:", e);
  }
}

function getRecentlyUsedImages(count = 20) {
  try {
    const historyStr = localStorage.getItem(FEATURED_IMAGE_HISTORY_KEY) || "[]";
    const history = JSON.parse(historyStr);
    
    // Lấy N ảnh gần đây nhất
    return history.slice(0, count).map(item => item.path);
  } catch (e) {
    console.warn("Lỗi đọc lịch sử ảnh:", e);
    return [];
  }
}

function selectSmartFeaturedImage(images) {
  if (!images || images.length === 0) return "";
  
  // Nếu chỉ có 1 ảnh thì không có cách nào khác
  if (images.length === 1) {
    saveImageToHistory(images[0]);
    return images[0];
  }
  
  // Lấy danh sách ảnh đã dùng gần đây
  const recentlyUsed = getRecentlyUsedImages(30);
  
  // Tìm ảnh chưa được dùng gần đây
  const unusedImages = images.filter(img => !recentlyUsed.includes(img));
  
  let selectedImage;
  
  if (unusedImages.length > 0) {
    // Ưu tiên chọn từ ảnh chưa dùng
    selectedImage = unusedImages[Math.floor(Math.random() * unusedImages.length)];
    console.log(`[selectSmartFeaturedImage] Chọn ảnh chưa dùng gần đây: ${selectedImage}`);
  } else {
    // Nếu tất cả đều đã dùng, chọn ảnh đã dùng lâu nhất (không nằm trong top 10 gần nhất)
    const veryRecentlyUsed = recentlyUsed.slice(0, 10);
    const lessRecentImages = images.filter(img => !veryRecentlyUsed.includes(img));
    
    if (lessRecentImages.length > 0) {
      selectedImage = lessRecentImages[Math.floor(Math.random() * lessRecentImages.length)];
      console.log(`[selectSmartFeaturedImage] Chọn ảnh đã dùng lâu: ${selectedImage}`);
    } else {
      // Worst case: chọn ngẫu nhiên
      selectedImage = images[Math.floor(Math.random() * images.length)];
      console.log(`[selectSmartFeaturedImage] Chọn ngẫu nhiên: ${selectedImage}`);
    }
  }
  
  // Lưu vào lịch sử
  saveImageToHistory(selectedImage);
  return selectedImage;
}

/**
 * Encode HTML content theo flow mới:
 * 1. Encrypt (nếu opts.encrypt = true) → dùng csmCrypto
 * 2. URL encode (nếu opts.urlEncode = true) → encodeURIComponent
 * 
 * DEPRECATED: URL encode - chỉ giữ để tương thích cũ
 * NEW STANDARD: Chỉ encrypt, KHÔNG URL encode
 * 
 * @param {string} html - HTML content cần encode
 * @param {Object} opts - Options
 * @param {boolean} opts.encrypt - Có encrypt hay không (mặc định: false)
 * @param {boolean} opts.urlEncode - Có URL encode hay không (mặc định: false - DEPRECATED)
 * @returns {string} - Encoded HTML
 */
function encodeHtml(html, opts = {}) {
  if (!html) return html;
  
  let encoded = String(html);
  
  // Bước 1: ENCRYPT (nếu yêu cầu)
  if (opts.encrypt) {
    const crypto = getCryptoFunctions();
    try {
      encoded = crypto.encrypt(encoded);
      console.log(`✅ [encodeHtml] Encrypted (${encoded.length} chars)`);
    } catch (e) {
      console.error('❌ [encodeHtml] Encrypt failed:', e);
      // Fallback: keep original if encrypt fails
    }
  }
  
  // Bước 2: URL ENCODE (DEPRECATED - chỉ giữ để tương thích cũ)
  // ⚠️ KHÔNG nên dùng URL encode nữa, chỉ dùng encrypt
  const urlEncode = opts.urlEncode === true; // Mặc định: false
  if (urlEncode) {
    try {
      encoded = encodeURIComponent(encoded);
      console.warn('⚠️ [encodeHtml] URL encode is DEPRECATED, use encrypt only');
    } catch (e) {
      console.error('❌ [encodeHtml] URL encode failed:', e);
    }
  }
  
  return encoded;
}

function normalizeDomain(host) {
  if (!host) return undefined;
  if (host === "localhost" || host === "127.0.0.1") return undefined;
  const noWww = host.replace(/^www\./i, "");
  const parts = noWww.split(".");
  return parts.length >= 3 ? parts.slice(-2).join(".") : noWww;
}

function getThemeTokens() {
  try {
    const root = getComputedStyle(document.documentElement);
    
    // Detect dark mode
    const htmlElement = document.documentElement;
    const isDark = htmlElement.getAttribute('data-theme') === 'dark' 
                || htmlElement.classList.contains('dark')
                || window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Get values from CSS variables or use defaults based on theme
    const bg = root.getPropertyValue("--ant-color-bg-container").trim();
    const border = root.getPropertyValue("--ant-color-border").trim();
    const text = root.getPropertyValue("--ant-color-text").trim();
    const textSecondary = root.getPropertyValue("--ant-color-text-secondary").trim();
    const primary = root.getPropertyValue("--ant-color-primary").trim();
    
    // If no CSS variables found, use defaults based on theme
    if (!bg && !text) {
      if (isDark) {
        return {
          bg: "#141414",
          border: "#434343",
          text: "rgba(255, 255, 255, 0.85)",
          textSecondary: "rgba(255, 255, 255, 0.45)",
          primary: "#1677ff",
          inputBg: "#141414",
          link: "#1677ff",
          warning: "#2b2111",
          warningBorder: "#594214",
          warningText: "#ffc53d",
          info: "#1668dc",
          infoBg: "#111d2c",
          infoText: "#3c9ae8",
          successBg: "#162312",
          successBorder: "#274916",
          successText: "#73d13d"
        };
      } else {
        return {
          bg: "#ffffff",
          border: "#d9d9d9",
          text: "#000000",
          textSecondary: "#666",
          primary: "#1677ff",
          inputBg: "#ffffff",
          link: "#1677ff",
          warning: "#fff3cd",
          warningBorder: "#ffc107",
          warningText: "#856404",
          info: "#1890ff",
          infoBg: "#e7f3ff",
          infoText: "#0c5460",
          successBg: "#d4edda",
          successBorder: "#c3e6cb",
          successText: "#155724"
        };
      }
    }
    
    // CSS variables found, use them
    return {
      bg: bg || (isDark ? "#141414" : "#ffffff"),
      border: border || (isDark ? "#434343" : "#d9d9d9"),
      text: text || (isDark ? "rgba(255, 255, 255, 0.85)" : "#000000"),
      textSecondary: textSecondary || (isDark ? "rgba(255, 255, 255, 0.45)" : "#666"),
      primary: primary || "#1677ff",
      inputBg: root.getPropertyValue("--ant-color-bg-container").trim() || (isDark ? "#141414" : "#ffffff"),
      link: root.getPropertyValue("--ant-color-link").trim() || "#1677ff",
      warning: root.getPropertyValue("--ant-color-warning-bg").trim() || (isDark ? "#2b2111" : "#fff3cd"),
      warningBorder: root.getPropertyValue("--ant-color-warning-border").trim() || (isDark ? "#594214" : "#ffc107"),
      warningText: root.getPropertyValue("--ant-color-warning-text").trim() || (isDark ? "#ffc53d" : "#856404"),
      info: root.getPropertyValue("--ant-color-info").trim() || (isDark ? "#1668dc" : "#1890ff"),
      infoBg: root.getPropertyValue("--ant-color-info-bg").trim() || (isDark ? "#111d2c" : "#e7f3ff"),
      infoText: root.getPropertyValue("--ant-color-info-text").trim() || (isDark ? "#3c9ae8" : "#0c5460"),
      successBg: root.getPropertyValue("--ant-color-success-bg").trim() || (isDark ? "#162312" : "#d4edda"),
      successBorder: root.getPropertyValue("--ant-color-success-border").trim() || (isDark ? "#274916" : "#c3e6cb"),
      successText: root.getPropertyValue("--ant-color-success-text").trim() || (isDark ? "#73d13d" : "#155724")
    };
  } catch {
    // Fallback: detect dark mode manually
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' 
                || document.documentElement.classList.contains('dark')
                || window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (isDark) {
      return {
        bg: "#141414",
        border: "#434343",
        text: "rgba(255, 255, 255, 0.85)",
        textSecondary: "rgba(255, 255, 255, 0.45)",
        primary: "#1677ff",
        inputBg: "#141414",
        link: "#1677ff",
        warning: "#2b2111",
        warningBorder: "#594214",
        warningText: "#ffc53d",
        info: "#1668dc",
        infoBg: "#111d2c",
        infoText: "#3c9ae8",
        successBg: "#162312",
        successBorder: "#274916",
        successText: "#73d13d"
      };
    } else {
      return { 
        bg: "#ffffff", 
        border: "#d9d9d9", 
        text: "#000000", 
        textSecondary: "#666", 
        primary: "#1677ff",
        inputBg: "#ffffff",
        link: "#1677ff",
        warning: "#fff3cd",
        warningBorder: "#ffc107",
        warningText: "#856404",
        info: "#1890ff",
        infoBg: "#e7f3ff",
        infoText: "#0c5460",
        successBg: "#d4edda",
        successBorder: "#c3e6cb",
        successText: "#155724"
      };
    }
  }
}

function resolveContext(seftObj) {
  const win = typeof window !== 'undefined' ? window : {};
  const app_id = (seftObj && seftObj.app_id) || "wuweb";
  const domainFromSeft = seftObj && seftObj.domain;
  const domainFromHost = normalizeDomain(win.location?.hostname);
  const domain = domainFromSeft || domainFromHost || "phanmemmottrieu.net";

  const apiBase = (seftObj && seftObj.domain_api_url)
    || win.domain_api_url
    || (win.location?.origin ? `${win.location.origin}/api` : "");

  const token = (seftObj && seftObj.Uinfos?.appToken)
    || win.csmToken
    || "";

  return {
    seftObj,
    app_id,
    domain,
    apiBase,
    token,
    helperApi: win.csmApi || {},
    helperAi: win.csmAI || {}
  };
}

function generateId() {
  return `web_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getCsrfTokenFromCookie() {
  try {
    const match = typeof document !== 'undefined'
      ? document.cookie.match(/(?:^|; )CSRF-TOKEN=([^;]*)/)
      : null;
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function buildApiHeaders(ctx = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (ctx.token) {
    headers['csm-token'] = ctx.token;
  }
  const csrfToken = getCsrfTokenFromCookie();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}

const backendGuardState = {
  pausedUntil: 0,
  reason: ""
};

function extractHttpStatusFromError(error) {
  const text = `${error?.message || ""}`;
  const match = text.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : 0;
}

function activateBackendGuard(reason, ms = 2 * 60 * 1000) {
  backendGuardState.pausedUntil = Date.now() + ms;
  backendGuardState.reason = reason || "Backend unavailable";
  console.warn(`⛔ [BackendGuard] Paused ${Math.round(ms / 1000)}s: ${backendGuardState.reason}`);
}

function getBackendGuardMessage() {
  if (Date.now() >= backendGuardState.pausedUntil) return "";
  const remainSec = Math.ceil((backendGuardState.pausedUntil - Date.now()) / 1000);
  return `Backend đang tạm dừng (${remainSec}s): ${backendGuardState.reason}`;
}

function generateSlug(text, projectName = "") {
  let normalized = text || "";
  
  // Loại bỏ tên dự án khỏi slug (nếu có)
  const projectNames = [
    "destino-centro", "destino centro", "the-win-city", "the win city",
    "king-hill-residences", "king hill residences", "kieu-by-kita", "kieu by kita",
    "ansana-kita-vo-van-kiet", "ansana", "d-homme-quan-6", "d-homme", "d homme"
  ];
  
  projectNames.forEach(name => {
    const regex = new RegExp(name, "gi");
    normalized = normalized.replace(regex, "");
  });
  
  // Loại bỏ các từ thừa, connector
  const removeWords = ["tại", "ở", "của", "cho", "và", "với", "về", "từ", "đến", "trong", "ngoài"];
  removeWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    normalized = normalized.replace(regex, "");
  });
  
  try {
    normalized = normalized.normalize("NFKD");
    normalized = normalized.replace(/đ|ð/gi, "d");
    normalized = normalized.replace(/\p{Diacritic}+/gu, "");
  } catch {
    normalized = normalized.replace(/đ|ð/gi, "d").replace(/[\u0300-\u036f]/g, "");
  }

  const accentMap = {
    a: "[áàảãạăằắẳẵặâầấẩẫậ]", e: "[éèẻẽẹêềếểễệ]", i: "[íìỉĩị]",
    o: "[óòỏõọôồốổỗộơờớởỡợ]", u: "[úùủũụưừứửữự]", y: "[ýỳỷỹỵ]",
    A: "[ÁÀẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ]", E: "[ÉÈẺẼẸÊỀẾỂỄỆ]", I: "[ÍÌỈĨỊ]",
    O: "[ÓÒỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]", U: "[ÚÙỦŨỤƯỪỨỬỮỰ]", Y: "[ÝỲỶỸỴ]"
  };
  Object.entries(accentMap).forEach(([ascii, pattern]) => {
    normalized = normalized.replace(new RegExp(pattern, "g"), ascii);
  });

  return normalized.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "post";
}



/**
 * HÀM TẠO PROMPT CHỐNG CHẤT AI & TỐI ƯU SEO ĐA NGÔN NGỮ - V2
 * Tích hợp Buyer Personas, Content Patterns, Voice Rules để tạo content đa dạng
 * @param {string} industry - Ngành (VD: bat-dong-san)
 * @param {string} topic - Chủ đề bài viết
 * @param {Array} articleHistory - Lịch sử tiêu đề đã dùng (để né)
 * @param {object} opts - Tuỳ chọn (domainKey, contentPattern, personaKey, ...)
 */
function getAntiAIPrompt(industry, topic, articleHistory = [], opts = {}) {
  const industryConfig = INDUSTRY_TYPES[industry] || INDUSTRY_TYPES["bat-dong-san"];
  const isLmkt = opts.domainKey === "lmkt";
  
  // ===== CHỌN BUYER PERSONA NGẪU NHIÊN =====
  const personaKeys = Object.keys(BUYER_PERSONAS_V2);
  const selectedPersonaKey = opts.personaKey || personaKeys[Math.floor(Math.random() * personaKeys.length)];
  const selectedPersona = BUYER_PERSONAS_V2[selectedPersonaKey];
  
  // ===== CHỌN CONTENT PATTERN NGẪU NHIÊN =====
  const patternKeys = Object.keys(CONTENT_PATTERNS_V2);
  const selectedPatternKey = opts.contentPattern || patternKeys[Math.floor(Math.random() * patternKeys.length)];
  const selectedPattern = CONTENT_PATTERNS_V2[selectedPatternKey];
  
  // ===== CHỌN SELLING INTENT TYPE (Dựa trên Persona + Pattern) =====
  const selectedSellingIntentType = selectSellingIntentType(selectedPersonaKey, selectedPatternKey, opts);
  const selectedSellingIntent = SELLING_INTENT_RULES_V2[selectedSellingIntentType];
  
  // ===== TẠO TITLE, KEYWORDS, HASHTAGS - TỪY DOMAIN =====
  let generatedTitle;
  
  if (isLmkt) {
    // LMKT: Tiêu đề dựa trên topic context + persona + pattern
    generatedTitle = generateTitleForLmkt(topic, selectedPersonaKey, selectedPatternKey, opts);
  } else {
    // Phanmemmottrieu: Tiêu đề luôn có [Bán/Cho thuê] + [Địa chỉ] + [Hook]
    generatedTitle = generateTitleForPhanmem(industry, {
      property: opts.property || "dịch vụ",
      location: opts.location || "Quận 7",
      hook: opts.hook || "đáng thử ngay",
      transactionType: opts.transactionType || (Math.random() > 0.5 ? "bán" : "cho thuê")
    });
  }
  
  const generatedKeywords = generateKeywords(generatedTitle, topic, selectedSellingIntentType, {
    property: opts.property || "căn hộ",
    location: opts.location || "Quận 7",
    business: opts.business || "F&B",
    propertyType: opts.propertyType || "bất động sản"
  });
  
  const generatedHashtags = generateHashtags(generatedTitle, topic, selectedSellingIntentType, {
    propertyType: opts.propertyType || "CanhHo",
    location: opts.location || "Quận 7",
    business: opts.business || "Cafe",
    district: opts.district || "7"
  });
  
  // ===== CHỌN VOICE ALTERNATIVES (Thay AI phrases bằng human alternatives) =====
  const applyHumanVoice = (text) => {
    let result = text;
    Object.entries(VOICE_PATTERNS_V2).forEach(([aiPhrase, alternatives]) => {
      if (result.includes(aiPhrase)) {
        const randomAlt = alternatives[Math.floor(Math.random() * alternatives.length)];
        result = result.replace(new RegExp(aiPhrase, "gi"), randomAlt);
      }
    });
    return result;
  };
  
  // ===== XỬ LÝ LỊCH SỬ BÀI VIẾT =====
  const usedTitles = articleHistory.slice(-8).map(h => `- ${h.title}`).join('\n');
  const randomSeed = Math.random().toString(36).substring(7);
  
  // ===== HƯỚNG DẪN TIÊU ĐỀ LINH HOẠT =====
  const titleRequirement = isLmkt 
    ? "⚠️ TIÊU ĐỀ PHẢI LIÊN QUAN TRỰC TIẾP nội dung bài. Ý nghĩa BÁN/CHO THUÊ có thể xuất hiện ở tiêu đề HOẶC lồng ghép tinh tế trong nội dung. Nếu có trong tiêu đề thì dùng từ thường, không viết hoa toàn bộ."
    : (industryConfig.title_requirement || "");
  
  const contentStructureGuide = (() => {
    switch(selectedPatternKey) {
      case "investment_analysis":
        return `
📊 CẤU TRÚC PHÂN TÍCH ĐẦU TƯ:
1. Đặt câu hỏi/vấn đề (100 từ)
2. Cung cấp dữ liệu cụ thể (400-600 từ) - con số, tăng trưởng, so sánh
3. So sánh cụ thể A vs B (500-700 từ) - nêu từng tiêu chí
4. Dự báo & rủi ro (300-400 từ) - nếu X xảy ra, Y sẽ như thế nào
5. Kết luận & đề xuất (100-150 từ) - nêu khuyến nghị cụ thể (không nói 'cả hai tốt')
📏 Tổng: 1500-2000 từ`;
      
      case "family_story":
        return `
❤️ CẤU TRÚC CÂUS CHUYỆN GIA ĐÌNH:
1. Giới thiệu nhân vật & tình huống (100-150 từ) - tự giới thiệu, có chi tiết cá nhân
2. Vấn đề/Nỗi đau (150-200 từ) - nêu vấn đề chi tiết cụ thể (không nói 'chật', mà nói 'bé lớn không có chỗ chơi')
3. Hành trình tìm kiếm (400-500 từ) - kể lại quá trình, thử thách, quyết định trung gian
4. Lựa chọn & Quyết định (300-400 từ) - giải thích lựa chọn không phải 'đó là tốt nhất', mà 'nó phù hợp vì X, Y, Z'
5. Kết quả & Cảm xúc (200-250 từ) - chi tiết nhỏ: bé chạy vòng, vợ cười, sáng nhìn công viên
6. Lời khuyên (100-150 từ) - từ kinh nghiệm, không phải marketing advice
📏 Tổng: 1200-1500 từ`;
      
      case "step_by_step_guide":
        return `
📖 CẤU TRÚC HƯỚNG DẪN CHI TIẾT:
1. Vấn đề & Tại sao (100-150 từ) - bạn gặp vấn đề gì, tại sao cần guide này
2. Bước 1 (200-250 từ) - chi tiết, cách làm, câu hỏi nên hỏi
3. Bước 2 (200-250 từ) - tương tự như Bước 1
4. Bước 3 (200-250 từ) - tương tự
5. Bước 4 (200-250 từ) - tương tự
6. Bước 5 (200-250 từ) - tương tự
7. Tránh sai lầm (200-250 từ) - những sai lầm bạn có thể gặp, cách tránh
8. FAQ (150-200 từ) - các câu hỏi thường gặp
📏 Tổng: 1800-2200 từ`;
      
      case "quick_tips":
        return `
⚡ CẤU TRÚC MẸOÍCH NHANH:
1. Câu hook (50-100 từ) - tại sao cái này quan trọng, gây chú ý
2. Tip 1 + lý do (150-200 từ) - nêu tip, giải thích tại sao, ví dụ
3. Tip 2 + lý do (150-200 từ) - tương tự
4. Tip 3 + lý do (150-200 từ) - tương tự
5. Kết luận (100-150 từ) - tóm tắt, không nói 'hãy follow là thành công'
📏 Tổng: 800-1200 từ`;
      
      case "landing_page":
        return `
🎯 CẤU TRÚC LANDING PAGE:
1. Headline (10-15 từ, 1 tiêu đề) - benefit-driven, gợi ý lợi ích
2. Introduction (2-3 đoạn, 250-300 từ) - scene-setting hoặc đặt vấn đề
3. Key Benefits (h4 + ul, 5-7 items) - mỗi item 15-20 từ, có con số cụ thể
4. Features (3-4 tính năng, 150-320 từ) - tiêu đề + mô tả + lợi ích
5. Social Proof (2-3 đoạn, 150-200 từ) - con số cụ thể, case studies
6. CTA (1 đoạn, 30-50 từ) - lời kêu gọi hành động tôn nhã
📏 Tổng: 1500-2000 từ`;
      
      default:
        return "Viết theo cấu trúc bài tự nhiên, không bắt buộc công thức cố định";
    }
  })();
  
  const lmktExtraRules = isLmkt
    ? `
5. ✅ GÓC NHÌN ĐA DẠNG: Luân phiên giữa các góc nhìn (nhà đầu tư, người mua ở, người thuê, kết cấu căn hộ/đất nền/shophouse)
6. ✅ TONE & PERSONA: Viết từ góc độ ${selectedPersona.label} (${selectedPersona.mindset})
7. ✅ CONTENT PATTERN: Theo pattern '${selectedPattern.name}' - ${selectedPattern.tone}
8. ✅ SELLING INTENT: ${selectedSellingIntent.label} (${selectedSellingIntent.where})
`
    : "";

  const realEstateExtractRules = (industry === "bat-dong-san" || isLmkt)
    ? `
========== TRÍCH XUẤT THÔNG SỐ BẤT ĐỘNG SẢN ==========
Yêu cầu: chỉ lấy các thông số CÓ trong nội dung Zalo/Facebook đưa vào. Có cái nào lấy ra đúng cái đó, không suy diễn.
Chỉ lấy dữ liệu từ [SOURCE_TEXT]. Không tự bịa, không suy luận, không chuyển đổi đơn vị.
Giữ nguyên định dạng và đơn vị như trong nguồn (VD: "79m2", "6x15", "17ty5", "40tr/tháng").
Nếu có nhiều giá trị, ưu tiên giá trị cụ thể hơn (VD: "6x15" cho kích thước, "79m2" cho diện tích).
- attributes_area: diện tích (VD: "79m2", "6x15")
- attributes_dimensions: kích thước (VD: "6x15")
- attributes_bedrooms: số phòng ngủ (VD: "4")
- attributes_bathrooms: số toilet/phòng tắm (VD: "5")
- attributes_floors: số tầng (VD: "3")
- attributes_frontWidth: mặt tiền (VD: "6m")
- attributes_roadWidth: lộ giới/đường trước nhà (VD: "8m")
- attributes_location: vị trí (phường/quận/khu vực)
- attributes_price: giá (VD: "17.5 tỷ")
- attributes_contact: liên hệ (nếu có)
- propertyType: loại BĐS (nhà phố, căn hộ, đất nền, shophouse...)
- transactionType: "ban" hoặc "cho-thue" (nếu nội dung có)
- legalStatus: pháp lý (sổ hồng/sổ đỏ... nếu có)
- furnished: nội thất (nếu có)
Không được tự tạo dữ liệu. Nếu không thấy, để chuỗi rỗng "".
`
    : "";
  
  return `
[SYSTEM CONFIG]: Seed_${randomSeed} | Pattern_${selectedPatternKey} | Persona_${selectedPersonaKey} | SellingIntent_${selectedSellingIntentType}
[TOPIC]: "${topic}"
[INDUSTRY]: ${industry}

[SOURCE_TEXT]:
"""
${topic}
"""

========== GENERATED METADATA ==========
📌 Tiêu đề Dự Kiến: "${generatedTitle}"
🔑 Keywords Dự Kiến: ${generatedKeywords}
#️⃣ Hashtags Dự Kiến: ${generatedHashtags}

========== BUYER PERSONA (Viết từ góc độ này) ==========
👤 ${selectedPersona.label}
Mindset: "${selectedPersona.mindset}"
Content Angle: ${selectedPersona.content_angle}
Traits: ${selectedPersona.content_traits.join(", ")}

========== SELLING INTENT (Cách nêu bán/cho thuê) ==========
🎯 ${selectedSellingIntent.label}
Why: ${selectedSellingIntent.why}
When to use: ${selectedSellingIntent.when.slice(0, 3).join(" | ")}
Where in content: ${selectedSellingIntent.where}
Style: ${selectedSellingIntent.style}

========== CONTENT PATTERN (Theo cấu trúc này) ==========
📋 Pattern: ${selectedPattern.name}
Structure: ${selectedPattern.structure.join(" → ")}
Tone: ${selectedPattern.tone}
${contentStructureGuide}

========== ANTI-AI VOICE (Thay thế ai phrases bằng human alternatives) ==========
❌ TRÁNH: "Vị trí đắc địa", "Tiềm năng sinh lời", "Không chỉ... mà còn", "Sở hữu vị trí vàng", "Là sự kết hợp hoàn hảo"
✅ THAY THẾ: Dùng từ cụ thể, con số, ví dụ thực tế
  VD THAY THẾ 1: "Gần ga metro, chỉ 5 phút đi bộ" thay cho "Vị trí đắc địa"
  VD THAY THẾ 2: "Nếu mua 3 tỷ hôm nay, 3 năm sau bán 4.2 tỷ (tăng 10%/năm)" thay cho "Tiềm năng sinh lời"
  VD THAY THẾ 3: "Với ngân sách 3 tỷ, đây là lựa chọn tốt nhất (không hoàn hảo, nhưng tốt nhất)" thay cho "Sự kết hợp hoàn hảo"

========== TIÊU ĐỀ KHÔNG CỨNG NHẮC ==========
❌ TRÁNH: "BÁN CĂN HỘ..." (viết hoa), "Tin bán:", "BĐSĐT:", "Thông báo:"
✅ NÊUÕNG TỰ NHIÊN:
  - "Bán căn hộ Destino - sau 3 năm sở hữu, đây là lý do chúng tôi bán" (nêu rõ)
  - "Sau 5 năm sống ở Destino, tôi quyết định sang nhượng - Điều tôi học được" (lồng ghép)
  - "Căn hộ Destino vs The Win City - Nên chọn cái nào?" (ẩn ý)

${realEstateExtractRules}

[CHỈ THỊ CHỐNG TRÙNG LẶP]:
🚫 KHÔNG TRÙNG tiêu đề với các bài sau:
${usedTitles}

[HƯỚNG DẪN ĐẦU RA - JSON FORMAT]:
{
  "title": "55-80 ký tự, benefit-driven, lồng ghép tự nhiên ý nghĩa bán/cho thuê ${isLmkt ? '(nếu có, không bắt buộc)' : ''}",
  "title_en": "Phiên bản Tiếng Anh, chuyên ngành, 55-80 chars",
  "title_zh": "Phiên bản Tiếng Trung, 55-80 ký tự",
  
  "description": "1-2 câu giới thiệu bài viết này (150-160 ký tự). VD: 'Phân tích so sánh 2 dự án bất động sản từ góc độ ${selectedPersona.label.toLowerCase()}'",
  "description_en": "1-2 sentence English intro (150-160 chars)",
  "description_zh": "1-2句中文介绍（150-160字符）",
  
  "content": "<h3>Tiêu đề chính</h3><p>Nội dung chi tiết theo pattern '${selectedPattern.name}' và persona '${selectedPersona.label}'...</p><h4>Tiêu đề phụ</h4><p>...</p>... (HTML thuần, ${selectedPattern.total_length} từ, viết từ góc độ ${selectedPersona.label})",
  "content_en": "Bản dịch Tiếng Anh (thoát ý, không dịch word-by-word, phù hợp với context)",
  "content_zh": "Bản dịch Tiếng Trung (phồn thể/giản thể tùy ngữ cảnh)",
  
  "keywords": "từ khóa 1, từ khóa 2, từ khóa 3, ... (5-8 từ khóa)",
  "keywords_en": "keyword 1, keyword 2, keyword 3, ... (5-8 keywords)",
  "keywords_zh": "关键词1, 关键词2, 关键词3, ... (5-8关键词)",
  
  "excerpt": "Dẫn nhập/sapo (280-350 ký tự), kịch tính, khơi gợi tò mò như báo chí",
  "excerpt_en": "Engaging lead in English (280-350 chars)",
  "excerpt_zh": "吸引人的导语（280-350字符）",
  
  "author": "${selectedPersona.label}",
  "readTime": "Dự tính (VD: '10 phút')",
  "tags": ["${industry}"],

  "attributes_area": "",
  "attributes_dimensions": "",
  "attributes_bedrooms": "",
  "attributes_bathrooms": "",
  "attributes_floors": "",
  "attributes_frontWidth": "",
  "attributes_roadWidth": "",
  "attributes_location": "",
  "attributes_price": "",
  "attributes_contact": "",
  "propertyType": "",
  "transactionType": "",
  "legalStatus": "",
  "furnished": ""
}

⚠️ QUAN TRỌNG VỀ JSON:
- Không được xuống dòng thật bên trong JSON string. Nếu cần xuống dòng, dùng "\\n".
- JSON output phải là single-line (1 dòng), không có line break.

========== YÊU CẦU CHUNG ==========
✅ Viết từ góc độ ${selectedPersona.label} - Mindset: "${selectedPersona.mindset}"
✅ Theo pattern '${selectedPattern.name}' - Tone: ${selectedPattern.tone}
✅ Dùng từ ngữ tự nhiên, cụ thể, có ví dụ, có con số (không sáo rỗng)
✅ Tránh dùng AI phrases như "vị trí đắc địa", "tiềm năng sinh lời" (dùng alternatives thay thế)
✅ Tiêu đề nêu rõ bản chất bài viết (không clickbait)
✅ Bài viết khác hoàn toàn với các bài trước (tránh rập khuôn)${lmktExtraRules}
`;
}

// ===== HELPER: SELECT SELLING INTENT TYPE BASED ON PERSONA + PATTERN =====
function selectSellingIntentType(personaKey = "investor", patternKey = "investment_analysis", opts = {}) {
  // Nếu opt.sellingIntent được chỉ định trực tiếp, dùng nó
  if (opts.sellingIntent && SELLING_INTENT_RULES_V2[opts.sellingIntent]) {
    return opts.sellingIntent;
  }
  
  // Nếu không, dùng logic theo Persona + Pattern
  // Rule: Persona + Pattern xác định Selling Intent Type
  
  if (personaKey === "investor" || personaKey === "business_owner") {
    // Investor & Business Owner => title_explicit (rõ ràng bán/cho thuê)
    if (patternKey === "investment_analysis" || patternKey === "quick_tips") {
      return "title_explicit"; // Rõ ràng bán/cho thuê ở tiêu đề (so sánh, hướng dẫn đầu tư)
    }
    return "title_explicit"; // Mặc định nếu là investor
  }
  
  if (personaKey === "family" || personaKey === "local_resident") {
    // Family & Local => content_subtle (lồng ghép ẩn ý vào nội dung)
    if (patternKey === "family_story") {
      return "content_subtle"; // Ẩn ý bán/cho thuê trong câu chuyện gia đình
    }
    return "content_subtle"; // Mặc định nếu là family/local
  }
  
  if (personaKey === "storyteller") {
    // Storyteller => content_subtle hoặc content_implicit tùy pattern
    if (patternKey === "family_story") {
      return "content_subtle"; // Câu chuyện có thể lồng ghép bán/cho thuê
    }
    return "content_implicit"; // Mặc định chia sẻ kinh nghiệm không nhắc bán/thuê
  }
  
  // Mặc định: nếu pattern là educational/comparative thì implicit, nếu không thì subtle
  if (patternKey === "landing_page" || patternKey === "step_by_step_guide") {
    return "content_implicit"; // Educational guides không nhắc bán/cho thuê
  }
  
  // Fallback
  return "content_subtle";
}

// ===== HELPER: GENERATE TITLE BASED ON SELLING INTENT TYPE =====
// ===== HELPER: GENERATE KEYWORDS BASED ON SELLING INTENT TYPE =====
function generateKeywords(title, topic, sellingIntentType = "content_subtle", opts = {}) {
  const keywordConfig = KEYWORDS_BY_SELLING_INTENT[sellingIntentType];
  if (!keywordConfig) {
    console.warn(`Selling intent type '${sellingIntentType}' not found for keywords.`);
    return [topic]; // Fallback
  }
  
  // Lấy 3 từ khóa ngẫu nhiên từ danh sách
  const keywords = [];
  const keywordTemplates = keywordConfig.keywords;
  
  for (let i = 0; i < 3; i++) {
    const randomKeyword = keywordTemplates[Math.floor(Math.random() * keywordTemplates.length)];
    let keyword = randomKeyword
      .replace(/{property}/g, opts.property || "căn hộ")
      .replace(/{property_type}/g, opts.propertyType || "bất động sản")
      .replace(/{location}/g, opts.location || "Quận 7")
      .replace(/{business}/g, opts.business || "F&B")
      .replace(/{business_type}/g, opts.businessType || "F&B")
      .replace(/{property1}/g, opts.property1 || "căn hộ")
      .replace(/{property2}/g, opts.property2 || "nhà phố")
      .replace(/{landmark}/g, opts.landmark || "công viên");
    
    keywords.push(keyword);
  }
  
  // Thêm topic nếu chưa có
  if (!keywords.includes(topic) && keywords.length < 5) {
    keywords.push(topic);
  }
  
  // Giới hạn 5-8 từ khóa
  return keywords.slice(0, 8).join(", ");
}

// ===== HELPER: GENERATE HASHTAGS BASED ON SELLING INTENT TYPE =====
function generateHashtags(title, topic, sellingIntentType = "content_subtle", opts = {}) {
  const hashtagConfig = HASHTAGS_BY_SELLING_INTENT[sellingIntentType];
  if (!hashtagConfig) {
    console.warn(`Selling intent type '${sellingIntentType}' not found for hashtags.`);
    return "#" + topic.replace(/\s+/g, ""); // Fallback
  }
  
  // Lấy 3-4 hashtags ngẫu nhiên từ danh sách
  const hashtags = [];
  const hashtagTemplates = hashtagConfig.hashtags;
  
  for (let i = 0; i < 3; i++) {
    const randomHashtag = hashtagTemplates[Math.floor(Math.random() * hashtagTemplates.length)];
    let hashtag = randomHashtag
      .replace(/{PropertyType}/g, opts.propertyType || "CanhHo")
      .replace(/{property_type}/g, opts.propertyType || "CanhHo")
      .replace(/{Location}/g, opts.location?.replace(/\s+/g, "") || "Q7")
      .replace(/{LocationCaps}/g, (opts.location || "Q7").replace(/\s+/g, ""))
      .replace(/{District}/g, opts.district || "7")
      .replace(/{BusinessType}/g, opts.businessType || "FoodBeverage")
      .replace(/{Business}/g, opts.business || "Cafe")
      .replace(/{Landmark}/g, (opts.landmark || "CongVien").replace(/\s+/g, ""));
    
    hashtags.push(hashtag);
  }
  
  // Giới hạn 3-5 hashtags
  return hashtags.slice(0, 5).join(" ");
}

// ===== LMKT PROJECTS =====
const LMKT_PROJECT_DEFS = [
  { 
    service_code: "destino-centro", 
    name: "Destino Centro",
    name_en: "Destino Centro",
    name_zh: "Destino Centro",
    category: "Destino Centro",
    category_en: "Destino Centro",
    category_zh: "Destino Centro",
    image: "https://www.h-holding.vn/app_images/projects/destino-centro-og.jpg",
    attributes_icon: "BuildOutlined",
    attributes_color: "#1890ff",
    attributes_priority: 1,
    attributes_title: "Destino Centro - Dự Án BĐS Tiêu Biểu",
    attributes_title_en: "Destino Centro - Landmark Project",
    attributes_title_zh: "Destino Centro - 地标项目",
    attributes_description: "Dự án bất động sản chất lượng cao tại khu vực trung tâm.",
    attributes_description_en: "High-quality real estate project in central area.",
    attributes_description_zh: "中心区域高端房地产项目。",
    attributes_keywords: "destino centro, dự án, bất động sản, h-holding",
    attributes_keywords_en: "destino centro, project, real estate, h-holding",
    attributes_keywords_zh: "destino centro, 项目, 房地产, h-holding"
  },
  { 
    service_code: "the-win-city", 
    name: "The Win City",
    name_en: "The Win City",
    name_zh: "The Win City",
    category: "The Win City",
    category_en: "The Win City",
    category_zh: "The Win City",
    image: "https://www.h-holding.vn/app_images/projects/the-win-city-og.jpg",
    attributes_icon: "BuildOutlined",
    attributes_color: "#52c41a",
    attributes_priority: 2,
    attributes_title: "The Win City - Thành Phố Thông Minh",
    attributes_title_en: "The Win City - Smart City",
    attributes_title_zh: "The Win City - 智慧城市",
    attributes_description: "Dự án phát triển thành phố thông minh hiện đại.",
    attributes_description_en: "Smart city development project.",
    attributes_description_zh: "智慧城市开发项目。",
    attributes_keywords: "the win city, thành phố, thông minh, h-holding",
    attributes_keywords_en: "the win city, smart city, project, h-holding",
    attributes_keywords_zh: "the win city, 智慧城市, 项目, h-holding"
  },
  { 
    service_code: "king-hill-residences", 
    name: "King Hill Residences",
    name_en: "King Hill Residences",
    name_zh: "King Hill Residences",
    category: "King Hill Residences",
    category_en: "King Hill Residences",
    category_zh: "King Hill Residences",
    image: "https://www.h-holding.vn/app_images/projects/king-hill-residences-og.jpg",
    attributes_icon: "HomeOutlined",
    attributes_color: "#eb2f96",
    attributes_priority: 3,
    attributes_title: "King Hill Residences - Căn Hộ Cao Cấp",
    attributes_title_en: "King Hill Residences - Premium Apartments",
    attributes_title_zh: "King Hill Residences - 高档公寓",
    attributes_description: "Khu căn hộ cao cấp với thiết kế hiện đại.",
    attributes_description_en: "Premium apartment complex with modern design.",
    attributes_description_zh: "高档公寓群，现代设计。",
    attributes_keywords: "king hill, căn hộ, cao cấp, h-holding",
    attributes_keywords_en: "king hill, apartment, premium, h-holding",
    attributes_keywords_zh: "king hill, 公寓, 高档, h-holding"
  },
  { 
    service_code: "kieu-by-kita", 
    name: "Kiều by Kita",
    name_en: "Kiều by Kita",
    name_zh: "Kiều by Kita",
    category: "Kiều by Kita",
    category_en: "Kiều by Kita",
    category_zh: "Kiều by Kita",
    image: "https://www.h-holding.vn/app_images/projects/kieu-by-kita-og.jpg",
    attributes_icon: "ShopOutlined",
    attributes_color: "#faad14",
    attributes_priority: 4,
    attributes_title: "Kiều by Kita - Trung Tâm Thương Mại",
    attributes_title_en: "Kiều by Kita - Shopping Center",
    attributes_title_zh: "Kiều by Kita - 购物中心",
    attributes_description: "Trung tâm thương mại đa chức năng.",
    attributes_description_en: "Multi-functional shopping center.",
    attributes_description_zh: "多功能购物中心。",
    attributes_keywords: "kiều, kita, thương mại, h-holding",
    attributes_keywords_en: "kieu, kita, shopping, h-holding",
    attributes_keywords_zh: "kiều, kita, 购物, h-holding"
  },
  { 
    service_code: "ansana-kita-vo-van-kiet", 
    name: "Ansana (Kita Võ Văn Kiệt)",
    name_en: "Ansana (Kita Vo Van Kiet)",
    name_zh: "Ansana (Kita 武文洁)",
    category: "Ansana (Kita Võ Văn Kiệt)",
    category_en: "Ansana (Kita Vo Van Kiet)",
    category_zh: "Ansana (Kita 武文洁)",
    image: "https://www.h-holding.vn/app_images/projects/ansana-kita-og.jpg",
    attributes_icon: "EnvironmentOutlined",
    attributes_color: "#13c2c2",
    attributes_priority: 5,
    attributes_title: "Ansana Kita - Cộng Đồng Xanh",
    attributes_title_en: "Ansana Kita - Green Community",
    attributes_title_zh: "Ansana Kita - 绿色社区",
    attributes_description: "Cộng đồng sống xanh, bền vững.",
    attributes_description_en: "Green sustainable living community.",
    attributes_description_zh: "绿色可持续生活社区。",
    attributes_keywords: "ansana, kita, cộng đồng, xanh, h-holding",
    attributes_keywords_en: "ansana, kita, community, green, h-holding",
    attributes_keywords_zh: "ansana, kita, 社区, 绿色, h-holding"
  },
  { 
    service_code: "d-homme-quan-6", 
    name: "D-Homme Quận 6",
    name_en: "D-Homme District 6",
    name_zh: "D-Homme 6区",
    category: "D-Homme Quận 6",
    category_en: "D-Homme District 6",
    category_zh: "D-Homme 6区",
    image: "https://www.h-holding.vn/app_images/projects/d-homme-quan-6-og.jpg",
    attributes_icon: "CrownOutlined",
    attributes_color: "#722ed1",
    attributes_priority: 6,
    attributes_title: "D-Homme Quận 6 - Biệt Thự Cao Cấp",
    attributes_title_en: "D-Homme District 6 - Luxury Villas",
    attributes_title_zh: "D-Homme 6区 - 豪华别墅",
    attributes_description: "Biệt thự cao cấp với vị trí đắc địa.",
    attributes_description_en: "Luxury villas in prime location.",
    attributes_description_zh: "黄金地段豪华别墅。",
    attributes_keywords: "d-homme, quận 6, biệt thự, h-holding",
    attributes_keywords_en: "d-homme, district 6, villa, h-holding",
    attributes_keywords_zh: "d-homme, 6区, 别墅, h-holding"
  }
];

// ===== PARSE ZALO/FACEBOOK JSON =====
function extractBase64ImagesFromText(text = "") {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function normalizeImageCandidates(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(v => typeof v === "string" && v.trim());
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || raw.startsWith("/")) {
      return [raw];
    }

    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(v => typeof v === "string" && v.trim());
        }
      } catch (e) {
        // ignore invalid json string
      }
    }
  }

  return [];
}

function extractImagesFromMessage(item = {}) {
  console.log(`\n📋 [extractImagesFromMessage] === START EXTRACTION DEBUG ===`);
  console.log(`   Item keys:`, Object.keys(item || {}).join(', '));
  console.log(`   Item structure:`, {
    has_images: !!item.images,
    images_len: Array.isArray(item.images) ? item.images.length : 'N/A',
    has_imageUrls: !!item.imageUrls,
    imageUrls_len: Array.isArray(item.imageUrls) ? item.imageUrls.length : 'N/A',
    has_image_urls: !!item.image_urls,
    image_urls_len: Array.isArray(item.image_urls) ? item.image_urls.length : 'N/A',
    has_photos: !!item.photos,
    photos_len: Array.isArray(item.photos) ? item.photos.length : 'N/A',
    has_attachments: !!item.attachments,
    attachments_len: Array.isArray(item.attachments) ? item.attachments.length : 'N/A',
    has_attachments_data: !!item.attachments?.data,
    attachments_data_len: Array.isArray(item.attachments?.data) ? item.attachments.data.length : 'N/A'
  });
  
  const images = [];
  let debugInfo = [];

  const imageCandidates = [
    ["images", item.images],
    ["imageUrls", item.imageUrls],
    ["image_urls", item.image_urls],
    ["photos", item.photos],
    ["media", item.media],
    ["photo", item.photo],
    ["picture", item.picture]
  ];

  imageCandidates.forEach(([key, value]) => {
    const normalized = normalizeImageCandidates(value);
    if (normalized.length > 0) {
      console.log(`   ✅ Found item.${key}: ${normalized.length} items`);
      images.push(...normalized);
      debugInfo.push(`item.${key}: ${normalized.length}`);
    }
  });

  if (typeof item.image === "string") {
    console.log(`   ✅ Found item.image: 1 item`);
    images.push(item.image);
    debugInfo.push('item.image: 1');
  }
  if (typeof item.imageUrl === "string") {
    console.log(`   ✅ Found item.imageUrl: 1 item`);
    images.push(item.imageUrl);
    debugInfo.push('item.imageUrl: 1');
  }

  // Facebook-style attachments
  if (Array.isArray(item.attachments)) {
    let count = 0;
    item.attachments.forEach((att, idx) => {
      const src = att?.media?.image?.src || att?.media?.image || att?.url;
      if (typeof src === "string") {
        console.log(`   ✅ Found attachment[${idx}].media.image.src: ${src.substring(0, 80)}`);
        images.push(src);
        count++;
      }
    });
    if (count > 0) debugInfo.push(`item.attachments: ${count}`);
  }

  if (Array.isArray(item.attachments?.data)) {
    let count = 0;
    item.attachments.data.forEach((att, idx) => {
      const src = att?.media?.image?.src || att?.media?.image || att?.url;
      if (typeof src === "string") {
        console.log(`   ✅ Found attachments.data[${idx}].media.image.src: ${src.substring(0, 80)}`);
        images.push(src);
        count++;
      }
    });
    if (count > 0) debugInfo.push(`item.attachments.data: ${count}`);
  }

  const text = item.content || item.text || "";
  const base64Images = extractBase64ImagesFromText(text);
  if (base64Images.length > 0) {
    console.log(`   ✅ Found ${base64Images.length} base64 images from text`);
    images.push(...base64Images);
    debugInfo.push(`base64 from text: ${base64Images.length}`);
  }

  console.log(`\n   📊 [BEFORE FILTER] Total raw images collected: ${images.length}`);
  images.slice(0, 5).forEach((img, idx) => {
    console.log(`     [${idx}] ${typeof img === 'string' ? img.substring(0, 100) : String(img).substring(0, 100)}...`);
  });

  // Validate URLs before returning
  const validImages = Array.from(new Set(
    images.filter((img, idx) => {
      if (typeof img !== 'string' || !img.trim()) {
        console.log(`   ❌ [Filter ${idx}] Not string or empty`);
        return false;
      }
      const isValid = img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:');
      if (!isValid) {
        console.log(`   ❌ [Filter ${idx}] Invalid format (doesn't start with http/https/data): ${img.substring(0, 80)}`);
      } else {
        console.log(`   ✅ [Filter ${idx}] Valid URL: ${img.substring(0, 100)}`);
      }
      return isValid;
    })
  ));
  
  console.log(`\n   📊 [AFTER FILTER] Valid images: ${validImages.length}/${images.length}`);
  if (validImages.length > 0) {
    console.log(`✅ extractImagesFromMessage: Found ${validImages.length} valid image(s) [${debugInfo.join(', ')}]`);
    validImages.slice(0, 3).forEach((url, idx) => {
      console.log(`   [${idx}] ${url}`);
    });
  } else if (debugInfo.length > 0) {
    console.warn(`⚠️ extractImagesFromMessage: Found ${images.length} raw images but 0 valid after filter. Sources: [${debugInfo.join(', ')}]`);
  } else {
    console.warn(`⚠️ extractImagesFromMessage: No images found in any field!`);
  }
  console.log(`📋 [extractImagesFromMessage] === END EXTRACTION DEBUG ===\n`);
  
  return validImages;
}

function extractMessageText(item = {}) {
  const candidates = [
    item.content,
    item.text,
    item.message,
    item.body,
    item.caption,
    item.title,
    item.description
  ];

  const firstText = candidates.find(v => typeof v === "string" && v.trim().length > 0) || "";
  return normalizeZaloText(firstText);
}

function getMessageEssentials(item = {}) {
  const text = extractMessageText(item);
  const images = extractImagesFromMessage(item);
  return {
    text,
    images,
    hasText: text.length > 0,
    hasImages: images.length > 0,
    isEligible: text.length > 0 && images.length > 0
  };
}

function getFirstImageFromJsonInput() {
  // ✅ PRIORITY 1: Check window variable first (has full data with base64)
  if (window.__pendingZaloMessages && Array.isArray(window.__pendingZaloMessages)) {
    for (const msg of window.__pendingZaloMessages) {
      const images = extractImagesFromMessage(msg);
      if (images.length > 0) return images[0];
    }
  }
  
  // ✅ PRIORITY 2: Fallback to textarea (lightweight, might not have base64)
  const input = document.getElementById('content-input');
  const raw = input?.value?.trim();
  if (!raw) return null;

  try {
    const parsed = parseMessages(raw);
    for (const msg of parsed) {
      const images = extractImagesFromMessage(msg);
      if (images.length > 0) return images[0];
    }
  } catch (e) {
    // ignore parse errors
  }

  return null;
}

function getFirstTextFromJsonInput() {
  // ✅ PRIORITY 1: Check window variable first
  if (window.__pendingZaloMessages && Array.isArray(window.__pendingZaloMessages)) {
    for (const msg of window.__pendingZaloMessages) {
      const text = extractMessageText(msg);
      if (text) return text;
    }
  }
  
  // ✅ PRIORITY 2: Fallback to textarea
  const input = document.getElementById('content-input');
  const raw = input?.value?.trim();
  if (!raw) return "";

  try {
    const parsed = parseMessages(raw);
    for (const msg of parsed) {
      const text = extractMessageText(msg);
      if (text) return text;
    }
  } catch (e) {
    // ignore parse errors
  }

  return "";
}

function parseZaloJson(jsonArray) {
  if (!Array.isArray(jsonArray)) throw new Error("JSON phải là mảng");
  
  return jsonArray.filter((msg, idx) => {
    const essentials = getMessageEssentials(msg);
    if (!essentials.hasText || !essentials.hasImages) {
      console.warn(`⚠️ [parseZaloJson] Skip message #${idx + 1}: hasText=${essentials.hasText}, hasImages=${essentials.hasImages}`);
      return false;
    }
    return true;
  });
}

function parseFacebookJson(jsonArray) {
  if (!Array.isArray(jsonArray)) throw new Error("JSON phải là mảng");
  
  return jsonArray.filter((item, idx) => {
    const essentials = getMessageEssentials(item);
    const declaredImgCount = parseInt(item.imageCount, 10) || 0;
    const hasImages = essentials.images.length > 0 || declaredImgCount > 0;
    if (!essentials.hasText || !hasImages) {
      console.warn(`⚠️ [parseFacebookJson] Skip post #${idx + 1}: hasText=${essentials.hasText}, hasImages=${hasImages}`);
      return false;
    }
    return true;
  });
}

// ===== UPLOAD IMAGES =====
async function uploadBase64Image(base64, filename, ctx) {
  if (!base64 || base64.endsWith("...")) {
    throw new Error("Ảnh base64 chưa đầy đủ");
  }

  const inputName = (filename || `img-${Date.now()}.png`).toLowerCase();
  
  // ✅ TÁCH TÊN FILE VÀ EXTENSION (giống backend)
  const lastDotIndex = inputName.lastIndexOf('.');
  let fileNameWithoutExtension = inputName;
  let fileExtension = "";
  
  if (lastDotIndex > 0) {
    fileNameWithoutExtension = inputName.substring(0, lastDotIndex);
    fileExtension = inputName.substring(lastDotIndex); // Bao gồm dấu chấm
  }
  
  // ✅ XÓA DẤU CHỈ TỪ TÊN FILE (áp dụng xoa_dau logic)
  let sanitizedName = fileNameWithoutExtension
    .replace(/\s+/g, "-")
    .replace(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, (c) => {
      const map = {
        "à": "a", "á": "a", "ạ": "a", "ả": "a", "ã": "a", "â": "a", "ầ": "a", "ấ": "a", "ậ": "a", "ẩ": "a", "ẫ": "a",
        "ă": "a", "ằ": "a", "ắ": "a", "ặ": "a", "ẳ": "a", "ẵ": "a",
        "è": "e", "é": "e", "ẹ": "e", "ẻ": "e", "ẽ": "e", "ê": "e", "ề": "e", "ế": "e", "ệ": "e", "ể": "e", "ễ": "e",
        "ì": "i", "í": "i", "ị": "i", "ỉ": "i", "ĩ": "i",
        "ò": "o", "ó": "o", "ọ": "o", "ỏ": "o", "õ": "o", "ô": "o", "ồ": "o", "ố": "o", "ộ": "o", "ổ": "o", "ỗ": "o",
        "ơ": "o", "ờ": "o", "ớ": "o", "ợ": "o", "ở": "o", "ỡ": "o",
        "ù": "u", "ú": "u", "ụ": "u", "ủ": "u", "ũ": "u", "ư": "u", "ừ": "u", "ứ": "u", "ự": "u", "ử": "u", "ữ": "u",
        "ỳ": "y", "ý": "y", "ỵ": "y", "ỷ": "y", "ỹ": "y",
        "đ": "d"
      };
      return map[c] || c;
    })
    .replace(/[^a-z0-9\-]/g, ""); // Không giữ . nữa (xóa sạch ký tự đặc biệt)
  
  // ✅ GHÉP LẠI TÊN FILE VỚI EXTENSION
  const finalFileName = sanitizedName + fileExtension;
  
  const uploadPayload = JSON.stringify({ app_id: ctx.app_id, name: finalFileName, src: base64 });
  const candidates = getCandidateUploadEndpoints(ctx);
  const availableCandidates = candidates.filter(ep => !isUploadEndpointCoolingDown(ep));
  const endpoints = availableCandidates.length > 0 ? availableCandidates : candidates;
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: uploadPayload
      });

      if (!res.ok) {
        markUploadEndpointFailure(endpoint, res.status);
        lastError = new Error(`Upload failed: ${res.status} @ ${endpoint}`);
        continue;
      }

      const path = await res.text();
      clearUploadEndpointHealth(endpoint);
      const cleanedPath = (path || "").trim();
      if (!cleanedPath) {
        lastError = new Error(`Upload empty response @ ${endpoint}`);
        continue;
      }
      return cleanedPath.startsWith("/") ? cleanedPath : `/${cleanedPath}`;
    } catch (error) {
      markUploadEndpointFailure(endpoint, 0);
      lastError = error;
    }
  }

  throw lastError || new Error("Upload failed: không tìm thấy endpoint upload khả dụng");
}

async function uploadImages(ctx, images) {
  const arr = Array.isArray(images) ? images : [];
  const isBase64 = (s = "") => /^data:image\//i.test(s);
  
  console.log(`\n[uploadImages] === START UPLOAD DEBUG ===`);
  console.log(`[uploadImages] Bắt đầu upload ${arr.length} ảnh - ${new Date().toLocaleTimeString()}`);
  
  arr.forEach((img, i) => {
    const isB64 = isBase64(img);
    const preview = img ? img.substring(0, 100) : '(empty)';
    console.log(`   [${i}] ${isB64 ? '📤 BASE64' : '🔗 URL'}: ${preview}...`);
  });
  
  const results = [];
  for (let i = 0; i < arr.length; i += 1) {
    const img = arr[i];
    if (!img) {
      console.log(`   [${i}] ⏭️  Skipped (empty)`);
      results.push("");
      continue;
    }

    if (!isBase64(img)) {
      console.log(`   [${i}] ✅ URL pass-through: ${img.substring(0, 100)}`);
      results.push(img);
      continue;
    }

    console.log(`   [${i}] 📤 Uploading base64 image...`);
    try {
      const result = await uploadBase64Image(img, `upload-${Date.now()}-${i}.png`, ctx);
      console.log(`   [${i}] ✅ Base64 upload result: ${result}`);
      results.push(result);
    } catch (err) {
      console.error(`   [${i}] ❌ Base64 upload error:`, err.message);
      results.push("");
    }
  }
  
  console.log(`\n[uploadImages] === RESULTS BEFORE FILTER ===`);
  results.forEach((r, i) => {
    console.log(`   [${i}] ${r ? r.substring(0, 100) : '(empty)'}...`);
  });
  
  const validResults = results.filter((r, idx) => {
    // ✅ LỌC HTML KHỎI RESULTS
    if (!r || typeof r !== 'string') {
      console.log(`   ❌ [${idx}] Filtered: not string or empty`);
      return false;
    }
    if (r.includes('<!') || r.includes('<html') || r.includes('<?')) {
      console.log(`   ❌ [${idx}] Filtered: is HTML - ${r.substring(0, 50)}`);
      return false;
    }
    // ✅ CHỈ GIỮ URL HỢP LỆ (full URL hoặc relative path)
    const isValid = /^https?:\/\/|^\/|^app_images\//.test(r);
    if (!isValid) {
      console.log(`   ❌ [${idx}] Filtered: invalid URL format - ${r.substring(0, 50)}`);
    } else {
      console.log(`   ✅ [${idx}] Valid: ${r}`);
    }
    return isValid;
  });
  
  console.log(`\n[uploadImages] === FINAL ===`);
  console.log(`[uploadImages] Hoàn tất upload ${validResults.length}/${arr.length} ảnh hợp lệ - ${new Date().toLocaleTimeString()}`);
  console.log(`[uploadImages] === END UPLOAD DEBUG ===\n`);
  
  return validResults;
}

function resolvePublicImageUrl(ctx, url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;

  const protocol = (typeof window !== 'undefined' && window.location?.protocol) ? window.location.protocol : "https:";
  const domain = (ctx?.domain || "").split(",")[0].trim();

  if (url.startsWith("//")) return `${protocol}${url}`;
  if (url.startsWith("/")) return domain ? `${protocol}//${domain}${url}` : `${protocol}${url}`;
  return url;
}

// ===== BUILD DETAIL =====
function buildDetail(ctx, seo, imgs, opts = {}) {
  const now = new Date().toISOString();
  const slug = generateSlug(seo?.title || "bai-viet");
  
  // AI đã trả về tất cả các trường - chỉ cần lấy từ seo
  const titleVi = seo?.title || "Bài viết";
  const titleEn = seo?.title_en || titleVi;
  const titleZh = seo?.title_zh || titleVi;
  
  // ✅ LẤY TỪ CTX (đã được enrich từ config trong processContent)
  const propertyType = seo?.propertyType || "tat-ca";
  const transactionType = seo?.transactionType || "ban";
  // ⭐ SERVER DATABASE USES service_type FIELD (NOT project)
  const serviceType = ctx.service_type || "bat-dong-san";
  
  // Lấy description từ format mới hoặc cũ
  const descriptionVi = seo?.description_vi || seo?.description || "";
  const descriptionEn = seo?.description_en || seo?.description || "";
  const descriptionZh = seo?.description_zh || seo?.description || "";
  
  // Mã hoá CONTENT (HTML) cho cả 3 ngôn ngữ
  // ✅ CHỈ ENCRYPT - KHÔNG URL ENCODE (đã deprecated)
  // Flow: AI content (plain HTML) → csmEncrypt → lưu database
  const encodedContentVi = encodeHtml(seo?.content || "", { encrypt: true, urlEncode: false });
  const encodedContentEn = encodeHtml(seo?.content_en || "", { encrypt: true, urlEncode: false });
  const encodedContentZh = encodeHtml(seo?.content_zh || "", { encrypt: true, urlEncode: false });
  
  // Sử dụng các trường custom từ AI nếu có
  const keywordsVi = seo?.keywords_vi || seo?.keywords || descriptionVi.substring(0, 100);
  const keywordsEn = seo?.keywords_en || seo?.keywords || descriptionEn.substring(0, 100);
  const keywordsZh = seo?.keywords_zh || seo?.keywords || descriptionZh.substring(0, 100);
  
  const excerptVi = seo?.excerpt_vi || seo?.excerpt || descriptionVi;
  const excerptEn = seo?.excerpt_en || seo?.excerpt || descriptionEn;
  const excerptZh = seo?.excerpt_zh || seo?.excerpt || descriptionZh;
  
  const author = seo?.author || opts.author || "Admin";
  const readTime = seo?.readTime || "5 phút";
  const tags = seo?.tags || [serviceType];
  
  
  // ✅ VALIDATE IMAGES: Lọc bỏ HTML, chỉ giữ URL hợp lệ
  console.log(`\n🖼️ [buildDetail] === IMAGE DEBUG START ===`);
  console.log(`   Input images (imgs param): ${Array.isArray(imgs) ? imgs.length : 'not-array'} items`);
  if (Array.isArray(imgs) && imgs.length > 0) {
    console.log(`   First 3 input images:`);
    imgs.slice(0, 3).forEach((img, i) => {
      const preview = img?.substring ? img.substring(0, 80) : String(img).substring(0, 80);
      console.log(`     [${i}] ${preview}...`);
    });
  }
  
  const validImages = (Array.isArray(imgs) ? imgs : []).filter((img, idx) => {
    if (!img || typeof img !== 'string') {
      console.warn(`   ❌ [Filter] [${idx}] Not string or empty`);
      return false;
    }
    // Lọc bỏ HTML
    if (img.includes('<!') || img.includes('<html') || img.includes('<?')) {
      console.warn(`   ❌ [Filter] [${idx}] Is HTML: ${img.substring(0, 50)}...`);
      return false;
    }
    // Chỉ giữ URL hợp lệ (full URL, relative path, hoặc data URL)
    const isValid = /^https?:\/\/|^\/|^app_images\/|^data:/.test(img);
    if (!isValid) {
      console.warn(`   ❌ [Filter] [${idx}] Invalid format: ${img.substring(0, 50)}...`);
      return false;
    }
    console.log(`   ✅ [Filter] [${idx}] VALID: ${img.substring(0, 80)}...`);
    return true;
  });
  
  console.log(`   📊 Result: ${validImages.length}/${Array.isArray(imgs) ? imgs.length : '?'} images passed filter`);
  
  // Ảnh đại diện phải trùng với ảnh đầu tiên trong chi tiết bài viết
  const featuredImage = validImages.length > 0 ? validImages[0] : "";
  console.log(`   🎬 Featured image: ${featuredImage ? '✅ ' + featuredImage.substring(0, 80) : '❌ NONE'}...`);
  
  // ✅ VALIDATE images array trước khi stringify
  let imagesJsonString = "[]";
  try {
    // Ensure validImages is a flat array of strings
    const flatImages = validImages.filter(img => typeof img === 'string');
    if (flatImages.length !== validImages.length) {
      console.warn(`   ⚠️ [buildDetail] Filtered out ${validImages.length - flatImages.length} non-string images`);
    }
    imagesJsonString = JSON.stringify(flatImages);
    console.log(`   ✅ [buildDetail] JSON.stringify successful, length: ${imagesJsonString.length} chars`);
  } catch (stringifyError) {
    console.error(`   ❌ [buildDetail] JSON.stringify FAILED:`, stringifyError);
    console.error(`   Using empty array as fallback`);
    imagesJsonString = "[]";
  }
  
  console.log(`🖼️ [buildDetail] === IMAGE DEBUG END ===\n`);
  
  // ✅ SERVER DATABASE USES service_type FIELD ONLY
  // service_code is always same as serviceType (no separate project field)
  const service_code = serviceType;
  
  console.log(`🏷️ [buildDetail] service_code="${service_code}" (serviceType="${serviceType}")`);
  
  return {
    id: generateId(),
    service_type: serviceType,
    service_code: service_code,
    slug,
    // Tiêu đề đa ngôn ngữ
    title: titleVi,
    title_en: titleEn,
    title_zh: titleZh,
    // Keywords đa ngôn ngữ
    keywords: keywordsVi,
    keywords_en: keywordsEn,
    keywords_zh: keywordsZh,
    // Excerpt đa ngôn ngữ
    excerpt: excerptVi,
    excerpt_en: excerptEn,
    excerpt_zh: excerptZh,
    // Content đa ngôn ngữ (đã mã hóa)
    content: encodedContentVi,
    content_en: encodedContentEn,
    content_zh: encodedContentZh,
    // Description (cho meta tag)
    description: descriptionVi,
    description_en: descriptionEn,
    description_zh: descriptionZh,
    // Metadata
    image: featuredImage,
    author: author,
    avatar: opts.avatar || "https://phanmemmottrieu.net/media/icon.png",
    publishDate: now.split("T")[0],
    readTime: readTime,
    views: 0,
    tags: Array.isArray(tags) ? tags : [serviceType],
    thumbnail: featuredImage,
    images: imagesJsonString, // ✅ SỬ DỤNG STRING ĐÃ VALIDATE
    activeHome: opts.activeHome !== false,
    featured: opts.featured || false,
    priority: opts.priority || 10,
    serviceType: serviceType,
    created_at: now,
    updated_at: now,
    status: "active",
    domain: ctx.domain,
    // ===== AI ĐÃ EXTRACT TẤT CẢ CÁC TRƯỜNG =====
    // Lấy trực tiếp từ seo (AI response)
    attributes: JSON.stringify({
      propertyType: seo?.propertyType || "tat-ca",
      transactionType: seo?.transactionType || "ban",
      legalStatus: seo?.legalStatus || "tat-ca",
      furnished: seo?.furnished || "tat-ca",
      project: seo?.project || "", // Project info from AI extraction (if available)
    }),
    // Các trường attributes từ AI - QUAN TRỌNG để lưu thông số bài viết
    attributes_area: seo?.attributes_area || "",
    attributes_dimensions: seo?.attributes_dimensions || "",
    attributes_bedrooms: seo?.attributes_bedrooms || "",
    attributes_bathrooms: seo?.attributes_bathrooms || "",
    attributes_floors: seo?.attributes_floors || "",
    attributes_frontWidth: seo?.attributes_frontWidth || "",
    attributes_roadWidth: seo?.attributes_roadWidth || "",
    attributes_location: seo?.attributes_location || "",
    attributes_price: seo?.attributes_price || "",
    attributes_contact: seo?.attributes_contact || "",
    // Các trường riêng (giữ tương thích với schema cũ)
    propertyTypeLabel: propertyType,
    transactionTypeLabel: transactionType,
  };
}

// ===== UPSERT DETAIL =====
async function upsertDetail(ctx, detail) {
  console.log(`[upsertDetail] Bắt đầu kiểm tra bài viết tồn tại - ${new Date().toLocaleTimeString()}`);
  
  // ✅ Determine correct app_id from domain (hardcode for reliability)
  const isLmktDomain = (detail.domain || ctx.domain || "").toLowerCase().includes("h-holding");
  const finalAppId = isLmktDomain ? "lmkt" : "wuweb";
  console.log(`[upsertDetail] Domain check: "${detail.domain}" → app_id: "${finalAppId}" ${isLmktDomain ? '🏢 LMKT' : '💼 WuWeb'}`);
  
  const where = {
    operator: "AND",
    conditions: [
      { field: "slug", type: "eq", value: detail.slug },
      { field: "domain", type: "eq", value: detail.domain }
    ]
  };
  
  // ✅ Add null check
  if (!ctx || !ctx.helperApi) {
    console.error(`❌ [upsertDetail] ctx.helperApi missing - using fallback`);
    return { success: false, error: "helperApi not available" };
  }
  
  const rows = await ctx.helperApi.getTableData({
    app_id: finalAppId,
    obj_name: "web_service_detail",
    where,
    take: 1
  }).catch(() => ({ rows: [] }));
  
  console.log(`[upsertDetail] Đã kiểm tra xong - ${new Date().toLocaleTimeString()}`);
  
  const existing = (rows.rows || rows.data || [])[0];
  const objUpdate = existing ? { ...existing, ...detail } : detail;
  const command = existing ? "update" : "create";
  
  console.log(`[upsertDetail] Đang ${command} bài viết "${detail.title}" với app_id="${finalAppId}" - ${new Date().toLocaleTimeString()}`);
  
  // ✅ Validate objUpdate trước khi gửi
  console.log(`[upsertDetail] === OBJECT UPDATE DEBUG ===`);
  console.log(`   Keys count: ${Object.keys(objUpdate).length}`);
  console.log(`   Has images: ${!!objUpdate.images}`);
  console.log(`   Images type: ${typeof objUpdate.images}`);
  console.log(`   Images length: ${objUpdate.images?.length || 0} chars`);
  if (objUpdate.images) {
    try {
      const parsed = JSON.parse(objUpdate.images);
      console.log(`   ✅ Images is valid JSON array with ${parsed.length} items`);
    } catch (e) {
      console.error(`   ❌ Images is NOT valid JSON: ${e.message}`);
      console.error(`   Images value: ${objUpdate.images?.substring(0, 200)}`);
    }
  }
  console.log(`   Has content: ${!!objUpdate.content}`);
  console.log(`   Content length: ${objUpdate.content?.length || 0} chars`);
  console.log(`[upsertDetail] === END DEBUG ===`);
  
  try {
    const result = await ctx.helperApi.updateTableData({
      app_id: finalAppId,
      obj_name: "web_service_detail",
      command,
      obj_update: objUpdate,
      pk_fields: ["slug", "domain", "status"]
    });
    
    console.log(`[upsertDetail] ✅ ${command} thành công - ${new Date().toLocaleTimeString()}`);
    
    // ✅ Lưu detail vào window.cparams để có thể lấy URL sau này
    if (!window.cparams) window.cparams = {};
    window.cparams.lastDetail = detail;
    console.log(`[upsertDetail] Đã lưu detail vào window.cparams.lastDetail`);
    
    return result;
  } catch (apiError) {
    console.error(`❌ [upsertDetail] API updateTableData FAILED:`, apiError);
    console.error(`   Command: ${command}`);
    console.error(`   Table: web_service_detail`);
    console.error(`   App ID: ${finalAppId}`);
    console.error(`   PK fields: ["slug", "domain", "status"]`);
    console.error(`   Object update keys:`, Object.keys(objUpdate));
    console.error(`   Detail snapshot:`, {
      slug: detail.slug,
      domain: detail.domain,
      title: detail.title?.substring(0, 50),
      images_field_type: typeof objUpdate.images,
      images_length: objUpdate.images?.length || 0,
      content_length: objUpdate.content?.length || 0
    });
    
    // Kiểm tra xem có phải lỗi do images field không?
    if (apiError.message?.includes('images') || apiError.message?.includes('JSON')) {
      console.error(`   ⚠️ CÓ THỂ LỖI DO IMAGES FIELD!`);
      console.error(`   Images field value:`, objUpdate.images?.substring(0, 200));
    }
    
    throw apiError;
  }
}

// ===== HELPER: Get app_id từ DOMAIN_OPTIONS =====
function getAppIdFromDomainOptions(domainValue) {
  if (!domainValue) {
    console.warn(`[getAppIdFromDomainOptions] domain is empty, returning default "wuweb"`);
    return "wuweb";
  }
  
  // 🔍 Lookup trong DOMAIN_OPTIONS để tìm config khớp
  for (const [key, option] of Object.entries(DOMAIN_OPTIONS)) {
    if (option.value === domainValue) {
      console.log(`[getAppIdFromDomainOptions] ✅ Found match: domain="${domainValue}" → app_id="${option.app_id}" (key: ${key})`);
      return option.app_id;
    }
  }
  
  // ⚠️ Nếu không tìm được exact match, log warning
  console.warn(`[getAppIdFromDomainOptions] ⚠️ No exact match for domain="${domainValue}"`);
  console.warn(`[getAppIdFromDomainOptions] Available DOMAIN_OPTIONS:`, Object.entries(DOMAIN_OPTIONS).map(([k, v]) => `${k}:"${v.value}"`).join(", "));
  
  // Fallback: return default
  return "wuweb";
}

// ===== PROCESS ZALO/FACEBOOK =====
function normalizeJsonString(raw) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      output += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      output += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      output += ch;
      continue;
    }

    if (inString && (ch === "\n" || ch === "\r")) {
      output += "\\n";
      continue;
    }

    output += ch;
  }

  return output;
}

function parseSeoJsonString(seoString) {
  let jsonStr = (seoString || "").trim();

  const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (match && match[1]) {
    console.log('[processContent] 📝 Detected markdown fence, extracting JSON...');
    jsonStr = match[1].trim();
  }

  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    const repaired = normalizeJsonString(
      jsonStr
        .replace(/\uFEFF/g, "")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, "$1")
    );

    return JSON.parse(repaired);
  }
}

async function processContent(item, opts = {}) {
  const backendGuardMsg = getBackendGuardMessage();
  if (backendGuardMsg) {
    throw new Error(backendGuardMsg);
  }

  // 1️⃣ Lấy config ĐÚNG theo config_id (quan trọng để không nhầm fanpage!)
  let latestConfig = null;
  
  // ✅ PRIORITY 1: Load config by specific config_id (from Zalo auto-post)
  if (opts.config_id) {
    try {
      const allConfigs = loadDataOptionUser && typeof loadDataOptionUser === 'function' ? loadDataOptionUser() : [];
      if (!Array.isArray(allConfigs)) {
        throw new Error("loadDataOptionUser không trả về array");
      }
      latestConfig = allConfigs.find(x => x && x.id === opts.config_id && x.config_for_zalo);
      if (latestConfig) {
        console.log(`✅ [Config Loaded by ID] config_id=${opts.config_id}, domain=${latestConfig.domain}, fanpage=${latestConfig.fanpage_name}`);
      } else {
        console.warn(`⚠️ [Config NOT FOUND] config_id=${opts.config_id} - falling back to latest`);
      }
    } catch (e) {
      console.error(`❌ [Config Load Error] Failed to load config by ID:`, e.message);
      latestConfig = null; // Reset để fallback
    }
  }
  
  // ✅ PRIORITY 2: Fallback to latest config ONLY nếu:
  // - Không có config_id, HOẶC
  // - Config by ID không tìm thấy
  // ✅ CRITICAL: Nếu gọi từ Zalo auto (opts.config_id), chỉ dùng config đó, không fallback!
  if (!latestConfig && !opts.config_id) {
    try {
      const allData = loadDataOptionUser && typeof loadDataOptionUser === 'function' ? loadDataOptionUser() : [];
      if (!Array.isArray(allData)) {
        throw new Error("loadDataOptionUser không trả về array");
      }
      const zaloConfigs = allData.filter(x => x && x.config_for_zalo);
      if (zaloConfigs.length > 0) {
        latestConfig = zaloConfigs[zaloConfigs.length - 1];
        console.log(`⚠️ [Config Fallback to Latest] domain=${latestConfig.domain}, fanpage=${latestConfig.fanpage_name}`);
      }
    } catch (e) {
      console.error(`❌ [Config Fallback Error]:`, e.message);
      latestConfig = null;
    }
  }
  
  // 2️⃣ ✅ CRITICAL FIX: Enrich ctx với TOÀN BỘ thông tin từ config
  // Điều này đảm bảo domain/fanpage/project/service_type khớp nhau từ cùng 1 config
  let ctx = null;
  
  try {
    ctx = resolveContext();
  } catch (e) {
    console.error(`❌ [processContent] Failed to resolve context:`, e);
    // Fallback: Create minimal context
    ctx = {
      app_id: opts.app_id || "wuweb",
      domain: opts.domain || "phanmemmottrieu.net",
      service_type: opts.service_type || "bat-dong-san",
      project: opts.project || "",
      fanpage_id: opts.fanpage_id,
      fanpage_token: opts.fanpage_token,
      fanpage_name: opts.fanpage_name,
      primary_domain: opts.primary_domain,
      config_id: opts.config_id
    };
    console.warn(`⚠️ [processContent] Using minimal fallback context`);
  }
  
  if (latestConfig) {
    // ✅ Dùng TOÀN BỘ settings từ config đã load (ưu tiên tuyệt đối)
    ctx.domain = latestConfig.domain;
    ctx.service_type = latestConfig.service_type;
    
    // ✅ CHỈ GÁN PROJECT NẾU DOMAIN LÀ LMKT
    const isLmktDomain = latestConfig.domain && (latestConfig.domain.includes('h-holding') || latestConfig.domain.includes('lmkt'));
    ctx.project = isLmktDomain ? (latestConfig.project || "") : "";
    
    ctx.fanpage_id = latestConfig.fanpage_id;
    ctx.fanpage_token = latestConfig.fanpage_token;
    ctx.fanpage_name = latestConfig.fanpage_name;
    ctx.primary_domain = latestConfig.primary_domain;
    ctx.config_id = latestConfig.id;
    
    // ✅ Get app_id from DOMAIN_OPTIONS lookup (most reliable)
    ctx.app_id = latestConfig.app_id || getAppIdFromDomainOptions(latestConfig.domain) || opts.app_id || ctx.app_id;
    
    console.log(`🎯 [CTX Enriched from Config]`);
    console.log(`   - Config ID: ${ctx.config_id}`);
    console.log(`   - Domain: ${ctx.domain} ${isLmktDomain ? '🏢 LMKT' : '💼 WuWeb'}`);
    console.log(`   - App ID: ${ctx.app_id} ✅`);
    console.log(`   - Service Type: ${ctx.service_type}`);
    console.log(`   - Project: ${ctx.project || '(none - not LMKT)'}`);
    console.log(`   - Fanpage ID: ${ctx.fanpage_id}`);
    console.log(`   - Fanpage Name: ${ctx.fanpage_name}`);
    console.log(`   - Primary Domain: ${ctx.primary_domain || '(random)'}`);
  } else {
    // ✅ Fallback to opts nếu không có config
    ctx.domain = opts.domain || ctx.domain || "h-holding.vn";
    ctx.service_type = opts.service_type || ctx.service_type || "bat-dong-san";
    
    // ✅ CHỈ GÁN PROJECT NẾU DOMAIN LÀ LMKT
    const isLmktDomain = ctx.domain && (ctx.domain.includes('h-holding') || ctx.domain.includes('lmkt'));
    ctx.project = isLmktDomain ? (opts.project || ctx.project || "") : "";
    
    ctx.fanpage_id = opts.fanpage_id || ctx.fanpage_id;
    ctx.fanpage_token = opts.fanpage_token || ctx.fanpage_token;
    ctx.fanpage_name = opts.fanpage_name || ctx.fanpage_name;
    ctx.primary_domain = opts.primary_domain || ctx.primary_domain;
    
    // ✅ Get app_id from DOMAIN_OPTIONS lookup (most reliable)
    ctx.app_id = opts.app_id || getAppIdFromDomainOptions(ctx.domain) || ctx.app_id || "wuweb";
    
    console.log(`⚠️ [CTX Enriched from Opts (No Config)] - Domain: ${ctx.domain} ${isLmktDomain ? '🏢 LMKT' : '💼 WuWeb'}`);
    console.log(`   - Domain: ${ctx.domain}`);
    console.log(`   - App ID: ${ctx.app_id} (DERIVED)`);
    console.log(`   - Service Type: ${ctx.service_type}`);
    console.log(`   - Project: ${ctx.project || '(none)'}`);
  }
  
  const industry = ctx.service_type || "bat-dong-san";
  
  // ✅ Dùng extractMessageText để lấy content từ nhiều trường khác nhau
  let content = "";
  try {
    content = (typeof extractMessageText === 'function' ? extractMessageText(item) : null) 
      || item.content 
      || item.text 
      || item.message 
      || item.body 
      || item.caption 
      || "";
  } catch (e) {
    console.warn(`⚠️ [extractMessageText Error] Falling back:`, e.message);
    content = item.content || item.text || item.message || item.body || item.caption || "";
  }
  
  // ✅ DEBUG: log chi tiết về content trước khi check
  if (!content || !content.trim()) {
    console.error(`[processContent] Content trống! Item structure:`, {
      has_content: !!item.content,
      has_text: !!item.text,
      has_message: !!item.message,
      has_body: !!item.body,
      has_caption: !!item.caption,
      has_title: !!item.title,
      has_description: !!item.description,
      content_length: item.content?.length || 0,
      text_length: item.text?.length || 0,
      item_keys: Object.keys(item || {}).join(', ')
    });
    throw new Error(`Nội dung trống - không tìm thấy trường text/content/message/body trong tin nhắn`);
  }
  
  const essentials = getMessageEssentials(item);
  const images = essentials.images;

  if (!essentials.isEligible) {
    throw new Error(`Tin nhắn không đủ điều kiện (cần đủ nội dung + hình ảnh): hasContent=${essentials.hasText}, hasImages=${essentials.hasImages}`);
  }
  
  console.log(`[processContent] Bắt đầu xử lý - Domain: ${ctx.domain}, Service: ${industry}, Project: ${ctx.project}`);
  console.log(`[processContent] Bắt đầu xử lý - ${new Date().toLocaleTimeString()}`);
  console.log(`📸 [processContent] Extracted ${images.length} images from Zalo message: ${images.slice(0, 2).join(', ')}${images.length > 2 ? ` (+${images.length - 2} more)` : ''}`);
  
  thongbao("🖼️ Đang upload ảnh...");
  let uploadedImages = [];
  try {
    uploadedImages = await uploadImages(ctx, images) || [];
    if (!Array.isArray(uploadedImages)) {
      uploadedImages = [];
    }
    console.log(`✅ [processContent] Uploaded ${uploadedImages.length} images (from ${images.length} extracted)`);
    console.log(`   Sample uploaded paths: ${uploadedImages.slice(0, 2).join(', ')}${uploadedImages.length > 2 ? ` (+${uploadedImages.length - 2} more)` : ''}`);
  } catch (e) {
    console.error(`❌ [processContent] Lỗi upload ảnh:`, e.message);
    canhbao(`⚠️ Không upload được ảnh, bỏ qua tin nhắn này`);
    uploadedImages = [];
  }

  if (!uploadedImages || uploadedImages.length === 0) {
    throw new Error(`Không upload được ảnh hợp lệ, bỏ qua tin nhắn để đảm bảo đủ dữ liệu cho web/fanpage`);
  }
  console.log(`[processContent] Upload ảnh xong - ${uploadedImages.length} ảnh - ${new Date().toLocaleTimeString()}`);
  
  // ✅ CONVERT RELATIVE PATHS TO FULL URLs for Facebook
  // Facebook Graph API requires absolute URLs for images
  console.log(`\n🔗 [URL Conversion] === START CONVERSION DEBUG ===`);
  console.log(`   Input images (uploadedImages): ${uploadedImages.length} items`);
  uploadedImages.slice(0, 5).forEach((img, i) => {
    console.log(`     [${i}] ${img}`);
  });
  
  const fullUrlImages = uploadedImages.map((img, idx) => {
    if (!img) {
      console.log(`   [${idx}] ⏭️  Empty, skipping`);
      return '';
    }
    // Already full URL
    if (img.startsWith('http://') || img.startsWith('https://')) {
      console.log(`   [${idx}] ✅ Already full URL: ${img}`);
      return img;
    }
    // Data URL - keep as is (will be uploaded by backend)
    if (img.startsWith('data:')) {
      console.log(`   [${idx}] ✅ Data URL, keeping: ${img.substring(0, 80)}...`);
      return img;
    }
    // Relative path - convert to absolute
    const domainList = ctx.domain.split(',').map(d => d.trim()).filter(d => d && !d.includes('localhost'));
    const primaryDomain = ctx.primary_domain || (domainList.length > 0 ? domainList[0] : ctx.domain.split(',')[0].trim());
    const absoluteUrl = `https://www.${primaryDomain}${img.startsWith('/') ? img : '/' + img}`;
    console.log(`   [${idx}] 🔗 Converted: ${img} → ${absoluteUrl}`);
    return absoluteUrl;
  }).filter(img => img && img.trim());
  
  console.log(`\n   📊 Result: ${fullUrlImages.length}/${uploadedImages.length} images have full URLs`);
  fullUrlImages.slice(0, 3).forEach((url, i) => {
    console.log(`     [${i}] ${url}`);
  });
  console.log(`🔗 [URL Conversion] === END CONVERSION DEBUG ===\n`);
  
  console.log(`✅ [processContent] Converted ${fullUrlImages.length} images to full URLs for Facebook`);
  
  thongbao("🤖 Đang tạo nội dung (Chống Chất AI)...");
  const domainKey = opts.domainKey || "lmkt"; // For LMKT
  const articleHistory = getArticleHistory(domainKey, industry);
  
  // Lấy ĐÚNG PATH từ backend (lọc bỏ base64 nếu có), chỉ lấy 2-3 hình để bài cân đối
  const imagesToPrompt = fullUrlImages
    .filter(img => img && !img.startsWith('data:')) // Chỉ lấy path, bỏ base64
    .slice(0, 3);
  
  console.log(`[DEBUG] Images to prompt:`, imagesToPrompt);
  
  // QUAN TRỌNG: Thêm timestamp để tránh cache hit khi prompt giống nhau
  // Backend có cache response 1 giờ, nếu prompt giống nhau sẽ trả về kết quả cũ
  const uniqueSeed = `[UNIQUE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}]`;
  const creative = await requestCreativeParams('anti_ai', {
    industry,
    topic: content,
    domainKey,
    property: ctx.project,
    location: opts.location,
    business: opts.business
  }, ctx.helperAi);
  const creativeOverrides = buildAntiAICreativeOverrides(creative);

  const prompt = getAntiAIPrompt(industry, content, articleHistory, {
    domainKey,
    ...creativeOverrides,
    ...opts
  }, imagesToPrompt, uniqueSeed);
  
  const generateFn = ctx.helperAi?.generateSeoContentWithPrompt;
  if (!generateFn) throw new Error("generateSeoContentWithPrompt không khả dụng");
  
  // DEBUG: Kiểm tra prompt content
  console.log(`[DEBUG] Prompt length: ${prompt?.length || 0} characters`);
  console.log(`[DEBUG] Prompt preview (first 500 chars):\n${prompt?.substring(0, 500)}`);
  console.log(`[DEBUG] helperAi object:`, ctx.helperAi);
  console.log(`[DEBUG] generateFn type:`, typeof generateFn);
  
  if (!prompt || prompt.trim().length === 0) {
    throw new Error("Prompt rỗng - không thể gọi AI!");
  }
  
  console.log(`[processContent] ⏳ Gọi AI - BẮT ĐẦU CHỜ (có thể mất 30-60 giây) - ${new Date().toLocaleTimeString()}`);
  thongbao("⏳ Đang gọi AI... (Có thể mất 30-60 giây, vui lòng chờ)");
  
  let result;
  try {
    const startAI = Date.now();
    result = await generateFn(prompt);
    const durationAI = ((Date.now() - startAI) / 1000).toFixed(1);
    
    console.log(`[processContent] ✅ AI trả về - Mất ${durationAI}s - ${new Date().toLocaleTimeString()}`);
    console.log(`[DEBUG] AI Result:`, result);
    console.log(`[DEBUG] result.success:`, result?.success);
    console.log(`[DEBUG] result.message:`, result?.message);
    console.log(`[DEBUG] result.result:`, result?.result);
    console.log(`[DEBUG] result.data:`, result?.data);
  } catch (aiError) {
    const aiStatus = extractHttpStatusFromError(aiError);
    if ([401, 403, 404, 429, 500, 502, 503, 504].includes(aiStatus)) {
      activateBackendGuard(`AI API lỗi ${aiStatus}`, 2 * 60 * 1000);
    }
    console.error(`❌ [processContent] Lỗi gọi AI:`, aiError.message);
    throw new Error(`Lỗi gọi AI: ${aiError.message}`);
  }
  
  if (!result) {
    throw new Error("AI trả về null/undefined");
  }
  
  if (!result.success) {
    throw new Error(`AI failed: ${result.message || 'Không có message'}`);
  }

  // ✅ Backend trả format: result.data.result = SEO content
  let seo = result.data?.result || result.result || result.data;
  
  // ✅ XỬ LÝ TRƯỜNG HỢP AI TRẢ VỀ MARKDOWN-WRAPPED JSON STRING
  if (typeof seo === 'string') {
    console.warn('[processContent] ⚠️ SEO data is string, attempting to parse...');
    try {
      seo = parseSeoJsonString(seo);
      console.log('[processContent] ✅ Successfully parsed SEO from string');
    } catch (parseErr) {
      console.error('[processContent] ❌ Failed to parse SEO string:', parseErr);
      console.error('[processContent] 📋 String value:', seo.substring(0, 500));
      throw new Error('Dữ liệu SEO không hợp lệ - không thể parse JSON');
    }
  }
  
  if (!seo || typeof seo !== 'object') {
    console.error('[processContent] ❌ SEO data invalid:', { result, seo });
    throw new Error('Dữ liệu SEO không hợp lệ - vui lòng thử lại');
  }
  console.log(`[processContent] ✅ Extracted SEO data - has title: ${!!seo.title}`);
  
  // ✅ XÂY DỰNG DETAIL OBJECT từ seo data
  // ⚠️ Không pass opts vào buildDetail - chỉ dùng ctx (đã có đầy đủ thông tin từ config)
  // ✅ Add safety check cho ctx.helperApi
  if (!ctx || !ctx.helperApi) {
    throw new Error(`❌ [CRITICAL] ctx.helperApi không tồn tại - không thể lưu database`);
  }
  const detail = buildDetail(ctx, seo, fullUrlImages, { 
    author: opts.author,
    avatar: opts.avatar,
    activeHome: opts.activeHome,
    featured: opts.featured,
    priority: opts.priority
  });
  console.log(`[processContent] Built detail object - title: ${detail.title}, slug: ${detail.slug}, images: ${fullUrlImages.length}`);
  
  thongbao("💾 Đang lưu dữ liệu...");
  console.log(`[processContent] Lưu DB - ${new Date().toLocaleTimeString()}`);
  
  try {
    await upsertDetail(ctx, detail);
    console.log(`[processContent] ✅ Lưu DB thành công - ${new Date().toLocaleTimeString()}`);
  } catch (dbError) {
    const dbStatus = extractHttpStatusFromError(dbError);
    if ([401, 403, 404, 429, 500, 502, 503, 504].includes(dbStatus)) {
      activateBackendGuard(`Database API lỗi ${dbStatus}`, 90 * 1000);
    }
    console.error(`❌ [processContent] LỖI KHI LƯU DATABASE:`, dbError);
    console.error(`   Error message: ${dbError.message}`);
    console.error(`   Error stack:`, dbError.stack);
    console.error(`   Detail object snapshot:`, {
      title: detail.title,
      slug: detail.slug,
      domain: detail.domain,
      service_type: detail.service_type,
      images_count: detail.images ? JSON.parse(detail.images).length : 0,
      content_length: detail.content ? detail.content.length : 0
    });
    throw new Error(`Lỗi lưu database: ${dbError.message}`);
  }
  
  saveArticleToHistory(domainKey, industry, detail.title, detail.slug);
  
  // 🎯 TỰ ĐỘNG POST LÊN TẤT CẢ FACEBOOK FANPAGES TRONG CONFIG
  // ✅ FIX: Lấy danh sách fanpages từ config (zalo_fanpages array)
  let fanpagesToPost = [];
  
  console.log(`
📱 [Facebook Config] === CHECKING FANPAGES CONFIG ===`);
  console.log(`   latestConfig exists: ${!!latestConfig}`);
  console.log(`   latestConfig.zalo_fanpages exists: ${!!latestConfig?.zalo_fanpages}`);
  console.log(`   latestConfig.zalo_fanpages isArray: ${Array.isArray(latestConfig?.zalo_fanpages)}`);
  console.log(`   latestConfig.zalo_fanpages length: ${latestConfig?.zalo_fanpages?.length || 0}`);
  
  if (latestConfig && Array.isArray(latestConfig.zalo_fanpages) && latestConfig.zalo_fanpages.length > 0) {
    // ✅ Config có nhiều fanpages - POST LÊN TẤT CẢ
    fanpagesToPost = latestConfig.zalo_fanpages;
    console.log(`✅ [Facebook] Config có ${fanpagesToPost.length} fanpages:`);
    fanpagesToPost.forEach((fp, idx) => {
      const hasToken = !!(fp.access_token && fp.access_token.length > 0);
      console.log(`   [${idx}] Name: "${fp.name}", ID: ${fp.id}, Has Token: ${hasToken ? '✅' : '❌ MISSING'} (${fp.access_token?.length || 0} chars)`);
    });
  } else if (ctx.fanpage_id) {
    // ✅ Fallback: Dùng fanpage đơn lẻ từ ctx
    fanpagesToPost = [{
      id: ctx.fanpage_id,
      access_token: ctx.fanpage_token || facebookState.selectedPageToken,
      name: ctx.fanpage_name || facebookState.selectedPageName || "Unknown"
    }];
    console.log(`📱 [Facebook] Fallback: Dùng 1 fanpage từ ctx: ${fanpagesToPost[0].name}`);
  } else {
    console.warn(`⚠️ [Facebook] KHÔNG CÓ FANPAGE NÀO TRONG CONFIG!`);
  }
  console.log(`📱 [Facebook Config] === END CONFIG CHECK ===\n`);
  
  if (fanpagesToPost.length > 0) {
    try {
      thongbao(`📱 Đang post lên ${fanpagesToPost.length} Facebook fanpage(s)...`);
      console.log(`[processContent] Chuẩn bị post lên ${fanpagesToPost.length} fanpage(s)`);
      
      // ✅ VALIDATE TOKEN trước post (nếu cần) - chỉ validate 1 lần
      if (facebookState._needsValidation) {
        console.log(`[processContent] Token cần validate, đang validate...`);
        const isValid = await validateSavedTokenIfNeeded();
        if (!isValid) {
          throw new Error('Token không hợp lệ - vui lòng nhập lại');
        }
      }
      
      // ✅ Lấy domain NGẪU NHIÊN (bỏ localhost) - random để phân tán traffic/SEO
      const domainList = ctx.domain.split(',').map(d => d.trim()).filter(d => d && !d.includes('localhost'));
      const primaryDomain = ctx.primary_domain // Ưu tiên field primary_domain nếu có
        || (domainList.length > 0 ? domainList[Math.floor(Math.random() * domainList.length)] : ctx.domain.split(',')[0].trim());
      const protocol = "https://";
      
      console.log(`🌐 [Domain Selection] Config domains: ${ctx.domain}`);
      console.log(`🌐 [Domain Selection] Primary domain: ${primaryDomain}${ctx.primary_domain ? ' (from primary_domain field)' : ' (random from list)'}`);
      
      // Tạo URL bài viết theo format đúng - sử dụng service_code từ detail
      // service_code đã được set = project slug (hoặc service_type nếu không có project)
      let articleUrl;
      console.log(`🔍 [URL Debug] detail.service_code="${detail.service_code}", detail.service_type="${detail.service_type}"`);
      articleUrl = `${protocol}www.${primaryDomain}/${detail.service_code}/${detail.slug}`;
      
      console.log(`📱 [Facebook] Article URL: ${articleUrl}`);
      
      // ✅ MỖI FANPAGE SẼ SINH NỘI DUNG AI RIÊNG (khác nhau) nhưng cùng link web
      const effectiveIndustry = ctx.service_type || detail.service_type || 'bat-dong-san';
      const industryPersonaMap = {
        'bat-dong-san': ['investor', 'homebuyer', 'business_owner'],
        'phan-mem': ['business_owner', 'tech_savvy', 'startup'],
        'dich-vu': ['business_owner', 'professional', 'startup'],
        'booking-online': ['service_user', 'busy_professional', 'health_conscious'],
        'cho-thue-xe': ['traveler', 'business_owner', 'family'],
        'lam-dep-my-pham': ['beauty_lover', 'skincare_enthusiast', 'wellness_seeker']
      };
      const availablePersonas = industryPersonaMap[effectiveIndustry] || ['investor', 'business_owner'];

      const buildFacebookContentForFanpage = async (fanpageName, index) => {
        let pageContent = null;
        const personaFromPool = availablePersonas[index % availablePersonas.length];
        const effectivePersona = opts.personaKey || personaFromPool;

        console.log(`📤 [Facebook AI] Fanpage="${fanpageName}" - persona="${effectivePersona}"`);
        try {
          const fbPostData = await generateFacebookPostContent(
            {
              title: detail.title,
              description: `${detail.description || detail.excerpt || ''}\n[PAGE:${fanpageName}|${index + 1}]`,
              content: detail.content || uploadedImages.join(' '),
              keywords: detail.keywords,
              industry: effectiveIndustry,
              personaKey: effectivePersona
            },
            ctx.helperAi,
            { domain: ctx.domain }
          );

          if (fbPostData) {
            // ✅ Use AI-generated content as-is (AI should include hashtags if needed)
            const finalContent = [
              fbPostData.facebook_post || '',
              '',
              fbPostData.cta || 'Xem chi tiết',
              articleUrl
            ].filter(line => line !== '').join('\n');
            
            pageContent = finalContent;
            console.log(`✅ [Facebook AI] Fanpage="${fanpageName}" generated (${pageContent.length} chars)`);
          }
        } catch (e) {
          console.warn(`⚠️ [Facebook AI] Fanpage="${fanpageName}" failed: ${e.message}`);
        }

        if (!pageContent) {
          // ✅ FALLBACK ONLY: When AI fails, use simple format without additional hashtags
          const fallbackContent = [
            detail.description || detail.excerpt || detail.content?.substring(0, 300) || '',
            '',
            `👉 Xem chi tiết: ${articleUrl}`
          ].filter(line => line !== '').join('\n');
          
          pageContent = fallbackContent;
          console.log(`⚠️ [Facebook Fallback] Using simple format (${pageContent.length} chars)`);
        }

        return pageContent;
      };
      console.log(`\n🖼️ [Facebook Images] === IMAGE DEBUG BEFORE POST ===`);
      console.log(`   Total images (fullUrlImages): ${fullUrlImages.length}`);
      if (fullUrlImages.length > 0) {
        console.log(`   Full image list:`);
        fullUrlImages.forEach((img, idx) => {
          const isValid = img && typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:'));
          const prefix = img && typeof img === 'string' ? img.substring(0, 10) : 'INVALID';
          console.log(`     [${idx}] ${isValid ? '✅ VALID' : '❌ INVALID'} Type: ${typeof img}, Starts: "${prefix}"${img && img.length > 10 ? `...(${img.length} chars)` : ''}`);
        });
      } else {
        console.error(`   ❌ NO IMAGES - Facebook post sẽ không có hình!`);
        console.error(`   ❌ BUG: fullUrlImages array EMPTY - kiểm tra lại uploadedImages hoặc URL conversion`);
      }
      console.log(`🖼️ [Facebook Images] === END IMAGE DEBUG ===\n`);
      
      // ✅ VALIDATE và LỌC images một lần cuối trước khi post
      console.log(`🔍 [Image Filter] Starting validation...`);
      const validFbImages = fullUrlImages.filter((img, idx) => {
        if (!img) {
          console.log(`  [${idx}] ❌ REJECT: null/undefined`);
          return false;
        }
        if (typeof img !== 'string') {
          console.log(`  [${idx}] ❌ REJECT: Not string (type: ${typeof img})`);
          return false;
        }
        const isHttp = img.startsWith('http://') || img.startsWith('https://');
        const isData = img.startsWith('data:');
        if (!isHttp && !isData) {
          console.log(`  [${idx}] ❌ REJECT: Invalid protocol (starts: "${img.substring(0, 20)}")`);
          return false;
        }
        console.log(`  [${idx}] ✅ ACCEPT: ${isHttp ? 'HTTP(S)' : 'DATA'} URL`);
        return true;
      });
      
      console.log(`\n📊 [Image Filter] Result: ${validFbImages.length}/${fullUrlImages.length} images passed validation`);
      
      if (validFbImages.length !== fullUrlImages.length) {
        console.warn(`⚠️ [Facebook] Lọc bỏ ${fullUrlImages.length - validFbImages.length} hình không hợp lệ`);
      }
      
      console.log(`✅ [Facebook] Sẽ post ${validFbImages.length} hình hợp lệ`);
      
      // ✅ DÙNG CHUNG NHÁNH CHUẨN postToSelectedFanpages (worker cũ)
      // đảm bảo auto-flow và worker-flow đồng nhất: nội dung + ảnh + tuần tự từng fanpage
      const postSummary = await postToSelectedFanpages(
        [{
          sender: item?.sender || 'Zalo',
          content: extractMessageText(item) || detail.title || '',
          images: validFbImages
        }],
        articleUrl,
        fanpagesToPost,
        {
          images: validFbImages,
          helperAi: ctx.helperAi,
          seft: seft || {},
          industry: effectiveIndustry,
          skipRecord: true
        }
      );

      const successCount = Number(postSummary?.successCount || 0);
      const failCount = Number(postSummary?.failCount || 0);

      // ✅ CRITICAL: Record posted Zalo message SAU KHI post FB thành công (tránh duplicate)
      if (successCount > 0) {
        if (opts.groupName && opts.config_id && opts.isZaloMessage) {
          console.log(`💾 [processContent] Recording posted Zalo message: group=${opts.groupName}, config=${opts.config_id}`);
          recordPostedZaloMessage(item, opts.groupName, opts.config_id);
        }
        
        // ✅ Set flag để posting worker biết bài viết đã hoàn tất
        window.__lastPostCompleted = true;
        
        thongbao(`✅ Hoàn tất: ${successCount}/${fanpagesToPost.length} fanpage(s) thành công${failCount > 0 ? `, ${failCount} lỗi` : ''}!`);
        console.log(`\n🎉 [Facebook] Kết quả: ${successCount}/${fanpagesToPost.length} fanpage(s) thành công, ${failCount} lỗi`);
      } else {
        console.warn(`⚠️ [Facebook] Không post được fanpage nào`);
        thongbao(`⚠️ Không post được fanpage nào`);
      }
    } catch (fbError) {
      console.error(`❌ [Facebook] Lỗi post:`, fbError.message);
      // Không throw error, vì post FB là optional
    }
  } else {
    console.log(`ℹ️ [Facebook] Không có fanpage nào để post`);
  }
  
  console.log(`[processContent] Hoàn tất - ${new Date().toLocaleTimeString()}`);
  return { detail, result };
}

// ===== LMKT CATEGORY INSERTION =====
async function insertLmktCategory(cat, ctx) {
  // ✅ Add null check
  if (!ctx || !ctx.helperApi) {
    console.warn(`[insertLmktCategory] ctx.helperApi missing - skipping category insert`);
    return null;
  }
  
  const domainValue = cat.domain || DOMAIN_OPTIONS.lmkt?.value || "h-holding.vn,h-holding.com.vn";
  
  // ✅ Determine correct app_id from domain (hardcode for reliability - pattern from reference file)
  const isLmktDomain = (domainValue || "").toLowerCase().includes("h-holding");
  const finalAppId = isLmktDomain ? "lmkt" : "wuweb";
  console.log(`[insertLmktCategory] Domain "${domainValue}" → app_id: "${finalAppId}" ${isLmktDomain ? '🏢 LMKT' : '💼 WuWeb'}`);
  
  const where = {
    operator: "AND",
    conditions: [
      { field: "service_code", type: "eq", value: cat.service_code },
      { field: "domain", type: "eq", value: domainValue }
    ]
  };
  
  const rows = await ctx.helperApi.getTableData({
    app_id: finalAppId,
    obj_name: "web_service_category",
    where,
    take: 1
  }).catch(() => ({ rows: [] }));
  
  const existing = (rows.rows || rows.data || [])[0];
  const command = existing ? "update" : "create";
  const objUpdate = existing ? { ...existing, ...cat } : cat;
  
  return ctx.helperApi.updateTableData({
    app_id: finalAppId,
    obj_name: "web_service_category",
    command,
    obj_update: objUpdate,
    pk_fields: ["service_code", "domain", "status"]
  });
}

// ===== PARSE & RUN MESSAGES =====
function parseMessages(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') return [data];
    throw new Error("JSON phải là mảng hoặc object");
  } catch (e) {
    throw new Error(`Parse JSON lỗi: ${e.message}`);
  }
}

async function runMessages(messages, configIdOverride = null) {
  let ctx;
  try {
    ctx = resolveContext();
    if (!ctx) {
      throw new Error("resolveContext trả về null/undefined");
    }
  } catch (e) {
    console.error(`❌ [runMessages] Failed to resolve context:`, e.message);
    ctx = {
      app_id: "wuweb",
      domain: "phanmemmottrieu.net"
    };
  }
  
  let ok = 0, fail = 0;
  
  // ⚠️ CRITICAL SECURITY: Kiểm tra xem có config_id hay không
  // Nếu không có, chỉ xử lý phanmemmottrieu (legacy behavior)
  // Nếu có, dùng config đó
  let configToUse = null;
  let domainConfigToUse = DOMAIN_OPTIONS["phanmemmottrieu"];
  
  if (configIdOverride) {
    try {
      const allConfigs = loadDataOptionUser && typeof loadDataOptionUser === 'function' ? loadDataOptionUser() : [];
      configToUse = allConfigs.find(x => x && x.id === configIdOverride && x.config_for_zalo);
      if (configToUse) {
        console.log(`✅ [runMessages] Using config by override: config_id=${configIdOverride}`);
        domainConfigToUse = DOMAIN_OPTIONS[configToUse.service_type === "lmkt" ? "lmkt" : "phanmemmottrieu"];
      } else {
        console.warn(`⚠️ [runMessages] Config override không tìm thấy: config_id=${configIdOverride}`);
      }
    } catch (e) {
      console.error(`❌ [runMessages] Error loading config:`, e.message);
    }
  } else {
    console.warn(`⚠️ [runMessages] Không có config_id - chỉ xử lý phanmemmottrieu (legacy mode)`);
  }
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    try {
      const essentials = getMessageEssentials(msg);
      if (!essentials.isEligible) {
        console.warn(`⚠️ [runMessages] Skip message ${i + 1}/${messages.length}: hasText=${essentials.hasText}, hasImages=${essentials.hasImages}`);
        fail++;
        continue;
      }

      thongbao(`🔄 Đang xử lý tin ${i + 1}/${messages.length}...`);
      
      // ✅ Get app_id from DOMAIN_OPTIONS lookup (exact match)
      const derivedAppId = getAppIdFromDomainOptions(domainConfigToUse.value);
      
      await processContent(msg, {
        app_id: derivedAppId,  // ✅ Use derived app_id from domain
        domain: domainConfigToUse.value,
        domainKey: domainConfigToUse === DOMAIN_OPTIONS["lmkt"] ? "lmkt" : "phanmemmottrieu",
        industry: configToUse?.service_type || "bat-dong-san",
        author: "Zalo Bot",
        config_id: configIdOverride || null  // ✅ Pass config_id to ensure proper config isolation
      });
      ok++;
      thongbao(`✅ [${i + 1}/${messages.length}] Đã xử lý xong tin nhắn`);
    } catch (e) {
      fail++;
      canhbao(`❌ [${i + 1}/${messages.length}] Lỗi: ${e.message}`);
    }
    
    // Delay sau mỗi tin (trừ tin cuối cùng)
    if (i < messages.length - 1) {
      const delayMs = FACEBOOK_POST_COOLDOWN_MIN_MS;
      const delaySecs = Math.round(delayMs / 1000);
      thongbao(`⏳ Chờ ${delaySecs} giây trước khi xử lý tin tiếp theo...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  thongbao(`✅ Hoàn tất! Thành công: ${ok}, Lỗi: ${fail}`);
}

// ===== UI =====
function waitForContextAuto(timeoutMs = 5000, intervalMs = 100) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const host = document.querySelector("#context-auto");
      if (host) {
        clearInterval(timer);
        resolve(host);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Không tìm thấy #context-auto (React chưa render xong)"));
      }
    }, intervalMs);
  });
}

function ensureUnifiedUIContainer() {
  const host = document.querySelector("#context-auto");
  if (!host) return null;

  let container = document.getElementById("csm-ui-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "csm-ui-container";
    container.style.cssText = "width:100%;padding:0 16px;margin:0 auto;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;";
    host.prepend(container);
  }

  return container;
}

function getFeatureCardStyle(theme) {
  return `padding:16px;border:1px solid ${theme.border};border-radius:12px;background:${theme.bg};color:${theme.text};box-shadow:0 1px 2px rgba(0,0,0,0.04)`;
}

function getFeatureTitleStyle(theme) {
  return `font-weight:bold;margin-bottom:12px;font-size:16px;color:${theme.primary}`;
}

// ===== UI COMPONENT HELPERS =====
/**
 * Tạo Domain Selector (tái sử dụng cho nhiều UI)
 * @param {string} selectId - ID cho select element
 * @param {Object} theme - Theme object
 * @returns {Object} { row, select } - DOM elements
 */
function createDomainSelector(selectId = "domain-select", theme = null) {
  if (!theme) theme = getThemeTokens();
  
  const domainRow = document.createElement("div");
  domainRow.style.cssText = "margin-bottom:12px;display:flex;gap:8px;align-items:center";
  
  const domainLabel = document.createElement("label");
  domainLabel.textContent = "Domain:";
  domainLabel.style.cssText = `font-weight:500;color:${theme.text}`;
  
  const domainSelect = document.createElement("select");
  domainSelect.id = selectId;
  domainSelect.style.cssText = `padding:6px 8px;border:1px solid ${theme.border};border-radius:3px;min-width:300px;background:${theme.inputBg};color:${theme.text}`;
  
  Object.entries(DOMAIN_OPTIONS).forEach(([key, opt]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = opt.label;
    domainSelect.appendChild(option);
  });
  
  domainRow.appendChild(domainLabel);
  domainRow.appendChild(domainSelect);
  
  return { row: domainRow, select: domainSelect };
}

/**
 * Tạo Industry Selector (tái sử dụng cho nhiều UI)
 * @param {string} selectId - ID cho select element
 * @param {string} rowId - ID cho row container
 * @param {Object} theme - Theme object
 * @returns {Object} { row, select } - DOM elements
 */
function createIndustrySelector(selectId = "industry-select", rowId = "industry-row", theme = null) {
  if (!theme) theme = getThemeTokens();
  
  const industryRow = document.createElement("div");
  industryRow.id = rowId;
  industryRow.style.cssText = "margin-bottom:12px;display:flex;gap:8px;align-items:center";
  
  const industryLabel = document.createElement("label");
  industryLabel.textContent = "Lĩnh vực:";
  industryLabel.style.cssText = `font-weight:500;color:${theme.text}`;
  
  const industrySelect = document.createElement("select");
  industrySelect.id = selectId;
  industrySelect.style.cssText = `padding:6px 8px;border:1px solid ${theme.border};border-radius:3px;min-width:300px;background:${theme.inputBg};color:${theme.text}`;
  
  Object.entries(INDUSTRY_TYPES).forEach(([key, ind]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = ind.name;
    option.style.color = ind.color;
    industrySelect.appendChild(option);
  });
  
  industryRow.appendChild(industryLabel);
  industryRow.appendChild(industrySelect);
  
  return { row: industryRow, select: industrySelect };
}

/**
 * Tạo Project Selector cho LMKT (tái sử dụng cho nhiều UI)
 * @param {string} selectId - ID cho select element
 * @param {string} rowId - ID cho row container
 * @param {Object} theme - Theme object
 * @returns {Object} { row, select } - DOM elements
 */
function createProjectSelector(selectId = "project-select", rowId = "project-row", theme = null) {
  if (!theme) theme = getThemeTokens();
  
  const projectRow = document.createElement("div");
  projectRow.id = rowId;
  projectRow.style.cssText = "margin-bottom:12px;display:none;gap:8px;align-items:center";
  
  const projectLabel = document.createElement("label");
  projectLabel.textContent = "Dự án:";
  projectLabel.style.cssText = `font-weight:500;color:${theme.text}`;
  
  const projectSelect = document.createElement("select");
  projectSelect.id = selectId;
  projectSelect.style.cssText = `padding:6px 8px;border:1px solid ${theme.border};border-radius:3px;min-width:300px;background:${theme.inputBg};color:${theme.text}`;
  
  LMKT_PROJECT_DEFS.forEach((proj) => {
    const option = document.createElement("option");
    option.value = proj.service_code || proj.id;
    option.textContent = proj.name;
    projectSelect.appendChild(option);
  });
  
  projectRow.appendChild(projectLabel);
  projectRow.appendChild(projectSelect);
  
  return { row: projectRow, select: projectSelect };
}

function updateSelectOptions(select, options, preferredValue = '') {
  if (!select) return;
  select.innerHTML = '';

  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    if (item.color) option.style.color = item.color;
    select.appendChild(option);
  });

  if (preferredValue && options.some(o => o.value === preferredValue)) {
    select.value = preferredValue;
  } else if (options.length > 0) {
    select.value = options[0].value;
  }
}

// ===== GLOBAL SETTINGS PANEL =====
/**
 * Tạo Global Settings Panel - Hiển thị 1 lần duy nhất ở đầu trang
 * Chứa Domain, Industry, Project selectors dùng chung cho tất cả UI
 */
async function ensureGlobalSettingsPanel() {
  const existing = document.getElementById("global-settings-panel");
  if (existing) return existing;

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "global-settings-panel";
  wrapper.style.cssText = getFeatureCardStyle(theme) + ";margin-bottom:16px;";

  const title = document.createElement("div");
  title.textContent = "⚙️ Cài Đặt Chung";
  title.style.cssText = getFeatureTitleStyle(theme);

  // Tạo container cho settings dạng grid gọn gàng
  const settingsContainer = document.createElement("div");
  settingsContainer.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:12px";

  // Sử dụng helper functions với theme mặc định
  const { row: domainRow, select: domainSelect } = createDomainSelector("global-domain-select", theme);
  const { row: industryRow, select: industrySelect } = createIndustrySelector("global-industry-select", "global-industry-row", theme);
  const { row: projectRow, select: projectSelect } = createProjectSelector("global-project-select", "global-project-row", theme);
  
  // Style rows để vừa với grid
  domainRow.style.cssText = "display:flex;flex-direction:column;gap:4px";
  industryRow.style.cssText = "display:flex;flex-direction:column;gap:4px";
  projectRow.style.cssText = "display:flex;flex-direction:column;gap:4px;display:none";
  
  // Style labels và selects cho compact layout
  [domainRow, industryRow, projectRow].forEach(row => {
    const label = row.querySelector('label');
    const select = row.querySelector('select');
    if (label) {
      label.style.cssText = `font-weight:600;font-size:13px;color:${theme.text};margin-bottom:2px`;
    }
    if (select) {
      select.style.cssText = `padding:6px 8px;border:1px solid ${theme.border};border-radius:4px;width:100%;background:${theme.inputBg};color:${theme.text};font-size:12px`;
    }
  });
  
  // Set LMKT as default
  domainSelect.value = "lmkt";
  industrySelect.value = "bat-dong-san";
  projectSelect.value = LMKT_PROJECT_DEFS[0]?.service_code || "destino-centro";
  
  // Toggle project visibility - Lĩnh Vực luôn hiện, Dự án chỉ hiện khi LMKT
  domainSelect.onchange = () => {
    const isLmkt = domainSelect.value === "lmkt";
    projectRow.style.display = isLmkt ? "flex" : "none";
    if (isLmkt) {
      industrySelect.value = "bat-dong-san";
      industrySelect.disabled = true;
    } else {
      industrySelect.disabled = false;
    }
  };
  domainSelect.onchange(); // Init

  // Load categories from web_services button
  const loadBtn = document.createElement('button');
  loadBtn.textContent = "⬇️ Tải danh mục từ web_services";
  loadBtn.style.cssText = `padding:6px 10px;border:1px solid ${theme.border};border-radius:4px;background:${theme.bg};color:${theme.text};font-size:12px;cursor:pointer`;

  loadBtn.onclick = async () => {
    const domainKey = domainSelect.value || 'phanmemmottrieu';
    loadBtn.disabled = true;
    loadBtn.textContent = "⏳ Đang tải...";
    try {
      await loadCategoriesFromWebServices(domainKey);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = "⬇️ Tải danh mục từ web_services";
    }
  };

  // Append rows to grid container
  settingsContainer.append(domainRow, industryRow, projectRow);
  settingsContainer.append(loadBtn);
  
  // Append title and container to wrapper
  wrapper.append(title, settingsContainer);

  try {
    await waitForContextAuto();
    const container = ensureUnifiedUIContainer();
    if (container) {
      // Insert at the beginning
      container.insertBefore(wrapper, container.firstChild);
    }
  } catch (e) {
    console.warn("Không tìm thấy #context-auto:", e);
  }

  return wrapper;
}

async function loadCategoriesFromWebServices(domainKey) {
  const appId = DOMAIN_OPTIONS[domainKey]?.app_id;
  if (!appId) throw new Error("Không tìm thấy app_id");
  if (!window.csmApi?.getTableData) {
    throw new Error("Không tìm thấy window.csmApi.getTableData");
  }

  const rows = await window.csmApi.getTableData({
    app_id: appId,
    obj_name: "web_services",
    where: {
      operator: "AND",
      conditions: [
        { field: "id", type: "like", value: "" }
      ]
    }
  }).catch(() => ({ rows: [] }));

  const data = rows.rows || rows.data || [];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Không có dữ liệu web_services");
  }

  const domainSelect = document.getElementById("global-domain-select");
  const industrySelect = document.getElementById("global-industry-select");
  const projectSelect = document.getElementById("global-project-select");

  if (domainKey === 'lmkt') {
    const projectOptions = data
      .filter(item => item && (item.slug || item.service_code))
      .map(item => ({
        value: item.slug || item.service_code,
        label: item.name || item.category || item.slug || item.service_code
      }));

    updateSelectOptions(projectSelect, projectOptions, projectSelect?.value);
    if (projectSelect) projectSelect.dispatchEvent(new Event('change'));
  } else {
    const industryOptions = data
      .filter(item => item && (item.slug || item.service_code))
      .map(item => ({
        value: item.slug || item.service_code,
        label: item.name || item.category || item.slug || item.service_code
      }));

    updateSelectOptions(industrySelect, industryOptions, industrySelect?.value);
    if (industrySelect) industrySelect.dispatchEvent(new Event('change'));
  }

  if (domainSelect) domainSelect.dispatchEvent(new Event('change'));

  const message = `✅ Đã tải ${data.length} danh mục từ web_services`;
  if (window.showNotification) {
    window.showNotification({ type: 'success', message, duration: 3 });
  } else {
    alert(message);
  }
}

/**
 * Helper: Lấy giá trị từ Global Settings
 */
function getGlobalSettings() {
  const domainSelect = document.getElementById("global-domain-select");
  const industrySelect = document.getElementById("global-industry-select");
  const projectSelect = document.getElementById("global-project-select");
  
  const domain = domainSelect?.value || "phanmemmottrieu";
  const isLmkt = domain === "lmkt";
  
  return {
    domain,
    domainKey: domain,
    isLmkt,
    industry: industrySelect?.value || "bat-dong-san",
    project: projectSelect?.value || "du-an-quan-9"
  };
}

async function ensureUI() {
  const existing = document.getElementById("multi-domain-ui");
  if (existing) return existing;

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "multi-domain-ui";
  wrapper.style.cssText = getFeatureCardStyle(theme);

  const title = document.createElement("div");
  title.textContent = "🌐 Multi-Domain Content Manager (Chống Chất AI)";
  title.style.cssText = getFeatureTitleStyle(theme);

  // Note: Sử dụng Global Settings Panel (không tạo selector riêng nữa)
  const note = document.createElement("div");
  note.id = "service-content-tip";
  note.style.cssText = `margin-bottom:12px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:12px;color:${theme.info};`;
  note.innerHTML = "💡 <strong>Tip:</strong> LMKT dùng <strong>Dự án</strong> làm category; Phanmemmottrieu dùng <strong>Lĩnh vực</strong>. Chọn ở <strong>Cài Đặt Chung</strong> phía trên.";

  // Textarea
  const textarea = document.createElement("textarea");
  textarea.id = "content-input";
  textarea.style.cssText = `width:100%;min-height:200px;font-family:monospace;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};margin-bottom:8px`;
  textarea.placeholder = "Dán JSON Zalo/Facebook hoặc nội dung vào đây...";

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

  const uploadZaloBtn = createButton("📱 Upload Zalo JSON", "#0068ff");
  const uploadFbBtn = createButton("👍 Upload Facebook JSON", "#1877f2");
  const createBtn = createButton("✍️ Tạo Bài", "#52c41a");
  const clearHistoryBtn = createButton("🗑️ Xóa Lịch Sử", "#f5222d");

  // File inputs (hidden)
  const zaloFileInput = createFileInput("zalo-file");
  const fbFileInput = createFileInput("fb-file");

  // Event handlers (không cần domain/industry onchange nữa - dùng global)
  uploadZaloBtn.onclick = () => zaloFileInput.click();
  uploadFbBtn.onclick = () => fbFileInput.click();
  
  zaloFileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const valid = parseZaloJson(data);
        textarea.value = JSON.stringify(valid, null, 2);
        thongbao(`✅ Đã load ${valid.length} tin nhắn Zalo hợp lệ`);
      } catch (e) {
        canhbao(`❌ Lỗi parse JSON: ${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  fbFileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const valid = parseFacebookJson(data);
        textarea.value = JSON.stringify(valid, null, 2);
        thongbao(`✅ Đã load ${valid.length} posts Facebook hợp lệ`);
      } catch (e) {
        canhbao(`❌ Lỗi parse JSON: ${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  createBtn.onclick = async () => {
    // Kiểm tra xem có đang xử lý không
    if (isProcessing) {
      canhbao("⚠️ Hệ thống đang xử lý bài viết khác, vui lòng đợi!");
      return;
    }
    
    const content = textarea.value.trim();
    if (!content) return canhbao("❌ Vui lòng nhập nội dung!");
    
    // Sử dụng Global Settings
    const globalSettings = getGlobalSettings();
    const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
    
    try {
      // ✅ PRIORITY 1: Check if we have full messages in window variable (from Zalo auto scanner)
      // This has all data including base64 images
      let items;
      if (window.__pendingZaloMessages && Array.isArray(window.__pendingZaloMessages) && window.__pendingZaloMessages.length > 0) {
        console.log(`✅ Using full messages from window.__pendingZaloMessages (${window.__pendingZaloMessages.length} items)`);
        items = window.__pendingZaloMessages;
        // Clear after use
        window.__pendingZaloMessages = null;
      } else {
        // ✅ PRIORITY 2: Parse from textarea (fallback, might not have base64)
        console.log(`⚠️ Parsing messages from textarea (may not have base64 images)`);
        items = JSON.parse(content);
      }
      
      const arr = Array.isArray(items) ? items : [items];
      
      // ✅ NORMALIZE messages: preserve original structure (attachments/imageUrls...)
      const normalizedArr = arr.map((item, idx) => {
        if (!item || typeof item !== 'object') {
          console.warn(`[parseMessages] Item ${idx} is not an object:`, typeof item);
          return null;
        }
        return {
          ...item,
          // Ensure content fallback is a string
          content: (item.content || item.text || item.message || item.body || '').toString().trim(),
          // Add sender if missing
          sender: item.sender || item.author || item.name || 'Unknown',
          // Add date if missing
          date: item.date || item.created_at || item.timestamp || new Date().toLocaleDateString('vi-VN')
        };
      }).filter(item => item !== null);
      
      console.log(`[parseMessages] Normalized ${normalizedArr.length}/${arr.length} messages`);
      
      // ✅ LỌC CHỈ LẤY TIN CÓ HÌNH ẢNH VÀ CONTENT
      const arrWithImages = normalizedArr.filter(item => {
        const essentials = getMessageEssentials(item);
        const hasImages = essentials.hasImages;
        const hasContent = essentials.hasText;
        
        if (!hasImages) {
          console.warn(`⚠️ Bỏ qua tin không có hình:`, item.content?.substring(0, 50) || 'No content');
        }
        if (!hasContent) {
          console.warn(`⚠️ Bỏ qua tin không có nội dung:`, item.sender || 'Unknown sender');
        }
        
        return hasImages && hasContent;
      });
      
      const skippedCount = normalizedArr.length - arrWithImages.length;
      if (skippedCount > 0) {
        const msg = `⚠️ Đã lọc bỏ ${skippedCount} tin (không có hình hoặc nội dung). Chỉ xử lý ${arrWithImages.length}/${normalizedArr.length} tin.`;
        console.warn(msg);
        if (!isZaloAutoMode) {
          canhbao(msg);
        }
      }
      
      if (arrWithImages.length === 0) {
        return canhbao("❌ Không có tin nhắn nào có đủ nội dung và hình ảnh để đăng!");
      }
      
      if (!isZaloAutoMode) {
        if (!confirm(`Tạo ${arrWithImages.length} bài viết có hình ảnh? (Chạy TUẦN TỰ từng bài, mỗi bài hoàn tất (AI + lưu DB + đưa lên server) rồi tiếp bài tiếp)`)) return;
      } else {
        console.log(`✅ [Auto Mode] Tự động xác nhận tạo ${arrWithImages.length} bài viết (đã lọc ${skippedCount} tin không có hình)`);
      }
      
      // Bắt đầu processing
      isProcessing = true;
      createBtn.disabled = true;
      createBtn.textContent = "🔒 Đang xử lý...";
      
      console.log(`\n========== BẮT ĐẦU XỬ LÝ ${arrWithImages.length} BÀI VIẾT (TUẦN TỰ) - ${new Date().toLocaleTimeString()} ==========`);
      
      let ok = 0, fail = 0;
      for (let i = 0; i < arrWithImages.length; i++) {
        console.log(`\n--- BÀI ${i + 1}/${arrWithImages.length} - BẮT ĐẦU - ${new Date().toLocaleTimeString()} ---`);
        try {
          thongbao(`🔄 [${i + 1}/${arrWithImages.length}] Đang xử lý...`);
          await processContent(arrWithImages[i], {
            app_id: domainConfig.app_id,
            domain: domainConfig.value,
            domainKey: globalSettings.domainKey,
            service_type: globalSettings.isLmkt ? globalSettings.project : globalSettings.industry, // Sẽ bị override nếu có config_id
            project: globalSettings.project, // Pass project để buildDetail xử lý đúng
            author: globalSettings.isLmkt ? "LMKT Expert" : "Auto Content",
            avatar: globalSettings.isLmkt ? "https://h-holding.vn/media/icon.png" : undefined,
            // ✅ Pass Zalo context để record posted messages (nếu có)
            // ⚠️ Nếu có config_id, processContent sẽ override service_type/project/fanpage từ config
            config_id: window.__currentZaloConfigId,
            groupName: window.__currentZaloGroupName,
            isZaloMessage: !!window.__currentZaloConfigId
          });
          ok++;
          console.log(`--- BÀI ${i + 1}/${arrWithImages.length} - THÀNH CÔNG - ${new Date().toLocaleTimeString()} ---`);
          thongbao(`✅ [${i + 1}/${arrWithImages.length}] Đưa dữ liệu lên server hoàn tất!`);
        } catch (e) {
          fail++;
          console.error(`--- BÀI ${i + 1}/${arrWithImages.length} - LỖI - ${new Date().toLocaleTimeString()} ---`, e);
          canhbao(`❌ [${i + 1}/${arrWithImages.length}] Lỗi: ${e.message}`);
        }
        
        // Không chờ theo tiêu chuẩn Facebook Auto Post
        if (i < arrWithImages.length - 1) {
          const remaining = arrWithImages.length - i - 1;
          thongbao(`✅ BÀI ${i + 1}/${arrWithImages.length} HOÀN TẤT! Tiếp bài tiếp (${remaining} bài còn lại)...`);
        }
      }
      
      console.log(`\n========== KẾT THÚC - ${new Date().toLocaleTimeString()} ==========`);
      thongbao(`✅ Hoàn tất! Thành công: ${ok}, Lỗi: ${fail}`);
      
      // ✅ Clear textarea sau khi xử lý xong
      textarea.value = '';
      console.log(`🧹 Cleared textarea after processing`);
      
    } catch (e) {
      console.error("Lỗi parse JSON:", e);
      canhbao(`❌ JSON không hợp lệ: ${e.message}`);
    } finally {
      // Kết thúc processing
      isProcessing = false;
      createBtn.disabled = false;
      createBtn.textContent = "✍️ Tạo Bài";
      
      // ✅ Clear window variables để tránh reuse
      window.__pendingZaloMessages = null;
      window.__currentZaloGroupName = null;
      window.__currentZaloConfigId = null;
    }
  };

  clearHistoryBtn.onclick = () => confirm("Xóa lịch sử?") && clearArticleHistory();

  btnRow.append(uploadZaloBtn, uploadFbBtn, createBtn, clearHistoryBtn);
  wrapper.append(title, note, textarea, btnRow, zaloFileInput, fbFileInput);

  try {
    await waitForContextAuto();
    const container = ensureUnifiedUIContainer();
    if (container) {
      container.appendChild(wrapper);
      ensureZaloMultiGroupUI(container);
    } else {
      canhbao("Không tìm thấy #context-auto");
    }
  } catch (e) {
    canhbao("Không tìm thấy #context-auto");
  }
  
  return wrapper;
}

function createButton(text, color) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = `padding:6px 12px;font-size:12px;font-weight:500;background:${color};color:#fff;border:none;cursor:pointer;border-radius:3px`;
  return btn;
}

function createFileInput(id) {
  const input = document.createElement("input");
  input.id = id;
  input.type = "file";
  input.accept = ".json";
  input.style.display = "none";
  return input;
}

const ZALO_GROUP_LIST_KEY = "zalo_multi_group_list";
const ZALO_GROUP_STATE_KEY = "zalo_multi_group_state";
const ZALO_DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 phút mặc định
const ZALO_GROUP_SCAN_TIMEOUT_MS = 30000; // Max 30 giây scan 1 nhóm (webview tuần tự)

// Multi-config scanner management
// { config_id: { timer, status, lastScanTime, groupIndex, isScanning, scanStartTime } }
let zaloConfigScanners = {};
let isZaloScanning = false;

// ========== ZALO MESSAGE SCRAPING CORE LOGIC ==========
/**
 * Chờ image load xong (nếu chưa complete)
 */
const waitForImageLoad = (img) => {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      console.log('🖼️ waitForImageLoad: Image already loaded');
      resolve(true);
    } else {
      console.log('🖼️ waitForImageLoad: Waiting for image to load...');
      const timeout = setTimeout(() => {
        console.warn('🖼️ waitForImageLoad: Timeout after 3s');
        resolve(false);
      }, 3000);
      
      img.onload = () => {
        clearTimeout(timeout);
        console.log('🖼️ waitForImageLoad: Image loaded successfully');
        resolve(true);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        console.error('🖼️ waitForImageLoad: Image load error');
        resolve(false);
      };
    }
  });
};

/**
 * Hàm chuyển ảnh sang Base64
 */
const imgToBase64 = (imgEl) => {
  return new Promise((resolve) => {
    if (!imgEl) {
      console.log('🖼️ imgToBase64: imgEl is null/undefined');
      return resolve(null);
    }
    if (!imgEl.src) {
      console.log('🖼️ imgToBase64: imgEl.src is empty', imgEl);
      return resolve(null);
    }
    
    console.log('🖼️ imgToBase64: Processing', {
      src: imgEl.src.substring(0, 100),
      naturalWidth: imgEl.naturalWidth,
      naturalHeight: imgEl.naturalHeight,
      width: imgEl.width,
      height: imgEl.height,
      complete: imgEl.complete
    });
    
    try {
      const canvas = document.createElement('canvas');
      const w = imgEl.naturalWidth || imgEl.width;
      const h = imgEl.naturalHeight || imgEl.height;
      
      if (!w || !h) {
        console.log('🖼️ imgToBase64: Invalid dimensions', w, h);
        return resolve(null);
      }
      
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, 0, 0);
      const base64 = canvas.toDataURL('image/png');
      console.log('🖼️ imgToBase64: Success, base64 length:', base64.length);
      resolve(base64);
    } catch (e) {
      console.log('🖼️ imgToBase64: Error', e.message);
      resolve(null);
    }
  });
};

/**
 * Chuyển "Hôm nay", "Hôm qua" thành ngày thực DD/MM/YYYY
 */
const convertDateText = (dateText) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const formatDate = (date) => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };
  
  if (dateText.includes('Hôm nay')) {
    return formatDate(today);
  } else if (dateText.includes('Hôm qua')) {
    return formatDate(yesterday);
  }
  return dateText;
};

/**
 * Auto scroll lên để load hết tin nhắn cũ
 */
const autoScrollChatList = async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  
  const selectors = [
    '.chat-message-list',
    '.chat-msg-scroll',
    '.msg-list',
    '.zchat__body',
    '.chat-box__content'
  ];

  let scroller = null;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.scrollHeight > el.clientHeight + 50) {
      scroller = el;
      break;
    }
  }

  if (!scroller) {
    scroller = document.scrollingElement || document.documentElement;
  }

  const maxScrolls = 80;
  const waitMs = 500;
  let lastHeight = -1;
  let stableCount = 0;

  for (let i = 0; i < maxScrolls; i += 1) {
    scroller.scrollTop = 0;
    await sleep(waitMs);
    const currentHeight = scroller.scrollHeight;
    if (currentHeight === lastHeight) {
      stableCount += 1;
      if (stableCount >= 3) break;
    } else {
      stableCount = 0;
      lastHeight = currentHeight;
    }
  }
};

/**
 * Convert một image link sang base64 (chạy trong webview)
 * Cần được inject vào webview
 */
const convertImageLinkToBase64 = async (imageSrc) => {
  return new Promise((resolve) => {
    if (!imageSrc) return resolve(null);
    
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => {
        console.warn(`⏱️ Image load timeout: ${imageSrc.substring(0, 80)}`);
        resolve(null);
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          
          if (!canvas.width || !canvas.height) {
            console.warn(`⚠️ Invalid image dimensions: ${canvas.width}x${canvas.height}`);
            resolve(null);
            return;
          }
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          console.log(`✅ Converted link to base64: ${Math.round(base64.length / 1024)}KB`);
          resolve(base64);
        } catch (e) {
          console.error(`❌ Canvas error: ${e.message}`);
          resolve(null);
        }
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        console.warn(`❌ Image load failed: ${imageSrc.substring(0, 80)}`);
        resolve(null);
      };
      
      img.src = imageSrc;
    } catch (e) {
      console.error(`❌ Error converting image: ${e.message}`);
      resolve(null);
    }
  });
};

/**
 * Hàm helper: Dump HTML structure để debug
 */
const dumpMessageStructure = (message) => {
  console.group(`📄 HTML Structure Dump`);
  
  // Get outerHTML (limited length)
  let html = message.outerHTML;
  if (html.length > 2000) {
    html = html.substring(0, 2000) + '... (truncated)';
  }
  
  // Pretty print với line breaks
  html = html.replace(/></g, '>\n<');
  console.log('%c' + html, 'font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all;');
  
  console.groupEnd();
};

/**
 * Hàm helper: Quick inspect một element
 */
const inspectElement = (elem, maxDepth = 2, currentDepth = 0) => {
  if (!elem || currentDepth > maxDepth) return '';
  
  const indent = '  '.repeat(currentDepth);
  const tag = elem.tagName?.toLowerCase() || 'unknown';
  const cls = elem.className ? ` class="${elem.className.substring(0, 50)}"` : '';
  const id = elem.id ? ` id="${elem.id}"` : '';
  const src = elem.src ? ` src="${elem.src.substring(0, 50)}"` : '';
  
  let result = `${indent}<${tag}${id}${cls}${src}>\n`;
  
  for (let i = 0; i < Math.min(elem.children.length, 3); i++) {
    result += inspectElement(elem.children[i], maxDepth, currentDepth + 1);
  }
  
  if (elem.children.length > 3) {
    result += `${indent}  ... ${elem.children.length - 3} more children\n`;
  }
  
  return result;
};

/**
 * Làm sạch text từ tin nhắn - ĐƠN GIẢN, KHÔNG FILTER QUÁ STRICT
 */
const cleanMessageText = (rawText) => {
  if (!rawText) return '';
  
  // Chỉ normalize whitespace
  const text = rawText.replace(/\s+/g, ' ').trim();
  
  // Trả về text gốc - KHÔNG loại bỏ gì cả
  // Zalo content thường đầy đủ, không cần filter phức tạp
  return text;
};

/**
 * Trích xuất text từ message wrapper (DOM element - dùng cho Zalo scanner)
 * LOGIC ĐƠN GIẢN THEO CODE CŨ - ĐÃ HOẠT ĐỘNG TốT
 */
const extractZaloMessageText = (wrap) => {
  if (!wrap) {
    console.warn('⚠️ [extractText] wrap is null/undefined');
    return '';
  }

  // Dùng selector CHÍNH XÁC như code cũ
  const textContainer = wrap.querySelector('[data-component="text-container"]');
  if (textContainer && textContainer.innerText) {
    const text = textContainer.innerText.trim();
    if (text) {
      console.log(`✅ [extractText] Found text (${text.length} chars):`, text.substring(0, 100));
      return text;
    }
  }

  console.warn('⚠️ [extractText] Không tìm thấy [data-component="text-container"]');
  return '';
};

/**
 * Trích xuất ảnh từ message wrapper
 * Trả về mảng Base64 strings
 */
const extractMessageImages = async (wrap) => {
  const images = [];
  
  // PHƯƠNG PHÁP 1: Tìm img.zimg-el (Zalo standard)
  let imgElements = Array.from(wrap.querySelectorAll('img.zimg-el'));
  
  // PHƯƠNG PHÁP 2: Tìm tất cả img tags và filter
  if (imgElements.length === 0) {
    const allImages = Array.from(wrap.querySelectorAll('img'));
    imgElements = allImages.filter(img => {
      const src = img.src || '';
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      
      // Loại bỏ avatar/icon
      const isLikelyIcon = width < 50 || height < 50 || 
                           src.includes('avatar') || 
                           src.includes('icon');
      return !isLikelyIcon;
    });
  }
  
  // PHƯƠNG PHÁP 3: Tìm trong image containers
  if (imgElements.length === 0) {
    const containers = wrap.querySelectorAll(
      '.chatImageMessage--audit, .img-msg-v2, .message-image, [class*="image-message"]'
    );
    
    for (const container of containers) {
      const img = container.querySelector('img');
      if (img) {
        imgElements.push(img);
      } else {
        // Kiểm tra CSS background-image với Base64
        const styleStr = container.getAttribute('style') || '';
        const tinyUrlMatch = styleStr.match(/--tiny-url:\s*url\((data:image\/[^)]+)\)/);
        if (tinyUrlMatch && tinyUrlMatch[1]) {
          images.push(tinyUrlMatch[1]);
          continue;
        }
      }
    }
  }
  
  // PHƯƠNG PHÁP 4: Tìm elements với background-image
  if (imgElements.length === 0 && images.length === 0) {
    const elementsWithBg = wrap.querySelectorAll('[style*="background-image"]');
    
    for (const el of elementsWithBg) {
      const style = el.getAttribute('style') || '';
      const bgMatch = style.match(/background-image:\s*url\((data:image[^)]+)\)/);
      if (bgMatch && bgMatch[1]) {
        images.push(bgMatch[1]);
      }
    }
  }
  
  // Convert img elements sang Base64
  for (const img of imgElements) {
    // Đợi image load xong
    if (!img.complete) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        img.onload = () => { clearTimeout(timeout); resolve(); };
        img.onerror = () => { clearTimeout(timeout); resolve(); };
      });
    }
    
    const base64 = await imgToBase64(img);
    if (base64) {
      images.push(base64);
    }
  }
  
  return images;
};

/**
 * Wait for Zalo DOM elements to be ready với timeout
 * @param {number} maxWaitMs - Max time to wait (default 15s)
 * @returns {Promise<boolean>} - true nếu DOM ready, false nếu timeout
 */
window.waitForZaloDOM = async (maxWaitMs = 15000) => {
  const startTime = Date.now();
  const checkInterval = 500; // Check mỗi 500ms
  
  console.log(`⏳ Chờ Zalo DOM ready (max ${maxWaitMs/1000}s)...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    // Thử tìm block-date hoặc bất kỳ fallback selector nào
    const blockDates = document.querySelectorAll('.block-date');
    if (blockDates.length > 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ DOM ready sau ${elapsed}s - tìm thấy ${blockDates.length} block-date`);
      return true;
    }
    
    // Thử fallback selectors
    const fallbackSelectors = [
      '.chat-item',
      '[class*="chat-item"]',
      '[class*="message-item"]',
      '[class*="MessageItem"]'
    ];
    
    for (const selector of fallbackSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ DOM ready sau ${elapsed}s - tìm thấy ${elements.length} items với selector: ${selector}`);
        return true;
      }
    }
    
    // Chờ trước khi check lại
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  console.warn(`⚠️ Timeout sau ${maxWaitMs/1000}s - DOM chưa ready`);
  return false;
};

/**
 * Hàm chính: Quét tin nhắn Zalo từ trang đang mở
 * @param {string} groupName - Tên nhóm (hiện tại chỉ dùng để log, không dùng để navigate)
 * @returns {Promise<Array>} - Mảng tin nhắn: [{date, time, sender, content, images: [base64...]}]
 */
window.zaloScanGroup = async (groupName) => {
  console.log(`🔍 [v2.0] Bắt đầu quét nhóm: ${groupName}`);
  window.__zaloScanGroupVersion = '2.0'; // Version tracking
  
  try {
    // ✅ CHỜ DOM READY thay vì fixed delay
    const domReady = await window.waitForZaloDOM(15000);
    if (!domReady) {
      console.warn(`⚠️ DOM chưa ready sau 15s - trả về empty array cho: ${groupName}`);
      return [];
    }
    
    // Scroll để load hết tin nhắn
    await autoScrollChatList();
    
    // Lấy toàn bộ block-date
    const allBlockDates = document.querySelectorAll('.block-date');
    const finalData = [];
    const blocks = [];
    
    console.log(`🗓️ Tìm thấy ${allBlockDates.length} block-date`);
    
    if (allBlockDates.length === 0) {
      console.warn('⚠️ Không tìm thấy .block-date, thử fallback selectors...');
      
      // ✅ Thử nhiều selector khác nhau
      const fallbackSelectors = [
        '.chat-item',
        '[class*="chat-item"]',
        '[class*="message-item"]',
        '[class*="MessageItem"]',
        '.message',
        '[data-id][class*="card"]'
      ];
      
      let fallbackChatItems = null;
      for (const selector of fallbackSelectors) {
        fallbackChatItems = document.querySelectorAll(selector);
        if (fallbackChatItems.length > 0) {
          console.log(`✅ Fallback: Tìm thấy ${fallbackChatItems.length} items với selector: ${selector}`);
          break;
        }
      }
      
      if (!fallbackChatItems || fallbackChatItems.length === 0) {
        console.error('❌ Không tìm thấy chat items với bất kỳ selector nào.');
        console.error('💡 UI có thể chưa load xong hoặc Zalo đã thay đổi cấu trúc.');
        console.error('🔍 Dumping current DOM structure...');
        
        // Debug: Dump DOM structure
        const bodyClasses = document.body.className;
        const allDivs = document.querySelectorAll('div[class]');
        const uniqueClasses = new Set();
        allDivs.forEach(div => {
          div.className.split(' ').forEach(cls => {
            if (cls && (cls.includes('chat') || cls.includes('message') || cls.includes('item') || cls.includes('card'))) {
              uniqueClasses.add(cls);
            }
          });
        });
        console.log(`📋 Body classes: ${bodyClasses}`);
        console.log(`📋 Relevant classes found: ${Array.from(uniqueClasses).join(', ')}`);
        
        // ✅ KHÔNG throw error - return empty array để tiếp tục với nhóm khác
        console.warn(`⚠️ Trả về empty array cho nhóm: ${groupName}`);
        return [];
      }
      
      const fallbackDateEl = document.querySelector('.chat-date [data-translate-inner="STR_DATE_TIME"], [class*="chat-date"], [data-translate-inner="STR_DATE_TIME"]');
      let fallbackDateStr = fallbackDateEl ? fallbackDateEl.innerText.trim() : '';
      fallbackDateStr = convertDateText(fallbackDateStr);

      console.log(`✅ Sử dụng fallback: ${fallbackChatItems.length} chat items`);
      blocks.push({
        dateStr: fallbackDateStr || new Date().toLocaleDateString('vi-VN'),
        chatItems: fallbackChatItems
      });
    } else {
      for (const blockDate of allBlockDates) {
        const dateElement = blockDate.querySelector('.chat-date [data-translate-inner="STR_DATE_TIME"]');
        let dateStr = dateElement ? dateElement.innerText.trim() : '';
        dateStr = convertDateText(dateStr);

        const chatItems = blockDate.querySelectorAll('.chat-item');
        blocks.push({ dateStr, chatItems });
      }
    }

    for (const block of blocks) {
      const { dateStr, chatItems } = block;
      console.log(`  📅 ${dateStr}: ${chatItems.length} chat-items`);
      
      let lastKnownTime = '';
      let pendingMessages = [];
      let lastKnownSender = '';
      let currentMessage = null; // GOM tin nhắn theo sender

      for (const chatItem of chatItems) {
        const msgWrappers = chatItem.querySelectorAll('.message-wrapper');

        for (const wrap of msgWrappers) {
          const timeElementInWrap = wrap.querySelector('.card-send-time__sendTime');
          const timeElementInItem = chatItem.querySelector('.card-send-time__sendTime');
          const timeElement = timeElementInWrap || timeElementInItem;
          const timeStr = timeElement ? timeElement.innerText.trim() : '';

          // Kiểm tra có sender name không
          const senderNameEl = wrap.querySelector('.message-sender-name-content-wrapper');
          
          if (senderNameEl) {
            // ĐÂY LÀ TIN NHẮN MỚI - GOM CODE CŨ
            const senderText = senderNameEl.innerText.trim();
            
            // Finish message cũ nếu có
            if (currentMessage) {
              // Xử lý time backfill cho message cũ
              if (!currentMessage.time && lastKnownTime) {
                currentMessage.time = lastKnownTime;
              }
              if (!currentMessage.time) {
                pendingMessages.push(currentMessage);
              }
              finalData.push(currentMessage);
            }
            
            // Tạo message mới
            currentMessage = {
              date: dateStr,
              time: timeStr || '',
              sender: senderText,
              content: '',
              images: []
            };
            
            if (timeStr) {
              // Backfill time cho pending messages
              if (pendingMessages.length) {
                pendingMessages.forEach((msg) => {
                  msg.time = timeStr;
                });
                pendingMessages = [];
              }
              lastKnownTime = timeStr;
            }
            
            lastKnownSender = senderText;
          }
          
          // GOM NỘI DUNG VÀ ẢNH VÀO MESSAGE HIỆN TẠI
          if (currentMessage) {
            // Lấy nội dung text và CỘNG DỒN
            const messageText = extractZaloMessageText(wrap);
            if (messageText && messageText.trim()) {
              if (currentMessage.content) {
                currentMessage.content += '\n' + messageText.trim();
              } else {
                currentMessage.content = messageText.trim();
              }
            }

            // Lấy ảnh và CỘNG DỒN
            const messageImages = await extractMessageImages(wrap);
            if (messageImages.length > 0) {
              currentMessage.images.push(...messageImages);
            }
            
            // Update time nếu wrapper này có time
            if (timeStr && !currentMessage.time) {
              currentMessage.time = timeStr;
              if (pendingMessages.length) {
                pendingMessages.forEach((msg) => {
                  msg.time = timeStr;
                });
                pendingMessages = [];
              }
              lastKnownTime = timeStr;
            }
          } else {
            // Trường hợp không có currentMessage (wrapper đầu tiên chưa có sender)
            // Tạo message mặc định
            currentMessage = {
              date: dateStr,
              time: timeStr || lastKnownTime || '',
              sender: lastKnownSender || 'Unknown',
              content: '',
              images: []
            };
            
            const messageText = extractZaloMessageText(wrap);
            if (messageText && messageText.trim()) {
              currentMessage.content = messageText.trim();
            }
            
            const messageImages = await extractMessageImages(wrap);
            if (messageImages.length > 0) {
              currentMessage.images.push(...messageImages);
            }
          }
        }
      }
      
      // FINISH message cuối cùng của block
      if (currentMessage) {
        if (!currentMessage.time && lastKnownTime) {
          currentMessage.time = lastKnownTime;
        }
        if (!currentMessage.time) {
          pendingMessages.push(currentMessage);
        }
        // Chỉ push nếu có content hoặc ảnh
        if (currentMessage.content || currentMessage.images.length > 0) {
          finalData.push(currentMessage);
        }
      }
    }

    console.log(`✅ Quét xong nhóm ${groupName}: ${finalData.length} tin nhắn`);
    
    // Log summary về ảnh
    const totalImages = finalData.reduce((sum, msg) => sum + (msg.images?.length || 0), 0);
    const messagesWithImages = finalData.filter(msg => msg.images?.length > 0).length;
    const totalSizeKB = Math.round(JSON.stringify(finalData).length / 1024);
    
    console.log(`📊 Thống kê:`);
    console.log(`   - Tổng số tin nhắn: ${finalData.length}`);
    console.log(`   - Tin nhắn có ảnh: ${messagesWithImages}`);
    console.log(`   - Tổng số ảnh: ${totalImages}`);
    console.log(`   - Kích thước JSON: ${totalSizeKB}KB`);
    
    return finalData;
    
  } catch (error) {
    console.error(`❌ Lỗi khi quét nhóm ${groupName}:`, error);
    console.warn(`⚠️ Trả về empty array do lỗi quét - nhóm sẽ được thử lại sau`);
    // ✅ Return [] thay vì throw - cho phép tiếp tục với các nhóm khác
    return [];
  }
};


/**
 * Hàm quét Zalo từ webview (NW.js)
 * @param {string} webviewId - ID của webview element (VD: "U_zalo_group_1")
 * @param {string} groupName - Tên nhóm Zalo
 * @returns {Promise<Array>} - Mảng tin nhắn
 */
window.zaloScanGroupFromWebview = async (webviewId, groupName) => {
  const webview = document.getElementById(webviewId);
  if (!webview) {
    throw new Error(`Không tìm thấy webview ID: ${webviewId}`);
  }

  const REQUIRED_VERSION = '2.0'; // Version của code helper functions

  // Bước 1: Check version và re-inject nếu cần
  const needsReinjection = await new Promise((resolve) => {
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        console.log('⚠️ Timeout checking version - will re-inject');
        resolve(true); // Re-inject nếu timeout
      }
    }, 1000);

    const checkHandler = (e) => {
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.__versionCheck) {
          responded = true;
          clearTimeout(timeout);
          webview.removeEventListener('consolemessage', checkHandler);
          const isOldVersion = parsed.version !== REQUIRED_VERSION;
          if (isOldVersion) {
            console.log(`🔄 Version cũ (${parsed.version}) - cần re-inject (${REQUIRED_VERSION})`);
          } else {
            console.log(`✅ Version đúng (${REQUIRED_VERSION}) - không cần re-inject`);
          }
          resolve(isOldVersion);
        }
      } catch {}
    };

    webview.addEventListener('consolemessage', checkHandler);
    webview.executeScript({ 
      code: `console.log(JSON.stringify({ __versionCheck: true, version: window.__zaloScanGroupVersion || 'unknown' }));` 
    });
  });

  // Bước 2: Inject helper functions vào webview (nếu cần hoặc lần đầu)
  if (needsReinjection || !window._zaloHelpersInjected) {
    console.log('🔧 Injecting Zalo helper functions...');
    await new Promise((resolve) => {
      const injectHelpersCode = `
        window.sleep = ${((ms) => new Promise((resolve) => setTimeout(resolve, ms))).toString()};
        window.imgToBase64 = ${imgToBase64.toString()};
        window.convertDateText = ${convertDateText.toString()};
        window.autoScrollChatList = ${autoScrollChatList.toString()};
        window.cleanMessageText = ${cleanMessageText.toString()};
        window.extractZaloMessageText = ${extractZaloMessageText.toString()};
        window.extractMessageImages = ${extractMessageImages.toString()};
        window.waitForZaloDOM = ${window.waitForZaloDOM.toString()};
        window.zaloScanGroup = ${window.zaloScanGroup.toString()};
        console.log('✅ Zalo helpers injected (version: ${REQUIRED_VERSION})');
      `;
      
      webview.executeScript({ code: injectHelpersCode });
      window._zaloHelpersInjected = true;
      resolve();
    });
  }

  // Bước 3: Lắng nghe consolemessage từ webview
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout scanning group: ${groupName}`));
    }, 60000); // 60 giây timeout

    let chunks = [];
    let expectedChunks = 0;

    const handleConsoleMessage = async (e) => {
      try {
        let parsed;
        try {
          parsed = JSON.parse(e.message);
        } catch {
          return; // Không phải JSON, bỏ qua
        }

        if (!parsed || !parsed.__zaloScanResult) {
          return;
        }

        // Xử lý chunked data
        if (parsed.isChunked) {
          if (parsed.chunkIndex === 0) {
            expectedChunks = parsed.totalChunks;
            chunks = new Array(expectedChunks);
            console.log(`📦 Receiving ${expectedChunks} chunks...`);
          }
          
          chunks[parsed.chunkIndex] = parsed.data;
          console.log(`  ✅ Chunk ${parsed.chunkIndex + 1}/${expectedChunks} received`);
          
          if (chunks.filter(Boolean).length === expectedChunks) {
            webview.removeEventListener('consolemessage', handleConsoleMessage);
            clearTimeout(timeout);
            const mergedData = chunks.flat();
            console.log(`✅ All chunks received: ${mergedData.length} messages`);
            resolve(mergedData);
          }
          return;
        }

        // Non-chunked response
        webview.removeEventListener('consolemessage', handleConsoleMessage);
        clearTimeout(timeout);

        if (parsed.success) {
          resolve(parsed.data);
        } else {
          reject(new Error(parsed.error || 'Scan error'));
        }
      } catch (e) {
        webview.removeEventListener('consolemessage', handleConsoleMessage);
        clearTimeout(timeout);
        reject(new Error(`Console message error: ${e.message}`));
      }
    };

    webview.addEventListener('consolemessage', handleConsoleMessage);

    // Bước 4: Gọi zaloScanGroup và gửi kết quả qua console.log
    const escapedGroupName = JSON.stringify(groupName);
    
    const scanCode = `
      (async function() {
        try {
          if (typeof window.zaloScanGroup !== 'function') {
            console.log(JSON.stringify({ 
              __zaloScanResult: true, 
              success: false, 
              error: 'zaloScanGroup not found',
              groupName: ${escapedGroupName}
            }));
            return;
          }
          
          const result = await window.zaloScanGroup(${escapedGroupName});
          const jsonStr = JSON.stringify(result);
          const sizeKB = Math.round(jsonStr.length / 1024);
          const MAX_SIZE_KB = 400;
          
          if (sizeKB > MAX_SIZE_KB) {
            const totalMsgs = result.length;
            const avgSizePerMsg = totalMsgs > 0 ? (jsonStr.length / totalMsgs) : 0;
            let msgsPerChunk = Math.floor(MAX_SIZE_KB * 1024 / Math.max(1, avgSizePerMsg));
            if (!Number.isFinite(msgsPerChunk) || msgsPerChunk < 1) msgsPerChunk = 1;
            const totalChunks = Math.ceil(totalMsgs / msgsPerChunk);
            
            for (let i = 0; i < totalChunks; i++) {
              const start = i * msgsPerChunk;
              const end = Math.min(start + msgsPerChunk, totalMsgs);
              const chunk = result.slice(start, end);
              
              console.log(JSON.stringify({ 
                __zaloScanResult: true, 
                isChunked: true,
                chunkIndex: i,
                totalChunks: totalChunks,
                data: chunk,
                groupName: ${escapedGroupName}
              }));
            }
          } else {
            console.log(JSON.stringify({ 
              __zaloScanResult: true, 
              success: true, 
              data: result,
              groupName: ${escapedGroupName}
            }));
          }
        } catch (error) {
          console.log(JSON.stringify({ 
            __zaloScanResult: true, 
            success: false, 
            error: error.message || String(error),
            groupName: ${escapedGroupName}
          }));
        }
      })();
    `;

    webview.executeScript({ code: scanCode });
  });
};

function parseGroupList(raw) {
  if (!raw || typeof raw !== "string") return [];
  // Chỉ split theo newline để support tên nhóm có dấu phẩy (VD: "Q1,3 50T")
  return raw
    .split(/\n/g)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Lấy danh sách config Zalo kèm nhóm (không bỏ trùng, để mỗi config có nhóm riêng)
 * @returns {Array} [{id, config_id, zalo_groups, zalo_scan_interval_minutes, fanpages}]
 */
function getConfigsWithZaloGroups() {
  const configs = loadDataOptionUser().filter(x => x.config_for_zalo && Array.isArray(x.zalo_groups) && x.zalo_groups.length > 0);
  
  return configs.map(cfg => ({
    id: cfg.id || ('auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
    config_id: cfg.id,
    zalo_groups: cfg.zalo_groups || [],
    zalo_scan_interval_minutes: cfg.zalo_scan_interval_minutes || 5, // Default 5 phút
    zalo_fanpages: cfg.zalo_fanpages || [] // Fanpage riêng cho config này
  }));
}

/**
 * Lấy danh sách tất cả nhóm từ tất cả config (legacy, chủ yếu dùng cho backward compatibility)
 */
function getGroupListFromConfigs() {
  const configs = loadDataOptionUser().filter(x => x.config_for_zalo && Array.isArray(x.zalo_groups));
  if (configs.length === 0) return [];
  const seen = new Set();
  const result = [];
  configs.forEach(cfg => {
    cfg.zalo_groups.forEach(group => {
      const normalized = (group || "").trim().toLowerCase();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(group.trim());
      }
    });
  });
  return result;
}

function loadGroupList() {
  try {
    const configGroups = getGroupListFromConfigs();
    if (configGroups.length > 0) return configGroups;
    const raw = localStorage.getItem(ZALO_GROUP_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('⚠️ Lỗi load group list:', e);
    return [];
  }
}

/**
 * Load state (lastHash) cho một config + group cụ thể
 * @param {string} config_id - ID của config
 * @param {string} groupName - Tên nhóm
 * @returns {string} lastHash hoặc null
 */
function loadGroupStateForConfig(config_id, groupName) {
  try {
    const stateKey = `${ZALO_GROUP_STATE_KEY}:${config_id}:${groupName}`;
    return localStorage.getItem(stateKey) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Save state (lastHash) cho một config + group cụ thể
 * @param {string} config_id - ID của config
 * @param {string} groupName - Tên nhóm
 * @param {string} lastHash - Hash của tin cuối cùng
 */
function saveGroupStateForConfig(config_id, groupName, lastHash) {
  try {
    const stateKey = `${ZALO_GROUP_STATE_KEY}:${config_id}:${groupName}`;
    localStorage.setItem(stateKey, lastHash);
  } catch (e) {
    // ignore
  }
}

// ⚠️ DEPRECATED: Hàm cũ để backward compatibility
function loadGroupState() {
  try {
    const raw = localStorage.getItem(ZALO_GROUP_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// ⚠️ DEPRECATED: Hàm cũ để backward compatibility
function saveGroupState(state) {
  try {
    localStorage.setItem(ZALO_GROUP_STATE_KEY, JSON.stringify(state || {}));
  } catch (e) {
    // ignore
  }
}

/**
 * Tạo prompt để AI sinh facebook post content từ bài viết web
 * AI sẽ tạo nhiều góc độ khác nhau, tránh trùng lặp, hấp dẫn đúng đối tượng
 * SUPPORT ĐA DẠNG LĨNH VỰC (real estate, software, service, etc.)
 * ✅ ENHANCED với CREATIVE RANDOMIZATION để tránh nội dung rập khuôn
 */
function createFacebookPostPrompt(webArticle = {}, targetAudience = '', opts = {}) {
  const {
    title = 'Bài viết chuyên sâu',
    description = '',
    content = '',
    keywords = '',
    industry = 'bat-dong-san',
    personaKey = 'investor'
  } = webArticle;
  
  // ✅ CREATIVE ANGLES - Random góc độ để tạo đa dạng
  const creativeAngles = [
    'Kể chuyện từ trải nghiệm thực tế',
    'Đặt câu hỏi thu hút suy nghĩ',
    'So sánh trước/sau hoặc có/không',
    'Chia sẻ insight độc quyền',
    'Case study ngắn gọn',
    'Thống kê hoặc con số gây tò mò',
    'Đảo ngược quan điểm phổ biến',
    'Kết nối với xu hướng hiện tại',
    'Giải quyết pain point cụ thể',
    'Tạo FOMO (Fear of Missing Out)'
  ];
  
  const randomAngle = creativeAngles[Math.floor(Math.random() * creativeAngles.length)];
  
  // ✅ WRITING STYLES - Đa dạng phong cách
  const writingStyles = [
    'Chuyên nghiệp nhưng gần gũi',
    'Nhiệt huyết và truyền cảm hứng',
    'Thông minh và sắc sảo',
    'Thẳng thắn và minh bạch',
    'Sáng tạo và độc đáo',
    'Đơn giản và dễ hiểu',
    'Tự nhiên như trò chuyện'
  ];
  
  const randomStyle = writingStyles[Math.floor(Math.random() * writingStyles.length)];
  
  // ✅ EMOTIONAL HOOKS - Random cảm xúc để kết nối
  const emotionalHooks = [
    'Tò mò và khám phá',
    'Tự hào và khẳng định',
    'An tâm và tin tưởng',
    'Hào hứng và háo hức',
    'Thông minh và sáng suốt',
    'Thuận tiện và tiết kiệm',
    'Thành công và đẳng cấp'
  ];
  
  const randomEmotion = emotionalHooks[Math.floor(Math.random() * emotionalHooks.length)];
  
  // ✅ UNIQUE SEED để tránh cache hit
  const uniqueSeed = `UNIQUE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const creativityBoost = Math.floor(Math.random() * 1000); // Random number để force AI khác biệt
  
  // ✅ INDUSTRY CONTEXT - 6 lĩnh vực chính của hệ thống
  const industryContextMap = {
    'dich-vu': {
      name: 'Dịch Vụ Chuyên Nghiệp',
      name_en: 'Professional Services',
      name_zh: '专业服务',
      keywords_example: 'dịch vụ, tư vấn, giải pháp, chuyên nghiệp, tối ưu hóa quy trình',
      persona_defaults: ['business_owner', 'professional', 'startup'],
      audience: 'Doanh nghiệp, chủ kinh doanh, freelancer, người chuyên nghiệp',
      engagement_tips: 'Giải pháp toàn diện, tối ưu hóa quy trình, nâng cao hiệu quả, case study thực tế'
    },
    'phan-mem': {
      name: 'Phần Mềm',
      name_en: 'Software',
      name_zh: '软件',
      keywords_example: 'phần mềm, quản lý, tự động hóa, ứng dụng, website, giải pháp công nghệ',
      persona_defaults: ['business_owner', 'tech_savvy', 'startup'],
      audience: 'Doanh nghiệp, startup, người làm kỹ thuật, chủ cửa hàng',
      engagement_tips: 'Tự động hóa, tăng hiệu quả, tối ưu chi phí, demo tính năng, before-after'
    },
    'booking-online': {
      name: 'Đặt Lịch',
      name_en: 'Booking',
      name_zh: '预约',
      keywords_example: 'đặt lịch, booking, lịch hẹn, online, tiết kiệm thời gian',
      persona_defaults: ['service_user', 'busy_professional', 'health_conscious'],
      audience: 'Người dùng dịch vụ, người bận rộn, người quan tâm sức khỏe',
      engagement_tips: 'Tiết kiệm thời gian, quản lý lịch hẹn, uy tín chất lượng, dễ dàng đặt lịch'
    },
    'cho-thue-xe': {
      name: 'Cho Thuê Xe',
      name_en: 'Car Rental',
      name_zh: '汽车租赁',
      keywords_example: 'cho thuê xe, xe 4 chỗ, xe 7 chỗ, tài xế chuyên nghiệp, an toàn thoải mái',
      persona_defaults: ['traveler', 'business_owner', 'family'],
      audience: 'Du khách, người đi công tác, gia đình, doanh nghiệp',
      engagement_tips: 'Uy tín, xe sạch sẽ, tài xế nhiệt tình, an toàn, giá cả hợp lý'
    },
    'lam-dep-my-pham': {
      name: 'Mỹ Phẩm & Làm Đẹp',
      name_en: 'Beauty & Cosmetics',
      name_zh: '美容化妆品',
      keywords_example: 'làm đẹp, mỹ phẩm, skincare, spa, chăm sóc da, xu hướng làm đẹp',
      persona_defaults: ['beauty_lover', 'skincare_enthusiast', 'wellness_seeker'],
      audience: 'Người yêu làm đẹp, quan tâm chăm sóc da, tìm sản phẩm chất lượng',
      engagement_tips: 'Xu hướng làm đẹp, review sản phẩm, before-after, tips chăm sóc da, trải nghiệm spa'
    },
    'bat-dong-san': {
      name: 'Bất Động Sản',
      name_en: 'Real Estate',
      name_zh: '房地产',
      keywords_example: 'bất động sản, căn hộ, nhà phố, đất nền, đầu tư, mua bán, cho thuê',
      persona_defaults: ['investor', 'homebuyer', 'business_owner'],
      audience: 'Nhà đầu tư, người tìm mua nhà, chủ kinh doanh, gia đình',
      engagement_tips: 'Minh bạch pháp lý, tiềm năng thanh khoản, lợi nhuận, vị trí, giá trị sinh lời'
    }
  };
  
  // Lấy industry context (fallback to default nếu không tìm thấy)
  const industryCtx = industryContextMap[industry] || {
    name: industry,
    keywords_example: keywords,
    persona_defaults: ['investor', 'business_owner'],
    audience: 'Người dùng chung',
    engagement_tips: 'Liên quan đến nội dung bài viết'
  };
  
  // ✅ PERSONA MAPPING - Phù hợp với 6 lĩnh vực
  const personaMap = {
    'investor': `Nhà đầu tư, người có kinh nghiệm, tìm kiếm cơ hội sinh lợi trong ${industryCtx.name.toLowerCase()}`,
    'homebuyer': 'Người tìm mua nhà ở thực, gia đình, cần lâu dài',
    'business_owner': `Chủ doanh nghiệp, người quản lý, tìm giải pháp tối ưu cho ${industryCtx.name.toLowerCase()}`,
    'startup': 'Startup founder, team nhỏ, tìm cách scale business với chi phí tối ưu',
    'professional': 'Chuyên gia, freelancer, người chuyên nghiệp tìm dịch vụ chất lượng',
    'tech_savvy': 'Người am hiểu công nghệ, early adopter, tìm giải pháp tự động hóa',
    'service_user': 'Người dùng dịch vụ, tìm kiếm sự tiện lợi và uy tín',
    'busy_professional': 'Người bận rộn, cần tiết kiệm thời gian, quản lý hiệu quả',
    'health_conscious': 'Người quan tâm sức khỏe, wellness, chất lượng dịch vụ',
    'traveler': 'Du khách, người đi công tác, cần dịch vụ an toàn tiện lợi',
    'family': 'Gia đình, tìm kiếm sự thoải mái và an toàn cho người thân',
    'beauty_lover': 'Người yêu làm đẹp, quan tâm xu hướng và sản phẩm mới',
    'skincare_enthusiast': 'Người đam mê chăm sóc da, tìm sản phẩm hiệu quả',
    'wellness_seeker': 'Người tìm kiếm sự thư giãn, chăm sóc bản thân, spa chất lượng'
  };
  
  const audienceDesc = personaMap[personaKey] || personaMap['investor'];
  
  return `
========== FACEBOOK POST GENERATION (FROM WEB ARTICLE) ==========
🎯 LĨNH VỰC: ${industryCtx.name.toUpperCase()}
🎨 GÓC ĐỘ SÁNG TẠO: ${randomAngle}
✍️ PHONG CÁCH: ${randomStyle}
💫 CẢM XÚC MỤC TIÊU: ${randomEmotion}

[CONTEXT - Bài viết web đã được viết]
Tiêu đề web: ${title}
Mô tả: ${description}
Nội dung (tóm tắt): ${content.substring(0, 500)}...
Từ khóa: ${keywords}
Lĩnh vực: ${industryCtx.name}

[INDUSTRY SPECIFIC GUIDANCE - ${industryCtx.name}]
📌 Từ khóa ngành: ${industryCtx.keywords_example}
👥 Đối tượng mục tiêu: ${industryCtx.audience}
💡 Mẹo engagement: ${industryCtx.engagement_tips}

[NHIỆM VỤ - FACEBOOK POST ĐỘC ĐÁO]
Hãy tạo FACEBOOK POST theo phong cách "${randomStyle}", góc độ "${randomAngle}", kết nối cảm xúc "${randomEmotion}".

✅ YÊU CẦU QUAN TRỌNG:
1. MỘT GÓC KHÁC HOÀN TOÀN VỚI BÀI VIẾT WEB (không copy-paste)
2. PHONG CÁCH "${randomStyle}" - Tự nhiên, không sáo rỗng
3. GÓC ĐỘ "${randomAngle}" - Sáng tạo, thu hút
4. CẢM XÚC "${randomEmotion}" - Kết nối với ${audienceDesc}
5. NGÔN NGỮ FACEBOOK: Ngắn gọn, dễ scroll, có CTA rõ ràng
6. PHẢN ÁNH ${industryCtx.name}: Terminology đúng, context phù hợp
7. ĐA DẠNG CẤU TRÚC: Không theo template cố định
8. TỰ NHIÊN: Viết như người thật chia sẻ, không như quảng cáo

[GỢI Ý ĐA DẠNG HÓA]
- Đầu bài: Có thể là câu hỏi, con số, câu chuyện ngắn, hoặc insight bất ngờ
- Giữa bài: Giá trị cốt lõi, lợi ích thực tế, hoặc góc nhìn độc đáo
- Cuối bài: CTA tự nhiên (không cứng nhắc), khuyến khích tương tác

[TRÁNH TUYỆT ĐỐI - EXAMPLES CỤ THỂ]
❌ Các cụm từ rập khuôn: "nâng tầm", "đẳng cấp", "vị thế", "bàn đạp", "'nóng' hơn bao giờ hết", "ROI tiềm năng", "chỉ dành cho nhà đầu tư nhạy bén"
❌ Cấu trúc cố định: emoji → tiêu đề → mô tả → CTA → hashtag → domain
❌ Giọng văn quảng cáo sáo: "khẳng định vị thế", "gia tăng tài sản", "bùng nổ", "không dành cho tất cả"
❌ Hashtags nhồi nhét: Chỉ 4-6 hashtags liên quan thật sự
❌ Nội dung giống web article: Phải viết lại hoàn toàn
❌ Opening giống nhau: "[Địa điểm] đang 'nóng' hơn bao giờ hết", "Bạn đã sẵn sàng chưa?"
❌ Pattern "Nhưng cơ hội này không dành cho tất cả. Chỉ những [người] mới..."

[VÍ DỤ TỪ CHỐI - KHÔNG BAO GIỜ VIẾT NHƯ NÀY]
❌ "Quận 1 & 3 đang 'nóng' hơn bao giờ hết. 25 BĐS đỉnh cao, ROI tiềm năng..."
❌ "Nhưng cơ hội này không dành cho tất cả. Chỉ những nhà đầu tư 'nhạy bén'..."
❌ "Bạn đã sẵn sàng sàng lọc và chốt deal chưa? 🧐"
❌ "Anh bạn đầu tư bất động sản mới hỏi: [Nơi] giá X có 'ngon' không?"
❌ Bất kỳ pattern nào lặp lại từ prompt trước

[VÍ DỤ TỐT - ĐA DẠNG]
• Góc "Câu hỏi": "Bạn từng tự hỏi tại sao [insight]? Đây là câu trả lời..."
• Góc "Câu chuyện": "Tuần trước, một khách hàng chia sẻ với tôi..."  
• Góc "Con số": "87% [nhóm người] không biết rằng [insight]..."
• Góc "So sánh": "Trước đây [X], bây giờ [Y]. Sự khác biệt là..."
• Góc "Đảo ngược": "Ngược với suy nghĩ thông thường, [insight]..."

[VÍ DỤ CONTENT TỰ NHIÊN - SÁ TẠO]
✅ BĐS Example 1 (Storytelling):
"Một người bạn vừa mua nhà ở Thủ Đức, giá tốt lắm. Nhưng khi tôi hỏi anh ấy về tiềm năng thanh khoản, anh im lặng. 
Đầu tư BĐS không chỉ là tìm giá rẻ. 3 yếu tố này quan trọng hơn nhiều. Ai đang tìm hiểu BĐS, đọc kỹ nhé."

✅ Software Example 2 (Problem-Solution):
"Team bạn mất bao nhiêu giờ mỗi tuần để quản lý đơn hàng thủ công? Khách của tôi nói trung bình 15 giờ.
Sau khi tự động hóa: Giảm còn 2 giờ. Tăng doanh thu 40% vì team tập trung bán hàng.
Bạn thử chưa?"

✅ Service Example 3 (Insightful):
"Hầu hết doanh nghiệp nghĩ marketing = quảng cáo. Sai rồi.
Marketing thực sự = Hiểu khách hàng sâu sắc + Giải quyết vấn đề họ chưa nói ra.
5 câu hỏi này giúp bạn hiểu khách hàng hơn."

✅ Real Estate Example 4 (Data-Driven):
"Q1 2024: Giá đất Bình Dương tăng 12%, nhưng thanh khoản giảm 30%.
Điều này nói lên gì? Thị trường đang cooling down, nhà đầu tư cần thận trọng hơn.
Phân tích chi tiết ở đây."

✅ Beauty Example 5 (Personal):
"Làn da tôi từng rất xấu. Mụn, thâm, dầu nhờn.
Thử đủ thứ không hiệu quả. Cho đến khi hiểu rõ 3 nguyên tắc này.
6 tháng sau: Da khỏe, tự tin hơn. Chia sẻ cho ai đang gặp vấn đề."

[HƯỚNG DẪN OUTPUT - JSON]
{
  "facebook_post": "Nội dung post (200-400 chars) + HASHTAGS SEO cuối (4-6 hashtags liên quan)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4"],
  "hooks": ["Hook 1", "Hook 2", "Hook 3"], 
  "cta": "CTA TỰ NHIÊN phù hợp ${industryCtx.name}",
  "target_mindset": "Tâm lý người dùng khi đọc",
  "reason_engagement": "Vì sao post này khác biệt và hấp dẫn",
  "industry": "${industryCtx.name}",
  "persona": "${personaKey}",
  "creative_angle": "${randomAngle}",
  "style": "${randomStyle}",
  "emotion": "${randomEmotion}"
}

✅ HASHTAG CONVENTION (để trong facebook_post ở cuối):
- Chuẩn Facebook: hashtag phải liền mạch, KHÔNG dùng dấu gạch ngang (-), KHÔNG dùng underscore (_), KHÔNG dấu tiếng Việt
- Ưu tiên CamelCase để dễ đọc: #BatDongSan; chấp nhận lowercase liền: #batdongsan
- Linh động theo intent tìm kiếm: có thể trộn broad + long-tail + local + brand (nếu liên quan thật)
- 4-6 hashtags SEO liên quan thực tế, không nhồi nhét, tránh hashtag quá dài khó đọc
- Ưu tiên: Main keyword (từ title) → Long-tail → Industry → Local → CTA
- Ví dụ chuẩn: "#BatDongSan #ToaNhaNguyenCan #BinhThanh #DauTuBatDongSan #NguyenHuuCanh #SunwahPearl"
- BẮT BUỘC: field "hashtags" phải có 4-6 phần tử
- BẮT BUỘC: "facebook_post" PHẢI kết thúc bằng chính các hashtag đó (mỗi hashtag bắt đầu bằng #)
- Nếu thiếu hashtag, coi output KHÔNG HỢP LỆ và phải tự sửa lại trước khi trả JSON

========== CREATIVITY IS KEY ==========
✅ MỖI BÀI POST PHẢI KHÁC NHAU - Tránh lặp lại cấu trúc
✅ TỰ NHIÊN NHƯ NGƯỜI THẬT - Không giống AI hay quảng cáo
✅ GIÁ TRỊ TRƯỚC, QUẢNG CÁO SAU - Chia sẻ insight thật
✅ KẾT NỐI CẢM XÚC - ${randomEmotion}
✅ PHONG CÁCH ${randomStyle.toUpperCase()} 
✅ GÓC ĐỘ ${randomAngle.toUpperCase()}

[UNIQUE REQUEST ID: ${uniqueSeed}]
[CREATIVITY BOOST: ${creativityBoost}]
⚠️ ĐÂY LÀ REQUEST MỚI - TUYỆT ĐỐI KHÔNG DÙNG CACHE!
⚠️ PHẢI TẠO NỘI DUNG HOÀN TOÀN MỚI, KHÁC VỚI MỌI BÀI TRƯỚC!

Hãy sáng tạo và tạo ra Facebook post THẬT SỰ ĐỘC ĐÁO cho ${industryCtx.name}!
`;
}

/**
 * Tạo Facebook post prompt với creative params (hỗ trợ old API)
 * @deprecated - Chỉ để tương thích với code cũ, nên dùng createFacebookPostPrompt
 */
async function createFacebookPostPromptWithCreative(industry, productInfo, customInstructions = '') {
  // Không cần request creative params, trả về prompt trực tiếp
  // Tương thích với old code nhưng không dùng creative system
  const webArticle = {
    industry: industry || 'dich-vu',
    title: productInfo || '',
    description: customInstructions || '',
    content: productInfo || '',
    keywords: '',
    personaKey: 'business_owner'
  };
  
  return createFacebookPostPrompt(webArticle, '', {});
}

/**
 * Gọi AI để sinh Facebook post content từ web article
 */
async function generateFacebookPostContent(webArticle = {}, helperAi, opts = {}) {
  try {
    const basePrompt = createFacebookPostPrompt(webArticle, '', opts);
    
    if (!helperAi?.generateSeoContentWithPrompt) {
      console.warn('⚠️ [GenerateFBPost] helperAi.generateSeoContentWithPrompt not available');
      return null;
    }
    
    const hasMandatoryHashtags = (data) => {
      if (!data || typeof data !== 'object') return false;
      const list = Array.isArray(data.hashtags) ? data.hashtags.filter(Boolean) : [];
      if (list.length < 4 || list.length > 6) return false;
      const post = String(data.facebook_post || '');
      if (!post.trim()) return false;
      const inPost = post.match(/#[^\s#]+/g) || [];
      return inPost.length >= 4;
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      const prompt = attempt === 1
        ? basePrompt
        : `${basePrompt}\n\n[HARD RETRY]\nOutput trước chưa hợp lệ vì thiếu hashtag bắt buộc. Hãy trả JSON hợp lệ với 4-6 hashtags và facebook_post có hashtag ở CUỐI bài.`;

      console.log(`🤖 [GenerateFBPost] Gọi AI sinh Facebook post... (attempt ${attempt}/2)`);
      const result = await helperAi.generateSeoContentWithPrompt(prompt);

      if (!result?.success) {
        console.warn('⚠️ [GenerateFBPost] AI failed:', result?.message);
        continue;
      }

      let fbPostData = result.data?.result || result.result || result.data;

      if (typeof fbPostData === 'string') {
        try {
          fbPostData = parseSeoJsonString(fbPostData);
        } catch (e) {
          console.warn('⚠️ [GenerateFBPost] Failed to parse FB post data:', e.message);
          continue;
        }
      }

      if (!hasMandatoryHashtags(fbPostData)) {
        console.warn(`⚠️ [GenerateFBPost] Attempt ${attempt}: thiếu hashtag bắt buộc, sẽ retry`);
        continue;
      }

      console.log('✅ [GenerateFBPost] AI đã sinh Facebook post content hợp lệ');
      console.log('📝 Post content:', fbPostData.facebook_post?.substring(0, 100));
      return fbPostData;
    }

    console.warn('⚠️ [GenerateFBPost] Không thể tạo nội dung có hashtag hợp lệ sau 2 lần thử');
    return null;
  } catch (e) {
    console.error('❌ [GenerateFBPost] Error:', e.message);
    return null;
  }
}

function buildMessageHash(msg = {}) {
  const firstImage = Array.isArray(msg.images) ? msg.images[0] : "";
  return [msg.date, msg.time, msg.sender, msg.content, firstImage].join("||");
}

// ========== QUẢN LÝ TIN ZALO ĐÃ ĐĂNG (LƯU VÀO dataOptionUser) ==========

// Constants cho Zalo posted messages
const ZALO_POSTED_LIMIT = 1000; // Giới hạn tối đa 1000 tin đã đăng
const ZALO_POSTED_CLEANUP_DAYS = 30; // Tự động xóa tin cũ hơn 30 ngày

// ✅ TIMING CONSTANTS - Tuỳ chỉnh delays để tránh hang
// ========== GLOBAL POSTING QUEUE ==========
// Queue để lưu tin Zalo cần đăng (tách biệt khỏi scanning)
const zaloPostingQueue = [];
let isPostingWorkerRunning = false;
let postingWorkerStats = {
  totalProcessed: 0,
  totalSuccess: 0,
  totalError: 0,
  currentlyProcessing: null,
  lastProcessedAt: null,
  lastWarningAt: null  // Timestamp của lần warning cuối về textarea bị ẩn
};

const ZALO_TIMING = {
  // Delays trong quét nhóm
  WAIT_AFTER_WEBVIEW_CLICK: 2000,        // Chờ sau khi click nhóm (để conversation load)
  WAIT_AFTER_SCAN_COMPLETE: 1000,        // Chờ sau quét xong trước khi lấy tin (giảm từ 2s → 1s vì không đăng ngay)
  WAIT_BETWEEN_GROUPS: 500,              // Chờ giữa các nhóm (giảm từ 1s → 0.5s vì chỉ quét, không đăng)
  
  // Delays trong posting (worker)
  WAIT_BEFORE_CLICK_CREATE_BTN: 300,     // Chờ trước khi click "Tạo Bài"
  WAIT_FOR_CREATE_BTN_TIMEOUT: 10000,    // Timeout chờ button xuất hiện
  WAIT_FOR_POST_CREATED: 30000,          // Timeout chờ post được tạo (input cleared)
  WAIT_BETWEEN_FANPAGES: 2000,           // Chờ giữa các fanpage post
  WAIT_BETWEEN_POSTS: 3000,              // Chờ giữa các bài đăng (trong posting worker)
  
  // Delays trong scheduling
  SCANNER_LOOP_INTERVAL: 2000,           // Scanner kiểm tra mỗi 2s
  POSTING_WORKER_INTERVAL: 1000,         // Posting worker kiểm tra queue mỗi 1s
  CONFIG_SCAN_INTERVAL: 5 * 60 * 1000,   // Quét lại mỗi config sau 5 phút
  BUFFER_AFTER_SCAN: 2000,               // Buffer sau mỗi quét config (giảm từ 5s → 2s)
  
  // Facebook API
  FACEBOOK_API_TIMEOUT: 15000,           // Timeout cho Facebook API call
  FACEBOOK_RETRY_DELAY: 2000,            // Delay trước khi retry Facebook
  MAX_FACEBOOK_RETRIES: 3                // Số lần retry cho Facebook API
};

/**
 * ✅ PASSIVE MEMORY MONITOR (v2 - non-aggressive)
 * Chỉ log, không cleanup aggressive
 */
const MEMORY_MONITOR = {
  // Passive constants - just for logging
  CHECK_INTERVAL_MS: 30000,              // Check mỗi 30s
  LOG_THRESHOLD_MB: 300,                 // Log nếu heap > 300MB
  WARNING_THRESHOLD_MB: 800,             // Warning nếu > 800MB
  ERROR_THRESHOLD_MB: 1200,              // Error nếu > 1200MB (app vẫn chạy)
  
  // State
  lastHeapValue: 0,
  monitoringActive: false,
  errorCount: 0,
  maxConsecutiveErrors: 5
};

/**
 * Lấy heap usage hiện tại (MB)
 */
function getHeapUsageMB() {
  try {
    if (performance && performance.memory) {
      return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
    }
  } catch (e) {
    // ignore
  }
  return 0;
}

/**
 * ✅ Start Passive Memory Monitor (chỉ logging)
 */
function startMemoryMonitor() {
  if (MEMORY_MONITOR.monitoringActive) return;
  
  MEMORY_MONITOR.monitoringActive = true;
  console.log('🔍 [Memory Monitor] Bắt đầu (passive mode - chỉ log, không cleanup)');
  
  const monitorInterval = setInterval(() => {
    if (!MEMORY_MONITOR.monitoringActive) {
      clearInterval(monitorInterval);
      return;
    }
    
    const heapMB = getHeapUsageMB();
    MEMORY_MONITOR.lastHeapValue = heapMB;
    
    if (heapMB > MEMORY_MONITOR.WARNING_THRESHOLD_MB) {
      console.warn(`⚠️ [Memory] HEAP CAO: ${heapMB}MB (warning: ${MEMORY_MONITOR.WARNING_THRESHOLD_MB}MB)`);
      MEMORY_MONITOR.errorCount++;
    } else if (heapMB > MEMORY_MONITOR.LOG_THRESHOLD_MB) {
      console.log(`💾 [Memory] Heap usage: ${heapMB}MB`);
      MEMORY_MONITOR.errorCount = 0; // Reset error count
    }
    
    if (heapMB > MEMORY_MONITOR.ERROR_THRESHOLD_MB) {
      console.error(`❌ [Memory] HEAP CRITICAL: ${heapMB}MB (error: ${MEMORY_MONITOR.ERROR_THRESHOLD_MB}MB)`);
      MEMORY_MONITOR.errorCount++;
      
      if (MEMORY_MONITOR.errorCount >= MEMORY_MONITOR.maxConsecutiveErrors) {
        console.error(`❌ [Memory] Liên tục cao 5 lần - app có vấn đề memory leak!`);
        MEMORY_MONITOR.errorCount = 0;
      }
    }
  }, MEMORY_MONITOR.CHECK_INTERVAL_MS);
}

/**
 * Stop Memory Monitor
 */
function stopMemoryMonitor() {
  MEMORY_MONITOR.monitoringActive = false;
  console.log('🛑 [Memory Monitor] Đã dừng');
}

/**
 * Load danh sách tin Zalo đã đăng từ SERVER (csmUserData)
 * Tương tự như loadDataOptionUser() - load from server, fallback localStorage
 * @returns {Array} Mảng {hash, timestamp, groupName, content_preview, config_id}
 */
function loadPostedZaloMessages() {
  try {
    // ✅ PRIORITY 1: Load from server (csmUserData)
    if (window.csmUserData && typeof window.csmUserData.get === 'function') {
      try {
        const allData = window.csmUserData.get();
        if (Array.isArray(allData)) {
          const posted = allData.filter(item => {
            if (item.type === 'posted_zalo_message') return true;
            if (item.id && item.id.toString().startsWith('posted_zalo_')) return true;
            return false;
          });
          
          if (posted.length > 0) {
            console.log(`📊 [LoadPostedZalo] Loaded ${posted.length} posted messages from SERVER (csmUserData)`);
            if (posted.length > 0) {
              console.log(`   📌 Latest: ${posted[0]?.content_preview?.substring(0, 50)}... (${new Date(posted[0]?.timestamp).toLocaleString()})`);
            }
            return posted;
          }
        }
      } catch (e) {
        console.warn(`⚠️ [LoadPostedZalo] Error loading from server:`, e.message);
      }
    }
    
    // ✅ PRIORITY 2: Fallback to localStorage
    const raw = localStorage.getItem('zalo_posted_messages');
    if (raw) {
      const posted = JSON.parse(raw);
      if (Array.isArray(posted) && posted.length > 0) {
        console.log(`📊 [LoadPostedZalo] Loaded ${posted.length} posted messages from localStorage (FALLBACK)`);
        return posted;
      }
    }
    
    console.log(`📊 [LoadPostedZalo] No posted messages found`);
    return [];
  } catch (e) {
    console.error('❌ [LoadPostedZalo] Error:', e);
    return [];
  }
}

/**
 * Lưu danh sách tin Zalo đã đăng vào SERVER (via csmUserData.set())
 * Giống như saveDataOptionUser() - lưu qua server, backup vào localStorage
 * ✅ CLEANUP: Chỉ giữ 1000 posted messages mới nhất để tránh vượt quá storage quota
 * @param {Array} postedMessages - Mảng tin đã đăng
 */
function savePostedZaloMessages(postedMessages) {
  try {
    // ✅ CLEANUP: Trim to max 1000 newest messages (sort by timestamp descending)
    const maxMessages = 1000;
    let messagesToSave = Array.isArray(postedMessages) ? postedMessages : [];
    
    if (messagesToSave.length > maxMessages) {
      // Sort by timestamp descending (newest first), keep first 1000
      messagesToSave = messagesToSave
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, maxMessages);
      console.log(`🧹 [SavePostedZalo] Trimmed to ${maxMessages} newest messages (deleted ${postedMessages.length - maxMessages} old)`);  
    }
    
    // ✅ PRIORITY 1: Save to server via csmUserData.set()
    if (window.csmUserData && typeof window.csmUserData.set === 'function') {
      try {
        // Get ALL existing data
        const allData = loadDataOptionUser();
        
        // Filter out old posted messages
        const otherData = allData.filter(item => {
          if (item.type === 'posted_zalo_message') return false;
          if (item.id && item.id.toString().startsWith('posted_zalo_')) return false;
          return true;
        });
        
        // Merge: configs + new posted messages
        const finalData = [...otherData, ...messagesToSave];
        
        console.log(`💾 [SavePostedZalo] Saving ${messagesToSave.length} posted messages to SERVER via csmUserData...`);
        
        window.csmUserData.set(finalData, function(success, error) {
          if (success) {
            console.log(`✅ [SavePostedZalo] SERVER save successful!`);
            // Backup to localStorage as well
            try {
              localStorage.setItem('zalo_posted_messages', JSON.stringify(messagesToSave));
            } catch (e) {
              console.warn(`⚠️ [SavePostedZalo] localStorage backup failed:`, e.message);
            }
          } else {
            console.warn(`⚠️ [SavePostedZalo] SERVER save failed:`, error);
            // Fallback: save to localStorage only
            try {
              localStorage.setItem('zalo_posted_messages', JSON.stringify(messagesToSave));
              console.log(`💾 [SavePostedZalo] Saved to localStorage as fallback`);
            } catch (e) {
              console.warn(`⚠️ [SavePostedZalo] localStorage fallback also failed:`, e.message);
            }
          }
        });
      } catch (e) {
        console.warn(`⚠️ [SavePostedZalo] Error with csmUserData:`, e.message);
        // Fallback: localStorage
        try {
          localStorage.setItem('zalo_posted_messages', JSON.stringify(messagesToSave));
          console.log(`💾 [SavePostedZalo] Saved to localStorage (csmUserData error)`);
        } catch (e2) {
          console.warn(`⚠️ [SavePostedZalo] localStorage also failed:`, e2.message);
        }
      }
    } else {
      // csmUserData not available, fallback to localStorage
      console.log(`⚠️ [SavePostedZalo] csmUserData not available, using localStorage only`);
      try {
        localStorage.setItem('zalo_posted_messages', JSON.stringify(messagesToSave));
        console.log(`💾 [SavePostedZalo] Saved to localStorage`);
      } catch (e) {
        console.warn(`⚠️ [SavePostedZalo] localStorage save failed:`, e.message);
      }
    }
  } catch (e) {
    console.warn('⚠️ [SavePostedZalo] Unexpected error:', e);
  }
}

/**
 * Ghi lại tin Zalo đã đăng thành công (có include config_id)
 * @param {Object} message - Tin nhắn Zalo
 * @param {string} groupName - Tên nhóm
 * @param {string} config_id - ID của config (tùy chọn)
 */
function recordPostedZaloMessage(message, groupName, config_id = null) {
  try {
    const hash = buildMessageHash(message);
    const posted = loadPostedZaloMessages();
    
    // Nếu pass config_id, chỉ bỏ qua nếu CÙNG config đã đăng
    if (config_id && posted.some(p => p.hash === hash && p.config_id === config_id)) {
      console.log(`ℹ️ [RecordPosted] Message already recorded for config ${config_id}: ${hash}`);
      return;
    }
    
    // Thêm tin mới
    const newRecord = {
      id: 'posted_zalo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: 'posted_zalo_message',
      hash: hash,
      timestamp: Date.now(),
      config_id: config_id, // NEW: Track config nào đăng (null = legacy/unknown)
      groupName: groupName || 'Unknown',
      content_preview: (message.content || '').substring(0, 100),
      sender: message.sender || 'Unknown',
      has_images: message.images && message.images.length > 0
    };
    
    posted.unshift(newRecord);
    
    // Giới hạn số lượng
    if (posted.length > ZALO_POSTED_LIMIT) {
      posted.splice(ZALO_POSTED_LIMIT);
      console.log(`🧹 [RecordPosted] Trimmed to ${ZALO_POSTED_LIMIT} messages`);
    }
    
    // Cleanup tin cũ
    cleanupOldPostedZaloMessages(posted);
    
    // Lưu lại
    savePostedZaloMessages(posted);
    console.log(`✅ [RecordPosted] Recorded message from ${groupName} (config: ${config_id || 'unknown'}): ${newRecord.content_preview}`);
  } catch (e) {
    console.warn('⚠️ [RecordPosted] Error:', e);
  }
}

/**
 * Dọn dẹp tin Zalo cũ hơn ZALO_POSTED_CLEANUP_DAYS ngày
 * @param {Array} posted - Mảng tin đã đăng (sẽ được modify in-place)
 */
function cleanupOldPostedZaloMessages(posted) {
  const cutoffTime = Date.now() - (ZALO_POSTED_CLEANUP_DAYS * 24 * 60 * 60 * 1000);
  const beforeCount = posted.length;
  
  // Lọc bỏ tin cũ
  for (let i = posted.length - 1; i >= 0; i--) {
    if (posted[i].timestamp < cutoffTime) {
      posted.splice(i, 1);
    }
  }
  
  const removed = beforeCount - posted.length;
  if (removed > 0) {
    console.log(`🧹 [CleanupPosted] Removed ${removed} messages older than ${ZALO_POSTED_CLEANUP_DAYS} days`);
  }
}

/**
 * ✅ TẠO OVERLAY KHÓA UI KHI SCANNER ĐANG CHẠY
 * Ngăn user click nhầm vào các controls không liên quan
 * NHƯNG cho phép click nút Dừng Scanner
 */
/**
 * ✅ SELECTIVE LOCK - Chỉ disable controls liên quan đến scanner
 * Không lock toàn UI, user có thể dùng theme, menu, v.v.
 */
function createScannerLockOverlay() {
  // Mark as scanning
  window._scannerIsRunning = true;
  
  // Disable ONLY scanner-related controls
  const startBtn = document.querySelector('[data-zalo-start-scan]');
  const stopBtn = document.querySelector('[data-zalo-stop-scan]');
  const configSelect = document.querySelector('[data-zalo-config-select]');
  const resetBtn = document.querySelector('[data-zalo-reset-groups]');
  
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    startBtn.style.cursor = 'not-allowed';
  }
  
  if (configSelect) {
    configSelect.disabled = true;
    configSelect.style.opacity = '0.5';
  }
  
  if (resetBtn) {
    resetBtn.disabled = true;
    resetBtn.style.opacity = '0.5';
    resetBtn.style.cursor = 'not-allowed';
  }
  
  // Show stop button if exists
  if (stopBtn) {
    stopBtn.disabled = false;
    stopBtn.style.opacity = '1';
    stopBtn.style.cursor = 'pointer';
  }
  
  console.log('🔒 [UI Lock] Scanner controls disabled');
}

/**
 * ✅ UNLOCK - Restore scanner controls
 */
function removeScannerLockOverlay() {
  window._scannerIsRunning = false;
  
  // Re-enable ONLY scanner-related controls
  const startBtn = document.querySelector('[data-zalo-start-scan]');
  const stopBtn = document.querySelector('[data-zalo-stop-scan]');
  const configSelect = document.querySelector('[data-zalo-config-select]');
  const resetBtn = document.querySelector('[data-zalo-reset-groups]');
  
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
    startBtn.style.cursor = 'pointer';
  }
  
  if (configSelect) {
    configSelect.disabled = false;
    configSelect.style.opacity = '1';
  }
  
  if (resetBtn) {
    resetBtn.disabled = false;
    resetBtn.style.opacity = '1';
    resetBtn.style.cursor = 'pointer';
  }
  
  // Disable stop button
  if (stopBtn) {
    stopBtn.disabled = true;
    stopBtn.style.opacity = '0.5';
    stopBtn.style.cursor = 'not-allowed';
  }
  
  console.log('🔓 [UI Lock] Scanner controls unlocked');
}

/**
 * Lọc bỏ các tin đã được đăng từ danh sách tin nhắn (cho một config cụ thể)
 * @param {Array} messages - Danh sách tin nhắn Zalo
 * @param {string} config_id - ID của config (tùy chọn)
 * @returns {Array} Danh sách tin chưa được đăng
 */
function filterNotPostedMessages(messages, config_id = null) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  
  const posted = loadPostedZaloMessages();
  
  // Nếu có config_id, chỉ bỏ qua nếu CÙNG config đã đăng
  const postedHashes = new Set(
    posted
      .filter(p => !config_id || p.config_id === config_id)
      .map(p => p.hash)
  );
  
  const notPosted = messages.filter(msg => {
    const hash = buildMessageHash(msg);
    return !postedHashes.has(hash);
  });
  
  const filtered = messages.length - notPosted.length;
  if (filtered > 0) {
    console.log(`🔍 [FilterNotPosted] Filtered out ${filtered}/${messages.length} already posted messages for config ${config_id || 'default'}`);
  }
  
  return notPosted;
}

/**
 * Lọc chỉ lấy tin mới (chưa quét) của một config + group cụ thể
 * @param {string} config_id - ID của config
 * @param {string} groupName - Tên nhóm
 * @param {Array} messages - Danh sách tin nhắn
 * @returns {Array} Tin mới chưa được quét
 */
function filterNewMessagesForConfig(config_id, groupName, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const lastHash = loadGroupStateForConfig(config_id, groupName);
  const hashes = messages.map(buildMessageHash);
  
  if (!lastHash) {
    // Lần đầu quét, lưu lastHash
    if (hashes.length > 0) {
      saveGroupStateForConfig(config_id, groupName, hashes[hashes.length - 1]);
    }
    return messages;
  }

  // Lần sau, lọc chỉ tin sau lastHash
  const lastIndex = hashes.lastIndexOf(lastHash);
  const newItems = lastIndex >= 0 ? messages.slice(lastIndex + 1) : messages;
  
  if (hashes.length > 0) {
    saveGroupStateForConfig(config_id, groupName, hashes[hashes.length - 1]);
  }
  
  return newItems;
}

/**
 * ✅ RESET ZALO GROUPS STATE - Xóa state của tất cả groups đã quét
 * Cho phép quét lại tất cả các nhóm Zalo từ đầu để đăng lại
 * @returns {Object} {success: boolean, message: string, resetCount: number}
 */
function resetZaloGroupsState() {
  try {
    console.log('🔄 [Reset] Bắt đầu reset state của tất cả Zalo groups...');
    
    // Lấy tất cả configs
    const configs = getConfigsWithZaloGroups();
    let resetCount = 0;
    
    // Xóa state từng group
    configs.forEach(config => {
      const configId = config.config_id || config.id;
      if (config.zalo_groups && Array.isArray(config.zalo_groups)) {
        config.zalo_groups.forEach(groupName => {
          const stateKey = `${ZALO_GROUP_STATE_KEY}:${configId}:${groupName}`;
          try {
            localStorage.removeItem(stateKey);
            resetCount++;
            console.log(`  ✅ Reset: ${configId} - ${groupName}`);
          } catch (e) {
            console.warn(`  ⚠️ Không thể reset ${groupName}:`, e);
          }
        });
      }
    });
    
    // Xóa deprecated state (global)
    try {
      localStorage.removeItem(ZALO_GROUP_STATE_KEY);
    } catch (e) {
      console.warn('⚠️ Không thể reset global state:', e);
    }
    
    console.log(`✅ [Reset] Hoàn tất: Reset ${resetCount} groups`);
    return { 
      success: true, 
      message: `Reset ${resetCount} groups thành công. Sẽ quét lại tất cả.`,
      resetCount: resetCount 
    };
  } catch (e) {
    console.error('❌ [Reset] Lỗi:', e);
    return { 
      success: false, 
      message: `Lỗi reset: ${e.message}`,
      resetCount: 0 
    };
  }
}

/**
 * ✅ RESET POSTED MESSAGES - Xóa toàn bộ posted messages history
 * Cho phép quét và đăng lại tất cả các tin (cảnh báo: không thể undo!)
 * @returns {Object} {success: boolean, message: string, deletedCount: number}
 */
function resetPostedZaloMessages() {
  try {
    console.log('🧹 [Reset] Xóa toàn bộ posted messages history...');
    
    const allData = loadDataOptionUser();
    const postedMessages = allData.filter(item => {
      return item.type === 'posted_zalo_message' || (item.id && item.id.toString().startsWith('posted_zalo_'));
    });
    
    const deletedCount = postedMessages.length;
    
    // Xóa từng posted message
    postedMessages.forEach(item => {
      const idx = allData.indexOf(item);
      if (idx >= 0) {
        allData.splice(idx, 1);
      }
    });
    
    // Lưu lại config (không có posted messages)
    saveDataOptionUser(allData, function(success) {
      if (success) {
        console.log(`✅ [Reset] Xóa ${deletedCount} posted messages thành công`);
      } else {
        console.warn(`⚠️ [Reset] Không lưu được`);
      }
    });
    
    return { 
      success: true, 
      message: `Xóa ${deletedCount} posted messages. Sẽ quét và đăng lại tất cả.`,
      deletedCount: deletedCount 
    };
  } catch (e) {
    console.error('❌ [Reset] Lỗi:', e);
    return { 
      success: false, 
      message: `Lỗi reset: ${e.message}`,
      deletedCount: 0 
    };
  }
}

/**
 * ✅ RESET ALL ZALO DATA - Reset cả groups state + posted messages
 * Hoàn toàn quét lại tất cả từ đầu
 */
function resetAllZaloData() {
  try {
    console.log('🔄 [ResetAll] Reset toàn bộ Zalo data...');
    
    // Reset groups state
    const resetGroupsResult = resetZaloGroupsState();
    
    // Reset posted messages
    const resetPostedResult = resetPostedZaloMessages();
    
    const message = `Reset hoàn tất: ${resetGroupsResult.resetCount} groups + ${resetPostedResult.deletedCount} posted messages. Quét lại từ đầu...`;
    console.log(`✅ [ResetAll] ${message}`);
    
    return {
      success: resetGroupsResult.success && resetPostedResult.success,
      message: message,
      groupsReset: resetGroupsResult.resetCount,
      messagesDeleted: resetPostedResult.deletedCount
    };
  } catch (e) {
    console.error('❌ [ResetAll] Lỗi:', e);
    return {
      success: false,
      message: `Lỗi reset: ${e.message}`,
      groupsReset: 0,
      messagesDeleted: 0
    };
  }
}

/**
 * Lấy danh sách Fanpage cho một config cụ thể
 * @param {string} config_id - ID của config
 * @returns {Array} Danh sách fanpage [{id, name, access_token}]
 */
function getSelectedFacebookPagesForConfig(config_id) {
  try {
    const configs = loadDataOptionUser();
    const config = configs.find(c => c.id === config_id);
    
    if (!config || !Array.isArray(config.zalo_fanpages)) {
      return [];
    }
    
    return config.zalo_fanpages;
  } catch (e) {
    console.warn(`⚠️ [GetFanpages] Error loading fanpages for config ${config_id}:`, e);
    return [];
  }
}

// ========== TÍCH HỢP QUÉT TIN NHẮN ZALO ==========

// Biến global cho webview quét Zalo
window.zaloScannerWebviewId = 'zaloMesssager';
let zaloLoginCheckTimer = null;
let isZaloLoggedIn = false;

/**
 * Tạo webview Zalo inline để tích hợp trực tiếp vào UI
 * @param {string} webviewId - ID của webview
 * @param {string} url - URL cần mở
 * @param {HTMLElement} container - Container chứa webview
 * @returns {HTMLElement} - Webview element đã tạo
 */
function createZaloWebview(webviewId, url, container) {
  // Kiểm tra xem webview đã tồn tại chưa
  let existing = document.getElementById(webviewId);
  if (existing) {
    console.log(`✅ Webview ${webviewId} đã tồn tại`);
    return existing;
  }

  if (!container) {
    console.warn(`⚠️ Không có container để tạo webview`);
    return null;
  }

  // Tạo webview wrapper
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
  `;

  // Tạo header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 8px 12px;
    background: #1890ff;
    color: white;
    font-weight: 500;
    user-select: none;
    font-size: 13px;
  `;
  header.textContent = '📱 Zalo Web Chat (Đăng nhập ở đây)';

  // Tạo webview element
  const webview = document.createElement("webview");
  webview.id = webviewId;
  webview.src = url;
  webview.partition = `persist:${webviewId}`;
  webview.allowpopups = "true";
  webview.style.cssText = `
    flex: 1;
    width: 100%;
    height: 100%;
    border: none;
  `;

  // Set user agent ngẫu nhiên
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
  webview.useragent = randomUA;

  // Log khi webview load xong
  webview.addEventListener('loadstop', () => {
    console.log(`✅ Webview ${webviewId} đã load xong: ${url}`);
    // Reset flag để inject lại helpers khi webview reload
    window._zaloHelpersInjected = false;
  });
  
  webview.addEventListener('loadabort', (e) => {
    console.error(`❌ Webview ${webviewId} load failed:`, e);
  });

  wrapper.appendChild(header);
  wrapper.appendChild(webview);
  container.appendChild(wrapper);

  console.log(`🎯 Đã tạo webview ${webviewId} inline tại ${url}`);
  return webview;
}




/**
 * Kiểm tra xem đã đăng nhập Zalo trong webview chưa
 * Trả về Promise<boolean>
 */
async function checkZaloLogin(webviewId) {
  return new Promise((resolve) => {
    const wv = document.getElementById(webviewId);
    if (!wv || !wv.executeScript) {
      resolve(false);
      return;
    }

    const checkScript = `
      (function() {
        // Kiểm tra có zavatar-container là đã đăng nhập
        const hasAvatar = !!document.querySelector('.zavatar-container') || 
                         !!document.querySelector('[class*="zavatar-container"]');
        
        console.log('[Zalo Login Check] zavatar-container found:', hasAvatar);
        return hasAvatar;
      })();
    `;

    wv.executeScript(
      { code: checkScript },
      (results) => {
        const isLoggedIn = results && results[0] === true;
        console.log(`🔐 Zalo login check: ${isLoggedIn ? '✅ Đã đăng nhập' : '❌ Chưa đăng nhập'}`);
        resolve(isLoggedIn);
      }
    );
  });
}
//Q-GV > 20 Tỷ;Hàng Thuê;Q Bình Thạnh- Đất;Q1,3 50T;300-1000T;Q2-TML-Đất;Thao Dien 300
/**
 * Helper: Normalize text để so sánh chính xác (remove extra spaces, lowercase, etc)
 * @param {string} text - Text cần normalize
 * @returns {string} - Normalized text
 */
function normalizeTextForComparison(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' '); // Collapse multiple spaces to single space
}

/**
 * Click vào nhóm Zalo để mở cuộc trò chuyện
 * @param {string} webviewId - ID của webview
 * @param {string} groupName - Tên nhóm cần click
 * @returns {Promise<boolean>} - true nếu tìm thấy và click thành công
 */
async function clickZaloGroup(webviewId, groupName) {
  return new Promise((resolve) => {
    const wv = document.getElementById(webviewId);
    if (!wv || !wv.executeScript) {
      console.error(`❌ [ClickZaloGroup] Webview ${webviewId} không tồn tại hoặc không hỗ trợ executeScript`);
      resolve(false);
      return;
    }

    // Normalize tên nhóm để so sánh
    const normalizedGroupName = normalizeTextForComparison(groupName);
    const escapedGroupName = JSON.stringify(groupName);
    const escapedNormalized = JSON.stringify(normalizedGroupName);

    const scriptCode = `
      (function() {
        try {
          const groupName = ${escapedGroupName};
          const normalizedTarget = ${escapedNormalized};
          
          console.log('[ClickZaloGroup] Searching for group:', groupName, '(normalized:', normalizedTarget, ')');
          
          // STRATEGY 1: Tìm item với exact match trên normalized text
          const chatItems = document.querySelectorAll('[class*="chat-item"], [class*="conversation-item"], .room-item, a[class*="contact"]');
          let found = false;
          
          for (const item of chatItems) {
            const itemText = (item.innerText || item.textContent || '').trim();
            if (!itemText) continue;
            
            // Cách 1: Exact match với normalized text
            const normalized = itemText.trim().toLowerCase().replace(/\\s+/g, ' ');
            if (normalized === normalizedTarget) {
              console.log('[ClickZaloGroup] Found EXACT match:', itemText);
              item.click();
              found = true;
              break;
            }
            
            // Cách 2: Partial match (includes)
            if (normalized.includes(normalizedTarget) || normalizedTarget.includes(normalized)) {
              console.log('[ClickZaloGroup] Found PARTIAL match:', itemText);
              item.click();
              found = true;
              break;
            }
          }
          
          // STRATEGY 2: Nếu không tìm thấy, thử dùng search
          if (!found) {
            console.log('[ClickZaloGroup] Not found in direct list, trying search...');
            const searchInputs = [
              document.querySelector('#contact-search-input'),
              document.querySelector('[placeholder*="search" i]'),
              document.querySelector('[placeholder*="tìm" i]')
            ].filter(Boolean);
            
            if (searchInputs.length > 0) {
              const searchInput = searchInputs[0];
              searchInput.focus();
              searchInput.value = groupName;
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              searchInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Đợi kết quả tìm kiếm (async - return kết quả để caller biết)
              setTimeout(() => {
                const results = document.querySelectorAll('[id*="-item-"], [class*="search-result"]');
                if (results.length > 0) {
                  console.log('[ClickZaloGroup] Found search result, clicking first one');
                  results[0].click();
                }
              }, 800); // Tăng từ 500 → 800ms để đợi search result
              
              found = true;
            }
          }
          
          return JSON.stringify({ 
            success: found, 
            message: found ? 'Đã click vào nhóm' : 'Không tìm thấy nhóm: ' + groupName 
          });
        } catch (error) {
          console.error('[ClickZaloGroup] Error:', error.message);
          return JSON.stringify({ success: false, message: 'Error: ' + error.message });
        }
      })();
    `;

    wv.executeScript(
      { code: scriptCode },
      (results) => {
        try {
          const result = results && results[0] ? JSON.parse(results[0]) : { success: false };
          if (result.success) {
            console.log(`✅ [ClickZaloGroup] Click nhóm "${groupName}" thành công: ${result.message}`);
          } else {
            console.warn(`⚠️ [ClickZaloGroup] Click nhóm "${groupName}" thất bại: ${result.message}`);
          }
          resolve(result.success);
        } catch (e) {
          console.error(`❌ [ClickZaloGroup] Parse result error:`, e);
          resolve(false);
        }
      }
    );
  });
}

async function scanZaloGroup(groupName) {
  // Ưu tiên 1: Click vào nhóm trước, sau đó quét
  const webviewId = window.zaloScannerWebviewId;
  
  if (webviewId && typeof clickZaloGroup === "function") {
    console.log(`🔗 Click vào nhóm "${groupName}"...`);
    await clickZaloGroup(webviewId, groupName);
    // ✅ Delay nhỏ để conversation bắt đầu load (DOM polling sẽ chờ ready)
    const clickWaitTime = ZALO_TIMING.WAIT_AFTER_WEBVIEW_CLICK;
    console.log(`⏳ Đợi ${clickWaitTime}ms để conversation bắt đầu load...`);
    await new Promise(resolve => setTimeout(resolve, clickWaitTime));
  }
  
  // Ưu tiên 2: Quét từ webview
  if (webviewId && typeof window.zaloScanGroupFromWebview === "function") {
    console.log(`🔍 Quét nhóm "${groupName}" từ webview: ${webviewId}`);
    return window.zaloScanGroupFromWebview(webviewId, groupName);
  }
  
  // Ưu tiên 3: Dùng hàm window.zaloScanGroup trực tiếp (nếu đang trong context Zalo)
  if (typeof window.zaloScanGroup === "function") {
    return window.zaloScanGroup(groupName);
  }
  
  // Ưu tiên 4: Dùng hàm backup __zaloScanGroup
  if (typeof window.__zaloScanGroup === "function") {
    return window.__zaloScanGroup(groupName);
  }
  
  // Không tìm thấy cách nào để quét
  throw new Error(`Không thể quét nhóm "${groupName}". Vui lòng đảm bảo đã mở Zalo Web trong webview ${webviewId}`);
}

/**
 * Helper: Tìm button "Tạo Bài" với timeout (tối ưu, không blocking)
 * Sử dụng Promise với interval để tránh while loop
 * 
 * @param {number} timeout - Thời gian chờ tối đa (milliseconds)
 * @param {HTMLElement} input - Content input element để kiểm tra early exit
 * @returns {Promise<HTMLButtonElement|null>} Button hoặc null nếu timeout
 */
function findCreateButton(timeout = 5000, input = null) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = 500; // Kiểm tra mỗi 500ms
    let attemptCount = 0;
    
    const intervalId = setInterval(() => {
      attemptCount++;
      const elapsed = Date.now() - startTime;
      
      // 1. Kiểm tra timeout
      if (elapsed >= timeout) {
        clearInterval(intervalId);
        console.warn(`⏱️ Timeout sau ${attemptCount} lần thử (${(elapsed/1000).toFixed(1)}s)`);
        resolve(null);
        return;
      }
      
      // 2. Early exit: Nếu input đã bị clear, có thể user đã bấm button manually
      if (input && input.value.trim() === "") {
        clearInterval(intervalId);
        console.log(`✅ Input đã được clear (user có thể đã bấm button manually)`);
        resolve(null);
        return;
      }
      
      // 3. Tìm button trong DOM (chỉ query khi cần)
      const buttons = document.querySelectorAll("button");
      const createBtn = Array.from(buttons).find(
        (btn) => btn.textContent?.trim() === "✍️ Tạo Bài"
      );
      
      if (createBtn) {
        // 4. Kiểm tra button có bị disabled không
        if (createBtn.disabled) {
          console.log(`⏳ Tìm thấy button nhưng đang bị disabled (lần ${attemptCount})...`);
          // Tiếp tục đợi, không return ngay
          return;
        }
        
        // 5. Tìm thấy button và sẵn sàng click
        clearInterval(intervalId);
        console.log(`✅ Tìm thấy button 'Tạo Bài' sau ${attemptCount} lần thử (${(elapsed/1000).toFixed(1)}s)`);
        resolve(createBtn);
        return;
      }
      
      // 6. Chưa tìm thấy, log progress
      if (attemptCount % 2 === 0) { // Log mỗi 1 giây (2 lần x 500ms)
        console.log(`⏳ Đợi button 'Tạo Bài' xuất hiện... (${attemptCount} lần, ${(elapsed/1000).toFixed(1)}s/${(timeout/1000).toFixed(1)}s)`);
      }
    }, checkInterval);
  });
}


/**
 * Chờ post được tạo xong và lấy URL
 */
async function waitForPostCreatedAndGetUrl(input, messages, selectedPages) {
  const maxTimeout = ZALO_TIMING.WAIT_FOR_POST_CREATED;
  const checkInterval = 1000;
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    let attempts = 0;
    
    const intervalId = setInterval(async () => {
      attempts++;
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= maxTimeout) {
        clearInterval(intervalId);
        console.warn(`⏱️ Timeout chờ post (${attempts} lần, ${(elapsed/1000).toFixed(1)}s)`);
        resolve(null);
        return;
      }
      
      if (input.value.trim() === "") {
        // Input cleared - post đã tạo
        clearInterval(intervalId);
        console.log(`✅ Input cleared sau ${attempts} lần (${(elapsed/1000).toFixed(1)}s)`);
        await new Promise(r => setTimeout(r, 500));
        
        // Lấy URL
        const postUrl = await getLastCreatedPostUrl(3, 500);
        resolve(postUrl || null);
        return;
      }
      
      if (attempts % 5 === 0) {
        console.log(`    ⏳ Chờ post... (${attempts}s)`);
      }
    }, checkInterval);
  });
}

/**
 * ✅ POST MESSAGES SEQUENTIALLY - Từng message một cái
 * Chờ hoàn tất mỗi message trước khi sang message tiếp
 * Đảm bảo khi lỗi 1 tin vẫn chạy tiếp các tin tiếp theo
 */
async function postMessagesSequentially(messages, groupName, config_id, selectedPages) {
  if (!messages || messages.length === 0) {
    console.log('ℹ️ Không có tin để đăng');
    return { success: 0, failed: 0 };
  }
  
  console.log(`📤 [Sequential] Bắt đầu đăng ${messages.length} tin Từng Từng (1 tin/lần)...`);
  
  let successCount = 0;
  let failCount = 0;
  
  // ✅ Post từng message tuần tự (1 cái rồi đến cái tiếp)
  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const message = messages[msgIdx];
    const msgNum = msgIdx + 1;
    
    try {
      console.log(`\n  📬 [Tin ${msgNum}/${messages.length}] Bắt đầu xử lý: "${(message.content || '').substring(0, 50)}..."`);
      
      // ✅ Post message này (chờ hoàn toàn)
      const posted = await postSingleMessageWithFanpages(message, groupName, config_id, selectedPages);
      
      if (posted) {
        successCount++;
        console.log(`  ✅ [Tin ${msgNum}] Đăng thành công`);
      } else {
        failCount++;
        console.warn(`  ❌ [Tin ${msgNum}] Đăng thất bại - tiếp tục tin tiếp theo...`);
      }
      
      // ✅ Delay ngắn giữa các message để tránh quá tải
      if (msgIdx < messages.length - 1) {
        const delayMs = ZALO_TIMING.WAIT_BETWEEN_GROUPS || 1000;
        console.log(`  ⏳ Chờ ${delayMs}ms trước message tiếp...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (e) {
      console.error(`  ❌ [Tin ${msgNum}] Exception:`, e.message);
      failCount++;
      // ✅ Tiếp tục message tiếp theo dù lỗi
      continue;
    }
  }
  
  console.log(`\n🎉 [Sequential] Hoàn tất: ✅ ${successCount}/${messages.length} thành công, ❌ ${failCount} lỗi`);
  return { success: successCount, failed: failCount };
}

/**
 * ✅ POST 1 MESSAGE DUY NHẤT - Lên web + fanpages
 * Chờ hoàn toàn trước khi return
 */
async function postSingleMessageWithFanpages(message, groupName, config_id, selectedPages) {
  const input = document.getElementById("content-input");
  if (!input) return false;
  
  // Lưu context
  window.__currentZaloGroupName = groupName;
  window.__currentZaloConfigId = config_id;
  
  try {
    // ✅ Chờ input clear (post trước đó xong)
    const maxWaitAttempts = 15;
    let attempts = 0;
    while (input.value.trim() && attempts < maxWaitAttempts) {
      attempts++;
      console.log(`    ⏳ Chờ input clear... (${attempts}/15)`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (input.value.trim()) {
      console.warn(`    ⚠️ Input vẫn chưa clear, force continue...`);
    }
    
    // ✅ Giữ full message trong window để create flow luôn lấy đủ base64 + nội dung
    window.__pendingZaloMessages = [message];

    // ✅ Prepare message data for textarea (nhẹ hơn, không phải nguồn chính)
    const messageForInput = { ...message };
    if (messageForInput.images && Array.isArray(messageForInput.images)) {
      const base64Images = messageForInput.images.filter(img => img && img.startsWith('data:'));
      const urlImages = messageForInput.images.filter(img => img && (img.startsWith('http://') || img.startsWith('https://')));
      messageForInput.images = urlImages;
      if (base64Images.length > 0) {
        messageForInput.base64ImageCount = base64Images.length;
      }
    }
    
    // ✅ Set message to input (single message)
    const messageStr = JSON.stringify([messageForInput], null, 2);
    input.value = messageStr;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    
    console.log(`    📝 Đặt message vào input (${messageStr.length} bytes)`);
    
    // ✅ Chờ UI update
    await new Promise(resolve => setTimeout(resolve, ZALO_TIMING.WAIT_BEFORE_CLICK_CREATE_BTN));
    
    // ✅ Tìm và click button "Tạo Bài"
    const createBtn = await findCreateButton(ZALO_TIMING.WAIT_FOR_CREATE_BTN_TIMEOUT, input);
    if (!createBtn) {
      console.error(`    ❌ Không tìm thấy button 'Tạo Bài'`);
      return false;
    }
    
    console.log(`    🖱️ Click button 'Tạo Bài'`);
    createBtn.click();
    
    // ✅ Chờ post được tạo xong (input clear)
    const postUrl = await waitForPostCreatedAndGetUrl(input, [message], selectedPages);
    
    if (postUrl) {
      console.log(`    ✅ Post created: ${postUrl}`);
      
      // ✅ Đăng lên fanpage (với retry)
      if (selectedPages && selectedPages.length > 0) {
        await postToSelectedFanpages([message], postUrl, selectedPages);
      }
      
      // ✅ Record tin đã đăng
      recordPostedZaloMessage(message, groupName, config_id);
      return true;
    } else {
      console.warn(`    ⚠️ Không lấy được URL post`);
      return false;
    }
  } catch (e) {
    console.error(`    ❌ Exception in postSingleMessageWithFanpages:`, e);
    return false;
  }
}

/**
 * ✅ LẤY LINK BÀI VIẾT VỪA TẠO - Với retry logic
 * Lấy từ window.cparams.lastDetail sau khi upsertDetail()
 */
async function getLastCreatedPostUrl(maxRetries = 5, retryDelayMs = 1000) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Lấy từ window.cparams.lastDetail (được set trong upsertDetail)
      if (!window.cparams || !window.cparams.lastDetail) {
        lastError = 'window.cparams.lastDetail chưa được set';
        if (attempt < maxRetries) {
          console.log(`⏳ [GetLastPostUrl] Retry ${attempt}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }
      } else {
        break; // Có dữ liệu, thoát loop
      }
    } catch (e) {
      lastError = e.message;
    }
    
    if (attempt === maxRetries && lastError) {
      console.warn(`❌ [GetLastPostUrl] Sau ${maxRetries} lần retry vẫn lỗi: ${lastError}`);
      return null;
    }
  }
  
  if (!window.cparams || !window.cparams.lastDetail) {
    console.warn('❌ [GetLastPostUrl] Không lấy được window.cparams.lastDetail');
    return null;
  }
  
  const detail = window.cparams.lastDetail;
  let domain = detail.domain;
  
  if (!domain) {
    console.warn('❌ [GetLastPostUrl] detail.domain không tồn tại');
    return null;
  }
  
  // Parse danh sách domain, loại bỏ localhost, lấy domain ngẫu nhiên
  if (typeof domain === 'string' && domain.includes(',')) {
    const domains = domain.split(',')
      .map(d => d.trim())
      .filter(d => d && d !== 'localhost' && !d.includes('localhost') && !d.includes('127.0.0.1'));
    
    if (domains.length === 0) {
      console.warn('❌ [GetLastPostUrl] Không có domain hợp lệ');
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * domains.length);
    domain = domains[randomIndex];
    console.log(`📌 [GetLastPostUrl] Domain: ${domain}`);
  }
  
  if (!detail.service_code || !detail.slug) {
    console.warn('❌ [GetLastPostUrl] Thiếu service_code hoặc slug');
    return null;
  }
  
  const fullUrl = `https://www.${domain}/${detail.service_code}/${detail.slug}`;
  console.log(`✅ [GetLastPostUrl] URL: ${fullUrl}`);
  
  return fullUrl;
}

async function postToSelectedFanpages(messages, postUrl, selectedPages = null, options = {}) {
  // Nếu không pass selectedPages, load từ toàn cục (fallback)
  if (!selectedPages || selectedPages.length === 0) {
    selectedPages = getSelectedFacebookPages();
  }
  
  if (!selectedPages || selectedPages.length === 0) {
    console.warn("⚠️ Không có Fanpage được chọn để đăng.");
    return { successCount: 0, failCount: 0 };
  }

  console.log(`🚀 [PostToFanpages] Bắt đầu đăng lên ${selectedPages.length} Fanpage với link: ${postUrl}`);
  
  // Tạo base content cho Facebook
  const messageContent = messages
    .map(m => `📌 ${m.sender}: ${m.content}`)
    .join('\n\n');

  const defaultFacebookContent = `${messageContent}\n\n🔗 Xem chi tiết: ${postUrl}`;

  const helperAi = options.helperAi || window.csmAI || resolveContext().helperAi;
  const seftObj = options.seft || {};
  const fallbackIndustry = options.industry || 'bat-dong-san';
  const skipRecord = !!options.skipRecord;
  const personaPool = ['investor', 'business_owner', 'professional', 'startup', 'tech_savvy'];

  const rawImagesFromMessages = Array.isArray(messages)
    ? messages.flatMap(m => Array.isArray(m?.images) ? m.images : [])
    : [];
  const rawImagesFromOptions = Array.isArray(options.images) ? options.images : [];
  const validFbImages = Array.from(new Set([...rawImagesFromOptions, ...rawImagesFromMessages]))
    .filter(img => typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')));

  console.log(`🖼️ [PostToFanpages] Valid images for post: ${validFbImages.length}`);

  const buildUniqueFanpageContent = async (pageName, index) => {
    try {
      if (!helperAi?.generateSeoContentWithPrompt) {
        return defaultFacebookContent;
      }

      const firstMsg = Array.isArray(messages) && messages.length > 0 ? messages[0] : {};
      const personaKey = personaPool[index % personaPool.length];
      const fbPostData = await generateFacebookPostContent(
        {
          title: firstMsg?.content?.substring(0, 80) || 'Nội dung mới từ Zalo',
          description: `${messageContent.substring(0, 300)}\n[PAGE:${pageName}|${index + 1}]`,
          content: messageContent,
          keywords: 'zalo, fanpage, auto-post',
          industry: fallbackIndustry,
          personaKey
        },
        helperAi,
        { domain: (resolveContext()?.domain || '') }
      );

      if (fbPostData?.facebook_post) {
        const cta = fbPostData.cta || 'Xem chi tiết';
        return `${fbPostData.facebook_post}\n\n👉 ${cta}: ${postUrl}`;
      }

      return defaultFacebookContent;
    } catch (e) {
      console.warn(`⚠️ [PostToFanpages] AI content failed for ${pageName}: ${e.message}`);
      return defaultFacebookContent;
    }
  };
  
  // Tracking số fanpage đăng thành công
  let successCount = 0;
  let failCount = 0;

  // ✅ CONSTANTS cho retry logic
  const MAX_RETRIES_PER_PAGE = ZALO_TIMING.MAX_FACEBOOK_RETRIES;
  const RETRY_DELAY_MS = ZALO_TIMING.FACEBOOK_RETRY_DELAY;

  // Đăng lên từng Fanpage VỚI RETRY LOGIC
  for (let i = 0; i < selectedPages.length; i++) {
    const page = selectedPages[i];
    let posted = false;
    
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_PAGE; attempt++) {
      try {
        console.log(`📱 [Fanpage ${i + 1}/${selectedPages.length}] Đăng lên: ${page.name} (lần thử ${attempt}/${MAX_RETRIES_PER_PAGE})`);
        
        // Tạo nội dung RIÊNG cho từng fanpage (AI)
        const pageFacebookContent = await buildUniqueFanpageContent(page.name || `Fanpage-${i + 1}`, i);

        // Gọi luồng chuẩn: post có nội dung + album ảnh
        const result = await postToFacebookPageWithImages(
          page.id,
          page.access_token,
          pageFacebookContent,
          validFbImages,
          postUrl,
          seftObj
        );
        
        if (result?.success) {
          console.log(`✅ [Fanpage ${i + 1}] Đã đăng lên ${page.name} thành công! (Post ID: ${result.post_id || 'N/A'})`);
          successCount++;
          posted = true;
          break; // Thành công, thoát loop retry
        } else {
          // Lỗi API
          const status = Number(result?.httpStatus || 0);
          const isRetryable = status === 429 || status >= 500;
          const retryMsg = isRetryable ? 'sẽ thử lại' : 'không thể thử lại';
          
          console.warn(`⚠️ [Fanpage ${i + 1}] Lỗi đăng lên ${page.name} (lần ${attempt}): ${result?.error || 'Unknown error'} (${retryMsg})`);
          
          if (!isRetryable || attempt === MAX_RETRIES_PER_PAGE) {
            // Không thể retry hoặc hết số lần retry
            console.error(`❌ [Fanpage ${i + 1}] Bỏ qua ${page.name} sau ${attempt} lần thử`);
            failCount++;
            break;
          } else {
            // Có thể retry - chờ rồi thử lại
            const waitTime = RETRY_DELAY_MS * attempt; // Exponential backoff: 2s, 4s, 6s
            console.log(`⏳ [Fanpage ${i + 1}] Chờ ${waitTime}ms rồi thử lại...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } catch (e) {
        console.error(`❌ [Fanpage ${i + 1}] Exception khi đăng lên ${page.name}:`, e.message);
        failCount++;
        break; // Lỗi nặng, không thử lại
      }
    }
    
    // Nếu không upload được trang này, log warning
    if (!posted) {
      console.warn(`⚠️ [Fanpage ${i + 1}] Không thể đăng lên ${page.name} sau ${MAX_RETRIES_PER_PAGE} lần thử (config_id: ${window.__currentZaloConfigId || 'default'})`);
    }
    
    // Chờ trước khi đăng fanpage tiếp theo
    if (i < selectedPages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, ZALO_TIMING.WAIT_BETWEEN_FANPAGES));
    }
  }
  
  console.log(`🎉 [PostToFanpages] Hoàn tất: ${successCount}/${selectedPages.length} Fanpage thành công, ${failCount} lỗi`);
  
  // ✅ QUAN TRỌNG: Record tất cả tin Zalo đã đăng THÀNH CÔNG vào dataOptionUser (với config_id)
  if (successCount > 0 && !skipRecord) {
    const groupName = window.__currentZaloGroupName || 'Unknown';
    const config_id = window.__currentZaloConfigId || null;
    console.log(`💾 [Record] Recording ${messages.length} posted Zalo messages from group: ${groupName} (config: ${config_id || 'default'})`);
    
    messages.forEach(message => {
      recordPostedZaloMessage(message, groupName, config_id);
    });
    
    console.log(`✅ Đã lưu ${messages.length} tin Zalo đã đăng vào dataOptionUser`);
    
    // Cập nhật UI thống kê
    if (typeof window.updateZaloPostedStats === 'function') {
      window.updateZaloPostedStats();
    }
  } else if (successCount <= 0) {
    console.warn('⚠️ Không có fanpage nào đăng thành công, không lưu tin Zalo vào dataOptionUser');
  }

  return { successCount, failCount };
}

/**
 * ✅ THÊM TIN VÀO POSTING QUEUE
 * Thay vì đăng ngay, tin sẽ được thêm vào queue để posting worker xử lý
 */
function addToPostingQueue(messages, groupName, configId, config) {
  if (!messages || messages.length === 0) return 0;
  
  const queueItem = {
    id: 'queue_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    messages: messages,
    groupName: groupName,
    configId: configId,
    config: config, // Lưu config để biết fanpage nào cần đăng
    addedAt: Date.now(),
    status: 'pending'
  };
  
  zaloPostingQueue.push(queueItem);
  console.log(`📥 [Queue] Added ${messages.length} messages from ${groupName} (config: ${configId}) → Queue size: ${zaloPostingQueue.length}`);
  return messages.length;
}

/**
 * ✅ POSTING WORKER - Xử lý queue độc lập
 * Lấy tin từ queue → đăng tuần tự → đợi xong → lấy tin tiếp
 */
async function processPostingQueue() {
  // Nếu queue rỗng, skip
  if (zaloPostingQueue.length === 0) return;
  
  // Nếu đang xử lý item khác, skip
  if (postingWorkerStats.currentlyProcessing) return;
  
  // Lấy item đầu tiên trong queue
  const item = zaloPostingQueue.shift();
  if (!item) return;
  
  item.status = 'processing';
  postingWorkerStats.currentlyProcessing = item.id;
  postingWorkerStats.totalProcessed++;
  
  console.log(`\n🔄 [Posting Worker] Processing queue item ${item.id} (${item.messages.length} messages from ${item.groupName})...`);
  console.log(`   📊 Queue remaining: ${zaloPostingQueue.length} items`);
  
  try {
    // Đăng TẤT CẢ tin trong item này (tuần tự)
    for (let i = 0; i < item.messages.length; i++) {
      const message = item.messages[i];
      console.log(`\n   📤 [${i + 1}/${item.messages.length}] Đăng tin từ ${message.sender}...`);
      
      // Set global context cho processContent
      window.__currentZaloGroupName = item.groupName;
      window.__currentZaloConfigId = item.configId;
      
      // Đăng tin này (CHẶN cho đến khi xong)
      const success = await pushSingleMessageToWeb(message, item.groupName, item.configId, item.config);
      
      if (success) {
        console.log(`   ✅ [${i + 1}/${item.messages.length}] Đăng thành công`);
      } else {
        console.warn(`   ⚠️ [${i + 1}/${item.messages.length}] Đăng thất bại`);
      }
      
      // Chờ giữa các bài đăng
      if (i < item.messages.length - 1) {
        const waitTime = ZALO_TIMING.WAIT_BETWEEN_POSTS;
        console.log(`   ⏸️  Chờ ${waitTime}ms trước bài tiếp theo...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  } catch (e) {
    console.error(`❌ [Posting Worker] Error processing queue item:`, e);
    item.status = 'error';
    item.error = e.message;
  } finally {
    postingWorkerStats.currentlyProcessing = null;
  }
}

/**
 * ✅ ĐĂNG MỘT TIN LÊN WEB - GỌI TRỰC TIẾP processContent (KHÔNG QUA UI)
 * Hoàn toàn tự động, không phụ thuộc textarea hay button
 * 
 * ⚠️ LƯU Ý: Function này CHỈ dùng cho AUTO POSTING
 * Luồng thủ công (textarea + button) vẫn sử dụng postSingleMessageWithFanpages()
 */
async function pushSingleMessageToWeb(message, groupName, configId, config) {
  try {
    console.log(`    🚀 [Auto Post] Gọi trực tiếp processContent cho tin từ ${message.sender}...`);
    
    // ✅ CRITICAL: Chỉ truyền project nếu domain là LMKT
    const isLmktDomain = config?.domain && (config.domain.includes('h-holding') || config.domain.includes('lmkt'));
    
    // ✅ Chuẩn bị options cho processContent
    const opts = {
      config_id: configId,
      domain: config?.domain,
      service_type: config?.service_type,
      project: isLmktDomain ? config?.project : "",
      fanpage_id: config?.fanpage_id,
      fanpage_token: config?.fanpage_token,
      fanpage_name: config?.fanpage_name,
      primary_domain: config?.primary_domain,
      app_id: config?.app_id,
      // Metadata từ Zalo
      zalo_group: groupName,
      zalo_sender: message.sender,
      zalo_time: message.time,
      zalo_date: message.date
    };
    
    // ✅ Gọi trực tiếp processContent thay vì qua UI
    let postSuccess = false;
    try {
      await processContent(message, opts);
      postSuccess = true;
      console.log(`    ✅ [Auto Post] processContent hoàn tất`);
    } catch (processErr) {
      console.error('❌ [Auto Post] processContent lỗi:', processErr.message);
      // Vẫn tiếp tục để record message (tránh đăng lại)
    }
    
    // ✅ Record tin đã đăng (dù thành công hay thất bại để tránh đăng lại)
    try {
      recordPostedZaloMessage(message, groupName, configId);
      console.log(`    📝 [Auto Post] Đã record message vào lịch sử`);
    } catch (recordErr) {
      console.error('❌ [Auto Post] recordPostedZaloMessage lỗi:', recordErr.message);
    }
    
    // ✅ Cập nhật stats UI
    if (typeof window.updateZaloPostedStats === 'function') {
      window.updateZaloPostedStats();
    }
    
    return postSuccess;
  } catch (e) {
    console.error('❌ [Auto Post] Lỗi:', e.message);
    return false;
  }
}

/**
 * ✅ QUÉT TẤT CẢ NHÓM CỦA CONFIG (CHỈ QUÉT, KHÔNG ĐĂNG)
 * Quét nhanh → thu thập tin mới → thêm vào queue → xong
 * 
 * Cơ chế mới:
 * - Quét nhóm 1 (nhanh) → lấy tin mới → thêm vào queue
 * - Quét nhóm 2 (nhanh) → lấy tin mới → thêm vào queue
 * - Quét nhóm N (nhanh) → lấy tin mới → thêm vào queue
 * - Sau quét xong tất cả → chờ 5 phút → quét config tiếp theo
 * 
 * @param {Object} config - {id, config_id, zalo_groups, zalo_scan_interval_minutes, zalo_fanpages}
 * @param {HTMLElement} statusEl - Element hiển thị status
 */

/**
 * ✅ SEQUENTIAL: Quét + Đăng config tuần tự (không queue, không worker)
 * Flow: Nhóm 1 (lấy → đăng) → Nhóm 2 (lấy → đăng) → ... → Hết config
 */
async function scanAndPostConfig(config, statusEl) {
  if (!isZaloScanning || !isZaloLoggedIn) {
    console.warn('⚠️ [scanAndPostConfig] Skip: scanning stopped or not logged in');
    return;
  }
  
  if (!config || !config.zalo_groups || config.zalo_groups.length === 0) {
    console.log(`⚠️ [Config] Không có nhóm`);
    return;
  }

  const configId = config.config_id || config.id;
  const groupList = config.zalo_groups;
  let totalNew = 0;
  let totalPosted = 0;
  
  console.log(`\n📍 [Config ${configId}] Quét ${groupList.length} nhóm...`);

  // Quét + Đăng TẤT CẢ nhóm TUẦN TỰ
  for (let groupIdx = 0; groupIdx < groupList.length; groupIdx++) {
    if (!isZaloScanning) break;
    
    const groupName = groupList[groupIdx].trim();
    const groupPos = groupIdx + 1;
    
    try {
      console.log(`  [${groupPos}/${groupList.length}] Quét & Đăng nhóm: ${groupName}`);
      
      if (statusEl) {
        statusEl.textContent = `[${groupPos}/${groupList.length}] ${groupName}...`;
      }
      
      // BƯỚC 1: Lấy tin từ nhóm
      const messages = await scanZaloGroup(groupName);
      if (!Array.isArray(messages)) {
        console.warn(`⚠️ Invalid messages returned`);
        continue;
      }
      
      console.log(`    📊 Lấy được ${messages.length} tin`);
      
      if (messages.length === 0) {
        continue; // Nhóm tiếp
      }
      
      // BƯỚC 2: Lọc tin mới
      const newMessages = filterNewMessagesForConfig(configId, groupName, messages);
      if (newMessages.length === 0) {
        console.log(`    ⏭️ Không có tin mới`);
        continue; // Nhóm tiếp
      }
      
      console.log(`    ✅ Có ${newMessages.length} tin mới`);
      totalNew += newMessages.length;
      
      // BƯỚC 3: Lọc tin có hình
      const messagesWithImages = newMessages.filter(msg => 
        msg.images && Array.isArray(msg.images) && msg.images.length > 0
      );
      
      if (messagesWithImages.length === 0) {
        console.log(`    ⏭️ Không có tin có hình`);
        continue; // Nhóm tiếp
      }
      
      console.log(`    🖼️  ${messagesWithImages.length} tin có hình - Bắt đầu đăng...`);
      
      // BƯỚC 4: Đăng LẦN LƯỢT từng tin (tuần tự, không queue)
      for (let msgIdx = 0; msgIdx < messagesWithImages.length; msgIdx++) {
        if (!isZaloScanning) break;
        
        const msg = messagesWithImages[msgIdx];
        const msgPos = msgIdx + 1;
        
        try {
          console.log(`      [TIN ${msgPos}/${messagesWithImages.length}] Đăng "${msg.sender || 'Unknown'}"...`);
          
          // Đăng tin này (tuần tự với auth)
          const success = await pushSingleMessageToWeb(msg, groupName, configId, config);
          
          if (success) {
            console.log(`        ✅ Đăng thành công`);
            totalPosted++;
            
            // Chờ 3s trước tin tiếp (cần để hạ load)
            await new Promise(resolve => setTimeout(resolve, ZALO_TIMING.WAIT_BETWEEN_POSTS));
          } else {
            console.warn(`        ❌ Đăng thất bại`);
          }
        } catch (e) {
          console.error(`        ❌ Lỗi đăng tin:`, e.message);
        }
      }
      
      console.log(`    ✅ Nhóm ${groupName} đăng xong (${messagesWithImages.length} tin)`);
      
      // Chờ 2s trước nhóm tiếp (để hạ load)
      if (groupIdx < groupList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, ZALO_TIMING.WAIT_BETWEEN_GROUPS));
      }
      
    } catch (e) {
      console.error(`  ❌ Lỗi xử lý nhóm ${groupName}:`, e.message);
    }
  }
  
  console.log(`\n✅ [Config ${configId}] Hoàn tất: ${totalNew} tin mới, ${totalPosted} tin đăng`);
}

/**
 * ✅ SEQUENTIAL LOOP - Tuần tự hoàn toàn (không concurrency)
 * Flow: Quét config → Quét nhóm → Lấy tin → Đăng hết → Nhóm tiếp → ...
 * Không posting worker loop, tất cả tuần tự
 */
function startZaloScanner(statusEl) {
  if (isZaloScanning) return;
  isZaloScanning = true;

  // ✅ Start Memory Monitor (passive)
  startMemoryMonitor();

  // Set auto mode flag để tự động xác nhận confirm() dialogs
  isZaloAutoMode = true;
  console.log('🚀 [Zalo Scanner] Bắt đầu - SEQUENTIAL MODE (tuần tự hoàn toàn)');
  
  // ✅ KHÓA UI KHI SCANNER ĐANG CHẠY
  createScannerLockOverlay();

  // Lấy tất cả config có Zalo groups
  const configs = getConfigsWithZaloGroups();
  
  if (configs.length === 0) {
    console.warn('⚠️ Không có config nào có nhóm Zalo để quét');
    if (statusEl) statusEl.textContent = '⚠️ Không có config để quét';
    isZaloScanning = false;
    stopMemoryMonitor();
    removeScannerLockOverlay();
    return;
  }

  console.log(`📊 Khởi động Sequential Loop cho ${configs.length} configs:`);
  configs.forEach((config, index) => {
    const configId = config.config_id || config.id;
    const groupCount = config.zalo_groups ? config.zalo_groups.length : 0;
    console.log(`  → [${index + 1}/${configs.length}] ${configId}: ${groupCount} nhóm`);
  });
  
  // ✅ STATE
  let currentConfigIndex = 0;
  let lastScanTime = 0;
  let isCurrentlyScanning = false;
  
  // ✅ MAIN LOOP: Check mỗi 2s xem có nên quét config tiếp không
  const mainLoopTimer = setInterval(async () => {
    if (!isZaloScanning) {
      clearInterval(mainLoopTimer);
      return;
    }
    
    // Trong lúc quét, skip
    if (isCurrentlyScanning) return;
    
    // Check interval (5 phút)
    const now = Date.now();
    const timeSinceLastScan = now - lastScanTime;
    const minInterval = ZALO_TIMING.CONFIG_SCAN_INTERVAL;
    
    if (lastScanTime > 0 && timeSinceLastScan < minInterval) {
      // Chưa đủ, chờ tiếp
      return;
    }
    
    // Bắt đầu quét config
    const config = configs[currentConfigIndex];
    const configId = config.config_id || config.id;
    
    console.log(`\n🎯 [Round ${currentConfigIndex + 1}/${configs.length}] Config: ${configId}`);
    
    isCurrentlyScanning = true;
    
    try {
      // ✅ Quét config này (tuần tự: nhóm → lấy tin → đăng)
      await scanAndPostConfig(config, statusEl);
    } catch (e) {
      console.error(`❌ [Config ${configId}] Error:`, e);
    } finally {
      // Chuyển config tiếp
      currentConfigIndex = (currentConfigIndex + 1) % configs.length;
      lastScanTime = Date.now();
      isCurrentlyScanning = false;
      
      if (statusEl) {
        statusEl.textContent = `🔄 [${currentConfigIndex + 1}/${configs.length}] Chờ 5 phút để quét lại...`;
      }
    }
  }, ZALO_TIMING.SCANNER_LOOP_INTERVAL);
  
  // Lưu timer để dừng sau
  zaloConfigScanners._mainLoopTimer = mainLoopTimer;

  if (statusEl) {
    statusEl.textContent = `🟢 Sequential Loop chạy (${configs.length} configs)...`;
  }
}

/**
 * ✅ DỪNG ZALO SCANNER
 */
function stopZaloScanner(statusEl) {
  isZaloScanning = false;
  isPostingWorkerRunning = false;
  
  // ✅ Stop Memory Monitor
  stopMemoryMonitor();
  
  // ✅ MỞ KHÓA UI
  removeScannerLockOverlay();

  // Dừng main loop timer
  if (zaloConfigScanners._mainLoopTimer) {
    clearInterval(zaloConfigScanners._mainLoopTimer);
    console.log(`⏹️ Dừng Main Loop Timer`);
  }
  
  // Clear config scanners
  zaloConfigScanners = {};

  // Dừng auto mode
  isZaloAutoMode = false;
  
  // Log stats cuối cùng
  console.log('⏹️ [Zalo Scanner] Dừng');
  console.log(`   💾 Memory: ${getHeapUsageMB()}MB`);

  if (statusEl) {
    statusEl.textContent = `⏸ Đã dừng.`;
  }
}

/**
 * ✅ CREATE RESET BUTTONS UI
 * Thêm nút Reset Groups + Reset Messages vào UI
 */
function createZaloResetButtonsUI() {
  let container = document.getElementById('zalo-reset-buttons');
  if (container) return container;
  
  // Tìm nơi để thêm buttons (next to scanner buttons)
  const scannerUI = document.querySelector('[data-zalo-scanner-controls]') || 
                    document.querySelector('.zalo-scanner-status') ||
                    document.querySelector('[id*="zalo"]')?.parentElement;
  
  if (!scannerUI && !document.body) return null;
  
  const wrapper = document.createElement('div');
  wrapper.id = 'zalo-reset-buttons';
  wrapper.style.cssText = `
    margin-top: 10px;
    padding: 10px;
    background: #fff7e6;
    border: 1px solid #ffd666;
    border-radius: 4px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  `;
  
  // Button 1: Reset Groups State
  const btnResetGroups = document.createElement('button');
  btnResetGroups.setAttribute('data-zalo-reset-groups', 'true'); // Mark for selective lock
  btnResetGroups.textContent = '🔄 Reset Groups';
  btnResetGroups.style.cssText = `
    padding: 6px 12px;
    background: #faad14;
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  `;
  btnResetGroups.onclick = () => {
    if (confirm('⚠️ Reset trạng thái các nhóm Zalo đã quét?\n\nBạn sẽ quét lại TẤT CẢ các nhóm.')) {
      const result = resetZaloGroupsState();
      alert(`✅ ${result.message}`);
      console.log(result);
    }
  };
  wrapper.appendChild(btnResetGroups);
  
  // Button 2: Reset Posted Messages
  const btnResetMessages = document.createElement('button');
  btnResetMessages.textContent = '🧹 Reset Posted';
  btnResetMessages.style.cssText = `
    padding: 6px 12px;
    background: #ff7875;
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  `;
  btnResetMessages.onclick = () => {
    if (confirm('⚠️ Xóa toàn bộ tin Zalo đã đăng?\n\n❌ KHÔNG THỂ UNDO!\n\nBạn sẽ đăng lại TẤT CẢ từ lần quét đầu.')) {
      const result = resetPostedZaloMessages();
      alert(`✅ ${result.message}`);
      console.log(result);
    }
  };
  wrapper.appendChild(btnResetMessages);
  
  // Button 3: Reset ALL
  const btnResetAll = document.createElement('button');
  btnResetAll.textContent = '⚡ Reset ALL';
  btnResetAll.style.cssText = `
    padding: 6px 12px;
    background: #ff4d4f;
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    white-space: nowrap;
  `;
  btnResetAll.onclick = () => {
    if (confirm('⚠️ RESET TOÀN BỘ DỮ LIỆU ZALO?\n\n❌ CẢN THẬN: KHÔNG THỂ UNDO!\n\n- Reset tất cả groups state\n- Xóa tất cả posted messages\n- Quét + đăng lại từ đầu')) {
      const result = resetAllZaloData();
      alert(`✅ ${result.message}`);
      console.log(result);
    }
  };
  wrapper.appendChild(btnResetAll);
  
  // Thêm vào DOM
  if (scannerUI) {
    scannerUI.appendChild(wrapper);
  } else {
    document.body.appendChild(wrapper);
  }
  
  console.log('✅ [UI] Reset buttons thêm thành công');
  return wrapper;
}

function ensureZaloMultiGroupUI(container) {
  const existing = document.getElementById("zalo-multi-group-ui");
  if (existing) return existing;

  // Expose helper functions to window for grid triggers
  if (!window.zaloGridHelpers) {
    window.zaloGridHelpers = {
      loadDataOptionUser,
      saveDataOptionUser,
      fetchDataOptionUserFromServer,
      validateCsmUserDataReady,
      getGlobalSettings,
      getSelectedFacebookPages,
      resetZaloGroupsState,
      resetPostedZaloMessages,
      resetAllZaloData,
      createZaloResetButtonsUI
    };
    console.log('[Zalo Grid] Exposed helper functions to window.zaloGridHelpers');
    
    // ⚠️ KHÔNG GỌI render ở đây - sẽ gọi SAU khi UI đã được tạo xong
  }

  // State để track row đang được chọn trong grid
  let selectedRowData = null;
  let currentMode = "idle"; // idle | edit | create
  let editingRowId = null;
  let formSnapshot = null;
  let editingFanpageData = null; // Lưu fanpage data từ row khi edit, để giữ token
  let autoLoadBtn = null;
  let saveConfigBtn = null;
  let newConfigBtn = null;
  let cancelBtn = null;
  let refreshFromServerBtn = null;
  let status = null;
  
  // Cache React root instance để reuse (tránh tạo root mới mỗi lần)
  let zaloGridRoot = null;
  
  // Version counter để force React detect database change
  let zaloGridVersion = 0;

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "zalo-multi-group-ui";
  wrapper.style.cssText = getFeatureCardStyle(theme) + ";margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;min-height:500px;";

  // ===== PHẦN TRÁI: Form quét nhóm =====
  const leftPanel = document.createElement("div");
  leftPanel.style.cssText = `flex:1;min-width:300px;display:flex;flex-direction:column;`;

  const title = document.createElement("div");
  title.textContent = "💬 Zalo Multi-Group Scanner";
  title.style.cssText = getFeatureTitleStyle(theme);

  const note = document.createElement("div");
  note.style.cssText = `margin-bottom:10px;padding:8px;background:${theme.successBg};border-radius:4px;font-size:12px;color:${theme.success};`;
  note.innerHTML = `
    ✅ <strong>Hướng dẫn sử dụng:</strong><br>
    <strong>BƯỚC 1 - CÀI ĐẶT:</strong><br>
    &nbsp;&nbsp;• Chọn <strong>Domain, Loại Dịch Vụ, Dự Án</strong> ở <strong>"⚙️ Cài Đặt Chung"</strong> phía trên<br>
    &nbsp;&nbsp;• Check <strong>Fanpage</strong> ở mục <strong>"📱 Facebook Token Management"</strong> phía trên<br>
    &nbsp;&nbsp;• Nhập <strong>danh sách nhóm Zalo</strong> (mỗi nhóm 1 dòng) ở form dưới<br>
    &nbsp;&nbsp;• Nhấn <strong>"💾 Lưu cấu hình"</strong> để lưu vào lưới động<br><br>
    
    <strong>BƯỚC 2 - CHẠY SCANNER:</strong><br>
    &nbsp;&nbsp;• Đăng nhập <strong>Zalo</strong> ở bên phải (QR hoặc số điện thoại)<br>
    &nbsp;&nbsp;• Nhấn <strong>"▶️ Bắt đầu quét"</strong> sau khi đăng nhập thành công<br>
    &nbsp;&nbsp;• Hệ thống sẽ tự động quét tin mỗi 5 phút và đăng lên fanpage đã chọn<br><br>
    
    💡 <strong>Mẹo:</strong> Click vào dòng trong lưới động để sửa cấu hình!
  `.trim();

  // ===== Hàm lấy fanpages từ Facebook Token section =====
  // ĐỌC TỪ FACEBOOK TOKEN SECTION (fb-pages-checkboxes), KHÔNG TẠO CHECKBOXES RIÊNG
  const getSelectedZaloFanpages = () => {
    // Đọc từ Facebook Token section checkboxes (name="fb-page-checkbox")
    const checkboxes = Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]'));
    return checkboxes.filter(cb => cb.checked).map(cb => {
      const page = facebookState.pages.find(p => p.id === cb.value);
      return {
        id: cb.value,
        name: page?.name || cb.nextSibling?.textContent || 'Unknown',
        access_token: page?.access_token || ''
      };
    });
  };
  
  // ===== PHẦN QUẢN LÝ CẤU HÌNH ĐÃ LƯU: DANH SÁCH ĐƠN GIẢN GIỐNG SEO.JS =====
  const managementSection = document.createElement("div");
  managementSection.style.cssText = `background:${theme.surface};border:1px solid ${theme.border};border-radius:4px;padding:10px;margin-bottom:8px;`;
  
  // Container cho danh sách cấu hình (KHÔNG dùng grid phức tạp)
  const mgmtList = document.createElement("div");
  mgmtList.id = "zalo-config-list";
  mgmtList.style.cssText = `margin-bottom:10px;`;
  
  // ===== FORM STATE HELPERS =====
  const normalizeKeyPart = (value) => (value || "").toString().trim().toLowerCase();

  const captureFormState = () => {
    const domainSelect = document.getElementById("global-domain-select");
    const industrySelect = document.getElementById("global-industry-select");
    const projectSelect = document.getElementById("global-project-select");
    const textarea = document.getElementById("zalo-group-list");
    const checkedFanpages = Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]'))
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    return {
      domainKey: domainSelect?.value || "phanmemmottrieu",
      industry: industrySelect?.value || "bat-dong-san",
      project: projectSelect?.value || "",
      checkedFanpages,
      groupText: textarea?.value || ""
    };
  };

  const applyFormState = (state) => {
    if (!state) return;
    const domainSelect = document.getElementById("global-domain-select");
    const industrySelect = document.getElementById("global-industry-select");
    const projectSelect = document.getElementById("global-project-select");
    const textarea = document.getElementById("zalo-group-list");

    if (domainSelect) {
      domainSelect.value = state.domainKey || "phanmemmottrieu";
      domainSelect.dispatchEvent(new Event('change'));
    }
    if (industrySelect) industrySelect.value = state.industry || "bat-dong-san";
    if (projectSelect) projectSelect.value = state.project || "";

    Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]')).forEach(cb => {
      cb.checked = state.checkedFanpages?.includes(cb.value) || false;
    });

    if (textarea) textarea.value = state.groupText || "";
  };

  const normalizeGroupText = (groups) => {
    if (!groups) return "";
    let text = "";
    if (Array.isArray(groups)) {
      text = groups.join("\n");
    } else {
      text = (groups || "").toString();
    }
    return text
      .split('\\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join("\n");
  };

  const setMode = (mode, row = null, options = {}) => {
    currentMode = mode;
    editingRowId = row?.id || null;

    if (saveConfigBtn) {
      saveConfigBtn.style.display = currentMode === "idle" ? "none" : "inline-block";
      saveConfigBtn.textContent = currentMode === "edit" ? "💾 Lưu chỉnh sửa" : "💾 Lưu cấu hình";
    }
    if (newConfigBtn) newConfigBtn.style.display = currentMode === "idle" ? "inline-block" : "none";
    if (cancelBtn) cancelBtn.style.display = currentMode === "idle" ? "none" : "inline-block";
    if (autoLoadBtn) autoLoadBtn.disabled = currentMode !== "idle";
    if (refreshFromServerBtn) refreshFromServerBtn.disabled = currentMode !== "idle";

    if (status && !options.preserveStatus) {
      if (currentMode === "edit") {
        status.textContent = `✏️ Đang sửa cấu hình: ${row?.fanpage_names?.join(', ') || row?.fanpage_name || 'N/A'}. Nhấn "Lưu chỉnh sửa" hoặc "Huỷ".`;
      } else if (currentMode === "create") {
        status.textContent = "➕ Đang thêm mới cấu hình. Nhấn \"Lưu cấu hình\" hoặc \"Huỷ\".";
      } else {
        status.textContent = "⏸ Chưa chạy quét.";
      }
    }

    renderZaloConfigList();
  };

  // Hàm load dữ liệu từ row được chọn vào controls
  const loadRowToControls = (row) => {
    if (!row) {
      console.log('[Zalo Config] No row to load');
      return;
    }
    
    console.log('[Zalo Config] Loading row to controls:', row);
    
    // 1. Load Global Settings (Domain, Service/Industry, Project)
    // Ưu tiên dùng domain_key nếu có, fallback sang reverse mapping
    let domainKey = row.domain_key;
    if (!domainKey) {
      domainKey = Object.keys(DOMAIN_OPTIONS).find(key => {
        const domainValues = DOMAIN_OPTIONS[key]?.value || '';
        return domainValues.includes(row.domain) || row.domain?.includes(DOMAIN_OPTIONS[key]?.value?.split(',')[0]);
      }) || 'phanmemmottrieu';
    }
    
    const domainSelect = document.getElementById("global-domain-select");
    if (domainSelect) {
      domainSelect.value = domainKey;
      domainSelect.dispatchEvent(new Event('change'));
      console.log('[Zalo Config] Set domain:', domainKey);
    }
    
    // Set Industry/Service
    const industrySelect = document.getElementById("global-industry-select");
    if (industrySelect && row.service_type) {
      industrySelect.value = row.service_type;
      console.log('[Zalo Config] Set industry:', row.service_type);
    }
    
    // Set Project
    const projectSelect = document.getElementById("global-project-select");
    if (projectSelect && row.project) {
      projectSelect.value = row.project;
      console.log('[Zalo Config] Set project:', row.project);
    }
    
    // 2. Load fanpages - check các checkbox từ Facebook Token section
    const fanpageIds = row.fanpage_ids || (row.fanpage_id ? [row.fanpage_id] : []);
    const checkboxes = Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]'));
    checkboxes.forEach(cb => {
      cb.checked = fanpageIds.includes(cb.value);
    });
    
    // Lưu fanpage data từ UI checkbox (lấy token từ facebookState.pages matching page.id)
    const checkedBoxes = checkboxes.filter(cb => cb.checked);
    editingFanpageData = {
      fanpage_ids: checkedBoxes.map(cb => cb.value),
      fanpage_id: checkedBoxes[0]?.value || null,
      fanpage_names: checkedBoxes.map(cb => {
        const page = facebookState.pages.find(p => p.id === cb.value);
        return page?.name || cb.nextSibling?.textContent?.trim() || 'Unknown';
      }),
      fanpage_name: checkedBoxes.map(cb => {
        const page = facebookState.pages.find(p => p.id === cb.value);
        return page?.name || cb.nextSibling?.textContent?.trim() || 'Unknown';
      }).join(', '),
      fanpage_tokens: checkedBoxes.map(cb => {
        const page = facebookState.pages.find(p => p.id === cb.value);
        return page?.access_token || '';
      }),
      fanpage_token: (() => {
        const firstPage = facebookState.pages.find(p => p.id === checkedBoxes[0]?.value);
        return firstPage?.access_token || null;
      })()
    };
    console.log('[Zalo Config] Checked fanpages:', fanpageIds.length, 'Loaded tokens from facebookState:', editingFanpageData);
    
    // 3. Load zalo groups vào textarea
    const textarea = document.getElementById('zalo-group-list');
    if (textarea && row.zalo_groups) {
      textarea.value = normalizeGroupText(row.zalo_groups);
    }
    
    console.log('[Zalo Config] Loaded:', fanpageIds.length, 'fanpages,', (row.zalo_groups || []).length, 'groups');
  };
  
  // Hàm render danh sách Zalo configs (DÙNG CsmDynamicGrid ĐÚNG CÁCH)


  // Hàm render danh sách config (fallback nếu grid không có sẵn)
  const renderZaloConfigList = () => {
    mgmtList.innerHTML = "";
    const allConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
    mgmtTitle.innerHTML = `📋 Cấu hình đã lưu (${allConfigs.length})`;
    
    if (allConfigs.length === 0) {
      mgmtList.innerHTML = `<div style="color:${theme.muted};font-size:11px;padding:8px;">Chưa có cấu hình nào. Hãy điền thông tin và nhấn "💾 Lưu cấu hình" để lưu.</div>`;
      return;
    }
    
    allConfigs.forEach((cfg, idx) => {
      const isEditingRow = currentMode === "edit" && editingRowId === cfg.id;
      const cfgItem = document.createElement("div");
      cfgItem.style.cssText = `background:${theme.inputBg};border:1px solid ${theme.border};border-radius:3px;padding:6px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;font-size:11px;${isEditingRow ? 'box-shadow:0 0 0 2px #1890ff inset;background:#e6f7ff;' : ''}`;
      
      const info = document.createElement("div");
      info.style.cssText = `flex:1;`;
      const dateStr = new Date(cfg.created_at).toLocaleString('vi-VN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
      const tokenStatus = cfg.fanpage_token ? '✅ Token' : '⚠️ Không có token';
      
      // ✅ CHỈ hiển thị project nếu domain là LMKT
      const isLmktDomain = cfg.domain && (cfg.domain.includes('h-holding') || cfg.domain.includes('lmkt'));
      const serviceInfo = cfg.service_type || 'N/A';
      const projectInfo = (isLmktDomain && cfg.project) ? ` | Dự án: ${cfg.project}` : '';
      
      info.innerHTML = `
        <div><strong>${cfg.fanpage_names?.join(', ') || cfg.fanpage_name}</strong> @ ${cfg.domain} <span style="color:${cfg.fanpage_token ? '#52c41a' : '#ff4d4f'};font-size:10px;">${tokenStatus}</span> ${isEditingRow ? '<span style="margin-left:6px;color:#1890ff;font-weight:600;">(Đang sửa)</span>' : ''}</div>
        <div style="color:${theme.muted};font-size:10px;">Dịch vụ: ${serviceInfo}${projectInfo} | ${cfg.zalo_groups?.length || 0} nhóm | ${dateStr}</div>
      `;
      
      if (currentMode === "idle") {
        const btnContainer = document.createElement("div");
        btnContainer.style.cssText = `display:flex;gap:4px;`;
        
        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.style.cssText = `padding:3px 6px;background:#1890ff;color:white;border:none;border-radius:2px;cursor:pointer;font-size:10px;`;
        editBtn.onclick = () => {
          formSnapshot = captureFormState();
          selectedRowData = cfg;
          loadRowToControls(cfg);
          setMode("edit", cfg);
        };
        
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "🗑️";
        deleteBtn.style.cssText = `padding:3px 6px;background:#ff4d4f;color:white;border:none;border-radius:2px;cursor:pointer;font-size:10px;`;
        deleteBtn.onclick = () => {
          if (confirm(`⚠️ Xóa config: ${cfg.fanpage_names?.join(', ') || cfg.fanpage_name}?`)) {
            const allData = loadDataOptionUser().filter(item => item.id !== cfg.id);
            saveDataOptionUser(allData, (success) => {
              if (success) {
                if (status) status.textContent = '✅ Đã xóa config';
                if (selectedRowData?.id === cfg.id) selectedRowData = null;
                renderZaloConfigList();
              } else {
                if (status) status.textContent = '⚠️ Lỗi xóa config';
              }
            });
          }
        };
        
        btnContainer.append(editBtn, deleteBtn);
        cfgItem.append(info, btnContainer);
      } else {
        cfgItem.append(info);
      }
      mgmtList.appendChild(cfgItem);
    });
  };
  
  const mgmtTitle = document.createElement("div");
  mgmtTitle.style.cssText = `font-weight:bold;margin-bottom:8px;color:${theme.text};font-size:12px;`;
  mgmtTitle.innerHTML = `📋 Cấu hình đã lưu (${loadDataOptionUser().filter(x => x.config_for_zalo).length})`;
  
  // Hướng dẫn thao tác
  const gridGuide = document.createElement("div");
  gridGuide.style.cssText = `margin-bottom:10px;padding:10px;background:${theme.infoBg};border-radius:4px;font-size:11px;color:${theme.info};border-left:3px solid ${theme.info};`;
  gridGuide.innerHTML = `
    <strong>📖 Hướng dẫn thao tác:</strong><br>
    <div style="margin-top:6px;line-height:1.6;">
      <strong>➕ THÊM MỚI:</strong><br>
      &nbsp;&nbsp;1. Nhấn nút <strong>"➕ Thêm mới"</strong> để xóa form<br>
      &nbsp;&nbsp;2. Check fanpage ở mục <strong>"📱 Facebook Token Management"</strong> phía trên<br>
      &nbsp;&nbsp;3. Nhập danh sách nhóm Zalo vào ô bên dưới (mỗi nhóm 1 dòng)<br>
      &nbsp;&nbsp;4. Nhấn <strong>"💾 Lưu cấu hình"</strong> → Thêm vào danh sách<br><br>
      
      <strong>✏️ SỬA:</strong><br>
      &nbsp;&nbsp;1. <strong>Click vào "✏️"</strong> trên dòng muốn sửa → Dữ liệu tự động load vào form<br>
      &nbsp;&nbsp;2. Thay đổi fanpage (check/uncheck) hoặc sửa danh sách nhóm<br>
      &nbsp;&nbsp;3. Nhấn <strong>"💾 Lưu cấu hình"</strong> → Cập nhật dòng đã chọn<br><br>
      
      <strong>🗑️ XÓA:</strong><br>
      &nbsp;&nbsp;• Click vào "🗑️" trên từng dòng để xóa<br>
      &nbsp;&nbsp;• Hoặc dùng nút <strong>"🗑️ Xóa hết"</strong> để xóa toàn bộ<br><br>
      
      <strong>💡 Lưu ý:</strong><br>
      &nbsp;&nbsp;• Domain, Service, Project lấy từ <strong>"Cài Đặt Chung"</strong>
    </div>
  `;
  
  // Thống kê tin Zalo đã đăng
  const postedStats = document.createElement("div");
  postedStats.id = "zalo-posted-stats";
  postedStats.style.cssText = `margin-bottom:10px;padding:10px;background:${theme.successBg};border-radius:4px;font-size:11px;color:${theme.success};border-left:3px solid ${theme.success};`;
  
  const updatePostedStats = () => {
    const posted = loadPostedZaloMessages();
    const totalPosted = posted.length;
    const last24h = posted.filter(p => {
      const age = Date.now() - p.timestamp;
      const isRecent = age < 24 * 60 * 60 * 1000;
      return isRecent;
    }).length;
    
    console.log(`📊 [UpdatePostedStats] Total: ${totalPosted}, Last 24h: ${last24h}`);
    
    postedStats.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>📊 Tin Zalo đã đăng:</strong> ${totalPosted} tin (${last24h} tin trong 24h)<br>
          <span style="font-size:10px;opacity:0.8;">Tự động lọc trùng lặp, cleanup sau ${ZALO_POSTED_CLEANUP_DAYS} ngày</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button id="btn-view-posted" style="padding:4px 8px;background:#52c41a;color:white;border:none;border-radius:3px;cursor:pointer;font-size:10px;">👁️ Xem</button>
          <button id="btn-clear-posted" style="padding:4px 8px;background:#ff4d4f;color:white;border:none;border-radius:3px;cursor:pointer;font-size:10px;">🗑️ Xóa</button>
        </div>
      </div>
    `;
  };
  
  updatePostedStats();
  
  // Expose ra window để có thể cập nhật từ bên ngoài
  window.updateZaloPostedStats = updatePostedStats;
  
  // Event listeners cho nút xem và xóa
  setTimeout(() => {
    const btnView = document.getElementById('btn-view-posted');
    const btnClear = document.getElementById('btn-clear-posted');
    
    if (btnView) {
      btnView.onclick = () => {
        const posted = loadPostedZaloMessages();
        if (posted.length === 0) {
          alert('Chưa có tin Zalo nào được đăng.');
          return;
        }
        
        let msg = `📊 DANH SÁCH ${posted.length} TIN ZALO ĐÃ ĐĂNG:\\n\\n`;
        posted.slice(0, 50).forEach((p, i) => {
          const date = new Date(p.timestamp).toLocaleString('vi-VN');
          msg += `${i + 1}. [${p.groupName}] ${p.sender} - ${date}\\n   ${p.content_preview}\\n\\n`;
        });
        
        if (posted.length > 50) {
          msg += `\\n... và ${posted.length - 50} tin khác`;
        }
        
        alert(msg);
      };
    }
    
    if (btnClear) {
      btnClear.onclick = () => {
        if (confirm(`⚠️ Xóa tất cả ${loadPostedZaloMessages().length} tin Zalo đã đăng?\\n\\nSau khi xóa, hệ thống có thể đăng lại các tin cũ.`)) {
          // Disable nút khi đang xử lý
          btnClear.disabled = true;
          const originalText = btnClear.textContent;
          btnClear.textContent = '⏳ Đang xóa...';
          
          try {
            savePostedZaloMessages([]);
            updatePostedStats();
            status.textContent = '✅ Đã xóa lịch sử tin Zalo đã đăng';
          } finally {
            // Re-enable nút sau khi hoàn tất
            setTimeout(() => {
              btnClear.disabled = false;
              btnClear.textContent = originalText;
            }, 500);
          }
        }
      };
    }
  }, 100);
  
  // Nút quản lý
  const mgmtBtnRow = document.createElement("div");
  mgmtBtnRow.style.cssText = `display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;`;
  
  const refreshTokensBtn = createButton("🔄 Cập nhật tokens", "#722ed1");
  refreshTokensBtn.title = "Tự động cập nhật access token mới từ Facebook Token Management cho tất cả cấu hình đã lưu";
  refreshTokensBtn.onclick = async () => {
    // Disable nút khi đang xử lý
    refreshTokensBtn.disabled = true;
    refreshTokensBtn.style.opacity = '0.6';
    refreshTokensBtn.style.cursor = 'not-allowed';
    const originalText = refreshTokensBtn.textContent;
    refreshTokensBtn.textContent = '⏳ Đang cập nhật...';
    
    try {
      status.textContent = "⏳ Đang cập nhật tokens...";
      const pages = getSelectedFacebookPages();
      if (pages.length === 0) {
        status.textContent = "⚠️ Chưa có fanpage. Hãy chọn fanpage ở mục Facebook trước.";
        return;
      }
      
      const allConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
      let updated = 0;
      
      allConfigs.forEach(cfg => {
        const page = pages.find(p => p.id === cfg.fanpage_id);
        if (page) {
          cfg.fanpage_token = page.access_token;
          updated++;
        }
      });
      
      saveDataOptionUser(loadDataOptionUser().map(item => 
        item.config_for_zalo ? allConfigs.find(c => c.id === item.id) || item : item
      ), (success, error) => {
        if (success) {
          status.textContent = `✅ Đang tải lại dữ liệu...`;
          console.log('[Zalo] Token refresh saved successfully');
          
          // Fetch fresh data trước khi render grid
          fetchDataOptionUserFromServer((fetchSuccess) => {
            if (fetchSuccess) {
              status.textContent = `✅ Cập nhật thành công ${updated} config`;
              console.log('[Zalo] Fetched fresh data after token refresh');
            } else {
              status.textContent = `✅ Cập nhật thành công ${updated} config (dùng cached data)`;
              console.warn('[Zalo] Fetch failed, using cached data');
            }
            renderZaloConfigList();
          });
        } else {
          status.textContent = `⚠️ Lưu thất bại nhưng cập nhật local thành công. Error: ${error}`;
          console.warn('[Zalo] Token refresh save error:', error);
          renderZaloConfigList();
        }
      });
    } catch (e) {
      status.textContent = `❌ Lỗi cập nhật: ${e.message}`;
      renderZaloConfigList();
    } finally {
      // Enable lại nút
      refreshTokensBtn.disabled = false;
      refreshTokensBtn.style.opacity = '1';
      refreshTokensBtn.style.cursor = 'pointer';
      refreshTokensBtn.textContent = originalText;
    }
  };

  const showFanpagesBtn = createButton("📱 Xem fanpages", "#1890ff");
  showFanpagesBtn.title = "Xem danh sách tất cả fanpage đã lưu trong Facebook Token Management";
  showFanpagesBtn.onclick = () => {
    // Disable nút khi đang xử lý
    showFanpagesBtn.disabled = true;
    showFanpagesBtn.style.opacity = '0.6';
    showFanpagesBtn.style.cursor = 'not-allowed';
    
    try {
      const pages = getSelectedFacebookPages();
      if (pages.length === 0) {
        status.textContent = "⚠️ Chưa có fanpage nào. Hãy chọn fanpage ở mục Facebook trước.";
        return;
      }
      let msg = `✅ Hiện có ${pages.length} fanpage:\n\n`;
      pages.forEach(p => {
        msg += `• ${p.name} (ID: ${p.id})\n`;
      });
      msg += `\n💡 Có thể dùng token từ các fanpage này để cập nhật config bằng nút "🔄 Cập nhật tokens"`;
      alert(msg);
    } finally {
      // Enable lại nút sau 300ms
      setTimeout(() => {
        showFanpagesBtn.disabled = false;
        showFanpagesBtn.style.opacity = '1';
        showFanpagesBtn.style.cursor = 'pointer';
      }, 300);
    }
  };
  
  const clearAllBtn = createButton("🗑️ Xoá hết", "#ff4d4f");
  clearAllBtn.title = "Xóa toàn bộ cấu hình Zalo đã lưu (không thể hoàn tác)";
  clearAllBtn.onclick = () => {
    if (confirm("⚠️ Xoá tất cả cấu hình Zalo? Hành động này KHÔNG THỂ HOÀN TÁC.")) {
      // Disable nút khi đang xử lý
      clearAllBtn.disabled = true;
      clearAllBtn.style.opacity = '0.6';
      clearAllBtn.style.cursor = 'not-allowed';
      
      try {
        const allData = loadDataOptionUser().filter(x => !x.config_for_zalo);
        saveDataOptionUser(allData, (success, error) => {
          if (success) {
            status.textContent = "✅ Đang tải lại...";
            console.log('[Zalo] Clear all configs saved successfully');
            
            // Fetch fresh data trước khi render grid
            fetchDataOptionUserFromServer((fetchSuccess) => {
              status.textContent = "✅ Đã xoá tất cả cấu hình";
              if (fetchSuccess) {
                console.log('[Zalo] Fetched fresh data after clear all');
              } else {
                console.warn('[Zalo] Fetch failed after clear, using cached data');
              }
              renderZaloConfigList();
              
              // Enable lại nút
              clearAllBtn.disabled = false;
              clearAllBtn.style.opacity = '1';
              clearAllBtn.style.cursor = 'pointer';
            });
          } else {
            status.textContent = `⚠️ Xoá local thành công nhưng lưu server thất bại. Error: ${error}`;
            console.warn('[Zalo] Clear all save error:', error);
            renderZaloConfigList();
            
            // Enable lại nút
            clearAllBtn.disabled = false;
            clearAllBtn.style.opacity = '1';
            clearAllBtn.style.cursor = 'pointer';
          }
        });
      } catch (e) {
        status.textContent = `❌ Lỗi: ${e.message}`;
        // Enable lại nút
        clearAllBtn.disabled = false;
        clearAllBtn.style.opacity = '1';
        clearAllBtn.style.cursor = 'pointer';
      }
    }
  };
  
  autoLoadBtn = createButton("⚡ Dùng config mới nhất", "#13c2c2");
  autoLoadBtn.title = "Tự động load cấu hình mới nhất vào form để sửa hoặc chạy scanner";
  autoLoadBtn.onclick = () => {
    // Disable nút khi đang xử lý
    autoLoadBtn.disabled = true;
    autoLoadBtn.style.opacity = '0.6';
    autoLoadBtn.style.cursor = 'not-allowed';
    
    try {
      const allConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
      if (allConfigs.length === 0) {
        status.textContent = "⚠️ Không có cấu hình nào để tải";
        return;
      }
      const latest = allConfigs[allConfigs.length - 1];
      selectedRowData = latest;
      loadRowToControls(latest);
      status.textContent = `✅ Đã tải config: ${latest.fanpage_names?.join(', ') || latest.fanpage_name}. Nhóm: ${latest.zalo_groups?.length || 0}.`;
    } finally {
      // Enable lại nút sau 500ms (debounce)
      setTimeout(() => {
        autoLoadBtn.disabled = false;
        autoLoadBtn.style.opacity = '1';
        autoLoadBtn.style.cursor = 'pointer';
      }, 500);
    }
  };
  
  // ===== NÚT SAVE VÀ NEW: Thêm/sửa dữ liệu từ controls vào grid =====
  saveConfigBtn = createButton("💾 Lưu cấu hình", "#52c41a");
  saveConfigBtn.title = "Lưu/cập nhật cấu hình từ các control (Global Settings, Fanpages, Zalo Groups)";
  saveConfigBtn.onclick = async () => {
    // Disable nút khi đang xử lý
    saveConfigBtn.disabled = true;
    saveConfigBtn.style.opacity = '0.6';
    saveConfigBtn.style.cursor = 'not-allowed';
    const originalText = saveConfigBtn.textContent;
    saveConfigBtn.textContent = '⏳ Đang lưu...';
    
    try {
      if (currentMode === "idle") {
        status.textContent = "⚠️ Hãy nhấn \"✏️\" để sửa hoặc \"➕ Thêm mới\" để tạo cấu hình mới.";
        return;
      }

      // Lấy data từ controls
      const globalSettings = getGlobalSettings();
      // ✅ Khi edit, dùng fanpage data đã lưu; khi create, lấy từ UI checkbox
      let selectedFanpages = [];
      if (currentMode === "edit" && editingFanpageData && editingFanpageData.fanpage_ids?.length > 0) {
        // Dùng dữ liệu từ row (bao gồm token)
        selectedFanpages = editingFanpageData.fanpage_ids.map((id, idx) => ({
          id,
          name: editingFanpageData.fanpage_names?.[idx] || 'Unknown',
          access_token: editingFanpageData.fanpage_tokens?.[idx] || ''
        }));
        console.log('[Zalo Config] Using saved fanpage data from edit row:', selectedFanpages);
      } else {
        // Lấy từ UI checkbox (khi create mới)
        const checkboxes = Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]'));
        const checked = checkboxes.filter(cb => cb.checked);
        selectedFanpages = checked.map(cb => {
          const page = facebookState.pages.find(p => p.id === cb.value);
          return {
            id: cb.value,
            name: page?.name || cb.nextSibling?.textContent?.trim() || 'Unknown',
            access_token: page?.access_token || ''
          };
        });
        console.log('[Zalo Config] Using fanpage data from UI checkboxes:', selectedFanpages);
      }
      const groupList = parseGroupList(input.value);
      
      // Validate
      if (selectedFanpages.length === 0) {
        status.textContent = "⚠️ Vui lòng check fanpage ở mục '📱 Facebook Token Management' phía trên trước!";
        console.warn('[Zalo Config] No fanpages selected. Mode:', currentMode, 'editingFanpageData:', editingFanpageData);
        return;
      }
      
      if (groupList.length === 0) {
        status.textContent = "⚠️ Vui lòng nhập ít nhất 1 nhóm Zalo";
        return;
      }
    
    // Tạo config object
    const configData = {
      domain: DOMAIN_OPTIONS[globalSettings.domainKey]?.value || 'phanmemmottrieu',
      domain_key: globalSettings.domainKey,
      service_type: globalSettings.industry,
      project: globalSettings.project,
      fanpage_ids: selectedFanpages.map(f => f.id),
      fanpage_id: selectedFanpages[0]?.id || null,
      fanpage_names: selectedFanpages.map(f => f.name),
      fanpage_name: selectedFanpages.map(f => f.name).join(', '),
      fanpage_tokens: selectedFanpages.map(f => f.access_token),
      fanpage_token: selectedFanpages[0]?.access_token || null,
      zalo_groups: groupList,
      config_for_zalo: true
    };
    
    // Uniqueness validation: domain + service_type + project
    const allConfigsForCheck = loadDataOptionUser().filter(x => x.config_for_zalo);
    const nextKey = [configData.domain, configData.service_type, configData.project]
      .map(normalizeKeyPart)
      .join("||");
    const duplicate = allConfigsForCheck.find(cfg => {
      if (selectedRowData?.id && cfg.id === selectedRowData.id) return false;
      const cfgKey = [cfg.domain, cfg.service_type, cfg.project].map(normalizeKeyPart).join("||");
      return cfgKey === nextKey;
    });
    if (duplicate) {
      status.textContent = "⚠️ Trùng cấu hình (Domain + Dịch vụ + Dự án). Vui lòng đổi giá trị để tránh trùng.";
      return;
    }

    if (selectedRowData && selectedRowData.id) {
      // Update existing row
      configData.id = selectedRowData.id;
      configData.created_at = selectedRowData.created_at;
      configData.updated_at = Date.now();
      
      const allConfigs = loadDataOptionUser();
      const index = allConfigs.findIndex(c => c.id === selectedRowData.id);
      if (index >= 0) {
        allConfigs[index] = { ...allConfigs[index], ...configData };
        saveDataOptionUser(allConfigs, (success, error) => {
          if (success) {
            // Reset state TRƯỚC khi render grid (tránh flickering)
            selectedRowData = null;
            editingFanpageData = null;
            
            // Clear form fields ngay lập tức
            Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]')).forEach(cb => {
              cb.checked = false;
            });
            input.value = '';
            
            // Set mode idle TRƯỚC khi render
            setMode("idle", null, { preserveStatus: true });
            status.textContent = `✅ Đã cập nhật config: ${configData.fanpage_name}`;
            console.log('[Zalo Config] Successfully saved to server');
            
            // Render grid SAU khi state/mode đã được reset
            renderZaloConfigList();
            
            // Fetch fresh data từ server để cập nhật
            fetchDataOptionUserFromServer((fetchSuccess, freshData) => {
              if (fetchSuccess) {
                console.log('[Zalo Config] Fetched fresh data');
                renderZaloConfigList();
              } else {
                console.warn('[Zalo Config] Fetch failed, using cached data');
              }
            });
          } else {
            status.textContent = `⚠️ Lỗi cập nhật config: ${error || 'Unknown error'}`;
            console.error('[Zalo Config] Save error:', error);
          }
        });
      }
    } else {
      // Create new row
      configData.created_at = Date.now();
      
      // DEBUG: Verify data trước khi add
      console.log('[Zalo Config] Adding new config:', configData);
      
      const newItem = addToDataOptionUser(configData, (success, error) => {
        if (success) {
          // Reset state TRƯỚC khi render grid (tránh flickering)
          selectedRowData = null;
          editingFanpageData = null;
          
          // Clear form fields ngay lập tức
          Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]')).forEach(cb => {
            cb.checked = false;
          });
          input.value = '';
          
          // Set mode idle TRƯỚC khi render
          setMode("idle", null, { preserveStatus: true });
          status.textContent = `✅ Đã thêm config mới: ${configData.fanpage_name}. Bạn có thể tiếp tục thêm cấu hình khác hoặc nhấn "➕ Thêm mới" để xóa form.`;
          console.log('[Zalo Config] Add success, rendering grid...');
          
          // Render grid SAU khi state/mode đã được reset
          renderZaloConfigList();
          
          // Auto-suggest clearing form for next entry
          setTimeout(() => {
            status.textContent = `${status.textContent} [💡 Tip: Nhấn "➕ Thêm mới" để xóa form và thêm cấu hình khác]`;
          }, 2000);
          
          // Fetch fresh data từ server để cập nhật
          fetchDataOptionUserFromServer((fetchSuccess, freshData) => {
            if (fetchSuccess) {
              console.log('[Zalo Config] After add, fetched fresh data');
              renderZaloConfigList();
            } else {
              console.warn('[Zalo Config] Fetch failed after add, using cached data');
            }
          });
        } else {
          status.textContent = `⚠️ Lỗi thêm config mới: ${error || 'Unknown error'}`;
          console.error('[Zalo Config] Add error:', error);
        }
      });
    }
    
    // DEBUG: Verify all configs before grid render
    const allConfigsBeforeRender = loadDataOptionUser();
    const zaloConfigs = allConfigsBeforeRender.filter(x => x.config_for_zalo);
    console.log('[Zalo Config] Total configs in localStorage:', allConfigsBeforeRender.length, 'Zalo configs:', zaloConfigs.length, zaloConfigs);
    
    // Refresh grid
    renderZaloConfigList();
    
    // DEBUG: Verify grid rendered after 500ms
    setTimeout(() => {
      const updatedConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
      console.log('[Zalo Config] Grid should now show', updatedConfigs.length, 'configs');
    }, 500);
    } finally {
      // Enable lại nút
      saveConfigBtn.disabled = false;
      saveConfigBtn.style.opacity = '1';
      saveConfigBtn.style.cursor = 'pointer';
      saveConfigBtn.textContent = originalText;
    }
  };
  
  newConfigBtn = createButton("➕ Thêm mới", "#1890ff");
  newConfigBtn.title = "Xóa form (clear fanpage + groups) để tạo cấu hình mới. Sau đó check fanpage, nhập nhóm và nhấn 'Lưu cấu hình'"; 
  newConfigBtn.onclick = () => {
    // Disable nút khi đang xử lý
    newConfigBtn.disabled = true;
    newConfigBtn.style.opacity = '0.6';
    newConfigBtn.style.cursor = 'not-allowed';
    
    try {
      formSnapshot = captureFormState();
      // Clear selection
      selectedRowData = null;
      editingFanpageData = null;
      
      // Clear controls (giữ Global Settings, chỉ clear fanpages từ Facebook Token section và groups)
      Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]')).forEach(cb => {
        cb.checked = false;
      });
      
      input.value = '';
      setMode("create");
      status.textContent = "📝 Form đã được xoá. Check fanpage và điền danh sách nhóm, rồi nhấn '💾 Lưu cấu hình'.";
    } finally {
      // Enable lại nút sau 300ms (debounce)
      setTimeout(() => {
        newConfigBtn.disabled = false;
        newConfigBtn.style.opacity = '1';
        newConfigBtn.style.cursor = 'pointer';
      }, 300);
    }
  };
  
  // � Refresh from server button - force reload từ server
  refreshFromServerBtn = createButton("🔄 Tải lại từ server", "#722ed1");
  refreshFromServerBtn.title = "Tải lại dữ liệu từ server và refresh grid (dùng khi grid không hiển thị đúng)";
  refreshFromServerBtn.onclick = () => {
    refreshFromServerBtn.disabled = true;
    const originalText = refreshFromServerBtn.textContent;
    refreshFromServerBtn.textContent = '⏳ Đang tải...';
    
    fetchDataOptionUserFromServer((success, data, error) => {
      if (success) {
        status.textContent = `✅ Đã tải ${data.filter(x => x.config_for_zalo).length} config từ server`;
        console.log('[Zalo] Manual refresh from server success');
        renderZaloConfigList();
      } else {
        status.textContent = `⚠️ Lỗi tải từ server: ${error}`;
        console.error('[Zalo] Manual refresh from server failed:', error);
      }
      
      // Enable lại nút
      setTimeout(() => {
        refreshFromServerBtn.disabled = false;
        refreshFromServerBtn.textContent = originalText;
      }, 500);
    });
  };
  
  // �🔍 Debug button - kiểm tra dữ liệu localStorage
  cancelBtn = createButton("✖️ Huỷ thao tác", "#d46b08");
  cancelBtn.title = "Hủy thao tác sửa/thêm và khôi phục trạng thái trước đó";
  cancelBtn.onclick = () => {
    applyFormState(formSnapshot);
    selectedRowData = null;
    formSnapshot = null;
    editingFanpageData = null;
    setMode("idle");
  };

  const debugBtn = createButton("🔍 Debug", "#8c8c8c");
  debugBtn.title = "Hiển thị dữ liệu Zalo config từ localStorage (mở DevTools console để xem chi tiết)";
  debugBtn.onclick = () => {
    const allData = loadDataOptionUser();
    const zaloConfigs = allData.filter(x => x.config_for_zalo);
    
    const debugMsg = `=== ZALO CONFIG DEBUG ===
📊 Total items in dataOptionUser: ${allData.length}
📋 Total Zalo configs: ${zaloConfigs.length}
Data stored in localStorage:
${JSON.stringify(zaloConfigs, null, 2)}`;
    
    console.log(debugMsg);
    alert(`✅ Debug info logged to console!\n\n${debugMsg.substring(0, 300)}...\n\n👓 Mở DevTools (F12) -> Console để xem chi tiết`);
  };
  
  mgmtBtnRow.append(saveConfigBtn, cancelBtn, newConfigBtn, autoLoadBtn, refreshTokensBtn, showFanpagesBtn, clearAllBtn, debugBtn);
  managementSection.append(mgmtTitle, gridGuide, postedStats, mgmtList, mgmtBtnRow);
  
  // Grid sẽ tự động render sau khi fetch data từ server (xem phần expose helpers phía trên)
  
  const input = document.createElement("textarea");
  input.id = "zalo-group-list";
  input.setAttribute('data-zalo-config-select', 'true'); // Mark for selective lock
  input.placeholder = "Mỗi nhóm 1 dòng:\nNhóm A\nQ1,3 50T\nNhóm BĐS HCM";
  input.style.cssText = `width:100%;min-height:80px;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};margin-bottom:8px;flex:1;`;
  input.value = loadGroupList().join("\n");

  status = document.createElement("div");
  status.id = "zalo-group-status";
  status.style.cssText = `font-size:12px;color:${theme.muted};margin-bottom:8px;`;
  status.textContent = "⏸ Chưa chạy quét.";

  setMode("idle");

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

  const startBtn = createButton("▶️ Bắt đầu quét", "#13c2c2");
  startBtn.setAttribute('data-zalo-start-scan', 'true');
  
  const stopBtn = createButton("⏸ Dừng quét", "#faad14");
  stopBtn.setAttribute('data-zalo-stop-scan', 'true');
  
  // ✅ Đảm bảo stopBtn luôn click được (cao hơn overlay)
  stopBtn.id = "zalo-stop-btn";
  stopBtn.style.position = "relative";
  stopBtn.style.zIndex = "9999999";  // Cao hơn overlay (999999)
  stopBtn.style.pointerEvents = "auto";
  
  // ✅ Hàm quản lý trạng thái ẩn/hiện các nút (disable logic now handled by selective lock)
  const setButtonsState = (isScanning) => {
    if (isScanning) {
      // Đang quét: Ẩn start, hiện stop
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
    } else {
      // Không quét: Hiện start, ẩn stop
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
    }
  };
  
  // Khởi tạo: Ẩn nút stop
  setButtonsState(false);

  // Scanner now handled by startZaloScanner() with sequential scheduler

  startBtn.onclick = () => {
    // Kiểm tra đăng nhập trước khi chạy scheduler
    status.textContent = "⏳ Kiểm tra đăng nhập Zalo...";
    startBtn.disabled = true;
    startBtn.style.opacity = '0.6';
    startBtn.style.cursor = 'not-allowed';
    
    checkZaloLogin(window.zaloScannerWebviewId).then(loggedIn => {
      if (loggedIn) {
        isZaloLoggedIn = true;
        console.log('▶️ [Zalo Scanner] Bắt đầu Sequential Scheduler');
        startZaloScanner(status);
        
        setButtonsState(true);
      } else {
        status.textContent = "⚠️ Chưa đăng nhập Zalo. Vui lòng đăng nhập ở bên phải trước.";
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
      }
    }).catch(err => {
      status.textContent = `❌ Lỗi: ${err.message}`;
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
    });
  };

  stopBtn.onclick = () => {
    stopZaloScanner(status);
    stopLoginCheck();
    status.textContent = "⏸ Đã dừng quét. Nhấn ▶️ Bắt đầu quét để quét lại.";
    
    // Ẩn/hiện nút theo trạng thái không scanning
    setButtonsState(false);
  };

  btnRow.append(startBtn, stopBtn);
  
  // Ghi chú hướng dẫn sử dụng fanpage từ Facebook Token section
  const fanpageNote = document.createElement("div");
  fanpageNote.style.cssText = `margin-bottom:10px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:11px;color:${theme.info};border-left:3px solid ${theme.info};`;
  fanpageNote.innerHTML = `
    💡 <strong>Lưu ý:</strong> Để chọn Fanpage đăng bài Zalo, hãy check vào các fanpage ở phần <strong>"📱 Facebook Token Management"</strong> phía trên.<br>
    ⚙️ Domain, Loại Dịch Vụ, Dự Án lấy từ <strong>"Cài Đặt Chung"</strong> phía trên.
  `;
  
  leftPanel.append(title, note, fanpageNote, managementSection, input, status, btnRow);

  // ===== PHẦN PHẢI: Webview Zalo =====
  const rightPanel = document.createElement("div");
  rightPanel.id = "zalo-webview-panel";
  rightPanel.style.cssText = `flex:1;min-width:350px;display:flex;flex-direction:column;`;

  wrapper.append(leftPanel, rightPanel);

  if (container) container.appendChild(wrapper);
  
  // ✅ GỌI RENDER SAU KHI TẤT CẢ UI ĐÃ ĐƯỢC TẠO VÀ APPEND VÀO DOM
  console.log('[Zalo] UI created, now rendering config list...');
  
  // Auto-load từ server nếu có, sau đó render list
  const csmUserDataOK = validateCsmUserDataReady();
  if (csmUserDataOK) {
    console.log('[Zalo] Fetching data from server...');
    fetchDataOptionUserFromServer((success, data, error) => {
      if (success) {
        console.log('[Zalo] ✅ Fetched', data.filter(x => x.config_for_zalo).length, 'Zalo configs');
      } else {
        console.warn('[Zalo] ⚠️ Fetch failed, using cached data:', error);
      }
      // Render sau khi fetch xong
      renderZaloConfigList();
    });
  } else {
    console.warn('[Zalo] csmUserData not ready, rendering with localStorage data');
    // Render ngay với dữ liệu localStorage
    renderZaloConfigList();
  }
  
  // Tự động tạo webview Zalo khi mở giao diện
  const webviewId = window.zaloScannerWebviewId;
  const zaloUrl = "https://chat.zalo.me/";
  
  try {
    const existingWebview = document.getElementById(webviewId);
    if (!existingWebview) {
      console.log(`🔧 Tự động tạo webview Zalo inline vào UI...`);
      createZaloWebview(webviewId, zaloUrl, rightPanel);
      status.textContent = `📱 Webview Zalo đã được tạo. Vui lòng đăng nhập...`;
    } else {
      console.log(`✅ Webview Zalo đã tồn tại`);
      status.textContent = `📱 Kết nối Zalo sẵn sàng. Đăng nhập và bắt đầu quét.`;
    }
  } catch (error) {
    console.error("❌ Lỗi tạo webview:", error);
    status.textContent = `⚠️ Có vấn đề với kết nối Zalo. Vui lòng thử lại.`;
  }
  
  return wrapper;
}

// ===== SERVICE CATEGORY CONTENT GENERATOR =====
/**
 * ========================================================
 * HÀM: getDomainInfo()
 * MỤC ĐÍCH: Kiểm tra domain hiện tại để xác định nên dùng config nào
 * 
 * Cách hoạt động:
 *   - Kiểm tra window.location.hostname
 *   - Nếu là phanmemmottrieu → Trả về config phanmemmottrieu
 *   - Nếu là h-holding hoặc lmkt → Trả về config lmkt
 *   - Nếu localhost → User sẽ chọn manual từ dropdown
 * 
 * Kết quả: { value, label, app_id }
 * ========================================================
 */
function getDomainInfo() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('phanmemmottrieu')) {
    return DOMAIN_OPTIONS.phanmemmottrieu;
  } else if (hostname.includes('h-holding') || hostname.includes('lmkt')) {
    return DOMAIN_OPTIONS.lmkt;
  } else if (hostname === 'localhost') {
    return null; // User chọn từ dropdown
  }
  
  return null;
}

/**
 * ========================================================
 * HÀM: getCategoriesForDomain(domainKey)
 * MỤC ĐÍCH: Lấy danh sách lĩnh vực/dự án theo domain
 * 
 * Input: 
 *   - "lmkt" → Trả về 6 dự án BĐS
 *   - "phanmemmottrieu" → Trả về 5 lĩnh vực
 * 
 * Output: Array of { slug, name, description, type, config }
 * 
 * Ví dụ:
 *   LMKT: [
 *     { slug: "destino-centro", name: "Destino Centro", type: "project" },
 *     { slug: "the-win-city", name: "The Win City", type: "project" },
 *     ...
 *   ]
 * 
 *   Phanmemmottrieu: [
 *     { slug: "bat-dong-san", name: "Bất Động Sản", type: "industry", config: {...} },
 *     { slug: "phan-mem", name: "Phần Mềm", type: "industry", config: {...} },
 *     ...
 *   ]
 * ========================================================
 */
function getCategoriesForDomain(domainKey) {
  const isLmkt = domainKey === 'lmkt';
  
  if (isLmkt) {
    // LMKT: 6 dự án BĐS
    const baseConfig = INDUSTRY_TYPES["bat-dong-san"] || {};

    return LMKT_PROJECT_DEFS.map(p => ({
      id: p.service_code,
      service_code: p.service_code,
      slug: p.service_code,
      group_slug: "du-an",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      name: p.name,
      name_en: p.name_en,
      name_zh: p.name_zh,
      category: p.category || p.name,
      category_en: p.category_en || p.name_en,
      category_zh: p.category_zh || p.name_zh,
      description: p.description || `Dự án bất động sản: ${p.name}`,
      description_en: p.description_en || '',
      description_zh: p.description_zh || '',
      image: p.image || '',
      icon: p.icon || '',
      attributes_icon: p.attributes_icon || baseConfig.attributes_icon || '',
      attributes_color: p.attributes_color || baseConfig.attributes_color || '',
      attributes_priority: typeof p.attributes_priority === 'number' ? p.attributes_priority : (baseConfig.attributes_priority || 0),
      attributes_title: p.attributes_title || baseConfig.attributes_title || '',
      attributes_title_en: p.attributes_title_en || baseConfig.attributes_title_en || '',
      attributes_title_zh: p.attributes_title_zh || baseConfig.attributes_title_zh || '',
      attributes_description: p.attributes_description || baseConfig.attributes_description || '',
      attributes_description_en: p.attributes_description_en || baseConfig.attributes_description_en || '',
      attributes_description_zh: p.attributes_description_zh || baseConfig.attributes_description_zh || '',
      attributes_keywords: p.attributes_keywords || baseConfig.attributes_keywords || '',
      attributes_keywords_en: p.attributes_keywords_en || baseConfig.attributes_keywords_en || '',
      attributes_keywords_zh: p.attributes_keywords_zh || baseConfig.attributes_keywords_zh || '',
      config: baseConfig,
      type: 'project'
    }));
  } else {
    // Phanmemmottrieu: 5 lĩnh vực kinh doanh
    return Object.entries(INDUSTRY_TYPES).map(([key, ind]) => ({
      id: key,
      service_code: key,
      slug: key,
      group_slug: "dich-vu",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      name: ind.name,
      name_en: ind.name_en || '',
      name_zh: ind.name_zh || '',
      category: ind.category || ind.name,
      category_en: ind.category_en || ind.name_en || '',
      category_zh: ind.category_zh || ind.name_zh || '',
      description: ind.attributes_description || ind.description || ind.prompt_focus || '',
      description_en: ind.attributes_description_en || '',
      description_zh: ind.attributes_description_zh || '',
      image: ind.image || '',
      icon: ind.icon || '',
      attributes_icon: ind.attributes_icon || '',
      attributes_color: ind.attributes_color || '',
      attributes_priority: typeof ind.attributes_priority === 'number' ? ind.attributes_priority : 0,
      attributes_title: ind.attributes_title || '',
      attributes_title_en: ind.attributes_title_en || '',
      attributes_title_zh: ind.attributes_title_zh || '',
      attributes_description: ind.attributes_description || '',
      attributes_description_en: ind.attributes_description_en || '',
      attributes_description_zh: ind.attributes_description_zh || '',
      attributes_keywords: ind.attributes_keywords || '',
      attributes_keywords_en: ind.attributes_keywords_en || '',
      attributes_keywords_zh: ind.attributes_keywords_zh || '',
      type: 'industry',
      config: ind
    }));
  }
}

function normalizeGroupSlug(slug, groupSlug, isGroupSlug) {
  const normalizedSlug = String(slug || '').trim();
  if (normalizedSlug === 'dich-vu' || normalizedSlug === 'du-an') return '';
  if (isGroupSlug) return normalizedSlug || '';
  return groupSlug || '';
}

function normalizeGroupFlags(slug, isGroupSlug, isGroupSlugDefault) {
  const normalizedSlug = String(slug || '').trim();
  if (normalizedSlug === 'dich-vu' || normalizedSlug === 'du-an') {
    return {
      is_service: true,
      is_group_slug: true,
      is_group_slug_default: false
    };
  }

  return {
    is_service: true,
    is_group_slug: typeof isGroupSlug === 'boolean' ? isGroupSlug : false,
    is_group_slug_default: false
  };
}

/**
 * ========================================================
 * HÀM: buildCategoryPrompt(categoryData, userCustomPrompt, domainKey)
 * MỤC ĐÍCH: Xây dựng prompt hoàn chỉnh để gửi cho AI
 * 
 * Cách hoạt động:
 *   1. Lấy config của lĩnh vực/dự án
 *   2. Lấy vai trò AI (prompt_role)
 *   3. Lấy phong cách viết (prompt_style)
 *   4. Lấy điều tránh (prompt_avoid)
 *   5. Lấy điều nhấn mạnh (prompt_focus)
 *   7. Thêm output format (JSON: content + content_en + content_zh)
 * 
 * Output: String prompt hoàn chỉnh gửi cho AI
 * 
 * Ví dụ prompt cho Phần Mềm:
 *   "Bạn là chuyên gia công nghệ...
 *    Phong cách: So sánh trước-sau...
 *    Tránh: Thuật ngữ kỹ thuật...
 *    Nhấn mạnh: Lợi ích cụ thể...
 *    User yêu cầu: [custom prompt]...
 *    Output JSON: { content, content_en, content_zh }"
 * ========================================================
 */
function buildCategoryPrompt(categoryData, userCustomPrompt, domainKey) {
  const isLmkt = domainKey === 'lmkt';
  const promptSeed = `SEED_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  let basePrompt = "";
  
  if (isLmkt) {
    // LMKT: Tất cả đều là BĐS
    const industryConfig = INDUSTRY_TYPES["bat-dong-san"] || {};
    const role = industryConfig.prompt_role || "chuyên gia bất động sản";
    const style = industryConfig.prompt_style || "Rõ ràng, thuyết phục, tập trung lợi ích";
    const avoid = industryConfig.prompt_avoid || "Không nói chung chung, không dùng thuật ngữ khó";
    const focus = industryConfig.prompt_focus || "Nhấn mạnh lợi ích cụ thể";
    basePrompt = `
========== LANDING PAGE CONTENT FOR ${categoryData.name.toUpperCase()} ==========
SEED: ${promptSeed} (KHÔNG ĐƯỢC IN RA TRONG OUTPUT)

🎭 ROLE: Bạn là ${role}
📝 STYLE: ${style}
⚠️  AVOID: ${avoid}
🎯 FOCUS: ${focus}

PROJECT: ${categoryData.name}
DESCRIPTION: Dự án bất động sản

USER REQUEST: ${userCustomPrompt || '(Không có yêu cầu bổ sung)'}

========== STRICT RULES ==========
❗ content_en và content_zh BẮT BUỘC khác content (dịch đúng ngôn ngữ)
❗ description/description_en/description_zh phải là mô tả đúng nghĩa (1-2 câu), KHÔNG dùng lại prompt_focus
❗ category/category_en/category_zh bắt buộc đủ 3 ngôn ngữ
❗ BẮT BUỘC trả đủ fields: name/name_en/name_zh, category/category_en/category_zh, description/description_en/description_zh, image, attributes_icon/attributes_color/attributes_priority, attributes_title/_en/_zh, attributes_description/_en/_zh, attributes_keywords/_en/_zh
❗ name_en/name_zh/category_en/category_zh BẮT BUỘC là ngôn ngữ đúng, KHÔNG được giữ nguyên tiếng Việt
❗ KHÔNG ĐƯỢC để trống bất kỳ trường nào trong JSON output
❗ Nếu thiếu trường, TỰ KIỂM TRA và TẠO LẠI trước khi trả về
❗ SELF-CHECK BẮT BUỘC TRƯỚC KHI TRẢ JSON:
  - content, content_en, content_zh (đủ, khác ngôn ngữ)
  - category, category_en, category_zh (đủ 3 ngôn ngữ)
  - description, description_en, description_zh (SEO: 150-160 ký tự, 1-2 câu, có keyword chính)
  - attributes_title/_en/_zh (SEO: 60-70 ký tự, có keyword chính + USP, không nhồi nhét)
  - attributes_description/_en/_zh (SEO: 150-160 ký tự, có keyword chính + lợi ích)
  - attributes_keywords/_en/_zh (5-8 keywords)
  - id/service_code/slug/group_slug/domain/status/is_service/is_group_slug/is_group_slug_default

========== CONTENT STRUCTURE (LANDING PAGE) ==========

✅ SECTION 1 - MAIN HEADLINE (h3)
   • 1 tiêu đề quyết định, 10-15 từ
   • Dùng benefit-driven headline
   • VD: "Khám phá không gian sống tương lai tại [Tên dự án]"

✅ SECTION 2 - INTRODUCTION (p)
   • 2-3 đoạn (250-300 từ)
   • Bắt đầu từ vấn đề/cảm xúc
   • Giới thiệu giải pháp (dự án)
   • Tôn lên giá trị/tầm quan trọng

✅ SECTION 3 - KEY BENEFITS (h4 + ul)
   • Tiêu đề: "Tại sao bạn nên chọn [Tên]"
   • 5-7 lợi ích, format ul/li
   • Mỗi item: ✓ Lợi ích cụ thể (15-20 từ)
   • VD: "✓ Vị trí chiến lược, gần các tiện ích chính"

✅ SECTION 4 - DETAILED FEATURES (h4 + p/em)
   • 3-4 tính năng nổi bật
   • Mỗi tính năng:
     - Tên (strong): Lĩnh vực (ví dụ: "Kiến trúc hiện đại")
     - Mô tả: 2-3 câu chi tiết
     - Lợi ích: 1-2 câu about benefit

✅ SECTION 5 - SOCIAL PROOF (p)
   • 2-3 đoạn (150-200 từ)
   • Thành công/reviews/case studies
   • Con số cụ thể: "Hơn X khách hàng..."
   • Tạo credibility & trust

✅ SECTION 6 - CTA (p + em)
   • Đoạn cuối: Lời kêu gọi hành động
   • Tôn nhã, không aggressive
   • VD: "Bạn đã sẵn sàng trải nghiệm?"
   • KHÔNG: "Liên hệ ngay", "Mua hôm nay"

📊 TOTAL LENGTH: 1500-2000 từ (phải chi tiết, không quá ngắn)
🎨 FORMAT: HTML (h3, h4, p, ul, li, strong, em)
✍️ TONE: Thân thiện, tự nhiên, chống chất AI khô khan (văn phong giàu ngữ điệu, mạch lạc)
🔍 SEO: Chèn từ khóa chính tự nhiên 6-10 lần, có biến thể đồng nghĩa; ưu tiên trải nghiệm đọc
🚫 AVOID: Câu cụt, liệt kê máy móc, nhồi từ khóa, văn mẫu lặp lại

========== EXACT HTML EXAMPLE (BẮT BUỘC PHẢI TƯƠNG TỰ) ==========
"content": "<h3>Khám phá không gian sống tương lai</h3><p>Trong thời đại ngày nay, việc tìm kiếm một không gian sống lý tưởng không chỉ là vấn đề tìm một căn nhà, mà là tìm kiếm một cuộc sống mới đầy tiềm năng. Chúng tôi mang đến giải pháp hoàn hảo với các dự án bất động sản được thiết kế khéo léo, kết hợp tiện nghi hiện đại với vị trí chiến lược.</p><p>Mỗi dự án của chúng tôi được xây dựng với suy nghĩ sâu sắc về nhu cầu của gia đình Việt, từ những gia đình trẻ muốn xây dựng tương lai, đến những người tìm kiếm một nơi yên tĩnh để hưởng thụ tuổi vàng.</p><h4>Tại sao chọn dự án của chúng tôi?</h4><ul><li>✓ Vị trí chiến lược, gần các tiện ích chính thành phố</li><li>✓ Thiết kế kiến trúc hiện đại, tối ưu hóa không gian sống</li><li>✓ Hệ thống tiện ích đầy đủ: công viên, trường học, siêu thị</li><li>✓ Chính sách tài chính linh hoạt, dễ tiếp cận</li><li>✓ Pháp lý rõ ràng, minh bạch, có bảo đảm</li></ul><h4>Tính năng nổi bật</h4><p><strong>Kiến trúc hiện đại:</strong> Mỗi căn hộ được thiết kế theo tiêu chuẩn quốc tế, tối đa hóa ánh sáng tự nhiên và thông gió. Không gian mở tạo cảm giác rộng rãi, phù hợp với lối sống hiện đại của gia đình Việt.</p><p><strong>Tiện ích toàn diện:</strong> Từ gym, hồ bơi, công viên cây xanh, đến các dịch vụ tiện ích khác, tất cả đều được quy hoạch để phục vụ nhu cầu đa dạng của cư dân.</p><p><strong>Vị trí vàng:</strong> Dự án nằm tại trung tâm thành phố, dễ dàng kết nối với các khu vực kinh tế, giáo dục, y tế và giải trí.</p><h4>Tin tưởng của hơn 5000 cư dân</h4><p>Chúng tôi vinh dự được hơn 5000 gia đình tin tưởng lựa chọn các dự án của mình. Từ những đánh giá tích cực của cư dân, chúng tôi thấy được sự hài lòng với chất lượng cuộc sống mà dự án mang lại. Hơn 95% cư dân của chúng tôi khuyến cáo dự án cho bạn bè và gia đình.</p><p><em>Bạn đã sẵn sàng trở thành một phần của cộng đồng cư dân hạnh phúc? Hãy liên hệ với chúng tôi để tìm hiểu thêm về các dự án mới nhất và nhận được các ưu đãi đặc biệt.</em></p>"

========== IMPORTANT NOTES ==========
❌ KHÔNG ĐƯỢC TRẢ: "content": "HTML Tiếng Việt (như trên)" hoặc "HTML như ví dụ trên"
❌ KHÔNG ĐƯỢC TRẢ: "content": "<h3>...</h3>" (PHẢI có NỘI DUNG THỰC TẾ trong tags)
✅ PHẢI TRẢ: HTML hoàn chỉnh với toàn bộ 6 sections và nội dung chi tiết (1500-2000 từ)
✅ PHẢI CÓ: h3 title, p intro (250-300 từ), h4 + ul benefits (5-7 items), h4 + p features, p social proof, p CTA

========== OUTPUT JSON FORMAT (FULL web_services) ==========
{
  "id": "${categoryData.id || categoryData.service_code || categoryData.slug}",
  "service_code": "${categoryData.service_code || categoryData.slug}",
  "slug": "${categoryData.slug}",
  "group_slug": "${categoryData.group_slug || (domainKey === 'lmkt' ? 'du-an' : 'dich-vu')}",
  "is_service": true,
  "is_group_slug": false,
  "is_group_slug_default": ${typeof categoryData.is_group_slug_default === 'boolean' ? categoryData.is_group_slug_default : false},
  "domain": "${(DOMAIN_OPTIONS[domainKey] && DOMAIN_OPTIONS[domainKey].value) ? DOMAIN_OPTIONS[domainKey].value : ''}",
  "status": "active",

  "name": "${categoryData.name || ''}",
  "name_en": "${categoryData.name_en || ''}",
  "name_zh": "${categoryData.name_zh || ''}",
  "category": "${categoryData.category || categoryData.name || ''}",
  "category_en": "${categoryData.category_en || categoryData.name_en || ''}",
  "category_zh": "${categoryData.category_zh || categoryData.name_zh || ''}",
  "description": "Mô tả 1-2 câu đúng nghĩa về dịch vụ/dự án, KHÔNG dùng prompt_focus",
  "description_en": "1-2 sentence English description of the service/project, not prompt_focus",
  "description_zh": "1-2句中文描述服务/项目，不得复用prompt_focus",

  "image": "${categoryData.image || ''}",
  "icon": "${categoryData.icon || ''}",
  "attributes_icon": "${categoryData.attributes_icon || ''}",
  "attributes_color": "${(categoryData.attributes_color || (categoryData.config && categoryData.config.color) || '#1890ff')}",
  "attributes_priority": ${categoryData.attributes_priority || 0},

  "content": "<h3>...</h3><p>...</p><h4>...</h4><ul><li>...</li></ul>...",
  "content_en": "<h3>...</h3><p>...</p><h4>...</h4><ul><li>...</li></ul>...",
  "content_zh": "<h3>...</h3><p>...</p><h4>...</h4><ul><li>...</li></ul>...",

  "attributes_title": "${categoryData.name || ''} - Tiêu đề hấp dẫn (60-80 ký tự)",
  "attributes_title_en": "${categoryData.name_en || categoryData.name || ''} - Engaging Title (60-80 chars)",
  "attributes_title_zh": "${categoryData.name_zh || categoryData.name || ''} - 吸引人的标题 (60-80字符)",

  "attributes_description": "Mô tả 150-160 ký tự về ${categoryData.name || ''}",
  "attributes_description_en": "150-160 chars description about ${categoryData.name_en || categoryData.name || ''}",
  "attributes_description_zh": "关于${categoryData.name_zh || categoryData.name || ''}的150-160字符描述",

  "attributes_keywords": "${(categoryData.name || '').toLowerCase()}, từ khóa 1, từ khóa 2, từ khóa 3, từ khóa 4",
  "attributes_keywords_en": "${(categoryData.name_en || categoryData.name || '').toLowerCase()}, keyword 1, keyword 2, keyword 3, keyword 4",
  "attributes_keywords_zh": "${(categoryData.name_zh || categoryData.name || '').toLowerCase()}, 关键词1, 关键词2, 关键词3, 关键词4",

  "updated_at": "AUTO_ISO_TIMESTAMP"
}
`;
  } else {
    // Phanmemmottrieu: Lĩnh vực có config riêng
    const config = categoryData.config || INDUSTRY_TYPES[categoryData.slug] || {};
    const role = config.prompt_role || "chuyên gia tư vấn dịch vụ";
    const style = config.prompt_style || "Rõ ràng, dễ hiểu, nhấn mạnh lợi ích";
    const avoid = config.prompt_avoid || "Không nói chung chung, không lặp ý";
    const focus = config.prompt_focus || "Nhấn mạnh lợi ích cụ thể";
    const nameEn = config.name_en || categoryData.name_en || categoryData.name || '';
    const nameZh = config.name_zh || categoryData.name_zh || categoryData.name || '';
    basePrompt = `
========== LANDING PAGE CONTENT FOR ${categoryData.name.toUpperCase()} ==========
SEED: ${promptSeed} (KHÔNG ĐƯỢC IN RA TRONG OUTPUT)

🎭 ROLE: Bạn là ${role}
📝 STYLE: ${style}
⚠️  AVOID: ${avoid}
🎯 FOCUS: ${focus}

INDUSTRY: ${categoryData.name} (${nameEn} / ${nameZh})

USER REQUEST: ${userCustomPrompt || '(Không có yêu cầu bổ sung)'}

========== STRICT RULES ==========
  **** BẮT BUỘC TRƯỚC KHI TRẢ JSON:
  - name/name_en/name_zh, category/category_en/category_zh, description/description_en/description_zh, image, attributes_icon/attributes_color/attributes_priority
  - content, content_en, content_zh (đủ, khác ngôn ngữ)
  - category, category_en, category_zh (đủ 3 ngôn ngữ)
  - name_en/name_zh/category_en/category_zh phải dịch đúng, không lặp lại tiếng Việt
  - description, description_en, description_zh (SEO: 150-160 ký tự, 1-2 câu, có keyword chính)
  - attributes_title/_en/_zh (SEO: 60-70 ký tự, có keyword chính + USP, không nhồi nhét)
  - attributes_description/_en/_zh (SEO: 150-160 ký tự, có keyword chính + lợi ích)
  - attributes_keywords/_en/_zh (5-8 keywords)
  - id/service_code/slug/group_slug/domain/status/is_service/is_group_slug/is_group_slug_default

========== CONTENT STRUCTURE (LANDING PAGE) ==========

✅ SECTION 1 - MAIN HEADLINE (h3)
   • 1 tiêu đề quyết định, 10-15 từ
   • Dùng benefit-driven headline
   • VD: "Khám phá sức mạnh của [Tên lĩnh vực]"

✅ SECTION 2 - INTRODUCTION (p)
   • 2-3 đoạn (250-300 từ)
   • Bắt đầu từ vấn đề/nỗi đau
   • Giới thiệu giải pháp (lĩnh vực này)
   • Tôn lên giá trị thực tế

✅ SECTION 3 - KEY BENEFITS (h4 + ul)
   • Tiêu đề: "Tại sao bạn nên [hành động]"
   • 5-7 lợi ích, format ul/li
   • Mỗi item: ✓ Lợi ích cụ thể (15-20 từ)
   • Dùng con số/dữ liệu khi có

✅ SECTION 4 - USE CASES / EXAMPLES (h4 + p)
   • 3-4 trường hợp sử dụng thực tế
   • Mỗi case:
     - Tình huống (strong): Mô tả vấn đề
     - Giải pháp: Cách giải quyết bằng lĩnh vực này
     - Kết quả: Lợi ích cụ thể

✅ SECTION 5 - TESTIMONIAL / TRUST (p)
   • 2-3 đoạn (150-200 từ)
   • Khách hàng hài lòng/reviews/case studies
   • Con số cụ thể: "Hơn X người..."
   • Tạo credibility

✅ SECTION 6 - CTA (p + em)
   • Đoạn cuối: Lời kêu gọi hành động
   • Tôn nhã, khuyến khích
   • VD: "Bạn đã sẵn sàng trải nghiệm?"
   • KHÔNG: "Liên hệ ngay", "Mua hôm nay"

📊 TOTAL LENGTH: 1500-2000 từ (chi tiết, không sơ sài, không quá ngắn)
🎨 FORMAT: HTML (h3, h4, p, ul, li, strong, em)
✍️ TONE: Thân thiện, tự nhiên, chống chất AI khô khan (văn phong giàu ngữ điệu, có nhịp điệu)
🔍 SEO: Chèn từ khóa chính tự nhiên 6-10 lần, có biến thể đồng nghĩa; ưu tiên trải nghiệm đọc
🚫 AVOID: Câu cụt, liệt kê máy móc, nhồi từ khóa, văn mẫu lặp lại

========== OUTPUT JSON FORMAT (FULL web_services) ==========
{
  "id": "${categoryData.id || categoryData.service_code || categoryData.slug}",
  "service_code": "${categoryData.service_code || categoryData.slug}",
  "slug": "${categoryData.slug}",
  "group_slug": "${categoryData.group_slug || (domainKey === 'lmkt' ? 'du-an' : 'dich-vu')}",
  "is_service": true,
  "is_group_slug": false,
  "is_group_slug_default": ${typeof categoryData.is_group_slug_default === 'boolean' ? categoryData.is_group_slug_default : false},
  "domain": "${(DOMAIN_OPTIONS[domainKey] && DOMAIN_OPTIONS[domainKey].value) ? DOMAIN_OPTIONS[domainKey].value : ''}",
  "status": "active",

  "name": "${categoryData.name || ''}",
  "name_en": "${(config && config.name_en) || categoryData.name_en || ''}",
  "name_zh": "${(config && config.name_zh) || categoryData.name_zh || ''}",
  "category": "${categoryData.category || categoryData.name || ''}",
  "category_en": "${categoryData.category_en || (config && config.name_en) || categoryData.name_en || ''}",
  "category_zh": "${categoryData.category_zh || (config && config.name_zh) || categoryData.name_zh || ''}",
  "description": "Mô tả 1-2 câu đúng nghĩa về dịch vụ, KHÔNG dùng prompt_focus",
  "description_en": "1-2 sentence English description of the service, not prompt_focus",
  "description_zh": "1-2句中文描述服务，不得复用prompt_focus",

  "image": "${categoryData.image || ''}",
  "icon": "${categoryData.icon || ''}",
  "attributes_icon": "${categoryData.attributes_icon || ''}",
  "attributes_color": "${(categoryData.attributes_color || (config && config.color) || '#1890ff')}",
  "attributes_priority": ${categoryData.attributes_priority || 0},

  "content": "<h3>...</h3><p>...</p><h4>...</h4><ul><li>...</li></ul>...",
  "content_en": "<h3>...</h3><p>...</p><h4>...</h4><ul><li>...</li></ul>...",
  "content_zh": "<h3>...</h3><p>...</p><h4>...</h4><ul><li>...</li></ul>...",

  "attributes_title": "${categoryData.name || ''} - Tiêu đề hấp dẫn (60-80 ký tự)",
  "attributes_title_en": "${(config && config.name_en) || categoryData.name || ''} - Engaging Title (60-80 chars)",
  "attributes_title_zh": "${(config && config.name_zh) || categoryData.name || ''} - 吸引人的标题 (60-80字符)",

  "attributes_description": "Mô tả 150-160 ký tự về ${categoryData.name || ''}",
  "attributes_description_en": "150-160 chars description about ${(config && config.name_en) || categoryData.name || ''}",
  "attributes_description_zh": "关于${(config && config.name_zh) || categoryData.name || ''}的150-160字符描述",

  "attributes_keywords": "${(categoryData.name || '').toLowerCase()}, từ khóa 1, từ khóa 2, từ khóa 3, từ khóa 4",
  "attributes_keywords_en": "${((config && config.name_en) || categoryData.name || '').toLowerCase()}, keyword 1, keyword 2, keyword 3, keyword 4",
  "attributes_keywords_zh": "${((config && config.name_zh) || categoryData.name || '').toLowerCase()}, 关键词1, 关键词2, 关键词3, 关键词4",

  "updated_at": "AUTO_ISO_TIMESTAMP"
}
`;
  }
  
  return basePrompt;
}

/**
 * ========================================================
 * HÀM: parseAIResponse(rawResponse)
 * MỤC ĐÍCH: Parse và validate response từ AI
 * 
 * Cách hoạt động:
 *   1. Kiểm tra response không rỗng
 *   2. Nếu là object → Lấy .result hoặc chính nó
 *   3. Nếu là string → Parse JSON
 *   4. Validate: phải có content, content_en, content_zh
 *   5. Trả về object hoặc throw error
 * 
 * Input: Raw response từ AI (object hoặc string)
 * Output: { content, content_en, content_zh }
 * ========================================================
 */

// ========================================================
// HÀM: TẠO PROMPT CHO NỘI DUNG LĨNH VỰC/DỰ ÁN
// ========================================================
/**
 * TẠO PROMPT CHO NỘI DUNG LĨNH VỰC/DỰ ÁN (CHI TIẾT NHƯ LANDING PAGE)
 * @param {string} categoryName - Tên lĩnh vực/dự án (VD: "Phần Mềm", "Destino Centro")
 * @param {string} description - Mô tả lĩnh vực/dự án
 * @param {string} prompt - Hướng dẫn của người dùng
 * @param {string} domainKey - Domain key (lmkt hoặc phanmemmottrieu)
 * @param {object} categoryData - Category data object chứa slug, service_code, etc.
 */
function getCategoryContentPrompt(categoryName, description, prompt, domainKey = '', categoryData = {}, creative = {}) {
  const randomSeed = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  
  // 12 góc nhìn đa dạng với hướng dẫn mở đầu
  const contentAngles = [
    "Nhà đầu tư: ROI + dòng tiền. Mở: Số liệu thị trường",
    "Người dùng: Trải nghiệm thực. Mở: Ngày làm việc điển hình",
    "Chuyên gia: Phân tích xu hướng. Mở: Insight từ kinh nghiệm",
    "So sánh: Vì sao tốt hơn. Mở: Vấn đề của alternatives",
    "Câu chuyện: Success story. Mở: Tình huống before/after",
    "Giáo dục: Hướng dẫn thực hành. Mở: Câu hỏi challenge",
    "Tương lai: Vision & innovation. Mở: Kịch bản lý tưởng",
    "Giải pháp: Fix vấn đề ngay. Mở: Pain points cụ thể",
    "Behind-the-scenes: Quy trình tạo ra. Mở: Effort & craftsmanship",
    "Cộng đồng: Impact xã hội. Mở: Community value",
    "Data-driven: Số liệu thực tế. Mở: Statistics & metrics",
    "Personal journey: Hành trình cá nhân. Mở: Transformation story"
  ];
  
  // 8 personas đa dạng hơn
  const agePersonas = [
    { label: "Gen Z 18-24", tone: "Casual, trendy, conversational", focus: "Trend, khác biệt, status" },
    { label: "Young 25-30", tone: "Thực tế, data-focused", focus: "ROI, giá trị, growth" },
    { label: "Family 31-40", tone: "Cân bằng, gia đình first", focus: "Tương lai con, ổn định" },
    { label: "Established 41-50", tone: "Chuyên nghiệp, strategic", focus: "Bảo vệ, kế thừa" },
    { label: "Senior 51+", tone: "Ấm áp, wisdom", focus: "Chất lượng, legacy" },
    { label: "Entrepreneur", tone: "Dynamic, risk-aware", focus: "Opportunity, efficiency" },
    { label: "Corporate", tone: "Formal, process-driven", focus: "Compliance, scale" },
    { label: "Creative", tone: "Inspiring, emotional", focus: "Innovation, experience" }
  ];

  const selectedAngle = creative?.angle || contentAngles[Math.floor(Math.random() * contentAngles.length)];
  const selectedPersona = creative?.persona && typeof creative.persona === 'object'
    ? {
      label: creative.persona.label || 'Custom Persona',
      tone: creative.persona.tone || 'Tự nhiên, chân thực',
      focus: creative.persona.focus || 'Giá trị thực tế'
    }
    : agePersonas[Math.floor(Math.random() * agePersonas.length)];

  const creativeRole = creative?.role;
  const creativeStyle = creative?.style;
  const creativeAvoid = creative?.avoid;
  const creativeFocus = creative?.focus;

  return `
[UNIQUE_ID]: ${randomSeed}
[TASK]: Landing page "${categoryName}"
[DESC]: ${description}
[ANGLE]: ${selectedAngle}
[PERSONA]: ${selectedPersona.label} - ${selectedPersona.tone}
[FOCUS]: ${selectedPersona.focus}
[USER]: ${prompt || 'Tự do sáng tạo'}
${creativeRole ? `\n[ROLE]: ${creativeRole}` : ''}
${creativeStyle ? `\n[STYLE]: ${creativeStyle}` : ''}
${creativeAvoid ? `\n[AVOID]: ${creativeAvoid}` : ''}
${creativeFocus ? `\n[EXTRA_FOCUS]: ${creativeFocus}` : ''}

🚫 CẤM TUYỆT ĐỐI:
❌ "Bạn có bao giờ" | "Thời đại công nghệ" | "Không chỉ...mà còn" | "Hiện thực hóa" | "Tổ ấm" | "An cư lạc nghiệp"
❌ "Vượt trội" | "Đừng bỏ lỡ" | "Chúng tôi hiểu" | "Hơn 10,000" | "95% hài lòng" | "Hãy khám phá" | "Liên hệ ngay"
❌ Mở "Bạn có/đã bao giờ" | Lặp con số | Kết mọi section bằng CTA | "Vô cùng/cực kỳ/tuyệt vời"

✅ BẮT BUỘC:
• Mở đầu theo ${selectedAngle}
• Tone ${selectedPersona.tone}
• Focus ${selectedPersona.focus}

🎯 VIẾT THEO [TARGET PERSONA] - KHÔNG ĐẶC BIỆT QUAN TRỌNG:
• Language tone phải phù hợp với từng nhóm tuổi
• Nội dung phải resonant với mối quan tâm/nỗi sợ của nhóm đó
• Ví dụ Gen Z dùng "sustainable, community, trend" - Gen X dùng "stability, family legacy, peace of mind"

🎯 VIẾT THEO [FOCUS] - VÔ CÙNG QUAN TRỌNG:
• Mỗi persona có mục tiêu khác nhau - phải focus vào đó!
• Gen Z: Highlight xu hướng, status, sự khác biệt
• 25-35: Highlight ROI, giá trị tiền, tương lai gia đình
• 40-55: Highlight ổn định, bảo vệ, kế thừa
• 55+: Highlight chất lượng, bình yên, kết nối cộng đồng

========== YÊU CẦU NỘI DUNG ========== 

⚠️ QUAN TRỌNG - FORMAT HTML:
• content, content_en, content_zh: TRẢ VỀ HTML THUẦN (plain HTML)
• VD: "<h3>Tiêu đề</h3><p>Đoạn văn...</p><ul><li>Item 1</li></ul>"
• KHÔNG cần mã hóa, KHÔNG escape HTML entities, KHÔNG URL encode
• Chỉ cần escape JSON string: " → \" và \\ → \\\\
• Backend sẽ tự động mã hóa (encodeHtml + encodeURIComponent) khi lưu

🎯 CÁCH TIẾP CẬN - TRÁNH TEMPLATE:
- Viết như con người thật, có trải nghiệm, không dùng cụm từ sáo rỗng ("tuyệt vời", "hiệu quả vô cùng")
- Gọi trực tiếp độc giả: "Bạn cần...", "Bạn sẽ...", "Giải pháp cho bạn là..."
- Dùng từ ngữ đời thường: "Cái hay là", "Nói thật ra", "Điểm mạnh ở chỗ"
- Chứa con số cụ thể và ví dụ thực tế
- Mở đầu theo kiểu Scene-Setting (mô tả một khung cảnh/vấn đề thực tế) hoặc Question (đặt câu hỏi vào nỗi đau)

⚠️ TUYỆT ĐỐI TRÁNH NHỮNG CỤM TỪ LẶP LẠI:
- ❌ KHÔNG dùng "Bạn có bao giờ tự hỏi..." (template chết)
- ❌ KHÔNG bắt đầu = "Trong thời đại công nghệ phát triển nhanh..."
- ❌ KHÔNG: "Không chỉ là một sản phẩm, mà còn là..."
- ❌ KHÔNG: "Hiện thực hóa ước mơ", "tổ ấm", "an cư lạc nghiệp" (cụm từ bất động sản cũ)
- ❌ KHÔNG lặp "Hơn 10,000 khách hàng" ở mỗi nội dung
- ❌ KHÔNG: "Những lợi ích vượt trội" (từ ngữ máy móc)
- ❌ KHÔNG: Luôn kết thúc bằng "Liên hệ ngay" hoặc "Khám phá thêm"

✅ CÓ THỂ DÙNG:
- Mở đầu từ con số: "90% doanh nghiệp...", "Mỗi năm có khoảng X..."
- Kể một câu chuyện cụ thể: "Ông Minh, Giám đốc công ty XYZ, từng lo lắng rằng..."
- Dùng lời trích dẫn từ khách hàng thực tế
- Mô tả chi tiết một quy trình hoặc sự kiện
- Dùng các cấu trúc câu đa dạng: câu ngắn, câu dài, danh sách, đoạn văn tư lự

📏 CẤU TRÚC BẮT BUỘC (6 Sections):
  
  1️⃣ MAIN HEADLINE (h3) - 1 tiêu đề quyết định, 10-15 từ
     VD: "Khám phá sức mạnh của ${categoryName} - Giải pháp cho..."
     ✓ Gợi ý lợi ích hoặc vấn đề
     ✗ KHÔNG: Chỉ là tên sản phẩm

  2️⃣ INTRODUCTION (2-3 đoạn, 200-300 từ) - MỞ ĐẦU ĐẶC BIỆT:
     Phụ thuộc vào [ANGLE] được chọn, bắt đầu theo một trong các cách sau:
     
     🔹 Nếu ANGLE = "Thống kê": Mở bằng con số thú vị (VD: "Năm 2024, 73% doanh nghiệp...")
     🔹 Nếu ANGLE = "Kể chuyện": Mở bằng tình cảnh thực tế (VD: "Chiều thứ 6, anh Hùng lại..."
     🔹 Nếu ANGLE = "Nhân xét chuyên gia": Mở bằng cảnh báo từ thực tế (VD: "Sau 10 năm làm việc, tôi nhận ra rằng...")
     🔹 Nếu ANGLE = "So sánh": Mở bằng liệt kê vấn đề (VD: "Phần mềm A có X, nhưng lại thiếu Y...")
     🔹 Nếu ANGLE = "Giáo dục": Mở bằng câu hỏi khác (VD: "Bạn có biết rằng chỉ 20% người biết về...")
     🔹 Nếu ANGLE = "Tương lai": Mở bằng sơ tán kịch bản (VD: "Hãy tưởng tượng vào năm 2025...")
     🔹 Nếu ANGLE = "Thực tế": Mở bằng vấn đề cụ thể (VD: "Mỗi ngày, X khách hàng phải gặp vấn đề...")
     
     - Đoạn 1: Đặt vấn đề hoặc scene-setting (không lặp lại các cụm từ cũ)
     - Đoạn 2: Giới thiệu giải pháp (${categoryName} là... hoặc "Đó là lý do ra đời ${categoryName}")
     - Đoạn 3: Tôn lên tầm quan trọng/giá trị thực tế (tùy theo ANGLE)

  3️⃣ WHY CHOOSE (h4 + ul, 5-7 items)
     Tiêu đề: "Tại sao bạn nên chọn ${categoryName}?"
     Mỗi lợi ích (li):
       ✓ "✓ Tiết kiệm 70% thời gian so với cách truyền thống"
       ✓ "✓ Tăng doanh số lên 150% - con số từ 500+ khách hàng"
       ✓ "✓ Tính năng X giúp Y (cụ thể, đo lường được)"

  4️⃣ FEATURES / USE CASES (h4 + 3-4 items)
     Tiêu đề: "Tính năng nổi bật" hoặc "Cách sử dụng"
     Mỗi item:
       - <strong>Tên tính năng:</strong> Mô tả chi tiết (2-3 câu) + ví dụ (1-2 câu)
       VD: "<strong>Tự động hóa quy trình:</strong> Giảm nhập liệu thủ công, lỗi con người... Ví dụ: Khách hàng XYZ tiết kiệm 80 giờ/tháng..."

  5️⃣ SOCIAL PROOF / TESTIMONIAL (2-3 đoạn, 150-200 từ)
     - "Hơn 10,000 khách hàng sử dụng..."
     - "95% khách hàng hài lòng (hoặc specific achievement)"
     - 1-2 case study ngắn hoặc quote từ khách hàng
     ✓ Con số cụ thể, %

  6️⃣ CTA (Call-to-Action) - p + em
     Tôn nhã, khuyến khích (KHÔNG: "Liên hệ ngay", "Mua hôm nay")
     VD: "Bạn đã sẵn sàng trải nghiệm sự khác biệt?"
     VD: "Hãy khám phá thêm để tìm giải pháp phù hợp cho nhu cầu của bạn"

📊 ĐỘ DÀI & FORMAT:
  • Tổng: 1500-2200 từ (HTML, không Markdown)
  • Tags được phép: h3, h4, p, ul, li, strong, em, br
  • Inline style được phép: color, font-weight, margin, padding
  • Escape quotes: " → \"

========== ĐA NGÔN NGỮ - PHẢI DỊCH THỰC TẾ ========== 

🌍 TIẾNG VIỆT (content) - Gốc
  ✓ Từ thông dụng, dễ hiểu, tránh Hán-Việt phức tạp
  ✓ Cấu trúc: Chủ-Vị-Tân, mạch lạc, có rhythm
  ✓ SEO: Chèn từ khóa chính 6-10 lần tự nhiên

🇬🇧 TIẾNG ANH (content_en) - Phải dịch từ Việt, KHÔNG copy-paste
  ✓ Grammar đúng, cấu trúc câu tự nhiên
  ✓ Giữ cấu trúc HTML (h3/p/h4/ul) giống hệt content VI
  ✓ Từ khóa dịch sang English equivalent tự nhiên
  ✓ Professional nhưng dễ hiểu, KHÔNG máy móc

🇨🇳 TIẾNG TRUNG (content_zh) - Phải dịch từ Việt, KHÔNG copy-paste  
  ✓ Dùng 繁體中文 (Traditional), KHÔNG Simplified
  ✓ Giữ cấu trúc HTML giống hệt content VI
  ✓ Dịch tự nhiên, tránh quá kỹ thuật, có nhịp điệu
  ✓ Từ khóa dịch sang Trung tự nhiên (VD: "bất động sản" → "房地產", không phải "不动产")

========== CẤU TRÚC DỮ LIỆU ĐẦU RA - JSON ONLY (Không bọc ký tự lạ) ==========
⚠️ JSON BẮT BUỘC:
- Không được xuống dòng thật bên trong JSON string. Nếu cần xuống dòng, dùng "\\n".
- JSON output phải là single-line (1 dòng), không có line break.
{
  // ===== IDENTIFIERS =====
  "id": "${categoryData.id || categoryData.service_code || categoryData.slug || 'AUTO_ID'}",
  "service_code": "${categoryData.service_code || categoryData.slug || 'AUTO_SERVICE_CODE'}",
  "slug": "${categoryData.slug || 'AUTO_SLUG'}",
  "group_slug": "${categoryData.group_slug || (domainKey === 'lmkt' ? 'du-an' : 'dich-vu')}",
  "is_service": true,
  "is_group_slug": false,
  "is_group_slug_default": ${typeof categoryData.is_group_slug_default === 'boolean' ? categoryData.is_group_slug_default : false},
  "domain": "${(DOMAIN_OPTIONS[domainKey] && DOMAIN_OPTIONS[domainKey].value) ? DOMAIN_OPTIONS[domainKey].value : 'AUTO_DOMAIN'}",
  "status": "active",

  // ===== DANH MỤC (3 NGÔN NGỮ) - Tên dịch vụ/lĩnh vực =====
  "name": "${categoryName}",
  "name_en": "${categoryName} (English translation - dịch tự nhiên, không copy)",
  "name_zh": "${categoryName} (中文翻译 - 自然翻译，不复制)",
  "category": "${categoryName}",
  "category_en": "English equivalent of ${categoryName} (tự nhiên)",
  "category_zh": "中文equivalent of ${categoryName} (自然)",
  
  // ===== MÔ TẢ NGẮN (3 NGÔN NGỮ) - Giới thiệu dịch vụ/lĩnh vực =====
  "description": "1-2 câu giới thiệu DỊCH VỤ/LĨNH VỰC ${categoryName} (150-160 ký tự). Nêu: loại dịch vụ + đối tượng + giá trị chính. VD: 'Dịch vụ phần mềm quản lý giúp doanh nghiệp tự động hóa quy trình, tiết kiệm 70% thời gian xử lý công việc.'",
  "description_en": "1-2 sentence service/industry intro in English (150-160 chars): type + target + value. E.g., 'Management software helps businesses automate processes, saving 70% time.' DỊCH THỰC TẾ, không copy.",
  "description_zh": "1-2句服务/行业简介（150-160字符）：类型+目标+价值。例如：'管理软件帮助企业自动化流程，节省70%时间。' 真实翻译，不复制。",

  // ===== MEDIA =====
  "image": "",
  "icon": "",
  "attributes_icon": "",
  "attributes_color": "#1890ff",
  "attributes_priority": 0,

  // ===== NỘI DUNG CHÍNH (3 NGÔN NGỮ) - Landing page HTML =====
  // ⚠️ TRẢ VỀ HTML THUẦN - Backend sẽ tự mã hóa
  // BẮT BUỘC: Áp dụng đúng 6 SECTIONS như yêu cầu phía trên (h3 → p intro → h4+ul benefits → h4+p features → p social proof → p+em CTA)
  // Escape JSON string: " → \" và \\ → \\\\
  
  "content": "<h3>Khám phá sức mạnh của ${categoryName} - Giải pháp toàn diện cho nhu cầu của bạn</h3><p>Trong thời đại công nghệ phát triển nhanh như hiện nay, việc tìm kiếm một giải pháp phù hợp không chỉ là vấn đề lựa chọn sản phẩm, mà là tìm kiếm đối tác đồng hành lâu dài. Chúng tôi hiểu rõ những thách thức mà bạn đang gặp phải: thời gian quý báu bị lãng phí vào những công việc thủ công, chi phí vận hành ngày càng tăng cao, và sự cạnh tranh khốc liệt từ thị trường.</p><p>Với ${categoryName}, bạn sẽ tìm thấy giải pháp được thiết kế dành riêng cho nhu cầu thực tế của mình. Không chỉ đơn thuần là một sản phẩm, đây là công cụ giúp bạn tối ưu hóa quy trình, nâng cao hiệu suất, và tạo ra giá trị bền vững cho doanh nghiệp. Hơn 10,000 khách hàng đã tin tưởng lựa chọn chúng tôi và ghi nhận những thay đổi tích cực đáng kể.</p><h4>Tại sao bạn nên chọn ${categoryName}?</h4><ul><li>✓ Tiết kiệm 70% thời gian xử lý công việc so với phương pháp truyền thống, giúp bạn tập trung vào những công việc quan trọng hơn</li><li>✓ Tăng hiệu suất làm việc lên 150% - con số được xác nhận từ hơn 500 khách hàng doanh nghiệp</li><li>✓ Giao diện thân thiện, dễ sử dụng ngay cả với người mới bắt đầu, không cần đào tạo phức tạp</li><li>✓ Hỗ trợ đa nền tảng, làm việc mọi lúc mọi nơi với các thiết bị khác nhau</li><li>✓ Chi phí hợp lý với nhiều gói dịch vụ linh hoạt, phù hợp với mọi quy mô</li><li>✓ Đội ngũ hỗ trợ 24/7 luôn sẵn sàng giải đáp thắc mắc và xử lý sự cố nhanh chóng</li></ul><h4>Tính năng và khả năng nổi bật</h4><p><strong>Tự động hóa quy trình:</strong> Giảm thiểu nhập liệu thủ công, loại bỏ lỗi con người và tăng độ chính xác lên 99%. Ví dụ: Công ty ABC đã tiết kiệm được 80 giờ mỗi tháng nhờ tính năng này, cho phép nhân viên tập trung vào công việc sáng tạo và chiến lược hơn.</p><p><strong>Phân tích dữ liệu thông minh:</strong> Cung cấp báo cáo chi tiết và trực quan về hiệu suất, giúp bạn đưa ra quyết định dựa trên số liệu thực tế. Hệ thống AI tích hợp sẽ gợi ý những cải tiến phù hợp với xu hướng thị trường.</p><p><strong>Tích hợp liền mạch:</strong> Kết nối dễ dàng với các công cụ và phần mềm bạn đang sử dụng, tránh gián đoạn trong quy trình làm việc hiện tại. Hỗ trợ hơn 50+ nền tảng phổ biến.</p><p><strong>Bảo mật đa lớp:</strong> Dữ liệu của bạn được mã hóa với tiêu chuẩn ngân hàng, sao lưu tự động mỗi giờ, đảm bảo an toàn tuyệt đối. Chúng tôi tuân thủ các tiêu chuẩn bảo mật quốc tế ISO 27001.</p><h4>Hơn 10,000+ khách hàng tin tưởng và hài lòng</h4><p>Chúng tôi tự hào được hơn 10,000 khách hàng từ nhiều lĩnh vực khác nhau lựa chọn và tin tưởng sử dụng ${categoryName}. Họ đã ghi nhận sự cải thiện đáng kể trong hiệu quả công việc, tiết kiệm chi phí vận hành, và nâng cao chất lượng dịch vụ đến khách hàng cuối. Tỷ lệ khách hàng hài lòng của chúng tôi đạt trên 95%, với hơn 4.8/5 sao đánh giá trên các nền tảng uy tín.</p><p>Một trong những khách hàng tiêu biểu là Công ty XYZ, đã giảm 60% thời gian xử lý đơn hàng và tăng 40% doanh thu chỉ sau 3 tháng sử dụng. Họ chia sẻ: \"Đây là khoản đầu tư xứng đáng nhất mà chúng tôi từng thực hiện.\"</p><p><em>Bạn đã sẵn sàng trải nghiệm sự khác biệt mà ${categoryName} mang lại? Hãy khám phá thêm để tìm ra giải pháp phù hợp nhất cho nhu cầu của bạn. Chúng tôi cam kết đồng hành cùng bạn trên con đường phát triển bền vững.</em></p>",
  
  "content_en": "<h3>Discover the Power of ${categoryName} - Comprehensive Solution for Your Needs</h3><p>In today's rapidly evolving technological landscape, finding the right solution isn't just about choosing a product—it's about finding a long-term partner. We understand the challenges you face: valuable time wasted on manual tasks, rising operational costs, and fierce market competition.</p><p>With ${categoryName}, you'll find a solution designed specifically for your real needs. More than just a product, it's a tool that helps you optimize processes, enhance performance, and create sustainable value for your business. Over 10,000 customers have trusted us and witnessed significant positive changes.</p><h4>Why Choose ${categoryName}?</h4><ul><li>✓ Save 70% of task processing time compared to traditional methods, allowing you to focus on more important work</li><li>✓ Increase work efficiency by 150% - a figure confirmed by over 500 business customers</li><li>✓ User-friendly interface, easy to use even for beginners, no complex training required</li><li>✓ Multi-platform support, work anytime, anywhere with different devices</li><li>✓ Reasonable cost with flexible service packages, suitable for all scales</li><li>✓ 24/7 support team always ready to answer questions and resolve issues quickly</li></ul><h4>Outstanding Features and Capabilities</h4><p><strong>Process Automation:</strong> Minimize manual data entry, eliminate human errors, and increase accuracy to 99%. Example: Company ABC saved 80 hours per month with this feature, allowing employees to focus on more creative and strategic work.</p><p><strong>Smart Data Analysis:</strong> Provides detailed and visual performance reports, helping you make data-driven decisions. The integrated AI system will suggest improvements aligned with market trends.</p><p><strong>Seamless Integration:</strong> Easily connects with the tools and software you're currently using, avoiding disruptions to your existing workflow. Supports over 50+ popular platforms.</p><p><strong>Multi-layer Security:</strong> Your data is encrypted with banking standards, automatically backed up every hour, ensuring absolute safety. We comply with international security standards ISO 27001.</p><h4>Trusted by Over 10,000+ Satisfied Customers</h4><p>We are proud to be chosen and trusted by over 10,000 customers from various industries using ${categoryName}. They have noted significant improvements in work efficiency, operational cost savings, and enhanced service quality to end customers. Our customer satisfaction rate exceeds 95%, with over 4.8/5 star ratings on reputable platforms.</p><p>One notable customer is Company XYZ, which reduced order processing time by 60% and increased revenue by 40% after just 3 months of use. They shared: \"This is the most worthwhile investment we've ever made.\"</p><p><em>Are you ready to experience the difference that ${categoryName} brings? Explore further to find the most suitable solution for your needs. We are committed to accompanying you on your sustainable development journey.</em></p>",
  
  "content_zh": "<h3>探索${categoryName}的强大功能 - 满足您需求的全面解决方案</h3><p>在当今科技快速发展的时代，寻找合适的解决方案不仅仅是选择产品的问题，更是寻找长期合作伙伴。我们深知您面临的挑战：宝贵的时间浪费在手工作业上，运营成本不断上升，以及来自市场的激烈竞争。</p><p>通过${categoryName}，您将找到专为您的实际需求而设计的解决方案。这不仅仅是一个产品，更是帮助您优化流程、提高绩效、为企业创造可持续价值的工具。已有超过10,000名客户信任并选择我们，见证了显著的积极变化。</p><h4>为什么选择${categoryName}？</h4><ul><li>✓ 与传统方法相比，节省70%的任务处理时间，让您专注于更重要的工作</li><li>✓ 工作效率提高150% - 这一数字得到了500多家企业客户的确认</li><li>✓ 用户友好的界面，即使是初学者也易于使用，无需复杂培训</li><li>✓ 多平台支持，随时随地使用不同设备工作</li><li>✓ 合理的成本，提供灵活的服务套餐，适合各种规模</li><li>✓ 24/7客服团队随时准备解答疑问并快速解决问题</li></ul><h4>突出的功能和能力</h4><p><strong>流程自动化：</strong>最大限度减少手工数据输入，消除人为错误，将准确率提高到99%。例如：ABC公司通过此功能每月节省80小时，使员工能够专注于更具创造性和战略性的工作。</p><p><strong>智能数据分析：</strong>提供详细且直观的绩效报告，帮助您根据实际数据做出决策。集成的AI系统将建议符合市场趋势的改进措施。</p><p><strong>无缝集成：</strong>轻松连接您当前使用的工具和软件，避免中断现有工作流程。支持50多个热门平台。</p><p><strong>多层安全保障：</strong>您的数据采用银行级标准加密，每小时自动备份，确保绝对安全。我们遵守ISO 27001国际安全标准。</p><h4>获得10,000+客户的信任和满意</h4><p>我们自豪地被来自不同行业的超过10,000名客户选择并信任使用${categoryName}。他们注意到工作效率显著提高、运营成本节省以及向最终客户提供的服务质量提升。我们的客户满意度超过95%，在知名平台上获得超过4.8/5星的评分。</p><p>其中一个显著的客户是XYZ公司，在使用仅3个月后就将订单处理时间减少了60%，收入增加了40%。他们分享道：\"这是我们做过的最值得的投资。\"</p><p><em>您准备好体验${categoryName}带来的不同了吗？进一步探索，找到最适合您需求的解决方案。我们致力于在您的可持续发展道路上与您同行。</em></p>",

  // ===== TIÊU ĐỀ META (3 NGÔN NGỮ) - SEO meta title (hiển thị trên Google) =====
  "attributes_title": "${categoryName} - Tiêu đề SEO hấp dẫn (60-70 ký tự, có keyword chính + lợi ích/USP). VD: 'Phần Mềm Quản Lý - Tự Động Hóa & Tiết Kiệm 70% Thời Gian'",
  "attributes_title_en": "${categoryName} - SEO meta title English (60-70 chars, main keyword + benefit). E.g., 'Management Software - Automate & Save 70% Time'",
  "attributes_title_zh": "${categoryName} - SEO元标题（60-70字符，主关键词+优势）。例如：'管理软件 - 自动化并节省70%时间'",

  // ===== MÔ TẢ META (3 NGÔN NGỮ) - SEO meta description (hiển thị dưới title trên Google) =====
  "attributes_description": "Mô tả SEO 150-160 ký tự, tóm tắt lợi ích + призыв к действию. VD: 'Phần mềm quản lý giúp doanh nghiệp tự động hóa quy trình, tiết kiệm 70% thời gian. Khám phá ngay để tối ưu hiệu suất làm việc!'",
  "attributes_description_en": "SEO meta description 150-160 chars, summary + CTA. E.g., 'Management software helps businesses automate processes, save 70% time. Discover now to optimize work efficiency!'",
  "attributes_description_zh": "SEO元描述150-160字符，摘要+行动号召。例如：'管理软件帮助企业自动化流程，节省70%时间。立即探索以优化工作效率！'",

  // ===== TỪ KHÓA SEO (3 NGÔN NGỮ) - 5-8 keywords ngăn cách bằng dấu phẩy =====
  "attributes_keywords": "${categoryName}, từ khóa liên quan 1, long-tail keyword 2, keyword 3, keyword 4, keyword 5, keyword 6 (5-8 từ khóa)",
  "attributes_keywords_en": "${categoryName}, related keyword 1, long-tail keyword 2, keyword 3, keyword 4, keyword 5, keyword 6 (5-8 keywords)",
  "attributes_keywords_zh": "${categoryName}, 相关关键词1, 长尾关键词2, 关键词3, 关键词4, 关键词5, 关键词6（5-8个关键词）",

  // ===== TIMESTAMP =====
  "updated_at": "AUTO_ISO_TIMESTAMP"
}

✅ RÀNG BUỘC CHẤT LƯỢNG (11 ĐIỂM - TRÁNH TEMPLATE):
  1. Content: 6 sections (h3 title, p intro, h4+ul benefits, h4 features, p social proof, p CTA)
  2. Độ dài: 1500-2200 từ HTML
  3. Không copy-paste: content_en/zh phải dịch chân thực từ content VI
  4. ❌ TUYỆT ĐỐI TRÁNH CỤM TỪ TEMPLATE: 
     - "Bạn có bao giờ tự hỏi" (dùng 1 lần tối đa hoặc không dùng)
     - "Trong thời đại công nghệ phát triển nhanh"
     - "Không chỉ là một sản phẩm, mà còn là"
     - "Hiện thực hóa ước mơ"
     - "Những lợi ích vượt trội"
     - "Đừng bỏ lỡ cơ hội"
     → Nếu dùng cụm này quá 2 lần trong cả nội dung, CẤP ĐIỂM THẤP!
  5. HTML hợp lệ: tags đóng đầy đủ, quotes escape đúng
  6. category_en/description_en khác category/description VI (không giống)
  7. category_zh/description_zh khác category/description VI (không giống)
  8. Có con số cụ thể (70%, hơn 10,000, 95%) - nhưng CHỈ dùng con số VÀO ĐÚNG CHỖ (không lặp "hơn 10,000" ở mỗi bài)
  9. Có ít nhất 1 case study hoặc ví dụ thực tế (không dùng "Công ty ABC" quá nhiều)
  10. SEO: Từ khóa chính xuất hiện 6-10 lần tự nhiên (VI/EN/ZH riêng)
  11. Mở đầu PHẢI KHÁC NHAU: Không dùng cùng một cách mở bài cho 2 nội dung liên tiếp

========== VALIDATION TRƯỚC KHI TRẢ VỀ ==========

TRƯỚC KHI TRẢ VỀ JSON, BẠN PHẢI:
1. Kiểm tra toàn bộ "content" (Vietnamese):
   ❌ Nếu chứa "Bạn có bao giờ tự hỏi" → REWRITE NGAY
   ❌ Nếu chứa "Trong thời đại công nghệ phát triển nhanh" → REWRITE NGAY
   ❌ Nếu chứa "Không chỉ là một sản phẩm, mà còn là" → REWRITE NGAY
   ❌ Nếu chứa "Hiện thực hóa ước mơ" hoặc "tổ ấm" hoặc "an cư lạc nghiệp" → REWRITE NGAY

2. Nếu đã pass kiểm tra, TRẢ VỀ đầy đủ JSON với 12 fields

3. Nếu KHÔNG pass → REWRITE nội dung cho đến khi pass tất cả!

========== START CREATING LANDING PAGE CONTENT NOW ==========`;
}

/**
 * ========================================================
 * HÀM: upsertServiceCategoryContent(ctx, categorySlug, contentData)
 * MỤC ĐÍCH: Lưu (insert hoặc update) content vào bảng web_services
 * 
 * Quy trình:
 *   1. Kiểm tra category tồn tại trong web_services
 *   2. Nếu không tồn tại → Throw error
 *   3. Nếu tồn tại → Update 3 fields: content, content_en, content_zh
 *   4. Cập nhật timestamp (updated_at)
 *   5. Trả về kết quả update
 * 
 * Input:
 *   - ctx: Object chứa helperApi, app_id, domain
 *   - categorySlug: Slug của category (VD: "phan-mem")
 *   - contentData: { content, content_en, content_zh }
 * 
 * Output: Result từ updateTableData
 * ========================================================
 */
async function upsertServiceCategoryContent(ctx, categorySlug, contentData) {
  console.log(`[upsertServiceCategoryContent] Bắt đầu cập nhật ${categorySlug} - ${new Date().toLocaleTimeString()}`);

  const domainKey = Object.keys(DOMAIN_OPTIONS).find(key => {
    const domainValue = DOMAIN_OPTIONS[key]?.value || '';
    const primaryDomain = domainValue.split(',')[0];
    return domainValue === ctx.domain
      || domainValue.includes(ctx.domain)
      || (primaryDomain && ctx.domain.includes(primaryDomain));
  }) || '';

  const baseCategory = getCategoriesForDomain(domainKey || 'phanmemmottrieu')
    .find(cat => cat.slug === categorySlug) || {};
  const baseConfig = baseCategory.config || {};
  
  const where = {
    operator: "AND",
    conditions: [
      { field: "slug", type: "eq", value: categorySlug },
      { field: "domain", type: "eq", value: ctx.domain }
    ]
  };

  const rows = await ctx.helperApi.getTableData({
    app_id: ctx.app_id,
    obj_name: "web_services",
    where,
    take: 1
  }).catch(() => ({ rows: [] }));

  const existing = (rows.rows || rows.data || [])[0] || {};
  let fallbackRow = {};
  if (!existing || !existing.slug) {
    const rowsBySlug = await ctx.helperApi.getTableData({
      app_id: ctx.app_id,
      obj_name: "web_services",
      where: { field: "slug", type: "eq", value: categorySlug },
      take: 1
    }).catch(() => ({ rows: [] }));
    fallbackRow = (rowsBySlug.rows || rowsBySlug.data || [])[0] || {};
  }

  const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');
  const pickNumber = (...vals) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return 0;
  };
  
  // Chuẩn bị dữ liệu cập nhật
  const rawContent = encodeHtml(contentData.content || '', { urlEncode: false }) || '';
  const rawContentEn = encodeHtml(contentData.content_en || '', { urlEncode: false }) || '';
  const rawContentZh = encodeHtml(contentData.content_zh || '', { urlEncode: false }) || '';

  const groupFlags = normalizeGroupFlags(
    baseCategory.slug || categorySlug,
    typeof contentData.is_group_slug === 'boolean'
      ? contentData.is_group_slug
      : (typeof baseCategory.is_group_slug === 'boolean' ? baseCategory.is_group_slug : false),
    typeof contentData.is_group_slug_default === 'boolean'
      ? contentData.is_group_slug_default
      : (typeof baseCategory.is_group_slug_default === 'boolean' ? baseCategory.is_group_slug_default : false)
  );

  const objUpdate = {
    ...existing,
    id: pick(contentData.id, existing.id, fallbackRow.id, baseCategory.id, baseCategory.service_code, baseCategory.slug),
    service_code: pick(contentData.service_code, existing.service_code, fallbackRow.service_code, baseCategory.service_code, baseCategory.slug),
    slug: baseCategory.slug || categorySlug,
    group_slug: normalizeGroupSlug(
      baseCategory.slug || categorySlug,
      pick(contentData.group_slug, existing.group_slug, fallbackRow.group_slug, baseCategory.group_slug, domainKey === 'lmkt' ? 'du-an' : 'dich-vu'),
      groupFlags.is_group_slug
    ),
    is_service: typeof groupFlags.is_service === 'boolean'
      ? groupFlags.is_service
      : (typeof contentData.is_service === 'boolean' ? contentData.is_service : (typeof baseCategory.is_service === 'boolean' ? baseCategory.is_service : true)),
    is_group_slug: groupFlags.is_group_slug,
    is_group_slug_default: groupFlags.is_group_slug_default,
    domain: ctx.domain,
    app_id: ctx.app_id,
    status: pick(contentData.status, existing.status, fallbackRow.status, baseCategory.status, 'active'),

    name: pick(contentData.name, existing.name, fallbackRow.name, baseCategory.name),
    name_en: pick(contentData.name_en, existing.name_en, fallbackRow.name_en, baseCategory.name_en, contentData.name, existing.name, fallbackRow.name, baseCategory.name),
    name_zh: pick(contentData.name_zh, existing.name_zh, fallbackRow.name_zh, baseCategory.name_zh, contentData.name, existing.name, fallbackRow.name, baseCategory.name),
    category: pick(contentData.category, existing.category, fallbackRow.category, baseCategory.category, contentData.name, existing.name, fallbackRow.name, baseCategory.name),
    category_en: pick(contentData.category_en, existing.category_en, fallbackRow.category_en, baseCategory.category_en, contentData.name_en, existing.name_en, fallbackRow.name_en, baseCategory.name_en),
    category_zh: pick(contentData.category_zh, existing.category_zh, fallbackRow.category_zh, baseCategory.category_zh, contentData.name_zh, existing.name_zh, fallbackRow.name_zh, baseCategory.name_zh),
    description: pick(contentData.description, existing.description, fallbackRow.description, baseCategory.description),
    description_en: pick(contentData.description_en, existing.description_en, fallbackRow.description_en, baseCategory.description_en),
    description_zh: pick(contentData.description_zh, existing.description_zh, fallbackRow.description_zh, baseCategory.description_zh),

    image: pick(contentData.image, existing.image, fallbackRow.image, baseCategory.image, ''),
    icon: pick(contentData.icon, existing.icon, fallbackRow.icon, baseCategory.icon, ''),
    attributes_icon: pick(contentData.attributes_icon, existing.attributes_icon, fallbackRow.attributes_icon, baseCategory.attributes_icon, baseConfig.attributes_icon),
    attributes_color: pick(contentData.attributes_color, existing.attributes_color, fallbackRow.attributes_color, baseCategory.attributes_color, baseConfig.attributes_color),
    attributes_priority: pickNumber(contentData.attributes_priority, existing.attributes_priority, fallbackRow.attributes_priority, baseCategory.attributes_priority, baseConfig.attributes_priority),

    attributes_title: pick(contentData.attributes_title, existing.attributes_title, fallbackRow.attributes_title, baseCategory.attributes_title, baseConfig.attributes_title),
    attributes_title_en: pick(contentData.attributes_title_en, existing.attributes_title_en, fallbackRow.attributes_title_en, baseCategory.attributes_title_en, baseConfig.attributes_title_en),
    attributes_title_zh: pick(contentData.attributes_title_zh, existing.attributes_title_zh, fallbackRow.attributes_title_zh, baseCategory.attributes_title_zh, baseConfig.attributes_title_zh),
    attributes_description: pick(contentData.attributes_description, existing.attributes_description, fallbackRow.attributes_description, baseCategory.attributes_description, baseConfig.attributes_description),
    attributes_description_en: pick(contentData.attributes_description_en, existing.attributes_description_en, fallbackRow.attributes_description_en, baseCategory.attributes_description_en, baseConfig.attributes_description_en),
    attributes_description_zh: pick(contentData.attributes_description_zh, existing.attributes_description_zh, fallbackRow.attributes_description_zh, baseCategory.attributes_description_zh, baseConfig.attributes_description_zh),
    attributes_keywords: pick(contentData.attributes_keywords, existing.attributes_keywords, fallbackRow.attributes_keywords, baseCategory.attributes_keywords, baseConfig.attributes_keywords),
    attributes_keywords_en: pick(contentData.attributes_keywords_en, existing.attributes_keywords_en, fallbackRow.attributes_keywords_en, baseCategory.attributes_keywords_en, baseConfig.attributes_keywords_en),
    attributes_keywords_zh: pick(contentData.attributes_keywords_zh, existing.attributes_keywords_zh, fallbackRow.attributes_keywords_zh, baseCategory.attributes_keywords_zh, baseConfig.attributes_keywords_zh),

    content: rawContent,
    content_en: rawContentEn,
    content_zh: rawContentZh,
    config: JSON.stringify(baseConfig || {}),
    updated_at: new Date().toISOString()
  };

  const nameBase = objUpdate.name || '';
  const categoryBase = objUpdate.category || '';

  if (!objUpdate.name_en || objUpdate.name_en === nameBase) {
    objUpdate.name_en = objUpdate.category_en || nameBase;
  }
  if (!objUpdate.name_zh || objUpdate.name_zh === nameBase) {
    objUpdate.name_zh = objUpdate.category_zh || nameBase;
  }
  if (!objUpdate.category_en || objUpdate.category_en === categoryBase) {
    objUpdate.category_en = objUpdate.name_en || categoryBase;
  }
  if (!objUpdate.category_zh || objUpdate.category_zh === categoryBase) {
    objUpdate.category_zh = objUpdate.name_zh || categoryBase;
  }
  
  console.log(`[upsertServiceCategoryContent] Cập nhật web_services.${categorySlug}`);
  
  const result = await ctx.helperApi.updateTableData({
    app_id: ctx.app_id,
    obj_name: "web_services",
    command: "update",
    obj_update: objUpdate,
    pk_fields: ["slug", "domain", "status"]
  });
  
  console.log(`[upsertServiceCategoryContent] Cập nhật thành công - ${new Date().toLocaleTimeString()}`);
  return { result, objUpdate };
}

/**
 * ========================================================
 * HÀM: createServiceCategoryContent(opts)
 * MỤC ĐÍCH: Tạo content (text) dịch vụ bằng AI
 *           Kết hợp config lĩnh vực + user prompt → gửi AI → lưu DB
 * 
 * Quy trình:
 *   1. Validate: categorySlug, categoryName, userPrompt
 *   2. Build prompt: getCategoryContentPrompt() ← Kết hợp config + user prompt
 *   3. Gọi AI: window.csmAI.generateSeoContentWithPrompt()
 *   4. Parse response: Lấy .result từ response
 *   5. Lưu vào DB: upsertServiceCategoryContent()
 *   6. Trả về contentData
 * 
 * Input: Options object
 *   {
 *     app_id: "wuweb" | "lmkt",
 *     domain: "phanmemmottrieu.net",
 *     categorySlug: "phan-mem",
 *     categoryName: "Phần Mềm",
 *     description: "...",
 *     prompt: "Hướng dẫn từ user"
 *   }
 * 
 * Output: { content, content_en, content_zh }
 * ========================================================
 */
async function createServiceCategoryContent(opts = {}) {
  const ctx = resolveContext();
  ctx.app_id = opts.app_id || ctx.app_id;
  ctx.domain = opts.domain || ctx.domain;
  
  const categorySlug = opts.categorySlug;
  const categoryName = opts.categoryName;
  const description = opts.description || '';
  const userPrompt = opts.prompt || '';
  
  if (!categorySlug || !categoryName) {
    throw new Error("Thiếu categorySlug hoặc categoryName");
  }
  if (!userPrompt.trim()) {
    throw new Error("Vui lòng nhập hướng dẫn nội dung");
  }
  
  console.log(`[createServiceCategoryContent] Bắt đầu tạo content cho ${categoryName}`);
  
  thongbao(`🤖 Đang gọi AI tạo nội dung dịch vụ cho "${categoryName}"...`);
  
  // BUILD PROMPT: Kết hợp config + user prompt
  // Xác định domainKey từ ctx.domain
  const domainKey = Object.keys(DOMAIN_OPTIONS).find(key => 
    DOMAIN_OPTIONS[key].value === ctx.domain
  ) || '';
  
  // Category data object
  const categoryData = {
    slug: categorySlug,
    service_code: categorySlug,
    name: categoryName,
    description: description
  };
  
  const creative = await requestCreativeParams('category_landing', {
    industry: categorySlug,
    categoryName,
    description,
    domainKey
  }, ctx.helperAi);

  const prompt = getCategoryContentPrompt(categoryName, description, userPrompt, domainKey, categoryData, creative || {});
  const generateFn = ctx.helperAi?.generateSeoContentWithPrompt;
  
  if (!generateFn) throw new Error("generateSeoContentWithPrompt không khả dụng");
  
  console.log(`[DEBUG] Prompt length: ${prompt?.length || 0}`);
  
  const startAI = Date.now();
  const result = await generateFn(prompt);
  const durationAI = ((Date.now() - startAI) / 1000).toFixed(1);
  
  console.log(`[createServiceCategoryContent] AI trả về sau ${durationAI}s`);
  console.log(`[DEBUG] Result:`, result);
  
  if (!result?.success) {
    throw new Error(`AI failed: ${result?.message || 'Không có message'}`);
  }
  
  const contentData = result.result || result.data;
  if (!contentData) {
    throw new Error("AI response không có content");
  }
  
  // Cập nhật vào web_services
  thongbao(`💾 Đang lưu content vào web_services...`);
  await upsertServiceCategoryContent(ctx, categorySlug, contentData);
  
  console.log(`[createServiceCategoryContent] Hoàn tất`);
  return contentData;
}

// ========================================================
// HÀM: ensureServiceContentUI()
// MỤC ĐÍCH: Tạo giao diện (UI) để người dùng tạo content dịch vụ
// 
// Cách hoạt động:
//   1. Kiểm tra UI đã tồn tại chưa
//   2. Nếu có rồi → Trả về element hiện có
//   3. Nếu chưa → Tạo UI mới gồm:
//      - Domain dropdown (Chọn LMKT hoặc Phanmemmottrieu)
//      - Category dropdown (Tự động load theo domain)
//      - Description preview (Hiển thị mô tả lĩnh vực)
//      - Textarea (Nhập hướng dẫn custom)
//      - Buttons: Tạo Content, Copy VI/EN/ZH
//      - Result area (Hiển thị kết quả từ AI)
//
// 4. Attach UI vào #context-auto element
// ========================================================
async function ensureServiceContentUI() {
  const existing = document.getElementById("service-content-ui");
  if (existing) return existing;

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "service-content-ui";
  wrapper.style.cssText = getFeatureCardStyle(theme);

  const title = document.createElement("div");
  title.textContent = "✨ Tạo Content Dịch Vụ (Service Categories)";
  title.style.cssText = getFeatureTitleStyle(theme);

  // Note: Sử dụng Global Settings Panel
  const note = document.createElement("div");
  note.style.cssText = `margin-bottom:12px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:12px;color:${theme.info};`;
  note.innerHTML = "💡 <strong>Tip:</strong> Chọn ở <strong>Cài Đặt Chung</strong> phía trên.";
  
  // Button: Sync Categories
  const syncBtn = document.createElement("button");
  syncBtn.textContent = "🔄 Sync Categories";
  syncBtn.title = "Cập nhật tất cả lĩnh vực/dự án lên database";
  syncBtn.style.cssText = `padding:6px 12px;background:#52c41a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "🗑️ Xóa theo slug";
  deleteBtn.title = "Xóa bản ghi theo slug đang chọn";
  deleteBtn.style.cssText = `padding:6px 12px;background:#ff4d4f;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;

  const updateDetailDomainBtn = document.createElement("button");
  updateDetailDomainBtn.textContent = "🔁 Cập nhật domain bài chi tiết";
  updateDetailDomainBtn.title = "Cập nhật domain cho web_service_detail theo service_type";
  updateDetailDomainBtn.style.cssText = `padding:6px 12px;background:#1677ff;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;

  const deleteInput = document.createElement("input");
  deleteInput.type = "text";
  deleteInput.placeholder = "Nhập slug để xóa (không cần domain)";
  deleteInput.style.cssText = `min-width:240px;padding:6px 8px;border:1px solid ${theme.border};border-radius:4px;font-size:12px;color:${theme.text};background:${theme.bg};`;
  
  syncBtn.onmouseover = () => {
    syncBtn.style.background = '#45a017';
  };
  
  syncBtn.onmouseout = () => {
    syncBtn.style.background = '#52c41a';
  };

  deleteBtn.onmouseover = () => {
    deleteBtn.style.background = '#d9363e';
  };

  deleteBtn.onmouseout = () => {
    deleteBtn.style.background = '#ff4d4f';
  };

  updateDetailDomainBtn.onmouseover = () => {
    updateDetailDomainBtn.style.background = '#0958d9';
  };

  updateDetailDomainBtn.onmouseout = () => {
    updateDetailDomainBtn.style.background = '#1677ff';
  };
  
  syncBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    if (!globalSettings.domainKey) {
      alert("⚠️ Vui lòng chọn domain từ Cài Đặt Chung");
      return;
    }
    
    syncBtn.disabled = true;
    syncBtn.textContent = "⏳ Đang sync...";
    
    try {
      await syncCategoriesToDatabase(globalSettings.domainKey);
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = "🔄 Sync Categories";
    }
  };

  deleteBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    if (!globalSettings.domainKey) {
      alert("⚠️ Vui lòng chọn domain từ Cài Đặt Chung");
      return;
    }

    const manualSlug = deleteInput.value.trim();
    const categorySlug = manualSlug || (globalSettings.isLmkt ? globalSettings.project : globalSettings.industry);
    if (!categorySlug) {
      alert("⚠️ Vui lòng nhập slug để xóa");
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa slug "${categorySlug}"?`)) {
      return;
    }

    deleteBtn.disabled = true;
    deleteBtn.textContent = "⏳ Đang xóa...";

    try {
      await deleteCategoryBySlug(globalSettings.domainKey, categorySlug);
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = "🗑️ Xóa theo slug";
    }
  };

  updateDetailDomainBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    if (!globalSettings.domainKey) {
      alert("⚠️ Vui lòng chọn domain từ Cài Đặt Chung");
      return;
    }

    const serviceType = globalSettings.isLmkt ? globalSettings.project : globalSettings.industry;
    if (!serviceType) {
      alert("⚠️ Vui lòng chọn lĩnh vực/dự án để cập nhật");
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn cập nhật domain cho service_type "${serviceType}"?`)) {
      return;
    }

    updateDetailDomainBtn.disabled = true;
    updateDetailDomainBtn.textContent = "⏳ Đang cập nhật...";

    try {
      await updateDetailDomainByServiceType(globalSettings.domainKey, serviceType);
    } finally {
      updateDetailDomainBtn.disabled = false;
      updateDetailDomainBtn.textContent = "🔁 Cập nhật domain bài chi tiết";
    }
  };
  
  // Create row for sync button
  const syncRow = document.createElement("div");
  syncRow.style.cssText = "margin-bottom:12px;display:flex;gap:8px;align-items:center";
  syncRow.appendChild(syncBtn);
  syncRow.appendChild(deleteInput);
  syncRow.appendChild(deleteBtn);
  syncRow.appendChild(updateDetailDomainBtn);

  // Note: Lĩnh vực được dùng từ Global Settings (chỉ có 1 chỗ cho tất cả)
  // Không tạo category selector riêng - dùng giá trị từ global-industry-select
  const infoRow = document.createElement("div");
  infoRow.id = "service-info-row";
  infoRow.style.cssText = `margin-bottom:12px;padding:8px 12px;background:${theme.infoBg};border-radius:6px;border-left:3px solid ${theme.info};color:${theme.text}`;
  
  const infoLabel = document.createElement("small");
  infoLabel.style.cssText = `color:${theme.textSecondary};font-weight:500;display:block;margin-bottom:4px`;
  infoLabel.textContent = "Thông tin hiện tại:";
  
  const infoContent = document.createElement("div");
  infoContent.id = "service-info-content";
  infoContent.style.cssText = `color:${theme.text};font-size:13px;line-height:1.5`;
  infoContent.textContent = "(Dùng Lĩnh Vực từ Cài Đặt Chung)";
  
  infoRow.appendChild(infoLabel);
  infoRow.appendChild(infoContent);

  // Textarea for user prompt
  const promptLabel = document.createElement("label");
  promptLabel.style.cssText = `font-weight:500;display:block;margin-bottom:6px;color:${theme.text}`;
  promptLabel.textContent = "Hướng dẫn nội dung (tùy chỉnh AI):";
  
  const textarea = document.createElement("textarea");
  textarea.id = "service-prompt-input";
  textarea.style.cssText = `width:100%;min-height:120px;font-family:monospace;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};padding:8px;border-radius:6px;margin-bottom:12px;resize:vertical`;
  textarea.placeholder = "Ví dụ: Viết về tính năng chính, lợi ích cụ thể, và đối tượng sử dụng...";

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

  const createBtn = createButton("🚀 Tạo Content", "#52c41a");

  // Result area
  const resultArea = document.createElement("div");
  resultArea.id = "service-result-area";
  resultArea.style.cssText = `margin-top:16px;padding:12px;background:${theme.successBg};border:1px solid ${theme.successBorder};border-radius:6px;display:none;max-height:400px;overflow-y:auto`;
  
  const resultLabel = document.createElement("strong");
  resultLabel.style.cssText = `display:block;margin-bottom:8px;color:${theme.successText}`;
  resultLabel.textContent = "✅ Kết quả:";
  
  const resultContent = document.createElement("pre");
  resultContent.id = "service-result-content";
  resultContent.style.cssText = `margin:0;font-size:11px;background:${theme.bg};padding:8px;border-radius:4px;color:${theme.text};overflow-x:auto;white-space:pre-wrap;word-wrap:break-word`;
  
  resultArea.appendChild(resultLabel);
  resultArea.appendChild(resultContent);

  function getSelectLabel(selectId, fallback = '') {
    const select = document.getElementById(selectId);
    const option = select?.options?.[select.selectedIndex];
    return option?.textContent || fallback;
  }

  // Helper: Update info display based on global settings
  function updateInfoDisplay() {
    const globalSettings = getGlobalSettings();
    const domainLabel = DOMAIN_OPTIONS[globalSettings.domainKey]?.label || 'Chưa biết';
    const industryLabel = INDUSTRY_TYPES[globalSettings.industry]?.name
      || getSelectLabel("global-industry-select", 'Chưa chọn');
    const projectLabel = LMKT_PROJECT_DEFS.find(p => p.service_code === globalSettings.project)?.name
      || getSelectLabel("global-project-select", 'Chưa chọn');
    
    if (globalSettings.isLmkt) {
      note.innerHTML = "💡 <strong>LMKT:</strong> Category chính là <strong>Dự án</strong>. Lĩnh vực bị khóa ở <strong>Bất động sản</strong>.";
      infoContent.innerHTML = `<strong>🏢 Domain:</strong> ${domainLabel} | <strong>🏗️ Category (Dự án):</strong> ${projectLabel} | <strong>🏢 Lĩnh vực:</strong> ${industryLabel} (cố định)`;
    } else {
      note.innerHTML = "💡 <strong>Phanmemmottrieu:</strong> Category chính là <strong>Lĩnh vực</strong>. Chọn ở <strong>Cài Đặt Chung</strong>.";
      infoContent.innerHTML = `<strong>🏢 Domain:</strong> ${domainLabel} | <strong>🏢 Category (Lĩnh vực):</strong> ${industryLabel}`;
    }
    
    textarea.value = '';
    resultArea.style.display = 'none';
  }
  
  // Update info lần đầu
  setTimeout(() => updateInfoDisplay(), 100);
  
  // Listen to global settings changes
  const globalDomainSelect = document.getElementById("global-domain-select");
  const globalIndustrySelect = document.getElementById("global-industry-select");
  const globalProjectSelect = document.getElementById("global-project-select");
  
  if (globalDomainSelect) globalDomainSelect.addEventListener('change', updateInfoDisplay);
  if (globalIndustrySelect) globalIndustrySelect.addEventListener('change', updateInfoDisplay);
  if (globalProjectSelect) globalProjectSelect.addEventListener('change', updateInfoDisplay);

  document.addEventListener('change', (event) => {
    const target = event?.target;
    const targetId = target?.id;
    if (
      targetId === 'global-domain-select'
      || targetId === 'global-industry-select'
      || targetId === 'global-project-select'
    ) {
      updateInfoDisplay();
    }
  });

  // Event: Create content
  createBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    const userPrompt = textarea.value.trim();
    
    // ===== VALIDATION =====
    if (!globalSettings.domainKey || !globalSettings.industry || !userPrompt) {
      canhbao("❌ Vui lòng: Chọn Domain (Cài Đặt Chung) → Lĩnh Vực → Nhập Hướng Dẫn");
      return;
    }
    if (globalSettings.isLmkt && !globalSettings.project) {
      canhbao("❌ Vui lòng chọn Dự án (LMKT) trong Cài Đặt Chung");
      return;
    }
    
    try {
      createBtn.disabled = true;
      createBtn.textContent = "⏳ Đang gọi AI (30-120s)...";
      resultArea.style.display = 'none';
      
      const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
      const industryConfig = INDUSTRY_TYPES[globalSettings.industry];
      const industryName = industryConfig?.name
        || getSelectLabel("global-industry-select", globalSettings.industry || 'Bất động sản');
      const projectConfig = globalSettings.isLmkt 
        ? LMKT_PROJECT_DEFS.find(p => p.service_code === globalSettings.project)
        : null;

      console.log(`[Service Content] Domain: ${globalSettings.domainKey}, Industry: ${globalSettings.industry}${globalSettings.isLmkt ? `, Project: ${globalSettings.project}` : ''}`);
      const selectedCategory = globalSettings.isLmkt
        ? (projectConfig || {
            slug: globalSettings.project,
            service_code: globalSettings.project,
            name: getSelectLabel("global-project-select", globalSettings.project)
          })
        : (getCategoriesForDomain(globalSettings.domainKey)
            .find(cat => cat.slug === globalSettings.industry)
          || {
            slug: globalSettings.industry,
            service_code: globalSettings.industry,
            name: industryName
          });

      if (!selectedCategory?.slug || !selectedCategory?.name) {
        throw new Error("Không tìm thấy danh mục đang chọn để tạo prompt");
      }

      const categoryData = {
        ...selectedCategory,
        slug: selectedCategory.slug || globalSettings.industry,
        service_code: selectedCategory.service_code || selectedCategory.slug || globalSettings.industry,
        name: selectedCategory.name || industryName,
        name_en: selectedCategory.name_en || industryName,
        name_zh: selectedCategory.name_zh || industryName,
        category: selectedCategory.category || selectedCategory.name || industryName,
        category_en: selectedCategory.category_en || selectedCategory.name_en || industryName,
        category_zh: selectedCategory.category_zh || selectedCategory.name_zh || industryName
      };

      const aiPrompt = buildCategoryPrompt(categoryData, userPrompt, globalSettings.domainKey);
      
      // ===== CALL AI =====
      const startTime = Date.now();
      
      if (!window.csmAI?.generateSeoContentWithPrompt) {
        throw new Error("🤖 Không tìm thấy AI Helper - Chưa kích hoạt csmAI");
      }
      
      console.log(`[Service Content] Bắt đầu gọi AI...`);
      const aiResponse = await window.csmAI.generateSeoContentWithPrompt(aiPrompt);
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`[Service Content] ✅ AI trả về sau ${duration}s`);
      
      // ===== PARSE RESPONSE =====
      const contentData = parseAIResponse(aiResponse, { encodeContent: false });
      
      if (!contentData.content) {
        throw new Error("AI trả về content rỗng");
      }

      console.log(`[Service Content] ✅ Content parse thành công - ${contentData.content.length} ký tự`);
      
      // ===== SAVE TO DATABASE =====
      const ctx = resolveContext();
      const domainConfigForSave = DOMAIN_OPTIONS[globalSettings.domainKey];
      ctx.app_id = domainConfigForSave?.app_id || ctx.app_id;
      ctx.domain = domainConfigForSave?.value || ctx.domain;

      const categorySlug = globalSettings.isLmkt ? globalSettings.project : globalSettings.industry;
      const categoryName = globalSettings.isLmkt
        ? projectConfig?.name
        : industryName;

      if (!categorySlug || !categoryName) {
        throw new Error("Thiếu thông tin lĩnh vực/dự án đang chọn");
      }

      const saveResult = await upsertServiceCategoryContent(ctx, categorySlug, {
        ...contentData,
        name: contentData.name || categoryName
      });

      const displayResult = {
        ...(saveResult?.objUpdate || contentData),
        metadata: {
          domain: globalSettings.domainKey,
          industry: globalSettings.industry,
          project: globalSettings.isLmkt ? globalSettings.project : null,
          duration: `${duration}s`,
          timestamp: new Date().toLocaleString('vi-VN')
        }
      };

      resultContent.textContent = JSON.stringify(displayResult, null, 2);
      resultArea.style.display = 'block';
      thongbao("✅ Tạo content và lưu dữ liệu thành công!");
    } catch (e) {
      console.error("[Service Content] Error:", e);
      canhbao(`❌ Lỗi: ${e.message}`);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = "🚀 Tạo Content";
    }
  };

  btnRow.append(createBtn);

  wrapper.append(
    title,
    note,
    syncRow,
    infoRow,
    promptLabel,
    textarea,
    btnRow,
    resultArea
  );

  try {
    const host = await waitForContextAuto();
    const container = ensureUnifiedUIContainer();
    if (container) container.appendChild(wrapper);
    else host.prepend(wrapper);
    
    // Update info display from global settings
    updateInfoDisplay();
  } catch (e) {
    console.warn("Không tìm thấy #context-auto:", e);
  }
  
  return wrapper;
}

// ===== HELPER: Validate & Parse AI Response =====
function parseAIResponse(rawResponse, opts = {}) {
  if (!rawResponse) {
    throw new Error("AI không trả về dữ liệu");
  }
  
  let result = null;
  
  // Nếu response là object
  if (typeof rawResponse === 'object') {
    // Try multiple paths: data → result → object itself
    result = rawResponse.data || rawResponse.result || rawResponse;
  } 
  // Nếu response là string (JSON)
  else if (typeof rawResponse === 'string') {
    try {
      const parsed = JSON.parse(rawResponse);
      result = parsed.data || parsed.result || parsed;
    } catch (e) {
      console.error("Parse JSON error:", e, "Raw:", rawResponse);
      throw new Error("AI response không phải JSON hợp lệ");
    }
  }
  
  if (!result) {
    console.error("Result is null/undefined:", rawResponse);
    throw new Error("AI response format không chính xác");
  }
  
  // Log để debug
  console.log("[parseAIResponse] Parsed result:", result);
  
  // Validate: phải có ít nhất content (trong 1 ngôn ngữ)
  if (!result.content && !result.content_en && !result.content_zh) {
    console.error("Response không có content fields:", result);
    throw new Error("AI response không có content - Đảm bảo output JSON có 'content', 'content_en', 'content_zh'");
  }

  // NOTE: Không kiểm tra thủ công content_en/content_zh; chỉ dựa vào prompt
  
  const encodeContent = opts.encodeContent !== false;
  const toContent = (value) => {
    const raw = value || '';
    return encodeContent ? encodeHtml(raw, { encrypt: true, urlEncode: true }) : raw;
  };

  // NOTE: Không kiểm tra thủ công fields thiếu; chỉ dựa vào prompt
  // Trả về đầy đủ fields (có fallback cho fields thiếu)
  return {
    // IDENTIFIERS / FLAGS (optional from AI)
    id: result.id || '',
    service_code: result.service_code || '',
    slug: result.slug || '',
    group_slug: result.group_slug || '',
    is_service: typeof result.is_service === 'boolean' ? result.is_service : true,
    is_group_slug: typeof result.is_group_slug === 'boolean' ? result.is_group_slug : false,
    is_group_slug_default: typeof result.is_group_slug_default === 'boolean' ? result.is_group_slug_default : false,
    domain: result.domain || '',
    status: result.status || 'active',

    // CATEGORY FIELDS
    name: result.name || '',
    name_en: result.name_en || '',
    name_zh: result.name_zh || '',
    category: result.category || '',
    category_en: result.category_en || '',
    category_zh: result.category_zh || '',
    description: result.description || '',
    description_en: result.description_en || '',
    description_zh: result.description_zh || '',

    // MEDIA / STYLE
    image: result.image || '',
    icon: result.icon || '',
    attributes_icon: result.attributes_icon || '',
    attributes_color: result.attributes_color || '',
    attributes_priority: typeof result.attributes_priority === 'number' ? result.attributes_priority : 0,

    // NHÓM 1: NỘI DUNG CHÍNH (3 ngôn ngữ) - ENCODE RIÊNG TỪNG TRƯỜNG (không dùng fallback trong encoding)
    // Nếu thiếu, dùng fallback TRƯỚC khi encode, sau đó encode từng trường
    content: toContent(result.content),
    content_en: toContent(result.content_en),
    content_zh: toContent(result.content_zh),
    
    // NHÓM 2: TIÊU ĐỀ (3 ngôn ngữ)
    attributes_title: result.attributes_title || '',
    attributes_title_en: result.attributes_title_en || '',
    attributes_title_zh: result.attributes_title_zh || '',
    
    // NHÓM 3: MÔ TẢ (3 ngôn ngữ)
    attributes_description: result.attributes_description || '',
    attributes_description_en: result.attributes_description_en || '',
    attributes_description_zh: result.attributes_description_zh || '',
    
    // NHÓM 4: TỪ KHÓA (3 ngôn ngữ)
    attributes_keywords: result.attributes_keywords || '',
    attributes_keywords_en: result.attributes_keywords_en || '',
    attributes_keywords_zh: result.attributes_keywords_zh || '',

    // TIMESTAMP (optional)
    updated_at: result.updated_at || ''
  };
}

function extractJsonString(value) {
  if (typeof value !== 'string') return null;
  let jsonStr = value.trim();

  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  return jsonStr;
}

function parseCreativeParamsResponse(rawResponse) {
  if (!rawResponse) return null;

  let normalized = rawResponse;
  if (typeof normalized === 'object') {
    if (normalized.success === false) return null;
    normalized = normalized.result || normalized.data || normalized;
  }

  if (typeof normalized === 'string') {
    const jsonStr = extractJsonString(normalized);
    if (!jsonStr) return null;
    try {
      normalized = JSON.parse(jsonStr);
    } catch (e) {
      console.warn('Không thể parse creative params JSON:', e);
      return null;
    }
  }

  return normalized && typeof normalized === 'object' ? normalized : null;
}

function buildCreativeParamsPrompt(kind, context = {}) {
  const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const industry = context.industry || '';
  const topic = context.topic || context.productInfo || context.categoryName || '';
  const domainKey = context.domainKey || '';

  if (kind === 'anti_ai') {
    const personaKeys = Object.keys(BUYER_PERSONAS_V2 || {});
    const patternKeys = Object.keys(CONTENT_PATTERNS_V2 || {});
    const sellingKeys = Object.keys(SELLING_INTENT_RULES_V2 || {});

    return `
[CREATIVE_PARAMS_REQUEST]
SEED: ${seed}
KIND: anti_ai
INDUSTRY: ${industry}
TOPIC: ${topic}
DOMAIN: ${domainKey}

Chọn thông số sáng tạo để tạo nội dung khác biệt, KHÔNG viết content.
Chỉ trả về JSON hợp lệ, 1 dòng, không markdown.

Allowed personaKey: ${personaKeys.join(', ')}
Allowed contentPattern: ${patternKeys.join(', ')}
Allowed sellingIntent: ${sellingKeys.join(', ')}

Output JSON:
{
  "personaKey": "<one of personaKey>",
  "contentPattern": "<one of contentPattern>",
  "sellingIntent": "<one of sellingIntent>",
  "hook": "Short opening hook (3-8 words)",
  "angle": "Short creative angle",
  "tone": "Short tone description"
}
    `.trim();
  }

  if (kind === 'facebook_post') {
    return `
[CREATIVE_PARAMS_REQUEST]
SEED: ${seed}
KIND: facebook_post
INDUSTRY: ${industry}
TOPIC: ${topic}

Chọn thông số sáng tạo để viết post Facebook khác biệt, KHÔNG viết content.
Chỉ trả về JSON hợp lệ, 1 dòng, không markdown.

Output JSON:
{
  "angle": "Creative angle for opening",
  "persona": {
    "label": "Persona label",
    "tone": "Tone description",
    "focus": "Focus keywords"
  },
  "style": "Optional style override",
  "structure": "Optional structure override",
  "avoid": ["Optional avoid phrase 1", "Optional avoid phrase 2"]
}
    `.trim();
  }

  return `
[CREATIVE_PARAMS_REQUEST]
SEED: ${seed}
KIND: category_landing
INDUSTRY: ${industry}
TOPIC: ${topic}

Chọn thông số sáng tạo để viết landing page khác biệt, KHÔNG viết content.
Chỉ trả về JSON hợp lệ, 1 dòng, không markdown.

Output JSON:
{
  "angle": "Opening angle",
  "persona": {
    "label": "Persona label",
    "tone": "Tone description",
    "focus": "Focus keywords"
  },
  "role": "Writer role",
  "style": "Writing style",
  "avoid": "What to avoid",
  "focus": "What to emphasize"
}
  `.trim();
}

async function requestCreativeParams(kind, context = {}, helperAi = null) {
  try {
    const prompt = buildCreativeParamsPrompt(kind, context);
    const generateFn = helperAi?.generateSeoContentWithPrompt || window.csmAI?.generateSeoContentWithPrompt;
    if (!generateFn) return null;
    const response = await generateFn(prompt);
    return parseCreativeParamsResponse(response);
  } catch (error) {
    console.warn('Không thể lấy creative params:', error);
    return null;
  }
}

function buildAntiAICreativeOverrides(creative = {}) {
  const overrides = {};
  if (!creative || typeof creative !== 'object') return overrides;

  if (creative.personaKey) overrides.personaKey = creative.personaKey;
  if (creative.contentPattern) overrides.contentPattern = creative.contentPattern;
  if (creative.sellingIntent) overrides.sellingIntent = creative.sellingIntent;
  if (creative.hook) overrides.hook = creative.hook;
  if (creative.angle) overrides.angle = creative.angle;
  if (creative.tone) overrides.tone = creative.tone;

  return overrides;
}

/**
 * ========================================================
 * HÀM: syncCategoriesToDatabase(domainKey)
 * MỤC ĐÍCH: Tự động sync danh sách lĩnh vực/dự án lên database theo app_id
 * Sử dụng cùng cơ chế update như cập nhật tin chi tiết
 * 
 * Cách hoạt động:
 *   1. Lấy danh sách categories từ DOMAIN_OPTIONS/INDUSTRY_TYPES
 *   2. Với mỗi category:
 *      a. Check xem slug đó tồn tại chưa
 *      b. Nếu tồn tại → Update (updateTableData)
 *      c. Nếu không → Insert (updateTableData với insert mode)
 *   3. Thông báo kết quả cho user
 * 
 * Input: domainKey (lmkt hoặc wuweb)
 * Output: Promise (kết quả sync)
 * ========================================================
 */
async function syncCategoriesToDatabase(domainKey) {
  try {
    // Lấy danh sách categories
    const categories = getCategoriesForDomain(domainKey);
    const appId = DOMAIN_OPTIONS[domainKey]?.app_id;
    const domainValue = DOMAIN_OPTIONS[domainKey]?.value;
    
    if (!appId || !categories || categories.length === 0) {
      throw new Error(`Không tìm thấy categories cho domain: ${domainKey}`);
    }
    
    console.log(`[syncCategoriesToDatabase] Bắt đầu sync ${categories.length} categories...`);
    
    if (!window.csmApi?.updateTableData) {
      throw new Error("Không tìm thấy window.csmApi.updateTableData - Chưa kích hoạt hệ thống");
    }
    
    let inserted = 0, updated = 0;
    
    // Sync từng category
    for (const cat of categories) {
      try {
        const config = cat.config || (domainKey === 'lmkt' ? INDUSTRY_TYPES["bat-dong-san"] : INDUSTRY_TYPES[cat.slug]) || {};
        
        // Chuẩn bị object cập nhật - giống như tin chi tiết
        const groupFlags = normalizeGroupFlags(cat.slug, cat.is_group_slug, cat.is_group_slug_default);
        const objUpdate = {
          id: cat.id || cat.service_code || cat.slug,
          service_code: cat.service_code || cat.slug,
          slug: cat.slug,
          group_slug: normalizeGroupSlug(
            cat.slug,
            cat.group_slug || (domainKey === 'lmkt' ? 'du-an' : 'dich-vu'),
            groupFlags.is_group_slug
          ),
          is_service: typeof groupFlags.is_service === 'boolean'
            ? groupFlags.is_service
            : (typeof cat.is_service === 'boolean' ? cat.is_service : true),
          is_group_slug: groupFlags.is_group_slug,
          is_group_slug_default: groupFlags.is_group_slug_default,
          domain: domainValue,
          app_id: appId,
          name: cat.name || '',
          name_en: cat.name_en || '',
          name_zh: cat.name_zh || '',
          category: cat.category || cat.name || '',
          category_en: cat.category_en || cat.name_en || '',
          category_zh: cat.category_zh || cat.name_zh || '',
          description: cat.description || '',
          description_en: cat.description_en || '',
          description_zh: cat.description_zh || '',
          image: cat.image || '',
          icon: cat.icon || '',
          attributes_icon: cat.attributes_icon || '',
          attributes_color: cat.attributes_color || '',
          attributes_priority: typeof cat.attributes_priority === 'number' ? cat.attributes_priority : 0,
          attributes_title: cat.attributes_title || '',
          attributes_title_en: cat.attributes_title_en || '',
          attributes_title_zh: cat.attributes_title_zh || '',
          attributes_description: cat.attributes_description || '',
          attributes_description_en: cat.attributes_description_en || '',
          attributes_description_zh: cat.attributes_description_zh || '',
          attributes_keywords: cat.attributes_keywords || '',
          attributes_keywords_en: cat.attributes_keywords_en || '',
          attributes_keywords_zh: cat.attributes_keywords_zh || '',
          status: 'active',
          config: JSON.stringify(config || {}),
          updated_at: new Date().toISOString()
        };
        
        // Update/Insert sử dụng updateTableData
        const updatePayload = {
          app_id: appId,
          obj_name: "web_services",
          command: "update",
          obj_update: objUpdate,
          pk_fields: ["slug", "domain", "status"]
        };
        
        await window.csmApi.updateTableData(updatePayload);
        
        // Đếm (không biết exact là insert hay update, nên cứ tăng updated)
        updated++;
        console.log(`✓ Synced: ${cat.slug}`);
        
      } catch (e) {
        console.error(`❌ Lỗi sync category ${cat.slug}:`, e);
        inserted++;  // Có thể là insert failed
      }
    }
    
    console.log(`✅ Sync hoàn tất: Đã cập nhật ${updated} categories`);
    
    // Thông báo
    const message = `✅ Cập nhật thành công ${categories.length} lĩnh vực/dự án`;
    if (window.showNotification) {
      window.showNotification({
        type: 'success',
        message: message,
        duration: 3
      });
    } else {
      alert(message);
    }
    
    return {
      inserted,
      updated,
      total: categories.length
    };
  } catch (error) {
    console.error('❌ Lỗi syncCategoriesToDatabase:', error);
    if (window.showNotification) {
      window.showNotification({
        type: 'error',
        message: `❌ Lỗi: ${error.message}`,
        duration: 3
      });
    } else {
      alert(`❌ Lỗi: ${error.message}`);
    }
    throw error;
  }
}

/**
 * ========================================================
 * HÀM: deleteCategoryBySlug(domainKey, slug)
 * MỤC ĐÍCH: Xóa 1 dòng trong web_services theo slug (không cần domain/status)
 * ========================================================
 */
async function deleteCategoryBySlug(domainKey, slug) {
  try {
    const appId = DOMAIN_OPTIONS[domainKey]?.app_id;

    if (!appId) {
      throw new Error("Không tìm thấy app_id");
    }

    if (!window.csmApi?.updateTableData) {
      throw new Error("Không tìm thấy window.csmApi.updateTableData - Chưa kích hoạt hệ thống");
    }

    const deletePayload = {
      app_id: appId,
      obj_name: "web_services",
      command: "delete",
      obj_update: {
        slug: slug
      },
      pk_fields: ["slug"]
    };

    await window.csmApi.updateTableData(deletePayload);

    const message = `✅ Đã xóa slug "${slug}"`;
    if (window.showNotification) {
      window.showNotification({
        type: 'success',
        message: message,
        duration: 3
      });
    } else {
      alert(message);
    }
  } catch (error) {
    console.error('❌ Lỗi deleteCategoryBySlug:', error);
    if (window.showNotification) {
      window.showNotification({
        type: 'error',
        message: `❌ Lỗi: ${error.message}`,
        duration: 3
      });
    } else {
      alert(`❌ Lỗi: ${error.message}`);
    }
    throw error;
  }
}

/**
 * ========================================================
 * HÀM: updateDetailDomainByServiceType(domainKey, serviceType)
 * MỤC ĐÍCH: Cập nhật domain cho web_service_detail theo service_type
 * ========================================================
 */
async function updateDetailDomainByServiceType(domainKey, serviceType) {
  try {
    const domainValue = DOMAIN_OPTIONS[domainKey]?.value;
    const appId = DOMAIN_OPTIONS[domainKey]?.app_id;

    if (!domainValue || !appId) {
      throw new Error("Không tìm thấy domain hoặc app_id");
    }

    if (!window.csmApi?.getTableData || !window.csmApi?.updateTableData) {
      throw new Error("Không tìm thấy window.csmApi.getTableData/updateTableData");
    }

    let lastkey = undefined;
    let updated = 0;
    const take = 200;

    while (true) {
      const rows = await window.csmApi.getTableData({
        app_id: appId,
        obj_name: "web_service_detail",
        where: {
          field: "service_type",
          type: "eq",
          value: serviceType
        },
        take,
        lastkey
      }).catch(() => ({ rows: [] }));

      const data = rows.rows || rows.data || [];
      if (!Array.isArray(data) || data.length === 0) break;

      for (const row of data) {
        const objUpdate = {
          ...row,
          domain: domainValue,
          updated_at: new Date().toISOString()
        };

        await window.csmApi.updateTableData({
          app_id: appId,
          obj_name: "web_service_detail",
          command: "update",
          obj_update: objUpdate,
          pk_fields: ["slug", "domain", "status"],
          where: {
            slug: row.slug,
            domain: row.domain,
            status: row.status || "active"
          }
        });

        updated += 1;
      }

      lastkey = rows.lastkey;
      if (!lastkey || data.length < take) break;
    }

    const message = `✅ Đã cập nhật domain cho ${updated} tin chi tiết`;
    if (window.showNotification) {
      window.showNotification({ type: 'success', message, duration: 3 });
    } else {
      alert(message);
    }
  } catch (error) {
    console.error('❌ Lỗi updateDetailDomainByServiceType:', error);
    if (window.showNotification) {
      window.showNotification({
        type: 'error',
        message: `❌ Lỗi: ${error.message}`,
        duration: 3
      });
    } else {
      alert(`❌ Lỗi: ${error.message}`);
    }
    throw error;
  }
}

/**
 * ========================================================
 * HÀM: updateServiceCategoryUI()
 * MỤC ĐÍCH: Cập nhật giao diện category select khi domain thay đổi
 * & Thêm button "Sync Categories"
 * ========================================================
 */
function updateServiceCategoryUI() {
  const domainSelect = document.getElementById('service-domain-select');
  const categorySelect = document.getElementById('service-category-select');
  const descContent = document.getElementById('service-desc-content');
  
  if (!domainSelect || !categorySelect) return;
  
  const selectedDomain = domainSelect.value;
  const categories = getCategoriesForDomain(selectedDomain);
  
  // Clear options cũ
  categorySelect.innerHTML = '<option value="">-- Chọn lĩnh vực/dự án --</option>';
  
  // Thêm options mới
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.slug;
    option.textContent = cat.name;
    option.dataset.description = cat.description;
    categorySelect.appendChild(option);
  });
  
  // Reset description
  if (descContent) {
    descContent.textContent = '(Chọn lĩnh vực/dự án để xem mô tả)';
  }
}

/**
 * ========================================================
 * HÀM: updateDescriptionPreview()
 * MỤC ĐÍCH: Hiển thị description khi user chọn category
 * ========================================================
 */
function updateDescriptionPreview() {
  const categorySelect = document.getElementById('service-category-select');
  const descContent = document.getElementById('service-desc-content');
  
  if (!categorySelect || !descContent) return;
  
  const selectedOption = categorySelect.options[categorySelect.selectedIndex];
  const description = selectedOption?.dataset?.description || '(Không có mô tả)';
  
  descContent.textContent = description;
}

// Init UI
ensureUI();
ensureServiceContentUI();

// ============================================================
// FACEBOOK AUTO POST - Đăng bài tự động lên Facebook Fanpage
// ============================================================

/**
 * TÍNH NĂNG MỚI: Đăng bài tự động lên Facebook Fanpage với AI
 * 
 * Facebook App Credentials:
 * - App ID: 1191294726073360
 * - App Secret: 78a9c32514f789e4f0219aba33d44c08
 * - Display Name: CSM-AUTOPOST
 * 
 * Quy trình:
 * 1. User kết nối Facebook và chọn Fanpage
 * 2. Chọn lĩnh vực và nhập thông tin sản phẩm
 * 3. AI tạo content thu hút với hashtags trending
 * 4. Đăng bài lên Facebook qua Graph API
 */

// ===== FACEBOOK CONFIG =====
const FACEBOOK_CONFIG = {
  APP_ID: '1191294726073360',
  APP_SECRET: '78a9c32514f789e4f0219aba33d44c08',
  DISPLAY_NAME: 'CSM',
  GRAPH_API_VERSION: 'v18.0',
  GRAPH_API_BASE: 'https://graph.facebook.com/v18.0'
};

// ===== NW.js/Node.js SUPPORT =====
function isNWJSRuntime() {
  return typeof window !== 'undefined' && !!window.nw;
}

function getNodeFetch() {
  try {
    const nodeRequire = (typeof window !== 'undefined' && window.require)
      ? window.require
      : (typeof require !== 'undefined' ? require : null);

    if (!nodeRequire) return null;

    try {
      const undici = nodeRequire('node:undici');
      if (undici && typeof undici.fetch === 'function') return undici.fetch;
    } catch (e) {
      // ignore
    }

    return null;
  } catch (error) {
    console.warn('Không thể lấy fetch từ Node.js:', error);
    return null;
  }
}

function facebookFetch(url, options = {}) {
  let fetchFn = null;
  if (isNWJSRuntime()) {
    fetchFn = getNodeFetch();
    if (!fetchFn && typeof fetch === 'function') {
      console.warn('⚠️ Không lấy được Node fetch, fallback sang fetch trình duyệt (có thể bị CORS).');
      fetchFn = fetch;
    }
  } else {
    fetchFn = typeof fetch === 'function' ? fetch : null;
  }
  if (!fetchFn) {
    throw new Error('fetch không khả dụng');
  }
  return fetchFn(url, options);
}

// Flag để tracking FB SDK loaded
let fbSDKLoaded = false;

// ===== INDUSTRY HASHTAG DATABASE =====
const FACEBOOK_INDUSTRY_HASHTAGS = {
  "dich-vu": {
    trending: [
      "#DichVu", "#DichVuChuyenNghiep", "#GiaiPhap", "#TuVan",
      "#ToiUuHoa", "#NangCaoHieuQua", "#GiaiPhapToanDien", "#DoanhNghiep"
    ],
    type: [
      "#DichVuMarketing", "#DichVuThietKe", "#DichVuTuVan", "#DichVuKyThuat"
    ],
    audience: [
      "#ChuDoanhNghiep", "#Startup", "#ChuyenNghiep"
    ]
  },
  
  "phan-mem": {
    trending: [
      "#PhanMem", "#Software", "#TuDongHoa", "#QuanLy",
      "#CongNghe", "#GiaiPhapPhanMem", "#UngDung", "#Website"
    ],
    type: [
      "#PhanMemQuanLy", "#PhanMemKeToan", "#PhanMemBanHang", "#PhanMemCRM"
    ],
    benefit: [
      "#TangHieuQua", "#ToiUuChiPhi", "#TietKiemThoiGian"
    ]
  },
  
  "booking-online": {
    trending: [
      "#DatLichOnline", "#Booking", "#DatLich", "#OnlineBooking",
      "#TietKiemThoiGian", "#QuanLyLichHen", "#UyTin", "#ChatLuong"
    ],
    service: [
      "#DatLichKhamBenh", "#DatLichSpa", "#DatLichSalon", "#DatLichDichVu"
    ],
    benefit: [
      "#DeDang", "#TienLoi", "#MoiLucMoiNoi"
    ]
  },
  
  "cho-thue-xe": {
    trending: [
      "#ThueXe", "#ChoThueXe", "#XeChoThue", "#CarRental",
      "#XeSachSe", "#TaiXeChuyenNghiep", "#AnToan", "#ThoaiMai"
    ],
    location: [
      "#TPHCM", "#SaiGon", "#HoChiMinh"
    ],
    type: [
      "#Xe4Cho", "#Xe7Cho", "#XeDuLich", "#XeCongTac"
    ],
    benefit: [
      "#UyTin", "#NhietTinh", "#GiaHopLy"
    ]
  },
  
  "lam-dep-my-pham": {
    trending: [
      "#LamDep", "#MyPham", "#SkinCare", "#BeautyTips",
      "#ChamSocDa", "#ReviewMyPham", "#Spa", "#XuHuongLamDep"
    ],
    product: [
      "#SonMoi", "#KemDuong", "#SuaRuaMat", "#Serum", "#MatNa"
    ],
    concern: [
      "#DaKhoe", "#DaDep", "#ChamSocBanThan", "#ThuGian"
    ]
  },
  
  "bat-dong-san": {
    trending: [
      "#BatDongSan", "#NhaDat", "#MuaBanNhaDat", "#ChoThueNhaDat",
      "#DauTuBDS", "#ThanhKhoanCao", "#MinhBachPhapLy", "#ChuyenNghiep"
    ],
    location: [
      "#TPHCM", "#HaNoi", "#DaNang", "#BinhDuong", "#DongNai"
    ],
    type: [
      "#CanHo", "#ChungCu", "#NhaPho", "#BietThu", "#DatNen"
    ],
    action: [
      "#DauTu", "#SinhLoi", "#TiemNang", "#UyTin"
    ]
  }
};

// ===== AI PROMPT TEMPLATES FOR FACEBOOK (6 lĩnh vực) =====
const FACEBOOK_AI_TEMPLATES = {
  "dich-vu": {
    role: "Chuyên gia tư vấn dịch vụ doanh nghiệp",
    style: "Tập trung vào giải pháp toàn diện, case study, lợi ích cụ thể",
    structure: `
1. PROBLEM: Vấn đề doanh nghiệp đang gặp
2. SOLUTION: Giải pháp dịch vụ mang lại
3. BENEFITS: 3-4 lợi ích (tối ưu hóa, hiệu quả, tiết kiệm)
4. PROOF: Case study hoặc con số thực tế
5. CTA: Tư vấn miễn phí/liên hệ
6. HASHTAGS
`,
    avoid: [
      "Không dùng câu sáo rỗng",
      "Không hứa hẹn quá mức",
      "Tránh thuật ngữ phức tạp"
    ],
    focus: [
      "Giải pháp cụ thể cho từng ngành",
      "Tối ưu quy trình, nâng cao hiệu quả",
      "Case study thuyết phục"
    ]
  },
  
  "phan-mem": {
    role: "Chuyên gia công nghệ giải thích dễ hiểu",
    style: "So sánh trước-sau, demo tính năng, tiết kiệm chi phí",
    structure: `
1. PAIN POINT: Vấn đề khi làm thủ công
2. SOLUTION: Phần mềm tự động hóa
3. FEATURES: 3-5 tính năng chính (giải thích đơn giản)
4. ROI: Tiết kiệm thời gian & chi phí
5. CTA: Demo miễn phí/dùng thử
6. HASHTAGS
`,
    avoid: [
      "Không dùng thuật ngữ kỹ thuật khó hiểu",
      "Tránh liệt kê tính năng khô khan"
    ],
    focus: [
      "Tự động hóa quy trình",
      "Tăng hiệu quả, giảm chi phí",
      "Before-after rõ ràng"
    ]
  },
  
  "booking-online": {
    role: "Chuyên gia trải nghiệm khách hàng",
    style: "Tập trung tiện lợi, tiết kiệm thời gian, uy tín",
    structure: `
1. CONVENIENCE: Đặt lịch dễ dàng mọi lúc mọi nơi
2. TIME-SAVING: Tiết kiệm thời gian, không chờ đợi
3. QUALITY: Địa điểm uy tín, chất lượng
4. FEATURES: Quản lý lịch hẹn, nhắc nhở
5. CTA: Đặt lịch ngay
6. HASHTAGS
`,
    focus: [
      "Tiện lợi, dễ dàng",
      "Uy tín, chất lượng",
      "Tiết kiệm thời gian"
    ]
  },
  
  "cho-thue-xe": {
    role: "Chuyên gia dịch vụ vận chuyển",
    style: "Nhấn mạnh uy tín, an toàn, thoải mái, tài xế chuyên nghiệp",
    structure: `
1. NEED: Nhu cầu đi lại (du lịch, công tác, gia đình)
2. SERVICE: Xe sạch sẽ, tài xế chuyên nghiệp
3. SAFETY: An toàn, thoải mái cho hành trình
4. PRICING: Giá cả hợp lý, minh bạch
5. CTA: Đặt xe ngay/liên hệ
6. HASHTAGS
`,
    avoid: [
      "Không dùng 'rẻ nhất', 'tốt nhất'"
    ],
    focus: [
      "Uy tín, xe sạch sẽ",
      "Tài xế nhiệt tình, an toàn",
      "Giá cả hợp lý"
    ]
  },
  
  "lam-dep-my-pham": {
    role: "Beauty blogger/spa consultant",
    style: "Review chân thật, xu hướng làm đẹp, trải nghiệm spa",
    structure: `
1. TREND/CONCERN: Xu hướng hoặc vấn đề da
2. EXPERIENCE: Trải nghiệm sản phẩm/dịch vụ
3. DETAILS: Mô tả cụ thể (texture, smell, cảm giác)
4. RESULT: Kết quả sau sử dụng
5. RECOMMEND: Ai nên dùng
6. CTA: Tìm hiểu thêm/đặt lịch
7. HASHTAGS
`,
    avoid: [
      "Không dùng 'thần thánh', 'vi diệu'",
      "Không hứa kết quả phi thực tế"
    ],
    focus: [
      "Review chân thật",
      "Xu hướng làm đẹp",
      "Trải nghiệm spa, before-after"
    ]
  },
  
  "bat-dong-san": {
    role: "Chuyên gia bất động sản CSM Bridge",
    style: "Minh bạch pháp lý, tiềm năng thanh khoản, sinh lời vượt trội",
    structure: `
1. OPPORTUNITY: Cơ hội đầu tư/an cư
2. TRANSPARENCY: Minh bạch pháp lý, làm việc trực tiếp chủ nhà
3. LIQUIDITY: Tiềm năng thanh khoản cao
4. ROI: Lợi nhuận, sinh lời vượt trội
5. CTA: Xem chi tiết/tư vấn
6. HASHTAGS
`,
    avoid: [
      "Không dùng 'siêu phẩm', 'vàng mười'",
      "Tránh liệt kê khô khan"
    ],
    focus: [
      "Minh bạch pháp lý",
      "Tiềm năng thanh khoản",
      "Sinh lời vượt trội",
      "Làm việc trực tiếp chủ nhà"
    ]
  }
};

// ===== FACEBOOK STATE MANAGEMENT =====
let facebookState = {
  userAccessToken: null,
  pageAccessToken: null,
  selectedPageId: null,
  selectedPageName: null,
  selectedPageIds: [],
  pages: [],
  lastPostResult: null
};

const FACEBOOK_POST_COOLDOWN_MIN_MS = 5 * 60 * 1000;
const FACEBOOK_POST_COOLDOWN_MAX_MS = 5 * 60 * 1000;
const FACEBOOK_MAX_POSTS_PER_DAY = 0; // 0 = không giới hạn/ngày
const FACEBOOK_RECENT_POSTS_KEY = 'facebook_recent_posts';
const FACEBOOK_RECENT_POSTS_LIMIT = 50;
const FACEBOOK_DUPLICATE_DAYS = 7;
const FACEBOOK_AUTO_SETTINGS_KEY = 'facebook_auto_settings';
const FACEBOOK_AUTO_DEFAULTS = {
  minIntervalMin: 5,
  maxIntervalMin: 5,
  maxPostsPerDay: FACEBOOK_MAX_POSTS_PER_DAY
};

let facebookAutoRunning = false;
let facebookAutoAbort = false;

// ===== BUTTON STATE MANAGEMENT =====
function setFacebookButtonsState(isProcessing) {
  const btnPreview = document.getElementById('btn-fb-preview');
  const btnPost = document.getElementById('btn-fb-post');
  const btnAutoStart = document.getElementById('btn-fb-auto-start');
  const btnAutoStop = document.getElementById('btn-fb-auto-stop');
  
  if (isProcessing) {
    // Disable tất cả nút khi đang xử lý (trừ Stop)
    [btnPreview, btnPost, btnAutoStart].forEach(btn => {
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
    });
  } else {
    // Enable tất cả nút khi xong
    [btnPreview, btnPost, btnAutoStart].forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });
  }
  
  // Stop luôn enabled
  if (btnAutoStop) {
    btnAutoStop.disabled = false;
    btnAutoStop.style.opacity = '1';
    btnAutoStop.style.cursor = 'pointer';
  }
}

function getFacebookNextAllowedPostAt() {
  const raw = localStorage.getItem('facebook_next_post_at');
  const ts = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(ts) ? ts : 0;
}

function setFacebookNextAllowedPostAt() {
  const now = Date.now();
  const jitter = Math.floor(Math.random() * (FACEBOOK_POST_COOLDOWN_MAX_MS - FACEBOOK_POST_COOLDOWN_MIN_MS + 1)) + FACEBOOK_POST_COOLDOWN_MIN_MS;
  const next = now + jitter;
  localStorage.setItem('facebook_next_post_at', String(next));
  return next;
}

function formatDurationMs(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizePostForHash(text = "") {
  return text
    .toLowerCase()
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashString(str = "") {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function loadFacebookRecentPosts() {
  try {
    const raw = localStorage.getItem(FACEBOOK_RECENT_POSTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { posts: [], daily: {} };
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      daily: parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : {}
    };
  } catch (e) {
    console.warn('Không thể load facebook_recent_posts:', e);
    return { posts: [], daily: {} };
  }
}

function saveFacebookRecentPosts(state) {
  try {
    localStorage.setItem(FACEBOOK_RECENT_POSTS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Không thể save facebook_recent_posts:', e);
  }
}

function getFacebookHashtagsCount(text = "") {
  const matches = text.match(/#\w+/g);
  return matches ? matches.length : 0;
}

function validateFacebookPostContent(content = "", maxPostsPerDayOverride = null) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return { ok: false, message: 'Nội dung bài viết trống.' };
  if (trimmed.length < 50) return { ok: false, message: 'Nội dung quá ngắn, nên >= 50 ký tự.' };
  if (trimmed.length > 5000) return { ok: false, message: 'Nội dung quá dài, nên <= 5,000 ký tự.' };

  const hashtagCount = getFacebookHashtagsCount(trimmed);
  if (hashtagCount > 12) return { ok: false, message: 'Hashtag quá nhiều (tối đa 12).' };

  const state = loadFacebookRecentPosts();
  const todayKey = getTodayKey();
  const todayCount = Number(state.daily[todayKey] || 0);
  const maxPerDay = Number.isFinite(maxPostsPerDayOverride)
    ? Number(maxPostsPerDayOverride)
    : FACEBOOK_MAX_POSTS_PER_DAY;
  if (maxPerDay > 0 && todayCount >= maxPerDay) {
    return { ok: false, message: `Đã đạt giới hạn ${maxPerDay} bài/ngày. Vui lòng đăng tiếp vào ngày mai.` };
  }

  const normalized = normalizePostForHash(trimmed);
  const hash = hashString(normalized);
  const cutoff = Date.now() - (FACEBOOK_DUPLICATE_DAYS * 24 * 60 * 60 * 1000);
  const recent = state.posts.filter(p => p && p.ts && p.ts >= cutoff);
  const isDuplicate = recent.some(p => p.hash === hash);
  if (isDuplicate) {
    return { ok: false, message: `Nội dung trùng với bài trong ${FACEBOOK_DUPLICATE_DAYS} ngày gần đây. Vui lòng chỉnh sửa để khác biệt.` };
  }

  return { ok: true, message: '' };
}

function recordFacebookPost(content = "") {
  const state = loadFacebookRecentPosts();
  const todayKey = getTodayKey();
  const normalized = normalizePostForHash(content);
  const hash = hashString(normalized);

  state.posts.unshift({
    hash,
    ts: Date.now()
  });

  if (state.posts.length > FACEBOOK_RECENT_POSTS_LIMIT) {
    state.posts = state.posts.slice(0, FACEBOOK_RECENT_POSTS_LIMIT);
  }

  state.daily[todayKey] = Number(state.daily[todayKey] || 0) + 1;
  saveFacebookRecentPosts(state);
}

// Load/Save state from localStorage (với fallback từ database)
/**
 * ✅ Lưu fanpage token lên server (trong dataOptionUser config)
 * @param {string} configId - ID của config cần update
 * @param {string} fanpageId - ID fanpage
 * @param {string} fanpageName - Tên fanpage
 * @param {string} pageAccessToken - Token để post (page-specific)
 * @param {string} userAccessToken - User token (để có thể re-exchange sau 60 ngày)
 */

/**
 * ✅ Cập nhật token cho TẤT CẢ config có fanpage khi nhập token mới
 * @param {string} newPageAccessToken - Token page mới
 * @param {string} userAccessToken - User token mới
 * @param {string} fanpageId - Fanpage ID
 * @param {string} fanpageName - Fanpage name
 * @returns {Promise<boolean>} - True nếu lưu lên server thành công
 */
async function updateAllConfigsWithNewFanpageToken(newPageAccessToken, userAccessToken, fanpageId, fanpageName) {
  return new Promise((resolve, reject) => {
    try {
      console.log('🚀 [UpdateAllConfigs] BẮT ĐẦU cập nhật token...');
      console.log('   📌 fanpageId:', fanpageId);
      console.log('   📌 fanpageName:', fanpageName);
      console.log('   📌 Token preview:', newPageAccessToken.substring(0, 20) + '...');
      
      const allConfigs = loadDataOptionUser();
      console.log('📦 [UpdateAllConfigs] Đã load', allConfigs.length, 'configs');
      
      let updated = false;
      let updatedCount = 0;
      const updatedConfigIds = [];
      
      // Cập nhật tất cả config có fanpage
      for (const config of allConfigs) {
        // 🔍 DEBUG: Check điều kiện cho từng config
        const has_config_for_zalo = config.config_for_zalo;
        const has_zalo_fanpages = !!config.zalo_fanpages;
        const is_array = Array.isArray(config.zalo_fanpages);
        console.log(`   🔍 Config ${config.id}:`);
        console.log(`      - config_for_zalo: ${has_config_for_zalo}`);
        console.log(`      - zalo_fanpages exists: ${has_zalo_fanpages}`);
        console.log(`      - is array: ${is_array}`);
        console.log(`      - fanpage_token exists: ${!!config.fanpage_token}`);
        
        // ✅ FIX: Sửa điều kiện check - chỉ check config_for_zalo
        if (config.config_for_zalo) {
          // Nếu config này có fanpage, update token
          config.fanpage_id = fanpageId;
          config.fanpage_name = fanpageName;
          config.fanpage_token = newPageAccessToken;
          config.fanpage_token_user_token = userAccessToken;
          config.fanpage_token_timestamp = Date.now();
          config.fanpage_token_expires_at = Date.now() + (60 * 24 * 60 * 60 * 1000); // 60 ngày
          updated = true;
          updatedCount++;
          updatedConfigIds.push(config.id);
          console.log(`   ✏️ Cập nhật config: ${config.id} (domain: ${config.domain})`);
        }
      }
      
      console.log(`📊 [UpdateAllConfigs] Tổng ${updatedCount} config được cập nhật`);
      
      if (!updated) {
        console.warn('⚠️ [UpdateAllConfigs] Không có config nào để cập nhật');
        resolve(true); // Không có gì để update, coi như success
        return;
      }
      
      // ✅ LƯU LÊN SERVER - PHẢI CHỜ CALLBACK MỚI RESOLVE
      console.log(`💾 [UpdateAllConfigs] BƯỚC 1: Bắt đầu lưu ${updatedCount} config lên server...`);
      console.log(`   window.csmUserData available?`, !!window.csmUserData);
      console.log(`   window.csmUserData.set available?`, typeof window.csmUserData?.set);
      
      // ⏱️ TIMEOUT: Chờ 30 giây cho backend (có thể network slow, server busy)
      // Việc làm: Nếu callback không return trong 30 giây, force reject
      const timeoutId = setTimeout(() => {
        console.error('❌ [UpdateAllConfigs] TIMEOUT: Callback chưa được gọi sau 30s');
        reject(new Error('Lưu lên server timeout - có thể backend đang xử lý chậm hoặc mạng bị gián đoạn'));
      }, 30000); // Tăng từ 10s lên 30s
      
      saveDataOptionUser(allConfigs, (success, error) => {
        clearTimeout(timeoutId); // ✅ Clear timeout ngay khi callback được gọi
        
        if (success) {
          console.log(`✅ [UpdateAllConfigs] BƯỚC 2: Lưu THÀNH CÔNG lên server!`);
          console.log(`   ✅ Đã cập nhật các config: ${updatedConfigIds.join(', ')}`);
          thongbao(`✅ Đã cập nhật token cho ${updatedCount} config và lưu lên server`);
          resolve(true);
        } else {
          console.error(`❌ [UpdateAllConfigs] BƯỚC 2: Lỗi lưu lên server: ${error}`);
          canhbao(`❌ Không thể lưu token lên server: ${error}`);
          resolve(false); // Trả false để báo lỗi
        }
      });
      
    } catch (e) {
      console.error('❌ [UpdateAllConfigs] Exception:', e.message);
      console.error('   Stack:', e.stack);
      canhbao(`❌ Lỗi cập nhật config: ${e.message}`);
      reject(e);
    }
  });
}

/**
 * ✅ Kiểm tra token fanpage từ server - có còn hạn không?
 * @param {string} pageAccessToken - Token để kiểm tra
 * @returns {Promise<{ok: boolean, message: string, willExpireIn: number, isUserTokenExpired?: boolean}>}
 */
async function validatePageAccessToken(pageAccessToken) {
  try {
    if (!pageAccessToken) {
      return { ok: false, message: 'Token rỗng' };
    }
    
    // ✅ Validate token via API endpoint hoặc fallback seft
    let meRes = null;
    let apiError = null;
    
    // Thử sử dụng seft.facebookValidateToken() nếu khả dụng (preferred)
    if (typeof seft?.facebookValidateToken === 'function') {
      try {
        meRes = await seft.facebookValidateToken(pageAccessToken);
      } catch (e) {
        console.warn('⚠️ seft.facebookValidateToken() failed, fallback to API endpoint:', e.message);
        apiError = e;
        meRes = null;
      }
    }
    
    // Fallback: gọi API endpoint trực tiếp
    if (!meRes) {
      try {
        const ctx = resolveContext();
        const apiUrl = `${ctx.apiBase}/facebook/me`;
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${pageAccessToken}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          
          // ✅ Parse Facebook error message - detect User Token hết hạn
          const isUserTokenExpired = errorText.includes('Session has expired') || 
                                      errorText.includes('OAuthException') ||
                                      errorText.includes('error_subcode":463');
          
          if (isUserTokenExpired) {
            console.warn('⚠️ [ValidateToken] User Token expired (need to exchange again)');
            const message = `❌ Token User hết hạn (Session expired). Cần exchange lại token mới.
            
💡 Hãy vào Bước 1 để nhập User Token mới từ Facebook Graph API Explorer.
Link: https://developers.facebook.com/tools/explorer/`;
            
            return { 
              ok: false, 
              message: message,
              isUserTokenExpired: true
            };
          }
          
          return { ok: false, message: `API returned ${response.status}. ${errorText}` };
        }
        
        meRes = await response.json();
      } catch (e) {
        console.error('❌ [ValidateToken] API endpoint failed:', e.message);
        return { ok: false, message: 'Lỗi validate token: ' + e.message };
      }
    }
    
    if (!meRes?.success) {
      // Parse error message để detect User Token hết hạn
      const errorMsg = meRes?.message || JSON.stringify(meRes?.error) || '';
      const isUserTokenExpired = errorMsg.includes('Session has expired') || 
                                  errorMsg.includes('OAuthException') ||
                                  errorMsg.includes('463');
      
      if (isUserTokenExpired) {
        console.warn('⚠️ [ValidateToken] User Token expired (Facebook error)');
        return { 
          ok: false, 
          message: `❌ Token User hết hạn (Session expired). Cần exchange lại token mới.\n\n💡 Hãy vào Bước 1 để nhập User Token mới.`,
          isUserTokenExpired: true
        };
      }
      
      return { ok: false, message: errorMsg || 'Token không hợp lệ' };
    }
    
    // ✅ Check expiry từ config - Page token 60 ngày
    const config = loadDataOptionUser().find(c => c.fanpage_token === pageAccessToken);
    if (config?.fanpage_token_expires_at) {
      const willExpireIn = Math.floor((config.fanpage_token_expires_at - Date.now()) / (24 * 60 * 60 * 1000));
      
      if (willExpireIn < 0) {
        console.warn(`⚠️ [ValidateToken] Page Token expired ${Math.abs(willExpireIn)} days ago`);
        return { ok: false, message: `Page Token đã hết hạn ${Math.abs(willExpireIn)} ngày trước` };
      }
      
      if (willExpireIn < 7) {
        console.warn(`⚠️ [ValidateToken] Page Token expiring in ${willExpireIn} days`);
        return { 
          ok: true, 
          message: `⚠️ Page Token sẽ hết hạn trong ${willExpireIn} ngày`, 
          willExpireIn 
        };
      }
      
      console.log(`✅ [ValidateToken] Page Token valid for ${willExpireIn} more days`);
      return { 
        ok: true, 
        message: `✅ Page Token còn hạn ${willExpireIn} ngày`,
        willExpireIn 
      };
    }
    
    // Nếu không có thông tin expires, coi như OK nhưng cần chú ý
    console.log('✅ [ValidateToken] Token valid (no expiry info stored)');
    return { 
      ok: true, 
      message: `✅ Token hợp lệ (hãy update lại sau 60 ngày)`,
      willExpireIn: 60 
    };
  } catch (e) {
    console.error('❌ [ValidateToken]:', e);
    return { ok: false, message: 'Lỗi kiểm tra token: ' + e.message };
  }
}

/**
 * ✅ Load fanpage tokens từ server + validate tất cả
 * Gọi khi page load để kiểm tra token của tất cả config
 */
async function loadAndValidateFanpageTokens() {
  try {
    const allConfigs = loadDataOptionUser();
    const invalidConfigs = [];
    const expiredUserTokens = [];
    
    console.log(`🔍 [LoadAndValidate] Đang kiểm tra ${allConfigs.length} config...`);
    
    for (const config of allConfigs) {
      if (!config.fanpage_token) {
        console.log(`  ⚪ ${config.id}: Chưa có token`);
        continue;
      }
      
      console.log(`  🔍 ${config.id}: Đang validate token...`);
      const validation = await validatePageAccessToken(config.fanpage_token);
      
      if (!validation.ok) {
        console.error(`  ❌ ${config.id}: ${validation.message}`);
        
        // ✅ Track User Token expiry riêng
        if (validation.isUserTokenExpired) {
          expiredUserTokens.push({
            configId: config.id,
            configName: config.domain || config.fanpage_name || 'Unknown',
            reason: 'User Token hết hạn (Session expired - cần exchange lại)'
          });
        } else {
          invalidConfigs.push({
            configId: config.id,
            configName: config.domain || config.fanpage_name || 'Unknown',
            reason: validation.message
          });
        }
      } else {
        console.log(`  ✅ ${config.id}: ${validation.message}`);
      }
    }
    
    // ✅ Xử lý khi có User Token hết hạn
    if (expiredUserTokens.length > 0) {
      console.warn(`⚠️ [LoadAndValidate] ${expiredUserTokens.length} config có User Token hết hạn`);
      const message = `❌ ${expiredUserTokens.length} config có User Token hết hạn (Session expired).\n\n` +
                     `Cần exchange lại User Token mới:\n` +
                     expiredUserTokens.map(c => `  • ${c.configName}`).join('\n') + `\n\n` +
                     `💡 Vui lòng vào Bước 1 để nhập User Token mới từ:\n` +
                     `https://developers.facebook.com/tools/explorer/`;
      
      invalidConfigs.push(...expiredUserTokens);
    }
    
    if (invalidConfigs.length > 0) {
      console.warn(`⚠️ [LoadAndValidate] Tổng ${invalidConfigs.length} config có vấn đề`);
      return {
        ok: false,
        invalidConfigs,
        hasExpiredUserTokens: expiredUserTokens.length > 0,
        message: `${invalidConfigs.length} config có token hết hạn hoặc không hợp lệ. Vui lòng nhập lại ở Bước 1.`
      };
    }
    
    console.log(`✅ [LoadAndValidate] Tất cả token đều hợp lệ`);
    return { ok: true, invalidConfigs: [] };
  } catch (e) {
    console.error('❌ [LoadAndValidate]:', e);
    return { ok: false, invalidConfigs: [], error: e.message };
  }
}

function saveFacebookState() {
  try {
    const toSave = {
      userAccessToken: facebookState.userAccessToken,
      pageAccessToken: facebookState.pageAccessToken,
      selectedPageId: facebookState.selectedPageId,
      selectedPageName: facebookState.selectedPageName,
      selectedPageIds: Array.isArray(facebookState.selectedPageIds) ? facebookState.selectedPageIds : []
    };
    localStorage.setItem('facebook_post_state', JSON.stringify(toSave));
  } catch (e) {
    console.warn('Không thể save Facebook state:', e);
  }
}

function getSelectedFacebookPages() {
  const selectedIds = Array.isArray(facebookState.selectedPageIds) ? facebookState.selectedPageIds : [];
  const pages = Array.isArray(facebookState.pages) ? facebookState.pages : [];
  let selected = pages.filter(p => selectedIds.includes(p.id));

  if (!selected.length && facebookState.selectedPageId && facebookState.pageAccessToken) {
    selected = [{
      id: facebookState.selectedPageId,
      name: facebookState.selectedPageName || 'Unknown Page',
      access_token: facebookState.pageAccessToken
    }];
  }

  return selected;
}

function loadFacebookAutoSettings() {
  try {
    const raw = localStorage.getItem(FACEBOOK_AUTO_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const minIntervalMin = Number(parsed.minIntervalMin) || FACEBOOK_AUTO_DEFAULTS.minIntervalMin;
    const maxIntervalMin = Number(parsed.maxIntervalMin) || FACEBOOK_AUTO_DEFAULTS.maxIntervalMin;
    const maxPostsPerDay = Number(parsed.maxPostsPerDay);
    return {
      minIntervalMin: Math.max(1, Math.min(minIntervalMin, maxIntervalMin)),
      maxIntervalMin: Math.max(minIntervalMin, maxIntervalMin),
      maxPostsPerDay: Number.isFinite(maxPostsPerDay)
        ? Math.max(0, maxPostsPerDay)
        : FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay
    };
  } catch (e) {
    console.warn('Không thể load facebook_auto_settings:', e);
    return { ...FACEBOOK_AUTO_DEFAULTS };
  }
}

function saveFacebookAutoSettings(settings) {
  try {
    localStorage.setItem(FACEBOOK_AUTO_SETTINGS_KEY, JSON.stringify(settings || FACEBOOK_AUTO_DEFAULTS));
  } catch (e) {
    console.warn('Không thể save facebook_auto_settings:', e);
  }
}

function extractLinkFromMessage(item = {}) {
  const candidates = [
    item.link,
    item.url,
    item.href,
    item.website,
    item.websiteLink,
    item.web
  ];
  return candidates.find(v => typeof v === 'string' && v.trim()) || null;
}

function normalizeFacebookPostItem(item) {
  if (typeof item === 'string') {
    const content = String(item).trim();
    if (!content) return null;
    return { content, images: [], link: null };
  }
  if (!item || typeof item !== 'object') return null;
  const content = extractMessageText(item) || item.content || item.text || item.message || '';
  const images = extractImagesFromMessage(item);
  const link = extractLinkFromMessage(item);
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;
  
  // Log để debug
  if (images.length > 0) {
    console.log(`📸 normalizeFacebookPostItem: Post has ${images.length} images`);
  } else {
    console.warn(`⚠️ normalizeFacebookPostItem: Post has NO images. Item keys: ${Object.keys(item).join(', ')}`);
  }
  
  return { content: trimmed, images, link: link || null };
}

function parseFacebookBatchInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  let list = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const candidates = [
      parsed.messages,
      parsed.data,
      parsed.items,
      parsed.rows,
      parsed.list,
      parsed.posts
    ];
    const firstArray = candidates.find(v => Array.isArray(v));
    list = firstArray ? firstArray : [parsed];
  } else {
    list = [];
  }
  return list.map(normalizeFacebookPostItem).filter(Boolean);
}

async function prepareFacebookImages(ctx, images = []) {
  const uploaded = await uploadImages(ctx, images);
  return (uploaded || [])
    .filter(Boolean)
    .map(path => resolvePublicImageUrl(ctx, path));
}

function stopFacebookAutoPosting(message = '⏹️ Đã dừng auto đăng.') {
  facebookAutoRunning = false;
  facebookAutoAbort = true;
  
  // Enable lại nút Start khi dừng
  const btnAutoStart = document.getElementById('btn-fb-auto-start');
  if (btnAutoStart) {
    btnAutoStart.disabled = false;
    btnAutoStart.style.opacity = '1';
    btnAutoStart.textContent = '▶️ Bắt đầu auto';
  }
  
  showFacebookMessage(message, 'info');
}

async function buildFacebookAutoQueueFromInput() {
  // Disable buttons khi bắt đầu
  setFacebookButtonsState(true);
  
  try {
    const contentRaw = document.getElementById('content-input')?.value || '';
    const items = parseFacebookBatchInput(contentRaw);
    if (!items.length) {
      throw new Error('Danh sách trống hoặc JSON không hợp lệ.');
    }

    // Kiểm tra đã kết nối Facebook chưa
    const selectedPages = getSelectedFacebookPages();
    if (!selectedPages.length) {
      throw new Error('Vui lòng kết nối và chọn Fanpage trước khi đăng!');
    }

    const globalSettings = getGlobalSettings();
    const industry = globalSettings.industry;
    const customInstructions = document.getElementById('fb-custom-instructions')?.value || '';
    if (!industry) throw new Error('Chưa chọn lĩnh vực trong Cài Đặt Chung.');
    if (!window.csmAI?.generateSeoContentWithPrompt) {
      throw new Error('Không tìm thấy AI engine');
    }

    const delayMs = FACEBOOK_POST_COOLDOWN_MIN_MS; // 5 phút delay giữa mỗi bài
    const delaySecs = Math.round(delayMs / 1000);
    
    // Tính toán thời gian dự kiến
    const estimatedMinutes = Math.ceil(items.length * (30 + delaySecs) / 60); // AI 30s + delay
    showFacebookMessage(
      `🚀 Bắt đầu tạo và đăng ${items.length} bài lên ${selectedPages.length} fanpage!\n\n` +
      `⏱️ Quy trình:\n` +
      `• AI tạo nội dung (~30s/bài)\n` +
      `• Đăng lên Facebook ngay\n` +
      `• Chờ ${delaySecs}s trước bài tiếp\n\n` +
      `📊 Dự kiến: ~${estimatedMinutes} phút mỗi fanpage`,
      'info'
    );
    
    let successCount = 0;
    let failCount = 0;
    const ctx = resolveContext();

  for (let pIndex = 0; pIndex < selectedPages.length; pIndex++) {
    const page = selectedPages[pIndex];
    showFacebookMessage(`📄 Đang xử lý fanpage: ${page.name} (${pIndex + 1}/${selectedPages.length})`, 'info');

    for (let i = 0; i < items.length; i++) {
      if (facebookAutoAbort) throw new Error('Đã dừng auto.');
      
      try {
        const item = items[i];
        const productInfo = item.content || '';
        if (!productInfo.trim()) {
          failCount++;
          continue;
        }
        
        // BƯỚC 1: Gọi AI tạo nội dung
        showFacebookMessage(`🤖 [${page.name}] [${i + 1}/${items.length}] Đang gọi AI tạo nội dung...`, 'info');
        const prompt = await createFacebookPostPromptWithCreative(industry, productInfo, customInstructions);
        const aiResponse = await window.csmAI.generateSeoContentWithPrompt(prompt);
        const parsed = parseFacebookAIResponse(aiResponse);
        
        const trendingHashtags = getFacebookTrendingHashtags(industry, 8);
        let allHashtags = [...new Set([...parsed.hashtags, ...trendingHashtags])];
        if (allHashtags.length < 5) {
          allHashtags = [...new Set([...allHashtags, ...trendingHashtags])];
        }
        allHashtags = allHashtags.slice(0, 8);
        const finalPost = formatFacebookPostContent(parsed.post_content, allHashtags);
        
        // BƯỚC 2: Upload ảnh (nếu có)
        const images = await prepareFacebookImages(ctx, item.images || []);
        
        // BƯỚC 3: Đăng lên Facebook ngay
        showFacebookMessage(`📤 [${page.name}] [${i + 1}/${items.length}] Đang đăng lên Facebook...`, 'info');
        const result = await postToFacebookPageWithImages(
          page.id,
          page.access_token,
          finalPost,
          images,
          item.link || null,
          seft
        );
        
        if (result?.success) {
          successCount++;
          recordFacebookPost(finalPost);
          showFacebookMessage(`✅ [${page.name}] [${i + 1}/${items.length}] Đã đăng thành công!`, 'success');
        } else {
          throw new Error('Facebook API trả về lỗi');
        }
        
      } catch (error) {
        failCount++;
        console.error(`❌ Lỗi bài ${i + 1} (${page.name}):`, error);
        showFacebookMessage(`❌ [${page.name}] [${i + 1}/${items.length}] Lỗi: ${error.message}`, 'error');
      }
      
      // BƯỚC 4: Delay trước bài tiếp (trừ bài cuối)
      if (i < items.length - 1) {
        const remaining = items.length - i - 1;
        showFacebookMessage(
          `⏳ [${page.name}] Hoàn tất bài ${i + 1}! Chờ ${delaySecs}s trước bài tiếp (còn ${remaining} bài)...`,
          'info'
        );
        
        // Hiển thị countdown
        const countdownInterval = Math.max(1, Math.floor(delaySecs / 10));
        for (let wait = delaySecs; wait > 0; wait -= countdownInterval) {
          if (wait > countdownInterval) {
            await new Promise(r => setTimeout(r, countdownInterval * 1000));
            showFacebookMessage(`⏳ [${page.name}] Còn ${Math.max(0, wait - countdownInterval)}s...`, 'info');
          } else {
            await new Promise(r => setTimeout(r, wait * 1000));
          }
        }
      }
    }
  }

  // Kết quả cuối cùng
  showFacebookMessage(
    `\n🎉 HOÀN TẤT!\n\n` +
    `✅ Thành công: ${successCount} bài\n` +
    `❌ Lỗi: ${failCount} bài\n` +
    `📊 Tổng: ${items.length} bài`,
    successCount > 0 ? 'success' : 'error'
  );
  
  return successCount;
  
  } catch (error) {
    // Re-enable buttons nếu có lỗi
    setFacebookButtonsState(false);
    throw error;
  } finally {
    // Enable lại buttons khi xong
    setFacebookButtonsState(false);
  }
}

async function startFacebookAutoPosting() {
  if (facebookAutoRunning) {
    showFacebookMessage('⚠️ Auto đăng đang chạy.', 'info');
    return;
  }
  const selectedPages = getSelectedFacebookPages();
  if (!selectedPages.length) {
    showFacebookMessage('Vui lòng chọn Fanpage trước', 'error');
    return;
  }

  facebookAutoAbort = false;
  facebookAutoRunning = true;

  // Disable nút Start, enable nút Stop khi bắt đầu auto
  const btnAutoStart = document.getElementById('btn-fb-auto-start');
  const btnAutoStop = document.getElementById('btn-fb-auto-stop');
  if (btnAutoStart) {
    btnAutoStart.disabled = true;
    btnAutoStart.style.opacity = '0.5';
    btnAutoStart.textContent = '⏸️ Đang auto...';
  }
  if (btnAutoStop) {
    btnAutoStop.disabled = false;
    btnAutoStop.style.opacity = '1';
  }

  try {
    await buildFacebookAutoQueueFromInput();
  } catch (e) {
    showFacebookMessage(`❌ ${e.message}`, 'error');
  } finally {
    facebookAutoRunning = false;
    if (btnAutoStart) {
      btnAutoStart.disabled = false;
      btnAutoStart.style.opacity = '1';
      btnAutoStart.textContent = '▶️ Bắt đầu auto';
    }
  }
}

/**
 * Lấy danh sách Pages của user
 */
async function getUserPages(userAccessToken) {
  const url = `${FACEBOOK_CONFIG.GRAPH_API_BASE}/me/accounts?access_token=${userAccessToken}`;
  
  try {
    const response = await facebookFetch(url);
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Facebook API Error: ${data.error.message}`);
    }
    
    return data.data || [];
  } catch (error) {
    console.error('❌ Lỗi lấy pages:', error);
    throw error;
  }
}

/**
 * Đăng bài lên Facebook Page (sử dụng seft helper)
 */
async function postToFacebookPage(pageId, pageAccessToken, message, imageUrl = null, link = null, seft = {}) {
  try {
    // Ưu tiên sử dụng helper từ seft (thông qua AutoSetup.tsx)
    if (seft && typeof seft.postToFacebook === 'function') {
      console.log(`🚀 Posting to Facebook...`);
      console.log(`📝 Message length: ${message.length} characters${imageUrl ? ', 🖼️ with image' : ''}`);
      return await seft.postToFacebook(pageId, pageAccessToken, message, imageUrl, link);
    }
    
    // Fallback: gọi API trực tiếp (không nên dùng)
    console.warn('⚠️ postToFacebook helper not available, using fallback fetch');
    const ctx = resolveContext();
    const apiUrl = `${ctx.apiBase}/facebook/post`;
    
    const payload = {
      pageId,
      pageAccessToken,
      message,
      imageUrl: imageUrl || null,
      link: link || null
    };

    const headers = buildApiHeaders(ctx);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log(`✅ Post successful! ID: ${data.data.post_id}`);
      return {
        post_id: data.data.post_id,
        success: true
      };
    } else {
      throw new Error(data.message || 'Facebook post failed');
    }
  } catch (error) {
    console.error('❌ Lỗi đăng bài Facebook:', error);
    throw error;
  }
}

/**
 * Post to Facebook with multiple images (sử dụng seft helper)
 */
async function postToFacebookPageWithImages(pageId, pageAccessToken, message, images = [], link = null, seft = {}) {
  try {
    // ===== DEBUG: Log images received =====
    console.log(`📸 [postToFacebookPageWithImages] RECEIVED images (raw):`, images);
    console.log(`📸 [postToFacebookPageWithImages] Images type: ${typeof images}, isArray: ${Array.isArray(images)}, count: ${images.length}`);
    if (Array.isArray(images) && images.length > 0) {
      images.forEach((img, idx) => {
        console.log(`  [${idx}] Type: ${typeof img}, Length: ${img?.length || 'N/A'}, Starts: ${img?.substring(0, 80) || 'EMPTY'}`);
      });
    }
    
    // Filter và validate images
    const validImages = Array.isArray(images) 
      ? images.filter(img => typeof img === 'string' && img.trim())
      : [];
    
    console.log(`🚀 [postToFacebookPageWithImages] After validation: ${validImages.length} images (before: ${images.length})`);
    console.log(`📝 [postToFacebookPageWithImages] Message length: ${message.length} characters`);
    
    // ===== DEBUG: Log valid images =====
    if (validImages.length > 0) {
      validImages.forEach((img, idx) => {
        console.log(`  ✅ [${idx}] Valid URL: ${img.substring(0, 80)}...`);
      });
    }
    
    // Ưu tiên sử dụng helper từ seft (thông qua AutoSetup.tsx)
    if (seft && typeof seft.postToFacebookWithImages === 'function') {
      console.log(`🔄 [postToFacebookPageWithImages] Calling seft.postToFacebookWithImages with ${validImages.length} images`);
      const result = await seft.postToFacebookWithImages(pageId, pageAccessToken, message, validImages, link);
      console.log(`📤 [postToFacebookPageWithImages] seft.postToFacebookWithImages returned:`, result);
      return result;
    }
    
    // Fallback: gọi API trực tiếp (không nên dùng)
    console.warn('⚠️ postToFacebookWithImages helper not available, using fallback fetch');
    const ctx = resolveContext();
    const apiUrl = `${ctx.apiBase}/facebook/post-with-images`;
    
    const payload = {
      pageId,
      pageAccessToken,
      message,
      images: validImages,
      link: link || null
    };

    const headers = buildApiHeaders(ctx);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
      const imagesCount = data.data.images_count || validImages.length;
      console.log(`✅ Post successful! ID: ${data.data.post_id}, Images: ${imagesCount}`);
      return {
        post_id: data.data.post_id,
        success: true,
        images_count: imagesCount
      };
    } else {
      throw new Error(data.message || 'Facebook post failed');
    }
  } catch (error) {
    console.error('❌ Lỗi đăng bài Facebook với ảnh:', error);
    throw error;
  }
}



// ===== REMOVED: Duplicate createFacebookPostPrompt removed (using the enhanced version at line 4978) =====

/**
 * Lấy hashtags trending cho lĩnh vực
 */
function getFacebookTrendingHashtags(industry, limit = 12) {
  const industryHashtags = FACEBOOK_INDUSTRY_HASHTAGS[industry];
  
  if (!industryHashtags) {
    return ["#Vietnam", "#Business", "#Marketing"];
  }
  
  const allHashtags = [
    ...(industryHashtags.trending || []),
    ...(industryHashtags.location || []),
    ...(industryHashtags.type || []),
    ...(industryHashtags.action || []),
    ...(industryHashtags.product || []),
    ...(industryHashtags.concern || []),
    ...(industryHashtags.service || [])
  ];
  
  const shuffled = allHashtags.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}

/**
 * Parse AI response
 */
function parseFacebookAIResponse(rawResponse) {
  try {
    if (!rawResponse) {
      throw new Error('AI không trả về dữ liệu');
    }

    const extractJsonString = (value) => {
      if (typeof value !== 'string') return null;
      let jsonStr = value.trim();

      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      return jsonStr;
    };

    let normalized = rawResponse;
    if (typeof normalized === 'object') {
      normalized = normalized.data || normalized.result || normalized;
    }

    let parsed = null;
    if (typeof normalized === 'string') {
      const jsonStr = extractJsonString(normalized);
      if (!jsonStr) {
        throw new Error('AI response không phải string JSON hợp lệ');
      }
      parsed = JSON.parse(jsonStr);
    } else if (typeof normalized === 'object') {
      if (normalized.post_content || normalized.hashtags || normalized.suggested_image_description) {
        parsed = normalized;
      } else {
        const fallbackText = normalized.content || normalized.text || normalized.message || '';
        const jsonStr = extractJsonString(fallbackText);
        if (!jsonStr) {
          throw new Error('AI response không chứa JSON hợp lệ');
        }
        parsed = JSON.parse(jsonStr);
      }
    } else {
      throw new Error('AI response format không hỗ trợ');
    }

    return {
      post_content: parsed.post_content || '',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      suggested_image_description: parsed.suggested_image_description || '',
      target_audience: parsed.target_audience || '',
      best_post_time: parsed.best_post_time || '7-9h sáng, 19-21h tối'
    };
  } catch (error) {
    console.error('❌ Lỗi parse AI response:', error);
    throw new Error(`Không thể parse AI response: ${error.message}`);
  }
}

/**
 * Format post content với hashtags
 */
function formatFacebookPostContent(content, hashtags) {
  const hashtagStr = hashtags.map(tag => 
    tag.startsWith('#') ? tag : `#${tag}`
  ).join(' ');
  
  return `${content}\n\n${hashtagStr}`;
}

// ===== FACEBOOK UI COMPONENTS =====

/**
 * Tạo UI cho Facebook Auto Post
 */
function createFacebookPostUI() {
  const existingUI = document.getElementById('facebook-post-ui');
  if (existingUI) return;

  const theme = getThemeTokens();
  const container = ensureUnifiedUIContainer();
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'facebook-post-ui';
  wrapper.style.cssText = getFeatureCardStyle(theme);

  const title = document.createElement('div');
  title.textContent = '📱 Đăng Bài Facebook Tự Động';
  title.style.cssText = getFeatureTitleStyle(theme);

  const content = document.createElement('div');
  content.innerHTML = `
  <!-- Hướng dẫn cấu hình -->
  <div id="fb-setup-guide" style="margin-bottom: 20px; padding: 15px; background: ${theme.warning}; border: 1px solid ${theme.warningBorder}; border-radius: 6px;">
    <h4 style="color: ${theme.warningText};">🔑 Hướng dẫn lấy Page Token vĩnh viễn</h4>
      <ol style="margin: 8px 0 0 20px;">
        <li>Mở <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color: ${theme.link};">Graph API Explorer</a> và chọn đúng App.</li>
        <li>Chọn quyền: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>.</li>
        <li>Bấm <strong>Generate Access Token</strong> để lấy User Token.</li>
        <li>Gọi API <code>/me/accounts</code> để lấy danh sách Page. Token đi kèm từng Page là Page Token (vĩnh viễn).</li>
        <li>Sao chép Page Token và dán vào ô <strong>Page Access Token</strong> bên dưới.</li>
      </ol>
    </div>
    <div style="margin-top: 12px; color: ${theme.warningText};">
      <strong>⚠️ Lưu ý tránh bị "Checkpoint":</strong>
      <ul style="margin: 8px 0 0 20px;">
        <li><strong>Tần suất đăng</strong>: Không đăng dồn dập. Cách nhau tối thiểu 5 phút giữa mỗi bài tự động.</li>
        <li><strong>Chất lượng ảnh</strong>: Ưu tiên ảnh từ server uy tín hoặc link từ website của bạn, tránh nguồn bị Facebook liệt vào blacklist.</li>
        <li><strong>Nội dung khác biệt</strong>: Tránh dùng caption/link/ảnh giống nhau giữa các bài. Nên thay đổi caption cho từng bài.</li>
      </ul>
    </div>
    <button id="btn-hide-guide" style="padding: 6px 12px; background: ${theme.warningText}; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">
      Đã hiểu, ẩn hướng dẫn
    </button>
  </div>
  
  <!-- Bước 1: Nhập Token -->
  <div style="margin-bottom: 20px; padding: 15px; background: ${theme.bg}; border: 1px solid ${theme.border}; border-radius: 6px;">
    <h4 style="color: ${theme.text};">🔑 Bước 1: Nhập User hoặc Page Access Token</h4>
    <div id="fb-manual-token-input" style="margin-top: 5px;">
      <label style="color: ${theme.text};">Nhập User hoặc Page Access Token (lấy từ <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color: ${theme.link};">Graph API Explorer</a>):</label><br>
      <textarea id="fb-token-input" rows="3" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="Dán User/Page Access Token tại đây..."></textarea>
      <button id="btn-fb-save-token" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">
        Lưu Token
      </button>
    </div>
    
    <div id="fb-pages-list" style="margin-top: 15px; display: none;">
      <label style="color: ${theme.text};">Chọn Fanpage (có thể chọn nhiều):</label><br>
      <div id="fb-pages-checkboxes" style="margin-top: 8px; max-height: 220px; overflow-y: auto; padding: 8px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};"></div>
    </div>
  </div>
  
  <!-- Bước 2: Auto đăng nhiều bài -->
  <div style="margin-bottom: 20px; padding: 15px; background: ${theme.bg}; border: 1px solid ${theme.border}; border-radius: 6px;">
    <h4 style="color: ${theme.text};">🤖 Bước 2: Tạo và Auto đăng bài (AI tự động)</h4>
    
    <!-- Giải thích cơ chế -->
    <div style="background: ${theme.infoBg}; color: ${theme.infoText}; padding: 10px; border-left: 4px solid ${theme.info}; margin-bottom: 15px; border-radius: 4px;">
      <strong>📖 Cơ chế hoạt động:</strong><br>
      1️⃣ <strong>Tạo nội dung AI:</strong> Hệ thống sẽ tạo nội dung cho từng bài với delay 30s giữa mỗi lần gọi AI<br>
      2️⃣ <strong>Đăng trực tiếp:</strong> Đăng lên Facebook ngay sau khi AI tạo xong<br>
      3️⃣ <strong>Khoảng cách:</strong> Theo cấu hình (random ${FACEBOOK_AUTO_DEFAULTS.minIntervalMin}-${FACEBOOK_AUTO_DEFAULTS.maxIntervalMin} phút)<br>
      4️⃣ <strong>Giới hạn:</strong> ${FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay > 0 ? `Tối đa ${FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay} bài/ngày` : 'Không giới hạn/ngày'}
    </div>
    
    <div style="margin-bottom: 15px; padding: 10px; background: ${theme.infoBg}; color: ${theme.infoText}; border-left: 4px solid ${theme.info}; border-radius: 4px;">
      <strong>📊 Sử dụng lĩnh vực từ Cài Đặt Chung:</strong> Hệ thống sẽ tự động sử dụng lĩnh vực bạn đã chọn trong phần <em>Cài Đặt Chung</em> ở trên.<br>
      <strong>🤖 AI tự động đa dạng hóa:</strong> Hệ thống đã tích hợp logic anti-AI với nhiều personas và patterns, tự động tạo nội dung không trùng lặp.
    </div>
    
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 10px;">
      <label style="color: ${theme.text};">Khoảng cách:</label>
      <input type="number" id="fb-auto-min" min="1" style="width: 90px; padding: 6px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="Min (phút)">
      <input type="number" id="fb-auto-max" min="1" style="width: 90px; padding: 6px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="Max (phút)">
      <label style="color: ${theme.text};">Giới hạn/ngày:</label>
      <input type="number" id="fb-auto-maxday" min="0" style="width: 90px; padding: 6px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="0 = không giới hạn">
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button id="btn-fb-auto-start" class="btn-success" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
        ▶️ Bắt đầu auto
      </button>
      <button id="btn-fb-auto-stop" class="btn-warning" style="padding: 8px 16px; background: #ffc107; color: #212529; border: none; border-radius: 4px; cursor: pointer;">
        ⏹️ Dừng auto
      </button>
    </div>
  </div>
  
  <!-- Kết quả -->
  <div id="fb-results" style="display: none; padding: 15px; background: ${theme.successBg}; border: 1px solid ${theme.successBorder}; color: ${theme.successText}; border-radius: 6px;">
    <div id="fb-result-message"></div>
  </div>
  `;
  
  wrapper.append(title, content);
  container.appendChild(wrapper);
  
  // Setup event listeners
  setupFacebookEventListeners();
}

/**
 * Setup event listeners cho Facebook UI
 */
function setupFacebookEventListeners() {
  // ✅ AUTO VALIDATE: Kiểm tra tất cả token từ server khi load UI
  setTimeout(async () => {
    console.log('🔍 [Setup] Bắt đầu kiểm tra token từ server...');
    const validation = await loadAndValidateFanpageTokens();
    
    if (!validation.ok && validation.invalidConfigs?.length > 0) {
      console.error('❌ [Setup] Có config có token hết hạn:', validation.invalidConfigs);
      
      // ✅ Phân biệt thông báo cho User Token hết hạn
      const invalidList = validation.invalidConfigs
        .map(c => {
          const icon = c.reason?.includes('User Token') ? '⏰' : '❌';
          return `\n  ${icon} ${c.configName} (${c.configId}): ${c.reason}`;
        })
        .join('');
      
      let warningMsg = `⚠️ ${validation.message}${invalidList}`;
      
      // Nếu có User Token hết hạn, thêm suggestion riêng
      if (validation.hasExpiredUserTokens) {
        warningMsg += `\n\n💡 LÝ DO: User Token đã hết hạn (Session Expired)\n` +
                     `    → Facebook tự động hết hạn sau khoảng thời gian không dùng\n\n` +
                     `🔧 CÁCH FIX: Nhập User Token MỚI từ:\n` +
                     `    1. Truy cập: https://developers.facebook.com/tools/explorer/\n` +
                     `    2. Chọn App & quyền (pages_show_list, pages_manage_posts, ...)\n` +
                     `    3. Bấm "Generate Access Token" để lấy User Token mới\n` +
                     `    4. Dán vào ô "Bước 1: Nhập User hoặc Page Access Token" bên dưới`;
      }
      
      canhbao(warningMsg);
      
      // Hiển thị form nhập token
      const manualInput = document.getElementById('fb-manual-token-input');
      if (manualInput) manualInput.style.display = 'block';
    } else {
      console.log('✅ [Setup] Tất cả token từ server đều hợp lệ');
    }
  }, 1000); // Chờ 1 giây để UI render xong
  
  // ✅ LOCAL VALIDATION: Kiểm tra token đã lưu có còn hợp lệ không
  if (facebookState._needsValidation && (facebookState.selectedPageToken || facebookState.userAccessToken)) {
    console.log('🔍 [Setup] Phát hiện token cần validate, đang validate...');
    setTimeout(async () => {
      try {
        const isValid = await validateSavedTokenIfNeeded();
        if (isValid) {
          thongbao('✅ Token đã được verify - sẵn sàng sử dụng!');
          updateFacebookAuthUI(true);
        }
      } catch (e) {
        console.warn('⚠️ [Setup] Lỗi validate token:', e);
      }
    }, 500); // Delay để UI load xong
  }
  
  // Ẩn hướng dẫn
  const btnHideGuide = document.getElementById('btn-hide-guide');
  if (btnHideGuide) {
    btnHideGuide.addEventListener('click', () => {
      document.getElementById('fb-setup-guide').style.display = 'none';
      localStorage.setItem('fb_guide_hidden', 'true');
    });
  }
  
  // Kiểm tra nếu đã ẩn hướng dẫn trước đó
  if (localStorage.getItem('fb_guide_hidden') === 'true') {
    const guide = document.getElementById('fb-setup-guide');
    if (guide) guide.style.display = 'none';
  }
  
  // Bỏ kết nối SDK, chỉ dùng token thủ công
  const btnSaveToken = document.getElementById('btn-fb-save-token');
  if (btnSaveToken) {
    btnSaveToken.addEventListener('click', handleManualToken);
  }
  
  // Chọn page (multi)
  const pagesContainer = document.getElementById('fb-pages-checkboxes');
  if (pagesContainer) {
    pagesContainer.addEventListener('change', handleSelectPage);
  }
  
  // Preview
  const btnPreview = document.getElementById('btn-fb-preview');
  if (btnPreview) {
    btnPreview.addEventListener('click', handleFacebookPreview);
  }
  
  // Post
  const btnPost = document.getElementById('btn-fb-post');
  if (btnPost) {
    btnPost.addEventListener('click', handleFacebookPost);
  }

  // Auto settings + queue
  const autoMinInput = document.getElementById('fb-auto-min');
  const autoMaxInput = document.getElementById('fb-auto-max');
  const autoMaxDayInput = document.getElementById('fb-auto-maxday');
  const btnAutoStart = document.getElementById('btn-fb-auto-start');
  const btnAutoStop = document.getElementById('btn-fb-auto-stop');

  const settings = loadFacebookAutoSettings();
  if (autoMinInput) autoMinInput.value = String(settings.minIntervalMin);
  if (autoMaxInput) autoMaxInput.value = String(settings.maxIntervalMin);
  if (autoMaxDayInput) autoMaxDayInput.value = String(settings.maxPostsPerDay);

  const persistSettings = () => {
    const maxDayRaw = Number(autoMaxDayInput?.value);
    const nextSettings = {
      minIntervalMin: Math.max(1, Number(autoMinInput?.value) || FACEBOOK_AUTO_DEFAULTS.minIntervalMin),
      maxIntervalMin: Math.max(1, Number(autoMaxInput?.value) || FACEBOOK_AUTO_DEFAULTS.maxIntervalMin),
      maxPostsPerDay: Number.isFinite(maxDayRaw)
        ? Math.max(0, maxDayRaw)
        : FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay
    };
    if (nextSettings.maxIntervalMin < nextSettings.minIntervalMin) {
      nextSettings.maxIntervalMin = nextSettings.minIntervalMin;
      if (autoMaxInput) autoMaxInput.value = String(nextSettings.maxIntervalMin);
    }
    saveFacebookAutoSettings(nextSettings);
  };

  if (autoMinInput) autoMinInput.addEventListener('change', persistSettings);
  if (autoMaxInput) autoMaxInput.addEventListener('change', persistSettings);
  if (autoMaxDayInput) autoMaxDayInput.addEventListener('change', persistSettings);

  if (btnAutoStart) {
    btnAutoStart.addEventListener('click', () => {
      // Disable ngay để tránh double-click
      btnAutoStart.disabled = true;
      btnAutoStart.style.opacity = '0.5';
      startFacebookAutoPosting();
    });
  }

  if (btnAutoStop) {
    btnAutoStop.addEventListener('click', () => {
      // Disable ngay để tránh double-click
      btnAutoStop.disabled = true;
      btnAutoStop.style.opacity = '0.5';
      stopFacebookAutoPosting('⏹️ Đã dừng auto đăng.');
      // Re-enable sau 300ms
      setTimeout(() => {
        btnAutoStop.disabled = false;
        btnAutoStop.style.opacity = '1';
      }, 300);
    });
  }

  
}

/**
 * Validate saved token trước sử dụng
 * Nếu token không hợp lệ, sẽ xóa và yêu cầu nhập lại
 */
async function validateSavedTokenIfNeeded() {
  if (!facebookState._needsValidation) {
    return true; // Token đã được validate hoặc không cần validate
  }

  console.log('🔍 [ValidateSavedToken] Đang validate token đã lưu...');
  
  try {
    // Chọn token để validate (ưu tiên selectedPageToken, fallback userAccessToken)
    const tokenToValidate = facebookState.selectedPageToken || facebookState.userAccessToken;
    
    if (!tokenToValidate) {
      console.warn('⚠️ [ValidateSavedToken] Không tìm thấy token để validate');
      facebookState._needsValidation = false;
      return false;
    }

    // ✅ Sử dụng validatePageAccessToken() - đã có fallback seft + API
    const validation = await validatePageAccessToken(tokenToValidate);
    
    if (!validation.ok) {
      console.error('❌ [ValidateSavedToken] Token không hợp lệ:', validation.message);
      // Token hết hạn hoặc không còn hợp lệ
      facebookState.selectedPageToken = null;
      facebookState.userAccessToken = null;
      facebookState.pages = [];
      saveFacebookState();
      facebookState._needsValidation = false;
      
      canhbao('❌ Token đã lưu không còn hợp lệ. Vui lòng nhập token mới.');
      document.getElementById('fb-manual-token-input').style.display = 'block';
      return false;
    }

    console.log('✅ [ValidateSavedToken] Token hợp lệ. ' + validation.message);
    facebookState._needsValidation = false;
    return true;
  } catch (error) {
    console.error('❌ [ValidateSavedToken] Lỗi validate:', error);
    canhbao('❌ Lỗi kiểm tra token: ' + error.message);
    facebookState._needsValidation = false;
    return false;
  }
}

/**
 * Handle nhập token thủ công
 */
async function handleManualToken() {
  const tokenInput = document.getElementById('fb-token-input');
  const token = tokenInput?.value?.trim();
  
  if (!token) {
    showFacebookMessage('Vui lòng nhập token', 'error');
    return;
  }
  
  console.log('🚀 [HandleManualToken] BẮT ĐẦU XỬ LÝ TOKEN NHẬP TỪ BƯỚC 1');
  console.trace('[HandleManualToken] Call stack');
  
  try {
    showFacebookMessage('Đang kiểm tra token...', 'info');

    // Validate token via backend
    const meRes = await seft.facebookValidateToken(token);
    if (!meRes?.success) {
      throw new Error(meRes?.message || 'Token không hợp lệ');
    }

    const tokenInfo = meRes?.data || {};
    console.log('✅ [HandleManualToken] Đã validate token qua backend');

    // Exchange sang Token B (60 ngày) nếu có thể
    showFacebookMessage('Đang exchange sang Token B (60 ngày)...', 'info');
    
    let longLivedToken = token;
    let userAccessToken = token; // Lưu để có thể re-exchange sau 60 ngày
    const exchangeRes = await seft.facebookExchangeToken(token, FACEBOOK_CONFIG.APP_ID, FACEBOOK_CONFIG.APP_SECRET);
    if (exchangeRes?.success && exchangeRes?.data?.access_token) {
      longLivedToken = exchangeRes.data.access_token;
      userAccessToken = longLivedToken; // Update user token
      console.log('✅ [HandleManualToken] Đã exchange sang 60-day token');
      showFacebookMessage('✅ Đã đổi sang Token B (60 ngày).', 'info');
    }

    // Get pages list via backend using long-lived token
    const pagesRes = await seft.facebookGetPages(longLivedToken);
    const pages = Array.isArray(pagesRes?.data?.data) ? pagesRes.data.data : [];

    if (pages.length) {
      console.log(`✅ [HandleManualToken] Đã load ${pages.length} pages từ API`);
      facebookState.userAccessToken = longLivedToken;
      facebookState.pages = pages;
      facebookState._needsValidation = false; // ✅ Vừa validate xong
      saveFacebookState();

      // ✅ SAVE LÊN SERVER: Cập nhật tất cả config với token mới
      showFacebookMessage('💾 Đang lưu token lên server...', 'info');
      const firstPage = pages[0];
      
      console.log('📌 [HandleManualToken] Gọi updateAllConfigsWithNewFanpageToken với:');
      console.log('   - newPageAccessToken:', firstPage.access_token?.substring(0, 20) + '...');
      console.log('   - userAccessToken:', userAccessToken?.substring(0, 20) + '...');
      console.log('   - fanpageId:', firstPage.id);
      console.log('   - fanpageName:', firstPage.name);
      
      const baseSuccess = await updateAllConfigsWithNewFanpageToken(
        firstPage.access_token, // Page token đã có
        userAccessToken,          // User token để re-exchange
        firstPage.id,
        firstPage.name
      );
      
      console.log(`✅ [HandleManualToken] updateAllConfigsWithNewFanpageToken return: ${baseSuccess}`);
      
      if (!baseSuccess) {
        throw new Error('Không thể lưu token lên server');
      }

      updateFacebookAuthUI(true);
      const pagesList = document.getElementById('fb-pages-list');
      if (pagesList) pagesList.style.display = 'block';
      populateFacebookPages(pages);
      console.log('✅ [HandleManualToken] KẾT THÚC THÀNH CÔNG');
      showFacebookMessage(`✅ Token đã lưu lên server thành công!\n💾 Tất cả ${pages?.length || 1} config đã được cập nhật.\n\n Vui lòng chọn Page để đăng bài.`, 'success');
      document.getElementById('fb-manual-token-input').style.display = 'none';
      return;
    }

    // Nếu /me/accounts lỗi (#100 accounts trên Page) => đây là Page Access Token
    const pagesErr = pagesRes?.message || '';
    if (pagesErr.includes('accounts') || pagesErr.includes('(#100)') || pagesErr.includes('OAuthException')) {
      console.log('🔍 [HandleManualToken] Token là Page Access Token của Page');
      showFacebookMessage('✅ Phát hiện Page Access Token. Đang sử dụng trực tiếp...', 'info');

      facebookState.selectedPageId = tokenInfo.id;
      facebookState.selectedPageName = tokenInfo.name || 'Unknown Page';
      facebookState.selectedPageToken = token;
      facebookState.selectedPageIds = tokenInfo.id ? [tokenInfo.id] : [];
      facebookState._needsValidation = false; // ✅ Vừa validate xong
      saveFacebookState();

      // ✅ SAVE LÊN SERVER: Lưu page token lên server
      showFacebookMessage('💾 Đang lưu token lên server...', 'info');
      
      console.log('📌 [HandleManualToken] Gọi updateAllConfigsWithNewFanpageToken (Page Token) với:');
      console.log('   - Token:', token?.substring(0, 20) + '...');
      console.log('   - fanpageId:', tokenInfo.id);
      console.log('   - fanpageName:', tokenInfo.name);
      
      const baseSuccess = await updateAllConfigsWithNewFanpageToken(
        token,                     // Page token
        token,                     // User token = Page token (vì là page token)
        tokenInfo.id,
        tokenInfo.name || 'Unknown Page'
      );
      
      console.log(`✅ [HandleManualToken] updateAllConfigsWithNewFanpageToken return: ${baseSuccess}`);
      
      if (!baseSuccess) {
        throw new Error('Không thể lưu token lên server');
      }

      updateFacebookAuthUI(true);
      console.log('✅ [HandleManualToken] KẾT THÚC THÀNH CÔNG (Page Token Path)');
      showFacebookMessage(`✅ Đã kết nối Page: ${facebookState.selectedPageName}. Token đã lưu lên server.`, 'success');
      document.getElementById('fb-manual-token-input').style.display = 'none';
      return;
    }

    throw new Error(pagesRes?.message || 'Token hợp lệ nhưng không lấy được Page Token.');
  } catch (error) {
    console.error('❌ [HandleManualToken] Lỗi:', error);
    console.error('   Stack:', error.stack);
    showFacebookMessage('Token không hợp lệ: ' + error.message, 'error');
  }
}

/**
 * Load Facebook pages (giữ nguyên)
 */
async function loadFacebookPages() {
  if (!facebookState.userAccessToken) {
    return;
  }
  
  try {
    const pages = await getUserPages(facebookState.userAccessToken);
    facebookState.pages = pages;
    
    updateFacebookAuthUI(true);
    populateFacebookPages(pages);
    if (!Array.isArray(facebookState.selectedPageIds) || !facebookState.selectedPageIds.length) {
      if (facebookState.selectedPageId) {
        facebookState.selectedPageIds = [facebookState.selectedPageId];
        saveFacebookState();
      }
    }
    
  } catch (error) {
    console.error('❌ Lỗi load pages:', error);
    showFacebookMessage('Không thể tải Fanpages: ' + error.message, 'error');
  }
}

/**
 * Update auth UI
 */
function updateFacebookAuthUI(isConnected = false) {
  const statusText = document.getElementById('fb-status-text');
  const btnConnect = document.getElementById('btn-fb-connect');
  const pagesList = document.getElementById('fb-pages-list');
  
  if (statusText) {
    statusText.textContent = isConnected ? '✅ Đã kết nối' : 'Chưa kết nối';
    statusText.style.color = isConnected ? 'green' : '#666';
  }
  
  if (btnConnect) {
    btnConnect.textContent = isConnected ? '🔄 Kết nối lại' : 'Kết nối với Facebook';
  }
  
  if (pagesList) {
    pagesList.style.display = isConnected ? 'block' : 'none';
  }
}

/**
 * Populate pages dropdown
 */
function populateFacebookPages(pages) {
  const container = document.getElementById('fb-pages-checkboxes');
  if (!container) return;

  container.innerHTML = '';
  const selectedIds = Array.isArray(facebookState.selectedPageIds) ? facebookState.selectedPageIds : [];

  pages.forEach(page => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'fb-page-checkbox';
    checkbox.value = page.id;
    checkbox.checked = selectedIds.includes(page.id);

    const text = document.createElement('span');
    text.textContent = page.name;

    row.append(checkbox, text);
    container.appendChild(row);
  });
}

/**
 * Handle select page
 */
function handleSelectPage(event) {
  const target = event?.target;
  if (!target || target.name !== 'fb-page-checkbox') return;

  const checkboxes = Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]'));
  const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => cb.value);

  facebookState.selectedPageIds = selectedIds;

  if (!selectedIds.length) {
    facebookState.selectedPageId = null;
    facebookState.selectedPageName = null;
    facebookState.pageAccessToken = null;
    saveFacebookState();
    showFacebookMessage('⚠️ Chưa chọn Fanpage nào.', 'info');
    return;
  }

  const firstPage = facebookState.pages.find(p => p.id === selectedIds[0]);
  if (firstPage) {
    facebookState.selectedPageId = firstPage.id;
    facebookState.selectedPageName = firstPage.name;
    facebookState.pageAccessToken = firstPage.access_token;
    
    // ✅ Validate token của page được chọn
    setTimeout(async () => {
      console.log(`🔍 [SelectPage] Validating token for page: ${firstPage.name}`);
      const validation = await validatePageAccessToken(firstPage.access_token);
      if (validation.ok) {
        console.log(`✅ [SelectPage] Token hợp lệ: ${validation.message}`);
        if (validation.willExpireIn < 7) {
          showFacebookMessage(`⚠️ ${validation.message}. Hãy update token sau 60 ngày!`, 'warning');
        }
      } else {
        console.error(`❌ [SelectPage] Token không hợp lệ: ${validation.message}`);
        showFacebookMessage(`❌ Token của page này không hợp lệ: ${validation.message}`, 'error');
      }
    }, 100);
  }

  saveFacebookState();
  showFacebookMessage(`✅ Đã chọn ${selectedIds.length} fanpage.`, 'success');
}

/**
 * Handle preview
 */
async function handleFacebookPreview() {
  // Disable nút ngay khi bắt đầu
  const btnPreview = document.getElementById('btn-fb-preview');
  if (btnPreview) {
    btnPreview.disabled = true;
    btnPreview.style.opacity = '0.5';
    btnPreview.style.cursor = 'not-allowed';
    btnPreview.textContent = '⏳ Đang tạo...';
  }
  
  const globalSettings = getGlobalSettings();
  const industry = globalSettings.industry;
  let productInfo = document.getElementById('fb-product-info')?.value;
  const customInstructions = document.getElementById('fb-custom-instructions')?.value;
  const imageInput = document.getElementById('fb-image-url');

  if (!productInfo || !productInfo.trim()) {
    const autoText = getFirstTextFromJsonInput();
    if (autoText) {
      productInfo = autoText;
      const productInfoEl = document.getElementById('fb-product-info');
      if (productInfoEl) productInfoEl.value = autoText;
    }
  }
  
  if (imageInput && !imageInput.value) {
    const autoImage = getFirstImageFromJsonInput();
    if (autoImage) {
      imageInput.value = autoImage;
    }
  }
  
  if (!industry || !productInfo) {
    showFacebookMessage('Vui lòng chọn lĩnh vực và nhập thông tin sản phẩm', 'error');
    // Enable lại nút
    if (btnPreview) {
      btnPreview.disabled = false;
      btnPreview.style.opacity = '1';
      btnPreview.style.cursor = 'pointer';
      btnPreview.textContent = '👁️ Xem trước';
    }
    return;
  }
  
  try {
    showFacebookMessage('🤖 AI đang tạo nội dung...', 'info');
    
    const prompt = await createFacebookPostPromptWithCreative(industry, productInfo, customInstructions);
    
    let aiResponse;
    if (window.csmAI && window.csmAI.generateSeoContentWithPrompt) {
      aiResponse = await window.csmAI.generateSeoContentWithPrompt(prompt);
    } else {
      throw new Error('Không tìm thấy AI engine');
    }
    
    const parsed = parseFacebookAIResponse(aiResponse);
    const trendingHashtags = getFacebookTrendingHashtags(industry, 8);
    let allHashtags = [...new Set([...parsed.hashtags, ...trendingHashtags])];
    if (allHashtags.length < 5) {
      allHashtags = [...new Set([...allHashtags, ...trendingHashtags])];
    }
    allHashtags = allHashtags.slice(0, 8);
    
    const finalPost = formatFacebookPostContent(parsed.post_content, allHashtags);
    
    displayFacebookPreview(finalPost, parsed);
    
    facebookState.lastPostResult = {
      content: finalPost,
      meta: parsed
    };
    
    showFacebookMessage('✅ Đã tạo nội dung', 'success');
    
  } catch (error) {
    console.error('❌ Lỗi preview:', error);
    showFacebookMessage('Lỗi: ' + error.message, 'error');
  } finally {
    // Enable lại nút sau 500ms (debounce)
    setTimeout(() => {
      const btnPreview = document.getElementById('btn-fb-preview');
      if (btnPreview) {
        btnPreview.disabled = false;
        btnPreview.style.opacity = '1';
        btnPreview.style.cursor = 'pointer';
        btnPreview.textContent = '👁️ Xem trước';
      }
    }, 500);
  }
}

/**
 * Handle post to Facebook
 */
async function handleFacebookPost() {
  // ✅ VALIDATE TOKEN trước post
  if (facebookState._needsValidation) {
    console.log('🔍 [Post] Token cần validate, đang validate...');
    try {
      const isValid = await validateSavedTokenIfNeeded();
      if (!isValid) {
        showFacebookMessage('❌ Token không hợp lệ - vui lòng nhập lại', 'error');
        return;
      }
    } catch (e) {
      showFacebookMessage('❌ Lỗi kiểm tra token: ' + e.message, 'error');
      return;
    }
  }
  
  // Disable nút ngay khi bắt đầu
  const btnPost = document.getElementById('btn-fb-post');
  if (btnPost) {
    btnPost.disabled = true;
    btnPost.style.opacity = '0.5';
    btnPost.style.cursor = 'not-allowed';
    btnPost.textContent = '⏳ Đang đăng...';
  }
  
  const selectedPages = getSelectedFacebookPages();
  if (!selectedPages.length) {
    showFacebookMessage('Vui lòng chọn Fanpage trước', 'error');
    // Re-enable nút
    if (btnPost) {
      btnPost.disabled = false;
      btnPost.style.opacity = '1';
      btnPost.style.cursor = 'pointer';
      btnPost.textContent = '📤 Đăng bài';
    }
    return;
  }
  
  if (!facebookState.lastPostResult) {
    showFacebookMessage('Vui lòng tạo nội dung trước (nhấn Xem trước)', 'error');
    // Re-enable nút
    if (btnPost) {
      btnPost.disabled = false;
      btnPost.style.opacity = '1';
      btnPost.style.cursor = 'pointer';
      btnPost.textContent = '📤 Đăng bài';
    }
    return;
  }

  const now = Date.now();
  const nextAllowedAt = getFacebookNextAllowedPostAt();
  if (nextAllowedAt && now < nextAllowedAt) {
    const waitMs = nextAllowedAt - now;
    showFacebookMessage(`⏳ Vui lòng chờ ${formatDurationMs(waitMs)} trước khi đăng bài tiếp theo.`, 'error');
    // Re-enable nút
    if (btnPost) {
      btnPost.disabled = false;
      btnPost.style.opacity = '1';
      btnPost.style.cursor = 'pointer';
      btnPost.textContent = '📤 Đăng bài';
    }
    return;
  }
  
  const imageUrl = document.getElementById('fb-image-url')?.value;
  const websiteLink = document.getElementById('fb-website-link')?.value;
  const postContent = facebookState.lastPostResult?.content || '';
  const targetPage = selectedPages[0];
  if (selectedPages.length > 1) {
    showFacebookMessage(`ℹ️ Đang đăng thủ công lên fanpage đầu tiên: ${targetPage.name}.`, 'info');
  }

  const validation = validateFacebookPostContent(postContent);
  if (!validation.ok) {
    const isDuplicate = validation.message.includes('trùng với bài');
    if (!isDuplicate) {
      showFacebookMessage(validation.message, 'error');
      // Re-enable nút
      if (btnPost) {
        btnPost.disabled = false;
        btnPost.style.opacity = '1';
        btnPost.style.cursor = 'pointer';
        btnPost.textContent = '📤 Đăng bài';
      }
      return;
    }

    if (!isZaloAutoMode) {
      const confirmDuplicate = confirm(`${validation.message}\n\nBạn có muốn tiếp tục đăng bài này không?`);
      if (!confirmDuplicate) {
        showFacebookMessage('Đã hủy đăng bài.', 'info');
        // Re-enable nút
        if (btnPost) {
          btnPost.disabled = false;
          btnPost.style.opacity = '1';
          btnPost.style.cursor = 'pointer';
          btnPost.textContent = '📤 Đăng bài';
        }
        return;
      }
    } else {
      console.log(`✅ [Auto Mode] Tự động xác nhận đăng bài có trùng lặp`);
    }
  }

  if (!isZaloAutoMode) {
    const confirmPost = confirm('Xác nhận đăng bài này lên Facebook?');
    if (!confirmPost) {
      showFacebookMessage('Đã hủy đăng bài.', 'info');
      // Re-enable nút
      if (btnPost) {
        btnPost.disabled = false;
        btnPost.style.opacity = '1';
        btnPost.style.cursor = 'pointer';
        btnPost.textContent = '📤 Đăng bài';
      }
      return;
    }
  } else {
    console.log(`✅ [Auto Mode] Tự động xác nhận đăng bài lên Facebook`);
  }
  
  try {
    showFacebookMessage('📤 Đang đăng bài...', 'info');

    const ctx = resolveContext();
    let finalImageUrl = imageUrl || null;
    if (finalImageUrl) {
      const isBase64 = /^data:image\//i.test(finalImageUrl);
      if (isBase64) {
        const uploadedPath = await uploadBase64Image(finalImageUrl, `fb-${Date.now()}.png`, ctx);
        finalImageUrl = resolvePublicImageUrl(ctx, uploadedPath);
      } else {
        finalImageUrl = resolvePublicImageUrl(ctx, finalImageUrl);
      }
    }
    
    const imagesToPost = [];
    if (finalImageUrl) {
      imagesToPost.push(finalImageUrl);
    }
    
    // Always use postToFacebookPageWithImages for consistency
    const result = await postToFacebookPageWithImages(
      targetPage.id,
      targetPage.access_token,
      postContent,
      imagesToPost,
      websiteLink || null,
      seft
    );  
    
    if (result.success) {
      recordFacebookPost(postContent);
      const nextAt = setFacebookNextAllowedPostAt();
      const waitMs = nextAt - Date.now();
      showFacebookMessage(`🎉 Đăng bài thành công trên ${targetPage.name}! (${result.images_count} ảnh) <a href="https://www.facebook.com/${result.post_id}" target="_blank">Xem bài viết</a>`, 'success');
      showFacebookMessage(`⏳ Hệ thống sẽ cho phép đăng bài tiếp theo sau ${formatDurationMs(waitMs)}.`, 'info');
    }
    
  } catch (error) {
    console.error('❌ Lỗi đăng bài:', error);
    showFacebookMessage('Lỗi: ' + error.message, 'error');
  } finally {
    // Enable lại nút sau 500ms (debounce)
    setTimeout(() => {
      const btnPost = document.getElementById('btn-fb-post');
      if (btnPost) {
        btnPost.disabled = false;
        btnPost.style.opacity = '1';
        btnPost.style.cursor = 'pointer';
        btnPost.textContent = '📤 Đăng bài';
      }
    }, 500);
  }
}

/**
 * Display preview
 */
function displayFacebookPreview(content, meta) {
  const previewDiv = document.getElementById('fb-preview');
  const previewContent = document.getElementById('fb-preview-content');
  const previewMeta = document.getElementById('fb-preview-meta');
  
  if (!previewDiv || !previewContent || !previewMeta) return;
  
  previewContent.textContent = content;
  
  const metaInfo = [
    `👥 Đối tượng: ${meta.target_audience || 'N/A'}`,
    `⏰ Thời gian đăng tốt: ${meta.best_post_time || 'N/A'}`,
    `🖼️ Gợi ý hình: ${meta.suggested_image_description || 'N/A'}`
  ].join('\n');
  
  previewMeta.textContent = metaInfo;
  previewDiv.style.display = 'block';
}

/**
 * Show message
 */
function showFacebookMessage(message, type = 'info') {
  const resultsDiv = document.getElementById('fb-results');
  const messageDiv = document.getElementById('fb-result-message');
  
  if (!resultsDiv || !messageDiv) {
    console.log(`[FB ${type}] ${message}`);
    return;
  }
  
  const colors = {
    success: { bg: '#d4edda', border: '#c3e6cb', color: '#155724' },
    error: { bg: '#f8d7da', border: '#f5c6cb', color: '#721c24' },
    info: { bg: '#d1ecf1', border: '#bee5eb', color: '#0c5460' }
  };
  
  const style = colors[type] || colors.info;
  
  resultsDiv.style.background = style.bg;
  resultsDiv.style.borderColor = style.border;
  messageDiv.style.color = style.color;
  messageDiv.innerHTML = message;
  resultsDiv.style.display = 'block';
  
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      resultsDiv.style.display = 'none';
    }, 5000);
  }
}

/**
 * Kiểm tra và validate csmUserData có sẵn không
 * Trả về true nếu csmUserData sẵn sàng, false nếu fallback về localStorage
 */
function validateCsmUserDataReady() {
  if (!window.csmUserData) {
    console.warn('[Zalo Storage] ⚠️ window.csmUserData not found - if this persists, fallback to localStorage will be used');
    return false;
  }
  
  const hasFetch = typeof window.csmUserData.fetchFromDatabase === 'function';
  const hasGet = typeof window.csmUserData.get === 'function';
  const hasSet = typeof window.csmUserData.set === 'function';
  
  if (!hasFetch || !hasGet || !hasSet) {
    console.warn('[Zalo Storage] ⚠️ csmUserData missing methods:', { hasFetch, hasGet, hasSet });
    return false;
  }
  
  console.log('[Zalo Storage] ✅ csmUserData ready (fetch, get, set available)');
  return true;
}

// ===== STORAGE HELPERS - LƯU TRỮ DATAOPTIONUSER GIỐNG SEO.JS (VỚI CSMuserdata) =====
/**
 * Load dataOptionUser từ csmUserData (giống seo.js)
 * ƯுTIÊN: 
 *   1. Lấy từ window.csmUserData.get() (cached from server)
 *   2. Fallback: localStorage
 * @returns {Array} Mảng object
 */
function loadDataOptionUser() {
  console.log('📂 [LoadDataOptionUser] BẮT ĐẦU LOAD CONFIGS');
  console.log('   Checking window.csmUserData:', typeof window.csmUserData);
  console.log('   Checking window.csmUserData.get:', typeof window.csmUserData?.get);
  
  // Ưu tiên lấy từ csmUserData nếu có (từ AutoSetup.tsx)
  if (window.csmUserData && typeof window.csmUserData.get === 'function') {
    try {
      console.log('   📍 Trying window.csmUserData.get()...');
      let arr = window.csmUserData.get();
      console.log('   📦 Result type:', typeof arr);
      console.log('   📦 Result:', arr);
      
      if (typeof arr === 'string') {
        console.log('   📍 Result is string, parsing JSON...');
        arr = JSON.parse(arr);
      }
      if (Array.isArray(arr) && arr.length > 0) {
        // ✅ FILTER: Chỉ lấy configs, bỏ posted messages và data không hợp lệ
        const configs = arr.filter(item => {
          // Bỏ posted messages (id bắt đầu với posted_zalo_)
          if (item.id && item.id.toString().startsWith('posted_zalo_')) {
            return false;
          }
          // Chỉ lấy items có config_for_zalo = true hoặc có domain (config cũ)
          return item.config_for_zalo === true || (item.domain && !item.id?.startsWith('posted_'));
        });
        
        console.log(`✅ [LoadDataOptionUser] Loaded ${configs.length} configs from csmUserData.get() (filtered from ${arr.length} total items)`);
        configs.forEach((cfg, i) => {
          console.log(`   [${i}] id: ${cfg.id}, domain: ${cfg.domain}, config_for_zalo: ${cfg.config_for_zalo}, has fanpage_token: ${!!cfg.fanpage_token}`);
        });
        return configs;
      } else {
        console.log('   ⚠️ Result is not an array or empty');
      }
    } catch (e) {
      console.error('❌ Error loading from csmUserData:', e);
      console.error('   Stack:', e.stack);
    }
  }

  // Fallback: localStorage
  console.log('   📍 Trying localStorage fallback...');
  try {
    const raw = localStorage.getItem('dataOptionUser');
    if (!raw) {
      console.log('❌ [LoadDataOptionUser] localStorage is empty');
      return [];
    }
    const parsed = JSON.parse(raw);
    
    // ✅ FILTER: Chỉ lấy configs, bỏ posted messages
    const configs = Array.isArray(parsed) ? parsed.filter(item => {
      if (item.id && item.id.toString().startsWith('posted_zalo_')) {
        return false;
      }
      return item.config_for_zalo === true || (item.domain && !item.id?.startsWith('posted_'));
    }) : [];
    
    console.log(`⚠️ [LoadDataOptionUser] Loaded ${configs.length} configs from localStorage (filtered from ${parsed.length} total items, FALLBACK MODE)`);
    configs.forEach((cfg, i) => {
      console.log(`   [${i}] id: ${cfg.id}, domain: ${cfg.domain}, config_for_zalo: ${cfg.config_for_zalo}`);
    });
    return configs;
  } catch (e) {
    console.error('❌ Lỗi load dataOptionUser from localStorage:', e);
    return [];
  }
}

/**
 * Fetch dataOptionUser từ server (force refresh)
 * @param {Function} callback - callback(success, data, error)
 */
function fetchDataOptionUserFromServer(callback) {
  if (window.csmUserData && typeof window.csmUserData.fetchFromDatabase === 'function') {
    console.log('[Zalo] Fetching dataOptionUser from server...');
    window.csmUserData.fetchFromDatabase(function(success, data, error) {
      if (success && Array.isArray(data)) {
        console.log('[Zalo] ✅ Fetched', data.length, 'items from server');
        callback(true, data, null);
      } else {
        console.warn('[Zalo] ❌ Failed to fetch from server:', error);
        callback(false, null, error);
      }
    });
  } else {
    console.warn('[Zalo] csmUserData.fetchFromDatabase not available');
    callback(false, null, 'csmUserData not available');
  }
}

/**
 * Lưu dataOptionUser lên server qua csmUserData
 * @param {Array} data - Mảng dữ liệu cần lưu
 * @param {Function} callback - callback(success, error)
 */
function saveDataOptionUser(data, callback) {
  const dataToSave = Array.isArray(data) ? data : [];
  
  console.log('====== 💾 [SaveDataOptionUser] BẮT ĐẦU LƯU DỮ LIỆU ======');
  console.log('📊 Số items được truyền vào:', dataToSave.length);
  
  // ✅ CRITICAL FIX: Preserve posted messages khi save configs
  // Lấy posted messages cũ từ storage (nếu có) để merge
  let postedMessages = [];
  try {
    if (window.csmUserData && typeof window.csmUserData.get === 'function') {
      const existing = window.csmUserData.get();
      if (Array.isArray(existing)) {
        postedMessages = existing.filter(item => {
          if (item.type === 'posted_zalo_message') return true;
          if (item.id && item.id.toString().startsWith('posted_zalo_')) return true;
          return false;
        });
      }
    } else {
      // Fallback: localStorage
      const raw = localStorage.getItem('dataOptionUser');
      if (raw) {
        const existing = JSON.parse(raw);
        if (Array.isArray(existing)) {
          postedMessages = existing.filter(item => {
            if (item.type === 'posted_zalo_message') return true;
            if (item.id && item.id.toString().startsWith('posted_zalo_')) return true;
            return false;
          });
        }
      }
    }
    if (postedMessages.length > 0) {
      console.log(`📌 [SaveDataOptionUser] Preserving ${postedMessages.length} posted messages`);
    }
  } catch (e) {
    console.warn('⚠️ [SaveDataOptionUser] Error loading posted messages:', e);
  }
  
  // Merge: configs + posted messages
  const finalData = [...dataToSave, ...postedMessages];
  console.log('📊 Final data to save:', finalData.length, 'items (', dataToSave.length, 'configs +', postedMessages.length, 'posted messages)');
  
  // Log chi tiết từng config
  dataToSave.forEach((cfg, i) => {
    console.log(`   [${i}] Config:
      - id: ${cfg.id}
      - domain: ${cfg.domain}
      - config_for_zalo: ${cfg.config_for_zalo}
      - fanpage_id: ${cfg.fanpage_id || 'null'}
      - fanpage_token: ${cfg.fanpage_token ? cfg.fanpage_token.substring(0, 20) + '...' : 'null'}
      - fanpage_token_expires_at: ${cfg.fanpage_token_expires_at || 'null'}
    `);
  });
  
  console.log('🔍 window.csmUserData exists?', typeof window.csmUserData);
  console.log('🔍 window.csmUserData.set is function?', typeof window.csmUserData?.set);
  
  // Ưu tiên lưu qua csmUserData (server)
  if (window.csmUserData && typeof window.csmUserData.set === 'function') {
    console.log('✨ Hành động: Lưu qua window.csmUserData.set() (SERVER)');
    console.log('📤 Gửi', finalData.length, 'items tới server...');
    
    // Hiển thị 1-2 item mẫu
    if (finalData.length > 0) {
      console.log('   📌 Item 0:', {
        id: finalData[0].id,
        domain: finalData[0].domain,
        config_for_zalo: finalData[0].config_for_zalo,
        type: finalData[0].type,
        has_fanpage_token: !!finalData[0].fanpage_token
      });
    }
    
    window.csmUserData.set(finalData, function (success, error) {
      console.log('🔔 CALLBACK từ window.csmUserData.set() được gọi');
      console.log('   ✅ success =', success);
      console.log('   ❌ error =', error);
      
      if (success) {
        console.log('✅ [SaveDataOptionUser] SERVER SAVE THÀNH CÔNG!');
        console.log('📍 Backup vào localStorage...');
        // Optional: also sync to localStorage as backup
        try {
          localStorage.setItem('dataOptionUser', JSON.stringify(finalData));
          console.log('✅ localStorage backup THÀNH CÔNG');
        } catch (e) {
          console.warn('⚠️ localStorage backup THẤT BẠI:', e);
        }
        if (callback) callback(true, null);
      } else {
        console.error('❌ [SaveDataOptionUser] SERVER SAVE THẤT BẠI!');
        console.error('   Error:', error);
        if (callback) callback(false, error);
      }
    });
  } else {
    // Fallback: localStorage only
    console.log('⚠️ Hành động: FALLBACK sang localStorage (window.csmUserData KHÔNG khả dụng!)');
    console.log('   window.csmUserData =', window.csmUserData);
    console.log('   typeof window.csmUserData.set =', typeof window.csmUserData?.set);
    
    try {
      localStorage.setItem('dataOptionUser', JSON.stringify(finalData));
      console.log('✅ [SaveDataOptionUser] localStorage SAVE THÀNH CÔNG (FALLBACK MODE)');
      if (callback) callback(true, null);
    } catch (e) {
      console.error('❌ [SaveDataOptionUser] localStorage SAVE THẤT BẠI:', e);
      if (callback) callback(false, e);
    }
  }
}

/**
 * Thêm 1 item vào dataOptionUser
 * Item structure: {domain, service_type, project, zalo_group_id, fanpage_id, ...}
 * @param {Object} item - Item cần thêm
 * @param {Function} callback - callback(success, error)
 */
function addToDataOptionUser(item, callback) {
  const data = loadDataOptionUser();
  const newItem = {
    id: generateId(),
    timestamp: Date.now(),
    ...item
  };
  data.push(newItem);
  saveDataOptionUser(data, callback);
  return newItem;
}

// ===== LƯỚI TRỮ THÔNG TIN LỰA CHỌN CHẠY ZALO =====
// Khi chạy group Zalo, người dùng sẽ chọn:
// - domain (tên miền đích)
// - service_type (loại dịch vụ)
// - project (dự án - nếu có)
// - zalo_group_id (nhóm Zalo để post)
// - fanpage_id (fanpage Facebook để post)
// -> Lưu vào localStorage để sử dụng khi tự động post


// ===== GLOBAL STATE FOR UI MANAGEMENT =====
let uiMutationObserver = null;
let isThemeRefreshing = false;

// ===== ZALO DEBUG HELPERS =====
/**
 * Debug helpers cho Zalo Scanner
 */
const ZaloDebugHelpers = {
  /**
   * Bật dev tools của webview Zalo để xem console logs
   */
  enableWebviewDevTools: () => {
    const webviewId = window.zaloScannerWebviewId;
    const webview = document.getElementById(webviewId);
    if (webview && webview.showDevTools) {
      webview.showDevTools(true);
      console.log(`✅ Webview dev tools opened: ${webviewId}`);
      console.log(`👀 Check console tab (Inspector) để xem debug logs từ Zalo quét`);
    } else {
      console.warn(`⚠️ Webview dev tools không available`);
    }
  },
  
  /**
   * Dump HTML structure của một chat item để debug
   */
  dumpChatItemStructure: () => {
    const chatItem = document.querySelector('.chat-item');
    if (!chatItem) {
      console.warn('⚠️ Không tìm thấy .chat-item');
      return;
    }
    console.group('📋 Chat Item Structure:');
    console.log(chatItem.outerHTML.substring(0, 1500));
    console.groupEnd();
  },
  
  /**
   * List tất cả img elements của một message
   */
  dumpImages: () => {
    const wrap = document.querySelector('.message-wrapper');
    if (!wrap) {
      console.warn('⚠️ Không tìm thấy .message-wrapper');
      return;
    }
    
    const allImgs = wrap.querySelectorAll('img');
    console.log(`🖼️ Total images: ${allImgs.length}`);
    
    allImgs.forEach((img, idx) => {
      console.log(`[${idx}] class="${img.className}" src="${img.src?.substring(0, 80)}" w=${img.naturalWidth} h=${img.naturalHeight}`);
    });
  },
  
  /**
   * Quét 1 tin nhắn test
   */
  testScanMessage: async () => {
    if (!window.zaloScanGroupFromWebview) {
      console.warn('⚠️ zaloScanGroupFromWebview không available');
      return;
    }
    
    console.log('🧪 Testing message scan...');
    try {
      const webviewId = window.zaloScannerWebviewId;
      const messages = await window.zaloScanGroupFromWebview(webviewId, 'Test');
      console.log('📊 Scanned messages:', messages);
      return messages;
    } catch (err) {
      console.error('❌ Scan test failed:', err);
    }
  }
};

// ===== EXPORT TO WINDOW =====
window.FacebookAutoPost = {
  config: FACEBOOK_CONFIG,
  state: facebookState,
  createUI: createFacebookPostUI,
  createPrompt: createFacebookPostPrompt,
  createPromptWithCreative: createFacebookPostPromptWithCreative,
  getTrendingHashtags: getFacebookTrendingHashtags,
  parseAIResponse: parseFacebookAIResponse,
  postToPage: postToFacebookPage,
  startAuto: startFacebookAutoPosting,
  stopAuto: stopFacebookAutoPosting
};

// Export Zalo debug helpers
window.ZaloDebug = ZaloDebugHelpers;

console.log('✅ Zalo Debug Helpers loaded!');
console.log('   window.ZaloDebug.enableWebviewDevTools()');
console.log('   window.ZaloDebug.dumpImages()');
console.log('   window.ZaloDebug.dumpChatItemStructure()');
console.log('   window.ZaloDebug.testScanMessage()');


// ===== AUTO INIT ALL UI =====
/**
 * Khởi tạo tất cả giao diện tự động
 * Gồm 3 modules chính:
 * 1. Multi-Domain Content Manager (ensureUI)
 * 2. Service Content Generator (ensureServiceContentUI)
 * 3. Facebook Auto Post (createFacebookPostUI)
 */
function initAllUI() {
  console.log('🚀 Initializing all UI modules...');
  
  let uiInitAttempts = 0;
  const maxAttempts = 10;
  
  // Retry mechanism - thử khởi tạo UI mỗi giây
  const initInterval = setInterval(async () => {
    uiInitAttempts++;
    
    try {
      // Kiểm tra #context-auto đã có chưa
      const contextAuto = document.getElementById('context-auto');
      if (!contextAuto) {
        console.log(`⏳ Waiting for #context-auto (attempt ${uiInitAttempts})...`);
        return;
      }
      
      // Khởi tạo từng UI module
      const globalSettings = document.getElementById('global-settings-panel');
      const multiDomainUI = document.getElementById('multi-domain-ui');
      const serviceContentUI = document.getElementById('service-content-ui');
      const facebookUI = document.getElementById('facebook-post-ui');
      
      // Tạo Global Settings Panel đầu tiên (quan trọng!)
      if (!globalSettings) {
        console.log('⚙️ Creating Global Settings Panel...');
        await ensureGlobalSettingsPanel();
      }
      
      if (!multiDomainUI) {
        console.log('📝 Creating Multi-Domain UI...');
        await ensureUI();
      }
      
      if (!serviceContentUI) {
        console.log('✨ Creating Service Content UI...');
        await ensureServiceContentUI();
      }
      
      if (!facebookUI) {
        console.log('📱 Creating Facebook Post UI...');
        createFacebookPostUI();
      }
      
      // Nếu tất cả UI đã có, dừng interval
      const allUIReady = globalSettings && multiDomainUI && serviceContentUI && facebookUI;
      if (allUIReady || uiInitAttempts >= maxAttempts) {
        clearInterval(initInterval);
        console.log('✅ All UI modules initialized');
      }
      
    } catch (error) {
      console.error('❌ Error initializing UI:', error);
    }
  }, 1000);

  // Monitor DOM changes để tự động tạo lại UI nếu React xóa
  if (typeof MutationObserver !== 'undefined') {
    uiMutationObserver = new MutationObserver(() => {
      // Skip if theme is refreshing
      if (isThemeRefreshing) return;
      
      const contextAuto = document.getElementById('context-auto');
      if (!contextAuto) return;
      
      // Kiểm tra và tạo lại các UI bị mất
      const globalSettings = document.getElementById('global-settings-panel');
      const multiDomainUI = document.getElementById('multi-domain-ui');
      const serviceContentUI = document.getElementById('service-content-ui');
      const facebookUI = document.getElementById('facebook-post-ui');
      
      if (!globalSettings) {
        console.log('🔄 Global Settings Panel was removed, recreating...');
        setTimeout(() => ensureGlobalSettingsPanel(), 100);
      }
      
      if (!multiDomainUI) {
        console.log('🔄 Multi-Domain UI was removed, recreating...');
        setTimeout(() => ensureUI(), 100);
      }
      
      if (!serviceContentUI) {
        console.log('🔄 Service Content UI was removed, recreating...');
        setTimeout(() => ensureServiceContentUI(), 100);
      }
      
      if (!facebookUI) {
        console.log('🔄 Facebook UI was removed, recreating...');
        setTimeout(() => createFacebookPostUI(), 100);
      }
    });
    
    // Bắt đầu theo dõi sau 2 giây
    setTimeout(() => {
      uiMutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log('👁️ MutationObserver watching all UI modules');
      
      // Setup theme listener AFTER MutationObserver starts to avoid conflicts
      setupThemeChangeListener();
    }, 2000);
  }
}

// ===== THEME CHANGE LISTENER =====
/**
 * Listen for theme changes and refresh all UI modules
 */
function setupThemeChangeListener() {
  let refreshTimeout = null;
  
  // Debounced function to refresh all UI
  const refreshAllUI = () => {
    // Prevent multiple simultaneous refreshes
    if (isThemeRefreshing) {
      console.log('⏭️ Refresh already in progress, skipping...');
      return;
    }
    
    // Clear any pending refresh
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    
    // Schedule refresh with debounce
    refreshTimeout = setTimeout(async () => {
      isThemeRefreshing = true;
      console.log('🎨 Theme changed, refreshing all UI modules...');
      
      try {
        // Temporarily disconnect MutationObserver to avoid conflicts
        if (uiMutationObserver) {
          uiMutationObserver.disconnect();
        }
        
        // Remove existing UI elements
        const elementsToRefresh = [
          'global-settings-panel',
          'multi-domain-ui', 
          'service-content-ui',
          'facebook-post-ui'
        ];
        
        elementsToRefresh.forEach(id => {
          const element = document.getElementById(id);
          if (element) {
            element.remove();
          }
        });
        
        // Wait a bit for DOM to settle
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Recreate UI with new theme
        await ensureGlobalSettingsPanel();
        await ensureUI();
        await ensureServiceContentUI();
        createFacebookPostUI();
        
        console.log('✅ UI refresh completed');
        
        // Reconnect MutationObserver after a delay
        setTimeout(() => {
          if (uiMutationObserver) {
            uiMutationObserver.observe(document.body, {
              childList: true,
              subtree: true
            });
          }
        }, 500);
        
      } catch (error) {
        console.error('❌ Error refreshing UI:', error);
      } finally {
        isThemeRefreshing = false;
      }
    }, 300); // 300ms debounce
  };
  
  // Listen to data-theme attribute changes on html element
  const htmlElement = document.documentElement;
  const themeObserver = new MutationObserver((mutations) => {
    const hasThemeChange = mutations.some(mutation => 
      mutation.type === 'attributes' && 
      (mutation.attributeName === 'data-theme' || mutation.attributeName === 'class')
    );
    
    if (hasThemeChange) {
      refreshAllUI();
    }
  });
  
  themeObserver.observe(htmlElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class']
  });
  
  // Listen to system prefers-color-scheme changes
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkModeMediaQuery.addEventListener) {
    darkModeMediaQuery.addEventListener('change', refreshAllUI);
  } else if (darkModeMediaQuery.addListener) {
    // Fallback for older browsers
    darkModeMediaQuery.addListener(refreshAllUI);
  }
  
  console.log('👁️ Theme change listener initialized');
}

// Auto-init when script loads
initAllUI();