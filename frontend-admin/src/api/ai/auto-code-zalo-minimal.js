/**
 * AUTO_CODE - Xử lý Zalo Data → web_service_detail
 *
 * Hướng dẫn:
 * 1. Copy code này vào p_code của sys_autos
 * 2. Dán dữ liệu Zalo vào JSON textarea rồi nhấn Chạy
 * 3. Script sẽ gọi API lấy/ghi bảng qua helper (csmApi) hoặc fallback fetch
 */

// ===== CONFIG =====
const DEFAULT_UPLOAD_ENDPOINT = "/upload.shtml";
const DEFAULT_APP_ID = "wuweb";
const DEFAULT_DOMAIN = "phanmemmottrieu.net";
const LMKT_WEST_DOMAINS = "h-holding.vn,h-holding.com.vn";
const LMKT_CONTACT_NAME = "phongkinhdoanhlmkt";
const LMKT_CONTACT_PHONE = "0909879885";
// const MIN_AI_WAIT_MS = 300000; // 5 phút

// ===== BASIC HELPERS =====
  const lmktCategories = [
    // === 1 NHÓM DỰ ÁN ===
    {
      service_code: "du-an",
      slug: "du-an",
      name: "Dự Án",
      group_slug: "",
      is_group_slug: true,
      is_group_slug_default: false,
      is_service: true,
      category: "Dự Án",
      category_en: "Projects",
      category_zh: "项目",
      attributes_icon: "AppstoreOutlined",
      attributes_color: "#52c41a",
      attributes_priority: 0,
      attributes_title: "Tất Cả Dự Án - Bất Động Sản Đẳng Cấp",
      attributes_title_en: "All Projects - Premium Real Estate",
      attributes_title_zh: "所有项目 - 高级房地产",
      attributes_description: "Danh sách đầy đủ các dự án của H-Holding",
      attributes_description_en: "Complete list of H-Holding projects",
      attributes_description_zh: "H-Holding的完整项目列表",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    // === 5 DỰ ÁN BĐS ===
    {
      service_code: "sunshine",
      slug: "sunshine",
      name: "Sunshine",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "Sunshine",
      category_en: "Sunshine Project",
      category_zh: "Sunshine项目",
      attributes_icon: "HomeOutlined",
      attributes_color: "#13c2c2",
      attributes_priority: 1,
      attributes_title: "Dự Án Sunshine - Căn Hộ Cao Cấp",
      attributes_title_en: "Sunshine Project - Premium Apartments",
      attributes_title_zh: "Sunshine项目 - 高级公寓",
      attributes_description: "Khu căn hộ hiện đại tại Quận 7",
      attributes_description_en: "Modern apartment complex in District 7",
      attributes_description_zh: "第7郡现代公寓综合体",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    {
      service_code: "kieu-by-kita",
      slug: "kieu-by-kita",
      name: "Kiều by Kita",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "Kiều by Kita",
      category_en: "Kieu by Kita",
      category_zh: "Kiều by Kita 项目",
      attributes_icon: "HomeOutlined",
      attributes_color: "#faad14",
      attributes_priority: 2,
      attributes_title: "Dự Án Kiều by Kita - Biệt Thự Sang Trọng",
      attributes_title_en: "Kieu by Kita - Luxury Villas",
      attributes_title_zh: "Kieu by Kita - 豪华别墅",
      attributes_description: "Khu biệt thự cao cấp với tiện ích đẳng cấp",
      attributes_description_en: "Premium villa complex with luxury amenities",
      attributes_description_zh: "豪华别墅综合体，配有高级便利设施",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    {
      service_code: "destino-centro",
      slug: "destino-centro",
      name: "Destino Centro",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "Destino Centro",
      category_en: "Destino Centro",
      category_zh: "Destino Centro 项目",
      attributes_icon: "BuildOutlined",
      attributes_color: "#1890ff",
      attributes_priority: 3,
      attributes_title: "Dự Án Destino Centro - Tòa Nhà Văn Phòng",
      attributes_title_en: "Destino Centro - Office Tower",
      attributes_title_zh: "Destino Centro - 办公楼",
      attributes_description: "Toà nhà thương mại tại trung tâm thành phố",
      attributes_description_en: "Commercial building in city center",
      attributes_description_zh: "市中心商业楼宇",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    {
      service_code: "the-win-city",
      slug: "the-win-city",
      name: "The Win City",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "The Win City",
      category_en: "The Win City",
      category_zh: "The Win City 项目",
      attributes_icon: "EnvironmentOutlined",
      attributes_color: "#52c41a",
      attributes_priority: 4,
      attributes_title: "Dự Án The Win City - Đô Thị Thông Minh",
      attributes_title_en: "The Win City - Smart City",
      attributes_title_zh: "The Win City - 智慧城市",
      attributes_description: "Dự án đô thị tích hợp hiện đại",
      attributes_description_en: "Modern integrated urban development",
      attributes_description_zh: "现代综合城市发展",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    {
      service_code: "king-hill-residences",
      slug: "king-hill-residences",
      name: "King Hill Residences",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "King Hill Residences",
      category_en: "King Hill Residences",
      category_zh: "King Hill Residences 项目",
      attributes_icon: "HomeOutlined",
      attributes_color: "#eb2f96",
      attributes_priority: 5,
      attributes_title: "Dự Án King Hill Residences - Khu Biệt Thự Nghỉ Dưỡng",
      attributes_title_en: "King Hill Residences - Resort Villas",
      attributes_title_zh: "King Hill Residences - 度假别墅",
      attributes_description: "Khu biệt thự nghỉ dưỡng với view tuyệt đẹp",
      attributes_description_en: "Resort villa complex with stunning views",
      attributes_description_zh: "度假别墅综合体，景色优美",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    // Bổ sung dự án theo yêu cầu (LMKT)
    {
      service_code: "ansana-kita-vo-van-kiet",
      slug: "ansana-kita-vo-van-kiet",
      name: "Ansana (Kita Võ Văn Kiệt)",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "Ansana (Kita Võ Văn Kiệt)",
      category_en: "Ansana (Kita Vo Van Kiet)",
      category_zh: "Ansana（Kita 武文杰大道）项目",
      attributes_icon: "BankOutlined",
      attributes_color: "#722ed1",
      attributes_priority: 6,
      attributes_title: "Ansana (Kita Võ Văn Kiệt) - Căn Hộ & Tiện Ích Đẳng Cấp",
      attributes_title_en: "Ansana (Kita Vo Van Kiet) - Premium Residences",
      attributes_title_zh: "Ansana (Kita Võ Văn Kiệt) - 高端公寓",
      attributes_description: "Dự án tọa lạc trục Võ Văn Kiệt, kết nối nhanh trung tâm",
      attributes_description_en: "Located on Vo Van Kiet avenue, fast access to CBD",
      attributes_description_zh: "位于武文杰大道，快速连接市中心",
      status: "active"
    },
    {
      service_code: "d-homme-quan-6",
      slug: "d-homme-quan-6",
      name: "D-Homme Quận 6",
      group_slug: "du-an",
      is_group_slug: false,
      is_service: true,
      category: "D-Homme Quận 6",
      category_en: "D-Homme District 6",
      category_zh: "D-Homme 第6郡 项目",
      attributes_icon: "ApartmentOutlined",
      attributes_color: "#f5222d",
      attributes_priority: 7,
      attributes_title: "D-Homme Quận 6 - Tổ Hợp Căn Hộ Thương Mại",
      attributes_title_en: "D-Homme District 6 - Mixed-use Residences",
      attributes_title_zh: "D-Homme 第6郡 - 综合公寓体",
      attributes_description: "Vị trí đắc địa tại Quận 6, hệ tiện ích đa dạng",
      attributes_description_en: "Prime location in District 6 with diverse amenities",
      attributes_description_zh: "位于第6郡黄金地段，配套完善",
      status: "active"
    },
    // === 4 TRANG TĨNH ===
    {
      service_code: "home",
      slug: "home",
      name: "Trang Chủ",
      is_service: false,
      category: "Trang Chủ",
      category_en: "Home",
      category_zh: "首页",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    {
      service_code: "ve-chung-toi",
      slug: "ve-chung-toi",
      name: "Về Chúng Tôi",
      is_service: false,
      category: "Về Chúng Tôi",
      category_en: "About Us",
      category_zh: "关于我们",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    },
    {
      service_code: "lien-he",
      slug: "lien-he",
      name: "Liên Hệ",
      is_service: false,
      category: "Liên Hệ",
      category_en: "Contact",
      category_zh: "联系我们",
      domain: "h-holding.vn,h-holding.com.vn",
      status: "active"
    }
  ];
// Chuẩn hóa nội dung tin nhắn Zalo: bỏ ký tự ẩn, ký tự in đậm/đặc biệt, giữ lại ký tự có nghĩa
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

// Helper để parse số nguyên
function parseIntField(value) {
  if (!value) return undefined;
  const num = parseInt(String(value).replace(/[,\.]/g, ''), 10);
  return isNaN(num) ? undefined : num;
}

// Helper để parse số thực
function parseFloatField(value) {
  if (!value) return undefined;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? undefined : num;
}
// Hàm buildSpecsHtml đã được loại bỏ - thay vào đó sử dụng các trường attributes riêng biệt

// ===== HÀM ENCODE HTML ĐỒNG NHẤT VỚI CsmEditModal.tsx =====
// Mã hoá dữ liệu HTML trước khi lưu: Bước 1 Encrypt, Bước 2 URL encode
// QUAN TRỌNG: Hàm này phải đồng bộ với encodeHtmlField trong CsmEditModal.tsx
// Để giải mã đúng trên frontend, cần có cả 2 bước
function encodeHtml(html) {
  if (!html) return html;
  let encoded = String(html);
  
  // Bước 1: Encrypt - BẮT BUỘC phải có csmEncrypt
  try {
    if (typeof csmEncrypt !== 'function') {
      console.error('[encodeHtml] csmEncrypt function not available - HTML will not be encrypted properly!');
      // Vẫn tiếp tục để ít nhất có URL encode, nhưng log warning
    } else {
      encoded = csmEncrypt(encoded);
    }
  } catch (e) {
    console.error('[encodeHtml] Encrypt failed:', e);
  }
  
  // Bước 2: URL encode
  try {
    encoded = encodeURIComponent(encoded);
  } catch (e) {
    console.error('[encodeHtml] URL encode failed:', e);
  }
  
  return encoded;
}

// AI sẽ tự xác định serviceType và các attributes - không cần logic thủ công

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
    const bg = root.getPropertyValue("--ant-color-bg-container").trim() || "#ffffff";
    const border = root.getPropertyValue("--ant-color-border").trim() || "#d9d9d9";
    const text = root.getPropertyValue("--ant-color-text").trim() || "#000000";
    const textSecondary = root.getPropertyValue("--ant-color-text-secondary").trim() || text;
    const primary = root.getPropertyValue("--ant-color-primary").trim() || "#1677ff";
    return { bg, border, text, textSecondary, primary };
  } catch {
    return { bg: "#ffffff", border: "#d9d9d9", text: "#000000", textSecondary: "#000000", primary: "#1677ff" };
  }
}



// ===== GOOGLE INDEX HELPERS =====

/**
 * Gửi URLs lên Google Indexing API TRỰC TIẾP (sử dụng quota ngay)
 * KHUYẾN NGHỊ: Dùng addToGoogleIndexQueue() thay vì hàm này cho bulk URLs
 * @param {string|string[]} urls - URL hoặc mảng URLs
 * @param {string} action - "publish" hoặc "remove"
 * @returns {Promise<Object>}
 */
async function googleIndex(urls, action = "publish") {
  const ctx = resolveContext();
  
  if (!ctx.helperApi.googleIndexUrl) {
    throw new Error("googleIndexUrl helper không khả dụng");
  }
  
  const urlArray = Array.isArray(urls) ? urls : [urls];
  const payload = {
    operation: "submit",
    urls: urlArray,
    action: action
  };
  
  try {
    const result = await ctx.helperApi.googleIndexUrl(payload.urls, payload.action);
    console.log(`✅ Google Index: ${result.success ? 'Success' : 'Failed'} - ${result.message || ''}`);
    return result;
  } catch (error) {
    console.error("❌ Google Index Error:", error);
    throw error;
  }
}

/**
 * Thêm URL vào queue để gửi sau (RECOMMENDED)
 * Tự động kiểm tra trùng lặp và quản lý priority
 * @param {string|string[]} urls - URL hoặc mảng URLs
 * @param {string} action - "publish" hoặc "remove"
 * @param {number} priority - 1 (cao nhất) - 10 (thấp nhất), mặc định 5
 * @returns {Promise<Object>}
 */
async function addToGoogleIndexQueue(urls, action = "publish", priority = 5) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.addToQueue && !ctx.helperApi?.addBatchToQueue) {
    throw new Error("addToQueue/addBatchToQueue không khả dụng trong helperApi");
  }
  
  try {
    const urlArray = Array.isArray(urls) ? urls : [urls];
    
    // Sử dụng batch nếu có nhiều URLs
    if (urlArray.length > 1 && ctx.helperApi.addBatchToQueue) {
      const result = await ctx.helperApi.addBatchToQueue(urlArray, action, priority);
      console.log(`✅ Added ${urlArray.length} URLs to queue - Added: ${result.data?.added || 0}, Skipped: ${result.data?.skipped || 0}`);
      return result;
    } else if (ctx.helperApi.addToQueue) {
      const result = await ctx.helperApi.addToQueue(urlArray[0], action, priority);
      console.log(`✅ ${result.data?.added ? 'Added to queue' : 'Already in queue'}: ${urlArray[0]}`);
      return result;
    }
  } catch (error) {
    console.error("❌ Add to Queue Error:", error);
    throw error;
  }
}

/**
 * Lấy thông tin queue và quota
 * @returns {Promise<Object>} - { queue: {...}, quota: {...} }
 */
async function getGoogleIndexQueueInfo() {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.getQueueInfo) {
    throw new Error("getQueueInfo không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.getQueueInfo();
    return result?.data || result;
  } catch (error) {
    console.error("❌ Queue Info Error:", error);
    throw error;
  }
}

/**
 * Trigger xử lý queue thủ công
 * @param {number} batchSize - Số URLs tối đa để xử lý (mặc định 10)
 * @returns {Promise<Object>}
 */
async function processGoogleIndexQueue(batchSize = 10) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.processQueue) {
    throw new Error("processQueue không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.processQueue(batchSize);
    if (result?.success) {
      console.log(`✅ Processed ${result.data?.processed || 0} URLs - Success: ${result.data?.success_count || 0}, Failed: ${result.data?.fail_count || 0}`);
    }
    return result;
  } catch (error) {
    console.error("❌ Process Queue Error:", error);
    throw error;
  }
}

/**
 * Kiểm tra quota Google Index
 * @returns {Promise<Object>} - { daily_limit, used_today, remaining, last_reset_date, usage_percentage }
 */
async function checkGoogleIndexQuota() {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.checkGoogleIndexQuota) {
    throw new Error("checkGoogleIndexQuota không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.checkGoogleIndexQuota();
    // Backend trả về: { success, data: { daily_limit, used_today, remaining, last_reset_date, usage_percentage } }
    if (result?.success && result?.data) {
      return result.data;
    }
    // Fallback nếu format khác
    return result?.data || result || { daily_limit: 200, used_today: 0, remaining: 200 };
  } catch (error) {
    console.error("❌ Quota Check Error:", error);
    throw error;
  }
}

/**
 * Kiểm tra indexing status của URL
 * @param {string} url - URL cần kiểm tra
 * @returns {Promise<Object>}
 */
async function checkGoogleIndexStatus(url) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.checkGoogleIndexStatus) {
    throw new Error("checkGoogleIndexStatus không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.checkGoogleIndexStatus(url);
    return result;
  } catch (error) {
    console.error("❌ Status Check Error:", error);
    throw error;
  }
}

/**
 * Lấy danh sách verified sites từ Google Search Console
 * @returns {Promise<Object>}
 */
async function getGoogleSearchConsoleSites() {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.getGoogleSearchConsoleSites) {
    throw new Error("getGoogleSearchConsoleSites không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.getGoogleSearchConsoleSites();
    return result;
  } catch (error) {
    console.error("❌ Sites List Error:", error);
    throw error;
  }
}

// ==================== CHAT HELPER FUNCTIONS ====================

/**
 * Guest phone storage key (30-day expiry)
 */
const GUEST_PHONE_STORAGE_KEY = 'csm_guest_phone';
const GUEST_PHONE_EXPIRY_KEY = 'csm_guest_phone_expiry';
const GUEST_PHONE_TTL_DAYS = 30;

/**
 * Lưu số điện thoại guest vào localStorage (30 ngày)
 * @param {string} phone - Số điện thoại guest
 */
function saveGuestPhone(phone) {
  if (!phone) return;
  
  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GUEST_PHONE_TTL_DAYS);
    
    localStorage.setItem(GUEST_PHONE_STORAGE_KEY, phone);
    localStorage.setItem(GUEST_PHONE_EXPIRY_KEY, expiryDate.toISOString());
    
    console.log(`✅ Saved guest phone: ${phone} (expires: ${expiryDate.toLocaleDateString()})`);
  } catch (error) {
    console.warn("⚠️ Failed to save guest phone:", error);
  }
}

/**
 * Lấy số điện thoại guest từ localStorage
 * @returns {string|null} - Số điện thoại hoặc null nếu hết hạn/không tồn tại
 */
function getGuestPhone() {
  try {
    const phone = localStorage.getItem(GUEST_PHONE_STORAGE_KEY);
    const expiryStr = localStorage.getItem(GUEST_PHONE_EXPIRY_KEY);
    
    if (!phone) return null;
    
    if (expiryStr) {
      const expiry = new Date(expiryStr);
      if (expiry < new Date()) {
        // Hết hạn - xóa đi
        clearGuestPhone();
        console.log("ℹ️ Guest phone expired, cleared from storage");
        return null;
      }
    }
    
    return phone;
  } catch (error) {
    console.warn("⚠️ Failed to get guest phone:", error);
    return null;
  }
}

/**
 * Xóa số điện thoại guest (khi user đăng xuất)
 */
function clearGuestPhone() {
  try {
    localStorage.removeItem(GUEST_PHONE_STORAGE_KEY);
    localStorage.removeItem(GUEST_PHONE_EXPIRY_KEY);
    console.log("✅ Guest phone cleared");
  } catch (error) {
    console.warn("⚠️ Failed to clear guest phone:", error);
  }
}

/**
 * Lấy lịch sử chat cho guest (không cần đăng nhập)
 * Tự động lưu số điện thoại vào localStorage
 * @param {string} appId - App ID
 * @param {string} guestPhone - Số điện thoại guest
 * @param {number} limit - Số lượng tin nhắn (mặc định 50)
 * @returns {Promise<Object>}
 */
async function loadGuestChatHistory(appId, guestPhone, limit = 50) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.getChatHistoryGuest) {
    throw new Error("getChatHistoryGuest không khả dụng trong helperApi");
  }
  
  try {
    // Lưu guest phone vào localStorage
    if (guestPhone) {
      saveGuestPhone(guestPhone);
    }
    
    const result = await ctx.helperApi.getChatHistoryGuest(appId, guestPhone, limit);
    
    if (result?.success) {
      const messages = result.data?.messages || [];
      console.log(`✅ Loaded ${messages.length} messages for guest: ${guestPhone}`);
      return messages;
    }
    
    return [];
  } catch (error) {
    console.error("❌ Load Guest Chat Error:", error);
    throw error;
  }
}

/**
 * Lấy lịch sử chat cho admin (theo room)
 * @param {string} room - Room ID
 * @param {number} limit - Số lượng tin nhắn (mặc định 50)
 * @returns {Promise<Object>}
 */
async function loadAdminChatHistory(room, limit = 50) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.getChatHistory) {
    throw new Error("getChatHistory không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.getChatHistory(room, limit);
    
    if (result?.success) {
      const messages = result.data?.messages || [];
      console.log(`✅ Loaded ${messages.length} messages for room: ${room}`);
      return messages;
    }
    
    return [];
  } catch (error) {
    console.error("❌ Load Admin Chat Error:", error);
    throw error;
  }
}

/**
 * Lấy tất cả chat history cho app (admin view)
 * @param {string} appId - App ID
 * @param {number} limit - Số lượng tin nhắn mỗi guest (mặc định 50)
 * @returns {Promise<Object>}
 */
async function loadAllAppChatHistory(appId, limit = 50) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.getChatHistoryApp) {
    throw new Error("getChatHistoryApp không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.getChatHistoryApp(appId, limit);
    
    if (result?.success) {
      const chats = result.data?.chats || {};
      const guestCount = Object.keys(chats).length;
      console.log(`✅ Loaded chat history for ${guestCount} guests in app: ${appId}`);
      return chats;
    }
    
    return {};
  } catch (error) {
    console.error("❌ Load App Chat Error:", error);
    throw error;
  }
}

/**
 * Lấy danh sách guests đã chat trong app (admin)
 * @param {string} appId - App ID
 * @returns {Promise<Array>}
 */
async function loadChatGuestsList(appId) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.getChatGuestsList) {
    throw new Error("getChatGuestsList không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.getChatGuestsList(appId);
    
    if (result?.success) {
      const guests = result.data?.guests || [];
      console.log(`✅ Found ${guests.length} guests in app: ${appId}`);
      return guests;
    }
    
    return [];
  } catch (error) {
    console.error("❌ Load Guests List Error:", error);
    throw error;
  }
}

/**
 * Đánh dấu đã đọc cho guest (không cần đăng nhập)
 * @param {string} appId - App ID
 * @param {string} guestPhone - Số điện thoại guest
 * @returns {Promise<Object>}
 */
async function markGuestMessagesAsRead(appId, guestPhone) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.markChatAsReadGuest) {
    throw new Error("markChatAsReadGuest không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.markChatAsReadGuest(appId, guestPhone);
    
    if (result?.success) {
      console.log(`✅ Marked messages as read for guest: ${guestPhone}`);
    }
    
    return result;
  } catch (error) {
    console.error("❌ Mark Guest Read Error:", error);
    throw error;
  }
}

/**
 * Đánh dấu tất cả tin nhắn trong room đã đọc (admin)
 * @param {string} room - Room ID
 * @param {string} userId - User ID (admin)
 * @returns {Promise<Object>}
 */
async function markAllMessagesAsRead(room, userId) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.markChatAsReadAll) {
    throw new Error("markChatAsReadAll không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.markChatAsReadAll(room, userId);
    
    if (result?.success) {
      console.log(`✅ Marked all messages as read in room: ${room}`);
    }
    
    return result;
  } catch (error) {
    console.error("❌ Mark All Read Error:", error);
    throw error;
  }
}

/**
 * Kiểm tra indexing status và tự động publish nếu NEUTRAL
 * @param {string} url - URL cần kiểm tra và auto-publish
 * @returns {Promise<Object>}
 */
async function checkAndAutoPublish(url) {
  const ctx = resolveContext();
  
  if (!ctx.helperApi?.checkAndAutoPublish) {
    throw new Error("checkAndAutoPublish không khả dụng trong helperApi");
  }
  
  try {
    const result = await ctx.helperApi.checkAndAutoPublish(url);
    return result;
  } catch (error) {
    console.error("❌ Auto-publish Error:", error);
    throw error;
  }
}

// ========== CONTEXT RESOLUTION ==========
function resolveContext(seftObj) {
  const win = typeof window !== 'undefined' ? window : {};
  const app_id = (seftObj && seftObj.app_id) || DEFAULT_APP_ID;
  const domainFromSeft = seftObj && seftObj.domain;
  const domainFromHost = normalizeDomain(win.location?.hostname);
  const domain = domainFromSeft || domainFromHost || DEFAULT_DOMAIN;

  const apiBase = (seftObj && seftObj.domain_api_url)
    || win.domain_api_url
    || (win.location?.origin ? `${win.location.origin}/api` : "");

  const token = (seftObj && seftObj.Uinfos?.appToken)
    || win.csmToken
    || "";

  const helperApi = win.csmApi || {};
  const helperAi = win.csmAI || {};

  return { seftObj, app_id, domain, apiBase, token, helperApi, helperAi };
}

// ===== AI =====
async function callAiGenerateSeoContent(articleType, topic, additionalInfo, primaryKeyword, secondaryKeywords) {
  const ctx = resolveContext();
  const params = { articleType, topic, additionalInfo, primaryKeyword, secondaryKeywords };

  const runAsync = ctx.helperAi.generateSeoContent || (ctx.seftObj && ctx.seftObj.generateSeoContent);
  if (typeof runAsync === "function") {
    const res = await runAsync(params);
    const data = res?.data || res?.result;
    if ((res?.success || res?.code === 0) && data) {
      return data;
    }
    throw new Error(res?.message || res?.error || "SEO generation failed (async helper)");
  }

  const runCb = ctx.helperAi.csm_ai_generate_seo_content || (ctx.seftObj && ctx.seftObj.csm_ai_generate_seo_content);
  if (typeof runCb === "function") {
    const data = await new Promise((resolve, reject) => {
      runCb(articleType, topic, additionalInfo, primaryKeyword, secondaryKeywords, (result) => {
        const payload = result?.data || result?.result;
        if ((result?.success || result?.code === 0) && payload) return resolve(payload);
        reject(new Error(result?.message || result?.error || "SEO generation failed (cb helper)"));
      });
    });
    return data;
  }

  throw new Error("SEO helpers not available");
}
// ===== BASIC HELPERS =====
function generateId() {
  return `web_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateSlug(text) {
  // Dùng NFKD để chuẩn hóa cả ký tự dạng in đậm/đặc biệt (𝐂, 𝟐, ...)
  let normalized = text || "";
  try {
    normalized = normalized.normalize("NFKD");
    // Chuyển đ/Đ (và các biến thể ð) về d trước khi bỏ dấu
    normalized = normalized.replace(/đ|ð/gi, "d");
    // Loại bỏ toàn bộ dấu, kể cả dạng tổ hợp và dấu tương thích
    normalized = normalized.replace(/\p{Diacritic}+/gu, "");
  } catch {
    // Fallback: loại bỏ dấu bằng dải unicode dấu phổ biến
    normalized = normalized
      .replace(/đ|ð/gi, "d")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Fallback bổ sung cho các nguyên âm Việt còn sót sau normalize (an toàn idempotent)
  const accentMap = {
    a: "[áàảãạăằắẳẵặâầấẩẫậ]",
    e: "[éèẻẽẹêềếểễệ]",
    i: "[íìỉĩị]",
    o: "[óòỏõọôồốổỗộơờớởỡợ]",
    u: "[úùủũụưừứửữự]",
    y: "[ýỳỷỹỵ]",
    A: "[ÁÀẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ]",
    E: "[ÉÈẺẼẸÊỀẾỂỄỆ]",
    I: "[ÍÌỈĨỊ]",
    O: "[ÓÒỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]",
    U: "[ÚÙỦŨỤƯỪỨỬỮỰ]",
    Y: "[ÝỲỶỸỴ]",
  };
  Object.entries(accentMap).forEach(([ascii, pattern]) => {
    normalized = normalized.replace(new RegExp(pattern, "g"), ascii);
  });

  return normalized
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // chuyển mọi chuỗi không phải a-z0-9 thành -
    .replace(/-+/g, "-")         // gom về một dấu - duy nhất
    .replace(/^-+|-+$/g, "")     // bỏ - đầu/cuối
    || "post";                   // fallback nếu rỗng
}

/**
 * Parse thông tin từ Zalo content - chỉ chuẩn hóa, để AI tự extract
 */
function parseZaloContent(content) {
  // Chỉ chuẩn hóa nội dung, không parse thủ công
  const normalized = normalizeZaloText(content);
  
  return {
    normalizedContent: normalized,
    rawContent: content,
  };
}

// Lấy custom prompt cho AI
function getAiCustomPrompt(zaloContent) {
  return `
Bạn là chuyên gia viết bài SEO top 1 Google, tạo nội dung hấp dẫn, chuyên nghiệp bằng Tiếng Việt, Tiếng Anh, Tiếng Trung.

**NHIỆM VỤ:**
Tạo một đối tượng JSON DUY NHẤT, KHÔNG thêm văn bản ngoài JSON, KHÔNG bao bọc trong \`\`\`json hoặc \`\`\`.
JSON phải chứa đầy đủ các trường sau, mỗi trường đúng ngôn ngữ (vi, en, zh) và đúng cấu trúc cho bảng web_service_detail:

{
  "title": "string",
  "title_en": "string",
  "title_zh": "string",
  "description": "string",
  "description_en": "string",
  "description_zh": "string",
  "content": "string (HTML 2000+ ký tự)",
  "content_en": "string (HTML 2000+ ký tự)",
  "content_zh": "string (HTML 2000+ ký tự)",
  "keywords": "string",
  "keywords_en": "string",
  "keywords_zh": "string",
  "excerpt": "string",
  "excerpt_en": "string",
  "excerpt_zh": "string",
  "author": "string",
  "readTime": "string",
  "tags": ["string"],
  "attributes_area": "string",
  "attributes_dimensions": "string",
  "attributes_bedrooms": "string",
  "attributes_bathrooms": "string",
  "attributes_floors": "string",
  "attributes_frontWidth": "string",
  "attributes_roadWidth": "string",
  "attributes_location": "string",
  "attributes_price": "string",
  "attributes_contact": "string",
  "propertyType": "string",
  "transactionType": "string",
  "legalStatus": "string",
  "furnished": "string"
}

**YÊU CẦU NỘI DUNG CHI TIẾT:**

1. **TRƯỜNG CONTENT (QUAN TRỌNG NHẤT):**
   - Độ dài: 2000+ ký tự, chi tiết, chuyên sâu, hấp dẫn
   - Cấu trúc HTML phong phú với <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>
   - Bao gồm các phần:
     * Giới thiệu chung về sản phẩm/dự án
     * Vị trí & Địa chỉ (chi tiết hàng xóm, giao thông)
     * Thiết kế & Kết cấu (mô tả chi tiết)
     * Tiện ích & Dịch vụ xung quanh
     * Tiềm năng kinh doanh/đầu tư
     * FAQ hoặc câu hỏi thường gặp
     * Lợi ích nổi bật & Gợi ý sử dụng
     * Call-to-action rõ ràng
   - Tối ưu SEO: dùng LSI keywords, từ khóa liên quan tự nhiên
   - KHÔNG bao gồm giá cụ thể, liên hệ trong content (để ở attributes_*)
   - Tất cả 3 ngôn ngữ (vi, en, zh) phải dài và chi tiết tương đương

2. **TIÊU ĐỀ (TITLE):**
   - Độ dài: 50-70 ký tự
   - Bao gồm loại giao dịch (Bán/Cho thuê)
   - Tên sản phẩm chính
   - USP chính (góc 2 mặt tiền, vị trí đắc địa, v.v.)

3. **DESCRIPTION (META DESCRIPTION):**
   - Độ dài: 150-160 ký tự
   - Tóm tắt chính xác, hấp dẫn
   - Chứa primary keyword

4. **EXCERPT:**
   - Độ dài: 200-300 ký tự
   - Phần mở đầu của nội dung
   - Tạo hứng thú cho người đọc

5. **KEYWORDS:**
   - 10-15 từ khóa chính/phụ
   - Ngăn cách bằng dấu phẩy
   - Bao gồm location keywords
   - Bao gồm transactionType keywords (cho thuê, bán, etc.)

6. **READTIME:**
   - Tính dựa trên độ dài content (mỗi 200 từ = 1 phút)
   - Format: "X phút" (vi), "X min/minutes" (en), "X分钟" (zh)

7. **TAGS:**
   - 4-8 tags slug (lowercase, dashes)
   - Bao gồm: loại giao dịch, loại sản phẩm, location
   - Ví dụ: ["cho-thue", "toa-nha", "quan-1", "bat-dong-san"]

**KHÔNG ĐƯA VÀO TRƯỜNG CONTENT:**
- Thông tin liên hệ cụ thể
- Giá bán/thuê cụ thể
- Các điều khoản pháp lý chi tiết

**ĐƯA VÀO CÁC TRƯỜNG ATTRIBUTES:**
- attributes_area: Diện tích (ví dụ: "7x20m, 1000m2")
- attributes_dimensions: Kích thước chi tiết
- attributes_bedrooms/bathrooms/floors: Số lượng
- attributes_location: Địa chỉ đầy đủ
- attributes_price: Giá (ví dụ: "10.5 tỷ", "10,500 USD/tháng")
- attributes_contact: SDT/người liên hệ
- attributes_roadWidth: Độ rộng mặt tiền/đường

**LƯU Ý GIÁ TRỊ HỢP LỆ CHO CÁC TRƯỜNG CHỌN:**
- propertyType: "nha-pho", "biet-thu", "can-ho", "dat-nen", "shophouse", "van-phong", "mat-bang", "phong-tro", "condotel", "penthouse", "toa-nha"
- transactionType: "ban", "cho-thue"
- legalStatus: "so-hong", "so-do", "giay-to-khac", "tat-ca"
- furnished: "co-noi-that", "khong-noi-that", "tat-ca"

**DỮ LIỆU ĐẦU VÀO:**
* Nội dung tin Zalo: ${zaloContent}
`;
}

// Prompt riêng cho LMKT: viết landing page 1 bài/dự án, CTA rõ ràng
function getAiCustomPromptLmkt(projectName) {
  return `
Bạn là chuyên gia copywriting, viết landing page bán dự án bất động sản bằng Tiếng Việt, Tiếng Anh, Tiếng Trung.

NHIỆM VỤ:
- Tạo MỘT đối tượng JSON duy nhất (không kèm văn bản ngoài JSON, không bọc trong \`\`\`json).
- Cấu trúc và trường giống schema web_service_detail (3 ngôn ngữ đầy đủ).
- Phong cách: Landing page thuyết phục, mạch CTA rõ, giàu tiêu đề phụ, bullet lợi ích.
- CTA phải hiển thị hotline và người liên hệ: ${LMKT_CONTACT_PHONE} (${LMKT_CONTACT_NAME}).
- Gắn tags slug hóa: ["${projectName.toLowerCase().replace(/[^a-z0-9-]+/g,"-")}", "landing-page", "bat-dong-san", "cho-thue", "ban"].
- Đưa thông tin giá/diện tích/liên hệ vào attributes_*; content không nhúng giá cụ thể nếu có thể, nhưng CTA có thể nhắc hotline.

TRƯỜNG BẮT BUỘC (giống schema):
{
  "title": "string (50-70 ký tự, gồm giao dịch + tên dự án)",
  "title_en": "string",
  "title_zh": "string",
  "description": "string (150-160 ký tự)",
  "description_en": "string",
  "description_zh": "string",
  "content": "HTML 2000+ ký tự, nhiều h2/h3/ul/li, CTA rõ, không rời rạc",
  "content_en": "HTML tương đương",
  "content_zh": "HTML tương đương",
  "keywords": "10-15 từ khóa, có location",
  "keywords_en": "",
  "keywords_zh": "",
  "excerpt": "200-300 ký tự",
  "excerpt_en": "",
  "excerpt_zh": "",
  "author": "LMKT",
  "readTime": "X phút",
  "tags": ["string"],
  "attributes_area": "", "attributes_dimensions": "", "attributes_bedrooms": "", "attributes_bathrooms": "", "attributes_floors": "", "attributes_frontWidth": "", "attributes_roadWidth": "", "attributes_location": "Địa chỉ đầy đủ",
  "attributes_price": "Khung giá (không cần quá chi tiết)",
  "attributes_contact": "${LMKT_CONTACT_NAME} - ${LMKT_CONTACT_PHONE}",
  "propertyType": "", "transactionType": "", "legalStatus": "", "furnished": ""
}

NỘI DUNG CẦN CÓ (trong 3 ngôn ngữ):
- Hero: USP, vị trí, loại hình (bán/cho thuê), CTA hotline ${LMKT_CONTACT_PHONE}.
- Vị trí & kết nối: mô tả khu Tây, liên kết vùng, tiện ích lân cận.
- Tiện ích & dịch vụ: nội khu, ngoại khu, hạ tầng.
- Thiết kế & mặt bằng: loại căn, diện tích, công năng.
- Chính sách & ưu đãi: tóm tắt khung giá, ưu đãi; không chèn số liệu nhạy cảm chi tiết.
- Lợi ích đầu tư: tiềm năng, thanh khoản, cho thuê.
- FAQ ngắn (3-5 câu hỏi phổ biến).
- CTA cuối trang: nhắc lại ${LMKT_CONTACT_PHONE} (${LMKT_CONTACT_NAME}).

ĐẦU VÀO:
- Tên dự án: ${projectName}
- Domain triển khai: ${LMKT_WEST_DOMAINS}
`;
}

async function generateSEO(zaloContent) {
  const ctx = resolveContext();
  
  // Sử dụng hàm getAiCustomPrompt để lấy prompt đầy đủ với tất cả các trường và yêu cầu
  const customPrompt = getAiCustomPrompt(zaloContent);

  // Sử dụng generateSeoContentWithPrompt để gửi custom prompt
  const generateFn = ctx.helperAi?.generateSeoContentWithPrompt || 
                     (ctx.seftObj && ctx.seftObj.generateSeoContentWithPrompt);
  
  if (typeof generateFn === "function") {
    const result = await generateFn(customPrompt);
    if (result?.success) {
      return result.result || result.data;
    }
    throw new Error(result?.message || "AI generation failed");
  }
  
  // Fallback: dùng hàm cũ nếu không có generateSeoContentWithPrompt (chỉ tạo tiếng Việt)
  const parsed = parseZaloContent(zaloContent);
  const articleType = "Bất động sản";
  // Lấy dòng đầu tiên làm tiêu đề cơ bản nếu thiếu
  const basicTitle = (parsed.normalizedContent || "").split(/\r?\n/)[0]?.trim() || "Bất động sản";
  const additional = `${""}\n${""}\n${""}`; // không có parse chi tiết, để AI tự suy luận
  const primaryKeyword = basicTitle;
  const secondaryKeywords = ["bất động sản", "mua bán", "cho thuê"];
  const seoVi = await callAiGenerateSeoContent(articleType, basicTitle, additional, primaryKeyword, secondaryKeywords);
  
  // Fallback: copy tiếng Việt sang các ngôn ngữ khác
  return {
    title: seoVi?.title || parsed.title,
    description: seoVi?.description || "",
    content: seoVi?.content || "",
    keywords: seoVi?.keywords || "",
    excerpt: seoVi?.excerpt || seoVi?.description || "",
    title_en: seoVi?.title_en || seoVi?.title || title,
    description_en: seoVi?.description_en || seoVi?.description || "",
    content_en: seoVi?.content_en || seoVi?.content || "",
    keywords_en: seoVi?.keywords_en || seoVi?.keywords || "",
    excerpt_en: seoVi?.excerpt_en || seoVi?.excerpt || seoVi?.description || "",
    title_zh: seoVi?.title_zh || seoVi?.title || basicTitle,
    description_zh: seoVi?.description_zh || seoVi?.description || "",
    content_zh: seoVi?.content_zh || seoVi?.content || "",
    keywords_zh: seoVi?.keywords_zh || seoVi?.keywords || "",
    excerpt_zh: seoVi?.excerpt_zh || seoVi?.excerpt || seoVi?.description || "",
    author: seoVi?.author || "Admin BĐS",
    readTime: seoVi?.readTime || "5 phút",
    tags: seoVi?.tags || ["bất động sản"]
  };
}

// ===== API HELPERS =====
async function apiCreateTable(ctx, tableId, struct) {
  if (!ctx.helperApi.createTable) {
    throw new Error("createTable helper không khả dụng. Vui lòng mở AutoSetup để inject csmApi.");
  }

  return ctx.helperApi.createTable({
    app_id: ctx.app_id,
    table_id: tableId,
    struct: struct
  });
}

async function ensureWebServiceDetailTable(ctx) {
  // Kiểm tra bảng đã tồn tại chưa
  try {
    await apiGetTableData(ctx, "web_service_detail", undefined, 1);
    return; // Bảng đã tồn tại
  } catch (e) {
    // Bảng chưa tồn tại, tạo mới
    thongbao("📋 Đang tạo bảng web_service_detail...");
  }

  const struct = {
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
      updated_at: "",
      status: "active",
      domain: "",
      // Attributes
      attributes_area: "",
      attributes_dimensions: "",
      attributes_bedrooms: "",
      attributes_bathrooms: "",
      attributes_floors: "",
      attributes_frontWidth: "",
      attributes_roadWidth: "",
      attributes_location: "",
      attributes_price: "",
      attributes_contact: "",
      attributes_version: "",
      attributes_os: "",
      // BĐS fields
      floor: "",
      floors: "",
      frontWidth: "",
      furnished: false,
      hasGarden: false,
      hasPool: false,
      parking: false,
      grade: "",
      expectedROI: "",
      managedByOperator: false,
      utilities: "",
      hasAC: false,
      legalStatus: "",
      location: "",
      address: "",
      propertyTypeLabel: "",
      transactionTypeLabel: "",
      priceUnit: "",
      priceValue: 0,
      pricePerDayValue: 0,
    },
    fieldsPK: ["slug", "domain", "status"],
    fieldsSearch: [
      "id", "service_type", "slug", "title", "title_en", "title_zh", 
      "tags", "author", "status", "domain", "activeHome", "featured", "priority",
      "propertyTypeLabel", "transactionTypeLabel"
    ],
    fields: {
      0: "id",
      1: "service_type",
      2: "slug",
      3: "title",
      4: "title_en",
      5: "title_zh",
      6: "keywords",
      7: "keywords_en",
      8: "keywords_zh",
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
      28: "updated_at",
      29: "status",
      30: "domain",
      31: "serviceType",
      32: "attributes_area",
      33: "attributes_dimensions",
      34: "attributes_bedrooms",
      35: "attributes_bathrooms",
      36: "attributes_floors",
      37: "attributes_frontWidth",
      38: "attributes_roadWidth",
      39: "attributes_location",
      40: "attributes_price",
      41: "attributes_contact",
      42: "attributes_version",
      43: "attributes_os",
      44: "floor",
      45: "floors",
      46: "frontWidth",
      47: "furnished",
      48: "hasGarden",
      49: "hasPool",
      50: "parking",
      51: "grade",
      52: "expectedROI",
      53: "managedByOperator",
      54: "utilities",
      55: "hasAC",
      56: "legalStatus",
      57: "location",
      58: "address",
      59: "propertyTypeLabel",
      60: "transactionTypeLabel",
      61: "priceUnit",
      62: "priceValue",
      63: "pricePerDayValue",
    }
  };

  const result = await apiCreateTable(ctx, "web_service_detail", struct);
  thongbao("✅ Đã tạo bảng web_service_detail");
  return result;
}

async function apiGetTableData(ctx, objName, where, take) {
  if (!ctx.helperApi.getTableData) {
    throw new Error("getTableData helper không khả dụng. Vui lòng mở AutoSetup để inject csmApi.");
  }
  
  const res = await ctx.helperApi.getTableData({ app_id: ctx.app_id, obj_name: objName, where, take });
  const rows = res?.rows || res?.data || [];
  return Array.isArray(rows) ? rows : [];
}

async function apiUpdateTableData(ctx, objName, command, objUpdate, pkFields, where) {
  const payload = {
    app_id: ctx.app_id,
    obj_name: objName,
    command,
    obj_update: objUpdate,
  };

  const pkSource = where || objUpdate || {};
  if (pkFields && pkFields.length > 0) {
    const conditions = pkFields
      .map(field => pkSource[field] !== undefined ? { field, type: "eq", value: pkSource[field] } : undefined)
      .filter(Boolean);
    if (conditions.length === 1) payload.e_where = conditions[0];
    if (conditions.length > 1) payload.e_where = { operator: "AND", conditions };
  }

  if (ctx.helperApi.updateTableData) {
    return ctx.helperApi.updateTableData({
      app_id: ctx.app_id,
      obj_name: objName,
      command,
      obj_update: objUpdate,
      pk_fields: pkFields,
      where,
    });
  }

  // Nếu không có helper updateTableData, dừng để tránh tự gọi fetch thủ công.
  throw new Error("updateTableData helper không khả dụng trong context này. Mở AutoSetup để inject csmApi.");
}

// ===== UPLOAD =====
async function uploadBase64Image(base64, filename, ctx) {
  if (!base64 || base64.endsWith("...")) {
    throw new Error("Ảnh base64 chưa đầy đủ - hãy paste full base64, không dùng chuỗi ...");
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
  
  // ✅ XÓA DẤU CHỈ TỪ TÊN FILE (giống backend xoa_dau)
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

  const endpoint = DEFAULT_UPLOAD_ENDPOINT;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: ctx.app_id, name: finalFileName, src: base64 }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${res.status} ${res.statusText || ""} ${errText}`.trim());
  }
  const path = await res.text();
  return path.startsWith("/") ? path : `/${path}`;
}

async function uploadImages(ctx, images) {
  const arr = Array.isArray(images) ? images : [];
  const isBase64 = (s = "") => /^data:image\//i.test(s);
  const tasks = arr.map((img, i) => {
    if (!img) return Promise.resolve("");
    if (!isBase64(img)) {
      // Ảnh đã là URL → giữ nguyên, tránh upload nhầm tin khác
      return Promise.resolve(img);
    }
    return uploadBase64Image(img, `zalo-${Date.now()}-${i}.png`, ctx);
  });
  return Promise.all(tasks);
}
// ===== DATA BUILDERS =====
function buildDetail(ctx, seo, imgs, opts) {
  const now = new Date().toISOString();
  
  // AI đã trả về tất cả các trường - chỉ cần lấy từ seo
  const titleVi = seo?.title || "Bất động sản";
  const titleEn = seo?.title_en || titleVi;
  const titleZh = seo?.title_zh || titleVi;
  
  const slug = generateSlug(titleVi);
  
  // Lấy serviceType và propertyType, transactionType từ AI
  const propertyType = seo?.propertyType || "tat-ca";
  const transactionType = seo?.transactionType || "ban";
  const serviceType = "bat-dong-san"; // Mặc định, có thể mở rộng sau
  
  // Lấy description từ format mới hoặc cũ
  const descriptionVi = seo?.description_vi || seo?.description || "";
  const descriptionEn = seo?.description_en || seo?.description || "";
  const descriptionZh = seo?.description_zh || seo?.description || "";
  
  // Mã hoá CONTENT (HTML) cho cả 3 ngôn ngữ - AI trả về là content, content_en, content_zh
  const encodedContentVi = encodeHtml(seo?.content || "");
  const encodedContentEn = encodeHtml(seo?.content_en || "");
  const encodedContentZh = encodeHtml(seo?.content_zh || "");
  
  // Sử dụng các trường custom từ AI nếu có
  const keywordsVi = seo?.keywords_vi || seo?.keywords || descriptionVi.substring(0, 100);
  const keywordsEn = seo?.keywords_en || seo?.keywords || descriptionEn.substring(0, 100);
  const keywordsZh = seo?.keywords_zh || seo?.keywords || descriptionZh.substring(0, 100);
  
  const excerptVi = seo?.excerpt_vi || seo?.excerpt || descriptionVi;
  const excerptEn = seo?.excerpt_en || seo?.excerpt || descriptionEn;
  const excerptZh = seo?.excerpt_zh || seo?.excerpt || descriptionZh;
  
  const author = seo?.author || opts.author || "Admin BĐS";
  const readTime = seo?.readTime || "5 phút";
  const tags = seo?.tags || [serviceType, "mua-ban", "cho-thue"];
  
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
    // Metadata
    image: imgs[0] || "",
    author: author,
    avatar: "https://phanmemmottrieu.net/media/icon.png",
    publishDate: now.split("T")[0],
    readTime: readTime,
    views: 0,
    tags: Array.isArray(tags) ? tags : [serviceType],
    thumbnail: imgs[0] || "",
    images: JSON.stringify(imgs || []),
    activeHome: opts.activeHome,
    featured: opts.featured,
    priority: opts.priority,
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
    // Các trường attributes từ AI
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

// ===== LMKT PROJECT PROMPTS =====
// Danh sách dự án theo thứ tự ưu tiên yêu cầu
const LMKT_PROJECT_DEFS = [
  { service_code: "destino-centro", name: "Destino Centro" },
  { service_code: "the-win-city", name: "The Win City" },
  { service_code: "king-hill-residences", name: "King Hill Residences" },
  { service_code: "kieu-by-kita", name: "Kiều by Kita" },
  { service_code: "ansana-kita-vo-van-kiet", name: "Ansana (Kita Võ Văn Kiệt)" },
  { service_code: "d-homme-quan-6", name: "D-Homme Quận 6" },
];

// 21 chủ đề bài viết chuẩn SEO cho mỗi dự án
const PROJECT_ARTICLE_TOPICS = [
  { slug: "tong-quan-du-an", title: "Tổng quan dự án", goal: "Khái quát đặc điểm nổi bật, quy mô, phân khu" },
  { slug: "vi-tri-lien-ket-vung", title: "Vị trí & liên kết vùng", goal: "Mô tả địa thế, kết nối giao thông, tiện ích xung quanh" },
  { slug: "quy-hoach-tong-the", title: "Quy hoạch tổng thể", goal: "Mặt bằng tổng quan, phân khu chức năng" },
  { slug: "tien-ich-noi-khu", title: "Tiện ích nội khu", goal: "Hệ tiện ích bên trong dự án và trải nghiệm cư dân" },
  { slug: "tien-ich-ngoai-khu", title: "Tiện ích ngoại khu", goal: "Trường học, y tế, thương mại, giải trí lân cận" },
  { slug: "mat-bang-dien-hinh", title: "Mặt bằng điển hình", goal: "Các loại căn, diện tích, bố trí không gian" },
  { slug: "thiet-ke-can-ho-biet-thu", title: "Thiết kế căn hộ/biệt thự", goal: "Phong cách thiết kế, vật liệu, công năng" },
  { slug: "chat-luong-xay-dung", title: "Chất lượng xây dựng & vật liệu", goal: "Tiêu chuẩn thi công, vật liệu hoàn thiện" },
  { slug: "canh-quan-moi-truong-song", title: "Cảnh quan & môi trường sống", goal: "Không gian xanh, tiện nghi sinh hoạt" },
  { slug: "giao-thong-tiep-can", title: "Giao thông & tiếp cận", goal: "Cửa ngõ, trục đường chính, bãi đỗ xe" },
  { slug: "chu-dau-tu-doi-tac", title: "Chủ đầu tư & đối tác", goal: "Năng lực, kinh nghiệm, thương hiệu" },
  { slug: "phap-ly-du-an", title: "Pháp lý dự án", goal: "Hồ sơ pháp lý, tiến độ cấp phép (không nêu chi tiết nhạy cảm)" },
  { slug: "chinh-sach-ban-hang", title: "Chính sách bán hàng", goal: "CSBH hiện hành (không ghi giá cụ thể, để ở attributes_price)" },
  { slug: "gia-ban-tham-khao", title: "Giá bán tham khảo", goal: "Khung giá, biên độ, yếu tố ảnh hưởng (ghi giá ở attributes_price)" },
  { slug: "lich-thanh-toan", title: "Lịch thanh toán", goal: "Tiến độ thanh toán, mốc thời gian (tổng hợp, không chi tiết số tiền)" },
  { slug: "ho-tro-ngan-hang", title: "Hỗ trợ ngân hàng", goal: "Chính sách vay, lãi suất (đặt số liệu ở attributes_* nếu cần)" },
  { slug: "uu-dai-khuyen-mai", title: "Ưu đãi & khuyến mãi", goal: "Chương trình ưu đãi (không đưa liên hệ vào content)" },
  { slug: "tiem-nang-dau-tu", title: "Tiềm năng đầu tư & phân tích", goal: "Tỷ suất sinh lời, cho thuê, thanh khoản (mang tính tham khảo)" },
  { slug: "so-sanh-canh-tranh", title: "So sánh với dự án cạnh tranh", goal: "Lợi thế, khác biệt, định vị" },
  { slug: "tien-do-thi-cong", title: "Tiến độ thi công & cập nhật", goal: "Nhật ký tiến độ, mốc bàn giao (không đưa tài liệu nội bộ)" },
  { slug: "hoi-dap-faq", title: "FAQ - Hỏi đáp người mua", goal: "Giải đáp thắc mắc phổ biến, quy trình mua" },
];

function buildLmktProjectPrompt(projectName, topicTitle, topicGoal) {
  // Tái sử dụng schema chi tiết của getAiCustomPrompt nhưng áp theo chủ đề dự án
  const baseSchema = getAiCustomPrompt(`Dự án: ${projectName}\nChủ đề: ${topicTitle}\nMục tiêu: ${topicGoal}`);
  return baseSchema;
}

function exportLmktProjectPrompts() {
  const prompts = [];
  for (const proj of LMKT_PROJECT_DEFS) {
    for (const topic of PROJECT_ARTICLE_TOPICS) {
      prompts.push({
        project_code: proj.service_code,
        project_name: proj.name,
        topic_slug: topic.slug,
        topic_title: topic.title,
        prompt: buildLmktProjectPrompt(proj.name, topic.title, topic.goal)
      });
    }
  }
  return prompts;
}

async function generateLmktArticlesAI(ctx) {
  const generateFn = ctx.helperAi?.generateSeoContentWithPrompt || (ctx.seftObj && ctx.seftObj.generateSeoContentWithPrompt);
  if (typeof generateFn !== "function") {
    throw new Error("generateSeoContentWithPrompt không khả dụng trong context này");
  }
  let ok = 0, fail = 0;
  for (const proj of LMKT_PROJECT_DEFS) {
    for (const topic of PROJECT_ARTICLE_TOPICS) {
      try {
        const prompt = buildLmktProjectPrompt(proj.name, topic.title, topic.goal);
        const result = await generateFn(prompt);
        if (!result?.success) throw new Error(result?.message || "AI generation failed");
        const seo = result.result || result.data;
        const detail = buildDetail(ctx, seo, [], { author: "LMKT AI", featured: false, activeHome: true, priority: 10 });
        // Gán service_type theo dự án để nhóm đúng danh mục
        detail.service_type = proj.service_code;
        detail.service_code = proj.service_code;
        // Ép domain về cụm khu Tây
        detail.domain = LMKT_WEST_DOMAINS;
        // Đảm bảo contact nằm ở attributes_contact
        if (!detail.attributes_contact) {
          detail.attributes_contact = `${LMKT_CONTACT_NAME} - ${LMKT_CONTACT_PHONE}`;
        }
        // Bổ sung tag dự án
        detail.tags = Array.isArray(detail.tags) ? Array.from(new Set([proj.service_code, ...detail.tags])) : [proj.service_code];
        await upsertDetailLmkt(ctx, detail);
        ok++;
        thongbao(`✅ Đã tạo bài: [${proj.name}] - ${topic.title}`);
      } catch (e) {
        fail++;
        canhbao(`❌ Lỗi tạo bài [${proj.name}] - ${topic.title}: ${e.message}`);
      }
    }
  }
  return { ok, fail };
}

// Sinh landing page (1 bài/dự án) cho LMKT
async function generateLmktLandingPagesAI(ctx) {
  const generateFn = ctx.helperAi?.generateSeoContentWithPrompt || (ctx.seftObj && ctx.seftObj.generateSeoContentWithPrompt);
  if (typeof generateFn !== "function") {
    throw new Error("generateSeoContentWithPrompt không khả dụng trong context này");
  }
  let ok = 0, fail = 0;
  for (const proj of LMKT_PROJECT_DEFS) {
    try {
      const prompt = getAiCustomPromptLmkt(proj.name);
      const result = await generateFn(prompt);
      if (!result?.success) throw new Error(result?.message || "AI generation failed");
      const seo = result.result || result.data;
      const detail = buildDetail(ctx, seo, [], { author: "LMKT AI", featured: true, activeHome: true, priority: 5 });
      detail.service_type = proj.service_code;
      detail.service_code = proj.service_code;
      detail.domain = LMKT_WEST_DOMAINS;
      detail.attributes_contact = `${LMKT_CONTACT_NAME} - ${LMKT_CONTACT_PHONE}`;
      detail.tags = Array.isArray(detail.tags) ? Array.from(new Set([proj.service_code, "landing-page", ...detail.tags])) : [proj.service_code, "landing-page"];
      await upsertDetailLmkt(ctx, detail);
      ok++;
      thongbao(`✅ Landing: ${proj.name}`);
    } catch (e) {
      fail++;
      canhbao(`❌ Landing lỗi [${proj.name}]: ${e.message}`);
    }
  }
  return { ok, fail };
}

async function findExistingDetail(ctx, detail) {
  const where = {
    operator: "AND",
    conditions: [
      { field: "slug", type: "eq", value: detail.slug },
      { field: "service_type", type: "eq", value: detail.service_type },
      { field: "domain", type: "eq", value: detail.domain },
    ],
  };
  const rows = await apiGetTableData(ctx, "web_service_detail", where, 1);
  return rows[0];
}

async function upsertDetail(ctx, detail) {
  const existing = await findExistingDetail(ctx, detail).catch(() => undefined);
  const objUpdate = existing ? { ...existing, ...detail, slug: existing.slug, domain: existing.domain, status: existing.status } : detail;
  const command = existing ? "update" : "create";
  const pkFields = ["slug", "domain", "status"];
  return apiUpdateTableData(ctx, "web_service_detail", command, objUpdate, pkFields, existing ? { slug: existing.slug, domain: existing.domain, status: existing.status } : undefined);
}

// Upsert cho LMKT (ép app_id = "lmkt")
async function upsertDetailLmkt(ctx, detail) {
  const where = {
    operator: "AND",
    conditions: [
      { field: "slug", type: "eq", value: detail.slug },
      { field: "service_type", type: "eq", value: detail.service_type },
      { field: "domain", type: "eq", value: detail.domain },
    ],
  };
  const rows = await ctx.helperApi.getTableData({ app_id: "lmkt", obj_name: "web_service_detail", where, take: 1 }).catch(() => ({ rows: [] }));
  const existing = (rows.rows || rows.data || [])[0];
  const objUpdate = existing ? { ...existing, ...detail, slug: existing.slug, domain: existing.domain, status: existing.status } : detail;
  const command = existing ? "update" : "create";
  const pkFields = ["slug", "domain", "status"];
  if (!ctx.helperApi.updateTableData) throw new Error("updateTableData helper không khả dụng");
  return ctx.helperApi.updateTableData({
    app_id: "lmkt",
    obj_name: "web_service_detail",
    command,
    obj_update: objUpdate,
    pk_fields: pkFields,
    where: existing ? { slug: existing.slug, domain: existing.domain, status: existing.status } : undefined,
  });
}

async function insertLmktCategory(cat, ctx) {
  const objUpdate = {
    ...cat,
    id: cat.id || `${cat.service_code}_${(cat.domain || ctx.domain).replace(/[^a-zA-Z0-9]/g, "_")}`,
    status: cat.status || "active",
    domain: cat.domain || ctx.domain,
  };
  const pkFields = ["service_code", "domain", "status"];
  // Gọi API, ép app_id là "lmkt"
  return ctx.helperApi.updateTableData({
    app_id: "lmkt",
    obj_name: "web_services",
    command: "create",
    obj_update: objUpdate,
    pk_fields: pkFields,
  });
}
// ===== MAIN PROCESS =====
async function processZalo(zalo, opts = {}) {
  const ctx = resolveContext();
  const { author = zalo.sender || "Auto", featured = false, activeHome = true, priority = 10 } = opts;

  // Đảm bảo bảng tồn tại trước khi xử lý
  await ensureWebServiceDetailTable(ctx);

  thongbao("📝 Đang chuẩn hóa nội dung...");
  const parsed = parseZaloContent(zalo.content || "");

  thongbao("🖼️ Đang upload ảnh...");
  const imgs = await uploadImages(ctx, zalo.images || []);

  // Không cho phép lưu nếu không có ảnh hợp lệ
  const validImgs = (imgs || []).filter(Boolean);
  if (validImgs.length === 0) {
    throw new Error("Tin không có ảnh hợp lệ (thumbnail trống, images rỗng)");
  }

  thongbao("🤖 Đang tạo SEO...");
  // Truyền toàn bộ nội dung tin Zalo vào generateSEO - AI sẽ tự extract tất cả
  const seo = await generateSEO(parsed.normalizedContent || zalo.content || "");

  const detail = buildDetail(ctx, seo, validImgs, { author, featured, activeHome, priority });

  thongbao("💾 Đang lưu dữ liệu...");
  const result = await upsertDetail(ctx, detail);

  const fullUrl = `https://www.${ctx.domain}/${detail.service_type}/${detail.slug}.shtml`;
  // 1. Gửi yêu cầu GET
  const response = await fetch(fullUrl, { method: "GET" });
  if (!response.ok) {
    canhbao(`⚠️ Không thể truy cập URL đã lưu: ${fullUrl} (status: ${response.status})`);
  } else {
    thongbao(`✅ URL đã lưu và truy cập được: ${fullUrl}`);
  }
  // Chờ 5 giây trước khi gửi link lên Google Index
  // await new Promise(r => setTimeout(r, 5000));

  // Index lên Google sau khi lưu thành công
  thongbao("🔍 Đang gửi lên Google Index...");
  try {
    const indexResult = await googleIndex(fullUrl, "publish");
    if (indexResult.success) {
      thongbao(`✅ Đã index Google: ${fullUrl}`);
    } else {
      canhbao(`⚠️ Google Index thất bại: ${indexResult.message || "Unknown error"}`);
    }
  } catch (indexError) {
    canhbao(`⚠️ Không thể index Google: ${indexError.message}`);
  }

  return { detail, result };
}

// ===== UI =====
function parseMessages(raw) {
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function runMessages(zaloMessages) {
  thongbao("🚀 Bắt đầu xử lý Zalo...");

  for (let i = 0; i < zaloMessages.length; i++) {
    const msg = zaloMessages[i];
    console.log(`\n[${i + 1}/${zaloMessages.length}] ${msg.sender || "(no sender)"}...`);

    // Kiểm tra nếu không có content thì bỏ qua
    if (!msg.content || !msg.content.trim()) {
      console.warn(`⚠️ Bỏ qua tin nhắn ${i + 1}: không có nội dung`);
      canhbao(`⚠️ Tin nhắn ${i + 1} không có nội dung, đã bỏ qua`);
      continue;
    }

    try {
      const { detail } = await processZalo(msg, {
        author: msg.author || msg.sender || "Auto",
        featured: Boolean(msg.featured),
        activeHome: msg.activeHome !== false,
        priority: Number.isFinite(msg.priority) ? msg.priority : 10 + i,
      });
      thongbao(`✅ Đã lưu: ${detail.title}`);
    } catch (e) {
      console.error("❌ Process error:", e);
      canhbao(`❌ ${e.message}`);
    }

    // Đã loại bỏ delay giữa các tin nhắn
  }

  thongbao("✅ Hoàn tất!");
}

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
        reject(new Error("Không tìm thấy #context-auto (timeout)"));
      }
    }, intervalMs);
  });
}

async function ensureZaloForm() {
  const existing = document.getElementById("zalo-messages-input");
  if (existing) return existing;

  const theme = getThemeTokens();

  const wrapper = document.createElement("div");
  wrapper.id = "zalo-messages-wrapper";
  wrapper.style.maxWidth = "960px";
  wrapper.style.margin = "16px auto";
  wrapper.style.padding = "12px";
  wrapper.style.border = `1px solid ${theme.border}`;
  wrapper.style.borderRadius = "8px";
  wrapper.style.background = theme.bg;
  wrapper.style.color = theme.text;

  const label = document.createElement("div");
  label.textContent = "Dán JSON zaloMessages vào đây rồi nhấn Chạy";
  label.style.fontWeight = "bold";
  label.style.marginBottom = "8px";
  label.style.color = theme.text;

  const textarea = document.createElement("textarea");
  textarea.id = "zalo-messages-input";
  textarea.style.width = "100%";
  textarea.style.minHeight = "200px";
  textarea.style.fontFamily = "monospace";
  textarea.style.fontSize = "12px";
  textarea.style.color = theme.text;
  textarea.style.background = theme.bg;
  textarea.style.border = `1px solid ${theme.border}`;
  textarea.value = `[
  {
    "sender": "FC Tường Fe",
    "content": "107 Nguyễn Thị Thập, Phường Tân Phú, Q7\nDT : 11.7x 29 CN 318,5m2\nKết cấu: Trệt 1 lầu\nVị trí gần Nguyễn Văn Linh\nGiá bán: 95 tỷ bớt lộc\nLiên hệ: 0934 161816 Tường Villa",
    "images": [
      "data:image/png;base64,PASTE_FULL_BASE64_HERE"
    ]
  }
]`;

  const runBtn = document.createElement("button");
  runBtn.textContent = "Chạy";
  runBtn.style.marginTop = "8px";
  runBtn.style.padding = "8px 16px";
  runBtn.style.fontWeight = "bold";
  runBtn.style.background = theme.primary;
  runBtn.style.color = "#fff";
  runBtn.style.border = `1px solid ${theme.primary}`;

  // Nút tạo dữ liệu LMKT
  const createLmktBtn = document.createElement("button");
  createLmktBtn.textContent = "Tạo dữ liệu LMKT";
  createLmktBtn.style.marginTop = "8px";
  createLmktBtn.style.marginLeft = "8px";
  createLmktBtn.style.padding = "8px 16px";
  createLmktBtn.style.fontWeight = "bold";
  createLmktBtn.style.background = "#faad14";
  createLmktBtn.style.color = "#fff";
  createLmktBtn.style.border = "1px solid #faad14";

  createLmktBtn.onclick = async () => {
    createLmktBtn.disabled = true;
    try {
      const ctx = resolveContext();
      let ok = 0, fail = 0;
      for (const cat of lmktCategories) {
        try {
          await insertLmktCategory(cat, ctx);
          ok++;
        } catch (e) {
          fail++;
        }
      }
      thongbao(`✅ Đã tạo ${ok} dữ liệu LMKT, lỗi: ${fail}`);
    } finally {
      createLmktBtn.disabled = false;
    }
  };

  const quotaBtn = document.createElement("button");
  quotaBtn.textContent = "Kiểm tra Quota Google Index";
  quotaBtn.style.marginTop = "8px";
  quotaBtn.style.marginLeft = "8px";
  quotaBtn.style.padding = "8px 16px";
  quotaBtn.style.fontWeight = "bold";
  quotaBtn.style.background = theme.border;
  quotaBtn.style.color = theme.text;
  quotaBtn.style.border = `1px solid ${theme.border}`;

  const checkStatusBtn = document.createElement("button");
  checkStatusBtn.textContent = "Kiểm tra Index Status";
  checkStatusBtn.style.marginTop = "8px";
  checkStatusBtn.style.marginLeft = "8px";
  checkStatusBtn.style.padding = "8px 16px";
  checkStatusBtn.style.fontWeight = "bold";
  checkStatusBtn.style.background = "#1890ff";
  checkStatusBtn.style.color = "#fff";
  checkStatusBtn.style.border = "1px solid #1890ff";

  const getSitesBtn = document.createElement("button");
  getSitesBtn.textContent = "Lấy danh sách Sites";
  getSitesBtn.style.marginTop = "8px";
  getSitesBtn.style.marginLeft = "8px";
  getSitesBtn.style.padding = "8px 16px";
  getSitesBtn.style.fontWeight = "bold";
  getSitesBtn.style.background = "#722ed1";
  getSitesBtn.style.color = "#fff";
  getSitesBtn.style.border = "1px solid #722ed1";

  const indexUrlsBtn = document.createElement("button");
  indexUrlsBtn.textContent = "Index URLs thủ công";
  indexUrlsBtn.style.marginTop = "8px";
  indexUrlsBtn.style.marginLeft = "8px";
  indexUrlsBtn.style.padding = "8px 16px";
  indexUrlsBtn.style.fontWeight = "bold";
  indexUrlsBtn.style.background = "#52c41a";
  indexUrlsBtn.style.color = "#fff";
  indexUrlsBtn.style.border = "1px solid #52c41a";

  const autoPublishBtn = document.createElement("button");
  autoPublishBtn.textContent = "Auto-publish (Check + Publish)";
  autoPublishBtn.style.marginTop = "8px";
  autoPublishBtn.style.marginLeft = "8px";
  autoPublishBtn.style.padding = "8px 16px";
  autoPublishBtn.style.fontWeight = "bold";
  autoPublishBtn.style.background = "#eb2f96";
  autoPublishBtn.style.color = "#fff";
  autoPublishBtn.style.border = "1px solid #eb2f96";

  runBtn.onclick = async () => {
    try {
      runBtn.disabled = true;
      const parsed = parseMessages(textarea.value || "");
      if (!parsed.length) {
        canhbao("Vui lòng dán JSON zaloMessages hợp lệ (mảng objects)");
        return;
      }
      await runMessages(parsed);
    } finally {
      runBtn.disabled = false;
    }
  };

  quotaBtn.onclick = async () => {
    try {
      quotaBtn.disabled = true;
      const quota = await checkGoogleIndexQuota();
      const message = `📊 Google Index Quota:
• Giới hạn hàng ngày: ${quota.daily_limit || 200}
• Đã sử dụng: ${quota.used_today || 0}
• Còn lại: ${quota.remaining || 200}
• Tỷ lệ sử dụng: ${quota.usage_percentage || 0}%
• Ngày reset: ${quota.last_reset_date || 'N/A'}`;
      alert(message);
      thongbao("✅ Đã kiểm tra quota Google Index");
    } catch (e) {
      canhbao(`❌ Lỗi kiểm tra quota: ${e.message}`);
    } finally {
      quotaBtn.disabled = false;
    }
  };

  checkStatusBtn.onclick = async () => {
    try {
      const urlInput = prompt("Nhập URL cần kiểm tra indexing status:");
      if (!urlInput) return;
      checkStatusBtn.disabled = true;
      const url = urlInput.trim();
      if (!url) {
        canhbao("Vui lòng nhập URL hợp lệ");
        return;
      }
      thongbao(`🔍 Đang kiểm tra indexing status...`);
      const result = await checkGoogleIndexStatus(url);
      
      if (result?.success && result?.data) {
        const status = result.data;
        const verdict = status.verdict || status.indexStatusResult?.verdict || "UNKNOWN";
        const lastCrawl = status.lastCrawlTime || status.indexStatusResult?.lastCrawlTime || "N/A";
        const coverageState = status.coverageState || status.indexStatusResult?.coverageState || "N/A";
        
        const message = `📊 Indexing Status cho ${url}:\n• Verdict: ${verdict}\n• Last Crawl: ${lastCrawl}\n• Coverage State: ${coverageState}\n• Indexed: ${verdict.includes('PASS') ? 'YES' : 'NO'}`;
        alert(message);
        thongbao("✅ Đã kiểm tra indexing status");
      } else {
        canhbao(`⚠️ Không lấy được thông tin: ${result?.message || 'Unknown error'}`);
      }
    } catch (e) {
      canhbao(`❌ Lỗi kiểm tra status: ${e.message}`);
    } finally {
      checkStatusBtn.disabled = false;
    }
  };

  getSitesBtn.onclick = async () => {
    try {
      getSitesBtn.disabled = true;
      thongbao(`🔍 Đang lấy danh sách verified sites...`);
      const result = await getGoogleSearchConsoleSites();
      
      if (result?.success && result?.data) {
        const sites = result.data.siteEntry || result.data.sites || [];
        if (sites.length === 0) {
          alert("Không có site nào được verify trong Google Search Console");
        } else {
          const siteList = sites.map((s, i) => `${i + 1}. ${s.siteUrl || s.url || s}\n   Permission: ${s.permissionLevel || 'N/A'}`).join('\n');
          const message = `📊 Verified Sites (${sites.length}):\n${siteList}`;
          alert(message);
          thongbao("✅ Đã lấy danh sách verified sites");
        }
      } else {
        canhbao(`⚠️ Không lấy được danh sách: ${result?.message || 'Unknown error'}`);
      }
    } catch (e) {
      canhbao(`❌ Lỗi lấy danh sách sites: ${e.message}`);
    } finally {
      getSitesBtn.disabled = false;
    }
  };

  indexUrlsBtn.onclick = async () => {
    try {
      const urlInput = prompt("Nhập 1 URL cần index:");
      if (!urlInput) return;
      indexUrlsBtn.disabled = true;
      const url = urlInput.trim();
      if (!url) {
        canhbao("Vui lòng nhập 1 URL hợp lệ");
        return;
      }
      // Kiểm tra nếu nhập nhiều dòng thì báo lỗi
      if (url.includes("\n")) {
        canhbao("Chỉ được nhập 1 URL duy nhất!");
        return;
      }
      thongbao(`🔍 Đang index URL lên Google...`);
      const result = await googleIndex(url, "publish");
      if (result.success) {
        thongbao(`✅ Đã index thành công: ${url}`);
      } else {
        canhbao(`❌ Index thất bại: ${result.message}`);
      }
    } catch (e) {
      canhbao(`❌ Lỗi index: ${e.message}`);
    } finally {
      indexUrlsBtn.disabled = false;
    }
  };

  autoPublishBtn.onclick = async () => {
    try {
      const urlInput = prompt("Nhập URL cần kiểm tra và auto-publish (nếu NEUTRAL):");
      if (!urlInput) return;
      autoPublishBtn.disabled = true;
      const url = urlInput.trim();
      if (!url) {
        canhbao("Vui lòng nhập URL hợp lệ");
        return;
      }
      thongbao(`🔍 Đang kiểm tra và auto-publish...`);
      const result = await checkAndAutoPublish(url);
      
      if (result?.success && result?.data) {
        const data = result.data;
        const verdict = data.verdict || "UNKNOWN";
        const autoPublished = data.autoPublished || false;
        const message = data.message || "";
        
        if (autoPublished) {
          alert(`✅ URL đã được tự động publish!\n\nVerdict: ${verdict}\nStatus: ${message}`);
          thongbao(`✅ Đã auto-publish thành công: ${url}`);
        } else {
          alert(`ℹ️ Kiểm tra hoàn tất\n\nVerdict: ${verdict}\nStatus: ${message}`);
          thongbao(`✅ Đã kiểm tra: ${url}`);
        }
      } else {
        canhbao(`⚠️ Không lấy được thông tin: ${result?.message || 'Unknown error'}`);
      }
    } catch (e) {
      canhbao(`❌ Lỗi auto-publish: ${e.message}`);
    } finally {
      autoPublishBtn.disabled = false;
    }
  };


  // Nút index từng URL từ textarea (mỗi link cách 5s)
  const indexTextareaUrlsBtn = document.createElement("button");
  indexTextareaUrlsBtn.textContent = "Index từng URL (5s/link)";
  indexTextareaUrlsBtn.style.marginTop = "8px";
  indexTextareaUrlsBtn.style.marginLeft = "8px";
  indexTextareaUrlsBtn.style.padding = "8px 16px";
  indexTextareaUrlsBtn.style.fontWeight = "bold";
  indexTextareaUrlsBtn.style.background = "#fa8c16";
  indexTextareaUrlsBtn.style.color = "#fff";
  indexTextareaUrlsBtn.style.border = "1px solid #fa8c16";

  indexTextareaUrlsBtn.onclick = async () => {
    try {
      indexTextareaUrlsBtn.disabled = true;
      const raw = textarea.value || "";
      // Tách từng dòng, loại bỏ dòng trống, loại bỏ khoảng trắng
      const urls = raw.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
      if (!urls.length) {
        canhbao("Vui lòng nhập mỗi URL 1 dòng vào textarea!");
        return;
      }
      thongbao(`🔍 Đang index ${urls.length} URLs lên Google (5s/link)...`);
      let ok = 0, fail = 0;
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          const result = await googleIndex(url, "publish");
          if (result.success) {
            thongbao(`✅ [${i+1}/${urls.length}] Đã index: ${url}`);
            ok++;
          } else {
            canhbao(`❌ [${i+1}/${urls.length}] Lỗi: ${result.message || "Unknown"}`);
            fail++;
          }
        } catch (e) {
          canhbao(`❌ [${i+1}/${urls.length}] Lỗi: ${e.message}`);
          fail++;
        }
        if (i < urls.length - 1) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
      thongbao(`Hoàn tất! Thành công: ${ok}, lỗi: ${fail}`);
    } finally {
      indexTextareaUrlsBtn.disabled = false;
    }
  };

  // Xuất Prompt LMKT (6 dự án x 21 bài)
  const exportPromptsBtn = document.createElement("button");
  exportPromptsBtn.textContent = "Xuất Prompt LMKT (6x21)";
  exportPromptsBtn.style.marginTop = "8px";
  exportPromptsBtn.style.marginLeft = "8px";
  exportPromptsBtn.style.padding = "8px 16px";
  exportPromptsBtn.style.fontWeight = "bold";
  exportPromptsBtn.style.background = "#52c41a";
  exportPromptsBtn.style.color = "#fff";
  exportPromptsBtn.style.border = "1px solid #52c41a";

  const promptsArea = document.createElement("textarea");
  promptsArea.id = "lmkt-prompts-output";
  promptsArea.style.width = "100%";
  promptsArea.style.minHeight = "200px";
  promptsArea.style.fontFamily = "monospace";
  promptsArea.style.fontSize = "12px";
  promptsArea.style.color = theme.text;
  promptsArea.style.background = theme.bg;
  promptsArea.style.border = `1px solid ${theme.border}`;
  promptsArea.style.marginTop = "8px";
  promptsArea.placeholder = "JSON prompts LMKT sẽ hiển thị ở đây...";

  exportPromptsBtn.onclick = async () => {
    try {
      exportPromptsBtn.disabled = true;
      const data = exportLmktProjectPrompts();
      promptsArea.value = JSON.stringify(data, null, 2);
      thongbao(`✅ Đã xuất ${data.length} prompt LMKT để kiểm tra`);
    } catch (e) {
      canhbao(`❌ Xuất prompt thất bại: ${e.message}`);
    } finally {
      exportPromptsBtn.disabled = false;
    }
  };

  // Nút chạy 1 bài/dự án (LMKT)
  const createLmktLandingBtn = document.createElement("button");
  createLmktLandingBtn.textContent = "Tạo 1 bài/dự án (LMKT)";
  createLmktLandingBtn.style.marginTop = "8px";
  createLmktLandingBtn.style.marginLeft = "8px";
  createLmktLandingBtn.style.padding = "8px 16px";
  createLmktLandingBtn.style.fontWeight = "bold";
  createLmktLandingBtn.style.background = "#2f54eb";
  createLmktLandingBtn.style.color = "#fff";
  createLmktLandingBtn.style.border = "1px solid #2f54eb";

  createLmktLandingBtn.onclick = async () => {
    if (!confirm("Chạy AI tạo 1 bài cho mỗi dự án (6 bài)?")) return;
    try {
      createLmktLandingBtn.disabled = true;
      const ctx = resolveContext();
      await ensureWebServiceDetailTable(ctx);
      const { ok, fail } = await generateLmktLandingPagesAI(ctx);
      thongbao(`✅ Hoàn tất tạo 1 bài/dự án LMKT. Thành công: ${ok}, lỗi: ${fail}`);
    } catch (e) {
      canhbao(`❌ Tạo 1 bài/dự án LMKT thất bại: ${e.message}`);
    } finally {
      createLmktLandingBtn.disabled = false;
    }
  };

  // Nút chạy AI tạo 21 bài/mỗi dự án (6 dự án)
  const createLmktArticlesBtn = document.createElement("button");
  createLmktArticlesBtn.textContent = "Tạo 21 bài SEO (LMKT)";
  createLmktArticlesBtn.style.marginTop = "8px";
  createLmktArticlesBtn.style.marginLeft = "8px";
  createLmktArticlesBtn.style.padding = "8px 16px";
  createLmktArticlesBtn.style.fontWeight = "bold";
  createLmktArticlesBtn.style.background = "#13c2c2";
  createLmktArticlesBtn.style.color = "#fff";
  createLmktArticlesBtn.style.border = "1px solid #13c2c2";

  createLmktArticlesBtn.onclick = async () => {
    if (!confirm("Chạy AI tạo 6 x 21 = 126 bài? Việc này có thể tốn thời gian và quota.")) {
      return;
    }
    try {
      createLmktArticlesBtn.disabled = true;
      const ctx = resolveContext();
      await ensureWebServiceDetailTable(ctx);
      const { ok, fail } = await generateLmktArticlesAI(ctx);
      thongbao(`✅ Hoàn tất tạo bài LMKT. Thành công: ${ok}, lỗi: ${fail}`);
    } catch (e) {
      canhbao(`❌ Tạo bài LMKT thất bại: ${e.message}`);
    } finally {
      createLmktArticlesBtn.disabled = false;
    }
  };

  wrapper.appendChild(label);
  wrapper.appendChild(textarea);
  wrapper.appendChild(runBtn);
  wrapper.appendChild(createLmktBtn);
  wrapper.appendChild(createLmktArticlesBtn);
  wrapper.appendChild(exportPromptsBtn);
  wrapper.appendChild(createLmktLandingBtn);
  wrapper.appendChild(quotaBtn);
  wrapper.appendChild(checkStatusBtn);
  wrapper.appendChild(getSitesBtn);
  wrapper.appendChild(indexUrlsBtn);
  wrapper.appendChild(autoPublishBtn);
  wrapper.appendChild(indexTextareaUrlsBtn);
  wrapper.appendChild(promptsArea);

  try {
    const host = await waitForContextAuto();
    host.prepend(wrapper);
    return textarea;
  } catch (err) {
    canhbao("Không tìm thấy #context-auto. Vui lòng mở AutoSetup trước.");
    return textarea;
  }
}

// Export các hàm cần thiết ra global scope để React components có thể sử dụng
if (typeof window !== 'undefined') {
  // Google Index helpers
  window.checkAndAutoPublish = checkAndAutoPublish;
  window.googleIndex = googleIndex;
  window.checkGoogleIndexQuota = checkGoogleIndexQuota;
  window.checkGoogleIndexStatus = checkGoogleIndexStatus;
  window.getGoogleSearchConsoleSites = getGoogleSearchConsoleSites;
  
  // Chat helpers
  window.saveGuestPhone = saveGuestPhone;
  window.getGuestPhone = getGuestPhone;
  window.clearGuestPhone = clearGuestPhone;
  window.loadGuestChatHistory = loadGuestChatHistory;
  window.loadAdminChatHistory = loadAdminChatHistory;
  window.loadAllAppChatHistory = loadAllAppChatHistory;
  window.loadChatGuestsList = loadChatGuestsList;
  window.markGuestMessagesAsRead = markGuestMessagesAsRead;
  window.markAllMessagesAsRead = markAllMessagesAsRead;
}

// Khởi tạo UI khi script được inject, chờ 500ms để DOM sẵn sàng
ensureZaloForm();
// Đã index các URLs lên Google
/*
https://www.phanmemmottrieu.net/bat-dong-san/cho-thue-biet-thu-mat-tien-tran-quoc-thao-quan-3-vi-tri-dac-dia.shtml
https://www.phanmemmottrieu.net/bat-dong-san/cho-thue-mat-bang-goc-2-mat-tien-quan-1-vi-tri-dac-dia.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-cho-thue-biet-thu-quan-1-vi-tri-dac-dia-noi-that-cao-cap.shtml
https://www.phanmemmottrieu.net/bat-dong-san/cho-thue-toa-nha-dien-bien-phu-quan-3-vi-tri-dac-dia.shtml
https://www.phanmemmottrieu.net/bat-dong-san/cho-thue-nguyen-toa-nha-mat-tien-nguyen-van-cu-quan-5-vi-tri-dac-dia.shtml
https://www.phanmemmottrieu.net/bat-dong-san/cho-thue-nha-mat-tien-duong-3-thang-2-quan-10-vi-tri-dac-dia.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-biet-thu-miami-vi-tri-dac-dia-thiet-ke-hien-dai.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-biet-thu-mat-tien-thao-dien-quan-2-gpxd-2-ham-12-tang.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-biet-thu-fideco-phuong-thao-dien-goc-2-mat-tien-doc-la.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-biet-thu-holm-villa-vi-tri-dac-dia-view-song.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-biet-thu-khu-compound-kim-son-nguyen-van-huong-170-ty.shtml
https://www.phanmemmottrieu.net/bat-dong-san/ban-biet-thu-dep-binh-thanh-vi-tri-dac-dia.shtml
*/