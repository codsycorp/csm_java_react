package net.phanmemmottrieu.config;

import java.time.Duration;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import com.github.benmanes.caffeine.cache.Caffeine;

@Configuration
@EnableCaching
public class CacheConfig {

    /**
     * Local in-memory cache for ultra-fast micro-caching
     * Best for: frequently accessed data with very short TTL
     */
    @Bean("localCacheManager")
    public CacheManager localCacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager(
            "pageMicroCache",      // 30s cache for pages
            "apiMicroCache",       // 10s cache for API responses
            "staticDataCache"      // 5 min cache for rarely-changed data
        );
        cacheManager.setCaffeine(
            Caffeine.newBuilder()
                .maximumSize(10000)            // Increased from 5000
                .expireAfterWrite(Duration.ofSeconds(30))
                .recordStats()
        );
        return cacheManager;
    }

    /**
     * Redis distributed cache for shared data across instances
     * Best for: session data, API responses, shared state
     */
    @Bean("redisCacheManager")
    @Primary
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))  // Default 10 min TTL
            .serializeKeysWith(
                RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer())
            )
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair.fromSerializer(
                    new GenericJackson2JsonRedisSerializer()
                )
            )
            .disableCachingNullValues();

        // Custom TTL for different cache types
        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(config)
            .withCacheConfiguration("apiCache", 
                config.entryTtl(Duration.ofMinutes(5)))
            .withCacheConfiguration("pageCache", 
                config.entryTtl(Duration.ofMinutes(15)))
            .withCacheConfiguration("dataCache", 
                config.entryTtl(Duration.ofHours(1)))
            .withCacheConfiguration("userSessionCache", 
                config.entryTtl(Duration.ofHours(2)))
            .transactionAware()
            .build();
    }
}
