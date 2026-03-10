package net.phanmemmottrieu.controller;

import org.jsoup.Jsoup;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import jakarta.servlet.http.HttpServletRequest;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.service.SitemapService;
import net.phanmemmottrieu.service.AutoIndexService;
import net.phanmemmottrieu.service.GoogleBotVisitService;
import net.phanmemmottrieu.cache.PaginationCacheManager;
import net.phanmemmottrieu.cache.ServiceDataCacheManager;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.scheduling.annotation.Scheduled;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.text.Normalizer;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;
import javax.imageio.ImageIO;
import net.coobird.thumbnailator.Thumbnails;

// --- Import Thymeleaf classes ---
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.templateresolver.StringTemplateResolver;
// --- End Thymeleaf imports ---

@Controller
public class WebSpringController {

    private static final Logger logger = LoggerFactory.getLogger(WebSpringController.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    // OPTIMIZED: Reuse shared ObjectMapper to avoid repeated object creation (memory pressure)
    private static final ObjectMapper SHARED_OBJECT_MAPPER = new ObjectMapper();
    private final RecordManager recordManager;
    private final SitemapService sitemapService;
    private final AutoIndexService autoIndexService;
    private final GoogleBotVisitService googleBotVisitService;
    @Value("${app.data.dir}")
    private String appDataDir;
    // --- Add TemplateEngine for Thymeleaf ---
    private final TemplateEngine templateEngine;
    // --- End TemplateEngine ---
    
    // 🔴 FIXED: Reduced from 256 to 80 concurrent SSR renders for 5.76GB RAM server
    // Fair semaphore: đảm bảo FIFO, tránh starvation cho requests chậm
    private final Semaphore ssrSemaphore = new Semaphore(80, true);
    
    // 🔴 SERVICE DATA CACHE MANAGER: Cache sitemap/category/detail paths với TTL 60-120s
    private ServiceDataCacheManager serviceDataCacheManager;
    
    // Rate limiting for SSR endpoints (IP → last request time + count)
    // 🔴 FIXED: Dùng ConcurrentHashMap thay vì HashMap để tránh synchronized bottleneck
    private final Map<String, Long> ssrRateLimitMap = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, Integer> ssrRequestCountMap = new java.util.concurrent.ConcurrentHashMap<>();
    // 🔴 FIXED: Reduced from 1000 to 200 req/min for 5.76GB RAM server
    // Với cache 30 phút, đa số requests sẽ hit cache thay vì tính toán mới
    private static final int SSR_MAX_REQUESTS_PER_MINUTE = 200;
    private static final long SSR_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
    
    // Search rate limiting (IP → last request time + count)
    // 🔴 FIXED: Dùng ConcurrentHashMap để tránh synchronized bottleneck
    private final Map<String, Long> searchRateLimitMap = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, Integer> searchRequestCountMap = new java.util.concurrent.ConcurrentHashMap<>();
    private static final int SEARCH_MAX_REQUESTS_PER_MINUTE = 10;
    private static final long SEARCH_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
    
    // ✅ Sitemap ISO8601 formatter
    private static final DateTimeFormatter SITEMAP_LASTMOD_FORMATTER = DateTimeFormatter.ISO_INSTANT;

    // SSR Data Cache (domain → cached data + timestamp)
    private final Map<String, Map<String, Object>> ssrCategoriesCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> ssrServiceDataCache = new java.util.concurrent.ConcurrentHashMap<>();
    // Cache nội dung file template React để tránh IO mỗi request
    private final Map<String, Map<String, Object>> reactTemplateCache = new java.util.concurrent.ConcurrentHashMap<>();
    // OPTIMIZED: Tăng cache TTL từ 15 min -> 30 min để giảm tải DB cho 10K+ concurrent users
    // Cache lâu hơn giúp giảm số lượng query DB và computation overhead
    private static final long CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache
    // Cache trang chi tiết bất động sản (cross-request) để giảm truy vấn DB khi bot crawl liên tục
    private static final long SERVICE_DETAIL_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
    private static final String TABLE_SERVICE_TRAFFIC_STATS = "crm_service_traffic_stats";
    private final Set<String> trafficStatsTableReadyApps = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private static final long STATIC_DETECT_TTL_MS = 5 * 60 * 1000; // cache static detection 5 minutes
    private static final Set<String> STATIC_EXTENSIONS = Set.of(
        "js", "css", "png", "jpg", "jpeg", "gif", "svg", "ico",
        "woff", "woff2", "ttf", "eot", "webp", "mp4", "webm", "json", "xml", "map"
    );
    private static final Set<String> UPLOAD_IMAGE_EXTENSIONS = Set.of(
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"
    );
    private final Map<String, CacheEntry<Map<String, Object>>> propertyDetailCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, CacheEntry<Boolean>> staticDetectionCache = new java.util.concurrent.ConcurrentHashMap<>();
    // Dedup processing for image optimization (avoid double work on concurrent requests)
    private final Map<String, Object> imageProcessLocks = new java.util.concurrent.ConcurrentHashMap<>();
    
    // Feed ping control to avoid spamming Google
    private static final Map<String, Long> FEED_PING_CACHE = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long FEED_PING_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
    private static final ScheduledExecutorService FEED_PING_EXECUTOR = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "feed-ping-worker");
        t.setDaemon(true);
        return t;
    });

    // ==== AUTO CACHE INVALIDATION (NO NEW ENDPOINTS) ====
    private static WebSpringController INSTANCE;
    private static final ConcurrentLinkedQueue<InvalidationTask> INVALIDATION_QUEUE = new ConcurrentLinkedQueue<>();
    private static final ScheduledExecutorService INVALIDATION_EXECUTOR = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "cache-invalidation-worker");
        t.setDaemon(true);
        return t;
    });
    private static final AtomicBoolean WORKER_STARTED = new AtomicBoolean(false);
    private static final Map<String, CacheEntry<List<RouteConfig>>> ROUTE_CACHE_BY_TABLE = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    private static final class InvalidationTask {
        final String appId;
        final String tableName;
        final String domain;
        final String serviceType;
        final String slug;

        InvalidationTask(String appId, String tableName, String domain, String serviceType, String slug) {
            this.appId = appId;
            this.tableName = tableName;
            this.domain = domain;
            this.serviceType = serviceType;
            this.slug = slug;
        }
    }

    private static final class RouteConfig {
        final String appId;
        final String domainName;
        final String tblServices;
        final String tblServiceDetail;

        RouteConfig(String appId, String domainName, String tblServices, String tblServiceDetail) {
            this.appId = appId;
            this.domainName = domainName;
            this.tblServices = tblServices;
            this.tblServiceDetail = tblServiceDetail;
        }
    }

    private static final class CacheEntry<T> {
        final T value;
        final long timestamp;

        CacheEntry(T value, long timestamp) {
            this.value = value;
            this.timestamp = timestamp;
        }
    }

    // Whitelist of public service_codes (frontend uses these) mapped to internal table names (security: hide table names)
    private static final Map<String, String> SERVICE_CODE_TO_TABLE = Map.ofEntries(
        Map.entry("services", "web_services"),
        Map.entry("services-detail", "web_service_detail"),
        Map.entry("home", "wu_home"),
        Map.entry("about", "wu_about"),
        Map.entry("contact", "wu_contact"),
        Map.entry("products", "wu_products"),
        Map.entry("news", "wu_news"),
        Map.entry("events", "wu_events")
    );

    @Autowired
    public WebSpringController(RecordManager recordManager, SitemapService sitemapService, AutoIndexService autoIndexService, ServiceDataCacheManager serviceDataCacheManager, GoogleBotVisitService googleBotVisitService) {
        this.recordManager = recordManager;
        this.sitemapService = sitemapService;
        this.autoIndexService = autoIndexService;
        this.serviceDataCacheManager = serviceDataCacheManager;
        this.googleBotVisitService = googleBotVisitService;
        objectMapper.enable(SerializationFeature.INDENT_OUTPUT); // For debugging JSON logs

        // Expose singleton for background invalidation worker (no new endpoints required)
        INSTANCE = this;
        startInvalidationWorker();

        // --- Initialize Thymeleaf TemplateEngine for String templates ---
        StringTemplateResolver templateResolver = new StringTemplateResolver();
        templateResolver.setTemplateMode("HTML"); // Specify HTML template mode
        this.templateEngine = new TemplateEngine();
        this.templateEngine.setTemplateResolver(templateResolver);
        // --- End Initialization ---
    }

    /**
     * ✅ CACHE INVALIDATION: Xóa cache khi có dữ liệu mới để user thấy update realtime
     * Gọi method này sau khi create/update/delete service record trong tbl_services hoặc tbl_service_detail
     * CHỈ clear cache liên quan service data, KHÔNG touch static templates
     */
    public void invalidateServiceCache(String appId, String domain, String serviceType) {
        int cleared = 0;
        
        // 1. Xóa cache listing page của service type đó
        if (domain != null && !domain.isEmpty()) {
            // Xóa tất cả cache keys có chứa domain + serviceType
            Iterator<String> it = ssrServiceDataCache.keySet().iterator();
            while (it.hasNext()) {
                String key = it.next();
                if (key.startsWith(domain + ":")) {
                    if (serviceType == null || key.contains(":" + serviceType + ":")) {
                        it.remove();
                        cleared++;
                    }
                }
            }
            
            // Xóa cache categories của domain
            String catKey = domain + ":";
            ssrCategoriesCache.keySet().removeIf(k -> k.startsWith(catKey));
        }
        
        // 2. Xóa detail cache liên quan
        if (appId != null && !appId.isEmpty()) {
            Iterator<String> detailIt = propertyDetailCache.keySet().iterator();
            while (detailIt.hasNext()) {
                String key = detailIt.next();
                if (key.contains(appId) && (serviceType == null || key.contains(serviceType))) {
                    detailIt.remove();
                    cleared++;
                }
            }
        }
        
        // 3. Clear ServiceDataCacheManager cache
        if (serviceDataCacheManager != null && domain != null) {
            serviceDataCacheManager.invalidateDomain(domain);
        }
        
        // Cache đã được xóa
    }

    /**
     * ✅ CACHE INVALIDATION: Xóa cache detail page cụ thể
     * Gọi khi update/delete một service detail record cụ thể
     */
    public void invalidateDetailCache(String appId, String slug, String serviceType) {
        if (slug == null || slug.isEmpty()) return;
        
        int cleared = 0;
        Iterator<String> it = propertyDetailCache.keySet().iterator();
        while (it.hasNext()) {
            String key = it.next();
            // Match by slug or serviceType
            if (key.contains(slug) || (serviceType != null && key.contains(serviceType))) {
                it.remove();
                cleared++;
            }
        }
        
        // Detail cache đã được xóa
    }

    // ==== AUTO INVALIDATION WORKER (NO NEW ENDPOINTS) ====
    private void startInvalidationWorker() {
        if (WORKER_STARTED.compareAndSet(false, true)) {
            INVALIDATION_EXECUTOR.scheduleWithFixedDelay(this::drainInvalidationQueue, 0, 1, TimeUnit.SECONDS);
            // Worker đã khởi động
        }
    }

    public static void enqueueAutoInvalidation(String appId, String tableName, Map<String, Object> record) {
        if (INSTANCE == null) {
            return; // controller not ready yet
        }
        if (tableName == null || tableName.isEmpty()) {
            return;
        }
        String domain = safeRecordStr(record != null ? record.get("domain") : null);
        String serviceType = firstNonEmpty(
                safeRecordStr(record != null ? record.get("service_type") : null),
                safeRecordStr(record != null ? record.get("serviceType") : null));
        String slug = safeRecordStr(record != null ? record.get("slug") : null);

        INVALIDATION_QUEUE.offer(new InvalidationTask(appId, tableName, domain, serviceType, slug));
    }

    private void drainInvalidationQueue() {
        try {
            int processed = 0;
            InvalidationTask task;
            while ((task = INVALIDATION_QUEUE.poll()) != null) {
                processInvalidationTask(task);
                processed++;
                if (processed >= 100) {
                    break; // tránh giữ worker quá lâu trong một tick
                }
            }
        } catch (Exception e) {
            logger.warn("Cache invalidation worker error: {}", e.getMessage(), e);
        }
    }

    private void processInvalidationTask(InvalidationTask task) {
        if (task == null || task.tableName == null || task.tableName.isEmpty()) {
            return;
        }

        List<RouteConfig> routes = resolveRoutesForTable(task.appId, task.tableName, task.domain);
        if (routes.isEmpty()) {
            logger.debug("Skip auto invalidation: no route matched table={} appId={} domainHint={}",
                    task.tableName, task.appId, task.domain);
            return;
        }

        String serviceType = firstNonEmpty(task.serviceType);
        for (RouteConfig cfg : routes) {
            String domainToUse = firstNonEmpty(task.domain, cfg.domainName);
            if (domainToUse == null || domainToUse.isEmpty()) {
                continue;
            }
            try {
                invalidateServiceCache(cfg.appId, domainToUse, serviceType);
                if (task.slug != null && !task.slug.isEmpty()) {
                    invalidateDetailCache(cfg.appId, task.slug, serviceType);
                }
            } catch (Exception ex) {
                logger.warn("Auto invalidation failed for table {} appId {} domain {}: {}",
                        task.tableName, cfg.appId, domainToUse, ex.getMessage());
            }
        }
    }

    private List<RouteConfig> resolveRoutesForTable(String appId, String tableName, String domainHint) {
        String cacheKey = (appId != null ? appId : "") + "|" + tableName + "|" + (domainHint != null ? domainHint : "");
        CacheEntry<List<RouteConfig>> cached = ROUTE_CACHE_BY_TABLE.get(cacheKey);
        if (cached != null && (System.currentTimeMillis() - cached.timestamp) < ROUTE_CACHE_TTL_MS) {
            return cached.value;
        }

        List<RouteConfig> routes = new ArrayList<>();
        try {
            SearchFilter filter = new SearchFilter();
            filter.setOperator("AND");
            List<SearchFilter> conditions = new ArrayList<>();
            conditions.add(RecordManager.createCondition("run", "eq", 1));

            if (appId != null && !appId.isEmpty()) {
                conditions.add(RecordManager.createCondition("app_id", "eq", appId));
            }

            SearchFilter tableOr = new SearchFilter();
            tableOr.setOperator("OR");
            tableOr.setConditions(List.of(
                    RecordManager.createCondition("tbl_services", "eq", tableName),
                    RecordManager.createCondition("tbl_service_detail", "eq", tableName)));
            conditions.add(tableOr);

            if (domainHint != null && !domainHint.isEmpty()) {
                conditions.add(RecordManager.createCondition("domain_name", "like", domainHint));
            }

            filter.setConditions(conditions);
            Map<String, Object> res = recordManager.filter("csm", "sys_la_routers", filter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getOrDefault("rows", new ArrayList<>());

            for (Map<String, Object> row : rows) {
                String routeAppId = safeRecordStr(row.get("app_id"));
                String routeDomain = safeRecordStr(row.get("domain_name"));
                String tblServices = safeRecordStr(row.get("tbl_services"));
                String tblServiceDetail = safeRecordStr(row.get("tbl_service_detail"));

                if (!routeAppId.isEmpty() && !tblServices.isEmpty() && !tblServiceDetail.isEmpty()) {
                    routes.add(new RouteConfig(routeAppId, routeDomain, tblServices, tblServiceDetail));
                }
            }
        } catch (Exception e) {
            logger.warn("Không thể lấy route cho table {} appId {}: {}", tableName, appId, e.getMessage());
        }

        ROUTE_CACHE_BY_TABLE.put(cacheKey, new CacheEntry<>(routes, System.currentTimeMillis()));
        return routes;
    }

    private static String safeRecordStr(Object value) {
        if (value == null) {
            return "";
        }
        return value.toString().trim();
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return null;
    }

    /**
     * ✅ ADMIN ENDPOINT: Xóa SERVICE cache (CHỈ tbl_services và tbl_service_detail)
     * KHÔNG xóa template cache và static detection cache
     * Endpoint: GET /api/cache/clear?token=ADMIN_TOKEN
     */
    @GetMapping("/api/cache/clear")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> clearAllCache(
        @RequestParam(required = false) String token
    ) {
        // Security: Chỉ cho phép admin với token hợp lệ
        if (token == null || !"CSM_ADMIN_2026".equals(token)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", "Invalid admin token"));
        }

        int cleared = 0;
        
        // CHỈ clear SERVICE-RELATED cache
        cleared += ssrCategoriesCache.size();
        cleared += ssrServiceDataCache.size();
        cleared += propertyDetailCache.size();

        ssrCategoriesCache.clear();
        ssrServiceDataCache.clear();
        propertyDetailCache.clear();

        // Xóa cache của ServiceDataCacheManager (service-related only)
        if (serviceDataCacheManager != null) {
            serviceDataCacheManager.clearAll();
        }
        
        // KHÔNG clear:
        // - reactTemplateCache (static HTML templates)
        // - staticDetectionCache (static file detection)
        // - imageProcessLocks (image processing)

        logger.warn("⚠️ ADMIN: Cleared SERVICE caches ({} entries) - templates/static cache preserved", cleared);

        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Service caches cleared (templates preserved)",
            "entriesCleared", cleared,
            "timestamp", System.currentTimeMillis()
        ));
    }

    /**
     * ✅ SELECTIVE CACHE INVALIDATION: Xóa cache theo appId/domain/service_type
     * Gọi từ admin panel sau khi update service data
     * Endpoint: POST /api/cache/invalidate?appId=xxx&domain=yyy&serviceType=zzz&token=ADMIN_TOKEN
     */
    @PostMapping("/api/cache/invalidate")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> invalidateCacheSelective(
        @RequestParam(required = false) String appId,
        @RequestParam(required = false) String domain,
        @RequestParam(required = false) String serviceType,
        @RequestParam(required = false) String slug,
        @RequestParam(required = false) String token
    ) {
        if (token == null || !"CSM_ADMIN_2026".equals(token)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", "Invalid admin token"));
        }

        // Invalidate service cache
        invalidateServiceCache(appId, domain, serviceType);
        
        // Invalidate detail cache nếu có slug
        if (slug != null && !slug.isEmpty()) {
            invalidateDetailCache(appId, slug, serviceType);
        }

        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Service cache invalidated",
            "appId", appId != null ? appId : "all",
            "domain", domain != null ? domain : "all",
            "serviceType", serviceType != null ? serviceType : "all"
        ));
    }

    /**
     * SSR endpoint: Fetch KQXS rows for a specific station (table) and date.
     * Only allows sanitized table names starting with "kqxs_" and a dd/MM/yyyy date.
     * Returns JSON: { rows: [...] }
     */
        // SSR logic handler for /kqxs/station (called from handleWebRequest)
        public ResponseEntity<byte[]> kqxsStation(
            HttpServletRequest request,
            String objName,
            String date
        ) {
        try {
            // Only business logic for kqxsStation
            final String clientIp = getClientIp(request);
            String userAgent = request.getHeader("User-Agent");
            if (!checkSsrRateLimit(clientIp, userAgent, "/ssr/kqxs/station")) {
                Map<String, Object> err = Map.of("success", false, "message", "Rate limit exceeded");
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            // Sanitize and validate table name (station)
            String tbl = sanitizeInput(objName);
            if (tbl == null || !tbl.startsWith("kqxs_") || tbl.length() < 6) {
                Map<String, Object> err = Map.of("success", false, "message", "Invalid station");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            // Convert date dd/MM/yyyy -> yyyyMMdd
            String d = date == null ? null : date.trim();
            if (d == null || d.isEmpty() || !d.contains("/")) {
                Map<String, Object> err = Map.of("success", false, "message", "Invalid date format");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }
            String[] parts = d.split("/");
            if (parts.length != 3) {
                Map<String, Object> err = Map.of("success", false, "message", "Invalid date format");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }
            String formatted = parts[2] + parts[1] + parts[0];

            // Build SearchFilter: field_ngay eq yyyyMMdd
            SearchFilter filter = new SearchFilter();
            filter.setField("field_ngay");
            filter.setType("eq");
            filter.setValue(formatted);

            Map<String, Object> result = recordManager.filter("kqxs", tbl, filter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", List.of());
            Map<String, Object> payload = new HashMap<>();
            payload.put("rows", rows);
            payload.put("success", true);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsBytes(payload));
        } catch (Exception e) {
            logger.error("SSR /ssr/kqxs/station error", e);
            Map<String, Object> err = Map.of("success", false, "message", "Server error");
            try {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            } catch (Exception ex) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
        }
    }

    /**
     * SSR endpoint: Fetch KQXS stations (kqxs_lichxoso) with optional filters mien and thu.
     * Returns JSON: { rows: [...] }
     */
        // SSR logic handler for /kqxs/stations (called from handleWebRequest)
        public ResponseEntity<byte[]> kqxsStations(
            HttpServletRequest request,
            String mien,
            String thu
        ) {
        try {
            final String clientIp = getClientIp(request);
            String userAgent = request.getHeader("User-Agent");
            if (!checkSsrRateLimit(clientIp, userAgent, "/ssr/kqxs/stations")) {
                Map<String, Object> err = Map.of("success", false, "message", "Rate limit exceeded");
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            String tbl = "kqxs_lichxoso";

            // Build SearchFilter from optional params
            SearchFilter finalFilter;
            List<SearchFilter> conds = new ArrayList<>();
            if (mien != null && !mien.trim().isEmpty()) {
                SearchFilter f = new SearchFilter();
                f.setField("mien");
                f.setType("eq");
                f.setValue(sanitizeInput(mien.trim()));
                conds.add(f);
            }
            if (thu != null && !thu.trim().isEmpty()) {
                SearchFilter f = new SearchFilter();
                f.setField("thu");
                f.setType("eq");
                f.setValue(sanitizeInput(thu.trim()));
                conds.add(f);
            }
            if (conds.isEmpty()) {
                // Default: id gt 0
                finalFilter = new SearchFilter();
                finalFilter.setField("id");
                finalFilter.setType("gt");
                finalFilter.setValue("0");
            } else if (conds.size() == 1) {
                finalFilter = conds.get(0);
            } else {
                finalFilter = new SearchFilter();
                finalFilter.setOperator("AND");
                finalFilter.setConditions(conds);
            }

            Map<String, Object> result = recordManager.filter("kqxs", tbl, finalFilter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", List.of());
            Map<String, Object> payload = new HashMap<>();
            payload.put("rows", rows);
            payload.put("success", true);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsBytes(payload));
        } catch (Exception e) {
            logger.error("SSR /ssr/kqxs/stations error", e);
            Map<String, Object> err = Map.of("success", false, "message", "Server error");
            try {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            } catch (Exception ex) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
        }
    }

    /**
     * SSR endpoint: Fetch VPTS table data for specific allowed object names.
     * Returns JSON: { rows: [...] }
     */
    // SSR logic handler for /vpts (called from handleWebRequest)
    public ResponseEntity<byte[]> vpts(
            HttpServletRequest request,
            String objName
    ) {
        try {
            final String clientIp = getClientIp(request);
            String userAgent = request.getHeader("User-Agent");
            if (!checkSsrRateLimit(clientIp, userAgent, "/ssr/kqxs/daterange")) {
                Map<String, Object> err = Map.of("success", false, "message", "Rate limit exceeded");
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            // Whitelist allowed VPTS object names
            Set<String> allowed = Set.of(
                    "vpts_danhngon",
                    "vpts_dongcong",
                    "vpts_tamsat",
                    "vpts_khongminh",
                    "vpts_thapnhitruc",
                    "vpts_nguyenbinhkhiem",
                    "vpts_cuutinh",
                    "vpts_gionuoclon",
                    "vpts_kiethungtinhthoi",
                    "vpts_cathungthan",
                    "vpts_giokhongvong",
                    "vpts_lucnham",
                    "vpts_tietkhi",
                    "vpts_saotot",
                    "vpts_saoxau"
            );
            String tbl = sanitizeInput(objName);
            if (tbl != null) tbl = tbl.toLowerCase();
            // Xử lý VPTS request
            if (tbl == null || !allowed.contains(tbl)) {
                Map<String, Object> err = Map.of("success", false, "message", "Invalid object name: " + objName);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            // Basic filter: id gt 0
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("gt");
            filter.setValue("0");

            Map<String, Object> result = recordManager.filter("vpts", tbl, filter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", List.of());
            Map<String, Object> payload = new HashMap<>();
            payload.put("rows", rows);
            payload.put("success", true);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsBytes(payload));
        } catch (Exception e) {
            logger.error("SSR /ssr/vpts error", e);
            Map<String, Object> err = Map.of("success", false, "message", "Server error");
            try {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            } catch (Exception ex) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
        }
    }

    /**
     * Helper: normalize date string to yyyyMMdd. Accepts dd/MM/yyyy or digits.
     */
    private String normalizeToYyyyMMdd(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) return null;
        String s = dateStr.trim();
        if (s.contains("/")) {
            String[] parts = s.split("/");
            if (parts.length == 3) {
                return parts[2] + parts[1] + parts[0];
            }
            return null;
        }
        String digits = s.replaceAll("\\D", "");
        if (digits.length() == 8) return digits;
        return null;
    }

    /**
     * SSR endpoint: fetch KQXS table by date range (field_ngay between from/to).
     * Only allows tables starting with "kqxs_".
     */
        // SSR logic handler for /kqxs/table-range (called from handleWebRequest)
        public ResponseEntity<byte[]> kqxsTableRange(
            HttpServletRequest request,
            String objName,
            String from,
            String to
        ) {
        try {
            final String clientIp = getClientIp(request);
            String userAgent = request.getHeader("User-Agent");
            if (!checkSsrRateLimit(clientIp, userAgent, "/ssr/kqxs/period")) {
                Map<String, Object> err = Map.of("success", false, "message", "Rate limit exceeded");
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            String tbl = sanitizeInput(objName);
            if (tbl == null || !tbl.startsWith("kqxs_") || tbl.length() < 6) {
                Map<String, Object> err = Map.of("success", false, "message", "Invalid table");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            String fromYMD = normalizeToYyyyMMdd(from);
            String toYMD = normalizeToYyyyMMdd(to);

            List<SearchFilter> conds = new ArrayList<>();
            if (fromYMD != null) {
                conds.add(RecordManager.createCondition("field_ngay", "gte", fromYMD));
            }
            if (toYMD != null) {
                conds.add(RecordManager.createCondition("field_ngay", "lte", toYMD));
            }

            SearchFilter filter;
            if (conds.isEmpty()) {
                filter = RecordManager.createCondition("id", "gt", "0");
            } else if (conds.size() == 1) {
                filter = conds.get(0);
            } else {
                filter = new SearchFilter();
                filter.setOperator("AND");
                filter.setConditions(conds);
            }

            Map<String, Object> result = recordManager.filter("kqxs", tbl, filter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", List.of());
            Map<String, Object> payload = new HashMap<>();
            payload.put("rows", rows);
            payload.put("success", true);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsBytes(payload));
        } catch (Exception e) {
            logger.error("SSR /ssr/kqxs/table-range error", e);
            Map<String, Object> err = Map.of("success", false, "message", "Server error");
            try {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            } catch (Exception ex) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
        }
    }

    /**
     * SSR endpoint: fetch KQXS tổng hợp (kqxs_tonghop) with validated params.
     */
        // SSR logic handler for /kqxs/tonghop (called from handleWebRequest)
        public ResponseEntity<byte[]> kqxsTongHop(
            HttpServletRequest request,
            String maDuoi,
            String tuNgay,
            String denNgay,
            String l2c,
            String tky,
            String ktn,
            String ktd,
            String tnd,
            String nhomSo,
            String nhomSoTriet,
            String soNhap,
            String trietTieu,
            String trietDuoi,
            String showNhom,
            String showTk,
            String loaiTim,
            String ketQuaFilter
        ) {
        try {
            final String clientIp = getClientIp(request);
            String userAgent = request.getHeader("User-Agent");
            if (!checkSsrRateLimit(clientIp, userAgent, "/ssr/vpts/vietlott")) {
                Map<String, Object> err = Map.of("success", false, "message", "Rate limit exceeded");
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            String tbl = "kqxs_tonghop";
            String appId = "tonghop";

            String fromYMD = normalizeToYyyyMMdd(tuNgay);
            String toYMD = normalizeToYyyyMMdd(denNgay);
            if (fromYMD == null || toYMD == null) {
                Map<String, Object> err = Map.of("success", false, "message", "Invalid date range");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            }

            List<SearchFilter> conds = new ArrayList<>();
            conds.add(RecordManager.createCondition("ma_duoi", "eq", sanitizeInput(maDuoi)));
            conds.add(RecordManager.createCondition("field_ngay", "gte", fromYMD));
            conds.add(RecordManager.createCondition("field_ngay", "lte", toYMD));

            // Helper to add simple eq if value present
            java.util.function.BiConsumer<String, String> addEq = (field, val) -> {
                if (val != null && !val.trim().isEmpty()) {
                    conds.add(RecordManager.createCondition(field, "eq", val.trim()));
                }
            };

            addEq.accept("l2c", l2c);
            addEq.accept("tky", tky);
            addEq.accept("ktn", ktn);
            addEq.accept("ktd", ktd);
            addEq.accept("tnd", tnd);
            addEq.accept("nhom_so", nhomSo);
            addEq.accept("nhom_so_triet", nhomSoTriet);
            addEq.accept("so_nhap", soNhap);
            addEq.accept("triet_tieu", trietTieu);
            addEq.accept("triet_duoi", trietDuoi);
            addEq.accept("show_nhom", showNhom);
            addEq.accept("show_tk", showTk);
            addEq.accept("loai_tim", loaiTim);
            addEq.accept("ket_qua_filter", ketQuaFilter);

            SearchFilter filter;
            if (conds.size() == 1) {
                filter = conds.get(0);
            } else {
                filter = new SearchFilter();
                filter.setOperator("AND");
                filter.setConditions(conds);
            }

            Map<String, Object> result = recordManager.filter(appId, tbl, filter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", List.of());
            Map<String, Object> payload = new HashMap<>();
            payload.put("rows", rows);
            payload.put("success", true);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsBytes(payload));
        } catch (Exception e) {
            logger.error("SSR /ssr/kqxs/tonghop error", e);
            Map<String, Object> err = Map.of("success", false, "message", "Server error");
            try {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(err));
            } catch (Exception ex) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
        }
    }

    // Helper method to read file content (if you don't have one already)
    private String readFileContent(File file) throws IOException {
        return Files.readString(file.toPath(), StandardCharsets.UTF_8);
    }

    // Trong lớp của bạn, thêm một phương thức tiện ích để tạo nội dung JS rỗng đã
    // nén
    private byte[] createEmptyDeflatedJs() throws Exception {
        String emptyJsComment = "// No JavaScript content available for this request.";
        try {
            // Nén chuỗi comment này
            return deflateBytes(emptyJsComment.getBytes(StandardCharsets.UTF_8), Deflater.DEFAULT_COMPRESSION);
        } catch (IOException e) {
            logger.error("Error deflating empty JS comment: {}", e.getMessage());
            return new byte[0]; // Trả về mảng byte rỗng nếu có lỗi nén
        }
    }
    
    /**
     * Get client IP address from request
     */
    private String getClientIp(HttpServletRequest request) {
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader == null || xfHeader.isEmpty() || "unknown".equalsIgnoreCase(xfHeader)) {
            return request.getRemoteAddr();
        }
        return xfHeader.split(",")[0].trim();
    }
    
    /**
     * Check if request is for static file (JS, CSS, images, fonts, etc.)
     * 🔴 FIXED: Static files should NOT be rate limited
     * ✅ Includes both extension-based and path-based detection
     */
    private boolean isStaticFile(String uri) {
        if (uri == null) return false;
        String normalized = uri.startsWith("/") ? uri : "/" + uri;
        String lowerUri = normalized.toLowerCase();

        // Cache hit first to avoid repeated IO and regex-like checks
        CacheEntry<Boolean> cached = staticDetectionCache.get(lowerUri);
        if (cached != null && (System.currentTimeMillis() - cached.timestamp) < STATIC_DETECT_TTL_MS) {
            return Boolean.TRUE.equals(cached.value);
        }

        boolean isStatic = false;

        // Try real file existence + mime detection first
        try {
            File staticFile = recordManager.getStaticFile(normalized);
            if (staticFile != null && staticFile.exists() && staticFile.isFile()) {
                String mime = Files.probeContentType(staticFile.toPath());
                if (mime != null) {
                    String m = mime.toLowerCase();
                    isStatic = m.startsWith("image/") || m.startsWith("video/") || m.startsWith("audio/") ||
                               m.startsWith("font/") || m.equals("text/css") ||
                               m.equals("application/javascript") || m.equals("application/x-javascript") ||
                               m.equals("application/json") || m.equals("application/manifest+json") ||
                               m.equals("application/xml") || m.equals("text/xml");
                }
                // If mime missing, fall back to extension check
                if (!isStatic) {
                    String ext = getExtension(lowerUri);
                    isStatic = STATIC_EXTENSIONS.contains(ext);
                }
            }
        } catch (Exception e) {
            logger.debug("Static detection probe failed for {}: {}", normalized, e.getMessage());
        }

        // Final fallback: light extension check for dynamic-generated assets (no file yet)
        if (!isStatic) {
            String ext = getExtension(lowerUri);
            isStatic = STATIC_EXTENSIONS.contains(ext);
        }

        staticDetectionCache.put(lowerUri, new CacheEntry<>(isStatic, System.currentTimeMillis()));
        return isStatic;
    }

    private String getExtension(String lowerUri) {
        int idx = lowerUri.lastIndexOf('.');
        if (idx == -1 || idx == lowerUri.length() - 1) return "";
        String ext = lowerUri.substring(idx + 1);
        int q = ext.indexOf('?');
        if (q != -1) {
            ext = ext.substring(0, q);
        }
        return ext;
    }
    
    /**
     * Check SSR rate limit for IP address
     * Allows SSR_MAX_REQUESTS_PER_MINUTE requests per IP per minute
     * 🔴 FIXED: Xóa synchronized, dùng ConcurrentHashMap.compute() cho thread-safe
     * 🔴 FIXED: Thêm Google-InspectionTool vào exemption list
     * 🔴 FIXED: Skip rate limiting cho static files
     */
    private boolean checkSsrRateLimit(String ip, String userAgent, String uri) {
        // 🟢 EXEMPTION 1: Static files không cần rate limiting
        if (isStaticFile(uri)) {
            return true;
        }
        
        // 🟢 EXEMPTION 2: Google Crawler không cần rate limiting
        // Google-InspectionTool = Google Search Console test tool
        if (userAgent != null && (userAgent.contains("Googlebot") || 
                                  userAgent.contains("Google-Site-Verification") ||
                                  userAgent.contains("Google-InspectionTool"))) {
            logger.debug("✅ Rate limit exempted for Google Crawler: {}", userAgent);
            return true;
        }
        
        long now = System.currentTimeMillis();
        
        // 🔴 FIXED: Atomic operation với ConcurrentHashMap.compute()
        // Tránh race condition mà không cần synchronized
        ssrRateLimitMap.compute(ip, (k, lastTime) -> {
            if (lastTime == null || (now - lastTime) > SSR_RATE_LIMIT_WINDOW_MS) {
                // Reset window
                ssrRequestCountMap.put(ip, 1);
                return now;
            }
            return lastTime;
        });
        
        // Atomic increment và get count
        int count = ssrRequestCountMap.compute(ip, (k, v) -> {
            if (v == null) return 1;
            Long lastTime = ssrRateLimitMap.get(ip);
            if (lastTime == null || (now - lastTime) > SSR_RATE_LIMIT_WINDOW_MS) {
                return 1; // Reset nếu window mới
            }
            return v + 1;
        });
        
        if (count > SSR_MAX_REQUESTS_PER_MINUTE) {
            logger.warn("⚠️ SSR rate limit exceeded for IP: {} (count: {})", ip, count);
            return false;
        }
        
        return true;
    }
    
    /**
     * Check search rate limit for IP address
     * Allows SEARCH_MAX_REQUESTS_PER_MINUTE requests per IP per minute
     * 🔴 FIXED: Xóa synchronized, dùng ConcurrentHashMap.compute()
     */
    private boolean checkSearchRateLimit(String ip) {
        long now = System.currentTimeMillis();
        
        // Atomic operation với ConcurrentHashMap.compute()
        searchRateLimitMap.compute(ip, (k, lastTime) -> {
            if (lastTime == null || (now - lastTime) > SEARCH_RATE_LIMIT_WINDOW_MS) {
                searchRequestCountMap.put(ip, 1);
                return now;
            }
            return lastTime;
        });
        
        int count = searchRequestCountMap.compute(ip, (k, v) -> {
            if (v == null) return 1;
            Long lastTime = searchRateLimitMap.get(ip);
            if (lastTime == null || (now - lastTime) > SEARCH_RATE_LIMIT_WINDOW_MS) {
                return 1;
            }
            return v + 1;
        });
        
        if (count > SEARCH_MAX_REQUESTS_PER_MINUTE) {
            logger.warn("⚠️ SECURITY: Search rate limit exceeded for IP: {} (count: {})", ip, count);
            return false;
        }
        
        return true;
    }

    // Simple TTL-based cache helpers
    private <T> T getCacheIfFresh(Map<String, CacheEntry<T>> cache, String key, long ttlMs) {
        CacheEntry<T> entry = cache.get(key);
        if (entry == null) {
            return null;
        }
        if ((System.currentTimeMillis() - entry.timestamp) > ttlMs) {
            cache.remove(key);
            return null;
        }
        return entry.value;
    }

    private <T> void putCacheValue(Map<String, CacheEntry<T>> cache, String key, T value) {
        cache.put(key, new CacheEntry<>(value, System.currentTimeMillis()));
    }

    /**
     * Cleanup rate limit maps periodically to avoid unbounded memory growth.
     * Removes IP entries that haven't made a request within 2 windows.
     */
    @Scheduled(fixedRate = 300000) // every 5 minutes
    private void cleanupRateLimitMaps() {
        long now = System.currentTimeMillis();
        long ssrTtl = SSR_RATE_LIMIT_WINDOW_MS * 2;
        ssrRateLimitMap.entrySet().removeIf(e -> (now - e.getValue()) > ssrTtl);
        // Remove counts for IPs that were purged from time map
        ssrRequestCountMap.keySet().removeIf(ip -> !ssrRateLimitMap.containsKey(ip));

        long searchTtl = SEARCH_RATE_LIMIT_WINDOW_MS * 2;
        searchRateLimitMap.entrySet().removeIf(e -> (now - e.getValue()) > searchTtl);
        searchRequestCountMap.keySet().removeIf(ip -> !searchRateLimitMap.containsKey(ip));

        // Purge expired cached property details to avoid stale data/memory leaks
        propertyDetailCache.entrySet().removeIf(e -> (now - e.getValue().timestamp) > SERVICE_DETAIL_CACHE_TTL_MS);
    }
    
    /**
     * Build SearchFilter from query params
     * Params starting with 'filter_' are treated as filters
     * SECURITY: Validates and sanitizes all parameters
     */
    @SuppressWarnings("unused")
    private SearchFilter buildSearchFilterFromParams(Map<String, String> params) {
        SearchFilter filter = new SearchFilter();
        
        if (params == null || params.isEmpty()) {
            return filter;
        }
        
        // --- SECURITY: Validate params first ---
        Map<String, Object> paramsMap = new HashMap<>(params);
        String validationError = validateSearchParams(paramsMap);
        if (validationError != null) {
            logger.warn("⚠️ SECURITY: buildSearchFilterFromParams validation failed: {}", validationError);
            return filter; // Return empty filter on validation failure
        }
        
        for (Map.Entry<String, String> entry : params.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            
            // Skip non-filter params
            if (key.equals("app_id") || key.equals("service_code") || 
                key.equals("page") || key.equals("pageSize")) {
                continue;
            }
            
            // --- SECURITY: Sanitize value before using ---
            String sanitizedValue = sanitizeInput(value);
            // Giá trị đã được sanitize
            
            // Handle filter_* params
            if (key.startsWith("filter_")) {
                String fieldName = key.substring(7); // Remove 'filter_' prefix
                filter.setField(sanitizeInput(fieldName));
                filter.setValue(sanitizedValue); // Use sanitized value
                filter.setType("eq"); // Default to equality filter
                break; // Only support single filter for now (can be enhanced)
            }
        }
        
        return filter;
    }
    
    /**
     * Clean URL từ tracking parameters (Facebook, Zalo, Google, v.v.)
     * Loại bỏ: fbclid, gclid, utm_*, zalopay, igshid, v.v.
     * Giữ lại: hl (language), page, q (search), category, v.v.
     */
    // Removed cleanUrlFromTrackingParams: handled on client side
    
    // --- SECURITY: Allowed search fields whitelist ---
    private static final Set<String> ALLOWED_SEARCH_FIELDS = Set.of(
        // Common paging / lang
        "q", "hl", "page", "pageSize", "sid",
        // Cursor-based pagination
        "lastkey", "take",
        // Service grouping
        "service_code", "category",
        // Real-estate filters (aligned với wu_services.tsx)
        "propertyType", "transactionType", "address",
        "area_min", "area_max", "price_min", "price_max",
        "bedrooms", "bathrooms", "floors", "frontWidth",
        "legalStatus", "furnished",
        // Legacy / misc
        "minPrice", "maxPrice", "location", "status", "featured",
        "publish_date_from", "publish_date_to", "sort", "order"
    );
    
    // --- SECURITY: SQL Injection patterns ---
    private static final Pattern SQL_INJECTION_PATTERN = Pattern.compile(
        "(?i)(union\\s+select|insert\\s+into|delete\\s+from|drop\\s+table|update\\s+set|exec\\s*\\(|execute\\s*\\(|--|\\/\\*|\\*\\/|xp_|sp_)",
        Pattern.CASE_INSENSITIVE
    );
    
    // --- SECURITY: XSS patterns ---
    private static final Pattern XSS_PATTERN = Pattern.compile(
        "(?i)(<script|<iframe|javascript:|on\\w+\\s*=|eval\\s*\\(|expression\\s*\\()",
        Pattern.CASE_INSENSITIVE
    );
    
    /**
     * Sanitize input to prevent injection attacks
     * Enhanced version: removes SQL injection and XSS patterns
     */
    private String sanitizeInput(String input) {
        if (input == null) return "";
        
        String sanitized = input;
        
        // Remove SQL injection patterns
        sanitized = SQL_INJECTION_PATTERN.matcher(sanitized).replaceAll("");
        
        // Remove XSS patterns
        sanitized = XSS_PATTERN.matcher(sanitized).replaceAll("");
        
        // Remove script tags and iframes
        sanitized = sanitized.replaceAll("(?i)<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>", "");
        sanitized = sanitized.replaceAll("(?i)<iframe\\b[^<]*(?:(?!<\\/iframe>)<[^<]*)*<\\/iframe>", "");
        
        // Remove event handlers (onclick, onerror, etc.)
        sanitized = sanitized.replaceAll("(?i)on\\w+\\s*=\\s*[\"'][^\"']*[\"']", "");
        
        // Remove javascript: protocol
        sanitized = sanitized.replaceAll("(?i)javascript:", "");
        
        // Limit length to prevent buffer overflow
        if (sanitized.length() > 500) {
            sanitized = sanitized.substring(0, 500);
        }
        
        return sanitized.trim();
    }
    
    /**
     * Validate search parameters for security threats
     * Returns error message if validation fails, null if OK
     */
    private String validateSearchParams(Map<String, Object> params) {
        if (params == null || params.isEmpty()) {
            return null;
        }
        
        // Check for invalid parameter keys
        for (String key : params.keySet()) {
            // Internal metadata injected by backend for analytics/tracking.
            if (key != null && (key.startsWith("__") || key.startsWith("csm-"))) {
                continue;
            }

            // Common ad/tracking params should not block data rendering.
            if (key != null && (
                    key.startsWith("utm_")
                    || "fbclid".equals(key)
                    || "gclid".equals(key)
                    || "wbraid".equals(key)
                    || "gbraid".equals(key)
                    || "ref".equals(key)
                    || "referrer".equals(key))) {
                continue;
            }

            // Only allow whitelisted fields
            if (!ALLOWED_SEARCH_FIELDS.contains(key)) {
                logger.warn("⚠️ SECURITY: Invalid search parameter key detected: {}", key);
                return "Invalid search parameter: " + key;
            }
            
            Object value = params.get(key);
            if (value == null) continue;
            
            String strValue = String.valueOf(value);
            
            // Check for SQL injection patterns
            if (SQL_INJECTION_PATTERN.matcher(strValue).find()) {
                logger.warn("⚠️ SECURITY: SQL injection attempt detected in {}: {}", key, strValue);
                return "Invalid search value detected";
            }
            
            // Check for XSS patterns
            if (XSS_PATTERN.matcher(strValue).find()) {
                logger.warn("⚠️ SECURITY: XSS attempt detected in {}: {}", key, strValue);
                return "Invalid search value detected";
            }
        }
        
        return null; // Validation passed
    }
    
    /**
     * Escape special characters in Lucene query to prevent Lucene injection
     */
    @SuppressWarnings("unused")
    private String escapeLuceneQuery(String query) {
        if (query == null || query.isEmpty()) {
            return "";
        }
        
        // Lucene special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \\
        String escaped = query
            .replace("\\", "\\\\")
            .replace("+", "\\+")
            .replace("-", "\\-")
            .replace("&&", "\\&&")
            .replace("||", "\\||")
            .replace("!", "\\!")
            .replace("(", "\\(")
            .replace(")", "\\)")
            .replace("{", "\\{")
            .replace("}", "\\}")
            .replace("[", "\\[")
            .replace("]", "\\]")
            .replace("^", "\\^")
            .replace("\"", "\\\"")
            .replace("~", "\\~")
            .replace("*", "\\*")
            .replace("?", "\\?")
            .replace(":", "\\:");
        
        return escaped;
    }

    @SuppressWarnings("unchecked")
    @RequestMapping("/**") // Handles all web requests
    public ResponseEntity<byte[]> handleWebRequest(
            HttpServletRequest request,
            @RequestHeader(required = false) Map<String, String> headers,
            @RequestParam(required = false) Map<String, String> queryParams,
            @RequestBody(required = false) String requestBody) {
        
        // Initialize response before try-catch to ensure it's accessible in catch/finally blocks
        StandardResponse response = new StandardResponse();
        response.set("requestId", UUID.randomUUID().toString());
        response.setIsApi(false);
        
        // 🔴 CRITICAL FIX: Enforce semaphore to limit concurrent processing (max 80 threads)
        boolean acquired = false;
        try {
            acquired = ssrSemaphore.tryAcquire(5, TimeUnit.SECONDS);
            if (!acquired) {
                logger.warn("⚠️ Server overloaded - Semaphore timeout (80/80 slots busy)");
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .header("Retry-After", "10")
                    .contentType(MediaType.TEXT_HTML)
                    .body("<html><body><h2>Server đang quá tải - Vui lòng thử lại sau 10s</h2></body></html>".getBytes());
            }
            
            // Check if this is an API request (host api.* OR URI /api/)
            String host = request.getHeader("Host");
            String uri = request.getRequestURI();
            boolean isApi = (host != null && host.startsWith("api.")) || uri.startsWith("/api/");
            
            if (isApi) {
                logger.warn("⚠️ API request reached WebSpringController (should go to ApiSpringController): {} {}", 
                    request.getMethod(), uri);
                return ResponseEntity.status(404)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"code\":404,\"success\":false,\"message\":\"API endpoint not found\"}".getBytes());
            }
            
            // Get request URI once at the beginning
            String path = request.getRequestURI();
            
            // --- BẮT ĐẦU THAY ĐỔI TẠI ĐÂY ---
        // Tạo một Map mới để lưu trữ các header với key đã được chuyển đổi sang
        // lowercase
        Map<String, String> lowerCaseHeaders = new HashMap<>();
        if (headers != null) { // Đảm bảo headers không null
            headers.forEach((key, value) -> lowerCaseHeaders.put(key.toLowerCase(), value));
        }
        // --- KẾT THÚC THAY ĐỔI TẠI ĐÂY ---
        
        // Normalize path early for consistent endpoint comparisons
        String normalizedPath = path;
        if (normalizedPath.length() > 1 && normalizedPath.endsWith("/")) {
            normalizedPath = normalizedPath.substring(0, normalizedPath.length() - 1);
        }
        String linkP = normalizedPath.toLowerCase();
        
        String xfHeader = request.getHeader("X-Forwarded-For");
        String Ip_Client = null;
        if (xfHeader == null || xfHeader.isEmpty() || "unknown".equalsIgnoreCase(xfHeader)) {
            Ip_Client = request.getRemoteAddr();
        } else {
            Ip_Client = xfHeader.split(",")[0].trim();
        }
        String method = request.getMethod();
        // path already declared at the beginning of method
        
        // ✅ FIX: Support Nginx proxy - check X-Forwarded-Host FIRST
        // When nginx proxy passes requests, it sends X-Forwarded-Host (real domain)
        // and Host header becomes localhost:9999 (backend server)
        String forwardedHost = request.getHeader("X-Forwarded-Host");
        String hostHeader = (forwardedHost != null && !forwardedHost.isEmpty()) 
            ? forwardedHost.toLowerCase()
            : lowerCaseHeaders.getOrDefault("host", "").toLowerCase();
        
        // String protocol = Objects.requireNonNullElse(request.getScheme(), "http");
        String forwardedProtocol = request.getHeader("X-Forwarded-Proto");
        String protocol = Objects.requireNonNullElse(forwardedProtocol, "http");
        String fullUrl = String.format("%s://%s%s", protocol, hostHeader, path);
        logger.info("🔗 Full URL: {}", fullUrl);

        logger.info("🌐🌐🌐 WebSpringController nhận request: {} {} (Host: {} từ client IP:{})", method, path,
                hostHeader, Ip_Client);

        logger.info("🌐 Xử lý Web request: {} {}", method, path);
        if (requestBody != null && !requestBody.isEmpty()) {
            logger.debug("📦 Body nhận được: {}", requestBody);
        }

        Map<String, Object> requestParams = new HashMap<>(queryParams);

        if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)) {
            // Use lowercase header map to avoid case sensitivity issues (e.g. 'Content-Type')
            String contentType = lowerCaseHeaders.getOrDefault("content-type", "");
            if (requestBody != null && !requestBody.isEmpty()) {
                try {
                    if (contentType.contains("application/json")) {
                        requestParams.putAll(objectMapper.readValue(requestBody, Map.class));
                    } else if (contentType.contains("application/x-www-form-urlencoded")) {
                        for (String line : requestBody.split("&")) {
                            String[] kv = line.split("=", 2);
                            if (kv.length == 2) {
                                requestParams.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8.name()),
                                        URLDecoder.decode(kv[1], StandardCharsets.UTF_8.name()));
                            }
                        }
                    }
                } catch (Exception e) {
                    logger.error("❌ Lỗi parse body: {}", e.getMessage(), e);
                    response.set("code", 400);
                    response.setHtmlBody("<html><body><h2>Lỗi khi phân tích dữ liệu gửi lên.</h2></body></html>");
                    return buildResponseEntity(response, null);
                }
            }
        }
        // Integrate "csm-" headers into requestParams
        if (!lowerCaseHeaders.isEmpty()) {
            for (Map.Entry<String, String> entry : lowerCaseHeaders.entrySet()) {
                if (entry.getKey().startsWith("csm-")) {
                    requestParams.put(entry.getKey(), entry.getValue());
                }
            }
        }
        
        // 🔴 FIXED: Get User-Agent header for Google Crawler detection
        String userAgent = request.getHeader("User-Agent");
        requestParams.put("__referrer", safeStr(request.getHeader("Referer")));
        requestParams.put("__user_agent", safeStr(userAgent));
        requestParams.put("__client_ip", safeStr(Ip_Client));
        requestParams.put("__request_path", safeStr(normalizedPath));
        requestParams.put("__request_host", safeStr(hostHeader));

        // Log Googlebot visits for admin reporting
        if (googleBotVisitService != null) {
            try {
                googleBotVisitService.recordVisit(hostHeader, normalizedPath, userAgent, Ip_Client);
            } catch (Exception logEx) {
                logger.debug("Skip googlebot visit log: {}", logEx.getMessage());
            }
        }
        
        // 🔴 FIXED: Rate limiting check with Google Crawler exemption (early return)
        // 🟢 FIXED: Pass URI to skip rate limiting for static files
        if (!checkSsrRateLimit(Ip_Client, userAgent, linkP)) {
            logger.warn("⚠️ Rate limit exceeded for IP: {} (limit: {} requests/minute)", Ip_Client, SSR_MAX_REQUESTS_PER_MINUTE);
            response.set("code", 429);
            // 🟡 FIXED: Add Retry-After header to inform crawlers to retry after 60 seconds
            response.set("Retry-After", "60");
            response.setHtmlBody("<html><body><h2>Server quá tải - Vui lòng thử lại sau.</h2></body></html>");
            return buildResponseEntity(response, null);
        }

            // --- SSR DATA ENDPOINTS: categories, tags, reviews, kqxs, vpts ---
            // Đặt ở đầu để trả về JSON nhanh, không qua các nhánh khác
            if (linkP.equals("/ssr/categories")) {
                String domain = hostHeader.replace("www.", "").trim();
                List<Map<String, Object>> ssrCategories = new ArrayList<>();
                try {
                    SearchFilter catFilter = new SearchFilter();
                    catFilter.setOperator("AND");
                    String domainLike = domain; // WildcardQuery tự thêm * hai đầu
                    // Lấy cả items có is_service = true (dịch vụ) và is_service = false (menu tĩnh/động)
                    // Xóa filter "is_service = true" để lấy tất cả menu items
                    catFilter.setConditions(List.of(
                        RecordManager.createCondition("status", "eq", "active"),
                        // domain có thể là CSV, dùng like "%domain%"
                        RecordManager.createCondition("domain", "like", domainLike)
                    ));
                    Map<String, Object> catResult = recordManager.filter("web", "web_services", catFilter);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> catRows = (List<Map<String, Object>>) catResult.getOrDefault("rows", new ArrayList<>());
                    ssrCategories.addAll(catRows);
                } catch (Exception ex) {
                    logger.warn("Không lấy được SSR website categories: {}", ex.getMessage());
                }
                Map<String, Object> payload = new HashMap<>();
                payload.put("success", true);
                payload.put("data", ssrCategories);
                payload.put("rows", ssrCategories);
                payload.put("total", ssrCategories.size());
                payload.put("totalCount", ssrCategories.size());
                return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(objectMapper.writeValueAsBytes(payload));
            }
            if (linkP.equals("/ssr/tags")) {
                String domain = hostHeader.replace("www.", "").trim();
                Map<String, List<String>> tagsMap = new HashMap<>();
                String serviceIdsParam = queryParams.getOrDefault("service_ids", "");
                List<String> serviceIds = Arrays.asList(serviceIdsParam.split(","));
                for (String serviceId : serviceIds) {
                    if (serviceId == null || serviceId.isEmpty()) continue;
                    try {
                        SearchFilter tagFilter = new SearchFilter();
                        tagFilter.setOperator("AND");
                        tagFilter.setConditions(List.of(
                            RecordManager.createCondition("service_id", "eq", serviceId),
                            RecordManager.createCondition("domain", "like", domain)
                        ));
                        Map<String, Object> tagResult = recordManager.filter("web", "web_service_tags", tagFilter);
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> tagRows = (List<Map<String, Object>>) tagResult.getOrDefault("rows", new ArrayList<>());
                        List<String> tags = new ArrayList<>();
                        for (Map<String, Object> row : tagRows) {
                            String tag = safeStr(row.get("tag"));
                            if (!tag.isEmpty()) tags.add(tag);
                        }
                        tagsMap.put(serviceId, tags);
                    } catch (Exception ex) {
                        logger.warn("Không lấy được tags cho serviceId {}: {}", serviceId, ex.getMessage());
                    }
                }
                Map<String, Object> payload = new HashMap<>();
                payload.put("success", true);
                payload.put("data", tagsMap);
                return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(objectMapper.writeValueAsBytes(payload));
            }
            if (linkP.equals("/ssr/reviews")) {
                String domain = hostHeader.replace("www.", "").trim();
                Map<String, List<Map<String, Object>>> reviewsMap = new HashMap<>();
                String serviceIdsParam = queryParams.getOrDefault("service_ids", "");
                List<String> serviceIds = Arrays.asList(serviceIdsParam.split(","));
                for (String serviceId : serviceIds) {
                    if (serviceId == null || serviceId.isEmpty()) continue;
                    try {
                        SearchFilter reviewFilter = new SearchFilter();
                        reviewFilter.setOperator("AND");
                        reviewFilter.setConditions(List.of(
                            RecordManager.createCondition("service_id", "eq", serviceId),
                            RecordManager.createCondition("status", "eq", "approved"),
                            RecordManager.createCondition("domain", "like", domain)
                        ));
                        Map<String, Object> reviewResult = recordManager.filter("web", "web_service_reviews", reviewFilter);
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> reviewRows = (List<Map<String, Object>>) reviewResult.getOrDefault("rows", new ArrayList<>());
                        reviewsMap.put(serviceId, reviewRows);
                    } catch (Exception ex) {
                        logger.warn("Không lấy được reviews cho serviceId {}: {}", serviceId, ex.getMessage());
                    }
                }
                Map<String, Object> payload = new HashMap<>();
                payload.put("success", true);
                payload.put("data", reviewsMap);
                return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(objectMapper.writeValueAsBytes(payload));
            }
            if (linkP.startsWith("/kqxs/")) {
                if (linkP.equals("/kqxs/station")) {
                    return kqxsStation(request, queryParams.get("obj_name"), queryParams.get("date"));
                }
                if (linkP.equals("/kqxs/stations")) {
                    return kqxsStations(request, queryParams.get("mien"), queryParams.get("thu"));
                }
                if (linkP.equals("/kqxs/table-range")) {
                    return kqxsTableRange(request, queryParams.get("obj_name"), queryParams.get("from"), queryParams.get("to"));
                }
                if (linkP.equals("/kqxs/tonghop")) {
                    return kqxsTongHop(request, queryParams.get("ma_duoi"), queryParams.get("tu_ngay"), queryParams.get("den_ngay"),
                        queryParams.get("l2c"), queryParams.get("tky"), queryParams.get("ktn"), queryParams.get("ktd"), queryParams.get("tnd"),
                        queryParams.get("nhom_so"), queryParams.get("nhom_so_triet"), queryParams.get("so_nhap"), queryParams.get("triet_tieu"),
                        queryParams.get("triet_duoi"), queryParams.get("show_nhom"), queryParams.get("show_tk"), queryParams.get("loai_tim"), queryParams.get("ket_qua_filter"));
                }
            }
            if (linkP.equals("/vpts")) {
                return vpts(request, queryParams.get("obj_name"));
            }
            // --- END SSR DATA ENDPOINTS ---
            // Xử lý động cho robots.txt và sitemap.xml
            if (linkP.equals("/robots.txt")) {
                try {
                    String robotsTxt = generateDynamicRobotsTxt(hostHeader, protocol);
                    logger.info("✅ Phục vụ robots.txt động cho domain: {}", hostHeader);
                    return ResponseEntity.ok()
                            .contentType(MediaType.TEXT_PLAIN)
                            .body(robotsTxt.getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) {
                    logger.error("❌ Lỗi tạo robots.txt động: {}", e.getMessage(), e);
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body("Lỗi tạo robots.txt".getBytes(StandardCharsets.UTF_8));
                }
            } else if (linkP.equals("/sitemap.xml")) {
                try {
                    // Sử dụng SitemapService để lấy sitemap (từ cache hoặc rebuild)
                    String sitemapXml = sitemapService.getSitemap(hostHeader, protocol,
                        (domainHost, proto, visitedPaths, lastmodMap) -> generateSitemapXml(domainHost, proto, visitedPaths, lastmodMap));
                    logger.info("✅ Phục vụ sitemap.xml động cho domain: {}", hostHeader);
                    return ResponseEntity.ok()
                            .contentType(MediaType.APPLICATION_XML)
                            .body(sitemapXml.getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) {
                    logger.error("❌ Lỗi tạo sitemap.xml động: {}", e.getMessage(), e);
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body("Lỗi tạo sitemap.xml".getBytes(StandardCharsets.UTF_8));
                }
            } else if (linkP.equals("/feed.xml")) {
                try {
                    // 1. Tạo RSS Feed
                    String rssFeed = generateRssFeed(hostHeader, protocol);
                    String feedUrl = protocol + "://" + hostHeader + "/feed.xml";
                    triggerGoogleFeedPing(feedUrl, hostHeader);
                    
                    // 2. Cấu hình Cache: Cho phép cache trong 10 phút (600 giây)
                    // Điều này giúp bảo vệ CPU nếu Googlebot hoặc các công cụ quét khác truy cập quá nhiều cùng lúc
                    CacheControl cacheControl = CacheControl.maxAge(600, TimeUnit.SECONDS).cachePublic();

                    logger.info("✅ Phục vụ feed.xml (RSS) động cho domain: {}", hostHeader);

                    return ResponseEntity.ok()
                            // Chỉ định rõ utf-8 để tránh lỗi font tiếng Việt
                            .contentType(MediaType.parseMediaType("application/rss+xml;charset=utf-8"))
                            .cacheControl(cacheControl)
                            .body(rssFeed.getBytes(StandardCharsets.UTF_8));

                } catch (Exception e) {
                    logger.error("❌ Lỗi tạo feed.xml động: {}", e.getMessage(), e);
                    // Trả về XML trống hoặc lỗi đúng cấu trúc XML để tránh làm Bot bối rối
                    String errorXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss><channel><title>Error</title></channel></rss>";
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .contentType(MediaType.APPLICATION_XML)
                            .body(errorXml.getBytes(StandardCharsets.UTF_8));
                }
            }

            boolean isDynamicPath = normalizedPath.isEmpty() || "/".equals(normalizedPath);
            logger.debug("Đường dẫn {} và tham số 1 {} tham số 2 {} kiểm tra xem có phải đường dẫn động hay không {}",
                    normalizedPath, requestParams, queryParams, isDynamicPath); // Log requestParams for debugging
            if (!isDynamicPath) {
                // 🔧 Optimize legacy static images that were uploaded before /images.shtml existed
                if (normalizedPath.startsWith("/app_images/")) {
                    ResponseEntity<byte[]> optimized = serveOptimizedLegacyImage(normalizedPath, queryParams, request);
                    if (optimized != null) {
                        return optimized;
                    }
                }

                File file = recordManager.getStaticFile(normalizedPath);
                if (file != null && file.exists() && file.isFile()) {
                    try {
                        Path filePath = file.toPath();
                        byte[] content = Files.readAllBytes(filePath);
                        String contentType = Files.probeContentType(filePath);
                        String lowerCasePath = normalizedPath.toLowerCase();

                        // ✅ Determine MIME type with fallback (prioritize extension over probeContentType)
                        if (lowerCasePath.endsWith(".js")) {
                            contentType = "application/javascript";
                        } else if (lowerCasePath.endsWith(".css")) {
                            contentType = "text/css";
                        } else if (lowerCasePath.endsWith(".json")) {
                            contentType = MediaType.APPLICATION_JSON_VALUE;
                        } else if (lowerCasePath.endsWith(".html") || lowerCasePath.endsWith(".htm")) {
                            contentType = MediaType.TEXT_HTML_VALUE;
                        } else if (lowerCasePath.endsWith(".png")) {
                            contentType = "image/png";
                        } else if (lowerCasePath.endsWith(".jpg") || lowerCasePath.endsWith(".jpeg")) {
                            contentType = "image/jpeg";
                        } else if (lowerCasePath.endsWith(".gif")) {
                            contentType = "image/gif";
                        } else if (lowerCasePath.endsWith(".svg")) {
                            contentType = "image/svg+xml";
                        } else if (lowerCasePath.endsWith(".woff")) {
                            contentType = "font/woff";
                        } else if (lowerCasePath.endsWith(".woff2")) {
                            contentType = "font/woff2";
                        } else if (lowerCasePath.endsWith(".ttf")) {
                            contentType = "font/ttf";
                        } else if (lowerCasePath.endsWith(".eot")) {
                            contentType = "application/vnd.ms-fontobject";
                        } else if (contentType == null) {
                            // Only fallback to octet-stream if we can't determine type
                            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
                        }

                        logger.debug("✅ Phục vụ file tĩnh: {} với Content-Type: {}", normalizedPath, contentType);
                        return ResponseEntity.ok()
                                .contentType(MediaType.parseMediaType(contentType))
                                .body(content);
                    } catch (IOException e) {
                        logger.error("Lỗi đọc file tĩnh: {}. Chi tiết: {}", normalizedPath, e.getMessage());
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Lỗi máy chủ khi đọc tài nguyên.".getBytes(StandardCharsets.UTF_8));
                    }
                }
            }

            logger.info("Đang xem đường dẫn {} với tham số trang là{}", linkP, queryParams); // Log queryParams here as
            // original
            // --- START /images.shtml logic ---
            if (linkP.equals("/images.shtml")) {
                String appId = queryParams.get("app_id");
                String imageName = queryParams.get("name");
                String widthParam = queryParams.getOrDefault("w", queryParams.getOrDefault("width", null));
                String qualityParam = queryParams.getOrDefault("q", queryParams.getOrDefault("quality", null));

                if (appId == null || appId.isEmpty()) {
                    appId = "csm";
                }

                // Đường dẫn tuyệt đối đến file ảnh trên server, sử dụng appDataDir
                Path imageFilePath = Paths.get(appDataDir, "public", "app_images", appId, imageName); // Sử dụng Path
                File imageFile = imageFilePath.toFile(); // Chuyển đổi thành File

                if (imageName != null && !imageName.isEmpty() && appId != null && !appId.isEmpty() && imageFile.exists()
                        && imageFile.isFile()) {
                    try {
                        String contentType = Files.probeContentType(imageFilePath); // Xác định Content-Type
                        String lowerCaseName = imageName.toLowerCase();
                        if (contentType == null) {
                            // Fallback cho các loại file phổ biến nếu probeContentType không tìm thấy
                            if (lowerCaseName.endsWith(".png")) {
                                contentType = "image/png";
                            } else if (lowerCaseName.endsWith(".jpg") || lowerCaseName.endsWith(".jpeg")) {
                                contentType = "image/jpeg";
                            } else if (lowerCaseName.endsWith(".gif")) {
                                contentType = "image/gif";
                            } else if (lowerCaseName.endsWith(".svg")) {
                                contentType = "image/svg+xml";
                            } else {
                                contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE; // Mặc định nếu không xác định được
                            }
                        }

                        // Parse optional resize/quality params (safe bounds)
                        int targetWidth = 0;
                        if (widthParam != null) {
                            try {
                                targetWidth = Math.max(0, Math.min(2000, Integer.parseInt(widthParam)));
                            } catch (NumberFormatException ignored) {
                                targetWidth = 0;
                            }
                        }
                        double quality = 0.8; // default 80%
                        if (qualityParam != null) {
                            try {
                                int q = Integer.parseInt(qualityParam);
                                if (q >= 30 && q <= 95) {
                                    quality = q / 100.0;
                                }
                            } catch (NumberFormatException ignored) {
                                quality = 0.8;
                            }
                        }

                        byte[] content;
                        boolean transformed = false;

                        // Only attempt optimization for raster images (skip SVG)
                        if (!"image/svg+xml".equalsIgnoreCase(contentType)) {
                            // Determine if a transform is requested (resize or explicit quality)
                            boolean transformRequested = (targetWidth > 0) || (qualityParam != null);

                            if (!transformRequested) {
                                // No transform requested -> stream original bytes directly
                                content = Files.readAllBytes(imageFilePath);
                            } else {
                                // Cached output path based on params
                                String safeName = imageName.replaceAll("[\\\\/]+", "_");
                                int qInt = (int) Math.round(quality * 100);
                                String outExt;
                                if (contentType.toLowerCase().contains("png")) outExt = "png";
                                else if (contentType.toLowerCase().contains("gif")) outExt = "gif";
                                else { outExt = "jpg"; contentType = "image/jpeg"; }

                                Path cacheDir = Paths.get(appDataDir, "public", "app_images_cache", appId);
                                Files.createDirectories(cacheDir);
                                String cacheFileName = (targetWidth > 0 ? ("w" + targetWidth) : "orig") + "_q" + qInt + "_" + safeName + "." + outExt;
                                Path cachePath = cacheDir.resolve(cacheFileName);

                                // If cache exists and is fresh with respect to the source, serve it
                                if (Files.exists(cachePath) && Files.getLastModifiedTime(cachePath).toMillis() >= imageFile.lastModified()) {
                                    content = Files.readAllBytes(cachePath);
                                    transformed = true;
                                } else {
                                    BufferedImage sourceImage = ImageIO.read(imageFile);
                                    if (sourceImage != null) {
                                        int originalWidth = sourceImage.getWidth();
                                        int originalHeight = sourceImage.getHeight();
                                        int newWidth = targetWidth > 0 ? Math.min(targetWidth, originalWidth) : originalWidth;
                                        int newHeight = (int) Math.round((double) originalHeight * newWidth / Math.max(1, originalWidth));

                                        boolean shouldResize = newWidth > 0 && newWidth < originalWidth;

                                        // Perform transform only when resize requested or quality specified
                                        if (shouldResize || qualityParam != null) {
                                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                            Thumbnails.Builder<BufferedImage> builder = Thumbnails.of(sourceImage)
                                                    .size(newWidth, newHeight)
                                                    .outputQuality(quality);

                                            if ("png".equals(outExt)) builder.outputFormat("png");
                                            else if ("gif".equals(outExt)) builder.outputFormat("gif");
                                            else builder.outputFormat("jpg");

                                            builder.toOutputStream(baos);
                                            content = baos.toByteArray();
                                            transformed = true;

                                            // Write/update cache atomically
                                            Files.write(cachePath, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                                        } else {
                                            content = Files.readAllBytes(imageFilePath);
                                        }
                                    } else {
                                        content = Files.readAllBytes(imageFilePath);
                                    }
                                }
                            }
                        } else {
                            // SVG hoặc định dạng khác: trả về nguyên gốc
                            content = Files.readAllBytes(imageFilePath);
                        }

                        // Strong cache headers + ETag includes transform params
                        long lastModified = imageFile.lastModified();
                        int qIntForTag = (int) Math.round(quality * 100);
                        int wForTag = Math.max(0, targetWidth);
                        String eTag = "\"" + Long.toHexString(lastModified) + "-" + content.length + "-w" + wForTag + "-q" + qIntForTag + "\"";

                        // Conditional GET: If-None-Match -> 304 Not Modified
                        String ifNoneMatch = request.getHeader("If-None-Match");
                        if (ifNoneMatch != null && ifNoneMatch.equals(eTag)) {
                            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                                    .header(HttpHeaders.ETAG, eTag)
                                    .header(HttpHeaders.LAST_MODIFIED, String.valueOf(lastModified))
                                    .header("Vary", "Accept-Encoding")
                                    .header("X-Content-Type-Options", "nosniff")
                                    .build();
                        }

                        logger.info("✅ Phục vụ hình ảnh {} (optimized: {}, size: {}KB) Content-Type: {}", 
                                imageFilePath, transformed, content.length / 1024, contentType);
                        
                        return ResponseEntity.ok()
                                // 1 year cache for immutable assets (browser & CDN)
                                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                                // ETag for 304 Not Modified validation
                                .header(HttpHeaders.ETAG, eTag)
                                // Last-Modified for HTTP conditional requests
                                .header(HttpHeaders.LAST_MODIFIED, String.valueOf(lastModified))
                                // Allow compression (gzip/brotli)
                                .header("Vary", "Accept-Encoding")
                                // Security: prevent MIME type sniffing
                                .header("X-Content-Type-Options", "nosniff")
                                // Enable browser cache validation
                                .header("Age", "0")
                                .contentType(MediaType.parseMediaType(contentType))
                                .contentLength(content.length)
                                .lastModified(lastModified)
                                .eTag(eTag)
                                .body(content); // Trả về nội dung file (đã optimize)
                    } catch (IOException e) {
                        logger.error("❌ Lỗi khi đọc file hình ảnh {}: {}", imageFilePath, e.getMessage(), e);
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Lỗi máy chủ khi đọc hình ảnh.".getBytes(StandardCharsets.UTF_8));
                    }
                } else {
                    logger.warn("❌ Không tìm thấy hình ảnh cục bộ: {}", imageFilePath);
                    return ResponseEntity.status(HttpStatus.NOT_FOUND)
                            .body(("Không tìm thấy hình ảnh: " + (imageName != null ? imageName : ""))
                                    .getBytes(StandardCharsets.UTF_8));
                }
            } // --- END /images.shtml logic ---
            // --- START /upload.shtml logic ---
            else if (linkP.equals("/upload.shtml")) {
                // *** THAY ĐỔI TẠI ĐÂY: Lấy tham số từ requestParams ***
                String appId = (String) requestParams.get("app_id");
                String cmd = (String) requestParams.get("cmd");
                String name = (String) requestParams.get("name");
                String src = (String) requestParams.get("src"); // Base64 content
                String link = (String) requestParams.get("link"); // URL to download

                if (appId == null || appId.isEmpty()) {
                    appId = "csm";
                }

                // TẠO BIẾN FINAL MỚI SAU KHI appId ĐÃ ĐƯỢC XÁC ĐỊNH CUỐI CÙNG
                final String finalAppId = appId; // FIX: Sử dụng biến final hoặc effectively final

                Path uploadRootPath = Paths.get(appDataDir, "public", "app_images", finalAppId); // Sử dụng finalAppId
                Files.createDirectories(uploadRootPath); // Tạo thư mục nếu chưa có

                // 1. Liệt kê file
                if ("list".equalsIgnoreCase(cmd)) {
                    try {
                        List<Map<String, Object>> listIMGS = new ArrayList<>();
                        Files.walk(uploadRootPath, 1)
                                .filter(Files::isRegularFile)
                                .forEach(filePath -> {
                                    Map<String, Object> fileInfo = new HashMap<>();
                                    fileInfo.put("name", filePath.getFileName().toString());
                                    // Sử dụng finalAppId trong lambda
                                    String fileUrl = String.format("app_images/%s/%s", finalAppId,
                                            filePath.getFileName().toString());
                                    fileInfo.put("src", fileUrl);
                                    try {
                                        fileInfo.put("size", Files.size(filePath));
                                    } catch (IOException e) {
                                        logger.warn("Không thể lấy kích thước file {}: {}", filePath, e.getMessage());
                                        fileInfo.put("size", 0);
                                    }
                                    fileInfo.put("load", true);
                                    listIMGS.add(fileInfo);
                                });

                        return ResponseEntity.ok()
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, OPTIONS")
                                .header("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization")
                                .cacheControl(org.springframework.http.CacheControl
                                        .maxAge(2592000, java.util.concurrent.TimeUnit.SECONDS).cachePublic())
                                .body(objectMapper.writeValueAsBytes(listIMGS));
                    } catch (IOException e) {
                        logger.error("❌ Lỗi khi liệt kê file từ thư mục cục bộ: {}", e.getMessage(), e);
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Lỗi khi liệt kê file".getBytes(StandardCharsets.UTF_8));
                    }
                } // 2. Xóa ảnh
                else if ("removeimg".equalsIgnoreCase(cmd) && name != null && !name.isEmpty()) {
                    Path filePath = uploadRootPath.resolve(name);
                    try {
                        if (Files.exists(filePath) && Files.isRegularFile(filePath)) {
                            Files.delete(filePath);
                            logger.info("✅ Đã xóa file cục bộ: {}", filePath);
                            return ResponseEntity.ok()
                                    .contentType(MediaType.TEXT_PLAIN)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, OPTIONS")
                                    .header("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization")
                                    .body("Deleted".getBytes(StandardCharsets.UTF_8));
                        } else {
                            logger.warn("❌ File không tồn tại hoặc không phải là file hợp lệ để xóa: {}", filePath);
                            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                                    .body("Không tìm thấy file để xóa".getBytes(StandardCharsets.UTF_8));
                        }
                    } catch (IOException e) {
                        logger.error("❌ Lỗi khi xóa file cục bộ ({}): {}", filePath, e.getMessage(), e);
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Lỗi khi xóa file".getBytes(StandardCharsets.UTF_8));
                    }
                } // 3. Upload từ base64
                else if (src != null && !src.isEmpty()) {
                    if (name == null || name.isEmpty()) {
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body("Tên file là bắt buộc khi upload base64.".getBytes(StandardCharsets.UTF_8));
                    }
                    if (!src.contains(",")) {
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body("Dữ liệu base64 không hợp lệ".getBytes(StandardCharsets.UTF_8));
                    }
                    String base64Image = src.split(",", 2)[1];
                    if (base64Image.isEmpty()) {
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body("Dữ liệu base64 rỗng".getBytes(StandardCharsets.UTF_8));
                    }
                    try {
                        // Tách tên file và đuôi file
                        int lastDotIndex = name.lastIndexOf('.');
                        String fileNameWithoutExtension;
                        String fileExtension = "";

                        if (lastDotIndex > 0) {
                            fileNameWithoutExtension = name.substring(0, lastDotIndex);
                            fileExtension = name.substring(lastDotIndex); // Bao gồm cả dấu chấm
                        } else {
                            fileNameWithoutExtension = name;
                        }

                        // Sanitize (xóa dấu) chỉ phần tên file
                        String sanitizedName = xoa_dau(fileNameWithoutExtension);

                        // Ghép lại tên file đã xử lý với đuôi file gốc
                        String finalFileName = sanitizedName + fileExtension;

                        byte[] buffer = Base64.getDecoder().decode(base64Image);
                        // Sử dụng finalFileName thay cho sanitizedName
                        Path targetFilePath = uploadRootPath.resolve(finalFileName);
                        Files.write(targetFilePath, buffer);

                        // Precompute optimized variants chỉ cho ảnh (skip video)
                        String ext = getExtension(finalFileName.toLowerCase(Locale.ROOT));
                        if (UPLOAD_IMAGE_EXTENSIONS.contains(ext)) {
                            precomputeImageVariants(finalAppId, finalFileName, targetFilePath);
                        }

                        // Sử dụng finalFileName
                        String fileUrl = String.format("app_images/%s/%s", finalAppId, finalFileName);
                        logger.info("✅ Đã upload file base64 cục bộ: {}", targetFilePath);
                        return ResponseEntity.ok()
                                .contentType(MediaType.TEXT_PLAIN)
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, OPTIONS")
                                .header("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization")
                                .body(fileUrl.getBytes(StandardCharsets.UTF_8));
                    } catch (IllegalArgumentException e) {
                        logger.error("❌ Dữ liệu Base64 không hợp lệ: {}", e.getMessage());
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body("Dữ liệu Base64 không hợp lệ".getBytes(StandardCharsets.UTF_8));
                    } catch (IOException e) {
                        logger.error("❌ Lỗi khi ghi file base64 cục bộ: {}", e.getMessage(), e);
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Lỗi khi upload file".getBytes(StandardCharsets.UTF_8));
                    }
                } // 4. Upload từ link
                else if (link != null && !link.isEmpty()) {
                    if (name == null || name.isEmpty()) {
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body("Tên file là bắt buộc khi upload từ link.".getBytes(StandardCharsets.UTF_8));
                    }
                    try {
                        byte[] buffer = new java.net.URL(link).openStream().readAllBytes();
                        // Sanitize the filename using xoa_dau
                        String sanitizedName = xoa_dau(name);
                        Path targetFilePath = uploadRootPath.resolve(sanitizedName);
                        Files.write(targetFilePath, buffer);

                        // Precompute optimized variants chỉ cho ảnh (skip video)
                        String ext = getExtension(sanitizedName.toLowerCase(Locale.ROOT));
                        if (UPLOAD_IMAGE_EXTENSIONS.contains(ext)) {
                            precomputeImageVariants(finalAppId, sanitizedName, targetFilePath);
                        }

                        // Sử dụng finalAppId
                        String fileUrl = String.format("app_images/%s/%s", finalAppId, name);
                        logger.info("✅ Đã upload file từ link cục bộ: {}", targetFilePath);
                        return ResponseEntity.ok()
                                .contentType(MediaType.TEXT_PLAIN)
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, OPTIONS")
                                .header("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization")
                                .body(fileUrl.getBytes(StandardCharsets.UTF_8));
                    } catch (IOException e) {
                        logger.error("❌ Lỗi khi đọc dữ liệu từ URL hoặc ghi file cục bộ: {}", e.getMessage(), e);
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Lỗi khi upload từ link".getBytes(StandardCharsets.UTF_8));
                    }
                } else {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND)
                            .body("Không tìm thấy lệnh upload hợp lệ.".getBytes(StandardCharsets.UTF_8));
                }
            } // --- END /upload.shtml logic ---
            else if (linkP.equals("/page_struct_js.shtml")) {
                String name = queryParams.get("name");
                String apt = queryParams.get("apt");
                String apd = queryParams.get("apd");
                // logger.info("Đang xem đường dẫn Trong {} với tham số trang
                // là{}",linkP,queryParams);
                Map<String, String> extraHeaders = new HashMap<>();
                extraHeaders.put("Content-Type", "text/javascript");

                if (name == null || apt == null || apd == null) {
                    response.setBinaryBody(createEmptyDeflatedJs(), "text/javascript");
                    extraHeaders.put("Content-Encoding", "deflate");
                    return buildResponseEntity(response, extraHeaders);
                }

                boolean databaseApp = !"false".equals(apd);
                byte[] deflatedContent = null;
                // logger.info("Xem tham so {} appid {}", requestParams,databaseApp);
                if (databaseApp) {
                    SearchFilter appStructFilter = RecordManager.createCondition("id", "eq", apt);
                    Map<String, Object> appStructResult = recordManager.filter(apd, "index", appStructFilter);
                    List<Map<String, Object>> appStructRows = (List<Map<String, Object>>) appStructResult
                            .getOrDefault("rows", new ArrayList<>());
                    // logger.info("Thông tin dữ liệu 1 là {}",appStructRows.size());
                    if (!appStructRows.isEmpty()) {
                        Map<String, Object> appStruct = appStructRows.get(0);
                        String structBase64 = (String) appStruct.get("struct");
                        if (structBase64 != null) {
                            deflatedContent = Base64.getDecoder().decode(structBase64);
                        }
                    }
                } else {
                    SearchFilter appStructFilter = RecordManager.createCondition("id", "eq", apt);
                    Map<String, Object> appStructResult = recordManager.filter(name, "index", appStructFilter);
                    List<Map<String, Object>> appStructRows = (List<Map<String, Object>>) appStructResult
                            .getOrDefault("rows", new ArrayList<>());
                    // logger.info("Thông tin dữ liệu 2 là {}",appStructRows.size());
                    if (!appStructRows.isEmpty()) {
                        Map<String, Object> appStruct = appStructRows.get(0);
                        String structBase64 = (String) appStruct.get("struct");
                        if (structBase64 != null) {
                            deflatedContent = Base64.getDecoder().decode(structBase64);
                        }
                    } else {
                        SearchFilter pageJSFilter = new SearchFilter();
                        pageJSFilter.setOperator("AND");
                        pageJSFilter.setConditions(List.of(
                                RecordManager.createCondition("p_name", "eq", name),
                                RecordManager.createCondition("p_type", "eq", 0)));
                        // logger.info("Thông tin tìm {} với tên file {}",pageJSFilter,name);
                        Map<String, Object> pageJSResult = recordManager.filter("csm", "sys_autos", pageJSFilter);
                        List<Map<String, Object>> pageJSRows = (List<Map<String, Object>>) pageJSResult
                                .getOrDefault("rows", new ArrayList<>());

                        if (!pageJSRows.isEmpty()) {
                            Map<String, Object> pageJS = pageJSRows.get(0);
                            String pCode = (String) pageJS.get("p_code");
                            if (pCode != null) {
                                String strJS = recordManager.csm_decrypt(pCode);
                                // logger.info("Thông tin code {}",strJS);
                                deflatedContent = strJS.getBytes(StandardCharsets.UTF_8);
                            }
                        }
                    }
                }

                if (deflatedContent != null) {
                    response.setBinaryBody(deflatedContent, "text/javascript");
                    return buildResponseEntity(response, extraHeaders);
                } else {
                    response.setBinaryBody(createEmptyDeflatedJs(), "text/javascript");
                    return buildResponseEntity(response, extraHeaders);
                }
            }

            // 1. Prepare domain and fCase (Already correct)
            String domain = hostHeader.replace("www.", "").trim();
            // String domain = "phanmemmottrieu.net".trim();
            String fCase = normalizedPath.replace(".shtml", "").trim();
            // Homepage có normalizedPath = "/" -> fCase = "/"
            // Để match với route có f_case = "" hoặc "/", chuẩn hóa:
            if ("/".equals(fCase)) {
                fCase = "";
            }

            // Biến để lưu trữ tuyến đường được chọn cuối cùng
            Map<String, Object> selectedRoute = null;
            // --- ƯU TIÊN 1: Tìm router khớp chính xác domain + f_case ---
            SearchFilter exactMatchFilter = new SearchFilter();
            exactMatchFilter.setOperator("AND");
            exactMatchFilter.setConditions(List.of(
                RecordManager.createCondition("domain_name", "eq", domain),
                RecordManager.createCondition("f_case", "eq", fCase),
                RecordManager.createCondition("run", "eq", 1)));
            Map<String, Object> exactRouteResult = recordManager.filter("csm", "sys_la_routers", exactMatchFilter);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> exactMatchedRoutes = (List<Map<String, Object>>) exactRouteResult.getOrDefault("rows", new ArrayList<>());
            if (!exactMatchedRoutes.isEmpty()) {
                selectedRoute = exactMatchedRoutes.get(0);
                logger.info("Đã chọn tuyến đường khớp chính xác f_case: {}", selectedRoute);
            } else {
                // --- ƯU TIÊN 2: Nếu không có khớp chính xác, lấy SSR React (với f_case = "") ---
                SearchFilter domainFallbackRFilter = new SearchFilter();
                domainFallbackRFilter.setOperator("AND");
                domainFallbackRFilter.setConditions(List.of(
                    RecordManager.createCondition("domain_name", "eq", domain),
                    RecordManager.createCondition("f_case", "eq", ""),  // ✅ Router fallback có f_case rỗng
                    RecordManager.createCondition("app_type", "eq", "web"),
                    RecordManager.createCondition("rp_index", "isnotnull", null),
                    RecordManager.createCondition("rp_index", "noteq", ""),
                    RecordManager.createCondition("run", "eq", 1)));
                logger.info("Tìm kiếm tuyến đường SSR React cho domain: {}, fCase fallback='': {}", domain, domain);
                Map<String, Object> rRouteResult = recordManager.filter("csm", "sys_la_routers", domainFallbackRFilter);
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rMatchedRoutes = (List<Map<String, Object>>) rRouteResult.getOrDefault("rows", new ArrayList<>());
                if (!rMatchedRoutes.isEmpty()) {
                    selectedRoute = rMatchedRoutes.get(0);
                    logger.info("Đã chọn tuyến đường SSR React: {}", selectedRoute);
                } else {
                    // --- ƯU TIÊN 3: Nếu không có SSR React, lấy các bộ lọc còn lại ---
                    SearchFilter domainFallbackFilter = new SearchFilter();
                    domainFallbackFilter.setOperator("AND");
                    domainFallbackFilter.setConditions(List.of(
                        RecordManager.createCondition("domain_name", "eq", domain),
                        RecordManager.createCondition("app_type", "eq", "web"),
                        RecordManager.createCondition("run", "eq", 1)));
                    SearchFilter globalDefaultFilter = new SearchFilter();
                    globalDefaultFilter.setOperator("AND");
                    globalDefaultFilter.setConditions(List.of(
                        RecordManager.createCondition("domain_name", "eq", ""),
                        RecordManager.createCondition("f_case", "eq", "default"),
                        RecordManager.createCondition("run", "eq", 1)));
                    SearchFilter remainingRouterFilter = new SearchFilter();
                    remainingRouterFilter.setOperator("OR");
                    remainingRouterFilter.setConditions(List.of(domainFallbackFilter, globalDefaultFilter));
                    Map<String, Object> routeResult = recordManager.filter("csm", "sys_la_routers", remainingRouterFilter);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> matchedRoutes = (List<Map<String, Object>>) routeResult.getOrDefault("rows", new ArrayList<>());
                    if (!matchedRoutes.isEmpty()) {
                        selectedRoute = matchedRoutes.get(0);
                        logger.info("Đã chọn tuyến đường fallback: {}", selectedRoute);
                    }
                }
            }

            // --- TIẾN HÀNH XỬ LÝ VỚI selectedRoute (phần này giữ nguyên) ---
            if (selectedRoute != null) {
                logger.debug("🔍 Processing selectedRoute: {}", selectedRoute);
                // Khai báo biến templateData dùng chung cho mọi nhánh
                Map<String, Object> templateData = new HashMap<>();
                String f_do = (String) selectedRoute.get("f_do");
                Integer p_type = (Integer) selectedRoute.getOrDefault("p_type", 1);
                String appType = (String) selectedRoute.getOrDefault("app_type", "web");
                String rp_index = "";
                String app_id = "";
                String tbl_services = "";
                String tbl_service_detail = "";

                Object rpIndexObject = selectedRoute.get("rp_index");

                if (rpIndexObject instanceof String) {
                    rp_index = (String) rpIndexObject;
                }

                Object appIdObject = selectedRoute.get("app_id");
                if (appIdObject instanceof String) {
                    app_id = (String) appIdObject;
                }

                Object rpServicesObject = selectedRoute.get("tbl_services");

                if (rpServicesObject instanceof String) {
                    tbl_services = (String) rpServicesObject;
                }
                Object rpServiceDetailObject = selectedRoute.get("tbl_service_detail");
                if (rpServiceDetailObject instanceof String) {
                    tbl_service_detail = (String) rpServiceDetailObject;
                }
                logger.info("✅ Selected Route Details: f_do={}, p_type={}, appType={}, rp_index={}, app_id={}, tbl_services={}, tbl_service_detail={}, path={}",
                    f_do, p_type, appType, rp_index, app_id, tbl_services, tbl_service_detail, normalizedPath);
                
                // ===== BỔ SUNG LOGIC CHO SSR VỚI REACT TẠI ĐÂY =====
                // SSR is enabled if appType="web" AND we have sufficient data for querying
                // rp_index is optional (for React template path), but app_id + tbl_services + tbl_service_detail are critical
                boolean shouldAttemptSSR = "web".equalsIgnoreCase(appType) && !app_id.isEmpty() && !tbl_services.isEmpty()
                    && !tbl_service_detail.isEmpty();
                
                if (shouldAttemptSSR) {
                    logger.info("✅ SSR CONDITIONS MET: appType={}, app_id={}, tbl_services={}, tbl_service_detail={}, rp_index={}, path={}",
                            appType, rp_index, app_id, tbl_services, tbl_service_detail, normalizedPath);
                    
                    // 🔴 BULKHEAD: Check SSR semaphore - fallback to skeleton HTML nếu quá tải (>128 concurrent)
                    if (!ssrSemaphore.tryAcquire()) {
                        logger.warn("⚠️ SSR semaphore exhausted (128 concurrent limit) - returning skeleton HTML for path: {}", normalizedPath);
                        response.set("code", 200);
                        response.setHtmlBody("<html><head><meta charset='UTF-8'><title>Loading...</title><style>.sk{animation:pulse 1.5s infinite;background:#f0f0f0;height:20px;margin:10px;border-radius:4px}</style></head><body><div class='sk'></div><div class='sk' style='width:80%'></div><div class='sk' style='width:60%'></div><script>setTimeout(function(){location.reload()},2000)</script></body></html>");
                        return buildResponseEntity(response, null);
                    }
                    
                    try {
                    // domain = "phanmemmottrieu.net"; // FOR TESTING ONLY, FIX LATER
                    
                    // === SSR SECURITY LOGIC: Server-side render data bảo mật ===
                    // Extract service_type từ query params (ví dụ: ?service_type=tu-van&page=2&q=php)
                    String service_type = queryParams.get("service_type");
                    int ssr_page = 1;
                    int ssr_pageSize = 10;
                    String ssr_q = null;
                    Integer ssr_take = null;
                    String ssr_lastkey = null;
                    
                    try {
                        if (queryParams.containsKey("page")) {
                            ssr_page = Integer.parseInt(queryParams.get("page"));
                            if (ssr_page < 1) ssr_page = 1;
                        }
                    } catch (NumberFormatException e) {
                        logger.warn("Invalid page param: {}", e.getMessage());
                    }
                    try {
                        if (queryParams.containsKey("pageSize")) {
                            ssr_pageSize = Integer.parseInt(queryParams.get("pageSize"));
                            if (ssr_pageSize < 1) ssr_pageSize = 10;
                            if (ssr_pageSize > 50) ssr_pageSize = 50; // Giảm max từ 100 xuống 50
                        }
                    } catch (NumberFormatException e) {
                        logger.warn("Invalid pageSize param: {}", e.getMessage());
                    }

                    try {
                        if (queryParams.containsKey("take")) {
                            ssr_take = Integer.parseInt(queryParams.get("take"));
                            if (ssr_take < 1) ssr_take = 10;
                            if (ssr_take > 50) ssr_take = 50; // giới hạn tránh tải quá nhiều
                            // Đồng bộ: take dùng như pageSize cho cursor-mode
                            ssr_pageSize = ssr_take;
                            // Khi đã dùng cursor-mode thì bỏ qua phân trang page/pageSize offset
                            ssr_page = 1;
                        }
                    } catch (NumberFormatException e) {
                        logger.warn("Invalid take param: {}", e.getMessage());
                    }
                    // === PAGINATION CACHE: Build query signature ===
                    String searchQuery = "";
                    Map<String, String> filtersMap = new HashMap<>();
                    if (queryParams.containsKey("q")) {
                        searchQuery = sanitizeInput(queryParams.get("q"));
                        ssr_q = searchQuery;
                    }
                    
                    // Collect all filter parameters (skip page, take, lastkey, q, hl)
                    Set<String> skipParams = new HashSet<>(Arrays.asList("page", "take", "lastkey", "q", "hl", "service_type"));
                    for (String key : queryParams.keySet()) {
                        if (!skipParams.contains(key)) {
                            filtersMap.put(key, sanitizeInput(queryParams.get(key)));
                        }
                    }
                    
                    // Build query signature (domain:service_type:filters) - filter-based, no session ID
                    String paginationSignature = PaginationCacheManager.buildQuerySignature(
                        domain,
                        service_type != null ? service_type : "all",
                        filtersMap
                    );
                    
                    // Check cache for lastkey (Cache-aware pagination)
                    String cachedLastkey = PaginationCacheManager.getLastKeyForPage(paginationSignature, ssr_page);
                    if (cachedLastkey != null) {
                        ssr_lastkey = cachedLastkey;
                        logger.info("✅ Pagination Cache HIT: page={}, lastkey={}", ssr_page, ssr_lastkey);
                    } else {
                        logger.info("⚠️ Pagination Cache MISS: page={} (will query DB)", ssr_page);
                        // ssr_lastkey remains empty/null, DB query will start from beginning or use existing value
                    }
                    // === END PAGINATION CACHE ===
                    
                    logger.info("🔐 SSR: service_type={}, page={}, pageSize={}, take={}, lastkey={}, q={}, path={}", service_type, ssr_page, ssr_pageSize, ssr_take, ssr_lastkey, ssr_q, normalizedPath);
                    
                    // === SERVICE_TYPE VALIDATION ===
                    // Try to derive service_type from URL slug if not provided (e.g., /bat-dong-san.shtml -> bat-dong-san)
                    String slugFromPath = "";
                    try {
                        if (normalizedPath != null) {
                            String p = normalizedPath;
                            if (p.startsWith("/")) p = p.substring(1);
                            int slashIdx = p.indexOf("/");
                            if (slashIdx >= 0) p = p.substring(0, slashIdx);
                            slugFromPath = p;
                        }
                    } catch (Exception ignore) {}

                    // Define whitelist of allowed service_types (from SERVICE_CODE_TO_TABLE keys) and allow slugFromPath
                    Set<String> SERVICE_TYPE_WHITELIST = new HashSet<>(SERVICE_CODE_TO_TABLE.keySet());
                    if (!slugFromPath.isEmpty()) {
                        SERVICE_TYPE_WHITELIST.add(slugFromPath);
                    }

                    // For now, don't override service_type yet - will do this after loading categories
                    // This will be determined after ssrCategories is loaded
                    String originalSlugFromPath = slugFromPath;
                    
                    if (service_type == null || service_type.isEmpty()) {
                        logger.warn("⚠️ SSR: service_type is empty/null, using slug from path or default");
                        service_type = !slugFromPath.isEmpty() ? slugFromPath : "services";
                    }

                    if (!SERVICE_TYPE_WHITELIST.contains(service_type)) {
                        logger.warn("🚫 SSR: Invalid service_type={} not in whitelist={}", service_type, SERVICE_TYPE_WHITELIST);
                        // Security: Return 403 Forbidden for invalid service_type
                        response.set("code", 403);
                        response.setHtmlBody("<html><body><h2>❌ Loại dịch vụ không hợp lệ.</h2></body></html>");
                        return buildResponseEntity(response, null);
                    }
                    
                    logger.info("✅ SSR: service_type={} validated successfully", service_type);
                    // === END SERVICE_TYPE VALIDATION ===
                    
                    // === SSR DATA QUERYING ===
                    // Query database for service data with service_type + pagination + search
                    Map<String, Object> ssrServiceData = new HashMap<>();
                    
                    // ✅ PAGINATION STRATEGY (Hybrid):
                    // - Ưu tiên cursor để giảm IO khi đi tuần tự (page 1 -> 2 -> 3).
                    // - Khi user nhảy thẳng tới trang xa (page>1) mà chưa có lastkey trong cache → dùng offset một lần,
                    //   sau đó seed lại cache để những lần tiếp theo quay về cursor.
                    int pageSize = ssr_take != null ? ssr_take : ssr_pageSize;
                    boolean hasCursorSeed = ssr_lastkey != null;
                    boolean requestedRandomPage = ssr_page > 1;
                    boolean forceOffsetPagination = requestedRandomPage && !hasCursorSeed;
                    boolean useCursorPagination = !forceOffsetPagination;
                    
                    long totalCount = 0;
                    List<Map<String, Object>> serviceDetailList = new ArrayList<>();
                    
                    // Check cache first (cache key: domain + service_type + page + pageSize + search query)
                    String paginationKey = useCursorPagination
                        ? String.format("cursor:%d:%s", pageSize, ssr_lastkey != null ? ssr_lastkey : "")
                        : String.format("page:%d:%d", ssr_page, pageSize);
                    String cacheKey = String.format("%s:%s:%s:%s", domain, service_type, paginationKey, ssr_q != null ? ssr_q : "");
                    Map<String, Object> cachedData = ssrServiceDataCache.get(cacheKey);
                    if (cachedData != null) {
                        Long cacheTime = (Long) cachedData.get("__cache_time__");
                        if (cacheTime != null && (System.currentTimeMillis() - cacheTime) < CACHE_TTL_MS) {
                            ssrServiceData = cachedData;
                            logger.info("✅ SSR: Using cached data for key={}", cacheKey);
                            Object cachedLastKey = cachedData.get("lastkey");
                            if (cachedLastKey instanceof String && ssr_lastkey == null) {
                                ssr_lastkey = (String) cachedLastKey;
                            }
                        } else {
                            ssrServiceDataCache.remove(cacheKey); // Expired, remove
                        }
                    }
                    
                    if (ssrServiceData.isEmpty()) {
                    try {
                        // Build SearchFilter for querying service details
                        SearchFilter ssrFilter = new SearchFilter();
                        ssrFilter.setOperator("AND");
                        
                          List<SearchFilter> conditions = new ArrayList<>();

                          // Match by service_type (bảng chi tiết hiện chỉ còn cột service_type)
                          conditions.add(RecordManager.createCondition("service_type", "eq", service_type));

                          // Domain: allow empty/NULL rows to still appear (older data), but prefer current domain
                          SearchFilter domainOr = new SearchFilter();
                          domainOr.setOperator("OR");
                          String domainLike = domain; // WildcardQuery tự thêm * hai đầu
                          domainOr.setConditions(List.of(
                              RecordManager.createCondition("domain", "like", domainLike),
                              RecordManager.createCondition("domain", "isnull", null),
                              RecordManager.createCondition("domain", "eq", "")
                          ));
                          conditions.add(domainOr);

                          conditions.add(RecordManager.createCondition("status", "eq", "active"));
                        
                                                // Add search query filter if provided (AND with other filters)
                                                    if (ssr_q != null && !ssr_q.isEmpty()) {
                                                            String qVal = ssr_q.trim();
                                                            String qValLower = qVal.toLowerCase();
                                                            List<SearchFilter> qConditions = new ArrayList<>();
                                                            // q chỉ tìm tiêu đề (đa ngôn ngữ)
                                                            qConditions.add(RecordManager.createCondition("title", "like", qVal));
                                                            qConditions.add(RecordManager.createCondition("title", "like", qValLower));
                                                            qConditions.add(RecordManager.createCondition("title_en", "like", qVal));
                                                            qConditions.add(RecordManager.createCondition("title_en", "like", qValLower));
                                                            qConditions.add(RecordManager.createCondition("title_zh", "like", qVal));
                                                            qConditions.add(RecordManager.createCondition("title_zh", "like", qValLower));

                                                            SearchFilter searchFilter = new SearchFilter();
                                                            searchFilter.setOperator("OR");
                                                            searchFilter.setConditions(qConditions);
                                                            conditions.add(searchFilter);
                                                    }

                        // Các filter chi tiết lấy từ client
                        java.util.function.Function<String, Double> toNumber = (raw) -> {
                            if (raw == null) return null;
                            try {
                                String cleaned = raw.replaceAll("[ ,]", "");
                                return Double.parseDouble(cleaned);
                            } catch (Exception ex) {
                                return null;
                            }
                        };

                        // Helper to fetch and sanitize a param
                        java.util.function.Function<String, String> getParam = (k) -> {
                            String raw = queryParams.get(k);
                            if (raw == null) return null;
                            String v = sanitizeInput(raw).trim();
                            return v.isEmpty() ? null : v;
                        };

                        // propertyType -> propertyTypeLabel
                        String pTypeVal = getParam.apply("propertyType");
                        if (pTypeVal != null) {
                            conditions.add(RecordManager.createCondition("propertyTypeLabel", "eq", pTypeVal));
                        }

                        // transactionType -> transactionTypeLabel
                        String transVal = getParam.apply("transactionType");
                        if (transVal != null) {
                            conditions.add(RecordManager.createCondition("transactionTypeLabel", "eq", transVal));
                        }

                        // address/location like
                        String addrVal = getParam.apply("address");
                        if (addrVal != null) {
                            SearchFilter addrOr = new SearchFilter();
                            addrOr.setOperator("OR");
                            addrOr.setConditions(List.of(
                                RecordManager.createCondition("attributes_location", "like", addrVal),
                                RecordManager.createCondition("location", "like", addrVal),
                                RecordManager.createCondition("address", "like", addrVal)
                            ));
                            conditions.add(addrOr);
                        }

                        // Price range -> priceValue
                        String pMinRaw = getParam.apply("price_min");
                        if (pMinRaw != null) {
                            Double val = toNumber.apply(pMinRaw);
                            if (val != null) {
                                conditions.add(RecordManager.createCondition("priceValue", "gte", val));
                            }
                        }
                        String pMaxRaw = getParam.apply("price_max");
                        if (pMaxRaw != null) {
                            Double val = toNumber.apply(pMaxRaw);
                            if (val != null) {
                                conditions.add(RecordManager.createCondition("priceValue", "lte", val));
                            }
                        }

                        // Front width
                        String frontWidthRaw = getParam.apply("frontWidth");
                        if (frontWidthRaw != null) {
                            Double val = toNumber.apply(frontWidthRaw);
                            if (val != null) {
                                conditions.add(RecordManager.createCondition("frontWidth", "gte", val));
                            }
                        }

                        // Bedrooms / bathrooms / floors
                        String bedroomsVal = getParam.apply("bedrooms");
                        if (bedroomsVal != null) {
                            conditions.add(RecordManager.createCondition("bedrooms", "eq", bedroomsVal));
                        }
                        String bathroomsVal = getParam.apply("bathrooms");
                        if (bathroomsVal != null) {
                            conditions.add(RecordManager.createCondition("bathrooms", "eq", bathroomsVal));
                        }
                        String floorsVal = getParam.apply("floors");
                        if (floorsVal != null) {
                            conditions.add(RecordManager.createCondition("floors", "eq", floorsVal));
                        }

                        // Legal status
                        String legalVal = getParam.apply("legalStatus");
                        if (legalVal != null) {
                            conditions.add(RecordManager.createCondition("legalStatus", "eq", legalVal));
                        }

                        // Furnished
                        String furnishedVal = getParam.apply("furnished");
                        if (furnishedVal != null) {
                            conditions.add(RecordManager.createCondition("furnished", "eq", furnishedVal));
                        }
                        
                        ssrFilter.setConditions(conditions);
                        
                        Map<String, Object> ssrQueryResult;
                        if (useCursorPagination) {
                            ssrQueryResult = recordManager.filterWithPagination(
                                app_id,
                                tbl_service_detail,
                                ssrFilter,
                                pageSize,
                                ssr_lastkey
                            );
                        } else {
                            int offset = Math.max(0, (ssr_page - 1) * pageSize);
                            ssrQueryResult = recordManager.filterWithOffset(
                                app_id,
                                tbl_service_detail,
                                ssrFilter,
                                offset,
                                pageSize
                            );
                        }

                        List<Map<String, Object>> pageRows = (List<Map<String, Object>>) ssrQueryResult.getOrDefault("rows", new ArrayList<>());
                        Object tcObj = ssrQueryResult.get("totalCount");
                        if (tcObj instanceof Number) {
                            totalCount = ((Number) tcObj).longValue();
                        } else {
                            totalCount = pageRows.size();
                        }
                        serviceDetailList = pageRows;
                        String nextCursor = (String) ssrQueryResult.get("nextCursor");
                        if (!useCursorPagination) {
                            String pageCursor = (String) ssrQueryResult.get("pageCursor");
                            if (pageCursor != null && !pageCursor.isEmpty()) {
                                ssr_lastkey = pageCursor;
                            }
                        }
                        
                        // === SAVE TO PAGINATION CACHE ===
                        PaginationCacheManager.saveCursorForPage(
                            paginationSignature,
                            ssr_page,
                            ssr_lastkey,
                            nextCursor,
                            totalCount
                        );
                        logger.info("💾 Pagination Cache SAVED: page={}, nextCursor={}, totalCount={}", ssr_page, nextCursor, totalCount);
                        // === END PAGINATION CACHE SAVE ===
                        
                        ssrServiceData.put("nextCursor", nextCursor);
                        ssrServiceData.put("paginationMode", useCursorPagination ? "cursor" : "offset");
                        
                        ssrServiceData.put("serviceDetailList", serviceDetailList);
                        ssrServiceData.put("totalCount", totalCount);
                        // Inject actual page number for frontend pagination UI
                        ssrServiceData.put("page", ssr_page);
                        ssrServiceData.put("pageSize", pageSize);
                        ssrServiceData.put("take", pageSize);
                        ssrServiceData.put("paginationMode", useCursorPagination ? "cursor" : "offset");
                        ssrServiceData.put("nextCursor", ssrServiceData.get("nextCursor"));
                        ssrServiceData.put("lastkey", ssr_lastkey);
                        ssrServiceData.put("service_type", service_type);
                        ssrServiceData.put("search_query", ssr_q != null ? ssr_q : "");
                        ssrServiceData.put("__cache_time__", System.currentTimeMillis());
                        
                        // Store in cache
                        ssrServiceDataCache.put(cacheKey, new HashMap<>(ssrServiceData));
                        logger.info("✅ SSR: Queried service_type={}, mode={}, page={}, take={}, lastkey={}, found {} records, cached", 
                            service_type, useCursorPagination ? "cursor" : "offset", ssr_page, pageSize, ssr_lastkey, totalCount);
                        
                    } catch (Exception ssrQueryEx) {
                        logger.error("❌ SSR: Error querying service data: {}", ssrQueryEx.getMessage(), ssrQueryEx);
                        // Fallback: return empty list but continue rendering
                        ssrServiceData.put("serviceDetailList", new ArrayList<>());
                        ssrServiceData.put("totalCount", 0);
                        ssrServiceData.put("page", useCursorPagination ? 1 : ssr_page);
                        ssrServiceData.put("pageSize", pageSize);
                        ssrServiceData.put("take", pageSize);
                        ssrServiceData.put("paginationMode", useCursorPagination ? "cursor" : "offset");
                        ssrServiceData.put("nextCursor", null);
                        ssrServiceData.put("lastkey", ssr_lastkey);
                    }
                    } // End cache check
                    
                    logger.debug("🔍 SSR: ssrServiceData prepared, totalCount={}, page={}, pageSize={}", ssrServiceData.get("totalCount"), ssrServiceData.get("page"), ssrServiceData.get("pageSize"));
                    // === END SSR DATA QUERYING ===
                    
                    // === END SSR SECURITY LOGIC ===
                    // Only include the meta for the current requested route and language
                    String main_service_code="";
                    String default_service_code="";
                    String lang = null;
                    if (request != null) {
                        String hlParam = request.getParameter("hl");
                        if (hlParam != null && !hlParam.trim().isEmpty()) {
                            lang = hlParam.trim().toLowerCase();
                            int dashIdx = lang.indexOf('-');
                            if (dashIdx > 0) {
                                lang = lang.substring(0, dashIdx);
                            }
                        }
                    }
                    // Default luôn là tiếng Việt khi không có tham số ?hl=
                    if (lang == null || lang.isEmpty()) lang = "vi";
                    // Truy vấn lấy danh sách category từ bảng dịch vụ, trả về đầy đủ thông tin đa ngôn ngữ
                    List<Map<String, Object>> ssrCategories = new ArrayList<>();
                    // 🔴 NEW: Map để lưu dynamic code templates (tên -> mã code đã mã hóa)
                    Map<String, String> dynamicCodeTemplatesMap = new HashMap<>();
                    
                    // Check cache for categories
                    String catCacheKey = domain + ":" + lang;
                    Map<String, Object> cachedCatData = ssrCategoriesCache.get(catCacheKey);
                    if (cachedCatData != null) {
                        Long catCacheTime = (Long) cachedCatData.get("__cache_time__");
                        if (catCacheTime != null && (System.currentTimeMillis() - catCacheTime) < CACHE_TTL_MS) {
                            ssrCategories = (List<Map<String, Object>>) cachedCatData.get("categories");
                            dynamicCodeTemplatesMap = (Map<String, String>) cachedCatData.getOrDefault("dynamicCodeTemplates", new HashMap<>());
                            logger.info("✅ SSR: Using cached categories for domain={}, lang={}", domain, lang);
                        } else {
                            ssrCategoriesCache.remove(catCacheKey);
                        }
                    }
                    
                    if (ssrCategories.isEmpty()) {
                    try {
                        // Cho phép domain lưu dạng CSV ("a.com,b.com"), nên cần lọc theo contains
                        SearchFilter catFilter = new SearchFilter();
                        catFilter.setOperator("AND");
                        String domainLike = domain; // WildcardQuery tự thêm * hai đầu
                        catFilter.setConditions(List.of(
                            RecordManager.createCondition("is_service", "eq", true),
                            RecordManager.createCondition("status", "eq", "active"),
                            // Domain: khớp chính xác hoặc chuỗi chứa domain (CSV). Dùng "like" để bao phủ "a.com,b.com".
                            RecordManager.createCondition("domain", "like", domainLike)
                        ));
                        Map<String, Object> catResult = recordManager.filter(app_id, tbl_services, catFilter);
                        List<Map<String, Object>> catRows = (List<Map<String, Object>>) catResult.getOrDefault("rows", new ArrayList<>());
                        for (Map<String, Object> row : catRows) {
                            logger.info("Xử lý danh mục SSR: {}", row);
                            Map<String, Object> catObj = new HashMap<>();
                            String slug = safeStr(row.get("slug"));
                            String service_code = safeStr(row.get("service_code"));
                            String langCat = lang != null && !lang.isEmpty() ? lang : "vi";
                            String category = safeStr(row.get(langCat.equals("vi") ? "category" :"category_" + langCat));
                            String attributes_color = safeStr(row.get("attributes_color"));
                            Object is_group_slug_raw = row.get("is_group_slug");
                            boolean is_group_slug = false;
                            if (is_group_slug_raw instanceof Boolean) {
                                is_group_slug = (Boolean) is_group_slug_raw;
                            } else if (is_group_slug_raw instanceof String) {
                                is_group_slug = "true".equalsIgnoreCase((String) is_group_slug_raw);
                            } else if (is_group_slug_raw instanceof Number) {
                                is_group_slug = ((Number) is_group_slug_raw).intValue() == 1;
                            }
                            if (is_group_slug && main_service_code.isEmpty()) {
                                main_service_code=service_code;
                            }
                            Object is_group_slug_default_raw = row.get("is_group_slug_default");
                            boolean is_group_slug_default = false;
                            if (is_group_slug_default_raw instanceof Boolean) {
                                is_group_slug_default = (Boolean) is_group_slug_default_raw;
                            } else if (is_group_slug_default_raw instanceof String) {
                                is_group_slug_default = "true".equalsIgnoreCase((String) is_group_slug_default_raw);
                            } else if (is_group_slug_default_raw instanceof Number) {
                                is_group_slug_default = ((Number) is_group_slug_default_raw).intValue() == 1;
                            }
                            if (is_group_slug_default && !is_group_slug) {
                                default_service_code=service_code;
                            }

                            String group_slug = safeStr(row.get("group_slug"));
                            String attributes_icon = safeStr(row.get("attributes_icon"));
                            String attributes_description = safeStr(row.get(langCat.equals("vi") ? "attributes_description" : "attributes_description_" + langCat));
                            
                            // 🔴 NEW: Extract dynamic code name từ web_services row
                            String dynamicCodeName = safeStr(row.get("dynamic_code_name"));
                            
                            // ✅ Extract is_service field - kiểm tra từ database (Boolean, String, hoặc Number)
                            Object is_service_raw = row.get("is_service");
                            boolean is_service = true; // mặc định true (item là service)
                            if (is_service_raw instanceof Boolean) {
                                is_service = (Boolean) is_service_raw;
                            } else if (is_service_raw instanceof String) {
                                is_service = "true".equalsIgnoreCase((String) is_service_raw);
                            } else if (is_service_raw instanceof Number) {
                                is_service = ((Number) is_service_raw).intValue() == 1;
                            }
                            
                            // ✅ GỬI TẤT CẢ CÁC TRƯỜNG DỊCH: category, category_en, category_zh, attributes_description_en, attributes_description_zh
                            catObj.put("slug", slug);
                            catObj.put("is_service", is_service); // ✅ GỬI is_service FIELD ĐỊ FRONTEND BIẾT LÀ SERVICE HAY MENU
                            catObj.put("is_group_slug", is_group_slug);
                            catObj.put("is_group_slug_default", is_group_slug_default);
                            catObj.put("group_slug", group_slug);
                            catObj.put("color", attributes_color);
                            catObj.put("icon", attributes_icon);
                            // Luôn gửi tất cả trường dịch, frontend sẽ chọn đúng dựa trên ngôn ngữ
                            catObj.put("category", safeStr(row.get("category")) != null && !safeStr(row.get("category")).isEmpty() ? safeStr(row.get("category")) : "");
                            catObj.put("category_en", safeStr(row.get("category_en")) != null && !safeStr(row.get("category_en")).isEmpty() ? safeStr(row.get("category_en")) : "");
                            catObj.put("category_zh", safeStr(row.get("category_zh")) != null && !safeStr(row.get("category_zh")).isEmpty() ? safeStr(row.get("category_zh")) : "");
                            catObj.put("description", safeStr(row.get("attributes_description")) != null && !safeStr(row.get("attributes_description")).isEmpty() ? safeStr(row.get("attributes_description")) : "");
                            catObj.put("description_en", safeStr(row.get("attributes_description_en")) != null && !safeStr(row.get("attributes_description_en")).isEmpty() ? safeStr(row.get("attributes_description_en")) : "");
                            catObj.put("description_zh", safeStr(row.get("attributes_description_zh")) != null && !safeStr(row.get("attributes_description_zh")).isEmpty() ? safeStr(row.get("attributes_description_zh")) : "");
                            
                            // 🔴 NEW: Thêm dynamic code name vào catObj để gửi tới frontend
                            catObj.put("dynamicCodeName", dynamicCodeName);
                            
                            ssrCategories.add(catObj);
                        }
                        
                        // 🔴 NEW: Resolve dynamic code templates từ sys_autos cho tất cả category có dynamic_code_name
                        for (Map<String, Object> category : ssrCategories) {
                            String dynamicCodeName = (String) category.get("dynamicCodeName");
                            if (dynamicCodeName != null && !dynamicCodeName.isEmpty()) {
                                try {
                                    // Query sys_autos để lấy template code: p_name = dynamicCodeName AND p_type = 0
                                    SearchFilter templateFilter = new SearchFilter();
                                    templateFilter.setOperator("AND");
                                    templateFilter.setConditions(List.of(
                                        RecordManager.createCondition("p_name", "eq", dynamicCodeName),
                                        RecordManager.createCondition("p_type", "eq", 0)
                                    ));
                                    Map<String, Object> templateResult = recordManager.filter("csm", "sys_autos", templateFilter);
                                    @SuppressWarnings("unchecked")
                                    List<Map<String, Object>> templateRows = (List<Map<String, Object>>) templateResult.getOrDefault("rows", new ArrayList<>());
                                    
                                    if (!templateRows.isEmpty()) {
                                        String encryptedCode = safeStr(templateRows.get(0).get("p_code"));
                                        if (!encryptedCode.isEmpty()) {
                                            // 🔴 NEW: Decrypt code tại backend để client execute ngay
                                            try {
                                                String decryptedCode = recordManager.csm_decrypt(encryptedCode);
                                                if (decryptedCode != null && !decryptedCode.isEmpty()) {
                                                    dynamicCodeTemplatesMap.put(dynamicCodeName, decryptedCode);
                                                    logger.info("✅ Loaded & decrypted dynamic code template: {} for domain={}", dynamicCodeName, domain);
                                                } else {
                                                    logger.warn("⚠️ Dynamic code template '{}' decryption failed or empty", dynamicCodeName);
                                                }
                                            } catch (Exception decryptEx) {
                                                logger.warn("⚠️ Failed to decrypt dynamic code template '{}': {}", dynamicCodeName, decryptEx.getMessage());
                                            }
                                        }
                                    } else {
                                        logger.warn("⚠️ Dynamic code template '{}' not found in sys_autos (p_type=0)", dynamicCodeName);
                                    }
                                } catch (Exception ex) {
                                    logger.warn("⚠️ Failed to load dynamic code template '{}': {}", dynamicCodeName, ex.getMessage());
                                }
                            }
                        }
                        logger.info("✅ Resolved {} dynamic code templates for domain={}", dynamicCodeTemplatesMap.size(), domain);
                        
                        // Store in cache
                        Map<String, Object> catCacheData = new HashMap<>();
                        catCacheData.put("categories", new ArrayList<>(ssrCategories));
                        catCacheData.put("dynamicCodeTemplates", new HashMap<>(dynamicCodeTemplatesMap));
                        catCacheData.put("__cache_time__", System.currentTimeMillis());
                        ssrCategoriesCache.put(catCacheKey, catCacheData);
                        logger.info("✅ SSR: Cached {} categories for domain={}, lang={}", ssrCategories.size(), domain, lang);
                    } catch (Exception ex) {
                        logger.warn("Không lấy được SSR website categories: {}", ex.getMessage());
                    }
                    } // End categories cache check

                    String reactTemplatePath = rp_index + "/index.html";
                    
                    File reactTemplateFile = recordManager.getStaticFile(reactTemplatePath);

                    if (reactTemplateFile != null && reactTemplateFile.exists() && reactTemplateFile.isFile()) {
                        String initialHtmlContent = null;
                        try {
                            // Dùng cache để lấy nội dung template nếu còn hạn
                            Map<String, Object> tplCached = reactTemplateCache.get(reactTemplatePath);
                            if (tplCached != null) {
                                Long ctime = (Long) tplCached.get("__cache_time__");
                                if (ctime != null && (System.currentTimeMillis() - ctime) < CACHE_TTL_MS) {
                                    initialHtmlContent = (String) tplCached.get("content");
                                }
                            }
                            if (initialHtmlContent == null || initialHtmlContent.isEmpty()) {
                                // Đọc nội dung HTML thô từ file React template
                                initialHtmlContent = readFileContent(reactTemplateFile);
                                // Lưu cache
                                Map<String, Object> tplData = new HashMap<>();
                                tplData.put("content", initialHtmlContent);
                                tplData.put("__cache_time__", System.currentTimeMillis());
                                reactTemplateCache.put(reactTemplatePath, tplData);
                            }
                            
                            // Bổ sung SSR_WEBSITE_ROUTES: lấy tất cả routes SSR cho domain hiện tại
                            Map<String, Object> ssrWebsiteRoutes = new LinkedHashMap<>();
                            Map<String, String> seoMeta = resolveSeoForServiceRoute(
                                app_id,
                                tbl_services,
                                tbl_service_detail,
                                domain,
                                normalizedPath,
                                main_service_code,
                                default_service_code,
                                lang
                            );
                            if (seoMeta != null) seoMeta.put("lang", lang);
                            ssrWebsiteRoutes.put(normalizedPath, seoMeta != null ? seoMeta : new HashMap<>());
                            String ssrWebsiteRoutesJson = objectMapper.writeValueAsString(ssrWebsiteRoutes);
                            templateData.put("ssrWebsiteRoutesJson", ssrWebsiteRoutesJson);
                        } catch (IOException e) {
                            logger.error("Lỗi đọc nội dung file React template: {}. Chi tiết: {}", reactTemplatePath,
                                    e.getMessage());
                            response.set("code", 500);
                            response.setHtmlBody(
                                    "<html><body><h2>Lỗi server khi đọc template React.</h2></body></html>");
                            return buildResponseEntity(response, null);
                        }

                        // 1. Chuẩn bị dữ liệu chung cho templateData
                        templateData.put("req", request);
                        templateData.put("res", response);
                        templateData.put("protocol", protocol);
                        templateData.put("host", hostHeader);
                        templateData.put("url", normalizedPath);
                        templateData.put("phone", RecordManager.PHONE);
                        templateData.put("writeby", RecordManager.WRITEBY);
                        templateData.put("app_type", appType);
                        templateData.put("randval", (int) (Math.random() * (100000000 - 100000 + 1)) + 100000);
                        templateData.put("baseHref", "../");

                        // 2. Tính SEO động theo slug + app_id/tables của route (không tạo endpoint mới)
                        String pageTitle = (String) selectedRoute.getOrDefault("f_title", "Trang web của tôi");
                        String pageDescription = (String) selectedRoute.getOrDefault("f_keyword", "Mô tả mặc định");
                        String pageKeywords = (String) selectedRoute.getOrDefault("f_keyword", "");
                        String ogImage = (String) selectedRoute.getOrDefault("f_logo", "default_og_image.png");
                        String canonicalUrl = String.format("%s://%s%s", protocol, hostHeader, normalizedPath);
                        
                        try {
                            // Ensure lang is always defined before calling resolveSeoForServiceRoute
                            Map<String, String> resolvedSeo = resolveSeoForServiceRoute(
                                app_id,
                                tbl_services,
                                tbl_service_detail,
                                domain,
                                normalizedPath,
                                main_service_code,
                                default_service_code,
                                lang
                            );
                            if (resolvedSeo != null) {
                                pageTitle = resolvedSeo.getOrDefault("title", pageTitle);
                                pageDescription = resolvedSeo.getOrDefault("description", pageDescription);
                                pageKeywords = resolvedSeo.getOrDefault("keywords", pageKeywords);
                                
                                String resolvedImg = resolvedSeo.get("image");
                                if (resolvedImg != null && !resolvedImg.isEmpty()) {
                                    ogImage = resolvedImg;
                                }
                                
                                String resolvedCanonical = resolvedSeo.get("canonical");
                                if (resolvedCanonical != null && !resolvedCanonical.isEmpty()) {
                                    canonicalUrl = resolvedCanonical;
                                }
                                
                                logger.info("✅ SSR SEO resolved: title={}, desc={}, keywords={}, image={}, canonical={}", 
                                    pageTitle, pageDescription, pageKeywords, ogImage, canonicalUrl);
                            }
                        } catch (Exception seoEx) {
                            logger.warn("⚠️ Không thể resolve SEO từ dịch vụ: {}", seoEx.getMessage());
                        }

                        // ✅ CONVERT ogImage TO ABSOLUTE URL (FIX FOR GOOGLE SEARCH CONSOLE)
                        // OG images PHẢI là URL đầy đủ (https://domain.com/path) không phải đường dẫn tương đối (/path)
                        if (ogImage != null && !ogImage.isEmpty() && !ogImage.startsWith("http")) {
                            ogImage = String.format("%s://%s%s", protocol, hostHeader, ogImage);
                            logger.info("✅ Converted relative ogImage to absolute URL: {}", ogImage);
                        }

                        // 3. Chuẩn bị `initialReactData` (dữ liệu cho React hydrate)
                        Map<String, Object> initialReactData = new HashMap<>();
                        initialReactData.put("pageTitle", pageTitle);
                        initialReactData.put("pageDescription", pageDescription);
                        initialReactData.put("canonicalUrl", canonicalUrl); // Use clean canonical URL
                        initialReactData.put("ogImage", ogImage);
                        initialReactData.put("currentPagePath", normalizedPath);
                        // Luôn inject app_id cho mọi trang (dù chưa đăng nhập)
                        initialReactData.put("app_id", app_id);

                        // 3.0. === SSR SERVICE DATA INJECTION ===
                        // Inject server-side queried service data into initialReactData
                        List<Map<String, Object>> itemsForJsonLd = new ArrayList<>();
                        if (ssrServiceData != null && !ssrServiceData.isEmpty()) {
                            List<Map<String, Object>> ssrServiceDetailList = (List<Map<String, Object>>) ssrServiceData.get("serviceDetailList");
                            if (ssrServiceDetailList != null && !ssrServiceDetailList.isEmpty()) {
                                initialReactData.put("serviceDetailList", ssrServiceDetailList);
                                logger.info("✅ SSR: Injected {} service details into initialReactData", ssrServiceDetailList.size());
                                // Build ItemList elements for JSON-LD (first 10 items)
                                int maxItems = Math.min(ssrServiceDetailList.size(), 10);
                                for (int i = 0; i < maxItems; i++) {
                                    Map<String, Object> item = ssrServiceDetailList.get(i);
                                    String itemTitle = safeStr(item.get("title"));
                                    if (itemTitle.isEmpty()) itemTitle = safeStr(item.get("title_vi"));
                                    String itemSlug = safeStr(item.get("slug"));
                                    String itemServiceType = safeStr(item.get("serviceType"));
                                    if (itemServiceType.isEmpty()) itemServiceType = safeStr(item.get("service_type"));
                                    String itemUrl = "";
                                    if (!itemServiceType.isEmpty() && !itemSlug.isEmpty()) {
                                        itemUrl = protocol + "://" + hostHeader + "/" + itemServiceType + "/" + itemSlug + ".shtml";
                                    }
                                    Map<String, Object> listItem = new HashMap<>();
                                    listItem.put("@type", "ListItem");
                                    listItem.put("position", i + 1);
                                    listItem.put("name", itemTitle);  // Add required 'name' property to ListItem
                                    Map<String, Object> itemObj = new HashMap<>();
                                    itemObj.put("@type", "Article");
                                    itemObj.put("name", itemTitle);
                                    itemObj.put("url", itemUrl);
                                    listItem.put("item", itemObj);
                                    itemsForJsonLd.add(listItem);
                                }
                            }
                            initialReactData.put("totalCount", ssrServiceData.getOrDefault("totalCount", 0L));
                            initialReactData.put("page", ssrServiceData.getOrDefault("page", 1));
                            initialReactData.put("pageSize", ssrServiceData.getOrDefault("pageSize", 12));
                            initialReactData.put("take", ssrServiceData.getOrDefault("take", ssrServiceData.getOrDefault("pageSize", 12)));
                            initialReactData.put("paginationMode", ssrServiceData.getOrDefault("paginationMode", "page"));
                            initialReactData.put("nextCursor", ssrServiceData.get("nextCursor"));
                            initialReactData.put("lastkey", ssrServiceData.get("lastkey"));
                            initialReactData.put("service_type", ssrServiceData.getOrDefault("service_type", "services"));
                            initialReactData.put("search_query", ssrServiceData.getOrDefault("search_query", ""));
                            logger.info("📊 SSR: Pagination info - page={}, pageSize={}, totalCount={}", 
                                initialReactData.get("page"), initialReactData.get("pageSize"), initialReactData.get("totalCount"));
                        }
                        // Store itemListElements for Thymeleaf template to use in ItemList JSON-LD
                        initialReactData.put("itemListElements", itemsForJsonLd);
                        // === END SSR SERVICE DATA INJECTION ===

                        // 3.1. Gắn danh sách bài chi tiết theo kịch bản slug -> service_code
                        try {
                            logger.info("🚀 SSR: Calling resolveServiceListingForRoute with: appId={}, tblServices={}, tblServiceDetail={}, domain={}, path={}, lang={}", 
                                    app_id, tbl_services, tbl_service_detail, domain, normalizedPath, lang);
                            
                            // FIXED: Pass lang parameter to ensure title/description use correct language
                            Map<String, Object> serviceData = resolveServiceListingForRoute(
                                    app_id,
                                    tbl_services,
                                    tbl_service_detail,
                                    domain,
                                    normalizedPath,
                                    main_service_code,
                                    default_service_code,
                                    requestParams,
                                    lang
                            );
                                logger.debug("🔍 SSR: serviceData resolved for path={}, serviceData keys={}", 
                                    normalizedPath, serviceData != null ? serviceData.keySet() : "null");
                            
                            if (serviceData != null) {
                                logger.info("📋 SSR: serviceData contains keys: {}", serviceData.keySet());
                                // Lấy serviceCode
                                if (serviceData.containsKey("serviceCode")) {
                                    initialReactData.put("serviceCode", serviceData.get("serviceCode"));
                                }
                                // Lấy chi tiết dịch vụ (detail page)
                                if (serviceData.containsKey("serviceDetail")) {
                                    Map<String, Object> detail = (Map<String, Object>) serviceData.get("serviceDetail");
                                    // Bổ sung các trường mới vào detail
                                    initialReactData.put("serviceDetail", detail);
                                }
                                // Lấy danh sách liên quan
                                if (serviceData.containsKey("relatedDetailList")) {
                                    List<Map<String, Object>> rel = (List<Map<String, Object>>) serviceData.get("relatedDetailList");
                                    initialReactData.put("relatedDetailList", rel);
                                    if (serviceData.containsKey("totalRelatedCount")) {
                                        initialReactData.put("totalRelatedCount", serviceData.get("totalRelatedCount"));
                                    }
                                    if (serviceData.containsKey("relatedPage")) {
                                        initialReactData.put("relatedPage", serviceData.get("relatedPage"));
                                    }
                                    if (serviceData.containsKey("relatedPageSize")) {
                                        initialReactData.put("relatedPageSize", serviceData.get("relatedPageSize"));
                                    }
                                    if (serviceData.containsKey("relatedNextCursor")) {
                                        initialReactData.put("relatedNextCursor", serviceData.get("relatedNextCursor"));
                                    }
                                    if (serviceData.containsKey("relatedLastKey")) {
                                        initialReactData.put("relatedLastKey", serviceData.get("relatedLastKey"));
                                    }
                                }
                                // Lấy danh sách cho category page
                                if (serviceData.containsKey("details")) {
                                    initialReactData.put("serviceDetailList", serviceData.get("details"));
                                    initialReactData.put("totalCount", serviceData.getOrDefault("totalCount", 0L));
                                    initialReactData.put("page", serviceData.getOrDefault("page", 1));
                                    initialReactData.put("pageSize", serviceData.getOrDefault("pageSize", 12));
                                    // ✅ Thêm các trường pagination mới
                                    if (serviceData.containsKey("take")) {
                                        initialReactData.put("take", serviceData.get("take"));
                                    }
                                    if (serviceData.containsKey("lastkey")) {
                                        initialReactData.put("lastkey", serviceData.get("lastkey"));
                                    }
                                    if (serviceData.containsKey("nextCursor")) {
                                        initialReactData.put("nextCursor", serviceData.get("nextCursor"));
                                    }
                                    if (serviceData.containsKey("paginationMode")) {
                                        initialReactData.put("paginationMode", serviceData.get("paginationMode"));
                                    }
                                }
                                // Lấy danh sách cho homepage
                                if (serviceData.containsKey("isHome") && Boolean.TRUE.equals(serviceData.get("isHome"))) {
                                    initialReactData.put("homeDetailList", serviceData.get("details"));
                                }
                                // Lấy thông tin category (serviceCategory) với trường mới
                                if (serviceData.containsKey("serviceCategory")) {
                                    Map<String, Object> serviceCategory = (Map<String, Object>) serviceData.get("serviceCategory");
                                    // Bổ sung các trường mới vào initialReactData
                                    initialReactData.put("serviceCategory", serviceCategory);
                                    // FIXED: mapServiceCategoryByLang() already selected the language-specific content
                                    // Just use the category/title/description fields directly (already in correct language)
                                    String catTitle = safeStr(serviceCategory.getOrDefault("category",
                                        serviceCategory.getOrDefault("title",
                                        serviceCategory.getOrDefault("name", pageTitle))));
                                    String catDescription = safeStr(serviceCategory.getOrDefault("description", pageDescription));
                                    String catKeywords = safeStr(serviceCategory.getOrDefault("keywords", pageKeywords));
                                    // Fix: validate icon path - accept any /app_images/<app_id>/ format, fallback if empty
                                    String catIconRaw = safeStr(serviceCategory.get("icon"));
                                    String catIcon = ogImage; // default fallback
                                    if (!catIconRaw.isEmpty()) {
                                        // Accept HTTP/HTTPS URLs or any /app_images/ paths
                                        // app_id is dynamic (wuweb, lmkt, etc.) so don't hardcode specific paths
                                        if (catIconRaw.startsWith("http://") || catIconRaw.startsWith("https://") || catIconRaw.startsWith("/app_images/")) {
                                            catIcon = catIconRaw;
                                            logger.debug("✅ Using icon from serviceCategory: {}", catIcon);
                                        } else {
                                            // Path format không hợp lệ, dùng fallback
                                            logger.warn("⚠️ Invalid icon path format in serviceCategory: {}. Using fallback: {}", catIconRaw, ogImage);
                                        }
                                    }
                                    String catCanonical = canonicalUrl;
                                    if (serviceCategory.containsKey("seo_meta")) {
                                        String seoMetaStr = safeStr(serviceCategory.get("seo_meta"));
                                        if (!seoMetaStr.isEmpty() && !seoMetaStr.equals("{}")) {
                                            try {
                                                ObjectMapper mapper = new ObjectMapper();
                                                Map<String, Object> seoMeta = mapper.readValue(seoMetaStr, Map.class);
                                                Map<String, String> viMeta = seoMeta.containsKey("vi") ? (Map<String, String>) seoMeta.get("vi") : null;
                                                if (viMeta != null) {
                                                    catTitle = viMeta.getOrDefault("meta_title", catTitle);
                                                    catDescription = viMeta.getOrDefault("meta_description", catDescription);
                                                    catKeywords = viMeta.getOrDefault("keywords", catKeywords);
                                                    catCanonical = viMeta.getOrDefault("canonical", catCanonical);
                                                    String ogImageFromMeta = viMeta.get("og_image");
                                                    if (ogImageFromMeta != null && !ogImageFromMeta.isEmpty()) {
                                                        catIcon = ogImageFromMeta;
                                                    }
                                                }
                                            } catch (Exception jsonEx) {
                                                logger.warn("⚠️ SSR: Cannot parse seo_meta JSON: {}", jsonEx.getMessage());
                                            }
                                        }
                                    }
                                    // Override page meta
                                    pageTitle = catTitle;
                                    pageDescription = catDescription;
                                    pageKeywords = catKeywords;
                                    ogImage = catIcon;
                                    canonicalUrl = catCanonical;
                                    
                                    // 🎯 SEO OPTIMIZATION: Inject category content for server-side rendering
                                    // Lấy content từ serviceCategory để:
                                    // 1. Frontend render full content (encrypted, cần decrypt)
                                    // 2. Server-side render preview (description) ngay trong HTML
                                    String categoryContent = safeStr(serviceCategory.get("content"));
                                    if (!categoryContent.isEmpty()) {
                                        initialReactData.put("pageContent", categoryContent);
                                        logger.info("✅ SSR: Added pageContent ({} chars) for category SEO", categoryContent.length());
                                    }
                                }
                            } else {
                                logger.warn("⚠️ SSR: serviceData is NULL for path={}", normalizedPath);
                            }
                        } catch (Exception listEx) {
                            logger.error("❌ SSR: Error resolving service listing: {}", listEx.getMessage(), listEx);
                        }

                        // Thêm các dữ liệu khác mà React App cần từ selectedRoute nếu có
                        // Ví dụ: initialReactData.put("routeSpecificData",
                        // selectedRoute.get("someReactDataField"));
                        // 4. Chuyển `initialReactData` thành JSON String và thêm vào `templateData`
                        try {
                            // OPTIMIZED: Reuse shared ObjectMapper instance instead of creating new one
                            String jsonInitialReactData = SHARED_OBJECT_MAPPER.writeValueAsString(initialReactData);
                            templateData.put("initialReactDataJson", jsonInitialReactData);

                        } catch (Exception e) {
                            logger.error("Lỗi chuyển đổi initialReactData sang JSON: {}. Chi tiết: {}", e.getMessage(),
                                    e);
                            response.set("code", 500);
                            response.setHtmlBody(
                                    "<html><body><h2>Lỗi server khi chuẩn bị dữ liệu React.</h2></body></html>");
                            return buildResponseEntity(response, null);
                        }
                        String gsv = (String) selectedRoute.getOrDefault("gsv", "");
                        String gtag = (String) selectedRoute.getOrDefault("gtag", "");
                        // 5. Tạo object meta cho Thymeleaf template
                        Map<String, Object> meta = new HashMap<>();
                        // Đảm bảo site_name có dạng protocol://host để <base href> chính xác
                        meta.put("site_name", String.format("%s://%s", protocol, hostHeader));
                        meta.put("url", canonicalUrl); // Use resolved canonical or fallback to fullUrl
                        meta.put("gsv", gsv);
                        meta.put("gtag", gtag);
                        // Title fields - sử dụng pageTitle đã resolved
                        meta.put("title", pageTitle);
                        meta.put("title2", pageTitle);
                        meta.put("f_title", pageTitle);
                        
                        // Description fields - sử dụng pageDescription đã resolved
                        meta.put("description", pageDescription);
                        meta.put("f_description", pageDescription);
                        
                        // Keywords fields - sử dụng pageKeywords đã resolved
                        meta.put("keywords", pageKeywords);
                        meta.put("f_keyword", pageKeywords);
                        
                        // Image fields - sử dụng ogImage đã converted to absolute URL
                        meta.put("image", ogImage);
                        meta.put("f_logo", ogImage);
                        meta.put("og_image", ogImage);
                        
                        // App/Domain identifiers
                        meta.put("id", app_id);
                        meta.put("app_id", app_id);
                        
                        templateData.put("meta", meta);
                        
                        // 🎯 SEO OPTIMIZATION: Add content preview for server-side rendering
                        // Render description ngay trong HTML để Google bot thấy nội dung
                        // Description không encrypted, có thể render trực tiếp
                        templateData.put("ssrContentPreview", pageDescription);
                        
                        logger.info("📄 SSR Meta created: title={}, description={}, keywords={}, image={}, canonical={}", 
                            pageTitle, pageDescription, pageKeywords, ogImage, canonicalUrl);

                        // Luôn truyền app_id vào initialReactData và templateData cho SSR hydrate
                        if (app_id != null && !app_id.isEmpty()) {
                            initialReactData.put("app_id", app_id);
                        }
                        templateData.put("__INITIAL_DATA__", initialReactData);

                        // Thêm menus (tạm thời empty array)
                        templateData.put("menus", new ArrayList<>());
                        
                        // Pass __INITIAL_DATA__ with itemListElements for JSON-LD ItemList
                        Map<String, Object> initialDataForTemplate = new HashMap<>();
                        initialDataForTemplate.put("serviceDetailList", initialReactData.get("serviceDetailList"));
                        initialDataForTemplate.put("totalCount", initialReactData.get("totalCount"));
                        initialDataForTemplate.put("itemListElements", itemsForJsonLd);
                        templateData.put("__INITIAL_DATA__", initialDataForTemplate);

                        // 6. Render nội dung HTML đã đọc với Thymeleaf Context
                        Context context = new Context();
                        templateData.forEach(context::setVariable); // Đẩy tất cả dữ liệu vào context của Thymeleaf

                        // Kiểm tra nội dung template trước khi parse
                        if (initialHtmlContent == null || initialHtmlContent.trim().isEmpty()) {
                            logger.error("❌ Template content is null or empty for React SSR");
                            response.set("code", 500);
                            response.setHtmlBody("<html><body><h2>Lỗi: Template HTML rỗng</h2></body></html>");
                            return buildResponseEntity(response, null);
                        }

                        try {
                            // Dùng phương thức process(templateContent, context)
                            String finalHtmlResponse = templateEngine.process(initialHtmlContent, context);

                            // Inject SSR data scripts (Thymeleaf already rendered meta tags)
                            // OPTIMIZED: Minimize HTML scanning and JSON serialization
                            String lower = finalHtmlResponse.toLowerCase();
                            
                            // Serialize JSON objects once (not multiple times)
                            String json = SHARED_OBJECT_MAPPER.writeValueAsString(initialReactData);
                            String safeJson = json.replace("</", "<\\/");
                            String ssrScript = "<script>window.__INITIAL_REACT_DATA__ = " + safeJson + ";</script>";
                            
                            String categoriesJson = SHARED_OBJECT_MAPPER.writeValueAsString(ssrCategories);
                            String ssrCategoriesScript = "<script>window.__SSR_WEBSITE_CATEGORIES__ = " + categoriesJson + ";</script>";
                            String ssrRoutesScript = "<script>window.__SSR_WEBSITE_ROUTES__ = " + templateData.get("ssrWebsiteRoutesJson") + ";</script>";
                            
                            // 🔴 NEW: Serialize dynamic code templates map
                            String dynamicCodeTemplatesJson = SHARED_OBJECT_MAPPER.writeValueAsString(dynamicCodeTemplatesMap);
                            String ssrDynamicCodeScript = "<script>window.__SSR_DYNAMIC_CODE_TEMPLATES__ = " + dynamicCodeTemplatesJson + ";</script>";
                            
                            // Find </head> and </body> once
                            int headIdx = lower.indexOf("</head>");
                            int bodyIdx = lower.indexOf("</body>");
                            
                            // Preload hero image (ogImage) to improve LCP on mobile
                            String preloadImageTag = "";
                            try {
                                if (ogImage != null && !ogImage.isEmpty()) {
                                    // Only preload if it looks like a valid absolute URL
                                    if (ogImage.startsWith("http://") || ogImage.startsWith("https://")) {
                                        preloadImageTag = "<link rel=\"preload\" as=\"image\" href=\"" + ogImage + "\" fetchpriority=\"high\">";
                                    }
                                }
                            } catch (Exception ignore) {}
                            
                            try {
                                String injectedHtml;
                                if (headIdx >= 0) {
                                    injectedHtml = finalHtmlResponse.substring(0, headIdx) + preloadImageTag + ssrScript + ssrCategoriesScript + ssrRoutesScript + ssrDynamicCodeScript + finalHtmlResponse.substring(headIdx);
                                    logger.info("✅ SSR: Injected scripts before </head>");
                                } else if (bodyIdx >= 0) {
                                    injectedHtml = finalHtmlResponse.substring(0, bodyIdx) + preloadImageTag + ssrScript + ssrCategoriesScript + ssrRoutesScript + ssrDynamicCodeScript + finalHtmlResponse.substring(bodyIdx);
                                    logger.info("✅ SSR: Injected scripts before </body>");
                                } else {
                                    logger.warn("⚠️ No </head> or </body> found");
                                    injectedHtml = finalHtmlResponse;
                                }
                                
                                sitemapService.recordPathAsync(domain, normalizedPath, app_id, tbl_services, tbl_service_detail, true);
                                if (autoIndexService != null) {
                                    if (isStaticFile(normalizedPath)) {
                                        logger.debug("Skip auto-index for static path {}", normalizedPath);
                                    } else {
                                        try {
                                            String fullUrlForIndex = protocol + "://" + hostHeader + normalizedPath;
                                            autoIndexService.scheduleAutoIndex(hostHeader, fullUrlForIndex, true);
                                        } catch (Exception idxEx) {
                                            logger.debug("Auto-index schedule skipped for {}: {}", normalizedPath, idxEx.getMessage());
                                        }
                                    }
                                }
                                response.setHtmlBody(injectedHtml);
                            } catch (Exception jsonEx) {
                                logger.error("❌ Failed to serialize SSR data: {}", jsonEx.getMessage());
                                response.setHtmlBody(finalHtmlResponse);
                            }
                            return buildResponseEntity(response, null);
                        } catch (Exception parseError) {
                            logger.error("❌ Thymeleaf parsing error: {}", parseError.getMessage(), parseError);
                            logger.error("Template content preview (first 500 chars): {}",
                                    initialHtmlContent.substring(0, Math.min(500, initialHtmlContent.length())));
                            response.set("code", 500);
                            response.setHtmlBody("<html><body><h2>Lỗi parse template: " + parseError.getMessage() + "</h2></body></html>");
                            return buildResponseEntity(response, null);
                        }

                    } else {
                        logger.warn("Tệp tin React template không tồn tại hoặc không hợp lệ: {}", reactTemplatePath);
                        response.set("code", 404);
                        response.setHtmlBody("<html><body><h2>Tệp tin " + reactTemplatePath
                                + " không tồn tại hoặc không hợp lệ.</h2></body></html>");
                    }
                    } finally {
                        // \ud83d\udd34 ALWAYS release semaphore permit để tránh deadlock
                        ssrSemaphore.release();
                        logger.debug("ud83dudfe2 SSR semaphore released, available permits: {}", ssrSemaphore.availablePermits());
                    }
                } // ===== KẾT THÚC BỔ SUNG LOGIC CHO SSR VỚI REACT =====
                else {
                    // Sử dụng lại biến templateData đã khai báo ở trên
                    templateData.put("req", request);
                    templateData.put("res", response);
                    templateData.put("protocol", protocol);
                    templateData.put("host", hostHeader);
                    templateData.put("url", normalizedPath);

                    templateData.put("phone", RecordManager.PHONE);
                    templateData.put("writeby", RecordManager.WRITEBY);
                    templateData.put("app_type", appType);
                    templateData.put("randval", (int) (Math.random() * (100000000 - 100000 + 1)) + 100000);

                    if (p_type == 1 && "web".equalsIgnoreCase(appType)) {
                        processWebPageData(templateData, f_do, domain, fullUrl, normalizedPath, protocol, hostHeader);
                    } else {
                        Map<String, Object> metas = new HashMap<>();
                        metas.put("url", fullUrl);
                        metas.put("site_name", String.format("%s://%s", protocol, hostHeader));
                        metas.put("year_now", Calendar.getInstance().get(Calendar.YEAR));
                        metas.put("title", "Không tìm thấy trang");
                        String f_keyword = (String) selectedRoute.getOrDefault("f_keyword", "Không tìm thấy trang");
                        String f_logo = (String) selectedRoute.getOrDefault("f_logo", "app_images/csm/icon.png");
                        String f_title = (String) selectedRoute.getOrDefault("f_title", "Không tìm thấy trang");
                        templateData.put("f_keyword", f_keyword);
                        templateData.put("f_logo", f_logo);
                        templateData.put("f_title", f_title);
                        templateData.put("meta", metas);
                        templateData.put("menus", new ArrayList<>());
                        templateData.put("baseHref", "../");
                    }
                    renderPage(response, f_do, p_type, templateData);
                }
            } else {
                logger.error("Không tìm thấy tuyến đường nào cho đường dẫn: {}", normalizedPath);
                response.set("code", 404);
                response.setHtmlBody("<html><body><h2>Không tìm thấy trang.</h2></body></html>");
            }
        } catch (Exception e) {
            logger.error("❌ Lỗi xử lý Web request: {}", e.getMessage(), e);
            response.set("code", 500);
            response.setHtmlBody("<html><body><h2>Lỗi hệ thống nội bộ: " + e.getMessage() + "</h2></body></html>");
        } finally {
            // 🔴 CRITICAL: Always release semaphore permit
            if (acquired) {
                ssrSemaphore.release();
            }
        }

        return buildResponseEntity(response, null);
    }

    /**
     * Serve and optimize legacy static images requested directly under /app_images/... (uploads before /images.shtml).
     * Applies optional resize/quality params and caches transformed output on disk.
     */
    private static final int LEGACY_IMG_AUTO_MAX_WIDTH = 1200; // hard cap for hero images
    private static final int LEGACY_IMG_BASELINE_WIDTH = 600;  // aggressive downscale: 960→600 for mobile-first
    private static final long LEGACY_IMG_MIN_OPT_BYTES = 40 * 1024; // lower threshold to also shrink medium thumbs
    private static final double LEGACY_IMG_DEFAULT_QUALITY = 0.82; // JPEG quality
    private static final double LEGACY_IMG_PNG_QUALITY = 0.60;     // PNG quality: aggressive compression
    private static final int[] PRECOMPUTE_WIDTHS = new int[] { 480, 600, 800, 1080 }; // mobile-first widths
    // Thumbnailator build on server lacks native AVIF/WEBP encoders → constrain to JPEG/PNG to avoid runtime errors
    private static final boolean SUPPORTS_WEBP = false;
    private static final boolean SUPPORTS_AVIF = false;
    // Cache version: increment when changing optimization logic to force new files (e.g. PNG→JPEG conversion)
    private static final String CACHE_VERSION = "v4"; // v4: 600px baseline + PNG quality 60% (aggressive)

    private ResponseEntity<byte[]> serveOptimizedLegacyImage(String normalizedPath, Map<String, String> queryParams, HttpServletRequest request) {
        try {
            String relPath = normalizedPath.substring("/app_images/".length());
            if (relPath.isEmpty()) return null;

            int firstSlash = relPath.indexOf('/');
            if (firstSlash <= 0) return null;
            String appId = relPath.substring(0, firstSlash);
            String imageName = relPath.substring(firstSlash + 1);
            if (imageName.isEmpty()) return null;

            Path imageFilePath = Paths.get(appDataDir, "public", "app_images", appId, imageName);
            File imageFile = imageFilePath.toFile();
            if (!imageFile.exists() || !imageFile.isFile()) {
                return null;
            }

            String widthParam = queryParams.getOrDefault("w", queryParams.getOrDefault("width", null));
            String qualityParam = queryParams.getOrDefault("q", queryParams.getOrDefault("quality", null));

            String contentType = Files.probeContentType(imageFilePath);
            String lowerCaseName = imageName.toLowerCase();
            if (contentType == null) {
                if (lowerCaseName.endsWith(".png")) contentType = "image/png";
                else if (lowerCaseName.endsWith(".jpg") || lowerCaseName.endsWith(".jpeg")) contentType = "image/jpeg";
                else if (lowerCaseName.endsWith(".gif")) contentType = "image/gif";
                else if (lowerCaseName.endsWith(".svg")) contentType = "image/svg+xml";
                else if (lowerCaseName.endsWith(".webp")) contentType = "image/webp";
                else contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
            }

            int targetWidth = 0;
            if (widthParam != null) {
                try {
                    targetWidth = Math.max(0, Math.min(2000, Integer.parseInt(widthParam)));
                } catch (NumberFormatException ignored) {
                    targetWidth = 0;
                }
            }
            double quality = LEGACY_IMG_DEFAULT_QUALITY;
            if (qualityParam != null) {
                try {
                    int q = Integer.parseInt(qualityParam);
                    if (q >= 30 && q <= 95) {
                        quality = q / 100.0;
                    }
                } catch (NumberFormatException ignored) {
                    quality = 0.82;
                }
            }

            byte[] content = null; // ensure definite assignment for all code paths
            boolean transformed = false;
            boolean pngHasAlpha = false; // detect alpha channel once; shared scope for logic below

            if (!"image/svg+xml".equalsIgnoreCase(contentType)) {
                String lowerContent = contentType.toLowerCase();
                boolean isPng = lowerContent.contains("png");
                boolean isJpeg = lowerContent.contains("jpeg") || lowerContent.contains("jpg");
                boolean isGif = lowerContent.contains("gif");

                long fileSizeBytes = 0L;
                try {
                    fileSizeBytes = Files.size(imageFilePath);
                } catch (IOException ignored) { }

                boolean transformRequested = (targetWidth > 0)
                    || (qualityParam != null)
                    || isJpeg // always re-compress JPEGs to cap quality
                    || (isPng && fileSizeBytes > LEGACY_IMG_MIN_OPT_BYTES); // auto-convert PNGs above threshold

                BufferedImage probedImage = null;
                if (transformRequested) {
                    try {
                        probedImage = ImageIO.read(imageFile);
                        if (probedImage != null) {
                            pngHasAlpha = probedImage.getColorModel().hasAlpha();
                            if (targetWidth == 0 && (isPng || isJpeg)) {
                                int w = probedImage.getWidth();
                                int autoW = Math.min(LEGACY_IMG_BASELINE_WIDTH, w);
                                if (w > LEGACY_IMG_AUTO_MAX_WIDTH) {
                                    autoW = LEGACY_IMG_AUTO_MAX_WIDTH;
                                }
                                targetWidth = autoW;
                            }
                        }
                    } catch (Exception e) {
                        logger.debug("⚠️ Không đọc được kích thước/alpha ảnh {} để auto-resize: {}", imageName, e.getMessage());
                    }
                }

                if (!transformRequested) {
                    content = Files.readAllBytes(imageFilePath);
                } else {
                    String safeName = imageName.replaceAll("[\\/]+", "_");
                    int qInt = (int) Math.round(quality * 100);
                    String acceptHeader = request.getHeader("Accept");
                    // Disable AVIF/WEBP output because encoder is unavailable in current runtime
                    boolean wantsAvif = SUPPORTS_AVIF && acceptHeader != null && acceptHeader.toLowerCase().contains("image/avif");
                    boolean wantsWebp = SUPPORTS_WEBP && acceptHeader != null && acceptHeader.toLowerCase().contains("image/webp");

                    // Try to reuse a precomputed variant (optimize once) to avoid repeat CPU work
                    int desiredWidth = targetWidth > 0 ? targetWidth : (probedImage != null ? Math.min(Math.max(LEGACY_IMG_BASELINE_WIDTH, Math.min(probedImage.getWidth(), LEGACY_IMG_AUTO_MAX_WIDTH)), LEGACY_IMG_AUTO_MAX_WIDTH) : LEGACY_IMG_BASELINE_WIDTH);
                    byte[] precomputed = tryLoadPrecomputedVariant(appId, safeName, desiredWidth, wantsAvif, wantsWebp);
                    if (precomputed != null) {
                        content = precomputed;
                        transformed = true;
                        contentType = wantsAvif ? "image/avif" : (wantsWebp ? "image/webp" : contentType);
                        targetWidth = desiredWidth;
                    } else {
                        // If no cached variant exists, precompute a small set once and then retry fetch
                        precomputeImageVariants(appId, imageName, imageFilePath);
                        precomputed = tryLoadPrecomputedVariant(appId, safeName, desiredWidth, wantsAvif, wantsWebp);
                        if (precomputed != null) {
                            content = precomputed;
                            transformed = true;
                            contentType = wantsAvif ? "image/avif" : (wantsWebp ? "image/webp" : contentType);
                            targetWidth = desiredWidth;
                        }
                    }

                    if (transformed) {
                        // already served precomputed
                    } else {
                        String outExt;
                        if (isGif) {
                            outExt = "gif"; // keep GIF to avoid animation loss
                        } else if (isPng && !pngHasAlpha) {
                            outExt = "jpg"; contentType = "image/jpeg"; // convert opaque PNG to JPEG to shrink size
                        } else if (isPng) {
                            outExt = "png"; // keep PNG when transparency is needed
                        } else {
                            outExt = "jpg"; contentType = "image/jpeg";
                        }

                        Path cacheDir = Paths.get(appDataDir, "public", "app_images_cache", appId);
                        Files.createDirectories(cacheDir);
                        String cacheFileName = (targetWidth > 0 ? ("w" + targetWidth) : "orig") + "_q" + qInt + "_fmt" + outExt + "_" + CACHE_VERSION + "_" + safeName + "." + outExt;
                        Path cachePath = cacheDir.resolve(cacheFileName);
                        String cacheKey = cachePath.toString();
                        Object lock = imageProcessLocks.computeIfAbsent(cacheKey, k -> new Object());

                        synchronized (lock) {
                            if (Files.exists(cachePath) && Files.getLastModifiedTime(cachePath).toMillis() >= imageFile.lastModified()) {
                                content = Files.readAllBytes(cachePath);
                                transformed = true;
                            } else {
                                BufferedImage sourceImage = probedImage != null ? probedImage : ImageIO.read(imageFile);
                                if (sourceImage != null) {
                                    int originalWidth = sourceImage.getWidth();
                                    int originalHeight = sourceImage.getHeight();
                                    int newWidth = targetWidth > 0 ? Math.min(targetWidth, originalWidth) : originalWidth;
                                    int newHeight = (int) Math.round((double) originalHeight * newWidth / Math.max(1, originalWidth));

                                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                    Thumbnails.Builder<BufferedImage> builder = Thumbnails.of(sourceImage)
                                            .size(newWidth, newHeight)
                                            .outputQuality(quality);

                                    if ("png".equals(outExt)) builder.outputFormat("png");
                                    else if ("gif".equals(outExt)) builder.outputFormat("gif");
                                    else builder.outputFormat("jpg");

                                    builder.toOutputStream(baos);
                                    content = baos.toByteArray();
                                    transformed = true;

                                    Files.write(cachePath, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                                } else {
                                    content = Files.readAllBytes(imageFilePath);
                                }
                            }
                        }
                    }
                }
            } else {
                content = Files.readAllBytes(imageFilePath);
            }

            if (content == null) { // safety fallback
                content = Files.readAllBytes(imageFilePath);
            }

            long lastModified = imageFile.lastModified();
            int qIntForTag = (int) Math.round(quality * 100);
            int wForTag = Math.max(0, targetWidth);
            String eTag = "\"" + Long.toHexString(lastModified) + "-" + content.length + "-w" + wForTag + "-q" + qIntForTag + "-ct" + contentType + "\"";

            String ifNoneMatch = request.getHeader("If-None-Match");
            if (ifNoneMatch != null && ifNoneMatch.equals(eTag)) {
                return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                        .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                        .header(HttpHeaders.ETAG, eTag)
                        .header(HttpHeaders.LAST_MODIFIED, String.valueOf(lastModified))
                        .header("Vary", "Accept, Accept-Encoding")
                        .header("X-Content-Type-Options", "nosniff")
                        .build();
            }

            logger.info("✅ Legacy image served {} (optimized: {}, size: {}KB) Content-Type: {}", imageFilePath, transformed, content.length / 1024, contentType);

            return ResponseEntity.ok()
                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                    .header(HttpHeaders.ETAG, eTag)
                    .header(HttpHeaders.LAST_MODIFIED, String.valueOf(lastModified))
                    .header("Vary", "Accept, Accept-Encoding")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Age", "0")
                    .contentType(MediaType.parseMediaType(contentType))
                    .contentLength(content.length)
                    .lastModified(lastModified)
                    .eTag(eTag)
                    .body(content);
        } catch (Exception ex) {
            logger.error("❌ Lỗi tối ưu ảnh legacy {}: {}", normalizedPath, ex.getMessage(), ex);
            return null;
        }
    }

    /**
     * Precompute a small set of optimized variants on upload to avoid on-demand CPU spikes.
     * Generates WebP/JPEG/PNG derivatives in app_images_cache/{appId} for widths [480, 750, 1080, 1200].
     */
    private void precomputeImageVariants(String appId, String imageName, Path imageFilePath) {
        try {
            File imageFile = imageFilePath.toFile();
            if (!imageFile.exists() || !imageFile.isFile()) return;

            String contentType = Files.probeContentType(imageFilePath);
            if (contentType == null) contentType = "image/jpeg";
            if ("image/svg+xml".equalsIgnoreCase(contentType) || contentType.toLowerCase().contains("gif")) {
                return; // skip SVG/GIF
            }

            BufferedImage sourceImage = ImageIO.read(imageFile);
            if (sourceImage == null) return;
            int originalWidth = sourceImage.getWidth();
            int originalHeight = sourceImage.getHeight();
            
            // Detect alpha channel to decide PNG vs JPEG output
            boolean hasAlpha = sourceImage.getColorModel().hasAlpha();
            boolean isPng = contentType.toLowerCase().contains("png");

            // Use lower quality for PNG to reduce size (70% vs 82% for JPEG)
            double quality = isPng ? LEGACY_IMG_PNG_QUALITY : LEGACY_IMG_DEFAULT_QUALITY;
            int qInt = (int) Math.round(quality * 100);

            Path cacheDir = Paths.get(appDataDir, "public", "app_images_cache", appId);
            Files.createDirectories(cacheDir);
            String safeName = imageName.replaceAll("[\\/]+", "_");

            for (int w : PRECOMPUTE_WIDTHS) {
                int targetW = Math.min(w, originalWidth);
                int targetH = (int) Math.round((double) originalHeight * targetW / Math.max(1, originalWidth));

                // PNG variant if source has alpha (preserve transparency)
                if (isPng && hasAlpha) {
                    // Use PNG-specific quality for better compression
                    int pngQInt = (int) Math.round(LEGACY_IMG_PNG_QUALITY * 100);
                    Path pngPath = cacheDir.resolve("w" + targetW + "_q" + pngQInt + "_fmtpng_" + CACHE_VERSION + "_" + safeName + ".png");
                    if (!Files.exists(pngPath) || Files.getLastModifiedTime(pngPath).toMillis() < imageFile.lastModified()) {
                        try {
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            Thumbnails.of(sourceImage).size(targetW, targetH).outputQuality(LEGACY_IMG_PNG_QUALITY).outputFormat("png").toOutputStream(baos);
                            Files.write(pngPath, baos.toByteArray(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                        } catch (Exception e) {
                            logger.warn("⚠️ Không tạo được PNG cho {} w{}: {}", imageName, targetW, e.getMessage());
                        }
                    }
                }

                // JPEG variant (primary for opaque images or fallback)
                if (!hasAlpha || !isPng) {
                    int jpgQInt = (int) Math.round(LEGACY_IMG_DEFAULT_QUALITY * 100);
                    Path jpgPath = cacheDir.resolve("w" + targetW + "_q" + jpgQInt + "_fmtjpg_" + CACHE_VERSION + "_" + safeName + ".jpg");
                    if (!Files.exists(jpgPath) || Files.getLastModifiedTime(jpgPath).toMillis() < imageFile.lastModified()) {
                        try {
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            Thumbnails.of(sourceImage).size(targetW, targetH).outputQuality(LEGACY_IMG_DEFAULT_QUALITY).outputFormat("jpg").toOutputStream(baos);
                            Files.write(jpgPath, baos.toByteArray(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                        } catch (Exception e) {
                            logger.warn("⚠️ Không tạo được JPEG cho {} w{}: {}", imageName, targetW, e.getMessage());
                        }
                    }
                }
            }

            logger.info("✅ Precomputed variants cho {}/{} ({}x{}, alpha: {}, quality: {}%)", appId, imageName, originalWidth, originalHeight, hasAlpha, qInt);
        } catch (Exception e) {
            logger.warn("⚠️ Lỗi precompute variants cho {}/{}: {}", appId, imageName, e.getMessage());
        }
    }

    // Try to load a precomputed variant that fits the requested width and preferred format (AVIF/WebP/JPEG/PNG)
    private byte[] tryLoadPrecomputedVariant(String appId, String safeName, int desiredWidth, boolean prefersAvif, boolean prefersWebp) {
        try {
            if (desiredWidth <= 0) return null;
            Path cacheDir = Paths.get(appDataDir, "public", "app_images_cache", appId);
            if (!Files.isDirectory(cacheDir)) return null;

            // pick closest width not smaller than desired, otherwise largest available
            int bestWidth = PRECOMPUTE_WIDTHS[PRECOMPUTE_WIDTHS.length - 1];
            for (int w : PRECOMPUTE_WIDTHS) {
                if (w >= desiredWidth) { bestWidth = w; break; }
            }

            // Try to find precomputed variants in priority order: v2 formats first (newer), then fallback to old
            // Pattern: w{width}_q82_fmt{format}_{version}_{safeName}.{ext}
            String[] formatChecks = new String[] {
                // Try v2 JPEG first (opaque PNG converted to JPEG)
                "jpg_" + CACHE_VERSION + "_" + safeName + ".jpg",
                // Try v2 PNG (PNG with alpha, resized/compressed)
                "png_" + CACHE_VERSION + "_" + safeName + ".png",
                // Fallback to old formats without version
                "jpg_" + safeName + ".jpg",
                "png_" + safeName + ".png"
            };

            for (String formatSuffix : formatChecks) {
                Path candidate = cacheDir.resolve("w" + bestWidth + "_q82_fmt" + formatSuffix);
                if (Files.exists(candidate)) {
                    return Files.readAllBytes(candidate);
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    /**
     * Tạo nội dung robots.txt động cho từng domain
     */
    private String generateDynamicRobotsTxt(String hostHeader, String protocol) {
        StringBuilder robotsTxt = new StringBuilder();
        robotsTxt.append("User-agent: *\n");
        robotsTxt.append("Allow: /\n");
        robotsTxt.append("Disallow: /admin/\n");
        robotsTxt.append("Disallow: /api/\n");
        robotsTxt.append("Disallow: /upload.shtml\n");
        // ✅ REMOVED: Disallow: /images.shtml (không sử dụng - frontend dùng /app_images/ trực tiếp)
        robotsTxt.append("\n");
        
        // Thêm sitemap URL động
        robotsTxt.append("Sitemap: ").append(protocol).append("://").append(hostHeader).append("/sitemap.xml\n");
        
        // 🔥 Thêm RSS feed URL để Google ghé thăm nhanh
        robotsTxt.append("Sitemap: ").append(protocol).append("://").append(hostHeader).append("/feed.xml\n");
        
        return robotsTxt.toString();
    }

    /**
     * Tạo RSS feed động để Google index nhanh hơn
     * RSS feed lấy từ sitemap paths - 20-50 items mới nhất
     */
    private String generateRssFeed(String hostHeader, String protocol) {
        StringBuilder feed = new StringBuilder();
        feed.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        feed.append("<rss version=\"2.0\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\">\n");
        feed.append("  <channel>\n");
        
        // Channel metadata
        String baseUrl = protocol + "://" + hostHeader;
        feed.append("    <title>").append(hostHeader).append(" - Latest Updates</title>\n");
        feed.append("    <link>").append(baseUrl).append("</link>\n");
        feed.append("    <description>Latest content updates</description>\n");
        feed.append("    <language>vi</language>\n");
        feed.append("    <lastBuildDate>").append(DateTimeFormatter.RFC_1123_DATE_TIME.format(java.time.ZonedDateTime.now())).append("</lastBuildDate>\n");
        
        try {
            // Extract domain từ hostHeader
            String domain = hostHeader == null ? "" : hostHeader.replace("www.", "").trim();
            int portIdx = domain.indexOf(":");
            if (portIdx > 0) {
                domain = domain.substring(0, portIdx);
            }
            
            // Lấy sitemap paths (đây là source of truth)
            Map<String, String> sitemapPaths = collectSitemapPathsFromDb(domain);
            logger.info("🔥 RSS: Collected {} paths từ sitemap", sitemapPaths.size());
            
            // Convert to list, sort by lastmod descending, lấy 50 items gần đây nhất
            List<Map.Entry<String, String>> pathList = new ArrayList<>(sitemapPaths.entrySet());
            
            // Sort by lastmod descending (newest first)
            pathList.sort((a, b) -> {
                String lastmodA = a.getValue();
                String lastmodB = b.getValue();
                // Extract numeric part for comparison (yyyy-MM-dd or timestamp)
                try {
                    long timeA = lastmodA != null && !lastmodA.isEmpty() ? 
                        java.time.LocalDate.parse(extractDateOnly(lastmodA)).toEpochDay() : 0;
                    long timeB = lastmodB != null && !lastmodB.isEmpty() ? 
                        java.time.LocalDate.parse(extractDateOnly(lastmodB)).toEpochDay() : 0;
                    return Long.compare(timeB, timeA); // Descending
                } catch (Exception e) {
                    return 0;
                }
            });
            
            // Thêm items vào feed (max 50, exclude homepage)
            int count = 0;
            for (Map.Entry<String, String> entry : pathList) {
                if (count >= 50) break;
                
                String path = entry.getKey();
                String lastmod = entry.getValue();
                
                // Skip homepage - RSS feed focus trên content pages
                if ("/".equals(path)) {
                    continue;
                }
                
                // Convert path to URL (remove .shtml extension for title)
                String url = baseUrl + path;
                String title = generateTitleFromPath(path);
                
                // ✅ Tạo description có ý nghĩa từ title và path
                String description = generateDescriptionFromPath(path, title);
                
                feed.append("    <item>\n");
                feed.append("      <title>").append(escapeXml(title)).append("</title>\n");
                feed.append("      <link>").append(escapeXml(url)).append("</link>\n");
                feed.append("      <description>").append(escapeXml(description)).append("</description>\n");
                
                // ✅ GUID: Unique identifier cho mỗi item (sử dụng URL làm GUID duy nhất)
                // isPermaLink="true" báo cho RSS reader biết đây là URL thật
                feed.append("      <guid isPermaLink=\"true\">").append(escapeXml(url)).append("</guid>\n");
                
                // ✅ pubDate: Định dạng RFC 822 với thời gian phân tán (+0700 timezone Việt Nam)
                // Phân tán thời gian: mỗi bài cách nhau 5-10 phút để tránh spam detection
                String pubDate;
                if (lastmod != null && !lastmod.isEmpty()) {
                    try {
                        // Parse lastmod (yyyy-MM-dd) và convert sang RFC 822 format
                        java.time.LocalDate date = java.time.LocalDate.parse(extractDateOnly(lastmod));
                        
                        // ✅ Phân tán thời gian trong ngày:
                        // - Item 0: 08:00 (8AM)
                        // - Item 1: 08:07 (thêm 7 phút)
                        // - Item 2: 08:14 (thêm 7 phút nữa)
                        // Công thức: 8 giờ sáng + (count * 7 phút) để phân bố đều trong ngày
                        int baseHour = 8;  // Bắt đầu từ 8 giờ sáng
                        int minuteOffset = count * 7;  // Mỗi bài cách nhau 7 phút
                        int totalMinutes = (baseHour * 60) + minuteOffset;
                        int hours = (totalMinutes / 60) % 24;  // Wrap around nếu vượt 24h
                        int minutes = totalMinutes % 60;
                        
                        // Tạo ZonedDateTime với giờ phân tán, múi giờ Việt Nam
                        java.time.ZonedDateTime zonedDateTime = date
                            .atTime(hours, minutes, 0)
                            .atZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
                        
                        // Format theo RFC 1123 (RFC 822): "Sat, 24 Jan 2026 16:30:00 +0700"
                        pubDate = DateTimeFormatter.RFC_1123_DATE_TIME.format(zonedDateTime);
                    } catch (Exception e) {
                        // Fallback: dùng current time với offset phân tán
                        logger.warn("Failed to parse lastmod '{}', using current time with offset", lastmod);
                        pubDate = DateTimeFormatter.RFC_1123_DATE_TIME.format(
                            java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"))
                                .minusMinutes(count * 7)  // Offset ngược về quá khứ
                        );
                    }
                } else {
                    // Nếu không có lastmod, dùng current time với offset phân tán
                    pubDate = DateTimeFormatter.RFC_1123_DATE_TIME.format(
                        java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"))
                            .minusMinutes(count * 7)  // Offset ngược về quá khứ
                    );
                }
                feed.append("      <pubDate>").append(pubDate).append("</pubDate>\n");
                
                feed.append("    </item>\n");
                count++;
            }
            
            logger.info("✅ RSS: Generated {} items", count);
        } catch (Exception e) {
            logger.error("❌ RSS: Lỗi khi tạo feed: {}", e.getMessage(), e);
        }
        
        feed.append("  </channel>\n");
        feed.append("</rss>");
        
        return feed.toString();
    }

    /**
     * Generate title từ URL path
     * /slug.shtml -> "Slug"
     * /service_type/slug.shtml -> "Service Type - Slug"
     */
    private String generateTitleFromPath(String path) {
        try {
            // Remove leading/trailing slashes và .shtml extension
            String cleaned = path.replaceAll("^/|/$", "").replace(".shtml", "");
            if (cleaned.isEmpty()) {
                return "Home";
            }
            
            // Split by / để lấy các segments
            String[] parts = cleaned.split("/");
            List<String> segments = new ArrayList<>();
            
            for (String part : parts) {
                if (!part.isEmpty()) {
                    // Convert kebab-case to Title Case
                    String[] words = part.split("-");
                    StringBuilder titlePart = new StringBuilder();
                    for (String word : words) {
                        if (!word.isEmpty()) {
                            titlePart.append(word.substring(0, 1).toUpperCase())
                                    .append(word.substring(1).toLowerCase())
                                    .append(" ");
                        }
                    }
                    segments.add(titlePart.toString().trim());
                }
            }
            
            // Join segments with " - " separator
            return String.join(" - ", segments);
        } catch (Exception e) {
            return path;
        }
    }

    /**
     * Generate description từ URL path và title cho RSS feed
     * Tạo mô tả có ý nghĩa thay vì "Latest update"
     * 
     * @param path URL path (ví dụ: /bat-dong-san/ban-nha-quan-7.shtml)
     * @param title Title đã được generate (ví dụ: "Bat Dong San - Ban Nha Quan 7")
     * @return Description có ý nghĩa cho RSS item
     */
    private String generateDescriptionFromPath(String path, String title) {
        try {
            // Phân tích path để tạo description phù hợp
            String cleaned = path.replaceAll("^/|/$", "").replace(".shtml", "");
            
            if (cleaned.isEmpty()) {
                return "Trang chủ - Cập nhật thông tin mới nhất";
            }
            
            // Phân tích service_type từ path (phần đầu tiên trước /)
            String[] parts = cleaned.split("/");
            String serviceType = parts.length > 0 ? parts[0] : "";
            
            // Tạo description dựa trên service_type
            String description;
            if (serviceType.contains("bat-dong-san") || serviceType.contains("nha-dat")) {
                description = "Thông tin chi tiết về " + title.toLowerCase() + 
                    ". Cập nhật mới nhất về địa chỉ, diện tích, giá cả và các thông tin liên quan.";
            } else if (serviceType.contains("dich-vu")) {
                description = "Dịch vụ " + title.toLowerCase() + 
                    ". Thông tin chi tiết, giá cả và liên hệ.";
            } else if (serviceType.contains("tin-tuc") || serviceType.contains("blog")) {
                description = "Bài viết về " + title.toLowerCase() + 
                    ". Đọc ngay để cập nhật thông tin mới nhất.";
            } else {
                // Default description cho các trường hợp khác
                description = title + " - Xem thông tin chi tiết, cập nhật mới nhất về " + 
                    title.toLowerCase() + ".";
            }
            
            // Giới hạn độ dài description (Google khuyến nghị 150-160 ký tự)
            if (description.length() > 160) {
                description = description.substring(0, 157) + "...";
            }
            
            return description;
        } catch (Exception e) {
            // Fallback: dùng title làm description
            return title + " - Xem thông tin chi tiết.";
        }
    }

    // --- Google Ping helpers ---
    private void triggerGoogleFeedPing(String feedUrl, String domain) {
        try {
            long now = System.currentTimeMillis();
            Long last = FEED_PING_CACHE.get(domain);
            if (last != null) {
                // Dùng timezone VN để tính ngày, đảm bảo mỗi domain chỉ ping 1 lần/ngày và cách nhau tối thiểu 4 tiếng
                java.time.ZoneId zone = java.time.ZoneId.of("Asia/Ho_Chi_Minh");
                java.time.LocalDate today = java.time.LocalDate.now(zone);
                java.time.LocalDate lastDate = java.time.Instant.ofEpochMilli(last).atZone(zone).toLocalDate();
                long sinceLast = now - last;

                if (today.equals(lastDate)) {
                    logger.debug("Skip Google feed ping cho domain {} (đã ping trong ngày hôm nay)", domain);
                    return;
                }

                if (sinceLast < FEED_PING_INTERVAL_MS) {
                    logger.debug("Skip Google feed ping cho domain {} (chưa đủ 4 tiếng)", domain);
                    return;
                }
            }
            FEED_PING_CACHE.put(domain, now);
            FEED_PING_EXECUTOR.submit(() -> pingGoogleFeed(feedUrl, domain));
        } catch (Exception e) {
            logger.warn("Could not schedule Google feed ping: {}", e.getMessage());
        }
    }

    private void pingGoogleFeed(String feedUrl, String domain) {
        String pingUrl;
        try {
            String encoded = URLEncoder.encode(feedUrl, StandardCharsets.UTF_8);
            pingUrl = "https://www.google.com/ping?sitemap=" + encoded;
        } catch (Exception e) {
            logger.warn("Failed to encode feed URL for ping: {}", e.getMessage());
            return;
        }

        HttpURLConnection conn = null;
        try {
            java.net.URL url = new java.net.URL(pingUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            int status = conn.getResponseCode();
            if (status == 200) {
                logger.info("✅ Ping Google feed thành công cho domain {}", domain);
            } else {
                logger.warn("⚠️ Ping Google feed trả về mã {} cho domain {}", status, domain);
            }
        } catch (Exception e) {
            logger.warn("⚠️ Ping Google feed thất bại cho domain {}: {}", domain, e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * Helper class: App + Table configuration từ sys_la_routers
     */
    private static class AppTableConfig {
        final String appId;
        final String tblServices;
        final String tblServiceDetail;
        
        AppTableConfig(String appId, String tblServices, String tblServiceDetail) {
            this.appId = appId;
            this.tblServices = tblServices;
            this.tblServiceDetail = tblServiceDetail;
        }
    }

    /**
     * Collect sitemap paths from database: tbl_services (categories) + tbl_service_detail (details)
     * Filter: status=active + domain LIKE
     * Returns: Map<path, lastmod>
     */
    private Map<String, String> collectSitemapPathsFromDb(String domain) {
        Map<String, String> pathLastmod = new LinkedHashMap<>();
        if (recordManager == null || domain == null) {
            logger.warn("⚠️ Sitemap: recordManager hoặc domain null - recordManager={}, domain={}", recordManager, domain);
            return pathLastmod;
        }

        logger.info("🔍 Sitemap: Collecting paths from DB for domain={}", domain);
        Set<AppTableConfig> configs = resolveAppTableConfigs(domain);
        logger.info("🔍 Sitemap: Found {} app configs for domain={}", configs.size(), domain);
        
        for (AppTableConfig cfg : configs) {
            try {
                Map<String, String> cats = loadCategoryPaths(cfg, domain);
                Map<String, String> details = loadDetailPaths(cfg, domain);
                pathLastmod.putAll(cats);
                pathLastmod.putAll(details);
                logger.info("✅ Sitemap DB paths for domain {} appId {}: categories={}, details={}",
                        domain, cfg.appId, cats.size(), details.size());
            } catch (Exception ex) {
                logger.warn("⚠️ Sitemap: Bỏ qua appId={} do lỗi {}", cfg.appId, ex.getMessage());
            }
        }
        return pathLastmod;
    }

    /**
     * Resolve app/table configurations từ sys_la_routers
     * Query: domain_name = domain, run = 1
     * Fallback: domain_name = '' nếu không có match
     */
    private Set<AppTableConfig> resolveAppTableConfigs(String domain) {
        Set<AppTableConfig> configs = new LinkedHashSet<>();
        try {
            logger.info("🔍 Sitemap: Querying sys_la_routers for domain={}", domain);
            
            SearchFilter filter = new SearchFilter();
            filter.setOperator("AND");
            filter.setConditions(List.of(
                    RecordManager.createCondition("domain_name", "eq", domain),
                    RecordManager.createCondition("run", "eq", 1)));
            
            Map<String, Object> res = recordManager.filter("csm", "sys_la_routers", filter);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getOrDefault("rows", new ArrayList<>());
            logger.info("🔍 Sitemap: sys_la_routers query returned {} rows for domain={}", rows.size(), domain);
            
            for (Map<String, Object> row : rows) {
                String appId = safeStr(row.get("app_id"));
                String tblServices = safeStr(row.get("tbl_services"));
                String tblServiceDetail = safeStr(row.get("tbl_service_detail"));
                if (!appId.isEmpty() && !tblServices.isEmpty() && !tblServiceDetail.isEmpty()) {
                    configs.add(new AppTableConfig(appId, tblServices, tblServiceDetail));
                }
            }
            
            // Fallback: try with empty domain
            if (configs.isEmpty()) {
                logger.info("🔍 Sitemap: No configs for domain={}, trying fallback (domain_name='')", domain);
                
                SearchFilter fallback = new SearchFilter();
                fallback.setOperator("AND");
                fallback.setConditions(List.of(
                        RecordManager.createCondition("domain_name", "eq", ""),
                        RecordManager.createCondition("run", "eq", 1)));
                
                Map<String, Object> fallbackRes = recordManager.filter("csm", "sys_la_routers", fallback);
                List<Map<String, Object>> fallbackRows = (List<Map<String, Object>>) fallbackRes.getOrDefault("rows", new ArrayList<>());
                logger.info("🔍 Sitemap: Fallback query returned {} rows", fallbackRows.size());
                
                for (Map<String, Object> row : fallbackRows) {
                    String appId = safeStr(row.get("app_id"));
                    String tblServices = safeStr(row.get("tbl_services"));
                    String tblServiceDetail = safeStr(row.get("tbl_service_detail"));
                    if (!appId.isEmpty() && !tblServices.isEmpty() && !tblServiceDetail.isEmpty()) {
                        configs.add(new AppTableConfig(appId, tblServices, tblServiceDetail));
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("⚠️ Sitemap: Không lấy được app/table cho domain {}: {}", domain, e.getMessage());
        }
        return configs;
    }

    /**
     * Load category paths từ tbl_services
     * Filter: status=active + domain LIKE
     * Path format: /slug.shtml
     */
    private Map<String, String> loadCategoryPaths(AppTableConfig cfg, String domain) {
        Map<String, String> out = new LinkedHashMap<>();
        logger.info("🔍 Sitemap: Loading categories from {}.{} for domain={}", cfg.appId, cfg.tblServices, domain);
        
        SearchFilter filter = new SearchFilter();
        filter.setOperator("AND");
        filter.setConditions(List.of(
                RecordManager.createCondition("status", "eq", "active"),
                RecordManager.createCondition("domain", "like", domain)));
        
        Map<String, Object> res = recordManager.filter(cfg.appId, cfg.tblServices, filter);
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getOrDefault("rows", new ArrayList<>());
        logger.info("🔍 Sitemap: Found {} category rows from {}.{}", rows.size(), cfg.appId, cfg.tblServices);
        
        for (Map<String, Object> row : rows) {
            String slug = sanitizeInput(safeStr(row.get("slug")));
            if (slug.isEmpty()) {
                continue;
            }
            
            String slugNoExt = slug.endsWith(".shtml") ? slug.substring(0, slug.length() - 6) : slug;
            String normalized = sitemapService.normalizePathForSitemap("/" + slugNoExt);
            
            if (!sitemapService.isSitemapEligible(normalized)) {
                continue;
            }
            
            String lastmod = resolveLastmodCandidate(
                    row.get("updated_at"),
                    row.get("publish_date"),
                    row.get("modified_at"),
                    row.get("updatedAt"),
                    row.get("created_at"));
            if (lastmod == null) {
                lastmod = formatIsoDate(System.currentTimeMillis());
            }
            
            out.put(normalized, lastmod);
        }
        
        return out;
    }

    /**
     * Load detail paths từ tbl_service_detail
     * Filter: status=active + domain LIKE
     * Path format: /service_type/slug.shtml
     */
    private Map<String, String> loadDetailPaths(AppTableConfig cfg, String domain) {
        Map<String, String> out = new LinkedHashMap<>();
        logger.info("🔍 Sitemap: Loading details from {}.{} for domain={}", cfg.appId, cfg.tblServiceDetail, domain);
        
        SearchFilter filter = new SearchFilter();
        filter.setOperator("AND");
        filter.setConditions(List.of(
                RecordManager.createCondition("status", "eq", "active"),
                RecordManager.createCondition("domain", "like", domain)));
        
        Map<String, Object> res = recordManager.filter(cfg.appId, cfg.tblServiceDetail, filter);
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getOrDefault("rows", new ArrayList<>());
        logger.info("🔍 Sitemap: Found {} detail rows from {}.{}", rows.size(), cfg.appId, cfg.tblServiceDetail);
        
        for (Map<String, Object> row : rows) {
            String serviceType = sanitizeInput(safeStr(row.get("service_type")));
            String slug = sanitizeInput(safeStr(row.get("slug")));
            if (slug.isEmpty()) {
                continue;
            }
            
            String slugNoExt = slug.endsWith(".shtml") ? slug.substring(0, slug.length() - 6) : slug;
            String rawPath = serviceType.isEmpty()
                    ? "/" + slugNoExt
                    : "/" + serviceType + "/" + slugNoExt;
            
            String normalized = sitemapService.normalizePathForSitemap(rawPath);
            
            if (!sitemapService.isSitemapEligible(normalized)) {
                continue;
            }
            
            String lastmod = resolveLastmodCandidate(
                    row.get("updated_at"),
                    row.get("publish_date"),
                    row.get("modified_at"),
                    row.get("updatedAt"),
                    row.get("created_at"));
            if (lastmod == null) {
                lastmod = formatIsoDate(System.currentTimeMillis());
            }
            
            out.put(normalized, lastmod);
        }
        
        return out;
    }

    /**
     * Resolve lastmod từ các candidate fields
     */
    private String resolveLastmodCandidate(Object... candidates) {
        for (Object candidate : candidates) {
            String iso = toIsoDate(candidate);
            if (iso != null) {
                return iso;
            }
        }
        return null;
    }

    /**
     * Convert object to ISO date string
     */
    private String toIsoDate(Object value) {
        try {
            if (value == null) {
                return null;
            }
            if (value instanceof Number) {
                return formatIsoDate(((Number) value).longValue());
            }
            if (value instanceof Date) {
                return formatIsoDate(((Date) value).getTime());
            }
            if (value instanceof Instant) {
                return formatIsoDate(((Instant) value).toEpochMilli());
            }
            if (value instanceof String) {
                String str = ((String) value).trim();
                if (str.isEmpty()) {
                    return null;
                }
                if (str.matches("^\\d{6,}$")) {
                    return formatIsoDate(Long.parseLong(str));
                }
                try {
                    return SITEMAP_LASTMOD_FORMATTER.format(Instant.parse(str));
                } catch (Exception ignore) {
                    return null;
                }
            }
        } catch (Exception ignore) {
            return null;
        }
        return null;
    }

    /**
     * Format epoch millis to ISO date string
     */
    private String formatIsoDate(long epochMillis) {
        return SITEMAP_LASTMOD_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    /**
     * Build sitemap XML từ DB paths (tbl_services + tbl_service_detail)
     * Logic chính:
     * 1. Extract domain từ hostHeader (loại www)
     * 2. Query sys_la_routers để lấy app_id + table names
     * 3. Query tbl_services (categories) + tbl_service_detail (details) từ DB
     * 4. Filter theo status=active + domain LIKE
     * 5. Build sitemap XML với các slug được chuẩn hóa
     * 6. Tối ưu changefreq và priority:
     *    - Homepage (/): daily, priority 1.0
     *    - Category pages: weekly, priority 0.8
     *    - Detail pages: weekly, priority 0.8
     * Cache 5 phút để tránh overload từ Google crawler
     */
    private String generateSitemapXml(String hostHeader, String protocol, Set<String> visitedPaths, Map<String, String> lastmodMap) {
        long startTime = System.currentTimeMillis();
        StringBuilder sitemap = new StringBuilder();
        sitemap.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sitemap.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");

        String baseUrl = protocol + "://" + hostHeader;

        try {
            // Extract domain từ hostHeader (remove www.)
            String domain = hostHeader == null ? "" : hostHeader.replace("www.", "").trim();
            int portIdx = domain.indexOf(":");
            if (portIdx > 0) {
                domain = domain.substring(0, portIdx);
            }
            
            logger.info("🔍 Sitemap: Generating sitemap for hostHeader={}, domain={}, protocol={}", hostHeader, domain, protocol);

            // ✅ Bước chính: Lấy tất cả paths từ DB (slug từ tbl_services + tbl_service_detail)
            Map<String, String> dbPathLastmod = collectSitemapPathsFromDb(domain);
            logger.info("🔍 Sitemap: collectSitemapPathsFromDb returned {} paths", dbPathLastmod.size());
            
            // ✅ Merge lastmod: từ DB + từ visited paths (nếu có)
            Map<String, String> mergedLastmod = new HashMap<>(dbPathLastmod);
            if (lastmodMap != null && !lastmodMap.isEmpty()) {
                mergedLastmod.putAll(lastmodMap);
            }

            // ✅ Build URL set từ DB paths (đây là source of truth)
            Set<String> paths = new LinkedHashSet<>();
            Set<String> allowedDbPaths = new HashSet<>(dbPathLastmod.keySet());
            
            // Luôn thêm homepage
            paths.add("/");
            
            // Chỉ lấy paths từ DB để đảm bảo sitemap luôn đúng và nhẹ
            paths.addAll(allowedDbPaths);

            logger.info("✅ Sitemap: Tổng {} paths cho domain {} (db={}, visitedIgnored={})", paths.size(), hostHeader,
                    dbPathLastmod.size(), visitedPaths != null ? visitedPaths.size() : 0);

            // Xuất XML
            for (String rawPath : paths) {
                String path = sitemapService.normalizePathForSitemap(rawPath);
                if (!sitemapService.isSitemapEligible(path)) {
                    continue;
                }
                String url = "/".equals(path) ? baseUrl + "/" : baseUrl + path;
                String lastmod = mergedLastmod.get(path);
                
                // Optimize changefreq and priority based on URL type
                String changefreq = "weekly";
                String priority = "0.8";
                
                if ("/".equals(path)) {
                    // Homepage optimization
                    changefreq = "daily";
                    priority = "1.0";
                } else {
                    // Content pages (all use same priority since .shtml removed)
                    changefreq = "weekly";
                    priority = "0.8";
                }
                
                addUrlToSitemap(sitemap, url, lastmod, changefreq, priority);
            }
            
            sitemap.append("\n</urlset>");
        } catch (Exception e) {
            logger.error("❌ Lỗi tạo sitemap XML: {}", e.getMessage(), e);
            sitemap.append("\n</urlset>");
        }

        long duration = System.currentTimeMillis() - startTime;
        logger.info("✅ Sitemap XML sinh ra trong {}ms", duration);
        return sitemap.toString();
    }

    /**
     * Helper method để thêm URL vào sitemap với lastmod
     * Thêm dòng trống giữa các URL để dễ đọc
     */
    private void addUrlToSitemap(StringBuilder sitemap, String url, String lastmod, String changefreq, String priority) {
        sitemap.append("\n  <url>\n");
        sitemap.append("    <loc>").append(escapeXml(url)).append("</loc>\n");
        if (lastmod != null && !lastmod.isEmpty()) {
            // Convert lastmod to date-only format (yyyy-MM-dd)
            String formattedLastmod = extractDateOnly(lastmod);
            sitemap.append("    <lastmod>").append(formattedLastmod).append("</lastmod>\n");
        }
        sitemap.append("    <changefreq>").append(changefreq).append("</changefreq>\n");
        sitemap.append("    <priority>").append(priority).append("</priority>\n");
        sitemap.append("  </url>");
    }

    /**
     * Extract date-only part from lastmod (format to yyyy-MM-dd)
     * Input formats: 2026-01-24T10:30:45+07:00 -> Output: 2026-01-24
     */
    private String extractDateOnly(String lastmod) {
        if (lastmod == null || lastmod.isEmpty()) {
            return "";
        }
        // If already in yyyy-MM-dd format, return as-is
        if (lastmod.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            return lastmod;
        }
        // Try to extract yyyy-MM-dd from datetime string
        if (lastmod.length() >= 10 && lastmod.matches("^\\d{4}-\\d{2}-\\d{2}.*")) {
            return lastmod.substring(0, 10);
        }
        // Fallback: return as-is if cannot parse
        return lastmod;
    }

    /**
     * Escape XML special characters
     */
    private String escapeXml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&apos;");
    }

    /**
     * Build a minimal server-rendered HTML content block for category pages to improve indexability.
     * Includes: heading (title), description paragraph, and up to 10 items (title + short excerpt) with links if available.
     * The block is injected before </body> and is independent of client-side rendering.
     */
    @SuppressWarnings("unchecked")
    private String buildSsrContentHtml(Map<String, Object> initialReactData) {
        if (initialReactData == null || initialReactData.isEmpty()) {
            return "";
        }

        // Resolve title and description
        Map<String, Object> serviceCategory = null;
        Object sc = initialReactData.get("serviceCategory");
        if (sc instanceof Map) {
            serviceCategory = (Map<String, Object>) sc;
        }
        String pageTitle = safeStr(initialReactData.get("pageTitle"));
        String pageDescription = safeStr(initialReactData.get("pageDescription"));
        String catTitle = serviceCategory != null ? safeStr(serviceCategory.getOrDefault("category", serviceCategory.getOrDefault("title", ""))) : "";
        String catDescription = serviceCategory != null ? safeStr(serviceCategory.get("description")) : "";
        String finalTitle = !catTitle.isEmpty() ? catTitle : pageTitle;
        String finalDescription = !pageDescription.isEmpty() ? pageDescription : catDescription;
        // Clean description to plain text and escape
        String cleanDescription = Jsoup.parse(finalDescription == null ? "" : finalDescription).text();
        String escTitle = escapeXml(finalTitle);
        String escDesc = escapeXml(cleanDescription);

        // Resolve list items from serviceDetailList or homeDetailList
        java.util.List<Map<String, Object>> items = new java.util.ArrayList<>();
        Object sdl = initialReactData.get("serviceDetailList");
        Object hdl = initialReactData.get("homeDetailList");
        if (sdl instanceof java.util.List) {
            items = (java.util.List<Map<String, Object>>) sdl;
        } else if (hdl instanceof java.util.List) {
            items = (java.util.List<Map<String, Object>>) hdl;
        }

        StringBuilder listHtml = new StringBuilder();
        int maxItems = Math.min(items.size(), 10);
        for (int i = 0; i < maxItems; i++) {
            Map<String, Object> it = items.get(i);
            String t = safeStr(it.get("title"));
            if (t.isEmpty()) t = safeStr(it.get("title_vi"));
            String ex = safeStr(it.get("excerpt"));
            if (ex.isEmpty()) ex = safeStr(it.get("excerpt_vi"));
            String escT = escapeXml(Jsoup.parse(t).text());
            String escEx = escapeXml(Jsoup.parse(ex).text());
            // Try building a link if serviceType/slug present
            String serviceType = safeStr(it.get("serviceType"));
            if (serviceType.isEmpty()) serviceType = safeStr(it.get("service_type"));
            String slug = safeStr(it.get("slug"));
            String href = "";
            if (!serviceType.isEmpty() && !slug.isEmpty()) {
                href = "/" + serviceType + "/" + slug + ".shtml";
            }
            listHtml.append("<li style=\"margin:8px 0;\">");
            if (!href.isEmpty()) {
                listHtml.append("<a href=\"" + escapeXml(href) + "\" style=\"font-weight:600;color:inherit;text-decoration:none\">" + escT + "</a>");
            } else {
                listHtml.append("<span style=\"font-weight:600\">" + escT + "</span>");
            }
            if (!escEx.isEmpty()) {
                listHtml.append("<div style=\"font-size:14px;color:#666;\">" + escEx + "</div>");
            }
            listHtml.append("</li>");
        }

        // Build final SSR block HTML
        StringBuilder html = new StringBuilder();
        html.append("<section id=\"ssr-fallback\" data-ssr=\"true\" style=\"max-width:1200px;margin:24px auto;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#fff\">");
        if (!escTitle.isEmpty()) {
            html.append("<h1 style=\"margin:0 0 8px 0;font-size:26px;font-weight:800\">" + escTitle + "</h1>");
        }
        if (!escDesc.isEmpty()) {
            html.append("<p style=\"margin:0 0 12px 0;font-size:16px;color:#555\">" + escDesc + "</p>");
        }
        if (maxItems > 0) {
            html.append("<ul style=\"list-style:none;padding:0;margin:0\">" + listHtml + "</ul>");
        }
        html.append("</section>");

        return html.toString();
    }

    /**
     * Kiểm tra xem HTML render có đầy đủ SEO meta tags hay không
     * Chỉ thêm vào sitemap nếu có: title, description, og:url
     */
    private boolean hasSeoMetaTags(String htmlContent) {
        if (htmlContent == null || htmlContent.isEmpty()) {
            logger.info("⚠️ hasSeoMetaTags: HTML content is null/empty");
            return false;
        }

        String lower = htmlContent.toLowerCase(Locale.ROOT);
        
        // Cần có ít nhất: <title>, <meta name="description">, <meta property="og:url">
        boolean hasTitle = lower.contains("<title>") && !lower.contains("<title></title>");
        boolean hasDescription = lower.contains("name=\"description\"") && 
                                 lower.contains("content=");
        boolean hasOgUrl = lower.contains("property=\"og:url\"") || 
                          lower.contains("property='og:url'");

        boolean hasSeo = hasTitle && (hasDescription || hasOgUrl);
        
        if (!hasSeo) {
            logger.info("⚠️ Page missing SEO meta tags - hasTitle: {}, hasDesc: {}, hasOgUrl: {}", 
                hasTitle, hasDescription, hasOgUrl);
        } else {
            logger.info("✅ Page has valid SEO meta tags");
        }
        
        return hasSeo;
    }

    /**
     * Finds the best-matched route from a list of potential routes based on
     * defined priority rules. The priority is as follows: 1. Exact match by
     * domain and f_case. 2. Domain-specific match where f_case is NOT
     * "default". 3. The first route in the list (often a global default if set
     * up that way).
     *
     * @param matchedRoutes The list of routes returned by the filter (can
     * contain multiple matches).
     * @param currentDomain The normalized domain name from the current request.
     * @param currentFCase The normalized f_case (path part) from the current
     * request.
     * @return An Optional containing the best-matched route, or empty if no
     * routes are provided.
     */
    public Optional<Map<String, Object>> findBestMatchedRoute(
            List<Map<String, Object>> matchedRoutes,
            String currentDomain,
            String currentFCase) {
        if (matchedRoutes == null || matchedRoutes.isEmpty()) {
            // Nếu danh sách rỗng hoặc null, không có tuyến đường nào để chọn
            logger.debug("Danh sách matchedRoutes rỗng hoặc null. Không tìm thấy tuyến đường nào.");
            return Optional.empty();
        }

        // Khởi tạo Collator nếu cần so sánh locale-sensitive
        // Collator vnCollator = Collator.getInstance(new Locale("vi", "VN"));
        // vnCollator.setStrength(Collator.PRIMARY); // Ignore case and accents for
        // basic match
        // --- Ưu tiên 1: Khớp chính xác domain và f_case ---
        // Tìm tuyến đường có domain và f_case khớp hoàn toàn (không phân biệt hoa
        // thường)
        Optional<Map<String, Object>> exactMatchRoute = matchedRoutes.stream()
                .filter(route -> {
                    String routeDomainName = (String) route.getOrDefault("domain_name", "");
                    String routeFCaseInList = (String) route.getOrDefault("f_case", "");

                    // So sánh `domain` và `f_case` đã được chuẩn hóa.
                    // Nếu dùng Collator, hãy thay thế `equalsIgnoreCase` bằng
                    // `collator.compare(...) == 0`
                    boolean domainMatches = currentDomain.equalsIgnoreCase(routeDomainName);
                    boolean fCaseMatches = currentFCase.equalsIgnoreCase(routeFCaseInList); // Hoặc
                    // vnCollator.compare(currentFCase,
                    // routeFCaseInList) == 0;

                    return domainMatches && fCaseMatches;
                })
                .findFirst();

        if (exactMatchRoute.isPresent()) {
            logger.debug("✅ Đã tìm thấy tuyến đường ưu tiên 1 (khớp chính xác): {}", exactMatchRoute.get());
            return exactMatchRoute; // Nếu tìm thấy exact match, trả về ngay
        }

        // --- Ưu tiên 2: Khớp domain VÀ f_case KHÔNG PHẢI là "default" ---
        // Đây là logic bạn muốn "lấy giá trị khác giá trị mặc định" cho cùng một
        // domain.
        // Điều này ưu tiên các tuyến đường cụ thể hơn của domain so với mặc định của
        // chính domain đó.
        Optional<Map<String, Object>> domainSpecificNonDefaultRoute = matchedRoutes.stream()
                .filter(route -> {
                    String routeDomainName = (String) route.getOrDefault("domain_name", "");
                    String routeFCaseInList = (String) route.getOrDefault("f_case", "");

                    // Điều kiện: Domain khớp VÀ f_case KHÔNG PHẢI là "default" (không phân biệt hoa
                    // thường)
                    boolean domainMatches = currentDomain.equalsIgnoreCase(routeDomainName);
                    boolean notDefaultFCase = !"default".equalsIgnoreCase(routeFCaseInList); // Hoặc
                    // vnCollator.compare("default",
                    // routeFCaseInList) != 0;

                    return domainMatches && notDefaultFCase;
                })
                .findFirst();

        if (domainSpecificNonDefaultRoute.isPresent()) {
            logger.debug("ℹ️ Đã tìm thấy tuyến đường ưu tiên 2 (khớp domain, không phải default): {}",
                    domainSpecificNonDefaultRoute.get());
            return domainSpecificNonDefaultRoute; // Nếu tìm thấy tuyến đường ưu tiên 2, trả về
        }

        // --- Ưu tiên 3 (Fallback): Tuyến đường đầu tiên trong danh sách (thường là
        // global default) ---
        // Nếu không có route nào ưu tiên hơn theo 2 tiêu chí trên,
        // chúng ta sẽ lấy tuyến đường đầu tiên còn lại trong danh sách ban đầu.
        // Trong cấu hình filter của bạn, tuyến đường mặc định toàn cục thường nằm ở
        // đây.
        Map<String, Object> fallbackRoute = matchedRoutes.get(0); // Lấy phần tử đầu tiên
        logger.warn(
                "⚠️ Không tìm thấy tuyến đường cụ thể nào. Đang sử dụng tuyến đường mặc định (đầu tiên trong danh sách): {}",
                fallbackRoute);
        return Optional.of(fallbackRoute);
    }

    /**
     * Processes web page specific data like ChuDe, BaiViet, Metas, and Menus
     * based on the JavaScript logic. This method encapsulates the complex data
     * loading part.
     */
    private void processWebPageData(Map<String, Object> templateData, String fDo, String domain, String fullUrl,
            String path, String protocol, String hostHeader) throws Exception {
        Map<String, Map<String, Object>> baiViets = new HashMap<>();
        List<Map<String, Object>> menus = new ArrayList<>();
        SearchFilter filterCD = new SearchFilter();
        // logger.info("Xong domain {} thong tin host {}",domain,hostHeader);
        // domain="phanmemmottrieu.net";
        filterCD.setOperator("AND");
        filterCD.setConditions(List.of(
                RecordManager.createCondition("domain", "like", domain),
                RecordManager.createCondition("trang_thai", "eq", 1)));
        // --- Fetch web_chude ---
        Map<String, Object> chuDeResult = recordManager.filter("web", "web_chude", filterCD);
        List<Map<String, Object>> allChuDe = (List<Map<String, Object>>) chuDeResult.getOrDefault("rows",
                new ArrayList<>());

        // --- Fetch sys_la_routers for domainRun (already done partially, but specific
        // to f_do) ---
        SearchFilter routerDomainFilter = new SearchFilter();
        routerDomainFilter.setOperator("AND");
        routerDomainFilter.setConditions(List.of(
                RecordManager.createCondition("f_do", "eq", fDo),
                RecordManager.createCondition("run", "eq", 1)));
        Map<String, Object> routerDomainResult = recordManager.filter("csm", "sys_la_routers", routerDomainFilter);
        List<Map<String, Object>> laRouterHs = (List<Map<String, Object>>) routerDomainResult.getOrDefault("rows",
                new ArrayList<>());
        Set<String> domainRun = new HashSet<>();
        if (laRouterHs != null) {
            laRouterHs.forEach(objDM -> {
                String dmName = (String) objDM.get("domain_name");
                if (dmName != null && !dmName.isEmpty()) {
                    domainRun.add(dmName);
                }
            });
        }
        domainRun.add(domain);

        List<Map<String, Object>> filteredChuDe = new ArrayList<>();
        if (!allChuDe.isEmpty()) {
            allChuDe.forEach(c -> {
                String chuDeDomain = (String) c.get("domain");
                if (domainRun.contains(chuDeDomain)) {
                    filteredChuDe.add(c);
                }
            });
        }
        // Add empty ChuDe for homepage logic later
        filteredChuDe.add(Map.of("id", "", "stt", 0));

        // Sort ChuDe by stt
        filteredChuDe.sort(Comparator.comparing(c -> ((Number) c.getOrDefault("stt", 0)).intValue()));
        List<String> cacCD = new ArrayList<>();
        filteredChuDe.forEach(c -> cacCD.add((String) c.get("id")));

        // --- Fetch web_baiviet ---
        SearchFilter baiVietFilter = new SearchFilter();
        baiVietFilter.setOperator("AND");
        baiVietFilter.setConditions(List.of(
                RecordManager.createCondition("trang_thai", "eq", 1),
                RecordManager.createCondition("chu_de", "in", cacCD),
                RecordManager.createCondition("domain", "in", new ArrayList<>(domainRun))));
        try {
            String jsonString = objectMapper.writeValueAsString(baiVietFilter);
            logger.info("JSON representation of routerFilter sent to Lucene: {} chu de {}", jsonString, filteredChuDe);
        } catch (Exception e) {
            logger.error("Error converting routerFilter to JSON: {}", e.getMessage());
        }
        Map<String, Object> baiVietResult = recordManager.filter("web", "web_baiviet", baiVietFilter);
        List<Map<String, Object>> allBaiViet = (List<Map<String, Object>>) baiVietResult.getOrDefault("rows",
                new ArrayList<>());
        try {
            String jsonString = objectMapper.writeValueAsString(baiVietFilter);
            logger.info("JSON representation of routerFilter sent to Lucene: {} gia tri tim duoc la {}", jsonString,
                    allBaiViet);
        } catch (Exception e) {
            logger.error("Error converting routerFilter to JSON: {}", e.getMessage());
        }
        if (allBaiViet != null) {
            for (Map<String, Object> objCD : filteredChuDe) {
                // Luôn kiểm tra null cho chuDeId để tránh lỗi khi get("id") trả về null
                String chuDeId = Optional.ofNullable(objCD.get("id"))
                        .map(Object::toString)
                        .orElse(""); // Mặc định là chuỗi rỗng nếu null

                List<Map<String, Object>> cacBai = new ArrayList<>();
                allBaiViet.forEach(bai -> {
                    // Đảm bảo bai.get("chu_de") không null trước khi so sánh
                    if (chuDeId.equals(Optional.ofNullable(bai.get("chu_de")).map(Object::toString).orElse(null))) {
                        cacBai.add(bai);
                    }
                });

                if (cacBai.size() == 1) {
                    Map<String, Object> objnCD = new HashMap<>(cacBai.get(0));

                    // Kiểm tra null cho title và id trước khi sử dụng
                    String titleForLink = Optional.ofNullable(objnCD.get("title")).map(Object::toString).orElse("");
                    String idForBaiViet = Optional.ofNullable(objnCD.get("id")).map(Object::toString).orElse("");

                    if (chuDeId.isEmpty()) { // Homepage
                        objnCD.put("trang_chu", true);
                    }

                    // Đảm bảo idForBaiViet không rỗng/null trước khi put vào baiViets
                    if (!idForBaiViet.isEmpty()) {
                        baiViets.put(idForBaiViet, objnCD);
                    }

                    // Tạo Map an toàn với các giá trị không null
                    menus.add(new HashMap<String, Object>() {
                        {
                            put("link", chuDeId.isEmpty() ? "" : xoa_dau(titleForLink) + ".shtml");
                            put("title", titleForLink);
                            put("stt", chuDeId.isEmpty() ? 0 : 1);
                        }
                    });
                } else if (cacBai.size() > 1) {
                    Map<String, Object> objnCD = new HashMap<>(objCD);

                    // Kiểm tra null cho title và id trước khi sử dụng
                    String objCDTitle = Optional.ofNullable(objnCD.get("title")).map(Object::toString).orElse("");
                    String idForBaiViet = Optional.ofNullable(objnCD.get("id")).map(Object::toString).orElse("");

                    objnCD.put("goc_chu_de", xoa_dau(objCDTitle).toLowerCase());
                    objnCD.put("bai_viet", cacBai);

                    // Đảm bảo idForBaiViet không rỗng/null trước khi put vào baiViets
                    if (!idForBaiViet.isEmpty()) {
                        baiViets.put(idForBaiViet, objnCD);
                    }

                    // Tạo Map an toàn với các giá trị không null
                    menus.add(new HashMap<String, Object>() {
                        {
                            put("link", xoa_dau(objCDTitle) + ".shtml");
                            put("title", objCDTitle);
                            put("stt", Optional.ofNullable(objCD.get("stt")).orElse(0)); // Mặc định là 0 nếu stt null
                        }
                    });
                } else if (!objCD.isEmpty()) {
                    Object titleObj = objCD.get("title");
                    String titleString = (titleObj != null) ? titleObj.toString() : ""; // Chuyển đổi an toàn

                    if (!titleString.isEmpty()) {
                        menus.add(new HashMap<String, Object>() {
                            {
                                put("link", xoa_dau(titleString) + ".shtml");
                                put("title", titleString);
                                put("meta", objCD);
                                put("stt", Optional.ofNullable(objCD.get("stt")).orElse(0)); // Mặc định là 0 nếu stt
                                // null
                            }
                        });
                    }
                }
            }
        }
        menus.sort(Comparator.comparing(m -> ((Number) m.getOrDefault("stt", 0)).intValue()));

        // --- Determine Metas based on URL and BaiViets ---
        Map<String, Object> metas = new HashMap<>();
        String linkP = path.toLowerCase();

        for (Map.Entry<String, Map<String, Object>> entry : baiViets.entrySet()) {
            Map<String, Object> baiVietEntry = entry.getValue();
            if (baiVietEntry.containsKey("bai_viet")) {
                String gocChuDe = (String) baiVietEntry.get("goc_chu_de");
                if (linkP.equals("/" + gocChuDe + ".shtml") || linkP.startsWith("/" + gocChuDe + "/")) {
                    List<Map<String, Object>> childBaiViet = (List<Map<String, Object>>) baiVietEntry.get("bai_viet");
                    boolean foundChild = false;
                    for (Map<String, Object> bai : childBaiViet) {
                        if (linkP.contains(xoa_dau((String) bai.getOrDefault("title", "")).toLowerCase() + ".shtml")) {
                            metas.putAll(bai);
                            foundChild = true;
                            break;
                        }
                    }
                    if (!foundChild) { // If no child found, use parent
                        metas.putAll(baiVietEntry);
                    }
                    // fKeyUrl = entry.getKey(); // Unused variable, commented out
                    break;
                }
            } else if (baiVietEntry.containsKey("trang_chu")) {
                if (linkP.equals("/")) {
                    // fKeyUrl = entry.getKey(); // Unused variable, commented out
                    metas.putAll(baiVietEntry);
                    break;
                }
            }
        }

        metas.put("url", fullUrl);
        metas.put("site_name", String.format("%s://%s", protocol, hostHeader));
        metas.put("year_now", Calendar.getInstance().get(Calendar.YEAR));
        // Loại bỏ: metas.put("xoa_dau", xoa_dau); // Không thể gán method vào map trực
        // tiếp

        // Handle specific "xem-ngay" logic from JS
        Pattern xemNgayPattern = Pattern.compile("/xem-ngay/([an]l/)?\\d{2}([\\/.-])\\d{2}\\1\\d{4}");
        Matcher xemNgayMatcher = xemNgayPattern.matcher(path.toLowerCase());

        if (metas.isEmpty() && xemNgayMatcher.find()) {
            String matchedDate = xemNgayMatcher.group();
            String mo_ta = "";
            String xemNgayTitle = "";

            if (matchedDate.contains("/al/")) {
                mo_ta = "âm lịch";
                xemNgayTitle = "Xem ngày " + matchedDate.replace("/xem-ngay/al/", "") + " âm lịch tốt hay xấu";
            } else {
                xemNgayTitle = "Xem ngày " + matchedDate.replace("/xem-ngay/", "") + " tốt hay xấu";
            }
            mo_ta += ", Xem ngày cưới, Khai trương, Động thổ, Lịch vạn niên";
            metas.put("title", xemNgayTitle);
            metas.put("description", xemNgayTitle + mo_ta);
            // Đường dẫn logo mặc định
            String logoURL = String.format("app_images/%s/%s", "csm", "logo-LA-no-BG.png");
            metas.put("image", logoURL);

            for (Map<String, Object> menu : menus) {
                if ("xem-ngay.shtml".equalsIgnoreCase((String) menu.get("link"))) {
                    if (menu.containsKey("meta")) {
                        menu.put("stt", ((Map<String, Object>) menu.get("meta")).get("stt"));
                    }
                    break;
                }
            }
        } else if (metas.isEmpty()) {
            metas.put("title", "Rất tiếc đường dẫn không tồn tại");
        }

        for (Map<String, Object> menu : menus) {
            String menuLink = (String) menu.get("link");
            if (("/" + menuLink).equalsIgnoreCase(linkP)) {
                if (menu.containsKey("meta")) {
                    metas.putAll((Map<String, Object>) menu.get("meta"));
                }
                break;
            }
        }
        // Xử lý f_logo
        String f_logo = (String) templateData.get("f_logo");
        if (f_logo != null) { // Kiểm tra null trước khi decode
            try {
                f_logo = URLDecoder.decode(f_logo, StandardCharsets.UTF_8.name());
            } catch (Exception e) {
                // Xử lý ngoại lệ nếu chuỗi không phải là URL-encoded hợp lệ
                System.err.println("Lỗi giải mã f_logo: " + e.getMessage());
                // Có thể giữ nguyên f_logo hoặc gán một giá trị mặc định khác
            }
        }
        if (f_logo == null || f_logo.isEmpty()) { // Kiểm tra null/rỗng sau khi decode
            templateData.put("f_logo", "app_images/csm/icon.png");
        }

        // Xử lý description và metas
        // Kiểm tra metas có null không trước khi sử dụng
        if (metas != null && !metas.isEmpty()) {
            String description = (String) metas.getOrDefault("description", "");
            if (description != null) { // Kiểm tra null trước khi decode
                try {
                    description = URLDecoder.decode(description, StandardCharsets.UTF_8.name());
                } catch (Exception e) {
                    logger.error("Lỗi giải mã description: {} dữ liệu {} tên miền {}", description, laRouterHs, domain);
                }
            }
            // Dù description có null (sau decode nếu có lỗi) hay rỗng, Jsoup.parse vẫn xử
            // lý được
            String cleanDescription = Jsoup.parse(description).text();
            metas.put("description", cleanDescription);
        }
        templateData.put("meta", metas);
        templateData.put("menus", menus);
        templateData.put("baseHref", "../");
    }

    /**
     * Fetches page configuration from DB and renders HTML with dynamic
     * parameters. This method combines the logic of JS's
     * `callDynamicTemplatesHtml` (partially) and `Sqrl.render`.
     *
     * @param response StandardResponse to set the HTML body.
     * @param fDo ID or name of the page to fetch from sys_autos.
     * @param pType Page type (e.g., 1 for HTML).
     * @param templateData Map containing all data for template rendering (meta,
     * menus, etc.).
     */
    /**
     * Renders an HTML page based on configuration from 'sys_autos' using
     * Thymeleaf. All entries in `templateData` are added directly to the
     * Thymeleaf context.
     *
     * @param response The StandardResponse object to set the HTML body on.
     * @param fDo The 'id' (page name) to look up in 'sys_autos'.
     * @param pType The 'p_type' to look up in 'sys_autos'.
     * @param templateData A map containing data for the Thymeleaf template,
     * which will be directly accessible.
     */
    private void renderPage(StandardResponse response, String fDo, int pType, Map<String, Object> templateData) {
        try {
            SearchFilter f1 = RecordManager.createCondition("p_name", "eq", fDo);
            SearchFilter f2 = RecordManager.createCondition("p_type", "eq", pType);
            SearchFilter group = new SearchFilter();
            group.setOperator("AND");
            group.setConditions(List.of(f1, f2));

            Map<String, Object> result = recordManager.filter("csm", "sys_autos", group);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", new ArrayList<>());

            if (rows.isEmpty()) {
                response.setHtmlBody("<html><body><h2>Không tìm thấy cấu hình trang: " + fDo + " (type: " + pType
                        + ")</h2></body></html>");
                return;
            }
            logger.info("Đang thực thi trang {} với kiểu dữ liệu là {}", fDo, pType);

            Map<String, Object> pageConfig = rows.get(0);
            String pCode = (String) pageConfig.get("p_code");

            if (pCode == null || pCode.isEmpty()) {
                response.setHtmlBody(
                        "<html><body><h2>Thiếu mã trang (p_code) trong cấu hình của: " + fDo + "</h2></body></html>");
                return;
            }

            String decryptedHtml = recordManager.csm_decrypt(pCode);

            // Kiểm tra nội dung template sau decrypt
            if (decryptedHtml == null || decryptedHtml.trim().isEmpty()) {
                logger.error("❌ Decrypted HTML is null or empty for page: {}", fDo);
                response.setHtmlBody("<html><body><h2>Lỗi: Nội dung trang rỗng sau giải mã</h2></body></html>");
                return;
            }

            // Assume app_type is now directly in templateData (no 'params' nesting)
            String appTypeForStruct = (String) templateData.get("app_type");
            if (appTypeForStruct == null) {
                appTypeForStruct = "web"; // Giá trị mặc định nếu không có app_type
            }

            // Bước 1: Khởi tạo giá trị mặc định cho databaseAppIdForUrl (tương ứng với
            // databaseapp = false trong Node.js)
            String databaseAppIdForUrl = "false";

            // Bước 2: Tìm kiếm thông tin ứng dụng trong bảng 'sys_apps' của 'csm'
            // Giả định 'id' là trường chứa app_id trong bảng 'sys_apps'
            Map<String, Object> appInfo = recordManager.find(
                    "csm", // app_id cho các bảng hệ thống (tương ứng với 'csm' trong Node.js)
                    "sys_apps",
                    RecordManager.createCondition("app_id", "eq", fDo) // Tìm app_id khớp với page_name (fDo)
            );

            // Bước 3: Áp dụng logic của Node.js để xác định databaseAppIdForUrl
            if (appInfo != null && appInfo.containsKey("app_id")) {
                databaseAppIdForUrl = (String) appInfo.get("app_id"); // Nếu tìm thấy, lấy app_id từ đó
            } else {
                // Nếu không tìm thấy appInfo VÀ app_type là "app", gán là "csm"
                if ("app".equals(appTypeForStruct)) {
                    databaseAppIdForUrl = "csm";
                }
                // else (nếu không tìm thấy appInfo và app_type không phải "app"),
                // databaseAppIdForUrl vẫn giữ giá trị "false" ban đầu,
                // giống như `false` trong JS được chuyển thành chuỗi "false" trong URL.
            }

            // Bước 4: Xây dựng structUrl với tất cả các tham số
            String structUrl = String.format("page_struct_js.shtml?name=%s&apt=%s&apd=%s",
                    fDo, // Tham số 'name' từ page_name (fDo)
                    appTypeForStruct, // Tham số 'apt' từ app_type
                    databaseAppIdForUrl // Tham số 'apd' từ logic đã tính toán
            );

            // Add 'struct' directly to templateData.
            // It will now be accessible as ${struct} in the Thymeleaf template.
            templateData.put("struct", structUrl);

            // --- KẾT THÚC PHẦN CẬP NHẬT LOGIC CHO `struct` URL ---
            // --- Use Thymeleaf to process the HTML string ---
            Context context = new Context();
            // Add all parameters from templateData directly to the Thymeleaf context.
            // Thymeleaf will look for variables directly in the context.
            templateData.forEach(context::setVariable);
            // logger.info("Trang có tham số {}", templateData);

            try {
                String renderedHtml = templateEngine.process(decryptedHtml, context);
                response.setHtmlBody(renderedHtml);
                logger.info("renderPage - Nội dung HTML đã render thành công");
            } catch (Exception parseError) {
                logger.error("❌ Thymeleaf parsing error in renderPage: {}", parseError.getMessage(), parseError);
                logger.error("Template content preview (first 500 chars): {}",
                        decryptedHtml.substring(0, Math.min(500, decryptedHtml.length())));
                response.setHtmlBody("<html><body><h2>Lỗi parse template: " + parseError.getMessage() + "</h2></body></html>");
            }
            // --- End Thymeleaf processing ---

        } catch (Exception e) {
            logger.error("Lỗi khi render trang {}: {}", fDo, e.getMessage(), e);
            response.setHtmlBody("<html><body><h2>Lỗi khi render trang: " + e.getMessage() + "</h2></body></html>");
        }
    }

    private ResponseEntity<byte[]> buildResponseEntity(StandardResponse response, Map<String, String> extraHeaders) {
        try {
            ResponseEntity.BodyBuilder bodyBuilder;
            byte[] responseBodyBytes;

            if (response.hasBinaryBody()) {
                bodyBuilder = ResponseEntity.status(HttpStatus.OK)
                        .contentType(MediaType.parseMediaType(response.getContentType()));
                responseBodyBytes = response.getBinaryBody();
            } else if (Boolean.TRUE.equals(response.getIsApi())) {
                bodyBuilder = ResponseEntity
                        .status(response.get("code") != null ? HttpStatus.valueOf((Integer) response.get("code"))
                                : HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON);
                responseBodyBytes = objectMapper.writeValueAsBytes(response.getPropertiesMap());
            } else {
                String body = Optional.ofNullable(response.get("body")).map(Object::toString).orElse("");
                String bodyLower = body.trim().toLowerCase();
                boolean isHtml = bodyLower.contains("<html") || bodyLower.contains("<!doctype");
                logger.info("renderPage là html {}", isHtml);
                if (isHtml) {
                    bodyBuilder = ResponseEntity.status(HttpStatus.OK)
                            .contentType(new MediaType("text", "html", StandardCharsets.UTF_8));
                    responseBodyBytes = body.getBytes(StandardCharsets.UTF_8);
                } else {
                    bodyBuilder = ResponseEntity.status(HttpStatus.OK)
                            .contentType(MediaType.APPLICATION_JSON);
                    responseBodyBytes = objectMapper.writeValueAsBytes(response.getPropertiesMap()); // Assuming
                    // response.getBody()
                    // returns a Map
                    // for JSON
                }
            }

            // Add any extra headers passed to the method
            if (extraHeaders != null) {
                for (Map.Entry<String, String> entry : extraHeaders.entrySet()) {
                    bodyBuilder.header(entry.getKey(), entry.getValue());
                }
            }

            return bodyBuilder.body(responseBodyBytes);

        } catch (Exception e) {
            logger.error("❌ Lỗi khi xây dựng phản hồi: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("Internal server error.".getBytes(StandardCharsets.UTF_8));
        }
    }

    /**
     * Java equivalent of xoa_dau (slugification function from JS). Converts a
     * string to a URL-friendly slug.
     */
    private static String xoa_dau(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        String temp = Normalizer.normalize(s, Normalizer.Form.NFD);
        Pattern pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        temp = pattern.matcher(temp).replaceAll("").replace('đ', 'd').replace('Đ', 'D');
        temp = temp.replaceAll("[^a-zA-Z0-9 ]", "").toLowerCase();
        temp = temp.replaceAll("\\s+", "-");
        return temp;
    }

    // --- Helpers to resolve SEO from services by slug/code without new endpoints ---
    private String safeStr(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    // Normalize service category fields by language (content/title/category/description)
    private Map<String, Object> mapServiceCategoryByLang(Map<String, Object> row, String currentLang) {
        if (row == null) {
            return null;
        }
        
        String lang = (currentLang == null || currentLang.isEmpty()) ? "vi" : currentLang.toLowerCase(Locale.ROOT);
        if (lang.startsWith("en")) {
            lang = "en";
        } else if (lang.startsWith("zh")) {
            lang = "zh";
        } else if (lang.startsWith("vi")) {
            lang = "vi";
        } else {
            lang = "vi";
        }

        // Create a new map with only the fields we want to return (like mapDetailFull does)
        Map<String, Object> out = new HashMap<>();
        
        // Core fields
        out.put("id", safeStr(row.get("id")));
        out.put("domain", safeStr(row.get("domain")));
        out.put("name", safeStr(row.get("name")));
        out.put("service_code", safeStr(row.get("service_code")));
        out.put("slug", safeStr(row.get("service_code")));
        out.put("status", safeStr(row.get("status")));
        out.put("icon", safeStr(row.get("icon")));
        out.put("sort_order", safeStr(row.get("sort_order")));
        out.put("attributes", row.get("attributes"));
        out.put("config", safeStr(row.get("config")));
        out.put("updated_at", row.get("updated_at"));
        out.put("seo_meta", safeStr(row.get("seo_meta")));
        out.put("parent_id", safeStr(row.get("parent_id")));
        
        // Language-aware content fields
        // Priority 1 - content for current language
        String content = "";
        if (!"vi".equals(lang)) {
            content = safeStr(row.get("content_" + lang));
        }
        // Priority 2 - fallback to Vietnamese content
        if (content.isEmpty()) {
            content = safeStr(row.get("content"));
        }
        out.put("content", content);
        
        // Similarly for descriptions
        String description = "";
        if (!"vi".equals(lang)) {
            description = safeStr(row.get("description_" + lang));
        }
        if (description.isEmpty()) {
            description = safeStr(row.get("description"));
        }
        out.put("description", description);
        
        // Categories
        String category = "";
        if (!"vi".equals(lang)) {
            category = safeStr(row.get("category_" + lang));
        }
        if (category.isEmpty()) {
            category = safeStr(row.get("category"));
        }
        out.put("category", category);

        // Titles
        String title = "";
        if (!"vi".equals(lang)) {
            title = safeStr(row.get("title_" + lang));
        }
        if (title.isEmpty()) {
            title = safeStr(row.get("title"));
        }
        out.put("title", title);
        
        // NOTE: We intentionally do NOT include content_en, content_zh, description_en, 
        // description_zh, category_en, category_zh, title_en, title_zh, etc.
        // Only the language-selected fields (content, description, category, title) are returned

        return out;
    }
    
    /**
     * Parse JSON string to Map, return empty map if parsing fails
     */
    @SuppressWarnings({"unused", "unchecked"})
    private Map<String, Object> parseJsonToMap(Object value) {
        if (value == null) {
            return new HashMap<>();
        }
        if (value instanceof Map) {
            return (Map<String, Object>) value;
        }
        if (value instanceof String) {
            String str = (String) value;
            if (str.trim().isEmpty()) {
                return new HashMap<>();
            }
            try {
                return objectMapper.readValue(str, Map.class);
            } catch (Exception e) {
                logger.warn("Failed to parse JSON: {}", str.substring(0, Math.min(100, str.length())));
                return new HashMap<>();
            }
        }
        return new HashMap<>();
    }

    @SuppressWarnings("unused")
    private String coalesce(String... vals) {
        if (vals == null) {
            return "";
        }
        for (String s : vals) {
            if (s != null && !s.trim().isEmpty()) {
                return s.trim();
            }
        }
        return "";
    }

    @SuppressWarnings("unused")
    private String stripHtmlTags(String html) {
        if (html == null || html.isEmpty()) {
            return "";
        }
        String text = html.replaceAll("<[^>]*>", " ");
        text = text.replaceAll("\\s+", " ").trim();
        return text;
    }

    // --- Similarity helpers for selecting truly related posts ---
    private String normalizeTextBasic(String s) {
        if (s == null) return "";
        String out = s.toLowerCase();
        out = java.text.Normalizer.normalize(out, java.text.Normalizer.Form.NFD).replaceAll("[\u0300-\u036f]", "");
        out = out.replaceAll("[^a-z0-9\s]", " ");
        out = out.replaceAll("\\s+", " ").trim();
        return out;
    }

    private java.util.Set<String> tokenize(String s) {
        String n = normalizeTextBasic(s);
        if (n.isEmpty()) return java.util.Collections.emptySet();
        String[] parts = n.split(" ");
        java.util.Set<String> set = new java.util.HashSet<>();
        for (String p : parts) {
            if (p != null && p.length() > 1) set.add(p);
        }
        return set;
    }

    private double jaccard(java.util.Set<String> a, java.util.Set<String> b) {
        if (a.isEmpty() && b.isEmpty()) return 0.0;
        int inter = 0;
        for (String x : a) if (b.contains(x)) inter++;
        int union = a.size() + b.size() - inter;
        return union == 0 ? 0.0 : (double) inter / (double) union;
    }

    private Double parseNumber(Object v) {
        try {
            if (v == null) return null;
            String s = String.valueOf(v).replaceAll("[^0-9.]+", "");
            if (s.isEmpty()) return null;
            return Double.parseDouble(s);
        } catch (Exception e) {
            return null;
        }
    }

    private double closeness(Double a, Double b) {
        if (a == null || b == null) return 0.0;
        double max = Math.max(Math.abs(a), Math.abs(b));
        if (max <= 0.0) return 0.0;
        double diff = Math.abs(a - b);
        double ratio = diff / max;
        return Math.max(0.0, 1.0 - Math.min(1.0, ratio));
    }

    private String attr(Map<String, Object> attrs, String key) {
        if (attrs == null) return "";
        Object v = attrs.get(key);
        return v == null ? "" : String.valueOf(v).trim().toLowerCase();
    }

    private double computeSimilarity(Map<String, Object> current, Map<String, Object> candidate, String serviceCode) {
        // ✅ PRIORITY 1: Title similarity (70% weight) - quan trọng nhất
        String curTitle = safeStr(current.get("title"));
        String candTitle = safeStr(candidate.get("title"));
        double titleScore = jaccard(tokenize(curTitle), tokenize(candTitle));

        // PRIORITY 2: Tags/keywords similarity (15% weight)
        String curTagsRaw = coalesce(safeStr(current.get("tags")), safeStr(current.get("keywords")));
        String candTagsRaw = coalesce(safeStr(candidate.get("tags")), safeStr(candidate.get("keywords")));
        java.util.Set<String> curTags = new java.util.HashSet<>();
        java.util.Set<String> candTags = new java.util.HashSet<>();
        for (String t : curTagsRaw.split(",")) { String x = normalizeTextBasic(t); if (!x.isEmpty()) curTags.add(x); }
        for (String t : candTagsRaw.split(",")) { String x = normalizeTextBasic(t); if (!x.isEmpty()) candTags.add(x); }
        double tagScore = jaccard(curTags, candTags);
        
        // PRIORITY 3: Content similarity (10% weight) - xem xét nội dung mô tả
        String curContent = safeStr(current.get("excerpt"));
        String candContent = safeStr(candidate.get("excerpt"));
        double contentScore = 0.0;
        if (!curContent.isEmpty() && !candContent.isEmpty()) {
            contentScore = jaccard(tokenize(curContent), tokenize(candContent));
        }

        Map<String, Object> curAttrs = parseJsonToMap(current.get("attributes"));
        Map<String, Object> candAttrs = parseJsonToMap(candidate.get("attributes"));
        double catScore = 0.0;
        double priceScore = 0.0;
        double extraScore = 0.0;
        double weight = 0.0;  // Reset weight, chỉ cộng vào khi có domain signals

        // PRIORITY 4: Domain-specific signals (5% weight total)
        if ("bat-dong-san".equals(serviceCode)) {
            // Property type & transaction type
            if (!attr(curAttrs, "property_type").isEmpty()) {
                weight += 0.5;
                catScore += attr(curAttrs, "property_type").equals(attr(candAttrs, "property_type")) ? 0.5 : 0.0;
            }
            if (!attr(curAttrs, "transaction_type").isEmpty()) {
                weight += 0.5;
                catScore += attr(curAttrs, "transaction_type").equals(attr(candAttrs, "transaction_type")) ? 0.5 : 0.0;
            }
            // Price & area closeness
            Double curPrice = parseNumber(current.get("priceValue"));
            Double candPrice = parseNumber(candidate.get("priceValue"));
            Double curArea = parseNumber(curAttrs.get("area"));
            Double candArea = parseNumber(candAttrs.get("area"));
            weight += 2.0;
            priceScore = 0.5 * closeness(curPrice, candPrice) + 0.5 * closeness(curArea, candArea);
            // Location signals (city/district)
            String curCity = attr(curAttrs, "city");
            String candCity = attr(candAttrs, "city");
            String curDistrict = attr(curAttrs, "district");
            String candDistrict = attr(candAttrs, "district");
            if (!curCity.isEmpty()) { weight += 0.5; extraScore += curCity.equals(candCity) ? 0.5 : 0.0; }
            if (!curDistrict.isEmpty()) { weight += 0.5; extraScore += curDistrict.equals(candDistrict) ? 0.5 : 0.0; }
        } else if ("phan-mem".equals(serviceCode)) {
            // Platform & category
            if (!attr(curAttrs, "platform").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "platform").equals(attr(candAttrs, "platform")) ? 0.5 : 0.0; }
            if (!attr(curAttrs, "category").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "category").equals(attr(candAttrs, "category")) ? 0.5 : 0.0; }
        } else if ("lam-dep-my-pham".equals(serviceCode)) {
            // Brand & origin
            if (!attr(curAttrs, "brand").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "brand").equals(attr(candAttrs, "brand")) ? 0.5 : 0.0; }
            if (!attr(curAttrs, "origin").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "origin").equals(attr(candAttrs, "origin")) ? 0.5 : 0.0; }
        } else if ("cho-thue-xe".equals(serviceCode)) {
            // Car type & seats & fuel
            if (!attr(curAttrs, "car_type").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "car_type").equals(attr(candAttrs, "car_type")) ? 0.5 : 0.0; }
            if (!attr(curAttrs, "seats").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "seats").equals(attr(candAttrs, "seats")) ? 0.5 : 0.0; }
            if (!attr(curAttrs, "fuel_type").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "fuel_type").equals(attr(candAttrs, "fuel_type")) ? 0.5 : 0.0; }
        } else if ("booking-online".equals(serviceCode)) {
            // Service category and city as basic anchors
            if (!attr(curAttrs, "category").isEmpty()) { weight += 0.5; catScore += attr(curAttrs, "category").equals(attr(candAttrs, "category")) ? 0.5 : 0.0; }
            if (!attr(curAttrs, "city").isEmpty()) { weight += 0.5; extraScore += attr(curAttrs, "city").equals(attr(candAttrs, "city")) ? 0.5 : 0.0; }
        }

        // Final score: Title(70%) + Tags(15%) + Content(10%) + Domain(5%)
        double baseScore = 0.70 * titleScore + 0.15 * tagScore + 0.10 * contentScore;
        double domainScore = weight > 0 ? (catScore + priceScore + extraScore) / weight : 0.0;
        double finalScore = baseScore + 0.05 * domainScore;
        
        return Math.max(0.0, Math.min(1.0, finalScore));
    }

    private Map<String, String> resolveSeoForServiceRoute(
            String appId,
            String tblServices,
            String tblServiceDetail,
            String domain,
            String normalizedPath,
            String main_service_code,
            String default_service_code,
            String lang
    ) {
        try {
            if (appId == null || appId.isEmpty() || tblServices == null || tblServices.isEmpty() || tblServiceDetail == null || tblServiceDetail.isEmpty()) {
                return null;
            }
            final Set<String> SUPPORTED_LANGS = Set.of("vi", "en", "zh");
            String currentLang = (lang != null && SUPPORTED_LANGS.contains(lang)) ? lang : "vi";
            String workingPath = normalizedPath == null ? "" : normalizedPath.trim();
            if (workingPath.startsWith("/")) {
                String[] segs = workingPath.substring(1).split("/");
                if (segs.length > 0) {
                    String first = segs[0].toLowerCase();
                    if (SUPPORTED_LANGS.contains(first) && !"vi".equals(first)) {
                        workingPath = "/" + Arrays.stream(segs).skip(1).collect(java.util.stream.Collectors.joining("/"));
                        if (workingPath.equals("/")) {
                            workingPath = "/";
                        }
                    }
                }
            }
            String pathNoExt = workingPath.replace(".shtml", "");
            String[] parts = pathNoExt.split("/");
            String slug = parts.length > 0 ? parts[parts.length - 1] : pathNoExt;
            if (slug == null) slug = "";
            slug = slug.trim();
            logger.info("Doi Chieu slug {} va main_service_code {} va default_service_code {}", slug, main_service_code, default_service_code);
            if(slug.equals(main_service_code) && default_service_code != null && !default_service_code.isEmpty())
                slug = default_service_code;
            // 1. Ưu tiên lấy từ bảng chi tiết
            SearchFilter detailFilter = new SearchFilter();
            detailFilter.setOperator("AND");
            detailFilter.setConditions(List.of(
                RecordManager.createCondition("slug", "eq", slug),
                RecordManager.createCondition("status", "eq", "active"),
                RecordManager.createCondition("domain", "like", domain)
            ));
            Map<String, Object> detail = recordManager.find(appId, tblServiceDetail, detailFilter);
            if (detail != null && !detail.isEmpty()) {
                // Title: ưu tiên theo ngôn ngữ, fallback về vi
                String title = safeStr(detail.get(currentLang.equals("vi") ? "title" : "title_" + currentLang));
                if (title.isEmpty()) title = safeStr(detail.get("title"));
                
                // Keywords: ưu tiên theo ngôn ngữ, fallback về vi
                String keywords = safeStr(detail.get(currentLang.equals("vi") ? "keywords" : "keywords_" + currentLang));
                if (keywords.isEmpty()) keywords = safeStr(detail.get("keywords"));
                
                // Description: Ưu tiên 1 - description theo ngôn ngữ
                String description = "";
                if (!currentLang.equals("vi")) {
                    description = safeStr(detail.get("description_" + currentLang));
                }
                if (description.isEmpty()) description = safeStr(detail.get("description"));
                
                // Ưu tiên 2 - excerpt theo ngôn ngữ
                if (description.isEmpty() && !currentLang.equals("vi")) {
                    description = safeStr(detail.get("excerpt_" + currentLang));
                }
                if (description.isEmpty()) description = safeStr(detail.get("excerpt"));
                
                // Ưu tiên 3 - content theo ngôn ngữ (stripped HTML)
                if (description.isEmpty()) {
                    String content = "";
                    if (!currentLang.equals("vi")) {
                        content = safeStr(detail.get("content_" + currentLang));
                    }
                    if (content.isEmpty()) content = safeStr(detail.get("content"));
                    if (!content.isEmpty()) {
                        description = Jsoup.parse(content).text();
                        if (description.length() > 160) description = description.substring(0, 160) + "...";
                    }
                }
                
                String image = safeStr(detail.get("image"));
                String serviceType = safeStr(detail.get("service_type"));
                // Lấy danh sách tin liên quan theo service_type
                List<Map<String, Object>> related = new ArrayList<>();
                if (!serviceType.isEmpty()) {
                    SearchFilter relatedFilter = new SearchFilter();
                    relatedFilter.setOperator("AND");
                    relatedFilter.setConditions(List.of(
                        RecordManager.createCondition("service_type", "eq", serviceType),
                        RecordManager.createCondition("status", "eq", "active"),
                        RecordManager.createCondition("domain", "like", domain)
                    ));
                    Map<String, Object> relResult = recordManager.filter(appId, tblServiceDetail, relatedFilter);
                    related = (List<Map<String, Object>>) relResult.getOrDefault("rows", new ArrayList<>());
                }
                Map<String, String> out = new HashMap<>();
                out.put("title", title);
                out.put("keywords", keywords);
                out.put("description", description);
                out.put("image", image);
                out.put("lang", currentLang);
                out.put("slug", slug);
                out.put("service_type", serviceType);
                out.put("related_count", String.valueOf(related.size()));
                // Optionally: add more meta fields if needed
                return out;
            }

            // 2. Nếu không có chi tiết, lấy từ bảng dịch vụ
            SearchFilter serviceFilter = new SearchFilter();
            serviceFilter.setOperator("AND");
            serviceFilter.setConditions(List.of(
                RecordManager.createCondition("is_service", "eq", true),
                RecordManager.createCondition("slug", "eq", slug),
                RecordManager.createCondition("status", "eq", "active"),
                RecordManager.createCondition("domain", "like", domain)
            ));
            Map<String, Object> service = recordManager.find(appId, tblServices, serviceFilter);
            if (service != null && !service.isEmpty()) {
                logger.info("Found service for slug {}: {} lang {}", slug, service, currentLang);
                String serviceCode = safeStr(service.get("service_code"));
                
                // Title: ưu tiên theo ngôn ngữ, fallback về vi
                String title = safeStr(service.get(currentLang.equals("vi") ? "attributes_title" : "attributes_title_" + currentLang));
                if (title.isEmpty()) title = safeStr(service.get("attributes_title"));
                if (title.isEmpty()) title = safeStr(service.get("category"));
                
                // Keywords: ưu tiên theo ngôn ngữ, fallback về vi
                String keywords = safeStr(service.get(currentLang.equals("vi") ? "attributes_keywords" : "attributes_keywords_" + currentLang));
                if (keywords.isEmpty()) keywords = safeStr(service.get("attributes_keywords"));
                
                // Description: Ưu tiên 1 - attributes_description theo ngôn ngữ
                String description = "";
                if (!currentLang.equals("vi")) {
                    description = safeStr(service.get("attributes_description_" + currentLang));
                }
                if (description.isEmpty()) description = safeStr(service.get("attributes_description"));
                
                // Ưu tiên 2 - summary theo ngôn ngữ
                if (description.isEmpty() && !currentLang.equals("vi")) {
                    description = safeStr(service.get("summary_" + currentLang));
                }
                if (description.isEmpty()) description = safeStr(service.get("summary"));
                
                // Ưu tiên 3 - attributes (stripped HTML)
                if (description.isEmpty()) {
                    String attrs = safeStr(service.get("attributes"));
                    if (!attrs.isEmpty()) {
                        description = Jsoup.parse(attrs).text();
                        if (description.length() > 160) description = description.substring(0, 160) + "...";
                    }
                }

                // Ưu tiên 4 - content theo ngôn ngữ (stripped HTML)
                if (description.isEmpty()) {
                    String content = "";
                    if (!currentLang.equals("vi")) {
                        content = safeStr(service.get("content_" + currentLang));
                    }
                    if (content.isEmpty()) content = safeStr(service.get("content"));
                    if (!content.isEmpty()) {
                        description = Jsoup.parse(content).text();
                        if (description.length() > 160) description = description.substring(0, 160) + "...";
                    }
                }
                
                String image = safeStr(service.get("image"));
                // Lấy danh sách tin liên quan từ service_code
                List<Map<String, Object>> related = new ArrayList<>();
                if (!serviceCode.isEmpty()) {
                    SearchFilter relatedFilter = new SearchFilter();
                    relatedFilter.setOperator("AND");
                    relatedFilter.setConditions(List.of(
                        RecordManager.createCondition("service_type", "eq", serviceCode),
                        RecordManager.createCondition("status", "eq", "active"),
                        RecordManager.createCondition("domain", "like", domain)
                    ));
                    Map<String, Object> relResult = recordManager.filter(appId, tblServiceDetail, relatedFilter);
                    related = (List<Map<String, Object>>) relResult.getOrDefault("rows", new ArrayList<>());
                }
                Map<String, String> out = new HashMap<>();
                out.put("title", title);
                out.put("keywords", keywords);
                out.put("description", description);
                out.put("image", image);
                out.put("lang", currentLang);
                out.put("slug", slug);
                out.put("service_code", serviceCode);
                out.put("related_count", String.valueOf(related.size()));
                logger.info("Resolved SEO for service slug {}: {}", slug, out);
                // Optionally: add more meta fields if needed
                return out;
            }
            else {
                /* Trường hợp này xử lý SEO cho các link không phải là dịch vụ mà có trên menu khác */
                if(slug.isEmpty() || slug.equals("com.chrome.devtools.json"))
                    slug = "home";
                serviceFilter = new SearchFilter();
                serviceFilter.setOperator("AND");
                serviceFilter.setConditions(List.of(
                    RecordManager.createCondition("is_service", "eq", false),
                    RecordManager.createCondition("slug", "eq", slug),
                    RecordManager.createCondition("status", "eq", "active"),
                    RecordManager.createCondition("domain", "like", domain)
                ));
                logger.info("Trying to find non-service menu for slug {}", slug);
                service = recordManager.find(appId, tblServices, serviceFilter);
                if (service != null && !service.isEmpty()) {
                    logger.info("Found service menu for slug {}: {} lang {}", slug, service, currentLang);
                    
                    // Title: ưu tiên theo ngôn ngữ, fallback về vi
                    String title = safeStr(service.get(currentLang.equals("vi") ? "attributes_title" : "attributes_title_" + currentLang));
                    if (title.isEmpty()) title = safeStr(service.get("attributes_title"));
                    if (title.isEmpty()) title = safeStr(service.get("category"));
                    
                    // Keywords: ưu tiên theo ngôn ngữ, fallback về vi
                    String keywords = safeStr(service.get(currentLang.equals("vi") ? "attributes_keywords" : "attributes_keywords_" + currentLang));
                    if (keywords.isEmpty()) keywords = safeStr(service.get("attributes_keywords"));
                    
                    // Description: Ưu tiên 1 - attributes_description theo ngôn ngữ
                    String description = "";
                    if (!currentLang.equals("vi")) {
                        description = safeStr(service.get("attributes_description_" + currentLang));
                    }
                    if (description.isEmpty()) description = safeStr(service.get("attributes_description"));
                    
                    // Ưu tiên 2 - summary theo ngôn ngữ
                    if (description.isEmpty() && !currentLang.equals("vi")) {
                        description = safeStr(service.get("summary_" + currentLang));
                    }
                    if (description.isEmpty()) description = safeStr(service.get("summary"));
                    
                    // Ưu tiên 3 - attributes (stripped HTML)
                    if (description.isEmpty()) {
                        String attrs = safeStr(service.get("attributes"));
                        if (!attrs.isEmpty()) {
                            description = Jsoup.parse(attrs).text();
                            if (description.length() > 160) description = description.substring(0, 160) + "...";
                        }
                    }
                    
                    String image = safeStr(service.get("image"));
                    Map<String, String> out = new HashMap<>();
                    out.put("title", title);
                    out.put("keywords", keywords);
                    out.put("description", description);
                    out.put("image", image);
                    out.put("lang", currentLang);
                    out.put("slug", slug);
                    logger.info("Resolved SEO for service slug {}: {}", slug, out);
                    // Optionally: add more meta fields if needed
                    return out;
                }
            }
            // Nếu không có gì thì trả về rỗng
            return null;
        } catch (Exception ex) {
            logger.warn("resolveSeoForServiceRoute error: {}", ex.getMessage());
            return null;
        }
    }

    /**
     * Resolve list of service details to render based on slug/service_code
     * logic. CẤU TRÚC MỚI: - web_services: bảng danh mục dịch vụ (id,
     * service_code, slug, category, service_type, title, summary, thumbnail,
     * attributes, seo_meta, status) - web_service_detail: bảng chi tiết các bài
     * viết (id, service_code, slug, title, excerpt, content, images,
     * specifications, featured, active_home, publish_date, status)
     *
     * LOGIC: - Homepage ("/"): trả về tất cả detail có (active_home=1 OR
     * featured=1) và status='active' - Category page ("/phan-mem.shtml",
     * "/bat-dong-san.shtml"): + Tìm service_code từ slug trong web_services (ví
     * dụ: "phan-mem" -> service_code="phan-mem") + Lấy tất cả detail có
     * service_code tương ứng và status='active'
     */
    private Map<String, Object> resolveServiceListingForRoute(
            String appId,
            String tblServices,
            String tblServiceDetail,
            String domain,
            String normalizedPath,
            String main_service_code,
            String default_service_code,
            Map<String, Object> requestParams,
            String lang
    ) {
        try {
            // --- SECURITY: Validate and sanitize all request parameters ---
            if (requestParams != null && !requestParams.isEmpty()) {
                String validationError = validateSearchParams(requestParams);
                if (validationError != null) {
                    logger.error("🚫 SECURITY: Search validation failed - {}", validationError);
                    Map<String, Object> errorResult = new HashMap<>();
                    errorResult.put("error", validationError);
                    errorResult.put("details", new ArrayList<>());
                    return errorResult;
                }
                
                // Sanitize all string parameters
                Map<String, Object> sanitizedParams = new HashMap<>();
                for (Map.Entry<String, Object> entry : requestParams.entrySet()) {
                    String key = entry.getKey();
                    Object value = entry.getValue();
                    
                    if (value instanceof String) {
                        String sanitized = sanitizeInput((String) value);
                        sanitizedParams.put(key, sanitized);
                        
                        // Log if sanitization changed the value (potential attack)
                        if (!value.equals(sanitized)) {
                            logger.warn("⚠️ SECURITY: Sanitized parameter '{}': '{}' -> '{}'", 
                                key, value, sanitized);
                        }
                    } else {
                        sanitizedParams.put(key, value);
                    }
                }
                
                // Replace original params with sanitized version
                requestParams = sanitizedParams;
                
                logger.info("✅ SECURITY: Search params validated and sanitized successfully");
            }
            
            if (appId == null || appId.isEmpty() || tblServiceDetail == null || tblServiceDetail.isEmpty()) {
                logger.warn("⚠️ Missing required params for resolveServiceListingForRoute");
                return null;
            }
            // domain = "phanmemmottrieu.net";
            // --- Language detection: Ưu tiên từ lang parameter được pass vào ---
            final Set<String> SUPPORTED_LANGS = Set.of("vi", "en", "ja", "zh", "ko");
            String detectedLang = (lang != null && !lang.isEmpty()) ? lang : "vi"; // FIXED: Use lang parameter first
            
            // Fallback: Lấy ngôn ngữ từ query param ?hl= nếu lang parameter không được cung cấp
            if ((detectedLang == null || detectedLang.isEmpty() || "vi".equals(detectedLang)) && requestParams != null && requestParams.containsKey("hl")) {
                String hlParam = String.valueOf(requestParams.get("hl")).toLowerCase().trim();
                if (SUPPORTED_LANGS.contains(hlParam)) {
                    detectedLang = hlParam;
                }
            }
            
            // Validate language
            if (!SUPPORTED_LANGS.contains(detectedLang)) {
                detectedLang = "vi"; // Default to Vietnamese if unsupported
            }
            
            final String currentLang = detectedLang; // Make it final for lambda usage
            String workingPath = normalizedPath == null ? "" : normalizedPath.trim();

            Map<String, Object> out = new HashMap<>();
            boolean isHome = workingPath == null || "/".equals(workingPath.trim()) || workingPath.trim().isEmpty();
            out.put("isHome", isHome);
            out.put("lang", currentLang);
            
            // ✅ LOCAL CACHE: để tránh query lặp trong hàm này (request-scoped cache)
            // 🟠 FIXED: Tích hợp cache để giảm database queries
            Map<String, Map<String, Object>> findCache = new HashMap<>();
            
            // --- Xử lý phân trang từ requestParams ---
            int page = 1;
            int pageSize = 12;
            Integer takeParam = null; // Cursor page size (ưu tiên nếu có)
            String lastKeyParam = null; // Cursor lastkey (ưu tiên nếu có)
            if (requestParams != null) {
                try {
                    if (requestParams.containsKey("page")) {
                        page = Integer.parseInt(String.valueOf(requestParams.get("page")));
                        if (page < 1) page = 1;
                    }
                    if (requestParams.containsKey("pageSize")) {
                        pageSize = Integer.parseInt(String.valueOf(requestParams.get("pageSize")));
                        if (pageSize < 1) pageSize = 12;
                        if (pageSize > 100) pageSize = 100; // Giới hạn tối đa
                    }
                    if (requestParams.containsKey("take")) {
                        takeParam = Integer.parseInt(String.valueOf(requestParams.get("take")));
                        if (takeParam != null && takeParam < 1) takeParam = null;
                        if (takeParam != null && takeParam > 100) takeParam = 100;
                    }
                    if (requestParams.containsKey("lastkey")) {
                        lastKeyParam = sanitizeInput(String.valueOf(requestParams.get("lastkey")));
                        if (lastKeyParam != null && lastKeyParam.isBlank()) {
                            lastKeyParam = null;
                        }
                        logger.info("🔍 resolveServiceListingForRoute: Received lastkey param from request: '{}'", lastKeyParam);
                    }
                } catch (NumberFormatException e) {
                    logger.warn("⚠️ Invalid page/pageSize params, using defaults: {}", e.getMessage());
                }
            }
            logger.info("🔍 Pagination params: page={}, pageSize={}", page, pageSize);
            int effectiveTake = (takeParam != null) ? takeParam : pageSize;

            logger.info("🔍 resolveServiceListingForRoute: lang={}, path(afterLang)={}, isHome={}, domain={}", currentLang, workingPath, isHome, domain);

            // Helper to map detail row (lite) for lists
            java.util.function.Function<Map<String, Object>, Map<String, Object>> mapDetail = (row) -> {
                Map<String, Object> m = new HashMap<>();
                m.put("id", safeStr(row.get("id")));
                m.put("domain", safeStr(row.get("domain")));
                m.put("service_type", safeStr(row.get("service_type")));
                // Multilingual title, excerpt, keywords
                String titleField = currentLang.equals("vi") ? "title" : "title_" + currentLang;
                String excerptField = currentLang.equals("vi") ? "excerpt" : "excerpt_" + currentLang;
                String keywordsField = currentLang.equals("vi") ? "keywords" : "keywords_" + currentLang;
                String title = safeStr(row.get(titleField));
                String excerpt = safeStr(row.get(excerptField));
                String keywords = safeStr(row.get(keywordsField));
                // Fallback to Vietnamese if translation is missing
                if (title.isEmpty()) title = safeStr(row.get("title"));
                if (excerpt.isEmpty()) excerpt = safeStr(row.get("excerpt"));
                if (keywords.isEmpty()) keywords = safeStr(row.get("keywords"));
                m.put("title", title);
                m.put("slug", safeStr(row.get("slug")));
                m.put("excerpt", excerpt);
                String thumb = safeStr(row.get("thumbnail"));
                String cover = safeStr(row.get("cover"));
                if (!thumb.isEmpty() && !thumb.startsWith("http") && !thumb.startsWith("/images.shtml")) {
                    thumb = "/images.shtml?app_id=" + appId + "&name=" + thumb;
                }
                if (!cover.isEmpty() && !cover.startsWith("http") && !cover.startsWith("/images.shtml")) {
                    cover = "/images.shtml?app_id=" + appId + "&name=" + cover;
                }
                m.put("thumbnail", thumb);
                m.put("cover", cover);
                m.put("images", safeStr(row.get("images")));
                m.put("tags", safeStr(row.get("tags")));
                m.put("keywords", keywords);
                m.put("meta_description", safeStr(row.get("meta_description")));
                m.put("publish_date", row.get("publish_date"));
                m.put("expiry_date", row.get("expiry_date"));
                // Chỉ lấy các trường phẳng bắt đầu bằng attributes_ và specifications_
                for (String key : row.keySet()) {
                    if (key.startsWith("attributes_")) {
                        m.put(key, row.get(key));
                    }
                    if (key.startsWith("specifications_")) {
                        m.put(key, row.get(key));
                    }
                }
                Object featuredVal = row.get("featured");
                Object activeHomeVal = row.get("active_home");
                m.put("featured", featuredVal != null && (featuredVal.equals(1) || featuredVal.equals(true)));
                m.put("activeHome", activeHomeVal != null && (activeHomeVal.equals(1) || activeHomeVal.equals(true)));
                m.put("status", safeStr(row.get("status")));
                m.put("author", safeStr(row.get("author")));
                return m;
            };

            // Helper to map full detail for detail page
            java.util.function.Function<Map<String, Object>, Map<String, Object>> mapDetailFull = (row) -> {
                Map<String, Object> m = new HashMap<>();
                m.put("id", safeStr(row.get("id")));
                m.put("domain", safeStr(row.get("domain")));
                m.put("service_type", safeStr(row.get("service_type")));
                // Multilingual title, excerpt, content, keywords
                String titleField = currentLang.equals("vi") ? "title" : "title_" + currentLang;
                String excerptField = currentLang.equals("vi") ? "excerpt" : "excerpt_" + currentLang;
                String contentField = currentLang.equals("vi") ? "content" : "content_" + currentLang;
                String keywordsField = currentLang.equals("vi") ? "keywords" : "keywords_" + currentLang;
                String title = safeStr(row.get(titleField));
                String excerpt = safeStr(row.get(excerptField));
                String content = safeStr(row.get(contentField));
                String keywords = safeStr(row.get(keywordsField));
                // Fallback to Vietnamese if translation is missing
                if (title.isEmpty()) title = safeStr(row.get("title"));
                if (excerpt.isEmpty()) excerpt = safeStr(row.get("excerpt"));
                if (content.isEmpty()) content = safeStr(row.get("content"));
                if (keywords.isEmpty()) keywords = safeStr(row.get("keywords"));
                m.put("title", title);
                m.put("slug", safeStr(row.get("slug")));
                m.put("excerpt", excerpt);
                m.put("content", content);
                m.put("images", safeStr(row.get("images")));
                String thumb = safeStr(row.get("thumbnail"));
                String cover = safeStr(row.get("cover"));
                if (!thumb.isEmpty() && !thumb.startsWith("http") && !thumb.startsWith("/images.shtml")) {
                    thumb = "/images.shtml?app_id=" + appId + "&name=" + thumb;
                }
                if (!cover.isEmpty() && !cover.startsWith("http") && !cover.startsWith("/images.shtml")) {
                    cover = "/images.shtml?app_id=" + appId + "&name=" + cover;
                }
                m.put("thumbnail", thumb);
                m.put("cover", cover);
                // Chỉ lấy các trường phẳng bắt đầu bằng attributes_ và specifications_
                for (String key : row.keySet()) {
                    if (key.startsWith("attributes_")) {
                        m.put(key, row.get(key));
                    }
                    if (key.startsWith("specifications_")) {
                        m.put(key, row.get(key));
                    }
                }
                // Loại bỏ hoàn toàn các trường attributes/specifications dạng object hoặc JSON string
                m.remove("attributes");
                m.remove("specifications");
                m.put("tags", safeStr(row.get("tags")));
                m.put("keywords", keywords);
                m.put("meta_description", safeStr(row.get("meta_description")));
                m.put("seo_meta", safeStr(row.get("seo_meta")));
                Object featuredVal2 = row.get("featured");
                Object activeHomeVal2 = row.get("active_home");
                m.put("featured", featuredVal2 != null && (featuredVal2.equals(1) || featuredVal2.equals(true)));
                m.put("activeHome", activeHomeVal2 != null && (activeHomeVal2.equals(1) || activeHomeVal2.equals(true)));
                m.put("publish_date", row.get("publish_date"));
                m.put("expiry_date", row.get("expiry_date"));
                m.put("status", safeStr(row.get("status")));
                m.put("author", safeStr(row.get("author")));
                m.put("dien_thoai", safeStr(row.get("dien_thoai")));
                return m;
            };

            // 🔴 LOG: Confirm mapDetailFull is mapping all fields correctly
            logger.info("✅ mapDetailFull function configured to return all fields: id, domain, service_type, title, excerpt, content, images, thumbnail, cover, tags, keywords, meta_description, seo_meta, featured, activeHome, publish_date, expiry_date, status, author, dien_thoai, + all attributes_* and specifications_* fields");
            
            // TRƯỜNG HỢP 1: HOMEPAGE - lấy tất cả detail có active_home=1 hoặc featured=1
            if (isHome) {
                logger.info("📱 Homepage detected - fetching active_home and featured posts");

                SearchFilter homeFilter = new SearchFilter();
                homeFilter.setOperator("AND");
                List<SearchFilter> homeConds = new ArrayList<>();

                // Condition: status = 'active'
                homeConds.add(RecordManager.createCondition("status", "eq", "active"));

                // Condition: domain (if provided)
                if (domain != null && !domain.isEmpty()) {
                    homeConds.add(RecordManager.createCondition("domain", "like", domain));
                }

                // Condition: (active_home=1 OR featured=1)
                SearchFilter orHomeFeature = new SearchFilter();
                orHomeFeature.setOperator("OR");
                List<SearchFilter> orConds = new ArrayList<>();
                // Support both string "1" and integer 1 for database compatibility
                orConds.add(RecordManager.createCondition("active_home", "in", List.of(1, "1", true)));
                orConds.add(RecordManager.createCondition("featured", "in", List.of(1, "1", true)));
                orHomeFeature.setConditions(orConds);
                homeConds.add(orHomeFeature);

                homeFilter.setConditions(homeConds);

                // 🟠 FIXED: Use cache for home filter result
                String homeFilterKey = "home:" + appId + ":" + tblServiceDetail;
                Map<String, Object> detResult = findCache.getOrDefault(homeFilterKey, recordManager.filter(appId, tblServiceDetail, homeFilter));
                findCache.putIfAbsent(homeFilterKey, detResult);
                List<Map<String, Object>> detRows = (List<Map<String, Object>>) detResult.getOrDefault("rows", new ArrayList<>());

                logger.info("✅ Found {} home/featured posts", detRows.size());

                List<Map<String, Object>> details = new ArrayList<>();
                for (Map<String, Object> r : detRows) {
                    details.add(mapDetail.apply(r));
                }
                out.put("details", details);
                out.put("homeDetailList", details); // cho frontend
                return out;
            }

            // Chuẩn hóa đường dẫn để phân biệt Category vs Detail
            String pathNoExt = workingPath != null ? workingPath.replace(".shtml", "") : "";
            String trimmed = pathNoExt.startsWith("/") ? pathNoExt.substring(1) : pathNoExt;
            String[] segArr = trimmed.split("/");
            List<String> segs = new ArrayList<>();
            for (String s : segArr) {
                if (s != null && !s.isBlank()) {
                    segs.add(s.trim().toLowerCase());
            
                }}

            // TRƯỜNG HỢP 2: DETAIL PAGE - "/{service_code}/{slug}.shtml"
            if (segs.size() >= 2) {
                String serviceCode = segs.get(0);
                // Nếu serviceCode là slug mặc định cũ (legacy) thì chuyển sang default_service_code động
                if (serviceCode != null && serviceCode.equals(main_service_code) && default_service_code != null && !default_service_code.isEmpty()) {
                    serviceCode = default_service_code;
                    logger.info("🔄 Converted legacy service_code '{}' to default_service_code '{}'", main_service_code, default_service_code);
                }
                String detailSlug = segs.get(segs.size() - 1);
                logger.info("🔎 Detail page detected - service_type={}, slug={}", serviceCode, detailSlug);

                // Cross-request cache for detail pages to protect DB under crawl bursts
                boolean cacheableDetail = lastKeyParam == null && page <= 1;
                String detailCacheKey = "detail:" + domain + ":" + serviceCode + ":" + detailSlug + ":" + currentLang;
                if (cacheableDetail) {
                    Map<String, Object> cached = getCacheIfFresh(propertyDetailCache, detailCacheKey, SERVICE_DETAIL_CACHE_TTL_MS);
                    if (cached != null) {
                        trackServiceRouteVisit(appId, domain, normalizedPath, tblServiceDetail, null, null, serviceCode, detailSlug, requestParams);
                        logger.debug("✅ Serving property detail from cache: {}", detailCacheKey);
                        return new HashMap<>(cached);
                    }
                }

                // Find the detail
                SearchFilter detFilter = new SearchFilter();
                detFilter.setOperator("AND");
                List<SearchFilter> detConds = new ArrayList<>();
                // Backend detail table chỉ có service_type
                detConds.add(RecordManager.createCondition("service_type", "eq", serviceCode));
                detConds.add(RecordManager.createCondition("slug", "eq", detailSlug));
                detConds.add(RecordManager.createCondition("status", "eq", "active"));
                if (domain != null && !domain.isEmpty()) {
                    detConds.add(RecordManager.createCondition("domain", "like", domain));
                }
                detFilter.setConditions(detConds);

                // 🟠 FIXED: Use cache for detail filter result (service_type + slug)
                String detailFilterKey = "detail:" + appId + ":" + serviceCode + ":" + detailSlug;
                Map<String, Object> detRes = findCache.getOrDefault(detailFilterKey, recordManager.filter(appId, tblServiceDetail, detFilter));
                findCache.putIfAbsent(detailFilterKey, detRes);
                List<Map<String, Object>> detRows = (List<Map<String, Object>>) detRes.getOrDefault("rows", new ArrayList<>());
                if (!detRows.isEmpty()) {
                    Map<String, Object> detail = detRows.get(0);
                    Map<String, Object> detailMapped = mapDetailFull.apply(detail);
                    out.put("serviceCode", serviceCode);
                    out.put("serviceDetail", detailMapped);

                    // Related posts (same service_code, exclude current id)
                    SearchFilter relatedFilter = new SearchFilter();
                    relatedFilter.setOperator("AND");
                    List<SearchFilter> relConds = new ArrayList<>();
                    // Related: cùng service_type (bảng detail chỉ có service_type)
                    relConds.add(RecordManager.createCondition("service_type", "eq", serviceCode));
                    relConds.add(RecordManager.createCondition("status", "eq", "active"));
                    if (domain != null && !domain.isEmpty()) {
                        relConds.add(RecordManager.createCondition("domain", "like", domain));
                    }
                    relatedFilter.setConditions(relConds);

                    // 🟠 FIXED: Cache key for related posts filter
                    String relatedFilterKey = "related:" + appId + ":" + serviceCode;
                    
                    // 🟢 Build per-session pagination signature for related posts and reuse cached lastkey if any
                    // Build filter map for related posts pagination
                    Map<String, String> relFiltersSig = new HashMap<>();
                    String curId = safeStr(detail.get("id"));
                    relFiltersSig.put("excludeId", curId);
                    String relatedSig = PaginationCacheManager.buildQuerySignature(
                        domain,
                        "related:" + serviceCode,
                        relFiltersSig
                    );
                    String cachedRelKey = PaginationCacheManager.getLastKeyForPage(relatedSig, page);
                    if (cachedRelKey != null && (lastKeyParam == null || lastKeyParam.isBlank())) {
                        lastKeyParam = cachedRelKey;
                        logger.info("✅ Related Pagination Cache HIT: page={}, lastkey={}", page, lastKeyParam);
                    }

                    // 🔁 Nếu client yêu cầu page>1 nhưng chưa có lastKey cache, tự bước qua các trang trước để sinh lastKey
                    if ((lastKeyParam == null || lastKeyParam.isBlank()) && page > 1) {
                        logger.info("ℹ️ Related Pagination: deriving lastKey by stepping pages until {}", page);
                        String iterCursor = null;
                        int iterPage = 1;
                        final int stepLimit = Math.min(page - 1, 20); // tránh vòng lặp quá sâu
                        for (; iterPage <= stepLimit; iterPage++) {
                            Map<String, Object> iterRes = recordManager.filterWithPagination(
                                appId,
                                tblServiceDetail,
                                relatedFilter,
                                Math.max(1, effectiveTake + 1),
                                iterCursor
                            );
                            String next = (String) iterRes.get("nextCursor");
                            long iterTotal = ((Number) iterRes.getOrDefault("totalCount", 0)).longValue();
                            PaginationCacheManager.saveCursorForPage(
                                relatedSig,
                                iterPage,
                                iterCursor,
                                next,
                                iterTotal
                            );
                            iterCursor = next;
                            if (iterCursor == null || iterCursor.isEmpty()) {
                                logger.warn("⚠️ Related Pagination: reached end at page {} while deriving for target page {}", iterPage, page);
                                break;
                            }
                        }
                        if (iterCursor != null && !iterCursor.isEmpty() && iterPage >= page) {
                            lastKeyParam = iterCursor;
                            logger.info("✅ Derived lastKey for page {} -> {}", page, lastKeyParam);
                        } else {
                            // Không đủ dữ liệu để tới page yêu cầu, fallback page 1
                            page = 1;
                            logger.warn("⚠️ Related Pagination: fallback to page 1 do thiếu cursor cho trang yêu cầu");
                        }
                    }

                    // ✅ OPTIMIZED: Giảm từ 50 -> 30 tin để tối ưu cho 10K+ users
                    // Vẫn đủ cho 2 trang (24 tin) sau khi filter similarity >= 0.15
                    // Giảm tải DB query và similarity computation overhead
                    int relatedTakeFetch = Math.max(30, effectiveTake * 3);
                    Map<String, Object> relRes = recordManager.filterWithPagination(
                        appId, 
                        tblServiceDetail, 
                        relatedFilter, 
                        relatedTakeFetch, 
                        lastKeyParam
                    );
                    
                    // Cache the full result if no pagination params
                    if (lastKeyParam == null) {
                        findCache.putIfAbsent(relatedFilterKey, relRes);
                    }
                    
                    List<Map<String, Object>> relRows = (List<Map<String, Object>>) relRes.getOrDefault("rows", new ArrayList<>());
                    List<Map<String, Object>> filteredRelRows = new ArrayList<>();
                    // curId already computed above for signature
                    for (Map<String, Object> r : relRows) {
                        if (!curId.equals(safeStr(r.get("id")))) {
                            filteredRelRows.add(r);
                        }
                    }

                    // ✅ FIX: totalRelatedCount phải trừ 1 (loại bỏ bài hiện tại)
                    long totalFromDB = ((Number) relRes.getOrDefault("totalCount", relRows.size())).longValue();
                    long totalRelatedCount = Math.max(0, totalFromDB - 1); // Trừ 1 cho bài hiện tại
                    String relatedNextCursor = (String) relRes.get("nextCursor");
                    int relatedPageComputed = (page > 0) ? page : 1; // Luôn dùng page client yêu cầu; cursor chỉ quyết định vị trí dữ liệu
                    if ((lastKeyParam == null || lastKeyParam.isEmpty()) && relatedPageComputed > 1) {
                        logger.warn("⚠️ Related pagination: page={} requested nhưng không có lastKey/cached cursor — sẽ vẫn trả trang 1 dữ liệu", relatedPageComputed);
                    }

                    // ✅ FILTER + SORT: Chỉ giữ tin có similarity >= 0.15 (loại bỏ tin hoàn toàn không liên quan)
                    // Ngưỡng 0.15 thấp hơn 0.3 nhưng cao hơn 0 để cân bằng giữa chính xác và số lượng
                    List<Map<String, Object>> scoredRows = new ArrayList<>();
                    for (Map<String, Object> r : filteredRelRows) {
                        double sim = computeSimilarity(detail, r, serviceCode);
                        if (sim >= 0.15) {  // Loại bỏ tin quá khác biệt
                            Map<String, Object> scored = new java.util.HashMap<>(r);
                            scored.put("__similarity__", sim);
                            scoredRows.add(scored);
                        }
                    }
                    // Sort DESC by similarity (tin giống nhất lên đầu)
                    scoredRows.sort((a, b) -> {
                        double simA = (double) a.getOrDefault("__similarity__", 0.0);
                        double simB = (double) b.getOrDefault("__similarity__", 0.0);
                        return Double.compare(simB, simA);
                    });
                    
                    // ✅ CRITICAL: totalRelatedCount = số tin đã sort (không phải từ DB)
                    // Để pagination chính xác, phải dựa trên số tin thực tế sau khi sort
                    long totalRelatedSorted = scoredRows.size();
                    
                    // Lấy top effectiveTake (12 tin) có similarity cao nhất CHO TRANG HIỆN TẠI
                    List<Map<String, Object>> topSimilar = scoredRows.stream()
                        .limit(effectiveTake)
                        .collect(java.util.stream.Collectors.toList());
                    
                    // Log similarity range BEFORE removing __similarity__
                    double minSim = topSimilar.isEmpty() ? 0.0 : (double) topSimilar.get(topSimilar.size() - 1).getOrDefault("__similarity__", 0.0);
                    double maxSim = topSimilar.isEmpty() ? 0.0 : (double) topSimilar.get(0).getOrDefault("__similarity__", 0.0);
                    
                    // Remove __similarity__ before mapping
                    topSimilar.forEach(r -> r.remove("__similarity__"));
                    
                    List<Map<String, Object>> paginatedRelated = topSimilar.stream()
                        .map(mapDetail)
                        .collect(java.util.stream.Collectors.toList());
                    
                    logger.info("📊 Related posts: candidates={}, filtered(>=0.15)={}, returning top {} for page {} (similarity range: {:.3f} - {:.3f})", 
                        filteredRelRows.size(), totalRelatedSorted, paginatedRelated.size(), relatedPageComputed, minSim, maxSim);

                    out.put("relatedDetailList", paginatedRelated);
                    out.put("totalRelatedCount", totalRelatedSorted);
                    out.put("relatedPage", relatedPageComputed);
                    out.put("relatedPageSize", effectiveTake);
                    out.put("relatedNextCursor", relatedNextCursor);
                    out.put("relatedLastKey", lastKeyParam);
                    // 💾 Save per-session cursor mapping so page→cursor stays stable in this session
                    PaginationCacheManager.saveCursorForPage(
                        relatedSig,
                        relatedPageComputed,
                        lastKeyParam,
                        relatedNextCursor,
                        totalRelatedCount
                    );
                    
                    logger.info("✅ Detail page (exact slug match): returning {} related posts (page {}/{}) out of {} total (cursor next={})", 
                        paginatedRelated.size(), relatedPageComputed, (int) Math.ceil((double) totalRelatedCount / effectiveTake), totalRelatedCount, relatedNextCursor);
                    Map<String, Object> cachedOut = new HashMap<>(out);
                    trackServiceRouteVisit(appId, domain, normalizedPath, tblServiceDetail, detail, null, serviceCode, detailSlug, requestParams);
                    if (cacheableDetail) {
                        putCacheValue(propertyDetailCache, detailCacheKey, cachedOut);
                    }
                    return cachedOut;
                } else {
                    // Fallback: slug không khớp hoàn toàn, tìm kiếm nhưng KHÔNG fallback sang bài khác
                    SearchFilter fallbackFilter = new SearchFilter();
                    fallbackFilter.setOperator("AND");
                    List<SearchFilter> fbConds = new ArrayList<>();
                    fbConds.add(RecordManager.createCondition("service_type", "eq", serviceCode));
                    fbConds.add(RecordManager.createCondition("status", "eq", "active"));
                    if (domain != null && !domain.isEmpty()) {
                        fbConds.add(RecordManager.createCondition("domain", "like", domain));
                    }
                    fallbackFilter.setConditions(fbConds);

                    // 🟠 FIXED: Use cache for fallback filter (still for same service_type)
                    String fallbackFilterKey = "fallback:" + appId + ":" + serviceCode;
                    Map<String, Object> fbRes = findCache.getOrDefault(fallbackFilterKey, recordManager.filter(appId, tblServiceDetail, fallbackFilter));
                    findCache.putIfAbsent(fallbackFilterKey, fbRes);
                    List<Map<String, Object>> fbRows = (List<Map<String, Object>>) fbRes.getOrDefault("rows", new ArrayList<>());
                    if (!fbRows.isEmpty()) {
                        Map<String, Object> best = null;
                        String wantedPrefix = detailSlug + "-"; // ví dụ: "phan-mem-kho-doanh-nghiep-10-phan-mem" + "-"
                        for (Map<String, Object> r : fbRows) {
                            String slugVal = safeStr(r.get("slug"));
                            if (slugVal.equalsIgnoreCase(detailSlug) || (!wantedPrefix.isEmpty() && slugVal.startsWith(wantedPrefix))) {
                                best = r;
                                break;
                            }
                        }
                        // ❌ REMOVED FALLBACK: if (best == null) { best = fbRows.get(0); }
                        // ✅ STRICT: Nếu không tìm thấy match chính xác, return empty (không fallback)
                        if (best != null) {
                            Map<String, Object> detailMapped = mapDetailFull.apply(best);
                            out.put("serviceCode", serviceCode);
                            out.put("serviceDetail", detailMapped);
                            
                            // ✅ Related posts với pagination hỗ trợ
                            SearchFilter relatedFilter = new SearchFilter();
                            relatedFilter.setOperator("AND");
                            List<SearchFilter> relConds = new ArrayList<>();
                            relConds.add(RecordManager.createCondition("service_type", "eq", serviceCode));
                            relConds.add(RecordManager.createCondition("status", "eq", "active"));
                            if (domain != null && !domain.isEmpty()) {
                                relConds.add(RecordManager.createCondition("domain", "like", domain));
                            }
                            relatedFilter.setConditions(relConds);
                            
                            // 🟠 FIXED: Use cache for related filter in fallback case
                            // Lấy TOÀN BỘ để tính totalCount (exclude current post)
                            String relatedFilterKey = "related:" + appId + ":" + serviceCode;
                            Map<String, Object> relRes = findCache.getOrDefault(relatedFilterKey, recordManager.filter(appId, tblServiceDetail, relatedFilter));
                            findCache.putIfAbsent(relatedFilterKey, relRes);
                            List<Map<String, Object>> allRelRows = (List<Map<String, Object>>) relRes.getOrDefault("rows", new ArrayList<>());
                            String curId = safeStr(best.get("id"));
                            
                            // Filter ra current post để tính tổng số tin liên quan thực tế
                            List<Map<String, Object>> filteredRelRows = new ArrayList<>();
                            for (Map<String, Object> r : allRelRows) {
                                if (!curId.equals(safeStr(r.get("id")))) {
                                    filteredRelRows.add(r);
                                }
                            }
                            
                            // ✅ FILTER + SORT: Chỉ giữ tin có similarity >= 0.15
                            List<Map<String, Object>> scoredRows = new ArrayList<>();
                            for (Map<String, Object> r : filteredRelRows) {
                                double sim = computeSimilarity(best, r, serviceCode);
                                if (sim >= 0.15) {
                                    Map<String, Object> scored = new java.util.HashMap<>(r);
                                    scored.put("__similarity__", sim);
                                    scoredRows.add(scored);
                                }
                            }
                            // Sort DESC by similarity (tin giống nhất lên đầu)
                            scoredRows.sort((a, b) -> {
                                double simA = (double) a.getOrDefault("__similarity__", 0.0);
                                double simB = (double) b.getOrDefault("__similarity__", 0.0);
                                int cmp = Double.compare(simB, simA);
                                if (cmp != 0) return cmp;
                                // Tie-break by ID desc
                                String ida = safeStr(a.get("id"));
                                String idb = safeStr(b.get("id"));
                                try {
                                    long la = Long.parseLong(ida);
                                    long lb = Long.parseLong(idb);
                                    return Long.compare(lb, la);
                                } catch (Exception e) {
                                    return idb.compareTo(ida);
                                }
                            });
                            
                            // Remove __similarity__ sau khi sort xong
                            List<Map<String, Object>> orderedRelRows = scoredRows.stream()
                                .peek(r -> r.remove("__similarity__"))
                                .collect(java.util.stream.Collectors.toList());
                            
                            logger.info("📊 Fallback related: candidates={}, filtered(>=0.15)={}", 
                                filteredRelRows.size(), scoredRows.size());
                            long totalRelatedCount = orderedRelRows.size();
                            // 🟢 Build filter-based pagination signature and reuse cached lastkey if available
                            Map<String, String> relFiltersSig2 = new HashMap<>();
                            relFiltersSig2.put("excludeId", curId);
                            String relatedSig2 = PaginationCacheManager.buildQuerySignature(
                                domain,
                                "related:" + serviceCode,
                                relFiltersSig2
                            );
                            String cachedRelKey2 = PaginationCacheManager.getLastKeyForPage(relatedSig2, page);
                            if (cachedRelKey2 != null && (lastKeyParam == null || lastKeyParam.isBlank())) {
                                lastKeyParam = cachedRelKey2;
                                logger.info("✅ Related Pagination Cache HIT: page={}, lastkey={}", page, lastKeyParam);
                            }
                            boolean useCursor = (lastKeyParam != null && !lastKeyParam.isEmpty()) || takeParam != null;
                            int relatedTake = effectiveTake;
                            int startIndex;
                            if (useCursor && lastKeyParam != null) {
                                int idx = -1;
                                for (int i = 0; i < orderedRelRows.size(); i++) {
                                    if (lastKeyParam.equals(safeStr(orderedRelRows.get(i).get("id")))) {
                                        idx = i;
                                        break;
                                    }
                                }
                                startIndex = idx >= 0 ? idx + 1 : 0;
                            } else {
                                int relatedPage = page < 1 ? 1 : page;
                                startIndex = (relatedPage - 1) * relatedTake;
                            }
                            
                            List<Map<String, Object>> paginatedRelated = new ArrayList<>();
                            int endIndex = Math.min(startIndex + relatedTake, orderedRelRows.size());
                            
                            if (startIndex < orderedRelRows.size()) {
                                for (int i = startIndex; i < endIndex; i++) {
                                    paginatedRelated.add(mapDetail.apply(orderedRelRows.get(i)));
                                }
                            }
                            String relatedNextCursor = (endIndex < orderedRelRows.size())
                                    ? safeStr(orderedRelRows.get(endIndex - 1).get("id"))
                                    : null;
                            int relatedPageComputed = (relatedTake > 0) ? (startIndex / relatedTake) + 1 : 1;
                            
                            out.put("relatedDetailList", paginatedRelated);      // ← Chỉ trang hiện tại
                            out.put("totalRelatedCount", totalRelatedCount);     // ← Tổng số tin liên quan
                            out.put("relatedPage", relatedPageComputed);         // ← Trang hiện tại của related
                            out.put("relatedPageSize", relatedTake);             // ← Kích thước trang
                            out.put("relatedNextCursor", relatedNextCursor);     // ← Cursor cho trang sau
                            out.put("relatedLastKey", lastKeyParam);             // ← Cursor đã dùng
                            // 💾 Save per-session cursor mapping so page→cursor stays stable in this session
                            PaginationCacheManager.saveCursorForPage(
                                relatedSig2,
                                relatedPageComputed,
                                lastKeyParam,
                                relatedNextCursor,
                                totalRelatedCount
                            );
                            
                            logger.info("✅ Detail page: returning {} related posts (page {}/{}) out of {} total (cursor next={})", 
                                paginatedRelated.size(), relatedPageComputed, (int) Math.ceil((double) totalRelatedCount / relatedTake), totalRelatedCount, relatedNextCursor);
                            Map<String, Object> cachedOut = new HashMap<>(out);
                            trackServiceRouteVisit(appId, domain, normalizedPath, tblServiceDetail, best, null, serviceCode, detailSlug, requestParams);
                            if (cacheableDetail) {
                                putCacheValue(propertyDetailCache, detailCacheKey, cachedOut);
                            }
                            return cachedOut;
                        }
                    }
                }
                // If not found, fall through to category behavior below
            }

            // TRƯỜNG HỢP 2.5: DETAIL PAGE với 1 segment - "/{slug}.shtml" (tìm trực tiếp bằng slug)
            // Xử lý TRƯỚC TRƯỜNG HỢP 3 để ưu tiên tin chi tiết hơn category
            if (segs.size() == 1) {
                String detailSlugOnly = segs.get(0);
                logger.info("🔎 Trying detail lookup by slug only: {}", detailSlugOnly);

                SearchFilter detFilterSlug = new SearchFilter();
                detFilterSlug.setOperator("AND");
                List<SearchFilter> detCondsSlug = new ArrayList<>();
                detCondsSlug.add(RecordManager.createCondition("slug", "eq", detailSlugOnly));
                detCondsSlug.add(RecordManager.createCondition("status", "eq", "active"));
                if (domain != null && !domain.isEmpty()) {
                    detCondsSlug.add(RecordManager.createCondition("domain", "like", domain));
                }
                detFilterSlug.setConditions(detCondsSlug);

                Map<String, Object> detail = recordManager.find(appId, tblServiceDetail, detFilterSlug);
                
                if (detail != null && !detail.isEmpty()) {
                    String serviceTypeFromDetail = safeStr(detail.get("service_type"));
                    boolean cacheableDetailSlug = lastKeyParam == null && page <= 1;
                    String slugOnlyCacheKey = "detail:" + domain + ":" + serviceTypeFromDetail + ":" + detailSlugOnly + ":" + currentLang;
                    Map<String, Object> detailMapped = mapDetailFull.apply(detail);
                    
                    out.put("serviceCode", serviceTypeFromDetail);
                    out.put("serviceDetail", detailMapped);
                    logger.info("✅ Found detail by slug only - service_type={}, title={}", 
                        serviceTypeFromDetail, safeStr(detail.get("title")));

                    // ✅ Related posts với pagination
                    if (!serviceTypeFromDetail.isEmpty()) {
                        SearchFilter relatedFilter = new SearchFilter();
                        relatedFilter.setOperator("AND");
                        List<SearchFilter> relConds = new ArrayList<>();
                        relConds.add(RecordManager.createCondition("service_type", "eq", serviceTypeFromDetail));
                        relConds.add(RecordManager.createCondition("status", "eq", "active"));
                        if (domain != null && !domain.isEmpty()) {
                            relConds.add(RecordManager.createCondition("domain", "like", domain));
                        }
                        relatedFilter.setConditions(relConds);

                        Map<String, Object> relRes = recordManager.filter(appId, tblServiceDetail, relatedFilter);
                        List<Map<String, Object>> allRelRows = (List<Map<String, Object>>) relRes.getOrDefault("rows", new ArrayList<>());
                        String curId = safeStr(detail.get("id"));
                        
                        // Filter ra current post
                        List<Map<String, Object>> filteredRelRows = new ArrayList<>();
                        for (Map<String, Object> r : allRelRows) {
                            if (!curId.equals(safeStr(r.get("id")))) {
                                filteredRelRows.add(r);
                            }
                        }
                        
                        // ✅ FILTER + SORT: Chỉ giữ tin có similarity >= 0.15
                        List<Map<String, Object>> scoredRows = new ArrayList<>();
                        for (Map<String, Object> r : filteredRelRows) {
                            double sim = computeSimilarity(detail, r, serviceTypeFromDetail);
                            if (sim >= 0.15) {
                                Map<String, Object> scored = new java.util.HashMap<>(r);
                                scored.put("__similarity__", sim);
                                scoredRows.add(scored);
                            }
                        }
                        // Sort DESC by similarity
                        scoredRows.sort((a, b) -> {
                            double simA = (double) a.getOrDefault("__similarity__", 0.0);
                            double simB = (double) b.getOrDefault("__similarity__", 0.0);
                            int cmp = Double.compare(simB, simA);
                            if (cmp != 0) return cmp;
                            // Tie-break by ID desc
                            String ida = safeStr(a.get("id"));
                            String idb = safeStr(b.get("id"));
                            try {
                                long la = Long.parseLong(ida);
                                long lb = Long.parseLong(idb);
                                return Long.compare(lb, la);
                            } catch (Exception e) {
                                return idb.compareTo(ida);
                            }
                        });
                        
                        // Limit to reasonable number for slug-only case, then remove __similarity__
                        List<Map<String, Object>> orderedRelRows = scoredRows.stream()
                            .limit(Math.min(scoredRows.size(), 50))  // Keep up to 50 most similar for pagination
                            .peek(r -> r.remove("__similarity__"))
                            .collect(java.util.stream.Collectors.toList());
                        
                        logger.info("📊 Slug-only related: candidates={}, filtered(>=0.15)={}, keeping top {}", 
                            filteredRelRows.size(), scoredRows.size(), orderedRelRows.size());
                        long totalRelatedCount = orderedRelRows.size();
                        boolean useCursor = (lastKeyParam != null && !lastKeyParam.isEmpty()) || takeParam != null;
                        int relatedTake = effectiveTake;
                        int startIndex;
                        if (useCursor && lastKeyParam != null) {
                            int idx = -1;
                            for (int i = 0; i < orderedRelRows.size(); i++) {
                                if (lastKeyParam.equals(safeStr(orderedRelRows.get(i).get("id")))) {
                                    idx = i;
                                    break;
                                }
                            }
                            startIndex = idx >= 0 ? idx + 1 : 0;
                        } else {
                            int relatedPage = page < 1 ? 1 : page;
                            startIndex = (relatedPage - 1) * relatedTake;
                        }
                        
                        List<Map<String, Object>> paginatedRelated = new ArrayList<>();
                        int endIndex = Math.min(startIndex + relatedTake, orderedRelRows.size());
                        
                        if (startIndex < orderedRelRows.size()) {
                            for (int i = startIndex; i < endIndex; i++) {
                                paginatedRelated.add(mapDetail.apply(orderedRelRows.get(i)));
                            }
                        }
                        String relatedNextCursor = (endIndex < orderedRelRows.size())
                                ? safeStr(orderedRelRows.get(endIndex - 1).get("id"))
                                : null;
                        int relatedPageComputed = (relatedTake > 0) ? (startIndex / relatedTake) + 1 : 1;
                        
                        out.put("relatedDetailList", paginatedRelated);
                        out.put("totalRelatedCount", totalRelatedCount);
                        out.put("relatedPage", relatedPageComputed);
                        out.put("relatedPageSize", relatedTake);
                        out.put("relatedNextCursor", relatedNextCursor);
                        out.put("relatedLastKey", lastKeyParam);
                        
                        logger.info("✅ Detail (slug-only): {} related posts (page {}/{}) out of {} total (cursor next={})", 
                            paginatedRelated.size(), relatedPageComputed, (int) Math.ceil((double) totalRelatedCount / relatedTake), totalRelatedCount, relatedNextCursor);
                    }
                    Map<String, Object> cachedOut = new HashMap<>(out);
                    trackServiceRouteVisit(appId, domain, normalizedPath, tblServiceDetail, detail, null, serviceTypeFromDetail, detailSlugOnly, requestParams);
                    if (cacheableDetailSlug) {
                        putCacheValue(propertyDetailCache, slugOnlyCacheKey, cachedOut);
                    }
                    return cachedOut;
                }
                // Nếu không tìm thấy detail, fall through sang TRƯỜNG HỢP 3 (category)
                logger.info("⚠️ No detail found by slug '{}', trying category lookup", detailSlugOnly);
            }

            // TRƯỜNG HỢP 3: CATEGORY PAGE - lấy detail theo service_code hoặc group_slug
            String slug = segs.isEmpty() ? "" : segs.get(segs.size() - 1);
            
            // --- SECURITY: Sanitize slug before using in query ---
            String originalSlug = slug;
            slug = sanitizeInput(slug);
            if (!originalSlug.equals(slug)) {
                logger.warn("⚠️ SECURITY: Slug sanitized '{}' -> '{}'", originalSlug, slug);
            }
            
            logger.info("🔍 Category page detected - slug: {}", slug);
            
            // ✅ Build query signature for category pagination cache
            // Signature = domain:slug:filters (NO session ID needed)
            // This ensures same query → Same cursor → Same data for all users
            Map<String, String> filterMap = new HashMap<>();
            if (requestParams != null) {
                requestParams.forEach((k, v) -> {
                    if (v != null && !k.equals("page") && !k.equals("sid")) {
                        filterMap.put(k, String.valueOf(v));
                    }
                });
            }
            String querySig = PaginationCacheManager.buildQuerySignature(domain, slug, filterMap);
            logger.info("✅ Query signature (filter-based): {}", querySig);
            // ✅ Check PaginationCacheManager for cached cursor if page > 1 without lastkey
            if ((lastKeyParam == null || lastKeyParam.isBlank()) && page > 1) {
                String cachedKey = PaginationCacheManager.getLastKeyForPage(querySig, page);
                if (cachedKey != null && !cachedKey.isEmpty()) {
                    lastKeyParam = cachedKey;
                    logger.info("✅ Category Pagination Cache HIT: page={}, lastkey={}", page, lastKeyParam);
                }
            }

            if (tblServices != null && !tblServices.isEmpty() && slug != null && !slug.isEmpty()) {
                // Nếu slug là group legacy (ví dụ: slug == main_service_code) thì chuyển sang default_service_code động
                if(slug != null && slug.equals(main_service_code) && default_service_code != null && !default_service_code.isEmpty()) {
                    slug = default_service_code;
                    logger.info("🔄 Converted legacy group slug '{}' to default_service_code '{}'", main_service_code, default_service_code);
                }
                logger.info("🔍 Checking if slug is a group in web_services: {}", slug);
                SearchFilter groupFilter = new SearchFilter();
                groupFilter.setOperator("AND");
                groupFilter.setConditions(List.of(
                    RecordManager.createCondition("slug", "eq", slug),
                    RecordManager.createCondition("is_group_slug", "eq", true),
                    RecordManager.createCondition("is_service", "eq", true),
                    RecordManager.createCondition("status", "eq", "active"),
                    RecordManager.createCondition("domain", "like", domain)
                ));
                Map<String, Object> groupService = recordManager.find(appId, tblServices, groupFilter);
                if (groupService != null && !groupService.isEmpty()) {
                    String groupSlug = safeStr(groupService.get("group_slug"));
                    logger.info("✅ Found group service for slug '{}', group_slug='{}'", slug, groupSlug);
                    // Lấy tất cả dịch vụ thuộc group này và is_group_slug_default=true
                    SearchFilter svcFilter = new SearchFilter();
                    svcFilter.setOperator("AND");
                    List<SearchFilter> svcConds = new ArrayList<>();
                    svcConds.add(RecordManager.createCondition("group_slug", "eq", groupSlug));
                    svcConds.add(RecordManager.createCondition("is_group_slug_default", "eq", true));
                    svcConds.add(RecordManager.createCondition("status", "eq", "active"));
                    svcConds.add(RecordManager.createCondition("domain", "like", domain));
                    svcFilter.setConditions(svcConds);
                    Map<String, Object> svcResult = recordManager.filter(appId, tblServices, svcFilter);
                    List<Map<String, Object>> svcRows = (List<Map<String, Object>>) svcResult.getOrDefault("rows", new ArrayList<>());
                    logger.info("✅ Found {} services in group_slug='{}'", svcRows.size(), groupSlug);
                    // Lấy tất cả detail có service_code thuộc group này
                    List<String> serviceCodes = new ArrayList<>();
                    for (Map<String, Object> row : svcRows) {
                        String code = safeStr(row.get("service_code"));
                        if (!code.isEmpty()) serviceCodes.add(code);
                    }
                    if (!serviceCodes.isEmpty()) {
                        SearchFilter detFilter = new SearchFilter();
                        detFilter.setOperator("AND");
                        List<SearchFilter> detConds = new ArrayList<>();
                        detConds.add(RecordManager.createCondition("service_type", "in", serviceCodes));
                        detConds.add(RecordManager.createCondition("status", "eq", "active"));
                        detConds.add(RecordManager.createCondition("domain", "like", domain));
                        
                        // 🔍 FIXED: Thêm logic build search filters từ requestParams
                        // Chuỗi dùng LIKE, số dùng khoảng (gte/lte) khi có min/max
                        if (requestParams != null && !requestParams.isEmpty()) {
                            logger.info("🔍 Building search filters from requestParams: {}", requestParams);
                            
                            // Text search (q parameter)
                            if (requestParams.containsKey("q")) {
                                String searchText = sanitizeInput(String.valueOf(requestParams.get("q")));
                                if (!searchText.isEmpty()) {
                                    SearchFilter textFilter = new SearchFilter();
                                    textFilter.setOperator("OR");
                                    List<SearchFilter> textConds = new ArrayList<>();
                                    textConds.add(RecordManager.createCondition("title", "like", searchText));
                                    textConds.add(RecordManager.createCondition("excerpt", "like", searchText));
                                    textConds.add(RecordManager.createCondition("keywords", "like", searchText));
                                    textFilter.setConditions(textConds);
                                    detConds.add(textFilter);
                                    logger.info("✅ Added text search filter: q={}", searchText);
                                }
                            }
                            
                            // Property filters (for real estate)
                            if (requestParams.containsKey("propertyType")) {
                                String propType = sanitizeInput(String.valueOf(requestParams.get("propertyType")));
                                if (!propType.isEmpty() && !"all".equals(propType)) {
                                    detConds.add(RecordManager.createCondition("attributes_propertyType", "like", propType));
                                    logger.info("✅ Added propertyType filter (like): {}", propType);
                                }
                            }
                            
                            if (requestParams.containsKey("transactionType")) {
                                String transType = sanitizeInput(String.valueOf(requestParams.get("transactionType")));
                                if (!transType.isEmpty() && !"all".equals(transType)) {
                                    detConds.add(RecordManager.createCondition("attributes_transactionType", "like", transType));
                                    logger.info("✅ Added transactionType filter (like): {}", transType);
                                }
                            }

                            // Generic string LIKE filters
                            final Map<String, Object> rp1 = requestParams;
                            java.util.function.BiConsumer<String, String> addLike = (param, field) -> {
                                if (rp1.containsKey(param)) {
                                    String v = sanitizeInput(String.valueOf(rp1.get(param)));
                                    if (!v.isEmpty()) {
                                        detConds.add(RecordManager.createCondition(field, "like", v));
                                        logger.info("✅ Added LIKE filter: {} -> {}", param, v);
                                    }
                                }
                            };
                            addLike.accept("category", "attributes_category");
                            addLike.accept("platform", "attributes_platform");
                            addLike.accept("brand", "attributes_brand");
                            addLike.accept("origin", "attributes_origin");
                            addLike.accept("carType", "attributes_carType");
                            addLike.accept("fuelType", "attributes_fuelType");
                            addLike.accept("location", "attributes_location");
                            addLike.accept("date", "attributes_date");
                            addLike.accept("legalStatus", "attributes_legalStatus");
                            addLike.accept("furnished", "attributes_furnished");
                            
                            // Price range filters
                            if (requestParams.containsKey("price_min")) {
                                try {
                                    double priceMin = Double.parseDouble(String.valueOf(requestParams.get("price_min")));
                                    detConds.add(RecordManager.createCondition("attributes_price", "gte", priceMin));
                                    logger.info("✅ Added price_min filter: {}", priceMin);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid price_min: {}", requestParams.get("price_min"));
                                }
                            }
                            
                            if (requestParams.containsKey("price_max")) {
                                try {
                                    double priceMax = Double.parseDouble(String.valueOf(requestParams.get("price_max")));
                                    detConds.add(RecordManager.createCondition("attributes_price", "lte", priceMax));
                                    logger.info("✅ Added price_max filter: {}", priceMax);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid price_max: {}", requestParams.get("price_max"));
                                }
                            }
                            
                            // Area range filters
                            if (requestParams.containsKey("area_min")) {
                                try {
                                    double areaMin = Double.parseDouble(String.valueOf(requestParams.get("area_min")));
                                    detConds.add(RecordManager.createCondition("attributes_area", "gte", areaMin));
                                    logger.info("✅ Added area_min filter: {}", areaMin);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid area_min: {}", requestParams.get("area_min"));
                                }
                            }
                            
                            if (requestParams.containsKey("area_max")) {
                                try {
                                    double areaMax = Double.parseDouble(String.valueOf(requestParams.get("area_max")));
                                    detConds.add(RecordManager.createCondition("attributes_area", "lte", areaMax));
                                    logger.info("✅ Added area_max filter: {}", areaMax);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid area_max: {}", requestParams.get("area_max"));
                                }
                            }
                            
                            // Additional filters (bedrooms, bathrooms, etc.)
                            if (requestParams.containsKey("bedrooms")) {
                                try {
                                    int bedrooms = Integer.parseInt(String.valueOf(requestParams.get("bedrooms")));
                                    detConds.add(RecordManager.createCondition("attributes_bedrooms", "eq", bedrooms));
                                    logger.info("✅ Added bedrooms filter: {}", bedrooms);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid bedrooms: {}", requestParams.get("bedrooms"));
                                }
                            }
                            
                            if (requestParams.containsKey("bathrooms")) {
                                try {
                                    int bathrooms = Integer.parseInt(String.valueOf(requestParams.get("bathrooms")));
                                    detConds.add(RecordManager.createCondition("attributes_bathrooms", "eq", bathrooms));
                                    logger.info("✅ Added bathrooms filter: {}", bathrooms);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid bathrooms: {}", requestParams.get("bathrooms"));
                                }
                            }

                            // Additional numeric equals
                            if (requestParams.containsKey("floors")) {
                                try {
                                    int floors = Integer.parseInt(String.valueOf(requestParams.get("floors")));
                                    detConds.add(RecordManager.createCondition("attributes_floors", "eq", floors));
                                    logger.info("✅ Added floors filter: {}", floors);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid floors: {}", requestParams.get("floors"));
                                }
                            }
                            if (requestParams.containsKey("frontWidth")) {
                                try {
                                    double fw = Double.parseDouble(String.valueOf(requestParams.get("frontWidth")));
                                    detConds.add(RecordManager.createCondition("attributes_frontWidth", "eq", fw));
                                    logger.info("✅ Added frontWidth filter: {}", fw);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid frontWidth: {}", requestParams.get("frontWidth"));
                                }
                            }
                            if (requestParams.containsKey("seats")) {
                                try {
                                    int seats = Integer.parseInt(String.valueOf(requestParams.get("seats")));
                                    detConds.add(RecordManager.createCondition("attributes_seats", "eq", seats));
                                    logger.info("✅ Added seats filter: {}", seats);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid seats: {}", requestParams.get("seats"));
                                }
                            }
                            
                            if (requestParams.containsKey("address")) {
                                String address = sanitizeInput(String.valueOf(requestParams.get("address")));
                                if (!address.isEmpty()) {
                                    detConds.add(RecordManager.createCondition("attributes_address", "like", address));
                                    logger.info("✅ Added address filter: {}", address);
                                }
                            }
                        }
                        
                        detFilter.setConditions(detConds);
                        
                        // 🔍 DEBUG: Log final filter conditions for group slug
                        logger.info("📋 Final search filter for group slug '{}': {} conditions", groupSlug, detConds.size());
                        for (int i = 0; i < detConds.size(); i++) {
                            SearchFilter cond = detConds.get(i);
                            logger.info("  - Condition {}: field={}, type={}, operator={}", 
                                i + 1, cond.getField(), cond.getType(), cond.getOperator());
                        }
                        
                        // ✅ CURSOR DERIVATION: If page > 1 without cached cursor, walk previous pages
                        if ((lastKeyParam == null || lastKeyParam.isBlank()) && page > 1) {
                            logger.info("🔄 Category Pagination: deriving lastKey by stepping through pages until {}", page);
                            String iterCursor = null;
                            for (int iterPage = 1; iterPage < Math.min(page, 20); iterPage++) {
                                Map<String, Object> iterRes = recordManager.filterWithPagination(
                                    appId,
                                    tblServiceDetail,
                                    detFilter,
                                    effectiveTake,
                                    iterCursor
                                );
                                String next = (String) iterRes.get("nextCursor");
                                long iterTotal = ((Number) iterRes.getOrDefault("totalCount", 0)).longValue();
                                PaginationCacheManager.saveCursorForPage(
                                    querySig,
                                    iterPage,
                                    iterCursor,
                                    next,
                                    iterTotal
                                );
                                iterCursor = next;
                                if (iterCursor == null || iterCursor.isEmpty()) {
                                    logger.warn("⚠️ Category Pagination: reached end at page {} while deriving for target page {}", iterPage, page);
                                    break;
                                }
                            }
                            if (iterCursor != null && !iterCursor.isEmpty()) {
                                lastKeyParam = iterCursor;
                                logger.info("✅ Derived lastKey for category page {} -> {}", page, lastKeyParam);
                            } else {
                                page = 1;
                                lastKeyParam = null;
                                logger.warn("⚠️ Category Pagination: fallback to page 1 due to insufficient data");
                            }
                        }
                        
                        // ✅ FIX: Dùng filterWithPagination thay vì filter để hỗ trợ phân trang cursor
                        logger.info("🔍 Group slug case: Calling filterWithPagination with appId={}, table={}, effectiveTake={}, lastKeyParam='{}'", 
                            appId, tblServiceDetail, effectiveTake, lastKeyParam);
                        Map<String, Object> detResult = recordManager.filterWithPagination(
                            appId, 
                            tblServiceDetail, 
                            detFilter, 
                            effectiveTake, 
                            lastKeyParam
                        );
                        List<Map<String, Object>> detRows = (List<Map<String, Object>>) detResult.getOrDefault("rows", new ArrayList<>());
                        long totalCount = ((Number) detResult.getOrDefault("totalCount", detRows.size())).longValue();
                        String nextCursor = (String) detResult.get("nextCursor");
                        
                        List<Map<String, Object>> details = new ArrayList<>();
                        for (Map<String, Object> r : detRows) {
                            details.add(mapDetail.apply(r));
                        }
                        
                        // 💾 Save cursor mapping for this page
                        PaginationCacheManager.saveCursorForPage(
                            querySig,
                            page,
                            lastKeyParam,
                            nextCursor,
                            totalCount
                        );
                        
                        out.put("groupSlug", groupSlug);
                        out.put("details", details);
                        out.put("totalCount", totalCount);
                        out.put("page", page);
                        out.put("pageSize", effectiveTake);
                        out.put("take", effectiveTake);
                        out.put("lastkey", lastKeyParam);
                        out.put("nextCursor", nextCursor);
                        out.put("paginationMode", "cursor");
                        out.put("serviceCategory", mapServiceCategoryByLang(groupService, currentLang));
                        trackServiceRouteVisit(appId, domain, normalizedPath, tblServices, null, groupService, slug, null, requestParams);
                        logger.info("✅ Group slug case: Returned {} details (page {}/{}) with totalCount={}, nextCursor='{}', lastKeyParam='{}'", 
                            details.size(), page, (int) Math.ceil((double) totalCount / effectiveTake), totalCount, nextCursor, lastKeyParam);
                        return out;
                    }
                } else {
                    // Không phải group, xử lý như cũ (theo service_code)
                    logger.info("🔍 Searching service_code in web_services for slug: {}", slug);
                    SearchFilter svcFilter = new SearchFilter();
                    svcFilter.setOperator("AND");
                    List<SearchFilter> svcConds = new ArrayList<>();
                    svcConds.add(RecordManager.createCondition("service_code", "eq", slug));
                    svcConds.add(RecordManager.createCondition("status", "eq", "active"));
                    svcConds.add(RecordManager.createCondition("domain", "like", domain));
                    svcFilter.setConditions(svcConds);
                    Map<String, Object> service = recordManager.find(appId, tblServices, svcFilter);
                    logger.info("🔎 Truong hợp 3 có giá trị như sau {} xem slug {} domain {}", service, slug,domain);
                    String serviceCode = slug;
                    if (service != null && !service.isEmpty()) {
                        String foundCode = safeStr(service.get("service_code"));
                        serviceCode = foundCode.isEmpty() ? safeStr(service.get("id")) : foundCode;
                        logger.info("✅ Found service in web_services: service_code={}", serviceCode);
                        out.put("serviceCategory", mapServiceCategoryByLang(service, currentLang));
                    } else {
                        logger.info("ℹ️ No service found in web_services, using slug as service_code: {}", slug);
                    }
                    // Lấy tất cả detail có service_code này
                    if (serviceCode != null && !serviceCode.isEmpty()) {
                        SearchFilter detFilter = new SearchFilter();
                        detFilter.setOperator("AND");
                        List<SearchFilter> detConds = new ArrayList<>();
                        detConds.add(RecordManager.createCondition("service_type", "eq", serviceCode));
                        detConds.add(RecordManager.createCondition("status", "eq", "active"));
                        detConds.add(RecordManager.createCondition("domain", "like", domain));
                        
                        // 🔍 FIXED: Thêm logic build search filters từ requestParams  
                        if (requestParams != null && !requestParams.isEmpty()) {
                            logger.info("🔍 Building search filters from requestParams: {}", requestParams);
                            
                            // Text search (q parameter)
                            if (requestParams.containsKey("q")) {
                                String searchText = sanitizeInput(String.valueOf(requestParams.get("q")));
                                if (!searchText.isEmpty()) {
                                    SearchFilter textFilter = new SearchFilter();
                                    textFilter.setOperator("OR");
                                    List<SearchFilter> textConds = new ArrayList<>();
                                    textConds.add(RecordManager.createCondition("title", "like", searchText));
                                    textConds.add(RecordManager.createCondition("excerpt", "like", searchText));
                                    textConds.add(RecordManager.createCondition("keywords", "like", searchText));
                                    textFilter.setConditions(textConds);
                                    detConds.add(textFilter);
                                    logger.info("✅ Added text search filter: q={}", searchText);
                                }
                            }
                            
                            // Property filters (for real estate)
                            if (requestParams.containsKey("propertyType")) {
                                String propType = sanitizeInput(String.valueOf(requestParams.get("propertyType")));
                                if (!propType.isEmpty() && !"all".equals(propType)) {
                                    detConds.add(RecordManager.createCondition("attributes_propertyType", "like", propType));
                                    logger.info("✅ Added propertyType filter (like): {}", propType);
                                }
                            }

                            if (requestParams.containsKey("transactionType")) {
                                String transType = sanitizeInput(String.valueOf(requestParams.get("transactionType")));
                                if (!transType.isEmpty() && !"all".equals(transType)) {
                                    detConds.add(RecordManager.createCondition("attributes_transactionType", "like", transType));
                                    logger.info("✅ Added transactionType filter (like): {}", transType);
                                }
                            }

                            // Generic string LIKE filters
                            final Map<String, Object> rp2 = requestParams;
                            java.util.function.BiConsumer<String, String> addLike2 = (param, field) -> {
                                if (rp2.containsKey(param)) {
                                    String v = sanitizeInput(String.valueOf(rp2.get(param)));
                                    if (!v.isEmpty()) {
                                        detConds.add(RecordManager.createCondition(field, "like", v));
                                        logger.info("✅ Added LIKE filter: {} -> {}", param, v);
                                    }
                                }
                            };
                            addLike2.accept("category", "attributes_category");
                            addLike2.accept("platform", "attributes_platform");
                            addLike2.accept("brand", "attributes_brand");
                            addLike2.accept("origin", "attributes_origin");
                            addLike2.accept("carType", "attributes_carType");
                            addLike2.accept("fuelType", "attributes_fuelType");
                            addLike2.accept("location", "attributes_location");
                            addLike2.accept("date", "attributes_date");
                            addLike2.accept("legalStatus", "attributes_legalStatus");
                            addLike2.accept("furnished", "attributes_furnished");
                            
                            // Price range filters
                            if (requestParams.containsKey("price_min")) {
                                try {
                                    double priceMin = Double.parseDouble(String.valueOf(requestParams.get("price_min")));
                                    detConds.add(RecordManager.createCondition("attributes_price", "gte", priceMin));
                                    logger.info("✅ Added price_min filter: {}", priceMin);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid price_min: {}", requestParams.get("price_min"));
                                }
                            }
                            
                            if (requestParams.containsKey("price_max")) {
                                try {
                                    double priceMax = Double.parseDouble(String.valueOf(requestParams.get("price_max")));
                                    detConds.add(RecordManager.createCondition("attributes_price", "lte", priceMax));
                                    logger.info("✅ Added price_max filter: {}", priceMax);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid price_max: {}", requestParams.get("price_max"));
                                }
                            }
                            
                            // Area range filters
                            if (requestParams.containsKey("area_min")) {
                                try {
                                    double areaMin = Double.parseDouble(String.valueOf(requestParams.get("area_min")));
                                    detConds.add(RecordManager.createCondition("attributes_area", "gte", areaMin));
                                    logger.info("✅ Added area_min filter: {}", areaMin);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid area_min: {}", requestParams.get("area_min"));
                                }
                            }
                            
                            if (requestParams.containsKey("area_max")) {
                                try {
                                    double areaMax = Double.parseDouble(String.valueOf(requestParams.get("area_max")));
                                    detConds.add(RecordManager.createCondition("attributes_area", "lte", areaMax));
                                    logger.info("✅ Added area_max filter: {}", areaMax);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid area_max: {}", requestParams.get("area_max"));
                                }
                            }
                            
                            // Additional filters (bedrooms, bathrooms, etc.)
                            if (requestParams.containsKey("bedrooms")) {
                                try {
                                    int bedrooms = Integer.parseInt(String.valueOf(requestParams.get("bedrooms")));
                                    detConds.add(RecordManager.createCondition("attributes_bedrooms", "eq", bedrooms));
                                    logger.info("✅ Added bedrooms filter: {}", bedrooms);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid bedrooms: {}", requestParams.get("bedrooms"));
                                }
                            }
                            
                            if (requestParams.containsKey("bathrooms")) {
                                try {
                                    int bathrooms = Integer.parseInt(String.valueOf(requestParams.get("bathrooms")));
                                    detConds.add(RecordManager.createCondition("attributes_bathrooms", "eq", bathrooms));
                                    logger.info("✅ Added bathrooms filter: {}", bathrooms);
                                } catch (NumberFormatException e) {
                                    logger.warn("⚠️ Invalid bathrooms: {}", requestParams.get("bathrooms"));
                                }
                            }
                            
                            if (requestParams.containsKey("address")) {
                                String address = sanitizeInput(String.valueOf(requestParams.get("address")));
                                if (!address.isEmpty()) {
                                    detConds.add(RecordManager.createCondition("attributes_address", "like", address));
                                    logger.info("✅ Added address filter: {}", address);
                                }
                            }
                        }
                        
                        detFilter.setConditions(detConds);
                        
                        // 🔍 DEBUG: Log final filter conditions for service code
                        logger.info("📋 Final search filter for service_code '{}': {} conditions", serviceCode, detConds.size());
                        for (int i = 0; i < detConds.size(); i++) {
                            SearchFilter cond = detConds.get(i);
                            logger.info("  - Condition {}: field={}, type={}, operator={}", 
                                i + 1, cond.getField(), cond.getType(), cond.getOperator());
                        }
                        
                        // ✅ CURSOR DERIVATION: If page > 1 without cached cursor, walk previous pages
                        if ((lastKeyParam == null || lastKeyParam.isBlank()) && page > 1) {
                            logger.info("🔄 Service Code Pagination: deriving lastKey by stepping through pages until {}", page);
                            String iterCursor = null;
                            for (int iterPage = 1; iterPage < Math.min(page, 20); iterPage++) {
                                Map<String, Object> iterRes = recordManager.filterWithPagination(
                                    appId,
                                    tblServiceDetail,
                                    detFilter,
                                    effectiveTake,
                                    iterCursor
                                );
                                String next = (String) iterRes.get("nextCursor");
                                long iterTotal = ((Number) iterRes.getOrDefault("totalCount", 0)).longValue();
                                PaginationCacheManager.saveCursorForPage(
                                    querySig,
                                    iterPage,
                                    iterCursor,
                                    next,
                                    iterTotal
                                );
                                iterCursor = next;
                                if (iterCursor == null || iterCursor.isEmpty()) {
                                    logger.warn("⚠️ Service Code Pagination: reached end at page {} while deriving for target page {}", iterPage, page);
                                    break;
                                }
                            }
                            if (iterCursor != null && !iterCursor.isEmpty()) {
                                lastKeyParam = iterCursor;
                                logger.info("✅ Derived lastKey for service code page {} -> {}", page, lastKeyParam);
                            } else {
                                page = 1;
                                lastKeyParam = null;
                                logger.warn("⚠️ Service Code Pagination: fallback to page 1 due to insufficient data");
                            }
                        }
                        
                        // ✅ FIX: Dùng filterWithPagination thay vì filter để hỗ trợ phân trang cursor
                        logger.info("🔍 Service code case: Calling filterWithPagination with appId={}, table={}, effectiveTake={}, lastKeyParam='{}'", 
                            appId, tblServiceDetail, effectiveTake, lastKeyParam);
                        
                        Map<String, Object> detResult = recordManager.filterWithPagination(
                            appId, 
                            tblServiceDetail, 
                            detFilter, 
                            effectiveTake, 
                            lastKeyParam
                        );
                        
                        List<Map<String, Object>> detRows = (List<Map<String, Object>>) detResult.getOrDefault("rows", new ArrayList<>());
                        long totalCount = ((Number) detResult.getOrDefault("totalCount", detRows.size())).longValue();
                        String nextCursor = (String) detResult.get("nextCursor");
                        
                        List<Map<String, Object>> details = new ArrayList<>();
                        for (Map<String, Object> r : detRows) {
                            details.add(mapDetail.apply(r));
                        }
                        
                        // 💾 Save cursor mapping for this page
                        PaginationCacheManager.saveCursorForPage(
                            querySig,
                            page,
                            lastKeyParam,
                            nextCursor,
                            totalCount
                        );
                        
                        out.put("serviceCode", serviceCode);
                        out.put("details", details);
                        out.put("totalCount", totalCount);
                        out.put("page", page);
                        out.put("pageSize", effectiveTake);
                        out.put("take", effectiveTake);
                        out.put("lastkey", lastKeyParam);
                        out.put("nextCursor", nextCursor);
                        out.put("paginationMode", "cursor");
                        trackServiceRouteVisit(appId, domain, normalizedPath, tblServices, null, service, serviceCode, null, requestParams);
                        logger.info("✅ Service code case: Returned {} details (page {}/{}) with totalCount={}, nextCursor='{}', lastKeyParam='{}'", 
                            details.size(), page, (int) Math.ceil((double) totalCount / effectiveTake), totalCount, nextCursor, lastKeyParam);
                        return out;
                    }
                }
            }

            // TRƯỜNG HỢP 4: FALLBACK - không tìm thấy dữ liệu
            logger.warn("⚠️ No service data found for path: {}", normalizedPath);
            out.put("details", new ArrayList<>());
            return out;

        } catch (Exception e) {
            logger.error("❌ Error in resolveServiceListingForRoute: {}", e.getMessage(), e);
            return null;
        }
    }

    private void trackServiceRouteVisit(
            String appId,
            String domain,
            String requestPath,
            String tableToUpdate,
            Map<String, Object> detailRow,
            Map<String, Object> serviceRow,
            String serviceCodeHint,
            String slugHint,
            Map<String, Object> requestParams) {
        try {
            String cleanPath = sanitizeInput(safeStr(requestPath));
            if (cleanPath.isEmpty()) {
                cleanPath = "/";
            }
            if (isStaticFile(cleanPath)) {
                logger.debug("Skip tracking for static path: {}", cleanPath);
                return;
            }

            String ua = safeStr(requestParams != null ? requestParams.get("__user_agent") : "").toLowerCase(Locale.ROOT);
            if (isBotUserAgent(ua)) {
                return;
            }

            String source = detectTrafficSource(requestParams);
            long now = Instant.now().toEpochMilli();
            String statDate = java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString();

            String serviceCode = sanitizeInput(!safeStr(serviceCodeHint).isEmpty() ? serviceCodeHint
                    : (detailRow != null ? safeStr(detailRow.get("service_type")) : safeStr(serviceRow != null ? serviceRow.get("service_code") : "")));
            String slug = sanitizeInput(!safeStr(slugHint).isEmpty() ? slugHint
                    : safeStr(detailRow != null ? detailRow.get("slug") : ""));

            // Track only service listing/detail pages.
            if (serviceCode.isEmpty() && slug.isEmpty()) {
                logger.debug("Skip tracking due to missing service identity for path: {}", cleanPath);
                return;
            }

            ensureTrafficStatsTable(appId);

            String statKey = String.join("|",
                    statDate,
                    source,
                    sanitizeInput(safeStr(domain)),
                    sanitizeInput(serviceCode),
                    sanitizeInput(slug),
                    cleanPath);

            SearchFilter statFilter = RecordManager.createCondition("stat_key", "eq", statKey);
            Map<String, Object> existingStat = recordManager.find(appId, TABLE_SERVICE_TRAFFIC_STATS, statFilter);
            Map<String, Object> statRow = (existingStat != null && !existingStat.isEmpty())
                    ? new HashMap<>(existingStat)
                    : new HashMap<>();

            if (safeStr(statRow.get("id")).isEmpty()) {
                statRow.put("id", UUID.randomUUID().toString());
            }
            statRow.put("stat_key", statKey);
            statRow.put("app_id", appId);
            statRow.put("domain", safeStr(domain));
            statRow.put("stat_date", statDate);
            statRow.put("source", source);
            statRow.put("service_type", serviceCode);
            statRow.put("slug", slug);
            statRow.put("link_path", cleanPath);
            statRow.put("referrer", safeStr(requestParams != null ? requestParams.get("__referrer") : ""));
            statRow.put("utm_source", safeStr(requestParams != null ? requestParams.get("utm_source") : ""));
            statRow.put("utm_medium", safeStr(requestParams != null ? requestParams.get("utm_medium") : ""));
            statRow.put("utm_campaign", safeStr(requestParams != null ? requestParams.get("utm_campaign") : ""));
            statRow.put("visit_count", parseLongSafe(statRow.get("visit_count")) + 1L);
            statRow.put("updated_at", now);
            if (!statRow.containsKey("created_at")) {
                statRow.put("created_at", now);
            }
            upsertRecord(appId, TABLE_SERVICE_TRAFFIC_STATS, statRow, List.of("stat_key"));
            logger.info("✅ Tracked service visit: {} | {} | {} | visits={}", 
                statDate, source, cleanPath, statRow.get("visit_count"));

            Map<String, Object> detailRowToUpdate = detailRow;
            if (detailRowToUpdate == null && !serviceCode.isEmpty() && !slug.isEmpty() && tableToUpdate != null && !tableToUpdate.isBlank()) {
                SearchFilter detailFilter = new SearchFilter();
                detailFilter.setOperator("AND");
                List<SearchFilter> detailConditions = new ArrayList<>();
                detailConditions.add(RecordManager.createCondition("service_type", "eq", serviceCode));
                detailConditions.add(RecordManager.createCondition("slug", "eq", slug));
                if (!safeStr(domain).isEmpty()) {
                    detailConditions.add(RecordManager.createCondition("domain", "like", domain));
                }
                detailFilter.setConditions(detailConditions);
                Map<String, Object> foundDetail = recordManager.find(appId, tableToUpdate, detailFilter);
                if (foundDetail != null && !foundDetail.isEmpty()) {
                    detailRowToUpdate = foundDetail;
                }
            }

            Map<String, Object> serviceRowToUpdate = serviceRow;
            if (serviceRowToUpdate == null && !serviceCode.isEmpty() && slug.isEmpty() && tableToUpdate != null && !tableToUpdate.isBlank()) {
                SearchFilter serviceFilter = new SearchFilter();
                serviceFilter.setOperator("AND");
                List<SearchFilter> serviceConditions = new ArrayList<>();
                serviceConditions.add(RecordManager.createCondition("service_code", "eq", serviceCode));
                if (!safeStr(domain).isEmpty()) {
                    serviceConditions.add(RecordManager.createCondition("domain", "like", domain));
                }
                serviceFilter.setConditions(serviceConditions);
                Map<String, Object> foundService = recordManager.find(appId, tableToUpdate, serviceFilter);
                if (foundService != null && !foundService.isEmpty()) {
                    serviceRowToUpdate = foundService;
                }
            }

            if (detailRowToUpdate != null && tableToUpdate != null && !tableToUpdate.isBlank()) {
                incrementVisitCountersOnRow(appId, tableToUpdate, detailRowToUpdate, source, cleanPath, now);
            }
            if (serviceRowToUpdate != null && tableToUpdate != null && !tableToUpdate.isBlank()) {
                incrementVisitCountersOnRow(appId, tableToUpdate, serviceRowToUpdate, source, cleanPath, now);
            }
        } catch (Exception ex) {
            logger.debug("Skip service traffic tracking for path {}: {}", requestPath, ex.getMessage());
        }
    }

    private void ensureTrafficStatsTable(String appId) {
        if (appId == null || appId.isBlank()) {
            return;
        }
        if (trafficStatsTableReadyApps.contains(appId)) {
            return;
        }
        synchronized (trafficStatsTableReadyApps) {
            if (trafficStatsTableReadyApps.contains(appId)) {
                return;
            }
            try {
                List<String> requiredPk = List.of("stat_key");
                List<String> requiredSearch = List.of(
                        "id",
                        "stat_key",
                        "app_id",
                        "domain",
                        "stat_date",
                        "source",
                        "service_type",
                        "slug",
                        "link_path",
                        "utm_source",
                        "utm_medium",
                        "utm_campaign",
                        "visit_count");

                SearchFilter filter = RecordManager.createCondition("id", "eq", TABLE_SERVICE_TRAFFIC_STATS);
                Map<String, Object> existing = recordManager.find(appId, "index", filter);

                boolean shouldUpsert = (existing == null || existing.isEmpty());
                Map<String, Object> tableRecord = shouldUpsert ? new HashMap<>() : new HashMap<>(existing);

                Map<String, Object> struct = new HashMap<>();
                if (!shouldUpsert && tableRecord.get("struct") instanceof Map<?, ?> oldStructRaw) {
                    for (Map.Entry<?, ?> entry : oldStructRaw.entrySet()) {
                        if (entry.getKey() instanceof String key) {
                            struct.put(key, entry.getValue());
                        }
                    }
                }

                Object oldPkObj = struct.get("fieldsPK");
                Object oldSearchObj = struct.get("fieldsSearch");
                List<String> oldPk = (oldPkObj instanceof List<?> l)
                        ? l.stream().map(String::valueOf).toList()
                        : List.of();
                List<String> oldSearch = (oldSearchObj instanceof List<?> l)
                        ? l.stream().map(String::valueOf).toList()
                        : List.of();

                if (!oldPk.equals(requiredPk) || !oldSearch.containsAll(requiredSearch)) {
                    shouldUpsert = true;
                    struct.put("fieldsPK", requiredPk);
                    struct.put("fieldsSearch", requiredSearch);
                }

                if (shouldUpsert) {
                    tableRecord.put("id", TABLE_SERVICE_TRAFFIC_STATS);
                    tableRecord.put("struct", struct);
                    upsertRecord(appId, "index", tableRecord);
                    logger.info("✅ Ensured/migrated traffic stats struct for app {}", appId);
                }

                trafficStatsTableReadyApps.add(appId);
            } catch (Exception e) {
                logger.debug("Cannot ensure traffic stats table for app {}: {}", appId, e.getMessage());
            }
        }
    }

    private void incrementVisitCountersOnRow(String appId, String tableName, Map<String, Object> row, String source, String requestPath, long now) {
        if (row == null || row.isEmpty()) {
            return;
        }
        Map<String, Object> updated = new HashMap<>(row);
        if (safeStr(updated.get("id")).isEmpty()) {
            updated.put("id", UUID.randomUUID().toString());
        }

        updated.put("visit_count", parseLongSafe(updated.get("visit_count")) + 1L);
        switch (source) {
            case "google_ads" -> updated.put("visit_google_ads", parseLongSafe(updated.get("visit_google_ads")) + 1L);
            case "facebook_ads" -> updated.put("visit_facebook_ads", parseLongSafe(updated.get("visit_facebook_ads")) + 1L);
            case "google_organic" -> updated.put("visit_google_organic", parseLongSafe(updated.get("visit_google_organic")) + 1L);
            case "facebook_social" -> updated.put("visit_facebook_social", parseLongSafe(updated.get("visit_facebook_social")) + 1L);
            case "direct" -> updated.put("visit_direct", parseLongSafe(updated.get("visit_direct")) + 1L);
            default -> updated.put("visit_referral", parseLongSafe(updated.get("visit_referral")) + 1L);
        }

        updated.put("last_visit_source", source);
        updated.put("last_visit_path", requestPath);
        updated.put("last_visit_at", now);
        updated.put("updated_at", now);
        upsertRecord(appId, tableName, updated);
    }

    @SuppressWarnings("unchecked")
    private void upsertRecord(String appId, String tableName, Map<String, Object> data) {
        List<String>[] empty = (List<String>[]) new List<?>[0];
        recordManager.createRecord(appId, tableName, data, empty);
    }

    @SuppressWarnings("unchecked")
    private void upsertRecord(String appId, String tableName, Map<String, Object> data, List<String> keyFields) {
        if (keyFields == null || keyFields.isEmpty()) {
            upsertRecord(appId, tableName, data);
            return;
        }
        List<String>[] keys = (List<String>[]) new List<?>[] { keyFields };
        recordManager.createRecord(appId, tableName, data, keys);
    }

    private long parseLongSafe(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (Exception ignore) {
            return 0L;
        }
    }

    private boolean isBotUserAgent(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return false;
        }
        String ua = userAgent.toLowerCase(Locale.ROOT);
        return ua.contains("bot")
                || ua.contains("crawl")
                || ua.contains("spider")
                || ua.contains("slurp")
                || ua.contains("bingpreview")
                || ua.contains("inspectiontool");
    }

    private String detectTrafficSource(Map<String, Object> requestParams) {
        String utmSource = safeStr(requestParams != null ? requestParams.get("utm_source") : "").toLowerCase(Locale.ROOT);
        String utmMedium = safeStr(requestParams != null ? requestParams.get("utm_medium") : "").toLowerCase(Locale.ROOT);
        String referrer = safeStr(requestParams != null ? requestParams.get("__referrer") : "").toLowerCase(Locale.ROOT);

        boolean hasGoogleClickId = !safeStr(requestParams != null ? requestParams.get("gclid") : "").isEmpty()
                || !safeStr(requestParams != null ? requestParams.get("gbraid") : "").isEmpty()
                || !safeStr(requestParams != null ? requestParams.get("wbraid") : "").isEmpty();
        boolean hasFacebookClickId = !safeStr(requestParams != null ? requestParams.get("fbclid") : "").isEmpty();
        boolean paidMedium = utmMedium.contains("cpc")
                || utmMedium.contains("ppc")
                || utmMedium.contains("paid")
                || utmMedium.contains("ads")
                || utmMedium.contains("ad");

        if (hasGoogleClickId || (utmSource.contains("google") && paidMedium) || utmSource.contains("adwords")) {
            return "google_ads";
        }
        if (hasFacebookClickId
                || ((utmSource.contains("facebook") || utmSource.contains("fb") || utmSource.contains("instagram")) && paidMedium)) {
            return "facebook_ads";
        }
        if (referrer.contains("google.")) {
            return "google_organic";
        }
        if (referrer.contains("facebook.com") || referrer.contains("m.facebook.com") || referrer.contains("instagram.com")) {
            return "facebook_social";
        }
        if (referrer.isEmpty()) {
            return "direct";
        }
        return "referral";
    }

    /**
     * Deflates a given byte array.
     *
     * @param inputBytes The bytes to deflate.
     * @param compressionLevel The compression level (e.g.,
     * Deflater.DEFAULT_COMPRESSION, Deflater.BEST_COMPRESSION).
     * @return The deflated bytes.
     * @throws Exception if an I/O error occurs.
     */
    private byte[] deflateBytes(byte[] inputBytes, int compressionLevel) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(inputBytes.length);
        Deflater deflater = new Deflater(compressionLevel);
        DeflaterOutputStream dos = new DeflaterOutputStream(bos, deflater);
        try {
            dos.write(inputBytes);
        } finally {
            dos.close();
            deflater.end(); // Release resources
        }
        return bos.toByteArray();
    }
}