package net.phanmemmottrieu.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.phanmemmottrieu.service.GeminiStreamingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * SSE endpoint for the AI coding assistant (Gemini streaming adapter).
 * Replaces the legacy Socket.IO stream route with a clean HTTP SSE stream.
 *
 * POST /api/ai-code-stream
 * Produces: text/event-stream
 * Events:
 *   data: {"stage":"streaming","chunk":"..."}
 *   data: {"stage":"complete","fullResponse":"...","responseMode":"..."}
 *   data: {"stage":"error","message":"..."}
 */
@RestController
public class AiCodingController {

    private static final Logger log = LoggerFactory.getLogger(AiCodingController.class);

    private static final int MAX_CODE_CHARS    = 500_000;
    private static final int MAX_MESSAGE_CHARS =  20_000;

    @Value("${ai.code-stream.max-prompt-chars:140000}")
    private int maxPromptChars;

    @Value("${ai.code-stream.max-current-code-chars:80000}")
    private int maxCurrentCodeChars;

    @Value("${ai.code-stream.max-attachment-chars-per-file:20000}")
    private int maxAttachmentCharsPerFile;

    @Value("${ai.code-stream.max-attachments-total-chars:60000}")
    private int maxAttachmentsTotalChars;

    @Value("${ai.code-stream.base-cache.enabled:true}")
    private boolean baseCacheEnabled;

    @Value("${ai.code-stream.base-cache.max-content-chars:2200000}")
    private int maxBaseContentChars;

    @Value("${ai.code-stream.base-cache.max-entries:24}")
    private int maxBaseCacheEntries;

    @Value("${ai.code-stream.base-cache.ttl-minutes:90}")
    private int baseCacheTtlMinutes;

    @Value("${ai.code-stream.base-cache.auto-promote-chars:120000}")
    private int baseCacheAutoPromoteChars;

    @Value("${ai.code-stream.auto-continue.enabled:true}")
    private boolean autoContinueEnabled;

    @Value("${ai.code-stream.auto-continue.max-attempts:3}")
    private int autoContinueMaxAttempts;

    @Value("${ai.code-stream.auto-continue.max-previous-response-chars:120000}")
    private int autoContinueMaxPreviousResponseChars;

    // ── Model Routing ─────────────────────────────────────────────────────────
    @Value("${ai.code-stream.routing.enabled:true}")
    private boolean routingEnabled;

    /** Model to use for simple analyze requests (e.g. gemini-2.5-flash). Empty = disable routing. */
    @Value("${ai.code-stream.routing.simple-model:}")
    private String routingSimpleModel;

    /** Total chars (message + code) below which we route to simple model for analyze mode */
    @Value("${ai.code-stream.routing.complex-threshold-chars:20000}")
    private int routingComplexThresholdChars;

    // ── Prompt Chunking Gate (legacy switch) ─────────────────────────────────
    /** Minimum base content chars before splitting prompt into system/user parts */
    @Value("${ai.code-stream.prompt-cache.min-chars:8000}")
    private int promptCacheMinChars;

    private final GeminiStreamingService geminiStreamingService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, BaseContentEntry> baseContentCache = new ConcurrentHashMap<>();

    @Value("${gemini.model:}")
    private String defaultStreamingModel;

    // Legacy compatibility key (deprecated): gemini.streaming.model
    @Value("${gemini.streaming.model:}")
    private String legacyStreamingModel;

    public AiCodingController(GeminiStreamingService geminiStreamingService) {
        this.geminiStreamingService = geminiStreamingService;
    }

    @PostMapping(value = "/api/ai-code-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamCodeAssistant(@RequestBody Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(900_000L); // 15-minute timeout

        emitter.onTimeout(() -> {
            log.warn("AiCodingController: SSE timeout");
            emitter.complete();
        });
        emitter.onError(ex -> log.debug("AiCodingController: SSE error: {}", ex.getMessage()));

        executor.execute(() -> {
            try {
                String appId        = str(body.get("appId"), "");
                String message      = truncate(str(body.get("message"), ""), MAX_MESSAGE_CHARS);
                String currentCodeRaw = truncate(strKeep(body.get("currentCode"), ""), Math.max(MAX_CODE_CHARS, maxBaseContentChars));
                String language     = str(body.get("language"), "javascript");
                String contextType  = str(body.get("contextType"), "code");
                String responseMode = str(body.get("responseMode"), "analyze");
                String modelOverride = str(body.get("model"), "");
                String baseContentRef = str(body.get("baseContentRef"), "");
                String baseContent = truncate(strKeep(body.get("baseContent"), ""), Math.max(100000, maxBaseContentChars));
                boolean preserveBaseContent = bool(body.get("preserveBaseContent"), false);
                Object attachmentsRaw = body.get("attachments");

                if (message.isBlank()) {
                    sendErrorEvent(emitter, "Message không được để trống");
                    return;
                }

                pruneBaseContentCache();
                BaseContentResolution base = resolveBaseContent(appId, baseContentRef, baseContent, currentCodeRaw);
                String effectiveCodeContext = currentCodeRaw;
                if (preserveBaseContent && !base.baseContent().isBlank()) {
                    effectiveCodeContext = base.baseContent();
                } else if (effectiveCodeContext.isBlank() && !base.baseContent().isBlank()) {
                    effectiveCodeContext = base.baseContent();
                }
                effectiveCodeContext = truncate(effectiveCodeContext, Math.max(MAX_CODE_CHARS, maxBaseContentChars));

                String prompt = buildCodingPrompt(message, effectiveCodeContext, language, contextType, responseMode, attachmentsRaw);
                boolean largeStructuredEditMode = preserveBaseContent
                    && "edit".equalsIgnoreCase(responseMode)
                    && !base.baseContent().isBlank()
                    && base.baseContentChars() > Math.max(100000, maxCurrentCodeChars);
                if (largeStructuredEditMode) {
                    prompt = buildCodingPrompt(message, effectiveCodeContext, language, contextType, responseMode, attachmentsRaw, true, base.baseRef(), base.baseContentChars());
                }
                if (prompt.length() > maxPromptChars) {
                    prompt = truncateMiddle(prompt, Math.max(20000, maxPromptChars));
                }

                // Decide whether to split prompt parts for compatibility path.
                // Use prompt.length() (not just effectiveCodeContext) so attachments also qualify.
                // Subtract message length as a rough estimate of system-only content.
                int systemContentEstimate = prompt.length() - message.length();
                boolean usePromptCache = systemContentEstimate >= Math.max(1000, promptCacheMinChars);
                String[] promptParts = usePromptCache
                        ? buildCodingPromptParts(message, effectiveCodeContext, language, contextType, responseMode,
                                attachmentsRaw, largeStructuredEditMode, base.baseRef(), base.baseContentChars())
                        : new String[]{prompt, ""};
                // Enforce prompt budget on system part if too large
                if (promptParts[0].length() > maxPromptChars) {
                    promptParts[0] = truncateMiddle(promptParts[0], Math.max(20000, maxPromptChars));
                    usePromptCache = false; // fall back to combined if truncated
                }

                String effectiveModel = routeModel(message, effectiveCodeContext, responseMode, modelOverride);
                long startedAtMs = System.currentTimeMillis();
                log.info("AiCodingController: ai-code-stream start appId={} model={} language={} promptChars={} promptTokens~{} messageChars={} promptCache={}",
                    appId, effectiveModel, language, prompt.length(), estimateTokens(prompt), message.length(), usePromptCache);

                if (!base.baseRef().isBlank()) {
                    sendEvent(emitter, jsonOf(
                        "stage", "context",
                        "status", "base_cached",
                        "baseContentRef", base.baseRef(),
                        "baseContentChars", base.baseContentChars(),
                        "effectiveCodeChars", effectiveCodeContext.length(),
                        "preserveBaseContent", preserveBaseContent
                    ));
                }

                // Send preparing event with estimated wait time
                int promptTokens = estimateTokens(prompt);
                int estimatedWaitSecs = 3 + prompt.length() / 4000 + (8192 * 4 / 400);
                sendEvent(emitter, jsonOf(
                    "stage", "preparing",
                    "message", "Đang kết nối Gemini...",
                    "model", effectiveModel,
                    "promptTokens", promptTokens,
                    "estimatedWaitSecs", estimatedWaitSecs,
                    "percent", 0
                ));

                String rawResponse = streamWithAutoContinue(
                    emitter,
                    prompt,
                    promptParts[0],
                    promptParts[1],
                    effectiveModel,
                    language,
                    responseMode,
                    largeStructuredEditMode,
                    usePromptCache
                );
                if (rawResponse == null) {
                    return;
                }

                // Send complete event
                Map<String, Object> completion = new LinkedHashMap<>();
                completion.put("stage", "complete");
                String completionPayload = rawResponse;
                if (largeStructuredEditMode) {
                    completionPayload = materializeLargeEditResponse(completionPayload, base.baseContent());
                }
                completion.put("fullResponse", completionPayload);
                completion.put("responseMode", responseMode);
                if (!base.baseRef().isBlank()) {
                    completion.put("baseContentRef", base.baseRef());
                    completion.put("baseContentChars", base.baseContentChars());
                }
                completion.put("timestamp", System.currentTimeMillis());
                sendEvent(emitter, objectMapper.writeValueAsString(completion));
                log.info("AiCodingController: ai-code-stream complete appId={} model={} elapsedMs={} outputChars={}",
                    appId, effectiveModel, (System.currentTimeMillis() - startedAtMs), rawResponse.length());
                emitter.complete();

            } catch (Exception ex) {
                log.error("AiCodingController: unexpected error: {}", ex.getMessage(), ex);
                try {
                    sendErrorEvent(emitter, "Lỗi hệ thống: " + ex.getMessage());
                } catch (Exception ignored) {
                    emitter.completeWithError(ex);
                }
            }
        });

        return emitter;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Prompt building
    // ─────────────────────────────────────────────────────────────────────────

    private String buildCodingPrompt(String message, String currentCode, String language,
                                     String contextType, String responseMode, Object attachmentsRaw) {
        return buildCodingPrompt(message, currentCode, language, contextType, responseMode, attachmentsRaw,
            false, "", currentCode == null ? 0 : currentCode.length());
    }

    private String buildCodingPrompt(String message, String currentCode, String language,
                                     String contextType, String responseMode, Object attachmentsRaw,
                                     boolean largeStructuredEditMode, String baseRef, int baseChars) {
        StringBuilder sb = new StringBuilder();

        sb.append("Bạn là AI trợ lý lập trình (như Cursor/Copilot). Hỗ trợ người dùng chính xác và chi tiết.\n\n");

        if (largeStructuredEditMode) {
            sb.append("CHẾ ĐỘ: Chỉnh sửa dữ liệu rất lớn. KHÔNG trả về full code trực tiếp.\n");
            sb.append("Bắt buộc trả về JSON thuần đúng format:\n");
            sb.append("{\"summary\":\"...\",\"changes\":[\"...\"],\"textEdits\":[{\"find\":\"chuỗi cũ chính xác\",\"replace\":\"chuỗi mới\"}]}\n");
            sb.append("Quy tắc:\n");
            sb.append("- Mỗi textEdits.find phải là chuỗi cũ chính xác cần thay, đủ unique.\n");
            sb.append("- Không dùng markdown, không dùng code fence.\n");
            sb.append("- Không trả về trường code. Backend sẽ tự áp patch để tạo full code.\n\n");
            if (baseRef != null && !baseRef.isBlank()) {
                sb.append("BASE_CONTENT_REF: ").append(baseRef).append("\n");
                sb.append("BASE_CONTENT_CHARS: ").append(baseChars).append("\n\n");
            }
        } else if ("edit".equalsIgnoreCase(responseMode)) {
            sb.append("CHẾ ĐỘ: Chỉnh sửa code. Trả về code đã cập nhật hoàn chỉnh.\n\n");
        } else {
            sb.append("CHẾ ĐỘ: Phân tích/Giải thích. Phân tích và giải thích chi tiết.\n\n");
        }

        // Attachments
        if (attachmentsRaw instanceof List<?> attachments && !attachments.isEmpty()) {
            sb.append("## TÀI LIỆU ĐÍNH KÈM\n");
            int attachmentBudget = Math.max(10000, maxAttachmentsTotalChars);
            for (Object att : attachments) {
                if (attachmentBudget <= 0) {
                    break;
                }
                if (att instanceof Map<?, ?> attMap) {
                    String name = str(attMap.get("name"), "file");
                    String content = str(attMap.get("textContent"), "");
                    if (!content.isBlank()) {
                        int perFileCap = Math.max(2000, maxAttachmentCharsPerFile);
                        String safe = truncateMiddle(content, Math.min(perFileCap, attachmentBudget));
                        attachmentBudget -= safe.length();
                        sb.append("### ").append(name).append("\n```\n").append(safe).append("\n```\n\n");
                    }
                }
            }
        }

        // Current code context
        if (!currentCode.isBlank()) {
            String safeCode = truncateMiddle(currentCode, Math.max(4000, maxCurrentCodeChars));
            sb.append("## CODE HIỆN TẠI (").append(language).append(")\n```").append(language).append("\n");
            sb.append(safeCode);
            sb.append("\n```\n\n");
        }

        // User request
        sb.append("## YÊU CẦU\n").append(message).append("\n");

        return sb.toString();
    }

    private String streamWithAutoContinue(
        SseEmitter emitter,
        String prompt,
        String model,
        String language,
        String responseMode,
        boolean largeStructuredEditMode
    ) throws Exception {
        return streamWithAutoContinue(emitter, prompt, "", "", model, language, responseMode, largeStructuredEditMode, false);
    }

    private String streamWithAutoContinue(
        SseEmitter emitter,
        String prompt,
        String systemContent,
        String userMessage,
        String model,
        String language,
        String responseMode,
        boolean largeStructuredEditMode,
        boolean usePromptCache
    ) throws Exception {
        boolean editMode = "edit".equalsIgnoreCase(responseMode);
        int maxAttempts = editMode && autoContinueEnabled ? Math.max(1, autoContinueMaxAttempts) : 1;
        String currentPrompt = prompt;
        String lastRawResponse = "";

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            final int attemptNo = attempt;
            if (attempt > 1) {
                sendEvent(emitter, jsonOf(
                    "stage", "continuing",
                    "status", "auto_continue",
                    "attempt", attemptNo,
                    "maxAttempts", maxAttempts,
                    "message", "Đang tự động tiếp tục để hoàn thiện kết quả..."
                ));
            }

            StringBuilder attemptBuffer = new StringBuilder();
            Throwable[] errorHolder = {null};

            // First attempt may use prompt caching; auto-continue always uses regular path
            boolean isFirstAttemptWithCache = (attempt == 1) && usePromptCache
                    && systemContent != null && !systemContent.isBlank()
                    && userMessage != null && !userMessage.isBlank();

            Consumer<String> chunkHandler = chunk -> {
                attemptBuffer.append(chunk);
                try {
                    sendEvent(emitter, objectMapper.writeValueAsString(Map.of(
                        "stage", "streaming",
                        "chunk", chunk,
                        "attempt", attemptNo
                    )));
                } catch (Exception ignored) { }
            };

            if (isFirstAttemptWithCache) {
                geminiStreamingService.streamContentWithCache(
                    systemContent,
                    userMessage,
                    model,
                    chunkHandler,
                    null,
                    err -> errorHolder[0] = err,
                    status -> {
                        try {
                            Map<String, Object> wrapped = new LinkedHashMap<>(status);
                            wrapped.put("attempt", attemptNo);
                            wrapped.put("maxAttempts", maxAttempts);
                            sendEvent(emitter, objectMapper.writeValueAsString(wrapped));
                        } catch (Exception ignored) { }
                    }
                );
            } else {
                geminiStreamingService.streamContent(
                    currentPrompt,
                    model,
                    chunkHandler,
                    null,
                    err -> errorHolder[0] = err,
                    status -> {
                        try {
                            Map<String, Object> wrapped = new LinkedHashMap<>(status);
                            wrapped.put("attempt", attemptNo);
                            wrapped.put("maxAttempts", maxAttempts);
                            sendEvent(emitter, objectMapper.writeValueAsString(wrapped));
                        } catch (Exception ignored) { }
                    }
                );
            }

            if (errorHolder[0] != null) {
                log.warn("AiCodingController: ai-code-stream failed model={} attempt={}/{} error={}",
                    model, attemptNo, maxAttempts, errorHolder[0].getMessage());
                sendErrorEvent(emitter, "Gemini streaming lỗi: " + errorHolder[0].getMessage());
                return null;
            }

            String raw = attemptBuffer.toString();
            lastRawResponse = raw;

            if (isCompleteResponse(raw, language, responseMode, largeStructuredEditMode)) {
                if (attempt > 1) {
                    sendEvent(emitter, jsonOf(
                        "stage", "auto_continue",
                        "status", "completed",
                        "attempt", attemptNo,
                        "maxAttempts", maxAttempts,
                        "message", "Đã tự động hoàn thiện kết quả trong backend"
                    ));
                }
                return raw;
            }

            if (attempt < maxAttempts) {
                currentPrompt = buildAutoContinuePrompt(prompt, raw, language, largeStructuredEditMode);
            }
        }

        return lastRawResponse;
    }

    private String buildAutoContinuePrompt(String originalPrompt, String previousRawResponse, String language, boolean largeStructuredEditMode) {
        StringBuilder sb = new StringBuilder();
        sb.append("KẾT QUẢ VỪA RỒI CHƯA HOÀN CHỈNH (bị cắt giữa chừng). Hãy trả về lại 1 lần DUY NHẤT, đầy đủ và hợp lệ.\n\n");
        if (largeStructuredEditMode) {
            sb.append("BẮT BUỘC format JSON: {\"summary\":\"...\",\"changes\":[...],\"textEdits\":[{\"find\":\"...\",\"replace\":\"...\"}]}\n");
            sb.append("Không markdown, không code fence, không giải thích thêm.\n\n");
        } else if ("json".equalsIgnoreCase(language)) {
            sb.append("BẮT BUỘC: Trả về JSON hợp lệ, đầy đủ từ đầu đến cuối trong wrapper: {\"summary\":\"...\",\"code\":\"toàn bộ JSON hoàn chỉnh\",\"changes\":[...]}\n");
            sb.append("QUAN TRỌNG: Trường 'code' phải chứa toàn bộ JSON hợp lệ (không được bỏ sót bất kỳ phần nào, mở { phải có đóng }).\n");
            sb.append("Không markdown, không code fence, không cắt bớt.\n\n");
        } else {
            sb.append("BẮT BUỘC format JSON: {\"summary\":\"...\",\"code\":\"toàn bộ code hoàn chỉnh\",\"changes\":[...]}\n");
            sb.append("Không markdown, không code fence, không trả về một đoạn rời.\n\n");
        }
        sb.append("--- YÊU CẦU GỐC ---\n");
        sb.append(truncateMiddle(originalPrompt, Math.max(20000, maxPromptChars))).append("\n\n");
        sb.append("--- KẾT QUẢ TRƯỚC (CHƯA HOÀN CHỈNH - BỊ CẮT) ---\n");
        sb.append(truncateMiddle(previousRawResponse, Math.max(8000, autoContinueMaxPreviousResponseChars))).append("\n");
        return sb.toString();
    }

    private boolean isCompleteResponse(String rawResponse, String language, String responseMode, boolean largeStructuredEditMode) {
        String raw = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (raw.isBlank()) {
            return false;
        }

        // For JSON language: always verify the JSON is structurally complete regardless of mode
        if ("json".equalsIgnoreCase(language)) {
            // Try to parse JSON directly or inside a wrapper {"code":...}
            String candidate = raw;
            // If wrapped in code payload, extract the code field
            ParsedCodePayload parsed = parseCodePayload(raw);
            if (parsed != null && !parsed.code().isBlank()) {
                candidate = parsed.code().trim();
            }
            // Strip markdown fences if any
            if (candidate.startsWith("```")) {
                candidate = candidate.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceAll("\\s*```$", "").trim();
            }
            try {
                objectMapper.readTree(candidate);
                return true;
            } catch (Exception ex) {
                return false; // truncated or invalid JSON → trigger auto-continue
            }
        }

        if (!"edit".equalsIgnoreCase(responseMode)) {
            return true;
        }
        if (largeStructuredEditMode) {
            ParsedTextEditPayload payload = parseTextEditPayload(raw);
            return payload != null && payload.textEdits != null && !payload.textEdits.isEmpty();
        }

        ParsedCodePayload payload = parseCodePayload(raw);
        if (payload == null || payload.code().isBlank()) {
            return false;
        }

        // Check that the code field itself is not truncated.
        // Heuristic: if the raw response ends with a truncated JSON string (no closing "}"),
        // it means Gemini hit token limit mid-code. We detect this by checking that
        // the raw response forms a fully balanced JSON (re-parse + code field round-trip).
        try {
            // re-serialize and check balance
            String reJson = objectMapper.writeValueAsString(objectMapper.readValue(raw.startsWith("```") ? raw.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceAll("\\s*```$", "").trim() : raw, Map.class));
            if (reJson == null || reJson.isBlank()) return false;
        } catch (Exception ex) {
            return false; // raw JSON not closed → truncated
        }

        return payload.code().length() >= 20;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SSE helpers
    // ─────────────────────────────────────────────────────────────────────────

    private void sendEvent(SseEmitter emitter, String jsonData) {
        try {
            emitter.send(SseEmitter.event().data(jsonData));
        } catch (Exception ex) {
            log.debug("Failed to send SSE event: {}", ex.getMessage());
        }
    }

    private void sendErrorEvent(SseEmitter emitter, String error) {
        try {
            Map<String, Object> data = Map.of("stage", "error", "message", error);
            emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(data)));
            emitter.complete();
        } catch (Exception ex) {
            emitter.completeWithError(ex);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────────────────────

    private String str(Object value, String defaultValue) {
        if (value == null) return defaultValue;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? defaultValue : s;
    }

    private String strKeep(Object value, String defaultValue) {
        if (value == null) return defaultValue;
        String s = String.valueOf(value);
        return s.isEmpty() ? defaultValue : s;
    }

    private boolean bool(Object value, boolean defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        String raw = String.valueOf(value).trim();
        if (raw.isEmpty()) {
            return defaultValue;
        }
        return "true".equalsIgnoreCase(raw) || "1".equals(raw) || "yes".equalsIgnoreCase(raw);
    }

    private String truncate(String text, int maxChars) {
        if (text == null) return "";
        return text.length() > maxChars ? text.substring(0, maxChars) : text;
    }

    private String truncateMiddle(String text, int maxChars) {
        String value = String.valueOf(text == null ? "" : text);
        int limit = Math.max(1000, maxChars);
        if (value.length() <= limit) {
            return value;
        }
        int head = (int) Math.floor(limit * 0.65);
        int tail = Math.max(200, limit - head - 28);
        String left = value.substring(0, Math.min(head, value.length()));
        String right = value.substring(Math.max(0, value.length() - tail));
        return left + "\n...[TRIMMED_FOR_CODE_STREAM]...\n" + right;
    }

    private int estimateTokens(String text) {
        String value = String.valueOf(text == null ? "" : text);
        if (value.isBlank()) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(value.length() / 4.0));
    }

    private String resolveDefaultStreamingModel() {
        if (defaultStreamingModel != null && !defaultStreamingModel.isBlank()) {
            return defaultStreamingModel.trim();
        }
        if (legacyStreamingModel != null && !legacyStreamingModel.isBlank()) {
            return legacyStreamingModel.trim();
        }
        return "gemini-2.5-pro";
    }

    /**
    * Route to a cheaper model for simple analyze requests.
     * Rules:
     *  - If user specifies a model override → use that
     *  - If routing disabled or no simple model configured → use default
    *  - If responseMode == "analyze" AND total chars < complexThreshold → use simple model
    *  - Otherwise → use default model
     */
    private String routeModel(String messageText, String codeContext, String responseMode, String modelOverride) {
        if (modelOverride != null && !modelOverride.isBlank()) {
            return modelOverride.trim();
        }
        if (!routingEnabled) {
            return resolveDefaultStreamingModel();
        }
        String simpleModel = routingSimpleModel == null ? "" : routingSimpleModel.trim();
        if (simpleModel.isBlank()) {
            return resolveDefaultStreamingModel();
        }
        boolean isAnalyzeMode = !"edit".equalsIgnoreCase(responseMode);
        int totalChars = (messageText == null ? 0 : messageText.length())
                + (codeContext == null ? 0 : codeContext.length());
        if (isAnalyzeMode && totalChars < Math.max(2000, routingComplexThresholdChars)) {
            log.debug("AiCodingController: routing to simple model={} totalChars={}", simpleModel, totalChars);
            return simpleModel;
        }
        return resolveDefaultStreamingModel();
    }

    /**
     * Build prompt as (systemPart, userPart) tuple for prompt caching.
     * systemPart contains all context (cacheable).
     * userPart contains only the user's request.
     * Returns [systemPart, userPart].
     */
    private String[] buildCodingPromptParts(String message, String currentCode, String language,
                                             String contextType, String responseMode, Object attachmentsRaw,
                                             boolean largeStructuredEditMode, String baseRef, int baseChars) {
        // Re-use the full prompt builder and split on the last ## YÊU CẦU marker
        String full = buildCodingPrompt(message, currentCode, language, contextType, responseMode,
                attachmentsRaw, largeStructuredEditMode, baseRef, baseChars);
        int idx = full.lastIndexOf("\n## YÊU CẦU\n");
        if (idx >= 0) {
            String systemPart = full.substring(0, idx).trim();
            String userPart = full.substring(idx + "\n## YÊU CẦU\n".length()).trim();
            return new String[]{systemPart, userPart};
        }
        // Fallback: can't split cleanly
        return new String[]{full, ""};
    }

    private String jsonOf(Object... keyValues) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            m.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
        }
        try {
            return objectMapper.writeValueAsString(m);
        } catch (Exception e) {
            return "{}";
        }
    }

    private void pruneBaseContentCache() {
        if (!baseCacheEnabled || baseContentCache.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        long ttlMs = TimeUnit.MINUTES.toMillis(Math.max(5, baseCacheTtlMinutes));
        baseContentCache.entrySet().removeIf(entry -> now - entry.getValue().createdAtMs > ttlMs);
        if (baseContentCache.size() <= Math.max(4, maxBaseCacheEntries)) {
            return;
        }
        baseContentCache.entrySet().stream()
            .sorted((a, b) -> Long.compare(a.getValue().createdAtMs, b.getValue().createdAtMs))
            .limit(baseContentCache.size() - Math.max(4, maxBaseCacheEntries))
            .map(Map.Entry::getKey)
            .toList()
            .forEach(baseContentCache::remove);
    }

    private BaseContentResolution resolveBaseContent(String appId, String requestedRef, String providedBaseContent, String currentCodeRaw) {
        if (!baseCacheEnabled) {
            return new BaseContentResolution("", "", 0);
        }

        String requested = requestedRef == null ? "" : requestedRef.trim();
        if (!providedBaseContent.isBlank()) {
            String clamped = truncate(providedBaseContent, Math.max(100000, maxBaseContentChars));
            String ref = buildBaseRef(appId, clamped);
            baseContentCache.put(ref, new BaseContentEntry(appId, clamped, System.currentTimeMillis()));
            return new BaseContentResolution(ref, clamped, clamped.length());
        }

        if (!requested.isBlank()) {
            BaseContentEntry existing = baseContentCache.get(requested);
            if (existing != null) {
                return new BaseContentResolution(requested, existing.content, existing.content.length());
            }
        }

        int autoPromoteThreshold = Math.max(50000, baseCacheAutoPromoteChars);
        if (!currentCodeRaw.isBlank() && currentCodeRaw.length() >= autoPromoteThreshold) {
            String clamped = truncate(currentCodeRaw, Math.max(100000, maxBaseContentChars));
            String ref = buildBaseRef(appId, clamped);
            baseContentCache.put(ref, new BaseContentEntry(appId, clamped, System.currentTimeMillis()));
            return new BaseContentResolution(ref, clamped, clamped.length());
        }

        return new BaseContentResolution("", "", 0);
    }

    private String buildBaseRef(String appId, String content) {
        String app = (appId == null || appId.isBlank()) ? "global" : appId.trim();
        return "base_" + app + "_" + sha256(content).substring(0, 24);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            return Integer.toHexString(String.valueOf(value).hashCode());
        }
    }

    private record BaseContentResolution(String baseRef, String baseContent, int baseContentChars) {}

    private record BaseContentEntry(String appId, String content, long createdAtMs) {}

    private String materializeLargeEditResponse(String rawResponse, String baseContent) {
        ParsedTextEditPayload payload = parseTextEditPayload(rawResponse);
        if (payload == null || payload.textEdits.isEmpty()) {
            return rawResponse;
        }

        String result = baseContent == null ? "" : baseContent;
        int applied = 0;
        List<Map<String, Object>> appliedStats = new ArrayList<>();
        for (TextEditOp op : payload.textEdits) {
            if (op == null || op.find == null || op.find.isBlank()) {
                continue;
            }
            int idx = result.indexOf(op.find);
            if (idx < 0) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("applied", false);
                item.put("findChars", op.find.length());
                appliedStats.add(item);
                continue;
            }
            String before = result.substring(0, idx);
            String after = result.substring(idx + op.find.length());
            result = before + String.valueOf(op.replace == null ? "" : op.replace) + after;
            applied += 1;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("applied", true);
            item.put("offset", idx);
            item.put("findChars", op.find.length());
            item.put("replaceChars", op.replace == null ? 0 : op.replace.length());
            appliedStats.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", payload.summary == null ? "" : payload.summary);
        out.put("code", result);
        out.put("changes", payload.changes == null ? List.of() : payload.changes);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("mode", "large-structured-edits");
        meta.put("requestedEdits", payload.textEdits.size());
        meta.put("appliedEdits", applied);
        meta.put("stats", appliedStats);
        out.put("meta", meta);

        try {
            return objectMapper.writeValueAsString(out);
        } catch (Exception ex) {
            return rawResponse;
        }
    }

    private ParsedTextEditPayload parseTextEditPayload(String raw) {
        String normalized = String.valueOf(raw == null ? "" : raw).trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.startsWith("```json")) {
            normalized = normalized.substring(7).trim();
        }
        if (normalized.startsWith("```")) {
            normalized = normalized.substring(3).trim();
        }
        if (normalized.endsWith("```")) {
            normalized = normalized.substring(0, normalized.length() - 3).trim();
        }

        try {
            Map<?, ?> obj = objectMapper.readValue(normalized, Map.class);
            Object editsObj = obj.get("textEdits");
            List<TextEditOp> edits = new ArrayList<>();
            if (editsObj instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> map) {
                        String find = String.valueOf(map.get("find") == null ? "" : map.get("find"));
                        String replace = String.valueOf(map.get("replace") == null ? "" : map.get("replace"));
                        if (!find.isBlank()) {
                            edits.add(new TextEditOp(find, replace));
                        }
                    }
                }
            }

            List<String> changes = new ArrayList<>();
            Object changesObj = obj.get("changes");
            if (changesObj instanceof List<?> changeList) {
                for (Object item : changeList) {
                    if (item != null) {
                        changes.add(String.valueOf(item));
                    }
                }
            }

            String summary = String.valueOf(obj.get("summary") == null ? "" : obj.get("summary"));
            return new ParsedTextEditPayload(summary, changes, edits);
        } catch (Exception ex) {
            return null;
        }
    }

    private ParsedCodePayload parseCodePayload(String raw) {
        String normalized = String.valueOf(raw == null ? "" : raw).trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.startsWith("```json")) {
            normalized = normalized.substring(7).trim();
        }
        if (normalized.startsWith("```")) {
            normalized = normalized.substring(3).trim();
        }
        if (normalized.endsWith("```")) {
            normalized = normalized.substring(0, normalized.length() - 3).trim();
        }

        try {
            Map<?, ?> obj = objectMapper.readValue(normalized, Map.class);
            String summary = String.valueOf(obj.get("summary") == null ? "" : obj.get("summary"));
            String code = String.valueOf(obj.get("code") == null ? "" : obj.get("code"));
            List<String> changes = new ArrayList<>();
            Object changesObj = obj.get("changes");
            if (changesObj instanceof List<?> changeList) {
                for (Object item : changeList) {
                    if (item != null) {
                        changes.add(String.valueOf(item));
                    }
                }
            }
            return new ParsedCodePayload(summary, code, changes);
        } catch (Exception ex) {
            return null;
        }
    }

    private record TextEditOp(String find, String replace) {}

    private record ParsedTextEditPayload(String summary, List<String> changes, List<TextEditOp> textEdits) {}

    private record ParsedCodePayload(String summary, String code, List<String> changes) {}
}
