package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.kherud.llama.InferenceParameters;
import de.kherud.llama.LlamaModel;
import de.kherud.llama.LlamaOutput;
import de.kherud.llama.ModelParameters;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Native local AI provider using llama.cpp JNI bindings.
 *
 * This provider runs GGUF models directly in-process without starting any external service.
 */
@Service
@ConditionalOnProperty(name = "ai.local.llama.enabled", havingValue = "true")
public class LlamaCppNativeService implements AIProvider {

    private static final Logger log = LoggerFactory.getLogger(LlamaCppNativeService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong requestCount = new AtomicLong(0L);
    private final AtomicLong failedRequestCount = new AtomicLong(0L);
    private final AtomicLong promptClipCount = new AtomicLong(0L);
    private final AtomicLong promptClipCharsRemoved = new AtomicLong(0L);
    private final AtomicLong circuitOpenCount = new AtomicLong(0L);
    private final AtomicInteger inFlightRequests = new AtomicInteger(0);
    private final AtomicLong lastRequestStartedAtMs = new AtomicLong(0L);
    private final AtomicLong lastRequestFinishedAtMs = new AtomicLong(0L);
    private final AtomicLong lastRequestDurationMs = new AtomicLong(0L);
    private final AtomicInteger lastPromptChars = new AtomicInteger(0);
    private final AtomicInteger lastOutputChars = new AtomicInteger(0);
    private volatile String lastPromptDigest = "";
    private volatile String lastFailureMessage = "";
    
    // ── Task Cancellation Support ──────────────────────────────────────────────────
    // Track running inference tasks so they can be cancelled/interrupted by request ID
    private static final ConcurrentHashMap<String, Thread> activeInferenceTasks = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, AtomicInteger> cancelledTasks = new ConcurrentHashMap<>();

    // ── Circuit breaker ────────────────────────────────────────────────────────
    private static final int DEFAULT_CB_FAILURE_THRESHOLD = 5;
    private static final long DEFAULT_CB_COOLDOWN_MS = 5 * 60_000L;
    private static final long DEFAULT_CB_HARD_COOLDOWN_MS = 15 * 60_000L;
    /** Error substrings that indicate a persistent hardware/state failure. */
    private static final String[] HARD_FAILURE_PATTERNS = {
        "kIOAccelCommandBufferCallbackErrorTimeout".toLowerCase(),
        "kioaccelcommandbuffercallbackerrortimeout",
        "gpu timeout",
        "metal",
        "kv cache is full",
        "input prompt is too big compared to kv",
        "command buffer",
        "failed to decode the batch",
    };

    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private volatile long circuitOpenedAt = 0L;
    private volatile long circuitCooldownMs = DEFAULT_CB_COOLDOWN_MS;

    @Value("${ai.local.llama.enabled:false}")
    private boolean enabled;

    @Value("${ai.local.llama.model-path:./csm_datas/ai_local/model/qwen2.5-coder-3b-instruct-q4_k_m.gguf}")
    private String modelPath;

    /** SEO lane — Qwen2.5-3B-Instruct (natural language, không dùng Coder). */
    @Value("${ai.local.llama.seo-model-path:./csm_datas/ai_local/model/qwen2.5-3b-instruct-q4_k_m.gguf}")
    private String seoModelPath;

    /** M1/8GB: chỉ giữ 1 GGUF trong RAM — swap khi đổi lane code ↔ seo. */
    @Value("${ai.local.llama.swap-models-on-lane-change:true}")
    private boolean swapModelsOnLaneChange;

    /** Lane đang load trong JVM (code = Coder-3B, seo = Instruct-3B). */
    public enum LocalModelLane {
        CODE,
        SEO
    }

    @Value("${ai.local.llama.context-window:8192}")
    private int contextWindow;

    @Value("${ai.local.llama.max-tokens:512}")
    private int maxTokens;

    @Value("${ai.local.llama.temperature:0.2}")
    private float temperature;

    @Value("${ai.local.llama.top-p:0.9}")
    private float topP;

    @Value("${ai.local.llama.top-k:40}")
    private int topK;

    @Value("${ai.local.llama.threads:2}")
    private int threads;

    @Value("${ai.local.llama.batch-size:64}")
    private int batchSize;

    @Value("${ai.local.llama.ubatch-size:32}")
    private int ubatchSize;

    @Value("${ai.local.llama.gpu-layers:18}")
    private int gpuLayers;

    @Value("${ai.local.llama.disable-kv-offload:true}")
    private boolean disableKvOffload;

    @Value("${ai.local.llama.max-prompt-chars:500000}")
    private int maxPromptChars;

    @Value("${ai.local.llama.system-prompt:You are a code-string-first assistant. Treat currentCode as the primary source of truth, use cursorLine and nearby context as the first anchor, do not assume a file path exists, and ask only narrowly scoped follow-up questions when needed. Keep answers brief and factual: what you checked, what you found, and the next step.}")
    private String systemPrompt;

    @Value("${ai.local.llama.fail-fast:true}")
    private boolean failFast;

    @Value("${ai.local.llama.preload-on-startup:true}")
    private boolean preloadOnStartup;

    @Value("${ai.local.llama.runtime-profile:balanced}")
    private String runtimeProfile;

    @Value("${ai.local.llama.context-window-hard-cap:32768}")
    private int contextWindowHardCap;

    @Value("${ai.local.llama.context-window-auto-fit:true}")
    private boolean contextWindowAutoFit;

    @Value("${ai.local.llama.max-prompt-chars-hard-cap:1000000}")
    private int maxPromptCharsHardCap;

    @Value("${ai.local.llama.max-tokens-hard-cap:32768}")
    private int maxTokensHardCap;

    @Value("${ai.local.llama.circuit.failure-threshold:5}")
    private int cbFailureThreshold;

    @Value("${ai.local.llama.circuit.cooldown-ms:300000}")
    private long cbCooldownMs;

    @Value("${ai.local.llama.circuit.hard-cooldown-ms:900000}")
    private long cbHardCooldownMs;

    @Value("${ai.local.llama.token-streaming.enabled:true}")
    private boolean tokenStreamingEnabled;

    @Value("${ai.local.llama.threads.reserve-for-system:1}")
    private int reserveSystemCores;

    /** Callback for true token streaming via {@link LlamaModel#generate(InferenceParameters)}. */
    @FunctionalInterface
    public interface LocalTokenStreamListener {
        /**
         * @param ttftMs time-to-first-token when {@code firstToken}; otherwise {@code -1}
         * @return {@code false} to abort generation early
         */
        boolean onToken(String text, long ttftMs, boolean firstToken);
    }

    private volatile LlamaModel model;
    private volatile LocalModelLane activeModelLane;
    private volatile boolean shuttingDown = false;
    private final Object modelLock = new Object();

    private enum RuntimeProfile {
        CONSERVATIVE,
        BALANCED,
        MAX
    }

    // ── Circuit breaker helpers ────────────────────────────────────────────────

    /** Returns true when the circuit is open (model is in cooldown and should be skipped). */
    public boolean isCircuitOpen() {
        long openedAt = circuitOpenedAt;
        if (openedAt == 0L) {
            return false;
        }
        return (System.currentTimeMillis() - openedAt) < circuitCooldownMs;
    }

    /** Convenience: true when enabled, file exists, AND circuit is not open. */
    public boolean isHealthy() {
        return isAvailable() && !isCircuitOpen();
    }

    private void recordSuccess() {
        if (consecutiveFailures.getAndSet(0) > 0) {
            circuitOpenedAt = 0L;
            log.info("Local llama circuit reset after successful inference");
        }
    }

    private void recordFailure(String errorMessage) {
        boolean hard = isHardFailurePattern(errorMessage);
        long safeNormalCooldown = Math.max(60_000L, cbCooldownMs <= 0 ? DEFAULT_CB_COOLDOWN_MS : cbCooldownMs);
        long safeHardCooldown = Math.max(safeNormalCooldown, cbHardCooldownMs <= 0 ? DEFAULT_CB_HARD_COOLDOWN_MS : cbHardCooldownMs);
        int safeThreshold = Math.max(1, cbFailureThreshold <= 0 ? DEFAULT_CB_FAILURE_THRESHOLD : cbFailureThreshold);
        long cooldown = hard ? safeHardCooldown : safeNormalCooldown;
        circuitCooldownMs = cooldown;
        int failures = consecutiveFailures.incrementAndGet();
        if (failures >= safeThreshold) {
            circuitOpenedAt = System.currentTimeMillis();
            circuitOpenCount.incrementAndGet();
            log.warn("Local llama circuit OPENED after {} consecutive failures (hard={}, cooldownMin={}) – skipping local for {}min. Last error: {}",
                failures, hard, cooldown / 60_000L, cooldown / 60_000L, errorMessage);
        } else {
            log.warn("Local llama failure {}/{} (hard={}) – not yet tripping circuit. Error: {}",
                failures, safeThreshold, hard, errorMessage);
        }
    }

    private static boolean isHardFailurePattern(String message) {
        if (message == null) {
            return false;
        }
        String lower = message.toLowerCase();
        for (String pattern : HARD_FAILURE_PATTERNS) {
            if (lower.contains(pattern)) {
                return true;
            }
        }
        return false;
    }

    @PostConstruct
    public void validateStartupAvailability() {
        if (!enabled) {
            log.warn("Local llama provider disabled via config (ai.local.llama.enabled=false)");
            return;
        }

        Path path = resolveModelPath(modelPath);
        if (!Files.isRegularFile(path)) {
            String msg = "Local llama model file not found at configured path: " + path
                + ". Set ai.local.llama.model-path to a valid GGUF file.";
            if (failFast) {
                throw new IllegalStateException(msg);
            }
            log.error(msg);
            return;
        }

        log.info("Local llama model path verified: {}", path);
        Path seoPath = resolveModelPath(seoModelPath);
        if (Files.isRegularFile(seoPath)) {
            log.info("Local llama SEO model path verified: {}", seoPath);
        } else {
            log.warn("Local llama SEO model not found at {} — SEO lane sẽ fail cho đến khi có GGUF Qwen2.5-3B-Instruct",
                seoPath);
        }
        log.info("Local llama dual-lane: code={} | seo={} | swapOnLaneChange={}",
            path.getFileName(), seoPath.getFileName(), swapModelsOnLaneChange);
        log.info("Local llama profile={} effective caps: contextWindow={} (hardCap={}), maxPromptChars={} (hardCap={}), maxTokens={} (hardCap={}), batchSize={}, ubatchSize={}, gpuLayers={}, disableKvOffload={}",
            resolveRuntimeProfile(),
            effectiveContextWindow(), contextWindowHardCap,
            effectiveMaxPromptChars(), maxPromptCharsHardCap,
            effectiveMaxTokens(), maxTokensHardCap,
            effectiveBatchSize(), effectiveUbatchSize(), effectiveGpuLayers(), disableKvOffload);
        if (preloadOnStartup) {
            try {
                ensureModelLoaded(LocalModelLane.CODE);
                log.info("Local llama CODE model preloaded successfully");
            } catch (Exception ex) {
                String msg = "Failed to preload local llama model: " + ex.getMessage();
                if (failFast) {
                    throw new IllegalStateException(msg, ex);
                }
                log.error(msg, ex);
            }
        }
    }

    @Override
    public String generateContent(String prompt) {
        return generateContentWithTaskTracking(prompt, null);
    }
    
    /**
     * Generate content with optional task tracking for cancellation support.
     * @param prompt The input prompt
     * @param requestId Optional request ID for task tracking/cancellation
     */
    public String generateContentWithTaskTracking(String prompt, String requestId) {
        if (requestId != null && !requestId.isBlank()) {
            registerActiveInferenceTask(requestId);
        }
        
        try {
            return generateContentInternal(prompt);
        } finally {
            if (requestId != null && !requestId.isBlank()) {
                unregisterActiveInferenceTask(requestId);
            }
        }
    }

    /**
     * Stream tokens as they are generated; returns the same JSON envelope as {@link #generateContent(String)}.
     */
    public String generateContentStreamingWithTaskTracking(
            String prompt,
            String requestId,
            LocalTokenStreamListener listener) {
        return generateContentStreamingWithTaskTracking(prompt, 0, requestId, listener);
    }

    public String generateContentStreamingWithTaskTracking(
            String prompt,
            int maxOutputTokensCap,
            String requestId,
            LocalTokenStreamListener listener) {
        if (requestId != null && !requestId.isBlank()) {
            registerActiveInferenceTask(requestId);
        }
        try {
            return generateContentStreamingInternal(prompt, maxOutputTokensCap, null, requestId, listener);
        } finally {
            if (requestId != null && !requestId.isBlank()) {
                unregisterActiveInferenceTask(requestId);
            }
        }
    }

    private String generateContentInternal(String prompt) {
        String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();
        if (safePrompt.isBlank()) {
            return createErrorJson("Prompt khong duoc de trong", "INVALID_PROMPT");
        }
        if (!isAvailable()) {
            return createErrorJson("Local llama provider chua san sang (kiem tra model-path va config)", "LOCAL_PROVIDER_UNAVAILABLE");
        }
        if (isCircuitOpen()) {
            long remainSecs = Math.max(0, (circuitCooldownMs - (System.currentTimeMillis() - circuitOpenedAt)) / 1000L);
            log.info("Local llama circuit is OPEN, skipping inference (cooldown remaining ~{}s)", remainSecs);
            return createErrorJson("Local llama circuit open – skipping inference (cooldown " + remainSecs + "s remaining)", "CIRCUIT_OPEN");
        }

        // Prepend system prompt if configured (system prompt API removed in llama v4.x)
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            safePrompt = systemPrompt.trim() + "\n" + safePrompt;
        }

        // Detect once before any prefix/clip — clipping cannot change the decision
        boolean isJsonForced = detectJsonExpectation(safePrompt);
        if (isJsonForced) {
            safePrompt = "You MUST output ONLY valid JSON, with no markdown fences, no explanation, no extra text. Start with { or [.\n\n" + safePrompt;
            log.debug("JSON-forcing enabled: prepended format instruction to prompt");
        }

        safePrompt = clipPromptSmart(safePrompt, effectiveMaxPromptChars(), true);

        // Keep a conservative safety margin to avoid KV/GPU pressure when prompt is near context limit.
        int runtimePromptCharBudget = resolveRuntimePromptCharBudget();
        safePrompt = clipPromptSmart(safePrompt, runtimePromptCharBudget, true);

        long startedAt = markRequestStart(safePrompt);
        try {
            String output = runLocalCompletion(safePrompt, false, isJsonForced);
            requestCount.incrementAndGet();
            recordSuccess();
            markRequestFinish(startedAt, output, null);

            Map<String, Object> success = new HashMap<>();
            success.put("success", true);
            success.put("result", String.valueOf(output == null ? "" : output).trim());
            success.put("provider", getName());
            success.put("timestamp", System.currentTimeMillis());
            return objectMapper.writeValueAsString(success);
        } catch (Exception ex) {
            String firstErr = String.valueOf(ex.getMessage());
            if (isHardFailurePattern(firstErr) && safePrompt.length() > 1400) {
                try {
                    int retryChars = Math.max(1200, Math.min(safePrompt.length() / 2, 6000));
                    String retryPrompt = safePrompt.substring(0, retryChars);
                    String retryOutput = runLocalCompletion(retryPrompt, true, isJsonForced);
                    requestCount.incrementAndGet();
                    recordSuccess();
                    markRequestFinish(startedAt, retryOutput, null);

                    Map<String, Object> success = new HashMap<>();
                    success.put("success", true);
                    success.put("result", String.valueOf(retryOutput == null ? "" : retryOutput).trim());
                    success.put("provider", getName());
                    success.put("timestamp", System.currentTimeMillis());
                    success.put("degradedRetry", true);
                    success.put("retryPromptChars", retryChars);
                    success.put("retryReason", "hard_failure_prompt_shrink");
                    log.warn("Local llama recovered via degraded retry after hard error; retryPromptChars={}", retryChars);
                    return objectMapper.writeValueAsString(success);
                } catch (Exception retryEx) {
                    firstErr = String.valueOf(retryEx.getMessage());
                }
            }

            log.error("Local llama inference failed: {}", firstErr);
            recordFailure(firstErr);
            markRequestFinish(startedAt, "", firstErr);
            return createErrorJson("Local llama inference failed: " + firstErr, "LOCAL_INFERENCE_FAILED");
        }
    }

    private String generateContentStreamingInternal(
            String prompt,
            int maxOutputTokensCap,
            String systemPromptOverride,
            String requestId,
            LocalTokenStreamListener listener) {
        String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();
        if (safePrompt.isBlank()) {
            return createErrorJson("Prompt khong duoc de trong", "INVALID_PROMPT");
        }
        if (!isAvailable()) {
            return createErrorJson("Local llama provider chua san sang (kiem tra model-path va config)", "LOCAL_PROVIDER_UNAVAILABLE");
        }
        if (isCircuitOpen()) {
            long remainSecs = Math.max(0, (circuitCooldownMs - (System.currentTimeMillis() - circuitOpenedAt)) / 1000L);
            return createErrorJson("Local llama circuit open – skipping inference (cooldown " + remainSecs + "s remaining)", "CIRCUIT_OPEN");
        }

        String effectiveSystemPrompt = systemPromptOverride != null ? systemPromptOverride : systemPrompt;
        if (effectiveSystemPrompt != null && !effectiveSystemPrompt.isBlank()) {
            safePrompt = effectiveSystemPrompt.trim() + "\n" + safePrompt;
        }

        boolean isJsonForced = detectJsonExpectation(safePrompt);
        if (isJsonForced) {
            safePrompt = "You MUST output ONLY valid JSON, with no markdown fences, no explanation, no extra text. Start with { or [.\n\n" + safePrompt;
        }

        boolean fastCapPath = maxOutputTokensCap > 0;
        safePrompt = clipPromptSmart(safePrompt, effectiveMaxPromptChars(), !fastCapPath);
        safePrompt = clipPromptSmart(safePrompt, resolveRuntimePromptCharBudget(), !fastCapPath);

        long startedAt = markRequestStart(safePrompt);
        try {
            String output = runLocalCompletionStreaming(
                safePrompt,
                false,
                isJsonForced,
                maxOutputTokensCap,
                requestId,
                listener);
            requestCount.incrementAndGet();
            recordSuccess();
            markRequestFinish(startedAt, output, null);

            Map<String, Object> success = new HashMap<>();
            success.put("success", true);
            success.put("result", String.valueOf(output == null ? "" : output).trim());
            success.put("provider", getName());
            success.put("timestamp", System.currentTimeMillis());
            success.put("tokenStreaming", tokenStreamingEnabled && listener != null);
            return objectMapper.writeValueAsString(success);
        } catch (Exception ex) {
            String err = String.valueOf(ex.getMessage());
            log.error("Local llama streaming inference failed: {}", err);
            recordFailure(err);
            markRequestFinish(startedAt, "", err);
            return createErrorJson("Local llama streaming inference failed: " + err, "LOCAL_INFERENCE_FAILED");
        }
    }

    /**
     * Fast variant of generateContent with a hard cap on output tokens.
     * Use for classification/probe calls where full 384-token output is wasteful.
     * @param maxOutputTokensCap hard cap on generated tokens (e.g. 48 for JSON classification)
     */
    public String generateContentFast(String prompt, int maxOutputTokensCap) {
        return generateContentFast(prompt, maxOutputTokensCap, null, LocalModelLane.CODE);
    }

    /**
     * Fast variant with optional system-prompt override.
     * Pass empty string to skip the default system prompt entirely.
     */
    public String generateContentFast(String prompt, int maxOutputTokensCap, String systemPromptOverride) {
        return generateContentFast(prompt, maxOutputTokensCap, systemPromptOverride, LocalModelLane.CODE);
    }

    public String generateContentFast(
            String prompt,
            int maxOutputTokensCap,
            String systemPromptOverride,
            LocalModelLane lane) {
        return generateContentFastWithTaskTracking(prompt, maxOutputTokensCap, null, systemPromptOverride, lane);
    }

    /** SEO lane — Qwen2.5-3B-Instruct. */
    public String generateContentFastForSeo(String prompt, int maxOutputTokensCap, String systemPromptOverride) {
        return generateContentFast(prompt, maxOutputTokensCap, systemPromptOverride, LocalModelLane.SEO);
    }

    public boolean isSeoModelAvailable() {
        if (!enabled) {
            return false;
        }
        return Files.isRegularFile(resolveModelPath(seoModelPath));
    }

    public LocalModelLane getActiveModelLane() {
        return activeModelLane;
    }

    public String getSeoModelPathConfig() {
        return String.valueOf(seoModelPath == null ? "" : seoModelPath);
    }
    
    /**
     * Fast variant with task tracking for cancellation.
     */
    public String generateContentFastWithTaskTracking(String prompt, int maxOutputTokensCap, String requestId) {
        return generateContentFastWithTaskTracking(prompt, maxOutputTokensCap, requestId, null);
    }

    public String generateContentFastWithTaskTracking(
            String prompt,
            int maxOutputTokensCap,
            String requestId,
            String systemPromptOverride) {
        return generateContentFastWithTaskTracking(
            prompt, maxOutputTokensCap, requestId, systemPromptOverride, LocalModelLane.CODE);
    }

    public String generateContentFastWithTaskTracking(
            String prompt,
            int maxOutputTokensCap,
            String requestId,
            String systemPromptOverride,
            LocalModelLane lane) {
        if (requestId != null && !requestId.isBlank()) {
            registerActiveInferenceTask(requestId);
        }

        try {
            return generateContentFastInternal(prompt, maxOutputTokensCap, systemPromptOverride, lane);
        } finally {
            if (requestId != null && !requestId.isBlank()) {
                unregisterActiveInferenceTask(requestId);
            }
        }
    }

    private String generateContentFastInternal(String prompt, int maxOutputTokensCap) {
        return generateContentFastInternal(prompt, maxOutputTokensCap, null, LocalModelLane.CODE);
    }

    private String generateContentFastInternal(String prompt, int maxOutputTokensCap, String systemPromptOverride) {
        return generateContentFastInternal(prompt, maxOutputTokensCap, systemPromptOverride, LocalModelLane.CODE);
    }

    private String generateContentFastInternal(
            String prompt,
            int maxOutputTokensCap,
            String systemPromptOverride,
            LocalModelLane lane) {
        String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();
        if (safePrompt.isBlank()) {
            return createErrorJson("Prompt khong duoc de trong", "INVALID_PROMPT");
        }
        if (!isAvailableForLane(lane)) {
            return createErrorJson(
                lane == LocalModelLane.SEO
                    ? "Local llama SEO model chua san sang (kiem tra ai.local.llama.seo-model-path)"
                    : "Local llama provider chua san sang",
                "LOCAL_PROVIDER_UNAVAILABLE");
        }
        if (isCircuitOpen()) {
            return createErrorJson("Local llama circuit open", "CIRCUIT_OPEN");
        }
        String effectiveSystemPrompt = systemPromptOverride != null
            ? systemPromptOverride
            : systemPrompt;
        if (effectiveSystemPrompt != null && !effectiveSystemPrompt.isBlank()) {
            safePrompt = effectiveSystemPrompt.trim() + "\n" + safePrompt;
        }

        // Detect once before any prefix/clip — clipping cannot change the decision
        boolean isJsonForced = detectJsonExpectation(safePrompt);
        if (isJsonForced) {
            safePrompt = "You MUST output ONLY valid JSON, with no markdown fences, no explanation, no extra text. Start with { or [.\n\n" + safePrompt;
        }

        safePrompt = clipPromptSmart(safePrompt, effectiveMaxPromptChars(), false);
        int runtimeBudget = resolveRuntimePromptCharBudget();
        safePrompt = clipPromptSmart(safePrompt, runtimeBudget, false);
        int requestedCap = Math.max(16, maxOutputTokensCap);
        int globalCap = Math.max(16, effectiveMaxTokens());
        // Guest/classify paths pass small caps (≤ global). SEO one-shot passes ai.seo.article.max-tokens — honor it.
        int effectiveCap = requestedCap > globalCap ? requestedCap : Math.min(requestedCap, globalCap);
        int cappedTokens = Math.max(16, effectiveCap);
        long startedAt = markRequestStart(safePrompt);
        try {
            String output = runLocalCompletionWithCap(safePrompt, cappedTokens, isJsonForced, lane);
            requestCount.incrementAndGet();
            recordSuccess();
            markRequestFinish(startedAt, output, null);
            Map<String, Object> success = new HashMap<>();
            success.put("success", true);
            success.put("result", String.valueOf(output == null ? "" : output).trim());
            success.put("provider", getName());
            success.put("timestamp", System.currentTimeMillis());
            return objectMapper.writeValueAsString(success);
        } catch (Exception ex) {
            log.debug("generateContentFast failed: {}", ex.getMessage());
            recordFailure(ex.getMessage());
            markRequestFinish(startedAt, "", ex.getMessage());
            return createErrorJson("Fast inference failed: " + ex.getMessage(), "LOCAL_INFERENCE_FAILED");
        }
    }

    public Map<String, Object> getRuntimeStatus() {
        Map<String, Object> out = new HashMap<>();
        long now = System.currentTimeMillis();
        long openedAt = circuitOpenedAt;
        long cooldownRemainingMs = 0L;
        if (openedAt > 0L) {
            cooldownRemainingMs = Math.max(0L, circuitCooldownMs - (now - openedAt));
        }
        out.put("enabled", enabled);
        out.put("available", isAvailable());
        out.put("healthy", isHealthy());
        out.put("provider", getName());
        out.put("inFlightRequests", inFlightRequests.get());
        out.put("requestCount", requestCount.get());
        out.put("failedRequestCount", failedRequestCount.get());
        out.put("promptClipCount", promptClipCount.get());
        out.put("promptClipCharsRemoved", promptClipCharsRemoved.get());
        out.put("circuitOpenCount", circuitOpenCount.get());
        out.put("lastRequestStartedAtMs", lastRequestStartedAtMs.get());
        out.put("lastRequestFinishedAtMs", lastRequestFinishedAtMs.get());
        out.put("lastRequestDurationMs", lastRequestDurationMs.get());
        out.put("lastPromptChars", lastPromptChars.get());
        out.put("lastOutputChars", lastOutputChars.get());
        out.put("lastPromptDigest", lastPromptDigest);
        out.put("lastFailureMessage", lastFailureMessage);
        out.put("circuitOpen", isCircuitOpen());
        out.put("circuitConsecutiveFailures", consecutiveFailures.get());
        out.put("circuitCooldownMs", circuitCooldownMs);
        out.put("circuitCooldownRemainingMs", cooldownRemainingMs);
        out.put("modelPath", String.valueOf(modelPath == null ? "" : modelPath));
        out.put("seoModelPath", String.valueOf(seoModelPath == null ? "" : seoModelPath));
        out.put("seoModelAvailable", isSeoModelAvailable());
        out.put("activeModelLane", activeModelLane == null ? "" : activeModelLane.name());
        out.put("swapModelsOnLaneChange", swapModelsOnLaneChange);
        out.put("effectiveContextWindow", effectiveContextWindow());
        out.put("effectiveMaxTokens", effectiveMaxTokens());
        out.put("effectiveMaxPromptChars", effectiveMaxPromptChars());
        return out;
    }

    private long markRequestStart(String prompt) {
        long now = System.currentTimeMillis();
        inFlightRequests.incrementAndGet();
        lastRequestStartedAtMs.set(now);
        lastPromptChars.set(String.valueOf(prompt == null ? "" : prompt).length());
        lastPromptDigest = shortDigest(prompt);
        return now;
    }

    private void markRequestFinish(long startedAt, String output, String errorMessage) {
        long finishedAt = System.currentTimeMillis();
        lastRequestFinishedAtMs.set(finishedAt);
        long duration = startedAt > 0L ? Math.max(0L, finishedAt - startedAt) : 0L;
        lastRequestDurationMs.set(duration);
        lastOutputChars.set(String.valueOf(output == null ? "" : output).length());
        if (errorMessage == null || errorMessage.isBlank()) {
            lastFailureMessage = "";
        } else {
            lastFailureMessage = String.valueOf(errorMessage).trim();
            failedRequestCount.incrementAndGet();
        }
        inFlightRequests.updateAndGet(v -> Math.max(0, v - 1));
    }

    private String runLocalCompletionWithCap(String prompt, int nPredictCap, boolean isJsonForced) {
        return runLocalCompletionWithCap(prompt, nPredictCap, isJsonForced, LocalModelLane.CODE);
    }

    private String runLocalCompletionWithCap(
            String prompt,
            int nPredictCap,
            boolean isJsonForced,
            LocalModelLane lane) {
        InferenceParameters inference = buildInferenceParameters(prompt, false, isJsonForced, nPredictCap);
        LlamaModel localModel = ensureModelLoaded(lane);
        synchronized (modelLock) {
            return localModel.complete(inference);
        }
    }

    private String runLocalCompletion(String prompt, boolean degradedMode, boolean isJsonForced) {
        InferenceParameters inference = buildInferenceParameters(prompt, degradedMode, isJsonForced, 0);
        LlamaModel localModel = ensureModelLoaded(LocalModelLane.CODE);
        synchronized (modelLock) {
            return localModel.complete(inference);
        }
    }

    private String runLocalCompletionStreaming(
            String prompt,
            boolean degradedMode,
            boolean isJsonForced,
            int maxOutputTokensCap,
            String requestId,
            LocalTokenStreamListener listener) {
        InferenceParameters inference = buildInferenceParameters(prompt, degradedMode, isJsonForced, maxOutputTokensCap);
        LlamaModel localModel = ensureModelLoaded(LocalModelLane.CODE);
        StringBuilder accumulated = new StringBuilder();
        long inferStartedAt = System.currentTimeMillis();
        boolean firstTokenEmitted = false;
        synchronized (modelLock) {
            for (LlamaOutput output : localModel.generate(inference)) {
                if (requestId != null && isCancelled(requestId)) {
                    Thread.currentThread().interrupt();
                    break;
                }
                if (Thread.currentThread().isInterrupted()) {
                    break;
                }
                String piece = output == null ? "" : String.valueOf(output.text);
                if (!piece.isEmpty()) {
                    accumulated.append(piece);
                    if (listener != null && tokenStreamingEnabled) {
                        boolean isFirst = !firstTokenEmitted;
                        long ttftMs = isFirst ? Math.max(0L, System.currentTimeMillis() - inferStartedAt) : -1L;
                        if (!listener.onToken(piece, ttftMs, isFirst)) {
                            break;
                        }
                        firstTokenEmitted = true;
                    }
                }
            }
        }
        return accumulated.toString();
    }

    private InferenceParameters buildInferenceParameters(
            String prompt,
            boolean degradedMode,
            boolean isJsonForced,
            int maxOutputTokensCap) {
        int nPredict = maxOutputTokensCap > 0
            ? resolveCappedNPredict(prompt, maxOutputTokensCap)
            : resolveAdaptiveNPredict(prompt, degradedMode);
        float temp = isJsonForced ? 0.05f : (degradedMode ? Math.min(temperature, 0.1f) : Math.max(0f, temperature));
        return new InferenceParameters(prompt)
            .setNPredict(nPredict)
            .setTemperature(temp)
            .setTopP(isJsonForced ? 0.5f : Math.max(0.1f, Math.min(1f, topP)))
            .setTopK(isJsonForced ? 10 : Math.max(1, topK))
            .setStopStrings("<|im_end|>", "<|im_start|>")
            .setRepeatPenalty(1.15f);
    }

    private int resolveCappedNPredict(String prompt, int maxOutputTokensCap) {
        int ctx = Math.max(1024, effectiveContextWindow());
        int promptTokens = estimateTokensByChars(String.valueOf(prompt == null ? "" : prompt).length());
        int availableForOutput = Math.max(16, ctx - promptTokens - 256);
        return Math.max(16, Math.min(Math.max(16, maxOutputTokensCap), availableForOutput));
    }

    private int resolveAdaptiveNPredict(String prompt, boolean degradedMode) {
        int ctx = Math.max(1024, effectiveContextWindow());
        int promptTokens = estimateTokensByChars(String.valueOf(prompt == null ? "" : prompt).length());
        int reserved = Math.max(192, degradedMode ? 640 : 384);
        int availableForOutput = Math.max(32, ctx - promptTokens - reserved);
        int maxConfigured = Math.max(32, effectiveMaxTokens());
        int nPredict = Math.min(maxConfigured, availableForOutput);
        if (degradedMode) {
            nPredict = Math.min(nPredict, 256);
        }
        return Math.max(32, nPredict);
    }

    private int resolveRuntimePromptCharBudget() {
        int ctx = Math.max(1024, effectiveContextWindow());
        int outputReserve = Math.max(256, effectiveMaxTokens());
        int promptTokenBudget = Math.max(256, ctx - outputReserve - 256);
        int byTokenChars = promptTokenBudget * 4;
        return Math.max(2000, Math.min(effectiveMaxPromptChars(), byTokenChars));
    }

    private int estimateTokensByChars(int chars) {
        int safeChars = Math.max(0, chars);
        return Math.max(1, (safeChars + 3) / 4);
    }

    @Override
    public boolean isAvailable() {
        if (!enabled || shuttingDown) {
            return false;
        }
        Path path = resolveModelPath(modelPath);
        return Files.isRegularFile(path);
    }

    @Override
    public String getName() {
        return "LlamaCppNative";
    }

    @Override
    public String getQuotaInfo() {
        Path path = resolveModelPath(modelPath);
        return String.format("local requests=%d, model=%s, exists=%s", requestCount.get(), path, Files.exists(path));
    }

    @PreDestroy
    public void close() {
        shuttingDown = true;

        for (Thread taskThread : activeInferenceTasks.values()) {
            if (taskThread != null) {
                taskThread.interrupt();
            }
        }

        LlamaModel toClose = model;
        model = null;
        activeModelLane = null;
        if (toClose == null) {
            return;
        }

        Thread closeThread = new Thread(() -> {
            try {
                toClose.close();
            } catch (Exception ignored) {
                // ignore close errors during shutdown
            }
        }, "llama-close-shutdown");
        closeThread.setDaemon(true);
        closeThread.start();
    }

    private LlamaModel ensureModelLoaded() {
        return ensureModelLoaded(LocalModelLane.CODE);
    }

    private boolean isAvailableForLane(LocalModelLane lane) {
        if (!enabled) {
            return false;
        }
        if (lane == LocalModelLane.SEO) {
            return isSeoModelAvailable();
        }
        return isAvailable();
    }

    private String configuredPathForLane(LocalModelLane lane) {
        if (lane == LocalModelLane.SEO) {
            String seo = String.valueOf(seoModelPath == null ? "" : seoModelPath).trim();
            if (!seo.isBlank()) {
                return seo;
            }
        }
        return modelPath;
    }

    private LlamaModel ensureModelLoaded(LocalModelLane lane) {
        LocalModelLane target = lane == null ? LocalModelLane.CODE : lane;
        synchronized (modelLock) {
            if (shuttingDown) {
                throw new IllegalStateException("Local llama provider is shutting down");
            }
            if (model != null && activeModelLane == target) {
                return model;
            }
            if (model != null && activeModelLane != target) {
                log.info("Swapping local llama model lane {} -> {} (swap={})",
                    activeModelLane, target, swapModelsOnLaneChange);
                closeModelQuietly(model);
                model = null;
                activeModelLane = null;
            }

            Path path = resolveModelPath(configuredPathForLane(target));
            if (!Files.isRegularFile(path)) {
                throw new IllegalStateException("Model GGUF not found for lane "
                    + target + ": " + path);
            }

            ModelParameters parameters = new ModelParameters()
                    .setModel(path.toAbsolutePath().toString())
                    .setCtxSize(effectiveContextWindow())
                    .setThreads(effectiveThreads())
                    .setThreadsBatch(effectiveThreads())
                    .setBatchSize(effectiveBatchSize())
                    .setUbatchSize(effectiveUbatchSize());

            int safeGpuLayers = effectiveGpuLayers();
            if (safeGpuLayers >= 0) {
                parameters.setGpuLayers(safeGpuLayers);
            }
            if (disableKvOffload) {
                parameters.disableKvOffload();
            }

            log.info("Loading local GGUF model via llama.cpp JNI (lane={}): {}",
                target, path.toAbsolutePath());
            model = new LlamaModel(parameters);
            activeModelLane = target;
            return model;
        }
    }

    private static void closeModelQuietly(LlamaModel toClose) {
        if (toClose == null) {
            return;
        }
        try {
            toClose.close();
        } catch (Exception ignored) {
            // ignore
        }
    }

    private int effectiveBatchSize() {
        return Math.max(32, Math.min(512, batchSize));
    }

    private int effectiveUbatchSize() {
        int batch = effectiveBatchSize();
        return Math.max(16, Math.min(batch, ubatchSize));
    }

    private int effectiveGpuLayers() {
        // -1 means auto/all according to backend, otherwise clamp to safe positive range.
        if (gpuLayers < 0) {
            return -1;
        }
        return Math.max(0, Math.min(80, gpuLayers));
    }

    private int effectiveThreads() {
        int configured = Math.max(1, threads);
        int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
        int reserve = Math.max(0, reserveSystemCores);
        int budget = Math.max(1, cores - reserve);
        if (resolveRuntimeProfile() == RuntimeProfile.CONSERVATIVE) {
            budget = Math.max(1, Math.min(budget, cores - 1));
        }
        return Math.max(1, Math.min(configured, budget));
    }

    private String clipPromptSmart(String source, int cap, boolean logClip) {
        String text = String.valueOf(source == null ? "" : source);
        int safeCap = Math.max(1000, cap);
        if (text.length() <= safeCap) {
            return text;
        }

        int head = Math.max(300, (int) Math.round(safeCap * 0.65d));
        int tail = Math.max(200, safeCap - head - 96);
        if (tail <= 0) {
            tail = Math.max(120, safeCap / 4);
            head = Math.max(300, safeCap - tail - 96);
        }

        String clipped = text.substring(0, Math.min(head, text.length()))
            + "\n\n[...prompt clipped for runtime budget...]\n\n"
            + text.substring(Math.max(0, text.length() - tail));

        if (clipped.length() > safeCap) {
            clipped = clipped.substring(0, safeCap);
        }

        if (logClip) {
            promptClipCount.incrementAndGet();
            promptClipCharsRemoved.addAndGet(Math.max(0, text.length() - clipped.length()));
            log.warn("Local prompt clipped smartly from {} to {} chars, digest={}", text.length(), clipped.length(), shortDigest(text));
        }
        return clipped;
    }

    private Path resolveModelPath(String rawPath) {
        String p = String.valueOf(rawPath == null ? "" : rawPath).trim();
        if (p.isBlank()) {
            return Paths.get("csm_datas/ai_local/model/model.gguf").toAbsolutePath().normalize();
        }
        Path path = Paths.get(p);
        if (!path.isAbsolute()) {
            path = Paths.get(System.getProperty("user.dir"), p);
        }
        return path.toAbsolutePath().normalize();
    }

    private String createErrorJson(String message, String errorCode) {
        try {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("errorCode", errorCode);
            errorResponse.put("message", message);
            errorResponse.put("provider", getName());
            errorResponse.put("timestamp", System.currentTimeMillis());
            return objectMapper.writeValueAsString(errorResponse);
        } catch (Exception ex) {
            return "{\"success\":false,\"errorCode\":\"JSON_ERROR\",\"message\":\"Local provider error\"}";
        }
    }

    private int effectiveContextWindow() {
        int profileCap;
        switch (resolveRuntimeProfile()) {
            case CONSERVATIVE:
                profileCap = 8192;
                break;
            case MAX:
                profileCap = 32768;
                break;
            case BALANCED:
            default:
                profileCap = 16384;
                break;
        }
        int hardCap = Math.max(1024, contextWindowHardCap);
        int configured = Math.max(512, contextWindow);
        int capped = Math.min(Math.min(hardCap, profileCap), configured);
        if (!contextWindowAutoFit) {
            return capped;
        }
        int fitFromBudget = computeAutoFitContextTokens();
        int target = Math.min(capped, Math.max(2048, fitFromBudget));
        log.debug(
            "Context window auto-fit configured={} fitFromBudget={} target={} profileCap={}",
            configured,
            fitFromBudget,
            target,
            profileCap);
        return target;
    }

    /** Derive minimal ctx slots from prompt char budget + max output — reduces KV RAM vs over-provisioning. */
    private int computeAutoFitContextTokens() {
        int promptChars = Math.min(effectiveMaxPromptChars(), resolveWeakSafePromptCharsForFit());
        int promptTokens = Math.max(1024, (promptChars + 3) / 4);
        int outputReserve = Math.max(256, effectiveMaxTokens());
        int margin = resolveRuntimeProfile() == RuntimeProfile.CONSERVATIVE ? 384 : 512;
        int raw = promptTokens + outputReserve + margin;
        return ((Math.max(2048, raw) + 511) / 512) * 512;
    }

    private int resolveWeakSafePromptCharsForFit() {
        if (resolveRuntimeProfile() == RuntimeProfile.CONSERVATIVE) {
            return Math.min(effectiveMaxPromptChars(), 18000);
        }
        String profile = String.valueOf(runtimeProfile == null ? "" : runtimeProfile).trim().toLowerCase(Locale.ROOT);
        if ("balanced".equals(profile) && contextWindow <= 8192) {
            return Math.min(effectiveMaxPromptChars(), 20000);
        }
        return effectiveMaxPromptChars();
    }

    private int effectiveMaxPromptChars() {
        int profileCap;
        switch (resolveRuntimeProfile()) {
            case CONSERVATIVE:
                profileCap = 50000;  // Increased from 24000 for better coverage
                break;
            case MAX:
                profileCap = 500000;  // Increased from 120000 to allow large prompts
                break;
            case BALANCED:
            default:
                profileCap = 200000;  // Increased from 48000 for better support
                break;
        }
        int hardCap = Math.max(4000, maxPromptCharsHardCap);
        return Math.min(Math.min(hardCap, profileCap), Math.max(2000, maxPromptChars));
    }

    private int effectiveMaxTokens() {
        int profileCap;
        switch (resolveRuntimeProfile()) {
            case CONSERVATIVE:
                profileCap = 1024;
                break;
            case MAX:
                profileCap = 16384;  // Increased from 4096 to allow longer responses
                break;
            case BALANCED:
            default:
                profileCap = 4096;  // Increased from 2048 for better responses
                break;
        }
        int hardCap = Math.max(256, maxTokensHardCap);
        return Math.min(Math.min(hardCap, profileCap), Math.max(32, maxTokens));
    }

    private RuntimeProfile resolveRuntimeProfile() {
        String profile = String.valueOf(runtimeProfile == null ? "" : runtimeProfile).trim().toLowerCase();
        if ("conservative".equals(profile) || "safe".equals(profile) || "8k".equals(profile)) {
            return RuntimeProfile.CONSERVATIVE;
        }
        if ("max".equals(profile) || "quality".equals(profile) || "32k".equals(profile)) {
            return RuntimeProfile.MAX;
        }
        return RuntimeProfile.BALANCED;
    }

    private String shortDigest(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(String.valueOf(text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < Math.min(6, bytes.length); i++) {
                sb.append(String.format("%02x", bytes[i]));
            }
            return sb.toString();
        } catch (Exception ignored) {
            return "na";
        }
    }

    /**
     * Detect if prompt expects JSON output.
     * Returns true if prompt contains keywords suggesting JSON format requirement.
     */
    public int getEffectiveMaxPromptCharsLimit() {
        return effectiveMaxPromptChars();
    }

    public int getEffectiveMaxTokensLimit() {
        return effectiveMaxTokens();
    }

    public int getMaxTokensHardCap() {
        return Math.max(256, maxTokensHardCap);
    }

    private boolean detectJsonExpectation(String prompt) {
        if (prompt == null) {
            return false;
        }
        String lower = prompt.toLowerCase();

        // Do not force JSON when prompt explicitly asks for natural language text.
        if (lower.contains("khong tra ve json")
                || lower.contains("không trả về json")
                || lower.contains("khong duoc mo dau bang dau {")
                || lower.contains("không được mở đầu bằng dấu {")
                || lower.contains("do not return json")
                || lower.contains("no json")
                || lower.contains("plain text")) {
            return false;
        }

        // Only trigger for explicit JSON-output directives, not generic mentions.
        return lower.contains("output only valid json")
            || lower.contains("must output only valid json")
            || lower.contains("return valid json")
            || lower.contains("return json only")
            || lower.contains("respond in json")
            || lower.contains("json object")
            || lower.contains("json array")
            || lower.contains("đối tượng json")
            || lower.contains("doi tuong json")
            || lower.contains("trả về") && lower.contains("json")
            || lower.contains("tra ve") && lower.contains("json")
            || lower.contains("```json")
            || lower.contains("\"summary\"")
            || lower.contains("\"code\"")
            || lower.contains("\"changes\"")
            || lower.contains("\"textedits\"")
            || lower.contains("\"text_edits\"")
            || (lower.contains("\"html_content\"") && lower.contains("\"title\""))
            || (lower.contains("`html_content`") && lower.contains("`title`"));
    }

    // ── Task Cancellation Helpers ──────────────────────────────────────────────────
    
    /**
     * Register the current thread as an active inference task for a given request ID.
     * This allows external code (e.g., API endpoints) to cancel the task if needed.
     */
    public void registerActiveInferenceTask(String requestId) {
        if (requestId != null && !requestId.isBlank()) {
            activeInferenceTasks.put(requestId, Thread.currentThread());
            log.debug("Registered active inference task: {}", requestId);
        }
    }
    
    /**
     * Unregister an inference task when it completes (successfully or with error).
     */
    public void unregisterActiveInferenceTask(String requestId) {
        if (requestId != null && !requestId.isBlank()) {
            activeInferenceTasks.remove(requestId);
            cancelledTasks.remove(requestId);
            log.debug("Unregistered active inference task: {}", requestId);
        }
    }
    
    /**
     * Attempt to cancel a running inference task by request ID.
     * This interrupts the Thread running the inference, which may stop the llama.cpp native call.
     * The interruption may not immediately stop the native code, but signals that the task should stop.
     * 
     * @param requestId The ID of the task to cancel
     * @return true if a running task was found and interrupted, false otherwise
     */
    public boolean cancelInferenceTask(String requestId) {
        if (requestId == null || requestId.isBlank()) {
            return false;
        }
        
        // Mark task as cancelled first
        cancelledTasks.put(requestId, new AtomicInteger(1));
        
        Thread taskThread = activeInferenceTasks.get(requestId);
        if (taskThread != null) {
            log.warn("Attempting to cancel inference task: {} on thread {}", requestId, taskThread.getName());
            taskThread.interrupt();
            
            // Give the thread a moment to respond to interruption
            try {
                Thread.sleep(100);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            
            // Check if still active
            if (activeInferenceTasks.containsKey(requestId)) {
                log.warn("Inference task {} still running after interruption signal", requestId);
                return false;
            }
            log.info("Successfully cancelled inference task: {}", requestId);
            return true;
        }
        return false;
    }
    
    /**
     * Check if an inference task has been marked for cancellation.
     * This can be checked periodically in the native inference loop if possible.
     */
    public boolean isCancelled(String requestId) {
        return cancelledTasks.containsKey(requestId) && cancelledTasks.get(requestId).get() > 0;
    }
    
    /**
     * Get the list of currently active inference task IDs.
     */
    public List<String> getActiveTaskIds() {
        return new java.util.ArrayList<>(activeInferenceTasks.keySet());
    }
    
    /**
     * Get information about active tasks for diagnostics.
     */
    public Map<String, Object> getTasksInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("activeTaskCount", activeInferenceTasks.size());
        info.put("activeTaskIds", new java.util.ArrayList<>(activeInferenceTasks.keySet()));
        info.put("inFlightRequests", inFlightRequests.get());
        info.put("totalRequests", requestCount.get());
        info.put("failedRequests", failedRequestCount.get());
        info.put("promptClipCount", promptClipCount.get());
        info.put("promptClipCharsRemoved", promptClipCharsRemoved.get());
        info.put("circuitOpen", isCircuitOpen());
        info.put("circuitOpenCount", circuitOpenCount.get());
        info.put("circuitConsecutiveFailures", consecutiveFailures.get());
        info.put("circuitCooldownMs", circuitCooldownMs);
        return info;
    }
}