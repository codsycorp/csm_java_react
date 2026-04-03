package net.phanmemmottrieu.handler;

import java.util.*;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.model.User; // Import User model
import net.phanmemmottrieu.service.UserService; // Import UserService
import net.phanmemmottrieu.model.RegistrationRequest; // Import RegistrationRequest
import net.phanmemmottrieu.model.RegistrationResponse; // Import RegistrationResponse
import net.phanmemmottrieu.util.PermissionBitfieldUtil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class AuthHandler {
    private static final Logger logger = LoggerFactory.getLogger(AuthHandler.class);
    private final RecordManager recordManager;
    private final UserService userService; // Thêm UserService
    private final net.phanmemmottrieu.security.JwtUtil jwtUtil;

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

    @Autowired
    public AuthHandler(RecordManager recordManager, UserService userService, net.phanmemmottrieu.security.JwtUtil jwtUtil) {
        this.recordManager = recordManager;
        this.userService = userService; // Tiêm UserService vào
        this.jwtUtil = jwtUtil;
    }

    public void handleUserInfo(StandardResponse response, Map<String, Object> params) {
        // Lấy user từ session (Spring Security)
        org.springframework.security.core.Authentication authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        // principal có thể là UserDetails hoặc Map tuỳ custom
        Object principal = authentication.getPrincipal();
        Map<String, Object> userInfo = null;

        // Luôn cố lấy dữ liệu mới nhất từ DB để tránh stale profile sau khi update.
        Optional<User> freshUserOpt = Optional.empty();
        if (principal instanceof net.phanmemmottrieu.model.User) {
            net.phanmemmottrieu.model.User principalUser = (net.phanmemmottrieu.model.User) principal;
            if (principalUser.getId() != null && !principalUser.getId().isBlank()) {
                freshUserOpt = userService.findUserById(principalUser.getId());
            }
            String appToken = principalUser.getAppToken();
            if (appToken != null && !appToken.isBlank()) {
                Optional<User> byAppToken = userService.findUserByAppToken(appToken);
                if (byAppToken.isPresent()) {
                    freshUserOpt = byAppToken;
                }
            }
        } else if (principal instanceof java.util.Map<?, ?> principalMap) {
            Object principalUserIdObj = principalMap.containsKey("userId") ? principalMap.get("userId") : null;
            String principalUserId = principalUserIdObj == null ? "" : String.valueOf(principalUserIdObj).trim();
            if (principalUserId.isEmpty()) {
                Object idObj = principalMap.containsKey("id") ? principalMap.get("id") : null;
                principalUserId = idObj == null ? "" : String.valueOf(idObj).trim();
            }
            if (!principalUserId.isEmpty()) {
                freshUserOpt = userService.findUserById(principalUserId);
            }

            Object appTokenObj = principalMap.containsKey("app_token") ? principalMap.get("app_token") : null;
            String appToken = appTokenObj == null ? "" : String.valueOf(appTokenObj).trim();
            if (!appToken.isEmpty()) {
                Optional<User> byAppToken = userService.findUserByAppToken(appToken);
                if (byAppToken.isPresent()) {
                    freshUserOpt = byAppToken;
                }
            }
        }

        if (freshUserOpt.isPresent()) {
            userInfo = toUserInfoMap(freshUserOpt.get());
        }

        if (userInfo == null) {
        if (principal instanceof java.util.Map) {
            userInfo = (Map<String, Object>) principal;
        } else if (principal instanceof net.phanmemmottrieu.model.User) {
            net.phanmemmottrieu.model.User u = (net.phanmemmottrieu.model.User) principal;
            userInfo = toUserInfoMap(u);
        } else if (principal instanceof org.springframework.security.core.userdetails.UserDetails) {
            // Nếu dùng UserDetails, chỉ trả về username
            userInfo = new java.util.HashMap<>();
            userInfo.put("username", ((org.springframework.security.core.userdetails.UserDetails) principal).getUsername());
        } else {
            // Nếu là custom object, trả về toString
            userInfo = new java.util.HashMap<>();
            userInfo.put("principal", principal.toString());
        }
        }
        response.set("code", 200);
        enrichUserInfoWithBitfield(userInfo);
        response.set("result", userInfo);
        response.set("message", "ok");
        response.set("success", true);
    }

    private Map<String, Object> toUserInfoMap(net.phanmemmottrieu.model.User u) {
        Map<String, Object> userInfo = new java.util.HashMap<>();
        userInfo.put("userId", u.getId());
        userInfo.put("username", u.getUsername());
        userInfo.put("email", u.getEmail());
        userInfo.put("phoneNumber", u.getPhoneNumber());
        userInfo.put("full_name", u.getFullName());
        userInfo.put("avatar", u.getAvatar());
        userInfo.put("roles", u.getPermissions()); // dùng permissions như roles
        userInfo.put("permissions", u.getPermissions());
        userInfo.put("menusPermissions", u.getMenusPermissions());
        userInfo.put("permissionBitfield", u.getPermissionBitfield());
        userInfo.put("permissionSchemaVersion", u.getPermissionSchemaVersion());
        userInfo.put("dataScope", u.getDataScope());
        userInfo.put("dept_id", u.getDeptId());
        userInfo.put("branch_id", u.getBranchId());
        userInfo.put("app_id", u.getAppId());
        userInfo.put("app_token", u.getAppToken());
        userInfo.put("dev", u.getDev());
        return userInfo;
    }

    public void handleLogin(StandardResponse response, Map<String, Object> params) {
        String username = (String) params.get("username");
        String email = (String) params.get("email"); 
        String phone = (String) params.get("phone"); 
        String password = (String) params.get("password");

        String loginIdentifier = null;

        if (email != null && !email.isEmpty()) {
            loginIdentifier = email;
        } else if (username != null && !username.isEmpty()) {
            loginIdentifier = username;
        } else if (phone != null && !phone.isEmpty()) {
            loginIdentifier = phone;
        }

        if (loginIdentifier == null || loginIdentifier.isEmpty() || password == null || password.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Vui lòng cung cấp Email, Tên đăng nhập hoặc Số điện thoại và Mật khẩu.");
            response.set("success", false);
            return;
        }

        Optional<User> authenticatedUser = userService.findUserByLoginIdentifierAndPassword(loginIdentifier, password);

        if (authenticatedUser.isPresent()) {
            User user = authenticatedUser.get();
            logger.info("[LOGIN] User authenticated: username={}, email={}, app_id={}", user.getUsername(), user.getEmail(), user.getAppId());
            
            // Giải mã appToken để extract accessRight và xác định dev privilege
            boolean isDev = false;
            try {
                String decryptedToken = recordManager.csm_decrypt(user.getAppToken());
                String[] parts = decryptedToken.split("_____");
                if (parts.length > 0) {
                    String accessRightStr = parts[parts.length - 1];
                    try {
                        int accessRight = Integer.parseInt(accessRightStr);
                        isDev = accessRight > 0;
                    } catch (NumberFormatException e) {
                        logger.warn("[LOGIN] Không thể parse accessRight từ appToken: {}", accessRightStr);
                    }
                }
            } catch (Exception e) {
                logger.warn("[LOGIN] Lỗi giải mã appToken để lấy accessRight: {}", e.getMessage());
            }
            user.setDev(isDev);
            
            int nextLoginVersion = user.getLoginVersion() != null ? user.getLoginVersion() + 1 : 1;

            // Sinh refresh token ngẫu nhiên
            String refreshToken = UUID.randomUUID().toString() + UUID.randomUUID().toString();
            String ip = normalizeClientIp(params.getOrDefault("_client_ip", "").toString());
            String ua = normalizeUserAgent(params.getOrDefault("_user_agent", "").toString());
            long expiry = System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L; // 7 ngày

            // Lưu refresh token vào DB
            userService.updateSessionToken(user, refreshToken, ip, ua, expiry, nextLoginVersion);
            // Log xác nhận lưu refresh_token
            logger.info("[LOGIN] Saved refreshToken for user {}={} (refreshToken={}, ip={}, ua={})", 
                       "id", user.getId(), refreshToken.substring(0, Math.min(10, refreshToken.length())) + "...", ip, ua);

            // Chuẩn bị dữ liệu trả về: token + routes + quyền
            Map<String, Object> result = new HashMap<>();
            String tokenSubject = user.getId();
            if (user.getAppToken() != null && !user.getAppToken().isBlank()) {
                tokenSubject = user.getAppToken();
            }
            String jwtToken = jwtUtil.generateToken(tokenSubject, user.getId(), nextLoginVersion);
            result.put("token", jwtToken);
            result.put("app_token", user.getAppToken());
            result.put("app_id", user.getAppId());
            result.put("refreshToken", refreshToken);
            result.put("dev", user.getDev()); // Thêm dev flag
            result.put("userId", user.getId());
            result.put("username", user.getUsername());
            result.put("email", user.getEmail());
            result.put("phoneNumber", user.getPhoneNumber());
            result.put("full_name", user.getFullName());
            result.put("avatar", user.getAvatar());

            // Tính toán danh sách route động theo quyền/người dùng
            try {
                String userRole = null;
                List<String> roles = user.getPermissions();
                if (roles != null && !roles.isEmpty()) {
                    userRole = roles.get(0);
                }
                List<String> menusPermissions = user.getMenusPermissions();

                SearchFilter indexFilter = new SearchFilter();
                indexFilter.setField("id");
                indexFilter.setType("eq");
                indexFilter.setValue("accessRights");

                Map<String, Object> index = recordManager.find("csm", "index", indexFilter);
                if (index != null && index.containsKey("data")) {
                    List<Map<String, Object>> routes = (List<Map<String, Object>>) index.get("data");
                    List<Map<String, Object>> filteredRoutes = filterRoutesByRoleAndMenus(
                        routes,
                        userRole,
                        menusPermissions != null ? menusPermissions : Collections.emptyList(),
                        user.getDev() != null ? user.getDev() : false,
                        new HashSet<>()
                    );
                    result.put("asyncRoutes", filteredRoutes);
                } else {
                    logger.warn("[LOGIN] Route configuration not found (index:accessRights)");
                }

                // Trả về quyền để FE dùng trực tiếp
                result.put("permissions", user.getPermissions());
                result.put("menusPermissions", user.getMenusPermissions());
                long permissionBitfield = PermissionBitfieldUtil.buildBitfield(user.getPermissions(), user.getMenusPermissions(), user.getDev());
                result.put("permissionBitfield", String.valueOf(permissionBitfield));
                result.put("permissionSchemaVersion", "v2");
                result.put("dataScope", PermissionBitfieldUtil.resolveDataScope(permissionBitfield));
            } catch (Exception ex) {
                logger.error("[LOGIN] Lỗi khi tính asyncRoutes/permissions: {}", ex.getMessage(), ex);
            }
            response.set("code", 200);
            response.set("result", result);
            
            // Phát hiện localhost hoặc node-webkit
            boolean isLocalhost = false;
            String origin = params.getOrDefault("_origin", "").toString();
            String referer = params.getOrDefault("_referer", "").toString();
            String userAgent = params.getOrDefault("_user_agent", "").toString();
            String host = params.getOrDefault("_host", "").toString();
            
            // Kiểm tra origin, referer, host cho localhost
            if (origin.contains("localhost") || origin.contains("127.0.0.1") ||
                referer.contains("localhost") || referer.contains("127.0.0.1") ||
                host.equals("localhost") || host.equals("127.0.0.1")) {
                isLocalhost = true;
            }
            
            // Kiểm tra node-webkit từ User-Agent
            boolean isNodeWebkit = userAgent.toLowerCase().contains("nwjs") || 
                                   userAgent.toLowerCase().contains("node-webkit");
            
            // Với node-webkit: chỉ coi như localhost nếu origin/referer là file/app/null
            if (isNodeWebkit) {
                String originLower = origin != null ? origin.toLowerCase() : "";
                String refererLower = referer != null ? referer.toLowerCase() : "";
                boolean isFileLike = "null".equals(originLower) || originLower.startsWith("file://") || originLower.startsWith("app://")
                                   || "null".equals(refererLower) || refererLower.startsWith("file://") || refererLower.startsWith("app://");
                if (isFileLike || isLocalhost) {
                    isLocalhost = true;
                    logger.info("[LOGIN] node-webkit (file/null/app) => dùng SameSite=Lax cho cookie");
                } else {
                    logger.info("[LOGIN] node-webkit (web origin) => dùng SameSite=None; Secure cho cookie");
                }
            }
            // --- Set cookie HTTP thực sự ---
            jakarta.servlet.http.HttpServletResponse servletResponse = (jakarta.servlet.http.HttpServletResponse) params.get("_servlet_response");
            if (servletResponse != null) {
                                // Xóa cookie CSRF-TOKEN cũ với domain nếu host là domain hợp lệ (không phải localhost, không phải IP)
                                if (host != null && !host.isEmpty()) {
                                    String hostLower = host.toLowerCase();
                                    boolean isLocal = hostLower.equals("localhost") || hostLower.equals("127.0.0.1") || hostLower.matches("^\\d+\\.\\d+\\.\\d+\\.\\d+$");
                                    if (!isLocal && hostLower.contains(".")) {
                                        String domain1 = hostLower.startsWith(".") ? hostLower : "." + hostLower;
                                        String domain2 = hostLower;
                                        // Xóa mọi biến thể domain và thuộc tính
                                        String[] domains = {domain1, domain2};
                                        String[] samesites = {"", "SameSite=None;", "SameSite=Lax;"};
                                        boolean[] secures = {false, true};
                                        for (String d : domains) {
                                            for (String ss : samesites) {
                                                for (boolean sec : secures) {
                                                    StringBuilder delCsrf = new StringBuilder();
                                                    delCsrf.append("CSRF-TOKEN=;")
                                                        .append(" Path=/;")
                                                        .append(" Domain=").append(d).append(";")
                                                        .append(" Max-Age=0;")
                                                        .append(" Expires=Thu, 01 Jan 1970 00:00:00 GMT;");
                                                    if (!ss.isEmpty()) delCsrf.append(" ").append(ss);
                                                    if (sec && !isLocalhost) delCsrf.append(" Secure;");
                                                    servletResponse.addHeader("Set-Cookie", delCsrf.toString());
                                                }
                                            }
                                        }
                                    }
                                }
                // Set refreshToken với SameSite theo cross-site
                StringBuilder refreshHeader = new StringBuilder();
                refreshHeader.append("refreshToken=").append(refreshToken)
                    .append("; Path=/; HttpOnly; Max-Age=").append(7 * 24 * 60 * 60);

                // Phân biệt cross-site theo origin host vs server host
                boolean isCrossSite = false;
                try {
                    java.net.URI originUri = origin != null ? java.net.URI.create(origin) : null;
                    String originHost = originUri != null ? originUri.getHost() : null;
                    String serverHost = host != null ? host : null;
                    isCrossSite = originHost != null && serverHost != null && !originHost.equalsIgnoreCase(serverHost);
                } catch (Exception ignore) {}

                // Cross-site: SameSite=None; Secure, else Lax
                if (isCrossSite) {
                    refreshHeader.append("; Secure; SameSite=None");
                } else {
                    refreshHeader.append("; SameSite=Lax");
                }
                // Thêm Expires cho refreshToken
                java.time.ZonedDateTime expiresAt = java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).plusDays(7);
                String expiresStr = java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.format(expiresAt);
                refreshHeader.append("; Expires=").append(expiresStr);
                servletResponse.addHeader("Set-Cookie", refreshHeader.toString());

                // Set CSRF-TOKEN cookie để FE có token ngay sau login
                String csrfToken = UUID.randomUUID().toString();
                StringBuilder csrfHeader = new StringBuilder();
                csrfHeader.append("CSRF-TOKEN=").append(csrfToken)
                    .append("; Path=/");
                
                // Cross-site: SameSite=None; Secure, else Lax
                if (isCrossSite) {
                    csrfHeader.append("; SameSite=None; Secure");
                } else {
                    csrfHeader.append("; SameSite=Lax");
                }
                servletResponse.addHeader("Set-Cookie", csrfHeader.toString());
                
                // Trả csrfToken trong response body để FE lưu vào store
                result.put("csrfToken", csrfToken);
                logger.info("[LOGIN] Set CSRF token: {}", csrfToken);
                
                response.set("result", result);
                response.set("code", 200);
                response.set("message", "ok");
                response.set("success", true);
                return;
            }
            // --- End set cookie HTTP ---
            response.set("message", "ok");
            response.set("success", true);
        } else {
            response.set("code", 401);
            response.set("message", "Định danh hoặc mật khẩu không hợp lệ");
            response.set("success", false);
        }
    }

    private void enrichUserInfoWithBitfield(Map<String, Object> userInfo) {
        if (userInfo == null) {
            return;
        }

        List<String> permissions = toStringList(userInfo.get("permissions"));
        List<String> menusPermissions = toStringList(userInfo.get("menusPermissions"));
        Boolean devFlag = parseBoolean(userInfo.get("dev"));

        long permissionBitfield = PermissionBitfieldUtil.buildBitfield(permissions, menusPermissions, devFlag);
        userInfo.put("permissionBitfield", String.valueOf(permissionBitfield));
        userInfo.put("permissionSchemaVersion", "v2");
        userInfo.put("dataScope", PermissionBitfieldUtil.resolveDataScope(permissionBitfield));
    }

    private List<String> toStringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return Collections.emptyList();
        }
        return list.stream().map(item -> item == null ? "" : String.valueOf(item)).collect(Collectors.toList());
    }

    private Boolean parseBoolean(Object raw) {
        if (raw instanceof Boolean) {
            return (Boolean) raw;
        }
        if (raw instanceof Number) {
            return ((Number) raw).intValue() != 0;
        }
        if (raw instanceof String) {
            String value = ((String) raw).trim().toLowerCase(Locale.ROOT);
            return "true".equals(value) || "1".equals(value) || "yes".equals(value) || "y".equals(value) || "on".equals(value);
        }
        return Boolean.FALSE;
    }

    public void handleLogout(StandardResponse response, Map<String, Object> params) {
        org.springframework.security.core.Authentication authentication = null;
        try {
            authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        } catch (Exception ignore) {}

        // 1. Clear Spring Security context
        try {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        } catch (Exception e) {
            logger.warn("[LOGOUT] Failed to clear SecurityContext: {}", e.getMessage());
        }
        
        // 2. Invalidate refreshToken in database
        try {
            if (authentication != null && authentication.getPrincipal() instanceof User) {
                User user = (User) authentication.getPrincipal();
                userService.clearSessionToken(user);
                logger.info("[LOGOUT] Invalidated refreshToken for user id={}", user.getId());
            }
        } catch (Exception e) {
            logger.warn("[LOGOUT] Failed to invalidate refreshToken: {}", e.getMessage());
        }
        
        response.set("code", 200);
        response.set("message", "ok");
        response.set("result", new HashMap<>());
        response.set("success", true);
    }

    public void handleRefreshToken(StandardResponse response, Map<String, Object> params) {
        // Chỉ nhận refresh token từ cookie (giả định đã được truyền vào params)
        String refreshToken = (String) params.get("refreshToken");
        String ip = normalizeClientIp(params.getOrDefault("_client_ip", "").toString());
        String ua = normalizeUserAgent(params.getOrDefault("_user_agent", "").toString());
        if (refreshToken == null || refreshToken.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing refresh token");
            response.set("success", false);
            return;
        }
        // Tìm user theo refresh token
        User user = userService.findUserByRefreshToken(refreshToken);
        if (user == null) {
            response.set("code", 401);
            response.set("message", "Refresh token không hợp lệ");
            response.set("success", false);
            return;
        }
        // Kiểm tra IP, User-Agent, expiry
        if (!ip.equals(normalizeClientIp(user.getRefreshTokenIp())) || !userAgentMatches(ua, user.getRefreshTokenUa())) {
            response.set("code", 401);
            response.set("message", "Refresh token không hợp lệ (IP/UA)");
            response.set("success", false);
            return;
        }
        if (user.getRefreshTokenExpiry() == null || user.getRefreshTokenExpiry() < System.currentTimeMillis()) {
            response.set("code", 401);
            response.set("message", "Refresh token đã hết hạn");
            response.set("success", false);
            return;
        }
        int loginVersion = user.getLoginVersion() != null ? user.getLoginVersion() : 0;
        // Sinh access token mới và refresh token mới
        String newRefreshToken = UUID.randomUUID().toString() + UUID.randomUUID().toString();
        long newExpiry = System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L;
        userService.updateSessionToken(user, newRefreshToken, ip, ua, newExpiry, loginVersion);
        logger.info("[REFRESH] Đã lưu refresh_token {} cho user id={} (ip={}, ua={})", newRefreshToken, user.getId(), ip, ua);

        String tokenSubject = user.getId();
        if (user.getAppToken() != null && !user.getAppToken().isBlank()) {
            tokenSubject = user.getAppToken();
        }
        String jwtToken = jwtUtil.generateToken(tokenSubject, user.getId(), loginVersion);
        response.set("code", 200);
        Map<String, Object> result = new HashMap<>();
        result.put("token", jwtToken);
        result.put("refreshToken", newRefreshToken);
        result.put("app_token", user.getAppToken());
        
        // Phát hiện localhost hoặc node-webkit
        boolean isLocalhost = false;
        String origin = params.getOrDefault("_origin", "").toString();
        String referer = params.getOrDefault("_referer", "").toString();
        String userAgent = params.getOrDefault("_user_agent", "").toString();
        String host = params.getOrDefault("_host", "").toString();
        
        // Kiểm tra origin, referer, host cho localhost
        if (origin.contains("localhost") || origin.contains("127.0.0.1") ||
            referer.contains("localhost") || referer.contains("127.0.0.1") ||
            host.equals("localhost") || host.equals("127.0.0.1")) {
            isLocalhost = true;
        }
        
        // Kiểm tra node-webkit từ User-Agent
        boolean isNodeWebkit = userAgent.toLowerCase().contains("nwjs") || 
                               userAgent.toLowerCase().contains("node-webkit");
        
        // Với node-webkit: chỉ coi như localhost nếu origin/referer là file/app/null
        if (isNodeWebkit) {
            String originLower = origin != null ? origin.toLowerCase() : "";
            String refererLower = referer != null ? referer.toLowerCase() : "";
            boolean isFileLike = "null".equals(originLower) || originLower.startsWith("file://") || originLower.startsWith("app://")
                               || "null".equals(refererLower) || refererLower.startsWith("file://") || refererLower.startsWith("app://");
            if (isFileLike || isLocalhost) {
                isLocalhost = true;
                logger.info("[REFRESH] node-webkit (file/null/app) => dùng SameSite=Lax cho cookie");
            } else {
                logger.info("[REFRESH] node-webkit (web origin) => dùng SameSite=None; Secure cho cookie");
            }
        }
        
        // Set cookie với SameSite phù hợp
        jakarta.servlet.http.HttpServletResponse servletResponse = (jakarta.servlet.http.HttpServletResponse) params.get("_servlet_response");
        if (servletResponse != null) {
            StringBuilder refreshHeader = new StringBuilder();
            refreshHeader.append("refreshToken=").append(newRefreshToken)
                .append("; Path=/; HttpOnly; Max-Age=").append(7 * 24 * 60 * 60);

            // Phân biệt cross-site theo origin host vs server host
            boolean isCrossSite = false;
            try {
                java.net.URI originUri = origin != null ? java.net.URI.create(origin) : null;
                String originHost = originUri != null ? originUri.getHost() : null;
                String serverHost = host != null ? host : null;
                isCrossSite = originHost != null && serverHost != null && !originHost.equalsIgnoreCase(serverHost);
            } catch (Exception ignore) {}

            // Cross-site: SameSite=None; Secure, else Lax
            if (isCrossSite) {
                refreshHeader.append("; Secure; SameSite=None");
            } else {
                refreshHeader.append("; SameSite=Lax");
            }

            // Thêm Expires cho refreshToken
            java.time.ZonedDateTime expiresAt = java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).plusDays(7);
            String expiresStr = java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.format(expiresAt);
            refreshHeader.append("; Expires=").append(expiresStr);
            servletResponse.addHeader("Set-Cookie", refreshHeader.toString());

            // Đồng bộ CSRF token mới sau khi refresh để tránh 403 ở request POST đầu tiên sau restart.
            String csrfToken = UUID.randomUUID().toString();
            StringBuilder csrfHeader = new StringBuilder();
            csrfHeader.append("CSRF-TOKEN=").append(csrfToken)
                .append("; Path=/");

            if (isCrossSite) {
                csrfHeader.append("; SameSite=None; Secure");
            } else {
                csrfHeader.append("; SameSite=Lax");
            }
            servletResponse.addHeader("Set-Cookie", csrfHeader.toString());
            result.put("csrfToken", csrfToken);
        }
        response.set("result", result);
        
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleGetAsyncRoutes(StandardResponse response, Map<String, Object> params) {
        // Try token from params first
        String token = (String) params.get("csm-token");

        // Fallback: derive token from authenticated principal (set by JwtAuthenticationFilter via refreshToken cookie)
        User authenticatedUser = null;
        if (token == null || token.isEmpty()) {
            org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getPrincipal() != null &&
                !("anonymousUser".equals(auth.getPrincipal()))) {
                Object principal = auth.getPrincipal();
                if (principal instanceof net.phanmemmottrieu.model.User) {
                    authenticatedUser = (net.phanmemmottrieu.model.User) principal;
                    token = authenticatedUser.getAppToken();
                } else if (principal instanceof java.util.Map) {
                    token = (String) ((java.util.Map<?, ?>) principal).get("app_token");
                }
            }
        }

        if (token == null || token.isEmpty()) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        // Try to resolve role and permissions from authenticated principal first
        String userRole = null;
        List<String> roles = null;
        List<String> permissions = null;
        List<String> menusPermissions = null;
                Boolean isDev = false;
                
                org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
                if (auth != null && auth.isAuthenticated() && auth.getPrincipal() != null && !("anonymousUser".equals(auth.getPrincipal()))) {
                    Object principal = auth.getPrincipal();
                    if (principal instanceof net.phanmemmottrieu.model.User) {
                        User user = (net.phanmemmottrieu.model.User) principal;
                        permissions = user.getPermissions();
                        menusPermissions = user.getMenusPermissions();
                        roles = permissions;
                        isDev = user.getDev() != null ? user.getDev() : false;
                    } else if (principal instanceof java.util.Map) {
                        Object r = ((java.util.Map<?, ?>) principal).get("roles");
                        if (r instanceof java.util.List<?>) {
                            roles = (java.util.List<String>) r;
                        }
                        Object p = ((java.util.Map<?, ?>) principal).get("permissions");
                        if (permissions == null && p instanceof java.util.List<?>) {
                            permissions = (java.util.List<String>) p;
                        }
                        Object mp = ((java.util.Map<?, ?>) principal).get("menusPermissions");
                        if (mp instanceof java.util.List<?>) {
                            menusPermissions = (java.util.List<String>) mp;
                        }
                        Object devObj = ((java.util.Map<?, ?>) principal).get("dev");
                        if (devObj instanceof Boolean) {
                            isDev = (Boolean) devObj;
                        }
                    }
                }

        if (roles == null || roles.isEmpty() || menusPermissions == null) {
            SearchFilter userFilter = new SearchFilter();
            userFilter.setField("app_token");
            userFilter.setType("eq");
            userFilter.setValue(token);

            Map<String, Object> userRecord = recordManager.find("csm", "csm_accounts", userFilter);
            if (userRecord != null) {
                if (roles == null) {
                    roles = (List<String>) userRecord.get("roles");
                }
                if (permissions == null) {
                    Object p = userRecord.get("permissions");
                    if (p instanceof java.util.List<?>) {
                        permissions = (java.util.List<String>) p;
                    }
                }
                if (menusPermissions == null) {
                    Object mp = userRecord.get("menusPermissions");
                    if (mp instanceof java.util.List<?>) {
                        menusPermissions = (java.util.List<String>) mp;
                    }
                }
            }
        }

        // Fallback: use permissions as roles if roles missing
        if ((roles == null || roles.isEmpty()) && permissions != null && !permissions.isEmpty()) {
            roles = permissions;
        }

        userRole = (roles != null && !roles.isEmpty()) ? roles.get(0) : null;

        // If still no role but the user is authenticated, return empty routes instead of 403
        if (userRole == null) {
            boolean authenticated = auth != null && auth.isAuthenticated() && auth.getPrincipal() != null && !("anonymousUser".equals(auth.getPrincipal()));
            if (authenticated) {
                response.set("code", 200);
                response.set("result", java.util.Collections.emptyList());
                response.set("message", "ok");
                response.set("success", true);
                return;
            }
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        SearchFilter indexFilter = new SearchFilter();
        indexFilter.setField("id");
        indexFilter.setType("eq");
        indexFilter.setValue("accessRights");

        Map<String, Object> index = recordManager.find("csm", "index", indexFilter);

        if (index == null || !index.containsKey("data")) {
            response.set("code", 500);
            response.set("message", "Route configuration data not found");
            response.set("success", false);
            return;
        }

        List<Map<String, Object>> routes = (List<Map<String, Object>>) index.get("data");
        
        // Filter routes by role, menu permissions, and dev privilege
        List<Map<String, Object>> filteredRoutes = filterRoutesByRoleAndMenus(
            routes, 
            userRole, 
            menusPermissions != null ? menusPermissions : Collections.emptyList(),
            isDev,
            new HashSet<>()
        );
        
        response.set("code", 200);
        response.set("result", filteredRoutes);
        response.set("message", "ok");
        response.set("success", true);
    }

    /**
     * Filter routes by user role, menu permissions, and dev privilege
     * Includes route if:
     * - For system routes: dev=true OR user has required role
     * - For other routes: user has required role OR route path matches allowed menus
     */
    private static List<Map<String, Object>> filterRoutesByRoleAndMenus(
            List<Map<String, Object>> routes, 
            String userRole, 
            List<String> allowedMenuPaths,
            Boolean isDev,
            Set<String> seenPaths) {
        
        if (routes == null) {
            return Collections.emptyList();
        }
        
        return routes.stream()
            .map(route -> {
                Map<String, Object> currentRoute = new HashMap<>(route); 
                String path = (String) currentRoute.get("path");
                
                if (path == null || seenPaths.contains(path)) {
                    return null;
                }
                seenPaths.add(path);

                // Process children recursively
                List<Map<String, Object>> children = (List<Map<String, Object>>) currentRoute.get("children");
                if (children != null) {
                    List<Map<String, Object>> filteredChildren = filterRoutesByRoleAndMenus(
                        children, 
                        userRole, 
                        allowedMenuPaths,
                        isDev,
                        seenPaths
                    );
                    currentRoute.put("children", filteredChildren);
                }

                // Check role-based access
                Map<String, Object> handle = (Map<String, Object>) currentRoute.get("handle");
                List<String> roles = handle != null ? (List<String>) handle.get("roles") : null;
                
                boolean hasRoleAccess = false;
                if (roles != null) {
                    hasRoleAccess = roles.contains(userRole);
                }
                
                // Check menu path access
                boolean hasMenuAccess = allowedMenuPaths.contains(path);
                
                // System/admin routes should ONLY rely on dev privilege or role access (not menu path access)
                boolean isSystemRoute = path != null && ("/system".equals(path) || path.startsWith("/system/"));

                // Admin users can access system routes except dev-only ones
                // Dev-only paths: /system/menu, /system/developer, /system/broadcast
                boolean isDevOnlySystemPath = path != null && (
                    path.equals("/system/menu") || path.startsWith("/system/menu/") ||
                    path.equals("/system/developer") || path.startsWith("/system/developer/") ||
                    path.equals("/system/broadcast") || path.startsWith("/system/broadcast/")
                );
                boolean isAdminSystemAccess = "admin".equals(userRole) && isSystemRoute && !isDevOnlySystemPath;

                // Include if (system route -> dev or role or admin-system or children) else (role or menu or children)
                boolean hasChildren = currentRoute.containsKey("children") && 
                                     !((List) currentRoute.get("children")).isEmpty();

                boolean include = isSystemRoute ? (isDev || hasRoleAccess || isAdminSystemAccess || hasChildren)
                                                 : (hasRoleAccess || hasMenuAccess || hasChildren);
                return include ? currentRoute : null;
            })
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }

    /**
     * Xử lý yêu cầu tạo tài khoản người dùng chính mới.
     * Ánh xạ từ Map<String, Object> params sang RegistrationRequest.
     *
     * @param response Đối tượng StandardResponse để thiết lập kết quả.
     * @param params Map chứa dữ liệu yêu cầu đăng ký (email, username, password, etc.).
     */
    public void handleRegisterUser(StandardResponse response, Map<String, Object> params)  {
        // Kiểm tra các trường bắt buộc cơ bản trước khi ánh xạ
        if (!params.containsKey("email") && !params.containsKey("username") && !params.containsKey("phoneNumber")) {
            response.set("code", 400);
            response.set("message", "Thiếu thông tin định danh (email, username, hoặc phoneNumber).");
            response.set("success", false);
            return;
        }
        if (!params.containsKey("password") || ((String) params.get("password")).isEmpty()) {
            response.set("code", 400);
            response.set("message", "Mật khẩu không được để trống.");
            response.set("success", false);
            return;
        }

        // Áp dụng ràng buộc chặt chẽ CHỈ cho tạo tài khoản mới
        try {
            String usernameVal = params.get("username") != null ? params.get("username").toString() : null;
            String passwordVal = params.get("password").toString();

            if (usernameVal != null && !usernameVal.isEmpty()) {
                // USERNAME_REGEXP = ^[\w-]{4,16}$
                if (!usernameVal.matches("^[\\w-]{4,16}$")) {
                    response.set("code", 400);
                    response.set("message", "Tên đăng nhập phải từ 4-16 ký tự và chỉ gồm chữ, số, gạch dưới hoặc gạch ngang.");
                    response.set("success", false);
                    return;
                }
            }

            // PASSWORD_RULES: 8-16 ký tự, có ít nhất 1 chữ thường và 1 số, cho phép \w và ~!@#$%^&*+.-
            if (!passwordVal.matches("^(?=.*[a-z])(?=.*\\d)[\\w~!@#$%^&*+.\\-]{8,16}$")) {
                response.set("code", 400);
                response.set("message", "Mật khẩu phải dài 8-16 ký tự, chứa ít nhất 1 chữ thường và 1 số.");
                response.set("success", false);
                return;
            }
        } catch (Exception ex) {
            logger.warn("[REGISTER] Lỗi khi kiểm tra ràng buộc đầu vào: {}", ex.getMessage());
        }

        try {
            // Ánh xạ Map<String, Object> params sang RegistrationRequest
            // Sử dụng ObjectMapper từ RecordManager nếu có hoặc tạo mới
            // Giả định recordManager có ObjectMapper hoặc bạn có thể inject riêng
            // Nếu không, bạn cần một ObjectMapper ở đây.
            // protected final ObjectMapper objectMapper = new ObjectMapper(); // Thêm vào AuthHandler nếu cần
            
            // Hiện tại chúng ta không có ObjectMapper trong AuthHandler, nên sẽ dùng cách thủ công.
            // Hoặc, bạn có thể truyền ObjectMapper từ ApiSpringController vào đây.
            // Để đơn giản, tôi sẽ giả định các trường cần thiết trong params.

            RegistrationRequest regRequest = new RegistrationRequest();
            regRequest.setEmail((String) params.get("email"));
            regRequest.setUsername((String) params.get("username"));
            regRequest.setPhoneNumber((String) params.get("phoneNumber"));
            regRequest.setPassword((String) params.get("password"));
            regRequest.setFullName((String) params.get("full_name"));
            regRequest.setUserAddress((String) params.get("user_address"));

            // Gọi phương thức đăng ký từ UserService
            RegistrationResponse regResponse = userService.registerUser(params);
            
            // Ánh xạ kết quả từ RegistrationResponse sang StandardResponse
            response.set("success", regResponse.isSuccess());
            response.set("message", regResponse.getMessage());
            if (regResponse.isSuccess()) {
                response.set("code", 200); // OK
                // Nếu RegistrationResponse có ID của người dùng đã tạo, bạn có thể thêm nó vào đây
                // response.set("userId", regResponse.getUserId()); 
            } else {
                response.set("code", 400); // Bad Request cho lỗi đăng ký
            }

        } catch (Exception e) {
            logger.error("Lỗi khi xử lý yêu cầu đăng ký người dùng: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Đã xảy ra lỗi nội bộ khi đăng ký: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Xử lý yêu cầu tạo tài khoản con mới.
     *
     * @param response Đối tượng StandardResponse để thiết lập kết quả.
     * @param params Map chứa thông tin tài khoản con (parent_account_id, login_identifier, raw_password, etc.).
     */
    public void handleCreateSubUser(StandardResponse response, Map<String, Object> params) {
        // Kiểm tra các trường bắt buộc cơ bản
        if (!params.containsKey("parent_account_id") ||
            !params.containsKey("login_identifier") ||
            !params.containsKey("raw_password")) {
            response.set("code", 400);
            response.set("message", "Thiếu thông tin bắt buộc: parent_account_id, login_identifier, hoặc raw_password.");
            response.set("success", false);
            return;
        }

        try {
            // params đã là Map<String, Object> phù hợp với yêu cầu của userService.createSubUser
            RegistrationResponse subUserRegResponse = userService.createSubUser(params);

            // Ánh xạ kết quả từ RegistrationResponse sang StandardResponse
            response.set("success", subUserRegResponse.isSuccess());
            response.set("message", subUserRegResponse.getMessage());
            if (subUserRegResponse.isSuccess()) {
                response.set("code", 201); // Created
                // Nếu RegistrationResponse từ createSubUser có trả về ID của tài khoản con, bạn có thể thêm nó vào đây
                // response.set("id", subUserRegResponse.getCreatedSubUserId());
            } else {
                response.set("code", 400); // Bad Request
            }

        } catch (Exception e) {
            logger.error("Lỗi khi xử lý yêu cầu tạo tài khoản con: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Đã xảy ra lỗi nội bộ khi tạo tài khoản con: " + e.getMessage());
            response.set("success", false);
        }
    }
}