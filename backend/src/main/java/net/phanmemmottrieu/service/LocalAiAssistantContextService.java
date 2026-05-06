package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.KnnFloatVectorField;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.KnnFloatVectorQuery;
import org.apache.lucene.search.MatchAllDocsQuery;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
public class LocalAiAssistantContextService {

    private static final Logger log = LoggerFactory.getLogger(LocalAiAssistantContextService.class);
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_$\\-]{2,}");
    private static final Pattern JSON_KEY_PATTERN = Pattern.compile("\"([^\"]+)\"\\s*:");
    private static final Pattern IMPORT_PATTERN = Pattern.compile("(?m)^\\s*import\\s+");
    private static final Pattern FUNCTION_PATTERN = Pattern.compile(
        "(?m)(?:function\\s+[A-Za-z_$][A-Za-z0-9_$]*\\s*\\(|[A-Za-z_$][A-Za-z0-9_$]*\\s*=\\s*\\([^\\)]*\\)\\s*=>|(?:public|private|protected)?\\s*(?:static\\s+)?[A-Za-z_$][A-Za-z0-9_$<>\\[\\]]*\\s+[A-Za-z_$][A-Za-z0-9_$]*\\s*\\()"
    );
    private static final Pattern CLASS_PATTERN = Pattern.compile("(?m)\\b(class|interface|enum|record)\\b");
    private static final Pattern API_CALL_PATTERN = Pattern.compile("(?i)\\b(fetch\\s*\\(|axios\\.|request\\.|\\.post\\s*\\(|\\.get\\s*\\(|\\.put\\s*\\()", Pattern.MULTILINE);
    private static final int VECTOR_DIMS = 128;
    private static final List<String> MENU_EXTENSIONS = List.of("md", "markdown", "json", "txt", "yml", "yaml");
    private static final List<String> CODE_EXTENSIONS = List.of("java", "js", "jsx", "ts", "tsx", "vue", "html", "css", "scss", "less", "sql", "json");
    private static final List<String> IGNORED_DIR_NAMES = List.of("node_modules", "target", "dist", "build", ".git", "logs");

    public record ContextBundle(
        String retrievalBlock,
        String analysisBlock,
        boolean forceLocalOnly,
        String reasonCode
    ) {}

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Object indexLock = new Object();

    private final AiBusinessMemoryVectorService aiBusinessMemoryVectorService;
    private final AiMenuLearningMemoryService aiMenuLearningMemoryService;

    @Value("${ai.local.assistant.enabled:true}")
    private boolean enabled;

    @Value("${ai.local.assistant.force-local-only:true}")
    private boolean forceLocalOnly;

    @Value("${ai.local.assistant.index-dir:csm_datas/ai_local/ai_local_assistant_index}")
    private String indexDir;

    @Value("${ai.local.assistant.source-roots:../frontend-admin/src,../backend/src/main/java,csm_datas/ai_local}")
    private String sourceRootsRaw;

    @Value("${ai.local.assistant.index-refresh-ms:300000}")
    private long indexRefreshMs;

    @Value("${ai.local.assistant.max-file-chars:800000}")
    private int maxFileChars;

    @Value("${ai.local.assistant.chunk-max-chars:2200}")
    private int chunkMaxChars;

    @Value("${ai.local.assistant.chunk-overlap-chars:180}")
    private int chunkOverlapChars;

    @Value("${ai.local.assistant.max-hits:6}")
    private int maxHits;

    @Value("${ai.local.assistant.max-retrieval-chars:18000}")
    private int maxRetrievalChars;

    @Value("${ai.local.assistant.max-analysis-chars:500000}")
    private int maxAnalysisChars;

    private volatile long lastIndexedAtMs = 0L;

    @Autowired
    public LocalAiAssistantContextService(
        AiBusinessMemoryVectorService aiBusinessMemoryVectorService,
        @Autowired(required = false) AiMenuLearningMemoryService aiMenuLearningMemoryService
    ) {
        this.aiBusinessMemoryVectorService = aiBusinessMemoryVectorService;
        this.aiMenuLearningMemoryService = aiMenuLearningMemoryService;
    }

    @PostConstruct
    public void initIndex() {
        if (enabled) {
            try {
                ensureIndexFresh();
            } catch (Exception ex) {
                log.warn("Local assistant index init on startup failed: {}", ex.getMessage(), ex);
            }
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean shouldForceLocalOnly(String contextType) {
        // Hard local-only disabled: when local output fails quality gate, cloud fallback is always allowed
        return false;
    }

    public ContextBundle buildContext(
        String appId,
        String message,
        String currentCode,
        String language,
        String contextType,
        String responseMode,
        String pName,
        Integer pType,
        int cursorLine
    ) {
        if (!enabled) {
            return new ContextBundle("", "", false, "disabled");
        }

        String normalizedContext = normalizeContextType(contextType);
        String retrievalBlock = buildRetrievalBlock(appId, message, currentCode, language, normalizedContext, pName, pType);
        String analysisBlock = buildAnalysisBlock(message, currentCode, language, normalizedContext, responseMode, cursorLine, pName, pType);
        boolean localOnly = shouldForceLocalOnly(normalizedContext);
        String reasonCode = localOnly ? "local_assistant_scope_local_only" : "local_assistant_scope_context_only";
        return new ContextBundle(retrievalBlock, analysisBlock, localOnly, reasonCode);
    }

    private String buildRetrievalBlock(
        String appId,
        String message,
        String currentCode,
        String language,
        String contextType,
        String pName,
        Integer pType
    ) {
        List<String> blocks = new ArrayList<>();
        String queryText = buildQueryText(message, currentCode, language, pName, pType);

        if ("menu_json".equals(contextType)) {
            String businessMemory = aiBusinessMemoryVectorService == null
                ? ""
                : aiBusinessMemoryVectorService.buildRagBlock(appId, queryText, Math.max(3, Math.min(6, maxHits)), Math.max(3000, maxRetrievalChars / 2));
            if (!businessMemory.isBlank()) {
                blocks.add(trimTo(businessMemory, Math.max(3000, maxRetrievalChars / 2)));
            }
            if (aiMenuLearningMemoryService != null) {
                String learned = String.valueOf(aiMenuLearningMemoryService.buildLearningContextBlock(appId, message) == null
                    ? ""
                    : aiMenuLearningMemoryService.buildLearningContextBlock(appId, message)).trim();
                if (!learned.isBlank()) {
                    blocks.add(trimTo(learned, Math.max(2200, maxRetrievalChars / 3)));
                }
            }
        }

        ensureIndexFresh();
        List<SearchHit> semanticHits = searchLocalSources(queryText, contextType, Math.max(2, maxHits));
        if (!semanticHits.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            sb.append("## LOCAL_SEMANTIC_SEARCH_CONTEXT\n");
            sb.append("Các đoạn dưới đây được truy hồi bằng Lucene KNN từ source local, dùng làm ví dụ/cấu trúc tham chiếu.\n\n");
            int idx = 1;
            for (SearchHit hit : semanticHits) {
                sb.append("### Hit ").append(idx++).append("\n");
                sb.append("path: ").append(hit.path()).append("\n");
                sb.append("scope: ").append(hit.scope()).append("\n");
                sb.append("score: ").append(String.format(Locale.ROOT, "%.4f", hit.score())).append("\n");
                sb.append("summary: ").append(hit.summary()).append("\n");
                sb.append("content:\n").append(hit.content()).append("\n\n");
                if (sb.length() >= Math.max(2200, maxRetrievalChars)) {
                    break;
                }
            }
            blocks.add(trimTo(sb.toString(), Math.max(2200, maxRetrievalChars)));
        }

        if (blocks.isEmpty()) {
            return "";
        }

        String joined = String.join("\n\n", blocks);
        return trimTo(joined, Math.max(3000, maxRetrievalChars));
    }

    private String buildAnalysisBlock(
        String message,
        String currentCode,
        String language,
        String contextType,
        String responseMode,
        int cursorLine,
        String pName,
        Integer pType
    ) {
        String code = String.valueOf(currentCode == null ? "" : currentCode);
        String safe = code.length() > Math.max(4000, maxAnalysisChars)
            ? code.substring(0, Math.max(4000, maxAnalysisChars))
            : code;

        if (safe.isBlank()) {
            return "";
        }

        if ("menu_json".equals(contextType)) {
            return buildMenuJsonAnalysisBlock(safe, cursorLine, pName, pType);
        }
        return buildCodeAnalysisBlock(safe, language, responseMode, cursorLine, message, pName, pType);
    }

    private String buildMenuJsonAnalysisBlock(String jsonText, int cursorLine, String pName, Integer pType) {
        StringBuilder sb = new StringBuilder();
        sb.append("## STATIC_ANALYSIS\n");
        sb.append("Loại ngữ cảnh: menu_json\n");
        if (pName != null && !pName.isBlank()) {
            sb.append("p_name: ").append(pName).append("\n");
        }
        if (pType != null) {
            sb.append("p_type: ").append(pType).append("\n");
        }

        try {
            JsonNode root = objectMapper.readTree(jsonText);
            sb.append("rootKind: ").append(root.isArray() ? "array" : root.isObject() ? "object" : "primitive").append("\n");
            sb.append("topLevelCount: ").append(root.isArray() ? root.size() : root.isObject() ? root.size() : 1).append("\n");
            sb.append("estimatedNodeCount: ").append(countJsonNodes(root, 0, 40000)).append("\n");

            if (root.isObject()) {
                List<String> arrayFields = new ArrayList<>();
                root.fieldNames().forEachRemaining(field -> {
                    JsonNode child = root.get(field);
                    if (child != null && child.isArray()) {
                        arrayFields.add(field + "(" + child.size() + ")");
                    }
                });
                if (!arrayFields.isEmpty()) {
                    sb.append("arrayFields: ").append(String.join(", ", arrayFields.subList(0, Math.min(8, arrayFields.size())))).append("\n");
                }
            }
        } catch (Exception ex) {
            sb.append("jsonParse: failed\n");
            sb.append("braceBalanceHint: ").append(estimateBraceBalance(jsonText)).append("\n");
        }

        if (cursorLine > 0) {
            sb.append("cursorLine: ").append(cursorLine).append("\n");
            String keyNearCursor = findJsonKeyNearLine(jsonText, cursorLine);
            if (!keyNearCursor.isBlank()) {
                sb.append("cursorJsonKey: ").append(keyNearCursor).append("\n");
            }
        }
        return sb.toString().trim();
    }

    private String buildCodeAnalysisBlock(
        String source,
        String language,
        String responseMode,
        int cursorLine,
        String message,
        String pName,
        Integer pType
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("## STATIC_ANALYSIS\n");
        sb.append("Loại ngữ cảnh: code\n");
        sb.append("language: ").append(String.valueOf(language == null ? "unknown" : language)).append("\n");
        sb.append("responseMode: ").append(String.valueOf(responseMode == null ? "analyze" : responseMode)).append("\n");
        if (pName != null && !pName.isBlank()) {
            sb.append("p_name: ").append(pName).append("\n");
        }
        if (pType != null) {
            sb.append("p_type: ").append(pType).append("\n");
        }

        String[] lines = source.split("\\n", -1);
        sb.append("lineCount: ").append(lines.length).append("\n");
        sb.append("importCount: ").append(countMatches(IMPORT_PATTERN, source)).append("\n");
        sb.append("functionLikeCount: ").append(countMatches(FUNCTION_PATTERN, source)).append("\n");
        sb.append("typeLikeCount: ").append(countMatches(CLASS_PATTERN, source)).append("\n");
        sb.append("apiCallCount: ").append(countMatches(API_CALL_PATTERN, source)).append("\n");

        if (looksLikeHtmlDocument(source, language)) {
            try {
                org.jsoup.nodes.Document doc = Jsoup.parse(source);
                sb.append("htmlTagCount: ").append(doc.getAllElements().size()).append("\n");
                sb.append("formCount: ").append(doc.select("form").size()).append("\n");
                sb.append("scriptTagCount: ").append(doc.select("script").size()).append("\n");
                List<String> keyTags = new ArrayList<>();
                for (Element element : doc.getAllElements()) {
                    String tag = element.tagName();
                    if (tag == null || tag.isBlank() || "#root".equals(tag) || keyTags.contains(tag)) {
                        continue;
                    }
                    keyTags.add(tag);
                    if (keyTags.size() >= 8) {
                        break;
                    }
                }
                if (!keyTags.isEmpty()) {
                    sb.append("keyTags: ").append(String.join(", ", keyTags)).append("\n");
                }
            } catch (Exception ex) {
                sb.append("htmlParse: failed\n");
            }
        }

        if (source.contains("useState(")) {
            sb.append("reactHooks: useState\n");
        }
        if (source.contains("useEffect(")) {
            sb.append("reactEffects: useEffect\n");
        }
        if (source.contains("<template") || source.contains("export default") || source.contains("setup()")) {
            sb.append("vueLikeComponent: true\n");
        }
        if (source.contains("bitfield") || source.toLowerCase(Locale.ROOT).contains("permission")) {
            sb.append("securitySensitiveLogic: bitfield_or_permission_detected\n");
        }
        if (cursorLine > 0) {
            sb.append("cursorLine: ").append(cursorLine).append("\n");
            String symbol = findNearestCodeSymbol(lines, cursorLine);
            if (!symbol.isBlank()) {
                sb.append("cursorSymbol: ").append(symbol).append("\n");
            }
        }
        List<String> requestSymbols = extractTopTokens(message, 6);
        if (!requestSymbols.isEmpty()) {
            sb.append("requestSymbols: ").append(String.join(", ", requestSymbols)).append("\n");
        }
        return sb.toString().trim();
    }

    private void ensureIndexFresh() {
        if (!enabled) {
            return;
        }
        Path indexPath = resolveIndexPath();
        long now = System.currentTimeMillis();
        if (lastIndexedAtMs > 0L && (now - lastIndexedAtMs) < Math.max(10000L, indexRefreshMs) && Files.isDirectory(indexPath)) {
            return;
        }
        synchronized (indexLock) {
            long refreshedNow = System.currentTimeMillis();
            if (lastIndexedAtMs > 0L && (refreshedNow - lastIndexedAtMs) < Math.max(10000L, indexRefreshMs) && Files.isDirectory(indexPath)) {
                return;
            }
            rebuildIndex(indexPath);
            lastIndexedAtMs = System.currentTimeMillis();
        }
    }

    private void rebuildIndex(Path indexPath) {
        try {
            Files.createDirectories(indexPath);
            try (Directory directory = FSDirectory.open(indexPath)) {
                IndexWriterConfig config = new IndexWriterConfig();
                try (IndexWriter writer = new IndexWriter(directory, config)) {
                    writer.deleteAll();
                    for (Path root : resolveSourceRoots()) {
                        if (!Files.exists(root)) {
                            continue;
                        }
                        try (Stream<Path> stream = Files.walk(root)) {
                            stream.filter(Files::isRegularFile)
                                .filter(this::shouldIndexFile)
                                .forEach(path -> indexFile(writer, root, path));
                        }
                    }
                    writer.commit();
                }
            }
        } catch (Exception ex) {
            log.warn("Local assistant index rebuild failed: {}", ex.getMessage());
        }
    }

    private void indexFile(IndexWriter writer, Path root, Path file) {
        try {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            if (text.isBlank()) {
                return;
            }
            String trimmed = text.length() > Math.max(2000, maxFileChars)
                ? text.substring(0, Math.max(2000, maxFileChars))
                : text;
            List<String> chunks = chunkContent(trimmed);
            String ext = extensionOf(file);
            String scope = inferScope(ext, file);
            String relativePath = normalizeStoredPath(root.relativize(file).toString());
            for (int i = 0; i < chunks.size(); i++) {
                String chunk = String.valueOf(chunks.get(i) == null ? "" : chunks.get(i)).trim();
                if (chunk.isBlank()) {
                    continue;
                }
                Document doc = new Document();
                doc.add(new StringField("path", relativePath, Field.Store.YES));
                doc.add(new StringField("ext", ext, Field.Store.YES));
                doc.add(new StringField("scope", scope, Field.Store.YES));
                doc.add(new StringField("chunkId", relativePath + "#" + i, Field.Store.YES));
                doc.add(new StoredField("createdAtMs", System.currentTimeMillis()));
                String summary = summarizeChunk(chunk);
                doc.add(new TextField("summary", summary, Field.Store.YES));
                doc.add(new TextField("content", chunk, Field.Store.YES));
                doc.add(new KnnFloatVectorField("vector", embedText(relativePath + "\n" + summary + "\n" + chunk)));
                writer.addDocument(doc);
            }
        } catch (Exception ex) {
            log.debug("Skip local assistant index file {}: {}", file, ex.getMessage());
        }
    }

    private List<SearchHit> searchLocalSources(String queryText, String contextType, int limit) {
        List<SearchHit> out = new ArrayList<>();
        Path indexPath = resolveIndexPath();
        if (!Files.isDirectory(indexPath)) {
            return out;
        }

        try (Directory directory = FSDirectory.open(indexPath)) {
            if (!DirectoryReader.indexExists(directory)) {
                return out;
            }
            try (DirectoryReader reader = DirectoryReader.open(directory)) {
                IndexSearcher searcher = new IndexSearcher(reader);
                TopDocs docs = searcher.search(new KnnFloatVectorQuery("vector", embedText(queryText), Math.max(limit * 4, 16)), Math.max(limit * 4, 16));
                for (ScoreDoc scoreDoc : docs.scoreDocs) {
                    Document doc = searcher.storedFields().document(scoreDoc.doc);
                    String scope = str(doc.get("scope"));
                    String ext = str(doc.get("ext"));
                    if (!matchesContext(scope, ext, contextType)) {
                        continue;
                    }
                    out.add(new SearchHit(
                        str(doc.get("path")),
                        scope,
                        str(doc.get("summary")),
                        trimTo(str(doc.get("content")), 1600),
                        scoreDoc.score
                    ));
                    if (out.size() >= Math.max(1, limit)) {
                        break;
                    }
                }
                if (out.isEmpty()) {
                    TopDocs fallback = searcher.search(new MatchAllDocsQuery(), Math.max(limit * 2, 8));
                    for (ScoreDoc scoreDoc : fallback.scoreDocs) {
                        Document doc = searcher.storedFields().document(scoreDoc.doc);
                        String scope = str(doc.get("scope"));
                        String ext = str(doc.get("ext"));
                        if (!matchesContext(scope, ext, contextType)) {
                            continue;
                        }
                        out.add(new SearchHit(
                            str(doc.get("path")),
                            scope,
                            str(doc.get("summary")),
                            trimTo(str(doc.get("content")), 1200),
                            scoreDoc.score
                        ));
                        if (out.size() >= Math.max(1, limit)) {
                            break;
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.debug("Local assistant semantic search failed: {}", ex.getMessage());
        }
        return out;
    }

    private boolean matchesContext(String scope, String ext, String contextType) {
        if ("menu_json".equals(contextType)) {
            return "menu_json".equals(scope) || MENU_EXTENSIONS.contains(ext);
        }
        return "code".equals(scope) || CODE_EXTENSIONS.contains(ext);
    }

    private List<Path> resolveSourceRoots() {
        List<Path> roots = new ArrayList<>();
        for (String raw : Arrays.asList(String.valueOf(sourceRootsRaw == null ? "" : sourceRootsRaw).split(","))) {
            String next = String.valueOf(raw == null ? "" : raw).trim();
            if (next.isBlank()) {
                continue;
            }
            Path path = Paths.get(next);
            if (!path.isAbsolute()) {
                path = Paths.get(System.getProperty("user.dir")).resolve(path).normalize();
            }
            roots.add(path);
        }
        return roots;
    }

    private Path resolveIndexPath() {
        Path path = Paths.get(String.valueOf(indexDir == null ? "" : indexDir).trim());
        if (!path.isAbsolute()) {
            path = Paths.get(System.getProperty("user.dir")).resolve(path).normalize();
        }
        return path;
    }

    private boolean shouldIndexFile(Path file) {
        String lower = normalizeStoredPath(file.toString()).toLowerCase(Locale.ROOT);
        for (String ignored : IGNORED_DIR_NAMES) {
            if (lower.contains("/" + ignored.toLowerCase(Locale.ROOT) + "/")) {
                return false;
            }
        }
        String ext = extensionOf(file);
        return MENU_EXTENSIONS.contains(ext) || CODE_EXTENSIONS.contains(ext);
    }

    private List<String> chunkContent(String text) {
        String source = String.valueOf(text == null ? "" : text).trim();
        if (source.isBlank()) {
            return List.of();
        }
        int maxChars = Math.max(800, chunkMaxChars);
        int overlap = Math.max(0, Math.min(Math.max(60, chunkOverlapChars), maxChars / 2));
        List<String> chunks = new ArrayList<>();
        int start = 0;
        while (start < source.length()) {
            int end = Math.min(source.length(), start + maxChars);
            if (end < source.length()) {
                int boundary = source.lastIndexOf('\n', end);
                if (boundary > start + Math.max(200, maxChars / 3)) {
                    end = boundary;
                }
            }
            String chunk = source.substring(start, Math.max(start + 1, end)).trim();
            if (!chunk.isBlank()) {
                chunks.add(chunk);
            }
            if (end >= source.length()) {
                break;
            }
            start = Math.max(end - overlap, start + 1);
        }
        return chunks;
    }

    private float[] embedText(String text) {
        float[] vector = new float[VECTOR_DIMS];
        Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT));
        int tokenCount = 0;
        while (matcher.find()) {
            String token = matcher.group();
            int h = Math.abs(token.hashCode());
            vector[h % VECTOR_DIMS] += 1.0f;
            tokenCount++;
        }
        if (tokenCount == 0) {
            return vector;
        }
        float norm = 0.0f;
        for (float value : vector) {
            norm += value * value;
        }
        norm = (float) Math.sqrt(norm);
        if (norm <= 0.0f) {
            return vector;
        }
        for (int i = 0; i < vector.length; i++) {
            vector[i] = vector[i] / norm;
        }
        return vector;
    }

    private int countJsonNodes(JsonNode node, int current, int cap) {
        if (node == null || current >= cap) {
            return current;
        }
        int next = current + 1;
        if (node.isObject()) {
            var it = node.fields();
            while (it.hasNext() && next < cap) {
                Map.Entry<String, JsonNode> entry = it.next();
                next = countJsonNodes(entry.getValue(), next, cap);
            }
            return next;
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                if (next >= cap) {
                    break;
                }
                next = countJsonNodes(child, next, cap);
            }
        }
        return next;
    }

    private String findJsonKeyNearLine(String jsonText, int cursorLine) {
        String[] lines = jsonText.split("\\n", -1);
        int center = Math.max(1, Math.min(lines.length, cursorLine)) - 1;
        int from = Math.max(0, center - 4);
        int to = Math.min(lines.length - 1, center + 4);
        for (int i = center; i >= from; i--) {
            Matcher matcher = JSON_KEY_PATTERN.matcher(lines[i]);
            if (matcher.find()) {
                return str(matcher.group(1));
            }
        }
        for (int i = center + 1; i <= to; i++) {
            Matcher matcher = JSON_KEY_PATTERN.matcher(lines[i]);
            if (matcher.find()) {
                return str(matcher.group(1));
            }
        }
        return "";
    }

    private String findNearestCodeSymbol(String[] lines, int cursorLine) {
        int center = Math.max(1, Math.min(lines.length, cursorLine)) - 1;
        int from = Math.max(0, center - 18);
        for (int i = center; i >= from; i--) {
            String line = String.valueOf(lines[i] == null ? "" : lines[i]).trim();
            if (line.isBlank()) {
                continue;
            }
            if (line.contains("function ") || line.matches(".*\\b(class|interface|enum|record)\\b.*") || line.contains("=>") || line.contains("(")) {
                return trimTo(line, 160);
            }
        }
        return "";
    }

    private boolean looksLikeHtmlDocument(String source, String language) {
        String lang = String.valueOf(language == null ? "" : language).trim().toLowerCase(Locale.ROOT);
        return "html".equals(lang)
            || source.contains("<template")
            || source.contains("<div")
            || source.contains("<form")
            || source.contains("</");
    }

    private int countMatches(Pattern pattern, String source) {
        Matcher matcher = pattern.matcher(String.valueOf(source == null ? "" : source));
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }

    private String buildQueryText(String message, String currentCode, String language, String pName, Integer pType) {
        StringBuilder sb = new StringBuilder();
        if (message != null && !message.isBlank()) {
            sb.append(message.trim()).append('\n');
        }
        if (language != null && !language.isBlank()) {
            sb.append("language:").append(language.trim()).append('\n');
        }
        if (pName != null && !pName.isBlank()) {
            sb.append("p_name:").append(pName.trim()).append('\n');
        }
        if (pType != null) {
            sb.append("p_type:").append(pType).append('\n');
        }
        String code = String.valueOf(currentCode == null ? "" : currentCode).trim();
        if (!code.isBlank()) {
            sb.append(trimTo(code, 5000));
        }
        return trimTo(sb.toString(), 7000);
    }

    private List<String> extractTopTokens(String text, int limit) {
        LinkedHashSet<String> tokens = new LinkedHashSet<>();
        Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT));
        while (matcher.find()) {
            String token = matcher.group();
            if (token.length() <= 2) {
                continue;
            }
            tokens.add(token);
            if (tokens.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return new ArrayList<>(tokens);
    }

    private String summarizeChunk(String chunk) {
        String source = String.valueOf(chunk == null ? "" : chunk).trim();
        if (source.isBlank()) {
            return "";
        }
        List<String> tokens = extractTopTokens(source, 12);
        String head = trimTo(source.replaceAll("\\s+", " "), 180);
        if (tokens.isEmpty()) {
            return head;
        }
        return head + " | tokens=" + String.join(",", tokens);
    }

    private String inferScope(String ext, Path file) {
        String lowerPath = normalizeStoredPath(file.toString()).toLowerCase(Locale.ROOT);
        if (MENU_EXTENSIONS.contains(ext) && (lowerPath.contains("/public/") || lowerPath.endsWith(".md") || lowerPath.endsWith(".json"))) {
            return "menu_json";
        }
        return "code";
    }

    private String extensionOf(Path file) {
        String name = String.valueOf(file.getFileName() == null ? "" : file.getFileName()).toLowerCase(Locale.ROOT);
        int idx = name.lastIndexOf('.');
        return idx >= 0 ? name.substring(idx + 1) : "";
    }

    private String normalizeContextType(String contextType) {
        String normalized = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? "code" : normalized;
    }

    private int estimateBraceBalance(String text) {
        int balance = 0;
        for (char ch : String.valueOf(text == null ? "" : text).toCharArray()) {
            if (ch == '{' || ch == '[') {
                balance++;
            } else if (ch == '}' || ch == ']') {
                balance--;
            }
        }
        return balance;
    }

    private String normalizeStoredPath(String raw) {
        return String.valueOf(raw == null ? "" : raw).replace('\\', '/');
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private String trimTo(String text, int maxChars) {
        String value = String.valueOf(text == null ? "" : text);
        if (maxChars <= 0 || value.length() <= maxChars) {
            return value;
        }
        int head = Math.max(120, (int) Math.floor(maxChars * 0.7d));
        int tail = Math.max(40, maxChars - head - 24);
        if (head + tail >= value.length()) {
            return value.substring(0, maxChars);
        }
        return value.substring(0, head) + "\n...[TRUNCATED]...\n" + value.substring(value.length() - tail);
    }

    private record SearchHit(
        String path,
        String scope,
        String summary,
        String content,
        float score
    ) {}
}