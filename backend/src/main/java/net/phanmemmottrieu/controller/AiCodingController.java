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

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * SSE endpoint for the AI coding assistant (Gemini Pro large context).
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
    private static final int MAX_PROMPT_CHARS  = 900_000;

    private final GeminiStreamingService geminiStreamingService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @Value("${gemini.streaming.model:gemini-2.5-pro}")
    private String defaultStreamingModel;

    public AiCodingController(GeminiStreamingService geminiStreamingService) {
        this.geminiStreamingService = geminiStreamingService;
    }

    @PostMapping(value = "/api/ai-code-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamCodeAssistant(@RequestBody Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5-minute timeout

        emitter.onTimeout(() -> {
            log.warn("AiCodingController: SSE timeout");
            emitter.complete();
        });
        emitter.onError(ex -> log.debug("AiCodingController: SSE error: {}", ex.getMessage()));

        executor.execute(() -> {
            try {
                String appId        = str(body.get("appId"), "");
                String message      = truncate(str(body.get("message"), ""), MAX_MESSAGE_CHARS);
                String currentCode  = truncate(str(body.get("currentCode"), ""), MAX_CODE_CHARS);
                String language     = str(body.get("language"), "javascript");
                String contextType  = str(body.get("contextType"), "code");
                String responseMode = str(body.get("responseMode"), "analyze");
                String modelOverride = str(body.get("model"), "");
                Object attachmentsRaw = body.get("attachments");

                if (message.isBlank()) {
                    sendErrorEvent(emitter, "Message không được để trống");
                    return;
                }

                String prompt = buildCodingPrompt(message, currentCode, language, contextType, responseMode, attachmentsRaw);
                if (prompt.length() > MAX_PROMPT_CHARS) {
                    prompt = prompt.substring(0, MAX_PROMPT_CHARS);
                }

                String effectiveModel = modelOverride.isBlank() ? defaultStreamingModel : modelOverride;

                // Send preparing event
                sendEvent(emitter, jsonOf("stage", "preparing",
                        "message", "Đang kết nối Gemini Pro...", "percent", 0));

                StringBuilder fullResponse = new StringBuilder();
                Throwable[] errorHolder = {null};

                geminiStreamingService.streamContent(
                    prompt,
                    effectiveModel,
                    chunk -> sendChunkEvent(emitter, chunk, fullResponse),
                    null,
                    err -> errorHolder[0] = err,
                    status -> {
                        try {
                            sendEvent(emitter, objectMapper.writeValueAsString(status));
                        } catch (Exception ignored) {
                            // ignore status event serialization failures
                        }
                    }
                );

                if (errorHolder[0] != null) {
                    sendErrorEvent(emitter, "Gemini streaming lỗi: " + errorHolder[0].getMessage());
                    return;
                }

                // Send complete event
                Map<String, Object> completion = new LinkedHashMap<>();
                completion.put("stage", "complete");
                completion.put("fullResponse", fullResponse.toString());
                completion.put("responseMode", responseMode);
                completion.put("timestamp", System.currentTimeMillis());
                sendEvent(emitter, objectMapper.writeValueAsString(completion));
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
        StringBuilder sb = new StringBuilder();

        sb.append("Bạn là AI trợ lý lập trình (như Cursor/Copilot). Hỗ trợ người dùng chính xác và chi tiết.\n\n");

        if ("edit".equalsIgnoreCase(responseMode)) {
            sb.append("CHẾ ĐỘ: Chỉnh sửa code. Trả về code đã cập nhật hoàn chỉnh.\n\n");
        } else {
            sb.append("CHẾ ĐỘ: Phân tích/Giải thích. Phân tích và giải thích chi tiết.\n\n");
        }

        // Attachments
        if (attachmentsRaw instanceof List<?> attachments && !attachments.isEmpty()) {
            sb.append("## TÀI LIỆU ĐÍNH KÈM\n");
            for (Object att : attachments) {
                if (att instanceof Map<?, ?> attMap) {
                    String name = str(attMap.get("name"), "file");
                    String content = str(attMap.get("textContent"), "");
                    if (!content.isBlank()) {
                        String safe = content.length() > 200_000 ? content.substring(0, 200_000) : content;
                        sb.append("### ").append(name).append("\n```\n").append(safe).append("\n```\n\n");
                    }
                }
            }
        }

        // Current code context
        if (!currentCode.isBlank()) {
            sb.append("## CODE HIỆN TẠI (").append(language).append(")\n```").append(language).append("\n");
            sb.append(currentCode);
            sb.append("\n```\n\n");
        }

        // User request
        sb.append("## YÊU CẦU\n").append(message).append("\n");

        return sb.toString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SSE helpers
    // ─────────────────────────────────────────────────────────────────────────

    private void sendChunkEvent(SseEmitter emitter, String chunk, StringBuilder accumulator) {
        if (accumulator != null) accumulator.append(chunk);
        try {
            Map<String, Object> data = Map.of("stage", "streaming", "chunk", chunk);
            emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(data)));
        } catch (IOException ex) {
            log.debug("SSE write failed (client disconnected?): {}", ex.getMessage());
        } catch (Exception ex) {
            log.warn("Failed to send SSE chunk: {}", ex.getMessage());
        }
    }

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

    private String truncate(String text, int maxChars) {
        if (text == null) return "";
        return text.length() > maxChars ? text.substring(0, maxChars) : text;
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
}
