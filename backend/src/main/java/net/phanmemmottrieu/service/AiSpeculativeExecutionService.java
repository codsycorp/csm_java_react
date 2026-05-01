package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Safe speculative execution engine (local-only, whitelist operations).
 *
 * It does NOT execute arbitrary user scripts. Instead, it runs pre-defined local analyzers
 * that mimic agentic tool execution while keeping security and determinism.
 */
@Service
public class AiSpeculativeExecutionService {

    public static class ExecutionResult {
        public boolean enabled;
        public boolean executed;
        public String operation;
        public String summary;
        public Map<String, Object> data = new LinkedHashMap<>();

        public static ExecutionResult disabled() {
            ExecutionResult out = new ExecutionResult();
            out.enabled = false;
            out.executed = false;
            out.operation = "none";
            out.summary = "speculative execution disabled";
            return out;
        }
    }

    private static final Pattern TOKEN = Pattern.compile("[a-zA-Z0-9_\\-]{3,}");

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ai.orchestration.speculative.enabled:true}")
    private boolean enabled;

    @Value("${ai.orchestration.speculative.min-attachment-chars:16000}")
    private int minAttachmentChars;

    @Value("${ai.orchestration.speculative.max-json-scan-chars:300000}")
    private int maxJsonScanChars;

    public ExecutionResult run(
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType
    ) {
        if (!enabled) {
            return ExecutionResult.disabled();
        }

        String msg = String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT);
        String code = String.valueOf(currentCode == null ? "" : currentCode);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;

        int totalAttachmentChars = estimateAttachmentChars(safeAttachments);
        boolean likelyStatsIntent = msg.contains("thống kê")
            || msg.contains("thong ke")
            || msg.contains("profile")
            || msg.contains("count")
            || msg.contains("summary")
            || msg.contains("analy")
            || msg.contains("tổng hợp");

        ExecutionResult out = new ExecutionResult();
        out.enabled = true;
        out.executed = false;
        out.operation = "none";
        out.summary = "no speculative execution trigger";

        if (!likelyStatsIntent && totalAttachmentChars < Math.max(2000, minAttachmentChars)) {
            return out;
        }

        // Priority 1: JSON attachment stats (very effective for menu/data payloads)
        Map<String, Object> jsonStats = analyzeJsonAttachments(safeAttachments);
        if (!jsonStats.isEmpty()) {
            out.executed = true;
            out.operation = "json_stats";
            out.data.putAll(jsonStats);
            out.summary = "Computed local JSON stats from attachments";
            return out;
        }

        // Priority 2: source code quick profile for large code flows
        if (!code.isBlank()) {
            Map<String, Object> codeStats = analyzeCode(code);
            if (!codeStats.isEmpty()) {
                out.executed = true;
                out.operation = "code_profile";
                out.data.putAll(codeStats);
                out.summary = "Computed local code profile";
                return out;
            }
        }

        // Priority 3: lightweight keyword histogram from attachments
        Map<String, Object> keywordStats = analyzeAttachmentKeywords(safeAttachments, 15);
        if (!keywordStats.isEmpty()) {
            out.executed = true;
            out.operation = "keyword_histogram";
            out.data.putAll(keywordStats);
            out.summary = "Computed local keyword histogram";
        }

        return out;
    }

    private Map<String, Object> analyzeJsonAttachments(List<Map<String, Object>> attachments) {
        Map<String, Object> out = new LinkedHashMap<>();
        int jsonFiles = 0;
        int objectRoots = 0;
        int arrayRoots = 0;
        long totalNodesEstimate = 0;
        List<String> keySamples = new ArrayList<>();

        for (Map<String, Object> item : attachments) {
            if (item == null) {
                continue;
            }
            String kind = str(item.get("kind")).toLowerCase(Locale.ROOT);
            String name = str(item.get("name")).toLowerCase(Locale.ROOT);
            if (!"json".equals(kind) && !name.endsWith(".json")) {
                continue;
            }

            String text = str(item.get("textContent"));
            if (text.isBlank()) {
                continue;
            }
            jsonFiles++;
            String payload = text.length() > maxJsonScanChars ? text.substring(0, maxJsonScanChars) : text;
            try {
                JsonNode node = objectMapper.readTree(payload);
                if (node.isObject()) {
                    objectRoots++;
                    node.fieldNames().forEachRemaining(fn -> {
                        if (keySamples.size() < 20) {
                            keySamples.add(fn);
                        }
                    });
                    totalNodesEstimate += node.size();
                } else if (node.isArray()) {
                    arrayRoots++;
                    totalNodesEstimate += node.size();
                    if (node.size() > 0 && node.get(0).isObject()) {
                        node.get(0).fieldNames().forEachRemaining(fn -> {
                            if (keySamples.size() < 20) {
                                keySamples.add(fn);
                            }
                        });
                    }
                }
            } catch (Exception ignored) {
                // Keep speculative engine resilient.
            }
        }

        if (jsonFiles <= 0) {
            return out;
        }

        out.put("jsonFiles", jsonFiles);
        out.put("objectRoots", objectRoots);
        out.put("arrayRoots", arrayRoots);
        out.put("totalNodesEstimate", totalNodesEstimate);
        out.put("keySamples", dedupeStrings(keySamples, 20));
        return out;
    }

    private Map<String, Object> analyzeCode(String code) {
        Map<String, Object> out = new LinkedHashMap<>();
        String source = code.length() > 400000 ? code.substring(0, 400000) : code;
        String[] lines = source.split("\\n");
        int classes = 0;
        int methods = 0;
        int imports = 0;
        int comments = 0;

        for (String rawLine : lines) {
            String line = String.valueOf(rawLine == null ? "" : rawLine).trim();
            if (line.startsWith("import ")) imports++;
            if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) comments++;
            if (line.matches(".*\\b(class|interface|enum|record)\\b.*")) classes++;
            if (line.matches(".*\\b(public|private|protected)?\\s*(static\\s+)?[A-Za-z_][A-Za-z0-9_<>\\[\\]]*\\s+[A-Za-z_][A-Za-z0-9_]*\\s*\\(.*\\).*")) {
                methods++;
            }
        }

        out.put("codeChars", source.length());
        out.put("lines", lines.length);
        out.put("imports", imports);
        out.put("classes", classes);
        out.put("methods", methods);
        out.put("commentLines", comments);
        return out;
    }

    private Map<String, Object> analyzeAttachmentKeywords(List<Map<String, Object>> attachments, int topK) {
        Map<String, Integer> counter = new LinkedHashMap<>();
        for (Map<String, Object> item : attachments) {
            if (item == null) continue;
            String text = str(item.get("textContent"));
            if (text.isBlank()) continue;
            Matcher matcher = TOKEN.matcher(text.toLowerCase(Locale.ROOT));
            while (matcher.find()) {
                String tk = matcher.group(0);
                if (tk.length() < 3) continue;
                counter.put(tk, counter.getOrDefault(tk, 0) + 1);
            }
        }

        if (counter.isEmpty()) {
            return Map.of();
        }

        List<Map.Entry<String, Integer>> sorted = new ArrayList<>(counter.entrySet());
        sorted.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));

        List<Map<String, Object>> top = new ArrayList<>();
        for (int i = 0; i < sorted.size() && i < Math.max(1, topK); i++) {
            Map.Entry<String, Integer> e = sorted.get(i);
            top.add(Map.of("token", e.getKey(), "count", e.getValue()));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("topKeywords", top);
        out.put("uniqueKeywords", counter.size());
        return out;
    }

    private int estimateAttachmentChars(List<Map<String, Object>> attachments) {
        int total = 0;
        if (attachments == null) return total;
        for (Map<String, Object> item : attachments) {
            if (item == null) continue;
            total += str(item.get("textContent")).length();
        }
        return total;
    }

    private List<String> dedupeStrings(List<String> values, int limit) {
        List<String> out = new ArrayList<>();
        for (String value : values) {
            String v = String.valueOf(value == null ? "" : value).trim();
            if (v.isBlank()) continue;
            if (!out.contains(v)) {
                out.add(v);
                if (out.size() >= Math.max(1, limit)) break;
            }
        }
        return out;
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }
}
