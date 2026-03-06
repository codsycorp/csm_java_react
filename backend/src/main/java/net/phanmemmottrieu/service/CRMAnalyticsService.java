package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.phanmemmottrieu.data.RecordManager;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * CRM Analytics Service - Advanced reporting and trend analysis
 * 
 * Provides comprehensive analytics for:
 * - Customer acquisition trends
 * - Revenue/sales trends
 * - Channel performance analysis
 * - Product performance metrics
 * - AI-powered insights and recommendations
 * 
 * Supports multiple time periods:
 * - day: Last 24 hours (hourly breakdown)
 * - week: Last 7 days (daily breakdown)
 * - month: Last 30 days (daily breakdown)
 * - year: Last 12 months (monthly breakdown)
 */
@Service
public class CRMAnalyticsService {
    private static final Logger logger = LoggerFactory.getLogger(CRMAnalyticsService.class);
    private final RecordManager recordManager;
    private final AIProviderFactory aiProviderFactory;
    
    @Autowired
    public CRMAnalyticsService(RecordManager recordManager, AIProviderFactory aiProviderFactory) {
        this.recordManager = recordManager;
        this.aiProviderFactory = aiProviderFactory;
    }
    
    /**
     * Get comprehensive analytics for a time period
     * Returns key metrics, trends, and breakdowns
     */
    public Map<String, Object> getAnalytics(String appId, String timePeriod) {
        try {
            Map<String, Object> analytics = new HashMap<>();
            
            // Determine time range
            Map<String, Long> timeRange = getTimeRange(timePeriod);
            long startTime = timeRange.get("start");
            long endTime = timeRange.get("end");
            
            analytics.put("time_period", timePeriod);
            analytics.put("start_time", startTime);
            analytics.put("end_time", endTime);
            
            // Get key metrics
            Map<String, Object> metrics = calculateKeyMetrics(appId, startTime, endTime);
            analytics.put("metrics", metrics);
            
            // Get timeline data for charts
            Map<String, Object> timeline = getTimelineData(appId, timePeriod, startTime, endTime);
            analytics.put("timeline", timeline);
            
            // Get channel breakdown (source analysis)
            analytics.put("channels", getChannelAnalysis(appId, startTime, endTime));
            
            // Get product performance
            analytics.put("products", getProductPerformance(appId, startTime, endTime));
            
            // Get ad performance
            analytics.put("ads", getAdPerformance(appId, startTime, endTime));
            
            logger.info("Analytics retrieved for app: {} period: {}", appId, timePeriod);
            return analytics;
            
        } catch (Exception e) {
            logger.error("Error getting analytics for app: {}", appId, e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }
    
    /**
     * Calculate key performance indicators
     */
    private Map<String, Object> calculateKeyMetrics(String appId, long startTime, long endTime) {
        Map<String, Object> metrics = new HashMap<>();
        
        try {
            // Simulate data retrieval (in production, use RecordManager.filter())
            // For now, return structure with mock data
            
            metrics.put("total_customers", 0L);        // Total unique customers
            metrics.put("new_customers", 0L);          // New in period
            metrics.put("contacted_customers", 0L);    // Contacted in period
            metrics.put("purchased_customers", 0L);    // Made purchase
            metrics.put("total_revenue", 0.0);         // Total sales
            metrics.put("average_order_value", 0.0);   // AOV
            metrics.put("conversion_rate", 0.0);       // % of contacted → purchased
            metrics.put("repeat_customer_rate", 0.0);  // % with multiple purchases
            metrics.put("customer_retention", 0.0);    // % active from previous period
            metrics.put("web_traffic", 0L);            // Total page views
            metrics.put("ads_spend", 0.0);             // Total ad spend
            metrics.put("ads_roas", 0.0);              // Return on ad spend
            
            return metrics;
        } catch (Exception e) {
            logger.error("Error calculating metrics", e);
            return metrics;
        }
    }
    
    /**
     * Get timeline data for trending charts
     */
    private Map<String, Object> getTimelineData(String appId, String timePeriod, long startTime, long endTime) {
        Map<String, Object> timeline = new HashMap<>();
        
        try {
            List<String> labels = generateTimeLabels(timePeriod);
            
            // Revenue trend
            timeline.put("revenue_labels", labels);
            timeline.put("revenue_data", generateMockTimeseries(labels.size()));
            
            // Customer acquisition trend
            timeline.put("customers_labels", labels);
            timeline.put("customers_data", generateMockTimeseries(labels.size()));
            timeline.put("customers_converted_data", generateMockTimeseries(labels.size()));
            
            // Contact attempts
            timeline.put("contacts_labels", labels);
            timeline.put("contacts_data", generateMockTimeseries(labels.size()));
            
            return timeline;
        } catch (Exception e) {
            logger.error("Error getting timeline data", e);
            return timeline;
        }
    }
    
    /**
     * Analyze customer acquisition by channel (chat, website, ads, etc.)
     */
    private Map<String, Object> getChannelAnalysis(String appId, long startTime, long endTime) {
        Map<String, Object> channels = new HashMap<>();
        
        try {
            // Channel breakdown: chat, website, facebook, google_ads, direct, referral
            channels.put("chat", new HashMap<String, Object>() {
                {
                    put("customers", 0L);
                    put("revenue", 0.0);
                    put("conversion_rate", 0.0);
                    put("percentage", 0.0);
                }
            });
            channels.put("website", new HashMap<String, Object>() {
                {
                    put("customers", 0L);
                    put("revenue", 0.0);
                    put("conversion_rate", 0.0);
                    put("percentage", 0.0);
                }
            });
            channels.put("facebook", new HashMap<String, Object>() {
                {
                    put("customers", 0L);
                    put("revenue", 0.0);
                    put("conversion_rate", 0.0);
                    put("percentage", 0.0);
                }
            });
            channels.put("google_ads", new HashMap<String, Object>() {
                {
                    put("customers", 0L);
                    put("revenue", 0.0);
                    put("conversion_rate", 0.0);
                    put("percentage", 0.0);
                }
            });
            channels.put("other", new HashMap<String, Object>() {
                {
                    put("customers", 0L);
                    put("revenue", 0.0);
                    put("conversion_rate", 0.0);
                    put("percentage", 0.0);
                }
            });
            
            return channels;
        } catch (Exception e) {
            logger.error("Error analyzing channels", e);
            return channels;
        }
    }
    
    /**
     * Analyze product performance - best sellers, most viewed, ROI
     */
    private Map<String, Object> getProductPerformance(String appId, long startTime, long endTime) {
        Map<String, Object> products = new HashMap<>();
        
        try {
            // Top products by sales
            products.put("top_sellers", new ArrayList<>());
            
            // Products with highest ROI
            products.put("top_roi", new ArrayList<>());
            
            // Recently added products
            products.put("new_products_views", new ArrayList<>());
            
            return products;
        } catch (Exception e) {
            logger.error("Error analyzing products", e);
            return products;
        }
    }
    
    /**
     * Analyze ad campaign performance
     */
    private Map<String, Object> getAdPerformance(String appId, long startTime, long endTime) {
        Map<String, Object> adData = new HashMap<>();
        
        try {
            adData.put("total_campaigns", 0);
            adData.put("active_campaigns", 0);
            adData.put("total_spend", 0.0);
            adData.put("total_revenue", 0.0);
            adData.put("roas", 0.0);
            adData.put("avg_cpc", 0.0);
            adData.put("avg_ctr", 0.0);
            
            // By platform
            Map<String, Object> byPlatform = new HashMap<>();
            byPlatform.put("facebook", new HashMap<String, Object>() {
                {
                    put("spend", 0.0);
                    put("revenue", 0.0);
                    put("roas", 0.0);
                }
            });
            byPlatform.put("google", new HashMap<String, Object>() {
                {
                    put("spend", 0.0);
                    put("revenue", 0.0);
                    put("roas", 0.0);
                }
            });
            
            adData.put("by_platform", byPlatform);
            
            return adData;
        } catch (Exception e) {
            logger.error("Error analyzing ads", e);
            return adData;
        }
    }
    
    /**
     * Get AI-powered insights and actionable recommendations
     */
    public Map<String, Object> getAIInsights(String appId, String timePeriod) {
        try {
            // Get analytics data first
            Map<String, Object> analytics = getAnalytics(appId, timePeriod);
            
            // Prepare prompt for AI analysis
            String prompt = generateAnalysisPrompt(analytics, appId, timePeriod);
            
            // Get AI analysis
            String analysisText = aiProviderFactory.generateContent(prompt);
            
            // Parse AI response
            Map<String, Object> insights = new HashMap<>();
            insights.put("analysis", analysisText);
            insights.put("timestamp", System.currentTimeMillis());
            insights.put("data_source", "ai_analysis");
            
            // Extract key insights from analysis
            Map<String, Object> extracted = extractKeyInsights(analysisText, analytics);
            insights.putAll(extracted);
            
            logger.info("AI insights generated for app: {} period: {}", appId, timePeriod);
            return insights;
            
        } catch (Exception e) {
            logger.error("Error generating AI insights", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }
    
    /**
     * Generate comprehensive analysis prompt for AI
     */
    private String generateAnalysisPrompt(Map<String, Object> analytics, String appId, String timePeriod) {
        StringBuilder prompt = new StringBuilder();
        
        prompt.append("Bạn là chuyên gia phân tích dữ liệu kinh doanh. ");
        prompt.append("Phân tích dữ liệu kinh doanh sau và đưa ra 3-5 khuyến nghị hành động cụ thể để cải thiện hiệu quả bán hàng:\n\n");
        
        prompt.append("THỜI KỲ: ").append(timePeriod.toUpperCase()).append("\n");
        
        @SuppressWarnings("unchecked")
        Map<String, Object> metrics = (Map<String, Object>) analytics.get("metrics");
        if (metrics != null) {
            prompt.append("\n📊 CÁC CHỈ SỐ CHÍNH:\n");
            metrics.forEach((key, value) -> {
                prompt.append(String.format("- %s: %s\n", formatKey(key), value));
            });
        }
        
        @SuppressWarnings("unchecked")
        Map<String, Object> channels = (Map<String, Object>) analytics.get("channels");
        if (channels != null) {
            prompt.append("\n📍 PHÂN TÍCH KÊNH:\n");
            channels.forEach((key, value) -> {
                Map<String, Object> data = (Map<String, Object>) value;
                prompt.append(String.format("- %s: %d khách, %.2f%% tỷ lệ chuyển đổi\n",
                    formatKey(key), data.get("customers"), data.get("conversion_rate")));
            });
        }
        
        prompt.append("\nYÊU CẦU:\n");
        prompt.append("1. Xác định điểm mạnh và điểm yếu chính\n");
        prompt.append("2. Đưa ra 3-5 khuyến nghị hành động ưu tiên (cụ thể, có thể thực hiện)\n");
        prompt.append("3. Ước tính tác động dự kiến của mỗi hành động\n");
        prompt.append("4. Sắp xếp theo mức độ ưu tiên (tác động cao/công sức thấp trước)\n");
        prompt.append("5. Trả lời bằng Vietnamese (Tiếng Việt)\n");
        
        return prompt.toString();
    }
    
    /**
     * Extract structured insights from AI analysis text
     */
    private Map<String, Object> extractKeyInsights(String analysisText, Map<String, Object> analytics) {
        Map<String, Object> extracted = new HashMap<>();
        
        try {
            // Parse AI text to extract recommendations
            List<Map<String, Object>> recommendations = new ArrayList<>();
            
            // Simple parsing - split by recommendation number
            String[] lines = analysisText.split("\n");
            Map<String, Object> currentRec = null;
            
            for (String line : lines) {
                if (line.matches("^[0-9]\\..*")) {
                    if (currentRec != null) {
                        recommendations.add(currentRec);
                    }
                    currentRec = new HashMap<>();
                    currentRec.put("action", line.trim());
                    currentRec.put("priority", recommendations.size() + 1);
                } else if (currentRec != null && !line.trim().isEmpty()) {
                    String description = (String) currentRec.getOrDefault("description", "");
                    currentRec.put("description", description + " " + line.trim());
                }
            }
            
            if (currentRec != null) {
                recommendations.add(currentRec);
            }
            
            extracted.put("recommendations", recommendations);
            extracted.put("recommendation_count", recommendations.size());
            
        } catch (Exception e) {
            logger.warn("Could not extract structured insights from AI response", e);
            extracted.put("recommendations", new ArrayList<>());
        }
        
        return extracted;
    }
    
    /**
     * Generate time period labels
     */
    private List<String> generateTimeLabels(String timePeriod) {
        List<String> labels = new ArrayList<>();
        
        switch (timePeriod.toLowerCase()) {
            case "day":
                // Last 24 hours - hourly
                LocalDateTime now = LocalDateTime.now();
                for (int i = 23; i >= 0; i--) {
                    labels.add(now.minusHours(i).format(DateTimeFormatter.ofPattern("HH:00")));
                }
                break;
                
            case "week":
                // Last 7 days
                LocalDate today = LocalDate.now();
                for (int i = 6; i >= 0; i--) {
                    LocalDate date = today.minusDays(i);
                    labels.add(date.format(DateTimeFormatter.ofPattern("EEE dd/MM")));
                }
                break;
                
            case "month":
                // Last 30 days (by week or daily)
                LocalDate monthStart = LocalDate.now().minusDays(29);
                for (int i = 0; i < 30; i += 2) {
                    labels.add(monthStart.plusDays(i).format(DateTimeFormatter.ofPattern("dd/MM")));
                }
                break;
                
            case "year":
                // Last 12 months
                YearMonth now_ym = YearMonth.now();
                for (int i = 11; i >= 0; i--) {
                    labels.add(now_ym.minusMonths(i).format(DateTimeFormatter.ofPattern("MMM yyyy")));
                }
                break;
        }
        
        return labels;
    }
    
    /**
     * Generate mock timeseries data for demo
     */
    private List<Long> generateMockTimeseries(int length) {
        List<Long> data = new ArrayList<>();
        Random rand = new Random();
        
        long base = 100;
        for (int i = 0; i < length; i++) {
            long value = base + rand.nextLong() % 50 - 25;
            data.add(Math.max(value, 10L));
        }
        
        return data;
    }
    
    /**
     * Get time range for period
     */
    private Map<String, Long> getTimeRange(String timePeriod) {
        Map<String, Long> range = new HashMap<>();
        long now = System.currentTimeMillis();
        
        switch (timePeriod.toLowerCase()) {
            case "day":
                range.put("start", now - (24 * 60 * 60 * 1000L));
                break;
            case "week":
                range.put("start", now - (7 * 24 * 60 * 60 * 1000L));
                break;
            case "month":
                range.put("start", now - (30 * 24 * 60 * 60 * 1000L));
                break;
            case "year":
                range.put("start", now - (365L * 24 * 60 * 60 * 1000L));
                break;
            default:
                range.put("start", now - (7 * 24 * 60 * 60 * 1000L)); // default: week
        }
        
        range.put("end", now);
        return range;
    }
    
    private String formatKey(String key) {
        return key.replace("_", " ").substring(0, 1).toUpperCase() + key.replace("_", " ").substring(1);
    }
}
