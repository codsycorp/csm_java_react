package net.phanmemmottrieu.security;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class RateLimitingFilter extends OncePerRequestFilter {
    private static final Logger logger = LoggerFactory.getLogger(RateLimitingFilter.class);
    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final long WINDOW_MS = 60_000L;
    private final Map<String, UserRateLimit> ipLimits = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // Chỉ xử lý các request API (theo logic MainRouterController)
        if (!isApiRequest(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        String uri = request.getRequestURI();
        // Chỉ áp dụng cho các endpoint nhạy cảm
        if (uri.startsWith("/api/login") || uri.startsWith("/login") || 
            uri.startsWith("/api/refresh-token") || uri.startsWith("/refresh-token") || 
            uri.startsWith("/api/register") || uri.startsWith("/register")) {
            String ip = request.getRemoteAddr();
            String ua = request.getHeader("User-Agent");
            long now = System.currentTimeMillis();
            UserRateLimit limit = ipLimits.computeIfAbsent(ip, k -> new UserRateLimit());
            synchronized (limit) {
                if (now - limit.windowStart > WINDOW_MS) {
                    limit.windowStart = now;
                    limit.requestCount = 0;
                }
                limit.requestCount++;
                if (limit.requestCount > MAX_REQUESTS_PER_MINUTE) {
                    logger.warn("Rate limit exceeded: IP={}, URI={}, UA={}", ip, uri, ua);
                    response.setStatus(429);
                    response.getWriter().write("Too many requests. Please try again later.");
                    return;
                }
                if (limit.requestCount == MAX_REQUESTS_PER_MINUTE) {
                    logger.info("Rate limit warning: IP={}, URI={}, UA={}", ip, uri, ua);
                }
            }
        }
        filterChain.doFilter(request, response);
    }

    private boolean isApiRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String host = request.getHeader("Host");
        return (host != null && host.startsWith("api.")) || uri.startsWith("/api/");
    }

    private static class UserRateLimit {
        long windowStart = System.currentTimeMillis();
        int requestCount = 0;
    }
}
