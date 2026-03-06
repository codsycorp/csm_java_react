package net.phanmemmottrieu.security;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class CsrfProtectionFilter extends OncePerRequestFilter {
    private static final String CSRF_HEADER = "X-CSRF-Token";
    private static final String CSRF_COOKIE = "CSRF-TOKEN";
    private static final Logger logger = LoggerFactory.getLogger(CsrfProtectionFilter.class);

    private String readCsrfCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (var cookie : request.getCookies()) {
            if (CSRF_COOKIE.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private void setCsrfCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        String origin = request.getHeader("Origin");
        String referer = request.getHeader("Referer");
        String serverHost = request.getServerName();
        String originHost = null;
        try {
            if (origin != null && !origin.isEmpty()) {
                java.net.URI o = java.net.URI.create(origin);
                originHost = o.getHost();
            } else if (referer != null && !referer.isEmpty()) {
                java.net.URI r = java.net.URI.create(referer);
                originHost = r.getHost();
            }
        } catch (Exception ignore) {}
        boolean isCrossSite = originHost != null && serverHost != null && !originHost.equalsIgnoreCase(serverHost);

        String cookieDomain = deriveCookieDomain(originHost, serverHost);

        StringBuilder cookie = new StringBuilder();
        cookie.append(CSRF_COOKIE).append("=").append(token).append("; Path=/");
        if (cookieDomain != null) {
            cookie.append("; Domain=").append(cookieDomain);
        }
        if (isCrossSite) {
            cookie.append("; SameSite=None; Secure");
        } else {
            cookie.append("; SameSite=Lax");
        }
        // KHÔNG set Domain để trình duyệt tự gán đúng host
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private String deriveCookieDomain(String originHost, String serverHost) {
        String baseDomain = getBaseDomain(originHost);
        if (baseDomain == null) {
            baseDomain = getBaseDomain(serverHost);
        }
        if (baseDomain == null) {
            return null;
        }
        if (originHost != null && !originHost.endsWith(baseDomain)) {
            return null;
        }
        if (serverHost != null && !serverHost.endsWith(baseDomain)) {
            return null;
        }
        return "." + baseDomain;
    }

    private String getBaseDomain(String host) {
        if (host == null || host.isBlank()) {
            return null;
        }
        String normalized = host.trim().toLowerCase();
        if (normalized.equals("localhost") || normalized.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) {
            return null;
        }
        String[] parts = normalized.split("\\.");
        if (parts.length < 2) {
            return null;
        }
        if (normalized.endsWith(".com.vn") && parts.length >= 3) {
            return String.join(".", parts[parts.length - 3], parts[parts.length - 2], parts[parts.length - 1]);
        }
        return String.join(".", parts[parts.length - 2], parts[parts.length - 1]);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        logger.info("CsrfFilter - URI: {}, Method: {}", uri, method);

        boolean isApi = isApiRequest(request);
        if (!isApi) {
            filterChain.doFilter(request, response);
            return;
        }
        // Bỏ qua tiền kiểm cho OPTIONS (CORS preflight)
        if ("OPTIONS".equalsIgnoreCase(method)) {
            filterChain.doFilter(request, response);
            return;
        }
        // Bỏ qua kiểm tra CSRF cho các endpoint public
        if (uri.startsWith("/api/login") || uri.startsWith("/login") ||
            uri.startsWith("/api/logout") || uri.startsWith("/logout") ||
            uri.startsWith("/api/refresh-token") || uri.startsWith("/refresh-token") ||
            uri.startsWith("/api/register") || uri.startsWith("/register") ||
            uri.startsWith("/api/create-default-data") || uri.startsWith("/create-default-data") ||
            uri.startsWith("/api/crm/customer") || uri.startsWith("/crm/customer") ||
            uri.startsWith("/api/upload") || uri.startsWith("/upload") ||
            uri.startsWith("/api/chat-history") || uri.startsWith("/chat-history") ||
            uri.startsWith("/api/chat-history-guest") || uri.startsWith("/chat-history-guest") ||
            uri.startsWith("/api/chat-history-app") || uri.startsWith("/chat-history-app") ||
            uri.startsWith("/api/chat-mark-read") || uri.startsWith("/chat-mark-read") ||
            uri.startsWith("/api/chat-mark-all-read") || uri.startsWith("/chat-mark-all-read")) {
            filterChain.doFilter(request, response);
            return;
        }

        if (hasAuthHeader(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        String csrfCookie = readCsrfCookie(request);
        // Chỉ kiểm tra CSRF với các phương thức thay đổi dữ liệu
        if (method.equalsIgnoreCase("POST") || method.equalsIgnoreCase("PUT") || method.equalsIgnoreCase("DELETE")) {
            String csrfTokenHeader = request.getHeader(CSRF_HEADER);
            if (csrfTokenHeader == null || csrfCookie == null || !csrfTokenHeader.equals(csrfCookie)) {
                logger.warn("❌ CSRF failed: header='{}', cookie='{}', method={}, uri={}", csrfTokenHeader, csrfCookie, method, uri);
                // Phát CSRF cookie mới để client lấy cho lần sau
                String newToken = UUID.randomUUID().toString();
                // Xóa các biến thể cookie cũ để tránh trùng lặp
                // Host-only, Path=/, cả hai biến thể SameSite
                response.addHeader("Set-Cookie", CSRF_COOKIE + "=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax");
                response.addHeader("Set-Cookie", CSRF_COOKIE + "=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure");
                // Set cookie mới theo cross-site
                setCsrfCookie(request, response, newToken);
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json;charset=UTF-8");
                // Trả kèm csrfToken để FE có thể cập nhật nhanh và retry
                response.getWriter().write("{\"code\":403,\"success\":false,\"message\":\"CSRF token missing or invalid\",\"csrfToken\":\"" + newToken + "\"}");
                return;
            }
        }
        // Không tự động phát CSRF-TOKEN cho GET/HEAD nữa
        filterChain.doFilter(request, response);
    }

    private boolean hasAuthHeader(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return true;
        }
        String csmToken = request.getHeader("csm-token");
        if (csmToken != null && !csmToken.isBlank()) {
            return true;
        }
        String refreshToken = request.getHeader("X-Refresh-Token");
        return refreshToken != null && !refreshToken.isBlank();
    }

    private boolean isApiRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String host = request.getHeader("Host");
        return (host != null && host.startsWith("api.")) || uri.startsWith("/api/");
    }
}
