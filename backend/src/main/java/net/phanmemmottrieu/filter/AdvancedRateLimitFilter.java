package net.phanmemmottrieu.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Advanced rate limiting and request throttling filter
 * Protects server from overload and ensures fair resource allocation
 */
@Component
public class AdvancedRateLimitFilter implements Filter {
    
    private static final Logger logger = LoggerFactory.getLogger(AdvancedRateLimitFilter.class);
    
    // Per-IP rate limiting
    private static final int MAX_REQUESTS_PER_SECOND = 50;      // Per IP
    private static final int MAX_REQUESTS_PER_MINUTE = 500;     // Per IP
    private static final int GLOBAL_MAX_CONCURRENT = 1000;      // Total server capacity
    
    private final Map<String, RequestTracker> ipTrackers = new ConcurrentHashMap<>();
    private final AtomicInteger globalConcurrent = new AtomicInteger(0);
    private volatile long lastCleanup = System.currentTimeMillis();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        
        // ✅ CRITICAL FIX: Bypass rate limiting for static assets
        // When 50+ webviews load CSS/JS/images simultaneously, don't rate limit them
        String uri = httpRequest.getRequestURI();
        if (isStaticAsset(uri)) {
            logger.debug("✅ Static asset bypass rate limit: {}", uri);
            chain.doFilter(request, response);
            return;
        }
        
        String clientIp = getClientIp(httpRequest);
        long now = System.currentTimeMillis();
        
        // Cleanup old trackers periodically
        if (now - lastCleanup > 60000) { // Every minute
            cleanupOldTrackers(now);
            lastCleanup = now;
        }
        
        // Check global concurrent limit
        int current = globalConcurrent.get();
        if (current >= GLOBAL_MAX_CONCURRENT) {
            logger.warn("Global concurrent limit reached: {} requests", current);
            sendRateLimitResponse(httpResponse, "Server at capacity, please retry");
            return;
        }
        
        // Get or create tracker for this IP
        RequestTracker tracker = ipTrackers.computeIfAbsent(clientIp, k -> new RequestTracker());
        
        // Check rate limits
        if (!tracker.allowRequest(now)) {
            logger.warn("Rate limit exceeded for IP: {}", clientIp);
            sendRateLimitResponse(httpResponse, "Rate limit exceeded");
            return;
        }
        
        // Track concurrent request
        globalConcurrent.incrementAndGet();
        
        try {
            // Add headers for client visibility
            httpResponse.setHeader("X-RateLimit-Limit", String.valueOf(MAX_REQUESTS_PER_MINUTE));
            httpResponse.setHeader("X-RateLimit-Remaining", 
                String.valueOf(MAX_REQUESTS_PER_MINUTE - tracker.getMinuteCount()));
            
            chain.doFilter(request, response);
        } finally {
            globalConcurrent.decrementAndGet();
        }
    }
    
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty()) {
            ip = request.getRemoteAddr();
        }
        if (ip == null || ip.isEmpty()) {
            return "unknown";
        }
        // X-Forwarded-For may contain multiple IPs; use only the first one
        int commaIdx = ip.indexOf(',');
        return commaIdx > 0 ? ip.substring(0, commaIdx).trim() : ip.trim();
    }
    
    private void sendRateLimitResponse(HttpServletResponse response, String message) 
            throws IOException {
        response.setStatus(429); // Too Many Requests
        response.setContentType("application/json");
        response.setHeader("Retry-After", "60");
        response.getWriter().write(
            String.format("{\"error\": \"%s\", \"code\": 429}", message)
        );
    }
    
    private void cleanupOldTrackers(long now) {
        ipTrackers.entrySet().removeIf(entry -> 
            entry.getValue().isExpired(now)
        );
    }
    
    /**
     * Tracks request counts per IP address
     */
    private static class RequestTracker {
        private long lastSecond = 0;
        private long lastMinute = 0;
        private int secondCount = 0;
        private int minuteCount = 0;
        private long lastAccess = System.currentTimeMillis();
        
        public synchronized boolean allowRequest(long now) {
            long currentSecond = now / 1000;
            long currentMinute = now / 60000;
            
            // Reset second counter
            if (currentSecond != lastSecond) {
                lastSecond = currentSecond;
                secondCount = 0;
            }
            
            // Reset minute counter
            if (currentMinute != lastMinute) {
                lastMinute = currentMinute;
                minuteCount = 0;
            }
            
            // Check limits
            if (secondCount >= MAX_REQUESTS_PER_SECOND) {
                return false;
            }
            if (minuteCount >= MAX_REQUESTS_PER_MINUTE) {
                return false;
            }
            
            // Increment counters
            secondCount++;
            minuteCount++;
            lastAccess = now;
            
            return true;
        }
        
        public int getMinuteCount() {
            return minuteCount;
        }
        
        public boolean isExpired(long now) {
            return (now - lastAccess) > 300000; // 5 minutes idle
        }
    }
    
    /**
     * Check if URI is a static asset that should bypass rate limiting
     * @param uri Request URI
     * @return true if static asset (CSS, JS, images, fonts, etc.)
     */
    private boolean isStaticAsset(String uri) {
        if (uri == null) return false;
        String lower = uri.toLowerCase();
        
        // Common static file extensions
        return lower.endsWith(".css") || lower.endsWith(".js") || 
               lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") ||
               lower.endsWith(".gif") || lower.endsWith(".svg") || lower.endsWith(".ico") ||
               lower.endsWith(".woff") || lower.endsWith(".woff2") || lower.endsWith(".ttf") ||
               lower.endsWith(".eot") || lower.endsWith(".map") || lower.endsWith(".webp") ||
               lower.contains("/assets/") || lower.contains("/static/") || 
               lower.startsWith("/frontend/");
    }
}
