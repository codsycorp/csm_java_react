package net.phanmemmottrieu.service;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.model.StreamingResponseHandler;
import dev.langchain4j.model.anthropic.AnthropicStreamingChatModel;
import dev.langchain4j.model.output.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * Streams responses from Claude using LangChain4j Anthropic streaming model.
 * Used by AiCodingController (HTTP SSE endpoint) and AiAssistantGatewayService (Socket.IO chunks).
 */
@Service
public class ClaudeStreamingService {

    private static final Logger log = LoggerFactory.getLogger(ClaudeStreamingService.class);

    @Value("${claude.api-key:${CLAUDE_API_KEY:}}")
    private String claudeApiKey;

    @Value("${claude.streaming.model:}")
    private String defaultStreamingModel;

    // Legacy compatibility key (deprecated): gemini.streaming.model
    @Value("${gemini.streaming.model:}")
    private String legacyStreamingModel;

    @Value("${claude.streaming.fallback-models:}")
    private String fallbackModelsConfig;

    // Legacy compatibility key (deprecated): gemini.streaming.fallback-models
    @Value("${gemini.streaming.fallback-models:}")
    private String legacyFallbackModelsConfig;

    @Value("${claude.streaming.request-timeout-ms:0}")
    private long requestTimeoutMs;

    // Legacy compatibility key (deprecated): gemini.streaming.request-timeout-ms
    @Value("${gemini.streaming.request-timeout-ms:0}")
    private long legacyRequestTimeoutMs;

    @Value("${claude.streaming.fallback-max-attempts:0}")
    private int fallbackMaxAttempts;

    // Legacy compatibility key (deprecated): gemini.streaming.fallback-max-attempts
    @Value("${gemini.streaming.fallback-max-attempts:0}")
    private int legacyFallbackMaxAttempts;

    @Value("${claude.streaming.fallback-attempt-timeout-ms:0}")
    private long fallbackAttemptTimeoutMs;

    // Legacy compatibility key (deprecated): gemini.streaming.fallback-attempt-timeout-ms
    @Value("${gemini.streaming.fallback-attempt-timeout-ms:0}")
    private long legacyFallbackAttemptTimeoutMs;

    @Value("${claude.streaming.rate-limit-retry-wait-ms:0}")
    private long rateLimitRetryWaitMs;

    // Legacy compatibility key (deprecated): gemini.streaming.rate-limit-retry-wait-ms
    @Value("${gemini.streaming.rate-limit-retry-wait-ms:0}")
    private long legacyRateLimitRetryWaitMs;

    @Value("${claude.streaming.max-tokens:4096}")
    private int maxTokens;

    @Value("${claude.streaming.temperature:0.7}")
    private double temperature;

    @Value("${claude.streaming.base-url:https://api.anthropic.com/v1}")
    private String baseUrl;

    @Value("${claude.streaming.version:2023-06-01}")
    private String anthropicVersion;

    @Value("${claude.streaming.response-cache.enabled:true}")
    private boolean responseCacheEnabled;

    @Value("${claude.streaming.response-cache.ttl-ms:600000}")
    private long responseCacheTtlMs;

    @Value("${claude.streaming.response-cache.max-entries:128}")
    private int responseCacheMaxEntries;

    @Value("${claude.streaming.rate-limit-key-cooldown-ms:90000}")
    private long rateLimitKeyCooldownMs;

    @Value("${claude.streaming.limits.default.requests-per-minute:50}")
    private int defaultRequestsPerMinute;

    @Value("${claude.streaming.limits.default.input-tokens-per-minute:30000}")
    private int defaultInputTokensPerMinute;

    @Value("${claude.streaming.limits.default.output-tokens-per-minute:8000}")
    private int defaultOutputTokensPerMinute;

    @Value("${claude.streaming.limits.sonnet.requests-per-minute:50}")
    private int sonnetRequestsPerMinute;

    @Value("${claude.streaming.limits.sonnet.input-tokens-per-minute:30000}")
    private int sonnetInputTokensPerMinute;

    @Value("${claude.streaming.limits.sonnet.output-tokens-per-minute:8000}")
    private int sonnetOutputTokensPerMinute;

    @Value("${claude.streaming.limits.opus.requests-per-minute:50}")
    private int opusRequestsPerMinute;

    @Value("${claude.streaming.limits.opus.input-tokens-per-minute:30000}")
    private int opusInputTokensPerMinute;

    @Value("${claude.streaming.limits.opus.output-tokens-per-minute:8000}")
    private int opusOutputTokensPerMinute;

    @Value("${claude.streaming.limits.haiku.requests-per-minute:50}")
    private int haikuRequestsPerMinute;

    @Value("${claude.streaming.limits.haiku.input-tokens-per-minute:50000}")
    private int haikuInputTokensPerMinute;

    @Value("${claude.streaming.limits.haiku.output-tokens-per-minute:10000}")
    private int haikuOutputTokensPerMinute;

    // Legacy compatibility keys (deprecated)
    @Value("${gemini.streaming.response-cache.enabled:true}")
    private boolean legacyResponseCacheEnabled;

    @Value("${gemini.streaming.response-cache.ttl-ms:600000}")
    private long legacyResponseCacheTtlMs;

    @Value("${gemini.streaming.response-cache.max-entries:128}")
    private int legacyResponseCacheMaxEntries;

    private static class CachedResponse {
        private final String text;
        private final long createdAtMs;

        private CachedResponse(String text, long createdAtMs) {
            this.text = text;
            this.createdAtMs = createdAtMs;
        }
    }

    private static class ModelRateWindow {
        private long windowStartMs;
        private int requests;
        private int inputTokens;
        private int outputTokens;

        private ModelRateWindow(long nowMs) {
            this.windowStartMs = nowMs;
        }
    }

    private static class ModelLimits {
        private final int requestsPerMinute;
        private final int inputTokensPerMinute;
        private final int outputTokensPerMinute;

        private ModelLimits(int requestsPerMinute, int inputTokensPerMinute, int outputTokensPerMinute) {
            this.requestsPerMinute = requestsPerMinute;
            this.inputTokensPerMinute = inputTokensPerMinute;
            this.outputTokensPerMinute = outputTokensPerMinute;
        }
    }

    private final Map<String, CachedResponse> responseCache = Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true));
    private final Map<String, Long> rateLimitedUntilByKey = Collections.synchronizedMap(new HashMap<>());
    private final Map<String, ModelRateWindow> modelRateWindows = Collections.synchronizedMap(new HashMap<>());

    private String resolveDefaultModelName() {
        if (defaultStreamingModel != null && !defaultStreamingModel.isBlank()) {
            return defaultStreamingModel.trim();
        }
        if (legacyStreamingModel != null && !legacyStreamingModel.isBlank()) {
            return legacyStreamingModel.trim();
        }
        return "claude-sonnet-4-6";
    }

    private boolean resolveResponseCacheEnabled() {
        return responseCacheEnabled || legacyResponseCacheEnabled;
    }

    private long resolveResponseCacheTtlMs() {
        if (responseCacheTtlMs > 0) {
            return responseCacheTtlMs;
        }
        if (legacyResponseCacheTtlMs > 0) {
            return legacyResponseCacheTtlMs;
        }
        return 600000L;
    }

    private int resolveResponseCacheMaxEntries() {
        if (responseCacheMaxEntries > 0) {
            return responseCacheMaxEntries;
        }
        if (legacyResponseCacheMaxEntries > 0) {
            return legacyResponseCacheMaxEntries;
        }
        return 128;
    }

    private long resolveRateLimitKeyCooldownMs() {
        return Math.max(5000L, rateLimitKeyCooldownMs);
    }

    private String buildCacheKey(String model, String prompt) {
        String normalizedPrompt = normalizePromptForCache(prompt);
        String raw = String.valueOf(model == null ? "" : model.trim()) + "\n::\n" + normalizedPrompt;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ignored) {
            return String.valueOf(raw.hashCode());
        }
    }

    private String normalizePromptForCache(String prompt) {
        String text = String.valueOf(prompt == null ? "" : prompt);
        if (text.isBlank()) {
            return "";
        }
        // Frontend may append volatile chat history into request message.
        // Remove this block when building cache key to improve repeated-request hit rate.
        text = text.replaceAll("(?is)Lịch sử hội thoại gần đây:\\s*.*?(Trả về JSON theo đúng format:)", "$1");
        return text.trim();
    }

    private String getCachedResponse(String cacheKey) {
        if (!resolveResponseCacheEnabled() || cacheKey == null || cacheKey.isBlank()) {
            return null;
        }
        long ttlMs = Math.max(1000L, resolveResponseCacheTtlMs());
        CachedResponse entry = responseCache.get(cacheKey);
        if (entry == null) {
            return null;
        }
        if ((System.currentTimeMillis() - entry.createdAtMs) > ttlMs) {
            responseCache.remove(cacheKey);
            return null;
        }
        return entry.text;
    }

    private void putCachedResponse(String cacheKey, String text) {
        if (!resolveResponseCacheEnabled() || cacheKey == null || cacheKey.isBlank()) {
            return;
        }
        if (text == null || text.isBlank()) {
            return;
        }
        responseCache.put(cacheKey, new CachedResponse(text, System.currentTimeMillis()));
        int maxEntries = Math.max(16, resolveResponseCacheMaxEntries());
        while (responseCache.size() > maxEntries) {
            String eldest = responseCache.keySet().stream().findFirst().orElse(null);
            if (eldest == null) {
                break;
            }
            responseCache.remove(eldest);
        }
    }

    private long getRemainingRateLimitCooldownMs(String cacheKey) {
        if (cacheKey == null || cacheKey.isBlank()) {
            return 0L;
        }
        Long untilMs = rateLimitedUntilByKey.get(cacheKey);
        if (untilMs == null) {
            return 0L;
        }
        long remain = untilMs - System.currentTimeMillis();
        if (remain <= 0L) {
            rateLimitedUntilByKey.remove(cacheKey);
            return 0L;
        }
        return remain;
    }

    private void markRateLimitCooldown(String cacheKey) {
        if (cacheKey == null || cacheKey.isBlank()) {
            return;
        }
        long until = System.currentTimeMillis() + resolveRateLimitKeyCooldownMs();
        rateLimitedUntilByKey.put(cacheKey, until);
    }

    private int estimateTokens(String text) {
        String value = String.valueOf(text == null ? "" : text);
        if (value.isBlank()) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(value.length() / 4.0));
    }

    private String resolveModelLimitGroup(String model) {
        String m = String.valueOf(model == null ? "" : model).toLowerCase();
        if (m.contains("haiku")) {
            return "haiku";
        }
        if (m.contains("opus")) {
            return "opus";
        }
        if (m.contains("sonnet")) {
            return "sonnet";
        }
        return "default";
    }

    private ModelLimits resolveModelLimits(String model) {
        String group = resolveModelLimitGroup(model);
        if ("haiku".equals(group)) {
            return new ModelLimits(
                    Math.max(1, haikuRequestsPerMinute),
                    Math.max(1000, haikuInputTokensPerMinute),
                    Math.max(1000, haikuOutputTokensPerMinute));
        }
        if ("opus".equals(group)) {
            return new ModelLimits(
                    Math.max(1, opusRequestsPerMinute),
                    Math.max(1000, opusInputTokensPerMinute),
                    Math.max(1000, opusOutputTokensPerMinute));
        }
        if ("sonnet".equals(group)) {
            return new ModelLimits(
                    Math.max(1, sonnetRequestsPerMinute),
                    Math.max(1000, sonnetInputTokensPerMinute),
                    Math.max(1000, sonnetOutputTokensPerMinute));
        }
        return new ModelLimits(
                Math.max(1, defaultRequestsPerMinute),
                Math.max(1000, defaultInputTokensPerMinute),
                Math.max(1000, defaultOutputTokensPerMinute));
    }

    private void resetRateWindowIfNeeded(ModelRateWindow window, long nowMs) {
        if ((nowMs - window.windowStartMs) >= 60000L) {
            window.windowStartMs = nowMs;
            window.requests = 0;
            window.inputTokens = 0;
            window.outputTokens = 0;
        }
    }

    private void waitForRateBudget(String model, String prompt, Consumer<Map<String, Object>> onStatus) {
        ModelLimits limits = resolveModelLimits(model);
        String group = resolveModelLimitGroup(model);
        int inputEstimate = estimateTokens(prompt);

        while (true) {
            long sleepMs;
            synchronized (modelRateWindows) {
                long now = System.currentTimeMillis();
                ModelRateWindow window = modelRateWindows.computeIfAbsent(group, k -> new ModelRateWindow(now));
                resetRateWindowIfNeeded(window, now);

                boolean canUse = (window.requests + 1) <= limits.requestsPerMinute
                        && (window.inputTokens + inputEstimate) <= limits.inputTokensPerMinute
                        && window.outputTokens < limits.outputTokensPerMinute;

                if (canUse) {
                    window.requests += 1;
                    window.inputTokens += inputEstimate;
                    return;
                }

                long elapsed = now - window.windowStartMs;
                sleepMs = Math.max(200L, 60000L - elapsed + 50L);
                if (onStatus != null) {
                    Map<String, Object> status = new HashMap<>();
                    status.put("stage", "waiting");
                    status.put("status", "throttled");
                    status.put("message", String.format("Đang chờ quota Claude (%s): %d ms", group, sleepMs));
                    status.put("waitingMs", sleepMs);
                    status.put("modelGroup", group);
                    status.put("estimatedInputTokens", inputEstimate);
                    status.put("rpmUsed", window.requests);
                    status.put("rpmLimit", limits.requestsPerMinute);
                    status.put("inputTpmUsed", window.inputTokens);
                    status.put("inputTpmLimit", limits.inputTokensPerMinute);
                    status.put("outputTpmUsed", window.outputTokens);
                    status.put("outputTpmLimit", limits.outputTokensPerMinute);
                    status.put("windowRemainingMs", Math.max(0L, 60000L - elapsed));
                    onStatus.accept(status);
                }
            }

            try {
                Thread.sleep(sleepMs);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void recordOutputUsage(String model, int outputTokens) {
        if (outputTokens <= 0) {
            return;
        }
        String group = resolveModelLimitGroup(model);
        synchronized (modelRateWindows) {
            long now = System.currentTimeMillis();
            ModelRateWindow window = modelRateWindows.computeIfAbsent(group, k -> new ModelRateWindow(now));
            resetRateWindowIfNeeded(window, now);
            window.outputTokens += outputTokens;
        }
    }

    private String resolveFallbackModelsConfig() {
        if (fallbackModelsConfig != null && !fallbackModelsConfig.isBlank()) {
            return fallbackModelsConfig;
        }
        if (legacyFallbackModelsConfig != null && !legacyFallbackModelsConfig.isBlank()) {
            return legacyFallbackModelsConfig;
        }
        return "claude-sonnet-4-6";
    }

    private long resolveRequestTimeoutMs() {
        if (requestTimeoutMs > 0) {
            return requestTimeoutMs;
        }
        if (legacyRequestTimeoutMs > 0) {
            return legacyRequestTimeoutMs;
        }
        return 300000L;
    }

    private int resolveFallbackMaxAttempts() {
        if (fallbackMaxAttempts > 0) {
            return fallbackMaxAttempts;
        }
        if (legacyFallbackMaxAttempts > 0) {
            return legacyFallbackMaxAttempts;
        }
        return 2;
    }

    private long resolveFallbackAttemptTimeoutMs() {
        if (fallbackAttemptTimeoutMs > 0) {
            return fallbackAttemptTimeoutMs;
        }
        if (legacyFallbackAttemptTimeoutMs > 0) {
            return legacyFallbackAttemptTimeoutMs;
        }
        return 180000L;
    }

    private long resolveRateLimitRetryWaitMs() {
        if (rateLimitRetryWaitMs > 0) {
            return rateLimitRetryWaitMs;
        }
        if (legacyRateLimitRetryWaitMs > 0) {
            return legacyRateLimitRetryWaitMs;
        }
        return 12000L;
    }

    private boolean isRateLimitLikeError(Throwable ex) {
        if (ex == null) {
            return false;
        }
        String text = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase();
        if (text.contains("429") || text.contains("rate limit") || text.contains("too many requests") || text.contains("overloaded")) {
            return true;
        }
        Throwable cause = ex.getCause();
        while (cause != null) {
            String causeText = String.valueOf(cause.getMessage() == null ? "" : cause.getMessage()).toLowerCase();
            if (causeText.contains("429") || causeText.contains("rate limit") || causeText.contains("too many requests")) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private boolean isModelNotFoundError(Throwable ex) {
        if (ex == null) {
            return false;
        }
        String text = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase();
        if (text.contains("not_found_error") || text.contains("model:") && text.contains("not found")) {
            return true;
        }
        Throwable cause = ex.getCause();
        while (cause != null) {
            String causeText = String.valueOf(cause.getMessage() == null ? "" : cause.getMessage()).toLowerCase();
            if (causeText.contains("not_found_error") || causeText.contains("model:") && causeText.contains("not found")) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private List<String> resolveFallbackModels() {
        Set<String> unique = new LinkedHashSet<>();
        String resolvedConfig = resolveFallbackModelsConfig();
        if (resolvedConfig != null && !resolvedConfig.isBlank()) {
            String[] parts = resolvedConfig.split(",");
            for (String part : parts) {
                String model = part == null ? "" : part.trim();
                if (!model.isEmpty()) {
                    unique.add(model);
                }
            }
        }
        return new ArrayList<>(unique);
    }

    private List<String> buildRetryModelOrder(String promptModel) {
        Set<String> ordered = new LinkedHashSet<>();
        if (promptModel != null && !promptModel.isBlank()) {
            ordered.add(promptModel.trim());
        }
        ordered.addAll(resolveFallbackModels());
        return new ArrayList<>(ordered);
    }

    private void sleepForRateLimitBackoff(int attempt, String model, Consumer<Map<String, Object>> onStatus) {
        long baseWaitMs = Math.max(1000L, resolveRateLimitRetryWaitMs());
        long waitMs = Math.min(60000L, baseWaitMs * Math.max(1L, attempt + 1L));
        if (onStatus != null) {
            Map<String, Object> status = new HashMap<>();
            status.put("stage", "waiting");
            status.put("message", String.format("Claude rate-limited. Waiting %d ms before retry (%s)", waitMs, model));
            status.put("waitingMs", waitMs);
            onStatus.accept(status);
        }
        try {
            Thread.sleep(waitMs);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private AnthropicStreamingChatModel buildModel(String modelName, long timeoutMs) {
        AnthropicStreamingChatModel.AnthropicStreamingChatModelBuilder builder = AnthropicStreamingChatModel.builder()
                .apiKey(claudeApiKey)
                .modelName(modelName)
                .maxTokens(Math.max(256, maxTokens))
                .temperature(temperature)
                .timeout(Duration.ofMillis(Math.max(1000L, timeoutMs)));

        String resolvedBaseUrl = baseUrl == null ? "" : baseUrl.trim();
        if (!resolvedBaseUrl.isEmpty()) {
            builder.baseUrl(resolvedBaseUrl);
        }
        String resolvedVersion = anthropicVersion == null ? "" : anthropicVersion.trim();
        if (!resolvedVersion.isEmpty()) {
            builder.version(resolvedVersion);
        }
        return builder.build();
    }

    private Throwable executeFallbackAcrossModels(
            String prompt,
            String promptModel,
            StringBuilder fullResponse,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Map<String, Object>> onStatus) {

        List<String> fallbackModels = buildRetryModelOrder(promptModel);
        int maxAttempts = Math.max(1, resolveFallbackMaxAttempts());

        if (fallbackModels.isEmpty()) {
            return new IllegalStateException("No Claude fallback models configured");
        }

        Throwable lastError = null;
        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            String fallbackModel = fallbackModels.get(attempt % fallbackModels.size());
            log.warn(
                    "ClaudeStreamingService: fallback attempt {}/{} from {} -> Claude model {}.",
                    attempt + 1,
                    maxAttempts,
                    promptModel,
                    fallbackModel);

            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "analyzing");
                status.put("message", String.format("Fallback attempt %d/%d: %s", attempt + 1, maxAttempts, fallbackModel));
                status.put("current", attempt + 1);
                status.put("total", maxAttempts);
                status.put("percent", Math.min(99, (int) Math.round(((attempt + 1) * 100.0) / Math.max(1, maxAttempts))));
                onStatus.accept(status);
            }

            Throwable fallbackError = executeStreamingRequest(
                    prompt,
                    fallbackModel,
                    fullResponse,
                    onChunk,
                    onComplete,
                    true,
                    resolveFallbackAttemptTimeoutMs(),
                    onStatus);

            if (fallbackError == null) {
                return null;
            }

            lastError = fallbackError;
            if (isModelNotFoundError(fallbackError)) {
                log.warn("ClaudeStreamingService: skip unavailable Claude model {} (not found).", fallbackModel);
                continue;
            }
            if (isRateLimitLikeError(fallbackError)) {
                sleepForRateLimitBackoff(attempt, fallbackModel, onStatus);
                continue;
            }

            return fallbackError;
        }

        if (lastError != null) {
            return lastError;
        }
        return new IllegalStateException("Fallback attempts exhausted without success");
    }

    private Throwable executeStreamingRequest(
            String prompt,
            String model,
            StringBuilder fullResponse,
            Consumer<String> onChunk,
            Runnable onComplete,
            boolean suppressErrorLog,
            long timeoutMs,
            Consumer<Map<String, Object>> onStatus) {

        AtomicReference<Throwable> errorHolder = new AtomicReference<>(null);
        AtomicBoolean completedByHandler = new AtomicBoolean(false);
        CountDownLatch latch = new CountDownLatch(1);
        int baseLength = fullResponse.length();
        long startedAtMs = System.currentTimeMillis();

        waitForRateBudget(model, prompt, onStatus);

        try {
            AnthropicStreamingChatModel modelClient = buildModel(model, timeoutMs);
            modelClient.generate(prompt, new StreamingResponseHandler<AiMessage>() {
                @Override
                public void onNext(String token) {
                    if (token == null || token.isEmpty()) {
                        return;
                    }
                    fullResponse.append(token);
                    if (onChunk != null) {
                        try {
                            onChunk.accept(token);
                        } catch (Exception ignored) {
                            // Client may have disconnected; keep processing server-side stream.
                        }
                    }
                }

                @Override
                public void onComplete(Response<AiMessage> response) {
                    completedByHandler.set(true);
                    if (onComplete != null) {
                        try {
                            onComplete.run();
                        } catch (Exception ignored) {
                            // Ignore callback failures from caller.
                        }
                    }
                    latch.countDown();
                }

                @Override
                public void onError(Throwable error) {
                    if (suppressErrorLog && isRateLimitLikeError(error)) {
                        log.warn("ClaudeStreamingService: Claude model {} hit rate limit; will use fallback flow.", model);
                    } else {
                        log.error("ClaudeStreamingService: Claude streaming error for model {}: {}", model, error.getMessage(), error);
                    }
                    errorHolder.compareAndSet(null, error);
                    latch.countDown();
                }
            });

            long maxWaitMs = Math.max(1500L, timeoutMs + 1000L);
            long deadlineMs = System.currentTimeMillis() + maxWaitMs;
            boolean completed = false;
            while (System.currentTimeMillis() < deadlineMs) {
                long remainingMs = Math.max(1L, deadlineMs - System.currentTimeMillis());
                long sliceMs = Math.min(5000L, remainingMs);
                if (latch.await(sliceMs, TimeUnit.MILLISECONDS)) {
                    completed = true;
                    break;
                }

                if (onStatus != null) {
                    long elapsedMs = Math.max(0L, System.currentTimeMillis() - startedAtMs);
                    Map<String, Object> status = new HashMap<>();
                    status.put("stage", "streaming");
                    status.put("status", "running");
                    status.put("message", "Claude đang xử lý, vui lòng đợi...");
                    status.put("elapsedMs", elapsedMs);
                    status.put("percent", 15);
                    onStatus.accept(status);
                }
            }

            if (!completed) {
                TimeoutException timeout = new TimeoutException("Claude streaming timeout after " + timeoutMs + " ms");
                errorHolder.compareAndSet(null, timeout);
                log.warn("ClaudeStreamingService: timeout for Claude model {} after {} ms", model, timeoutMs);
            }
        } catch (Exception ex) {
            if (suppressErrorLog && isRateLimitLikeError(ex)) {
                log.warn("ClaudeStreamingService: Claude call got rate limit for model {}; switching to fallback.", model);
            } else {
                log.error("ClaudeStreamingService: Claude call failed for model {}: {}", model, ex.getMessage(), ex);
            }
            errorHolder.compareAndSet(null, ex);
        }

        if (errorHolder.get() == null && !completedByHandler.get() && onComplete != null) {
            onComplete.run();
        }

        int generatedChars = Math.max(0, fullResponse.length() - baseLength);
        if (generatedChars > 0) {
            recordOutputUsage(model, estimateTokens(fullResponse.substring(baseLength)));
        }

        return errorHolder.get();
    }

    /**
     * Stream Claude response token-by-token.
     *
     * @param prompt        The prompt to send to Claude
    * @param modelOverride Optional model override; uses ${claude.streaming.model} if null/blank
     * @param onChunk       Called for each text token received
     * @param onComplete    Called when streaming completes successfully (may be null)
     * @param onError       Called if an error occurs (may be null)
     * @return Full accumulated response text
     */
    public String streamContent(
            String prompt,
            String modelOverride,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Throwable> onError) {
        return streamContent(prompt, modelOverride, onChunk, onComplete, onError, null);
    }

    public String streamContent(
            String prompt,
            String modelOverride,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Throwable> onError,
            Consumer<Map<String, Object>> onStatus) {

        String model = (modelOverride != null && !modelOverride.isBlank()) ? modelOverride : resolveDefaultModelName();
        String cacheKey = buildCacheKey(model, prompt);
        String cachedResponse = getCachedResponse(cacheKey);
        if (cachedResponse != null) {
            log.info("ClaudeStreamingService: cache hit for model {}", model);
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "cached");
                status.put("status", "cached");
                status.put("message", "Đã dùng kết quả từ bộ nhớ cache");
                status.put("percent", 100);
                onStatus.accept(status);
            }
            if (onChunk != null) {
                onChunk.accept(cachedResponse);
            }
            if (onComplete != null) {
                onComplete.run();
            }
            return cachedResponse;
        }

        long cooldownRemainMs = getRemainingRateLimitCooldownMs(cacheKey);
        if (cooldownRemainMs > 0L) {
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "waiting");
                status.put("status", "rate_limited_cached_cooldown");
                status.put("message", String.format("Yêu cầu trùng đang bị rate-limit, vui lòng chờ %d ms", cooldownRemainMs));
                status.put("waitingMs", cooldownRemainMs);
                onStatus.accept(status);
            }
            if (onError != null) {
                onError.accept(new IllegalStateException("Claude đang rate-limit cho cùng nội dung; thử lại sau " + cooldownRemainMs + " ms"));
            }
            return "";
        }

        if (claudeApiKey == null || claudeApiKey.isBlank()) {
            RuntimeException err = new IllegalStateException("Missing Claude API key. Set CLAUDE_API_KEY or claude.api-key");
            log.error("ClaudeStreamingService: {}", err.getMessage());
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }

        StringBuilder fullResponse = new StringBuilder();

        Throwable primaryError = executeStreamingRequest(
                prompt,
                model,
                fullResponse,
                onChunk,
                onComplete,
                true,
            resolveRequestTimeoutMs(),
            onStatus);
        if (primaryError == null) {
            String text = fullResponse.toString();
            putCachedResponse(cacheKey, text);
            return text;
        }

        if (fullResponse.isEmpty()) {
            Throwable fallbackError = executeFallbackAcrossModels(
                    prompt,
                    model,
                    fullResponse,
                    onChunk,
                    onComplete,
                    onStatus);
            if (fallbackError == null) {
                String text = fullResponse.toString();
                putCachedResponse(cacheKey, text);
                return text;
            }
            if (isRateLimitLikeError(fallbackError)) {
                markRateLimitCooldown(cacheKey);
            }
            if (onError != null) {
                onError.accept(fallbackError);
            }
            return fullResponse.toString();
        }

        if (isRateLimitLikeError(primaryError)) {
            markRateLimitCooldown(cacheKey);
        }
        if (onError != null) {
            onError.accept(primaryError);
        }

        return fullResponse.toString();
    }
}
