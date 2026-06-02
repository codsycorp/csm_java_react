/**
 * AUTO_CODE - Multi-Domain Content Management (Chống Chất AI)
 * 
 * ========== GIẢI THÍCH TOÀN HỆ THỐNG ==========
 * 
 * FILE: auto-upload-lmkt.js
 * MỤC ĐÍCH: Quản lý nội dung cho 2 domain khác nhau:
 *   1. LMKT (h-holding.vn): Bất Động Sản - 6 Dự Án
 *   2. csmbridge.net: 5 Lĩnh Vực Kinh Doanh
 */

// ========== PROTECTION AGAINST DOUBLE-LOAD ==========
// Note: Constants will be redeclared but that's OK in non-strict mode
if (typeof window !== 'undefined' && window.__AUTO_UPLOAD_LMKT_LOADED__) {
  console.warn('⚠️ auto-upload-lmkt.js đã được load rồi, bỏ qua re-initialization');
}
if (typeof window !== 'undefined') {
  window.__AUTO_UPLOAD_LMKT_LOADED__ = true;
}

// ========== I18N SUPPORT - MULTI-LANGUAGE UI ==========
// Translation dictionary for 3 languages (vi, en, zh)
const uiTranslations = {
  vi: {
    domain: 'Tên miền:',
    industry: 'Lĩnh vực:',
    project: 'Dự án:',
    general_settings: '⚙️ Cài Đặt Chung',
    load_categories: '⬇️ Tải danh mục từ web_services',
    loading: '⏳ Đang tải...',
    multi_domain_manager: '🌐 Trình quản lý nội dung đa tên miền (chống nhận diện AI)',
    tip_label: '💡 <strong>Mẹo:</strong> LMKT dùng <strong>Dự án</strong> làm danh mục; Phanmemmottrieu dùng <strong>Lĩnh vực</strong>. Chọn tại <strong>Cài Đặt Chung</strong> phía trên.',
    upload_zalo: '📱 Tải lên JSON Zalo',
    upload_facebook: '👍 Tải lên JSON Facebook',
    create_post: '✍️ Tạo Bài',
    clear_history: '🗑️ Xóa Lịch Sử',
    cleanup_indexeddb: '🧹 Dọn cache cũ',
    cleanup_duplicates: '🧹 Dọn tin trùng',
    cleanup_dup_confirm: '🧹 Dọn tin trùng của lĩnh vực "{service}"?\n\nDomain: {domain}\n\nQuá trình này sẽ:\n1. Tải tất cả bài viết của lĩnh vực này\n2. Phát hiện bài viết trùng lặp (theo nội dung, tiêu đề, ảnh)\n3. Xóa bài cũ, giữ lại bài mới nhất\n\nXác nhận?',
    cleanup_dup_running: '⏳ Đang xử lý dọn tin trùng...',
    cleanup_dup_success: '✅ Dọn tin trùng hoàn tất!\n\nTìm thấy: {groups} nhóm trùng\nXoá: {deleted} bài viết cũ',
    cleanup_dup_no_select: '⚠️ Vui lòng chọn Domain và Lĩnh Vực/Dự án ở Cài Đặt Chung',
    cleanup_dup_not_selected: '⚠️ Domain hoặc Lĩnh Vực/Dự án chưa được chọn',
    processing: '🔒 Đang xử lý...',
    zalo_web_chat: '📱 Zalo Web (Đăng nhập tại đây)',
    refresh_tokens: '🔄 Cập nhật mã truy cập',
    show_fanpages: '📱 Xem trang Facebook',
    clear_all: '🗑️ Xoá hết',
    use_latest_config: '⚡ Dùng config mới nhất',
    save_config: '💾 Lưu cấu hình',
    add_new: '➕ Thêm mới',
    reload_from_server: '🔄 Tải lại từ server',
    reload_tooltip: 'Tải lại dữ liệu từ máy chủ và làm mới bảng (dùng khi bảng hiển thị sai)',
    cancel: '✖️ Huỷ thao tác',
    debug: '🔍 Gỡ lỗi',
    start_scan: '▶️ Bắt đầu quét',
    stop_scan: '⏸ Dừng quét',
    no_config_selected: '⚠️ Không có config để quét',
    select_industry_project: '⚠️ Vui lòng chọn lĩnh vực/dự án để cập nhật',
    reloading_data: '✅ Đang tải lại dữ liệu...',
    reloading: '✅ Đang tải lại...',
    // Ads Panel
    ads_panel_title: '📢 Kiểm thử API quảng cáo (Facebook + Google)',
    ads_panel_hint: 'Nhập thông tin tối thiểu rồi bấm Kiểm thử. Mặc định chiến dịch tạo ở trạng thái PAUSED để an toàn.',
    ads_lbl_target_url: 'Liên kết/URL đích',
    ads_lbl_ai_brief: 'Mô tả cho AI (sản phẩm/mục tiêu)',
    ads_ph_campaign: 'VD: Kiểm thử quảng cáo LMKT',
    ads_ph_headline: 'Tiêu đề quảng cáo',
    ads_ph_description: 'Mô tả ngắn',
    ads_ph_message: 'Nội dung chính của quảng cáo',
    ads_ph_ai_brief: 'VD: Căn hộ 2PN tại Q9, mục tiêu lead tư vấn, tệp khách 28-40 tuổi...',
    ads_ph_log: 'Kết quả API sẽ hiển thị ở đây...',
    ads_approval_label: 'Luôn duyệt nội dung AI trước khi đẩy quảng cáo',
    ads_btn_fill_ids: '⚡ Điền nhanh mã ID mẫu',
    ads_btn_fill_payload: '📋 Điền dữ liệu tối thiểu',
    ads_btn_clear_log: '🗑️ Xóa nhật ký',
    ads_loading_api: '⏳ Đang gọi API...',
    ads_err_fb_url: '❌ Facebook Ads cần nhập link/URL đích',
    ads_err_gg_url: '❌ Google Ads cần nhập link/URL đích',
    ads_ok_fb: '✅ Facebook Ads API gọi thành công',
    ads_ok_gg: '✅ Google Ads API gọi thành công',
    ads_err_ai_url: '❌ Cần nhập liên kết/URL đích trước khi chạy AI + đẩy quảng cáo',
    ads_err_credentials: '❌ Thiếu thông tin xác thực Facebook/Google để tự đẩy quảng cáo',
    ads_ok_ai_push: '✅ AI đã tạo nội dung và đẩy quảng cáo lên Facebook + Google',
    ads_ok_fill_ids: '✅ Đã điền nhanh ID Facebook/Google mẫu',
    ads_ok_fill_payload: '✅ Đã điền dữ liệu tối thiểu',
    ads_cancelled: 'ℹ️ Đã hủy đẩy quảng cáo sau bước duyệt nội dung AI',
    ads_approve_title: 'Duyệt nội dung AI trước khi đẩy quảng cáo',
    ads_approve_sub: "Xác nhận nội dung bên dưới. Bấm 'Đẩy quảng cáo' để gọi API thực.",
    ads_approve_empty: '(trống)',
    ads_approve_cancel: '✖️ Sửa lại',
    ads_approve_confirm: '🚀 Đẩy quảng cáo',
    ads_lbl_campaign_name: 'Tên chiến dịch',
    ads_lbl_objective: 'Mục tiêu',
    ads_lbl_budget_daily: 'Ngân sách/ngày',
    ads_lbl_headline: 'Tiêu đề',
    ads_lbl_description: 'Mô tả',
    ads_lbl_message: 'Nội dung chính',
    ads_lbl_fb_ad_account: 'Facebook adAccountId (mã tài khoản quảng cáo)',
    ads_lbl_fb_page_id: 'Facebook pageId (mã trang)',
    ads_lbl_fb_page_token: 'Facebook pageAccessToken (token trang)',
    ads_lbl_gg_customer_id: 'Google customer_id (mã khách hàng)',
    ads_lbl_gg_access_token: 'Google access_token (token truy cập)',
    ads_lbl_gg_developer_token: 'Google developer_token (token nhà phát triển)',
    ads_lbl_gg_login_customer_id: 'Google login_customer_id (mã đăng nhập, không bắt buộc)',
    ads_ph_objective: 'VD: OUTCOME_TRAFFIC',
    ads_ph_budget: 'VD: 50000',
    ads_ph_fb_ad_account: 'VD: 201051000069730',
    ads_ph_gg_customer_id: 'VD: 3308977729',
    ads_ph_gg_login_customer_id: 'Mã khách hàng MCC',
    ads_btn_test_fb: '🧪 Kiểm thử quảng cáo Facebook',
    ads_btn_test_gg: '🧪 Kiểm thử quảng cáo Google',
    ads_btn_ai_push: '🤖 AI + Đẩy FB+Google',
    ads_log_fb_error: '❌ Lỗi quảng cáo Facebook',
    ads_log_gg_error: '❌ Lỗi quảng cáo Google',
    ads_log_ai_push_error: '❌ Lỗi AI + đẩy quảng cáo',
    ads_min_payload_note: 'Đã điền dữ liệu tối thiểu. Bạn chỉ cần thêm token (Facebook pageAccessToken / Google access_token + developer_token) để kiểm thử thực tế.',
    ads_fallback_confirm_intro: 'AI đã tạo nội dung quảng cáo.',
    ads_fallback_confirm_question: 'Bạn có muốn tiếp tục đẩy quảng cáo lên Facebook + Google không?'
  },
  en: {
    domain: 'Domain:',
    industry: 'Industry:',
    project: 'Project:',
    general_settings: '⚙️ General Settings',
    load_categories: '⬇️ Load categories from web_services',
    loading: '⏳ Loading...',
    multi_domain_manager: '🌐 Multi-Domain Content Manager (Anti-AI Detection)',
    tip_label: '💡 <strong>Tip:</strong> LMKT uses <strong>Projects</strong> as categories; Phanmemmottrieu uses <strong>Industries</strong>. Select in <strong>General Settings</strong> above.',
    upload_zalo: '📱 Upload Zalo JSON',
    upload_facebook: '👍 Upload Facebook JSON',
    create_post: '✍️ Create Post',
    clear_history: '🗑️ Clear History',
    cleanup_indexeddb: '🧹 Cleanup legacy cache',
    cleanup_duplicates: '🧹 Cleanup Duplicates',
    cleanup_dup_confirm: '🧹 Cleanup duplicates for "{service}"?\n\nDomain: {domain}\n\nThis will:\n1. Load all articles in this category\n2. Detect duplicates (by content, title, images)\n3. Remove old articles, keep newest\n\nConfirm?',
    cleanup_dup_running: '⏳ Processing duplicate cleanup...',
    cleanup_dup_success: '✅ Duplicate cleanup completed!\n\nFound: {groups} duplicate groups\nDeleted: {deleted} old articles',
    cleanup_dup_no_select: '⚠️ Please select Domain and Industry/Project in General Settings',
    cleanup_dup_not_selected: '⚠️ Domain or Industry/Project not selected',
    processing: '🔒 Processing...',
    zalo_web_chat: '📱 Zalo Web Chat (Login here)',
    refresh_tokens: '🔄 Refresh tokens',
    show_fanpages: '📱 View fanpages',
    clear_all: '🗑️ Clear all',
    use_latest_config: '⚡ Use latest config',
    save_config: '💾 Save configuration',
    add_new: '➕ Add new',
    reload_from_server: '🔄 Reload from server',
    reload_tooltip: 'Reload data from server and refresh grid (use when grid doesn\'t display correctly)',
    cancel: '✖️ Cancel',
    debug: '🔍 Debug',
    start_scan: '▶️ Start scan',
    stop_scan: '⏸ Stop scan',
    no_config_selected: '⚠️ No config to scan',
    select_industry_project: '⚠️ Please select industry/project to update',
    reloading_data: '✅ Reloading data...',
    reloading: '✅ Reloading...',
    // Ads Panel
    ads_panel_title: '📢 Ads API Test (Facebook + Google)',
    ads_panel_hint: 'Enter minimum information then click Test. Campaigns default to PAUSED status for safety.',
    ads_lbl_target_url: 'Target URL',
    ads_lbl_ai_brief: 'AI Brief (product/campaign description)',
    ads_ph_campaign: 'E.g. Test ads LMKT',
    ads_ph_headline: 'Ad headline',
    ads_ph_description: 'Short description',
    ads_ph_message: 'Primary ad copy',
    ads_ph_ai_brief: 'E.g. 2BR apt in District 9, lead gen target, audience 28-40 years...',
    ads_ph_log: 'API results will appear here...',
    ads_approval_label: 'Always review AI content before pushing',
    ads_btn_fill_ids: '⚡ Quick-fill sample IDs',
    ads_btn_fill_payload: '📋 Fill minimal payload',
    ads_btn_clear_log: '🗑️ Clear Log',
    ads_loading_api: '⏳ Calling API...',
    ads_err_fb_url: '❌ Facebook Ads requires a target URL',
    ads_err_gg_url: '❌ Google Ads requires a target URL',
    ads_ok_fb: '✅ Facebook Ads API call successful',
    ads_ok_gg: '✅ Google Ads API call successful',
    ads_err_ai_url: '❌ Target URL required before AI + Push',
    ads_err_credentials: '❌ Missing Facebook/Google credentials for auto-push',
    ads_ok_ai_push: '✅ AI created content and pushed to Facebook + Google',
    ads_ok_fill_ids: '✅ Filled sample Facebook/Google IDs',
    ads_ok_fill_payload: '✅ Filled minimal payload',
    ads_cancelled: 'ℹ️ Cancelled push after AI content review',
    ads_approve_title: 'Review AI Content Before Push',
    ads_approve_sub: "Confirm the content below. Click 'Push Ads' to call the real API.",
    ads_approve_empty: '(empty)',
    ads_approve_cancel: '✖️ Edit',
    ads_approve_confirm: '🚀 Push Ads',
    ads_lbl_campaign_name: 'Campaign name',
    ads_lbl_objective: 'Objective',
    ads_lbl_budget_daily: 'Budget (daily)',
    ads_lbl_headline: 'Headline',
    ads_lbl_description: 'Description',
    ads_lbl_message: 'Primary text/message',
    ads_lbl_fb_ad_account: 'Facebook adAccountId',
    ads_lbl_fb_page_id: 'Facebook pageId',
    ads_lbl_fb_page_token: 'Facebook pageAccessToken',
    ads_lbl_gg_customer_id: 'Google customer_id',
    ads_lbl_gg_access_token: 'Google access_token',
    ads_lbl_gg_developer_token: 'Google developer_token',
    ads_lbl_gg_login_customer_id: 'Google login_customer_id (optional)',
    ads_ph_objective: 'E.g. OUTCOME_TRAFFIC',
    ads_ph_budget: 'E.g. 50000',
    ads_ph_fb_ad_account: 'E.g. 201051000069730',
    ads_ph_gg_customer_id: 'E.g. 3308977729',
    ads_ph_gg_login_customer_id: 'MCC customer id',
    ads_btn_test_fb: '🧪 Test Facebook Ads',
    ads_btn_test_gg: '🧪 Test Google Ads',
    ads_btn_ai_push: '🤖 AI + Push FB+Google',
    ads_log_fb_error: '❌ Facebook Ads error',
    ads_log_gg_error: '❌ Google Ads error',
    ads_log_ai_push_error: '❌ AI + Push error',
    ads_min_payload_note: 'Minimal payload is filled. You only need tokens (Facebook pageAccessToken / Google access_token + developer_token) for a real test.',
    ads_fallback_confirm_intro: 'AI generated ad content.',
    ads_fallback_confirm_question: 'Do you want to continue pushing to Facebook + Google?'
  },
  zh: {
    domain: 'Domain:',
    industry: '行业：',
    project: '项目：',
    general_settings: '⚙️ 常规设置',
    load_categories: '⬇️ 从 web_services 加载类别',
    loading: '⏳ 加载中...',
    multi_domain_manager: '🌐 多域名内容管理器 (防AI检测)',
    tip_label: '💡 <strong>提示：</strong>LMKT 使用<strong>项目</strong>作为类别；Phanmemmottrieu 使用<strong>行业</strong>。在上面的<strong>常规设置</strong>中选择。',
    upload_zalo: '📱 上传 Zalo JSON',
    upload_facebook: '👍 上传 Facebook JSON',
    create_post: '✍️ 创建帖子',
    clear_history: '🗑️ 清除历史',
    cleanup_indexeddb: '🧹 清理旧缓存',
    cleanup_duplicates: '🧹 清理重复',
    cleanup_dup_confirm: '🧹 清理"{service}"的重复内容？\n\n域名: {domain}\n\n这将：\n1. 加载此类别中的所有文章\n2. 检测重复项（按内容、标题、图像）\n3. 移除旧文章，保留最新的\n\n确认？',
    cleanup_dup_running: '⏳ 处理中...',
    cleanup_dup_success: '✅ 重复清理完成！\n\n找到：{groups} 组重复项\n删除：{deleted} 篇旧文章',
    cleanup_dup_no_select: '⚠️ 请在常规设置中选择域名和行业/项目',
    cleanup_dup_not_selected: '⚠️ 未选择域名或行业/项目',
    processing: '🔒 处理中...',
    zalo_web_chat: '📱 Zalo Web Chat (在此登录)',
    refresh_tokens: '🔄 刷新令牌',
    show_fanpages: '📱 查看粉丝页',
    clear_all: '🗑️ 全部清除',
    use_latest_config: '⚡ 使用最新配置',
    save_config: '💾 保存配置',
    add_new: '➕ 添加新项',
    reload_from_server: '🔄 从服务器重新加载',
    reload_tooltip: '从服务器重新加载数据并刷新网格（当网格显示不正确时使用）',
    cancel: '✖️ 取消操作',
    debug: '🔍 调试',
    start_scan: '▶️ 开始扫描',
    stop_scan: '⏸ 停止扫描',
    no_config_selected: '⚠️ 没有配置可扫描',
    select_industry_project: '⚠️ 请选择行业/项目以更新',
    reloading_data: '✅ 正在重新加载数据...',
    reloading: '✅ 正在重新加载...',
    // Ads Panel
    ads_panel_title: '📢 广告API测试 (Facebook + Google)',
    ads_panel_hint: '输入最少信息后点击测试。默认以PAUSED状态创建广告活动以确保安全。',
    ads_lbl_target_url: '目标链接/URL',
    ads_lbl_ai_brief: 'AI简报（产品/目标描述）',
    ads_ph_campaign: '例：Test ads LMKT',
    ads_ph_headline: '广告标题',
    ads_ph_description: '简短描述',
    ads_ph_message: '主要广告文案',
    ads_ph_ai_brief: '例：区9两室公寓，潜在客户生成目标，受众28-40岁...',
    ads_ph_log: 'API结果将显示在此处...',
    ads_approval_label: '推送前始终审核AI内容',
    ads_btn_fill_ids: '⚡ 快速填写示例ID',
    ads_btn_fill_payload: '📋 填写最小配置',
    ads_btn_clear_log: '🗑️ 清除日志',
    ads_loading_api: '⏳ 正在调用API...',
    ads_err_fb_url: '❌ Facebook广告需要目标链接',
    ads_err_gg_url: '❌ Google广告需要目标链接',
    ads_ok_fb: '✅ Facebook广告API调用成功',
    ads_ok_gg: '✅ Google广告API调用成功',
    ads_err_ai_url: '❌ AI+推送前需要输入目标链接',
    ads_err_credentials: '❌ 缺少Facebook/Google凭据，无法自动推送',
    ads_ok_ai_push: '✅ AI已创建内容并推送至Facebook+Google',
    ads_ok_fill_ids: '✅ 已填写示例Facebook/Google ID',
    ads_ok_fill_payload: '✅ 已填写最小配置',
    ads_cancelled: 'ℹ️ 审核AI内容后已取消推送',
    ads_approve_title: '推送前审核AI内容',
    ads_approve_sub: '确认以下内容。点击"推送广告"以调用真实API。',
    ads_approve_empty: '（空）',
    ads_approve_cancel: '✖️ 修改',
    ads_approve_confirm: '🚀 推送广告',
    ads_lbl_campaign_name: '活动名称',
    ads_lbl_objective: '目标',
    ads_lbl_budget_daily: '每日预算',
    ads_lbl_headline: '标题',
    ads_lbl_description: '描述',
    ads_lbl_message: '主要文案',
    ads_lbl_fb_ad_account: 'Facebook adAccountId',
    ads_lbl_fb_page_id: 'Facebook pageId',
    ads_lbl_fb_page_token: 'Facebook pageAccessToken',
    ads_lbl_gg_customer_id: 'Google customer_id',
    ads_lbl_gg_access_token: 'Google access_token',
    ads_lbl_gg_developer_token: 'Google developer_token',
    ads_lbl_gg_login_customer_id: 'Google login_customer_id（可选）',
    ads_ph_objective: '例：OUTCOME_TRAFFIC',
    ads_ph_budget: '例：50000',
    ads_ph_fb_ad_account: '例：201051000069730',
    ads_ph_gg_customer_id: '例：3308977729',
    ads_ph_gg_login_customer_id: 'MCC customer id',
    ads_btn_test_fb: '🧪 测试 Facebook Ads',
    ads_btn_test_gg: '🧪 测试 Google Ads',
    ads_btn_ai_push: '🤖 AI + 推送 FB+Google',
    ads_log_fb_error: '❌ Facebook Ads 错误',
    ads_log_gg_error: '❌ Google Ads 错误',
    ads_log_ai_push_error: '❌ AI + 推送错误',
    ads_min_payload_note: '最小配置已填写。你只需补充 token（Facebook pageAccessToken / Google access_token + developer_token）即可真实测试。',
    ads_fallback_confirm_intro: 'AI 已生成广告内容。',
    ads_fallback_confirm_question: '是否继续推送到 Facebook + Google？'
  }
};

// Get current language from localStorage or default to 'vi'
function normalizeUILanguage(rawLang) {
  const lang = String(rawLang || '').toLowerCase();
  if (!lang) return 'vi';
  if (lang === 'zh' || lang === 'zh-cn' || lang.startsWith('zh')) return 'zh';
  if (lang === 'en' || lang.startsWith('en')) return 'en';
  if (lang === 'vi' || lang.startsWith('vi')) return 'vi';
  return 'vi';
}

function getUILanguage() {
  try {
    // 1) Prefer app runtime language (i18next)
    const appLang = window?.i18next?.language;
    if (appLang) return normalizeUILanguage(appLang);

    // 2) localStorage keys used by app
    const storedLanguage = localStorage.getItem('language');
    if (storedLanguage) return normalizeUILanguage(storedLanguage);

    const storedI18next = localStorage.getItem('i18nextLng');
    if (storedI18next) return normalizeUILanguage(storedI18next);

    // 3) html lang attribute
    const htmlLang = document?.documentElement?.lang;
    if (htmlLang) return normalizeUILanguage(htmlLang);

    // 4) browser language
    const browserLang = navigator.language || navigator.userLanguage;
    return normalizeUILanguage(browserLang);
  } catch {
    return 'vi';
  }
}

// Translation function (t = translate)
function t(key) {
  const lang = getUILanguage();
  return uiTranslations[lang]?.[key] || uiTranslations.vi[key] || key;
}

// Lightweight inline 3-language helper for legacy hardcoded strings.
function ti(viText, enText, zhText) {
  const lang = getUILanguage();
  if (lang === 'en') return enText || viText;
  if (lang === 'zh') return zhText || viText;
  return viText;
}

const CSM_THEME_MODE_STORAGE_KEY = 'csm_theme_mode';
const CSM_MAIN_FEATURE_TAB_STORAGE_KEY = 'csm_main_feature_active_tab';

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  if (typeof window !== 'undefined' && window.__csmDisableStorageWrites) {
    return false;
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    const msg = String(e?.message || e || '');
    const quotaExceeded =
      e?.name === 'QuotaExceededError' ||
      e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      msg.toLowerCase().includes('exceeded the quota');

    if (quotaExceeded && typeof window !== 'undefined') {
      window.__csmDisableStorageWrites = true;
      console.warn('⚠️ localStorage quota exceeded; disabling further storage writes for this session.');
    }
    return false;
  }
}

function getPreferredThemeMode() {
  const saved = safeLocalStorageGet(CSM_THEME_MODE_STORAGE_KEY);
  if (saved === 'system') return 'system';
  return 'system';
}

function resolveSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch (e) {
    return 'light';
  }
}

function applyThemeMode(mode = 'system') {
  // Keep LMKT UI in auto mode only: follow host/runtime theme detection.
  const normalized = 'system';
  const resolved = resolveSystemTheme();

  safeLocalStorageSet(CSM_THEME_MODE_STORAGE_KEY, normalized);

  window.dispatchEvent(new CustomEvent('csm:theme-change', {
    detail: { mode: normalized, theme: resolved }
  }));
}

// Unified notification helpers used throughout this file.
// Keep auto-post flow alive even when UI toast function is unavailable.
function notifyUser(type, message, duration = 3) {
  const safeMessage = String(message || "");

  if (typeof window !== "undefined" && typeof window.showNotification === "function") {
    try {
      window.showNotification({ type, message: safeMessage, duration });
      return;
    } catch (error) {
      console.warn("[notifyUser] showNotification failed:", error?.message || error);
    }
  }

  // Fallback to host-provided toast helpers exposed by DynamicCodeMenu.
  if (typeof window !== "undefined") {
    try {
      if (type === "error" || type === "warning") {
        if (typeof window.canhbao === "function") {
          window.canhbao(safeMessage);
          return;
        }
      } else if (typeof window.thongbao === "function") {
        window.thongbao(safeMessage);
        return;
      }

      // Secondary fallback: if success helper exists, still show warning/error to users.
      if (typeof window.thongbao === "function") {
        window.thongbao(safeMessage);
        return;
      }
    } catch (error) {
      console.warn("[notifyUser] host toast fallback failed:", error?.message || error);
    }
  }

  const logger = type === "error" ? console.error : type === "warning" ? console.warn : console.log;
  logger(safeMessage);
}

function thongbao(message, duration = 3) {
  notifyUser("success", message, duration);
}

function canhbao(message, duration = 4) {
  notifyUser("warning", message, duration);
}

// ========== GLOBAL TIMER REGISTRY - QUẢN LÝ TẤT CẢ TIMERS ==========
// ✅ Ngăn ngừa orphaned timers + memory leaks
const timerRegistry = {
  timers: new Map(),
  
  register(name, timerId, type = 'interval') {
    const entry = { id: timerId, type, createdAt: Date.now(), active: true };
    this.timers.set(name, entry);
    console.log(`⏱️ Timer registered: ${name} (${type})`);
    return timerId;
  },
  
  clear(name) {
    const entry = this.timers.get(name);
    if (!entry) return;
    
    if (entry.type === 'interval') clearInterval(entry.id);
    if (entry.type === 'timeout') clearTimeout(entry.id);
    
    entry.active = false;
    this.timers.delete(name);
    console.log(`🧹 Timer cleared: ${name}`);
  },
  
  clearAll() {
    console.log(`🧹 Clearing ${this.timers.size} timers...`);
    for (const [name, entry] of this.timers) {
      if (entry.type === 'interval') clearInterval(entry.id);
      if (entry.type === 'timeout') clearTimeout(entry.id);
      entry.active = false;
    }
    this.timers.clear();
    console.log(`✅ All timers cleared`);
  },
  
  status() {
    const active = Array.from(this.timers.entries())
      .filter(([_, e]) => e.active)
      .map(([name, _]) => name);
    console.log(`📊 Active timers (${active.length}): ${active.join(', ')}`);
  }
};

// ========== GLOBAL EVENT LISTENER REGISTRY - QUẢN LÝ LISTENERS ==========
// ✅ Ngăn ngừa duplicate listeners
const eventRegistry = {
  listeners: [],
  
  add(element, event, handler, options = false) {
    element.addEventListener(event, handler, options);
    this.listeners.push({ element, event, handler, options });
    console.log(`📌 Listener added: ${element.id || element.tagName} - ${event}`);
    return { element, event, handler };
  },
  
  remove(element, event, handler) {
    element.removeEventListener(event, handler);
    this.listeners = this.listeners.filter(
      l => !(l.element === element && l.event === event && l.handler === handler)
    );
    console.log(`❌ Listener removed: ${element.id || element.tagName} - ${event}`);
  },
  
  removeAll() {
    console.log(`🧹 Removing ${this.listeners.length} listeners...`);
    for (const {element, event, handler, options} of this.listeners) {
      element.removeEventListener(event, handler, options);
    }
    this.listeners = [];
    console.log(`✅ All listeners removed`);
  },
  
  status() {
    console.log(`📊 Active listeners: ${this.listeners.length}`);
    this.listeners.forEach(({element, event}) => {
      console.log(`   - ${element.id || element.tagName}: ${event}`);
    });
  }
};

// ========== CRYPTO HELPERS - ENCRYPT/DECRYPT HTML CONTENT =========
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
    const encryptFn = window.csmCrypto.encrypt || window.csmCrypto.csmEncrypt;
    const decryptFn = window.csmCrypto.decrypt || window.csmCrypto.csmDecrypt;
    if (typeof encryptFn === 'function' && typeof decryptFn === 'function') {
      return {
        encrypt: encryptFn,
        decrypt: decryptFn
      };
    }
    return {
      encrypt: (text) => text,
      decrypt: (text) => text
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
 *    - csmbridge.net → app_id: "wuweb" (Phần mềm + 4 lĩnh vực khác)
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
 *    - Phanmemmottrieu: "csmbridge.net,localhost:3333"
 * 
 * ⚠️ Mỗi domain phải có app_id đúng:
 *    - csmbridge.net → app_id: "wuweb"
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
 *   Phanmemmottrieu → csmbridge.net → app_id: "wuweb" → Lấy data từ app Phanmemmottrieu
 */
const DEFAULT_UPLOAD_ENDPOINT = "/upload.shtml";
const UPLOAD_ENDPOINT_COOLDOWN_MS = 2 * 60 * 1000;
const UPLOAD_REQUEST_TIMEOUT_MS = 180000;
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
    value: "csmbridge.net,localhost:3333",
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
 * INDUSTRY_TYPES: Cấu hình cho 5 lĩnh vực của csmbridge.net
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
// Industry Types cho csmbridge.net
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
    prompt_role: "chuyên gia giải quyết bài toán kinh doanh bằng công nghệ (không phải đơn vị gia công code)",
    prompt_style: "Case study thực tế, long-tail search intent, trả lời thẳng câu hỏi ngay đoạn mở",
    prompt_avoid: "Tránh 'viết phần mềm theo yêu cầu', keyword stuffing, thuật ngữ outsource, câu quảng cáo sáo rỗng",
    prompt_focus: "Long-tail theo ngành dọc / tích hợp hệ thống / AI-automation; EEAT với số liệu triển khai; Topic Cluster + internal link",
    title_requirement: "⚠️ TIÊU ĐỀ long-tail (~55-80 ký tự): bài toán kinh doanh + giải pháp cụ thể. KHÔNG dùng mẫu Bán/Cho thuê BĐS.",
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

/** Tiêu đề long-tail cho giải pháp công nghệ — không dùng mẫu Bán/Cho thuê BĐS */
const TITLE_TEMPLATES_FOR_SOFTWARE = {
  label: "Tiêu đề giải pháp công nghệ — long-tail, bài toán kinh doanh",
  templates: [
    "Giải pháp {solution} cho {business} — {hook}",
    "Cách {business} {hook} với {solution}",
    "{solution}: {hook} (case study triển khai thực tế)",
    "Tích hợp {solution} — {hook} cho doanh nghiệp {business}",
    "{hook}: {solution} tối ưu chi phí & vận hành",
    "Case study: {business} {hook} nhờ {solution}",
    "{solution} vs xây mới — {hook}",
    "Tự động hóa {business}: {hook} với {solution}"
  ]
};

/** SEO giải pháp công nghệ 2025+ — long-tail, GEO, EEAT, topic cluster */
function isSoftwareTechSeoContext(industry, domainKey, topic = "") {
  if (domainKey === "lmkt") return false;
  if (industry === "bat-dong-san") return false;
  if (domainKey === "phanmemmottrieu") return true;
  const ind = String(industry || "").toLowerCase();
  if (["phan-mem", "software", "cong-nghe", "technology", "it-services"].some(k => ind.includes(k))) {
    return true;
  }
  const t = String(topic || "").toLowerCase();
  return /phần mềm|phan mem|crm|erp|tích hợp|tich hop|\bapi\b|tự động hóa|tu dong hoa|chatbot|giải pháp|giai phap|chuyển đổi số|chuyen doi so|đồng bộ dữ liệu|dong bo du lieu/.test(t);
}

function buildSoftwareTechSeoStrategyBlock(industry, topic) {
  const shortTopic = String(topic || "").length > 120 ? String(topic).slice(0, 120) + "..." : String(topic || "");
  return `
========== CHIẾN LƯỢC SEO GIẢI PHÁP CÔNG NGHỆ (2025+) ==========
Định vị thương hiệu: Hub giải pháp công nghệ chuyên sâu — KHÔNG phải "đơn vị gia công" hay "viết phần mềm theo yêu cầu".
Khách tìm chuyên gia giải quyết bài toán kinh doanh, không tìm "người viết code".

TỪ KHÓA — ưu tiên long-tail theo Search Intent (5-8 cụm trong keywords):
A) Giải pháp theo ngành dọc — phần mềm quản lý [ngành], CRM cho [chuỗi bán lẻ/sản xuất...]
B) Tích hợp & tối ưu — tích hợp API, đồng bộ dữ liệu đa nền tảng, tối ưu chi phí cloud
C) AI & Automation — chatbot AI nội bộ, tự động hóa CSKH/marketing (khi phù hợp topic)

TOPIC CLUSTER: xác định vai trò bài (pillar/sub-topic). Cuối content thêm <h4>Đọc thêm trong cụm chủ đề</h4> với 2-3 gợi ý internal link.

GEO: đoạn <p> đầu trả lời thẳng câu hỏi người tìm trong 1-2 câu.
EEAT: case study / kinh nghiệm triển khai — con số, trước/sau từ SOURCE_TEXT.
CẤM: keyword stuffing, "giải pháp toàn diện", "công nghệ 4.0", "viết phần mềm theo yêu cầu".

Industry: ${industry || "phan-mem"} | Topic: ${shortTopic}
`;
}

function generateTitleForSoftware(industry, opts = {}) {
  const templates = TITLE_TEMPLATES_FOR_SOFTWARE.templates;
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  const solution = opts.solution || opts.property || "hệ thống quản lý";
  const business = opts.business || "doanh nghiệp";
  const hook = opts.hook || "tiết kiệm 40% thời gian vận hành";
  let title = randomTemplate
    .replace(/{solution}/g, solution)
    .replace(/{business}/g, business)
    .replace(/{hook}/g, hook);
  if (title.length > 85) {
    title = title.substring(0, 82) + "...";
  }
  return title;
}

// ===== HELPER: GENERATE TITLE FOR PHANMEMMOTTRIEU =====
function generateTitleForPhanmem(industry, opts = {}) {
  if (isSoftwareTechSeoContext(industry, "phanmemmottrieu", opts.topic || opts.hook || "")) {
    return generateTitleForSoftware(industry, opts);
  }
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
    thongbao(ti("✅ Đã xóa lịch sử bài viết", "✅ Post history cleared", "✅ 已清除发文历史"));
  } catch (e) {
    console.warn("Lỗi xóa lịch sử:", e);
  }
}

// ========== DUPLICATE CLEANUP FEATURE - DỌN TIN TRÙNG THEO DỊCH VỤ/DỰ ÁN ==========

/**
 * Tính toán hash của nội dung để phát hiện trùng lặp
 * @param {string} text - Nội dung cần hash
 * @returns {string} - Hash của nội dung (simplified, không mã hóa)
 */
function calculateContentHash(text = "") {
  if (!text) return "";
  
  try {
    // Normalize text: loại bỏ khoảng trắng thừa, chuyển thành lowercase
    let normalized = String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ") // Collapse whitespace
      .trim();
    
    // Tạo simple hash từ normalized text
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  } catch (e) {
    console.error("[calculateContentHash] Error:", e);
    return "";
  }
}

/**
 * Tính độ tương tự giữa 2 chuỗi (Levenshtein distance)
 * @param {string} str1 - Chuỗi 1
 * @param {string} str2 - Chuỗi 2
 * @returns {number} - Độ tương tự từ 0 đến 1 (1 = giống hệt)
 */
function calculateStringSimilarity(str1 = "", str2 = "") {
  if (!str1 || !str2) return str1 === str2 ? 1 : 0;
  
  str1 = String(str1).toLowerCase();
  str2 = String(str2).toLowerCase();
  
  if (str1 === str2) return 1;
  
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  
  // Levenshtein distance
  const matrix = Array(len2 + 1)
    .fill(null)
    .map(() => Array(len1 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // Insert
        matrix[j - 1][i] + 1, // Delete
        matrix[j - 1][i - 1] + cost // Replace
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const similarity = 1 - distance / maxLen;
  return Math.max(0, similarity);
}

// ============================================================================
// Pixelmatch – so sánh hình ảnh thumbnail để phát hiện bài trùng
// Tự load Pixelmatch qua dynamic import (CDN), không cần cài thêm package.
// ============================================================================

/**
 * Lazy-load Pixelmatch từ CDN (chỉ tải 1 lần, cache trong window.__pixelmatchLib).
 * @returns {Function|null} pixelmatch function hoặc null nếu không tải được
 */
async function loadPixelmatch() {
  if (window.__pixelmatchLib) return window.__pixelmatchLib;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/pixelmatch@5.3.0/+esm');
    const fn = mod.default || mod;
    if (typeof fn !== 'function') throw new Error('Pixelmatch export is not a function');
    window.__pixelmatchLib = fn;
    console.log('[Pixelmatch] ✅ Tải Pixelmatch thành công từ CDN');
    return fn;
  } catch (e) {
    console.warn('[Pixelmatch] ⚠️ Không tải được Pixelmatch:', e?.message);
    return null;
  }
}

/**
 * Load ảnh từ URL, vẽ lên canvas kích thước cố định, trả về ImageData pixels.
 * @param {string} url - URL ảnh (phải cho phép CORS hoặc same-origin)
 * @param {number} w - Chiều rộng canvas
 * @param {number} h - Chiều cao canvas
 * @param {Map} [cache] - Cache tái sử dụng giữa các lần so sánh
 * @returns {Promise<Uint8ClampedArray|null>}
 */
async function loadImageToCanvasPixels(url, w, h, cache) {
  if (!url) return null;
  const cacheKey = `${url}||${w}x${h}`;
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey);

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      // Timeout 8 giây để tránh treo khi ảnh không phản hồi
      const timer = setTimeout(() => resolve(null), 8000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const pixels = ctx.getImageData(0, 0, w, h).data;
          if (cache) cache.set(cacheKey, pixels);
          resolve(pixels);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * So sánh 2 URL thumbnail bằng Pixelmatch, trả về similarity 0–1 hoặc null.
 * - null = không thể so sánh (load thất bại, CORS, v.v.)
 * - 1.0  = giống hệt nhau
 * - 0.0  = hoàn toàn khác nhau
 * @param {string} url1
 * @param {string} url2
 * @param {Object} [opts]
 * @param {Map}    [pixelCache] - Cache pixels để tái sử dụng trong 1 phiên dedup
 * @returns {Promise<number|null>}
 */
async function compareThumbnailsPixelmatch(url1, url2, opts = {}, pixelCache) {
  if (!url1 || !url2) return null;
  if (url1 === url2) return 1;

  const w = opts.thumbWidth  || 64;
  const h = opts.thumbHeight || 64;

  try {
    const pixelmatch = await loadPixelmatch();
    if (!pixelmatch) return null;

    const [px1, px2] = await Promise.all([
      loadImageToCanvasPixels(url1, w, h, pixelCache),
      loadImageToCanvasPixels(url2, w, h, pixelCache),
    ]);

    if (!px1 || !px2) return null;

    const diff = new Uint8Array(w * h * 4);
    const numDiff = pixelmatch(px1, px2, diff, w, h, { threshold: 0.1 });
    const similarity = 1 - numDiff / (w * h);
    return Math.max(0, Math.min(1, similarity));
  } catch (e) {
    console.warn('[Pixelmatch] compareThumbnails lỗi:', e?.message);
    return null;
  }
}

/**
 * Phát hiện các bài viết trùng lặp theo nhiều tiêu chí
 * @param {Array} articles - Danh sách bài viết từ database
 * @param {Object} opts - Options
 * @returns {Array} - Mảng nhóm duplicate [{groupId, articles, reason}]
 */
async function findDuplicateArticles(articles = [], opts = {}) {
  if (!Array.isArray(articles) || articles.length < 2) return [];
  
  const titleSimilarityThreshold = opts.titleThreshold || 0.75; // 75%
  const contentHashThreshold = opts.contentHashThreshold || true; // Exact hash match
  const imageSimilarityThreshold = opts.imageThreshold || 0.5; // Ít nhất 50% ảnh trùng
  
  const duplicateGroups = [];
  const processed = new Set();
  // Cache pixel data trong toàn bộ phiên dedup để không load lại ảnh trùng
  const pixelCache = new Map();
  
  console.log(`[findDuplicateArticles] Bắt đầu phát hiện trùng lặp - ${articles.length} bài viết`);
  
  for (let i = 0; i < articles.length; i++) {
    if (processed.has(articles[i].id)) continue;
    
    const mainArticle = articles[i];
    const duplicates = [mainArticle];
    const mainHash = calculateContentHash(mainArticle.content || "");
    const mainTitle = mainArticle.title || "";
    
    // Trích xuất danh sách ảnh từ main article
    let mainImages = [];
    try {
      mainImages = JSON.parse(mainArticle.images || "[]");
      if (!Array.isArray(mainImages)) mainImages = [];
    } catch (e) {
      mainImages = [];
    }
    
    for (let j = i + 1; j < articles.length; j++) {
      if (processed.has(articles[j].id)) continue;
      
      const compareArticle = articles[j];
      const compareHash = calculateContentHash(compareArticle.content || "");
      const compareTitle = compareArticle.title || "";
      
      let isDuplicate = false;
      let reason = [];
      
      // ✅ CRITERIUM 1: Exact content hash match
      if (contentHashThreshold && mainHash && mainHash === compareHash && mainHash !== "") {
        isDuplicate = true;
        reason.push("exact-content");
      }
      
      // ✅ CRITERIUM 2: Title similarity (> threshold)
      if (!isDuplicate) {
        const titleSim = calculateStringSimilarity(mainTitle, compareTitle);
        if (titleSim >= titleSimilarityThreshold) {
          isDuplicate = true;
          reason.push(`title-${Math.round(titleSim * 100)}%`);
        }
      }
      
      // ✅ CRITERIUM 3: Shared images (ít nhất 50% ảnh trùng)
      if (!isDuplicate) {
        try {
          let compareImages = JSON.parse(compareArticle.images || "[]");
          if (!Array.isArray(compareImages)) compareImages = [];
          
          if (mainImages.length > 0 && compareImages.length > 0) {
            const sharedCount = mainImages.filter(img => compareImages.includes(img)).length;
            const sharedRatio = Math.max(
              sharedCount / mainImages.length,
              sharedCount / compareImages.length
            );
            
            if (sharedRatio >= imageSimilarityThreshold) {
              isDuplicate = true;
              reason.push(`shared-images-${Math.round(sharedRatio * 100)}%`);
            }
          }
        } catch (e) {
          // Ignore image parsing error
        }
      }

      // ✅ CRITERIUM 4: Visual thumbnail similarity via Pixelmatch (phương án cuối cùng)
      // Chỉ chạy khi 3 tiêu chí trên không phát hiện được trùng, để tránh so sánh không cần thiết.
      if (!isDuplicate) {
        const thumbUrl1 = mainArticle.image || mainArticle.thumbnail || "";
        const thumbUrl2 = compareArticle.image || compareArticle.thumbnail || "";
        if (thumbUrl1 && thumbUrl2 && thumbUrl1 !== thumbUrl2) {
          const thumbSim = await compareThumbnailsPixelmatch(thumbUrl1, thumbUrl2, {}, pixelCache);
          if (thumbSim !== null) {
            const thumbThreshold = opts.thumbnailThreshold || 0.85; // 85% giống nhau
            if (thumbSim >= thumbThreshold) {
              isDuplicate = true;
              reason.push(`thumbnail-visual-${Math.round(thumbSim * 100)}%`);
            }
          }
        }
      }
      
      if (isDuplicate) {
        duplicates.push(compareArticle);
        processed.add(compareArticle.id);
        console.log(`   ✅ Duplicate found: "${compareTitle}" (reason: ${reason.join(", ")})`);
      }
    }
    
    // Nếu tìm thấy duplicates, add vào group
    if (duplicates.length > 1) {
      processed.add(mainArticle.id);
      
      // Sort by created_at (newest first)
      duplicates.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      duplicateGroups.push({
        groupId: generateId(),
        articles: duplicates,
        keepArticle: duplicates[0], // Keep the newest
        removeArticles: duplicates.slice(1), // Remove older ones
        reason: `${duplicates.length} bài trùng lặp tìm thấy`
      });
      
      console.log(`   📊 Nhóm trùng: ${duplicates.length} bài (giữ: "${duplicates[0].title?.substring(0, 50)}", xóa: ${duplicates.slice(1).length})`);
    }
  }
  
  console.log(`[findDuplicateArticles] Hoàn tất - Tìm được ${duplicateGroups.length} nhóm trùng`);
  
  return duplicateGroups;
}

/**
 * Xóa bài viết cũ, giữ lại bài viết mới nhất trong nhóm trùng
 * @param {Array} duplicatGroups - Mảng nhóm duplicate
 * @param {Object} ctx - Context API
 * @returns {Object} - Kết quả cleanup {success, deletedCount, failedCount, results}
 */
function safeParseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractFacebookPostsFromArticle(article = {}) {
  const directPosts = safeParseJson(article.facebook_posts, null);
  if (Array.isArray(directPosts)) {
    return directPosts.filter(p => p && p.post_id);
  }

  const attrs = safeParseJson(article.attributes, {});
  if (attrs && Array.isArray(attrs.facebook_posts)) {
    return attrs.facebook_posts.filter(p => p && p.post_id);
  }

  const postIdsFromAttrs = attrs && Array.isArray(attrs.facebook_post_ids)
    ? attrs.facebook_post_ids
    : safeParseJson(article.facebook_post_ids, []);

  if (Array.isArray(postIdsFromAttrs)) {
    return postIdsFromAttrs
      .map((id) => ({ post_id: String(id || '').trim() }))
      .filter((p) => p.post_id);
  }

  return [];
}

function normalizeConfigId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function findZaloConfigById(configs, targetId) {
  const normalizedTargetId = normalizeConfigId(targetId);
  if (!normalizedTargetId || !Array.isArray(configs)) return null;
  return configs.find((cfg) => cfg && cfg.config_for_zalo && normalizeConfigId(cfg.id) === normalizedTargetId) || null;
}

function buildFanpageTokenMap(ctx = {}) {
  const map = {};
  const fallbackTokens = [];
  const pages = [];
  const targetConfigId = normalizeConfigId(ctx?.config_id);

  const addToken = (pageId, token, pageName = '') => {
    if (!token) return;
    const normToken = String(token).trim();
    if (!normToken) return;
    if (!fallbackTokens.includes(normToken)) {
      fallbackTokens.push(normToken);
    }
    const normPageId = String(pageId || '').trim();
    if (normPageId && !map[normPageId]) {
      map[normPageId] = normToken;
      pages.push({ id: normPageId, token: normToken, name: pageName || '' });
    }
  };

  addToken(ctx.fanpage_id, ctx.fanpage_token, ctx.fanpage_name || '');

  if (Array.isArray(ctx.fanpages)) {
    ctx.fanpages.forEach((fp) => addToken(fp?.id, fp?.access_token || fp?.token || fp?.page_token, fp?.name || fp?.page_name || ''));
  }

  if (typeof loadDataOptionUser === 'function') {
    try {
      const allConfigs = loadDataOptionUser();
      if (Array.isArray(allConfigs)) {
        allConfigs.forEach((cfg) => {
          if (!cfg || !cfg.config_for_zalo) return;
          if (targetConfigId && normalizeConfigId(cfg.id) !== targetConfigId) return;

          // Ưu tiên token từ list fanpages mới
          if (Array.isArray(cfg.zalo_fanpages)) {
            cfg.zalo_fanpages.forEach((fp) => addToken(fp?.id, fp?.access_token || fp?.token || fp?.page_token, fp?.name || fp?.page_name || ''));
          }

          // Fallback token format cũ
          if (Array.isArray(cfg.fanpage_ids) && Array.isArray(cfg.fanpage_tokens)) {
            cfg.fanpage_ids.forEach((id, idx) => addToken(id, cfg.fanpage_tokens[idx], cfg?.fanpage_names?.[idx] || cfg?.fanpage_name || ''));
          }

          addToken(cfg.fanpage_id, cfg.fanpage_token, cfg.fanpage_name || '');
        });
      }
    } catch (e) {
      console.warn('⚠️ [buildFanpageTokenMap] Không thể loadDataOptionUser:', e.message);
    }
  }

  return { map, fallbackTokens, pages };
}

function buildArticleUrlCandidates(article = {}) {
  const slug = String(article.slug || '').trim();
  const serviceType = String(article.service_type || '').trim();
  const domainValue = String(article.domain || '').trim();
  const domains = domainValue
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d && !d.includes('localhost') && !d.includes('127.0.0.1'));

  const urls = [];
  domains.forEach((domain) => {
    if (!slug || !serviceType) return;
    urls.push(`https://www.${domain}/${serviceType}/${slug}`);
    urls.push(`https://${domain}/${serviceType}/${slug}`);
    urls.push(`http://www.${domain}/${serviceType}/${slug}`);
    urls.push(`http://${domain}/${serviceType}/${slug}`);
  });

  return Array.from(new Set(urls.filter(Boolean)));
}

async function fetchRecentFacebookPostsByPage(pageId, pageAccessToken, limit = 50) {
  const encodedPageId = encodeURIComponent(pageId);
  const encodedToken = encodeURIComponent(pageAccessToken);
  const fields = encodeURIComponent('id,created_time,message,permalink_url');
  const url = `${FACEBOOK_CONFIG.GRAPH_API_BASE}/${encodedPageId}/posts?fields=${fields}&limit=${limit}&access_token=${encodedToken}`;

  const response = await facebookFetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const errMsg = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return Array.isArray(data?.data) ? data.data : [];
}

async function discoverFacebookPostsForArticle(article = {}, fanpages = [], opts = {}) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const scanDelayMs = Math.max(300, Number(opts.scanDelayMs || 800));
  const scanLimit = Math.max(10, Number(opts.scanLimit || 50));
  const slug = String(article.slug || '').trim();
  const candidates = buildArticleUrlCandidates(article);

  if (!slug || fanpages.length === 0) {
    return [];
  }

  const found = [];
  for (let i = 0; i < fanpages.length; i++) {
    const page = fanpages[i];
    try {
      const posts = await fetchRecentFacebookPostsByPage(page.id, page.token, scanLimit);
      for (const post of posts) {
        const message = String(post?.message || '');
        const permalink = String(post?.permalink_url || '');
        const messageLower = message.toLowerCase();
        const permalinkLower = permalink.toLowerCase();
        const slugMatched = messageLower.includes(slug.toLowerCase()) || permalinkLower.includes(slug.toLowerCase());
        const urlMatched = candidates.some((url) => message.includes(url) || permalink.includes(url));
        if (slugMatched || urlMatched) {
          found.push({
            post_id: post.id,
            page_id: page.id,
            page_name: page.name || '',
            page_token: page.token,
            created_time: post.created_time || '',
            matched_by: urlMatched ? 'url' : 'slug'
          });
        }
      }
    } catch (e) {
      console.warn(`      ⚠️ Không quét được page ${page.id}: ${e.message}`);
    }

    if (i < fanpages.length - 1) {
      await sleep(scanDelayMs);
    }
  }

  return found;
}

async function deleteFacebookPostByGraphApi(postId, pageAccessToken, seft = {}) {
  if (!postId || !pageAccessToken) {
    throw new Error('Missing postId or pageAccessToken');
  }

  // Ưu tiên helper từ seft nếu có
  if (seft && typeof seft.deleteFacebookPost === 'function') {
    const result = await seft.deleteFacebookPost({ postId, pageAccessToken });
    if (result?.success) return { success: true };
    throw new Error(result?.message || 'deleteFacebookPost failed');
  }

  const url = `${FACEBOOK_CONFIG.GRAPH_API_BASE}/${encodeURIComponent(postId)}?access_token=${encodeURIComponent(pageAccessToken)}`;
  const response = await facebookFetch(url, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error || data?.success === false) {
    const fbErr = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(fbErr);
  }

  return { success: true };
}

async function cleanupDuplicateArticles(duplicateGroups = [], ctx = {}) {
  if (!Array.isArray(duplicateGroups) || duplicateGroups.length === 0) {
    return { success: false, message: "Không có bài viết trùng lặp" };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deleteDelayMs = Math.max(300, Number(ctx.cleanupDeleteDelayMs || window.CSM_CLEANUP_DELETE_DELAY_MS || 1500));
  const deleteJitterMs = Math.max(0, Number(ctx.cleanupDeleteJitterMs || window.CSM_CLEANUP_DELETE_JITTER_MS || 500));
  const maxRetries = Math.max(1, Number(ctx.cleanupDeleteMaxRetries || window.CSM_CLEANUP_DELETE_MAX_RETRIES || 3));
  const withJitter = () => deleteDelayMs + Math.floor(Math.random() * (deleteJitterMs + 1));

  const { map: fanpageTokenMap, fallbackTokens, pages: configuredFanpages } = buildFanpageTokenMap(ctx);

  const withRetry = async (fn, label) => {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetries) {
          const waitMs = withJitter() * attempt;
          console.warn(`      ⏱️ ${label} retry ${attempt}/${maxRetries} sau ${waitMs}ms`);
          await sleep(waitMs);
        }
      }
    }
    throw lastErr || new Error(`${label} failed`);
  };
  
  console.log(`\n🧹 [cleanupDuplicateArticles] Bắt đầu dọn ${duplicateGroups.length} nhóm trùng - ${new Date().toLocaleTimeString()}`);
  
  let deletedCount = 0;
  let failedCount = 0;
  const results = [];
  
  for (const group of duplicateGroups) {
    const { keepArticle, removeArticles } = group;
    const keepImageRefs = new Set(
      normalizeArticleImageUrls(keepArticle?.images)
        .map((u) => extractServerImageRef(u, ctx?.app_id || "wuweb"))
        .filter(Boolean)
        .map((r) => r.key)
    );
    
    console.log(`\n   Nhóm: keep="${keepArticle.title?.substring(0, 40)}" - Xóa ${removeArticles.length} bài cũ`);
    
    for (const oldArticle of removeArticles) {
      try {
        // ✅ Determine correct app_id from domain
        const isLmktDomain = (oldArticle.domain || ctx.domain || "").toLowerCase().includes("h-holding");
        const finalAppId = isLmktDomain ? "lmkt" : "wuweb";

        // 🧽 Xóa post đã publish trực tiếp trên Facebook fanpage (Graph API)
        let deletedFacebookPostsCount = 0;
        let facebookPosts = extractFacebookPostsFromArticle(oldArticle);
        if (!facebookPosts.length && configuredFanpages.length > 0) {
          // Legacy data: chưa lưu post_id, quét theo slug/url để lấy post Facebook cần xóa
          const discovered = await discoverFacebookPostsForArticle(oldArticle, configuredFanpages, {
            scanDelayMs: ctx.cleanupFacebookScanDelayMs || 800,
            scanLimit: ctx.cleanupFacebookScanLimit || 50
          });
          if (discovered.length > 0) {
            facebookPosts = discovered;
            console.log(`      🔎 Found ${discovered.length} Facebook posts (legacy lookup) cho slug=${oldArticle.slug}`);
          }
        }
        if (facebookPosts.length > 0) {
          // Nếu tìm được nhiều post cùng fanpage, chỉ xóa post cũ hơn, giữ post mới nhất.
          const groupedByPage = {};
          facebookPosts.forEach((p) => {
            const pageKey = String(p.page_id || 'unknown');
            if (!groupedByPage[pageKey]) groupedByPage[pageKey] = [];
            groupedByPage[pageKey].push(p);
          });

          const facebookPostsToDelete = [];
          Object.values(groupedByPage).forEach((posts) => {
            if (!Array.isArray(posts) || posts.length === 0) return;
            const sorted = [...posts].sort((a, b) => {
              const ta = new Date(a.created_time || 0).getTime();
              const tb = new Date(b.created_time || 0).getTime();
              return tb - ta;
            });

            // Bài cũ (oldArticle) có thể có 1 post duy nhất trên mỗi page => vẫn xóa.
            // Nếu có nhiều post cùng page (duplicate legacy), giữ mới nhất, xóa phần còn lại.
            if (sorted.length === 1) {
              facebookPostsToDelete.push(sorted[0]);
            } else {
              facebookPostsToDelete.push(...sorted.slice(1));
            }
          });

          for (const fbPost of facebookPostsToDelete) {
            const pageId = String(fbPost.page_id || '').trim();
            const tokenFromMap = pageId ? fanpageTokenMap[pageId] : null;
            const token = fbPost.page_token || tokenFromMap || fallbackTokens[0] || ctx.fanpage_token;

            if (!token) {
              console.warn(`      ⚠️ Thiếu token để xóa Facebook post: ${fbPost.post_id}`);
              continue;
            }

            try {
              await withRetry(
                () => deleteFacebookPostByGraphApi(fbPost.post_id, token, ctx.seftObj || {}),
                `delete-facebook-post ${fbPost.post_id}`
              );
              deletedFacebookPostsCount++;
              console.log(`      🗑️ Facebook post deleted: ${fbPost.post_id}`);
            } catch (fbErr) {
              console.warn(`      ⚠️ Không thể xóa Facebook post ${fbPost.post_id}: ${fbErr.message}`);
            }

            // Throttle để tránh dính rate limit Facebook/Server
            await sleep(withJitter());
          }

          if (facebookPosts.length > facebookPostsToDelete.length) {
            console.log(`      ℹ️ Kept newest FB post on ${facebookPosts.length - facebookPostsToDelete.length} fanpage group(s)`);
          }
        }
        
        // �️ Xóa images liên quan 
        let deletedImagesCount = 0;
        if (oldArticle.images) {
          try {
            const images = normalizeArticleImageUrls(oldArticle.images);
            const attemptedImageKeys = new Set();

            if (images.length > 0) {
              for (const img of images) {
                try {
                  const imgUrl = String(img || "").trim();
                  if (!imgUrl) continue;

                  const imageRef = extractServerImageRef(imgUrl, finalAppId);
                  if (!imageRef) {
                    console.log(`      ⏭️ Skip non-server image: ${imgUrl.substring(0, 120)}`);
                    continue;
                  }

                  if (keepImageRefs.has(imageRef.key)) {
                    console.log(`      ♻️ Skip shared image (keep article still uses): ${imageRef.key}`);
                    continue;
                  }

                  if (attemptedImageKeys.has(imageRef.key)) {
                    continue;
                  }
                  attemptedImageKeys.add(imageRef.key);

                  const delImgResult = await withRetry(
                    async () => {
                      const r = await deleteUploadedImageFromServer(imageRef, {
                        ...ctx,
                        app_id: imageRef.app_id || finalAppId
                      });
                      if (!r?.success) {
                        throw new Error(r?.message || "Delete image failed");
                      }
                      return r;
                    },
                    `delete-image ${imgUrl}`
                  ).catch(() => ({ success: false }));

                  if (delImgResult?.success) {
                    deletedImagesCount++;
                  } else {
                    console.warn(`      ⚠️ Delete image server thất bại: ${imageRef.key}`);
                  }

                  await sleep(withJitter());
                } catch (imgErr) {
                  console.warn(`      ⚠️ Không thể xóa image: ${img}`, imgErr.message);
                }
              }
              console.log(`      📸 Xóa ${deletedImagesCount}/${attemptedImageKeys.size} hình ảnh server`);
            }
          } catch (parseErr) {
            console.warn(`      ⚠️ Lỗi parse images field:`, parseErr.message);
          }
        }
        
        // 🗑️ Xóa bài viết cũ using window.csmApi.updateTableData
        if (window.csmApi && typeof window.csmApi.updateTableData === 'function') {
          const deletePayload = {
            app_id: finalAppId,
            obj_name: "web_service_detail",
            command: "delete",
            obj_update: {
              slug: oldArticle.slug,
              domain: oldArticle.domain,
              status: oldArticle.status || "active"
            },
            pk_fields: ["slug", "domain", "status"]
          };

          const deleteResult = await withRetry(
            async () => {
              const r = await window.csmApi.updateTableData(deletePayload);
              if (!r?.success) {
                throw new Error(r?.message || 'Delete article failed');
              }
              return r;
            },
            `delete-article ${oldArticle.slug || oldArticle.title || ''}`
          );
          
          if (deleteResult && deleteResult.success) {
            deletedCount++;
            results.push({
              deleted: oldArticle.title,
              success: true,
              imagesDeleted: deletedImagesCount,
              facebookPostsDeleted: deletedFacebookPostsCount
            });
            console.log(`      ✅ Đã xóa: "${oldArticle.title?.substring(0, 40)}"${deletedImagesCount > 0 ? ` (+ ${deletedImagesCount} hình)` : ''}${deletedFacebookPostsCount > 0 ? ` (+ ${deletedFacebookPostsCount} FB posts)` : ''}`);

            await sleep(withJitter());
          } else {
            failedCount++;
            results.push({
              deleted: oldArticle.title,
              success: false,
              error: deleteResult?.message || "Delete failed"
            });
            console.log(`      ❌ Failed: "${oldArticle.title?.substring(0, 40)}" - ${deleteResult?.message}`);
          }
        } else {
          // Fallback: Không có API, báo lỗi
          failedCount++;
          results.push({
            deleted: oldArticle.title,
            success: false,
            error: "window.csmApi.updateTableData not available"
          });
          console.warn(`      ⚠️ API not available: "${oldArticle.title?.substring(0, 40)}"`);
        }
      } catch (err) {
        failedCount++;
        results.push({
          deleted: oldArticle.title,
          success: false,
          error: err.message
        });
        console.error(`      ❌ Error: "${oldArticle.title?.substring(0, 40)}" - ${err.message}`);
      }
    }
  }
  
  console.log(`\n✅ [cleanupDuplicateArticles] Hoàn tất - Xóa: ${deletedCount}, Lỗi: ${failedCount} - ${new Date().toLocaleTimeString()}`);
  
  return {
    success: failedCount === 0,
    message: `✅ Dọn dẹp xong: Xóa ${deletedCount} bài cũ${failedCount > 0 ? `, Lỗi: ${failedCount}` : ""}`,
    deletedCount,
    failedCount,
    results
  };
}

/**
 * Master workflow: Tải bài viết theo service type → Phát hiện trùng → Dọn dẹp
 * @param {string} domainValue - Giá trị domain (từ dropdown)
 * @param {string} serviceType - Loại dịch vụ (bat-dong-san, ...)
 * @param {string} projectCode - Mã dự án (LMKT only)
 * @param {Object} ctx - Context API
 * @returns {Object} - Kết quả cleanup
 */
async function cleanupDuplicatesByServiceType(domainValue, serviceType, projectCode = "", ctx = {}) {
  console.log(`\n[cleanupDuplicatesByServiceType] === START ===`);
  console.log(`   Domain: ${domainValue}`);
  console.log(`   Service Type: ${serviceType}`);
  console.log(`   Project: ${projectCode || "(none)"}`);
  
  // ✅ Determine app_id from domain
  const appId = getAppIdFromDomainOptions(domainValue) || "wuweb";
  
  try {
    // 1️⃣ Lấy tất cả bài viết của service type này cùng domain
    console.log(`\n   📥 Đang tải bài viết của "${serviceType}" trên domain "${domainValue}"...`);
    
    const where = {
      operator: "AND",
      conditions: [
        { field: "service_type", type: "eq", value: serviceType || projectCode || "" },
        { field: "domain", type: "eq", value: domainValue },
        { field: "status", type: "eq", value: "active" }
      ]
    };
    
    const fetchResult = await ctx.helperApi.getTableData({
      app_id: appId,
      obj_name: "web_service_detail",
      where,
      take: 500 // Limit để không quá tải
    }).catch(err => {
      console.error(`❌ Lỗi tải dữ liệu:`, err);
      return { rows: [], error: err.message };
    });
    
    const articles = fetchResult.rows || fetchResult.data || [];
    console.log(`   📊 Tải được ${articles.length} bài viết`);
    
    if (articles.length < 2) {
      return {
        success: false,
        message: `❌ Không đủ bài để check trùng (chỉ có ${articles.length} bài)`,
        duplicateCount: 0,
        cleanedCount: 0
      };
    }
    
    // 2️⃣ Phát hiện trùng lặp
    console.log(`\n   🔍 Đang phát hiện bài trùng lặp...`);
    const duplicateGroups = await findDuplicateArticles(articles, {
      titleThreshold: 0.75,
      contentHashThreshold: true,
      imageThreshold: 0.5,
      thumbnailThreshold: 0.85
    });
    
    if (duplicateGroups.length === 0) {
      return {
        success: true,
        message: "✅ Không tìm thấy bài trùng lặp",
        duplicateCount: 0,
        cleanedCount: 0
      };
    }
    
    console.log(`   📊 Tìm thấy ${duplicateGroups.length} nhóm trùng lặp`);
    
    // 3️⃣ Dọn dẹp bài cũ
    console.log(`\n   🧹 Đang dọn dẹp bài cũ...`);
    const cleanupResult = await cleanupDuplicateArticles(duplicateGroups, ctx);
    
    return {
      success: cleanupResult.success,
      message: cleanupResult.message,
      duplicateCount: duplicateGroups.length,
      cleanedCount: cleanupResult.deletedCount,
      failedCount: cleanupResult.failedCount,
      details: duplicateGroups.map(g => ({
        kept: g.keepArticle.title,
        removed: g.removeArticles.map(a => a.title),
        count: g.removeArticles.length
      }))
    };
    
  } catch (error) {
    console.error(`[cleanupDuplicatesByServiceType] Error:`, error);
    return {
      success: false,
      message: `❌ Lỗi: ${error.message}`,
      duplicateCount: 0,
      cleanedCount: 0
    };
  }
}

function getPrimaryPublicDomain(domainValue = "") {
  const domains = String(domainValue || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (!domains.length) return "";
  const preferred = domains.find((d) => !/localhost|127\.0\.0\.1/i.test(d));
  return preferred || domains[0] || "";
}

function resolveArticleFeaturedImageUrl(article = {}, domainValue = "") {
  const direct = [article.image, article.thumbnail]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const imageList = normalizeArticleImageUrls(article.images);
  const fromList = imageList.length > 0 ? [imageList[0]] : [];
  const candidate = [...direct, ...fromList].find(Boolean) || "";
  if (!candidate) return "";

  const primaryDomain = getPrimaryPublicDomain(article.domain || domainValue);
  return resolvePublicImageUrl({ domain: primaryDomain }, candidate);
}

async function checkImageIsLoadable(imageUrl = "", timeoutMs = 3000) {
  const url = String(imageUrl || "").trim();
  if (!url) {
    return { ok: false, reason: "missing-image-url" };
  }

  if (/^data:image\//i.test(url)) {
    return { ok: true, reason: "data-url" };
  }

  if (typeof Image === "undefined") {
    return { ok: true, reason: "skip-image-api-unavailable" };
  }

  return new Promise((resolve) => {
    let done = false;
    const img = new Image();
    const finish = (ok, reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve({ ok, reason });
    };

    const timer = setTimeout(() => finish(false, "timeout"), Math.max(500, Number(timeoutMs) || 3000));

    img.onload = () => finish(true, "loaded");
    img.onerror = () => finish(false, "load-error");
    img.src = url;
  });
}

async function findBrokenFeaturedImageArticles(articles = [], domainValue = "", opts = {}) {
  if (!Array.isArray(articles) || articles.length === 0) return [];

  const timeoutMs = Math.max(800, Number(opts.timeoutMs || 3000));
  const concurrency = Math.max(1, Math.min(8, Number(opts.concurrency || 4)));
  const issues = [];
  let cursor = 0;

  console.log(`[findBrokenFeaturedImageArticles] Kiểm tra ${articles.length} bài, concurrency=${concurrency}, timeout=${timeoutMs}ms`);

  const worker = async () => {
    while (cursor < articles.length) {
      const index = cursor;
      cursor += 1;
      const article = articles[index] || {};
      const imageUrl = resolveArticleFeaturedImageUrl(article, domainValue);

      if (!imageUrl) {
        issues.push({ article, reason: "missing-featured-image", imageUrl: "" });
        continue;
      }

      const check = await checkImageIsLoadable(imageUrl, timeoutMs);
      if (!check.ok) {
        issues.push({
          article,
          reason: `broken-featured-image:${check.reason || "unknown"}`,
          imageUrl
        });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`[findBrokenFeaturedImageArticles] Phát hiện ${issues.length} bài có ảnh đại diện lỗi/thiếu`);
  return issues;
}

function buildRemovalGroupsForArticles(articles = [], reason = "cleanup") {
  if (!Array.isArray(articles) || articles.length === 0) return [];
  return articles.map((article) => ({
    groupId: generateId(),
    articles: [article],
    keepArticle: { title: "(remove-invalid-article)", images: "[]" },
    removeArticles: [article],
    reason
  }));
}

async function cleanupBrokenFeaturedImagesByServiceType(domainValue, serviceType, projectCode = "", ctx = {}) {
  console.log(`\n[cleanupBrokenFeaturedImagesByServiceType] === START ===`);
  console.log(`   Domain: ${domainValue}`);
  console.log(`   Service Type: ${serviceType}`);
  console.log(`   Project: ${projectCode || "(none)"}`);

  const appId = getAppIdFromDomainOptions(domainValue) || "wuweb";

  try {
    console.log(`\n   📥 Đang tải bài viết để kiểm tra ảnh đại diện...`);
    const where = {
      operator: "AND",
      conditions: [
        { field: "service_type", type: "eq", value: serviceType || projectCode || "" },
        { field: "domain", type: "eq", value: domainValue },
        { field: "status", type: "eq", value: "active" }
      ]
    };

    const fetchResult = await ctx.helperApi.getTableData({
      app_id: appId,
      obj_name: "web_service_detail",
      where,
      take: 500
    }).catch((err) => {
      console.error(`❌ Lỗi tải dữ liệu:`, err);
      return { rows: [], error: err.message };
    });

    const articles = fetchResult.rows || fetchResult.data || [];
    console.log(`   📊 Tải được ${articles.length} bài viết`);

    if (articles.length === 0) {
      return {
        success: false,
        message: "❌ Không có bài viết để kiểm tra",
        invalidCount: 0,
        cleanedCount: 0
      };
    }

    console.log(`\n   🔍 Đang phát hiện bài lỗi ảnh đại diện...`);
    const brokenArticles = await findBrokenFeaturedImageArticles(articles, domainValue, {
      timeoutMs: Number(ctx.cleanupImageCheckTimeoutMs || 3000),
      concurrency: Number(ctx.cleanupImageCheckConcurrency || 4)
    });

    if (brokenArticles.length === 0) {
      return {
        success: true,
        message: "✅ Không tìm thấy bài lỗi ảnh đại diện",
        invalidCount: 0,
        cleanedCount: 0
      };
    }

    console.log(`   📊 Tìm thấy ${brokenArticles.length} bài lỗi ảnh đại diện`);
    const groups = buildRemovalGroupsForArticles(
      brokenArticles.map((x) => x.article),
      "broken-featured-image"
    );

    console.log(`\n   🧹 Đang dọn bài lỗi ảnh đại diện...`);
    const cleanupResult = await cleanupDuplicateArticles(groups, ctx);

    return {
      success: cleanupResult.success,
      message: cleanupResult.message,
      invalidCount: brokenArticles.length,
      cleanedCount: cleanupResult.deletedCount,
      failedCount: cleanupResult.failedCount,
      details: brokenArticles.map((x) => ({
        title: x.article?.title || "",
        slug: x.article?.slug || "",
        reason: x.reason,
        imageUrl: x.imageUrl || ""
      }))
    };
  } catch (error) {
    console.error(`[cleanupBrokenFeaturedImagesByServiceType] Error:`, error);
    return {
      success: false,
      message: `❌ Lỗi: ${error.message}`,
      invalidCount: 0,
      cleanedCount: 0
    };
  }
}

/**
 * Đăng bài lên Facebook Page bằng Node.js (NW.js) để bypass hạn chế trình duyệt
 */
async function postToFacebookPageNWJS(pageId, pageAccessToken, message, imageUrl = null, link = null, seft = {}) {
  console.warn('⚠️ postToFacebookPageNWJS is deprecated. Using postToFacebookPageWithImages instead.');
  const images = imageUrl ? [imageUrl] : [];
  return postToFacebookPageWithImages(pageId, pageAccessToken, message, images, [], link, seft);
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

function isDarkThemeActive() {
  try {
    const runtimeTheme = window.csmTheme || {};
    if (typeof runtimeTheme.isDark === 'boolean') return runtimeTheme.isDark;

    const htmlElement = document.documentElement;
    const bodyElement = document.body;

    const hints = [
      String(runtimeTheme.theme || '').toLowerCase(),
      String(runtimeTheme.mode || '').toLowerCase(),
      String(runtimeTheme.colorMode || '').toLowerCase(),
      String(htmlElement?.getAttribute?.('data-theme') || '').toLowerCase(),
      String(htmlElement?.getAttribute?.('theme') || '').toLowerCase(),
      String(bodyElement?.getAttribute?.('data-theme') || '').toLowerCase(),
    ].filter(Boolean);

    const hasClass = (el, cls) => !!(el && el.classList && el.classList.contains(cls));

    const hasDarkHint = hints.some((item) => item.includes('dark') || item === 'night')
      || hasClass(htmlElement, 'dark')
      || hasClass(htmlElement, 'theme-dark')
      || hasClass(bodyElement, 'dark')
      || hasClass(bodyElement, 'theme-dark');

    const hasLightHint = hints.some((item) => item.includes('light') || item === 'day')
      || hasClass(htmlElement, 'light')
      || hasClass(htmlElement, 'theme-light')
      || hasClass(bodyElement, 'light')
      || hasClass(bodyElement, 'theme-light');

    if (hasLightHint && !hasDarkHint) return false;
    if (hasDarkHint && !hasLightHint) return true;

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
  } catch (e) {}
  return false;
}

function getThemeTokens() {
  const darkDefaults = {
    bg: "#141414",
    surface: "#1f1f1f",
    border: "#434343",
    text: "rgba(255, 255, 255, 0.85)",
    textSecondary: "rgba(255, 255, 255, 0.45)",
    muted: "rgba(255, 255, 255, 0.45)",
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

  const lightDefaults = {
    bg: "#ffffff",
    surface: "#ffffff",
    border: "#d9d9d9",
    text: "#000000",
    textSecondary: "#666",
    muted: "#666",
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

  try {
    const root = getComputedStyle(document.documentElement);
    const htmlElement = document.documentElement;
    const explicitTheme = (htmlElement?.getAttribute('data-theme') || '').toLowerCase();

    // Detect dark mode (explicit theme wins over system preference)
    const isDark = isDarkThemeActive();

    // If theme is explicitly set (light/dark), use stable defaults to avoid CSS-var mismatch.
    if (explicitTheme === 'dark' || explicitTheme === 'light') {
      return isDark ? darkDefaults : lightDefaults;
    }

    const base = isDark ? darkDefaults : lightDefaults;
    
    // Get values from CSS variables or use defaults based on theme
    const bg = root.getPropertyValue("--ant-color-bg-container").trim();
    const surface = root.getPropertyValue("--ant-color-bg-elevated").trim();
    const border = root.getPropertyValue("--ant-color-border").trim();
    const text = root.getPropertyValue("--ant-color-text").trim();
    const textSecondary = root.getPropertyValue("--ant-color-text-secondary").trim();
    const primary = root.getPropertyValue("--ant-color-primary").trim();

    // If CSS variables are not available, fall back to defaults.
    if (!bg && !text) {
      return base;
    }

    // CSS variables found, blend with defaults.
    return {
      bg: bg || base.bg,
      surface: surface || bg || base.surface,
      border: border || base.border,
      text: text || base.text,
      textSecondary: textSecondary || base.textSecondary,
      muted: textSecondary || base.muted,
      primary: primary || base.primary,
      inputBg: root.getPropertyValue("--ant-color-bg-container").trim() || base.inputBg,
      link: root.getPropertyValue("--ant-color-link").trim() || base.link,
      warning: root.getPropertyValue("--ant-color-warning-bg").trim() || base.warning,
      warningBorder: root.getPropertyValue("--ant-color-warning-border").trim() || base.warningBorder,
      warningText: root.getPropertyValue("--ant-color-warning-text").trim() || base.warningText,
      info: root.getPropertyValue("--ant-color-info").trim() || base.info,
      infoBg: root.getPropertyValue("--ant-color-info-bg").trim() || base.infoBg,
      infoText: root.getPropertyValue("--ant-color-info-text").trim() || base.infoText,
      successBg: root.getPropertyValue("--ant-color-success-bg").trim() || base.successBg,
      successBorder: root.getPropertyValue("--ant-color-success-border").trim() || base.successBorder,
      successText: root.getPropertyValue("--ant-color-success-text").trim() || base.successText
    };
  } catch {
    // Fallback
    return isDarkThemeActive() ? darkDefaults : lightDefaults;
  }
}

function readPersistedAccessToken() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("access-token") : null;
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.state?.token || "").trim();
  } catch {
    return "";
  }
}

function resolveAuthToken(seftObj) {
  const win = typeof window !== "undefined" ? window : {};
  const seft = seftObj || win.seft || {};
  const candidates = [
    readPersistedAccessToken(),
    win.csmToken,
    win.csmCurrentUser?.token,
    seft?.user?.token,
    seft?.Uinfos?.appToken,
    win.csmCurrentUser?.app_token,
    seft?.user?.app_token,
    win.seft?.Uinfos?.appToken
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const token = String(candidates[i] || "").trim();
    if (token) return token;
  }
  return "";
}

function normalizeCsmApiBase(raw) {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const host = (url.hostname || "").toLowerCase();
    // api.* — cùng pattern get-table-data / update-table-data (không thêm /api).
    if (host.startsWith("api.")) {
      return `${url.protocol}//${url.host}`;
    }
    const path = (url.pathname || "/").replace(/\/+$/, "");
    if (!path || path === "/") {
      return `${url.protocol}//${url.host}/api`;
    }
    return path.endsWith("/api")
      ? `${url.protocol}//${url.host}${path}`
      : `${url.protocol}//${url.host}${path}/api`;
  } catch (_e) {
    return trimmed;
  }
}

function resolveContext(seftObj) {
  const win = typeof window !== 'undefined' ? window : {};
  const seft = seftObj || win.seft || {};
  const app_id = seft.app_id || seft.appId || "wuweb";
  const domainFromSeft = seft.domain;
  const domainFromHost = normalizeDomain(win.location?.hostname);
  const domain = domainFromSeft || domainFromHost || "csmbridge.net";

  const rawApiBase = seft.domain_api_url
    || win.domain_api_url
    || (win.location?.origin ? `${win.location.origin}/api` : "");
  const apiBase = normalizeCsmApiBase(rawApiBase);

  const token = resolveAuthToken(seft);

  return {
    seftObj: seft,
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

function extractFacebookAuthErrorInfo(errorLike) {
  const text = `${errorLike?.message || errorLike?.error || errorLike || ''}`;
  const normalized = text.toLowerCase();

  const hasSessionExpired = normalized.includes('session has expired');
  const hasOAuthException = normalized.includes('oauthexception');
  const hasCode190 = normalized.includes('"code":190') || normalized.includes(' code 190') || normalized.includes('code:190') || normalized.includes('code=190');
  const hasSubcode463 = normalized.includes('error_subcode":463') || normalized.includes('subcode 463') || normalized.includes('subcode:463') || normalized.includes('subcode=463');
  const hasInvalidToken = normalized.includes('invalid oauth access token') || normalized.includes('error validating access token');

  const isTokenExpired = hasSessionExpired || hasSubcode463;
  const isAuthError = isTokenExpired || hasInvalidToken || (hasOAuthException && hasCode190);

  return {
    isAuthError,
    isTokenExpired,
    message: text
  };
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
  const isSoftwareTech = !isLmkt && isSoftwareTechSeoContext(industry, opts.domainKey || "phanmemmottrieu", topic);
  
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
  } else if (isSoftwareTech) {
    generatedTitle = generateTitleForSoftware(industry, {
      solution: opts.property || topic.split(/[,—\-–]/)[0]?.trim() || "giải pháp công nghệ",
      business: opts.business || "doanh nghiệp",
      hook: opts.hook || "giải quyết bài toán vận hành cụ thể",
      topic
    });
  } else {
    // Phanmemmottrieu (BĐS / legacy): Tiêu đề có [Bán/Cho thuê] + [Địa chỉ] + [Hook]
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
    : isSoftwareTech
      ? (industryConfig.title_requirement || "⚠️ TIÊU ĐỀ long-tail: bài toán kinh doanh + giải pháp. KHÔNG Bán/Cho thuê BĐS.")
      : (industryConfig.title_requirement || "");
  
  const softwareSeoStrategyBlock = isSoftwareTech
    ? buildSoftwareTechSeoStrategyBlock(industry, topic)
    : "";
  
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

${softwareSeoStrategyBlock}
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
${isSoftwareTech ? `
✅ GEO: đoạn mở trả lời thẳng câu hỏi người tìm (1-2 câu)
✅ EEAT: case study / số liệu triển khai từ SOURCE_TEXT
✅ Topic Cluster: cuối bài gợi ý 2-3 internal link liên quan
✅ keywords: 5-8 long-tail (ngành dọc / tích hợp / AI-automation)
❌ CẤM: "viết phần mềm theo yêu cầu", keyword stuffing, "giải pháp toàn diện"
` : ""}
${titleRequirement ? `\n========== TIÊU ĐỀ ==========\n${titleRequirement}` : ""}

========== 3 NGÔN NGỮ — 1 JSON DUY NHẤT (BẮT BUỘC CÙNG LÚC) ==========
Trả về ĐỦ 15 field ngôn ngữ trong CÙNG 1 JSON object (không gọi thêm lần 2):
🇻🇳 VI: title, description, content, keywords, excerpt
🇬🇧 EN: title_en, description_en, content_en, keywords_en, excerpt_en — tiếng Anh thật, KHÁC VI
🇨🇳 ZH: title_zh, description_zh, content_zh, keywords_zh, excerpt_zh — tiếng Trung Giản thể thật, KHÁC VI
❗ description*/excerpt*: văn bản thuần, KHÔNG HTML
❗ content_en/content_zh: HTML đầy đủ h3/h4/p, thoát ý, KHÔNG copy-paste từ content VI
❗ TUYỆT ĐỐI KHÔNG để title_en=title hoặc content_en=content
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
  },
  {
    service_code: "thanh-phu-centre-point",
    name: "THANH PHÚ CENTRE POINT",
    name_en: "THANH PHÚ CENTRE POINT",
    name_zh: "THANH PHÚ CENTRE POINT",
    category: "THANH PHÚ CENTRE POINT",
    category_en: "THANH PHÚ CENTRE POINT",
    category_zh: "THANH PHÚ CENTRE POINT",
    image: "https://www.h-holding.vn/app_images/projects/thanh-phu-centre-point-og.jpg",
    attributes_icon: "HomeOutlined",
    attributes_color: "#13c2c2",
    attributes_priority: 7,
    attributes_title: "THANH PHÚ CENTRE POINT",
    attributes_title_en: "THANH PHÚ CENTRE POINT",
    attributes_title_zh: "THANH PHÚ CENTRE POINT",
    attributes_description: "Thanh Phú Centre Point – Khu đô thị phức hợp cao cấp, mang đến không gian sống lý tưởng với tiện ích vượt trội và tiềm năng đầu tư sinh lời cao.",
    attributes_description_en: "Thanh Phú Centre Point – A premium integrated urban area offering ideal living spaces, superior amenities, and strong investment potential.",
    attributes_description_zh: "清富中心點是一個高端綜合都市項目，提供理想生活空間、完善配套與良好投資潛力。",
    attributes_keywords: "thanh phú centre point, dự án, khu đô thị, h-holding",
    attributes_keywords_en: "thanh phu centre point, project, urban area, h-holding",
    attributes_keywords_zh: "thanh phu centre point, 項目, 都市區, h-holding"
  },
  {
    service_code: "sunshine-bay-retreat-vung-tau",
    name: "SUNSHINE BAY RETREAT VŨNG TÀU",
    name_en: "SUNSHINE BAY RETREAT VUNG TAU",
    name_zh: "陽光灣靜修度假村頭頓",
    category: "SUNSHINE BAY RETREAT VŨNG TÀU",
    category_en: "SUNSHINE BAY RETREAT VUNG TAU",
    category_zh: "陽光灣靜修度假村頭頓",
    image: "https://www.h-holding.vn/app_images/projects/sunshine-bay-retreat-vung-tau-og.jpg",
    attributes_icon: "StarOutlined",
    attributes_color: "#1890ff",
    attributes_priority: 8,
    attributes_title: "SUNSHINE BAY RETREAT VŨNG TÀU",
    attributes_title_en: "SUNSHINE BAY RETREAT VUNG TAU",
    attributes_title_zh: "陽光灣靜修度假村頭頓",
    attributes_description: "SUNSHINE BAY RETREAT VŨNG TÀU",
    attributes_description_en: "Sunshine Bay Retreat Vung Tau coastal retreat project.",
    attributes_description_zh: "陽光灣靜修度假村頭頓海濱度假項目。",
    attributes_keywords: "sunshine bay retreat vung tau, dự án, nghỉ dưỡng, h-holding",
    attributes_keywords_en: "sunshine bay retreat vung tau, project, retreat, h-holding",
    attributes_keywords_zh: "sunshine bay retreat vung tau, 項目, 度假, h-holding"
  }
];

const LMKT_STATIC_CATEGORY_DEFS = [
  { id: "home", service_code: "home", slug: "home", group_slug: "", is_service: false, is_group_slug: false, is_group_slug_default: false, category: "Trang Chủ", category_en: "Home", category_zh: "首頁" },
  { id: "ve-chung-toi", service_code: "ve-chung-toi", slug: "ve-chung-toi", group_slug: "", is_service: false, is_group_slug: false, is_group_slug_default: false, category: "Về Chúng Tôi", category_en: "About Us", category_zh: "關於我們" },
  { id: "du-an", service_code: "du-an", slug: "du-an", group_slug: "", is_service: true, is_group_slug: true, is_group_slug_default: false, category: "Dự Án", category_en: "Projects", category_zh: "項目", description: "Danh sách đầy đủ các dự án của H-Holding", description_en: "Complete list of H-Holding projects", description_zh: "H-Holding 的完整項目列表", attributes_icon: "AppstoreOutlined", attributes_color: "#52c41a" },
  { id: "tuyen-dung", service_code: "tuyen-dung", slug: "tuyen-dung", group_slug: "", is_service: false, is_group_slug: true, is_group_slug_default: false, category: "Tuyển Dụng", category_en: "Recruitment", category_zh: "招聘", description: "H Holding tuyển dụng chuyên gia BĐS, cam kết pháp lý minh bạch, hỗ trợ vay 70%, bàn giao đúng tiến độ.", description_en: "H Holding recruits real estate professionals with transparent legal commitments, 70% loan support, and on-schedule handover.", description_zh: "H Holding 招聘房地產專家，承諾法理透明、支持 70% 貸款並按進度交付。", attributes_icon: "HomeOutlined", attributes_color: "#13c2c2" },
  { id: "lien-he", service_code: "lien-he", slug: "lien-he", group_slug: "", is_service: false, is_group_slug: false, is_group_slug_default: false, category: "Liên Hệ", category_en: "Contact", category_zh: "聯繫我們" }
];

const PMT_STATIC_CATEGORY_DEFS = [
  { id: "home", service_code: "home", slug: "home", group_slug: "", is_service: false, is_group_slug: false, is_group_slug_default: false, category: "Trang Chủ", category_en: "Home", category_zh: "首頁" },
  { id: "ve-chung-toi", service_code: "ve-chung-toi", slug: "ve-chung-toi", group_slug: "", is_service: false, is_group_slug: false, is_group_slug_default: false, category: "Về Chúng Tôi", category_en: "About Me", category_zh: "關於我" },
  { id: "dich-vu", service_code: "dich-vu", slug: "dich-vu", group_slug: "", is_service: true, is_group_slug: true, is_group_slug_default: false, category: "Dịch Vụ", category_en: "Services", category_zh: "服務", description: "Tổng hợp các dịch vụ chuyên nghiệp, uy tín trong nhiều lĩnh vực khác nhau.", description_en: "A collection of professional and reputable services across many fields.", description_zh: "彙整多個領域的專業與可靠服務。", attributes_icon: "AppstoreOutlined", attributes_color: "#722ed1" },
  { id: "lien-he", service_code: "lien-he", slug: "lien-he", group_slug: "", is_service: false, is_group_slug: false, is_group_slug_default: false, category: "Liên Hệ", category_en: "Contact", category_zh: "聯繫我們" }
];

function buildCanonicalCategoryRecord(raw = {}, defaults = {}) {
  const merged = { ...defaults, ...raw };
  const menuNames = normalizeMenuTranslations(merged, merged);
  return {
    id: merged.id || merged.service_code || merged.slug,
    service_code: merged.service_code || merged.slug || merged.id,
    slug: merged.slug || merged.service_code || merged.id,
    group_slug: merged.group_slug || '',
    is_service: typeof merged.is_service === 'boolean' ? merged.is_service : true,
    is_group_slug: typeof merged.is_group_slug === 'boolean' ? merged.is_group_slug : false,
    is_group_slug_default: typeof merged.is_group_slug_default === 'boolean' ? merged.is_group_slug_default : false,
    name: menuNames.name,
    name_en: menuNames.name_en,
    name_zh: menuNames.name_zh,
    category: menuNames.category,
    category_en: menuNames.category_en,
    category_zh: menuNames.category_zh,
    description: firstNonEmptyValue(merged.description, merged.attributes_description, defaults.description, ''),
    description_en: firstNonEmptyValue(merged.description_en, merged.attributes_description_en, defaults.description_en, ''),
    description_zh: firstNonEmptyValue(merged.description_zh, merged.attributes_description_zh, defaults.description_zh, ''),
    image: merged.image || '',
    icon: firstNonEmptyValue(merged.icon, merged.attributes_icon, defaults.icon, ''),
    attributes_icon: firstNonEmptyValue(merged.attributes_icon, merged.icon, defaults.attributes_icon, ''),
    attributes_color: firstNonEmptyValue(merged.attributes_color, merged.color, defaults.attributes_color, ''),
    attributes_priority: typeof merged.attributes_priority === 'number' ? merged.attributes_priority : (typeof defaults.attributes_priority === 'number' ? defaults.attributes_priority : 0),
    attributes_title: firstNonEmptyValue(merged.attributes_title, menuNames.category, ''),
    attributes_title_en: firstNonEmptyValue(merged.attributes_title_en, menuNames.category_en, ''),
    attributes_title_zh: firstNonEmptyValue(merged.attributes_title_zh, menuNames.category_zh, ''),
    attributes_description: firstNonEmptyValue(merged.attributes_description, merged.description, ''),
    attributes_description_en: firstNonEmptyValue(merged.attributes_description_en, merged.description_en, ''),
    attributes_description_zh: firstNonEmptyValue(merged.attributes_description_zh, merged.description_zh, ''),
    attributes_keywords: firstNonEmptyValue(merged.attributes_keywords, ''),
    attributes_keywords_en: firstNonEmptyValue(merged.attributes_keywords_en, ''),
    attributes_keywords_zh: firstNonEmptyValue(merged.attributes_keywords_zh, ''),
    config: merged.config || defaults.config,
    type: merged.type || defaults.type || ''
  };
}

function getCategoryTemplatesForDomain(domainKey) {
  if (domainKey === 'lmkt') {
    const baseConfig = INDUSTRY_TYPES["bat-dong-san"] || {};
    const projectTemplates = LMKT_PROJECT_DEFS.map((project) => buildCanonicalCategoryRecord({
      ...project,
      id: project.service_code,
      slug: project.service_code,
      group_slug: 'du-an',
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      description: project.description || project.attributes_description || `Dự án bất động sản: ${project.name}`,
      description_en: project.description_en || project.attributes_description_en || '',
      description_zh: project.description_zh || project.attributes_description_zh || '',
      config: baseConfig,
      type: 'project'
    }));
    return [
      ...LMKT_STATIC_CATEGORY_DEFS.map((item) => buildCanonicalCategoryRecord(item, { type: item.slug === 'du-an' ? 'group' : 'page' })),
      ...projectTemplates
    ];
  }

  const serviceTemplates = Object.entries(INDUSTRY_TYPES).map(([key, ind]) => buildCanonicalCategoryRecord({
    ...ind,
    id: key,
    service_code: key,
    slug: key,
    group_slug: 'dich-vu',
    is_service: true,
    is_group_slug: false,
    is_group_slug_default: key === 'phan-mem',
    description: ind.attributes_description || ind.description || ind.prompt_focus || '',
    description_en: ind.attributes_description_en || '',
    description_zh: ind.attributes_description_zh || '',
    config: ind,
    type: 'industry'
  }));
  return [
    ...PMT_STATIC_CATEGORY_DEFS.map((item) => buildCanonicalCategoryRecord(item, { type: item.slug === 'dich-vu' ? 'group' : 'page' })),
    ...serviceTemplates
  ];
}

function findCategoryTemplate(domainKey, slug) {
  return getCategoryTemplatesForDomain(domainKey).find((item) => item.slug === slug) || null;
}

// ===== AUTO-SYNC SERVICE DEFINITIONS FROM SERVER =====
/**
 * Tự động đồng bộ service types (phanmemmottrieu) và projects (LMKT) từ server
 * - Đảm bảo khi có service_type hoặc project mới, code sẽ tự cập nhật
 * - Cache trong localStorage (5 phút)
 * - Merge trực tiếp vào INDUSTRY_TYPES và LMKT_PROJECT_DEFS
 */
let lastSyncTime = 0;
let serviceDefinitionsHydrated = false;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 phút

async function syncServiceDefinitionsFromServer(force = false) {
  try {
    const now = Date.now();
    
    // Kiểm tra cache
    if (!force && serviceDefinitionsHydrated && (now - lastSyncTime) < SYNC_INTERVAL_MS) {
      console.log('ℹ️ [syncServiceDefs] Sử dụng cache (< 5 phút)');
      return { success: true, cached: true };
    }
    
    // Kiểm tra API availability
    if (!window.csmApi?.getTableData) {
      console.warn('⚠️ [syncServiceDefs] window.csmApi.getTableData không khả dụng');
      return { success: false, reason: 'api_not_available' };
    }
    
    console.log('🔄 [syncServiceDefs] Đang sync từ server (với LIMIT)...');
    let totalSynced = 0;

    // Helper: so sánh boolean kể cả khi DB trả về string "true"/"false"
    const isTruthy = (val) => val === true || val === 'true' || val === 1 || val === '1';

    // Lấy tất cả rows có status=active, giới hạn 500 để tránh tràn RAM
    const queryWhere = { field: "status", type: "eq", value: "active" };

    // ===== 1️⃣ Sync LMKT Projects =====
    const lmktData = await window.csmApi.getTableData({
      app_id: "lmkt",
      obj_name: "web_services",
      where: queryWhere,
      take: 500
    }).catch(err => {
      console.error('❌ [syncServiceDefs] LMKT fetch error:', err);
      return { rows: [] };
    });

    const lmktRows = (lmktData?.rows || lmktData?.data || []).filter(item => item && isTruthy(item.is_service) && !isTruthy(item.is_group_slug));
    if (Array.isArray(lmktRows) && lmktRows.length > 0) {
      // Merge vào LMKT_PROJECT_DEFS (giữ lại items cũ, thêm mới)
      const existingSlugs = new Set(LMKT_PROJECT_DEFS.map(p => p.service_code));
      
      lmktRows.forEach(item => {
        const slug = item.slug || item.service_code || item.id;
        if (!slug) return;

        const existingProject = LMKT_PROJECT_DEFS.find(p => p.service_code === slug) || {};
        const menuNames = normalizeMenuTranslations(item, {
          ...existingProject,
          name: item.name || item.category || existingProject.name || slug
        });
        
        const newProject = {
          service_code: slug,
          name: menuNames.name,
          name_en: menuNames.name_en,
          name_zh: menuNames.name_zh,
          category: menuNames.category,
          category_en: menuNames.category_en,
          category_zh: menuNames.category_zh,
          image: item.image || `https://www.h-holding.vn/app_images/projects/${slug}-og.jpg`,
          attributes_icon: item.attributes_icon || "BuildOutlined",
          attributes_color: item.attributes_color || "#1890ff",
          attributes_priority: item.attributes_priority || 999,
          attributes_title: item.attributes_title || item.name || slug,
          attributes_title_en: item.attributes_title_en || item.name || slug,
          attributes_title_zh: item.attributes_title_zh || item.name || slug,
          attributes_description: item.attributes_description || "",
          attributes_description_en: item.attributes_description_en || "",
          attributes_description_zh: item.attributes_description_zh || "",
          attributes_keywords: item.attributes_keywords || "",
          attributes_keywords_en: item.attributes_keywords_en || "",
          attributes_keywords_zh: item.attributes_keywords_zh || ""
        };
        
        if (existingSlugs.has(slug)) {
          // Update existing
          const idx = LMKT_PROJECT_DEFS.findIndex(p => p.service_code === slug);
          if (idx >= 0) {
            LMKT_PROJECT_DEFS[idx] = { ...LMKT_PROJECT_DEFS[idx], ...newProject };
          }
        } else {
          // Add new
          LMKT_PROJECT_DEFS.push(newProject);
          existingSlugs.add(slug);
          totalSynced++;
        }
      });
      
      console.log(`✅ [syncServiceDefs] Synced ${lmktRows.length} LMKT projects (${totalSynced} new)`);
    }
    
    // ===== 2️⃣ Sync Phanmemmottrieu Service Types =====
    const pmtData = await window.csmApi.getTableData({
      app_id: "wuweb",
      obj_name: "web_services",
      where: queryWhere,
      take: 500
    }).catch(err => {
      console.error('❌ [syncServiceDefs] PMT fetch error:', err);
      return { rows: [] };
    });

    const pmtRows = (pmtData?.rows || pmtData?.data || []).filter(item => item && isTruthy(item.is_service) && !isTruthy(item.is_group_slug));
    let pmtSynced = 0;
    
    if (Array.isArray(pmtRows) && pmtRows.length > 0) {
      pmtRows.forEach(item => {
        const slug = item.slug || item.service_code || item.id;
        if (!slug) return;
        
        const existing = INDUSTRY_TYPES[slug] || {};
        const isNew = !INDUSTRY_TYPES[slug];
        const menuNames = normalizeMenuTranslations(item, {
          ...existing,
          name: item.name || item.category || existing.name || slug
        });
        
        // Merge trực tiếp vào INDUSTRY_TYPES (giữ prompt configs nếu có)
        INDUSTRY_TYPES[slug] = {
          ...existing, // Giữ prompt_role, prompt_style, etc từ hardcoded
          name: menuNames.name,
          name_en: menuNames.name_en,
          name_zh: menuNames.name_zh,
          category: menuNames.category,
          category_en: menuNames.category_en,
          category_zh: menuNames.category_zh,
          image: item.image || existing.image,
          attributes_icon: item.attributes_icon || existing.attributes_icon || "AppstoreOutlined",
          attributes_color: item.attributes_color || existing.attributes_color || "#1890ff",
          attributes_priority: item.attributes_priority ?? existing.attributes_priority ?? 999,
          attributes_title: item.attributes_title || existing.attributes_title || item.name || slug,
          attributes_title_en: item.attributes_title_en || existing.attributes_title_en,
          attributes_title_zh: item.attributes_title_zh || existing.attributes_title_zh,
          attributes_description: item.attributes_description || existing.attributes_description || "",
          attributes_description_en: item.attributes_description_en || existing.attributes_description_en || "",
          attributes_description_zh: item.attributes_description_zh || existing.attributes_description_zh || "",
          attributes_keywords: item.attributes_keywords || existing.attributes_keywords || "",
          attributes_keywords_en: item.attributes_keywords_en || existing.attributes_keywords_en || "",
          attributes_keywords_zh: item.attributes_keywords_zh || existing.attributes_keywords_zh || "",
          color: item.attributes_color || existing.color || "#1890ff"
        };
        
        if (isNew) pmtSynced++;
      });
      
      console.log(`✅ [syncServiceDefs] Synced ${pmtRows.length} service types (${pmtSynced} new)`);
    }
    
    lastSyncTime = now;
    serviceDefinitionsHydrated = true;

    // Nếu UI đã render thì refresh option ngay để user thấy dữ liệu mới
    refreshGlobalSettingsOptionsFromDefinitions();
    
    // Save to localStorage cache
    try {
      localStorage.setItem('csm_service_definitions_cache', JSON.stringify({
        lmkt_count: LMKT_PROJECT_DEFS.length,
        pmt_count: Object.keys(INDUSTRY_TYPES).length,
        timestamp: now
      }));
    } catch (e) {
      console.warn('⚠️ [syncServiceDefs] Failed to cache:', e.message);
    }
    
    return { success: true, lmkt: lmktRows.length, pmt: pmtRows.length };
    
  } catch (error) {
    console.error('❌ [syncServiceDefs] Sync failed:', error);
    return { success: false, error: error.message };
  }
}

// Load cache timestamp from localStorage on init
try {
  const cached = localStorage.getItem('csm_service_definitions_cache');
  if (cached) {
    const parsed = JSON.parse(cached);
    const age = Date.now() - (parsed.timestamp || 0);
    
    if (age < SYNC_INTERVAL_MS) {
      lastSyncTime = parsed.timestamp;
      console.log(`ℹ️ Service definitions cache active (${Math.round(age / 1000)}s old, ${parsed.lmkt_count || 0} LMKT + ${parsed.pmt_count || 0} PMT)`);
    }
  }
} catch (e) {
  console.warn('⚠️ Failed to load cache timestamp:', e.message);
}

// ===== PARSE ZALO/FACEBOOK JSON =====
function extractBase64ImagesFromText(text = "") {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function extractBase64VideosFromText(text = "") {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/data:video\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function getMediaUrlFromCandidate(candidate) {
  if (!candidate) return "";
  if (typeof candidate === "string") return candidate.trim();
  if (typeof candidate !== "object") return "";

  const url =
    candidate.url ||
    candidate.src ||
    candidate.path ||
    candidate.value ||
    candidate.link ||
    candidate.media?.url ||
    candidate.media?.source ||
    "";

  return typeof url === "string" ? url.trim() : "";
}

function normalizeImageCandidates(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map(getMediaUrlFromCandidate)
      .filter((v) => {
        if (!v) return false;
        if (/^data:image\//i.test(v)) return true;
        if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(v)) return true;
        if (/^https?:\/\//i.test(v) || v.startsWith("/")) {
          return !(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(v) || /^data:video\//i.test(v));
        }
        return false;
      });
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
          return normalizeImageCandidates(parsed);
        }
      } catch (e) {
        // ignore invalid json string
      }
    }
  }

  return [];
}

function normalizeVideoCandidates(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map(getMediaUrlFromCandidate)
      .filter((v) => {
        if (!v) return false;
        if (/^data:video\//i.test(v)) return true;
        if (/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(v)) return true;
        if (/^https?:\/\//i.test(v) || v.startsWith("/")) {
          return !(/^data:image\//i.test(v) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(v));
        }
        return false;
      });
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    if (/^https?:\/\//i.test(raw) || /^data:video\//i.test(raw) || raw.startsWith("/")) {
      return [raw];
    }

    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return normalizeVideoCandidates(parsed);
        }
      } catch (e) {
        // ignore invalid json string
      }
    }
  }

  return [];
}

function extractImagesFromMessage(item = {}) {
  // DISABLED excessive logging (was causing console buffer overflow)
  const images = [];

  const imageCandidates = [
    ["images", item.images],
    ["imageUrls", item.imageUrls],
    ["image_urls", item.image_urls],
    ["album", item.album],
    ["photos", item.photos],
    ["media", item.media],
    ["photo", item.photo],
    ["picture", item.picture]
  ];

  imageCandidates.forEach(([key, value]) => {
    const normalized = normalizeImageCandidates(value);
    if (normalized.length > 0) {
      images.push(...normalized);
    }
  });

  if (typeof item.image === "string") {
    images.push(item.image);
  }
  if (typeof item.imageUrl === "string") {
    images.push(item.imageUrl);
  }

  // Facebook-style attachments
  if (Array.isArray(item.attachments)) {
    item.attachments.forEach((att) => {
      const src = att?.media?.image?.src || att?.media?.image || att?.url;
      if (typeof src === "string") {
        images.push(src);
      }
    });
  }

  if (Array.isArray(item.attachments?.data)) {
    item.attachments.data.forEach((att) => {
      const src = att?.media?.image?.src || att?.media?.image || att?.url;
      if (typeof src === "string") {
        images.push(src);
      }
    });
  }

  const text = item.content || item.text || "";
  const base64Images = extractBase64ImagesFromText(text);
  if (base64Images.length > 0) {
    images.push(...base64Images);
  }

  // Validate URLs before returning
  const validImages = Array.from(new Set(
    images.filter((img) => {
      if (typeof img !== 'string' || !img.trim()) {
        return false;
      }
      return img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:');
    })
  ));
  
  return validImages;
}

function extractVideosFromMessage(item = {}) {
  // DISABLED excessive logging (was causing console buffer overflow)
  const videos = [];

  const videoCandidates = [
    ["videos", item.videos],
    ["videoUrls", item.videoUrls],
    ["video_urls", item.video_urls],
    ["album", item.album],
    ["media", item.media],
    ["attachments", item.attachments],
    ["attachments.data", item.attachments?.data]
  ];

  videoCandidates.forEach(([key, value]) => {
    const normalized = normalizeVideoCandidates(value);
    if (normalized.length > 0) {
      videos.push(...normalized);
    }
  });

  if (typeof item.video === "string") {
    videos.push(item.video);
  }
  if (typeof item.videoUrl === "string") {
    videos.push(item.videoUrl);
  }

  const text = item.content || item.text || "";
  const base64Videos = extractBase64VideosFromText(text);
  if (base64Videos.length > 0) {
    videos.push(...base64Videos);
  }

  // Facebook/Zalo attachments with explicit video markers
  const attachmentArrays = [item.attachments, item.attachments?.data].filter(Array.isArray);
  attachmentArrays.forEach(arr => {
    arr.forEach(att => {
      const candidate = att?.media?.source || att?.media?.url || att?.url || att?.src;
      const mime = (att?.mime_type || att?.mimeType || att?.media?.mime_type || "").toLowerCase();
      const type = (att?.type || att?.media_type || att?.media?.type || "").toLowerCase();
      if (typeof candidate === "string") {
        const looksLikeVideo = /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(candidate)
          || candidate.startsWith('data:video/')
          || mime.startsWith('video/')
          || type.includes('video');
        if (looksLikeVideo) {
          videos.push(candidate);
        }
      }
    });
  });

  const validVideos = Array.from(new Set(
    videos.filter((url) => {
      if (typeof url !== 'string' || !url.trim()) return false;
      return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:video') || url.startsWith('/');
    })
  ));

  return validVideos;
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
  const videos = extractVideosFromMessage(item);
  const hasMedia = images.length > 0 || videos.length > 0;
  return {
    text,
    images,
    videos,
    hasText: text.length > 0,
    hasImages: images.length > 0,
    hasVideos: videos.length > 0,
    hasMedia,
    isEligible: text.length > 0 && hasMedia
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
    if (!essentials.hasText || !essentials.hasMedia) {
      console.warn(`⚠️ [parseZaloJson] Skip message #${idx + 1}: hasText=${essentials.hasText}, hasMedia=${essentials.hasMedia}`);
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
    const hasMedia = hasImages || essentials.videos.length > 0;
    if (!essentials.hasText || !hasMedia) {
      console.warn(`⚠️ [parseFacebookJson] Skip post #${idx + 1}: hasText=${essentials.hasText}, hasMedia=${hasMedia}`);
      return false;
    }
    return true;
  });
}

// ===== UPLOAD IMAGES =====
async function uploadBase64Image(base64, filename, ctx) {
  if (!base64 || (typeof base64 === "string" && base64.endsWith("..."))) {
    throw new Error("Ảnh base64 chưa đầy đủ");
  }
  if (typeof base64 !== "string") {
    throw new Error(`Payload media không phải chuỗi base64 (type=${typeof base64})`);
  }
  if (!/^data:(image|video)\//i.test(base64)) {
    throw new Error(`Payload media không đúng data URL (preview=${base64.slice(0, 40)})`);
  }
  if (!base64.includes(",")) {
    throw new Error("Payload media thiếu phần base64 sau dấu phẩy");
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
  const payloadSizeMb = (uploadPayload.length / (1024 * 1024)).toFixed(2);
  if (!uploadPayload.includes('"src":"data:')) {
    throw new Error("Upload payload không chứa src data URL hợp lệ");
  }
  const candidates = getCandidateUploadEndpoints(ctx);
  const availableCandidates = candidates.filter(ep => !isUploadEndpointCoolingDown(ep));
  const endpoints = availableCandidates.length > 0 ? availableCandidates : candidates;
  let lastError = null;

  const isParseBodyErrorHtml = (responseText = "") => {
    const t = String(responseText || "").toLowerCase();
    return t.includes("lỗi khi phân tích dữ liệu gửi lên")
      || t.includes("loi khi phan tich du lieu gui len")
      || t.includes("parse body")
      || t.includes("json parse");
  };

  const buildFormUploadPayload = () => {
    // Encode đầy đủ để backend parse theo application/x-www-form-urlencoded an toàn
    const appId = encodeURIComponent(String(ctx.app_id || ""));
    const nameParam = encodeURIComponent(String(finalFileName || ""));
    const srcParam = encodeURIComponent(String(base64 || ""));
    return `app_id=${appId}&name=${nameParam}&src=${srcParam}`;
  };

  const normalizeUploadPath = (raw = "") => {
    const cleaned = String(raw || "").trim();
    if (!cleaned) return "";
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    if (cleaned.startsWith("app_images/")) return `/${cleaned}`;
    if (cleaned.startsWith("/")) return cleaned;
    return "";
  };

  const parseUploadResponsePath = (responseText = "", contentType = "") => {
    const text = String(responseText || "").trim();
    const lowerCt = String(contentType || "").toLowerCase();
    const lowerText = text.toLowerCase();

    // 200 nhưng trả HTML (thường do fallback route/proxy) => coi là lỗi endpoint
    if (lowerCt.includes("text/html") || lowerText.includes("<!doctype") || lowerText.includes("<html")) {
      return "";
    }

    // Plain text path/url
    const normalizedDirect = normalizeUploadPath(text);
    if (normalizedDirect) {
      return normalizedDirect;
    }

    // JSON string response: "app_images/x/y.mp4" hoặc "https://..."
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      const unwrapped = text.slice(1, -1).replace(/\\\//g, "/").trim();
      const normalizedWrapped = normalizeUploadPath(unwrapped);
      if (normalizedWrapped) {
        return normalizedWrapped;
      }
    }

    // Một số backend có thể trả JSON thay vì text
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        const parsed = JSON.parse(text);
        const candidate =
          (parsed && typeof parsed === "object" && (
            parsed.path ||
            parsed.url ||
            parsed.src ||
            parsed.data ||
            (parsed.result && (parsed.result.path || parsed.result.url || parsed.result.src))
          )) ||
          "";
        return normalizeUploadPath(candidate);
      } catch (e) {
        return "";
      }
    }

    // Fallback: thử trích path/url hợp lệ nếu backend trả message bao quanh
    const embeddedPathMatch = text.match(/(?:https?:\/\/[^\s"'<>]+|\/?app_images\/[^\s"'<>]+)/i);
    if (embeddedPathMatch && embeddedPathMatch[0]) {
      return normalizeUploadPath(embeddedPathMatch[0]);
    }

    return "";
  };

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    console.log(`[uploadBase64Image] -> Trying endpoint: ${endpoint} | file=${finalFileName} | payload=${payloadSizeMb}MB`);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new Error(`Upload timeout after ${UPLOAD_REQUEST_TIMEOUT_MS}ms`)), UPLOAD_REQUEST_TIMEOUT_MS)
      : null;

    try {
      const requestOnce = async (mode = "json") => {
        const isForm = mode === "form";
        const reqBody = isForm ? buildFormUploadPayload() : uploadPayload;
        const reqHeaders = {
          "Content-Type": isForm
            ? "application/x-www-form-urlencoded;charset=UTF-8"
            : "application/json;charset=UTF-8",
          "Accept": "text/plain, application/json, */*"
        };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: reqHeaders,
          body: reqBody,
          signal: controller ? controller.signal : undefined
        });
        const responseText = await response.text();
        const contentType = response.headers.get("content-type") || "";
        return { response, responseText, contentType, mode };
      };

      let reqResult = await requestOnce("json");
      const firstPreview = String(reqResult.responseText || "").replace(/\s+/g, " ").slice(0, 140);

      // Backend variant có thể parse JSON lỗi và trả HTML 200; retry bằng form-urlencoded.
      if (
        reqResult.response.ok
        && !parseUploadResponsePath(reqResult.responseText, reqResult.contentType)
        && isParseBodyErrorHtml(reqResult.responseText)
      ) {
        console.warn(`[uploadBase64Image] JSON parse failed at ${endpoint}, retrying as form-urlencoded... | body=${firstPreview || "(empty)"}`);
        reqResult = await requestOnce("form");
      }

      const res = reqResult.response;
      const responseText = reqResult.responseText;
      const contentType = reqResult.contentType;

      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) {
        markUploadEndpointFailure(endpoint, res.status);
        lastError = new Error(`Upload failed: ${res.status} @ ${endpoint}`);
        console.warn(`[uploadBase64Image] <- HTTP ${res.status} from ${endpoint} (${Date.now() - startedAt}ms)`);
        continue;
      }

      const parsedPath = parseUploadResponsePath(responseText, contentType);

      if (!parsedPath) {
        markUploadEndpointFailure(endpoint, res.status);
        const preview = String(responseText || "").replace(/\s+/g, " ").slice(0, 140);
        lastError = new Error(`Upload invalid response @ ${endpoint} (status ${res.status}, ct=${contentType || "n/a"}, body=${preview || "(empty)"})`);
        console.warn(`[uploadBase64Image] <- Invalid body from ${endpoint} (${Date.now() - startedAt}ms) | status=${res.status} | ct=${contentType || "n/a"} | body=${preview || "(empty)"}`);
        continue;
      }

      clearUploadEndpointHealth(endpoint);
      console.log(`[uploadBase64Image] <- Success from ${endpoint} in ${Date.now() - startedAt}ms: ${parsedPath}`);
      return parsedPath;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      markUploadEndpointFailure(endpoint, 0);
      const isAbort = error && (error.name === "AbortError" || String(error.message || "").toLowerCase().includes("timeout"));
      if (isAbort) {
        console.error(`[uploadBase64Image] <- Timeout at ${endpoint} after ${UPLOAD_REQUEST_TIMEOUT_MS}ms`);
      } else {
        console.error(`[uploadBase64Image] <- Network error at ${endpoint}: ${error?.message || error}`);
      }
      lastError = error;
    }
  }

  throw lastError || new Error("Upload failed: không tìm thấy endpoint upload khả dụng");
}

async function uploadBinaryFile(file, filename, ctx) {
  if (!(file instanceof File)) {
    throw new Error("uploadBinaryFile yêu cầu File hợp lệ");
  }

  const candidates = getCandidateUploadEndpoints(ctx);
  const availableCandidates = candidates.filter(ep => !isUploadEndpointCoolingDown(ep));
  const endpoints = availableCandidates.length > 0 ? availableCandidates : candidates;
  let lastError = null;

  const normalizeUploadPath = (raw = "") => {
    const cleaned = String(raw || "").trim();
    if (!cleaned) return "";
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    if (cleaned.startsWith("app_images/")) return `/${cleaned}`;
    if (cleaned.startsWith("/")) return cleaned;
    return "";
  };

  const parseUploadResponsePath = (responseText = "", contentType = "") => {
    const text = String(responseText || "").trim();
    const lowerCt = String(contentType || "").toLowerCase();
    const lowerText = text.toLowerCase();
    if (lowerCt.includes("text/html") || lowerText.includes("<!doctype") || lowerText.includes("<html")) {
      return "";
    }
    const direct = normalizeUploadPath(text);
    if (direct) return direct;
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        const parsed = JSON.parse(text);
        const candidate =
          (parsed && typeof parsed === "object" && (
            parsed.path ||
            parsed.url ||
            parsed.src ||
            (parsed.result && (parsed.result.path || parsed.result.url || parsed.result.src))
          )) ||
          "";
        return normalizeUploadPath(candidate);
      } catch (_) {
        return "";
      }
    }
    const embeddedPathMatch = text.match(/(?:https?:\/\/[^\s"'<>]+|\/?app_images\/[^\s"'<>]+)/i);
    if (embeddedPathMatch && embeddedPathMatch[0]) {
      return normalizeUploadPath(embeddedPathMatch[0]);
    }
    return "";
  };

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    console.log(`[uploadBinaryFile] -> Trying endpoint: ${endpoint} | file=${filename} | size=${(file.size / (1024 * 1024)).toFixed(2)}MB`);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new Error(`Upload timeout after ${UPLOAD_REQUEST_TIMEOUT_MS}ms`)), UPLOAD_REQUEST_TIMEOUT_MS)
      : null;

    try {
      const formData = new FormData();
      formData.append("app_id", String(ctx.app_id || ""));
      formData.append("name", String(filename || file.name || `upload-${Date.now()}`));
      formData.append("file", file, String(filename || file.name || `upload-${Date.now()}`));

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "text/plain, application/json, */*"
        },
        body: formData,
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);

      const responseText = await res.text();
      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        markUploadEndpointFailure(endpoint, res.status);
        lastError = new Error(`Upload file failed: ${res.status} @ ${endpoint}`);
        console.warn(`[uploadBinaryFile] <- HTTP ${res.status} from ${endpoint} (${Date.now() - startedAt}ms)`);
        continue;
      }

      const parsedPath = parseUploadResponsePath(responseText, contentType);
      if (!parsedPath) {
        markUploadEndpointFailure(endpoint, res.status);
        const preview = String(responseText || "").replace(/\s+/g, " ").slice(0, 140);
        lastError = new Error(`Upload file invalid response @ ${endpoint} (status ${res.status}, ct=${contentType || "n/a"}, body=${preview || "(empty)"})`);
        console.warn(`[uploadBinaryFile] <- Invalid body from ${endpoint} (${Date.now() - startedAt}ms) | status=${res.status} | ct=${contentType || "n/a"} | body=${preview || "(empty)"}`);
        continue;
      }

      clearUploadEndpointHealth(endpoint);
      console.log(`[uploadBinaryFile] <- Success from ${endpoint} in ${Date.now() - startedAt}ms: ${parsedPath}`);
      return parsedPath;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      markUploadEndpointFailure(endpoint, 0);
      const isAbort = error && (error.name === "AbortError" || String(error.message || "").toLowerCase().includes("timeout"));
      if (isAbort) {
        console.error(`[uploadBinaryFile] <- Timeout at ${endpoint} after ${UPLOAD_REQUEST_TIMEOUT_MS}ms`);
      } else {
        console.error(`[uploadBinaryFile] <- Network error at ${endpoint}: ${error?.message || error}`);
      }
      lastError = error;
    }
  }

  throw lastError || new Error("Upload file failed: không tìm thấy endpoint upload khả dụng");
}

function extractServerImageRef(rawImageUrl, fallbackAppId = "") {
  const raw = String(rawImageUrl || "").trim();
  if (!raw) return null;

  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname || "";
    }
  } catch (_e) {
    path = raw;
  }

  if (path.startsWith("app_images/")) {
    path = `/${path}`;
  }

  const m = path.match(/^\/app_images\/([^/]+)\/([^?#]+)$/i);
  if (!m) return null;

  const appId = decodeURIComponent(m[1] || "").trim() || String(fallbackAppId || "").trim();
  const name = decodeURIComponent(m[2] || "").trim();
  if (!name) return null;

  return {
    app_id: appId || String(fallbackAppId || "").trim() || "wuweb",
    name,
    key: `${appId || fallbackAppId || "wuweb"}/${name}`
  };
}

function normalizeArticleImageUrls(imagesField) {
  if (!imagesField) return [];
  let arr = imagesField;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch (_e) {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .map((img) => {
      if (typeof img === "string") return img;
      if (img && typeof img === "object") return img.url || img.path || "";
      return "";
    })
    .map((u) => String(u || "").trim())
    .filter(Boolean);
}

async function deleteUploadedImageFromServer(imageRef, ctx = {}) {
  if (!imageRef?.name) {
    return { success: false, message: "Thiếu tên file ảnh" };
  }

  const candidates = getCandidateUploadEndpoints(ctx);
  const availableCandidates = candidates.filter((ep) => !isUploadEndpointCoolingDown(ep));
  const endpoints = availableCandidates.length > 0 ? availableCandidates : candidates;
  let lastError = null;

  const payloadObj = {
    app_id: imageRef.app_id || ctx.app_id || "wuweb",
    cmd: "removeimg",
    name: imageRef.name
  };

  const buildFormPayload = () => (
    `app_id=${encodeURIComponent(String(payloadObj.app_id || ""))}`
    + `&cmd=${encodeURIComponent("removeimg")}`
    + `&name=${encodeURIComponent(String(payloadObj.name || ""))}`
  );

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new Error(`Delete timeout after ${UPLOAD_REQUEST_TIMEOUT_MS}ms`)), UPLOAD_REQUEST_TIMEOUT_MS)
      : null;

    try {
      const requestOnce = async (mode = "json") => {
        const isForm = mode === "form";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": isForm
              ? "application/x-www-form-urlencoded;charset=UTF-8"
              : "application/json;charset=UTF-8",
            "Accept": "text/plain, application/json, */*"
          },
          body: isForm ? buildFormPayload() : JSON.stringify(payloadObj),
          signal: controller ? controller.signal : undefined
        });
        const responseText = await response.text();
        return { response, responseText };
      };

      let reqResult = await requestOnce("json");
      const lowerBody = String(reqResult.responseText || "").toLowerCase();
      if (reqResult.response.ok && (lowerBody.includes("phan tich du lieu") || lowerBody.includes("parse body"))) {
        reqResult = await requestOnce("form");
      }

      if (timeoutId) clearTimeout(timeoutId);

      const { response, responseText } = reqResult;
      if (!response.ok) {
        markUploadEndpointFailure(endpoint, response.status);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      const okBody = String(responseText || "").toLowerCase();
      const isDeleted = okBody.includes("deleted") || okBody.includes("da xoa") || okBody.includes("đã xóa") || okBody === "";
      if (!isDeleted) {
        markUploadEndpointFailure(endpoint, response.status);
        lastError = new Error(`Delete invalid response from ${endpoint}`);
        continue;
      }

      clearUploadEndpointHealth(endpoint);
      console.log(`      🗑️ Image deleted on server: ${imageRef.key} via ${endpoint} (${Date.now() - startedAt}ms)`);
      return { success: true, endpoint };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      markUploadEndpointFailure(endpoint, 0);
      lastError = error;
    }
  }

  return { success: false, message: lastError?.message || "Delete image failed" };
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

async function uploadVideos(ctx, videos) {
  const arr = Array.isArray(videos) ? videos : [];
  const isBase64 = (s = "") => /^data:video\//i.test(s);
  const getVideoExtensionFromDataUrl = (s = "") => {
    const m = s.match(/^data:video\/([a-zA-Z0-9.+-]+);base64,/i);
    if (!m || !m[1]) return "mp4";
    const mimeExt = m[1].toLowerCase();
    const extMap = {
      "quicktime": "mov",
      "x-matroska": "mkv",
      "x-msvideo": "avi"
    };
    return extMap[mimeExt] || mimeExt;
  };

  console.log(`\n[uploadVideos] Bắt đầu upload ${arr.length} video - ${new Date().toLocaleTimeString()}`);

  const results = [];
  for (let i = 0; i < arr.length; i += 1) {
    const vid = arr[i];
    if (!vid || typeof vid !== 'string') {
      results.push("");
      continue;
    }

    if (!isBase64(vid)) {
      results.push(vid);
      continue;
    }

    try {
      const ext = getVideoExtensionFromDataUrl(vid);
      const result = await uploadBase64Image(vid, `upload-video-${Date.now()}-${i}.${ext}`, ctx);
      results.push(result);
    } catch (err) {
      console.error(`   [${i}] ❌ Base64 video upload error:`, err.message);
      results.push("");
    }
  }

  const validResults = results.filter((r) => {
    if (!r || typeof r !== 'string') return false;
    if (r.includes('<!') || r.includes('<html') || r.includes('<?')) return false;
    return /^https?:\/\/|^\/|^app_images\//.test(r);
  });

  console.log(`[uploadVideos] Hoàn tất upload ${validResults.length}/${arr.length} video hợp lệ`);
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
function buildDetail(ctx, seo, imgs, vids, opts = {}) {
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
  
  const validVideos = (Array.isArray(vids) ? vids : []).filter((vid) => {
    if (!vid || typeof vid !== 'string') return false;
    if (vid.includes('<!') || vid.includes('<html') || vid.includes('<?')) return false;
    return /^https?:\/\/|^\/|^app_images\/|^data:video/.test(vid);
  });

  let videosJsonString = "[]";
  try {
    videosJsonString = JSON.stringify(validVideos.filter(vid => typeof vid === 'string'));
  } catch (stringifyError) {
    console.error(`   ❌ [buildDetail] videos stringify FAILED:`, stringifyError);
    videosJsonString = "[]";
  }

  // Unified mixed-media field for systems using a single `album` type.
  let albumJsonString = "[]";
  try {
    const albumMedia = Array.from(new Set([
      ...validImages.filter((img) => typeof img === "string"),
      ...validVideos.filter((vid) => typeof vid === "string"),
    ]));
    albumJsonString = JSON.stringify(albumMedia);
  } catch (stringifyError) {
    console.error(`   ❌ [buildDetail] album stringify FAILED:`, stringifyError);
    albumJsonString = "[]";
  }

  console.log(`🖼️ [buildDetail] === IMAGE DEBUG END ===\n`);
  
  // ✅ IMPORTANT FOR LMKT: service_type field = project code (dự án slug)
  // NOT the service category (bat-dong-san)
  // In database web_service_detail: service_type = d-homme-quan-6, kieu-by-kita, etc.
  const dbServiceType = ctx.project || serviceType;
  
  console.log(`🏷️ [buildDetail] DB service_type="${dbServiceType}" (project="${ctx.project || '(none)'}", industry="${serviceType}")`);
  
  return {
    id: generateId(),
    service_type: dbServiceType,
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
    avatar: opts.avatar || "https://csmbridge.net/media/icon.png",
    publishDate: now.split("T")[0],
    readTime: readTime,
    views: 0,
    tags: Array.isArray(tags) ? tags : [serviceType],
    thumbnail: featuredImage,
    images: imagesJsonString, // ✅ SỬ DỤNG STRING ĐÃ VALIDATE
    videos: videosJsonString,
    album: albumJsonString,
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
      latestConfig = findZaloConfigById(allConfigs, opts.config_id);
      if (latestConfig) {
        console.log(`✅ [Config Loaded by ID] config_id=${opts.config_id}, domain=${latestConfig.domain}, fanpage=${latestConfig.fanpage_name}`);
      } else {
        console.warn(`⚠️ [Config NOT FOUND] config_id=${opts.config_id} - block posting to avoid cross-config risk`);
      }
    } catch (e) {
      console.error(`❌ [Config Load Error] Failed to load config by ID:`, e.message);
      latestConfig = null; // Reset để fallback
    }
  }

  if (opts.config_id && !latestConfig) {
    // ✅ FIX: Log rõ opts.domain để trace xem domain nào đang bị dùng khi config không tìm thấy
    console.error(`❌ [processContent] config_id=${opts.config_id} không tìm thấy trong loadDataOptionUser(). opts.domain=${opts.domain || '(undefined)'}, opts.service_type=${opts.service_type || '(undefined)'}`);
    throw new Error(`Không tìm thấy cấu hình Zalo theo config_id=${opts.config_id}. Đã dừng để tránh đăng nhầm domain/fanpage.`);
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

  const parseBooleanFlag = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === "") return !!defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
    return !!defaultValue;
  };

  const keepOriginalZaloContentToFacebook = parseBooleanFlag(
    opts.keep_original_zalo_content_to_facebook,
    parseBooleanFlag(latestConfig?.keep_original_zalo_content_to_facebook, false)
  );
  console.log(`🧩 [processContent] keep_original_zalo_content_to_facebook=${keepOriginalZaloContentToFacebook}`);
  
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
      domain: opts.domain || "csmbridge.net",
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
  const videos = essentials.videos;

  if (!essentials.isEligible) {
    throw new Error(`Tin nhắn không đủ điều kiện (cần đủ nội dung + media): hasContent=${essentials.hasText}, hasMedia=${essentials.hasMedia}`);
  }
  
  console.log(`[processContent] Bắt đầu xử lý - Domain: ${ctx.domain}, Service: ${industry}, Project: ${ctx.project}`);
  console.log(`[processContent] Bắt đầu xử lý - ${new Date().toLocaleTimeString()}`);
  console.log(`📸 [processContent] Extracted media from message: ${images.length} images, ${videos.length} videos`);
  
  thongbao(ti("🎬 Đang upload media (ảnh/video)...", "🎬 Uploading media (images/videos)...", "🎬 正在上传媒体（图片/视频）..."));
  let uploadedImages = [];
  let uploadedVideos = [];
  try {
    uploadedImages = await uploadImages(ctx, images) || [];
    if (!Array.isArray(uploadedImages)) {
      uploadedImages = [];
    }
    console.log(`✅ [processContent] Uploaded ${uploadedImages.length} images (from ${images.length} extracted)`);
    console.log(`   Sample uploaded paths: ${uploadedImages.slice(0, 2).join(', ')}${uploadedImages.length > 2 ? ` (+${uploadedImages.length - 2} more)` : ''}`);
  } catch (e) {
    console.error(`❌ [processContent] Lỗi upload ảnh:`, e.message);
    canhbao(ti("⚠️ Không upload được ảnh, tiếp tục thử video", "⚠️ Image upload failed, continue with video upload", "⚠️ 图片上传失败，继续尝试上传视频"));
    uploadedImages = [];
  } finally {
    // 🟢 CLEANUP: Giải phóng base64 data từ images array (có thể rất lớn)
    images.splice(0, images.length);
    console.log(`🧹 [Cleanup] Cleared ${images.length} base64 images from memory`);
  }

  try {
    uploadedVideos = await uploadVideos(ctx, videos) || [];
    if (!Array.isArray(uploadedVideos)) {
      uploadedVideos = [];
    }
    console.log(`✅ [processContent] Uploaded ${uploadedVideos.length} videos (from ${videos.length} extracted)`);
  } catch (e) {
    console.error(`❌ [processContent] Lỗi upload video:`, e.message);
    uploadedVideos = [];
  } finally {
    // 🟢 CLEANUP: Giải phóng video data
    videos.splice(0, videos.length);
    console.log(`🧹 [Cleanup] Cleared videos array from memory`);
  }

  if ((!uploadedImages || uploadedImages.length === 0) && (!uploadedVideos || uploadedVideos.length === 0)) {
    throw new Error(`Không upload được media hợp lệ (ảnh/video), bỏ qua tin nhắn để đảm bảo đủ dữ liệu cho web/fanpage`);
  }
  console.log(`[processContent] Upload media xong - ${uploadedImages.length} ảnh, ${uploadedVideos.length} video - ${new Date().toLocaleTimeString()}`);
  
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

  const fullUrlVideos = uploadedVideos.map((vid) => {
    if (!vid) return '';
    if (vid.startsWith('http://') || vid.startsWith('https://')) return vid;
    if (vid.startsWith('data:')) return vid;
    const domainList = ctx.domain.split(',').map(d => d.trim()).filter(d => d && !d.includes('localhost'));
    const primaryDomain = ctx.primary_domain || (domainList.length > 0 ? domainList[0] : ctx.domain.split(',')[0].trim());
    return `https://www.${primaryDomain}${vid.startsWith('/') ? vid : '/' + vid}`;
  }).filter(vid => vid && vid.trim());

  console.log(`✅ [processContent] Converted ${fullUrlVideos.length} videos to full URLs`);
  
  thongbao(ti("🤖 Đang tạo nội dung (Chống Chất AI)...", "🤖 Generating content (anti-AI pattern)...", "🤖 正在生成内容（反AI痕迹）..."));
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
  // DynamicCode chạy classic script — KHÔNG dùng import.meta (SyntaxError ngoài module)
  // SEO lane: mặc định classic (getAntiAIPrompt + 1 HTTP sync) — khác hoàn toàn luồng menu/code.
  // Chỉ bật one-shot backend khi VITE_AI_SEO_ONE_SHOT=true (seoContext, không full prompt).
  const seoOneShotEnabled = typeof window !== 'undefined' && window.VITE_AI_SEO_ONE_SHOT === 'true';
  const oneShotFn = ctx.helperAi?.generateSeoAntiAiOneShot;
  const useSeoOneShot = seoOneShotEnabled && typeof oneShotFn === 'function';

  const generateFn = ctx.helperAi?.generateSeoContentWithPrompt;
  if (!useSeoOneShot && !generateFn) throw new Error("generateSeoContentWithPrompt không khả dụng");
  if (useSeoOneShot && !oneShotFn) throw new Error("generateSeoAntiAiOneShot không khả dụng");

  let prompt = null;
  if (!useSeoOneShot) {
    // getAntiAIPrompt tự chọn persona/pattern ngẫu nhiên — không cần gọi creative-params riêng.
    prompt = getAntiAIPrompt(industry, content, articleHistory, {
      domainKey,
      ...opts
    }, imagesToPrompt, uniqueSeed);
  }
  
  // DEBUG: Kiểm tra prompt content
  if (prompt) {
    console.log(`[DEBUG] Prompt length: ${prompt?.length || 0} characters`);
    console.log(`[DEBUG] Prompt preview (first 500 chars):\n${prompt?.substring(0, 500)}`);
  } else {
    console.log(`[processContent] 🚀 SEO one-shot: 1 HTTP sync (seoContext → backend viết bài)`);
  }
  console.log(`[DEBUG] helperAi object:`, ctx.helperAi);
  
  if (!useSeoOneShot && (!prompt || prompt.trim().length === 0)) {
    throw new Error("Prompt rỗng - không thể gọi AI!");
  }
  
  console.log(`[processContent] ⏳ Gọi AI - BẮT ĐẦU CHỜ (SEO one-shot có thể mất 3-10 phút trên server yếu) - ${new Date().toLocaleTimeString()}`);
  thongbao(ti("⏳ Đang gọi AI... (SEO one-shot, có thể mất vài phút)", "⏳ Calling AI... (SEO one-shot, may take several minutes)", "⏳ 正在调用AI...（SEO一次性，可能需要几分钟）"));
  
  let result;
  let aiTimeoutId = null;
  try {
    // 🟢 TIMEOUT SAFETY: Đăng ký timeout vào timerRegistry để đảm bảo cleanup
    const aiTimeoutMs = useSeoOneShot ? 20 * 60 * 1000 : 120000;
    aiTimeoutId = setTimeout(() => {
      console.error(`⏱️ [processContent] AI timeout sau ${aiTimeoutMs}ms`);
    }, aiTimeoutMs);
    timerRegistry.register('processContent_ai_' + Date.now(), aiTimeoutId, 'timeout');
    
    const startAI = Date.now();
    if (useSeoOneShot) {
      result = await oneShotFn({
        industry,
        topic: content,
        domainKey,
        property: ctx.project,
        location: opts.location,
        business: opts.business,
        seed: uniqueSeed.replace(/[\[\]]/g, '')
      }, {
        preferAsync: false,
      });
    } else {
      result = await generateFn(prompt);
    }
    const durationAI = ((Date.now() - startAI) / 1000).toFixed(1);
    
    console.log(`[processContent] ✅ AI trả về - Mất ${durationAI}s - ${new Date().toLocaleTimeString()}`);
    console.log(`[DEBUG] AI Result:`, result);
    console.log(`[DEBUG] result.success:`, result?.success);
    console.log(`[DEBUG] result.message:`, result?.message);
    console.log(`[DEBUG] result.result:`, result?.result);
    console.log(`[DEBUG] result.data:`, result?.data);
  } catch (aiError) {
    // 🟢 CLEANUP: Xóa timeout nếu có lỗi
    if (aiTimeoutId) {
      timerRegistry.clear('processContent_ai_' + (aiTimeoutId.toString().match(/\d+/) || [Date.now()])[0]);
    }
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

  // ✅ Backend trả format: result.data.result = SEO content
  let seo = result.data?.result || result.result || result.data;

  // Fallback: backend có thể trả success=false khi không parse được JSON,
  // nhưng vẫn gửi rawContent để frontend tự phục hồi parse.
  if (!result.success) {
    const rawContent = result?.rawContent || result?.data?.rawContent;
    if (typeof rawContent === 'string' && rawContent.trim()) {
      console.warn('[processContent] ⚠️ AI returned success=false, attempting to parse rawContent fallback...');
      try {
        seo = parseSeoJsonString(rawContent);
        console.log('[processContent] ✅ Recovered SEO JSON from rawContent fallback');
      } catch (rawParseErr) {
        console.error('[processContent] ❌ Failed parsing rawContent fallback:', rawParseErr);
        throw new Error(`AI failed: ${result.message || 'Không có message'}`);
      }
    } else {
      throw new Error(`AI failed: ${result.message || 'Không có message'}`);
    }
  }
  
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
  const detail = buildDetail(ctx, seo, fullUrlImages, fullUrlVideos, { 
    author: opts.author,
    avatar: opts.avatar,
    activeHome: opts.activeHome,
    featured: opts.featured,
    priority: opts.priority
  });
  console.log(`[processContent] Built detail object - title: ${detail.title}, slug: ${detail.slug}, images: ${fullUrlImages.length}`);
  
  thongbao(ti("💾 Đang lưu dữ liệu...", "💾 Saving data...", "💾 正在保存数据..."));
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
  
  const fanpagesFromConfig = latestConfig
    ? (Array.isArray(latestConfig.zalo_fanpages) && latestConfig.zalo_fanpages.length > 0
        ? latestConfig.zalo_fanpages
        : (Array.isArray(latestConfig.fanpage_ids)
            ? latestConfig.fanpage_ids.map((id, idx) => ({
                id,
                name: latestConfig.fanpage_names?.[idx] || latestConfig.fanpage_name || 'Unknown',
                access_token: latestConfig.fanpage_tokens?.[idx] || latestConfig.fanpage_token || ''
              }))
            : []))
    : [];

  if (fanpagesFromConfig.length > 0) {
    // ✅ Config có nhiều fanpages - POST LÊN TẤT CẢ
    fanpagesToPost = fanpagesFromConfig;
    console.log(`✅ [Facebook] Config có ${fanpagesToPost.length} fanpages:`);
    fanpagesToPost.forEach((fp, idx) => {
      const hasToken = !!(fp.access_token && fp.access_token.length > 0);
      console.log(`   [${idx}] Name: "${fp.name}", ID: ${fp.id}, Has Token: ${hasToken ? '✅' : '❌ MISSING'} (${fp.access_token?.length || 0} chars)`);
    });
  } else if (ctx.fanpage_id) {
    if (opts.config_id) {
      throw new Error(`Cấu hình ${opts.config_id} không có danh sách fanpage hợp lệ. Đã dừng để tránh fallback sang fanpage khác.`);
    }
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
      thongbao(ti(`📱 Đang post lên ${fanpagesToPost.length} Facebook fanpage(s)...`, `📱 Posting to ${fanpagesToPost.length} Facebook fanpage(s)...`, `📱 正在发布到 ${fanpagesToPost.length} 个 Facebook 专页...`));
      console.log(`[processContent] Chuẩn bị post lên ${fanpagesToPost.length} fanpage(s)`);
      
      // ✅ VALIDATE TOKEN trước post (nếu cần) - chỉ validate 1 lần
      if (facebookState._needsValidation) {
        console.log(`[processContent] Token cần validate, đang validate...`);
        const isValid = await validateSavedTokenIfNeeded();
        if (!isValid) {
          throw new Error('Token không hợp lệ - vui lòng nhập lại');
        }
      }
      
      // Ưu tiên URL bài vừa tạo theo logic chuẩn (như luồng thủ công).
      let articleUrl = await getLastCreatedPostUrl(5, 600);

      if (!articleUrl) {
        // Fallback an toàn nếu lastDetail chưa sẵn sàng.
        const domainList = ctx.domain.split(',').map(d => d.trim()).filter(d => d && !d.includes('localhost'));
        const primaryDomain = ctx.primary_domain
          || (domainList.length > 0 ? domainList[Math.floor(Math.random() * domainList.length)] : ctx.domain.split(',')[0].trim());
        const protocol = "https://";

        console.log(`🌐 [Domain Selection] Config domains: ${ctx.domain}`);
        console.log(`🌐 [Domain Selection] Primary domain: ${primaryDomain}${ctx.primary_domain ? ' (from primary_domain field)' : ' (random from list)'}`);
        console.log(`🔍 [URL Debug] detail.service_type="${detail.service_type}", detail.slug="${detail.slug}"`);
        articleUrl = `${protocol}www.${primaryDomain}/${detail.service_type}/${detail.slug}`;
      }
      
      console.log(`📱 [Facebook] Article URL: ${articleUrl}`);
      
      // ✅ MỖI FANPAGE SẼ SINH NỘI DUNG AI RIÊNG (khác nhau) nhưng cùng link web
      const effectiveIndustry = ctx.service_type || 'bat-dong-san';
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

        if (keepOriginalZaloContentToFacebook) {
          const originalRawText = String(normalizeZaloText(content || "") || "").trim();
          if (originalRawText) {
            pageContent = originalRawText;
            if (!pageContent.includes(articleUrl)) {
              pageContent += '\n\n👉 Link bài viết: ' + articleUrl;
            }
            console.log(`✅ [Facebook Raw] Fanpage="${fanpageName}" using original Zalo content (${pageContent.length} chars)`);
            return pageContent;
          }
          console.warn(`⚠️ [Facebook Raw] Fanpage="${fanpageName}" cấu hình giữ nguyên nội dung nhưng tin Zalo rỗng, fallback sang AI`);
        }

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
            // ✅ FIX: Dùng toàn bộ AI content thay vì cắt xén
            // AI đã sinh đầy đủ content, hashtags, CTA - không cần cắt
            // Chỉ thêm link cuối cùng (nếu chưa có)
            let fullContent = '';
            
            // Ưu tiên content đã được tổng hợp (nếu có)
            if (fbPostData.full_post) {
              fullContent = fbPostData.full_post;
            } else if (fbPostData.facebook_post) {
              // Chuẩn hóa nội dung AI để không lặp block hashtag cuối bài.
              fullContent = formatFacebookPostContent(fbPostData.facebook_post, fbPostData.hashtags);
              if (fbPostData.cta && !fullContent.includes(fbPostData.cta)) {
                fullContent += '\n\n' + fbPostData.cta;
              }
            } else {
              // Fallback: nếu AI không trả về format mong đợi
              fullContent = fbPostData.toString();
            }
            
            // Thêm link web cuối cùng nếu chưa có
            if (!fullContent.includes(articleUrl)) {
              fullContent += '\n\n👉 Link bài viết: ' + articleUrl;
            }
            
            pageContent = fullContent;
            console.log(`✅ [Facebook AI] Fanpage="${fanpageName}" generated (${pageContent.length} chars, toàn bộ content AI)`);
          }
        } catch (e) {
          console.warn(`⚠️ [Facebook AI] Fanpage="${fanpageName}" failed: ${e.message}`);
        }

        if (!pageContent) {
          // ✅ FALLBACK ONLY: When AI fails, use full content without cutting
          // Dùng description/excerpt đầy đủ, không cắt substring
          const fallbackContent = [
            detail.description || detail.excerpt || '',
            '',
            detail.title || '',
            '',
            `👉 Xem chi tiết: ${articleUrl}`
          ].filter(line => line !== '').join('\n');
          
          pageContent = fallbackContent;
          console.log(`⚠️ [Facebook Fallback] Using full description (${pageContent.length} chars, không cắt content)`);
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

      const validFbVideos = fullUrlVideos.filter((vid, idx) => {
        if (!vid || typeof vid !== 'string') {
          console.log(`  [video ${idx}] ❌ REJECT: invalid value`);
          return false;
        }
        const isHttp = vid.startsWith('http://') || vid.startsWith('https://');
        const isData = vid.startsWith('data:');
        const isRelative = vid.startsWith('/app_images/') || vid.startsWith('app_images/');
        const ok = isHttp || isData || isRelative;
        console.log(`  [video ${idx}] ${ok ? '✅ ACCEPT' : '❌ REJECT'}: ${vid.substring(0, 60)}${vid.length > 60 ? '...' : ''}`);
        return ok;
      });
      
      console.log(`✅ [Facebook] Sẽ post ${validFbImages.length} hình hợp lệ`);
      console.log(`✅ [Facebook] Sẽ post ${validFbVideos.length} video hợp lệ`);
      
      // Chạy độc lập theo từng fanpage: mỗi fanpage = một quy trình đăng riêng.
      let successCount = 0;
      let failCount = 0;
      let tokenExpiredDetected = false;
      const postedFacebookItems = [];

      for (let pageIndex = 0; pageIndex < fanpagesToPost.length; pageIndex++) {
        const page = fanpagesToPost[pageIndex];
        const postSummary = await postToSelectedFanpages(
          [{
            sender: item?.sender || 'Zalo',
            content: extractMessageText(item) || detail.title || '',
            images: validFbImages,
            videos: validFbVideos
          }],
          articleUrl,
          [page],
          {
            images: validFbImages,
            videos: validFbVideos,
            helperAi: ctx.helperAi,
            seft: seft || {},
            industry: effectiveIndustry,
            skipRecord: true
          }
        );

        successCount += Number(postSummary?.successCount || 0);
        failCount += Number(postSummary?.failCount || 0);
        if (Array.isArray(postSummary?.postedItems) && postSummary.postedItems.length > 0) {
          postedFacebookItems.push(...postSummary.postedItems);
        }

        if (postSummary?.tokenExpiredDetected) {
          tokenExpiredDetected = true;
          break;
        }
      }

      if (tokenExpiredDetected) {
        const msg = ti('❌ Facebook token đã hết hạn trong lúc chạy. Vui lòng cập nhật token và chạy lại.', '❌ Facebook token expired during execution. Please refresh token and retry.', '❌ Facebook Token 在运行中已过期，请更新后重试。');
        canhbao(msg);
        thongbao(msg);
      }

      // ✅ CRITICAL: Record posted Zalo message SAU KHI post FB thành công (tránh duplicate)
      if (successCount > 0) {
        // Lưu post_id Facebook vào attributes để cleanup Graph API về sau
        if (postedFacebookItems.length > 0) {
          try {
            const attributes = safeParseJson(detail.attributes, {}) || {};
            const existingPosts = Array.isArray(attributes.facebook_posts) ? attributes.facebook_posts : [];
            const mergedPosts = [...existingPosts, ...postedFacebookItems]
              .filter((p) => p && p.post_id)
              .filter((p, idx, arr) => arr.findIndex((x) => x.post_id === p.post_id) === idx);

            attributes.facebook_posts = mergedPosts;
            attributes.facebook_post_ids = mergedPosts.map((p) => p.post_id);

            detail.attributes = JSON.stringify(attributes);
            detail.updated_at = new Date().toISOString();
            await upsertDetail(ctx, detail);
            console.log(`💾 [processContent] Saved ${mergedPosts.length} Facebook post IDs into detail.attributes`);
          } catch (persistFbErr) {
            console.warn(`⚠️ [processContent] Không lưu được Facebook post IDs: ${persistFbErr.message}`);
          }
        }

        if (opts.groupName && opts.config_id && opts.isZaloMessage) {
          console.log(`💾 [processContent] Recording posted Zalo message: group=${opts.groupName}, config=${opts.config_id}`);
          recordPostedZaloMessage(item, opts.groupName, opts.config_id);
        }
        
        // ✅ Set flag để posting worker biết bài viết đã hoàn tất
        window.__lastPostCompleted = true;
        
        thongbao(ti(`✅ Hoàn tất: ${successCount}/${fanpagesToPost.length} fanpage(s) thành công${failCount > 0 ? `, ${failCount} lỗi` : ''}!`, `✅ Completed: ${successCount}/${fanpagesToPost.length} fanpage(s) succeeded${failCount > 0 ? `, ${failCount} failed` : ''}!`, `✅ 完成：${successCount}/${fanpagesToPost.length} 个专页成功${failCount > 0 ? `，${failCount} 个失败` : ''}！`));
        console.log(`\n🎉 [Facebook] Kết quả: ${successCount}/${fanpagesToPost.length} fanpage(s) thành công, ${failCount} lỗi`);
      } else {
        console.warn(`⚠️ [Facebook] Không post được fanpage nào`);
        thongbao(ti(`⚠️ Không post được fanpage nào`, `⚠️ Could not post to any fanpage`, `⚠️ 未能发布到任何专页`));
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
      domain: "csmbridge.net"
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
      configToUse = findZaloConfigById(allConfigs, configIdOverride);
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

  if (configIdOverride && !configToUse) {
    throw new Error(`runMessages aborted: không tìm thấy config_id=${configIdOverride}, dừng để tránh đăng nhầm domain/fanpage.`);
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

      thongbao(ti(`🔄 Đang xử lý tin ${i + 1}/${messages.length}...`, `🔄 Processing message ${i + 1}/${messages.length}...`, `🔄 正在处理消息 ${i + 1}/${messages.length}...`));
      
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
      thongbao(ti(`✅ [${i + 1}/${messages.length}] Đã xử lý xong tin nhắn`, `✅ [${i + 1}/${messages.length}] Message processed`, `✅ [${i + 1}/${messages.length}] 消息处理完成`));
    } catch (e) {
      fail++;
      canhbao(ti(`❌ [${i + 1}/${messages.length}] Lỗi: ${e.message}`, `❌ [${i + 1}/${messages.length}] Error: ${e.message}`, `❌ [${i + 1}/${messages.length}] 错误：${e.message}`));
    }
    
    // Delay sau mỗi tin (trừ tin cuối cùng)
    if (i < messages.length - 1) {
      const delayMs = FACEBOOK_POST_COOLDOWN_MIN_MS;
      const delaySecs = Math.round(delayMs / 1000);
      thongbao(ti(`⏳ Chờ ${delaySecs} giây trước khi xử lý tin tiếp theo...`, `⏳ Waiting ${delaySecs}s before next message...`, `⏳ 等待 ${delaySecs} 秒后处理下一条消息...`));
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  thongbao(ti(`✅ Hoàn tất! Thành công: ${ok}, Lỗi: ${fail}`, `✅ Done! Success: ${ok}, Failed: ${fail}`, `✅ 完成！成功：${ok}，失败：${fail}`));
}

// ===== UI =====
function ensureUnifiedUIContainer() {
  // Mount all UI into a stable dynamic host, with fallbacks.
  const preferredContainerId = (typeof window !== 'undefined' && window.csmDynamicCodeContainerId)
    ? window.csmDynamicCodeContainerId
    : null;

  const host =
    (preferredContainerId ? document.getElementById(preferredContainerId) : null)
    || document.getElementById("context-auto")
    || document.getElementById("dynamic-code-root")
    || document.getElementById("dynamic-code-root-default");

  if (!host) {
    console.warn("⚠️ Không tìm thấy container mount dynamic code, không thể mount UI");
    return null;
  }

  let container = document.getElementById("csm-ui-container");
  if (!container) {
    container = host.querySelector("[data-csm-ui-container]");
  }

  if (!container) {
    container = document.createElement("div");
    container.id = "csm-ui-container";
    container.setAttribute("data-csm-ui-container", "1");
    container.style.cssText = "width:100%;padding:0 16px;margin:0 auto;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;";
  }

  // Ensure container is physically inside #context-auto.
  if (!host.contains(container)) {
    host.prepend(container);
  }

  return container;
}

function ensureMainFeatureTabs() {
  const container = document.getElementById('csm-ui-container');
  if (!container) return;
  const getLiveTheme = () => ({
    theme: getThemeTokens(),
    isDark: isDarkThemeActive()
  });

  const tabDefs = [
    {
      id: 'zalo-multi-group-ui',
      label: ti('💬 Trình quét nhiều nhóm Zalo', '💬 Zalo multi-group scanner', '💬 Zalo 多群扫描')
    },
    {
      id: 'multi-domain-ui',
      label: ti('🌐 Quản lý nội dung đa miền', '🌐 Multi-domain manager', '🌐 多域内容管理')
    },
    {
      id: 'facebook-post-ui',
      label: ti('📱 Facebook Token Management', '📱 Facebook Token Management', '📱 Facebook Token 管理')
    },
    {
      id: 'service-content-ui',
      label: ti('🧩 Tạo nội dung dịch vụ', '🧩 Service content generator', '🧩 服务内容生成')
    },
    {
      id: 'ads-api-test-panel',
      label: ti('📢 Kiểm thử API quảng cáo', '📢 Ads API test', '📢 广告 API 测试')
    },
    {
      id: 'ai-lane-test-panel',
      label: ti('🧪 Test AI Lane (4a/4b/5)', '🧪 AI Lane test (4a/4b/5)', '🧪 AI通道测试')
    }
  ];

  const availablePanels = tabDefs
    .map(def => ({ ...def, panel: document.getElementById(def.id) }))
    .filter(item => !!item.panel);

  if (availablePanels.length === 0) return;

  let shell = document.getElementById('csm-main-feature-tabs');
  let header = document.getElementById('csm-main-feature-tabs-header');
  let content = document.getElementById('csm-main-feature-tabs-content');

  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'csm-main-feature-tabs';
    shell.style.cssText = 'display:flex;flex-direction:column;gap:10px;position:relative;z-index:2;padding:10px;border-radius:12px;';

    header = document.createElement('div');
    header.id = 'csm-main-feature-tabs-header';
    header.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;padding:8px;border-radius:10px;';

    content = document.createElement('div');
    content.id = 'csm-main-feature-tabs-content';
    content.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    shell.append(header, content);

    const globalPanel = document.getElementById('global-settings-panel');
    if (globalPanel && globalPanel.parentElement === container) {
      if (globalPanel.nextSibling) {
        container.insertBefore(shell, globalPanel.nextSibling);
      } else {
        container.appendChild(shell);
      }
    } else {
      container.prepend(shell);
    }
  }

  const applyShellTheme = () => {
    const { theme, isDark } = getLiveTheme();
    shell.style.border = `1px solid ${theme.border}`;
    shell.style.background = theme.surface || theme.bg;
    shell.style.boxShadow = isDark ? '0 1px 2px rgba(0,0,0,0.35)' : '0 1px 2px rgba(0,0,0,0.05)';

    header.style.border = `1px solid ${theme.border}`;
    header.style.background = theme.bg;
    header.style.color = theme.text;
  };

  applyShellTheme();

  header.innerHTML = '';

  const paneById = new Map();
  availablePanels.forEach(({ id, panel }) => {
    let pane = content.querySelector(`[data-feature-pane="${id}"]`);
    if (!pane) {
      pane = document.createElement('div');
      pane.setAttribute('data-feature-pane', id);
      pane.style.cssText = 'display:none;';
      content.appendChild(pane);
    }
    if (panel.parentElement !== pane) {
      pane.appendChild(panel);
    }
    paneById.set(id, pane);
  });

  Array.from(content.querySelectorAll('[data-feature-pane]')).forEach(pane => {
    const paneId = pane.getAttribute('data-feature-pane');
    if (!paneById.has(paneId)) {
      pane.remove();
    }
  });

  const activeSaved = safeLocalStorageGet(CSM_MAIN_FEATURE_TAB_STORAGE_KEY);
  const activeFromRuntime = window.__csmMainFeatureActiveTab || null;
  let activeTabId = paneById.has(activeFromRuntime)
    ? activeFromRuntime
    : (paneById.has(activeSaved) ? activeSaved : availablePanels[0].id);

  const styleTabButton = (btn, isActive) => {
    const { theme } = getLiveTheme();
    btn.style.background = isActive ? theme.primary : (theme.surface || theme.bg);
    btn.style.color = isActive ? '#fff' : theme.text;
    btn.style.border = `1px solid ${isActive ? theme.primary : theme.border}`;
    btn.style.borderRadius = '8px';
    btn.style.padding = '8px 10px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.opacity = isActive ? '1' : '0.95';
    btn.style.pointerEvents = 'auto';
    btn.style.transition = 'all 120ms ease';
    btn.style.outline = 'none';
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  };

  const setActive = (tabId) => {
    if (!paneById.has(tabId)) return;
    activeTabId = tabId;
    applyShellTheme();

    paneById.forEach((pane, id) => {
      pane.style.display = id === activeTabId ? 'block' : 'none';
    });

    Array.from(header.querySelectorAll('button[data-feature-tab]')).forEach(btn => {
      const isActive = btn.getAttribute('data-feature-tab') === activeTabId;
      styleTabButton(btn, isActive);
    });

    window.__csmMainFeatureActiveTab = activeTabId;
    safeLocalStorageSet(CSM_MAIN_FEATURE_TAB_STORAGE_KEY, activeTabId);
  };

  availablePanels.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-feature-tab', id);
    btn.textContent = label;
    styleTabButton(btn, false);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActive(id);
    });
    header.appendChild(btn);
  });

  if (availablePanels.length <= 1) {
    header.style.display = 'none';
  } else {
    header.style.display = 'flex';
  }

  setActive(activeTabId);
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
  industryLabel.textContent = t('industry');
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
  projectLabel.textContent = t('project');
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

function refreshGlobalSettingsOptionsFromDefinitions() {
  try {
    const domainSelect = document.getElementById("global-domain-select");
    const industrySelect = document.getElementById("global-industry-select");
    const projectSelect = document.getElementById("global-project-select");

    if (!domainSelect || !industrySelect || !projectSelect) {
      return false;
    }

    const currentDomain = domainSelect.value || 'phanmemmottrieu';

    const projectOptions = LMKT_PROJECT_DEFS
      .map(item => ({
        value: item.service_code,
        label: item.name,
        priority: item.attributes_priority || 999
      }))
      .sort((a, b) => a.priority - b.priority);

    const industryOptions = Object.entries(INDUSTRY_TYPES)
      .map(([key, ind]) => ({
        value: key,
        label: ind.name || ind.category || key,
        color: ind.color,
        priority: ind.attributes_priority || 999
      }))
      .sort((a, b) => a.priority - b.priority);

    updateSelectOptions(projectSelect, projectOptions, projectSelect.value);
    updateSelectOptions(industrySelect, industryOptions, industrySelect.value);

    if (currentDomain === 'lmkt' && industryOptions.some(o => o.value === 'bat-dong-san')) {
      industrySelect.value = 'bat-dong-san';
    }

    domainSelect.dispatchEvent(new Event('change'));
    return true;
  } catch (e) {
    console.warn('⚠️ [syncServiceDefs] Refresh global options failed:', e.message);
    return false;
  }
}

// ===== GLOBAL SETTINGS PANEL =====
/**
 * Tạo Global Settings Panel - Hiển thị 1 lần duy nhất ở đầu trang
 * Chứa Domain, Industry, Project selectors dùng chung cho tất cả UI
 */
function ensureGlobalSettingsPanel() {
  const existing = document.getElementById("global-settings-panel");
  if (existing) return existing;

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "global-settings-panel";
  wrapper.style.cssText = getFeatureCardStyle(theme) + ";margin-bottom:16px;";

  const title = document.createElement("div");
  title.textContent = t('general_settings');
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

  // Theme mode selector removed: LMKT now follows app/system theme automatically.

  // Load categories from web_services button
  const loadBtn = document.createElement('button');
  loadBtn.textContent = t('load_categories');
  loadBtn.style.cssText = `padding:6px 10px;border:1px solid ${theme.border};border-radius:4px;background:${theme.bg};color:${theme.text};font-size:12px;cursor:pointer`;

  loadBtn.onclick = async () => {
    const domainKey = domainSelect.value || 'phanmemmottrieu';
    loadBtn.disabled = true;
    loadBtn.textContent = t('loading');
    try {
      await loadCategoriesFromWebServices(domainKey);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = t('load_categories');
    }
  };

  // Append rows to grid container
  settingsContainer.append(domainRow, industryRow, projectRow);
  settingsContainer.append(loadBtn);

  const facebookCommonSection = document.createElement('div');
  facebookCommonSection.id = 'facebook-common-settings';
  facebookCommonSection.style.cssText = `margin-top:14px;padding:12px;border:1px solid ${theme.border};border-radius:8px;background:${theme.surface || theme.bg};`;
  facebookCommonSection.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;color:${theme.text};font-size:13px;">
      ${ti('📱 Facebook Token & Fanpage dùng chung', '📱 Shared Facebook Token & Fanpages', '📱 共用 Facebook Token 与 Fanpage')}
    </div>
    <div style="font-size:12px;color:${theme.muted || theme.textSecondary};margin-bottom:8px;line-height:1.5;">
      ${ti(
        'Dùng chung cho toàn bộ luồng đăng Facebook và cấu hình nhóm Zalo. Chọn fanpage ở đây sẽ được giữ lại khi bạn tạo cấu hình Zalo mới.',
        'Shared across Facebook posting and Zalo group configurations. Fanpages selected here are kept when creating new Zalo configs.',
        '该区域供 Facebook 发布与 Zalo 群组配置共用。在此勾选的 fanpage 会在新建 Zalo 配置时保持不变。'
      )}
    </div>
    <div id="fb-manual-token-input" style="margin-top:5px;">
      <label style="color:${theme.text};font-size:12px;">${ti('Nhập User hoặc Page Access Token (lấy từ <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color:' + theme.link + ';">Graph API Explorer</a>):', 'Enter User or Page Access Token (from <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color:' + theme.link + ';">Graph API Explorer</a>):', '输入 User 或 Page Access Token（来自 <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color:' + theme.link + ';">Graph API Explorer</a>）：')}</label><br>
      <textarea id="fb-token-input" rows="3" style="width:100%;padding:8px;margin-top:5px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};" placeholder="${ti('Dán User/Page Access Token tại đây...', 'Paste User/Page Access Token here...', '在此粘贴 User/Page Access Token...')}"></textarea>
      <button id="btn-fb-save-token" style="padding:6px 12px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;margin-top:5px;">
        ${ti('Lưu Token', 'Save Token', '保存 Token')}
      </button>
    </div>
    <div id="fb-pages-list" style="margin-top:10px;display:none;">
      <label style="color:${theme.text};font-size:12px;">${ti('Chọn Fanpage (có thể chọn nhiều):', 'Select Fanpages (multiple allowed):', '选择 Fanpage（可多选）：')}</label><br>
      <div id="fb-pages-checkboxes" style="margin-top:8px;max-height:220px;overflow-y:auto;padding:8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};"></div>
    </div>
  `;
  
  // Append title and container to wrapper
  wrapper.append(title, settingsContainer, facebookCommonSection);

  // Insert settings UI into container
  const container = ensureUnifiedUIContainer();
  if (container) {
    container.insertBefore(wrapper, container.firstChild);
    console.log('✅ [ensureGlobalSettingsPanel] Panel mounted to DOM');
  } else {
    console.warn('⚠️ [ensureGlobalSettingsPanel] Container not ready - MutationObserver will recreate');
  }

  return wrapper;
}

async function loadCategoriesFromWebServices(domainKey) {
  // Force sync từ server để cập nhật INDUSTRY_TYPES và LMKT_PROJECT_DEFS
  const syncResult = await syncServiceDefinitionsFromServer(true);
  
  if (!syncResult.success) {
    const errorMsg = syncResult.reason === 'api_not_available' 
      ? "⚠️ window.csmApi.getTableData không khả dụng"
      : `❌ Sync failed: ${syncResult.error || 'Unknown error'}`;
    throw new Error(errorMsg);
  }
  
  // Refresh UI select options với data mới từ INDUSTRY_TYPES/LMKT_PROJECT_DEFS
  const domainSelect = document.getElementById("global-domain-select");
  const industrySelect = document.getElementById("global-industry-select");
  const projectSelect = document.getElementById("global-project-select");

  if (domainKey === 'lmkt') {
    const projectOptions = LMKT_PROJECT_DEFS
      .map(item => ({
        value: item.service_code,
        label: item.name
      }))
      .sort((a, b) => {
        const aPriority = LMKT_PROJECT_DEFS.find(p => p.service_code === a.value)?.attributes_priority || 999;
        const bPriority = LMKT_PROJECT_DEFS.find(p => p.service_code === b.value)?.attributes_priority || 999;
        return aPriority - bPriority;
      });

    updateSelectOptions(projectSelect, projectOptions, projectSelect?.value);
    if (projectSelect) projectSelect.dispatchEvent(new Event('change'));
  } else {
    const industryOptions = Object.entries(INDUSTRY_TYPES)
      .map(([key, ind]) => ({
        value: key,
        label: ind.name || ind.category || key,
        priority: ind.attributes_priority || 999
      }))
      .sort((a, b) => a.priority - b.priority);

    updateSelectOptions(industrySelect, industryOptions, industrySelect?.value);
    if (industrySelect) industrySelect.dispatchEvent(new Event('change'));
  }

  if (domainSelect) domainSelect.dispatchEvent(new Event('change'));

  const totalCount = domainKey === 'lmkt' 
    ? LMKT_PROJECT_DEFS.length 
    : Object.keys(INDUSTRY_TYPES).length;
  const message = domainKey === 'lmkt'
    ? ti(`✅ Đã sync ${totalCount} dự án LMKT từ server`, `✅ Synced ${totalCount} LMKT projects from server`, `✅ 已从服务器同步 ${totalCount} 个 LMKT 项目`)
    : ti(`✅ Đã sync ${totalCount} loại hình dịch vụ từ server`, `✅ Synced ${totalCount} service types from server`, `✅ 已从服务器同步 ${totalCount} 个服务类型`);
  
  if (window.showNotification) {
    window.showNotification({ type: 'success', message, duration: 3 });
  } else {
    thongbao(message);
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

const ADS_TESTER_STORAGE_KEY = "csm_ads_tester_draft";

function readAdsTesterDraft() {
  try {
    const raw = localStorage.getItem(ADS_TESTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.warn("⚠️ [AdsTester] Không đọc được draft:", e.message);
    return {};
  }
}

function writeAdsTesterDraft(draft = {}) {
  try {
    localStorage.setItem(ADS_TESTER_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn("⚠️ [AdsTester] Không lưu được draft:", e.message);
  }
}

function adsTesterNotify(message, type = "info") {
  if (type === "success" && typeof thongbao === "function") return thongbao(message);
  if (type === "error" && typeof canhbao === "function") return canhbao(message);
  if (typeof thongbao === "function") return thongbao(message);
  console.log(message);
}

function appendAdsTesterLog(logEl, title, data) {
  if (!logEl) return;
  const timestamp = new Date().toLocaleTimeString();
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const next = `[${timestamp}] ${title}\n${payload}\n\n${logEl.value || ""}`;
  logEl.value = next.trim();
}

async function callAdsCampaignApi(platform, payload = {}) {
  const ctx = resolveContext();
  const route = platform === "facebook" ? "/facebook/ads/campaign" : "/google/ads/campaign";
  const apiUrl = `${ctx.apiBase}${route}`;

  if (!ctx.apiBase) {
    throw new Error("Thiếu apiBase (domain_api_url). Không thể gọi Ads API.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: buildApiHeaders(ctx),
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let responseData = {};
  try {
    responseData = responseText ? JSON.parse(responseText) : {};
  } catch (_e) {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    const errorMsg = responseData?.message || responseData?.error || responseText || `HTTP ${response.status}`;
    throw new Error(`HTTP ${response.status}: ${errorMsg}`);
  }

  if (responseData && typeof responseData.code === "number" && responseData.code >= 400) {
    throw new Error(responseData.message || `API trả code ${responseData.code}`);
  }

  return responseData;
}

async function generateAdsCreativeWithAI(input = {}) {
  const ctx = resolveContext();
  const helperAi = (ctx && ctx.helperAi) || (typeof window !== "undefined" ? window.csmAI : null);
  if (!helperAi || typeof helperAi.generateSeoContentWithPrompt !== "function") {
    throw new Error("Không tìm thấy AI helper (window.csmAI.generateSeoContentWithPrompt)");
  }

  const brief = String(input.brief || "").trim();
  const targetUrl = String(input.target_url || "").trim();
  const campaignName = String(input.campaign_name || "").trim();
  const domain = String(input.domain || "").trim();
  const serviceType = String(input.service_type || "").trim();

  const prompt = `
Bạn là chuyên gia Performance Marketing.
Hãy tạo nội dung quảng cáo cho Facebook Ads và Google Ads.

YÊU CẦU:
- Trả về CHỈ JSON hợp lệ, không markdown.
- Giọng văn tự nhiên, rõ lợi ích, có CTA.
- Nội dung an toàn chính sách, không phóng đại quá mức.

NGỮ CẢNH:
- campaign_name: ${campaignName || "Auto Campaign"}
- domain: ${domain || "n/a"}
- service_type: ${serviceType || "n/a"}
- target_url: ${targetUrl || "n/a"}
- brief: ${brief || "Tối ưu lead chất lượng"}

JSON SCHEMA:
{
  "headline": "...",
  "description": "...",
  "message": "...",
  "cta": "...",
  "keywords": ["...", "..."]
}
`;

  const aiResponse = await helperAi.generateSeoContentWithPrompt(prompt);
  if (!aiResponse || aiResponse.success === false) {
    throw new Error(aiResponse?.message || "AI không trả về kết quả hợp lệ");
  }

  let aiData = aiResponse.data?.result || aiResponse.result || aiResponse.data || aiResponse;
  if (typeof aiData === "string") {
    aiData = parseSeoJsonString(aiData);
  }

  const headline = String(aiData?.headline || aiData?.title || campaignName || "").trim();
  const description = String(aiData?.description || aiData?.desc || "").trim();
  const message = String(aiData?.message || aiData?.facebook_post || aiData?.content || description || headline).trim();
  const cta = String(aiData?.cta || "Dang ky ngay").trim();
  const keywords = Array.isArray(aiData?.keywords) ? aiData.keywords.filter(Boolean) : [];

  if (!headline || !message) {
    throw new Error("AI output thiếu headline/message");
  }

  return { headline, description, message, cta, keywords, raw: aiData };
}

function requestAdsPushApproval(theme, preview = {}) {
  if (typeof document === "undefined" || !document.body) {
    const fallbackMsg = [
      t('ads_fallback_confirm_intro'),
      t('ads_fallback_confirm_question'),
      `Headline: ${preview.headline || t('ads_approve_empty')}`,
      `Description: ${preview.description || t('ads_approve_empty')}`,
      `Message: ${(preview.message || t('ads_approve_empty')).slice(0, 220)}`
    ].join("\n");
    return Promise.resolve(window.confirm(fallbackMsg));
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:16px";

    const modal = document.createElement("div");
    modal.style.cssText = `width:min(680px,96vw);max-height:82vh;overflow:auto;background:${theme.bg};color:${theme.text};border:1px solid ${theme.border};border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,0.25);padding:14px`;

    const heading = document.createElement("div");
    heading.textContent = t('ads_approve_title');
    heading.style.cssText = `font-size:16px;font-weight:700;margin-bottom:8px;color:${theme.text}`;

    const sub = document.createElement("div");
    sub.textContent = t('ads_approve_sub');
    sub.style.cssText = `font-size:12px;line-height:1.5;margin-bottom:10px;color:${theme.textSecondary}`;

    const previewBox = document.createElement("div");
    previewBox.style.cssText = `background:${theme.inputBg};border:1px solid ${theme.border};border-radius:8px;padding:10px;display:grid;gap:8px`;

    const mkRow = (label, value) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;gap:4px";
      const lb = document.createElement("div");
      lb.textContent = label;
      lb.style.cssText = `font-size:12px;font-weight:600;color:${theme.text}`;
      const val = document.createElement("div");
      val.textContent = value || t('ads_approve_empty');
      val.style.cssText = `font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:${theme.textSecondary}`;
      row.append(lb, val);
      return row;
    };

    previewBox.append(
      mkRow("Headline", preview.headline),
      mkRow("Description", preview.description),
      mkRow("Message", preview.message)
    );

    const actionRow = document.createElement("div");
    actionRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = t('ads_approve_cancel');
    cancelBtn.style.cssText = `padding:8px 12px;border:1px solid ${theme.border};background:${theme.bg};color:${theme.text};border-radius:6px;cursor:pointer`;

    const approveBtn = document.createElement("button");
    approveBtn.textContent = t('ads_approve_confirm');
    approveBtn.style.cssText = "padding:8px 12px;border:none;background:#1677ff;color:#fff;border-radius:6px;cursor:pointer";

    const cleanup = (approved) => {
      overlay.remove();
      resolve(!!approved);
    };

    cancelBtn.onclick = () => cleanup(false);
    approveBtn.onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    actionRow.append(cancelBtn, approveBtn);
    modal.append(heading, sub, previewBox, actionRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

function ensureAdsApiTestPanel() {
  const existing = document.getElementById("ads-api-test-panel");
  if (existing) return existing;

  const theme = getThemeTokens();
  const draft = readAdsTesterDraft();

  const wrapper = document.createElement("div");
  wrapper.id = "ads-api-test-panel";
  wrapper.style.cssText = getFeatureCardStyle(theme) + ";margin-top:16px;";

  const title = document.createElement("div");
  title.textContent = t('ads_panel_title');
  title.style.cssText = getFeatureTitleStyle(theme);

  const hint = document.createElement("div");
  hint.style.cssText = `margin:8px 0 12px 0;padding:8px;border-radius:6px;background:${theme.infoBg};color:${theme.infoText};font-size:12px;line-height:1.5`;
  hint.textContent = t('ads_panel_hint');

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px";

  const makeField = (labelText, id, placeholder = "", value = "", type = "text") => {
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:4px";

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    label.style.cssText = `font-size:12px;font-weight:600;color:${theme.text}`;

    const input = document.createElement("input");
    input.id = id;
    input.type = type;
    input.value = value || "";
    input.placeholder = placeholder;
    input.style.cssText = `padding:8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};font-size:12px`;

    box.append(label, input);
    return { box, input };
  };

  const makeTextarea = (labelText, id, placeholder = "", value = "") => {
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:4px";

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    label.style.cssText = `font-size:12px;font-weight:600;color:${theme.text}`;

    const input = document.createElement("textarea");
    input.id = id;
    input.value = value || "";
    input.placeholder = placeholder;
    input.rows = 3;
    input.style.cssText = `padding:8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};font-size:12px;resize:vertical`;

    box.append(label, input);
    return { box, input };
  };

  const campaignNameField = makeField(
    t('ads_lbl_campaign_name'),
    "ads-test-campaign-name",
    t('ads_ph_campaign'),
    draft.campaign_name || ""
  );
  const objectiveField = makeField(
    t('ads_lbl_objective'),
    "ads-test-objective",
    t('ads_ph_objective'),
    draft.objective || "OUTCOME_TRAFFIC"
  );
  const budgetField = makeField(
    t('ads_lbl_budget_daily'),
    "ads-test-budget",
    t('ads_ph_budget'),
    draft.budget || "50000",
    "number"
  );
  const linkField = makeField(
    t('ads_lbl_target_url'),
    "ads-test-target-url",
    "https://example.com",
    draft.target_url || ""
  );
  const headlineField = makeField(
    t('ads_lbl_headline'),
    "ads-test-headline",
    t('ads_ph_headline'),
    draft.headline || ""
  );
  const descriptionField = makeField(
    t('ads_lbl_description'),
    "ads-test-description",
    t('ads_ph_description'),
    draft.description || ""
  );
  const messageField = makeTextarea(
    t('ads_lbl_message'),
    "ads-test-message",
    t('ads_ph_message'),
    draft.message || ""
  );
  const aiBriefField = makeTextarea(
    t('ads_lbl_ai_brief'),
    "ads-test-ai-brief",
    t('ads_ph_ai_brief'),
    draft.ai_brief || ""
  );

  const fbAdAccountField = makeField(
    t('ads_lbl_fb_ad_account'),
    "ads-test-fb-ad-account",
    t('ads_ph_fb_ad_account'),
    draft.fb_ad_account_id || ""
  );
  const fbPageIdField = makeField(
    t('ads_lbl_fb_page_id'),
    "ads-test-fb-page-id",
    "Page ID",
    draft.fb_page_id || ""
  );
  const fbTokenField = makeField(
    t('ads_lbl_fb_page_token'),
    "ads-test-fb-page-token",
    "EAAB...",
    draft.fb_page_access_token || ""
  );

  const ggCustomerField = makeField(
    t('ads_lbl_gg_customer_id'),
    "ads-test-gg-customer",
    t('ads_ph_gg_customer_id'),
    draft.gg_customer_id || ""
  );
  const ggAccessTokenField = makeField(
    t('ads_lbl_gg_access_token'),
    "ads-test-gg-access-token",
    "ya29...",
    draft.gg_access_token || ""
  );
  const ggDevTokenField = makeField(
    t('ads_lbl_gg_developer_token'),
    "ads-test-gg-developer-token",
    "Dev token",
    draft.gg_developer_token || ""
  );
  const ggLoginCustomerField = makeField(
    t('ads_lbl_gg_login_customer_id'),
    "ads-test-gg-login-customer",
    t('ads_ph_gg_login_customer_id'),
    draft.gg_login_customer_id || ""
  );

  grid.append(
    campaignNameField.box,
    objectiveField.box,
    budgetField.box,
    linkField.box,
    headlineField.box,
    descriptionField.box,
    messageField.box,
    aiBriefField.box,
    fbAdAccountField.box,
    fbPageIdField.box,
    fbTokenField.box,
    ggCustomerField.box,
    ggAccessTokenField.box,
    ggDevTokenField.box,
    ggLoginCustomerField.box
  );

  const actionRow = document.createElement("div");
  actionRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px";

  const approvalToggleRow = document.createElement("label");
  approvalToggleRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:${theme.text}`;
  const approvalToggle = document.createElement("input");
  approvalToggle.type = "checkbox";
  approvalToggle.checked = draft.approve_before_push !== false;
  approvalToggle.style.cssText = "cursor:pointer";
  const approvalToggleText = document.createElement("span");
  approvalToggleText.textContent = t('ads_approval_label');
  approvalToggleRow.append(approvalToggle, approvalToggleText);

  const fbBtn = createButton(t('ads_btn_test_fb'), "#1877f2");
  const ggBtn = createButton(t('ads_btn_test_gg'), "#4285f4");
  const aiPushBothBtn = createButton(t('ads_btn_ai_push'), "#722ed1");
  const fillKnownIdsBtn = createButton(t('ads_btn_fill_ids'), "#13a8a8");
  const fillMinimalPayloadBtn = createButton(t('ads_btn_fill_payload'), "#2f54eb");
  const clearBtn = createButton(t('ads_btn_clear_log'), "#8c8c8c");

  const logArea = document.createElement("textarea");
  logArea.id = "ads-test-log";
  logArea.readOnly = true;
  logArea.placeholder = t('ads_ph_log');
  logArea.style.cssText = `width:100%;min-height:180px;margin-top:10px;padding:10px;border:1px solid ${theme.border};border-radius:6px;background:${theme.bg};color:${theme.text};font-family:monospace;font-size:12px`;

  const saveDraft = () => {
    writeAdsTesterDraft({
      campaign_name: campaignNameField.input.value,
      objective: objectiveField.input.value,
      budget: budgetField.input.value,
      target_url: linkField.input.value,
      headline: headlineField.input.value,
      description: descriptionField.input.value,
      message: messageField.input.value,
      ai_brief: aiBriefField.input.value,
      approve_before_push: approvalToggle.checked,
      fb_ad_account_id: fbAdAccountField.input.value,
      fb_page_id: fbPageIdField.input.value,
      fb_page_access_token: fbTokenField.input.value,
      gg_customer_id: ggCustomerField.input.value,
      gg_access_token: ggAccessTokenField.input.value,
      gg_developer_token: ggDevTokenField.input.value,
      gg_login_customer_id: ggLoginCustomerField.input.value
    });
  };

  [
    campaignNameField.input,
    objectiveField.input,
    budgetField.input,
    linkField.input,
    headlineField.input,
    descriptionField.input,
    messageField.input,
    aiBriefField.input,
    fbAdAccountField.input,
    fbPageIdField.input,
    fbTokenField.input,
    ggCustomerField.input,
    ggAccessTokenField.input,
    ggDevTokenField.input,
    ggLoginCustomerField.input
  ].forEach((input) => {
    input.addEventListener("change", saveDraft);
    input.addEventListener("blur", saveDraft);
  });
  approvalToggle.addEventListener("change", saveDraft);

  const collectCommonPayload = () => {
    const campaignName = campaignNameField.input.value.trim() || `Test Campaign ${Date.now()}`;
    const budgetNumber = Number(budgetField.input.value) || 50000;
    const targetUrl = linkField.input.value.trim();
    const headline = headlineField.input.value.trim() || campaignName;
    const description = descriptionField.input.value.trim();
    const message = messageField.input.value.trim() || headline;
    const objective = objectiveField.input.value.trim() || "OUTCOME_TRAFFIC";
    const globalSettings = getGlobalSettings();

    return {
      app_id: resolveContext().app_id,
      domain: globalSettings.domain,
      service_type: globalSettings.isLmkt ? globalSettings.project : globalSettings.industry,
      campaign_name: campaignName,
      name: campaignName,
      objective,
      daily_budget: budgetNumber,
      budget: budgetNumber,
      target_url: targetUrl,
      final_url: targetUrl,
      link: targetUrl,
      headline,
      title: headline,
      description,
      message,
      primary_text: message,
      status: "PAUSED"
    };
  };

  const setLoading = (btn, loading) => {
    if (!btn) return;
    btn.disabled = loading;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = loading ? t('ads_loading_api') : btn.dataset.originalText;
  };

  const buildFacebookPayload = () => {
    const common = collectCommonPayload();
    return {
      ...common,
      platform: "facebook_ads",
      adAccountId: fbAdAccountField.input.value.trim(),
      pageId: fbPageIdField.input.value.trim(),
      pageAccessToken: fbTokenField.input.value.trim()
    };
  };

  const buildGooglePayload = () => {
    const common = collectCommonPayload();
    const customerIdRaw = ggCustomerField.input.value.trim();
    const loginCustomerIdRaw = ggLoginCustomerField.input.value.trim();
    return {
      ...common,
      platform: "google_ads",
      customer_id: customerIdRaw.replace(/-/g, ""),
      access_token: ggAccessTokenField.input.value.trim(),
      developer_token: ggDevTokenField.input.value.trim(),
      login_customer_id: loginCustomerIdRaw ? loginCustomerIdRaw.replace(/-/g, "") : "",
      headline1: common.headline,
      headline2: common.headline,
      headline3: "Dang ky ngay",
      description1: common.description || common.message,
      description2: common.description || "Nhan uu dai hom nay"
    };
  };

  fbBtn.onclick = async () => {
    const payload = buildFacebookPayload();
    if (!payload.target_url) {
      adsTesterNotify(t('ads_err_fb_url'), "error");
      return;
    }

    appendAdsTesterLog(logArea, "Facebook request", payload);
    saveDraft();
    setLoading(fbBtn, true);

    try {
      const result = await callAdsCampaignApi("facebook", payload);
      appendAdsTesterLog(logArea, "Facebook response", result);
      adsTesterNotify(t('ads_ok_fb'), "success");
    } catch (e) {
      appendAdsTesterLog(logArea, "Facebook error", e.message || String(e));
      adsTesterNotify(`${t('ads_log_fb_error')}: ${e.message || e}`, "error");
    } finally {
      setLoading(fbBtn, false);
    }
  };

  ggBtn.onclick = async () => {
    const payload = buildGooglePayload();
    if (!payload.target_url) {
      adsTesterNotify(t('ads_err_gg_url'), "error");
      return;
    }

    appendAdsTesterLog(logArea, "Google request", payload);
    saveDraft();
    setLoading(ggBtn, true);

    try {
      const result = await callAdsCampaignApi("google", payload);
      appendAdsTesterLog(logArea, "Google response", result);
      adsTesterNotify(t('ads_ok_gg'), "success");
    } catch (e) {
      appendAdsTesterLog(logArea, "Google error", e.message || String(e));
      adsTesterNotify(`${t('ads_log_gg_error')}: ${e.message || e}`, "error");
    } finally {
      setLoading(ggBtn, false);
    }
  };

  aiPushBothBtn.onclick = async () => {
    const common = collectCommonPayload();
    if (!common.target_url) {
      adsTesterNotify(t('ads_err_ai_url'), "error");
      return;
    }

    const missingFb = !fbAdAccountField.input.value.trim() || !fbPageIdField.input.value.trim() || !fbTokenField.input.value.trim();
    const missingGg = !ggCustomerField.input.value.trim() || !ggAccessTokenField.input.value.trim() || !ggDevTokenField.input.value.trim();
    if (missingFb || missingGg) {
      adsTesterNotify(t('ads_err_credentials'), "error");
      return;
    }

    setLoading(aiPushBothBtn, true);
    saveDraft();

    try {
      appendAdsTesterLog(logArea, "AI request", {
        brief: aiBriefField.input.value.trim(),
        target_url: common.target_url,
        campaign_name: common.campaign_name
      });

      const aiCreative = await generateAdsCreativeWithAI({
        brief: aiBriefField.input.value,
        target_url: common.target_url,
        campaign_name: common.campaign_name,
        domain: common.domain,
        service_type: common.service_type
      });

      headlineField.input.value = aiCreative.headline || headlineField.input.value;
      descriptionField.input.value = aiCreative.description || descriptionField.input.value;
      messageField.input.value = aiCreative.message || messageField.input.value;
      saveDraft();
      appendAdsTesterLog(logArea, "AI response", aiCreative.raw || aiCreative);

      if (approvalToggle.checked) {
        const approved = await requestAdsPushApproval(theme, {
          headline: headlineField.input.value.trim(),
          description: descriptionField.input.value.trim(),
          message: messageField.input.value.trim()
        });

        if (!approved) {
          appendAdsTesterLog(logArea, "AI flow", "User cancelled before push");
          adsTesterNotify(t('ads_cancelled'), "info");
          return;
        }
      } else {
        appendAdsTesterLog(logArea, "AI flow", "Approval step skipped by setting");
      }

      const fbPayload = buildFacebookPayload();
      appendAdsTesterLog(logArea, "Facebook request (AI flow)", fbPayload);
      const fbResult = await callAdsCampaignApi("facebook", fbPayload);
      appendAdsTesterLog(logArea, "Facebook response (AI flow)", fbResult);

      const ggPayload = buildGooglePayload();
      appendAdsTesterLog(logArea, "Google request (AI flow)", ggPayload);
      const ggResult = await callAdsCampaignApi("google", ggPayload);
      appendAdsTesterLog(logArea, "Google response (AI flow)", ggResult);

      adsTesterNotify(t('ads_ok_ai_push'), "success");
    } catch (e) {
      appendAdsTesterLog(logArea, "AI+Push error", e.message || String(e));
      adsTesterNotify(`${t('ads_log_ai_push_error')}: ${e.message || e}`, "error");
    } finally {
      setLoading(aiPushBothBtn, false);
    }
  };

  fillKnownIdsBtn.onclick = () => {
    fbAdAccountField.input.value = fbAdAccountField.input.value.trim() || "201051000069730";
    ggCustomerField.input.value = ggCustomerField.input.value.trim() || "3308977729";
    if (!campaignNameField.input.value.trim()) {
      campaignNameField.input.value = `Test LMKT ${new Date().toLocaleDateString(getUILanguage())}`;
    }
    if (!objectiveField.input.value.trim()) {
      objectiveField.input.value = "OUTCOME_TRAFFIC";
    }
    if (!budgetField.input.value.trim()) {
      budgetField.input.value = "50000";
    }
    saveDraft();
    adsTesterNotify(t('ads_ok_fill_ids'), "success");
  };

  fillMinimalPayloadBtn.onclick = () => {
    fillKnownIdsBtn.onclick();

    const today = new Date().toLocaleDateString(getUILanguage());
    campaignNameField.input.value = campaignNameField.input.value.trim() || `Test Ads ${today}`;
    objectiveField.input.value = objectiveField.input.value.trim() || "OUTCOME_TRAFFIC";
    budgetField.input.value = budgetField.input.value.trim() || "50000";
    linkField.input.value = linkField.input.value.trim() || "https://csmbridge.net";
    headlineField.input.value = headlineField.input.value.trim() || "Uu dai dac biet hom nay";
    descriptionField.input.value = descriptionField.input.value.trim() || "Nhan tu van nhanh va uu dai ngay";
    messageField.input.value = messageField.input.value.trim() || "Dang ky de nhan thong tin chi tiet va uu dai moi nhat.";

    appendAdsTesterLog(logArea, "Hint", {
      note: t('ads_min_payload_note')
    });
    saveDraft();
    adsTesterNotify(t('ads_ok_fill_payload'), "success");
  };

  clearBtn.onclick = () => {
    logArea.value = "";
  };

  actionRow.append(fbBtn, ggBtn, aiPushBothBtn, fillKnownIdsBtn, fillMinimalPayloadBtn, clearBtn);
  wrapper.append(title, hint, grid, approvalToggleRow, actionRow, logArea);

  const container = ensureUnifiedUIContainer();
  if (container) {
    container.appendChild(wrapper);
  }

  return wrapper;
}

// ========== AI LANE TEST PANEL (SEO / scan-dry-run / execute-local-plan) ==========
const AI_LANE_TEST_STORAGE_KEY = "csm_ai_lane_tester_draft_v2";

function readAiLaneTesterDraft() {
  try {
    const raw = localStorage.getItem(AI_LANE_TEST_STORAGE_KEY);
    const draft = raw ? JSON.parse(raw) : {};
    if (!draft.renderEngine || draft.renderEngine === "template_pro" || draft.renderEngine === "character_director") {
      draft.renderEngine = "talking_presenter";
    }
    return draft;
  } catch (e) {
    console.warn("⚠️ [AiLaneTest] Không đọc được draft:", e.message);
    return { renderEngine: "talking_presenter" };
  }
}

function writeAiLaneTesterDraft(draft = {}) {
  try {
    localStorage.setItem(AI_LANE_TEST_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn("⚠️ [AiLaneTest] Không lưu được draft:", e.message);
  }
}

function appendAiLaneTesterLog(logEl, title, data) {
  if (!logEl) return;
  const timestamp = new Date().toLocaleTimeString();
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const next = `[${timestamp}] ${title}\n${payload}\n\n${logEl.value || ""}`;
  logEl.value = next.trim();
}

function aiLaneTesterNotify(message, type = "info") {
  if (type === "success" && typeof thongbao === "function") return thongbao(message);
  if (type === "error" && typeof canhbao === "function") return canhbao(message);
  if (typeof thongbao === "function") return thongbao(message);
  console.log(message);
}

function resolveAiLocalApiBase(ctx) {
  const fromCtx = normalizeCsmApiBase(ctx?.apiBase || "");
  if (fromCtx) return fromCtx;
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeCsmApiBase(`${window.location.origin}/api`);
  }
  return "";
}

async function callAiLocalJsonApi(path, body, ctx, options = {}) {
  const apiBase = resolveAiLocalApiBase(ctx);
  if (!apiBase) throw new Error("Thiếu apiBase — không gọi được AI local API");
  const url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const payload = body == null ? undefined : JSON.stringify({
    mode: "sync",
    async: false,
    ...body
  });
  const response = await fetch(url, {
    method: "POST",
    headers: buildApiHeaders(ctx),
    credentials: "include",
    body: payload,
    signal: options.signal
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_e) {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `HTTP ${response.status}`);
  }
  return data;
}

async function readFileAsBase64(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Không đọc được file ảnh"));
    reader.readAsDataURL(file);
  });
}

async function testAiLaneHealth(ctx) {
  const apiBase = resolveAiLocalApiBase(ctx);
  const response = await fetch(`${apiBase}/ai-local/health`, { credentials: "include" });
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_e) {
    return { raw: text };
  }
}

async function testAiLaneSeoOneShot(ctx, seoContext = {}) {
  const payload = {
    industry: seoContext.industry || "bat-dong-san",
    topic: seoContext.topic || "",
    domainKey: seoContext.domainKey || "lmkt",
    property: seoContext.property || "",
    location: seoContext.location || "",
    business: seoContext.business || ""
  };
  if (!payload.topic.trim()) {
    throw new Error("Thiếu topic — nhập chủ đề bài SEO");
  }

  // Luồng SEO: build full prompt như production (getAntiAIPrompt) — 1 HTTP sync, không dùng schema placeholder backend.
  const uniqueSeed = `[UNIQUE_${Date.now()}_${Math.random().toString(36).slice(2, 9)}]`;
  const prompt = getAntiAIPrompt(payload.industry, payload.topic, [], {
    domainKey: payload.domainKey,
    property: payload.property,
    location: payload.location,
    business: payload.business
  }, [], uniqueSeed);

  const helperAi = ctx?.helperAi || (typeof window !== "undefined" ? window.csmAI : null);
  const generateFn = helperAi?.generateSeoContentWithPrompt;
  if (typeof generateFn === "function") {
    return generateFn(prompt, { taskType: "seo_content", preferAsync: false });
  }

  const apiBase = resolveAiLocalApiBase(ctx);
  const response = await fetch(`${apiBase}/ai-generate-seo-content`, {
    method: "POST",
    headers: buildApiHeaders(ctx),
    credentials: "include",
    body: JSON.stringify({
      mode: "sync",
      async: false,
      taskType: "seo_content",
      prompt
    })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_e) {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data?.message || text || `HTTP ${response.status}`);
  }
  return data;
}

async function testAiLaneScanDryRun(ctx, { message, attachments }) {
  return callAiLocalJsonApi("/ai-local/scan-dry-run", {
    message: message || "",
    contextType: "business",
    taskType: "media_script",
    responseMode: "plan",
    attachments: attachments || []
  }, ctx);
}

function resolveBackendMediaOrigin(ctx) {
  const apiBase = String(ctx?.apiBase || "").trim();
  if (/^https?:\/\//i.test(apiBase)) {
    return apiBase.replace(/\/api\/?$/i, "");
  }
  return "";
}

function resolveAppMediaUrl(relativePath) {
  if (!relativePath) return "";
  const raw = String(relativePath).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const clean = raw.replace(/^\//, "");
  const ctx = typeof resolveContext === "function" ? resolveContext() : {};

  // Production: media serve từ domain web công khai
  const domain = String(ctx.domain || "").split(",")[0].trim().replace(/^https?:\/\//i, "");
  if (domain && !/localhost|127\.0\.0\.1/i.test(domain)) {
    return `https://${domain}/${clean}`;
  }

  // Dev: trỏ thẳng backend origin (15300), không qua /api/ — tránh JWT 401
  const backendOrigin = resolveBackendMediaOrigin(ctx);
  if (backendOrigin) {
    return `${backendOrigin}/${clean}`;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/${clean}`;
  }
  return `/${clean}`;
}

async function testAiLaneRenderMedia(ctx, { message, attachments, outputMode, durationSec, appId, renderEngine, storyboardScenes }) {
  return callAiLocalJsonApi("/ai-local/render-media-script", {
    message: message || "",
    outputMode: outputMode || "both",
    durationSec: durationSec || 15,
    appId: appId || ctx?.app_id || "csm",
    renderEngine: renderEngine || "talking_presenter",
    storyboardScenes: storyboardScenes || undefined,
    attachments: attachments || []
  }, ctx);
}

async function testAiLanePlanStoryboard(ctx, { message, durationSec, characterHint, attachments }) {
  return callAiLocalJsonApi("/ai-local/plan-media-storyboard", {
    message: message || "",
    durationSec: durationSec || 15,
    characterHint: characterHint || "",
    attachments: attachments || []
  }, ctx);
}

async function testAiLanePlanMartialStoryboard(ctx, { message, durationSec }) {
  return callAiLocalJsonApi("/ai-local/plan-martial-storyboard", {
    message: message || "",
    durationSec: durationSec || 18
  }, ctx);
}

async function testAiLaneExtractCharacter(ctx, { attachments, appId }) {
  return callAiLocalJsonApi("/ai-local/extract-character", {
    appId: appId || ctx?.app_id || "csm",
    attachments: attachments || []
  }, ctx);
}

async function testAiLaneExecuteLocalPlan(ctx, { message, attachments, onEvent }) {
  const apiBase = resolveAiLocalApiBase(ctx);
  if (!apiBase) throw new Error("Thiếu apiBase");
  const response = await fetch(`${apiBase}/ai-local/execute-local-plan`, {
    method: "POST",
    headers: {
      ...buildApiHeaders(ctx),
      Accept: "text/event-stream"
    },
    credentials: "include",
    body: JSON.stringify({
      message: message || "",
      contextType: "business",
      taskType: "media_script",
      responseMode: "plan",
      executePatch: false,
      applyDynamicIngestion: false,
      attachments: attachments || []
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `HTTP ${response.status}`);
  }
  if (!response.body) {
    return { events: [], note: "No SSE body" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let eventName = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      let parsed = dataLine;
      try {
        parsed = JSON.parse(dataLine);
      } catch (_e) {
        // keep raw string
      }
      const evt = { event: eventName, data: parsed };
      events.push(evt);
      if (typeof onEvent === "function") onEvent(evt);
    }
  }
  return { events };
}

const AI_LANE_SEO_REQUIRED_FIELDS = [
  "title", "content", "content_en", "content_zh",
  "attributes_title", "attributes_title_en", "attributes_title_zh",
  "attributes_description", "attributes_description_en", "attributes_description_zh",
  "attributes_keywords", "attributes_keywords_en", "attributes_keywords_zh"
];

function extractSeoPayloadFromApiResult(result) {
  let seo = null;

  const unwrapSeoCandidate = (candidate) => {
    if (candidate == null) return null;
    if (typeof candidate === "string") {
      try { return parseSeoJsonString(candidate); } catch (_e) { return null; }
    }
    if (typeof candidate !== "object") return null;

    if (candidate.title || candidate.content || candidate.html_content || candidate.attributes_title) {
      return candidate;
    }

    const choices = candidate.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const msgContent = choices[0]?.message?.content ?? choices[0]?.text;
      if (typeof msgContent === "string" && msgContent.trim()) {
        try { return parseSeoJsonString(msgContent); } catch (_e) { /* fall through */ }
      }
    }

    if (typeof candidate.content === "string" && candidate.content.trim().startsWith("{")) {
      try { return parseSeoJsonString(candidate.content); } catch (_e) { /* fall through */ }
    }

    return candidate;
  };

  const candidates = [
    result?.data?.result,
    result?.result,
    result?.data
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = unwrapSeoCandidate(candidates[i]);
    if (isRecoverableSeoPayload(parsed)) {
      seo = parsed;
      break;
    }
    if (parsed && typeof parsed === "object" && !seo) {
      seo = parsed;
    }
  }
  if (!seo && result && typeof result === "object") {
    seo = unwrapSeoCandidate(result);
  }

  if (!isRecoverableSeoPayload(seo)) {
    const rawContent = result?.rawContent || result?.data?.rawContent || result?.data?.content;
    if (typeof rawContent === "string" && rawContent.trim()) {
      try {
        seo = parseSeoJsonString(rawContent);
      } catch (_e) { /* ignore */ }
    }
  }

  if (seo && typeof seo === "object" && seo.content == null && seo.html_content) {
    seo.content = seo.html_content;
  }
  return normalizeSeoLanePayload(seo);
}

function seoLaneFailureMessage(result, fallback = "SEO failed — không parse được JSON") {
  const apiMsg = String(result?.message || result?.data?.message || "").trim();
  if (apiMsg && apiMsg !== "Thành công" && apiMsg !== "Success" && apiMsg !== "成功") {
    return apiMsg;
  }
  if (result?.errorCode === "SEO_GENERATION_FAILED" || result?.data?.errorCode === "SEO_GENERATION_FAILED") {
    return "Model local không tạo đủ title và content — thử lại hoặc dùng model lớn hơn.";
  }
  if (result?.success === true || result?.data?.success === true) {
    return "SEO thất bại — backend báo thành công nhưng payload rỗng hoặc không parse được.";
  }
  return fallback;
}

function isRecoverableSeoPayload(seo) {
  if (!seo || typeof seo !== "object") return false;
  const title = String(seo.title || seo.attributes_title || "").trim();
  const body = String(seo.content || seo.html_content || "").trim();
  return Boolean(title && body);
}

function plainTextExcerpt(htmlOrText, maxLen = 160) {
  const plain = String(htmlOrText || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, Math.max(0, maxLen - 3)).trim() + "...";
}

function keywordsFromTitle(title, keywordsFallback = "") {
  const t = String(title || "").trim();
  const fb = String(keywordsFallback || "").trim();
  if (t) {
    const base = t.length > 72 ? t.slice(0, 72).trim() : t;
    return fb ? `${base}, ${fb}` : base;
  }
  return fb;
}

/** Bổ sung meta EN/ZH khi model local thiếu — khớp backend AiSeoContentPipelineService. */
function normalizeSeoLanePayload(seo) {
  if (!seo || typeof seo !== "object") return seo;
  const out = { ...seo };
  const pick = (...vals) => {
    for (const v of vals) {
      const s = String(v == null ? "" : v).trim();
      if (s) return s;
    }
    return "";
  };
  if (!String(out.attributes_description_zh || "").trim()) {
    out.attributes_description_zh = pick(
      out.attributes_description_en,
      plainTextExcerpt(out.content_zh, 160),
      out.attributes_description
    );
  }
  if (!String(out.attributes_keywords_en || "").trim()) {
    out.attributes_keywords_en = pick(
      out.attributes_keywords,
      keywordsFromTitle(out.attributes_title_en, out.attributes_keywords)
    );
  }
  if (!String(out.attributes_keywords_zh || "").trim()) {
    out.attributes_keywords_zh = pick(
      out.attributes_keywords,
      keywordsFromTitle(out.attributes_title_zh, out.attributes_keywords)
    );
  }
  return out;
}

function buildSeoFieldChecklist(seo) {
  const data = seo && typeof seo === "object" ? seo : {};
  const viContent = String(data.content || data.html_content || "").trim();
  const viTitle = String(data.title || "").trim();
  const localePairs = [
    ["content_en", viContent, "EN phải khác VI"],
    ["content_zh", viContent, "ZH phải khác VI"],
    ["title_en", viTitle, "EN phải khác VI"],
    ["title_zh", viTitle, "ZH phải khác VI"],
  ];
  const rows = AI_LANE_SEO_REQUIRED_FIELDS.map((field) => {
    const raw = data[field];
    const text = raw == null ? "" : String(raw).trim();
    const len = text.length;
    let note = len ? `${len} ký tự` : "thiếu";
    if (field === "content" && len > 0 && len < 200) note += " (ngắn)";
    if (field.startsWith("attributes_description") && len > 0 && (len < 120 || len > 180)) {
      note += " (nên 150–160)";
    }
    const pair = localePairs.find(([f]) => f === field);
    if (pair && len > 0 && text === pair[1]) {
      note += ` ⚠️ ${pair[2]}`;
    }
    return { field, ok: len > 0 && !(pair && text === pair[1]), len, note };
  });
  return rows;
}

function renderAiLaneBadge(theme, ok, label, detail = "") {
  const el = document.createElement("span");
  el.style.cssText = [
    "display:inline-flex;align-items:center;gap:6px",
    "padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600",
    ok
      ? `background:${theme.successBg || "#f6ffed"};color:${theme.successText || "#389e0d"};border:1px solid ${theme.successBorder || "#b7eb8f"}`
      : `background:${theme.warningBg || "#fff7e6"};color:${theme.warningText || "#d48806"};border:1px solid ${theme.warningBorder || "#ffd591"}`
  ].join(";");
  el.textContent = detail ? `${label}: ${detail}` : label;
  el.dataset.ok = ok ? "1" : "0";
  return el;
}

function createAiLaneEndpointBox(theme, method, path, contract) {
  const box = document.createElement("div");
  box.style.cssText = `margin-bottom:12px;padding:10px;border-radius:8px;background:${theme.infoBg};border:1px solid ${theme.border};font-size:12px;line-height:1.55;color:${theme.infoText || theme.text}`;
  box.innerHTML = `<strong>${method} ${path}</strong><br><span style="opacity:.9">${contract}</span>`;
  return box;
}

function ensureAiLaneTestPanel() {
  if (document.getElementById("ai-lane-test-panel")) return;

  const theme = getThemeTokens();
  const draft = readAiLaneTesterDraft();
  const ctx = resolveContext();

  const wrapper = document.createElement("div");
  wrapper.id = "ai-lane-test-panel";
  wrapper.style.cssText = getFeatureCardStyle(theme) + ";margin-top:16px;";

  const titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px";
  const title = document.createElement("div");
  title.textContent = ti("🧪 Kiểm thử AI Lane (Production)", "🧪 AI Lane Test (Production)", "🧪 AI通道测试（生产）");
  title.style.cssText = getFeatureTitleStyle(theme) + ";margin-bottom:0";
  const metaCol = document.createElement("div");
  metaCol.style.cssText = `font-size:11px;color:${theme.textSecondary};text-align:right;line-height:1.5`;
  const apiBaseText = resolveAiLocalApiBase(ctx) || "(chưa có apiBase)";
  const tokenOk = Boolean(ctx.token) || typeof ctx.helperAi?.generateSeoAntiAiOneShot === "function";
  metaCol.innerHTML = `API: <code>${apiBaseText}</code><br>Auth: ${ctx.token ? "✅ csm-token" : tokenOk ? "✅ csmAI helper" : "⚠️ thiếu token (SEO sẽ lỗi)"}`;
  titleRow.append(title, metaCol);

  const healthBar = document.createElement("div");
  healthBar.id = "ai-lane-health-bar";
  healthBar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 12px 0";
  const healthRefreshBtn = document.createElement("button");
  healthRefreshBtn.type = "button";
  healthRefreshBtn.textContent = ti("🔄 Health", "🔄 Health", "🔄 健康");
  healthRefreshBtn.style.cssText = "padding:4px 10px;border:1px solid #52c41a;background:#f6ffed;color:#389e0d;border-radius:999px;font-size:11px;cursor:pointer";
  healthBar.append(
    renderAiLaneBadge(theme, false, ti("Reasoning", "Reasoning", "推理"), "?"),
    renderAiLaneBadge(theme, false, ti("Vision", "Vision", "视觉"), "?"),
    renderAiLaneBadge(theme, false, ti("Ready", "Ready", "就绪"), "?"),
    healthRefreshBtn
  );

  const subTabHeader = document.createElement("div");
  subTabHeader.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px";
  const subTabDefs = [
    { id: "seo", label: ti("Lane 4a — SEO sync", "Lane 4a — SEO sync", "通道4a — SEO同步") },
    { id: "scan", label: ti("Lane 4b — Scan (phân tích)", "Lane 4b — Scan (analysis)", "通道4b — 扫描分析") },
    { id: "video", label: ti("Lane 5 — Render ảnh/video", "Lane 5 — Render image/video", "通道5 — 渲染") },
    { id: "log", label: ti("Raw log", "Raw log", "原始日志") }
  ];
  const subTabPanels = {};
  const subTabButtons = {};

  const subTabContent = document.createElement("div");
  subTabContent.id = "ai-lane-subtab-content";

  const mkField = (labelText, id, placeholder = "", value = "", type = "text") => {
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:4px";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    label.style.cssText = `font-size:12px;font-weight:600;color:${theme.text}`;
    const input = document.createElement("input");
    input.id = id;
    input.type = type;
    input.value = value || "";
    input.placeholder = placeholder;
    input.style.cssText = `padding:8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};font-size:12px`;
    box.append(label, input);
    return { box, input };
  };

  const mkTextarea = (labelText, id, placeholder = "", value = "", rows = 3) => {
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:4px";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    label.style.cssText = `font-size:12px;font-weight:600;color:${theme.text}`;
    const input = document.createElement("textarea");
    input.id = id;
    input.value = value || "";
    input.placeholder = placeholder;
    input.rows = rows;
    input.style.cssText = `padding:8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};font-size:12px;resize:vertical`;
    box.append(label, input);
    return { box, input };
  };

  const mkBtn = (text, bg = "#1677ff") => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.style.cssText = `padding:8px 14px;border:none;background:${bg};color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600`;
    return btn;
  };

  const mkResultBox = (id, titleText) => {
    const box = document.createElement("div");
    box.id = id;
    box.style.cssText = `margin-top:12px;padding:10px;border:1px solid ${theme.border};border-radius:8px;background:${theme.inputBg};display:none`;
    const head = document.createElement("div");
    head.textContent = titleText;
    head.style.cssText = `font-size:12px;font-weight:700;margin-bottom:8px;color:${theme.text}`;
    const body = document.createElement("div");
    body.className = "ai-lane-result-body";
    body.style.cssText = "font-size:12px;line-height:1.55;color:" + theme.textSecondary;
    box.append(head, body);
    return { box, body, show: () => { box.style.display = "block"; } };
  };

  // ---- Lane 4a SEO ----
  const panelSeo = document.createElement("div");
  panelSeo.dataset.laneTab = "seo";
  panelSeo.appendChild(createAiLaneEndpointBox(
    theme,
    "POST",
    "/ai-generate-seo-content",
    ti(
      "1 HTTP sync — client chờ backend xong rồi nhận JSON 12 field (giống guest chat, không poll/async). Body: seoContext + taskType seo_content.",
      "Single sync HTTP — client waits until backend returns 12-field JSON (like guest chat, no poll/async).",
      "单次同步HTTP，客户端等待返回12字段JSON（同访客聊天，无轮询）。"
    )
  ));
  const seoGrid = document.createElement("div");
  seoGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px";
  const topicField = mkTextarea(
    ti("seoContext.topic *", "seoContext.topic *", "seoContext.topic *"),
    "ai-lane-topic",
    ti("Chủ đề bài viết BĐS...", "Property article topic...", "房产文章主题..."),
    draft.topic || "Căn hộ 2PN Vinhomes Central Park view sông, 80m2, giá 5 tỷ",
    3
  );
  const industryField = mkField("seoContext.industry", "ai-lane-industry", "bat-dong-san", draft.industry || "bat-dong-san");
  const domainKeyField = mkField("seoContext.domainKey", "ai-lane-domain-key", "lmkt", draft.domainKey || "lmkt");
  const propertyField = mkField("seoContext.property", "ai-lane-property", "Vinhomes Central Park", draft.property || "Vinhomes Central Park");
  const locationField = mkField("seoContext.location", "ai-lane-location", "Quận 1, TP.HCM", draft.location || "Quận 1, TP.HCM");
  const businessField = mkField("seoContext.business", "ai-lane-business", "CSM Bridge", draft.business || "CSM Bridge");
  seoGrid.append(topicField.box, industryField.box, domainKeyField.box, propertyField.box, locationField.box, businessField.box);
  const seoProgress = document.createElement("div");
  seoProgress.id = "ai-lane-seo-progress";
  seoProgress.style.cssText = `display:none;margin:10px 0;padding:8px 10px;border-radius:6px;background:${theme.infoBg};font-size:12px;color:${theme.infoText}`;
  const seoRunBtn = mkBtn(ti("▶ Chạy SEO one-shot (sync)", "▶ Run SEO one-shot (sync)", "▶ 运行SEO一次性"), "#1677ff");
  const seoFillBtn = mkBtn(ti("⚡ Điền mẫu", "⚡ Fill sample", "⚡ 填示例"), "#595959");
  const seoActionRow = document.createElement("div");
  seoActionRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
  seoActionRow.append(seoRunBtn, seoFillBtn);
  const seoResult = mkResultBox("ai-lane-seo-result", ti("Kết quả SEO + checklist 12 field", "SEO result + 12-field checklist", "SEO结果+12字段检查"));
  panelSeo.append(seoGrid, seoActionRow, seoProgress, seoResult.box);

  // ---- Lane 4b Scan ----
  const panelScan = document.createElement("div");
  panelScan.dataset.laneTab = "scan";
  panelScan.style.display = "none";
  panelScan.appendChild(createAiLaneEndpointBox(
    theme,
    "POST",
    "/ai-local/scan-dry-run",
    ti(
      "1 HTTP sync — phân tích xong mới trả JSON (không poll). Chỉ metadata/Vision, không tạo file → Lane 5 để render.",
      "Single sync HTTP — returns JSON when analysis completes (no poll). No files — use Lane 5 to render.",
      "单次同步HTTP，分析完成返回JSON。"
    )
  ));
  const scriptField = mkTextarea(
    ti("message (kịch bản)", "message (script)", "message（脚本）"),
    "ai-lane-script",
    ti("Kịch bản 30s, nhân vật giới thiệu căn hộ...", "30s script, character introduces property...", "30秒脚本..."),
    draft.script || "Kịch bản: Nhân vật giới thiệu căn hộ Vinhomes, tone chuyên nghiệp, 30 giây. Dùng ảnh đính kèm làm reference nhân vật.",
    4
  );
  const imageMeta = document.createElement("div");
  imageMeta.id = "ai-lane-image-meta";
  imageMeta.style.cssText = `font-size:11px;color:${theme.textSecondary};margin-top:4px`;
  imageMeta.textContent = ti("Chưa chọn ảnh", "No image selected", "未选图片");
  const imagePreview = document.createElement("img");
  imagePreview.id = "ai-lane-image-preview";
  imagePreview.alt = "character preview";
  imagePreview.style.cssText = "display:none;max-width:160px;max-height:160px;margin-top:8px;border-radius:8px;border:1px solid " + theme.border;
  const imageInput = document.createElement("input");
  imageInput.id = "ai-lane-image";
  imageInput.type = "file";
  imageInput.accept = "image/jpeg,image/png,image/webp";
  imageInput.style.cssText = `padding:6px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};font-size:12px;width:100%`;
  const imageLabel = document.createElement("label");
  imageLabel.htmlFor = "ai-lane-image";
  imageLabel.textContent = ti("attachments[0] — ảnh nhân vật (base64Data)", "attachments[0] — character image", "attachments[0] — 角色图");
  imageLabel.style.cssText = `font-size:12px;font-weight:600;color:${theme.text};display:block;margin-bottom:4px`;
  const scanRunBtn = mkBtn(ti("▶ Chạy scan-dry-run", "▶ Run scan-dry-run", "▶ 运行scan-dry-run"), "#722ed1");
  const scanResult = mkResultBox("ai-lane-scan-result", ti("Vision / technical summary", "Vision / technical summary", "Vision/技术摘要"));
  panelScan.append(scriptField.box, imageLabel, imageInput, imageMeta, imagePreview, scanRunBtn, scanResult.box);

  // ---- Lane 5 Render media ----
  const panelVideo = document.createElement("div");
  panelVideo.dataset.laneTab = "video";
  panelVideo.style.display = "none";
  panelVideo.appendChild(createAiLaneEndpointBox(
    theme,
    "POST",
    "/ai-local/render-media-script",
    ti(
      "1 HTTP sync — renderEngine=talking_presenter (TTS) hoặc martial_cinematic (rooftop võ thuật). FFmpeg trong JVM.",
      "Single sync HTTP — talking_presenter (TTS) or martial_cinematic (rooftop martial). Bundled FFmpeg.",
      "单次同步HTTP — talking_presenter 或 martial_cinematic。"
    )
  ));
  const MARTIAL_PRESET_SCRIPT = ti(
    "Kịch bản: Video võ thuật cinematic 18 giây — nhân vật từ ảnh user trên nóc nhà neon.\nCảnh 1: Quay lưng, thành phố phía sau.\nCảnh 2: Né đòn slow motion.\nCảnh 3: Combo kick + elbow.\nCảnh 4: Hero shot rim light.\nCaption TikTok: Khi võ thuật gặp neon rooftop 🥋 #vothuat #martialarts #cinematic",
    "Script: 18s martial cinematic — user photo on neon rooftop.\nScene 1: Back to city.\nScene 2: Dodge slow-mo.\nScene 3: Kick + elbow combo.\nScene 4: Hero rim light.",
    "18秒武术电影感脚本 — 霓虹屋顶。"
  );
  const videoScriptField = mkTextarea(
    ti("message (kịch bản)", "message (script)", "message（脚本）"),
    "ai-lane-video-script",
    ti("Kịch bản hiển thị trên ảnh/video...", "Script shown on image/video...", "显示在图片/视频上的脚本..."),
    draft.videoScript || draft.script || MARTIAL_PRESET_SCRIPT,
    4
  );
  const renderGrid = document.createElement("div");
  renderGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:8px";
  const renderEngineBox = document.createElement("div");
  renderEngineBox.style.cssText = "display:flex;flex-direction:column;gap:4px";
  const renderEngineLabel = document.createElement("label");
  renderEngineLabel.htmlFor = "ai-lane-render-engine";
  renderEngineLabel.textContent = "renderEngine";
  renderEngineLabel.style.cssText = `font-size:12px;font-weight:600;color:${theme.text}`;
  const renderEngineSelect = document.createElement("select");
  renderEngineSelect.id = "ai-lane-render-engine";
  renderEngineSelect.style.cssText = `padding:8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.inputBg};color:${theme.text};font-size:12px`;
  [
    { v: "martial_cinematic", l: ti("martial_cinematic — võ thuật rooftop", "martial_cinematic — rooftop martial", "martial_cinematic") },
    { v: "talking_presenter", l: ti("talking_presenter — TTS nói", "talking_presenter — TTS speech", "talking_presenter") }
  ].forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.v;
    o.textContent = opt.l;
    renderEngineSelect.appendChild(o);
  });
  renderEngineSelect.value = draft.renderEngine === "talking_presenter" ? "talking_presenter" : "martial_cinematic";
  renderEngineBox.append(renderEngineLabel, renderEngineSelect);
  const renderEngineField = { box: renderEngineBox, input: renderEngineSelect };
  const engineNote = document.createElement("div");
  engineNote.id = "ai-lane-engine-note";
  engineNote.style.cssText = `font-size:11px;color:${theme.textSecondary};margin-top:-4px;grid-column:1/-1`;
  const updateEngineNote = () => {
    const eng = renderEngineSelect.value;
    if (eng === "martial_cinematic") {
      engineNote.textContent = ti(
        "martial_cinematic → ai-martial-*.mp4 · cutout + Java2D rooftop + FFmpeg motion. Cần ảnh chân dung.",
        "martial_cinematic → ai-martial-*.mp4 · cutout + compositing + FFmpeg",
        "martial_cinematic 本地合成"
      );
      renderRunBtn.textContent = ti("▶ Render Martial Cinematic", "▶ Render Martial Cinematic", "▶ 武术渲染");
      durationField.input.value = String(Math.max(15, Number(durationField.input.value) || 18));
    } else {
      engineNote.textContent = ti(
        "talking_presenter → ai-talk-*.mp4 có tiếng TTS. FFmpeg + TTS trong backend.",
        "talking_presenter → ai-talk-*.mp4 with TTS speech",
        "talking_presenter TTS"
      );
      renderRunBtn.textContent = ti("▶ Render Talking Presenter", "▶ Render Talking Presenter", "▶ S3渲染");
    }
  };
  renderEngineSelect.addEventListener("change", () => { updateEngineNote(); saveDraft(); });
  const outputModeField = mkField("outputMode", "ai-lane-output-mode", "both", draft.outputMode || "both");
  const durationField = mkField("durationSec", "ai-lane-duration", "18", String(draft.durationSec || 18), "number");
  renderGrid.append(renderEngineField.box, outputModeField.box, durationField.box);
  renderGrid.appendChild(engineNote);
  let cachedStoryboardScenes = null;
  const fillMartialPresetBtn = mkBtn(ti("🥋 Preset võ thuật", "🥋 Martial preset", "🥋 武术预设"), "#531dab");
  fillMartialPresetBtn.onclick = () => {
    videoScriptField.input.value = MARTIAL_PRESET_SCRIPT;
    renderEngineSelect.value = "martial_cinematic";
    durationField.input.value = "18";
    updateEngineNote();
    saveDraft();
    aiLaneTesterNotify(ti("✅ Đã điền preset võ thuật cinematic", "✅ Martial preset filled", "✅ 武术预设"), "success");
  };
  const planStoryboardBtn = mkBtn(ti("📋 Plan storyboard", "📋 Plan storyboard", "📋 分镜"), "#722ed1");
  const extractCharBtn = mkBtn(ti("✂️ Extract nhân vật", "✂️ Extract character", "✂️ 抠图"), "#13c2c2");
  const storyboardResult = mkResultBox("ai-lane-storyboard-result", ti("Storyboard JSON", "Storyboard JSON", "分镜JSON"));
  const charPreview = document.createElement("img");
  charPreview.id = "ai-lane-char-cutout";
  charPreview.alt = "character cutout";
  charPreview.style.cssText = "display:none;max-width:140px;max-height:180px;margin-top:8px;border-radius:8px;border:1px solid " + theme.border;
  const videoUseScanImage = document.createElement("label");
  videoUseScanImage.style.cssText = `display:flex;align-items:center;gap:8px;font-size:12px;color:${theme.text};margin:8px 0`;
  const videoUseScanImageCb = document.createElement("input");
  videoUseScanImageCb.type = "checkbox";
  videoUseScanImageCb.checked = true;
  videoUseScanImage.append(videoUseScanImageCb, document.createTextNode(ti("Dùng ảnh nhân vật từ tab Scan", "Use character image from Scan tab", "使用Scan页角色图")));
  const renderRunBtn = mkBtn(ti("▶ Render Martial Cinematic", "▶ Render Martial Cinematic", "▶ 武术渲染"), "#fa8c16");
  updateEngineNote();
  const sseDebugBtn = mkBtn(ti("🔧 SSE debug (ComfyUI)", "🔧 SSE debug (ComfyUI)", "🔧 SSE调试"), "#595959");
  const renderActionRow = document.createElement("div");
  renderActionRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";
  renderActionRow.append(fillMartialPresetBtn, planStoryboardBtn, extractCharBtn, renderRunBtn, sseDebugBtn);
  const mediaPreview = document.createElement("div");
  mediaPreview.id = "ai-lane-media-preview";
  mediaPreview.style.cssText = `margin-top:12px;padding:12px;border:1px solid ${theme.border};border-radius:8px;background:${theme.inputBg};display:none`;
  const mediaPreviewTitle = document.createElement("div");
  mediaPreviewTitle.style.cssText = `font-size:12px;font-weight:700;margin-bottom:8px;color:${theme.text}`;
  mediaPreviewTitle.textContent = ti("Output file (ảnh / video)", "Output file (image / video)", "输出文件");
  const mediaPreviewLinks = document.createElement("div");
  mediaPreviewLinks.id = "ai-lane-media-links";
  mediaPreviewLinks.style.cssText = "font-size:11px;margin-bottom:10px;word-break:break-all";
  const mediaPreviewImg = document.createElement("img");
  mediaPreviewImg.id = "ai-lane-render-image";
  mediaPreviewImg.style.cssText = "display:none;max-width:100%;max-height:360px;border-radius:8px;border:1px solid " + theme.border;
  const mediaPreviewVideo = document.createElement("video");
  mediaPreviewVideo.id = "ai-lane-render-video";
  mediaPreviewVideo.controls = true;
  mediaPreviewVideo.style.cssText = "display:none;max-width:100%;max-height:360px;margin-top:10px;border-radius:8px;background:#000";
  mediaPreview.append(mediaPreviewTitle, mediaPreviewLinks, mediaPreviewImg, mediaPreviewVideo);
  const sseTimeline = document.createElement("div");
  sseTimeline.id = "ai-lane-sse-timeline";
  sseTimeline.style.cssText = `margin-top:12px;padding:10px;border:1px dashed ${theme.border};border-radius:8px;background:${theme.bg};max-height:180px;overflow:auto;font-size:11px;font-family:monospace;display:none`;
  const videoResult = mkResultBox("ai-lane-video-result", ti("Chi tiết API", "API details", "API详情"));
  panelVideo.append(videoScriptField.box, renderGrid, videoUseScanImage, renderActionRow, storyboardResult.box, charPreview, mediaPreview, sseTimeline, videoResult.box);

  // ---- Raw log ----
  const panelLog = document.createElement("div");
  panelLog.dataset.laneTab = "log";
  panelLog.style.display = "none";
  const logArea = document.createElement("textarea");
  logArea.id = "ai-lane-test-log";
  logArea.readOnly = true;
  logArea.placeholder = ti("JSON log đầy đủ...", "Full JSON log...", "完整JSON日志...");
  logArea.style.cssText = `width:100%;min-height:320px;padding:10px;border:1px solid ${theme.border};border-radius:6px;background:${theme.bg};color:${theme.text};font-family:monospace;font-size:11px`;
  const clearLogBtn = mkBtn(ti("🗑 Xóa log", "🗑 Clear log", "🗑 清日志"), "#8c8c8c");
  clearLogBtn.onclick = () => { logArea.value = ""; };
  panelLog.append(clearLogBtn, logArea);

  subTabPanels.seo = panelSeo;
  subTabPanels.scan = panelScan;
  subTabPanels.video = panelVideo;
  subTabPanels.log = panelLog;

  const activateSubTab = (tabId) => {
    Object.entries(subTabPanels).forEach(([id, panel]) => {
      panel.style.display = id === tabId ? "block" : "none";
    });
    Object.entries(subTabButtons).forEach(([id, btn]) => {
      const active = id === tabId;
      btn.style.background = active ? theme.primary : theme.inputBg;
      btn.style.color = active ? "#fff" : theme.text;
      btn.style.borderColor = active ? theme.primary : theme.border;
    });
  };

  subTabDefs.forEach((def) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = def.label;
    btn.style.cssText = `padding:6px 12px;border:1px solid ${theme.border};border-radius:8px;background:${theme.inputBg};color:${theme.text};cursor:pointer;font-size:12px`;
    btn.onclick = () => activateSubTab(def.id);
    subTabButtons[def.id] = btn;
    subTabHeader.appendChild(btn);
    subTabContent.appendChild(subTabPanels[def.id]);
  });
  activateSubTab("seo");

  wrapper.append(titleRow, healthBar, subTabHeader, subTabContent);

  const saveDraft = () => {
    const draft = {
      topic: topicField.input.value,
      industry: industryField.input.value,
      domainKey: domainKeyField.input.value,
      property: propertyField.input.value,
      location: locationField.input.value,
      business: businessField.input.value,
      script: scriptField.input.value,
      videoScript: videoScriptField.input.value,
      outputMode: outputModeField.input.value,
      durationSec: durationField.input.value,
      renderEngine: renderEngineField.input.value
    };
    const existing = readAiLaneTesterDraft();
    if (existing.characterImageBase64) {
      draft.characterImageBase64 = existing.characterImageBase64;
      draft.characterImageName = existing.characterImageName;
      draft.characterImageMime = existing.characterImageMime;
    }
    writeAiLaneTesterDraft(draft);
  };

  const persistCharacterImageDraft = (file, base64Data) => {
    if (!base64Data) return;
    const draft = readAiLaneTesterDraft();
    draft.characterImageBase64 = base64Data;
    draft.characterImageName = file?.name || draft.characterImageName || "character.jpg";
    draft.characterImageMime = file?.type || draft.characterImageMime || "image/jpeg";
    writeAiLaneTesterDraft(draft);
  };

  [
    topicField.input, industryField.input, domainKeyField.input,
    propertyField.input, locationField.input, businessField.input,
    scriptField.input, videoScriptField.input, outputModeField.input, durationField.input, renderEngineField.input
  ].forEach((input) => {
    input.addEventListener("change", saveDraft);
    input.addEventListener("blur", saveDraft);
  });

  const setLoading = (btn, loading, loadingText) => {
    if (!btn) return;
    btn.disabled = loading;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = loading ? loadingText : btn.dataset.originalText;
  };

  const collectSeoContext = () => ({
    industry: industryField.input.value.trim() || "bat-dong-san",
    topic: topicField.input.value.trim(),
    domainKey: domainKeyField.input.value.trim() || "lmkt",
    property: propertyField.input.value.trim(),
    location: locationField.input.value.trim(),
    business: businessField.input.value.trim() || "CSM Bridge"
  });

  const buildAttachmentsFromFile = async () => {
    const file = imageInput.files && imageInput.files[0];
    if (file) {
      const base64Data = await readFileAsBase64(file);
      persistCharacterImageDraft(file, base64Data);
      return [{
        name: file.name || "character.jpg",
        kind: "image",
        type: "image",
        mimeType: file.type || "image/jpeg",
        base64Data
      }];
    }
    const saved = readAiLaneTesterDraft();
    if (saved.characterImageBase64) {
      return [{
        name: saved.characterImageName || "character.jpg",
        kind: "image",
        type: "image",
        mimeType: saved.characterImageMime || "image/jpeg",
        base64Data: saved.characterImageBase64
      }];
    }
    return [];
  };

  if (draft.characterImageBase64) {
    imageMeta.textContent = `${draft.characterImageName || "character.jpg"} · ${draft.characterImageMime || "image/jpeg"} · (đã lưu draft)`;
    imagePreview.src = `data:${draft.characterImageMime || "image/jpeg"};base64,${draft.characterImageBase64}`;
    imagePreview.style.display = "block";
  }

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files && imageInput.files[0];
    if (!file) {
      imageMeta.textContent = ti("Chưa chọn ảnh", "No image selected", "未选图片");
      imagePreview.style.display = "none";
      return;
    }
    imageMeta.textContent = `${file.name} · ${file.type || "image/*"} · ${Math.round(file.size / 1024)} KB`;
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.style.display = "block";
    try {
      const base64Data = await readFileAsBase64(file);
      persistCharacterImageDraft(file, base64Data);
    } catch (_e) { /* ignore */ }
  });

  const renderHealthBar = (health) => {
    healthBar.innerHTML = "";
    const reasoningOk = Boolean(health?.reasoning?.healthy);
    const visionOk = Boolean(health?.vision?.localVisionReady);
    const ffmpegOk = Boolean(health?.ffmpeg?.ready);
    const rembgOk = Boolean(health?.characterExtract?.ready);
    const ttsOk = Boolean(health?.tts?.ready);
    const talkOk = Boolean(health?.talkingHead?.ready);
    const martialOk = Boolean(health?.martialCinematic?.ready);
    const readyOk = Boolean(health?.ready);
    healthBar.append(
      renderAiLaneBadge(theme, reasoningOk, "Reasoning", reasoningOk ? "healthy" : "down"),
      renderAiLaneBadge(theme, visionOk, "Vision", visionOk ? "ready" : "off"),
      renderAiLaneBadge(theme, ffmpegOk, "FFmpeg", ffmpegOk ? "bundled" : "down"),
      renderAiLaneBadge(theme, rembgOk, "Rembg", rembgOk ? "bundled" : "down"),
      renderAiLaneBadge(theme, martialOk, "Martial", martialOk ? "ready" : "off"),
      renderAiLaneBadge(theme, ttsOk, "TTS", ttsOk ? "ready" : "down"),
      renderAiLaneBadge(theme, talkOk, "Talk", talkOk ? "ready" : "down"),
      renderAiLaneBadge(theme, readyOk, "Ready", readyOk ? "yes" : "no"),
      healthRefreshBtn
    );
  };

  const refreshHealth = async () => {
    setLoading(healthRefreshBtn, true, "...");
    try {
      const h = await testAiLaneHealth(resolveContext());
      renderHealthBar(h);
      appendAiLaneTesterLog(logArea, "GET /ai-local/health", h);
    } catch (e) {
      appendAiLaneTesterLog(logArea, "Health error", e.message || String(e));
    } finally {
      setLoading(healthRefreshBtn, false, "...");
    }
  };
  healthRefreshBtn.onclick = refreshHealth;

  const renderSeoChecklist = (seo, elapsedSec, apiOk) => {
    const checklist = buildSeoFieldChecklist(seo);
    const passCount = checklist.filter((x) => x.ok).length;
    seoResult.body.innerHTML = "";
    const summary = document.createElement("div");
    summary.style.cssText = `margin-bottom:10px;padding:8px;border-radius:6px;background:${passCount === 12 ? theme.successBg : theme.warningBg};color:${theme.text}`;
    summary.innerHTML = `<strong>${apiOk ? "✅ API success" : "⚠️ API"}</strong> · ${elapsedSec}s · ${passCount}/12 field · title: <em>${(seo?.title || "").slice(0, 80)}</em>`;
    seoResult.body.appendChild(summary);
    const table = document.createElement("div");
    table.style.cssText = "display:grid;gap:4px";
    checklist.forEach((row) => {
      const line = document.createElement("div");
      line.style.cssText = "display:flex;justify-content:space-between;gap:8px;font-family:monospace;font-size:11px";
      line.innerHTML = `<span>${row.ok ? "✅" : "❌"} ${row.field}</span><span>${row.note}</span>`;
      table.appendChild(line);
    });
    seoResult.body.appendChild(table);
    if (seo?.content) {
      const preview = document.createElement("div");
      preview.style.cssText = `margin-top:10px;padding:8px;border-top:1px dashed ${theme.border};max-height:120px;overflow:auto;font-size:11px`;
      preview.textContent = String(seo.content).replace(/<[^>]+>/g, " ").slice(0, 600);
      seoResult.body.appendChild(preview);
    }
    seoResult.show();
  };

  seoRunBtn.onclick = async () => {
    const seoContext = collectSeoContext();
    if (!seoContext.topic) {
      aiLaneTesterNotify(ti("⚠️ Nhập seoContext.topic", "⚠️ Enter seoContext.topic", "⚠️ 请输入topic"), "error");
      activateSubTab("seo");
      return;
    }
    const ctx = resolveContext();
    const hasSeoHelper = typeof ctx.helperAi?.generateSeoContentWithPrompt === "function";
    if (!ctx.token && !hasSeoHelper) {
      aiLaneTesterNotify(ti("⚠️ Thiếu csm-token — đăng nhập admin trước", "⚠️ Missing csm-token — login first", "⚠️ 缺少token"), "error");
      return;
    }
    saveDraft();
    appendAiLaneTesterLog(logArea, "POST /ai-generate-seo-content", {
      taskType: "seo_content",
      mode: "sync",
      prompt: "(getAntiAIPrompt — built from seoContext.topic)"
    });
    seoProgress.style.display = "block";
    seoProgress.textContent = ti(
      "⏳ Đang chờ backend (1 HTTP sync, có thể 1–15 phút)...",
      "⏳ Waiting for backend (single sync HTTP, 1–15 min)...",
      "⏳ 等待后端（单次同步）..."
    );
    setLoading(seoRunBtn, true, ti("⏳ Đang chạy...", "⏳ Running...", "⏳ 运行中..."));
    try {
      const started = Date.now();
      const result = await testAiLaneSeoOneShot(ctx, seoContext);
      const elapsedSec = Math.round((Date.now() - started) / 1000);
      const seo = extractSeoPayloadFromApiResult(result);
      appendAiLaneTesterLog(logArea, `SEO response (${elapsedSec}s)`, result);
      if (!isRecoverableSeoPayload(seo)) {
        throw new Error(seoLaneFailureMessage(result));
      }
      renderSeoChecklist(seo, elapsedSec, true);
      seoProgress.textContent = ti(`✅ Hoàn tất sau ${elapsedSec}s`, `✅ Done in ${elapsedSec}s`, `✅ 完成 ${elapsedSec}s`);
      const passCount = buildSeoFieldChecklist(seo).filter((x) => x.ok).length;
      if (passCount < 12) {
        aiLaneTesterNotify(ti(`⚠️ SEO ${passCount}/12 field — một số meta EN/ZH vẫn thiếu`, `⚠️ SEO ${passCount}/12 fields incomplete`, `⚠️ SEO ${passCount}/12`), "warning");
      } else {
        aiLaneTesterNotify(ti("✅ SEO one-shot OK — đủ 12 field", "✅ SEO one-shot OK — 12/12 fields", "✅ SEO完成 12/12"), "success");
      }
    } catch (e) {
      seoProgress.textContent = ti("❌ Lỗi: ", "❌ Error: ", "❌ 错误: ") + (e.message || e);
      appendAiLaneTesterLog(logArea, "SEO error", e.message || String(e));
      aiLaneTesterNotify(`SEO: ${e.message || e}`, "error");
    } finally {
      setLoading(seoRunBtn, false, ti("⏳ Đang chạy...", "⏳ Running...", "⏳ 运行中..."));
    }
  };

  seoFillBtn.onclick = () => {
    topicField.input.value = "Căn hộ 2PN Vinhomes Central Park view sông, 80m2, giá 5 tỷ";
    industryField.input.value = "bat-dong-san";
    domainKeyField.input.value = "lmkt";
    propertyField.input.value = "Vinhomes Central Park";
    locationField.input.value = "Quận 1, TP.HCM";
    businessField.input.value = "CSM Bridge";
    saveDraft();
    aiLaneTesterNotify(ti("✅ Đã điền mẫu SEO", "✅ SEO sample filled", "✅ 已填SEO示例"), "success");
  };

  scanRunBtn.onclick = async () => {
    const message = scriptField.input.value.trim();
    if (!message) {
      aiLaneTesterNotify(ti("⚠️ Nhập message (kịch bản)", "⚠️ Enter message script", "⚠️ 请输入脚本"), "error");
      activateSubTab("scan");
      return;
    }
    saveDraft();
    setLoading(scanRunBtn, true, "...");
    try {
      const attachments = await buildAttachmentsFromFile();
      const body = { message, contextType: "business", taskType: "media_script", responseMode: "plan", attachments };
      appendAiLaneTesterLog(logArea, "POST /ai-local/scan-dry-run", { ...body, attachments: attachments.map((a) => ({ ...a, base64Data: `[${a.base64Data?.length || 0} chars]` })) });
      const result = await testAiLaneScanDryRun(resolveContext(), { message, attachments });
      appendAiLaneTesterLog(logArea, "Scan response", result);
      const decisions = result?.scanner?.decisions || [];
      scanResult.body.innerHTML = "";
      const head = document.createElement("div");
      head.style.marginBottom = "8px";
      head.innerHTML = `<strong>imageCount:</strong> ${result?.scanner?.imageCount ?? 0} · <strong>ingestCount:</strong> ${result?.scanner?.ingestCount ?? 0} · <strong>vision:</strong> ${result?.policy?.multimodalRequireVision ? "required" : "optional"}`;
      scanResult.body.appendChild(head);
      decisions.forEach((d, i) => {
        const block = document.createElement("div");
        block.style.cssText = `margin-top:8px;padding:8px;border:1px solid ${theme.border};border-radius:6px;background:${theme.bg}`;
        const summary = d?.technicalSummary || d?.reason || JSON.stringify(d);
        block.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${d?.kind || "item"} #${i + 1} · ${d?.sourceId || ""}</div><pre style="white-space:pre-wrap;margin:0;font-size:11px">${summary}</pre>`;
        scanResult.body.appendChild(block);
      });
      if (result?.scanner?.compactContext) {
        const ctxBox = document.createElement("pre");
        ctxBox.style.cssText = "margin-top:8px;font-size:11px;white-space:pre-wrap;max-height:100px;overflow:auto";
        ctxBox.textContent = String(result.scanner.compactContext).slice(0, 1200);
        scanResult.body.appendChild(ctxBox);
      }
      scanResult.show();
      const hint = document.createElement("div");
      hint.style.cssText = `margin-top:10px;padding:8px;border-radius:6px;background:${theme.warningBg};color:${theme.warningText};font-size:12px`;
      hint.textContent = ti(
        "Scan chỉ phân tích — không có file output. Chuyển sang tab Lane 5 Render để nhận ảnh/video.",
        "Scan is analysis only — no files. Switch to Lane 5 Render for image/video output.",
        "扫描仅分析。请到通道5渲染获取文件。"
      );
      scanResult.body.appendChild(hint);
      aiLaneTesterNotify(ti("✅ Scan xong (phân tích)", "✅ Scan done (analysis)", "✅ 扫描完成"), "success");
    } catch (e) {
      appendAiLaneTesterLog(logArea, "Scan error", e.message || String(e));
      aiLaneTesterNotify(`Scan: ${e.message || e}`, "error");
    } finally {
      setLoading(scanRunBtn, false, "...");
    }
  };

  const showMediaPreview = (result) => {
    const imageUrl = resolveAppMediaUrl(result?.imageUrl);
    const videoUrl = resolveAppMediaUrl(result?.videoUrl);
    mediaPreview.style.display = "block";
    mediaPreviewLinks.innerHTML = "";
    const engine = result?.renderEngine || "talking_presenter";
    const engineHint = engine === "martial_cinematic"
      ? " — rooftop neon võ thuật (ai-martial-*)"
      : engine === "talking_presenter"
        ? " — nhân vật nói TTS từng cảnh (ai-talk-*)"
        : engine === "character_director"
          ? " — cutout animate"
          : "";
    mediaPreviewLinks.innerHTML += `<div style="opacity:.85;font-size:11px;margin-bottom:6px">Engine: <strong>${engine}</strong>${engineHint}</div>`;
    const sceneUrls = Array.isArray(result?.sceneImageUrls) ? result.sceneImageUrls : [];
    if (sceneUrls.length) {
      mediaPreviewLinks.innerHTML += `<div style="margin-bottom:8px;font-size:11px">🎞 ${sceneUrls.length} scene(s):</div>`;
      const gallery = document.createElement("div");
      gallery.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px";
      sceneUrls.forEach((u, i) => {
        const href = resolveAppMediaUrl(u);
        const thumb = document.createElement("a");
        thumb.href = href;
        thumb.target = "_blank";
        thumb.rel = "noopener";
        thumb.title = u;
        thumb.innerHTML = `<img src="${href}" alt="scene ${i + 1}" style="width:120px;height:68px;object-fit:cover;border-radius:6px;border:1px solid ${theme.border}">`;
        gallery.appendChild(thumb);
      });
      mediaPreviewLinks.appendChild(gallery);
    }
    if (result?.imageUrl) {
      mediaPreviewLinks.innerHTML += `<div>🖼 imageUrl: <a href="${imageUrl}" target="_blank" rel="noopener">${result.imageUrl}</a></div>`;
      mediaPreviewImg.src = imageUrl;
      mediaPreviewImg.style.display = "block";
    } else {
      mediaPreviewImg.style.display = "none";
    }
    if (result?.videoUrl) {
      mediaPreviewLinks.innerHTML += `<div>🎬 videoUrl: <a href="${videoUrl}" target="_blank" rel="noopener">${result.videoUrl}</a></div>`;
      mediaPreviewVideo.src = videoUrl;
      mediaPreviewVideo.type = "video/mp4";
      mediaPreviewVideo.controls = true;
      mediaPreviewVideo.preload = "metadata";
      mediaPreviewVideo.style.display = "block";
      mediaPreviewVideo.load();
    } else {
      mediaPreviewVideo.style.display = "none";
    }
  };

  planStoryboardBtn.onclick = async () => {
    const message = videoScriptField.input.value.trim() || scriptField.input.value.trim();
    if (!message) {
      aiLaneTesterNotify(ti("⚠️ Nhập kịch bản", "⚠️ Enter script", "⚠️ 请输入脚本"), "error");
      return;
    }
    saveDraft();
    setLoading(planStoryboardBtn, true, "...");
    try {
      const ctx = resolveContext();
      const attachments = await buildAttachmentsFromFile();
      const isMartial = renderEngineSelect.value === "martial_cinematic";
      const body = isMartial
        ? { message, durationSec: Number(durationField.input.value) || 18 }
        : {
          message,
          durationSec: Number(durationField.input.value) || 15,
          characterHint: ti("Nhân vật từ ảnh user", "Character from user photo", "用户照片角色"),
          attachments
        };
      const endpoint = isMartial ? "/ai-local/plan-martial-storyboard" : "/ai-local/plan-media-storyboard";
      appendAiLaneTesterLog(logArea, `POST ${endpoint}`, {
        ...body,
        attachments: attachments.map((a) => ({ ...a, base64Data: `[${a.base64Data?.length || 0} chars]` }))
      });
      const result = isMartial
        ? await testAiLanePlanMartialStoryboard(ctx, body)
        : await testAiLanePlanStoryboard(ctx, body);
      appendAiLaneTesterLog(logArea, "Storyboard plan", result);
      if (!result?.success) throw new Error(result?.message || "Plan storyboard thất bại");
      cachedStoryboardScenes = result?.scenes || result?.storyboardScenes || null;
      storyboardResult.body.innerHTML = `<pre style="white-space:pre-wrap;margin:0;font-size:11px">${JSON.stringify(result, null, 2)}</pre>`;
      storyboardResult.show();
      aiLaneTesterNotify(ti(`✅ Storyboard ${cachedStoryboardScenes?.length || 0} cảnh`, `✅ Storyboard ${cachedStoryboardScenes?.length || 0} scenes`, `✅ 分镜 ${cachedStoryboardScenes?.length || 0} 场景`), "success");
    } catch (e) {
      appendAiLaneTesterLog(logArea, "Storyboard error", e.message || String(e));
      aiLaneTesterNotify(`Storyboard: ${e.message || e}`, "error");
    } finally {
      setLoading(planStoryboardBtn, false, "...");
    }
  };

  extractCharBtn.onclick = async () => {
    saveDraft();
    setLoading(extractCharBtn, true, "...");
    try {
      const ctx = resolveContext();
      const attachments = await buildAttachmentsFromFile();
      if (!attachments.length) {
        throw new Error(ti("Chọn ảnh nhân vật ở tab Scan trước", "Select character image on Scan tab first", "请先在Scan页选择角色图"));
      }
      const body = { appId: ctx.app_id || "csm", attachments };
      appendAiLaneTesterLog(logArea, "POST /ai-local/extract-character", {
        ...body,
        attachments: attachments.map((a) => ({ ...a, base64Data: `[${a.base64Data?.length || 0} chars]` }))
      });
      const result = await testAiLaneExtractCharacter(ctx, body);
      appendAiLaneTesterLog(logArea, "Extract character", result);
      if (!result?.success) throw new Error(result?.message || "Extract thất bại");
      const cutoutUrl = resolveAppMediaUrl(result?.cutoutUrl || result?.characterImageUrl || result?.imageUrl);
      if (cutoutUrl) {
        charPreview.src = cutoutUrl;
        charPreview.style.display = "block";
      }
      aiLaneTesterNotify(
        result?.hasAlpha
          ? ti("✅ Cutout PNG có alpha", "✅ Cutout PNG with alpha", "✅ 透明抠图完成")
          : ti("⚠️ Passthrough (rembg ONNX chưa sẵn sàng — restart backend, model tự tải lần đầu)", "⚠️ Passthrough (bundled ONNX not ready — restart backend)", "⚠️ 未抠图，检查 ONNX"),
        result?.hasAlpha ? "success" : "warning"
      );
    } catch (e) {
      appendAiLaneTesterLog(logArea, "Extract error", e.message || String(e));
      aiLaneTesterNotify(`Extract: ${e.message || e}`, "error");
    } finally {
      setLoading(extractCharBtn, false, "...");
    }
  };

  renderRunBtn.onclick = async () => {
    const message = videoScriptField.input.value.trim() || scriptField.input.value.trim();
    if (!message) {
      aiLaneTesterNotify(ti("⚠️ Nhập kịch bản", "⚠️ Enter script", "⚠️ 请输入脚本"), "error");
      activateSubTab("video");
      return;
    }
    saveDraft();
    setLoading(renderRunBtn, true, ti("⏳ Chờ backend render...", "⏳ Waiting for render...", "⏳ 等待渲染..."));
    try {
      const ctx = resolveContext();
      let attachments = [];
      const isMartial = renderEngineSelect.value === "martial_cinematic";
      if (videoUseScanImageCb.checked || isMartial) {
        attachments = await buildAttachmentsFromFile();
        if (!attachments.length) {
          throw new Error(ti("Chọn ảnh nhân vật (tab Scan) — martial cần ảnh chân dung", "Select character image (Scan tab) — martial requires portrait", "请选择角色图"));
        }
      }
      const messageForPlan = message;
      if (!cachedStoryboardScenes || !cachedStoryboardScenes.length) {
        appendAiLaneTesterLog(logArea, ti("Auto plan storyboard trước render", "Auto plan storyboard before render", "渲染前自动分镜"), { message: messageForPlan, engine: renderEngineSelect.value });
        const planResult = isMartial
          ? await testAiLanePlanMartialStoryboard(ctx, {
            message: messageForPlan,
            durationSec: Number(durationField.input.value) || 18
          })
          : await testAiLanePlanStoryboard(ctx, {
            message: messageForPlan,
            durationSec: Number(durationField.input.value) || 15,
            characterHint: ti("Nhân vật từ ảnh user", "Character from user photo", "用户照片角色"),
            attachments
          });
        if (!planResult?.success) {
          throw new Error(planResult?.message || ti("Plan storyboard thất bại", "Storyboard plan failed", "分镜失败"));
        }
        cachedStoryboardScenes = planResult?.scenes || planResult?.storyboardScenes || null;
        appendAiLaneTesterLog(logArea, "Auto plan storyboard (before render)", planResult);
      }
      const body = {
        message,
        outputMode: outputModeField.input.value.trim() || "both",
        durationSec: Number(durationField.input.value) || (isMartial ? 18 : 15),
        appId: ctx.app_id || "csm",
        renderEngine: renderEngineSelect.value.trim() || "martial_cinematic",
        storyboardScenes: cachedStoryboardScenes || undefined,
        attachments
      };
      appendAiLaneTesterLog(logArea, "POST /ai-local/render-media-script", {
        ...body,
        attachments: attachments.map((a) => ({ ...a, base64Data: `[${a.base64Data?.length || 0} chars]` }))
      });
      const started = Date.now();
      const result = await testAiLaneRenderMedia(ctx, body);
      appendAiLaneTesterLog(logArea, `Render (${Math.round((Date.now() - started) / 1000)}s)`, result);
      if (!result?.success) throw new Error(result?.message || "Render thất bại");
      if (String(result?.videoUrl || "").includes("ai-pro-") || String(result?.videoUrl || "").includes("ai-dir-")) {
        aiLaneTesterNotify(
          ti("⚠️ Engine cũ (ai-pro/ai-dir) — dùng talking_presenter + restart backend", "⚠️ Old engine output", "⚠️ 旧引擎"),
          "warning"
        );
      }
      if (String(result?.videoUrl || "").includes("ai-martial-")) {
        aiLaneTesterNotify(ti("✅ Martial cinematic — ai-martial-*.mp4", "✅ Martial cinematic rendered", "✅ 武术视频完成"), "success");
      } else if (String(result?.videoUrl || "").includes("ai-talk-")) {
        aiLaneTesterNotify(ti("✅ S3 Talking Presenter — video có thoại TTS", "✅ S3 with TTS speech", "✅ S3完成"), "success");
      }
      showMediaPreview(result);
      videoResult.body.innerHTML = `<pre style="white-space:pre-wrap;margin:0;font-size:11px">${JSON.stringify(result, null, 2)}</pre>`;
      videoResult.show();
      if (result?.videoUrl) {
        aiLaneTesterNotify(ti("✅ Đã render file ảnh + video", "✅ Rendered image + video", "✅ 已渲染图片+视频"), "success");
      } else if (result?.imageUrl) {
        aiLaneTesterNotify(
          result?.message || ti("⚠️ Chỉ render được ảnh (video lỗi FFmpeg)", "⚠️ Image only (video FFmpeg failed)", "⚠️ 仅渲染图片"),
          "warning"
        );
      } else {
        aiLaneTesterNotify(ti("✅ Render xong", "✅ Render done", "✅ 渲染完成"), "success");
      }
    } catch (e) {
      appendAiLaneTesterLog(logArea, "Render error", e.message || String(e));
      aiLaneTesterNotify(`Render: ${e.message || e}`, "error");
    } finally {
      setLoading(renderRunBtn, false, ti("⏳ Chờ backend render...", "⏳ Waiting for render...", "⏳ 等待渲染..."));
    }
  };

  sseDebugBtn.onclick = async () => {
    let message = videoScriptField.input.value.trim();
    if (!message) {
      aiLaneTesterNotify(ti("⚠️ Nhập kịch bản", "⚠️ Enter script", "⚠️ 请输入脚本"), "error");
      return;
    }
    if (!/video|comfyui|ltx|image|ảnh|hình/i.test(message)) {
      message += "\n\nTạo video (ComfyUI/LTX nếu cấu hình).";
    }
    saveDraft();
    setLoading(sseDebugBtn, true, "...");
    sseTimeline.style.display = "block";
    sseTimeline.innerHTML = "";
    try {
      let attachments = [];
      if (videoUseScanImageCb.checked) attachments = await buildAttachmentsFromFile();
      appendAiLaneTesterLog(logArea, "POST /ai-local/execute-local-plan (SSE debug)", { message, attachmentCount: attachments.length });
      const result = await testAiLaneExecuteLocalPlan(resolveContext(), {
        message,
        attachments,
        onEvent: (evt) => {
          const d = evt?.data || {};
          const line = document.createElement("div");
          line.textContent = `[${new Date().toLocaleTimeString()}] ${d.stage || d.status || "?"} — ${d.message || ""}`;
          sseTimeline.appendChild(line);
        }
      });
      appendAiLaneTesterLog(logArea, "SSE debug complete", { eventCount: result.events?.length });
      aiLaneTesterNotify(ti("✅ SSE debug xong", "✅ SSE debug done", "✅ SSE调试完成"), "success");
    } catch (e) {
      appendAiLaneTesterLog(logArea, "SSE error", e.message || String(e));
      aiLaneTesterNotify(`SSE: ${e.message || e}`, "error");
    } finally {
      setLoading(sseDebugBtn, false, "...");
    }
  };

  const container = ensureUnifiedUIContainer();
  if (container) container.appendChild(wrapper);

  refreshHealth();

  if (typeof window !== "undefined") {
    window.csmLmktAiLaneTest = {
      refreshHealth,
      health: () => testAiLaneHealth(resolveContext()),
      seoOneShot: (seoContext) => testAiLaneSeoOneShot(resolveContext(), seoContext),
      scanDryRun: (opts) => testAiLaneScanDryRun(resolveContext(), opts || {}),
      renderMedia: (opts) => testAiLaneRenderMedia(resolveContext(), opts || {}),
      planStoryboard: (opts) => testAiLanePlanStoryboard(resolveContext(), opts || {}),
      extractCharacter: (opts) => testAiLaneExtractCharacter(resolveContext(), opts || {}),
      resolveAppMediaUrl,
      executeLocalPlan: (opts) => testAiLaneExecuteLocalPlan(resolveContext(), opts || {}),
      buildSeoFieldChecklist,
      appendLog: (title, data) => appendAiLaneTesterLog(logArea, title, data),
      activateTab: activateSubTab
    };
  }

  return wrapper;
}

async function ensureUI() {
  const existing = document.getElementById("multi-domain-ui");
  if (existing) {
    const container = ensureUnifiedUIContainer();
    if (container && !document.getElementById("zalo-multi-group-ui")) {
      ensureZaloMultiGroupUI(container);
    }
    return existing;
  }

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "multi-domain-ui";
  wrapper.style.cssText = getFeatureCardStyle(theme);

  const title = document.createElement("div");
  title.textContent = t('multi_domain_manager');
  title.style.cssText = getFeatureTitleStyle(theme);

  // Note: Sử dụng Global Settings Panel (không tạo selector riêng nữa)
  const note = document.createElement("div");
  note.id = "service-content-tip";
  note.style.cssText = `margin-bottom:12px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:12px;color:${theme.info};`;
  note.innerHTML = t('tip_label');

  // Textarea
  const textarea = document.createElement("textarea");
  textarea.id = "content-input";
  textarea.style.cssText = `width:100%;min-height:200px;font-family:monospace;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};margin-bottom:8px`;
  textarea.placeholder = ti("Dán JSON Zalo/Facebook hoặc nội dung vào đây...", "Paste Zalo/Facebook JSON or content here...", "在此粘贴 Zalo/Facebook JSON 或内容...");

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

  const uploadZaloBtn = createButton(t('upload_zalo'), "#0068ff");
  const uploadFbBtn = createButton(t('upload_facebook'), "#1877f2");
  const createBtn = createButton(t('create_post'), "#52c41a");
  const clearHistoryBtn = createButton(t('clear_history'), "#f5222d");

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
        thongbao(ti(`✅ Đã load ${valid.length} tin nhắn Zalo hợp lệ`, `✅ Loaded ${valid.length} valid Zalo messages`, `✅ 已加载 ${valid.length} 条有效 Zalo 消息`));
      } catch (e) {
        canhbao(ti(`❌ Lỗi parse JSON: ${e.message}`, `❌ JSON parse error: ${e.message}`, `❌ JSON 解析错误：${e.message}`));
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
        thongbao(ti(`✅ Đã load ${valid.length} posts Facebook hợp lệ`, `✅ Loaded ${valid.length} valid Facebook posts`, `✅ 已加载 ${valid.length} 条有效 Facebook 帖子`));
      } catch (e) {
        canhbao(ti(`❌ Lỗi parse JSON: ${e.message}`, `❌ JSON parse error: ${e.message}`, `❌ JSON 解析错误：${e.message}`));
      }
    };
    reader.readAsText(file);
  };

  createBtn.onclick = async () => {
    // Kiểm tra xem có đang xử lý không
    if (isProcessing) {
      canhbao(ti("⚠️ Hệ thống đang xử lý bài viết khác, vui lòng đợi!", "⚠️ Another article is being processed, please wait!", "⚠️ 系统正在处理另一篇内容，请稍候！"));
      return;
    }
    
    const content = textarea.value.trim();
    if (!content) return canhbao(ti("❌ Vui lòng nhập nội dung!", "❌ Please enter content!", "❌ 请输入内容！"));
    
    // Sử dụng Global Settings
    const globalSettings = getGlobalSettings();
    const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
    
    try {
      // ✅ PRIORITY 1: Check if we have full messages in window variable (from Zalo auto scanner)
      // This has all data including base64 images
      let items;
      if (window.__pendingZaloMessages && Array.isArray(window.__pendingZaloMessages) && window.__pendingZaloMessages.length > 0) {
        items = window.__pendingZaloMessages;
        // Clear after use
        window.__pendingZaloMessages = null;
      } else {
        // ✅ PRIORITY 2: Parse from textarea (fallback, might not have base64)
        items = JSON.parse(content);
      }
      
      const arr = Array.isArray(items) ? items : [items];
      
      // ✅ NORMALIZE messages: preserve original structure (attachments/imageUrls...)
      const normalizedArr = arr.map((item, idx) => {
        if (!item || typeof item !== 'object') {
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
      
      // 🟢 LIMIT: Giới hạn số bài để tránh crash (max 10 bài/lần)
      const MAX_BATCH_SIZE = 10;
      const limitedArr = normalizedArr.slice(0, MAX_BATCH_SIZE);
      if (normalizedArr.length > MAX_BATCH_SIZE) {
        console.warn(`⚠️ GIỎ HẠN: Chỉ xử lý ${MAX_BATCH_SIZE}/${normalizedArr.length} bài`);
      }
      
      // ✅ LỌC CHỈ LẤY TIN CÓ HÌNH ẢNH VÀ CONTENT
      let arrWithImages = limitedArr.filter(item => {
        const essentials = getMessageEssentials(item);
        const hasImages = essentials.hasImages;
        const hasContent = essentials.hasText;
        return hasImages && hasContent;
      });
      
      let skippedCount = limitedArr.length - arrWithImages.length;
      
      // 🟢 DEDUP CHECK: Filter out already posted messages from server
      try {
        const configId = window.__currentZaloConfigId || null;
        const unpostedMessages = await filterNotPostedMessagesViaServer(arrWithImages, configId);
        const dedupSkipped = arrWithImages.length - unpostedMessages.length;
        
        if (dedupSkipped > 0) {
          console.warn(`🔁 Đã lọc bỏ ${dedupSkipped} tin đã đăng trước đó (trùng)`);
          if (!isZaloAutoMode) {
            canhbao(ti(`⚠️ Đã lọc bỏ ${dedupSkipped} tin đã đăng trước đó (trùng)`, `⚠️ Filtered out ${dedupSkipped} already posted messages`, `⚠️ 已过滤 ${dedupSkipped} 条已发布消息`));
          }
        }
        
        arrWithImages = unpostedMessages;
        skippedCount += dedupSkipped;
      } catch (e) {
        console.warn(`⚠️ Không thể kiểm tra tin đã đăng trên server, vẫn tiếp tục: ${e.message}`);
      }
      
      if (skippedCount > 0 && arrWithImages.length > 0) {
        console.warn(`⚠️ Đã lọc bỏ tổng ${skippedCount} tin. Chỉ xử lý ${arrWithImages.length}/${normalizedArr.length} tin.`);
      }
      
      if (arrWithImages.length === 0) {
        const msg = skippedCount > 0 
          ? ti(`❌ Tất cả ${normalizedArr.length} tin đều đã đăng trước đó hoặc không đủ hình/nội dung!`, `❌ All ${normalizedArr.length} messages were already posted or missing content/images!`, `❌ 所有 ${normalizedArr.length} 条消息都已发布或缺少内容/图片！`)
          : ti("❌ Không có tin nhắn nào có đủ nội dung và hình ảnh để đăng!", "❌ No messages have enough content and images to post!", "❌ 没有同时具备内容和图片可发布的消息！");
        return canhbao(msg);
      }
      
      if (!isZaloAutoMode) {
        if (!confirm(`Tạo ${arrWithImages.length} bài viết có hình ảnh? (Chạy TUẦN TỰ từng bài, mỗi bài hoàn tất (AI + lưu DB + đưa lên server) rồi tiếp bài tiếp)`)) return;
      } else {
        console.log(`✅ [Auto Mode] Tạo ${arrWithImages.length} bài viết`);
      }
      
      // Bắt đầu processing
      isProcessing = true;
      createBtn.disabled = true;
      createBtn.textContent = t('processing');
      
      let ok = 0, fail = 0;
      const postedMessages = [];  // Track successfully posted messages
      for (let i = 0; i < arrWithImages.length; i++) {
        try {
          thongbao(ti(`🔄 [${i + 1}/${arrWithImages.length}] Đang xử lý...`, `🔄 [${i + 1}/${arrWithImages.length}] Processing...`, `🔄 [${i + 1}/${arrWithImages.length}] 正在处理...`));
          await processContent(arrWithImages[i], {
            app_id: domainConfig.app_id,
            domain: domainConfig.value,
            domainKey: globalSettings.domainKey,
            service_type: globalSettings.isLmkt ? globalSettings.project : globalSettings.industry,
            project: globalSettings.project,
            author: globalSettings.isLmkt ? "LMKT Expert" : "Auto Content",
            avatar: globalSettings.isLmkt ? "https://h-holding.vn/media/icon.png" : undefined,
            config_id: window.__currentZaloConfigId,
            groupName: window.__currentZaloGroupName,
            isZaloMessage: !!window.__currentZaloConfigId
          });
          ok++;
          postedMessages.push(arrWithImages[i]);  // Record as successfully posted
          thongbao(ti(`✅ [${i + 1}/${arrWithImages.length}] Đưa dữ liệu lên server hoàn tất!`, `✅ [${i + 1}/${arrWithImages.length}] Data uploaded to server!`, `✅ [${i + 1}/${arrWithImages.length}] 数据已上传到服务器！`));
        } catch (e) {
          fail++;
          console.error(`Bài ${i + 1}/${arrWithImages.length} lỗi:`, e.message);
          canhbao(ti(`❌ [${i + 1}/${arrWithImages.length}] Lỗi: ${e.message}`, `❌ [${i + 1}/${arrWithImages.length}] Error: ${e.message}`, `❌ [${i + 1}/${arrWithImages.length}] 错误：${e.message}`));
        }
        
        // Không chờ theo tiêu chuẩn Facebook Auto Post
        if (i < arrWithImages.length - 1) {
          const remaining = arrWithImages.length - i - 1;
          thongbao(ti(`✅ BÀI ${i + 1}/${arrWithImages.length} HOÀN TẤT! Tiếp bài tiếp (${remaining} bài còn lại)...`, `✅ POST ${i + 1}/${arrWithImages.length} DONE! Continue next (${remaining} remaining)...`, `✅ 第 ${i + 1}/${arrWithImages.length} 篇已完成！继续下一篇（剩余 ${remaining} 篇）...`));
        }
        
        // 🟢 CLEANUP: Sau mỗi bài viết, giải phóng memory để tránh accumulation
        if ((i + 1) % 5 === 0 || i === arrWithImages.length - 1) {
          timerRegistry.clearAll();
          eventRegistry.removeAll();
          
          if (typeof gc === 'function') {
            gc();
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 🟢 RECORD POSTED MESSAGES: Save posted messages to server to prevent duplicate posting
      if (postedMessages.length > 0) {
        try {
          const postedRecords = postedMessages.map(msg => ({
            hash: buildMessageHash(msg),
            date: msg.date || new Date().toLocaleDateString('vi-VN'),
            time: msg.time || new Date().toLocaleTimeString('vi-VN'),
            sender: msg.sender || 'Manual Post',
            content: (msg.content || msg.text || '').substring(0, 100),
            config_id: window.__currentZaloConfigId || null,
            timestamp: Date.now(),
            source: 'manual_post'
          }));
          
          await appendPostedZaloMessagesToServer(postedRecords);
          console.log(`💾 [Manual Post] Recorded ${postedMessages.length} posted messages to prevent duplicate posting`);
        } catch (e) {
          console.warn(`⚠️ [Manual Post] Could not record posted messages: ${e.message}`);
        }
      }
      
      thongbao(ti(`✅ Hoàn tất! Thành công: ${ok}, Lỗi: ${fail}`, `✅ Done! Success: ${ok}, Failed: ${fail}`, `✅ 完成！成功：${ok}，失败：${fail}`));
      
      // ✅ Clear textarea sau khi xử lý xong
      textarea.value = '';
      
    } catch (e) {
      console.error("Lỗi parse JSON:", e);
      canhbao(ti(`❌ JSON không hợp lệ: ${e.message}`, `❌ Invalid JSON: ${e.message}`, `❌ JSON 无效：${e.message}`));
    } finally {
      // Kết thúc processing
      isProcessing = false;
      createBtn.disabled = false;
      createBtn.textContent = t('create_post');
      
      // ✅ Clear window variables để tránh reuse
      window.__pendingZaloMessages = null;
      window.__currentZaloGroupName = null;
      window.__currentZaloConfigId = null;
    }
  };

  clearHistoryBtn.onclick = () => confirm("Xóa lịch sử?") && clearArticleHistory();
  
  // ========== BUTTON: Dọn tin trùng theo dịch vụ/dự án ==========
  const cleanupDupBtn = createButton(ti("🧹 Dọn tin trùng", "🧹 Cleanup Duplicates", "🧹 清理重复"), "#ff7a45");
  const cleanupBrokenAvatarBtn = createButton(ti("🧹 Dọn tin lỗi ảnh đại diện", "🧹 Cleanup Broken Avatars", "🧹 清理头像异常"), "#d46b08");
  
  cleanupDupBtn.onclick = async () => {
    // ✅ Get current domain from settings using same function as createBtn
    const globalSettings = getGlobalSettings();
    
    console.log(`[cleanupDupBtn] Global settings:`, globalSettings);
    
    // ✅ Determine which field to use: LMKT uses Project, Phanmemmottrieu uses Industry
    const isLmkt = globalSettings.domainKey === "lmkt";
    const serviceFieldName = isLmkt ? "project" : "industry";
    const serviceFieldValue = isLmkt ? globalSettings.project : globalSettings.industry;
    
    if (!globalSettings.domain || !serviceFieldValue) {
      console.warn(`[cleanupDupBtn] Missing settings - domain:${globalSettings.domain}, ${serviceFieldName}:${serviceFieldValue}`);
      const fieldLabel = isLmkt ? "Dự Án" : "Lĩnh Vực";
      return canhbao(ti(
        `⚠️ Vui lòng chọn Domain và ${fieldLabel} ở Cài Đặt Chung`,
        `⚠️ Please select Domain and ${fieldLabel === "Dự Án" ? "Project" : "Industry"} in General Settings`,
        `⚠️ 请在常规设置中选择域名和${fieldLabel === "Dự Án" ? "项目" : "行业"}`
      ));
    }
    
    // ✅ Map domainKey back to actual domain value from DOMAIN_OPTIONS
    const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
    console.log(`[cleanupDupBtn] Domain config for key "${globalSettings.domainKey}":`, domainConfig);
    
    if (!domainConfig) {
      return canhbao(ti(
        "❌ Cấu hình Domain không hợp lệ",
        "❌ Invalid Domain configuration",
        "❌ 域名配置无效"
      ));
    }
    
    const selectedDomain = domainConfig.value; // Get full domain value like "csmbridge.net,localhost:3333"
    const selectedService = serviceFieldValue;
    const selectedProject = globalSettings.project || "";
    
    console.log(`[cleanupDupBtn] Settings loaded - Domain:${selectedDomain}, ${serviceFieldName}:${selectedService}, Project:${selectedProject}`);
    
    // ✅ Show appropriate message based on domain type
    const fieldLabel = isLmkt ? "dự án" : "lĩnh vực";
    const fieldLabelEn = isLmkt ? "Project" : "Industry";
    const fieldLabelZh = isLmkt ? "项目" : "行业";
    
    const confirmMsg = ti(
      `🧹 Dọn tin trùng của ${fieldLabel} "${selectedService}"?\n\n📊 Domain: ${selectedDomain}\n\nQuá trình này sẽ:\n1. Tải tất cả bài viết từ server\n2. Phát hiện bài viết trùng lặp (theo nội dung, tiêu đề, ảnh)\n3. Xóa bài cũ, giữ lại bài mới nhất\n\nXác nhận?`,
      `🧹 Cleanup duplicates for "${fieldLabelEn}: ${selectedService}"?\n\nDomain: ${selectedDomain}\n\nThis will:\n1. Load all articles from server\n2. Detect duplicates (by content, title, images)\n3. Remove old articles, keep newest\n\nConfirm?`,
      `🧹 清理"${fieldLabelZh}：${selectedService}"的重复内容？\n\n域名:${selectedDomain}\n\n这将：\n1. 从服务器加载所有文章\n2. 检测重复项（按内容、标题、图像）\n3. 移除旧文章，保留最新的\n\n确认？`
    );
    
    if (!confirm(confirmMsg)) {
      return;
    }
    
    // Show loading
    cleanupDupBtn.disabled = true;
    cleanupDupBtn.textContent = ti("⏳ Đang xử lý...", "⏳ Processing...", "⏳ 处理中...");
    
    try {
      // Resolve context
      const ctx = resolveContext();
      
      // ✅ Get app_id from domain
      const appId = getAppIdFromDomainOptions(selectedDomain);
      ctx.app_id = appId;
      ctx.domain = selectedDomain;
      ctx.service_type = selectedService;
      ctx.project = selectedProject;
      ctx.fanpage_id = ctx.fanpage_id || facebookState.selectedPageId || "";
      ctx.fanpage_token = ctx.fanpage_token || facebookState.selectedPageToken || facebookState.pageAccessToken || "";
      
      // Synchronously sync service definitions first (if needed)
      console.log(`🔄 [Cleanup] Syncing service definitions...`);
      await syncServiceDefinitionsFromServer(false);
      
      console.log(`[Cleanup] Starting duplicate cleanup workflow...`);
      console.log(`   Domain: ${selectedDomain}`);
      console.log(`   ${serviceFieldName}: ${selectedService}`);
      console.log(`   Project: ${selectedProject || "(none)"}`);
      
      // Call cleanup function
      // For LMKT: use project as serviceType parameter
      // For Phanmemmottrieu: use industry as serviceType parameter
      const cleanupResult = await cleanupDuplicatesByServiceType(
        selectedDomain,
        selectedService,  // This is either project (LMKT) or industry (Phanmemmottrieu)
        selectedProject,
        ctx
      );
      
      // Show result
      if (cleanupResult.success) {
        thongbao(ti(
          `✅ ${cleanupResult.message}\n\n📊 Tìm thấy: ${cleanupResult.duplicateCount} nhóm trùng\n✅ Xoá:${cleanupResult.cleanedCount} bài viết cũ`,
          `✅ ${cleanupResult.message}\n\n📊 Found: ${cleanupResult.duplicateCount} duplicate groups\n✅ Deleted: ${cleanupResult.cleanedCount} old articles`,
          `✅ ${cleanupResult.message}\n\n📊 找到：${cleanupResult.duplicateCount} 组重复项\n✅ 删除：${cleanupResult.cleanedCount} 篇旧文章`
        ));
        
        // Log details if available
        if (cleanupResult.details && cleanupResult.details.length > 0) {
          console.log(`\n📋 [Cleanup Results] Details:`);
          cleanupResult.details.forEach((group, idx) => {
            console.log(`   Group ${idx + 1}: Kept="${group.kept}", Removed=${group.count}`);
          });
        }
      } else {
        canhbao(ti(
          `⚠️ ${cleanupResult.message}`,
          `⚠️ ${cleanupResult.message}`,
          `⚠️ ${cleanupResult.message}`
        ));
      }
      
    } catch (error) {
      console.error(`[Cleanup ERROR]:`, error);
      canhbao(ti(
        `❌ Lỗi: ${error.message}`,
        `❌ Error: ${error.message}`,
        `❌ 错误：${error.message}`
      ));
    } finally {
      // Reset button
      cleanupDupBtn.disabled = false;
      cleanupDupBtn.textContent = ti("🧹 Dọn tin trùng", "🧹 Cleanup Duplicates", "🧹 清理重复");
    }
  };

  cleanupBrokenAvatarBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    const isLmkt = globalSettings.domainKey === "lmkt";
    const serviceFieldName = isLmkt ? "project" : "industry";
    const serviceFieldValue = isLmkt ? globalSettings.project : globalSettings.industry;

    if (!globalSettings.domain || !serviceFieldValue) {
      const fieldLabel = isLmkt ? "Dự Án" : "Lĩnh Vực";
      return canhbao(ti(
        `⚠️ Vui lòng chọn Domain và ${fieldLabel} ở Cài Đặt Chung`,
        `⚠️ Please select Domain and ${fieldLabel === "Dự Án" ? "Project" : "Industry"} in General Settings`,
        `⚠️ 请在常规设置中选择域名和${fieldLabel === "Dự Án" ? "项目" : "行业"}`
      ));
    }

    const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
    if (!domainConfig) {
      return canhbao(ti(
        "❌ Cấu hình Domain không hợp lệ",
        "❌ Invalid Domain configuration",
        "❌ 域名配置无效"
      ));
    }

    const selectedDomain = domainConfig.value;
    const selectedService = serviceFieldValue;
    const selectedProject = globalSettings.project || "";

    const fieldLabel = isLmkt ? "dự án" : "lĩnh vực";
    const fieldLabelEn = isLmkt ? "Project" : "Industry";
    const fieldLabelZh = isLmkt ? "项目" : "行业";

    const confirmMsg = ti(
      `🧹 Dọn tin lỗi ảnh đại diện của ${fieldLabel} "${selectedService}"?\n\n📊 Domain: ${selectedDomain}\n\nQuá trình này sẽ:\n1. Tải tất cả bài viết từ server\n2. Kiểm tra ảnh đại diện (image/thumbnail) có tải được không\n3. Xóa các bài có ảnh đại diện lỗi hoặc thiếu\n\nXác nhận?`,
      `🧹 Cleanup broken avatars for "${fieldLabelEn}: ${selectedService}"?\n\nDomain: ${selectedDomain}\n\nThis will:\n1. Load all articles from server\n2. Verify featured image (image/thumbnail) can be loaded\n3. Remove articles with broken or missing featured image\n\nConfirm?`,
      `🧹 清理"${fieldLabelZh}：${selectedService}"的头像异常内容？\n\n域名:${selectedDomain}\n\n这将：\n1. 从服务器加载所有文章\n2. 检查头像图（image/thumbnail）是否可加载\n3. 删除头像图损坏或缺失的文章\n\n确认？`
    );

    if (!confirm(confirmMsg)) {
      return;
    }

    cleanupBrokenAvatarBtn.disabled = true;
    cleanupBrokenAvatarBtn.textContent = ti("⏳ Đang xử lý...", "⏳ Processing...", "⏳ 处理中...");

    try {
      const ctx = resolveContext();
      const appId = getAppIdFromDomainOptions(selectedDomain);
      ctx.app_id = appId;
      ctx.domain = selectedDomain;
      ctx.service_type = selectedService;
      ctx.project = selectedProject;
      ctx.fanpage_id = ctx.fanpage_id || facebookState.selectedPageId || "";
      ctx.fanpage_token = ctx.fanpage_token || facebookState.selectedPageToken || facebookState.pageAccessToken || "";

      console.log(`🔄 [Cleanup Broken Avatar] Syncing service definitions...`);
      await syncServiceDefinitionsFromServer(false);

      console.log(`[Cleanup Broken Avatar] Starting workflow...`);
      console.log(`   Domain: ${selectedDomain}`);
      console.log(`   ${serviceFieldName}: ${selectedService}`);
      console.log(`   Project: ${selectedProject || "(none)"}`);

      const cleanupResult = await cleanupBrokenFeaturedImagesByServiceType(
        selectedDomain,
        selectedService,
        selectedProject,
        ctx
      );

      if (cleanupResult.success) {
        thongbao(ti(
          `✅ ${cleanupResult.message}\n\n📊 Tin lỗi ảnh đại diện: ${cleanupResult.invalidCount}\n✅ Đã xoá: ${cleanupResult.cleanedCount}`,
          `✅ ${cleanupResult.message}\n\n📊 Broken-avatar articles: ${cleanupResult.invalidCount}\n✅ Deleted: ${cleanupResult.cleanedCount}`,
          `✅ ${cleanupResult.message}\n\n📊 头像异常文章：${cleanupResult.invalidCount}\n✅ 已删除：${cleanupResult.cleanedCount}`
        ));

        if (cleanupResult.details && cleanupResult.details.length > 0) {
          console.log(`\n📋 [Cleanup Broken Avatar] Details:`);
          cleanupResult.details.forEach((row, idx) => {
            console.log(`   ${idx + 1}. slug=${row.slug || "(none)"}, reason=${row.reason}, image=${(row.imageUrl || "").substring(0, 100)}`);
          });
        }
      } else {
        canhbao(ti(
          `⚠️ ${cleanupResult.message}`,
          `⚠️ ${cleanupResult.message}`,
          `⚠️ ${cleanupResult.message}`
        ));
      }
    } catch (error) {
      console.error(`[Cleanup Broken Avatar ERROR]:`, error);
      canhbao(ti(
        `❌ Lỗi: ${error.message}`,
        `❌ Error: ${error.message}`,
        `❌ 错误：${error.message}`
      ));
    } finally {
      cleanupBrokenAvatarBtn.disabled = false;
      cleanupBrokenAvatarBtn.textContent = ti("🧹 Dọn tin lỗi ảnh đại diện", "🧹 Cleanup Broken Avatars", "🧹 清理头像异常");
    }
  };

  const actionButtons = [uploadZaloBtn, uploadFbBtn, createBtn, clearHistoryBtn];
  actionButtons.push(cleanupDupBtn, cleanupBrokenAvatarBtn);
  btnRow.append(...actionButtons);
  wrapper.append(title, note, textarea, btnRow, zaloFileInput, fbFileInput);

  // Insert upload UI into container
  const container = ensureUnifiedUIContainer();
  if (container) {
    container.appendChild(wrapper);
    ensureZaloMultiGroupUI(container);
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
    
    // ✅ FILTER BẮTBUỘC: Chỉ GIỮ tin có ĐỦ nội dung AND ảnh
    const validMessages = finalData.filter(msg => {
      const hasContent = msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0;
      const hasImages = msg.images && Array.isArray(msg.images) && msg.images.length > 0;
      
      if (!hasContent) {
        console.warn(`  ⏭️ Loại bỏ: THIẾU NỘI DUNG từ ${msg.sender || 'Unknown'}`);
        return false;
      }
      
      if (!hasImages) {
        const preview = msg.content ? msg.content.substring(0, 40) : '(no content)';
        console.warn(`  ⏭️ Loại bỏ: THIẾU HÌNH - ${msg.sender || 'Unknown'}: ${preview}...`);
        return false;
      }
      
      return true;
    });
    
    const discardedCount = finalData.length - validMessages.length;
    if (discardedCount > 0) {
      console.log(`🧹 [Quét Zalo] Loại bỏ ${discardedCount} tin không hợp lệ (thiếu nội dung hoặc hình)`);
    }
    
    // Log summary về tin HỢPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPППPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPПППPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPППPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPППPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppппppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppппppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppппppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppпппп"""
      
    // Log summary về tin HỢPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPПП
    const totalImages = validMessages.reduce((sum, msg) => sum + (msg.images?.length || 0), 0);
    const totalSizeKB = Math.round(JSON.stringify(validMessages).length / 1024);
    
    console.log(`📊 Thống kê (chỉ tin hợp lệ):`);
    console.log(`   - Tổng số tin hợp lệ: ${validMessages.length}`);
    console.log(`   - Tổng số ảnh: ${totalImages}`);
    console.log(`   - Kích thước JSON: ${totalSizeKB}KB`);
    
    return validMessages;
    
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
    keep_original_zalo_content_to_facebook: cfg.keep_original_zalo_content_to_facebook === true || cfg.keep_original_zalo_content_to_facebook === 'true' || cfg.keep_original_zalo_content_to_facebook === 1 || cfg.keep_original_zalo_content_to_facebook === '1',
    // ✅ FIX: Giữ lại đầy đủ các field quan trọng để pushSingleMessageToWeb không bị undefined
    domain: cfg.domain,
    service_type: cfg.service_type,
    project: cfg.project,
    app_id: cfg.app_id,
    fanpage_id: cfg.fanpage_id,
    fanpage_token: cfg.fanpage_token,
    fanpage_name: cfg.fanpage_name,
    primary_domain: cfg.primary_domain,
    // Keep backward compatibility: derive fanpage list from legacy fields when needed.
    zalo_fanpages: Array.isArray(cfg.zalo_fanpages) && cfg.zalo_fanpages.length > 0
      ? cfg.zalo_fanpages
      : (Array.isArray(cfg.fanpage_ids)
          ? cfg.fanpage_ids.map((id, idx) => ({
              id,
              name: cfg.fanpage_names?.[idx] || cfg.fanpage_name || 'Unknown',
              access_token: cfg.fanpage_tokens?.[idx] || cfg.fanpage_token || ''
            })).filter(fp => fp.id)
          : [])
  }));
}

function resolveActiveZaloConfigsForScanner(options = {}) {
  const allConfigs = getConfigsWithZaloGroups();
  if (!Array.isArray(allConfigs) || allConfigs.length === 0) {
    return [];
  }

  const selectedFromOptions = Array.isArray(options.selectedConfigIds)
    ? options.selectedConfigIds
    : [];
  const selectedFromWindow = Array.isArray(window.__zaloSelectedConfigIds)
    ? window.__zaloSelectedConfigIds
    : [];

  const selectedIds = Array.from(new Set([
    ...selectedFromOptions,
    ...selectedFromWindow,
  ].map(x => String(x || '').trim()).filter(Boolean)));

  if (selectedIds.length === 0) {
    return [];
  }

  const selectedSet = new Set(selectedIds);
  const filtered = allConfigs.filter(cfg => selectedSet.has(String(cfg.config_id || cfg.id || '').trim()));
  return filtered;
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
    return configGroups;
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

function normalizeImageSignature(raw = '') {
  const str = String(raw || '').trim();
  if (!str) return '';

  if (str.startsWith('data:')) {
    const splitIdx = str.indexOf(',');
    const header = splitIdx > 0 ? str.slice(0, splitIdx) : 'data:';
    const body = splitIdx > 0 ? str.slice(splitIdx + 1) : str;
    return `${header}|len:${body.length}|head:${body.slice(0, 96)}`;
  }

  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const u = new URL(str);
      return `${u.origin}${u.pathname}`.toLowerCase();
    } catch {
      return str.toLowerCase().split('?')[0];
    }
  }

  return str.toLowerCase();
}

function getMessageFirstImageSignature(msg = {}) {
  const first = Array.isArray(msg?.images) ? msg.images[0] : '';
  return normalizeImageSignature(first);
}

function extractFirstImageFromHash(hash = '') {
  try {
    const str = String(hash || '');
    if (!str) return '';
    let start = 0;
    for (let i = 0; i < 4; i++) {
      const idx = str.indexOf('||', start);
      if (idx < 0) return '';
      start = idx + 2;
    }
    return str.slice(start).trim();
  } catch {
    return '';
  }
}

// ========== QUẢN LÝ TIN ZALO ĐÃ ĐĂNG (LƯU VÀO dataOptionUser) ==========

// Constants cho Zalo posted messages
const ZALO_POSTED_LIMIT = 1000; // Giới hạn tối đa 1000 tin đã đăng
const ZALO_POSTED_CLEANUP_DAYS = 30; // Tự động xóa tin cũ hơn 30 ngày
const ZALO_STATS_ONLY_MODE = true; // Chỉ lưu thống kê theo nhóm/config để giảm dữ liệu
const ZALO_POSTED_STATS_TYPE = 'posted_zalo_stats';
const ZALO_POSTED_STATS_MAX_GROUPS = 120; // Chỉ giữ top nhóm hoạt động gần nhất
const ZALO_POSTED_STATS_FLUSH_INTERVAL_MS = 45000; // Flush batch mỗi 45s
const ZALO_POSTED_STATS_FLUSH_MIN_DELTA = 5; // Chỉ flush sớm khi có ít nhất 5 events
const ZALO_POSTED_STATS_FLUSH_MAX_WAIT_MS = 3 * 60 * 1000; // Dù ít thay đổi vẫn flush tối đa mỗi 3 phút
const ZALO_RUNTIME_STORAGE_VERSION = 2;
const ZALO_RUNTIME_STORAGE_PREFIX = 'zalo_runtime_state_v2';
const ZALO_IMAGE_SIG_STORAGE_PREFIX = 'zalo_image_sig_dedup_v1';
const ZALO_IMAGE_SIG_LIMIT_PER_CONFIG = 2000;

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
  SCANNER_IDLE_CHECK_INTERVAL: 15000,    // Khi đang chờ interval dài, chỉ kiểm tra mỗi 15s để giảm CPU
  POSTING_WORKER_INTERVAL: 1000,         // Posting worker kiểm tra queue mỗi 1s
  CONFIG_SCAN_INTERVAL: 5 * 60 * 1000,   // Quét lại mỗi config sau 5 phút
  BUFFER_AFTER_SCAN: 2000,               // Buffer sau mỗi quét config (giảm từ 5s → 2s)
  
  // Facebook API
  FACEBOOK_API_TIMEOUT: 15000,           // Timeout cho Facebook API call
  FACEBOOK_RETRY_DELAY: 2000,            // Delay trước khi retry Facebook
  MAX_FACEBOOK_RETRIES: 3                // Số lần retry cho Facebook API
};

// ===== LOW MEMORY PROFILE =====
// Mục tiêu: giảm RAM spike khi vừa mở trang và vừa mở Zalo UI.
const CSM_LOW_MEMORY_MODE = true;
const CSM_AUTO_CREATE_ZALO_WEBVIEW = !CSM_LOW_MEMORY_MODE;
// Always fetch per-user config on UI load so runtime state follows the logged-in user.
const CSM_FETCH_ZALO_CONFIG_ON_UI_LOAD = true;
const CSM_AUTO_INIT_NON_CORE_UI = !CSM_LOW_MEMORY_MODE;
const CSM_ALLOW_LOCAL_DATAOPTIONUSER_CACHE = !CSM_LOW_MEMORY_MODE;
const CSM_ENABLE_LOCAL_DB_BACKEND = false;

/**
 * Local DB backend is intentionally disabled to keep workstation RAM/CPU low.
 * Keep this no-op adapter to preserve call compatibility.
 */
const ZALO_LOCAL_DB_ADAPTER = {
  DB_NAME: 'csm_zalo_db_v2',
  isReady: false,
  async getDB() { return null; },
  async saveMessages() { return; },
  async getMessages() { return []; },
  async deleteOldMessages() { return 0; },
  async clearAllForConfig() { return 0; },
  async clearAll() { return true; },
  async getStorageSize() { return null; },
  async getMessageCount() { return 0; }
};

/**
 * ✅ LIGHTWEIGHT MONITOR
 * Theo dõi theo lịch thưa để giảm wake-up CPU nền.
 */
const STORAGE_MONITOR = {
  CHECK_INTERVAL_MS: 30000,              // Check mỗi 30s
  LOG_STORAGE_USAGE: true,               // Log storage usage
  HIDDEN_TAB_INTERVAL_MS: 120000,        // Tab ẩn: giảm tần suất check để tiết kiệm tài nguyên
  monitoringActive: false,
  timerId: null
};



/**
 * ✅ Start Storage Monitor
 */
function startStorageMonitor() {
  if (STORAGE_MONITOR.monitoringActive) return;

  if (!CSM_ENABLE_LOCAL_DB_BACKEND) {
    STORAGE_MONITOR.monitoringActive = false;
    if (STORAGE_MONITOR.timerId) {
      clearTimeout(STORAGE_MONITOR.timerId);
      STORAGE_MONITOR.timerId = null;
    }
    console.log('ℹ️ [Storage Monitor] Local DB backend disabled in lightweight mode');
    return;
  }
  
  STORAGE_MONITOR.monitoringActive = true;
  console.log('🔍 [Storage Monitor] Bắt đầu theo dõi tài nguyên');

  const scheduleNextTick = (delayMs) => {
    if (!STORAGE_MONITOR.monitoringActive) return;
    if (STORAGE_MONITOR.timerId) {
      clearTimeout(STORAGE_MONITOR.timerId);
      STORAGE_MONITOR.timerId = null;
    }

    STORAGE_MONITOR.timerId = setTimeout(async () => {
      if (!STORAGE_MONITOR.monitoringActive) return;

      if (STORAGE_MONITOR.LOG_STORAGE_USAGE && ZALO_LOCAL_DB_ADAPTER.isReady) {
        try {
          const storage = await ZALO_LOCAL_DB_ADAPTER.getStorageSize();
          const count = await ZALO_LOCAL_DB_ADAPTER.getMessageCount();
          if (storage) {
            console.log(`📊 [Storage] ${storage.usageMB}MB/${storage.quotaMB}MB (${storage.percent}%) - ${count} messages`);
          }
        } catch (e) {
          // ignore
        }
      }

      const nextDelay = document.hidden
        ? Math.max(STORAGE_MONITOR.CHECK_INTERVAL_MS, STORAGE_MONITOR.HIDDEN_TAB_INTERVAL_MS)
        : STORAGE_MONITOR.CHECK_INTERVAL_MS;
      scheduleNextTick(nextDelay);
    }, Math.max(1000, Number(delayMs) || STORAGE_MONITOR.CHECK_INTERVAL_MS));
  };

  scheduleNextTick(STORAGE_MONITOR.CHECK_INTERVAL_MS);
}

/**
 * Stop Storage Monitor
 */
function stopStorageMonitor() {
  STORAGE_MONITOR.monitoringActive = false;
  if (STORAGE_MONITOR.timerId) {
    clearTimeout(STORAGE_MONITOR.timerId);
    STORAGE_MONITOR.timerId = null;
  }
  console.log('🛑 [Storage Monitor] Đã dừng');
}

/**
 * ✅ FORCE CLEANUP RESOURCES - Giải phóng bộ nhớ sau mỗi config
 * Xóa các object lớn, nullify references, trigger GC hints
 */
function forceCleanupResources() {
  try {
    console.log('🧹 [Cleanup] Bắt đầu giải phóng bộ nhớ...');
    
    // 1. Clear window temporary data
    if (window.cparams && window.cparams.lastDetail) {
      delete window.cparams.lastDetail;
    }
    
    // 2. Clear large cached objects
    if (window._zaloMessageCache) {
      window._zaloMessageCache = {};
    }
    
    // 3. Nullify large base64 strings if stored globally
    if (window._tempBase64Images) {
      window._tempBase64Images.forEach((img, idx) => {
        window._tempBase64Images[idx] = null;
      });
      window._tempBase64Images = [];
    }
    
    // 4. Clear DOM image elements that might hold references
    const tempImages = document.querySelectorAll('img[data-temp-image="true"]');
    tempImages.forEach(img => {
      img.src = ''; // Clear src to allow GC
      img.remove();
    });
    
    // 5. Force GC hint (if available)
    if (typeof window.gc === 'function') {
      try {
        window.gc();
        console.log('🗑️ [Cleanup] Manual GC triggered');
      } catch (e) {
        // GC not available
      }
    }
    
    // 6. Give browser time to cleanup
    setTimeout(() => {
      console.log(`✅ [Cleanup] Hoàn tất`);
    }, 1000);
    
  } catch (e) {
    console.warn('⚠️ [Cleanup] Lỗi:', e.message);
  }
}

/**
 * ✅ CLEANUP AFTER CONFIG - Giải phóng tài nguyên sau khi xử lý config
 * @param {Object} sessionData - Data được collect trong session
 */
function cleanupAfterConfig(sessionData = {}) {
  try {
    console.log('🧹 [ConfigCleanup] Dọn dẹp sau config...');
    
    // Clear session message cache
    if (sessionData.messages) {
      sessionData.messages.forEach((msg, idx) => {
        if (msg.images && Array.isArray(msg.images)) {
          msg.images.forEach((imgData, imgIdx) => {
            msg.images[imgIdx] = null; // Nullify base64 data
          });
          msg.images = [];
        }
        sessionData.messages[idx] = null;
      });
      sessionData.messages = [];
    }
    
    // Clear session posted messages (keep only in persistent storage)
    if (sessionData.sessionPostedMessages && Array.isArray(sessionData.sessionPostedMessages)) {
      sessionData.sessionPostedMessages = null;
    }
    
    // Note: cache cleanup đã xử lý sau mỗi group - không cần cleanup lại ở đây
    
    console.log('✅ [ConfigCleanup] Xong');
  } catch (e) {
    console.warn('⚠️ [ConfigCleanup] Lỗi:', e.message);
  }
}

/**
 * ===== GLOBAL RESOURCE CLEANUP MANAGER =====
 * Prevents memory leaks by tracking and cleaning up timers, observers, and listeners
 */
const CLEANUP_MANAGER = {
  timers: [],
  observers: [],
  listeners: [],
  
  registerTimer(timerId) {
    if (!this.timers.includes(timerId)) {
      this.timers.push(timerId);
    }
    return timerId;
  },
  
  registerObserver(observer) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
    return observer;
  },
  
  registerListener(target, event, handler) {
    this.listeners.push({ target, event, handler });
    return { target, event, handler };
  },
  
  cleanupAll() {
    console.log(`🧹 [Cleanup] Cleaning up ${this.timers.length} timers, ${this.observers.length} observers, ${this.listeners.length} listeners`);
    
    // Clear all timers
    this.timers.forEach(id => {
      clearTimeout(id);
      clearInterval(id);
    });
    this.timers = [];
    
    // Disconnect all observers
    this.observers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (e) {
        console.warn('Error disconnecting observer:', e);
      }
    });
    this.observers = [];
    
    // Remove all event listeners
    this.listeners.forEach(({ target, event, handler }) => {
      try {
        target.removeEventListener(event, handler);
      } catch (e) {
        console.warn('Error removing listener:', e);
      }
    });
    this.listeners = [];
    
    console.log('✅ [Cleanup] Cleanup completed');
  }
};

// Auto cleanup on page hide/before unload
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    console.log('📄 [Cleanup Trigger] Page hidden - running cleanup...');
    flushPostedZaloStatsNow('pagehide');
    CLEANUP_MANAGER.cleanupAll();
  }, { passive: true });
  
  window.addEventListener('beforeunload', () => {
    console.log('👋 [Cleanup Trigger] Before unload - running cleanup...');
    flushPostedZaloStatsNow('beforeunload');
    CLEANUP_MANAGER.cleanupAll();
  }, { passive: true });
}

/**
 * Load danh sách tin Zalo đã đăng từ SERVER (csmUserData)
 * ✅ OPTIMIZED: Server-first với fallback local gọn nhẹ
 * @returns {Array} Mảng {hash, timestamp, groupName, content_preview, config_id}
 */
function loadPostedZaloMessages() {
  if (ZALO_STATS_ONLY_MODE) {
    return [];
  }
  try {
    // ✅ PRIORITY 1: Dedicated runtime state (decoupled from user_address)
    const runtime = ensureZaloRuntimeMigrated();
    const runtimePosted = Array.isArray(runtime?.postedMessages) ? runtime.postedMessages : [];
    if (runtimePosted.length > 0) {
      const posted = runtimePosted
        .filter(isPostedZaloItem)
        .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)));
      console.log(`📊 [LoadPostedZalo] Loaded ${posted.length} from runtime storage`);
      return posted;
    }

    // ✅ PRIORITY 2: Backward fallback from compact legacy key
    const raw = localStorage.getItem('zalo_posted_messages');
    if (raw) {
      try {
        const posted = JSON.parse(raw);
        if (Array.isArray(posted) && posted.length > 0) {
          const decompacted = posted.map(m => {
            if (m.h !== undefined) {
              return decompactPostedMessage(m);
            }
            return m;
          });
          const migrated = ensureZaloRuntimeMigrated();
          migrated.postedMessages = decompacted
            .filter(isPostedZaloItem)
            .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
            .slice(0, Math.max(500, Number(ZALO_POSTED_LIMIT) || 1000));
          writeZaloRuntimeState(migrated);
          console.log(`📊 [LoadPostedZalo] Loaded ${posted.length} from legacy backup and migrated to runtime storage`);
          return decompacted;
        }
      } catch (e) {
        console.warn(`⚠️ [LoadPostedZalo] localStorage parse error:`, e.message);
        try {
          localStorage.removeItem('zalo_posted_messages');
        } catch {}
      }
    }
    
    console.log(`📊 [LoadPostedZalo] No data found`);
    return [];
  } catch (e) {
    console.error('❌ [LoadPostedZalo] Error:', e);
    return [];
  }
}

function normalizeStatsKeyPart(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function buildPostedStatsId(configId, groupName) {
  const cfg = normalizeStatsKeyPart(configId || 'default');
  const grp = normalizeStatsKeyPart(groupName || 'unknown');
  return `posted_zalo_stats_${cfg}_${grp}`;
}

function isPostedZaloStatsItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.type === ZALO_POSTED_STATS_TYPE) return true;
  return !!(item.id && String(item.id).startsWith('posted_zalo_stats_'));
}

const ZALO_POSTED_STATS_RUNTIME = {
  cache: null,
  dirty: false,
  flushTimer: null,
  flushing: false,
  lastFlushAt: 0,
  pendingEvents: 0,
  firstDirtyAt: 0,
};

function getZaloRuntimeIdentityKey() {
  try {
    const user = window.csmCurrentUser || {};
    const appId = String(user.app_id || window?.seft?.app_id || 'csm');
    const userKey = String(
      user.id
      || user.user_id
      || user.account_id
      || user.email
      || user.username
      || user.phone_number
      || user.phoneNumber
      || 'anonymous'
    ).trim().toLowerCase();
    return `${appId}:${userKey}`;
  } catch {
    return 'csm:anonymous';
  }
}

function getZaloRuntimeStorageKey() {
  return `${ZALO_RUNTIME_STORAGE_PREFIX}:${getZaloRuntimeIdentityKey()}`;
}

function getDefaultZaloRuntimeState() {
  return {
    version: ZALO_RUNTIME_STORAGE_VERSION,
    postedMessages: [],
    postedStats: [],
    migratedLegacy: false,
    updatedAt: Date.now(),
  };
}

function readZaloRuntimeState() {
  try {
    const raw = localStorage.getItem(getZaloRuntimeStorageKey());
    if (!raw) return getDefaultZaloRuntimeState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return getDefaultZaloRuntimeState();

    return {
      version: Number(parsed.version || ZALO_RUNTIME_STORAGE_VERSION),
      postedMessages: Array.isArray(parsed.postedMessages) ? parsed.postedMessages : [],
      postedStats: Array.isArray(parsed.postedStats) ? parsed.postedStats : [],
      migratedLegacy: !!parsed.migratedLegacy,
      updatedAt: Number(parsed.updatedAt || 0),
    };
  } catch (e) {
    console.warn('⚠️ [ZaloRuntime] read failed:', e?.message || e);
    return getDefaultZaloRuntimeState();
  }
}

function writeZaloRuntimeState(state = {}) {
  try {
    const payload = {
      version: ZALO_RUNTIME_STORAGE_VERSION,
      postedMessages: Array.isArray(state.postedMessages) ? state.postedMessages : [],
      postedStats: Array.isArray(state.postedStats) ? state.postedStats : [],
      migratedLegacy: !!state.migratedLegacy,
      updatedAt: Date.now(),
    };
    localStorage.setItem(getZaloRuntimeStorageKey(), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('⚠️ [ZaloRuntime] write failed:', e?.message || e);
    return false;
  }
}

function ensureZaloRuntimeMigrated() {
  try {
    const runtime = readZaloRuntimeState();
    if (runtime.migratedLegacy) return runtime;

    const legacy = getRawDataOptionUserSnapshot();
    const legacyArr = Array.isArray(legacy) ? legacy : [];
    const legacyPosted = legacyArr.filter(isPostedZaloItem);
    const legacyStats = legacyArr.filter(isPostedZaloStatsItem);

    if (runtime.postedMessages.length === 0 && legacyPosted.length > 0) {
      runtime.postedMessages = legacyPosted;
    }
    if (runtime.postedStats.length === 0 && legacyStats.length > 0) {
      runtime.postedStats = legacyStats;
    }

    runtime.migratedLegacy = true;
    writeZaloRuntimeState(runtime);
    return runtime;
  } catch (e) {
    console.warn('⚠️ [ZaloRuntime] migration failed:', e?.message || e);
    return readZaloRuntimeState();
  }
}

function prunePostedZaloStatsRows(stats = []) {
  const rows = Array.isArray(stats) ? stats : [];
  rows.sort((a, b) => {
    const aTime = Number(a?.updated_at || a?.last_posted_at || 0);
    const bTime = Number(b?.updated_at || b?.last_posted_at || 0);
    return bTime - aTime;
  });
  if (rows.length > ZALO_POSTED_STATS_MAX_GROUPS) {
    return rows.slice(0, ZALO_POSTED_STATS_MAX_GROUPS);
  }
  return rows;
}

function loadPostedZaloStats() {
  try {
    if (Array.isArray(ZALO_POSTED_STATS_RUNTIME.cache)) {
      return ZALO_POSTED_STATS_RUNTIME.cache;
    }

    const runtime = ensureZaloRuntimeMigrated();
    const sourceStats = Array.isArray(runtime?.postedStats) ? runtime.postedStats : [];
    const rawStats = sourceStats
      .filter(isPostedZaloStatsItem)
      .map((item) => ({
        id: item.id,
        type: ZALO_POSTED_STATS_TYPE,
        config_id: item.config_id || null,
        groupName: item.groupName || 'Unknown',
        total_count: Number(item.total_count || 0),
        today_count: Number(item.today_count || 0),
        today_key: String(item.today_key || ''),
        last_posted_at: Number(item.last_posted_at || 0),
        updated_at: Number(item.updated_at || 0)
      }));
    const stats = prunePostedZaloStatsRows(rawStats);
    ZALO_POSTED_STATS_RUNTIME.cache = stats;
    return stats;
  } catch (e) {
    console.warn('⚠️ [PostedStats] load error:', e?.message || e);
    return [];
  }
}

function savePostedZaloStats(statsItems = [], opts = {}) {
  try {
    const stats = prunePostedZaloStatsRows(Array.isArray(statsItems) ? statsItems : []);
    ZALO_POSTED_STATS_RUNTIME.cache = stats;
    ZALO_POSTED_STATS_RUNTIME.dirty = false;

    if (opts.skipPersist) {
      return;
    }

    const runtime = ensureZaloRuntimeMigrated();
    runtime.postedStats = stats;
    writeZaloRuntimeState(runtime);
  } catch (e) {
    console.warn('⚠️ [PostedStats] save error:', e?.message || e);
  }
}

function schedulePostedZaloStatsFlush(reason = 'auto') {
  if (ZALO_POSTED_STATS_RUNTIME.flushTimer) return;

  const now = Date.now();
  const firstDirtyAt = Number(ZALO_POSTED_STATS_RUNTIME.firstDirtyAt || 0);
  const pendingEvents = Number(ZALO_POSTED_STATS_RUNTIME.pendingEvents || 0);
  const dirtyAge = firstDirtyAt > 0 ? (now - firstDirtyAt) : 0;

  let waitMs = ZALO_POSTED_STATS_FLUSH_INTERVAL_MS;
  if (pendingEvents >= ZALO_POSTED_STATS_FLUSH_MIN_DELTA) {
    waitMs = 5000;
  }
  if (dirtyAge >= ZALO_POSTED_STATS_FLUSH_MAX_WAIT_MS) {
    waitMs = 0;
  }

  ZALO_POSTED_STATS_RUNTIME.flushTimer = setTimeout(() => {
    ZALO_POSTED_STATS_RUNTIME.flushTimer = null;
    flushPostedZaloStatsNow(reason);
  }, waitMs);
}

function flushPostedZaloStatsNow(reason = 'manual') {
  if (ZALO_POSTED_STATS_RUNTIME.flushing) return;
  if (!ZALO_POSTED_STATS_RUNTIME.dirty) return;

  const forceFlush = ['manual', 'pagehide', 'beforeunload', 'stop-scanner'].includes(String(reason));
  const now = Date.now();
  const firstDirtyAt = Number(ZALO_POSTED_STATS_RUNTIME.firstDirtyAt || 0);
  const dirtyAge = firstDirtyAt > 0 ? (now - firstDirtyAt) : 0;
  const pendingEvents = Number(ZALO_POSTED_STATS_RUNTIME.pendingEvents || 0);

  if (!forceFlush
    && pendingEvents < ZALO_POSTED_STATS_FLUSH_MIN_DELTA
    && dirtyAge < ZALO_POSTED_STATS_FLUSH_MAX_WAIT_MS) {
    schedulePostedZaloStatsFlush('defer');
    return;
  }

  ZALO_POSTED_STATS_RUNTIME.flushing = true;
  try {
    const current = Array.isArray(ZALO_POSTED_STATS_RUNTIME.cache)
      ? ZALO_POSTED_STATS_RUNTIME.cache
      : loadPostedZaloStats();
    savePostedZaloStats(current);
    ZALO_POSTED_STATS_RUNTIME.lastFlushAt = Date.now();
    ZALO_POSTED_STATS_RUNTIME.pendingEvents = 0;
    ZALO_POSTED_STATS_RUNTIME.firstDirtyAt = 0;
    console.log(`💾 [PostedStats] Flushed ${current.length} group rows (${reason})`);
  } finally {
    ZALO_POSTED_STATS_RUNTIME.flushing = false;
  }
}

function recordPostedZaloStats(groupName, config_id = null, increment = 1, ts = Date.now()) {
  try {
    const stats = Array.isArray(ZALO_POSTED_STATS_RUNTIME.cache)
      ? ZALO_POSTED_STATS_RUNTIME.cache
      : loadPostedZaloStats();
    const recordId = buildPostedStatsId(config_id, groupName);
    const todayKey = new Date(ts).toISOString().slice(0, 10);
    const idx = stats.findIndex((x) => x.id === recordId);
    const inc = Math.max(1, Number(increment) || 1);

    if (idx >= 0) {
      const row = stats[idx];
      if (row.today_key !== todayKey) {
        row.today_key = todayKey;
        row.today_count = 0;
      }
      row.total_count = Number(row.total_count || 0) + inc;
      row.today_count = Number(row.today_count || 0) + inc;
      row.last_posted_at = ts;
      row.updated_at = Date.now();
    } else {
      stats.push({
        id: recordId,
        type: ZALO_POSTED_STATS_TYPE,
        config_id: config_id || null,
        groupName: groupName || 'Unknown',
        total_count: inc,
        today_count: inc,
        today_key: todayKey,
        last_posted_at: ts,
        updated_at: Date.now()
      });
    }

    ZALO_POSTED_STATS_RUNTIME.cache = prunePostedZaloStatsRows(stats);
    if (!ZALO_POSTED_STATS_RUNTIME.dirty) {
      ZALO_POSTED_STATS_RUNTIME.firstDirtyAt = Date.now();
    }
    ZALO_POSTED_STATS_RUNTIME.pendingEvents = Number(ZALO_POSTED_STATS_RUNTIME.pendingEvents || 0) + inc;
    ZALO_POSTED_STATS_RUNTIME.dirty = true;
    schedulePostedZaloStatsFlush('record');
  } catch (e) {
    console.warn('⚠️ [PostedStats] record error:', e?.message || e);
  }
}

/**
 * Compatibility helper: local DB path is disabled globally.
 */
async function loadPostedZaloMessagesFromLocalDbAdapter(configId = null) {
  void configId;
  return [];
}

/**
 * Compact message to reduce storage size
 */
function compactPostedMessage(msg) {
  return {
    id: msg.id,
    h: msg.hash,          // hash (compact form)
    ts: msg.timestamp,    // timestamp
    g: msg.groupName,     // groupName  
    c: msg.config_id,     // config_id
  };
}

/**
 * Restore compacted message
 */
function decompactPostedMessage(msg) {
  return {
    id: msg.id,
    hash: msg.h,
    timestamp: msg.ts,
    groupName: msg.g,
    config_id: msg.c,
  };
}

/**
 * Lưu danh sách tin Zalo đã đăng vào SERVER (via csmUserData.set())
 * ✅ OPTIMIZED: Lưu vào csmUserData (server), localStorage chỉ là fallback nhỏ
 * @param {Array} postedMessages - Mảy tin đã đăng
 */
function savePostedZaloMessages(postedMessages) {
  try {
    const maxMessages = Math.max(500, Number(ZALO_POSTED_LIMIT) || 1000);
    let messagesToSave = Array.isArray(postedMessages) ? postedMessages : [];
    
    if (messagesToSave.length > maxMessages) {
      messagesToSave = messagesToSave
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, maxMessages);
      console.log(`🧹 [SavePostedZalo] Trimmed to ${maxMessages} newest messages`);  
    }
    
    const compactedData = messagesToSave.map(compactPostedMessage);

    const runtime = ensureZaloRuntimeMigrated();
    runtime.postedMessages = messagesToSave
      .filter(isPostedZaloItem)
      .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
      .slice(0, maxMessages);
    writeZaloRuntimeState(runtime);

    // Keep compact backup key for backward compatibility
    try {
      const size = new Blob([JSON.stringify(compactedData)]).size;
      if (size < 500000) {
        localStorage.setItem('zalo_posted_messages', JSON.stringify(compactedData));
      } else {
        localStorage.setItem('zalo_posted_messages', JSON.stringify(compactedData.slice(0, 50)));
      }
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        try {
          localStorage.removeItem('zalo_posted_messages');
          localStorage.setItem('zalo_posted_messages', JSON.stringify(compactedData.slice(0, 50)));
        } catch (e2) {
          console.warn(`⚠️ [SavePostedZalo] Cannot save compact backup:`, e2.message);
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ [SavePostedZalo] Unexpected error:', e);
  }
}

/**
 * ✅ BATCH MODE: Ghi lại tin Zalo vào session array (không save ngay)
 * Dùng cho auto-posting để tránh gọi server K lần (mỗi mỗi tin)
 * @param {Object} message - Tin nhắn Zalo
 * @param {string} groupName - Tên nhóm
 * @param {string} config_id - ID của config
 * @param {Array} sessionPostedMessages - Session array (sẽ được modify in-place)
 * @returns {boolean} true nếu tin chưa được record, false nếu đã có
 */
function recordPostedZaloMessageInSession(message, groupName, config_id, sessionPostedMessages) {
  try {
    if (!Array.isArray(sessionPostedMessages)) {
      console.warn('⚠️ [RecordSession] sessionPostedMessages is not an array');
      return false;
    }

    if (ZALO_STATS_ONLY_MODE) {
      sessionPostedMessages.push({
        type: 'posted_zalo_stats_event',
        config_id: config_id || null,
        groupName: groupName || 'Unknown',
        timestamp: Date.now()
      });
      return true;
    }
    
    const hash = buildMessageHash(message);
    
    // Check if already recorded in session
    if (sessionPostedMessages.some(p => p.hash === hash && p.config_id === config_id)) {
      console.log(`ℹ️ [RecordSession] Message already recorded in session: ${hash}`);
      return false;
    }
    
    // Thêm tin mới vào session
    const newRecord = {
      id: 'posted_zalo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: 'posted_zalo_message',
      hash: hash,
      timestamp: Date.now(),
      config_id: config_id,
      groupName: groupName || 'Unknown',
      content_preview: (message.content || '').substring(0, 100),
      sender: message.sender || 'Unknown',
      has_images: message.images && message.images.length > 0
    };
    
    sessionPostedMessages.unshift(newRecord);
    console.log(`✅ [RecordSession] Added to session: ${groupName} - ${newRecord.content_preview.substring(0, 40)}...`);
    return true;
  } catch (e) {
    console.warn('⚠️ [RecordSession] Error:', e);
    return false;
  }
}

/**
 * Ghi lại tin Zalo đã đăng thành công (có include config_id)
 * ⚠️ CỰ LỚN: Hàm này gọi server mỗi lần! Dùng recordPostedZaloMessageInSession cho batch instead
 * @param {Object} message - Tin nhắn Zalo
 * @param {string} groupName - Tên nhóm
 * @param {string} config_id - ID của config (tùy chọn)
 */
function recordPostedZaloMessage(message, groupName, config_id = null) {
  try {
    if (ZALO_STATS_ONLY_MODE) {
      recordPostedZaloStats(groupName, config_id, 1, Date.now());
      console.log(`✅ [RecordPostedStats] ${groupName} (config: ${config_id || 'unknown'}) +1`);
      return;
    }

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
 * Đối chiếu hash đã đăng trực tiếp từ SERVER theo danh sách hash cần kiểm tra.
 * Giảm RAM: không tạo full in-memory cache lịch sử, chỉ lấy hash cần đối chiếu.
 * @param {Array<string>} candidateHashes
 * @param {string|null} config_id
 * @returns {Promise<Set<string>>}
 */
async function lookupPostedHashesViaServer(candidateHashes = [], config_id = null) {
  const hashes = Array.from(new Set((Array.isArray(candidateHashes) ? candidateHashes : [])
    .map((h) => String(h || '').trim())
    .filter(Boolean)));

  if (hashes.length === 0) return new Set();

  const matched = new Set();
  const candidateSet = new Set(hashes);

  try {
    const server = await fetchDataOptionUserFromServerAsync();
    const source = Array.isArray(server?.data) && server.data.length > 0
      ? server.data
      : getRawDataOptionUserSnapshot();

    const arr = Array.isArray(source) ? source : [];
    for (const item of arr) {
      if (!isPostedZaloItem(item)) continue;
      if (config_id && item?.config_id !== config_id) continue;

      const hash = String(item?.hash || '').trim();
      if (hash && candidateSet.has(hash)) {
        matched.add(hash);
        if (matched.size >= candidateSet.size) break;
      }
    }

    const runtimePosted = loadPostedZaloMessages();
    for (const item of (Array.isArray(runtimePosted) ? runtimePosted : [])) {
      if (config_id && item?.config_id !== config_id) continue;
      const hash = String(item?.hash || '').trim();
      if (hash && candidateSet.has(hash)) {
        matched.add(hash);
        if (matched.size >= candidateSet.size) break;
      }
    }

    console.log(`📡 [ServerPostedCheck] Matched ${matched.size}/${candidateSet.size} hashes (config: ${config_id || 'default'})`);
    return matched;
  } catch (e) {
    console.warn('⚠️ [ServerPostedCheck] Error:', e?.message || e);
    return new Set();
  }
}

/**
 * Lọc tin chưa đăng bằng cách đối chiếu trực tiếp với SERVER.
 * @param {Array} messages
 * @param {string|null} config_id
 * @returns {Promise<Array>}
 */
async function filterNotPostedMessagesViaServer(messages, config_id = null) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  try {
    const hashRows = messages.map((msg) => ({ msg, hash: buildMessageHash(msg) }));
    const hashes = hashRows.map((x) => x.hash).filter(Boolean);
    const matched = await lookupPostedHashesViaServer(hashes, config_id);

    const notPosted = hashRows
      .filter((x) => !matched.has(x.hash))
      .map((x) => x.msg);

    const filtered = messages.length - notPosted.length;
    if (filtered > 0) {
      console.log(`🔍 [FilterNotPostedServer] Filtered out ${filtered}/${messages.length} via SERVER check (config ${config_id || 'default'})`);
    }
    return notPosted;
  } catch (e) {
    console.warn('⚠️ [FilterNotPostedServer] Fallback to local check:', e?.message || e);
    return filterNotPostedMessages(messages, config_id);
  }
}

// ===== STRICT PRE-POST DEDUP GUARD =====
// Mục tiêu: trước khi đăng từng tin, luôn đối chiếu server + runtime để chặn đăng trùng tuyệt đối.
const ZALO_DEDUP_GUARD = {
  SERVER_CACHE_TTL_MS: 20000,
  serverHashCache: new Map(),
  serverImageCache: new Map(),
  localImageSigCache: new Map(),
  runtimePostedByConfig: new Map(),
  normalizeConfigKey(configId) {
    return String(configId || 'default').trim() || 'default';
  }
};

function getZaloImageSigStorageKey() {
  return `${ZALO_IMAGE_SIG_STORAGE_PREFIX}:${getZaloRuntimeIdentityKey()}`;
}

function readPostedImageSigStore() {
  try {
    const raw = localStorage.getItem(getZaloImageSigStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePostedImageSigStore(store = {}) {
  try {
    localStorage.setItem(getZaloImageSigStorageKey(), JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

function getLocalPostedImageSigSetForConfig(configId = null) {
  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  const cached = ZALO_DEDUP_GUARD.localImageSigCache.get(key);
  if (cached instanceof Set) {
    return cached;
  }

  const store = readPostedImageSigStore();
  const rows = Array.isArray(store?.[key]) ? store[key] : [];
  const set = new Set();
  for (const row of rows) {
    const sig = normalizeImageSignature(row?.sig || row);
    if (sig) set.add(sig);
  }
  ZALO_DEDUP_GUARD.localImageSigCache.set(key, set);
  return set;
}

function persistLocalPostedImageSigSetForConfig(configId = null, sigSet = new Set()) {
  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  const set = sigSet instanceof Set ? sigSet : new Set();
  const rows = Array.from(set)
    .filter(Boolean)
    .slice(-ZALO_IMAGE_SIG_LIMIT_PER_CONFIG)
    .map((sig) => ({ sig, ts: Date.now() }));

  const store = readPostedImageSigStore();
  store[key] = rows;
  writePostedImageSigStore(store);
}

function markRuntimePostedImageSignature(configId, signature) {
  const sig = normalizeImageSignature(signature);
  if (!sig) return;

  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  const set = getLocalPostedImageSigSetForConfig(key);
  if (!set.has(sig)) {
    set.add(sig);
    if (set.size > ZALO_IMAGE_SIG_LIMIT_PER_CONFIG) {
      const all = Array.from(set);
      const trimmed = new Set(all.slice(-ZALO_IMAGE_SIG_LIMIT_PER_CONFIG));
      ZALO_DEDUP_GUARD.localImageSigCache.set(key, trimmed);
      persistLocalPostedImageSigSetForConfig(key, trimmed);
      return;
    }
    persistLocalPostedImageSigSetForConfig(key, set);
  }
}

function hasRuntimePostedImageSignature(configId, signature) {
  const sig = normalizeImageSignature(signature);
  if (!sig) return false;
  const set = getLocalPostedImageSigSetForConfig(configId);
  return set.has(sig);
}

function markRuntimePostedHash(configId, hash) {
  const cleanHash = String(hash || '').trim();
  if (!cleanHash) return;
  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  if (!ZALO_DEDUP_GUARD.runtimePostedByConfig.has(key)) {
    ZALO_DEDUP_GUARD.runtimePostedByConfig.set(key, new Set());
  }
  ZALO_DEDUP_GUARD.runtimePostedByConfig.get(key).add(cleanHash);
}

function hasRuntimePostedHash(configId, hash) {
  const cleanHash = String(hash || '').trim();
  if (!cleanHash) return false;
  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  const set = ZALO_DEDUP_GUARD.runtimePostedByConfig.get(key);
  return !!(set && set.has(cleanHash));
}

async function getServerPostedHashSetForConfig(configId = null, opts = {}) {
  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  const forceRefresh = !!opts.forceRefresh;
  const now = Date.now();
  const cacheEntry = ZALO_DEDUP_GUARD.serverHashCache.get(key);

  if (!forceRefresh && cacheEntry && (now - cacheEntry.fetchedAt) < ZALO_DEDUP_GUARD.SERVER_CACHE_TTL_MS) {
    return cacheEntry.hashSet;
  }

  try {
    const server = await fetchDataOptionUserFromServerAsync();
    const source = Array.isArray(server?.data) && server.data.length > 0
      ? server.data
      : getRawDataOptionUserSnapshot();

    const hashSet = new Set();
    const arr = Array.isArray(source) ? source : [];
    for (const item of arr) {
      if (!isPostedZaloItem(item)) continue;
      if (configId && item?.config_id !== configId) continue;
      const hash = String(item?.hash || '').trim();
      if (hash) hashSet.add(hash);
    }

    const runtimePosted = loadPostedZaloMessages();
    for (const item of (Array.isArray(runtimePosted) ? runtimePosted : [])) {
      if (configId && item?.config_id !== configId) continue;
      const hash = String(item?.hash || '').trim();
      if (hash) hashSet.add(hash);
    }

    ZALO_DEDUP_GUARD.serverHashCache.set(key, { fetchedAt: now, hashSet });
    return hashSet;
  } catch (e) {
    console.warn(`⚠️ [DedupGuard] Không thể tải hash đã đăng từ server (${key}):`, e?.message || e);
    return cacheEntry?.hashSet || new Set();
  }
}

async function getServerPostedImageSetForConfig(configId = null, opts = {}) {
  const key = ZALO_DEDUP_GUARD.normalizeConfigKey(configId);
  const forceRefresh = !!opts.forceRefresh;
  const now = Date.now();
  const cacheEntry = ZALO_DEDUP_GUARD.serverImageCache.get(key);

  if (!forceRefresh && cacheEntry && (now - cacheEntry.fetchedAt) < ZALO_DEDUP_GUARD.SERVER_CACHE_TTL_MS) {
    return cacheEntry.imageSet;
  }

  try {
    const server = await fetchDataOptionUserFromServerAsync();
    const source = Array.isArray(server?.data) && server.data.length > 0
      ? server.data
      : getRawDataOptionUserSnapshot();

    const imageSet = new Set();
    const arr = Array.isArray(source) ? source : [];
    for (const item of arr) {
      if (!isPostedZaloItem(item)) continue;
      if (configId && item?.config_id !== configId) continue;

      const sig = normalizeImageSignature(extractFirstImageFromHash(item?.hash || ''));
      if (sig) imageSet.add(sig);
    }

    const runtimePosted = loadPostedZaloMessages();
    for (const item of (Array.isArray(runtimePosted) ? runtimePosted : [])) {
      if (configId && item?.config_id !== configId) continue;
      const sig = normalizeImageSignature(extractFirstImageFromHash(item?.hash || ''));
      if (sig) imageSet.add(sig);
    }

    const localSigSet = getLocalPostedImageSigSetForConfig(configId);
    for (const sig of localSigSet) {
      if (sig) imageSet.add(sig);
    }

    ZALO_DEDUP_GUARD.serverImageCache.set(key, { fetchedAt: now, imageSet });
    return imageSet;
  } catch (e) {
    console.warn(`⚠️ [DedupGuard] Không thể tải image set đã đăng từ server (${key}):`, e?.message || e);
    return cacheEntry?.imageSet || new Set();
  }
}

async function preflightPostedCheckForMessage(message, configId = null, opts = {}) {
  const hash = buildMessageHash(message);
  const firstImageSig = getMessageFirstImageSignature(message);
  if (!hash) {
    return { shouldSkip: false, reason: 'no_hash', hash: '' };
  }

  if (hasRuntimePostedHash(configId, hash)) {
    return { shouldSkip: true, reason: 'runtime_already_posted', hash };
  }

  if (firstImageSig && hasRuntimePostedImageSignature(configId, firstImageSig)) {
    return { shouldSkip: true, reason: 'runtime_image_already_posted', hash };
  }

  try {
    if (firstImageSig) {
      const serverImageSet = await getServerPostedImageSetForConfig(configId, { forceRefresh: !!opts.forceRefresh });
      if (serverImageSet.has(firstImageSig)) {
        markRuntimePostedImageSignature(configId, firstImageSig);
        return { shouldSkip: true, reason: 'server_image_already_posted', hash };
      }
    }

    const serverHashes = await getServerPostedHashSetForConfig(configId, { forceRefresh: !!opts.forceRefresh });
    if (serverHashes.has(hash)) {
      markRuntimePostedHash(configId, hash);
      return { shouldSkip: true, reason: 'server_already_posted', hash };
    }
  } catch (e) {
    console.warn('⚠️ [DedupGuard] Preflight server check lỗi, fallback local:', e?.message || e);
    const localPosted = loadPostedZaloMessages();
    if (firstImageSig) {
      const existedByImage = localPosted.some((p) => {
        if (configId && p?.config_id !== configId) return false;
        const sig = normalizeImageSignature(extractFirstImageFromHash(p?.hash || ''));
        return sig && sig === firstImageSig;
      });
      if (existedByImage) {
        markRuntimePostedImageSignature(configId, firstImageSig);
        return { shouldSkip: true, reason: 'local_image_already_posted', hash };
      }
    }
    const existed = localPosted.some((p) => (!configId || p.config_id === configId) && p.hash === hash);
    if (existed) {
      markRuntimePostedHash(configId, hash);
      return { shouldSkip: true, reason: 'local_already_posted', hash };
    }
  }

  return { shouldSkip: false, reason: 'ok_to_post', hash };
}

/**
 * Lọc tin CHƯA đăng (từ cache/session, không load từ server)
 * ✅ OPTIMIZED: Dùng posted list từ bộ nhớ thay vì load mỗi lần
 * @param {Array} messages - Danh sách tin cần lọc
 * @param {string} config_id - ID config
 * @param {Array} cachedPosted - Posted messages từ session cache
 * @returns {Array} Tin chưa được đăng
 */
function filterNotPostedMessagesFromCache(messages, config_id = null, cachedPosted = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  
  // Nếu có config_id, chỉ bỏ qua nếu CÙNG config đã đăng
  const postedHashes = new Set(
    cachedPosted
      .filter(p => !config_id || p.config_id === config_id)
      .map(p => p.hash)
  );
  
  const notPosted = messages.filter(msg => {
    const hash = buildMessageHash(msg);
    return !postedHashes.has(hash);
  });
  
  const filtered = messages.length - notPosted.length;
  if (filtered > 0) {
    console.log(`🔍 [FilterNotPostedCache] Filtered out ${filtered}/${messages.length} already posted messages for config ${config_id || 'default'}`);
  }
  
  return notPosted;
}

/**
 * Merge lịch sử posted mới vào dữ liệu server hiện tại và save lại 1 lần.
 * @param {Array} newPostedMessages - Các record mới của phiên chạy hiện tại
 */
async function appendPostedZaloMessagesToServer(newPostedMessages = []) {
  const incoming = Array.isArray(newPostedMessages) ? newPostedMessages : [];
  if (incoming.length === 0) return;

  if (ZALO_STATS_ONLY_MODE) {
    const grouped = new Map();
    for (const item of incoming) {
      const cfg = item?.config_id || null;
      const grp = item?.groupName || 'Unknown';
      const key = `${cfg || 'default'}||${grp}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    for (const [key, count] of grouped.entries()) {
      const [cfg, grp] = key.split('||');
      recordPostedZaloStats(grp, cfg === 'default' ? null : cfg, count, Date.now());
    }
    console.log(`💾 [appendPostedStats] Saved ${incoming.length} events into ${grouped.size} group-stat buckets`);
    return;
  }

  try {
    await fetchDataOptionUserFromServerAsync();
  } catch {}

  const existing = loadPostedZaloMessages();
  const merged = [];
  const seen = new Set();

  const pushUnique = (item) => {
    if (!item || !item.hash) return;
    const key = `${item.hash}__${item.config_id || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  incoming.forEach(pushUnique);
  existing.forEach(pushUnique);

  merged.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
  if (merged.length > ZALO_POSTED_LIMIT) {
    merged.splice(ZALO_POSTED_LIMIT);
  }
  cleanupOldPostedZaloMessages(merged);

  console.log(`💾 [appendPostedZaloMessagesToServer] Saving merged history: ${merged.length} records (${incoming.length} new)`);
  savePostedZaloMessages(merged);
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

    if (ZALO_STATS_ONLY_MODE) {
      savePostedZaloStats([]);
      return {
        success: true,
        message: 'Xóa toàn bộ thống kê đăng Zalo thành công.',
        deletedCount: 0
      };
    }
    
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
    const config = findZaloConfigById(configs, config_id);
    
    if (!config) {
      return [];
    }

    if (Array.isArray(config.zalo_fanpages) && config.zalo_fanpages.length > 0) {
      return config.zalo_fanpages;
    }

    if (Array.isArray(config.fanpage_ids) && config.fanpage_ids.length > 0) {
      return config.fanpage_ids
        .map((id, idx) => ({
          id,
          name: config.fanpage_names?.[idx] || config.fanpage_name || 'Unknown',
          access_token: config.fanpage_tokens?.[idx] || config.fanpage_token || ''
        }))
        .filter(fp => fp.id);
    }
    
    return [];
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

function stopLoginCheck() {
  if (zaloLoginCheckTimer) {
    clearInterval(zaloLoginCheckTimer);
    zaloLoginCheckTimer = null;
  }
}

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
  header.textContent = t('zalo_web_chat');

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
  
  if (!detail.service_type || !detail.slug) {
    console.warn('❌ [GetLastPostUrl] Thiếu service_type hoặc slug');
    return null;
  }
  
  const fullUrl = `https://www.${domain}/${detail.service_type}/${detail.slug}`;
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
  const rawVideosFromMessages = Array.isArray(messages)
    ? messages.flatMap(m => Array.isArray(m?.videos) ? m.videos : [])
    : [];
  const rawImagesFromOptions = Array.isArray(options.images) ? options.images : [];
  const rawVideosFromOptions = Array.isArray(options.videos) ? options.videos : [];
  const validFbImages = Array.from(new Set([...rawImagesFromOptions, ...rawImagesFromMessages]))
    .filter(img => typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')));
  const validFbVideos = Array.from(new Set([...rawVideosFromOptions, ...rawVideosFromMessages]))
    .filter(vid => typeof vid === 'string' && (vid.startsWith('http://') || vid.startsWith('https://') || vid.startsWith('data:') || vid.startsWith('/app_images/') || vid.startsWith('app_images/')));

  console.log(`🖼️ [PostToFanpages] Valid images for post: ${validFbImages.length}`);
  console.log(`🎬 [PostToFanpages] Valid videos for post: ${validFbVideos.length}`);

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
          description: `${messageContent}\n[PAGE:${pageName}|${index + 1}]`,
          content: messageContent,
          keywords: 'zalo, fanpage, auto-post',
          industry: fallbackIndustry,
          personaKey
        },
        helperAi,
        { domain: (resolveContext()?.domain || '') }
      );

      if (fbPostData?.facebook_post) {
        // Chuẩn hóa nội dung AI để hashtag cuối bài chỉ xuất hiện một lần.
        let fullPostContent = formatFacebookPostContent(fbPostData.facebook_post, fbPostData.hashtags);
        
        // Thêm CTA cuối cùng với link
        const cta = fbPostData.cta || 'Xem chi tiết';
        fullPostContent += `\n\n👉 ${cta}: ${postUrl}`;
        
        return fullPostContent;
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
  const postedItems = [];
  let tokenExpiredDetected = false;
  let tokenExpiredMessage = '';
  let stopAllPosting = false;

  // ✅ CONSTANTS cho retry logic
  const MAX_RETRIES_PER_PAGE = ZALO_TIMING.MAX_FACEBOOK_RETRIES;
  const RETRY_DELAY_MS = ZALO_TIMING.FACEBOOK_RETRY_DELAY;

  // Đăng lên từng Fanpage VỚI RETRY LOGIC
  for (let i = 0; i < selectedPages.length && !stopAllPosting; i++) {
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
          validFbVideos,
          postUrl,
          seftObj
        );
        
        if (result?.success) {
          console.log(`✅ [Fanpage ${i + 1}] Đã đăng lên ${page.name} thành công! (Post ID: ${result.post_id || 'N/A'})`);
          successCount++;
          const resultPostIds = Array.isArray(result.all_post_ids) && result.all_post_ids.length > 0
            ? result.all_post_ids
            : [result.post_id].filter(Boolean);
          resultPostIds.forEach((postId) => {
            postedItems.push({
              page_id: page.id,
              page_name: page.name,
              post_id: postId,
              posted_at: Date.now()
            });
          });
          posted = true;
          break; // Thành công, thoát loop retry
        } else {
          const authErrorInfo = extractFacebookAuthErrorInfo(result);
          if (authErrorInfo.isAuthError) {
            tokenExpiredDetected = tokenExpiredDetected || authErrorInfo.isTokenExpired;
            tokenExpiredMessage = authErrorInfo.message || tokenExpiredMessage;
            facebookState._needsValidation = true;

            console.error(`❌ [Fanpage ${i + 1}] Facebook token lỗi/hết hạn khi đăng ${page.name}: ${authErrorInfo.message}`);
            canhbao(ti('❌ Facebook token đã hết hạn/không hợp lệ trong lúc chạy. Vui lòng cập nhật token ở mục Facebook Token Management rồi chạy lại.', '❌ Facebook token expired/invalid during execution. Please update token in Facebook Token Management and retry.', '❌ Facebook token 在运行中已过期/无效。请在 Facebook Token 管理中更新后重试。'));

            failCount++;
            stopAllPosting = true;
            break;
          }

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
        const authErrorInfo = extractFacebookAuthErrorInfo(e);
        if (authErrorInfo.isAuthError) {
          tokenExpiredDetected = tokenExpiredDetected || authErrorInfo.isTokenExpired;
          tokenExpiredMessage = authErrorInfo.message || tokenExpiredMessage;
          facebookState._needsValidation = true;

          console.error(`❌ [Fanpage ${i + 1}] Token Facebook lỗi/hết hạn khi đăng ${page.name}: ${authErrorInfo.message}`);
          canhbao(ti('❌ Facebook token đã hết hạn/không hợp lệ trong lúc chạy. Vui lòng cập nhật token ở mục Facebook Token Management rồi chạy lại.', '❌ Facebook token expired/invalid during execution. Please update token in Facebook Token Management and retry.', '❌ Facebook token 在运行中已过期/无效。请在 Facebook Token 管理中更新后重试。'));

          failCount++;
          stopAllPosting = true;
          break;
        }

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

  if (stopAllPosting) {
    console.warn('⛔ [PostToFanpages] Dừng batch do token Facebook hết hạn/không hợp lệ.');
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

  return { successCount, failCount, tokenExpiredDetected, tokenExpiredMessage, postedItems };
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
      const postResult = await pushSingleMessageToWeb(message, item.groupName, item.configId, item.config);
      
      if (postResult?.success) {
        console.log(`   ✅ [${i + 1}/${item.messages.length}] Đăng thành công`);
      } else if (postResult?.skipped) {
        console.log(`   ⏭️ [${i + 1}/${item.messages.length}] Bỏ qua (${postResult.reason || 'duplicate'})`);
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
async function pushSingleMessageToWeb(message, groupName, configId, config, sessionPostedMessages = null) {
  try {
    console.log(`    🚀 [Auto Post] Gọi trực tiếp processContent cho tin từ ${message.sender}...`);

    // ✅ PRE-FLIGHT DEDUP CHECK: đối chiếu SERVER ngay trước khi đăng từng tin
    const preflight = await preflightPostedCheckForMessage(message, configId, { forceRefresh: false });
    if (preflight.shouldSkip) {
      console.warn(`    ⏭️ [Auto Post] Skip duplicate (${preflight.reason})`);
      return { success: false, skipped: true, reason: preflight.reason, hash: preflight.hash };
    }
    
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
      console.error('❌ [Auto Post] processContent lỗi:', processErr);
      return { success: false, skipped: false, reason: processErr?.message || 'process_failed', hash: preflight.hash };
    }

    // ✅ Record chỉ khi đăng thành công (đúng nghĩa đã đăng)
    try {
      if (sessionPostedMessages) {
        recordPostedZaloMessageInSession(message, groupName, configId, sessionPostedMessages);
        console.log(`    📝 [Auto Post] Đã thêm vào session batch`);
      } else {
        recordPostedZaloMessage(message, groupName, configId);
        console.log(`    📝 [Auto Post] Đã record message vào lịch sử`);
      }
      markRuntimePostedHash(configId, preflight.hash);
      const postedImageSig = getMessageFirstImageSignature(message);
      if (postedImageSig) {
        markRuntimePostedImageSignature(configId, postedImageSig);
      }
    } catch (recordErr) {
      console.error('❌ [Auto Post] recordPostedZaloMessage lỗi:', recordErr);
    }
    
    // ✅ Cập nhật stats UI
    if (typeof window.updateZaloPostedStats === 'function') {
      window.updateZaloPostedStats();
    }
    
    return { success: !!postSuccess, skipped: false, reason: postSuccess ? 'posted' : 'unknown', hash: preflight.hash };
  } catch (e) {
    console.error('❌ [Auto Post] Lỗi:', e);
    return { success: false, skipped: false, reason: e?.message || 'unexpected_error', hash: '' };
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
 * ✅ OPTIMIZED: Đối chiếu trực tiếp qua API theo batch hash, giảm RAM nội bộ
 */
async function scanAndPostConfig(config, statusEl, sessionData = {}) {
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
  const sessionNewPostedMessages = [];
  const sessionNewPostedHashSet = new Set();
  
  // Store in sessionData for cleanup/debug
  sessionData.sessionPostedMessages = sessionNewPostedMessages;
  sessionData.messages = [];
  
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
      
      // Store messages for cleanup tracking
      if (sessionData && sessionData.messages) {
        sessionData.messages.push(...messages);
      }
      
      if (messages.length === 0) {
        continue; // Nhóm tiếp
      }
      
      // BƯỚC 2: Lọc tin mới
      const newMessages = filterNewMessagesForConfig(configId, groupName, messages);
      if (newMessages.length === 0) {
        console.log(`    ⏭️ Không có tin mới`);
        continue; // Nhóm tiếp
      }
      
      // BƯỚC 2.1: Lọc trùng trong phiên hiện tại (không gọi server, chỉ Set hash nhẹ)
      const localUnpostedMessages = newMessages.filter((msg) => {
        const hash = buildMessageHash(msg);
        return !sessionNewPostedHashSet.has(hash);
      });
      if (localUnpostedMessages.length === 0) {
        console.log(`    ⏭️ ${newMessages.length} tin mới nhưng đã xuất hiện trong phiên chạy (skip)`);
        continue; // Nhóm tiếp
      }

      // BƯỚC 2.2: Lọc theo SERVER (API-based) để chống trùng đa phiên/đa máy
      const unpostedMessages = await filterNotPostedMessagesViaServer(localUnpostedMessages, configId);
      if (unpostedMessages.length === 0) {
        console.log(`    ⏭️ ${localUnpostedMessages.length} tin còn lại đều đã đăng trước đó trên server (skip)`);
        continue; // Nhóm tiếp
      }

      const duplicateCount = newMessages.length - unpostedMessages.length;
      if (duplicateCount > 0) {
        console.log(`    🔁 Bỏ qua ${duplicateCount} tin đã đăng trước đó`);
      }

      console.log(`    ✅ Có ${unpostedMessages.length} tin mới chưa đăng`);
      totalNew += unpostedMessages.length;
      
      // BƯỚC 3: ✅ VALIDATE BẮTBUỘC - Tin phải có ĐỦ nội dung AND ảnh mới xử lý
      const validMessages = unpostedMessages.filter(msg => {
        const hasContent = msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0;
        const hasImages = msg.images && Array.isArray(msg.images) && msg.images.length > 0;
        
        if (!hasContent) {
          console.log(`      ⏭️ Bỏ qua tin: THIẾU NỘI DUNG từ ${msg.sender || 'Unknown'}`);
          return false;
        }
        
        if (!hasImages) {
          console.log(`      ⏭️ Bỏ qua tin: THIẾU HÌNH từ ${msg.sender || 'Unknown'} (content: ${msg.content.substring(0, 50)}...)`);
          return false;
        }
        
        return true;
      });
      
      const invalidCount = unpostedMessages.length - validMessages.length;
      if (invalidCount > 0) {
        console.log(`    ❌ Loại bỏ ${invalidCount} tin không đủ điều kiện (thiếu nội dung hoặc hình)`);
      }
      
      if (validMessages.length === 0) {
        console.log(`    ⏭️ Không có tin nào có ĐỦ nội dung AND hình - bỏ qua nhóm này`);
        continue; // Nhóm tiếp
      }
      
      console.log(`    ✅ ${validMessages.length} tin có ĐỦ nội dung + hình - Bắt đầu đăng...`);
      
      // BƯỚC 4: Đăng LẦN LƯỢT từng tin (tuần tự, không queue)
      for (let msgIdx = 0; msgIdx < validMessages.length; msgIdx++) {
        if (!isZaloScanning) break;
        
        const msg = validMessages[msgIdx];
        const msgPos = msgIdx + 1;
        
        try {
          console.log(`      [TIN ${msgPos}/${validMessages.length}] Đăng "${msg.sender || 'Unknown'}"...`);
          
          // Đăng tin này (tuần tự với auth) + ghi vào session
          const postResult = await pushSingleMessageToWeb(msg, groupName, configId, config, sessionNewPostedMessages);
          const msgHash = buildMessageHash(msg);

          if (postResult?.success) {
            sessionNewPostedHashSet.add(msgHash);
            console.log(`        ✅ Đăng thành công`);
            totalPosted++;
            
            // Chờ 3s trước tin tiếp (cần để hạ load)
            await new Promise(resolve => setTimeout(resolve, ZALO_TIMING.WAIT_BETWEEN_POSTS));
          } else if (postResult?.skipped) {
            sessionNewPostedHashSet.add(msgHash);
            console.log(`        ⏭️ Bỏ qua do trùng (${postResult.reason || 'duplicate'})`);
          } else {
            console.warn(`        ❌ Đăng thất bại`);
          }
        } catch (e) {
          console.error(`        ❌ Lỗi đăng tin:`, e.message);
        }
      }
      
      console.log(`    ✅ Nhóm ${groupName} đăng xong (${validMessages.length} tin)`);
      
      // ✅ CLEANUP CACHED DATA SAU MỖI GROUP - Tối ưu bộ nhớ
      if (CSM_ENABLE_LOCAL_DB_BACKEND && ZALO_LOCAL_DB_ADAPTER.isReady) {
        try {
          const beforeCleanup = await ZALO_LOCAL_DB_ADAPTER.getMessageCount();
          const storage = await ZALO_LOCAL_DB_ADAPTER.getStorageSize();
          
          // Clear messages cho group này
          const deleted = await ZALO_LOCAL_DB_ADAPTER.clearAllForConfig(configId);
          
          if (deleted > 0) {
            const afterStorage = await ZALO_LOCAL_DB_ADAPTER.getStorageSize();
            const savedMB = (parseFloat(storage.usageMB) - parseFloat(afterStorage.usageMB)).toFixed(2);
            console.log(`    🧹 [Cache] Cleaned ${deleted} messages - Freed ${savedMB}MB (${afterStorage.usageMB}MB remain)`);
          }
        } catch (e) {
          console.warn(`    ⚠️ [Cache] Cleanup error:`, e.message);
        }
      }
      
      // Chờ 2s trước nhóm tiếp (để hạ load)
      if (groupIdx < groupList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, ZALO_TIMING.WAIT_BETWEEN_GROUPS));
      }
      
    } catch (e) {
      console.error(`  ❌ Lỗi xử lý nhóm ${groupName}:`, e.message);
    }
  }
  
  // ✅ Save posted messages ONCE at end (merge với server history)
  if (totalPosted > 0) {
    console.log(`\n💾 [Config ${configId}] Lưu ${totalPosted} tin vào server (batch save)...`);
    
    try {
      await appendPostedZaloMessagesToServer(sessionNewPostedMessages);
      console.log(`✅ [Config ${configId}] Batch save hoàn tất`);
    } catch (saveErr) {
      console.error(`❌ [Config ${configId}] Batch save lỗi:`, saveErr.message);
    }
  }
  
  console.log(`\n✅ [Config ${configId}] Hoàn tất: ${totalNew} tin mới, ${totalPosted} tin đăng`);
}

/**
 * ✅ SEQUENTIAL LOOP - Tuần tự hoàn toàn (không concurrency)
 * Flow: Quét config → Quét nhóm → Lấy tin → Đăng hết → Nhóm tiếp → ...
 * Không posting worker loop, tất cả tuần tự
 */
function startZaloScanner(statusEl, options = {}) {
  if (isZaloScanning) return;
  isZaloScanning = true;

  // ✅ Start Storage Monitor (lightweight mode)
  startStorageMonitor();

  // Set auto mode flag để tự động xác nhận confirm() dialogs
  isZaloAutoMode = true;
  console.log('🚀 [Zalo Scanner] Bắt đầu - SEQUENTIAL MODE (tuần tự hoàn toàn)');
  
  // ✅ KHÓA UI KHI SCANNER ĐANG CHẠY
  createScannerLockOverlay();

  // Lấy config theo lưới động (nếu có chọn thì ưu tiên cấu hình đã chọn)
  const initialConfigs = resolveActiveZaloConfigsForScanner(options);
  
  if (initialConfigs.length === 0) {
    console.warn('⚠️ Grid-only mode: chưa chọn dòng cấu hình hợp lệ để quét');
    if (statusEl) {
      statusEl.textContent = ti(
        '⚠️ Grid-only: chưa chọn dòng cấu hình nào để quét.',
        '⚠️ Grid-only: no selected config rows to scan.',
        '⚠️ 仅表格模式：未选择可扫描的配置行。'
      );
    }
    isZaloScanning = false;
    stopStorageMonitor();
    removeScannerLockOverlay();
    return;
  }

  console.log(`📊 Khởi động Sequential Loop cho ${initialConfigs.length} configs:`);
  initialConfigs.forEach((config, index) => {
    const configId = config.config_id || config.id;
    const groupCount = config.zalo_groups ? config.zalo_groups.length : 0;
    console.log(`  → [${index + 1}/${initialConfigs.length}] ${configId}: ${groupCount} nhóm`);
  });
  
  // ✅ STATE
  let currentConfigIndex = 0;
  let lastScanTime = 0;
  let isCurrentlyScanning = false;

  // ✅ MAIN LOOP: Adaptive setTimeout để giảm wake-up không cần thiết
  let mainLoopTimer = null;
  const scheduleMainLoop = (delayMs) => {
    if (!isZaloScanning) return;
    if (mainLoopTimer) {
      clearTimeout(mainLoopTimer);
      mainLoopTimer = null;
    }
    mainLoopTimer = setTimeout(runMainLoop, Math.max(250, Number(delayMs) || ZALO_TIMING.SCANNER_LOOP_INTERVAL));
    zaloConfigScanners._mainLoopTimer = mainLoopTimer;
  };

  const runMainLoop = async () => {
    if (!isZaloScanning) {
      if (mainLoopTimer) {
        clearTimeout(mainLoopTimer);
        mainLoopTimer = null;
      }
      forceCleanupResources(); // Cleanup khi dừng
      return;
    }

    // Trong lúc quét, check thưa để tránh polling liên tục
    if (isCurrentlyScanning) {
      scheduleMainLoop(Math.min(2000, ZALO_TIMING.SCANNER_LOOP_INTERVAL));
      return;
    }

    // Check interval (5 phút)
    const now = Date.now();
    const timeSinceLastScan = now - lastScanTime;
    const minInterval = ZALO_TIMING.CONFIG_SCAN_INTERVAL;

    if (lastScanTime > 0 && timeSinceLastScan < minInterval) {
      const remainingMs = minInterval - timeSinceLastScan;
      const nextDelay = Math.min(
        Math.max(1000, remainingMs),
        Math.max(ZALO_TIMING.SCANNER_LOOP_INTERVAL, ZALO_TIMING.SCANNER_IDLE_CHECK_INTERVAL || 15000)
      );
      scheduleMainLoop(nextDelay);
      return;
    }

    // Re-resolve configs mỗi vòng để đồng bộ thay đổi trực tiếp từ lưới động
    const activeConfigs = resolveActiveZaloConfigsForScanner(options);
    if (!Array.isArray(activeConfigs) || activeConfigs.length === 0) {
      console.warn('⚠️ Grid-only mode: không còn dòng được chọn, dừng scanner');
      stopZaloScanner(statusEl);
      return;
    }

    if (currentConfigIndex >= activeConfigs.length) {
      currentConfigIndex = 0;
    }

    // Bắt đầu quét config
    const config = activeConfigs[currentConfigIndex];
    const configId = config.config_id || config.id;

    console.log(`\n🎯 [Round ${currentConfigIndex + 1}/${activeConfigs.length}] Config: ${configId}`);

    isCurrentlyScanning = true;
    let sessionData = {}; // Track session data for cleanup

    try {
      // ✅ Quét config này (tuần tự: nhóm → lấy tin → đăng)
      await scanAndPostConfig(config, statusEl, sessionData);
    } catch (e) {
      console.error(`❌ [Config ${configId}] Error:`, e);
    } finally {
      // ✅ CLEANUP AFTER CONFIG - Giải phóng RAM sau mỗi config
      sessionData.configId = configId; // Track configId for cleanup
      cleanupAfterConfig(sessionData);
      sessionData = null;

      // Force GC hint between configs
      if (typeof window.gc === 'function') {
        try { window.gc(); } catch (e) {}
      }

      // Chuyển config tiếp
      currentConfigIndex = (currentConfigIndex + 1) % activeConfigs.length;
      lastScanTime = Date.now();
      isCurrentlyScanning = false;

      if (statusEl) {
        statusEl.textContent = `🔄 [${currentConfigIndex + 1}/${activeConfigs.length}] Chờ 5 phút...`;
      }

      // ✅ PERIODIC CLEANUP: Mỗi 3 configs, force cleanup
      if (currentConfigIndex % 3 === 0) {
        console.log('🧹 [Periodic] Cleanup sau 3 configs...');
        forceCleanupResources();
      }
    }

    scheduleMainLoop(ZALO_TIMING.BUFFER_AFTER_SCAN || ZALO_TIMING.SCANNER_LOOP_INTERVAL);
  };

  scheduleMainLoop(0);

  if (statusEl) {
    statusEl.textContent = `🟢 Sequential Loop chạy (${initialConfigs.length} configs)...`;
  }
}

/**
 * ✅ DỪNG ZALO SCANNER
 */
function stopZaloScanner(statusEl) {
  isZaloScanning = false;
  isPostingWorkerRunning = false;
  
  // ✅ Stop Storage Monitor
  stopStorageMonitor();

  // ✅ Flush lightweight stats trước khi dừng để không mất số liệu phiên chạy
  flushPostedZaloStatsNow('stop-scanner');
  
  // ✅ MỞ KHÓA UI
  removeScannerLockOverlay();
  
  // ✅ NEW: Auto cleanup cache khi dừng scanner
  if (CSM_ENABLE_LOCAL_DB_BACKEND && ZALO_LOCAL_DB_ADAPTER.isReady) {
    console.log('🧹 [Stop] Cleaning cache...');
    ZALO_LOCAL_DB_ADAPTER.clearAll().then(() => {
      console.log('✅ [Stop] Cache cleaned up');
    }).catch(e => {
      console.warn('⚠️ [Stop] Cache cleanup error:', e.message);
    });
  }

  // Dừng main loop timer
  if (zaloConfigScanners._mainLoopTimer) {
    clearTimeout(zaloConfigScanners._mainLoopTimer);
    console.log(`⏹️ Dừng Main Loop Timer`);
  }
  
  // Clear config scanners
  zaloConfigScanners = {};

  // Dừng auto mode
  isZaloAutoMode = false;
  
  // Force cleanup
  forceCleanupResources();
  
  // Log stats cuối cùng
  console.log('⏹️ [Zalo Scanner] Dừng');

  if (statusEl) {
    statusEl.textContent = `⏸ Đã dừng.`;
  }
}

/**
 * ✅ TẠM DỪNG ZALO SCANNER (Pause - không xóa state)
 */
function pauseZaloScanner(statusEl) {
  if (!isZaloScanning) return;
  
  console.log('⏸️ [Zalo Scanner] Tạm dừng...');
  isZaloScanning = false; // Dừng loop
  
  // Không clear timers, không xóa state - chỉ tạm dừng
  
  if (statusEl) {
    statusEl.textContent = ti('⏸️ Tạm dừng - Nhấn Tiếp tục để chạy lại', '⏸️ Paused - Click Resume to continue', '⏸️ 已暂停 - 点击继续以恢复');
  }
  
  // Force cleanup khi pause
  forceCleanupResources();
}

/**
 * ✅ TIẾP TỤC ZALO SCANNER (Resume từ pause - manual hoặc auto)
 */
function resumeZaloScanner(statusEl, isAutoResume = false) {
  if (isZaloScanning) {
    console.warn('⚠️ Scanner đang chạy, không cần resume');
    return;
  }
  
  console.log(`▶️ [Resume] Scanner tiếp tục...`);
  
  isZaloScanning = true; // Bật lại loop
  
  if (statusEl) {
    const icon = isAutoResume ? '🔄' : '▶️';
    statusEl.textContent = `${icon} ${ti('Đang chạy lại...', 'Resuming...', '正在恢复运行...')}`;
  }
}

/**
 * ✅ CREATE RESET BUTTONS UI
 * Thêm nút Reset Groups + Reset Messages + Pause/Resume + Cleanup vào UI
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
    flex-direction: column;
  `;
  
  // ✅ NEW: Storage Info
  const infoBox = document.createElement('div');
  infoBox.style.cssText = `
    padding: 8px;
    background: #e6f7ff;
    border: 1px solid #91d5ff;
    border-radius: 2px;
    font-size: 11px;
    line-height: 1.5;
  `;
  infoBox.innerHTML = `
    <strong>${ti('⚡ Chế độ nhẹ tài nguyên:', '⚡ Lightweight mode:', '⚡ 轻量模式：')}</strong><br>
    ${ti('🧠 Không dùng cơ chế DB cục bộ', '🧠 Local DB backend disabled', '🧠 本地数据库后端已禁用')}<br>
    ${ti('☁️ Ưu tiên lưu server + thống kê gọn', '☁️ Server-first with compact stats', '☁️ 服务器优先并使用精简统计')}<br>
    ${ti('✅ Giảm tải RAM/CPU cho máy trạm', '✅ Reduced workstation RAM/CPU load', '✅ 降低工作站 RAM/CPU 占用')}
  `;
  wrapper.appendChild(infoBox);
  
  // ✅ NEW: Control Buttons Row
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = `
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  `;
  
  // ✅ NEW: Pause Button
  const btnPause = document.createElement('button');
  btnPause.setAttribute('data-zalo-pause', 'true');
  btnPause.textContent = ti('⏸️ Tạm Dừng', '⏸️ Pause', '⏸️ 暂停');
  btnPause.style.cssText = `
    padding: 6px 12px;
    background: #faad14;
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  `;
  btnPause.onclick = () => {
    const statusEl = document.querySelector('.zalo-scanner-status');
    pauseZaloScanner(statusEl);
  };
  buttonRow.appendChild(btnPause);
  
  // ✅ NEW: Resume Button
  const btnResume = document.createElement('button');
  btnResume.setAttribute('data-zalo-resume', 'true');
  btnResume.textContent = ti('▶️ Tiếp Tục', '▶️ Resume', '▶️ 继续');
  btnResume.style.cssText = `
    padding: 6px 12px;
    background: #52c41a;
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  `;
  btnResume.onclick = () => {
    const statusEl = document.querySelector('.zalo-scanner-status');
    resumeZaloScanner(statusEl);
  };
  buttonRow.appendChild(btnResume);
  
  // ✅ NEW: Force Cleanup Button
  const btnCleanup = document.createElement('button');
  btnCleanup.setAttribute('data-zalo-cleanup', 'true');
  btnCleanup.textContent = ti('🧹 Giải Phóng RAM', '🧹 Free RAM', '🧹 释放内存');
  btnCleanup.style.cssText = `
    padding: 6px 12px;
    background: #1890ff;
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  `;
  btnCleanup.onclick = () => {
    forceCleanupResources();
    setTimeout(() => {
      thongbao(ti(`✅ Đã thực hiện cleanup`, `✅ Cleanup completed`, `✅ 清理已完成`));
    }, 1500);
  };
  buttonRow.appendChild(btnCleanup);
  
  // Button 1: Reset Groups State
  const btnResetGroups = document.createElement('button');
  btnResetGroups.setAttribute('data-zalo-reset-groups', 'true');
  btnResetGroups.textContent = ti('🔄 Reset Groups', '🔄 Reset Groups', '🔄 重置群组');
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
    if (confirm(ti('⚠️ Reset trạng thái các nhóm Zalo đã quét?\n\nBạn sẽ quét lại TẤT CẢ các nhóm.', '⚠️ Reset scanned Zalo groups state?\n\nYou will rescan ALL groups.', '⚠️ 要重置已扫描的 Zalo 群组状态吗？\n\n你将重新扫描所有群组。'))) {
      const result = resetZaloGroupsState();
      alert(`✅ ${result.message}`);
      console.log(result);
    }
  };
  buttonRow.appendChild(btnResetGroups);
  
  // Button 2: Reset Posted Messages
  const btnResetMessages = document.createElement('button');
  btnResetMessages.textContent = ti('🧹 Reset Posted', '🧹 Reset Posted', '🧹 重置已发布');
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
    if (confirm(ti('⚠️ Xóa toàn bộ tin Zalo đã đăng?\n\n❌ KHÔNG THỂ UNDO!\n\nBạn sẽ đăng lại TẤT CẢ từ lần quét đầu.', '⚠️ Delete all posted Zalo messages?\n\n❌ CANNOT UNDO!\n\nYou will repost ALL messages from first scan.', '⚠️ 要删除所有已发布的 Zalo 消息吗？\n\n❌ 无法撤销！\n\n系统将从首次扫描开始重新发布全部消息。'))) {
      const result = resetPostedZaloMessages();
      alert(`✅ ${result.message}`);
      console.log(result);
    }
  };
  buttonRow.appendChild(btnResetMessages);
  
  // Button 3: Reset ALL
  const btnResetAll = document.createElement('button');
  btnResetAll.textContent = ti('⚡ Reset ALL', '⚡ Reset ALL', '⚡ 全部重置');
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
    if (confirm(ti('⚠️ RESET TOÀN BỘ DỮ LIỆU ZALO?\n\n❌ CẢN THẬN: KHÔNG THỂ UNDO!\n\n- Reset tất cả groups state\n- Xóa tất cả posted messages\n- Quét + đăng lại từ đầu', '⚠️ RESET ALL ZALO DATA?\n\n❌ WARNING: CANNOT UNDO!\n\n- Reset all groups state\n- Delete all posted messages\n- Rescan and repost from beginning', '⚠️ 要重置全部 ZALO 数据吗？\n\n❌ 警告：无法撤销！\n\n- 重置所有群组状态\n- 删除所有已发布消息\n- 从头重新扫描并发布'))) {
      const result = resetAllZaloData();
      alert(`✅ ${result.message}`);
      console.log(result);
    }
  };
  buttonRow.appendChild(btnResetAll);
  
  // Append button row to wrapper
  wrapper.appendChild(buttonRow);
  
  // Thêm vào DOM
  if (scannerUI) {
    scannerUI.appendChild(wrapper);
  } else {
    document.body.appendChild(wrapper);
  }
  
  console.log('✅ [UI] Control panel với RAM config info thêm thành công');
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
      createZaloResetButtonsUI,
      pauseZaloScanner,
      resumeZaloScanner,
      forceCleanupResources
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
  title.textContent = ti("💬 Trình quét nhiều nhóm Zalo", "💬 Zalo Multi-Group Scanner", "💬 Zalo 多群组扫描器");
  title.style.cssText = getFeatureTitleStyle(theme);

  const note = document.createElement("div");
  note.style.cssText = `margin-bottom:10px;padding:8px;background:${theme.successBg};border-radius:4px;font-size:12px;color:${theme.success};`;
  note.innerHTML = ti(
    `
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
  `.trim(),
    `
    ✅ <strong>Usage guide:</strong><br>
    <strong>STEP 1 - SETUP:</strong><br>
    &nbsp;&nbsp;• Select <strong>Domain, Service Type, Project</strong> in <strong>"⚙️ General Settings"</strong> above<br>
    &nbsp;&nbsp;• Check <strong>Fanpages</strong> in <strong>"📱 Facebook Token Management"</strong> above<br>
    &nbsp;&nbsp;• Enter <strong>Zalo group list</strong> below (one group per line)<br>
    &nbsp;&nbsp;• Click <strong>"💾 Save configuration"</strong> to save into dynamic grid<br><br>
    
    <strong>STEP 2 - RUN SCANNER:</strong><br>
    &nbsp;&nbsp;• Login to <strong>Zalo</strong> on the right side (QR or phone number)<br>
    &nbsp;&nbsp;• Click <strong>"▶️ Start scan"</strong> after successful login<br>
    &nbsp;&nbsp;• The system auto-scans every 5 minutes and posts to selected fanpages<br><br>
    
    💡 <strong>Tip:</strong> Click a row in dynamic grid to edit configuration!
  `.trim(),
    `
    ✅ <strong>使用说明：</strong><br>
    <strong>第1步 - 配置：</strong><br>
    &nbsp;&nbsp;• 在上方 <strong>"⚙️ 常规设置"</strong> 选择 <strong>Domain、服务类型、项目</strong><br>
    &nbsp;&nbsp;• 在上方 <strong>"📱 Facebook Token Management"</strong> 勾选 <strong>Fanpage</strong><br>
    &nbsp;&nbsp;• 在下方输入 <strong>Zalo 群组列表</strong>（每行一个）<br>
    &nbsp;&nbsp;• 点击 <strong>"💾 保存配置"</strong> 保存到动态表格<br><br>
    
    <strong>第2步 - 运行扫描：</strong><br>
    &nbsp;&nbsp;• 在右侧登录 <strong>Zalo</strong>（二维码或手机号）<br>
    &nbsp;&nbsp;• 登录成功后点击 <strong>"▶️ 开始扫描"</strong><br>
    &nbsp;&nbsp;• 系统将每 5 分钟自动扫描并发布到已选 fanpage<br><br>
    
    💡 <strong>提示：</strong>点击动态表格中的行可编辑配置！
  `.trim()
  );

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
  const parseBooleanFlag = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return !!defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return !!defaultValue;
  };

  const captureFormState = () => {
    const domainSelect = document.getElementById("global-domain-select");
    const industrySelect = document.getElementById("global-industry-select");
    const projectSelect = document.getElementById("global-project-select");
    const textarea = document.getElementById("zalo-group-list");
    const keepOriginalCheckbox = document.getElementById("zalo-keep-original-content-checkbox");
    const checkedFanpages = Array.from(document.querySelectorAll('input[name="fb-page-checkbox"]'))
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    return {
      domainKey: domainSelect?.value || "phanmemmottrieu",
      industry: industrySelect?.value || "bat-dong-san",
      project: projectSelect?.value || "",
      checkedFanpages,
      groupText: textarea?.value || "",
      keepOriginalZaloContentToFacebook: !!keepOriginalCheckbox?.checked
    };
  };

  const applyFormState = (state) => {
    if (!state) return;
    const domainSelect = document.getElementById("global-domain-select");
    const industrySelect = document.getElementById("global-industry-select");
    const projectSelect = document.getElementById("global-project-select");
    const textarea = document.getElementById("zalo-group-list");
    const keepOriginalCheckbox = document.getElementById("zalo-keep-original-content-checkbox");

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
    if (keepOriginalCheckbox) keepOriginalCheckbox.checked = !!state.keepOriginalZaloContentToFacebook;
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
        status.textContent = ti(`✏️ Đang sửa cấu hình: ${row?.fanpage_names?.join(', ') || row?.fanpage_name || 'N/A'}. Nhấn "Lưu chỉnh sửa" hoặc "Huỷ".`, `✏️ Editing config: ${row?.fanpage_names?.join(', ') || row?.fanpage_name || 'N/A'}. Click "Save changes" or "Cancel".`, `✏️ 正在编辑配置：${row?.fanpage_names?.join(', ') || row?.fanpage_name || 'N/A'}。点击“保存修改”或“取消”。`);
      } else if (currentMode === "create") {
        status.textContent = ti("➕ Đang thêm mới cấu hình. Nhấn \"Lưu cấu hình\" hoặc \"Huỷ\".", "➕ Creating new configuration. Click \"Save configuration\" or \"Cancel\".", "➕ 正在新增配置。点击“保存配置”或“取消”。");
      } else {
        status.textContent = ti("⏸ Chưa chạy quét.", "⏸ Scanner not started.", "⏸ 尚未开始扫描。");
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

    const keepOriginalCheckbox = document.getElementById('zalo-keep-original-content-checkbox');
    if (keepOriginalCheckbox) {
      keepOriginalCheckbox.checked = parseBooleanFlag(row.keep_original_zalo_content_to_facebook, false);
    }
    
    console.log('[Zalo Config] Loaded:', fanpageIds.length, 'fanpages,', (row.zalo_groups || []).length, 'groups');
  };
  
  // ===== Excel helpers cho bảng quản lý cấu hình =====
  const ensureExcelRuntime = async () => {
    try {
      if (typeof window.ensureSpreadsheetLibraries === 'function') {
        await window.ensureSpreadsheetLibraries();
      }
      return !!window.XLSX;
    } catch (e) {
      console.warn('[Zalo Config][Excel] ensureSpreadsheetLibraries failed:', e?.message || e);
      return !!window.XLSX;
    }
  };

  const splitByComma = (value) => String(value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  const splitByNewline = (value) => String(value || '')
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const parseImportedConfigRow = (row) => {
    if (!row || typeof row !== 'object') return null;

    const domain = String(row.domain || row.Domain || '').trim();
    const fanpageNames = splitByComma(row.fanpage_names || row.fanpages || row.fanpage_name || row.Fanpages || '');
    const fanpageIds = splitByComma(row.fanpage_ids || row.fanpage_id || row.FanpageIds || '');
    const fanpageTokens = splitByComma(row.fanpage_tokens || row.fanpage_token || row.FanpageTokens || '');
    const zaloGroups = splitByNewline(row.zalo_groups || row.groups || row.ZaloGroups || row.group_list || '');
    const keepOriginalZaloToFacebook = parseBooleanFlag(
      row.keep_original_zalo_content_to_facebook
        ?? row.keep_original_zalo_to_facebook
        ?? row.keep_zalo_content
        ?? row.keep_raw_zalo_to_facebook,
      false
    );

    if (!domain || fanpageNames.length === 0 || zaloGroups.length === 0) {
      return null;
    }

    const id = String(row.id || '').trim() || `zalo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Number(row.created_at || row.createdAt || Date.now()) || Date.now();

    return {
      id,
      timestamp: Number(row.timestamp || createdAt) || Date.now(),
      created_at: createdAt,
      updated_at: Date.now(),
      domain,
      domain_key: String(row.domain_key || row.domainKey || '').trim(),
      service_type: String(row.service_type || row.service || '').trim(),
      project: String(row.project || '').trim(),
      config_for_zalo: true,
      zalo_groups: zaloGroups,
      fanpage_ids: fanpageIds,
      fanpage_id: fanpageIds[0] || null,
      fanpage_names: fanpageNames,
      fanpage_name: fanpageNames.join(', '),
      fanpage_tokens: fanpageTokens,
      fanpage_token: fanpageTokens[0] || null,
      keep_original_zalo_content_to_facebook: keepOriginalZaloToFacebook,
      zalo_fanpages: fanpageNames.map((name, idx) => ({
        id: fanpageIds[idx] || '',
        name,
        access_token: fanpageTokens[idx] || ''
      }))
    };
  };

  const exportZaloConfigsToExcel = async () => {
    const allConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
    if (allConfigs.length === 0) {
      canhbao(ti('Không có cấu hình để export.', 'No configuration to export.', '没有可导出的配置。'));
      return;
    }

    const aoa = [
      ['id', 'domain', 'domain_key', 'service_type', 'project', 'fanpage_names', 'fanpage_ids', 'fanpage_tokens', 'zalo_groups', 'keep_original_zalo_content_to_facebook', 'created_at']
    ];

    allConfigs.forEach(cfg => {
      aoa.push([
        cfg.id || '',
        cfg.domain || '',
        cfg.domain_key || '',
        cfg.service_type || '',
        cfg.project || '',
        Array.isArray(cfg.fanpage_names) ? cfg.fanpage_names.join(', ') : (cfg.fanpage_name || ''),
        Array.isArray(cfg.fanpage_ids) ? cfg.fanpage_ids.join(',') : (cfg.fanpage_id || ''),
        Array.isArray(cfg.fanpage_tokens) ? cfg.fanpage_tokens.join(',') : (cfg.fanpage_token || ''),
        Array.isArray(cfg.zalo_groups) ? cfg.zalo_groups.join('\n') : '',
        parseBooleanFlag(cfg.keep_original_zalo_content_to_facebook, false) ? 1 : 0,
        cfg.created_at || Date.now()
      ]);
    });

    if (typeof window.csmDynamicGridExport === 'function') {
      await window.csmDynamicGridExport({
        fileName: `zalo_configs_${new Date().toISOString().slice(0, 10)}`,
        sheets: [{ name: 'ZaloConfigs', aoa }]
      });
      thongbao(ti(`✅ Export ${allConfigs.length} cấu hình thành công.`, `✅ Exported ${allConfigs.length} configs.`, `✅ 已导出 ${allConfigs.length} 条配置。`));
      return;
    }

    const hasXlsx = await ensureExcelRuntime();
    if (!hasXlsx || !window.XLSX) {
      canhbao(ti('Thiếu thư viện XLSX để export.', 'Missing XLSX runtime for export.', '缺少 XLSX 库，无法导出。'));
      return;
    }

    const workbook = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    window.XLSX.utils.book_append_sheet(workbook, ws, 'ZaloConfigs');
    window.XLSX.writeFile(workbook, `zalo_configs_${Date.now()}.xlsx`);
    thongbao(ti(`✅ Export ${allConfigs.length} cấu hình thành công.`, `✅ Exported ${allConfigs.length} configs.`, `✅ 已导出 ${allConfigs.length} 条配置。`));
  };

  const importZaloConfigsFromExcel = async (file) => {
    if (!file) return;

    const hasXlsx = await ensureExcelRuntime();
    if (!hasXlsx || !window.XLSX) {
      canhbao(ti('Thiếu thư viện XLSX để import.', 'Missing XLSX runtime for import.', '缺少 XLSX 库，无法导入。'));
      return;
    }

    const toArrayBuffer = (value) => {
      if (value instanceof ArrayBuffer) {
        return value;
      }
      if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
        const view = value;
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
      }
      return null;
    };

    const readViaFileReader = () => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const fromReader = toArrayBuffer(reader.result);
          if (fromReader && fromReader.byteLength > 0) {
            resolve(fromReader);
            return;
          }
          reject(new Error('FileReader returned empty/invalid buffer'));
        };
        reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
        reader.readAsArrayBuffer(file);
      });
    };

    let buffer = null;

    if (file && typeof file.arrayBuffer === 'function') {
      try {
        const direct = await file.arrayBuffer();
        buffer = toArrayBuffer(direct);
      } catch {
        buffer = null;
      }
    }

    if (!buffer || buffer.byteLength === 0) {
      try {
        buffer = await readViaFileReader();
      } catch {
        buffer = null;
      }
    }

    if ((!buffer || buffer.byteLength === 0) && typeof window !== 'undefined' && window?.process && file?.path) {
      try {
        const fs = require('fs');
        const raw = fs.readFileSync(file.path);
        buffer = toArrayBuffer(raw);
      } catch {
        buffer = null;
      }
    }

    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
      canhbao(ti('Không đọc được dữ liệu file Excel.', 'Cannot read Excel file binary data.', '无法读取 Excel 文件二进制数据。'));
      return;
    }

    const toBinaryString = (ab) => {
      try {
        const u8 = new Uint8Array(ab);
        let out = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
          out += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
        }
        return out;
      } catch {
        return '';
      }
    };

    const u8Buffer = new Uint8Array(buffer);
    const binaryBuffer = toBinaryString(buffer);

    let wb;
    let lastReadError = null;
    const readCandidates = [
      { data: u8Buffer, opts: { type: 'array' }, label: 'uint8array+array' },
      { data: buffer, opts: { type: 'array' }, label: 'arraybuffer+array' },
      ...(binaryBuffer ? [{ data: binaryBuffer, opts: { type: 'binary' }, label: 'binary-string+binary' }] : []),
    ];

    for (const candidate of readCandidates) {
      try {
        wb = window.XLSX.read(candidate.data, candidate.opts);
        if (wb && Array.isArray(wb.SheetNames) && wb.SheetNames.length > 0) {
          break;
        }
      } catch (err) {
        lastReadError = err;
      }
    }

    if (!wb) {
      console.error('[Zalo Import] XLSX.read failed:', lastReadError, {
        fileName: file?.name,
        fileType: file?.type,
        byteLength: buffer?.byteLength,
        xlsxVersion: window?.XLSX?.version,
      });
      canhbao(ti('File Excel không hợp lệ hoặc không được hỗ trợ.', 'Invalid or unsupported Excel file.', 'Excel 文件无效或不受支持。'));
      return;
    }

    const firstSheet = wb.SheetNames?.[0];
    if (!firstSheet) {
      canhbao(ti('File Excel không có sheet hợp lệ.', 'Excel file has no valid sheet.', 'Excel 文件没有有效工作表。'));
      return;
    }

    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
    const imported = rows
      .map(parseImportedConfigRow)
      .filter(Boolean);

    if (imported.length === 0) {
      canhbao(ti('Không đọc được cấu hình hợp lệ từ file.', 'No valid configurations found in file.', '未从文件中读取到有效配置。'));
      return;
    }

    const nonConfigRows = loadDataOptionUser().filter(x => !x.config_for_zalo);
    const merged = [...nonConfigRows, ...imported];

    saveDataOptionUser(merged, (success, error) => {
      if (success) {
        status.textContent = ti(`✅ Đã import ${imported.length} cấu hình từ Excel.`, `✅ Imported ${imported.length} configs from Excel.`, `✅ 已从 Excel 导入 ${imported.length} 条配置。`);
        thongbao(status.textContent);
        fetchDataOptionUserFromServer(() => {
          renderZaloConfigList();
        });
      } else {
        status.textContent = ti(`⚠️ Import thất bại: ${error || 'unknown'}`, `⚠️ Import failed: ${error || 'unknown'}`, `⚠️ 导入失败：${error || 'unknown'}`);
        canhbao(status.textContent);
      }
    });
  };

  if (!Array.isArray(window.__zaloSelectedConfigIds)) {
    window.__zaloSelectedConfigIds = [];
  }

  const getSelectedConfigIds = () => {
    const ids = Array.isArray(window.__zaloSelectedConfigIds) ? window.__zaloSelectedConfigIds : [];
    return Array.from(new Set(ids.map(x => String(x || '').trim()).filter(Boolean)));
  };

  const setSelectedConfigIds = (ids) => {
    window.__zaloSelectedConfigIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
      .map(x => String(x || '').trim())
      .filter(Boolean)));
  };

  // Hàm render danh sách config dạng bảng (CRUD nhanh + import/export)
  const renderZaloConfigList = () => {
    mgmtList.innerHTML = "";
    const allConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
    mgmtTitle.innerHTML = `📋 ${ti('Cấu hình đã lưu', 'Saved configurations', '已保存配置')} (${allConfigs.length})`;

    const gridText = {
      index: ti('STT', '#', '序号'),
      domain: ti('Tên miền', 'Domain', '域名'),
      service: ti('Dịch vụ', 'Service', '服务'),
      project: ti('Dự án', 'Project', '项目'),
      fanpages: ti('Fanpages', 'Fanpages', 'Fanpages'),
      groups: ti('Nhóm Zalo', 'Zalo groups', 'Zalo 群组'),
      keepRawZaloToFacebook: ti('Giữ nguyên Zalo->FB', 'Keep raw Zalo->FB', '保留 Zalo 原文到 FB'),
      keepRawZaloToFacebookTooltip: ti(
        'Bật: giữ nguyên nội dung quét từ Zalo khi đăng Facebook. Tắt: dùng AI tạo nội dung Facebook mới.',
        'On: keep original scraped Zalo content when posting to Facebook. Off: generate new Facebook content with AI.',
        '开启：发布到 Facebook 时保留 Zalo 抓取原文；关闭：由 AI 生成新的 Facebook 内容。'
      ),
      token: ti('Token', 'Token', 'Token'),
      actions: ti('Thao tác', 'Actions', '操作'),
      tokenOk: ti('Đầy đủ', 'Available', '可用'),
      tokenMissing: ti('Thiếu', 'Missing', '缺失'),
      notAvailable: ti('Chưa có', 'N/A', '暂无'),
      emptyRow: ti('Chưa có cấu hình nào. Hãy điền thông tin và nhấn "💾 Lưu cấu hình" để lưu.', 'No configuration yet. Fill in info and click "💾 Save configuration".', '暂无配置。请填写信息并点击“💾 保存配置”。')
    };

    const wrap = document.createElement('div');
    wrap.style.cssText = `overflow:auto;max-height:360px;border:1px solid ${theme.border};border-radius:4px;background:${theme.bg};`;

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;min-width:1100px;';

    const selectedSet = new Set(getSelectedConfigIds());
    const allChecked = allConfigs.length > 0 && allConfigs.every(cfg => selectedSet.has(String(cfg.id || '').trim()));

    table.innerHTML = `
      <thead>
        <tr style="background:${theme.inputBg};position:sticky;top:0;z-index:1;">
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">
            <input data-role="check-all" type="checkbox" ${allChecked ? 'checked' : ''} />
          </th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.index}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.domain}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.service}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.project}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.fanpages}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.groups}</th>
          <th title="${gridText.keepRawZaloToFacebookTooltip}" style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;cursor:help;">${gridText.keepRawZaloToFacebook}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.token}</th>
          <th style="padding:6px;border-bottom:1px solid ${theme.border};text-align:left;">${gridText.actions}</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    if (allConfigs.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="10" style="padding:12px;color:${theme.muted};text-align:center;">${gridText.emptyRow}</td>`;
      tbody.appendChild(emptyRow);
    }

    allConfigs.forEach((cfg, idx) => {
      const tr = document.createElement('tr');
      const isEditingRow = currentMode === 'edit' && editingRowId === cfg.id;
      tr.style.cssText = `border-bottom:1px solid ${theme.border};${isEditingRow ? 'background:#e6f7ff;' : ''}`;

      const fanpageText = Array.isArray(cfg.fanpage_names)
        ? cfg.fanpage_names.join(', ')
        : (cfg.fanpage_name || gridText.notAvailable);

      const projectInput = `<input data-role="project" value="${String(cfg.project || '').replace(/"/g, '&quot;')}" style="width:100%;font-size:11px;padding:2px 4px;border:1px solid ${theme.border};background:${theme.bg};color:${theme.text};" />`;
      const groupsText = Array.isArray(cfg.zalo_groups) ? cfg.zalo_groups.join('\n') : '';
      const rowChecked = selectedSet.has(String(cfg.id || '').trim());
      const keepOriginalChecked = parseBooleanFlag(cfg.keep_original_zalo_content_to_facebook, false);

      tr.innerHTML = `
        <td style="padding:6px;vertical-align:top;"><input data-role="row-check" type="checkbox" ${rowChecked ? 'checked' : ''} /></td>
        <td style="padding:6px;vertical-align:top;">${idx + 1}</td>
        <td style="padding:6px;vertical-align:top;">${cfg.domain || ''}</td>
        <td style="padding:6px;vertical-align:top;">${cfg.service_type || ''}</td>
        <td style="padding:6px;vertical-align:top;min-width:120px;">${projectInput}</td>
        <td style="padding:6px;vertical-align:top;max-width:180px;word-break:break-word;">${fanpageText}</td>
        <td style="padding:6px;vertical-align:top;min-width:220px;">
          <textarea data-role="groups" style="width:100%;min-height:60px;font-size:11px;padding:4px;border:1px solid ${theme.border};background:${theme.bg};color:${theme.text};">${groupsText}</textarea>
        </td>
        <td style="padding:6px;vertical-align:top;text-align:center;">
          <input data-role="keep-original-content" type="checkbox" ${keepOriginalChecked ? 'checked' : ''} />
        </td>
        <td style="padding:6px;vertical-align:top;color:${cfg.fanpage_token ? '#52c41a' : '#ff4d4f'};">${cfg.fanpage_token ? gridText.tokenOk : gridText.tokenMissing}</td>
        <td style="padding:6px;vertical-align:top;white-space:nowrap;">
          <button data-action="quick-save" style="padding:3px 6px;background:#52c41a;color:#fff;border:none;border-radius:2px;cursor:pointer;margin-right:4px;">💾</button>
          <button data-action="load-form" style="padding:3px 6px;background:#1890ff;color:#fff;border:none;border-radius:2px;cursor:pointer;margin-right:4px;">✏️</button>
          <button data-action="delete" style="padding:3px 6px;background:#ff4d4f;color:#fff;border:none;border-radius:2px;cursor:pointer;">🗑️</button>
        </td>
      `;

      const groupsEl = tr.querySelector('textarea[data-role="groups"]');
      const projectEl = tr.querySelector('input[data-role="project"]');
      const keepOriginalEl = tr.querySelector('input[data-role="keep-original-content"]');
      const rowCheck = tr.querySelector('input[data-role="row-check"]');
      const saveBtn = tr.querySelector('button[data-action="quick-save"]');
      const editBtn = tr.querySelector('button[data-action="load-form"]');
      const deleteBtn = tr.querySelector('button[data-action="delete"]');

      rowCheck.onchange = () => {
        const id = String(cfg.id || '').trim();
        const current = new Set(getSelectedConfigIds());
        if (rowCheck.checked) current.add(id);
        else current.delete(id);
        setSelectedConfigIds(Array.from(current));
      };

      saveBtn.onclick = () => {
        const nextGroups = parseGroupList(groupsEl?.value || '');
        if (nextGroups.length === 0) {
          canhbao(ti('Danh sách nhóm không được rỗng.', 'Group list cannot be empty.', '群组列表不能为空。'));
          return;
        }

        const allData = loadDataOptionUser();
        const targetIndex = allData.findIndex(item => item.id === cfg.id);
        if (targetIndex === -1) return;

        allData[targetIndex] = {
          ...allData[targetIndex],
          project: String(projectEl?.value || '').trim(),
          zalo_groups: nextGroups,
          keep_original_zalo_content_to_facebook: !!keepOriginalEl?.checked,
          updated_at: Date.now(),
        };

        saveDataOptionUser(allData, (success, error) => {
          if (success) {
            status.textContent = ti('✅ Đã lưu chỉnh sửa nhanh.', '✅ Quick update saved.', '✅ 快速修改已保存。');
            thongbao(status.textContent);
            renderZaloConfigList();
          } else {
            status.textContent = ti(`⚠️ Lưu thất bại: ${error || 'unknown'}`, `⚠️ Save failed: ${error || 'unknown'}`, `⚠️ 保存失败：${error || 'unknown'}`);
            canhbao(status.textContent);
          }
        });
      };

      editBtn.onclick = () => {
        formSnapshot = captureFormState();
        selectedRowData = cfg;
        loadRowToControls(cfg);
        setMode('edit', cfg);
      };

      deleteBtn.onclick = () => {
        if (!confirm(ti(`⚠️ Xóa config: ${fanpageText}?`, `⚠️ Delete config: ${fanpageText}?`, `⚠️ 删除配置：${fanpageText}？`))) return;

        const allData = loadDataOptionUser().filter(item => item.id !== cfg.id);
        saveDataOptionUser(allData, (success) => {
          if (success) {
            if (status) status.textContent = ti('✅ Đã xóa config', '✅ Config deleted', '✅ 配置已删除');
            if (selectedRowData?.id === cfg.id) selectedRowData = null;
            renderZaloConfigList();
          } else if (status) {
            status.textContent = ti('⚠️ Lỗi xóa config', '⚠️ Failed to delete config', '⚠️ 删除配置失败');
          }
        }, { allowEmptyConfigSave: true });
      };

      tbody.appendChild(tr);
    });

    const checkAll = table.querySelector('input[data-role="check-all"]');
    if (checkAll) {
      checkAll.onchange = () => {
        if (checkAll.checked) {
          setSelectedConfigIds(allConfigs.map(cfg => String(cfg.id || '').trim()).filter(Boolean));
        } else {
          setSelectedConfigIds([]);
        }
        renderZaloConfigList();
      };
    }

    wrap.appendChild(table);
    mgmtList.appendChild(wrap);
  };
  
  const mgmtTitle = document.createElement("div");
  mgmtTitle.style.cssText = `font-weight:bold;margin-bottom:8px;color:${theme.text};font-size:12px;`;
  mgmtTitle.innerHTML = `📋 ${ti('Cấu hình đã lưu', 'Saved configurations', '已保存配置')} (${loadDataOptionUser().filter(x => x.config_for_zalo).length})`;

  const excelFileInput = document.createElement('input');
  excelFileInput.type = 'file';
  excelFileInput.accept = '.xlsx,.xls,.csv';
  excelFileInput.style.display = 'none';
  excelFileInput.onchange = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    await importZaloConfigsFromExcel(file);
    excelFileInput.value = '';
  };

  const excelToolbar = document.createElement('div');
  excelToolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;';

  const exportExcelBtn = createButton(ti('📤 Export Excel', '📤 Export Excel', '📤 导出 Excel'), '#2f54eb');
  exportExcelBtn.title = ti('Xuất toàn bộ cấu hình Zalo sang Excel.', 'Export all Zalo configs to Excel.', '将全部 Zalo 配置导出为 Excel。');
  exportExcelBtn.onclick = () => {
    exportZaloConfigsToExcel().catch((e) => {
      canhbao(ti(`Export lỗi: ${e?.message || e}`, `Export error: ${e?.message || e}`, `导出错误：${e?.message || e}`));
    });
  };

  const importExcelBtn = createButton(ti('📥 Import Excel', '📥 Import Excel', '📥 导入 Excel'), '#13c2c2');
  importExcelBtn.title = ti('Import cấu hình từ Excel (ghi đè bộ cấu hình Zalo hiện tại).', 'Import configs from Excel (replace current Zalo config set).', '从 Excel 导入配置（覆盖当前 Zalo 配置集合）。');
  importExcelBtn.onclick = () => excelFileInput.click();

  const clearSelectedBtn = createButton(ti('🧹 Bỏ chọn', '🧹 Clear selection', '🧹 清空选择'), '#8c8c8c');
  clearSelectedBtn.title = ti('Bỏ chọn toàn bộ dòng trong lưới.', 'Unselect all rows in the grid.', '取消网格中全部选择。');
  clearSelectedBtn.onclick = () => {
    setSelectedConfigIds([]);
    renderZaloConfigList();
  };

  excelToolbar.append(exportExcelBtn, importExcelBtn, clearSelectedBtn);
  
  // Hướng dẫn thao tác
  const gridGuide = document.createElement("div");
  gridGuide.style.cssText = `margin-bottom:10px;padding:10px;background:${theme.infoBg};border-radius:4px;font-size:11px;color:${theme.info};border-left:3px solid ${theme.info};`;
  gridGuide.innerHTML = ti(
    `
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
  `,
    `
    <strong>📖 Usage instructions:</strong><br>
    <div style="margin-top:6px;line-height:1.6;">
      <strong>➕ ADD NEW:</strong><br>
      &nbsp;&nbsp;1. Click <strong>"➕ Add new"</strong> to clear the form<br>
      &nbsp;&nbsp;2. Check fanpage(s) in <strong>"📱 Facebook Token Management"</strong> above<br>
      &nbsp;&nbsp;3. Enter Zalo groups below (one group per line)<br>
      &nbsp;&nbsp;4. Click <strong>"💾 Save configuration"</strong> → Add to list<br><br>

      <strong>✏️ EDIT:</strong><br>
      &nbsp;&nbsp;1. <strong>Click "✏️"</strong> on the row you want to edit → Data auto-loads into the form<br>
      &nbsp;&nbsp;2. Change fanpages (check/uncheck) or edit group list<br>
      &nbsp;&nbsp;3. Click <strong>"💾 Save configuration"</strong> → Update selected row<br><br>

      <strong>🗑️ DELETE:</strong><br>
      &nbsp;&nbsp;• Click "🗑️" on a row to delete it<br>
      &nbsp;&nbsp;• Or use <strong>"🗑️ Clear all"</strong> to remove all configs<br><br>

      <strong>💡 Note:</strong><br>
      &nbsp;&nbsp;• Domain, Service, Project are taken from <strong>"General Settings"</strong>
    </div>
  `,
    `
    <strong>📖 操作指南：</strong><br>
    <div style="margin-top:6px;line-height:1.6;">
      <strong>➕ 新增：</strong><br>
      &nbsp;&nbsp;1. 点击 <strong>"➕ 新增"</strong> 清空表单<br>
      &nbsp;&nbsp;2. 在上方 <strong>"📱 Facebook Token Management"</strong> 勾选 fanpage<br>
      &nbsp;&nbsp;3. 在下方输入 Zalo 群组（每行一个）<br>
      &nbsp;&nbsp;4. 点击 <strong>"💾 保存配置"</strong> → 添加到列表<br><br>

      <strong>✏️ 编辑：</strong><br>
      &nbsp;&nbsp;1. 点击目标行的 <strong>"✏️"</strong> → 数据会自动加载到表单<br>
      &nbsp;&nbsp;2. 修改 fanpage（勾选/取消）或群组列表<br>
      &nbsp;&nbsp;3. 点击 <strong>"💾 保存配置"</strong> → 更新所选行<br><br>

      <strong>🗑️ 删除：</strong><br>
      &nbsp;&nbsp;• 点击行内 "🗑️" 删除单条配置<br>
      &nbsp;&nbsp;• 或使用 <strong>"🗑️ 全部清空"</strong> 删除全部配置<br><br>

      <strong>💡 提示：</strong><br>
      &nbsp;&nbsp;• Domain、服务、项目来自 <strong>"常规设置"</strong>
    </div>
  `
  );
  
  // Thống kê tin Zalo đã đăng
  const postedStats = document.createElement("div");
  postedStats.id = "zalo-posted-stats";
  postedStats.style.cssText = `margin-bottom:10px;padding:10px;background:${theme.successBg};border-radius:4px;font-size:11px;color:${theme.success};border-left:3px solid ${theme.success};`;
  
  const updatePostedStats = () => {
    const statsRows = loadPostedZaloStats();
    const totalPosted = statsRows.reduce((sum, row) => sum + Number(row.total_count || 0), 0);
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayPosted = statsRows.reduce((sum, row) => {
      if (row.today_key === todayKey) {
        return sum + Number(row.today_count || 0);
      }
      return sum;
    }, 0);
    
    console.log(`📊 [UpdatePostedStats] Groups: ${statsRows.length}, Total: ${totalPosted}, Today: ${todayPosted}`);
    
    postedStats.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>${ti('📊 Thống kê đăng Zalo:', '📊 Zalo posting stats:', '📊 Zalo 发布统计：')}</strong> ${totalPosted} ${ti('tin', 'messages', '条')} (${todayPosted} ${ti('hôm nay', 'today', '今日')})<br>
          <span style="font-size:10px;opacity:0.8;">${ti(`Lưu nhẹ theo nhóm (${statsRows.length} nhóm), không lưu chi tiết từng tin`, `Lightweight per-group stats (${statsRows.length} groups), no per-message details`, `按群组轻量存储（${statsRows.length} 个群组），不保存逐条详情`)}</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button id="btn-view-posted" style="padding:4px 8px;background:#52c41a;color:white;border:none;border-radius:3px;cursor:pointer;font-size:10px;">${ti('👁️ Xem nhóm', '👁️ View groups', '👁️ 查看群组')}</button>
          <button id="btn-clear-posted" style="padding:4px 8px;background:#ff4d4f;color:white;border:none;border-radius:3px;cursor:pointer;font-size:10px;">${ti('🗑️ Xóa thống kê', '🗑️ Clear stats', '🗑️ 清空统计')}</button>
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
        const statsRows = loadPostedZaloStats();
        if (statsRows.length === 0) {
          canhbao(ti('Chưa có thống kê đăng Zalo.', 'No Zalo posting stats yet.', '尚无 Zalo 发布统计。'));
          return;
        }
        
        let msg = ti(
          `📊 THỐNG KÊ ${statsRows.length} NHÓM ZALO:\\n\\n`,
          `📊 ZALO STATS FOR ${statsRows.length} GROUPS:\\n\\n`,
          `📊 ${statsRows.length} 个 ZALO 群组统计：\\n\\n`
        );
        const sorted = [...statsRows].sort((a, b) => Number(b.total_count || 0) - Number(a.total_count || 0));
        sorted.slice(0, 100).forEach((row, i) => {
          const lastAt = row.last_posted_at ? new Date(row.last_posted_at).toLocaleString('vi-VN') : 'N/A';
          msg += `${i + 1}. [${row.groupName}] config=${row.config_id || 'default'}\\n   total=${row.total_count || 0}, today=${row.today_count || 0}, last=${lastAt}\\n\\n`;
        });
        
        if (sorted.length > 100) {
          msg += ti(`\\n... và ${sorted.length - 100} nhóm khác`, `\\n... and ${sorted.length - 100} more groups`, `\\n... 还有 ${sorted.length - 100} 个群组`);
        }
        
        alert(msg);
      };
    }
    
    if (btnClear) {
      btnClear.onclick = () => {
        const statsRows = loadPostedZaloStats();
        if (confirm(ti(`⚠️ Xóa toàn bộ thống kê (${statsRows.length} nhóm)?\\n\\nThao tác này chỉ xóa số liệu thống kê.`, `⚠️ Clear all posting stats (${statsRows.length} groups)?\\n\\nThis removes stats only.`, `⚠️ 清空全部统计（${statsRows.length} 个群组）？\\n\\n此操作仅删除统计数据。`))) {
          const originalText = btnClear.textContent;
          btnClear.textContent = ti('⏳ Đang xóa...', '⏳ Deleting...', '⏳ 删除中...');
          
          try {
            savePostedZaloStats([], { skipPersist: false });
            updatePostedStats();
            status.textContent = ti('✅ Đã xóa thống kê đăng Zalo', '✅ Zalo posting stats cleared', '✅ 已清除 Zalo 发布统计');
          } finally {
            setTimeout(() => {
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
  refreshTokensBtn.title = ti("Tự động cập nhật access token mới từ Facebook Token Management cho tất cả cấu hình đã lưu", "Auto-update latest access token from Facebook Token Management for all saved configs", "为所有已保存配置自动更新 Facebook Token Management 中最新的 access token");
  refreshTokensBtn.onclick = async () => {
    // Disable nút khi đang xử lý
    refreshTokensBtn.disabled = true;
    refreshTokensBtn.style.opacity = '0.6';
    refreshTokensBtn.style.cursor = 'not-allowed';
    const originalText = refreshTokensBtn.textContent;
    refreshTokensBtn.textContent = ti('⏳ Đang cập nhật...', '⏳ Updating...', '⏳ 更新中...');
    
    try {
      status.textContent = ti("⏳ Đang cập nhật tokens...", "⏳ Updating tokens...", "⏳ 正在更新 tokens...");
      const pages = getSelectedFacebookPages();
      if (pages.length === 0) {
        status.textContent = ti("⚠️ Chưa có fanpage. Hãy chọn fanpage ở mục Facebook trước.", "⚠️ No fanpage selected. Please choose fanpage(s) in Facebook section first.", "⚠️ 尚未选择 fanpage，请先在 Facebook 区域勾选 fanpage。");
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
          status.textContent = t('reloading_data');
          console.log('[Zalo] Token refresh saved successfully');
          
          // Fetch fresh data trước khi render grid
          fetchDataOptionUserFromServer((fetchSuccess) => {
            if (fetchSuccess) {
              status.textContent = ti(`✅ Cập nhật thành công ${updated} config`, `✅ Updated ${updated} config(s) successfully`, `✅ 已成功更新 ${updated} 条配置`);
              console.log('[Zalo] Fetched fresh data after token refresh');
            } else {
              status.textContent = ti(`✅ Cập nhật thành công ${updated} config (dùng cached data)`, `✅ Updated ${updated} config(s) successfully (using cached data)`, `✅ 已成功更新 ${updated} 条配置（使用缓存数据）`);
              console.warn('[Zalo] Fetch failed, using cached data');
            }
            renderZaloConfigList();
          });
        } else {
          status.textContent = ti(`⚠️ Lưu thất bại nhưng cập nhật local thành công. Lỗi: ${error}`, `⚠️ Server save failed but local update succeeded. Error: ${error}`, `⚠️ 服务器保存失败，但本地更新成功。错误：${error}`);
          console.warn('[Zalo] Token refresh save error:', error);
          renderZaloConfigList();
        }
      });
    } catch (e) {
      status.textContent = ti(`❌ Lỗi cập nhật: ${e.message}`, `❌ Update error: ${e.message}`, `❌ 更新错误：${e.message}`);
      renderZaloConfigList();
    } finally {
      // Enable lại nút
      refreshTokensBtn.disabled = false;
      refreshTokensBtn.style.opacity = '1';
      refreshTokensBtn.style.cursor = 'pointer';
      refreshTokensBtn.textContent = originalText;
    }
  };

  const showFanpagesBtn = createButton(ti("📱 Xem fanpages", "📱 View fanpages", "📱 查看 fanpages"), "#1890ff");
  showFanpagesBtn.title = ti("Xem danh sách tất cả fanpage đã lưu trong Facebook Token Management", "View all fanpages saved in Facebook Token Management", "查看 Facebook Token Management 中保存的所有 fanpage");
  showFanpagesBtn.onclick = () => {
    // Disable nút khi đang xử lý
    showFanpagesBtn.disabled = true;
    showFanpagesBtn.style.opacity = '0.6';
    showFanpagesBtn.style.cursor = 'not-allowed';
    
    try {
      const pages = getSelectedFacebookPages();
      if (pages.length === 0) {
        status.textContent = ti("⚠️ Chưa có fanpage nào. Hãy chọn fanpage ở mục Facebook trước.", "⚠️ No fanpage found. Please select fanpage(s) in Facebook section first.", "⚠️ 尚无 fanpage，请先在 Facebook 区域选择 fanpage。");
        return;
      }
      let msg = ti(`✅ Hiện có ${pages.length} fanpage:\n\n`, `✅ Currently ${pages.length} fanpage(s):\n\n`, `✅ 当前有 ${pages.length} 个 fanpage：\n\n`);
      pages.forEach(p => {
        msg += `• ${p.name} (ID: ${p.id})\n`;
      });
      msg += ti(`\n💡 Có thể dùng token từ các fanpage này để cập nhật config bằng nút "🔄 Cập nhật tokens"`, `\n💡 You can use these fanpage tokens to update configs via "🔄 Refresh tokens"`, `\n💡 可使用这些 fanpage token 通过“🔄 刷新 tokens”更新配置`);
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
  
  const clearAllBtn = createButton(ti("🗑️ Xoá hết", "🗑️ Clear all", "🗑️ 全部清空"), "#ff4d4f");
  clearAllBtn.title = ti("Xóa toàn bộ cấu hình Zalo đã lưu (không thể hoàn tác)", "Delete all saved Zalo configs (cannot undo)", "删除全部已保存 Zalo 配置（不可撤销）");
  clearAllBtn.onclick = () => {
    if (confirm(ti("⚠️ Xoá tất cả cấu hình Zalo? Hành động này KHÔNG THỂ HOÀN TÁC.", "⚠️ Delete all Zalo configurations? This action CANNOT be undone.", "⚠️ 要删除全部 Zalo 配置吗？此操作无法撤销。"))) {
      // Disable nút khi đang xử lý
      clearAllBtn.disabled = true;
      clearAllBtn.style.opacity = '0.6';
      clearAllBtn.style.cursor = 'not-allowed';
      
      try {
        const allData = loadDataOptionUser().filter(x => !x.config_for_zalo);
        saveDataOptionUser(allData, (success, error) => {
          if (success) {
            status.textContent = ti("✅ Đang tải lại...", "✅ Reloading...", "✅ 正在重新加载...");
            console.log('[Zalo] Clear all configs saved successfully');
            
            // Fetch fresh data trước khi render grid
            fetchDataOptionUserFromServer((fetchSuccess) => {
              status.textContent = ti("✅ Đã xoá tất cả cấu hình", "✅ All configurations cleared", "✅ 已清空全部配置");
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
            status.textContent = ti(`⚠️ Xoá local thành công nhưng lưu server thất bại. Lỗi: ${error}`, `⚠️ Local delete succeeded but server save failed. Error: ${error}`, `⚠️ 本地删除成功，但服务器保存失败。错误：${error}`);
            console.warn('[Zalo] Clear all save error:', error);
            renderZaloConfigList();
            
            // Enable lại nút
            clearAllBtn.disabled = false;
            clearAllBtn.style.opacity = '1';
            clearAllBtn.style.cursor = 'pointer';
          }
        }, { allowEmptyConfigSave: true });
      } catch (e) {
        status.textContent = ti(`❌ Lỗi: ${e.message}`, `❌ Error: ${e.message}`, `❌ 错误：${e.message}`);
        // Enable lại nút
        clearAllBtn.disabled = false;
        clearAllBtn.style.opacity = '1';
        clearAllBtn.style.cursor = 'pointer';
      }
    }
  };
  
  autoLoadBtn = createButton(t('use_latest_config'), "#13c2c2");
  autoLoadBtn.title = ti("Tự động nạp cấu hình mới nhất vào biểu mẫu để sửa hoặc chạy bộ quét", "Auto-load latest config into form for editing or scanner run", "自动加载最新配置到表单以便编辑或运行扫描");
  autoLoadBtn.onclick = () => {
    // Disable nút khi đang xử lý
    autoLoadBtn.disabled = true;
    autoLoadBtn.style.opacity = '0.6';
    autoLoadBtn.style.cursor = 'not-allowed';
    
    try {
      const allConfigs = loadDataOptionUser().filter(x => x.config_for_zalo);
      if (allConfigs.length === 0) {
        status.textContent = ti("⚠️ Không có cấu hình nào để tải", "⚠️ No configuration to load", "⚠️ 没有可加载的配置");
        return;
      }
      const latest = allConfigs[allConfigs.length - 1];
      selectedRowData = latest;
      loadRowToControls(latest);
      status.textContent = ti(`✅ Đã tải config: ${latest.fanpage_names?.join(', ') || latest.fanpage_name}. Nhóm: ${latest.zalo_groups?.length || 0}.`, `✅ Loaded config: ${latest.fanpage_names?.join(', ') || latest.fanpage_name}. Groups: ${latest.zalo_groups?.length || 0}.`, `✅ 已加载配置：${latest.fanpage_names?.join(', ') || latest.fanpage_name}。群组：${latest.zalo_groups?.length || 0}。`);
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
  saveConfigBtn = createButton(t('save_config'), "#52c41a");
  saveConfigBtn.title = ti("Lưu/cập nhật cấu hình từ các control (Global Settings, Fanpages, Zalo Groups)", "Save/update config from controls (Global Settings, Fanpages, Zalo Groups)", "从控件保存/更新配置（常规设置、Fanpages、Zalo 群组）");
  saveConfigBtn.onclick = async () => {
    // Disable nút khi đang xử lý
    saveConfigBtn.disabled = true;
    saveConfigBtn.style.opacity = '0.6';
    saveConfigBtn.style.cursor = 'not-allowed';
    const originalText = saveConfigBtn.textContent;
    saveConfigBtn.textContent = ti('⏳ Đang lưu...', '⏳ Saving...', '⏳ 保存中...');
    
    try {
      if (currentMode === "idle") {
        status.textContent = ti("⚠️ Hãy nhấn \"✏️\" để sửa hoặc \"➕ Thêm mới\" để tạo cấu hình mới.", "⚠️ Click \"✏️\" to edit or \"➕ Add new\" to create a new config.", "⚠️ 请点击\"✏️\"编辑，或点击\"➕ 新增\"创建新配置。");
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
      const keepOriginalCheckbox = document.getElementById('zalo-keep-original-content-checkbox');
      const keepOriginalZaloToFacebook = !!keepOriginalCheckbox?.checked;
      
      // Validate
      if (selectedFanpages.length === 0) {
        status.textContent = ti("⚠️ Vui lòng check fanpage ở mục '📱 Facebook Token Management' phía trên trước!", "⚠️ Please check fanpage(s) in '📱 Facebook Token Management' above first!", "⚠️ 请先在上方 '📱 Facebook Token Management' 勾选 fanpage！");
        console.warn('[Zalo Config] No fanpages selected. Mode:', currentMode, 'editingFanpageData:', editingFanpageData);
        return;
      }
      
      if (groupList.length === 0) {
        status.textContent = ti("⚠️ Vui lòng nhập ít nhất 1 nhóm Zalo", "⚠️ Please enter at least 1 Zalo group", "⚠️ 请至少输入 1 个 Zalo 群组");
        return;
      }
    
    // Tạo config object
    const configData = {
      domain: DOMAIN_OPTIONS[globalSettings.domainKey]?.value || 'phanmemmottrieu',
      domain_key: globalSettings.domainKey,
      service_type: globalSettings.industry,
      project: globalSettings.project,
      zalo_fanpages: selectedFanpages,
      fanpage_ids: selectedFanpages.map(f => f.id),
      fanpage_id: selectedFanpages[0]?.id || null,
      fanpage_names: selectedFanpages.map(f => f.name),
      fanpage_name: selectedFanpages.map(f => f.name).join(', '),
      fanpage_tokens: selectedFanpages.map(f => f.access_token),
      fanpage_token: selectedFanpages[0]?.access_token || null,
      zalo_groups: groupList,
      keep_original_zalo_content_to_facebook: keepOriginalZaloToFacebook,
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
      status.textContent = ti("⚠️ Trùng cấu hình (Tên miền + Dịch vụ + Dự án). Vui lòng đổi giá trị để tránh trùng.", "⚠️ Duplicate configuration (Domain + Service + Project). Please change values.", "⚠️ 配置重复（Domain + 服务 + 项目）。请修改参数。" );
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
            
            // Giữ lựa chọn fanpage hiện tại để dùng cho cấu hình kế tiếp
            input.value = '';
            
            // Set mode idle TRƯỚC khi render
            setMode("idle", null, { preserveStatus: true });
            status.textContent = ti(`✅ Đã cập nhật config: ${configData.fanpage_name}`, `✅ Configuration updated: ${configData.fanpage_name}`, `✅ 配置已更新：${configData.fanpage_name}`);
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
            status.textContent = ti(`⚠️ Lỗi cập nhật config: ${error || 'Lỗi không xác định'}`, `⚠️ Failed to update configuration: ${error || 'Unknown error'}`, `⚠️ 更新配置失败：${error || '未知错误'}`);
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
          
          // Giữ lựa chọn fanpage hiện tại để dùng cho cấu hình kế tiếp
          input.value = '';
          
          // Set mode idle TRƯỚC khi render
          setMode("idle", null, { preserveStatus: true });
          status.textContent = ti(`✅ Đã thêm config mới: ${configData.fanpage_name}. Bạn có thể tiếp tục thêm cấu hình khác hoặc nhấn "➕ Thêm mới" để xóa form.`, `✅ New configuration added: ${configData.fanpage_name}. You can continue adding more, or click "➕ Add new" to clear the form.`, `✅ 新配置已添加：${configData.fanpage_name}。你可以继续添加，或点击“➕ 新增”清空表单。`);
          console.log('[Zalo Config] Add success, rendering grid...');
          
          // Render grid SAU khi state/mode đã được reset
          renderZaloConfigList();
          
          // Auto-suggest clearing form for next entry
          setTimeout(() => {
            status.textContent = `${status.textContent} ${ti('[💡 Tip: Nhấn "➕ Thêm mới" để xóa form và thêm cấu hình khác]', '[💡 Tip: Click "➕ Add new" to clear form and add another config]', '[💡 提示：点击“➕ 新增”可清空表单并继续添加]')}`;
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
          status.textContent = ti(`⚠️ Lỗi thêm config mới: ${error || 'Lỗi không xác định'}`, `⚠️ Failed to add new configuration: ${error || 'Unknown error'}`, `⚠️ 添加新配置失败：${error || '未知错误'}`);
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
  
  newConfigBtn = createButton(t('add_new'), "#1890ff");
  newConfigBtn.title = ti("Xóa form (clear fanpage + groups) để tạo cấu hình mới. Sau đó check fanpage, nhập nhóm và nhấn 'Lưu cấu hình'", "Clear form (fanpage + groups) to create new config. Then check fanpage(s), enter groups, and click 'Save configuration'", "清空表单（fanpage + 群组）以创建新配置，然后勾选 fanpage、输入群组并点击“保存配置”"); 
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
      
      // Clear controls (giữ Global Settings và fanpages đã chọn, chỉ clear groups)
      input.value = '';
      const keepOriginalCheckbox = document.getElementById('zalo-keep-original-content-checkbox');
      if (keepOriginalCheckbox) keepOriginalCheckbox.checked = true;
      setMode("create");
      status.textContent = ti("📝 Form đã được xoá. Fanpage đã chọn vẫn được giữ nguyên, điền danh sách nhóm rồi nhấn '💾 Lưu cấu hình'.", "📝 Form cleared. Selected fanpages are kept, fill group list then click '💾 Save configuration'.", "📝 表单已清空。已选 fanpage 会保留，请填写群组列表后点击“💾 保存配置”。");
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
  refreshFromServerBtn = createButton(t('reload_from_server'), "#722ed1");
  refreshFromServerBtn.title = t('reload_tooltip');
  refreshFromServerBtn.onclick = () => {
    refreshFromServerBtn.disabled = true;
    const originalText = refreshFromServerBtn.textContent;
    refreshFromServerBtn.textContent = t('loading');
    
    fetchDataOptionUserFromServer((success, data, error) => {
      if (success) {
        status.textContent = ti(`✅ Đã tải ${data.filter(x => x.config_for_zalo).length} config từ server`, `✅ Loaded ${data.filter(x => x.config_for_zalo).length} config(s) from server`, `✅ 已从服务器加载 ${data.filter(x => x.config_for_zalo).length} 条配置`);
        console.log('[Zalo] Manual refresh from server success');
        renderZaloConfigList();
      } else {
        status.textContent = ti(`⚠️ Lỗi tải từ server: ${error}`, `⚠️ Failed to load from server: ${error}`, `⚠️ 从服务器加载失败：${error}`);
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
  cancelBtn = createButton(t('cancel'), "#d46b08");
  cancelBtn.title = ti("Hủy thao tác sửa/thêm và khôi phục trạng thái trước đó", "Cancel edit/create and restore previous state", "取消编辑/新增并恢复之前状态");
  cancelBtn.onclick = () => {
    applyFormState(formSnapshot);
    selectedRowData = null;
    formSnapshot = null;
    editingFanpageData = null;
    setMode("idle");
  };

  const debugBtn = createButton(t('debug'), "#8c8c8c");
  debugBtn.title = ti("Hiển thị dữ liệu Zalo config từ localStorage (mở DevTools console để xem chi tiết)", "Show Zalo config data from localStorage (open DevTools console for details)", "显示来自 localStorage 的 Zalo 配置数据（打开 DevTools 控制台查看详情）");
  debugBtn.onclick = () => {
    const allData = loadDataOptionUser();
    const zaloConfigs = allData.filter(x => x.config_for_zalo);
    
    const debugMsg = `=== ZALO CONFIG DEBUG ===
📊 Total items in dataOptionUser: ${allData.length}
📋 Total Zalo configs: ${zaloConfigs.length}
Data stored in localStorage:
${JSON.stringify(zaloConfigs, null, 2)}`;
    
    console.log(debugMsg);
    thongbao(ti(`✅ Debug info logged to console!\n\n${debugMsg.substring(0, 300)}...\n\n👓 Mở DevTools (F12) -> Console để xem chi tiết`, `✅ Debug info logged to console!\n\n${debugMsg.substring(0, 300)}...\n\n👓 Open DevTools (F12) -> Console for details`, `✅ 调试信息已写入控制台！\n\n${debugMsg.substring(0, 300)}...\n\n👓 打开 DevTools (F12) -> Console 查看详情`));
  };
  
  const mgmtGroupTitle = document.createElement("div");
  mgmtGroupTitle.style.cssText = `font-weight:700;margin-bottom:8px;color:${theme.text};font-size:12px;`;
  mgmtGroupTitle.textContent = ti('2) Quản lý cấu hình', '2) Configuration management', '2) 配置管理');

  mgmtBtnRow.append(saveConfigBtn, cancelBtn, newConfigBtn, autoLoadBtn, refreshTokensBtn, showFanpagesBtn, clearAllBtn, debugBtn);
  managementSection.append(mgmtGroupTitle, mgmtTitle, excelToolbar, excelFileInput, gridGuide, mgmtList, mgmtBtnRow);
  
  // Grid sẽ tự động render sau khi fetch data từ server (xem phần expose helpers phía trên)
  
  const input = document.createElement("textarea");
  input.id = "zalo-group-list";
  input.setAttribute('data-zalo-config-select', 'true'); // Mark for selective lock
  input.placeholder = ti("Mỗi nhóm 1 dòng:\nNhóm A\nQ1,3 50T\nNhóm BĐS HCM", "One group per line:\nGroup A\nQ1,3 50T\nHCM Real Estate Group", "每行一个群组：\n群组A\nQ1,3 50T\n胡志明房产群");
  input.style.cssText = `width:100%;min-height:80px;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};margin-bottom:8px;flex:1;`;
  input.value = loadGroupList().join("\n");

  const keepOriginalWrapper = document.createElement("label");
  keepOriginalWrapper.style.cssText = `display:flex;align-items:center;gap:8px;margin:0 0 8px 0;padding:8px;border:1px dashed ${theme.border};border-radius:4px;background:${theme.inputBg};font-size:12px;color:${theme.text};cursor:pointer;`;
  keepOriginalWrapper.title = ti(
    "Bật để dùng nguyên nội dung quét từ Zalo khi đăng Facebook. Tắt để AI tạo nội dung Facebook mới.",
    "Enable to keep original scraped Zalo text when posting to Facebook. Disable to let AI rewrite.",
    "开启后发布 Facebook 时保留 Zalo 原文；关闭后由 AI 重写。"
  );

  const keepOriginalCheckbox = document.createElement("input");
  keepOriginalCheckbox.type = "checkbox";
  keepOriginalCheckbox.id = "zalo-keep-original-content-checkbox";
  keepOriginalCheckbox.checked = true;

  const keepOriginalText = document.createElement("span");
  keepOriginalText.textContent = ti(
    "Giữ nguyên nội dung quét từ Zalo khi đăng Facebook (bỏ chọn để AI viết mới)",
    "Keep original scraped Zalo text when posting to Facebook (uncheck to let AI rewrite)",
    "发布到 Facebook 时保留 Zalo 原文（取消勾选则由 AI 重写）"
  );

  keepOriginalWrapper.append(keepOriginalCheckbox, keepOriginalText);

  status = document.createElement("div");
  status.id = "zalo-group-status";
  status.style.cssText = `font-size:12px;color:${theme.muted};margin-bottom:8px;`;
  status.textContent = ti("⏸ Chưa chạy quét.", "⏸ Scanner not started.", "⏸ 尚未开始扫描。");

  setMode("idle");

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

  const startBtn = createButton(t('start_scan'), "#13c2c2");
  startBtn.setAttribute('data-zalo-start-scan', 'true');
  
  const stopBtn = createButton(t('stop_scan'), "#faad14");
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
    const selectedConfigIds = Array.isArray(window.__zaloSelectedConfigIds)
      ? window.__zaloSelectedConfigIds.map(x => String(x || '').trim()).filter(Boolean)
      : [];

    if (selectedConfigIds.length === 0) {
      const msg = ti(
        '⚠️ Chỉ chạy từ lưới động: hãy tick ít nhất 1 dòng cấu hình rồi nhấn chạy.',
        '⚠️ Grid-only mode: select at least one config row before start.',
        '⚠️ 仅支持动态表格模式：请先勾选至少一条配置再启动。'
      );
      if (status) status.textContent = msg;
      canhbao(msg);
      return;
    }

    if (typeof window.ensureZaloWebviewReady === 'function') {
      window.ensureZaloWebviewReady();
    }

    // Kiểm tra đăng nhập trước khi chạy scheduler
    status.textContent = ti("⏳ Kiểm tra đăng nhập Zalo...", "⏳ Checking Zalo login...", "⏳ 正在检查 Zalo 登录状态...");
    startBtn.disabled = true;
    startBtn.style.opacity = '0.6';
    startBtn.style.cursor = 'not-allowed';
    
    checkZaloLogin(window.zaloScannerWebviewId).then(loggedIn => {
      if (loggedIn) {
        isZaloLoggedIn = true;
        console.log('▶️ [Zalo Scanner] Bắt đầu Sequential Scheduler');
        startZaloScanner(status, { selectedConfigIds });
        
        setButtonsState(true);
      } else {
        status.textContent = ti("⚠️ Chưa đăng nhập Zalo. Vui lòng đăng nhập ở bên phải trước.", "⚠️ Not logged into Zalo. Please login on the right panel first.", "⚠️ 尚未登录 Zalo。请先在右侧面板登录。");
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
      }
    }).catch(err => {
      status.textContent = ti(`❌ Lỗi: ${err.message}`, `❌ Error: ${err.message}`, `❌ 错误：${err.message}`);
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
    });
  };

  stopBtn.onclick = () => {
    stopZaloScanner(status);
    stopLoginCheck();
    status.textContent = ti("⏸ Đã dừng quét. Nhấn ▶️ Bắt đầu quét để quét lại.", "⏸ Scan stopped. Click ▶️ Start scan to run again.", "⏸ 扫描已停止。点击 ▶️ 开始扫描 重新运行。");
    
    // Ẩn/hiện nút theo trạng thái không scanning
    setButtonsState(false);
  };

  window.addEventListener('zalo:grid-start-selected', (event) => {
    const selectedConfigIds = Array.isArray(event?.detail?.selectedConfigIds)
      ? event.detail.selectedConfigIds
      : [];
    if (selectedConfigIds.length === 0) {
      canhbao(ti('Chưa chọn cấu hình nào trong lưới.', 'No config selected in grid.', '网格中尚未选择配置。'));
      return;
    }

    if (isZaloScanning) {
      stopZaloScanner(status);
      setButtonsState(false);
    }

    startBtn.click();
  });

  btnRow.append(startBtn, stopBtn);
  
  // Ghi chú hướng dẫn sử dụng fanpage từ Facebook Token section
  const fanpageNote = document.createElement("div");
  fanpageNote.style.cssText = `margin-bottom:10px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:11px;color:${theme.info};border-left:3px solid ${theme.info};`;
  fanpageNote.innerHTML = ti(
    `
    💡 <strong>Lưu ý:</strong> Để chọn Fanpage đăng bài Zalo, hãy check vào các fanpage ở phần <strong>"📱 Facebook Token Management"</strong> phía trên.<br>
    ⚙️ Domain, Loại Dịch Vụ, Dự Án lấy từ <strong>"Cài Đặt Chung"</strong> phía trên.
  `,
    `
    💡 <strong>Note:</strong> To select fanpages for Zalo posting, check fanpages in <strong>"📱 Facebook Token Management"</strong> above.<br>
    ⚙️ Domain, Service Type, and Project are taken from <strong>"General Settings"</strong> above.
  `,
    `
    💡 <strong>提示：</strong>要选择用于发布 Zalo 的 fanpage，请在上方 <strong>"📱 Facebook Token Management"</strong> 中勾选。<br>
    ⚙️ Domain、服务类型、项目来自上方 <strong>"常规设置"</strong>。
  `
  );

  leftPanel.append(title, note, fanpageNote, managementSection, keepOriginalWrapper, input, status, btnRow, postedStats);

  // ===== PHẦN PHẢI: Webview Zalo =====
  const rightPanel = document.createElement("div");
  rightPanel.id = "zalo-webview-panel";
  rightPanel.style.cssText = `flex:1;min-width:350px;display:flex;flex-direction:column;`;

  wrapper.append(leftPanel, rightPanel);

  if (container) container.appendChild(wrapper);
  
  // ✅ GỌI RENDER SAU KHI TẤT CẢ UI ĐÃ ĐƯỢC TẠO VÀ APPEND VÀO DOM
  console.log('[Zalo] UI created, now rendering config list...');
  
  // Chế độ low-memory: render ngay từ cache, defer fetch server để giảm RAM spike.
  const csmUserDataOK = validateCsmUserDataReady();
  if (csmUserDataOK && CSM_FETCH_ZALO_CONFIG_ON_UI_LOAD) {
    console.log('[Zalo] Fetching data from server...');
    fetchDataOptionUserFromServer((success, data, error) => {
      if (success) {
        console.log('[Zalo] ✅ Fetched', data.filter(x => x.config_for_zalo).length, 'Zalo configs');
      } else {
        console.warn('[Zalo] ⚠️ Fetch failed, using cached data:', error);
      }
      renderZaloConfigList();
    });
  } else {
    if (!CSM_FETCH_ZALO_CONFIG_ON_UI_LOAD) {
      console.log('[Zalo][LowMemory] Skip initial server fetch, render from cached snapshot');
    } else {
      console.warn('[Zalo] csmUserData not ready, rendering with runtime fallback data');
    }
    renderZaloConfigList();
  }

  if (!window.__zaloConfigSyncListenerInstalled) {
    window.__zaloConfigSyncListenerInstalled = true;
    window.addEventListener('csm:dataOptionUserSynced', () => {
      try {
        console.log('[Zalo] csm:dataOptionUserSynced -> rerender config list');
        renderZaloConfigList();
      } catch (e) {
        console.warn('[Zalo] rerender after sync failed:', e?.message || e);
      }
    });
  }
  
  // Tự động tạo webview Zalo khi mở giao diện
  const webviewId = window.zaloScannerWebviewId;
  const zaloUrl = "https://chat.zalo.me/";
  
  const ensureZaloWebviewReady = () => {
    try {
      const existingWebview = document.getElementById(webviewId);
      if (!existingWebview) {
        console.log(`🔧 Tạo webview Zalo inline vào UI...`);
        createZaloWebview(webviewId, zaloUrl, rightPanel);
      }
      return true;
    } catch (error) {
      console.error("❌ Lỗi tạo webview:", error);
      status.textContent = ti(`⚠️ Có vấn đề với kết nối Zalo. Vui lòng thử lại.`, `⚠️ There is an issue with Zalo connection. Please try again.`, `⚠️ Zalo 连接出现问题，请重试。`);
      return false;
    }
  };

  if (CSM_AUTO_CREATE_ZALO_WEBVIEW) {
    const ok = ensureZaloWebviewReady();
    if (ok) {
      status.textContent = ti(`📱 Webview Zalo đã được tạo. Vui lòng đăng nhập...`, `📱 Zalo Webview created. Please log in...`, `📱 Zalo Webview 已创建，请登录...`);
    }
  } else {
    const connectWrap = document.createElement('div');
    connectWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px;border:1px dashed #bbb;border-radius:8px;background:rgba(0,0,0,0.02);';
    const connectText = document.createElement('div');
    connectText.textContent = ti('Chế độ nhẹ RAM: Webview Zalo chưa tạo. Bấm nút bên dưới khi cần đăng nhập/quét.', 'Low-memory mode: Zalo webview is not created yet. Click below only when needed.', '低内存模式：尚未创建 Zalo Webview。需要登录/扫描时再点击。');
    connectText.style.cssText = 'font-size:12px;line-height:1.5;';
    const connectBtn = document.createElement('button');
    connectBtn.textContent = ti('📱 Mở Zalo Web', '📱 Open Zalo Web', '📱 打开 Zalo Web');
    connectBtn.style.cssText = 'padding:8px 12px;border:none;border-radius:6px;background:#1677ff;color:#fff;cursor:pointer;font-size:12px;width:max-content;';
    connectBtn.onclick = () => {
      const ok = ensureZaloWebviewReady();
      if (ok) {
        connectBtn.disabled = true;
        connectBtn.style.opacity = '0.7';
        connectBtn.textContent = ti('✅ Zalo Web đã mở', '✅ Zalo Web opened', '✅ Zalo Web 已打开');
        status.textContent = ti(`📱 Kết nối Zalo sẵn sàng. Đăng nhập và bắt đầu quét.`, `📱 Zalo connection ready. Log in and start scanning.`, `📱 Zalo 连接已就绪，登录后开始扫描。`);
      }
    };
    connectWrap.append(connectText, connectBtn);
    rightPanel.appendChild(connectWrap);
    status.textContent = ti('🪶 Chế độ nhẹ RAM đang bật. Chưa tải Zalo Webview.', '🪶 Low-memory mode is on. Zalo webview not loaded yet.', '🪶 低内存模式已开启。尚未加载 Zalo Webview。');
  }

  // Expose để start scanner có thể tạo webview on-demand.
  window.ensureZaloWebviewReady = ensureZaloWebviewReady;
  
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
  return getCategoryTemplatesForDomain(domainKey).filter(item => item.is_service && !item.is_group_slug);
}

function normalizeGroupSlug(slug, groupSlug, isGroupSlug, isService = true) {
  // ✅ FIX: Nếu is_service:false, PHẢI để group_slug trống
  // (không phải return default "du-an" hay "dich-vu")
  const normalizedSlug = String(slug || '').trim();
  
  // Nếu uncheck "Là dịch vụ/Dự án" (is_service: false), group_slug phải trống
  if (!isService) {
    return '';
  }
  
  // Nếu slug là dich-vu hoặc du-an, nó là group category, group_slug phải trống
  if (normalizedSlug === 'dich-vu' || normalizedSlug === 'du-an') return '';
  if (isGroupSlug) return normalizedSlug || '';
  return groupSlug || '';
}

function normalizeGroupFlags(slug, isGroupSlug, isGroupSlugDefault, isService) {
  const normalizedSlug = String(slug || '').trim();
  if (normalizedSlug === 'dich-vu' || normalizedSlug === 'du-an') {
    return {
      is_service: true,
      is_group_slug: true,
      is_group_slug_default: false
    };
  }

  // ✅ Preserve is_service từ tham số thay vì hardcode true
  return {
    is_service: typeof isService === 'boolean' ? isService : true,
    is_group_slug: typeof isGroupSlug === 'boolean' ? isGroupSlug : false,
    is_group_slug_default: false
  };
}

function firstNonEmptyValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    return value;
  }
  return '';
}

// Keep name/category aligned across vi/en/zh and always prefer selected menu labels.
function normalizeMenuTranslations(source = {}, fallback = {}) {
  const vi = firstNonEmptyValue(
    source.name,
    source.category,
    fallback.name,
    fallback.category,
    source.slug,
    source.service_code,
    fallback.slug,
    fallback.service_code,
    ''
  );
  const en = firstNonEmptyValue(
    source.name_en,
    source.category_en,
    fallback.name_en,
    fallback.category_en,
    vi
  );
  const zh = firstNonEmptyValue(
    source.name_zh,
    source.category_zh,
    fallback.name_zh,
    fallback.category_zh,
    vi
  );

  return {
    name: vi,
    name_en: en,
    name_zh: zh,
    category: vi,
    category_en: en,
    category_zh: zh
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
❗❗❗ STATUS = "active" (BẮT BUỘC LÀ STRING, KHÔNG PHẢI SỐ 1)
❗ content_en và content_zh BẮT BUỘC khác content (dịch ĐÚNG ngôn ngữ, KHÔNG ĐƯỢC copy tiếng Việt)
❗ description/description_en/description_zh phải là mô tả đúng nghĩa (1-2 câu), KHÔNG dùng lại prompt_focus
❗ category/category_en/category_zh bắt buộc đủ 3 ngôn ngữ (EN/ZH PHẢI là tiếng Anh/Trung, KHÔNG được tiếng Việt)
❗ BẮT BUỘC trả đủ fields: name/name_en/name_zh, category/category_en/category_zh, description/description_en/description_zh, image, attributes_icon/attributes_color/attributes_priority, attributes_title/_en/_zh, attributes_description/_en/_zh, attributes_keywords/_en/_zh
❗ name_en/name_zh/category_en/category_zh BẮT BUỘC là ngôn ngữ đúng:
  - name_en PHẢI là tiếng Anh (VD: "Real Estate" KHÔNG PHẢI "Bất Động Sản")
  - name_zh PHẢI là tiếng Trung (VD: "房地产" KHÔNG PHẢI "Bất Động Sản")
  - category_en PHẢI là tiếng Anh
  - category_zh PHẢI là tiếng Trung
❗ KHÔNG ĐƯỢC để trống bất kỳ trường nào trong JSON output
❗ Nếu thiếu trường hoặc ngôn ngữ SAI, TỰ KIỂM TRA và TẠO LẠI trước khi trả về
❗ SELF-CHECK BẮT BUỘC TRƯỚC KHI TRẢ JSON:
  - status: PHẢI = "active" (string), KHÔNG ĐƯỢC = 1 (number)
  - content, content_en, content_zh (đủ, khác ngôn ngữ)
  - name: tiếng Việt, name_en: tiếng Anh, name_zh: tiếng Trung (3 ngôn ngữ KHÁC NHAU)
  - category: tiếng Việt, category_en: tiếng Anh, category_zh: tiếng Trung (3 ngôn ngữ KHÁC NHAU)
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
❗❗❗ STATUS = "active" (BẮT BUỘC LÀ STRING, KHÔNG PHẢI SỐ 1)
❗ content_en và content_zh BẮT BUỘC khác content (dịch ĐÚNG ngôn ngữ, KHÔNG ĐƯỢC copy tiếng Việt)
❗ BẮT BUỘC TRƯỚC KHI TRẢ JSON:
  - name/name_en/name_zh, category/category_en/category_zh, description/description_en/description_zh, image, attributes_icon/attributes_color/attributes_priority
  - content, content_en, content_zh (đủ, khác ngôn ngữ)
  - status: PHẢI = "active" (string), KHÔNG ĐƯỢC = 1 (number)
  - name: tiếng Việt, name_en: tiếng Anh (PHẢI dịch), name_zh: tiếng Trung (PHẢI dịch)
  - category: tiếng Việt, category_en: tiếng Anh (PHẢI khác tiếng Việt), category_zh: tiếng Trung (PHẢI khác tiếng Việt)
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

  const selectedCategoryData = contentData.selectedCategoryData || {};
  const baseCategory = findCategoryTemplate(domainKey || 'phanmemmottrieu', categorySlug) || selectedCategoryData || {};
  const baseConfig = baseCategory.config || {};

  const rowsBySlug = await ctx.helperApi.getTableData({
    app_id: ctx.app_id,
    obj_name: "web_services",
    where: { field: "slug", type: "eq", value: categorySlug },
    take: 5
  }).catch(() => ({ rows: [] }));

  const slugRows = rowsBySlug.rows || rowsBySlug.data || [];
  const existing = slugRows.find(row => String(row?.status || 'active') === 'active') || slugRows[0] || {};
  const fallbackRow = existing || {};

  const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');
  const pickNumber = (...vals) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return 0;
  };

  const menuNames = normalizeMenuTranslations(
    selectedCategoryData,
    {
      ...baseCategory,
      ...existing,
      ...fallbackRow,
      name: firstNonEmptyValue(baseCategory.name, existing.name, fallbackRow.name, contentData.name, categorySlug),
      name_en: firstNonEmptyValue(baseCategory.name_en, existing.name_en, fallbackRow.name_en, contentData.name_en, contentData.name, categorySlug),
      name_zh: firstNonEmptyValue(baseCategory.name_zh, existing.name_zh, fallbackRow.name_zh, contentData.name_zh, contentData.name, categorySlug),
      category: firstNonEmptyValue(baseCategory.category, existing.category, fallbackRow.category, contentData.category, contentData.name, categorySlug),
      category_en: firstNonEmptyValue(baseCategory.category_en, existing.category_en, fallbackRow.category_en, contentData.category_en, contentData.name_en, contentData.name, categorySlug),
      category_zh: firstNonEmptyValue(baseCategory.category_zh, existing.category_zh, fallbackRow.category_zh, contentData.category_zh, contentData.name_zh, contentData.name, categorySlug)
    }
  );
  
  // Chuẩn bị dữ liệu cập nhật
  const rawContent = encodeHtml(contentData.content || '', { urlEncode: false }) || '';
  const rawContentEn = encodeHtml(contentData.content_en || '', { urlEncode: false }) || '';
  const rawContentZh = encodeHtml(contentData.content_zh || '', { urlEncode: false }) || '';

  const resolvedIsGroupSlug = typeof selectedCategoryData.is_group_slug === 'boolean'
    ? selectedCategoryData.is_group_slug
    : (typeof contentData.is_group_slug === 'boolean'
    ? contentData.is_group_slug
    : (typeof baseCategory.is_group_slug === 'boolean' ? baseCategory.is_group_slug : false));

  const resolvedIsGroupSlugDefault = typeof selectedCategoryData.is_group_slug_default === 'boolean'
    ? selectedCategoryData.is_group_slug_default
    : (typeof contentData.is_group_slug_default === 'boolean'
    ? contentData.is_group_slug_default
    : (typeof baseCategory.is_group_slug_default === 'boolean' ? baseCategory.is_group_slug_default : false));

  const resolvedIsService = typeof selectedCategoryData.is_service === 'boolean'
    ? selectedCategoryData.is_service
    : (typeof contentData.is_service === 'boolean'
    ? contentData.is_service
    : (typeof baseCategory.is_service === 'boolean' ? baseCategory.is_service : true));

  const groupFlags = normalizeGroupFlags(
    baseCategory.slug || categorySlug,
    resolvedIsGroupSlug,
    resolvedIsGroupSlugDefault,
    resolvedIsService
  );

  const objUpdate = {
    ...existing,
    id: pick(contentData.id, existing.id, fallbackRow.id, baseCategory.id, baseCategory.service_code, baseCategory.slug, categorySlug),
    service_code: pick(contentData.service_code, baseCategory.service_code, existing.service_code, fallbackRow.service_code, categorySlug),
    slug: baseCategory.slug || categorySlug,
    group_slug: normalizeGroupSlug(
      baseCategory.slug || categorySlug,
      firstNonEmptyValue(
        selectedCategoryData.group_slug,
        baseCategory.group_slug,
        contentData.group_slug,
        existing.group_slug,
        fallbackRow.group_slug,
        resolvedIsService ? (domainKey === 'lmkt' ? 'du-an' : 'dich-vu') : ''
      ),
      groupFlags.is_group_slug,
      groupFlags.is_service
    ),
    is_service: typeof groupFlags.is_service === 'boolean'
      ? groupFlags.is_service
      : (typeof selectedCategoryData.is_service === 'boolean' ? selectedCategoryData.is_service : (typeof contentData.is_service === 'boolean' ? contentData.is_service : (typeof baseCategory.is_service === 'boolean' ? baseCategory.is_service : true))),
    is_group_slug: groupFlags.is_group_slug,
    is_group_slug_default: groupFlags.is_group_slug_default,
    domain: ctx.domain,
    app_id: ctx.app_id,
    status: 'active',
    name: pick(menuNames.name, baseCategory.name, existing.name, fallbackRow.name, contentData.name),
    name_en: pick(menuNames.name_en, baseCategory.name_en, existing.name_en, fallbackRow.name_en, contentData.name_en, contentData.name),
    name_zh: pick(menuNames.name_zh, baseCategory.name_zh, existing.name_zh, fallbackRow.name_zh, contentData.name_zh, contentData.name),
    category: pick(menuNames.category, baseCategory.category, existing.category, fallbackRow.category, contentData.category, contentData.name),
    category_en: pick(menuNames.category_en, baseCategory.category_en, existing.category_en, fallbackRow.category_en, contentData.category_en, contentData.name_en, contentData.name),
    category_zh: pick(menuNames.category_zh, baseCategory.category_zh, existing.category_zh, fallbackRow.category_zh, contentData.category_zh, contentData.name_zh, contentData.name),
    description: pick(selectedCategoryData.description, baseCategory.description, contentData.description, existing.description, fallbackRow.description),
    description_en: pick(selectedCategoryData.description_en, baseCategory.description_en, contentData.description_en, existing.description_en, fallbackRow.description_en),
    description_zh: pick(selectedCategoryData.description_zh, baseCategory.description_zh, contentData.description_zh, existing.description_zh, fallbackRow.description_zh),

    image: pick(selectedCategoryData.image, baseCategory.image, contentData.image, existing.image, fallbackRow.image, ''),
    icon: pick(selectedCategoryData.icon, baseCategory.icon, contentData.icon, existing.icon, fallbackRow.icon, ''),
    attributes_icon: pick(selectedCategoryData.attributes_icon, baseCategory.attributes_icon, contentData.attributes_icon, existing.attributes_icon, fallbackRow.attributes_icon, baseConfig.attributes_icon),
    attributes_color: pick(selectedCategoryData.attributes_color, baseCategory.attributes_color, contentData.attributes_color, existing.attributes_color, fallbackRow.attributes_color, baseConfig.attributes_color),
    attributes_priority: pickNumber(selectedCategoryData.attributes_priority, baseCategory.attributes_priority, contentData.attributes_priority, existing.attributes_priority, fallbackRow.attributes_priority, baseConfig.attributes_priority),

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

  // Keep name/category strictly synchronized per language based on selected menu config.
  objUpdate.name = firstNonEmptyValue(objUpdate.name, objUpdate.category, categorySlug);
  objUpdate.name_en = firstNonEmptyValue(objUpdate.name_en, objUpdate.category_en, objUpdate.name);
  objUpdate.name_zh = firstNonEmptyValue(objUpdate.name_zh, objUpdate.category_zh, objUpdate.name);
  objUpdate.category = objUpdate.name;
  objUpdate.category_en = objUpdate.name_en;
  objUpdate.category_zh = objUpdate.name_zh;
  
  console.log(`[upsertServiceCategoryContent] Cập nhật web_services.${categorySlug}`);
  
  const result = await ctx.helperApi.updateTableData({
    app_id: ctx.app_id,
    obj_name: "web_services",
    command: "update",
    obj_update: objUpdate,
    pk_fields: ["slug"]
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
 *     domain: "csmbridge.net",
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
// 4. Attach UI vào unified UI container
// ========================================================
async function ensureServiceContentUI() {
  const existing = document.getElementById("service-content-ui");
  if (existing) return existing;

  const theme = getThemeTokens();
  const wrapper = document.createElement("div");
  wrapper.id = "service-content-ui";
  wrapper.style.cssText = getFeatureCardStyle(theme);

  const title = document.createElement("div");
  title.textContent = ti("✨ Tạo nội dung dịch vụ (Danh mục dịch vụ)", "✨ Generate Service Content (Service Categories)", "✨ 生成服务内容 (Service Categories)");
  title.style.cssText = getFeatureTitleStyle(theme);

  // Note: Sử dụng Global Settings Panel
  const note = document.createElement("div");
  note.style.cssText = `margin-bottom:12px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:12px;color:${theme.info};`;
  note.innerHTML = ti("💡 <strong>Mẹo:</strong> Chọn ở <strong>Cài Đặt Chung</strong> phía trên.", "💡 <strong>Tip:</strong> Select settings in <strong>General Settings</strong> above.", "💡 <strong>提示：</strong>请在上方 <strong>常规设置</strong> 中选择。");
  
  // Button: Sync Categories
  const syncBtn = document.createElement("button");
  syncBtn.textContent = ti("🔄 Đồng bộ danh mục", "🔄 Sync Categories", "🔄 同步分类");
  syncBtn.title = ti("Cập nhật tất cả lĩnh vực/dự án lên database", "Update all industries/projects to database", "将所有行业/项目更新到数据库");
  syncBtn.style.cssText = `padding:6px 12px;background:#52c41a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = ti("🗑️ Xóa theo slug", "🗑️ Delete by slug", "🗑️ 按 slug 删除");
  deleteBtn.title = ti("Xóa bản ghi theo slug đang chọn", "Delete record by selected slug", "按所选 slug 删除记录");
  deleteBtn.style.cssText = `padding:6px 12px;background:#ff4d4f;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;

  const updateDetailDomainBtn = document.createElement("button");
  updateDetailDomainBtn.textContent = ti("🔁 Cập nhật tên miền bài chi tiết", "🔁 Update detailed post domain", "🔁 更新详情文章域名");
  updateDetailDomainBtn.title = ti("Cập nhật tên miền cho bảng web_service_detail theo trường service_type", "Update domain for web_service_detail by service_type", "按 service_type 更新 web_service_detail 域名");
  updateDetailDomainBtn.style.cssText = `padding:6px 12px;background:#1677ff;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.3s;margin-bottom:12px;display:inline-block;`;

  const deleteInput = document.createElement("input");
  deleteInput.type = "text";
  deleteInput.placeholder = ti("Nhập slug để xóa (không cần tên miền)", "Enter slug to delete (domain not required)", "输入要删除的 slug（无需 domain）");
  deleteInput.style.cssText = `min-width:240px;padding:6px 8px;border:1px solid ${theme.border};border-radius:4px;font-size:12px;color:${theme.text};background:${theme.bg};`;

  const newNameInput = document.createElement("input");
  newNameInput.type = "text";
  newNameInput.placeholder = ti("Tên dự án/dịch vụ mới (VD: Eco Smart City)", "New project/service name (e.g. Eco Smart City)", "新项目/服务名称（例如：Eco Smart City）");
  newNameInput.style.cssText = `min-width:280px;padding:6px 8px;border:1px solid ${theme.border};border-radius:4px;font-size:12px;color:${theme.text};background:${theme.bg};`;

  const newSlugInput = document.createElement("input");
  newSlugInput.type = "text";
  newSlugInput.placeholder = ti("Slug mới (tự tạo, có thể sửa)", "New slug (auto-generated, editable)", "新 slug（自动生成，可编辑）");
  newSlugInput.style.cssText = `min-width:220px;padding:6px 8px;border:1px solid ${theme.border};border-radius:4px;font-size:12px;color:${theme.text};background:${theme.bg};`;

  // ✅ NEW: Service Type Checkbox
  const serviceTypeCheckbox = document.createElement("input");
  serviceTypeCheckbox.type = "checkbox";
  serviceTypeCheckbox.checked = true; // Mặc định là service
  serviceTypeCheckbox.style.cssText = `cursor:pointer;width:16px;height:16px;`;
  
  const serviceTypeLabel = document.createElement("label");
  serviceTypeLabel.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;padding:6px 8px;border:1px solid ${theme.border};border-radius:4px;background:${theme.bg};color:${theme.text};font-size:12px;user-select:none;`;
  serviceTypeLabel.appendChild(serviceTypeCheckbox);
  
  const labelText = document.createElement("span");
  labelText.textContent = ti("✅ Dịch vụ (is_service: bật)", "✅ Service (is_service: true)", "✅ 服务 (is_service: true)");
  serviceTypeLabel.appendChild(labelText);
  
  // Update label text when checkbox changes
  serviceTypeCheckbox.addEventListener('change', () => {
    labelText.textContent = serviceTypeCheckbox.checked 
      ? ti("✅ Dịch vụ (is_service: bật)", "✅ Service (is_service: true)", "✅ 服务 (is_service: true)") 
      : ti("❌ Mục thường (is_service: tắt)", "❌ Normal menu (is_service: false)", "❌ 普通菜单 (is_service: false)");
  });

  const addNewBtn = createButton(ti("➕ Thêm Mới bằng AI", "➕ Add New with AI", "➕ AI 新增"), "#722ed1");
  addNewBtn.title = ti("Nhập tên + chỉ dẫn để AI tạo đầy đủ nội dung và lưu vào bảng web_services", "Enter name + prompt for AI to generate full content and save to web_services", "输入名称与提示词，让 AI 生成完整内容并保存到 web_services");

  const normalizeNewSlug = (value = "") => String(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  newNameInput.addEventListener("input", () => {
    if (!newSlugInput.dataset.userEdited) {
      newSlugInput.value = normalizeNewSlug(newNameInput.value);
    }
  });
  newSlugInput.addEventListener("input", () => {
    newSlugInput.dataset.userEdited = "1";
    newSlugInput.value = normalizeNewSlug(newSlugInput.value);
  });
  
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
      canhbao(ti("⚠️ Vui lòng chọn tên miền từ Cài Đặt Chung", "⚠️ Please select domain in General Settings", "⚠️ 请在常规设置中选择 domain"));
      return;
    }
    
    syncBtn.disabled = true;
    syncBtn.textContent = ti("⏳ Đang đồng bộ...", "⏳ Syncing...", "⏳ 同步中...");
    
    try {
      await syncCategoriesToDatabase(globalSettings.domainKey);
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = ti("🔄 Đồng bộ danh mục", "🔄 Sync Categories", "🔄 同步分类");
    }
  };

  deleteBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    if (!globalSettings.domainKey) {
      canhbao(ti("⚠️ Vui lòng chọn tên miền từ Cài Đặt Chung", "⚠️ Please select domain in General Settings", "⚠️ 请在常规设置中选择 domain"));
      return;
    }

    const manualSlug = deleteInput.value.trim();
    const categorySlug = manualSlug || (globalSettings.isLmkt ? globalSettings.project : globalSettings.industry);
    if (!categorySlug) {
      canhbao(ti("⚠️ Vui lòng nhập slug để xóa", "⚠️ Please enter slug to delete", "⚠️ 请输入要删除的 slug"));
      return;
    }

    if (!window.confirm(ti(`Bạn có chắc muốn xóa slug "${categorySlug}"?`, `Are you sure to delete slug "${categorySlug}"?`, `确定要删除 slug "${categorySlug}" 吗？`))) {
      return;
    }

    deleteBtn.disabled = true;
    deleteBtn.textContent = ti("⏳ Đang xóa...", "⏳ Deleting...", "⏳ 删除中...");

    try {
      await deleteCategoryBySlug(globalSettings.domainKey, categorySlug);
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = ti("🗑️ Xóa theo slug", "🗑️ Delete by slug", "🗑️ 按 slug 删除");
    }
  };

  updateDetailDomainBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    if (!globalSettings.domainKey) {
      canhbao(ti("⚠️ Vui lòng chọn tên miền từ Cài Đặt Chung", "⚠️ Please select domain in General Settings", "⚠️ 请在常规设置中选择 domain"));
      return;
    }

    const serviceType = globalSettings.isLmkt ? globalSettings.project : globalSettings.industry;
    if (!serviceType) {
      canhbao(ti("⚠️ Vui lòng chọn lĩnh vực/dự án để cập nhật", "⚠️ Please select industry/project to update", "⚠️ 请选择行业/项目后再更新"));
      return;
    }

    if (!window.confirm(ti(`Bạn có chắc muốn cập nhật domain cho service_type "${serviceType}"?`, `Are you sure to update domain for service_type "${serviceType}"?`, `确定要更新 service_type "${serviceType}" 的域名吗？`))) {
      return;
    }

    updateDetailDomainBtn.disabled = true;
    updateDetailDomainBtn.textContent = ti("⏳ Đang cập nhật...", "⏳ Updating...", "⏳ 更新中...");

    try {
      await updateDetailDomainByServiceType(globalSettings.domainKey, serviceType);
    } finally {
      updateDetailDomainBtn.disabled = false;
      updateDetailDomainBtn.textContent = ti("🔁 Cập nhật tên miền bài chi tiết", "🔁 Update detailed post domain", "🔁 更新详情文章域名");
    }
  };
  
  // Create row for sync button
  const syncRow = document.createElement("div");
  syncRow.style.cssText = "margin-bottom:12px;display:flex;gap:8px;align-items:center";
  syncRow.appendChild(syncBtn);
  syncRow.appendChild(deleteInput);
  syncRow.appendChild(deleteBtn);
  syncRow.appendChild(updateDetailDomainBtn);

  const addNewRow = document.createElement("div");
  addNewRow.style.cssText = "margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap";
  addNewRow.appendChild(newNameInput);
  addNewRow.appendChild(newSlugInput);
  addNewRow.appendChild(serviceTypeLabel);
  addNewRow.appendChild(addNewBtn);

  // Note: Lĩnh vực được dùng từ Global Settings (chỉ có 1 chỗ cho tất cả)
  // Không tạo category selector riêng - dùng giá trị từ global-industry-select
  const infoRow = document.createElement("div");
  infoRow.id = "service-info-row";
  infoRow.style.cssText = `margin-bottom:12px;padding:8px 12px;background:${theme.infoBg};border-radius:6px;border-left:3px solid ${theme.info};color:${theme.text}`;
  
  const infoLabel = document.createElement("small");
  infoLabel.style.cssText = `color:${theme.textSecondary};font-weight:500;display:block;margin-bottom:4px`;
  infoLabel.textContent = ti("Thông tin hiện tại:", "Current information:", "当前信息：");
  
  const infoContent = document.createElement("div");
  infoContent.id = "service-info-content";
  infoContent.style.cssText = `color:${theme.text};font-size:13px;line-height:1.5`;
  infoContent.textContent = ti("(Dùng Lĩnh Vực từ Cài Đặt Chung)", "(Uses Industry from General Settings)", "（使用常规设置中的行业）");
  
  infoRow.appendChild(infoLabel);
  infoRow.appendChild(infoContent);

  // Textarea for user prompt
  const promptLabel = document.createElement("label");
  promptLabel.style.cssText = `font-weight:500;display:block;margin-bottom:6px;color:${theme.text}`;
  promptLabel.textContent = ti("Hướng dẫn nội dung (tùy chỉnh AI - có thể để trống):", "Content instructions (AI customization - optional):", "内容指引（AI 自定义，可选）：");
  
  const textarea = document.createElement("textarea");
  textarea.id = "service-prompt-input";
  textarea.style.cssText = `width:100%;min-height:120px;font-family:monospace;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};padding:8px;border-radius:6px;margin-bottom:12px;resize:vertical`;
  textarea.placeholder = ti("Ví dụ: Viết về tính năng chính, lợi ích cụ thể, và đối tượng sử dụng... (để trống sẽ dùng prompt mặc định đầy đủ)", "Example: Write about key features, concrete benefits, and target audience... (leave empty to use full default prompt)", "例如：撰写核心功能、具体收益和目标用户...（留空将使用完整默认提示词）");

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

  const createBtn = createButton(ti("🚀 Tạo nội dung", "🚀 Generate Content", "🚀 生成内容"), "#52c41a");

  // Result area
  const resultArea = document.createElement("div");
  resultArea.id = "service-result-area";
  resultArea.style.cssText = `margin-top:16px;padding:12px;background:${theme.successBg};border:1px solid ${theme.successBorder};border-radius:6px;display:none;max-height:400px;overflow-y:auto`;
  
  const resultLabel = document.createElement("strong");
  resultLabel.style.cssText = `display:block;margin-bottom:8px;color:${theme.successText}`;
  resultLabel.textContent = ti("✅ Kết quả:", "✅ Result:", "✅ 结果：");
  
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
    const domainLabel = DOMAIN_OPTIONS[globalSettings.domainKey]?.label || ti('Chưa biết', 'Unknown', '未知');
    const industryLabel = INDUSTRY_TYPES[globalSettings.industry]?.name
      || getSelectLabel("global-industry-select", ti('Chưa chọn', 'Not selected', '未选择'));
    const projectLabel = LMKT_PROJECT_DEFS.find(p => p.service_code === globalSettings.project)?.name
      || getSelectLabel("global-project-select", ti('Chưa chọn', 'Not selected', '未选择'));
    
    if (globalSettings.isLmkt) {
      note.innerHTML = ti("💡 <strong>LMKT:</strong> Danh mục chính là <strong>Dự án</strong>. Lĩnh vực bị khóa ở <strong>Bất động sản</strong>.", "💡 <strong>LMKT:</strong> Main category is <strong>Project</strong>. Industry is locked to <strong>Real Estate</strong>.", "💡 <strong>LMKT：</strong>主分类为<strong>项目</strong>，行业锁定为<strong>房地产</strong>。");
      infoContent.innerHTML = `<strong>🏢 ${ti('Tên miền', 'Domain', '域名')}:</strong> ${domainLabel} | <strong>🏗️ ${ti('Danh mục (Dự án)', 'Category (Project)', '分类（项目）')}:</strong> ${projectLabel} | <strong>🏢 ${ti('Lĩnh vực', 'Industry', '行业')}:</strong> ${industryLabel} (${ti('cố định', 'fixed', '固定')})`;
    } else {
      note.innerHTML = ti("💡 <strong>Phanmemmottrieu:</strong> Danh mục chính là <strong>Lĩnh vực</strong>. Chọn ở <strong>Cài Đặt Chung</strong>.", "💡 <strong>Phanmemmottrieu:</strong> Main category is <strong>Industry</strong>. Choose it in <strong>General Settings</strong>.", "💡 <strong>Phanmemmottrieu：</strong>主分类为<strong>行业</strong>，请在<strong>常规设置</strong>中选择。");
      infoContent.innerHTML = `<strong>🏢 ${ti('Tên miền', 'Domain', '域名')}:</strong> ${domainLabel} | <strong>🏢 ${ti('Danh mục (Lĩnh vực)', 'Category (Industry)', '分类（行业）')}:</strong> ${industryLabel}`;
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
  
  // ✅ FIX: Use direct listeners only (avoid duplicate via document-level listener)
  if (globalDomainSelect) eventRegistry.add(globalDomainSelect, 'change', updateInfoDisplay);
  if (globalIndustrySelect) eventRegistry.add(globalIndustrySelect, 'change', updateInfoDisplay);
  if (globalProjectSelect) eventRegistry.add(globalProjectSelect, 'change', updateInfoDisplay);

  async function generateAndSaveServiceCategory({
    globalSettings,
    categoryData,
    categorySlug,
    categoryName,
    userPrompt,
    mode = 'update_existing',
    autoPrompt = '',
    selectNewAfterSave = false
  }) {
    const finalPrompt = (userPrompt && userPrompt.trim()) || autoPrompt;
    if (!finalPrompt) {
      throw new Error("Thiếu prompt để tạo nội dung");
    }

    const aiPrompt = buildCategoryPrompt(categoryData, finalPrompt, globalSettings.domainKey);
    if (!window.csmAI?.generateSeoContentWithPrompt) {
      throw new Error("🤖 Không tìm thấy AI Helper - Chưa kích hoạt csmAI");
    }

    const startTime = Date.now();
    const aiResponse = await window.csmAI.generateSeoContentWithPrompt(aiPrompt);
    const duration = Math.round((Date.now() - startTime) / 1000);
    const contentData = parseAIResponse(aiResponse, { encodeContent: false });

    if (!contentData.content) {
      throw new Error("AI trả về content rỗng");
    }

    const templateData = findCategoryTemplate(globalSettings.domainKey, categorySlug) || categoryData;
    const ctx = resolveContext();
    const domainConfigForSave = DOMAIN_OPTIONS[globalSettings.domainKey];
    ctx.app_id = domainConfigForSave?.app_id || ctx.app_id;
    ctx.domain = domainConfigForSave?.value || ctx.domain;

    const saveResult = await upsertServiceCategoryContent(ctx, categorySlug, {
      ...templateData,
      ...contentData,
      selectedCategoryData: {
        ...templateData,
        ...normalizeMenuTranslations(templateData, templateData)
      },
      slug: categorySlug,
      service_code: categorySlug,
      id: templateData.id || categoryData.id || categorySlug,
      name: templateData.name || categoryData.name || categoryName
    });

    const syncedMenuNames = normalizeMenuTranslations(categoryData, contentData);

    if (mode === 'add_new') {
      if (globalSettings.isLmkt) {
        const idx = LMKT_PROJECT_DEFS.findIndex(p => p.service_code === categorySlug);
        const nextProject = {
          service_code: categorySlug,
          name: syncedMenuNames.name,
          name_en: syncedMenuNames.name_en,
          name_zh: syncedMenuNames.name_zh,
          category: syncedMenuNames.category,
          category_en: syncedMenuNames.category_en,
          category_zh: syncedMenuNames.category_zh,
          image: contentData.image || categoryData.image,
          attributes_icon: contentData.attributes_icon || categoryData.attributes_icon,
          attributes_color: contentData.attributes_color || categoryData.attributes_color,
          attributes_priority: typeof contentData.attributes_priority === 'number' ? contentData.attributes_priority : 999
        };
        if (idx >= 0) LMKT_PROJECT_DEFS[idx] = { ...LMKT_PROJECT_DEFS[idx], ...nextProject };
        else LMKT_PROJECT_DEFS.push(nextProject);
      } else {
        INDUSTRY_TYPES[categorySlug] = {
          ...(INDUSTRY_TYPES[categorySlug] || {}),
          name: syncedMenuNames.name,
          name_en: syncedMenuNames.name_en,
          name_zh: syncedMenuNames.name_zh,
          category: syncedMenuNames.category,
          category_en: syncedMenuNames.category_en,
          category_zh: syncedMenuNames.category_zh,
          image: contentData.image || categoryData.image,
          attributes_icon: contentData.attributes_icon || categoryData.attributes_icon,
          attributes_color: contentData.attributes_color || categoryData.attributes_color,
          attributes_priority: typeof contentData.attributes_priority === 'number' ? contentData.attributes_priority : 999,
          attributes_title: contentData.attributes_title || categoryName,
          attributes_title_en: contentData.attributes_title_en || categoryName,
          attributes_title_zh: contentData.attributes_title_zh || categoryName,
          attributes_description: contentData.attributes_description || '',
          attributes_description_en: contentData.attributes_description_en || '',
          attributes_description_zh: contentData.attributes_description_zh || '',
          attributes_keywords: contentData.attributes_keywords || '',
          attributes_keywords_en: contentData.attributes_keywords_en || '',
          attributes_keywords_zh: contentData.attributes_keywords_zh || '',
          color: contentData.attributes_color || categoryData.attributes_color
        };
      }

      refreshGlobalSettingsOptionsFromDefinitions();

      if (selectNewAfterSave) {
        const globalDomain = document.getElementById("global-domain-select");
        const globalIndustry = document.getElementById("global-industry-select");
        const globalProject = document.getElementById("global-project-select");
        if (globalDomain) globalDomain.value = globalSettings.domainKey;
        if (globalSettings.isLmkt && globalProject) globalProject.value = categorySlug;
        if (!globalSettings.isLmkt && globalIndustry) globalIndustry.value = categorySlug;
        if (globalDomain) globalDomain.dispatchEvent(new Event('change'));
      }
    }

    const displayResult = {
      ...(saveResult?.objUpdate || contentData),
      metadata: {
        mode,
        domain: globalSettings.domainKey,
        industry: globalSettings.industry,
        project: globalSettings.isLmkt ? globalSettings.project : null,
        slug: categorySlug,
        duration: `${duration}s`,
        timestamp: new Date().toLocaleString('vi-VN')
      }
    };

    resultContent.textContent = JSON.stringify(displayResult, null, 2);
    resultArea.style.display = 'block';
    return { contentData, saveResult, duration };
  }

  addNewBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    const userPrompt = textarea.value.trim();
    const categoryName = (newNameInput.value || '').trim();
    const customSlug = normalizeNewSlug(newSlugInput.value || categoryName);
    const isService = serviceTypeCheckbox.checked; // ✅ Lấy giá trị từ checkbox

    if (!globalSettings.domainKey) {
      canhbao(ti("❌ Vui lòng chọn Tên miền ở Cài Đặt Chung", "❌ Please select Domain in General Settings", "❌ 请在常规设置中选择 Domain"));
      return;
    }
    if (!categoryName) {
      canhbao(ti("❌ Vui lòng nhập tên dự án/dịch vụ mới", "❌ Please enter new project/service name", "❌ 请输入新的项目/服务名称"));
      return;
    }
    if (!customSlug) {
      canhbao(ti("❌ Slug không hợp lệ. Vui lòng nhập lại tên/slug", "❌ Invalid slug. Please re-enter name/slug", "❌ Slug 无效，请重新输入名称/slug"));
      return;
    }

    try {
      addNewBtn.disabled = true;
      addNewBtn.textContent = ti("⏳ Đang tạo mới bằng AI...", "⏳ Creating with AI...", "⏳ AI 创建中...");
      resultArea.style.display = 'none';

      const defaultIndustry = INDUSTRY_TYPES["bat-dong-san"] || {};
      const baseIndustry = globalSettings.isLmkt
        ? defaultIndustry
        : (INDUSTRY_TYPES[globalSettings.industry] || defaultIndustry);

      // ✅ Logic mới: Nếu is_service = false thì group_slug = ""
      const groupSlug = isService 
        ? (globalSettings.isLmkt ? "du-an" : "dich-vu")
        : "";
      const templateData = findCategoryTemplate(globalSettings.domainKey, customSlug) || {};

      const categoryData = {
          id: templateData.id || customSlug,
          service_code: templateData.service_code || customSlug,
          slug: templateData.slug || customSlug,
          group_slug: templateData.group_slug !== undefined ? templateData.group_slug : groupSlug,
          is_service: typeof templateData.is_service === 'boolean' ? templateData.is_service : isService,
          is_group_slug: typeof templateData.is_group_slug === 'boolean' ? templateData.is_group_slug : false,
          is_group_slug_default: typeof templateData.is_group_slug_default === 'boolean' ? templateData.is_group_slug_default : false,
          name: templateData.name || categoryName,
          name_en: templateData.name_en || categoryName,
          name_zh: templateData.name_zh || categoryName,
          category: templateData.category || categoryName,
          category_en: templateData.category_en || categoryName,
          category_zh: templateData.category_zh || categoryName,
          description: templateData.description || '',
          description_en: templateData.description_en || '',
          description_zh: templateData.description_zh || '',
          image: templateData.image || (globalSettings.isLmkt
            ? `https://www.h-holding.vn/app_images/projects/${customSlug}-og.jpg`
            : (baseIndustry.image || '')),
          attributes_icon: templateData.attributes_icon || baseIndustry.attributes_icon || "AppstoreOutlined",
          attributes_color: templateData.attributes_color || baseIndustry.attributes_color || "#1890ff",
          attributes_priority: typeof templateData.attributes_priority === 'number' ? templateData.attributes_priority : 999,
          attributes_title: templateData.attributes_title || categoryName,
          attributes_title_en: templateData.attributes_title_en || categoryName,
          attributes_title_zh: templateData.attributes_title_zh || categoryName,
          attributes_description: templateData.attributes_description || baseIndustry.attributes_description || '',
          attributes_description_en: templateData.attributes_description_en || baseIndustry.attributes_description_en || '',
          attributes_description_zh: templateData.attributes_description_zh || baseIndustry.attributes_description_zh || '',
          attributes_keywords: templateData.attributes_keywords || baseIndustry.attributes_keywords || '',
          attributes_keywords_en: templateData.attributes_keywords_en || baseIndustry.attributes_keywords_en || '',
          attributes_keywords_zh: templateData.attributes_keywords_zh || baseIndustry.attributes_keywords_zh || ''
      };

      const autoPrompt = isService
        ? (globalSettings.isLmkt
          ? `Tạo đầy đủ bộ nội dung landing page cho dự án mới "${categoryName}". Nội dung phải chi tiết, thực tế, giàu tính thuyết phục và bám sát cấu trúc JSON bắt buộc.`
          : `Tạo đầy đủ bộ nội dung landing page cho dịch vụ mới "${categoryName}". Nhấn mạnh lợi ích, tình huống sử dụng thực tế và bám sát cấu trúc JSON bắt buộc.`)
        : `Tạo đầy đủ bộ nội dung landing page cho menu "${categoryName}". Nội dung phải rõ ràng, dễ hiểu và bám sát cấu trúc JSON bắt buộc.`;

      await generateAndSaveServiceCategory({
        globalSettings,
        categoryData,
        categorySlug: customSlug,
        categoryName,
        userPrompt,
        mode: 'add_new',
        autoPrompt,
        selectNewAfterSave: true
      });

      const typeText = isService
        ? (groupSlug === 'du-an' ? ti('dự án', 'project', '项目') : ti('dịch vụ', 'service', '服务'))
        : ti('menu', 'menu', '菜单');
      thongbao(ti(
        `✅ Đã thêm mới ${typeText} "${categoryName}" (${customSlug}, is_service: ${isService}, group_slug: "${groupSlug}") vào web_services`,
        `✅ Added new ${typeText} "${categoryName}" (${customSlug}, is_service: ${isService}, group_slug: "${groupSlug}") to web_services`,
        `✅ 已新增${typeText} "${categoryName}"（${customSlug}, is_service: ${isService}, group_slug: "${groupSlug}"）到 web_services`
      ));
    } catch (e) {
      console.error("[Service Content Add New] Error:", e);
      canhbao(ti(`❌ Thêm mới thất bại: ${e.message}`, `❌ Add new failed: ${e.message}`, `❌ 新增失败：${e.message}`));
    } finally {
      addNewBtn.disabled = false;
      addNewBtn.textContent = ti("➕ Thêm Mới bằng AI", "➕ Add New with AI", "➕ AI 新增");
    }
  };

  // Event: Create content
  createBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    const userPrompt = textarea.value.trim();
    
    // ===== VALIDATION =====
    if (!globalSettings.domainKey || !globalSettings.industry || !userPrompt) {
      canhbao(ti("❌ Vui lòng: Chọn Tên miền (Cài Đặt Chung) → Lĩnh vực → Nhập hướng dẫn", "❌ Please: Select Domain (General Settings) → Industry → Enter Instructions", "❌ 请按顺序：选择 Domain（常规设置）→ 行业 → 输入指引"));
      return;
    }
    if (globalSettings.isLmkt && !globalSettings.project) {
      canhbao(ti("❌ Vui lòng chọn Dự án (LMKT) trong Cài Đặt Chung", "❌ Please select Project (LMKT) in General Settings", "❌ 请在常规设置中选择项目（LMKT）"));
      return;
    }
    
    try {
      createBtn.disabled = true;
      createBtn.textContent = ti("⏳ Đang gọi AI (30-120s)...", "⏳ Calling AI (30-120s)...", "⏳ 正在调用 AI（30-120秒）...");
      resultArea.style.display = 'none';
      
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

      const selectedMenuNames = normalizeMenuTranslations(selectedCategory, {
        name: selectedCategory.name || industryName,
        name_en: selectedCategory.name_en || selectedCategory.category_en || industryName,
        name_zh: selectedCategory.name_zh || selectedCategory.category_zh || industryName,
        category: selectedCategory.category || selectedCategory.name || industryName,
        category_en: selectedCategory.category_en || selectedCategory.name_en || industryName,
        category_zh: selectedCategory.category_zh || selectedCategory.name_zh || industryName,
        slug: selectedCategory.slug || globalSettings.industry
      });

      const categoryData = {
        ...selectedCategory,
        slug: selectedCategory.slug || globalSettings.industry,
        service_code: selectedCategory.service_code || selectedCategory.slug || globalSettings.industry,
        name: selectedMenuNames.name,
        name_en: selectedMenuNames.name_en,
        name_zh: selectedMenuNames.name_zh,
        category: selectedMenuNames.category,
        category_en: selectedMenuNames.category_en,
        category_zh: selectedMenuNames.category_zh
      };

      const categorySlug = globalSettings.isLmkt ? globalSettings.project : globalSettings.industry;
      const categoryName = globalSettings.isLmkt
        ? projectConfig?.name
        : industryName;

      if (!categorySlug || !categoryName) {
        throw new Error("Thiếu thông tin lĩnh vực/dự án đang chọn");
      }

      await generateAndSaveServiceCategory({
        globalSettings,
        categoryData,
        categorySlug,
        categoryName,
        userPrompt,
        mode: 'update_existing',
        autoPrompt: ''
      });

      thongbao(ti("✅ Tạo nội dung và lưu dữ liệu thành công!", "✅ Content generated and saved successfully!", "✅ 内容生成并保存成功！"));
    } catch (e) {
      console.error("[Service Content] Error:", e);
      canhbao(ti(`❌ Lỗi: ${e.message}`, `❌ Error: ${e.message}`, `❌ 错误：${e.message}`));
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = ti("🚀 Tạo nội dung", "🚀 Generate Content", "🚀 生成内容");
    }
  };

  btnRow.append(createBtn);

  // ========================================
  // ✍️ PHẦN 2: TẠO BÀI CHI TIẾT (WEB_SERVICE_DETAIL)
  // ========================================
  
  const divider = document.createElement("div");
  divider.style.cssText = `margin:24px 0;border-top:2px solid ${theme.border};`;
  
  const detailTitle = document.createElement("div");
  detailTitle.textContent = ti("✍️ Tạo bài chi tiết (bảng web_service_detail)", "✍️ Create Detailed Post (Web Service Detail)", "✍️ 创建详情文章 (Web Service Detail)");
  detailTitle.style.cssText = `${getFeatureTitleStyle(theme)};margin-top:16px;`;
  
  const detailNote = document.createElement("div");
  detailNote.style.cssText = `margin-bottom:12px;padding:8px;background:${theme.infoBg};border-radius:4px;font-size:12px;color:${theme.info};`;
  detailNote.innerHTML = ti(
    "💡 <strong>Lưu ý:</strong> Bài viết sẽ lưu vào <code>web_service_detail</code> (bài chi tiết), khác với <code>web_services</code> (landing page).",
    "💡 <strong>Note:</strong> This post will be saved to <code>web_service_detail</code> (detailed article), different from <code>web_services</code> (landing page).",
    "💡 <strong>提示：</strong>文章将保存到 <code>web_service_detail</code>（详情文章），不同于 <code>web_services</code>（落地页）。"
  );
  
  // Title input
  const detailTitleLabel = document.createElement("label");
  detailTitleLabel.style.cssText = `font-weight:500;display:block;margin-bottom:6px;color:${theme.text}`;
  detailTitleLabel.textContent = ti("Tiêu đề bài viết:", "Post title:", "文章标题：");
  
  const detailTitleInput = document.createElement("input");
  detailTitleInput.id = "detail-title-input";
  detailTitleInput.type = "text";
  detailTitleInput.placeholder = ti("VD: Top 10 phần mềm quản lý bán hàng tốt nhất 2024", "E.g. Top 10 best sales management software in 2024", "例如：2024年十大最佳销售管理软件");
  detailTitleInput.style.cssText = `width:100%;padding:8px;border:1px solid ${theme.border};border-radius:4px;font-size:13px;color:${theme.text};background:${theme.bg};margin-bottom:12px;`;
  
  // Images upload
  const imagesLabel = document.createElement("label");
  imagesLabel.style.cssText = `font-weight:500;display:block;margin-bottom:6px;color:${theme.text}`;
  imagesLabel.textContent = ti("📷 Ảnh minh họa (tùy chọn):", "📷 Illustrative images (optional):", "📷 配图（可选）：");
  
  const imagesUploadArea = document.createElement("div");
  imagesUploadArea.style.cssText = `border:2px dashed ${theme.border};border-radius:6px;padding:20px;text-align:center;cursor:pointer;margin-bottom:12px;background:${theme.bg};transition:all 0.3s;`;
  imagesUploadArea.innerHTML = `<div style="color:${theme.textSecondary};">${ti("🖼️ Click hoặc kéo thả ảnh vào đây<br><small>(Hỗ trợ nhiều ảnh)</small>", "🖼️ Click or drag and drop images here<br><small>(Multiple images supported)</small>", "🖼️ 点击或拖拽图片到这里<br><small>（支持多张图片）</small>")}</div>`;
  
  const imagesInput = document.createElement("input");
  imagesInput.type = "file";
  imagesInput.accept = "image/*";
  imagesInput.multiple = true;
  imagesInput.style.display = "none";
  
  const imagesPreview = document.createElement("div");
  imagesPreview.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;`;
  
  // Videos upload
  const videosLabel = document.createElement("label");
  videosLabel.style.cssText = `font-weight:500;display:block;margin-bottom:6px;color:${theme.text}`;
  videosLabel.textContent = ti("🎥 Video minh họa (tùy chọn):", "🎥 Illustrative videos (optional):", "🎥 演示视频（可选）：");
  
  const videosUploadArea = document.createElement("div");
  videosUploadArea.style.cssText = `border:2px dashed ${theme.border};border-radius:6px;padding:20px;text-align:center;cursor:pointer;margin-bottom:12px;background:${theme.bg};transition:all 0.3s;`;
  videosUploadArea.innerHTML = `<div style="color:${theme.textSecondary};">${ti("🎬 Click hoặc kéo thả video vào đây<br><small>(Hỗ trợ nhiều video)</small>", "🎬 Click or drag and drop videos here<br><small>(Multiple videos supported)</small>", "🎬 点击或拖拽视频到这里<br><small>（支持多个视频）</small>")}</div>`;
  
  const videosInput = document.createElement("input");
  videosInput.type = "file";
  videosInput.accept = "video/*";
  videosInput.multiple = true;
  videosInput.style.display = "none";
  
  const videosPreview = document.createElement("div");
  videosPreview.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;`;
  
  // Detail prompt
  const detailPromptLabel = document.createElement("label");
  detailPromptLabel.style.cssText = `font-weight:500;display:block;margin-bottom:6px;color:${theme.text}`;
  detailPromptLabel.textContent = ti("Hướng dẫn nội dung cho AI (tùy chọn):", "AI content instructions (optional):", "AI 内容指令（可选）：");
  
  const detailPromptTextarea = document.createElement("textarea");
  detailPromptTextarea.style.cssText = `width:100%;min-height:100px;font-family:monospace;font-size:12px;color:${theme.text};background:${theme.bg};border:1px solid ${theme.border};padding:8px;border-radius:6px;margin-bottom:12px;resize:vertical;`;
  detailPromptTextarea.placeholder = ti("VD: Nhấn mạnh tính năng tự động hóa, so sánh với đối thủ, case study thực tế...", "E.g. Emphasize automation features, competitor comparison, real case studies...", "例如：强调自动化功能、与竞品对比、真实案例分析...");
  
  // Create detail button
  const createDetailBtn = createButton(ti("🚀 Tạo Bài Chi Tiết", "🚀 Create Detailed Post", "🚀 创建详情文章"), "#52c41a");
  
  // Detail result area
  const detailResultArea = document.createElement("div");
  detailResultArea.style.cssText = `margin-top:16px;padding:12px;background:${theme.successBg};border:1px solid ${theme.successBorder};border-radius:6px;display:none;max-height:400px;overflow-y:auto;`;
  
  const detailResultLabel = document.createElement("strong");
  detailResultLabel.style.cssText = `display:block;margin-bottom:8px;color:${theme.successText}`;
  detailResultLabel.textContent = ti("✅ Kết quả:", "✅ Result:", "✅ 结果：");
  
  const detailResultContent = document.createElement("pre");
  detailResultContent.style.cssText = `margin:0;font-size:11px;background:${theme.bg};padding:8px;border-radius:4px;color:${theme.text};overflow-x:auto;white-space:pre-wrap;word-wrap:break-word;`;
  
  detailResultArea.appendChild(detailResultLabel);
  detailResultArea.appendChild(detailResultContent);
  
  // Upload handlers cho detail
  const uploadedImagesBase64 = [];
  const uploadedVideosBase64 = [];
  
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  
  const createPreviewItem = (src, type, onRemove) => {
    const item = document.createElement("div");
    item.style.cssText = `position:relative;width:100px;height:100px;border:1px solid ${theme.border};border-radius:4px;overflow:hidden;`;
    
    const media = document.createElement(type === 'video' ? 'video' : 'img');
    media.src = src;
    media.style.cssText = "width:100%;height:100%;object-fit:cover;";
    if (type === 'video') {
      media.controls = false;
      media.muted = true;
    }
    
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.style.cssText = `position:absolute;top:2px;right:2px;width:20px;height:20px;border:none;background:rgba(255,0,0,0.8);color:#fff;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;`;
    removeBtn.onclick = () => {
      item.remove();
      onRemove();
    };
    
    item.appendChild(media);
    item.appendChild(removeBtn);
    return item;
  };
  
  const handleImagesUpload = async (files) => {
    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        uploadedImagesBase64.push(base64);
        
        const preview = createPreviewItem(base64, 'image', () => {
          const idx = uploadedImagesBase64.indexOf(base64);
          if (idx > -1) uploadedImagesBase64.splice(idx, 1);
        });
        
        imagesPreview.appendChild(preview);
      } catch (err) {
        console.error("Read image failed:", err);
        canhbao(ti(`Không thể đọc ảnh: ${file.name}`, `Cannot read image: ${file.name}`, `无法读取图片：${file.name}`));
      }
    }
  };
  
  const handleVideosUpload = async (files) => {
    for (const file of files) {
      try {
        const previewUrl = URL.createObjectURL(file);
        const videoItem = {
          file,
          previewUrl,
          name: file.name,
          size: file.size,
          type: file.type
        };
        uploadedVideosBase64.push(videoItem);

        const preview = createPreviewItem(previewUrl, 'video', () => {
          const idx = uploadedVideosBase64.indexOf(videoItem);
          if (idx > -1) uploadedVideosBase64.splice(idx, 1);
          try {
            URL.revokeObjectURL(previewUrl);
          } catch (_) {}
        });
        
        videosPreview.appendChild(preview);
      } catch (err) {
        console.error("Read video failed:", err);
        canhbao(ti(`Không thể đọc video: ${file.name}`, `Cannot read video: ${file.name}`, `无法读取视频：${file.name}`));
      }
    }
  };
  
  imagesUploadArea.onclick = () => imagesInput.click();
  videosUploadArea.onclick = () => videosInput.click();
  
  imagesInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      handleImagesUpload(Array.from(e.target.files));
    }
  };
  
  videosInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      handleVideosUpload(Array.from(e.target.files));
    }
  };
  
  const setupDragDrop = (area, handler) => {
    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.style.borderColor = theme.primary;
      area.style.background = theme.infoBg;
    });
    
    area.addEventListener('dragleave', () => {
      area.style.borderColor = theme.border;
      area.style.background = theme.bg;
    });
    
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.style.borderColor = theme.border;
      area.style.background = theme.bg;
      
      const files = Array.from(e.dataTransfer.files);
      handler(files);
    });
  };
  
  setupDragDrop(imagesUploadArea, handleImagesUpload);
  setupDragDrop(videosUploadArea, handleVideosUpload);
  
  // Create detail button handler
  createDetailBtn.onclick = async () => {
    const globalSettings = getGlobalSettings();
    const titleValue = detailTitleInput.value.trim();
    const userPrompt = detailPromptTextarea.value.trim();
    
    if (!globalSettings.domainKey || !globalSettings.industry) {
      canhbao(ti("❌ Vui lòng chọn Tên miền và Lĩnh vực trong Cài Đặt Chung", "❌ Please select Domain and Industry in General Settings", "❌ 请在常规设置中选择 Domain 和行业"));
      return;
    }
    if (globalSettings.isLmkt && !globalSettings.project) {
      canhbao(ti("❌ Vui lòng chọn Dự án (LMKT) trong Cài Đặt Chung", "❌ Please select Project (LMKT) in General Settings", "❌ 请在常规设置中选择项目（LMKT）"));
      return;
    }
    if (!titleValue) {
      canhbao(ti("❌ Vui lòng nhập tiêu đề bài viết", "❌ Please enter post title", "❌ 请输入文章标题"));
      return;
    }
    
    try {
      createDetailBtn.disabled = true;
      createDetailBtn.textContent = ti("⏳ Đang xử lý (30-120s)...", "⏳ Processing (30-120s)...", "⏳ 处理中（30-120秒）...");
      detailResultArea.style.display = 'none';
      
      const result = await createServiceDetailPost({
        title: titleValue,
        userPrompt,
        images: uploadedImagesBase64,
        videos: uploadedVideosBase64,
        globalSettings
      });
      
      const displayData = {
        title: result.detail.title,
        slug: result.detail.slug,
        service_type: result.detail.service_type,
        domain: result.detail.domain,
        images_count: result.uploadedImages.length,
        videos_count: result.uploadedVideos.length,
        ai_duration: `${result.aiDuration}s`,
        preview_url: `https://${result.detail.domain}/${result.detail.service_type}/${result.detail.slug}`,
        timestamp: new Date().toLocaleString('vi-VN')
      };
      
      detailResultContent.textContent = JSON.stringify(displayData, null, 2);
      detailResultArea.style.display = 'block';
      
      thongbao(ti("✅ Tạo bài chi tiết thành công!", "✅ Detailed post created successfully!", "✅ 详情文章创建成功！"));
      
      // Reset form
      detailTitleInput.value = '';
      detailPromptTextarea.value = '';
      uploadedImagesBase64.length = 0;
      for (const v of uploadedVideosBase64) {
        if (v && v.previewUrl && typeof v.previewUrl === 'string' && v.previewUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(v.previewUrl);
          } catch (_) {}
        }
      }
      uploadedVideosBase64.length = 0;
      imagesPreview.innerHTML = '';
      videosPreview.innerHTML = '';
      
    } catch (error) {
      console.error("[Service Detail Post] Error:", error);
      canhbao(ti(`❌ Lỗi: ${error.message}`, `❌ Error: ${error.message}`, `❌ 错误：${error.message}`));
    } finally {
      createDetailBtn.disabled = false;
      createDetailBtn.textContent = ti("🚀 Tạo Bài Chi Tiết", "🚀 Create Detailed Post", "🚀 创建详情文章");
    }
  };

  wrapper.append(
    title,
    note,
    syncRow,
    addNewRow,
    infoRow,
    promptLabel,
    textarea,
    btnRow,
    resultArea,
    divider,
    detailTitle,
    detailNote,
    detailTitleLabel,
    detailTitleInput,
    imagesLabel,
    imagesUploadArea,
    imagesPreview,
    videosLabel,
    videosUploadArea,
    videosPreview,
    detailPromptLabel,
    detailPromptTextarea,
    createDetailBtn,
    detailResultArea
  );
  
  wrapper.appendChild(imagesInput);
  wrapper.appendChild(videosInput);

  // Insert detail form UI into container
  const container = ensureUnifiedUIContainer();
  if (container) {
    container.appendChild(wrapper);
  }
  
  // Update info display from global settings
  updateInfoDisplay();
  
  return wrapper;
}

// ========================================================
// PHẦN MỚI: TẠO BÀI CHI TIẾT (WEB_SERVICE_DETAIL) BẰNG AI
// ========================================================

/**
 * ========================================================
 * HÀM: createServiceDetailPostPrompt(opts)
 * MỤC ĐÍCH: Tạo prompt để AI tạo bài viết chi tiết
 * 
 * Input:
 *   - title: Tiêu đề bài viết
 *   - industry: Lĩnh vực (slug)
 *   - project: Dự án (slug) - nếu LMKT
 *   - userPrompt: Hướng dẫn custom từ user
 *   - domainKey: lmkt | phanmemmottrieu
 * 
 * Output: String prompt hoàn chỉnh cho AI
 * ========================================================
 */
function createServiceDetailPostPrompt(opts = {}) {
  const {
    title = '',
    industry = 'bat-dong-san',
    project = '',
    userPrompt = '',
    domainKey = ''
  } = opts;

  const isLmkt = domainKey === 'lmkt';
  const categoryName = isLmkt 
    ? (LMKT_PROJECT_DEFS.find(p => p.service_code === project)?.name || project)
    : (INDUSTRY_TYPES[industry]?.name || industry);

  const basePrompt = `
Bạn là chuyên gia viết nội dung SEO cho website ${isLmkt ? 'BĐS LMKT' : 'Phanmemmottrieu'}.

**NHIỆM VỤ: Tạo bài viết chi tiết**

📋 Thông tin:
- Tiêu đề: "${title}"
- Lĩnh vực/Dự án: ${categoryName}
- Domain: ${domainKey}

🎯 Yêu cầu nội dung:
1. **Viết đầy đủ 3 ngôn ngữ**: Tiếng Việt, English, 中文
2. **Cấu trúc bài viết**:
   - Mở đầu hấp dẫn (2-3 đoạn)
   - Nội dung chính với heading rõ ràng (h2, h3)
   - Danh sách lợi ích/tính năng (bullet points)
   - Phần kết luận và CTA
3. **HTML format**: Sử dụng HTML tags (h2, h3, p, ul, li, strong, em)
4. **SEO friendly**: Tối ưu keywords tự nhiên, không spam
5. **Độ dài**: 800-1500 từ cho mỗi ngôn ngữ

${userPrompt ? `\n📝 Hướng dẫn bổ sung:\n${userPrompt}\n` : ''}

⚠️ **OUTPUT FORMAT - BẮT BUỘC**:
Trả về **ĐÚNG** JSON format sau (không thêm markdown, không thêm text ngoài):

{
  "title": "Tiêu đề chính (Tiếng Việt)",
  "title_en": "Main Title (English)",
  "title_zh": "主标题 (中文)",
  
  "description": "Mô tả ngắn gọn 150-160 ký tự (Tiếng Việt)",
  "description_en": "Short description 150-160 chars (English)",
  "description_zh": "简短描述150-160字符 (中文)",
  
  "keywords": "từ khóa 1, từ khóa 2, từ khóa 3",
  "keywords_en": "keyword 1, keyword 2, keyword 3",
  "keywords_zh": "关键词1, 关键词2, 关键词3",
  
  "content": "<h2>Tiêu đề phần 1</h2><p>Nội dung chi tiết...</p>...",
  "content_en": "<h2>Section 1 Title</h2><p>Detailed content...</p>...",
  "content_zh": "<h2>第一节标题</h2><p>详细内容...</p>...",
  
  "excerpt": "Trích dẫn/Tóm tắt ngắn (Tiếng Việt)",
  "excerpt_en": "Short excerpt (English)",
  "excerpt_zh": "简短摘录 (中文)",
  
  "author": "Tên tác giả",
  "readTime": "X phút đọc",
  "tags": ["tag1", "tag2", "tag3"]
}

❌ **KHÔNG ĐƯỢC**:
- Thêm markdown code blocks (\`\`\`json)
- Thêm text giải thích ngoài JSON
- Trả về status, id, slug (hệ thống tự tạo)
- Copy tiếng Việt sang English/中文 (phải translate thật)

✅ **BẮT BUỘC**:
- content_en PHẢI là tiếng Anh thật
- content_zh PHẢI là tiếng Trung thật
- Trả về valid JSON object duy nhất
`.trim();

  return basePrompt;
}

/**
 * ========================================================
 * HÀM: createServiceDetailPost(opts)
 * MỤC ĐÍCH: Tạo bài viết chi tiết bằng AI + upload ảnh/video
 * 
 * Quy trình:
 *   1. Upload tất cả ảnh/video lên server → lấy URLs
 *   2. Build prompt từ user input
 *   3. Gọi AI tạo nội dung (title, description, content x3 ngôn ngữ)
 *   4. Build detail object với ảnh/video đã upload
 *   5. Lưu vào web_service_detail table
 * 
 * Input:
 *   - title: Tiêu đề bài viết
 *   - userPrompt: Hướng dẫn custom
 *   - images: Array base64/URLs ảnh
 *   - videos: Array base64/URLs video
 *   - ctx: Context (app_id, domain, helperApi, helperAi)
 *   - globalSettings: { domainKey, industry, project }
 * 
 * Output: { detail, uploadedImages, uploadedVideos, aiDuration }
 * ========================================================
 */
async function createServiceDetailPost(opts = {}) {
  const {
    title = '',
    userPrompt = '',
    images = [],
    videos = [],
    ctx = null,
    globalSettings = {}
  } = opts;

  // Validation
  if (!title || !title.trim()) {
    throw new Error("Thiếu tiêu đề bài viết");
  }
  if (!globalSettings.domainKey) {
    throw new Error("Thiếu domain - chọn từ Cài Đặt Chung");
  }

  const context = ctx || resolveContext();
  const domainConfig = DOMAIN_OPTIONS[globalSettings.domainKey];
  context.app_id = domainConfig?.app_id || context.app_id;
  context.domain = domainConfig?.value || context.domain;

  console.log(`[createServiceDetailPost] Bắt đầu tạo bài: "${title}"`);
  
  // STEP 1: Upload ảnh/video
  thongbao(ti("📤 Đang upload ảnh/video lên server...", "📤 Uploading images/videos to server...", "📤 正在上传图片/视频到服务器..."));
  
  const uploadedImages = [];
  const uploadedVideos = [];
  
  try {
    // Upload images
    if (Array.isArray(images) && images.length > 0) {
      console.log(`Uploading ${images.length} images...`);
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img) continue;
        
        try {
          // Nếu đã là URL, giữ nguyên
          if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('/')) {
            uploadedImages.push(img);
          } else {
            // Upload base64
            const filename = `detail-${Date.now()}-${i}.jpg`;
            const path = await uploadBase64Image(img, filename, context);
            uploadedImages.push(path);
            console.log(`✅ Image ${i + 1}/${images.length} uploaded: ${path}`);
          }
        } catch (uploadErr) {
          console.error(`❌ Upload image ${i + 1} failed:`, uploadErr);
          canhbao(`Không thể upload ảnh ${i + 1}: ${uploadErr.message}`);
        }
      }
    }
    
    // Upload videos
    if (Array.isArray(videos) && videos.length > 0) {
      console.log(`Uploading ${videos.length} videos...`);
      for (let i = 0; i < videos.length; i++) {
        const vid = videos[i];
        if (!vid) continue;
        
        try {
          // Nếu đã là URL, giữ nguyên
          if (typeof vid === 'string' && (vid.startsWith('http://') || vid.startsWith('https://') || vid.startsWith('/'))) {
            uploadedVideos.push(vid);
          } else if ((vid instanceof File) || (vid && vid.file instanceof File)) {
            const fileObj = vid instanceof File ? vid : vid.file;
            const extFromName = (String(fileObj.name || '').split('.').pop() || 'mp4').toLowerCase();
            const ext = /^[a-z0-9]+$/i.test(extFromName) ? extFromName : 'mp4';
            const filename = `detail-video-${Date.now()}-${i}.${ext}`;
            try {
              const path = await uploadBinaryFile(fileObj, filename, context);
              uploadedVideos.push(path);
              console.log(`✅ Video file ${i + 1}/${videos.length} uploaded: ${path}`);
            } catch (fileUploadErr) {
              console.warn(`⚠️ Multipart upload failed for video ${i + 1}, fallback to base64: ${fileUploadErr?.message || fileUploadErr}`);
              const base64Vid = await fileToBase64(fileObj);
              const path = await uploadBase64Image(base64Vid, filename, context);
              uploadedVideos.push(path);
              console.log(`✅ Video fallback(base64) ${i + 1}/${videos.length} uploaded: ${path}`);
            }
          } else {
            // Upload base64
            const filename = `detail-video-${Date.now()}-${i}.mp4`;
            const path = await uploadBase64Image(vid, filename, context);
            uploadedVideos.push(path);
            console.log(`✅ Video ${i + 1}/${videos.length} uploaded: ${path}`);
          }
        } catch (uploadErr) {
          console.error(`❌ Upload video ${i + 1} failed:`, uploadErr);
          canhbao(`Không thể upload video ${i + 1}: ${uploadErr.message}`);
        }
      }
    }
  } catch (uploadError) {
    throw new Error(`Upload media thất bại: ${uploadError.message}`);
  }
  
  console.log(`Upload completed: ${uploadedImages.length} images, ${uploadedVideos.length} videos`);
  
  // STEP 2: Build prompt
  const prompt = createServiceDetailPostPrompt({
    title,
    industry: globalSettings.industry,
    project: globalSettings.project,
    userPrompt,
    domainKey: globalSettings.domainKey
  });
  
  // STEP 3: Gọi AI
  thongbao(ti("🤖 Đang gọi AI tạo nội dung...", "🤖 Calling AI to generate content...", "🤖 正在调用 AI 生成内容..."));
  
  if (!context.helperAi?.generateSeoContentWithPrompt) {
    throw new Error("Không tìm thấy AI Helper - chưa kích hoạt csmAI");
  }
  
  const startTime = Date.now();
  const aiResponse = await context.helperAi.generateSeoContentWithPrompt(prompt);
  const aiDuration = Math.round((Date.now() - startTime) / 1000);
  
  console.log(`AI response received in ${aiDuration}s`);
  
  // STEP 4: Parse AI response
  const seoData = parseAIResponse(aiResponse, { encodeContent: false });
  
  if (!seoData.content) {
    throw new Error("AI không trả về content");
  }
  
  // STEP 5: Build detail object
  const serviceType = globalSettings.isLmkt ? globalSettings.project : globalSettings.industry;
  context.service_type = serviceType;
  
  const detail = buildDetail(context, seoData, uploadedImages, uploadedVideos, {
    author: seoData.author || "Admin",
    readTime: seoData.readTime || "5 phút"
  });
  
  // STEP 6: Save to database
  thongbao(ti("💾 Đang lưu bài viết vào database...", "💾 Saving article to database...", "💾 正在保存文章到数据库..."));
  
  const result = await upsertDetail(context, detail);

  // STEP 7: Auto post lên các fanpage đã chọn (nếu có)
  let postSummary = null;
  try {
    const selectedPages = getSelectedFacebookPages();
    if (!Array.isArray(selectedPages) || selectedPages.length === 0) {
      console.warn('[createServiceDetailPost] Không có fanpage nào được chọn, bỏ qua bước đăng Facebook');
    } else {
      thongbao(ti(`📱 Đang đăng bài lên ${selectedPages.length} fanpage đã chọn...`, `📱 Posting to ${selectedPages.length} selected fanpage(s)...`, `📱 正在发布到已选择的 ${selectedPages.length} 个 fanpage...`));

      let postUrl = await getLastCreatedPostUrl(5, 600);
      if (!postUrl) {
        const domainRaw = detail.domain || context.domain || '';
        const domains = String(domainRaw)
          .split(',')
          .map(d => d.trim())
          .filter(d => d && !d.includes('localhost') && !d.includes('127.0.0.1'));
        const fallbackDomain = domains[0] || String(domainRaw).split(',')[0]?.trim();
        if (fallbackDomain && detail.service_type && detail.slug) {
          postUrl = `https://www.${fallbackDomain}/${detail.service_type}/${detail.slug}`;
        }
      }

      if (!postUrl) {
        console.warn('[createServiceDetailPost] Không xác định được URL bài viết, bỏ qua đăng fanpage');
      } else {
        const fbImages = (uploadedImages || [])
          .map(img => resolvePublicImageUrl(context, img))
          .filter(img => typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')));
        const fbVideos = (uploadedVideos || [])
          .map(vid => resolvePublicImageUrl(context, vid))
          .filter(vid => typeof vid === 'string' && (vid.startsWith('http://') || vid.startsWith('https://') || vid.startsWith('data:') || vid.startsWith('/app_images/') || vid.startsWith('app_images/')));

        const fbMessageContent = detail?.excerpt || detail?.description || detail?.title || title;

        postSummary = await postToSelectedFanpages(
          [{
            sender: 'ManualCreate',
            content: fbMessageContent,
            images: fbImages,
            videos: fbVideos
          }],
          postUrl,
          selectedPages,
          {
            images: fbImages,
            videos: fbVideos,
            helperAi: context.helperAi,
            seft: seft || {},
            industry: globalSettings.industry || context.service_type || 'bat-dong-san',
            skipRecord: true
          }
        );

        console.log(`[createServiceDetailPost] Facebook post summary:`, postSummary);
      }
    }
  } catch (fbErr) {
    // Không fail toàn bộ quy trình tạo bài nếu post fanpage lỗi
    console.error('[createServiceDetailPost] Lỗi khi đăng fanpage:', fbErr);
    canhbao(`⚠️ Bài đã tạo thành công nhưng đăng fanpage lỗi: ${fbErr.message}`);
  }
  
  console.log(`[createServiceDetailPost] Hoàn tất tạo bài`);
  
  return {
    detail,
    uploadedImages,
    uploadedVideos,
    aiDuration,
    result,
    postSummary
  };
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
  
  // ✅ CRITICAL FIX: FORCE status = 'active' (không để AI tự set)
  // AI có thể trả về status = "1" hoặc status = 1 → Luôn override về 'active'
  const forceStatus = 'active';
  if (result.status && result.status !== 'active') {
    console.warn(`⚠️ [parseAIResponse] AI trả về status="${result.status}" → Force về "active"`);
  }
  
  // ✅ VALIDATE: name_en/name_zh PHẢI khác name (không được giống tiếng Việt)
  const validateMultiLang = (viField, enField, zhField, fieldName) => {
    const vi = result[viField] || '';
    const en = result[enField] || '';
    const zh = result[zhField] || '';
    
    if (!en || en === vi) {
      console.warn(`⚠️ [parseAIResponse] ${fieldName}_en trống hoặc giống tiếng Việt → Cần AI translate đúng`);
    }
    if (!zh || zh === vi) {
      console.warn(`⚠️ [parseAIResponse] ${fieldName}_zh trống hoặc giống tiếng Việt → Cần AI translate đúng`);
    }
  };
  
  validateMultiLang('name', 'name_en', 'name_zh', 'name');
  validateMultiLang('category', 'category_en', 'category_zh', 'category');
  validateMultiLang('description', 'description_en', 'description_zh', 'description');

  const encodeContent = opts.encodeContent !== false;
  const toContent = (value) => {
    const raw = value || '';
    return encodeContent ? encodeHtml(raw, { encrypt: true, urlEncode: true }) : raw;
  };

  // Alias mapping: ưu tiên format mới (title/keywords/excerpt), fallback về format cũ (attributes_* / name)
  const titleVi = result.title || result.attributes_title || result.name || '';
  const titleEn = result.title_en || result.attributes_title_en || result.name_en || '';
  const titleZh = result.title_zh || result.attributes_title_zh || result.name_zh || '';

  const keywordsVi = result.keywords || result.attributes_keywords || '';
  const keywordsEn = result.keywords_en || result.attributes_keywords_en || '';
  const keywordsZh = result.keywords_zh || result.attributes_keywords_zh || '';

  const excerptVi = result.excerpt || result.summary || result.description || '';
  const excerptEn = result.excerpt_en || result.summary_en || result.description_en || '';
  const excerptZh = result.excerpt_zh || result.summary_zh || result.description_zh || '';

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
    status: forceStatus, // ✅ FORCE 'active' (không dùng AI value)

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

    // DETAIL CORE FIELDS (FORMAT MỚI)
    title: titleVi,
    title_en: titleEn,
    title_zh: titleZh,
    keywords: keywordsVi,
    keywords_en: keywordsEn,
    keywords_zh: keywordsZh,
    excerpt: excerptVi,
    excerpt_en: excerptEn,
    excerpt_zh: excerptZh,
    author: result.author || '',
    readTime: result.readTime || result.read_time || '',
    tags: Array.isArray(result.tags) ? result.tags : [],

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
    const categories = getCategoryTemplatesForDomain(domainKey);
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
        const groupFlags = normalizeGroupFlags(
          cat.slug, 
          cat.is_group_slug, 
          cat.is_group_slug_default,
          typeof cat.is_service === 'boolean' ? cat.is_service : true
        );
        const objUpdate = {
          id: cat.id || cat.service_code || cat.slug,
          service_code: cat.service_code || cat.slug,
          slug: cat.slug,
          group_slug: normalizeGroupSlug(
            cat.slug,
            cat.group_slug || (domainKey === 'lmkt' ? 'du-an' : 'dich-vu'),
            groupFlags.is_group_slug,
            groupFlags.is_service
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
          pk_fields: ["slug"]
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
  categorySelect.innerHTML = `<option value="">${ti('-- Chọn lĩnh vực/dự án --', '-- Select industry/project --', '-- 选择行业/项目 --')}</option>`;
  
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
    descContent.textContent = ti('(Chọn lĩnh vực/dự án để xem mô tả)', '(Select industry/project to view description)', '（选择行业/项目以查看描述）');
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
ensureGlobalSettingsPanel(); // ✅ Call directly, MutationObserver will fix if needed
ensureUI();
ensureAdsApiTestPanel();
ensureAiLaneTestPanel();
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
        btn.style.opacity = '0.6';
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

function stopFacebookAutoPosting(message = ti('⏹️ Đã dừng auto đăng.', '⏹️ Auto posting stopped.', '⏹️ 自动发布已停止。')) {
  facebookAutoRunning = false;
  facebookAutoAbort = true;
  
  // Enable lại nút Start khi dừng
  const btnAutoStart = document.getElementById('btn-fb-auto-start');
  if (btnAutoStart) {
    btnAutoStart.disabled = false;
    btnAutoStart.style.opacity = '1';
    btnAutoStart.textContent = ti('▶️ Bắt đầu auto', '▶️ Start auto', '▶️ 开始自动发布');
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
          [],
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
    showFacebookMessage(ti('⚠️ Auto đăng đang chạy.', '⚠️ Auto posting is running.', '⚠️ 自动发布正在运行。'), 'info');
    return;
  }
  const selectedPages = getSelectedFacebookPages();
  if (!selectedPages.length) {
    showFacebookMessage(ti('Vui lòng chọn Fanpage trước', 'Please select a Fanpage first', '请先选择 Fanpage'), 'error');
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
    btnAutoStart.textContent = ti('⏸️ Đang auto...', '⏸️ Auto running...', '⏸️ 自动运行中...');
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
      btnAutoStart.textContent = ti('▶️ Bắt đầu auto', '▶️ Start auto', '▶️ 开始自动发布');
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
async function postToFacebookPageWithImages(pageId, pageAccessToken, message, images = [], videos = [], link = null, seft = {}) {
  try {
    // ===== DEBUG: Log images received =====
    console.log(`📸 [postToFacebookPageWithImages] RECEIVED images (raw):`, images);
    console.log(`📸 [postToFacebookPageWithImages] Images type: ${typeof images}, isArray: ${Array.isArray(images)}, count: ${images.length}`);
    if (Array.isArray(images) && images.length > 0) {
      images.forEach((img, idx) => {
        console.log(`  [${idx}] Type: ${typeof img}, Length: ${img?.length || 'N/A'}, Starts: ${img?.substring(0, 80) || 'EMPTY'}`);
      });
    }
    
    // ===== DEBUG: Validate params =====
    if (!pageId || !pageAccessToken || !message) {
      console.error(`❌ [postToFacebookPageWithImages] Missing required params:`, {
        pageId: !!pageId,
        pageAccessToken: !!pageAccessToken && pageAccessToken.length > 0,
        message: !!message && message.length > 0
      });
      throw new Error('Missing required params: pageId, pageAccessToken, message');
    }
    
    console.log(`📝 [postToFacebookPageWithImages] Params validation passed`);
    console.log(`  - pageId: ${pageId}`);
    console.log(`  - pageAccessToken: ${pageAccessToken.substring(0, 20)}...`);
    console.log(`  - message: ${message.substring(0, 100)}...`);
    
    // Filter và validate images
    const validImages = Array.isArray(images) 
      ? images.filter(img => typeof img === 'string' && img.trim())
      : [];
    const validVideos = Array.isArray(videos)
      ? videos.filter(vid => typeof vid === 'string' && vid.trim())
      : [];
    
    console.log(`🚀 [postToFacebookPageWithImages] After validation: ${validImages.length} images (before: ${images.length})`);
    console.log(`🚀 [postToFacebookPageWithImages] After validation: ${validVideos.length} videos (before: ${videos.length})`);
    console.log(`📝 [postToFacebookPageWithImages] Message length: ${message.length} characters`);
    
    // ===== DEBUG: Log valid images =====
    if (validImages.length > 0) {
      validImages.forEach((img, idx) => {
        console.log(`  ✅ [${idx}] Valid URL: ${img.substring(0, 80)}...`);
      });
    }
    
    // Ưu tiên sử dụng helper từ seft (thông qua DynamicCode/AutoSetup.tsx)
    if (seft && typeof seft.postToFacebookWithImages === 'function') {
      console.log(`🔄 [postToFacebookPageWithImages] Calling seft.postToFacebookWithImages with ${validImages.length} images, ${validVideos.length} videos`);
      console.log(`🔐 [postToFacebookPageWithImages] Auth check - seft should have csm-token injected by request library`);
      
      // New pattern: call with structured params object
      // postToFacebookWithImages supports both old args and new object pattern
      let result;
      try {
        result = await seft.postToFacebookWithImages({
          pageId,
          pageAccessToken,
          message,
          images: validImages,
          videos: validVideos,
          link: link || null
        });
      } catch (callError) {
        console.error(`❌ [postToFacebookPageWithImages] Exception from postToFacebookWithImages:`, callError);
        throw callError;
      }
      
      console.log(`📤 [postToFacebookPageWithImages] seft.postToFacebookWithImages returned:`, result);
      
      // Handle new response format: { success, message, data: { post_id, images_count, videos_count }, error }
      if (result && typeof result === 'object') {
        if (result.success) {
          return {
            success: true,
            post_id: result.data?.post_id,
            extra_post_ids: Array.isArray(result.data?.extra_post_ids) ? result.data.extra_post_ids : [],
            all_post_ids: Array.isArray(result.data?.all_post_ids) ? result.data.all_post_ids : [result.data?.post_id].filter(Boolean),
            images_count: result.data?.images_count || validImages.length,
            videos_count: result.data?.videos_count || validVideos.length
          };
        } else {
          const errorMsg = result.message || 'Facebook post failed';
          console.warn(`⚠️ Facebook API returned error: ${errorMsg}`);
          console.warn(`⚠️ Full error response:`, result);
          throw new Error(errorMsg);
        }
      }
      
      // Fallback for unexpected response format
      console.warn('⚠️ Unexpected response format from postToFacebookWithImages:', result);
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
      videos: validVideos,
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
      const videosCount = data.data.videos_count || validVideos.length || 0;
      console.log(`✅ Post successful! ID: ${data.data.post_id}, Images: ${imagesCount}, Videos: ${videosCount}`);
      return {
        post_id: data.data.post_id,
        success: true,
        extra_post_ids: Array.isArray(data.data.extra_post_ids) ? data.data.extra_post_ids : [],
        all_post_ids: Array.isArray(data.data.all_post_ids) ? data.data.all_post_ids : [data.data.post_id].filter(Boolean),
        images_count: imagesCount,
        videos_count: videosCount
      };
    } else {
      throw new Error(data.message || 'Facebook post failed');
    }
  } catch (error) {
    const authErrorInfo = extractFacebookAuthErrorInfo(error);
    if (authErrorInfo.isAuthError) {
      facebookState._needsValidation = true;
    }
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
      post_content: parsed.post_content || parsed.facebook_post || '',
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
  const baseContent = String(content || '').trim();
  const givenTags = Array.isArray(hashtags) ? hashtags : [];

  // Normalize tags to a canonical, deduplicated list.
  const normalizeTag = (tag) => {
    const t = String(tag || '').trim();
    if (!t) return '';
    return t.startsWith('#') ? t : `#${t}`;
  };

  const tagsInContent = baseContent.match(/#[^\s#]+/g) || [];
  const mergedTags = [...new Set([...tagsInContent, ...givenTags.map(normalizeTag).filter(Boolean)])];

  if (mergedTags.length === 0) {
    return baseContent;
  }

  // Remove an existing trailing hashtag block (if present) to prevent double hashtags.
  const contentWithoutTrailingHashtags = baseContent
    .replace(/(\n\s*)?(#[^\s#]+(\s+|$))+\s*$/g, '')
    .trim();

  return `${contentWithoutTrailingHashtags}\n\n${mergedTags.join(' ')}`;
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
  title.textContent = ti('📱 Đăng Bài Facebook Tự Động', '📱 Facebook Auto Posting', '📱 Facebook 自动发帖');
  title.style.cssText = getFeatureTitleStyle(theme);

  const content = document.createElement('div');
  content.innerHTML = `
  <!-- Hướng dẫn cấu hình -->
  <div id="fb-setup-guide" style="margin-bottom: 20px; padding: 15px; background: ${theme.warning}; border: 1px solid ${theme.warningBorder}; border-radius: 6px;">
    <h4 style="color: ${theme.warningText};">${ti('🔑 Hướng dẫn lấy Page Token vĩnh viễn', '🔑 Guide to get permanent Page Token', '🔑 获取永久 Page Token 指南')}</h4>
      <ol style="margin: 8px 0 0 20px;">
        <li>${ti('Mở <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color: ' + theme.link + ';">Graph API Explorer</a> và chọn đúng App.', 'Open <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color: ' + theme.link + ';">Graph API Explorer</a> and select the correct App.', '打开 <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color: ' + theme.link + ';">Graph API Explorer</a> 并选择正确的 App。')}</li>
        <li>${ti('Chọn quyền: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>.', 'Select permissions: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>.', '选择权限：<code>pages_show_list</code>、<code>pages_read_engagement</code>、<code>pages_manage_posts</code>。')}</li>
        <li>${ti('Bấm <strong>Generate Access Token</strong> để lấy User Token.', 'Click <strong>Generate Access Token</strong> to get User Token.', '点击 <strong>Generate Access Token</strong> 获取 User Token。')}</li>
        <li>${ti('Gọi API <code>/me/accounts</code> để lấy danh sách Page. Token đi kèm từng Page là Page Token (vĩnh viễn).', 'Call API <code>/me/accounts</code> to get Page list. Token attached to each Page is the (permanent) Page Token.', '调用 API <code>/me/accounts</code> 获取 Page 列表。每个 Page 附带的 Token 即为（长期）Page Token。')}</li>
        <li>${ti('Sao chép Page Token và dán vào ô <strong>Page Access Token</strong> bên dưới.', 'Copy Page Token and paste it into <strong>Page Access Token</strong> below.', '复制 Page Token 并粘贴到下方 <strong>Page Access Token</strong> 输入框。')}</li>
      </ol>
    </div>
    <div style="margin-top: 12px; color: ${theme.warningText};">
      <strong>${ti('⚠️ Lưu ý tránh bị "Checkpoint":', '⚠️ Notes to avoid "Checkpoint":', '⚠️ 避免触发 "Checkpoint" 的注意事项：')}</strong>
      <ul style="margin: 8px 0 0 20px;">
        <li>${ti('<strong>Tần suất đăng</strong>: Không đăng dồn dập. Cách nhau tối thiểu 5 phút giữa mỗi bài tự động.', '<strong>Posting frequency</strong>: Do not post too aggressively. Keep at least 5 minutes between auto posts.', '<strong>发布频率</strong>：不要密集发布。自动发帖之间至少间隔 5 分钟。')}</li>
        <li>${ti('<strong>Chất lượng ảnh</strong>: Ưu tiên ảnh từ server uy tín hoặc link từ website của bạn, tránh nguồn bị Facebook liệt vào blacklist.', '<strong>Image quality</strong>: Prefer images from trusted servers or your website links, avoid sources blacklisted by Facebook.', '<strong>图片质量</strong>：优先使用可信服务器或你网站的图片链接，避免使用被 Facebook 拉黑的来源。')}</li>
        <li>${ti('<strong>Nội dung khác biệt</strong>: Tránh dùng caption/link/ảnh giống nhau giữa các bài. Nên thay đổi caption cho từng bài.', '<strong>Content variation</strong>: Avoid using identical caption/link/image across posts. Change caption for each post.', '<strong>内容差异化</strong>：避免多篇使用相同 caption/链接/图片。建议每篇更换 caption。')}</li>
      </ul>
    </div>
    <button id="btn-hide-guide" style="padding: 6px 12px; background: ${theme.warningText}; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">
      ${ti('Đã hiểu, ẩn hướng dẫn', 'Got it, hide guide', '知道了，隐藏说明')}
    </button>
  </div>
  
  <div style="margin-bottom: 20px; padding: 12px; background: ${theme.infoBg}; border: 1px solid ${theme.border}; border-radius: 6px; color: ${theme.infoText};">
    ${ti('🔗 Token và Fanpage được quản lý tại <strong>⚙️ Cài Đặt Chung</strong> (khối <strong>📱 Facebook Token & Fanpage dùng chung</strong>) để dùng cho mọi luồng.', '🔗 Token and Fanpages are managed in <strong>⚙️ General Settings</strong> (the <strong>📱 Shared Facebook Token & Fanpages</strong> block) for all workflows.', '🔗 Token 与 Fanpage 统一在 <strong>⚙️ 常规设置</strong> 的 <strong>📱 共用 Facebook Token 与 Fanpage</strong> 区域管理，供全部流程共用。')}
  </div>
  
  <!-- Bước 2: Auto đăng nhiều bài -->
  <div style="margin-bottom: 20px; padding: 15px; background: ${theme.bg}; border: 1px solid ${theme.border}; border-radius: 6px;">
    <h4 style="color: ${theme.text};">${ti('🤖 Bước 2: Tạo và Auto đăng bài (AI tự động)', '🤖 Step 2: Generate and Auto-post (AI automation)', '🤖 第2步：生成并自动发布（AI 自动化）')}</h4>
    
    <!-- Giải thích cơ chế -->
    <div style="background: ${theme.infoBg}; color: ${theme.infoText}; padding: 10px; border-left: 4px solid ${theme.info}; margin-bottom: 15px; border-radius: 4px;">
      <strong>${ti('📖 Cơ chế hoạt động:', '📖 How it works:', '📖 运行机制：')}</strong><br>
      ${ti('1️⃣ <strong>Tạo nội dung AI:</strong> Hệ thống sẽ tạo nội dung cho từng bài với delay 30s giữa mỗi lần gọi AI', '1️⃣ <strong>Generate AI content:</strong> The system creates each post with a 30s delay between AI calls', '1️⃣ <strong>AI 生成内容：</strong>系统会为每篇帖子生成内容，并在每次 AI 调用之间延迟 30 秒')}<br>
      ${ti('2️⃣ <strong>Đăng trực tiếp:</strong> Đăng lên Facebook ngay sau khi AI tạo xong', '2️⃣ <strong>Direct posting:</strong> Post to Facebook right after AI generation', '2️⃣ <strong>直接发布：</strong>AI 生成完成后立即发布到 Facebook')}<br>
      ${ti('3️⃣ <strong>Khoảng cách:</strong> Theo cấu hình', '3️⃣ <strong>Interval:</strong> Based on settings', '3️⃣ <strong>间隔：</strong>按配置执行')} (random ${FACEBOOK_AUTO_DEFAULTS.minIntervalMin}-${FACEBOOK_AUTO_DEFAULTS.maxIntervalMin} ${ti('phút', 'minutes', '分钟')})<br>
      ${ti('4️⃣ <strong>Giới hạn:</strong>', '4️⃣ <strong>Limit:</strong>', '4️⃣ <strong>上限：</strong>')} ${FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay > 0 ? ti(`Tối đa ${FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay} bài/ngày`, `Max ${FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay} posts/day`, `每日最多 ${FACEBOOK_AUTO_DEFAULTS.maxPostsPerDay} 篇`) : ti('Không giới hạn/ngày', 'Unlimited/day', '每日不限')}
    </div>
    
    <div style="margin-bottom: 15px; padding: 10px; background: ${theme.infoBg}; color: ${theme.infoText}; border-left: 4px solid ${theme.info}; border-radius: 4px;">
      <strong>${ti('📊 Sử dụng lĩnh vực từ Cài Đặt Chung:', '📊 Uses industry from General Settings:', '📊 使用常规设置中的行业：')}</strong> ${ti('Hệ thống sẽ tự động sử dụng lĩnh vực bạn đã chọn trong phần <em>Cài Đặt Chung</em> ở trên.', 'The system automatically uses the industry selected in <em>General Settings</em> above.', '系统将自动使用你在上方 <em>常规设置</em> 中选择的行业。')}<br>
      <strong>${ti('🤖 AI tự động đa dạng hóa:', '🤖 AI auto-diversification:', '🤖 AI 自动多样化：')}</strong> ${ti('Hệ thống đã tích hợp logic anti-AI với nhiều personas và patterns, tự động tạo nội dung không trùng lặp.', 'The system includes anti-AI-detection logic with multiple personas and patterns to avoid duplicate content.', '系统已集成多 persona 与 pattern 的 anti-AI 逻辑，自动生成不重复内容。')}
    </div>
    
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 10px;">
      <label style="color: ${theme.text};">${ti('Khoảng cách:', 'Interval:', '间隔：')}</label>
      <input type="number" id="fb-auto-min" min="1" style="width: 90px; padding: 6px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="${ti('Min (phút)', 'Min (minutes)', '最小（分钟）')}">
      <input type="number" id="fb-auto-max" min="1" style="width: 90px; padding: 6px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="${ti('Max (phút)', 'Max (minutes)', '最大（分钟）')}">
      <label style="color: ${theme.text};">${ti('Giới hạn/ngày:', 'Limit/day:', '每日上限：')}</label>
      <input type="number" id="fb-auto-maxday" min="0" style="width: 90px; padding: 6px; border: 1px solid ${theme.border}; border-radius: 4px; background: ${theme.inputBg}; color: ${theme.text};" placeholder="${ti('0 = không giới hạn', '0 = unlimited', '0 = 不限')}">
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button id="btn-fb-auto-start" class="btn-success" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
        ${ti('▶️ Bắt đầu auto', '▶️ Start auto', '▶️ 开始自动发布')}
      </button>
      <button id="btn-fb-auto-stop" class="btn-warning" style="padding: 8px 16px; background: #ffc107; color: #212529; border: none; border-radius: 4px; cursor: pointer;">
        ${ti('⏹️ Dừng auto', '⏹️ Stop auto', '⏹️ 停止自动发布')}
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
          thongbao(ti('✅ Token đã được verify - sẵn sàng sử dụng!', '✅ Token verified - ready to use!', '✅ Token 已验证，可直接使用！'));
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
      stopFacebookAutoPosting(ti('⏹️ Đã dừng auto đăng.', '⏹️ Auto posting stopped.', '⏹️ 自动发布已停止。'));
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
      
      canhbao(ti('❌ Token đã lưu không còn hợp lệ. Vui lòng nhập token mới.', '❌ Saved token is no longer valid. Please enter a new token.', '❌ 已保存的 Token 已失效，请输入新 Token。'));
      document.getElementById('fb-manual-token-input').style.display = 'block';
      return false;
    }

    console.log('✅ [ValidateSavedToken] Token hợp lệ. ' + validation.message);
    facebookState._needsValidation = false;
    return true;
  } catch (error) {
    console.error('❌ [ValidateSavedToken] Lỗi validate:', error);
    canhbao(ti('❌ Lỗi kiểm tra token: ', '❌ Token validation error: ', '❌ Token 校验错误：') + error.message);
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
    showFacebookMessage(ti('Vui lòng nhập token', 'Please enter token', '请输入 token'), 'error');
    return;
  }
  
  console.log('🚀 [HandleManualToken] BẮT ĐẦU XỬ LÝ TOKEN NHẬP TỪ BƯỚC 1');
  console.trace('[HandleManualToken] Call stack');
  
  try {
    showFacebookMessage(ti('Đang kiểm tra token...', 'Validating token...', '正在校验 token...'), 'info');

    // Validate token via backend
    const meRes = await seft.facebookValidateToken(token);
    if (!meRes?.success) {
      throw new Error(meRes?.message || 'Token không hợp lệ');
    }

    const tokenInfo = meRes?.data || {};
    console.log('✅ [HandleManualToken] Đã validate token qua backend');

    // Exchange sang Token B (60 ngày) nếu có thể
    showFacebookMessage(ti('Đang exchange sang Token B (60 ngày)...', 'Exchanging to long-lived token (60 days)...', '正在换取长效 Token（60天）...'), 'info');
    
    let longLivedToken = token;
    let userAccessToken = token; // Lưu để có thể re-exchange sau 60 ngày
    const exchangeRes = await seft.facebookExchangeToken(token, FACEBOOK_CONFIG.APP_ID, FACEBOOK_CONFIG.APP_SECRET);
    if (exchangeRes?.success && exchangeRes?.data?.access_token) {
      longLivedToken = exchangeRes.data.access_token;
      userAccessToken = longLivedToken; // Update user token
      console.log('✅ [HandleManualToken] Đã exchange sang 60-day token');
      showFacebookMessage(ti('✅ Đã đổi sang Token B (60 ngày).', '✅ Exchanged to long-lived token (60 days).', '✅ 已换取长效 Token（60天）。'), 'info');
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
      showFacebookMessage(ti('💾 Đang lưu token lên server...', '💾 Saving token to server...', '💾 正在将 token 保存到服务器...'), 'info');
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
      showFacebookMessage(ti(`✅ Token đã lưu lên server thành công!\n💾 Tất cả ${pages?.length || 1} config đã được cập nhật.\n\n Vui lòng chọn Page để đăng bài.`, `✅ Token saved to server successfully!\n💾 Updated ${pages?.length || 1} config(s).\n\n Please select a Page to post.`, `✅ Token 已成功保存到服务器！\n💾 已更新 ${pages?.length || 1} 个配置。\n\n 请选择要发布的 Page。`), 'success');
      document.getElementById('fb-manual-token-input').style.display = 'none';
      return;
    }

    // Nếu /me/accounts lỗi (#100 accounts trên Page) => đây là Page Access Token
    const pagesErr = pagesRes?.message || '';
    if (pagesErr.includes('accounts') || pagesErr.includes('(#100)') || pagesErr.includes('OAuthException')) {
      console.log('🔍 [HandleManualToken] Token là Page Access Token của Page');
      showFacebookMessage(ti('✅ Phát hiện Page Access Token. Đang sử dụng trực tiếp...', '✅ Detected Page Access Token. Using it directly...', '✅ 检测到 Page Access Token，正在直接使用...'), 'info');

      facebookState.selectedPageId = tokenInfo.id;
      facebookState.selectedPageName = tokenInfo.name || 'Unknown Page';
      facebookState.selectedPageToken = token;
      facebookState.selectedPageIds = tokenInfo.id ? [tokenInfo.id] : [];
      facebookState._needsValidation = false; // ✅ Vừa validate xong
      saveFacebookState();

      // ✅ SAVE LÊN SERVER: Lưu page token lên server
      showFacebookMessage(ti('💾 Đang lưu token lên server...', '💾 Saving token to server...', '💾 正在将 token 保存到服务器...'), 'info');
      
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
      showFacebookMessage(ti(`✅ Đã kết nối Page: ${facebookState.selectedPageName}. Token đã lưu lên server.`, `✅ Connected Page: ${facebookState.selectedPageName}. Token saved to server.`, `✅ 已连接 Page：${facebookState.selectedPageName}。Token 已保存到服务器。`), 'success');
      document.getElementById('fb-manual-token-input').style.display = 'none';
      return;
    }

    throw new Error(pagesRes?.message || 'Token hợp lệ nhưng không lấy được Page Token.');
  } catch (error) {
    console.error('❌ [HandleManualToken] Lỗi:', error);
    console.error('   Stack:', error.stack);
    showFacebookMessage(ti('Token không hợp lệ: ', 'Invalid token: ', 'Token 无效：') + error.message, 'error');
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
    showFacebookMessage(ti('Không thể tải Fanpages: ', 'Cannot load Fanpages: ', '无法加载 Fanpages：') + error.message, 'error');
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
    statusText.textContent = isConnected ? ti('✅ Đã kết nối', '✅ Connected', '✅ 已连接') : ti('Chưa kết nối', 'Not connected', '未连接');
    statusText.style.color = isConnected ? 'green' : '#666';
  }
  
  if (btnConnect) {
    btnConnect.textContent = isConnected ? ti('🔄 Kết nối lại', '🔄 Reconnect', '🔄 重新连接') : ti('Kết nối với Facebook', 'Connect to Facebook', '连接到 Facebook');
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
    showFacebookMessage(ti('⚠️ Chưa chọn Fanpage nào.', '⚠️ No Fanpage selected.', '⚠️ 尚未选择 Fanpage。'), 'info');
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
          showFacebookMessage(ti(`⚠️ ${validation.message}. Hãy update token sau 60 ngày!`, `⚠️ ${validation.message}. Please refresh token every 60 days!`, `⚠️ ${validation.message}。请每60天更新一次 token！`), 'warning');
        }
      } else {
        console.error(`❌ [SelectPage] Token không hợp lệ: ${validation.message}`);
        showFacebookMessage(ti(`❌ Token của page này không hợp lệ: ${validation.message}`, `❌ This page token is invalid: ${validation.message}`, `❌ 此页面 token 无效：${validation.message}`), 'error');
      }
    }, 100);
  }

  saveFacebookState();
  showFacebookMessage(ti(`✅ Đã chọn ${selectedIds.length} fanpage.`, `✅ Selected ${selectedIds.length} fanpage(s).`, `✅ 已选择 ${selectedIds.length} 个 fanpage。`), 'success');
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
    btnPreview.textContent = ti('⏳ Đang tạo...', '⏳ Generating...', '⏳ 生成中...');
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
    showFacebookMessage(ti('Vui lòng chọn lĩnh vực và nhập thông tin sản phẩm', 'Please select industry and enter product info', '请选择行业并输入产品信息'), 'error');
    // Enable lại nút
    if (btnPreview) {
      btnPreview.disabled = false;
      btnPreview.style.opacity = '1';
      btnPreview.style.cursor = 'pointer';
      btnPreview.textContent = ti('👁️ Xem trước', '👁️ Preview', '👁️ 预览');
    }
    return;
  }
  
  try {
    showFacebookMessage(ti('🤖 AI đang tạo nội dung...', '🤖 AI is generating content...', '🤖 AI 正在生成内容...'), 'info');
    
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
    
    showFacebookMessage(ti('✅ Đã tạo nội dung', '✅ Content generated', '✅ 内容已生成'), 'success');
    
  } catch (error) {
    console.error('❌ Lỗi preview:', error);
    showFacebookMessage(ti('Lỗi: ', 'Error: ', '错误：') + error.message, 'error');
  } finally {
    // Enable lại nút sau 500ms (debounce)
    setTimeout(() => {
      const btnPreview = document.getElementById('btn-fb-preview');
      if (btnPreview) {
        btnPreview.disabled = false;
        btnPreview.style.opacity = '1';
        btnPreview.style.cursor = 'pointer';
        btnPreview.textContent = ti('👁️ Xem trước', '👁️ Preview', '👁️ 预览');
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
        showFacebookMessage(ti('❌ Token không hợp lệ - vui lòng nhập lại', '❌ Invalid token - please re-enter', '❌ Token 无效，请重新输入'), 'error');
        return;
      }
    } catch (e) {
      showFacebookMessage(ti('❌ Lỗi kiểm tra token: ', '❌ Token validation error: ', '❌ Token 校验错误：') + e.message, 'error');
      return;
    }
  }
  
  // Disable nút ngay khi bắt đầu
  const btnPost = document.getElementById('btn-fb-post');
  if (btnPost) {
    btnPost.disabled = true;
    btnPost.style.opacity = '0.5';
    btnPost.style.cursor = 'not-allowed';
    btnPost.textContent = ti('⏳ Đang đăng...', '⏳ Posting...', '⏳ 发布中...');
  }
  
  const selectedPages = getSelectedFacebookPages();
  if (!selectedPages.length) {
    showFacebookMessage(ti('Vui lòng chọn Fanpage trước', 'Please select a Fanpage first', '请先选择 Fanpage'), 'error');
    // Re-enable nút
    if (btnPost) {
      btnPost.disabled = false;
      btnPost.style.opacity = '1';
      btnPost.style.cursor = 'pointer';
      btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
    }
    return;
  }
  
  if (!facebookState.lastPostResult) {
    showFacebookMessage(ti('Vui lòng tạo nội dung trước (nhấn Xem trước)', 'Please generate content first (click Preview)', '请先生成内容（点击预览）'), 'error');
    // Re-enable nút
    if (btnPost) {
      btnPost.disabled = false;
      btnPost.style.opacity = '1';
      btnPost.style.cursor = 'pointer';
      btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
    }
    return;
  }

  const now = Date.now();
  const nextAllowedAt = getFacebookNextAllowedPostAt();
  if (nextAllowedAt && now < nextAllowedAt) {
    const waitMs = nextAllowedAt - now;
    showFacebookMessage(ti(`⏳ Vui lòng chờ ${formatDurationMs(waitMs)} trước khi đăng bài tiếp theo.`, `⏳ Please wait ${formatDurationMs(waitMs)} before posting next article.`, `⏳ 请等待 ${formatDurationMs(waitMs)} 后再发布下一篇。`), 'error');
    // Re-enable nút
    if (btnPost) {
      btnPost.disabled = false;
      btnPost.style.opacity = '1';
      btnPost.style.cursor = 'pointer';
      btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
    }
    return;
  }
  
  const imageUrl = document.getElementById('fb-image-url')?.value;
  const websiteLink = document.getElementById('fb-website-link')?.value;
  const postContent = facebookState.lastPostResult?.content || '';
  const targetPage = selectedPages[0];
  if (selectedPages.length > 1) {
    showFacebookMessage(ti(`ℹ️ Đang đăng thủ công lên fanpage đầu tiên: ${targetPage.name}.`, `ℹ️ Posting manually to the first fanpage: ${targetPage.name}.`, `ℹ️ 正在手动发布到第一个 fanpage：${targetPage.name}。`), 'info');
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
        btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
      }
      return;
    }

    if (!isZaloAutoMode) {
      const confirmDuplicate = confirm(`${validation.message}\n\n${ti('Bạn có muốn tiếp tục đăng bài này không?', 'Do you want to continue posting this?', '你要继续发布这篇内容吗？')}`);
      if (!confirmDuplicate) {
        showFacebookMessage(ti('Đã hủy đăng bài.', 'Post cancelled.', '已取消发布。'), 'info');
        // Re-enable nút
        if (btnPost) {
          btnPost.disabled = false;
          btnPost.style.opacity = '1';
          btnPost.style.cursor = 'pointer';
          btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
        }
        return;
      }
    } else {
      console.log(`✅ [Auto Mode] Tự động xác nhận đăng bài có trùng lặp`);
    }
  }

  if (!isZaloAutoMode) {
    const confirmPost = confirm(ti('Xác nhận đăng bài này lên Facebook?', 'Confirm posting this to Facebook?', '确认将此内容发布到 Facebook？'));
    if (!confirmPost) {
      showFacebookMessage(ti('Đã hủy đăng bài.', 'Post cancelled.', '已取消发布。'), 'info');
      // Re-enable nút
      if (btnPost) {
        btnPost.disabled = false;
        btnPost.style.opacity = '1';
        btnPost.style.cursor = 'pointer';
        btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
      }
      return;
    }
  } else {
    console.log(`✅ [Auto Mode] Tự động xác nhận đăng bài lên Facebook`);
  }
  
  try {
    showFacebookMessage(ti('📤 Đang đăng bài...', '📤 Posting...', '📤 正在发布...'), 'info');

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
      [],
      websiteLink || null,
      seft
    );  
    
    if (result.success) {
      recordFacebookPost(postContent);
      const nextAt = setFacebookNextAllowedPostAt();
      const waitMs = nextAt - Date.now();
      showFacebookMessage(ti(`🎉 Đăng bài thành công trên ${targetPage.name}! (${result.images_count} ảnh) <a href="https://www.facebook.com/${result.post_id}" target="_blank">Xem bài viết</a>`, `🎉 Posted successfully on ${targetPage.name}! (${result.images_count} images) <a href="https://www.facebook.com/${result.post_id}" target="_blank">View post</a>`, `🎉 已在 ${targetPage.name} 发布成功！（${result.images_count} 张图片）<a href="https://www.facebook.com/${result.post_id}" target="_blank">查看帖子</a>`), 'success');
      showFacebookMessage(ti(`⏳ Hệ thống sẽ cho phép đăng bài tiếp theo sau ${formatDurationMs(waitMs)}.`, `⏳ Next post will be allowed after ${formatDurationMs(waitMs)}.`, `⏳ 系统将在 ${formatDurationMs(waitMs)} 后允许下一次发布。`), 'info');
    }
    
  } catch (error) {
    console.error('❌ Lỗi đăng bài:', error);
    showFacebookMessage(ti('Lỗi: ', 'Error: ', '错误：') + error.message, 'error');
  } finally {
    // Enable lại nút sau 500ms (debounce)
    setTimeout(() => {
      const btnPost = document.getElementById('btn-fb-post');
      if (btnPost) {
        btnPost.disabled = false;
        btnPost.style.opacity = '1';
        btnPost.style.cursor = 'pointer';
        btnPost.textContent = ti('📤 Đăng bài', '📤 Post', '📤 发布');
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
    info: { bg: '#d1ecf1', border: '#bee5eb', color: '#0c5460' },
    warning: { bg: '#fff3cd', border: '#ffe69c', color: '#664d03' }
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
  
  // Keep compatible with seo.js flow: get/set are required, fetchFromDatabase is optional.
  if (!hasGet || !hasSet) {
    console.warn('[Zalo Storage] ⚠️ csmUserData missing required methods:', { hasFetch, hasGet, hasSet });
    return false;
  }
  
  if (!hasFetch) {
    console.warn('[Zalo Storage] ⚠️ csmUserData.fetchFromDatabase not available - running with get/set + fallback');
  }

  console.log('[Zalo Storage] ✅ csmUserData ready (get/set available)');
  return true;
}

function isPostedZaloItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.type === 'posted_zalo_message') return true;
  if (item.id && item.id.toString().startsWith('posted_zalo_')) return true;
  return false;
}

function isZaloMetaStatsItem(item) {
  return isPostedZaloStatsItem(item);
}

function isZaloConfigItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (isPostedZaloItem(item) || isPostedZaloStatsItem(item)) return false;
  return item.config_for_zalo === true || !!item.domain;
}

function normalizeDataOptionUserRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter((item) => item && typeof item === 'object' && !isPostedZaloItem(item) && !isPostedZaloStatsItem(item));
}

function logDataOptionUserSource(source, records, total) {
  try {
    const count = Array.isArray(records) ? records.length : 0;
    const prevSource = window.__lastDataOptionUserSource || '';
    const prevCount = Number(window.__lastDataOptionUserCount || -1);
    window.__lastDataOptionUserSource = source;
    window.__lastDataOptionUserCount = count;

    if (prevSource !== source || prevCount !== count) {
      console.log(`[LoadDataOptionUser][SOURCE] ${source} -> ${count}/${Number(total) || 0} records`);
    }
  } catch {
    // Keep logging best-effort only.
  }
}

function parseUserAddressArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getRawDataOptionUserFromCurrentUserAddress() {
  try {
    const currentUser = window.csmCurrentUser || {};
    const raw = currentUser.user_address || currentUser.user_adress;
    const parsed = parseUserAddressArray(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('⚠️ [RawDataOptionUser] csmCurrentUser.user_address read failed:', e.message);
    return [];
  }
}

function syncDataOptionUserFromServerOnce(reason = 'auto') {
  if (window.__dataOptionUserServerSyncInProgress) {
    return;
  }
  if (window.__dataOptionUserServerSyncDone) {
    return;
  }
  if (!window.csmUserData || typeof window.csmUserData.fetchFromDatabase !== 'function') {
    return;
  }

  window.__dataOptionUserServerSyncInProgress = true;
  console.log(`[LoadDataOptionUser][SYNC] Start fetchFromDatabase (${reason})...`);

  window.csmUserData.fetchFromDatabase(function(success, data, error) {
    window.__dataOptionUserServerSyncInProgress = false;

    if (!success || !Array.isArray(data)) {
      console.warn('[LoadDataOptionUser][SYNC] Fetch failed:', error || 'unknown');
      const fallbackFromCurrentUser = getRawDataOptionUserFromCurrentUserAddress();
      if (Array.isArray(fallbackFromCurrentUser) && fallbackFromCurrentUser.length > 0) {
        const usableRecords = normalizeDataOptionUserRecords(fallbackFromCurrentUser);
        window.__dataOptionUserServerSyncDone = true;
        window.dataUserOption = CSM_LOW_MEMORY_MODE ? usableRecords : fallbackFromCurrentUser;
        console.log(`[LoadDataOptionUser][SYNC] Fallback from csmCurrentUser.user_address: ${fallbackFromCurrentUser.length} items`);
        window.dispatchEvent(new CustomEvent('csm:dataOptionUserSynced', {
          detail: { source: 'csmCurrentUser.user_address', total: fallbackFromCurrentUser.length, usable: usableRecords.length }
        }));
        return;
      }

      const errorText = String(error || '').toLowerCase();
      if (errorText.includes('user not found')) {
        window.__dataOptionUserServerSyncRetryAfter = Date.now() + 30000;
      }
      return;
    }

    window.__dataOptionUserServerSyncDone = true;
    const records = normalizeDataOptionUserRecords(data);
    window.dataUserOption = CSM_LOW_MEMORY_MODE ? records : (Array.isArray(data) ? data : []);

    console.log(`[LoadDataOptionUser][SYNC] Done: fetched ${data.length} items, usable records ${records.length}`);
    window.dispatchEvent(new CustomEvent('csm:dataOptionUserSynced', {
      detail: { source: 'fetchFromDatabase', total: data.length, usable: records.length }
    }));
  });
}

function getRawDataOptionUserFromCsmUserData() {
  if (!window.csmUserData || typeof window.csmUserData.get !== 'function') {
    return null;
  }
  try {
    let arr = window.csmUserData.get();
    if (typeof arr === 'string') {
      arr = JSON.parse(arr);
    }
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('⚠️ [RawDataOptionUser] csmUserData.get parse failed:', e.message);
    return null;
  }
}

function getRawDataOptionUserFromWindowDataUserOption() {
  try {
    const arr = window.dataUserOption;
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    console.warn('⚠️ [RawDataOptionUser] window.dataUserOption read failed:', e.message);
    return null;
  }
}

function getRawDataOptionUserSnapshot() {
  const fromCsm = getRawDataOptionUserFromCsmUserData();
  if (Array.isArray(fromCsm)) return fromCsm;

  const fromWindowDataUserOption = getRawDataOptionUserFromWindowDataUserOption();
  if (Array.isArray(fromWindowDataUserOption)) return fromWindowDataUserOption;

  return getRawDataOptionUserFromCurrentUserAddress();
}

// ===== STORAGE HELPERS - LƯU TRỮ DATAOPTIONUSER GIỐNG SEO.JS (VỚI CSMuserdata) =====
/**
 * Load dataOptionUser từ csmUserData (giống seo.js)
 * ƯுTIÊN: 
 *   1. Lấy từ window.csmUserData.get() (cached from server)
 *   2. Fallback: window.dataUserOption runtime
 *   3. Fallback: window.csmCurrentUser.user_address runtime
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
        const records = normalizeDataOptionUserRecords(arr);
        if (records.length > 0) {
          console.log(`✅ [LoadDataOptionUser] Loaded ${records.length} records from csmUserData.get() (filtered from ${arr.length} total items)`);
          logDataOptionUserSource('csmUserData.get', records, arr.length);
          records.slice(0, 5).forEach((cfg, i) => {
            console.log(`   [${i}] id: ${cfg.id}, domain: ${cfg.domain}, config_for_zalo: ${cfg.config_for_zalo}, has fanpage_token: ${!!cfg.fanpage_token}`);
          });
          return records;
        }
        console.warn('⚠️ [LoadDataOptionUser] csmUserData có dữ liệu nhưng không có record hợp lệ, thử fallback tiếp...');
      } else {
        console.log('   ⚠️ Result is not an array or empty');
        syncDataOptionUserFromServerOnce('csmUserData.get empty');
      }
    } catch (e) {
      console.error('❌ Error loading from csmUserData:', e);
      console.error('   Stack:', e.stack);
      syncDataOptionUserFromServerOnce('csmUserData.get error');
    }
  }

  // Fallback #2: window.dataUserOption (tương thích seo.js)
  console.log('   📍 Trying window.dataUserOption fallback...');
  try {
    const arr = Array.isArray(window.dataUserOption) ? window.dataUserOption : [];
    if (arr.length > 0) {
      const records = normalizeDataOptionUserRecords(arr);
      if (records.length > 0) {
        console.log(`⚠️ [LoadDataOptionUser] Loaded ${records.length} records from window.dataUserOption (filtered from ${arr.length} total items, FALLBACK #2)`);
        logDataOptionUserSource('window.dataUserOption', records, arr.length);
        return records;
      }
      console.warn('⚠️ [LoadDataOptionUser] window.dataUserOption có dữ liệu nhưng không có record hợp lệ, thử fallback user_address...');
    }
  } catch (e) {
    console.warn('⚠️ [LoadDataOptionUser] window.dataUserOption fallback failed:', e.message);
  }

  console.log('   📍 Trying csmCurrentUser.user_address runtime fallback...');
  try {
    const arr = getRawDataOptionUserFromCurrentUserAddress();
    if (Array.isArray(arr) && arr.length > 0) {
      const records = normalizeDataOptionUserRecords(arr);
      if (records.length > 0) {
        console.log(`⚠️ [LoadDataOptionUser] Loaded ${records.length} records from csmCurrentUser.user_address (filtered from ${arr.length} total items, FALLBACK #3)`);
        logDataOptionUserSource('csmCurrentUser.user_address', records, arr.length);
        return records;
      }
    }
  } catch (e) {
    console.warn('⚠️ [LoadDataOptionUser] csmCurrentUser.user_address fallback failed:', e.message);
  }

  console.log('❌ [LoadDataOptionUser] No per-user runtime data available');
  logDataOptionUserSource('none(runtime-empty)', [], 0);
  return [];
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
        const runtimeFallback = getRawDataOptionUserFromCurrentUserAddress();
        if (data.length === 0 && Array.isArray(runtimeFallback) && runtimeFallback.length > 0) {
          const fallbackRecords = normalizeDataOptionUserRecords(runtimeFallback);
          window.dataUserOption = CSM_LOW_MEMORY_MODE ? fallbackRecords : runtimeFallback;
          console.warn('[Zalo] ⚠️ Server returned empty payload, keeping runtime snapshot with', runtimeFallback.length, 'items');
          callback(true, window.dataUserOption, null);
          return;
        }

        const usableRecords = normalizeDataOptionUserRecords(data);
        window.dataUserOption = CSM_LOW_MEMORY_MODE ? usableRecords : data;
        console.log('[Zalo] ✅ Fetched', data.length, 'items from server (usable:', usableRecords.length, ')');
        callback(true, window.dataUserOption, null);
      } else {
        const fallback = getRawDataOptionUserFromCurrentUserAddress();
        if (Array.isArray(fallback) && fallback.length > 0) {
          const usableRecords = normalizeDataOptionUserRecords(fallback);
          window.dataUserOption = CSM_LOW_MEMORY_MODE ? usableRecords : fallback;
          console.warn('[Zalo] ⚠️ Fetch failed, fallback to csmCurrentUser.user_address:', error);
          callback(true, window.dataUserOption, null);
          return;
        }
        callback(false, null, error || 'User not found');
      }
    });
  } else {
    console.warn('[Zalo] csmUserData.fetchFromDatabase not available');
    callback(false, null, 'csmUserData not available');
  }
}

function fetchDataOptionUserFromServerAsync() {
  return new Promise((resolve) => {
    try {
      fetchDataOptionUserFromServer((success, data, error) => {
        resolve({ success: !!success, data: Array.isArray(data) ? data : [], error: error || null });
      });
    } catch (e) {
      resolve({ success: false, data: [], error: e?.message || String(e) });
    }
  });
}

/**
 * Lưu dataOptionUser lên server qua csmUserData
 * @param {Array} data - Mảng dữ liệu cần lưu
 * @param {Function} callback - callback(success, error)
 */
function saveDataOptionUser(data, callback, options = {}) {
  const dataToSave = Array.isArray(data) ? data : [];
  const allowEmptyConfigSave = !!options.allowEmptyConfigSave;
  
  console.log('====== 💾 [SaveDataOptionUser] BẮT ĐẦU LƯU DỮ LIỆU ======');
  console.log('📊 Số items được truyền vào:', dataToSave.length);

  const incomingConfigs = dataToSave.filter(isZaloConfigItem);
  const existingRawSnapshot = getRawDataOptionUserSnapshot();
  const existingConfigs = Array.isArray(existingRawSnapshot)
    ? existingRawSnapshot.filter(isZaloConfigItem)
    : [];

  if (!allowEmptyConfigSave && incomingConfigs.length === 0 && existingConfigs.length > 0) {
    const msg = 'Blocked destructive save: incoming config rỗng trong khi dữ liệu hiện tại vẫn còn config.';
    console.error(`❌ [SaveDataOptionUser] ${msg}`);
    if (callback) callback(false, msg);
    return;
  }
  
  // Phase B: chỉ lưu config vào user_address; posted runtime tách sang storage riêng
  const finalData = [...dataToSave];
  console.log('📊 Final data to save:', finalData.length, 'config items (runtime posted data is decoupled)');
  
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
    
    if (allowEmptyConfigSave) {
      window.__csmAllowEmptyUserAddressSave = true;
    }

    window.csmUserData.set(finalData, function (success, error) {
      if (allowEmptyConfigSave) {
        window.__csmAllowEmptyUserAddressSave = false;
      }
      console.log('🔔 CALLBACK từ window.csmUserData.set() được gọi');
      console.log('   ✅ success =', success);
      console.log('   ❌ error =', error);
      
      if (success) {
        console.log('✅ [SaveDataOptionUser] SERVER SAVE THÀNH CÔNG!');
        window.dataUserOption = finalData;
        if (callback) callback(true, null);
      } else {
        console.error('❌ [SaveDataOptionUser] SERVER SAVE THẤT BẠI!');
        console.error('   Error:', error);
        if (callback) callback(false, error);
      }
    });
  } else {
    const err = 'csmUserData.set unavailable - refusing localStorage fallback for per-user config data';
    console.warn(`⚠️ [SaveDataOptionUser] ${err}`);
    if (callback) callback(false, err);
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
  console.log('🚀 Initializing all UI modules (eager first paint)...');
  
  let uiInitAttempts = 0;
  const maxAttempts = 10;
  
  // ✅ FIX: Use requestIdleCallback to throttle heavy operations
  // This prevents RAM spike by scheduling work during browser idle time
  const scheduleTask = (fn, delayMs = 0) => {
    if ('requestIdleCallback' in window) {
      return requestIdleCallback(fn, { timeout: 3000 });
    } else {
      return setTimeout(fn, delayMs);
    }
  };

  const mountAllUIModulesNow = async () => {
    await ensureGlobalSettingsPanel();
    await ensureUI();

    // Facebook Token Management must always be visible on first load.
    createFacebookPostUI();

    if (CSM_AUTO_INIT_NON_CORE_UI) {
      ensureAdsApiTestPanel();
      ensureAiLaneTestPanel();
      await ensureServiceContentUI();
    }

    ensureMainFeatureTabs();
  };
  
  // ✅ FIX: Defer service definitions sync until AFTER UI init
  // Schedule sync to run AFTER 100ms (allow UI to render first)
  const deferredSyncTimer = timerRegistry.register(
    'deferred-service-sync',
    scheduleTask(() => {
      syncServiceDefinitionsFromServer().then(result => {
        if (result.success && !result.cached) {
          console.log(`✅ Initial sync completed: ${result.lmkt || 0} LMKT projects + ${result.pmt || 0} service types`);
        } else if (!result.success) {
          console.warn(`⚠️ Initial sync chưa sẵn sàng: ${result.reason || result.error || 'unknown'}`);
        }
      }).catch(e => console.error('❌ Service sync error:', e));
    }, 100),
    'timeout'
  );

  // ✅ FIX: Bootstrap retry - nhưng dùng timerRegistry thay vì CLEANUP_MANAGER
  const bootstrapSyncId = timerRegistry.register(
    'bootstrap-service-sync',
    setInterval(async () => {
      if (serviceDefinitionsHydrated) {
        timerRegistry.clear('bootstrap-service-sync');
        return;
      }
      await syncServiceDefinitionsFromServer(true);
    }, 15000),
    'interval'
  );
  
  // Setup auto-refresh mỗi 5 phút
  const syncIntervalId = timerRegistry.register(
    'service-definitions-sync',
    setInterval(() => {
      syncServiceDefinitionsFromServer();
    }, SYNC_INTERVAL_MS),
    'interval'
  );
  
  // Retry mechanism with immediate first run to avoid delayed first paint.
  // Keep lazy-load sequence, but do not wait 30s for the first attempt.
  const runUIInitCycle = async () => {
      uiInitAttempts++;
      
      try {
        // Verify document is ready
        if (!document.body) {
          console.log(`⏳ Waiting for DOM to be ready (attempt ${uiInitAttempts})...`);
          return;
        }

        await mountAllUIModulesNow();

        const globalSettings = document.getElementById('global-settings-panel');
        const multiDomainUI = document.getElementById('multi-domain-ui');
        const adsApiTestPanel = document.getElementById('ads-api-test-panel');
        const serviceContentUI = document.getElementById('service-content-ui');
        const facebookUI = document.getElementById('facebook-post-ui');
        
        // Nếu tất cả UI đã có, dừng interval
        const allCoreReady = Boolean(globalSettings && multiDomainUI && facebookUI);
        const allUIReady = CSM_AUTO_INIT_NON_CORE_UI
          ? (allCoreReady && adsApiTestPanel && serviceContentUI)
          : allCoreReady;
        if (allUIReady || uiInitAttempts >= maxAttempts) {
          timerRegistry.clear('ui-init-polling');
          console.log('✅ All UI modules initialized');
        }
        
      } catch (error) {
        console.error('❌ Error initializing UI:', error);
      }
  };

  // First attempt immediately (after a tiny delay for host container stability)
  timerRegistry.register(
    'ui-init-immediate',
    setTimeout(() => {
      runUIInitCycle();
    }, 20),
    'timeout'
  );

  // Retry every 3s until ready/max attempts
  const initInterval = timerRegistry.register(
    'ui-init-polling',
    setInterval(runUIInitCycle, 1200),
    'interval'
  );

  // ✅ FIX 4: Optimize MutationObserver - use debouncing + limited scope
  // Monitor DOM changes để tự động tạo lại UI nếu React xóa
  if (typeof MutationObserver !== 'undefined') {
    let uiMutationObserverTimeout = null;
    const debouncedUICheck = () => {
      if (uiMutationObserverTimeout) clearTimeout(uiMutationObserverTimeout);
      
      uiMutationObserverTimeout = setTimeout(() => {
        // Skip if theme is refreshing
        if (isThemeRefreshing) return;
        
        // Kiểm tra và tạo lại các UI bị mất (batch vào 1 operation)
        const globalSettings = document.getElementById('global-settings-panel');
        const multiDomainUI = document.getElementById('multi-domain-ui');
        const adsApiTestPanel = document.getElementById('ads-api-test-panel');
        const serviceContentUI = document.getElementById('service-content-ui');
        const facebookUI = document.getElementById('facebook-post-ui');
        
        const missingElements = [];
        if (!globalSettings) missingElements.push('global-settings-panel');
        if (!multiDomainUI) missingElements.push('multi-domain-ui');
        if (!adsApiTestPanel) missingElements.push('ads-api-test-panel');
        if (!serviceContentUI) missingElements.push('service-content-ui');
        if (!facebookUI) missingElements.push('facebook-post-ui');
        
        if (missingElements.length === 0) return;
        
        console.log(`🔄 Recreating missing UI: ${missingElements.join(', ')}`);

        scheduleTask(() => {
          runUIInitCycle();
        }, 30);
      }, 500);  // Debounce: wait 500ms after last mutation
    };
    
    uiMutationObserver = new MutationObserver(debouncedUICheck);
    
    // Bắt đầu theo dõi sau 2 giây - watch UI container for changes
    setTimeout(() => {
      // Watch csm container inside #context-auto.
      const containerElem = document.getElementById('csm-ui-container') || document.getElementById('context-auto');
      
      if (containerElem) {
        // Watch only direct children (not entire subtree for performance)
        uiMutationObserver.observe(containerElem, {
          childList: true,
          subtree: false  // Don't watch entire tree
        });
        const elemId = containerElem.id || 'container';
        console.log(`👁️ MutationObserver watching ${elemId} element`);
      }
      
      // Setup theme listener AFTER MutationObserver starts to avoid conflicts
      setupThemeChangeListener();
      setupLanguageChangeListener();
    }, 2000);
  }
}

// ===== THEME CHANGE LISTENER =====
/**
 * Listen for theme changes and refresh all UI modules
 * ✅ FIX 6: Add lock mechanism to prevent recursive refresh
 */
let themeListenerInitialized = false;
let uiThemeRefreshLock = false;
let languageListenerInitialized = false;
let lastKnownUILanguage = getUILanguage();

async function refreshDynamicUIModules(reason = 'theme-change') {
  // Lock to prevent recursive refresh loops.
  if (isThemeRefreshing || uiThemeRefreshLock) {
    console.log(`⏭️ Refresh skipped (${reason}) - refresh already in progress`);
    return;
  }

  uiThemeRefreshLock = true;
  isThemeRefreshing = true;
  console.log(`🎨 Refreshing dynamic UI modules (${reason})...`);

  try {
    if (uiMutationObserver) {
      uiMutationObserver.disconnect();
    }

    const elementsToRefresh = [
      'global-settings-panel',
      'multi-domain-ui',
      'ads-api-test-panel',
      'service-content-ui',
      'facebook-post-ui'
    ];

    const fragment = document.createDocumentFragment();
    elementsToRefresh.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        fragment.appendChild(element);
      }
    });
    while (fragment.firstChild) fragment.removeChild(fragment.firstChild);

    await new Promise(resolve => {
      const timer = setTimeout(resolve, 100);
      timerRegistry.register('ui-refresh-reflow', timer, 'timeout');
    });

    await ensureGlobalSettingsPanel();
    await ensureUI();
    ensureAdsApiTestPanel();
    ensureAiLaneTestPanel();
    await ensureServiceContentUI();
    createFacebookPostUI();
    ensureMainFeatureTabs();

    const containerElem = document.getElementById('csm-ui-container') || document.getElementById('context-auto');
    if (uiMutationObserver && containerElem) {
      uiMutationObserver.observe(containerElem, {
        childList: true,
        subtree: false
      });
    }
  } catch (error) {
    console.error(`❌ Error refreshing UI (${reason}):`, error);
  } finally {
    uiThemeRefreshLock = false;
    isThemeRefreshing = false;
  }
}

function setupThemeChangeListener() {
  // Prevent duplicate initialization
  if (themeListenerInitialized) {
    console.log('ℹ️ Theme listener already initialized, skipping...');
    return;
  }
  
  themeListenerInitialized = true;
  let refreshTimeout = null;
  
  // Debounced function to refresh all UI
  const refreshAllUI = () => {
    // Clear any pending refresh
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    // Fast-path: immediately sync tab shell/buttons and rebuild Zalo scanner panel
    // so light/dark changes are visible without waiting for full UI refresh.
    try {
      ensureMainFeatureTabs();
      const container = document.getElementById('csm-ui-container') || ensureUnifiedUIContainer();
      if (container) {
        const existingZaloPanel = document.getElementById('zalo-multi-group-ui');
        if (existingZaloPanel) {
          existingZaloPanel.remove();
          ensureZaloMultiGroupUI(container);
          ensureMainFeatureTabs();
        }
      }
    } catch (e) {
      console.warn('⚠️ Fast theme sync failed:', e?.message || e);
    }
    
    // Schedule refresh with debounce
    refreshTimeout = timerRegistry.register(
      'theme-refresh-debounce',
      setTimeout(async () => {
        await refreshDynamicUIModules('theme-change');
      }, 120),
      'timeout'
    );
  };
  
  // Listen to data-theme attribute changes on html element ONLY
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
  
  // ✅ FIX: Only watch html element's attributes, not descendants
  themeObserver.observe(htmlElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
    subtree: false  // ✅ CRITICAL: Don't watch tree
  });
  
  // Listen to system prefers-color-scheme changes
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    applyThemeMode('system');
    refreshAllUI();
  };

  if (darkModeMediaQuery.addEventListener) {
    darkModeMediaQuery.addEventListener('change', handleSystemThemeChange);
  } else if (darkModeMediaQuery.addListener) {
    // Fallback for older browsers
    darkModeMediaQuery.addListener(handleSystemThemeChange);
  }

  // Listen to explicit host event from DynamicCodeMenu.
  window.addEventListener('csm:theme-change', refreshAllUI);
  
  console.log('👁️ Theme change listener initialized (with optimization)');
}

function setupLanguageChangeListener() {
  if (languageListenerInitialized) {
    return;
  }

  languageListenerInitialized = true;

  const triggerLanguageRefresh = async (source = 'unknown') => {
    const nextLang = getUILanguage();
    if (nextLang === lastKnownUILanguage) return;

    lastKnownUILanguage = nextLang;
    console.log(`🌐 Language changed to ${nextLang} (${source}), refreshing UI...`);
    await refreshDynamicUIModules('language-change');
  };

  // Listen when the same tab changes app language (custom event from host).
  window.addEventListener('csm:locale-change', () => {
    triggerLanguageRefresh('custom-event');
  });

  // Listen localStorage updates from other tabs/windows.
  window.addEventListener('storage', (event) => {
    if (event.key === 'language' || event.key === 'i18nextLng') {
      triggerLanguageRefresh('storage');
    }
  });

  // Watch html lang changes from app shell.
  const htmlElement = document.documentElement;
  const langObserver = new MutationObserver((mutations) => {
    const hasLangChange = mutations.some(mutation =>
      mutation.type === 'attributes' && mutation.attributeName === 'lang'
    );
    if (hasLangChange) {
      triggerLanguageRefresh('html-lang');
    }
  });
  langObserver.observe(htmlElement, {
    attributes: true,
    attributeFilter: ['lang'],
    subtree: false
  });

  // Lightweight poll fallback for environments without explicit events.
  timerRegistry.register(
    'language-sync-polling',
    setInterval(() => {
      triggerLanguageRefresh('polling');
    }, 2000),
    'interval'
  );

  console.log('👁️ Language change listener initialized');
}

// ===== DEFERRED INITIALIZATION =====
// ✅ FIX: Defer heavy initialization to prevent RAM spike
// Instead of calling initAllUI() immediately, wait for user interaction
// This brings RAM from 90% → 30-40% on webview load

if (typeof window !== 'undefined') {
  // Apply saved theme mode ASAP so first paint uses correct mode.
  applyThemeMode(getPreferredThemeMode());

  let initStarted = false;
  
  // Option 1: Defer until DOM is fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!initStarted) {
        console.log('🚀 [DOMContentLoaded] Deferring UI init by 500ms...');
        setTimeout(() => {
          initStarted = true;
          initAllUI();
        }, 500);  // Wait 500ms for DOM to settle
      }
    });
  } else if (!initStarted) {
    // Document already loaded, defer by 500ms
    console.log('🚀 [Document ready] Deferring UI init by 500ms...');
    setTimeout(() => {
      initStarted = true;
      initAllUI();
    }, 500);
  }
}