package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Dịch vụ tự động kiểm tra và index URLs lên Google một cách thông minh
 * 
 * <p>Chức năng:
 * - Tự động index URLs mới từ sitemap (chạy async, non-blocking)
 * - Kiểm tra từng URL trước khi index (verify sự tồn tại)
 * - Tránh dư thừa (track URLs đã index)
 * - Quản lý quota Google (respect daily limit)
 * - Batch processing (gom URLs, delay giữa batch để tránh rate limiting)
 * - Persistent state (lưu URLs đã index)
 */
@Service
public class AutoIndexService {

    private static final Logger logger = LoggerFactory.getLogger(AutoIndexService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    private GoogleIndexService googleIndexService;

    @Value("${app.data.dir}")
    private String appDataDir;

    @Value("${auto-index.enabled:true}")
    private boolean autoIndexEnabled;

    @Value("${auto-index.batch-size:5}")
    private int batchSize;

    @Value("${auto-index.batch-delay-ms:2000}")
    private int batchDelayMs;

    @Value("${auto-index.check-before-index:true}")
    private boolean checkBeforeIndex;

    @Value("${auto-index.max-pending-per-domain:1000}")
    private int maxPendingPerDomain;

    // Static resource extensions to skip from auto-index
    private static final Set<String> STATIC_EXTENSIONS = Set.of(
        "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico",
        "css", "js", "json", "xml", "txt", "map", "webmanifest"
    );

    // ========== STATE ==========
    // Track URLs đã index trong ngày (domain -> Set<URL>)
    private final Map<String, Set<String>> indexedToday = new ConcurrentHashMap<>();
    
    // Track URLs pending (đã add vào queue nhưng chưa xử lý)
    private final Map<String, Queue<String>> pendingUrls = new ConcurrentHashMap<>();
    
    // Auto-index state file (persistent)
    private static final String AUTO_INDEX_STATE_FILE = "./auto-index-state.json";
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private final AtomicReference<String> currentDate = new AtomicReference<>(getTodayDateString());

    public AutoIndexService() {
        logger.info("✅ AutoIndexService initialized");
        loadStateFromFile();
    }

    /**
     * Load state từ file (recover từ restart)
     * Xử lý cả format cũ (ArrayList) và mới (Set)
     */
    private synchronized void loadStateFromFile() {
        try {
            File stateFile = new File(AUTO_INDEX_STATE_FILE);
            if (stateFile.exists() && stateFile.length() > 0) {
                @SuppressWarnings("unchecked")
                Map<String, Object> savedState = objectMapper.readValue(stateFile, Map.class);
                
                String savedDate = (String) savedState.getOrDefault("date", getTodayDateString());
                String today = getTodayDateString();
                if (!today.equals(savedDate)) {
                    logger.info("🔄 Auto-index state is from {} → reset for today {}", savedDate, today);
                    indexedToday.clear();
                    pendingUrls.clear();
                    currentDate.set(today);
                    return;
                }

                if (savedState.get("indexedUrls") != null) {
                    Object indexedData = savedState.get("indexedUrls");
                    
                    // Handle both old format (ArrayList) and new format (Set)
                    if (indexedData instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> indexedMap = (Map<String, Object>) indexedData;
                        
                        indexedMap.forEach((domain, urlsObj) -> {
                            Set<String> urlSet = ConcurrentHashMap.newKeySet();
                            
                            // Convert ArrayList or any Collection to Set
                            if (urlsObj instanceof Collection) {
                                @SuppressWarnings("unchecked")
                                Collection<String> urlsCollection = (Collection<String>) urlsObj;
                                urlSet.addAll(urlsCollection);
                            }
                            
                            indexedToday.put(domain, urlSet);
                        });
                        
                        int totalLoaded = indexedToday.values().stream()
                            .mapToInt(Set::size).sum();
                        currentDate.set(today);
                        logger.info("✅ Restored auto-index state: {} URLs indexed today", totalLoaded);
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("⚠️ Failed to load auto-index state: {}. Starting fresh.", e.getMessage());
            // Reset state on any error
            indexedToday.clear();
        }
    }

    /**
     * Lưu state xuống file (backup)
     */
    private synchronized void saveStateToFile() {
        try {
            File stateFile = new File(AUTO_INDEX_STATE_FILE);
            Map<String, Object> state = new HashMap<>();
            state.put("lastUpdated", LocalDateTime.now().toString());
            state.put("date", currentDate.get());
            state.put("totalIndexedToday", indexedToday.values().stream().mapToInt(Set::size).sum());
            state.put("indexedUrls", indexedToday);

            File parentDir = stateFile.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(stateFile, state);
            logger.debug("💾 Saved auto-index state to {}", AUTO_INDEX_STATE_FILE);
        } catch (IOException e) {
            logger.error("❌ Failed to save auto-index state: {}", e.getMessage());
        }
    }

    /**
     * Thêm URL vào queue auto-index (async, non-blocking)
     * 
     * @param domainHost Host header (e.g., "www.phanmemmottrieu.net")
     * @param url Full URL cần index
     * @param hasSeoMeta true nếu page có đầy đủ SEO tags
     */
    @Async("indexExecutor")
    public void scheduleAutoIndex(String domainHost, String url, boolean hasSeoMeta) {
        ensureTodayState();

        if (!autoIndexEnabled || !hasSeoMeta || googleIndexService == null) {
            return;
        }

        // Skip static resources (images, css/js, assets) to avoid wasting quota
        if (isStaticUrl(url)) {
            logger.debug("⏭️ Auto-index: Skip static URL={}", url);
            return;
        }

        // Guard: do not enqueue if daily quota already exhausted
        if (!googleIndexService.checkQuotaAvailable(1)) {
            logger.warn("⚠️ Auto-index: Daily quota exhausted, skip URL={} for domain={}", url, domainHost);
            return;
        }

        String domainKey = normalizeDomain(domainHost);
        
        // Kiểm tra đã index chưa
        Set<String> indexed = indexedToday.computeIfAbsent(domainKey, k -> ConcurrentHashMap.newKeySet());
        if (indexed.contains(url)) {
            logger.debug("⏭️ Auto-index: URL đã indexed trước đó: {}", url);
            return;
        }

        // Thêm vào pending queue (giới hạn kích thước để tránh quá tải)
        Queue<String> pending = pendingUrls.computeIfAbsent(domainKey, k -> new ConcurrentLinkedQueue<>());
        if (pending.size() >= maxPendingPerDomain) {
            logger.warn("⚠️ Auto-index: Pending queue full for domain={}, dropping URL={}", domainKey, url);
            return;
        }
        pending.offer(url);

        logger.info("📋 Auto-index: Scheduled URL={}, pending_count={}", url, pending.size());

        // Trigger batch processor nếu queue đã đủ
        if (pending.size() >= batchSize) {
            logger.info("🚀 Auto-index: Triggering batch for domain={} (queue_size={})", 
                domainKey, pending.size());
            processBatch(domainKey);
        }
    }

    /**
     * Xử lý một batch URLs
     */
    @Async("indexExecutor")
    private void processBatch(String domainKey) {
        try {
            ensureTodayState();
            Queue<String> pending = pendingUrls.get(domainKey);
            if (pending == null || pending.isEmpty()) {
                return;
            }

            while (true) {
                // Lấy batch URLs
                List<String> batch = new ArrayList<>(batchSize);
                String url;
                while (batch.size() < batchSize && (url = pending.poll()) != null) {
                    batch.add(url);
                }

                if (batch.isEmpty()) {
                    break; // Không còn URL để xử lý
                }

                logger.info("📦 Auto-index: Processing batch of {} URLs for domain={}", batch.size(), domainKey);

                // Hard stop when daily Indexing API quota is exhausted to avoid spam.
                if (googleIndexService != null && googleIndexService.getRemainingDailyQuota() <= 0) {
                    logger.warn("⚠️ Auto-index: Daily quota exhausted, requeueing {} URLs and stopping batch for domain={}",
                        batch.size(), domainKey);
                    Queue<String> pendingQueue = pendingUrls.computeIfAbsent(domainKey, k -> new ConcurrentLinkedQueue<>());
                    for (String batchItem : batch) {
                        pendingQueue.offer(batchItem);
                    }
                    break;
                }

                // Xử lý từng URL trong batch
                int successCount = 0;
                int failureCount = 0;
                int quotaExceededCount = 0;
                Set<String> indexed = indexedToday.computeIfAbsent(domainKey, k -> ConcurrentHashMap.newKeySet());

                for (String batchUrl : batch) {
                    try {
                        if (googleIndexService != null && googleIndexService.getRemainingDailyQuota() <= 0) {
                            logger.warn("⚠️ Auto-index: Daily quota exhausted, requeueing URL: {}", batchUrl);
                            pendingUrls.computeIfAbsent(domainKey, k ->
                                new ConcurrentLinkedQueue<>()).offer(batchUrl);
                            quotaExceededCount++;
                            continue;
                        }

                        boolean shouldIndex = true;

                        // Bước 1: Check indexing status nếu enabled
                        if (checkBeforeIndex) {
                            GoogleIndexService.SearchConsoleResult checkResult = 
                                googleIndexService.checkIndexingStatus(batchUrl);

                            if (checkResult.isIndexed) {
                                logger.info("✅ Auto-index: URL already indexed: {}", batchUrl);
                                indexed.add(batchUrl);
                                successCount++;
                                shouldIndex = false;
                            } else if ("NEUTRAL".equalsIgnoreCase(checkResult.verdict)) {
                                logger.info("📤 Auto-index: Verdict NEUTRAL for URL={}, publishing...", batchUrl);
                                shouldIndex = true;
                            } else if ("FAIL".equalsIgnoreCase(checkResult.verdict)) {
                                logger.debug("⏭️ Auto-index: Skipping URL with verdict=FAIL: {}", batchUrl);
                                failureCount++;
                                shouldIndex = false;
                            }
                        }

                        // Bước 2: Check quota và submit URL nếu cần
                        if (shouldIndex) {
                            // Check quota per-URL để tránh exceed và lãng phí
                            if (!googleIndexService.checkQuotaAvailable(1)) {
                                logger.warn("⚠️ Auto-index: Quota exceeded, requeueing URL: {}", batchUrl);
                                // Re-queue URL này để xử lý sau
                                pendingUrls.computeIfAbsent(domainKey, k -> 
                                    new ConcurrentLinkedQueue<>()).offer(batchUrl);
                                quotaExceededCount++;
                                continue; // Skip URL này, nhưng vẫn xử lý tiếp batch
                            }

                            GoogleIndexService.IndexingResult result = 
                                googleIndexService.submitUrlToGoogle(batchUrl, "publish");

                            if (result.success) {
                                logger.info("✅ Auto-index: Successfully indexed URL={}", batchUrl);
                                indexed.add(batchUrl);
                                successCount++;
                            } else {
                                logger.warn("❌ Auto-index: Failed to index URL={}: {}", batchUrl, result.message);
                                failureCount++;
                            }
                        }

                        // Delay giữa requests (rate limiting)
                        if (batch.indexOf(batchUrl) < batch.size() - 1) {
                            Thread.sleep(500); // 500ms delay
                        }

                    } catch (Exception e) {
                        logger.error("❌ Auto-index: Error processing URL={}: {}", batchUrl, e.getMessage());
                        failureCount++;
                    }
                }

                logger.info("📊 Auto-index: Batch completed - domain={}, success={}, failed={}, quota_exceeded={}", 
                    domainKey, successCount, failureCount, quotaExceededCount);

                // Lưu state
                saveStateToFile();

                // Delay giữa batches (avoid spam)
                if (pending.isEmpty()) {
                    break;
                }
                try {
                    Thread.sleep(batchDelayMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }

        } catch (Exception e) {
            logger.error("❌ Auto-index: Batch processing error for domain={}: {}", domainKey, e.getMessage());
        }
    }

    /**
     * Lấy thông tin auto-index status hiện tại
     */
    public Map<String, Object> getAutoIndexStatus() {
        Map<String, Object> status = new HashMap<>();
        
        status.put("enabled", autoIndexEnabled);
        status.put("batch_size", batchSize);
        status.put("batch_delay_ms", batchDelayMs);
        status.put("check_before_index", checkBeforeIndex);
        
        int totalIndexed = indexedToday.values().stream().mapToInt(Set::size).sum();
        status.put("total_indexed_today", totalIndexed);
        
        int totalPending = pendingUrls.values().stream().mapToInt(Queue::size).sum();
        status.put("total_pending", totalPending);

        Map<String, Object> byDomain = new HashMap<>();
        indexedToday.forEach((domain, urls) -> {
            Map<String, Object> info = new HashMap<>();
            info.put("indexed", urls.size());
            info.put("pending", pendingUrls.getOrDefault(domain, new ConcurrentLinkedQueue<>()).size());
            byDomain.put(domain, info);
        });
        status.put("by_domain", byDomain);

        if (googleIndexService != null) {
            try {
                status.put("quota", googleIndexService.getQuotaInfo());
            } catch (Exception e) {
                logger.debug("Could not get quota info: {}", e.getMessage());
            }
        }

        return status;
    }

    /**
     * Reset auto-index state
     */
    public synchronized void resetState() {
        indexedToday.clear();
        pendingUrls.clear();
        File stateFile = new File(AUTO_INDEX_STATE_FILE);
        if (stateFile.exists() && stateFile.delete()) {
            logger.info("✅ Auto-index state reset");
        }
    }

    /**
     * Normalize domain key
     */
    private String normalizeDomain(String hostHeader) {
        if (hostHeader == null) {
            return "default";
        }
        return hostHeader.split(":")[0].toLowerCase();
    }

    private String getTodayDateString() {
        return LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).format(DATE_FORMATTER);
    }

    private void ensureTodayState() {
        String today = getTodayDateString();
        String saved = currentDate.get();
        if (today.equals(saved)) {
            return;
        }
        synchronized (this) {
            if (!today.equals(currentDate.get())) {
                indexedToday.clear();
                pendingUrls.clear();
                currentDate.set(today);
                saveStateToFile();
                logger.info("🔄 Auto-index: rolled state to new day {}", today);
            }
        }
    }

    // Simple URL-based static resource detection (no RecordManager dependency)
    private boolean isStaticUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        String path = url;
        try {
            java.net.URI uri = new java.net.URI(url);
            if (uri.getPath() != null) {
                path = uri.getPath();
            }
        } catch (Exception ignore) {
            // Fallback to raw string
        }

        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.startsWith("/app_images/") || lower.startsWith("/assets/") ||
            lower.startsWith("/frontend/") || lower.startsWith("/static/") ||
            lower.startsWith("/public/") || lower.startsWith("/dist/") ||
            lower.startsWith("/backend/")) {
            return true;
        }

        int dot = lower.lastIndexOf('.');
        if (dot > -1 && dot < lower.length() - 1) {
            String ext = lower.substring(dot + 1);
            int q = ext.indexOf('?');
            if (q != -1) ext = ext.substring(0, q);
            if (STATIC_EXTENSIONS.contains(ext)) {
                return true;
            }
        }

        return false;
    }
}
