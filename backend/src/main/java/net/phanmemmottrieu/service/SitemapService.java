package net.phanmemmottrieu.service;

import net.phanmemmottrieu.data.RecordManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Dịch vụ quản lý Sitemap (LEGACY - deprecated)
 * 
 * ⚠️ SERVICE NÀY ĐÃ DEPRECATED!
 * Sử dụng SitemapGeneratorService thay thế - sitemap tự động theo thời gian
 * 
 * SitemapService chỉ giữ lại để backward compatibility với code cũ
 * Sitemap giờ được generate tự động mỗi 6 giờ bởi SitemapGeneratorService
 * 
 * @deprecated Use SitemapGeneratorService instead
 */
@Service
@Deprecated
public class SitemapService {

    private static final Logger logger = LoggerFactory.getLogger(SitemapService.class);
    
    @Value("${app.data.dir}")
    private String appDataDir;

    @Autowired(required = false)
    private AutoIndexService autoIndexService;
    
    @Autowired(required = false)
    private RecordManager recordManager;

    // Cache sitemap XML với timestamp
    private static class SitemapCache {
        String xml;
        long timestamp;
        SitemapCache(String xml) {
            this.xml = xml;
            this.timestamp = System.currentTimeMillis();
        }
        boolean isExpired(long ttlMs) {
            return (System.currentTimeMillis() - timestamp) > ttlMs;
        }
    }

    // Cache whitelist slugs hợp lệ từ database (domain:appId -> Set<slugs>)
    // TTL: 30 phút (balance giữa freshness và performance)
    private static class WhitelistCache {
        Set<String> slugs;
        long timestamp;
        WhitelistCache(Set<String> slugs) {
            this.slugs = slugs;
            this.timestamp = System.currentTimeMillis();
        }
        boolean isExpired(long ttlMs) {
            return (System.currentTimeMillis() - timestamp) > ttlMs;
        }
    }

    // TTL cho sitemap cache: 5 phút (tối ưu balance giữa freshness và performance)
    private static final long SITEMAP_CACHE_TTL_MS = 5 * 60 * 1000;
    
    // TTL cho slug whitelist cache: 30 phút
    private static final long SLUG_WHITELIST_TTL_MS = 30 * 60 * 1000;
    
    // Cache sitemap cho từng domain
    private final Map<String, SitemapCache> sitemapCache = new ConcurrentHashMap<>();
    
    // Cache valid slugs từ tbl_services + tbl_service_detail (domain:appId -> slugs)
    private final Map<String, WhitelistCache> slugWhitelistCache = new ConcurrentHashMap<>();
    
    // Visited paths lưu trong memory
    private final Map<String, Set<String>> sitemapVisited = new ConcurrentHashMap<>();
    // Lưu lastmod cho từng path
    private final Map<String, Map<String, String>> pathLastmod = new ConcurrentHashMap<>();
    
    // Lock cho mỗi domain (fine-grained locking)
    private final Map<String, ReadWriteLock> domainLocks = new ConcurrentHashMap<>();
    
    // Thread pool cho async persist (non-blocking I/O)
    private final ExecutorService asyncExecutor = Executors.newFixedThreadPool(
        Math.max(2, Runtime.getRuntime().availableProcessors() / 2),
        new ThreadFactory() {
            private final AtomicInteger counter = new AtomicInteger(0);
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "SitemapAsync-" + counter.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        }
    );
    
    // Batch queue để ghi nhiều paths cùng lúc
    private final Map<String, BlockingQueue<String>> batchQueues = new ConcurrentHashMap<>();
    
    // Batch processor threads
    private final Map<String, Future<?>> batchProcessors = new ConcurrentHashMap<>();
    
    private static final int BATCH_SIZE = 10;
    private static final long BATCH_TIMEOUT_MS = 2000; // Flush batch sau 2 giây hoặc khi đủ 10 items

    private volatile boolean running = true;

    public SitemapService() {
        logger.info("✅ SitemapService initialized with async persist + slug validation + caching");
    }

    /**
     * Lấy sitemap XML - từ cache nếu còn fresh, không thì rebuild
     */
    public String getSitemap(String hostHeader, String protocol, 
                             SitemapBuilder builder) throws IOException {
        String domainKey = normalizeDomainKey(hostHeader);
        
        // Check cache trước
        SitemapCache cached = sitemapCache.get(domainKey);
        if (cached != null && !cached.isExpired(SITEMAP_CACHE_TTL_MS)) {
            logger.info("✅ Sitemap cache hit cho domain: {} (age: {}ms)", 
                domainKey, System.currentTimeMillis() - cached.timestamp);
            return cached.xml;
        }

        // Cache miss hoặc expired -> rebuild
        logger.info("🔄 Sitemap cache miss/expired cho domain: {}, rebuilding...", domainKey);
        long startTime = System.currentTimeMillis();
        
        ReadWriteLock lock = domainLocks.computeIfAbsent(domainKey, k -> new ReentrantReadWriteLock());
        lock.readLock().lock();
        try {
            // Không đọc/ghi visited paths để tránh I/O; sitemap lấy trực tiếp từ DB trong builder
            String xml = builder.buildSitemap(hostHeader, protocol,
                Collections.emptySet(), Collections.emptyMap());
            
            // Cache kết quả
            sitemapCache.put(domainKey, new SitemapCache(xml));
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("✅ Sitemap rebuilt in {}ms cho domain: {}", duration, domainKey);
            return xml;
        } finally {
            lock.readLock().unlock();
        }
    }

    /**
     * Ghi nhận path đã render thành công (async, non-blocking)
     * Tự động schedule auto-index cho URLs hợp lệ
     * 
     * LOGIC CHẶT CHẼ:
     * - Slug PHẢI tồn tại trong tbl_services hoặc tbl_service_detail
     * - Extension PHẢI là .shtml
     * - Path format PHẢI hợp lệ (không chứa ký tự nguy hiểm)
     * - Domain PHẢI hợp lệ
     * - Nếu hợp lệ → đưa vào sitemap + schedule Google index
     * - Async processing → không ảnh hưởng hiệu suất (batch + queue)
     * 
     * @param domainOrHost Host header
     * @param normalizedPath Path đã normalize
     * @param appId App ID để query database
     * @param tblServices Tên bảng services
     * @param tblServiceDetail Tên bảng service detail
     * @param shouldIndex true để schedule auto-index
     */
    public void recordPathAsync(String domainOrHost, String normalizedPath, String appId, 
                               String tblServices, String tblServiceDetail, boolean shouldIndex) {
        // VALIDATION 1: Format path hợp lệ và có extension .shtml
        String normPath = normalizePathForSitemap(normalizedPath);
        if (normPath.isEmpty() || !isSitemapEligible(normPath)) {
            logger.debug("⏭️ Sitemap: Bỏ qua path={} (không phải .shtml hoặc format không hợp lệ)", normalizedPath);
            return;
        }
        
        // VALIDATION 2: Path format không chứa ký tự đặc biệt
        if (!isValidPathFormat(normPath)) {
            logger.warn("⚠️ Sitemap: Bỏ qua path={} (format không hợp lệ)", normPath);
            return;
        }
        
        // VALIDATION 3: Domain hợp lệ
        String domainKey = normalizeDomainKey(domainOrHost);
        if (domainOrHost == null || domainOrHost.isEmpty() || domainKey.equals("default")) {
            logger.warn("⚠️ Sitemap: Bỏ qua path={} (domain không hợp lệ: {})", normPath, domainOrHost);
            return;
        }
        
        // VALIDATION 4: Slug PHẢI tồn tại trong database (tbl_services hoặc tbl_service_detail)
        // Extract slug từ path (e.g., /bat-dong-san/ban-nha.shtml -> ban-nha hoặc /bat-dong-san.shtml -> bat-dong-san)
        String slug = extractSlugFromPath(normPath);
        if (slug.isEmpty()) {
            logger.debug("⏭️ Sitemap: Bỏ qua path={} (không thể extract slug)", normPath);
            return;
        }
        
        // Kiểm tra slug tồn tại trong database
        if (!isValidSlugInDatabase(domainKey, appId, slug, tblServices, tblServiceDetail)) {
            logger.debug("⏭️ Sitemap: Bỏ qua path={} (slug {} không tồn tại trong database)", normPath, slug);
            return;
        }
        
        String lastmodIso = formatIsoDate(System.currentTimeMillis());

        // Cập nhật lastmod in-memory ngay lập tức
        getLastmodMap(domainKey).put(normPath, lastmodIso);

        // Thêm vào batch queue
        BlockingQueue<String> queue = batchQueues.computeIfAbsent(domainKey, k -> 
            new LinkedBlockingQueue<>(100));
        
        if (queue.offer(normPath)) {
            logger.info("📝 Sitemap: Queued path={} (slug={}) cho domain={}", normPath, slug, domainKey);
            
            // Ensure batch processor đang chạy cho domain này
            ensureBatchProcessor(domainKey);
        } else {
            logger.warn("⚠️ Sitemap: Queue full cho domain={}, dropping path={}", domainKey, normPath);
        }
        
        // Schedule auto-index async (non-blocking)
        if (autoIndexService != null && shouldIndex) {
            String protocol = "https"; // Mặc định HTTPS
            String fullUrl = buildValidUrl(protocol, domainOrHost, normPath);
            
            if (fullUrl != null) {
                autoIndexService.scheduleAutoIndex(domainOrHost, fullUrl, true);
                logger.debug("📌 Auto-index: Scheduled path={} as URL={}", normPath, fullUrl);
            } else {
                logger.debug("⚠️ Auto-index: Không thể tạo URL hợp lệ cho path={}", normPath);
            }
        }
    }
    
    /**
     * Public overload - gọi từ WebSpringController với đầy đủ thông tin
     */
    public void recordPathAsync(String domainOrHost, String normalizedPath, boolean shouldIndex) {
        // Fallback method: chỉ kiểm tra format, không kiểm tra database
        // Dùng khi không có app info
        String normPath = normalizePathForSitemap(normalizedPath);
        if (normPath.isEmpty() || !isSitemapEligible(normPath) || !isValidPathFormat(normPath)) {
            logger.debug("⏭️ Sitemap: Bỏ qua path={} (format không hợp lệ)", normalizedPath);
            return;
        }
        
        String domainKey = normalizeDomainKey(domainOrHost);
        if (domainOrHost == null || domainOrHost.isEmpty() || domainKey.equals("default")) {
            logger.warn("⚠️ Sitemap: Bỏ qua path={} (domain không hợp lệ)", normPath);
            return;
        }
        
        String lastmodIso = formatIsoDate(System.currentTimeMillis());
        getLastmodMap(domainKey).put(normPath, lastmodIso);

        BlockingQueue<String> queue = batchQueues.computeIfAbsent(domainKey, k -> 
            new LinkedBlockingQueue<>(100));
        
        if (queue.offer(normPath)) {
            logger.info("📝 Sitemap: Queued path={} cho domain={}", normPath, domainKey);
            ensureBatchProcessor(domainKey);
        } else {
            logger.warn("⚠️ Sitemap: Queue full cho domain={}, dropping path={}", domainKey, normPath);
        }
        
        if (autoIndexService != null && shouldIndex) {
            String fullUrl = buildValidUrl("https", domainOrHost, normPath);
            if (fullUrl != null) {
                autoIndexService.scheduleAutoIndex(domainOrHost, fullUrl, true);
            }
        }
    }
    
    /**
     * Extract slug từ path
     * /bat-dong-san.shtml -> bat-dong-san
     * /bat-dong-san/ban-nha.shtml -> ban-nha
     * / -> (empty)
     */
    private String extractSlugFromPath(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) return "";
        
        String p = path.startsWith("/") ? path.substring(1) : path;
        
        // Get last part after last /
        int lastSlash = p.lastIndexOf('/');
        if (lastSlash != -1) {
            p = p.substring(lastSlash + 1);
        }
        
        return p.trim().isEmpty() ? "" : p.toLowerCase(Locale.ROOT);
    }
    
    /**
     * Kiểm tra slug có tồn tại trong tbl_services hoặc tbl_service_detail không
     * Dùng cache để tránh query database quá nhiều
     */
    private boolean isValidSlugInDatabase(String domainKey, String appId, String slug, 
                                         String tblServices, String tblServiceDetail) {
        if (recordManager == null || appId == null || appId.isEmpty() || 
            tblServices == null || tblServiceDetail == null) {
            logger.debug("⚠️ Sitemap: RecordManager hoặc app info không đủ, skip database validation");
            return true; // Fallback: cho phép nếu không có info
        }
        
        // Check whitelist cache
        String cacheKey = domainKey + ":" + appId;
        WhitelistCache cached = slugWhitelistCache.get(cacheKey);
        if (cached != null && !cached.isExpired(SLUG_WHITELIST_TTL_MS)) {
            boolean found = cached.slugs.contains(slug);
            logger.debug("✅ Slug cache hit: slug={}, found={}", slug, found);
            return found;
        }
        
        // Cache miss -> query database
        logger.info("🔄 Slug whitelist cache miss cho domain={}, appId={}, rebuilding...", domainKey, appId);
        try {
            Set<String> validSlugs = loadValidSlugsFromDatabase(appId, tblServices, tblServiceDetail);
            slugWhitelistCache.put(cacheKey, new WhitelistCache(validSlugs));
            
            boolean found = validSlugs.contains(slug);
            logger.debug("✅ Slug database check: slug={}, found={}", slug, found);
            return found;
        } catch (Exception e) {
            logger.warn("⚠️ Sitemap: Error checking slug in database: {}, allowing fallback", e.getMessage());
            return true; // Fallback: cho phép nếu error
        }
    }
    
    /**
     * Load tất cả valid slugs từ database (tbl_services + tbl_service_detail)
     * Chỉ lấy .shtml pages
     */
    private Set<String> loadValidSlugsFromDatabase(String appId, String tblServices, String tblServiceDetail) {
        Set<String> slugs = ConcurrentHashMap.newKeySet();
        
        try {
            // Query tbl_services: slugs của categories
            // (đã có slug trong tbl_services)
            Map<String, Object> servResult = recordManager.filter(appId, tblServices, null);
            List<Map<String, Object>> servRows = (List<Map<String, Object>>) servResult.getOrDefault("rows", new ArrayList<>());
            for (Map<String, Object> row : servRows) {
                Object slugObj = row.get("slug");
                if (slugObj != null && !slugObj.toString().isEmpty()) {
                    slugs.add(slugObj.toString().toLowerCase(Locale.ROOT));
                }
            }
            logger.info("✅ Sitemap: Loaded {} slugs từ tbl_services", servRows.size());
            
            // Query tbl_service_detail: slugs của detail pages
            Map<String, Object> detailResult = recordManager.filter(appId, tblServiceDetail, null);
            List<Map<String, Object>> detailRows = (List<Map<String, Object>>) detailResult.getOrDefault("rows", new ArrayList<>());
            for (Map<String, Object> row : detailRows) {
                Object slugObj = row.get("slug");
                if (slugObj != null && !slugObj.toString().isEmpty()) {
                    slugs.add(slugObj.toString().toLowerCase(Locale.ROOT));
                }
            }
            logger.info("✅ Sitemap: Loaded {} slugs từ tbl_service_detail", detailRows.size());
            
            logger.info("✅ Sitemap: Total valid slugs: {}", slugs.size());
        } catch (Exception e) {
            logger.error("❌ Sitemap: Error loading slugs from database: {}", e.getMessage(), e);
        }
        
        return slugs;
    }

    /**
     * Đảm bảo batch processor đang chạy cho domain
     */
    private void ensureBatchProcessor(String domainKey) {
        batchProcessors.computeIfAbsent(domainKey, k -> {
            return asyncExecutor.submit(() -> batchProcessLoop(k));
        });
    }

    /**
     * Batch processor loop - ghi nhân paths mỗi 2 giây hoặc khi đủ 10 items
     */
    private void batchProcessLoop(String domainKey) {
        BlockingQueue<String> queue = batchQueues.get(domainKey);
        if (queue == null) return;

        List<String> batch = new ArrayList<>(BATCH_SIZE);
        
        while (running && !Thread.currentThread().isInterrupted()) {
            try {
                batch.clear();
                
                // Chờ item đầu tiên (blocking)
                String first = queue.poll(BATCH_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                if (first != null) {
                    batch.add(first);
                }
                
                // Collect thêm (non-blocking) đến khi đủ BATCH_SIZE hoặc timeout
                queue.drainTo(batch, BATCH_SIZE - 1);
                
                if (!batch.isEmpty()) {
                    // Write batch paths
                    WriteBatchResult result = writeBatchPaths(domainKey, batch);
                    if (result.success) {
                        logger.info("✅ Sitemap: Batch write {} paths cho domain={}", 
                            batch.size(), domainKey);
                        // Invalidate cache để rebuild next time
                        invalidateSitemapCache(domainKey);
                    } else {
                        logger.warn("⚠️ Sitemap: Batch write failed cho domain={}: {}", 
                            domainKey, result.error);
                    }
                }
            } catch (InterruptedException e) {
                logger.warn("⚠️ Sitemap batch processor interrupted cho domain={}", domainKey);
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                logger.error("❌ Sitemap batch processor error cho domain={}: {}", 
                    domainKey, e.getMessage(), e);
            }
        }
    }

    /**
     * Result của batch write
     */
    private static class WriteBatchResult {
        boolean success;
        String error;
        WriteBatchResult(boolean success, String error) {
            this.success = success;
            this.error = error;
        }
    }

    /**
     * Ghi batch paths xuống disk
     */
    private WriteBatchResult writeBatchPaths(String domainKey, List<String> newPaths) {
        try {
            ReadWriteLock lock = domainLocks.computeIfAbsent(domainKey, k -> new ReentrantReadWriteLock());
            lock.writeLock().lock();
            try {
                // Load existing paths
                Set<String> existing = sitemapVisited.computeIfAbsent(domainKey, k -> {
                    try {
                        return loadVisitedPathsFromDisk(domainKey);
                    } catch (IOException e) {
                        logger.warn("⚠️ Failed to load visited paths: {}", e.getMessage());
                        return ConcurrentHashMap.newKeySet();
                    }
                });

                Map<String, String> lastmodMap = getLastmodMap(domainKey);
                
                // Merge new paths
                boolean changed = false;
                for (String path : newPaths) {
                    String nowIso = formatIsoDate(System.currentTimeMillis());
                    String prev = lastmodMap.get(path);
                    lastmodMap.put(path, nowIso);
                    if (existing.add(path)) {
                        changed = true;
                    } else if (!nowIso.equals(prev)) {
                        changed = true; // cập nhật lastmod
                    }
                }
                
                if (changed) {
                    // Write to disk (bao gồm lastmod)
                    persistVisitedPathsToDisk(domainKey, existing, lastmodMap);
                    return new WriteBatchResult(true, null);
                } else {
                    return new WriteBatchResult(true, null); // All paths already existed
                }
            } finally {
                lock.writeLock().unlock();
            }
        } catch (IOException e) {
            return new WriteBatchResult(false, e.getMessage());
        }
    }

    /**
     * Load visited paths từ memory (hoặc disk nếu chưa load)
     */
    private Set<String> loadVisitedPaths(String domainKey) {
        return sitemapVisited.computeIfAbsent(domainKey, k -> {
            try {
                return loadVisitedPathsFromDisk(k);
            } catch (Exception e) {
                logger.warn("⚠️ Không thể load visited paths cho domain {}: {}", k, e.getMessage());
                return new ConcurrentHashMap<String, Boolean>().keySet(true);
            }
        });
    }

    /**
     * Load paths từ disk với validation chặt chẽ
     */
    private Set<String> loadVisitedPathsFromDisk(String domainKey) throws IOException {
        Path dir = Paths.get(appDataDir, "sitemap");
        Files.createDirectories(dir);
        Path file = dir.resolve("visited-" + domainKey + ".txt");
        
        Set<String> set = ConcurrentHashMap.newKeySet();
        Map<String, String> lastmodMap = getLastmodMap(domainKey);
        lastmodMap.clear();

        String defaultLastmod = formatIsoDate(Files.exists(file)
                ? Files.getLastModifiedTime(file).toMillis()
                : System.currentTimeMillis());
        
        if (Files.exists(file)) {
            int validCount = 0;
            int invalidCount = 0;
            int duplicateCount = 0;
            
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (line == null || line.trim().isEmpty()) continue;
                
                String[] parts = line.split("\\|", 2);
                String rawPath = parts[0];
                String lm = parts.length > 1 ? parts[1].trim() : "";
                
                // Normalize và validate
                String norm = normalizePathForSitemap(rawPath);
                
                // Chỉ thêm nếu path hợp lệ và không trùng
                if (!norm.isEmpty() && isSitemapEligible(norm) && isValidPathFormat(norm)) {
                    if (set.add(norm)) { // Set.add() trả về false nếu element đã tồn tại
                        lastmodMap.put(norm, lm.isEmpty() ? defaultLastmod : lm);
                        validCount++;
                    } else {
                        duplicateCount++;
                        logger.debug("⏭️ Sitemap: Bỏ qua path trùng lặp từ disk: {}", norm);
                    }
                } else {
                    invalidCount++;
                    logger.debug("⏭️ Sitemap: Bỏ qua path không hợp lệ từ disk: {}", rawPath);
                }
            }
            
            if (invalidCount > 0 || duplicateCount > 0) {
                logger.info("✅ Sitemap: Loaded {} valid paths, filtered {} invalid, {} duplicates cho domain={}",
                    validCount, invalidCount, duplicateCount, domainKey);
            }
        }
        
        return set;
    }

    /**
     * Persist paths xuống disk
     */
    private void persistVisitedPathsToDisk(String domainKey, Set<String> paths, Map<String, String> lastmodMap) throws IOException {
        Path dir = Paths.get(appDataDir, "sitemap");
        Files.createDirectories(dir);
        Path file = dir.resolve("visited-" + domainKey + ".txt");
        
        List<String> lines = new ArrayList<>(paths);
        Collections.sort(lines);
        List<String> serialized = new ArrayList<>(lines.size());
        for (String p : lines) {
            String lm = lastmodMap.getOrDefault(p, formatIsoDate(System.currentTimeMillis()));
            serialized.add(p + "|" + lm);
        }

        Files.write(file, serialized, StandardCharsets.UTF_8, 
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }

    /**
     * Invalidate cache khi có update
     */
    private void invalidateSitemapCache(String domainKey) {
        sitemapCache.remove(domainKey);
    }

    /**
     * Normalize domain key
     */
    public String normalizeDomainKey(String hostHeader) {
        if (hostHeader == null || hostHeader.isEmpty()) return "default";
        String d = hostHeader.toLowerCase(Locale.ROOT).trim();
        if (d.startsWith("www.")) d = d.substring(4);
        d = d.replaceAll("[^a-z0-9.-]", "-");
        return d.isEmpty() ? "default" : d;
    }

    /**
     * Normalize path - chuẩn hóa đồng nhất để tránh trùng lặp
     */
    public String normalizePathForSitemap(String path) {
        if (path == null || path.isEmpty()) return "/";
        
        String p = path.trim();
        
        // Remove query string và fragment
        int queryIdx = p.indexOf('?');
        if (queryIdx != -1) {
            p = p.substring(0, queryIdx);
        }
        int fragmentIdx = p.indexOf('#');
        if (fragmentIdx != -1) {
            p = p.substring(0, fragmentIdx);
        }
        
        // Ensure bắt đầu bằng /
        if (!p.startsWith("/")) p = "/" + p;
        
        // Remove double slashes
        while (p.contains("//")) {
            p = p.replace("//", "/");
        }
        
        // Remove trailing slash (trừ homepage)
        if (p.length() > 1 && p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        
        // Lowercase để tránh trùng lặp do case khác nhau
        p = p.toLowerCase(Locale.ROOT);
        
        return p;
    }

    /**
     * Check if path eligible cho sitemap
     */
    public boolean isSitemapEligible(String path) {
        if (path == null || path.isEmpty()) return false;
        String p = normalizePathForSitemap(path);
        if ("/".equals(p)) return true;

        String lower = p.toLowerCase(Locale.ROOT);
        
        // Loại bỏ các đường dẫn static resources
        if (lower.startsWith("/app_images/")) return false;
        if (lower.startsWith("/assets/")) return false;
        if (lower.startsWith("/static/")) return false;
        if (lower.startsWith("/public/")) return false;
        if (lower.startsWith("/dist/")) return false;
        if (lower.startsWith("/frontend/")) return false;
        if (lower.startsWith("/backend/")) return false;
        if (lower.startsWith("/api/")) return false;
        if (lower.startsWith("/ssr/")) return false;

        // Loại bỏ các file đặc biệt
        if (lower.equals("/favicon.ico")) return false;
        if (lower.equals("/robots.txt")) return false;
        if (lower.equals("/sitemap.xml")) return false;
        if (lower.equals("/manifest.json")) return false;
        if (lower.equals("/version.json")) return false;
        if (lower.equals("/service-worker.js")) return false;
        if (lower.endsWith(".ico")) return false;
        if (lower.endsWith(".png")) return false;
        if (lower.endsWith(".jpg")) return false;
        if (lower.endsWith(".jpeg")) return false;
        if (lower.endsWith(".gif")) return false;
        if (lower.endsWith(".svg")) return false;
        if (lower.endsWith(".webp")) return false;
        if (lower.endsWith(".css")) return false;
        if (lower.endsWith(".js")) return false;
        if (lower.endsWith(".json")) return false;
        if (lower.endsWith(".xml")) return false;
        if (lower.endsWith(".txt")) return false;
        
        // Accept clean URLs: homepage or paths without file extensions
        // Pattern: / or /slug or /category/slug (no .shtml extension)
        if ("/".equals(lower)) return true;
        return !lower.contains(".") || lower.endsWith("/");
    }
    
    /**
     * Validate path format - kiểm tra format URL hợp lệ
     */
    private boolean isValidPathFormat(String path) {
        if (path == null || path.isEmpty()) return false;
        if ("/".equals(path)) return true;
        
        // Không chứa ký tự đặc biệt nguy hiểm
        if (path.contains("..")) return false; // Path traversal
        if (path.contains("<")) return false;
        if (path.contains(">")) return false;
        if (path.contains("\"")) return false;
        if (path.contains("'")) return false;
        if (path.contains(";")) return false;
        if (path.contains("&")) return false; // Query string nên đã bị remove
        if (path.contains("|")) return false;
        if (path.contains("`")) return false;
        if (path.contains("$")) return false;
        if (path.contains("(")) return false;
        if (path.contains(")")) return false;
        if (path.contains("{")) return false;
        if (path.contains("}")) return false;
        if (path.contains("[")) return false;
        if (path.contains("]")) return false;
        if (path.contains("\\")) return false; // Backslash
        
        // Path phải bắt đầu bằng /
        if (!path.startsWith("/")) return false;
        
        // Không có whitespace
        if (path.contains(" ")) return false;
        if (path.contains("\t")) return false;
        if (path.contains("\n")) return false;
        if (path.contains("\r")) return false;
        
        // Độ dài hợp lý (max 500 chars)
        if (path.length() > 500) return false;
        
        return true;
    }
    
    /**
     * Build valid URL từ components
     */
    private String buildValidUrl(String protocol, String host, String path) {
        try {
            if (protocol == null || host == null || path == null) return null;
            
            // Validate protocol
            if (!protocol.equals("http") && !protocol.equals("https")) {
                return null;
            }
            
            // Normalize host (remove www. nếu có)
            String normalizedHost = host.toLowerCase(Locale.ROOT).trim();
            if (normalizedHost.startsWith("www.")) {
                normalizedHost = normalizedHost.substring(4);
            }
            
            // Validate host format (basic)
            if (normalizedHost.isEmpty() || !normalizedHost.contains(".")) {
                return null;
            }
            
            // Validate path
            if (!isValidPathFormat(path)) {
                return null;
            }
            
            // Build URL
            String url = protocol + "://www." + normalizedHost + path;
            
            // Final validation: URL không quá dài
            if (url.length() > 2000) {
                return null;
            }
            
            return url;
        } catch (Exception e) {
            logger.warn("⚠️ Failed to build valid URL: protocol={}, host={}, path={}", 
                protocol, host, path);
            return null;
        }
    }

    /**
     * Interface for building sitemap XML
     */
    public interface SitemapBuilder {
        String buildSitemap(String hostHeader, String protocol, Set<String> visitedPaths, Map<String, String> lastmodMap) throws IOException;
    }

    /**
     * Lấy bản đồ lastmod cho domain
     */
    public Map<String, String> getLastmodMap(String domainKey) {
        return pathLastmod.computeIfAbsent(domainKey, k -> new ConcurrentHashMap<>());
    }

    /**
     * Format thời gian thành ISO yyyy-MM-dd (UTC)
     */
    private String formatIsoDate(long epochMillis) {
        // Dùng định dạng ISO_OFFSET_DATE_TIME với múi giờ +07:00 để khớp yêu cầu Google
        return DateTimeFormatter.ISO_OFFSET_DATE_TIME
                .withZone(ZoneOffset.ofHours(7))
                .format(Instant.ofEpochMilli(epochMillis));
    }

    /**
     * Shutdown executor gracefully
     */
    public void shutdown() {
        asyncExecutor.shutdown();
        try {
            if (!asyncExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                running = false;
                asyncExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            asyncExecutor.shutdownNow();
        }
    }
}
