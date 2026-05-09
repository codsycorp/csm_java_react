package net.phanmemmottrieu.service;

import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.KnnFloatVectorField;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.Term;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.KnnFloatVectorQuery;
import org.apache.lucene.search.MatchAllDocsQuery;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiBusinessMemoryVectorService {

    private static final Logger log = LoggerFactory.getLogger(AiBusinessMemoryVectorService.class);
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_]{2,}");
    // Use LocalEmbeddingService.DIMS (384) to match upgraded semantic index.
    private static final int VECTOR_DIMS = LocalEmbeddingService.DIMS;

    @org.springframework.beans.factory.annotation.Autowired
    private LocalEmbeddingService localEmbeddingService;

    @Value("${ai.business.memory.enabled:${AI_BUSINESS_MEMORY_ENABLED:true}}")
    private boolean enabled;

    @Value("${ai.business.memory.index-dir:${AI_BUSINESS_MEMORY_INDEX_DIR:csm_datas/ai_local/ai_business_memory}}")
    private String indexDir;

    @Value("${ai.business.memory.chunk-max-chars:${AI_BUSINESS_MEMORY_CHUNK_MAX_CHARS:2200}}")
    private int chunkMaxChars;

    @Value("${ai.business.memory.chunk-overlap-chars:${AI_BUSINESS_MEMORY_CHUNK_OVERLAP_CHARS:220}}")
    private int chunkOverlapChars;

    @Value("${ai.business.memory.search-default-k:${AI_BUSINESS_MEMORY_SEARCH_DEFAULT_K:6}}")
    private int searchDefaultK;

    public record SearchHit(
        String appId,
        String sourceName,
        String chunkId,
        String summary,
        String content,
        float score,
        long createdAtMs
    ) {}

    public record IndexSummary(
        String appId,
        String sourceName,
        int chunksIndexed,
        int charsIndexed,
        long indexedAtMs
    ) {}

    public boolean isEnabled() {
        return enabled;
    }

    public IndexSummary indexMarkdown(String appId, String sourceName, String markdown, List<String> tags) {
        String safeAppId = sanitizeAppId(appId);
        String safeSourceName = String.valueOf(sourceName == null ? "" : sourceName).trim();
        String safeMarkdown = String.valueOf(markdown == null ? "" : markdown).trim();
        if (!enabled || safeAppId.isBlank() || safeSourceName.isBlank() || safeMarkdown.isBlank()) {
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, System.currentTimeMillis());
        }

        List<String> chunks = chunkMarkdown(safeMarkdown);
        if (chunks.isEmpty()) {
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, System.currentTimeMillis());
        }

        Path appPath = resolveAppIndexPath(safeAppId);
        int totalChars = 0;
        long nowMs = System.currentTimeMillis();
        try {
            Files.createDirectories(appPath);
            try (Directory dir = FSDirectory.open(appPath)) {
                IndexWriterConfig cfg = new IndexWriterConfig();
                try (IndexWriter writer = new IndexWriter(dir, cfg)) {
                    writer.deleteDocuments(new Term("sourceName", safeSourceName));

                    int idx = 0;
                    for (String chunk : chunks) {
                        String safeChunk = String.valueOf(chunk == null ? "" : chunk).trim();
                        if (safeChunk.isBlank()) {
                            continue;
                        }
                        totalChars += safeChunk.length();
                        String chunkId = safeSourceName + "#" + idx;

                        Document doc = new Document();
                        doc.add(new StringField("appId", safeAppId, Field.Store.YES));
                        doc.add(new StringField("sourceName", safeSourceName, Field.Store.YES));
                        doc.add(new StringField("chunkId", chunkId, Field.Store.YES));
                        doc.add(new StoredField("createdAtMs", nowMs));

                        String compactTags = normalizeTags(tags);
                        if (!compactTags.isBlank()) {
                            doc.add(new TextField("tags", compactTags, Field.Store.YES));
                        }

                        String summary = summarizeForIndex(safeChunk, 240);
                        doc.add(new TextField("summary", summary, Field.Store.YES));
                        doc.add(new TextField("content", safeChunk, Field.Store.YES));
                        doc.add(new KnnFloatVectorField("vector", embedText(summary + "\n" + safeChunk)));
                        writer.addDocument(doc);
                        idx++;
                    }
                    writer.commit();
                    log.info("Indexed business memory appId={} source={} chunks={} chars={}", safeAppId, safeSourceName, chunks.size(), totalChars);
                }
            }
        } catch (Exception ex) {
            log.error("Failed to index business markdown appId={} source={}: {}", safeAppId, safeSourceName, ex.getMessage(), ex);
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, nowMs);
        }

        return new IndexSummary(safeAppId, safeSourceName, chunks.size(), totalChars, nowMs);
    }

    public List<SearchHit> search(String appId, String queryText, Integer kOverride) {
        String safeAppId = sanitizeAppId(appId);
        String safeQuery = String.valueOf(queryText == null ? "" : queryText).trim();
        if (!enabled || safeAppId.isBlank() || safeQuery.isBlank()) {
            return List.of();
        }

        int k = Math.max(1, kOverride == null ? searchDefaultK : kOverride);
        Path appPath = resolveAppIndexPath(safeAppId);
        if (!Files.isDirectory(appPath)) {
            return List.of();
        }

        List<SearchHit> hits = new ArrayList<>();
        try (Directory dir = FSDirectory.open(appPath)) {
            if (!DirectoryReader.indexExists(dir)) {
                return List.of();
            }
            try (DirectoryReader reader = DirectoryReader.open(dir)) {
                IndexSearcher searcher = new IndexSearcher(reader);
                Query query = new KnnFloatVectorQuery("vector", embedText(safeQuery), Math.max(k * 3, 12));
                TopDocs docs = searcher.search(query, Math.max(k * 3, 12));

                for (ScoreDoc sd : docs.scoreDocs) {
                    Document d = searcher.storedFields().document(sd.doc);
                    String docAppId = String.valueOf(d.get("appId") == null ? "" : d.get("appId"));
                    if (!safeAppId.equals(docAppId)) {
                        continue;
                    }
                    hits.add(new SearchHit(
                        docAppId,
                        String.valueOf(d.get("sourceName") == null ? "" : d.get("sourceName")),
                        String.valueOf(d.get("chunkId") == null ? "" : d.get("chunkId")),
                        String.valueOf(d.get("summary") == null ? "" : d.get("summary")),
                        String.valueOf(d.get("content") == null ? "" : d.get("content")),
                        sd.score,
                        parseLongSafe(d.get("createdAtMs"), 0L)
                    ));
                    if (hits.size() >= k) {
                        break;
                    }
                }

                // Fallback: if vector ranking gives no hits (cold index), return recent docs.
                if (hits.isEmpty()) {
                    TopDocs latest = searcher.search(new MatchAllDocsQuery(), Math.max(k, 8));
                    for (ScoreDoc sd : latest.scoreDocs) {
                        Document d = searcher.storedFields().document(sd.doc);
                        String docAppId = String.valueOf(d.get("appId") == null ? "" : d.get("appId"));
                        if (!safeAppId.equals(docAppId)) {
                            continue;
                        }
                        hits.add(new SearchHit(
                            docAppId,
                            String.valueOf(d.get("sourceName") == null ? "" : d.get("sourceName")),
                            String.valueOf(d.get("chunkId") == null ? "" : d.get("chunkId")),
                            String.valueOf(d.get("summary") == null ? "" : d.get("summary")),
                            String.valueOf(d.get("content") == null ? "" : d.get("content")),
                            sd.score,
                            parseLongSafe(d.get("createdAtMs"), 0L)
                        ));
                        if (hits.size() >= k) {
                            break;
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Business memory search failed appId={}: {}", safeAppId, ex.getMessage());
            return List.of();
        }

        return hits;
    }

    public Map<String, Object> getStats(String appId) {
        String safeAppId = sanitizeAppId(appId);
        Path appPath = resolveAppIndexPath(safeAppId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", enabled);
        out.put("appId", safeAppId);
        out.put("indexPath", appPath.toAbsolutePath().toString());
        out.put("exists", Files.isDirectory(appPath));

        if (!enabled || safeAppId.isBlank() || !Files.isDirectory(appPath)) {
            out.put("documents", 0);
            out.put("latestIndexedAtMs", 0L);
            out.put("sources", List.of());
            return out;
        }

        try (Directory dir = FSDirectory.open(appPath)) {
            if (!DirectoryReader.indexExists(dir)) {
                out.put("documents", 0);
                out.put("latestIndexedAtMs", 0L);
                out.put("sources", List.of());
                return out;
            }
            try (DirectoryReader reader = DirectoryReader.open(dir)) {
                IndexSearcher searcher = new IndexSearcher(reader);
                TopDocs docs = searcher.search(new MatchAllDocsQuery(), Math.max(1, reader.numDocs()));
                LinkedHashSet<String> sources = new LinkedHashSet<>();
                long latest = 0L;
                for (ScoreDoc sd : docs.scoreDocs) {
                    Document d = searcher.storedFields().document(sd.doc);
                    sources.add(String.valueOf(d.get("sourceName") == null ? "" : d.get("sourceName")));
                    latest = Math.max(latest, parseLongSafe(d.get("createdAtMs"), 0L));
                }
                out.put("documents", reader.numDocs());
                out.put("latestIndexedAtMs", latest);
                out.put("sources", new ArrayList<>(sources));
            }
        } catch (Exception ex) {
            out.put("documents", 0);
            out.put("latestIndexedAtMs", 0L);
            out.put("sources", List.of());
            out.put("error", ex.getMessage());
        }
        return out;
    }

    public String buildRagBlock(String appId, String queryText, Integer kOverride, int maxChars) {
        List<SearchHit> hits = search(appId, queryText, kOverride);
        if (hits.isEmpty()) {
            return "";
        }

        int cap = Math.max(1200, maxChars);
        StringBuilder sb = new StringBuilder();
        sb.append("## CUSTOMER BUSINESS MEMORY (LUCENE VECTOR RAG)\n");
        sb.append("Use this as authoritative business context before proposing code changes.\n\n");
        int idx = 1;
        for (SearchHit hit : hits) {
            if (hit == null) {
                continue;
            }
            sb.append("### Memory ").append(idx++).append("\n");
            sb.append("source: ").append(hit.sourceName()).append("\n");
            sb.append("score: ").append(String.format(Locale.ROOT, "%.4f", hit.score())).append("\n");
            sb.append("summary: ").append(hit.summary()).append("\n");
            sb.append("content:\n").append(hit.content()).append("\n\n");
            if (sb.length() >= cap) {
                break;
            }
        }
        return trimTo(sb.toString(), cap);
    }

    private Path resolveAppIndexPath(String appId) {
        Path root = Paths.get(String.valueOf(indexDir == null ? "" : indexDir).trim());
        if (!root.isAbsolute()) {
            root = Paths.get(System.getProperty("user.dir"), root.toString());
        }
        String safe = sanitizeAppId(appId);
        if (safe.isBlank()) {
            safe = "default";
        }
        return root.resolve(safe).toAbsolutePath().normalize();
    }

    private String sanitizeAppId(String rawAppId) {
        return String.valueOf(rawAppId == null ? "" : rawAppId).trim().replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    private String normalizeTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return "";
        }
        List<String> out = new ArrayList<>();
        for (String tag : tags) {
            String v = String.valueOf(tag == null ? "" : tag).trim();
            if (!v.isBlank()) {
                out.add(v);
            }
        }
        return String.join(" ", out);
    }

    private List<String> chunkMarkdown(String markdown) {
        String source = String.valueOf(markdown == null ? "" : markdown).trim();
        if (source.isBlank()) {
            return List.of();
        }

        int maxChars = Math.max(700, chunkMaxChars);
        int overlap = Math.max(0, Math.min(Math.max(80, chunkOverlapChars), Math.max(120, maxChars / 2)));
        String[] blocks = source.split("\\n\\s*\\n");
        if (blocks.length == 0) {
            return List.of(trimTo(source, maxChars));
        }

        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String block : blocks) {
            String text = String.valueOf(block == null ? "" : block).trim();
            if (text.isBlank()) {
                continue;
            }

            if (current.length() > 0 && current.length() + 2 + text.length() > maxChars) {
                chunks.add(current.toString().trim());
                String tail = overlap > 0 && current.length() > overlap
                    ? current.substring(Math.max(0, current.length() - overlap))
                    : "";
                current = new StringBuilder(tail);
            }

            if (current.length() > 0) {
                current.append("\n\n");
            }
            current.append(text);
        }

        if (current.length() > 0) {
            chunks.add(current.toString().trim());
        }

        // Ensure bounded chunk sizes in extreme single-paragraph inputs.
        List<String> bounded = new ArrayList<>();
        for (String chunk : chunks) {
            String value = String.valueOf(chunk == null ? "" : chunk).trim();
            if (value.isBlank()) {
                continue;
            }
            if (value.length() <= maxChars) {
                bounded.add(value);
                continue;
            }
            int start = 0;
            while (start < value.length()) {
                int end = Math.min(value.length(), start + maxChars);
                bounded.add(value.substring(start, end).trim());
                if (end >= value.length()) {
                    break;
                }
                start = Math.max(start + 1, end - overlap);
            }
        }

        return bounded;
    }

    private float[] embedText(String text) {
        return localEmbeddingService.embed(text);
    }

    private long parseLongSafe(String raw, long fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String summarizeForIndex(String text, int max) {
        String compact = String.valueOf(text == null ? "" : text)
            .replace("\r", " ")
            .replace("\n", " ")
            .replaceAll("\\s+", " ")
            .trim();
        return compact.length() <= max ? compact : compact.substring(0, Math.max(0, max)) + "...";
    }

    private String trimTo(String text, int maxChars) {
        String safe = String.valueOf(text == null ? "" : text);
        if (safe.length() <= maxChars) {
            return safe;
        }
        return safe.substring(0, Math.max(0, maxChars));
    }
}
