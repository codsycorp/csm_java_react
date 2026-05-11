package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiSpeculativeExecutionService aiSpeculativeExecutionService;
    private final AiMultimodalScannerService aiMultimodalScannerService;
    private final AiBusinessMemoryVectorService aiBusinessMemoryVectorService;

    public AiLocalOrchestrationService(
        AiSpeculativeExecutionService aiSpeculativeExecutionService,
        @Autowired(required = false) AiMultimodalScannerService aiMultimodalScannerService,
        @Autowired(required = false) AiBusinessMemoryVectorService aiBusinessMemoryVectorService
    ) {
        this.aiSpeculativeExecutionService = aiSpeculativeExecutionService;
        this.aiMultimodalScannerService = aiMultimodalScannerService;
        this.aiBusinessMemoryVectorService = aiBusinessMemoryVectorService;
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

    @Value("${ai.orchestration.fast-unrelated.enabled:true}")
    private boolean fastUnrelatedEnabled;

    @Value("${ai.orchestration.fast-unrelated.confidence-threshold:0.85}")
    private double fastUnrelatedConfidenceThreshold;

    private final ExecutorService dynamicIngestExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ai-dynamic-ingest");
        t.setDaemon(true);
        return t;
    });

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

        OrchestrationResult out = new OrchestrationResult();
        out.enabled = true;

        int messageChars = safeMessage.length();
        int codeChars = safeCode.length();
        int attachmentChars = estimateAttachmentTextChars(safeAttachments);
        out.totalCharsBefore = messageChars + codeChars + attachmentChars;

        LocalToolDigest digest = runLocalTools(safeMessage, safeCode, safeAttachments);
        out.toolStats.putAll(digest.stats);

        double offTopicConfidence = getOffTopicConfidence(safeMessage, safeContextType, safeTaskType, safeMode, digest.intentKeywords, attachmentChars);
        if (fastUnrelatedEnabled && offTopicConfidence > fastUnrelatedConfidenceThreshold) {
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
            out.toolStats.put("earlyFinishSource", "offtopic_fast_reply");
            out.toolStats.put("offTopicConfidence", offTopicConfidence);
            out.toolStats.put("confThreshold", fastUnrelatedConfidenceThreshold);
            out.toolStats.put("routingTier", out.routingTier);
            out.toolStats.put("preferredModelHint", out.preferredModelHint);
            return out;
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

        List<String> planSteps = buildPlannerSteps(safeContextType, safeTaskType, safeMode, codeChars, attachmentChars);
        if (scanResult.enabled() && scanResult.ingestCount() > 0) {
            planSteps.add(0, "Run multimodal scanner (JSON/Image) and select dynamic memory ingestion candidates");
        }
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
            String retrievalQuery = buildSelfDirectedRetrievalQuery(
                safeMessage,
                digest.intentKeywords,
                safeContextType,
                safeTaskType,
                safeMode);
            scopedRagBlock = aiBusinessMemoryVectorService.buildRagBlockWithScopes(
                appId,
                retrievalQuery,
                Math.max(2, scopedRagTopK),
                aggregateScopeMask,
                Math.max(1600, scopedRagMaxChars)
            );
            out.toolStats.put("scopedRagEnabled", true);
            out.toolStats.put("scopedRagScopeMask", aggregateScopeMask);
            out.toolStats.put("scopedRagChars", scopedRagBlock.length());
            out.toolStats.put("scopedRagQuery", truncateLine(retrievalQuery, 180));
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
                && isSimpleStatsQuery(safeMessage)) {
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

        String trimmed = truncateMiddle(combined, Math.max(4000, maxContextChars));
        out.compressedContextBlock = trimmed;
        out.totalCharsAfter = trimmed.length();
        out.savedChars = Math.max(0, out.totalCharsBefore - out.totalCharsAfter);
        out.toolStats.put("estimatedTokensBefore", estimateTokens(out.totalCharsBefore));
        out.toolStats.put("estimatedTokensAfter", estimateTokens(out.totalCharsAfter));
        out.toolStats.put("estimatedTokenSavings", Math.max(0, estimateTokens(out.totalCharsBefore) - estimateTokens(out.totalCharsAfter)));

        return out;
    }

    private List<String> buildPlannerSteps(
        String contextType,
        String taskType,
        String responseMode,
        int codeChars,
        int attachmentChars
    ) {
        List<String> steps = new ArrayList<>();
        steps.add("Plan request scope and choose low-cost local tools first");
        if (codeChars > 0) {
            steps.add("Run local code symbol scan to avoid sending full source blindly");
        }
        if (attachmentChars > 0) {
            steps.add("Run local attachment digest and JSON key extraction");
        }
        steps.add("Assemble tiered context (metadata -> relevant -> runtime output)");
        if ("menu_json".equals(contextType) || taskType.contains("menu")) {
            steps.add("Prioritize schema/table/trigger signals for menu grounding");
        }
        if ("analyze".equals(responseMode)) {
            steps.add("Favor explanation output and keep code payload minimal");
        }
        steps.add("Apply routing matrix hint for model selection (planner/balanced/complex)");
        return steps;
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
        String contextType,
        String taskType,
        String responseMode
    ) {
        StringBuilder q = new StringBuilder();
        q.append(String.valueOf(message == null ? "" : message).trim());
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
        q.append(" | context=").append(String.valueOf(contextType == null ? "" : contextType));
        q.append(" | task=").append(String.valueOf(taskType == null ? "" : taskType));
        q.append(" | mode=").append(String.valueOf(responseMode == null ? "" : responseMode));
        return trimTo(q.toString(), 380);
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

        String snippet;
        if ("menu_json".equals(ctx)) {
            snippet = trimTo(code, Math.max(1600, maxChars / 2));
            sb.append("menuJsonSnippet=\n```json\n").append(snippet).append("\n```\n");
        } else {
            snippet = truncateMiddle(code, Math.max(1800, maxChars / 2));
            sb.append("codeSnippet=\n```")
                .append("\n")
                .append(snippet)
                .append("\n```\n");
        }
        return trimTo(sb.toString(), Math.max(1200, maxChars));
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
            || m.contains("tom tat") || m.contains("analyze") || m.contains("phân tích")
            || m.contains("phan tich");
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
