package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.kherud.llama.InferenceParameters;
import de.kherud.llama.LlamaModel;
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
    private static final int CB_FAILURE_THRESHOLD   = 2;           // open after N consecutive failures
    private static final long CB_COOLDOWN_MS        = 5 * 60_000L; // 5 min normal cooldown
    private static final long CB_HARD_COOLDOWN_MS   = 15 * 60_000L;// 15 min for GPU/KV hard errors
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
    private volatile long circuitCooldownMs = CB_COOLDOWN_MS;

    @Value("${ai.local.llama.enabled:false}")
    private boolean enabled;

    @Value("${ai.local.llama.model-path:./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf}")
    private String modelPath;

    @Value("${ai.local.llama.context-window:8192}")
    private int contextWindow;

    @Value("${ai.local.llama.max-tokens:8192}")
    private int maxTokens;

    @Value("${ai.local.llama.temperature:0.2}")
    private float temperature;

    @Value("${ai.local.llama.top-p:0.9}")
    private float topP;

    @Value("${ai.local.llama.top-k:40}")
    private int topK;

    @Value("${ai.local.llama.threads:2}")
    private int threads;

    @Value("${ai.local.llama.batch-size:256}")
    private int batchSize;

    @Value("${ai.local.llama.ubatch-size:128}")
    private int ubatchSize;

    @Value("${ai.local.llama.gpu-layers:18}")
    private int gpuLayers;

    @Value("${ai.local.llama.disable-kv-offload:true}")
    private boolean disableKvOffload;

    @Value("${ai.local.llama.max-prompt-chars:500000}")
    private int maxPromptChars;

    @Value("${ai.local.llama.system-prompt:}")
    private String systemPrompt;

    @Value("${ai.local.llama.fail-fast:true}")
    private boolean failFast;

    @Value("${ai.local.llama.preload-on-startup:true}")
    private boolean preloadOnStartup;

    @Value("${ai.local.llama.runtime-profile:max}")
    private String runtimeProfile;

    @Value("${ai.local.llama.context-window-hard-cap:32768}")
    private int contextWindowHardCap;

    @Value("${ai.local.llama.max-prompt-chars-hard-cap:1000000}")
    private int maxPromptCharsHardCap;

    @Value("${ai.local.llama.max-tokens-hard-cap:32768}")
    private int maxTokensHardCap;

    @Value("${ai.local.llama.degraded-max-tokens:1024}")
    private int degradedMaxTokens;

    private volatile LlamaModel model;
    private volatile boolean shuttingDown = false;
    private final Object modelLock = new Object();

    // When ai.local.djl.enabled=true, this is injected and ONNX inference takes priority.
    // LlamaCppNativeService (GGUF) acts as fallback when DJL ONNX is not available.
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private DjlInferenceService djlInferenceService;

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
        long cooldown = hard ? CB_HARD_COOLDOWN_MS : CB_COOLDOWN_MS;
        circuitCooldownMs = cooldown;
        int failures = consecutiveFailures.incrementAndGet();
        if (failures >= CB_FAILURE_THRESHOLD) {
            circuitOpenedAt = System.currentTimeMillis();
            log.warn("Local llama circuit OPENED after {} consecutive failures (hard={}, cooldownMin={}) – skipping local for {}min. Last error: {}",
                failures, hard, cooldown / 60_000L, cooldown / 60_000L, errorMessage);
        } else {
            log.warn("Local llama failure {}/{} (hard={}) – not yet tripping circuit. Error: {}",
                failures, CB_FAILURE_THRESHOLD, hard, errorMessage);
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

    /**
     * Memory safeguard: check if heap usage exceeds 90% to prevent OOM.
     * Returns true if heap should be protected from more inference.
     */
    private boolean isHeapExhausted() {
        Runtime runtime = Runtime.getRuntime();
        long max = runtime.maxMemory();
        long used = runtime.totalMemory() - runtime.freeMemory();
        double usagePercent = (double) used / max * 100.0;
        return usagePercent > 90.0;
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
        log.info("Local llama profile={} effective caps: contextWindow={} (hardCap={}), maxPromptChars={} (hardCap={}), maxTokens={} (hardCap={}), batchSize={}, ubatchSize={}, gpuLayers={}, disableKvOffload={}",
            resolveRuntimeProfile(),
            effectiveContextWindow(), contextWindowHardCap,
            effectiveMaxPromptChars(), maxPromptCharsHardCap,
            effectiveMaxTokens(), maxTokensHardCap,
            effectiveBatchSize(), effectiveUbatchSize(), effectiveGpuLayers(), disableKvOffload);
        if (preloadOnStartup) {
            try {
                ensureModelLoaded();
                log.info("Local llama model preloaded successfully");
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
        // Prefer DJL ONNX when available (better quality, DJL manages context internally)
        if (djlInferenceService != null && djlInferenceService.isAvailable()) {
            log.debug("LlamaCpp: delegating to DJL ONNX (requestId={})", requestId);
            return djlInferenceService.generateContent(prompt);
        }

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
        
        // Memory safeguard: if heap is >90% full, reject inference to prevent OOM
        if (isHeapExhausted()) {
            log.warn("Heap usage critical (>90%): rejecting inference request to prevent OOM");
            recordFailure("HEAP_EXHAUSTED");
            return createErrorJson("Hệ thống tạm quá tải, hãy thử lại sau", "HEAP_EXHAUSTED");
        }

        // Prepend system prompt if configured (system prompt API removed in llama v4.x)
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            safePrompt = systemPrompt.trim() + "\n" + safePrompt;
        }

        // JSON-forcing: detect if prompt expects JSON output and prepend format instruction
        if (detectJsonExpectation(safePrompt)) {
            String jsonForcePrefix = "You MUST output ONLY valid JSON, with no markdown fences, no explanation, no extra text. Start with { or [.\n\n";
            safePrompt = jsonForcePrefix + safePrompt;
            log.debug("JSON-forcing enabled: prepended format instruction to prompt");
        }

        int promptCap = effectiveMaxPromptChars();
        if (safePrompt.length() > promptCap) {
            String digest = shortDigest(safePrompt);
            log.warn("Local prompt clipped from {} to {} chars, digest={}", safePrompt.length(), promptCap, digest);
            safePrompt = safePrompt.substring(0, promptCap);
        }

        // Keep a conservative safety margin to avoid KV/GPU pressure when prompt is near context limit.
        int runtimePromptCharBudget = resolveRuntimePromptCharBudget();
        if (safePrompt.length() > runtimePromptCharBudget) {
            log.warn("Local prompt reduced by runtime budget from {} to {} chars", safePrompt.length(), runtimePromptCharBudget);
            safePrompt = safePrompt.substring(0, runtimePromptCharBudget);
        }

        long startedAt = markRequestStart(safePrompt);
        try {
            boolean isJsonForced = detectJsonExpectation(safePrompt);
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
                    boolean isJsonForced = detectJsonExpectation(retryPrompt);
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

    /**
     * Fast variant of generateContent with a hard cap on output tokens.
     * Use for classification/probe calls where full 384-token output is wasteful.
     * @param maxOutputTokensCap hard cap on generated tokens (e.g. 48 for JSON classification)
     */
    public String generateContentFast(String prompt, int maxOutputTokensCap) {
        return generateContentFastWithTaskTracking(prompt, maxOutputTokensCap, null);
    }
    
    /**
     * Fast variant with task tracking for cancellation.
     */
    public String generateContentFastWithTaskTracking(String prompt, int maxOutputTokensCap, String requestId) {
        // Prefer DJL ONNX for fast path too – use the DJL fast variant with token cap
        if (djlInferenceService != null && djlInferenceService.isAvailable()) {
            log.debug("LlamaCpp-fast: delegating to DJL ONNX (cap={})", maxOutputTokensCap);
            return djlInferenceService.generateFast(prompt, maxOutputTokensCap);
        }

        if (requestId != null && !requestId.isBlank()) {
            registerActiveInferenceTask(requestId);
        }
        
        try {
            return generateContentFastInternal(prompt, maxOutputTokensCap);
        } finally {
            if (requestId != null && !requestId.isBlank()) {
                unregisterActiveInferenceTask(requestId);
            }
        }
    }

    private String generateContentFastInternal(String prompt, int maxOutputTokensCap) {
        String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();
        if (safePrompt.isBlank()) {
            return createErrorJson("Prompt khong duoc de trong", "INVALID_PROMPT");
        }
        if (!isAvailable()) {
            return createErrorJson("Local llama provider chua san sang", "LOCAL_PROVIDER_UNAVAILABLE");
        }
        if (isCircuitOpen()) {
            return createErrorJson("Local llama circuit open", "CIRCUIT_OPEN");
        }
        
        // Memory safeguard: if heap is >90% full, reject inference to prevent OOM
        if (isHeapExhausted()) {
            log.warn("Heap usage critical (>90%): rejecting inference request to prevent OOM");
            recordFailure("HEAP_EXHAUSTED");
            return createErrorJson("Hệ thống tạm quá tải, hãy thử lại sau", "HEAP_EXHAUSTED");
        }
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            safePrompt = systemPrompt.trim() + "\n" + safePrompt;
        }
        
        // JSON-forcing for fast path too
        if (detectJsonExpectation(safePrompt)) {
            String jsonForcePrefix = "You MUST output ONLY valid JSON, with no markdown fences, no explanation, no extra text. Start with { or [.\n\n";
            safePrompt = jsonForcePrefix + safePrompt;
        }
        
        int effectiveMax = Math.max(16, effectiveMaxTokens());
        int requestedCap = maxOutputTokensCap <= 0 ? effectiveMax : maxOutputTokensCap;
        int cappedTokens = Math.max(16, Math.min(effectiveMax, requestedCap));
        int promptCap = effectiveMaxPromptChars();
        if (safePrompt.length() > promptCap) {
            safePrompt = safePrompt.substring(0, promptCap);
        }
        int runtimeBudget = resolveRuntimePromptCharBudget(cappedTokens);
        if (safePrompt.length() > runtimeBudget) {
            safePrompt = safePrompt.substring(0, runtimeBudget);
        }
        long startedAt = markRequestStart(safePrompt);
        try {
            boolean isJsonForced = detectJsonExpectation(safePrompt);
            String output = runLocalCompletionWithCap(safePrompt, cappedTokens, isJsonForced);
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
        LlamaModel localModel = ensureModelLoaded();
        int ctx = Math.max(1024, effectiveContextWindow());
        int promptLength = Math.max(0, prompt.length());
        int promptTokens = Math.max(1, (promptLength + 3) / 4);
        int availableForOutput = Math.max(16, ctx - promptTokens - 256);
        int nPredict = Math.max(16, Math.min(nPredictCap, availableForOutput));
        // Use lower temperature for JSON outputs
        float temp = isJsonForced ? 0.05f : Math.max(0f, temperature);
        InferenceParameters inference = new InferenceParameters(prompt)
                .setNPredict(nPredict)
                .setTemperature(temp)
                .setTopP(isJsonForced ? 0.5f : Math.max(0.1f, Math.min(1f, topP)))
                .setTopK(isJsonForced ? 10 : Math.max(1, topK))
                // Stop at ChatML end-of-turn marker so model doesn't generate fake user turns.
                .setStopStrings("<|im_end|>", "<|im_start|>")
                // Penalize immediate repetition to prevent tail loop runaway.
                .setRepeatPenalty(1.15f);
        synchronized (modelLock) {
            return localModel.complete(inference);
        }
    }

    private String runLocalCompletion(String prompt, boolean degradedMode, boolean isJsonForced) {
        LlamaModel localModel = ensureModelLoaded();
        int nPredict = resolveAdaptiveNPredict(prompt, degradedMode);
        // Use lower temperature for JSON outputs to ensure valid formatting
        float temp = isJsonForced ? 0.05f : (degradedMode ? Math.min(temperature, 0.1f) : Math.max(0f, temperature));
        InferenceParameters inference = new InferenceParameters(prompt)
                .setNPredict(nPredict)
                .setTemperature(temp)
                .setTopP(isJsonForced ? 0.5f : Math.max(0.1f, Math.min(1f, topP)))
                .setTopK(isJsonForced ? 10 : Math.max(1, topK))
                // Stop at ChatML end-of-turn marker so model doesn't generate fake user turns.
                .setStopStrings("<|im_end|>", "<|im_start|>")
                // Penalize immediate repetition to prevent tail loop runaway.
                .setRepeatPenalty(1.15f);
        synchronized (modelLock) {
            return localModel.complete(inference);
        }
    }

    private int resolveAdaptiveNPredict(String prompt, boolean degradedMode) {
        int ctx = Math.max(1024, effectiveContextWindow());
        int promptLength = String.valueOf(prompt == null ? "" : prompt).length();
        int promptTokens = Math.max(1, (Math.max(0, promptLength) + 3) / 4);
        int reserved = Math.max(192, degradedMode ? 640 : 384);
        int availableForOutput = Math.max(32, ctx - promptTokens - reserved);
        int maxConfigured = Math.max(32, effectiveMaxTokens());
        int nPredict = Math.min(maxConfigured, availableForOutput);
        if (degradedMode) {
            nPredict = Math.min(nPredict, Math.max(128, degradedMaxTokens));
        }
        return Math.max(32, nPredict);
    }

    private int resolveRuntimePromptCharBudget() {
        return resolveRuntimePromptCharBudget(effectiveMaxTokens());
    }

    private int resolveRuntimePromptCharBudget(int requestedOutputTokens) {
        int ctx = Math.max(1024, effectiveContextWindow());
        int effectiveOutputReserve = Math.max(64, Math.min(effectiveMaxTokens(), requestedOutputTokens));
        int outputReserve = Math.max(256, effectiveOutputReserve);
        int promptTokenBudget = Math.max(256, ctx - outputReserve - 256);
        int byTokenChars = promptTokenBudget * 4;
        return Math.max(2000, Math.min(effectiveMaxPromptChars(), byTokenChars));
    }

    @Override
    public boolean isAvailable() {
        // DJL ONNX takes priority when loaded
        if (djlInferenceService != null && djlInferenceService.isAvailable()) {
            return true;
        }
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
        if (shuttingDown) {
            throw new IllegalStateException("Local llama provider is shutting down");
        }
        LlamaModel current = model;
        if (current != null) {
            return current;
        }
        synchronized (modelLock) {
            if (shuttingDown) {
                throw new IllegalStateException("Local llama provider is shutting down");
            }
            if (model != null) {
                return model;
            }
            Path path = resolveModelPath(modelPath);
            if (!Files.isRegularFile(path)) {
                throw new IllegalStateException("Model GGUF not found: " + path);
            }

            ModelParameters parameters = new ModelParameters()
                    .setModel(path.toAbsolutePath().toString())
                    .setCtxSize(effectiveContextWindow())
                    .setThreads(Math.max(1, threads))
                    .setThreadsBatch(Math.max(1, threads))
                    .setBatchSize(effectiveBatchSize())
                    .setUbatchSize(effectiveUbatchSize());

            int safeGpuLayers = effectiveGpuLayers();
            if (safeGpuLayers >= 0) {
                parameters.setGpuLayers(safeGpuLayers);
            }
            if (disableKvOffload) {
                parameters.disableKvOffload();
            }

            log.info("Loading local GGUF model via llama.cpp JNI: {}", path.toAbsolutePath());
            model = new LlamaModel(parameters);
            return model;
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
        return Math.min(Math.min(hardCap, profileCap), Math.max(512, contextWindow));
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
                // Unlimited output: allow full context window worth of output tokens.
                // The actual limit is implicitly capped by resolveAdaptiveNPredict via
                // ctx - promptTokens - reserved, so this just removes an artificial ceiling.
                profileCap = 32768;
                break;
            case BALANCED:
            default:
                profileCap = 8192;
                break;
        }
        int hardCap = Math.max(256, maxTokensHardCap);
        return Math.min(Math.min(hardCap, profileCap), Math.max(32, maxTokens));
    }

    /**
     * Exposed for callers that need to know the effective upper bound for output tokens.
     */
    public int getEffectiveMaxTokensLimit() {
        return effectiveMaxTokens();
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
            || lower.contains("```json")
            || lower.contains("\"summary\"")
            || lower.contains("\"code\"")
            || lower.contains("\"changes\"")
            || lower.contains("\"textedits\"")
            || lower.contains("\"text_edits\"");
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
        return info;
    }
}

