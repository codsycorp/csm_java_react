package net.phanmemmottrieu.cache;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.LoadingCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Cache manager cho dữ liệu service layer (categories, details, sitemap paths).
 * Sử dụng Caffeine với TTL 60-120s để giảm load DB/Lucene.
 * Hỗ trợ invalidation nhanh khi dữ liệu được update.
 */
@Component
public class ServiceDataCacheManager {

    private static final Logger logger = LoggerFactory.getLogger(ServiceDataCacheManager.class);

    // Cache cho sitemap paths: key = "domain", value = Map<path, lastmod>
    private final LoadingCache<String, Map<String, String>> sitemapPathsCache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofSeconds(120))
            .recordStats()
            .build(key -> {
                logger.debug("🔄 Sitemap cache MISS for domain: {}", key);
                return new HashMap<>(); // Lazy loader sẽ được gọi từ WebSpringController
            });

    // Cache cho category paths: key = "appId:domain", value = Map<slug, lastmod>
    private final LoadingCache<String, Map<String, String>> categoryPathsCache = Caffeine.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(Duration.ofSeconds(60))
            .recordStats()
            .build(key -> {
                logger.debug("🔄 Category paths cache MISS for key: {}", key);
                return new HashMap<>();
            });

    // Cache cho detail paths: key = "appId:domain", value = Map<slug, lastmod>
    private final LoadingCache<String, Map<String, String>> detailPathsCache = Caffeine.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(Duration.ofSeconds(60))
            .recordStats()
            .build(key -> {
                logger.debug("🔄 Detail paths cache MISS for key: {}", key);
                return new HashMap<>();
            });

    // Manual invalidation trackers (domain → last invalidation time)
    private final Map<String, Long> sitemapInvalidationTimes = new ConcurrentHashMap<>();
    private final Map<String, Long> categoryInvalidationTimes = new ConcurrentHashMap<>();
    private final Map<String, Long> detailInvalidationTimes = new ConcurrentHashMap<>();

    public ServiceDataCacheManager() {
        logger.info("✅ ServiceDataCacheManager initialized with Caffeine caches");
    }

    // ============== Sitemap Paths Cache ==============

    /**
     * Get cached sitemap paths for domain, or compute if missing/invalidated.
     * @param domain Domain name
     * @param loader Callable để load từ DB nếu cache miss/invalidated
     */
    public Map<String, String> getSitemapPaths(String domain, java.util.function.Function<String, Map<String, String>> loader) {
        try {
            // Check if recently invalidated
            long invalidatedAt = sitemapInvalidationTimes.getOrDefault(domain, 0L);
            long cacheTime = sitemapPathsCache.getIfPresent(domain) != null ? System.currentTimeMillis() : 0;
            
            // Nếu đã invalidate, refresh từ loader
            if (invalidatedAt > 0 && cacheTime < invalidatedAt) {
                sitemapPathsCache.invalidate(domain);
                sitemapInvalidationTimes.remove(domain);
                logger.info("♻️ Sitemap cache refreshed for domain: {}", domain);
            }
            
            // Load hoặc lấy từ cache
            Map<String, String> cached = sitemapPathsCache.get(domain);
            if (cached.isEmpty()) {
                Map<String, String> loaded = loader.apply(domain);
                sitemapPathsCache.put(domain, loaded);
                logger.debug("✅ Sitemap paths cached for domain: {} (size: {})", domain, loaded.size());
                return loaded;
            }
            return cached;
        } catch (Exception e) {
            logger.error("❌ Error getting sitemap paths for domain {}: {}", domain, e.getMessage());
            return new HashMap<>();
        }
    }

    public void invalidateSitemapPaths(String domain) {
        logger.info("🔔 Invalidating sitemap cache for domain: {}", domain);
        sitemapPathsCache.invalidate(domain);
        sitemapInvalidationTimes.put(domain, System.currentTimeMillis());
    }

    // ============== Category Paths Cache ==============

    /**
     * Get cached category paths for appId:domain.
     */
    public Map<String, String> getCategoryPaths(String appId, String domain, java.util.function.Function<String, Map<String, String>> loader) {
        String key = appId + ":" + domain;
        try {
            long invalidatedAt = categoryInvalidationTimes.getOrDefault(key, 0L);
            Map<String, String> cached = categoryPathsCache.getIfPresent(key);
            
            if (invalidatedAt > 0 && (cached == null || cached.isEmpty())) {
                categoryPathsCache.invalidate(key);
                categoryInvalidationTimes.remove(key);
                logger.info("♻️ Category cache refreshed for key: {}", key);
            }
            
            cached = categoryPathsCache.get(key);
            if (cached.isEmpty()) {
                Map<String, String> loaded = loader.apply(key);
                categoryPathsCache.put(key, loaded);
                logger.debug("✅ Category paths cached for key: {} (size: {})", key, loaded.size());
                return loaded;
            }
            return cached;
        } catch (Exception e) {
            logger.error("❌ Error getting category paths for key {}: {}", key, e.getMessage());
            return new HashMap<>();
        }
    }

    public void invalidateCategoryPaths(String appId, String domain) {
        String key = appId + ":" + domain;
        logger.info("🔔 Invalidating category cache for key: {}", key);
        categoryPathsCache.invalidate(key);
        categoryInvalidationTimes.put(key, System.currentTimeMillis());
    }

    // ============== Detail Paths Cache ==============

    /**
     * Get cached detail paths for appId:domain.
     */
    public Map<String, String> getDetailPaths(String appId, String domain, java.util.function.Function<String, Map<String, String>> loader) {
        String key = appId + ":" + domain;
        try {
            long invalidatedAt = detailInvalidationTimes.getOrDefault(key, 0L);
            Map<String, String> cached = detailPathsCache.getIfPresent(key);
            
            if (invalidatedAt > 0 && (cached == null || cached.isEmpty())) {
                detailPathsCache.invalidate(key);
                detailInvalidationTimes.remove(key);
                logger.info("♻️ Detail cache refreshed for key: {}", key);
            }
            
            cached = detailPathsCache.get(key);
            if (cached.isEmpty()) {
                Map<String, String> loaded = loader.apply(key);
                detailPathsCache.put(key, loaded);
                logger.debug("✅ Detail paths cached for key: {} (size: {})", key, loaded.size());
                return loaded;
            }
            return cached;
        } catch (Exception e) {
            logger.error("❌ Error getting detail paths for key {}: {}", key, e.getMessage());
            return new HashMap<>();
        }
    }

    public void invalidateDetailPaths(String appId, String domain) {
        String key = appId + ":" + domain;
        logger.info("🔔 Invalidating detail cache for key: {}", key);
        detailPathsCache.invalidate(key);
        detailInvalidationTimes.put(key, System.currentTimeMillis());
    }

    // ============== Bulk Invalidation ==============

    /**
     * Invalidate tất cả cache cho một domain (khi domain config thay đổi).
     */
    public void invalidateDomain(String domain) {
        logger.info("🔔 Invalidating ALL caches for domain: {}", domain);
        invalidateSitemapPaths(domain);
        // Invalidate categories và details với tất cả appId cho domain này
        categoryPathsCache.asMap().keySet().stream()
                .filter(k -> k.endsWith(":" + domain))
                .forEach(k -> {
                    categoryPathsCache.invalidate(k);
                    categoryInvalidationTimes.put(k, System.currentTimeMillis());
                });
        detailPathsCache.asMap().keySet().stream()
                .filter(k -> k.endsWith(":" + domain))
                .forEach(k -> {
                    detailPathsCache.invalidate(k);
                    detailInvalidationTimes.put(k, System.currentTimeMillis());
                });
    }

    /**
     * Clear tất cả cache (khi database bị reset).
     */
    public void clearAll() {
        logger.warn("🔴 Clearing ALL service caches!");
        sitemapPathsCache.invalidateAll();
        categoryPathsCache.invalidateAll();
        detailPathsCache.invalidateAll();
        sitemapInvalidationTimes.clear();
        categoryInvalidationTimes.clear();
        detailInvalidationTimes.clear();
    }

    // ============== Stats ==============

    public void printStats() {
        logger.info("📊 Cache Stats - Sitemap: {}, Categories: {}, Details: {}",
                sitemapPathsCache.stats(),
                categoryPathsCache.stats(),
                detailPathsCache.stats());
    }
}
