package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import jakarta.annotation.PreDestroy;

/**
 * Local agentic orchestration layer inspired by Copilot Agent workflows:
 * - Build a lightweight plan (planner phase)
 * - Execute local tools (metadata/symbol scan/attachment digest)
 * - Return compressed tiered context for final LLM call
 */
@Service
public class AiLocalOrchestrationService {

    private static final Logger log = LoggerFactory.getLogger(AiLocalOrchestrationService.class);
    private static final Pattern SEARCH_DIRECTIVE_PATTERN = Pattern.compile("(?is)\\[(?:SEARCH|SEARCH_QUERY)\\s*:\\s*([^\\]]{3,220})\\]");
    private static final Pattern FRESH_KNOWLEDGE_SIGNAL_PATTERN = Pattern.compile("(?i)\\b(202[4-9]|latest|new|moi nhat|mới nhất|cap nhat|cập nhật|release|changelog|version|phien ban|phiên bản|docs|documentation|api|framework|library|thu vien|thư viện)\\b");

    public static class OrchestrationResult {
        public boolean enabled;
        public int totalCharsBefore;
        public int totalCharsAfter;
        public int savedChars;
        public String routingTier = "solver_balanced";
        public String preferredModelHint = "";
        public String speculativeOperation = "none";
        public boolean speculativeExecuted;
        public List<String> planSteps = new ArrayList<>();
        public Map<String, Object> toolStats = new LinkedHashMap<>();
        public String compressedContextBlock = "";
        /**
         * OpenDevin AgentFinishAction pattern: when speculative execution fully answers a
         * simple stats/count request, this field holds the ready-made response.
         * If non-blank the controller should emit it directly and skip the full LLM call.
         */
        public String earlyFinishResponse = "";

        public static OrchestrationResult disabled() {
            OrchestrationResult out = new OrchestrationResult();
            out.enabled = false;
            return out;
        }
    }

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_\\-]{3,}", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern CODE_SYMBOL_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:public|private|protected)?\\s*(?:static\\s+)?(?:class|interface|enum|record|void|int|long|double|float|boolean|String|def|function)\\s+[A-Za-z_][A-Za-z0-9_]*.*$");
    private static final Pattern BRANCH_SIGNAL_PATTERN = Pattern.compile("(?i)\\b(if|else\\s+if|switch|case|catch|throw|return)\\b");
    private static final Pattern SIDE_EFFECT_SIGNAL_PATTERN = Pattern.compile("(?i)(fetch\\s*\\(|axios\\.|request\\.|socket\\.|emit\\s*\\(|setTimeout\\s*\\(|setInterval\\s*\\(|save\\s*\\(|update\\s*\\(|delete\\s*\\(|insert\\s*\\()");
    private static final Pattern STATE_SIGNAL_PATTERN = Pattern.compile("(?i)(useState\\s*\\(|useReducer\\s*\\(|set[A-Z][A-Za-z0-9_]*\\s*\\(|props\\.|state\\.|ref\\.)");
    
    // Type extraction: Java (public String, List<String>), TypeScript (string, interface User), Python (: str, """...(str)""")
    private static final Pattern CODE_TYPE_PATTERN = Pattern.compile(
        "(?:public|private|protected)?\\s*(?:static\\s+)?(?:final\\s+)?" +
        "(?:List|Set|Map|Optional|Stream|Function|Supplier|Consumer|Predicate|Comparable|Serializable|" +
        "String|int|long|double|float|boolean|byte|short|char|void|Object|" +
        "var|let|const|string|number|boolean|object|any|unknown|null|undefined|" +
        "str|int|float|bool|list|dict|tuple|Optional|Union|Type)" +
        "(?:<[^>]+>)?\\s*(?:&|\\|)?\\s*[A-Za-z_][A-Za-z0-9_]*");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiSpeculativeExecutionService aiSpeculativeExecutionService;
    private final AiMultimodalScannerService aiMultimodalScannerService;
    private final AiBusinessMemoryVectorService aiBusinessMemoryVectorService;

    @Autowired(required = false)
    private AiIntentClassifierService aiIntentClassifierService;

    @Autowired(required = false)
    private AiScopedContextIngestionService aiScopedContextIngestionService;

    @Autowired(required = false)
    private AiExecutionPlannerService aiExecutionPlannerService;

    @Autowired(required = false)
    private RequestContextTracer requestContextTracer;

    @Autowired(required = false)
    private AiRetrievalPolicyEngine aiRetrievalPolicyEngine;

    @Autowired(required = false)
    private AiAdaptiveRetryPolicy aiAdaptiveRetryPolicy;

    @Autowired(required = false)
    private AiLocalWorkflowAdvisorService aiLocalWorkflowAdvisorService;

    @Autowired(required = false)
    private AiLocalFlowContextPolicy aiLocalFlowContextPolicy;

    public AiLocalOrchestrationService(
        AiSpeculativeExecutionService aiSpeculativeExecutionService,
        @Autowired(required = false) AiMultimodalScannerService aiMultimodalScannerService,
        @Autowired(required = false) AiBusinessMemoryVectorService aiBusinessMemoryVectorService,
        @Autowired(required = false) AiRetrievalPolicyEngine aiRetrievalPolicyEngine
    ) {
        this.aiSpeculativeExecutionService = aiSpeculativeExecutionService;
        this.aiMultimodalScannerService = aiMultimodalScannerService;
        this.aiBusinessMemoryVectorService = aiBusinessMemoryVectorService;
        this.aiRetrievalPolicyEngine = aiRetrievalPolicyEngine;
    }

    @Value("${ai.orchestration.agentic.enabled:true}")
    private boolean enabled;

    @Value("${ai.orchestration.agentic.max-context-chars:22000}")
    private int maxContextChars;

    @Value("${ai.orchestration.agentic.max-code-symbols:40}")
    private int maxCodeSymbols;

    @Value("${ai.orchestration.agentic.max-attachment-items:8}")
    private int maxAttachmentItems;

    @Value("${ai.orchestration.agentic.max-intents:12}")
    private int maxIntents;

    @Value("${ai.orchestration.routing.matrix.enabled:true}")
    private boolean routingMatrixEnabled;

    @Value("${ai.orchestration.routing.matrix.planner-model:gemini-2.5-flash}")
    private String plannerModelHint;

    @Value("${ai.orchestration.routing.matrix.balanced-model:gemini-2.5-flash}")
    private String balancedModelHint;

    @Value("${ai.orchestration.routing.matrix.complex-model:gemini-2.5-pro}")
    private String complexModelHint;

    @Value("${ai.orchestration.multimodal.dynamic-ingest.enabled:true}")
    private boolean dynamicIngestEnabled;

    @Value("${ai.orchestration.multimodal.dynamic-ingest.max-markdown-chars:18000}")
    private int dynamicIngestMaxMarkdownChars;

    @Value("${ai.orchestration.multimodal.dynamic-ingest.async.enabled:true}")
    private boolean dynamicIngestAsyncEnabled;

    @Value("${ai.orchestration.multimodal.scope-rag.enabled:true}")
    private boolean scopedRagEnabled;

    @Value("${ai.orchestration.multimodal.scope-rag.top-k:6}")
    private int scopedRagTopK;

    /** AD-R6 — richer citation rows for Composer / usage dock. */
    @Value("${ai.local.rag.citations.max-hits:5}")
    private int ragCitationsMaxHits;

    @Value("${ai.orchestration.multimodal.scope-rag.max-chars:5000}")
    private int scopedRagMaxChars;

    @Value("${ai.orchestration.multimodal.scope-rag.quality.min-chars:1200}")
    private int scopedRagQualityMinChars;

    @Value("${ai.orchestration.multimodal.scope-rag.quality.retry-on-low:true}")
    private boolean scopedRagQualityRetryOnLow;

    @Value("${ai.orchestration.evidence.surface-remediation.enabled:true}")
    private boolean surfaceRemediationEnabled;

    @Value("${ai.orchestration.evidence.surface-remediation.context-types:menu_json,code}")
    private String surfaceRemediationContextTypes;

    @Value("${ai.orchestration.multimodal.scope-rag.adaptive.enabled:true}")
    private boolean adaptiveScopeRagEnabled;

    @Value("${ai.orchestration.multimodal.scope-rag.adaptive.min-top-k:3}")
    private int adaptiveScopeRagMinTopK;

    @Value("${ai.orchestration.multimodal.scope-rag.adaptive.max-top-k:10}")
    private int adaptiveScopeRagMaxTopK;

    @Value("${ai.orchestration.multimodal.scope-rag.adaptive.min-max-chars:1800}")
    private int adaptiveScopeRagMinMaxChars;

    @Value("${ai.orchestration.multimodal.scope-rag.adaptive.max-max-chars:9000}")
    private int adaptiveScopeRagMaxMaxChars;

    @Value("${ai.local.runtime.tier:}")
    private String aiLocalRuntimeTier;

    @Value("${ai.local.symbol.aware.retrieval.enabled:true}")
    private boolean symbolAwareRetrievalEnabled;

    @Value("${ai.local.symbol.aware.retrieval.top-k:3}")
    private int symbolAwareRetrievalTopK;

    @Value("${ai.local.symbol.aware.retrieval.max-chars:2400}")
    private int symbolAwareRetrievalMaxChars;

    @Value("${ai.local.symbol.aware.retrieval.min-symbols:2}")
    private int symbolAwareRetrievalMinSymbols;

    @Value("${ai.code.stream.type.aware.injection.enabled:true}")
    private boolean typeAwareInjectionEnabled;

    @Value("${ai.code.stream.type.aware.injection.max-types:20}")
    private int typeAwareInjectionMaxTypes;

    @Value("${ai.code.stream.type.aware.injection.max-chars:1600}")
    private int typeAwareInjectionMaxChars;

    @Value("${ai.code.stream.type.aware.injection.min-confidence:0.7}")
    private double typeAwareInjectionMinConfidence;

    @Value("${ai.orchestration.fast-unrelated.enabled:true}")
    private boolean fastUnrelatedEnabled;

    @Value("${ai.orchestration.fast-unrelated.confidence-threshold:0.85}")
    private double fastUnrelatedConfidenceThreshold;

    @Value("${ai.local.primary-flow.logic-outline.enabled:true}")
    private boolean primaryFlowLogicOutlineEnabled;

    @Value("${ai.local.primary-flow.logic-outline.max-lines:18}")
    private int primaryFlowLogicOutlineMaxLines;

    @Value("${ai.local.agentic.step.verifier.enabled:true}")
    private boolean stepVerifierEnabled;

    @Value("${ai.local.agentic.step.verifier.min-score:62}")
    private int stepVerifierMinScore;

    @Value("${ai.local.agentic.plan-schema.enabled:true}")
    private boolean planSchemaEnabled;

    @Value("${ai.local.agentic.plan-schema.min-score:68}")
    private int planSchemaMinScore;

    @Value("${ai.local.orchestration.tool-dag.enabled:true}")
    private boolean toolDagEnabled;

    @Value("${ai.local.orchestration.tool-dag.max-nodes:8}")
    private int toolDagMaxNodes;

    @Value("${ai.local.orchestration.tool-dag.min-confidence-stop:0.62}")
    private double toolDagMinConfidenceStop;

    @Value("${ai.orchestration.web-search.enabled:${AI_ORCHESTRATION_WEB_SEARCH_ENABLED:true}}")
    private boolean agenticWebSearchEnabled;

    @Value("${ai.orchestration.web-search.min-internal-rag-chars:${AI_ORCHESTRATION_WEB_SEARCH_MIN_INTERNAL_RAG_CHARS:900}}")
    private int agenticWebSearchMinInternalRagChars;

    @Value("${ai.orchestration.web-search.query-max-chars:${AI_ORCHESTRATION_WEB_SEARCH_QUERY_MAX_CHARS:120}}")
    private int agenticWebSearchQueryMaxChars;

    @Value("${ai.orchestration.web-search.llama-max-output-tokens:${AI_ORCHESTRATION_WEB_SEARCH_LLAMA_MAX_OUTPUT_TOKENS:72}}")
    private int agenticWebSearchLlamaMaxOutputTokens;

    private final ThreadLocal<RecoveryHints> recoveryHintsContext = new ThreadLocal<>();

    private final ExecutorService dynamicIngestExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ai-dynamic-ingest");
        t.setDaemon(true);
        return t;
    });

    // Thread-safe singleton runtime cache shared across orchestration turns.
    private enum OrchestrationRuntimeSingleton {
        INSTANCE;

        private final ConcurrentHashMap<String, Object[]> routeCache = new ConcurrentHashMap<>();

        String getRoute(String key, long ttlMs) {
            Object[] cached = routeCache.get(key);
            if (cached == null) {
                return "";
            }
            long ts = (long) cached[1];
            if (System.currentTimeMillis() - ts > Math.max(1L, ttlMs)) {
                routeCache.remove(key);
                return "";
            }
            return String.valueOf(cached[0]);
        }

        void putRoute(String key, String route) {
            if (key == null || key.isBlank()) {
                return;
            }
            routeCache.put(key, new Object[]{String.valueOf(route == null ? "" : route), System.currentTimeMillis()});
        }
    }

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Autowired(required = false)
    private AiAgenticWebSearchService aiAgenticWebSearchService;

    @Autowired(required = false)
    private AiTenantKnowledgeIngestionService aiTenantKnowledgeIngestionService;

    // Builder + Prototype: immutable orchestration input without deep copy overhead.
    private static final class OrchestrationRequest {
        final String appId;
        final String message;
        final String currentCode;
        final List<Map<String, Object>> attachments;
        final String contextType;
        final String taskType;
        final String responseMode;
        final String language;
        final String pName;
        final Integer pType;

        private interface AttachmentSnapshotFactory {
            List<Map<String, Object>> freeze(List<Map<String, Object>> attachments);
        }

        private static final class ShallowImmutableAttachmentFactory implements AttachmentSnapshotFactory {
            @Override
            public List<Map<String, Object>> freeze(List<Map<String, Object>> attachments) {
                if (attachments == null || attachments.isEmpty()) {
                    return List.of();
                }
                List<Map<String, Object>> out = new ArrayList<>(attachments.size());
                for (Map<String, Object> item : attachments) {
                    if (item == null || item.isEmpty()) {
                        out.add(Map.of());
                        continue;
                    }
                    out.add(Collections.unmodifiableMap(new LinkedHashMap<>(item)));
                }
                return Collections.unmodifiableList(out);
            }
        }

        private static final AttachmentSnapshotFactory ATTACHMENT_SNAPSHOT_FACTORY = new ShallowImmutableAttachmentFactory();

        private OrchestrationRequest(Builder builder) {
            this.appId = builder.appId;
            this.message = builder.message;
            this.currentCode = builder.currentCode;
            this.attachments = ATTACHMENT_SNAPSHOT_FACTORY.freeze(builder.attachments);
            this.contextType = builder.contextType;
            this.taskType = builder.taskType;
            this.responseMode = builder.responseMode;
            this.language = builder.language;
            this.pName = builder.pName;
            this.pType = builder.pType;
        }

        Builder prototype() {
            return new Builder()
                .appId(appId)
                .message(message)
                .currentCode(currentCode)
                .attachments(attachments)
                .contextType(contextType)
                .taskType(taskType)
                .responseMode(responseMode)
                .language(language)
                .pName(pName)
                .pType(pType);
        }

        static Builder builder() {
            return new Builder();
        }

        static final class Builder {
            private String appId = "";
            private String message = "";
            private String currentCode = "";
            private List<Map<String, Object>> attachments = List.of();
            private String contextType = "code";
            private String taskType = "";
            private String responseMode = "edit";
            private String language = "";
            private String pName = "";
            private Integer pType;

            Builder appId(String value) { this.appId = String.valueOf(value == null ? "" : value); return this; }
            Builder message(String value) { this.message = String.valueOf(value == null ? "" : value); return this; }
            Builder currentCode(String value) { this.currentCode = String.valueOf(value == null ? "" : value); return this; }
            Builder attachments(List<Map<String, Object>> value) { this.attachments = value == null ? List.of() : value; return this; }
            Builder contextType(String value) { this.contextType = String.valueOf(value == null ? "code" : value); return this; }
            Builder taskType(String value) { this.taskType = String.valueOf(value == null ? "" : value); return this; }
            Builder responseMode(String value) { this.responseMode = String.valueOf(value == null ? "edit" : value); return this; }
            Builder language(String value) { this.language = String.valueOf(value == null ? "" : value); return this; }
            Builder pName(String value) { this.pName = String.valueOf(value == null ? "" : value).trim(); return this; }
            Builder pType(Integer value) { this.pType = value; return this; }

            OrchestrationRequest build() {
                return new OrchestrationRequest(this);
            }
        }
    }

    // Import at top of imports section if needed

    private record FlowDecision(String routeName, boolean quickReply, String reason) {}

    private interface FlowHandler {
        FlowDecision decide(OrchestrationRequest request, LocalToolDigest digest, double offTopicConfidence, double threshold);
    }

    private static final class QuickReplyFlowHandler implements FlowHandler {
        @Override
        public FlowDecision decide(OrchestrationRequest request, LocalToolDigest digest, double offTopicConfidence, double threshold) {
            boolean quick = offTopicConfidence > threshold;
            return new FlowDecision("planner_fast", quick, "offtopic_confidence");
        }
    }

    private static final class MainFlowHandler implements FlowHandler {
        @Override
        public FlowDecision decide(OrchestrationRequest request, LocalToolDigest digest, double offTopicConfidence, double threshold) {
            return new FlowDecision("solver_balanced", false, "main_flow_required");
        }
    }

    // Factory Method: chooses a route handler based on current request profile.
    private interface FlowHandlerFactory {
        FlowHandler create(OrchestrationRequest request, double offTopicConfidence, double threshold, boolean fastUnrelatedEnabled);
    }

    private static final class DefaultFlowHandlerFactory implements FlowHandlerFactory {
        @Override
        public FlowHandler create(OrchestrationRequest request, double offTopicConfidence, double threshold, boolean fastUnrelatedEnabled) {
            if (fastUnrelatedEnabled && offTopicConfidence > threshold) {
                return new QuickReplyFlowHandler();
            }
            return new MainFlowHandler();
        }
    }

    // Director: orchestrates routing order using factory outputs and cache reuse.
    private static final class FlowDirector {
        private final FlowHandlerFactory factory;

        private FlowDirector(FlowHandlerFactory factory) {
            this.factory = factory;
        }

        FlowDecision direct(OrchestrationRequest request, LocalToolDigest digest, double offTopicConfidence, double threshold, boolean fastUnrelatedEnabled) {
            String key = (request.contextType + "|" + request.taskType + "|" + truncateCacheKey(request.message)).toLowerCase(Locale.ROOT);
            String cachedRoute = OrchestrationRuntimeSingleton.INSTANCE.getRoute(key, 20_000L);
            if ("planner_fast".equals(cachedRoute)) {
                return new FlowDecision("planner_fast", true, "cached_offtopic_route");
            }
            FlowHandler handler = factory.create(request, offTopicConfidence, threshold, fastUnrelatedEnabled);
            FlowDecision decision = handler.decide(request, digest, offTopicConfidence, threshold);
            OrchestrationRuntimeSingleton.INSTANCE.putRoute(key, decision.routeName());
            return decision;
        }

        private static String truncateCacheKey(String text) {
            String safe = String.valueOf(text == null ? "" : text).trim();
            return safe.length() > 140 ? safe.substring(0, 140) : safe;
        }
    }

    private static final FlowDirector FLOW_DIRECTOR = new FlowDirector(new DefaultFlowHandlerFactory());

    private record RetrievalTuningProfile(int topKBoost, int maxCharsBoost, boolean prioritizeSchema) {}

    private static final class RecoveryHints {
        String strategyId = "none";
        double topKMultiplier = 1.0;
        double maxCharsMultiplier = 1.0;
        int scopeMaskOr = 0;
        Integer stepVerifierMinScoreOverride = null;
        Integer planSchemaMinScoreOverride = null;
        int maxCodeChars = 0;
        int maxAttachmentCharsTotal = 0;
        Map<String, Object> adjustments = new LinkedHashMap<>();
    }

    private interface RetrievalProfileFactory {
        RetrievalTuningProfile create(OrchestrationRequest request);
    }

    private static final class CodeRetrievalProfileFactory implements RetrievalProfileFactory {
        @Override
        public RetrievalTuningProfile create(OrchestrationRequest request) {
            int codeChars = String.valueOf(request.currentCode == null ? "" : request.currentCode).length();
            int topKBoost = codeChars > 80_000 ? 1 : 0;
            int maxCharsBoost = codeChars > 80_000 ? 1200 : 0;
            return new RetrievalTuningProfile(topKBoost, maxCharsBoost, false);
        }
    }

    private static final class MenuRetrievalProfileFactory implements RetrievalProfileFactory {
        @Override
        public RetrievalTuningProfile create(OrchestrationRequest request) {
            return new RetrievalTuningProfile(1, 800, true);
        }
    }

    // Abstract Factory: resolves retrieval profile for each context family.
    private static final class RetrievalProfileAbstractFactory {
        private final RetrievalProfileFactory codeFactory = new CodeRetrievalProfileFactory();
        private final RetrievalProfileFactory menuFactory = new MenuRetrievalProfileFactory();

        RetrievalTuningProfile create(OrchestrationRequest request) {
            String ctx = String.valueOf(request.contextType == null ? "" : request.contextType).toLowerCase(Locale.ROOT);
            String task = String.valueOf(request.taskType == null ? "" : request.taskType).toLowerCase(Locale.ROOT);
            if ("menu_json".equals(ctx) || task.contains("menu")) {
                return menuFactory.create(request);
            }
            return codeFactory.create(request);
        }
    }

    private static final RetrievalProfileAbstractFactory RETRIEVAL_PROFILE_FACTORY = new RetrievalProfileAbstractFactory();

    @PreDestroy
    public void shutdownExecutors() {
        dynamicIngestExecutor.shutdownNow();
    }

    public boolean isLocalVisionReady() {
        return aiMultimodalScannerService != null && aiMultimodalScannerService.isVisionRuntimeReady();
    }

    /**
     * Validates menu JSON structure early to detect nodeId issues before orchestration.
     * Returns a degraded result if menu JSON lacks nodeIds, instructing frontend to provide
     * proper menu payload with "id" fields.
     */
    private OrchestrationResult validateMenuJsonStructure(
        String appId,
        String currentCode,
        String requestId
    ) {
        if (currentCode == null || currentCode.isBlank()) {
            OrchestrationResult result = new OrchestrationResult();
            result.enabled = true;
            result.compressedContextBlock = "";
            result.toolStats.put("menu_json_validation", "empty_payload");
            return null;  // proceed with empty menu
        }

        try {
            Object parsed = new com.fasterxml.jackson.databind.ObjectMapper().readValue(currentCode, Object.class);
            if (parsed instanceof java.util.List<?> list) {
                // Check if any item has "id" field
                for (Object item : list) {
                    if (item instanceof java.util.Map<?, ?> map) {
                        Object idVal = map.get("id");
                        if (idVal != null && !String.valueOf(idVal).isBlank()) {
                            return null;  // valid
                        }
                    }
                }
                // No nodeId found in any menu item
                OrchestrationResult result = new OrchestrationResult();
                result.enabled = false;
                result.totalCharsBefore = currentCode.length();
                result.compressedContextBlock = 
                    "Menu JSON validation FAILED: No menu items with 'id' field found.\n" +
                    "Frontend must send a valid menu JSON array where each item has an 'id' property.\n" +
                    "Example: [{\"id\":\"menu_001\", \"label\":\"...\", ...}, ...]";
                result.toolStats.put("menu_json_validation", "missing_nodeids");
                result.toolStats.put("menu_item_count", list.size());
                result.toolStats.put("request_id", requestId);
                return result;  // return validation failure
            }
        } catch (Exception ex) {
            log.warn("Menu JSON validation error requestId={}: {}", requestId, ex.getMessage());
            OrchestrationResult result = new OrchestrationResult();
            result.enabled = false;
            result.compressedContextBlock = 
                "Menu JSON parsing FAILED: " + ex.getMessage() + ".\n" +
                "Frontend must send valid JSON array of menu items.";
            result.toolStats.put("menu_json_validation", "parse_error");
            result.toolStats.put("error_message", ex.getMessage());
            return result;  // return validation failure
        }
        return null;  // proceed
    }

    public OrchestrationResult orchestrate(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language
    ) {
        return orchestrate(appId, message, currentCode, attachments, contextType, taskType, responseMode, language, null, "", null);
    }

    /**
     * Resilient wrapper that never throws to controller.
     * If full orchestration fails, emit a degraded but structured context block.
     */
    public OrchestrationResult orchestrateResilient(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        String requestId
    ) {
        return orchestrateResilient(appId, message, currentCode, attachments, contextType, taskType, responseMode, language, requestId, "", null);
    }

    public OrchestrationResult orchestrateResilient(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        String requestId,
        String pName,
        Integer pType
    ) {
        try {
            OrchestrationResult out = orchestrate(
                appId,
                message,
                currentCode,
                attachments,
                contextType,
                taskType,
                responseMode,
                language,
                requestId,
                pName,
                pType
            );
            if (aiAdaptiveRetryPolicy != null) {
                aiAdaptiveRetryPolicy.recordRetryOutcome(AiAdaptiveRetryPolicy.RetryReason.UPSTREAM_FAILURE, true);
            }
            return out;
        } catch (Exception ex) {
            String safeRequestId = String.valueOf(requestId == null ? "" : requestId).trim();
            if (safeRequestId.isBlank()) {
                safeRequestId = "orch-resilient-" + UUID.randomUUID();
            }
            log.warn("orchestrateResilient fallback activated requestId={} appId={} reason={}",
                safeRequestId,
                String.valueOf(appId == null ? "" : appId),
                ex.getMessage());

            AiAdaptiveRetryPolicy.RetryDecision retryDecision = null;
            if (aiAdaptiveRetryPolicy != null) {
                retryDecision = aiAdaptiveRetryPolicy.decideRetry(
                    String.valueOf(appId == null ? "" : appId),
                    safeRequestId,
                    AiAdaptiveRetryPolicy.RetryReason.UPSTREAM_FAILURE,
                    1,
                    1,
                    0L
                );
                aiAdaptiveRetryPolicy.recordRetryOutcome(AiAdaptiveRetryPolicy.RetryReason.UPSTREAM_FAILURE, false);
            }

            if (retryDecision != null && retryDecision.shouldRetry && retryDecision.strategy != null) {
                RecoveryHints hints = mapRecoveryHints(retryDecision.strategy);
                OrchestrationResult recovered = tryOrchestrateWithRecovery(
                    appId,
                    message,
                    currentCode,
                    attachments,
                    contextType,
                    taskType,
                    responseMode,
                    language,
                    safeRequestId + "-retry1",
                    pName,
                    pType,
                    hints
                );
                if (recovered != null && recovered.enabled && recovered.compressedContextBlock != null && !recovered.compressedContextBlock.isBlank()) {
                    recovered.toolStats.put("recoveryRetryAttempted", true);
                    recovered.toolStats.put("recoveryRetrySucceeded", true);
                    recovered.toolStats.put("recoveryRetryStrategy", hints.strategyId);
                    recovered.toolStats.put("recoveryRetryAdjustments", hints.adjustments);
                    return recovered;
                }
            }

            return buildDegradedOrchestrationResult(
                appId,
                message,
                currentCode,
                attachments,
                contextType,
                taskType,
                responseMode,
                language,
                safeRequestId,
                pName,
                pType,
                ex,
                retryDecision
            );
        }
    }

    public OrchestrationResult orchestrateResilient(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        String requestId,
        String pName,
        Integer pType,
        AiRetrievalAuthContext retrievalAuthContext
    ) {
        if (aiBusinessMemoryVectorService != null) {
            aiBusinessMemoryVectorService.bindRetrievalAuthContext(retrievalAuthContext);
        }
        try {
            OrchestrationResult out = orchestrateResilient(
                appId,
                message,
                currentCode,
                attachments,
                contextType,
                taskType,
                responseMode,
                language,
                requestId,
                pName,
                pType
            );
            if (retrievalAuthContext != null && out != null && out.toolStats != null) {
                out.toolStats.put("retrievalAuthFilterEnabled", retrievalAuthContext.isFilterEnabled());
                out.toolStats.put("retrievalAuthPrincipalId", retrievalAuthContext.getPrincipalId());
                out.toolStats.put("retrievalAuthDataScope", retrievalAuthContext.getDataScope());
            }
            return out;
        } finally {
            if (aiBusinessMemoryVectorService != null) {
                aiBusinessMemoryVectorService.clearRetrievalAuthContext();
            }
        }
    }

    private OrchestrationResult tryOrchestrateWithRecovery(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        String requestId,
        String pName,
        Integer pType,
        RecoveryHints hints
    ) {
        RecoveryHints safeHints = hints == null ? new RecoveryHints() : hints;
        String adjustedCode = adaptCodeForRecovery(currentCode, safeHints.maxCodeChars);
        List<Map<String, Object>> adjustedAttachments = adaptAttachmentsForRecovery(attachments, safeHints.maxAttachmentCharsTotal);
        recoveryHintsContext.set(safeHints);
        try {
            OrchestrationResult out = orchestrate(
                appId,
                message,
                adjustedCode,
                adjustedAttachments,
                contextType,
                taskType,
                responseMode,
                language,
                requestId,
                pName,
                pType
            );
            out.toolStats.put("recoveryRetryApplied", true);
            out.toolStats.put("recoveryRetryStrategy", safeHints.strategyId);
            out.toolStats.put("recoveryRetryAdjustments", safeHints.adjustments);
            return out;
        } catch (Exception ex) {
            log.warn("orchestration recovery retry failed requestId={} strategy={} reason={}",
                requestId,
                safeHints.strategyId,
                ex.getMessage());
            return null;
        } finally {
            recoveryHintsContext.remove();
        }
    }

    private RecoveryHints mapRecoveryHints(AiAdaptiveRetryPolicy.RecoveryStrategy strategy) {
        RecoveryHints out = new RecoveryHints();
        if (strategy == null) {
            return out;
        }
        out.strategyId = String.valueOf(strategy.strategyId == null ? "none" : strategy.strategyId).trim().toLowerCase(Locale.ROOT);
        out.adjustments = strategy.adjustments == null ? new LinkedHashMap<>() : new LinkedHashMap<>(strategy.adjustments);

        if (out.adjustments.containsKey("topKMultiplier")) {
            out.topKMultiplier = Math.max(0.6d, Math.min(1.8d, toDoubleSafe(out.adjustments.get("topKMultiplier"), out.topKMultiplier)));
        }

        switch (out.strategyId) {
            case "expand_scope":
            case "broaden_context":
            case "broaden_query":
                out.topKMultiplier = Math.max(out.topKMultiplier, 1.15d);
                out.maxCharsMultiplier = Math.max(out.maxCharsMultiplier, 1.10d);
                out.scopeMaskOr = AiScopedContextIngestionService.SCOPE_CODE | AiScopedContextIngestionService.SCOPE_MENU;
                break;
            case "reduce_scope":
                out.topKMultiplier = Math.min(out.topKMultiplier, 0.75d);
                out.maxCharsMultiplier = Math.min(out.maxCharsMultiplier, 0.85d);
                break;
            case "reduce_prompt":
                out.maxCodeChars = 45000;
                out.maxAttachmentCharsTotal = 14000;
                out.topKMultiplier = Math.min(out.topKMultiplier, 0.90d);
                break;
            case "simplify_edits":
                out.stepVerifierMinScoreOverride = Math.max(20, stepVerifierMinScore - 6);
                out.planSchemaMinScoreOverride = Math.max(20, planSchemaMinScore - 6);
                out.maxCodeChars = 60000;
                break;
            case "fallback_strategy":
            case "swap_strategy":
                out.topKMultiplier = Math.max(out.topKMultiplier, 1.05d);
                out.maxCharsMultiplier = Math.max(out.maxCharsMultiplier, 1.05d);
                break;
            default:
                break;
        }
        return out;
    }

    private String adaptCodeForRecovery(String code, int maxChars) {
        String safe = String.valueOf(code == null ? "" : code);
        if (safe.isBlank() || maxChars <= 0 || safe.length() <= maxChars) {
            return safe;
        }
        return truncateMiddle(safe, maxChars);
    }

    private List<Map<String, Object>> adaptAttachmentsForRecovery(List<Map<String, Object>> attachments, int maxTotalChars) {
        if (attachments == null || attachments.isEmpty() || maxTotalChars <= 0) {
            return attachments == null ? List.of() : attachments;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        int used = 0;
        for (Map<String, Object> item : attachments) {
            if (item == null || item.isEmpty()) {
                out.add(Map.of());
                continue;
            }
            Map<String, Object> copy = new LinkedHashMap<>(item);
            String content = String.valueOf(copy.getOrDefault("content", ""));
            if (content.isBlank()) {
                content = String.valueOf(copy.getOrDefault("text", ""));
            }
            int remaining = Math.max(0, maxTotalChars - used);
            if (!content.isBlank() && remaining > 0) {
                String trimmed = content.length() <= remaining ? content : content.substring(0, remaining);
                copy.put("content", trimmed);
                copy.put("text", trimmed);
                used += trimmed.length();
            } else {
                copy.put("content", "");
                copy.put("text", "");
            }
            out.add(Collections.unmodifiableMap(copy));
            if (used >= maxTotalChars) {
                break;
            }
        }
        return Collections.unmodifiableList(out);
    }

    private double toDoubleSafe(Object raw, double fallback) {
        if (raw == null) {
            return fallback;
        }
        if (raw instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(raw).trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    public OrchestrationResult orchestrate(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        String requestId,
        String pName,
        Integer pType
    ) {
        if (!enabled) {
            return OrchestrationResult.disabled();
        }

        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;
        String safeContextType = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);

        // Early validation: menu JSON must have nodeIds ("id" field in each item)
        if ("menu_json".equals(safeContextType)) {
            OrchestrationResult menuValidation = validateMenuJsonStructure(appId, currentCode, requestId);
            if (menuValidation != null && !menuValidation.enabled) {
                return menuValidation;  // validation failed, return error
            }
        }
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        String safeMode = String.valueOf(responseMode == null ? "edit" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeLanguage = String.valueOf(language == null ? "" : language).trim().toLowerCase(Locale.ROOT);
        OrchestrationRequest request = OrchestrationRequest.builder()
            .appId(appId)
            .message(safeMessage)
            .currentCode(safeCode)
            .attachments(safeAttachments)
            .contextType(safeContextType)
            .taskType(safeTaskType)
            .responseMode(safeMode)
            .language(safeLanguage)
            .pName(pName)
            .pType(pType)
            .build();
        String effectiveRequestId = String.valueOf(requestId == null ? "" : requestId).trim();
        boolean ownsTraceRequest = false;
        long orchestrationStartMs = System.currentTimeMillis();
        if (effectiveRequestId.isBlank()) {
            effectiveRequestId = "orch-" + UUID.randomUUID();
            ownsTraceRequest = true;
        }
        if (requestContextTracer != null) {
            if (ownsTraceRequest) {
                requestContextTracer.startRequest(effectiveRequestId);
            }
            requestContextTracer.startPhase("local_orchestration", effectiveRequestId);
        }

        OrchestrationResult out = new OrchestrationResult();
        out.enabled = true;
        out.toolStats.put("requestId", effectiveRequestId);

        if (aiTenantKnowledgeIngestionService != null) {
            try {
                AiTenantKnowledgeIngestionService.IngestSummary tenantSummary =
                    aiTenantKnowledgeIngestionService.ingestTenantKnowledge(appId);
                out.toolStats.put("tenantKnowledgeIngestStatus", tenantSummary.status());
                out.toolStats.put("tenantKnowledgeIngestChunks", tenantSummary.chunksIndexed());
                out.toolStats.put("tenantKnowledgeIngestChars", tenantSummary.charsIndexed());
            } catch (Exception tenantIngestEx) {
                out.toolStats.put("tenantKnowledgeIngestStatus", "failed");
                out.toolStats.put("tenantKnowledgeIngestError", tenantIngestEx.getMessage());
            }
        }

        int messageChars = safeMessage.length();
        int codeChars = safeCode.length();
        int attachmentChars = estimateAttachmentTextChars(safeAttachments);
        out.totalCharsBefore = messageChars + codeChars + attachmentChars;

        LocalToolDigest digest = runLocalTools(safeMessage, safeCode, safeAttachments, safeContextType);
        out.toolStats.putAll(digest.stats);
        if (!digest.menuSignals.isEmpty()) {
            out.toolStats.put("menuSignals", truncateLines(digest.menuSignals, 8, 96));
        }

        if (aiIntentClassifierService != null) {
            try {
                String classifierContext = "menu_json".equals(safeContextType) ? "menu" : "code";
                String classifierMenu = "menu_json".equals(safeContextType) ? safeCode : "";
                AiIntentClassifierService.IntentClassification intent = aiIntentClassifierService.classify(
                    safeMessage,
                    classifierContext,
                    safeCode,
                    classifierMenu,
                    effectiveRequestId
                );
                out.toolStats.put("intentClass", intent.intentClass);
                out.toolStats.put("intentConfidence", intent.confidence);
                out.toolStats.put("intentMethod", intent.classificationMethod);
                if (intent.isOffTopic()) {
                    out.planSteps = List.of(
                        "Detect off-topic request in code/menu workspace (intent classifier)",
                        "Return fast local answer and close session early"
                    );
                    out.routingTier = "planner_fast";
                    out.preferredModelHint = resolvePreferredModelHint(out.routingTier);
                    out.speculativeExecuted = true;
                    out.speculativeOperation = "offtopic_fast_reply";
                    out.earlyFinishResponse = buildOffTopicFastResponse(safeContextType);
                    out.totalCharsAfter = out.totalCharsBefore;
                    out.savedChars = 0;
                    out.toolStats.put("earlyFinish", true);
                    out.toolStats.put("earlyFinishSource", "intent_classifier");
                    return finalizeOrchestrationResult(out, effectiveRequestId, ownsTraceRequest, orchestrationStartMs);
                }
            } catch (Exception ignored) {
                // Never block orchestration if classifier fails.
            }
        }

        AiLocalWorkflowAdvisorService.WorkflowAdvice workflowAdvice = null;
        if (aiLocalWorkflowAdvisorService != null) {
            try {
                workflowAdvice = aiLocalWorkflowAdvisorService.advise(
                    new AiLocalWorkflowAdvisorService.WorkflowRequest(
                        safeMessage,
                        safeCode,
                        safeContextType,
                        safeMode,
                        safeAttachments,
                        buildPlannerQueryHint(safeMessage, digest, safeContextType, safeTaskType, safeMode),
                        buildWorkflowIntentSnapshot(safeContextType, safeMode)
                    )
                );
            } catch (Exception ignored) {
                workflowAdvice = null;
            }
        }
        if (workflowAdvice != null) {
            out.toolStats.put("workflowWorkspaceKind", workflowAdvice.workspaceKind());
            out.toolStats.put("workflowWeakMachineSafe", workflowAdvice.weakMachineSafe());
            out.toolStats.put("workflowIngestTargets", workflowAdvice.ingestTargets());
            if (!workflowAdvice.executionBlueprint().isEmpty()) {
                out.toolStats.put("workflowExecutionBlueprint", workflowAdvice.executionBlueprint());
            }
            if (!workflowAdvice.attachmentInsights().isEmpty()) {
                out.toolStats.put("workflowAttachmentInsights", workflowAdvice.attachmentInsights());
            }
        }

        double offTopicConfidence = getOffTopicConfidence(safeMessage, safeContextType, safeTaskType, safeMode, digest.intentKeywords, attachmentChars);
        FlowDecision flowDecision = FLOW_DIRECTOR.direct(
            request,
            digest,
            offTopicConfidence,
            fastUnrelatedConfidenceThreshold,
            fastUnrelatedEnabled
        );
        if (flowDecision.quickReply()) {
            out.planSteps = List.of(
                "Detect off-topic request in code/menu workspace (confidence: " + String.format("%.2f", offTopicConfidence) + ")",
                "Return fast local answer and close session early"
            );
            out.routingTier = "planner_fast";
            out.preferredModelHint = resolvePreferredModelHint(out.routingTier);
            out.speculativeExecuted = true;
            out.speculativeOperation = "offtopic_fast_reply";
            out.earlyFinishResponse = buildOffTopicFastResponse(safeContextType);
            out.totalCharsAfter = out.totalCharsBefore;
            out.savedChars = 0;
            out.toolStats.put("earlyFinish", true);
            out.toolStats.put("earlyFinishSource", flowDecision.reason());
            out.toolStats.put("offTopicConfidence", offTopicConfidence);
            out.toolStats.put("confThreshold", fastUnrelatedConfidenceThreshold);
            out.toolStats.put("routingTier", out.routingTier);
            out.toolStats.put("preferredModelHint", out.preferredModelHint);
            return finalizeOrchestrationResult(out, effectiveRequestId, ownsTraceRequest, orchestrationStartMs);
        } else if (fastUnrelatedEnabled && offTopicConfidence > 0) {
            out.toolStats.put("rejectedOffTopic", true);
            out.toolStats.put("rejectedOffTopicConfidence", offTopicConfidence);
        }

        AiMultimodalScannerService.ScanResult scanResult = aiMultimodalScannerService == null
            ? AiMultimodalScannerService.ScanResult.disabled()
            : aiMultimodalScannerService.scan(
                safeMessage,
                safeAttachments,
                safeContextType,
                safeTaskType,
                safeMode
            );

        RecoveryHints recoveryHints = recoveryHintsContext.get();
        Integer stepVerifierMinScoreOverride = recoveryHints == null ? null : recoveryHints.stepVerifierMinScoreOverride;
        Integer planSchemaMinScoreOverride = recoveryHints == null ? null : recoveryHints.planSchemaMinScoreOverride;
        ExecutionPlanningSnapshot planning = buildExecutionPlanningSnapshot(
            safeMessage,
            safeContextType,
            safeTaskType,
            safeMode,
            codeChars,
            attachmentChars,
            digest,
            scanResult,
            offTopicConfidence,
            flowDecision,
            stepVerifierMinScoreOverride,
            planSchemaMinScoreOverride,
            safeCode,
            "",
            workflowAdvice
        );
        List<String> planSteps = new ArrayList<>(planning.planSteps());
        PlanCoverageCheck planCoverage = planning.planCoverage();
        PlanSchemaCheck schemaCheck = planning.schemaCheck();
        List<Map<String, Object>> structuredPlanSteps = new ArrayList<>(planning.structuredPlanSteps());
        applyExecutionPlanningStats(out, planning, safeContextType, safeMode, digest, scanResult);
        out.planSteps = planSteps;

        String routingTier = resolveRoutingTier(safeMessage, safeContextType, safeTaskType, safeMode, codeChars, attachmentChars);
        out.routingTier = routingTier;
        out.preferredModelHint = resolvePreferredModelHint(routingTier);
        out.toolStats.put("routingTier", out.routingTier);
        out.toolStats.put("preferredModelHint", out.preferredModelHint);
        if (scanResult.enabled()) {
            out.toolStats.put("scannerEnabled", true);
            out.toolStats.put("scannerAttachmentCount", scanResult.attachmentCount());
            out.toolStats.put("scannerImageCount", scanResult.imageCount());
            out.toolStats.put("scannerJsonCount", scanResult.jsonCount());
            out.toolStats.put("scannerIngestCount", scanResult.ingestCount());
        }

        int dynamicPrunedSources = 0;
        boolean dynamicIndexed = false;
        String dynamicSource = "";
        boolean dynamicIngestScheduled = false;
        int baselineScopeMask = mergeWorkflowAdviceScopeMask(
            defaultScopeMaskForContext(safeContextType, safeTaskType),
            workflowAdvice
        );
        int aggregateScopeMask = scanResult.enabled() ? Math.max(0, scanResult.aggregateScopeMask()) : 0;
        boolean hasCurrentMenuSurface = "menu_json".equals(safeContextType) && !safeCode.isBlank();
        boolean hasCurrentCodeSurface = !hasCurrentMenuSurface && !safeCode.isBlank();
        if (aiScopedContextIngestionService != null) {
            try {
                AiScopedContextIngestionService.ScopeMaskAnalysis scopeAnalysis = aiScopedContextIngestionService.analyzeScopesFromAttachments(
                    safeMessage,
                    safeAttachments,
                    hasCurrentCodeSurface,
                    hasCurrentMenuSurface
                );
                int scopedMask = Math.max(0, scopeAnalysis.scopeMask);
                if ("menu_json".equals(safeContextType)) {
                    scopedMask |= AiScopedContextIngestionService.SCOPE_MENU;
                } else {
                    scopedMask |= AiScopedContextIngestionService.SCOPE_CODE;
                }
                if (scopedMask > 0) {
                    aggregateScopeMask = aggregateScopeMask | scopedMask;
                    out.toolStats.put("scopedIngestionScopeMask", scopedMask);
                    out.toolStats.put("scopedIngestionScopeSummary", scopeAnalysis.describe());
                }

                if (safeCode.isBlank() && !safeAttachments.isEmpty()) {
                    ingestSampleAttachmentsWhenEditorEmpty(
                        appId,
                        safeAttachments,
                        safeContextType,
                        aggregateScopeMask,
                        effectiveRequestId,
                        out);
                }

                if ("menu_json".equals(safeContextType) && !safeCode.isBlank() && (aggregateScopeMask & AiScopedContextIngestionService.SCOPE_MENU) != 0) {
                    // Synchronous: menu data must be committed to Lucene before the retrieval search runs below.
                    // Async would cause a race where searchWithScopes runs before the index directory is created.
                    AiScopedContextIngestionService.IngestionResult menuIngestion = aiScopedContextIngestionService.ingestMenu(
                        appId,
                        safeCode,
                        aggregateScopeMask,
                        false,
                        effectiveRequestId
                    );
                    out.toolStats.put("scopedMenuIngestionStatus", menuIngestion.status);
                    out.toolStats.put("scopedMenuIngestionChunks", menuIngestion.chunksIngested);
                }
                if (!"menu_json".equals(safeContextType)
                        && !safeCode.isBlank()
                        && (aggregateScopeMask & AiScopedContextIngestionService.SCOPE_CODE) != 0) {
                    boolean skipHeavyIngestForLargeCode = safeCode.length() > 45000;
                    if (skipHeavyIngestForLargeCode) {
                        String editorKey = AiScopedContextIngestionService.buildEditorIngestKey(request.pName, request.pType);
                        AiScopedContextIngestionService.IngestionResult largeIngest = aiScopedContextIngestionService.ingestLargeCodeAsync(
                            appId,
                            safeCode,
                            aggregateScopeMask,
                            effectiveRequestId,
                            editorKey,
                            safeMessage);
                        out.toolStats.put("scopedCodeIngestionStatus", largeIngest.status);
                        out.toolStats.put("scopedCodeIngestionMode", "async_large_code_vector");
                        out.toolStats.put("scopedCodeIngestionEditorKey", editorKey);
                        out.toolStats.put("scopedCodeIngestionChunks", largeIngest.chunksIngested);
                        out.toolStats.put("scopedCodeIngestionChars", largeIngest.totalCharsIndexed);
                        out.toolStats.put("lightweightLargeCodeContext", true);
                        out.toolStats.put("lightweightCodeEdit", "edit".equals(safeMode));
                    } else {
                    AiScopedContextIngestionService.IngestionResult codeIngestion = aiScopedContextIngestionService.ingestCode(
                        appId,
                        safeCode,
                        aggregateScopeMask,
                        true,
                        effectiveRequestId
                    );
                    out.toolStats.put("scopedCodeIngestionStatus", codeIngestion.status);
                    out.toolStats.put("scopedCodeIngestionMode", "async_standard");
                    out.toolStats.put("scopedCodeIngestionChunks", codeIngestion.chunksIngested);
                    }
                }
            } catch (Exception ignored) {
                // Continue with existing multimodal ingestion pipeline.
            }
        }
        if (aggregateScopeMask <= 0) {
            aggregateScopeMask = baselineScopeMask;
        }
        List<String> aggregateScopeTags = AiMultimodalScannerService.scopeTagsFromMask(aggregateScopeMask);
        String aggregateScopeSummary = summarizeScopeTags(aggregateScopeTags);
        if (scanResult.enabled()) {
            out.toolStats.put("scannerScopeMask", aggregateScopeMask);
            out.toolStats.put("scannerScopeTags", aggregateScopeTags);
            out.toolStats.put("scannerScopeSummary", aggregateScopeSummary);
        }
        String scanIngestionMarkdown = scanResult.enabled()
            ? String.valueOf(scanResult.ingestionMarkdown() == null ? "" : scanResult.ingestionMarkdown())
            : "";
        String primaryFlowMarkdown = buildPrimaryFlowIngestionMarkdown(
            safeContextType,
            safeTaskType,
            safeMessage,
            safeCode,
            digest,
            Math.max(3200, dynamicIngestMaxMarkdownChars / 2));
        boolean shouldIndexPrimaryFlowDynamically = !primaryFlowMarkdown.isBlank()
            && !"menu_json".equals(safeContextType)
            && !"code".equals(safeContextType);

        if (dynamicIngestEnabled
            && aiBusinessMemoryVectorService != null
            && aiBusinessMemoryVectorService.isEnabled()) {
            String mergedIngestion = "";
            if (!scanIngestionMarkdown.isBlank()) {
                mergedIngestion = scanIngestionMarkdown;
            }
            if (shouldIndexPrimaryFlowDynamically) {
                mergedIngestion = mergedIngestion.isBlank()
                    ? primaryFlowMarkdown
                    : (mergedIngestion + "\n\n## PRIMARY_FLOW_CONTEXT\n" + primaryFlowMarkdown);
            }

            String markdown = trimTo(mergedIngestion, Math.max(4000, dynamicIngestMaxMarkdownChars));
            if (!markdown.isBlank()) {
                String suffix = "orchestration_" + System.currentTimeMillis();
                List<String> dynamicTags = new ArrayList<>();
                dynamicTags.add("dynamic");
                dynamicTags.add("multimodal");
                dynamicTags.add(safeContextType);
                dynamicTags.add(safeTaskType);
                if (shouldIndexPrimaryFlowDynamically) {
                    dynamicTags.add("primary_flow");
                }
                dynamicTags.addAll(AiMultimodalScannerService.scopeTagsFromMask(aggregateScopeMask));
                if (dynamicIngestAsyncEnabled) {
                    dynamicIngestScheduled = true;
                    final String asyncAppId = String.valueOf(appId == null ? "" : appId).trim();
                    final String asyncSuffix = suffix;
                    final String asyncMarkdown = markdown;
                    final List<String> asyncTags = List.copyOf(dynamicTags);
                    final int asyncScopeMask = Math.max(aggregateScopeMask, baselineScopeMask);
                    dynamicIngestExecutor.submit(() -> {
                        try {
                            aiBusinessMemoryVectorService.indexDynamicContext(
                                asyncAppId,
                                asyncSuffix,
                                asyncMarkdown,
                                asyncTags,
                                asyncScopeMask
                            );
                            aiBusinessMemoryVectorService.pruneDynamicContext(asyncAppId);
                        } catch (Exception ex) {
                            // Async ingestion should never break request path.
                        }
                    });
                    dynamicSource = "scheduled:" + suffix;
                    out.toolStats.put("dynamicMemoryQueueState", "queued");
                } else {
                    AiBusinessMemoryVectorService.IndexSummary indexSummary = aiBusinessMemoryVectorService.indexDynamicContext(
                        appId,
                        suffix,
                        markdown,
                        dynamicTags,
                        Math.max(aggregateScopeMask, baselineScopeMask)
                    );
                    dynamicIndexed = indexSummary != null && indexSummary.chunksIndexed() > 0;
                    dynamicSource = indexSummary == null ? "" : String.valueOf(indexSummary.sourceName() == null ? "" : indexSummary.sourceName());
                    dynamicPrunedSources = aiBusinessMemoryVectorService.pruneDynamicContext(appId);
                    out.toolStats.put("dynamicMemoryQueueState", dynamicIndexed ? "indexed" : "skipped");
                }
                out.toolStats.put("dynamicMemoryAsync", dynamicIngestAsyncEnabled);
                out.toolStats.put("dynamicMemoryScheduled", dynamicIngestScheduled);
                out.toolStats.put("dynamicMemoryIndexed", dynamicIndexed);
                out.toolStats.put("dynamicMemorySource", dynamicSource);
                out.toolStats.put("dynamicMemoryPrunedSources", dynamicPrunedSources);
                out.toolStats.put("dynamicMemoryScopeMask", aggregateScopeMask);
                out.toolStats.put("dynamicMemoryPrimaryFlowIndexed", shouldIndexPrimaryFlowDynamically);
            }
        }

        boolean lightweightCodeAnalyze = "analyze".equals(safeMode) && !"menu_json".equals(safeContextType);
        if (lightweightCodeAnalyze) {
            out.toolStats.put("lightweightCodeAnalyze", true);
            out.toolStats.put("scopedCodeIngestionStatus", "skipped_analyze_fast_path");
            out.toolStats.put("scopedRagEnabled", false);
        }
        boolean flowRagEnabled = true;
        if (aiLocalFlowContextPolicy != null) {
            AiLocalFlowContextPolicy.FlowKind flowKind = aiLocalFlowContextPolicy.resolveFlow(
                safeContextType,
                safeMode,
                safeTaskType);
            AiLocalFlowContextPolicy.RagFlowPreset flowPreset = aiLocalFlowContextPolicy.ragPreset(
                flowKind,
                isWeakOrchestrationProfile());
            flowRagEnabled = flowPreset.ragEnabled();
            out.toolStats.put("flowContextKind", flowKind.name());
            out.toolStats.put("flowRagPresetLabel", flowPreset.label());
            out.toolStats.put("flowRagPresetTopK", flowPreset.topK());
            out.toolStats.put("flowRagPresetMaxChars", flowPreset.maxChars());
            AiLocalFlowContextPolicy.ContextWindowFit ctxFit = aiLocalFlowContextPolicy.contextWindowFit(
                flowKind,
                Math.max(4000, scopedRagMaxChars * 4),
                768,
                isWeakOrchestrationProfile());
            out.toolStats.put("flowContextWindowFitTokens", ctxFit.suggestedContextTokens());
            out.toolStats.put("flowContextWindowFitNote", ctxFit.note());
        }
        String scopedRagBlock = "";
        if (!lightweightCodeAnalyze
            && flowRagEnabled
            && scanResult.enabled()
            && scopedRagEnabled
            && aggregateScopeMask > 0
            && aiBusinessMemoryVectorService != null
            && aiBusinessMemoryVectorService.isEnabled()) {
            
            // ─── Policy Decision: Adaptive Scope & TopK per Request ───
            AiRetrievalPolicyEngine.RetrievalPolicy retrievalPolicy = null;
            int policyTopK = scopedRagTopK;
            int policyScopeMask = aggregateScopeMask;
            if (aiRetrievalPolicyEngine != null) {
                try {
                    retrievalPolicy = aiRetrievalPolicyEngine.decidePolicy(
                        safeMessage,
                        safeCode,
                        aggregateScopeMask,
                        safeAttachments.size(),
                        safeCode.length(),
                        safeLanguage
                    );
                    policyTopK = retrievalPolicy.topK;
                    policyScopeMask = retrievalPolicy.scopeMask;
                    out.toolStats.put("retrievalPolicy", retrievalPolicy.policyId);
                    out.toolStats.put("retrievalPolicyTopK", policyTopK);
                    out.toolStats.put("retrievalPolicyScopeMask", policyScopeMask);
                    out.toolStats.put("retrievalPolicyRelevance", retrievalPolicy.relevanceScore);
                    out.toolStats.put("retrievalPolicyBudgetFit", retrievalPolicy.budgetFitScore);
                    out.toolStats.put("retrievalPolicyRationale", retrievalPolicy.rationale);
                    out.toolStats.put("retrievalPolicyMetrics", retrievalPolicy.metrics);
                } catch (Exception ex) {
                    // Policy engine failure: fallback to defaults
                    out.toolStats.put("retrievalPolicyError", ex.getMessage());
                }
            }
            
            // ─── Phase 1: Symbol-Aware Retrieval (prioritize code symbols over generic vector search) ───
            boolean menuFlow = "menu_json".equals(safeContextType);
            StringBuilder symbolRagBlock = new StringBuilder();
            List<String> symbolQueries = List.of();
            if (!menuFlow && symbolAwareRetrievalEnabled) {
                List<String> mergedSymbols = new ArrayList<>(prependLifecycleSymbolsFromRequest(safeMessage));
                if (digest.codeSymbols != null && !digest.codeSymbols.isEmpty()) {
                    for (String sym : digest.codeSymbols) {
                        if (sym != null && !sym.isBlank() && !mergedSymbols.contains(sym)) {
                            mergedSymbols.add(sym);
                        }
                    }
                }
                if (!mergedSymbols.isEmpty()) {
                    symbolQueries = buildSymbolAwareQueries(mergedSymbols, maxCodeSymbols / 2);
                }
                if (!symbolQueries.isEmpty()) {
                    out.toolStats.put("symbolAwareRetrievalQueries", truncateLines(symbolQueries, 3, 140));
                }
                if (!symbolQueries.isEmpty()) {
                    int symbolTopK = Math.max(2, symbolAwareRetrievalTopK);
                    int symbolMaxChars = Math.max(1200, symbolAwareRetrievalMaxChars);
                    int symbolsProcessed = 0;
                    for (String symQuery : symbolQueries) {
                        if (symbolsProcessed >= Math.min(3, symbolQueries.size())) {
                            break;
                        }
                        String safeSq = String.valueOf(symQuery == null ? "" : symQuery).trim();
                        if (safeSq.isBlank()) {
                            continue;
                        }
                        String symbolResult = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
                            appId,
                            safeSq,
                            symbolTopK,
                            aggregateScopeMask,
                            symbolMaxChars
                        );
                        if (symbolResult != null && !symbolResult.isBlank()) {
                            if (symbolRagBlock.length() > 0) {
                                symbolRagBlock.append("\n\n");
                            }
                            symbolRagBlock.append("### Symbol Match: ").append(safeSq).append("\n").append(symbolResult);
                            symbolsProcessed++;
                        }
                    }
                }
                if (symbolRagBlock.length() > 0) {
                    out.toolStats.put("symbolAwareRetrievalEnabled", true);
                    out.toolStats.put("symbolAwareRetrievalSymbolsProcessed", Math.min(3, symbolQueries.size()));
                    out.toolStats.put("symbolAwareRetrievalChars", symbolRagBlock.length());
                }
            }

            // ─── Phase 1.5: Type-Aware Context Injection (enhance symbol results with type hints) ───
            StringBuilder typeHintsBlock = new StringBuilder();
            if (!menuFlow && typeAwareInjectionEnabled && !safeCode.isBlank()) {
                List<String> typeHints = extractTypeHints(safeCode, typeAwareInjectionMaxTypes);
                if (!typeHints.isEmpty()) {
                    typeHintsBlock.append("## Available Types in This Code\n");
                    int typeCharsUsed = "## Available Types in This Code\n".length();
                    int typesAdded = 0;
                    for (String type : typeHints) {
                        if (typesAdded >= typeAwareInjectionMaxTypes) {
                            break;
                        }
                        String safeType = String.valueOf(type == null ? "" : type).trim();
                        if (safeType.isEmpty()) {
                            continue;
                        }
                        String typeLine = "- " + safeType + "\n";
                        if (typeCharsUsed + typeLine.length() <= typeAwareInjectionMaxChars) {
                            typeHintsBlock.append(typeLine);
                            typeCharsUsed += typeLine.length();
                            typesAdded++;
                        } else {
                            break;
                        }
                    }
                    if (typesAdded > 0) {
                        out.toolStats.put("typeAwareInjectionEnabled", true);
                        out.toolStats.put("typeAwareInjectionTypesExtracted", typesAdded);
                        out.toolStats.put("typeAwareInjectionChars", typeHintsBlock.length());
                    }
                }
            }

            // ─── Phase 2: Adaptive Main Vector Search (using policy-decided topK/scope) ───
            AdaptiveRetrievalPlan retrievalPlan = buildAdaptiveRetrievalPlan(
                safeMessage,
                safeContextType,
                safeTaskType,
                safeMode,
                safeCode,
                safeAttachments,
                digest,
                policyScopeMask,  // Use policy-decided scope instead of hardcoded
                scanResult,
                policyTopK        // Pass policy-decided topK to planner
            );
            out.toolStats.put("retrievalFocusTargets", buildRetrievalFocusTargets(
                safeMessage,
                safeContextType,
                safeTaskType,
                safeAttachments,
                request.appId,
                request.currentCode,
                request.pName,
                request.pType
            ));
            out.toolStats.put("retrievalEngineLabel", menuFlow
                ? "menu schema + trigger retrieval"
                : "code scope + symbol retrieval");
            scopedRagBlock = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
                appId,
                retrievalPlan.query,
                retrievalPlan.topK,
                retrievalPlan.scopeMask,
                retrievalPlan.maxChars
            );
            
            // Prepend type hints and symbol results (highest priority: types > symbols > vector search)
            StringBuilder ragBlockWithContext = new StringBuilder();
            if (typeHintsBlock.length() > 0) {
                ragBlockWithContext.append(typeHintsBlock.toString()).append("\n\n");
            }
            if (symbolRagBlock.length() > 0) {
                ragBlockWithContext.append(symbolRagBlock.toString()).append("\n\n");
            }
            ragBlockWithContext.append(scopedRagBlock);
            scopedRagBlock = ragBlockWithContext.toString();

            // ─── Phase 3: Targeted Queries (derived from message/context) ───
            List<String> targetedQueries = deriveTargetedRetrievalQueries(safeMessage, digest, safeContextType);
            if (!targetedQueries.isEmpty() && !isWeakOrchestrationProfile()) {
                int targetedTopK = Math.max(2, retrievalPlan.topK - 2);
                int targetedMaxChars = Math.max(900, retrievalPlan.maxChars / 2);
                StringBuilder targetedBlock = new StringBuilder();
                int added = 0;
                for (String tq : targetedQueries) {
                    String safeTq = String.valueOf(tq == null ? "" : tq).trim();
                    if (safeTq.isBlank() || safeTq.equalsIgnoreCase(retrievalPlan.query)) {
                        continue;
                    }
                    String extra = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
                        appId,
                        safeTq,
                        targetedTopK,
                        retrievalPlan.scopeMask,
                        targetedMaxChars
                    );
                    if (extra != null && !extra.isBlank()) {
                        if (targetedBlock.length() > 0) {
                            targetedBlock.append("\n\n");
                        }
                        targetedBlock.append("### Targeted Query: ").append(safeTq).append("\n").append(extra);
                        added++;
                        if (added >= 2) {
                            break;
                        }
                    }
                }
                if (targetedBlock.length() > 0) {
                    scopedRagBlock = scopedRagBlock.isBlank()
                        ? targetedBlock.toString()
                        : (scopedRagBlock + "\n\n" + targetedBlock);
                    out.toolStats.put("scopedRagTargetedQueries", targetedQueries);
                    out.toolStats.put("scopedRagTargetedTopK", targetedTopK);
                    out.toolStats.put("scopedRagTargetedMaxChars", targetedMaxChars);
                }
            }

            // Last-resort guard: never continue orchestration on empty scoped retrieval.
            if (scopedRagBlock == null || scopedRagBlock.isBlank()) {
                int fallbackScopeMask = retrievalPlan.scopeMask > 0
                    ? retrievalPlan.scopeMask
                    : defaultScopeMaskForContext(safeContextType, safeTaskType);
                String fallbackQuery = buildGuaranteedScopedFallbackQuery(
                    safeMessage,
                    digest,
                    safeContextType,
                    safeTaskType,
                    safeMode
                );
                int fallbackTopK = Math.max(3, retrievalPlan.topK);
                int fallbackMaxChars = Math.max(1400, retrievalPlan.maxChars);
                String fallbackRag = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
                    appId,
                    fallbackQuery,
                    fallbackTopK,
                    fallbackScopeMask,
                    fallbackMaxChars
                );
                if (fallbackRag != null && !fallbackRag.isBlank()) {
                    scopedRagBlock = fallbackRag;
                }
                out.toolStats.put("scopedRagFallbackApplied", true);
                out.toolStats.put("scopedRagFallbackScopeMask", fallbackScopeMask);
                out.toolStats.put("scopedRagFallbackTopK", fallbackTopK);
                out.toolStats.put("scopedRagFallbackMaxChars", fallbackMaxChars);
                out.toolStats.put("scopedRagFallbackQuery", truncateLine(fallbackQuery, 180));
            }

            int scopedRagChars = scopedRagBlock == null ? 0 : scopedRagBlock.length();
            int retrievalMinChars = Math.max(400, scopedRagQualityMinChars);
            boolean retrievalQualityPassed = scopedRagChars >= retrievalMinChars;
            if (!retrievalQualityPassed && scopedRagQualityRetryOnLow && !isWeakOrchestrationProfile()) {
                int retryScopeMask = Math.max(1,
                    retrievalPlan.scopeMask
                        | defaultScopeMaskForContext(safeContextType, safeTaskType)
                );
                int retryTopK = Math.max(3, retrievalPlan.topK + 2);
                int retryMaxChars = Math.max(1600, retrievalPlan.maxChars + 1000);
                String retryQuery = buildGuaranteedScopedFallbackQuery(
                    safeMessage,
                    digest,
                    safeContextType,
                    safeTaskType,
                    safeMode
                ) + " evidence retrieval remediation";
                String retryRag = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
                    appId,
                    trimTo(retryQuery, 360),
                    retryTopK,
                    retryScopeMask,
                    retryMaxChars
                );
                if (retryRag != null && retryRag.length() > scopedRagChars) {
                    scopedRagBlock = retryRag;
                    scopedRagChars = scopedRagBlock.length();
                }
                retrievalQualityPassed = scopedRagChars >= retrievalMinChars;
                out.toolStats.put("scopedRagQualityRetryApplied", true);
                out.toolStats.put("scopedRagQualityRetryScopeMask", retryScopeMask);
                out.toolStats.put("scopedRagQualityRetryTopK", retryTopK);
                out.toolStats.put("scopedRagQualityRetryMaxChars", retryMaxChars);
                out.toolStats.put("scopedRagQualityRetryQuery", truncateLine(retryQuery, 180));
            }

            // Policy: low Lucene evidence → supplement with editor surface (menu/code), keeps agentic path extensible.
            if (surfaceRemediationEnabled
                    && isSurfaceRemediationContext(safeContextType)
                    && !safeCode.isBlank()
                    && !(isWeakOrchestrationProfile() && "edit".equals(safeMode))) {
                int minEvidenceChars = Math.max(400, scopedRagQualityMinChars);
                if (scopedRagChars < minEvidenceChars) {
                    String surfaceAnchor = buildEditorSurfaceEvidenceAnchor(safeContextType, safeCode, safeMessage);
                    if (!surfaceAnchor.isBlank()) {
                        scopedRagBlock = scopedRagBlock == null || scopedRagBlock.isBlank()
                            ? surfaceAnchor
                            : surfaceAnchor + "\n\n" + scopedRagBlock;
                        scopedRagChars = scopedRagBlock.length();
                        retrievalQualityPassed = scopedRagChars >= minEvidenceChars;
                        out.toolStats.put("scopedRagSurfaceRemediationApplied", true);
                        out.toolStats.put("scopedRagSurfaceRemediationContext", safeContextType);
                        out.toolStats.put("scopedRagQualityPassed", retrievalQualityPassed);
                        out.toolStats.put("scopedRagQualityDeficit", Math.max(0, minEvidenceChars - scopedRagChars));
                    }
                }
            }

            int scopedRagTotalCap = Math.max(1600, scopedRagMaxChars);
            if (isWeakOrchestrationProfile()) {
                scopedRagTotalCap = Math.max(1200, scopedRagMaxChars);
            }
            if (scopedRagBlock != null && scopedRagBlock.length() > scopedRagTotalCap) {
                scopedRagBlock = truncateMiddle(scopedRagBlock, scopedRagTotalCap);
                scopedRagChars = scopedRagBlock.length();
                out.toolStats.put("scopedRagTotalCapped", true);
                out.toolStats.put("scopedRagTotalCap", scopedRagTotalCap);
            }

            out.toolStats.put("scopedRagQualityMinChars", retrievalMinChars);
            out.toolStats.put("scopedRagQualityPassed", retrievalQualityPassed);
            out.toolStats.put("scopedRagQualityDeficit", Math.max(0, retrievalMinChars - scopedRagChars));
            out.toolStats.put("scopedRagEnabled", true);
            out.toolStats.put("scopedRagScopeMask", retrievalPlan.scopeMask);
            out.toolStats.put("scopedRagTopK", retrievalPlan.topK);
            out.toolStats.put("scopedRagMaxChars", retrievalPlan.maxChars);
            out.toolStats.put("scopedRagAdaptive", retrievalPlan.adaptive);
            out.toolStats.put("scopedRagAdaptiveReasons", retrievalPlan.reasons);
            out.toolStats.put("scopedRagChars", scopedRagChars);
            out.toolStats.put("scopedRagQuery", truncateLine(retrievalPlan.query, 180));
            List<AiBusinessMemoryVectorService.SearchHit> retrievalHits = aiBusinessMemoryVectorService.searchWithScopes(
                appId,
                retrievalPlan.query,
                retrievalPlan.topK,
                retrievalPlan.scopeMask
            );
            out.toolStats.put("scopedRagHitCount", retrievalHits.size());
            out.toolStats.put("scopedRagSourceCount", countUniqueHitSources(retrievalHits));
            out.toolStats.put(
                "scopedRagTopHits",
                summarizeSearchHits(
                    retrievalHits,
                    Math.max(1, ragCitationsMaxHits),
                    retrievalPlan.query,
                    request.appId,
                    safeContextType,
                    request.pName,
                    request.pType)
            );
            out.toolStats.put(
                "virtualContextPreview",
                buildVirtualContextPreview(
                    retrievalHits,
                    retrievalPlan.query,
                    safeContextType,
                    digest,
                    request.appId,
                    request.pName,
                    request.pType,
                    buildRetrievalFocusTargets(
                        safeMessage,
                        safeContextType,
                        safeTaskType,
                        safeAttachments,
                        request.appId,
                        request.currentCode,
                        request.pName,
                        request.pType
                    ),
                    targetedQueries,
                    symbolQueries
                )
            );
            String webSearchRagBlock = maybeBuildWebSearchRagBlock(
                appId,
                safeMessage,
                safeContextType,
                safeTaskType,
                safeMode,
                safeLanguage,
                digest,
                Math.max(1, retrievalPlan.scopeMask),
                scopedRagChars,
                retrievalQualityPassed,
                retrievalHits,
                effectiveRequestId,
                out
            );
            if (!webSearchRagBlock.isBlank()) {
                scopedRagBlock = scopedRagBlock == null || scopedRagBlock.isBlank()
                    ? webSearchRagBlock
                    : (scopedRagBlock + "\n\n## AGENTIC_WEB_SEARCH_RAG\n" + webSearchRagBlock);
                scopedRagChars = scopedRagBlock.length();
            }

            planning = buildExecutionPlanningSnapshot(
                safeMessage,
                safeContextType,
                safeTaskType,
                safeMode,
                codeChars,
                attachmentChars,
                digest,
                scanResult,
                offTopicConfidence,
                flowDecision,
                stepVerifierMinScoreOverride,
                planSchemaMinScoreOverride,
                safeCode,
                scopedRagBlock,
                workflowAdvice
            );
            planSteps = new ArrayList<>(planning.planSteps());
            planCoverage = planning.planCoverage();
            schemaCheck = planning.schemaCheck();
            structuredPlanSteps = new ArrayList<>(planning.structuredPlanSteps());
            if (!retrievalQualityPassed) {
                planSteps.add("Retrieval remediation: context evidence vẫn thấp, ưu tiên anchor currentCode + symbols khi suy luận step");
                structuredPlanSteps = buildStructuredPlanSteps(planSteps);
                planCoverage = evaluatePlanCoverage(
                    safeMessage,
                    safeContextType,
                    safeTaskType,
                    safeMode,
                    codeChars,
                    attachmentChars,
                    digest,
                    scanResult,
                    planSteps,
                    stepVerifierMinScoreOverride
                );
                schemaCheck = evaluatePlanSchema(structuredPlanSteps, planSchemaMinScoreOverride);
                planning = new ExecutionPlanningSnapshot(
                    planSteps,
                    planCoverage,
                    schemaCheck,
                    structuredPlanSteps,
                    planning.workflowBlueprintUsed(),
                    planning.executionPlannerUsed(),
                    planning.executionPlanStepCount(),
                    planning.executionPlanEstimatedMs(),
                    planning.executionPlanDeduped(),
                    planning.retrievalAware()
                );
            }
            applyExecutionPlanningStats(out, planning, safeContextType, safeMode, digest, scanResult);
            out.toolStats.put("executionPlanRetrievedContextChars", scopedRagChars);
            // v7: expose for minimal prompt building in streamWithAutoContinue
            out.toolStats.put("scopedRagBlock", scopedRagBlock == null ? "" : scopedRagBlock);
            out.planSteps = planSteps;
        }

        AiSpeculativeExecutionService.ExecutionResult speculative = aiSpeculativeExecutionService.run(
            safeMessage,
            safeCode,
            safeAttachments,
            safeContextType);
        out.speculativeOperation = speculative == null ? "none" : String.valueOf(speculative.operation == null ? "none" : speculative.operation);
        out.speculativeExecuted = speculative != null && speculative.executed;
        out.toolStats.put("routingTier", out.routingTier);
        out.toolStats.put("preferredModelHint", out.preferredModelHint);
        out.toolStats.put("speculativeExecuted", out.speculativeExecuted);
        out.toolStats.put("speculativeOperation", out.speculativeOperation);
        // OpenDevin AgentFinishAction pattern: if speculative result fully answers a
        // simple stats/count query, set earlyFinishResponse so the controller can skip
        // the full LLM call entirely (AgentFinishAction equivalent).
        if (out.speculativeExecuted && speculative != null
                && speculative.data != null && !speculative.data.isEmpty()
            && isEarlyFinishEligible(safeMessage, safeMode, safeContextType)) {
            out.earlyFinishResponse = buildEarlyFinishFromSpeculative(speculative.operation, speculative.data);
            if (!out.earlyFinishResponse.isBlank()) {
                out.toolStats.put("earlyFinish", true);
                out.toolStats.put("earlyFinishSource", speculative.operation);
            }
        }
        if (speculative != null && speculative.data != null && !speculative.data.isEmpty()) {
            out.toolStats.put("speculativeData", speculative.data);
        }

        String tier1 = buildTier1Metadata(appId, safeContextType, safeTaskType, safeMode, safeLanguage, safeAttachments.size());
        String tier2 = buildTier2RelevantContext(digest, safeContextType);
        String tier3 = buildTier3RuntimeOutput(digest);
        String tier0 = scanResult.enabled() ? trimTo(scanResult.compactContext(), Math.max(1200, maxContextChars / 2)) : "";
        if (!scopedRagBlock.isBlank()) {
            String ragSection = "## SCOPE_FILTERED_LUCENE_RAG\n" + scopedRagBlock;
            tier0 = tier0.isBlank() ? ragSection : (tier0 + "\n\n" + ragSection);
        }

        String combined = "## LOCAL_AGENTIC_ORCHESTRATION\\n"
            + "Mode: local_agentic_workflow\\n"
            + "ORCHESTRATION_ROUTING_TIER=" + out.routingTier + "\n"
            + "ORCHESTRATION_PREFERRED_MODEL=" + out.preferredModelHint + "\n"
            + "ORCHESTRATION_SPECULATIVE_OPERATION=" + out.speculativeOperation + "\n"
            + "ORCHESTRATION_SCANNER_INGEST_COUNT=" + (scanResult.enabled() ? scanResult.ingestCount() : 0) + "\n"
            + "ORCHESTRATION_SCANNER_SCOPE_MASK=" + aggregateScopeMask + "\n"
            + "ORCHESTRATION_SCANNER_SCOPE_TAGS=" + aggregateScopeSummary + "\n"
            + "ORCHESTRATION_DYNAMIC_MEMORY_INDEXED=" + dynamicIndexed + "\n"
            + "ORCHESTRATION_DYNAMIC_MEMORY_SOURCE=" + dynamicSource + "\n"
            + "ORCHESTRATION_DYNAMIC_MEMORY_PRUNED=" + dynamicPrunedSources + "\n"
            + "Plan steps:\\n"
            + toNumberedLines(planSteps)
            + (tier0.isBlank() ? "" : "\\n### Tier 0: Multi-Modal Scanner\\n" + tier0 + "\\n")
            + "\\n"
            + "### Tier 1: Metadata\\n" + tier1 + "\\n\\n"
            + "### Tier 2: Relevant Files/Signals\\n" + tier2 + "\\n\\n"
            + "### Tier 3: Runtime Tool Output (compressed)\\n" + tier3;

        String trimmed = sanitizeInternalOrchestrationContext(
            truncateMiddle(combined, Math.max(4000, maxContextChars))
        );
        out.compressedContextBlock = trimmed;
        out.totalCharsAfter = trimmed.length();
        out.savedChars = Math.max(0, out.totalCharsBefore - out.totalCharsAfter);
        out.toolStats.put("estimatedTokensBefore", estimateTokens(out.totalCharsBefore));
        out.toolStats.put("estimatedTokensAfter", estimateTokens(out.totalCharsAfter));
        out.toolStats.put("estimatedTokenSavings", Math.max(0, estimateTokens(out.totalCharsBefore) - estimateTokens(out.totalCharsAfter)));
        out.toolStats.put("elapsedMs", Math.max(0L, System.currentTimeMillis() - orchestrationStartMs));

        return finalizeOrchestrationResult(out, effectiveRequestId, ownsTraceRequest, orchestrationStartMs);
    }

    private String sanitizeInternalOrchestrationContext(String context) {
        String safe = String.valueOf(context == null ? "" : context);
        if (safe.isBlank()) {
            return "";
        }
        StringBuilder out = new StringBuilder(safe.length());
        String[] lines = safe.split("\\n");
        for (String rawLine : lines) {
            String line = String.valueOf(rawLine == null ? "" : rawLine).trim();
            String lowered = line.toLowerCase(Locale.ROOT);

            if (lowered.startsWith("orchestration_dynamic_memory_source=")
                || lowered.startsWith("source=primary_flow")
                || lowered.startsWith("source=multimodal")
                || lowered.startsWith("dyn_ctx_")) {
                continue;
            }

            if (lowered.startsWith("source: dyn_ctx_")) {
                out.append("source: dynamic_context").append('\n');
                continue;
            }

            out.append(rawLine).append('\n');
        }
        return out.toString().replaceAll("\\n{3,}", "\\n\\n").trim();
    }

    private OrchestrationResult buildDegradedOrchestrationResult(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        String requestId,
        String pName,
        Integer pType,
        Exception error,
        AiAdaptiveRetryPolicy.RetryDecision retryDecision
    ) {
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;
        String safeContextType = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        String safeMode = String.valueOf(responseMode == null ? "edit" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeLanguage = String.valueOf(language == null ? "" : language).trim().toLowerCase(Locale.ROOT);

        OrchestrationResult out = new OrchestrationResult();
        out.enabled = true;
        out.routingTier = "solver_degraded";
        out.preferredModelHint = resolvePreferredModelHint(out.routingTier);
        out.speculativeOperation = "degraded_orchestration";
        out.speculativeExecuted = false;

        LocalToolDigest digest = runLocalTools(safeMessage, safeCode, safeAttachments, safeContextType);
        out.toolStats.put("requestId", requestId);
        out.toolStats.put("degradedMode", true);
        out.toolStats.put("degradedReason", truncateLine(String.valueOf(error == null ? "unknown" : error.getMessage()), 180));
        out.toolStats.put("routingTier", out.routingTier);
        out.toolStats.put("preferredModelHint", out.preferredModelHint);
        out.toolStats.putAll(digest.stats);
        if (!digest.menuSignals.isEmpty()) {
            out.toolStats.put("menuSignals", truncateLines(digest.menuSignals, 8, 96));
        }
        if (retryDecision != null) {
            out.toolStats.put("retryPolicyEnabled", true);
            out.toolStats.put("retryDecision", retryDecision.shouldRetry);
            out.toolStats.put("retryReason", retryDecision.reason == null ? "unknown" : retryDecision.reason.code);
            out.toolStats.put("retryRationale", retryDecision.rationale);
            if (retryDecision.strategy != null) {
                out.toolStats.put("retryStrategy", retryDecision.strategy.strategyId);
                out.toolStats.put("retryAdjustments", retryDecision.strategy.adjustments);
            }
        }

        int messageChars = safeMessage.length();
        int codeChars = safeCode.length();
        int attachmentChars = estimateAttachmentTextChars(safeAttachments);
        out.totalCharsBefore = messageChars + codeChars + attachmentChars;

        List<String> planSteps = new ArrayList<>(buildPlannerSteps(
            safeContextType,
            safeTaskType,
            safeMode,
            codeChars,
            attachmentChars,
            digest,
            AiMultimodalScannerService.ScanResult.disabled(),
            0d,
            new FlowDecision("solver_degraded", false, "resilient_fallback")
        ));
        planSteps.add("Degraded fallback: continue with deterministic local context only (no broad Lucene retry)");
        if (planSteps.size() > 8) {
            planSteps = new ArrayList<>(planSteps.subList(0, 8));
        }
        out.planSteps = planSteps;
        if (toolDagEnabled) {
            Map<String, Object> toolDag = buildToolDagPlan(
                planSteps,
                buildStructuredPlanSteps(planSteps),
                safeContextType,
                safeMode,
                digest,
                AiMultimodalScannerService.ScanResult.disabled(),
                new PlanCoverageCheck(48, Math.max(20, stepVerifierMinScore), false, "degraded", List.of("degraded_context")),
                new PlanSchemaCheck(46, Math.max(20, planSchemaMinScore), false, 1, List.of("degraded_schema"))
            );
            if (!toolDag.isEmpty()) {
                out.toolStats.putAll(toolDag);
            }
        }

        String focusedCode = buildFocusedCodeSnippet(safeCode, 6000);
        String tier1 = buildTier1Metadata(appId, safeContextType, safeTaskType, safeMode, safeLanguage, safeAttachments.size());
        String tier2 = buildTier2RelevantContext(digest, safeContextType);
        String tier3 = buildTier3RuntimeOutput(digest);
        String combined = "## LOCAL_AGENTIC_ORCHESTRATION\\n"
            + "Mode: resilient_degraded\\n"
            + "ORCHESTRATION_ROUTING_TIER=" + out.routingTier + "\\n"
            + "ORCHESTRATION_ERROR=" + truncateLine(String.valueOf(error == null ? "unknown" : error.getMessage()), 180) + "\\n"
            + "Plan steps:\\n"
            + toNumberedLines(planSteps)
            + "\\n### Tier 1: Metadata\\n" + tier1
            + "\\n\\n### Tier 2: Relevant Files/Signals\\n" + tier2
            + "\\n\\n### Tier 3: Runtime Tool Output (compressed)\\n" + tier3
            + (focusedCode.isBlank() ? "" : "\\n\\n### Focused Current Code Snippet\\n" + focusedCode);

        out.compressedContextBlock = sanitizeInternalOrchestrationContext(
            truncateMiddle(combined, Math.max(3500, maxContextChars))
        );
        out.totalCharsAfter = out.compressedContextBlock.length();
        out.savedChars = Math.max(0, out.totalCharsBefore - out.totalCharsAfter);
        out.toolStats.put("estimatedTokensBefore", estimateTokens(out.totalCharsBefore));
        out.toolStats.put("estimatedTokensAfter", estimateTokens(out.totalCharsAfter));
        out.toolStats.put("estimatedTokenSavings", Math.max(0, estimateTokens(out.totalCharsBefore) - estimateTokens(out.totalCharsAfter)));
        return out;
    }

    private String buildFocusedCodeSnippet(String code, int maxChars) {
        String safe = String.valueOf(code == null ? "" : code);
        if (safe.isBlank()) {
            return "";
        }
        int cap = Math.max(1200, maxChars);
        if (safe.length() <= cap) {
            return safe;
        }
        int head = Math.min(cap / 2, safe.length());
        int tail = Math.min(cap - head, safe.length() - head);
        return safe.substring(0, head)
            + "\\n... [snip " + Math.max(0, safe.length() - cap) + " chars] ...\\n"
            + safe.substring(safe.length() - tail);
    }

    private OrchestrationResult finalizeOrchestrationResult(
        OrchestrationResult out,
        String requestId,
        boolean ownsTraceRequest,
        long startMs
    ) {
        if (requestContextTracer != null) {
            requestContextTracer.endPhase("local_orchestration", requestId, Math.max(0L, System.currentTimeMillis() - startMs));
            requestContextTracer.recordMetric(requestId, "orchestration_saved_chars", Math.max(0, out.savedChars));
            if (ownsTraceRequest) {
                requestContextTracer.completeRequest(requestId);
            }
        }
        return out;
    }

    private List<String> buildPlannerSteps(
        String contextType,
        String taskType,
        String responseMode,
        int codeChars,
        int attachmentChars,
        LocalToolDigest digest,
        AiMultimodalScannerService.ScanResult scanResult,
        double offTopicConfidence,
        FlowDecision flowDecision
    ) {
        List<String> steps = new ArrayList<>();
        String flowName = flowDecision == null ? "GENERAL_ANALYSIS" : String.valueOf(flowDecision.routeName() == null ? "GENERAL_ANALYSIS" : flowDecision.routeName()).trim();
        steps.add("Classify request relevance (route=" + flowName + ", offTopicConfidence=" + String.format(Locale.ROOT, "%.2f", Math.max(0d, offTopicConfidence)) + ") and choose fast-exit vs full orchestration");
        steps.add("Plan request scope with code-string-first anchor (currentCode + cursor window) before any broad retrieval");

        if (codeChars > 0) {
            steps.add("Run local code symbol scan and logic-outline extraction to ground business flow evidence");
        }

        if (attachmentChars > 0) {
            steps.add("Run local attachment digest (json/md/image) and extract schema/summary signals before Lucene ingestion");
        }

        if (scanResult != null && scanResult.enabled() && scanResult.ingestCount() > 0) {
            steps.add("Run multimodal scanner (JSON/Image) and choose scoped dynamic-memory ingestion candidates");
        }

        if (digest != null && digest.intentKeywords != null && !digest.intentKeywords.isEmpty()) {
            steps.add("Build intent-driven Lucene query from message + symbols + attachment signals");
        }

        steps.add("Assemble tiered context (metadata -> relevant evidence -> runtime output) with dedupe and token budget");

        if ("menu_json".equals(contextType) || taskType.contains("menu")) {
            steps.add("Prioritize schema/table/trigger signals for menu grounding and preserve unaffected nodes");
        } else {
            steps.add("Prioritize function/state/branch/side-effect evidence for code-business analysis");
        }

        if ("analyze".equals(responseMode)) {
            steps.add("Synthesize evidence-first analysis sections and stream each section incrementally to chat/editor timeline");
        } else {
            steps.add("Generate deterministic incremental textEdits and apply each accepted step directly to CodeMirror");
        }

        steps.add("Verify step quality (schema/verifier gates), then continue/rollback per step before final success event");
        steps.add("Apply routing matrix hint for model selection (planner/balanced/complex)");
        return steps;
    }

    private record PlanCoverageCheck(
        int score,
        int minScore,
        boolean passed,
        String verdict,
        List<String> missingAreas
    ) {}

    private PlanCoverageCheck evaluatePlanCoverage(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        int codeChars,
        int attachmentChars,
        LocalToolDigest digest,
        AiMultimodalScannerService.ScanResult scanResult,
        List<String> planSteps,
        Integer stepVerifierMinScoreOverride
    ) {
        List<String> missing = new ArrayList<>();
        List<String> steps = planSteps == null ? List.of() : planSteps;
        int score = 25;

        if (hasPlanSignal(steps, "scope", "route", "low-cost")) {
            score += 15;
        } else {
            missing.add("missing_scope_or_route_step");
        }

        if (codeChars <= 0 || hasPlanSignal(steps, "code symbol", "symbol scan", "source")) {
            score += 15;
        } else {
            missing.add("missing_code_symbol_step");
        }

        if (attachmentChars <= 0 || hasPlanSignal(steps, "attachment", "json key", "digest")) {
            score += 15;
        } else {
            missing.add("missing_attachment_digest_step");
        }

        String ctx = String.valueOf(contextType == null ? "" : contextType).toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).toLowerCase(Locale.ROOT);
        if ("menu_json".equals(ctx) || task.contains("menu")) {
            if (hasPlanSignal(steps, "schema", "table", "trigger", "menu grounding")) {
                score += 15;
            } else {
                missing.add("missing_menu_schema_grounding");
            }
        } else {
            score += 10;
        }

        String mode = String.valueOf(responseMode == null ? "" : responseMode).toLowerCase(Locale.ROOT);
        if (!"analyze".equals(mode) || hasPlanSignal(steps, "explanation", "analyze", "minimal")) {
            score += 10;
        } else {
            missing.add("missing_analyze_mode_guidance");
        }

        if (digest != null && digest.intentKeywords != null && !digest.intentKeywords.isEmpty()) {
            score += 5;
        }

        if (scanResult != null && scanResult.enabled() && scanResult.ingestCount() > 0) {
            if (hasPlanSignal(steps, "scanner", "multimodal", "ingestion")) {
                score += 5;
            } else {
                missing.add("missing_multimodal_scan_step");
            }
        }

        if (isBroadAnalysisRequest(message)) {
            if (hasPlanSignal(steps, "analysis", "logic", "reasoning")) {
                score += 5;
            } else {
                missing.add("missing_broad_analysis_reasoning_step");
            }
        }

        int capped = Math.max(0, Math.min(100, score));
        int configuredMin = stepVerifierMinScoreOverride == null ? stepVerifierMinScore : stepVerifierMinScoreOverride;
        int min = Math.max(20, Math.min(95, configuredMin));
        boolean passed = !stepVerifierEnabled || capped >= min;
        String verdict = passed ? "passed" : "needs_refine";
        return new PlanCoverageCheck(capped, min, passed, verdict, missing);
    }

    private record PlanSchemaCheck(
        int score,
        int minScore,
        boolean passed,
        int invalidCount,
        List<String> missingSignals
    ) {}

    private record ExecutionPlanningSnapshot(
        List<String> planSteps,
        PlanCoverageCheck planCoverage,
        PlanSchemaCheck schemaCheck,
        List<Map<String, Object>> structuredPlanSteps,
        boolean workflowBlueprintUsed,
        boolean executionPlannerUsed,
        int executionPlanStepCount,
        long executionPlanEstimatedMs,
        int executionPlanDeduped,
        boolean retrievalAware
    ) {}

    private List<Map<String, Object>> buildStructuredPlanSteps(List<String> planSteps) {
        if (planSteps == null || planSteps.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        int index = 1;
        for (String rawStep : planSteps) {
            String step = String.valueOf(rawStep == null ? "" : rawStep).trim();
            if (step.isBlank()) {
                continue;
            }
            String normalized = step.toLowerCase(Locale.ROOT);
            String action = "inspect_context";
            String inputSignal = "user_message";
            String evidenceSignal = "context_alignment";
            String stopCondition = "evidence_collected_or_no_signal";

            if (normalized.contains("scope") || normalized.contains("route")) {
                action = "route_scope";
                inputSignal = "request_intent";
                evidenceSignal = "routing_tier";
            } else if (normalized.contains("code symbol") || normalized.contains("symbol scan") || normalized.contains("source")) {
                action = "scan_symbols";
                inputSignal = "current_code";
                evidenceSignal = "symbol_hits";
                stopCondition = "symbol_hits_collected_or_limit_reached";
            } else if (normalized.contains("attachment") || normalized.contains("json key") || normalized.contains("digest")) {
                action = "digest_attachments";
                inputSignal = "attachments";
                evidenceSignal = "attachment_keys";
                stopCondition = "attachment_digest_complete";
            } else if (normalized.contains("scanner") || normalized.contains("multimodal") || normalized.contains("ingestion")) {
                action = "multimodal_scan";
                inputSignal = "image_json_attachments";
                evidenceSignal = "scanner_candidates";
                stopCondition = "scanner_candidates_ranked";
            } else if (normalized.contains("schema") || normalized.contains("table") || normalized.contains("trigger") || normalized.contains("menu")) {
                action = "ground_menu_schema";
                inputSignal = "menu_context";
                evidenceSignal = "schema_table_trigger_hits";
                stopCondition = "menu_grounding_sufficient";
            } else if (normalized.contains("explanation") || normalized.contains("analyze")) {
                action = "synthesize_analysis";
                inputSignal = "collected_evidence";
                evidenceSignal = "analysis_with_code_refs";
                stopCondition = "analysis_sections_complete";
            }

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("index", index++);
            row.put("raw", step);
            row.put("action", action);
            row.put("inputSignal", inputSignal);
            row.put("evidenceSignal", evidenceSignal);
            row.put("stopCondition", stopCondition);
            out.add(row);
        }
        return out;
    }

    private Map<String, Object> buildToolDagPlan(
        List<String> planSteps,
        List<Map<String, Object>> structuredPlanSteps,
        String contextType,
        String responseMode,
        LocalToolDigest digest,
        AiMultimodalScannerService.ScanResult scanResult,
        PlanCoverageCheck coverage,
        PlanSchemaCheck schema
    ) {
        if (!toolDagEnabled) {
            return Collections.emptyMap();
        }
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();
        int maxNodes = Math.max(3, toolDagMaxNodes);
        int idx = 1;

        nodes.add(buildToolDagNode("n1", idx++, "classify_request", "intent_router", "request_intent", "route_decision", "off_topic_or_supported_route", 0.15));
        if (scanResult != null && scanResult.enabled() && (scanResult.attachmentCount() > 0 || scanResult.ingestCount() > 0)) {
            nodes.add(buildToolDagNode("n2", idx++, "intake_multimodal", "multimodal_scanner", "attachments", "scanner_scope_mask", "scope_mask_ready", 0.22));
        }
        nodes.add(buildToolDagNode("n3", idx++, "ingest_scoped_memory", "lucene_ingestion", "current_code+menu", "dynamic_context_ids", "ingestion_completed", 0.33));
        nodes.add(buildToolDagNode("n4", idx++, "retrieve_scoped_context", "lucene_vector_retrieval", "scope_mask+query", "scoped_rag_block", "retrieval_quality_sufficient", 0.48));
        nodes.add(buildToolDagNode("n5", idx++, "verify_plan", "plan_verifier", "plan_steps", "coverage+schema_scores", "verification_passed_or_refine", 0.62));
        nodes.add(buildToolDagNode(
            "n6",
            idx,
            "stream_results",
            "codemirror_streamer",
            "verified_steps",
            "agentic_step_result_events",
            "all_steps_emitted",
            0.78
        ));

        if (nodes.size() > maxNodes) {
            nodes = new ArrayList<>(nodes.subList(0, maxNodes));
        }

        for (int i = 0; i < nodes.size() - 1; i++) {
            String from = String.valueOf(nodes.get(i).getOrDefault("id", ""));
            String to = String.valueOf(nodes.get(i + 1).getOrDefault("id", ""));
            if (!from.isBlank() && !to.isBlank()) {
                edges.add(Map.of("from", from, "to", to, "type", "sequential"));
            }
        }

        double confidence = Math.max(0d, Math.min(1d,
            ((coverage == null ? 0 : coverage.score) * 0.6 + (schema == null ? 0 : schema.score) * 0.4) / 100.0));
        String stopReason = confidence >= toolDagMinConfidenceStop
            ? "confidence_sufficient"
            : "needs_refine_or_retry";
        String mode = String.valueOf(responseMode == null ? "edit" : responseMode).toLowerCase(Locale.ROOT);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("toolDagEnabled", true);
        out.put("toolDagVersion", "v1");
        out.put("toolDagNodes", nodes);
        out.put("toolDagEdges", edges);
        out.put("toolDagNodeCount", nodes.size());
        out.put("toolDagEdgeCount", edges.size());
        out.put("toolDagStopPolicy", Map.of(
            "minConfidence", toolDagMinConfidenceStop,
            "currentConfidence", confidence,
            "stopReason", stopReason,
            "mode", mode,
            "contextType", String.valueOf(contextType == null ? "" : contextType)
        ));
        if (digest != null && digest.intentKeywords != null && !digest.intentKeywords.isEmpty()) {
            out.put("toolDagIntentAnchors", digest.intentKeywords.stream().limit(8).toList());
        }
        if (planSteps != null && !planSteps.isEmpty()) {
            out.put("toolDagPlanSteps", planSteps.stream().limit(10).toList());
        }
        if (structuredPlanSteps != null && !structuredPlanSteps.isEmpty()) {
            out.put("toolDagStructuredSteps", structuredPlanSteps.stream().limit(10).toList());
        }
        return out;
    }

    private Map<String, Object> buildToolDagNode(
        String id,
        int order,
        String intent,
        String tool,
        String input,
        String output,
        String stopCondition,
        double minConfidence
    ) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("order", order);
        node.put("intent", intent);
        node.put("tool", tool);
        node.put("input", input);
        node.put("output", output);
        node.put("stopCondition", stopCondition);
        node.put("minConfidence", Math.max(0d, Math.min(1d, minConfidence)));
        node.put("status", "planned");
        return node;
    }

    private PlanSchemaCheck evaluatePlanSchema(List<Map<String, Object>> steps, Integer planSchemaMinScoreOverride) {
        List<Map<String, Object>> safeSteps = steps == null ? List.of() : steps;
        List<String> missing = new ArrayList<>();
        int score = 24;
        int invalidCount = 0;
        if (!safeSteps.isEmpty()) {
            score += Math.min(18, safeSteps.size() * 3);
        }

        boolean hasRoute = false;
        boolean hasEvidenceDriven = false;
        boolean hasStopCondition = false;
        for (Map<String, Object> step : safeSteps) {
            if (step == null || step.isEmpty()) {
                invalidCount++;
                continue;
            }
            String action = String.valueOf(step.getOrDefault("action", "")).trim();
            String input = String.valueOf(step.getOrDefault("inputSignal", "")).trim();
            String evidence = String.valueOf(step.getOrDefault("evidenceSignal", "")).trim();
            String stop = String.valueOf(step.getOrDefault("stopCondition", "")).trim();
            if (action.isBlank() || input.isBlank() || evidence.isBlank() || stop.isBlank()) {
                invalidCount++;
                continue;
            }
            if (action.contains("route")) {
                hasRoute = true;
            }
            if (evidence.toLowerCase(Locale.ROOT).contains("hit") || evidence.toLowerCase(Locale.ROOT).contains("evidence")) {
                hasEvidenceDriven = true;
            }
            if (stop.toLowerCase(Locale.ROOT).contains("complete") || stop.toLowerCase(Locale.ROOT).contains("limit") || stop.toLowerCase(Locale.ROOT).contains("sufficient")) {
                hasStopCondition = true;
            }
        }

        if (invalidCount == 0) {
            score += 22;
        } else {
            score -= Math.min(24, invalidCount * 6);
            missing.add("missing_structured_fields");
        }
        if (hasRoute) {
            score += 14;
        } else {
            missing.add("missing_route_action");
        }
        if (hasEvidenceDriven) {
            score += 14;
        } else {
            missing.add("missing_evidence_signal");
        }
        if (hasStopCondition) {
            score += 10;
        } else {
            missing.add("missing_stop_condition");
        }

        int capped = Math.max(0, Math.min(100, score));
        int configuredMin = planSchemaMinScoreOverride == null ? planSchemaMinScore : planSchemaMinScoreOverride;
        int min = Math.max(20, Math.min(95, configuredMin));
        boolean passed = !planSchemaEnabled || (invalidCount == 0 && capped >= min);
        return new PlanSchemaCheck(capped, min, passed, Math.max(0, invalidCount), missing);
    }

    private ExecutionPlanningSnapshot buildExecutionPlanningSnapshot(
        String safeMessage,
        String safeContextType,
        String safeTaskType,
        String safeMode,
        int codeChars,
        int attachmentChars,
        LocalToolDigest digest,
        AiMultimodalScannerService.ScanResult scanResult,
        double offTopicConfidence,
        FlowDecision flowDecision,
        Integer stepVerifierMinScoreOverride,
        Integer planSchemaMinScoreOverride,
        String safeCode,
        String retrievedContext,
        AiLocalWorkflowAdvisorService.WorkflowAdvice workflowAdvice
    ) {
        List<String> planSteps = new ArrayList<>(buildPlannerSteps(
            safeContextType,
            safeTaskType,
            safeMode,
            codeChars,
            attachmentChars,
            digest,
            scanResult,
            offTopicConfidence,
            flowDecision
        ));
        if (scanResult.enabled() && scanResult.ingestCount() > 0
            && (planSteps.isEmpty() || !planSteps.get(0).startsWith("Run multimodal scanner"))) {
            planSteps.add(0, "Run multimodal scanner (JSON/Image) and select dynamic memory ingestion candidates");
        }

        boolean workflowBlueprintUsed = false;
        List<String> workflowBlueprintSteps = normalizeWorkflowBlueprintPlanSteps(workflowAdvice);
        if (!workflowBlueprintSteps.isEmpty()) {
            workflowBlueprintUsed = true;
            planSteps = new ArrayList<>(workflowBlueprintSteps);
            if (scanResult.enabled() && scanResult.ingestCount() > 0
                && planSteps.stream().noneMatch(step -> String.valueOf(step).toLowerCase(Locale.ROOT).contains("scanner"))) {
                planSteps.add(0, "Run multimodal scanner (JSON/Image) and select dynamic memory ingestion candidates");
            }
        }

        boolean executionPlannerUsed = false;
        int executionPlanStepCount = 0;
        long executionPlanEstimatedMs = 0L;
        int executionPlanDeduped = 0;
        if (!workflowBlueprintUsed && aiExecutionPlannerService != null) {
            try {
                String workspaceContext = "menu_json".equals(safeContextType) ? "menu" : "code";
                AiExecutionPlannerService.ExecutionPlan executionPlan = aiExecutionPlannerService.generatePlan(
                    safeMessage,
                    workspaceContext,
                    safeCode,
                    retrievedContext
                );
                if (executionPlan != null && executionPlan.steps != null && !executionPlan.steps.isEmpty()) {
                    executionPlannerUsed = true;
                    executionPlanStepCount = executionPlan.getStepCount();
                    executionPlanEstimatedMs = executionPlan.totalEstimatedMs;
                    executionPlanDeduped = executionPlan.deduplicationCount;
                    planSteps = executionPlan.steps.stream()
                        .map(step -> "[" + step.action + "] " + step.description)
                        .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
                }
            } catch (Exception ignored) {
                // Keep heuristic planner when execution planner fails.
            }
        }

        PlanCoverageCheck planCoverage = evaluatePlanCoverage(
            safeMessage,
            safeContextType,
            safeTaskType,
            safeMode,
            codeChars,
            attachmentChars,
            digest,
            scanResult,
            planSteps,
            stepVerifierMinScoreOverride
        );
        if (stepVerifierEnabled && !planCoverage.passed && !planCoverage.missingAreas.isEmpty()) {
            planSteps.add("Verifier remediation: " + String.join("; ", planCoverage.missingAreas));
            planCoverage = evaluatePlanCoverage(
                safeMessage,
                safeContextType,
                safeTaskType,
                safeMode,
                codeChars,
                attachmentChars,
                digest,
                scanResult,
                planSteps,
                stepVerifierMinScoreOverride
            );
        }

        List<Map<String, Object>> structuredPlanSteps = buildStructuredPlanSteps(planSteps);
        PlanSchemaCheck schemaCheck = evaluatePlanSchema(structuredPlanSteps, planSchemaMinScoreOverride);
        if (planSchemaEnabled && !schemaCheck.passed && !schemaCheck.missingSignals.isEmpty()) {
            planSteps.add("Schema remediation: " + String.join("; ", schemaCheck.missingSignals));
            structuredPlanSteps = buildStructuredPlanSteps(planSteps);
            schemaCheck = evaluatePlanSchema(structuredPlanSteps, planSchemaMinScoreOverride);
        }

        return new ExecutionPlanningSnapshot(
            planSteps,
            planCoverage,
            schemaCheck,
            structuredPlanSteps,
            workflowBlueprintUsed,
            executionPlannerUsed,
            executionPlanStepCount,
            executionPlanEstimatedMs,
            executionPlanDeduped,
            retrievedContext != null && !retrievedContext.isBlank()
        );
    }

    private List<String> normalizeWorkflowBlueprintPlanSteps(AiLocalWorkflowAdvisorService.WorkflowAdvice workflowAdvice) {
        if (workflowAdvice == null || workflowAdvice.executionBlueprint().isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (Map<String, Object> step : workflowAdvice.executionBlueprint()) {
            if (step == null || step.isEmpty()) {
                continue;
            }
            String action = String.valueOf(step.getOrDefault("action", "")).trim();
            String description = String.valueOf(step.getOrDefault("description", "")).trim();
            String targetPath = String.valueOf(step.getOrDefault("targetPath", "")).trim();
            StringBuilder line = new StringBuilder();
            if (!action.isBlank()) {
                line.append('[').append(action).append(']').append(' ');
            }
            if (!description.isBlank()) {
                line.append(description);
            }
            if (!targetPath.isBlank()) {
                if (line.length() > 0) {
                    line.append(" -> ");
                }
                line.append(targetPath);
            }
            String normalized = line.toString().trim();
            if (!normalized.isBlank()) {
                out.add(normalized);
            }
            if (out.size() >= 8) {
                break;
            }
        }
        return out.isEmpty() ? List.of() : List.copyOf(out);
    }

    private void applyExecutionPlanningStats(
        OrchestrationResult out,
        ExecutionPlanningSnapshot snapshot,
        String safeContextType,
        String safeMode,
        LocalToolDigest digest,
        AiMultimodalScannerService.ScanResult scanResult
    ) {
        out.toolStats.put("planVerifierEnabled", stepVerifierEnabled);
        out.toolStats.put("planVerifierScore", snapshot.planCoverage().score);
        out.toolStats.put("planVerifierMinScore", snapshot.planCoverage().minScore);
        out.toolStats.put("planVerifierPassed", snapshot.planCoverage().passed);
        out.toolStats.put("planVerifierVerdict", snapshot.planCoverage().verdict);
        out.toolStats.put("planVerifierMissing", snapshot.planCoverage().missingAreas);
        out.toolStats.put("planSchemaEnabled", planSchemaEnabled);
        out.toolStats.put("planSchemaScore", snapshot.schemaCheck().score);
        out.toolStats.put("planSchemaMinScore", snapshot.schemaCheck().minScore);
        out.toolStats.put("planSchemaPassed", snapshot.schemaCheck().passed);
        out.toolStats.put("planSchemaInvalidCount", snapshot.schemaCheck().invalidCount);
        out.toolStats.put("planSchemaMissing", snapshot.schemaCheck().missingSignals);
        out.toolStats.put("planStructuredSteps", snapshot.structuredPlanSteps());
        out.toolStats.put("workflowBlueprintUsed", snapshot.workflowBlueprintUsed());
        out.toolStats.put("executionPlanUsed", snapshot.executionPlannerUsed());
        out.toolStats.put("executionPlanRetrievalAware", snapshot.retrievalAware());
        if (snapshot.workflowBlueprintUsed()) {
            out.toolStats.put("workflowBlueprintStepCount", snapshot.planSteps().size());
        }
        if (snapshot.executionPlannerUsed()) {
            out.toolStats.put("executionPlanStepCount", snapshot.executionPlanStepCount());
            out.toolStats.put("executionPlanEstimatedMs", snapshot.executionPlanEstimatedMs());
            out.toolStats.put("executionPlanDeduped", snapshot.executionPlanDeduped());
        }
        if (toolDagEnabled) {
            Map<String, Object> toolDag = buildToolDagPlan(
                snapshot.planSteps(),
                snapshot.structuredPlanSteps(),
                safeContextType,
                safeMode,
                digest,
                scanResult,
                snapshot.planCoverage(),
                snapshot.schemaCheck()
            );
            if (!toolDag.isEmpty()) {
                out.toolStats.putAll(toolDag);
            }
        }
    }

    private boolean hasPlanSignal(List<String> steps, String... signals) {
        if (steps == null || steps.isEmpty() || signals == null || signals.length == 0) {
            return false;
        }
        for (String step : steps) {
            String s = String.valueOf(step == null ? "" : step).toLowerCase(Locale.ROOT);
            if (s.isBlank()) {
                continue;
            }
            for (String signal : signals) {
                String token = String.valueOf(signal == null ? "" : signal).toLowerCase(Locale.ROOT).trim();
                if (!token.isBlank() && s.contains(token)) {
                    return true;
                }
            }
        }
        return false;
    }

    private String resolveRoutingTier(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        int codeChars,
        int attachmentChars
    ) {
        if (!routingMatrixEnabled) {
            return "solver_balanced";
        }
        String text = String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT);
        String ctx = String.valueOf(contextType == null ? "" : contextType).toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).toLowerCase(Locale.ROOT);
        String mode = String.valueOf(responseMode == null ? "" : responseMode).toLowerCase(Locale.ROOT);

        boolean planningLike = mode.contains("analy")
            || text.contains("plan")
            || text.contains("tìm")
            || text.contains("search")
            || text.contains("phân tích")
            || text.contains("phan tich");
        if (planningLike && codeChars < 30000 && attachmentChars < 50000) {
            return "planner_fast";
        }

        boolean complex = text.contains("refactor")
            || text.contains("kiến trúc")
            || text.contains("kien truc")
            || text.contains("architecture")
            || text.contains("complex")
            || codeChars > 120000
            || attachmentChars > 180000;
        if (complex || "menu_json".equals(ctx) || task.contains("menu")) {
            return "solver_complex";
        }

        return "solver_balanced";
    }

    private String resolvePreferredModelHint(String routingTier) {
        String tier = String.valueOf(routingTier == null ? "" : routingTier).trim().toLowerCase(Locale.ROOT);
        if ("planner_fast".equals(tier)) {
            return String.valueOf(plannerModelHint == null ? "gemini-2.5-flash" : plannerModelHint).trim();
        }
        if ("solver_complex".equals(tier)) {
            return String.valueOf(complexModelHint == null ? "gemini-2.5-pro" : complexModelHint).trim();
        }
        return String.valueOf(balancedModelHint == null ? "gemini-2.5-flash" : balancedModelHint).trim();
    }

    private LocalToolDigest runLocalTools(String message, String code, List<Map<String, Object>> attachments, String contextType) {
        LocalToolDigest digest = new LocalToolDigest();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        boolean menuFlow = "menu_json".equals(safeContextType);

        Set<String> intents = extractIntentKeywords(message, Math.max(4, maxIntents));
        digest.intentKeywords.addAll(intents);
        digest.stats.put("intentKeywords", intents.size());

        if (menuFlow) {
            List<String> menuSignals = extractMenuSignals(code, Math.max(10, maxCodeSymbols));
            digest.menuSignals.addAll(menuSignals);
            digest.stats.put("menuSignals", menuSignals.size());
            digest.stats.put("codeSymbols", 0);
        } else {
            List<String> codeSymbols = extractCodeSymbols(code, Math.max(10, maxCodeSymbols));
            digest.codeSymbols.addAll(codeSymbols);
            digest.stats.put("codeSymbols", codeSymbols.size());
            digest.stats.put("menuSignals", 0);
        }

        AttachmentDigest attachmentDigest = buildAttachmentDigest(attachments, Math.max(1, maxAttachmentItems));
        digest.attachmentItems.addAll(attachmentDigest.items);
        digest.stats.putAll(attachmentDigest.stats);

        return digest;
    }

    private String buildTier1Metadata(
        String appId,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        int attachmentCount
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("appId=").append(String.valueOf(appId == null ? "" : appId).trim()).append("\\n");
        sb.append("contextType=").append(contextType).append("\\n");
        sb.append("taskType=").append(taskType).append("\\n");
        sb.append("responseMode=").append(responseMode).append("\\n");
        sb.append("language=").append(language).append("\\n");
        sb.append("attachmentCount=").append(Math.max(0, attachmentCount));
        return sb.toString();
    }

    private String buildTier2RelevantContext(LocalToolDigest digest, String contextType) {
        StringBuilder sb = new StringBuilder();
        if (!digest.intentKeywords.isEmpty()) {
            sb.append("intentKeywords: ").append(String.join(", ", digest.intentKeywords)).append("\\n");
        }
        if ("menu_json".equals(contextType) && !digest.menuSignals.isEmpty()) {
            sb.append("menuSignals:\n");
            for (String line : digest.menuSignals) {
                sb.append("- ").append(line).append("\n");
            }
        }
        if (!"menu_json".equals(contextType) && !digest.codeSymbols.isEmpty()) {
            sb.append("codeSymbols:\\n");
            for (String line : digest.codeSymbols) {
                sb.append("- ").append(line).append("\\n");
            }
        }
        if (!digest.attachmentItems.isEmpty()) {
            sb.append("attachmentDigest:\\n");
            for (String item : digest.attachmentItems) {
                sb.append("- ").append(item).append("\\n");
            }
        }
        if ("menu_json".equals(contextType)) {
            sb.append("menuFocus: preserve schema consistency and avoid generating unknown entities\\n");
        }
        return sb.toString().trim();
    }

    private String buildTier3RuntimeOutput(LocalToolDigest digest) {
        Map<String, Object> runtime = new LinkedHashMap<>();
        runtime.put("stats", digest.stats);
        runtime.put("intents", digest.intentKeywords);
        runtime.put("codeSymbolCount", digest.codeSymbols.size());
        runtime.put("menuSignalCount", digest.menuSignals.size());
        runtime.put("attachmentItemCount", digest.attachmentItems.size());
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(runtime);
        } catch (Exception ignored) {
            return String.valueOf(runtime);
        }
    }

    private AdaptiveRetrievalPlan buildAdaptiveRetrievalPlan(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        String code,
        List<Map<String, Object>> attachments,
        LocalToolDigest digest,
        int aggregateScopeMask,
        AiMultimodalScannerService.ScanResult scanResult,
        int policyTopK  // NEW: Policy-decided topK override
    ) {
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeMode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        int codeChars = String.valueOf(code == null ? "" : code).length();
        int attachmentCount = attachments == null ? 0 : attachments.size();
        boolean hasJsonAttachments = attachments != null && attachments.stream().anyMatch(item -> {
            String mime = String.valueOf(item == null ? "" : item.get("mimeType")).toLowerCase(Locale.ROOT);
            String type = String.valueOf(item == null ? "" : item.get("type")).toLowerCase(Locale.ROOT);
            String kind = String.valueOf(item == null ? "" : item.get("kind")).toLowerCase(Locale.ROOT);
            return mime.contains("json") || type.contains("json") || kind.contains("json");
        });
        boolean hasImageAttachments = attachments != null && attachments.stream().anyMatch(item -> {
            String mime = String.valueOf(item == null ? "" : item.get("mimeType")).toLowerCase(Locale.ROOT);
            String type = String.valueOf(item == null ? "" : item.get("type")).toLowerCase(Locale.ROOT);
            String kind = String.valueOf(item == null ? "" : item.get("kind")).toLowerCase(Locale.ROOT);
            return mime.startsWith("image/") || type.contains("image") || kind.contains("image");
        });

        OrchestrationRequest retrievalRequest = OrchestrationRequest.builder()
            .appId("")
            .message(safeMessage)
            .currentCode(String.valueOf(code == null ? "" : code))
            .attachments(attachments)
            .contextType(safeContextType)
            .taskType(safeTaskType)
            .responseMode(safeMode)
            .language("")
            .build();
        RetrievalTuningProfile retrievalProfile = RETRIEVAL_PROFILE_FACTORY.create(retrievalRequest.prototype().build());

        String query = buildSelfDirectedRetrievalQuery(
            safeMessage,
            digest.intentKeywords,
            digest.codeSymbols,
            digest.menuSignals,
            attachments,
            safeContextType,
            safeTaskType,
            safeMode
        );

        int scopeMask = Math.max(1, aggregateScopeMask);
        int topK = policyTopK > 0 ? policyTopK : Math.max(2, scopedRagTopK);
        int maxChars = Math.max(1600, scopedRagMaxChars);
        List<String> reasons = new ArrayList<>();
        if (policyTopK > 0) {
            reasons.add("policy_engine_adaptive_topk");
        }

        if (aiLocalFlowContextPolicy != null) {
            AiLocalFlowContextPolicy.RagFlowPreset flowPreset = aiLocalFlowContextPolicy.ragPreset(
                safeContextType,
                safeMode,
                safeTaskType,
                isWeakOrchestrationProfile());
            scopeMask = aiLocalFlowContextPolicy.mergeScopeMask(scopeMask, flowPreset.scopeMask());
            if (policyTopK <= 0) {
                topK = flowPreset.topK();
            }
            maxChars = Math.max(maxChars, flowPreset.maxChars());
            reasons.addAll(aiLocalFlowContextPolicy.presetReasonTags(flowPreset.flow()));
            reasons.add("flow_rag_preset:" + flowPreset.label());
        }

        RecoveryHints recoveryHints = recoveryHintsContext.get();

        if (!adaptiveScopeRagEnabled) {
            if (recoveryHints != null) {
                scopeMask = scopeMask | Math.max(0, recoveryHints.scopeMaskOr);
                topK = (int) Math.round(topK * Math.max(0.6d, Math.min(1.8d, recoveryHints.topKMultiplier)));
                maxChars = (int) Math.round(maxChars * Math.max(0.7d, Math.min(1.7d, recoveryHints.maxCharsMultiplier)));
                reasons.add("recovery_retry_adjustments");
            }
            int baseTopK = Math.max(2, topK + retrievalProfile.topKBoost());
            int baseMaxChars = Math.max(1200, maxChars + retrievalProfile.maxCharsBoost());
            return new AdaptiveRetrievalPlan(scopeMask, baseTopK, baseMaxChars, query, false, reasons);
        }

        if ("menu_json".equals(safeContextType) || safeTaskType.contains("menu")) {
            reasons.add("menu_context_signal");
        }

        if ("analyze".equals(safeMode)) {
            reasons.add("analyze_mode_signal");
        }

        if (retrievalProfile.topKBoost() > 0 || retrievalProfile.maxCharsBoost() > 0) {
            topK += retrievalProfile.topKBoost();
            maxChars += retrievalProfile.maxCharsBoost();
            reasons.add("abstract_factory_profile_boost");
        }

        if (codeChars > 80000 && !isWeakOrchestrationProfile()) {
            topK += 1;
            maxChars += 1200;
            reasons.add("large_code_context_boost");
        }

        if (attachmentCount >= 3) {
            topK += 1;
            reasons.add("multi_attachment_boost");
        }

        if (hasJsonAttachments) {
            maxChars += 700;
            reasons.add("json_attachment_schema_boost");
        }

        if (hasImageAttachments) {
            reasons.add("image_attachment_keep_scope_broad");
        }

        if (scanResult != null && scanResult.enabled() && scanResult.ingestCount() > 0) {
            topK += 1;
            reasons.add("scanner_ingestion_boost");
        }

        if (digest != null && digest.intentKeywords.size() >= 6) {
            topK += 1;
            reasons.add("intent_keyword_density_boost");
        }

        if (recoveryHints != null) {
            scopeMask = scopeMask | Math.max(0, recoveryHints.scopeMaskOr);
            topK = (int) Math.round(topK * Math.max(0.6d, Math.min(1.8d, recoveryHints.topKMultiplier)));
            maxChars = (int) Math.round(maxChars * Math.max(0.7d, Math.min(1.7d, recoveryHints.maxCharsMultiplier)));
            reasons.add("recovery_retry_adjustments");
        }

        topK = Math.max(Math.max(2, adaptiveScopeRagMinTopK), Math.min(Math.max(adaptiveScopeRagMinTopK, adaptiveScopeRagMaxTopK), topK));
        int adaptiveMaxChars = Math.max(Math.max(1200, adaptiveScopeRagMinMaxChars), Math.min(Math.max(adaptiveScopeRagMinMaxChars, adaptiveScopeRagMaxMaxChars), maxChars));
        if (isWeakOrchestrationProfile()) {
            adaptiveMaxChars = Math.min(adaptiveMaxChars, Math.max(1200, scopedRagMaxChars));
        }
        maxChars = adaptiveMaxChars;

        return new AdaptiveRetrievalPlan(scopeMask, topK, maxChars, query, true, reasons);
    }

    private boolean isWeakOrchestrationProfile() {
        String tier = String.valueOf(aiLocalRuntimeTier == null ? "" : aiLocalRuntimeTier).trim().toLowerCase(Locale.ROOT);
        return tier.contains("weak") || tier.contains("5gb") || tier.equals("v7");
    }

    private record AdaptiveRetrievalPlan(
        int scopeMask,
        int topK,
        int maxChars,
        String query,
        boolean adaptive,
        List<String> reasons
    ) {}

    private Set<String> extractIntentKeywords(String message, int limit) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        Matcher m = TOKEN_PATTERN.matcher(String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT));
        while (m.find()) {
            String token = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
            if (token.isBlank()) {
                continue;
            }
            if (out.add(token) && out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private List<String> extractCodeSymbols(String code, int limit) {
        List<String> out = new ArrayList<>();
        if (code == null || code.isBlank()) {
            return out;
        }
        String source = code.length() > 300000 ? code.substring(0, 300000) : code;
        Matcher m = CODE_SYMBOL_PATTERN.matcher(source);
        while (m.find()) {
            String line = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
            if (line.isEmpty()) {
                continue;
            }
            out.add(truncateLine(line, 160));
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private List<String> extractMenuSignals(String menuJson, int limit) {
        LinkedHashSet<String> signals = new LinkedHashSet<>();
        String source = String.valueOf(menuJson == null ? "" : menuJson).trim();
        if (source.isBlank()) {
            return new ArrayList<>();
        }

        try {
            JsonNode root = objectMapper.readTree(source);
            collectMenuSignals(root, signals, Math.max(4, limit * 3));
        } catch (Exception ignored) {
            Matcher matcher = Pattern.compile("\"(label|table_name|parentId|parentid|type_form|id)\"\\s*:\\s*\"?([^\",}\\n]+)").matcher(source);
            while (matcher.find() && signals.size() < Math.max(4, limit * 3)) {
                String key = String.valueOf(matcher.group(1) == null ? "" : matcher.group(1)).trim().toLowerCase(Locale.ROOT);
                String value = String.valueOf(matcher.group(2) == null ? "" : matcher.group(2)).trim();
                if (!value.isBlank()) {
                    signals.add(key + "=" + truncateLine(value, 48));
                }
            }
        }

        List<String> out = new ArrayList<>();
        for (String signal : signals) {
            String safe = truncateLine(String.valueOf(signal == null ? "" : signal).trim(), 96);
            if (!safe.isBlank()) {
                out.add(safe);
            }
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private void collectMenuSignals(JsonNode node, LinkedHashSet<String> signals, int maxSignals) {
        if (node == null || signals.size() >= maxSignals) {
            return;
        }
        if (node.isObject()) {
            addMenuSignal(signals, "id", node.get("id"), maxSignals);
            addMenuSignal(signals, "label", node.get("label"), maxSignals);
            addMenuSignal(signals, "table_name", node.get("table_name"), maxSignals);
            addMenuSignal(signals, "parentId", node.get("parentId"), maxSignals);
            addMenuSignal(signals, "parentid", node.get("parentid"), maxSignals);
            addMenuSignal(signals, "type_form", node.get("type_form"), maxSignals);
            JsonNode triggerNode = node.get("trigger");
            if (triggerNode != null && triggerNode.isObject()) {
                triggerNode.fieldNames().forEachRemaining(name -> {
                    if (signals.size() < maxSignals) {
                        String safe = String.valueOf(name == null ? "" : name).trim();
                        if (!safe.isBlank()) {
                            signals.add("trigger=" + truncateLine(safe, 48));
                        }
                    }
                });
            }
            collectMenuSignals(node.get("menu"), signals, maxSignals);
            collectMenuSignals(node.get("children"), signals, maxSignals);
            return;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                if (signals.size() >= maxSignals) {
                    break;
                }
                collectMenuSignals(item, signals, maxSignals);
            }
        }
    }

    private void addMenuSignal(LinkedHashSet<String> signals, String key, JsonNode valueNode, int maxSignals) {
        if (signals.size() >= maxSignals || valueNode == null || valueNode.isNull()) {
            return;
        }
        String value = valueNode.isValueNode() ? valueNode.asText("") : "";
        String safe = String.valueOf(value == null ? "" : value).trim();
        if (!safe.isBlank()) {
            signals.add(key + "=" + truncateLine(safe, 48));
        }
    }

    /**
     * Build symbol-aware retrieval queries from code symbols.
     * Extracts function/class names and derives targeted search queries.
     * Format: "symbolName implementation behavior" or "symbolName usage"
     */
    private List<String> prependLifecycleSymbolsFromRequest(String requestText) {
        List<String> out = new ArrayList<>();
        String lower = String.valueOf(requestText == null ? "" : requestText).toLowerCase(Locale.ROOT);
        if (!(lower.contains("webview") || lower.contains("process") || lower.contains("proxy")
                || lower.contains("tắt") || lower.contains("treo") || lower.contains("kill")
                || lower.contains("resetip") || lower.contains("fnreset"))) {
            return out;
        }
        String[] hints = {
            "closeAllTabsAndCleanup", "fnResetIP", "waitForAllTabsClose",
            "clearInterval", "CallMouseEvent", "sophutLamtuoi", "webview", "stopProcess"
        };
        for (String hint : hints) {
            out.add(hint);
        }
        return out;
    }

    private List<String> buildSymbolAwareQueries(List<String> codeSymbols, int limit) {
        List<String> out = new ArrayList<>();
        if (codeSymbols == null || codeSymbols.isEmpty()) {
            return out;
        }

        for (String symbolLine : codeSymbols) {
            if (symbolLine == null || symbolLine.isBlank()) {
                continue;
            }
            String safeLine = String.valueOf(symbolLine).trim();
            
            // Extract potential symbol names from the line
            // e.g., "public void processUserData(..." -> extract "processUserData"
            // "class MenuItem {" -> extract "MenuItem"
            String[] potentialSymbols = safeLine.split("[\\s\\(\\{<>\\[\\]=\"\\.]+");
            for (String sym : potentialSymbols) {
                String cleanSym = String.valueOf(sym == null ? "" : sym).trim();
                if (cleanSym.length() >= 3 
                    && !cleanSym.equalsIgnoreCase("public")
                    && !cleanSym.equalsIgnoreCase("private")
                    && !cleanSym.equalsIgnoreCase("protected")
                    && !cleanSym.equalsIgnoreCase("static")
                    && !cleanSym.equalsIgnoreCase("void")
                    && !cleanSym.equalsIgnoreCase("class")
                    && !cleanSym.equalsIgnoreCase("interface")
                    && !cleanSym.equalsIgnoreCase("function")
                    && !cleanSym.equalsIgnoreCase("def")) {
                    
                    // Generate query variants
                    String implQuery = cleanSym + " implementation logic";
                    String usageQuery = cleanSym + " usage pattern";
                    
                    if (!out.contains(implQuery)) {
                        out.add(implQuery);
                    }
                    if (out.size() < limit && !out.contains(usageQuery)) {
                        out.add(usageQuery);
                    }
                    
                    if (out.size() >= limit) {
                        break;
                    }
                }
            }
            if (out.size() >= limit) {
                break;
            }
        }
        
        return out.subList(0, Math.min(limit, out.size()));
    }

    /**
     * Extract type hints from code for type-aware injection.
     * Captures: Java types (List<String>, User myVar), TypeScript types (string, interface User),
     * Python types (: str, -> int, Union[str, int]).
     * 
     * Returns deduplicated list of detected types with confidence scoring.
     * Purpose: Inject into prompt as "## Available Types in This Code" block for better accuracy.
     */
    private List<String> extractTypeHints(String code, int limit) {
        List<String> out = new ArrayList<>();
        if (code == null || code.isBlank()) {
            return out;
        }
        
        String source = code.length() > 300000 ? code.substring(0, 300000) : code;
        
        // Detect language hints to improve type extraction
        boolean isJava = source.contains("public class") || source.contains("import ") && source.contains(";");
        boolean isTypeScript = source.contains("interface ") || source.contains("type ") || source.contains("export ");
        boolean isPython = source.contains("def ") || source.contains("import ") && source.contains("\n");
        
        LinkedHashSet<String> typeSet = new LinkedHashSet<>();
        
        // Extract type declarations
        Matcher m = CODE_TYPE_PATTERN.matcher(source);
        while (m.find() && typeSet.size() < limit) {
            String typeMatch = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
            if (!typeMatch.isEmpty() && typeMatch.length() <= 80) {
                typeSet.add(typeMatch);
            }
        }
        
        // Java-specific: extract from method signatures and field declarations
        if (isJava) {
            Pattern javaFieldPattern = Pattern.compile(
                "(?:public|private|protected)?\\s*(?:static\\s+)?(?:final\\s+)?" +
                "(List|Set|Map|Optional|String|int|long|double|float|boolean|Object|[A-Z][A-Za-z0-9]*)" +
                "(?:<[^>]+>)?\\s+[a-z_][a-zA-Z0-9_]*");
            Matcher jm = javaFieldPattern.matcher(source);
            while (jm.find() && typeSet.size() < limit) {
                String javaType = jm.group(1);
                if (javaType != null && !javaType.isEmpty()) {
                    typeSet.add(javaType);
                }
            }
        }
        
        // TypeScript-specific: extract interface and type definitions
        if (isTypeScript) {
            Pattern tsInterfacePattern = Pattern.compile("(?:interface|type)\\s+([A-Z][A-Za-z0-9]*)");
            Matcher tm = tsInterfacePattern.matcher(source);
            while (tm.find() && typeSet.size() < limit) {
                String tsType = tm.group(1);
                if (tsType != null && !tsType.isEmpty()) {
                    typeSet.add(tsType);
                }
            }
        }
        
        // Python-specific: extract type hints (: type, -> type)
        if (isPython) {
            Pattern pythonTypePattern = Pattern.compile(
                "(?::\\s*([A-Z][A-Za-z0-9]*|(?:str|int|float|bool|list|dict|tuple|Optional|Union)(?:\\[[^\\]]+\\])?))" +
                "|(?:->\\s*([A-Z][A-Za-z0-9]*|(?:str|int|float|bool|list|dict|tuple|Optional|Union)(?:\\[[^\\]]+\\])?))"
            );
            Matcher pm = pythonTypePattern.matcher(source);
            while (pm.find() && typeSet.size() < limit) {
                String pyType1 = pm.group(1);
                String pyType2 = pm.group(2);
                String pyType = pyType1 != null ? pyType1 : pyType2;
                if (pyType != null && !pyType.isEmpty()) {
                    typeSet.add(pyType);
                }
            }
        }
        
        out.addAll(typeSet);
        return out.subList(0, Math.min(limit, out.size()));
    }

    private AttachmentDigest buildAttachmentDigest(List<Map<String, Object>> attachments, int limit) {
        AttachmentDigest out = new AttachmentDigest();
        if (attachments == null || attachments.isEmpty()) {
            out.stats.put("attachmentCount", 0);
            out.stats.put("attachmentTextChars", 0);
            return out;
        }

        int count = 0;
        int totalChars = 0;
        int jsonHints = 0;
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            count++;
            String name = str(attachment.get("name"));
            String kind = str(attachment.get("kind"));
            String contextRole = str(attachment.get("contextRole"));
            boolean authoritative = toBool(attachment.get("authoritative"));
            int size = toInt(attachment.get("size"));
            String summary = str(attachment.get("summary"));
            String textContent = str(attachment.get("textContent"));
            int textChars = textContent.length();
            totalChars += textChars;

            StringBuilder line = new StringBuilder();
            line.append(name.isBlank() ? "(unnamed)" : name)
                .append(" | kind=").append(kind)
                .append(" | role=").append(contextRole)
                .append(" | auth=").append(authoritative)
                .append(" | size=").append(size)
                .append(" | textChars=").append(textChars);
            if (!summary.isBlank()) {
                line.append(" | summary=").append(truncateLine(summary, 120));
            }

            if (("json".equalsIgnoreCase(kind) || name.toLowerCase(Locale.ROOT).endsWith(".json")) && !textContent.isBlank()) {
                jsonHints++;
                String keys = extractJsonRootKeys(textContent, 8);
                if (!keys.isBlank()) {
                    line.append(" | rootKeys=").append(keys);
                }
            }

            if (out.items.size() < limit) {
                out.items.add(line.toString());
            }
        }

        out.stats.put("attachmentCount", count);
        out.stats.put("attachmentTextChars", totalChars);
        out.stats.put("jsonAttachmentHints", jsonHints);
        out.stats.put("attachmentItemsIncluded", out.items.size());
        return out;
    }

    private String extractJsonRootKeys(String text, int maxKeys) {
        try {
            JsonNode node = objectMapper.readTree(text);
            if (!node.isObject()) {
                return "";
            }
            List<String> keys = new ArrayList<>();
            node.fieldNames().forEachRemaining(keys::add);
            if (keys.isEmpty()) {
                return "";
            }
            return String.join(", ", keys.subList(0, Math.min(keys.size(), Math.max(1, maxKeys))));
        } catch (Exception ignored) {
            return "";
        }
    }

    private int estimateAttachmentTextChars(List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (Map<String, Object> item : attachments) {
            if (item == null) {
                continue;
            }
            String text = str(item.get("textContent"));
            total += text.length();
        }
        return total;
    }

    private int estimateTokens(int chars) {
        if (chars <= 0) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(chars / 4.0));
    }

    private String toNumberedLines(List<String> lines) {
        if (lines == null || lines.isEmpty()) {
            return "1. Build minimal context\\n2. Execute local tools\\n3. Send compressed results to model\\n";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            sb.append(i + 1).append(". ").append(String.valueOf(lines.get(i) == null ? "" : lines.get(i)).trim()).append("\\n");
        }
        return sb.toString();
    }

    private String truncateMiddle(String text, int maxChars) {
        String source = String.valueOf(text == null ? "" : text);
        if (source.length() <= maxChars) {
            return source;
        }
        int safeMax = Math.max(200, maxChars);
        int head = (int) Math.floor(safeMax * 0.6);
        int tail = safeMax - head - 20;
        if (tail < 40) {
            tail = 40;
            head = Math.max(80, safeMax - tail - 20);
        }
        return source.substring(0, Math.min(source.length(), head))
            + "\\n... [LOCAL_ORCHESTRATION_TRUNCATED] ...\\n"
            + source.substring(Math.max(0, source.length() - tail));
    }

    private String truncateLine(String text, int maxLen) {
        String v = String.valueOf(text == null ? "" : text).trim();
        if (v.length() <= maxLen) {
            return v;
        }
        return v.substring(0, Math.max(0, maxLen - 3)) + "...";
    }

    private String trimTo(String text, int maxChars) {
        String value = String.valueOf(text == null ? "" : text).trim();
        int cap = Math.max(120, maxChars);
        if (value.length() <= cap) {
            return value;
        }
        return value.substring(0, cap);
    }

    private String summarizeScopeTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return "none";
        }
        List<String> out = new ArrayList<>();
        for (String tag : tags) {
            String safe = String.valueOf(tag == null ? "" : tag).trim();
            if (safe.startsWith("scope_")) {
                safe = safe.substring("scope_".length());
            }
            if (!safe.isBlank()) {
                out.add(safe);
            }
        }
        return out.isEmpty() ? "none" : String.join(", ", out);
    }

    private AiLocalWorkflowAdvisorService.IntentSnapshot buildWorkflowIntentSnapshot(String contextType, String responseMode) {
        boolean menuFlow = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());
        return new AiLocalWorkflowAdvisorService.IntentSnapshot(
            menuFlow ? "EDIT_MENU" : "EDIT_CODE",
            "edit".equalsIgnoreCase(String.valueOf(responseMode == null ? "" : responseMode).trim()) ? "modify" : "search",
            60,
            menuFlow ? "load_menu_context" : "load_code_context",
            menuFlow ? "menu" : "code"
        );
    }

    private String buildPlannerQueryHint(
        String message,
        LocalToolDigest digest,
        String contextType,
        String taskType,
        String responseMode
    ) {
        return truncateMiddle(
            buildSelfDirectedRetrievalQuery(
                message,
                digest == null ? Set.of() : digest.intentKeywords,
                digest == null ? List.of() : digest.codeSymbols,
                digest == null ? List.of() : digest.menuSignals,
                List.of(),
                contextType,
                taskType,
                responseMode
            ),
            240
        );
    }

    private int mergeWorkflowAdviceScopeMask(int fallbackMask, AiLocalWorkflowAdvisorService.WorkflowAdvice workflowAdvice) {
        int mask = Math.max(0, fallbackMask);
        if (workflowAdvice == null) {
            return mask;
        }
        String workspaceKind = String.valueOf(workflowAdvice.workspaceKind() == null ? "" : workflowAdvice.workspaceKind()).trim().toLowerCase(Locale.ROOT);
        if ("menu".equals(workspaceKind)) {
            mask |= AiMultimodalScannerService.SCOPE_MENU | AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
        } else if ("code".equals(workspaceKind)) {
            mask |= AiMultimodalScannerService.SCOPE_CODE;
        }
        for (String target : workflowAdvice.ingestTargets()) {
            String safeTarget = String.valueOf(target == null ? "" : target).trim().toLowerCase(Locale.ROOT);
            switch (safeTarget) {
                case "current_menu", "menu_attachments" -> mask |= AiMultimodalScannerService.SCOPE_MENU | AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
                case "current_code", "code_attachments" -> mask |= AiMultimodalScannerService.SCOPE_CODE;
                case "business_markdown", "reference_attachments" -> mask |= AiMultimodalScannerService.SCOPE_BUSINESS;
                case "json_attachments" -> mask |= AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
                default -> {
                }
            }
        }
        return Math.max(mask, Math.max(0, fallbackMask));
    }

    private int defaultScopeMaskForContext(String contextType, String taskType) {
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        if ("menu_json".equals(ctx) || task.contains("menu")) {
            return AiMultimodalScannerService.SCOPE_MENU | AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
        }
        return AiMultimodalScannerService.SCOPE_CODE;
    }

    private String buildSelfDirectedRetrievalQuery(
        String message,
        Set<String> intentKeywords,
        List<String> codeSymbols,
        List<String> menuSignals,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode
    ) {
        StringBuilder q = new StringBuilder();
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        boolean menuFlow = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());
        q.append(safeMessage);
        if (intentKeywords != null && !intentKeywords.isEmpty()) {
            q.append(" | intents: ");
            int count = 0;
            for (String token : intentKeywords) {
                if (token == null || token.isBlank()) {
                    continue;
                }
                if (count > 0) {
                    q.append(' ');
                }
                q.append(token.trim());
                count++;
                if (count >= 8) {
                    break;
                }
            }
        }

        if (!menuFlow && codeSymbols != null && !codeSymbols.isEmpty()) {
            q.append(" | symbols: ");
            int count = 0;
            for (String symbol : codeSymbols) {
                String safe = String.valueOf(symbol == null ? "" : symbol).trim();
                if (safe.isBlank()) {
                    continue;
                }
                // Keep only identifier-like tokens from signatures to avoid noisy long lines.
                Matcher m = TOKEN_PATTERN.matcher(safe.toLowerCase(Locale.ROOT));
                while (m.find()) {
                    String token = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
                    if (token.length() < 3) {
                        continue;
                    }
                    if (count > 0) {
                        q.append(' ');
                    }
                    q.append(token);
                    count++;
                    if (count >= 14) {
                        break;
                    }
                }
                if (count >= 14) {
                    break;
                }
            }
        }

        if (menuFlow && menuSignals != null && !menuSignals.isEmpty()) {
            q.append(" | menu: ");
            int count = 0;
            for (String signal : menuSignals) {
                String safeSignal = String.valueOf(signal == null ? "" : signal).trim();
                if (safeSignal.isBlank()) {
                    continue;
                }
                if (count > 0) {
                    q.append(' ');
                }
                q.append(safeSignal);
                count++;
                if (count >= 10) {
                    break;
                }
            }
        }

        List<String> attachmentHints = extractAttachmentSearchHints(attachments, 16);
        if (!attachmentHints.isEmpty()) {
            q.append(" | attachments: ");
            q.append(String.join(" ", attachmentHints));
        }

        int semanticIntentDensity = 0;
        if (intentKeywords != null) {
            for (String token : intentKeywords) {
                String safe = String.valueOf(token == null ? "" : token).trim();
                if (safe.length() >= 5) {
                    semanticIntentDensity++;
                }
            }
        }
        if (semanticIntentDensity >= 3) {
            q.append(menuFlow
                ? " | focus: menu_schema trigger hierarchy parentid table_name type_form"
                : " | focus: business_logic flow side_effects risks");
        }

        q.append(" | context=").append(String.valueOf(contextType == null ? "" : contextType));
        q.append(" | task=").append(String.valueOf(taskType == null ? "" : taskType));
        q.append(" | mode=").append(String.valueOf(responseMode == null ? "" : responseMode));
        return trimTo(q.toString(), 380);
    }

    private String buildGuaranteedScopedFallbackQuery(
        String message,
        LocalToolDigest digest,
        String contextType,
        String taskType,
        String responseMode
    ) {
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim();
        String safeMode = String.valueOf(responseMode == null ? "" : responseMode).trim();
        boolean menuFlow = "menu_json".equalsIgnoreCase(safeContextType);

        StringBuilder out = new StringBuilder();
        if (!safeMessage.isBlank()) {
            out.append(trimTo(safeMessage, 160));
        }

        if (digest != null && digest.intentKeywords != null && !digest.intentKeywords.isEmpty()) {
            out.append(" intents ");
            int count = 0;
            for (String token : digest.intentKeywords) {
                String safeToken = String.valueOf(token == null ? "" : token).trim();
                if (safeToken.length() < 3) {
                    continue;
                }
                out.append(safeToken).append(' ');
                count++;
                if (count >= 6) {
                    break;
                }
            }
        }

        if (menuFlow && digest != null && digest.menuSignals != null && !digest.menuSignals.isEmpty()) {
            out.append(" menu ");
            int signalCount = 0;
            for (String signal : digest.menuSignals) {
                String safeSignal = String.valueOf(signal == null ? "" : signal).trim();
                if (safeSignal.length() < 3) {
                    continue;
                }
                out.append(safeSignal).append(' ');
                signalCount++;
                if (signalCount >= 8) {
                    break;
                }
            }
        } else if (digest != null && digest.codeSymbols != null && !digest.codeSymbols.isEmpty()) {
            out.append(" symbols ");
            int symbolCount = 0;
            for (String symbol : digest.codeSymbols) {
                String safeSymbol = String.valueOf(symbol == null ? "" : symbol).toLowerCase(Locale.ROOT);
                Matcher matcher = TOKEN_PATTERN.matcher(safeSymbol);
                while (matcher.find()) {
                    String token = String.valueOf(matcher.group(0) == null ? "" : matcher.group(0)).trim();
                    if (token.length() < 3) {
                        continue;
                    }
                    out.append(token).append(' ');
                    symbolCount++;
                    if (symbolCount >= 10) {
                        break;
                    }
                }
                if (symbolCount >= 10) {
                    break;
                }
            }
        }

        out.append(" context ")
            .append(safeContextType)
            .append(" task ")
            .append(safeTaskType)
            .append(" mode ")
            .append(safeMode)
            .append(menuFlow ? " menu schema trigger hierarchy analysis" : " business logic flow analysis");

        String normalized = trimTo(out.toString().replaceAll("\\s+", " ").trim(), 320);
        if (!normalized.isBlank()) {
            return normalized;
        }
        return "business logic flow analysis context code menu";
    }

    private List<String> deriveTargetedRetrievalQueries(String message, LocalToolDigest digest, String contextType) {
        LinkedHashSet<String> queries = new LinkedHashSet<>();
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();
        boolean menuFlow = "menu_json".equalsIgnoreCase(safeContextType);

        if (!safeMessage.isBlank()) {
            queries.add(trimTo(safeMessage, 160));
        }

        if (isBroadAnalyzeIntent(safeMessage, digest)) {
            queries.add("business logic main flow state transitions side effects risk hot spots");
            if ("menu_json".equalsIgnoreCase(safeContextType)) {
                queries.add("menu schema module table trigger relationship business rules");
            } else {
                queries.add("code architecture module boundaries data flow api calls mutation points");
            }
        }

        if (digest != null && digest.intentKeywords != null && !digest.intentKeywords.isEmpty()) {
            List<String> topIntents = new ArrayList<>();
            for (String keyword : digest.intentKeywords) {
                String safe = String.valueOf(keyword == null ? "" : keyword).trim();
                if (safe.length() >= 3) {
                    topIntents.add(safe);
                }
                if (topIntents.size() >= 6) {
                    break;
                }
            }
            if (!topIntents.isEmpty()) {
                queries.add(String.join(" ", topIntents) + " business logic data flow " + safeContextType);
            }
        }

        if (menuFlow && digest != null && digest.menuSignals != null && !digest.menuSignals.isEmpty()) {
            LinkedHashSet<String> menuTokens = new LinkedHashSet<>();
            for (String signal : digest.menuSignals) {
                String safe = String.valueOf(signal == null ? "" : signal).toLowerCase(Locale.ROOT);
                Matcher m = TOKEN_PATTERN.matcher(safe);
                while (m.find()) {
                    String token = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
                    if (token.length() >= 3) {
                        menuTokens.add(token);
                    }
                    if (menuTokens.size() >= 8) {
                        break;
                    }
                }
                if (menuTokens.size() >= 8) {
                    break;
                }
            }
            if (!menuTokens.isEmpty()) {
                queries.add(String.join(" ", menuTokens) + " menu trigger hierarchy parentid table_name type_form");
            }
        } else if (digest != null && digest.codeSymbols != null && !digest.codeSymbols.isEmpty()) {
            LinkedHashSet<String> symbolTokens = new LinkedHashSet<>();
            for (String symbol : digest.codeSymbols) {
                String safe = String.valueOf(symbol == null ? "" : symbol).toLowerCase(Locale.ROOT);
                Matcher m = TOKEN_PATTERN.matcher(safe);
                while (m.find()) {
                    String token = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
                    if (token.length() >= 3) {
                        symbolTokens.add(token);
                    }
                    if (symbolTokens.size() >= 8) {
                        break;
                    }
                }
                if (symbolTokens.size() >= 8) {
                    break;
                }
            }
            if (!symbolTokens.isEmpty()) {
                queries.add(String.join(" ", symbolTokens) + " implementation behavior side effects");
            }
        }

        List<String> out = new ArrayList<>();
        for (String q : queries) {
            String safe = trimTo(String.valueOf(q == null ? "" : q).trim(), 220);
            if (!safe.isBlank()) {
                out.add(safe);
            }
            if (out.size() >= 3) {
                break;
            }
        }
        return out;
    }

    private List<String> buildRetrievalFocusTargets(
        String message,
        String contextType,
        String taskType,
        List<Map<String, Object>> attachments,
        String appId,
        String currentCode,
        String pName,
        Integer pType
    ) {
        LinkedHashSet<String> targets = new LinkedHashSet<>();
        String safeMessage = String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT);
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        boolean menuFlow = "menu_json".equals(safeContextType) || safeTaskType.contains("menu");
        String safeAppId = str(appId);
        String menuSourceKind = resolveMenuFocusSourceKind(currentCode, attachments);
        String resolvedPName = resolveFocusTargetPName(pName, attachments);
        Integer resolvedPType = resolveFocusTargetPType(pType, attachments);

        if (menuFlow) {
            targets.add("menu_json");
            if (!safeAppId.isBlank()) {
                targets.add("app_id=" + truncateLine(safeAppId, 64));
            }
            targets.add(menuSourceKind);
        } else {
            targets.add("code_editor");
            if (!resolvedPName.isBlank()) {
                targets.add("p_name=" + truncateLine(resolvedPName, 96));
            }
            if (resolvedPType != null) {
                targets.add("p_type=" + resolvedPType);
            }
        }
        if (safeMessage.contains("lmkt")) {
            targets.add("lmkt");
        }
        if (attachments != null) {
            for (Map<String, Object> attachment : attachments) {
                if (attachment == null) {
                    continue;
                }
                String name = str(attachment.get("name")).toLowerCase(Locale.ROOT);
                if (!menuFlow && targets.size() == 1) {
                    String attachmentPName = resolveAttachmentFocusPName(attachment);
                    Integer attachmentPType = resolveAttachmentFocusPType(attachment);
                    if (!attachmentPName.isBlank()) {
                        targets.add("p_name=" + truncateLine(attachmentPName, 96));
                    }
                    if (attachmentPType != null) {
                        targets.add("p_type=" + attachmentPType);
                    }
                }
                if (name.contains("lmkt")) {
                    targets.add("lmkt");
                }
            }
        }
        return new ArrayList<>(targets);
    }

    private String resolveMenuFocusSourceKind(String currentCode, List<Map<String, Object>> attachments) {
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode).trim();
        if (!safeCode.isBlank()) {
            return "menu_string";
        }
        if (attachments != null) {
            for (Map<String, Object> attachment : attachments) {
                if (attachment == null || attachment.isEmpty()) {
                    continue;
                }
                String kind = str(attachment.get("kind")).toLowerCase(Locale.ROOT);
                String mimeType = str(attachment.get("mimeType")).toLowerCase(Locale.ROOT);
                String name = str(attachment.get("name")).toLowerCase(Locale.ROOT);
                if ("json".equals(kind) || mimeType.contains("json") || name.endsWith(".json") || name.endsWith(".jsonl")) {
                    return "menu_attachment_json";
                }
            }
        }
        return "menu_context";
    }

    private String resolveFocusTargetPName(String pName, List<Map<String, Object>> attachments) {
        String safePName = str(pName);
        if (!safePName.isBlank()) {
            return safePName;
        }
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        for (Map<String, Object> attachment : attachments) {
            String candidate = resolveAttachmentFocusPName(attachment);
            if (!candidate.isBlank()) {
                return candidate;
            }
        }
        return "";
    }

    private Integer resolveFocusTargetPType(Integer pType, List<Map<String, Object>> attachments) {
        if (pType != null) {
            return pType;
        }
        if (attachments == null || attachments.isEmpty()) {
            return null;
        }
        for (Map<String, Object> attachment : attachments) {
            Integer candidate = resolveAttachmentFocusPType(attachment);
            if (candidate != null) {
                return candidate;
            }
        }
        return null;
    }

    private String resolveAttachmentFocusPName(Map<String, Object> attachment) {
        if (attachment == null || attachment.isEmpty()) {
            return "";
        }
        for (String key : List.of("pName", "fileKey", "sourceKey", "targetName")) {
            String candidate = str(attachment.get(key));
            if (!candidate.isBlank()) {
                return candidate;
            }
        }
        return "";
    }

    private Integer resolveAttachmentFocusPType(Map<String, Object> attachment) {
        if (attachment == null || attachment.isEmpty()) {
            return null;
        }
        Object raw = attachment.get("pType");
        if (raw == null) {
            raw = attachment.get("targetType");
        }
        if (raw == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private List<String> truncateLines(List<String> lines, int limit, int maxLen) {
        List<String> out = new ArrayList<>();
        if (lines == null || lines.isEmpty()) {
            return out;
        }
        for (String line : lines) {
            String safe = truncateLine(line, maxLen);
            if (!safe.isBlank()) {
                out.add(safe);
            }
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private List<Map<String, Object>> summarizeSearchHits(
        List<AiBusinessMemoryVectorService.SearchHit> hits,
        int limit,
        String queryText,
        String appId,
        String contextType,
        String pName,
        Integer pType
    ) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (hits == null || hits.isEmpty()) {
            return out;
        }
        List<String> queryTokens = collectQueryTokensForHitSummary(queryText);
        for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
            if (hit == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            String sourceCategory = classifyHitSourceCategory(hit);
            row.put("source", buildReadableHitSourceLabel(hit, sourceCategory, appId, contextType, pName, pType));
            row.put("chunkId", truncateLine(hit.chunkId(), 48));
            row.put("summary", truncateLine(hit.summary(), 120));
            row.put("score", Math.round(hit.score() * 1000.0f) / 1000.0f);
            row.put("sourceCategory", sourceCategory);
            row.put("matchedTokens", collectMatchedHitTokens(hit, queryTokens, 3));
            row.put("recent", isRecentHit(hit));
            row.put("freshnessScore", Math.round(AiBusinessMemoryVectorService.computeFreshnessScore(hit.createdAtMs()) * 1000.0) / 1000.0);
            String excerptSource = !hit.content().isBlank() ? hit.content() : hit.summary();
            row.put("contentExcerpt", truncateLine(excerptSource, 220));
            out.add(row);
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private List<String> buildVirtualContextPreview(
        List<AiBusinessMemoryVectorService.SearchHit> hits,
        String queryText,
        String contextType,
        LocalToolDigest digest,
        String appId,
        String pName,
        Integer pType,
        List<String> focusTargets,
        List<String> targetedQueries,
        List<String> symbolQueries
    ) {
        LinkedHashSet<String> preview = new LinkedHashSet<>();

        List<String> safeFocusTargets = focusTargets == null ? List.of() : focusTargets;
        if (!safeFocusTargets.isEmpty()) {
            preview.add("focus=" + String.join(",", truncateLines(safeFocusTargets, 4, 42)));
        }

        if ("menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType))
            && digest != null
            && digest.menuSignals != null
            && !digest.menuSignals.isEmpty()) {
            preview.add("menu-signals=" + String.join(" | ", truncateLines(digest.menuSignals, 3, 54)));
        }

        if (symbolQueries != null && !symbolQueries.isEmpty()) {
            preview.add("symbol-probes=" + String.join(" | ", truncateLines(symbolQueries, 2, 64)));
        }

        if (targetedQueries != null && !targetedQueries.isEmpty()) {
            preview.add("targeted-probes=" + String.join(" | ", truncateLines(targetedQueries, 2, 64)));
        }

        List<Map<String, Object>> summarizedHits = summarizeSearchHits(hits, 2, queryText, appId, contextType, pName, pType);
        for (Map<String, Object> hit : summarizedHits) {
            String source = String.valueOf(hit.getOrDefault("source", "")).trim();
            String summary = String.valueOf(hit.getOrDefault("summary", "")).trim();
            if (!source.isBlank() || !summary.isBlank()) {
                preview.add("memory=" + truncateLine(source + (summary.isBlank() ? "" : " -> " + summary), 140));
            }
        }

        return List.copyOf(preview);
    }

    private String buildReadableHitSourceLabel(
        AiBusinessMemoryVectorService.SearchHit hit,
        String sourceCategory,
        String appId,
        String contextType,
        String pName,
        Integer pType
    ) {
        String rawSource = truncateLine(String.valueOf(hit == null || hit.sourceName() == null ? "" : hit.sourceName()).trim(), 96);
        String safeCategory = String.valueOf(sourceCategory == null ? "general" : sourceCategory).trim().toLowerCase(Locale.ROOT);
        String safeAppId = str(appId);
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String safePName = str(pName);

        if ("current_code".equals(safeCategory)
            || (rawSource.toLowerCase(Locale.ROOT).contains("dyn_ctx_currentcode"))
            || (rawSource.toLowerCase(Locale.ROOT).contains("dyn_ctx_orchestration") && "code".equals(safeContextType) && !safePName.isBlank())) {
            StringBuilder label = new StringBuilder("active_code");
            if (!safePName.isBlank()) {
                label.append(" p_name=").append(truncateLine(safePName, 64));
            }
            if (pType != null) {
                label.append(" p_type=").append(pType);
            }
            return truncateLine(label.toString(), 96);
        }

        if ("current_menu".equals(safeCategory)
            || "menu_context".equals(safeCategory)
            || rawSource.toLowerCase(Locale.ROOT).contains("dyn_ctx_currentmenu")
            || (rawSource.toLowerCase(Locale.ROOT).contains("dyn_ctx_orchestration") && "menu_json".equals(safeContextType))) {
            StringBuilder label = new StringBuilder("active_menu");
            if (!safeAppId.isBlank()) {
                label.append(" app_id=").append(truncateLine(safeAppId, 48));
            }
            return truncateLine(label.toString(), 96);
        }

        if ("attachment_context".equals(safeCategory)) {
            return rawSource.isBlank() ? "attachment_context" : rawSource;
        }
        if ("reference_docs".equals(safeCategory)) {
            return rawSource.isBlank() ? "reference_docs" : rawSource;
        }
        if ("workspace_module".equals(safeCategory)) {
            return rawSource.isBlank() ? "workspace_module" : rawSource;
        }
        if ("dynamic_context".equals(safeCategory)) {
            return "dynamic_context";
        }
        return rawSource.isBlank() ? "context_source" : rawSource;
    }

    private List<String> collectQueryTokensForHitSummary(String queryText) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(queryText == null ? "" : queryText).toLowerCase(Locale.ROOT));
        while (matcher.find() && out.size() < 10) {
            String token = String.valueOf(matcher.group(0) == null ? "" : matcher.group(0)).trim();
            if (token.length() >= 3) {
                out.add(token);
            }
        }
        return new ArrayList<>(out);
    }

    private List<String> collectMatchedHitTokens(AiBusinessMemoryVectorService.SearchHit hit, List<String> queryTokens, int limit) {
        List<String> out = new ArrayList<>();
        if (hit == null || queryTokens == null || queryTokens.isEmpty()) {
            return out;
        }
        String source = String.valueOf(hit.sourceName() == null ? "" : hit.sourceName()).toLowerCase(Locale.ROOT);
        String summary = String.valueOf(hit.summary() == null ? "" : hit.summary()).toLowerCase(Locale.ROOT);
        String content = String.valueOf(hit.content() == null ? "" : hit.content()).toLowerCase(Locale.ROOT);
        for (String token : queryTokens) {
            String safeToken = String.valueOf(token == null ? "" : token).trim().toLowerCase(Locale.ROOT);
            if (safeToken.length() < 3) {
                continue;
            }
            if (source.contains(safeToken) || summary.contains(safeToken) || content.contains(safeToken)) {
                out.add(safeToken);
            }
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private String classifyHitSourceCategory(AiBusinessMemoryVectorService.SearchHit hit) {
        String source = String.valueOf(hit == null || hit.sourceName() == null ? "" : hit.sourceName()).toLowerCase(Locale.ROOT);
        if (source.contains("dynamic_context") || source.contains("dyn_ctx")) {
            if (source.contains("currentcode") || source.contains("current_code")) {
                return "current_code";
            }
            if (source.contains("menu")) {
                return "current_menu";
            }
            return "dynamic_context";
        }
        if (source.contains("menu_json") || source.contains("menu_string") || source.contains("menu_attachment") || source.contains("menu")) {
            return "menu_context";
        }
        if (source.contains("attachment") || source.endsWith(".json") || source.endsWith(".jsonl") || source.endsWith(".md") || source.endsWith(".markdown")) {
            return "attachment_context";
        }
        if (source.startsWith("ai_") || source.contains("business") || source.contains("knowledge") || source.contains("system")) {
            return "reference_docs";
        }
        if (source.endsWith(".js") || source.endsWith(".ts") || source.endsWith(".tsx") || source.endsWith(".jsx") || source.endsWith(".vue")
            || source.contains("frontend") || source.contains("backend") || source.contains("lmkt")) {
            return "workspace_module";
        }
        return "general";
    }

    private boolean isRecentHit(AiBusinessMemoryVectorService.SearchHit hit) {
        if (hit == null || hit.createdAtMs() <= 0L) {
            return false;
        }
        long ageMs = Math.max(0L, System.currentTimeMillis() - hit.createdAtMs());
        return ageMs <= 60 * 60_000L;
    }

    private int countUniqueHitSources(List<AiBusinessMemoryVectorService.SearchHit> hits) {
        if (hits == null || hits.isEmpty()) {
            return 0;
        }
        LinkedHashSet<String> sources = new LinkedHashSet<>();
        for (AiBusinessMemoryVectorService.SearchHit hit : hits) {
            if (hit == null) {
                continue;
            }
            String source = String.valueOf(hit.sourceName() == null ? "" : hit.sourceName()).trim();
            if (!source.isBlank()) {
                sources.add(source);
            }
        }
        return sources.size();
    }

    private boolean isBroadAnalyzeIntent(String message, LocalToolDigest digest) {
        String safeMessage = String.valueOf(message == null ? "" : message).trim().toLowerCase(Locale.ROOT);
        if (safeMessage.isBlank() || digest == null) {
            return false;
        }

        LinkedHashSet<String> messageTokens = new LinkedHashSet<>();
        Matcher msgMatcher = TOKEN_PATTERN.matcher(safeMessage);
        while (msgMatcher.find() && messageTokens.size() < 32) {
            String token = String.valueOf(msgMatcher.group(0) == null ? "" : msgMatcher.group(0)).trim();
            if (token.length() >= 3) {
                messageTokens.add(token);
            }
        }
        if (messageTokens.isEmpty()) {
            return false;
        }

        LinkedHashSet<String> symbolTokens = new LinkedHashSet<>();
        if (digest.codeSymbols != null) {
            for (String symbol : digest.codeSymbols) {
                String safe = String.valueOf(symbol == null ? "" : symbol).toLowerCase(Locale.ROOT);
                Matcher symbolMatcher = TOKEN_PATTERN.matcher(safe);
                while (symbolMatcher.find() && symbolTokens.size() < 64) {
                    String token = String.valueOf(symbolMatcher.group(0) == null ? "" : symbolMatcher.group(0)).trim();
                    if (token.length() >= 3 && !isLowValueSymbolToken(token)) {
                        symbolTokens.add(token);
                    }
                }
                if (symbolTokens.size() >= 64) {
                    break;
                }
            }
        }

        int overlap = 0;
        for (String token : messageTokens) {
            if (symbolTokens.contains(token)) {
                overlap++;
                if (overlap >= 3) {
                    break;
                }
            }
        }

        int score = 0;
        if (!symbolTokens.isEmpty() && overlap == 0) {
            score += 2;
        }
        if (messageTokens.size() <= 14) {
            score += 1;
        }
        if (digest.intentKeywords != null && digest.intentKeywords.size() >= 3) {
            score += 1;
        }
        return score >= 3;
    }

    private List<String> extractAttachmentSearchHints(List<Map<String, Object>> attachments, int limit) {
        List<String> out = new ArrayList<>();
        if (attachments == null || attachments.isEmpty()) {
            return out;
        }
        LinkedHashSet<String> dedupe = new LinkedHashSet<>();
        for (Map<String, Object> item : attachments) {
            if (item == null) {
                continue;
            }
            String name = str(item.get("name")).toLowerCase(Locale.ROOT);
            String kind = str(item.get("kind")).toLowerCase(Locale.ROOT);
            String mime = str(item.get("mimeType")).toLowerCase(Locale.ROOT);
            String role = str(item.get("contextRole")).toLowerCase(Locale.ROOT);
            String summary = str(item.get("summary")).toLowerCase(Locale.ROOT);
            String text = str(item.get("textContent"));

            if (!name.isBlank()) {
                for (String token : name.split("[^a-z0-9_]+")) {
                    if (token.length() >= 3) {
                        dedupe.add(token);
                    }
                }
            }
            if (!kind.isBlank()) {
                dedupe.add(kind);
            }
            if (!role.isBlank()) {
                dedupe.add(role);
            }
            if (mime.contains("json") || "json".equals(kind) || name.endsWith(".json")) {
                dedupe.add("json_schema");
                String keys = extractJsonRootKeys(text, 10);
                if (!keys.isBlank()) {
                    for (String key : keys.toLowerCase(Locale.ROOT).split("[^a-z0-9_]+")) {
                        if (key.length() >= 3) {
                            dedupe.add(key);
                        }
                    }
                }
            }
            if (mime.startsWith("image/") || "image".equals(kind)) {
                dedupe.add("image_attachment");
                dedupe.add("ocr_context");
            }
            if (!summary.isBlank()) {
                Matcher m = TOKEN_PATTERN.matcher(summary);
                while (m.find()) {
                    String token = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
                    if (token.length() >= 3) {
                        dedupe.add(token);
                    }
                    if (dedupe.size() >= Math.max(4, limit * 2)) {
                        break;
                    }
                }
            }
            if (dedupe.size() >= Math.max(4, limit * 2)) {
                break;
            }
        }

        for (String token : dedupe) {
            if (token == null || token.isBlank()) {
                continue;
            }
            out.add(token);
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private String buildPrimaryFlowIngestionMarkdown(
        String contextType,
        String taskType,
        String message,
        String currentCode,
        LocalToolDigest digest,
        int maxChars
    ) {
        String code = String.valueOf(currentCode == null ? "" : currentCode).trim();
        if (code.isBlank()) {
            return "";
        }
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder();
        sb.append("source=primary_flow\n");
        sb.append("contextType=").append(ctx).append("\n");
        sb.append("taskType=").append(String.valueOf(taskType == null ? "" : taskType).trim()).append("\n");
        sb.append("request=\n").append(trimTo(String.valueOf(message == null ? "" : message).trim(), 600)).append("\n\n");

        if (digest != null && digest.intentKeywords != null && !digest.intentKeywords.isEmpty()) {
            sb.append("intentKeywords=\n");
            int i = 0;
            for (String token : digest.intentKeywords) {
                if (token == null || token.isBlank()) {
                    continue;
                }
                sb.append("- ").append(token.trim()).append("\n");
                i++;
                if (i >= 12) {
                    break;
                }
            }
            sb.append("\n");
        }

        if (digest != null && digest.codeSymbols != null && !digest.codeSymbols.isEmpty()) {
            sb.append("codeSymbols=\n");
            for (int i = 0; i < digest.codeSymbols.size() && i < 24; i++) {
                sb.append("- ").append(String.valueOf(digest.codeSymbols.get(i))).append("\n");
            }
            sb.append("\n");
        }

        // NOTE: Raw code snippet intentionally excluded from Lucene ingestion to prevent a
        // circular retrieval loop where current code is indexed → retrieved as RAG → injected
        // back into the prompt → weak local model echoes it verbatim instead of reasoning.
        // The full code is already present in the main prompt via ## CODE HIỆN TẠI section.
        // Only intent keywords + code symbols (function signatures) are indexed so that
        // semantic search finds the right docs without leaking raw source into LLM context.
        sb.append("codeChars=").append(code.length()).append("\n");
        if (primaryFlowLogicOutlineEnabled) {
            String logicOutline = buildPrimaryFlowLogicOutline(code);
            if (!logicOutline.isBlank()) {
                sb.append("logicOutline=\n").append(logicOutline).append("\n");
            }
        }
        sb.append("contextSummary=primary_flow_indexed_for_semantic_retrieval\n");

        return trimTo(sb.toString(), Math.max(1200, maxChars));
    }

    private String maybeBuildWebSearchRagBlock(
        String appId,
        String message,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        LocalToolDigest digest,
        int scopeMask,
        int internalRagChars,
        boolean retrievalQualityPassed,
        List<AiBusinessMemoryVectorService.SearchHit> retrievalHits,
        String requestId,
        OrchestrationResult out
    ) {
        if (!agenticWebSearchEnabled
            || !scopedRagEnabled
            || aiAgenticWebSearchService == null
            || !aiAgenticWebSearchService.isEnabled()
            || aiBusinessMemoryVectorService == null
            || !aiBusinessMemoryVectorService.isEnabled()) {
            return "";
        }
        int hitCount = retrievalHits == null ? 0 : retrievalHits.size();
        boolean lowInternalEvidence = !retrievalQualityPassed
            || internalRagChars < Math.max(400, agenticWebSearchMinInternalRagChars)
            || hitCount <= 0;
        String searchQuery = resolveAgenticWebSearchQuery(message, contextType, taskType, responseMode, language, digest, lowInternalEvidence);
        if (!lowInternalEvidence && searchQuery.isBlank()) {
            return "";
        }
        if (searchQuery.isBlank()) {
            out.toolStats.put("webSearchDecision", "skipped_no_query");
            return "";
        }

        AiAgenticWebSearchService.SearchExecution execution = aiAgenticWebSearchService.search(searchQuery);
        out.toolStats.put("webSearchDecision", execution.success() ? "executed" : "failed");
        out.toolStats.put("webSearchTriggered", true);
        out.toolStats.put("webSearchQuery", truncateLine(searchQuery, 160));
        out.toolStats.put("webSearchProvider", execution.provider());
        out.toolStats.put("webSearchResultCount", execution.pageCount());
        out.toolStats.put("webSearchVisitedUrls", truncateLines(execution.visitedUrls(), 3, 200));
        out.toolStats.put("webSearchFailureReason", truncateLine(execution.failureReason(), 180));
        if (!execution.success() || execution.markdown().isBlank()) {
            return "";
        }

        int webScopeMask = Math.max(1, scopeMask);
        List<String> webTags = new ArrayList<>();
        webTags.add("dynamic");
        webTags.add("web_search");
        webTags.add(contextType);
        webTags.add(taskType);
        webTags.addAll(AiMultimodalScannerService.scopeTagsFromMask(webScopeMask));
        String sourceSuffix = "web_search_" + System.currentTimeMillis();
        AiBusinessMemoryVectorService.IndexSummary webIndexSummary = aiBusinessMemoryVectorService.indexDynamicContext(
            appId,
            sourceSuffix,
            execution.markdown(),
            webTags,
            webScopeMask
        );
        out.toolStats.put("webSearchIndexSource", webIndexSummary == null ? "" : webIndexSummary.sourceName());
        out.toolStats.put("webSearchIndexedChunks", webIndexSummary == null ? 0 : webIndexSummary.chunksIndexed());
        out.toolStats.put("webSearchIndexedChars", execution.totalChars());
        out.toolStats.put("webSearchRequestId", truncateLine(requestId, 120));

        String rag = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
            appId,
            searchQuery,
            Math.max(2, Math.min(4, execution.pageCount())),
            webScopeMask,
            Math.max(1200, symbolAwareRetrievalMaxChars)
        );
        if (rag == null || rag.isBlank()) {
            return execution.markdown();
        }
        return rag;
    }

    private String resolveAgenticWebSearchQuery(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        LocalToolDigest digest,
        boolean lowInternalEvidence
    ) {
        String directive = extractSearchDirective(message);
        if (!directive.isBlank()) {
            return trimTo(directive, Math.max(48, agenticWebSearchQueryMaxChars));
        }
        if (!lowInternalEvidence && !looksLikeFreshKnowledgeNeed(message)) {
            return "";
        }
        String llmQuery = proposeSearchQueryWithLocalModel(message, contextType, taskType, responseMode, language, digest);
        if (!llmQuery.isBlank()) {
            return trimTo(llmQuery, Math.max(48, agenticWebSearchQueryMaxChars));
        }
        if (looksLikeFreshKnowledgeNeed(message)) {
            return trimTo(message, Math.max(48, agenticWebSearchQueryMaxChars));
        }
        return "";
    }

    private String extractSearchDirective(String text) {
        String safe = String.valueOf(text == null ? "" : text).trim();
        if (safe.isBlank()) {
            return "";
        }
        Matcher matcher = SEARCH_DIRECTIVE_PATTERN.matcher(safe);
        if (matcher.find()) {
            return String.valueOf(matcher.group(1) == null ? "" : matcher.group(1)).trim();
        }
        return "";
    }

    private boolean looksLikeFreshKnowledgeNeed(String message) {
        String safe = String.valueOf(message == null ? "" : message).trim();
        return !safe.isBlank() && FRESH_KNOWLEDGE_SIGNAL_PATTERN.matcher(safe).find();
    }

    private String proposeSearchQueryWithLocalModel(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        LocalToolDigest digest
    ) {
        if (llamaCppNativeService == null || !llamaCppNativeService.isHealthy()) {
            return "";
        }
        try {
            String prompt = "You are a search planner for a local AI system. "
                + "If the request needs up-to-date or external web knowledge, return exactly one line in the form [SEARCH_QUERY: keywords]. "
                + "If local knowledge should be enough, return NONE. "
                + "Do not explain.\n"
                + "contextType=" + String.valueOf(contextType == null ? "" : contextType).trim() + "\n"
                + "taskType=" + String.valueOf(taskType == null ? "" : taskType).trim() + "\n"
                + "responseMode=" + String.valueOf(responseMode == null ? "" : responseMode).trim() + "\n"
                + "language=" + String.valueOf(language == null ? "" : language).trim() + "\n"
                + "intentKeywords=" + String.join(", ", digest == null || digest.intentKeywords == null ? List.of() : digest.intentKeywords) + "\n"
                + "userRequest=" + trimTo(String.valueOf(message == null ? "" : message).trim(), 600);
            String raw = String.valueOf(
                llamaCppNativeService.generateContentFast(prompt, Math.max(32, agenticWebSearchLlamaMaxOutputTokens))
            ).trim();
            if (raw.equalsIgnoreCase("NONE")) {
                return "";
            }
            String directive = extractSearchDirective(raw);
            if (!directive.isBlank()) {
                return directive;
            }
        } catch (Exception ex) {
            log.debug("Agentic web search query planning failed: {}", ex.getMessage());
        }
        return "";
    }

    private String buildPrimaryFlowLogicOutline(String code) {
        String source = String.valueOf(code == null ? "" : code).trim();
        if (source.isBlank()) {
            return "";
        }
        if (source.length() > 280000) {
            source = source.substring(0, 280000);
        }

        LinkedHashSet<String> functionTokens = new LinkedHashSet<>();
        Matcher symbolMatcher = CODE_SYMBOL_PATTERN.matcher(source);
        while (symbolMatcher.find() && functionTokens.size() < Math.max(6, primaryFlowLogicOutlineMaxLines)) {
            String line = String.valueOf(symbolMatcher.group(0) == null ? "" : symbolMatcher.group(0)).trim();
            if (line.isBlank()) {
                continue;
            }
            Matcher tokenMatcher = TOKEN_PATTERN.matcher(line);
            while (tokenMatcher.find() && functionTokens.size() < Math.max(6, primaryFlowLogicOutlineMaxLines)) {
                String token = String.valueOf(tokenMatcher.group(0) == null ? "" : tokenMatcher.group(0)).trim();
                if (isLowValueSymbolToken(token)) {
                    continue;
                }
                functionTokens.add(token);
            }
        }

        LinkedHashSet<String> branchSignals = new LinkedHashSet<>();
        Matcher branchMatcher = BRANCH_SIGNAL_PATTERN.matcher(source);
        while (branchMatcher.find() && branchSignals.size() < 8) {
            String token = String.valueOf(branchMatcher.group(1) == null ? "" : branchMatcher.group(1)).trim().toLowerCase(Locale.ROOT);
            if (!token.isBlank()) {
                branchSignals.add(token);
            }
        }

        LinkedHashSet<String> sideEffects = new LinkedHashSet<>();
        Matcher sideEffectMatcher = SIDE_EFFECT_SIGNAL_PATTERN.matcher(source);
        while (sideEffectMatcher.find() && sideEffects.size() < 8) {
            String token = String.valueOf(sideEffectMatcher.group(1) == null ? "" : sideEffectMatcher.group(1)).trim();
            if (!token.isBlank()) {
                sideEffects.add(token);
            }
        }

        LinkedHashSet<String> stateSignals = new LinkedHashSet<>();
        Matcher stateMatcher = STATE_SIGNAL_PATTERN.matcher(source);
        while (stateMatcher.find() && stateSignals.size() < 8) {
            String token = String.valueOf(stateMatcher.group(1) == null ? "" : stateMatcher.group(1)).trim();
            if (!token.isBlank()) {
                stateSignals.add(token);
            }
        }

        StringBuilder sb = new StringBuilder();
        if (!functionTokens.isEmpty()) {
            sb.append("- mainSymbols: ").append(String.join(", ", functionTokens)).append("\n");
        }
        if (!branchSignals.isEmpty()) {
            sb.append("- branchSignals: ").append(String.join(", ", branchSignals)).append("\n");
        }
        if (!stateSignals.isEmpty()) {
            sb.append("- stateSignals: ").append(String.join(", ", stateSignals)).append("\n");
        }
        if (!sideEffects.isEmpty()) {
            sb.append("- sideEffects: ").append(String.join(", ", sideEffects)).append("\n");
        }
        return trimTo(sb.toString().trim(), 1800);
    }

    private boolean isLowValueSymbolToken(String token) {
        String safe = String.valueOf(token == null ? "" : token).trim().toLowerCase(Locale.ROOT);
        if (safe.length() < 3) {
            return true;
        }
        return safe.equals("public")
            || safe.equals("private")
            || safe.equals("protected")
            || safe.equals("static")
            || safe.equals("class")
            || safe.equals("interface")
            || safe.equals("enum")
            || safe.equals("record")
            || safe.equals("function")
            || safe.equals("void")
            || safe.equals("int")
            || safe.equals("long")
            || safe.equals("double")
            || safe.equals("float")
            || safe.equals("boolean")
            || safe.equals("string")
            || safe.equals("props")
            || safe.equals("state")
            || safe.equals("return");
    }

    private double getOffTopicConfidence(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        Set<String> intentKeywords,
        int attachmentChars
    ) {
        // If attachments present, assume on-topic (user providing explicit context)
        if (attachmentChars > 0) {
            return 0.0;
        }
        String m = String.valueOf(message == null ? "" : message).trim().toLowerCase(Locale.ROOT);
        if (m.isBlank()) {
            return 0.0;
        }
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        if (!"code".equals(ctx) && !"menu_json".equals(ctx)) {
            return 0.0;
        }

        // Domain keywords that indicate coding/menu task
        boolean looksLikeCodingTask = m.contains("code") || m.contains("bug") || m.contains("fix")
            || m.contains("json") || m.contains("menu") || m.contains("api")
            || m.contains("function") || m.contains("class") || m.contains("schema")
            || m.contains("refactor") || m.contains("patch") || m.contains("cursor")
            || m.contains("codemirror") || m.contains("sua") || m.contains("chinh")
            || m.contains("chỉnh") || m.contains("ham") || m.contains("hàm")
            || m.contains("table") || m.contains("trigger");
        if (looksLikeCodingTask) {
            return 0.0;
        }

        // Off-topic indicators (greetings, weather, sports, etc.)
        boolean obviousOffTopic = m.matches("^(hi|hello|hey|xin chao|xin chào|cam on|cảm ơn|thanks|thank you|ok|oke|bye|tạm biệt|tam biet)[!. ]*$")
            || m.contains("thời tiết") || m.contains("thoi tiet") || m.contains("weather")
            || m.contains("tỷ giá") || m.contains("ty gia") || m.contains("bitcoin")
            || m.contains("bóng đá") || m.contains("bong da") || m.contains("chứng khoán")
            || m.contains("chung khoan") || m.contains("joke") || m.contains("kể chuyện")
            || m.contains("ke chuyen") || m.contains("nhạc") || m.contains("music")
            || m.contains("phim") || m.contains("movie") || m.contains("du lịch") || m.contains("du lich");
        if (!obviousOffTopic) {
            return 0.0;
        }

        // Scoring: obvious off-topic + low intent keywords + valid context/mode
        double confidence = 0.7; // Base score for obvious off-topic keyword
        
        int intents = intentKeywords == null ? 0 : intentKeywords.size();
        if (intents <= 3) {
            confidence += 0.15; // Very low intent keywords
        } else if (intents <= 8) {
            confidence += 0.05; // Low-medium intent keywords
        } else {
            return 0.0; // Too many intent keywords, likely legitimate
        }
        
        String mode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        if ("analyze".equals(mode) || "edit".equals(mode) || task.contains("code") || task.contains("menu")) {
            confidence += 0.1; // Response mode/task type consistent
        }
        
        return Math.min(1.0, confidence);
    }

    private String buildOffTopicFastResponse(String contextType) {
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        if ("menu_json".equals(ctx)) {
            return "[STRICT MODE] Yeu cau nay khong nam trong pham vi thiet ke menu/code hien tai (high confidence off-topic). Vui long gui ro thao tac menu can lam (them/sua/xoa module, bang, trigger, field) de toi xu ly nhanh local theo tung buoc.";
        }
        return "[STRICT MODE] Yeu cau nay khong nam trong pham vi ho tro code/menu cua editor hien tai (high confidence off-topic). Vui long gui ro task code can lam (analyze/fix/refactor/generate patch) de toi xu ly local va stream tung buoc len CodeMirror.";
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private int toInt(Object raw) {
        if (raw instanceof Number n) {
            return Math.max(0, n.intValue());
        }
        try {
            return Math.max(0, Integer.parseInt(String.valueOf(raw == null ? "0" : raw).trim()));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private boolean toBool(Object raw) {
        if (raw instanceof Boolean b) {
            return b;
        }
        String text = String.valueOf(raw == null ? "" : raw).trim().toLowerCase(Locale.ROOT);
        return "1".equals(text) || "true".equals(text) || "yes".equals(text) || "y".equals(text);
    }

    private static class LocalToolDigest {
        final Set<String> intentKeywords = new LinkedHashSet<>();
        final List<String> codeSymbols = new ArrayList<>();
        final List<String> menuSignals = new ArrayList<>();
        final List<String> attachmentItems = new ArrayList<>();
        final Map<String, Object> stats = new LinkedHashMap<>();
    }

    private static class AttachmentDigest {
        final List<String> items = new ArrayList<>();
        final Map<String, Object> stats = new LinkedHashMap<>();
    }

    /**
     * OpenDevin AgentFinishAction pattern: detect whether the user message is a
     * simple statistics / count query that speculative execution can fully answer
     * without needing a full LLM round-trip.
     */
    private boolean isSimpleStatsQuery(String message) {
        String m = message.toLowerCase(Locale.ROOT);
        return m.contains("thống kê") || m.contains("thong ke")
            || m.contains("bao nhiêu") || m.contains("bao nhieu")
            || m.contains("có bao nhiêu") || m.contains("co bao nhieu")
            || m.contains("tổng số") || m.contains("tong so")
            || m.contains("đếm") || m.contains("dem ")
            || m.contains("count") || m.contains("how many")
            || m.contains("summary") || m.contains("tóm tắt")
            || m.contains("tom tat");
    }

    private boolean isBroadAnalysisRequest(String message) {
        String m = String.valueOf(message == null ? "" : message).trim().toLowerCase(Locale.ROOT);
        if (m.isBlank()) {
            return false;
        }
        boolean asksAnalyze = m.contains("phân tích") || m.contains("phan tich") || m.contains("analyze");
        boolean asksWholeScope = m.contains("toàn bộ") || m.contains("toan bo")
            || m.contains("nghiệp vụ") || m.contains("nghiep vu")
            || m.contains("business logic") || m.contains("luồng") || m.contains("luong")
            || m.contains("hệ thống") || m.contains("he thong");
        return asksAnalyze && asksWholeScope;
    }

    private boolean isEarlyFinishEligible(String message, String responseMode, String contextType) {
        String mode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        if (!isSimpleStatsQuery(message)) {
            return false;
        }
        // Never short-circuit broad analysis requests; they require full reasoning pass.
        if (isBroadAnalysisRequest(message)) {
            return false;
        }
        // For menu/code editing flows, keep full pipeline unless this is clearly stats-only.
        if ("edit".equals(mode)) {
            return false;
        }
        if ("menu_json".equals(ctx) && "analyze".equals(mode)) {
            return false;
        }
        return true;
    }

    /**
     * Builds a plain-language early-finish response from speculative execution data.
     * Returns blank if the data is not rich enough to stand alone.
     */
    private String buildEarlyFinishFromSpeculative(String operation, Map<String, Object> data) {
        if (data == null || data.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        if ("json_stats".equals(operation)) {
            int total = toInt(data.get("totalTopLevelKeys")) + toInt(data.get("totalArrayElements"));
            if (total == 0 && data.containsKey("fileCount")) {
                total = toInt(data.get("fileCount"));
            }
            if (!data.isEmpty()) {
                sb.append("**Kết quả phân tích cục bộ (không cần gọi AI):**\n");
                for (Map.Entry<String, Object> e : data.entrySet()) {
                    sb.append("- ").append(e.getKey()).append(": ").append(e.getValue()).append("\n");
                }
                sb.append("\n_[earlyFinish=json_stats — đã phân tích tại máy chủ, tiết kiệm token]_");
            }
        } else if ("code_profile".equals(operation)) {
            if (!data.isEmpty()) {
                sb.append("**Kết quả phân tích code cục bộ:**\n");
                for (Map.Entry<String, Object> e : data.entrySet()) {
                    sb.append("- ").append(e.getKey()).append(": ").append(e.getValue()).append("\n");
                }
                sb.append("\n_[earlyFinish=code_profile — đã phân tích tại máy chủ, tiết kiệm token]_");
            }
        }
        return sb.toString().trim();
    }

    private boolean isSurfaceRemediationContext(String contextType) {
        String configured = String.valueOf(surfaceRemediationContextTypes == null ? "" : surfaceRemediationContextTypes)
            .trim()
            .toLowerCase(Locale.ROOT);
        if (configured.isBlank() || "*".equals(configured)) {
            return true;
        }
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        for (String raw : configured.split("[,;\\s]+")) {
            if (ctx.equals(String.valueOf(raw).trim())) {
                return true;
            }
        }
        return false;
    }

    private String buildEditorSurfaceEvidenceAnchor(String contextType, String surfaceContent, String userMessage) {
        String surface = String.valueOf(surfaceContent == null ? "" : surfaceContent).trim();
        if (surface.isBlank()) {
            return "";
        }
        boolean menu = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());
        StringBuilder sb = new StringBuilder();
        sb.append(menu ? "## CURRENT_MENU_EVIDENCE (authoritative surface)\n"
            : "## CURRENT_CODE_EVIDENCE (authoritative surface)\n");
        sb.append("Supplemental evidence because scoped retrieval was thin. Reason from this surface + plan.\n\n");
        sb.append(truncateMiddle(surface, Math.max(2000, scopedRagMaxChars)));
        String focus = truncateLine(String.valueOf(userMessage == null ? "" : userMessage), 420);
        if (!focus.isBlank()) {
            sb.append("\n\n## TASK_FOCUS\n").append(focus);
        }
        return sb.toString().trim();
    }

    /**
     * PHẦN AC — index sample menu/code attachments into Lucene when editor surface is empty (greenfield).
     */
    private void ingestSampleAttachmentsWhenEditorEmpty(
        String appId,
        List<Map<String, Object>> attachments,
        String contextType,
        int scopeMask,
        String requestId,
        OrchestrationResult out
    ) {
        if (aiScopedContextIngestionService == null || attachments == null || attachments.isEmpty()) {
            return;
        }
        int ingested = 0;
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null || attachment.isEmpty()) {
                continue;
            }
            String role = str(attachment.get("contextRole")).toLowerCase(Locale.ROOT);
            boolean authoritative = Boolean.TRUE.equals(attachment.get("authoritative"));
            boolean sampleRole = "legacy_json".equals(role)
                || "reference_code".equals(role)
                || "business_logic".equals(role)
                || "system_requirement".equals(role);
            if (!sampleRole && !authoritative) {
                continue;
            }
            String body = str(attachment.get("textContent"));
            if (body.isBlank()) {
                body = str(attachment.get("content"));
            }
            if (body.isBlank()) {
                continue;
            }
            try {
                boolean menuSample = "menu_json".equalsIgnoreCase(contextType)
                    || "legacy_json".equals(role)
                    || str(attachment.get("kind")).equalsIgnoreCase("json");
                AiScopedContextIngestionService.IngestionResult result;
                if (menuSample) {
                    result = aiScopedContextIngestionService.ingestMenu(
                        appId, body, scopeMask | AiScopedContextIngestionService.SCOPE_MENU, false, requestId);
                } else {
                    result = aiScopedContextIngestionService.ingestCode(
                        appId, body, scopeMask | AiScopedContextIngestionService.SCOPE_CODE, false, requestId);
                }
                if (result != null && result.chunksIngested > 0) {
                    ingested++;
                }
            } catch (Exception ex) {
                log.debug("Sample attachment ingest skipped: {}", ex.getMessage());
            }
        }
        if (ingested > 0) {
            out.toolStats.put("sampleAttachmentIngestCount", ingested);
            out.toolStats.put("sampleAttachmentIngestStatus", "completed");
        }
    }
}
