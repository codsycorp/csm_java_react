package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;

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
 * Scope masks (MUST match AiMultimodalScannerService constants exactly):
 * - SCOPE_MENU (0x01): Current menu structure
 * - SCOPE_CODE (0x02): Current code file
 * - SCOPE_CONFIG (0x04): Configuration/metadata
 * - SCOPE_EXTERNAL (0x08): Attachment data
 *
 * @author Mr.Anh
 */
@Service
public class AiScopedContextIngestionService {

    private static final Logger log = LoggerFactory.getLogger(AiScopedContextIngestionService.class);

    // Scope bit masks — aligned with AiMultimodalScannerService.SCOPE_MENU/SCOPE_CODE
    public static final int SCOPE_MENU = 0x01;
    public static final int SCOPE_CODE = 0x02;
    public static final int SCOPE_CONFIG = 0x04;
    public static final int SCOPE_EXTERNAL = 0x08;
    public static final int SCOPE_ALL = 0x0F;

    @Autowired
    private AiBusinessMemoryVectorService businessMemoryVectorService;

    @Autowired
    private RequestContextTracer contextTracer;

    @Autowired(required = false)
    private AiIntentClassifierService aiIntentClassifierService;

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

    @Value("${ai.context.ingestion.large-code.enabled:true}")
    private boolean largeCodeIngestEnabled;

    @Value("${ai.context.ingestion.large-code.threshold-chars:45000}")
    private int largeCodeThresholdChars;

    @Value("${ai.context.ingestion.large-code.max-chars:600000}")
    private int largeCodeMaxChars;

    // Async ingestion queue
    private final ExecutorService asyncExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "AiScopedIngestor");
        t.setDaemon(true);
        return t;
    });

    // Track pending ingestions
    private final Map<String, IngestionTask> pendingTasks = new ConcurrentHashMap<>();
    private final Map<String, IngestionTask> pendingLargeCodeTasks = new ConcurrentHashMap<>();
    private final Map<String, String> largeCodeContentHashByEditorKey = new ConcurrentHashMap<>();

    private static final Pattern CODE_REQUEST_PATTERN = Pattern.compile("(?i)\\b(code|class|method|function|bug|fix|refactor|compile|build|java|typescript|ts|js|api)\\b");
    private static final Pattern MENU_REQUEST_PATTERN = Pattern.compile("(?i)\\b(menu|screen|form|field|tree|module|flow|trigger|report|json menu)\\b");
    private static final Pattern CONFIG_REQUEST_PATTERN = Pattern.compile("(?i)\\b(config|setting|schema|env|property|metadata|yaml|yml|ini)\\b");

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

        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String msgLower = safeMessage.toLowerCase(Locale.ROOT);

        // Stage 1: Intent-aware first-pass routing (fast, bounded)
        if (aiIntentClassifierService != null && !safeMessage.isBlank()) {
            try {
                AiIntentClassifierService.IntentClassification intent = aiIntentClassifierService.classify(
                    safeMessage,
                    hasCurrentMenu ? "menu" : "code",
                    hasCurrentCode ? "ctx" : "",
                    hasCurrentMenu ? "ctx" : "",
                    "scope_ingest_" + System.currentTimeMillis());
                String intentClass = String.valueOf(intent.intentClass == null ? "" : intent.intentClass).trim().toLowerCase(Locale.ROOT);
                if ("code_edit".equals(intentClass) || "code_analyze".equals(intentClass)) {
                    scopeMask |= SCOPE_CODE;
                    reasons.put("intent_code", 1);
                } else if ("menu_edit".equals(intentClass) || "menu_design".equals(intentClass)) {
                    scopeMask |= SCOPE_MENU;
                    reasons.put("intent_menu", 1);
                }
            } catch (Exception ignored) {
                // Never block ingestion on classifier failure.
            }
        }

        // Stage 2: Lightweight lexical inference from user message
        if (CODE_REQUEST_PATTERN.matcher(msgLower).find()) {
            scopeMask |= SCOPE_CODE;
            reasons.put("message_code_signal", 1);
        }
        if (MENU_REQUEST_PATTERN.matcher(msgLower).find()) {
            scopeMask |= SCOPE_MENU;
            reasons.put("message_menu_signal", 1);
        }
        if (CONFIG_REQUEST_PATTERN.matcher(msgLower).find()) {
            scopeMask |= SCOPE_CONFIG;
            reasons.put("message_config_signal", 1);
        }

        // Analyze attachments
        if (attachments != null && !attachments.isEmpty()) {
            for (Map<String, Object> att : attachments) {
                String type = String.valueOf(att.getOrDefault("type", ""));
                String name = String.valueOf(att.getOrDefault("name", "")).toLowerCase(Locale.ROOT);
                String kind = String.valueOf(att.getOrDefault("kind", "")).toLowerCase(Locale.ROOT);
                String contextRole = String.valueOf(att.getOrDefault("contextRole", "")).toLowerCase(Locale.ROOT);
                String summary = String.valueOf(att.getOrDefault("summary", "")).toLowerCase(Locale.ROOT);

                if ("json".equalsIgnoreCase(type) || "json".equalsIgnoreCase(kind) || name.endsWith(".json")) {
                    if (name.contains("menu") || contextRole.contains("business") || summary.contains("menu")) {
                        scopeMask |= SCOPE_MENU;
                        reasons.put("attachment_json_menu", 1);
                    } else {
                        scopeMask |= SCOPE_CONFIG;
                        reasons.put("attachment_json_config", 1);
                    }
                    scopeMask |= SCOPE_EXTERNAL;
                    reasons.put("attachment_json_external", 1);
                } else if ("image".equalsIgnoreCase(type)) {
                    scopeMask |= SCOPE_EXTERNAL;
                    reasons.put("image_attachment_detected", 1);
                    if (summary.contains("ui") || summary.contains("screen") || summary.contains("layout")) {
                        scopeMask |= SCOPE_MENU;
                        reasons.put("image_ui_signal", 1);
                    }
                    if (summary.contains("code") || summary.contains("stacktrace") || summary.contains("error")) {
                        scopeMask |= SCOPE_CODE;
                        reasons.put("image_code_signal", 1);
                    }
                } else if ("text".equalsIgnoreCase(kind) || name.endsWith(".md") || name.endsWith(".txt")) {
                    if (summary.contains("class") || summary.contains("method") || summary.contains("function")) {
                        scopeMask |= SCOPE_CODE;
                        reasons.put("attachment_text_code_signal", 1);
                    }
                    if (summary.contains("menu") || summary.contains("trigger") || summary.contains("workflow")) {
                        scopeMask |= SCOPE_MENU;
                        reasons.put("attachment_text_menu_signal", 1);
                    }
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

        if (scopeMask == 0 && hasCurrentCode && !hasCurrentMenu) {
            scopeMask |= SCOPE_CODE;
            reasons.put("default_code_only", 1);
        }

        ScopeMaskAnalysis result = new ScopeMaskAnalysis(scopeMask);
        result.scopeReasons = reasons;
        result.analysisTimeMs = System.currentTimeMillis() - startMs;

        log.debug("Scope analysis: scopeMask={} ({}) in {}ms",
                String.format("0x%02x", scopeMask), result.describe(), result.analysisTimeMs);

        return result;
    }

    @PreDestroy
    public void shutdown() {
        asyncExecutor.shutdownNow();
    }

    /**
     * Stable Lucene source key for a DynamicCode editor instance (p_name + p_type).
     */
    public static String buildEditorIngestKey(String pName, Integer pType) {
        String name = String.valueOf(pName == null ? "" : pName).trim();
        if (name.isBlank()) {
            name = "default";
        }
        String type = pType == null ? "0" : String.valueOf(pType);
        return sanitizeEditorKeyToken(name) + "_t" + sanitizeEditorKeyToken(type);
    }

    /**
     * Async symbol-aware chunk ingest for oversized editor code into Lucene KNN.
     * Non-blocking: current request uses region plan; follow-up requests hit scoped RAG.
     */
    public IngestionResult ingestLargeCodeAsync(
            String appId,
            String currentCode,
            int scopeMask,
            String requestId,
            String editorKey,
            String messageHint) {
        if (!enabled || !largeCodeIngestEnabled || currentCode == null || currentCode.isBlank()) {
            return new IngestionResult(appId);
        }
        int effectiveScopeMask = scopeMask;
        if ((effectiveScopeMask & SCOPE_CODE) == 0) {
            effectiveScopeMask |= SCOPE_CODE;
        }
        if (currentCode.length() <= Math.max(12000, largeCodeThresholdChars)) {
            return ingestCode(appId, currentCode, effectiveScopeMask, true, requestId);
        }

        String safeEditorKey = sanitizeEditorKeyToken(String.valueOf(editorKey == null ? "" : editorKey).trim());
        if (safeEditorKey.isBlank()) {
            safeEditorKey = "default_t0";
        }
        String taskKey = String.valueOf(appId == null ? "" : appId).trim() + ":" + safeEditorKey;
        String trimmedCode = trimLargeCodeForIngestion(currentCode);
        String contentHash = md5Hex(trimmedCode);

        String cachedHash = largeCodeContentHashByEditorKey.get(taskKey);
        if (contentHash.equals(cachedHash)) {
            IngestionResult cached = new IngestionResult(appId);
            cached.status = "cached_unchanged";
            cached.scopeMask = effectiveScopeMask;
            return cached;
        }

        IngestionTask existing = pendingLargeCodeTasks.get(taskKey);
        if (existing != null && !existing.future.isDone()) {
            IngestionResult pending = new IngestionResult(appId);
            pending.status = "pending_async_large_code";
            pending.scopeMask = effectiveScopeMask;
            return pending;
        }

        long queueStartMs = System.currentTimeMillis();
        contextTracer.startPhase("ingestion_large_code_async", requestId);

        IngestionResult queued = new IngestionResult(appId);
        queued.status = "pending_async_large_code";
        queued.scopeMask = effectiveScopeMask;
        queued.totalCharsIndexed = trimmedCode.length();

        IngestionTask task = new IngestionTask();
        pendingLargeCodeTasks.put(taskKey, task);

        final String asyncAppId = String.valueOf(appId == null ? "" : appId).trim();
        final int asyncScopeMask = effectiveScopeMask;
        final String asyncEditorKey = safeEditorKey;
        final String asyncMarkdown = buildLargeCodeIngestDocument(trimmedCode, safeEditorKey, messageHint);
        final String asyncSourceSuffix = "editorCode_" + safeEditorKey;

        asyncExecutor.submit(() -> {
            try {
                long startMs = System.currentTimeMillis();
                AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexDynamicContext(
                    asyncAppId,
                    asyncSourceSuffix,
                    asyncMarkdown,
                    List.of("scope_code", "currentCode", "large_editor_code", "dynamic_code", asyncEditorKey),
                    asyncScopeMask
                );

                IngestionResult done = new IngestionResult(asyncAppId);
                done.scopeMask = asyncScopeMask;
                done.chunksIngested = summary == null ? 0 : Math.max(0, summary.chunksIndexed());
                done.totalCharsIndexed = trimmedCode.length();
                done.ingestionTimeMs = System.currentTimeMillis() - startMs;
                done.status = "completed_async_large_code";

                if (pruneOldIndexes) {
                    businessMemoryVectorService.pruneDynamicContext(asyncAppId);
                }
                largeCodeContentHashByEditorKey.put(taskKey, contentHash);
                task.future.complete(done);

                log.info(
                    "Large code async vector ingest completed appId={} editorKey={} chunks={} chars={} time={}ms requestId={}",
                    asyncAppId,
                    asyncEditorKey,
                    done.chunksIngested,
                    done.totalCharsIndexed,
                    done.ingestionTimeMs,
                    requestId);
            } catch (Exception ex) {
                IngestionResult failed = new IngestionResult(asyncAppId);
                failed.success = false;
                failed.status = "failed_async_large_code";
                failed.scopeMask = asyncScopeMask;
                task.future.complete(failed);
                log.warn("Large code async vector ingest failed appId={} editorKey={}: {}",
                    asyncAppId, asyncEditorKey, ex.getMessage());
            } finally {
                pendingLargeCodeTasks.remove(taskKey, task);
                contextTracer.endPhase("ingestion_large_code_async", requestId, System.currentTimeMillis() - queueStartMs);
            }
        });

        queued.ingestionTimeMs = System.currentTimeMillis() - queueStartMs;
        contextTracer.recordMetric(requestId, "ingestion_large_code_async_queued_chars", trimmedCode.length());
        return queued;
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

    private String trimLargeCodeForIngestion(String content) {
        String safe = String.valueOf(content == null ? "" : content);
        int maxChars = Math.max(largeCodeThresholdChars + 1, largeCodeMaxChars);
        if (safe.length() <= maxChars) {
            return safe;
        }
        return safe.substring(0, maxChars);
    }

    private String buildLargeCodeIngestDocument(String code, String editorKey, String messageHint) {
        String safeCode = String.valueOf(code == null ? "" : code);
        int lineCount = safeCode.isBlank() ? 0 : safeCode.split("\n", -1).length;
        StringBuilder sb = new StringBuilder();
        sb.append("# DynamicCode Editor Vector Index\n");
        sb.append("editor_key: ").append(editorKey).append('\n');
        sb.append("total_chars: ").append(safeCode.length()).append('\n');
        sb.append("total_lines: ").append(lineCount).append('\n');
        sb.append("chunk_strategy: symbol_aware_declaration_boundaries\n");
        String hint = String.valueOf(messageHint == null ? "" : messageHint).replaceAll("\\s+", " ").trim();
        if (!hint.isBlank()) {
            sb.append("retrieval_hints: ").append(hint, 0, Math.min(hint.length(), 480)).append('\n');
        }
        sb.append("\n```javascript\n");
        sb.append(safeCode);
        if (!safeCode.endsWith("\n")) {
            sb.append('\n');
        }
        sb.append("```\n");
        return sb.toString();
    }

    private static String sanitizeEditorKeyToken(String raw) {
        String safe = String.valueOf(raw == null ? "" : raw).trim();
        if (safe.isBlank()) {
            return "default";
        }
        return safe.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    private static String md5Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] bytes = md.digest(String.valueOf(text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            return Integer.toHexString(String.valueOf(text == null ? "" : text).hashCode());
        }
    }

    /**
     * Clear pending tasks (useful for cleanup)
     */
    public void clearPendingTasks() {
        pendingTasks.clear();
        pendingLargeCodeTasks.clear();
        log.info("Cleared pending scoped ingestion tasks");
    }
}
