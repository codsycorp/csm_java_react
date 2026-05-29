package net.phanmemmottrieu.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GraphRAG layer for CSM local AI: metadata/symbol graph + community summaries + graph traversal retrieval.
 * Complements Lucene KNN + BM25 hybrid search (PHẦN C.5.3).
 */
@Service
public class AiGraphRagService {

    private static final Logger log = LoggerFactory.getLogger(AiGraphRagService.class);

    public static final String NODE_CLASS = "CLASS";
    public static final String NODE_METHOD = "METHOD";
    public static final String NODE_TABLE = "TABLE";
    public static final String NODE_ROUTE = "ROUTE";
    public static final String NODE_MENU_MODULE = "MENU_MODULE";
    public static final String NODE_MENU_NODE = "MENU_NODE";
    public static final String NODE_API_PATTERN = "API_PATTERN";
    public static final String NODE_LIFECYCLE = "LIFECYCLE";
    public static final String NODE_IMPORT = "IMPORT";
    public static final String NODE_CHUNK = "CHUNK";

    public static final String REL_CONTAINS = "CONTAINS";
    public static final String REL_DEPENDS_ON = "DEPENDS_ON";
    public static final String REL_BINDS_TABLE = "BINDS_TABLE";
    public static final String REL_ROUTES_TO = "ROUTES_TO";
    public static final String REL_PARENT_OF = "PARENT_OF";
    public static final String REL_TRIGGERS = "TRIGGERS";
    public static final String REL_INDEXED_AS = "INDEXED_AS";

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_\\-]{2,}", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern JAVA_CLASS_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:public|private|protected)?\\s*(?:abstract\\s+|static\\s+)*class\\s+([A-Za-z_][A-Za-z0-9_]*)");
    private static final Pattern JAVA_METHOD_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:public|private|protected)?\\s*(?:static\\s+)?(?:final\\s+)?(?:<[^>]+>\\s+)?[\\w\\[\\]<>,.?\\s]+\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(");
    private static final Pattern TS_CLASS_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:export\\s+)?(?:default\\s+)?class\\s+([A-Za-z_$][A-Za-z0-9_$]*)");
    private static final Pattern TS_FUNCTION_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(");
    private static final Pattern ROUTE_PATTERN = Pattern.compile(
        "(?m)@(?:Get|Post|Put|Delete|Patch|Request)Mapping\\s*\\(\\s*(?:value\\s*=\\s*)?[\"']([^\"']+)[\"']");
    private static final Pattern TABLE_NAME_PATTERN = Pattern.compile(
        "(?i)(?:table_name|tableName|\"table\"\\s*:\\s*\"|deleteRocksDB\\(\\s*\"[^\"]+\",\\s*\"([^\"]+)\")");
    private static final Pattern IMPORT_PATTERN = Pattern.compile(
        "(?m)^\\s*import\\s+(?:[^;\\n]*?\\s+from\\s+)?[\"']([^\"']+)[\"']|^\\s*import\\s+([A-Za-z0-9_.$]+)\\s*;");
    private static final Pattern MENU_TABLE_PATTERN = Pattern.compile("\"table_name\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern MENU_ID_PATTERN = Pattern.compile("\"id\"\\s*:\\s*\"([^\"]+)\"");

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GraphNode {
        public String id;
        public String type;
        public String label;
        public String snippet;
        public Map<String, String> meta = new LinkedHashMap<>();
        public long updatedAtMs;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GraphEdge {
        public String fromId;
        public String toId;
        public String relation;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GraphCommunity {
        public String id;
        public List<String> nodeIds = new ArrayList<>();
        public String theme;
        public String summary;
        public long updatedAtMs;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AppGraph {
        public String appId;
        public long version = 1L;
        public long updatedAtMs;
        public Map<String, GraphNode> nodes = new LinkedHashMap<>();
        public List<GraphEdge> edges = new ArrayList<>();
        public List<GraphCommunity> communities = new ArrayList<>();
        public Map<String, String> sourceHashes = new LinkedHashMap<>();
    }

    public record GraphRetrievalResult(
        List<String> seedNodeIds,
        List<String> expandedNodeIds,
        List<String> matchedCommunityIds,
        String localBlock,
        String globalBlock,
        int nodeCount,
        int edgeCount,
        int communityCount
    ) {}

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${ai.graphrag.enabled:true}")
    private boolean enabled;

    @Value("${ai.graphrag.store-dir:csm_datas/ai_local/ai_metadata_graph}")
    private String storeDir;

    @Value("${ai.graphrag.max-nodes-per-app:4000}")
    private int maxNodesPerApp;

    @Value("${ai.graphrag.max-edges-per-app:12000}")
    private int maxEdgesPerApp;

    @Value("${ai.graphrag.community.max-count:48}")
    private int maxCommunities;

    @Value("${ai.graphrag.retrieval.max-hops:2}")
    private int retrievalMaxHops;

    @Value("${ai.graphrag.retrieval.max-nodes:24}")
    private int retrievalMaxNodes;

    @Value("${ai.graphrag.retrieval.max-chars:3200}")
    private int retrievalMaxChars;

    @Value("${ai.graphrag.retrieval.global-max-communities:3}")
    private int globalMaxCommunities;

    private final ConcurrentHashMap<String, ReentrantLock> appLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AppGraph> graphCache = new ConcurrentHashMap<>();

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Ingest metadata graph from editor code (DynamicCode / Java / TS).
     */
    public int ingestFromCode(String appId, String sourceName, String code, int scopeMask) {
        if (!enabled) {
            return 0;
        }
        String safeCode = String.valueOf(code == null ? "" : code).trim();
        if (safeCode.isBlank()) {
            return 0;
        }
        String safeAppId = sanitizeAppId(appId);
        String safeSource = sanitizeSourceName(sourceName);
        String hash = md5Hex(safeCode);
        AppGraph graph = loadGraph(safeAppId);
        if (hash.equals(graph.sourceHashes.get("code:" + safeSource))) {
            return 0;
        }
        ReentrantLock lock = appLocks.computeIfAbsent(safeAppId, k -> new ReentrantLock());
        lock.lock();
        try {
            graph = loadGraph(safeAppId);
            if (hash.equals(graph.sourceHashes.get("code:" + safeSource))) {
                return 0;
            }
            removeNodesForSource(graph, safeSource);
            int added = buildCodeGraph(graph, safeSource, safeCode, scopeMask);
            graph.sourceHashes.put("code:" + safeSource, hash);
            rebuildCommunities(graph);
            saveGraph(graph);
            log.info("GraphRAG code ingest appId={} source={} nodes={} edges={} communities={} added={}",
                safeAppId, safeSource, graph.nodes.size(), graph.edges.size(), graph.communities.size(), added);
            return added;
        } finally {
            lock.unlock();
        }
    }

    /**
     * Ingest metadata graph from menu JSON.
     */
    public int ingestFromMenu(String appId, String sourceName, String menuJson, int scopeMask) {
        if (!enabled) {
            return 0;
        }
        String safeMenu = String.valueOf(menuJson == null ? "" : menuJson).trim();
        if (safeMenu.isBlank()) {
            return 0;
        }
        String safeAppId = sanitizeAppId(appId);
        String safeSource = sanitizeSourceName(sourceName);
        String hash = md5Hex(safeMenu);
        ReentrantLock lock = appLocks.computeIfAbsent(safeAppId, k -> new ReentrantLock());
        lock.lock();
        try {
            AppGraph graph = loadGraph(safeAppId);
            if (hash.equals(graph.sourceHashes.get("menu:" + safeSource))) {
                return 0;
            }
            removeNodesForSource(graph, safeSource);
            int added = buildMenuGraph(graph, safeSource, safeMenu, scopeMask);
            graph.sourceHashes.put("menu:" + safeSource, hash);
            rebuildCommunities(graph);
            saveGraph(graph);
            log.info("GraphRAG menu ingest appId={} source={} nodes={} edges={} communities={} added={}",
                safeAppId, safeSource, graph.nodes.size(), graph.edges.size(), graph.communities.size(), added);
            return added;
        } finally {
            lock.unlock();
        }
    }

    /**
     * GraphRAG retrieval: local BFS expansion + global community match → prompt block.
     */
    public String buildGraphRagBlock(
        String appId,
        String queryText,
        List<String> seedSymbols,
        int scopeMask,
        int maxCharsOverride
    ) {
        GraphRetrievalResult result = retrieve(appId, queryText, seedSymbols, scopeMask);
        int maxChars = maxCharsOverride > 0 ? maxCharsOverride : retrievalMaxChars;
        StringBuilder sb = new StringBuilder();
        if (result.globalBlock() != null && !result.globalBlock().isBlank()) {
            sb.append("## GraphRAG Global (community summaries)\n").append(result.globalBlock()).append("\n\n");
        }
        if (result.localBlock() != null && !result.localBlock().isBlank()) {
            sb.append("## GraphRAG Local (entity neighborhood)\n").append(result.localBlock());
        }
        String block = sb.toString().trim();
        if (block.isBlank()) {
            return "";
        }
        return trimToMax(block, maxChars);
    }

    public GraphRetrievalResult retrieve(String appId, String queryText, List<String> seedSymbols, int scopeMask) {
        if (!enabled) {
            return emptyResult();
        }
        AppGraph graph = loadGraph(sanitizeAppId(appId));
        if (graph.nodes.isEmpty()) {
            return emptyResult();
        }

        LinkedHashSet<String> seeds = new LinkedHashSet<>();
        seeds.addAll(matchQuerySeeds(graph, queryText));
        if (seedSymbols != null) {
            for (String sym : seedSymbols) {
                String safe = String.valueOf(sym == null ? "" : sym).trim();
                if (!safe.isBlank()) {
                    seeds.addAll(matchLabel(graph, safe));
                }
            }
        }
        if (seeds.isEmpty()) {
            seeds.addAll(fallbackHighSignalNodes(graph, scopeMask, 6));
        }

        List<String> expanded = expandNeighborhood(graph, seeds, retrievalMaxHops, retrievalMaxNodes);
        String localBlock = formatLocalBlock(graph, expanded);
        List<String> matchedCommunities = matchCommunities(graph, queryText, globalMaxCommunities);
        String globalBlock = formatGlobalBlock(graph, matchedCommunities);

        return new GraphRetrievalResult(
            new ArrayList<>(seeds),
            expanded,
            matchedCommunities,
            localBlock,
            globalBlock,
            graph.nodes.size(),
            graph.edges.size(),
            graph.communities.size()
        );
    }

    public Map<String, Object> statsForApp(String appId) {
        AppGraph graph = loadGraph(sanitizeAppId(appId));
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("enabled", enabled);
        stats.put("nodeCount", graph.nodes.size());
        stats.put("edgeCount", graph.edges.size());
        stats.put("communityCount", graph.communities.size());
        stats.put("updatedAtMs", graph.updatedAtMs);
        return stats;
    }

    // ── Graph building ─────────────────────────────────────────────────────

    private int buildCodeGraph(AppGraph graph, String sourceName, String code, int scopeMask) {
        long now = System.currentTimeMillis();
        int added = 0;
        String sourceNodeId = nodeId(sourceName, "SOURCE", sourceName);
        added += upsertNode(graph, sourceNodeId, "SOURCE", sourceName, "", sourceName, now, scopeMask);

        Matcher classMatcher = JAVA_CLASS_PATTERN.matcher(code);
        while (classMatcher.find() && graph.nodes.size() < maxNodesPerApp) {
            String className = classMatcher.group(1);
            String nodeId = nodeId(sourceName, NODE_CLASS, className);
            String snippet = extractSnippetAround(code, classMatcher.start(), 280);
            added += upsertNode(graph, nodeId, NODE_CLASS, className, snippet, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_CONTAINS);
        }
        Matcher tsClassMatcher = TS_CLASS_PATTERN.matcher(code);
        while (tsClassMatcher.find() && graph.nodes.size() < maxNodesPerApp) {
            String className = tsClassMatcher.group(1);
            String nodeId = nodeId(sourceName, NODE_CLASS, className);
            String snippet = extractSnippetAround(code, tsClassMatcher.start(), 280);
            added += upsertNode(graph, nodeId, NODE_CLASS, className, snippet, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_CONTAINS);
        }

        Matcher methodMatcher = JAVA_METHOD_PATTERN.matcher(code);
        int methodCount = 0;
        while (methodMatcher.find() && methodCount < 64 && graph.nodes.size() < maxNodesPerApp) {
            String methodName = methodMatcher.group(1);
            if (isNoiseSymbol(methodName)) {
                continue;
            }
            String nodeId = nodeId(sourceName, NODE_METHOD, methodName);
            String snippet = extractSnippetAround(code, methodMatcher.start(), 220);
            added += upsertNode(graph, nodeId, NODE_METHOD, methodName, snippet, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_CONTAINS);
            methodCount++;
        }
        Matcher tsFnMatcher = TS_FUNCTION_PATTERN.matcher(code);
        while (tsFnMatcher.find() && methodCount < 96 && graph.nodes.size() < maxNodesPerApp) {
            String fnName = tsFnMatcher.group(1);
            if (isNoiseSymbol(fnName)) {
                continue;
            }
            String nodeId = nodeId(sourceName, NODE_METHOD, fnName);
            String snippet = extractSnippetAround(code, tsFnMatcher.start(), 220);
            added += upsertNode(graph, nodeId, NODE_METHOD, fnName, snippet, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_CONTAINS);
            methodCount++;
        }

        Matcher routeMatcher = ROUTE_PATTERN.matcher(code);
        while (routeMatcher.find() && graph.nodes.size() < maxNodesPerApp) {
            String route = routeMatcher.group(1);
            String nodeId = nodeId(sourceName, NODE_ROUTE, route);
            added += upsertNode(graph, nodeId, NODE_ROUTE, route, route, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_ROUTES_TO);
        }

        LinkedHashSet<String> tables = new LinkedHashSet<>();
        Matcher tableMatcher = MENU_TABLE_PATTERN.matcher(code);
        while (tableMatcher.find() && tables.size() < 32) {
            tables.add(tableMatcher.group(1).toLowerCase(Locale.ROOT));
        }
        Matcher rocksMatcher = Pattern.compile("deleteRocksDB\\(\\s*\"[^\"]+\",\\s*\"([^\"]+)\"").matcher(code);
        while (rocksMatcher.find() && tables.size() < 48) {
            tables.add(rocksMatcher.group(1).toLowerCase(Locale.ROOT));
        }
        for (String table : tables) {
            String nodeId = nodeId(sourceName, NODE_TABLE, table);
            added += upsertNode(graph, nodeId, NODE_TABLE, table, table, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_BINDS_TABLE);
        }

        for (String api : List.of("helperApi", "ctx.api", "ctx.helperApi", "recordManager", "loadCombo", "saveData")) {
            if (code.contains(api) && graph.nodes.size() < maxNodesPerApp) {
                String nodeId = nodeId(sourceName, NODE_API_PATTERN, api);
                added += upsertNode(graph, nodeId, NODE_API_PATTERN, api, api, sourceName, now, scopeMask);
                added += upsertEdge(graph, sourceNodeId, nodeId, REL_DEPENDS_ON);
            }
        }
        for (String lifecycle : List.of("fnResetIP", "closeAllTabs", "timerRegistry", "broadcast_kqxs", "autoKqxs")) {
            if (code.contains(lifecycle) && graph.nodes.size() < maxNodesPerApp) {
                String nodeId = nodeId(sourceName, NODE_LIFECYCLE, lifecycle);
                added += upsertNode(graph, nodeId, NODE_LIFECYCLE, lifecycle, lifecycle, sourceName, now, scopeMask);
                added += upsertEdge(graph, sourceNodeId, nodeId, REL_DEPENDS_ON);
            }
        }

        Matcher importMatcher = IMPORT_PATTERN.matcher(code);
        int importCount = 0;
        while (importMatcher.find() && importCount < 24 && graph.nodes.size() < maxNodesPerApp) {
            String imp = importMatcher.group(1) != null ? importMatcher.group(1) : importMatcher.group(2);
            if (imp == null || imp.isBlank()) {
                continue;
            }
            String shortName = imp.contains(".") ? imp.substring(imp.lastIndexOf('.') + 1) : imp;
            String nodeId = nodeId(sourceName, NODE_IMPORT, shortName);
            added += upsertNode(graph, nodeId, NODE_IMPORT, shortName, imp, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_DEPENDS_ON);
            importCount++;
        }

        List<String> chunks = splitChunks(code, 1800);
        for (int i = 0; i < chunks.size() && i < 40; i++) {
            String chunkLabel = sourceName + "#" + i;
            String chunkNodeId = nodeId(sourceName, NODE_CHUNK, chunkLabel);
            added += upsertNode(graph, chunkNodeId, NODE_CHUNK, chunkLabel, chunks.get(i), sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, chunkNodeId, REL_INDEXED_AS);
        }
        return added;
    }

    private int buildMenuGraph(AppGraph graph, String sourceName, String menuJson, int scopeMask) {
        long now = System.currentTimeMillis();
        int added = 0;
        String sourceNodeId = nodeId(sourceName, "SOURCE", sourceName);
        added += upsertNode(graph, sourceNodeId, "SOURCE", sourceName, "", sourceName, now, scopeMask);

        List<String> moduleLabels = new ArrayList<>();
        LinkedHashSet<String> tables = new LinkedHashSet<>();
        List<Map<String, String>> nodeRecords = new ArrayList<>();

        extractMenuRecords(menuJson, moduleLabels, tables, nodeRecords, 0, 2500);

        for (String module : moduleLabels) {
            if (module.isBlank() || graph.nodes.size() >= maxNodesPerApp) {
                continue;
            }
            String nodeId = nodeId(sourceName, NODE_MENU_MODULE, module);
            added += upsertNode(graph, nodeId, NODE_MENU_MODULE, module, module, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_CONTAINS);
        }
        for (String table : tables) {
            String nodeId = nodeId(sourceName, NODE_TABLE, table);
            added += upsertNode(graph, nodeId, NODE_TABLE, table, table, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_BINDS_TABLE);
        }
        String lastModuleId = "";
        for (Map<String, String> rec : nodeRecords) {
            if (graph.nodes.size() >= maxNodesPerApp) {
                break;
            }
            String id = rec.getOrDefault("id", "");
            String label = rec.getOrDefault("label", id);
            String typeForm = rec.getOrDefault("type_form", "?");
            String table = rec.getOrDefault("table", "");
            String nodeId = nodeId(sourceName, NODE_MENU_NODE, id.isBlank() ? label : id);
            String snippet = "type_form=" + typeForm + (table.isBlank() ? "" : " table=" + table);
            added += upsertNode(graph, nodeId, NODE_MENU_NODE, label, snippet, sourceName, now, scopeMask);
            added += upsertEdge(graph, sourceNodeId, nodeId, REL_CONTAINS);
            if (!table.isBlank()) {
                String tableNodeId = nodeId(sourceName, NODE_TABLE, table);
                added += upsertEdge(graph, nodeId, tableNodeId, REL_BINDS_TABLE);
            }
            String parentModule = rec.getOrDefault("module", "");
            if (!parentModule.isBlank()) {
                String moduleNodeId = nodeId(sourceName, NODE_MENU_MODULE, parentModule);
                added += upsertEdge(graph, moduleNodeId, nodeId, REL_PARENT_OF);
            } else if (!lastModuleId.isBlank()) {
                added += upsertEdge(graph, lastModuleId, nodeId, REL_PARENT_OF);
            }
            if ("1".equals(typeForm) || "2".equals(typeForm) || "6".equals(typeForm)) {
                String trigger = rec.getOrDefault("trigger", "");
                if (!trigger.isBlank() && !"{}".equals(trigger)) {
                    String triggerNodeId = nodeId(sourceName, "TRIGGER", id + "_trigger");
                    added += upsertNode(graph, triggerNodeId, "TRIGGER", id + ":trigger", trimToMax(trigger, 180), sourceName, now, scopeMask);
                    added += upsertEdge(graph, nodeId, triggerNodeId, REL_TRIGGERS);
                }
            }
            if (rec.getOrDefault("is_module", "false").equals("true")) {
                lastModuleId = nodeId(sourceName, NODE_MENU_MODULE, label);
            }
        }
        return added;
    }

    @SuppressWarnings("unchecked")
    private void extractMenuRecords(
        String menuJson,
        List<String> moduleLabels,
        LinkedHashSet<String> tables,
        List<Map<String, String>> nodeRecords,
        int depth,
        int maxNodes
    ) {
        if (objectMapper == null || nodeRecords.size() >= maxNodes) {
            return;
        }
        try {
            Object parsed = objectMapper.readValue(menuJson, Object.class);
            List<?> roots = new ArrayList<>();
            if (parsed instanceof List<?> list) {
                roots = list;
            } else if (parsed instanceof Map<?, ?> map) {
                Object menu = map.get("menu");
                if (menu instanceof List<?> list) {
                    roots = list;
                } else {
                    roots = List.of(map);
                }
            }
            walkMenuNodes(roots, moduleLabels, tables, nodeRecords, depth, maxNodes, "");
        } catch (Exception ex) {
            log.debug("GraphRAG menu parse failed: {}", ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void walkMenuNodes(
        List<?> nodes,
        List<String> moduleLabels,
        LinkedHashSet<String> tables,
        List<Map<String, String>> nodeRecords,
        int depth,
        int maxNodes,
        String currentModule
    ) {
        if (nodes == null || nodeRecords.size() >= maxNodes) {
            return;
        }
        for (Object nodeObj : nodes) {
            if (!(nodeObj instanceof Map<?, ?> raw) || nodeRecords.size() >= maxNodes) {
                continue;
            }
            Map<String, Object> node = (Map<String, Object>) raw;
            Map<String, String> rec = new LinkedHashMap<>();
            String id = str(node.get("id"));
            if (id.isBlank()) {
                id = str(node.get("menu_id"));
            }
            String label = str(node.get("label"));
            String typeForm = str(node.get("type_form"));
            if (typeForm.isBlank()) {
                typeForm = str(node.get("typeForm"));
            }
            String table = str(node.get("table_name"));
            if (table.isBlank()) {
                table = str(node.get("tableName"));
            }
            rec.put("id", id);
            rec.put("label", label);
            rec.put("type_form", typeForm);
            rec.put("table", table.isBlank() ? "" : table.toLowerCase(Locale.ROOT));
            Object trigger = node.get("trigger");
            rec.put("trigger", trigger == null ? "" : String.valueOf(trigger).trim());

            boolean isModule = depth == 0 || "0".equals(typeForm);
            rec.put("is_module", Boolean.toString(isModule));
            String module = currentModule;
            if (isModule && !label.isBlank()) {
                moduleLabels.add(label);
                module = label;
            }
            rec.put("module", module);
            if (!table.isBlank()) {
                tables.add(table.toLowerCase(Locale.ROOT));
            }
            nodeRecords.add(rec);

            Object children = node.get("children");
            if (children instanceof List<?> childList && !childList.isEmpty()) {
                walkMenuNodes(childList, moduleLabels, tables, nodeRecords, depth + 1, maxNodes, module);
            }
        }
    }

    // ── Community detection (connected components on TABLE/API bridge subgraph) ──

    private void rebuildCommunities(AppGraph graph) {
        Map<String, Set<String>> adjacency = buildUndirectedAdjacency(graph);
        Set<String> visited = new HashSet<>();
        List<GraphCommunity> communities = new ArrayList<>();
        long now = System.currentTimeMillis();
        int communityIndex = 0;

        for (String nodeId : graph.nodes.keySet()) {
            if (visited.contains(nodeId)) {
                continue;
            }
            GraphNode node = graph.nodes.get(nodeId);
            if (node == null || !isCommunitySeedType(node.type)) {
                continue;
            }
            Set<String> component = new LinkedHashSet<>();
            Deque<String> queue = new ArrayDeque<>();
            queue.add(nodeId);
            while (!queue.isEmpty() && component.size() < 80) {
                String current = queue.pollFirst();
                if (!visited.add(current)) {
                    continue;
                }
                component.add(current);
                for (String neighbor : adjacency.getOrDefault(current, Set.of())) {
                    GraphNode neighborNode = graph.nodes.get(neighbor);
                    if (neighborNode != null && isCommunityEligibleType(neighborNode.type) && !visited.contains(neighbor)) {
                        queue.addLast(neighbor);
                    }
                }
            }
            if (component.size() < 2) {
                continue;
            }
            GraphCommunity community = new GraphCommunity();
            community.id = "C" + (++communityIndex);
            community.nodeIds = new ArrayList<>(component);
            community.theme = inferCommunityTheme(graph, component);
            community.summary = buildCommunitySummary(graph, component, community.theme);
            community.updatedAtMs = now;
            communities.add(community);
            if (communities.size() >= maxCommunities) {
                break;
            }
        }
        graph.communities = communities;
    }

    private Map<String, Set<String>> buildUndirectedAdjacency(AppGraph graph) {
        Map<String, Set<String>> adj = new HashMap<>();
        for (GraphEdge edge : graph.edges) {
            if (edge == null || edge.fromId == null || edge.toId == null) {
                continue;
            }
            adj.computeIfAbsent(edge.fromId, k -> new LinkedHashSet<>()).add(edge.toId);
            adj.computeIfAbsent(edge.toId, k -> new LinkedHashSet<>()).add(edge.fromId);
        }
        return adj;
    }

    private boolean isCommunitySeedType(String type) {
        return NODE_TABLE.equals(type) || NODE_MENU_MODULE.equals(type) || NODE_CLASS.equals(type);
    }

    private boolean isCommunityEligibleType(String type) {
        return NODE_TABLE.equals(type) || NODE_MENU_MODULE.equals(type) || NODE_MENU_NODE.equals(type)
            || NODE_CLASS.equals(type) || NODE_METHOD.equals(type) || NODE_ROUTE.equals(type)
            || NODE_API_PATTERN.equals(type) || "TRIGGER".equals(type);
    }

    private String inferCommunityTheme(AppGraph graph, Set<String> nodeIds) {
        LinkedHashSet<String> tables = new LinkedHashSet<>();
        LinkedHashSet<String> modules = new LinkedHashSet<>();
        for (String id : nodeIds) {
            GraphNode node = graph.nodes.get(id);
            if (node == null) {
                continue;
            }
            if (NODE_TABLE.equals(node.type)) {
                tables.add(node.label);
            } else if (NODE_MENU_MODULE.equals(node.type)) {
                modules.add(node.label);
            }
        }
        if (!modules.isEmpty()) {
            return "module:" + String.join(",", limitList(modules, 3));
        }
        if (!tables.isEmpty()) {
            return "table:" + String.join(",", limitList(tables, 3));
        }
        return "mixed";
    }

    private String buildCommunitySummary(AppGraph graph, Set<String> nodeIds, String theme) {
        LinkedHashSet<String> tables = new LinkedHashSet<>();
        LinkedHashSet<String> modules = new LinkedHashSet<>();
        LinkedHashSet<String> routes = new LinkedHashSet<>();
        LinkedHashSet<String> symbols = new LinkedHashSet<>();
        LinkedHashSet<String> apis = new LinkedHashSet<>();
        for (String id : nodeIds) {
            GraphNode node = graph.nodes.get(id);
            if (node == null) {
                continue;
            }
            switch (node.type) {
                case NODE_TABLE -> tables.add(node.label);
                case NODE_MENU_MODULE -> modules.add(node.label);
                case NODE_MENU_NODE -> symbols.add(node.label + "(tf=" + node.snippet + ")");
                case NODE_ROUTE -> routes.add(node.label);
                case NODE_CLASS, NODE_METHOD -> symbols.add(node.label);
                case NODE_API_PATTERN -> apis.add(node.label);
                default -> { }
            }
        }
        StringBuilder sb = new StringBuilder();
        sb.append("Theme ").append(theme);
        if (!modules.isEmpty()) {
            sb.append(" | modules=").append(String.join(", ", limitList(modules, 6)));
        }
        if (!tables.isEmpty()) {
            sb.append(" | tables=").append(String.join(", ", limitList(tables, 8)));
        }
        if (!routes.isEmpty()) {
            sb.append(" | routes=").append(String.join(", ", limitList(routes, 4)));
        }
        if (!apis.isEmpty()) {
            sb.append(" | api=").append(String.join(", ", limitList(apis, 6)));
        }
        if (!symbols.isEmpty()) {
            sb.append(" | symbols=").append(String.join(", ", limitList(symbols, 8)));
        }
        return trimToMax(sb.toString(), 420);
    }

    // ── Retrieval ──────────────────────────────────────────────────────────

    private LinkedHashSet<String> matchQuerySeeds(AppGraph graph, String queryText) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        String safeQuery = String.valueOf(queryText == null ? "" : queryText).trim().toLowerCase(Locale.ROOT);
        if (safeQuery.isBlank()) {
            return out;
        }
        Matcher tokenMatcher = TOKEN_PATTERN.matcher(safeQuery);
        List<String> tokens = new ArrayList<>();
        while (tokenMatcher.find() && tokens.size() < 16) {
            String tok = tokenMatcher.group();
            if (tok.length() >= 3) {
                tokens.add(tok);
            }
        }
        for (GraphNode node : graph.nodes.values()) {
            if (node == null || node.label == null) {
                continue;
            }
            String labelLower = node.label.toLowerCase(Locale.ROOT);
            for (String tok : tokens) {
                if (labelLower.contains(tok) || (node.id != null && node.id.toLowerCase(Locale.ROOT).contains(tok))) {
                    out.add(node.id);
                    break;
                }
            }
            if (out.size() >= 8) {
                break;
            }
        }
        return out;
    }

    private List<String> matchLabel(AppGraph graph, String label) {
        List<String> out = new ArrayList<>();
        String needle = label.toLowerCase(Locale.ROOT);
        for (GraphNode node : graph.nodes.values()) {
            if (node == null || node.label == null) {
                continue;
            }
            if (node.label.equalsIgnoreCase(label) || node.label.toLowerCase(Locale.ROOT).contains(needle)) {
                out.add(node.id);
            }
        }
        return out;
    }

    private List<String> fallbackHighSignalNodes(AppGraph graph, int scopeMask, int limit) {
        List<GraphNode> candidates = new ArrayList<>();
        for (GraphNode node : graph.nodes.values()) {
            if (node == null || NODE_CHUNK.equals(node.type) || "SOURCE".equals(node.type)) {
                continue;
            }
            if ((scopeMask & AiScopedContextIngestionService.SCOPE_MENU) != 0
                && (NODE_MENU_MODULE.equals(node.type) || NODE_MENU_NODE.equals(node.type) || NODE_TABLE.equals(node.type))) {
                candidates.add(node);
            } else if ((scopeMask & AiScopedContextIngestionService.SCOPE_CODE) != 0
                && (NODE_CLASS.equals(node.type) || NODE_METHOD.equals(node.type) || NODE_ROUTE.equals(node.type))) {
                candidates.add(node);
            }
        }
        candidates.sort(Comparator.comparingLong((GraphNode n) -> n.updatedAtMs).reversed());
        List<String> ids = new ArrayList<>();
        for (GraphNode node : candidates) {
            ids.add(node.id);
            if (ids.size() >= limit) {
                break;
            }
        }
        return ids;
    }

    private List<String> expandNeighborhood(AppGraph graph, Set<String> seeds, int maxHops, int maxNodes) {
        Map<String, Set<String>> adjacency = buildDirectedAdjacency(graph);
        LinkedHashMap<String, Integer> ranked = new LinkedHashMap<>();
        Deque<String> queue = new ArrayDeque<>();
        for (String seed : seeds) {
            if (graph.nodes.containsKey(seed)) {
                queue.add(seed);
                ranked.putIfAbsent(seed, 0);
            }
        }
        while (!queue.isEmpty() && ranked.size() < maxNodes) {
            String current = queue.pollFirst();
            int depth = ranked.getOrDefault(current, 0);
            if (depth >= maxHops) {
                continue;
            }
            for (String neighbor : adjacency.getOrDefault(current, Set.of())) {
                if (!graph.nodes.containsKey(neighbor) || ranked.containsKey(neighbor)) {
                    continue;
                }
                ranked.put(neighbor, depth + 1);
                queue.addLast(neighbor);
                if (ranked.size() >= maxNodes) {
                    break;
                }
            }
        }
        return new ArrayList<>(ranked.keySet());
    }

    private Map<String, Set<String>> buildDirectedAdjacency(AppGraph graph) {
        Map<String, Set<String>> adj = new HashMap<>();
        for (GraphEdge edge : graph.edges) {
            if (edge == null || edge.fromId == null || edge.toId == null) {
                continue;
            }
            adj.computeIfAbsent(edge.fromId, k -> new LinkedHashSet<>()).add(edge.toId);
            adj.computeIfAbsent(edge.toId, k -> new LinkedHashSet<>()).add(edge.fromId);
        }
        return adj;
    }

    private String formatLocalBlock(AppGraph graph, List<String> nodeIds) {
        if (nodeIds == null || nodeIds.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        int lines = 0;
        for (String nodeId : nodeIds) {
            GraphNode node = graph.nodes.get(nodeId);
            if (node == null || NODE_CHUNK.equals(node.type)) {
                continue;
            }
            String line = "- [" + node.type + "] " + node.label;
            if (node.snippet != null && !node.snippet.isBlank() && !node.snippet.equals(node.label)) {
                line += " — " + trimToMax(node.snippet.replace('\n', ' '), 160);
            }
            sb.append(line).append('\n');
            lines++;
            if (lines >= retrievalMaxNodes) {
                break;
            }
        }
        return sb.toString().trim();
    }

    private List<String> matchCommunities(AppGraph graph, String queryText, int maxCount) {
        List<String> matched = new ArrayList<>();
        String safeQuery = String.valueOf(queryText == null ? "" : queryText).toLowerCase(Locale.ROOT);
        if (safeQuery.isBlank() || graph.communities.isEmpty()) {
            return matched;
        }
        List<String> tokens = new ArrayList<>();
        Matcher m = TOKEN_PATTERN.matcher(safeQuery);
        while (m.find() && tokens.size() < 12) {
            if (m.group().length() >= 3) {
                tokens.add(m.group());
            }
        }
        for (GraphCommunity community : graph.communities) {
            if (community == null || community.summary == null) {
                continue;
            }
            String summaryLower = community.summary.toLowerCase(Locale.ROOT);
            for (String tok : tokens) {
                if (summaryLower.contains(tok)) {
                    matched.add(community.id);
                    break;
                }
            }
            if (matched.size() >= maxCount) {
                break;
            }
        }
        if (matched.isEmpty() && !graph.communities.isEmpty()) {
            for (GraphCommunity community : graph.communities) {
                matched.add(community.id);
                if (matched.size() >= maxCount) {
                    break;
                }
            }
        }
        return matched;
    }

    private String formatGlobalBlock(AppGraph graph, List<String> communityIds) {
        if (communityIds == null || communityIds.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (GraphCommunity community : graph.communities) {
            if (community == null || !communityIds.contains(community.id)) {
                continue;
            }
            sb.append("- ").append(community.id).append(": ").append(community.summary).append('\n');
        }
        return sb.toString().trim();
    }

    // ── Persistence ────────────────────────────────────────────────────────

    private AppGraph loadGraph(String appId) {
        if (appId.isBlank()) {
            return newAppGraph(appId);
        }
        AppGraph cached = graphCache.get(appId);
        if (cached != null) {
            return cached;
        }
        Path path = resolveGraphPath(appId);
        if (!Files.isRegularFile(path)) {
            AppGraph empty = newAppGraph(appId);
            graphCache.put(appId, empty);
            return empty;
        }
        try {
            AppGraph graph = objectMapper.readValue(path.toFile(), AppGraph.class);
            if (graph.nodes == null) {
                graph.nodes = new LinkedHashMap<>();
            }
            if (graph.edges == null) {
                graph.edges = new ArrayList<>();
            }
            if (graph.communities == null) {
                graph.communities = new ArrayList<>();
            }
            if (graph.sourceHashes == null) {
                graph.sourceHashes = new LinkedHashMap<>();
            }
            graph.appId = appId;
            graphCache.put(appId, graph);
            return graph;
        } catch (Exception ex) {
            log.warn("GraphRAG load failed appId={}: {}", appId, ex.getMessage());
            AppGraph empty = newAppGraph(appId);
            graphCache.put(appId, empty);
            return empty;
        }
    }

    private void saveGraph(AppGraph graph) {
        if (graph == null || graph.appId == null || graph.appId.isBlank()) {
            return;
        }
        trimGraphSize(graph);
        graph.updatedAtMs = System.currentTimeMillis();
        Path path = resolveGraphPath(graph.appId);
        try {
            Files.createDirectories(path.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), graph);
            graphCache.put(graph.appId, graph);
        } catch (Exception ex) {
            log.warn("GraphRAG save failed appId={}: {}", graph.appId, ex.getMessage());
        }
    }

    private void trimGraphSize(AppGraph graph) {
        if (graph.nodes.size() <= maxNodesPerApp) {
            return;
        }
        List<GraphNode> sorted = new ArrayList<>(graph.nodes.values());
        sorted.sort(Comparator.comparingLong((GraphNode n) -> n.updatedAtMs).reversed());
        LinkedHashMap<String, GraphNode> trimmed = new LinkedHashMap<>();
        for (GraphNode node : sorted) {
            trimmed.put(node.id, node);
            if (trimmed.size() >= maxNodesPerApp) {
                break;
            }
        }
        graph.nodes = trimmed;
        graph.edges.removeIf(e -> e == null || !graph.nodes.containsKey(e.fromId) || !graph.nodes.containsKey(e.toId));
        if (graph.edges.size() > maxEdgesPerApp) {
            graph.edges = new ArrayList<>(graph.edges.subList(0, maxEdgesPerApp));
        }
    }

    private void removeNodesForSource(AppGraph graph, String sourceName) {
        List<String> removeIds = new ArrayList<>();
        for (GraphNode node : graph.nodes.values()) {
            if (node != null && sourceName.equals(node.meta.getOrDefault("source", ""))) {
                removeIds.add(node.id);
            }
        }
        for (String id : removeIds) {
            graph.nodes.remove(id);
        }
        graph.edges.removeIf(e -> e == null || removeIds.contains(e.fromId) || removeIds.contains(e.toId));
    }

    private Path resolveGraphPath(String appId) {
        return Paths.get(String.valueOf(storeDir == null ? "csm_datas/ai_local/ai_metadata_graph" : storeDir).trim(),
            sanitizeAppId(appId), "graph.json");
    }

    private AppGraph newAppGraph(String appId) {
        AppGraph graph = new AppGraph();
        graph.appId = sanitizeAppId(appId);
        graph.updatedAtMs = System.currentTimeMillis();
        return graph;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private int upsertNode(
        AppGraph graph,
        String id,
        String type,
        String label,
        String snippet,
        String sourceName,
        long now,
        int scopeMask
    ) {
        if (graph.nodes.size() >= maxNodesPerApp && !graph.nodes.containsKey(id)) {
            return 0;
        }
        GraphNode node = graph.nodes.computeIfAbsent(id, k -> new GraphNode());
        boolean isNew = node.id == null;
        node.id = id;
        node.type = type;
        node.label = label;
        node.snippet = snippet;
        node.updatedAtMs = now;
        node.meta.put("source", sourceName);
        node.meta.put("scopeMask", Integer.toString(scopeMask));
        return isNew ? 1 : 0;
    }

    private int upsertEdge(AppGraph graph, String fromId, String toId, String relation) {
        if (graph.edges.size() >= maxEdgesPerApp) {
            return 0;
        }
        for (GraphEdge edge : graph.edges) {
            if (edge != null && fromId.equals(edge.fromId) && toId.equals(edge.toId) && relation.equals(edge.relation)) {
                return 0;
            }
        }
        GraphEdge edge = new GraphEdge();
        edge.fromId = fromId;
        edge.toId = toId;
        edge.relation = relation;
        graph.edges.add(edge);
        return 1;
    }

    private static String nodeId(String source, String type, String label) {
        String safeSource = String.valueOf(source == null ? "src" : source).replaceAll("[^a-zA-Z0-9_\\-]", "_");
        String safeType = String.valueOf(type == null ? "NODE" : type).replaceAll("[^a-zA-Z0-9_\\-]", "_");
        String safeLabel = String.valueOf(label == null ? "?" : label).replaceAll("[^a-zA-Z0-9_\\-]", "_");
        if (safeLabel.length() > 80) {
            safeLabel = safeLabel.substring(0, 80);
        }
        return safeSource + "::" + safeType + "::" + safeLabel;
    }

    private static boolean isNoiseSymbol(String name) {
        return name == null || name.isBlank() || name.length() < 3
            || Set.of("if", "for", "while", "try", "catch", "new", "get", "set", "add", "put").contains(name);
    }

    private static String extractSnippetAround(String text, int start, int maxLen) {
        int from = Math.max(0, start);
        int to = Math.min(text.length(), from + Math.max(80, maxLen));
        return trimToMax(text.substring(from, to).replace('\r', ' '), maxLen);
    }

    private static List<String> splitChunks(String text, int chunkSize) {
        List<String> chunks = new ArrayList<>();
        String safe = String.valueOf(text == null ? "" : text);
        int size = Math.max(400, chunkSize);
        for (int i = 0; i < safe.length(); i += size) {
            chunks.add(safe.substring(i, Math.min(safe.length(), i + size)));
        }
        return chunks;
    }

    private static List<String> limitList(Set<String> values, int max) {
        List<String> out = new ArrayList<>();
        for (String v : values) {
            out.add(v);
            if (out.size() >= max) {
                break;
            }
        }
        return out;
    }

    private static String str(Object value) {
        return String.valueOf(value == null ? "" : value).trim();
    }

    private static String sanitizeAppId(String appId) {
        String safe = String.valueOf(appId == null ? "" : appId).trim();
        if (safe.isBlank()) {
            return "default";
        }
        return safe.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    private static String sanitizeSourceName(String sourceName) {
        String safe = String.valueOf(sourceName == null ? "" : sourceName).trim();
        if (safe.isBlank()) {
            return "dyn_ctx_unknown";
        }
        return safe.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    private static String trimToMax(String text, int max) {
        String safe = String.valueOf(text == null ? "" : text);
        if (safe.length() <= max) {
            return safe;
        }
        return safe.substring(0, Math.max(0, max - 3)) + "...";
    }

    private static String md5Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(String.valueOf(text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            return Integer.toString(text == null ? 0 : text.hashCode());
        }
    }

    private static GraphRetrievalResult emptyResult() {
        return new GraphRetrievalResult(List.of(), List.of(), List.of(), "", "", 0, 0, 0);
    }
}
