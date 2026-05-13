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

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-zA-Z0-9_\\-]{3,}");
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

    @Value("${ai.orchestration.multimodal.scope-rag.max-chars:5000}")
    private int scopedRagMaxChars;

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
                .language(language);
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

            Builder appId(String value) { this.appId = String.valueOf(value == null ? "" : value); return this; }
            Builder message(String value) { this.message = String.valueOf(value == null ? "" : value); return this; }
            Builder currentCode(String value) { this.currentCode = String.valueOf(value == null ? "" : value); return this; }
            Builder attachments(List<Map<String, Object>> value) { this.attachments = value == null ? List.of() : value; return this; }
            Builder contextType(String value) { this.contextType = String.valueOf(value == null ? "code" : value); return this; }
            Builder taskType(String value) { this.taskType = String.valueOf(value == null ? "" : value); return this; }
            Builder responseMode(String value) { this.responseMode = String.valueOf(value == null ? "edit" : value); return this; }
            Builder language(String value) { this.language = String.valueOf(value == null ? "" : value); return this; }

            OrchestrationRequest build() {
                return new OrchestrationRequest(this);
            }
        }
    }

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
        return orchestrate(appId, message, currentCode, attachments, contextType, taskType, responseMode, language, null);
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
                requestId
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
                ex,
                retryDecision
            );
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
                requestId
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
        String requestId
    ) {
        if (!enabled) {
            return OrchestrationResult.disabled();
        }

        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;
        String safeContextType = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);
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

        int messageChars = safeMessage.length();
        int codeChars = safeCode.length();
        int attachmentChars = estimateAttachmentTextChars(safeAttachments);
        out.totalCharsBefore = messageChars + codeChars + attachmentChars;

        LocalToolDigest digest = runLocalTools(safeMessage, safeCode, safeAttachments);
        out.toolStats.putAll(digest.stats);

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

        List<String> planSteps = buildPlannerSteps(
            safeContextType,
            safeTaskType,
            safeMode,
            codeChars,
            attachmentChars,
            digest,
            scanResult,
            offTopicConfidence,
            flowDecision
        );
        if (scanResult.enabled() && scanResult.ingestCount() > 0) {
            planSteps.add(0, "Run multimodal scanner (JSON/Image) and select dynamic memory ingestion candidates");
        }
        if (aiExecutionPlannerService != null) {
            try {
                String workspaceContext = "menu_json".equals(safeContextType) ? "menu" : "code";
                AiExecutionPlannerService.ExecutionPlan executionPlan = aiExecutionPlannerService.generatePlan(
                    safeMessage,
                    workspaceContext,
                    safeCode,
                    ""
                );
                if (executionPlan != null && executionPlan.steps != null && !executionPlan.steps.isEmpty()) {
                    planSteps = executionPlan.steps.stream()
                        .map(step -> "[" + step.action + "] " + step.description)
                        .toList();
                    out.toolStats.put("executionPlanStepCount", executionPlan.getStepCount());
                    out.toolStats.put("executionPlanEstimatedMs", executionPlan.totalEstimatedMs);
                    out.toolStats.put("executionPlanDeduped", executionPlan.deduplicationCount);
                }
            } catch (Exception ignored) {
                // Keep base planner when execution planner fails.
            }
        }

        RecoveryHints recoveryHints = recoveryHintsContext.get();
        Integer stepVerifierMinScoreOverride = recoveryHints == null ? null : recoveryHints.stepVerifierMinScoreOverride;
        Integer planSchemaMinScoreOverride = recoveryHints == null ? null : recoveryHints.planSchemaMinScoreOverride;

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
        }
        out.toolStats.put("planVerifierEnabled", stepVerifierEnabled);
        out.toolStats.put("planVerifierScore", planCoverage.score);
        out.toolStats.put("planVerifierMinScore", planCoverage.minScore);
        out.toolStats.put("planVerifierPassed", planCoverage.passed);
        out.toolStats.put("planVerifierVerdict", planCoverage.verdict);
        out.toolStats.put("planVerifierMissing", planCoverage.missingAreas);

        List<Map<String, Object>> structuredPlanSteps = buildStructuredPlanSteps(planSteps);
        PlanSchemaCheck schemaCheck = evaluatePlanSchema(structuredPlanSteps, planSchemaMinScoreOverride);
        if (planSchemaEnabled && !schemaCheck.passed && !schemaCheck.missingSignals.isEmpty()) {
            planSteps.add("Schema remediation: " + String.join("; ", schemaCheck.missingSignals));
            structuredPlanSteps = buildStructuredPlanSteps(planSteps);
            schemaCheck = evaluatePlanSchema(structuredPlanSteps, planSchemaMinScoreOverride);
        }
        out.toolStats.put("planSchemaEnabled", planSchemaEnabled);
        out.toolStats.put("planSchemaScore", schemaCheck.score);
        out.toolStats.put("planSchemaMinScore", schemaCheck.minScore);
        out.toolStats.put("planSchemaPassed", schemaCheck.passed);
        out.toolStats.put("planSchemaInvalidCount", schemaCheck.invalidCount);
        out.toolStats.put("planSchemaMissing", schemaCheck.missingSignals);
        out.toolStats.put("planStructuredSteps", structuredPlanSteps);

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
        int baselineScopeMask = defaultScopeMaskForContext(safeContextType, safeTaskType);
        int aggregateScopeMask = scanResult.enabled() ? Math.max(0, scanResult.aggregateScopeMask()) : 0;
        if (aiScopedContextIngestionService != null) {
            try {
                AiScopedContextIngestionService.ScopeMaskAnalysis scopeAnalysis = aiScopedContextIngestionService.analyzeScopesFromAttachments(
                    safeMessage,
                    safeAttachments,
                    !safeCode.isBlank(),
                    "menu_json".equals(safeContextType) && !safeCode.isBlank()
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

                if ("menu_json".equals(safeContextType) && !safeCode.isBlank() && (aggregateScopeMask & AiScopedContextIngestionService.SCOPE_MENU) != 0) {
                    AiScopedContextIngestionService.IngestionResult menuIngestion = aiScopedContextIngestionService.ingestMenu(
                        appId,
                        safeCode,
                        aggregateScopeMask,
                        true,
                        effectiveRequestId
                    );
                    out.toolStats.put("scopedMenuIngestionStatus", menuIngestion.status);
                    out.toolStats.put("scopedMenuIngestionChunks", menuIngestion.chunksIngested);
                }
                if (!"menu_json".equals(safeContextType) && !safeCode.isBlank() && (aggregateScopeMask & AiScopedContextIngestionService.SCOPE_CODE) != 0) {
                    AiScopedContextIngestionService.IngestionResult codeIngestion = aiScopedContextIngestionService.ingestCode(
                        appId,
                        safeCode,
                        aggregateScopeMask,
                        true,
                        effectiveRequestId
                    );
                    out.toolStats.put("scopedCodeIngestionStatus", codeIngestion.status);
                    out.toolStats.put("scopedCodeIngestionChunks", codeIngestion.chunksIngested);
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

        if (dynamicIngestEnabled
            && aiBusinessMemoryVectorService != null
            && aiBusinessMemoryVectorService.isEnabled()) {
            String mergedIngestion = "";
            if (!scanIngestionMarkdown.isBlank()) {
                mergedIngestion = scanIngestionMarkdown;
            }
            if (!primaryFlowMarkdown.isBlank()) {
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
                if (!primaryFlowMarkdown.isBlank()) {
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
            }
        }

        String scopedRagBlock = "";
        if (scanResult.enabled()
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
            StringBuilder symbolRagBlock = new StringBuilder();
            if (symbolAwareRetrievalEnabled && !digest.codeSymbols.isEmpty()) {
                List<String> symbolQueries = buildSymbolAwareQueries(digest.codeSymbols, maxCodeSymbols / 2);
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
            if (typeAwareInjectionEnabled && !safeCode.isBlank()) {
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
            if (!targetedQueries.isEmpty()) {
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
            out.toolStats.put("scopedRagEnabled", true);
            out.toolStats.put("scopedRagScopeMask", retrievalPlan.scopeMask);
            out.toolStats.put("scopedRagTopK", retrievalPlan.topK);
            out.toolStats.put("scopedRagMaxChars", retrievalPlan.maxChars);
            out.toolStats.put("scopedRagAdaptive", retrievalPlan.adaptive);
            out.toolStats.put("scopedRagAdaptiveReasons", retrievalPlan.reasons);
            out.toolStats.put("scopedRagChars", scopedRagBlock.length());
            out.toolStats.put("scopedRagQuery", truncateLine(retrievalPlan.query, 180));
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

        LocalToolDigest digest = runLocalTools(safeMessage, safeCode, safeAttachments);
        out.toolStats.put("requestId", requestId);
        out.toolStats.put("degradedMode", true);
        out.toolStats.put("degradedReason", truncateLine(String.valueOf(error == null ? "unknown" : error.getMessage()), 180));
        out.toolStats.put("routingTier", out.routingTier);
        out.toolStats.put("preferredModelHint", out.preferredModelHint);
        out.toolStats.putAll(digest.stats);
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

    private LocalToolDigest runLocalTools(String message, String code, List<Map<String, Object>> attachments) {
        LocalToolDigest digest = new LocalToolDigest();

        Set<String> intents = extractIntentKeywords(message, Math.max(4, maxIntents));
        digest.intentKeywords.addAll(intents);
        digest.stats.put("intentKeywords", intents.size());

        List<String> codeSymbols = extractCodeSymbols(code, Math.max(10, maxCodeSymbols));
        digest.codeSymbols.addAll(codeSymbols);
        digest.stats.put("codeSymbols", codeSymbols.size());

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
        if (!digest.codeSymbols.isEmpty()) {
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
            attachments,
            safeContextType,
            safeTaskType,
            safeMode
        );

        int scopeMask = Math.max(1, aggregateScopeMask);
        // Use policy-decided topK if provided (policyTopK > 0); otherwise fall back to default
        int topK = policyTopK > 0 ? policyTopK : Math.max(2, scopedRagTopK);
        int maxChars = Math.max(1600, scopedRagMaxChars);
        List<String> reasons = new ArrayList<>();
        if (policyTopK > 0) {
            reasons.add("policy_engine_adaptive_topk");
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
            topK += 1;
            maxChars += 800;
            reasons.add("menu_context_boost");
        }

        if (retrievalProfile.topKBoost() > 0 || retrievalProfile.maxCharsBoost() > 0) {
            topK += retrievalProfile.topKBoost();
            maxChars += retrievalProfile.maxCharsBoost();
            reasons.add("abstract_factory_profile_boost");
        }

        if ("analyze".equals(safeMode)) {
            topK += 1;
            maxChars += 600;
            reasons.add("analyze_mode_context_boost");
        }

        if (codeChars > 80000) {
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
        maxChars = Math.max(Math.max(1200, adaptiveScopeRagMinMaxChars), Math.min(Math.max(adaptiveScopeRagMinMaxChars, adaptiveScopeRagMaxMaxChars), maxChars));

        return new AdaptiveRetrievalPlan(scopeMask, topK, maxChars, query, true, reasons);
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

    /**
     * Build symbol-aware retrieval queries from code symbols.
     * Extracts function/class names and derives targeted search queries.
     * Format: "symbolName implementation behavior" or "symbolName usage"
     */
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

    private int defaultScopeMaskForContext(String contextType, String taskType) {
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        int mask = AiMultimodalScannerService.SCOPE_BUSINESS;
        if ("menu_json".equals(ctx) || task.contains("menu")) {
            mask |= AiMultimodalScannerService.SCOPE_MENU;
            mask |= AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
        } else {
            mask |= AiMultimodalScannerService.SCOPE_CODE;
        }
        return mask;
    }

    private String buildSelfDirectedRetrievalQuery(
        String message,
        Set<String> intentKeywords,
        List<String> codeSymbols,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode
    ) {
        StringBuilder q = new StringBuilder();
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
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

        if (codeSymbols != null && !codeSymbols.isEmpty()) {
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
            q.append(" | focus: business_logic flow side_effects risks");
        }

        q.append(" | context=").append(String.valueOf(contextType == null ? "" : contextType));
        q.append(" | task=").append(String.valueOf(taskType == null ? "" : taskType));
        q.append(" | mode=").append(String.valueOf(responseMode == null ? "" : responseMode));
        return trimTo(q.toString(), 380);
    }

    private List<String> deriveTargetedRetrievalQueries(String message, LocalToolDigest digest, String contextType) {
        LinkedHashSet<String> queries = new LinkedHashSet<>();
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();

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

        if (digest != null && digest.codeSymbols != null && !digest.codeSymbols.isEmpty()) {
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
}
