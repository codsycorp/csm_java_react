package net.phanmemmottrieu.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// THAY ĐỔI DÒNG NÀY:
// import javax.servlet.http.HttpServletRequest; // BỎ DÒNG NÀY

// THÊM DÒNG NÀY ĐỂ SỬ DỤNG PHIÊN BẢN JAKARTA CỦA HttpServletRequest:
import jakarta.servlet.http.HttpServletRequest;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.handler.AuthHandler;
import net.phanmemmottrieu.handler.HomeHandler;
import net.phanmemmottrieu.handler.InitHandler;
import net.phanmemmottrieu.handler.MenuHandler;
import net.phanmemmottrieu.handler.RoleHandler;
import net.phanmemmottrieu.handler.SeoHandler;
import net.phanmemmottrieu.handler.TableHandler;
import net.phanmemmottrieu.handler.CRMHandler;
import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.service.AIProviderFactory;
import net.phanmemmottrieu.service.WebScraperService;
import net.phanmemmottrieu.service.GoogleIndexService;
import net.phanmemmottrieu.service.GoogleIndexQueueService;
import net.phanmemmottrieu.service.ChatPersistenceService;
import net.phanmemmottrieu.service.GitHubModelsService;
import net.phanmemmottrieu.service.XTwitterService;
import net.phanmemmottrieu.service.AiMenuMergeService;
import com.corundumstudio.socketio.SocketIOServer;
import net.phanmemmottrieu.model.UrlSubmissionQueue;
import net.phanmemmottrieu.model.UrlSubmissionHistory;

import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

@RestController
public class ApiSpringController {

    private static final Logger logger = LoggerFactory.getLogger(ApiSpringController.class);
    private static final int COPILOT_CURRENT_CODE_MAX_CHARS = 500000;
    private static final int COPILOT_CURRENT_CODE_HEAD_CHARS = 180000;
    private static final int COPILOT_CURRENT_CODE_TAIL_CHARS = 180000;
    private static final int COPILOT_CURRENT_CODE_FOCUS_WINDOW_CHARS = 120000;
    private static final int COPILOT_ATTACHMENT_TEXT_MAX_CHARS = 800000;
    private static final int COPILOT_CONTINUITY_MEMORY_MAX_CHARS = 120000;
    private static final int COPILOT_DEBUG_MARKDOWN_MAX_CHARS = 24000;
    private static final int COPILOT_DEBUG_MESSAGES_JSON_MAX_CHARS = 18000;
    private final ObjectMapper objectMapper = new ObjectMapper(); // Dùng để parse JSON body
    private final RecordManager recordManager;
    private final InitHandler initHandler;
    private final AuthHandler authHandler;
    private final RoleHandler roleHandler;
    private final MenuHandler menuHandler;
    private final HomeHandler homeHandler;
    private final TableHandler tableHandler;
    // private final AIHandler aiHandler;
    private final WebScraperService webScraperService;
    private final AIProviderFactory aiProviderFactory;
    private final GoogleIndexService googleIndexService;
    private final GoogleIndexQueueService googleIndexQueueService;
    private final ChatPersistenceService chatPersistenceService;
    private final GitHubModelsService gitHubModelsService;
    private final SocketIOServer socketIOServer;
    private final XTwitterService xTwitterService;
    private final CRMHandler crmHandler;
    private final AiMenuMergeService aiMenuMergeService;

    @Value("${ai.prompt.max-chars:3000000}")
    private int maxPromptChars;

    @Value("${ai.prompt.gemini-max-chars:500000}")
    private int geminiMaxPromptChars;

    @Value("${ai.routing.stability.prefer-github-for-coding:true}")
    private boolean preferGithubForCoding;

    @Value("${ai.routing.stability.force-copilot-for-coding:true}")
    private boolean forceCopilotForCoding;

    @Value("${ai.routing.stability.disable-fallback-for-coding:true}")
    private boolean disableFallbackForCoding;

    @Value("${ai.async.job-ttl-ms:3600000}")
    private long aiAsyncJobTtlMs;

    @Value("${ai.async.poll-min-ms:3000}")
    private long aiAsyncPollMinMs;

    private final ExecutorService aiAsyncExecutor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, Map<String, Object>> aiAsyncJobs = new ConcurrentHashMap<>();

    // Tiêm tất cả các Handler thông qua constructor
    @Autowired
    public ApiSpringController(
            RecordManager recordManager,
            InitHandler initHandler,
            AuthHandler authHandler,
            RoleHandler roleHandler,
            MenuHandler menuHandler,
            HomeHandler homeHandler,
            TableHandler tableHandler,
            WebScraperService webScraperService ,
            AIProviderFactory aiProviderFactory,
            GoogleIndexService googleIndexService,
            GoogleIndexQueueService googleIndexQueueService,
            ChatPersistenceService chatPersistenceService,
            GitHubModelsService gitHubModelsService,
            SocketIOServer socketIOServer,
            XTwitterService xTwitterService,
            CRMHandler crmHandler,
            AiMenuMergeService aiMenuMergeService
        ) {
        this.recordManager = recordManager;
        this.initHandler = initHandler;
        this.authHandler = authHandler;
        this.roleHandler = roleHandler;
        this.menuHandler = menuHandler;
        this.homeHandler = homeHandler;
        this.tableHandler = tableHandler;
        // this.aiHandler = aiHandler; 
        this.webScraperService = webScraperService;
        this.aiProviderFactory = aiProviderFactory;
        this.googleIndexService = googleIndexService;
        this.googleIndexQueueService = googleIndexQueueService;
        this.chatPersistenceService = chatPersistenceService;
        this.gitHubModelsService = gitHubModelsService;
        this.socketIOServer = socketIOServer;
        this.xTwitterService = xTwitterService;
        this.crmHandler = crmHandler;
        this.aiMenuMergeService = aiMenuMergeService;
    }

    public ResponseEntity<?> handleApiRequest(
            HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse servletResponse,
            @RequestHeader Map<String, String> headers,
            @RequestParam(required = false) Map<String, String> queryParams,
            @RequestBody(required = false) String requestBody // Body có thể là JSON
    ) {
        // Log đầu vào
        logger.info("[API IN] {} {} IP={} UA={} headers={} body={}", request.getMethod(), request.getRequestURI(),
                request.getRemoteAddr(), request.getHeader("User-Agent"), headers, requestBody);
        Map<String, String> lowerCaseHeaders = new HashMap<>();
        if (headers != null) {
            headers.forEach((key, value) -> lowerCaseHeaders.put(key.toLowerCase(), value));
        }

        String httpMethod = request.getMethod();
        Object rawAttr = request.getAttribute("cleanedUri");
        String rawPath = (rawAttr != null) ? rawAttr.toString() : request.getRequestURI();
        String effectivePath = rawPath;
        String csrfToken = lowerCaseHeaders.get("x-csrf-token");
        String refreshTokenHeader = lowerCaseHeaders.get("x-refresh-token");

        StandardResponse response = new StandardResponse();
        response.set("requestId", UUID.randomUUID().toString());
        response.setIsApi(true); // Đây là phản hồi API

        Map<String, Object> params = new HashMap<>(queryParams); // Khởi tạo params với query parameters
        if ("POST".equalsIgnoreCase(httpMethod) || "PUT".equalsIgnoreCase(httpMethod)) {
            String contentType = lowerCaseHeaders.getOrDefault("content-type", "");
            if (requestBody != null && !requestBody.isEmpty()) {
                if (contentType.contains("application/json")) {
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> typedParams = (Map<String, Object>) objectMapper.readValue(requestBody, Map.class);
                        params.putAll(typedParams);
                        logger.debug("✅ Đã parse JSON body: {}", params);
                    } catch (IOException e) {
                        logger.error("❌ Lỗi parse JSON body trong ApiSpringController: {}", e.getMessage(), e);
                        response.set("code", 400); // Bad Request
                        response.set("message", "Invalid JSON format in request body.");
                        logger.info("[API OUT] {} {} status=400 message=Invalid JSON format", request.getMethod(),
                                request.getRequestURI());
                        return buildResponseEntity(response); // Trả về lỗi JSON
                    }
                } else {
                    for (String line : requestBody.split("&")) {
                        String[] kv = line.split("=", 2);
                        if (kv.length == 2) {
                            params.put(kv[0], kv[1]);
                        }
                    }
                    logger.debug("✅ Đã parse form body: {}", params);
                }
            }
        }

        if (lowerCaseHeaders != null) {
            for (Map.Entry<String, String> entry : lowerCaseHeaders.entrySet()) {
                if (entry.getKey().startsWith("csm-")) {
                    params.put(entry.getKey(), entry.getValue());
                }
            }
        }
        if (csrfToken != null) {
            params.put("x-csrf-token", csrfToken);
        }
        if (refreshTokenHeader != null && !refreshTokenHeader.isBlank()) {
            params.put("refreshToken", refreshTokenHeader);
        } else if (request.getCookies() != null) {
            for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                if ("refreshToken".equals(cookie.getName())) {
                    params.put("refreshToken", cookie.getValue());
                    break;
                }
            }
        }
        logger.debug("✅ Tham số {} với phương thức {}", params, httpMethod);

        // CRM multi-tenant guard: force app scoping by authenticated user context.
        if (isCrmPath(effectivePath)) {
            if (!secureAndNormalizeCrmParams(response, params, effectivePath, httpMethod)) {
                logger.info("[API OUT] {} {} status={} response={}", request.getMethod(), request.getRequestURI(),
                        response.get("code"), response);
                return buildResponseEntity(response);
            }
        }

        int statusCode = 200;
        try {
            // Chuyển logic switch từ ApiController.handleRequestByPath vào đây
            switch (effectivePath) {
                case "/create-default-data":
                    initHandler.handleCreateDefaultData(response);
                    break;
                case "/user-info":
                    authHandler.handleUserInfo(response, params);
                    break;
                case "/role-list":
                    roleHandler.handleRoleList(response, params);
                    break;
                case "/role-item":
                    roleHandler.handleRoleItem(response, httpMethod, params);
                    break;
                case "/role-menu":
                    roleHandler.handleRoleMenu(response);
                    break;
                case "/menu-by-role-id":
                    menuHandler.handleMenuByRoleId(response, params);
                    break;
                case "/menu-list":
                    menuHandler.handleMenuList(response);
                    break;
                case "/menu-item":
                    menuHandler.handleMenuItem(response, httpMethod, params);
                    break;
                case "/notifications":
                    homeHandler.handleNotifications(response);
                    break;
                case "/home":
                    homeHandler.handleHome(response);
                    break;
                case "/home/pie":
                    homeHandler.handleHomePie(response);
                    break;
                case "/home/line":
                    homeHandler.handleHomeLine(response, params);
                    break;
                case "/home/googlebot":
                    homeHandler.handleGoogleBotStats(response, params);
                    break;
                case "/home/googlebot/delete":
                    homeHandler.handleGoogleBotDelete(response, params);
                    break;
                case "/facebook/post":
                    handleFacebookPost(response, params);
                    break;
                case "/facebook/post-with-images":
                    handleFacebookPostWithImages(response, params);
                    break;
                case "/facebook/exchange-token":
                    handleFacebookExchangeToken(response, params);
                    break;
                case "/facebook/pages":
                    handleFacebookPages(response, params);
                    break;
                case "/facebook/me":
                    handleFacebookMe(response, params);
                    break;
                case "/facebook/ads/campaign": {
                    params.put("platform", "facebook_ads");
                    if (!params.containsKey("adData")) {
                        Map<String, Object> adData = new HashMap<>(params);
                        params.put("adData", adData);
                    }
                    crmHandler.handleCreateAd(response, params);
                    break;
                }
                case "/google/ads/campaign": {
                    params.put("platform", "google_ads");
                    if (!params.containsKey("adData")) {
                        Map<String, Object> adData = new HashMap<>(params);
                        params.put("adData", adData);
                    }
                    crmHandler.handleCreateAd(response, params);
                    break;
                }
                case "/login":
                    params.put("_servlet_response", servletResponse);
                    params.put("_host", request.getServerName());
                    params.put("_origin", lowerCaseHeaders.getOrDefault("origin", ""));
                    params.put("_referer", lowerCaseHeaders.getOrDefault("referer", ""));
                    params.put("_user_agent", lowerCaseHeaders.getOrDefault("user-agent", ""));
                    params.put("_client_ip", getClientIp(request, lowerCaseHeaders));
                    authHandler.handleLogin(response, params);
                    break;
                case "/logout":
                    // Clear refreshToken and CSRF cookies by setting them with max age 0
                    jakarta.servlet.http.Cookie refreshTokenCookie = new jakarta.servlet.http.Cookie("refreshToken",
                            "");
                    refreshTokenCookie.setMaxAge(0);
                    refreshTokenCookie.setPath("/");
                    refreshTokenCookie.setHttpOnly(true);
                    servletResponse.addCookie(refreshTokenCookie);

                    jakarta.servlet.http.Cookie csrfCookie = new jakarta.servlet.http.Cookie("CSRF-TOKEN", "");
                    csrfCookie.setMaxAge(0);
                    csrfCookie.setPath("/");
                    servletResponse.addCookie(csrfCookie);

                    authHandler.handleLogout(response, params);
                    break;
                case "/refresh-token":
                    params.put("_servlet_response", servletResponse);
                    params.put("_host", request.getServerName());
                    params.put("_origin", lowerCaseHeaders.getOrDefault("origin", ""));
                    params.put("_referer", lowerCaseHeaders.getOrDefault("referer", ""));
                    params.put("_user_agent", lowerCaseHeaders.getOrDefault("user-agent", ""));
                    params.put("_client_ip", getClientIp(request, lowerCaseHeaders));
                    authHandler.handleRefreshToken(response, params);
                    break;
                case "/get-async-routes":
                    authHandler.handleGetAsyncRoutes(response, params);
                    break;
                case "/seo":
                    SeoHandler.handleSeo(response, params);
                    break;
                case "/restoredb":
                    tableHandler.restoreDb(response, params);
                    break;
                case "/backupdb":
                    tableHandler.backupDb(response, params);
                    break;
                case "/migrateKeys":
                    tableHandler.migrateKeys(response, params);
                    break;
                case "/create-table":
                    tableHandler.handleCreateTable(response, params);
                    break;
                case "/drop-table":
                    tableHandler.handleDropTable(response, params);
                    break;
                case "/get-table-data":
                    tableHandler.handleGetTableData(response, params);
                    break;
                case "/update-table-data":
                    tableHandler.handleUpdateTableData(response, params);
                    break;
                case "/bulk-update-table-data":
                    tableHandler.handleBulkUpdateTableData(response, params);
                    break;
                case "/update-table-data-index":
                    tableHandler.handleIndexExistingRecords(response, params);
                    break;
                case "/ai-generate-seo-content":
                    getObjectFromAI(response, params);
                    break;
                case "/copilot-chat-stream":
                    handleCopilotChatStream(response, params);
                    break;
                case "/ai/menu-merge":
                    handleAiMenuMerge(response, params);
                    break;
                case "/register":
                    authHandler.handleRegisterUser(response, params);
                    break;
                case "/create-sub-user":
                    authHandler.handleCreateSubUser(response, params);
                    break;
                case "/scrape-web": // <-- THÊM ENDPOINT MỚI CHO SCRAPING
                    handleWebScrape(response, params);
                    break;
                case "/execute-js-on-page": // <-- THÊM ENDPOINT MỚI CHO THỰC THI JS
                    handleExecuteJsOnPage(response, params);
                    break;
                case "/indexgoogle": // <-- THÊM ENDPOINT MỚI CHO GOOGLE INDEX API
                    handleGoogleIndexing(response, params);
                    break;
                case "/chat-history":
                    handleChatHistory(response, params);
                    break;
                case "/chat-history-guest":
                    handleChatHistoryGuest(response, params);
                    break;
                case "/chat-history-app":
                    handleChatHistoryApp(response, params);
                    break;
                case "/apps-list":
                    handleGetAppsList(response, params);
                    break;
                case "/chat-guests-list":
                    handleChatGuestsList(response, params);
                    break;
                case "/chat-mark-read":
                    handleChatMarkRead(response, params);
                    break;
                case "/chat-mark-all-read":
                    handleChatMarkAllRead(response, params);
                    break;
                case "/chat-delete-message":
                    handleChatDeleteMessage(response, params);
                    break;
                // ========== CRM APIs ==========
                case "/crm/customer":
                    if ("POST".equalsIgnoreCase(httpMethod) || "PUT".equalsIgnoreCase(httpMethod)) {
                        crmHandler.handleCreateOrUpdateCustomer(response, params);
                    } else if ("GET".equalsIgnoreCase(httpMethod)) {
                        // GET single customer by phone
                        crmHandler.handleGetCustomerDetail(response, params);
                    }
                    break;
                case "/crm/customers":
                    crmHandler.handleGetCustomers(response, params);
                    break;
                case "/crm/customer/assign":
                    crmHandler.handleAssignCustomer(response, params);
                    break;
                case "/crm/customer/status":
                    crmHandler.handleUpdateCustomerStatus(response, params);
                    break;
                case "/crm/customer/purchase":
                    crmHandler.handleAddPurchase(response, params);
                    break;
                case "/crm/customer/contact":
                    crmHandler.handleAddContactHistory(response, params);
                    break;
                case "/crm/birthdays":
                    crmHandler.handleGetUpcomingBirthdays(response, params);
                    break;
                case "/crm/stats":
                    crmHandler.handleGetCRMStats(response, params);
                    break;
                case "/crm/website-stats":
                    crmHandler.handleGetWebsiteStats(response, params);
                    break;
                case "/crm/ads-stats":
                    crmHandler.handleGetAdsStats(response, params);
                    break;
                case "/crm/ads":
                    if ("POST".equalsIgnoreCase(httpMethod)) {
                        crmHandler.handleCreateAd(response, params);
                    } else {
                        crmHandler.handleGetAds(response, params);
                    }
                    break;
                case "/crm/analytics":
                    crmHandler.handleGetAnalytics(response, params);
                    break;
                case "/crm/insights":
                    crmHandler.handleGetAIInsights(response, params);
                    break;
                default:
                    response.set("message", "Unsupported API path: " + effectivePath);
                    response.set("code", 404);
                    break;
            }
        } catch (Exception e) {
            logger.error("❌ Lỗi xử lý API cho đường dẫn {}: {}", effectivePath, e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Internal server error: " + e.getMessage());
        }

        Object respCode = response.get("code");
        if (respCode instanceof Integer)
            statusCode = (Integer) respCode;
        logger.info("[API OUT] {} {} status={} response={}", request.getMethod(), request.getRequestURI(), statusCode,
                response);
        return buildResponseEntity(response);
    }

    private boolean isCrmPath(String path) {
        return path != null && path.startsWith("/crm/");
    }

    private boolean isGuestCrmLeadCapturePath(String path, String httpMethod) {
        if (path == null || httpMethod == null) {
            return false;
        }
        return "/crm/customer".equals(path)
                && ("POST".equalsIgnoreCase(httpMethod) || "PUT".equalsIgnoreCase(httpMethod));
    }

    private static class UserAuthContext {
        String appId;
        boolean dev;
        List<String> roles = new ArrayList<>();
        boolean authenticated;
    }

    private UserAuthContext extractUserAuthContext() {
        UserAuthContext context = new UserAuthContext();
        org.springframework.security.core.Authentication authentication =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()
                || authentication.getPrincipal() == null
                || "anonymousUser".equals(authentication.getPrincipal())) {
            context.authenticated = false;
            return context;
        }

        context.authenticated = true;
        Object principal = authentication.getPrincipal();

        if (principal instanceof net.phanmemmottrieu.model.User) {
            net.phanmemmottrieu.model.User user = (net.phanmemmottrieu.model.User) principal;
            context.appId = user.getAppId();
            context.dev = user.getDev() != null && user.getDev();
            if (user.getPermissions() != null) {
                context.roles = user.getPermissions();
            }
        } else if (principal instanceof Map<?, ?> principalMap) {
            Object appObj = principalMap.get("app_id");
            if (appObj instanceof String) {
                context.appId = (String) appObj;
            }

            Object devObj = principalMap.get("dev");
            context.dev = devObj instanceof Boolean && (Boolean) devObj;

            Object rolesObj = principalMap.get("roles");
            if (rolesObj instanceof List<?>) {
                for (Object roleObj : (List<?>) rolesObj) {
                    if (roleObj instanceof String role) {
                        context.roles.add(role);
                    }
                }
            }
        }

        return context;
    }

    private boolean isCsmAdmin(UserAuthContext context) {
        if (context == null) {
            return false;
        }
        boolean isAdminRole = context.roles != null && context.roles.contains("admin");
        return "csm".equalsIgnoreCase(context.appId) && (context.dev || isAdminRole);
    }

    private boolean hasDevPrivilege(UserAuthContext context) {
        if (context == null || !context.authenticated) {
            return false;
        }
        if (context.dev) {
            return true;
        }
        return context.roles != null && context.roles.stream().anyMatch(role -> "dev".equalsIgnoreCase(role));
    }

    private String firstNonBlankString(Object... values) {
        if (values == null) {
            return null;
        }
        for (Object value : values) {
            if (value instanceof String) {
                String text = ((String) value).trim();
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }
        return null;
    }

    private String extractPromptAsString(Map<String, Object> params) {
        if (params == null) {
            return null;
        }
        Object promptValue = params.get("prompt");
        if (promptValue == null) {
            return null;
        }
        if (promptValue instanceof String) {
            return (String) promptValue;
        }

        // Accept structured payloads and serialize them to JSON so AI receives full context.
        if (promptValue instanceof Map<?, ?> || promptValue instanceof List<?>) {
            try {
                return objectMapper.writeValueAsString(promptValue);
            } catch (Exception e) {
                logger.warn("Failed to serialize non-string prompt payload, fallback to toString(): {}", e.getMessage());
                return String.valueOf(promptValue);
            }
        }

        return String.valueOf(promptValue);
    }

    @SuppressWarnings("unchecked")
    private String extractTaskTypeFromPromptJson(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return null;
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(prompt, Map.class);
            Object directTaskType = parsed.get("taskType");
            if (directTaskType instanceof String && !((String) directTaskType).isBlank()) {
                return ((String) directTaskType).trim();
            }

            Object currentTaskObj = parsed.get("current_task");
            if (currentTaskObj instanceof Map<?, ?> currentTask) {
                Object taskTypeObj = ((Map<String, Object>) currentTask).get("task_type");
                if (taskTypeObj instanceof String && !((String) taskTypeObj).isBlank()) {
                    return ((String) taskTypeObj).trim();
                }
            }
        } catch (Exception ignored) {
            // Prompt may be plain text; ignore parse errors.
        }
        return null;
    }

    /**
     * Extract the human-readable requirement text from the prompt JSON.
     * Looks in current_task.requirement_text first, then app_context.requirement_text.
     * Falls back to a short prefix of the raw prompt if not JSON.
     */
    @SuppressWarnings("unchecked")
    private String extractRequestTextFromPrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) return "";
        try {
            Map<String, Object> parsed = objectMapper.readValue(prompt, Map.class);
            Object currentTask = parsed.get("current_task");
            if (currentTask instanceof Map) {
                Object req = ((Map<String, Object>) currentTask).get("requirement_text");
                if (req instanceof String s && !s.isBlank()) return s.trim();
            }
            Object appCtx = parsed.get("app_context");
            if (appCtx instanceof Map) {
                Object req = ((Map<String, Object>) appCtx).get("requirement_text");
                if (req instanceof String s && !s.isBlank()) return s.trim();
            }
        } catch (Exception ignored) {}
        // Fallback: use first 300 chars of raw prompt
        return prompt.length() > 300 ? prompt.substring(0, 300) : prompt;
    }

    private boolean shouldExposeRoutingDebug(Map<String, Object> params) {
        boolean requested = (params != null && Boolean.TRUE.equals(params.get("includeRoutingDebug")))
                || "true".equalsIgnoreCase(String.valueOf(params != null ? params.get("includeRoutingDebug") : null));
        if (!requested) {
            return false;
        }
        return hasDevPrivilege(extractUserAuthContext());
    }

    private boolean secureAndNormalizeCrmParams(StandardResponse response, Map<String, Object> params, String path,
            String httpMethod) {
        if (isGuestCrmLeadCapturePath(path, httpMethod)) {
            String requestedAppId = firstNonBlankString(params.get("appId"), params.get("app_id"));
            if (requestedAppId == null) {
                response.set("code", 400);
                response.set("success", false);
                response.set("message", "appId is required for guest CRM lead capture");
                return false;
            }

            params.put("appId", requestedAppId);
            params.put("app_id", requestedAppId);
            return true;
        }

        UserAuthContext context = extractUserAuthContext();
        if (!context.authenticated) {
            response.set("code", 401);
            response.set("success", false);
            response.set("message", "Not authenticated");
            return false;
        }

        String userAppId = firstNonBlankString(context.appId);
        String requestedAppId = firstNonBlankString(params.get("appId"), params.get("app_id"));
        boolean csmAdmin = isCsmAdmin(context);

        if (!csmAdmin) {
            if (userAppId == null) {
                response.set("code", 403);
                response.set("success", false);
                response.set("message", "User app scope is missing");
                return false;
            }
            if (requestedAppId != null && !requestedAppId.equals(userAppId)) {
                logger.warn("🚫 CRM cross-app access denied: path={}, userAppId={}, requestedAppId={}",
                        path, userAppId, requestedAppId);
                response.set("code", 403);
                response.set("success", false);
                response.set("message", "Forbidden: cannot access CRM data of another app");
                return false;
            }

            params.put("appId", userAppId);
            params.put("app_id", userAppId);
            return true;
        }

        String effectiveAppId = firstNonBlankString(requestedAppId, userAppId, "csm");
        params.put("appId", effectiveAppId);
        params.put("app_id", effectiveAppId);
        return true;
    }

    /**
     * Gửi prompt đến dịch vụ AI, nhận phản hồi và chuyển đổi thành đối tượng JSON
     * động.
     *
     * <p>
    /**
     * Phương thức này thực hiện chuỗi các hành động: gửi một prompt đã được định
     * dạng đến dịch vụ
     * AI, nhận về một chuỗi JSON thô, làm sạch chuỗi đó bằng cách loại bỏ các ký tự
     * markdown thừa, và
     * cuối cùng sử dụng ObjectMapper để phân tích cú pháp chuỗi JSON thành Map
     * động.
     *
     * @param response Đối tượng StandardResponse để thiết lập kết quả hoặc thông
     *                 báo lỗi.
     * @param params   Map chứa các tham số đầu vào, bao gồm "prompt".
     */
    /**
     * POST /ai/menu-merge
     *
     * Params:
     *   scenario   : "incremental_update" | "property_edit"
     *   old_json   : JSON string of the current (old) menu tree / node
     *   new_json   : JSON string of AI's proposed menu tree / node
     *
     * Returns MergeOutput: { mergedMenu, patchOps, added, edited, deleted }
     */
    private void handleAiMenuMerge(StandardResponse response, Map<String, Object> params) {
        try {
            String scenario = String.valueOf(params.getOrDefault("scenario", "incremental_update")).trim();
            String oldJson  = String.valueOf(params.getOrDefault("old_json",  "[]")).trim();
            String newJson  = String.valueOf(params.getOrDefault("new_json",  "[]")).trim();

            AiMenuMergeService.MergeOutput out;
            if ("property_edit".equals(scenario)) {
                out = aiMenuMergeService.mergeMenuNode(oldJson, newJson);
            } else {
                out = aiMenuMergeService.diffMergeTrees(oldJson, newJson);
            }

            response.set("code", 200);
            response.set("success", true);
            response.set("result", objectMapper.convertValue(out, Map.class));
        } catch (Exception e) {
            logger.error("handleAiMenuMerge error: {}", e.getMessage(), e);
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Menu merge failed: " + e.getMessage());
        }
    }

    /**
     * Handle CodeMirror Copilot chat with streaming via Socket.IO
     * Sends streaming text chunks to client in real-time
     */
    private void handleCopilotChatStream(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = String.valueOf(params.getOrDefault("appId", "")).trim();
            String message = String.valueOf(params.getOrDefault("message", "")).trim();
            String currentCode = String.valueOf(params.getOrDefault("currentCode", "")).trim();
            String language = String.valueOf(params.getOrDefault("language", "javascript")).trim();
            String contextType = String.valueOf(params.getOrDefault("contextType", "code")).trim();
            String taskType = String.valueOf(params.getOrDefault("taskType", "")).trim();
            String pName = String.valueOf(params.getOrDefault("pName", "")).trim();
            Integer pType = parseNullableInteger(params.get("pType"));
            String responseMode = normalizeCopilotResponseMode(params.get("responseMode"), message);
            message = stripCopilotModeDirective(message);
            List<Map<String, Object>> attachments = normalizeCopilotAttachments(params.get("attachments"));
            
            if (message.isEmpty() && attachments.isEmpty()) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", "Message or attachment is required");
                return;
            }

            if (appId.isEmpty()) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", "appId is required");
                return;
            }

            String continuityScopeKey = buildCopilotContinuityScopeKey(contextType, language, pName, pType);
            String continuityMemory = trimCopilotContinuityMemory(
                gitHubModelsService.loadCopilotConversationMemory(appId, continuityScopeKey));
            List<String> pendingQuestions = gitHubModelsService.loadCopilotPendingQuestions(appId, continuityScopeKey, 8);
            List<Map<String, Object>> messages = buildCopilotChatMessages(appId, message, currentCode, language, contextType,
                taskType, responseMode, attachments, continuityMemory, pName, pType, continuityScopeKey, pendingQuestions);
            emitCopilotChatDebug(appId, buildCopilotDebugPayload(
                appId,
                message,
                currentCode,
                language,
                contextType,
                taskType,
                responseMode,
                attachments,
                continuityMemory,
                pName,
                pType,
                continuityScopeKey,
                pendingQuestions,
                messages));
            
            // Set up streaming via Socket.IO
            StringBuilder fullResponse = new StringBuilder();
            AtomicReference<String> lastDraftRef = new AtomicReference<>(currentCode == null ? "" : currentCode);
            GitHubModelsService.ProgressListener streamListener = (progress) -> {
                String stage = String.valueOf(progress.getOrDefault("stage", ""));
                String chunk = String.valueOf(progress.getOrDefault("chunk", ""));
                if ("streaming".equals(stage) && !chunk.isEmpty()) {
                    fullResponse.append(chunk);
                }

                Map<String, Object> realtimePayload = new HashMap<>();
                realtimePayload.put("stage", stage);
                realtimePayload.put("message", String.valueOf(progress.getOrDefault("message", "")));
                realtimePayload.put("chunk", chunk);
                realtimePayload.put("responseMode", responseMode);

                Object current = progress.get("current");
                Object total = progress.get("total");
                Object percent = progress.get("percent");
                if (current != null) realtimePayload.put("current", current);
                if (total != null) realtimePayload.put("total", total);
                if (percent != null) realtimePayload.put("percent", percent);
                Object status = progress.get("status");
                if (status != null) realtimePayload.put("status", status);

                // Keep compatibility with legacy realtime editor payloads.
                Object draftText = progress.get("draftText");
                Object partialJson = progress.get("partialJson");
                Object previewJson = progress.get("previewJson");
                Object textEdits = progress.get("textEdits");
                Object lineRanges = progress.get("lineRanges");
                Object changedRanges = progress.get("changedRanges");
                Object patchOps = progress.get("patchOps");

                String realtimeDraft = extractRealtimeDraftText(progress);
                List<Map<String, Object>> generatedTextEdits = Collections.emptyList();
                if (!realtimeDraft.isBlank()) {
                    String previousDraft = String.valueOf(lastDraftRef.get() == null ? "" : lastDraftRef.get());
                    if (!realtimeDraft.equals(previousDraft)) {
                        generatedTextEdits = buildLineTextEdits(previousDraft, realtimeDraft);
                        lastDraftRef.set(realtimeDraft);
                    }
                }

                if (draftText != null) realtimePayload.put("draftText", draftText);
                if (partialJson != null) realtimePayload.put("partialJson", partialJson);
                if (previewJson != null) realtimePayload.put("previewJson", previewJson);
                if (textEdits != null) {
                    realtimePayload.put("textEdits", textEdits);
                } else if (!generatedTextEdits.isEmpty()) {
                    realtimePayload.put("textEdits", generatedTextEdits);
                }
                if (lineRanges != null) {
                    realtimePayload.put("lineRanges", lineRanges);
                }
                if (changedRanges != null) {
                    realtimePayload.put("changedRanges", changedRanges);
                }
                if (textEdits == null && lineRanges == null && changedRanges == null && !generatedTextEdits.isEmpty()) {
                    List<Map<String, Object>> ranges = convertTextEditsToLineRanges(generatedTextEdits);
                    if (!ranges.isEmpty()) {
                        realtimePayload.put("lineRanges", ranges);
                        realtimePayload.put("changedRanges", ranges);
                    }
                }
                if (patchOps != null) realtimePayload.put("patchOps", patchOps);

                boolean hasChunk = !chunk.isEmpty();
                boolean hasRealtimeDraft = draftText != null || partialJson != null || previewJson != null;
                boolean hasRealtimeEdits = textEdits != null || lineRanges != null || changedRanges != null || patchOps != null || !generatedTextEdits.isEmpty();
                boolean hasStatus = !stage.isEmpty()
                    || !String.valueOf(progress.getOrDefault("message", "")).isEmpty()
                    || current != null
                    || total != null
                    || percent != null
                    || status != null;
                if (hasChunk || hasRealtimeDraft || hasRealtimeEdits || hasStatus) {
                    emitCopilotChatChunk(appId, realtimePayload);
                }
            };

            // Call GitHub Models with streaming
            String githubRaw = gitHubModelsService.chatWithStreamingMessages(messages, streamListener);

            if (fullResponse.length() == 0) {
                String extractedFromGithub = extractAiResultText(githubRaw);
                if (!extractedFromGithub.isBlank()) {
                    fullResponse.append(extractedFromGithub);
                    emitTextAsCopilotChunks(appId, extractedFromGithub, responseMode);
                }
            }

            if (fullResponse.length() == 0 && shouldFallbackToGemini(githubRaw)) {
                logger.warn("Copilot stream: GitHub Models quota/rate-limited. Falling back to AIProviderFactory.");
                emitCopilotChatChunk(appId, Map.of(
                    "stage", "gemini_fallback",
                    "message", "GitHub Models hết quota, đang chuyển sang Gemini",
                    "responseMode", responseMode,
                    "current", 0,
                    "total", 1,
                    "percent", 0));

                String fallbackPrompt = buildCopilotChatPromptText(
                    message,
                    currentCode,
                    language,
                    contextType,
                    responseMode,
                    attachments,
                    continuityMemory,
                    pName,
                    pType,
                    continuityScopeKey,
                    pendingQuestions);
                String fallbackRaw = this.aiProviderFactory.generateContent(fallbackPrompt);
                String fallbackText = extractAiResultText(fallbackRaw);
                if (!fallbackText.isBlank()) {
                    fullResponse.append(fallbackText);
                    emitTextAsCopilotChunks(appId, fallbackText, responseMode);
                }
            }

            if (fullResponse.length() == 0) {
                String errText = shouldFallbackToGemini(githubRaw)
                    ? "GitHub Models và provider fallback đều không trả về nội dung"
                    : "AI không trả về nội dung";
                throw new IllegalStateException(errText);
            }
            
            // Emit completion event
            Map<String, Object> completion = new HashMap<>();
            completion.put("stage", "complete");
            completion.put("fullResponse", fullResponse.toString());
            completion.put("responseMode", responseMode);
            completion.put("timestamp", System.currentTimeMillis());
            emitCopilotChatEvent(appId, "copilot_chat_complete", completion);

            gitHubModelsService.appendCopilotConversationTurn(
                appId,
                continuityScopeKey,
                message,
                fullResponse.toString(),
                contextType,
                responseMode,
                attachments);

            response.set("code", 200);
            response.set("success", true);
            response.set("message", "Chat completed");
            response.set("result", Map.of("fullResponse", fullResponse.toString()));

        } catch (Exception e) {
            logger.error("handleCopilotChatStream error: {}", e.getMessage(), e);
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Chat streaming failed: " + e.getMessage());
            emitCopilotChatEvent(String.valueOf(params.getOrDefault("appId", "")), "copilot_chat_error", 
                Map.of("error", e.getMessage()));
        }
    }

    private void emitCopilotChatDebug(String appId, Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        emitCopilotChatEvent(appId, "copilot_chat_debug", payload);
    }

    private Map<String, Object> buildCopilotDebugPayload(
            String appId,
            String message,
            String currentCode,
            String language,
            String contextType,
            String taskType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions,
            List<Map<String, Object>> messages) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("stage", "debug");
        payload.put("timestamp", System.currentTimeMillis());
        payload.put("content", renderCopilotDebugMessage(
            appId,
            message,
            currentCode,
            language,
            contextType,
            taskType,
            responseMode,
            attachments,
            continuityMemory,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions,
            messages));
        return payload;
    }

    private String renderCopilotDebugMessage(
            String appId,
            String message,
            String currentCode,
            String language,
            String contextType,
            String taskType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions,
            List<Map<String, Object>> messages) {
        Map<String, Object> debugMeta = new LinkedHashMap<>();
        debugMeta.put("appId", String.valueOf(appId == null ? "" : appId).trim());
        debugMeta.put("contextType", String.valueOf(contextType == null ? "" : contextType).trim());
        debugMeta.put("taskType", String.valueOf(taskType == null ? "" : taskType).trim());
        debugMeta.put("responseMode", normalizeCopilotResponseMode(responseMode, message));
        debugMeta.put("language", String.valueOf(language == null ? "" : language).trim());
        debugMeta.put("pName", String.valueOf(pName == null ? "" : pName).trim());
        debugMeta.put("pType", pType);
        debugMeta.put("continuityScopeKey", String.valueOf(continuityScopeKey == null ? "" : continuityScopeKey).trim());
        debugMeta.put("messageChars", message == null ? 0 : message.length());
        debugMeta.put("currentCodeChars", currentCode == null ? 0 : currentCode.length());
        debugMeta.put("continuityMemoryChars", continuityMemory == null ? 0 : continuityMemory.length());
        debugMeta.put("pendingQuestionsCount", pendingQuestions == null ? 0 : pendingQuestions.size());
        debugMeta.put("attachmentCount", attachments == null ? 0 : attachments.size());
        debugMeta.put("textAttachmentCount", countCopilotAttachmentsByKind(attachments, "text", "json"));
        debugMeta.put("imageAttachmentCount", countCopilotAttachmentsByKind(attachments, "image"));
        debugMeta.put("messagesSentToCopilot", messages == null ? 0 : messages.size());
        debugMeta.put("clientAttachmentSummary", buildCopilotAttachmentDebugSummary(attachments));

        String messagesJson;
        try {
            messagesJson = objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(sanitizeCopilotDebugMessages(messages));
        } catch (Exception ex) {
            messagesJson = String.valueOf(messages);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("[Copilot Debug] Backend payload prepared before calling model.\n\n");
        sb.append("Client + backend context summary:\n");
        sb.append("```json\n");
        sb.append(trimForCopilotDebugDisplay(toPrettyJson(debugMeta), COPILOT_DEBUG_MARKDOWN_MAX_CHARS / 2));
        sb.append("\n```\n\n");
        sb.append("Messages sent to Copilot:\n");
        sb.append("```json\n");
        sb.append(trimForCopilotDebugDisplay(messagesJson, COPILOT_DEBUG_MESSAGES_JSON_MAX_CHARS));
        sb.append("\n```\n");
        return trimForCopilotDebugDisplay(sb.toString(), COPILOT_DEBUG_MARKDOWN_MAX_CHARS);
    }

    private String toPrettyJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return String.valueOf(value);
        }
    }

    private int countCopilotAttachmentsByKind(List<Map<String, Object>> attachments, String... kinds) {
        if (attachments == null || attachments.isEmpty() || kinds == null || kinds.length == 0) {
            return 0;
        }
        Set<String> acceptedKinds = Set.of(kinds);
        int count = 0;
        for (Map<String, Object> attachment : attachments) {
            String kind = String.valueOf(attachment == null ? "" : attachment.getOrDefault("kind", "")).trim().toLowerCase();
            if (acceptedKinds.contains(kind)) {
                count += 1;
            }
        }
        return count;
    }

    private List<Map<String, Object>> buildCopilotAttachmentDebugSummary(List<Map<String, Object>> attachments) {
        List<Map<String, Object>> summary = new ArrayList<>();
        if (attachments == null || attachments.isEmpty()) {
            return summary;
        }
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("kind", attachment.get("kind"));
            item.put("name", attachment.get("name"));
            item.put("mimeType", attachment.get("mimeType"));
            item.put("size", attachment.get("size"));
            item.put("summary", attachment.get("summary"));
            String textContent = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
            if (!textContent.isEmpty()) {
                item.put("textChars", textContent.length());
            }
            String dataUrl = String.valueOf(attachment.getOrDefault("dataUrl", "")).trim();
            if (!dataUrl.isEmpty()) {
                item.put("imageSource", sanitizeCopilotDebugImageUrl(dataUrl));
            }
            summary.add(item);
        }
        return summary;
    }

    private List<Map<String, Object>> sanitizeCopilotDebugMessages(List<Map<String, Object>> messages) {
        List<Map<String, Object>> sanitized = new ArrayList<>();
        if (messages == null || messages.isEmpty()) {
            return sanitized;
        }
        for (Map<String, Object> message : messages) {
            if (message == null) {
                continue;
            }
            Map<String, Object> next = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : message.entrySet()) {
                next.put(entry.getKey(), sanitizeCopilotDebugValue(entry.getValue()));
            }
            sanitized.add(next);
        }
        return sanitized;
    }

    private Object sanitizeCopilotDebugValue(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> sanitized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                String key = String.valueOf(entry.getKey());
                Object nextValue = entry.getValue();
                if ("url".equals(key) && nextValue instanceof String urlText) {
                    sanitized.put(key, sanitizeCopilotDebugImageUrl(urlText));
                } else {
                    sanitized.put(key, sanitizeCopilotDebugValue(nextValue));
                }
            }
            return sanitized;
        }
        if (value instanceof List<?> rawList) {
            List<Object> sanitized = new ArrayList<>();
            for (Object item : rawList) {
                sanitized.add(sanitizeCopilotDebugValue(item));
            }
            return sanitized;
        }
        if (value instanceof String text) {
            if (text.startsWith("data:image/")) {
                return sanitizeCopilotDebugImageUrl(text);
            }
            return text;
        }
        return value;
    }

    private String sanitizeCopilotDebugImageUrl(String url) {
        String value = String.valueOf(url == null ? "" : url).trim();
        if (value.startsWith("data:image/")) {
            int commaIndex = value.indexOf(',');
            String header = commaIndex > 0 ? value.substring(0, commaIndex) : "data:image/*;base64";
            return header + ",[omitted:" + value.length() + " chars]";
        }
        return trimForCopilotDebugDisplay(value, 240);
    }

    private String trimForCopilotDebugDisplay(String text, int maxChars) {
        String value = String.valueOf(text == null ? "" : text);
        if (maxChars <= 0 || value.length() <= maxChars) {
            return value;
        }
        int keepHead = Math.max(200, (int) Math.floor(maxChars * 0.7));
        int keepTail = Math.max(80, maxChars - keepHead - 32);
        if (keepHead + keepTail + 32 > maxChars) {
            keepTail = Math.max(40, maxChars - keepHead - 32);
        }
        String head = value.substring(0, Math.min(keepHead, value.length())).trim();
        String tail = value.substring(Math.max(0, value.length() - keepTail)).trim();
        return head + "\n...[TRUNCATED_FOR_DEBUG]...\n" + tail;
    }

    private List<Map<String, Object>> buildCopilotChatMessages(
            String appId,
            String message,
            String currentCode,
            String language,
            String contextType,
            String taskType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions) {
        String normalizedContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase();
        String normalizedMode = normalizeCopilotResponseMode(responseMode, message);
        String menuKnowledge = this.gitHubModelsService.buildCopilotMenuKnowledgeBlock(appId, normalizedContext, taskType);
        String systemPrompt;
        if ("menu_json".equals(normalizedContext)) {
            systemPrompt = String.join("\n",
                "You are an AI assistant for menu JSON design inside a CodeMirror editor.",
                "Focus on JSON schema correctness, parent/child integrity, field consistency and trigger safety.",
                "Use any attached text files or images as direct context for the user's menu design request.",
                "Do not output unrelated source code. Keep structure stable unless user requests a structural change.");
            if (!menuKnowledge.isBlank()) {
                systemPrompt = systemPrompt + "\n\n" + menuKnowledge;
            }
        } else {
            systemPrompt = String.join("\n",
                "You are a coding assistant inside a CodeMirror editor.",
                "Respond concisely with practical code suggestions and explanations.",
                "Use any attached text files or images as direct context for the user's request.",
                "Always preserve existing code unless explicitly asked to rewrite.");
        }

        if ("analyze".equals(normalizedMode)) {
            systemPrompt = systemPrompt + "\n\n"
                + "OUTPUT MODE: ANALYZE_ONLY.\n"
                + "Return explanation and analysis text only.\n"
                + "Do NOT generate replacement code blocks, full JSON payloads, or patch instructions unless user explicitly asks to edit/apply changes.";
        } else {
            systemPrompt = systemPrompt + "\n\n"
                + "OUTPUT MODE: EDIT_ALLOWED.\n"
                + "When user asks to modify, return directly applicable code/JSON with minimal commentary.";
        }

        Object userContent = buildCopilotUserContent(
            message,
            currentCode,
            language,
            normalizedContext,
            normalizedMode,
            attachments,
            continuityMemory,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions);
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        messages.add(Map.of("role", "user", "content", userContent));
        return messages;
    }

    private Object buildCopilotUserContent(
            String message,
            String currentCode,
            String language,
            String contextType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions) {
        String promptText = buildCopilotChatPromptText(
            message,
            currentCode,
            language,
            contextType,
            responseMode,
            attachments,
            continuityMemory,
            pName,
            pType,
            continuityScopeKey,
            pendingQuestions);
        List<Map<String, Object>> imageParts = new ArrayList<>();
        for (Map<String, Object> attachment : attachments) {
            String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim().toLowerCase();
            String dataUrl = String.valueOf(attachment.getOrDefault("dataUrl", "")).trim();
            if (!"image".equals(kind) || dataUrl.isEmpty()) {
                continue;
            }
            imageParts.add(Map.of(
                "type", "image_url",
                "image_url", Map.of("url", dataUrl)));
        }

        if (imageParts.isEmpty()) {
            return promptText;
        }

        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", promptText));
        content.addAll(imageParts);
        return content;
    }

    private String buildCopilotChatPromptText(String message, String currentCode, String language, String contextType,
            String responseMode,
            List<Map<String, Object>> attachments,
            String continuityMemory,
            String pName,
            Integer pType,
            String continuityScopeKey,
            List<String> pendingQuestions) {
        StringBuilder sb = new StringBuilder();
        String normalizedContext = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase();
        String normalizedMode = normalizeCopilotResponseMode(responseMode, message);
        if ("menu_json".equals(normalizedContext)) {
            sb.append("You are an AI assistant for menu JSON design inside a CodeMirror editor.\n");
            sb.append("Focus on JSON schema correctness, parent/child integrity, field consistency and trigger safety.\n");
            sb.append("Do not output unrelated source code. Keep structure stable unless user requests a structural change.\n");
            sb.append("Use attached legacy JSON, text notes and UI screenshots as authoritative context when relevant.\n\n");
        } else {
            sb.append("You are a coding assistant inside a CodeMirror editor.\n");
            sb.append("Respond concisely with practical code suggestions and explanations.\n");
            sb.append("Always preserve existing code unless explicitly asked to rewrite.\n");
            sb.append("Use attached files and images as direct context for the request.\n\n");
        }

        if ("analyze".equals(normalizedMode)) {
            sb.append("Response mode: analyze_only. Return text analysis only, no direct replacement code or JSON output unless explicitly requested.\n\n");
        } else {
            sb.append("Response mode: edit_allowed. If user asks to modify, provide directly applicable code/JSON result.\n\n");
        }

        if ("code".equals(normalizedContext)) {
            String normalizedPName = String.valueOf(pName == null ? "" : pName).trim();
            sb.append("Coding target identity (must stay stable unless user asks to switch):\n");
            sb.append("- p_name: ").append(normalizedPName.isEmpty() ? "(unsaved or not selected)" : normalizedPName).append("\n");
            sb.append("- p_type: ").append(pType == null ? "(unknown)" : pType).append("\n");
            sb.append("- current_language_from_codemirror: ").append(String.valueOf(language == null ? "" : language).trim()).append("\n");
            if (continuityScopeKey != null && !continuityScopeKey.isBlank()) {
                sb.append("- continuity_scope_key: ").append(continuityScopeKey).append("\n");
            }
            sb.append("When answering, continue from previous unresolved coding thread for this exact identity. Do not restart from scratch.\n\n");
        }

        if (pendingQuestions != null && !pendingQuestions.isEmpty()) {
            sb.append("UNRESOLVED QUESTIONS FROM PREVIOUS TURN (answer these first if still relevant):\n");
            int idx = 1;
            for (String q : pendingQuestions) {
                String item = String.valueOf(q == null ? "" : q).trim();
                if (item.isEmpty()) continue;
                sb.append(idx++).append(". ").append(item).append("\n");
                if (idx > 8) break;
            }
            sb.append("\n");
        }

        if (continuityMemory != null && !continuityMemory.isBlank()) {
            sb.append("SESSION CONTINUITY MEMORY (continue from unresolved thread, do not restart from scratch):\n");
            sb.append(continuityMemory).append("\n\n");
        }
        
        if (!currentCode.trim().isEmpty()) {
            String contextualCode = buildCopilotCurrentCodeContext(currentCode, message);
            sb.append("Current code (").append(language).append("):\n");
            sb.append("```").append(language).append("\n");
            sb.append(contextualCode).append("\n");
            sb.append("```\n\n");
        }
        
        if (!attachments.isEmpty()) {
            sb.append("Attached context:\n");
            int idx = 1;
            for (Map<String, Object> attachment : attachments) {
                String kind = String.valueOf(attachment.getOrDefault("kind", "file")).trim();
                String name = String.valueOf(attachment.getOrDefault("name", "attachment")).trim();
                String mimeType = String.valueOf(attachment.getOrDefault("mimeType", "")).trim();
                String summary = String.valueOf(attachment.getOrDefault("summary", "")).trim();
                sb.append("- [").append(idx++).append("] ").append(kind).append(": ").append(name);
                if (!mimeType.isEmpty()) {
                    sb.append(" (").append(mimeType).append(")");
                }
                if (!summary.isEmpty()) {
                    sb.append(" -> ").append(summary);
                }
                sb.append("\n");

                String textContent = String.valueOf(attachment.getOrDefault("textContent", "")).trim();
                if (!textContent.isEmpty()) {
                    String truncated = textContent.length() > COPILOT_ATTACHMENT_TEXT_MAX_CHARS
                        ? textContent.substring(0, COPILOT_ATTACHMENT_TEXT_MAX_CHARS) + "\n...[truncated]"
                        : textContent;
                    sb.append("Content of ").append(name).append(":\n");
                    sb.append(truncated).append("\n\n");
                }
            }
        }

        sb.append("Context type: ").append(normalizedContext).append("\n");
        sb.append("User request: ").append(message == null ? "" : message);
        return sb.toString();
    }

    private Integer parseNullableInteger(Object raw) {
        if (raw == null) return null;
        try {
            String text = String.valueOf(raw).trim();
            if (text.isEmpty() || "null".equalsIgnoreCase(text)) return null;
            return Integer.valueOf(text);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String buildCopilotContinuityScopeKey(String contextType, String language, String pName, Integer pType) {
        String normalizedContext = normalizeScopeToken(contextType, "code");
        String normalizedLanguage = normalizeScopeToken(language, "javascript");
        String normalizedPName = normalizeScopeToken(pName, "unsaved");
        String normalizedPType = pType == null ? "na" : String.valueOf(pType);
        return String.join("__",
            "ctx_" + normalizedContext,
            "lang_" + normalizedLanguage,
            "pname_" + normalizedPName,
            "ptype_" + normalizedPType);
    }

    private String normalizeScopeToken(String raw, String fallback) {
        String text = String.valueOf(raw == null ? "" : raw).trim().toLowerCase();
        if (text.isEmpty()) text = fallback;
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .replaceAll("[^a-z0-9_-]", "_")
            .replaceAll("_+", "_")
            .replaceAll("^-|-$", "");
        return normalized.isEmpty() ? fallback : normalized;
    }

    private String trimCopilotContinuityMemory(String memory) {
        String text = String.valueOf(memory == null ? "" : memory).trim();
        if (text.isEmpty()) return "";
        if (text.length() <= COPILOT_CONTINUITY_MEMORY_MAX_CHARS) return text;
        return text.substring(text.length() - COPILOT_CONTINUITY_MEMORY_MAX_CHARS);
    }

    private String buildCopilotCurrentCodeContext(String currentCode, String message) {
        String code = currentCode == null ? "" : currentCode;
        if (code.length() <= COPILOT_CURRENT_CODE_MAX_CHARS) {
            return code;
        }

        int safeHead = Math.max(1000, Math.min(COPILOT_CURRENT_CODE_HEAD_CHARS, code.length()));
        int safeTail = Math.max(1000, Math.min(COPILOT_CURRENT_CODE_TAIL_CHARS, Math.max(0, code.length() - safeHead)));
        String head = code.substring(0, safeHead);
        String tail = code.substring(Math.max(0, code.length() - safeTail));
        String focus = buildCopilotFocusExcerpt(code, message);

        StringBuilder sb = new StringBuilder();
        sb.append("/* Code too large: ").append(code.length())
            .append(" chars. Showing HEAD + FOCUS + TAIL excerpts for better understanding. */\n");
        sb.append("/* ===== HEAD EXCERPT ===== */\n");
        sb.append(head).append("\n");
        if (!focus.isEmpty()) {
            sb.append("/* ===== FOCUS EXCERPT (matched by request keywords) ===== */\n");
            sb.append(focus).append("\n");
        }
        sb.append("/* ===== TAIL EXCERPT ===== */\n");
        sb.append(tail);
        return sb.toString();
    }

    private String buildCopilotFocusExcerpt(String code, String message) {
        if (message == null || message.isBlank() || code == null || code.isBlank()) {
            return "";
        }

        String normalizedMessage = normalizeSearchText(message);
        if (normalizedMessage.isBlank()) {
            return "";
        }

        Set<String> stopWords = Set.of(
            "code", "file", "line", "help", "please", "bug", "fix", "error",
            "menu", "json", "java", "javascript", "typescript", "react", "component",
            "toi", "ban", "giup", "minh", "sua", "dong", "loi"
        );

        String[] rawTokens = normalizedMessage.split("\\s+");
        List<String> tokens = new ArrayList<>();
        for (String raw : rawTokens) {
            String token = String.valueOf(raw == null ? "" : raw).trim().toLowerCase();
            if (token.length() < 4 || stopWords.contains(token)) {
                continue;
            }
            if (!tokens.contains(token)) {
                tokens.add(token);
            }
            if (tokens.size() >= 12) {
                break;
            }
        }

        if (tokens.isEmpty()) {
            return "";
        }

        String lowerCode = code.toLowerCase();
        for (String token : tokens) {
            int idx = lowerCode.indexOf(token);
            if (idx < 0) {
                continue;
            }
            int half = Math.max(1000, COPILOT_CURRENT_CODE_FOCUS_WINDOW_CHARS / 2);
            int start = Math.max(0, idx - half);
            int end = Math.min(code.length(), start + COPILOT_CURRENT_CODE_FOCUS_WINDOW_CHARS);
            return code.substring(start, end);
        }

        return "";
    }

    private String normalizeSearchText(String raw) {
        return Normalizer.normalize(String.valueOf(raw == null ? "" : raw), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9_\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String normalizeCopilotResponseMode(Object rawMode) {
        return normalizeCopilotResponseMode(rawMode, null);
    }

    private String normalizeCopilotResponseMode(Object rawMode, String message) {
        String mode = String.valueOf(rawMode == null ? "" : rawMode).trim().toLowerCase();
        if ("edit".equals(mode)) {
            return "edit";
        }
        if ("analyze".equals(mode)) {
            return "analyze";
        }
        String detected = detectCopilotResponseModeFromMessage(message);
        if ("edit".equals(detected) || "analyze".equals(detected)) {
            return detected;
        }
        return "analyze";
    }

    private String detectCopilotResponseModeFromMessage(String message) {
        if (message == null) {
            return "";
        }
        String trimmed = message.trim();
        if (!trimmed.startsWith("/")) {
            return "";
        }

        int i = 1;
        while (i < trimmed.length()) {
            char ch = trimmed.charAt(i);
            if (Character.isWhitespace(ch) || ch == ':') {
                break;
            }
            i += 1;
        }
        if (i <= 1) {
            return "";
        }

        String token = normalizeCopilotDirectiveToken(trimmed.substring(1, i));
        if (Set.of("edit", "apply", "sua", "chinh", "cap-nhat", "update", "modify", "bianji", "xiugai", "编辑", "修改").contains(token)) {
            return "edit";
        }
        if (Set.of("analyze", "analysis", "phan-tich", "giai-thich", "explain", "fenxi", "jieshi", "分析", "解释").contains(token)) {
            return "analyze";
        }
        return "";
    }

    private String stripCopilotModeDirective(String message) {
        if (message == null) {
            return "";
        }
        String trimmed = message.trim();
        String detected = detectCopilotResponseModeFromMessage(trimmed);
        if (detected.isEmpty()) {
            return trimmed;
        }

        int i = 1;
        while (i < trimmed.length()) {
            char ch = trimmed.charAt(i);
            if (Character.isWhitespace(ch) || ch == ':') {
                break;
            }
            i += 1;
        }
        int j = i;
        while (j < trimmed.length() && (Character.isWhitespace(trimmed.charAt(j)) || trimmed.charAt(j) == ':')) {
            j += 1;
        }
        return trimmed.substring(j).trim();
    }

    private String normalizeCopilotDirectiveToken(String token) {
        if (token == null) {
            return "";
        }
        return Normalizer.normalize(token.trim().toLowerCase(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('_', '-');
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> normalizeCopilotAttachments(Object rawAttachments) {
        List<Map<String, Object>> normalized = new ArrayList<>();
        if (!(rawAttachments instanceof List<?> rawList)) {
            return normalized;
        }

        for (Object item : rawList) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }

            String kind = String.valueOf(rawMap.get("kind") == null ? "" : rawMap.get("kind")).trim().toLowerCase();
            String name = String.valueOf(rawMap.get("name") == null ? "attachment" : rawMap.get("name")).trim();
            String mimeType = String.valueOf(rawMap.get("mimeType") == null ? "" : rawMap.get("mimeType")).trim();
            String summary = String.valueOf(rawMap.get("summary") == null ? "" : rawMap.get("summary")).trim();
            int size = 0;
            try {
                size = Integer.parseInt(String.valueOf(rawMap.get("size") == null ? "0" : rawMap.get("size")));
            } catch (Exception ignored) {
                size = 0;
            }

            Map<String, Object> next = new HashMap<>();
            next.put("kind", kind);
            next.put("name", name.isEmpty() ? "attachment" : name);
            next.put("mimeType", mimeType);
            next.put("summary", summary);
            next.put("size", size);

            if ("image".equals(kind)) {
                String dataUrl = String.valueOf(rawMap.get("dataUrl") == null ? "" : rawMap.get("dataUrl")).trim();
                boolean validDataUrl = dataUrl.startsWith("data:image/") || dataUrl.startsWith("http://") || dataUrl.startsWith("https://");
                if (!validDataUrl) {
                    continue;
                }
                next.put("dataUrl", dataUrl);
                normalized.add(next);
                if (normalized.size() >= 8) {
                    break;
                }
                continue;
            }

            if ("text".equals(kind) || "json".equals(kind)) {
                String textContent = String.valueOf(rawMap.get("textContent") == null ? "" : rawMap.get("textContent")).trim();
                if (textContent.isEmpty()) {
                    continue;
                }
                next.put("textContent", textContent.length() > COPILOT_ATTACHMENT_TEXT_MAX_CHARS
                    ? textContent.substring(0, COPILOT_ATTACHMENT_TEXT_MAX_CHARS) + "\n...[truncated]"
                    : textContent);
                normalized.add(next);
            }

            if (normalized.size() >= 8) {
                break;
            }
        }

        return normalized;
    }

    private void emitCopilotChatChunk(String appId, Map<String, Object> payload) {
        if (appId == null || appId.isEmpty() || socketIOServer == null) {
            return;
        }
        try {
            if (payload == null) {
                payload = new HashMap<>();
            }
            payload.put("timestamp", System.currentTimeMillis());
            socketIOServer.getRoomOperations(appId).sendEvent("copilot_chat_chunk", payload);
        } catch (Exception e) {
            logger.debug("Failed to emit copilot chat chunk: {}", e.getMessage());
        }
    }

    private void emitCopilotChatEvent(String appId, String eventName, Object payload) {
        if (appId == null || appId.isEmpty() || socketIOServer == null) {
            return;
        }
        try {
            socketIOServer.getRoomOperations(appId).sendEvent(eventName, payload);
        } catch (Exception e) {
            logger.debug("Failed to emit copilot chat event {}: {}", eventName, e.getMessage());
        }
    }

    public void getObjectFromAI(StandardResponse response, Map<String, Object> params) {
        String mode = String.valueOf(params.getOrDefault("mode", "sync")).trim().toLowerCase();
        if ("status".equals(mode)) {
            handleAiAsyncStatus(response, params);
            return;
        }
        if ("cancel".equals(mode)) {
            handleAiAsyncCancel(response, params);
            return;
        }

        String prompt = extractPromptAsString(params);
        boolean asyncRequested = "submit".equals(mode)
                || Boolean.TRUE.equals(params.get("async"))
                || "true".equalsIgnoreCase(String.valueOf(params.get("async")));

        if (asyncRequested) {
            handleAiAsyncSubmit(response, prompt, params);
            return;
        }

        String rawContent;

        if (prompt == null || prompt.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Thiếu tham số 'prompt' để tạo nội dung AI.");
            return;
        }

        // Global guardrail for request size handled by this endpoint.
        if (prompt.length() > maxPromptChars) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Prompt quá dài (tối đa " + maxPromptChars + " ký tự), hiện tại: " + prompt.length());
            response.set("errorCode", "PROMPT_EXCEEDS_ENDPOINT_LIMIT");
            return;
        }

        try {
            rawContent = fetchAiRawContent(prompt, null, params);
        } catch (RuntimeException e) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Lỗi khi tương tác với dịch vụ AI: " + e.getMessage());
            logger.error("Runtime exception in AI provider: {}", e.getMessage(), e);
            return;
        }

        if (rawContent == null || rawContent.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Không nhận được nội dung hợp lệ từ dịch vụ AI.");
            return;
        }

        // After a successful menu-design generation, persist the session context file
        // so the next call can continue from where this one left off — no need to re-send history.
        try {
            String promptAppId = this.gitHubModelsService.extractAppIdFromPrompt(prompt);
            if (promptAppId != null && !promptAppId.isBlank()) {
                String requestText = extractRequestTextFromPrompt(prompt);
                this.gitHubModelsService.updateAppContextFile(promptAppId, requestText, rawContent);
            }
        } catch (Exception ctxEx) {
            logger.warn("Could not update AI context file after generation: {}", ctxEx.getMessage());
        }

        if (shouldExposeRoutingDebug(params)) {
            Object routingDecision = params != null ? params.get("_providerRoutingDecision") : null;
            if (routingDecision != null) {
                response.set("providerRoutingDecision", routingDecision);
            }
        }

        populateAiResponseFromRawContent(response, rawContent);
    }

    private String fetchAiRawContent(String prompt, GitHubModelsService.ProgressListener progressListener, Map<String, Object> params) {
        String safePrompt = prompt == null ? "" : prompt;
        String taskTypeRaw = firstNonBlankString(
                params != null ? params.get("taskType") : null,
            params != null ? params.get("task") : null,
            extractTaskTypeFromPromptJson(safePrompt)
        );
        String taskType = taskTypeRaw == null ? "" : taskTypeRaw.toLowerCase();
        String normalizedPrompt = safePrompt.toLowerCase();
        boolean looksLikeCodingPrompt = normalizedPrompt.contains("```")
            || normalizedPrompt.contains("function ")
            || normalizedPrompt.contains("class ")
            || normalizedPrompt.contains("interface ")
            || normalizedPrompt.contains("typescript")
            || normalizedPrompt.contains("javascript")
            || normalizedPrompt.contains("java")
            || normalizedPrompt.contains("python")
            || normalizedPrompt.contains("html")
            || normalizedPrompt.contains("css")
            || normalizedPrompt.contains("sql")
            || normalizedPrompt.contains("bug")
            || normalizedPrompt.contains("refactor")
            || normalizedPrompt.contains("fix");
        boolean isMenuDesignTask = taskType.contains("menu_design");
        boolean isCodingTask = taskType.contains("code")
            || taskType.contains("coding")
            || taskType.contains("developer")
            || taskType.contains("editor")
            || looksLikeCodingPrompt;

        String providerPreferenceRaw = firstNonBlankString(
                params != null ? params.get("providerPreference") : null,
                params != null ? params.get("provider") : null
        );
        String providerPreference = providerPreferenceRaw == null ? "" : providerPreferenceRaw.toLowerCase();
        boolean preferGithubProvider = providerPreference.contains("github") || providerPreference.contains("copilot");

        boolean menuDesignByDev = (params != null && Boolean.TRUE.equals(params.get("menuDesignByDev")))
            || "true".equalsIgnoreCase(String.valueOf(params != null ? params.get("menuDesignByDev") : null));

        // Keep verification for audit visibility, but do not gate menu-design routing on dev role.
        if (menuDesignByDev) {
            UserAuthContext context = extractUserAuthContext();
            boolean verifiedDevCaller = hasDevPrivilege(context);
            if (!verifiedDevCaller && !isMenuDesignTask) {
                logger.warn("Ignoring menuDesignByDev hint because caller is not verified as dev user");
            }
        }

        // For menu design, always route to Copilot/GitHub Models and never fallback to Gemini.
        boolean forceGithub = isMenuDesignTask
            || preferGithubProvider
            || ((preferGithubForCoding || forceCopilotForCoding) && isCodingTask);

        boolean disableGeminiFallback = (params != null && Boolean.TRUE.equals(params.get("disableGeminiFallback")))
                || "true".equalsIgnoreCase(String.valueOf(params != null ? params.get("disableGeminiFallback") : null));
        if (isMenuDesignTask) {
            disableGeminiFallback = true;
        }
        if (disableFallbackForCoding && isCodingTask) {
            disableGeminiFallback = true;
        }
        if (forceCopilotForCoding && isCodingTask) {
            disableGeminiFallback = true;
        }

        if (forceGithub) {
            if (params != null) {
                params.put("_providerRoutingDecision", isMenuDesignTask
                    ? "forced_github_menu_design_no_gemini_fallback"
                    : (isCodingTask && (preferGithubForCoding || forceCopilotForCoding)
                        ? "forced_copilot_for_coding"
                        : "forced_github_by_preference"));
            }
            if (progressListener != null) {
                progressListener.onProgress(createAiJobProgress("github_models", "Đang gọi GitHub Models (ưu tiên theo yêu cầu)", 0, 1, null));
            }

            String githubRaw = this.gitHubModelsService.generateContent(safePrompt, progressListener);
            if (shouldFallbackToGemini(githubRaw) && !disableGeminiFallback) {
                logger.warn("GitHub Models hit quota/rate limit. Auto fallback to Gemini provider flow.");
                if (progressListener != null) {
                    progressListener.onProgress(createAiJobProgress("gemini_fallback", "GitHub Models hết quota, đang chuyển sang Gemini", 0, 1, null));
                }
                return this.aiProviderFactory.generateContent(safePrompt);
            } else if (shouldFallbackToGemini(githubRaw) && disableGeminiFallback) {
                logger.warn("GitHub Models hit quota/rate limit but Gemini fallback is disabled for this request.");
            }
            return githubRaw;
        }

        if (safePrompt.length() > geminiMaxPromptChars) {
            if (params != null) {
                params.put("_providerRoutingDecision", "fallback_github_prompt_size");
            }
            logger.warn("Prompt size exceeded Gemini limit ({}>{}) chars. Routing to GitHub Models fallback.",
                    safePrompt.length(), geminiMaxPromptChars);
            if (progressListener != null) {
                progressListener.onProgress(createAiJobProgress("github_models", "Đang gọi GitHub Models", 0, 1, null));
            }

            String githubRaw = this.gitHubModelsService.generateContent(safePrompt, progressListener);
            if (shouldFallbackToGemini(githubRaw)) {
                logger.warn("GitHub Models hit quota/rate limit. Auto fallback to Gemini provider flow.");
                if (progressListener != null) {
                    progressListener.onProgress(createAiJobProgress("gemini_fallback", "GitHub Models hết quota, đang chuyển sang Gemini", 0, 1, null));
                }
                return this.aiProviderFactory.generateContent(safePrompt);
            }
            return githubRaw;
        }

        if (params != null) {
            params.put("_providerRoutingDecision", "gemini_first_default");
        }
        if (progressListener != null) {
            progressListener.onProgress(createAiJobProgress("gemini", "Đang gọi Gemini", 0, 1, null));
        }
        return this.aiProviderFactory.generateContent(safePrompt);
    }

    private boolean shouldFallbackToGemini(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return false;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(rawContent, Map.class);

            if (Boolean.FALSE.equals(parsed.get("success"))) {
                String errorCode = String.valueOf(parsed.getOrDefault("errorCode", ""));
                String message = String.valueOf(parsed.getOrDefault("message", ""));
                return isRateOrQuotaFailure(errorCode, message);
            }

            if (Boolean.TRUE.equals(parsed.get("error"))) {
                String errorCode = String.valueOf(parsed.getOrDefault("errorCode", ""));
                String message = String.valueOf(parsed.getOrDefault("message", ""));
                return isRateOrQuotaFailure(errorCode, message);
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private boolean isRateOrQuotaFailure(String errorCode, String message) {
        String code = errorCode == null ? "" : errorCode.toLowerCase();
        String msg = message == null ? "" : message.toLowerCase();

        return code.contains("quota")
                || code.contains("rate")
                || code.contains("429")
                || msg.contains("quota")
                || msg.contains("rate limit")
                || msg.contains("too many requests")
                || msg.contains("per 86400s")
                || msg.contains("userbymodelbyday")
                || msg.contains("rate limit exceeded");
    }

    private String extractAiResultText(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return "";
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(rawContent, Map.class);

            Object topLevelSuccess = parsed.get("success");
            if (topLevelSuccess instanceof Boolean && !((Boolean) topLevelSuccess)) {
                return "";
            }
            Object topLevelError = parsed.get("error");
            if (topLevelError instanceof Boolean && ((Boolean) topLevelError)) {
                return "";
            }

            Object result = parsed.get("result");
            if (result instanceof String) {
                return String.valueOf(result).trim();
            }
            if (result != null) {
                try {
                    return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(result).trim();
                } catch (Exception ignored) {
                    return String.valueOf(result).trim();
                }
            }

            Object content = parsed.get("content");
            if (content instanceof String) {
                return String.valueOf(content).trim();
            }
            if (content != null) {
                try {
                    return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(content).trim();
                } catch (Exception ignored) {
                    return String.valueOf(content).trim();
                }
            }
        } catch (Exception ignored) {
            return rawContent.trim();
        }

        return "";
    }

    private void emitTextAsCopilotChunks(String appId, String text, String responseMode) {
        String source = text == null ? "" : text;
        if (source.isBlank()) {
            return;
        }

        int safeChunk = 2400;
        int total = source.length();
        int sent = 0;
        while (sent < total) {
            int end = Math.min(total, sent + safeChunk);
            String chunk = source.substring(sent, end);
            Map<String, Object> payload = new HashMap<>();
            payload.put("stage", "streaming");
            payload.put("message", "Nhận dữ liệu");
            payload.put("chunk", chunk);
            payload.put("responseMode", responseMode);
            payload.put("current", end);
            payload.put("total", total);
            payload.put("percent", Math.max(0, Math.min(100, (int) Math.round((end * 100.0) / Math.max(1, total)))));
            emitCopilotChatChunk(appId, payload);
            sent = end;
        }
    }

    private void populateAiResponseFromRawContent(StandardResponse response, String rawContent) {

        // Try to parse as JSON first (GeminiService now returns JSON for both success and error)
        ObjectMapper objectMapper = new ObjectMapper();
        int contentLength = rawContent.length();
        logger.info("📥 Raw content from AI service - Length: {} chars", contentLength);
        logger.debug("First 300 chars: {}", rawContent.substring(0, Math.min(300, contentLength)));
        logger.debug("Last 300 chars: {}", rawContent.substring(Math.max(0, contentLength - 300)));
        
        try {
            // Parse JSON directly from rawContent
            @SuppressWarnings("unchecked")
            Map<String, Object> parsedResult = objectMapper.readValue(rawContent, Map.class);

            Object topLevelSuccess = parsedResult.get("success");
            if (topLevelSuccess instanceof Boolean && !((Boolean) topLevelSuccess)) {
                response.set("code", 200);
                response.set("success", false);
                response.set("data", parsedResult);
                response.set("message", String.valueOf(parsedResult.getOrDefault("message", "Lỗi từ dịch vụ AI")));
                Object topLevelErrorCode = parsedResult.get("errorCode");
                if (topLevelErrorCode != null) {
                    response.set("errorCode", topLevelErrorCode);
                }
                Object topLevelProvider = parsedResult.get("provider");
                if (topLevelProvider != null) {
                    response.set("provider", topLevelProvider);
                }
                logger.warn("AI provider returned top-level failure: {}", parsedResult);
                return;
            }
            
            // Check if this is an error response from AI service
            if (parsedResult.containsKey("error") && (Boolean) parsedResult.get("error")) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", (String) parsedResult.getOrDefault("message", "Lỗi từ dịch vụ AI"));
                response.set("errorCode", parsedResult.getOrDefault("errorCode", "UNKNOWN"));
                logger.warn("AI service returned error: {} - {}", 
                    parsedResult.get("errorCode"), parsedResult.get("message"));
                return;
            }
            
            // Extract provider info from wrapped response
            String provider = (String) parsedResult.get("provider");
            Object contentObj = parsedResult.get("content");
            if (contentObj == null && parsedResult.containsKey("result")) {
                contentObj = parsedResult.get("result");
            }

            if (contentObj != null) {
                if (provider == null) {
                    provider = "unknown";
                }

                logger.info("🔍 Processing content from provider: {}", provider);
                
                // Check if content is already parsed as object (JSONObject/Map)
                if (contentObj instanceof Map) {
                    // Content is already parsed JSON object - return as data
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsedData = (Map<String, Object>) contentObj;

                    Object nestedSuccess = parsedData.get("success");
                    if (nestedSuccess instanceof Boolean && !((Boolean) nestedSuccess)) {
                        response.set("code", 200);
                        response.set("success", false);
                        response.set("data", parsedData);
                        response.set("provider", provider);
                        response.set("message", String.valueOf(parsedData.getOrDefault("message", "Lỗi từ nhà cung cấp AI")));
                        Object nestedErrorCode = parsedData.get("errorCode");
                        if (nestedErrorCode != null) {
                            response.set("errorCode", nestedErrorCode);
                        }
                        logger.warn("❌ Provider {} returned nested error object: {}", provider, parsedData);
                        return;
                    }

                    response.set("code", 200);
                    response.set("success", true);
                    response.set("data", parsedData);
                    response.set("provider", provider);
                    response.set("message", "Thành công");
                    logger.info("✅ Successfully processed JSON object content from provider: {} - returning as data field", provider);
                    return;
                }

                // Content is a JSON array (List) - wrap in {menu:[...]} structure
                if (contentObj instanceof java.util.List) {
                    try {
                        @SuppressWarnings("unchecked")
                        java.util.List<Object> contentList = (java.util.List<Object>) contentObj;
                        Map<String, Object> wrappedData = new java.util.HashMap<>();
                        wrappedData.put("menu", contentList);
                        response.set("code", 200);
                        response.set("success", true);
                        response.set("data", wrappedData);
                        response.set("provider", provider);
                        response.set("message", "Thành công");
                        logger.info("✅ AI returned JSON array from provider: {} - wrapped as {{menu:[]}} structure", provider);
                        return;
                    } catch (Exception listEx) {
                        logger.warn("Failed to wrap List content from provider {}: {}", provider, listEx.getMessage());
                    }
                }

                // Content is string - try to parse it
                String contentStr = contentObj.toString();
                logger.info("🔍 Processing string content from provider: {}, length: {} chars", provider, contentStr.length());
                
                // Provider may return pure JSON or markdown-wrapped JSON
                Map<String, Object> parsedData = null;
                
                // Strategy 1: Try direct parse (for pure JSON)
                parsedData = tryParseJson(contentStr.trim(), provider);
                
                if (parsedData == null) {
                    // Strategy 2: Try extracting from markdown
                    logger.debug("[{}] Direct parse failed, trying markdown extraction", provider);
                    parsedData = extractAndParseJson(contentStr, provider);
                }
                
                if (parsedData != null) {
                    // Successfully extracted and parsed JSON
                    response.set("code", 200);
                    response.set("success", true);
                    response.set("data", parsedData);
                    response.set("provider", provider);
                    response.set("message", "Thành công");
                    logger.info("✅ Successfully parsed JSON content from provider: {} - returning as data field", provider);
                    return;
                }
                
                // Could not extract valid JSON - return error to enforce strict JSON output
                logger.warn("❌ No valid JSON found in AI content from {} - returning error", provider);
                
                // But check if message contains markdown JSON block - try to extract it
                String messageContent = contentStr;
                Map<String, Object> extractedJson = null;
                
                // Try to extract JSON from markdown if content looks like it has JSON wrapped in ```
                if (contentStr.contains("```json") || (contentStr.contains("```") && contentStr.contains("{"))) {
                    logger.debug("[{}] Detected markdown JSON block in message, attempting extraction", provider);
                    String cleanedMarkdown = cleanMarkdownFromJson(contentStr);
                    if (cleanedMarkdown != null && !cleanedMarkdown.trim().isEmpty()) {
                        extractedJson = tryParseJson(cleanedMarkdown.trim(), provider);
                        if (extractedJson != null) {
                            logger.info("[{}] ✅ Successfully extracted JSON from markdown block in message", provider);
                            response.set("code", 200);
                            response.set("success", true);
                            response.set("data", extractedJson);
                            response.set("provider", provider);
                            response.set("message", "Thành công");
                            return;
                        }
                    }
                }
                
                response.set("code", 200);
                response.set("success", false);
                response.set("message", "AI trả về dữ liệu không phải JSON hợp lệ");
                response.set("provider", provider);
                response.set("rawContent", messageContent);
                return;
            }

            // Fallback: no provider wrapper, treat as direct content
            response.set("code", 200);
            response.set("success", true);
            response.set("data", parsedResult);
            response.set("message", "Thành công");
            
        } catch (JsonProcessingException e) {
            // Try cleaning markdown as fallback
            logger.warn("Initial JSON parse failed, trying markdown cleanup: {}", e.getMessage());
            String cleanContent = cleanMarkdownFromJson(rawContent);
            
            if (cleanContent == null || cleanContent.isEmpty()) {
                response.set("code", 200);
                response.set("success", false);
                response.set("message", "Không thể parse response từ AI: " + e.getMessage());
                logger.error("Failed to parse AI response and no valid content found");
                return;
            }
            
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> dynamicResult = objectMapper.readValue(cleanContent, Map.class);
                response.set("code", 200);
                response.set("success", true);
                response.set("data", dynamicResult);
                response.set("message", "Thành công");
            } catch (JsonProcessingException e2) {
                // Try escaping newlines in JSON as last resort
                logger.warn("JSON parse failed after markdown cleanup, trying to escape newlines: {}", e2.getMessage());
                String escapedContent = escapeNewlinesInJson(cleanContent);
                
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> dynamicResult = objectMapper.readValue(escapedContent, Map.class);
                    response.set("code", 200);
                    response.set("success", true);
                    response.set("data", dynamicResult);
                    response.set("message", "Thành công");
                    logger.info("✅ Successfully parsed JSON after escaping newlines");
                } catch (JsonProcessingException e3) {
                    // Final fallback: return raw content as text if JSON parsing fails completely
                    logger.warn("JSON parsing failed all attempts, trying final extraction from markdown");
                    
                    // Last attempt: try to extract JSON from markdown block in cleaned content
                    if (cleanContent != null && cleanContent.contains("```")) {
                        logger.info("Attempting JSON extraction from markdown block as last resort");
                        Map<String, Object> lastAttemptJson = tryParseJson(cleanContent.trim(), "lastFallback");
                        if (lastAttemptJson != null) {
                            response.set("code", 200);
                            response.set("success", true);
                            response.set("data", lastAttemptJson);
                            response.set("message", "Thành công (extracted from markdown)");
                            logger.info("✅ Last attempt succeeded - extracted JSON from markdown");
                            return;
                        }
                    }
                    
                    // Strict JSON: return error if parsing failed after all attempts
                    response.set("code", 200);
                    response.set("success", false);
                    response.set("message", "AI trả về dữ liệu không phải JSON hợp lệ");
                    response.set("rawContent", rawContent);
                    logger.warn("❌ Returning error from AI service - JSON parse failed after all attempts (length: {} chars)", 
                        rawContent.length());
                }
            }
        }
    }

    private void handleAiAsyncSubmit(StandardResponse response, String prompt, Map<String, Object> params) {
        if (prompt == null || prompt.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Thiếu tham số 'prompt' để tạo nội dung AI.");
            return;
        }

        if (prompt.length() > maxPromptChars) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Prompt quá dài (tối đa " + maxPromptChars + " ký tự), hiện tại: " + prompt.length());
            response.set("errorCode", "PROMPT_EXCEEDS_ENDPOINT_LIMIT");
            return;
        }

        cleanupExpiredAiJobs();

        String jobId = "ai-job-" + UUID.randomUUID();
        Map<String, Object> job = new ConcurrentHashMap<>();
        long now = System.currentTimeMillis();
        job.put("jobId", jobId);
        job.put("status", "queued");
        job.put("realtimeAppId", String.valueOf(params.getOrDefault("realtimeAppId", params.getOrDefault("appId", ""))).trim());
        job.put("realtimeTaskType", String.valueOf(params.getOrDefault("taskType", "ai_async_job")).trim());
        job.put("createdAt", now);
        job.put("updatedAt", now);
        job.put("cancelled", false);
        job.put("_lastDraftText", "");
        job.put("pollAfterMs", aiAsyncPollMinMs);
        job.put("progress", createAiJobProgress("queued", "Đang xếp hàng xử lý AI", 0, 1, null));
        aiAsyncJobs.put(jobId, job);

        aiAsyncExecutor.submit(() -> {
            try {
                if (isAiJobCancelled(job)) {
                    return;
                }
                job.put("status", "running");
                job.put("updatedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress("starting", "Bắt đầu xử lý yêu cầu AI", 0, 1, null));

                StandardResponse syncResponse = new StandardResponse();
                String rawContent = fetchAiRawContent(prompt, progress -> {
                    if (!isAiJobCancelled(job)) {
                        Map<String, Object> mergedProgress = enrichAiProgressWithMergePreview(progress, params);
                        updateAiAsyncJobProgress(job, enrichAiProgressWithLineTextEdits(mergedProgress, job));
                    }
                }, params);
                if (isAiJobCancelled(job)) {
                    return;
                }
                if (rawContent == null || rawContent.isBlank()) {
                    syncResponse.set("code", 200);
                    syncResponse.set("success", false);
                    syncResponse.set("message", "Không nhận được nội dung hợp lệ từ dịch vụ AI.");
                } else {
                    if (shouldExposeRoutingDebug(params)) {
                        Object routingDecision = params != null ? params.get("_providerRoutingDecision") : null;
                        if (routingDecision != null) {
                            syncResponse.set("providerRoutingDecision", routingDecision);
                        }
                    }
                    // Persist session context file for next AI call continuity
                    try {
                        String promptAppId = this.gitHubModelsService.extractAppIdFromPrompt(prompt);
                        if (promptAppId != null && !promptAppId.isBlank()) {
                            String requestText = extractRequestTextFromPrompt(prompt);
                            this.gitHubModelsService.updateAppContextFile(promptAppId, requestText, rawContent);
                        }
                    } catch (Exception ctxEx) {
                        logger.warn("Could not update AI context file (async): {}", ctxEx.getMessage());
                    }
                    updateAiAsyncJobProgress(job, createAiJobProgress("parsing", "Đang phân tích kết quả AI", 1, 1, null));
                    populateAiResponseFromRawContent(syncResponse, rawContent);
                }

                Map<String, Object> resultPayload = new HashMap<>(syncResponse.getPropertiesMap());
                enrichAiResultWithMergePreview(resultPayload, params);
                if (isAiJobCancelled(job)) {
                    return;
                }
                boolean ok = Boolean.TRUE.equals(resultPayload.get("success"));
                job.put("status", ok ? "completed" : "failed");
                job.put("result", resultPayload);
                job.put("updatedAt", System.currentTimeMillis());
                job.put("completedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress(ok ? "completed" : "failed",
                        ok ? "Đã hoàn tất tạo menu AI" : String.valueOf(resultPayload.getOrDefault("message", "AI xử lý thất bại")),
                        1, 1, null));
                emitAiAsyncJobSocketEvent(job, "ai_job_result", resultPayload);
            } catch (Exception e) {
                if (isAiJobCancelled(job)) {
                    return;
                }
                logger.error("Async AI job failed: {}", jobId, e);
                job.put("status", "failed");
                job.put("updatedAt", System.currentTimeMillis());
                job.put("completedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress("failed", "Lỗi xử lý async AI: " + e.getMessage(), 1, 1, null));
                job.put("result", Map.of(
                        "code", 200,
                        "success", false,
                        "message", "Lỗi xử lý async AI: " + e.getMessage(),
                        "errorCode", "ASYNC_AI_JOB_ERROR"));
                emitAiAsyncJobSocketEvent(job, "ai_job_result", job.get("result"));
            }
        });

        response.set("code", 200);
        response.set("success", true);
        response.set("message", "Đã nhận yêu cầu AI, đang xử lý nền");
        response.set("data", Map.of(
                "jobId", jobId,
                "status", "queued",
            "pollAfterMs", aiAsyncPollMinMs,
            "progress", job.get("progress")));
    }

    private void handleAiAsyncStatus(StandardResponse response, Map<String, Object> params) {
        cleanupExpiredAiJobs();
        String jobId = String.valueOf(params.getOrDefault("jobId", "")).trim();
        if (jobId.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Thiếu tham số jobId");
            response.set("errorCode", "ASYNC_JOB_ID_REQUIRED");
            return;
        }

        Map<String, Object> job = aiAsyncJobs.get(jobId);
        if (job == null) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Không tìm thấy job hoặc job đã hết hạn");
            response.set("errorCode", "ASYNC_JOB_NOT_FOUND");
            return;
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("jobId", jobId);
        payload.put("status", job.getOrDefault("status", "unknown"));
        payload.put("createdAt", job.get("createdAt"));
        payload.put("updatedAt", job.get("updatedAt"));
        payload.put("pollAfterMs", job.getOrDefault("pollAfterMs", aiAsyncPollMinMs));
        payload.put("elapsedMs", System.currentTimeMillis() - ((Number) job.getOrDefault("createdAt", System.currentTimeMillis())).longValue());
        if (job.containsKey("progress")) {
            payload.put("progress", job.get("progress"));
        }
        if (job.containsKey("completedAt")) {
            payload.put("completedAt", job.get("completedAt"));
        }
        if (job.containsKey("result")) {
            payload.put("result", job.get("result"));
        }

        response.set("code", 200);
        response.set("success", true);
        response.set("message", "OK");
        response.set("data", payload);
    }

    private void handleAiAsyncCancel(StandardResponse response, Map<String, Object> params) {
        cleanupExpiredAiJobs();
        String jobId = String.valueOf(params.getOrDefault("jobId", "")).trim();
        if (jobId.isEmpty()) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Thiếu tham số jobId");
            response.set("errorCode", "ASYNC_JOB_ID_REQUIRED");
            return;
        }

        Map<String, Object> job = aiAsyncJobs.get(jobId);
        if (job == null) {
            response.set("code", 200);
            response.set("success", false);
            response.set("message", "Không tìm thấy job hoặc job đã hết hạn");
            response.set("errorCode", "ASYNC_JOB_NOT_FOUND");
            return;
        }

        String status = String.valueOf(job.getOrDefault("status", "unknown")).toLowerCase();
        if ("completed".equals(status) || "failed".equals(status) || "cancelled".equals(status)) {
            response.set("code", 200);
            response.set("success", true);
            response.set("message", "Job đã ở trạng thái kết thúc");
            response.set("data", Map.of(
                    "jobId", jobId,
                    "status", status));
            return;
        }

        job.put("cancelled", true);
        job.put("status", "cancelled");
        job.put("updatedAt", System.currentTimeMillis());
        job.put("completedAt", System.currentTimeMillis());
        updateAiAsyncJobProgress(job, createAiJobProgress("cancelled", "Đã dừng theo yêu cầu người dùng", 1, 1, null));
        Map<String, Object> cancelResult = new HashMap<>();
        cancelResult.put("code", 200);
        cancelResult.put("success", false);
        cancelResult.put("message", "AI job đã được dừng theo yêu cầu");
        cancelResult.put("errorCode", "ASYNC_JOB_CANCELLED");
        job.put("result", cancelResult);
        emitAiAsyncJobSocketEvent(job, "ai_job_result", cancelResult);

        response.set("code", 200);
        response.set("success", true);
        response.set("message", "Đã gửi yêu cầu dừng AI job");
        response.set("data", Map.of(
                "jobId", jobId,
                "status", "cancelled"));
    }

    private boolean isAiJobCancelled(Map<String, Object> job) {
        if (job == null) {
            return false;
        }
        if (Boolean.TRUE.equals(job.get("cancelled"))) {
            return true;
        }
        String status = String.valueOf(job.getOrDefault("status", "")).trim().toLowerCase();
        return "cancelled".equals(status);
    }

    private void cleanupExpiredAiJobs() {
        long now = System.currentTimeMillis();
        long ttl = Math.max(60000L, aiAsyncJobTtlMs);
        aiAsyncJobs.entrySet().removeIf(entry -> {
            Object createdObj = entry.getValue().get("createdAt");
            long createdAt = (createdObj instanceof Number) ? ((Number) createdObj).longValue() : now;
            return now - createdAt > ttl;
        });
    }

    private void updateAiAsyncJobProgress(Map<String, Object> job, Map<String, Object> progress) {
        if (job == null || progress == null) {
            return;
        }
        job.put("progress", new HashMap<>(progress));
        job.put("updatedAt", System.currentTimeMillis());
        emitAiAsyncJobSocketEvent(job, "ai_job_progress", null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enrichAiProgressWithMergePreview(Map<String, Object> progress, Map<String, Object> params) {
        if (progress == null) {
            return null;
        }

        Map<String, Object> enriched = new HashMap<>(progress);
        if (params == null) {
            return enriched;
        }

        String mergeScenario = String.valueOf(params.getOrDefault("mergeScenario", "")).trim();
        String mergeOldJson = String.valueOf(params.getOrDefault("mergeOldJson", "")).trim();
        if (mergeScenario.isEmpty() || mergeOldJson.isEmpty()) {
            return enriched;
        }

        Object draftObj = enriched.get("draftText");
        if (!(draftObj instanceof String draftText) || draftText.isBlank()) {
            return enriched;
        }

        try {
            Object parsedDraft = objectMapper.readValue(draftText, Object.class);
            AiMenuMergeService.MergeOutput mergeOut;
            if ("property_edit".equalsIgnoreCase(mergeScenario)) {
                Object nodeObj = parsedDraft;
                if (parsedDraft instanceof Map<?, ?> draftMap) {
                    Object directNode = draftMap.get("menu_node");
                    if (directNode != null) {
                        nodeObj = directNode;
                    }
                }
                mergeOut = aiMenuMergeService.mergeMenuNode(
                        mergeOldJson,
                        objectMapper.writeValueAsString(nodeObj));
            } else if ("incremental_update".equalsIgnoreCase(mergeScenario)) {
                mergeOut = aiMenuMergeService.diffMergeTrees(
                        mergeOldJson,
                        objectMapper.writeValueAsString(parsedDraft));
                if (mergeOut.mergedMenu != null && !mergeOut.mergedMenu.isEmpty()) {
                    Map<String, Object> normalizedDraft = new HashMap<>();
                    normalizedDraft.put("menu", mergeOut.mergedMenu);
                    if (parsedDraft instanceof Map<?, ?> draftMap) {
                        Object draftStage = draftMap.get("_draft_stage");
                        Object draftProgress = draftMap.get("_draft_progress");
                        if (draftStage != null) {
                            normalizedDraft.put("_draft_stage", draftStage);
                        }
                        if (draftProgress != null) {
                            normalizedDraft.put("_draft_progress", draftProgress);
                        }
                    }
                    enriched.put("draftText", objectMapper.writeValueAsString(normalizedDraft));
                }
            } else {
                return enriched;
            }

            Map<String, Object> mergePreview = objectMapper.convertValue(mergeOut, Map.class);
            enriched.put("_merge_preview", mergePreview);

            Object patchOps = mergePreview.get("patchOps");
            if (patchOps instanceof List && !((List<?>) patchOps).isEmpty()) {
                enriched.put("patchOps", patchOps);
            }

            logger.info("[REALTIME_MERGE_PREVIEW] stage={} scenario={} patchOps={} added={} edited={} deleted={}",
                    String.valueOf(enriched.getOrDefault("stage", "")),
                    mergeScenario,
                    mergeOut.patchOps == null ? 0 : mergeOut.patchOps.size(),
                    mergeOut.added,
                    mergeOut.edited,
                    mergeOut.deleted);
        } catch (Exception e) {
            logger.debug("Could not enrich realtime AI progress with merge preview: {}", e.getMessage());
        }

        return enriched;
    }

    @SuppressWarnings("unchecked")
    private void enrichAiResultWithMergePreview(Map<String, Object> resultPayload, Map<String, Object> params) {
        if (resultPayload == null || params == null) {
            return;
        }
        String mergeScenario = String.valueOf(params.getOrDefault("mergeScenario", "")).trim();
        String mergeOldJson = String.valueOf(params.getOrDefault("mergeOldJson", "")).trim();
        if (mergeScenario.isEmpty() || mergeOldJson.isEmpty()) {
            return;
        }
        Object dataObj = resultPayload.get("data");
        if (!(dataObj instanceof Map)) {
            return;
        }

        try {
            Map<String, Object> dataMap = (Map<String, Object>) dataObj;
            AiMenuMergeService.MergeOutput mergeOut;
            if ("property_edit".equalsIgnoreCase(mergeScenario)) {
                Object nodeObj = dataMap.get("menu_node");
                if (nodeObj == null) {
                    nodeObj = dataMap;
                }
                mergeOut = aiMenuMergeService.mergeMenuNode(
                        mergeOldJson,
                        objectMapper.writeValueAsString(nodeObj));
                if (mergeOut.mergedMenu != null && !mergeOut.mergedMenu.isEmpty()) {
                    dataMap.put("menu_node", mergeOut.mergedMenu.get(0));
                }
            } else if ("incremental_update".equalsIgnoreCase(mergeScenario)) {
                mergeOut = aiMenuMergeService.diffMergeTrees(
                        mergeOldJson,
                        objectMapper.writeValueAsString(dataMap));
                if (mergeOut.mergedMenu != null) {
                    dataMap.put("menu", mergeOut.mergedMenu);
                }
            } else {
                return;
            }
            dataMap.put("_merge_preview", objectMapper.convertValue(mergeOut, Map.class));
        } catch (Exception e) {
            logger.debug("Could not enrich AI result with merge preview: {}", e.getMessage());
        }
    }

    private void emitAiAsyncJobSocketEvent(Map<String, Object> job, String eventName, Object result) {
        if (job == null || eventName == null || eventName.isBlank() || socketIOServer == null) {
            return;
        }
        String room = String.valueOf(job.getOrDefault("realtimeAppId", "")).trim();
        if (room.isEmpty()) {
            return;
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("jobId", job.get("jobId"));
            payload.put("status", job.getOrDefault("status", "unknown"));
            payload.put("taskType", job.getOrDefault("realtimeTaskType", "ai_async_job"));
            payload.put("appId", room);
            payload.put("updatedAt", job.get("updatedAt"));
            payload.put("createdAt", job.get("createdAt"));
            if (job.containsKey("progress")) {
                payload.put("progress", job.get("progress"));
            }
            if (result != null) {
                payload.put("result", result);
            } else if (job.containsKey("result")) {
                payload.put("result", job.get("result"));
            }
            socketIOServer.getRoomOperations(room).sendEvent(eventName, payload);
            if (containsAiPatchPayload(payload)) {
                socketIOServer.getRoomOperations(room).sendEvent("ai_job_patch", payload);
            }
        } catch (Exception e) {
            logger.debug("Failed to emit async AI socket event {}: {}", eventName, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private boolean containsAiPatchPayload(Map<String, Object> payload) {
        if (payload == null) {
            return false;
        }
        Object progressObj = payload.get("progress");
        if (progressObj instanceof Map) {
            Map<String, Object> progress = (Map<String, Object>) progressObj;
            if (progress.get("draftText") != null || progress.get("partialJson") != null || progress.get("previewJson") != null) {
                return true;
            }
            Object textEdits = progress.get("textEdits");
            Object patchOps = progress.get("patchOps");
            if ((textEdits instanceof java.util.List && !((java.util.List<?>) textEdits).isEmpty())
                    || (patchOps instanceof java.util.List && !((java.util.List<?>) patchOps).isEmpty())) {
                return true;
            }
        }

        Object resultObj = payload.get("result");
        if (resultObj instanceof Map) {
            Map<String, Object> result = (Map<String, Object>) resultObj;
            if (result.get("draftText") != null) {
                return true;
            }
            Object nestedData = result.get("data");
            if (nestedData instanceof Map && ((Map<?, ?>) nestedData).get("_merge_preview") != null) {
                return true;
            }
            if (result.get("_merge_preview") != null) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> createAiJobProgress(String stage, String message, int current, int total, Map<String, Object> extra) {
        Map<String, Object> progress = new HashMap<>();
        progress.put("stage", stage);
        progress.put("message", message);
        progress.put("current", Math.max(0, current));
        progress.put("total", Math.max(1, total));
        int safeTotal = Math.max(1, total);
        int safeCurrent = Math.max(0, Math.min(current, safeTotal));
        progress.put("percent", Math.max(0, Math.min(100, (int) Math.round((safeCurrent * 100.0) / safeTotal))));
        if (extra != null && !extra.isEmpty()) {
            progress.putAll(extra);
        }
        return progress;
    }

    private Map<String, Object> enrichAiProgressWithLineTextEdits(Map<String, Object> progress, Map<String, Object> job) {
        if (progress == null) {
            return null;
        }
        if (job == null) {
            return progress;
        }

        String nextDraft = extractRealtimeDraftText(progress);
        if (nextDraft.isBlank()) {
            return progress;
        }

        String previousDraft = String.valueOf(job.getOrDefault("_lastDraftText", ""));
        if (nextDraft.equals(previousDraft)) {
            return progress;
        }

        List<Map<String, Object>> generated = buildLineTextEdits(previousDraft, nextDraft);
        job.put("_lastDraftText", nextDraft);
        if (generated.isEmpty()) {
            return progress;
        }

        Object existingTextEdits = progress.get("textEdits");
        Object existingLineRanges = progress.get("lineRanges");
        Object existingChangedRanges = progress.get("changedRanges");
        if ((existingTextEdits instanceof List && !((List<?>) existingTextEdits).isEmpty())
                || (existingLineRanges instanceof List && !((List<?>) existingLineRanges).isEmpty())
                || (existingChangedRanges instanceof List && !((List<?>) existingChangedRanges).isEmpty())) {
            return progress;
        }

        Map<String, Object> enriched = new HashMap<>(progress);
        enriched.put("textEdits", generated);
        List<Map<String, Object>> ranges = convertTextEditsToLineRanges(generated);
        if (!ranges.isEmpty()) {
            enriched.put("lineRanges", ranges);
            enriched.put("changedRanges", ranges);
        }
        return enriched;
    }

    private String extractRealtimeDraftText(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return "";
        }
        String[] keys = new String[] {
            "draftText", "partialJson", "previewJson", "draftCode", "partialCode", "previewCode", "code"
        };
        for (String key : keys) {
            Object value = payload.get(key);
            if (value instanceof String) {
                String text = (String) value;
                if (!text.isBlank()) {
                    return text;
                }
            }
        }
        return "";
    }

    private List<Map<String, Object>> buildLineTextEdits(String beforeText, String afterText) {
        String oldText = beforeText == null ? "" : beforeText;
        String newText = afterText == null ? "" : afterText;
        if (newText.equals(oldText)) {
            return Collections.emptyList();
        }

        String[] oldLines = oldText.split("\\n", -1);
        String[] newLines = newText.split("\\n", -1);

        int prefix = 0;
        int minLen = Math.min(oldLines.length, newLines.length);
        while (prefix < minLen && oldLines[prefix].equals(newLines[prefix])) {
            prefix++;
        }

        int oldSuffix = oldLines.length - 1;
        int newSuffix = newLines.length - 1;
        while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix].equals(newLines[newSuffix])) {
            oldSuffix--;
            newSuffix--;
        }

        int oldChangedCount = oldSuffix >= prefix ? (oldSuffix - prefix + 1) : 0;
        int newChangedCount = newSuffix >= prefix ? (newSuffix - prefix + 1) : 0;
        if (oldChangedCount == 0 && newChangedCount == 0) {
            return Collections.emptyList();
        }

        int startLine = prefix + 1;
        int endLine = oldChangedCount > 0 ? (oldSuffix + 1) : startLine;
        String replacement = newChangedCount > 0
            ? String.join("\n", Arrays.copyOfRange(newLines, prefix, newSuffix + 1))
            : "";

        String action;
        if (oldChangedCount == 0 && newChangedCount > 0) {
            action = "add";
        } else if (newChangedCount == 0 && oldChangedCount > 0) {
            action = "delete";
        } else {
            action = "edit";
        }

        Map<String, Object> edit = new HashMap<>();
        edit.put("startLine", startLine);
        edit.put("endLine", Math.max(startLine, endLine));
        edit.put("replacement", replacement);
        edit.put("action", action);

        return List.of(edit);
    }

    private List<Map<String, Object>> convertTextEditsToLineRanges(List<Map<String, Object>> textEdits) {
        if (textEdits == null || textEdits.isEmpty()) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> ranges = new ArrayList<>();
        for (Map<String, Object> edit : textEdits) {
            if (edit == null) continue;
            int startLine = parseIntOrDefault(edit.get("startLine"), 1);
            int endLine = Math.max(startLine, parseIntOrDefault(edit.get("endLine"), startLine));
            String action = String.valueOf(edit.getOrDefault("action", "edit"));

            Map<String, Object> range = new HashMap<>();
            range.put("startLine", startLine);
            range.put("endLine", endLine);
            range.put("fromLine", startLine);
            range.put("toLine", endLine);
            range.put("action", action);
            range.put("type", action);
            ranges.add(range);
        }
        return ranges;
    }

    private int parseIntOrDefault(Object raw, int fallback) {
        if (raw instanceof Number) {
            return ((Number) raw).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    /**
     * Làm sạch chuỗi JSON thô bằng cách loại bỏ các ký tự markdown bao quanh.
     *
     * <p>
     * Phương thức này tìm kiếm dấu ngoặc nhọn đầu tiên và cuối cùng trong chuỗi để
     * trích xuất phần
     * nội dung JSON, phòng trường hợp API trả về JSON được bọc trong khối mã
     * markdown (ví dụ:
     * ```json...```).
     *
     * @param rawContent chuỗi thô nhận được từ API.
     * @return một chuỗi chỉ chứa nội dung JSON, hoặc {@code null} nếu đầu vào là
     *         null/trống.
     */
    private String cleanMarkdownFromJson(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return null;
        }

        // First, try to extract JSON from markdown code block (```json ... ```)
        int jsonBlockStart = rawContent.indexOf("```json");
        if (jsonBlockStart != -1) {
            int contentStart = rawContent.indexOf('\n', jsonBlockStart);
            if (contentStart != -1) {
                int jsonBlockEnd = rawContent.indexOf("```", contentStart);
                if (jsonBlockEnd != -1) {
                    String extracted = rawContent.substring(contentStart + 1, jsonBlockEnd).trim();
                    logger.debug("Extracted JSON from markdown block, length: {}", extracted.length());
                    return extracted;
                }
            }
        }
        
        // Also try generic code block (``` ... ```)
        int codeBlockStart = rawContent.indexOf("```");
        if (codeBlockStart != -1) {
            int contentStart = rawContent.indexOf('\n', codeBlockStart);
            if (contentStart != -1) {
                int codeBlockEnd = rawContent.indexOf("```", contentStart);
                if (codeBlockEnd != -1) {
                    String extracted = rawContent.substring(contentStart + 1, codeBlockEnd).trim();
                    // Verify it's JSON by checking if it starts with {
                    if (extracted.startsWith("{")) {
                        logger.debug("Extracted JSON from generic code block, length: {}", extracted.length());
                        return extracted;
                    }
                }
            }
        }

        // Fallback: find first { and matching }
        int firstBrace = rawContent.indexOf('{');
        
        if (firstBrace != -1) {
            // Find matching closing brace
            int matchingBrace = findMatchingBrace(rawContent, firstBrace);
            if (matchingBrace != -1) {
                String extracted = rawContent.substring(firstBrace, matchingBrace + 1);
                logger.debug("Extracted JSON using brace matching, length: {}", extracted.length());
                return extracted;
            }
        }

        logger.warn("Could not extract JSON from content");
        return rawContent;
    }

    /**
     * Extract and parse JSON from AI response content.
     * This method handles legacy responses with markdown formatting.
     * 
    * Note: Provider may return pure JSON or markdown-wrapped JSON,
    * so this method is mainly for markdown-wrapped responses.
     * 
     * @param contentStr Raw content from AI provider
     * @param provider Provider name for logging
     * @return Parsed JSON as Map, or null if no valid JSON found
     */
    private Map<String, Object> extractAndParseJson(String contentStr, String provider) {
        if (contentStr == null || contentStr.trim().isEmpty()) {
            logger.warn("[{}] Empty content provided to extractAndParseJson", provider);
            return null;
        }
        
        // Strategy 1: Try to extract from markdown code block first
        String cleanedContent = cleanMarkdownFromJson(contentStr);
        if (cleanedContent != null && !cleanedContent.isEmpty()) {
            String trimmedContent = cleanedContent.trim();
            
            logger.debug("[{}] Cleaned content length: {}, starts with '{{': {}", 
                provider, trimmedContent.length(), trimmedContent.startsWith("{"));
            
            // Check for truncation indicators
            if (trimmedContent.contains("...") || trimmedContent.contains("(nội dung như trên)") || 
                trimmedContent.contains("(nội dung tiếng") || trimmedContent.contains("省略")) {
                logger.warn("[{}] ⚠️ Detected truncated/summarized content - AI may have abbreviated the response", provider);
            }
            
            // Strategy 2: Try to parse the cleaned content
            Map<String, Object> parsed = tryParseJson(trimmedContent, provider);
            if (parsed != null) {
                // Validate content quality
                validateContentQuality(parsed, provider);
                return parsed;
            }
        }
        
        // Strategy 3: If cleanMarkdownFromJson failed, try to find JSON object manually
        // Look for first { and last } in the original content
        int firstBrace = contentStr.indexOf('{');
        int lastBrace = contentStr.lastIndexOf('}');
        
        if (firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace) {
            String extracted = contentStr.substring(firstBrace, lastBrace + 1);
            logger.debug("[{}] Extracted JSON manually from content (length: {})", provider, extracted.length());
            
            Map<String, Object> parsed = tryParseJson(extracted, provider);
            if (parsed != null) {
                validateContentQuality(parsed, provider);
                return parsed;
            }
        }
        
        logger.warn("[{}] ❌ Could not extract valid JSON from content after trying all strategies", provider);
        return null;
    }
    
    /**
     * Try to parse JSON string into Map.
     * 
     * @param jsonStr JSON string to parse
     * @param provider Provider name for logging
     * @return Parsed Map or null if parsing failed
     */
    private Map<String, Object> tryParseJson(String jsonStr, String provider) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            return null;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> result = objectMapper.readValue(jsonStr, Map.class);
            logger.info("[{}] ✅ Successfully parsed JSON (keys: {})", provider, result.keySet());
            return result;
        } catch (JsonProcessingException e) {
            logger.debug("[{}] Failed to parse JSON as Map: {}. First 200 chars: {}",
                provider, e.getMessage(),
                jsonStr.substring(0, Math.min(200, jsonStr.length())));

            // Try parsing as a JSON array -> wrap in {menu:[...]}
            String trimmed = jsonStr.trim();
            if (trimmed.startsWith("[")) {
                try {
                    @SuppressWarnings("unchecked")
                    java.util.List<Object> list = objectMapper.readValue(trimmed, java.util.List.class);
                    Map<String, Object> wrapped = new java.util.HashMap<>();
                    wrapped.put("menu", list);
                    logger.info("[{}] ✅ Parsed JSON array and wrapped as {{menu:[]}} (size: {})", provider, list.size());
                    return wrapped;
                } catch (JsonProcessingException ea) {
                    logger.debug("[{}] Array parse failed: {}", provider, ea.getMessage());
                }
            }

            String normalized = normalizeJsonString(jsonStr);
            if (!normalized.equals(jsonStr)) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> retry = objectMapper.readValue(normalized, Map.class);
                    logger.info("[{}] ✅ Successfully parsed JSON after normalization (keys: {})", provider, retry.keySet());
                    return retry;
                } catch (JsonProcessingException e2) {
                    logger.debug("[{}] Normalized parse failed: {}", provider, e2.getMessage());
                }
            }

            return null;
        }
    }

    private String normalizeJsonString(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            return jsonStr;
        }

        String normalized = jsonStr;
        normalized = normalized.replace("\uFEFF", "");
        normalized = normalized.replace("\u201C", "\"");
        normalized = normalized.replace("\u201D", "\"");
        normalized = normalized.replace("\u2018", "'");
        normalized = normalized.replace("\u2019", "'");
        normalized = normalized.replaceAll(",\\s*([}\\]])", "$1");
        normalized = escapeNewlinesInJson(normalized);

        return normalized;
    }
    
    /**
     * Validate quality of parsed content.
     * Warns about truncated or incomplete content.
     * 
     * @param parsedData Parsed JSON data
     * @param provider Provider name for logging
     */
    private void validateContentQuality(Map<String, Object> parsedData, String provider) {
        // Check for incomplete content fields
        Object contentField = parsedData.get("content");
        if (contentField instanceof String) {
            String fieldValue = (String) contentField;
            if (fieldValue.contains("...") || fieldValue.contains("(nội dung như trên)")) {
                logger.warn("[{}] ⚠️ Content field contains truncation indicators", provider);
            }
            if (fieldValue.length() < 100) {
                logger.warn("[{}] ⚠️ Content field appears too short ({} chars)", provider, fieldValue.length());
            }
        }
        
        // Check content_en and content_zh too
        for (String key : new String[]{"content_en", "content_zh"}) {
            Object field = parsedData.get(key);
            if (field instanceof String) {
                String value = (String) field;
                if (value.contains("...") || value.length() < 50) {
                    logger.warn("[{}] ⚠️ Field '{}' appears truncated or too short ({} chars)", 
                        provider, key, value.length());
                }
            }
        }
    }

    private void handleWebScrape(StandardResponse response, Map<String, Object> params) {
        String link = (String) params.get("link");
        if (link == null || link.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'link' parameter for web scraping.");
            return;
        }

        Map<String, String> proxyConfig = null;
        if (params.containsKey("proxyServer")) {
            proxyConfig = new HashMap<>();
            proxyConfig.put("server", (String) params.get("proxyServer"));
            if (params.containsKey("proxyUsername")) {
                proxyConfig.put("username", (String) params.get("proxyUsername"));
            }
            if (params.containsKey("proxyPassword")) {
                proxyConfig.put("password", (String) params.get("proxyPassword"));
            }
        }

        // Lấy các tham số tùy chọn khác
        boolean listenToConsole = Boolean.parseBoolean(String.valueOf(params.getOrDefault("listenToConsole", "false")));
        boolean useIncognito = Boolean.parseBoolean(String.valueOf(params.getOrDefault("useIncognito", "false")));
        String onPageLoadedScript = (String) params.get("onPageLoadedScript");
        String scriptToExecute = (String) params.get("scriptToExecute");

        logger.info("Scraping URL: {} with proxy: {}, incognito: {}, console: {}", link, proxyConfig != null,
                useIncognito, listenToConsole);

        try {
            String htmlContent = webScraperService.getHtmlContentInternal(
                    link,
                    proxyConfig,
                    scriptToExecute, // Script để thực thi sau khi tải
                    listenToConsole,
                    useIncognito,
                    onPageLoadedScript // Script chạy khi Loaded
            );

            if (htmlContent != null && !htmlContent.isEmpty()) {
                response.set("code", 200);
                response.set("message", "Scraping successful");
                response.set("data", htmlContent);
            } else {
                response.set("code", 500);
                response.set("message", "Failed to retrieve content from " + link);
            }
        } catch (Exception e) {
            logger.error("Error during web scraping for link {}: {}", link, e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Internal server error during scraping: " + e.getMessage());
        }
    }

    private void handleExecuteJsOnPage(StandardResponse response, Map<String, Object> params) {
        String link = (String) params.get("link");
        String script = (String) params.get("script");

        if (link == null || link.isEmpty() || script == null || script.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'link' or 'script' parameters for JavaScript execution.");
            return;
        }

        Map<String, String> proxyConfig = null;
        if (params.containsKey("proxyServer")) {
            proxyConfig = new HashMap<>();
            proxyConfig.put("server", (String) params.get("proxyServer"));
            if (params.containsKey("proxyUsername")) {
                proxyConfig.put("username", (String) params.get("proxyUsername"));
            }
            if (params.containsKey("proxyPassword")) {
                proxyConfig.put("password", (String) params.get("proxyPassword"));
            }
        }

        boolean useIncognito = Boolean.parseBoolean(String.valueOf(params.getOrDefault("useIncognito", "false")));
        String onPageLoadedScript = (String) params.get("onPageLoadedScript"); // Script chạy khi Loaded

        logger.info("Executing JS on URL: {} with script: {}", link,
                script.substring(0, Math.min(script.length(), 100)) + "...");

        try {
            // Sử dụng executeJavaScriptInternal để thực thi script và nhận kết quả
            String jsResult = webScraperService.executeJavaScriptInternal(
                    link,
                    proxyConfig,
                    script,
                    useIncognito,
                    onPageLoadedScript // Script chạy khi Loaded
            );

            if (jsResult != null) {
                response.set("code", 200);
                response.set("message", "JavaScript execution successful");
                // Chú ý: jsResult đã là JSON string nếu script của bạn trả về JSON.stringify()
                response.set("data", jsResult);
            } else {
                response.set("code", 500);
                response.set("message", "Failed to execute JavaScript on " + link);
            }
        } catch (Exception e) {
            logger.error("Error during JavaScript execution for link {}: {}", link, e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Internal server error during JavaScript execution: " + e.getMessage());
        }
    }

    // Removed: Not used in current implementation
    // private static final int GOOGLE_INDEX_API_DAILY_LIMIT = 200; // Giới hạn miễn phí của Google
    private static final int DELAY_BETWEEN_REQUESTS_MS = 500; // Delay 500ms giữa các request

    private void handleGoogleIndexing(StandardResponse response, Map<String, Object> params) {
        String operation = (String) params.getOrDefault("operation", "submit");

        switch (operation.toLowerCase()) {
            case "submit":
                handleIndexingSubmit(response, params);
                break;
            case "check":
                handleIndexingCheck(response, params);
                break;
            case "check-auto":
                handleCheckAndAutoPublish(response, params);
                break;
            case "quota":
                handleQuotaInfo(response, params);
                break;
            case "sites":
                handleSitesList(response, params);
                break;
            // ========== QUEUE OPERATIONS ==========
            case "add-to-queue":
                handleAddToQueue(response, params);
                break;
            case "add-batch-to-queue":
                handleAddBatchToQueue(response, params);
                break;
            case "queue-info":
                handleQueueInfo(response, params);
                break;
            case "queue-items":
                handleQueueItems(response, params);
                break;
            case "process-queue":
                handleProcessQueue(response, params);
                break;
            case "remove-from-queue":
                handleRemoveFromQueue(response, params);
                break;
            case "history":
                handleHistory(response, params);
                break;
            case "recent-history":
                handleRecentHistory(response, params);
                break;
            default:
                response.set("code", 400);
                response.set("message", "Invalid operation: " + operation);
                break;
        }
    }

    /**
     * Gửi URLs lên Google Indexing API
     */
    private void handleIndexingSubmit(StandardResponse response, Map<String, Object> params) {
        Object urlParam = params.get("url");
        Object urlsParam = params.get("urls");
        String action = (String) params.getOrDefault("action", "publish");

        java.util.List<String> urlList = new java.util.ArrayList<>();

        if (urlParam != null && !urlParam.toString().isEmpty()) {
            urlList.add(urlParam.toString());
        } else if (urlsParam instanceof java.util.List) {
            if (urlsParam instanceof java.util.List) {
                @SuppressWarnings("unchecked")
                java.util.List<String> urlsList = (java.util.List<String>) urlsParam;
                urlList.addAll(urlsList);
            }
        } else if (urlsParam != null) {
            urlList.add(urlsParam.toString());
        }

        if (urlList.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' or 'urls' parameter");
            return;
        }

        if (!googleIndexService.checkQuotaAvailable(urlList.size())) {
            response.set("code", 429);
            response.set("message", "Quota exceeded");
            response.set("data", googleIndexService.getQuotaInfo());
            return;
        }

        logger.info("📨 Submitting {} URLs to Google Indexing API", urlList.size());

        try {
            java.util.List<Map<String, Object>> results = new java.util.ArrayList<>();
            int successCount = 0;
            int failureCount = 0;

            for (String url : urlList) {
                GoogleIndexService.IndexingResult result = googleIndexService.submitUrlToGoogle(url, action);
                Map<String, Object> resultItem = new HashMap<>();
                resultItem.put("url", url);
                resultItem.put("success", result.success);
                resultItem.put("message", result.message);
                if (result.responseBody != null) {
                    resultItem.put("response", result.responseBody);
                }
                results.add(resultItem);

                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                }

                // Delay để tránh rate limiting
                if (urlList.indexOf(url) < urlList.size() - 1) {
                    try {
                        Thread.sleep(DELAY_BETWEEN_REQUESTS_MS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }

            response.set("code", 200);
            response.set("success", successCount > 0);

            Map<String, Object> summary = new HashMap<>();
            summary.put("total_submitted", urlList.size());
            summary.put("success_count", successCount);
            summary.put("failure_count", failureCount);
            summary.put("quota", googleIndexService.getQuotaInfo());
            summary.put("results", results);

            response.set("data", summary);
            response.set("message", successCount + " URLs submitted successfully");

        } catch (Exception e) {
            logger.error("❌ Error during indexing submission: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Kiểm tra indexing status từ Google Search Console
     */
    private void handleIndexingCheck(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            GoogleIndexService.SearchConsoleResult result = googleIndexService.checkIndexingStatus(url);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("indexed", result.isIndexed);
            data.put("verdict", result.verdict);
            if (result.details != null) {
                data.put("details", result.details);
            }

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Indexing status: " + result.verdict);

        } catch (Exception e) {
            logger.error("❌ Error checking indexing status: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Kiểm tra indexing status và tự động publish nếu NEUTRAL
     */
    private void handleCheckAndAutoPublish(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            Map<String, Object> result = googleIndexService.checkIndexingStatusAndAutoPublish(url);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", result);
            response.set("message", (String) result.get("message"));

        } catch (Exception e) {
            logger.error("❌ Error checking and auto-publishing: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy thông tin quota
     */
    private void handleQuotaInfo(StandardResponse response, Map<String, Object> params) {
        try {
            Map<String, Object> quotaInfo = googleIndexService.getQuotaInfo();
            response.set("code", 200);
            response.set("success", true);
            response.set("data", quotaInfo);
            response.set("message", "Quota information retrieved");
        } catch (Exception e) {
            logger.error("❌ Error getting quota info: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách sites từ Google Search Console
     */
    private void handleSitesList(StandardResponse response, Map<String, Object> params) {
        try {
            java.util.List<Map<String, Object>> sites = googleIndexService.getSiteList();
            response.set("code", 200);
            response.set("success", true);
            response.set("data", sites);
            response.set("message", "Retrieved " + sites.size() + " sites");
        } catch (Exception e) {
            logger.error("❌ Error getting sites list: {}", e.getMessage());
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    // ========== Deprecated: Removed old Google Index methods ==========
    // handleGoogleIndexRequest() - replaced by
    // GoogleIndexService.submitUrlToGoogle()
    // sendToGoogleIndexingApi() - replaced by internal sendIndexingRequest()
    // These are now handled by GoogleIndexService with proper retry logic and quota
    // management

    // ========== QUEUE MANAGEMENT OPERATIONS ==========

    /**
     * Thêm URL vào queue
     * POST /api/indexgoogle với body: {"operation": "add-to-queue", "url": "...",
     * "action": "publish", "priority": 5}
     */
    private void handleAddToQueue(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        String action = (String) params.getOrDefault("action", "publish");
        int priority = params.containsKey("priority")
                ? ((Number) params.get("priority")).intValue()
                : 5;

        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            boolean added = googleIndexService.addToQueue(url, action, priority);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("added", added);
            data.put("message", added ? "Added to queue" : "Already in queue or recently submitted");
            data.put("queue_info", googleIndexQueueService.getQueueInfo());

            response.set("code", 200);
            response.set("success", added);
            response.set("data", data);
            response.set("message", data.get("message"));

        } catch (Exception e) {
            logger.error("❌ Error adding to queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Thêm nhiều URLs vào queue
     * POST /api/indexgoogle với body: {"operation": "add-batch-to-queue", "urls":
     * [...], "action": "publish", "priority": 5}
     */
    private void handleAddBatchToQueue(StandardResponse response, Map<String, Object> params) {
        Object urlsParam = params.get("urls");
        String action = (String) params.getOrDefault("action", "publish");
        int priority = params.containsKey("priority")
                ? ((Number) params.get("priority")).intValue()
                : 5;

        if (urlsParam == null) {
            response.set("code", 400);
            response.set("message", "Missing 'urls' parameter");
            return;
        }

        try {
            @SuppressWarnings("unchecked")
            java.util.List<String> urls = (java.util.List<String>) urlsParam;

            if (urls.isEmpty()) {
                response.set("code", 400);
                response.set("message", "URLs list is empty");
                return;
            }

            Map<String, Boolean> results = googleIndexService.addBatchToQueue(urls, action, priority);

            long addedCount = results.values().stream().filter(v -> v).count();
            long skippedCount = results.values().stream().filter(v -> !v).count();

            Map<String, Object> data = new HashMap<>();
            data.put("total", urls.size());
            data.put("added", addedCount);
            data.put("skipped", skippedCount);
            data.put("results", results);
            data.put("queue_info", googleIndexQueueService.getQueueInfo());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", String.format("Added %d/%d URLs to queue", addedCount, urls.size()));

        } catch (Exception e) {
            logger.error("❌ Error adding batch to queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy thông tin queue
     * POST /api/indexgoogle với body: {"operation": "queue-info"}
     */
    private void handleQueueInfo(StandardResponse response, Map<String, Object> params) {
        try {
            Map<String, Object> queueInfo = googleIndexQueueService.getQueueInfo();
            Map<String, Object> quotaInfo = googleIndexService.getQuotaInfo();

            Map<String, Object> data = new HashMap<>();
            data.put("queue", queueInfo);
            data.put("quota", quotaInfo);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Queue info retrieved");

        } catch (Exception e) {
            logger.error("❌ Error getting queue info: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách queue items
     * POST /api/indexgoogle với body: {"operation": "queue-items", "page": 0,
     * "pageSize": 20}
     */
    private void handleQueueItems(StandardResponse response, Map<String, Object> params) {
        int page = params.containsKey("page")
                ? ((Number) params.get("page")).intValue()
                : 0;
        int pageSize = params.containsKey("pageSize")
                ? ((Number) params.get("pageSize")).intValue()
                : 20;

        try {
            java.util.List<UrlSubmissionQueue> items = googleIndexQueueService.getQueueItems(page, pageSize);

            Map<String, Object> data = new HashMap<>();
            data.put("items", items);
            data.put("page", page);
            data.put("pageSize", pageSize);
            data.put("totalInQueue", googleIndexQueueService.getQueueInfo().get("total"));

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + items.size() + " queue items");

        } catch (Exception e) {
            logger.error("❌ Error getting queue items: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Trigger xử lý queue thủ công
     * POST /api/indexgoogle với body: {"operation": "process-queue", "batchSize":
     * 10}
     */
    private void handleProcessQueue(StandardResponse response, Map<String, Object> params) {
        int batchSize = params.containsKey("batchSize")
                ? ((Number) params.get("batchSize")).intValue()
                : 10;

        try {
            Map<String, Object> result = googleIndexService.processBatchFromQueue(batchSize);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", result);
            response.set("message", "Queue processing completed");

        } catch (Exception e) {
            logger.error("❌ Error processing queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Xóa URL khỏi queue
     * POST /api/indexgoogle với body: {"operation": "remove-from-queue", "url":
     * "..."}
     */
    private void handleRemoveFromQueue(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");

        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            boolean removed = googleIndexQueueService.removeFromQueue(url);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("removed", removed);

            response.set("code", 200);
            response.set("success", removed);
            response.set("data", data);
            response.set("message", removed ? "Removed from queue" : "URL not found in queue");

        } catch (Exception e) {
            logger.error("❌ Error removing from queue: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử của URL
     * POST /api/indexgoogle với body: {"operation": "history", "url": "..."}
     */
    private void handleHistory(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");

        if (url == null || url.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'url' parameter");
            return;
        }

        try {
            java.util.List<UrlSubmissionHistory> history = googleIndexQueueService.getHistory(url);

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("history", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " history entries");

        } catch (Exception e) {
            logger.error("❌ Error getting history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử gần đây
     * POST /api/indexgoogle với body: {"operation": "recent-history", "limit": 50}
     */
    private void handleRecentHistory(StandardResponse response, Map<String, Object> params) {
        int limit = params.containsKey("limit")
                ? ((Number) params.get("limit")).intValue()
                : 50;

        try {
            java.util.List<UrlSubmissionHistory> history = googleIndexQueueService.getRecentHistory(limit);

            Map<String, Object> data = new HashMap<>();
            data.put("history", history);
            data.put("count", history.size());
            data.put("limit", limit);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " recent history entries");

        } catch (Exception e) {
            logger.error("❌ Error getting recent history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử chat theo room
     */
    private void handleChatHistory(StandardResponse response, Map<String, Object> params) {
        // Check authentication first
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        String room = (String) params.get("room");
        String appId = resolveAppIdParam(params);
        int limit = 50;
        
        // Handle limit parameter - convert to int, handle both Number and String types
        Object limitObj = params.get("limit");
        if (limitObj != null) {
            try {
                if (limitObj instanceof Number) {
                    limit = ((Number) limitObj).intValue();
                } else if (limitObj instanceof String) {
                    limit = Integer.parseInt((String) limitObj);
                }
            } catch (NumberFormatException e) {
                logger.warn("Invalid limit parameter: {} - using default: 50", limitObj);
            }
        }

        if (room == null || room.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'room' parameter");
            return;
        }

        if (appId == null || appId.isEmpty()) {
            appId = inferAppIdFromRoom(room);
        }

        try {
            java.util.List<net.phanmemmottrieu.model.ChatMessage> history = chatPersistenceService.getHistory(appId,
                    room, limit);

            // Normalize room field: if room="csm" (legacy data), replace with appId for consistency
            for (net.phanmemmottrieu.model.ChatMessage msg : history) {
                if (msg.getRoom() != null && msg.getRoom().equals("csm")) {
                    msg.setRoom(appId);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("room", room);
            data.put("appId", appId);
            data.put("messages", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " messages");

        } catch (Exception e) {
            logger.error("❌ Error getting chat history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    private String inferAppIdFromRoom(String room) {
        if (room == null || room.isEmpty()) {
            return "csm";
        }
        String normalized = room.trim();
        int colonIdx = normalized.indexOf(':');
        if (colonIdx >= 0 && colonIdx < normalized.length() - 1) {
            normalized = normalized.substring(colonIdx + 1);
        }
        int semicolonIdx = normalized.indexOf(';');
        if (semicolonIdx > 0) {
            normalized = normalized.substring(0, semicolonIdx);
        }
        if (normalized.isEmpty() || isPhoneLikeValue(normalized)) {
            return "csm";
        }
        return normalized;
    }

    private String resolveAppIdParam(Map<String, Object> params) {
        Object appIdRaw = params.get("appId");
        if (appIdRaw == null) {
            appIdRaw = params.get("app_id");
        }
        if (appIdRaw == null) {
            return null;
        }
        String appId = String.valueOf(appIdRaw).trim();
        if (appId.isEmpty() || isPhoneLikeValue(appId)) {
            return null;
        }
        return appId;
    }

    private boolean isPhoneLikeValue(String value) {
        return value != null && value.matches("^\\+?\\d[\\d\\s-]{7,}$");
    }

    /**
     * Lấy lịch sử chat theo appId và guest identity.
     */
    private void handleChatHistoryGuest(StandardResponse response, Map<String, Object> params) {
        String appId = resolveAppIdParam(params);
        String guestPhone = params.get("guestPhone") instanceof String ? ((String) params.get("guestPhone")).trim() : null;
        String guestSessionId = params.get("guestSessionId") instanceof String ? ((String) params.get("guestSessionId")).trim() : null;
        int limit = params.containsKey("limit") ? ((Number) params.get("limit")).intValue() : 50;

        if (appId == null || appId.isEmpty() || ((guestPhone == null || guestPhone.isEmpty()) && (guestSessionId == null || guestSessionId.isEmpty()))) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' and guest identity parameter");
            return;
        }

        try {
            java.util.List<net.phanmemmottrieu.model.ChatMessage> history = chatPersistenceService
                    .getHistoryByGuestIdentity(appId, guestSessionId, guestPhone, limit);

            // Normalize room field: if room="csm" (legacy data), replace with appId for consistency
            for (net.phanmemmottrieu.model.ChatMessage msg : history) {
                if (msg.getRoom() != null && msg.getRoom().equals("csm")) {
                    msg.setRoom(appId);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("guestPhone", guestPhone);
            data.put("messages", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " messages");

        } catch (Exception e) {
            logger.error("❌ Error getting guest chat history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy lịch sử chat theo appId (cho admin)
     */
    private void handleChatHistoryApp(StandardResponse response, Map<String, Object> params) {
        // Check authentication first
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        String appId = resolveAppIdParam(params);
        int limit = params.containsKey("limit") ? ((Number) params.get("limit")).intValue() : 200;

        if (appId == null || appId.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' parameter");
            return;
        }

        try {
            java.util.List<net.phanmemmottrieu.model.ChatMessage> history = chatPersistenceService
                    .getHistoryByAppId(appId, limit);

            // Normalize room field: if room="csm" (legacy data), replace with appId for consistency
            for (net.phanmemmottrieu.model.ChatMessage msg : history) {
                if (msg.getRoom() != null && msg.getRoom().equals("csm")) {
                    msg.setRoom(appId);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("messages", history);
            data.put("count", history.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + history.size() + " messages");

        } catch (Exception e) {
            logger.error("❌ Error getting app chat history: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách tất cả apps từ sys_apps (cho CSM admin broadcast)
     */
    private void handleGetAppsList(StandardResponse response, Map<String, Object> params) {
        try {
            // Query sys_apps table to get list of all apps
            Map<String, Object> result = recordManager.filterWithPagination(
                "csm", // sys_apps is in csm database
                "sys_apps",
                null, // no filter - get all
                1000, // limit
                null  // no pagination token
            );
            
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> rows = 
                (java.util.List<Map<String, Object>>) result.get("rows");
            
            // Transform to simple list of {id, name, description}
            java.util.List<Map<String, Object>> apps = new java.util.ArrayList<>();
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    Map<String, Object> app = new HashMap<>();
                    app.put("id", row.get("id"));
                    app.put("name", row.get("name"));
                    app.put("description", row.get("description"));
                    apps.add(app);
                }
            }
            
            response.set("code", 200);
            response.set("success", true);
            response.set("data", apps);
            response.set("message", "Retrieved " + apps.size() + " apps");
            
        } catch (Exception e) {
            logger.error("❌ Error getting apps list: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách guest phones đã chat trong appId
     */
    private void handleChatGuestsList(StandardResponse response, Map<String, Object> params) {
        // Check authentication (optional - allow both authenticated and unauthenticated access)
        // This endpoint can be accessed by both admin (with auth) and system (without auth)
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        boolean isAuthenticated = authentication != null && authentication.isAuthenticated() && 
            authentication.getPrincipal() != null && !"anonymousUser".equals(authentication.getPrincipal());
        
        // Log authentication status for debugging
        logger.info("[CHAT-GUESTS-LIST] Authentication status: {}", isAuthenticated ? "authenticated" : "anonymous");

        String appId = resolveAppIdParam(params);

        if (appId == null || appId.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' parameter");
            return;
        }

        try {
            java.util.List<String> guestSessions = chatPersistenceService.getGuestSessionsByAppId(appId);
            java.util.List<String> guestPhones = chatPersistenceService.getGuestPhonesByAppId(appId);

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("guests", guestSessions); // Use stable guest session ids for frontend expectation
            data.put("guestSessions", guestSessions);
            data.put("guestPhones", guestPhones); // Also include 'guestPhones' for backward compatibility
            data.put("count", guestSessions.size());

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Retrieved " + guestSessions.size() + " guest users");

        } catch (Exception e) {
            logger.error("❌ Error getting guests list: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Đánh dấu tất cả tin nhắn trong room là đã đọc
     */
    private void handleChatMarkAllRead(StandardResponse response, Map<String, Object> params) {
        // Check authentication first
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        String room = (String) params.get("room");
        String userId = (String) params.get("userId");

        if (room == null || room.isEmpty() || userId == null || userId.isEmpty()) {
            response.set("code", 400);
            response.set("message", "Missing 'room' or 'userId' parameter");
            return;
        }

        try {
            chatPersistenceService.markAllAsRead(room, userId);

            Map<String, Object> data = new HashMap<>();
            data.put("room", room);
            data.put("userId", userId);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Marked all messages as read");

            // Broadcast socket event to update all connected clients
            Map<String, Object> broadcastData = new HashMap<>();
            broadcastData.put("room", room);
            broadcastData.put("userId", userId);
            broadcastData.put("action", "markAllAsRead");
            socketIOServer.getBroadcastOperations().sendEvent("chat_read_update", broadcastData);

        } catch (Exception e) {
            logger.error("❌ Error marking messages as read: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Đánh dấu tin nhắn theo guest identity là đã đọc.
     */
    private void handleChatMarkRead(StandardResponse response, Map<String, Object> params) {
        String appId = resolveAppIdParam(params);
        String guestPhone = params.get("guestPhone") instanceof String ? ((String) params.get("guestPhone")).trim() : null;
        String guestSessionId = params.get("guestSessionId") instanceof String ? ((String) params.get("guestSessionId")).trim() : null;

        if (appId == null || appId.isEmpty() || ((guestPhone == null || guestPhone.isEmpty()) && (guestSessionId == null || guestSessionId.isEmpty()))) {
            response.set("code", 400);
            response.set("message", "Missing 'appId' and guest identity parameter");
            return;
        }

        try {
            chatPersistenceService.markAllAsReadByGuestIdentity(appId, guestSessionId, guestPhone);

            Map<String, Object> data = new HashMap<>();
            data.put("appId", appId);
            data.put("guestPhone", guestPhone);
            data.put("guestSessionId", guestSessionId);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", data);
            response.set("message", "Marked all messages as read");

        } catch (Exception e) {
            logger.error("❌ Error marking messages as read: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    // Helper method to get client IP (handle proxy headers)
    private String getClientIp(HttpServletRequest request, Map<String, String> lowerCaseHeaders) {
        // Check for X-Forwarded-For header (from proxy/load balancer)
        String xff = lowerCaseHeaders.get("x-forwarded-for");
        if (xff != null && !xff.isEmpty()) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            String[] ips = xff.split(",");
            return ips[0].trim();
        }

        // Check for X-Real-IP header (from nginx)
        String xRealIp = lowerCaseHeaders.get("x-real-ip");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp.trim();
        }

        // Fallback to remote address
        return request.getRemoteAddr();
    }

    // Phương thức trợ giúp để xây dựng ResponseEntity từ StandardResponse cho API
    private ResponseEntity<?> buildResponseEntity(StandardResponse response) {
        try {
            if (response.hasBinaryBody()) {
                String contentType = response.getContentType();
                if (contentType == null || contentType.isEmpty()) {
                    contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
                }
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.parseMediaType(contentType));
                headers.add("X-Accel-Buffering", "no");
                headers.add("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate, no-transform");
                return ResponseEntity.status(HttpStatus.OK)
                        .headers(headers)
                        .body(response.getBinaryBody());
            } else {
                // Serialize directly to bytes to reduce GC/memory overhead for very large payloads.
                byte[] payload = objectMapper.writeValueAsBytes(response.getPropertiesMap());
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.add("X-Accel-Buffering", "no");
                headers.add("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate, no-transform");
                return ResponseEntity.status(HttpStatus.OK)
                        .headers(headers)
                        .body(payload);
            }
        } catch (Exception e) {
            logger.error("❌ Lỗi khi xây dựng phản hồi API: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("Internal server error during response construction.");
        }
    }

    /**
     * Xoá tin nhắn theo timestamp
     * CHỈ cho phép CSM admin xóa broadcast notifications
     */
    private void handleChatDeleteMessage(StandardResponse response, Map<String, Object> params) {
        // Check authentication and authorization
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        if (authentication == null || !authentication.isAuthenticated() || 
            authentication.getPrincipal() == null || "anonymousUser".equals(authentication.getPrincipal())) {
            response.set("code", 401);
            response.set("message", "Not authenticated");
            response.set("success", false);
            return;
        }

        // Extract user info from authentication
        Object principal = authentication.getPrincipal();
        String userAppId = null;
        boolean isDev = false;
        java.util.List<String> roles = new java.util.ArrayList<>();
        
        if (principal instanceof net.phanmemmottrieu.model.User) {
            net.phanmemmottrieu.model.User user = (net.phanmemmottrieu.model.User) principal;
            userAppId = user.getAppId();
            isDev = user.getDev() != null && user.getDev();
            if (user.getPermissions() != null) {
                roles = user.getPermissions();
            }
        } else if (principal instanceof java.util.Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> userMap = (Map<String, Object>) principal;
            userAppId = (String) userMap.get("app_id");
            Object devObj = userMap.get("dev");
            isDev = devObj instanceof Boolean && (Boolean) devObj;
            Object rolesObj = userMap.get("roles");
            if (rolesObj instanceof java.util.List) {
                @SuppressWarnings("unchecked")
                java.util.List<String> rolesList = (java.util.List<String>) rolesObj;
                roles = rolesList;
            }
        }
        
        Long timestamp = null;
        if (params.get("timestamp") instanceof Number) {
            timestamp = ((Number) params.get("timestamp")).longValue();
        }
        String appId = (String) params.get("appId");

        if (timestamp == null || timestamp <= 0) {
            response.set("code", 400);
            response.set("message", "Missing or invalid 'timestamp' parameter");
            return;
        }

        if (appId == null || appId.isEmpty()) {
            appId = "csm";
        }

        try {
            // 🔥 Get message info first to check if it's a broadcast notification
            net.phanmemmottrieu.model.ChatMessage messageToDelete = chatPersistenceService.getMessageByTimestamp(appId, timestamp);
            
            if (messageToDelete == null) {
                response.set("code", 404);
                response.set("message", "Message not found");
                response.set("success", false);
                return;
            }
            
            // Check authorization based on message type
            boolean isBroadcastNotification = messageToDelete.getEventType() != null && 
                                             messageToDelete.getEventType().equals("broadcast_notification");
            boolean isCSMAdmin = "csm".equalsIgnoreCase(userAppId) && (isDev || roles.contains("admin"));
            boolean isAppAdmin = userAppId != null && userAppId.equals(appId) && (isDev || roles.contains("admin"));
            
            // Rule:
            // - Broadcast notifications (từ CSM): Chỉ CSM admin xoá được
            // - Regular messages: Admin của appId đó xoá được
            if (isBroadcastNotification) {
                // 🚫 Broadcast notification - Only CSM admin can delete
                if (!isCSMAdmin) {
                    response.set("code", 403);
                    response.set("message", "Only CSM admins can delete system broadcast notifications");
                    response.set("success", false);
                    logger.warn("⚠️ Unauthorized delete attempt for broadcast notification: userAppId={}, isDev={}, roles={}", userAppId, isDev, roles);
                    return;
                }
            } else {
                // ✅ Regular message - App admin can delete
                if (!isAppAdmin) {
                    response.set("code", 403);
                    response.set("message", "Only admins of this app can delete messages");
                    response.set("success", false);
                    logger.warn("⚠️ Unauthorized delete attempt for regular message: userAppId={}, appId={}, isDev={}, roles={}", userAppId, appId, isDev, roles);
                    return;
                }
            }

            logger.info("🗑️ User {} deleting message: appId={}, timestamp={}, isBroadcast={}", 
                       userAppId, appId, timestamp, isBroadcastNotification);
            
            boolean deleted = chatPersistenceService.deleteMessage(appId, timestamp);

            if (deleted) {
                Map<String, Object> data = new HashMap<>();
                data.put("timestamp", timestamp);
                data.put("appId", appId);

                response.set("code", 200);
                response.set("success", true);
                response.set("data", data);
                response.set("message", "Message deleted successfully");

                // Broadcast socket event to update all connected clients with app scoping
                Map<String, Object> broadcastData = new HashMap<>();
                broadcastData.put("timestamp", timestamp);
                broadcastData.put("appId", appId);
                broadcastData.put("action", "messageDeleted");
                socketIOServer.getBroadcastOperations().sendEvent("chat_message_deleted", broadcastData);
            } else {
                response.set("code", 404);
                response.set("success", false);
                response.set("message", "Message not found");
            }

        } catch (Exception e) {
            logger.error("❌ Error deleting message: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Handle Facebook API POST proxy
     * POST /api/facebook/post
     * Body: { pageId, pageAccessToken, message, imageUrl (optional), link (optional) }
     */
    private void handleFacebookPost(StandardResponse response, Map<String, Object> params) {
        try {
            String pageId = (String) params.get("pageId");
            String pageAccessToken = (String) params.get("pageAccessToken");
            String message = (String) params.get("message");
            String imageUrl = (String) params.get("imageUrl");
            String link = (String) params.get("link");

            if (pageId == null || pageId.isEmpty() || pageAccessToken == null || pageAccessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing pageId or pageAccessToken");
                return;
            }

            if (message == null || message.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing message");
                return;
            }

            // Build Facebook Graph API URL
            String fbUrl;
            Map<String, String> payload = new HashMap<>();
            payload.put("access_token", pageAccessToken);

            if (imageUrl != null && !imageUrl.isEmpty()) {
                fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";
                payload.put("url", imageUrl);
                payload.put("caption", message);
            } else {
                fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                payload.put("message", message);
            }

            if (link != null && !link.isEmpty()) {
                payload.put("link", link);
            }

            // Call Facebook API using RestTemplate
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);

            org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            ResponseEntity<Map<String, Object>> facebookResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);

            if (facebookResponse.getStatusCode().is2xxSuccessful()) {
                Map<String, Object> responseBody = facebookResponse.getBody();
                String postId = (String) responseBody.get("id");

                response.set("code", 200);
                response.set("success", true);
                response.set("message", "Post published successfully");
                response.set("data", new HashMap<String, Object>() {{
                    put("post_id", postId);
                    put("pageId", pageId);
                }});
            } else {
                response.set("code", facebookResponse.getStatusCode().value());
                response.set("success", false);
                response.set("message", "Facebook API error: " + facebookResponse.getBody());
            }

        } catch (Exception e) {
            logger.error("❌ Error posting to Facebook: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Handle Facebook API POST proxy with multiple images
     * POST /api/facebook/post-with-images
     * Body: { pageId, pageAccessToken, message, images: [], videos: [], link (optional) }
     */
    private void handleFacebookPostWithImages(StandardResponse response, Map<String, Object> params) {
        try {
            String pageId = (String) params.get("pageId");
            String pageAccessToken = (String) params.get("pageAccessToken");
            String message = (String) params.get("message");
            String link = (String) params.get("link");
            Object imagesObj = params.get("images");
            Object videosObj = params.get("videos");

            if (pageId == null || pageId.isEmpty() || pageAccessToken == null || pageAccessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing pageId or pageAccessToken");
                return;
            }

            if (message == null || message.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing message");
                return;
            }

            java.util.List<String> images = new java.util.ArrayList<>();
            if (imagesObj instanceof java.util.List<?>) {
                for (Object imageObj : (java.util.List<?>) imagesObj) {
                    if (imageObj instanceof String) {
                        images.add((String) imageObj);
                    }
                }
            } else if (imagesObj instanceof String && !((String) imagesObj).isBlank()) {
                images.add((String) imagesObj);
            }

            java.util.List<String> videos = new java.util.ArrayList<>();
            if (videosObj instanceof java.util.List<?>) {
                for (Object videoObj : (java.util.List<?>) videosObj) {
                    if (videoObj instanceof String) {
                        videos.add((String) videoObj);
                    }
                }
            } else if (videosObj instanceof String && !((String) videosObj).isBlank()) {
                videos.add((String) videosObj);
            }

            // Chấp nhận cả URLs và base64
            java.util.List<String> sanitizedImages = new java.util.ArrayList<>();
            for (String image : images) {
                if (image == null) continue;
                String normalized = image.trim();
                if (normalized.isEmpty()) continue;
                // Chấp nhận: http://, https://, hoặc data:image/...
                boolean isUrl = normalized.startsWith("http://") || normalized.startsWith("https://");
                boolean isBase64 = normalized.startsWith("data:image/");
                if (!(isUrl || isBase64)) continue;
                if (!sanitizedImages.contains(normalized)) {
                    sanitizedImages.add(normalized);
                }
            }

            // Chấp nhận video URLs và base64 video
            java.util.List<String> sanitizedVideos = new java.util.ArrayList<>();
            for (String video : videos) {
                if (video == null) continue;
                String normalized = video.trim();
                if (normalized.isEmpty()) continue;
                boolean isUrl = normalized.startsWith("http://") || normalized.startsWith("https://");
                boolean isBase64 = normalized.startsWith("data:video/");
                boolean isRelativeLocal = normalized.startsWith("/app_images/") || normalized.startsWith("app_images/");
                if (!(isUrl || isBase64 || isRelativeLocal)) continue;
                if (!sanitizedVideos.contains(normalized)) {
                    sanitizedVideos.add(normalized);
                }
            }

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            final int[] imagesPosted = {0};
            final int[] videosPosted = {0};
            String videoFailureReason = null;
            String mainPostId = null;
            java.util.List<String> extraPostIds = new java.util.ArrayList<>();

            // Đăng từng video riêng biệt (Facebook không hỗ trợ mixed ảnh+video trong cùng post; mỗi video = 1 post)
            if (!sanitizedVideos.isEmpty()) {
                for (String videoInput : sanitizedVideos) {
                    String videoPostId = null;
                    try {
                        String videoUploadUrl = "https://graph.facebook.com/v18.0/" + pageId + "/videos";
                        String videoDescription = message;
                        if (link != null && !link.isEmpty() && (videoDescription == null || !videoDescription.contains(link))) {
                            videoDescription = (videoDescription == null ? "" : videoDescription) + "\n\n" + link;
                        }

                        if (videoInput.startsWith("data:video/")) {
                            int commaIndex = videoInput.indexOf(',');
                            if (commaIndex > 0) {
                                String base64Data = videoInput.substring(commaIndex + 1);
                                byte[] videoBytes = java.util.Base64.getDecoder().decode(base64Data);

                                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                                headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

                                org.springframework.util.LinkedMultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
                                final byte[] finalVideoBytes = videoBytes;
                                org.springframework.core.io.ByteArrayResource videoResource = new org.springframework.core.io.ByteArrayResource(finalVideoBytes) {
                                    @Override
                                    public String getFilename() {
                                        return "video.mp4";
                                    }
                                };

                                form.add("source", videoResource);
                                form.add("description", videoDescription);
                                form.add("access_token", pageAccessToken);

                                org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, Object>> entity =
                                    new org.springframework.http.HttpEntity<>(form, headers);

                                @SuppressWarnings({"unchecked", "rawtypes"})
                                ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(videoUploadUrl, entity, Map.class);
                                if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                    Map<String, Object> respBody = uploadResp.getBody();
                                    videoPostId = respBody != null ? (String) respBody.get("id") : null;
                                    if (videoPostId != null && !videoPostId.isEmpty()) {
                                        logger.info("✅ Posted video from base64, post_id: {}", videoPostId);
                                    }
                                }
                            } else {
                                if (videoFailureReason == null) videoFailureReason = "Invalid base64 video payload";
                            }
                        } else {
                            byte[] videoBytes = null;
                            String relativePath = null;

                            // Relative local path: /app_images/... or app_images/...
                            if (videoInput.startsWith("/app_images/") || videoInput.startsWith("app_images/")) {
                                relativePath = videoInput.startsWith("/") ? videoInput.substring(1) : videoInput;
                            }

                            // Absolute URL: thử parse path để đọc local disk nếu là app_images
                            if (relativePath == null && (videoInput.startsWith("http://") || videoInput.startsWith("https://"))) {
                                try {
                                    java.net.URI uri = new java.net.URI(videoInput);
                                    String path = uri.getPath();
                                    if (path != null && path.startsWith("/app_images/")) {
                                        relativePath = path.substring(1);
                                    }
                                } catch (Exception e) {
                                    logger.warn("Cannot parse video URL {}: {}", videoInput, e.getMessage());
                                }
                            }

                            // Ưu tiên đọc từ disk giống luồng ảnh
                            if (relativePath != null) {
                                try {
                                    java.io.File videoFile = recordManager.getStaticFile(relativePath);
                                    if (videoFile != null && videoFile.exists() && videoFile.isFile()) {
                                        videoBytes = java.nio.file.Files.readAllBytes(videoFile.toPath());
                                        logger.info("✅ Read video from disk: {} bytes from {}", videoBytes.length, relativePath);
                                    } else {
                                        logger.warn("⚠️ Video file not found on disk: {}", relativePath);
                                        if (videoFailureReason == null) videoFailureReason = "Video file not found on disk: " + relativePath;
                                    }
                                } catch (Exception diskError) {
                                    logger.warn("⚠️ Cannot read video from disk {}: {}", relativePath, diskError.getMessage());
                                    if (videoFailureReason == null) videoFailureReason = "Cannot read video from disk: " + diskError.getMessage();
                                }
                            }

                            // Fallback: download HTTP URL if needed
                            if ((videoBytes == null || videoBytes.length == 0)
                                    && (videoInput.startsWith("http://") || videoInput.startsWith("https://"))) {
                                try {
                                    java.net.URL url = new java.net.URL(videoInput);
                                    java.io.InputStream inputStream = url.openStream();
                                    videoBytes = inputStream.readAllBytes();
                                    inputStream.close();
                                    logger.info("✅ Downloaded video via HTTP: {} bytes", videoBytes.length);
                                } catch (Exception downloadError) {
                                    logger.warn("⚠️ Failed to download video via HTTP {}: {}", videoInput, downloadError.getMessage());
                                    if (videoFailureReason == null) videoFailureReason = "Cannot download video URL: " + downloadError.getMessage();
                                }
                            }

                            // Strategy A: upload binary multipart (ổn định hơn khi Facebook không fetch được URL)
                            if (videoBytes != null && videoBytes.length > 0) {
                                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                                headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

                                org.springframework.util.LinkedMultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
                                final byte[] finalVideoBytes = videoBytes;
                                org.springframework.core.io.ByteArrayResource videoResource = new org.springframework.core.io.ByteArrayResource(finalVideoBytes) {
                                    @Override
                                    public String getFilename() {
                                        return "video.mp4";
                                    }
                                };

                                form.add("source", videoResource);
                                form.add("description", videoDescription);
                                form.add("access_token", pageAccessToken);

                                org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, Object>> entity =
                                    new org.springframework.http.HttpEntity<>(form, headers);

                                @SuppressWarnings({"unchecked", "rawtypes"})
                                ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(videoUploadUrl, entity, Map.class);
                                if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                    Map<String, Object> respBody = uploadResp.getBody();
                                    videoPostId = respBody != null ? (String) respBody.get("id") : null;
                                    if (videoPostId != null && !videoPostId.isEmpty()) {
                                        logger.info("✅ Posted video from binary upload, post_id: {}", videoPostId);
                                    }
                                }
                            }

                            // Strategy B fallback: Facebook tự fetch file_url
                            if (videoPostId == null && (videoInput.startsWith("http://") || videoInput.startsWith("https://"))) {
                                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                                headers.setContentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED);

                                org.springframework.util.LinkedMultiValueMap<String, String> payload = new org.springframework.util.LinkedMultiValueMap<>();
                                payload.add("file_url", videoInput);
                                payload.add("description", videoDescription);
                                payload.add("access_token", pageAccessToken);

                                org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> entity =
                                    new org.springframework.http.HttpEntity<>(payload, headers);

                                @SuppressWarnings({"unchecked", "rawtypes"})
                                ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(videoUploadUrl, entity, Map.class);
                                if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                    Map<String, Object> respBody = uploadResp.getBody();
                                    videoPostId = respBody != null ? (String) respBody.get("id") : null;
                                    if (videoPostId != null && !videoPostId.isEmpty()) {
                                        logger.info("✅ Posted video from URL, post_id: {}", videoPostId);
                                    } else {
                                        if (videoFailureReason == null) videoFailureReason = "Facebook did not return video id";
                                    }
                                }
                            }
                        }
                    } catch (Exception videoEx) {
                        if (videoEx instanceof org.springframework.web.client.HttpStatusCodeException httpEx) {
                            logger.warn("❌ Failed to post video {}: status={}, body={}",
                                    videoInput.length() > 60 ? videoInput.substring(0, 60) : videoInput,
                                    httpEx.getStatusCode(), httpEx.getResponseBodyAsString());
                        } else {
                            logger.warn("❌ Failed to post video {}: {}", videoInput.length() > 60 ? videoInput.substring(0, 60) : videoInput, videoEx.getMessage());
                        }
                        if (videoFailureReason == null) videoFailureReason = videoEx.getMessage();
                    }
                    // Ghi nhận post_id của video này vào mainPostId hoặc extraPostIds
                    if (videoPostId != null && !videoPostId.isEmpty()) {
                        if (mainPostId == null) {
                            mainPostId = videoPostId;
                        } else {
                            extraPostIds.add(videoPostId);
                        }
                        videosPosted[0]++;
                    }
                } // end for each video
            }

            // If caller only requested video, do not silently downgrade to text post.
            if (!sanitizedVideos.isEmpty() && sanitizedImages.isEmpty() && videosPosted[0] == 0) {
                Map<String, Object> data = new HashMap<>();
                data.put("pageId", pageId);
                data.put("videos_count", 0);
                data.put("images_count", 0);
                data.put("reason", videoFailureReason != null ? videoFailureReason : "Video upload failed");
                response.set("code", 502);
                response.set("success", false);
                response.set("message", "Video upload failed. Post was not published to avoid text-only fallback.");
                response.set("data", data);
                return;
            }

            // Nếu có images, upload từng ảnh ở chế độ unpublished rồi attach vào /feed.
            // Nếu video đã đăng trước đó, tạo thêm post ảnh riêng thay vì bỏ qua ảnh.
            if (!sanitizedImages.isEmpty()) {
                try {
                    java.util.List<String> mediaFbIds = new java.util.ArrayList<>();
                    String photoUploadUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";

                    for (String imageUrl : sanitizedImages) {
                        if (imageUrl == null || imageUrl.isEmpty()) continue;
                        try {
                            logger.info("📤 Processing image for Facebook: {}", 
                                imageUrl.length() > 100 ? imageUrl.substring(0, 100) + "..." : imageUrl);
                            
                            byte[] imageBytes = null;
                            
                            // STRATEGY 1: Nếu là base64, decode trực tiếp
                            if (imageUrl.startsWith("data:image/")) {
                                try {
                                    // Format: data:image/png;base64,iVBORw0KGgoAAAANS...
                                    int commaIndex = imageUrl.indexOf(',');
                                    if (commaIndex > 0) {
                                        String base64Data = imageUrl.substring(commaIndex + 1);
                                        imageBytes = java.util.Base64.getDecoder().decode(base64Data);
                                        logger.info("✅ Decoded base64 image: {} bytes", imageBytes.length);
                                    } else {
                                        logger.warn("⚠️ Invalid base64 format (no comma): {}", imageUrl.substring(0, 50));
                                        continue;
                                    }
                                } catch (Exception decodeError) {
                                    logger.warn("❌ Failed to decode base64: {}", decodeError.getMessage());
                                    continue;
                                }
                            }
                            // STRATEGY 2: Nếu là URL từ server này, đọc file trực tiếp từ disk
                            else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
                                String relativePath = null;
                                
                                // Parse URL để lấy relative path (vd: app_images/wuweb/upload123.png)
                                try {
                                    java.net.URI uri = new java.net.URI(imageUrl);
                                    String path = uri.getPath();
                                    if (path != null && path.startsWith("/")) {
                                        relativePath = path.substring(1); // Bỏ "/" đầu tiên
                                    }
                                } catch (Exception e) {
                                    logger.warn("Cannot parse URL {}: {}", imageUrl, e.getMessage());
                                }
                                
                                // Thử đọc file từ disk trước (nhanh hơn và đáng tin cậy hơn)
                                if (relativePath != null && relativePath.startsWith("app_images/")) {
                                    try {
                                        java.io.File imageFile = recordManager.getStaticFile(relativePath);
                                        if (imageFile != null && imageFile.exists() && imageFile.isFile()) {
                                            imageBytes = java.nio.file.Files.readAllBytes(imageFile.toPath());
                                            logger.info("✅ Read image from disk: {} bytes from {}", imageBytes.length, relativePath);
                                        } else {
                                            logger.warn("⚠️ Image file not found on disk: {}", relativePath);
                                        }
                                    } catch (Exception diskError) {
                                        logger.warn("⚠️ Cannot read from disk {}: {}", relativePath, diskError.getMessage());
                                    }
                                }
                                
                                // STRATEGY 3: Fallback - download qua HTTP nếu không đọc được từ disk
                                if (imageBytes == null || imageBytes.length == 0) {
                                    try {
                                        java.net.URL url = new java.net.URL(imageUrl);
                                        java.io.InputStream inputStream = url.openStream();
                                        imageBytes = inputStream.readAllBytes();
                                        inputStream.close();
                                        logger.info("✅ Downloaded image via HTTP: {} bytes", imageBytes.length);
                                    } catch (Exception downloadError) {
                                        logger.warn("❌ Failed to download image from {}: {}", imageUrl, downloadError.getMessage());
                                        continue;
                                    }
                                }
                            }

                            if (imageBytes == null || imageBytes.length == 0) {
                                logger.warn("❌ Empty image data from {}", imageUrl);
                                continue;
                            }

                            // Upload binary trực tiếp lên Facebook (multipart/form-data)
                            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                            headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

                            org.springframework.util.LinkedMultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
                            
                            // Tạo ByteArrayResource với filename
                            final byte[] finalImageBytes = imageBytes;
                            org.springframework.core.io.ByteArrayResource imageResource = new org.springframework.core.io.ByteArrayResource(finalImageBytes) {
                                @Override
                                public String getFilename() {
                                    return "image.jpg"; // Facebook yêu cầu filename
                                }
                            };
                            
                            form.add("source", imageResource);
                            form.add("published", "false");
                            form.add("access_token", pageAccessToken);

                            org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, Object>> entity =
                                new org.springframework.http.HttpEntity<>(form, headers);

                            @SuppressWarnings({"unchecked", "rawtypes"})
                            ResponseEntity<Map<String, Object>> uploadResp = (ResponseEntity) restTemplate.postForEntity(photoUploadUrl, entity, Map.class);
                            if (uploadResp.getStatusCode().is2xxSuccessful()) {
                                Map<String, Object> respBody = uploadResp.getBody();
                                String mediaId = respBody != null ? (String) respBody.get("id") : null;
                                if (mediaId != null && !mediaId.isEmpty()) {
                                    mediaFbIds.add(mediaId);
                                    logger.info("✅ Uploaded to Facebook, media_id: {}", mediaId);
                                } else {
                                    logger.warn("⚠️ Facebook returned success but no media_id");
                                }
                            } else {
                                logger.warn("❌ Upload image failed: {}", uploadResp.getBody());
                            }
                        } catch (Exception perImageError) {
                            logger.warn("❌ Upload image failed for URL {}: {}", imageUrl, perImageError.getMessage());
                        }
                    }

                    if (!mediaFbIds.isEmpty()) {
                        String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                        headers.setContentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED);

                        org.springframework.util.LinkedMultiValueMap<String, String> payload = new org.springframework.util.LinkedMultiValueMap<>();
                        String photoMessage = message;
                        if (mainPostId != null) {
                            photoMessage = (photoMessage == null ? "" : photoMessage) + "\n\n📷 Bộ ảnh minh họa bổ sung cho video ở trên.";
                        }
                        payload.add("message", photoMessage);
                        payload.add("access_token", pageAccessToken);

                        for (int i = 0; i < mediaFbIds.size(); i++) {
                            String mediaId = mediaFbIds.get(i);
                            payload.add("attached_media[" + i + "]", "{\"media_fbid\":\"" + mediaId + "\"}");
                        }

                        // Không gửi link cùng attached_media vì Graph API có thể từ chối hoặc bỏ ảnh.

                        org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> entity =
                            new org.springframework.http.HttpEntity<>(payload, headers);

                        @SuppressWarnings({"unchecked", "rawtypes"})
                        ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                        if (fbResponse.getStatusCode().is2xxSuccessful()) {
                            Map<String, Object> respBody = fbResponse.getBody();
                            String photoPostId = respBody != null ? (String) respBody.get("id") : null;
                            imagesPosted[0] = mediaFbIds.size();
                            if (photoPostId != null && !photoPostId.isEmpty()) {
                                if (mainPostId == null) {
                                    mainPostId = photoPostId;
                                } else {
                                    extraPostIds.add(photoPostId);
                                }
                            }
                            logger.info("✅ Posted multi-photo album with {} images", imagesPosted[0]);
                        } else {
                            logger.warn("❌ Failed to post multi-photo album: {}", fbResponse.getBody());
                        }
                    }
                } catch (Exception e) {
                    logger.warn("❌ Error posting multi-photo album: {}. Fallback to single image", e.getMessage());
                    // Fallback: post only first image if album fails
                    mainPostId = null;
                    imagesPosted[0] = 0;
                }
            }

            // Fallback: Nếu không có images hoặc album fail, post text bình thường
            if (mainPostId == null) {
                if (!sanitizedImages.isEmpty()) {
                    // Retry with single image
                    String imageUrl = sanitizedImages.get(0);
                    if (imageUrl != null && !imageUrl.isEmpty()) {
                        String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";
                        Map<String, String> payload = new java.util.HashMap<>();
                        payload.put("url", imageUrl);
                        payload.put("caption", message);
                        payload.put("access_token", pageAccessToken);

                        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                        org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

                        try {
                            @SuppressWarnings({"unchecked", "rawtypes"})
                            ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                            if (fbResponse.getStatusCode().is2xxSuccessful()) {
                                Map<String, Object> respBody = fbResponse.getBody();
                                mainPostId = (String) respBody.get("id");
                                imagesPosted[0] = 1;
                                logger.info("✅ Fallback: Posted single photo");
                            }
                        } catch (Exception e) {
                            logger.warn("❌ Failed to post single image: {}", e.getMessage());
                        }
                    }
                }

                // If still no post, post text only
                if (mainPostId == null) {
                    String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                    Map<String, String> payload = new java.util.HashMap<>();
                    payload.put("message", message);
                    payload.put("access_token", pageAccessToken);
                    
                    if (link != null && !link.isEmpty()) {
                        payload.put("link", link);
                    }

                    org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                    headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                    org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

                    @SuppressWarnings({"unchecked", "rawtypes"})
                    ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                    if (fbResponse.getStatusCode().is2xxSuccessful()) {
                        Map<String, Object> respBody = fbResponse.getBody();
                        mainPostId = (String) respBody.get("id");
                        logger.info("✅ Posted text only");
                    } else {
                        response.set("code", fbResponse.getStatusCode().value());
                        response.set("success", false);
                        response.set("message", "Facebook API error: " + fbResponse.getBody());
                        return;
                    }
                }
            }

            if (mainPostId != null) {
                final String finalPostId = mainPostId;
                java.util.List<String> allPostIds = new java.util.ArrayList<>();
                allPostIds.add(finalPostId);
                allPostIds.addAll(extraPostIds);
                response.set("code", 200);
                response.set("success", true);
                response.set("message", "Post published successfully");
                response.set("data", new HashMap<String, Object>() {{
                    put("post_id", finalPostId);
                    put("extra_post_ids", extraPostIds);
                    put("all_post_ids", allPostIds);
                    put("pageId", pageId);
                    put("images_count", imagesPosted[0]);
                    put("videos_count", videosPosted[0]);
                }});
            } else {
                // Nếu không có ảnh, post text bình thường
                String fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                Map<String, String> payload = new HashMap<>();
                payload.put("message", message);
                payload.put("access_token", pageAccessToken);
                if (link != null && !link.isEmpty()) {
                    payload.put("link", link);
                }

                org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
                headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

                @SuppressWarnings({"unchecked", "rawtypes"})
                ResponseEntity<Map<String, Object>> fbResponse = (ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);
                if (fbResponse.getStatusCode().is2xxSuccessful()) {
                    Map<String, Object> respBody = fbResponse.getBody();
                    String postId = (String) respBody.get("id");

                    response.set("code", 200);
                    response.set("success", true);
                    response.set("message", "Post published successfully");
                    response.set("data", new HashMap<String, Object>() {{
                        put("post_id", postId);
                        put("pageId", pageId);
                        put("images_count", 0);
                        put("videos_count", 0);
                    }});
                } else {
                    response.set("code", fbResponse.getStatusCode().value());
                    response.set("success", false);
                    response.set("message", "Facebook API error: " + fbResponse.getBody());
                }
            }

        } catch (Exception e) {
            if (e instanceof org.springframework.web.client.HttpStatusCodeException httpEx) {
                logger.error("❌ Error posting to Facebook with images: status={}, body={}",
                        httpEx.getStatusCode(), httpEx.getResponseBodyAsString(), e);
            } else {
                logger.error("❌ Error posting to Facebook with images: {}", e.getMessage(), e);
            }
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }



    /**
     * Exchange short-lived User Token (Token A) to long-lived Token B (60 days)
     * POST /api/facebook/exchange-token
     * Body: { accessToken, clientId, appSecret }
     */
    private void handleFacebookExchangeToken(StandardResponse response, Map<String, Object> params) {
        try {
            String accessToken = (String) params.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing accessToken");
                response.set("success", false);
                return;
            }

            String clientId = (String) params.get("clientId");
            if (clientId == null || clientId.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing clientId");
                response.set("success", false);
                return;
            }

            String appSecret = (String) params.get("appSecret");
            if (appSecret == null || appSecret.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing appSecret");
                response.set("success", false);
                return;
            }

            String url = String.format("https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=%s&client_secret=%s&fb_exchange_token=%s",
                    clientId, appSecret, accessToken);

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> fbResponse = restTemplate.getForObject(url, Map.class);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", fbResponse);
            response.set("message", "Token exchanged successfully");
        } catch (Exception e) {
            logger.error("❌ Error exchanging Facebook token: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Get pages list with page tokens
     * POST /api/facebook/pages
     * Body: { accessToken }
     */
    private void handleFacebookPages(StandardResponse response, Map<String, Object> params) {
        try {
            String accessToken = (String) params.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing accessToken");
                response.set("success", false);
                return;
            }

            // Request pages with necessary fields including permanent page access token
            String url = String.format(
                "https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=%s", 
                accessToken
            );
            
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> fbResponse = restTemplate.getForObject(url, Map.class);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", fbResponse);
            response.set("message", "Pages retrieved successfully");
        } catch (Exception e) {
            logger.error("❌ Error fetching Facebook pages: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Validate token
     * POST /api/facebook/me
     * Body: { accessToken }
     */
    private void handleFacebookMe(StandardResponse response, Map<String, Object> params) {
        try {
            String accessToken = (String) params.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                response.set("code", 400);
                response.set("message", "Missing accessToken");
                response.set("success", false);
                return;
            }

            String url = String.format("https://graph.facebook.com/v18.0/me?access_token=%s", accessToken);
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            @SuppressWarnings("unchecked")
            Map<String, Object> fbResponse = restTemplate.getForObject(url, Map.class);

            response.set("code", 200);
            response.set("success", true);
            response.set("data", fbResponse);
            response.set("message", "Token valid");
        } catch (Exception e) {
            logger.error("❌ Error validating Facebook token: {}", e.getMessage(), e);
            response.set("code", 500);
            response.set("success", false);
            response.set("message", "Error: " + e.getMessage());
        }
    }

    /**
     * Find matching closing brace for an opening brace at given position.
     * Handles nested braces and ignores braces inside strings.
     * 
     * @param content String to search in
     * @param openBracePos Position of opening brace
     * @return Position of matching closing brace, or -1 if not found
     */
    private int findMatchingBrace(String content, int openBracePos) {
        if (openBracePos < 0 || openBracePos >= content.length() 
            || content.charAt(openBracePos) != '{') {
            return -1;
        }

        int braceCount = 1;
        boolean inString = false;
        boolean escaped = false;

        for (int i = openBracePos + 1; i < content.length(); i++) {
            char c = content.charAt(i);

            if (escaped) {
                escaped = false;
                continue;
            }

            if (c == '\\') {
                escaped = true;
                continue;
            }

            if (c == '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (c == '{') {
                    braceCount++;
                } else if (c == '}') {
                    braceCount--;
                    if (braceCount == 0) {
                        logger.debug("Found matching brace at position {}", i);
                        return i;
                    }
                }
            }
        }

        logger.warn("No matching brace found for position {}", openBracePos);
        return -1;
    }

    /**
     * Escape newlines and special characters in JSON string values.
     * Handles literal newlines that should be escaped as \n in JSON.
     * 
     * @param jsonStr Raw JSON string with potential literal newlines
     * @return JSON string with escaped newlines
     */
    private String escapeNewlinesInJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) {
            return jsonStr;
        }

        StringBuilder result = new StringBuilder();
        boolean inString = false;
        boolean escaped = false;

        for (int i = 0; i < jsonStr.length(); i++) {
            char c = jsonStr.charAt(i);

            if (escaped) {
                result.append(c);
                escaped = false;
                continue;
            }

            if (c == '\\') {
                escaped = true;
                result.append(c);
                continue;
            }

            if (c == '"') {
                inString = !inString;
                result.append(c);
                continue;
            }

            // Inside string: escape special characters
            if (inString) {
                if (c == '\n') {
                    result.append("\\n");
                } else if (c == '\r') {
                    result.append("\\r");
                } else if (c == '\t') {
                    result.append("\\t");
                } else {
                    result.append(c);
                }
            } else {
                result.append(c);
            }
        }

        logger.debug("🔧 Escaped newlines in JSON: {} → {} chars", jsonStr.length(), result.length());
        return result.toString();
    }
}