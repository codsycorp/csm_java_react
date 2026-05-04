package net.phanmemmottrieu.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.phanmemmottrieu.service.AiBusinessMemoryVectorService;
import net.phanmemmottrieu.service.GeminiStreamingService;
import net.phanmemmottrieu.service.LlamaCppNativeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping
public class AiAssistantEngineController {

    private static final Logger log = LoggerFactory.getLogger(AiAssistantEngineController.class);
    private static final long SSE_TIMEOUT_MS = 10 * 60_000L;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool();

    private final AiBusinessMemoryVectorService businessMemoryVectorService;
    private final GeminiStreamingService geminiStreamingService;
    private final LlamaCppNativeService llamaCppNativeService;

    @Value("${ai.context.dir:csm_datas/public}")
    private String contextDir;

    @Autowired
    public AiAssistantEngineController(
        AiBusinessMemoryVectorService businessMemoryVectorService,
        GeminiStreamingService geminiStreamingService,
        @Autowired(required = false) LlamaCppNativeService llamaCppNativeService
    ) {
        this.businessMemoryVectorService = businessMemoryVectorService;
        this.geminiStreamingService = geminiStreamingService;
        this.llamaCppNativeService = llamaCppNativeService;
    }

    @PostMapping(value = {"/ai-assistant/business-memory/index-md", "/api/ai-assistant/business-memory/index-md"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> indexMarkdownFile(
        @RequestPart("file") MultipartFile file,
        @RequestParam("appId") String appId,
        @RequestParam(value = "tags", required = false) String tagsRaw
    ) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            if (file == null || file.isEmpty()) {
                out.put("success", false);
                out.put("message", "file is empty");
                return ResponseEntity.ok(out);
            }

            String sourceName = String.valueOf(file.getOriginalFilename() == null ? "business.md" : file.getOriginalFilename());
            String content = new String(file.getBytes(), StandardCharsets.UTF_8);
            List<String> tags = parseTags(tagsRaw);

            AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexMarkdown(appId, sourceName, content, tags);
            out.put("success", true);
            out.put("message", "indexed");
            out.put("result", summary);
            return ResponseEntity.ok(out);
        } catch (Exception ex) {
            out.put("success", false);
            out.put("message", ex.getMessage());
            return ResponseEntity.ok(out);
        }
    }

    @PostMapping(value = {"/ai-assistant/business-memory/index-md-text", "/api/ai-assistant/business-memory/index-md-text"})
    public ResponseEntity<Map<String, Object>> indexMarkdownText(@RequestBody Map<String, Object> body) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            String appId = str(body.get("appId"));
            String sourceName = str(body.get("name"));
            String content = str(body.get("content"));
            List<String> tags = parseTags(str(body.get("tags")));

            AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexMarkdown(appId, sourceName, content, tags);
            out.put("success", true);
            out.put("message", "indexed");
            out.put("result", summary);
            return ResponseEntity.ok(out);
        } catch (Exception ex) {
            out.put("success", false);
            out.put("message", ex.getMessage());
            return ResponseEntity.ok(out);
        }
    }

    @GetMapping({"/ai-assistant/business-memory/search", "/api/ai-assistant/business-memory/search"})
    public ResponseEntity<Map<String, Object>> search(
        @RequestParam("appId") String appId,
        @RequestParam("q") String q,
        @RequestParam(value = "k", required = false) Integer k
    ) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<AiBusinessMemoryVectorService.SearchHit> hits = businessMemoryVectorService.search(appId, q, k);
        out.put("success", true);
        out.put("message", "ok");
        out.put("result", hits);
        return ResponseEntity.ok(out);
    }

    @GetMapping({"/ai-assistant/business-memory/stats", "/api/ai-assistant/business-memory/stats"})
    public ResponseEntity<Map<String, Object>> stats(@RequestParam("appId") String appId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("message", "ok");
        out.put("result", businessMemoryVectorService.getStats(appId));
        return ResponseEntity.ok(out);
    }

    /**
     * Scan contextDir for .md files and index them into Business Memory for the given appId.
     * Only indexes files whose name starts with ai_menu_, ai_system_, ai_business_, ai_knowledge_, or ai_context_.
     */
    @PostMapping({"/ai-assistant/business-memory/scan-index", "/api/ai-assistant/business-memory/scan-index"})
    public ResponseEntity<Map<String, Object>> scanIndexFromDir(@RequestBody Map<String, Object> body) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            String appId = str(body.getOrDefault("appId", ""));
            if (appId.isBlank()) {
                out.put("success", false);
                out.put("message", "appId is required");
                return ResponseEntity.ok(out);
            }

            Path dir = Paths.get(contextDir);
            if (!Files.isDirectory(dir)) {
                out.put("success", false);
                out.put("message", "contextDir not found: " + contextDir);
                return ResponseEntity.ok(out);
            }

            List<Map<String, Object>> indexed = new ArrayList<>();
            List<String> skipped = new ArrayList<>();

            try (var stream = Files.list(dir)) {
                stream.filter(Files::isRegularFile)
                    .filter(p -> {
                        String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
                        return name.endsWith(".md") && (
                            name.startsWith("ai_menu_")
                            || name.startsWith("ai_system_")
                            || name.startsWith("ai_business_")
                            || name.startsWith("ai_knowledge_")
                            || name.startsWith("ai_context_")
                        );
                    })
                    .sorted()
                    .forEach(p -> {
                        try {
                            String content = Files.readString(p, StandardCharsets.UTF_8);
                            String sourceName = p.getFileName().toString();
                            AiBusinessMemoryVectorService.IndexSummary summary =
                                businessMemoryVectorService.indexMarkdown(appId, sourceName, content, List.of());
                            Map<String, Object> entry = new LinkedHashMap<>();
                            entry.put("file", sourceName);
                            entry.put("chunks", summary.chunksIndexed());
                            entry.put("chars", summary.charsIndexed());
                            indexed.add(entry);
                        } catch (Exception e) {
                            skipped.add(p.getFileName().toString() + ": " + e.getMessage());
                        }
                    });
            }

            out.put("success", true);
            out.put("message", "Scanned " + indexed.size() + " file(s)");
            out.put("indexed", indexed);
            out.put("skipped", skipped);
            return ResponseEntity.ok(out);
        } catch (Exception ex) {
            out.put("success", false);
            out.put("message", ex.getMessage());
            return ResponseEntity.ok(out);
        }
    }

    @PostMapping(value = {"/ai-assistant/stream-optimize", "/api/ai-assistant/stream-optimize"})
    public SseEmitter streamOptimize(@RequestBody Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitter.onTimeout(emitter::complete);
        emitter.onError(ex -> log.debug("stream-optimize SSE error: {}", ex.getMessage()));

        streamExecutor.execute(() -> runOptimizeStream(emitter, body));
        return emitter;
    }

    private void runOptimizeStream(SseEmitter emitter, Map<String, Object> body) {
        String requestId = "eng_" + UUID.randomUUID().toString().substring(0, 10);
        try {
            String appId = str(body.get("appId"));
            String instruction = str(body.get("instruction"));
            String selection = str(body.get("selection"));
            String currentCode = str(body.get("currentCode"));
            String language = str(body.get("language"));
            String model = str(body.get("model"));
            int k = intSafe(body.get("topK"), 6);

            if (instruction.isBlank()) {
                sendEvent(emitter, "error", mapOf(
                    "requestId", requestId,
                    "message", "instruction is empty"
                ));
                emitter.complete();
                return;
            }

            String query = (instruction + "\n" + selection + "\n" + currentCode).trim();
            String ragBlock = businessMemoryVectorService.buildRagBlock(appId, query, k, 28_000);
            sendEvent(emitter, "status", mapOf(
                "requestId", requestId,
                "stage", "retrieval",
                "message", ragBlock.isBlank() ? "No business memory found" : "Retrieved business memory context",
                "ragChars", ragBlock.length()
            ));

            String prompt = buildUniversalPrompt(instruction, selection, currentCode, language, ragBlock);
            sendEvent(emitter, "status", mapOf(
                "requestId", requestId,
                "stage", "orchestrate",
                "message", "Prompt packaged and ready for model",
                "promptChars", prompt.length()
            ));

            if (shouldUseLocalModel(model)) {
                streamWithLocalModel(emitter, requestId, prompt, model);
            } else {
                streamWithGemini(emitter, requestId, prompt, model);
            }
        } catch (Exception ex) {
            sendEvent(emitter, "error", mapOf(
                "requestId", requestId,
                "message", ex.getMessage()
            ));
            emitter.complete();
        }
    }

    private void streamWithGemini(SseEmitter emitter, String requestId, String prompt, String model) {
        String resolvedModel = model.isBlank() ? "gemini-2.5-pro" : model;
        sendEvent(emitter, "status", mapOf(
            "requestId", requestId,
            "stage", "generation",
            "provider", "gemini",
            "model", resolvedModel,
            "message", "Streaming response"
        ));

        StringBuilder full = new StringBuilder();
        geminiStreamingService.streamContent(
            prompt,
            resolvedModel,
            chunk -> {
                full.append(chunk);
                sendEvent(emitter, "chunk", mapOf(
                    "requestId", requestId,
                    "text", chunk
                ));
            },
            () -> {
                sendEvent(emitter, "complete", mapOf(
                    "requestId", requestId,
                    "provider", "gemini",
                    "text", full.toString()
                ));
                emitter.complete();
            },
            err -> {
                sendEvent(emitter, "error", mapOf(
                    "requestId", requestId,
                    "provider", "gemini",
                    "message", err == null ? "stream error" : err.getMessage()
                ));
                emitter.complete();
            },
            status -> sendEvent(emitter, "status", status)
        );
    }

    private void streamWithLocalModel(SseEmitter emitter, String requestId, String prompt, String model) {
        if (llamaCppNativeService == null || !llamaCppNativeService.isAvailable()) {
            sendEvent(emitter, "status", mapOf(
                "requestId", requestId,
                "stage", "local_provider_unavailable",
                "message", "Local model unavailable. Fallback to Gemini"
            ));
            streamWithGemini(emitter, requestId, prompt, "gemini-2.5-flash");
            return;
        }

        sendEvent(emitter, "status", mapOf(
            "requestId", requestId,
            "stage", "generation",
            "provider", "local",
            "model", model,
            "message", "Running local model"
        ));

        try {
            String raw = llamaCppNativeService.generateContent(prompt);
            String outText = parseLocalResult(raw);
            int chunkSize = 280;
            for (int i = 0; i < outText.length(); i += chunkSize) {
                String chunk = outText.substring(i, Math.min(outText.length(), i + chunkSize));
                sendEvent(emitter, "chunk", mapOf(
                    "requestId", requestId,
                    "text", chunk
                ));
                try {
                    TimeUnit.MILLISECONDS.sleep(8L);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }

            sendEvent(emitter, "complete", mapOf(
                "requestId", requestId,
                "provider", "local",
                "text", outText
            ));
            emitter.complete();
        } catch (Exception ex) {
            sendEvent(emitter, "error", mapOf(
                "requestId", requestId,
                "provider", "local",
                "message", ex.getMessage()
            ));
            emitter.complete();
        }
    }

    private String parseLocalResult(String raw) {
        String safe = String.valueOf(raw == null ? "" : raw).trim();
        if (safe.isBlank()) {
            return "";
        }
        try {
            Map<?, ?> node = objectMapper.readValue(safe, Map.class);
            Object result = node.get("result");
            if (result != null) {
                return String.valueOf(result);
            }
            Object message = node.get("message");
            if (message != null) {
                return String.valueOf(message);
            }
        } catch (Exception ignored) {
            // Return raw text when local provider already returned plain content.
        }
        return safe;
    }

    private String buildUniversalPrompt(
        String instruction,
        String selection,
        String currentCode,
        String language,
        String ragBlock
    ) {
        String safeLang = language.isBlank() ? "html" : language;
        String selectedOrFull = selection.isBlank() ? currentCode : selection;
        return String.join("\n\n",
            "You are a senior software customization expert.",
            "Focus language priority: HTML + inline JavaScript + JSON configuration.",
            "Apply customer-specific business rules from RAG memory with strict precedence.",
            "Output format MUST be valid JSON only:",
            "{\"summary\":\"short\",\"optimizedCode\":\"...\",\"changes\":[\"...\"]}",
            "Do not wrap JSON in markdown fences.",
            ragBlock,
            "## USER INSTRUCTION",
            instruction,
            "## TARGET LANGUAGE",
            safeLang,
            "## CURRENT SELECTION OR CODE",
            selectedOrFull
        );
    }

    private boolean shouldUseLocalModel(String model) {
        String m = String.valueOf(model == null ? "" : model).toLowerCase(Locale.ROOT).trim();
        if (m.isBlank()) {
            return false;
        }
        return m.contains("local")
            || m.contains("qwen")
            || m.contains("deepseek")
            || m.contains("llama");
    }

    private void sendEvent(SseEmitter emitter, String event, Map<String, Object> payload) {
        try {
            String json = objectMapper.writeValueAsString(payload == null ? Map.of() : payload);
            emitter.send(SseEmitter.event().name(event).data(json));
        } catch (Exception ex) {
            log.debug("stream-optimize send event failed: {}", ex.getMessage());
        }
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private int intSafe(Object raw, int fallback) {
        if (raw instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(str(raw));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private List<String> parseTags(String tagsRaw) {
        String raw = String.valueOf(tagsRaw == null ? "" : tagsRaw).trim();
        if (raw.isBlank()) {
            return List.of();
        }
        String[] parts = raw.split("[,;\\n]");
        List<String> out = new ArrayList<>();
        for (String part : parts) {
            String value = String.valueOf(part == null ? "" : part).trim();
            if (!value.isBlank()) {
                out.add(value);
            }
        }
        return out;
    }

    private Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (kv == null || kv.length == 0) {
            return out;
        }
        for (int i = 0; i + 1 < kv.length; i += 2) {
            out.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return out;
    }
}
