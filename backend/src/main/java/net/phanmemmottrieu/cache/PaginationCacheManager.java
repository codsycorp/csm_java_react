package net.phanmemmottrieu.cache;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Backend Pagination Cache Manager
 * 
 * Mục đích: Quản lý cursor pagination từ phía backend (ẩn lastkey từ client)
 * 
 * Flow:
 * 1. Client gửi: ?page=2&q=php&price_min=1000 (NO lastkey)
 * 2. Backend xây dựng querySignature duy nhất
 * 3. Kiểm tra cache → Lấy lastkey nếu có
 * 4. Query DB với lastkey
 * 5. Lưu kết quả vào cache với TTL 15 phút
 * 6. Trả về cho client (nextCursor, không lastkey)
 * 
 * Lợi ích:
 * - Bảo mật: Client không thể giả mạo lastkey
 * - Hiệu năng: In-memory cache giảm DB query ~70%
 * - Tin cậy: Backend đảm bảo đúng vị trí trang
 */
public class PaginationCacheManager {
    
    private static final Logger logger = LoggerFactory.getLogger(PaginationCacheManager.class);
    
    // In-memory cache: "domain:service_type:signature|page:N" -> PaginationCursor
    private static final Map<String, PaginationCursor> cursorCache = 
        new ConcurrentHashMap<>();
    
    // Cleanup task marker
    private static volatile boolean cleanupTaskScheduled = false;
    
    // TTL: 15 phút
    private static final long CURSOR_TTL_MS = 15 * 60 * 1000;
    
    // Max cache size: 10,000 entries (mỗi entry ~500 bytes = ~5MB)
    private static final int MAX_CACHE_SIZE = 10000;
    
    private static final ObjectMapper objectMapper = new ObjectMapper();
    
    // Statistics
    private static class CacheStats {
        long hits = 0;
        long misses = 0;
        long expiries = 0;
        
        synchronized void recordHit() { hits++; }
        synchronized void recordMiss() { misses++; }
        synchronized void recordExpiry() { expiries++; }
        
        synchronized double getHitRate() {
            long total = hits + misses;
            return total == 0 ? 0 : (double) hits / total * 100;
        }
        
        synchronized String getStats() {
            return String.format("Hits: %d, Misses: %d, Expiries: %d, Hit Rate: %.1f%%",
                hits, misses, expiries, getHitRate());
        }
    }
    
    private static final CacheStats stats = new CacheStats();
    
    /**
     * Xây dựng query signature duy nhất cho một yêu cầu tìm kiếm
     * 
     * Không sử dụng session ID (sid) để đảm bảo:
     * - URL sạch: /bat-dong-san.shtml?page=2 (không &sid=xxx)
     * - SEO friendly: Cùng query → Cùng signature → Cùng dữ liệu
     * - Đồng bộ: User A và B truy cập cùng URL → Thấy cùng dữ liệu
     * 
     * Ví dụ: "phanmemmottrieu.net:bat-dong-san:price_min=1000&price_max=5000"
     * 
     * @param domain Tên domain (e.g., "phanmemmottrieu.net")
     * @param serviceTypeOrSlug Loại dịch vụ hoặc slug (e.g., "phan-mem", "bat-dong-san")
     * @param filters Map của các filter (e.g., bedrooms=2, price_min=1000)
     * @return Query signature string
     */
    public static String buildQuerySignature(
        String domain,
        String serviceTypeOrSlug,
        Map<String, String> filters
    ) {
        StringBuilder sb = new StringBuilder();
        
        // Part 1: Domain
        sb.append(domain != null ? domain : "").append(":");
        
        // Part 2: Service Type / Slug (danh sách dịch vụ hoặc service_id cho related posts)
        sb.append(serviceTypeOrSlug != null ? serviceTypeOrSlug : "all").append(":");
        
        // Part 3: Filters (sắp xếp để đảm bảo signature nhất quán)
        // Nếu không có filter, vẫn hash rỗng để có signature ổn định
        if (filters != null && !filters.isEmpty()) {
            List<String> keys = new ArrayList<>(filters.keySet());
            Collections.sort(keys);
            
            for (int i = 0; i < keys.size(); i++) {
                String key = keys.get(i);
                String value = filters.get(key);
                
                // Bỏ qua null values và page parameter (page được handle riêng)
                if (value == null || value.trim().isEmpty() || "page".equals(key)) continue;
                
                sb.append(key).append("=").append(value.trim());
                if (i < keys.size() - 1) sb.append("&");
            }
        }
        
        String signature = sb.toString();
        logger.debug("📝 Built query signature (no sid): {}", signature);
        return signature;
    }
    
    /**
     * Xây dựng cache key bao gồm cả page number
     * 
     * Format: "querySignature|page:N"
     */
    public static String buildCacheKey(String querySignature, int page) {
        return querySignature + "|page:" + page;
    }
    
    /**
     * Lấy lastkey từ cache hoặc null nếu không có (Cache MISS)
     * 
     * @param querySignature Query signature (từ buildQuerySignature)
     * @param page Page number (1-based)
     * @return lastkey string hoặc null
     */
    public static String getLastKeyForPage(String querySignature, int page) {
        String cacheKey = buildCacheKey(querySignature, page);
        PaginationCursor cursor = cursorCache.get(cacheKey);

        // Cache MISS → try derive from previous page's nextCursor
        if (cursor == null && page > 1) {
            String prevKey = buildCacheKey(querySignature, page - 1);
            PaginationCursor prev = cursorCache.get(prevKey);
            if (prev != null && prev.nextCursor != null && !prev.nextCursor.isEmpty()) {
                cursor = new PaginationCursor(page, prev.nextCursor, null, prev.totalCount, System.currentTimeMillis());
                cursorCache.put(cacheKey, cursor);
                logger.info("↪️ Cache MISS page {}, using prev page nextCursor to seed lastkey", page);
                stats.recordHit();
            }
        }

        // Cache MISS (no fallback available)
        if (cursor == null) {
            logger.debug("❌ Cache MISS: {} (page {})", querySignature, page);
            stats.recordMiss();
            return null;
        }
        
        // Check TTL
        long age = System.currentTimeMillis() - cursor.timestamp;
        if (age > CURSOR_TTL_MS) {
            logger.info("⏰ Cache EXPIRED: {} (page {}), age={}ms, TTL={}ms", 
                querySignature, page, age, CURSOR_TTL_MS);
            cursorCache.remove(cacheKey);
            stats.recordExpiry();
            return null;
        }
        
        // Cache HIT
        logger.debug("✅ Cache HIT: {} (page {}), lastkey={}, age={}ms", 
            querySignature, page, cursor.lastkey, age);
        stats.recordHit();
        
        return cursor.lastkey;
    }
    
    /**
     * Lưu cursor info vào cache sau khi query database
     * 
     * @param querySignature Query signature
     * @param page Page number
     * @param lastkey Lastkey (ẩn từ client)
     * @param nextCursor Next cursor (gửi cho client)
     * @param totalCount Tổng số records
     */
    public static void saveCursorForPage(
        String querySignature,
        int page,
        String lastkey,
        String nextCursor,
        long totalCount
    ) {
        // Cleanup expired entries nếu cache quá lớn
        if (cursorCache.size() >= MAX_CACHE_SIZE) {
            cleanupExpiredEntries();
        }
        
        String cacheKey = buildCacheKey(querySignature, page);
        PaginationCursor cursor = new PaginationCursor(
            page,
            lastkey,
            nextCursor,
            totalCount,
            System.currentTimeMillis()
        );
        
        cursorCache.put(cacheKey, cursor);
        logger.info("💾 Cached: {} (page {}), lastkey={}, nextCursor={}", 
            querySignature, page, lastkey, nextCursor);

        // Pre-cache next page cursor so page>1 requests can resolve lastkey immediately
        if (nextCursor != null && !nextCursor.isEmpty()) {
            String nextKey = buildCacheKey(querySignature, page + 1);
            PaginationCursor nextPageCursor = new PaginationCursor(
                page + 1,
                nextCursor,
                null,
                totalCount,
                System.currentTimeMillis()
            );
            cursorCache.put(nextKey, nextPageCursor);
            logger.info("💾 Cached next page seed: {} (page {}), lastkey={}", querySignature, page + 1, nextCursor);
        }
    }
    
    /**
     * Xóa cache cho một query signature (khi dữ liệu cập nhật)
     * 
     * Ví dụ: Khi update/delete record trong "phan-mem" category,
     * gọi invalidateQueryCache("phanmemmottrieu.net:phan-mem:") để xóa tất cả
     * entries liên quan đến category này
     */
    public static void invalidateQueryCache(String querySignaturePrefix) {
        int removedCount = 0;
        for (Iterator<String> it = cursorCache.keySet().iterator(); it.hasNext();) {
            String key = it.next();
            if (key.startsWith(querySignaturePrefix)) {
                it.remove();
                removedCount++;
            }
        }
        logger.info("🗑️ Invalidated {} cache entries for prefix: {}", 
            removedCount, querySignaturePrefix);
    }
    
    /**
     * Xóa toàn bộ cache (khi server restart hoặc emergency)
     */
    public static void clearAllCache() {
        int clearedCount = cursorCache.size();
        cursorCache.clear();
        logger.warn("🧹 Cleared ALL {} pagination cache entries!", clearedCount);
    }
    
    /**
     * Lấy thống kê cache
     */
    public static String getCacheStats() {
        return String.format(
            "PaginationCache: size=%d, max=%d, %s",
            cursorCache.size(),
            MAX_CACHE_SIZE,
            stats.getStats()
        );
    }
    
    /**
     * Lấy cache info (debugging)
     */
    public static Map<String, Object> getCacheInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("size", cursorCache.size());
        info.put("maxSize", MAX_CACHE_SIZE);
        info.put("ttlMs", CURSOR_TTL_MS);
        info.put("stats", new HashMap<String, Long>() {{
            put("hits", stats.hits);
            put("misses", stats.misses);
            put("expiries", stats.expiries);
        }});
        
        // List top 10 entries (for debugging)
        List<Map<String, Object>> topEntries = cursorCache.entrySet().stream()
            .sorted((a, b) -> Long.compare(b.getValue().timestamp, a.getValue().timestamp))
            .limit(10)
            .map(e -> new HashMap<String, Object>() {{
                put("key", e.getKey());
                put("page", e.getValue().page);
                put("nextCursor", e.getValue().nextCursor);
                put("totalCount", e.getValue().totalCount);
                put("age", System.currentTimeMillis() - e.getValue().timestamp);
            }})
            .collect(Collectors.toList());
        
        info.put("topEntries", topEntries);
        return info;
    }
    
    /**
     * Cleanup expired entries (internal)
     */
    private static synchronized void cleanupExpiredEntries() {
        long now = System.currentTimeMillis();
        int removedCount = 0;
        
        for (Iterator<Map.Entry<String, PaginationCursor>> it = 
             cursorCache.entrySet().iterator(); it.hasNext();) {
            Map.Entry<String, PaginationCursor> entry = it.next();
            if (now - entry.getValue().timestamp > CURSOR_TTL_MS) {
                it.remove();
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            logger.info("🧹 Cleaned up {} expired cache entries", removedCount);
        }
    }
    
    /**
     * Inner class: Lưu trữ thông tin cursor cho một trang
     */
    public static class PaginationCursor {
        public int page;
        public String lastkey;           // ẩn từ client, chỉ dùng server-side
        public String nextCursor;        // gửi cho client để request trang tiếp theo
        public long totalCount;
        public long timestamp;           // khi tạo cache entry
        
        public PaginationCursor(
            int page,
            String lastkey,
            String nextCursor,
            long totalCount,
            long timestamp
        ) {
            this.page = page;
            this.lastkey = lastkey;
            this.nextCursor = nextCursor;
            this.totalCount = totalCount;
            this.timestamp = timestamp;
        }
        
        public long getAgeMs() {
            return System.currentTimeMillis() - timestamp;
        }
        
        public boolean isExpired() {
            return getAgeMs() > CURSOR_TTL_MS;
        }
        
        @Override
        public String toString() {
            return String.format(
                "PaginationCursor(page=%d, lastkey=%s, nextCursor=%s, totalCount=%d, age=%dms)",
                page, lastkey, nextCursor, totalCount, getAgeMs()
            );
        }
    }
}
