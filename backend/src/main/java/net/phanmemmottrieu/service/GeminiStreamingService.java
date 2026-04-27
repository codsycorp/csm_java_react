package net.phanmemmottrieu.service;

import dev.langchain4j.data.message.Content;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.googleai.GoogleAiGeminiStreamingChatModel;
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
import java.util.List;
import java.util.Map;
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

    @Value("${gemini.model:gemini-2.5-pro}")
    private String geminiDefaultModel;

    @Value("${gemini.streaming.max-tokens:8192}")
    private int maxTokens;

    @Value("${gemini.streaming.temperature:0.7}")
    private double temperature;

    @Value("${gemini.streaming.request-timeout-ms:300000}")
    private long requestTimeoutMs;

    @Value("${gemini.streaming.response-cache.enabled:true}")
    private boolean responseCacheEnabled;

    @Value("${gemini.streaming.response-cache.ttl-ms:600000}")
    private long responseCacheTtlMs;

    @Value("${gemini.streaming.response-cache.max-entries:128}")
    private int responseCacheMaxEntries;

    @Value("${gemini.streaming.rate-limit-key-cooldown-ms:90000}")
    private long rateLimitKeyCooldownMs;

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

    private boolean isRateLimitLikeError(Throwable ex) {
        if (ex == null) {
            return false;
        }
        String msg = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase();
        return msg.contains("429") || msg.contains("rate limit") || msg.contains("quota") || msg.contains("too many requests");
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

    private String resolveGeminiApiKey() {
        if (geminiProApiKey != null && !geminiProApiKey.isBlank()) {
            return geminiProApiKey.trim();
        }
        if (geminiApiKey != null && !geminiApiKey.isBlank()) {
            return geminiApiKey.trim();
        }
        if (googleAiGeminiApiKey != null && !googleAiGeminiApiKey.isBlank()) {
            return googleAiGeminiApiKey.trim();
        }
        return "";
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
        int estimatedOutputTokens = Math.max(256, maxTokens);
        int estimatedWaitSecs = estimateWaitSeconds(promptChars, estimatedOutputTokens);
        int estimatedOutputChars = estimatedOutputTokens * 4;
        long startMs = System.currentTimeMillis();

        if (onStatus != null) {
            Map<String, Object> initStatus = new HashMap<>();
            initStatus.put("stage", "waiting_gemini");
            initStatus.put("status", "connecting");
            initStatus.put("message", "Đang gửi request đến Gemini...");
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
                    int remainSecs = Math.max(1, estimatedWaitSecs - (int)(elapsed / 1000));
                    st.put("stage", "waiting_gemini");
                    st.put("status", "waiting");
                    st.put("message", "Gemini đang suy nghĩ... (~" + remainSecs + "s còn lại)");
                    st.put("elapsedMs", elapsed);
                    st.put("estimatedWaitSecs", estimatedWaitSecs);
                    st.put("remainingEstimateSecs", remainSecs);
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
                .maxOutputTokens(estimatedOutputTokens)
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
            st.put("message", "Bắt đầu nhận kết quả từ Gemini");
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

        String model = normalizeModelToGemini(modelOverride);
        String cacheKey = buildCacheKey(model, prompt);

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

        String key = resolveGeminiApiKey();
        if (key.isBlank()) {
            IllegalStateException err = new IllegalStateException("Missing Gemini API key. Set GEMINI_PRO_API_KEY, GEMINI_API_KEY, or GOOGLE_AI_GEMINI_API_KEY");
            log.error("GeminiStreamingService: {}", err.getMessage());
            if (onError != null) {
                onError.accept(err);
            }
            return "";
        }

        try {
            String text = executeGeminiStreamContent(model, prompt, key, onChunk, onStatus);
            putCachedResponse(cacheKey, text);

            if (onComplete != null) {
                onComplete.run();
            }
            return text;
        } catch (Throwable ex) {
            if (isRateLimitLikeError(ex)) {
                markRateLimitCooldown(cacheKey);
            }
            if (onError != null) {
                onError.accept(ex);
            }
            return "";
        }
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
        String key = resolveGeminiApiKey();
        if (key.isBlank()) {
            IllegalStateException err = new IllegalStateException("Missing Gemini API key. Set GEMINI_PRO_API_KEY, GEMINI_API_KEY, or GOOGLE_AI_GEMINI_API_KEY");
            log.error("GeminiStreamingService: {}", err.getMessage());
            if (onError != null) onError.accept(err);
            return "";
        }

        try {
            String text = executeGeminiStreamContent(model, prompt, imageParts, key, onChunk, onStatus);
            if (onComplete != null) onComplete.run();
            return text;
        } catch (Throwable ex) {
            if (onError != null) onError.accept(ex);
            return "";
        }
    }
}
