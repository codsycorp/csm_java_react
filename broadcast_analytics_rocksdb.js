/**
 * BROADCAST ANALYTICS - RocksDB Storage via API
 * 
 * ========== SYSTEM OVERVIEW ==========
 * 
 * PURPOSE: Comprehensive CRM analytics dashboard for broadcast page
 * - Track daily/weekly/monthly/yearly performance metrics
 * - Display visual insights with ECharts
 * - AI-powered recommendations (5 priority levels)
 * - **Storage: RocksDB via API (NOT SQL)**
 * 
 * ========== HOẠT ĐỘNG ==========
 * 
 * 1. User opens broadcast page → broadcast.tsx queries sys_autos:
 *    WHERE app_id = "broadcast_csm" AND p_type = 2
 *    → Returns auto_code (this JS file)
 *
 * 2. JS executes in browser:
 *    - Gets appId from window.csmCurrentUser.appId
 *    - Calls window.csmApi.getAnalytics(appId, timePeriod)
 *    - Calls window.csmApi.getAIInsights(appId, timePeriod)
 *    - Renders 4 sections: KPI + Trends + Analysis + AI Insights
 *    - Auto-saves analytics to RocksDB every 5 minutes
 *
 * 3. Data Storage (CRM Analysis Results):
 *    - Saves to RocksDB via window.csmApi.updateTableData()
 *    - Table: crm_analytics
 *    - Stores: metrics, trends, analysis results, AI insights
 *    - No SQL needed - API handles all database operations
 *
 * ========== API CALLS ==========
 * 
 * Get Analytics:
 *   window.csmApi.getAnalytics(appId, timePeriod)
 *   Returns: { metrics, timeline, channels, ads }
 *
 * Get AI Insights:
 *   window.csmApi.getAIInsights(appId, timePeriod)
 *   Returns: { analysis, recommendations }
 *
 * Save to RocksDB:
 *   window.csmApi.updateTableData({
 *     app_id: "csm",
 *     obj_name: "crm_analytics",
 *     command: "insert",
 *     pk_fields: ["app_id", "period", "created_date"],
 *     obj_update: { all analytics & AI data }
 *   })
 * 
 * ========== DATABASE SCHEMA (RocksDB) ==========
 * Table: crm_analytics
 * 
 * Fields:
 *   - app_id: string (primary)
 *   - period: string = "day|week|month|year" (primary)
 *   - created_date: datetime (primary)
 *   - updated_at: datetime
 * 
 * Metrics (JSON):
 *   - new_customers: number
 *   - revenue: number
 *   - conversion_rate: number
 *   - aov: number (average order value)
 *   - traffic: number (page views)
 *   - ad_roas: number
 *   - trends: {new: %, revenue: %, conversion: %, aov: %, traffic: %, roas: %}
 *
 * Timeline (JSON Array):
 *   - date: string
 *   - revenue: number
 *   - customers: number
 *   - converted_customers: number
 *
 * Channels (JSON):
 *   - chat: number
 *   - website: number
 *   - facebook: number
 *   - google: number
 *   - organic: number
 *   - direct: number
 *
 * Ads (JSON):
 *   - google: number (ROAS %)
 *   - facebook: number
 *   - tiktok: number
 *   - snapchat: number
 *
 * AI Insights (LONGTEXT):
 *   - analysis_text: string (2-3 sentences)
 *   - recommendations: array [
 *       { priority: "critical|high|medium|normal|info", 
 *         title: string, 
 *         description: string }
 *     ]
 * 
 * ========== SETUP STEPS ==========
 * 
 * 1. Save this JS to sys_autos:
 *    - app_id: "broadcast_" + <your_app_id>
 *      Example: "broadcast_csm", "broadcast_web_app_1"
 *    - p_type: 2 (broadcast page type)
 *    - auto_code: Full JS content (this file)
 * 
 * 2. Run backend CRMAnalyticsService.java
 *    - Provides /api/crm/analytics/{appId}
 *    - Provides /api/crm/insights/{appId}
 * 
 * 3. Ensure database table exists:
 *    CREATE TABLE crm_analytics (
 *      app_id VARCHAR(100),
 *      period VARCHAR(20),
 *      created_date TIMESTAMP,
 *      updated_at TIMESTAMP,
 *      metrics JSON,
 *      timeline JSON,
 *      channels JSON,
 *      ads JSON,
 *      analysis_text LONGTEXT,
 *      recommendations JSON,
 *      PRIMARY KEY (app_id, period, created_date)
 *    );
 * 
 * ========== COMPONENTS ==========
 * - KeyMetricsCards: 6 KPI cards with trend %
 * - TrendCharts: Line charts (Revenue + Customers)
 * - AnalysisCharts: Pie chart (channels) + Bar chart (ads)
 * - AIInsightsPanel: Recommendations with 5 priority levels
 * - AnalyticsDashboard: Main export component + storage logic
 * 
 * ========== STORAGE LOGIC ==========
 * 
 * Auto-save every 5 minutes:
 *   - Collects current metrics, trends, channels, ads
 *   - Gathers AI analysis from cache
 *   - Calls window.csmApi.updateTableData()
 *   - Stores in RocksDB with app_id + period + created_date as keys
 * 
 * No manual SQL needed - everything handled via API!
 */

// ========== GLOBAL TIMER REGISTRY ==========
// Prevent memory leaks and orphaned timers
const timerRegistry = {
  timers: new Map(),
  
  register(name, timerId, type = 'interval') {
    const entry = { id: timerId, type, createdAt: Date.now(), active: true };
    this.timers.set(name, entry);
    console.log(`⏱️ Timer registered: ${name}`);
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
  }
};

function unwrapApiData(response) {
  if (!response) return null;
  if (response.success !== undefined || response.code !== undefined || response.message !== undefined) {
    return response.data || response.result || response.rows || null;
  }
  return response;
}

function normalizeGooglebotStats(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Accept multiple payload shapes from legacy/new handlers.
  const totalVisits =
    Number(raw.totalVisits ?? raw.total_visits ?? raw.google_bot_visits ?? 0) || 0;

  const latest = Array.isArray(raw.latest)
    ? raw.latest
    : Array.isArray(raw.rows)
      ? raw.rows
      : [];

  const byDate = Array.isArray(raw.byDate)
    ? raw.byDate
    : Array.isArray(raw.by_date)
      ? raw.by_date
      : [];

  return {
    totalVisits,
    latest,
    byDate
  };
}

function aggregateGooglebotRows(rows) {
  if (!Array.isArray(rows)) return null;

  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a?.visitedAt || a?.visited_at || 0).getTime();
    const tb = new Date(b?.visitedAt || b?.visited_at || 0).getTime();
    return tb - ta;
  });

  const latest = sorted.slice(0, 8).map((r) => ({
    host: r?.host || '-',
    path: r?.path || '',
    visitedAt: r?.visitedAt || r?.visited_at || ''
  }));

  const dateMap = new Map();
  for (const r of sorted) {
    const ts = r?.visitedAt || r?.visited_at;
    if (!ts) continue;
    const day = String(ts).slice(0, 10);
    dateMap.set(day, (dateMap.get(day) || 0) + 1);
  }

  const byDate = Array.from(dateMap.entries())
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .slice(0, 7)
    .map(([date, count]) => ({ date, count }));

  return {
    totalVisits: rows.length,
    latest,
    byDate
  };
}

// ========== THEME HELPERS ==========
// Get theme colors from window.csmTheme (exposed by Home component)
function getTheme() {
  const theme = (typeof window !== 'undefined' && window.csmTheme) || {};
  const isDark = theme.isDark || false;
  
  return {
    isDark,
    background: theme.getBackgroundColor ? theme.getBackgroundColor() : (isDark ? '#141414' : '#ffffff'),
    text: theme.getTextColor ? theme.getTextColor() : (isDark ? '#ffffff' : '#000000'),
    textSecondary: theme.getSecondaryTextColor ? theme.getSecondaryTextColor() : (isDark ? '#8c8c8c' : '#666666'),
    border: theme.getBorderColor ? theme.getBorderColor() : (isDark ? '#303030' : '#f0f0f0'),
    cardBg: theme.getCardBackground ? theme.getCardBackground() : (isDark ? '#1f1f1f' : '#ffffff'),
    chartPlaceholder: isDark ? '#262626' : '#f5f5f5',
    recommendationBg: isDark ? '#262626' : '#fafafa',
    primary: theme.themeColorPrimary || '#1890ff'
  };
}

// ========== I18N HELPERS ==========
// Translation dictionary for 3 languages (vi, en, zh)
const translations = {
  vi: {
    dashboard_title: '📊 Broadcast Analytics Dashboard',
    period_day: '📅 Ngày',
    period_week: '📅 Tuần',
    period_month: '📅 Tháng',
    period_year: '📅 Năm',
    refresh: '🔄 Làm mới',
    new_customers: '👥 Khách hàng mới',
    revenue: '💰 Doanh thu',
    conversion_rate: '📊 Tỷ lệ chuyển đổi',
    avg_order_value: '🛒 Giá trị đơn hàng TB',
    traffic: '📈 Lưu lượng',
    ad_roas: '🎯 ROAS Quảng cáo',
    revenue_trends: '📈 Xu hướng Doanh thu & Khách hàng',
    revenue_trend: 'Xu hướng Doanh thu',
    customer_acquisition: 'Thu hút Khách hàng',
    chart_revenue_over_time: 'Biểu đồ: Doanh thu theo thời gian',
    chart_customers: 'Biểu đồ: Khách hàng mới vs Đã chuyển đổi',
    channel_distribution: '🎯 Phân bổ Kênh & Hiệu suất Quảng cáo',
    customer_by_channel: 'Khách hàng theo Kênh (%)',
    ad_platform_roas: 'ROAS theo Nền tảng (%)',
    ai_insights: '🤖 Phân tích AI & Khuyến nghị',
    prioritized_recommendations: 'Khuyến nghị ưu tiên:',
    googlebot_visits: '🤖 Lượt truy cập Googlebot',
    googlebot_not_available: 'Thống kê Googlebot không khả dụng.',
    googlebot_refresh: 'Làm mới',
    googlebot_clear: 'Xóa tất cả',
    total_visits: 'Tổng lượt truy cập',
    googlebot_today: 'Hôm nay',
    googlebot_last_visit: 'Lần truy cập cuối',
    googlebot_no_visit: 'Chưa có lượt truy cập',
    latest_crawls: 'Crawl gần nhất',
    by_date: 'Theo ngày',
    googlebot_visited_at: 'Thời gian',
    googlebot_host: 'Host',
    googlebot_path: 'Đường dẫn',
    googlebot_ip: 'IP',
    googlebot_user_agent: 'User-Agent',
    googlebot_visits_count: 'Lượt truy cập: {{count}}',
    no_recent_visits: 'Không có lượt truy cập gần đây',
    no_daily_stats: 'Không có thống kê theo ngày',
    crm_overview: '🧩 Tổng quan CRM',
    total_customers: 'Tổng khách hàng',
    contacted: 'Đã liên hệ',
    purchased: 'Đã mua',
    cancelled: 'Đã hủy',
    crm_conversion: 'Chuyển đổi CRM',
    loading_analytics: '⏳ Đang tải phân tích...',
    loading_ai_insights: '⏳ Đang tải phân tích AI...',
    auto_saved: '✅ Phân tích tự động lưu vào RocksDB mỗi 5 phút',
    days: 'ngày'
  },
  en: {
    dashboard_title: '📊 Broadcast Analytics Dashboard',
    period_day: '📅 Day',
    period_week: '📅 Week',
    period_month: '📅 Month',
    period_year: '📅 Year',
    refresh: '🔄 Refresh',
    new_customers: '👥 New Customers',
    revenue: '💰 Revenue',
    conversion_rate: '📊 Conversion Rate',
    avg_order_value: '🛒 Avg Order Value',
    traffic: '📈 Traffic',
    ad_roas: '🎯 Ad ROAS',
    revenue_trends: '📈 Revenue & Customer Trends',
    revenue_trend: 'Revenue Trend',
    customer_acquisition: 'Customer Acquisition',
    chart_revenue_over_time: 'Chart: Revenue over time',
    chart_customers: 'Chart: New customers vs Converted',
    channel_distribution: '🎯 Channel Distribution & Ad Performance',
    customer_by_channel: 'Customer by Channel (%)',
    ad_platform_roas: 'Ad Platform ROAS (%)',
    ai_insights: '🤖 AI Insights & Recommendations',
    prioritized_recommendations: 'Prioritized Recommendations:',
    googlebot_visits: '🤖 Googlebot Visits',
    googlebot_not_available: 'Googlebot stats not available.',
    googlebot_refresh: 'Refresh',
    googlebot_clear: 'Clear All',
    total_visits: 'Total Visits',
    googlebot_today: 'Today',
    googlebot_last_visit: 'Last Visit',
    googlebot_no_visit: 'No visits yet',
    latest_crawls: 'Latest Crawls',
    by_date: 'By Date',
    googlebot_visited_at: 'Visited At',
    googlebot_host: 'Host',
    googlebot_path: 'Path',
    googlebot_ip: 'IP',
    googlebot_user_agent: 'User-Agent',
    googlebot_visits_count: 'Visits: {{count}}',
    no_recent_visits: 'No recent visits',
    no_daily_stats: 'No daily stats',
    crm_overview: '🧩 CRM Operations Overview',
    total_customers: 'Total Customers',
    contacted: 'Contacted',
    purchased: 'Purchased',
    cancelled: 'Cancelled',
    crm_conversion: 'CRM Conversion',
    loading_analytics: '⏳ Loading analytics...',
    loading_ai_insights: '⏳ Loading AI Insights...',
    auto_saved: '✅ Analytics auto-saved to RocksDB every 5 minutes',
    days: 'days'
  },
  zh: {
    dashboard_title: '📊 广播分析仪表板',
    period_day: '📅 天',
    period_week: '📅 周',
    period_month: '📅 月',
    period_year: '📅 年',
    refresh: '🔄 刷新',
    new_customers: '👥 新客户',
    revenue: '💰 收入',
    conversion_rate: '📊 转化率',
    avg_order_value: '🛒 平均订单价值',
    traffic: '📈 流量',
    ad_roas: '🎯 广告投资回报率',
    revenue_trends: '📈 收入与客户趋势',
    revenue_trend: '收入趋势',
    customer_acquisition: '客户获取',
    chart_revenue_over_time: '图表：随时间变化的收入',
    chart_customers: '图表：新客户 vs 已转化',
    channel_distribution: '🎯 渠道分布与广告效果',
    customer_by_channel: '按渠道划分的客户 (%)',
    ad_platform_roas: '广告平台投资回报率 (%)',
    ai_insights: '🤖 AI 洞察与建议',
    prioritized_recommendations: '优先建议：',
    googlebot_visits: '🤖 Googlebot 访问',
    googlebot_not_available: 'Googlebot 统计不可用。',
    googlebot_refresh: '刷新',
    googlebot_clear: '清除全部',
    total_visits: '总访问量',
    googlebot_today: '今天',
    googlebot_last_visit: '最近访问',
    googlebot_no_visit: '暂无访问',
    latest_crawls: '最新抓取',
    by_date: '按日期',
    googlebot_visited_at: '访问时间',
    googlebot_host: '主机',
    googlebot_path: '路径',
    googlebot_ip: 'IP',
    googlebot_user_agent: 'User-Agent',
    googlebot_visits_count: '访问次数: {{count}}',
    no_recent_visits: '没有最近的访问',
    no_daily_stats: '没有每日统计',
    crm_overview: '🧩 CRM 运营概览',
    total_customers: '总客户数',
    contacted: '已联系',
    purchased: '已购买',
    cancelled: '已取消',
    crm_conversion: 'CRM 转化',
    loading_analytics: '⏳ 加载分析中...',
    loading_ai_insights: '⏳ 加载 AI 洞察中...',
    auto_saved: '✅ 分析每 5 分钟自动保存到 RocksDB',
    days: '天'
  }
};

// Get current language from localStorage or default to 'vi'
function getCurrentLanguage() {
  try {
    // Try to get from localStorage (same as React app)
    const stored = localStorage.getItem('language');
    if (stored && (stored === 'vi' || stored === 'en' || stored === 'zh-CN')) {
      return stored === 'zh-CN' ? 'zh' : stored;
    }
    // Fallback to browser language
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('zh')) return 'zh';
    if (browserLang.startsWith('en')) return 'en';
    return 'vi'; // Default to Vietnamese
  } catch {
    return 'vi';
  }
}

// Translation function
function t(key) {
  const lang = getCurrentLanguage();
  return translations[lang]?.[key] || translations.vi[key] || key;
}

function tWithCount(key, count) {
  return String(t(key)).replace('{{count}}', String(count ?? 0));
}

function formatDateTimeByLang(value) {
  if (!value) return '-';
  const lang = getCurrentLanguage();
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    if (lang === 'vi') {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      const hh = String(date.getHours()).padStart(2, '0');
      const mi = String(date.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    }
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  } catch {
    return String(value);
  }
}

function formatDateByLang(value) {
  if (!value) return '-';
  const lang = getCurrentLanguage();
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    if (lang === 'vi') {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    if (lang === 'zh') {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}年${mm}月${dd}日`;
    }
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
  } catch {
    return String(value);
  }
}

// ========== ANALYTICS STORAGE API ==========
// Save analytics data to RocksDB via backend API

const AnalyticsStorage = {
  /**
   * Save analytics metrics to RocksDB
   * @param {Object} params
   * @param {string} params.appId - Application ID
   * @param {string} params.period - "day" | "week" | "month" | "year"
   * @param {Object} params.metrics - KPI metrics
   * @param {Array} params.timeline - Trend data over time
   * @param {Object} params.channels - Channel distribution
   * @param {Object} params.ads - Ad platform performance
   * @returns {Promise}
   */
  async saveAnalytics({ appId, period, metrics, timeline, channels, ads }) {
    try {
      if (!window.csmApi || !window.csmApi.updateTableData) {
        console.warn('⚠️ window.csmApi.updateTableData not available');
        return;
      }

      const payload = {
        app_id: appId,
        obj_name: "crm_analytics",
        command: "insert",
        pk_fields: ["app_id", "period", "created_date"],
        obj_update: {
          app_id: appId,
          period: period,
          created_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metrics: JSON.stringify(metrics),
          timeline: JSON.stringify(timeline),
          channels: JSON.stringify(channels),
          ads: JSON.stringify(ads)
        }
      };

      console.log(`📤 Saving analytics to RocksDB for ${appId}/${period}...`);
      const result = await window.csmApi.updateTableData(payload);
      console.log(`✅ Analytics saved successfully:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Failed to save analytics:`, error);
      throw error;
    }
  },

  /**
   * Save AI insights to RocksDB
   * @param {Object} params
   * @param {string} params.appId - Application ID
   * @param {string} params.period - "day" | "week" | "month" | "year"
   * @param {string} params.analysis - AI analysis text
   * @param {Array} params.recommendations - Prioritized recommendations
   * @returns {Promise}
   */
  async saveAIInsights({ appId, period, analysis, recommendations }) {
    try {
      if (!window.csmApi || !window.csmApi.updateTableData) {
        console.warn('⚠️ window.csmApi.updateTableData not available');
        return;
      }

      const payload = {
        app_id: appId,
        obj_name: "crm_analytics",
        command: "update",
        pk_fields: ["app_id", "period"],
        obj_update: {
          app_id: appId,
          period: period,
          analysis_text: analysis,
          recommendations: JSON.stringify(recommendations),
          updated_at: new Date().toISOString()
        }
      };

      console.log(`📤 Saving AI insights to RocksDB for ${appId}/${period}...`);
      const result = await window.csmApi.updateTableData(payload);
      console.log(`✅ AI insights saved successfully:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Failed to save AI insights:`, error);
      throw error;
    }
  },

  async saveCRMOverview({ appId, period, crmStats }) {
    try {
      if (!window.csmApi || !window.csmApi.updateTableData) {
        console.warn('⚠️ window.csmApi.updateTableData not available');
        return;
      }

      const payload = {
        app_id: appId,
        obj_name: 'crm_dashboard_overview',
        command: 'insert',
        pk_fields: ['app_id', 'period', 'created_date'],
        obj_update: {
          app_id: appId,
          period,
          created_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          crm_stats: JSON.stringify(crmStats || {})
        }
      };

      console.log(`📤 Saving CRM overview for ${appId}/${period}...`);
      const result = await window.csmApi.updateTableData(payload);
      console.log('✅ CRM overview saved successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to save CRM overview:', error);
      throw error;
    }
  }
};

// ========== MOCK DATA GENERATOR ==========
// Replace with RecordManager.filter() when integrated

function generateMockAnalytics(period) {
  const periods = {
    day: 1,
    week: 7,
    month: 30,
    year: 365
  };

  const days = periods[period] || 7;
  const now = new Date();
  const timeline = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    timeline.push({
      date: date.toISOString().split('T')[0],
      revenue: Math.random() * 50000 + 10000,
      customers: Math.floor(Math.random() * 100 + 20),
      converted_customers: Math.floor(Math.random() * 30 + 5)
    });
  }

  return {
    metrics: {
      new_customers: Math.floor(Math.random() * 500 + 100),
      revenue: Math.random() * 500000 + 100000,
      conversion_rate: Math.random() * 20 + 2,
      aov: Math.random() * 5000 + 500,
      traffic: Math.floor(Math.random() * 10000 + 1000),
      ad_roas: Math.random() * 300 + 50,
      trends: {
        new: (Math.random() - 0.5) * 50,
        revenue: (Math.random() - 0.5) * 50,
        conversion: (Math.random() - 0.5) * 30,
        aov: (Math.random() - 0.5) * 40,
        traffic: (Math.random() - 0.5) * 45,
        roas: (Math.random() - 0.5) * 60
      }
    },
    timeline,
    channels: {
      chat: Math.floor(Math.random() * 200 + 20),
      website: Math.floor(Math.random() * 400 + 50),
      facebook: Math.floor(Math.random() * 300 + 30),
      google: Math.floor(Math.random() * 250 + 25),
      organic: Math.floor(Math.random() * 150 + 15),
      direct: Math.floor(Math.random() * 100 + 10)
    },
    ads: {
      google: Math.random() * 400 + 50,
      facebook: Math.random() * 350 + 40,
      tiktok: Math.random() * 300 + 30,
      snapchat: Math.random() * 200 + 20
    }
  };
}

function generateMockCRMStats() {
  const totalCustomers = Math.floor(Math.random() * 2000 + 300);
  const contacted = Math.floor(totalCustomers * (0.45 + Math.random() * 0.25));
  const purchased = Math.floor(contacted * (0.2 + Math.random() * 0.25));
  const cancelled = Math.floor(totalCustomers * (0.03 + Math.random() * 0.08));

  return {
    total_customers: totalCustomers,
    new_customers: Math.floor(Math.random() * 200 + 20),
    contacted_customers: contacted,
    purchased_customers: purchased,
    cancelled_customers: cancelled,
    conversion_rate: contacted > 0 ? (purchased / contacted) : 0
  };
}

// ========== REACT COMPONENTS ==========

function KeyMetricsCards({ data }) {
  if (!data) return null;
  const { metrics } = data;
  const theme = getTheme();

  const cards = [
    {
      title: t('new_customers'),
      value: Math.round(metrics.new_customers),
      trend: metrics.trends.new,
      icon: '👥'
    },
    {
      title: t('revenue'),
      value: '$' + (metrics.revenue / 1000).toFixed(1) + 'k',
      trend: metrics.trends.revenue,
      icon: '💰'
    },
    {
      title: t('conversion_rate'),
      value: metrics.conversion_rate.toFixed(1) + '%',
      trend: metrics.trends.conversion,
      icon: '📊'
    },
    {
      title: t('avg_order_value'),
      value: '$' + Math.round(metrics.aov),
      trend: metrics.trends.aov,
      icon: '🛒'
    },
    {
      title: t('traffic'),
      value: Math.round(metrics.traffic),
      trend: metrics.trends.traffic,
      icon: '📈'
    },
    {
      title: t('ad_roas'),
      value: metrics.ad_roas.toFixed(1) + '%',
      trend: metrics.trends.roas,
      icon: '🎯'
    }
  ];

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
      ${cards.map(card => `
        <div style="padding: 16px; background: ${theme.cardBg}; border-radius: 8px; border: 1px solid ${theme.border}; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
          <div style="font-size: 12px; color: ${theme.textSecondary}; margin-bottom: 8px;">${card.title}</div>
          <div style="font-size: 24px; font-weight: bold; color: ${theme.text}; margin-bottom: 8px;">${card.value}</div>
          <div style="font-size: 12px; color: ${card.trend > 0 ? '#52c41a' : '#ff4d4f'};">
            ${card.trend > 0 ? '📈' : '📉'} ${Math.abs(card.trend).toFixed(1)}%
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function TrendCharts({ data }) {
  if (!data || !data.timeline) return null;

  const theme = getTheme();
  const timelineData = data.timeline;
  const dates = timelineData.map(d => d.date);
  const revenue = timelineData.map(d => d.revenue);
  const customers = timelineData.map(d => d.customers);
  const converted = timelineData.map(d => d.converted_customers);

  return `
    <div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h3 style="color: ${theme.text};">${t('revenue_trends')}</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <h4 style="color: ${theme.text};">${t('revenue_trend')}</h4>
          <div style="height: 200px; background: ${theme.chartPlaceholder}; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: ${theme.textSecondary};">
            ${t('chart_revenue_over_time')} (${dates.length} ${t('days')})
          </div>
        </div>
        <div>
          <h4 style="color: ${theme.text};">${t('customer_acquisition')}</h4>
          <div style="height: 200px; background: ${theme.chartPlaceholder}; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: ${theme.textSecondary};">
            ${t('chart_customers')} (${dates.length} ${t('days')})
          </div>
        </div>
      </div>
    </div>
  `;
}

function AnalysisCharts({ data }) {
  if (!data) return null;
  const { channels, ads } = data;
  const theme = getTheme();

  const channelTotal = Object.values(channels).reduce((a, b) => a + b, 0);
  const channelPcts = Object.entries(channels).map(([name, count]) => ({
    name,
    value: ((count / channelTotal) * 100).toFixed(1)
  }));

  return `
    <div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h3 style="color: ${theme.text};">🎯 Channel Distribution & Ad Performance</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <h4 style="color: ${theme.text};">Customer by Channel (%)</h4>
          <ul style="margin: 0; padding: 0 0 0 20px; color: ${theme.text};">
            ${channelPcts.map(c => `<li>${c.name}: ${c.value}%</li>`).join('')}
          </ul>
        </div>
        <div>
          <h4 style="color: ${theme.text};">Ad Platform ROAS (%)</h4>
          <ul style="margin: 0; padding: 0 0 0 20px; color: ${theme.text};">
            ${Object.entries(ads).map(([name, roas]) => 
              `<li>${name}: ${roas.toFixed(1)}%</li>`
            ).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function AIInsightsPanel({ aiData }) {
  if (!aiData) return null;
  const { analysis, recommendations } = aiData;
  const theme = getTheme();

  const priorityBadges = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    normal: '🟢',
    info: '⚪'
  };

  return `
    <div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px;">
      <h3 style="color: ${theme.text};">${t('ai_insights')}</h3>
      <div style="background: ${theme.chartPlaceholder}; padding: 12px; border-radius: 4px; margin-bottom: 16px; line-height: 1.6; color: ${theme.text};">
        ${analysis}
      </div>
      <h4 style="color: ${theme.text};">${t('prioritized_recommendations')}</h4>
      <div>
        ${recommendations.map(rec => `
          <div style="padding: 12px; margin-bottom: 8px; background: ${theme.recommendationBg}; border-left: 3px solid ${theme.primary}; border-radius: 2px;">
            <div style="font-weight: bold; margin-bottom: 4px; color: ${theme.text};">
              ${priorityBadges[rec.priority]} ${rec.priority.toUpperCase()}: ${rec.title}
            </div>
            <div style="font-size: 12px; color: ${theme.textSecondary};">${rec.description}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function CRMOverviewPanel({ crmData }) {
  if (!crmData) return null;
  const theme = getTheme();

  const cards = [
    { title: t('total_customers'), value: crmData.total_customers || 0, color: '#1677ff' },
    { title: t('new_customers'), value: crmData.new_customers || 0, color: '#13c2c2' },
    { title: t('contacted'), value: crmData.contacted_customers || 0, color: '#fa8c16' },
    { title: t('purchased'), value: crmData.purchased_customers || 0, color: '#52c41a' },
    { title: t('cancelled'), value: crmData.cancelled_customers || 0, color: '#f5222d' },
    {
      title: t('crm_conversion'),
      value: `${((crmData.conversion_rate || 0) * 100).toFixed(1)}%`,
      color: '#722ed1'
    }
  ];

  return `
    <div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h3 style="color: ${theme.text};">${t('crm_overview')}</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
        ${cards.map((card) => `
          <div style="padding: 12px; border-radius: 6px; background: ${theme.recommendationBg}; border: 1px solid ${theme.border};">
            <div style="font-size: 12px; color: ${theme.textSecondary}; margin-bottom: 6px;">${card.title}</div>
            <div style="font-size: 22px; font-weight: 700; color: ${card.color};">${card.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ========== MAIN DASHBOARD ==========

async function AnalyticsDashboard() {
  const appId = window.csmCurrentUser?.app_id || window.csmCurrentUser?.appId || 'csm';
  let timePeriod = 'week';
  let crmStats = null;
  let analytics = null;
  let aiInsights = null;
  let googlebotStats = null;
  let lastSaveTime = 0;

  // Auto-save every 5 minutes
  const autoSaveInterval = timerRegistry.register(
    'analytics-auto-save',
    setInterval(async () => {
      if (analytics && (Date.now() - lastSaveTime > 5 * 60 * 1000)) {
        try {
          await AnalyticsStorage.saveAnalytics({
            appId,
            period: timePeriod,
            metrics: analytics.metrics,
            timeline: analytics.timeline,
            channels: analytics.channels,
            ads: analytics.ads
          });

          if (aiInsights) {
            await AnalyticsStorage.saveAIInsights({
              appId,
              period: timePeriod,
              analysis: aiInsights.analysis,
              recommendations: aiInsights.recommendations
            });
          }

          if (crmStats) {
            await AnalyticsStorage.saveCRMOverview({
              appId,
              period: timePeriod,
              crmStats
            });
          }

          lastSaveTime = Date.now();
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, 60000)
  );

  // Fetch analytics on startup
  async function loadAnalytics(period) {
    timePeriod = period;

    if (window.csmApi?.getCRMStats) {
      try {
        const crmResponse = await window.csmApi.getCRMStats({ appId });
        crmStats = unwrapApiData(crmResponse) || generateMockCRMStats();
      } catch (error) {
        console.error('Failed to fetch CRM stats:', error);
        crmStats = generateMockCRMStats();
      }
    } else {
      crmStats = generateMockCRMStats();
    }

    // Replace with window.csmApi.getAnalytics(appId, period) when backend ready
    if (window.csmApi?.getAnalytics) {
      try {
        const analyticsResponse = await window.csmApi.getAnalytics(appId, period);
        analytics = unwrapApiData(analyticsResponse);
        if (!analytics) {
          throw new Error('Analytics API returned empty data');
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
        analytics = generateMockAnalytics(period);
      }
    } else {
      analytics = generateMockAnalytics(period);
    }

    // Fetch AI insights
    if (window.csmApi?.getAIInsights) {
      try {
        const aiResponse = await window.csmApi.getAIInsights(appId, period);
        aiInsights = unwrapApiData(aiResponse);
      } catch (error) {
        console.error('Failed to fetch AI insights:', error);
        aiInsights = null;
      }
    }

    // Fetch Googlebot visits stats for dynamic dashboard (moved from Home)
    if (window.csmApi?.getGooglebotStats) {
      try {
        const googlebotResponse = await window.csmApi.getGooglebotStats({ appId, limit: 200, offset: 0 });
        googlebotStats = normalizeGooglebotStats(unwrapApiData(googlebotResponse));
      } catch (error) {
        console.error('Failed to fetch Googlebot stats:', error);
        googlebotStats = null;
      }
    }

    // Fallback: aggregate directly from googlebot_visits table if API shape changed or unavailable.
    if (!googlebotStats && window.csmApi?.getTableData) {
      try {
        const rowsResponse = await window.csmApi.getTableData({
          app_id: 'csm',
          obj_name: 'googlebot_visits',
          take: 200
        });
        const rows = rowsResponse?.rows || rowsResponse?.data || [];
        googlebotStats = aggregateGooglebotRows(rows);
      } catch (error) {
        console.error('Fallback googlebot_visits query failed:', error);
        googlebotStats = null;
      }
    }

    // Initial save
    if (analytics) {
      try {
        await AnalyticsStorage.saveAnalytics({
          appId,
          period: timePeriod,
          metrics: analytics.metrics,
          timeline: analytics.timeline,
          channels: analytics.channels,
          ads: analytics.ads
        });

        if (crmStats) {
          await AnalyticsStorage.saveCRMOverview({
            appId,
            period: timePeriod,
            crmStats
          });
        }

        lastSaveTime = Date.now();
      } catch (error) {
        console.error('Initial save failed:', error);
      }
    }

    renderDashboard();
  }

  function renderDashboard() {
    const container = document.getElementById('broadcast-auto-root');
    if (!container) return;
    const theme = getTheme();

    const googlebotPanel = (() => {
      if (!googlebotStats) {
        return `
          <div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h3 style="color: ${theme.text};">${t('googlebot_visits')}</h3>
            <div style="font-size: 13px; color: ${theme.textSecondary};">${t('googlebot_not_available')}</div>
          </div>
        `;
      }

      const latestRows = Array.isArray(googlebotStats.latest) ? googlebotStats.latest : [];
      const byDateRows = Array.isArray(googlebotStats.byDate) ? googlebotStats.byDate.slice(0, 7) : [];
      const todayKey = new Date().toISOString().slice(0, 10);
      const todayCount = byDateRows.find((r) => String(r?.date) === todayKey)?.count || 0;
      const lastVisit = latestRows[0]?.visitedAt ? formatDateTimeByLang(latestRows[0].visitedAt) : t('googlebot_no_visit');

      return `
        <div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: ${theme.text};">${t('googlebot_visits')}</h3>
            <div style="display: flex; gap: 8px;">
              <button id="googlebot-refresh-btn" style="padding: 6px 10px; border: 1px solid ${theme.border}; background: ${theme.cardBg}; color: ${theme.text}; border-radius: 4px; cursor: pointer;">${t('googlebot_refresh')}</button>
              <button id="googlebot-clear-btn" style="padding: 6px 10px; border: 1px solid #ffccc7; background: #fff1f0; color: #cf1322; border-radius: 4px; cursor: pointer;">${t('googlebot_clear')}</button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
            <div style="padding: 12px; border-radius: 6px; background: ${theme.recommendationBg}; border: 1px solid ${theme.border};">
              <div style="font-size: 12px; color: ${theme.textSecondary};">${t('total_visits')}</div>
              <div style="font-size: 24px; font-weight: 700; color: #1677ff;">${googlebotStats.totalVisits || 0}</div>
            </div>
            <div style="padding: 12px; border-radius: 6px; background: ${theme.recommendationBg}; border: 1px solid ${theme.border};">
              <div style="font-size: 12px; color: ${theme.textSecondary};">${t('googlebot_today')}</div>
              <div style="font-size: 24px; font-weight: 700; color: #13c2c2;">${todayCount}</div>
            </div>
            <div style="padding: 12px; border-radius: 6px; background: ${theme.recommendationBg}; border: 1px solid ${theme.border};">
              <div style="font-size: 12px; color: ${theme.textSecondary};">${t('googlebot_last_visit')}</div>
              <div style="font-size: 14px; font-weight: 600; color: ${theme.text};">${lastVisit}</div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="border: 1px solid ${theme.border}; border-radius: 6px; padding: 10px;">
              <div style="font-weight: 600; margin-bottom: 8px; color: ${theme.text};">${t('by_date')}</div>
              <div style="max-height: 220px; overflow: auto; font-size: 12px;">
                ${byDateRows.length ? byDateRows.map((row) => `
                  <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed ${theme.border}; color: ${theme.text}; gap: 8px;">
                    <span>${formatDateByLang(row.date || '-')}</span>
                    <span><b>${tWithCount('googlebot_visits_count', row.count || 0)}</b></span>
                  </div>
                `).join('') : `<div style="color: ${theme.textSecondary};">${t('no_daily_stats')}</div>`}
              </div>
            </div>
            <div style="border: 1px solid ${theme.border}; border-radius: 6px; padding: 10px;">
              <div style="font-weight: 600; margin-bottom: 8px; color: ${theme.text};">${t('latest_crawls')}</div>
              <div style="max-height: 220px; overflow: auto; font-size: 12px;">
                ${latestRows.length ? latestRows.slice(0, 12).map((row) => `
                  <div style="padding: 6px 0; border-bottom: 1px dashed ${theme.border};">
                    <div style="color: ${theme.text}; margin-bottom: 2px;">
                      <b>${row.host || '-'}</b> ${row.path || ''}
                    </div>
                    <div style="color: ${theme.textSecondary};">${formatDateTimeByLang(row.visitedAt || row.visited_at || '')}</div>
                  </div>
                `).join('') : `<div style="color: ${theme.textSecondary};">${t('no_recent_visits')}</div>`}
              </div>
            </div>
          </div>

          <div style="margin-top: 12px; border: 1px solid ${theme.border}; border-radius: 6px; overflow: hidden;">
            <div style="display: grid; grid-template-columns: 170px 140px 1fr 150px 1.2fr; gap: 8px; padding: 10px; font-size: 12px; font-weight: 600; background: ${theme.recommendationBg}; color: ${theme.text}; border-bottom: 1px solid ${theme.border};">
              <span>${t('googlebot_visited_at')}</span>
              <span>${t('googlebot_host')}</span>
              <span>${t('googlebot_path')}</span>
              <span>${t('googlebot_ip')}</span>
              <span>${t('googlebot_user_agent')}</span>
            </div>
            <div style="max-height: 280px; overflow: auto;">
              ${latestRows.length ? latestRows.slice(0, 40).map((row) => `
                <div style="display: grid; grid-template-columns: 170px 140px 1fr 150px 1.2fr; gap: 8px; padding: 8px 10px; font-size: 12px; color: ${theme.text}; border-bottom: 1px dashed ${theme.border};">
                  <span>${formatDateTimeByLang(row.visitedAt || row.visited_at || '')}</span>
                  <span>${row.host || '-'}</span>
                  <span title="${row.path || ''}">${row.path || '-'}</span>
                  <span>${row.ip || '-'}</span>
                  <span title="${row.userAgent || row.user_agent || ''}">${row.userAgent || row.user_agent || '-'}</span>
                </div>
              `).join('') : `<div style="padding: 10px; color: ${theme.textSecondary};">${t('no_recent_visits')}</div>`}
            </div>
          </div>
        </div>
      `;
    })();

    const html = `
      <div style="max-width: 1400px; margin: 0 auto; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2 style="color: ${theme.text};">${t('dashboard_title')}</h2>
          <div style="display: flex; gap: 12px;">
            <select id="period-select" style="padding: 8px; border: 1px solid ${theme.border}; background: ${theme.cardBg}; color: ${theme.text}; border-radius: 4px;">
              <option value="day" ${timePeriod === 'day' ? 'selected' : ''}>${t('period_day')}</option>
              <option value="week" ${timePeriod === 'week' ? 'selected' : ''}>${t('period_week')}</option>
              <option value="month" ${timePeriod === 'month' ? 'selected' : ''}>${t('period_month')}</option>
              <option value="year" ${timePeriod === 'year' ? 'selected' : ''}>${t('period_year')}</option>
            </select>
            <button onclick="window.location.reload()" style="padding: 8px 16px; background: ${theme.primary}; color: white; border: none; border-radius: 4px; cursor: pointer;">${t('refresh')}</button>
          </div>
        </div>

        ${analytics ? `
          ${googlebotPanel}
          ${CRMOverviewPanel({ crmData: crmStats })}
          ${KeyMetricsCards({ data: analytics })}
          ${TrendCharts({ data: analytics })}
          ${AnalysisCharts({ data: analytics })}
          ${aiInsights ? AIInsightsPanel({ aiData: aiInsights }) : `<div style="background: ${theme.cardBg}; padding: 16px; border-radius: 8px; text-align: center; color: ${theme.textSecondary};">${t('loading_ai_insights')}</div>`}

          <div style="margin-top: 24px; padding: 12px; background: ${theme.chartPlaceholder}; border-radius: 4px; font-size: 12px; color: ${theme.textSecondary};">
            ${t('auto_saved')}
          </div>
        ` : `<div style="text-align: center; padding: 40px; color: ${theme.textSecondary};">${t('loading_analytics')}</div>`}
      </div>
    `;

    container.innerHTML = html;

    // Period selector handler
    const periodSelect = document.getElementById('period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        loadAnalytics(e.target.value);
      });
    }

    const refreshGooglebotBtn = document.getElementById('googlebot-refresh-btn');
    if (refreshGooglebotBtn) {
      refreshGooglebotBtn.addEventListener('click', async () => {
        try {
          if (window.csmApi?.getGooglebotStats) {
            const response = await window.csmApi.getGooglebotStats({ appId, limit: 200, offset: 0 });
            googlebotStats = normalizeGooglebotStats(unwrapApiData(response));

            if (!googlebotStats && window.csmApi?.getTableData) {
              const rowsResponse = await window.csmApi.getTableData({
                app_id: 'csm',
                obj_name: 'googlebot_visits',
                take: 200
              });
              const rows = rowsResponse?.rows || rowsResponse?.data || [];
              googlebotStats = aggregateGooglebotRows(rows);
            }

            renderDashboard();
          }
        } catch (error) {
          console.error('Refresh Googlebot stats failed:', error);
        }
      });
    }

    const clearGooglebotBtn = document.getElementById('googlebot-clear-btn');
    if (clearGooglebotBtn) {
      clearGooglebotBtn.addEventListener('click', async () => {
        try {
          if (!window.confirm('Clear all Googlebot visits?')) {
            return;
          }
          if (window.csmApi?.deleteGooglebotStats) {
            const response = await window.csmApi.deleteGooglebotStats({ deleteAll: true });
            googlebotStats = normalizeGooglebotStats(unwrapApiData(response)) || {
              totalVisits: 0,
              latest: [],
              byDate: []
            };
            renderDashboard();
          }
        } catch (error) {
          console.error('Clear Googlebot stats failed:', error);
        }
      });
    }
  }

  // Initial load
  await loadAnalytics('week');

  // Listen for language changes
  const handleLanguageChange = () => {
    console.log('Language changed, re-rendering dashboard...');
    renderDashboard();
  };
  
  window.addEventListener('storage', (e) => {
    if (e.key === 'language') {
      handleLanguageChange();
    }
  });

  // Cleanup on unmount
  return () => {
    timerRegistry.clear('analytics-auto-save');
    window.removeEventListener('storage', handleLanguageChange);
  };
}

// ========== EXPORT & INITIALIZATION ==========

// Initialize when page loads
if (typeof window !== 'undefined') {
  AnalyticsDashboard().catch(error => {
    console.error('Dashboard initialization failed:', error);
  });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnalyticsDashboard;
}
