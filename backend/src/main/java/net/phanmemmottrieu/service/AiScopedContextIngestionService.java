package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

/**
 * AI Scoped Context Ingestion Service
 * Intelligently ingest relevant context to Lucene based on attachment analysis.
 *
 * Key responsibilities:
 * 1. Determine scope mask from multimodal attachments (what to index)
 * 2. Split currentCode/currentMenu into logical chunks
 * 3. Index only relevant chunks to Lucene (not entire file)
 * 4. Prune old indexes to prevent unbounded growth
 * 5. Support both sync (blocking) and async (non-blocking) indexing
 *
 * Scope masks:
 * - SCOPE_CODE (0x01): Current code file
 * - SCOPE_MENU (0x02): Current menu structure
 * - SCOPE_CONFIG (0x04): Configuration/metadata
 * - SCOPE_EXTERNAL (0x08): Attachment data
 *
 * @author Mr.Anh
 */
@Service
public class AiScopedContextIngestionService {

    private static final Logger log = LoggerFactory.getLogger(AiScopedContextIngestionService.class);

    // Scope bit masks
    public static final int SCOPE_CODE = 0x01;
    public static final int SCOPE_MENU = 0x02;
    public static final int SCOPE_CONFIG = 0x04;
    public static final int SCOPE_EXTERNAL = 0x08;
    public static final int SCOPE_ALL = 0x0F;

    @Autowired
    private AiBusinessMemoryVectorService businessMemoryVectorService;

    @Autowired
    private RequestContextTracer contextTracer;

    @Value("${ai.context.ingestion.enabled:true}")
    private boolean enabled;

    @Value("${ai.context.ingestion.async.enabled:true}")
    private boolean asyncEnabled;

    @Value("${ai.context.ingestion.chunk-size:2200}")
    private int chunkSize;

    @Value("${ai.context.ingestion.max-chunks-per-scope:50}")
    private int maxChunksPerScope;

    @Value("${ai.context.ingestion.prune-old-indexes:true}")
    private boolean pruneOldIndexes;

    // Async ingestion queue
    private final ExecutorService asyncExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "AiScopedIngestor");
        t.setDaemon(true);
        return t;
    });

    // Track pending ingestions
    private final Map<String, IngestionTask> pendingTasks = new ConcurrentHashMap<>();

    // ── Data Model ──────────────────────────────────────────────────────

    public static class ScopeMaskAnalysis {
        public int scopeMask;               // Bitwise OR of SCOPE_*
        public String scopeDescription;    // Human-readable description
        public Map<String, Integer> scopeReasons; // Why each scope was included
        public long analysisTimeMs;

        public ScopeMaskAnalysis(int scopeMask) {
            this.scopeMask = scopeMask;
            this.scopeReasons = new LinkedHashMap<>();
            this.analysisTimeMs = 0;
        }

        public boolean hasScope(int mask) {
            return (scopeMask & mask) != 0;
        }

        public String describe() {
            List<String> scopes = new ArrayList<>();
            if (hasScope(SCOPE_CODE)) scopes.add("CODE");
            if (hasScope(SCOPE_MENU)) scopes.add("MENU");
            if (hasScope(SCOPE_CONFIG)) scopes.add("CONFIG");
            if (hasScope(SCOPE_EXTERNAL)) scopes.add("EXTERNAL");
            return String.join("|", scopes);
        }
    }

    public static class IngestionResult {
        public boolean success;
        public int chunksIngested;
        public long totalCharsIndexed;
        public String appId;
        public int scopeMask;
        public long ingestionTimeMs;          // Time spent in ingestion
        public long totalTimeFromRequestStartMs; // End-to-end time
        public String status; // pending | completed | failed
        public String requestId;               // For tracing

        public IngestionResult(String appId) {
            this.appId = appId;
            this.success = true;
            this.status = "completed";
        }
    }

    private static class IngestionTask {
        CompletableFuture<IngestionResult> future;

        IngestionTask() {
            this.future = new CompletableFuture<>();
        }
    }

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Analyze attachment metadata to determine what scopes to ingest
     *
     * @param message User message
     * @param attachments Attachment list (JSON/images)
     * @param hasCurrentCode Whether currentCode is available
     * @param hasCurrentMenu Whether currentMenu is available
     * @return ScopeMaskAnalysis with determined scopes
     */
    public ScopeMaskAnalysis analyzeScopesFromAttachments(
        String message,
        List<Map<String, Object>> attachments,
        boolean hasCurrentCode,
        boolean hasCurrentMenu
    ) {
        long startMs = System.currentTimeMillis();
        int scopeMask = 0;
        Map<String, Integer> reasons = new LinkedHashMap<>();

        // Check message keywords
        String msgLower = message.toLowerCase();
        if (msgLower.contains("code") || msgLower.contains("function") || msgLower.contains("method")) {
            scopeMask |= SCOPE_CODE;
            reasons.put("message_contains_code_keywords", 1);
        }
        if (msgLower.contains("menu") || msgLower.contains("item") || msgLower.contains("tree")) {
            scopeMask |= SCOPE_MENU;
            reasons.put("message_contains_menu_keywords", 1);
        }

        // Analyze attachments
        if (attachments != null && !attachments.isEmpty()) {
            for (Map<String, Object> att : attachments) {
                String type = String.valueOf(att.getOrDefault("type", ""));
                String name = String.valueOf(att.getOrDefault("name", ""));

                if ("json".equalsIgnoreCase(type) || name.endsWith(".json")) {
                    // Might be menu JSON or config
                    if (name.toLowerCase().contains("menu")) {
                        scopeMask |= SCOPE_MENU;
                        reasons.put("json_attachment_is_menu", 1);
                    } else {
                        scopeMask |= SCOPE_CONFIG;
                        reasons.put("json_attachment_is_config", 1);
                    }
                } else if ("image".equalsIgnoreCase(type)) {
                    // Images might contain code screenshots or UI mockups
                    scopeMask |= SCOPE_EXTERNAL;
                    reasons.put("image_attachment_detected", 1);
                }
            }
        }

        // Default: if no explicit scopes detected, use context hints
        if (scopeMask == 0) {
            if (hasCurrentCode) {
                scopeMask |= SCOPE_CODE;
                reasons.put("default_has_currentCode", 1);
            }
            if (hasCurrentMenu) {
                scopeMask |= SCOPE_MENU;
                reasons.put("default_has_currentMenu", 1);
            }
        }

        ScopeMaskAnalysis result = new ScopeMaskAnalysis(scopeMask);
        result.scopeReasons = reasons;
        result.analysisTimeMs = System.currentTimeMillis() - startMs;

        log.debug("Scope analysis: scopeMask={} ({}) in {}ms",
                String.format("0x%02x", scopeMask), result.describe(), result.analysisTimeMs);

        return result;
    }

    /**
     * Ingest currentCode to Lucene (if scope includes SCOPE_CODE)
     *
     * @param appId Application ID
     * @param currentCode Code content
     * @param scopeMask Bit mask of scopes to ingest
     * @param async Whether to ingest asynchronously
     * @param requestId Request ID for tracing
     * @return IngestionResult with stats
     */
    public IngestionResult ingestCode(
        String appId,
        String currentCode,
        int scopeMask,
        boolean async,
        String requestId
    ) {
        if (!enabled || currentCode == null || currentCode.isEmpty() || (scopeMask & SCOPE_CODE) == 0) {
            return new IngestionResult(appId);
        }

        long startMs = System.currentTimeMillis();
        contextTracer.startPhase("ingestion_code", requestId);

        try {
            IngestionResult result;
            if (async && asyncEnabled) {
                result = ingestCodeAsync(appId, currentCode, scopeMask);
            } else {
                result = ingestCodeSync(appId, currentCode, scopeMask);
            }

            result.ingestionTimeMs = System.currentTimeMillis() - startMs;
            result.totalTimeFromRequestStartMs = contextTracer.elapsedSinceRequestStart(requestId);
            result.requestId = requestId;
            contextTracer.recordMetric(requestId, "ingestion_code_chunks", result.chunksIngested);
            contextTracer.endPhase("ingestion_code", requestId, System.currentTimeMillis() - startMs);
            return result;
        } catch (Exception e) {
            contextTracer.recordError(requestId, "ingestion_code_error", e.getMessage());
            contextTracer.endPhase("ingestion_code", requestId, System.currentTimeMillis() - startMs);
            throw e;
        }
    }

    /**
     * Ingest currentMenu to Lucene (if scope includes SCOPE_MENU)
     *
     * @param appId Application ID
     * @param currentMenu Menu JSON
     * @param scopeMask Bit mask of scopes to ingest
     * @param async Whether to ingest asynchronously
     * @param requestId Request ID for tracing
     * @return IngestionResult with stats
     */
    public IngestionResult ingestMenu(
        String appId,
        String currentMenu,
        int scopeMask,
        boolean async,
        String requestId
    ) {
        if (!enabled || currentMenu == null || currentMenu.isEmpty() || (scopeMask & SCOPE_MENU) == 0) {
            return new IngestionResult(appId);
        }

        long startMs = System.currentTimeMillis();
        contextTracer.startPhase("ingestion_menu", requestId);

        try {
            IngestionResult result;
            if (async && asyncEnabled) {
                result = ingestMenuAsync(appId, currentMenu, scopeMask);
            } else {
                result = ingestMenuSync(appId, currentMenu, scopeMask);
            }

            result.ingestionTimeMs = System.currentTimeMillis() - startMs;
            result.totalTimeFromRequestStartMs = contextTracer.elapsedSinceRequestStart(requestId);
            result.requestId = requestId;
            contextTracer.recordMetric(requestId, "ingestion_menu_chunks", result.chunksIngested);
            contextTracer.endPhase("ingestion_menu", requestId, System.currentTimeMillis() - startMs);
            return result;
        } catch (Exception e) {
            contextTracer.recordError(requestId, "ingestion_menu_error", e.getMessage());
            contextTracer.endPhase("ingestion_menu", requestId, System.currentTimeMillis() - startMs);
            throw e;
        }
    }

    /**
     * Wait for async ingestion to complete
     */
    public IngestionResult waitForIngestion(String appId, long timeoutMs) {
        IngestionTask task = pendingTasks.get(appId);
        if (task == null) {
            IngestionResult result = new IngestionResult(appId);
            result.status = "not_found";
            return result;
        }

        try {
            return task.future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            IngestionResult result = new IngestionResult(appId);
            result.status = "pending";
            result.success = false;
            log.warn("Ingestion timeout for appId={}", appId);
            return result;
        } catch (Exception e) {
            IngestionResult result = new IngestionResult(appId);
            result.status = "failed";
            result.success = false;
            log.error("Ingestion failed for appId={}: {}", appId, e.getMessage());
            return result;
        }
    }

    // ── Private Implementation ──────────────────────────────────────────

    private IngestionResult ingestCodeSync(String appId, String currentCode, int scopeMask) {
        long startMs = System.currentTimeMillis();
        IngestionResult result = new IngestionResult(appId);
        result.scopeMask = scopeMask;

        try {
            // Index in one write operation. indexDynamicContext already chunks internally,
            // so looping per chunk only increases lock contention and rewrites.
            AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexDynamicContext(
                appId,
                "currentCode",
                trimForIngestion(currentCode),
                Arrays.asList("scope_code", "currentCode"),
                scopeMask
            );

            result.chunksIngested = summary == null ? 0 : Math.max(0, summary.chunksIndexed());
            result.totalCharsIndexed = currentCode.length();
            result.ingestionTimeMs = System.currentTimeMillis() - startMs;

            log.info("Code ingestion completed: appId={}, chunks={}, chars={}, time={}ms",
                    appId, result.chunksIngested, result.totalCharsIndexed, result.ingestionTimeMs);

            if (pruneOldIndexes) {
                businessMemoryVectorService.pruneDynamicContext(appId);
            }
        } catch (Exception e) {
            result.success = false;
            result.status = "failed";
            log.error("Code ingestion failed: {}", e.getMessage(), e);
        }

        return result;
    }

    private IngestionResult ingestCodeAsync(String appId, String currentCode, int scopeMask) {
        IngestionResult result = new IngestionResult(appId);
        result.status = "pending";

        IngestionTask task = new IngestionTask();
        pendingTasks.put(appId, task);

        asyncExecutor.submit(() -> {
            try {
                IngestionResult syncResult = ingestCodeSync(appId, currentCode, scopeMask);
                task.future.complete(syncResult);
            } catch (Exception e) {
                IngestionResult errorResult = new IngestionResult(appId);
                errorResult.success = false;
                errorResult.status = "failed";
                task.future.complete(errorResult);
            }
        });

        return result;
    }

    private IngestionResult ingestMenuSync(String appId, String currentMenu, int scopeMask) {
        long startMs = System.currentTimeMillis();
        IngestionResult result = new IngestionResult(appId);
        result.scopeMask = scopeMask;

        try {
            // Same optimization as code ingestion: single-write indexing.
            AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexDynamicContext(
                appId,
                "currentMenu",
                trimForIngestion(currentMenu),
                Arrays.asList("scope_menu", "currentMenu"),
                scopeMask
            );

            result.chunksIngested = summary == null ? 0 : Math.max(0, summary.chunksIndexed());
            result.totalCharsIndexed = currentMenu.length();
            result.ingestionTimeMs = System.currentTimeMillis() - startMs;

            log.info("Menu ingestion completed: appId={}, chunks={}, chars={}, time={}ms",
                    appId, result.chunksIngested, result.totalCharsIndexed, result.ingestionTimeMs);

            if (pruneOldIndexes) {
                businessMemoryVectorService.pruneDynamicContext(appId);
            }
        } catch (Exception e) {
            result.success = false;
            result.status = "failed";
            log.error("Menu ingestion failed: {}", e.getMessage(), e);
        }

        return result;
    }

    private IngestionResult ingestMenuAsync(String appId, String currentMenu, int scopeMask) {
        IngestionResult result = new IngestionResult(appId);
        result.status = "pending";

        IngestionTask task = new IngestionTask();
        pendingTasks.put(appId, task);

        asyncExecutor.submit(() -> {
            try {
                IngestionResult syncResult = ingestMenuSync(appId, currentMenu, scopeMask);
                task.future.complete(syncResult);
            } catch (Exception e) {
                IngestionResult errorResult = new IngestionResult(appId);
                errorResult.success = false;
                errorResult.status = "failed";
                task.future.complete(errorResult);
            }
        });

        return result;
    }

    private String trimForIngestion(String content) {
        String safe = String.valueOf(content == null ? "" : content);
        int maxChars = Math.max(12000, chunkSize * Math.max(4, maxChunksPerScope));
        if (safe.length() <= maxChars) {
            return safe;
        }
        return safe.substring(0, maxChars);
    }

    /**
     * Clear pending tasks (useful for cleanup)
     */
    public void clearPendingTasks() {
        pendingTasks.clear();
        log.info("Cleared {} pending ingestion tasks", pendingTasks.size());
    }
}
