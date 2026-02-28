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
 *    - my-pham-lam-dep: Mỹ Phẩm - Làm Đẹp
 *    - dat-lich-online: Đặt Lịch Online
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
const DEFAULT_UPLOAD_ENDPOINT = "/upload";

// Domain Options
const DOMAIN_OPTIONS = {
  phanmemmottrieu: {
    value: "phanmemmottrieu.net,localhost:3333",
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
    image: "https://www.phanmemmottrieu.net/app_images/services/bat-dong-san-og.jpg",
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
  "my-pham-lam-dep": {
    name: "Mỹ Phẩm - Làm Đẹp",
    name_en: "Beauty & Cosmetics",
    name_zh: "美容化妆品",
    category: "Mỹ Phẩm & Làm Đẹp",
    category_en: "Beauty & Cosmetics",
    category_zh: "美容化妆品",
    image: "https://www.phanmemmottrieu.net/app_images/services/lam-dep-my-pham-og.jpg",
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
  "dat-lich-online": {
    name: "Đặt Lịch Online",
    name_en: "Online Booking",
    name_zh: "在线预订",
    category: "Đặt Lịch Online",
    category_en: "Online Booking",
    category_zh: "在线预订",
    image: "https://www.phanmemmottrieu.net/app_images/services/booking-online-og.jpg",
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
    image: "https://www.phanmemmottrieu.net/app_images/services/phan-mem-og.jpg",
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
    image: "https://www.phanmemmottrieu.net/app_images/services/cho-thue-xe-og.jpg",
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
  } else if (industry === "my-pham-lam-dep") {
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
  } else if (industry === "dat-lich-online") {
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

// ===== HELPER FUNCTIONS =====
function replaceContactInfo(text, opts = {}) {
  if (!text) return text;
  
  const phone = opts.phone || LMKT_CONTACT_PHONE;
  const name = opts.name || LMKT_CONTACT_NAME;
  
  let result = String(text);
  
  // Thay thế số điện thoại
  // Patterns: 0xxx xxx xxxx, (+84)9xx xxx xxxx, 09xxxxxxxx, etc.
  result = result.replace(/\b0\d{9,10}\b/g, phone);
  result = result.replace(/\(\+84\)\s*\d{1,2}\s*\d{3,4}\s*\d{3,4}/g, phone);
  result = result.replace(/\+84\s*\d{1,2}\s*\d{3,4}\s*\d{3,4}/g, phone);
  
  // Thay thế tên liên hệ
  // Patterns: Liên hệ: XXX, Mr/Mrs XXX, Anh/Chị XXX
  result = result.replace(/(?:Liên hệ|Contact|Ms|Mr|Mrs|Anh|Chị|Bà|Ông)\s+[A-ỦZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ][a-ủzàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]*/gi, `${name}`);
  
  return result;
}

function encodeHtml(html) {
  if (!html) return html;
  let encoded = String(html);
  try {
      encoded = encodeURIComponent(encoded);
  } catch (e) {
    console.error('[encodeHtml] URL encode failed:', e);
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
  
  return `
[SYSTEM CONFIG]: Seed_${randomSeed} | Pattern_${selectedPatternKey} | Persona_${selectedPersonaKey} | SellingIntent_${selectedSellingIntentType}
[TOPIC]: "${topic}"
[INDUSTRY]: ${industry}

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
  "tags": ["${industry}"]
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

function extractImagesFromMessage(item = {}) {
  const images = [];
  let debugInfo = [];

  if (Array.isArray(item.images)) {
    images.push(...item.images);
    debugInfo.push(`item.images: ${item.images.length}`);
  }
  if (Array.isArray(item.imageUrls)) {
    images.push(...item.imageUrls);
    debugInfo.push(`item.imageUrls: ${item.imageUrls.length}`);
  }
  if (Array.isArray(item.image_urls)) {
    images.push(...item.image_urls);
    debugInfo.push(`item.image_urls: ${item.image_urls.length}`);
  }
  if (Array.isArray(item.photos)) {
    images.push(...item.photos);
    debugInfo.push(`item.photos: ${item.photos.length}`);
  }

  if (typeof item.image === "string") {
    images.push(item.image);
    debugInfo.push('item.image: 1');
  }
  if (typeof item.imageUrl === "string") {
    images.push(item.imageUrl);
    debugInfo.push('item.imageUrl: 1');
  }

  // Facebook-style attachments
  if (Array.isArray(item.attachments)) {
    let count = 0;
    item.attachments.forEach(att => {
      const src = att?.media?.image?.src || att?.media?.image || att?.url;
      if (typeof src === "string") {
        images.push(src);
        count++;
      }
    });
    if (count > 0) debugInfo.push(`item.attachments: ${count}`);
  }

  if (Array.isArray(item.attachments?.data)) {
    let count = 0;
    item.attachments.data.forEach(att => {
      const src = att?.media?.image?.src || att?.media?.image || att?.url;
      if (typeof src === "string") {
        images.push(src);
        count++;
      }
    });
    if (count > 0) debugInfo.push(`item.attachments.data: ${count}`);
  }

  const text = item.content || item.text || "";
  const base64Images = extractBase64ImagesFromText(text);
  if (base64Images.length > 0) {
    images.push(...base64Images);
    debugInfo.push(`base64 from text: ${base64Images.length}`);
  }

  // Validate URLs before returning
  const validImages = Array.from(new Set(
    images.filter(img => {
      if (typeof img !== 'string' || !img.trim()) return false;
      try {
        // Check if it's a valid URL or data URI
        return img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:');
      } catch (e) {
        return false;
      }
    })
  ));
  
  if (validImages.length > 0) {
    console.log(`✅ extractImagesFromMessage: Found ${validImages.length} valid image(s) [${debugInfo.join(', ')}]`);
    console.log(`   First 3 URLs:`, validImages.slice(0, 3));
  } else if (debugInfo.length > 0) {
    console.warn(`⚠️ extractImagesFromMessage: Found ${images.length} raw images but 0 valid after filter. Sources: [${debugInfo.join(', ')}]`);
  }
  
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

function getFirstImageFromJsonInput() {
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
  
  return jsonArray.filter(msg => {
    const hasContent = extractMessageText(msg).length > 0;
    const hasImages = extractImagesFromMessage(msg).length > 0;
    return hasContent && hasImages;
  });
}

function parseFacebookJson(jsonArray) {
  if (!Array.isArray(jsonArray)) throw new Error("JSON phải là mảng");
  
  return jsonArray.filter(item => {
    const imgCount = parseInt(item.imageCount) || extractImagesFromMessage(item).length || 0;
    const hasText = extractMessageText(item).length > 0;
    return imgCount > 0 && hasText;
  });
}

// ===== UPLOAD IMAGES =====
async function uploadBase64Image(base64, filename, ctx) {
  if (!base64 || base64.endsWith("...")) {
    throw new Error("Ảnh base64 chưa đầy đủ");
  }

  const name = (filename || `img-${Date.now()}.png`).toLowerCase().replace(/\s+/g, "-");
  
  const res = await fetch(DEFAULT_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: ctx.app_id, name, src: base64 })
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const path = await res.text();
  return path.startsWith("/") ? path : `/${path}`;
}

async function uploadImages(ctx, images) {
  const arr = Array.isArray(images) ? images : [];
  const isBase64 = (s = "") => /^data:image\//i.test(s);
  
  console.log(`[uploadImages] Bắt đầu upload ${arr.length} ảnh - ${new Date().toLocaleTimeString()}`);
  
  const tasks = arr.map((img, i) => {
    if (!img) return Promise.resolve("");
    if (!isBase64(img)) return Promise.resolve(img);
    return uploadBase64Image(img, `upload-${Date.now()}-${i}.png`, ctx);
  });
  
  const results = await Promise.all(tasks);
  console.log(`[uploadImages] Hoàn tất upload ${results.filter(r => r).length}/${arr.length} ảnh - ${new Date().toLocaleTimeString()}`);
  
  return results;
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
function buildDetail(ctx, seo, imgs, opts) {
  const now = new Date().toISOString();
  const slug = generateSlug(seo?.title || "bai-viet");
  
  // AI đã trả về tất cả các trường - chỉ cần lấy từ seo
  const titleVi = seo?.title || "Bài viết";
  const titleEn = seo?.title_en || titleVi;
  const titleZh = seo?.title_zh || titleVi;
  
  // Lấy serviceType và propertyType, transactionType từ AI
  const propertyType = seo?.propertyType || "tat-ca";
  const transactionType = seo?.transactionType || "ban";
  const serviceType = opts.service_type || "bat-dong-san";
  
  // Lấy description từ format mới hoặc cũ
  const descriptionVi = seo?.description_vi || seo?.description || "";
  const descriptionEn = seo?.description_en || seo?.description || "";
  const descriptionZh = seo?.description_zh || seo?.description || "";
  
  // Mã hoá CONTENT (HTML) cho cả 3 ngôn ngữ - MATCH CsmEditModal.tsx logic:
  // Bước 1: Encrypt, Bước 2: URL encode
  const encodedContentVi = encodeHtml(seo?.content || "", { encrypt: true, urlEncode: true });
  const encodedContentEn = encodeHtml(seo?.content_en || "", { encrypt: true, urlEncode: true });
  const encodedContentZh = encodeHtml(seo?.content_zh || "", { encrypt: true, urlEncode: true });
  
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
  
  // Ảnh đại diện phải trùng với ảnh đầu tiên trong chi tiết bài viết
  const featuredImage = Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : "";
  
  return {
    id: generateId(),
    service_type: serviceType,
    service_code: serviceType,
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
    images: JSON.stringify(imgs || []),
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
  
  const where = {
    operator: "AND",
    conditions: [
      { field: "slug", type: "eq", value: detail.slug },
      { field: "domain", type: "eq", value: detail.domain }
    ]
  };
  
  const rows = await ctx.helperApi.getTableData({
    app_id: ctx.app_id,
    obj_name: "web_service_detail",
    where,
    take: 1
  }).catch(() => ({ rows: [] }));
  
  console.log(`[upsertDetail] Đã kiểm tra xong - ${new Date().toLocaleTimeString()}`);
  
  const existing = (rows.rows || rows.data || [])[0];
  const objUpdate = existing ? { ...existing, ...detail } : detail;
  const command = existing ? "update" : "create";
  
  console.log(`[upsertDetail] Đang ${command} bài viết "${detail.title}" - ${new Date().toLocaleTimeString()}`);
  
  const result = await ctx.helperApi.updateTableData({
    app_id: ctx.app_id,
    obj_name: "web_service_detail",
    command,
    obj_update: objUpdate,
    pk_fields: ["slug", "domain", "status"]
  });
  
  console.log(`[upsertDetail] ${command} thành công - ${new Date().toLocaleTimeString()}`);
  
  return result;
}

// ===== PROCESS ZALO/FACEBOOK =====
async function processContent(item, opts = {}) {
  const ctx = resolveContext();
  ctx.app_id = opts.app_id || ctx.app_id;
  ctx.domain = opts.domain || ctx.domain;
  
  const industry = opts.industry || "bat-dong-san";
  const content = item.content || item.text || "";
  const images = extractImagesFromMessage(item);
  
  if (!content.trim()) throw new Error("Nội dung trống");
  
  console.log(`[processContent] Bắt đầu xử lý - ${new Date().toLocaleTimeString()}`);
  
  thongbao("🖼️ Đang upload ảnh...");
  const uploadedImages = await uploadImages(ctx, images);
  console.log(`[processContent] Upload ảnh xong - ${uploadedImages.length} ảnh - ${new Date().toLocaleTimeString()}`);
  
  thongbao("🤖 Đang tạo nội dung (Chống Chất AI)...");
  const articleHistory = getArticleHistory(opts.domainKey || "phanmemmottrieu", industry);
  
  // Lấy ĐÚNG PATH từ backend (lọc bỏ base64 nếu có), chỉ lấy 2-3 hình để bài cân đối
  const imagesToPrompt = uploadedImages
    .filter(img => img && !img.startsWith('data:')) // Chỉ lấy path, bỏ base64
    .slice(0, 3);
  
  console.log(`[DEBUG] Images to prompt:`, imagesToPrompt);
  
  // QUAN TRỌNG: Thêm timestamp để tránh cache hit khi prompt giống nhau
  // Backend có cache response 1 giờ, nếu prompt giống nhau sẽ trả về kết quả cũ
  const uniqueSeed = `[UNIQUE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}]`;
  const prompt = getAntiAIPrompt(industry, content, articleHistory, {
    domainKey: opts.domainKey
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
  
  const startAI = Date.now();
  const result = await generateFn(prompt);
  const durationAI = ((Date.now() - startAI) / 1000).toFixed(1);
  
  console.log(`[processContent] ✅ AI trả về - Mất ${durationAI}s - ${new Date().toLocaleTimeString()}`);
  console.log(`[DEBUG] AI Result:`, result);
  console.log(`[DEBUG] result.success:`, result?.success);
  console.log(`[DEBUG] result.message:`, result?.message);
  console.log(`[DEBUG] result.result:`, result?.result);
  console.log(`[DEBUG] result.data:`, result?.data);
  
  if (!result) {
    throw new Error("AI trả về null/undefined");
  }
  
  if (!result.success) {
    throw new Error(`AI failed: ${result.message || 'Không có message'}`);
  }
  
  const seo = result.result || result.data;
  console.log(`[DEBUG] SEO object:`, seo);
  
  if (!seo) {
    throw new Error("AI response không có result/data - Response trắng!");
  }
  const detail = buildDetail(ctx, seo, uploadedImages, {
    author: opts.author || "Auto Content",
    featured: opts.featured || false,
    activeHome: true,
    priority: opts.priority || 10,
    service_type: industry,
    avatar: opts.avatar
  });
  
  thongbao("💾 Đang lưu dữ liệu...");
  console.log(`[processContent] Lưu DB - ${new Date().toLocaleTimeString()}`);
  await upsertDetail(ctx, detail);
  console.log(`[processContent] Lưu DB xong - ${new Date().toLocaleTimeString()}`);
  
  saveArticleToHistory(opts.domainKey || "phanmemmottrieu", industry, detail.title, detail.slug);
  
  console.log(`[processContent] Hoàn tất - ${new Date().toLocaleTimeString()}`);
  return { detail, result };
}

// ===== LMKT CATEGORY INSERTION =====
async function insertLmktCategory(cat, ctx) {
  const where = {
    operator: "AND",
    conditions: [
      { field: "service_code", type: "eq", value: cat.service_code },
      { field: "domain", type: "eq", value: (cat.domain || "h-holding.vn,h-holding.com.vn").split(",")[0] }
    ]
  };
  
  const rows = await ctx.helperApi.getTableData({
    app_id: ctx.app_id,
    obj_name: "web_service_category",
    where,
    take: 1
  }).catch(() => ({ rows: [] }));
  
  const existing = (rows.rows || rows.data || [])[0];
  const command = existing ? "update" : "create";
  const objUpdate = existing ? { ...existing, ...cat } : cat;
  
  return ctx.helperApi.updateTableData({
    app_id: ctx.app_id,
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

async function runMessages(messages) {
  const ctx = resolveContext();
  let ok = 0, fail = 0;
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    try {
      thongbao(`🔄 Đang xử lý tin ${i + 1}/${messages.length}...`);
      const domainConfig = DOMAIN_OPTIONS["phanmemmottrieu"];
      await processContent(msg, {
        app_id: ctx.app_id,
        domain: domainConfig.value,
        domainKey: "phanmemmottrieu",
        industry: "bat-dong-san",
        author: "Zalo Bot"
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
    option.value = proj.id;
    option.textContent = proj.name;
    projectSelect.appendChild(option);
  });
  
  projectRow.appendChild(projectLabel);
  projectRow.appendChild(projectSelect);
  
  return { row: projectRow, select: projectSelect };
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
  };
  domainSelect.onchange(); // Init

  // Append rows to grid container
  settingsContainer.append(domainRow, industryRow, projectRow);
  
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
  note.style.cssText = `margin-bottom:12px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:12px;color:${theme.info};`;
  note.innerHTML = "💡 <strong>Tip:</strong> Sử dụng Domain/Lĩnh vực từ <strong>Cài Đặt Chung</strong> ở trên";

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
      const items = JSON.parse(content);
      const arr = Array.isArray(items) ? items : [items];
      
      if (!confirm(`Tạo ${arr.length} bài viết? (Chạy TUẦN TỰ từng bài, mỗi bài hoàn tất (AI + lưu DB + đưa lên Facebook) rồi chờ 120 giây trước bài tiếp)`)) return;
      
      // Bắt đầu processing
      isProcessing = true;
      createBtn.disabled = true;
      createBtn.textContent = "🔒 Đang xử lý...";
      
      console.log(`\n========== BẮT ĐẦU XỬ LÝ ${arr.length} BÀI VIẾT (TUẦN TỰ, DELAY 120s giữa các bài) - ${new Date().toLocaleTimeString()} ==========`);
      
      let ok = 0, fail = 0;
      for (let i = 0; i < arr.length; i++) {
        console.log(`\n--- BÀI ${i + 1}/${arr.length} - BẮT ĐẦU - ${new Date().toLocaleTimeString()} ---`);
        try {
          thongbao(`🔄 [${i + 1}/${arr.length}] Đang xử lý...`);
          await processContent(arr[i], {
            app_id: domainConfig.app_id,
            domain: domainConfig.value,
            domainKey: globalSettings.domainKey,
            industry: globalSettings.isLmkt ? globalSettings.project : globalSettings.industry,
            author: globalSettings.isLmkt ? "LMKT Expert" : "Auto Content",
            avatar: globalSettings.isLmkt ? "https://h-holding.vn/media/icon.png" : undefined
          });
          ok++;
          console.log(`--- BÀI ${i + 1}/${arr.length} - THÀNH CÔNG - ${new Date().toLocaleTimeString()} ---`);
          thongbao(`✅ [${i + 1}/${arr.length}] Đăng lên Facebook hoàn tất!`);
        } catch (e) {
          fail++;
          console.error(`--- BÀI ${i + 1}/${arr.length} - LỖI - ${new Date().toLocaleTimeString()} ---`, e);
          canhbao(`❌ [${i + 1}/${arr.length}] Lỗi: ${e.message}`);
        }
        
        // Delay sau mỗi bài (trừ bài cuối cùng)
        if (i < arr.length - 1) {
          const remaining = arr.length - i - 1;
          const delayMs = FACEBOOK_POST_COOLDOWN_MIN_MS; // Lấy từ config constant
          const delaySecs = Math.round(delayMs / 1000);
          
          thongbao(`✅ BÀI ${i + 1}/${arr.length} HOÀN TẤT (Đăng Facebook)! ⏳ Chờ ${delaySecs} giây trước bài tiếp (${remaining} bài còn lại)...`);
          console.log(`[${i + 1}/${arr.length}] ✅ Đăng Facebook thành công! Chờ ${delaySecs} giây rồi tiếp bài tiếp...`);
          
          // Hiển thị countdown
          const countdownInterval = Math.max(1, Math.floor(delaySecs / 10));
          for (let wait = delaySecs; wait > 0; wait -= countdownInterval) {
            if (wait > countdownInterval) {
              await new Promise(r => setTimeout(r, countdownInterval * 1000));
              thongbao(`⏳ Còn lại ${Math.max(0, wait - countdownInterval)} giây trước bài tiếp...`);
            } else {
              await new Promise(r => setTimeout(r, wait * 1000));
            }
          }
          
          console.log(`[${i + 1}/${arr.length}] Chờ xong, bắt đầu bài ${i + 2}/${arr.length}...`);
        }
      }
      
      console.log(`\n========== KẾT THÚC - ${new Date().toLocaleTimeString()} ==========`);
      thongbao(`✅ Hoàn tất! Thành công: ${ok}, Lỗi: ${fail}`);
    } catch (e) {
      console.error("Lỗi parse JSON:", e);
      canhbao(`❌ JSON không hợp lệ: ${e.message}`);
    } finally {
      // Kết thúc processing
      isProcessing = false;
      createBtn.disabled = false;
      createBtn.textContent = "✍️ Tạo Bài";
    }
  };

  clearHistoryBtn.onclick = () => confirm("Xóa lịch sử?") && clearArticleHistory();

  btnRow.append(uploadZaloBtn, uploadFbBtn, createBtn, clearHistoryBtn);
  wrapper.append(title, note, textarea, btnRow, zaloFileInput, fbFileInput);

  try {
    await waitForContextAuto();
    const container = ensureUnifiedUIContainer();
    if (container) container.appendChild(wrapper);
    else canhbao("Không tìm thấy #context-auto");
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
    return LMKT_PROJECT_DEFS.map(p => ({
      id: p.service_code,
      service_code: p.service_code,
      slug: p.service_code,
      group_slug: "du-an",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      name: p.name,
      description: `Dự án bất động sản: ${p.name}`,
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
      description: ind.attributes_description || ind.description || ind.prompt_focus || '',
      type: 'industry',
      config: ind
    }));
  }
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
 *   6. Kết hợp với user custom prompt
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
    const industryConfig = INDUSTRY_TYPES["bat-dong-san"];
    basePrompt = `
========== LANDING PAGE CONTENT FOR ${categoryData.name.toUpperCase()} ==========
SEED: ${promptSeed} (KHÔNG ĐƯỢC IN RA TRONG OUTPUT)

🎭 ROLE: Bạn là ${industryConfig.prompt_role}
📝 STYLE: ${industryConfig.prompt_style}
⚠️  AVOID: ${industryConfig.prompt_avoid}
🎯 FOCUS: ${industryConfig.prompt_focus || 'Nhấn mạnh lợi ích cụ thể'}

PROJECT: ${categoryData.name}
DESCRIPTION: Dự án bất động sản

USER REQUEST: ${userCustomPrompt || '(Không có yêu cầu bổ sung)'}

========== STRICT RULES ==========
❗ content_en và content_zh BẮT BUỘC khác content (dịch đúng ngôn ngữ)
❗ description/description_en/description_zh phải là mô tả đúng nghĩa (1-2 câu), KHÔNG dùng lại prompt_focus
❗ category/category_en/category_zh bắt buộc đủ 3 ngôn ngữ
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
    const config = categoryData.config || INDUSTRY_TYPES[categoryData.slug];
    basePrompt = `
========== LANDING PAGE CONTENT FOR ${categoryData.name.toUpperCase()} ==========
SEED: ${promptSeed} (KHÔNG ĐƯỢC IN RA TRONG OUTPUT)

🎭 ROLE: Bạn là ${config.prompt_role}
📝 STYLE: ${config.prompt_style}
⚠️  AVOID: ${config.prompt_avoid}
🎯 FOCUS: ${config.prompt_focus}

INDUSTRY: ${categoryData.name} (${config.name_en} / ${config.name_zh})

USER REQUEST: ${userCustomPrompt || '(Không có yêu cầu bổ sung)'}

========== STRICT RULES ==========
  **** BẮT BUỘC TRƯỚC KHI TRẢ JSON:
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
function getCategoryContentPrompt(categoryName, description, prompt, domainKey = '', categoryData = {}) {
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

  const selectedAngle = contentAngles[Math.floor(Math.random() * contentAngles.length)];
  const selectedPersona = agePersonas[Math.floor(Math.random() * agePersonas.length)];

  return `
[UNIQUE_ID]: ${randomSeed}
[TASK]: Landing page "${categoryName}"
[DESC]: ${description}
[ANGLE]: ${selectedAngle}
[PERSONA]: ${selectedPersona.label} - ${selectedPersona.tone}
[FOCUS]: ${selectedPersona.focus}
[USER]: ${prompt || 'Tự do sáng tạo'}

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
  
  const where = {
    operator: "AND",
    conditions: [
      { field: "slug", type: "eq", value: categorySlug },
      { field: "domain", type: "eq", value: ctx.domain }
    ]
  };
  
  // Chuẩn bị dữ liệu cập nhật
  const rawContent = encodeHtml(contentData.content, { encrypt: false }) || '';
  const rawContentEn = encodeHtml(contentData.content_en, { encrypt: false }) || '';
  const rawContentZh = encodeHtml(contentData.content_zh, { encrypt: false }) || '';

  const objUpdate = {
    ...existing,
    // Encode HTML before saving (same flow as detail page)
    content: rawContent,
    content_en: rawContentEn,
    content_zh: rawContentZh,
    updated_at: new Date().toISOString()
  };
  
  console.log(`[upsertServiceCategoryContent] Cập nhật web_services.${categorySlug}`);
  
  const result = await ctx.helperApi.updateTableData({
    app_id: ctx.app_id,
    obj_name: "web_services",
    command: "update",
    obj_update: objUpdate,
    pk_fields: ["slug", "domain", "status"]
  });
  
  console.log(`[upsertServiceCategoryContent] Cập nhật thành công - ${new Date().toLocaleTimeString()}`);
  return result;
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
  
  const prompt = getCategoryContentPrompt(categoryName, description, userPrompt, domainKey, categoryData);
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
  note.innerHTML = "💡 <strong>Tip:</strong> Sử dụng Domain/Lĩnh vực từ <strong>Cài Đặt Chung</strong> ở trên";
  
  // Button: Sync Categories
  const syncBtn = document.createElement("button");
  syncBtn.textContent = "🔄 Sync Categories";
  syncBtn.title = "Cập nhật tất cả lĩnh vực/dự án lên database";
  syncBtn.style.cssText = `padding:6px 12px;background:#52c41a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;
  
  syncBtn.onmouseover = () => {
    syncBtn.style.background = '#45a017';
  };
  
  syncBtn.onmouseout = () => {
    syncBtn.style.background = '#52c41a';
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
  
  // Create row for sync button
  const syncRow = document.createElement("div");
  syncRow.style.cssText = "margin-bottom:12px;display:flex;gap:8px;align-items:center";
  syncRow.appendChild(syncBtn);

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

  // Helper: Update info display based on global settings
  function updateInfoDisplay() {
    const globalSettings = getGlobalSettings();
    const domainLabel = DOMAIN_OPTIONS[globalSettings.domainKey]?.label || 'Chưa biết';
    const industryLabel = INDUSTRY_TYPES[globalSettings.industry]?.name || 'Chưa chọn';
    const projectLabel = LMKT_PROJECT_DEFS.find(p => p.service_code === globalSettings.project)?.name || 'Chưa chọn';
    
    if (globalSettings.isLmkt) {
      infoContent.innerHTML = `<strong>🏢 Domain:</strong> ${domainLabel} | <strong>🏗️ Dự án:</strong> ${projectLabel} | <strong>🏢 Lĩnh vực:</strong> ${industryLabel}`;
    } else {
      infoContent.innerHTML = `<strong>🏢 Domain:</strong> ${domainLabel} | <strong>🏢 Lĩnh vực:</strong> ${industryLabel}`;
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

  // Event: Create content
  createBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    const userPrompt = textarea.value.trim();
    
    // ===== VALIDATION =====
    if (!globalSettings.domainKey || !globalSettings.industry || !userPrompt) {
      canhbao("❌ Vui lòng: Chọn Domain (Cài Đặt Chung) → Lĩnh Vực → Nhập Hướng Dẫn");
      return;
    }
    
    try {
      createBtn.disabled = true;
      createBtn.textContent = "⏳ Đang gọi AI (30-120s)...";
      resultArea.style.display = 'none';
      
      const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
      const industryConfig = INDUSTRY_TYPES[globalSettings.industry];
      const projectConfig = globalSettings.isLmkt 
        ? LMKT_PROJECT_DEFS.find(p => p.service_code === globalSettings.project)
        : null;
      
      console.log(`[Service Content] Domain: ${globalSettings.domainKey}, Industry: ${globalSettings.industry}${globalSettings.isLmkt ? `, Project: ${globalSettings.project}` : ''}`);
      
      // ===== BUILD ENHANCED PROMPT WITH CONTEXT =====
      let aiPrompt = userPrompt;
      
      // Nếu LMKT: sử dụng Anti-AI Prompt (với nhiều personas, patterns) + thêm context dự án
      if (globalSettings.isLmkt && projectConfig) {
        // Sử dụng hàm getAntiAIPrompt để tạo prompt với anti-chất AI logic
        // Đưa dự án + lĩnh vực vào opts để customize
        const antiAIPrompt = getAntiAIPrompt(globalSettings.industry, userPrompt, [], {
          property: projectConfig.name,
          location: projectConfig.attributes_title || projectConfig.name
        });
        
        // Thêm context dự án vào đầu prompt
        aiPrompt = `
🏗️ Dự Án: ${projectConfig.name}
🏢 Lĩnh Vực: ${industryConfig.name}

${antiAIPrompt}

[EXTRA REQUIREMENTS]
- Tiêu đề phải liên quan trực tiếp đến dự án "${projectConfig.name}"
- Nội dung phải tối ưu cho lĩnh vực "${industryConfig.name}"
- Viết từ góc nhìn nhiều độ tuổi khác nhau (đầu tư, gia đình, cư dân địa phương, business)
- Tránh nội dung giống nhau - phải sáng tạo đột phá mỗi lần
`;
      } else {
        // Phần mềm một triệu: Logic khác nhau theo lĩnh vực
        
        if (globalSettings.industry === 'bat-dong-san') {
          // ===== BẤT ĐỘNG SẢN: Parse bán/cho thuê + địa chỉ =====
          const userPromptLower = userPrompt.toLowerCase();
          const transactionType = userPromptLower.includes('cho thuê') || userPromptLower.includes('thuê') ? 'cho-thue' : 'ban';
          
          // Extract location từ prompt
          let location = 'Quận 7'; // default
          const locationMatch = userPrompt.match(/(?:quận|q\.|district|khu vực)\s*(\d+|[^\s,]+)/i);
          if (locationMatch) {
            location = locationMatch[0].trim();
          }
          
          // Sử dụng getAntiAIPrompt với transaction info
          const antiAIPrompt = getAntiAIPrompt(globalSettings.industry, userPrompt, [], {
            property: 'bất động sản',
            location: location,
            transactionType: transactionType === 'cho-thue' ? 'cho thuê' : 'bán'
          });
          
          aiPrompt = `
📍 Địa Chỉ: ${location}
💰 Loại: ${transactionType === 'cho-thue' ? 'Cho Thuê' : 'Bán'}

${antiAIPrompt}

[BĐS REQUIREMENTS]
- Nội dung linh động theo bán/cho thuê
- Tối ưu cho địa chỉ "${location}"
- Viết từ nhiều góc nhìn: investor, gia đình, business owner
- Tránh trùng lặp khi tạo lại với cùng địa chỉ
- Tiêu đề benefit-driven (không chỉ list đặc điểm)
`;
        } else {
          // ===== LĨNH VỰC KHÁC: F&B, Giáo dục, Y tế, etc =====
          const antiAIPrompt = getAntiAIPrompt(globalSettings.industry, userPrompt, [], {
            business: industryConfig.name
          });
          
          aiPrompt = `
🏢 Lĩnh Vực: ${industryConfig.name}

${antiAIPrompt}

[${industryConfig.name.toUpperCase()} REQUIREMENTS]
- Nội dung phù hợp với lĩnh vực "${industryConfig.name}"
- Viết từ nhiều góc nhìn người dùng: khách hàng, người mới, chuyên gia
- Tránh nội dung rập khuôn - sáng tạo mỗi lần
- Tiêu đề hấp dẫn, nêu rõ giá trị/lợi ích cụ thể
`;
        }
      }
      
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
      const contentData = parseAIResponse(aiResponse);
      
      if (!contentData.content) {
        throw new Error("AI trả về content rỗng");
      }

      console.log(`[Service Content] ✅ Content parse thành công - ${contentData.content.length} ký tự`);
      
      // ===== DISPLAY RESULT =====
      const displayResult = {
        ...contentData,
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
      thongbao("✅ Tạo content thành công!");
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
function parseAIResponse(rawResponse) {
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
    content: encodeHtml(result.content || '', { encrypt: true, urlEncode: true }),
    content_en: encodeHtml(result.content_en || '', { encrypt: true, urlEncode: true }),
    content_zh: encodeHtml(result.content_zh || '', { encrypt: true, urlEncode: true }),
    
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
        let config = null;
        
        // Lấy config
        if (domainKey === 'lmkt') {
          config = INDUSTRY_TYPES["bat-dong-san"];
        } else {
          config = INDUSTRY_TYPES[cat.slug];
        }
        
        // Chuẩn bị object cập nhật - giống như tin chi tiết
        const objUpdate = {
          id: cat.id || cat.service_code || cat.slug,
          service_code: cat.service_code || cat.slug,
          slug: cat.slug,
          group_slug: cat.group_slug || (domainKey === 'lmkt' ? 'du-an' : 'dich-vu'),
          is_service: typeof cat.is_service === 'boolean' ? cat.is_service : true,
          is_group_slug: typeof cat.is_group_slug === 'boolean' ? cat.is_group_slug : false,
          is_group_slug_default: typeof cat.is_group_slug_default === 'boolean' ? cat.is_group_slug_default : false,
          domain: domainValue,
          name: cat.name,
          name_en: cat.name_en,
          name_zh: cat.name_zh,
          description: cat.description || '',
          description_en: cat.description_en || '',
          description_zh: cat.description_zh || '',
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
          pk_fields: ["service_code", "domain", "status"]
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

async function facebookBackendPost(path, payload = {}) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json();
  return data;
}

// Flag để tracking FB SDK loaded
let fbSDKLoaded = false;

// ===== INDUSTRY HASHTAG DATABASE =====
const FACEBOOK_INDUSTRY_HASHTAGS = {
  "bat-dong-san": {
    trending: [
      "#BatDongSan", "#NhaDat", "#MuaBanNhaDat", "#ChoThueNhaDat",
      "#DuAnBDS", "#CanHoChungCu", "#NhaPhoDep", "#DatNen",
      "#BDSVietNam", "#DauTuBDS", "#MoiGioiBDS", "#NhaDatGiaRe"
    ],
    location: [
      "#TPHCM", "#HaNoi", "#DaNang", "#BinhDuong", "#DongNai"
    ],
    type: [
      "#CanHo", "#ChungCu", "#NhaPho", "#BietThu", "#DatNen"
    ],
    action: [
      "#CanBan", "#CanThue", "#SangNhuong", "#DauTu"
    ]
  },
  
  "my-pham-lam-dep": {
    trending: [
      "#MyPham", "#LamDep", "#SkinCare", "#BeautyTips",
      "#ChamSocDa", "#ReviewMyPham", "#TrangDiem", "#MakeUp"
    ],
    product: [
      "#SonMoi", "#KemDuong", "#SuaRuaMat", "#Serum"
    ],
    concern: [
      "#MunTrungCa", "#LaoHoa", "#ThamNam", "#DaBong"
    ]
  },
  
  "dat-lich-online": {
    trending: [
      "#DatLichOnline", "#Booking", "#DatLich", "#OnlineBooking"
    ],
    service: [
      "#DatLichKhamBenh", "#DatLichSpa", "#DatLichSalon"
    ]
  },
  
  "phan-mem": {
    trending: [
      "#PhanMem", "#Software", "#CongNghe", "#Tech"
    ],
    type: [
      "#PhanMemQuanLy", "#PhanMemKeToan", "#PhanMemBanHang"
    ]
  },
  
  "cho-thue-xe": {
    trending: [
      "#ThueXe", "#ChoThueXe", "#XeChoThue", "#CarRental"
    ],
    type: [
      "#Xe4Cho", "#Xe7Cho", "#XeDuLich"
    ]
  }
};

// ===== AI PROMPT TEMPLATES FOR FACEBOOK =====
const FACEBOOK_AI_TEMPLATES = {
  "bat-dong-san": {
    role: "Chuyên gia môi giới bất động sản kỳ cựu",
    style: "Kể chuyện về cảm xúc, ước mơ tổ ấm, tiềm năng sinh lời",
    structure: `
1. HOOK: Câu hỏi gợi mở (VD: "Bạn có bao giờ tự hỏi...")
2. STORY: Câu chuyện về giá trị sống
3. BENEFITS: 3-5 lợi ích cụ thể
4. CTA: Inbox/gọi điện/đăng ký xem
5. HASHTAGS: 8-12 hashtag
`,
    avoid: [
      "Không dùng 'Siêu phẩm', 'Vàng mười'",
      "Không liệt kê khô khan",
      "Không spam hashtag"
    ],
    focus: [
      "Cảm giác sống tại đây",
      "Phân tích dòng tiền cho nhà đầu tư",
      "Dùng con số thật"
    ]
  },
  
  "my-pham-lam-dep": {
    role: "Beauty blogger review chân thật",
    style: "Kể chuyện trải nghiệm, mô tả giác quan chi tiết",
    structure: `
1. Vấn đề da (mụn, thâm...)
2. Trải nghiệm cá nhân
3. Mô tả chi tiết (texture, smell, feeling)
4. Kết quả sau X ngày
5. Recommend: Ai nên dùng
6. CTA
7. HASHTAGS
`,
    avoid: [
      "Không dùng 'thần thánh', 'vi diệu'",
      "Không hứa kết quả không thực tế"
    ],
    focus: [
      "Mô tả texture, mùi hương",
      "Cảm giác trên da"
    ]
  },
  
  "phan-mem": {
    role: "Chuyên gia công nghệ giải thích đơn giản",
    style: "So sánh trước-sau, dùng ví dụ thực tế",
    structure: `
1. BEFORE: Vấn đề khi chưa dùng
2. AFTER: Thay đổi khi dùng
3. FEATURES: 3-5 tính năng (giải thích đơn giản)
4. ROI: Lợi ích cụ thể
5. CTA: Demo miễn phí
6. HASHTAGS
`
  }
};

// ===== FACEBOOK STATE MANAGEMENT =====
let facebookState = {
  userAccessToken: null,
  pageAccessToken: null,
  selectedPageId: null,
  selectedPageName: null,
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
  const btnAutoStart = document.getElementById('btn-fb-auto-start');
  const btnAutoStop = document.getElementById('btn-fb-auto-stop');
  
  
  if (isProcessing) {
    // Disable khi đang xử lý
    if (btnAutoStart) {
      btnAutoStart.disabled = true;
      btnAutoStart.style.opacity = '0.5';
      btnAutoStart.style.cursor = 'not-allowed';
    }
  } else {
    // Enable khi xong
    if (btnAutoStart) {
      btnAutoStart.disabled = false;
      btnAutoStart.style.opacity = '1';
      btnAutoStart.style.cursor = 'pointer';
    }
  }
  
  // Stop và Clear luôn enabled
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

function setFacebookNextAllowedPostAtWithConfig(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  const now = Date.now();
  const jitter = Math.floor(Math.random() * (max - min + 1)) + min;
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

// Load/Save state from localStorage
function loadFacebookState() {
  try {
    const saved = localStorage.getItem('facebook_post_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      facebookState = { ...facebookState, ...parsed };
    }
  } catch (e) {
    console.warn('Không thể load Facebook state:', e);
  }
}

function saveFacebookState() {
  try {
    const toSave = {
      userAccessToken: facebookState.userAccessToken,
      pageAccessToken: facebookState.pageAccessToken,
      selectedPageId: facebookState.selectedPageId,
      selectedPageName: facebookState.selectedPageName
    };
    localStorage.setItem('facebook_post_state', JSON.stringify(toSave));
  } catch (e) {
    console.warn('Không thể save Facebook state:', e);
  }
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

function getFacebookAutoIntervalMs() {
  const settings = loadFacebookAutoSettings();
  const minMs = settings.minIntervalMin * 60 * 1000;
  const maxMs = settings.maxIntervalMin * 60 * 1000;
  const jitter = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return { minMs, maxMs, jitterMs: jitter };
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
    if (!facebookState.selectedPageId || !facebookState.pageAccessToken) {
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
      `🚀 Bắt đầu tạo và đăng ${items.length} bài lên Facebook!\n\n` +
      `⏱️ Quy trình:\n` +
      `• AI tạo nội dung (~30s/bài)\n` +
      `• Đăng lên Facebook ngay\n` +
      `• Chờ ${delaySecs}s trước bài tiếp\n\n` +
      `📊 Dự kiến: ~${estimatedMinutes} phút`, 
      'info'
    );
    
    let successCount = 0;
    let failCount = 0;
    const ctx = resolveContext();

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
      showFacebookMessage(`🤖 [${i + 1}/${items.length}] Đang gọi AI tạo nội dung...`, 'info');
      const prompt = createFacebookPostPrompt(industry, productInfo, customInstructions);
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
      showFacebookMessage(`📤 [${i + 1}/${items.length}] Đang đăng lên Facebook...`, 'info');
      const result = await postToFacebookPageWithImages(
        facebookState.selectedPageId,
        facebookState.pageAccessToken,
        finalPost,
        images,
        item.link || null,
        seft
      );
      
      if (result?.success) {
        successCount++;
        recordFacebookPost(finalPost);
        showFacebookMessage(`✅ [${i + 1}/${items.length}] Đã đăng thành công!`, 'success');
      } else {
        throw new Error('Facebook API trả về lỗi');
      }
      
    } catch (error) {
      failCount++;
      console.error(`❌ Lỗi bài ${i + 1}:`, error);
      showFacebookMessage(`❌ [${i + 1}/${items.length}] Lỗi: ${error.message}`, 'error');
    }
    
    // BƯỚC 4: Delay trước bài tiếp (trừ bài cuối)
    if (i < items.length - 1) {
      const remaining = items.length - i - 1;
      showFacebookMessage(
        `⏳ Hoàn tất bài ${i + 1}! Chờ ${delaySecs}s trước bài tiếp (còn ${remaining} bài)...`, 
        'info'
      );
      
      // Hiển thị countdown
      const countdownInterval = Math.max(1, Math.floor(delaySecs / 10));
      for (let wait = delaySecs; wait > 0; wait -= countdownInterval) {
        if (wait > countdownInterval) {
          await new Promise(r => setTimeout(r, countdownInterval * 1000));
          showFacebookMessage(`⏳ Còn ${Math.max(0, wait - countdownInterval)}s...`, 'info');
        } else {
          await new Promise(r => setTimeout(r, wait * 1000));
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
  if (!facebookState.selectedPageId || !facebookState.pageAccessToken) {
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

// ===== FACEBOOK SDK INITIALIZATION =====

/**
 * Load Facebook JavaScript SDK
 */
function loadFacebookSDK() {
  return new Promise((resolve, reject) => {
    if (fbSDKLoaded) {
      resolve();
      return;
    }
    
    // Check if SDK already exists
    if (window.FB) {
      fbSDKLoaded = true;
      resolve();
      return;
    }
    
    window.fbAsyncInit = function() {
      FB.init({
        appId: FACEBOOK_CONFIG.APP_ID,
        cookie: true,
        xfbml: true,
        version: FACEBOOK_CONFIG.GRAPH_API_VERSION
      });
      
      fbSDKLoaded = true;
      console.log('✅ Facebook SDK initialized');
      resolve();
    };
    
    // Load SDK script
    (function(d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) { return; }
      js = d.createElement(s); js.id = id;
      js.src = "https://connect.facebook.net/vi_VN/sdk.js";
      js.onerror = () => reject(new Error('Failed to load Facebook SDK'));
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
  });
}

/**
 * Facebook Login với SDK (thay thế OAuth redirect)
 */
function loginWithFacebookSDK() {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK chưa được load'));
      return;
    }
    
    FB.login(function(response) {
      if (response.authResponse) {
        console.log('✅ Login thành công:', response.authResponse);
        resolve(response.authResponse);
      } else {
        reject(new Error('User đã hủy login'));
      }
    }, {
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement',
      return_scopes: true
    });
  });
}

/**
 * Kiểm tra login status
 */
function checkFacebookLoginStatus() {
  return new Promise((resolve) => {
    if (!window.FB) {
      resolve(null);
      return;
    }
    
    FB.getLoginStatus(function(response) {
      if (response.status === 'connected') {
        resolve(response.authResponse);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Logout Facebook
 */
function logoutFacebook() {
  return new Promise((resolve) => {
    if (!window.FB) {
      resolve();
      return;
    }
    
    FB.logout(function(response) {
      console.log('✅ Đã logout Facebook');
      resolve();
    });
  });
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
    // Filter và validate images
    const validImages = Array.isArray(images) 
      ? images.filter(img => typeof img === 'string' && img.trim())
      : [];
    
    console.log(`🚀 Posting to Facebook with ${validImages.length} image(s)...`);
    console.log(`📝 Message length: ${message.length} characters`);
    
    // Ưu tiên sử dụng helper từ seft (thông qua AutoSetup.tsx)
    if (seft && typeof seft.postToFacebookWithImages === 'function') {
      return await seft.postToFacebookWithImages(pageId, pageAccessToken, message, validImages, link);
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



// ===== FACEBOOK CONTENT GENERATION =====

/**
 * Tạo prompt cho AI để viết bài Facebook
 */
function createFacebookPostPrompt(industry, productInfo, customInstructions = '') {
  const template = FACEBOOK_AI_TEMPLATES[industry];
  const randomSeed = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  
  if (!template) {
    console.warn(`Không tìm thấy template cho lĩnh vực: ${industry}, dùng template mặc định`);
  }
  
  // 10 góc nhìn đa dạng
  const fbAngles = [
    "Nhà đầu tư: ROI + lợi nhuận cụ thể",
    "Người dùng: Trải nghiệm thực + cảm xúc",
    "Chuyên gia: Phân tích xu hướng sâu",
    "So sánh: Vì sao tốt hơn alternatives",
    "Câu chuyện: Case study thực tế",
    "Giải pháp: Fix vấn đề ngay lập tức",
    "Tương lai: Vision & innovation",
    "Cộng đồng: Impact xã hội",
    "Giáo dục: Tips & best practices",
    "Behind-the-scenes: Quy trình tạo ra"
  ];
  
  // 6 personas đa dạng
  const fbPersonas = [
    { label: "Gen Z 18-24", tone: "Casual, trendy", focus: "Trend, khác biệt" },
    { label: "Millennials 25-35", tone: "Thực tế, data-driven", focus: "ROI, giá trị" },
    { label: "Gen X 36-50", tone: "Chuyên nghiệp", focus: "Ổn định, bảo vệ" },
    { label: "Boomers 51+", tone: "Tôn trọng, ấm áp", focus: "Chất lượng, legacy" },
    { label: "First-timer", tone: "Tò mò, học hỏi", focus: "Hiểu rõ, trust" },
    { label: "Expert user", tone: "Tự tin, yêu cầu cao", focus: "Advanced, efficiency" }
  ];
  
  const selectedAngle = fbAngles[Math.floor(Math.random() * fbAngles.length)];
  const selectedPersona = fbPersonas[Math.floor(Math.random() * fbPersonas.length)];
  
  const role = template?.role || "chuyên gia trong lĩnh vực";
  const style = template?.style || "viết thu hút, tự nhiên";
  const structure = template?.structure || "Hook → Content → CTA → Hashtags";
  
  const prompt = `
[UNIQUE_ID]: ${randomSeed}
[ANGLE]: ${selectedAngle}
[PERSONA]: ${selectedPersona.label} - ${selectedPersona.tone}
[FOCUS]: ${selectedPersona.focus}

Bạn là ${role}. ${customInstructions ? `✨ ${customInstructions}` : ''}

📝 VIẾT POST FACEBOOK:
${productInfo}

🎯 YÊU CẦU:
- Approach: ${selectedAngle}
- Tone: ${selectedPersona.tone}
- Focus: ${selectedPersona.focus}

🚫 CẤM:
❌ "Bạn có bao giờ" | "Thời đại công nghệ" | "Không chỉ...mà còn" | "Hiện thực hóa" | "Tổ ấm" | "Vượt trội" | "Đừng bỏ lỡ"
❌ Mở bài lặp lại | Dùng cùng 1 con số nhiều lần | "Vô cùng/cực kỳ/tuyệt vời"

✅ MỞ ĐẦU theo angle:
• Đầu tư→con số | Người dùng→tình huống | Chuyên gia→insight | So sánh→vấn đề | Câu chuyện→before/after | Khác→sáng tạo

📐 CẤU TRÚC: ${structure}
🎨 STYLE: ${style}
${template?.avoid ? `⚠️ Tránh: ${template.avoid.join(', ')}` : ''}
${template?.focus ? `🎯 Focus: ${template.focus.join(', ')}` : ''}

YÊU CẦU OUTPUT:
Trả về JSON với cấu trúc:
{
  "post_content": "Nội dung bài viết (300-500 từ)",
  "hashtags": ["hashtag1", "hashtag2", ...],
  "suggested_image_description": "Mô tả ảnh nên dùng",
  "target_audience": "Đối tượng mục tiêu",
  "best_post_time": "Thời gian đăng tốt nhất"
}

LƯU Ý:
- Hashtags phải liên quan chặt chẽ đến nội dung
- Số lượng: 5-8 hashtags
- Ưu tiên hashtag phổ biến, có lượng tìm kiếm cao (từ khóa industry + location + nhu cầu)
- Nội dung tự nhiên, không giống AI viết
- post_content là văn bản thuần, KHÔNG dùng markdown (không *, **, -, #, hoặc bullet list)
- QUAN TRỌNG: Output phải là JSON hợp lệ, KHÔNG có markdown wrapper
- BẮT BUỘC: Không được xuống dòng thật trong JSON string. Nếu cần xuống dòng, dùng "\\n" trong giá trị "post_content".
- BẮT BUỘC: JSON output phải nằm trên 1 dòng (single-line JSON), không có line break.

========== VALIDATION TRƯỚC KHI TRẢ VỀ ==========

KIỂM TRA post_content:
❌ Nếu chứa "Bạn có bao giờ tự hỏi" → REWRITE
❌ Nếu chứa "Không chỉ là... mà còn" → REWRITE
❌ Nếu chứa "Hiện thực hóa ước mơ" hoặc "Tổ ấm lý tưởng" → REWRITE
❌ Nếu chứa "Những lợi ích vượt trội" → REWRITE

Nếu pass tất cả → TRẢ VỀ JSON
  `;
  
  return prompt;
}

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
      <label style="color: ${theme.text};">Chọn Fanpage:</label><br>
      <select id="fb-select-page" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};">
        <option value="">-- Chọn Fanpage --</option>
      </select>
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
  
  // Chọn page
  const selectPage = document.getElementById('fb-select-page');
  if (selectPage) {
    selectPage.addEventListener('change', handleSelectPage);
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
    btnAutoStart.addEventListener('click', () => startFacebookAutoPosting());
  }

  if (btnAutoStop) {
    btnAutoStop.addEventListener('click', () => stopFacebookAutoPosting('⏹️ Đã dừng auto đăng.'));
  }

  
}

function buildTokenBUrl(appSecret, tokenA) {
  const base = `https://graph.facebook.com/${FACEBOOK_CONFIG.GRAPH_API_VERSION}/oauth/access_token`;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: FACEBOOK_CONFIG.APP_ID,
    client_secret: appSecret,
    fb_exchange_token: tokenA
  });
  return `${base}?${params.toString()}`;
}

function buildPageTokenUrl(tokenB) {
  const base = `https://graph.facebook.com/${FACEBOOK_CONFIG.GRAPH_API_VERSION}/me/accounts`;
  const params = new URLSearchParams({
    access_token: tokenB
  });
  return `${base}?${params.toString()}`;
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
  
  try {
    showFacebookMessage('Đang kiểm tra token...', 'info');

    // Validate token via backend
    const meRes = await seft.facebookValidateToken(token);
    if (!meRes?.success) {
      throw new Error(meRes?.message || 'Token không hợp lệ');
    }

    const tokenInfo = meRes?.data || {};

    // Exchange sang Token B (60 ngày) nếu có thể
    showFacebookMessage('Đang exchange sang Token B (60 ngày)...', 'info');
    
    let longLivedToken = token;
    const exchangeRes = await seft.facebookExchangeToken(token, FACEBOOK_CONFIG.APP_ID, FACEBOOK_CONFIG.APP_SECRET);
    if (exchangeRes?.success && exchangeRes?.data?.access_token) {
      longLivedToken = exchangeRes.data.access_token;
      showFacebookMessage('✅ Đã đổi sang Token B (60 ngày).', 'info');
    }

    // Get pages list via backend using long-lived token
    const pagesRes = await seft.facebookGetPages(longLivedToken);
    const pages = Array.isArray(pagesRes?.data?.data) ? pagesRes.data.data : [];

    if (pages.length) {
      facebookState.userAccessToken = longLivedToken;
      facebookState.pages = pages;
      saveFacebookState();

      updateFacebookAuthUI(true);
      const pagesList = document.getElementById('fb-pages-list');
      if (pagesList) pagesList.style.display = 'block';
      populateFacebookPages(pages);
      showFacebookMessage('✅ Đã tải danh sách Page. Vui lòng chọn Page.', 'success');
      document.getElementById('fb-manual-token-input').style.display = 'none';
      return;
    }

    // Nếu /me/accounts lỗi (#100 accounts trên Page) => đây là Page Access Token
    const pagesErr = pagesRes?.message || '';
    if (pagesErr.includes('accounts') || pagesErr.includes('(#100)') || pagesErr.includes('OAuthException')) {
      showFacebookMessage('✅ Phát hiện Page Access Token. Đang sử dụng trực tiếp...', 'info');

      facebookState.selectedPageId = tokenInfo.id;
      facebookState.selectedPageName = tokenInfo.name || 'Unknown Page';
      facebookState.selectedPageToken = token;
      saveFacebookState();

      updateFacebookAuthUI(true);
      showFacebookMessage(`✅ Đã kết nối Page: ${facebookState.selectedPageName}`, 'success');
      document.getElementById('fb-manual-token-input').style.display = 'none';
      return;
    }

    throw new Error(pagesRes?.message || 'Token hợp lệ nhưng không lấy được Page Token.');
  } catch (error) {
    console.error('❌ Lỗi token:', error);
    showFacebookMessage('Token không hợp lệ: ' + error.message, 'error');
  }
}

/**
 * Kiểm tra xem user đã login chưa
 */
async function checkExistingLogin() {
  try {
    const authResponse = await checkFacebookLoginStatus();
    if (authResponse) {
      console.log('✅ User đã login Facebook');
      facebookState.userAccessToken = authResponse.accessToken;
      saveFacebookState();
      await loadFacebookPages();
      updateFacebookAuthUI(true);
    }
  } catch (error) {
    console.error('Lỗi check login status:', error);
  }
}

/**
 * Handle Facebook connect (dùng FB SDK)
 */
async function handleFacebookConnect() {
  try {
    showFacebookMessage('Đang kết nối với Facebook...', 'info');
    
    // Kiểm tra SDK đã load chưa
    if (!window.FB) {
      throw new Error('Facebook SDK chưa sẵn sàng. Vui lòng thử lại sau vài giây hoặc sử dụng tùy chọn "Nhập Token thủ công".');
    }
    
    // Login với Facebook SDK
    const authResponse = await loginWithFacebookSDK();
    
    if (!authResponse || !authResponse.accessToken) {
      throw new Error('Không nhận được access token từ Facebook');
    }
    
    facebookState.userAccessToken = authResponse.accessToken;
    saveFacebookState();
    
    await loadFacebookPages();
    
    showFacebookMessage('✅ Kết nối thành công!', 'success');
    
  } catch (error) {
    console.error('❌ Lỗi kết nối Facebook:', error);
    
    let errorMessage = error.message;
    
    // Phân tích lỗi cụ thể
    if (error.message.includes('User đã hủy login')) {
      errorMessage = 'Bạn đã hủy đăng nhập Facebook';
    } else if (error.message.includes('password')) {
      errorMessage = `
        <strong>Lỗi đăng nhập Facebook</strong><br>
        <br>
        <strong>Nguyên nhân:</strong> Facebook App chưa được cấu hình đúng hoặc tài khoản của bạn chưa được thêm vào app.<br>
        <br>
        <strong>Giải pháp:</strong><br>
        1. Sử dụng tùy chọn "Nhập Token thủ công" bên dưới<br>
        2. Hoặc liên hệ admin để cấu hình Facebook App<br>
        <br>
        <strong>Hướng dẫn lấy token:</strong><br>
        - Truy cập: <a href="https://developers.facebook.com/tools/explorer/${FACEBOOK_CONFIG.APP_ID}/" target="_blank">Graph API Explorer</a><br>
        - Chọn Page → Generate Access Token<br>
        - Copy token và paste vào ô "Nhập Token thủ công"
      `;
      
      // Hiển thị nút nhập token thủ công
      const btnManual = document.getElementById('btn-fb-manual-token');
      if (btnManual) btnManual.style.display = 'inline-block';
    }
    
    showFacebookMessage(errorMessage, 'error');
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
    
    if (facebookState.selectedPageId) {
      const select = document.getElementById('fb-select-page');
      if (select) {
        select.value = facebookState.selectedPageId;
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
  const select = document.getElementById('fb-select-page');
  if (!select) return;
  
  select.innerHTML = '<option value="">-- Chọn Fanpage --</option>';
  
  pages.forEach(page => {
    const option = document.createElement('option');
    option.value = page.id;
    option.textContent = page.name;
    option.dataset.token = page.access_token;
    select.appendChild(option);
  });
}

/**
 * Handle select page
 */
function handleSelectPage(event) {
  const pageId = event.target.value;
  
  if (!pageId) {
    facebookState.selectedPageId = null;
    facebookState.selectedPageName = null;
    facebookState.pageAccessToken = null;
    saveFacebookState();
    return;
  }
  
  const page = facebookState.pages.find(p => p.id === pageId);
  
  if (page) {
    facebookState.selectedPageId = page.id;
    facebookState.selectedPageName = page.name;
    facebookState.pageAccessToken = page.access_token;
    saveFacebookState();
    
    showFacebookMessage(`✅ Đã chọn: ${page.name}`, 'success');
  }
}

/**
 * Handle preview
 */
async function handleFacebookPreview() {
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
    return;
  }
  
  try {
    showFacebookMessage('🤖 AI đang tạo nội dung...', 'info');
    
    const prompt = createFacebookPostPrompt(industry, productInfo, customInstructions);
    
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
  }
}

/**
 * Handle post to Facebook
 */
async function handleFacebookPost() {
  if (!facebookState.selectedPageId || !facebookState.pageAccessToken) {
    showFacebookMessage('Vui lòng chọn Fanpage trước', 'error');
    return;
  }
  
  if (!facebookState.lastPostResult) {
    showFacebookMessage('Vui lòng tạo nội dung trước (nhấn Xem trước)', 'error');
    return;
  }

  const now = Date.now();
  const nextAllowedAt = getFacebookNextAllowedPostAt();
  if (nextAllowedAt && now < nextAllowedAt) {
    const waitMs = nextAllowedAt - now;
    showFacebookMessage(`⏳ Vui lòng chờ ${formatDurationMs(waitMs)} trước khi đăng bài tiếp theo.`, 'error');
    return;
  }
  
  const imageUrl = document.getElementById('fb-image-url')?.value;
  const websiteLink = document.getElementById('fb-website-link')?.value;
  const postContent = facebookState.lastPostResult?.content || '';

  const validation = validateFacebookPostContent(postContent);
  if (!validation.ok) {
    const isDuplicate = validation.message.includes('trùng với bài');
    if (!isDuplicate) {
      showFacebookMessage(validation.message, 'error');
      return;
    }

    const confirmDuplicate = confirm(`${validation.message}\n\nBạn có muốn tiếp tục đăng bài này không?`);
    if (!confirmDuplicate) {
      showFacebookMessage('Đã hủy đăng bài.', 'info');
      return;
    }
  }

  const confirmPost = confirm('Xác nhận đăng bài này lên Facebook?');
  if (!confirmPost) {
    showFacebookMessage('Đã hủy đăng bài.', 'info');
    return;
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
      facebookState.selectedPageId,
      facebookState.pageAccessToken,
      postContent,
      imagesToPost,
      websiteLink || null,
      seft
    );  
    
    if (result.success) {
      recordFacebookPost(postContent);
      const nextAt = setFacebookNextAllowedPostAt();
      const waitMs = nextAt - Date.now();
      showFacebookMessage(`🎉 Đăng bài thành công! (${result.images_count} ảnh) <a href="https://www.facebook.com/${result.post_id}" target="_blank">Xem bài viết</a>`, 'success');
      showFacebookMessage(`⏳ Hệ thống sẽ cho phép đăng bài tiếp theo sau ${formatDurationMs(waitMs)}.`, 'info');
    }
    
  } catch (error) {
    console.error('❌ Lỗi đăng bài:', error);
    showFacebookMessage('Lỗi: ' + error.message, 'error');
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

// ===== GLOBAL STATE FOR UI MANAGEMENT =====
let uiMutationObserver = null;
let isThemeRefreshing = false;

// ===== EXPORT TO WINDOW =====
window.FacebookAutoPost = {
  config: FACEBOOK_CONFIG,
  state: facebookState,
  createUI: createFacebookPostUI,
  createPrompt: createFacebookPostPrompt,
  getTrendingHashtags: getFacebookTrendingHashtags,
  parseAIResponse: parseFacebookAIResponse,
  postToPage: postToFacebookPage,
  startAuto: startFacebookAutoPosting,
  stopAuto: stopFacebookAutoPosting
};

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