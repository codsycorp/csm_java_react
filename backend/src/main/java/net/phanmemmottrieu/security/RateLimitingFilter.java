package net.phanmemmottrieu.security;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class RateLimitingFilter extends OncePerRequestFilter {
    private static final Logger logger = LoggerFactory.getLogger(RateLimitingFilter.class);
    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final long WINDOW_MS = 60_000L;
    private static final long CLEANUP_INTERVAL_MS = 60_000L;
    private static final long TRACKER_TTL_MS = 10 * 60_000L;
    private static final String CLIENT_ID_COOKIE = "csm_client_id";
    private static final String CLIENT_ID_HEADER = "X-Client-Id";
    private static final String LOGIN_IDENTIFIER_HEADER = "X-Login-Identifier";

    private final Map<String, UserRateLimit> rateLimits = new ConcurrentHashMap<>();
    private volatile long lastCleanupAt = System.currentTimeMillis();

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
            String endpointGroup = getEndpointGroup(uri);
            String clientKey = resolveClientKey(request, response);
            String loginIdentifierHint = extractLoginIdentifierHint(request);
            String rateLimitKey = buildRateLimitKey(endpointGroup, clientKey, loginIdentifierHint);
            String ua = request.getHeader("User-Agent");
            long now = System.currentTimeMillis();
            maybeCleanup(now);

            UserRateLimit limit = rateLimits.computeIfAbsent(rateLimitKey, k -> new UserRateLimit());
            synchronized (limit) {
                if (now - limit.windowStart > WINDOW_MS) {
                    limit.windowStart = now;
                    limit.requestCount = 0;
                }
                limit.requestCount++;
                limit.lastAccessAt = now;
                if (limit.requestCount > MAX_REQUESTS_PER_MINUTE) {
                    logger.warn("Rate limit exceeded: key={}, URI={}, UA={}", rateLimitKey, uri, ua);
                    response.setStatus(429);
                    response.getWriter().write("Too many requests. Please try again later.");
                    return;
                }
                if (limit.requestCount == MAX_REQUESTS_PER_MINUTE) {
                    logger.info("Rate limit warning: key={}, URI={}, UA={}", rateLimitKey, uri, ua);
                }
            }
        }
        filterChain.doFilter(request, response);
    }

    private String getEndpointGroup(String uri) {
        if (uri.startsWith("/api/login") || uri.startsWith("/login")) {
            return "login";
        }
        if (uri.startsWith("/api/register") || uri.startsWith("/register")) {
            return "register";
        }
        if (uri.startsWith("/api/refresh-token") || uri.startsWith("/refresh-token")) {
            return "refresh-token";
        }
        return "auth";
    }

    private String buildRateLimitKey(String endpointGroup, String clientKey, String loginIdentifierHint) {
        if (loginIdentifierHint != null && !loginIdentifierHint.isBlank()) {
            return endpointGroup + "|" + clientKey + "|acct:" + loginIdentifierHint.toLowerCase();
        }
        return endpointGroup + "|" + clientKey;
    }

    private String resolveClientKey(HttpServletRequest request, HttpServletResponse response) {
        String fromHeader = normalizeToken(request.getHeader(CLIENT_ID_HEADER));
        if (!fromHeader.isBlank()) {
            return "hdr:" + fromHeader;
        }

        String fromCookie = readCookie(request, CLIENT_ID_COOKIE);
        if (!fromCookie.isBlank()) {
            return "cookie:" + fromCookie;
        }

        String generated = "csm-" + UUID.randomUUID();
        writeClientCookie(response, generated, request.isSecure());
        return "cookie:" + generated;
    }

    private String extractLoginIdentifierHint(HttpServletRequest request) {
        String fromHeader = normalizeToken(request.getHeader(LOGIN_IDENTIFIER_HEADER));
        if (!fromHeader.isBlank()) {
            return fromHeader;
        }

        String username = normalizeToken(request.getParameter("username"));
        if (!username.isBlank()) {
            return username;
        }

        String email = normalizeToken(request.getParameter("email"));
        if (!email.isBlank()) {
            return email;
        }

        String phone = normalizeToken(request.getParameter("phone"));
        if (!phone.isBlank()) {
            return phone;
        }
        return "";
    }

    private String normalizeToken(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() > 128) {
            trimmed = trimmed.substring(0, 128);
        }
        return trimmed.replaceAll("[^A-Za-z0-9_@.\\-:+]", "");
    }

    private String readCookie(HttpServletRequest request, String cookieName) {
        if (request.getCookies() == null) {
            return "";
        }
        for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
            if (cookieName.equals(cookie.getName())) {
                return normalizeToken(cookie.getValue());
            }
        }
        return "";
    }

    private void writeClientCookie(HttpServletResponse response, String value, boolean secure) {
        StringBuilder cookie = new StringBuilder();
        cookie.append(CLIENT_ID_COOKIE).append("=").append(value)
            .append("; Path=/; Max-Age=").append(365 * 24 * 60 * 60)
            .append("; SameSite=Lax");
        if (secure) {
            cookie.append("; Secure");
        }
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private void maybeCleanup(long now) {
        if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
            return;
        }
        rateLimits.entrySet().removeIf(entry -> now - entry.getValue().lastAccessAt > TRACKER_TTL_MS);
        lastCleanupAt = now;
    }

    private boolean isApiRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String host = request.getHeader("Host");
        return (host != null && host.startsWith("api.")) || uri.startsWith("/api/");
    }

    private static class UserRateLimit {
        long windowStart = System.currentTimeMillis();
        int requestCount = 0;
        long lastAccessAt = System.currentTimeMillis();
    }
}
