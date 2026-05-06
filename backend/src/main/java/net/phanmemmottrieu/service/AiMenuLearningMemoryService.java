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
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiMenuLearningMemoryService {

    private static final Logger log = LoggerFactory.getLogger(AiMenuLearningMemoryService.class);
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_]{2,}");
    private static final int VECTOR_DIMS = 128;
    private static final int SUMMARY_MAX_CHARS = 6000;

    @Value("${ai.menu.learning.enabled:true}")
    private boolean enabled;

    @Value("${ai.context.dir:csm_datas/ai_local}")
    private String contextDir;

    @Value("${ai.menu.learning.max-entries-per-app:240}")
    private int maxEntriesPerApp;

    @Value("${ai.menu.learning.retrieve-max-items:4}")
    private int retrieveMaxItems;

    @Value("${ai.menu.learning.retrieve-max-chars:12000}")
    private int retrieveMaxChars;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ConcurrentHashMap<String, Object> appLocks = new ConcurrentHashMap<>();

    private record LearningEntry(
        String id,
        long createdAtMs,
        String requestText,
        String summary,
        int menuCount,
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
        float[] queryVector = embedText(String.valueOf(requestText == null ? "" : requestText));
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
                    doc.add(new StoredField("menuCount", entry.menuCount()));
                    doc.add(new TextField("content", content, org.apache.lucene.document.Field.Store.NO));
                    doc.add(new KnnFloatVectorField("vector", embedText(content), VectorSimilarityFunction.COSINE));
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
                    Document hit = searcher.storedFields().document(scoreDoc.doc);
                    String id = String.valueOf(hit.get("id") == null ? "" : hit.get("id")).trim();
                    if (id.isBlank() || !seen.add(id)) {
                        continue;
                    }
                    String request = String.valueOf(hit.get("requestText") == null ? "" : hit.get("requestText")).trim();
                    String summary = String.valueOf(hit.get("summary") == null ? "" : hit.get("summary")).trim();
                    if (summary.isBlank()) {
                        continue;
                    }
                    String item = "### Learned menu fix\n"
                        + "Request: " + request + "\n"
                        + "Known-good result summary:\n" + summary;
                    if (totalChars + item.length() > safeMaxChars && !blocks.isEmpty()) {
                        break;
                    }
                    blocks.add(item);
                    totalChars += item.length();
                    if (blocks.size() >= safeMaxItems) {
                        break;
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Could not build menu learning context for appId={}: {}", appId, ex.getMessage());
            return "";
        }

        if (blocks.isEmpty()) {
            return "";
        }

        return "## AUTO-LEARNED MENU FIXES (LUCENE VECTOR MEMORY)\n"
            + "Use these app-scoped, previously successful menu outputs as correction memory.\n"
            + "Prioritize repeated structural/icon patterns when they match the current request.\n\n"
            + String.join("\n\n", blocks);
    }

    public void recordSuccessfulMenuGeneration(String appId, String requestText, String resultJson) {
        if (!enabled || appId == null || appId.isBlank() || resultJson == null || resultJson.isBlank()) {
            return;
        }

        LearningEntry next = buildLearningEntry(requestText, resultJson);
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
                log.warn("Could not persist menu learning memory for appId={}: {}", appId, ex.getMessage());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private LearningEntry buildLearningEntry(String requestText, String resultJson) {
        try {
            Map<String, Object> wrapper = objectMapper.readValue(resultJson, Map.class);
            Object data = wrapper.getOrDefault("data", wrapper.get("result"));
            Map<String, Object> payload = data instanceof Map ? (Map<String, Object>) data : wrapper;
            Object menuObj = payload.get("menu");
            if (!(menuObj instanceof List<?> menus) || menus.isEmpty()) {
                return null;
            }

            String summary = summarizeMenuLearning(menus, payload);
            if (summary.isBlank()) {
                return null;
            }
            String normalizedRequest = String.valueOf(requestText == null ? "" : requestText).trim();
            String digest = sha256(normalizedRequest + "\n" + summary);
            return new LearningEntry(
                "menulearn-" + digest.substring(0, 12),
                Instant.now().toEpochMilli(),
                truncate(normalizedRequest, 600),
                summary,
                menus.size(),
                digest);
        } catch (Exception ex) {
            log.debug("Skip menu learning entry because result parsing failed: {}", ex.getMessage());
            return null;
        }
    }

    private String summarizeMenuLearning(List<?> menus, Map<String, Object> payload) {
        LinkedHashSet<String> roots = new LinkedHashSet<>();
        LinkedHashSet<String> relations = new LinkedHashSet<>();
        LinkedHashSet<String> icons = new LinkedHashSet<>();
        LinkedHashSet<String> runtime = new LinkedHashSet<>();

        for (Object menu : menus) {
            collectMenuSignals(menu, null, roots, relations, icons, runtime);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Critical rules:\n");
        sb.append("- Emit m_icon with Ant Design icon names; do not emit legacy m_icons in fresh output.\n");
        sb.append("- Preserve nested children and stable parentId/menu_id linkage; do not flatten child menus to root.\n");
        sb.append("- Keep existing valid m_icon unchanged unless the request explicitly asks for icon replacement or the icon is empty/invalid.\n");

        appendSection(sb, "Root groups", roots, 12);
        appendSection(sb, "Parent-child relations", relations, 24);
        appendSection(sb, "Icon mappings", icons, 24);
        appendSection(sb, "Runtime bindings", runtime, 18);

        Object warnings = payload.get("warnings");
        if (warnings instanceof List<?> list && !list.isEmpty()) {
            LinkedHashSet<String> warningSet = new LinkedHashSet<>();
            for (Object item : list) {
                String text = String.valueOf(item == null ? "" : item).trim();
                if (!text.isBlank()) {
                    warningSet.add(text);
                }
            }
            appendSection(sb, "Warnings seen in accepted output", warningSet, 8);
        }

        return truncate(sb.toString().trim(), SUMMARY_MAX_CHARS);
    }

    @SuppressWarnings("unchecked")
    private void collectMenuSignals(
        Object raw,
        String parentLabel,
        Set<String> roots,
        Set<String> relations,
        Set<String> icons,
        Set<String> runtime
    ) {
        if (!(raw instanceof Map<?, ?> rawMap)) {
            return;
        }

        Map<String, Object> node = (Map<String, Object>) rawMap;
        String label = firstNonBlank(node.get("label_vi"), node.get("label"), node.get("name"), node.get("id"));
        if (label.isBlank()) {
            return;
        }
        String icon = firstNonBlank(node.get("m_icon"), node.get("icon"));
        String typeForm = firstNonBlank(node.get("type_form"));
        String tableName = firstNonBlank(node.get("table_name"));
        String path = firstNonBlank(node.get("path"));
        String id = firstNonBlank(node.get("id"));

        if (parentLabel == null || parentLabel.isBlank()) {
            roots.add(label + (typeForm.isBlank() ? "" : " | type_form=" + typeForm));
        } else {
            relations.add(parentLabel + " > " + label + (id.isBlank() ? "" : " | id=" + id));
        }
        if (!icon.isBlank()) {
            icons.add(label + " => " + icon);
        }
        if (!typeForm.isBlank() || !tableName.isBlank() || !path.isBlank()) {
            StringBuilder binding = new StringBuilder(label);
            if (!typeForm.isBlank()) {
                binding.append(" | type_form=").append(typeForm);
            }
            if (!tableName.isBlank()) {
                binding.append(" | table=").append(tableName);
            }
            if (!path.isBlank()) {
                binding.append(" | path=").append(path);
            }
            runtime.add(binding.toString());
        }

        Object children = node.get("children");
        if (children instanceof List<?> list) {
            for (Object child : list) {
                collectMenuSignals(child, label, roots, relations, icons, runtime);
            }
        }
    }

    private void appendSection(StringBuilder sb, String heading, Set<String> values, int maxItems) {
        if (values.isEmpty()) {
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
                long createdAtMs = toLong(json.get("createdAtMs"));
                int menuCount = toInt(json.get("menuCount"));
                if (!id.isBlank() && !summary.isBlank()) {
                    entries.add(new LearningEntry(id, createdAtMs, requestText, summary, menuCount, digest));
                }
            }
            return entries;
        } catch (Exception ex) {
            log.warn("Could not read menu learning file for appId={}: {}", appId, ex.getMessage());
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
                "menuCount", entry.menuCount(),
                "digest", entry.digest()
            )));
        }
        Files.write(file, lines, StandardCharsets.UTF_8);
    }

    private Path getLearningFile(String appId) {
        String safe = String.valueOf(appId == null ? "" : appId).replaceAll("[^a-zA-Z0-9_\\-]", "_");
        return Paths.get(contextDir, "ai_menu_learning_" + safe + ".jsonl");
    }

    private String buildSearchContent(LearningEntry entry) {
        return (String.valueOf(entry.requestText() == null ? "" : entry.requestText()).trim()
            + "\n"
            + String.valueOf(entry.summary() == null ? "" : entry.summary()).trim()).trim();
    }

    private float[] embedText(String text) {
        float[] vector = new float[VECTOR_DIMS];
        Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT));
        int tokenCount = 0;
        while (matcher.find()) {
            String token = matcher.group();
            if (token == null || token.isBlank()) {
                continue;
            }
            int index = Math.floorMod(token.hashCode(), VECTOR_DIMS);
            vector[index] += 1.0f;
            tokenCount++;
        }
        if (tokenCount == 0) {
            vector[0] = 1.0f;
            return vector;
        }
        float norm = 0.0f;
        for (float value : vector) {
            norm += value * value;
        }
        norm = (float) Math.sqrt(norm);
        if (norm <= 0.0f) {
            vector[0] = 1.0f;
            return vector;
        }
        for (int i = 0; i < vector.length; i++) {
            vector[i] = vector[i] / norm;
        }
        return vector;
    }

    private String firstNonBlank(Object... values) {
        for (Object value : values) {
            String text = String.valueOf(value == null ? "" : value).trim();
            if (!text.isBlank() && !"null".equalsIgnoreCase(text)) {
                return text;
            }
        }
        return "";
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