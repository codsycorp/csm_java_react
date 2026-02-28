package net.phanmemmottrieu.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.TimeUnit;

/**
 * API Response Caching Interceptor
 * Automatically caches GET API responses in Redis for fast retrieval
 * Supports ETag-based conditional requests
 */
@Component
public class ApiCacheInterceptor implements HandlerInterceptor {
    
    private static final Logger logger = LoggerFactory.getLogger(ApiCacheInterceptor.class);
    private static final String CACHE_PREFIX = "api:cache:";
    private static final int DEFAULT_TTL_SECONDS = 300; // 5 minutes
    
    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Only cache GET requests
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        
        // Skip if Redis not available
        if (redisTemplate == null) {
            return true;
        }
        
        try {
            String cacheKey = generateCacheKey(request);
            String etag = generateETag(cacheKey);
            
            // Check If-None-Match header
            String clientETag = request.getHeader("If-None-Match");
            if (etag.equals(clientETag)) {
                response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
                return false; // Stop processing
            }
            
            // Try to get from cache
            Object cachedResponse = redisTemplate.opsForValue().get(CACHE_PREFIX + cacheKey);
            if (cachedResponse != null) {
                response.setStatus(HttpServletResponse.SC_OK);
                response.setContentType("application/json");
                response.setHeader("ETag", etag);
                response.setHeader("Cache-Control", "max-age=300");
                response.setHeader("X-Cache", "HIT");
                response.getWriter().write(objectMapper.writeValueAsString(cachedResponse));
                return false; // Response sent from cache
            }
            
            response.setHeader("X-Cache", "MISS");
            request.setAttribute("cacheKey", cacheKey);
            request.setAttribute("etag", etag);
            
        } catch (Exception e) {
            logger.error("Cache lookup error: {}", e.getMessage());
        }
        
        return true; // Continue to controller
    }
    
    private String generateCacheKey(HttpServletRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append(request.getRequestURI());
        
        String queryString = request.getQueryString();
        if (queryString != null) {
            sb.append("?").append(queryString);
        }
        
        // Include auth header in cache key for user-specific data
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null) {
            sb.append(":").append(authHeader.hashCode());
        }
        
        return sb.toString();
    }
    
    private String generateETag(String content) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                hexString.append(String.format("%02x", b));
            }
            return "\"" + hexString.toString() + "\"";
        } catch (Exception e) {
            return "\"" + content.hashCode() + "\"";
        }
    }
    
    /**
     * Cache the response after controller execution
     */
    public void cacheResponse(String cacheKey, Object response) {
        if (redisTemplate != null && cacheKey != null && response != null) {
            try {
                redisTemplate.opsForValue().set(
                    CACHE_PREFIX + cacheKey, 
                    response, 
                    DEFAULT_TTL_SECONDS, 
                    TimeUnit.SECONDS
                );
            } catch (Exception e) {
                logger.error("Failed to cache response: {}", e.getMessage());
            }
        }
    }
}
