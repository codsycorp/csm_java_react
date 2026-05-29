package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.KnnFloatVectorField;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.VectorSimilarityFunction;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.KnnFloatVectorQuery;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.ByteBuffersDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiCodeLearningMemoryService {

    private static final Logger log = LoggerFactory.getLogger(AiCodeLearningMemoryService.class);
    private static final int SUMMARY_MAX_CHARS = 6000;
    private static final Pattern SYMBOL_HINT_PATTERN = Pattern.compile(
        "\\b([A-Z][A-Za-z0-9_]{2,}|[a-z][A-Za-z0-9_]{3,}(?:Service|Controller|Handler|Component|Module|Utils?))\\b");

    private final AiLocalEmbeddingService aiLocalEmbeddingService;

    @Value("${ai.code.learning.enabled:true}")
    private boolean enabled;

    @Value("${ai.context.dir:csm_datas/ai_local}")
    private String contextDir;

    @Value("${ai.code.learning.max-entries-per-app:240}")
    private int maxEntriesPerApp;

    @Value("${ai.code.learning.retrieve-max-items:4}")
    private int retrieveMaxItems;

    @Value("${ai.code.learning.retrieve-max-chars:10000}")
    private int retrieveMaxChars;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ConcurrentHashMap<String, Object> appLocks = new ConcurrentHashMap<>();

    @Autowired
    public AiCodeLearningMemoryService(AiLocalEmbeddingService aiLocalEmbeddingService) {
        this.aiLocalEmbeddingService = aiLocalEmbeddingService;
    }

    private record LearningEntry(
        String id,
        long createdAtMs,
        String requestText,
        String summary,
        String contextType,
        String targetFile,
        int patchOpCount,
        String digest
    ) {}

    public String buildLearningContextBlock(String appId, String requestText) {
        if (!enabled || appId == null || appId.isBlank()) {
            return "";
        }

        List<LearningEntry> entries = loadEntries(appId);
        if (entries.isEmpty()) {
            return "";
        }

        int safeMaxItems = Math.max(1, retrieveMaxItems);
        int safeMaxChars = Math.max(1200, retrieveMaxChars);
        float[] queryVector = embedQueryText(String.valueOf(requestText == null ? "" : requestText));
        List<String> blocks = new ArrayList<>();

        try (ByteBuffersDirectory directory = new ByteBuffersDirectory()) {
            IndexWriterConfig config = new IndexWriterConfig();
            try (IndexWriter writer = new IndexWriter(directory, config)) {
                for (LearningEntry entry : entries) {
                    String content = buildSearchContent(entry);
                    if (content.isBlank()) {
                        continue;
                    }
                    Document doc = new Document();
                    doc.add(new StoredField("id", entry.id()));
                    doc.add(new StoredField("requestText", truncate(entry.requestText(), 360)));
                    doc.add(new StoredField("summary", truncate(entry.summary(), SUMMARY_MAX_CHARS)));
                    doc.add(new StoredField("contextType", String.valueOf(entry.contextType() == null ? "" : entry.contextType())));
                    doc.add(new StoredField("targetFile", truncate(String.valueOf(entry.targetFile() == null ? "" : entry.targetFile()), 240)));
                    doc.add(new StoredField("patchOpCount", entry.patchOpCount()));
                    doc.add(new TextField("content", content, org.apache.lucene.document.Field.Store.NO));
                    doc.add(new KnnFloatVectorField("vector", embedDocumentText(content), VectorSimilarityFunction.COSINE));
                    writer.addDocument(doc);
                }
                writer.commit();
            }

            try (DirectoryReader reader = DirectoryReader.open(directory)) {
                IndexSearcher searcher = new IndexSearcher(reader);
                TopDocs topDocs = searcher.search(
                    new KnnFloatVectorQuery("vector", queryVector, Math.max(safeMaxItems * 2, safeMaxItems)),
                    Math.max(safeMaxItems * 2, safeMaxItems));
                Set<String> seen = new LinkedHashSet<>();
                int totalChars = 0;
                for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
                    Document doc = searcher.storedFields().document(scoreDoc.doc);
                    String id = doc.get("id");
                    if (id == null || !seen.add(id)) {
                        continue;
                    }
                    String requestSnippet = String.valueOf(doc.get("requestText") == null ? "" : doc.get("requestText")).trim();
                    String summary = String.valueOf(doc.get("summary") == null ? "" : doc.get("summary")).trim();
                    String contextType = String.valueOf(doc.get("contextType") == null ? "" : doc.get("contextType")).trim();
                    String targetFile = String.valueOf(doc.get("targetFile") == null ? "" : doc.get("targetFile")).trim();
                    int patchOps = toInt(doc.get("patchOpCount"));
                    if (summary.isBlank()) {
                        continue;
                    }
                    StringBuilder block = new StringBuilder();
                    block.append("### Prior successful code edit (score ")
                        .append(String.format(java.util.Locale.ROOT, "%.3f", scoreDoc.score))
                        .append(")\n");
                    if (!contextType.isBlank()) {
                        block.append("contextType: ").append(contextType).append("\n");
                    }
                    if (!targetFile.isBlank()) {
                        block.append("target: ").append(targetFile).append("\n");
                    }
                    if (patchOps > 0) {
                        block.append("patchOps: ").append(patchOps).append("\n");
                    }
                    if (!requestSnippet.isBlank()) {
                        block.append("request: ").append(requestSnippet).append("\n");
                    }
                    block.append(summary);
                    String rendered = block.toString().trim();
                    if (rendered.isBlank()) {
                        continue;
                    }
                    if (totalChars + rendered.length() > safeMaxChars) {
                        break;
                    }
                    blocks.add(rendered);
                    totalChars += rendered.length();
                    if (blocks.size() >= safeMaxItems) {
                        break;
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Code learning retrieval failed for appId={}: {}", appId, ex.getMessage());
            return "";
        }

        if (blocks.isEmpty()) {
            return "";
        }

        return "## AUTO-LEARNED CODE FIXES (LUCENE VECTOR MEMORY)\n"
            + "Use these app-scoped, previously successful code edits as correction memory.\n"
            + "Prioritize repeated surgical patterns when they match the current request.\n\n"
            + String.join("\n\n", blocks);
    }

    public void recordSuccessfulCodeEdit(
        String appId,
        String requestText,
        String contextType,
        String targetFile,
        int patchOpCount,
        String assistantSummary,
        String rawResponse
    ) {
        if (!enabled || appId == null || appId.isBlank()) {
            return;
        }
        if (patchOpCount <= 0 && isBlank(assistantSummary) && isBlank(rawResponse)) {
            return;
        }

        LearningEntry next = buildLearningEntry(
            requestText,
            contextType,
            targetFile,
            patchOpCount,
            assistantSummary,
            rawResponse);
        if (next == null) {
            return;
        }

        Object lock = appLocks.computeIfAbsent(appId, key -> new Object());
        synchronized (lock) {
            try {
                List<LearningEntry> entries = loadEntries(appId);
                boolean duplicated = entries.stream().anyMatch(entry -> entry.digest().equals(next.digest()));
                if (duplicated) {
                    return;
                }
                entries.add(next);
                int limit = Math.max(20, maxEntriesPerApp);
                if (entries.size() > limit) {
                    entries = new ArrayList<>(entries.subList(entries.size() - limit, entries.size()));
                }
                writeEntries(appId, entries);
            } catch (Exception ex) {
                log.warn("Could not persist code learning memory for appId={}: {}", appId, ex.getMessage());
            }
        }
    }

    private LearningEntry buildLearningEntry(
        String requestText,
        String contextType,
        String targetFile,
        int patchOpCount,
        String assistantSummary,
        String rawResponse
    ) {
        String summary = summarizeCodeLearning(
            requestText,
            contextType,
            targetFile,
            patchOpCount,
            assistantSummary,
            rawResponse);
        if (summary.isBlank()) {
            return null;
        }
        String normalizedRequest = String.valueOf(requestText == null ? "" : requestText).trim();
        String normalizedContext = String.valueOf(contextType == null ? "" : contextType).trim();
        String normalizedTarget = String.valueOf(targetFile == null ? "" : targetFile).trim();
        String digest = sha256(normalizedRequest + "\n" + normalizedContext + "\n" + normalizedTarget + "\n" + summary);
        return new LearningEntry(
            "codelearn-" + digest.substring(0, 12),
            Instant.now().toEpochMilli(),
            truncate(normalizedRequest, 600),
            summary,
            normalizedContext,
            truncate(normalizedTarget, 240),
            Math.max(0, patchOpCount),
            digest);
    }

    private String summarizeCodeLearning(
        String requestText,
        String contextType,
        String targetFile,
        int patchOpCount,
        String assistantSummary,
        String rawResponse
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("Critical rules:\n");
        sb.append("- Preserve surgical edit scope; do not rewrite unrelated modules.\n");
        sb.append("- Match existing naming, imports, and framework patterns in the target file.\n");
        sb.append("- Prefer minimal diff over full-file replacement unless explicitly requested.\n");
        if (!isBlank(contextType)) {
            sb.append("- Context type: ").append(contextType.trim()).append("\n");
        }
        if (!isBlank(targetFile)) {
            sb.append("- Target file/symbol: ").append(targetFile.trim()).append("\n");
        }
        if (patchOpCount > 0) {
            sb.append("- Accepted patch operations: ").append(patchOpCount).append("\n");
        }

        LinkedHashSet<String> symbols = extractSymbolHints(requestText, assistantSummary, rawResponse);
        appendSection(sb, "Symbols/patterns touched", symbols, 14);

        String excerpt = truncate(firstNonBlank(assistantSummary, extractOutcomeExcerpt(rawResponse)), 1400);
        if (!excerpt.isBlank()) {
            sb.append("\nAccepted outcome excerpt:\n").append(excerpt).append("\n");
        }

        return truncate(sb.toString().trim(), SUMMARY_MAX_CHARS);
    }

    private LinkedHashSet<String> extractSymbolHints(String requestText, String assistantSummary, String rawResponse) {
        LinkedHashSet<String> symbols = new LinkedHashSet<>();
        collectSymbolHints(symbols, requestText, 8);
        collectSymbolHints(symbols, assistantSummary, 8);
        collectSymbolHints(symbols, rawResponse, 6);
        return symbols;
    }

    private void collectSymbolHints(Set<String> symbols, String text, int maxItems) {
        if (isBlank(text) || symbols.size() >= maxItems) {
            return;
        }
        Matcher matcher = SYMBOL_HINT_PATTERN.matcher(String.valueOf(text));
        while (matcher.find() && symbols.size() < maxItems) {
            String candidate = matcher.group(1);
            if (candidate == null || candidate.length() < 4) {
                continue;
            }
            if (isNoiseSymbol(candidate)) {
                continue;
            }
            symbols.add(candidate);
        }
    }

    private boolean isNoiseSymbol(String candidate) {
        String lower = candidate.toLowerCase(java.util.Locale.ROOT);
        return lower.equals("true")
            || lower.equals("false")
            || lower.equals("null")
            || lower.equals("string")
            || lower.equals("object")
            || lower.equals("request")
            || lower.equals("response")
            || lower.equals("message")
            || lower.equals("status")
            || lower.equals("success");
    }

    private String extractOutcomeExcerpt(String rawResponse) {
        String normalized = String.valueOf(rawResponse == null ? "" : rawResponse).trim();
        if (normalized.isBlank()) {
            return "";
        }
        int jsonStart = normalized.indexOf('{');
        if (jsonStart >= 0 && jsonStart < 80) {
            normalized = normalized.substring(jsonStart);
        }
        return normalized;
    }

    private void appendSection(StringBuilder sb, String heading, Set<String> values, int maxItems) {
        if (values == null || values.isEmpty()) {
            return;
        }
        sb.append("\n").append(heading).append(":\n");
        int count = 0;
        for (String value : values) {
            if (count++ >= maxItems) {
                break;
            }
            sb.append("- ").append(value).append("\n");
        }
    }

    private List<LearningEntry> loadEntries(String appId) {
        Path file = getLearningFile(appId);
        if (!Files.exists(file)) {
            return new ArrayList<>();
        }

        try {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            List<LearningEntry> entries = new ArrayList<>();
            for (String line : lines) {
                String raw = String.valueOf(line == null ? "" : line).trim();
                if (raw.isBlank()) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> json = objectMapper.readValue(raw, Map.class);
                String id = String.valueOf(json.getOrDefault("id", "")).trim();
                String requestText = String.valueOf(json.getOrDefault("requestText", "")).trim();
                String summary = String.valueOf(json.getOrDefault("summary", "")).trim();
                String digest = String.valueOf(json.getOrDefault("digest", "")).trim();
                String contextType = String.valueOf(json.getOrDefault("contextType", "")).trim();
                String targetFile = String.valueOf(json.getOrDefault("targetFile", "")).trim();
                long createdAtMs = toLong(json.get("createdAtMs"));
                int patchOpCount = toInt(json.get("patchOpCount"));
                if (!id.isBlank() && !summary.isBlank()) {
                    entries.add(new LearningEntry(
                        id,
                        createdAtMs,
                        requestText,
                        summary,
                        contextType,
                        targetFile,
                        patchOpCount,
                        digest));
                }
            }
            return entries;
        } catch (Exception ex) {
            log.warn("Could not read code learning file for appId={}: {}", appId, ex.getMessage());
            return new ArrayList<>();
        }
    }

    private void writeEntries(String appId, List<LearningEntry> entries) throws IOException {
        Path file = getLearningFile(appId);
        Files.createDirectories(file.getParent());
        List<String> lines = new ArrayList<>();
        for (LearningEntry entry : entries) {
            lines.add(objectMapper.writeValueAsString(Map.of(
                "id", entry.id(),
                "createdAtMs", entry.createdAtMs(),
                "requestText", entry.requestText(),
                "summary", entry.summary(),
                "contextType", entry.contextType() == null ? "" : entry.contextType(),
                "targetFile", entry.targetFile() == null ? "" : entry.targetFile(),
                "patchOpCount", entry.patchOpCount(),
                "digest", entry.digest()
            )));
        }
        Files.write(file, lines, StandardCharsets.UTF_8);
    }

    private Path getLearningFile(String appId) {
        String safe = String.valueOf(appId == null ? "" : appId).replaceAll("[^a-zA-Z0-9_\\-]", "_");
        return Paths.get(contextDir, "ai_code_learning_" + safe + ".jsonl");
    }

    private String buildSearchContent(LearningEntry entry) {
        return (String.valueOf(entry.requestText() == null ? "" : entry.requestText()).trim()
            + "\n"
            + String.valueOf(entry.contextType() == null ? "" : entry.contextType()).trim()
            + "\n"
            + String.valueOf(entry.targetFile() == null ? "" : entry.targetFile()).trim()
            + "\n"
            + String.valueOf(entry.summary() == null ? "" : entry.summary()).trim()).trim();
    }

    private float[] embedQueryText(String text) {
        return aiLocalEmbeddingService.embedQueryText(text);
    }

    private float[] embedDocumentText(String text) {
        return aiLocalEmbeddingService.embedDocumentText(text);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String text = String.valueOf(value == null ? "" : value).trim();
            if (!text.isBlank() && !"null".equalsIgnoreCase(text)) {
                return text;
            }
        }
        return "";
    }

    private boolean isBlank(String text) {
        return String.valueOf(text == null ? "" : text).trim().isBlank();
    }

    private long toLong(Object raw) {
        if (raw instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw == null ? "0" : raw).trim());
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private int toInt(Object raw) {
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw == null ? "0" : raw).trim());
        } catch (Exception ignored) {
            return 0;
        }
    }

    private String truncate(String text, int maxChars) {
        String normalized = String.valueOf(text == null ? "" : text).trim();
        if (normalized.length() <= maxChars) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxChars)) + "...[truncated]";
    }

    private String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(String.valueOf(text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } catch (Exception ignored) {
            return Long.toHexString(System.nanoTime());
        }
    }
}
