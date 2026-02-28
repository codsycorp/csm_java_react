package net.phanmemmottrieu.service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import net.phanmemmottrieu.cache.ServiceDataCacheManager;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;

/**
 * Warm cache lúc startup và theo lịch định kỳ.
 * Pre-load top pages vào cache để giảm MISS rate ban đầu.
 */
@Service
public class CacheWarmingScheduler {

    private static final Logger logger = LoggerFactory.getLogger(CacheWarmingScheduler.class);

    @Autowired(required = false)
    private RecordManager recordManager;

    @Autowired(required = false)
    private ServiceDataCacheManager serviceDataCacheManager;

    @Autowired(required = false)
    private RestTemplate restTemplate;

    private final ExecutorService executorService = Executors.newFixedThreadPool(2);

    /**
     * Chạy lúc startup để warm cache cho các domain chính.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void warmCacheOnStartup() {
        logger.info("🔥 Starting cache warming on application startup...");
        CompletableFuture.runAsync(this::warmCacheAsync, executorService);
    }

    /**
     * Chạy theo lịch (mỗi 30 phút) để refresh cache cho hot domains.
     */
    @Scheduled(fixedRate = 30 * 60 * 1000) // 30 minutes
    public void warmCacheScheduled() {
        logger.info("🔥 Scheduled cache warming triggered...");
        CompletableFuture.runAsync(this::warmCacheAsync, executorService);
    }

    private void warmCacheAsync() {
        try {
            // Lấy danh sách domains từ sys_la_routers
            List<String> domains = getDomainList();
            if (domains.isEmpty()) {
                logger.warn("⚠️ No domains found in sys_la_routers, skipping cache warming");
                return;
            }

            logger.info("🔥 Warming cache for {} domains...", domains.size());
            int warmed = 0;

            for (String domain : domains) {
                try {
                    // Warm sitemap cache
                    if (serviceDataCacheManager != null) {
                        logger.info("🔥 Warming sitemap cache for domain: {}", domain);
                        // Gọi endpoint sitemap để trigger Nginx + backend cache
                        warmUrlAsync("https://" + domain + "/sitemap.xml");
                    }

                    // Warm homepage
                    logger.info("🔥 Warming homepage for domain: {}", domain);
                    warmUrlAsync("https://" + domain + "/");

                    // Warm top categories (nếu có, lấy từ config)
                    logger.info("🔥 Warming top pages for domain: {}", domain);
                    warmTopPagesForDomain(domain);

                    warmed++;
                } catch (Exception e) {
                    logger.warn("⚠️ Error warming cache for domain {}: {}", domain, e.getMessage());
                }
            }

            logger.info("✅ Cache warming completed for {} domains", warmed);
        } catch (Exception e) {
            logger.error("❌ Error during cache warming: {}", e.getMessage(), e);
        }
    }

    /**
     * Lấy danh sách domains từ sys_la_routers.
     */
    private List<String> getDomainList() {
        List<String> domains = new ArrayList<>();
        try {
            if (recordManager == null) {
                logger.warn("⚠️ RecordManager not available, skipping domain list fetch");
                return domains;
            }

            SearchFilter filter = new SearchFilter();
            filter.setOperator("AND");
            filter.setConditions(List.of(
                    RecordManager.createCondition("run", "eq", 1),
                    RecordManager.createCondition("domain_name", "noteq", "")));

            Map<String, Object> result = recordManager.filter("csm", "sys_la_routers", filter);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", new ArrayList<>());

            Set<String> uniqueDomains = new LinkedHashSet<>();
            for (Map<String, Object> row : rows) {
                Object domainObj = row.get("domain_name");
                if (domainObj != null && !domainObj.toString().isEmpty()) {
                    uniqueDomains.add(domainObj.toString());
                }
            }

            domains.addAll(uniqueDomains);
            logger.info("📋 Found {} unique domains for warming: {}", domains.size(), domains);
        } catch (Exception e) {
            logger.error("❌ Error fetching domain list: {}", e.getMessage());
        }
        return domains;
    }

    /**
     * Warm top pages cho một domain (homepage + sitemap).
     */
    private void warmTopPagesForDomain(String domain) {
        try {
            // Fetch top routes từ sys_la_routers cho domain này
            SearchFilter filter = new SearchFilter();
            filter.setOperator("AND");
            filter.setConditions(List.of(
                    RecordManager.createCondition("domain_name", "eq", domain),
                    RecordManager.createCondition("run", "eq", 1)));

            Map<String, Object> result = recordManager.filter("csm", "sys_la_routers", filter);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", new ArrayList<>());

            // Warm top 10 routes
            int warmCount = 0;
            for (Map<String, Object> row : rows) {
                if (warmCount >= 10) break;

                Object fCaseObj = row.get("f_case");
                if (fCaseObj != null) {
                    String fCase = fCaseObj.toString().trim();
                    if (!fCase.isEmpty() && !"default".equalsIgnoreCase(fCase)) {
                        String url = "https://" + domain + "/" + fCase;
                        warmUrlAsync(url);
                        warmCount++;
                    }
                }
            }

            logger.info("🔥 Warmed {} top pages for domain: {}", warmCount, domain);
        } catch (Exception e) {
            logger.warn("⚠️ Error warming top pages for domain {}: {}", domain, e.getMessage());
        }
    }

    /**
     * Warm một URL bằng HTTP GET (async, non-blocking).
     * Triggers Nginx cache + backend cache.
     */
    private void warmUrlAsync(String url) {
        CompletableFuture.runAsync(() -> {
            try {
                if (restTemplate == null) {
                    logger.debug("⚠️ RestTemplate not available, skipping URL warm: {}", url);
                    return;
                }

                long startTime = System.currentTimeMillis();
                ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
                long duration = System.currentTimeMillis() - startTime;

                if (response.getStatusCode().is2xxSuccessful()) {
                    logger.info("✅ Warmed URL: {} ({}ms, status: {})", url, duration, response.getStatusCodeValue());
                } else {
                    logger.warn("⚠️ Warm URL failed: {} (status: {})", url, response.getStatusCodeValue());
                }
            } catch (Exception e) {
                logger.warn("⚠️ Error warming URL {}: {}", url, e.getMessage());
            }
        }, executorService);
    }

    public void shutdown() {
        logger.info("Shutting down cache warming executor");
        executorService.shutdown();
    }
}
