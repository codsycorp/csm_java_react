package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Dịch vụ tích hợp với X (Twitter) API v2 - CSM Bridge Business Connector.
 * 
 * <p>Tuân thủ X Developer Policy:
 * - CHỈ post business listings/updates từ verified domains
 * - KHÔNG spam, KHÔNG tự động like/follow
 * - Content distribution for search engine discovery
 * - Market monitoring compliance
 * 
 * <p>Free Tier Limits:
 * - 50 tweets per 24 hours (strictly enforced)
 * - 1,500 tweets per month
 * - Cooldown giữa các tweets: 5 phút
 * 
 * <p>Use Case: CSM Bridge Business Connector Platform
 * - Facilitate business connections between service providers and customers
 * - Industries: Real Estate, Beauty, Software
 * - Automatic distribution of time-sensitive business opportunities
 * - Social signals for search engine discovery
 */
@Service
public class XTwitterService {

    private static final Logger logger = LoggerFactory.getLogger(XTwitterService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ========== CONFIG ==========
    @Value("${x.twitter.enabled:false}")
    private boolean enabled;

    @Value("${x.twitter.consumer-key:}")
    private String consumerKey;

    @Value("${x.twitter.secret-key:}")
    private String secretKey;

    @Value("${x.twitter.access-token:}")
    private String accessToken;

    @Value("${x.twitter.access-token-secret:}")
    private String accessTokenSecret;

    @Value("${x.twitter.bearer-token:}")
    private String bearerToken;

    @Value("${x.twitter.auto-post:false}")
    private boolean autoPost;

    @Value("${x.twitter.daily-limit:50}")
    private int dailyLimit;

    @Value("${x.twitter.cooldown-minutes:5}")
    private int cooldownMinutes;

    // ========== CONSTANTS ==========
    private static final String TWITTER_API_V2_TWEET_URL = "https://api.twitter.com/2/tweets";
    private static final int TIMEOUT_MS = 10000;
    private static final String RATE_LIMIT_STATE_FILE = "./x-twitter-state.json";
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
    // Whitelist domains - CHỈ post từ các domains chính thức của CSM Bridge
    private static final Set<String> ALLOWED_DOMAINS = Set.of(
        "csmbridge.net",
        "www.csmbridge.net",
        "phanmemmottrieu.net",
        "www.phanmemmottrieu.net"
    );
    
    // ========== RATE LIMITING STATE ==========
    private final Map<String, RateLimitState> rateLimitCache = new ConcurrentHashMap<>();
    private volatile long lastTweetTime = 0L;

    // ========== INITIALIZATION ==========
    @PostConstruct
    public void init() {
        objectMapper.registerModule(new JavaTimeModule());
        if (enabled) {
            // Check OAuth 1.0a credentials
            if (consumerKey == null || consumerKey.isEmpty() ||
                secretKey == null || secretKey.isEmpty() ||
                accessToken == null || accessToken.isEmpty() ||
                accessTokenSecret == null || accessTokenSecret.isEmpty()) {
                logger.warn("⚠️ X Twitter integration is enabled but OAuth 1.0a credentials are missing");
                enabled = false;
            } else {
                loadRateLimitState();
                logger.info("✅ X Twitter integration initialized - OAuth 1.0a (User Context)");
                logger.info("  Auto-post: {}, Daily limit: {}/{}, Cooldown: {}min", 
                    autoPost, getTodayUsage(), dailyLimit, cooldownMinutes);
                logger.info("🔐 Allowed domains: {}", ALLOWED_DOMAINS);
            }
        } else {
            logger.info("ℹ️ X Twitter integration is disabled - Compliant with X Developer Policy");
        }
    }

    /**
     * Kiểm tra xem X Twitter integration có được bật không
     */
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Kiểm tra xem auto-post có được bật không
     */
    public boolean isAutoPostEnabled() {
        return enabled && autoPost;
    }

    /**
     * Đăng tweet với nội dung tùy chỉnh (OAuth 1.0a User Context)
     * 
     * @param text Nội dung tweet (tối đa 280 ký tự)
     * @return TwitterResult chứa kết quả post tweet
     */
    public TwitterResult postTweet(String text) {
        if (!enabled) {
            return new TwitterResult(false, "X Twitter integration is disabled", null);
        }

        if (text == null || text.isEmpty()) {
            return new TwitterResult(false, "Tweet text cannot be empty", null);
        }

        if (text.length() > 280) {
            logger.warn("⚠️ Tweet text exceeds 280 characters, truncating: {}", text.substring(0, 50));
            text = text.substring(0, 277) + "...";
        }

        try {
            URL apiUrl = new URL(TWITTER_API_V2_TWEET_URL);
            HttpURLConnection conn = (HttpURLConnection) apiUrl.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            
            // OAuth 1.0a Authorization header
            String authHeader = buildOAuth1Header("POST", TWITTER_API_V2_TWEET_URL, null);
            logger.info("🔐 OAuth Authorization Header: {}", authHeader.substring(0, Math.min(150, authHeader.length())) + "...");
            conn.setRequestProperty("Authorization", authHeader);
            
            conn.setDoOutput(true);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);

            // Request body theo Twitter API v2 format
            Map<String, Object> body = new HashMap<>();
            body.put("text", text);

            String jsonBody = objectMapper.writeValueAsString(body);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            String responseBody = readResponse(conn);

            if (responseCode >= 200 && responseCode < 300) {
                logger.info("✅ Tweet posted successfully - Response: {}", responseBody);
                return new TwitterResult(true, "Tweet posted successfully", responseBody);
            } else {
                logger.error("❌ Failed to post tweet - HTTP {}: {}", responseCode, responseBody);
                return new TwitterResult(false, "HTTP " + responseCode + ": " + responseBody, responseBody);
            }

        } catch (Exception e) {
            logger.error("❌ Error posting tweet: {}", e.getMessage(), e);
            return new TwitterResult(false, e.getMessage(), null);
        }
    }
    
    /**
     * Build OAuth 1.0a Authorization header
     */
    private String buildOAuth1Header(String method, String url, String payload) throws Exception {
        long timestamp = System.currentTimeMillis() / 1000;
        String nonce = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32);
        
        // Normalize URL (remove query parameters)
        String baseUrl = url.split("\\?")[0];
        
        // OAuth parameters - MUST be in alphabetical order for consistent signing
        Map<String, String> oauthParams = new java.util.TreeMap<>();
        oauthParams.put("oauth_consumer_key", consumerKey);
        oauthParams.put("oauth_nonce", nonce);
        oauthParams.put("oauth_signature_method", "HMAC-SHA1");
        oauthParams.put("oauth_timestamp", String.valueOf(timestamp));
        oauthParams.put("oauth_token", accessToken);
        oauthParams.put("oauth_version", "1.0");
        
        logger.info("🔏 OAuth signing: nonce={}, timestamp={}", nonce, timestamp);
        
        // Build signature base string - parameters must be alphabetically sorted
        StringBuilder sortedParams = new StringBuilder();
        oauthParams.forEach((key, value) -> {
            if (sortedParams.length() > 0) sortedParams.append("&");
            sortedParams.append(percentEncode(key)).append("=").append(percentEncode(value));
        });
        
        String signatureBaseString = method + "&" + percentEncode(baseUrl) + "&" + percentEncode(sortedParams.toString());
        logger.info("📋 FULL Signature Base String:\n{}", signatureBaseString);
        
        // Generate signature
        String signingKey = percentEncode(secretKey) + "&" + percentEncode(accessTokenSecret);
        logger.info("🔑 Signing Key: {}***&{}***", 
            (secretKey.length() > 5 ? secretKey.substring(0, 5) : "short"),
            (accessTokenSecret.length() > 5 ? accessTokenSecret.substring(0, 5) : "short"));
        
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA1");
        mac.init(new javax.crypto.spec.SecretKeySpec(signingKey.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        String signature = Base64.getEncoder().encodeToString(mac.doFinal(signatureBaseString.getBytes(StandardCharsets.UTF_8)));
        logger.info("🔐 Generated Signature: {}", signature);
        
        // Build Authorization header - ONLY VALUES percent-encoded, NOT parameter names (OAuth 1.0a spec)
        StringBuilder authHeader = new StringBuilder("OAuth ");
        oauthParams.forEach((key, value) -> {
            if (authHeader.length() > 6) authHeader.append(", ");
            authHeader.append(key).append("=\"").append(percentEncode(value)).append("\"");
        });
        authHeader.append(", oauth_signature=\"").append(percentEncode(signature)).append("\"");
        
        logger.info("🔐 FULL OAuth Authorization Header:\n{}", authHeader.toString());
        
        return authHeader.toString();
    }
    
    /**
     * Percent-encode utility
     */
    private String percentEncode(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20").replace("*", "%2A").replace("%7E", "~");
        } catch (Exception e) {
            return value;
        }
    }

    /**
     * Đăng tweet về URL được submit lên Google Index
     * 
     * @param url URL vừa được submit
     * @param action Action (update/remove)
     * @return TwitterResult chứa kết quả post tweet
     */
    public TwitterResult postUrlIndexedTweet(String url, String action) {
        if (!enabled) {
            return new TwitterResult(false, "X Twitter integration is disabled", null);
        }

        // Tạo message phù hợp cho tweet
        String tweetText = createIndexingTweetMessage(url, action);
        return postTweet(tweetText);
    }

    /**
     * Tự động post tweet nếu auto-post được bật
     * Method này được gọi từ GoogleIndexService sau khi submit URL thành công
     * 
     * <p>Tuân thủ X Developer Policy:
     * - CHỈ post nếu URL thuộc whitelisted domains
     * - CHỈ post nếu chưa vượt daily limit (50 tweets/day)
     * - CHỈ post nếu đã qua cooldown period (5 phút)
     * 
     * @param url URL vừa được submit
     * @param action Action (update/remove)
     */
    public void autoPostIfEnabled(String url, String action) {
        if (!isAutoPostEnabled()) {
            return;
        }

        // Policy check: CHỈ post từ allowed domains
        if (!isAllowedDomain(url)) {
            logger.info("ℹ️ Skipping X post - URL domain not in whitelist: {}", url);
            return;
        }

        // Rate limit check: Tuân thủ free tier 50 tweets/day
        if (!canPostTweet()) {
            logger.warn("⚠️ X rate limit reached - Used: {}/{} tweets today or cooldown active", 
                getTodayUsage(), dailyLimit);
            return;
        }

        try {
            logger.info("🐦 Auto-posting business update to X for URL: {}", url);
            TwitterResult result = postUrlIndexedTweet(url, action);
            
            if (result.success) {
                incrementUsage();
                lastTweetTime = System.currentTimeMillis();
                logger.info("✅ Business update posted to X - Remaining today: {}/{}", 
                    dailyLimit - getTodayUsage(), dailyLimit);
            } else {
                logger.warn("⚠️ Auto-post to X failed: {}", result.message);
            }
        } catch (Exception e) {
            logger.error("❌ Error during auto-post to X: {}", e.getMessage(), e);
        }
    }

    /**
     * Tạo nội dung tweet cho URL indexing
     * Tuân thủ X Policy: High-quality professional business updates
     */
    private String createIndexingTweetMessage(String url, String action) {
        // Business-focused messaging theo CSM Bridge use case
        if ("remove".equalsIgnoreCase(action)) {
            return String.format("📢 CSM Bridge Update: Content updated at %s - Connecting businesses with customers in Real Estate, Beauty & Software sectors. #Business #Vietnam", url);
        }
        
        // Detect business category from URL for better messaging
        String category = detectBusinessCategory(url);
        String message;
        
        if (category != null) {
            message = String.format("🆕 New %s listing on CSM Bridge: %s - Professional business opportunities in Vietnam. #Business #%s", 
                category, url, category);
        } else {
            message = String.format("🆕 New business listing on CSM Bridge: %s - Connecting service providers with customers. #Business #Vietnam", url);
        }
        
        // Tuân thủ 280 character limit
        if (message.length() > 280) {
            message = String.format("🆕 CSM Bridge: %s #Business", url);
            if (message.length() > 280) {
                message = message.substring(0, 277) + "...";
            }
        }
        
        return message;
    }
    
    /**
     * Phát hiện business category từ URL để tạo message phù hợp
     */
    private String detectBusinessCategory(String url) {
        String urlLower = url.toLowerCase();
        if (urlLower.contains("real-estate") || urlLower.contains("property") || urlLower.contains("nha-dat")) {
            return "RealEstate";
        } else if (urlLower.contains("beauty") || urlLower.contains("salon") || urlLower.contains("spa")) {
            return "Beauty";
        } else if (urlLower.contains("software") || urlLower.contains("tech") || urlLower.contains("phan-mem")) {
            return "Software";
        }
        return null;
    }
    
    /**
     * Kiểm tra domain có trong whitelist không
     * Tuân thủ X Policy: CHỈ post từ verified business domains
     */
    private boolean isAllowedDomain(String url) {
        try {
            URL urlObj = new URL(url);
            String host = urlObj.getHost().toLowerCase();
            return ALLOWED_DOMAINS.contains(host);
        } catch (Exception e) {
            logger.warn("⚠️ Invalid URL format: {}", url);
            return false;
        }
    }
    
    /**
     * Kiểm tra có thể post tweet không (rate limit + cooldown)
     */
    private synchronized boolean canPostTweet() {
        // Check daily limit
        if (getTodayUsage() >= dailyLimit) {
            return false;
        }
        
        // Check cooldown (5 phút giữa các tweets)
        long cooldownMs = cooldownMinutes * 60 * 1000L;
        long timeSinceLastTweet = System.currentTimeMillis() - lastTweetTime;
        if (lastTweetTime > 0 && timeSinceLastTweet < cooldownMs) {
            long remainingSeconds = (cooldownMs - timeSinceLastTweet) / 1000;
            logger.info("ℹ️ Cooldown active - Wait {}s before next tweet", remainingSeconds);
            return false;
        }
        
        return true;
    }
    
    /**
     * Lấy số tweets đã dùng hôm nay
     */
    private int getTodayUsage() {
        checkAndResetDailyLimit();
        String today = getTodayDateString();
        RateLimitState state = rateLimitCache.get(today);
        return state != null ? state.used : 0;
    }
    
    /**
     * Tăng usage counter
     */
    private synchronized void incrementUsage() {
        String today = getTodayDateString();
        RateLimitState state = rateLimitCache.computeIfAbsent(today, k -> {
            RateLimitState newState = new RateLimitState();
            newState.date = today;
            newState.used = 0;
            newState.limit = dailyLimit;
            return newState;
        });
        state.used++;
        state.lastUpdated = System.currentTimeMillis();
        saveRateLimitState();
    }
    
    /**
     * Kiểm tra và reset daily limit nếu ngày mới
     */
    private void checkAndResetDailyLimit() {
        String today = getTodayDateString();
        RateLimitState state = rateLimitCache.get(today);
        
        if (state == null) {
            logger.info("🔄 New day detected - Resetting X rate limit (0/{})", dailyLimit);
            
            // Xóa old entries
            rateLimitCache.entrySet().removeIf(entry -> {
                try {
                    LocalDate entryDate = LocalDate.parse(entry.getKey(), DATE_FORMATTER);
                    return entryDate.isBefore(LocalDate.now().minusDays(7));
                } catch (Exception e) {
                    return true;
                }
            });
            
            RateLimitState newState = new RateLimitState();
            newState.date = today;
            newState.used = 0;
            newState.limit = dailyLimit;
            newState.lastUpdated = System.currentTimeMillis();
            rateLimitCache.put(today, newState);
            saveRateLimitState();
        }
    }
    
    /**
     * Load rate limit state từ file
     */
    private synchronized void loadRateLimitState() {
        try {
            File stateFile = new File(RATE_LIMIT_STATE_FILE);
            if (stateFile.exists() && stateFile.length() > 0) {
                String json = new String(Files.readAllBytes(stateFile.toPath()), StandardCharsets.UTF_8);
                @SuppressWarnings("unchecked")
                Map<String, Object> data = objectMapper.readValue(json, Map.class);
                
                String dateStr = (String) data.getOrDefault("date", getTodayDateString());
                String today = getTodayDateString();
                
                if (dateStr.equals(today)) {
                    RateLimitState state = new RateLimitState();
                    state.date = dateStr;
                    state.used = ((Number) data.getOrDefault("used", 0)).intValue();
                    state.limit = ((Number) data.getOrDefault("limit", dailyLimit)).intValue();
                    state.lastUpdated = ((Number) data.getOrDefault("lastUpdated", System.currentTimeMillis())).longValue();
                    rateLimitCache.put(dateStr, state);
                    logger.info("✅ Restored X rate limit state - Used: {}/{}", state.used, state.limit);
                } else {
                    logger.info("🔄 Rate limit state file is old, starting fresh");
                    checkAndResetDailyLimit();
                }
            } else {
                checkAndResetDailyLimit();
            }
        } catch (Exception e) {
            logger.error("❌ Error loading X rate limit state: {}", e.getMessage());
            checkAndResetDailyLimit();
        }
    }
    
    /**
     * Save rate limit state to file
     */
    private synchronized void saveRateLimitState() {
        try {
            String today = getTodayDateString();
            RateLimitState state = rateLimitCache.get(today);
            if (state != null) {
                Map<String, Object> data = new HashMap<>();
                data.put("date", state.date);
                data.put("used", state.used);
                data.put("limit", state.limit);
                data.put("lastUpdated", state.lastUpdated);
                
                String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
                Files.writeString(new File(RATE_LIMIT_STATE_FILE).toPath(), json, StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            logger.error("❌ Error saving X rate limit state: {}", e.getMessage());
        }
    }
    
    private String getTodayDateString() {
        return LocalDate.now().format(DATE_FORMATTER);
    }

    /**
     * Đọc response từ connection
     */
    private String readResponse(HttpURLConnection conn) {
        try {
            if (conn.getResponseCode() >= 400) {
                try (var is = conn.getErrorStream()) {
                    if (is != null) {
                        return new String(is.readAllBytes(), StandardCharsets.UTF_8);
                    }
                }
            }
            try (var is = conn.getInputStream()) {
                return new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            return "Error reading response: " + e.getMessage();
        }
    }

    /**
     * Lấy thông tin cấu hình (dùng cho health check hoặc monitoring)
     */
    public Map<String, Object> getConfigInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("enabled", enabled);
        info.put("autoPost", autoPost);
        info.put("dailyLimit", dailyLimit);
        info.put("usedToday", getTodayUsage());
        info.put("remainingToday", dailyLimit - getTodayUsage());
        info.put("cooldownMinutes", cooldownMinutes);
        info.put("allowedDomains", ALLOWED_DOMAINS);
        info.put("policyCompliant", true);
        info.put("useCase", "CSM Bridge - Business Connector Platform");
        return info;
    }
    
    /**
     * Rate limit state class
     */
    private static class RateLimitState {
        String date;
        int used;
        int limit;
        long lastUpdated;
    }

    /**
     * Kết quả post tweet
     */
    public static class TwitterResult {
        public final boolean success;
        public final String message;
        public final String response;

        public TwitterResult(boolean success, String message, String response) {
            this.success = success;
            this.message = message;
            this.response = response;
        }

        @Override
        public String toString() {
            return String.format("TwitterResult{success=%s, message='%s'}", success, message);
        }
    }
}
