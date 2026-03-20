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
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            if (!jwtUtil.validateToken(token)) {
                sendJsonError(response, 401, "Invalid or expired JWT token");
                return;
            }
            if (!setAuthenticationFromToken(token)) {
                sendJsonError(response, 401, "Invalid or expired JWT token");
                return;
            }
            filterChain.doFilter(request, response);
            return;
        }

        String csmToken = request.getHeader("csm-token");
        if (csmToken != null && !csmToken.isBlank()) {
            if (!jwtUtil.validateToken(csmToken)) {
                sendJsonError(response, 401, "Invalid or expired JWT token");
                return;
            }
            if (!setAuthenticationFromToken(csmToken)) {
                sendJsonError(response, 401, "Invalid or expired JWT token");
                return;
            }
            filterChain.doFilter(request, response);
            return;
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
                String currentIp = getClientIp(request);
                String currentUa = request.getHeader("User-Agent");
                
                // Check if IP and UA match the ones stored when token was created
                boolean ipMatch = user.getRefreshTokenIp() != null && user.getRefreshTokenIp().equals(currentIp);
                boolean uaMatch = user.getRefreshTokenUa() != null && user.getRefreshTokenUa().equals(currentUa);
                
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
                    filterChain.doFilter(request, response);
                    return;
                } else {
                    // Invalid refreshToken: clear it from DB
                    try {
                        java.util.Map<String, Object> updateFields = new java.util.HashMap<>();
                        updateFields.put("refresh_token", null);
                        updateFields.put("refresh_token_ip", null);
                        updateFields.put("refresh_token_ua", null);
                        updateFields.put("refresh_token_expiry", null);
                        
                        userService.updateUserFieldById(user.getId(), updateFields);
                    } catch (Exception e) {
                        // Log but don't fail
                    }
                    
                    // IMPORTANT: For public endpoints (login, register), don't reject immediately
                    // Let the request continue so user can login again with new credentials
                    if (!requiresAuth(request)) {
                        // Clear the invalid token and let request proceed
                        filterChain.doFilter(request, response);
                        return;
                    }
                    
                    // For protected endpoints, reject with 401
                    sendJsonError(response, 401, "Invalid or expired refresh token");
                    return;
                }
            }
        }


        if (requiresAuth(request)) {
            sendJsonError(response, 401, "Missing Authorization header");
            return;
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
            int tokenVersion = jwtUtil.getLoginVersionFromToken(token);
            net.phanmemmottrieu.model.User user = userService.findUserById(subject).orElseGet(() ->
                userService.findUserByEmail(subject)
                    .or(() -> userService.findUserByUsername(subject))
                    .or(() -> userService.findUserByPhoneNumber(subject))
                    .orElse(null)
            );
            if (user == null) {
                return false;
            }
            // CRITICAL FIX: findUserById may return a stale record (old refresh-token-keyed record)
            // with an outdated loginVersion. Re-fetch by app_token (direct key lookup) to get
            // the authoritative, always-fresh record with the correct loginVersion.
            String appToken = user.getAppToken();
            if (appToken != null && !appToken.isBlank()) {
                net.phanmemmottrieu.model.User freshUser = userService.findUserByAppToken(appToken).orElse(null);
                if (freshUser != null) {
                    user = freshUser;
                }
            }
            int currentVersion = user.getLoginVersion() != null ? user.getLoginVersion() : 0;
            // Legacy compatibility: chỉ enforce khi DB có login version hợp lệ (>0)
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
