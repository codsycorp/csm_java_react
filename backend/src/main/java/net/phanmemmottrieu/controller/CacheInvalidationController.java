package net.phanmemmottrieu.controller;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import net.phanmemmottrieu.cache.ServiceDataCacheManager;
import net.phanmemmottrieu.model.StandardResponse;

/**
 * Controller để invalidate cache khi dữ liệu được update.
 * Được gọi từ admin panel hoặc CMS khi cập nhật category/product/article.
 * 
 * Security: Nên thêm authentication (JWT/API key) trước triển khai production.
 */
@RestController
@RequestMapping("/api/cache")
public class CacheInvalidationController {

    private static final Logger logger = LoggerFactory.getLogger(CacheInvalidationController.class);

    @Autowired
    private ServiceDataCacheManager serviceDataCacheManager;

    /**
     * Invalidate sitemap cache cho một domain.
     * Usage: POST /api/cache/invalidate-sitemap?domain=phanmemmottrieu.net
     */
    @PostMapping("/invalidate-sitemap")
    public ResponseEntity<Map<String, Object>> invalidateSitemap(@RequestParam String domain) {
        logger.info("🔔 Cache invalidation request: invalidate sitemap for domain={}", domain);
        Map<String, Object> response = new HashMap<>();
        try {
            serviceDataCacheManager.invalidateSitemapPaths(domain);
            response.put("success", true);
            response.put("message", "Sitemap cache invalidated for domain: " + domain);
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Error invalidating sitemap cache: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    /**
     * Invalidate category paths cache.
     * Usage: POST /api/cache/invalidate-categories?appId=web&domain=phanmemmottrieu.net
     */
    @PostMapping("/invalidate-categories")
    public ResponseEntity<Map<String, Object>> invalidateCategories(
            @RequestParam String appId,
            @RequestParam String domain) {
        logger.info("🔔 Cache invalidation request: invalidate categories for appId={}, domain={}", appId, domain);
        Map<String, Object> response = new HashMap<>();
        try {
            serviceDataCacheManager.invalidateCategoryPaths(appId, domain);
            response.put("success", true);
            response.put("message", "Category cache invalidated for appId: " + appId + ", domain: " + domain);
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Error invalidating category cache: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    /**
     * Invalidate detail paths cache.
     * Usage: POST /api/cache/invalidate-details?appId=web&domain=phanmemmottrieu.net
     */
    @PostMapping("/invalidate-details")
    public ResponseEntity<Map<String, Object>> invalidateDetails(
            @RequestParam String appId,
            @RequestParam String domain) {
        logger.info("🔔 Cache invalidation request: invalidate details for appId={}, domain={}", appId, domain);
        Map<String, Object> response = new HashMap<>();
        try {
            serviceDataCacheManager.invalidateDetailPaths(appId, domain);
            response.put("success", true);
            response.put("message", "Detail cache invalidated for appId: " + appId + ", domain: " + domain);
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Error invalidating detail cache: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    /**
     * Invalidate tất cả cache cho một domain.
     * Usage: POST /api/cache/invalidate-domain?domain=phanmemmottrieu.net
     */
    @PostMapping("/invalidate-domain")
    public ResponseEntity<Map<String, Object>> invalidateDomain(@RequestParam String domain) {
        logger.info("🔔 Cache invalidation request: invalidate ALL caches for domain={}", domain);
        Map<String, Object> response = new HashMap<>();
        try {
            serviceDataCacheManager.invalidateDomain(domain);
            response.put("success", true);
            response.put("message", "ALL caches invalidated for domain: " + domain);
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Error invalidating domain cache: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    /**
     * Clear tất cả cache (nuclear option).
     * Usage: POST /api/cache/clear-all
     */
    @PostMapping("/clear-all")
    public ResponseEntity<Map<String, Object>> clearAll() {
        logger.warn("🔴 Cache clear-all request!");
        Map<String, Object> response = new HashMap<>();
        try {
            serviceDataCacheManager.clearAll();
            response.put("success", true);
            response.put("message", "ALL caches cleared");
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Error clearing all caches: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    /**
     * Print cache statistics (debug).
     * Usage: POST /api/cache/stats
     */
    @PostMapping("/stats")
    public ResponseEntity<Map<String, Object>> printStats() {
        logger.info("📊 Cache stats request");
        Map<String, Object> response = new HashMap<>();
        try {
            serviceDataCacheManager.printStats();
            response.put("success", true);
            response.put("message", "Cache stats printed to logs");
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Error printing cache stats: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            response.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }
}
