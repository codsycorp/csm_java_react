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
import com.corundumstudio.socketio.SocketIOServer;
import net.phanmemmottrieu.model.UrlSubmissionQueue;
import net.phanmemmottrieu.model.UrlSubmissionHistory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
public class ApiSpringController {

    private static final Logger logger = LoggerFactory.getLogger(ApiSpringController.class);
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

    @Value("${ai.prompt.max-chars:3000000}")
    private int maxPromptChars;

    @Value("${ai.prompt.gemini-max-chars:500000}")
    private int geminiMaxPromptChars;

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
            CRMHandler crmHandler
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
                case "/update-table-data-index":
                    tableHandler.handleIndexExistingRecords(response, params);
                    break;
                case "/ai-generate-seo-content":
                    getObjectFromAI(response, params);
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
    public void getObjectFromAI(StandardResponse response, Map<String, Object> params) {
        String mode = String.valueOf(params.getOrDefault("mode", "sync")).trim().toLowerCase();
        if ("status".equals(mode)) {
            handleAiAsyncStatus(response, params);
            return;
        }

        String prompt = (String) params.get("prompt");
        boolean asyncRequested = "submit".equals(mode)
                || Boolean.TRUE.equals(params.get("async"))
                || "true".equalsIgnoreCase(String.valueOf(params.get("async")));

        if (asyncRequested) {
            handleAiAsyncSubmit(response, prompt);
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
            rawContent = fetchAiRawContent(prompt, null);
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

        populateAiResponseFromRawContent(response, rawContent);
    }

    private String fetchAiRawContent(String prompt, GitHubModelsService.ProgressListener progressListener) {
        if (prompt.length() > geminiMaxPromptChars) {
            logger.warn("Prompt size exceeded Gemini limit ({}>{}) chars. Routing to GitHub Models fallback.",
                    prompt.length(), geminiMaxPromptChars);
            return this.gitHubModelsService.generateContent(prompt, progressListener);
        }

        if (progressListener != null) {
            progressListener.onProgress(createAiJobProgress("gemini", "Đang gọi Gemini", 0, 1, null));
        }
        return this.aiProviderFactory.generateContent(prompt);
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

    private void handleAiAsyncSubmit(StandardResponse response, String prompt) {
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
        job.put("createdAt", now);
        job.put("updatedAt", now);
        job.put("pollAfterMs", aiAsyncPollMinMs);
        job.put("progress", createAiJobProgress("queued", "Đang xếp hàng xử lý AI", 0, 1, null));
        aiAsyncJobs.put(jobId, job);

        aiAsyncExecutor.submit(() -> {
            try {
                job.put("status", "running");
                job.put("updatedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress("starting", "Bắt đầu xử lý yêu cầu AI", 0, 1, null));

                StandardResponse syncResponse = new StandardResponse();
                String rawContent = fetchAiRawContent(prompt, progress -> updateAiAsyncJobProgress(job, progress));
                if (rawContent == null || rawContent.isBlank()) {
                    syncResponse.set("code", 200);
                    syncResponse.set("success", false);
                    syncResponse.set("message", "Không nhận được nội dung hợp lệ từ dịch vụ AI.");
                } else {
                    updateAiAsyncJobProgress(job, createAiJobProgress("parsing", "Đang phân tích kết quả AI", 1, 1, null));
                    populateAiResponseFromRawContent(syncResponse, rawContent);
                }

                Map<String, Object> resultPayload = new HashMap<>(syncResponse.getPropertiesMap());
                boolean ok = Boolean.TRUE.equals(resultPayload.get("success"));
                job.put("status", ok ? "completed" : "failed");
                job.put("result", resultPayload);
                job.put("updatedAt", System.currentTimeMillis());
                job.put("completedAt", System.currentTimeMillis());
                updateAiAsyncJobProgress(job, createAiJobProgress(ok ? "completed" : "failed",
                        ok ? "Đã hoàn tất tạo menu AI" : String.valueOf(resultPayload.getOrDefault("message", "AI xử lý thất bại")),
                        1, 1, null));
            } catch (Exception e) {
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
            logger.debug("[{}] Failed to parse JSON: {}. First 200 chars: {}", 
                provider, e.getMessage(), 
                jsonStr.substring(0, Math.min(200, jsonStr.length())));

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