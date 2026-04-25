package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Streams responses from Gemini's streamGenerateContent API using WebClient (SSE).
 * Used by AiCodingController (HTTP SSE endpoint) and AiAssistantGatewayService (Socket.IO chunks).
 */
@Service
public class GeminiStreamingService {

    private static final Logger log = LoggerFactory.getLogger(GeminiStreamingService.class);

    private final ApiKeyService apiKeyService;
    private final String apiUrlPattern;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${gemini.streaming.model:gemini-2.5-pro}")
    private String defaultStreamingModel;

    @Value("${gemini.streaming.pro-fallback-model:gemini-2.5-flash}")
    private String proFallbackModel;

    @Value("${gemini.streaming.pro-cooldown-ms:180000}")
    private long proCooldownMs;

    @Value("${gemini.streaming.pro-first-attempt-enabled:true}")
    private boolean proFirstAttemptEnabled;

    @Value("${gemini.streaming.request-timeout-ms:25000}")
    private long requestTimeoutMs;

    @Value("${gemini.streaming.fallback-max-attempts:3}")
    private int fallbackMaxAttempts;

    @Value("${gemini.streaming.fallback-attempt-timeout-ms:6000}")
    private long fallbackAttemptTimeoutMs;

    @Value("${gemini.streaming.fallback-models:gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash-001,gemma-3-27b-it}")
    private String fallbackModelsConfig;

    /** Dedicated API key for Pro models. If blank, falls back to the shared pool. */
    @Value("${gemini.pro.api-key:}")
    private String proApiKey;

    private volatile long pro429CooldownUntilEpochMs = 0L;

    private volatile WebClient webClient;

    public GeminiStreamingService(
            ApiKeyService apiKeyService,
            @Value("${gemini.api.url}") String apiUrl) {
        this.apiKeyService = apiKeyService;
        // apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key="
        this.apiUrlPattern = apiUrl;
    }

    private WebClient getWebClient() {
        if (webClient == null) {
            synchronized (this) {
                if (webClient == null) {
                    webClient = WebClient.builder()
                            .codecs(c -> c.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                            .build();
                }
            }
        }
        return webClient;
    }

    /**
     * Build Gemini streamGenerateContent URL by replacing the generateContent path.
     * apiUrlPattern = "https://.../%s:generateContent?key="
     * streaming URL = "https://.../%s:streamGenerateContent?alt=sse&key="
     */
    private String buildStreamUrl(String model, String apiKey) {
        String base = apiUrlPattern.replace(":generateContent?", ":streamGenerateContent?alt=sse&");
        return String.format(base, model) + apiKey;
    }

    private boolean isTooManyRequests(Throwable ex) {
        if (ex == null) {
            return false;
        }
        if (ex instanceof WebClientResponseException.TooManyRequests) {
            return true;
        }
        Throwable cause = ex.getCause();
        while (cause != null) {
            if (cause instanceof WebClientResponseException.TooManyRequests) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private boolean shouldBypassProForCooldown() {
        return System.currentTimeMillis() < pro429CooldownUntilEpochMs;
    }

    private void enterProCooldown() {
        long cooldown = Math.max(1000L, proCooldownMs);
        pro429CooldownUntilEpochMs = System.currentTimeMillis() + cooldown;
    }

    private String resolveFallbackModel() {
        return (proFallbackModel == null || proFallbackModel.isBlank())
                ? "gemini-2.5-flash"
                : proFallbackModel;
    }

    private List<String> resolveFallbackModels() {
        List<String> models = new ArrayList<>();

        String primary = resolveFallbackModel();
        if (!primary.isBlank()) {
            models.add(primary);
        }

        if (fallbackModelsConfig != null && !fallbackModelsConfig.isBlank()) {
            String[] parts = fallbackModelsConfig.split(",");
            for (String part : parts) {
                String model = part == null ? "" : part.trim();
                if (!model.isEmpty() && !models.contains(model)) {
                    models.add(model);
                }
            }
        }

        return models;
    }

    private Throwable executeFallbackFromSharedPool(
            String promptModel,
            Map<String, Object> requestBody,
            StringBuilder fullResponse,
            Consumer<String> onChunk,
            Runnable onComplete,
            Consumer<Map<String, Object>> onStatus) {
        List<String> fallbackModels = resolveFallbackModels();
        int maxAttempts = Math.max(1, fallbackMaxAttempts);

        if (fallbackModels.isEmpty()) {
            return new IllegalStateException("No fallback Gemini models configured");
        }

        Throwable lastError = null;
        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            ApiKeyService.ApiKey fallbackKey = apiKeyService.getAvailableApiKey();
            if (fallbackKey == null) {
                if (lastError != null) {
                    return lastError;
                }
                log.warn("GeminiStreamingService: Pro request cannot fallback because no shared key is available.");
                return new IllegalStateException("No shared Gemini API key available for Pro fallback");
            }

            String fallbackModel = fallbackModels.get(attempt % fallbackModels.size());
            String fallbackUrl = buildStreamUrl(fallbackModel, fallbackKey.getKeyString());
            log.warn(
                    "GeminiStreamingService: fallback attempt {}/{} from {} -> model {} (shared key pool).",
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
                    fallbackUrl,
                    fallbackModel,
                    requestBody,
                    fullResponse,
                    onChunk,
                    onComplete,
                    true,
                    fallbackAttemptTimeoutMs);

            if (fallbackError == null) {
                return null;
            }

            lastError = fallbackError;
            if (isTooManyRequests(fallbackError)) {
                apiKeyService.disableApiKeyUntilNextDay(fallbackKey.getKeyString());
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
            String url,
            String model,
            Map<String, Object> requestBody,
            StringBuilder fullResponse,
            Consumer<String> onChunk,
            Runnable onComplete,
            boolean suppressErrorLog,
            long timeoutMs) {

        Throwable[] errorHolder = {null};

        try {
            getWebClient()
                    .post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToFlux(String.class)
                    .timeout(Duration.ofMillis(Math.max(1000L, timeoutMs)))
                    .doOnNext(line -> {
                        String trimmed = line.trim();
                        if (trimmed.startsWith("data: ")) {
                            String json = trimmed.substring(6).trim();
                            if (json.isEmpty() || "[DONE]".equals(json)) return;
                            try {
                                JsonNode node = objectMapper.readTree(json);
                                JsonNode candidates = node.path("candidates");
                                if (candidates.isArray() && candidates.size() > 0) {
                                    JsonNode parts = candidates.get(0).path("content").path("parts");
                                    if (parts.isArray()) {
                                        for (JsonNode part : parts) {
                                            String text = part.path("text").asText("");
                                            if (!text.isEmpty()) {
                                                fullResponse.append(text);
                                                if (onChunk != null) {
                                                    try {
                                                        onChunk.accept(text);
                                                    } catch (Exception ignored) {
                                                        // Client may have disconnected; keep streaming
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (Exception ex) {
                                log.debug("GeminiStreamingService: failed to parse SSE line: {}", json);
                            }
                        }
                    })
                    .doOnError(ex -> {
                        if (suppressErrorLog && isTooManyRequests(ex)) {
                            log.warn("GeminiStreamingService: model {} returned 429; will use fallback flow.", model);
                        } else {
                            log.error("GeminiStreamingService: streaming error for model {}: {}", model, ex.getMessage());
                        }
                        errorHolder[0] = ex;
                    })
                    .blockLast();
        } catch (Exception ex) {
            if (suppressErrorLog && isTooManyRequests(ex)) {
                log.warn("GeminiStreamingService: blockLast got 429 for model {}; switching to fallback.", model);
            } else {
                log.error("GeminiStreamingService: blockLast failed for model {}: {}", model, ex.getMessage(), ex);
            }
            if (errorHolder[0] == null) {
                errorHolder[0] = ex;
            }
        }

        if (errorHolder[0] == null && onComplete != null) {
            onComplete.run();
        }

        return errorHolder[0];
    }

    /**
     * Stream Gemini response token-by-token.
     *
     * @param prompt        The prompt to send to Gemini
     * @param modelOverride Optional model override; uses ${gemini.streaming.model} if null/blank
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

        String model = (modelOverride != null && !modelOverride.isBlank()) ? modelOverride : defaultStreamingModel;

        // Use dedicated Pro key when model is a Pro variant; fall back to shared pool otherwise.
        boolean isProModel = model.contains("-pro");
        String resolvedKey;
        if (isProModel && proApiKey != null && !proApiKey.isBlank()) {
            resolvedKey = proApiKey;
            log.debug("GeminiStreamingService: using dedicated Pro key for model {}", model);
        } else {
            ApiKeyService.ApiKey apiKey = apiKeyService.getAvailableApiKey();
            if (apiKey == null) {
                RuntimeException err = new IllegalStateException("No available Gemini API key");
                log.error("GeminiStreamingService: {}", err.getMessage());
                if (onError != null) onError.accept(err);
                return "";
            }
            resolvedKey = apiKey.getKeyString();
        }

        String url = buildStreamUrl(model, resolvedKey);

        Map<String, Object> userPart = Map.of("text", prompt);
        Map<String, Object> userContent = Map.of("role", "user", "parts", List.of(userPart));

        Map<String, Object> generationConfig = new HashMap<>();
        generationConfig.put("maxOutputTokens", 65536);
        generationConfig.put("temperature", 0.7);
        generationConfig.put("topP", 0.95);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("contents", List.of(userContent));
        requestBody.put("generationConfig", generationConfig);

        StringBuilder fullResponse = new StringBuilder();

        if (isProModel && !proFirstAttemptEnabled && fullResponse.isEmpty()) {
            log.warn("GeminiStreamingService: Pro first attempt disabled by config; using fallback immediately.");
            Throwable directFallbackError = executeFallbackFromSharedPool(
                    model,
                    requestBody,
                    fullResponse,
                    onChunk,
                    onComplete,
                    onStatus);
            if (directFallbackError == null) {
                return fullResponse.toString();
            }
            if (onError != null) {
                onError.accept(directFallbackError);
            }
            return fullResponse.toString();
        }

        if (isProModel && shouldBypassProForCooldown() && fullResponse.isEmpty()) {
            log.warn("GeminiStreamingService: Pro cooldown active; using fallback immediately.");
            Throwable cooldownFallbackError = executeFallbackFromSharedPool(
                    model,
                    requestBody,
                    fullResponse,
                    onChunk,
                    onComplete,
                    onStatus);
            if (cooldownFallbackError == null) {
                return fullResponse.toString();
            }
            if (onError != null) {
                onError.accept(cooldownFallbackError);
            }
            return fullResponse.toString();
        }

        Throwable primaryError = executeStreamingRequest(
                url,
                model,
                requestBody,
                fullResponse,
                onChunk,
                onComplete,
                isProModel,
                requestTimeoutMs);
        if (primaryError == null) {
            return fullResponse.toString();
        }

        boolean isTooManyRequests = isTooManyRequests(primaryError);

        if (isProModel && isTooManyRequests && fullResponse.isEmpty()) {
            enterProCooldown();
            Throwable fallbackError = executeFallbackFromSharedPool(
                    model,
                    requestBody,
                    fullResponse,
                    onChunk,
                    onComplete,
                    onStatus);
            if (fallbackError == null) {
                return fullResponse.toString();
            }
            if (onError != null) {
                onError.accept(fallbackError);
            }
            return fullResponse.toString();
        }

        if (onError != null) {
            onError.accept(primaryError);
        }

        return fullResponse.toString();
    }
}
