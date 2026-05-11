package net.phanmemmottrieu.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.phanmemmottrieu.service.AiBusinessMemoryVectorService;
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
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping
public class AiAssistantEngineController {

    private static final Logger log = LoggerFactory.getLogger(AiAssistantEngineController.class);
    private static final long SSE_TIMEOUT_MS = 10 * 60_000L;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final AiBusinessMemoryVectorService businessMemoryVectorService;

    @Value("${ai.context.dir:csm_datas/ai_local}")
    private String contextDir;

    @Autowired
    public AiAssistantEngineController(AiBusinessMemoryVectorService businessMemoryVectorService) {
        this.businessMemoryVectorService = businessMemoryVectorService;
    }

    @PostMapping(value = {"/ai-assistant/business-memory/index-md", "/api/ai-assistant/business-memory/index-md"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> indexMarkdownFile(
        @RequestPart("file") MultipartFile file,
        @RequestParam("appId") String appId,
        @RequestParam(value = "tags", required = false) String tagsRaw,
        @RequestParam(value = "scopeMask", required = false) Integer scopeMask
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

            int safeScopeMask = Math.max(0, scopeMask == null ? 0 : scopeMask);
            AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexMarkdown(appId, sourceName, content, tags, safeScopeMask);
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
            int safeScopeMask = parseScopeMask(body.get("scopeMask"));

            AiBusinessMemoryVectorService.IndexSummary summary = businessMemoryVectorService.indexMarkdown(appId, sourceName, content, tags, safeScopeMask);
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
        @RequestParam(value = "k", required = false) Integer k,
        @RequestParam(value = "scopeMask", required = false) Integer scopeMask
    ) {
        Map<String, Object> out = new LinkedHashMap<>();
        int safeScopeMask = Math.max(0, scopeMask == null ? 0 : scopeMask);
        List<AiBusinessMemoryVectorService.SearchHit> hits = safeScopeMask > 0
            ? businessMemoryVectorService.searchWithScopes(appId, q, k, safeScopeMask)
            : businessMemoryVectorService.search(appId, q, k);
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
            int safeScopeMask = parseScopeMask(body.get("scopeMask"));
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
                                businessMemoryVectorService.indexMarkdown(appId, sourceName, content, List.of(), safeScopeMask);
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

        sendEvent(emitter, "error", mapOf(
            "stage", "error",
            "message", "Legacy endpoint disabled. Use SSE /ai-code-stream only."
        ));
        emitter.complete();
        return emitter;
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

    private int parseScopeMask(Object raw) {
        String value = str(raw);
        if (value.isBlank()) {
            return 0;
        }
        try {
            return Math.max(0, Integer.parseInt(value));
        } catch (Exception ignored) {
            return 0;
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
