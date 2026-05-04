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
import java.util.Map;
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

    @Value("${ai.local.llama.model-path:./csm_datas/public/ai_local/model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf}")
    private String modelPath;

    @Value("${ai.local.llama.context-window:2048}")
    private int contextWindow;

    @Value("${ai.local.llama.max-tokens:384}")
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

    @Value("${ai.local.llama.max-prompt-chars:16000}")
    private int maxPromptChars;

    @Value("${ai.local.llama.system-prompt:}")
    private String systemPrompt;

    @Value("${ai.local.llama.fail-fast:true}")
    private boolean failFast;

    @Value("${ai.local.llama.preload-on-startup:true}")
    private boolean preloadOnStartup;

    @Value("${ai.local.llama.runtime-profile:balanced}")
    private String runtimeProfile;

    @Value("${ai.local.llama.context-window-hard-cap:32768}")
    private int contextWindowHardCap;

    @Value("${ai.local.llama.max-prompt-chars-hard-cap:120000}")
    private int maxPromptCharsHardCap;

    @Value("${ai.local.llama.max-tokens-hard-cap:4096}")
    private int maxTokensHardCap;

    private volatile LlamaModel model;
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

        try {
            String output = runLocalCompletion(safePrompt, false);
            requestCount.incrementAndGet();
            recordSuccess();

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
                    String retryOutput = runLocalCompletion(retryPrompt, true);
                    requestCount.incrementAndGet();
                    recordSuccess();

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
            return createErrorJson("Local llama inference failed: " + firstErr, "LOCAL_INFERENCE_FAILED");
        }
    }

    private String runLocalCompletion(String prompt, boolean degradedMode) {
        LlamaModel localModel = ensureModelLoaded();
        int nPredict = resolveAdaptiveNPredict(prompt, degradedMode);
        float temp = degradedMode ? Math.min(temperature, 0.1f) : Math.max(0f, temperature);
        InferenceParameters inference = new InferenceParameters(prompt)
                .setNPredict(nPredict)
                .setTemperature(temp)
                .setTopP(Math.max(0.1f, Math.min(1f, topP)))
                .setTopK(Math.max(1, topK));
        synchronized (modelLock) {
            return localModel.complete(inference);
        }
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
        int promptTokenBudget = Math.max(256, ctx - outputReserve - 512);
        int byTokenChars = promptTokenBudget * 3;
        return Math.max(2000, Math.min(effectiveMaxPromptChars(), byTokenChars));
    }

    private int estimateTokensByChars(int chars) {
        int safeChars = Math.max(0, chars);
        return Math.max(1, (safeChars + 3) / 4);
    }

    @Override
    public boolean isAvailable() {
        if (!enabled) {
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
        synchronized (modelLock) {
            if (model != null) {
                try {
                    model.close();
                } catch (Exception ignored) {
                    // ignore close errors
                }
                model = null;
            }
        }
    }

    private LlamaModel ensureModelLoaded() {
        LlamaModel current = model;
        if (current != null) {
            return current;
        }
        synchronized (modelLock) {
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
            return Paths.get("csm_datas/public/ai_local/model/model.gguf").toAbsolutePath().normalize();
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
                profileCap = 24000;
                break;
            case MAX:
                profileCap = 120000;
                break;
            case BALANCED:
            default:
                profileCap = 48000;
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
                profileCap = 4096;
                break;
            case BALANCED:
            default:
                profileCap = 2048;
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
}
