package net.phanmemmottrieu.security;

import org.springframework.beans.factory.annotation.Autowired;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

import java.util.Map;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private static final Logger LOGGER = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String CLIENT_ID_HEADER = "X-Client-Id";

    @Autowired
    private net.phanmemmottrieu.service.UserService userService;

    @Autowired
    private JwtUtil jwtUtil;


    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // Chỉ xử lý các request API (theo logic MainRouterController)
        if (!isApiRequest(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        // Bỏ qua xác thực cho preflight CORS
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        boolean isGetTableDataRequest = isGetTableDataRequest(request);
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            if (!jwtUtil.validateToken(token)) {
                logGetTableDataSecurity(request, "reject-invalid-bearer");
                sendJsonError(response, 401, "Invalid or expired JWT token");
                return;
            }
            if (!setAuthenticationFromToken(token)) {
                logGetTableDataSecurity(request, "reject-bearer-auth-resolution");
                sendJsonError(response, 401, "Invalid or expired JWT token");
                return;
            }
            if (isGetTableDataRequest) {
                logGetTableDataSecurity(request, "allow-bearer");
            }
            filterChain.doFilter(request, response);
            return;
        }

        String csmToken = request.getHeader("csm-token");
        if (csmToken != null && !csmToken.isBlank()) {
            if (!jwtUtil.validateToken(csmToken)) {
                logGetTableDataSecurity(request, "reject-invalid-csm-token");
                // Invalid JWT format/signature: still allow refresh-token fallback path below.
            } else if (setAuthenticationFromToken(csmToken)) {
                if (isGetTableDataRequest) {
                    logGetTableDataSecurity(request, "allow-csm-token");
                }
                filterChain.doFilter(request, response);
                return;
            } else {
                // Token is syntactically valid but user resolution/version check may lag right after login.
                // Continue to refresh-token fallback path below instead of hard-failing immediately.
                LOGGER.warn("[JWT] csm-token auth resolution failed, fallback to refresh-token path: uri={}", request.getRequestURI());
            }
        }

        // Nếu không có Authorization header, kiểm tra cookie refreshToken hoặc X-Refresh-Token header (for nwjs)
        String refreshToken = null;
        
        // Priority 1: Check X-Refresh-Token header (for nwjs where cookies don't persist)
        refreshToken = request.getHeader("X-Refresh-Token");
        
        // Priority 2: Check refreshToken cookie
        if (refreshToken == null || refreshToken.isEmpty()) {
            if (request.getCookies() != null) {
                for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                    if ("refreshToken".equals(cookie.getName())) {
                        refreshToken = cookie.getValue();
                        break;
                    }
                }
            }
        }
        
        if (refreshToken != null && !refreshToken.isEmpty()) {
            net.phanmemmottrieu.model.User user = userService.findUserByRefreshToken(refreshToken);
            if (user != null) {
                // SECURITY: Validate IP and User-Agent to prevent session hijacking
                String currentIp = normalizeClientIp(getClientIp(request));
                String currentUa = normalizeUserAgent(request.getHeader("User-Agent"));
                
                // Check if IP and UA match the ones stored when token was created
                boolean ipMatch = user.getRefreshTokenIp() != null && normalizeClientIp(user.getRefreshTokenIp()).equals(currentIp);
                boolean uaMatch = user.getRefreshTokenUa() != null && userAgentMatches(currentUa, user.getRefreshTokenUa());
                
                // Check if token is expired
                boolean tokenValid = user.getRefreshTokenExpiry() != null && 
                                   user.getRefreshTokenExpiry() > System.currentTimeMillis();
                
                if (ipMatch && uaMatch && tokenValid) {
                    // Set user info vào SecurityContextHolder
                    org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                        new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                            user, null, java.util.Collections.emptyList()
                        )
                    );
                    if (isGetTableDataRequest) {
                        logGetTableDataSecurity(request, "allow-refresh-token");
                    }
                    filterChain.doFilter(request, response);
                    return;
                } else {
                    // Invalid refreshToken: clear it from DB
                    try {
                        userService.clearSessionToken(user);
                    } catch (Exception e) {
                        // Log but don't fail
                    }
                    
                    // IMPORTANT: For public endpoints (login, register), don't reject immediately
                    // Let the request continue so user can login again with new credentials
                    if (!requiresAuth(request)) {
                        // Clear the invalid token and let request proceed
                        if (isGetTableDataRequest) {
                            logGetTableDataSecurity(request, "skip-invalid-refresh-public-endpoint");
                        }
                        filterChain.doFilter(request, response);
                        return;
                    }
                    
                    // For protected endpoints, reject with 401
                    logGetTableDataSecurity(request, "reject-invalid-refresh-token");
                    sendJsonError(response, 401, "Invalid or expired refresh token");
                    return;
                }
            }
        }


        if (requiresAuth(request)) {
            logGetTableDataSecurity(request, "reject-missing-auth");
            sendJsonError(response, 401, "Missing Authorization header");
            return;
        }
        if (isGetTableDataRequest) {
            logGetTableDataSecurity(request, "allow-public");
        }
        filterChain.doFilter(request, response);
    }
    
    // Helper method to get client IP (handle proxy headers)
    private String getClientIp(HttpServletRequest request) {
        // Check for X-Forwarded-For header (from proxy/load balancer)
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            String[] ips = xff.split(",");
            return ips[0].trim();
        }
        
        // Check for X-Real-IP header (from nginx)
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp.trim();
        }
        
        // Fallback to remote address
        return request.getRemoteAddr();
    }

    private String normalizeClientIp(String ip) {
        if (ip == null) {
            return "";
        }
        String normalized = ip.trim();
        if ("::1".equals(normalized) || "0:0:0:0:0:0:0:1".equals(normalized)) {
            return "127.0.0.1";
        }
        return normalized;
    }

    private String normalizeUserAgent(String ua) {
        if (ua == null) {
            return "";
        }
        return ua.trim();
    }

    private boolean userAgentMatches(String currentUa, String savedUa) {
        String current = normalizeUserAgent(currentUa);
        String saved = normalizeUserAgent(savedUa);
        if (current.isEmpty() || saved.isEmpty()) {
            return false;
        }
        return current.equals(saved);
    }

    private void sendJsonError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        ObjectMapper mapper = new ObjectMapper();
        String body = mapper.writeValueAsString(Map.of(
            "success", false,
            "code", status,
            "message", message
        ));
        response.getWriter().write(body);
    }

    private boolean isApiRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String host = request.getHeader("Host");
        return (host != null && host.startsWith("api.")) || uri.startsWith("/api/");
    }

    private boolean isGetTableDataRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return "/api/get-table-data".equals(uri) || "/get-table-data".equals(uri);
    }

    private void logGetTableDataSecurity(HttpServletRequest request, String stage) {
        if (!isGetTableDataRequest(request)) {
            return;
        }
        LOGGER.info("[GET_TABLE_DATA][JWT] stage={}, clientId={}, hasCsmToken={}, hasAuthorization={}, hasRefreshHeader={}, hasRefreshCookie={}, referer={}, origin={}",
                stage,
                request.getHeader(CLIENT_ID_HEADER),
                request.getHeader("csm-token") != null && !request.getHeader("csm-token").isBlank(),
                request.getHeader("Authorization") != null && !request.getHeader("Authorization").isBlank(),
                request.getHeader("X-Refresh-Token") != null && !request.getHeader("X-Refresh-Token").isBlank(),
                hasRefreshCookie(request),
                request.getHeader("Referer"),
                request.getHeader("Origin"));
    }

    private boolean hasRefreshCookie(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return false;
        }
        for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
            if ("refreshToken".equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank()) {
                return true;
            }
        }
        return false;
    }

    private boolean requiresAuth(HttpServletRequest request) {
        String uri = request.getRequestURI();
        // Normalize uri (bỏ dấu / ở cuối nếu có)
        if (uri.endsWith("/")) uri = uri.substring(0, uri.length() - 1);
        
        // Chỉ các endpoint auth thực sự public, không cần đăng nhập
        if (uri.equals("/api/login") || uri.equals("/login") ||
            uri.equals("/api/refresh-token") || uri.equals("/refresh-token") ||
            uri.equals("/api/register") || uri.equals("/register") ||
            uri.equals("/api/create-default-data") || uri.equals("/create-default-data")) {
            return false;
        }
        
        // Monitoring endpoints - public, no auth required
        if (uri.startsWith("/api/monitoring/")) {
            return false;
        }
        
        // Chat endpoints - không cần authentication
        // Guest: /chat-history-guest (load chat riêng guest)
        // Admin: /chat-history (load chat theo room), /chat-history-app (load all chats), /chat-guests-list (danh sách guests)
        // Mark read: /chat-mark-read (guests & admin đều dùng)
        if (uri.equals("/api/chat-history") || uri.equals("/chat-history") ||
            uri.equals("/api/chat-history-guest") || uri.equals("/chat-history-guest") ||
            uri.equals("/api/chat-history-app") || uri.equals("/chat-history-app") ||
            uri.equals("/api/chat-guests-list") || uri.equals("/chat-guests-list") ||
            uri.equals("/api/chat-mark-read") || uri.equals("/chat-mark-read") ||
            uri.equals("/api/chat-mark-all-read") || uri.equals("/chat-mark-all-read")) {
            return false;
        }
        
        // Tất cả API endpoints khác đều cần authentication
        return true;
    }

    private boolean setAuthenticationFromToken(String token) {
        try {
            String subject = jwtUtil.getUsernameFromToken(token);
            if (subject == null || subject.isBlank()) {
                return false;
            }
            String tokenUserId = jwtUtil.getUserIdFromToken(token);
            int tokenVersion = jwtUtil.getLoginVersionFromToken(token);
            net.phanmemmottrieu.model.User user = null;
            if (tokenUserId != null && !tokenUserId.isBlank()) {
                user = userService.findUserById(tokenUserId).orElse(null);
            }
            if (user == null) {
                user = userService.findUserById(subject).orElseGet(() ->
                    userService.findUserByEmail(subject)
                        .or(() -> userService.findUserByUsername(subject))
                        .or(() -> userService.findUserByPhoneNumber(subject))
                        .or(() -> userService.findUserByAppToken(subject))
                        .orElse(null)
                );
            }
            if (user == null) {
                return false;
            }

            String appToken = user.getAppToken();
            boolean subjectMatchesUser =
                (appToken != null && subject.equals(appToken)) ||
                (user.getId() != null && subject.equals(user.getId())) ||
                (user.getEmail() != null && subject.equals(user.getEmail())) ||
                (user.getUsername() != null && subject.equals(user.getUsername())) ||
                (user.getPhoneNumber() != null && subject.equals(user.getPhoneNumber()));
            if (!subjectMatchesUser) {
                LOGGER.warn("[JWT] Subject mismatch, reject token subject={} resolvedUserId={} resolvedUsername={}",
                    subject, user.getId(), user.getUsername());
                return false;
            }

            // CRITICAL FIX: findUserById may return a stale record (old refresh-token-keyed record)
            // with an outdated loginVersion. Re-fetch by app_token (direct key lookup) to get
            // the authoritative, always-fresh record with the correct loginVersion.
            if (appToken != null && !appToken.isBlank()) {
                net.phanmemmottrieu.model.User freshUser = userService.findUserByAppToken(appToken).orElse(null);
                if (freshUser != null) {
                    user = freshUser;
                }
            }
            int currentVersion = user.getLoginVersion() != null ? user.getLoginVersion() : 0;
            // Strict single-session: any version mismatch must be rejected.
            if (currentVersion > 0 && tokenVersion != currentVersion) {
                LOGGER.warn("[JWT] Version mismatch for user {}: token ver={}, DB ver={}", subject, tokenVersion, currentVersion);
                return false;
            }
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                    user, null, java.util.Collections.emptyList()
                )
            );
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
