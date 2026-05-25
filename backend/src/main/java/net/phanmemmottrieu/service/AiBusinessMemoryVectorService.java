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
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.KnnFloatVectorQuery;
import org.apache.lucene.search.MatchAllDocsQuery;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;
import org.apache.lucene.store.LockObtainFailedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class AiBusinessMemoryVectorService {

    private static final Logger log = LoggerFactory.getLogger(AiBusinessMemoryVectorService.class);
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_]{2,}");
    private static final Pattern HEADING_PATTERN = Pattern.compile("(?m)^#{1,4}\\s+(.+)$");
    private static final Pattern JSON_KEY_PATTERN = Pattern.compile("\"([^\"]+)\"\\s*:");
    private static final Pattern IMPORT_TARGET_PATTERN = Pattern.compile(
        "(?m)^\\s*import\\s+(?:[^;\\n]*?\\s+from\\s+)?[\"']([^\"']+)[\"']|^\\s*import\\s+([A-Za-z0-9_.$]+)\\s*;"
    );
    private static final Pattern MENU_TABLE_PATTERN = Pattern.compile("\"table_name\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern MENU_TYPE_FORM_PATTERN = Pattern.compile("\"type_form\"\\s*:\\s*(\\d+)");

    // Semantic chunking: Java class-body method/field declarations
    private static final Pattern JAVA_MEMBER_BOUNDARY = Pattern.compile(
        "(?m)^    (?:@[A-Za-z]\\w*(?:\\s*\\([^)]*\\))?\\s*\\n    )?(?:public|private|protected|static|final|abstract|synchronized|override)\\s"
    );
    // Semantic chunking: TypeScript top-level function / class / const-arrow-function
    private static final Pattern TS_DECLARATION_BOUNDARY = Pattern.compile(
        "(?m)^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s+[A-Za-z_$]|class\\s+[A-Za-z_$]|const\\s+[A-Za-z_$])"
    );

    // Content-hash cache: avoids re-embedding identical content between requests
    private final ConcurrentHashMap<String, String> contentHashCache = new ConcurrentHashMap<>();

    private final AiLocalEmbeddingService aiLocalEmbeddingService;

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

    @Value("${ai.business.memory.search.rerank.enabled:true}")
    private boolean rerankEnabled;

    @Value("${ai.business.memory.search.rerank.max-query-variants:3}")
    private int rerankMaxQueryVariants;

    @Value("${ai.business.memory.search.rerank.vector-fanout-multiplier:4}")
    private int rerankVectorFanoutMultiplier;

    @Value("${ai.business.memory.search.rerank.max-candidates:18}")
    private int rerankMaxCandidates;

    @Value("${ai.business.memory.dynamic.enabled:true}")
    private boolean dynamicMemoryEnabled;

    @Value("${ai.business.memory.dynamic.source-prefix:dyn_ctx_}")
    private String dynamicSourcePrefix;

    @Value("${ai.business.memory.dynamic.max-age-ms:1800000}")
    private long dynamicMaxAgeMs;

    @Value("${ai.business.memory.dynamic.max-sources:48}")
    private int dynamicMaxSources;

    @Value("${ai.business.memory.write.lock-retries:3}")
    private int lockRetries;

    @Value("${ai.business.memory.write.lock-backoff-ms:35}")
    private int lockBackoffMs;

    @Value("${ai.business.memory.structural-summary.max-headings:4}")
    private int structuralSummaryMaxHeadings;

    @Value("${ai.business.memory.structural-summary.max-keys:10}")
    private int structuralSummaryMaxKeys;

    @Value("${ai.business.memory.structural-summary.max-dependencies:6}")
    private int structuralSummaryMaxDependencies;

    private final ConcurrentHashMap<String, ReentrantLock> appWriteLocks = new ConcurrentHashMap<>();

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

    @Autowired
    public AiBusinessMemoryVectorService(AiLocalEmbeddingService aiLocalEmbeddingService) {
        this.aiLocalEmbeddingService = aiLocalEmbeddingService;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public IndexSummary indexDynamicContext(String appId, String sourceSuffix, String markdown, List<String> tags) {
        return indexDynamicContext(appId, sourceSuffix, markdown, tags, 0);
    }

    public IndexSummary indexDynamicContext(String appId, String sourceSuffix, String markdown, List<String> tags, int scopeMask) {
        if (!dynamicMemoryEnabled) {
            String safeAppId = sanitizeAppId(appId);
            return new IndexSummary(safeAppId, "", 0, 0, System.currentTimeMillis());
        }
        String prefix = String.valueOf(dynamicSourcePrefix == null ? "dyn_ctx_" : dynamicSourcePrefix).trim();
        if (prefix.isBlank()) {
            prefix = "dyn_ctx_";
        }
        String suffix = String.valueOf(sourceSuffix == null ? "" : sourceSuffix).trim();
        if (suffix.isBlank()) {
            suffix = Long.toString(System.currentTimeMillis());
        }
        String sourceName = prefix + suffix.replaceAll("[^a-zA-Z0-9_\\-]", "_");
        return indexMarkdown(appId, sourceName, markdown, tags, scopeMask);
    }

    public int pruneDynamicContext(String appId) {
        if (!dynamicMemoryEnabled) {
            return 0;
        }
        return pruneSourcesByPrefix(
            appId,
            String.valueOf(dynamicSourcePrefix == null ? "dyn_ctx_" : dynamicSourcePrefix).trim(),
            Math.max(60_000L, dynamicMaxAgeMs),
            Math.max(8, dynamicMaxSources)
        );
    }

    public int pruneSourcesByPrefix(String appId, String sourcePrefix, long maxAgeMs, int maxSources) {
        String safeAppId = sanitizeAppId(appId);
        String safePrefix = String.valueOf(sourcePrefix == null ? "" : sourcePrefix).trim();
        if (!enabled || safeAppId.isBlank() || safePrefix.isBlank()) {
            return 0;
        }

        Path appPath = resolveAppIndexPath(safeAppId);
        if (!Files.isDirectory(appPath)) {
            return 0;
        }

        long now = System.currentTimeMillis();
        Map<String, Long> latestBySource = new LinkedHashMap<>();
        AtomicInteger removedCounter = new AtomicInteger(0);

        ReentrantLock appLock = appWriteLocks.computeIfAbsent(safeAppId, key -> new ReentrantLock());
        appLock.lock();
        try (Directory dir = FSDirectory.open(appPath)) {
            if (!DirectoryReader.indexExists(dir)) {
                return 0;
            }
            try (DirectoryReader reader = DirectoryReader.open(dir)) {
                IndexSearcher searcher = new IndexSearcher(reader);
                TopDocs docs = searcher.search(new MatchAllDocsQuery(), Math.max(1, reader.numDocs()));
                for (ScoreDoc sd : docs.scoreDocs) {
                    Document d = searcher.storedFields().document(sd.doc);
                    String docAppId = String.valueOf(d.get("appId") == null ? "" : d.get("appId"));
                    String sourceName = String.valueOf(d.get("sourceName") == null ? "" : d.get("sourceName"));
                    if (!safeAppId.equals(docAppId) || !sourceName.startsWith(safePrefix)) {
                        continue;
                    }
                    long createdAt = parseLongSafe(d.get("createdAtMs"), 0L);
                    latestBySource.merge(sourceName, createdAt, Math::max);
                }
            }

            if (latestBySource.isEmpty()) {
                return 0;
            }

            List<Map.Entry<String, Long>> ordered = new ArrayList<>(latestBySource.entrySet());
            ordered.sort(Comparator.comparingLong(Map.Entry<String, Long>::getValue).reversed());

            List<String> deleteSources = new ArrayList<>();
            int sourceLimit = Math.max(1, maxSources);
            long ageLimit = Math.max(60_000L, maxAgeMs);
            for (int i = 0; i < ordered.size(); i++) {
                Map.Entry<String, Long> entry = ordered.get(i);
                long age = now - Math.max(0L, entry.getValue());
                if (i >= sourceLimit || age > ageLimit) {
                    deleteSources.add(entry.getKey());
                }
            }

            if (deleteSources.isEmpty()) {
                return 0;
            }

            withWriteLockRetry(safeAppId, "pruneSourcesByPrefix", () -> {
                IndexWriterConfig cfg = new IndexWriterConfig();
                try (IndexWriter writer = new IndexWriter(dir, cfg)) {
                    for (String sourceName : deleteSources) {
                        writer.deleteDocuments(new Term("sourceName", sourceName));
                        removedCounter.incrementAndGet();
                    }
                    writer.commit();
                }
                return null;
            });
            int removed = removedCounter.get();

            log.info("Pruned dynamic business memory appId={} removedSources={} prefix={}", safeAppId, removed, safePrefix);
            return removed;
        } catch (Exception ex) {
            log.warn("Failed to prune dynamic memory appId={} prefix={}: {}", safeAppId, safePrefix, ex.getMessage());
            return 0;
        } finally {
            appLock.unlock();
        }
    }

    public IndexSummary indexMarkdown(String appId, String sourceName, String markdown, List<String> tags) {
        return indexMarkdown(appId, sourceName, markdown, tags, 0);
    }

    public IndexSummary indexMarkdown(String appId, String sourceName, String markdown, List<String> tags, int scopeMask) {
        String safeAppId = sanitizeAppId(appId);
        String safeSourceName = String.valueOf(sourceName == null ? "" : sourceName).trim();
        String safeMarkdown = String.valueOf(markdown == null ? "" : markdown).trim();
        if (!enabled || safeAppId.isBlank() || safeSourceName.isBlank() || safeMarkdown.isBlank()) {
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, System.currentTimeMillis());
        }

        // Content-hash check: skip full re-embedding if this exact content was already indexed
        String cacheKey = safeAppId + ":" + safeSourceName;
        String contentHash = md5Hex(safeMarkdown);
        if (contentHash.equals(contentHashCache.get(cacheKey))) {
            log.debug("Skip re-index {}/{}: content unchanged", safeAppId, safeSourceName);
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, System.currentTimeMillis());
        }

        List<String> chunks = chunkMarkdown(safeMarkdown);
        if (chunks.isEmpty()) {
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, System.currentTimeMillis());
        }

        Path appPath = resolveAppIndexPath(safeAppId);
        int totalChars = 0;
        long nowMs = System.currentTimeMillis();
        ReentrantLock appLock = appWriteLocks.computeIfAbsent(safeAppId, key -> new ReentrantLock());
        appLock.lock();
        try {
            Files.createDirectories(appPath);
            try (Directory dir = FSDirectory.open(appPath)) {
                int[] indexedChunksRef = {0};
                int[] totalCharsRef = {0};
                withWriteLockRetry(safeAppId, "indexMarkdown", () -> {
                    IndexWriterConfig cfg = new IndexWriterConfig();
                    try (IndexWriter writer = new IndexWriter(dir, cfg)) {
                        writer.deleteDocuments(new Term("sourceName", safeSourceName));

                        int idx = 0;
                        for (String chunk : chunks) {
                            String safeChunk = String.valueOf(chunk == null ? "" : chunk).trim();
                            if (safeChunk.isBlank() || isLowSignalBinaryChunk(safeChunk)) {
                                continue;
                            }
                            totalCharsRef[0] += safeChunk.length();
                            String chunkId = safeSourceName + "#" + idx;

                            Document doc = new Document();
                            doc.add(new StringField("appId", safeAppId, Field.Store.YES));
                            doc.add(new StringField("sourceName", safeSourceName, Field.Store.YES));
                            doc.add(new StringField("chunkId", chunkId, Field.Store.YES));
                            doc.add(new StoredField("createdAtMs", nowMs));
                            doc.add(new StoredField("scopeMask", Math.max(0, scopeMask)));

                            for (String scopeTag : scopeTagsFromMask(scopeMask)) {
                                doc.add(new StringField("scopeTag", scopeTag, Field.Store.YES));
                            }

                            String compactTags = normalizeTags(tags);
                            if (!compactTags.isBlank()) {
                                doc.add(new TextField("tags", compactTags, Field.Store.YES));
                            }

                            String summary = summarizeForIndex(safeChunk, 240);
                            String structuralSummary = buildStructuralSummary(safeSourceName, safeChunk, compactTags);
                            doc.add(new TextField("summary", summary, Field.Store.YES));
                            if (!structuralSummary.isBlank()) {
                                doc.add(new TextField("structure", structuralSummary, Field.Store.YES));
                            }
                            doc.add(new TextField("content", safeChunk, Field.Store.YES));
                            doc.add(new KnnFloatVectorField(
                                "vector",
                                embedDocumentText(summary + "\n" + structuralSummary + "\n" + trimTo(safeChunk, Math.min(1400, chunkMaxChars)))));
                            writer.addDocument(doc);
                            idx++;
                        }
                        indexedChunksRef[0] = idx;
                        writer.commit();
                    }
                    return null;
                });
                totalChars = totalCharsRef[0];
                log.info("Indexed business memory appId={} source={} chunks={} chars={}", safeAppId, safeSourceName, indexedChunksRef[0], totalChars);
            }
            contentHashCache.put(cacheKey, contentHash);
        } catch (Exception ex) {
            log.error("Failed to index business markdown appId={} source={}: {}", safeAppId, safeSourceName, ex.getMessage(), ex);
            return new IndexSummary(safeAppId, safeSourceName, 0, 0, nowMs);
        } finally {
            appLock.unlock();
        }

        return new IndexSummary(safeAppId, safeSourceName, chunks.size(), totalChars, nowMs);
    }

    public List<SearchHit> search(String appId, String queryText, Integer kOverride) {
        return searchWithScopes(appId, queryText, kOverride, 0);
    }

    public List<SearchHit> searchWithScopes(String appId, String queryText, Integer kOverride, int scopeMask) {
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

        int vectorFanout = Math.max(k * Math.max(3, rerankVectorFanoutMultiplier), 12);
        int candidateCap = Math.max(k, Math.max(8, rerankMaxCandidates));
        LinkedHashMap<String, SearchHit> candidateMap = new LinkedHashMap<>();
        List<String> queryVariants = buildQueryVariants(safeQuery, rerankEnabled ? rerankMaxQueryVariants : 1);
        try (Directory dir = FSDirectory.open(appPath)) {
            if (!DirectoryReader.indexExists(dir)) {
                return List.of();
            }
            try (DirectoryReader reader = DirectoryReader.open(dir)) {
                IndexSearcher searcher = new IndexSearcher(reader);
                Query scopeFilter = buildScopeFilterQuery(scopeMask);
                for (String queryVariant : queryVariants) {
                    String safeVariant = String.valueOf(queryVariant == null ? "" : queryVariant).trim();
                    if (safeVariant.isBlank()) {
                        continue;
                    }
                    String embeddingVariant = buildEmbeddingQueryVariant(safeVariant);
                    if (embeddingVariant.isBlank()) {
                        continue;
                    }
                    Query query = scopeFilter == null
                        ? new KnnFloatVectorQuery("vector", embedQueryText(embeddingVariant), vectorFanout)
                        : new KnnFloatVectorQuery("vector", embedQueryText(embeddingVariant), vectorFanout, scopeFilter);
                    TopDocs docs = searcher.search(query, vectorFanout);

                    for (ScoreDoc sd : docs.scoreDocs) {
                        SearchHit hit = toSearchHit(searcher, sd, safeAppId, scopeMask);
                        if (hit == null) {
                            continue;
                        }
                        String key = buildHitKey(hit);
                        SearchHit existing = candidateMap.get(key);
                        if (existing == null || hit.score() > existing.score()) {
                            candidateMap.put(key, hit);
                        }
                        if (candidateMap.size() >= candidateCap) {
                            break;
                        }
                    }
                    if (candidateMap.size() >= candidateCap) {
                        break;
                    }
                }

                // Fallback: if vector ranking gives no hits (cold index), return recent docs.
                if (candidateMap.isEmpty()) {
                    TopDocs latest = searcher.search(scopeFilter == null ? new MatchAllDocsQuery() : scopeFilter, Math.max(candidateCap, 8));
                    for (ScoreDoc sd : latest.scoreDocs) {
                        SearchHit hit = toSearchHit(searcher, sd, safeAppId, scopeMask);
                        if (hit == null) {
                            continue;
                        }
                        candidateMap.putIfAbsent(buildHitKey(hit), hit);
                        if (candidateMap.size() >= candidateCap) {
                            break;
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Business memory search failed appId={}: {}", safeAppId, ex.getMessage());
            return List.of();
        }

        List<SearchHit> hits = new ArrayList<>(candidateMap.values());
        if (hits.isEmpty()) {
            return List.of();
        }
        if (rerankEnabled) {
            hits = rerankHits(hits, safeQuery, queryVariants, k);
        }
        if (hits.size() > k) {
            return new ArrayList<>(hits.subList(0, k));
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
        out.put("embeddingProvider", aiLocalEmbeddingService.providerKey());
        out.put("embeddingDimensions", aiLocalEmbeddingService.dimension());
        out.put("embeddingRuntime", aiLocalEmbeddingService.getStats());

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
        return buildRagBlockWithScopes(appId, queryText, kOverride, 0, maxChars);
    }

    public String buildRagBlockWithScopes(String appId, String queryText, Integer kOverride, int scopeMask, int maxChars) {
        List<SearchHit> hits = searchWithScopes(appId, queryText, kOverride, scopeMask);
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
            String sourceName = String.valueOf(hit.sourceName() == null ? "" : hit.sourceName()).trim();
            boolean dynamicSource = !dynamicSourcePrefix.isBlank() && sourceName.startsWith(dynamicSourcePrefix);
            sb.append("### Memory ").append(idx++).append("\n");
            sb.append("source: ").append(dynamicSource ? "dynamic_context" : sourceName).append("\n");
            sb.append("score: ").append(String.format(Locale.ROOT, "%.4f", hit.score())).append("\n");
            sb.append("summary: ").append(hit.summary()).append("\n");
            sb.append("content:\n").append(sanitizeRagContent(hit.content(), dynamicSource)).append("\n\n");
            if (sb.length() >= cap) {
                break;
            }
        }
        return trimTo(sb.toString(), cap);
    }

    private String sanitizeRagContent(String content, boolean dynamicSource) {
        String safe = String.valueOf(content == null ? "" : content);
        if (safe.isBlank()) {
            return "";
        }
        StringBuilder out = new StringBuilder(safe.length());
        String[] lines = safe.split("\\n");
        for (String rawLine : lines) {
            String line = String.valueOf(rawLine == null ? "" : rawLine).trim();
            String lowered = line.toLowerCase(Locale.ROOT);
            boolean looksInternal = lowered.startsWith("dyn_ctx_")
                || lowered.startsWith("source=primary_flow")
                || lowered.startsWith("source=multimodal")
                || lowered.startsWith("orchestration_")
                || lowered.startsWith("localscanner")
                || lowered.startsWith("scanner_");
            if (looksInternal) {
                continue;
            }
            if (dynamicSource && lowered.startsWith("contextsummary=")) {
                continue;
            }
            out.append(rawLine).append('\n');
        }
        return out.toString().trim();
    }

    private SearchHit toSearchHit(IndexSearcher searcher, ScoreDoc scoreDoc, String safeAppId, int scopeMask) throws Exception {
        if (searcher == null || scoreDoc == null) {
            return null;
        }
        Document d = searcher.storedFields().document(scoreDoc.doc);
        String docAppId = String.valueOf(d.get("appId") == null ? "" : d.get("appId"));
        if (!safeAppId.equals(docAppId)) {
            return null;
        }
        if (scopeMask > 0 && !matchesScope(d, scopeMask)) {
            return null;
        }
        String sourceName = String.valueOf(d.get("sourceName") == null ? "" : d.get("sourceName")).trim();
        if (shouldExcludeDynamicOrchestrationSource(sourceName, scopeMask)) {
            return null;
        }
        return new SearchHit(
            docAppId,
            sourceName,
            String.valueOf(d.get("chunkId") == null ? "" : d.get("chunkId")),
            mergeIndexedSummary(
                String.valueOf(d.get("summary") == null ? "" : d.get("summary")),
                String.valueOf(d.get("structure") == null ? "" : d.get("structure"))),
            String.valueOf(d.get("content") == null ? "" : d.get("content")),
            scoreDoc.score,
            parseLongSafe(d.get("createdAtMs"), 0L)
        );
    }

    private String buildHitKey(SearchHit hit) {
        if (hit == null) {
            return "";
        }
        String source = String.valueOf(hit.sourceName() == null ? "" : hit.sourceName()).trim();
        String chunk = String.valueOf(hit.chunkId() == null ? "" : hit.chunkId()).trim();
        return source + "::" + chunk;
    }

    private boolean shouldExcludeDynamicOrchestrationSource(String sourceName, int scopeMask) {
        String source = String.valueOf(sourceName == null ? "" : sourceName).trim().toLowerCase(Locale.ROOT);
        if (source.isBlank()) {
            return false;
        }
        String safePrefix = String.valueOf(dynamicSourcePrefix == null ? "dyn_ctx_" : dynamicSourcePrefix).trim().toLowerCase(Locale.ROOT);
        if (!safePrefix.isBlank() && !source.startsWith(safePrefix)) {
            return false;
        }
        if (!source.contains("orchestration_")) {
            return false;
        }
        int flowScopedMask = AiMultimodalScannerService.SCOPE_CODE
            | AiMultimodalScannerService.SCOPE_MENU
            | AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
        return (scopeMask & flowScopedMask) != 0;
    }

    private List<String> buildQueryVariants(String safeQuery, int maxVariants) {
        LinkedHashSet<String> variants = new LinkedHashSet<>();
        String normalized = String.valueOf(safeQuery == null ? "" : safeQuery).replace('\n', ' ').trim();
        if (normalized.isBlank()) {
            return List.of();
        }
        variants.add(trimTo(normalized, 220));

        String[] segments = normalized.split("\\|");
        for (String rawSegment : segments) {
            String segment = String.valueOf(rawSegment == null ? "" : rawSegment).trim();
            if (segment.isBlank()) {
                continue;
            }
            int colon = segment.indexOf(':');
            String candidate = colon >= 0 ? segment.substring(colon + 1).trim() : segment;
            if (!candidate.isBlank()) {
                variants.add(trimTo(candidate, 180));
            }
            if (variants.size() >= Math.max(1, maxVariants)) {
                break;
            }
        }

        LinkedHashSet<String> denseTokens = new LinkedHashSet<>();
        Matcher matcher = TOKEN_PATTERN.matcher(normalized.toLowerCase(Locale.ROOT));
        while (matcher.find() && denseTokens.size() < 10) {
            String token = String.valueOf(matcher.group(0) == null ? "" : matcher.group(0)).trim();
            if (token.length() >= 3) {
                denseTokens.add(token);
            }
        }
        if (!denseTokens.isEmpty() && variants.size() < Math.max(1, maxVariants)) {
            variants.add(trimTo(String.join(" ", denseTokens), 160));
        }

        List<String> out = new ArrayList<>();
        for (String variant : variants) {
            String safe = String.valueOf(variant == null ? "" : variant).trim();
            if (!safe.isBlank()) {
                out.add(safe);
            }
            if (out.size() >= Math.max(1, maxVariants)) {
                break;
            }
        }
        return out;
    }

    private String buildEmbeddingQueryVariant(String queryText) {
        String normalized = String.valueOf(queryText == null ? "" : queryText).replace('\n', ' ').trim();
        if (normalized.isBlank()) {
            return "";
        }
        LinkedHashSet<String> tokens = new LinkedHashSet<>();
        collectQueryTokens(tokens, normalized, 20);
        if (!tokens.isEmpty()) {
            return trimTo(String.join(" ", tokens), 180);
        }
        return trimTo(normalized, 180);
    }

    private List<SearchHit> rerankHits(List<SearchHit> hits, String safeQuery, List<String> queryVariants, int k) {
        if (hits == null || hits.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> tokenSet = new LinkedHashSet<>();
        collectQueryTokens(tokenSet, safeQuery, 16);
        if (queryVariants != null) {
            for (String variant : queryVariants) {
                collectQueryTokens(tokenSet, variant, 24);
                if (tokenSet.size() >= 24) {
                    break;
                }
            }
        }
        List<String> tokens = new ArrayList<>(tokenSet);
        hits.sort((left, right) -> Double.compare(scoreHit(right, tokens), scoreHit(left, tokens)));
        if (hits.size() > Math.max(k, 1)) {
            return new ArrayList<>(hits.subList(0, Math.max(k, 1)));
        }
        return hits;
    }

    private void collectQueryTokens(LinkedHashSet<String> out, String text, int limit) {
        if (out == null || out.size() >= limit) {
            return;
        }
        Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT));
        while (matcher.find() && out.size() < limit) {
            String token = String.valueOf(matcher.group(0) == null ? "" : matcher.group(0)).trim();
            if (token.length() >= 3) {
                out.add(token);
            }
        }
    }

    private double scoreHit(SearchHit hit, List<String> tokens) {
        if (hit == null) {
            return Double.NEGATIVE_INFINITY;
        }
        double score = hit.score();
        String source = String.valueOf(hit.sourceName() == null ? "" : hit.sourceName()).toLowerCase(Locale.ROOT);
        String summary = String.valueOf(hit.summary() == null ? "" : hit.summary()).toLowerCase(Locale.ROOT);
        String content = String.valueOf(hit.content() == null ? "" : hit.content()).toLowerCase(Locale.ROOT);

        int sourceMatches = 0;
        int summaryMatches = 0;
        int contentMatches = 0;
        for (String token : tokens) {
            String safe = String.valueOf(token == null ? "" : token).trim();
            if (safe.length() < 3) {
                continue;
            }
            if (source.contains(safe)) {
                sourceMatches++;
            }
            if (summary.contains(safe)) {
                summaryMatches++;
            }
            if (content.contains(safe)) {
                contentMatches++;
            }
        }

        score += sourceMatches * 0.65d;
        score += summaryMatches * 0.28d;
        score += Math.min(6, contentMatches) * 0.08d;
        if (source.contains("seo") && containsAny(tokens, "seo", "meta", "google", "index")) {
            score += 0.45d;
        }
        if (source.contains("vemaybay") && containsAny(tokens, "vemaybay", "ve", "visa", "tour", "report", "trigger")) {
            score += 0.45d;
        }
        if (source.contains("menu") && containsAny(tokens, "menu", "parentid", "trigger", "table", "label")) {
            score += 0.35d;
        }
        if (hit.createdAtMs() > 0L) {
            long ageMs = Math.max(0L, System.currentTimeMillis() - hit.createdAtMs());
            if (ageMs <= 15 * 60_000L) {
                score += 0.12d;
            } else if (ageMs <= 60 * 60_000L) {
                score += 0.05d;
            }
        }
        return score;
    }

    private boolean containsAny(List<String> tokens, String... expected) {
        if (tokens == null || tokens.isEmpty() || expected == null || expected.length == 0) {
            return false;
        }
        for (String token : tokens) {
            String safeToken = String.valueOf(token == null ? "" : token).trim().toLowerCase(Locale.ROOT);
            if (safeToken.isBlank()) {
                continue;
            }
            for (String rawExpected : expected) {
                String safeExpected = String.valueOf(rawExpected == null ? "" : rawExpected).trim().toLowerCase(Locale.ROOT);
                if (!safeExpected.isBlank() && safeToken.contains(safeExpected)) {
                    return true;
                }
            }
        }
        return false;
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
        return root.resolve(aiLocalEmbeddingService.indexNamespace()).resolve(safe).toAbsolutePath().normalize();
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

    private List<String> scopeTagsFromMask(int scopeMask) {
        if (scopeMask <= 0) {
            return List.of();
        }
        return AiMultimodalScannerService.scopeTagsFromMask(scopeMask);
    }

    private Query buildScopeFilterQuery(int scopeMask) {
        if (scopeMask <= 0) {
            return null;
        }
        List<String> tags = scopeTagsFromMask(scopeMask);
        if (tags.isEmpty()) {
            return null;
        }
        BooleanQuery.Builder builder = new BooleanQuery.Builder();
        for (String tag : tags) {
            String safe = String.valueOf(tag == null ? "" : tag).trim();
            if (!safe.isBlank()) {
                builder.add(new TermQuery(new Term("scopeTag", safe)), BooleanClause.Occur.SHOULD);
            }
        }
        builder.setMinimumNumberShouldMatch(1);
        BooleanQuery query = builder.build();
        return query.clauses().isEmpty() ? null : query;
    }

    private boolean matchesScope(Document doc, int requiredScopeMask) {
        if (requiredScopeMask <= 0 || doc == null) {
            return true;
        }
        long rawMask = parseLongSafe(doc.get("scopeMask"), 0L);
        int docScopeMask = rawMask > Integer.MAX_VALUE ? 0 : (int) rawMask;
        if (docScopeMask > 0) {
            return (docScopeMask & requiredScopeMask) != 0;
        }
        List<String> requiredTags = scopeTagsFromMask(requiredScopeMask);
        if (requiredTags.isEmpty()) {
            return false;
        }
        String[] docTags = doc.getValues("scopeTag");
        if (docTags == null || docTags.length == 0) {
            return false;
        }
        for (String required : requiredTags) {
            for (String docTag : docTags) {
                if (required.equals(docTag)) {
                    return true;
                }
            }
        }
        return false;
    }

    private List<String> chunkMarkdown(String markdown) {
        String source = String.valueOf(markdown == null ? "" : markdown).trim();
        if (source.isBlank()) {
            return List.of();
        }
        int maxChars = Math.max(700, chunkMaxChars);
        int overlap = Math.max(0, Math.min(Math.max(80, chunkOverlapChars), Math.max(120, maxChars / 2)));
        if (isStructuredJsonContent(source)) {
            return chunkJsonStructure(source, maxChars, overlap);
        }
        if (isCodeContent(source)) {
            return chunkCodeByDeclaration(source, maxChars, overlap);
        }
        return chunkByParagraph(source, maxChars, overlap);
    }

    /** Skip base64/office-binary blobs that pollute menu RAG and blow embedding batch limits. */
    private boolean isLowSignalBinaryChunk(String chunk) {
        String safe = String.valueOf(chunk == null ? "" : chunk).trim();
        if (safe.length() < 120) {
            return false;
        }
        if (safe.matches("(?s).*A{80,}.*")) {
            return true;
        }
        if (safe.contains("word/") && safe.contains("xml") && safe.contains("PK")) {
            return true;
        }
        long alnumSlash = safe.chars()
            .filter(c -> Character.isLetterOrDigit(c) || c == '/' || c == '+' || c == '=' || c == '/')
            .count();
        long spaces = safe.chars().filter(Character::isWhitespace).count();
        if (safe.length() > 400 && alnumSlash > safe.length() * 0.90 && spaces < safe.length() * 0.03) {
            return true;
        }
        long upper = safe.chars().filter(c -> c >= 'A' && c <= 'Z').count();
        return upper > safe.length() * 0.55;
    }

    private boolean isStructuredJsonContent(String s) {
        if (s.isBlank()) return false;
        char first = s.charAt(0);
        if (first != '{' && first != '[') return false;
        return s.contains("\":") && (
            s.contains("\"menuId\"") || s.contains("\"parentId\"") || s.contains("\"table_name\"")
            || s.contains("\"type_form\"") || s.contains("\"menuType\"") || s.contains("\"triggerList\"")
            || s.contains("\"labelMap\"")
        );
    }

    private boolean isCodeContent(String s) {
        // Java class/interface/annotation indicators
        if (s.contains("public class ") || s.contains("public interface ")
                || s.contains("public enum ") || s.contains("public @interface ")
                || s.contains("@Service") || s.contains("@Component")
                || s.contains("@Controller") || s.contains("@Repository")) {
            return true;
        }
        // TypeScript/React indicators — require at least two signals
        int tsSignals = 0;
        if (s.contains("export function ") || s.contains("export default ") || s.contains("export const ")) tsSignals++;
        if (s.contains("from '") || s.contains("from \"") || s.contains("import {")) tsSignals++;
        if (s.contains(": React.FC") || s.contains("useState(") || s.contains("useEffect(")) tsSignals++;
        if (tsSignals >= 2) {
            return true;
        }
        // DynamicCode runtime (browser globals, no import/export)
        int dynamicSignals = 0;
        if (s.contains("function ") || s.contains("async function ")) dynamicSignals++;
        if (s.contains("const ") || s.contains("let ") || s.contains("var ")) dynamicSignals++;
        if (s.contains("window.") || s.contains("document.") || s.contains("csmApi")) dynamicSignals++;
        return dynamicSignals >= 2;
    }

    /** Chunk JSON menu structures by splitting top-level array elements. */
    private List<String> chunkJsonStructure(String source, int maxChars, int overlap) {
        if (source.startsWith("[")) {
            List<String> elements = extractTopLevelArrayElements(source);
            if (!elements.isEmpty()) {
                return bundleElementsIntoChunks(elements, maxChars, overlap);
            }
        }
        return chunkByParagraph(source, maxChars, overlap);
    }

    /** Depth-tracking split of a JSON array into top-level element strings. */
    private List<String> extractTopLevelArrayElements(String source) {
        List<String> elements = new ArrayList<>();
        int depth = 0;
        int elemStart = -1;
        
        for (int i = 0; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '{' || c == '[') {
                if (depth == 1 && c == '{' && elemStart < 0) {
                    elemStart = i;
                }
                depth++;
            } else if (c == '}' || c == ']') {
                depth--;
                if (depth == 1 && elemStart >= 0) {
                    // Sửa tại đây: Cắt chuỗi trực tiếp bằng substring và add thẳng vào list
                    elements.add(source.substring(elemStart, i + 1));
                    elemStart = -1;
                }
            }
        }
        return elements;
    }

    private List<String> bundleElementsIntoChunks(List<String> elements, int maxChars, int overlap) {
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String element : elements) {
            String e = element.trim();
            if (e.isBlank()) continue;
            if (current.length() > 0 && current.length() + 2 + e.length() > maxChars) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
            if (current.length() > 0) current.append(",\n");
            current.append(e);
        }
        if (current.length() > 0) chunks.add(current.toString().trim());
        return hardBound(chunks, maxChars, overlap);
    }

    /** Chunk Java/TypeScript code, splitting at method/class declaration boundaries. */
    private List<String> chunkCodeByDeclaration(String source, int maxChars, int overlap) {
        String[] blocks = source.split("\\n\\s*\\n");
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String block : blocks) {
            String text = block.trim();
            if (text.isBlank()) continue;
            if (current.length() > 0 && current.length() + 2 + text.length() > maxChars) {
                chunks.add(current.toString().trim());
                String tail = overlap > 0 && current.length() > overlap
                    ? current.substring(Math.max(0, current.length() - overlap)) : "";
                current = new StringBuilder(tail);
            }
            if (current.length() > 0) current.append("\n\n");
            current.append(text);
        }
        if (current.length() > 0) chunks.add(current.toString().trim());
        // Sub-split oversized blocks at declaration boundaries
        List<String> split = new ArrayList<>();
        for (String chunk : chunks) {
            if (chunk.length() <= maxChars) {
                split.add(chunk);
                continue;
            }
            String[] lines = chunk.split("\n");
            StringBuilder cur = new StringBuilder();
            for (String line : lines) {
                boolean isDecl = JAVA_MEMBER_BOUNDARY.matcher(line).find()
                    || TS_DECLARATION_BOUNDARY.matcher(line).find();
                if (isDecl && cur.length() > maxChars / 3) {
                    split.add(cur.toString().trim());
                    cur = new StringBuilder();
                }
                if (cur.length() > 0) cur.append("\n");
                cur.append(line);
            }
            if (cur.length() > 0) split.add(cur.toString().trim());
        }
        return hardBound(split, maxChars, overlap);
    }

    /** Existing paragraph-based chunking (unchanged logic, extracted for reuse). */
    private List<String> chunkByParagraph(String source, int maxChars, int overlap) {
        String[] blocks = source.split("\\n\\s*\\n");
        if (blocks.length == 0) {
            return List.of(trimTo(source, maxChars));
        }
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String block : blocks) {
            String text = block.trim();
            if (text.isBlank()) continue;
            if (current.length() > 0 && current.length() + 2 + text.length() > maxChars) {
                chunks.add(current.toString().trim());
                String tail = overlap > 0 && current.length() > overlap
                    ? current.substring(Math.max(0, current.length() - overlap)) : "";
                current = new StringBuilder(tail);
            }
            if (current.length() > 0) current.append("\n\n");
            current.append(text);
        }
        if (current.length() > 0) chunks.add(current.toString().trim());
        return hardBound(chunks, maxChars, overlap);
    }

    /** Enforce maxChars hard limit on every chunk, splitting with overlap. */
    private List<String> hardBound(List<String> chunks, int maxChars, int overlap) {
        List<String> bounded = new ArrayList<>();
        for (String chunk : chunks) {
            String value = chunk.trim();
            if (value.isBlank()) continue;
            if (value.length() <= maxChars) {
                bounded.add(value);
                continue;
            }
            int start = 0;
            while (start < value.length()) {
                int end = Math.min(value.length(), start + maxChars);
                bounded.add(value.substring(start, end).trim());
                if (end >= value.length()) break;
                start = Math.max(start + 1, end - overlap);
            }
        }
        return bounded;
    }

    private String md5Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private float[] embedQueryText(String text) {
        return aiLocalEmbeddingService.embedQueryText(text);
    }

    private float[] embedDocumentText(String text) {
        return aiLocalEmbeddingService.embedDocumentText(text);
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

    private String buildStructuralSummary(String sourceName, String chunk, String compactTags) {
        String safeChunk = String.valueOf(chunk == null ? "" : chunk);
        if (safeChunk.isBlank()) {
            return "";
        }
        String source = String.valueOf(sourceName == null ? "" : sourceName).trim();
        String sourceLower = source.toLowerCase(Locale.ROOT);
        boolean menuLike = sourceLower.contains("menu")
            || safeChunk.contains("\"parentId\"")
            || safeChunk.contains("\"type_form\"")
            || safeChunk.contains("\"table_name\"");
        boolean codeLike = !menuLike && (sourceLower.contains("code") || sourceLower.endsWith(".java") || sourceLower.endsWith(".ts") || sourceLower.endsWith(".js"));

        List<String> headings = extractPatternValues(HEADING_PATTERN, safeChunk, Math.max(2, structuralSummaryMaxHeadings));
        List<String> keys = extractPatternValues(JSON_KEY_PATTERN, safeChunk, Math.max(4, structuralSummaryMaxKeys));
        List<String> deps = extractPatternValues(IMPORT_TARGET_PATTERN, safeChunk, Math.max(3, structuralSummaryMaxDependencies));
        List<String> tables = extractPatternValues(MENU_TABLE_PATTERN, safeChunk, Math.max(2, structuralSummaryMaxDependencies));
        List<String> typeForms = extractPatternValues(MENU_TYPE_FORM_PATTERN, safeChunk, 6);
        List<String> anchors = extractTopTokens(safeChunk, 8);

        StringBuilder sb = new StringBuilder();
        sb.append("kind=").append(menuLike ? "menu" : codeLike ? "code" : "business");
        if (!source.isBlank()) {
            sb.append(" source=").append(source);
        }
        if (compactTags != null && !compactTags.isBlank()) {
            sb.append(" tags=").append(trimTo(compactTags.replace(' ', ','), 120));
        }
        if (!headings.isEmpty()) {
            sb.append(" headings=").append(String.join(",", headings));
        }
        if (!deps.isEmpty()) {
            sb.append(" deps=").append(String.join(",", deps));
        }
        if (!tables.isEmpty()) {
            sb.append(" tables=").append(String.join(",", tables));
        }
        if (!typeForms.isEmpty()) {
            sb.append(" typeForms=").append(String.join(",", typeForms));
        }
        if (!keys.isEmpty()) {
            sb.append(" keys=").append(String.join(",", keys));
        }
        if (!anchors.isEmpty()) {
            sb.append(" anchors=").append(String.join(",", anchors));
        }
        return trimTo(sb.toString(), 420);
    }

    private List<String> extractPatternValues(Pattern pattern, String source, int limit) {
        if (pattern == null) {
            return List.of();
        }
        LinkedHashSet<String> values = new LinkedHashSet<>();
        Matcher matcher = pattern.matcher(String.valueOf(source == null ? "" : source));
        while (matcher.find() && values.size() < Math.max(1, limit)) {
            String value = firstNonBlank(matcher.groupCount() >= 1 ? matcher.group(1) : "", matcher.groupCount() >= 2 ? matcher.group(2) : "");
            if (!value.isBlank()) {
                values.add(trimTo(value.replaceAll("\\s+", " ").trim(), 60));
            }
        }
        return new ArrayList<>(values);
    }

    private List<String> extractTopTokens(String text, int limit) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT));
        while (matcher.find() && out.size() < Math.max(1, limit)) {
            String token = String.valueOf(matcher.group() == null ? "" : matcher.group()).trim();
            if (token.length() >= 3) {
                out.add(token);
            }
        }
        return new ArrayList<>(out);
    }

    private String mergeIndexedSummary(String summary, String structure) {
        String safeSummary = String.valueOf(summary == null ? "" : summary).trim();
        String safeStructure = String.valueOf(structure == null ? "" : structure).trim();
        if (safeStructure.isBlank()) {
            return safeSummary;
        }
        if (safeSummary.isBlank()) {
            return safeStructure;
        }
        return trimTo(safeSummary + " | structure=" + safeStructure, 620);
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            String safe = String.valueOf(value == null ? "" : value).trim();
            if (!safe.isBlank()) {
                return safe;
            }
        }
        return "";
    }

    private String trimTo(String text, int maxChars) {
        String safe = String.valueOf(text == null ? "" : text);
        if (safe.length() <= maxChars) {
            return safe;
        }
        return safe.substring(0, Math.max(0, maxChars));
    }

    private interface WriteOperation<T> {
        T run() throws Exception;
    }

    private <T> T withWriteLockRetry(String appId, String operation, WriteOperation<T> operationBody) throws Exception {
        int attempts = Math.max(1, lockRetries + 1);
        int backoffMs = Math.max(10, lockBackoffMs);
        LockObtainFailedException lastLockEx = null;

        for (int attempt = 1; attempt <= attempts; attempt++) {
            try {
                return operationBody.run();
            } catch (LockObtainFailedException lockEx) {
                lastLockEx = lockEx;
                if (attempt >= attempts) {
                    break;
                }
                log.warn(
                    "Business memory write lock busy appId={} op={} attempt={}/{}; retrying in {}ms",
                    appId,
                    operation,
                    attempt,
                    attempts,
                    backoffMs * attempt
                );
                try {
                    Thread.sleep((long) backoffMs * attempt);
                } catch (InterruptedException interruptedException) {
                    Thread.currentThread().interrupt();
                    throw lockEx;
                }
            }
        }

        if (lastLockEx != null) {
            throw lastLockEx;
        }
        throw new IllegalStateException("Unexpected write retry state for operation: " + operation);
    }
}
