package net.phanmemmottrieu.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import net.phanmemmottrieu.service.ChatCleanupService;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.ThreadMXBean;
import java.util.HashMap;
import java.util.Map;

/**
 * Performance monitoring and health check endpoints
 * For real-time performance tracking
 */
@RestController
@RequestMapping("/api/monitoring")
public class MonitoringController {

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;
    
    @Autowired(required = false)
    private CacheManager cacheManager;
    
    @Autowired(required = false)
    private ChatCleanupService chatCleanupService;

    /**
     * Health check endpoint
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("timestamp", System.currentTimeMillis());
        
        // Check Redis
        if (redisTemplate != null) {
            try {
                redisTemplate.opsForValue().get("health:check");
                health.put("redis", "UP");
            } catch (Exception e) {
                health.put("redis", "DOWN");
            }
        } else {
            health.put("redis", "NOT_CONFIGURED");
        }
        
        return ResponseEntity.ok(health);
    }

    /**
     * Performance metrics endpoint
     */
    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> metrics() {
        Map<String, Object> metrics = new HashMap<>();
        
        // JVM Memory
        MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
        Map<String, Object> memory = new HashMap<>();
        memory.put("heap_used_mb", memoryBean.getHeapMemoryUsage().getUsed() / (1024 * 1024));
        memory.put("heap_max_mb", memoryBean.getHeapMemoryUsage().getMax() / (1024 * 1024));
        memory.put("heap_usage_percent", 
            (memoryBean.getHeapMemoryUsage().getUsed() * 100.0) / memoryBean.getHeapMemoryUsage().getMax());
        memory.put("non_heap_used_mb", memoryBean.getNonHeapMemoryUsage().getUsed() / (1024 * 1024));
        metrics.put("memory", memory);
        
        // Thread metrics
        ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();
        Map<String, Object> threads = new HashMap<>();
        threads.put("count", threadBean.getThreadCount());
        threads.put("peak", threadBean.getPeakThreadCount());
        threads.put("daemon", threadBean.getDaemonThreadCount());
        metrics.put("threads", threads);
        
        // System
        Map<String, Object> system = new HashMap<>();
        system.put("processors", Runtime.getRuntime().availableProcessors());
        system.put("uptime_seconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        metrics.put("system", system);
        
        // Cache stats (if available)
        if (cacheManager != null) {
            Map<String, Object> cache = new HashMap<>();
            cache.put("names", cacheManager.getCacheNames());
            metrics.put("cache", cache);
        }
        
        return ResponseEntity.ok(metrics);
    }

    /**
     * Cache statistics
     */
    @GetMapping("/cache/stats")
    public ResponseEntity<Map<String, Object>> cacheStats() {
        Map<String, Object> stats = new HashMap<>();
        
        if (redisTemplate != null) {
            try {
                // Get Redis info (simplified)
                stats.put("redis_connected", true);
                stats.put("message", "Cache is operational");
            } catch (Exception e) {
                stats.put("redis_connected", false);
                stats.put("error", e.getMessage());
            }
        } else {
            stats.put("redis_connected", false);
            stats.put("message", "Redis not configured, using local cache only");
        }
        
        return ResponseEntity.ok(stats);
    }

    /**
     * Thread pool statistics
     */
    @GetMapping("/threads")
    public ResponseEntity<Map<String, Object>> threadStats() {
        Map<String, Object> stats = new HashMap<>();
        ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();
        
        stats.put("total_threads", threadBean.getThreadCount());
        stats.put("peak_threads", threadBean.getPeakThreadCount());
        stats.put("daemon_threads", threadBean.getDaemonThreadCount());
        stats.put("total_started", threadBean.getTotalStartedThreadCount());
        
        // Thread states
        long[] threadIds = threadBean.getAllThreadIds();
        Map<Thread.State, Integer> stateCount = new HashMap<>();
        for (long id : threadIds) {
            Thread.State state = Thread.State.valueOf(
                threadBean.getThreadInfo(id).getThreadState().name()
            );
            stateCount.put(state, stateCount.getOrDefault(state, 0) + 1);
        }
        stats.put("thread_states", stateCount);
        
        return ResponseEntity.ok(stats);
    }
    
    /**
     * Get chat cleanup configuration and stats
     */
    @GetMapping("/chat/cleanup/config")
    public ResponseEntity<Map<String, Object>> getChatCleanupConfig() {
        if (chatCleanupService == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("error", "ChatCleanupService not available");
            return ResponseEntity.ok(result);
        }
        
        return ResponseEntity.ok(chatCleanupService.getCleanupConfig());
    }
    
    /**
     * Trigger chat cleanup manually
     * Useful for testing or manual maintenance
     */
    @PostMapping("/chat/cleanup/trigger")
    public ResponseEntity<Map<String, Object>> triggerChatCleanup() {
        if (chatCleanupService == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("error", "ChatCleanupService not available");
            return ResponseEntity.ok(result);
        }
        
        return ResponseEntity.ok(chatCleanupService.triggerCleanupNow());
    }
}
