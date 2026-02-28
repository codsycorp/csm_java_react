package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import jakarta.annotation.PostConstruct;
import net.phanmemmottrieu.model.UrlSubmissionQueue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Dịch vụ quản lý Google Index API & Google Search Console API.
 * 
 * <p>Chức năng chính:
 * - Quản lý service account và OAuth2 credentials
 * - Theo dõi quota Google Index API hàng ngày (in-memory + file backup)
 * - Gửi URL lên Google Indexing API với retry logic
 * - Kiểm tra indexing status qua Google Search Console API
 * - Support đầy đủ error handling và logging
 */
@Service
public class GoogleIndexService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleIndexService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Autowired
    private GoogleIndexQueueService queueService;

    @Autowired
    private XTwitterService xTwitterService;

    // ========== CONFIG ==========
    @Value("${google.index.service-account-path}")
    private String serviceAccountPath;

    @Value("${google.index.daily-limit:200}")
    private int dailyLimit;

    // ========== SERVICE ACCOUNT ==========
    private Map<String, Object> serviceAccount;
    private GoogleCredentials scopedCredentials;
    private GoogleCredentials searchConsoleCredentials;

    // ========== QUOTA MANAGEMENT ==========
    private final Map<String, QuotaState> quotaCache = new ConcurrentHashMap<>();
    private static final String QUOTA_STATE_FILE = "./google-index-quota-state.json";
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    // ========== CONSTANTS ==========
    private static final String INDEXING_API_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
    private static final String SEARCH_CONSOLE_API_URL = "https://www.googleapis.com/webmasters/v3";
    private static final int MAX_RETRIES = 3;
    private static final int RETRY_DELAY_MS = 1000;

    // ========== INITIALIZATION ==========
    @PostConstruct
    public void init() {
        objectMapper.registerModule(new JavaTimeModule());
        loadServiceAccount();
        loadQuotaStateFromFile();
    }

    /**
     * Tải file service account JSON
     */
    private void loadServiceAccount() {
        try {
            Path saPath = Paths.get(serviceAccountPath);
            if (!Files.exists(saPath)) {
                logger.warn("Service account file not found at: {}", serviceAccountPath);
                logger.info("Expected path: {}", saPath.toAbsolutePath());
                return;
            }

            String saJson = new String(Files.readAllBytes(saPath), StandardCharsets.UTF_8);
            this.serviceAccount = objectMapper.readValue(saJson, Map.class);

            String projectId = (String) this.serviceAccount.get("project_id");
            String clientEmail = (String) this.serviceAccount.get("client_email");

            // Prepare scoped credentials for both APIs
            try (FileInputStream fis = new FileInputStream(saPath.toFile())) {
                GoogleCredentials creds = ServiceAccountCredentials.fromStream(fis);
                this.scopedCredentials = creds.createScoped(
                    Collections.singleton("https://www.googleapis.com/auth/indexing")
                );
            }

            try (FileInputStream fis = new FileInputStream(saPath.toFile())) {
                GoogleCredentials creds = ServiceAccountCredentials.fromStream(fis);
                this.searchConsoleCredentials = creds.createScoped(
                    Collections.singleton("https://www.googleapis.com/auth/webmasters")
                );
            }

            logger.info("✅ Loaded service account - Project: {}, Email: {}", projectId, clientEmail);

        } catch (IOException e) {
            logger.error("❌ Error loading service account: {}", e.getMessage(), e);
            throw new RuntimeException("Cannot load service account file", e);
        }
    }

    /**
     * Tải quota state từ file
     */
    private synchronized void loadQuotaStateFromFile() {
        try {
            File quotaFile = new File(QUOTA_STATE_FILE);
            if (quotaFile.exists() && quotaFile.length() > 0) {
                Map<String, Object> fileData = objectMapper.readValue(quotaFile, Map.class);
                String dateStr = (String) fileData.getOrDefault("date", getTodayDateString());
                String today = getTodayDateString();
                
                // Kiểm tra nếu file chứa ngày cũ -> reset quota
                if (!dateStr.equals(today)) {
                    logger.info("🔄 Quota file contains old date '{}', today is '{}' - resetting quota", dateStr, today);
                    initializeQuotaState();
                    return;
                }
                
                QuotaState state = new QuotaState();
                state.date = dateStr;
                state.used = ((Number) fileData.getOrDefault("used", 0)).intValue();
                state.limit = ((Number) fileData.getOrDefault("limit", dailyLimit)).intValue();
                state.lastUpdated = System.currentTimeMillis();
                
                quotaCache.put(dateStr, state);
                logger.info("✅ Restored quota state - Date: {}, Used: {}/{}", 
                    dateStr, state.used, state.limit);
            } else {
                initializeQuotaState();
            }
        } catch (IOException e) {
            logger.error("❌ Error loading quota state: {}", e.getMessage(), e);
            initializeQuotaState();
        }
    }

    /**
     * Khởi tạo quota state mới
     */
    private void initializeQuotaState() {
        String todayDate = getTodayDateString();
        QuotaState state = new QuotaState();
        state.date = todayDate;
        state.used = 0;
        state.limit = dailyLimit;
        state.lastUpdated = System.currentTimeMillis();
        
        quotaCache.put(todayDate, state);
        saveQuotaStateToFile();
        logger.info("✅ Initialized new quota state");
    }

    /**
     * Kiểm tra và reset quota nếu ngày mới
     */
    private void checkAndResetDailyQuota() {
        String today = getTodayDateString();
        QuotaState state = quotaCache.get(today);
        
        if (state == null) {
            logger.info("🔄 New day detected - resetting quota");
            
            // Xoá old entries (giữ tối đa 7 ngày)
            quotaCache.forEach((date, quotaState) -> {
                try {
                    LocalDate entryDate = LocalDate.parse(date, DATE_FORMATTER);
                    LocalDate cutoffDate = LocalDate.now().minusDays(7);
                    if (entryDate.isBefore(cutoffDate)) {
                        quotaCache.remove(date);
                    }
                } catch (Exception ignored) {}
            });
            
            initializeQuotaState();
        }
    }

    /**
     * Lấy quota state cho ngày hiện tại
     */
    private QuotaState getTodayQuotaState() {
        checkAndResetDailyQuota();
        String today = getTodayDateString();
        return quotaCache.computeIfAbsent(today, k -> {
            QuotaState state = new QuotaState();
            state.date = today;
            state.used = 0;
            state.limit = dailyLimit;
            state.lastUpdated = System.currentTimeMillis();
            return state;
        });
    }

    /**
     * Lấy số request còn lại hôm nay
     */
    public int getRemainingDailyQuota() {
        QuotaState state = getTodayQuotaState();
        return Math.max(0, state.limit - state.used);
    }

    /**
     * Kiểm tra quota có đủ không
     */
    public boolean checkQuotaAvailable(int requestedCount) {
        return getRemainingDailyQuota() >= requestedCount;
    }

    /**
     * Reserve quota atomically to avoid exceeding the daily limit under concurrency.
     */
    public synchronized boolean reserveQuota(int count) {
        QuotaState state = getTodayQuotaState();
        if (state.used + count > state.limit) {
            return false;
        }
        state.used += count;
        state.lastUpdated = System.currentTimeMillis();
        saveQuotaStateToFile();
        logger.info("📊 Quota reserved - Used: {}/{}, Remaining: {}",
            state.used, state.limit, getRemainingDailyQuota());
        return true;
    }

    /**
     * Cập nhật quota đã sử dụng
     */
    public synchronized void updateUsedQuota(int count) {
        QuotaState state = getTodayQuotaState();
        state.used = Math.min(state.used + count, state.limit);
        state.lastUpdated = System.currentTimeMillis();
        saveQuotaStateToFile();
        logger.info("📊 Quota updated - Used: {}/{}, Remaining: {}", 
            state.used, state.limit, getRemainingDailyQuota());
    }

    /**
     * Tự động phát hiện và cập nhật daily limit từ Google error response
     * Khi gặp lỗi 429 RATE_LIMIT_EXCEEDED, Google trả về quota_limit_value trong metadata
     * Đồng thời set used = limit để đánh dấu đã hết quota
     */
    private synchronized void detectAndUpdateQuotaLimit(String errorResponse) {
        try {
            if (errorResponse == null || errorResponse.isEmpty()) return;
            
            // Parse error response JSON
            Map<String, Object> errorData = objectMapper.readValue(errorResponse, Map.class);
            Map<String, Object> error = (Map<String, Object>) errorData.get("error");
            if (error == null) return;
            
            // Kiểm tra error code 429 và RATE_LIMIT_EXCEEDED
            Integer errorCode = (Integer) error.get("code");
            String status = (String) error.get("status");
            
            if (errorCode != null && errorCode == 429 && "RESOURCE_EXHAUSTED".equals(status)) {
                List<Map<String, Object>> details = (List<Map<String, Object>>) error.get("details");
                if (details == null) return;
                
                // Tìm ErrorInfo với metadata chứa quota_limit_value
                for (Map<String, Object> detail : details) {
                    String type = (String) detail.get("@type");
                    if ("type.googleapis.com/google.rpc.ErrorInfo".equals(type)) {
                        Map<String, Object> metadata = (Map<String, Object>) detail.get("metadata");
                        if (metadata != null && metadata.containsKey("quota_limit_value")) {
                            String quotaLimitStr = (String) metadata.get("quota_limit_value");
                            int detectedLimit = Integer.parseInt(quotaLimitStr);
                            
                            QuotaState state = getTodayQuotaState();
                            boolean limitChanged = (detectedLimit != state.limit);
                            
                            if (limitChanged) {
                                logger.warn("⚠️ Detected quota limit from Google: {} (current: {})", detectedLimit, state.limit);
                                state.limit = detectedLimit;
                            }
                            
                            // Khi gặp 429, nghĩa là đã hết quota -> set used = limit để đồng bộ
                            if (state.used < state.limit) {
                                logger.warn("⚠️ Quota exceeded by Google but local count shows {}/{} - syncing to limit", state.used, state.limit);
                                state.used = state.limit;
                            }
                            
                            state.lastUpdated = System.currentTimeMillis();
                            saveQuotaStateToFile();
                            
                            if (limitChanged) {
                                logger.info("✅ Updated daily quota limit to: {}", detectedLimit);
                            }
                            logger.info("✅ Synced quota state: used={}, limit={}, remaining={}", state.used, state.limit, getRemainingDailyQuota());
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.debug("Could not parse quota limit from error response: {}", e.getMessage());
        }
    }

    /**
     * Lưu quota state vào file (backup)
     */
    private synchronized void saveQuotaStateToFile() {
        try {
            String today = getTodayDateString();
            QuotaState state = quotaCache.get(today);
            if (state == null) return;
            
            File quotaFile = new File(QUOTA_STATE_FILE);
            File parentDir = quotaFile.getParentFile();

            if (parentDir != null && !parentDir.exists()) {
                if (parentDir.mkdirs()) {
                    logger.info("✅ Created quota state directory: {}", parentDir.getAbsolutePath());
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("date", state.date);
            data.put("used", state.used);
            data.put("limit", state.limit);
            data.put("updated_at", new Date().toString());
            
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(quotaFile, data);
        } catch (IOException e) {
            logger.error("❌ Error saving quota state: {}", e.getMessage(), e);
        }
    }

    /**
     * Lấy thông tin service account
     */
    public Map<String, Object> getServiceAccount() {
        if (serviceAccount == null) {
            throw new RuntimeException("Service account not loaded");
        }
        return serviceAccount;
    }

    /**
     * Lấy project ID
     */
    public String getProjectId() {
        return (String) getServiceAccount().get("project_id");
    }

    /**
     * Lấy client email
     */
    public String getClientEmail() {
        return (String) getServiceAccount().get("client_email");
    }

    /**
     * Lấy private key
     */
    public String getPrivateKey() {
        return (String) getServiceAccount().get("private_key");
    }

    /**
     * Lấy ngày hiện tại (UTC)
     */
    private String getTodayDateString() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
        sdf.setTimeZone(TimeZone.getTimeZone("Asia/Ho_Chi_Minh"));
        return sdf.format(new Date());
    }

    /**
     * Lấy thông tin quota hiện tại
     */
    public Map<String, Object> getQuotaInfo() {
        QuotaState state = getTodayQuotaState();
        Map<String, Object> info = new HashMap<>();
        info.put("daily_limit", state.limit);
        info.put("used_today", state.used);
        info.put("remaining", getRemainingDailyQuota());
        info.put("last_reset_date", state.date);
        info.put("usage_percentage", Math.round((state.used * 100.0) / state.limit));
        return info;
    }

    // ========== GOOGLE INDEXING API ==========
    
    /**
     * Thêm URL vào queue để gửi sau (RECOMMENDED cho bulk URLs)
     * Tự động kiểm tra trùng lặp và quản lý priority
     * 
     * @param url URL cần gửi
     * @param action "publish" hoặc "remove"
     * @param priority 1 (cao nhất) - 10 (thấp nhất), default = 5
     * @return true nếu thêm thành công
     */
    public boolean addToQueue(String url, String action, int priority) {
        return queueService.addToQueue(url, action, priority);
    }
    
    /**
     * Thêm nhiều URL vào queue cùng lúc
     */
    public Map<String, Boolean> addBatchToQueue(List<String> urls, String action, int priority) {
        return queueService.addBatchToQueue(urls, action, priority);
    }
    
    /**
     * Xử lý batch URLs từ queue (được gọi bởi scheduled job)
     * Gửi tối đa batchSize URLs, ưu tiên theo priority và tuổi
     * 
     * @param batchSize Số lượng URLs tối đa để gửi
     * @return Kết quả xử lý
     */
    public Map<String, Object> processBatchFromQueue(int batchSize) {
        logger.info("🔄 Processing batch from queue - Max size: {}, Remaining quota: {}", 
            batchSize, getRemainingDailyQuota());
        
        // Kiểm tra quota còn lại
        int availableQuota = getRemainingDailyQuota();
        if (availableQuota <= 0) {
            logger.warn("⚠️ No quota remaining today");
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("message", "No quota remaining");
            result.put("processed", 0);
            return result;
        }
        
        // Giới hạn batch size theo quota
        int effectiveBatchSize = Math.min(batchSize, availableQuota);
        
        // Lấy URLs từ queue
        List<UrlSubmissionQueue> batch = queueService.getNextBatch(effectiveBatchSize);
        if (batch.isEmpty()) {
            logger.info("ℹ️ Queue is empty");
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "Queue is empty");
            result.put("processed", 0);
            return result;
        }
        
        logger.info("📦 Processing {} URLs from queue", batch.size());
        
        int successCount = 0;
        int failCount = 0;
        List<Map<String, Object>> results = new ArrayList<>();
        
        for (UrlSubmissionQueue item : batch) {
            String url = item.getUrl();
            String action = item.getAction();
            
            // Đánh dấu đang xử lý
            queueService.markAsProcessing(url);
            
            // Gửi URL
            IndexingResult indexResult = submitUrlToGoogleDirect(url, action);
            
            // Cập nhật kết quả
            queueService.markAsCompleted(url, indexResult.success, indexResult.message);
            
            if (indexResult.success) {
                successCount++;
            } else {
                failCount++;
            }
            
            // Lưu kết quả để trả về
            Map<String, Object> itemResult = new HashMap<>();
            itemResult.put("url", url);
            itemResult.put("success", indexResult.success);
            itemResult.put("message", indexResult.message);
            results.add(itemResult);
            
            // Delay nhỏ giữa các request để tránh rate limit
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        Map<String, Object> summary = new HashMap<>();
        summary.put("success", true);
        summary.put("processed", batch.size());
        summary.put("success_count", successCount);
        summary.put("fail_count", failCount);
        summary.put("remaining_quota", getRemainingDailyQuota());
        summary.put("queue_info", queueService.getQueueInfo());
        summary.put("results", results);
        
        logger.info("✅ Batch processing completed - Success: {}, Failed: {}, Remaining quota: {}",
            successCount, failCount, getRemainingDailyQuota());
        
        return summary;
    }

    /**
     * Gửi URL lên Google Indexing API trực tiếp (legacy method)
     * KHUYẾN NGHỊ: Sử dụng addToQueue() thay vì method này cho bulk submissions
     */
    public IndexingResult submitUrlToGoogle(String url, String action) {
        return submitUrlToGoogleDirect(url, action);
    }

    /**
     * Gửi URL trực tiếp mà không qua queue (internal use)
     */
    private IndexingResult submitUrlToGoogleDirect(String url, String action) {
        if (!reserveQuota(1)) {
            return new IndexingResult(false, "Quota exceeded", null);
        }

        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                String accessToken = getAccessToken();
                IndexingResult result = sendIndexingRequest(url, action, accessToken);
                
                if (result.success) {
                    logger.info("✅ URL indexed successfully - URL: {}, Action: {}", url, action);
                    
                    // Tự động post lên X (Twitter) nếu được bật
                    try {
                        xTwitterService.autoPostIfEnabled(url, action);
                    } catch (Exception e) {
                        logger.warn("⚠️ Failed to post to X (non-critical): {}", e.getMessage());
                    }
                    
                    return result;
                } else if (attempt < MAX_RETRIES - 1) {
                    long delayMs = RETRY_DELAY_MS * (long) Math.pow(2, attempt);
                    logger.warn("⚠️ Retry attempt {} for URL: {} (delay: {}ms)", attempt + 1, url, delayMs);
                    Thread.sleep(delayMs);
                } else {
                    return result;
                }
            } catch (Exception e) {
                logger.error("❌ Error submitting URL (attempt {}): {}", attempt + 1, e.getMessage());
                if (attempt == MAX_RETRIES - 1) {
                    return new IndexingResult(false, e.getMessage(), null);
                }
            }
        }
        
        return new IndexingResult(false, "Failed after retries", null);
    }
    
    /**
     * Gửi request đến Indexing API
     */
    private IndexingResult sendIndexingRequest(String url, String action, String accessToken) throws Exception {
        URL apiUrl = new URL(INDEXING_API_URL);
        HttpURLConnection conn = (HttpURLConnection) apiUrl.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        conn.setDoOutput(true);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);

        Map<String, Object> body = new HashMap<>();
        body.put("url", url);
        body.put("type", "remove".equalsIgnoreCase(action) ? "URL_REMOVED" : "URL_UPDATED");

        String jsonBody = objectMapper.writeValueAsString(body);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            os.flush();
        }

        int responseCode = conn.getResponseCode();
        String responseBody = readResponse(conn);

        if (responseCode >= 200 && responseCode < 300) {
            return new IndexingResult(true, "Submitted successfully", responseBody);
        } else {
            // Tự động phát hiện quota limit từ error 429
            if (responseCode == 429) {
                detectAndUpdateQuotaLimit(responseBody);
            }
            return new IndexingResult(false, "HTTP " + responseCode + ": " + responseBody, responseBody);
        }
    }

    // ========== GOOGLE SEARCH CONSOLE API ==========

    /**
     * Kiểm tra indexing status qua Google Search Console URL Inspection API (chuẩn v1)
     * Yêu cầu: service account phải được thêm làm Owner của property tương ứng.
     */
    public SearchConsoleResult checkIndexingStatus(String url) {
        try {
            // Lấy token với scope webmasters
            String accessToken = getSearchConsoleAccessToken();

            // URL Inspection API v1 endpoint (không ghép URL vào path)
            URL apiUrl = new URL("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect");

            HttpURLConnection conn = (HttpURLConnection) apiUrl.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            // siteUrl phải là property đã verify (ví dụ: https://www.phanmemmottrieu.net/)
            String siteUrl = deriveSiteUrl(url);
            Map<String, Object> body = new HashMap<>();
            body.put("inspectionUrl", url);
            body.put("siteUrl", siteUrl);
            
            logger.info("📋 URL Inspection request - inspectionUrl: {}, siteUrl: {}", url, siteUrl);

            String jsonBody = objectMapper.writeValueAsString(body);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            String responseBody = readResponse(conn);

            if (responseCode >= 200 && responseCode < 300) {
                @SuppressWarnings("unchecked")
                Map<String, Object> response = objectMapper.readValue(responseBody, Map.class);
                @SuppressWarnings("unchecked")
                Map<String, Object> inspectionResult = (Map<String, Object>) response.get("inspectionResult");

                if (inspectionResult != null) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> indexStatus = (Map<String, Object>) inspectionResult.get("indexStatusResult");

                    String verdict = indexStatus != null
                            ? (String) indexStatus.getOrDefault("verdict", "UNKNOWN")
                            : "UNKNOWN";
                    boolean isIndexed = indexStatus != null && "PASS".equalsIgnoreCase(verdict);

                    logger.info("✅ Indexing status checked - URL: {}, Indexed: {}, Verdict: {}", url, isIndexed, verdict);
                    return new SearchConsoleResult(isIndexed, verdict, inspectionResult);
                }
            } else {
                logger.warn("⚠️ URL Inspection API trả về HTTP {}: {}", responseCode, responseBody);
            }

            return new SearchConsoleResult(false, "ERROR", null);
        } catch (Exception e) {
            logger.error("❌ Error checking indexing status: {}", e.getMessage(), e);
            return new SearchConsoleResult(false, "EXCEPTION", null);
        }
    }

    /**
     * Kiểm tra indexing status và tự động publish nếu verdict là NEUTRAL
     * Giúp thúc giục Googlebot index nhanh hơn khi URL chưa được index
     */
    public Map<String, Object> checkIndexingStatusAndAutoPublish(String url) {
        logger.info("🔍 Kiểm tra indexing status và có thể auto-publish: {}", url);
        
        // Bước 1: Kiểm tra status hiện tại
        SearchConsoleResult checkResult = checkIndexingStatus(url);
        String verdict = checkResult.verdict;
        
        Map<String, Object> response = new HashMap<>();
        response.put("url", url);
        response.put("checkStatus", checkResult);
        response.put("publishResult", null);
        response.put("autoPublished", false);
        
        // Bước 2: Nếu verdict là NEUTRAL, tự động gọi publish
        if ("NEUTRAL".equalsIgnoreCase(verdict)) {
            logger.info("📤 Verdict là NEUTRAL - tự động gọi publish để thúc giục Googlebot");
            
            try {
                IndexingResult publishResult = submitUrlToGoogle(url, "publish");
                response.put("publishResult", publishResult);
                response.put("autoPublished", true);
                
                if (publishResult.success) {
                    logger.info("✅ Auto-publish thành công: {}", url);
                    response.put("message", "URL chưa indexed, đã tự động gửi publish request");
                } else {
                    logger.warn("⚠️ Auto-publish thất bại: {}", publishResult.message);
                    response.put("message", "Kiểm tra thành công nhưng publish thất bại: " + publishResult.message);
                }
            } catch (Exception e) {
                logger.error("❌ Lỗi auto-publish: {}", e.getMessage());
                response.put("message", "Lỗi khi auto-publish: " + e.getMessage());
            }
        } else {
            logger.info("ℹ️ Verdict: {} - không cần auto-publish", verdict);
            if ("PASS".equalsIgnoreCase(verdict)) {
                response.put("message", "✅ URL đã được indexed");
            } else {
                response.put("message", "⚠️ Verdict: " + verdict);
            }
        }
        
        return response;
    }

    /**
     * Derive siteUrl từ inspectionUrl (lấy scheme + host + "/").
     */
    private String deriveSiteUrl(String inspectionUrl) {
        try {
            URL parsed = new URL(inspectionUrl);
            String host = parsed.getHost();
            String scheme = parsed.getProtocol();
            return scheme + "://" + host + "/";
        } catch (Exception e) {
            // Fallback an toàn
            return "https://www.phanmemmottrieu.net/";
        }
    }

    /**
     * Lấy danh sách site từ Google Search Console
     */
    public List<Map<String, Object>> getSiteList() {
        try {
            String accessToken = getAccessToken();
            URL apiUrl = new URL(SEARCH_CONSOLE_API_URL + "/sites");
            
            HttpURLConnection conn = (HttpURLConnection) apiUrl.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            String responseBody = readResponse(conn);

            if (responseCode >= 200 && responseCode < 300) {
                @SuppressWarnings("unchecked")
                Map<String, Object> response = objectMapper.readValue(responseBody, Map.class);
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> siteList = (List<Map<String, Object>>) response.get("siteEntry");
                logger.info("✅ Retrieved {} sites from Google Search Console", siteList != null ? siteList.size() : 0);
                return siteList;
            }
            
            return Collections.emptyList();
        } catch (Exception e) {
            logger.error("❌ Error getting site list: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ========== UTILITIES ==========

    /**
     * Đọc response từ HTTP connection
     */
    private String readResponse(HttpURLConnection conn) throws IOException {
        InputStream stream = conn.getResponseCode() >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (stream == null) return "";
        
        StringBuilder sb = new StringBuilder();
        try (java.util.Scanner scanner = new java.util.Scanner(stream, StandardCharsets.UTF_8)) {
            while (scanner.hasNextLine()) {
                sb.append(scanner.nextLine());
            }
        }
        return sb.toString();
    }

    /**
     * Encode URL cho API
     */
    private String encodeUrl(String url) {
        try {
            return java.net.URLEncoder.encode(url, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return url;
        }
    }

    /**
     * Lấy OAuth2 Access Token
     */
    public synchronized String getAccessToken() {
        return getAccessTokenFromCredentials(this.scopedCredentials);
    }

    /**
     * Lấy Access Token cho Search Console
     */
    public synchronized String getSearchConsoleAccessToken() {
        return getAccessTokenFromCredentials(this.searchConsoleCredentials);
    }

    /**
     * Internal method để lấy Access Token
     */
    private synchronized String getAccessTokenFromCredentials(GoogleCredentials creds) {
        try {
            if (creds == null) {
                loadServiceAccount();
                creds = this.scopedCredentials;
            }
            if (creds == null) {
                throw new RuntimeException("Google scoped credentials is null");
            }

            creds.refreshIfExpired();
            AccessToken token = creds.getAccessToken();
            if (token == null || token.getTokenValue() == null) {
                token = creds.refreshAccessToken();
            }
            if (token == null || token.getTokenValue() == null) {
                throw new RuntimeException("Cannot obtain Google OAuth2 access token");
            }
            logger.info("🔑 Obtained Google OAuth2 access token (expires at: {})", token.getExpirationTime());
            return token.getTokenValue();
        } catch (Exception e) {
            logger.error("❌ Error obtaining access token: {}", e.getMessage(), e);
            throw new RuntimeException("Cannot obtain access token", e);
        }
    }

    /**
     * Tạo JWT token (optional, dùng cho direct API calls)
     */
    public String generateJwtToken() {
        try {
            String privateKeyStr = getPrivateKey();
            if (privateKeyStr == null || privateKeyStr.isEmpty()) {
                throw new RuntimeException("Private key not found in service account");
            }

            PrivateKey privateKey = parsePrivateKey(privateKeyStr);
            
            long nowMillis = System.currentTimeMillis();
            long expMillis = nowMillis + (3600 * 1000);

            Map<String, Object> claims = new HashMap<>();
            claims.put("iss", getClientEmail());
            claims.put("sub", getClientEmail());
            claims.put("scope", "https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters");
            claims.put("aud", "https://oauth2.googleapis.com/token");

            String token = Jwts.builder()
                    .claims(claims)
                    .issuedAt(new Date(nowMillis))
                    .expiration(new Date(expMillis))
                    .signWith(privateKey, SignatureAlgorithm.RS256)
                    .compact();

            logger.info("✅ Generated JWT token");
            return token;

        } catch (Exception e) {
            logger.error("❌ Error generating JWT token: {}", e.getMessage(), e);
            throw new RuntimeException("Cannot generate JWT token", e);
        }
    }

    /**
     * Parse private key từ PEM format
     */
    private PrivateKey parsePrivateKey(String privateKeyStr) throws Exception {
        String cleanKey = privateKeyStr
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN RSA PRIVATE KEY-----", "")
                .replace("-----END RSA PRIVATE KEY-----", "")
                .replaceAll("\\s", "");

        byte[] decodedKey = Base64.getDecoder().decode(cleanKey);
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(decodedKey);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePrivate(spec);
    }

    // ========== INNER CLASSES ==========

    /**
     * Trạng thái quota hàng ngày
     */
    public static class QuotaState {
        public String date;
        public int used;
        public int limit;
        public long lastUpdated;
    }

    /**
     * Kết quả gửi indexing request
     */
    public static class IndexingResult {
        public final boolean success;
        public final String message;
        public final String responseBody;

        public IndexingResult(boolean success, String message, String responseBody) {
            this.success = success;
            this.message = message;
            this.responseBody = responseBody;
        }
    }

    /**
     * Kết quả kiểm tra indexing status từ Search Console
     */
    public static class SearchConsoleResult {
        public final boolean isIndexed;
        public final String verdict;
        public final Map<String, Object> details;

        public SearchConsoleResult(boolean isIndexed, String verdict, Map<String, Object> details) {
            this.isIndexed = isIndexed;
            this.verdict = verdict;
            this.details = details;
        }
    }
}
