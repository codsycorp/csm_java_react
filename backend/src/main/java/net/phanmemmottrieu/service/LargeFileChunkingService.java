package net.phanmemmottrieu.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Content-adaptive pipeline for oversized prompts (JSON, JS, config, text).
 *
 * Strategy (fully dynamic – no hardcoded schema or contextType assumptions):
 * 1. Detect actual content shape: JSON array / JSON object-with-array-value / code / plain text.
 * 2. Split along natural structural boundaries.
 * 3. Summarize each chunk with a generic introspective prompt.
 * 4. Aggregate chunk summaries into a condensed cloud context.
 *
 * When the local model is unavailable, a pure-Java heuristic extracts any
 * string-valued keys present in the content (no field names assumed).
 */
@Service
@ConditionalOnProperty(name = "ai.local.chunking.enabled", havingValue = "true")
public class LargeFileChunkingService {

    private static final Logger log = LoggerFactory.getLogger(LargeFileChunkingService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ai.local.chunking.threshold-chars:60000}")
    private int thresholdChars;

    @Value("${ai.local.chunking.chunk-size-chars:7000}")
    private int chunkSizeChars;

    @Value("${ai.local.chunking.max-chunks:20}")
    private int maxChunks;

    @Value("${ai.local.chunking.chunk-size-min-chars:1200}")
    private int chunkSizeMinChars;

    @Value("${ai.local.chunking.local-input-safety-ratio:0.68}")
    private double localInputSafetyRatio;

    @Value("${ai.local.chunking.local-prompt-overhead-tokens:260}")
    private int localPromptOverheadTokens;

    @Value("${ai.local.chunking.local-input-token-hard-cap:1800}")
    private int localInputTokenHardCap;

    @Value("${ai.local.chunking.local-chars-per-token-estimate:3}")
    private int localCharsPerTokenEstimate;

    @Value("${ai.local.chunking.capacity-retry-max-attempts:2}")
    private int capacityRetryMaxAttempts;

    @Value("${ai.local.chunking.capacity-retry-shrink-ratio:0.65}")
    private double capacityRetryShrinkRatio;

    @Value("${ai.local.chunking.capacity-retry-min-chars:900}")
    private int capacityRetryMinChars;

    @Value("${ai.local.llama.context-window:2048}")
    private int llamaContextWindow;

    @Value("${ai.local.llama.max-tokens:384}")
    private int llamaMaxTokens;

    @Value("${ai.local.chunking.output-budget-chars:5000}")
    private int outputBudgetChars;

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    private static final class ChunkSummaryResult {
        private final String summary;
        private final boolean disableLocalForRemaining;

        private ChunkSummaryResult(String summary, boolean disableLocalForRemaining) {
            this.summary = summary;
            this.disableLocalForRemaining = disableLocalForRemaining;
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Compress an oversized prompt via local chunked summarization.
     * Returns the original text unchanged when below threshold or local is unavailable.
     */
    public String compressLargePrompt(String prompt, String requestText, String contextType) {
        return compressLargePrompt(prompt, requestText, contextType, null);
    }

    /**
     * Same as {@link #compressLargePrompt(String, String, String)} but emits structured progress updates.
     */
    public String compressLargePrompt(
            String prompt,
            String requestText,
            String contextType,
            Consumer<Map<String, Object>> progressCallback) {
        String text = prompt == null ? "" : prompt.trim();
        if (text.length() <= thresholdChars) {
            return text;
        }
        if (llamaCppNativeService == null || !llamaCppNativeService.isAvailable()) {
            log.warn("[CHUNKING] Local model unavailable – heuristic fallback for {} chars", text.length());
            emitProgress(progressCallback,
                "phase", "fallback_heuristic",
                "reason", "local_unavailable",
                "inputChars", text.length(),
                "elapsedMs", 0L);
            return buildHeuristicHeader(text, requestText, contextType);
        }

        ContentShape shape = detectShape(text);
        int effectiveChunkSize = resolveEffectiveChunkSizeChars();
        log.info("[CHUNKING] {} chars, shape={}, contextType={} – starting Map-Reduce",
                text.length(), shape, contextType);

        List<String> chunks = splitByShape(text, shape, effectiveChunkSize);
        int active = Math.min(chunks.size(), maxChunks);
        long startedAt = System.currentTimeMillis();

        int estimatedTotalSecs = estimateChunkingTotalSecs(text.length(), active);
        emitProgress(progressCallback,
            "phase", "start",
            "shape", String.valueOf(shape),
            "inputChars", text.length(),
            "totalChunks", active,
            "estimatedTotalSecs", estimatedTotalSecs,
            "elapsedMs", 0L,
            "remainingSecs", estimatedTotalSecs,
            "percent", 8);

        List<String> summaries = new ArrayList<>();
        boolean disableLocalForRemaining = false;
        for (int i = 0; i < active; i++) {
            int current = i + 1;
            long chunkStartedAt = System.currentTimeMillis();
            long elapsedBeforeChunkMs = Math.max(0L, chunkStartedAt - startedAt);
            long remainingBeforeChunkSecs = estimateRemainingSecs(elapsedBeforeChunkMs, current - 1, active, estimatedTotalSecs);
            emitProgress(progressCallback,
                "phase", "chunk_start",
                "shape", String.valueOf(shape),
                "current", current,
                "total", active,
                "mode", disableLocalForRemaining ? "heuristic" : "local",
                "chunkChars", chunks.get(i) == null ? 0 : chunks.get(i).length(),
                "elapsedMs", elapsedBeforeChunkMs,
                "remainingSecs", remainingBeforeChunkSecs,
                "estimatedTotalSecs", estimatedTotalSecs,
                "percent", mapChunkPercent(current, active, false));

            ChunkSummaryResult summaryResult = disableLocalForRemaining
                ? summarizeChunkHeuristicOnly(i + 1, chunks.size(), chunks.get(i), shape, effectiveChunkSize)
                : summarizeChunk(i + 1, chunks.size(), chunks.get(i), shape, effectiveChunkSize);
            if (summaryResult.summary != null && !summaryResult.summary.isBlank()) {
                summaries.add(summaryResult.summary);
            }

            long chunkElapsedMs = Math.max(0L, System.currentTimeMillis() - chunkStartedAt);
            long elapsedAfterChunkMs = Math.max(0L, System.currentTimeMillis() - startedAt);
            long remainingAfterChunkSecs = estimateRemainingSecs(elapsedAfterChunkMs, current, active, estimatedTotalSecs);
            emitProgress(progressCallback,
                "phase", "chunk_done",
                "shape", String.valueOf(shape),
                "current", current,
                "total", active,
                "mode", disableLocalForRemaining ? "heuristic" : "local",
                "chunkElapsedMs", chunkElapsedMs,
                "elapsedMs", elapsedAfterChunkMs,
                "remainingSecs", remainingAfterChunkSecs,
                "estimatedTotalSecs", estimatedTotalSecs,
                "summaryChars", summaryResult.summary == null ? 0 : summaryResult.summary.length(),
                "percent", mapChunkPercent(current, active, true));

            if (summaryResult.disableLocalForRemaining && !disableLocalForRemaining) {
                disableLocalForRemaining = true;
                log.warn("[CHUNKING] Local llama capacity failure detected at chunk {}/{}; switching remaining chunks to heuristic mode",
                    i + 1, active);
                emitProgress(progressCallback,
                    "phase", "switch_heuristic",
                    "current", current,
                    "total", active,
                    "elapsedMs", elapsedAfterChunkMs,
                    "reason", "local_capacity_like_error");
            }
        }

        if (summaries.isEmpty()) {
            log.warn("[CHUNKING] All summaries empty – heuristic fallback");
            emitProgress(progressCallback,
                "phase", "fallback_heuristic",
                "reason", "all_summaries_empty",
                "elapsedMs", Math.max(0L, System.currentTimeMillis() - startedAt),
                "inputChars", text.length());
            return buildHeuristicHeader(text, requestText, contextType);
        }

        log.info("[CHUNKING] {}/{} chunks summarized → aggregating", summaries.size(), chunks.size());
        long beforeAggregateMs = Math.max(0L, System.currentTimeMillis() - startedAt);
        emitProgress(progressCallback,
            "phase", "aggregate_start",
            "summaryCount", summaries.size(),
            "totalChunks", active,
            "elapsedMs", beforeAggregateMs,
            "remainingSecs", Math.max(1L, estimateRemainingSecs(beforeAggregateMs, active, active, estimatedTotalSecs)),
            "percent", 28);

        String aggregated = aggregateSummaries(summaries, requestText, contextType, chunks.size(), effectiveChunkSize);

        long totalElapsedMs = Math.max(0L, System.currentTimeMillis() - startedAt);
        emitProgress(progressCallback,
            "phase", "done",
            "totalChunks", active,
            "outputChars", aggregated == null ? 0 : aggregated.length(),
            "elapsedMs", totalElapsedMs,
            "remainingSecs", 0,
            "percent", 32);
        return aggregated;
    }

    private void emitProgress(Consumer<Map<String, Object>> callback, Object... keyValues) {
        if (callback == null || keyValues == null || keyValues.length == 0) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            for (int i = 0; i + 1 < keyValues.length; i += 2) {
                payload.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
            }
            callback.accept(payload);
        } catch (Exception ignored) {
            // Progress callbacks are best-effort and must not break chunking.
        }
    }

    private int estimateChunkingTotalSecs(int chars, int chunks) {
        int safeChars = Math.max(1, chars);
        int safeChunks = Math.max(1, chunks);
        int byChunks = 4 + (safeChunks * 2);
        int byChars = 4 + (safeChars / 12000);
        return Math.max(8, Math.min(360, Math.max(byChunks, byChars)));
    }

    private long estimateRemainingSecs(long elapsedMs, int completedChunks, int totalChunks, int baselineSecs) {
        int safeTotal = Math.max(1, totalChunks);
        int safeDone = Math.max(0, Math.min(completedChunks, safeTotal));
        if (safeDone <= 0) {
            return Math.max(1, baselineSecs);
        }
        double avgPerChunkMs = elapsedMs / (double) safeDone;
        int remainingChunks = Math.max(0, safeTotal - safeDone);
        long estimatedChunksMs = Math.round(avgPerChunkMs * remainingChunks);
        long aggregateReserveMs = Math.max(2000L, Math.round(avgPerChunkMs * 0.8d));
        long remainingMs = Math.max(0L, estimatedChunksMs + aggregateReserveMs);
        return Math.max(0L, Math.min(360L, Math.round(remainingMs / 1000.0d)));
    }

    private int mapChunkPercent(int current, int total, boolean done) {
        int safeTotal = Math.max(1, total);
        int safeCurrent = Math.max(1, Math.min(current, safeTotal));
        int base = 10;
        int span = 16;
        double ratio = done ? (safeCurrent / (double) safeTotal) : ((safeCurrent - 1) / (double) safeTotal);
        return Math.max(base, Math.min(base + span, base + (int) Math.round(span * ratio)));
    }

    // ── Content-shape detection ───────────────────────────────────────────────

    enum ContentShape { JSON_ARRAY, JSON_OBJECT_WITH_ARRAY, JSON_OBJECT, CODE, TEXT }

    /**
     * Inspect the first ~400 chars to determine the dominant structural shape.
     * No assumptions about field names or domain semantics.
     */
    private ContentShape detectShape(String t) {
        String head = t.substring(0, Math.min(t.length(), 400)).stripLeading();
        if (head.startsWith("[")) return ContentShape.JSON_ARRAY;
        if (head.startsWith("{")) {
            // Check whether the object has at least one array-valued top-level key
            // by looking for the pattern   "key" : [   within the first 600 chars
            String scan = t.substring(0, Math.min(t.length(), 600));
            if (Pattern.compile("\"[^\"]+\"\\s*:\\s*\\[").matcher(scan).find()) {
                return ContentShape.JSON_OBJECT_WITH_ARRAY;
            }
            return ContentShape.JSON_OBJECT;
        }
        // Simple heuristic for code files
        if (head.contains("function ") || head.contains("class ") || head.contains("import ")
                || head.contains("export ") || head.contains("var ") || head.contains("const ")) {
            return ContentShape.CODE;
        }
        return ContentShape.TEXT;
    }

    // ── Splitting ─────────────────────────────────────────────────────────────

    private List<String> splitByShape(String content, ContentShape shape, int effectiveChunkSize) {
        String t = content.trim();
        switch (shape) {
            case JSON_ARRAY: {
                List<String> items = splitJsonArrayTopLevel(t);
                if (items.size() > 1) return groupItemsIntoChunks(items, effectiveChunkSize);
                break;
            }
            case JSON_OBJECT_WITH_ARRAY: {
                // Unwrap the first array-valued key generically
                List<String> items = unwrapFirstArrayValue(t);
                if (items.size() > 1) return groupItemsIntoChunks(items, effectiveChunkSize);
                // Fallback: split as plain object pairs
                List<String> pairs = splitJsonObjectTopLevel(t);
                if (pairs.size() > 1) return groupItemsIntoChunks(pairs, effectiveChunkSize);
                break;
            }
            case JSON_OBJECT: {
                List<String> pairs = splitJsonObjectTopLevel(t);
                if (pairs.size() > 1) return groupItemsIntoChunks(pairs, effectiveChunkSize);
                break;
            }
            default:
                break;
        }
        return splitByLinesWithBoundaries(content, shape, effectiveChunkSize);
    }

    /**
     * Generic unwrap: find the first top-level key whose value is an array,
     * then split that array's items. Works for any field name, not just "menu".
     */
    private List<String> unwrapFirstArrayValue(String json) {
        // Locate first occurrence of  "anyKey": [
        Matcher m = Pattern.compile("\"[^\"]+\"\\s*:\\s*\\[").matcher(json);
        if (!m.find()) return List.of(json);
        int arrayStart = json.indexOf('[', m.start());
        int arrayEnd = json.lastIndexOf(']');
        if (arrayEnd <= arrayStart) return List.of(json);
        String arrayContent = json.substring(arrayStart, arrayEnd + 1);
        List<String> items = splitJsonArrayTopLevel(arrayContent);
        return items.size() > 1 ? items : List.of(json);
    }

    /**
     * Extract top-level items from a JSON array string.
     * Uses depth counting – no full JSON parse needed.
     */
    private List<String> splitJsonArrayTopLevel(String json) {
        List<String> items = new ArrayList<>();
        int depth = 0;
        int start = -1;
        boolean inString = false;
        char prev = 0;

        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (inString) {
                if (c == '"' && prev != '\\') inString = false;
                prev = c;
                continue;
            }
            if (c == '"') { inString = true; prev = c; continue; }

            if (c == '[' || c == '{') {
                if (depth == 0 && c == '[') { start = i + 1; }
                depth++;
            } else if (c == ']' || c == '}') {
                depth--;
                if (depth == 0 && start >= 0) {
                    items.add(json.substring(start, i).trim());
                }
            } else if (c == ',' && depth == 1 && start >= 0) {
                String item = json.substring(start, i).trim();
                if (!item.isBlank()) items.add(item);
                start = i + 1;
            }
            prev = c;
        }
        return items;
    }

    /**
     * Extract top-level key-value pairs from a JSON object string.
     */
    private List<String> splitJsonObjectTopLevel(String json) {
        List<String> pairs = new ArrayList<>();
        int depth = 0;
        int start = -1;
        boolean inString = false;
        char prev = 0;

        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (inString) {
                if (c == '"' && prev != '\\') inString = false;
                prev = c;
                continue;
            }
            if (c == '"') { inString = true; prev = c; continue; }

            if (c == '{') {
                depth++;
                if (depth == 1) start = i + 1;
            } else if (c == '}') {
                depth--;
                if (depth == 0 && start >= 0) {
                    String tail = json.substring(start, i).trim();
                    if (!tail.isBlank()) pairs.add(tail);
                }
            } else if (c == ',' && depth == 1 && start >= 0) {
                String pair = json.substring(start, i).trim();
                if (!pair.isBlank()) pairs.add(pair);
                start = i + 1;
            }
            prev = c;
        }
        return pairs;
    }

    /**
     * Group items into chunks not exceeding chunkSizeChars each.
     */
    private List<String> groupItemsIntoChunks(List<String> items, int effectiveChunkSize) {
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int safeChunkSize = Math.max(800, effectiveChunkSize);
        for (String item : items) {
            if (current.length() > 0 && current.length() + item.length() + 2 > safeChunkSize) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
            if (current.length() > 0) current.append(",\n");
            current.append(item);
        }
        if (current.length() > 0) chunks.add(current.toString().trim());
        return chunks;
    }

    /**
     * Line-based chunking. For code, prefers to split at structural declaration boundaries.
     * For plain text, splits purely by size.
     */
    private List<String> splitByLinesWithBoundaries(String content, ContentShape shape, int effectiveChunkSize) {
        boolean isCode = (shape == ContentShape.CODE);
        String[] lines = content.split("\n", -1);
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int safeChunkSize = Math.max(800, effectiveChunkSize);

        for (String line : lines) {
            boolean isBoundary = isCode && isCodeDeclarationBoundary(line);
            if (isBoundary && current.length() >= safeChunkSize / 2) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
            if (current.length() + line.length() + 1 > safeChunkSize && current.length() > 0) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
            current.append(line).append('\n');
        }
        if (current.length() > 0) chunks.add(current.toString().trim());
        return chunks.isEmpty() ? List.of(content) : chunks;
    }

    /**
     * Returns true when a line starts a new top-level code declaration.
     * Generic enough to cover JS/TS/Java/Python patterns without domain assumptions.
     */
    private boolean isCodeDeclarationBoundary(String line) {
        String t = line.stripLeading();
        return t.startsWith("function ")
            || t.startsWith("async function ")
            || t.startsWith("class ")
            || t.startsWith("public class ")
            || t.startsWith("private class ")
            || t.startsWith("export function ")
            || t.startsWith("export class ")
            || t.startsWith("export default ")
            || t.startsWith("export const ")
            || t.startsWith("def ")          // Python
            || t.startsWith("public ")       // Java methods
            || t.startsWith("private ")
            || t.startsWith("protected ");
    }

    // ── Summarization ─────────────────────────────────────────────────────────

    /**
     * Summarize one chunk using a generic introspective prompt.
     * The prompt does NOT assume any field names or schema – the model is asked
     * to describe what it actually finds in the content.
     */
    private ChunkSummaryResult summarizeChunk(int index, int total, String chunk, ContentShape shape, int effectiveChunkSize) {
        int safeChunkSize = Math.max(800, effectiveChunkSize);
        String originalChunk = chunk.length() > safeChunkSize
                ? chunk.substring(0, safeChunkSize) : chunk;
        String safeChunk = originalChunk;

        String shapeHint = switch (shape) {
            case JSON_ARRAY, JSON_OBJECT_WITH_ARRAY, JSON_OBJECT -> "JSON/config";
            case CODE -> "source code";
            default -> "text";
        };

        int maxAttempts = Math.max(1, capacityRetryMaxAttempts + 1);
        int minChars = Math.max(400, Math.min(safeChunkSize - 1, capacityRetryMinChars));
        double shrinkRatio = Math.max(0.35d, Math.min(0.9d, capacityRetryShrinkRatio));
        String lastErrorMessage = "";

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            String chunkFingerprint = shortDigest(safeChunk);
            String chunkAnchors = extractAnchors(safeChunk, shape);
            String chunkPrompt = buildChunkPrompt(index, total, shapeHint, chunkFingerprint, chunkAnchors, safeChunk);
            try {
                String raw = llamaCppNativeService.generateContent(chunkPrompt);
                if (isLocalProviderError(raw)) {
                    String message = extractLocalProviderErrorMessage(raw);
                    lastErrorMessage = message;
                    boolean capacityLike = isLocalCapacityLikeError(message);
                    if (capacityLike && attempt < maxAttempts && safeChunk.length() > minChars + 40) {
                        int nextLength = nextShrunkLength(safeChunk.length(), minChars, shrinkRatio);
                        log.warn("[CHUNKING] chunk {}/{} local capacity issue on attempt {}/{} ({} chars -> {} chars): {}",
                            index, total, attempt, maxAttempts, safeChunk.length(), nextLength, safeStr(message));
                        safeChunk = safeChunk.substring(0, nextLength);
                        continue;
                    }
                    String heuristic = heuristicExtract(safeChunk);
                    return new ChunkSummaryResult(
                        formatChunkSummary(index, total, chunkFingerprint, chunkAnchors, heuristic),
                        capacityLike
                    );
                }

                String result = extractResultText(raw);
                log.debug("[CHUNKING] chunk {}/{} summary len={} (attempt {}/{})", index, total,
                        result == null ? 0 : result.length(), attempt, maxAttempts);
                if (result == null || result.isBlank()) {
                    return new ChunkSummaryResult(formatChunkSummary(index, total, chunkFingerprint, chunkAnchors, ""), false);
                }
                return new ChunkSummaryResult(formatChunkSummary(index, total, chunkFingerprint, chunkAnchors, result), false);
            } catch (Exception ex) {
                lastErrorMessage = ex.getMessage();
                boolean capacityLike = isLocalCapacityLikeError(lastErrorMessage);
                if (capacityLike && attempt < maxAttempts && safeChunk.length() > minChars + 40) {
                    int nextLength = nextShrunkLength(safeChunk.length(), minChars, shrinkRatio);
                    log.warn("[CHUNKING] chunk {}/{} inference failed on attempt {}/{} ({} chars -> {} chars): {}",
                        index, total, attempt, maxAttempts, safeChunk.length(), nextLength, safeStr(lastErrorMessage));
                    safeChunk = safeChunk.substring(0, nextLength);
                    continue;
                }
                log.warn("[CHUNKING] chunk {}/{} inference failed: {}", index, total, ex.getMessage());
                String heuristic = heuristicExtract(safeChunk);
                return new ChunkSummaryResult(
                    formatChunkSummary(index, total, chunkFingerprint, chunkAnchors, heuristic),
                    capacityLike
                );
            }
        }

        String fallbackFingerprint = shortDigest(safeChunk);
        String fallbackAnchors = extractAnchors(safeChunk, shape);
        String fallbackHeuristic = heuristicExtract(safeChunk);
        return new ChunkSummaryResult(
            formatChunkSummary(index, total, fallbackFingerprint, fallbackAnchors, fallbackHeuristic),
            isLocalCapacityLikeError(lastErrorMessage)
        );
    }

    private ChunkSummaryResult summarizeChunkHeuristicOnly(int index, int total, String chunk, ContentShape shape, int effectiveChunkSize) {
        int safeChunkSize = Math.max(800, effectiveChunkSize);
        String safeChunk = chunk.length() > safeChunkSize
            ? chunk.substring(0, safeChunkSize) : chunk;
        String chunkFingerprint = shortDigest(safeChunk);
        String chunkAnchors = extractAnchors(safeChunk, shape);
        String heuristic = heuristicExtract(safeChunk);
        return new ChunkSummaryResult(
            formatChunkSummary(index, total, chunkFingerprint, chunkAnchors, heuristic),
            true
        );
    }

    private String buildChunkPrompt(
        int index,
        int total,
        String shapeHint,
        String chunkFingerprint,
        String chunkAnchors,
        String safeChunk
    ) {
        return "chunk=" + index + "/" + total + " type=" + shapeHint + "\n"
            + "chunkFingerprint=" + chunkFingerprint + "\n"
            + "chunkAnchors=" + chunkAnchors + "\n"
            + "Summarize this chunk concisely (max 8 lines).\n"
            + "For JSON/config: list identifiers, key names, and non-trivial values you see.\n"
            + "For code: list function/class names and their purpose.\n"
            + "Do not invent information. Output plain text only.\n"
            + "---\n"
            + safeChunk;
    }

    private String formatChunkSummary(int index, int total, String chunkFingerprint, String chunkAnchors, String body) {
        String header = "chunk=" + index + "/" + total + " fp=" + chunkFingerprint + " anchors=" + chunkAnchors;
        String safeBody = String.valueOf(body == null ? "" : body).trim();
        return safeBody.isBlank() ? header : header + "\n" + safeBody;
    }

    private int nextShrunkLength(int currentLength, int minChars, double shrinkRatio) {
        int next = (int) Math.floor(currentLength * shrinkRatio);
        if (next >= currentLength) {
            next = currentLength - Math.max(32, currentLength / 10);
        }
        return Math.max(minChars, Math.min(next, currentLength - 1));
    }

    /**
     * Pure-Java heuristic extraction when LLM is unavailable.
     * Scans for any pattern  "key": "short-value"  in the content – no field names assumed.
     * Also picks up function/class declarations from code.
     */
    private String heuristicExtract(String chunk) {
        StringBuilder sb = new StringBuilder();

        // JSON string-valued keys (short values ≤ 80 chars)
        Matcher kvMatcher = Pattern.compile("\"([^\"]{1,40})\"\\s*:\\s*\"([^\"]{1,80})\"").matcher(chunk);
        int kvCount = 0;
        while (kvMatcher.find() && kvCount < 20) {
            sb.append(kvMatcher.group(1)).append('=').append(kvMatcher.group(2)).append(' ');
            kvCount++;
        }

        // Code declarations
        Pattern declPat = Pattern.compile("(?m)^\\s*((?:async\\s+)?function\\s+\\w+|(?:export\\s+)?(?:const|let|var)\\s+\\w+|class\\s+\\w+|def\\s+\\w+|(?:public|private|protected)\\s+\\w+\\s+\\w+\\s*\\()");
        Matcher declMatcher = declPat.matcher(chunk);
        int declCount = 0;
        while (declMatcher.find() && declCount < 15) {
            sb.append(declMatcher.group(1).trim()).append("; ");
            declCount++;
        }

        return sb.toString().trim();
    }


    // ── Aggregation ───────────────────────────────────────────────────────────

    private String aggregateSummaries(List<String> summaries, String requestText, String contextType, int totalChunks, int effectiveChunkSize) {
        StringBuilder joined = new StringBuilder();
        for (int i = 0; i < summaries.size(); i++) {
            joined.append("=== CHUNK ").append(i + 1).append("/").append(totalChunks).append(" ===\n");
            joined.append(summaries.get(i)).append("\n\n");
        }

        // If joined is already small enough, return it directly
        if (joined.length() <= outputBudgetChars) {
            return buildAggregatedBlock(joined.toString(), requestText, contextType, totalChunks);
        }

        // Otherwise run one more local pass to reduce further
        String aggregateSource = joined.substring(0, Math.min(joined.length(), Math.max(2000, effectiveChunkSize * 2)));
        int maxAttempts = Math.max(1, capacityRetryMaxAttempts + 1);
        int minChars = Math.max(600, Math.min(aggregateSource.length(), capacityRetryMinChars));
        double shrinkRatio = Math.max(0.35d, Math.min(0.9d, capacityRetryShrinkRatio));
        String aggregateInput = aggregateSource;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            String aggregatePrompt = "[LOCAL_AGGREGATE] contextType=" + safeStr(contextType) + "\n"
                + "Create a single condensed technical overview (max " + (outputBudgetChars / 5 * 4) + " chars).\n"
                + "Preserve chunk anchors and identifiers exactly as given.\n"
                + "Include: main data structures, key functions, critical logic, identifiers.\n"
                + "Do not merge unrelated anchors.\n"
                + "---\n"
                + aggregateInput;

            try {
                String raw = llamaCppNativeService.generateContent(aggregatePrompt);
                if (isLocalProviderError(raw)) {
                    String message = extractLocalProviderErrorMessage(raw);
                    if (isLocalCapacityLikeError(message) && attempt < maxAttempts && aggregateInput.length() > minChars + 40) {
                        int nextLength = nextShrunkLength(aggregateInput.length(), minChars, shrinkRatio);
                        log.warn("[CHUNKING] aggregation capacity issue on attempt {}/{} ({} chars -> {} chars): {}",
                            attempt, maxAttempts, aggregateInput.length(), nextLength, safeStr(message));
                        aggregateInput = aggregateInput.substring(0, nextLength);
                        continue;
                    }
                    break;
                }

                String result = extractResultText(raw);
                if (result != null && !result.isBlank()) {
                    return buildAggregatedBlock(result, requestText, contextType, totalChunks);
                }
                break;
            } catch (Exception ex) {
                if (isLocalCapacityLikeError(ex.getMessage()) && attempt < maxAttempts && aggregateInput.length() > minChars + 40) {
                    int nextLength = nextShrunkLength(aggregateInput.length(), minChars, shrinkRatio);
                    log.warn("[CHUNKING] aggregation inference failed on attempt {}/{} ({} chars -> {} chars): {}",
                        attempt, maxAttempts, aggregateInput.length(), nextLength, safeStr(ex.getMessage()));
                    aggregateInput = aggregateInput.substring(0, nextLength);
                    continue;
                }
                log.warn("[CHUNKING] aggregation inference failed: {}", ex.getMessage());
                break;
            }
        }

        // Truncate joined to budget as fallback
        String truncated = joined.length() > outputBudgetChars
                ? joined.substring(0, outputBudgetChars) : joined.toString();
        return buildAggregatedBlock(truncated, requestText, contextType, totalChunks);
    }

    private String buildAggregatedBlock(String body, String requestText, String contextType, int totalChunks) {
        return "[LOCAL_CHUNKED_ANALYSIS]\n"
            + "totalChunks=" + totalChunks + " contextType=" + safeStr(contextType) + "\n"
            + (requestText != null && !requestText.isBlank()
                ? "request=" + requestText.replaceAll("\\s+", " ").substring(0, Math.min(requestText.length(), 300)) + "\n"
                : "")
            + body.trim();
    }

    private String buildHeuristicHeader(String text, String requestText, String contextType) {
        int headLen = Math.min(text.length(), chunkSizeChars);
        int tailLen = Math.min(text.length() - headLen, chunkSizeChars / 2);
        String head = text.substring(0, headLen);
        String tail = tailLen > 0 ? "\n...\n" + text.substring(text.length() - tailLen) : "";
        return "[LOCAL_HEURISTIC_LARGE]\n"
            + "totalChars=" + text.length() + " contextType=" + safeStr(contextType) + "\n"
            + (requestText != null && !requestText.isBlank()
                ? "request=" + requestText.replaceAll("\\s+", " ").substring(0, Math.min(requestText.length(), 200)) + "\n"
                : "")
            + head + tail;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private String extractResultText(String raw) {
        if (raw == null || raw.isBlank()) return "";
        try {
            Map<String, Object> map = objectMapper.readValue(raw.trim(), Map.class);
            Object result = map.get("result");
            if (result instanceof String s && !s.isBlank()) return s.trim();
            Object answer = map.get("answer");
            if (answer instanceof String a && !a.isBlank()) return a.trim();
        } catch (Exception ignored) {
            // raw is plain text
        }
        return raw.trim();
    }

    private String safeStr(String s) {
        return s == null ? "" : s;
    }

    @SuppressWarnings("unchecked")
    private boolean isLocalProviderError(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        try {
            Map<String, Object> map = objectMapper.readValue(raw.trim(), Map.class);
            Object success = map.get("success");
            return (success instanceof Boolean b) && !b;
        } catch (Exception ignored) {
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private String extractLocalProviderErrorMessage(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        try {
            Map<String, Object> map = objectMapper.readValue(raw.trim(), Map.class);
            Object message = map.get("message");
            if (message instanceof String s) {
                return s;
            }
            Object errorCode = map.get("errorCode");
            return errorCode instanceof String s ? s : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private boolean isLocalCapacityLikeError(String message) {
        String msg = String.valueOf(message == null ? "" : message).toLowerCase();
        if (msg.isBlank()) {
            return false;
        }
        return msg.contains("kv cache is full")
            || msg.contains("input prompt is too big")
            || msg.contains("gpu timeout")
            || msg.contains("kioaccelcommandbuffercallbackerrortimeout")
            || msg.contains("submissionsignored");
    }

    private String extractAnchors(String chunk, ContentShape shape) {
        List<String> anchors = new ArrayList<>();

        Matcher idLike = Pattern.compile("\"([^\"]{1,40}(?:id|code|key|name|label|icon)[^\"]{0,20})\"\\s*:\\s*\"([^\"]{1,80})\"", Pattern.CASE_INSENSITIVE).matcher(chunk);
        while (idLike.find() && anchors.size() < 8) {
            anchors.add(idLike.group(1) + "=" + idLike.group(2));
        }

        if (shape == ContentShape.CODE) {
            Matcher decl = Pattern.compile("(?m)^\\s*(?:export\\s+)?(?:async\\s+)?(?:function|class|const|let|var)\\s+([A-Za-z0-9_]+)").matcher(chunk);
            while (decl.find() && anchors.size() < 12) {
                anchors.add("decl=" + decl.group(1));
            }
        }

        if (anchors.isEmpty()) {
            Matcher anyKey = Pattern.compile("\"([^\"]{1,40})\"\\s*:").matcher(chunk);
            while (anyKey.find() && anchors.size() < 6) {
                anchors.add("key=" + anyKey.group(1));
            }
        }

        return String.join(",", anchors);
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

    private int resolveEffectiveChunkSizeChars() {
        int configuredMax = Math.max(1200, chunkSizeChars);
        int configuredMin = Math.max(800, Math.min(configuredMax, chunkSizeMinChars));
        int context = Math.max(1024, llamaContextWindow);
        int reservedOutput = Math.max(128, llamaMaxTokens);
        int safeByRatio = (int) Math.floor(context * Math.max(0.45d, Math.min(0.9d, localInputSafetyRatio)));
        int safeByWindow = Math.max(256, context - reservedOutput - 192);
        int tokenBudget = Math.max(256, Math.min(Math.max(512, localInputTokenHardCap), Math.min(safeByRatio, safeByWindow)));
        int availableForChunkTokens = Math.max(180, tokenBudget - Math.max(120, localPromptOverheadTokens));
        int charsPerToken = Math.max(2, Math.min(5, localCharsPerTokenEstimate));
        int dynamicChars = Math.max(configuredMin, availableForChunkTokens * charsPerToken);
        return Math.max(configuredMin, Math.min(configuredMax, dynamicChars));
    }
}
