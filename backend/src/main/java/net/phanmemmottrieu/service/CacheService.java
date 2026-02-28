package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * High-performance cache service with Redis
 * Provides async cache operations and batch processing
 */
@Service
public class CacheService {
    
    private static final Logger logger = LoggerFactory.getLogger(CacheService.class);
    
    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;
    
    /**
     * Async cache warming - preload frequently accessed data
     */
    @Async("fastExecutor")
    public CompletableFuture<Void> warmCache(String key, Object value, long ttlSeconds) {
        return CompletableFuture.runAsync(() -> {
            try {
                if (redisTemplate != null) {
                    redisTemplate.opsForValue().set(key, value, ttlSeconds, TimeUnit.SECONDS);
                    logger.debug("Cache warmed: {}", key);
                }
            } catch (Exception e) {
                logger.error("Cache warm failed for {}: {}", key, e.getMessage());
            }
        });
    }
    
    /**
     * Get from cache with fallback
     */
    public <T> T get(String key, Class<T> type) {
        try {
            if (redisTemplate != null) {
                Object value = redisTemplate.opsForValue().get(key);
                if (value != null) {
                    return type.cast(value);
                }
            }
        } catch (Exception e) {
            logger.error("Cache get failed for {}: {}", key, e.getMessage());
        }
        return null;
    }
    
    /**
     * Put into cache
     */
    public void put(String key, Object value, long ttlSeconds) {
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(key, value, ttlSeconds, TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            logger.error("Cache put failed for {}: {}", key, e.getMessage());
        }
    }
    
    /**
     * Invalidate cache by key
     */
    public void invalidate(String key) {
        try {
            if (redisTemplate != null) {
                redisTemplate.delete(key);
                logger.debug("Cache invalidated: {}", key);
            }
        } catch (Exception e) {
            logger.error("Cache invalidate failed for {}: {}", key, e.getMessage());
        }
    }
    
    /**
     * Invalidate cache by pattern
     */
    @Async("fastExecutor")
    public CompletableFuture<Void> invalidatePattern(String pattern) {
        return CompletableFuture.runAsync(() -> {
            try {
                if (redisTemplate != null) {
                    Set<String> keys = redisTemplate.keys(pattern);
                    if (keys != null && !keys.isEmpty()) {
                        redisTemplate.delete(keys);
                        logger.info("Cache pattern invalidated: {} ({} keys)", pattern, keys.size());
                    }
                }
            } catch (Exception e) {
                logger.error("Cache pattern invalidate failed for {}: {}", pattern, e.getMessage());
            }
        });
    }
    
    /**
     * Get cache hit rate (for monitoring)
     */
    public double getCacheHitRate() {
        // This would need Redis INFO stats in production
        // For now return estimated value
        return 0.75; // 75% hit rate target
    }
}
