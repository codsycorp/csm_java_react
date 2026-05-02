package net.phanmemmottrieu.service;

import dev.langchain4j.data.message.Content;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.googleai.GoogleAiGeminiStreamingChatModel;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

/**
 * Gemini-only streaming adapter used by ai-code-stream and Socket.IO gateway.
 */
@Service
public class GeminiStreamingService {

    private static final Logger log = LoggerFactory.getLogger(GeminiStreamingService.class);

    @Value("${gemini.pro.api-key:${GEMINI_PRO_API_KEY:}}")
    private String geminiProApiKey;

    @Value("${gemini.api-key:${GEMINI_API_KEY:}}")
    private String geminiApiKey;

    @Value("${google.ai.gemini.api-key:${GOOGLE_AI_GEMINI_API_KEY:}}")
    private String googleAiGeminiApiKey;

    @Value("${gemini.api-keys:${GEMINI_API_KEYS:}}")
    private String geminiApiKeys;

    @Value("${gemini.model:gemini-2.5-pro}")
    private String geminiDefaultModel;

    @Value("${gemini.streaming.max-tokens:8192}")
    private int maxTokens;

    @Value("${gemini.streaming.temperature:0.2}")
    private double temperature;

    @Value("${gemini.streaming.request-timeout-ms:300000}")
    private long requestTimeoutMs;

    @Value("${gemini.streaming.input-token-soft-limit:6800}")
    private int geminiInputTokenSoftLimit;

    @Value("${gemini.streaming.response-cache.enabled:true}")
    private boolean responseCacheEnabled;

    @Value("${gemini.streaming.response-cache.ttl-ms:600000}")
    private long responseCacheTtlMs;

    @Value("${gemini.streaming.response-cache.max-entries:128}")
    private int responseCacheMaxEntries;

    @Value("${gemini.streaming.rate-limit-key-cooldown-ms:90000}")
    private long rateLimitKeyCooldownMs;

    // ─── Claude (Anthropic) configuration ───────────────────────────────────────
    @Value("${claude.api-key:${CLAUDE_API_KEY:}}")
    private String claudeApiKey;

    @Value("${claude.api-keys:${CLAUDE_API_KEYS:}}")
    private String claudeApiKeys;

    @Value("${claude.model:claude-opus-4-5}")
    private String claudeDefaultModel;

    @Value("${claude.streaming.max-tokens:8192}")
    private int claudeMaxTokens;

    @Value("${claude.streaming.temperature:0.7}")
    private double claudeTemperature;

    @Value("${claude.streaming.rate-limit-key-cooldown-ms:60000}")
    private long claudeRateLimitKeyCooldownMs;

    /**
     * OpenDevin tenacity / Devin retry_task pattern: exponential backoff base delay
     * when ALL Claude keys are in rate-limit cooldown simultaneously.
     * Delay = min(backoffMaxMs, backoffBaseMs * 2^attempt).
     */
    @Value("${claude.streaming.rate-limit-backoff-base-ms:1000}")
    private long claudeRateLimitBackoffBaseMs;

    @Value("${claude.streaming.rate-limit-backoff-max-ms:30000}")
    private long claudeRateLimitBackoffMaxMs;

    @Value("${gemini.streaming.rate-limit-backoff-base-ms:2000}")
    private long geminiRateLimitBackoffBaseMs;

    @Value("${gemini.streaming.rate-limit-backoff-max-ms:60000}")
    private long geminiRateLimitBackoffMaxMs;

    @Value("${claude.streaming.input-token-soft-limit:9000}")
    private int claudeInputTokenSoftLimit;

    @Value("${ai.token-estimate.chars-per-token:4}")
    private int aiTokenEstimateCharsPerToken;

    @Value("${ai.streaming.prompt-hard-char-cap:1200000}")
    private int aiStreamingPromptHardCharCap;

    private static final String CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
    private static final String CLAUDE_API_VERSION = "2023-06-01";
    private static final MediaType JSON_MEDIA_TYPE = MediaType.parse("application/json; charset=utf-8");

    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final AiPromptBudgetService aiPromptBudgetService;
    private final ApiCallInstrumentationService apiCallInstrumentationService;
    private volatile OkHttpClient claudeHttpClient;
    private final Map<String, Long> claudeRateLimitedUntilByApiKey = Collections.synchronizedMap(new HashMap<>());

    @Autowired
    public GeminiStreamingService(
            AiPromptBudgetService aiPromptBudgetService,
            ApiCallInstrumentationService apiCallInstrumentationService) {
        this.aiPromptBudgetService = aiPromptBudgetService;
        this.apiCallInstrumentationService = apiCallInstrumentationService;
    }

    private OkHttpClient getClaudeHttpClient() {
        if (claudeHttpClient == null) {
            synchronized (this) {
                if (claudeHttpClient == null) {
                    claudeHttpClient = new OkHttpClient.Builder()
                            .connectTimeout(30, TimeUnit.SECONDS)
                            .readTimeout(5, TimeUnit.MINUTES)
                            .writeTimeout(60, TimeUnit.SECONDS)
                            .build();
                }
            }
        }
        return claudeHttpClient;
    }

    private static class CachedResponse {
        private final String text;
        private final long createdAtMs;

        private CachedResponse(String text, long createdAtMs) {
            this.text = text;
            this.createdAtMs = createdAtMs;
        }
    }

    private final Map<String, CachedResponse> responseCache = Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true));
    private final Map<String, Long> rateLimitedUntilByKey = Collections.synchronizedMap(new HashMap<>());
    private final Map<String, Long> rateLimitedUntilByApiKey = Collections.synchronizedMap(new HashMap<>());

    private String resolveDefaultModelName() {
        if (geminiDefaultModel != null && !geminiDefaultModel.isBlank()) {
            return geminiDefaultModel.trim();
        }
        return "gemini-2.5-pro";
    }

    private long resolveRequestTimeoutMs() {
        return Math.max(15000L, requestTimeoutMs);
    }

    private long resolveResponseCacheTtlMs() {
        return Math.max(1000L, responseCacheTtlMs);
    }

    private int resolveResponseCacheMaxEntries() {
        return Math.max(16, responseCacheMaxEntries);
    }

    private long resolveRateLimitKeyCooldownMs() {
        return Math.max(3000L, rateLimitKeyCooldownMs);
    }

    private int resolveGeminiInputTokenSoftLimit() {
        // Profile-driven limit from AiPromptBudgetService takes precedence over local @Value
        int profileLimit = aiPromptBudgetService.resolveGeminiSoftLimit();
        int localLimit = Math.max(2000, geminiInputTokenSoftLimit);
        return Math.min(profileLimit, localLimit);
    }

    private int resolveClaudeInputTokenSoftLimit() {
        int profileLimit = aiPromptBudgetService.resolveClaudeSoftLimit();
        int localLimit = Math.max(2000, claudeInputTokenSoftLimit);
        return Math.min(profileLimit, localLimit);
    }

    private int resolveCharsPerTokenEstimate() {
        return Math.max(2, aiTokenEstimateCharsPerToken);
    }

    private int estimateInputTokens(String prompt) {
        return aiPromptBudgetService.estimateTokensByChars(prompt, resolveCharsPerTokenEstimate());
    }

    private int resolvePromptHardCharCap() {
        return Math.max(60000, aiStreamingPromptHardCharCap);
    }

    private String preparePromptForProvider(String prompt) {
        return aiPromptBudgetService.normalizePrompt(prompt, resolvePromptHardCharCap());
    }

    private boolean isOverPromptSoftLimit(
            String provider,
            String model,
            String prompt,
            int softLimit,
            Consumer<Throwable> onError,
            Consumer<Map<String, Object>> onStatus) {
        int promptChars = Math.max(0, String.valueOf(prompt == null ? "" : prompt).length());
        int promptTokens = estimateInputTokens(prompt);
        if (promptTokens <= Math.max(1, softLimit)) {
            return false;
        }

        String reason = String.format(
                "%s prompt over soft token limit: promptTokens~%d > softLimit=%d (model=%s)",
                String.valueOf(provider == null ? "provider" : provider),
                promptTokens,
                Math.max(1, softLimit),
                String.valueOf(model == null ? "" : model));
        IllegalStateException err = new IllegalStateException(reason);
        log.warn("GeminiStreamingService: {}", reason);

        if (onStatus != null) {
            Map<String, Object> status = new HashMap<>();
            status.put("stage", "input_budget_guard");
            status.put("status", "prompt_too_large_soft_limit");
            status.put("provider", String.valueOf(provider == null ? "" : provider));
            status.put("model", String.valueOf(model == null ? "" : model));
            status.put("promptChars", promptChars);
            status.put("promptTokens", promptTokens);
            status.put("softLimit", Math.max(1, softLimit));
            status.put("message", "Prompt qua lon cho nguong token mem, dung som de tranh lang phi API");
            onStatus.accept(status);
        }
        if (onError != null) {
            onError.accept(err);
        }

        int savedTokens = Math.max(0, promptTokens - Math.max(1, softLimit));
        try {
            Map<String, Object> telemetry = new LinkedHashMap<>();
            telemetry.put("timestamp", System.currentTimeMillis());
            telemetry.put("flow", "ai-stream-guard");
            telemetry.put("contextType", String.valueOf(provider == null ? "" : provider));
            telemetry.put("taskType", "input_budget_guard");
            telemetry.put("responseMode", "guard_block");
            telemetry.put("model", String.valueOf(model == null ? "" : model));
            telemetry.put("promptChars", promptChars);
            telemetry.put("promptTokens", promptTokens);
            telemetry.put("estimatedSavedTokens", savedTokens);
            telemetry.put("inputBudgetGuardTriggered", true);
            telemetry.put("estimatedCostUsd", 0.0);
            apiCallInstrumentationService.recordAiTelemetry(telemetry);
        } catch (Exception ignored) {
            // Telemetry must not break serving path.
        }

        return true;
    }

    private String normalizePromptForCache(String prompt) {
        String text = String.valueOf(prompt == null ? "" : prompt);
        if (text.isBlank()) {
            return "";
        }
        text = text.replaceAll("(?is)Lịch sử hội thoại gần đây:\\s*.*?(Trả về JSON theo đúng format:)", "$1");
        return text.trim();
    }

    private String buildCacheKey(String model, String prompt) {
        String normalizedPrompt = normalizePromptForCache(prompt);
        String raw = String.valueOf(model == null ? "" : model.trim()) + "\\n::\\n" + normalizedPrompt;
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

    private String getCachedResponse(String cacheKey) {
        if (!responseCacheEnabled || cacheKey == null || cacheKey.isBlank()) {
            return null;
        }
        CachedResponse entry = responseCache.get(cacheKey);
        if (entry == null) {
            return null;
        }
        if ((System.currentTimeMillis() - entry.createdAtMs) > resolveResponseCacheTtlMs()) {
            responseCache.remove(cacheKey);
            return null;
        }
        return entry.text;
    }

    private void putCachedResponse(String cacheKey, String text) {
        if (!responseCacheEnabled || cacheKey == null || cacheKey.isBlank() || text == null || text.isBlank()) {
            return;
        }
        responseCache.put(cacheKey, new CachedResponse(text, System.currentTimeMillis()));
        while (responseCache.size() > resolveResponseCacheMaxEntries()) {
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
        rateLimitedUntilByKey.put(cacheKey, System.currentTimeMillis() + resolveRateLimitKeyCooldownMs());
    }

    private long getRemainingApiKeyCooldownMs(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return 0L;
        }
        Long untilMs = rateLimitedUntilByApiKey.get(apiKey);
        if (untilMs == null) {
            return 0L;
        }
        long remain = untilMs - System.currentTimeMillis();
        if (remain <= 0L) {
            rateLimitedUntilByApiKey.remove(apiKey);
            return 0L;
        }
        return remain;
    }

    private void markApiKeyRateLimitCooldown(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return;
        }
        rateLimitedUntilByApiKey.put(apiKey, System.currentTimeMillis() + resolveRateLimitKeyCooldownMs());
    }

    private boolean isRateLimitLikeError(Throwable ex) {
        if (ex == null) {
            return false;
        }
        String msg = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase();
        return msg.contains("429") || msg.contains("rate limit") || msg.contains("quota") || msg.contains("too many requests");
    }

    private boolean shouldTryNextApiKey(Throwable ex) {
        if (ex == null) {
            return false;
        }
        String msg = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase();
        if (msg.contains("429") || msg.contains("rate limit") || msg.contains("quota") || msg.contains("resource exhausted")) {
            return true;
        }
        if (msg.contains("401") || msg.contains("403") || msg.contains("invalid api key") || msg.contains("permission denied") || msg.contains("unauthorized")) {
            return true;
        }
        return msg.contains("timeout")
                || msg.contains("deadline exceeded")
                || msg.contains("temporarily unavailable")
                || msg.contains("503")
                || msg.contains("500");
    }

    private String normalizeModelToGemini(String model) {
        String raw = String.valueOf(model == null ? "" : model).trim();
        if (raw.isEmpty()) {
            return resolveDefaultModelName();
        }

        String lower = raw.toLowerCase();
        if (lower.startsWith("claude-") || lower.contains("sonnet") || lower.contains("opus")) {
            return "gemini-2.5-pro";
        }
        if (lower.contains("haiku")) {
            return "gemini-2.5-flash";
        }
        return raw;
    }

    private void addParsedApiKeys(Set<String> target, String raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.isBlank()) {
            return;
        }
        String[] parts = text.split("[,;\\n\\r\\t ]+");
        for (String part : parts) {
            String key = String.valueOf(part == null ? "" : part).trim();
            if (!key.isBlank()) {
                target.add(key);
            }
        }
    }

    private List<String> resolveGeminiApiKeys() {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        addParsedApiKeys(keys, geminiApiKeys);
        addParsedApiKeys(keys, geminiProApiKey);
        addParsedApiKeys(keys, geminiApiKey);
        addParsedApiKeys(keys, googleAiGeminiApiKey);
        return new ArrayList<>(keys);
    }

    private String resolveGeminiApiKey() {
        List<String> keys = resolveGeminiApiKeys();
        return keys.isEmpty() ? "" : keys.get(0);
    }

    private String maskApiKey(String apiKey) {
        String key = String.valueOf(apiKey == null ? "" : apiKey).trim();
        if (key.length() <= 8) {
            return "***";
        }
        return key.substring(0, 4) + "..." + key.substring(key.length() - 4);
    }

    /**
     * Ước tính thời gian chờ (giây) dựa trên số chars của prompt.
     * TTFT Gemini 2.5 Pro: ~1s + 1s per 3000 chars input
     * Generation: ~400 chars/s output
     */
    private int estimateWaitSeconds(int promptChars, int outputTokens) {
        int ttftSecs = 3 + promptChars / 4000;          // time to first token
        int genSecs  = (outputTokens * 4) / 400;        // generation time (4 chars/token, 400 chars/s)
        return ttftSecs + genSecs;
    }

    /**
     * ETA progress should not use full configured maxTokens because deployments can set it very high
     * (e.g. 65536), leading to unrealistic countdowns in UI while real responses finish much faster.
     */
    private int estimateOutputTokensForProgress(int promptChars, int configuredOutputTokens) {
        int promptBased = Math.max(768, Math.min(4096, (promptChars / 20) + 512));
        return Math.max(256, Math.min(configuredOutputTokens, promptBased));
    }

    private String executeGeminiStreamContent(String model, String prompt, String apiKey,
            Consumer<String> onChunk, Consumer<Map<String, Object>> onStatus) throws Exception {
        return executeGeminiStreamContent(model, prompt, null, apiKey, onChunk, onStatus);
    }

    /**
     * @param imageParts Optional list of {base64Data, mimeType} maps for multimodal requests.
     */
    private String executeGeminiStreamContent(String model, String prompt, List<Map<String, String>> imageParts,
            String apiKey, Consumer<String> onChunk, Consumer<Map<String, Object>> onStatus) throws Exception {
        String resolvedModel = normalizeModelToGemini(model);

        int promptChars = prompt == null ? 0 : prompt.length();
        int configuredOutputTokens = Math.max(256, maxTokens);
        int progressEstimatedTokens = estimateOutputTokensForProgress(promptChars, configuredOutputTokens);
        int estimatedWaitSecs = estimateWaitSeconds(promptChars, progressEstimatedTokens);
        int estimatedOutputChars = progressEstimatedTokens * 4;
        long startMs = System.currentTimeMillis();

        if (onStatus != null) {
            Map<String, Object> initStatus = new HashMap<>();
            initStatus.put("stage", "waiting_gemini");
            initStatus.put("status", "connecting");
            initStatus.put("message", "Đang gửi yêu cầu đến Chuyên Gia...");
            initStatus.put("estimatedWaitSecs", estimatedWaitSecs);
            initStatus.put("promptChars", promptChars);
            initStatus.put("percent", 2);
            onStatus.accept(initStatus);
        }

        // Heartbeat: gửi waiting status mỗi 3s cho đến khi có token đầu tiên
        AtomicBoolean firstChunkArrived = new AtomicBoolean(false);
        AtomicInteger charsReceived = new AtomicInteger(0);
        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "gemini-heartbeat");
            t.setDaemon(true);
            return t;
        });
        ScheduledFuture<?> heartbeatTask = null;
        if (onStatus != null) {
            heartbeatTask = heartbeat.scheduleAtFixedRate(() -> {
                long elapsed = System.currentTimeMillis() - startMs;
                int received = charsReceived.get();
                Map<String, Object> st = new HashMap<>();
                if (!firstChunkArrived.get()) {
                    // Chưa có token: đang chờ Gemini
                    int elapsedSecs = Math.max(1, (int) Math.ceil(elapsed / 1000.0));
                    int remainSecs = Math.max(0, estimatedWaitSecs - (int) (elapsed / 1000));
                    boolean overdue = remainSecs <= 0;
                    st.put("stage", "waiting_gemini");
                    st.put("status", "waiting");
                    st.put("message", overdue
                            ? "Chuyên Gia đang suy nghĩ... (đã chờ " + elapsedSecs + "s)"
                            : "Chuyên Gia đang suy nghĩ... (~" + remainSecs + "s còn lại)");
                    st.put("elapsedMs", elapsed);
                    st.put("elapsedSecs", elapsedSecs);
                    st.put("estimatedWaitSecs", estimatedWaitSecs);
                    st.put("remainingEstimateSecs", remainSecs);
                    st.put("waitState", overdue ? "overdue" : "estimated");
                    st.put("percent", Math.min(15, 2 + (int)(elapsed / 1000)));
                } else {
                    // Đang streaming: hiển thị tiến trình
                    int pct = estimatedOutputChars > 0
                        ? Math.min(95, 15 + (received * 80 / estimatedOutputChars))
                        : 50;
                    long genElapsed = elapsed; // approximate
                    int remainOutputChars = Math.max(0, estimatedOutputChars - received);
                    int remainSecs = remainOutputChars > 0 && genElapsed > 0
                        ? (int)(remainOutputChars / Math.max(1.0, (double) received / (genElapsed / 1000.0)))
                        : 0;
                    st.put("stage", "streaming_progress");
                    st.put("status", "streaming");
                    st.put("message", "Đang nhận kết quả... (" + received + " ký tự)");
                    st.put("charsReceived", received);
                    st.put("estimatedTotalChars", estimatedOutputChars);
                    st.put("elapsedMs", elapsed);
                    st.put("remainingEstimateSecs", remainSecs);
                    st.put("percent", pct);
                }
                onStatus.accept(st);
            }, 3, 3, TimeUnit.SECONDS);
        }

        StringBuilder fullText = new StringBuilder();
        CompletableFuture<String> completion = new CompletableFuture<>();

        GoogleAiGeminiStreamingChatModel streamingModel = GoogleAiGeminiStreamingChatModel.builder()
                .apiKey(apiKey)
                .modelName(resolvedModel)
                .temperature(temperature)
            .maxOutputTokens(configuredOutputTokens)
                .timeout(Duration.ofMillis(resolveRequestTimeoutMs()))
                .build();

        try {
            if (imageParts != null && !imageParts.isEmpty()) {
                // Multimodal request: build UserMessage with text + image parts
                List<Content> contents = new ArrayList<>();
                String promptText = String.valueOf(prompt == null ? "" : prompt);
                if (!promptText.isBlank()) {
                    contents.add(TextContent.from(promptText));
                }
                int imageCount = 0;
                for (Map<String, String> img : imageParts) {
                    String base64Data = img.get("base64Data");
                    String mimeType = img.get("mimeType");
                    if (base64Data != null && !base64Data.isBlank() && mimeType != null && !mimeType.isBlank()) {
                        contents.add(ImageContent.from(base64Data, mimeType));
                        imageCount++;
                    }
                }
                log.info("GeminiStreamingService: multimodal request model={} textChars={} images={}",
                        resolvedModel, promptText.length(), imageCount);
                UserMessage userMessage = UserMessage.from(contents);
                streamingModel.chat(List.of(userMessage), new StreamingChatResponseHandler() {
                    @Override
                    public void onPartialResponse(String partialResponse) {
                        handleChunk(partialResponse, firstChunkArrived, charsReceived, startMs,
                                estimatedWaitSecs, estimatedOutputChars, onStatus, onChunk, fullText);
                    }
                    @Override
                    public void onCompleteResponse(ChatResponse completeResponse) {
                        String completedText = fullText.toString();
                        if (completedText.isEmpty() && completeResponse != null
                                && completeResponse.aiMessage() != null
                                && completeResponse.aiMessage().text() != null) {
                            completedText = completeResponse.aiMessage().text();
                        }
                        completion.complete(completedText);
                    }
                    @Override
                    public void onError(Throwable error) {
                        completion.completeExceptionally(error);
                    }
                });
            } else {
                // Text-only request
                streamingModel.chat(String.valueOf(prompt == null ? "" : prompt), new StreamingChatResponseHandler() {
                    @Override
                    public void onPartialResponse(String partialResponse) {
                        handleChunk(partialResponse, firstChunkArrived, charsReceived, startMs,
                                estimatedWaitSecs, estimatedOutputChars, onStatus, onChunk, fullText);
                    }
                    @Override
                    public void onCompleteResponse(ChatResponse completeResponse) {
                        String completedText = fullText.toString();
                        if (completedText.isEmpty() && completeResponse != null
                                && completeResponse.aiMessage() != null
                                && completeResponse.aiMessage().text() != null) {
                            completedText = completeResponse.aiMessage().text();
                        }
                        completion.complete(completedText);
                    }
                    @Override
                    public void onError(Throwable error) {
                        completion.completeExceptionally(error);
                    }
                });
            }

            return completion.get(resolveRequestTimeoutMs(), TimeUnit.MILLISECONDS);
        } finally {
            if (heartbeatTask != null) heartbeatTask.cancel(false);
            heartbeat.shutdownNow();
        }
    }

    /** Shared chunk handler used by both text-only and multimodal paths. */
    private void handleChunk(String partialResponse,
            AtomicBoolean firstChunkArrived, AtomicInteger charsReceived,
            long startMs, int estimatedWaitSecs, int estimatedOutputChars,
            Consumer<Map<String, Object>> onStatus, Consumer<String> onChunk,
            StringBuilder fullText) {
        String text = String.valueOf(partialResponse == null ? "" : partialResponse);
        if (text.isEmpty()) return;
        if (firstChunkArrived.compareAndSet(false, true) && onStatus != null) {
            long ttft = System.currentTimeMillis() - startMs;
            Map<String, Object> st = new HashMap<>();
            st.put("stage", "streaming_started");
            st.put("status", "first_token");
            st.put("message", "Bắt đầu nhận kết quả từ Chuyên Gia");
            st.put("ttftMs", ttft);
            st.put("estimatedTotalChars", estimatedOutputChars);
            st.put("percent", 15);
            onStatus.accept(st);
        }
        fullText.append(text);
        charsReceived.addAndGet(text.length());
        if (onChunk != null) onChunk.accept(text);
    }

    /**
     * Legacy compatibility entrypoint from controller's old prompt-cache flow.
     * Gemini currently uses the same path as normal streamContent.
     */
    public String streamContentWithCache(
            String systemContent,
            String userMessage,
            String modelOverride,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Throwable> onError,
            Consumer<Map<String, Object>> onStatus) {

        String fullPrompt = String.valueOf(systemContent == null ? "" : systemContent)
                + "\n\n## YÊU CẦU\n"
                + String.valueOf(userMessage == null ? "" : userMessage);
        return streamContent(fullPrompt, modelOverride, onChunk, onComplete, onError, onStatus);
    }

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

        // Route Claude models to Anthropic API instead of Gemini
        String rawModel = String.valueOf(modelOverride == null ? "" : modelOverride).trim();
        if (isClaudeModel(rawModel)) {
            return streamContentClaude(rawModel, preparePromptForProvider(prompt), onChunk, onComplete, onError, onStatus);
        }

        String model = normalizeModelToGemini(modelOverride);
        String effectivePrompt = preparePromptForProvider(prompt);
        if (effectivePrompt.isBlank()) {
            IllegalStateException err = new IllegalStateException("Prompt is empty after normalization");
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }
        if (isOverPromptSoftLimit("gemini", model, effectivePrompt, resolveGeminiInputTokenSoftLimit(), onError, onStatus)) {
            return "";
        }
        String cacheKey = buildCacheKey(model, effectivePrompt);

        String cachedResponse = getCachedResponse(cacheKey);
        if (cachedResponse != null) {
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "cached");
                status.put("status", "cached");
                status.put("message", "Da dung ket qua tu bo nho cache");
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
            IllegalStateException err = new IllegalStateException("Gemini dang rate-limit cho cung noi dung; thu lai sau " + cooldownRemainMs + " ms");
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "waiting");
                status.put("status", "rate_limited_cached_cooldown");
                status.put("message", "Yeu cau trung dang bi rate-limit");
                status.put("waitingMs", cooldownRemainMs);
                onStatus.accept(status);
            }
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }

        List<String> keys = resolveGeminiApiKeys();
        if (keys.isEmpty()) {
            IllegalStateException err = new IllegalStateException("Missing Gemini API key. Set GEMINI_PRO_API_KEY, GEMINI_API_KEY, or GOOGLE_AI_GEMINI_API_KEY");
            log.error("GeminiStreamingService: {}", err.getMessage());
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }

        int startIndex = Math.floorMod(String.valueOf(cacheKey).hashCode(), keys.size());
        Throwable lastError = null;
        long minWaitMs = Long.MAX_VALUE;
        int skippedByCooldown = 0;

        for (int i = 0; i < keys.size(); i++) {
            String key = keys.get((startIndex + i) % keys.size());
            long keyCooldown = getRemainingApiKeyCooldownMs(key);
            if (keyCooldown > 0L) {
                skippedByCooldown++;
                minWaitMs = Math.min(minWaitMs, keyCooldown);
                continue;
            }

            AtomicBoolean attemptStreamed = new AtomicBoolean(false);
            Consumer<String> attemptChunk = (chunk) -> {
                String text = String.valueOf(chunk == null ? "" : chunk);
                if (!text.isEmpty()) {
                    attemptStreamed.set(true);
                }
                if (onChunk != null) {
                    onChunk.accept(text);
                }
            };

            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "key_rotation");
                status.put("status", "trying_key");
                status.put("message", "Đang thử kênh xử lý " + (i + 1) + "/" + keys.size());
                status.put("attempt", i + 1);
                status.put("total", keys.size());
                onStatus.accept(status);
            }

            try {
                String text = executeGeminiStreamContent(model, effectivePrompt, key, attemptChunk, onStatus);
                putCachedResponse(cacheKey, text);
                if (onComplete != null) {
                    onComplete.run();
                }
                return text;
            } catch (Throwable ex) {
                lastError = ex;
                if (isRateLimitLikeError(ex)) {
                    markRateLimitCooldown(cacheKey);
                    markApiKeyRateLimitCooldown(key);
                }
                log.warn("GeminiStreamingService: key {} failed: {}", maskApiKey(key), ex.getMessage());

                if (attemptStreamed.get()) {
                    if (onError != null) {
                        onError.accept(ex);
                    }
                    return "";
                }

                if (!shouldTryNextApiKey(ex)) {
                    break;
                }
            }
        }

        if (skippedByCooldown >= keys.size() && minWaitMs != Long.MAX_VALUE) {
            // All Gemini keys on cooldown → try Claude fallback
            log.warn("GeminiStreamingService: All Gemini keys on cooldown, attempting Claude fallback");
            List<String> claudeKeys = resolveClaudeApiKeys();
            if (!claudeKeys.isEmpty()) {
                if (onStatus != null) {
                    Map<String, Object> status = new HashMap<>();
                    status.put("stage", "claude_fallback");
                    status.put("status", "gemini_cooldown_fallback");
                    status.put("message", "Gemini đang bận, chuyển sang Claude...");
                    onStatus.accept(status);
                }
                return streamContentClaude(claudeDefaultModel, prompt, onChunk, onComplete, onError, onStatus);
            }
            IllegalStateException err = new IllegalStateException("Tất cả kênh xử lý đang trong thời gian chờ, thử lại sau " + minWaitMs + " ms");
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "waiting");
                status.put("status", "all_keys_cooldown");
                status.put("message", "Hệ thống đang bận tạm thời, vui lòng thử lại sau");
                status.put("waitingMs", minWaitMs);
                onStatus.accept(status);
            }
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }

        // All Gemini keys failed → try Claude fallback
        List<String> claudeKeys = resolveClaudeApiKeys();
        if (!claudeKeys.isEmpty()) {
            log.warn("GeminiStreamingService: All Gemini keys failed (last error: {}), attempting Claude fallback",
                    lastError != null ? lastError.getMessage() : "unknown");
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "claude_fallback");
                status.put("status", "gemini_failed_fallback");
                status.put("message", "Gemini gặp sự cố, chuyển sang Claude...");
                onStatus.accept(status);
            }
            return streamContentClaude(claudeDefaultModel, prompt, onChunk, onComplete, onError, onStatus);
        }

        if (onError != null) {
            onError.accept(lastError != null ? lastError : new IllegalStateException("Gemini request failed on all keys"));
        }
        return "";
    }

    /**
     * Multimodal streaming: text prompt + list of image parts (base64Data + mimeType).
     * Cache is skipped for multimodal requests (images make cache keys impractical).
     */
    public String streamContentMultimodal(
            String prompt,
            List<Map<String, String>> imageParts,
            String modelOverride,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Throwable> onError,
            Consumer<Map<String, Object>> onStatus) {

        String model = normalizeModelToGemini(modelOverride);
        String effectivePrompt = preparePromptForProvider(prompt);
        if (effectivePrompt.isBlank()) {
            IllegalStateException err = new IllegalStateException("Prompt is empty after normalization");
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }
        if (isOverPromptSoftLimit("gemini", model, effectivePrompt, resolveGeminiInputTokenSoftLimit(), onError, onStatus)) {
            return "";
        }
        List<String> keys = resolveGeminiApiKeys();
        if (keys.isEmpty()) {
            IllegalStateException err = new IllegalStateException("Missing Gemini API key. Set GEMINI_PRO_API_KEY, GEMINI_API_KEY, or GOOGLE_AI_GEMINI_API_KEY");
            log.error("GeminiStreamingService: {}", err.getMessage());
            if (onError != null) onError.accept(err);
            return "";
        }

        int startIndex = Math.floorMod(String.valueOf(effectivePrompt).hashCode(), keys.size());
        Throwable lastError = null;
        long minWaitMs = Long.MAX_VALUE;
        int skippedByCooldown = 0;

        for (int i = 0; i < keys.size(); i++) {
            String key = keys.get((startIndex + i) % keys.size());
            long keyCooldown = getRemainingApiKeyCooldownMs(key);
            if (keyCooldown > 0L) {
                skippedByCooldown++;
                minWaitMs = Math.min(minWaitMs, keyCooldown);
                continue;
            }

            AtomicBoolean attemptStreamed = new AtomicBoolean(false);
            Consumer<String> attemptChunk = (chunk) -> {
                String text = String.valueOf(chunk == null ? "" : chunk);
                if (!text.isEmpty()) {
                    attemptStreamed.set(true);
                }
                if (onChunk != null) {
                    onChunk.accept(text);
                }
            };

            try {
                String text = executeGeminiStreamContent(model, effectivePrompt, imageParts, key, attemptChunk, onStatus);
                if (onComplete != null) onComplete.run();
                return text;
            } catch (Throwable ex) {
                lastError = ex;
                if (isRateLimitLikeError(ex)) {
                    markApiKeyRateLimitCooldown(key);
                }
                log.warn("GeminiStreamingService multimodal: key {} failed: {}", maskApiKey(key), ex.getMessage());

                if (attemptStreamed.get()) {
                    if (onError != null) onError.accept(ex);
                    return "";
                }

                if (!shouldTryNextApiKey(ex)) {
                    break;
                }
            }
        }

        if (skippedByCooldown >= keys.size() && minWaitMs != Long.MAX_VALUE) {
            // OpenDevin tenacity pattern: exponential backoff before giving up
            long backoffMs = Math.min(geminiRateLimitBackoffMaxMs,
                geminiRateLimitBackoffBaseMs * (long) Math.pow(2, Math.min(skippedByCooldown - 1, 5)));
            log.warn("GeminiStreamingService[multimodal]: all {} keys in cooldown, exponential backoff {}ms", keys.size(), backoffMs);
            try { Thread.sleep(Math.min(backoffMs, minWaitMs)); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            IllegalStateException err = new IllegalStateException("Tất cả kênh xử lý đang trong thời gian chờ, thử lại sau " + minWaitMs + " ms");
            if (onError != null) onError.accept(err);
            return "";
        }

        if (onError != null) onError.accept(lastError != null ? lastError : new IllegalStateException("Gemini multimodal request failed on all keys"));
        return "";
    }

    // Keep for compatibility with callers/extensions that still use single-key resolution.
    @SuppressWarnings("unused")
    private String resolveSingleGeminiApiKeyDeprecated() {
        String key = resolveGeminiApiKey();
        return key == null ? "" : key;
    }

    // ─── Claude helpers ───────────────────────────────────────────────────────

    private boolean isClaudeModel(String model) {
        String lower = String.valueOf(model == null ? "" : model).trim().toLowerCase();
        return lower.startsWith("claude-") || lower.contains("claude");
    }

    private List<String> resolveClaudeApiKeys() {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        addParsedApiKeys(keys, claudeApiKeys);
        addParsedApiKeys(keys, claudeApiKey);
        return new ArrayList<>(keys);
    }

    private String normalizeClaudeModel(String model) {
        String raw = String.valueOf(model == null ? "" : model).trim();
        if (raw.isBlank() || !isClaudeModel(raw)) {
            return claudeDefaultModel != null && !claudeDefaultModel.isBlank()
                    ? claudeDefaultModel.trim() : "claude-opus-4-5";
        }
        return raw;
    }

    private long getRemainingClaudeApiKeyCooldownMs(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) return 0L;
        Long untilMs = claudeRateLimitedUntilByApiKey.get(apiKey);
        if (untilMs == null) return 0L;
        long remain = untilMs - System.currentTimeMillis();
        if (remain <= 0L) { claudeRateLimitedUntilByApiKey.remove(apiKey); return 0L; }
        return remain;
    }

    private void markClaudeApiKeyRateLimitCooldown(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) return;
        long cooldown = Math.max(3000L, claudeRateLimitKeyCooldownMs);
        claudeRateLimitedUntilByApiKey.put(apiKey, System.currentTimeMillis() + cooldown);
    }

    /**
     * Calls Anthropic /v1/messages with stream=true, parses SSE text_delta events.
     */
    private String executeClaudeStreamContent(String model, String prompt, String apiKey,
            Consumer<String> onChunk, Consumer<Map<String, Object>> onStatus) throws Exception {

        int promptChars = prompt == null ? 0 : prompt.length();
        int outTokens = Math.max(256, claudeMaxTokens);
        // Claude TTFT ~2s + 1s per 4000 chars; generation ~300 chars/s
        int estimatedWaitSecs = 3 + promptChars / 5000 + (outTokens * 4) / 300;
        int estimatedOutputChars = outTokens * 4;
        long startMs = System.currentTimeMillis();

        if (onStatus != null) {
            Map<String, Object> init = new HashMap<>();
            init.put("stage", "waiting_claude");
            init.put("status", "connecting");
            init.put("message", "Đang gửi yêu cầu đến Claude...");
            init.put("estimatedWaitSecs", estimatedWaitSecs);
            init.put("promptChars", promptChars);
            init.put("model", model);
            init.put("percent", 2);
            onStatus.accept(init);
        }

        // Build JSON request body using Jackson
        ObjectNode body = jsonMapper.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", outTokens);
        body.put("stream", true);
        ArrayNode messages = body.putArray("messages");
        ObjectNode userMsg = messages.addObject();
        userMsg.put("role", "user");
        userMsg.put("content", String.valueOf(prompt == null ? "" : prompt));

        // Add system prompt temperature via top_level (Anthropic doesn't use temperature in body for claude-3.5+, but still supported)
        body.put("temperature", Math.min(1.0, Math.max(0.0, claudeTemperature)));

        String requestJson = jsonMapper.writeValueAsString(body);

        Request request = new Request.Builder()
                .url(CLAUDE_API_URL)
                .post(RequestBody.create(requestJson, JSON_MEDIA_TYPE))
                .addHeader("x-api-key", apiKey)
                .addHeader("anthropic-version", CLAUDE_API_VERSION)
                .addHeader("content-type", "application/json")
                .addHeader("accept", "text/event-stream")
                .build();

        AtomicBoolean firstChunkArrived = new AtomicBoolean(false);
        AtomicInteger charsReceived = new AtomicInteger(0);

        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "claude-heartbeat");
            t.setDaemon(true);
            return t;
        });
        ScheduledFuture<?> heartbeatTask = null;
        if (onStatus != null) {
            heartbeatTask = heartbeat.scheduleAtFixedRate(() -> {
                long elapsed = System.currentTimeMillis() - startMs;
                int received = charsReceived.get();
                Map<String, Object> st = new HashMap<>();
                if (!firstChunkArrived.get()) {
                    int elapsedSecs = Math.max(1, (int) Math.ceil(elapsed / 1000.0));
                    int remainSecs = Math.max(0, estimatedWaitSecs - (int) (elapsed / 1000));
                    boolean overdue = remainSecs <= 0;
                    st.put("stage", "waiting_claude");
                    st.put("status", "waiting");
                    st.put("message", overdue
                            ? "Claude đang suy nghĩ... (đã chờ " + elapsedSecs + "s)"
                            : "Claude đang suy nghĩ... (~" + remainSecs + "s còn lại)");
                    st.put("elapsedMs", elapsed);
                    st.put("estimatedWaitSecs", estimatedWaitSecs);
                    st.put("percent", Math.min(15, 2 + (int) (elapsed / 1000)));
                } else {
                    int pct = estimatedOutputChars > 0
                            ? Math.min(95, 15 + (received * 80 / estimatedOutputChars)) : 50;
                    int remainOutputChars = Math.max(0, estimatedOutputChars - received);
                    int remainSecs = remainOutputChars > 0 && elapsed > 0
                            ? (int) (remainOutputChars / Math.max(1.0, (double) received / (elapsed / 1000.0))) : 0;
                    st.put("stage", "streaming_progress");
                    st.put("status", "streaming");
                    st.put("message", "Claude đang trả lời... (" + received + " ký tự)");
                    st.put("charsReceived", received);
                    st.put("estimatedTotalChars", estimatedOutputChars);
                    st.put("elapsedMs", elapsed);
                    st.put("remainingEstimateSecs", remainSecs);
                    st.put("percent", pct);
                }
                onStatus.accept(st);
            }, 3, 3, TimeUnit.SECONDS);
        }

        StringBuilder fullText = new StringBuilder();
        try (Response response = getClaudeHttpClient().newCall(request).execute()) {
            if (!response.isSuccessful()) {
                String errBody = response.body() != null ? response.body().string() : "(no body)";
                throw new IllegalStateException("Claude API error " + response.code() + ": " + errBody);
            }
            if (response.body() == null) {
                throw new IllegalStateException("Claude API returned empty response body");
            }

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(response.body().byteStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("data: ")) {
                        String dataStr = line.substring(6).trim();
                        if (dataStr.equals("[DONE]")) break;
                        try {
                            JsonNode node = jsonMapper.readTree(dataStr);
                            String type = node.path("type").asText("");
                            if ("content_block_delta".equals(type)) {
                                JsonNode delta = node.path("delta");
                                if ("text_delta".equals(delta.path("type").asText(""))) {
                                    String text = delta.path("text").asText("");
                                    if (!text.isEmpty()) {
                                        if (firstChunkArrived.compareAndSet(false, true) && onStatus != null) {
                                            long ttft = System.currentTimeMillis() - startMs;
                                            Map<String, Object> st = new HashMap<>();
                                            st.put("stage", "streaming_started");
                                            st.put("status", "first_token");
                                            st.put("message", "Bắt đầu nhận kết quả từ Claude");
                                            st.put("ttftMs", ttft);
                                            st.put("estimatedTotalChars", estimatedOutputChars);
                                            st.put("percent", 15);
                                            onStatus.accept(st);
                                        }
                                        fullText.append(text);
                                        charsReceived.addAndGet(text.length());
                                        if (onChunk != null) onChunk.accept(text);
                                    }
                                }
                            } else if ("message_stop".equals(type)) {
                                break;
                            } else if ("error".equals(type)) {
                                String errMsg = node.path("error").path("message").asText("Unknown Claude error");
                                throw new IllegalStateException("Claude stream error: " + errMsg);
                            }
                        } catch (IllegalStateException ex) {
                            throw ex;
                        } catch (Exception ignored) {
                            // Skip malformed SSE lines
                        }
                    }
                }
            }
        } finally {
            if (heartbeatTask != null) heartbeatTask.cancel(false);
            heartbeat.shutdownNow();
        }

        return fullText.toString();
    }

    /**
     * Multi-key retry Claude streaming — same rotation logic as Gemini.
     */
    public String streamContentClaude(
            String modelOverride,
            String prompt,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Throwable> onError,
            Consumer<Map<String, Object>> onStatus) {

        String model = normalizeClaudeModel(modelOverride);
        String effectivePrompt = preparePromptForProvider(prompt);
        if (effectivePrompt.isBlank()) {
            IllegalStateException err = new IllegalStateException("Prompt is empty after normalization");
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }
        if (isOverPromptSoftLimit("claude", model, effectivePrompt, resolveClaudeInputTokenSoftLimit(), onError, onStatus)) {
            return "";
        }

        List<String> keys = resolveClaudeApiKeys();
        if (keys.isEmpty()) {
            IllegalStateException err = new IllegalStateException(
                    "Missing Claude API key. Set CLAUDE_API_KEY or CLAUDE_API_KEYS in config.env");
            log.error("GeminiStreamingService[Claude]: {}", err.getMessage());
            if (onError != null) onError.accept(err);
            return "";
        }

        int startIndex = Math.floorMod(String.valueOf(effectivePrompt).hashCode(), keys.size());
        Throwable lastError = null;
        long minWaitMs = Long.MAX_VALUE;
        int skippedByCooldown = 0;

        for (int i = 0; i < keys.size(); i++) {
            String key = keys.get((startIndex + i) % keys.size());
            long keyCooldown = getRemainingClaudeApiKeyCooldownMs(key);
            if (keyCooldown > 0L) {
                skippedByCooldown++;
                minWaitMs = Math.min(minWaitMs, keyCooldown);
                continue;
            }

            if (onStatus != null && keys.size() > 1) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "key_rotation");
                status.put("status", "trying_key");
                status.put("message", "Đang thử kênh Claude " + (i + 1) + "/" + keys.size());
                status.put("attempt", i + 1);
                status.put("total", keys.size());
                onStatus.accept(status);
            }

            AtomicBoolean attemptStreamed = new AtomicBoolean(false);
            Consumer<String> attemptChunk = chunk -> {
                String text = String.valueOf(chunk == null ? "" : chunk);
                if (!text.isEmpty()) attemptStreamed.set(true);
                if (onChunk != null) onChunk.accept(text);
            };

            try {
                String text = executeClaudeStreamContent(model, effectivePrompt, key, attemptChunk, onStatus);
                if (onComplete != null) onComplete.run();
                return text;
            } catch (Throwable ex) {
                lastError = ex;
                String msg = String.valueOf(ex.getMessage()).toLowerCase();
                boolean isRateLimit = msg.contains("429") || msg.contains("rate_limit") || msg.contains("overloaded");
                if (isRateLimit) {
                    markClaudeApiKeyRateLimitCooldown(key);
                }
                log.warn("GeminiStreamingService[Claude]: key {} failed: {}", maskApiKey(key), ex.getMessage());

                if (attemptStreamed.get()) {
                    if (onError != null) onError.accept(ex);
                    return "";
                }
                boolean tryNext = isRateLimit
                        || msg.contains("401") || msg.contains("403")
                        || msg.contains("timeout") || msg.contains("503") || msg.contains("500");
                if (!tryNext) break;
            }
        }

        if (skippedByCooldown >= keys.size() && minWaitMs != Long.MAX_VALUE) {
            // OpenDevin tenacity / Devin retry_task pattern: exponential backoff when all
            // Claude keys are simultaneously rate-limited. Attempt a single wait-and-retry
            // with bounded delay before giving up, rather than failing immediately.
            long backoffMs = Math.min(claudeRateLimitBackoffMaxMs,
                claudeRateLimitBackoffBaseMs * (long) Math.pow(2, Math.min(skippedByCooldown - 1, 5)));
            log.warn("GeminiStreamingService[Claude]: all {} keys in cooldown, exponential backoff {}ms (attempt={}, minWait={}ms)",
                keys.size(), backoffMs, skippedByCooldown, minWaitMs);
            if (onStatus != null) {
                Map<String, Object> status = new HashMap<>();
                status.put("stage", "rate_limit_backoff");
                status.put("status", "all_keys_cooldown");
                status.put("message", "Claude đang bận, đợi " + backoffMs + "ms rồi thử lại");
                status.put("waitingMs", backoffMs);
                status.put("minCooldownMs", minWaitMs);
                onStatus.accept(status);
            }
            try {
                Thread.sleep(Math.min(backoffMs, minWaitMs));
                // Single retry pass after backoff
                for (int i = 0; i < keys.size(); i++) {
                    String key = keys.get((startIndex + i) % keys.size());
                    if (getRemainingClaudeApiKeyCooldownMs(key) > 0L) continue;
                    try {
                        AtomicBoolean retryStreamed = new AtomicBoolean(false);
                        Consumer<String> retryChunk = chunk -> {
                            String text = String.valueOf(chunk == null ? "" : chunk);
                            if (!text.isEmpty()) retryStreamed.set(true);
                            if (onChunk != null) onChunk.accept(text);
                        };
                        String text = executeClaudeStreamContent(model, effectivePrompt, key, retryChunk, onStatus);
                        if (onComplete != null) onComplete.run();
                        return text;
                    } catch (Throwable retryEx) {
                        String rmsg = String.valueOf(retryEx.getMessage()).toLowerCase();
                        if (rmsg.contains("429") || rmsg.contains("rate_limit") || rmsg.contains("overloaded")) {
                            markClaudeApiKeyRateLimitCooldown(key);
                        }
                    }
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
            IllegalStateException err = new IllegalStateException(
                    "Tất cả kênh Claude đang trong thời gian chờ, thử lại sau " + minWaitMs + " ms");
            if (onError != null) onError.accept(err);
            return "";
        }

        if (onError != null) {
            onError.accept(lastError != null ? lastError : new IllegalStateException("Claude request failed on all keys"));
        }
        return "";
    }

}
